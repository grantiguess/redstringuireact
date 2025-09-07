/**
 * Universe Manager - Unified system for managing multiple universes
 * Bridges FileStorage, GitNativeFederation, and GitSyncEngine
 * Each universe has dual storage slots: local file + git repository
 */

import { exportToRedstring, importFromRedstring } from '../formats/redstringFormat.js';
import { v4 as uuidv4 } from 'uuid';

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
    
    // Process watchdog to ensure Git sync engines stay alive
    this.watchdogInterval = null;
    this.watchdogDelay = 30000; // Check every 30 seconds
    
    this.loadFromStorage();
    this.startWatchdog();
  }

  // Initialize background sync services (called at app startup)
  async initializeBackgroundSync() {
    try {
      console.log('[UniverseManager] Initializing background sync services...');
      
      // Initialize auth first
      const persistentAuth = await import('../services/persistentAuth.js');
      await persistentAuth.persistentAuth.initialize();
      
      const authStatus = persistentAuth.persistentAuth.getAuthStatus();
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

  // Load universes from localStorage
  loadFromStorage() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.UNIVERSES_LIST);
      const activeSlug = localStorage.getItem(STORAGE_KEYS.ACTIVE_UNIVERSE);
      
      if (saved) {
        const universesList = JSON.parse(saved);
        universesList.forEach(universe => {
          this.universes.set(universe.slug, this.normalizeUniverse(universe));
        });
      }
      
      // Create default universe if none exist
      if (this.universes.size === 0) {
        this.createDefaultUniverse();
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
      this.createDefaultUniverse();
    }
  }

  // Migrate existing FileStorage file handle to UniverseManager
  async migrateExistingFileHandle() {
    try {
      // Import FileStorage to get existing file handle
      const fileStorage = await import('../store/fileStorage.js');
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
  normalizeUniverse(universe) {
    return {
      slug: universe.slug || 'universe',
      name: universe.name || 'Universe',
      
      // Storage configuration
      sourceOfTruth: universe.sourceOfTruth || SOURCE_OF_TRUTH.GIT, // Git is default
      
      // Local storage slot
      localFile: {
        enabled: universe.localFile?.enabled ?? true,
        path: this.sanitizeFileName(universe.localFile?.path || `${universe.name || 'Universe'}.redstring`),
        handle: null // Will be restored separately
      },
      
      // Git storage slot
      gitRepo: {
        enabled: universe.gitRepo?.enabled ?? false,
        linkedRepo: universe.gitRepo?.linkedRepo || universe.linkedRepo || null, // Migration from old format
        schemaPath: universe.gitRepo?.schemaPath || universe.schemaPath || 'schema',
        universeFolder: `universes/${universe.slug}` // Standard path structure
      },
      
      // Browser storage fallback
      browserStorage: {
        enabled: universe.browserStorage?.enabled ?? this.isMobileDevice(),
        key: `universe_${universe.slug}`
      },
      
      // Metadata
      created: universe.created || new Date().toISOString(),
      lastModified: universe.lastModified || new Date().toISOString(),
      
      // Legacy compatibility
      sources: universe.sources || [] // For GitNativeFederation compatibility
    };
  }

  // Create the default universe
  createDefaultUniverse() {
    const defaultUniverse = {
      slug: 'universe',
      name: 'Universe',
      sourceOfTruth: SOURCE_OF_TRUTH.GIT,
      localFile: { enabled: true, path: 'Universe.redstring' }, // Enable by default, will auto-prompt for file
      gitRepo: { enabled: false, linkedRepo: null, schemaPath: 'schema' },
      browserStorage: { enabled: true } // Always enable as fallback
    };
    
    this.universes.set('universe', this.normalizeUniverse(defaultUniverse));
    this.activeUniverseSlug = 'universe';
    this.saveToStorage();
  }

  // Ensure universe has at least one storage slot enabled
  ensureStorageAvailable(universe) {
    const hasAnyStorage = universe.localFile.enabled || 
                         universe.gitRepo.enabled || 
                         universe.browserStorage.enabled;
    
    if (!hasAnyStorage) {
      console.warn('[UniverseManager] Universe has no storage slots enabled, enabling browser storage as fallback');
      return {
        ...universe,
        browserStorage: { ...universe.browserStorage, enabled: true }
      };
    }
    
    return universe;
  }

  // Check if we're on a mobile device (for browser storage fallback)
  isMobileDevice() {
    return !('showSaveFilePicker' in window && 'showOpenFilePicker' in window);
  }

  // Save universes to localStorage
  saveToStorage() {
    try {
      const universesList = Array.from(this.universes.values()).map(universe => {
        // Don't save file handles in localStorage
        const { localFile, ...rest } = universe;
        return {
          ...rest,
          localFile: {
            enabled: localFile.enabled,
            path: localFile.path
          }
        };
      });
      
      localStorage.setItem(STORAGE_KEYS.UNIVERSES_LIST, JSON.stringify(universesList));
      localStorage.setItem(STORAGE_KEYS.ACTIVE_UNIVERSE, this.activeUniverseSlug);
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
    const slug = this.generateUniqueSlug(name);
    const universe = this.normalizeUniverse({
      slug,
      name,
      sourceOfTruth: options.sourceOfTruth || SOURCE_OF_TRUTH.GIT,
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
      const useGraphStore = await import('../store/graphStore.jsx');
      storeState = useGraphStore.default.getState();
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
      const useGraphStore = await import('../store/graphStore.jsx');
      const storeState = useGraphStore.default.getState();
      
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
              const { storeState: newState } = await import('../formats/redstringFormat.js').then(m => m.importFromRedstring(gitData));
              const useGraphStore = await import('../store/graphStore.jsx');
              useGraphStore.default.getState().loadUniverseFromFile(newState);
              
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
          const useGraphStore = await import('../store/graphStore.jsx');
          const storeState = useGraphStore.default.getState();
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

  // Set Git sync engine for universe
  setGitSyncEngine(slug, gitSyncEngine) {
    this.gitSyncEngines.set(slug, gitSyncEngine);
    console.log(`[UniverseManager] Git sync engine registered for universe: ${slug}`);
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
        console.warn(`[UniverseManager] Git sync engine for ${slug} is unhealthy - but NOT restarting to prevent conflicts`);
        // DISABLED: Don't restart engines automatically as it causes 409 conflicts
        // Multiple engines competing for the same file causes endless 409 loops
        // Manual restart available through UI if needed
        this.notifyStatus('warning', `Sync engine for ${slug} is unhealthy - manual restart may be needed`);
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
          const useGraphStore = await import('../store/graphStore.jsx');
          useGraphStore.default.getState().loadUniverseFromFile(gitData);
          this.notifyStatus('info', 'Conflict resolved: loaded from Git repository');
          return true;
        }
      } else if (sourceOfTruth === SOURCE_OF_TRUTH.LOCAL) {
        // Local is source of truth, force push to Git
        const gitSyncEngine = this.gitSyncEngines.get(universe.slug);
        if (gitSyncEngine) {
          const useGraphStore = await import('../store/graphStore.jsx');
          const storeState = useGraphStore.default.getState();
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
