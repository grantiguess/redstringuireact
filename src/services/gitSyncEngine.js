/**
 * Git Sync Engine - Implements the Git-Native Protocol's rapid synchronization pattern
 * Real-time local state + background persistence with 5-second auto-commits
 */

import { exportToRedstring } from '../formats/redstringFormat.js';

class GitSyncEngine {
  constructor(provider) {
    this.provider = provider;
    this.localState = new Map(); // Instant updates
    this.pendingCommits = []; // Queue of pending changes
    this.commitInterval = 5000; // 5-second auto-commits
    this.isRunning = false;
    this.lastCommitTime = 0;
    this.commitLoop = null;
    
    console.log('[GitSyncEngine] Initialized with provider:', provider.name);
  }
  
  /**
   * Start the background commit loop
   */
  start() {
    if (this.isRunning) {
      console.log('[GitSyncEngine] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('[GitSyncEngine] Starting commit loop (every', this.commitInterval, 'ms)');
    
    this.commitLoop = setInterval(async () => {
      await this.processPendingCommits();
    }, this.commitInterval);
  }
  
  /**
   * Stop the background commit loop
   */
  stop() {
    if (!this.isRunning) {
      return;
    }
    
    this.isRunning = false;
    if (this.commitLoop) {
      clearInterval(this.commitLoop);
      this.commitLoop = null;
    }
    
    console.log('[GitSyncEngine] Stopped commit loop');
  }
  
  /**
   * Update local state instantly (user operations)
   */
  updateState(storeState) {
    // Store the current state for background persistence
    this.localState.set('current', storeState);
    
    // Add to pending commits
    this.pendingCommits.push({
      type: 'state_update',
      timestamp: Date.now(),
      data: storeState
    });
    
    console.log('[GitSyncEngine] State updated, pending commits:', this.pendingCommits.length);
  }
  
  /**
   * Process pending commits in batches
   */
  async processPendingCommits() {
    if (this.pendingCommits.length === 0) {
      return; // Nothing to commit
    }
    
    const timeSinceLastCommit = Date.now() - this.lastCommitTime;
    if (timeSinceLastCommit < this.commitInterval) {
      return; // Too soon since last commit
    }
    
    try {
      console.log('[GitSyncEngine] Processing', this.pendingCommits.length, 'pending commits...');
      
      // Get the most recent state
      const latestState = this.pendingCommits[this.pendingCommits.length - 1].data;
      
      // Export to RedString format
      const redstringData = exportToRedstring(latestState);
      const jsonString = JSON.stringify(redstringData, null, 2);
      
      // Save to Git repository
      await this.provider.writeSemanticFile('universe.redstring', jsonString);
      await this.provider.writeSemanticFile('backup.redstring', jsonString);
      
      // Clear pending commits
      this.pendingCommits = [];
      this.lastCommitTime = Date.now();
      
      console.log('[GitSyncEngine] Successfully committed to Git repository');
      
    } catch (error) {
      console.error('[GitSyncEngine] Failed to commit:', error);
      
      // Don't clear pending commits on error - they'll be retried
      // But limit the queue size to prevent memory issues
      if (this.pendingCommits.length > 10) {
        console.warn('[GitSyncEngine] Too many pending commits, keeping only latest 5');
        this.pendingCommits = this.pendingCommits.slice(-5);
      }
    }
  }
  
  /**
   * Force an immediate commit
   */
  async forceCommit(storeState) {
    try {
      console.log('[GitSyncEngine] Force committing...');
      
      const redstringData = exportToRedstring(storeState);
      const jsonString = JSON.stringify(redstringData, null, 2);
      
      await this.provider.writeSemanticFile('universe.redstring', jsonString);
      await this.provider.writeSemanticFile('backup.redstring', jsonString);
      
      this.pendingCommits = []; // Clear pending commits
      this.lastCommitTime = Date.now();
      
      console.log('[GitSyncEngine] Force commit successful');
      return true;
      
    } catch (error) {
      console.error('[GitSyncEngine] Force commit failed:', error);
      throw error;
    }
  }
  
  /**
   * Load state from Git repository
   */
  async loadFromGit() {
    try {
      console.log('[GitSyncEngine] Loading from Git repository...');
      
      // Try to load the main universe file
      let content;
      try {
        content = await this.provider.readSemanticFile('universe.redstring');
        console.log('[GitSyncEngine] Loaded main universe file');
      } catch (error) {
        console.log('[GitSyncEngine] Main file not found, trying backup...');
        try {
          content = await this.provider.readSemanticFile('backup.redstring');
          console.log('[GitSyncEngine] Loaded backup file');
        } catch (backupError) {
          console.log('[GitSyncEngine] No existing files found, starting fresh');
          return null; // Return null to indicate no existing data
        }
      }
      
      // Parse the content
      const redstringData = JSON.parse(content);
      console.log('[GitSyncEngine] Successfully parsed RedString data');
      
      return redstringData;
      
    } catch (error) {
      console.error('[GitSyncEngine] Failed to load from Git:', error);
      throw error;
    }
  }
  
  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pendingCommits: this.pendingCommits.length,
      lastCommitTime: this.lastCommitTime,
      provider: this.provider.name
    };
  }
}

export { GitSyncEngine }; 