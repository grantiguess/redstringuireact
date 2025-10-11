/**
 * Universe Backend Service
 *
 * This is the TRUE backend for universe management that should run independently
 * of any UI components. All universe operations should go through this service.
 *
 * The UI (GitNativeFederation.jsx) should ONLY display data and call these methods.
 */

import { GitSyncEngine } from '../backend/sync/index.js';
import { persistentAuth } from '../backend/auth/index.js';
import { SemanticProviderFactory } from '../backend/git/index.js';
import startupCoordinator from './startupCoordinator.js';
import { exportToRedstring, importFromRedstring, downloadRedstringFile } from '../formats/redstringFormat.js';
import { v4 as uuidv4 } from 'uuid';
import {
  getCurrentDeviceConfig,
  shouldUseGitOnlyMode,
  getOptimalDeviceConfig,
  hasCapability
} from '../utils/deviceDetection.js';
import { oauthFetch } from './bridgeConfig.js';
import { storageWrapper } from '../utils/storageWrapper.js';
import {
  storeFileHandleMetadata,
  getFileHandleMetadata,
  getAllFileHandleMetadata,
  attemptRestoreFileHandle,
  verifyFileHandleAccess,
  checkFileHandlePermission,
  requestFileHandlePermission,
  touchFileHandle,
  removeFileHandleMetadata
} from './fileHandlePersistence.js';
import { discoverUniversesWithStats, createUniverseConfigFromDiscovered } from './universeDiscovery.js';

const GF_TAG = '[GF-DEBUG]';
const { log: __gfNativeLog, warn: __gfNativeWarn, error: __gfNativeError } = console;
const gfLog = (...args) => __gfNativeLog.call(console, GF_TAG, ...args);
const gfWarn = (...args) => __gfNativeWarn.call(console, GF_TAG, ...args);
const gfError = (...args) => __gfNativeError.call(console, GF_TAG, ...args);

// Storage keys
const STORAGE_KEYS = {
  UNIVERSES_LIST: 'unified_universes_list',
  ACTIVE_UNIVERSE: 'active_universe_slug',
  UNIVERSE_FILE_HANDLES: 'universe_file_handles'
};

// Source of truth constants
const SOURCE_OF_TRUTH = {
  LOCAL: 'local',
  GIT: 'git',
  BROWSER: 'browser'
};

class UniverseBackend {
  constructor() {
    // Core universe state (from universeManager)
    this.universes = new Map(); // slug -> universe config
    this.activeUniverseSlug = null;

    // File and Git engine management
    this.fileHandles = new Map(); // slug -> FileSystemFileHandle
    this.gitSyncEngines = new Map(); // slug -> GitSyncEngine

    // Status and initialization
    this.statusHandlers = new Set();
    this.isInitialized = false;
    this.initializationPromise = null;
    this.autoSetupScheduled = false;
    this.authStatus = null;
    this.loggedMergeWarning = false;

    // Device configuration
    this.deviceConfig = null;
    this.isGitOnlyMode = false;

    // Process watchdog
    this.watchdogInterval = null;
    this.watchdogDelay = 60000;

    // Store operations (injected)
    this.storeOperations = null;

    // Git operation tracking for dashboard
    this.gitOperationStatus = new Map();
    this.globalGitStatus = {
      isConnected: false,
      lastConnection: null,
      totalUniverses: 0,
      syncedUniverses: 0,
      pendingOperations: 0,
      lastGlobalSync: null
    };

    // Load universes from storage
    this.loadFromStorage();

    // Initialize device config after a brief delay
    setTimeout(() => {
      this.initializeDeviceConfig();
    }, 100);

    // Attempt to restore file handles
    setTimeout(() => {
      this.restoreFileHandles();
    }, 200);
  }

  // ========== CORE UNIVERSE MANAGEMENT METHODS (from universeManager) ==========

  /**
   * Load universes from storage
   */
  loadFromStorage() {
    try {
      const saved = storageWrapper.getItem(STORAGE_KEYS.UNIVERSES_LIST);
      const activeSlug = storageWrapper.getItem(STORAGE_KEYS.ACTIVE_UNIVERSE);

      if (saved) {
        const universesList = JSON.parse(saved);
        universesList.forEach(universe => {
          this.universes.set(universe.slug, this.safeNormalizeUniverse(universe));
        });
      }

      // Load file handles info
      try {
        const fileHandlesInfo = storageWrapper.getItem(STORAGE_KEYS.UNIVERSE_FILE_HANDLES);
        if (fileHandlesInfo) {
          const handlesData = JSON.parse(fileHandlesInfo);
          Object.keys(handlesData).forEach(slug => {
            const universe = this.universes.get(slug);
            if (universe && handlesData[slug]) {
              this.updateUniverse(slug, {
                localFile: {
                  ...universe.localFile,
                  hadFileHandle: true,
                  lastFilePath: handlesData[slug].path || universe.localFile.path
                }
              });
            }
          });
        }
      } catch (error) {
        gfWarn('[UniverseBackend] Failed to load file handles info:', error);
      }

      // Create default universe if none exist
      if (this.universes.size === 0) {
        this.createSafeDefaultUniverse();
      }

      // Set active universe
      this.activeUniverseSlug = activeSlug && this.universes.has(activeSlug)
        ? activeSlug
        : this.universes.keys().next().value;

      gfLog('[UniverseBackend] Loaded', this.universes.size, 'universes, active:', this.activeUniverseSlug);
    } catch (error) {
      gfError('[UniverseBackend] Failed to load from storage:', error);
      this.createSafeDefaultUniverse();
    }
  }

  /**
   * Save universes to storage
   */
  saveToStorage() {
    try {
      const universesList = Array.from(this.universes.values()).map(universe => {
        const { localFile, ...rest } = universe;
        return {
          ...rest,
          localFile: {
            enabled: localFile.enabled,
            path: localFile.path,
            hadFileHandle: localFile.hadFileHandle,
            lastFilePath: localFile.lastFilePath,
            lastSaved: localFile.lastSaved,
            fileHandleStatus: localFile.fileHandleStatus,
            unavailableReason: localFile.unavailableReason
          }
        };
      });

      storageWrapper.setItem(STORAGE_KEYS.UNIVERSES_LIST, JSON.stringify(universesList));
      storageWrapper.setItem(STORAGE_KEYS.ACTIVE_UNIVERSE, this.activeUniverseSlug);

      // Save file handles info
      const fileHandlesInfo = {};
      this.fileHandles.forEach((handle, slug) => {
        fileHandlesInfo[slug] = {
          path: handle.name || this.universes.get(slug)?.localFile?.path || `${slug}.redstring`,
          hasHandle: true
        };
      });
      storageWrapper.setItem(STORAGE_KEYS.UNIVERSE_FILE_HANDLES, JSON.stringify(fileHandlesInfo));

      if (storageWrapper.shouldUseMemoryStorage()) {
        storageWrapper.warnAboutDataLoss();
      }
    } catch (error) {
      gfError('[UniverseBackend] Failed to save to storage:', error);
    }
  }

  /**
   * Safe universe normalization (prevents startup recursion)
   */
  safeNormalizeUniverse(universe = {}) {
    const {
      raw: incomingRaw,
      localFile: incomingLocalFile = {},
      gitRepo: incomingGitRepo = {},
      browserStorage: incomingBrowserStorage = {},
      metadata: incomingMetadata = {},
      sources: incomingSources,
      created: createdAt,
      lastModified: lastModifiedAt,
      ...rest
    } = universe || {};

    const slug = rest.slug || universe.slug || 'universe';
    const name = rest.name || universe.name || 'Universe';

    const sanitizedLocalPath = this.sanitizeFileName(
      incomingLocalFile?.path || `${name}.redstring`
    );

    const normalizedLocalFile = {
      enabled: incomingLocalFile?.enabled ?? true,
      path: sanitizedLocalPath,
      hadFileHandle: incomingLocalFile?.hadFileHandle ?? false,
      lastFilePath: incomingLocalFile?.lastFilePath || sanitizedLocalPath,
      lastSaved: incomingLocalFile?.lastSaved
        ?? rest?.localFile?.lastSaved
        ?? incomingRaw?.localFile?.lastSaved
        ?? null,
      fileHandleStatus: incomingLocalFile?.fileHandleStatus || null,
      unavailableReason: incomingLocalFile?.unavailableReason || null
    };

    const resolvedGitRepo = typeof incomingGitRepo === 'object' && incomingGitRepo !== null
      ? incomingGitRepo
      : {};

    const normalizedGitRepo = {
      ...resolvedGitRepo,
      enabled: resolvedGitRepo.enabled ?? false,
      linkedRepo: resolvedGitRepo.linkedRepo || rest.linkedRepo || null,
      schemaPath: resolvedGitRepo.schemaPath || rest.schemaPath || 'schema',
      universeFolder: resolvedGitRepo.universeFolder !== undefined
        ? resolvedGitRepo.universeFolder
        : rest.universeFolder !== undefined
          ? rest.universeFolder
          : slug,
      universeFile: resolvedGitRepo.universeFile !== undefined
        ? resolvedGitRepo.universeFile
        : rest.universeFile !== undefined
          ? rest.universeFile
          : `${slug}.redstring`,
      priority: resolvedGitRepo.priority || 'secondary'
    };

    const resolvedBrowserStorage = typeof incomingBrowserStorage === 'object' && incomingBrowserStorage !== null
      ? incomingBrowserStorage
      : {};

    const normalizedBrowserStorage = {
      ...resolvedBrowserStorage,
      enabled: resolvedBrowserStorage.enabled ?? true,
      role: resolvedBrowserStorage.role || 'fallback',
      key: resolvedBrowserStorage.key || `universe_${slug}`
    };

    const resolvedMetadata = typeof incomingMetadata === 'object' && incomingMetadata !== null
      ? incomingMetadata
      : {};

    const created = createdAt || resolvedMetadata.created || (incomingRaw?.created) || new Date().toISOString();
    const lastModified = lastModifiedAt || resolvedMetadata.lastModified || (incomingRaw?.lastModified) || created;

    const normalizedMetadata = {
      ...resolvedMetadata,
      created,
      lastModified
    };

    const rawBase = (typeof incomingRaw === 'object' && incomingRaw !== null)
      ? incomingRaw
      : {};

    const mergedRaw = {
      ...rawBase,
      ...rest,
      localFile: {
        ...(rawBase.localFile || {}),
        ...incomingLocalFile,
        ...normalizedLocalFile
      },
      gitRepo: {
        ...(rawBase.gitRepo || {}),
        ...resolvedGitRepo,
        ...normalizedGitRepo
      },
      browserStorage: {
        ...(rawBase.browserStorage || {}),
        ...resolvedBrowserStorage,
        ...normalizedBrowserStorage
      },
      metadata: {
        ...(rawBase.metadata || {}),
        ...resolvedMetadata,
        ...normalizedMetadata
      }
    };
    delete mergedRaw.raw;

    const sources = Array.isArray(incomingSources)
      ? incomingSources
      : Array.isArray(rawBase.sources)
        ? rawBase.sources
        : [];
    mergedRaw.sources = sources;
    mergedRaw.created = created;
    mergedRaw.lastModified = lastModified;
    mergedRaw.sourceOfTruth = rest.sourceOfTruth || rawBase.sourceOfTruth || 'local';

    return {
      slug,
      name,
      sourceOfTruth: rest.sourceOfTruth || rawBase.sourceOfTruth || 'local',
      localFile: normalizedLocalFile,
      gitRepo: normalizedGitRepo,
      browserStorage: normalizedBrowserStorage,
      metadata: normalizedMetadata,
      sources,
      created,
      lastModified,
      raw: mergedRaw
    };
  }

  /**
   * Create safe default universe
   */
  createSafeDefaultUniverse() {
    const defaultUniverse = {
      slug: 'universe',
      name: 'Universe',
      sourceOfTruth: 'local',
      localFile: { enabled: true, path: 'Universe.redstring' },
      gitRepo: { enabled: false, linkedRepo: null, schemaPath: 'schema' },
      browserStorage: { enabled: true, role: 'fallback' },
      sources: []
    };

    this.universes.set('universe', this.safeNormalizeUniverse(defaultUniverse));
    this.activeUniverseSlug = 'universe';
    this.saveToStorage();

    if (this.storeOperations?.loadUniverseFromFile) {
      const emptyState = this.createEmptyState();
      try {
        this.storeOperations.loadUniverseFromFile(emptyState);
        gfLog('[UniverseBackend] Initialized graph store with empty state for safe default universe');
      } catch (error) {
        gfWarn('[UniverseBackend] Failed to initialize graph store for safe default universe:', error);
      }
    }

    gfLog('[UniverseBackend] Created safe default universe during startup');
  }

  /**
   * Sanitize file names
   */
  sanitizeFileName(name) {
    return name
      .replace(/[^a-zA-Z0-9-_\.]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .replace(/\.redstring$/, '') + '.redstring';
  }

  /**
   * Generate unique slug
   */
  generateUniqueSlug(name) {
    let baseSlug = String(name || 'universe').toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) || 'universe';

    const existingLower = new Set();
    for (const key of this.universes.keys()) {
      if (typeof key === 'string') {
        existingLower.add(key.toLowerCase());
      }
    }

    if (!existingLower.has(baseSlug)) {
      return baseSlug;
    }

    let slug = baseSlug;
    let counter = 1;
    while (existingLower.has(slug.toLowerCase())) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  /**
   * Resolve universe entry (case-insensitive)
   */
  resolveUniverseEntry(slug) {
    if (!slug) return null;
    if (this.universes.has(slug)) {
      return { key: slug, universe: this.universes.get(slug) };
    }

    const target = String(slug).toLowerCase();
    for (const [key, value] of this.universes.entries()) {
      if (typeof key === 'string' && key.toLowerCase() === target) {
        return { key, universe: value };
      }
    }
    return null;
  }

  /**
   * Create empty universe state
   */
  createEmptyState() {
    return {
      graphs: new Map(),
      nodePrototypes: new Map(),
      edges: new Map(),
      openGraphIds: [],
      activeGraphId: null,
      activeDefinitionNodeId: null,
      expandedGraphIds: new Set(),
      rightPanelTabs: [{ type: 'home', isActive: true }],
      savedNodeIds: new Set(),
      savedGraphIds: new Set(),
      showConnectionNames: false
    };
  }

  /**
   * Initialize device configuration
   */
  initializeDeviceConfig() {
    if (this._initializingDeviceConfig) {
      gfWarn('[UniverseBackend] Device config initialization already in progress, skipping');
      return;
    }

    this._initializingDeviceConfig = true;

    try {
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const screenWidth = window.screen?.width || 1920;
      const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
      const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/i.test(navigator.userAgent.toLowerCase()) ||
                       (/macintosh/i.test(navigator.userAgent.toLowerCase()) && isTouch);
      const isSmallScreen = screenWidth <= 768;
      const isMediumScreen = screenWidth <= 1024;

      const shouldUseGitOnly = isMobile || isTablet || !('showSaveFilePicker' in window) || (isTouch && isMediumScreen);

      this.deviceConfig = {
        gitOnlyMode: shouldUseGitOnly,
        sourceOfTruth: shouldUseGitOnly ? 'git' : 'local',
        enableLocalFileStorage: !shouldUseGitOnly && 'showSaveFilePicker' in window,
        touchOptimizedUI: isTouch,
        compactInterface: isMobile,
        autoSaveFrequency: isMobile ? 2000 : 1000,
        deviceInfo: {
          type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop',
          isMobile,
          isTablet,
          isTouchDevice: isTouch,
          screenWidth,
          supportsFileSystemAPI: 'showSaveFilePicker' in window
        }
      };

      this.isGitOnlyMode = shouldUseGitOnly;
      this.watchdogDelay = this.deviceConfig.autoSaveFrequency * 60;

      gfLog('[UniverseBackend] Device config initialized:', {
        deviceType: this.deviceConfig.deviceInfo.type,
        gitOnlyMode: this.isGitOnlyMode,
        sourceOfTruth: this.deviceConfig.sourceOfTruth
      });
    } catch (error) {
      gfError('[UniverseBackend] Device config initialization failed:', error);
      this.deviceConfig = {
        gitOnlyMode: false,
        sourceOfTruth: 'local',
        touchOptimizedUI: false,
        autoSaveFrequency: 1000,
        enableLocalFileStorage: true,
        compactInterface: false,
        deviceInfo: { isMobile: false, isTablet: false, type: 'desktop', isTouchDevice: false, screenWidth: 1920, supportsFileSystemAPI: true }
      };
      this.isGitOnlyMode = false;
    } finally {
      this._initializingDeviceConfig = false;
    }
  }

  /**
   * Initialize background sync
   */
  async initializeBackgroundSync() {
    gfLog('[UniverseBackend] ========== INITIALIZE BACKGROUND SYNC CALLED ==========');
    try {
      gfLog('[UniverseBackend] Initializing background sync services...');

      if (!persistentAuth.initializeCalled) {
        gfLog('[UniverseBackend] About to call persistentAuth.initialize()...');
        await persistentAuth.initialize();
      } else {
        gfLog('[UniverseBackend] PersistentAuth already initialized');
      }

      const authStatus = persistentAuth.getAuthStatus();
      gfLog('[UniverseBackend] Auth status:', authStatus);

      const hasAccessToken = persistentAuth.hasValidTokens();
      if (!authStatus.isAuthenticated && !hasAccessToken) {
        gfLog('[UniverseBackend] No valid auth token, skipping Git sync setup');
        return;
      }

      const activeUniverse = this.getActiveUniverse();
      gfLog('[UniverseBackend] Active universe:', activeUniverse?.slug || 'none');

      if (activeUniverse && activeUniverse.gitRepo?.linkedRepo && activeUniverse.gitRepo?.enabled) {
        gfLog('[UniverseBackend] Active universe has Git repo, will set up sync engine');
      }

    } catch (error) {
      gfError('[UniverseBackend] Background sync initialization failed:', error);
      throw error;
    }
  }

  /**
   * Restore file handles from persistence
   */
  async restoreFileHandles() {
    try {
      gfLog('[UniverseBackend] Attempting to restore file handles from persistence...');

      const allMetadata = await getAllFileHandleMetadata();

      if (allMetadata.length === 0) {
        gfLog('[UniverseBackend] No file handle metadata found');
        return;
      }

      gfLog(`[UniverseBackend] Found ${allMetadata.length} file handle metadata entries`);
      let restoredAny = false;

      for (const metadata of allMetadata) {
        const { universeSlug } = metadata;

        const existingHandle = this.fileHandles.get(universeSlug);
        if (existingHandle) {
          const isValid = await verifyFileHandleAccess(existingHandle);
          if (isValid) {
            gfLog(`[UniverseBackend] File handle for ${universeSlug} already valid in session`);
            continue;
          }
        }

        const result = await attemptRestoreFileHandle(universeSlug, existingHandle);

        if (result.success && result.handle) {
          this.fileHandles.set(universeSlug, result.handle);
          gfLog(`[UniverseBackend] Successfully restored file handle for ${universeSlug}`);
          restoredAny = true;

          const universe = this.getUniverse(universeSlug);
          if (universe) {
            this.updateUniverse(universeSlug, {
              localFile: {
                ...universe.localFile,
                fileHandleStatus: 'connected',
                lastAccessed: Date.now()
              }
            });
          }
        } else if (result.needsReconnect) {
          gfLog(`[UniverseBackend] File handle for ${universeSlug} needs reconnection: ${result.message}`);

          const universe = this.getUniverse(universeSlug);
          if (universe) {
            this.updateUniverse(universeSlug, {
              localFile: {
                ...universe.localFile,
                fileHandleStatus: 'needs_reconnect',
                reconnectMessage: result.message
              }
            });
          }
        }
      }

      gfLog('[UniverseBackend] File handle restoration complete');
      if (restoredAny) {
        await this.ensureSaveCoordinator();
      }
    } catch (error) {
      gfError('[UniverseBackend] Failed to restore file handles:', error);
    }
  }

  // ========== END CORE UNIVERSE MANAGEMENT METHODS ==========

  /**
   * Initialize the backend service
   */
  async initialize() {
    if (this.isInitialized) {
      gfLog('[UniverseBackend] Backend already initialized, skipping...');
      return;
    }

    if (this.initializationPromise) {
      gfLog('[UniverseBackend] Initialization already in progress, waiting...');
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
    gfLog('[UniverseBackend] Initializing backend service...');

    try {
      gfLog('[UniverseBackend] Getting authentication status...');
      this.authStatus = persistentAuth.getAuthStatus();

      gfLog('[UniverseBackend] Setting up store operations...');
      await this.setupStoreOperations();

      gfLog('[UniverseBackend] Setting up event listeners...');
      this.setupAuthEvents();

      gfLog('[UniverseBackend] Initializing background sync (auth + active universe)...');
      const syncStartTime = Date.now();

      // Add timeout to prevent hanging
      try {
        await Promise.race([
          this.initializeBackgroundSync(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Background sync timeout after 8s')), 8000)
          )
        ]);
        const syncEndTime = Date.now();
        gfLog(`[UniverseBackend] Background sync completed in ${syncEndTime - syncStartTime}ms`);
      } catch (error) {
        gfWarn('[UniverseBackend] Background sync failed or timed out:', error.message);
        gfLog('[UniverseBackend] Continuing with backend initialization...');
      }

      gfLog('[UniverseBackend] Skipping auto-setup of ALL existing universes to avoid hanging...');
      // await this.autoSetupExistingUniverses(); // DISABLED - can hang during initialization

      // CRITICAL: Load active universe data into store
      const activeUniverse = this.getActiveUniverse();
      if (activeUniverse) {
        gfLog(`[UniverseBackend] Loading active universe into store: ${activeUniverse.name || activeUniverse.slug}`);
        try {
          // Try to load (will fall back to browser storage if Git fails due to auth)
          const storeState = await this.loadUniverseData(activeUniverse);
          if (storeState && this.storeOperations?.loadUniverseFromFile) {
            const success = this.storeOperations.loadUniverseFromFile(storeState);
            if (success) {
              const loadedState = this.storeOperations.getState();
              const nodeCount = loadedState?.nodePrototypes ? (loadedState.nodePrototypes instanceof Map ? loadedState.nodePrototypes.size : Object.keys(loadedState.nodePrototypes).length) : 0;
              const graphCount = loadedState?.graphs ? (loadedState.graphs instanceof Map ? loadedState.graphs.size : Object.keys(loadedState.graphs).length) : 0;

              gfLog(`[UniverseBackend] Active universe loaded: ${nodeCount} nodes, ${graphCount} graphs`);

              // Check if we loaded from cache due to missing auth
              const authStatus = this.getAuthStatus();
              if (!authStatus?.isAuthenticated && activeUniverse.gitRepo?.enabled) {
                this.notifyStatus('info', `Loaded ${activeUniverse.name} from cache. Connect GitHub to sync latest.`);
              } else {
                this.notifyStatus('success', `Loaded ${activeUniverse.name}: ${nodeCount} nodes, ${graphCount} graphs`);
              }
            } else {
              gfWarn('[UniverseBackend] Failed to load active universe into store');
            }
          }
        } catch (error) {
          gfWarn('[UniverseBackend] Failed to load active universe data:', error);
        }
      } else {
        gfLog('[UniverseBackend] No active universe to load');
      }

      this.isInitialized = true;
      this.notifyStatus('info', 'Universe backend initialized');

      gfLog('[UniverseBackend] Backend service initialized successfully');

      // After successful init, attempt to auto-setup sync engine for the active universe (non-blocking)
      // Only do this once, avoid duplicate engine creation
      if (!this.autoSetupScheduled) {
        this.autoSetupScheduled = true;
        try {
          setTimeout(() => {
            this.autoSetupEnginesForActiveUniverse().catch(err => {
              gfWarn('[UniverseBackend] Auto-setup for active universe failed:', err?.message || err);
            });
          }, 150);
        } catch (_) {}
      }
    } catch (error) {
      gfError('[UniverseBackend] Failed to initialize backend:', error);
      this.notifyStatus('error', `Backend initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Set up store operations to avoid circular dependencies
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
              gfLog('[UniverseBackend] Loading universe data into store:', {
                hasStoreState: !!storeState,
                storeStateType: typeof storeState,
                hasGraphs: storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0,
                hasNodes: storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0
              });

              store.loadUniverseFromFile(storeState);
              gfLog('[UniverseBackend] Successfully loaded universe data into store');
              return true;
            } catch (error) {
              gfError('[UniverseBackend] Failed to load universe data into store:', error);
              this.notifyStatus('error', `Failed to load universe data: ${error.message}`);
              throw error;
            }
          }
        };

        gfLog('[UniverseBackend] Store operations set up successfully for backend');
        return; // Success, exit retry loop
        
      } catch (error) {
        retryCount++;
        gfWarn(`[UniverseBackend] Failed to set up store operations (attempt ${retryCount}/${maxRetries}):`, error);
        
        if (retryCount >= maxRetries) {
          gfError('[UniverseBackend] CRITICAL: Failed to set up store operations after all retries. Universe data loading will not work properly.');
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
          gfLog('[UniverseBackend] Auth event debounced - too recent');
          return;
        }
        lastAuthProcessTime = now;

        this.authStatus = persistentAuth.getAuthStatus();
        this.notifyStatus('success', 'Authentication updated');

        // CRITICAL: Reload active universe from Git now that auth is ready
        const activeUniverse = this.getActiveUniverse();
        if (activeUniverse?.gitRepo?.enabled) {
          gfLog('[UniverseBackend] Auth connected, checking Git for latest data...');
          try {
            // Get current store state before loading
            const currentState = this.storeOperations?.getState();
            const currentNodeCount = currentState?.nodePrototypes ? (currentState.nodePrototypes instanceof Map ? currentState.nodePrototypes.size : Object.keys(currentState.nodePrototypes).length) : 0;
            const currentGraphCount = currentState?.graphs ? (currentState.graphs instanceof Map ? currentState.graphs.size : Object.keys(currentState.graphs).length) : 0;

            const storeState = await this.loadUniverseData(activeUniverse);
            if (storeState && this.storeOperations?.loadUniverseFromFile) {
              // Count what Git has
              const gitNodeCount = storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes || {}).length) : 0;
              const gitGraphCount = storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs || {}).length) : 0;

              // Smart merge: don't overwrite local work with empty Git data
              if (gitNodeCount === 0 && gitGraphCount === 0 && (currentNodeCount > 0 || currentGraphCount > 0)) {
                // Only log this warning once per session to avoid spam
                if (!this.loggedMergeWarning) {
                  gfWarn(`[UniverseBackend] Git has no data, but you have ${currentNodeCount} nodes and ${currentGraphCount} graphs locally`);
                  this.notifyStatus('warning', `Using browser storage backup (${currentNodeCount} nodes). Push to Git to sync.`);
                  this.loggedMergeWarning = true;
                }
                // Don't overwrite! User's local work is preserved
              } else {
                // Git has data or both are empty - safe to load
                this.storeOperations.loadUniverseFromFile(storeState);
                const loadedState = this.storeOperations.getState();
                const nodeCount = loadedState?.nodePrototypes ? (loadedState.nodePrototypes instanceof Map ? loadedState.nodePrototypes.size : Object.keys(loadedState.nodePrototypes).length) : 0;
                gfLog(`[UniverseBackend] Reloaded from Git after auth: ${nodeCount} nodes`);

                if (nodeCount === 0) {
                  this.notifyStatus('info', `Connected to GitHub. Universe is empty - create some nodes!`);
                } else {
                  this.notifyStatus('success', `Synced ${activeUniverse.name} from GitHub (${nodeCount} nodes)`);
                }
              }
            }
          } catch (error) {
            gfWarn('[UniverseBackend] Failed to reload from Git after auth:', error);
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
      gfLog('[UniverseBackend] Skipping auto-setup for existing universes: authentication not ready');
      return;
    }

    const universes = this.getAllUniverses();

    for (const universe of universes) {
      if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
        try {
          await this.ensureGitSyncEngine(universe.slug);
        } catch (error) {
          // Don't block initialization if one universe fails
          gfWarn(`[UniverseBackend] Failed to setup engine for ${universe.slug}:`, error.message);
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
      gfLog('[UniverseBackend] Skipping auto-setup: authentication not ready');
      return;
    }

    const activeUniverse = this.getActiveUniverse();
    if (activeUniverse?.gitRepo?.enabled && activeUniverse?.gitRepo?.linkedRepo) {
      try {
        gfLog('[UniverseBackend] Auto-setting up Git sync for active universe:', activeUniverse.slug);
        await this.ensureGitSyncEngine(activeUniverse.slug);
      } catch (error) {
        // Don't throw - just log and continue. User can manually retry.
        gfWarn(`[UniverseBackend] Failed to auto-setup engine for active universe:`, error.message);
        // Notify user but don't block
        this.notifyStatus('warning', `Git sync setup skipped: ${error.message}. You can enable it manually.`);
      }
    }
  }

  /**
   * Ensure a Git sync engine exists for a universe
   */
  async ensureGitSyncEngine(universeSlug) {
    gfLog(`[UniverseBackend] Ensuring Git sync engine for universe: ${universeSlug}`);
    
    // Check if engine already exists and is healthy
    if (this.gitSyncEngines.has(universeSlug)) {
      const existingEngine = this.gitSyncEngines.get(universeSlug);
      if (existingEngine && existingEngine.provider) {
        gfLog(`[UniverseBackend] Using existing healthy engine for ${universeSlug}`);
        return existingEngine;
      } else {
        gfLog(`[UniverseBackend] Existing engine for ${universeSlug} is unhealthy, removing`);
        this.gitSyncEngines.delete(universeSlug);
      }
    }

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }
    
    if (!universe?.gitRepo?.enabled) {
      throw new Error(`Universe ${universeSlug} does not have Git repo enabled`);
    }
    
    if (!universe?.gitRepo?.linkedRepo) {
      throw new Error(`Universe ${universeSlug} does not have a linked repository`);
    }

    gfLog(`[UniverseBackend] Creating new Git sync engine for ${universeSlug}`, {
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
            gfLog(`[UniverseBackend] Provider check attempt ${attempt} returned false, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
          }
        } catch (error) {
          lastError = error;
          // Network errors are often transient, retry
          if (error.message?.includes('network') || error.message?.includes('fetch') || attempt < 3) {
            gfLog(`[UniverseBackend] Provider check attempt ${attempt} failed (${error.message}), retrying...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            continue;
          }
          throw error;
        }
      }
      
      if (!isAvailable) {
        throw new Error(`Provider for ${universeSlug} is not available after 3 attempts - check authentication and repository access${lastError ? `: ${lastError.message}` : ''}`);
      }
      
      gfLog(`[UniverseBackend] Provider created and validated for ${universeSlug}`);
    } catch (error) {
      gfError(`[UniverseBackend] Failed to create/validate provider for ${universeSlug}:`, error);
      this.notifyStatus('error', `Git sync setup failed: ${error.message}`);
      throw error;
    }

    // Create and configure engine
    const sourceOfTruth = universe.sourceOfTruth || 'git';
    const fileName = universe.gitRepo.universeFile || `${universeSlug}.redstring`;
    const universeFolder = universe.gitRepo.universeFolder || universeSlug;
    const engine = new GitSyncEngine(provider, sourceOfTruth, universeSlug, fileName, this, universeFolder);

    // Set up event handlers
    engine.onStatusChange((status) => {
      const universeName = universe.name || universeSlug;
      this.notifyStatus(status.type, `${universeName}: ${status.status}`);
    });

    // Register engine
    this.gitSyncEngines.set(universeSlug, engine);

    // Start engine
    try {
      engine.start();
      gfLog(`[UniverseBackend] Git sync engine started for universe: ${universeSlug}`);
      this.notifyStatus('success', `Git sync enabled for ${universe.name || universeSlug}`);
      
      await this.ensureSaveCoordinator(engine);
    } catch (startError) {
      gfError(`[UniverseBackend] Failed to start engine for ${universeSlug}:`, startError);
      this.notifyStatus('error', `Failed to start Git sync: ${startError.message}`);
      throw startError;
    }

    return engine;
  }

  async ensureSaveCoordinator(engine = null) {
    try {
      const { saveCoordinator } = await import('../backend/sync/index.js');
      if (!saveCoordinator) {
        return null;
      }

      const fileStorage = await import('../store/fileStorage.js');
      const resolvedEngine = engine || saveCoordinator.gitSyncEngine || null;

      if (!saveCoordinator.isEnabled) {
        saveCoordinator.initialize(fileStorage, resolvedEngine, this);
        gfLog('[UniverseBackend] SaveCoordinator initialized', {
          hasGitEngine: !!resolvedEngine
        });
      } else {
        saveCoordinator.fileStorage = fileStorage;
        saveCoordinator.universeManager = this;
        saveCoordinator.setGitSyncEngine(resolvedEngine);

        gfLog('[UniverseBackend] SaveCoordinator dependencies refreshed', {
          hasGitEngine: !!resolvedEngine
        });
      }

      return saveCoordinator;
    } catch (error) {
      gfWarn('[UniverseBackend] ensureSaveCoordinator failed:', error);
      return null;
    }
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
          gfLog('[UniverseBackend] Refreshing GitHub App token...');
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
            await persistentAuth.storeAppInstallation(updatedApp);
            gfLog('[UniverseBackend] GitHub App token refreshed');
          } else {
            const errorText = await tokenResp.text();
            gfWarn(`[UniverseBackend] Failed to get GitHub App token (${tokenResp.status}), falling back to OAuth`);
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
        gfLog(`[UniverseBackend] Using OAuth authentication for ${user}/${repo}`);
        token = await persistentAuth.getAccessToken();
        authMethod = 'oauth';
        
        if (!token) {
          throw new Error('No valid authentication token available');
        }
      }
    } catch (error) {
      gfError('[UniverseBackend] Authentication failed:', error);
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
   * Stop and remove Git sync engine for a universe
   */
  async removeGitSyncEngine(universeSlug) {
    const engine = this.gitSyncEngines.get(universeSlug);
    if (engine) {
      engine.stop();
      this.gitSyncEngines.delete(universeSlug);
      gfLog(`[UniverseBackend] Removed Git sync engine for universe: ${universeSlug}`);
    }
  }

  /**
   * Set Git sync engine for universe with STRICT singleton protection
   */
  setGitSyncEngine(slug, gitSyncEngine) {
    // Check if we already have an engine for this universe
    const existingEngine = this.gitSyncEngines.get(slug);
    // If it's the same engine instance, do nothing to avoid log spam
    if (existingEngine && existingEngine === gitSyncEngine) {
      return true;
    }
    if (existingEngine && existingEngine !== gitSyncEngine) {
      // STRICT: Never allow replacement during startup to prevent loops
      gfWarn(`[UniverseBackend] STRICTLY REJECTING duplicate engine for ${slug} - one already exists`);
      gitSyncEngine.stop(); // Stop the duplicate engine immediately
      return false;
    }

    this.gitSyncEngines.set(slug, gitSyncEngine);
    gfLog(`[UniverseBackend] Git sync engine registered for universe: ${slug}`);
    return true;
  }

  /**
   * Get Git sync engine for universe
   */
  getGitSyncEngine(slug) {
    return this.gitSyncEngines.get(slug);
  }

  /**
   * Get file handle for universe
   */
  getFileHandle(slug) {
    return this.fileHandles.get(slug);
  }

  /**
   * Ensure GitHub App access token (with refresh)
   */
  async ensureGitHubAppAccessToken(forceRefresh = false) {
    if (!persistentAuth?.getAppInstallation) {
      return null;
    }

    const installation = persistentAuth.getAppInstallation();
    if (!installation?.installationId) {
      return null;
    }

    const { installationId } = installation;
    let token = installation.accessToken || null;
    const lastUpdated = installation.lastUpdated || 0;
    const TOKEN_STALE_AFTER_MS = 45 * 60 * 1000; // refresh 15 minutes before expiry
    const tokenStale = forceRefresh || !token || (Date.now() - lastUpdated) > TOKEN_STALE_AFTER_MS;

    if (!tokenStale && token) {
      return { token, installationId };
    }

    try {
      const response = await oauthFetch('/api/github/app/installation-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installation_id: installationId })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`status ${response.status} ${errorText}`);
      }

      const data = await response.json();
      token = data?.token || null;

      if (token) {
        const updated = {
          ...installation,
          accessToken: token,
          lastUpdated: Date.now()
        };
        try {
          await persistentAuth.storeAppInstallation(updated);
        } catch (error) {
          gfWarn('[UniverseBackend] Failed to persist refreshed GitHub App token:', error);
        }
        return { token, installationId };
      }
    } catch (error) {
      gfWarn('[UniverseBackend] GitHub App token refresh failed:', error);
    }

    return token ? { token, installationId } : null;
  }

  /**
   * Ensure OAuth access token (with refresh)
   */
  async ensureOAuthAccessToken(forceRefresh = false) {
    if (!persistentAuth?.getAccessToken) {
      return null;
    }

    try {
      if (forceRefresh && typeof persistentAuth.refreshAccessToken === 'function') {
        await persistentAuth.refreshAccessToken();
      }

      let token = await persistentAuth.getAccessToken();
      if (!token && typeof persistentAuth.refreshAccessToken === 'function') {
        await persistentAuth.refreshAccessToken();
        token = await persistentAuth.getAccessToken();
      }
      return token || null;
    } catch (error) {
      gfWarn('[UniverseBackend] OAuth token retrieval failed:', error);
      return null;
    }
  }

  /**
   * Discover universes in a repository
   */
  async discoverUniversesInRepository(repoConfig) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      gfLog(`[UniverseBackend] Discovering universes in ${repoConfig.user}/${repoConfig.repo}...`);

      const resolveDiscoveryAuth = async (preferredMethod = null) => {
        if (!preferredMethod || preferredMethod === 'github-app') {
          const appToken = await this.ensureGitHubAppAccessToken(preferredMethod === 'github-app');
          if (appToken?.token) {
            return { token: appToken.token, authMethod: 'github-app', installationId: appToken.installationId };
          }
        }
        const oauthToken = await this.ensureOAuthAccessToken(false);
        if (oauthToken) {
          return { token: oauthToken, authMethod: 'oauth' };
        }
        return { token: null, authMethod: null };
      };

      const refreshDiscoveryAuth = async (currentContext) => {
        if (!currentContext) return null;
        if (currentContext.authMethod === 'github-app') {
          const refreshed = await this.ensureGitHubAppAccessToken(true);
          if (refreshed?.token) {
            return { token: refreshed.token, authMethod: 'github-app', installationId: refreshed.installationId };
          }
          const fallback = await this.ensureOAuthAccessToken(true);
          if (fallback) {
            return { token: fallback, authMethod: 'oauth' };
          }
          return null;
        }
        const refreshedOAuth = await this.ensureOAuthAccessToken(true);
        return refreshedOAuth ? { token: refreshedOAuth, authMethod: 'oauth' } : null;
      };

      const authContext = await resolveDiscoveryAuth(repoConfig.authMethod || null);
      if (!authContext?.token) {
        throw new Error('Authentication required to discover universes');
      }

      const providerBaseConfig = {
        type: repoConfig.type || 'github',
        user: repoConfig.user,
        repo: repoConfig.repo,
        semanticPath: repoConfig.semanticPath || 'schema'
      };

      const runDiscovery = async (context, allowRetry = true) => {
        const providerConfig = { ...providerBaseConfig, token: context.token, authMethod: context.authMethod || 'oauth' };
        if (context.installationId) {
          providerConfig.installationId = context.installationId;
        }
        const provider = SemanticProviderFactory.createProvider(providerConfig);
        try {
          return await discoverUniversesWithStats(provider);
        } catch (error) {
          const message = error?.message || '';
          const isAuthError = message.includes('401') || message.toLowerCase().includes('unauthorized');
          if (allowRetry && isAuthError) {
            const refreshedContext = await refreshDiscoveryAuth(context);
            if (refreshedContext?.token && refreshedContext.token !== context.token) {
              gfLog('[UniverseBackend] Retrying universe discovery with refreshed credentials');
              return runDiscovery(refreshedContext, false);
            }
          }
          throw error;
        }
      };

      const { universes: discovered, stats } = await runDiscovery(authContext, true);
      gfLog(`[UniverseBackend] Discovered ${discovered.length} universes in repository`);
      this.notifyStatus('info', `Discovery: ${discovered.length} found • scanned ${stats.scannedDirs} dirs • ${stats.valid} valid • ${stats.invalid} invalid`);

      if (discovered.length === 0) {
        this.notifyStatus('info', `No universes found in ${repoConfig.user}/${repoConfig.repo}`);
      }
      return discovered;
    } catch (error) {
      gfError('[UniverseBackend] Universe discovery failed:', error);
      throw error;
    }
  }

  /**
   * Link to a discovered universe
   */
  async linkToDiscoveredUniverse(discoveredUniverse, repoConfig) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      gfLog(`[UniverseBackend] Linking to discovered universe: ${discoveredUniverse.name}`);
      const universeConfig = createUniverseConfigFromDiscovered(discoveredUniverse, repoConfig);

      const existingEntry = this.resolveUniverseEntry(universeConfig.slug);
      if (existingEntry) {
        const { key, universe: existing } = existingEntry;
        const updated = {
          ...existing,
          ...universeConfig,
          metadata: {
            ...existing.metadata,
            ...universeConfig.metadata,
            relinked: new Date().toISOString()
          }
        };
        this.universes.set(key, this.safeNormalizeUniverse(updated));
        this.notifyStatus('info', `Updated universe link: ${universeConfig.name}`);

        // Remove old engine and create new one with updated config
        if (this.gitSyncEngines.has(key)) {
          gfLog(`[UniverseBackend] Removing old Git sync engine for relinked universe: ${key}`);
          await this.removeGitSyncEngine(key);
        }

        // Ensure Git sync engine is set up for the updated universe
        try {
          await this.ensureGitSyncEngine(key);
        } catch (error) {
          gfWarn(`[UniverseBackend] Failed to setup engine for updated universe ${key}:`, error);
        }

        return key;
      }

      const slug = universeConfig.slug;
      this.universes.set(slug, this.safeNormalizeUniverse(universeConfig));
      this.saveToStorage();
      this.notifyStatus('success', `Linked universe: ${universeConfig.name}`);

      // Auto-setup Git sync engine
      try {
        await this.ensureGitSyncEngine(slug);
      } catch (error) {
        gfWarn(`[UniverseBackend] Failed to setup engine for new universe ${slug}:`, error);
      }

      return slug;
    } catch (error) {
      gfError('[UniverseBackend] Failed to link discovered universe:', error);
      throw error;
    }
  }

  /**
   * Switch active universe
   */
  async switchActiveUniverse(slug, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    gfLog(`[UniverseBackend] Switching to universe: ${slug}`);

    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const { key, universe } = resolved;

    if (this.activeUniverseSlug === key) {
      return { universe, storeState: null }; // Already active
    }

    // Save current universe before switching (unless explicitly disabled)
    if (options.saveCurrent !== false && this.activeUniverseSlug) {
      try {
        await this.saveActiveUniverse();
        gfLog('[UniverseBackend] Saved current universe before switching');
      } catch (error) {
        gfWarn('[UniverseBackend] Failed to save current universe before switch:', error);
      }
    }

    this.activeUniverseSlug = key;
    this.saveToStorage();

    this.notifyStatus('info', `Switched to universe: ${universe.name}`);

    // Load the universe data based on source of truth
    let storeState;
    try {
      storeState = await this.loadUniverseData(universe);

      // Update universe metadata with current node count after loading
      if (storeState && storeState.nodePrototypes) {
        const nodeCount = storeState.nodePrototypes instanceof Map
          ? storeState.nodePrototypes.size
          : Object.keys(storeState.nodePrototypes || {}).length;

        this.updateUniverse(key, {
          metadata: {
            ...universe.metadata,
            nodeCount,
            lastOpened: new Date().toISOString()
          }
        });
      }
    } catch (error) {
      gfError('[UniverseBackend] Failed to load universe data:', error);
      this.notifyStatus('error', `Failed to load universe: ${error.message}`);
      throw error;
    }

    const result = { universe, storeState };

    // CRITICAL: Load the new universe data into the graph store
    if (result?.storeState) {
      if (this.storeOperations?.loadUniverseFromFile) {
        gfLog('[UniverseBackend] Loading new universe data into graph store...');
        try {
          const success = this.storeOperations.loadUniverseFromFile(result.storeState);
          if (success) {
            // Validate that data was actually loaded
            const storeState = this.storeOperations.getState();
            const nodeCount = storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0;
            const graphCount = storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0;
            
            gfLog('[UniverseBackend] Successfully loaded universe data into graph store:', {
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
          gfError('[UniverseBackend] Failed to load universe data into graph store:', error);
          this.notifyStatus('error', `Failed to load universe data: ${error.message}`);
          throw error; // Re-throw to surface the error to UI
        }
      } else {
        gfError('[UniverseBackend] CRITICAL: Cannot load universe data - store operations not available');
        this.notifyStatus('error', 'Critical error: Store operations not initialized. Please refresh the page.');
        
        // Try to re-setup store operations
        try {
          await this.setupStoreOperations();
          if (this.storeOperations?.loadUniverseFromFile) {
            gfLog('[UniverseBackend] Store operations recovered, retrying data load...');
            this.storeOperations.loadUniverseFromFile(result.storeState);
            this.notifyStatus('success', `Universe switched after recovery: ${result.universe?.name || slug}`);
          }
        } catch (recoveryError) {
          gfError('[UniverseBackend] Failed to recover store operations:', recoveryError);
          throw new Error(`Universe data loading failed: Store operations unavailable. Please refresh the page.`);
        }
      }
    } else {
      gfWarn('[UniverseBackend] No storeState returned from universe switch - universe may be empty');
      this.notifyStatus('info', `Switched to empty universe: ${slug}`);
    }

    // Ensure engine is set up for the new active universe if Git is enabled (but don't block on it)
    const switchedUniverse = this.getUniverse(slug);
    if (switchedUniverse?.gitRepo?.enabled && switchedUniverse?.gitRepo?.linkedRepo) {
      setTimeout(() => {
        this.ensureGitSyncEngine(slug).catch(error => {
          gfWarn(`[UniverseBackend] Failed to setup engine after universe switch:`, error);
        });
      }, 100);
    }

    return result;
  }

  /**
   * Save active universe
   */
  async saveActiveUniverse(storeState = null, options = {}) {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    // Get current store state if not provided
    if (!storeState && this.storeOperations?.getState) {
      storeState = this.storeOperations.getState();
    }
    
    gfLog('[UniverseBackend] Saving active universe with store state:', {
      hasStoreState: !!storeState,
      hasGraphs: storeState?.graphs ? (storeState.graphs instanceof Map ? storeState.graphs.size : Object.keys(storeState.graphs).length) : 0,
      hasNodes: storeState?.nodePrototypes ? (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes).length) : 0
    });
    
    // Implementation is below - calling the full saveActiveUniverse implementation
    return this.saveActiveUniverseInternal(storeState, options);
  }

  /**
   * Internal save implementation
   */
  async saveActiveUniverseInternal(storeState, options = {}) {
    let universe = this.getActiveUniverse();
    if (!universe) {
      throw new Error('No active universe to save');
    }

    // Get store state if not provided
    if (!storeState) {
      if (this.storeOperations?.getState) {
        storeState = this.storeOperations.getState();
      } else {
        throw new Error('No store state provided and store operations not available');
      }
    }

    // Export data asynchronously to prevent UI blocking
    const redstringData = await new Promise((resolve) => {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          resolve(exportToRedstring(storeState));
        });
      } else {
        setTimeout(() => {
          resolve(exportToRedstring(storeState));
        }, 0);
      }
    });

    const results = [];
    const errors = [];
    const {
      skipGit = false,
      skipLocal = false,
      skipBrowser = false,
      suppressNotification = false
    } = options || {};

    gfLog('[UniverseBackend] saveActiveUniverseInternal options:', {
      skipGit,
      skipLocal,
      skipBrowser,
      suppressNotification
    });

    if (!skipLocal) {
      if (universe.localFile.enabled && this.fileHandles.has(universe.slug)) {
        try {
          gfLog('[UniverseBackend] Saving to linked local file (autosave)');
          await this.saveToLinkedLocalFile(universe.slug, storeState, { suppressNotification });
          results.push('local');
        } catch (error) {
          gfWarn('[UniverseBackend] Local file save failed during autosave:', error);
          errors.push(`Local: ${error.message}`);
        }
      } else if (universe.localFile.enabled) {
        gfWarn('[UniverseBackend] Local file enabled but missing handle during autosave');
      }
    } else {
      gfLog('[UniverseBackend] Local file save skipped by options');
    }

    // Save to Git if enabled and sync engine is available
    if (!skipGit && universe.gitRepo.enabled && this.gitSyncEngines.has(universe.slug)) {
      try {
        await this.saveToGit(universe, redstringData);
        results.push('git');
      } catch (error) {
        gfError('[UniverseBackend] Git save failed:', error);
        errors.push(`Git: ${error.message}`);
      }
    } else if (skipGit && universe.gitRepo.enabled) {
      gfLog('[UniverseBackend] Git save skipped by options');
    } else if (universe.gitRepo.enabled && !this.gitSyncEngines.has(universe.slug)) {
      gfLog('[UniverseBackend] Git enabled but sync engine not configured yet - skipping Git save');
      errors.push('Git: Sync engine not ready');
    }

    // Save to browser storage if enabled (always try as fallback)
    if (!skipBrowser && (universe.browserStorage.enabled || results.length === 0)) {
      try {
        await this.saveToBrowserStorage(universe, redstringData);
        results.push('browser');
      } catch (error) {
        gfError('[UniverseBackend] Browser storage save failed:', error);
        errors.push(`Browser: ${error.message}`);
      }
    } else if (skipBrowser) {
      gfLog('[UniverseBackend] Browser save skipped by options');
    }

    if (results.length > 0) {
      if (errors.length > 0) {
        if (!suppressNotification) {
          this.notifyStatus('warning', `Saved to: ${results.join(', ')} (${errors.length} failed)`);
        } else {
          gfWarn('[UniverseBackend] Silent save completed with warnings', {
            results,
            errors
          });
        }
      } else if (!suppressNotification) {
        this.notifyStatus('success', `Saved to: ${results.join(', ')}`);
      } else {
        gfLog('[UniverseBackend] Silent save completed successfully', { results });
      }
    } else {
      // Always surface total failure
      this.notifyStatus('error', `All save methods failed: ${errors.join('; ')}`);
      throw new Error(`All save methods failed: ${errors.join('; ')}`);
    }

    return results;
  }

  /**
   * Save to Git repository
   */
  async saveToGit(universe, redstringData) {
    const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
    if (!gitSyncEngine) {
      throw new Error('Git sync engine not configured for this universe');
    }

    gfLog('[UniverseBackend] Saving to Git via existing sync engine (no restart)');

    try {
      // Use the GitSyncEngine's existing export logic
      if (this.storeOperations?.getState) {
        const storeState = this.storeOperations.getState();
        // Force commit through the existing GitSyncEngine which handles SHA conflicts properly
        await gitSyncEngine.forceCommit(storeState);
      } else {
        throw new Error('Store operations not available for Git sync');
      }
    } catch (error) {
      // If force commit fails with 409, try conflict resolution
      if (error.message && error.message.includes('409')) {
        gfLog('[UniverseBackend] 409 conflict detected, attempting resolution');

        if (universe.sourceOfTruth === 'git') {
          // Git is source of truth, try to reload from Git first
          try {
            const gitData = await gitSyncEngine.loadFromGit();
            if (gitData) {
              const { storeState: newState } = importFromRedstring(gitData);
              if (this.storeOperations?.loadUniverseFromFile) {
                this.storeOperations.loadUniverseFromFile(newState);
              }

              this.notifyStatus('info', 'Loaded latest changes from Git repository');
              return; // Successfully resolved by loading Git data
            }
          } catch (loadError) {
            gfWarn('[UniverseBackend] Could not load from Git for conflict resolution:', loadError);
          }
        }

        // If Git load failed or local is source of truth, wait and retry
        gfLog('[UniverseBackend] Waiting 2 seconds before retry...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          if (this.storeOperations?.getState) {
            const storeState = this.storeOperations.getState();
            await gitSyncEngine.forceCommit(storeState);
            this.notifyStatus('success', 'Conflict resolved with retry');
          } else {
            throw new Error('Store operations not available for retry');
          }
        } catch (retryError) {
          throw new Error(`Persistent 409 conflict: ${retryError.message}`);
        }
      } else {
        throw error; // Re-throw non-409 errors
      }
    }
  }

  /**
   * Save to local file
   */
  async saveToLocalFile(universe, redstringData) {
    let fileHandle = this.fileHandles.get(universe.slug);

    if (!fileHandle) {
      // If no file handle but local storage is enabled, auto-prompt to set one up
      if (universe.localFile.enabled && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          gfLog('[UniverseBackend] No file handle for local save, prompting user to select file location');

          const suggestedName = universe.localFile.lastFilePath || universe.localFile.path;
          const hadPreviousHandle = universe.localFile.hadFileHandle;

          const message = hadPreviousHandle
            ? `Re-establish file connection for ${universe.name} (previously: ${suggestedName})`
            : `Set up local file for ${universe.name}`;

          this.notifyStatus('info', message);

          fileHandle = await window.showSaveFilePicker({
            suggestedName: suggestedName,
            types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }]
          });

          // Store the file handle
          this.setFileHandle(universe.slug, fileHandle);
          this.notifyStatus('success', `Local file ${hadPreviousHandle ? 're-' : ''}connected: ${fileHandle.name}`);

        } catch (error) {
          if (error.name === 'AbortError') {
            throw new Error('Local file setup cancelled by user');
          } else {
            throw new Error(`Failed to set up local file: ${error.message}`);
          }
        }
      } else if (universe.localFile.enabled) {
        throw new Error('No local file selected. Use the Universe Manager to pick a file location.');
      } else {
        throw new Error('Local file storage not enabled for this universe');
      }
    }

    const ensurePermission = async () => {
      const permission = await checkFileHandlePermission(fileHandle);
      if (permission === 'granted') return;
      const granted = await requestFileHandlePermission(fileHandle);
      if (granted !== 'granted') {
        throw new Error('Permission denied for local file access');
      }
    };

    const isPermissionError = (error) => {
      if (!error) return false;
      const name = String(error.name || '');
      const message = String(error.message || '').toLowerCase();
      return name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        message.includes('permission') ||
        message.includes('denied');
    };

    const jsonString = JSON.stringify(redstringData, null, 2);
    let writable;
    try {
      await ensurePermission();
      writable = await fileHandle.createWritable();
      await writable.write(jsonString);
      await writable.close();

      try {
        await touchFileHandle(universe.slug, fileHandle);
      } catch (error) {
        gfWarn('[UniverseBackend] Failed to touch file handle after save:', error);
      }
    } catch (error) {
      try { await writable?.close(); } catch (_) {}

      if (isPermissionError(error)) {
        this.notifyStatus('warning', 'Reauthorize local file access to continue saving this universe');
        throw new Error('Local file access was denied');
      }

      throw error;
    }
  }

  /**
   * Save to browser storage with size limits
   */
  async saveToBrowserStorage(universe, redstringData) {
    try {
      const db = await this.openBrowserDB();

      // Check storage quota before saving
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const dataSize = JSON.stringify(redstringData).length;
        const availableSpace = estimate.quota - estimate.usage;

        if (dataSize > availableSpace) {
          // Try to clean up old data first
          await this.cleanupBrowserStorage(db);

          // Check again
          const newEstimate = await navigator.storage.estimate();
          const newAvailableSpace = newEstimate.quota - newEstimate.usage;

          if (dataSize > newAvailableSpace) {
            throw new Error(`Data too large for browser storage: ${Math.round(dataSize/1024)}KB needed, ${Math.round(newAvailableSpace/1024)}KB available`);
          }
        }
      }

      const tx = db.transaction(['universes'], 'readwrite');
      const store = tx.objectStore('universes');

      store.put({
        id: universe.browserStorage.key,
        data: redstringData,
        savedAt: Date.now()
      });

      await new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      db.close();
    } catch (error) {
      gfError('[UniverseBackend] Browser storage save failed:', error);
      throw error;
    }
  }

  /**
   * Clean up old browser storage data
   */
  async cleanupBrowserStorage(db) {
    try {
      const tx = db.transaction(['universes'], 'readwrite');
      const store = tx.objectStore('universes');
      const request = store.getAll();

      const allData = await new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });

      // Sort by savedAt and keep only the 3 most recent
      allData.sort((a, b) => b.savedAt - a.savedAt);
      const toDelete = allData.slice(3);

      if (toDelete.length > 0) {
        const deleteTx = db.transaction(['universes'], 'readwrite');
        const deleteStore = deleteTx.objectStore('universes');

        toDelete.forEach(item => {
          deleteStore.delete(item.id);
        });

        await new Promise((resolve, reject) => {
          deleteTx.oncomplete = () => resolve();
          deleteTx.onerror = () => reject(deleteTx.error);
        });

        gfLog(`[UniverseBackend] Cleaned up ${toDelete.length} old browser storage entries`);
      }
    } catch (error) {
      gfWarn('[UniverseBackend] Browser storage cleanup failed:', error);
    }
  }

  /**
   * Open browser storage database
   */
  openBrowserDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('RedstringUniverses', 1);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('universes')) {
          db.createObjectStore('universes', { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Set file handle for a universe
   */
  async setFileHandle(slug, fileHandle) {
    this.fileHandles.set(slug, fileHandle);

    // Store file handle metadata in IndexedDB for persistence
    try {
      await storeFileHandleMetadata(slug, fileHandle, {
        universeSlug: slug,
        lastAccessed: Date.now()
      });
      gfLog(`[UniverseBackend] Stored file handle metadata for ${slug}`);
    } catch (error) {
      gfWarn(`[UniverseBackend] Failed to store file handle metadata:`, error);
    }

    // Also update the universe configuration
    const universe = this.getUniverse(slug);
    if (universe) {
      const hasActiveGitLink = !!(universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo);
      const shouldPromoteLocal = !hasActiveGitLink && universe.sourceOfTruth !== SOURCE_OF_TRUTH.LOCAL;
      this.updateUniverse(slug, {
        localFile: {
          ...universe.localFile,
          enabled: true,
          path: fileHandle.name || universe.localFile.path,
          hadFileHandle: true,
          lastFilePath: fileHandle.name || universe.localFile.path,
          fileHandleStatus: 'connected',
          unavailableReason: null
        },
        ...(shouldPromoteLocal ? { sourceOfTruth: SOURCE_OF_TRUTH.LOCAL } : {})
      });
    }

    // Persist file handle information to storage
    this.saveToStorage();
    await this.ensureSaveCoordinator();
  }

  /**
   * Setup file handle for universe (user picks file)
   */
  async setupFileHandle(slug) {
    try {
      // Get metadata to suggest the last known file name
      const metadata = await getFileHandleMetadata(slug);
      const universe = this.getUniverse(slug);
      const suggestedName = metadata?.fileName || universe?.localFile?.lastFilePath || `${slug}.redstring`;

      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }],
        multiple: false
      });

      await this.setFileHandle(slug, fileHandle);

      const wasReconnecting = metadata?.fileName && !this.fileHandles.has(slug);
      this.notifyStatus('success', `${wasReconnecting ? 'Reconnected' : 'Linked'} local file: ${fileHandle.name}`);
      return fileHandle;
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.notifyStatus('error', `Failed to setup file handle: ${error.message}`);
        throw error;
      }
    }
  }

  /**
   * Reload active universe
   */
  async reloadActiveUniverse() {
    try {
      const universe = this.getActiveUniverse();
      if (!universe) return false;

      gfLog('[UniverseBackend] Reloading active universe:', universe.name);

      let storeState = null;
      let loadMethod = 'unknown';

      try {
        storeState = await this.loadUniverseData(universe);
        loadMethod = universe.sourceOfTruth;
      } catch (primaryError) {
        gfWarn('[UniverseBackend] Primary load failed:', primaryError);
      }

      if (storeState) {
        if (this.storeOperations?.loadUniverseFromFile) {
          this.storeOperations.loadUniverseFromFile(storeState);
        }

        this.notifyStatus('success', `Reloaded universe from ${loadMethod}`);
        return true;
      }

      this.notifyStatus('warning', 'Could not reload universe from any source');
      return false;
    } catch (error) {
      gfError('[UniverseBackend] Failed to reload active universe:', error);
      this.notifyStatus('error', `Reload failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get all universes
   */
  getAllUniverses() {
    return Array.from(this.universes.values());
  }

  /**
   * Get active universe
   */
  getActiveUniverse() {
    const resolved = this.resolveUniverseEntry(this.activeUniverseSlug);
    return resolved ? resolved.universe : null;
  }

  /**
   * Get universe by slug
   */
  getUniverse(slug) {
    const resolved = this.resolveUniverseEntry(slug);
    return resolved ? resolved.universe : null;
  }

  /**
   * Load universe data based on source of truth priority
   */
  async loadUniverseData(universe) {
    const { sourceOfTruth } = universe;

    // Try primary source first
    if (sourceOfTruth === SOURCE_OF_TRUTH.GIT && universe.gitRepo.enabled) {
      try {
        const gitData = await this.loadFromGit(universe);
        if (gitData) return gitData;
      } catch (error) {
        gfWarn('[UniverseBackend] Git load failed, trying fallback:', error);
        // Direct-read fallback when engine isn't configured yet
        try {
          const directGitData = await this.loadFromGitDirect(universe);
          if (directGitData) return directGitData;
        } catch (fallbackError) {
          gfWarn('[UniverseBackend] Direct Git fallback failed:', fallbackError);
        }
      }
    }

    if (sourceOfTruth === SOURCE_OF_TRUTH.LOCAL && universe.localFile.enabled) {
      try {
        const localData = await this.loadFromLocalFile(universe);
        if (localData) return localData;
      } catch (error) {
        gfWarn('[UniverseBackend] Local file load failed, trying fallback:', error);
      }
    }

    // Try fallback sources
    if (sourceOfTruth !== SOURCE_OF_TRUTH.LOCAL && universe.localFile.enabled) {
      try {
        const localData = await this.loadFromLocalFile(universe);
        if (localData) return localData;
      } catch (error) {
        gfWarn('[UniverseBackend] Local fallback failed:', error);
      }
    }

    if (sourceOfTruth !== SOURCE_OF_TRUTH.GIT && universe.gitRepo.enabled) {
      try {
        const gitData = await this.loadFromGit(universe);
        if (gitData) return gitData;
      } catch (error) {
        gfWarn('[UniverseBackend] Git fallback failed:', error);
      }
    }

    // Browser storage fallback for mobile
    if (universe.browserStorage.enabled) {
      try {
        const browserData = await this.loadFromBrowserStorage(universe);
        if (browserData) return browserData;
      } catch (error) {
        gfWarn('[UniverseBackend] Browser storage fallback failed:', error);
      }
    }

    // Return empty state if nothing works
    gfWarn('[UniverseBackend] All load methods failed, creating empty state');
    return this.createEmptyState();
  }

  /**
   * Load from Git repository
   */
  async loadFromGit(universe) {
    const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
    if (!gitSyncEngine) {
      // Try a provider-backed direct read before giving up
      const direct = await this.loadFromGitDirect(universe);
      if (direct) return direct;
      throw new Error('Git sync engine not configured for this universe');
    }

    const redstringData = await gitSyncEngine.loadFromGit();
    if (!redstringData) return null;

    const { storeState } = importFromRedstring(redstringData);
    return storeState;
  }

  /**
   * Direct Git read without requiring a registered GitSyncEngine
   */
  async loadFromGitDirect(universe) {
    try {
      const linked = universe?.gitRepo?.linkedRepo;
      if (!linked) return null;

      let user, repo;
      if (typeof linked === 'string') {
        const parts = linked.split('/');
        user = parts[0];
        repo = parts[1];
      } else if (linked && typeof linked === 'object') {
        user = linked.user;
        repo = linked.repo;
      }
      if (!user || !repo) return null;

      // Prefer GitHub App installation token when available; fall back to OAuth
      let token;
      let authMethod = 'oauth';
      try {
        const app = persistentAuth.getAppInstallation?.();
        if (app?.installationId) {
          const tokenExpiresAt = app.tokenExpiresAt ? new Date(app.tokenExpiresAt) : null;
          const now = new Date();
          const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
          const needsRefresh = !app.accessToken || !tokenExpiresAt || tokenExpiresAt < fiveMinutesFromNow;

          if (needsRefresh) {
            const tokenResp = await oauthFetch('/api/github/app/installation-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ installation_id: app.installationId })
            });

            if (tokenResp.ok) {
              const tokenData = await tokenResp.json();
              token = tokenData.token;
              authMethod = 'github-app';

              const expiresAt = new Date(now.getTime() + 60 * 60 * 1000);
              const updatedApp = { ...app, accessToken: token, tokenExpiresAt: expiresAt.toISOString() };
              await persistentAuth.storeAppInstallation(updatedApp);
            } else {
              token = await persistentAuth.getAccessToken();
              authMethod = token ? 'oauth' : authMethod;
            }
          } else {
            token = app.accessToken;
            authMethod = 'github-app';
          }
        } else {
          token = await persistentAuth.getAccessToken();
          authMethod = token ? 'oauth' : authMethod;
        }
      } catch (_) {
        try {
          token = await persistentAuth.getAccessToken();
          authMethod = token ? 'oauth' : authMethod;
        } catch (__) {}
      }
      if (!token) {
        this.notifyStatus('error', 'Git authentication required to access repository');
        return null;
      }

      const provider = SemanticProviderFactory.createProvider({
        type: 'github',
        user,
        repo,
        token,
        authMethod,
        semanticPath: universe?.gitRepo?.schemaPath || 'schema'
      });

      try {
        const ok = await provider.isAvailable();
        if (!ok) {
          gfWarn('[UniverseBackend] Provider unavailable or unauthorized; skipping direct Git access');
          return null;
        }
      } catch (e) {
        gfWarn('[UniverseBackend] Provider availability check failed; skipping direct Git access:', e?.message || e);
        return null;
      }

      // universeFolder is just the folder name (e.g., "default"), not the full path
      const universeFolder = universe?.gitRepo?.universeFolder || universe.slug;
      const fileName = universe?.gitRepo?.universeFile || `${universe.slug}.redstring`;

      // Construct full path: universes/{folder}/{file}
      const filePath = `universes/${universeFolder}/${fileName}`;

      let content;
      try {
        content = await provider.readFileRaw(filePath);
      } catch (readError) {
        content = null;
      }

      if (!content || typeof content !== 'string' || content.trim() === '') {
        try {
          const initialStoreState = this.createEmptyState();
          const initialRedstring = await new Promise((resolve) => {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => resolve(exportToRedstring(initialStoreState)));
            } else {
              setTimeout(() => resolve(exportToRedstring(initialStoreState)), 0);
            }
          });
          await provider.writeFileRaw(filePath, JSON.stringify(initialRedstring, null, 2));
          this.notifyStatus('success', `Created new universe file at ${filePath}`);
          const { storeState } = importFromRedstring(initialRedstring);
          return storeState;
        } catch (createErr) {
          gfWarn('[UniverseBackend] Failed to create initial universe file on Git:', createErr);
          return null;
        }
      }

      let redstringData;
      try {
        redstringData = JSON.parse(content);
      } catch (e) {
        gfWarn('[UniverseBackend] Direct Git read parse failed:', e.message);
        return null;
      }

      const { storeState } = importFromRedstring(redstringData);
      return storeState;
    } catch (error) {
      gfWarn('[UniverseBackend] Direct Git read failed:', error);
      return null;
    }
  }

  /**
   * Load from local file
   */
  async loadFromLocalFile(universe) {
    const fileHandle = this.fileHandles.get(universe.slug);
    if (!fileHandle) {
      throw new Error('No file handle available for this universe');
    }

    const file = await fileHandle.getFile();
    const text = await file.text();

    if (!text || text.trim() === '') {
      return null;
    }

    const redstringData = JSON.parse(text);
    const { storeState } = importFromRedstring(redstringData);
    return storeState;
  }

  /**
   * Load from browser storage
   */
  async loadFromBrowserStorage(universe) {
    try {
      const db = await this.openBrowserDB();
      const tx = db.transaction(['universes'], 'readonly');
      const store = tx.objectStore('universes');
      const req = store.get(universe.browserStorage.key);

      const result = await new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });

      db.close();

      if (!result) return null;

      const { storeState } = importFromRedstring(result.data);
      return storeState;
    } catch (error) {
      gfError('[UniverseBackend] Browser storage load failed:', error);
      return null;
    }
  }

  /**
   * Create new universe
   */
  async createUniverse(name, options = {}) {
    gfLog(`[UniverseBackend] createUniverse called with name: "${name}", options:`, options);

    try {
      if (!this.isInitialized) {
        gfLog('[UniverseBackend] Backend not initialized, initializing now...');
        await this.initialize();
        gfLog('[UniverseBackend] Backend initialization completed');
      }
    } catch (error) {
      gfWarn('[UniverseBackend] Initialization failed, continuing anyway:', error);
    }

    gfLog('[UniverseBackend] Creating universe via direct implementation...');

    const slug = this.generateUniqueSlug(name);
    const safeName = (typeof name === 'string' && name.trim().length > 0) ? name : slug;
    const universe = this.safeNormalizeUniverse({
      slug,
      name: safeName,
      sourceOfTruth: options.sourceOfTruth || (this.isGitOnlyMode ? SOURCE_OF_TRUTH.GIT : SOURCE_OF_TRUTH.LOCAL),
      localFile: {
        enabled: options.enableLocal ?? true,
        path: this.sanitizeFileName(safeName)
      },
      gitRepo: {
        enabled: options.enableGit ?? false,
        linkedRepo: options.linkedRepo || null,
        schemaPath: options.schemaPath || 'schema'
      }
    });

    this.universes.set(slug, universe);
    this.saveToStorage();

    gfLog('[UniverseBackend] Universe created:', universe.slug);

    // Set as active universe and ensure store is updated
    try {
      gfLog('[UniverseBackend] Setting new universe as active...');
      this.activeUniverseSlug = slug;
      this.saveToStorage();

      // Ensure the graph store is properly initialized with empty state
      if (this.storeOperations?.loadUniverseFromFile) {
        const emptyState = this.createEmptyState();
        this.storeOperations.loadUniverseFromFile(emptyState);
        gfLog('[UniverseBackend] Graph store initialized with empty state for new active universe');
      }
    } catch (error) {
      gfWarn('[UniverseBackend] Failed to activate new universe:', error);
    }

    this.notifyStatus('success', `Created universe: ${name}`);

    // Auto-setup engine if Git is enabled
    if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
      gfLog('[UniverseBackend] Scheduling async Git sync engine setup...');
      setTimeout(() => {
        this.ensureGitSyncEngine(universe.slug).catch(error => {
          gfWarn(`[UniverseBackend] Failed to auto-setup engine for new universe:`, error);
        });
      }, 100);
    }

    gfLog('[UniverseBackend] createUniverse completed successfully, returning universe');
    return universe;
  }

  /**
   * Delete universe
   */
  deleteUniverse(slug) {
    if (!this.isInitialized) {
      this.initialize();
    }

    if (this.universes.size <= 1) {
      throw new Error('Cannot delete the last universe');
    }

    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const { key, universe } = resolved;

    // Remove engine first
    this.removeGitSyncEngine(slug);

    // Delete from universes
    this.universes.delete(key);
    this.fileHandles.delete(key);

    // If we deleted the active universe, switch to another one
    if (this.activeUniverseSlug === key) {
      this.activeUniverseSlug = this.universes.keys().next().value;
    }

    this.saveToStorage();
    this.notifyStatus('info', `Deleted universe: ${universe.name}`);
  }

  /**
   * Update universe
   */
  async updateUniverse(slug, updates) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    gfLog(`[UniverseBackend] Updating universe ${slug}:`, updates);

    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const { key, universe } = resolved;

    const updated = {
      ...universe,
      ...updates,
      lastModified: new Date().toISOString()
    };

    this.universes.set(key, this.safeNormalizeUniverse(updated));
    this.saveToStorage();

    this.notifyStatus('info', `Updated universe: ${universe.name}`);

    const result = updated;

    // Get universe for potential use below
    const updatedUniverse = this.getUniverse(slug);
    
    // If Git repo was enabled or linked repo was updated, ensure sync engine is set up
    if (updates.gitRepo) {
      if (updatedUniverse?.gitRepo?.enabled && updatedUniverse?.gitRepo?.linkedRepo) {
        gfLog(`[UniverseBackend] Git repo updated for ${slug}, ensuring sync engine is set up`);
        setTimeout(() => {
          this.ensureGitSyncEngine(slug).catch(error => {
            gfWarn(`[UniverseBackend] Failed to setup engine after repo update:`, error);
            this.notifyStatus('warning', `Git sync setup failed: ${error.message}`);
          });
        }, 100);
      } else if (updates.gitRepo.enabled === false) {
        // Git was disabled, remove the engine
        gfLog(`[UniverseBackend] Git disabled for ${slug}, removing sync engine`);
        this.removeGitSyncEngine(slug);
      }
    }

    // If sources were updated, notify about the change
    if (updates.sources) {
      this.notifyStatus('info', `Data sources updated for universe: ${updatedUniverse?.name || slug}`);
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
  async forceSave(universeSlug, storeState, options = {}) {
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
    
    gfLog(`[UniverseBackend] Force saving universe ${universeSlug}`);

    let universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    // Check what storage is enabled (local-first approach)
    let localConfig = universe.localFile || universe.raw?.localFile || {};
    let hasLocalHandle = this.fileHandles.has(universeSlug);
    let hasLocalFileEnabled = localConfig?.enabled !== false;
    let hasLocalFile = hasLocalFileEnabled && hasLocalHandle;
    const skipGit = options?.skipGit === true;
    const hasGitRepo = universe.raw?.gitRepo?.enabled && (universe.raw?.gitRepo?.linkedRepo || universe.gitRepo?.linkedRepo);
    const sourceOfTruth = universe.sourceOfTruth || 'browser';

    gfLog(`[UniverseBackend] Save options for ${universeSlug}:`, {
      sourceOfTruth,
      hasLocalFile,
      hasGitRepo,
      localFilePath: universe.raw?.localFile?.path
    });

    if (hasLocalFileEnabled && !hasLocalHandle && localConfig?.hadFileHandle) {
      gfWarn(`[UniverseBackend] Local file handle missing for ${universeSlug}; marking as needs reconnection`);
      try {
        await this.updateUniverse(universeSlug, {
          localFile: {
            ...localConfig,
            hadFileHandle: false,
            fileHandleStatus: 'needs_reconnect',
            unavailableReason: 'Reauthorize file access to continue saving locally.'
          }
        });
        this.notifyStatus('warning', 'Reconnect local file to continue saving changes locally');
      } catch (updateError) {
        gfWarn('[UniverseBackend] Failed to mark local file for reconnection:', updateError);
      }
      universe = this.getUniverse(universeSlug) || universe;
      localConfig = universe.localFile || universe.raw?.localFile || {};
      hasLocalHandle = this.fileHandles.has(universeSlug);
      hasLocalFileEnabled = localConfig?.enabled !== false;
      hasLocalFile = hasLocalFileEnabled && hasLocalHandle;
    }

    try {
      const results = {
        localFile: null,
        git: null,
        browser: null
      };
      let hasAnySuccess = false;

      // Save to local file if enabled and has handle
      if (hasLocalFile && this.fileHandles.has(universeSlug)) {
        gfLog(`[UniverseBackend] Saving to local file`);
        try {
          const result = await this.saveToLinkedLocalFile(universeSlug, storeState);
          results.localFile = { success: true, fileName: result.fileName };
          hasAnySuccess = true;
          gfLog(`[UniverseBackend] ✓ Local file saved: ${result.fileName}`);
        } catch (error) {
          gfWarn(`[UniverseBackend] ✗ Local file save failed:`, error);
          results.localFile = { success: false, error: error.message };
        }
      } else if (hasLocalFileEnabled) {
        results.localFile = {
          success: false,
          error: 'file_handle_missing'
        };
      }

      // Save to Git if enabled (regardless of source of truth)
      if (hasGitRepo && !skipGit) {
        gfLog(`[UniverseBackend] Saving to Git repository`);

        // Track operation start for Git
        this.trackGitOperationStart(universeSlug, 'force-save', {
          isConnected: !!this.authStatus?.isAuthenticated,
          hasUnsavedChanges: true
        });

        try {
          let engine = this.gitSyncEngines.get(universeSlug);
          if (!engine) {
            gfLog(`[UniverseBackend] Creating Git engine for ${universeSlug}`);
            engine = await this.ensureGitSyncEngine(universeSlug);
          }

          if (engine) {
            const result = await engine.forceCommit(storeState);

            // Track successful completion
            this.trackGitOperationComplete(universeSlug, 'force-save', true, {
              commitHash: result?.commitHash,
              bytesWritten: result?.bytesWritten,
              fileName: `universes/${universeSlug}/${universeSlug}.redstring`
            });

            results.git = { success: true, commitHash: result?.commitHash };
            hasAnySuccess = true;
            gfLog(`[UniverseBackend] ✓ Git saved: ${result?.commitHash}`);
          }
        } catch (error) {
          gfWarn(`[UniverseBackend] ✗ Git save failed:`, error);
          this.trackGitOperationComplete(universeSlug, 'force-save', false, {
            error: error.message
          });
          results.git = { success: false, error: error.message };
        }
      } else if (hasGitRepo && skipGit) {
        gfLog('[UniverseBackend] Skipping Git save (skipGit flag set)');
      }

      // Always save to browser storage as backup/cache (skip local/git to avoid duplicate writes)
      gfLog(`[UniverseBackend] Saving to browser storage`);
      try {
        await this.saveActiveUniverse(storeState, { skipLocal: true, skipGit: true });
        results.browser = { success: true };
        hasAnySuccess = true;
        gfLog(`[UniverseBackend] ✓ Browser storage saved`);
      } catch (error) {
        gfWarn(`[UniverseBackend] ✗ Browser storage save failed:`, error);
        results.browser = { success: false, error: error.message };
      }

      // Build success message
      const savedTo = [];
      if (results.localFile?.success) savedTo.push(`local file (${results.localFile.fileName})`);
      if (results.git?.success) savedTo.push('Git repository');
      if (results.browser?.success && savedTo.length === 0) savedTo.push('browser storage');

      if (hasAnySuccess) {
        const message = savedTo.length > 0 
          ? `Saved to ${savedTo.join(' and ')}` 
          : 'Saved successfully';
        this.notifyStatus('success', message);
        return { 
          success: true, 
          savedTo: results,
          sourceOfTruth // For reference on which one is authoritative
        };
      } else {
        throw new Error('All save methods failed');
      }

    } catch (error) {
      gfError(`[UniverseBackend] All save methods failed for ${universeSlug}:`, error);
      this.notifyStatus('error', `Save failed: ${error.message}`);
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
    
    gfLog(`[UniverseBackend] Reloading universe: ${universeSlug}`);

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    // Determine the source of truth
    const sourceOfTruth = universe.sourceOfTruth || 'browser';
    gfLog(`[UniverseBackend] Reloading from source of truth: ${sourceOfTruth}`);

    try {
      // Use loadUniverseData method which handles all sources
      const data = await this.loadUniverseData(universe);
      
      if (data && this.storeOperations?.loadState) {
        gfLog(`[UniverseBackend] Loading universe data into store:`, {
          nodeCount: data.nodePrototypes ? (data.nodePrototypes instanceof Map ? data.nodePrototypes.size : Object.keys(data.nodePrototypes).length) : 0,
          graphCount: data.graphs ? (data.graphs instanceof Map ? data.graphs.size : Object.keys(data.graphs).length) : 0
        });
        await this.storeOperations.loadState(data);
        gfLog(`[UniverseBackend] Universe reloaded successfully from ${sourceOfTruth}`);
        this.notifyStatus('success', `Universe reloaded from ${sourceOfTruth}`);
        return { success: true, source: sourceOfTruth };
      } else {
        gfWarn(`[UniverseBackend] No data found or store operations not available`);
        return { success: false, source: sourceOfTruth };
      }
    } catch (error) {
      gfError(`[UniverseBackend] Failed to reload universe:`, error);
      this.notifyStatus('error', `Failed to reload universe: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download universe as local .redstring file
   */
  async downloadLocalFile(universeSlug, storeState = null) {
    gfLog(`[UniverseBackend] Downloading local file for universe: ${universeSlug}`);

    const universe = this.getUniverse(universeSlug);
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
      gfError(`[UniverseBackend] Failed to download ${fileName}:`, error);
      this.notifyStatus('error', `Download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Download universe data directly from linked Git repository
   */
  async downloadGitUniverse(universeSlug) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    if (!universe.gitRepo?.enabled || !universe.gitRepo?.linkedRepo) {
      throw new Error('No linked Git repository available for this universe');
    }

    const fileName = universe.gitRepo?.universeFile || `${universeSlug}.redstring`;
    let storeState = null;

    try {
      storeState = await this.loadFromGitDirect(universe);
    } catch (error) {
      gfWarn('[UniverseBackend] Direct Git download failed, attempting via sync engine:', error);
    }

    if (!storeState) {
      try {
        await this.ensureGitSyncEngine(universeSlug);
        storeState = await this.loadFromGit(universe);
      } catch (error) {
        gfError('[UniverseBackend] Unable to load universe from Git sync engine:', error);
        throw new Error(`Failed to load data from Git repository: ${error.message}`);
      }
    }

    if (!storeState) {
      throw new Error('Git repository did not return any universe data');
    }

    try {
      downloadRedstringFile(storeState, fileName);
      this.notifyStatus('success', `Downloaded ${fileName} from Git`);
      return { success: true, fileName };
    } catch (error) {
      gfError(`[UniverseBackend] Failed to download ${fileName} from Git:`, error);
      this.notifyStatus('error', `Download failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Upload/Import universe from local .redstring file
   */
  async uploadLocalFile(file, targetUniverseSlug = null) {
    gfLog(`[UniverseBackend] Uploading local file: ${file.name}`);
    
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
          gfError(`[UniverseBackend] Failed to import ${file.name}:`, error);
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
      gfLog(`[UniverseBackend] Stored file handle metadata for ${universeSlug}`);
    } catch (error) {
      gfWarn(`[UniverseBackend] Failed to store file handle metadata:`, error);
    }

    const universe = this.getUniverse(universeSlug);
    const hasActiveGitLink = !!(universe?.gitRepo?.enabled && universe?.gitRepo?.linkedRepo);
    const shouldPromoteLocal = !hasActiveGitLink && universe?.sourceOfTruth !== SOURCE_OF_TRUTH.LOCAL;

    await this.updateUniverse(universeSlug, {
      localFile: {
        ...(universe?.localFile || {}),
        enabled: true,
        path: fileHandle.name,
        hadFileHandle: true,
        fileHandleStatus: 'connected',
        unavailableReason: null
      },
      ...(shouldPromoteLocal ? { sourceOfTruth: SOURCE_OF_TRUTH.LOCAL } : {})
    });
    await this.ensureSaveCoordinator();
    this.notifyStatus('success', `Linked file handle for ${universe?.name || universeSlug}`);
    return { success: true, fileName: fileHandle.name };
  }

  /**
   * Prompt user to select a file handle and store it (pick or saveAs)
   */
  async setupLocalFileHandle(universeSlug, options = {}) {
    const mode = options?.mode === 'saveAs' ? 'saveAs' : 'pick';
    const universe = this.getUniverse(universeSlug);
    
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
  async saveToLinkedLocalFile(universeSlug, storeState = null, options = {}) {
    const {
      suppressNotification = false
    } = options || {};
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

    const ensurePermission = async () => {
      const permission = await checkFileHandlePermission(handle);
      if (permission === 'granted') return;
      const granted = await requestFileHandlePermission(handle);
      if (granted !== 'granted') {
        throw new Error('Permission denied for local file access');
      }
    };

    const isPermissionError = (error) => {
      if (!error) return false;
      const name = String(error.name || '');
      const message = String(error.message || '').toLowerCase();
      return name === 'NotAllowedError' ||
        name === 'SecurityError' ||
        message.includes('permission') ||
        message.includes('denied');
    };

    let writable;
    try {
      await ensurePermission();
      writable = await handle.createWritable();
      await writable.write(new Blob([jsonString], { type: 'application/json' }));
      await writable.close();
      
      // Update last accessed time in persistence
      try {
        await touchFileHandle(universeSlug, handle);
      } catch (error) {
        gfWarn('[UniverseBackend] Failed to touch file handle after save:', error);
      }
    } catch (error) {
      try { await writable?.close(); } catch (_) {}

      if (isPermissionError(error)) {
        gfWarn('[UniverseBackend] Local file permission denied during save, flagging reconnect requirement');
        const universe = this.getUniverse(universeSlug);
        if (universe) {
          await this.updateUniverse(universeSlug, {
            localFile: {
              ...universe.localFile,
              hadFileHandle: false,
              fileHandleStatus: 'needs_reconnect',
              unavailableReason: 'Permission denied. Reconnect the local file to continue saving.'
            }
          });
        }
        this.notifyStatus('warning', 'Reauthorize local file access to continue saving this universe');
      }

      throw error;
    }

    const universe = this.getUniverse(universeSlug);
    if (universe) {
      await this.updateUniverse(universeSlug, {
        localFile: {
          ...universe.localFile,
          hadFileHandle: true,
          lastFilePath: handle.name || universe.localFile.lastFilePath,
          lastSaved: new Date().toISOString(),
          fileHandleStatus: 'connected',
          unavailableReason: null
        }
      });
    }

    if (!suppressNotification) {
      this.notifyStatus('success', `Saved to ${handle.name}`);
    } else {
      gfLog('[UniverseBackend] Local file save completed without user notification');
    }
    return { success: true, fileName: handle.name };
  }

  /**
   * Link local file to universe (for future saves/loads)
   */
  async linkLocalFileToUniverse(universeSlug, filePath) {
    gfLog(`[UniverseBackend] Linking local file to universe ${universeSlug}: ${filePath}`);

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    // Update universe with local file configuration (preserving existing localFile properties)
    const hasActiveGitLink = !!(universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo);
    const shouldPromoteLocal = !hasActiveGitLink && universe.sourceOfTruth !== SOURCE_OF_TRUTH.LOCAL;

    await this.updateUniverse(universeSlug, {
      localFile: {
        ...universe.localFile, // Preserve existing properties like hadFileHandle
        enabled: true,
        path: filePath,
        lastFilePath: filePath,
        lastSaved: universe.localFile?.lastSaved || null
      },
      ...(shouldPromoteLocal ? { sourceOfTruth: SOURCE_OF_TRUTH.LOCAL } : {})
    });

    this.notifyStatus('success', `Linked local file to ${universe.name || universeSlug}`);
    return { success: true, filePath };
  }

  /**
   * Remove linked local file from a universe
   */
  async removeLocalFileLink(universeSlug) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    this.fileHandles.delete(universeSlug);

    try {
      await removeFileHandleMetadata(universeSlug);
      gfLog(`[UniverseBackend] Removed file handle metadata for ${universeSlug}`);
    } catch (error) {
      gfWarn(`[UniverseBackend] Failed to remove file handle metadata:`, error);
    }

    const updates = {
      localFile: {
        ...universe.localFile,
        enabled: false,
        hadFileHandle: false,
        lastSaved: null,
        fileHandleStatus: 'disconnected',
        unavailableReason: 'Local file unlinked'
      }
    };

    if (universe.sourceOfTruth === SOURCE_OF_TRUTH.LOCAL) {
      if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
        updates.sourceOfTruth = SOURCE_OF_TRUTH.GIT;
      } else {
        updates.sourceOfTruth = SOURCE_OF_TRUTH.BROWSER;
      }
    }

    await this.updateUniverse(universeSlug, updates);
    this.saveToStorage();
    this.notifyStatus('info', `Unlinked local file from ${universe.name || universeSlug}`);
    return { success: true };
  }

  /**
   * Upload and import a local .redstring file to a universe
   */
  async uploadLocalFile(file, targetUniverseSlug) {
    await this.initialize();

    if (!file || !file.name) {
      throw new Error('Please select a file to import');
    }

    if (!file.name.endsWith('.redstring')) {
      gfWarn(`[UniverseBackend] Importing non-.redstring file: ${file.name}`);
    }

    gfLog(`[UniverseBackend] Uploading local file ${file.name} to universe ${targetUniverseSlug}`);

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
      const currentActiveSlug = this.getActiveUniverse()?.slug;
      if (currentActiveSlug !== targetUniverseSlug) {
        await this.switchActiveUniverse(targetUniverseSlug);
      }

      // Load the imported state
      this.storeOperations.loadUniverseFromFile(storeState);

      // Enable local file storage for this universe
      await this.linkLocalFileToUniverse(targetUniverseSlug, file.name);

      const updatedUniverse = this.getUniverse(targetUniverseSlug);
      if (updatedUniverse) {
        await this.updateUniverse(targetUniverseSlug, {
          localFile: {
            ...updatedUniverse.localFile,
            lastSaved: new Date().toISOString(),
            hadFileHandle: updatedUniverse.localFile?.hadFileHandle ?? false
          }
        });
      }

      const nodeCount = storeState?.nodePrototypes ?
        (storeState.nodePrototypes instanceof Map ? storeState.nodePrototypes.size : Object.keys(storeState.nodePrototypes || {}).length) : 0;

      // Note: File input gives us a one-time File object, not a persistent FileSystemFileHandle
      // User needs to use "Pick File" or "Save As" to establish persistent file connection for auto-save
      gfLog(`[UniverseBackend] File imported. To enable auto-save, use "Pick File" to establish persistent connection.`);
      
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

    const universe = this.getUniverse(universeSlug);
    if (!universe) {
      throw new Error(`Universe ${universeSlug} not found`);
    }

    gfLog('[UniverseBackend] setSourceOfTruth - universe structure:', {
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

    const localConfig = universe.raw?.localFile || universe.localFile || {};
    if (sourceType === 'local' && !localConfig.enabled) {
      throw new Error('Cannot set local as source of truth - local storage slot is disabled');
    }

    // Update the universe configuration
    await this.updateUniverse(universeSlug, {
      sourceOfTruth: sourceType
    });
    this.authStatus = persistentAuth.getAuthStatus();
    const updatedUniverse = this.getUniverse(universeSlug);
    gfLog('[UniverseBackend] Source of truth updated:', {
      slug: universeSlug,
      sourceType,
      storedSource: updatedUniverse?.sourceOfTruth,
      rawSource: updatedUniverse?.raw?.sourceOfTruth,
      authStatus: this.authStatus,
      timestamp: new Date().toISOString()
    });

    this.notifyStatus('success', `Set ${sourceType === 'git' ? 'repository' : 'local file'} as primary source for ${universe.name || universeSlug}`);

    if (sourceType === 'local' && !localConfig.hadFileHandle) {
      this.notifyStatus('warning', 'Local file is primary but no persistent file handle is linked. Use "Pick File" to enable auto-save.');
    }

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
    gfLog(`[UniverseBackend] Starting ${operation} for ${universeSlug}`);
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

    gfLog(`[UniverseBackend] ${success ? 'Completed' : 'Failed'} ${operation} for ${universeSlug} ${duration ? `in ${duration}ms` : ''}`);

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
        gfWarn('[UniverseBackend] Git status handler error:', error);
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
        gfWarn('[UniverseBackend] Status handler error:', error);
      }
    });
  }

  /**
   * Cleanup - stop all engines
   */
  async cleanup() {
    gfLog('[UniverseBackend] Cleaning up backend service...');

    for (const [slug, engine] of this.gitSyncEngines) {
      try {
        engine.stop();
      } catch (error) {
        gfWarn(`[UniverseBackend] Failed to stop engine for ${slug}:`, error);
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
