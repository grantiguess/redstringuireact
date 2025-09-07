/**
 * Git Sync Engine - Implements the Git-Native Protocol's rapid synchronization pattern
 * Real-time local state + background persistence with 5-second auto-commits
 */

import { exportToRedstring } from '../formats/redstringFormat.js';

// Source of truth modes
const SOURCE_OF_TRUTH = {
  LOCAL: 'local',    // RedString file is authoritative 
  GIT: 'git'         // Git repository is authoritative (default)
};

class GitSyncEngine {
  constructor(provider, sourceOfTruth = SOURCE_OF_TRUTH.GIT, universeSlug = 'default', fileBaseName = 'universe', universeManager = null) {
    this.provider = provider;
    this.sourceOfTruth = sourceOfTruth; // Configurable source of truth
    this.universeSlug = (universeSlug || 'default').trim() || 'default';
    // Sanitize file base name to prevent URL encoding issues
    this.fileBaseName = (fileBaseName || 'universe')
      .replace(/\.redstring$/i, '')
      .replace(/[^a-zA-Z0-9-_]/g, '-') // Replace spaces and special chars with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
    this.universeManager = universeManager; // Optional reference to universe manager
    this.localState = new Map(); // Instant updates
    this.pendingCommits = []; // Queue of pending changes
    // Optimized auto-save settings based on authentication method
    this.isGitHubApp = provider.authMethod === 'github-app';
    this.commitInterval = this.isGitHubApp ? 20000 : 30000; // 20s for GitHub App, 30s for OAuth (rate limit friendly)
    this.autoSaveEnabled = this.isGitHubApp; // Enable optimized auto-save for GitHub App
    
    this.isRunning = false;
    this.lastCommitTime = 0;
    this.commitLoop = null;
    this.lastCommittedHash = null; // Hash of last committed state
    this.hasChanges = false; // Track if there are actual changes
    this.isCommitInProgress = false; // Prevent overlapping commits
    this.isPaused = false; // Allow external pausing of operations
    
    // Rate limiting and debouncing - optimized for GitHub free plan
    this.minCommitInterval = this.isGitHubApp ? 10000 : 15000; // 10s for GitHub App, 15s for OAuth
    this.debounceTimeout = null; // For debouncing rapid updates
    this.debounceDelay = 2000; // 2 second debounce for continuous operations
    this.isDragging = false; // Track if we're in a dragging operation
    this.dragStartTime = 0; // Track when dragging started
    
    // Error handling and recovery
    this.consecutiveErrors = 0; // Track consecutive failures
    this.maxConsecutiveErrors = 3; // Stop after 3 consecutive failures
    this.errorBackoffDelay = 10000; // 10 second backoff after max errors
    this.lastErrorTime = 0; // Track when last error occurred
    this.isInErrorBackoff = false; // Track if we're in error backoff mode
    this.persistentFailures = new Map(); // Track specific failure types
    
    // Optional UI status handler
    this.statusHandler = null;
    
    console.log('[GitSyncEngine] Initialized with provider:', provider.name);
    console.log('[GitSyncEngine] Authentication method:', this.isGitHubApp ? 'GitHub App' : 'OAuth');
    console.log('[GitSyncEngine] Auto-save optimized:', this.autoSaveEnabled);
    console.log('[GitSyncEngine] Commit interval:', this.commitInterval + 'ms');
    console.log('[GitSyncEngine] Source of truth:', this.sourceOfTruth);
    console.log('[GitSyncEngine] Universe slug:', this.universeSlug);
    console.log('[GitSyncEngine] Sanitized file base name:', this.fileBaseName);
    
    // Register with universe manager if provided
    if (this.universeManager) {
      // Check if there's already an engine for this universe
      const existingEngine = this.universeManager.getGitSyncEngine(this.universeSlug);
      if (existingEngine && existingEngine !== this) {
        console.warn('[GitSyncEngine] Stopping existing engine for universe:', this.universeSlug);
        existingEngine.stop();
      }
      this.universeManager.setGitSyncEngine(this.universeSlug, this);
    }
  }

  // Allow UI to subscribe to status updates
  onStatusChange(handler) {
    this.statusHandler = typeof handler === 'function' ? handler : null;
  }

  notifyStatus(type, status) {
    try {
      if (this.statusHandler) {
        // Rate limit error notifications to prevent spam
        if (type === 'error') {
          const now = Date.now();
          const timeSinceLastError = now - (this.lastErrorNotification || 0);
          
          // Only show error notifications every 5 seconds max
          if (timeSinceLastError < 5000) {
            return; // Skip this error notification
          }
          
          this.lastErrorNotification = now;
        }
        
        this.statusHandler({ type, status });
      }
    } catch (_) {}
  }

  getLatestPath() {
    return `universes/${this.universeSlug}/${this.fileBaseName}.redstring`;
  }

  // Backup paths removed for rate limit efficiency
  // getBackupPath() {
  //   const ts = new Date();
  //   const pad = (n) => String(n).padStart(2, '0');
  //   const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
  //   return `universes/${this.universeSlug}/backups/${this.fileBaseName}-${stamp}.redstring`;
  // }
  
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
      console.log('[GitSyncEngine] Git mode enabled - Git repository is source of truth');
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
    
    // GIT MODE: Git repository is source of truth (default)
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
    
    // Clear any pending debounce timeouts
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
      this.debounceTimeout = null;
    }
    
    console.log('[GitSyncEngine] Stopped commit loop');
  }
  
  /**
   * Restart the sync engine (recovery mechanism)
   */
  restart() {
    console.log('[GitSyncEngine] Restarting sync engine...');
    this.stop();
    
    // Reset error state
    this.consecutiveErrors = 0;
    this.isInErrorBackoff = false;
    this.lastErrorTime = 0;
    this.persistentFailures.clear();
    
    // Restart
    this.start();
    this.notifyStatus('info', 'Sync engine restarted');
  }
  
  /**
   * Pause operations (useful when UI is not visible)
   */
  pause() {
    this.isPaused = true;
    console.log('[GitSyncEngine] Operations paused');
  }
  
  /**
   * Resume operations
   */
  resume() {
    this.isPaused = false;
    console.log('[GitSyncEngine] Operations resumed');
  }
  
  /**
   * Check if sync engine is healthy
   */
  isHealthy() {
    return this.isRunning && !this.isInErrorBackoff && this.consecutiveErrors < this.maxConsecutiveErrors;
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
    
    // Check if operations are paused
    if (this.isPaused) {
      console.log('[GitSyncEngine] Operations paused, skipping commit');
      return;
    }
    
    const now = Date.now();
    const timeSinceLastCommit = now - this.lastCommitTime;
    const timeSinceLastError = now - this.lastErrorTime;
    
    // Check if we're in error backoff mode
    if (this.isInErrorBackoff && timeSinceLastError < this.errorBackoffDelay) {
      console.log('[GitSyncEngine] In error backoff mode, waiting...');
      return;
    }
    
    // Reset error backoff if enough time has passed
    if (this.isInErrorBackoff && timeSinceLastError >= this.errorBackoffDelay) {
      console.log('[GitSyncEngine] Error backoff period ended, resuming commits');
      this.isInErrorBackoff = false;
      this.consecutiveErrors = 0;
    }
    
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
      
      // Skip backup writes for rate limit efficiency - main file is sufficient
      // await this.provider.writeFileRaw(this.getBackupPath(), jsonString);
      
      // Update tracking
      this.lastCommittedHash = latestHash;
      this.hasChanges = false;
      this.pendingCommits = [];
      this.lastCommitTime = now;
      
      console.log(`[GitSyncEngine] Successfully committed changes to Git repository (${commitCount} updates batched)`);
      this.notifyStatus('success', `Committed ${commitCount} update${commitCount === 1 ? '' : 's'} to Git`);
      
      // Reset error tracking on successful commit
      this.consecutiveErrors = 0;
      this.isInErrorBackoff = false;
      
    } catch (error) {
      console.error('[GitSyncEngine] Failed to commit:', error);
      
      // Track consecutive errors for backoff
      this.consecutiveErrors++;
      this.lastErrorTime = Date.now();
      
      // Check if we've hit the maximum consecutive errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        console.warn(`[GitSyncEngine] ${this.consecutiveErrors} consecutive errors, entering backoff mode for ${this.errorBackoffDelay}ms`);
        this.isInErrorBackoff = true;
        this.notifyStatus('warning', `Too many errors, pausing sync for ${this.errorBackoffDelay / 1000}s`);
        
        // Clear pending commits to prevent infinite retry loops
        this.pendingCommits = [];
        this.hasChanges = false;
      } else {
        // Normal error handling
        this.notifyStatus('error', `Commit failed: ${error.message || 'Unknown error'}`);
        
        // Check if it's a 409 conflict (file modified since last read)
        if (error.message && error.message.includes('409')) {
          console.log('[GitSyncEngine] 409 conflict detected, will retry on next cycle');
          // Keep the commits for retry, but add a delay to avoid rapid retries
          this.lastCommitTime = Date.now() - (this.minCommitInterval - 2000); // Allow retry in 2 seconds
        } else {
          // For other errors, limit the queue size to prevent memory issues
          if (this.pendingCommits.length > 20) {
            console.warn('[GitSyncEngine] Too many pending commits, keeping only latest 10');
            this.pendingCommits = this.pendingCommits.slice(-10);
          }
        }
      }
    } finally {
      this.isCommitInProgress = false;
    }
  }
  
  /**
   * Force an immediate commit with enhanced conflict resolution
   * This is an overwriter - it ALWAYS commits regardless of detected changes
   */
  async forceCommit(storeState) {
    try {
      console.log('[GitSyncEngine] Force committing (overwriter mode - always commits)...');
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
      
      // OVERWRITER MODE: Always commit, regardless of changes detection
      console.log('[GitSyncEngine] Overwriter mode: forcing commit regardless of change detection');
      
      // Try up to 3 times with fresh SHA fetches
      let lastError = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await this.provider.writeFileRaw(this.getLatestPath(), jsonString);
          
          // Success! Update tracking
          const currentHash = this.generateStateHash(storeState);
          this.lastCommittedHash = currentHash;
          this.hasChanges = false;
          this.pendingCommits = []; // Clear pending commits
          this.lastCommitTime = Date.now();
          
          // Reset error tracking on successful force commit
          this.consecutiveErrors = 0;
          this.isInErrorBackoff = false;
          
          console.log('[GitSyncEngine] Force commit successful (overwriter mode)');
          this.notifyStatus('success', 'Force commit successful');
          return true;
          
        } catch (error) {
          lastError = error;
          if (error.message && error.message.includes('409') && attempt < 3) {
            console.log(`[GitSyncEngine] Force commit attempt ${attempt} got 409, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Increasing delay
            continue;
          } else {
            break; // Non-409 error or final attempt
          }
        }
      }
      
      // All attempts failed
      console.error('[GitSyncEngine] Force commit failed after retries:', lastError);
      this.notifyStatus('error', `Force commit failed: ${lastError.message || 'Unknown error'}`);
      throw lastError;
      
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
      isPaused: this.isPaused,
      pendingCommits: this.pendingCommits.length,
      lastCommitTime: this.lastCommitTime,
      provider: this.provider.name,
      sourceOfTruth: this.sourceOfTruth,
      hasChanges: this.hasChanges,
      lastCommittedHash: this.lastCommittedHash ? this.lastCommittedHash.substring(0, 8) : null,
      isDragging: this.isDragging,
      debounceActive: !!this.debounceTimeout,
      // Error tracking
      consecutiveErrors: this.consecutiveErrors,
      isInErrorBackoff: this.isInErrorBackoff,
      isHealthy: this.isHealthy(),
      lastErrorTime: this.lastErrorTime
    };
  }
}

export { GitSyncEngine, SOURCE_OF_TRUTH }; 