import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  RefreshCw,
  XCircle,
  Github,
  Trash2,
  Save,
  Settings,
  Shield,
  Cloud,
  GitBranch,
  ExternalLink,
  CheckCircle,
  AlertCircle,
  Info,
  Clock,
  ChevronDown,
  ChevronRight
} from 'lucide-react';

import gitFederationService, { STORAGE_TYPES } from './services/gitFederationService.js';
import { persistentAuth } from './services/persistentAuth.js';
import { oauthFetch } from './services/bridgeConfig.js';
import universeBackend from './services/universeBackend.js';
import universeBackendBridge from './services/universeBackendBridge.js';
import RepositorySelectionModal from './components/modals/RepositorySelectionModal.jsx';
import Modal from './components/shared/Modal.jsx';
import ConnectionStats from './components/git-federation/ConnectionStats.jsx';
import AuthSection from './components/git-federation/AuthSection.jsx';
import UniversesList from './components/git-federation/UniversesList.jsx';
import SourcesSection from './components/git-federation/SourcesSection.jsx';
import RepositoriesSection from './components/git-federation/RepositoriesSection.jsx';

const STORAGE_LABELS = {
  [STORAGE_TYPES.GIT]: 'Git repository',
  [STORAGE_TYPES.LOCAL]: 'Local file',
  [STORAGE_TYPES.BROWSER]: 'Browser cache'
};

const STATUS_COLORS = {
  success: '#2e7d32',
  info: '#1565c0',
  warning: '#ef6c00',
  error: '#c62828'
};

const blankState = {
  universes: [],
  activeUniverseSlug: null,
  activeUniverse: null,
  authStatus: null,
  githubAppInstallation: null
};

function detectDeviceInfo() {
  if (typeof window === 'undefined') {
    return {
      isMobile: false,
      isTablet: false,
      supportsFileSystemAPI: false,
      gitOnlyMode: false
    };
  }

  const ua = window.navigator.userAgent.toLowerCase();
  const isTouch = 'ontouchstart' in window || window.navigator.maxTouchPoints > 0;
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/.test(ua);
  const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/.test(ua) ||
    (/macintosh/.test(ua) && isTouch);

  return {
    isMobile,
    isTablet,
    supportsFileSystemAPI: 'showSaveFilePicker' in window,
    gitOnlyMode: isMobile || isTablet || !('showSaveFilePicker' in window)
  };
}

function formatWhen(value) {
  if (!value) return 'Unknown';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function BrowserFallbackNote() {
  return (
    <div
      style={{
        marginTop: 12,
        padding: '10px 12px',
        borderRadius: 6,
        border: '1px dashed #7A0000',
        backgroundColor: 'rgba(122,0,0,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        color: '#260000',
        fontSize: '0.8rem'
      }}
    >
      <Cloud size={16} />
      <div>
        <div style={{ fontWeight: 600 }}>Browser cache</div>
        <div>Data stored in browser. Link a Git repository or local file for persistence.</div>
      </div>
    </div>
  );
}

function buttonStyle(variant = 'outline') {
  const base = {
    border: '1px solid #260000',
    backgroundColor: 'transparent',
    color: '#260000',
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    textDecoration: 'none'
  };

  switch (variant) {
    case 'solid':
      return {
        ...base,
        backgroundColor: '#1a0000',
        color: '#8a8080'
      };
    case 'danger':
      return {
        ...base,
        border: '1px solid #7A0000',
        color: '#7A0000',
        backgroundColor: 'rgba(122,0,0,0.08)'
      };
    case 'disabled':
      return {
        ...base,
        border: '1px solid #999',
        color: '#666',
        backgroundColor: '#ccc',
        cursor: 'not-allowed'
      };
    default:
      return base;
  }
}

const GitNativeFederation = ({ variant = 'panel', onRequestClose }) => {
  const [serviceState, setServiceState] = useState(blankState);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [syncStatus, setSyncStatus] = useState(null);
  const [error, setError] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [allowOAuthBackup, setAllowOAuthBackup] = useState(() => {
    try {
      return localStorage.getItem('allow_oauth_backup') !== 'false';
    } catch {
      return true;
    }
  });
  const [showRepositoryManager, setShowRepositoryManager] = useState(false);
  const [showConnectionStats, setShowConnectionStats] = useState(() => {
    try {
      return localStorage.getItem('redstring_show_connection_stats') !== 'false';
    } catch {
      return false; // Collapsed by default
    }
  });
  const [showUniverseFileSelector, setShowUniverseFileSelector] = useState(false);
  const [pendingRepoAttachment, setPendingRepoAttachment] = useState(null);
  const [discoveredUniverseFiles, setDiscoveredUniverseFiles] = useState([]);

  const [repositoryTargetSlug, setRepositoryTargetSlug] = useState(null);
  const [discoveryMap, setDiscoveryMap] = useState({});
  const [syncTelemetry, setSyncTelemetry] = useState({});
  const [managedRepositories, setManagedRepositories] = useState(() => {
    try {
      const stored = localStorage.getItem('redstring_managed_repos');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const containerRef = useRef(null);
  const [isSlim, setIsSlim] = useState(false);
  const [autosaveStatus, setAutosaveStatus] = useState(null);
  const saveCoordinatorRef = useRef(null);

  const deviceInfo = useMemo(() => detectDeviceInfo(), []);
  const autosaveRef = useRef({ cooldownUntil: 0, triggerAt: 0 });

  const refreshState = useCallback(async () => {
    try {
      setLoading(true);
      const next = await gitFederationService.getState();
      setServiceState(next);
      setSyncTelemetry(next.syncStatuses || {});
      setError(null); // Clear any previous errors on success
    } catch (err) {
      console.error('[GitNativeFederation] Failed to load state:', err);
      setError('Unable to load Git federation state – please retry.');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAuth = useCallback(async () => {
    try {
      const auth = await gitFederationService.refreshAuth();
      setServiceState((prev) => ({ ...prev, ...auth }));
    } catch (err) {
      console.warn('[GitNativeFederation] Auth refresh failed:', err);
    }
  }, []);

  useEffect(() => {
    // CRITICAL: Don't block UI rendering on backend initialization
    // Load state asynchronously and allow component to render immediately
    (async () => {
      try {
        await refreshState();
      } finally {
        setInitializing(false);
      }
    })();

    const handleAuthConnected = async () => {
      try {
        const next = await gitFederationService.refreshAuth();
        setServiceState((prev) => ({ ...prev, ...next }));
        const universes = await gitFederationService.refreshUniverses();
        setServiceState((prev) => ({ ...prev, ...universes }));
        setSyncTelemetry(universes.syncStatuses || {});
      } catch (err) {
        console.warn('[GitNativeFederation] Auth connected refresh failed:', err);
      }
    };

    window.addEventListener('redstring:auth-connected', handleAuthConnected);

    // Poll sync status every 1 second to keep UI updated (fast commits need fast UI updates)
    const pollInterval = setInterval(async () => {
      try {
        const universes = await gitFederationService.refreshUniverses();
        setSyncTelemetry(universes.syncStatuses || {});
      } catch (err) {
        // Silent fail - don't spam console
      }
    }, 1000);

    return () => {
      window.removeEventListener('redstring:auth-connected', handleAuthConnected);
      clearInterval(pollInterval);
    };
  }, [refreshState]);

  useEffect(() => {
    const listener = () => refreshAuth();

    persistentAuth.on('tokenStored', listener);
    persistentAuth.on('tokenValidated', listener);
    persistentAuth.on('authExpired', listener);
    persistentAuth.on('appInstallationStored', listener);
    persistentAuth.on('appInstallationCleared', listener);

    return () => {
      persistentAuth.off('tokenStored', listener);
      persistentAuth.off('tokenValidated', listener);
      persistentAuth.off('authExpired', listener);
      persistentAuth.off('appInstallationStored', listener);
      persistentAuth.off('appInstallationCleared', listener);
    };
  }, [refreshAuth]);

  // Monitor SaveCoordinator/GitAutosavePolicy to reflect batch size in UI (unsaved when batch > 0)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import('./services/SaveCoordinator.js');
        saveCoordinatorRef.current = mod.default || mod.saveCoordinator || null;
      } catch {
        // ignore – autosave status optional
      }
    })();

    const interval = setInterval(() => {
      try {
        const sc = saveCoordinatorRef.current;
        if (sc && typeof sc.getStatus === 'function') {
          const status = sc.getStatus();
          if (!cancelled) setAutosaveStatus(status?.gitAutosavePolicy || null);
        }
      } catch {
        // ignore
      }
    }, 500);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Lightweight autosave fallback: if unsaved changes persist for 20s, save once; 60s cooldown
  useEffect(() => {
    if (!serviceState.activeUniverseSlug) return undefined;
    const active = serviceState.universes.find(u => u.slug === serviceState.activeUniverseSlug);
    const hasUnsaved = !!(active?.sync?.hasUnsavedChanges);

    if (!hasUnsaved) {
      autosaveRef.current.triggerAt = 0;
      return undefined;
    }

    const now = Date.now();
    if (now < autosaveRef.current.cooldownUntil) {
      return undefined;
    }

    if (!autosaveRef.current.triggerAt) {
      autosaveRef.current.triggerAt = now + 20000; // 20s persistence window
    }

    const timer = setTimeout(async () => {
      try {
        // Double-check still unsaved before saving
        const fresh = await gitFederationService.refreshUniverses();
        const latest = fresh.universes.find(u => u.slug === fresh.activeUniverseSlug);
        if (latest?.sync?.hasUnsavedChanges) {
          setLoading(true);
          await gitFederationService.forceSave(latest.slug);
          setSyncStatus({ type: 'success', message: 'Autosaved changes to Git' });
          await refreshState();
        }
      } catch (e) {
        // Silent; error banner handled elsewhere if needed
      } finally {
        setLoading(false);
        autosaveRef.current.cooldownUntil = Date.now() + 60000; // 60s cooldown
        autosaveRef.current.triggerAt = 0;
      }
    }, Math.max(0, autosaveRef.current.triggerAt - now));

    return () => clearTimeout(timer);
  }, [serviceState.activeUniverseSlug, serviceState.universes, refreshState]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect?.width || el.clientWidth || 0;
        setIsSlim(width < 540);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!syncStatus) return undefined;
    const timeout = setTimeout(
      () => setSyncStatus(null),
      syncStatus.type === 'success' ? 4000 : 6000
    );
    return () => clearTimeout(timeout);
  }, [syncStatus]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = setTimeout(() => setError(null), 8000);
    return () => clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    try {
      localStorage.setItem('allow_oauth_backup', allowOAuthBackup ? 'true' : 'false');
    } catch {
      // ignore
    }
  }, [allowOAuthBackup]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let cancelled = false;

    const safeSessionGet = (key) => {
      try {
        return sessionStorage.getItem(key);
      } catch {
        return null;
      }
    };

    const safeSessionRemove = (key) => {
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore
      }
    };

    const readSessionJSON = (key) => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const data = JSON.parse(raw);
        sessionStorage.removeItem(key);
        return data;
      } catch (err) {
        console.warn(`[GitNativeFederation] Failed to parse session data for ${key}:`, err);
        sessionStorage.removeItem(key);
        return null;
      }
    };

    const cleanupUrl = () => {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch {
        // ignore
      }
    };

    const processOAuthCallback = async () => {
      const storedResult = readSessionJSON('github_oauth_result');
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      const code = storedResult?.code || urlParams.get('code') || hashParams.get('code');
      const stateValue = storedResult?.state || urlParams.get('state') || hashParams.get('state');
      const expectedState = safeSessionGet('github_oauth_state');
      const pending = safeSessionGet('github_oauth_pending') === 'true';

      if (!code || !stateValue || !pending) {
        return false;
      }

      if (expectedState && stateValue !== expectedState) {
        setError('GitHub authentication state mismatch. Please retry.');
        safeSessionRemove('github_oauth_pending');
        safeSessionRemove('github_oauth_state');
        cleanupUrl();
        return false;
      }

      const redirectUri = gitFederationService.getOAuthRedirectUri();

      try {
        setIsConnecting(true);
        const resp = await oauthFetch('/api/github/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, state: stateValue, redirect_uri: redirectUri })
        });

        if (!resp.ok) {
          const message = await resp.text().catch(() => 'unknown error');
          throw new Error(`Token exchange failed (${resp.status} ${message})`);
        }

        const tokenData = await resp.json();
        const userResp = await fetch('https://api.github.com/user', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/vnd.github.v3+json'
          }
        });

        if (!userResp.ok) {
          const message = await userResp.text().catch(() => 'unknown error');
          throw new Error(`Failed to fetch GitHub user (${userResp.status} ${message})`);
        }

        const userData = await userResp.json();
        await persistentAuth.storeTokens(tokenData, userData);

            if (!cancelled) {
          await refreshAuth();
          await refreshState();
          setSyncStatus({ type: 'success', message: 'GitHub OAuth connected' });
        }
        return true;
      } catch (err) {
        if (!cancelled) {
          console.error('[GitNativeFederation] OAuth callback failed:', err);
          setError(`GitHub OAuth failed: ${err.message}`);
        }
        return false;
      } finally {
        safeSessionRemove('github_oauth_pending');
        safeSessionRemove('github_oauth_state');
        setIsConnecting(false);
        cleanupUrl();
      }
    };

    const processAppCallback = async () => {
      const storedResult = readSessionJSON('github_app_result');
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      const installationId =
        storedResult?.installation_id || urlParams.get('installation_id') || hashParams.get('installation_id');

      if (!installationId) return false;

      const pending = safeSessionGet('github_app_pending') === 'true';

      try {
        setIsConnecting(true);
        const resp = await oauthFetch('/api/github/app/installation-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installation_id: installationId })
        });

        if (!resp.ok) {
          const message = await resp.text().catch(() => 'unknown error');
          throw new Error(`Failed to obtain installation token (${resp.status} ${message})`);
        }

        const tokenData = await resp.json();
        const token = tokenData?.token;
        if (!token) {
          throw new Error('GitHub App token response missing token');
        }

        persistentAuth.storeAppInstallation({
          installationId,
          accessToken: token,
          repositories: tokenData.repositories || [],
          userData: tokenData.account || {},
          lastUpdated: Date.now()
        });

        if (!cancelled) {
          await refreshAuth();
          await refreshState();
          setSyncStatus({ type: 'success', message: 'GitHub App connected' });
        }
        return true;
      } catch (err) {
        if (!cancelled) {
          console.error('[GitNativeFederation] GitHub App callback failed:', err);
          setError(`GitHub App connection failed: ${err.message}`);
        }
        return false;
      } finally {
        if (pending) safeSessionRemove('github_app_pending');
        setIsConnecting(false);
        cleanupUrl();
      }
    };

    (async () => {
      const oauthDone = await processOAuthCallback();
      const appDone = await processAppCallback();
      if ((oauthDone || appDone) && !cancelled) {
        await refreshState();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshAuth, refreshState]);

  const activeUniverse = useMemo(() => {
    if (!serviceState.activeUniverseSlug) return null;
    return serviceState.universes.find((u) => u.slug === serviceState.activeUniverseSlug) || null;
  }, [serviceState]);

  const syncStatusFor = useCallback((slug) => {
    if (!slug) return null;
    return syncTelemetry?.[slug] || null;
  }, [syncTelemetry]);

  useEffect(() => {
    if (!activeUniverse?.raw?.sources) return;
    setDiscoveryMap((prev) => {
      const next = {};
      activeUniverse.raw.sources.forEach((src) => {
      if (src.type === 'github' && src.user && src.repo) {
        const key = `${src.user}/${src.repo}`;
          if (prev[key]) next[key] = prev[key];
        }
      });
      return next;
    });
  }, [activeUniverse?.raw?.sources]);

  const discoveryFor = useCallback(
    (user, repo) => discoveryMap[`${user}/${repo}`] || { items: [], loading: false },
    [discoveryMap]
  );

  const hasOAuth = !!serviceState.authStatus?.isAuthenticated;
  const hasApp = !!serviceState.githubAppInstallation?.accessToken;
  const dataAuthMethod = hasApp ? 'github-app' : hasOAuth ? 'oauth' : null;

  const statusBadge = useMemo(() => {
    if (hasOAuth && hasApp) return { label: 'Fully Connected', tone: STATUS_COLORS.success };
    if (hasOAuth || hasApp) return { label: 'Partially Connected', tone: STATUS_COLORS.info };
    return { label: 'Not Connected', tone: STATUS_COLORS.error };
  }, [hasOAuth, hasApp]);

  const handleCreateUniverse = async () => {
    const name = typeof window !== 'undefined' ? window.prompt('Name your new universe:') : null;
    if (!name || !name.trim()) return;

    try {
      setLoading(true);
      await gitFederationService.createUniverse(name.trim(), {
        enableGit: deviceInfo.gitOnlyMode,
        enableLocal: !deviceInfo.gitOnlyMode
      });
      setSyncStatus({ type: 'success', message: `Universe "${name.trim()}" created` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Create failed:', err);
      setError(`Failed to create universe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromLocal = async (file) => {
    try {
      setLoading(true);
      const fileName = file.name.replace('.redstring', '');
      
      // Read the file content
      const text = await file.text();
      const storeState = JSON.parse(text);
      
      // Create a new universe with this data
      const universeName = typeof window !== 'undefined' ? 
        window.prompt('Name for this universe:', fileName) : fileName;
      
      if (!universeName || !universeName.trim()) {
        setLoading(false);
        return;
      }
      
      // Create the universe first
      await gitFederationService.createUniverse(universeName.trim(), {
        enableGit: false,
        enableLocal: true
      });
      
      // Load the file data into it via uploadLocalFile (file first, then target slug)
      await universeBackendBridge.uploadLocalFile(file, universeName.trim());
      
      setSyncStatus({ type: 'success', message: `Universe "${universeName}" loaded from file` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Load from local failed:', err);
      setError(`Failed to load universe from file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFromRepo = () => {
    // Trigger the repository connection flow which will discover universe files
    setShowRepositoryManager(true);
  };

  const handleSwitchUniverse = async (slug) => {
    if (slug === serviceState.activeUniverseSlug) return;
    try {
      setLoading(true);
      await gitFederationService.switchUniverse(slug);
      await refreshState();
      setSyncStatus({ type: 'info', message: 'Universe switched' });
    } catch (err) {
      console.error('[GitNativeFederation] Switch failed:', err);
      setError(`Failed to switch universe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUniverse = async (slug, name) => {
    if (typeof window !== 'undefined') {
      const ok = window.confirm(`Delete universe "${name}"? This cannot be undone.`);
      if (!ok) return;
    }

    try {
      setLoading(true);
      await gitFederationService.deleteUniverse(slug);
      setSyncStatus({ type: 'info', message: `Universe "${name}" deleted` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Delete failed:', err);
      setError(`Failed to delete universe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimarySlot = async (slug, slot) => {
    try {
      setLoading(true);
      await gitFederationService.setPrimaryStorage(slug, slot.type);
      setSyncStatus({ type: 'success', message: `${STORAGE_LABELS[slot.type]} promoted to primary` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Promote failed:', err);
      setError(`Failed to set primary storage: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAttachRepo = (slug) => {
    setRepositoryTargetSlug(slug);
    setShowRepositoryManager(true);
  };

  const handleRepositorySelect = async (repo) => {
    if (!repo || !repositoryTargetSlug) {
      setRepositoryTargetSlug(null);
      setShowRepositoryManager(false);
      return;
    }

    const owner = repo.owner?.login || repo.owner?.name || repo.owner || repo.full_name?.split('/')[0];
    const repoName = repo.name || repo.full_name?.split('/').pop();

    if (!owner || !repoName) {
      setError('Selected repository missing owner/name metadata.');
      setRepositoryTargetSlug(null);
      setShowRepositoryManager(false);
      return;
    }

    try {
      // Close repo modal immediately for snappy UX
      setShowRepositoryManager(false);
      setLoading(true);

      // Auto-add repository to managed list if not already there
      const repoKey = `${owner}/${repoName}`;
      const alreadyManaged = managedRepositories.some(r =>
        `${r.owner?.login || r.owner}/${r.name}` === repoKey
      );

      if (!alreadyManaged) {
        const newList = [...managedRepositories, repo];
        setManagedRepositories(newList);
        localStorage.setItem('redstring-managed-repositories', JSON.stringify(newList));
        console.log(`[GitNativeFederation] Auto-added ${repoKey} to managed repositories`);
      }

      // Discover existing universe files in the repository
      console.log(`[GitNativeFederation] Discovering universe files in ${repoKey}...`);
      const discovered = await gitFederationService.discoverUniverses({
        user: owner,
        repo: repoName,
        authMethod: dataAuthMethod || 'oauth'
      });

      console.log(`[GitNativeFederation] Discovered ${discovered.length} universe files`);

      // If universe files exist, show selection dialog
      if (discovered.length > 0) {
        setPendingRepoAttachment({
          repo,
          owner,
          repoName,
          universeSlug: repositoryTargetSlug
        });
        setDiscoveredUniverseFiles(discovered);
        setShowUniverseFileSelector(true);
        setLoading(false);
        return;
      }

      // No existing files, proceed with creating new
      await handleAttachRepoCreateNew(owner, repoName, repo);
    } catch (err) {
      console.error('[GitNativeFederation] Repository selection failed:', err);
      setError(`Failed to process repository: ${err.message}`);
      setLoading(false);
      setRepositoryTargetSlug(null);
      setShowRepositoryManager(false);
    }
  };

  const handleAttachRepoCreateNew = async (owner, repoName, repo) => {
    try {
      setLoading(true);

      await gitFederationService.attachGitRepository(repositoryTargetSlug, {
        user: owner,
        repo: repoName,
        authMethod: dataAuthMethod || 'oauth'
      });

      // Initialize the repository with current universe data
      console.log(`[GitNativeFederation] Initializing repository with universe data for ${repositoryTargetSlug}`);
      await gitFederationService.forceSave(repositoryTargetSlug);
      setSyncStatus({ type: 'success', message: `Linked @${owner}/${repoName} and initialized with universe data` });
      setDiscoveryMap((prev) => {
        const next = { ...prev };
        delete next[`${owner}/${repoName}`];
        return next;
      });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Attach failed:', err);
      setError(`Failed to link repository: ${err.message}`);
    } finally {
      setLoading(false);
      setRepositoryTargetSlug(null);
      setShowRepositoryManager(false);
      setPendingRepoAttachment(null);
      setShowUniverseFileSelector(false);
    }
  };

  const handleUniverseFileSelection = async (selectedFile) => {
    if (!pendingRepoAttachment) return;

    const { owner, repoName, repo, universeSlug } = pendingRepoAttachment;

    try {
      setLoading(true);
      setShowUniverseFileSelector(false);

      if (selectedFile === 'CREATE_NEW') {
        // Create new file with current universe data
        await handleAttachRepoCreateNew(owner, repoName, repo);
      } else {
        // Check for name mismatch between local universe and repo file
        const localUniverse = serviceState.universes.find(u => u.slug === universeSlug);
        const repoFileSlug = selectedFile.slug || selectedFile.name;
        let renameLocal = false;
        
        if (localUniverse && repoFileSlug && localUniverse.slug !== repoFileSlug) {
          // Name mismatch - ask user what to do
          const choice = typeof window !== 'undefined' ? window.confirm(
            `Name mismatch detected!\n\n` +
            `Local universe: "${localUniverse.name}" (${localUniverse.slug})\n` +
            `Repo file: "${selectedFile.name}" (${repoFileSlug})\n\n` +
            `Click OK to rename LOCAL universe to match repo file.\n` +
            `Click Cancel to keep local name (repo file will sync to match).`
          ) : true;

          renameLocal = choice;

          if (renameLocal) {
            console.log(`[GitNativeFederation] Will rename local universe to match repo: ${repoFileSlug}`);
            setSyncStatus({ type: 'info', message: `Will rename local universe to "${selectedFile.name}"...` });
          } else {
            console.log(`[GitNativeFederation] Keeping local name, repo will sync to: ${localUniverse.slug}`);
            setSyncStatus({ type: 'info', message: `Keeping local name "${localUniverse.name}"...` });
          }
        }

        // Link to existing file and load its data
        console.log(`[GitNativeFederation] Linking to existing file:`, selectedFile);
        await gitFederationService.linkDiscoveredUniverse(selectedFile, {
          user: owner,
          repo: repoName,
          authMethod: dataAuthMethod || 'oauth'
        });

        // If renaming local to match repo, the linkDiscoveredUniverse should handle loading the repo data
        // If keeping local name, the next save will push local data to repo with local name
        
        setSyncStatus({ type: 'success', message: `Linked to universe: ${renameLocal ? selectedFile.name : localUniverse?.name}` });
        await refreshState();
      }
    } catch (err) {
      console.error('[GitNativeFederation] Universe file selection failed:', err);
      setError(`Failed to link universe file: ${err.message}`);
    } finally {
      setLoading(false);
      setRepositoryTargetSlug(null);
      setPendingRepoAttachment(null);
      setDiscoveredUniverseFiles([]);
    }
  };

  const handleDetachRepo = async (universe, source) => {
    try {
      setLoading(true);
      await gitFederationService.detachGitRepository(universe.slug, {
        user: source.user,
        repo: source.repo
      });
      setSyncStatus({ type: 'info', message: `Detached @${source.user}/${source.repo}` });
      setDiscoveryMap((prev) => {
        const next = { ...prev };
        delete next[`${source.user}/${source.repo}`];
        return next;
      });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Detach failed:', err);
      setError(`Failed to detach repository: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDiscover = async (source) => {
    const key = `${source.user}/${source.repo}`;
    setDiscoveryMap((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), loading: true, error: null }
    }));

    try {
      const results = await gitFederationService.discoverUniverses({
        user: source.user,
        repo: source.repo,
        authMethod: dataAuthMethod || 'oauth'
      });
      setDiscoveryMap((prev) => ({
        ...prev,
        [key]: { items: results, loading: false, error: null }
      }));
    } catch (err) {
      console.error('[GitNativeFederation] Discovery failed:', err);
      setDiscoveryMap((prev) => ({
        ...prev,
        [key]: { items: [], loading: false, error: err.message }
      }));
      setError(`Discovery failed: ${err.message}`);
    }
  };

  const handleLinkDiscovered = async (discovered, repo) => {
    try {
      setLoading(true);

      // Auto-add repository to managed list if not already there
      const repoKey = `${repo.user}/${repo.repo}`;
      const alreadyManaged = managedRepositories.some(r =>
        `${r.owner?.login || r.owner}/${r.name}` === repoKey
      );

      if (!alreadyManaged) {
        // Construct a repository object that matches the expected format
        const repoObject = {
          name: repo.repo,
          owner: { login: repo.user },
          full_name: `${repo.user}/${repo.repo}`,
          html_url: `https://github.com/${repo.user}/${repo.repo}`,
          private: false, // We don't know this for discovered repos
          id: `discovered-${repo.user}-${repo.repo}` // Generate a unique ID
        };

        const newList = [...managedRepositories, repoObject];
        setManagedRepositories(newList);
        localStorage.setItem('redstring-managed-repositories', JSON.stringify(newList));
        console.log(`[GitNativeFederation] Auto-added ${repoKey} to managed repositories (from discovery)`);
      }

      await gitFederationService.linkDiscoveredUniverse(discovered, {
        user: repo.user,
        repo: repo.repo,
        authMethod: dataAuthMethod || 'oauth'
      });

      // Initialize the repository with current universe data
      const targetSlug = discovered.slug || discovered.name;
      if (targetSlug) {
        console.log(`[GitNativeFederation] Initializing repository with universe data for ${targetSlug}`);
        await gitFederationService.forceSave(targetSlug);
      }
      setSyncStatus({ type: 'success', message: `Linked ${discovered.name || discovered.slug} and initialized with current data` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Link discovered failed:', err);
      setError(`Failed to link discovered universe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAddToManagedList = (repo) => {
    const repoKey = `${repo.owner?.login || repo.owner}/${repo.name}`;
    const alreadyAdded = managedRepositories.some(r =>
      `${r.owner?.login || r.owner}/${r.name}` === repoKey
    );

    if (alreadyAdded) {
      setSyncStatus({ type: 'warning', message: `${repoKey} is already in your list` });
      return;
    }

    const newList = [...managedRepositories, repo];
    setManagedRepositories(newList);
    try {
      localStorage.setItem('redstring_managed_repos', JSON.stringify(newList));
      setSyncStatus({ type: 'success', message: `Added ${repoKey} to your repositories` });
    } catch (err) {
      console.error('[GitNativeFederation] Failed to save managed repos:', err);
    }
  };


  const handleSetMainRepository = (repo) => {
    const repoKey = `${repo.owner?.login || repo.owner}/${repo.name}`;
    const updatedList = managedRepositories.map(r => {
      const currentKey = `${r.owner?.login || r.owner}/${r.name}`;
      return { ...r, isMain: currentKey === repoKey };
    });

    setManagedRepositories(updatedList);
    localStorage.setItem('redstring-managed-repositories', JSON.stringify(updatedList));

    setSyncStatus({
      type: 'success',
      message: `Set ${repoKey} as main repository`
    });
  };

  const handleRemoveRepoSource = async (universeSlug, source) => {
    try {
      setLoading(true);
      await gitFederationService.detachGitRepository(universeSlug, {
        user: source.user,
        repo: source.repo
      });
      setSyncStatus({ type: 'success', message: `Removed @${source.user}/${source.repo} from ${universeSlug}` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Remove source failed:', err);
      setError(`Failed to remove repository source: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRepoSource = (universeSlug, source) => {
    // Set the universe as target and show repository manager for swapping
    setRepositoryTargetSlug(universeSlug);
    setShowRepositoryManager(true);
    setSyncStatus({ type: 'info', message: `Select new repository to replace @${source.user}/${source.repo}` });
  };

  const handleSetMainRepoSource = async (universeSlug, source) => {
    // This would require backend support to reorder sources
    setSyncStatus({ type: 'info', message: `Main source feature coming soon` });
  };

  const handleSaveRepoSource = async (universeSlug, source) => {
    try {
      setLoading(true);
      await gitFederationService.forceSave(universeSlug);
      setSyncStatus({ type: 'success', message: `Manual save triggered for ${universeSlug}` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Manual save failed:', err);
      setError(`Failed to save: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimarySource = async (universeSlug, sourceType) => {
    try {
      setLoading(true);

      // Re-validate current state to avoid stale UI actions
      const state = await gitFederationService.refreshUniverses();
      const universe = state.universes.find(u => u.slug === universeSlug);
      if (!universe) throw new Error(`Universe not found: ${universeSlug}`);

      if (sourceType === 'git') {
        const linked = !!(universe.raw?.gitRepo?.linkedRepo);
        if (!linked) {
          setSyncStatus({ type: 'info', message: 'Link a repository first to make Git primary' });
          setRepositoryTargetSlug(universeSlug);
          setShowRepositoryManager(true);
          return;
        }
      } else if (sourceType === 'local') {
        const hasHandle = !!(universe.raw?.localFile?.fileHandle);
        if (!hasHandle) {
          setSyncStatus({ type: 'info', message: 'Pick a local file first to make Local primary' });
          // Trigger file picker to link local file
          handleLinkLocalFile(universeSlug);
          return;
        }
      }

      await universeBackend.setSourceOfTruth(universeSlug, sourceType);
      setSyncStatus({ type: 'success', message: `Set ${sourceType === 'git' ? 'repository' : 'local file'} as primary source for ${universeSlug}` });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Set primary source failed:', err);
      const msg = (err && err.message) ? err.message : String(err);
      if (msg.includes('no repository linked') && sourceType === 'git') {
        setSyncStatus({ type: 'warning', message: 'No repository linked. Choose a repo to use Git as primary.' });
        setRepositoryTargetSlug(universeSlug);
        setShowRepositoryManager(true);
      } else if (msg.includes('no local file linked') && sourceType === 'local') {
        setSyncStatus({ type: 'warning', message: 'No local file linked. Pick a file to use Local as primary.' });
        handleLinkLocalFile(universeSlug);
      } else {
        setError(`Failed to set primary source: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveFromManagedList = async (repo) => {
    const repoKey = `${repo.owner?.login || repo.owner}/${repo.name}`;

    // Check if this repo is linked to any universes and warn the user
    const linkedUniverses = serviceState.universes.filter(universe =>
      universe.raw?.sources?.some(source =>
        source.type === 'github' &&
        source.user === (repo.owner?.login || repo.owner) &&
        source.repo === repo.name
      )
    );

    if (linkedUniverses.length > 0) {
      const universeNames = linkedUniverses.map(u => u.name).join(', ');
      const shouldContinue = typeof window !== 'undefined' ?
        window.confirm(`This repository is linked to universe(s): ${universeNames}. Remove it anyway? You may need to manually detach it from those universes.`) :
        true;

      if (!shouldContinue) {
        return;
      }
    }

    const newList = managedRepositories.filter(r =>
      `${r.owner?.login || r.owner}/${r.name}` !== repoKey
    );

    setManagedRepositories(newList);
    try {
      localStorage.setItem('redstring_managed_repos', JSON.stringify(newList));
      setSyncStatus({
        type: 'success',
        message: linkedUniverses.length > 0 ?
          `Removed ${repoKey} (still linked to ${linkedUniverses.length} universe(s))` :
          `Removed ${repoKey}`
      });
    } catch (err) {
      console.error('[GitNativeFederation] Failed to save managed repos:', err);
    }
  };

  const handleLinkLocalFile = (slug) => {
    console.log('[GitNativeFederation] Triggering file upload for universe:', slug);
    
    // Create hidden file input
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.redstring';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        setLoading(true);
        await gitFederationService.uploadLocalFile(file, slug);
        setSyncStatus({ type: 'success', message: `Imported ${file.name}` });
        await refreshState();
      } catch (err) {
        console.error('[GitNativeFederation] File upload failed:', err);
        setError(`Failed to import file: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    input.click();
  };

  const handleDownloadLocalFile = async (slug) => {
    try {
      setLoading(true);
      // Get the current universe data and download it as a .redstring file
      const universe = serviceState.universes.find(u => u.slug === slug);
      if (!universe) {
        throw new Error('Universe not found');
      }

      // Import the download function and trigger download
      const { downloadRedstringFile } = await import('./formats/redstringFormat.js');
      const filename = `${universe.name || slug}.redstring`;

      // We need to get the store state for this universe - for now use a simple approach
      downloadRedstringFile({}, filename);
      setSyncStatus({ type: 'success', message: `Downloaded ${filename}` });
    } catch (err) {
      console.error('[GitNativeFederation] File download failed:', err);
      setError(`Failed to download file: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleForceSave = async (slug) => {
    try {
      setLoading(true);
      await gitFederationService.forceSave(slug);
      setSyncStatus({ type: 'success', message: 'Universe saved to Git' });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Save failed:', err);
      setError(`Save failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReloadActive = async () => {
    try {
      setLoading(true);
      await gitFederationService.reloadActiveUniverse();
      setSyncStatus({ type: 'info', message: 'Universe reloaded from Git' });
      await refreshState();
    } catch (err) {
      console.error('[GitNativeFederation] Reload failed:', err);
      setError(`Reload failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubAuth = async () => {
    try {
      setIsConnecting(true);
      try {
        sessionStorage.removeItem('github_oauth_pending');
        sessionStorage.removeItem('github_oauth_state');
        sessionStorage.removeItem('github_oauth_result');
      } catch {
        // ignore
      }

      const resp = await oauthFetch('/api/github/oauth/client-id');
      if (!resp.ok) throw new Error('Failed to load OAuth configuration');
      const { clientId } = await resp.json();
      if (!clientId) throw new Error('GitHub OAuth client ID not configured');

      const stateValue = Math.random().toString(36).slice(2);
      const redirectUri = gitFederationService.getOAuthRedirectUri();
      const scopes = 'repo';

      sessionStorage.setItem('github_oauth_state', stateValue);
      sessionStorage.setItem('github_oauth_pending', 'true');

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(
        clientId
      )}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(
        scopes
      )}&state=${encodeURIComponent(stateValue)}`;

      window.location.href = authUrl;
    } catch (err) {
      console.error('[GitNativeFederation] OAuth launch failed:', err);
      setError(`OAuth authentication failed: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const handleGitHubApp = async () => {
    try {
      setIsConnecting(true);
      let appName = 'redstring-semantic-sync';
      try {
        const resp = await oauthFetch('/api/github/app/info');
        if (resp.ok) {
          const data = await resp.json();
          appName = data.name || appName;
        }
      } catch {
        // ignore
      }

      sessionStorage.setItem('github_app_pending', 'true');
      const stateValue = Date.now().toString();
      const url = `https://github.com/apps/${appName}/installations/new?state=${stateValue}`;
      window.location.href = url;
    } catch (err) {
      console.error('[GitNativeFederation] GitHub App launch failed:', err);
      setError(`GitHub App authentication failed: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const renderStorageSlot = (universe, slot, isPrimary) => {
    const actions = [];

    if (slot.type === STORAGE_TYPES.GIT && slot.repo) {
      actions.push(
        <button
          key="open"
          onClick={() => window.open(`https://github.com/${slot.repo.user}/${slot.repo.repo}`, '_blank', 'noopener')}
          style={buttonStyle('outline')}
        >
          View Repo
        </button>
      );
    }

    if (!isPrimary) {
      actions.push(
        <button
          key="primary"
          onClick={() => handleSetPrimarySlot(universe.slug, slot)}
          style={buttonStyle('solid')}
        >
          Make Primary
        </button>
      );
    }

    if (slot.type === STORAGE_TYPES.GIT && slot.repo) {
      actions.push(
        <button
          key="detach"
          onClick={() => handleDetachRepo(universe, { user: slot.repo.user, repo: slot.repo.repo })}
          style={buttonStyle('danger')}
        >
          Detach
        </button>
      );
    }

  return (
      <div
        key={slot.id}
        style={{
          border: `1px solid ${isPrimary ? '#7A0000' : '#260000'}`,
          borderRadius: 8,
          padding: 12,
          backgroundColor: isPrimary ? 'rgba(122,0,0,0.08)' : '#bdb5b5',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}
      >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <GitBranch size={16} />
          <div>
              <div style={{ fontWeight: 600 }}>{STORAGE_LABELS[slot.type] || 'Storage slot'}</div>
              <div style={{ fontSize: '0.75rem', color: '#444' }}>{slot.label}</div>
            </div>
            </div>
          {isPrimary && (
            <span
                      style={{ 
                fontSize: '0.7rem',
                color: '#7A0000',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: 10,
                backgroundColor: 'rgba(122,0,0,0.1)'
              }}
            >
              PRIMARY
            </span>
              )}
          </div>
        <div style={{ fontSize: '0.72rem', color: '#555' }}>
          Last sync: {formatWhen(slot.lastSync)} · Status: {slot.status || 'unknown'}
        </div>
        {actions.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{actions}</div>}
        </div>
    );
  };

  const renderSources = (universe) => {
    const sources = (universe.raw?.sources || []).filter((src) => src.type === 'github');
    if (sources.length === 0) {
      return (
        <div
          style={{
            padding: 12,
            border: '1px dashed #979090',
            borderRadius: 6,
          backgroundColor: '#bdb5b5',
            color: '#555',
            fontSize: '0.8rem'
          }}
        >
          No repositories linked yet. Add one to enable sync.
          </div>
      );
    }

    return sources.map((source) => {
      const key = `${source.user}/${source.repo}`;
      const discovery = discoveryFor(source.user, source.repo);

      return (
        <div
          key={source.id}
          style={{
            border: '1px solid #260000',
            borderRadius: 8,
            padding: 12,
            backgroundColor: '#bdb5b5',
            display: 'flex',
            flexDirection: 'column',
            gap: 8
          }}
        >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Github size={18} />
              <div>
                <div style={{ fontWeight: 600 }}>@{source.user}/{source.repo}</div>
                <div style={{ fontSize: '0.72rem', color: '#555' }}>
                  Linked {new Date(source.addedAt).toLocaleDateString()}
                  </div>
                </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                    <button 
                onClick={() => handleDiscover(source)}
                style={buttonStyle(discovery.loading ? 'disabled' : 'outline')}
                disabled={discovery.loading}
              >
                {discovery.loading ? 'Scanning…' : 'Discover universes'}
                    </button>
                  <button 
                onClick={() => handleDetachRepo(universe, source)}
                style={buttonStyle('danger')}
              >
                Remove
                  </button>
        </div>
      </div>

          {discovery.error && (
            <div style={{ fontSize: '0.72rem', color: '#7A0000' }}>{discovery.error}</div>
          )}

          {discovery.items && discovery.items.length > 0 && (
            <div
                  style={{
                border: '1px solid #979090',
                borderRadius: 6,
                backgroundColor: '#cfc6c6',
                maxHeight: 160,
                overflowY: 'auto',
                padding: 6
              }}
            >
              {discovery.items.map((item) => (
                <div
                  key={`${key}:${item.slug || item.path}`}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 6,
                    borderBottom: '1px solid #979090',
                    gap: 8
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{item.name || item.slug || 'Universe'}</div>
                    <div style={{ fontSize: '0.68rem', color: '#555' }}>{item.path || item.location || 'Unknown path'}</div>
                  </div>
                <button
                    onClick={() => handleLinkDiscovered(item, { user: source.user, repo: source.repo })}
                    style={buttonStyle('solid')}
                  >
                    Link
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    });
  };

  const renderActiveUniverse = () => {
    if (!activeUniverse) {
      return (
        <div
                  style={{
            padding: 14,
            border: '1px dashed #979090',
            borderRadius: 6,
            backgroundColor: '#bdb5b5',
            color: '#555',
            fontSize: '0.8rem'
          }}
        >
          Select or create a universe to configure storage.
        </div>
      );
    }

    const slots = [];
    if (activeUniverse.storage?.primary) slots.push({ slot: activeUniverse.storage.primary, primary: true });
    if (activeUniverse.storage?.backups) {
      activeUniverse.storage.backups.forEach((slot) => slots.push({ slot, primary: false }));
    }

    return (
      <div
                  style={{
          backgroundColor: '#979090',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700 }}>{activeUniverse.name}</div>
            <div style={{ fontSize: '0.75rem', color: '#444' }}>
              Nodes: {activeUniverse.nodeCount ?? '—'} · Last opened {formatWhen(activeUniverse.lastOpenedAt)}
              </div>
            </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => handleAttachRepo(activeUniverse.slug)} style={buttonStyle('solid')}>
              Link repository
                </button>
            <button onClick={() => handleForceSave(activeUniverse.slug)} style={buttonStyle('outline')}>
              <Save size={14} /> Save
            </button>
            <button onClick={handleReloadActive} style={buttonStyle('outline')}>
              <RefreshCw size={14} /> Reload
                </button>
              </div>
            </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontSize: '0.82rem',
          fontWeight: 600,
          color: '#260000',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center'
        }}>
          <span>Storage slots</span>
          <span style={{ fontSize: '0.7rem', color: '#444', fontWeight: 500 }}>
            Primary: {activeUniverse.storage?.primary?.label || 'None'}
          </span>
        </div>
          {slots.length === 0 ? (
            <div
              style={{
                padding: 12,
                  border: '1px dashed #979090',
                borderRadius: 6,
                backgroundColor: '#bdb5b5',
                color: '#555',
                fontSize: '0.78rem'
              }}
            >
              No storage linked yet. Link a repository or local file to persist data.
                </div>
              ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {slots.map(({ slot, primary }) => renderStorageSlot(activeUniverse, slot, primary))}
                            </div>
          )}
          {activeUniverse.hasBrowserFallback && <BrowserFallbackNote />}
                            </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{
            fontSize: '0.82rem',
            fontWeight: 600,
            color: '#260000',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            alignItems: 'center'
          }}>
            <span>Repository sources</span>
            <span style={{ fontSize: '0.7rem', color: '#444', fontWeight: 500 }}>
              Linked: {(activeUniverse.raw?.sources || []).filter((src) => src.type === 'github').length}
            </span>
          </div>
          {renderSources(activeUniverse)}
        </div>

        {/* Status and Connection Stats moved to dedicated section below Accounts & Access */}
                          </div>
    );
  };

const renderUniversesList = () => (
  <div
                                  style={{
      backgroundColor: '#979090',
      borderRadius: 8,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div>
        <div style={{ fontWeight: 700, fontSize: '1rem' }}>Universes</div>
        <div style={{ fontSize: '0.75rem', color: '#444' }}>Manage your knowledge spaces</div>
      </div>
      <button onClick={handleCreateUniverse} style={buttonStyle('solid')}>
        <Plus size={14} /> New
                                </button>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {serviceState.universes.map((universe) => {
        const isActive = universe.slug === serviceState.activeUniverseSlug;
        return (
          <div
            key={universe.slug}
                                  style={{
              border: isActive ? '2px solid #7A0000' : '1px solid #260000',
              borderRadius: 8,
              backgroundColor: '#bdb5b5',
              padding: 12,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>{universe.name}</div>
              <div style={{ fontSize: '0.72rem', color: '#555' }}>
                Created {formatWhen(universe.createdAt)} · Updated {formatWhen(universe.updatedAt)}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {!isActive && (
                <button onClick={() => handleSwitchUniverse(universe.slug)} style={buttonStyle('outline')}>
                  Switch
                                </button>
              )}
              {serviceState.universes.length > 1 && (
                                <button
                  onClick={() => handleDeleteUniverse(universe.slug, universe.name)}
                  style={buttonStyle('danger')}
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

const variantStyles = variant === 'modal'
  ? {
      background: 'rgba(12, 0, 0, 0.9)',
      padding: 20,
      borderRadius: 12,
      border: '1px solid #260000',
      height: '100%',
      overflow: 'auto'
    }
  : {
      background: 'transparent',
      padding: 0,
      height: '100%'
    };

// Device message only shown if there are limitations
const deviceMessage = deviceInfo.gitOnlyMode ? (() => {
  if (deviceInfo.isMobile) {
    return {
      type: 'info',
      title: 'Mobile Git-Only Mode',
      message: 'We stick to Git repositories on this device for seamless synchronization.'
    };
  }
  if (deviceInfo.isTablet) {
    return {
      type: 'info',
      title: 'Tablet Git-Only Mode',
      message: 'Optimized for tablets with Git as the source of truth.'
    };
  }
  return {
    type: 'info',
    title: 'Git-Only Mode Active',
    message: 'Local file APIs are unavailable, so we sync directly with Git.'
  };
})() : null;

return (
  <div
    ref={containerRef}
                                style={{
      fontFamily: "'EmOne', sans-serif",
                                  color: '#260000',
      display: 'flex',
      flexDirection: 'column',
      gap: 16,
      position: 'relative',
      height: '100%',
      ...variantStyles
    }}
  >
    {variant === 'modal' && typeof onRequestClose === 'function' && (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={onRequestClose} style={buttonStyle('outline')}>
          Close
                              </button>
                              </div>
                            )}

    {deviceMessage && (
      <div
        style={{
          borderRadius: 8,
          border: '1px solid #260000',
          backgroundColor: '#bdb5b5',
          padding: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}
      >
        <Info size={18} />
        <div>
          <div style={{ fontWeight: 700 }}>{deviceMessage.title}</div>
          <div style={{ fontSize: '0.78rem', color: '#333' }}>{deviceMessage.message}</div>
        </div>
      </div>
    )}

    {syncStatus && (
      <div
                                        style={{
          borderRadius: 8,
          border: `1px solid ${STATUS_COLORS[syncStatus.type] || STATUS_COLORS.info}`,
          backgroundColor: 'rgba(255,255,255,0.4)',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <AlertCircle size={16} color={STATUS_COLORS[syncStatus.type] || STATUS_COLORS.info} />
        <span style={{ fontSize: '0.8rem' }}>{syncStatus.message}</span>
                              </div>
                            )}

      {error && (
      <div
        style={{
          borderRadius: 8,
          border: '1px solid #c62828',
          backgroundColor: '#ffebee',
          padding: 12,
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}
      >
        <XCircle size={16} color="#c62828" />
        <span style={{ fontSize: '0.8rem' }}>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{
              marginLeft: 'auto',
              border: 'none',
            background: 'transparent',
            color: '#c62828',
            cursor: 'pointer',
            fontSize: '1rem'
            }}
          >
            ×
          </button>
        </div>
      )}

    <UniversesList
      universes={serviceState.universes}
      activeUniverseSlug={serviceState.activeUniverseSlug}
      syncStatusMap={syncTelemetry}
      onCreateUniverse={handleCreateUniverse}
      onSwitchUniverse={handleSwitchUniverse}
      onDeleteUniverse={handleDeleteUniverse}
      onLinkRepo={handleAttachRepo}
      onLinkLocalFile={handleLinkLocalFile}
      onDownloadLocalFile={handleDownloadLocalFile}
      onRemoveRepoSource={handleRemoveRepoSource}
      onEditRepoSource={handleEditRepoSource}
      onSetMainRepoSource={handleSetMainRepoSource}
      onSaveRepoSource={handleSaveRepoSource}
      onSetPrimarySource={handleSetPrimarySource}
      onLoadFromLocal={handleLoadFromLocal}
      onLoadFromRepo={handleLoadFromRepo}
      isSlim={isSlim}
    />

    <RepositoriesSection
      repositories={managedRepositories}
      onBrowseRepositories={() => setShowRepositoryManager(true)}
      onRemoveRepository={handleRemoveFromManagedList}
      onSetMainRepository={handleSetMainRepository}
      onLinkToUniverse={(repo) => {
        setRepositoryTargetSlug(null); // Will prompt for universe selection
        setShowRepositoryManager(true);
      }}
      onRefresh={refreshState}
      isRefreshing={loading}
    />

    <AuthSection
      statusBadge={statusBadge}
      hasApp={hasApp}
      hasOAuth={hasOAuth}
      dataAuthMethod={dataAuthMethod}
      isConnecting={isConnecting}
      allowOAuthBackup={allowOAuthBackup}
      onSetAllowOAuthBackup={setAllowOAuthBackup}
      onGitHubAuth={handleGitHubAuth}
      onGitHubApp={handleGitHubApp}
      activeUniverse={activeUniverse}
      syncStatus={activeUniverse ? syncStatusFor(activeUniverse.slug) : null}
      isSlim={isSlim}
    />

    {activeUniverse && (
      <div
        style={{
          backgroundColor: '#979090',
          borderRadius: 8,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <GitBranch size={18} />
          <div style={{ fontWeight: 700 }}>Status & Sync</div>
        </div>

        {(() => {
          const engine = activeUniverse ? (syncStatusFor(activeUniverse.slug) || activeUniverse.sync?.engine || {}) : {};
          const base = activeUniverse?.sync || {};
          let displayState = 'idle';
          let displayLabel = 'All changes saved';
          let displayTone = '#2e7d32';
          let displayDesc = '';

          const pendingCommits = Number(engine?.pendingCommits || 0);
          const batchSize = Number(autosaveStatus?.currentBatchSize || 0);

          if (engine?.isInErrorBackoff || engine?.isHealthy === false) {
            displayState = 'error';
            displayLabel = 'Unable to save changes';
            displayTone = '#c62828';
          } else if (engine?.isRunning || pendingCommits > 0) {
            displayState = 'saving';
            displayLabel = 'Saving...';
            displayTone = '#666';
          } else if (engine?.isPaused) {
            displayState = 'paused';
            displayLabel = 'Sync paused';
            displayTone = '#ef6c00';
            displayDesc = 'Resume to save changes.';
          } else if (engine?.hasChanges || batchSize > 0) {
            displayState = 'unsaved';
            displayLabel = 'Unsaved changes';
            displayTone = '#ef6c00';
          } else if (base?.state && base?.label) {
            // Fallback to mapped state
            displayState = base.state;
            displayLabel = base.label;
            displayTone = base.tone || displayTone;
            displayDesc = base.description || '';
          }

          const lastTime = engine?.lastCommitTime || base?.lastCommitTime;
          const elapsedText = (() => {
            try {
              if (!lastTime) return null;
              const ts = typeof lastTime === 'string' ? new Date(lastTime).getTime() : lastTime;
              const diff = Date.now() - ts;
              if (!Number.isFinite(diff) || diff < 0) return null;
              if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))}s`;
              if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
              if (diff < 43200000) { // < 12h
                const h = Math.floor(diff / 3600000);
                const m = Math.floor((diff % 3600000) / 60000);
                return `${h}h ${m}m`;
              }
              return '12h+';
            } catch {
              return null;
            }
          })();

          return (
        <div
          style={{
            border: '1px solid #979090',
            borderRadius: 8,
            backgroundColor: 'rgba(255,255,255,0.35)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            {displayState === 'saving' && (
              <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite', color: '#666', flexShrink: 0 }} />
            )}
            {displayState === 'error' && (
              <AlertCircle size={16} style={{ color: '#c62828', flexShrink: 0 }} />
            )}
            {displayState === 'unsaved' && (
              <AlertCircle size={16} style={{ color: '#ef6c00', flexShrink: 0 }} />
            )}
            {displayState === 'idle' && (
              <CheckCircle size={16} style={{ color: '#2e7d32', flexShrink: 0 }} />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: displayTone || '#260000' }}>
                {displayLabel}
              </div>
              {(displayDesc || elapsedText) && (
                <div style={{ fontSize: '0.75rem', color: '#666', marginTop: 2 }}>
                  {displayDesc}
                  {elapsedText && (
                    <span style={{ marginLeft: displayDesc ? 8 : 0 }}>Last save {elapsedText} ago</span>
                  )}
                </div>
              )}
            </div>
          </div>
          {displayState === 'unsaved' && (
            <button
              onClick={() => handleForceSave(activeUniverse.slug)}
              style={{ ...buttonStyle('solid'), flexShrink: 0 }}
            >
              <Save size={14} /> Save now
            </button>
          )}
          {lastTime && displayState !== 'saving' && (
            <div style={{ 
              fontSize: '0.7rem', 
              color: '#666',
              whiteSpace: 'nowrap',
              flexShrink: 0
            }}>
              {formatWhen(lastTime)}
            </div>
          )}
        </div>
          );
        })()}

        <div 
          style={{ 
            fontSize: '0.82rem', 
            fontWeight: 600, 
            color: '#260000',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
            userSelect: 'none'
          }}
          onClick={() => {
            const newValue = !showConnectionStats;
            setShowConnectionStats(newValue);
            try {
              localStorage.setItem('redstring_show_connection_stats', newValue.toString());
            } catch (e) {
              console.warn('Failed to save connection stats visibility:', e);
            }
          }}
        >
          <ChevronRight 
            size={16} 
            style={{ 
              transition: 'transform 0.2s ease',
              transform: showConnectionStats ? 'rotate(90deg)' : 'rotate(0deg)'
            }} 
          />
          Connection Stats (Advanced)
        </div>
        {showConnectionStats && (
          <ConnectionStats
            universe={activeUniverse}
            syncStatus={syncStatusFor(activeUniverse.slug)}
            isSlim={isSlim}
          />
        )}
      </div>
    )}

      <RepositorySelectionModal
        isOpen={showRepositoryManager}
        onClose={() => {
          setShowRepositoryManager(false);
          setRepositoryTargetSlug(null);
        }}
        onSelectRepository={handleRepositorySelect}
        onAddToManagedList={handleAddToManagedList}
        managedRepositories={managedRepositories}
      />

      {/* Universe File Selection Modal */}
      <Modal
        isOpen={showUniverseFileSelector}
        onClose={() => {
          setShowUniverseFileSelector(false);
          setPendingRepoAttachment(null);
          setDiscoveredUniverseFiles([]);
        }}
        title="Choose Universe File"
        size="medium"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
            This repository contains existing universe files. Choose one to sync with, or create a new file.
          </p>

          {/* Create New Option */}
          <button
            onClick={() => handleUniverseFileSelection('CREATE_NEW')}
            style={{
              ...buttonStyle('solid'),
              width: '100%',
              padding: 16,
              justifyContent: 'flex-start',
              backgroundColor: '#7A0000',
              color: '#ffffff',
              border: '2px solid #7A0000'
            }}
          >
            <Plus size={18} />
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Create New Universe File</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                Save current universe as a new file in this repository
              </div>
            </div>
          </button>

          {/* Existing Files */}
          {discoveredUniverseFiles.length > 0 && (
            <>
              <div style={{ 
                fontSize: '0.85rem', 
                fontWeight: 600, 
                color: '#260000',
                marginTop: 8,
                paddingBottom: 8,
                borderBottom: '1px solid #e0e0e0'
              }}>
                Or link to existing file:
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {discoveredUniverseFiles.map((file, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleUniverseFileSelection(file)}
                    style={{
                      ...buttonStyle('outline'),
                      width: '100%',
                      padding: 14,
                      justifyContent: 'flex-start',
                      border: '2px solid #979090',
                      backgroundColor: '#f9f9f9',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#f0f0f0';
                      e.currentTarget.style.borderColor = '#7A0000';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#f9f9f9';
                      e.currentTarget.style.borderColor = '#979090';
                    }}
                  >
                    <GitBranch size={18} style={{ flexShrink: 0 }} />
                    <div style={{ textAlign: 'left', flex: 1 }}>
                      <div style={{ fontWeight: 700, marginBottom: 6, color: '#260000', fontSize: '0.9rem' }}>
                        {file.name || file.slug || 'Unnamed Universe'}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#666', marginBottom: 4 }}>
                        📁 {file.path || file.location || 'Unknown path'}
                      </div>
                      {/* Stats Section */}
                      <div style={{ 
                        display: 'flex', 
                        gap: 12, 
                        fontSize: '0.7rem', 
                        color: '#7A0000',
                        marginTop: 6,
                        paddingTop: 6,
                        borderTop: '1px solid #e0e0e0'
                      }}>
                        {file.nodeCount !== undefined && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>{file.nodeCount}</span> things
                          </span>
                        )}
                        {file.connectionCount !== undefined && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>{file.connectionCount}</span> connections
                          </span>
                        )}
                        {file.graphCount !== undefined && (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <span style={{ fontWeight: 600 }}>{file.graphCount}</span> webs
                          </span>
                        )}
                      </div>
                      {file.lastModified && (
                        <div style={{ fontSize: '0.65rem', color: '#999', marginTop: 4 }}>
                          Last updated: {file.lastModified}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button
              onClick={() => {
                setShowUniverseFileSelector(false);
                setPendingRepoAttachment(null);
                setDiscoveredUniverseFiles([]);
                setShowRepositoryManager(true);
              }}
              style={buttonStyle('outline')}
            >
              ← Back to Repositories
            </button>
          </div>
        </div>
      </Modal>

    {(initializing || isConnecting || loading) && (
      <>
        <style>
          {`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}
        </style>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999
          }}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: 8,
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              fontSize: '0.95rem',
              color: '#260000',
              fontWeight: 600,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
            }}
          >
            <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
            <span>{initializing ? 'Initializing universe backend...' : isConnecting ? 'Connecting...' : 'Working...'}</span>
          </div>
        </div>
      </>
      )}
    </div>
  );
};

export default GitNativeFederation;
