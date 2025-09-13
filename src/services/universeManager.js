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
import { storageWrapper } from '../utils/storageWrapper.js';

// Lazy import to avoid circular dependency
let _fileStorage = null;
let _useGraphStore = null;
const getFileStorage = async () => {
  if (!_fileStorage) {
    _fileStorage = await import('../store/fileStorage.js');
  }
  return _fileStorage;
};

const getGraphStore = async () => {
  if (!_useGraphStore) {
    const module = await import('../store/graphStore.jsx');
    _useGraphStore = module.default;
  }
  return _useGraphStore;
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
    
    this.loadFromStorage();
    
    // Initialize device config after a brief delay to avoid circular dependencies
    setTimeout(() => {
      this.initializeDeviceConfig();
    }, 100);
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
      
      // Initialize auth first
      await persistentAuth.initialize();
      
      const authStatus = persistentAuth.getAuthStatus();
      if (!authStatus.hasValidToken) {
        console.log('[UniverseManager] No valid auth token, skipping Git sync setup');
        return;
      }

      // Try to set up Git sync for the active universe
      const activeUniverse = this.getActiveUniverse();
      if (activeUniverse && activeUniverse.gitRepo?.linkedRepo && activeUniverse.gitRepo?.enabled) {
        console.log('[UniverseManager] Setting up background Git sync for active universe');
        
        try {
          await this.connectUniverseToGit(activeUniverse.slug, {
            type: 'github',
            user: activeUniverse.gitRepo.linkedRepo.split('/')[0],
            repo: activeUniverse.gitRepo.linkedRepo.split('/')[1],
            authMethod: authStatus.authMethod
          });
          
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
    return {
      slug: universe.slug || 'universe',
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
        enabled: universe.gitRepo?.enabled ?? false,
        linkedRepo: universe.gitRepo?.linkedRepo || universe.linkedRepo || null,
        schemaPath: universe.gitRepo?.schemaPath || universe.schemaPath || 'schema',
        universeFolder: `universes/${universe.slug}`,
        priority: universe.gitRepo?.priority || 'secondary'
      },
      
      // Browser storage - enabled as fallback
      browserStorage: {
        enabled: universe.browserStorage?.enabled ?? true,
        role: universe.browserStorage?.role || 'fallback',
        lastSync: universe.browserStorage?.lastSync || null
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
    
    return {
      slug: universe.slug || 'universe',
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
          : (universe.gitRepo?.enabled ?? false),
        linkedRepo: universe.gitRepo?.linkedRepo || universe.linkedRepo || null, // Migration from old format
        schemaPath: universe.gitRepo?.schemaPath || universe.schemaPath || 'schema',
        universeFolder: `universes/${universe.slug}`, // Standard path structure
        priority: isGitOnlyMode ? 'primary' : 'secondary'
      },
      
      // Browser storage fallback - always enabled on mobile/tablet
      browserStorage: {
        enabled: universe.browserStorage?.enabled ?? deviceConfig.preferBrowserStorage,
        key: `universe_${universe.slug}`,
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
            path: localFile.path
          }
        };
      });
      
      storageWrapper.setItem(STORAGE_KEYS.UNIVERSES_LIST, JSON.stringify(universesList));
      storageWrapper.setItem(STORAGE_KEYS.ACTIVE_UNIVERSE, this.activeUniverseSlug);
      
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

  // Get active universe
  getActiveUniverse() {
    return this.universes.get(this.activeUniverseSlug);
  }

  // Get universe by slug
  getUniverse(slug) {
    return this.universes.get(slug);
  }

  // Create new universe
  createUniverse(name, options = {}) {
    // Ensure device config is loaded
    if (!this.deviceConfig) {
      this.initializeDeviceConfig();
    }
    
    const slug = this.generateUniqueSlug(name);
    const universe = this.normalizeUniverse({
      slug,
      name,
      sourceOfTruth: options.sourceOfTruth || (this.isGitOnlyMode ? SOURCE_OF_TRUTH.GIT : SOURCE_OF_TRUTH.LOCAL),
      localFile: { 
        enabled: options.enableLocal ?? true, 
        path: `${name}.redstring` 
      },
      gitRepo: { 
        enabled: options.enableGit ?? false, 
        linkedRepo: options.linkedRepo || null,
        schemaPath: options.schemaPath || 'schema'
      }
    });
    
    this.universes.set(slug, universe);
    this.saveToStorage();
    
    this.notifyStatus('success', `Created universe: ${name}`);
    return universe;
  }

  // Generate unique slug for universe
  generateUniqueSlug(name) {
    let baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-') // Replace all non-alphanumeric chars with hyphens
      .replace(/\s+/g, '-') // Replace spaces with hyphens
      .replace(/-+/g, '-') // Collapse multiple hyphens
      .replace(/^-|-$/g, '') // Remove leading/trailing hyphens
      .substring(0, 50) || 'universe';
    
    let slug = baseSlug;
    let counter = 1;
    
    while (this.universes.has(slug)) {
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
    const universe = this.universes.get(slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }
    
    const updated = {
      ...universe,
      ...updates,
      lastModified: new Date().toISOString()
    };
    
    this.universes.set(slug, this.normalizeUniverse(updated));
    this.saveToStorage();
    
    this.notifyStatus('info', `Updated universe: ${universe.name}`);
    return updated;
  }

  // Delete universe
  deleteUniverse(slug) {
    if (this.universes.size <= 1) {
      throw new Error('Cannot delete the last universe');
    }
    
    const universe = this.universes.get(slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }
    
    this.universes.delete(slug);
    this.fileHandles.delete(slug);
    
    // If we deleted the active universe, switch to another one
    if (this.activeUniverseSlug === slug) {
      this.activeUniverseSlug = this.universes.keys().next().value;
    }
    
    this.saveToStorage();
    this.notifyStatus('info', `Deleted universe: ${universe.name}`);
  }

  // Switch active universe (this changes what's displayed on screen)
  async switchActiveUniverse(slug, options = {}) {
    const universe = this.universes.get(slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }
    
    if (this.activeUniverseSlug === slug) {
      return universe; // Already active
    }
    
    // Optional: Save current universe before switching
    if (options.saveCurrent && this.activeUniverseSlug) {
      try {
        await this.saveActiveUniverse();
      } catch (error) {
        console.warn('[UniverseManager] Failed to save current universe before switch:', error);
      }
    }
    
    this.activeUniverseSlug = slug;
    this.saveToStorage();
    
    this.notifyStatus('info', `Switched to universe: ${universe.name}`);
    
    // Load the universe data based on source of truth
    try {
      const storeState = await this.loadUniverseData(universe);
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
      throw new Error('Git sync engine not configured for this universe');
    }
    
    const redstringData = await gitSyncEngine.loadFromGit();
    if (!redstringData) return null;
    
    const { storeState } = importFromRedstring(redstringData);
    return storeState;
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
      const graphStore = await getGraphStore();
      storeState = graphStore.getState();
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
      const graphStore = await getGraphStore();
      const storeState = graphStore.getState();
      
      // Force commit through the existing GitSyncEngine which handles SHA conflicts properly
      await gitSyncEngine.forceCommit(storeState);
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
              const graphStore = await getGraphStore();
              graphStore.getState().loadUniverseFromFile(newState);
              
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
          const graphStore = await getGraphStore();
          const storeState = graphStore.getState();
          await gitSyncEngine.forceCommit(storeState);
          this.notifyStatus('success', 'Conflict resolved with retry');
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
          
          fileHandle = await window.showSaveFilePicker({
            suggestedName: universe.localFile.path,
            types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }]
          });
          
          // Store the file handle
          this.setFileHandle(universe.slug, fileHandle);
          this.notifyStatus('success', `Local file set up: ${fileHandle.name}`);
          
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
          path: fileHandle.name || universe.localFile.path
        }
      });
    }
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
          const graphStore = await getGraphStore();
          graphStore.getState().loadUniverseFromFile(gitData);
          this.notifyStatus('info', 'Conflict resolved: loaded from Git repository');
          return true;
        }
      } else if (sourceOfTruth === SOURCE_OF_TRUTH.LOCAL) {
        // Local is source of truth, force push to Git
        const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
        if (gitSyncEngine) {
          const graphStore = await getGraphStore();
          const storeState = graphStore.getState();
          await gitSyncEngine.forceCommit(storeState);
          this.notifyStatus('info', 'Conflict resolved: pushed local changes to Git');
          return true;
        }
      }
      
      return false;
    } catch (error) {
      console.error('[UniverseManager] Failed to resolve sync conflict:', error);
      this.notifyStatus('error', `Conflict resolution failed: ${error.message}`);
      return false;
    }
  }
}

// Export singleton instance
export const universeManager = new UniverseManager();
export { SOURCE_OF_TRUTH };
export default universeManager;
