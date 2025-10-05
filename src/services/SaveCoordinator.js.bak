/**
 * Save Coordinator - Simplified save management system
 * 
 * Coordinates between:
 * - Local file saves (FileStorage)
 * - Git repository commits (GitSyncEngine)
 * 
 * Features:
 * - Single debounced save timer (500ms) for all changes
 * - GitSyncEngine handles its own batching and rate limiting
 * - Consistent state synchronization
 */

import { exportToRedstring } from '../formats/redstringFormat.js';
import { gitAutosavePolicy } from './GitAutosavePolicy.js';

// SIMPLIFIED: No priorities - all changes batched together with a single debounce
const DEBOUNCE_MS = 500; // Wait 500ms after last change before saving

class SaveCoordinator {
  constructor() {
    this.isEnabled = false;
    this.fileStorage = null;
    this.gitSyncEngine = null;
    this.universeManager = null;
    
    // SIMPLIFIED: Single state tracking
    this.lastSaveHash = null;
    this.lastState = null;
    this.lastChangeContext = {};
    this.saveTimer = null; // Single timer for all changes
    
    // Status tracking
    this.statusHandlers = new Set();
    this.isSaving = false;
    this.lastError = null;
    
    console.log('[SaveCoordinator] Initialized with simple batched saves');
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

    // Initialize Git autosave policy
    gitAutosavePolicy.initialize(gitSyncEngine, this);

    console.log('[SaveCoordinator] Initialized with dependencies and autosave policy');
    this.notifyStatus('info', 'Save coordinator ready with Git autosave policy');
  }

  // Main entry point for state changes
  onStateChange(newState, changeContext = {}) {
    if (!this.isEnabled || !newState) {
      if (!this.isEnabled) {
        console.log('[SaveCoordinator] State change ignored - not enabled');
      }
      return;
    }

    try {
      const stateHash = this.generateStateHash(newState);
      
      // Skip if no actual changes
      if (this.lastSaveHash === stateHash) {
        return;
      }

      console.log('[SaveCoordinator] State change detected:', changeContext.type || 'unknown', 'hash:', stateHash.substring(0, 8));

      // Store the latest state
      this.lastState = newState;
      this.lastChangeContext = changeContext;

      // Notify Git autosave policy of the change
      gitAutosavePolicy.onEditActivity();

      // SIMPLIFIED: Just schedule a debounced save (all changes batched together)
      this.scheduleSave();

    } catch (error) {
      console.error('[SaveCoordinator] Error processing state change:', error);
      this.notifyStatus('error', `Save coordination failed: ${error.message}`);
    }
  }

  // Schedule a debounced save (cancels previous timer)
  scheduleSave() {
    // Clear existing timer
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    console.log(`[SaveCoordinator] Scheduling save in ${DEBOUNCE_MS}ms`);

    // Schedule new save
    this.saveTimer = setTimeout(() => {
      this.executeSave();
    }, DEBOUNCE_MS);
  }

  // Execute save (both local and git)
  async executeSave() {
    if (!this.lastState || this.isSaving) return;

    try {
      this.isSaving = true;
      const state = this.lastState;
      
      console.log('[SaveCoordinator] Executing save');

      // Save to local file if available
      if (this.fileStorage && typeof this.fileStorage.saveToFile === 'function') {
        const activeUniverse = this.universeManager?.getActiveUniverse();
        if (activeUniverse?.raw?.localFile?.fileHandle) {
          console.log('[SaveCoordinator] Saving to local file');
          await this.fileStorage.saveToFile(state, false);
        }
      }

      // Save to Git if available
      if (this.gitSyncEngine && this.gitSyncEngine.isHealthy()) {
        console.log('[SaveCoordinator] Queuing git save');
        this.gitSyncEngine.updateState(state);
        console.log('[SaveCoordinator] Git save queued, pending commits:', this.gitSyncEngine.pendingCommits?.length);
      }

      // Update save hash
      this.lastSaveHash = this.generateStateHash(state);
      this.notifyStatus('success', 'Save completed');

    } catch (error) {
      console.error('[SaveCoordinator] Save failed:', error);
      this.notifyStatus('error', `Save failed: ${error.message}`);
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
      
      // Clear pending timer
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      
      // Update last state
      this.lastState = state;
      
      // Execute save immediately
      await this.executeSave();
      
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
      // Include viewport state (rounded to prevent tiny changes from spamming)
      const contentState = {
        graphs: state.graphs ? Array.from(state.graphs.entries()).map(([id, graph]) => {
          const { panOffset, zoomLevel, ...content } = graph || {};
          // Round viewport values to prevent micro-changes from triggering saves
          const view = {
            x: Math.round(((panOffset?.x ?? 0) + Number.EPSILON) * 100) / 100,
            y: Math.round(((panOffset?.y ?? 0) + Number.EPSILON) * 100) / 100,
            zoom: typeof zoomLevel === 'number' ? Math.round((zoomLevel + Number.EPSILON) * 10000) / 10000 : 1
          };
          return [id, { ...content, __view: view }];
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

  // Get current state for autosave policy
  getState() {
    // Return the last state
    if (this.lastState) {
      return this.lastState;
    }

    // Fallback to Git sync engine's local state
    if (this.gitSyncEngine && this.gitSyncEngine.localState) {
      return this.gitSyncEngine.localState.get('current');
    }

    return null;
  }

  // Get current status
  getStatus() {
    return {
      isEnabled: this.isEnabled,
      isSaving: this.isSaving,
      hasPendingSave: this.saveTimer !== null,
      lastError: this.lastError,
      gitAutosavePolicy: gitAutosavePolicy.getStatus()
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
      
      // Clear pending timer
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = null;
      }
      
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

