/**
 * Universe Backend Service
 *
 * This is the TRUE backend for universe management that should run independently
 * of any UI components. All universe operations should go through this service.
 *
 * The UI (GitNativeFederation.jsx) should ONLY display data and call these methods.
 */

// Defer universeManager import to avoid circular dependencies
let universeManager = null;
import { GitSyncEngine } from '../backend/sync/index.js';
import { persistentAuth } from '../backend/auth/index.js';
import { SemanticProviderFactory } from '../backend/git/index.js';
import startupCoordinator from './startupCoordinator.js';
import { exportToRedstring, importFromRedstring, downloadRedstringFile } from '../formats/redstringFormat.js';
import {
  storeFileHandleMetadata,
  getFileHandleMetadata,
  touchFileHandle,
  removeFileHandleMetadata
} from './fileHandlePersistence.js';

class UniverseBackend {
  constructor() {
    this.gitSyncEngines = new Map(); // slug -> GitSyncEngine
    this.statusHandlers = new Set();
    this.isInitialized = false;
    this.initializationPromise = null;
    this.autoSetupScheduled = false;
    this.authStatus = null;
    this.loggedMergeWarning = false; // Prevent log spam from merge conflicts
    this.fileHandles = new Map(); // slug -> FileSystemFileHandle (session-scoped)

    // Git operation tracking for dashboard
    this.gitOperationStatus = new Map(); // universeSlug -> detailed status
    this.globalGitStatus = {
      isConnected: false,
      lastConnection: null,
      totalUniverses: 0,
      syncedUniverses: 0,
      pendingOperations: 0,
      lastGlobalSync: null
    };

    // Don't auto-initialize on construction to avoid circular dependencies
    // Initialization will happen on first method call
  }

  /**
   * Initialize the backend service
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('[UniverseBackend] Backend already initialized, skipping...');
      return;
    }

    if (this.initializationPromise) {
      console.log('[UniverseBackend] Initialization already in progress, waiting...');
      return this.initializationPromise;
    }

    this.initializationPromise = this._doInitialize();
    try {
      await this.initializationPromise;
    } finally {
      this.initializationPromise = null;
    }
  }

  async _doInitialize() {
    console.log('[UniverseBackend] Initializing backend service...');

    try {
      // Load universeManager first to avoid circular dependencies
      if (!universeManager) {
        console.log('[UniverseBackend] Loading universeManager...');
        const module = await import('../backend/universes/index.js');
        universeManager = module.default || module.universeManager;
        console.log('[UniverseBackend] UniverseManager loaded successfully');
      }

      console.log('[UniverseBackend] Getting authentication status...');
      this.authStatus = persistentAuth.getAuthStatus();

      console.log('[UniverseBackend] Setting up store operations...');
      await this.setupStoreOperations();

      console.log('[UniverseBackend] Setting up event listeners...');
      this.setupUniverseManagerEvents();
      this.setupAuthEvents();

      console.log('[UniverseBackend] Initializing background sync (auth + active universe)...');
      console.log('[UniverseBackend] About to call universeManager.initializeBackgroundSync()...');
      const syncStartTime = Date.now();

      // Add timeout to prevent hanging
      try {
        await Promise.race([
          universeManager.initializeBackgroundSync(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Background sync timeout after 8s')), 8000)
          )
        ]);
        const syncEndTime = Date.now();
        console.log(`[UniverseBackend] Background sync completed in ${syncEndTime - syncStartTime}ms`);
      } catch (error) {
        console.warn('[UniverseBackend] Background sync failed or timed out:', error.message);
        console.log('[UniverseBackend] Continuing with backend initialization...');
      }

      console.log('[UniverseBackend] Skipping auto-setup of ALL existing universes to avoid hanging...');
      // await this.autoSetupExistingUniverses(); // DISABLED - can hang during initialization

      // CRITICAL: Load active universe data into store
      const activeUniverse = universeManager.getActiveUniverse();
      if (activeUniverse) {
        console.log(`[UniverseBackend] Loading active universe into store: ${activeUniverse.name || activeUniverse.slug}`);
        try {
          // Try to load (will fall back to browser storage if Git fails due to auth)
          const storeState = await universeManager.loadUniverseData(activeUniverse);
          if (storeState && this.storeOperations?.loadUniverseFromFile) {
            const success = this.storeOperations.loadUniverseFromFile(storeState);
            if (success) {
              const loadedState = this.storeOperations.getState();
              const nodeCount = loadedState?.nodePrototypes ? (loadedState.nodePrototypes instanceof Map ? loadedState.nodePrototypes.size : Object.keys(loadedState.nodePrototypes).length) : 0;
              const graphCount = loadedState?.graphs ? (loadedState.graphs instanceof Map ? loadedState.graphs.size : Object.keys(loadedState.graphs).length) : 0;
              
              console.log(`[UniverseBackend] Active universe loaded: ${nodeCount} nodes, ${graphCount} graphs`);
              
              // Check if we loaded from cache due to missing auth
              const authStatus = this.getAuthStatus();
              if (!authStatus?.isAuthenticated && activeUniverse.gitRepo?.enabled) {
                this.notifyStatus('info', `Loaded ${activeUniverse.name} from cache. Connect GitHub to sync latest.`);
              } else {
                this.notifyStatus('success', `Loaded ${activeUniverse.name}: ${nodeCount} nodes, ${graphCount} graphs`);
              }
            } else {
              console.warn('[UniverseBackend] Failed to load active universe into store');
            }
          }
        } catch (error) {
          console.warn('[UniverseBackend] Failed to load active universe data:', error);
        }
      } else {
        console.log('[UniverseBackend] No active universe to load');
      }

      this.isInitialized = true;
      this.notifyStatus('info', 'Universe backend initialized');

      console.log('[UniverseBackend] Backend service initialized successfully');

      // After successful init, attempt to auto-setup sync engine for the active universe (non-blocking)
      // Only do this once, avoid duplicate engine creation
      if (!this.autoSetupScheduled) {
        this.autoSetupScheduled = true;
        try {
          setTimeout(() => {
            this.autoSetupEnginesForActiveUniverse().catch(err => {
              console.warn('[UniverseBackend] Auto-setup for active universe failed:', err?.message || err);
            });
          }, 150);
        } catch (_) {}
      }
    } catch (error) {
      console.error('[UniverseBackend] Failed to initialize backend:', error);
      this.notifyStatus('error', `Backend initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set up store operations for universeManager to avoid circular dependencies
   */
  async setupStoreOperations() {
    let retryCount = 0;
    const maxRetries = 3;
    
    while (retryCount < maxRetries) {
      try {
        // Dynamically import graphStore from backend (outside the circular dependency)
        const { default: useGraphStore } = await import('../store/graphStore.jsx');

        // Validate that the store is properly initialized
        const testState = useGraphStore.getState();
        if (!testState || typeof testState.loadUniverseFromFile !== 'function') {
          throw new Error('GraphStore not properly initialized - missing loadUniverseFromFile method');
        }

        this.storeOperations = {
          getState: () => useGraphStore.getState(),
          loadUniverseFromFile: (storeState) => {
            try {
              const store = useGraphStore.getState();
              console.log('[UniverseBackend] Loading universe data into store:', {
                hasStoreState: !!storeState,
                storeStateType: typeof storeState,
                hasGraphs: storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0,
                hasNodes: storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0
              });
              
              store.loadUniverseFromFile(storeState);
              console.log('[UniverseBackend] Successfully loaded universe data into store');
              return true;
            } catch (error) {
              console.error('[UniverseBackend] Failed to load universe data into store:', error);
              this.notifyStatus('error', `Failed to load universe data: ${error.message}`);
              throw error;
            }
          }
        };

        universeManager.setStoreOperations(this.storeOperations);
        console.log('[UniverseBackend] Store operations set up successfully for universeManager and backend');
        return; // Success, exit retry loop
        
      } catch (error) {
        retryCount++;
        console.warn(`[UniverseBackend] Failed to set up store operations (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          console.error('[UniverseBackend] CRITICAL: Failed to set up store operations after all retries. Universe data loading will not work properly.');
          this.notifyStatus('error', 'Critical system error: Store operations failed to initialize');
          // Don't throw here - let the system continue but mark as degraded
          this.storeOperations = null;
          return;
        }
        
        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }
  }

  /**
   * Set up UniverseManager event listeners
   */
  setupUniverseManagerEvents() {
    universeManager.onStatusChange((status) => {
      this.notifyStatus(status.type, status.status);

      // DISABLED: Auto-setup is causing infinite loops
      // TODO: Need to implement proper debouncing or more specific triggers
      // if (status.type === 'universe-switched' || status.type === 'universe-created') {
      //   console.log('[UniverseBackend] Triggering auto-setup for meaningful status change:', status.type);
      //   this.autoSetupEnginesForActiveUniverse();
      // }
    });
  }

  /**
   * Set up authentication event listeners
   */
  setupAuthEvents() {
    // Listen for auth changes and update status
    if (typeof window !== 'undefined') {
      let lastAuthProcessTime = 0;
      const authDebounceDelay = 5000; // 5 second debounce to prevent rapid auth processing

      window.addEventListener('redstring:auth-token-stored', async () => {
        const now = Date.now();

        // Debounce auth processing to prevent infinite loops
        if (now - lastAuthProcessTime < authDebounceDelay) {
          console.log('[UniverseBackend] Auth event debounced - too recent');
          return;
        }
        lastAuthProcessTime = now;

        this.authStatus = persistentAuth.getAuthStatus();
        this.notifyStatus('success', 'Authentication updated');

        // CRITICAL: Reload active universe from Git now that auth is ready
        const activeUniverse = universeManager.getActiveUniverse();
        if (activeUniverse?.gitRepo?.enabled) {
          console.log('[UniverseBackend] Auth connected, checking Git for latest data...');
          try {
            // Get current store state before loading
            const currentState = this.storeOperations?.getState();
            const currentNodeCount = currentState?.nodePrototypes ? (currentState.nodePrototypes instanceof Map ? currentState.nodePrototypes.size : Object.keys(currentState.nodePrototypes).length) : 0;
            const currentGraphCount = currentState?.graphs ? (currentState.graphs instanceof Map ? currentState.graphs.size : Object.keys(currentState.graphs).length) : 0;

            const storeState = await universeManager.loadUniverseData(activeUniverse);
            if (storeState && this.storeOperations?.loadUniverseFromFile) {
              // Count what Git has
              const gitNodeCount = storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes || {}).length) : 0;
              const gitGraphCount = storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs || {}).length) : 0;

              // Smart merge: don't overwrite local work with empty Git data
              if (gitNodeCount === 0 && gitGraphCount === 0 && (currentNodeCount > 0 || currentGraphCount > 0)) {
                // Only log this warning once per session to avoid spam
                if (!this.loggedMergeWarning) {
                  console.warn(`[UniverseBackend] Git has no data, but you have ${currentNodeCount} nodes and ${currentGraphCount} graphs locally`);
                  this.notifyStatus('warning', `Using browser storage backup (${currentNodeCount} nodes). Push to Git to sync.`);
                  this.loggedMergeWarning = true;
                }
                // Don't overwrite! User's local work is preserved
              } else {
                // Git has data or both are empty - safe to load
                this.storeOperations.loadUniverseFromFile(storeState);
                const loadedState = this.storeOperations.getState();
                const nodeCount = loadedState?.nodePrototypes ? (loadedState.nodePrototypes instanceof Map ? loadedState.nodePrototypes.size : Object.keys(loadedState.nodePrototypes).length) : 0;
                console.log(`[UniverseBackend] Reloaded from Git after auth: ${nodeCount} nodes`);

                if (nodeCount === 0) {
                  this.notifyStatus('info', `Connected to GitHub. Universe is empty - create some nodes!`);
                } else {
                  this.notifyStatus('success', `Synced ${activeUniverse.name} from GitHub (${nodeCount} nodes)`);
                }
              }
            }
          } catch (error) {
            console.warn('[UniverseBackend] Failed to reload from Git after auth:', error);
          }
        }

        // DISABLED: Set up sync engines - causing infinite loops
        // this.autoSetupEnginesForActiveUniverse();
      });
    }
  }

  /**
   * Auto-setup Git sync engines for existing universes
   */
  async autoSetupExistingUniverses() {
    // Check if authentication is ready before attempting Git sync setup
    const authStatus = this.getAuthStatus();
    if (!authStatus?.isAuthenticated) {
      console.log('[UniverseBackend] Skipping auto-setup for existing universes: authentication not ready');
      return;
    }

    const universes = universeManager.getAllUniverses();

    for (const universe of universes) {
      if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
        try {
          await this.ensureGitSyncEngine(universe.slug);
        } catch (error) {
          // Don't block initialization if one universe fails
          console.warn(`[UniverseBackend] Failed to setup engine for ${universe.slug}:`, error.message);
        }
      }
    }
  }

  /**
   * Auto-setup engine for currently active universe
   */
  async autoSetupEnginesForActiveUniverse() {
    // Check if authentication is ready before attempting Git sync setup
    const authStatus = this.getAuthStatus();
    if (!authStatus?.isAuthenticated) {
      console.log('[UniverseBackend] Skipping auto-setup: authentication not ready');
      return;
    }

    const activeUniverse = universeManager.getActiveUniverse();
    if (activeUniverse?.gitRepo?.enabled && activeUniverse?.gitRepo?.linkedRepo) {
      try {
        console.log('[UniverseBackend] Auto-setting up Git sync for active universe:', activeUniverse.slug);
        await this.ensureGitSyncEngine(activeUniverse.slug);
      } catch (error) {
        // Don't throw - just log and continue. User can manually retry.
        console.warn(`[UniverseBackend] Failed to auto-setup engine for active universe:`, error.message);
        // Notify user but don't block
        this.notifyStatus('warning', `Git sync setup skipped: ${error.message}. You can enable it manually.`);
      }
    }
  }

  /**
   * Ensure a Git sync engine exists for a universe
   */
  async ensureGitSyncEngine(universeSlug) {
    console.log(`[UniverseBackend] Ensuring Git sync engine for universe: ${universeSlug}`);
    
    // Check if engine already exists and is healthy
    if (this.gitSyncEngines.has(universeSlug)) {
      const existingEngine = this.gitSyncEngines.get(universeSlug);
      if (existingEngine && existingEngine.provider) {
        console.log(`[UniverseBackend] Using existing healthy engine for ${universeSlug}`);
        return existingEngine;
      } else {
        console.log(`[UniverseBackend] Existing engine for ${universeSlug} is unhealthy, removing`);
        this.gitSyncEngines.delete(universeSlug);
      }
    }

    // Check if UniverseManager already has one
    const existingEngine = universeManager.getGitSyncEngine(universeSlug);
    if (existingEngine && existingEngine.provider) {
      console.log(`[UniverseBackend] Adopting existing engine from UniverseManager for ${universeSlug}`);
      this.gitSyncEngines.set(universeSlug, existingEngine);
      return existingEngine;
    }

    const universe = universeManager.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }
    
    if (!universe?.gitRepo?.enabled) {
      throw new Error(`Universe ${universeSlug} does not have Git repo enabled`);
    }
    
    if (!universe?.gitRepo?.linkedRepo) {
      throw new Error(`Universe ${universeSlug} does not have a linked repository`);
    }

    console.log(`[UniverseBackend] Creating new Git sync engine for ${universeSlug}`, {
      linkedRepo: universe.gitRepo.linkedRepo,
      sourceOfTruth: universe.sourceOfTruth,
      schemaPath: universe.gitRepo.schemaPath
    });

    // Create provider with validation
    let provider;
    try {
      provider = await this.createProviderForUniverse(universe);
      if (!provider) {
        throw new Error(`Failed to create provider for universe ${universeSlug}`);
      }
      
      // Test provider availability with retry logic for transient network errors
      let isAvailable = false;
      let lastError = null;
      
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          isAvailable = await provider.isAvailable();
          if (isAvailable) break;
          
          // If not available but no error, wait and retry
          if (attempt < 3) {
            console.log(`[UniverseBackend] Provider check attempt ${attempt} returned false, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        } catch (error) {
          lastError = error;
          // Network errors are often transient, retry
          if (error.message?.includes('network') || error.message?.includes('fetch') || attempt < 3) {
            console.log(`[UniverseBackend] Provider check attempt ${attempt} failed (${error.message}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          throw error;
        }
      }
      
      if (!isAvailable) {
        throw new Error(`Provider for ${universeSlug} is not available after 3 attempts - check authentication and repository access${lastError ? `: ${lastError.message}` : ''}`);
      }
      
      console.log(`[UniverseBackend] Provider created and validated for ${universeSlug}`);
    } catch (error) {
      console.error(`[UniverseBackend] Failed to create/validate provider for ${universeSlug}:`, error);
      this.notifyStatus('error', `Git sync setup failed: ${error.message}`);
      throw error;
    }

    // Create and configure engine
    const sourceOfTruth = universe.sourceOfTruth || 'git';
    const fileName = universe.gitRepo.universeFile || `${universeSlug}.redstring`;
    const engine = new GitSyncEngine(provider, sourceOfTruth, universeSlug, fileName, universeManager);

    // Set up event handlers
    engine.onStatusChange((status) => {
      const universeName = universe.name || universeSlug;
      this.notifyStatus(status.type, `${universeName}: ${status.status}`);
    });

    // Register engine
    this.gitSyncEngines.set(universeSlug, engine);
    universeManager.setGitSyncEngine(universeSlug, engine);

    // Start engine
    try {
      engine.start();
      console.log(`[UniverseBackend] Git sync engine started for universe: ${universeSlug}`);
      this.notifyStatus('success', `Git sync enabled for ${universe.name || universeSlug}`);
      
      // Initialize SaveCoordinator with the Git sync engine for autosave
      try {
        const { saveCoordinator } = await import('../backend/sync/index.js');
        if (saveCoordinator && !saveCoordinator.isEnabled) {
          // Import fileStorage for local saves
          const fileStorage = await import('../store/fileStorage.js');
          saveCoordinator.initialize(fileStorage, engine, universeManager);
          console.log(`[UniverseBackend] SaveCoordinator initialized for autosave on ${universeSlug}`);
        } else if (saveCoordinator && saveCoordinator.gitSyncEngine !== engine) {
          // Update the engine reference if SaveCoordinator was already initialized with a different engine
          saveCoordinator.gitSyncEngine = engine;
          console.log(`[UniverseBackend] SaveCoordinator updated with new engine for ${universeSlug}`);
        }
      } catch (saveCoordError) {
        console.warn(`[UniverseBackend] Failed to initialize SaveCoordinator:`, saveCoordError);
        // Non-fatal - manual saves will still work
      }
    } catch (startError) {
      console.error(`[UniverseBackend] Failed to start engine for ${universeSlug}:`, startError);
      this.notifyStatus('error', `Failed to start Git sync: ${startError.message}`);
      throw startError;
    }

    return engine;
  }

  /**
   * Create a Git provider for a universe
   */
  async createProviderForUniverse(universe) {
    const linkedRepo = universe.gitRepo.linkedRepo;
    let user, repo;

    if (typeof linkedRepo === 'string') {
      const parts = linkedRepo.split('/');
      user = parts[0];
      repo = parts[1];
    } else if (linkedRepo && typeof linkedRepo === 'object') {
      user = linkedRepo.user;
      repo = linkedRepo.repo;
    }

    if (!user || !repo) {
      throw new Error('Invalid repository configuration');
    }

    // Get authentication with better error handling
    let token, authMethod, installationId;
    
    try {
      // Try GitHub App first (preferred)
      const app = persistentAuth.getAppInstallation?.();
      if (app?.installationId) {
        // Check if cached token is still valid (expires in 1 hour, refresh if < 5 min remaining)
        const tokenExpiresAt = app.tokenExpiresAt ? new Date(app.tokenExpiresAt) : null;
        const now = new Date();
        const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
        const needsRefresh = !app.accessToken || !tokenExpiresAt || tokenExpiresAt < fiveMinutesFromNow;
        
        if (needsRefresh) {
          console.log('[UniverseBackend] Refreshing GitHub App token...');
          const { oauthFetch } = await import('./bridgeConfig.js');
          const tokenResp = await oauthFetch('/api/github/app/installation-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installation_id: app.installationId })
          });
          
          if (tokenResp.ok) {
            const tokenData = await tokenResp.json();
            token = tokenData.token;
            authMethod = 'github-app';
            installationId = app.installationId;
            
            // Calculate expiry time (1 hour from now)
            const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
            
            // Update stored installation with fresh token and expiry
            const updatedApp = { ...app, accessToken: token, tokenExpiresAt: expiresAt.toISOString() };
            persistentAuth.storeAppInstallation(updatedApp);
            console.log('[UniverseBackend] GitHub App token refreshed');
          } else {
            const errorText = await tokenResp.text();
            console.warn(`[UniverseBackend] Failed to get GitHub App token (${tokenResp.status}), falling back to OAuth`);
          }
        } else {
          // Use cached token (no log spam)
          token = app.accessToken;
          authMethod = 'github-app';
          installationId = app.installationId;
        }
      }
      
      // Fallback to OAuth if GitHub App failed
      if (!token) {
        console.log(`[UniverseBackend] Using OAuth authentication for ${user}/${repo}`);
        token = await persistentAuth.getAccessToken();
        authMethod = 'oauth';
        
        if (!token) {
          throw new Error('No valid authentication token available');
        }
      }
    } catch (error) {
      console.error('[UniverseBackend] Authentication failed:', error);
      throw new Error(`Authentication required for Git operations: ${error.message}`);
    }

    if (!token) {
      throw new Error('No valid authentication token available');
    }

    const providerConfig = {
      type: 'github',
      user,
      repo,
      token,
      authMethod,
      semanticPath: universe.gitRepo.schemaPath || 'schema'
    };
    
    if (installationId) {
      providerConfig.installationId = installationId;
    }

    return SemanticProviderFactory.createProvider(providerConfig);
  }

  /**
   * Get Git sync engine for a universe
   */
  getGitSyncEngine(universeSlug) {
    return this.gitSyncEngines.get(universeSlug);
  }

  /**
   * Stop and remove Git sync engine for a universe
   */
  async removeGitSyncEngine(universeSlug) {
    const engine = this.gitSyncEngines.get(universeSlug);
    if (engine) {
      engine.stop();
      this.gitSyncEngines.delete(universeSlug);
      console.log(`[UniverseBackend] Removed Git sync engine for universe: ${universeSlug}`);
    }
  }

  /**
   * Discover universes in a repository
   */
  async discoverUniversesInRepository(repoConfig) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return universeManager.discoverUniversesInRepository(repoConfig);
  }

  /**
   * Link to a discovered universe
   */
  async linkToDiscoveredUniverse(discoveredUniverse, repoConfig) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    const slug = await universeManager.linkToDiscoveredUniverse(discoveredUniverse, repoConfig);

    // Auto-setup Git sync engine for the new universe
    try {
      await this.ensureGitSyncEngine(slug);
    } catch (error) {
      console.warn(`[UniverseBackend] Failed to setup engine for new universe ${slug}:`, error);
    }

    return slug;
  }

  /**
   * Switch active universe
   */
  async switchActiveUniverse(slug, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log(`[UniverseBackend] Switching to universe: ${slug}`);
    const result = await universeManager.switchActiveUniverse(slug, options);

    // CRITICAL: Load the new universe data into the graph store
    if (result?.storeState) {
      if (this.storeOperations?.loadUniverseFromFile) {
        console.log('[UniverseBackend] Loading new universe data into graph store...');
        try {
          const success = this.storeOperations.loadUniverseFromFile(result.storeState);
          if (success) {
            // Validate that data was actually loaded
            const storeState = this.storeOperations.getState();
            const nodeCount = storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0;
            const graphCount = storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0;
            
            console.log('[UniverseBackend] Successfully loaded universe data into graph store:', {
              nodeCount,
              graphCount,
              isUniverseLoaded: storeState?.isUniverseLoaded,
              hasUniverseFile: storeState?.hasUniverseFile
            });
            
            const universeName = result.universe?.name || slug;
            if (nodeCount > 0 || graphCount > 0) {
              this.notifyStatus('success', `Loaded ${universeName}: ${nodeCount} nodes, ${graphCount} graphs`);
            } else {
              this.notifyStatus('info', `Switched to empty universe: ${universeName}`);
            }
          } else {
            throw new Error('Store loading returned false');
          }
        } catch (error) {
          console.error('[UniverseBackend] Failed to load universe data into graph store:', error);
          this.notifyStatus('error', `Failed to load universe data: ${error.message}`);
          throw error; // Re-throw to surface the error to UI
        }
      } else {
        console.error('[UniverseBackend] CRITICAL: Cannot load universe data - store operations not available');
        this.notifyStatus('error', 'Critical error: Store operations not initialized. Please refresh the page.');
        
        // Try to re-setup store operations
        try {
          await this.setupStoreOperations();
          if (this.storeOperations?.loadUniverseFromFile) {
            console.log('[UniverseBackend] Store operations recovered, retrying data load...');
            this.storeOperations.loadUniverseFromFile(result.storeState);
            this.notifyStatus('success', `Universe switched after recovery: ${result.universe?.name || slug}`);
          }
        } catch (recoveryError) {
          console.error('[UniverseBackend] Failed to recover store operations:', recoveryError);
          throw new Error(`Universe data loading failed: Store operations unavailable. Please refresh the page.`);
        }
      }
    } else {
      console.warn('[UniverseBackend] No storeState returned from universe switch - universe may be empty');
      this.notifyStatus('info', `Switched to empty universe: ${slug}`);
    }

    // Ensure engine is set up for the new active universe if Git is enabled (but don't block on it)
    const switchedUniverse = universeManager.getUniverse(slug);
    if (switchedUniverse?.gitRepo?.enabled && switchedUniverse?.gitRepo?.linkedRepo) {
      setTimeout(() => {
        this.ensureGitSyncEngine(slug).catch(error => {
          console.warn(`[UniverseBackend] Failed to setup engine after universe switch:`, error);
        });
      }, 100);
    }

    return result;
  }

  /**
   * Save active universe
   */
  async saveActiveUniverse(storeState = null) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Get current store state if not provided
    if (!storeState && this.storeOperations?.getState) {
      storeState = this.storeOperations.getState();
    }
    
    console.log('[UniverseBackend] Saving active universe with store state:', {
      hasStoreState: !!storeState,
      hasGraphs: storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0,
      hasNodes: storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0
    });
    
    try {
      const result = await universeManager.saveActiveUniverse(storeState);
      this.notifyStatus('success', 'Universe saved successfully');
      return result;
    } catch (error) {
      console.error('[UniverseBackend] Failed to save active universe:', error);
      this.notifyStatus('error', `Save failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reload active universe
   */
  async reloadActiveUniverse() {
    return universeManager.reloadActiveUniverse();
  }

  /**
   * Get all universes
   */
  getAllUniverses() {
    try {
      if (!universeManager) {
        console.warn('[UniverseBackend] universeManager not loaded yet, returning empty array');
        return [];
      }
      const universes = universeManager.getAllUniverses();
      return universes;
    } catch (error) {
      console.error('[UniverseBackend] getAllUniverses failed with error:', error);
      console.error('[UniverseBackend] Error stack:', error.stack);
      console.warn('[UniverseBackend] Returning empty array as fallback');
      return [];
    }
  }

  /**
   * Get active universe
   */
  getActiveUniverse() {
    try {
      return universeManager.getActiveUniverse();
    } catch (error) {
      console.warn('[UniverseBackend] getActiveUniverse failed:', error);
      return null;
    }
  }

  /**
   * Create new universe
   */
  async createUniverse(name, options = {}) {
    console.log(`[UniverseBackend] createUniverse called with name: "${name}", options:`, options);

    try {
      if (!this.isInitialized) {
        console.log('[UniverseBackend] Backend not initialized, initializing now...');
        await this.initialize();
        console.log('[UniverseBackend] Backend initialization completed');
      }
    } catch (error) {
      console.warn('[UniverseBackend] Initialization failed, continuing anyway:', error);
    }

    console.log('[UniverseBackend] Creating universe via universeManager...');
    const universe = universeManager.createUniverse(name, options);
    console.log('[UniverseBackend] Universe created:', universe.slug);

    // Set as active universe and ensure store is updated
    try {
      console.log('[UniverseBackend] Setting new universe as active...');
      universeManager.setActiveUniverse(universe.slug);

      // Ensure the graph store is properly initialized with empty state
      if (this.storeOperations?.loadUniverseFromFile) {
        const emptyState = universeManager.createEmptyState();
        this.storeOperations.loadUniverseFromFile(emptyState);
        console.log('[UniverseBackend] Graph store initialized with empty state for new active universe');
      }
    } catch (error) {
      console.warn('[UniverseBackend] Failed to activate new universe:', error);
    }

    // Auto-setup engine if Git is enabled
    if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
      console.log('[UniverseBackend] Scheduling async Git sync engine setup...');
      setTimeout(() => {
        this.ensureGitSyncEngine(universe.slug).catch(error => {
          console.warn(`[UniverseBackend] Failed to auto-setup engine for new universe:`, error);
        });
      }, 100);
    }

    console.log('[UniverseBackend] createUniverse completed successfully, returning universe');
    return universe;
  }

  /**
   * Delete universe
   */
  deleteUniverse(slug) {
    if (!this.isInitialized) {
      this.initialize();
    }
    // Remove engine first
    this.removeGitSyncEngine(slug);

    // Delete from manager
    universeManager.deleteUniverse(slug);
  }

  /**
   * Update universe
   */
  async updateUniverse(slug, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log(`[UniverseBackend] Updating universe ${slug}:`, updates);
    const result = universeManager.updateUniverse(slug, updates);
    
    // Get universe for potential use below
    const universe = universeManager.getUniverse(slug);
    
    // If Git repo was enabled or linked repo was updated, ensure sync engine is set up
    if (updates.gitRepo) {
      if (universe?.gitRepo?.enabled && universe?.gitRepo?.linkedRepo) {
        console.log(`[UniverseBackend] Git repo updated for ${slug}, ensuring sync engine is set up`);
        setTimeout(() => {
          this.ensureGitSyncEngine(slug).catch(error => {
            console.warn(`[UniverseBackend] Failed to setup engine after repo update:`, error);
            this.notifyStatus('warning', `Git sync setup failed: ${error.message}`);
          });
        }, 100);
      } else if (updates.gitRepo.enabled === false) {
        // Git was disabled, remove the engine
        console.log(`[UniverseBackend] Git disabled for ${slug}, removing sync engine`);
        this.removeGitSyncEngine(slug);
      }
    }
    
    // If sources were updated, notify about the change
    if (updates.sources) {
      this.notifyStatus('info', `Data sources updated for universe: ${universe?.name || slug}`);
    }
    
    return result;
  }

  /**
   * Get authentication status
   */
  getAuthStatus() {
    if (!this.isInitialized) {
      this.initialize();
    }
    return this.authStatus || persistentAuth.getAuthStatus();
  }

  /**
   * Get sync engine status for a universe
   */
  getSyncStatus(universeSlug) {
    const engine = this.gitSyncEngines.get(universeSlug);
    return engine ? engine.getStatus() : null;
  }

  /**
   * Force save for a universe
   */
  async forceSave(universeSlug, storeState) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Use active universe if no slug provided
    if (!universeSlug) {
      const activeUniverse = this.getActiveUniverse();
      universeSlug = activeUniverse?.slug;
      if (!universeSlug) {
        throw new Error('No active universe to save');
      }
    }
    
    // Get store state if not provided
    if (!storeState && this.storeOperations?.getState) {
      storeState = this.storeOperations.getState();
    }
    
    if (!storeState) {
      throw new Error('No store state available for saving');
    }
    
    console.log(`[UniverseBackend] Force saving universe ${universeSlug}`);

    // Track operation start
    this.trackGitOperationStart(universeSlug, 'force-save', {
      isConnected: !!this.authStatus?.isAuthenticated,
      hasUnsavedChanges: true
    });

    try {
      // Ensure Git sync engine exists
      let engine = this.gitSyncEngines.get(universeSlug);
      if (!engine) {
        try {
          console.log(`[UniverseBackend] No engine found for ${universeSlug}, creating one for force save`);
          engine = await this.ensureGitSyncEngine(universeSlug);
        } catch (error) {
          console.error(`[UniverseBackend] Failed to create engine for force save:`, error);
          // Track failure and fallback
          this.trackGitOperationComplete(universeSlug, 'force-save', false, {
            error: `Engine creation failed: ${error.message}`,
            fallbackUsed: true
          });
          // Fallback to regular save through universe manager
          console.log(`[UniverseBackend] Falling back to universe manager save`);
          return await this.saveActiveUniverse(storeState);
        }
      }

      if (engine) {
        const result = await engine.forceCommit(storeState);

        // Track successful completion
        this.trackGitOperationComplete(universeSlug, 'force-save', true, {
          commitHash: result?.commitHash,
          bytesWritten: result?.bytesWritten,
          fileName: `universes/${universeSlug}/${universeSlug}.redstring`
        });

        this.notifyStatus('success', `Force save completed for ${universeSlug}`);
        return result;
      }

      throw new Error(`No Git sync engine available for universe: ${universeSlug}`);
    } catch (error) {
      // Track failure
      this.trackGitOperationComplete(universeSlug, 'force-save', false, {
        error: error.message
      });

      console.error(`[UniverseBackend] Force save failed for ${universeSlug}:`, error);
      this.notifyStatus('error', `Force save failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Reload universe from its source of truth
   */
  async reloadUniverse(universeSlug) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    console.log(`[UniverseBackend] Reloading universe: ${universeSlug}`);
    
    const universe = universeManager.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }
    
    // Determine the source of truth
    const sourceOfTruth = universe.sourceOfTruth || 'browser';
    console.log(`[UniverseBackend] Reloading from source of truth: ${sourceOfTruth}`);
    
    try {
      // Use universeManager's loadUniverseData method which handles all sources
      const data = await universeManager.loadUniverseData(universe);
      
      if (data && this.storeOperations?.loadState) {
        console.log(`[UniverseBackend] Loading universe data into store:`, {
          nodeCount: data.nodePrototypes ? (data.nodePrototypes instanceof Map ? data.nodePrototypes.size : Object.keys(data.nodePrototypes).length) : 0,
          graphCount: data.graphs ? (data.graphs instanceof Map ? data.graphs.size : Object.keys(data.graphs).length) : 0
        });
        await this.storeOperations.loadState(data);
        console.log(`[UniverseBackend] Universe reloaded successfully from ${sourceOfTruth}`);
        this.notifyStatus('success', `Universe reloaded from ${sourceOfTruth}`);
        return { success: true, source: sourceOfTruth };
      } else {
        console.warn(`[UniverseBackend] No data found or store operations not available`);
        return { success: false, source: sourceOfTruth };
      }
    } catch (error) {
      console.error(`[UniverseBackend] Failed to reload universe:`, error);
      this.notifyStatus('error', `Failed to reload universe: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download universe as local .redstring file
   */
  async downloadLocalFile(universeSlug, storeState = null) {
    console.log(`[UniverseBackend] Downloading local file for universe: ${universeSlug}`);
    
    const universe = universeManager.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    // Get store state if not provided
    if (!storeState) {
      // Try to get from store operations if available
      const useGraphStore = (await import('../store/graphStore.jsx')).default;
      storeState = useGraphStore.getState();
    }

    const fileName = `${universe.name || universeSlug}.redstring`;
    
    try {
      downloadRedstringFile(storeState, fileName);
      this.notifyStatus('success', `Downloaded ${fileName}`);
      return { success: true, fileName };
    } catch (error) {
      console.error(`[UniverseBackend] Failed to download ${fileName}:`, error);
      this.notifyStatus('error', `Download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload/Import universe from local .redstring file
   */
  async uploadLocalFile(file, targetUniverseSlug = null) {
    console.log(`[UniverseBackend] Uploading local file: ${file.name}`);
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          const jsonData = JSON.parse(e.target.result);
          
          // Get store actions
          const useGraphStore = (await import('../store/graphStore.jsx')).default;
          const storeActions = useGraphStore.getState();
          
          // Import the data
          importFromRedstring(jsonData, storeActions);
          
          this.notifyStatus('success', `Imported ${file.name}`);
          resolve({ success: true, fileName: file.name });
        } catch (error) {
          console.error(`[UniverseBackend] Failed to import ${file.name}:`, error);
          this.notifyStatus('error', `Import failed: ${error.message}`);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        const error = new Error('Failed to read file');
        this.notifyStatus('error', error.message);
        reject(error);
      };
      
      reader.readAsText(file);
    });
  }

  /**
   * Store a File System Access API handle for a universe
   * Now persists to IndexedDB for reconnection across sessions
   */
  async setFileHandle(universeSlug, fileHandle) {
    if (!fileHandle) {
      throw new Error('No file handle provided');
    }
    this.fileHandles.set(universeSlug, fileHandle);
    
    // Store file handle metadata in IndexedDB for persistence
    try {
      await storeFileHandleMetadata(universeSlug, fileHandle, {
        universeSlug,
        lastAccessed: Date.now()
      });
      console.log(`[UniverseBackend] Stored file handle metadata for ${universeSlug}`);
    } catch (error) {
      console.warn(`[UniverseBackend] Failed to store file handle metadata:`, error);
    }
    
    const universe = universeManager.getUniverse(universeSlug);
    await this.updateUniverse(universeSlug, {
      localFile: {
        ...(universe?.localFile || {}),
        enabled: true,
        path: fileHandle.name,
        hadFileHandle: true,
        fileHandleStatus: 'connected',
        unavailableReason: null
      }
    });
    this.notifyStatus('success', `Linked file handle for ${universe?.name || universeSlug}`);
    return { success: true, fileName: fileHandle.name };
  }

  /**
   * Prompt user to select a file handle and store it (pick or saveAs)
   */
  async setupLocalFileHandle(universeSlug, options = {}) {
    const mode = options?.mode === 'saveAs' ? 'saveAs' : 'pick';
    const universe = universeManager.getUniverse(universeSlug);
    
    // Get metadata to suggest the last known file name
    const metadata = await getFileHandleMetadata(universeSlug);
    const suggestedName = metadata?.fileName || universe?.localFile?.path || `${universe?.name || universeSlug}.redstring`;
    
    let handle;
    if (mode === 'pick') {
      const [picked] = await window.showOpenFilePicker({
        types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }],
        multiple: false
      });
      handle = picked;
    } else {
      handle = await window.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }]
      });
    }
    return this.setFileHandle(universeSlug, handle);
  }

  /**
   * Save current universe store state to the previously linked file handle
   */
  async saveToLinkedLocalFile(universeSlug, storeState = null) {
    const handle = this.fileHandles.get(universeSlug);
    if (!handle) {
      throw new Error('No linked local file. Pick a file first.');
    }
    if (!storeState && this.storeOperations?.getState) {
      storeState = this.storeOperations.getState();
    }
    if (!storeState) {
      throw new Error('No store state available to save');
    }
    const redstringData = exportToRedstring(storeState);
    const jsonString = JSON.stringify(redstringData, null, 2);
    const writable = await handle.createWritable();
    try {
      await writable.write(new Blob([jsonString], { type: 'application/json' }));
      await writable.close();
      
      // Update last accessed time in persistence
      try {
        await touchFileHandle(universeSlug);
      } catch (error) {
        console.warn('[UniverseBackend] Failed to touch file handle after save:', error);
      }
    } catch (e) {
      try { await writable.close(); } catch (_) {}
      throw e;
    }
    this.notifyStatus('success', `Saved to ${handle.name}`);
    return { success: true, fileName: handle.name };
  }

  /**
   * Link local file to universe (for future saves/loads)
   */
  async linkLocalFileToUniverse(universeSlug, filePath) {
    console.log(`[UniverseBackend] Linking local file to universe ${universeSlug}: ${filePath}`);
    
    const universe = universeManager.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    // Update universe with local file configuration
    await this.updateUniverse(universeSlug, {
      localFile: {
        enabled: true,
        path: filePath
      }
    });

    this.notifyStatus('success', `Linked local file to ${universe.name || universeSlug}`);
    return { success: true, filePath };
  }

  /**
   * Upload and import a local .redstring file to a universe
   */
  async uploadLocalFile(file, targetUniverseSlug) {
    await this.initialize();

    if (!file || !file.name || !file.name.endsWith('.redstring')) {
      throw new Error('Please select a valid .redstring file');
    }

    console.log(`[UniverseBackend] Uploading local file ${file.name} to universe ${targetUniverseSlug}`);

    // Read the file content
    const fileContent = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });

    // Parse and import the redstring data
    let storeState;
    try {
      const parsedData = JSON.parse(fileContent);
      storeState = importFromRedstring(parsedData);
    } catch (error) {
      throw new Error(`Invalid .redstring file format: ${error.message}`);
    }

    // Load the imported data into the target universe
    if (this.storeOperations?.loadUniverseFromFile) {
      // Switch to target universe first if needed
      const currentActiveSlug = universeManager?.getActiveUniverse()?.slug;
      if (currentActiveSlug !== targetUniverseSlug) {
        await this.switchActiveUniverse(targetUniverseSlug);
      }

      // Load the imported state
      this.storeOperations.loadUniverseFromFile(storeState);

      // Enable local file storage for this universe
      await this.linkLocalFileToUniverse(targetUniverseSlug, file.name);

      const nodeCount = storeState?.nodePrototypes ?
        (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes || {}).length) : 0;

      // Note: File input gives us a one-time File object, not a persistent FileSystemFileHandle
      // User needs to use "Pick File" or "Save As" to establish persistent file connection for auto-save
      console.log(`[UniverseBackend] File imported. To enable auto-save, use "Pick File" to establish persistent connection.`);
      
      this.notifyStatus('success', `Imported ${file.name} with ${nodeCount} nodes. Use "Pick File" to enable auto-save.`);

      return { success: true, nodeCount, fileName: file.name, needsFileHandle: true };
    } else {
      throw new Error('Store operations not initialized');
    }
  }

  /**
   * Set the source of truth for a universe (git or local)
   */
  async setSourceOfTruth(universeSlug, sourceType) {
    await this.initialize();

    const universe = universeManager.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    console.log('[UniverseBackend] setSourceOfTruth - universe structure:', {
      hasRaw: !!universe.raw,
      hasGitRepo: !!universe.gitRepo,
      hasRawGitRepo: !!universe.raw?.gitRepo,
      rawGitRepoEnabled: universe.raw?.gitRepo?.enabled,
      gitRepoEnabled: universe.gitRepo?.enabled,
      hasLinkedRepo: !!universe.gitRepo?.linkedRepo,
      hasRawLinkedRepo: !!universe.raw?.gitRepo?.linkedRepo,
      linkedRepo: universe.gitRepo?.linkedRepo,
      rawLinkedRepo: universe.raw?.gitRepo?.linkedRepo
    });

    // Validate source type
    if (sourceType !== 'git' && sourceType !== 'local') {
      throw new Error('Source type must be "git" or "local"');
    }

    // Check if the requested source is available - check both universe and universe.raw
    const hasGitRepo = universe.gitRepo?.linkedRepo || universe.raw?.gitRepo?.linkedRepo;
    if (sourceType === 'git' && !hasGitRepo) {
      throw new Error('Cannot set git as source of truth - no repository linked');
    }

    if (sourceType === 'local' && !universe.raw?.localFile?.fileHandle) {
      throw new Error('Cannot set local as source of truth - no local file linked');
    }

    // Update the universe configuration
    await universeManager.updateUniverse(universeSlug, {
      sourceOfTruth: sourceType
    });

    this.notifyStatus('success', `Set ${sourceType === 'git' ? 'repository' : 'local file'} as primary source for ${universe.name || universeSlug}`);

    return { success: true, sourceOfTruth: sourceType };
  }

  /**
   * Update git operation status for a universe
   */
  updateGitOperationStatus(universeSlug, status) {
    const timestamp = Date.now();
    const existingStatus = this.gitOperationStatus.get(universeSlug) || {};

    const newStatus = {
      ...existingStatus,
      ...status,
      lastUpdated: timestamp,
      universeSlug
    };

    this.gitOperationStatus.set(universeSlug, newStatus);

    // Update global status
    this.updateGlobalGitStatus();

    // Notify status handlers
    this.notifyGitStatus(universeSlug, newStatus);
  }

  /**
   * Update global git status summary
   */
  updateGlobalGitStatus() {
    const allStatuses = Array.from(this.gitOperationStatus.values());
    const connectedUniverses = allStatuses.filter(s => s.isConnected);
    const syncedUniverses = allStatuses.filter(s => s.isSynced && !s.hasUnsavedChanges);
    const pendingOps = allStatuses.filter(s => s.isOperationInProgress).length;

    this.globalGitStatus = {
      ...this.globalGitStatus,
      isConnected: this.authStatus?.isAuthenticated || false,
      totalUniverses: allStatuses.length,
      syncedUniverses: syncedUniverses.length,
      pendingOperations: pendingOps,
      lastGlobalSync: Math.max(...allStatuses.map(s => s.lastSyncTime || 0), 0) || null
    };
  }

  /**
   * Get comprehensive git status for dashboard
   */
  getGitStatusDashboard() {
    return {
      global: this.globalGitStatus,
      universes: Object.fromEntries(this.gitOperationStatus),
      timestamp: Date.now()
    };
  }

  /**
   * Get git status for a specific universe
   */
  getUniverseGitStatus(universeSlug) {
    return this.gitOperationStatus.get(universeSlug) || {
      universeSlug,
      isConnected: false,
      isSynced: false,
      isOperationInProgress: false,
      hasUnsavedChanges: true,
      lastSyncTime: null,
      lastSaveAttempt: null,
      currentOperation: null,
      error: null,
      fileName: `universes/${universeSlug}/${universeSlug}.redstring`,
      commitCount: 0,
      lastCommitHash: null
    };
  }

  /**
   * Track start of git operation
   */
  trackGitOperationStart(universeSlug, operation, details = {}) {
    console.log(`[UniverseBackend] Starting ${operation} for ${universeSlug}`);
    this.updateGitOperationStatus(universeSlug, {
      isOperationInProgress: true,
      currentOperation: operation,
      operationStartTime: Date.now(),
      lastSaveAttempt: Date.now(),
      error: null,
      ...details
    });
  }

  /**
   * Track completion of git operation
   */
  trackGitOperationComplete(universeSlug, operation, success, details = {}) {
    const timestamp = Date.now();
    const status = this.getUniverseGitStatus(universeSlug);
    const duration = status.operationStartTime ? timestamp - status.operationStartTime : null;

    console.log(`[UniverseBackend] ${success ? 'Completed' : 'Failed'} ${operation} for ${universeSlug} ${duration ? `in ${duration}ms` : ''}`);

    this.updateGitOperationStatus(universeSlug, {
      isOperationInProgress: false,
      currentOperation: null,
      operationStartTime: null,
      lastSyncTime: success ? timestamp : status.lastSyncTime,
      isSynced: success,
      hasUnsavedChanges: !success,
      error: success ? null : details.error,
      commitCount: success ? (status.commitCount || 0) + 1 : status.commitCount,
      lastCommitHash: details.commitHash || status.lastCommitHash,
      operationDuration: duration,
      ...details
    });
  }

  /**
   * Event system for git status updates
   */
  notifyGitStatus(universeSlug, status) {
    this.statusHandlers.forEach(handler => {
      try {
        handler({
          type: 'git-status',
          universeSlug,
          status,
          global: this.globalGitStatus
        });
      } catch (error) {
        console.warn('[UniverseBackend] Git status handler error:', error);
      }
    });
  }

  /**
   * Event system for status updates
   */
  onStatusChange(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  notifyStatus(type, message) {
    this.statusHandlers.forEach(handler => {
      try {
        handler({ type, status: message });
      } catch (error) {
        console.warn('[UniverseBackend] Status handler error:', error);
      }
    });
  }

  /**
   * Cleanup - stop all engines
   */
  async cleanup() {
    console.log('[UniverseBackend] Cleaning up backend service...');

    for (const [slug, engine] of this.gitSyncEngines) {
      try {
        engine.stop();
      } catch (error) {
        console.warn(`[UniverseBackend] Failed to stop engine for ${slug}:`, error);
      }
    }

    this.gitSyncEngines.clear();
    this.statusHandlers.clear();
    this.isInitialized = false;
  }
}

// Export singleton instance
export const universeBackend = new UniverseBackend();
export default universeBackend;