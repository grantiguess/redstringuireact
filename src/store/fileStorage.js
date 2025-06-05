/**
 * File Storage Module for Redstring
 * Handles automatic persistence to universe.redstring file using File System Access API
 * Single universe workflow with auto-save functionality
 */

import { exportToRedstring, importFromRedstring } from '../formats/redstringFormat.js';

// Global state
let fileHandle = null;
let autoSaveInterval = null;
let isAutoSaveEnabled = true;
let lastSaveTime = 0;
let lastChangeTime = 0;
let preferredDirectory = null;

// Constants
const AUTO_SAVE_INTERVAL = 250; // Auto-save every 250ms (4x per second)
const DEBOUNCE_DELAY = 150; // Wait 150ms after last change before saving
const FILE_NAME = 'universe.redstring';

// Default paths for different operating systems
const DEFAULT_PATHS = {
  mac: ['Documents', 'Documents/redstring'],
  windows: ['Documents', 'Documents\\redstring'],
  linux: ['Documents', 'Documents/redstring']
};

// Storage keys
const STORAGE_KEYS = {
  FILE_HANDLE: 'redstring_universe_handle',
  PREFERRED_DIRECTORY: 'redstring_preferred_directory',
  LAST_DATA: 'redstring_last_data',
  SESSION_ACTIVE: 'redstring_session_active'
};

/**
 * Check if File System Access API is supported
 */
export const isFileSystemSupported = () => {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
};

/**
 * Detect operating system
 */
const getOperatingSystem = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes('mac')) return 'mac';
  if (userAgent.includes('win')) return 'windows';
  return 'linux';
};

/**
 * Store preferred directory handle in IndexedDB
 */
const storePreferredDirectory = async (directoryHandle) => {
  try {
    const idbReq = indexedDB.open('redstring-directory', 1);
    idbReq.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('directories')) {
        db.createObjectStore('directories');
      }
    };
    
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = async () => {
        try {
          const db = idbReq.result;
          
          // Check if object store exists before creating transaction
          if (!db.objectStoreNames.contains('directories')) {
            console.warn('[FileStorage] Object store "directories" does not exist');
            db.close();
            return resolve();
          }
          
          const tx = db.transaction('directories', 'readwrite');
          const store = tx.objectStore('directories');
          await store.put(directoryHandle, STORAGE_KEYS.PREFERRED_DIRECTORY);
          preferredDirectory = directoryHandle;
          db.close();
          resolve();
        } catch (error) {
          console.error('[FileStorage] Error storing directory:', error);
          reject(error);
        }
      };
      idbReq.onerror = () => reject(idbReq.error);
    });
  } catch (error) {
    console.warn('[FileStorage] Failed to store preferred directory:', error);
  }
};

/**
 * Try to restore preferred directory handle from IndexedDB
 */
const tryRestorePreferredDirectory = async () => {
  try {
    const idbReq = indexedDB.open('redstring-directory', 1);
    idbReq.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('directories')) {
        db.createObjectStore('directories');
      }
    };
    
    return new Promise((resolve) => {
      idbReq.onsuccess = async () => {
        try {
          const db = idbReq.result;
          
          // Check if object store exists
          if (!db.objectStoreNames.contains('directories')) {
            console.log('[FileStorage] Object store "directories" does not exist');
            db.close();
            return resolve(null);
          }
          
          const tx = db.transaction('directories', 'readonly');
          const store = tx.objectStore('directories');
          const getReq = store.get(STORAGE_KEYS.PREFERRED_DIRECTORY);
          
          getReq.onsuccess = async () => {
            if (getReq.result) {
              // Check if directory handle is still valid
              const permission = await getReq.result.queryPermission({ mode: 'readwrite' });
              if (permission === 'granted') {
                preferredDirectory = getReq.result;
                console.log('[FileStorage] Restored preferred directory handle');
              } else {
                console.log('[FileStorage] Preferred directory handle needs permission re-request');
              }
            }
            db.close();
            resolve(getReq.result || null);
          };
          getReq.onerror = () => {
            db.close();
            resolve(null);
          };
        } catch (error) {
          console.warn('[FileStorage] Error restoring preferred directory:', error);
          resolve(null);
        }
      };
      idbReq.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn('[FileStorage] Failed to restore preferred directory:', error);
    return null;
  }
};

/**
 * Try to find universe.redstring in preferred directory
 */
const tryFindUniverseInDirectory = async (directoryHandle) => {
  try {
    // Check permission first
    let permission = await directoryHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      permission = await directoryHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        console.log('[FileStorage] Permission denied for directory');
        return null;
      }
    }

    // Look for universe.redstring file
    for await (const [name, handle] of directoryHandle.entries()) {
      if (name === FILE_NAME && handle.kind === 'file') {
        console.log('[FileStorage] Found universe.redstring in preferred directory');
        return handle;
      }
    }
    
    console.log('[FileStorage] universe.redstring not found in preferred directory');
    return null;
  } catch (error) {
    console.warn('[FileStorage] Error searching directory:', error);
    return null;
  }
};

/**
 * Store file handle in IndexedDB for persistence across sessions
 */
const storeFileHandle = async (handle) => {
  try {
    fileHandle = handle;
    
    // Store file handle in IndexedDB
    const idbReq = indexedDB.open('redstring-files', 1);
    idbReq.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    
    return new Promise((resolve, reject) => {
      idbReq.onsuccess = async () => {
        try {
          const db = idbReq.result;
          
          // Check if object store exists before creating transaction
          if (!db.objectStoreNames.contains('files')) {
            // If object store doesn't exist, we need to close and recreate with higher version
            db.close();
            const upgradeReq = indexedDB.open('redstring-files', 2);
            upgradeReq.onupgradeneeded = (event) => {
              const upgradeDb = event.target.result;
              if (!upgradeDb.objectStoreNames.contains('files')) {
                upgradeDb.createObjectStore('files');
              }
            };
            upgradeReq.onsuccess = async () => {
              const upgradeDb = upgradeReq.result;
              const tx = upgradeDb.transaction('files', 'readwrite');
              const store = tx.objectStore('files');
              await store.put(handle, STORAGE_KEYS.FILE_HANDLE);
              
              // Also store the directory for future auto-discovery
              if (handle.parent) {
                await storePreferredDirectory(handle.parent);
              }
              
              console.log('[FileStorage] File handle stored in IndexedDB (after upgrade)');
              upgradeDb.close();
              resolve();
            };
            upgradeReq.onerror = () => reject(upgradeReq.error);
            return;
          }
          
          const tx = db.transaction('files', 'readwrite');
          const store = tx.objectStore('files');
          await store.put(handle, STORAGE_KEYS.FILE_HANDLE);
          
          // Also store the directory for future auto-discovery
          if (handle.parent) {
            await storePreferredDirectory(handle.parent);
          }
          
          console.log('[FileStorage] File handle stored in IndexedDB');
          db.close();
          resolve();
        } catch (error) {
          console.error('[FileStorage] Error in transaction:', error);
          reject(error);
        }
      };
      idbReq.onerror = () => reject(idbReq.error);
    });
  } catch (error) {
    console.error('[FileStorage] Failed to store file handle:', error);
    throw error;
  }
};

/**
 * Try to restore file handle from IndexedDB
 */
const tryRestoreFileHandle = async () => {
  try {
    const idbReq = indexedDB.open('redstring-files', 1);
    idbReq.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('files')) {
        db.createObjectStore('files');
      }
    };
    
    return new Promise((resolve) => {
      idbReq.onsuccess = async () => {
        try {
          const db = idbReq.result;
          
          // Check if object store exists
          if (!db.objectStoreNames.contains('files')) {
            console.log('[FileStorage] Object store "files" does not exist');
            db.close();
            return resolve(false);
          }
          
          const tx = db.transaction('files', 'readonly');
          const store = tx.objectStore('files');
          const getReq = store.get(STORAGE_KEYS.FILE_HANDLE);
          
          getReq.onsuccess = async () => {
            if (getReq.result) {
              // Check if file handle is still valid and accessible
              try {
                const permission = await getReq.result.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                  fileHandle = getReq.result;
                  console.log('[FileStorage] File handle restored from IndexedDB');
                  db.close();
                  return resolve(true);
                } else {
                  // Try to re-request permission
                  const newPermission = await getReq.result.requestPermission({ mode: 'readwrite' });
                  if (newPermission === 'granted') {
                    fileHandle = getReq.result;
                    console.log('[FileStorage] File handle permission re-granted');
                    db.close();
                    return resolve(true);
                  } else {
                    console.log('[FileStorage] File handle permission denied');
                    db.close();
                    return resolve(false);
                  }
                }
              } catch (error) {
                console.warn('[FileStorage] File handle no longer valid:', error);
                // Clear file handle and disable auto-save to clean up inconsistent state
                fileHandle = null;
                disableAutoSave();
                db.close();
                return resolve(false);
              }
            } else {
              console.log('[FileStorage] No stored file handle found');
              db.close();
              return resolve(false);
            }
          };
          getReq.onerror = () => {
            db.close();
            resolve(false);
          };
        } catch (error) {
          console.warn('[FileStorage] Error restoring file handle:', error);
          resolve(false);
        }
      };
      idbReq.onerror = () => resolve(false);
    });
  } catch (error) {
    console.log('[FileStorage] Could not restore file handle:', error);
    return false;
  }
};

/**
 * Setup auto-save functionality
 */
const setupAutoSave = (getStoreStateFn) => {
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
  }
  
  if (isAutoSaveEnabled && fileHandle && getStoreStateFn) {
    autoSaveInterval = setInterval(async () => {
      try {
        const now = Date.now();
        
        // Only save if:
        // 1. There have been changes since last save (lastChangeTime > lastSaveTime)
        // 2. Enough time has passed since the last change (debounce)
        if (lastChangeTime <= lastSaveTime) {
          return; // No changes since last save
        }
        
        if (now - lastChangeTime < DEBOUNCE_DELAY) {
          return; // Too soon after last change (debounce)
        }
        const storeState = getStoreStateFn();
        const success = await saveToFile(storeState, false); // false = silent auto-save
        if (!success) {
          console.warn('[FileStorage] Auto-save failed');
        }
      } catch (error) {
        console.error('[FileStorage] Auto-save failed:', error);
      }
    }, AUTO_SAVE_INTERVAL);
    
    console.log(`[FileStorage] Auto-save enabled (every ${AUTO_SAVE_INTERVAL}ms)`);
  }
};

/**
 * Create default empty state
 */
const createEmptyState = () => ({
  graphs: new Map(),
  nodes: new Map(), 
  edges: new Map(),
  openGraphIds: [],
  activeGraphId: null,
  activeDefinitionNodeId: null,
  expandedGraphIds: new Set(),
  rightPanelTabs: [{ type: 'home', isActive: true }],
  savedNodeIds: new Set(),
  savedGraphIds: new Set()
});

/**
 * Create the universe.redstring file (or let user choose location)
 */
export const createUniverseFile = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported in this browser');
  }

  try {
    // Get suggested starting directory based on OS
    const suggestedLocations = getSuggestedLocations();
    
    // Prompt user to save the universe.redstring file
    const handle = await window.showSaveFilePicker({
      suggestedName: FILE_NAME,
      startIn: 'documents',
      types: [{
        description: 'Redstring Universe Files',
        accept: { 'application/json': ['.redstring'] }
      }]
    });
    
    await storeFileHandle(handle);
    
    // Create initial empty state
    const initialState = createEmptyState();
    
    // Write initial data to file
    const redstringData = exportToRedstring(initialState);
    const dataString = JSON.stringify(redstringData, null, 2);
    
    const writable = await handle.createWritable({
      keepExistingData: false
    });
    
    await writable.write(dataString);
    await writable.close();
    
    // Store session data
    localStorage.setItem(STORAGE_KEYS.LAST_DATA, dataString);
    localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    
    lastSaveTime = Date.now();
    console.log('[FileStorage] Universe file created successfully');
    
    return initialState;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[FileStorage] User cancelled file creation');
      return null;
    }
    console.error('[FileStorage] Failed to create universe file:', error);
    throw error;
  }
};

/**
 * Open existing universe.redstring file
 */
export const openUniverseFile = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported');
  }

  try {
    // Get suggested starting directory based on OS
    const suggestedLocations = getSuggestedLocations();
    
    const [handle] = await window.showOpenFilePicker({
      startIn: 'documents',
      types: [{
        description: 'Redstring Universe Files',
        accept: { 'application/json': ['.redstring'] }
      }],
      multiple: false
    });
    
    await storeFileHandle(handle);
    
    // Read the file
    const file = await handle.getFile();
    const text = await file.text();
    
    // Validate file content
    if (!text || text.trim() === '') {
      throw new Error('The selected file is empty (0 bytes). This can happen if the file was never saved to or got corrupted. Please create a new universe or choose a different file.');
    }
    
    let jsonData;
    try {
      jsonData = JSON.parse(text);
    } catch (parseError) {
      console.error('[FileStorage] JSON parse error:', parseError);
      throw new Error(`Invalid JSON in universe file: ${parseError.message}. The file may be corrupted.`);
    }
    
    // Import the data
    const importResult = importFromRedstring(jsonData);
    
    if (importResult.errors && importResult.errors.length > 0) {
      console.warn('[FileStorage] Import warnings:', importResult.errors);
    }
    
    // Store session data
    localStorage.setItem(STORAGE_KEYS.LAST_DATA, text);
    localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    
    console.log('[FileStorage] Universe file loaded successfully');
    
    return importResult.storeState;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[FileStorage] User cancelled file selection');
      return null;
    }
    console.error('[FileStorage] Failed to open universe file:', error);
    throw error;
  }
};

/**
 * Smart auto-connect that tries multiple strategies to find universe.redstring
 */
export const autoConnectToUniverse = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported');
  }

  console.log('[FileStorage] Starting auto-connect to universe...');
  
  // Strategy 1: Try to restore the exact file handle
  const fileRestored = await tryRestoreFileHandle();
  if (fileRestored && fileHandle) {
    try {
      const file = await fileHandle.getFile();
      const text = await file.text();
      
      // Validate file content
      if (!text || text.trim() === '') {
        throw new Error('Stored file is empty');
      }
      
      let jsonData;
      try {
        jsonData = JSON.parse(text);
      } catch (parseError) {
        throw new Error(`Invalid JSON in stored file: ${parseError.message}`);
      }
      
      const importResult = importFromRedstring(jsonData);
      
      localStorage.setItem(STORAGE_KEYS.LAST_DATA, text);
      localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
      
      console.log('[FileStorage] Auto-connected using stored file handle');
      return importResult.storeState;
    } catch (error) {
      console.warn('[FileStorage] Stored file handle failed to load:', error);
      
      // Clear the corrupted/empty file handle from storage and disable auto-save
      fileHandle = null;
      disableAutoSave();
      try {
        await clearIndexedDB();
        console.log('[FileStorage] Cleared corrupted file handle from storage');
      } catch (clearError) {
        console.warn('[FileStorage] Failed to clear corrupted storage:', clearError);
      }
    }
  }

  // Strategy 2: Try to find universe.redstring in the preferred directory
  await tryRestorePreferredDirectory();
  if (preferredDirectory) {
    const foundFile = await tryFindUniverseInDirectory(preferredDirectory);
    if (foundFile) {
      try {
        await storeFileHandle(foundFile);
        const file = await foundFile.getFile();
        const text = await file.text();
        
        // Validate file content
        if (!text || text.trim() === '') {
          throw new Error('Found file is empty');
        }
        
        let jsonData;
        try {
          jsonData = JSON.parse(text);
        } catch (parseError) {
          throw new Error(`Invalid JSON in found file: ${parseError.message}`);
        }
        
        const importResult = importFromRedstring(jsonData);
        
        localStorage.setItem(STORAGE_KEYS.LAST_DATA, text);
        localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
        
        console.log('[FileStorage] Auto-connected using preferred directory');
        return importResult.storeState;
      } catch (error) {
        console.warn('[FileStorage] Found file but failed to load:', error);
      }
    }
  }

  console.log('[FileStorage] Auto-connect failed, user intervention required');
  return null;
};

/**
 * Get suggested default locations for universe.redstring
 */
export const getSuggestedLocations = () => {
  const os = getOperatingSystem();
  return DEFAULT_PATHS[os] || DEFAULT_PATHS.linux;
};

/**
 * Try to restore the last session with smart auto-connect
 */
export const restoreLastSession = async () => {
  try {
    // Only try auto-connect to universe file - no localStorage fallback
    const autoConnectResult = await autoConnectToUniverse();
    if (autoConnectResult) {
      return {
        success: true,
        storeState: autoConnectResult,
        autoConnected: true,
        hasUniverseFile: true
      };
    }

    // No fallback to localStorage - universe file is required
    console.log('[FileStorage] No universe file found, user must create or open one');
    return { 
      success: false, 
      reason: 'no_universe_file',
      message: 'No universe file found. Please create a new universe or open an existing one.'
    };
  } catch (error) {
    console.error('[FileStorage] Failed to restore session:', error);
    return { 
      success: false, 
      reason: 'error',
      message: `Failed to restore session: ${error.message}`
    };
  }
};

/**
 * Save current state to the universe file
 */
export const saveToFile = async (storeState, showSuccess = true) => {
  if (!fileHandle) {
    console.warn('[FileStorage] No file handle available for saving');
    return false;
  }
  
  try {
    // Check/request permissions
    let permission = await fileHandle.queryPermission({ mode: 'readwrite' });
    if (permission !== 'granted') {
      permission = await fileHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        throw new Error('File permission denied');
      }
    }
    
    // Export to redstring format
    const redstringData = exportToRedstring(storeState);
    const dataString = JSON.stringify(redstringData, null, 2);
    
    // Write to file
    const writable = await fileHandle.createWritable({
      keepExistingData: false
    });
    
    await writable.write(dataString);
    await writable.close();
    
    // Update localStorage
    localStorage.setItem(STORAGE_KEYS.LAST_DATA, dataString);
    localStorage.setItem(STORAGE_KEYS.SESSION_ACTIVE, 'true');
    
    lastSaveTime = Date.now();
    
    if (showSuccess) {
      console.log('[FileStorage] File saved successfully');
    }
    
    return true;
  } catch (error) {
    console.error('[FileStorage] Failed to save file:', error);
    
    // If permission was denied, clear the file handle and disable auto-save
    if (error.message.includes('permission') || error.name === 'NotAllowedError') {
      fileHandle = null;
      disableAutoSave();
      localStorage.removeItem(STORAGE_KEYS.FILE_HANDLE);
    }
    
    throw error;
  }
};

/**
 * Notify that changes have been made to trigger auto-save
 */
export const notifyChanges = () => {
  lastChangeTime = Date.now();
};

/**
 * Enable auto-save with store state getter
 */
export const enableAutoSave = (getStoreStateFn) => {
  isAutoSaveEnabled = true;
  // Trigger initial change notification so auto-save can start working
  notifyChanges();
  setupAutoSave(getStoreStateFn);
};

/**
 * Disable auto-save
 */
export const disableAutoSave = () => {
  isAutoSaveEnabled = false;
  if (autoSaveInterval) {
    clearInterval(autoSaveInterval);
    autoSaveInterval = null;
  }
};

/**
 * Check if we have a file handle and can auto-save
 */
export const canAutoSave = () => {
  return !!fileHandle && isAutoSaveEnabled;
};

/**
 * Get current file status
 */
export const getFileStatus = () => {
  return {
    hasFileHandle: fileHandle !== null,
    fileName: fileHandle ? (fileHandle.name || FILE_NAME) : null,
    autoSaveEnabled: isAutoSaveEnabled,
    autoSaveActive: autoSaveInterval !== null,
    lastSaveTime: lastSaveTime,
    lastChangeTime: lastChangeTime
  };
};

/**
 * Clear corrupted IndexedDB databases
 */
export const clearIndexedDB = async () => {
  try {
    console.log('[FileStorage] Clearing potentially corrupted IndexedDB databases');
    
    // Clear file handles database
    try {
      const deleteFileDb = indexedDB.deleteDatabase('redstring-files');
      await new Promise((resolve, reject) => {
        deleteFileDb.onsuccess = () => resolve();
        deleteFileDb.onerror = () => reject(deleteFileDb.error);
      });
      console.log('[FileStorage] Cleared redstring-files database');
    } catch (error) {
      console.warn('[FileStorage] Could not clear redstring-files database:', error);
    }
    
    // Clear directory database
    try {
      const deleteDirDb = indexedDB.deleteDatabase('redstring-directory');
      await new Promise((resolve, reject) => {
        deleteDirDb.onsuccess = () => resolve();
        deleteDirDb.onerror = () => reject(deleteDirDb.error);
      });
      console.log('[FileStorage] Cleared redstring-directory database');
    } catch (error) {
      console.warn('[FileStorage] Could not clear redstring-directory database:', error);
    }
    
    // Reset global state
    fileHandle = null;
    preferredDirectory = null;
    
    console.log('[FileStorage] IndexedDB cleared successfully');
  } catch (error) {
    console.error('[FileStorage] Error clearing IndexedDB:', error);
  }
};

/**
 * Clear session data
 */
export const clearSession = async () => {
  localStorage.removeItem(STORAGE_KEYS.LAST_DATA);
  localStorage.removeItem(STORAGE_KEYS.SESSION_ACTIVE);
  localStorage.removeItem(STORAGE_KEYS.FILE_HANDLE);
  fileHandle = null;
  disableAutoSave();
  
  // Also clear IndexedDB to prevent corruption issues
  await clearIndexedDB();
  
  console.log('[FileStorage] Session cleared');
};

/**
 * Force save (for manual save actions)
 */
export const forceSave = async (storeState) => {
  if (!fileHandle) {
    throw new Error('No file selected. Please create or open a universe file first.');
  }
  
  return await saveToFile(storeState, true);
};

/**
 * Initialize with auto-save capability
 */
export const initializeAutoSave = (getStoreStateFn) => {
  if (fileHandle && isAutoSaveEnabled) {
    setupAutoSave(getStoreStateFn);
  }
};

// Legacy functions for compatibility
export const createDefaultFile = createUniverseFile;
export const loadFromFile = openUniverseFile;
export const promptForFile = openUniverseFile; 