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
  constructor(provider, sourceOfTruth = SOURCE_OF_TRUTH.LOCAL, universeSlug = 'default', fileBaseName = 'universe') {
    this.provider = provider;
    this.sourceOfTruth = sourceOfTruth; // Configurable source of truth
    this.universeSlug = (universeSlug || 'default').trim() || 'default';
    this.fileBaseName = (fileBaseName || 'universe').replace(/\.redstring$/i, '');
    this.localState = new Map(); // Instant updates
    this.pendingCommits = []; // Queue of pending changes
    this.commitInterval = 5000; // 5-second auto-commits
    this.isRunning = false;
    this.lastCommitTime = 0;
    this.commitLoop = null;
    this.lastCommittedHash = null; // Hash of last committed state
    this.hasChanges = false; // Track if there are actual changes
    this.isCommitInProgress = false; // Prevent overlapping commits
    
    // Rate limiting and debouncing
    this.minCommitInterval = 2000; // Minimum 2 seconds between commits
    this.debounceTimeout = null; // For debouncing rapid updates
    this.debounceDelay = 1000; // 1 second debounce for continuous operations
    this.isDragging = false; // Track if we're in a dragging operation
    this.dragStartTime = 0; // Track when dragging started
    
    // Optional UI status handler
    this.statusHandler = null;
    
    console.log('[GitSyncEngine] Initialized with provider:', provider.name);
    console.log('[GitSyncEngine] Source of truth:', this.sourceOfTruth);
    console.log('[GitSyncEngine] Universe slug:', this.universeSlug);
  }

  // Allow UI to subscribe to status updates
  onStatusChange(handler) {
    this.statusHandler = typeof handler === 'function' ? handler : null;
  }

  notifyStatus(type, status) {
    try {
      if (this.statusHandler) this.statusHandler({ type, status });
    } catch (_) {}
  }

  getLatestPath() {
    return `universes/${this.universeSlug}/${this.fileBaseName}.redstring`;
  }

  getBackupPath() {
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
    return `universes/${this.universeSlug}/backups/${this.fileBaseName}-${stamp}.redstring`;
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
   * Generate a hash of the store state for change detection
   * Only includes content changes, not viewport changes
   */
  generateStateHash(storeState) {
    // Extract only content-related state, excluding viewport state
    const contentState = {
      graphs: Array.from(storeState.graphs.entries()).map(([id, graph]) => {
        // Exclude viewport state from graphs
        const { panOffset, zoomLevel, ...contentGraph } = graph;
        return [id, contentGraph];
      }),
      nodePrototypes: Array.from(storeState.nodePrototypes.entries()),
      edges: Array.from(storeState.edges.entries())
    };
    
    // Create a simple hash of the content state
    const stateString = JSON.stringify(contentState);
    
    // Simple hash function
    let hash = 0;
    for (let i = 0; i < stateString.length; i++) {
      const char = stateString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString();
  }

  /**
   * Update local state instantly (user operations)
   * Now with intelligent rate limiting and debouncing
   */
  updateState(storeState) {
    // Store the current state for background persistence
    this.localState.set('current', storeState);
    
    // Check if there are actual changes (content only, not viewport)
    const currentHash = this.generateStateHash(storeState);
    const hasChanges = this.lastCommittedHash !== currentHash;
    
    if (!hasChanges) {
      return; // No changes, nothing to do
    }
    
    // Detect if this might be a dragging operation
    const now = Date.now();
    const timeSinceLastUpdate = now - (this.pendingCommits.length > 0 ? this.pendingCommits[this.pendingCommits.length - 1].timestamp : 0);
    
    // If updates are coming very rapidly (less than 100ms apart), likely dragging
    if (timeSinceLastUpdate < 100) {
      this.isDragging = true;
      this.dragStartTime = this.dragStartTime || now;
      console.log('[GitSyncEngine] Detected rapid updates (likely dragging), debouncing...');
    }
    
    // Clear any existing debounce timeout
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }
    
    // Add to pending commits
    this.pendingCommits.push({
      type: 'state_update',
      timestamp: now,
      data: storeState,
      hash: currentHash,
      isDragging: this.isDragging
    });
    
    this.hasChanges = true;
    
    // If we're dragging, use debounced commit
    if (this.isDragging) {
      this.debounceTimeout = setTimeout(() => {
        console.log('[GitSyncEngine] Dragging finished, committing final state');
        this.isDragging = false;
        this.dragStartTime = 0;
        this.processPendingCommits();
      }, this.debounceDelay);
    } else {
      // Normal update, log but don't spam
      console.log('[GitSyncEngine] Content updated, pending commits:', this.pendingCommits.length);
    }
  }
  
  /**
   * Process pending commits in batches
   * Now with rate limiting and intelligent batching
   */
  async processPendingCommits() {
    if (this.pendingCommits.length === 0) {
      return; // Nothing to commit
    }
    
    const now = Date.now();
    const timeSinceLastCommit = now - this.lastCommitTime;
    
    // Rate limiting: enforce minimum interval between commits
    if (timeSinceLastCommit < this.minCommitInterval) {
      console.log('[GitSyncEngine] Rate limited: too soon since last commit');
      this.notifyStatus('info', 'Rate limited: waiting before next commit');
      return;
    }
    
    // Check if there are actual changes to commit
    if (!this.hasChanges) {
      console.log('[GitSyncEngine] No changes detected, skipping commit');
      return;
    }
    
    // If we're currently dragging, don't commit yet (let debounce handle it)
    if (this.isDragging) {
      console.log('[GitSyncEngine] Currently dragging, waiting for drag to finish');
      return;
    }
    
    if (this.isCommitInProgress) {
      console.log('[GitSyncEngine] Commit already in progress, skipping this cycle');
      return;
    }
    this.isCommitInProgress = true;
    try {
      const commitCount = this.pendingCommits.length;
      const isFromDragging = this.pendingCommits.some(commit => commit.isDragging);
      
      console.log(`[GitSyncEngine] Processing ${commitCount} pending commits${isFromDragging ? ' (from dragging)' : ''}...`);
      this.notifyStatus('info', `Committing ${commitCount} update${commitCount === 1 ? '' : 's'}...`);
      
      // Get the most recent state (always use the latest, discard intermediate states)
      const latestState = this.pendingCommits[this.pendingCommits.length - 1].data;
      const latestHash = this.pendingCommits[this.pendingCommits.length - 1].hash;
      
      // Export to RedString format (raw JSON write, not TTL)
      const redstringData = exportToRedstring(latestState);
      const jsonString = JSON.stringify(redstringData, null, 2);
      
      // Save latest snapshot to a fixed path
      await this.provider.writeFileRaw(this.getLatestPath(), jsonString);
      
      // Write a timestamped backup (unique path avoids 409s)
      await this.provider.writeFileRaw(this.getBackupPath(), jsonString);
      
      // Update tracking
      this.lastCommittedHash = latestHash;
      this.hasChanges = false;
      this.pendingCommits = [];
      this.lastCommitTime = now;
      
      console.log(`[GitSyncEngine] Successfully committed changes to Git repository (${commitCount} updates batched)`);
      this.notifyStatus('success', `Committed ${commitCount} update${commitCount === 1 ? '' : 's'} to Git`);
      
    } catch (error) {
      console.error('[GitSyncEngine] Failed to commit:', error);
      this.notifyStatus('error', `Commit failed: ${error.message || 'Unknown error'}`);
      
      // Check if it's a 409 conflict (file modified since last read)
      if (error.message && error.message.includes('409')) {
        console.log('[GitSyncEngine] 409 conflict detected, will retry on next cycle');
        // Keep the commits for retry, but add a small delay to avoid rapid retries
        this.lastCommitTime = Date.now() - 4000; // Allow retry in 1 second
      } else {
        // For other errors, don't clear pending commits - they'll be retried
        // But limit the queue size to prevent memory issues
        if (this.pendingCommits.length > 20) {
          console.warn('[GitSyncEngine] Too many pending commits, keeping only latest 10');
          this.pendingCommits = this.pendingCommits.slice(-10);
        }
      }
    } finally {
      this.isCommitInProgress = false;
    }
  }
  
  /**
   * Force an immediate commit
   */
  async forceCommit(storeState) {
    try {
      console.log('[GitSyncEngine] Force committing...');
      this.notifyStatus('info', 'Force committing changes...');
      
      // Clear any pending debounce
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = null;
      }
      
      // Reset dragging state
      this.isDragging = false;
      this.dragStartTime = 0;
      
      // Wait if background commit is in progress
      while (this.isCommitInProgress) {
        await new Promise(r => setTimeout(r, 50));
      }
      this.isCommitInProgress = true;
      const redstringData = exportToRedstring(storeState);
      const jsonString = JSON.stringify(redstringData, null, 2);
      
      await this.provider.writeFileRaw(this.getLatestPath(), jsonString);
      await this.provider.writeFileRaw(this.getBackupPath(), jsonString);
      
      // Update tracking for force commit
      const currentHash = this.generateStateHash(storeState);
      this.lastCommittedHash = currentHash;
      this.hasChanges = false;
      this.pendingCommits = []; // Clear pending commits
      this.lastCommitTime = Date.now();
      
      console.log('[GitSyncEngine] Force commit successful');
      this.notifyStatus('success', 'Force commit successful');
      return true;
      
    } catch (error) {
      console.error('[GitSyncEngine] Force commit failed:', error);
      this.notifyStatus('error', `Force commit failed: ${error.message || 'Unknown error'}`);
      throw error;
    } finally {
      this.isCommitInProgress = false;
    }
  }
  
  /**
   * Load state from Git repository
   */
  async loadFromGit() {
    try {
      console.log('[GitSyncEngine] Loading from Git repository...');
      
      // Try to load the main universe file (raw JSON) for this slug
      let content;
      try {
        content = await this.provider.readFileRaw(this.getLatestPath());
        console.log('[GitSyncEngine] Loaded main universe file');
      } catch (error) {
        console.log('[GitSyncEngine] Main file not found for slug, starting fresh');
        return null;
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
   * Manually end dragging state (useful for edge cases)
   */
  endDragging() {
    if (this.isDragging) {
      console.log('[GitSyncEngine] Manually ending dragging state');
      this.isDragging = false;
      this.dragStartTime = 0;
      
      // Clear debounce and commit immediately
      if (this.debounceTimeout) {
        clearTimeout(this.debounceTimeout);
        this.debounceTimeout = null;
      }
      
      // Process any pending commits
      this.processPendingCommits();
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
      sourceOfTruth: this.sourceOfTruth,
      hasChanges: this.hasChanges,
      lastCommittedHash: this.lastCommittedHash ? this.lastCommittedHash.substring(0, 8) : null,
      isDragging: this.isDragging,
      debounceActive: !!this.debounceTimeout
    };
  }
}

export { GitSyncEngine, SOURCE_OF_TRUTH }; 