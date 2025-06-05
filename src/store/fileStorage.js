/**
 * File Storage Module for Redstring
 * Handles automatic persistence to .redstring files using File System Access API
 */

import { exportToRedstring, importFromRedstring } from '../formats/redstringFormat.js';

let fileHandle = null;
let isAutoSaving = false;
let pendingSave = null;

// Keys for localStorage persistence
const STORAGE_KEYS = {
  LAST_FILE_DATA: 'redstring_last_file_data',
  LAST_FILE_NAME: 'redstring_last_file_name',
  FILE_SESSION_ACTIVE: 'redstring_file_session_active',
  HAS_DEFAULT_FILE: 'redstring_has_default_file',
  DEFAULT_FILE_HANDLE: 'redstring_default_file_handle'
};

// Default file path and name
const DEFAULT_FOLDER_NAME = 'redstring';
const DEFAULT_FILE_NAME = 'universe.redstring';

// Check if File System Access API is supported
export const isFileSystemSupported = () => {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
};

/**
 * Check if we have a default file set up
 */
export const hasDefaultFileSetup = () => {
  return localStorage.getItem(STORAGE_KEYS.HAS_DEFAULT_FILE) === 'true';
};

/**
 * Create the default redstring folder and universe.redstring file
 */
export const createDefaultFile = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported in this browser');
  }

  try {
    // Try to create/select the default file with better directory suggestion
    fileHandle = await window.showSaveFilePicker({
      suggestedName: DEFAULT_FILE_NAME,
      startIn: 'documents', // Start in Documents folder
      types: [{
        description: 'Redstring Universe Files',
        accept: { 'application/json': ['.redstring'] }
      }]
    });
    
    // Mark that we have a default file set up
    localStorage.setItem(STORAGE_KEYS.HAS_DEFAULT_FILE, 'true');
    localStorage.setItem('redstring-file-handle', 'stored');
    
    // Create empty initial state for new file
    const initialData = {
      graphs: new Map(),
      nodes: new Map(), 
      edges: new Map(),
      openGraphIds: [],
      activeGraphId: null,
      activeDefinitionNodeId: null,
      rightPanelTabs: [{ type: 'home', isActive: true }],
      savedNodeIds: new Set(),
      savedGraphIds: new Set(),
      expandedGraphIds: new Set()
    };
    
    // Write the empty data to the file immediately
    const redstringData = exportToRedstring(initialData);
    const dataString = JSON.stringify(redstringData, null, 2);
    
    const writable = await fileHandle.createWritable({
      keepExistingData: false // Explicitly overwrite
    });
    
    await writable.write(dataString);
    await writable.close();
    
    // Also save to localStorage for session restoration
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, dataString);
      localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || DEFAULT_FILE_NAME);
    } catch (storageError) {
      console.warn('[FileStorage] Failed to save to localStorage after creating default file:', storageError);
    }
    
    console.log('[FileStorage] Created default universe file successfully');
    return initialData;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[FileStorage] User cancelled default file creation');
      return null;
    }
    console.error('[FileStorage] Failed to create default file:', error);
    throw error;
  }
};

/**
 * Check if there's a previous session and restore it automatically
 * If no session exists but we have a default file setup, try to auto-load it
 */
export const restoreLastSession = async () => {
  try {
    const hasActiveSession = localStorage.getItem(STORAGE_KEYS.FILE_SESSION_ACTIVE);
    const lastFileData = localStorage.getItem(STORAGE_KEYS.LAST_FILE_DATA);
    const lastFileName = localStorage.getItem(STORAGE_KEYS.LAST_FILE_NAME);
    
    if (hasActiveSession && lastFileData) {
      console.log('[FileStorage] Restoring last session:', lastFileName || 'unnamed file');
      
      // Parse and return the stored data
      const jsonData = JSON.parse(lastFileData);
      const importResult = importFromRedstring(jsonData, null);
      
      if (importResult.errors.length > 0) {
        console.warn('[FileStorage] Restore warnings:', importResult.errors);
      }
      
      return {
        success: true,
        storeState: importResult.storeState,
        fileName: lastFileName
      };
    }
    
    // If no session but we have a default file setup, return false so user can set up
    // The NodeCanvas will handle the initial setup
    console.log('[FileStorage] No session found. Will show setup screen.');
    
    return { success: false };
  } catch (error) {
    console.error('[FileStorage] Failed to restore last session:', error);
    // Clear corrupted data
    localStorage.removeItem(STORAGE_KEYS.LAST_FILE_DATA);
    localStorage.removeItem(STORAGE_KEYS.FILE_SESSION_ACTIVE);
    localStorage.removeItem(STORAGE_KEYS.LAST_FILE_NAME);
    return { success: false };
  }
};

/**
 * Auto-load or create the default file without user prompts
 * This tries to seamlessly handle the default universe file
 */
export const autoLoadOrCreateDefaultFile = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported in this browser');
  }

  // For the automatic case, we'll create the default file only when the user first interacts
  // This function will be called on the first load attempt
  return await createDefaultFile();
};

/**
 * Initialize file storage - either load existing or create new
 * Now requires user gesture to work properly
 */
export const initializeFileStorage = async () => {
  if (!isFileSystemSupported()) {
    console.warn('File System Access API not supported, falling back to localStorage');
    throw new Error('File System Access API not supported in this browser');
  }

  try {
    // Always prompt user to select/create file (no automatic restoration)
    // This ensures we have a proper user gesture
    return await promptForFile();
  } catch (error) {
    console.error('Failed to initialize file storage:', error);
    throw error; // Re-throw so the calling code can handle it
  }
};

/**
 * Prompt user to select or create a .redstring file
 */
export const promptForFile = async () => {
  if (!isFileSystemSupported()) return null;

  try {
    // First try to open existing file
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Redstring files',
          accept: { 'application/json': ['.redstring'] }
        }],
        multiple: false
      });
      
      fileHandle = handle;
      localStorage.setItem('redstring-file-handle', 'stored');
      return await loadFromFile();
    } catch (openError) {
      // If user cancelled open, try save (create new file)
      if (openError.name === 'AbortError') {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'cognitive-space.redstring',
          types: [{
            description: 'Redstring files',
            accept: { 'application/json': ['.redstring'] }
          }]
        });
        
        localStorage.setItem('redstring-file-handle', 'stored');
        
        // Create empty initial state for new file
        const initialData = {
          graphs: new Map(),
          nodes: new Map(), 
          edges: new Map(),
          openGraphIds: [],
          activeGraphId: null,
          activeDefinitionNodeId: null,
          rightPanelTabs: [{ type: 'home', isActive: true }],
          savedNodeIds: new Set(),
          savedGraphIds: new Set(),
          expandedGraphIds: new Set()
        };
        
        // Write the empty data to the file immediately
        const redstringData = exportToRedstring(initialData);
        const dataString = JSON.stringify(redstringData, null, 2);
        
        const writable = await fileHandle.createWritable({
          keepExistingData: false // Explicitly overwrite
        });
        
        await writable.write(dataString);
        await writable.close();
        
        // Also save to localStorage for session restoration
        try {
          localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, dataString);
          localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
          localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || 'unknown.redstring');
        } catch (storageError) {
          console.warn('[FileStorage] Failed to save to localStorage after creating new file:', storageError);
        }
        
        console.log('[FileStorage] Created new empty file successfully');
        return initialData;
      }
      throw openError;
    }
  } catch (error) {
    console.error('File selection cancelled or failed:', error);
    return null;
  }
};

/**
 * Load data from the current file
 */
export const loadFromFile = async () => {
  if (!fileHandle) return null;

  try {
    const file = await fileHandle.getFile();
    const content = await file.text();
    
    if (!content.trim()) {
      // Empty file, return initial state
      return {
        graphs: new Map(),
        nodes: new Map(),
        edges: new Map(), 
        openGraphIds: [],
        activeGraphId: null,
        activeDefinitionNodeId: null,
        savedNodeIds: new Set(),
        savedGraphIds: new Set(),
        expandedGraphIds: new Set()
      };
    }

    const jsonData = JSON.parse(content);
    console.log('[FileStorage] Loaded data from file:', jsonData['@context'] ? 'JSON-LD format' : 'native format');
    
    // Use the existing import function which returns { storeState, errors }
    const importResult = importFromRedstring(jsonData, null);
    
    if (importResult.errors.length > 0) {
      console.warn('[FileStorage] Import warnings:', importResult.errors);
    }
    
    // Save to localStorage for session restoration
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, content);
      localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || 'unknown.redstring');
    } catch (storageError) {
      console.warn('[FileStorage] Failed to save to localStorage after load:', storageError);
    }
    
    return importResult.storeState;
  } catch (error) {
    console.error('Failed to load from file:', error);
    return null;
  }
};

/**
 * Save data to the current file (with debouncing)
 */
export const saveToFile = async (storeState) => {
  if (!fileHandle || isAutoSaving) return;

  // Debounce saves - cancel previous pending save
  if (pendingSave) {
    clearTimeout(pendingSave);
  }

  pendingSave = setTimeout(async () => {
    let writable = null;
    try {
      isAutoSaving = true;
      
      // Check if we still have permission to the file
      const permission = await fileHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        const newPermission = await fileHandle.requestPermission({ mode: 'readwrite' });
        if (newPermission !== 'granted') {
          throw new Error('File permission denied');
        }
      }
      
      console.log('[FileStorage] Starting save operation...');
      
      // Prepare the data
      const redstringData = exportToRedstring(storeState);
      const dataString = JSON.stringify(redstringData, null, 2);
      
      // Create writable stream with explicit options
      writable = await fileHandle.createWritable({
        keepExistingData: false // Explicitly overwrite existing data
      });
      
      // Write data and ensure proper closure
      await writable.write(dataString);
      await writable.close();
      writable = null; // Mark as closed
      
      // Also save to localStorage for session restoration
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, dataString);
        localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
        localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || 'unknown.redstring');
      } catch (storageError) {
        console.warn('[FileStorage] Failed to save to localStorage:', storageError);
      }
      
      console.log('[FileStorage] Auto-saved to file successfully:', fileHandle.name);
    } catch (error) {
      console.error('[FileStorage] Failed to save to file:', error);
      
      // Ensure writable is closed if there was an error
      if (writable) {
        try {
          await writable.close();
        } catch (closeError) {
          console.error('[FileStorage] Failed to close writable stream:', closeError);
        }
      }
      
      // If permission was denied, try to re-request file access
      if (error.name === 'NotAllowedError' || error.message.includes('permission')) {
        fileHandle = null;
        localStorage.removeItem('redstring-file-handle');
        console.log('[FileStorage] File access revoked, will prompt on next save');
      }
    } finally {
      isAutoSaving = false;
      pendingSave = null;
    }
  }, 500); // Debounce for 500ms
};

/**
 * Get current file handle status
 */
export const getFileStatus = () => {
  return {
    hasFileHandle: !!fileHandle,
    isSupported: isFileSystemSupported(),
    isAutoSaving
  };
};

/**
 * Clear the current session data
 */
export const clearSession = () => {
  localStorage.removeItem(STORAGE_KEYS.LAST_FILE_DATA);
  localStorage.removeItem(STORAGE_KEYS.FILE_SESSION_ACTIVE);
  localStorage.removeItem(STORAGE_KEYS.LAST_FILE_NAME);
  localStorage.removeItem(STORAGE_KEYS.HAS_DEFAULT_FILE);
  localStorage.removeItem('redstring-file-handle');
  fileHandle = null;
  console.log('[FileStorage] Session cleared');
};

/**
 * Create a new empty universe file
 */
export const createNewUniverse = async () => {
  if (!isFileSystemSupported()) {
    throw new Error('File System Access API not supported in this browser');
  }

  try {
    // Prompt for save location for new file
    fileHandle = await window.showSaveFilePicker({
      suggestedName: 'cognitive-space.redstring',
      types: [{
        description: 'Redstring files',
        accept: { 'application/json': ['.redstring'] }
      }]
    });
    
    localStorage.setItem('redstring-file-handle', 'stored');
    
    // Create empty initial state for new file
    const initialData = {
      graphs: new Map(),
      nodes: new Map(), 
      edges: new Map(),
      openGraphIds: [],
      activeGraphId: null,
      activeDefinitionNodeId: null,
      rightPanelTabs: [{ type: 'home', isActive: true }],
      savedNodeIds: new Set(),
      savedGraphIds: new Set(),
      expandedGraphIds: new Set()
    };
    
    // Write the empty data to the file immediately
    const redstringData = exportToRedstring(initialData);
    const dataString = JSON.stringify(redstringData, null, 2);
    
    const writable = await fileHandle.createWritable({
      keepExistingData: false // Explicitly overwrite
    });
    
    await writable.write(dataString);
    await writable.close();
    
    // Also save to localStorage for session restoration
    try {
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, dataString);
      localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
      localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || 'unknown.redstring');
    } catch (storageError) {
      console.warn('[FileStorage] Failed to save to localStorage after creating new file:', storageError);
    }
    
    console.log('[FileStorage] Created new empty universe file successfully');
    return initialData;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[FileStorage] User cancelled new file creation');
      return null;
    }
    console.error('[FileStorage] Failed to create new universe:', error);
    throw error;
  }
};

/**
 * Manually trigger save (useful for testing)
 */
export const forceSave = async (storeState) => {
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  
  if (!fileHandle) {
    console.log('[FileStorage] No file handle, prompting for file...');
    await promptForFile();
  }
  
  if (fileHandle) {
    isAutoSaving = false; // Allow immediate save
    await saveToFile(storeState);
  }
};

/**
 * Reset file system and clear any problematic handles
 * Use this if you encounter .crswrap/.crswap files or other file system issues
 */
export const resetFileSystem = () => {
  console.log('[FileStorage] Resetting file system...');
  
  // Clear all pending operations
  if (pendingSave) {
    clearTimeout(pendingSave);
    pendingSave = null;
  }
  
  // Reset file handle
  fileHandle = null;
  isAutoSaving = false;
  
  // Clear all localStorage entries
  clearSession();
  
  console.log('[FileStorage] File system reset complete. Please create or open a file again.');
}; 