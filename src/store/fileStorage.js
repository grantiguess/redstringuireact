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
  FILE_SESSION_ACTIVE: 'redstring_file_session_active'
};

// Check if File System Access API is supported
export const isFileSystemSupported = () => {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
};

/**
 * Check if there's a previous session and restore it automatically
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
          savedNodeIds: new Set(),
          savedGraphIds: new Set(),
          expandedGraphIds: new Set()
        };
        
        await saveToFile(initialData);
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
    try {
      isAutoSaving = true;
      
      const writable = await fileHandle.createWritable();
      const redstringData = exportToRedstring(storeState);
      const dataString = JSON.stringify(redstringData, null, 2);
      
      await writable.write(dataString);
      await writable.close();
      
      // Also save to localStorage for session restoration
      try {
        localStorage.setItem(STORAGE_KEYS.LAST_FILE_DATA, dataString);
        localStorage.setItem(STORAGE_KEYS.FILE_SESSION_ACTIVE, 'true');
        localStorage.setItem(STORAGE_KEYS.LAST_FILE_NAME, fileHandle.name || 'unknown.redstring');
      } catch (storageError) {
        console.warn('[FileStorage] Failed to save to localStorage:', storageError);
      }
      
      console.log('[FileStorage] Auto-saved to file successfully');
    } catch (error) {
      console.error('[FileStorage] Failed to save to file:', error);
      
      // If permission was denied, try to re-request file access
      if (error.name === 'NotAllowedError') {
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
  fileHandle = null;
  console.log('[FileStorage] Session cleared');
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