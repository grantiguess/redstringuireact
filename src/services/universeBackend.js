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
import { GitSyncEngine } from './gitSyncEngine.js';
import { persistentAuth } from './persistentAuth.js';
import { SemanticProviderFactory } from './gitNativeProvider.js';
import startupCoordinator from './startupCoordinator.js';
import { exportToRedstring, importFromRedstring, downloadRedstringFile } from '../formats/redstringFormat.js';

class UniverseBackend {
  constructor() {
    this.gitSyncEngines = new Map(); // slug -> GitSyncEngine
    this.statusHandlers = new Set();
    this.isInitialized = false;
    this.authStatus = null;

    // Don't auto-initialize on construction to avoid circular dependencies
    // Initialization will happen on first method call
  }

  /**
   * Initialize the backend service
   */
  async initialize() {
    if (this.isInitialized) return;

    console.log('[UniverseBackend] Initializing backend service...');

    try {
      // Load universeManager first to avoid circular dependencies
      if (!universeManager) {
        console.log('[UniverseBackend] Loading universeManager...');
        const module = await import('./universeManager.js');
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

      // Auto-setup engines when universes change
      this.autoSetupEnginesForActiveUniverse();
    });
  }

  /**
   * Set up authentication event listeners
   */
  setupAuthEvents() {
    // Listen for auth changes and update status
    if (typeof window !== 'undefined') {
      window.addEventListener('redstring:auth-token-stored', async () => {
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
                console.warn(`[UniverseBackend] Git has no data, but you have ${currentNodeCount} nodes and ${currentGraphCount} graphs locally`);
                this.notifyStatus('warning', `Using browser storage backup (${currentNodeCount} nodes). Push to Git to sync.`);
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
        
        // Set up sync engines
        this.autoSetupEnginesForActiveUniverse();
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
      
      // Test provider availability
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        throw new Error(`Provider for ${universeSlug} is not available - check authentication and repository access`);
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

    // Ensure engine is set up for the new active universe (but don't block on it)
    setTimeout(() => {
      this.ensureGitSyncEngine(slug).catch(error => {
        console.warn(`[UniverseBackend] Failed to setup engine after universe switch:`, error);
        this.notifyStatus('warning', `Git sync engine setup failed for ${slug}`);
      });
    }, 100);

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
      console.log('[UniverseBackend] Getting universes from universeManager...');
      const universes = universeManager.getAllUniverses();
      console.log('[UniverseBackend] Retrieved universes:', universes.length);
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
    
    // Ensure Git sync engine exists
    let engine = this.gitSyncEngines.get(universeSlug);
    if (!engine) {
      try {
        console.log(`[UniverseBackend] No engine found for ${universeSlug}, creating one for force save`);
        engine = await this.ensureGitSyncEngine(universeSlug);
      } catch (error) {
        console.error(`[UniverseBackend] Failed to create engine for force save:`, error);
        // Fallback to regular save through universe manager
        console.log(`[UniverseBackend] Falling back to universe manager save`);
        return await this.saveActiveUniverse(storeState);
      }
    }
    
    if (engine) {
      try {
        const result = await engine.forceCommit(storeState);
        this.notifyStatus('success', `Force save completed for ${universeSlug}`);
        return result;
      } catch (error) {
        console.error(`[UniverseBackend] Force save failed for ${universeSlug}:`, error);
        this.notifyStatus('error', `Force save failed: ${error.message}`);
        throw error;
      }
    }
    
    throw new Error(`No Git sync engine available for universe: ${universeSlug}`);
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
      const { useGraphStore } = await import('../store/graphStore.jsx');
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
          const { useGraphStore } = await import('../store/graphStore.jsx');
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