// Universes adapter index: re-export universeBackend as the single source of truth
// universeManager has been consolidated into universeBackend

import universeBackend from '../../services/universeBackend.js';

// Export universeBackend as both default and named export for compatibility
export default universeBackend;
export { universeBackend as universeManager }; // For backward compatibility during migration

// Export SOURCE_OF_TRUTH constant
export const SOURCE_OF_TRUTH = {
  LOCAL: 'local',    // Local .redstring file is authoritative
  GIT: 'git',        // Git repository is authoritative (default)
  BROWSER: 'browser' // Browser storage fallback for mobile
};


