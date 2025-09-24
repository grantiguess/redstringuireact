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
    try {
      // Dynamically import graphStore from backend (outside the circular dependency)
      const { default: useGraphStore } = await import('../store/graphStore.jsx');

      this.storeOperations = {
        getState: () => useGraphStore.getState(),
        loadUniverseFromFile: (storeState) => useGraphStore.getState().loadUniverseFromFile(storeState)
      };

      universeManager.setStoreOperations(this.storeOperations);
      console.log('[UniverseBackend] Store operations set up for universeManager and backend');
    } catch (error) {
      console.warn('[UniverseBackend] Failed to set up store operations:', error);
      // Continue without store operations - some functionality may be limited
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
      window.addEventListener('redstring:auth-token-stored', () => {
        this.authStatus = persistentAuth.getAuthStatus();
        this.notifyStatus('success', 'Authentication updated');
        this.autoSetupEnginesForActiveUniverse();
      });
    }
  }

  /**
   * Auto-setup Git sync engines for existing universes
   */
  async autoSetupExistingUniverses() {
    const universes = universeManager.getAllUniverses();

    for (const universe of universes) {
      if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
        try {
          await this.ensureGitSyncEngine(universe.slug);
        } catch (error) {
          console.warn(`[UniverseBackend] Failed to setup engine for ${universe.slug}:`, error);
        }
      }
    }
  }

  /**
   * Auto-setup engine for currently active universe
   */
  async autoSetupEnginesForActiveUniverse() {
    const activeUniverse = universeManager.getActiveUniverse();
    if (activeUniverse?.gitRepo?.enabled && activeUniverse?.gitRepo?.linkedRepo) {
      try {
        await this.ensureGitSyncEngine(activeUniverse.slug);
      } catch (error) {
        console.warn(`[UniverseBackend] Failed to auto-setup engine for active universe:`, error);
      }
    }
  }

  /**
   * Ensure a Git sync engine exists for a universe
   */
  async ensureGitSyncEngine(universeSlug) {
    // Check if engine already exists
    if (this.gitSyncEngines.has(universeSlug)) {
      return this.gitSyncEngines.get(universeSlug);
    }

    // Check if UniverseManager already has one
    const existingEngine = universeManager.getGitSyncEngine(universeSlug);
    if (existingEngine) {
      this.gitSyncEngines.set(universeSlug, existingEngine);
      return existingEngine;
    }

    const universe = universeManager.getUniverse(universeSlug);
    if (!universe?.gitRepo?.enabled || !universe?.gitRepo?.linkedRepo) {
      throw new Error(`Universe ${universeSlug} is not configured for Git sync`);
    }

    // Create provider
    const provider = await this.createProviderForUniverse(universe);
    if (!provider) {
      throw new Error(`Failed to create provider for universe ${universeSlug}`);
    }

    // Create and configure engine
    const sourceOfTruth = universe.sourceOfTruth || 'git';
    const engine = new GitSyncEngine(provider, sourceOfTruth, universeSlug, `${universeSlug}.redstring`, universeManager);

    // Set up event handlers
    engine.onStatusChange((status) => {
      this.notifyStatus(status.type, `${universe.name}: ${status.status}`);
    });

    // Register engine
    this.gitSyncEngines.set(universeSlug, engine);
    universeManager.setGitSyncEngine(universeSlug, engine);

    // Start engine
    engine.start();

    console.log(`[UniverseBackend] Created Git sync engine for universe: ${universeSlug}`);
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

    // Get authentication
    let token, authMethod;
    try {
      const app = persistentAuth.getAppInstallation?.();
      if (app?.accessToken) {
        token = app.accessToken;
        authMethod = 'github-app';
      } else {
        token = await persistentAuth.getAccessToken();
        authMethod = 'oauth';
      }
    } catch (error) {
      throw new Error('Authentication required for Git operations');
    }

    if (!token) {
      throw new Error('No valid authentication token available');
    }

    return SemanticProviderFactory.createProvider({
      type: 'github',
      user,
      repo,
      token,
      authMethod,
      semanticPath: universe.gitRepo.schemaPath || 'schema'
    });
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
    const result = await universeManager.switchActiveUniverse(slug, options);

    // CRITICAL: Load the new universe data into the graph store
    if (result?.storeState && this.storeOperations?.loadUniverseFromFile) {
      console.log('[UniverseBackend] Loading new universe data into graph store...');
      try {
        this.storeOperations.loadUniverseFromFile(result.storeState);
        console.log('[UniverseBackend] Successfully loaded universe data into graph store');
      } catch (error) {
        console.error('[UniverseBackend] Failed to load universe data into graph store:', error);
      }
    } else {
      console.warn('[UniverseBackend] Cannot load universe data - missing storeState or storeOperations');
    }

    // Ensure engine is set up for the new active universe (but don't block on it)
    setTimeout(() => {
      this.ensureGitSyncEngine(slug).catch(error => {
        console.warn(`[UniverseBackend] Failed to setup engine after universe switch:`, error);
      });
    }, 100);

    return result;
  }

  /**
   * Save active universe
   */
  async saveActiveUniverse(storeState = null) {
    return universeManager.saveActiveUniverse(storeState);
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
  updateUniverse(slug, updates) {
    return universeManager.updateUniverse(slug, updates);
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
    const engine = this.gitSyncEngines.get(universeSlug);
    if (engine) {
      return engine.forceCommit(storeState);
    }
    throw new Error(`No Git sync engine for universe: ${universeSlug}`);
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