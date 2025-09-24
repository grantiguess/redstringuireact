/**
 * Universe Manager - Unified system for managing multiple universes
 * Bridges FileStorage, GitNativeFederation, and GitSyncEngine
 * Each universe has dual storage slots: local file + git repository
 * Supports Git-Only mode for mobile/tablet devices
 */

import { exportToRedstring, importFromRedstring } from '../formats/redstringFormat.js';
import { v4 as uuidv4 } from 'uuid';
import { 
  getCurrentDeviceConfig, 
  shouldUseGitOnlyMode, 
  getOptimalDeviceConfig,
  hasCapability 
} from '../utils/deviceDetection.js';
import { persistentAuth } from '../services/persistentAuth.js';
import { SemanticProviderFactory } from './gitNativeProvider.js';
import { oauthFetch } from './bridgeConfig.js';
import { storageWrapper } from '../utils/storageWrapper.js';

// NO GRAPH STORE IMPORT - This creates circular dependency
// Store operations will be injected from outside when needed

// Lazy import to avoid circular dependency
let _fileStorage = null;
const getFileStorage = async () => {
  if (!_fileStorage) {
    _fileStorage = await import('../store/fileStorage.js');
  }
  return _fileStorage;
};

// Storage keys
const STORAGE_KEYS = {
  UNIVERSES_LIST: 'unified_universes_list',
  ACTIVE_UNIVERSE: 'active_universe_slug',
  UNIVERSE_FILE_HANDLES: 'universe_file_handles'
};


// Default source of truth is Git (no longer experimental)
const SOURCE_OF_TRUTH = {
  LOCAL: 'local',    // Local .redstring file is authoritative
  GIT: 'git',        // Git repository is authoritative (default)
  BROWSER: 'browser' // Browser storage fallback for mobile
};

class UniverseManager {
  constructor() {
    this.universes = new Map();
    this.activeUniverseSlug = null;
    this.fileHandles = new Map(); // slug -> FileSystemFileHandle
    this.gitSyncEngines = new Map(); // slug -> GitSyncEngine
    this.statusHandlers = new Set();

    // Device-aware configuration (lazy initialization to avoid circular dependencies)
    this.deviceConfig = null;
    this.isGitOnlyMode = false;

    // Process watchdog to ensure Git sync engines stay alive
    this.watchdogInterval = null;
    this.watchdogDelay = 60000; // Default delay, will be updated when device config loads

    // Store operations injected from outside to avoid circular dependencies
    this.storeOperations = null;

    this.loadFromStorage();

    // Initialize device config after a brief delay to avoid circular dependencies
    setTimeout(() => {
      this.initializeDeviceConfig();
    }, 100);
  }

  // Set store operations from outside to avoid circular dependencies
  setStoreOperations(storeOperations) {
    this.storeOperations = storeOperations;
  }

  // Initialize device configuration (delayed to avoid circular dependencies)
  initializeDeviceConfig() {
    // Use a flag to prevent recursive initialization attempts
    if (this._initializingDeviceConfig) {
      console.warn('[UniverseManager] Device config initialization already in progress, skipping');
      return;
    }
    
    this._initializingDeviceConfig = true;
    
    try {
      // Simple device detection without calling complex utilities
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const screenWidth = window.screen?.width || 1920;
      const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
      const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/i.test(navigator.userAgent.toLowerCase()) || 
                       (/macintosh/i.test(navigator.userAgent.toLowerCase()) && isTouch);
      const isSmallScreen = screenWidth <= 768;
      const isMediumScreen = screenWidth <= 1024;
      
      // Determine if Git-Only mode should be enabled
      const shouldUseGitOnly = isMobile || isTablet || !('showSaveFilePicker' in window) || (isTouch && isMediumScreen);
      
      // Set device config directly without external function calls
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
      
      // Update watchdog delay based on device
      this.watchdogDelay = this.deviceConfig.autoSaveFrequency * 60;
      
      console.log('[UniverseManager] Device config initialized directly:', {
        deviceType: this.deviceConfig.deviceInfo.type,
        gitOnlyMode: this.isGitOnlyMode,
        sourceOfTruth: this.deviceConfig.sourceOfTruth,
        touchOptimized: this.deviceConfig.touchOptimizedUI
      });
      
      // Re-normalize all universes now that device config is available
      this.applyDeviceConfigToUniverses();
      
      // Start watchdog with device-appropriate delay
      const watchdogStartDelay = this.deviceConfig.deviceInfo.isMobile ? 60000 : 30000;
      setTimeout(() => {
        this.startWatchdog();
      }, watchdogStartDelay);
      
      // Listen for device configuration changes (orientation, etc.)
      if (typeof window !== 'undefined') {
        window.addEventListener('redstring:device-config-ready', (event) => {
          this.deviceConfig = event.detail;
          this.isGitOnlyMode = this.deviceConfig.gitOnlyMode;
          console.log('[UniverseManager] Device config updated from event:', this.deviceConfig);
        });
      }
    } catch (error) {
      console.error('[UniverseManager] Device config initialization failed completely:', error);
      // Ultra-safe fallback
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

  // Initialize background sync services (called at app startup)
  async initializeBackgroundSync() {
    try {
      console.log('[UniverseManager] Initializing background sync services...');

      console.log('[UniverseManager] Step 1: Initializing persistentAuth...');
      const authStartTime = Date.now();
      await persistentAuth.initialize();
      console.log(`[UniverseManager] PersistentAuth initialized in ${Date.now() - authStartTime}ms`);

      console.log('[UniverseManager] Step 2: Getting auth status...');
      const authStatus = persistentAuth.getAuthStatus();
      console.log('[UniverseManager] Auth status:', authStatus);

      if (!authStatus.hasValidToken) {
        console.log('[UniverseManager] No valid auth token, skipping Git sync setup');
        return;
      }

      console.log('[UniverseManager] Step 3: Getting active universe...');
      const activeUniverse = this.getActiveUniverse();
      console.log('[UniverseManager] Active universe:', activeUniverse?.slug || 'none');

      if (activeUniverse && activeUniverse.gitRepo?.linkedRepo && activeUniverse.gitRepo?.enabled) {
        console.log('[UniverseManager] Step 4: Setting up background Git sync for active universe');
        console.log('[UniverseManager] Git repo config:', activeUniverse.gitRepo);

        try {
          console.log('[UniverseManager] About to call connectUniverseToGit...');
          const connectStartTime = Date.now();

          await this.connectUniverseToGit(activeUniverse.slug, {
            type: 'github',
            user: activeUniverse.gitRepo.linkedRepo.split('/')[0],
            repo: activeUniverse.gitRepo.linkedRepo.split('/')[1],
            authMethod: authStatus.authMethod
          });

          console.log(`[UniverseManager] connectUniverseToGit completed in ${Date.now() - connectStartTime}ms`);
          console.log('[UniverseManager] Background Git sync initialized');
        } catch (error) {
          console.warn('[UniverseManager] Background Git sync setup failed:', error);
        }
      }
      
    } catch (error) {
      console.error('[UniverseManager] Background sync initialization failed:', error);
      throw error;
    }
  }

  // Event system for status updates
  onStatusChange(handler) {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  notifyStatus(type, message) {
    this.statusHandlers.forEach(handler => {
      try {
        handler({ type, status: message });
      } catch (error) {
        console.warn('[UniverseManager] Status handler error:', error);
      }
    });
  }

  // Load universes from storage (localStorage or memory fallback)
  loadFromStorage() {
    try {
      const saved = storageWrapper.getItem(STORAGE_KEYS.UNIVERSES_LIST);
      const activeSlug = storageWrapper.getItem(STORAGE_KEYS.ACTIVE_UNIVERSE);

      if (saved) {
        const universesList = JSON.parse(saved);
        universesList.forEach(universe => {
          // Use safe normalization during initial load to prevent recursion
          this.universes.set(universe.slug, this.safeNormalizeUniverse(universe));
        });
      }

      // Load file handles (Note: File handles can't be serialized, but we can track which universes had them)
      try {
        const fileHandlesInfo = storageWrapper.getItem(STORAGE_KEYS.UNIVERSE_FILE_HANDLES);
        if (fileHandlesInfo) {
          const handlesData = JSON.parse(fileHandlesInfo);
          // We can't restore actual FileSystemFileHandle objects, but we can mark which universes had them
          // The actual file handles will need to be re-established by user action
          Object.keys(handlesData).forEach(slug => {
            const universe = this.universes.get(slug);
            if (universe && handlesData[slug]) {
              // Mark that this universe had a file handle setup previously
              this.updateUniverse(slug, {
                localFile: {
                  ...universe.localFile,
                  hadFileHandle: true, // Flag to indicate user previously set up a file handle
                  lastFilePath: handlesData[slug].path || universe.localFile.path
                }
              });
            }
          });
        }
      } catch (error) {
        console.warn('[UniverseManager] Failed to load file handles info:', error);
      }
      
      // Create default universe if none exist
      if (this.universes.size === 0) {
        this.createSafeDefaultUniverse();
      }
      
      // Set active universe
      this.activeUniverseSlug = activeSlug && this.universes.has(activeSlug) 
        ? activeSlug 
        : this.universes.keys().next().value;
      
      // Migrate existing FileStorage file handle to the active universe
      setTimeout(() => {
        this.migrateExistingFileHandle();
      }, 1000); // Delay to let FileStorage initialize
        
      console.log('[UniverseManager] Loaded', this.universes.size, 'universes, active:', this.activeUniverseSlug);
    } catch (error) {
      console.error('[UniverseManager] Failed to load from storage:', error);
      this.createSafeDefaultUniverse();
    }
  }

  // Safe universe normalization that doesn't call device detection (prevents startup recursion)
  safeNormalizeUniverse(universe) {
    const slug = universe.slug || 'universe';
    const providedGitRepo = universe.gitRepo || {};
    const providedUniverseFolder = providedGitRepo.universeFolder || universe.universeFolder;
    const providedUniverseFile = providedGitRepo.universeFile || universe.universeFile;

    return {
      slug,
      name: universe.name || 'Universe',

      // Use conservative defaults during startup
      sourceOfTruth: universe.sourceOfTruth || 'local',

      // Local storage slot - enabled by default during startup
      localFile: {
        enabled: universe.localFile?.enabled ?? true,
        path: this.sanitizeFileName(universe.localFile?.path || `${universe.name || 'Universe'}.redstring`),
        handle: null, // Will be restored separately
        unavailableReason: universe.localFile?.unavailableReason || null
      },

      // Git storage slot - preserve existing settings
      gitRepo: {
        enabled: providedGitRepo.enabled ?? false,
        linkedRepo: providedGitRepo.linkedRepo || universe.linkedRepo || null,
        schemaPath: providedGitRepo.schemaPath || universe.schemaPath || 'schema',
        universeFolder: providedUniverseFolder || `universes/${slug}`,
        universeFile: providedUniverseFile || `${slug}.redstring`,
        priority: providedGitRepo.priority || 'secondary'
      },

      // Browser storage - enabled as fallback
      browserStorage: {
        enabled: universe.browserStorage?.enabled ?? true,
        role: universe.browserStorage?.role || 'fallback',
        key: universe.browserStorage?.key || `universe_${slug}`
      },

      // Metadata
      sources: Array.isArray(universe.sources) ? universe.sources : [],
      created: universe.created || new Date().toISOString(),
      lastModified: universe.lastModified || new Date().toISOString()
    };
  }

  // Safe default universe creation that doesn't call device detection (prevents startup recursion)
  createSafeDefaultUniverse() {
    const defaultUniverse = {
      slug: 'universe',
      name: 'Universe',
      sourceOfTruth: 'local', // Conservative default
      
      // Enable local storage by default during startup
      localFile: { 
        enabled: true, 
        path: 'Universe.redstring' 
      },
      gitRepo: { 
        enabled: false, 
        linkedRepo: null, 
        schemaPath: 'schema'
      },
      browserStorage: {
        enabled: true,
        role: 'fallback'
      },
      
      sources: []
    };
    
    this.universes.set('universe', this.safeNormalizeUniverse(defaultUniverse));
    this.activeUniverseSlug = 'universe';
    this.saveToStorage();

    // Initialize the store with empty state for the default universe if store operations are available
    if (this.storeOperations?.loadUniverseFromFile) {
      const emptyState = this.createEmptyState();
      try {
        this.storeOperations.loadUniverseFromFile(emptyState);
        console.log('[UniverseManager] Initialized graph store with empty state for safe default universe');
      } catch (error) {
        console.warn('[UniverseManager] Failed to initialize graph store for safe default universe:', error);
      }
    }

    console.log('[UniverseManager] Created safe default universe during startup');
  }

  // Apply device configuration to all existing universes (called after device config loads)
  applyDeviceConfigToUniverses() {
    try {
      let hasChanges = false;
      
      this.universes.forEach((universe, slug) => {
        // Re-normalize with proper device config now available
        const updatedUniverse = this.normalizeUniverse(universe);
        
        // Check if anything actually changed
        const hasActualChanges = JSON.stringify(universe) !== JSON.stringify(updatedUniverse);
        
        if (hasActualChanges) {
          this.universes.set(slug, updatedUniverse);
          hasChanges = true;
        }
      });
      
      if (hasChanges) {
        this.saveToStorage();
        console.log('[UniverseManager] Applied device configuration to existing universes');
      }
    } catch (error) {
      console.warn('[UniverseManager] Failed to apply device config to universes:', error);
    }
  }

  // Migrate existing FileStorage file handle to UniverseManager
  async migrateExistingFileHandle() {
    try {
      // Import FileStorage to get existing file handle
      const fileStorage = await getFileStorage();
      const existingFileHandle = fileStorage.getCurrentFileHandle();
      
      if (existingFileHandle && this.activeUniverseSlug) {
        console.log('[UniverseManager] Migrating existing file handle to active universe');
        
        // Set the file handle for the active universe
        this.setFileHandle(this.activeUniverseSlug, existingFileHandle);
        
        // Update universe configuration
        const activeUniverse = this.getActiveUniverse();
        if (activeUniverse) {
          this.updateUniverse(this.activeUniverseSlug, {
            localFile: {
              ...activeUniverse.localFile,
              enabled: true,
              path: existingFileHandle.name || 'universe.redstring'
            }
          });
        }
      }
    } catch (error) {
      console.warn('[UniverseManager] Failed to migrate existing file handle:', error);
    }
  }

  // Normalize universe object with all required fields
  // Device-aware configuration that respects mobile/tablet limitations
  normalizeUniverse(universe) {
    // Use safe defaults if device config isn't ready yet (prevents infinite recursion)
    let deviceConfig = this.deviceConfig;
    let isGitOnlyMode = this.isGitOnlyMode;

    if (!deviceConfig) {
      try {
        deviceConfig = getCurrentDeviceConfig();
        isGitOnlyMode = shouldUseGitOnlyMode();
      } catch (error) {
        // Fallback to safe defaults if device detection fails
        console.warn('[UniverseManager] Device config not ready, using safe defaults:', error);
        deviceConfig = {
          sourceOfTruth: 'local',
          enableLocalFileStorage: true,
          gitOnlyMode: false,
          deviceInfo: { type: 'desktop', isMobile: false }
        };
        isGitOnlyMode = false;
      }
    }
    
    const slug = universe.slug || 'universe';
    const providedGitRepo = universe.gitRepo || {};
    const providedUniverseFolder = providedGitRepo.universeFolder || universe.universeFolder;
    const providedUniverseFile = providedGitRepo.universeFile || universe.universeFile;

    return {
      slug,
      name: universe.name || 'Universe',
      
      // Storage configuration - device-aware defaults
      sourceOfTruth: universe.sourceOfTruth || deviceConfig.sourceOfTruth,
      
      // Local storage slot - disabled in Git-Only mode
      localFile: {
        enabled: isGitOnlyMode 
          ? false 
          : (universe.localFile?.enabled ?? deviceConfig.enableLocalFileStorage),
        path: this.sanitizeFileName(universe.localFile?.path || `${universe.name || 'Universe'}.redstring`),
        handle: null, // Will be restored separately
        unavailableReason: isGitOnlyMode ? 'Git-Only mode active' : null
      },
      
      // Git storage slot - enabled by default in Git-Only mode
      gitRepo: {
        enabled: isGitOnlyMode
          ? true
          : (providedGitRepo.enabled ?? false),
        linkedRepo: providedGitRepo.linkedRepo || universe.linkedRepo || null, // Migration from old format
        schemaPath: providedGitRepo.schemaPath || universe.schemaPath || 'schema',
        universeFolder: providedUniverseFolder || `universes/${slug}`,
        universeFile: providedUniverseFile || `${slug}.redstring`,
        priority: providedGitRepo.priority || (isGitOnlyMode ? 'primary' : 'secondary')
      },
      
      // Browser storage fallback - always enabled on mobile/tablet
      browserStorage: {
        enabled: universe.browserStorage?.enabled ?? deviceConfig.preferBrowserStorage,
        key: `universe_${slug}`,
        role: isGitOnlyMode ? 'cache' : 'fallback' // Different roles based on mode
      },
      
      // Device-specific metadata
      deviceConfig: {
        gitOnlyMode: isGitOnlyMode,
        touchOptimized: deviceConfig.touchOptimizedUI,
        compactInterface: deviceConfig.compactInterface,
        lastDeviceType: deviceConfig.deviceInfo.type
      },
      
      // Enhanced metadata with timestamps
      metadata: {
        created: universe.metadata?.created || universe.created || new Date().toISOString(),
        lastModified: universe.metadata?.lastModified || universe.lastModified || new Date().toISOString(),
        lastOpened: universe.metadata?.lastOpened || null,
        lastSync: universe.metadata?.lastSync || null,
        syncStatus: universe.metadata?.syncStatus || 'unknown',
        fileSize: universe.metadata?.fileSize || 0,
        nodeCount: universe.metadata?.nodeCount || 0
      },
      
      // Legacy compatibility
      sources: universe.sources || [], // For GitNativeFederation compatibility
      created: universe.created || new Date().toISOString(), // Backward compatibility
      lastModified: universe.lastModified || new Date().toISOString() // Backward compatibility
    };
  }

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
          persistentAuth.storeAppInstallation(updated);
        } catch (error) {
          console.warn('[UniverseManager] Failed to persist refreshed GitHub App token:', error);
        }
        return { token, installationId };
      }
    } catch (error) {
      console.warn('[UniverseManager] GitHub App token refresh failed:', error);
    }

    return token ? { token, installationId } : null;
  }

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
      console.warn('[UniverseManager] OAuth token retrieval failed:', error);
      return null;
    }
  }

  // Create the default universe with device-aware configuration
  createDefaultUniverse() {
    // Use safe defaults if device config isn't ready yet (prevents infinite recursion during startup)
    let deviceConfig = this.deviceConfig;
    let isGitOnlyMode = this.isGitOnlyMode;
    
    if (!deviceConfig) {
      try {
        deviceConfig = getCurrentDeviceConfig();
        isGitOnlyMode = shouldUseGitOnlyMode();
      } catch (error) {
        // Fallback to safe defaults to prevent recursion
        console.warn('[UniverseManager] Device config not ready during default universe creation, using safe defaults');
        deviceConfig = {
          sourceOfTruth: 'local',
          enableLocalFileStorage: true,
          compactInterface: false,
          deviceInfo: { type: 'desktop', isMobile: false }
        };
        isGitOnlyMode = false;
      }
    }
    
    const defaultUniverse = {
      slug: 'universe',
      name: deviceConfig.compactInterface ? 'My Universe' : 'Universe',
      sourceOfTruth: deviceConfig.sourceOfTruth,
      
      // Configure storage slots based on device capabilities
      localFile: { 
        enabled: !isGitOnlyMode, 
        path: 'Universe.redstring' 
      },
      gitRepo: { 
        enabled: isGitOnlyMode, // Auto-enable Git for mobile/tablet
        linkedRepo: null, 
        schemaPath: 'schema',
        autoSetupRequired: isGitOnlyMode // Flag for UI to show Git setup
      },
      browserStorage: { 
        enabled: deviceConfig.preferBrowserStorage 
      },
      
      // Device-specific metadata
      metadata: {
        created: new Date().toISOString(),
        lastModified: new Date().toISOString(),
        createdOnDevice: deviceConfig.deviceInfo.type
      }
    };
    
    this.universes.set('universe', this.normalizeUniverse(defaultUniverse));
    this.activeUniverseSlug = 'universe';
    this.saveToStorage();

    // Initialize the store with empty state for the default universe if store operations are available
    if (this.storeOperations?.loadUniverseFromFile) {
      const emptyState = this.createEmptyState();
      try {
        this.storeOperations.loadUniverseFromFile(emptyState);
        console.log('[UniverseManager] Initialized graph store with empty state for default universe');
      } catch (error) {
        console.warn('[UniverseManager] Failed to initialize graph store for default universe:', error);
      }
    }

    // Show helpful message for Git-Only mode users
    if (isGitOnlyMode) {
      this.notifyStatus('info', 'Git-Only mode active - connect to a repository to sync your universe across devices');
    }
  }

  // Ensure universe has at least one storage slot enabled
  // Device-aware fallback logic
  ensureStorageAvailable(universe) {
    const hasAnyStorage = universe.localFile.enabled || 
                         universe.gitRepo.enabled || 
                         universe.browserStorage.enabled;
    
    if (!hasAnyStorage) {
      const isGitOnlyMode = this.isGitOnlyMode || shouldUseGitOnlyMode();
      
      if (isGitOnlyMode) {
        console.warn('[UniverseManager] Git-Only mode universe has no storage - enabling browser storage as cache');
        return {
          ...universe,
          browserStorage: { ...universe.browserStorage, enabled: true, role: 'cache' },
          gitRepo: { ...universe.gitRepo, enabled: true, autoSetupRequired: true }
        };
      } else {
        console.warn('[UniverseManager] Universe has no storage slots enabled, enabling browser storage as fallback');
        return {
          ...universe,
          browserStorage: { ...universe.browserStorage, enabled: true, role: 'fallback' }
        };
      }
    }
    
    return universe;
  }

  // Check if we're on a mobile device (for browser storage fallback)
  // Updated to use the new device detection utility
  isMobileDevice() {
    const deviceConfig = this.deviceConfig || getCurrentDeviceConfig();
    return deviceConfig.deviceInfo.isMobile || deviceConfig.deviceInfo.isTablet;
  }

  // Get device capability information
  getDeviceCapabilities() {
    const deviceConfig = this.deviceConfig || getCurrentDeviceConfig();
    return {
      supportsLocalFiles: hasCapability('local-files'),
      requiresGitOnly: deviceConfig.gitOnlyMode,
      touchOptimized: deviceConfig.touchOptimizedUI,
      compactInterface: deviceConfig.compactInterface,
      deviceType: deviceConfig.deviceInfo.type
    };
  }

  // Create Git-Only universe (for mobile users)
  createGitOnlyUniverse(name, gitConfig) {
    // Ensure device config is loaded
    if (!this.deviceConfig) {
      this.initializeDeviceConfig();
    }
    
    const slug = this.generateUniqueSlug(name);
    const universe = this.normalizeUniverse({
      slug,
      name,
      sourceOfTruth: SOURCE_OF_TRUTH.GIT,
      localFile: { enabled: false, unavailableReason: 'Git-Only mode' },
      gitRepo: { 
        enabled: true, 
        linkedRepo: gitConfig.linkedRepo,
        schemaPath: gitConfig.schemaPath || 'schema',
        priority: 'primary'
      },
      browserStorage: { enabled: true, role: 'cache' }
    });
    
    this.universes.set(slug, universe);
    this.saveToStorage();
    
    this.notifyStatus('success', `Created Git-Only universe: ${name}`);
    return universe;
  }

  // Import universe from Git repository URL (mobile-friendly)
  async createUniverseFromGitUrl(gitUrl, options = {}) {
    try {
      // Parse Git URL to extract user/repo
      const gitMatch = gitUrl.match(/github\.com\/([^\/]+)\/([^\/]+)/);
      if (!gitMatch) {
        throw new Error('Invalid GitHub URL format');
      }
      
      const [, user, repo] = gitMatch;
      const repoName = repo.replace('.git', '');
      
      const universe = this.createGitOnlyUniverse(options.name || repoName, {
        linkedRepo: `${user}/${repoName}`,
        schemaPath: options.schemaPath || 'schema'
      });
      
      // If we have auth, try to connect immediately
      const authStatus = persistentAuth.getAuthStatus();
      
      if (authStatus.hasValidToken) {
        await this.connectUniverseToGit(universe.slug, {
          type: 'github',
          user,
          repo: repoName,
          authMethod: authStatus.authMethod
        });
      }
      
      return universe;
    } catch (error) {
      this.notifyStatus('error', `Failed to create universe from Git URL: ${error.message}`);
      throw error;
    }
  }

  // Save universes to storage (localStorage or memory fallback)
  saveToStorage() {
    try {
      const universesList = Array.from(this.universes.values()).map(universe => {
        // Don't save file handles in storage
        const { localFile, ...rest } = universe;
        return {
          ...rest,
          localFile: {
            enabled: localFile.enabled,
            path: localFile.path,
            hadFileHandle: localFile.hadFileHandle,
            lastFilePath: localFile.lastFilePath
          }
        };
      });

      storageWrapper.setItem(STORAGE_KEYS.UNIVERSES_LIST, JSON.stringify(universesList));
      storageWrapper.setItem(STORAGE_KEYS.ACTIVE_UNIVERSE, this.activeUniverseSlug);

      // Save file handles info (can't serialize actual FileSystemFileHandle objects)
      const fileHandlesInfo = {};
      this.fileHandles.forEach((handle, slug) => {
        fileHandlesInfo[slug] = {
          path: handle.name || this.universes.get(slug)?.localFile?.path || `${slug}.redstring`,
          hasHandle: true
        };
      });
      storageWrapper.setItem(STORAGE_KEYS.UNIVERSE_FILE_HANDLES, JSON.stringify(fileHandlesInfo));

      // Warn about data loss if using memory storage
      if (storageWrapper.shouldUseMemoryStorage()) {
        storageWrapper.warnAboutDataLoss();
      }
    } catch (error) {
      console.error('[UniverseManager] Failed to save to storage:', error);
    }
  }

  // Get all universes
  getAllUniverses() {
    return Array.from(this.universes.values());
  }

  // Internal helper to resolve universe entry with case-insensitive fallback
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

  // Get active universe
  getActiveUniverse() {
    const resolved = this.resolveUniverseEntry(this.activeUniverseSlug);
    return resolved ? resolved.universe : undefined;
  }

  // Get universe by slug (case-insensitive)
  getUniverse(slug) {
    const resolved = this.resolveUniverseEntry(slug);
    return resolved ? resolved.universe : undefined;
  }

  // Create new universe
  createUniverse(name, options = {}) {
    // Ensure device config is loaded
    if (!this.deviceConfig) {
      this.initializeDeviceConfig();
    }

    const slug = this.generateUniqueSlug(name);
    const safeName = (typeof name === 'string' && name.trim().length > 0) ? name : slug;
    const universe = this.normalizeUniverse({
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

    // Initialize the store with empty state for the new universe if store operations are available
    if (this.storeOperations?.loadUniverseFromFile) {
      const emptyState = this.createEmptyState();
      try {
        this.storeOperations.loadUniverseFromFile(emptyState);
        console.log('[UniverseManager] Initialized graph store with empty state for new universe:', slug);
      } catch (error) {
        console.warn('[UniverseManager] Failed to initialize graph store for new universe:', error);
      }
    }

    this.notifyStatus('success', `Created universe: ${name}`);
    return universe;
  }

  // Generate unique slug for universe
  generateUniqueSlug(name) {
    let baseSlug = String(name || 'universe').toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') // Replace all non-alphanumeric chars with hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
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

  // Sanitize file names to prevent URL encoding issues
  sanitizeFileName(name) {
    return name
      .replace(/[^a-zA-Z0-9-_\.]/g, '-') // Replace problematic chars with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .replace(/\.redstring$/, '') + '.redstring'; // Ensure .redstring extension
  }

  // Update universe
  updateUniverse(slug, updates) {
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

    this.universes.set(key, this.normalizeUniverse(updated));
    this.saveToStorage();

    this.notifyStatus('info', `Updated universe: ${universe.name}`);
    return updated;
  }

  // Set active universe without switching logic (lightweight setter)
  setActiveUniverse(slug) {
    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    this.activeUniverseSlug = resolved.key;
    this.saveToStorage();
    this.notifyStatus('info', `Active universe set: ${resolved.universe?.name || resolved.key}`);
  }

  // Delete universe
  deleteUniverse(slug) {
    if (this.universes.size <= 1) {
      throw new Error('Cannot delete the last universe');
    }
    
    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const { key, universe } = resolved;

    this.universes.delete(key);
    this.fileHandles.delete(key);
    
    // If we deleted the active universe, switch to another one
    if (this.activeUniverseSlug === key) {
      this.activeUniverseSlug = this.universes.keys().next().value;
    }
    
    this.saveToStorage();
    this.notifyStatus('info', `Deleted universe: ${universe.name}`);
  }

  // Switch active universe (this changes what's displayed on screen)
  async switchActiveUniverse(slug, options = {}) {
    const resolved = this.resolveUniverseEntry(slug);
    if (!resolved) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const { key, universe } = resolved;

    if (this.activeUniverseSlug === key) {
      return universe; // Already active
    }

    // Always save current universe before switching (unless explicitly disabled)
    if (options.saveCurrent !== false && this.activeUniverseSlug) {
      try {
        await this.saveActiveUniverse();
        console.log('[UniverseManager] Saved current universe before switching');
      } catch (error) {
        console.warn('[UniverseManager] Failed to save current universe before switch:', error);
      }
    }

    this.activeUniverseSlug = key;
    this.saveToStorage();

    this.notifyStatus('info', `Switched to universe: ${universe.name}`);

    // Load the universe data based on source of truth
    try {
      const storeState = await this.loadUniverseData(universe);

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

      return { universe, storeState };
    } catch (error) {
      console.error('[UniverseManager] Failed to load universe data:', error);
      this.notifyStatus('error', `Failed to load universe: ${error.message}`);
      throw error;
    }
  }

  // Load universe data based on source of truth priority
  async loadUniverseData(universe) {
    const { sourceOfTruth } = universe;
    
    // Try primary source first
    if (sourceOfTruth === SOURCE_OF_TRUTH.GIT && universe.gitRepo.enabled) {
      try {
        const gitData = await this.loadFromGit(universe);
        if (gitData) return gitData;
      } catch (error) {
        console.warn('[UniverseManager] Git load failed, trying fallback:', error);
        // Direct-read fallback when engine isn't configured yet
        try {
          const directGitData = await this.loadFromGitDirect(universe);
          if (directGitData) return directGitData;
        } catch (fallbackError) {
          console.warn('[UniverseManager] Direct Git fallback failed:', fallbackError);
        }
      }
    }
    
    if (sourceOfTruth === SOURCE_OF_TRUTH.LOCAL && universe.localFile.enabled) {
      try {
        const localData = await this.loadFromLocalFile(universe);
        if (localData) return localData;
      } catch (error) {
        console.warn('[UniverseManager] Local file load failed, trying fallback:', error);
      }
    }
    
    // Try fallback sources
    if (sourceOfTruth !== SOURCE_OF_TRUTH.LOCAL && universe.localFile.enabled) {
      try {
        const localData = await this.loadFromLocalFile(universe);
        if (localData) return localData;
      } catch (error) {
        console.warn('[UniverseManager] Local fallback failed:', error);
      }
    }
    
    if (sourceOfTruth !== SOURCE_OF_TRUTH.GIT && universe.gitRepo.enabled) {
      try {
        const gitData = await this.loadFromGit(universe);
        if (gitData) return gitData;
      } catch (error) {
        console.warn('[UniverseManager] Git fallback failed:', error);
      }
    }
    
    // Browser storage fallback for mobile
    if (universe.browserStorage.enabled) {
      try {
        const browserData = await this.loadFromBrowserStorage(universe);
        if (browserData) return browserData;
      } catch (error) {
        console.warn('[UniverseManager] Browser storage fallback failed:', error);
      }
    }
    
    // Return empty state if nothing works
    console.warn('[UniverseManager] All load methods failed, creating empty state');
    return this.createEmptyState();
  }

  // Load from Git repository
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
   * Useful during early startup or Git-Only mode before engine registration
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
        if (app?.accessToken) {
          token = app.accessToken;
          authMethod = 'github-app';
        } else {
          token = await persistentAuth.getAccessToken();
          authMethod = token ? 'oauth' : authMethod;
        }
      } catch (_) {}
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

      // Check availability; if not reachable with current auth, bail out
      try {
        const ok = await provider.isAvailable();
        if (!ok) {
          console.warn('[UniverseManager] Provider unavailable or unauthorized; skipping direct Git access');
          return null;
        }
      } catch (e) {
        console.warn('[UniverseManager] Provider availability check failed; skipping direct Git access:', e?.message || e);
        return null;
      }

      const folder = universe?.gitRepo?.universeFolder || `universes/${universe.slug}`;
      const fileName = universe?.gitRepo?.universeFile || `${universe.slug}.redstring`;
      const filePath = `${folder}/${fileName}`;

      let content;
      try {
        content = await provider.readFileRaw(filePath);
      } catch (readError) {
        content = null;
      }
      
      if (!content || typeof content !== 'string' || content.trim() === '') {
        // File missing or empty: create an initial universe file on Git
        try {
          const initialStoreState = this.createEmptyState();
          // Export asynchronously to avoid blocking
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
          console.warn('[UniverseManager] Failed to create initial universe file on Git:', createErr);
          return null;
        }
      }

      let redstringData;
      try {
        redstringData = JSON.parse(content);
      } catch (e) {
        console.warn('[UniverseManager] Direct Git read parse failed:', e.message);
        return null;
      }

      const { storeState } = importFromRedstring(redstringData);
      return storeState;
    } catch (error) {
      console.warn('[UniverseManager] Direct Git read failed:', error);
      return null;
    }
  }

  // Load from local file
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

  // Load from browser storage (mobile fallback)
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
      console.error('[UniverseManager] Browser storage load failed:', error);
      return null;
    }
  }

  // Reload the active universe using current auth and apply to the graph store
  async reloadActiveUniverse() {
    try {
      const universe = this.getActiveUniverse();
      if (!universe) return false;

      console.log('[UniverseManager] Reloading active universe:', universe.name);

      // Try multiple reload strategies for better mobile reliability
      let storeState = null;
      let loadMethod = 'unknown';

      // Strategy 1: Try primary source
      try {
        storeState = await this.loadUniverseData(universe);
        loadMethod = universe.sourceOfTruth;
      } catch (primaryError) {
        console.warn('[UniverseManager] Primary load failed:', primaryError);

        // Strategy 2: Try direct Git read if we have Git repo config
        if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
          try {
            storeState = await this.loadFromGitDirect(universe);
            loadMethod = 'git-direct';
            console.log('[UniverseManager] Direct Git fallback succeeded');
          } catch (directError) {
            console.warn('[UniverseManager] Direct Git fallback failed:', directError);
          }
        }

        // Strategy 3: Try browser storage fallback
        if (!storeState && universe.browserStorage?.enabled) {
          try {
            storeState = await this.loadFromBrowserStorage(universe);
            loadMethod = 'browser-fallback';
            console.log('[UniverseManager] Browser storage fallback succeeded');
          } catch (browserError) {
            console.warn('[UniverseManager] Browser storage fallback failed:', browserError);
          }
        }
      }

      if (storeState) {
        // Load data into store if store operations are available
        if (this.storeOperations?.loadUniverseFromFile) {
          this.storeOperations.loadUniverseFromFile(storeState);
        }

        // Update metadata with node count
        if (storeState.nodePrototypes) {
          const nodeCount = storeState.nodePrototypes instanceof Map
            ? storeState.nodePrototypes.size
            : Object.keys(storeState.nodePrototypes || {}).length;

          this.updateUniverse(universe.slug, {
            metadata: {
              ...universe.metadata,
              nodeCount,
              lastOpened: new Date().toISOString(),
              lastLoadMethod: loadMethod
            }
          });
        }

        this.notifyStatus('success', `Reloaded universe from ${loadMethod}`);
        return true;
      }

      this.notifyStatus('warning', 'Could not reload universe from any source');
      return false;
    } catch (error) {
      console.error('[UniverseManager] Failed to reload active universe:', error);
      this.notifyStatus('error', `Reload failed: ${error.message}`);
      return false;
    }
  }

  // Save active universe to all enabled storage slots
  async saveActiveUniverse(storeState = null) {
    let universe = this.getActiveUniverse();
    if (!universe) {
      throw new Error('No active universe to save');
    }

    // Ensure at least one storage slot is available
    universe = this.ensureStorageAvailable(universe);

    // Get store state if not provided
    if (!storeState) {
      if (this.storeOperations?.getState) {
        storeState = this.storeOperations.getState();
      } else {
        throw new Error('No store state provided and store operations not available');
      }
    }

    // Update universe metadata with current node count before saving
    if (storeState && storeState.nodePrototypes) {
      const nodeCount = storeState.nodePrototypes instanceof Map
        ? storeState.nodePrototypes.size
        : Object.keys(storeState.nodePrototypes || {}).length;

      universe = {
        ...universe,
        metadata: {
          ...universe.metadata,
          nodeCount,
          lastModified: new Date().toISOString(),
          lastSync: new Date().toISOString()
        }
      };

      this.universes.set(universe.slug, universe);
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
    
    // Save to Git if enabled and sync engine is available
    if (universe.gitRepo.enabled && this.gitSyncEngines.has(universe.slug)) {
      try {
        await this.saveToGit(universe, redstringData);
        results.push('git');
      } catch (error) {
        console.error('[UniverseManager] Git save failed:', error);
        errors.push(`Git: ${error.message}`);
      }
    } else if (universe.gitRepo.enabled && !this.gitSyncEngines.has(universe.slug)) {
      console.log('[UniverseManager] Git enabled but sync engine not configured yet - skipping Git save');
      errors.push('Git: Sync engine not ready');
    }
    
    // Save to local file if enabled and file handle exists
    if (universe.localFile.enabled && this.fileHandles.has(universe.slug)) {
      try {
        await this.saveToLocalFile(universe, redstringData);
        results.push('local');
      } catch (error) {
        console.error('[UniverseManager] Local file save failed:', error);
        errors.push(`Local: ${error.message}`);
      }
    } else if (universe.localFile.enabled && !this.fileHandles.has(universe.slug)) {
      console.log('[UniverseManager] Local file enabled but no file handle - skipping local save');
      // Don't add to errors - this is expected behavior until user sets up file
    }
    
    // Save to browser storage if enabled (always try as fallback)
    if (universe.browserStorage.enabled || results.length === 0) {
      try {
        await this.saveToBrowserStorage(universe, redstringData);
        results.push('browser');
      } catch (error) {
        console.error('[UniverseManager] Browser storage save failed:', error);
        errors.push(`Browser: ${error.message}`);
      }
    }
    
    if (results.length > 0) {
      if (errors.length > 0) {
        this.notifyStatus('warning', `Saved to: ${results.join(', ')} (${errors.length} failed)`);
      } else {
        this.notifyStatus('success', `Saved to: ${results.join(', ')}`);
      }
    } else {
      this.notifyStatus('error', `All save methods failed: ${errors.join('; ')}`);
      throw new Error(`All save methods failed: ${errors.join('; ')}`);
    }
    
    return results;
  }

  // Save to Git repository
  async saveToGit(universe, redstringData) {
    const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
    if (!gitSyncEngine) {
      throw new Error('Git sync engine not configured for this universe');
    }
    
    // DISABLED: Don't restart engines as it causes 409 conflicts
    // Let the force commit handle any issues with retries instead
    console.log('[UniverseManager] Saving to Git via existing sync engine (no restart)');
    
    try {
      // Use the GitSyncEngine's existing export logic instead of bypassing it
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
        console.log('[UniverseManager] 409 conflict detected, attempting resolution');
        
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
            console.warn('[UniverseManager] Could not load from Git for conflict resolution:', loadError);
          }
        }
        
        // If Git load failed or local is source of truth, wait and retry
        console.log('[UniverseManager] Waiting 2 seconds before retry...');
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

  // Save to local file
  async saveToLocalFile(universe, redstringData) {
    let fileHandle = this.fileHandles.get(universe.slug);

    if (!fileHandle) {
      // If no file handle but local storage is enabled, auto-prompt to set one up
      if (universe.localFile.enabled && typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
        try {
          console.log('[UniverseManager] No file handle for local save, prompting user to select file location');

          // Use the last known file path if available, otherwise use current path
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
    
    const jsonString = JSON.stringify(redstringData, null, 2);
    const writable = await fileHandle.createWritable();
    await writable.write(jsonString);
    await writable.close();
  }

  // Save to browser storage with size limits
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
      console.error('[UniverseManager] Browser storage save failed:', error);
      throw error;
    }
  }

  // Clean up old browser storage data
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
        
        console.log(`[UniverseManager] Cleaned up ${toDelete.length} old browser storage entries`);
      }
    } catch (error) {
      console.warn('[UniverseManager] Browser storage cleanup failed:', error);
    }
  }

  // Open browser storage database
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

  // Create empty universe state
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

  // Set file handle for universe
  setFileHandle(slug, fileHandle) {
    this.fileHandles.set(slug, fileHandle);

    // Also update the universe configuration
    const universe = this.getUniverse(slug);
    if (universe) {
      this.updateUniverse(slug, {
        localFile: {
          ...universe.localFile,
          enabled: true,
          path: fileHandle.name || universe.localFile.path,
          hadFileHandle: true,
          lastFilePath: fileHandle.name || universe.localFile.path
        }
      });
    }

    // Persist file handle information to storage
    this.saveToStorage();
  }

  // Setup file handle for universe (user picks file)
  async setupFileHandle(slug) {
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }],
        multiple: false
      });
      
      this.setFileHandle(slug, fileHandle);
      this.notifyStatus('success', `Linked local file: ${fileHandle.name}`);
      return fileHandle;
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.notifyStatus('error', `Failed to setup file handle: ${error.message}`);
        throw error;
      }
    }
  }

  // Set Git sync engine for universe with STRICT singleton protection
  setGitSyncEngine(slug, gitSyncEngine) {
    // Check if we already have an engine for this universe
    const existingEngine = this.gitSyncEngines.get(slug);
    // If it's the same engine instance, do nothing to avoid log spam
    if (existingEngine && existingEngine === gitSyncEngine) {
      return true;
    }
    if (existingEngine && existingEngine !== gitSyncEngine) {
      // STRICT: Never allow replacement during startup to prevent loops
      console.warn(`[UniverseManager] STRICTLY REJECTING duplicate engine for ${slug} - one already exists`);
      gitSyncEngine.stop(); // Stop the duplicate engine immediately
      return false;
    }
    
    this.gitSyncEngines.set(slug, gitSyncEngine);
    console.log(`[UniverseManager] Git sync engine registered for universe: ${slug}`);
    return true;
  }

  // Watchdog to ensure Git sync engines stay healthy
  startWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
    }
    
    this.watchdogInterval = setInterval(() => {
      this.checkGitSyncHealth();
    }, this.watchdogDelay);
    
    console.log('[UniverseManager] Watchdog started');
  }

  // Check Git sync engine health and restart if needed
  checkGitSyncHealth() {
    this.gitSyncEngines.forEach((engine, slug) => {
      if (!engine.isHealthy()) {
        const status = engine.getStatus();
        const errorDetails = status.consecutiveErrors > 0 
          ? `${status.consecutiveErrors} consecutive errors` 
          : 'unknown issue';
          
        // Only log warning if engine has been unhealthy for a while
        if (status.consecutiveErrors >= 2) {
          console.log(`[UniverseManager] Git sync engine for ${slug} having issues (${errorDetails}), but allowing self-recovery`);
          
          // Only notify user if it's been failing for more than 3 errors
          if (status.consecutiveErrors >= 3) {
            this.notifyStatus('warning', `Sync issues detected for ${slug} - attempting automatic recovery`);
          }
        }
      }
    });
  }

  // Stop watchdog
  stopWatchdog() {
    if (this.watchdogInterval) {
      clearInterval(this.watchdogInterval);
      this.watchdogInterval = null;
      console.log('[UniverseManager] Watchdog stopped');
    }
  }

  // Get file handle for universe
  getFileHandle(slug) {
    return this.fileHandles.get(slug);
  }

  // Get Git sync engine for universe
  getGitSyncEngine(slug) {
    return this.gitSyncEngines.get(slug);
  }

  // Resolve sync conflicts by choosing source of truth
  async resolveSyncConflict(universe) {
    const { sourceOfTruth } = universe;

    try {
      console.log(`[UniverseManager] Resolving sync conflict for ${universe.slug}, source of truth: ${sourceOfTruth}`);

      if (sourceOfTruth === SOURCE_OF_TRUTH.GIT) {
        // Git is source of truth, load from Git and overwrite local
        const gitData = await this.loadFromGit(universe);
        if (gitData) {
          if (this.storeOperations?.loadUniverseFromFile) {
            this.storeOperations.loadUniverseFromFile(gitData);
          }
          this.notifyStatus('info', 'Conflict resolved: loaded from Git repository');
          return true;
        }
      } else if (sourceOfTruth === SOURCE_OF_TRUTH.LOCAL) {
        // Local is source of truth, force push to Git
        const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
        if (gitSyncEngine) {
          if (this.storeOperations?.getState) {
            const storeState = this.storeOperations.getState();
            await gitSyncEngine.forceCommit(storeState);
            this.notifyStatus('info', 'Conflict resolved: pushed local changes to Git');
            return true;
          } else {
            throw new Error('Store operations not available for conflict resolution');
          }
        }
      }

      return false;
    } catch (error) {
      console.error('[UniverseManager] Failed to resolve sync conflict:', error);
      this.notifyStatus('error', `Conflict resolution failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Discover universes in a repository
   * @param {Object} repoConfig - Repository configuration {type, user, repo, authMethod}
   * @returns {Promise<Array>} Array of discovered universes
   */
  async discoverUniversesInRepository(repoConfig) {
    try {
      console.log(`[UniverseManager] Discovering universes in ${repoConfig.user}/${repoConfig.repo}...`);

      const resolveDiscoveryAuth = async (preferredMethod = null) => {
        // Try GitHub App credentials first if requested or no preference
        if (!preferredMethod || preferredMethod === 'github-app') {
          const appToken = await this.ensureGitHubAppAccessToken(preferredMethod === 'github-app');
          if (appToken?.token) {
            return {
              token: appToken.token,
              authMethod: 'github-app',
              installationId: appToken.installationId
            };
          }
        }

        // Fall back to OAuth tokens
        const oauthToken = await this.ensureOAuthAccessToken(false);
        if (oauthToken) {
          return { token: oauthToken, authMethod: 'oauth' };
        }

        return { token: null, authMethod: null };
      };

      const refreshDiscoveryAuth = async (currentContext) => {
        if (!currentContext) {
          return null;
        }

        if (currentContext.authMethod === 'github-app') {
          const refreshed = await this.ensureGitHubAppAccessToken(true);
          if (refreshed?.token) {
            return {
              token: refreshed.token,
              authMethod: 'github-app',
              installationId: refreshed.installationId
            };
          }

          // Allow graceful fallback to OAuth if app token refresh failed
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

      const { discoverUniversesWithStats } = await import('./universeDiscovery.js');

      const runDiscovery = async (context, allowRetry = true) => {
        const providerConfig = {
          ...providerBaseConfig,
          token: context.token,
          authMethod: context.authMethod || 'oauth'
        };

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
              console.log('[UniverseManager] Retrying universe discovery with refreshed credentials');
              return runDiscovery(refreshedContext, false);
            }
          }

          throw error;
        }
      };

      const { universes: discovered, stats } = await runDiscovery(authContext, true);

      console.log(`[UniverseManager] Discovered ${discovered.length} universes in repository`);
      this.notifyStatus('info', `Discovery: ${discovered.length} found • scanned ${stats.scannedDirs} dirs • ${stats.valid} valid • ${stats.invalid} invalid`);

      // If none found, just notify - don't auto-create to avoid loops
      if (discovered.length === 0) {
        this.notifyStatus('info', `No universes found in ${repoConfig.user}/${repoConfig.repo}`);
      }

      return discovered;

    } catch (error) {
      console.error('[UniverseManager] Universe discovery failed:', error);
      throw error;
    }
  }

  /**
   * Link to a discovered universe from a repository
   * @param {Object} discoveredUniverse - Universe found by discovery
   * @param {Object} repoConfig - Repository configuration
   * @returns {Promise<string>} Universe slug
   */
  async linkToDiscoveredUniverse(discoveredUniverse, repoConfig) {
    try {
      console.log(`[UniverseManager] Linking to discovered universe: ${discoveredUniverse.name}`);

      // Import discovery service dynamically
      const { createUniverseConfigFromDiscovered } = await import('./universeDiscovery.js');

      const universeConfig = createUniverseConfigFromDiscovered(discoveredUniverse, repoConfig);

      // Check if universe already exists
      const existingEntry = this.resolveUniverseEntry(universeConfig.slug);
      if (existingEntry) {
        // Update existing universe
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
        this.universes.set(key, this.normalizeUniverse(updated));
        this.notifyStatus('info', `Updated universe link: ${universeConfig.name}`);
      } else {
        // Create new universe
        this.universes.set(universeConfig.slug, this.normalizeUniverse(universeConfig));
        this.notifyStatus('success', `Linked to universe: ${universeConfig.name}`);
      }

      this.saveToStorage();

      // Set as active universe
      this.setActiveUniverse(universeConfig.slug);

      // Only reload if no engine exists (avoid duplicate engine creation)
      const hasEngine = this.getGitSyncEngine(universeConfig.slug);
      if (!hasEngine) {
        try {
          await this.reloadActiveUniverse();
        } catch (_) {}
      }

      return universeConfig.slug;

    } catch (error) {
      console.error('[UniverseManager] Failed to link to discovered universe:', error);
      this.notifyStatus('error', `Failed to link universe: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available universes in connected repositories
   * @returns {Promise<Array>} Array of available universe options
   */
  async getAvailableRepositoryUniverses() {
    try {
      const availableUniverses = [];

      // Check all universes with Git repositories
      for (const [slug, universe] of this.universes) {
        if (universe.gitRepo?.enabled && universe.gitRepo?.linkedRepo) {
          try {
            const repoConfig = universe.gitRepo.linkedRepo;
            const discovered = await this.discoverUniversesInRepository(repoConfig);

            availableUniverses.push({
              repository: `${repoConfig.user}/${repoConfig.repo}`,
              universes: discovered,
              linkedUniverse: slug
            });
          } catch (error) {
            console.warn(`[UniverseManager] Failed to discover universes in ${universe.gitRepo.linkedRepo}:`, error);
          }
        }
      }

      return availableUniverses;

    } catch (error) {
      console.error('[UniverseManager] Failed to get available repository universes:', error);
      return [];
    }
  }
}

// Export singleton instance
export const universeManager = new UniverseManager();
export { SOURCE_OF_TRUTH };
export default universeManager;
