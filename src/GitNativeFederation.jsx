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

import universeBackendBridge from './services/universeBackendBridge.js';
import { formatUniverseNameFromRepo, buildUniqueUniverseName } from './utils/universeNaming.js';
import useGraphStore from './store/graphStore.jsx';

// UI-only imports
import { persistentAuth } from './services/persistentAuth.js';
import RepositoryManager from './components/repositories/RepositoryManager.jsx';
import RepositoryDropdown from './components/repositories/RepositoryDropdown.jsx';
import { oauthFetch } from './services/bridgeConfig.js';
import IntegratedUniverseModal from './components/IntegratedUniverseModal.jsx';

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

  const activeSourceOfTruth = useMemo(() => {
    if (!activeUniverse) return null;
    if (activeUniverse.sourceOfTruth) return activeUniverse.sourceOfTruth;
    if (activeUniverse.gitRepo?.enabled) return 'git';
    if (activeUniverse.localFile?.enabled) return 'local';
    return deviceInfo.gitOnlyMode ? 'git' : 'local';
  }, [activeUniverse, deviceInfo.gitOnlyMode]);

  // Load data from backend
  const loadUniverseData = useCallback(async () => {
    try {
      const universes = await universeBackendBridge.getAllUniverses();
      const uniqueUniverses = [];
      const seenSlugs = new Set();

      (universes || []).forEach((u) => {
        if (u?.slug && !seenSlugs.has(u.slug)) {
          seenSlugs.add(u.slug);
          uniqueUniverses.push(u);
        }
      });

      const activeUniverse = await universeBackendBridge.getActiveUniverse();
      const authStatus = await universeBackendBridge.getAuthStatus();

      setUniverses(uniqueUniverses);
      setActiveUniverseSlug(activeUniverse?.slug || null);
      setAuthStatus(authStatus);
    } catch (error) {
      console.error('[GitNativeFederation] Failed to load universe data:', error);
      setError('Failed to load universe data');
    }
  }, []);

  const applyActiveUniverseUpdate = useCallback(async (updates) => {
    if (!activeUniverse?.slug) return;
    try {
      await universeBackendBridge.updateUniverse(activeUniverse.slug, updates);
      await loadUniverseData();
    } catch (error) {
      console.error('[GitNativeFederation] Failed to update universe:', error);
      setError(`Failed to update universe: ${error.message}`);
    }
  }, [activeUniverse, loadUniverseData]);

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

  // Handle OAuth and GitHub App callbacks stored in sessionStorage
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    let cancelled = false;

    const safeSessionGet = (key) => {
      try {
        return sessionStorage.getItem(key);
      } catch (_) {
        return null;
      }
    };

    const safeSessionRemove = (key) => {
      try {
        sessionStorage.removeItem(key);
      } catch (_) {}
    };

    const readSessionJSON = (key) => {
      try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        sessionStorage.removeItem(key);
        return parsed;
      } catch (error) {
        console.warn(`[GitNativeFederation] Failed to parse session data for ${key}:`, error);
        sessionStorage.removeItem(key);
        return null;
      }
    };

    const cleanupUrl = () => {
      try {
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (_) {}
    };

    const processOAuthCallback = async () => {
      const storedResult = readSessionJSON('github_oauth_result');
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

      let oauthCode = storedResult?.code || urlParams.get('code') || hashParams.get('code');
      let oauthState = storedResult?.state || urlParams.get('state') || hashParams.get('state');

      const expectedState = safeSessionGet('github_oauth_state');
      const pendingOAuth = safeSessionGet('github_oauth_pending') === 'true';

      if (!oauthCode || !oauthState || !pendingOAuth) {
        return false;
      }

      if (expectedState && oauthState !== expectedState) {
        setError('GitHub authentication state mismatch. Please try connecting again.');
        safeSessionRemove('github_oauth_pending');
        safeSessionRemove('github_oauth_state');
        cleanupUrl();
        return false;
      }

      const redirectUri = `${window.location.origin}/oauth/callback`;

      try {
        setIsConnecting(true);
        setError(null);

        const tokenResp = await oauthFetch('/api/github/oauth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: oauthCode, state: oauthState, redirect_uri: redirectUri })
        });

        if (!tokenResp.ok) {
          const errorText = await tokenResp.text().catch(() => '');
          throw new Error(`Token exchange failed (${tokenResp.status} ${errorText || 'unknown error'})`);
        }

        const tokenData = await tokenResp.json();

        const userResponse = await fetch('https://api.github.com/user', {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!userResponse.ok) {
          const errorText = await userResponse.text().catch(() => '');
          throw new Error(`Failed to fetch GitHub user (${userResponse.status} ${errorText || 'unknown error'})`);
        }

        const userData = await userResponse.json();
        await persistentAuth.storeTokens(tokenData, userData);

        try {
          const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });

          if (reposResponse.ok) {
            const repos = await reposResponse.json();
            if (!cancelled) {
              setUserRepositories(repos);
            }
          }
        } catch (repoError) {
          console.warn('[GitNativeFederation] Failed to preload repositories after OAuth:', repoError);
        }

        if (!cancelled) {
          setAuthStatus(persistentAuth.getAuthStatus());
        }

        return true;
      } catch (error) {
        if (!cancelled) {
          console.error('[GitNativeFederation] OAuth callback processing failed:', error);
          setError(`GitHub authentication failed: ${error.message}`);
        }
        return false;
      } finally {
        safeSessionRemove('github_oauth_pending');
        safeSessionRemove('github_oauth_state');
        setIsConnecting(false);
        cleanupUrl();
      }
    };

    const processGitHubAppCallback = async () => {
      const storedResult = readSessionJSON('github_app_result');
      const urlParams = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));

      const installationId = storedResult?.installation_id || urlParams.get('installation_id') || hashParams.get('installation_id');

      if (!installationId) {
        return false;
      }

      const pendingApp = safeSessionGet('github_app_pending') === 'true';

      try {
        setIsConnecting(true);
        setError(null);

        const tokenResp = await oauthFetch('/api/github/app/installation-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ installation_id: installationId })
        });

        if (!tokenResp.ok) {
          const errorText = await tokenResp.text().catch(() => '');
          throw new Error(`Failed to obtain installation token (${tokenResp.status} ${errorText || 'unknown error'})`);
        }

        const tokenData = await tokenResp.json();
        const accessToken = tokenData?.token;

        if (!accessToken) {
          throw new Error('GitHub App token response missing token field');
        }

        let repositories = [];
        let account = null;

        try {
          const detailsResp = await oauthFetch(`/api/github/app/installation/${encodeURIComponent(installationId)}`, { method: 'GET' });
          if (detailsResp.ok) {
            const details = await detailsResp.json();
            account = details?.account || null;
            if (Array.isArray(details?.repositories)) {
              repositories = details.repositories.map(repo => ({
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                created_at: repo.created_at,
                updated_at: repo.updated_at
              }));
            }
          }
        } catch (detailsError) {
          console.warn('[GitNativeFederation] Failed to fetch installation details:', detailsError);
        }

        const installationPayload = {
          installationId,
          accessToken,
          repositories,
          userData: account || {},
          lastUpdated: Date.now()
        };

        persistentAuth.storeAppInstallation(installationPayload);

        if (!cancelled) {
          setGithubAppInstallation(installationPayload);
          setUserRepositories(repositories);
          setAuthStatus(persistentAuth.getAuthStatus());
        }

        if (repositories.length === 0 && !cancelled) {
          setError('GitHub App connected, but no repositories are accessible. Configure repository access on GitHub and try again.');
        }

        return true;
      } catch (error) {
        if (!cancelled) {
          console.error('[GitNativeFederation] GitHub App callback processing failed:', error);
          setError(`GitHub App connection failed: ${error.message}`);
        }
        return false;
      } finally {
        if (pendingApp) {
          safeSessionRemove('github_app_pending');
        }
        setIsConnecting(false);
        cleanupUrl();
      }
    };

    const handleCallbacks = async () => {
      const oauthProcessed = await processOAuthCallback();
      const appProcessed = await processGitHubAppCallback();

      if ((oauthProcessed || appProcessed) && !cancelled) {
        await loadUniverseData();
      }
    };

    handleCallbacks();

    return () => {
      cancelled = true;
    };
  }, [loadUniverseData]);

  // Keep GitHub App installation state in sync with persistent storage
  useEffect(() => {
    const handleAppInstallationUpdate = () => {
      const updatedInstallation = persistentAuth.getAppInstallation();
      if (updatedInstallation) {
        setGithubAppInstallation(updatedInstallation);
      }
    };

    if (typeof persistentAuth?.on === 'function') {
      persistentAuth.on('appInstallationStored', handleAppInstallationUpdate);
    }

    return () => {
      if (typeof persistentAuth?.off === 'function') {
        persistentAuth.off('appInstallationStored', handleAppInstallationUpdate);
      }
    };
  }, []);

  // Track which authentication method is available for data operations
  useEffect(() => {
    if (githubAppInstallation?.accessToken) {
      setDataAuthMethod('github-app');
    } else if (authStatus?.isAuthenticated) {
      setDataAuthMethod('oauth');
    } else {
      setDataAuthMethod(null);
    }
  }, [githubAppInstallation, authStatus]);


  // Listen for auto-connect events from persistentAuth
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleAutoConnect = (event) => {
      const { method } = event.detail;
      console.log(`[GitNativeFederation] Auto-connect successful via ${method}`);
      // Refresh auth data
      loadUniverseData();
    };

    const handleAutoConnectError = (event) => {
      const error = event.detail;
      console.warn('[GitNativeFederation] Auto-connect failed:', error);
      // Don't show error to user as this is automatic
    };

    window.addEventListener('redstring:auth-token-stored', handleAutoConnect);

    // Listen to persistentAuth events
    if (persistentAuth?.on) {
      persistentAuth.on('autoConnected', (data) => {
        console.log(`[GitNativeFederation] Auto-connected via ${data.method}`);
        loadUniverseData();
      });

      persistentAuth.on('autoConnectError', (error) => {
        console.warn('[GitNativeFederation] Auto-connect error:', error);
      });
    }

    return () => {
      window.removeEventListener('redstring:auth-token-stored', handleAutoConnect);

      if (persistentAuth?.off) {
        persistentAuth.off('autoConnected');
        persistentAuth.off('autoConnectError');
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

  const handleSetSourceOfTruth = useCallback(async (sourceOfTruth) => {
    if (!activeUniverseSlug) return;

    const active = universes.find(u => u.slug === activeUniverseSlug);
    const nextGitConfig = (() => {
      if (!active?.gitRepo) return undefined;
      if (sourceOfTruth === 'git') {
        return { ...active.gitRepo, enabled: true };
      }
      if (sourceOfTruth === 'local') {
        return { ...active.gitRepo, enabled: false };
      }
      return undefined;
    })();

    try {
      const payload = nextGitConfig ? { sourceOfTruth, gitRepo: nextGitConfig } : { sourceOfTruth };
      await applyActiveUniverseUpdate(payload);
    } catch (error) {
      console.error('[GitNativeFederation] Failed to set source of truth:', error);
      setError(`Failed to set source of truth: ${error.message}`);
    }
  }, [activeUniverseSlug, universes, applyActiveUniverseUpdate]);

  useEffect(() => {
    if (!deviceInfo.gitOnlyMode) return;
    if (!activeUniverseSlug) return;
    if (activeSourceOfTruth === 'git') return;

    const active = universes.find(u => u.slug === activeUniverseSlug);
    if (!active) return;

    const nextGitConfig = active.gitRepo ? { ...active.gitRepo, enabled: true } : undefined;
    const payload = nextGitConfig ? { sourceOfTruth: 'git', gitRepo: nextGitConfig } : { sourceOfTruth: 'git' };

    applyActiveUniverseUpdate(payload).catch((error) => {
      console.warn('[GitNativeFederation] Failed to enforce Git-only mode:', error);
    });
  }, [deviceInfo.gitOnlyMode, activeUniverseSlug, activeSourceOfTruth, universes, applyActiveUniverseUpdate]);

  const handleAddGitSource = useCallback(async () => {
    if (!activeUniverse) return;
    const input = window.prompt('Enter repository (owner/repo):');
    if (!input) return;

    const normalized = input.trim().replace(/^https?:\/\/github\.com\//i, '');
    const [userRaw, repoRaw] = normalized.split('/');
    const user = userRaw?.trim();
    const repo = repoRaw?.replace(/\.git$/i, '').trim();

    if (!user || !repo) {
      setError('Repository must be in the format owner/repo');
      setTimeout(() => setError(null), 4000);
      return;
    }

    const existingSources = activeUniverse.sources || [];
    const duplicate = existingSources.some(src => src.type === 'github' && src.user?.toLowerCase() === user.toLowerCase() && src.repo?.toLowerCase() === repo.toLowerCase());
    if (duplicate) {
      setError('Repository already added to this universe');
      setTimeout(() => setError(null), 3000);
      return;
    }

    const newSource = {
      id: `src_${Date.now().toString(36)}`,
      type: 'github',
      user,
      repo,
      name: `@${user}/${repo}`,
      addedAt: new Date().toISOString()
    };

    await applyActiveUniverseUpdate({ sources: [...existingSources, newSource] });
    setSyncStatus({ type: 'success', status: `Added data source @${user}/${repo}` });
  }, [activeUniverse, applyActiveUniverseUpdate]);

  const handleBrowseRepositories = useCallback(() => {
    setShowRepositoryManager(true);
  }, []);

  const handleRepositoryManagerClose = useCallback(() => {
    setShowRepositoryManager(false);
  }, []);

  const handleRepositoryManagerSelect = useCallback(async (repo) => {
    if (!activeUniverse || !repo) {
      setShowRepositoryManager(false);
      return;
    }

    const owner = repo?.owner?.login || repo?.owner?.name || repo?.owner || (typeof repo?.full_name === 'string' ? repo.full_name.split('/')[0] : null);
    const repoName = repo?.name || (typeof repo?.full_name === 'string' ? repo.full_name.split('/').slice(-1)[0] : null);

    if (!owner || !repoName) {
      setError('Selected repository is missing owner or name metadata.');
      setShowRepositoryManager(false);
      return;
    }

    setShowRepositoryManager(false);

    const existingSources = activeUniverse.sources || [];
    const duplicate = existingSources.some(src =>
      src.type === 'github' &&
      src.user?.toLowerCase() === owner.toLowerCase() &&
      src.repo?.toLowerCase() === repoName.toLowerCase()
    );

    if (duplicate) {
      setSyncStatus({ type: 'info', status: `Repository already linked (@${owner}/${repoName})` });
      return;
    }

    const newSource = {
      id: `src_${Date.now().toString(36)}`,
      type: 'github',
      user: owner,
      repo: repoName,
      name: `@${owner}/${repoName}`,
      addedAt: new Date().toISOString()
    };

    try {
      await applyActiveUniverseUpdate({ sources: [...existingSources, newSource] });
      setSyncStatus({ type: 'success', status: `Added data source @${owner}/${repoName}` });
    } catch (err) {
      console.error('[GitNativeFederation] Repository selection failed:', err);
      setError(`Failed to add repository: ${err.message}`);
    }
  }, [activeUniverse, applyActiveUniverseUpdate]);

  const handleUpdateGitSourceRepo = useCallback(async (source, repository) => {
    if (!activeUniverse || !source || !repository) return;
    const user = repository.owner?.login;
    const repo = repository.name;
    if (!user || !repo) return;

    const updatedSources = (activeUniverse.sources || []).map(src => src.id === source.id ? { ...src, user, repo, name: `@${user}/${repo}` } : src);
    await applyActiveUniverseUpdate({ sources: updatedSources });
  }, [activeUniverse, applyActiveUniverseUpdate]);

  const handleSetPrimaryGitSource = useCallback(async (source) => {
    if (!activeUniverse || !source || source.type !== 'github' || !source.user || !source.repo) return;
    
    try {
      setIsLoading(true);
      setError(null);
      
      const linkedRepo = { type: 'github', user: source.user, repo: source.repo };
      const gitRepoConfig = {
        ...activeUniverse.gitRepo,
        enabled: true,
        linkedRepo,
        universeFolder: activeUniverse.gitRepo?.universeFolder || `universes/${activeUniverse.slug}`,
        universeFile: activeUniverse.gitRepo?.universeFile || `${activeUniverse.slug}.redstring`
      };

      const formattedName = formatUniverseNameFromRepo(source.repo);
      const uniqueName = buildUniqueUniverseName(formattedName, universes, activeUniverse.slug);

      console.log(`[GitNativeFederation] Setting primary Git source: @${source.user}/${source.repo}`);
      
      await applyActiveUniverseUpdate({
        gitRepo: gitRepoConfig,
        name: uniqueName,
        sourceOfTruth: 'git'
      });
      
      // Give the backend a moment to process the update and set up the sync engine
      setTimeout(() => {
        setSyncStatus({ type: 'success', status: `Primary source set to @${source.user}/${source.repo} - Git sync engine initializing` });
        
        // Refresh data to show the updated state
        loadUniverseData();
      }, 500);
      
    } catch (error) {
      console.error('[GitNativeFederation] Failed to set primary Git source:', error);
      setError(`Failed to set primary source: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [activeUniverse, universes, applyActiveUniverseUpdate, loadUniverseData]);

  const handleRemoveSource = useCallback(async (source) => {
    if (!activeUniverse || !source) return;

    const isPrimaryGit = source.type === 'github' && activeUniverse.gitRepo?.linkedRepo &&
      activeUniverse.gitRepo.linkedRepo.user?.toLowerCase() === source.user?.toLowerCase() &&
      activeUniverse.gitRepo.linkedRepo.repo?.toLowerCase() === source.repo?.toLowerCase();

    if (isPrimaryGit) {
      const confirmed = window.confirm('Unlink the primary Git repository?');
      if (!confirmed) return;
    }

    const remainingSources = (activeUniverse.sources || []).filter(src => src.id !== source.id);
    const updatePayload = { sources: remainingSources };

    if (isPrimaryGit) {
      updatePayload.gitRepo = { ...activeUniverse.gitRepo, enabled: false, linkedRepo: null };
    }

    await applyActiveUniverseUpdate(updatePayload);
  }, [activeUniverse, applyActiveUniverseUpdate]);

  const handleOpenGitHubRepo = useCallback((source) => {
    if (!source?.user || !source?.repo) return;
    const url = `https://github.com/${source.user}/${source.repo}`;
    window.open(url, '_blank', 'noopener');
  }, []);

  const handleDeleteDiscoveredUniverse = useCallback(async (slug) => {
    const existing = universes.find(u => u.slug === slug);
    if (!existing) return;
    await removeUniverse(slug);
  }, [universes, removeUniverse]);

  // Auth operations
  const handleGitHubAuth = async () => {
    try {
      setIsConnecting(true);
      setError(null);

      try {
        sessionStorage.removeItem('github_oauth_pending');
        sessionStorage.removeItem('github_oauth_state');
        sessionStorage.removeItem('github_oauth_result');
      } catch (_) {}

      const clientResp = await oauthFetch('/api/github/oauth/client-id');
      if (!clientResp.ok) {
        throw new Error('Failed to load OAuth configuration from server');
      }

      const { clientId } = await clientResp.json();
      if (!clientId) {
        throw new Error('GitHub OAuth client ID is not configured');
      }

      const state = Math.random().toString(36).slice(2);
      const redirectUri = `${window.location.origin}/oauth/callback`;
      const scopes = 'repo';

      sessionStorage.setItem('github_oauth_state', state);
      sessionStorage.setItem('github_oauth_pending', 'true');

      const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;

      window.location.href = authUrl;

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
      try {
        sessionStorage.removeItem('github_app_pending');
        sessionStorage.removeItem('github_app_result');
      } catch (_) {}
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
      const timer = setTimeout(() => setError(null), 8000); // Longer timeout for critical errors
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Clear sync status after timeout (but keep success messages longer)
  useEffect(() => {
    if (syncStatus) {
      const timeout = syncStatus.type === 'success' ? 4000 : 
                     syncStatus.type === 'error' ? 8000 : 3000;
      const timer = setTimeout(() => setSyncStatus(null), timeout);
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
            </div>
          ))}
        </div>
      </div>

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

      {/* Data Sources & Repositories */}
      <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <div style={{ marginBottom: '12px' }}>
          <div style={{ fontWeight: 'bold', fontSize: '1.05rem', marginBottom: '4px' }}>Repository Sources</div>
          <div style={{ fontSize: '0.8rem', color: '#666' }}>Manage Git-linked universes and data sources for the active universe.</div>
        </div>

        {activeUniverse ? (
          <>
            <div style={{
              display: 'flex',
              flexDirection: isSlim ? 'column' : 'row',
              gap: '8px',
              marginBottom: '12px',
              alignItems: isSlim ? 'stretch' : 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: '0.78rem', color: '#260000', fontWeight: 600 }}>
                Active universe: <span style={{ fontWeight: 700 }}>{activeUniverse.name || activeUniverse.slug}</span>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button
                  onClick={handleBrowseRepositories}
                  disabled={!hasOAuthForBrowsing && !hasAppForAutoSave}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: (hasOAuthForBrowsing || hasAppForAutoSave) ? '#260000' : '#ccc',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (hasOAuthForBrowsing || hasAppForAutoSave) ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}
                >
                  Browse GitHub Repositories
                </button>
                <button
                  onClick={handleAddGitSource}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    color: '#260000',
                    border: '1px solid #260000',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}
                >
                  Add by owner/repo
                </button>
                <button
                  onClick={async () => {
                    if (!hasOAuthForBrowsing && !hasAppForAutoSave) {
                      setError('Authentication required to discover universes');
                      return;
                    }
                    
                    try {
                      setIsLoading(true);
                      setError(null);
                      
                      // Get all user repositories
                      let repositories = userRepositories;
                      if (!repositories || repositories.length === 0) {
                        setSyncStatus({ type: 'info', status: 'Loading your repositories...' });
                        
                        // Fetch repositories if not already loaded
                        const authMethod = dataAuthMethod || 'oauth';
                        const token = authMethod === 'github-app' ? 
                          githubAppInstallation?.accessToken : 
                          await persistentAuth.getAccessToken();
                          
                        if (token) {
                          const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
                            headers: {
                              'Authorization': `Bearer ${token}`,
                              'Accept': 'application/vnd.github.v3+json'
                            }
                          });
                          
                          if (reposResponse.ok) {
                            repositories = await reposResponse.json();
                            setUserRepositories(repositories);
                          }
                        }
                      }
                      
                      if (!repositories || repositories.length === 0) {
                        setSyncStatus({ type: 'warning', status: 'No repositories found' });
                        return;
                      }
                      
                      setSyncStatus({ type: 'info', status: `Scanning ${repositories.length} repositories for universes...` });
                      
                      // Discover universes across all repositories
                      let totalDiscovered = 0;
                      let totalLoaded = 0;
                      let reposWithUniverses = 0;
                      
                      for (const repo of repositories.slice(0, 20)) { // Limit to first 20 repos to avoid rate limits
                        try {
                          const repoConfig = { 
                            type: 'github', 
                            user: repo.owner.login, 
                            repo: repo.name, 
                            authMethod: dataAuthMethod || 'oauth' 
                          };
                          
                          const discovered = await universeBackendBridge.discoverUniversesInRepository(repoConfig);
                          
                          if (discovered.length > 0) {
                            reposWithUniverses++;
                            totalDiscovered += discovered.length;
                            
                            // Auto-load universes that don't already exist
                            for (const universe of discovered) {
                              try {
                                const existingUniverses = await universeBackendBridge.getAllUniverses();
                                const alreadyExists = existingUniverses.some(existing => existing.slug === universe.slug);
                                
                                if (!alreadyExists) {
                                  await universeBackendBridge.linkToDiscoveredUniverse(universe, repoConfig);
                                  totalLoaded++;
                                }
                              } catch (linkError) {
                                console.warn(`Failed to load universe ${universe.name}:`, linkError);
                              }
                            }
                          }
                        } catch (repoError) {
                          console.warn(`Failed to scan repository ${repo.full_name}:`, repoError);
                        }
                      }
                      
                      // Refresh universe data
                      await loadUniverseData();
                      
                      setSyncStatus({ 
                        type: 'success', 
                        status: `Found ${totalDiscovered} universes in ${reposWithUniverses} repos • Loaded ${totalLoaded} new universes` 
                      });
                      
                    } catch (error) {
                      console.error('[GitNativeFederation] Universe discovery failed:', error);
                      setError(`Universe discovery failed: ${error.message}`);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={!hasOAuthForBrowsing && !hasAppForAutoSave}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: (hasOAuthForBrowsing || hasAppForAutoSave) ? '#7A0000' : '#ccc',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: (hasOAuthForBrowsing || hasAppForAutoSave) ? 'pointer' : 'not-allowed',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}
                >
                  Discover All Universes
                </button>
                <button
                  onClick={async () => {
                    try {
                      // Diagnostic tool to check system state
                      const universes = await universeBackendBridge.getAllUniverses();
                      const activeUniverse = await universeBackendBridge.getActiveUniverse();
                      const authStatus = await universeBackendBridge.getAuthStatus();
                      
                      console.log('=== REDSTRING SYSTEM DIAGNOSTIC ===');
                      console.log('Universes:', universes);
                      console.log('Active Universe:', activeUniverse);
                      console.log('Auth Status:', authStatus);
                      console.log('Store State Summary:', {
                        hasStoreOperations: 'Available',
                        currentStoreState: (() => {
                          try {
                            const store = useGraphStore.getState();
                            return {
                              nodeCount: store.nodePrototypes?.size || 0,
                              graphCount: store.graphs?.size || 0,
                              isUniverseLoaded: store.isUniverseLoaded,
                              hasUniverseFile: store.hasUniverseFile
                            };
                          } catch (e) {
                            return { error: e.message };
                          }
                        })()
                      });
                      console.log('===================================');
                      
                      setSyncStatus({ 
                        type: 'info', 
                        status: `Diagnostic: ${universes?.length || 0} universes, active: ${activeUniverse?.name || 'none'}, auth: ${authStatus?.isAuthenticated ? 'OK' : 'MISSING'}` 
                      });
                    } catch (error) {
                      console.error('Diagnostic failed:', error);
                      setError(`Diagnostic failed: ${error.message}`);
                    }
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    color: '#666',
                    border: '1px solid #666',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 'bold'
                  }}
                  title="Debug system state"
                >
                  Debug
                </button>
              </div>
            </div>

            <div style={{
              display: 'flex',
              flexDirection: isSlim ? 'column' : 'row',
              gap: '8px',
              marginBottom: '12px',
              alignItems: isSlim ? 'flex-start' : 'center'
            }}>
              <div style={{ fontSize: '0.78rem', color: '#260000', fontWeight: 600 }}>Source of truth</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => handleSetSourceOfTruth('git')}
                  disabled={activeSourceOfTruth === 'git'}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #260000',
                    backgroundColor: activeSourceOfTruth === 'git' ? '#260000' : 'transparent',
                    color: activeSourceOfTruth === 'git' ? '#bdb5b5' : '#260000',
                    cursor: activeSourceOfTruth === 'git' ? 'default' : 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}
                >
                  Git repository
                </button>
                <button
                  onClick={() => handleSetSourceOfTruth('local')}
                  disabled={deviceInfo.gitOnlyMode || activeSourceOfTruth === 'local'}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #979090',
                    backgroundColor: activeSourceOfTruth === 'local' ? '#979090' : 'transparent',
                    color: deviceInfo.gitOnlyMode ? '#888' : '#260000',
                    cursor: (deviceInfo.gitOnlyMode || activeSourceOfTruth === 'local') ? 'default' : 'pointer',
                    fontSize: '0.72rem',
                    fontWeight: 600
                  }}
                  title={deviceInfo.gitOnlyMode ? 'Local source disabled on this device' : undefined}
                >
                  Local file
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {(activeUniverse.sources || []).length === 0 ? (
                <div style={{
                  padding: '12px',
                  backgroundColor: '#bdb5b5',
                  border: '1px dashed #979090',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: '#555'
                }}>
                  No data sources linked yet. Add a GitHub repository to sync this universe.
                </div>
              ) : (
                (activeUniverse.sources || []).map((source) => (
                  (() => {
                    const isPrimaryGit = source.type === 'github' && activeUniverse.gitRepo?.linkedRepo &&
                      activeUniverse.gitRepo.linkedRepo.user?.toLowerCase() === source.user?.toLowerCase() &&
                      activeUniverse.gitRepo.linkedRepo.repo?.toLowerCase() === source.repo?.toLowerCase();
                    const repoKey = source.type === 'github' && source.user && source.repo ? `${source.user}/${source.repo}` : null;
                    const discoveryState = repoKey ? (repoUniverseLists[repoKey] || {}) : {};
                    const discoveryItems = Array.isArray(discoveryState.items) ? discoveryState.items : [];
                    const discoveryLoading = !!discoveryState.loading;
                    const discoveryError = discoveryState.error;

                    return (
                      <div key={source.id} style={{
                        backgroundColor: '#bdb5b5',
                        border: isPrimaryGit ? '2px solid #260000' : '1px solid #260000',
                        borderRadius: '6px',
                        padding: '10px'
                      }}>
                        <div style={{ display: 'flex', flexDirection: isSlim ? 'column' : 'row', gap: '10px', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontWeight: 600, fontSize: '0.9rem', color: '#260000' }}>
                              {source.name || (source.type === 'github' ? `@${source.user}/${source.repo}` : 'Data Source')}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#555', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>{source.type === 'github' ? 'GitHub Repository' : (source.type || 'custom')}</span>
                              {isPrimaryGit && (
                                <span style={{ 
                                  fontSize: '0.65rem', 
                                  padding: '2px 4px', 
                                  borderRadius: '4px',
                                  backgroundColor: syncStatus?.type === 'success' ? '#4caf50' : '#ff9800',
                                  color: 'white',
                                  fontWeight: 600
                                }}>
                                  {syncStatus?.status?.includes('Git sync enabled') ? 'SYNCING' : 'SETUP'}
                                </span>
                              )}
                            </div>
                            {source.type === 'github' && (hasOAuthForBrowsing || hasAppForAutoSave) && (
                              <div style={{ maxWidth: isSlim ? '100%' : '260px' }}>
                                <RepositoryDropdown
                                  selectedRepository={{ name: source.repo, owner: { login: source.user } }}
                                  repositories={userRepositories}
                                  onSelectRepository={(repo) => handleUpdateGitSourceRepo(source, repo)}
                                  placeholder="Select repository"
                                  disabled={!Array.isArray(userRepositories) || userRepositories.length === 0}
                                />
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: isSlim ? 'stretch' : 'flex-end' }}>
                            {source.type === 'github' && (
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: isSlim ? 'flex-start' : 'flex-end' }}>
                                <button
                                  onClick={() => handleSetPrimaryGitSource(source)}
                                  disabled={isPrimaryGit}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #260000',
                                    backgroundColor: isPrimaryGit ? '#ccc' : '#260000',
                                    color: isPrimaryGit ? '#666' : '#bdb5b5',
                                    cursor: isPrimaryGit ? 'default' : 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                  }}
                                >
                                  {isPrimaryGit ? 'Primary' : 'Set Primary'}
                                </button>
                                <button
                                  onClick={() => handleOpenGitHubRepo(source)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #260000',
                                    backgroundColor: 'transparent',
                                    color: '#260000',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                  }}
                                >
                                  Open on GitHub
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      setIsLoading(true);
                                      setError(null);
                                      
                                      // Force save to this specific repository
                                      await universeBackendBridge.forceSave(activeUniverse.slug);
                                      setSyncStatus({ type: 'success', status: `Saved to @${source.user}/${source.repo}` });
                                      setTimeout(() => setSyncStatus(null), 3000);
                                    } catch (error) {
                                      console.error('[GitNativeFederation] Manual save failed:', error);
                                      setError(`Save failed: ${error.message}`);
                                    } finally {
                                      setIsLoading(false);
                                    }
                                  }}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #7A0000',
                                    backgroundColor: '#7A0000',
                                    color: '#bdb5b5',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                  }}
                                >
                                  Save Now
                                </button>
                                <button
                                  onClick={() => handleRemoveSource(source)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #7A0000',
                                    backgroundColor: 'rgba(122,0,0,0.1)',
                                    color: '#7A0000',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                  }}
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {source.type === 'github' && (
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              <button
                                onClick={() => handleDiscoverUniverses({ user: source.user, repo: source.repo, type: 'github', authMethod: dataAuthMethod || 'oauth' })}
                                disabled={discoveryLoading}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #260000',
                                  backgroundColor: discoveryLoading ? '#ccc' : 'transparent',
                                  color: '#260000',
                                  cursor: discoveryLoading ? 'wait' : 'pointer',
                                  fontSize: '0.7rem',
                                  fontWeight: 600
                                }}
                              >
                                {discoveryLoading ? 'Discovering…' : 'Discover universes'}
                              </button>
                              {discoveryItems.length > 0 && (
                                <button
                                  onClick={() => refreshRepoUniversesList(source.user, source.repo)}
                                  style={{
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    border: '1px solid #260000',
                                    backgroundColor: 'transparent',
                                    color: '#260000',
                                    cursor: 'pointer',
                                    fontSize: '0.7rem',
                                    fontWeight: 600
                                  }}
                                >
                                  Refresh list
                                </button>
                              )}
                              <button
                                onClick={async () => {
                                  try {
                                    setIsLoading(true);
                                    setError(null);
                                    
                                    // Force reload universe data from Git
                                    const result = await universeBackendBridge.switchActiveUniverse(activeUniverse.slug, { saveCurrent: false });
                                    setSyncStatus({ type: 'success', status: 'Universe data reloaded from Git' });
                                    setTimeout(() => setSyncStatus(null), 3000);
                                  } catch (error) {
                                    console.error('[GitNativeFederation] Reload failed:', error);
                                    setError(`Reload failed: ${error.message}`);
                                  } finally {
                                    setIsLoading(false);
                                  }
                                }}
                                style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  border: '1px solid #260000',
                                  backgroundColor: 'transparent',
                                  color: '#260000',
                                  cursor: 'pointer',
                                  fontSize: '0.7rem',
                                  fontWeight: 600
                                }}
                              >
                                Reload from Git
                              </button>
                            </div>

                            {discoveryError && (
                              <div style={{ fontSize: '0.7rem', color: '#7A0000' }}>
                                {discoveryError}
                              </div>
                            )}

                            {discoveryItems.length > 0 && (
                              <div style={{
                                border: '1px solid #979090',
                                borderRadius: '4px',
                                maxHeight: '160px',
                                overflowY: 'auto',
                                backgroundColor: '#bdb5b5'
                              }}>
                                {discoveryItems.map((item) => (
                                  <div key={item.slug || item.universeName || item.path}
                                    style={{
                                      padding: '6px 8px',
                                      borderBottom: '1px solid #979090',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      gap: '8px',
                                      alignItems: 'center'
                                    }}
                                  >
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                      <div style={{ fontSize: '0.78rem', fontWeight: 600 }}>
                                        {item.name || item.universeName || item.slug || 'Discovered universe'}
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: '#555' }}>
                                        {item.path || item.location || 'Unknown path'}
                                      </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                                      <button
                                        onClick={() => handleLinkUniverse(item, { user: source.user, repo: source.repo, type: 'github', authMethod: dataAuthMethod || 'oauth' })}
                                        style={{
                                          padding: '4px 6px',
                                          borderRadius: '4px',
                                          border: '1px solid #260000',
                                          backgroundColor: 'transparent',
                                          color: '#260000',
                                          cursor: 'pointer',
                                          fontSize: '0.68rem',
                                          fontWeight: 600
                                        }}
                                      >
                                        Link
                                      </button>
                                      {item.slug && (
                                        <button
                                          onClick={() => handleDeleteDiscoveredUniverse(item.slug)}
                                          style={{
                                            padding: '4px 6px',
                                            borderRadius: '4px',
                                            border: '1px solid #7A0000',
                                            backgroundColor: 'rgba(122,0,0,0.08)',
                                            color: '#7A0000',
                                            cursor: 'pointer',
                                            fontSize: '0.68rem',
                                            fontWeight: 600
                                          }}
                                        >
                                          Delete
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()
                ))
              )}
            </div>
          </>
        ) : (
          <div style={{
            padding: '12px',
            backgroundColor: '#bdb5b5',
            border: '1px dashed #979090',
            borderRadius: '6px',
            fontSize: '0.8rem',
            color: '#555'
          }}>
            Select or create a universe first to configure its repositories.
          </div>
        )}
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

      {showRepositoryManager && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}
          onClick={handleRepositoryManagerClose}
        >
          <div
            style={{
              width: 'min(90vw, 760px)',
              height: 'min(90vh, 600px)',
              backgroundColor: '#bdb5b5',
              border: '1px solid #260000',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 12px 28px rgba(0,0,0,0.25)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 18px',
              borderBottom: '1px solid #260000'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '1rem', color: '#260000' }}>Browse Git Repositories</div>
              <button
                onClick={handleRepositoryManagerClose}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#260000',
                  fontSize: '1.2rem',
                  cursor: 'pointer'
                }}
                aria-label="Close repository manager"
              >
                ×
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <RepositoryManager onSelectRepository={handleRepositoryManagerSelect} />
            </div>
          </div>
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
