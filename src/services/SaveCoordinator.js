/**
 * Save Coordinator - Centralized, intelligent save management system
 * 
 * Coordinates between:
 * - Local file saves (FileStorage)
 * - Git repository commits (GitSyncEngine)
 * - Browser storage fallbacks
 * 
 * Features:
 * - Tiered save strategies based on change types
 * - GitHub free tier optimized rate limiting
 * - Smart debouncing for different operations
 * - Consistent state synchronization
 */

import { exportToRedstring } from '../formats/redstringFormat.js';

// Save priority levels and their timing
const SAVE_PRIORITIES = {
  IMMEDIATE: {
    name: 'immediate',
    localDelay: 0,        // Save to local immediately
    gitDelay: 1000,       // Commit to git after 1s
    description: 'Critical prototype changes'
  },
  HIGH: {
    name: 'high', 
    localDelay: 2000,     // Save to local after 2s
    gitDelay: 5000,       // Commit to git after 5s  
    description: 'Node placement, connections'
  },
  NORMAL: {
    name: 'normal',
    localDelay: 5000,     // Save to local after 5s
    gitDelay: 15000,      // Commit to git after 15s
    description: 'Position updates while dragging'
  },
  LOW: {
    name: 'low',
    localDelay: 10000,    // Save to local after 10s
    gitDelay: 60000,      // Commit to git after 60s (1 minute)
    description: 'Viewport changes, UI state'
  }
};

// Change type detection patterns
const CHANGE_PATTERNS = {
  prototype: /nodePrototypes/,
  placement: /instances.*\.(x|y)$/,
  connection: /edges/,
  viewport: /\.(panOffset|zoomLevel)$/,
  ui_state: /\.(rightPanelTabs|expandedGraphIds|savedNodeIds)/
};

class SaveCoordinator {
  constructor() {
    this.isEnabled = false;
    this.fileStorage = null;
    this.gitSyncEngine = null;
    this.universeManager = null;
    
    // State tracking
    this.lastSaveHash = null;
    this.pendingChanges = new Map(); // priority -> { changes, timestamp }
    this.saveTimers = new Map(); // priority -> timer
    this.isDragging = false;
    this.dragStartTime = 0;
    
    // Rate limiting for GitHub
    this.lastGitCommitTime = 0;
    this.minGitInterval = 5000; // Minimum 5 seconds between git commits
    this.maxPendingChanges = 50; // Prevent memory buildup
    
    // Status tracking
    this.statusHandlers = new Set();
    this.isSaving = false;
    this.lastError = null;
    
    console.log('[SaveCoordinator] Initialized with tiered save strategies');
  }

  // Status notification system
  onStatusChange(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  notifyStatus(type, message, details = {}) {
    const status = { type, message, timestamp: Date.now(), ...details };
    this.statusHandlers.forEach(handler => {
      try {
        handler(status);
      } catch (error) {
        console.warn('[SaveCoordinator] Status handler error:', error);
      }
    });
  }

  // Initialize with required dependencies
  initialize(fileStorage, gitSyncEngine, universeManager) {
    this.fileStorage = fileStorage;
    this.gitSyncEngine = gitSyncEngine;
    this.universeManager = universeManager;
    this.isEnabled = true;
    
    console.log('[SaveCoordinator] Initialized with dependencies');
    this.notifyStatus('info', 'Save coordinator ready');
  }

  // Main entry point for state changes
  onStateChange(newState, changeContext = {}) {
    if (!this.isEnabled || !newState) return;

    try {
      const stateHash = this.generateStateHash(newState);
      
      // Skip if no actual changes
      if (this.lastSaveHash === stateHash) {
        return;
      }

      const priority = this.determinePriority(newState, changeContext);
      const now = Date.now();

      // Handle dragging state
      if (changeContext.isDragging || this.detectDragging(changeContext)) {
        this.isDragging = true;
        this.dragStartTime = this.dragStartTime || now;
        
        // During dragging, only queue changes, don't process immediately
        this.queueChange(priority, newState, changeContext);
        return;
      } else if (this.isDragging) {
        // Just finished dragging
        this.isDragging = false;
        this.dragStartTime = 0;
        console.log('[SaveCoordinator] Dragging finished, processing queued changes');
      }

      // Queue the change with appropriate priority
      this.queueChange(priority, newState, changeContext);
      
      // Schedule saves based on priority
      this.scheduleSaves(priority, newState);

    } catch (error) {
      console.error('[SaveCoordinator] Error processing state change:', error);
      this.notifyStatus('error', `Save coordination failed: ${error.message}`);
    }
  }

  // Detect dragging from rapid position changes
  detectDragging(changeContext) {
    if (changeContext.type === 'node_position' || changeContext.type === 'rapid_update') {
      const now = Date.now();
      const timeSinceLastChange = now - (this.lastChangeTime || 0);
      this.lastChangeTime = now;
      
      // If updates are coming very rapidly (< 100ms), likely dragging
      return timeSinceLastChange < 100;
    }
    return false;
  }

  // Determine save priority based on change type and context
  determinePriority(state, changeContext) {
    // Explicit priority from context
    if (changeContext.priority) {
      return SAVE_PRIORITIES[changeContext.priority.toUpperCase()] || SAVE_PRIORITIES.NORMAL;
    }

    // Detect change type from context
    const changeType = changeContext.type;
    
    switch (changeType) {
      case 'prototype_change':
      case 'prototype_create':
      case 'prototype_delete':
        return SAVE_PRIORITIES.IMMEDIATE;
        
      case 'node_place':
      case 'node_create':
      case 'edge_create':
      case 'edge_delete':
        return SAVE_PRIORITIES.HIGH;
        
      case 'node_position':
      case 'dragging':
        return this.isDragging ? SAVE_PRIORITIES.NORMAL : SAVE_PRIORITIES.HIGH;
        
      case 'viewport':
      case 'ui_state':
        return SAVE_PRIORITIES.LOW;
        
      default:
        return SAVE_PRIORITIES.NORMAL;
    }
  }

  // Queue a change for later processing
  queueChange(priority, state, context) {
    const existing = this.pendingChanges.get(priority.name);
    
    this.pendingChanges.set(priority.name, {
      state,
      context,
      timestamp: Date.now(),
      count: (existing?.count || 0) + 1
    });

    // Prevent memory buildup
    if (this.pendingChanges.size > this.maxPendingChanges) {
      console.warn('[SaveCoordinator] Too many pending changes, clearing oldest');
      const oldest = Array.from(this.pendingChanges.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
      this.pendingChanges.delete(oldest[0]);
    }
  }

  // Schedule saves based on priority
  scheduleSaves(priority, state) {
    const priorityName = priority.name;
    
    // Clear existing timer for this priority
    if (this.saveTimers.has(priorityName)) {
      clearTimeout(this.saveTimers.get(priorityName));
    }

    // Schedule local save
    const localTimer = setTimeout(() => {
      this.executeLocalSave(priorityName);
    }, priority.localDelay);

    // Schedule git save (if different timing)
    if (priority.gitDelay !== priority.localDelay) {
      setTimeout(() => {
        this.executeGitSave(priorityName);
      }, priority.gitDelay);
    }

    this.saveTimers.set(priorityName, localTimer);
  }

  // Execute local file save
  async executeLocalSave(priorityName) {
    if (!this.fileStorage || this.isSaving) return;

    try {
      const pendingChange = this.pendingChanges.get(priorityName);
      if (!pendingChange) return;

      console.log(`[SaveCoordinator] Executing local save for ${priorityName} priority`);
      this.isSaving = true;
      
      await this.fileStorage.saveToFile(pendingChange.state, false);
      
      this.notifyStatus('success', `Local save completed (${priorityName})`, {
        priority: priorityName,
        changeCount: pendingChange.count
      });

    } catch (error) {
      console.error('[SaveCoordinator] Local save failed:', error);
      this.notifyStatus('error', `Local save failed: ${error.message}`);
    } finally {
      this.isSaving = false;
    }
  }

  // Execute git commit
  async executeGitSave(priorityName) {
    if (!this.gitSyncEngine || this.isSaving) return;

    try {
      const pendingChange = this.pendingChanges.get(priorityName);
      if (!pendingChange) return;

      // Check if Git sync engine is healthy before attempting save
      if (!this.gitSyncEngine.isHealthy()) {
        console.log(`[SaveCoordinator] Git sync engine unhealthy, skipping git save for ${priorityName}`);
        // Keep the change pending and retry later
        setTimeout(() => this.executeGitSave(priorityName), 10000); // Retry in 10 seconds
        return;
      }

      // Rate limiting for GitHub
      const now = Date.now();
      const timeSinceLastCommit = now - this.lastGitCommitTime;
      
      if (timeSinceLastCommit < this.minGitInterval) {
        console.log(`[SaveCoordinator] Git rate limited, waiting ${this.minGitInterval - timeSinceLastCommit}ms`);
        setTimeout(() => this.executeGitSave(priorityName), this.minGitInterval - timeSinceLastCommit);
        return;
      }

      console.log(`[SaveCoordinator] Executing git save for ${priorityName} priority`);
      this.isSaving = true;
      
      // Use GitSyncEngine's updateState method for background processing
      this.gitSyncEngine.updateState(pendingChange.state);
      this.lastGitCommitTime = now;
      
      // Remove processed change
      this.pendingChanges.delete(priorityName);
      this.saveTimers.delete(priorityName);
      
      this.notifyStatus('success', `Git save queued (${priorityName})`, {
        priority: priorityName,
        changeCount: pendingChange.count
      });

    } catch (error) {
      console.error('[SaveCoordinator] Git save failed:', error);
      
      // For Git errors, keep the change and retry later instead of dropping it
      if (error.message && (error.message.includes('409') || error.message.includes('network'))) {
        console.log(`[SaveCoordinator] Git error (${error.message}), will retry in 15 seconds`);
        setTimeout(() => this.executeGitSave(priorityName), 15000);
      } else {
        this.notifyStatus('error', `Git save failed: ${error.message}`);
      }
    } finally {
      this.isSaving = false;
    }
  }

  // Force immediate save (for manual save button)
  async forceSave(state) {
    if (!this.isEnabled) {
      throw new Error('Save coordinator not initialized');
    }

    try {
      console.log('[SaveCoordinator] Force save requested');
      this.notifyStatus('info', 'Force saving...');
      
      // Clear all pending timers
      this.saveTimers.forEach(timer => clearTimeout(timer));
      this.saveTimers.clear();
      
      // Save to local file immediately
      if (this.fileStorage) {
        await this.fileStorage.saveToFile(state, true);
      }
      
      // Force commit to git if available
      if (this.gitSyncEngine) {
        await this.gitSyncEngine.forceCommit(state);
      }
      
      // Update state hash
      this.lastSaveHash = this.generateStateHash(state);
      this.pendingChanges.clear();
      
      this.notifyStatus('success', 'Force save completed');
      return true;

    } catch (error) {
      console.error('[SaveCoordinator] Force save failed:', error);
      this.notifyStatus('error', `Force save failed: ${error.message}`);
      throw error;
    }
  }

  // Generate hash for change detection
  generateStateHash(state) {
    try {
      // Extract only content-related state, excluding viewport
      const contentState = {
        graphs: state.graphs ? Array.from(state.graphs.entries()).map(([id, graph]) => {
          const { panOffset, zoomLevel, ...content } = graph;
          return [id, content];
        }) : [],
        nodePrototypes: state.nodePrototypes ? Array.from(state.nodePrototypes.entries()) : [],
        edges: state.edges ? Array.from(state.edges.entries()) : []
      };
      
      const stateString = JSON.stringify(contentState);
      
      // Simple hash function
      let hash = 0;
      for (let i = 0; i < stateString.length; i++) {
        const char = stateString.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
      }
      
      return hash.toString();
    } catch (error) {
      console.warn('[SaveCoordinator] Hash generation failed:', error);
      return Date.now().toString(); // Fallback to timestamp
    }
  }

  // Get current status
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isSaving: this.isSaving,
      isDragging: this.isDragging,
      pendingChanges: this.pendingChanges.size,
      pendingByPriority: Object.fromEntries(
        Array.from(this.pendingChanges.entries()).map(([priority, data]) => [
          priority, 
          { count: data.count, age: Date.now() - data.timestamp }
        ])
      ),
      activeTimers: this.saveTimers.size,
      lastGitCommitTime: this.lastGitCommitTime,
      lastError: this.lastError
    };
  }

  // Enable/disable the coordinator
  setEnabled(enabled) {
    if (enabled && !this.isEnabled) {
      this.isEnabled = true;
      console.log('[SaveCoordinator] Enabled');
      this.notifyStatus('info', 'Save coordination enabled');
    } else if (!enabled && this.isEnabled) {
      this.isEnabled = false;
      
      // Clear all pending operations
      this.saveTimers.forEach(timer => clearTimeout(timer));
      this.saveTimers.clear();
      this.pendingChanges.clear();
      
      console.log('[SaveCoordinator] Disabled');
      this.notifyStatus('info', 'Save coordination disabled');
    }
  }

  // Cleanup
  destroy() {
    this.setEnabled(false);
    this.statusHandlers.clear();
    console.log('[SaveCoordinator] Destroyed');
  }
}

// Export singleton instance
export const saveCoordinator = new SaveCoordinator();
export default saveCoordinator;