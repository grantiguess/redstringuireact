/**
 * Git Sync Engine - Implements the Git-Native Protocol's rapid synchronization pattern
 * Real-time local state + background persistence with 5-second auto-commits
 */

import { exportToRedstring } from '../formats/redstringFormat.js';

// Source of truth modes
const SOURCE_OF_TRUTH = {
  LOCAL: 'local',    // RedString file is authoritative (default, safe)
  GIT: 'git'         // Git repository is authoritative (advanced, experimental)
};

class GitSyncEngine {
  constructor(provider, sourceOfTruth = SOURCE_OF_TRUTH.LOCAL) {
    this.provider = provider;
    this.sourceOfTruth = sourceOfTruth; // Configurable source of truth
    this.localState = new Map(); // Instant updates
    this.pendingCommits = []; // Queue of pending changes
    this.commitInterval = 5000; // 5-second auto-commits
    this.isRunning = false;
    this.lastCommitTime = 0;
    this.commitLoop = null;
    
    console.log('[GitSyncEngine] Initialized with provider:', provider.name);
    console.log('[GitSyncEngine] Source of truth:', this.sourceOfTruth);
  }
  
  /**
   * Set the source of truth mode
   * @param {string} mode - 'local' or 'git'
   */
  setSourceOfTruth(mode) {
    if (mode !== SOURCE_OF_TRUTH.LOCAL && mode !== SOURCE_OF_TRUTH.GIT) {
      throw new Error(`Invalid source of truth mode: ${mode}. Must be 'local' or 'git'`);
    }
    
    const oldMode = this.sourceOfTruth;
    this.sourceOfTruth = mode;
    
    console.log(`[GitSyncEngine] Source of truth changed from '${oldMode}' to '${mode}'`);
    
    if (mode === SOURCE_OF_TRUTH.GIT) {
      console.warn('[GitSyncEngine] WARNING: Git mode enabled. This is experimental and may overwrite local content!');
    }
  }
  
  /**
   * Get current source of truth mode
   */
  getSourceOfTruth() {
    return this.sourceOfTruth;
  }
  
  /**
   * Merge Git data with existing local content
   * Behavior depends on source of truth setting
   */
  mergeWithLocalContent(gitData, localState) {
    console.log(`[GitSyncEngine] Evaluating Git data against local RedString content (source: ${this.sourceOfTruth})...`);
    
    const gitHasContent = gitData && (
      (gitData.graphs && Object.keys(gitData.graphs).length > 0) ||
      (gitData.nodePrototypes && Object.keys(gitData.nodePrototypes).length > 0) ||
      (gitData.edges && Object.keys(gitData.edges).length > 0)
    );
    
    const localHasContent = localState && (
      localState.graphs.size > 0 ||
      localState.nodePrototypes.size > 0 ||
      localState.edges.size > 0
    );
    
    // LOCAL MODE: RedString file is source of truth (default, safe)
    if (this.sourceOfTruth === SOURCE_OF_TRUTH.LOCAL) {
      if (!gitHasContent && localHasContent) {
        console.log('[GitSyncEngine] LOCAL MODE: Git has no content, preserving local RedString content');
        return null; // Keep local content, sync to Git
      }
      
      if (gitHasContent && !localHasContent) {
        console.log('[GitSyncEngine] LOCAL MODE: Local has no content, using Git data as backup');
        return gitData; // Use Git data only if local is empty
      }
      
      if (gitHasContent && localHasContent) {
        console.log('[GitSyncEngine] LOCAL MODE: Both have content - RedString is source of truth, preserving local content');
        return null; // Keep local content, sync to Git
      }
      
      console.log('[GitSyncEngine] LOCAL MODE: Neither has content, starting fresh');
      return null; // Start fresh
    }
    
    // GIT MODE: Git repository is source of truth (experimental)
    if (this.sourceOfTruth === SOURCE_OF_TRUTH.GIT) {
      if (!gitHasContent && localHasContent) {
        console.log('[GitSyncEngine] GIT MODE: Git has no content, preserving local content and syncing to Git');
        return null; // Keep local content, sync to Git
      }
      
      if (gitHasContent && !localHasContent) {
        console.log('[GitSyncEngine] GIT MODE: Local has no content, using Git data as source');
        return gitData; // Use Git data
      }
      
      if (gitHasContent && localHasContent) {
        console.log('[GitSyncEngine] GIT MODE: Both have content - Git is source of truth, using Git data');
        return gitData; // Use Git data as source of truth
      }
      
      console.log('[GitSyncEngine] GIT MODE: Neither has content, starting fresh');
      return null; // Start fresh
    }
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
      
      // Check if content is empty or whitespace
      if (!content || content.trim() === '') {
        console.log('[GitSyncEngine] File is empty, starting fresh');
        return null;
      }
      
      // Try to parse the content
      try {
        const redstringData = JSON.parse(content);
        console.log('[GitSyncEngine] Successfully parsed RedString data');
        return redstringData;
      } catch (parseError) {
        console.warn('[GitSyncEngine] Failed to parse JSON, file may be corrupted:', parseError.message);
        console.log('[GitSyncEngine] File content preview:', content.substring(0, 100) + '...');
        return null; // Return null to start fresh
      }
      
    } catch (error) {
      console.error('[GitSyncEngine] Failed to load from Git:', error);
      return null; // Return null instead of throwing to start fresh
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
      provider: this.provider.name,
      sourceOfTruth: this.sourceOfTruth
    };
  }
}

export { GitSyncEngine, SOURCE_OF_TRUTH }; 