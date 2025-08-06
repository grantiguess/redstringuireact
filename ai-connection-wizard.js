#!/usr/bin/env node

/**
 * AI Connection Wizard for Redstring
 * 
 * This wizard automates the entire process of connecting Redstring to AI services:
 * - Detects available AI clients (Claude Desktop, Tome, etc.)
 * - Sets up MCP servers
 * - Configures bridges
 * - Validates connections
 * - Provides status monitoring with improved retry logic
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
      data: false,
      aiClient: null
    };
    this.config = {
      redstringPort: 4000,
      bridgePort: 3001,
      mcpServerPath: join(__dirname, 'redstring-mcp-server.js'),
      maxRetries: 5,
      retryDelay: 2000,
      startupTimeout: 10000
    };
    this.retryCounts = {
      bridge: 0,
      mcpServer: 0,
      data: 0
    };
  }

  async start() {
    console.log('🤖 AI Connection Wizard for Redstring');
    console.log('=====================================\n');

    try {
      // Step 1: Check if Redstring is running
      await this.checkRedstringStatus();
      
      // Step 2: Start MCP server (now includes HTTP functionality)
      await this.startMCPServerWithRetry();
      
      // Step 4: Detect AI clients
      await this.detectAIClients();
      
      // Step 5: Provide connection instructions
      await this.provideInstructions();
      
      // Step 6: Start monitoring with improved retry logic
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
      const request = get(`http://localhost:${this.config.redstringPort}`, (res) => {
        if (res.statusCode === 200) {
          console.log('✅ Redstring is running on localhost:4000');
          this.status.redstring = true;
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
      
      request.on('error', (error) => {
        console.log('⚠️  Redstring not detected on localhost:4000');
        console.log('   Please start Redstring first: npm run dev');
        console.log('   Then run this wizard again.\n');
        reject(new Error('Redstring not running'));
      });
      
      request.setTimeout(5000, () => {
        request.destroy();
        reject(new Error('Redstring connection timeout'));
      });
    });
  }

  async startBridgeServerWithRetry() {
    console.log('🌉 Starting bridge server...');
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.startBridgeServer();
        console.log(`✅ Bridge server started successfully (attempt ${attempt})`);
        return;
      } catch (error) {
        console.log(`   Attempt ${attempt}/${this.config.maxRetries} failed: ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          console.log(`   Waiting ${this.config.retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
          
          // Kill any existing bridge processes before retry
          this.killProcess('bridge');
        } else {
          throw new Error(`Bridge server failed to start after ${this.config.maxRetries} attempts`);
        }
      }
    }
  }

  async startBridgeServer() {
    return new Promise((resolve, reject) => {
      // First check if bridge is already running
      const checkRequest = get(`http://localhost:${this.config.bridgePort}/api/bridge/state`, (res) => {
        console.log('✅ Bridge server already running on localhost:3001');
        this.status.bridge = true;
        resolve();
      });
      
      checkRequest.on('error', (error) => {
        // Bridge not running, start it
        console.log('   Bridge not responding, starting new instance...');
        
        const bridgeProcess = spawn('node', ['server.js'], {
          cwd: __dirname,
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, NODE_ENV: 'production' }
        });

        let startupTimeout = setTimeout(() => {
          if (!this.status.bridge) {
            bridgeProcess.kill();
            reject(new Error('Bridge server startup timeout'));
          }
        }, this.config.startupTimeout);

        // Check if bridge is ready by polling the health endpoint
        const checkBridgeReady = () => {
          get(`http://localhost:${this.config.bridgePort}/health`, (res) => {
            if (res.statusCode === 200) {
              clearTimeout(startupTimeout);
              console.log('✅ Bridge server started on localhost:3001');
              this.status.bridge = true;
              this.processes.set('bridge', bridgeProcess);
              resolve();
            }
          }).on('error', () => {
            // Bridge not ready yet, check again in 500ms
            setTimeout(checkBridgeReady, 500);
          });
        };

        // Start checking after a short delay
        setTimeout(checkBridgeReady, 1000);

        bridgeProcess.stdout.on('data', (data) => {
          const output = data.toString();
          console.log('Bridge:', output.trim());
        });

        bridgeProcess.stderr.on('data', (data) => {
          const error = data.toString();
          if (error.includes('EADDRINUSE')) {
            clearTimeout(startupTimeout);
            console.log('✅ Bridge server already running');
            this.status.bridge = true;
            resolve();
          } else if (!error.includes('Server running')) {
            console.error('❌ Bridge server error:', error);
          }
        });

        bridgeProcess.on('error', (error) => {
          clearTimeout(startupTimeout);
          console.error('❌ Failed to start bridge server:', error.message);
          reject(error);
        });

        bridgeProcess.on('exit', (code) => {
          if (code !== 0 && !this.status.bridge) {
            clearTimeout(startupTimeout);
            reject(new Error(`Bridge server exited with code ${code}`));
          }
        });
      });
      
      checkRequest.setTimeout(3000, () => {
        checkRequest.destroy();
        // Continue with starting new instance
      });
    });
  }

  async startMCPServerWithRetry() {
    console.log('🔌 Starting MCP server...');
    
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.startMCPServer();
        console.log(`✅ MCP server started successfully (attempt ${attempt})`);
        return;
      } catch (error) {
        console.log(`   Attempt ${attempt}/${this.config.maxRetries} failed: ${error.message}`);
        
        if (attempt < this.config.maxRetries) {
          console.log(`   Waiting ${this.config.retryDelay}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, this.config.retryDelay));
          
          // Kill any existing MCP processes before retry
          this.killProcess('mcp');
        } else {
          throw new Error(`MCP server failed to start after ${this.config.maxRetries} attempts`);
        }
      }
    }
  }

  async startMCPServer() {
    return new Promise((resolve, reject) => {
      const mcpProcess = spawn('node', [this.config.mcpServerPath], {
        cwd: __dirname,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_ENV: 'production' }
      });
      
      // Share the MCP process globally for potential future use
      global.mcpProcess = mcpProcess;

      let startupTimeout = setTimeout(() => {
        if (!this.status.mcpServer) {
          mcpProcess.kill();
          reject(new Error('MCP server startup timeout'));
        }
      }, this.config.startupTimeout);

      // For MCP server, we'll use a timeout-based approach since it doesn't have a health endpoint
      const mcpStartupCheck = () => {
        // MCP server typically starts quickly, so we'll assume it's ready after a delay
        clearTimeout(startupTimeout);
        console.log('✅ MCP server started');
        this.status.mcpServer = true;
        this.processes.set('mcp', mcpProcess);
        resolve();
      };

      // Give MCP server 3 seconds to start
      setTimeout(mcpStartupCheck, 3000);

      mcpProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('MCP:', output.trim());
      });

      mcpProcess.stderr.on('data', (data) => {
        const error = data.toString();
        if (error.includes('Waiting for Redstring store bridge')) {
          clearTimeout(startupTimeout);
          console.log('✅ MCP server started (waiting for bridge)');
          this.status.mcpServer = true;
          this.processes.set('mcp', mcpProcess);
          resolve();
        }
      });

      mcpProcess.on('error', (error) => {
        clearTimeout(startupTimeout);
        console.error('❌ Failed to start MCP server:', error.message);
        reject(error);
      });

      mcpProcess.on('exit', (code) => {
        if (code !== 0 && !this.status.mcpServer) {
          clearTimeout(startupTimeout);
          reject(new Error(`MCP server exited with code ${code}`));
        }
      });
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
    console.log('   - verify_state');
    console.log('   - get_graph_instances');
    console.log('   - list_available_graphs');
    console.log('   - get_active_graph');
    console.log('   - open_graph');
    console.log('   - set_active_graph');
    console.log('   - addNodeToGraph (RECOMMENDED)');
    console.log('   - removeNodeFromGraph (RECOMMENDED)');
    console.log('   - add_node_prototype (LEGACY)');
    console.log('   - add_node_instance (LEGACY)');
  }

  startMonitoring() {
    console.log('\n📊 Starting connection monitor...');
    console.log('   Press Ctrl+C to stop the wizard\n');

    let consecutiveFailures = 0;
    const maxFailures = 3;
    const timeout = 5000; // 5 second timeout
    let lastStatus = { bridge: false, redstring: false, data: false };

    const monitor = setInterval(async () => {
      try {
        const currentStatus = await this.checkAllServices();
        
        // Update status display
        this.updateStatusDisplay(currentStatus);
        
        // Check for changes that require reconnection
        if (this.hasServiceChanged(lastStatus, currentStatus)) {
          console.log('\n🔄 Service status changed, checking connections...');
          
          if (!currentStatus.bridge || !currentStatus.redstring) {
            consecutiveFailures++;
            if (consecutiveFailures >= maxFailures) {
              console.log('\n⚠️  Connection issues detected! Attempting to reconnect...');
              await this.attemptReconnection();
              consecutiveFailures = 0; // Reset after reconnection attempt
            }
          } else {
            consecutiveFailures = 0; // Reset on success
          }
        }
        
        lastStatus = currentStatus;
        
      } catch (error) {
        consecutiveFailures++;
        process.stdout.write('\r');
        process.stdout.write(`Status: Bridge ❌ | Redstring ❌ | Data ❌ (Error: ${error.message})`);
        
        if (consecutiveFailures >= maxFailures) {
          console.log('\n\n⚠️  Connection lost! Attempting to reconnect...');
          this.attemptReconnection();
          consecutiveFailures = 0;
        }
      }
    }, 5000); // Check every 5 seconds

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

  async checkAllServices() {
    const status = { mcp: false, redstring: false, data: false };
    
    // Check MCP server status (now includes HTTP functionality)
    try {
      const mcpData = await this.checkMCPStatus();
      status.mcp = true;
      status.data = mcpData.hasData;
      status.redstring = mcpData.hasRecentData;
    } catch (error) {
      // MCP failed, try direct Redstring check
      try {
        await this.checkRedstringDirect();
        status.redstring = true;
      } catch (redstringError) {
        // Both failed
      }
    }
    
    return status;
  }

  async checkMCPStatus() {
    return new Promise((resolve, reject) => {
      const request = get(`http://localhost:${this.config.bridgePort}/api/bridge/state`, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const bridgeData = JSON.parse(data);
            const hasData = bridgeData.graphs?.length > 0;
            const hasRecentData = bridgeData.summary?.lastUpdate && 
              (Date.now() - bridgeData.summary.lastUpdate) < 30000; // Within 30 seconds
            
            resolve({ hasData, hasRecentData });
          } catch (error) {
            reject(new Error('Invalid bridge response'));
          }
        });
      });
      
      request.on('error', () => {
        reject(new Error('Bridge connection failed'));
      });
      
      request.setTimeout(3000, () => {
        request.destroy();
        reject(new Error('Bridge timeout'));
      });
    });
  }

  async checkRedstringDirect() {
    return new Promise((resolve, reject) => {
      const request = get(`http://localhost:${this.config.redstringPort}`, (res) => {
        resolve();
      });
      
      request.on('error', () => {
        reject(new Error('Redstring connection failed'));
      });
      
      request.setTimeout(2000, () => {
        request.destroy();
        reject(new Error('Redstring timeout'));
      });
    });
  }

  updateStatusDisplay(status) {
    process.stdout.write('\r');
    process.stdout.write(`Status: MCP ${status.mcp ? 'OK' : 'FAIL'} | Redstring ${status.redstring ? 'OK' : 'FAIL'} | Data ${status.data ? 'OK' : 'FAIL'}`);
  }

  hasServiceChanged(lastStatus, currentStatus) {
    return lastStatus.mcp !== currentStatus.mcp ||
           lastStatus.redstring !== currentStatus.redstring ||
           lastStatus.data !== currentStatus.data;
  }

  async attemptReconnection() {
    console.log('🔄 Attempting to reconnect...');
    
    try {
      // Wait a moment before attempting reconnection
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Check current status
      const currentStatus = await this.checkAllServices();
      
      if (currentStatus.bridge && currentStatus.redstring) {
        console.log('✅ Reconnection successful! Services are back online.');
        return;
      }
      
      // Try to restart bridge if it's down
      if (!currentStatus.bridge) {
        console.log('🔄 Bridge server down, attempting to restart...');
        try {
          await this.startBridgeServerWithRetry();
          console.log('✅ Bridge server restarted successfully');
        } catch (error) {
          console.log('❌ Failed to restart bridge server:', error.message);
        }
      }
      
      // Check if Redstring is down
      if (!currentStatus.redstring) {
        console.log('⚠️  Redstring appears to be down. Please restart it manually.');
        console.log('   Run: npm run dev');
      }
      
      // Wait a bit and check again
      await new Promise(resolve => setTimeout(resolve, 3000));
      const finalStatus = await this.checkAllServices();
      
      if (finalStatus.bridge && finalStatus.redstring) {
        console.log('✅ Reconnection completed successfully!');
      } else {
        console.log('⚠️  Some services still unavailable. Manual intervention may be needed.');
      }
      
    } catch (error) {
      console.log('❌ Reconnection attempt failed:', error.message);
    }
  }

  killProcess(name) {
    const process = this.processes.get(name);
    if (process) {
      try {
        process.kill();
        this.processes.delete(name);
        console.log(`   Killed ${name} process`);
      } catch (error) {
        // Process might already be dead
      }
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