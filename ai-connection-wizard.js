#!/usr/bin/env node

/**
 * AI Connection Wizard for Redstring
 * 
 * This wizard automates the entire process of connecting Redstring to AI services:
 * - Detects available AI clients (Claude Desktop, Tome, etc.)
 * - Sets up MCP servers
 * - Configures bridges
 * - Validates connections
 * - Provides status monitoring
 */

import { spawn } from 'child_process';
import { createServer, get } from 'http';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class AIConnectionWizard {
  constructor() {
    this.processes = new Map();
    this.status = {
      bridge: false,
      mcpServer: false,
      redstring: false,
      aiClient: null
    };
    this.config = {
      redstringPort: 4000,
      bridgePort: 3001,
      mcpServerPath: join(__dirname, 'redstring-mcp-server.js')
    };
  }

  async start() {
    console.log('🤖 AI Connection Wizard for Redstring');
    console.log('=====================================\n');

    try {
      // Step 1: Check if Redstring is running
      await this.checkRedstringStatus();
      
      // Step 2: Start bridge server
      await this.startBridgeServer();
      
      // Step 3: Start MCP server
      await this.startMCPServer();
      
      // Step 4: Detect AI clients
      await this.detectAIClients();
      
      // Step 5: Provide connection instructions
      await this.provideInstructions();
      
      // Step 6: Start monitoring
      this.startMonitoring();
      
    } catch (error) {
      console.error('❌ Wizard failed:', error.message);
      this.cleanup();
      process.exit(1);
    }
  }

  async checkRedstringStatus() {
    console.log('🔍 Checking Redstring status...');
    
    return new Promise((resolve, reject) => {
      get(`http://localhost:${this.config.redstringPort}`, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Redstring is running on localhost:4000');
          this.status.redstring = true;
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      }).on('error', (error) => {
        console.log('⚠️  Redstring not detected on localhost:4000');
        console.log('   Please start Redstring first: npm run dev');
        console.log('   Then run this wizard again.\n');
        reject(new Error('Redstring not running'));
      });
    });
  }

  async startBridgeServer() {
    console.log('🌉 Starting bridge server...');
    
    // First check if bridge is already running
    return new Promise((resolve, reject) => {
      get(`http://localhost:${this.config.bridgePort}/api/bridge/state`, (res) => {
        console.log('✅ Bridge server already running on localhost:3001');
        this.status.bridge = true;
        resolve();
      }).on('error', (error) => {
        // Bridge not running, start it
        console.log('   Bridge not responding, starting new instance...');
        
        const bridgeProcess = spawn('node', ['server.js'], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        bridgeProcess.stdout.on('data', (data) => {
          const output = data.toString();
          if (output.includes('Server running')) {
            console.log('✅ Bridge server started on localhost:3001');
            this.status.bridge = true;
            this.processes.set('bridge', bridgeProcess);
            resolve();
          }
        });

        bridgeProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('EADDRINUSE')) {
            console.log('✅ Bridge server already running');
            this.status.bridge = true;
            resolve();
          } else if (!error.includes('Server running')) {
            console.error('❌ Bridge server error:', error);
          }
        });

        bridgeProcess.on('error', (error) => {
          console.error('❌ Failed to start bridge server:', error.message);
          reject(error);
        });

        // Timeout after 5 seconds
        setTimeout(() => {
          if (!this.status.bridge) {
            reject(new Error('Bridge server startup timeout'));
          }
        }, 5000);
      });
    });
  }

  async startMCPServer() {
    console.log('🔌 Starting MCP server...');
    
    return new Promise((resolve, reject) => {
      const mcpProcess = spawn('node', [this.config.mcpServerPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      mcpProcess.stdout.on('data', (data) => {
        const output = data.toString();
        if (output.includes('MCP Server running')) {
          console.log('✅ MCP server started');
          this.status.mcpServer = true;
          this.processes.set('mcp', mcpProcess);
          resolve();
        }
      });

      mcpProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Waiting for Redstring store bridge')) {
          console.log('✅ MCP server started (waiting for bridge)');
          this.status.mcpServer = true;
          this.processes.set('mcp', mcpProcess);
          resolve();
        }
      });

      mcpProcess.on('error', (error) => {
        console.error('❌ Failed to start MCP server:', error.message);
        reject(error);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.status.mcpServer) {
          reject(new Error('MCP server startup timeout'));
        }
      }, 5000);
    });
  }

  async detectAIClients() {
    console.log('🔍 Detecting AI clients...');
    
    const clients = [];
    
    // Check for Claude Desktop
    const claudeConfigPath = join(process.env.HOME, 'Library/Application Support/Claude/claude_desktop_config.json');
    if (existsSync(claudeConfigPath)) {
      try {
        const config = JSON.parse(readFileSync(claudeConfigPath, 'utf8'));
        if (config.mcpServers?.redstring) {
          clients.push({
            name: 'Claude Desktop',
            type: 'claude',
            config: config.mcpServers.redstring,
            status: 'configured'
          });
        } else {
          clients.push({
            name: 'Claude Desktop',
            type: 'claude',
            status: 'not_configured'
          });
        }
      } catch (error) {
        clients.push({
          name: 'Claude Desktop',
          type: 'claude',
          status: 'error'
        });
      }
    }

    // Check for Tome
    const tomeConfigPath = join(process.env.HOME, 'Library/Application Support/Tome');
    if (existsSync(tomeConfigPath)) {
      clients.push({
        name: 'Tome',
        type: 'tome',
        status: 'available'
      });
    }

    // Check for other MCP clients
    const mcpLogPath = join(process.env.HOME, 'Library/Logs/Claude/mcp.log');
    if (existsSync(mcpLogPath)) {
      clients.push({
        name: 'Other MCP Client',
        type: 'generic',
        status: 'available'
      });
    }

    this.status.aiClient = clients[0] || null;
    
    if (clients.length > 0) {
      console.log('✅ Detected AI clients:');
      clients.forEach(client => {
        console.log(`   - ${client.name} (${client.status})`);
      });
    } else {
      console.log('⚠️  No AI clients detected');
    }
  }

  async provideInstructions() {
    console.log('\n📋 Connection Instructions:');
    console.log('==========================\n');

    if (this.status.aiClient?.type === 'claude' && this.status.aiClient.status === 'configured') {
      console.log('🎉 Claude Desktop is already configured!');
      console.log('   Just restart Claude Desktop to connect.');
    } else if (this.status.aiClient?.type === 'claude') {
      console.log('🔧 To configure Claude Desktop:');
      console.log('   1. Open Claude Desktop');
      console.log('   2. Go to Settings > Local MCP Servers');
      console.log('   3. Add new server:');
      console.log(`      Command: node`);
      console.log(`      Args: ${this.config.mcpServerPath}`);
      console.log('   4. Restart Claude Desktop');
    }

    if (this.status.aiClient?.type === 'tome') {
      console.log('🔧 To configure Tome:');
      console.log('   1. Open Tome');
      console.log('   2. Go to Settings > MCP Servers');
      console.log('   3. Add new server:');
      console.log(`      Command: node ${this.config.mcpServerPath}`);
      console.log('   4. Test the connection');
    }

    console.log('\n🔗 Available MCP Tools:');
    console.log('   - list_available_graphs');
    console.log('   - get_active_graph');
    console.log('   - open_graph');
    console.log('   - set_active_graph');
    console.log('   - add_node_prototype');
    console.log('   - add_node_instance');
  }

  startMonitoring() {
    console.log('\n📊 Starting connection monitor...');
    console.log('   Press Ctrl+C to stop the wizard\n');

    let consecutiveFailures = 0;
    const maxFailures = 3;
    const timeout = 5000; // 5 second timeout

    const monitor = setInterval(() => {
      // Check bridge status with timeout
      const bridgeRequest = get(`http://localhost:${this.config.bridgePort}/api/bridge/state`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const bridgeData = JSON.parse(data);
            const hasData = bridgeData.graphs?.length > 0;
            consecutiveFailures = 0; // Reset failure counter on success
            
            // Check Redstring status with timeout
            const redstringRequest = get(`http://localhost:${this.config.redstringPort}`, (redstringRes) => {
              process.stdout.write('\r');
              process.stdout.write(`Status: Bridge ✅ | Redstring ✅ | Data ${hasData ? '✅' : '❌'}`);
            });
            
            redstringRequest.on('error', () => {
              process.stdout.write('\r');
              process.stdout.write(`Status: Bridge ✅ | Redstring ❌ | Data ${hasData ? '✅' : '❌'}`);
            });
            
            // Set timeout for Redstring request
            redstringRequest.setTimeout(timeout, () => {
              redstringRequest.destroy();
              process.stdout.write('\r');
              process.stdout.write(`Status: Bridge ✅ | Redstring ❌ | Data ${hasData ? '✅' : '❌'}`);
            });
            
          } catch (error) {
            process.stdout.write('\r');
            process.stdout.write(`Status: Bridge ✅ | Redstring ❌ | Data ❌`);
          }
        });
      });
      
      bridgeRequest.on('error', () => {
        consecutiveFailures++;
        process.stdout.write('\r');
        process.stdout.write(`Status: Bridge ❌ | Redstring ❌ | Data ❌ (Attempt ${consecutiveFailures}/${maxFailures})`);
        
        if (consecutiveFailures >= maxFailures) {
          console.log('\n\n⚠️  Connection lost! Attempting to reconnect...');
          this.attemptReconnection();
        }
      });
      
      // Set timeout for bridge request
      bridgeRequest.setTimeout(timeout, () => {
        bridgeRequest.destroy();
        consecutiveFailures++;
        process.stdout.write('\r');
        process.stdout.write(`Status: Bridge ❌ | Redstring ❌ | Data ❌ (Timeout, Attempt ${consecutiveFailures}/${maxFailures})`);
        
        if (consecutiveFailures >= maxFailures) {
          console.log('\n\n⚠️  Connection lost! Attempting to reconnect...');
          this.attemptReconnection();
        }
      });
    }, 2000);

    // Handle cleanup on exit
    process.on('SIGINT', () => {
      console.log('\n\n🛑 Shutting down AI Connection Wizard...');
      clearInterval(monitor);
      this.cleanup();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n\n🛑 Shutting down AI Connection Wizard...');
      clearInterval(monitor);
      this.cleanup();
      process.exit(0);
    });
  }

  async attemptReconnection() {
    console.log('🔄 Attempting to reconnect...');
    
    try {
      // Wait a moment before attempting reconnection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check if services are back up
      const bridgeCheck = new Promise((resolve) => {
        get(`http://localhost:${this.config.bridgePort}/api/bridge/state`, (res) => {
          resolve(true);
        }).on('error', () => {
          resolve(false);
        }).setTimeout(3000, () => {
          resolve(false);
        });
      });
      
      const redstringCheck = new Promise((resolve) => {
        get(`http://localhost:${this.config.redstringPort}`, (res) => {
          resolve(true);
        }).on('error', () => {
          resolve(false);
        }).setTimeout(3000, () => {
          resolve(false);
        });
      });
      
      const [bridgeUp, redstringUp] = await Promise.all([bridgeCheck, redstringCheck]);
      
      if (bridgeUp && redstringUp) {
        console.log('✅ Reconnection successful! Services are back online.');
        return;
      }
      
      if (!bridgeUp) {
        console.log('🔄 Bridge server down, attempting to restart...');
        // Try to restart bridge server
        try {
          await this.startBridgeServer();
          console.log('✅ Bridge server restarted successfully');
        } catch (error) {
          console.log('❌ Failed to restart bridge server:', error.message);
        }
      }
      
      if (!redstringUp) {
        console.log('⚠️  Redstring appears to be down. Please restart it manually.');
      }
      
    } catch (error) {
      console.log('❌ Reconnection attempt failed:', error.message);
    }
  }

  cleanup() {
    console.log('🧹 Cleaning up processes...');
    
    for (const [name, process] of this.processes) {
      try {
        process.kill();
        console.log(`   Stopped ${name} process`);
      } catch (error) {
        // Process might already be dead
      }
    }
    
    this.processes.clear();
  }
}

// Start the wizard
const wizard = new AIConnectionWizard();
wizard.start().catch(error => {
  console.error('❌ Wizard failed:', error.message);
  process.exit(1);
}); 