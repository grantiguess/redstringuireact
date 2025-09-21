/**
 * Git-Native Federation UI Component
 *
 * PURE UI COMPONENT - No backend logic!
 * All universe operations go through universeBackend service.
 * This component only displays data and handles user interactions.
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  GitBranch,
  GitCommit,
  Globe,
  Settings,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
  Copy,
  Server,
  RefreshCw,
  Plus,
  Users,
  Network,
  Zap,
  Shield,
  ArrowRight,
  Download,
  Upload,
  GitMerge,
  Info,
  Github,
  Key,
  Edit3,
  Save,
  Trash2
} from 'lucide-react';

// Universe Backend Bridge - communicate with backend without direct imports
class UniverseBackendBridge {
  constructor() {
    this.listeners = new Set();
  }

  // Send commands to backend via window events
  async sendCommand(command, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = Date.now() + Math.random();
      const timeoutId = setTimeout(() => {
        window.removeEventListener(`universe-backend-response-${id}`, handleResponse);
        reject(new Error('Backend command timeout'));
      }, 10000);

      const handleResponse = (event) => {
        clearTimeout(timeoutId);
        window.removeEventListener(`universe-backend-response-${id}`, handleResponse);
        if (event.detail.error) {
          reject(new Error(event.detail.error));
        } else {
          resolve(event.detail.result);
        }
      };

      window.addEventListener(`universe-backend-response-${id}`, handleResponse);
      window.dispatchEvent(new CustomEvent('universe-backend-command', {
        detail: { command, payload, id }
      }));
    });
  }

  // Listen for backend status updates
  onStatusChange(callback) {
    const handler = (event) => callback(event.detail);
    window.addEventListener('universe-backend-status', handler);
    return () => window.removeEventListener('universe-backend-status', handler);
  }

  // Universe operations
  async getAllUniverses() {
    return this.sendCommand('getAllUniverses');
  }

  async getActiveUniverse() {
    return this.sendCommand('getActiveUniverse');
  }

  async getAuthStatus() {
    return this.sendCommand('getAuthStatus');
  }

  async switchActiveUniverse(slug, options) {
    return this.sendCommand('switchActiveUniverse', { slug, options });
  }

  async createUniverse(name, options) {
    return this.sendCommand('createUniverse', { name, options });
  }

  async deleteUniverse(slug) {
    return this.sendCommand('deleteUniverse', { slug });
  }

  async updateUniverse(slug, updates) {
    return this.sendCommand('updateUniverse', { slug, updates });
  }

  async discoverUniversesInRepository(repoConfig) {
    return this.sendCommand('discoverUniversesInRepository', { repoConfig });
  }

  async linkToDiscoveredUniverse(discoveredUniverse, repoConfig) {
    return this.sendCommand('linkToDiscoveredUniverse', { discoveredUniverse, repoConfig });
  }
}

const universeBackendBridge = new UniverseBackendBridge();

// UI-only imports
import { persistentAuth } from './services/persistentAuth.js';
import RepositoryManager from './components/repositories/RepositoryManager.jsx';
import RepositoryDropdown from './components/repositories/RepositoryDropdown.jsx';
import { oauthFetch } from './services/bridgeConfig.js';

// Simple device detection for UI
const getDeviceInfo = () => {
  const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const screenWidth = window.screen?.width || 1920;
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
  const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/i.test(navigator.userAgent.toLowerCase()) ||
                   (/macintosh/i.test(navigator.userAgent.toLowerCase()) && isTouch);

  return {
    isMobile,
    isTablet,
    isTouchDevice: isTouch,
    screenWidth,
    supportsFileSystemAPI: 'showSaveFilePicker' in window,
    gitOnlyMode: isMobile || isTablet || !('showSaveFilePicker' in window)
  };
};

const GitNativeFederation = () => {
  // UI STATE ONLY
  const [universes, setUniverses] = useState([]);
  const [activeUniverseSlug, setActiveUniverseSlug] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [authStatus, setAuthStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Repository discovery state
  const [repoUniverseLists, setRepoUniverseLists] = useState({});
  const [showRepositoryManager, setShowRepositoryManager] = useState(false);
  const [dataAuthMethod, setDataAuthMethod] = useState(null);

  // GitHub App state
  const [githubAppInstallation, setGithubAppInstallation] = useState(null);
  const [userRepositories, setUserRepositories] = useState([]);
  const [allowOAuthBackup, setAllowOAuthBackup] = useState(() => {
    try { return localStorage.getItem('allow_oauth_backup') !== 'false'; } catch (_) { return true; }
  });

  // UI layout state
  const containerRef = useRef(null);
  const [isSlim, setIsSlim] = useState(false);

  // Device info
  const deviceInfo = useMemo(() => getDeviceInfo(), []);

  // Get device capability message
  const deviceCapabilityMessage = useMemo(() => {
    if (deviceInfo.gitOnlyMode) {
      if (deviceInfo.isMobile) {
        return { type: 'info', title: 'Mobile-Optimized Experience', message: 'RedString is running in Git-Only mode for the best mobile experience. Your universes will sync directly with Git repositories.' };
      } else if (deviceInfo.isTablet) {
        return { type: 'info', title: 'Tablet-Optimized Experience', message: 'RedString is optimized for tablet use with Git-based universe management and touch-friendly interface.', icon: '📲' };
      } else {
        return { type: 'info', title: 'Git-Only Mode Active', message: 'File system access is limited on this device. RedString will work directly with Git repositories.', icon: '🔄' };
      }
    }
    return null;
  }, [deviceInfo]);

  // Check authentication status
  const hasOAuthForBrowsing = authStatus?.isAuthenticated || false;
  const hasAppForAutoSave = githubAppInstallation?.accessToken ? true : false;

  const activeUniverse = useMemo(() => {
    return universes.find(u => u.slug === activeUniverseSlug);
  }, [universes, activeUniverseSlug]);

  // Load data from backend
  const loadUniverseData = useCallback(async () => {
    try {
      const universes = await universeBackendBridge.getAllUniverses();
      const activeUniverse = await universeBackendBridge.getActiveUniverse();
      const authStatus = await universeBackendBridge.getAuthStatus();

      setUniverses(universes || []);
      setActiveUniverseSlug(activeUniverse?.slug || null);
      setAuthStatus(authStatus);
    } catch (error) {
      console.error('[GitNativeFederation] Failed to load universe data:', error);
      setError('Failed to load universe data');
    }
  }, []);

  // Initialize component
  useEffect(() => {
    console.log('[GitNativeFederation] UI component initializing...');

    let unsubscribeRef = null;

    const initializeComponent = async () => {
      try {
        // Load initial data
        await loadUniverseData();

        // Subscribe to backend status changes
        unsubscribeRef = universeBackendBridge.onStatusChange((status) => {
          setSyncStatus(status);
          // Refresh universe data when status changes
          loadUniverseData();
        });
      } catch (error) {
        console.error('[GitNativeFederation] Failed to initialize component:', error);
        setError('Failed to initialize Git federation');
      }
    };

    initializeComponent();

    // Load GitHub App installation
    const storedInstallation = persistentAuth.getAppInstallation();
    if (storedInstallation) {
      setGithubAppInstallation(storedInstallation);
      setUserRepositories(storedInstallation.repositories || []);
    }

    return () => {
      if (unsubscribeRef) {
        unsubscribeRef();
      }
    };
  }, [loadUniverseData]);

  // Auto-load repository universes when active universe changes
  useEffect(() => {
    if (!activeUniverse?.sources) return;

    // Auto-discover universes for any GitHub sources
    activeUniverse.sources.forEach(src => {
      if (src.type === 'github' && src.user && src.repo) {
        const key = `${src.user}/${src.repo}`;
        // Only auto-load if we haven't already loaded this repo
        if (!repoUniverseLists[key]) {
          console.log(`[GitNativeFederation] Auto-discovering universes in ${key}`);
          handleDiscoverUniverses({
            user: src.user,
            repo: src.repo,
            type: 'github',
            authMethod: dataAuthMethod || 'oauth'
          });
        }
      }
    });
  }, [activeUniverse, dataAuthMethod, repoUniverseLists]);

  // Observe panel width to switch layouts (slim vs wide)
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = entry.contentRect?.width || el.clientWidth || 0;
        setIsSlim(w < 520);
      }
    });
    ro.observe(el);
    try { setIsSlim((el.clientWidth || 0) < 520); } catch {}
    return () => ro.disconnect();
  }, []);

  // Persist OAuth backup preference
  useEffect(() => {
    try { localStorage.setItem('allow_oauth_backup', allowOAuthBackup ? 'true' : 'false'); } catch {}
  }, [allowOAuthBackup]);

  // Universe operations (all go through backend)
  const handleSwitchUniverse = async (slug) => {
    if (slug === activeUniverseSlug) return;

    const confirmed = window.confirm('Save current universe before switching?');

    try {
      setIsLoading(true);
      setError(null);

      await universeBackendBridge.switchActiveUniverse(slug, { saveCurrent: confirmed });
      await loadUniverseData();

    } catch (error) {
      console.error('[GitNativeFederation] Failed to switch universe:', error);
      setError(`Failed to switch universe: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const addUniverse = () => {
    const name = prompt('Enter universe name:');
    if (!name?.trim()) return;

    handleCreateUniverse(name.trim());
  };

  const handleCreateUniverse = async (name) => {
    try {
      setIsLoading(true);
      setError(null);

      await universeBackendBridge.createUniverse(name, {
        enableGit: deviceInfo.gitOnlyMode
      });
      await loadUniverseData();

    } catch (error) {
      console.error('[GitNativeFederation] Failed to create universe:', error);
      setError(`Failed to create universe: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const removeUniverse = async (slug) => {
    if (universes.length <= 1) {
      setError('Cannot delete the last universe');
      return;
    }

    const universe = universes.find(u => u.slug === slug);
    if (!universe) return;

    if (!window.confirm(`Delete universe "${universe.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      await universeBackendBridge.deleteUniverse(slug);
      await loadUniverseData();

    } catch (error) {
      console.error('[GitNativeFederation] Failed to delete universe:', error);
      setError(`Failed to delete universe: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const renameActiveUniverse = async (newName) => {
    if (!activeUniverseSlug) return;

    try {
      await universeBackendBridge.updateUniverse(activeUniverseSlug, { name: newName });
      await loadUniverseData();
    } catch (error) {
      console.error('[GitNativeFederation] Failed to rename universe:', error);
      setError(`Failed to rename universe: ${error.message}`);
    }
  };

  const handleSetSourceOfTruth = async (sourceOfTruth) => {
    if (!activeUniverseSlug) return;

    try {
      await universeBackendBridge.updateUniverse(activeUniverseSlug, { sourceOfTruth });
      await loadUniverseData();
    } catch (error) {
      console.error('[GitNativeFederation] Failed to set source of truth:', error);
      setError(`Failed to set source of truth: ${error.message}`);
    }
  };

  // Auth operations
  const handleGitHubAuth = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Open OAuth window
      const state = Date.now().toString();
      sessionStorage.setItem('github_oauth_pending', 'true');

      const oauthUrl = `/api/github/oauth/authorize?state=${state}`;
      window.location.href = oauthUrl;

    } catch (error) {
      console.error('[GitNativeFederation] OAuth failed:', error);
      setError(`OAuth authentication failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  const handleGitHubApp = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      // Get GitHub App name
      let appName = 'redstring-semantic-sync';
      try {
        const appInfoResponse = await oauthFetch('/api/github/app/info');
        if (appInfoResponse.ok) {
          const appInfo = await appInfoResponse.json();
          appName = appInfo.name || appName;
        }
      } catch (_) {}

      const state = Date.now().toString();
      sessionStorage.setItem('github_app_pending', 'true');

      const installationUrl = `https://github.com/apps/${appName}/installations/new?state=${state}`;
      window.location.href = installationUrl;

    } catch (error) {
      console.error('[GitNativeFederation] GitHub App failed:', error);
      setError(`GitHub App authentication failed: ${error.message}`);
      setIsConnecting(false);
    }
  };

  // Repository discovery
  const handleDiscoverUniverses = async (repoConfig) => {
    const key = `${repoConfig.user}/${repoConfig.repo}`;

    try {
      setRepoUniverseLists(prev => ({
        ...prev,
        [key]: { ...prev[key], loading: true, open: true }
      }));

      console.log(`[GitNativeFederation] Discovering universes in ${key}...`);
      const discovered = await universeBackendBridge.discoverUniversesInRepository(repoConfig);
      console.log(`[GitNativeFederation] Found ${discovered.length} universes in ${key}`);

      setRepoUniverseLists(prev => ({
        ...prev,
        [key]: { ...prev[key], loading: false, items: discovered, open: true }
      }));

    } catch (error) {
      console.warn(`[GitNativeFederation] Discovery failed for ${key}:`, error.message);
      setRepoUniverseLists(prev => ({
        ...prev,
        [key]: { ...prev[key], loading: false, items: [], error: error.message }
      }));
    }
  };

  const refreshRepoUniversesList = (user, repo) => {
    handleDiscoverUniverses({ user, repo, type: 'github', authMethod: dataAuthMethod || 'oauth' });
  };

  const handleLinkUniverse = async (discoveredUniverse, repoConfig) => {
    try {
      setIsLoading(true);
      setError(null);

      await universeBackendBridge.linkToDiscoveredUniverse(discoveredUniverse, repoConfig);
      await loadUniverseData();

    } catch (error) {
      console.error('[GitNativeFederation] Failed to link universe:', error);
      setError(`Failed to link universe: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Get active universe
  // Format universe cards for display
  const universeCards = useMemo(() => {
    return universes.map(universe => ({
      universe,
      displayName: universe.name || universe.slug
    }));
  }, [universes]);

  // Clear error after timeout
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Clear sync status after timeout
  useEffect(() => {
    if (syncStatus && syncStatus.type !== 'error') {
      const timer = setTimeout(() => setSyncStatus(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [syncStatus]);

  return (
    <div ref={containerRef} style={{
      fontFamily: "'EmOne', sans-serif",
      height: '100%',
      color: '#260000',
      pointerEvents: 'auto',
      opacity: 1
    }}>
      {/* Device Capability Banner */}
      {deviceCapabilityMessage && (
        <div style={{
          backgroundColor: '#e3f2fd',
          border: '1px solid #2196f3',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div>
            <div style={{ fontWeight: 'bold', fontSize: '0.9rem', marginBottom: '2px' }}>
              {deviceCapabilityMessage.title}
            </div>
            <div style={{ fontSize: '0.8rem', color: '#666', lineHeight: '1.3' }}>
              {deviceCapabilityMessage.message}
            </div>
          </div>
        </div>
      )}

      {/* Accounts & Access */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>Accounts & Access</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Link services to unlock repositories</div>
        </div>

        {/* Status Summary Bar */}
        <div style={{
          padding: '8px 12px',
          backgroundColor: '#bdb5b5',
          borderRadius: '6px',
          marginBottom: '12px',
          display: 'grid',
          gridTemplateColumns: '1fr',
          alignItems: 'stretch',
          gap: '6px',
          border: `1px solid ${(hasOAuthForBrowsing || hasAppForAutoSave) ? '#7A0000' : '#ff9800'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ display: 'inline-flex', width: '10px', height: '10px', minWidth: '10px', minHeight: '10px', borderRadius: '50%', backgroundColor: (hasOAuthForBrowsing || hasAppForAutoSave) ? '#7A0000' : '#ff9800', flex: '0 0 auto' }} />
            <span style={{ fontSize: '0.9rem', fontWeight: 700 }}>
              {(hasOAuthForBrowsing && hasAppForAutoSave) ? 'Fully Connected' :
               (hasOAuthForBrowsing || hasAppForAutoSave) ? 'Partially Connected' :
               'Not Connected'}
            </span>
          </div>
          <div style={{ fontSize: '0.78rem', color: '#260000', fontWeight: 600 }}>
            {hasOAuthForBrowsing ? 'Can browse repos' : ''}
            {hasOAuthForBrowsing && hasAppForAutoSave ? ' • ' : ''}
            {hasAppForAutoSave ? 'Auto-sync enabled' : ''}
            {!hasOAuthForBrowsing && !hasAppForAutoSave ? 'Authentication required' : ''}
          </div>

          {/* Data Auth Method */}
          <div style={{ fontSize: '0.78rem', color: '#260000', fontWeight: 600 }}>
            {dataAuthMethod === 'github-app' && 'Data via GitHub App'}
            {dataAuthMethod === 'oauth' && 'Data via OAuth'}
            {!dataAuthMethod && (hasOAuthForBrowsing || hasAppForAutoSave) && 'Data auth unresolved'}
          </div>

          {/* Status */}
          <div style={{ backgroundColor: 'rgba(122,0,0,0.08)', border: '1px solid #7A0000', borderRadius: '4px', padding: '6px 8px', color: '#260000', fontSize: '0.78rem', fontWeight: 600 }}>
            {syncStatus?.status || 'Idle'}
          </div>
        </div>

        {/* OAuth Backup Toggle */}
        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#bdb5b5', border: '1px solid #979090', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '0.85rem', color: '#260000', fontWeight: 600 }}>Use OAuth as backup for sync</label>
          </div>
          <input
            type="checkbox"
            checked={allowOAuthBackup}
            onChange={(e) => setAllowOAuthBackup(e.target.checked)}
            style={{ accentColor: '#7A0000', transform: 'scale(1.1)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isSlim ? '1fr' : '1fr 1fr', gap: '6px' }}>
          <div style={{ background: '#bdb5b5', border: '1px solid #260000', borderRadius: '6px', padding: isSlim ? '6px' : '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>GitHub OAuth</div>
              <div style={{ fontSize: '0.7rem', color: hasOAuthForBrowsing ? '#7A0000' : '#666', fontWeight: 600 }}>
                {hasOAuthForBrowsing ? '✓ Connected' : 'Not connected'}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', lineHeight: '1.2' }}>
              Browse and create repositories
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch', flexWrap: 'wrap', flexDirection: isSlim ? 'column' : 'row' }}>
              {hasOAuthForBrowsing ? (
                <>
                  <button disabled style={{ padding: '6px 10px', backgroundColor: '#7A0000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.75rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>@{authStatus.userData?.login}</button>
                  <button onClick={handleGitHubAuth} style={{ padding: '5px 8px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', width: isSlim ? '100%' : 'auto' }} title="Reconnect OAuth">Refresh</button>
                </>
              ) : (
                <button onClick={handleGitHubAuth} disabled={isConnecting} style={{ padding: '6px 10px', backgroundColor: isConnecting ? '#ccc' : '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', cursor: isConnecting ? 'not-allowed' : 'pointer', fontSize: '0.75rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Connect OAuth</button>
              )}
            </div>
          </div>

          <div style={{ background: '#bdb5b5', border: '1px solid #260000', borderRadius: '6px', padding: isSlim ? '6px' : '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>GitHub Settings</div>
              <div style={{ fontSize: '0.7rem', color: hasAppForAutoSave ? '#7A0000' : '#666', fontWeight: 600 }}>
                {hasAppForAutoSave ? '✓ App Installed' : 'App Not installed'}
              </div>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '6px', lineHeight: '1.2' }}>
              App enables secure auto-sync with permissions
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'stretch', flexDirection: isSlim ? 'column' : 'row' }}>
              {hasAppForAutoSave ? (
                <>
                  <button disabled style={{ padding: '6px 10px', backgroundColor: '#7A0000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.75rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Installed</button>
                  <button onClick={handleGitHubApp} style={{ padding: '5px 8px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', width: isSlim ? '100%' : 'auto' }} title="Reconfigure App">GitHub Settings</button>
                </>
              ) : (
                <button onClick={handleGitHubApp} disabled={isConnecting} style={{ padding: '6px 10px', backgroundColor: isConnecting ? '#ccc' : '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', cursor: isConnecting ? 'not-allowed' : 'pointer', fontSize: '0.75rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Install App</button>
              )}
            </div>

            {/* Save Mode Settings */}
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #979090' }}>
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Save Mode</div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button style={{ padding: '3px 6px', backgroundColor: '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Auto</button>
                <button style={{ padding: '3px 6px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Manual</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Universes */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>Universes</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Manage your knowledge spaces</div>
        </div>

        {/* Add Universe Card */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px',
          backgroundColor: '#bdb5b5',
          border: '2px dashed #979090',
          borderRadius: '6px',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          marginBottom: '8px'
        }}
        onClick={addUniverse}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = '#979090';
          e.currentTarget.style.borderColor = '#260000';
          e.currentTarget.style.borderStyle = 'solid';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = '#bdb5b5';
          e.currentTarget.style.borderColor = '#979090';
          e.currentTarget.style.borderStyle = 'dashed';
        }}
        >
          <Plus size={20} color="#260000" />
          <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#260000' }}>
            Add Universe
          </div>
        </div>

        {/* Universe Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {universeCards.map(({ universe, displayName }) => (
            <div key={universe.slug} style={{
              background: '#bdb5b5',
              border: universe.slug === activeUniverseSlug ? '2px solid #7A0000' : '1px solid #260000',
              borderRadius: '6px',
              padding: '10px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {displayName}
                  </div>
                  {universe.slug === activeUniverseSlug && (
                    <div style={{ fontSize: '0.75rem', color: '#7A0000', fontWeight: 600, padding: '2px 6px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '10px' }}>ACTIVE</div>
                  )}
                  {/* Node count display */}
                  {universe.metadata?.nodeCount > 0 && (
                    <div style={{ fontSize: '0.7rem', color: '#666', fontWeight: 500, padding: '2px 5px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '8px' }}>
                      {universe.metadata.nodeCount} node{universe.metadata.nodeCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  {universe.slug !== activeUniverseSlug && (
                    <button
                      onClick={() => handleSwitchUniverse(universe.slug)}
                      style={{
                        padding: '4px 8px',
                        backgroundColor: 'transparent',
                        color: '#260000',
                        border: '1px solid #260000',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Switch To
                    </button>
                  )}
                  <button
                    onClick={() => removeUniverse(universe.slug)}
                    disabled={universeCards.length <= 1}
                    style={{
                      padding: '4px',
                      backgroundColor: 'transparent',
                      color: universeCards.length <= 1 ? '#999' : '#d32f2f',
                      border: `1px solid ${universeCards.length <= 1 ? '#999' : '#d32f2f'}`,
                      borderRadius: '4px',
                      cursor: universeCards.length <= 1 ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: universeCards.length <= 1 ? 0.5 : 1
                    }}
                    title="Delete universe"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {/* Universe Details (only show for active universe) */}
              {universe.slug === activeUniverseSlug && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: isSlim ? '8px' : '10px', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #979090' }}>
                  {/* Name and Stats */}
                  <div style={{ display: 'flex', flexDirection: isSlim ? 'column' : 'row', gap: isSlim ? '8px' : '12px' }}>
                    <div style={{ flex: isSlim ? '1' : '2' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Name</div>
                      <input value={universe.name || ''} onChange={(e) => renameActiveUniverse(e.target.value)} className="editable-title-input" style={{ fontSize: '0.85rem', padding: '5px 7px', borderRadius: '4px', width: '100%' }} />
                    </div>
                    {/* Universe Stats */}
                    <div style={{ flex: '1', minWidth: isSlim ? 'auto' : '120px' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Statistics</div>
                      <div style={{ display: 'flex', gap: '8px', fontSize: '0.75rem', color: '#666' }}>
                        <span>{universe.metadata?.nodeCount || 0} nodes</span>
                        {universe.metadata?.lastOpened && (
                          <span>•</span>
                        )}
                        {universe.metadata?.lastOpened && (
                          <span title={new Date(universe.metadata.lastOpened).toLocaleString()}>
                            opened {new Date(universe.metadata.lastOpened).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Storage Mode and Source of Truth */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: isSlim ? '6px' : '8px' }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '4px' }}>Storage Mode</div>
                      <div style={{ display: 'flex', gap: isSlim ? '4px' : '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {['local','github','mixed'].map(mode => {
                          // Determine if this mode is currently active based on enabled slots
                          const isActive = (() => {
                            const localEnabled = activeUniverse?.localFile?.enabled ?? false;
                            const gitEnabled = activeUniverse?.gitRepo?.enabled ?? false;

                            if (mode === 'local') return localEnabled && !gitEnabled;
                            if (mode === 'github') return gitEnabled && !localEnabled;
                            if (mode === 'mixed') return localEnabled && gitEnabled;
                            return false;
                          })();

                          return (
                            <button
                              key={mode}
                              style={{
                                padding: isSlim ? '4px 8px' : '6px 10px',
                                backgroundColor: isActive ? '#260000' : 'transparent',
                                color: isActive ? '#bdb5b5' : '#260000',
                                border: '1px solid #260000',
                                borderRadius: '4px',
                                fontSize: '0.7rem',
                                cursor: 'pointer',
                                fontWeight: 'bold',
                                textTransform: 'capitalize'
                              }}
                            >
                              {mode}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: isSlim ? '4px' : '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {deviceInfo.supportsFileSystemAPI ? (
                        <button
                          onClick={() => handleSetSourceOfTruth('local')}
                          style={{
                            padding: isSlim ? '4px 8px' : '6px 10px',
                            backgroundColor: activeUniverse?.sourceOfTruth === 'local' ? '#260000' : 'transparent',
                            color: activeUniverse?.sourceOfTruth === 'local' ? '#bdb5b5' : '#260000',
                            border: '1px solid #260000',
                            borderRadius: '4px',
                            fontSize: '0.7rem',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                          }}
                        >
                          Local File
                        </button>
                      ) : (
                        <div style={{
                          padding: isSlim ? '4px 8px' : '6px 10px',
                          backgroundColor: '#f0f0f0',
                          color: '#999',
                          border: '1px solid #ccc',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          fontWeight: 'bold'
                        }}>
                          Local File (Unavailable)
                        </div>
                      )}
                      <button
                        onClick={() => handleSetSourceOfTruth('git')}
                        style={{
                          padding: isSlim ? '4px 8px' : '6px 10px',
                          backgroundColor: activeUniverse?.sourceOfTruth === 'git' ? '#260000' : 'transparent',
                          color: activeUniverse?.sourceOfTruth === 'git' ? '#bdb5b5' : '#260000',
                          border: '1px solid #260000',
                          borderRadius: '4px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          fontWeight: 'bold'
                        }}
                      >
                        Git Repository
                      </button>
                    </div>
                  </div>

                  {/* Sources section for active universe */}
                  {activeUniverse?.sources && activeUniverse.sources.length > 0 && (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #979090' }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '6px' }}>Sources</div>
                      {activeUniverse.sources.map((src, index) => {
                        const isPrimaryGitSource = src.type === 'github' && activeUniverse?.gitRepo?.linkedRepo?.user === src.user && activeUniverse?.gitRepo?.linkedRepo?.repo === src.repo;

                        return (
                          <div key={src.id || index} style={{ marginBottom: '8px', padding: '8px', backgroundColor: isPrimaryGitSource ? 'rgba(122,0,0,0.1)' : 'rgba(255,255,255,0.1)', border: '1px solid #979090', borderRadius: '4px' }}>
                            {src.type === 'github' && (
                              <>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                  <Github size={14} />
                                  <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{src.user}/{src.repo}</span>
                                  {isPrimaryGitSource && (
                                    <span style={{ fontSize: '0.7rem', color: '#7A0000', fontWeight: 600, padding: '1px 4px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '6px' }}>PRIMARY</span>
                                  )}
                                </div>

                                {isPrimaryGitSource && (() => {
                                  const key = `${src.user}/${src.repo}`;
                                  return (
                                    <div style={{ marginTop: '8px', borderTop: '1px dashed #979090', paddingTop: '8px' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ fontSize: '0.8rem', color: '#666' }}>Universes in Repo</div>
                                        <button onClick={() => refreshRepoUniversesList(src.user, src.repo)} style={{ padding: '4px 8px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}>Refresh</button>
                                      </div>
                                      <div style={{ marginTop: '6px', background: 'transparent', border: '1px solid #979090', borderRadius: '4px', padding: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                                          {repoUniverseLists[key]?.loading ? (
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>Loading…</div>
                                          ) : (repoUniverseLists[key]?.items || []).length === 0 ? (
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>No universes discovered in this repository</div>
                                          ) : (
                                            (repoUniverseLists[key].items || []).map((uitem) => {
                                              const activeUniverse = universes.find(u => u.slug === activeUniverseSlug);
                                              const isActiveUniverse = activeUniverse && activeUniverse.slug === uitem.slug;
                                              const isInUniversesList = universes.some(u => u.slug === uitem.slug);

                                              return (
                                                <div key={uitem.slug + uitem.path} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', marginBottom: '4px', backgroundColor: isActiveUniverse ? 'rgba(122,0,0,0.05)' : 'transparent', borderBottom: '1px dashed #ddd' }}>
                                                  <div style={{ flex: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                                                      <div style={{ fontSize: '0.8rem', color: '#260000', fontWeight: 600 }}>{uitem.name}</div>
                                                      {isActiveUniverse && (
                                                        <div style={{ fontSize: '0.65rem', color: '#7A0000', fontWeight: 600, padding: '1px 4px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '6px' }}>ACTIVE</div>
                                                      )}
                                                      {uitem.stats?.nodes > 0 && (
                                                        <div style={{ fontSize: '0.65rem', color: '#666', fontWeight: 500, padding: '1px 4px', backgroundColor: 'rgba(0,0,0,0.1)', borderRadius: '6px' }}>
                                                          {uitem.stats.nodes} node{uitem.stats.nodes !== 1 ? 's' : ''}
                                                        </div>
                                                      )}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#666' }}>
                                                      {uitem.fileName} {uitem.stats?.graphs > 0 && `• ${uitem.stats.graphs} graph${uitem.stats.graphs !== 1 ? 's' : ''}`} {uitem.stats?.edges > 0 && `• ${uitem.stats.edges} edge${uitem.stats.edges !== 1 ? 's' : ''}`}
                                                    </div>
                                                  </div>
                                                  <div style={{ display: 'flex', gap: '6px' }}>
                                                    {!isActiveUniverse && (
                                                      <button
                                                        onClick={() => {
                                                          if (isInUniversesList) {
                                                            // Switch to the universe
                                                            handleSwitchUniverse(uitem.slug);
                                                          } else {
                                                            // Link/add the universe
                                                            handleLinkUniverse(uitem, { type: 'github', user: src.user, repo: src.repo, authMethod: dataAuthMethod || 'oauth' });
                                                          }
                                                        }}
                                                        style={{ padding: '3px 6px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.7rem', fontWeight: 'bold' }}
                                                      >
                                                        {isInUniversesList ? 'Switch' : 'Add'}
                                                      </button>
                                                    )}
                                                  </div>
                                                </div>
                                              );
                                            })
                                          )}
                                        </div>
                                    </div>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          backgroundColor: '#ffebee',
          border: '1px solid #f44336',
          borderRadius: '6px',
          padding: '12px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <XCircle size={16} color="#d32f2f" />
          <span style={{ fontSize: '0.85rem' }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: '#d32f2f',
              cursor: 'pointer'
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}>
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite' }} />
            <span>Loading...</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .editable-title-input {
          background: #fff;
          border: 1px solid #ddd;
          color: #333;
        }
      `}</style>
    </div>
  );
};

export default GitNativeFederation;
