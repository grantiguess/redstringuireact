/**
 * Universe Operations Dialog - Centralized file operations interface
 * Bridges RedstringMenu and GitNativeFederation universe management
 * Styled like the existing panel modals
 * Mobile/tablet aware with Git-Only mode support
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  FileText, 
  FolderOpen, 
  Save, 
  Download, 
  Upload,
  Plus,
  Trash2,
  Edit3,
  Globe,
  HardDrive,
  Smartphone,
  X,
  Check,
  AlertCircle,
  GitBranch,
  Link,
  QrCode
} from 'lucide-react';
// Lazy import UniverseManager to avoid circular init during federation tab load
let __um = null;
const getUniverseManager = async () => {
  if (!__um) {
    const mod = await import('../services/universeManager.js');
    __um = mod.default || mod.universeManager;
  }
  return __um;
};
// SOURCE_OF_TRUTH values not used outside universeManager calls here; fetch from manager when needed
import useGraphStore from "../store/graphStore.jsx";
import { 
  getCurrentDeviceConfig, 
  shouldUseGitOnlyMode, 
  hasCapability,
  getDeviceCapabilityMessage
} from '../utils/deviceDetection.js';

const UniverseOperationsDialog = ({ isOpen, onClose, initialOperation = null }) => {
  const [operation, setOperation] = useState(initialOperation || 'overview');
  const [universes, setUniverses] = useState([]);
  const [activeUniverse, setActiveUniverse] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState(null);
  const [newUniverseName, setNewUniverseName] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(null);
  const [gitUrl, setGitUrl] = useState('');
  const [deviceConfig, setDeviceConfig] = useState(getCurrentDeviceConfig());

  const loadUniverseFromFile = useGraphStore(state => state.loadUniverseFromFile);
  
  // Device capability checks
  const isGitOnlyMode = shouldUseGitOnlyMode();
  const supportsLocalFiles = hasCapability('local-files');
  const requiresGitOnly = deviceConfig.gitOnlyMode;
  const isTouchDevice = deviceConfig.touchOptimizedUI;

  useEffect(() => {
    if (isOpen) {
      refreshUniverses();
      
      // Subscribe to universe manager status updates
      let unsubscribe = () => {};
      (async () => {
        const um = await getUniverseManager();
        unsubscribe = um.onStatusChange((statusUpdate) => {
          setStatus(statusUpdate);
          setTimeout(() => setStatus(null), 3000);
        });
      })();

      // Listen for device configuration changes
      const handleDeviceConfigChange = (event) => {
        setDeviceConfig(event.detail);
      };
      
      window.addEventListener('redstring:device-config-ready', handleDeviceConfigChange);

      return () => {
        unsubscribe();
        window.removeEventListener('redstring:device-config-ready', handleDeviceConfigChange);
      };
    }
  }, [isOpen]);

  const refreshUniverses = async () => {
    setUniverses((await getUniverseManager()).getAllUniverses());
    setActiveUniverse((await getUniverseManager()).getActiveUniverse());
  };

  const handleSwitchUniverse = async (slug) => {
    if (slug === activeUniverse?.slug) return;
    
    setIsLoading(true);
    try {
      const result = await (await getUniverseManager()).switchActiveUniverse(slug, { saveCurrent: true });
      if (result.storeState) {
        loadUniverseFromFile(result.storeState);
      }
      refreshUniverses();
    } catch (error) {
      setStatus({ type: 'error', status: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateUniverse = async () => {
    if (!newUniverseName.trim()) return;
    
    setIsLoading(true);
    try {
      (await getUniverseManager()).createUniverse(newUniverseName.trim());
      setNewUniverseName('');
      refreshUniverses();
    } catch (error) {
      setStatus({ type: 'error', status: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteUniverse = async (slug) => {
    try {
      (await getUniverseManager()).deleteUniverse(slug);
      refreshUniverses();
      setShowDeleteConfirm(null);
    } catch (error) {
      setStatus({ type: 'error', status: error.message });
    }
  };

  const handleSaveUniverse = async () => {
    setIsLoading(true);
    try {
      await (await getUniverseManager()).saveActiveUniverse();
    } catch (error) {
      setStatus({ type: 'error', status: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLocalFileOperation = async (universeSlug, operationType) => {
    // Skip local file operations in Git-Only mode
    if (requiresGitOnly) {
      setStatus({ 
        type: 'info', 
        status: 'Local file operations disabled in Git-Only mode. Use Git repository instead.' 
      });
      return;
    }

    const universe = (await getUniverseManager()).getUniverse(universeSlug);
    if (!universe) return;

    setIsLoading(true);
    try {
      if (operationType === 'pick') {
        // Let user pick a new file for this universe
        await (await getUniverseManager()).setupFileHandle(universeSlug);
        refreshUniverses();
      } else if (operationType === 'save') {
        // Save current data to a new file for this universe
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: universe.localFile.path,
          types: [{ description: 'RedString Files', accept: { 'application/json': ['.redstring'] } }]
        });
        
        (await getUniverseManager()).setFileHandle(universeSlug, fileHandle);
        
        // Save current data to the new file
        if (universeSlug === activeUniverse?.slug) {
          await (await getUniverseManager()).saveActiveUniverse();
        }
        refreshUniverses();
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        setStatus({ type: 'error', status: error.message });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Git-Only universe creation handler
  const handleCreateGitUniverse = async () => {
    if (!gitUrl.trim()) {
      setStatus({ type: 'error', status: 'Please enter a Git repository URL' });
      return;
    }

    setIsLoading(true);
    try {
      await (await getUniverseManager()).createUniverseFromGitUrl(gitUrl.trim(), {
        name: newUniverseName.trim() || undefined
      });
      setGitUrl('');
      setNewUniverseName('');
      refreshUniverses();
      setStatus({ type: 'success', status: 'Git universe created successfully' });
    } catch (error) {
      setStatus({ type: 'error', status: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  // Generate QR code for universe sharing (mobile-friendly)
  const handleGenerateQR = (universe) => {
    if (universe.gitRepo?.linkedRepo) {
      const gitUrl = `https://github.com/${universe.gitRepo.linkedRepo}`;
      const shareUrl = `${window.location.origin}?import=${encodeURIComponent(gitUrl)}`;
      
      // Simple QR code generation (would need proper QR library in production)
      setStatus({ 
        type: 'info', 
        status: `Share URL: ${shareUrl}` 
      });
    } else {
      setStatus({ 
        type: 'error', 
        status: 'Universe must be connected to Git repository to generate sharing link' 
      });
    }
  };

  const handleUpdateSourceOfTruth = async (universeSlug, newSourceOfTruth) => {
    (await getUniverseManager()).updateUniverse(universeSlug, { sourceOfTruth: newSourceOfTruth });
    refreshUniverses();
  };

  const handleToggleStorageSlot = async (universeSlug, slotType, enabled) => {
    const universe = (await getUniverseManager()).getUniverse(universeSlug);
    if (!universe) return;

    // Prevent enabling local storage in Git-Only mode
    if (slotType === 'local' && enabled && requiresGitOnly) {
      setStatus({ 
        type: 'info', 
        status: 'Local file storage is not available in Git-Only mode. Use Git repository instead.' 
      });
      return;
    }

    // Prevent disabling browser storage if it's the only fallback
    if (slotType === 'browser' && !enabled) {
      const hasOtherStorage = universe.localFile.enabled || universe.gitRepo.enabled;
      if (!hasOtherStorage) {
        setStatus({ 
          type: 'warning', 
          status: 'Cannot disable browser storage - no other storage methods available.' 
        });
        return;
      }
    }

    const updates = {};
    if (slotType === 'local') {
      updates.localFile = { 
        ...universe.localFile, 
        enabled,
        unavailableReason: requiresGitOnly ? 'Git-Only mode active' : null
      };
    } else if (slotType === 'git') {
      updates.gitRepo = { ...universe.gitRepo, enabled };
    } else if (slotType === 'browser') {
      updates.browserStorage = { ...universe.browserStorage, enabled };
    }

    (await getUniverseManager()).updateUniverse(universeSlug, updates);
    refreshUniverses();
  };

  if (!isOpen) return null;

  const handleOverlayClick = (e) => {
    // Only close if clicking directly on the overlay, not on the dialog content
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const renderOverview = () => (
    <div className="universe-operations-content">

      {/* Active Universe Section */}
      {activeUniverse && (
        <div className="active-universe-section">
          <h4>Active Universe</h4>
          <div className="universe-card active">
            <div className="universe-info">
              <div className="universe-name">{activeUniverse.name}</div>
              <div className="universe-slug">/{activeUniverse.slug}</div>
              <div className="source-of-truth">
                Source of Truth: 
                <span className={`source-badge ${activeUniverse.sourceOfTruth}`}>
                  {activeUniverse.sourceOfTruth === SOURCE_OF_TRUTH.GIT && <Globe size={12} />}
                  {activeUniverse.sourceOfTruth === SOURCE_OF_TRUTH.LOCAL && <HardDrive size={12} />}
                  {activeUniverse.sourceOfTruth === SOURCE_OF_TRUTH.BROWSER && <Smartphone size={12} />}
                  {activeUniverse.sourceOfTruth.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="universe-actions">
              <button 
                onClick={handleSaveUniverse}
                disabled={isLoading}
                className="action-button primary"
              >
                <Save size={16} />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* All Universes Section */}
      <div className="all-universes-section">
        <div className="section-header">
          <h4>All Universes ({universes.length})</h4>
          <button 
            onClick={() => setOperation('create')}
            className="action-button primary"
          >
            <Plus size={16} />
            Create New
          </button>
        </div>

        <div className="universes-grid">
          {universes.map(universe => (
            <div 
              key={universe.slug} 
              className={`universe-card ${universe.slug === activeUniverse?.slug ? 'active' : ''}`}
            >
              <div className="universe-info">
                <div className="universe-name">{universe.name}</div>
                <div className="universe-slug">/{universe.slug}</div>
                <div className="storage-indicators">
                  {universe.localFile.enabled && (
                    <span className="storage-indicator local" title="Local file enabled">
                      <HardDrive size={12} />
                    </span>
                  )}
                  {universe.gitRepo.enabled && (
                    <span className="storage-indicator git" title="Git repository enabled">
                      <Globe size={12} />
                    </span>
                  )}
                  {universe.browserStorage.enabled && (
                    <span className="storage-indicator browser" title="Browser storage enabled">
                      <Smartphone size={12} />
                    </span>
                  )}
                </div>
              </div>
              <div className="universe-actions">
                {universe.slug !== activeUniverse?.slug && (
                  <button 
                    onClick={() => handleSwitchUniverse(universe.slug)}
                    disabled={isLoading}
                    className="action-button secondary"
                  >
                    Switch To
                  </button>
                )}
                <button 
                  onClick={() => setOperation(`edit-${universe.slug}`)}
                  className="action-button secondary"
                >
                  <Edit3 size={14} />
                </button>
                {universes.length > 1 && (
                  <button 
                    onClick={() => setShowDeleteConfirm(universe.slug)}
                    className="action-button danger"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderCreateUniverse = () => (
    <div className="universe-operations-content">

      <div className="create-universe-form">
        <div className="form-group">
          <label>Universe Name</label>
          <input
            type="text"
            value={newUniverseName}
            onChange={(e) => setNewUniverseName(e.target.value)}
            placeholder="My New Universe"
            className="universe-name-input"
          />
        </div>

        <div className="form-actions">
          <button 
            onClick={() => setOperation('overview')}
            className="action-button secondary"
          >
            Cancel
          </button>
          <button 
            onClick={handleCreateUniverse}
            disabled={!newUniverseName.trim() || isLoading}
            className="action-button primary"
          >
            <Plus size={16} />
            Create Universe
          </button>
        </div>
      </div>
    </div>
  );

  const renderEditUniverse = () => {
    const universeSlug = operation.replace('edit-', '');
    // Use universe from local state that is refreshed elsewhere
    const universe = universes.find(u => u.slug === universeSlug);
    if (!universe) return renderOverview();

    return (
      <div className="universe-operations-content">

        <div className="edit-universe-form">
          {/* Source of Truth Selection */}
          <div className="form-group">
            <label>Source of Truth (What appears on screen)</label>
            <div className="source-options">
              {Object.values(SOURCE_OF_TRUTH).map(source => (
                <button
                  key={source}
                  onClick={() => handleUpdateSourceOfTruth(universeSlug, source)}
                  className={`source-option ${universe.sourceOfTruth === source ? 'active' : ''}`}
                >
                  {source === SOURCE_OF_TRUTH.GIT && <Globe size={16} />}
                  {source === SOURCE_OF_TRUTH.LOCAL && <HardDrive size={16} />}
                  {source === SOURCE_OF_TRUTH.BROWSER && <Smartphone size={16} />}
                  <span>{source.toUpperCase()}</span>
                  {universe.sourceOfTruth === source && <Check size={14} />}
                </button>
              ))}
            </div>
          </div>

          {/* Storage Slots */}
          <div className="form-group">
            <label>Storage Slots</label>
            
            {/* Local File Slot */}
            <div className="storage-slot">
              <div className="slot-header">
                <div className="slot-info">
                  <HardDrive size={16} />
                  <span>Local File</span>
                  <div className="slot-path">{universe.localFile.path}</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={universe.localFile.enabled}
                    onChange={(e) => handleToggleStorageSlot(universeSlug, 'local', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              {universe.localFile.enabled && (
                <div className="slot-actions">
                  <button
                    onClick={() => handleLocalFileOperation(universeSlug, 'pick')}
                    className="action-button secondary small"
                  >
                    <FolderOpen size={14} />
                    Pick File
                  </button>
                  <button
                    onClick={() => handleLocalFileOperation(universeSlug, 'save')}
                    className="action-button secondary small"
                  >
                    <Save size={14} />
                    Save As
                  </button>
                </div>
              )}
            </div>

            {/* Git Repository Slot */}
            <div className="storage-slot">
              <div className="slot-header">
                <div className="slot-info">
                  <Globe size={16} />
                  <span>Git Repository</span>
                  <div className="slot-path">
                    {universe.gitRepo.linkedRepo 
                      ? `${universe.gitRepo.linkedRepo.user}/${universe.gitRepo.linkedRepo.repo}/${universe.gitRepo.universeFolder}`
                      : 'Not linked'
                    }
                  </div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={universe.gitRepo.enabled}
                    onChange={(e) => handleToggleStorageSlot(universeSlug, 'git', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
              {universe.gitRepo.enabled && (
                <div className="slot-actions">
                  <div className="git-config-note">
                    Configure Git repository in the Git Federation panel
                  </div>
                </div>
              )}
            </div>

            {/* Browser Storage Slot (Mobile Fallback) */}
            <div className="storage-slot">
              <div className="slot-header">
                <div className="slot-info">
                  <Smartphone size={16} />
                  <span>Browser Storage</span>
                  <div className="slot-path">IndexedDB fallback</div>
                </div>
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={universe.browserStorage.enabled}
                    onChange={(e) => handleToggleStorageSlot(universeSlug, 'browser', e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button 
              onClick={() => setOperation('overview')}
              className="action-button secondary"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    );
  };

  const dialogContent = (
    <div className="universe-operations-overlay" onClick={handleOverlayClick}>
      <div className="universe-operations-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="universe-operations-header-bar">
          <div className="dialog-title">
            {operation === 'overview' && 'Universe Manager'}
            {operation === 'create' && 'Create New Universe'}
            {operation.startsWith('edit-') && (() => {
              const id = operation.replace('edit-', '');
              const name = (__um && __um.getUniverse(id)?.name) || 'Unknown';
              return `Edit Universe: ${name}`;
            })()}
          </div>
          <button 
            onClick={onClose}
            className="close-button"
          >
            <X size={18} />
          </button>
        </div>

        {/* Status Messages */}
        {status && (
          <div className={`status-message ${status.type}`}>
            {status.type === 'error' && <AlertCircle size={16} />}
            {status.type === 'success' && <Check size={16} />}
            <span>{status.status}</span>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="loading-overlay">
            <div className="loading-spinner"></div>
          </div>
        )}

        {/* Content based on operation */}
        {operation === 'overview' && renderOverview()}
        {operation === 'create' && renderCreateUniverse()}
        {operation.startsWith('edit-') && renderEditUniverse()}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="delete-confirm-overlay">
            <div className="delete-confirm-dialog">
              <h4>Delete Universe?</h4>
              <p>
                This will remove the universe "{(__um && __um.getUniverse(showDeleteConfirm)?.name) || ''}" 
                from your universe list. This does not delete any actual files or Git repositories.
              </p>
              <div className="delete-confirm-actions">
                <button 
                  onClick={() => setShowDeleteConfirm(null)}
                  className="action-button secondary"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => handleDeleteUniverse(showDeleteConfirm)}
                  className="action-button danger"
                >
                  <Trash2 size={16} />
                  Delete Universe
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render in a portal to prevent parent component interference
  return createPortal(dialogContent, document.body);
};

export default UniverseOperationsDialog;
