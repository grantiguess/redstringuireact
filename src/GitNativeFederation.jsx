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
  };

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
    setTimeout(() => setSyncStatus(null), 3000);
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
    const linkedRepo = { type: 'github', user: source.user, repo: source.repo };
    const gitRepoConfig = {
      ...activeUniverse.gitRepo,
      enabled: true,
      linkedRepo,
      universeFolder: activeUniverse.gitRepo?.universeFolder || `universes/${activeUniverse.slug}`,
      universeFile: activeUniverse.gitRepo?.universeFile || `${activeUniverse.slug}.redstring`
    };

    await applyActiveUniverseUpdate({ gitRepo: gitRepoConfig });
    setSyncStatus({ type: 'success', status: `Primary source set to @${source.user}/${source.repo}` });
    setTimeout(() => setSyncStatus(null), 3000);
  }, [activeUniverse, applyActiveUniverseUpdate]);

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

                  {/* Data Sources */}
                  <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #979090', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>Data Sources</div>
                      <button
                        onClick={handleAddGitSource}
                        style={{ padding: '4px 8px', background: 'transparent', color: '#260000', border: '1px dashed #260000', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Plus size={12} /> Add Git Repo
                      </button>
                    </div>

                    {(activeUniverse?.sources && activeUniverse.sources.length > 0) ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {activeUniverse.sources.map((source, index) => {
                          const isGitSource = source.type === 'github';
                          const isPrimaryGitSource = isGitSource && activeUniverse?.gitRepo?.linkedRepo &&
                            activeUniverse.gitRepo.linkedRepo.user?.toLowerCase() === source.user?.toLowerCase() &&
                            activeUniverse.gitRepo.linkedRepo.repo?.toLowerCase() === source.repo?.toLowerCase();
                          const repoKey = isGitSource && source.user && source.repo ? `${source.user}/${source.repo}` : null;
                          const repoItems = repoKey ? (repoUniverseLists[repoKey]?.items || []) : [];
                          const repoLoading = repoKey ? repoUniverseLists[repoKey]?.loading : false;

                          return (
                            <div
                              key={source.id || `${source.type}-${source.user || source.name}-${index}`}
                              style={{
                                background: '#EFE8E5',
                                border: isPrimaryGitSource ? '2px solid #260000' : '1px solid #979090',
                                borderRadius: '6px',
                                padding: '8px',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px'
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isSlim ? 'flex-start' : 'center', flexDirection: isSlim ? 'column' : 'row', gap: isSlim ? '6px' : '0px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  {isGitSource && <Github size={14} />}
                                  <div>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#260000' }}>
                                      {isGitSource && source.user && source.repo ? `@${source.user}/${source.repo}` : (source.name || source.type)}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#666' }}>
                                      {isPrimaryGitSource ? 'Primary Git Repository' : source.type}
                                    </div>
                                  </div>
                                </div>
                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                  {isGitSource && source.user && source.repo && (
                                    <button
                                      onClick={() => handleOpenGitHubRepo(source)}
                                      style={{ padding: '4px 6px', background: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <ExternalLink size={12} /> Open
                                    </button>
                                  )}
                                  {isGitSource && !isPrimaryGitSource && source.user && source.repo && (
                                    <button
                                      onClick={() => handleSetPrimaryGitSource(source)}
                                      style={{ padding: '4px 6px', background: '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                    >
                                      Set Primary
                                    </button>
                                  )}
                                  {isGitSource && repoKey && (
                                    <button
                                      onClick={() => refreshRepoUniversesList(source.user, source.repo)}
                                      style={{ padding: '4px 6px', background: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    >
                                      <RefreshCw size={12} /> Refresh
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRemoveSource(source)}
                                    style={{ padding: '4px 6px', background: 'transparent', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                  >
                                    <Trash2 size={12} /> Remove
                                  </button>
                                </div>
                              </div>

                              {isGitSource && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {!isPrimaryGitSource && (
                                    <RepositoryDropdown
                                      selectedRepository={source.user && source.repo ? { name: source.repo, owner: { login: source.user } } : null}
                                      onSelectRepository={(repo) => handleUpdateGitSourceRepo(source, repo)}
                                      placeholder={hasOAuthForBrowsing ? 'Select repository' : 'OAuth required'}
                                      disabled={!hasOAuthForBrowsing}
                                    />
                                  )}

                                  {isPrimaryGitSource && repoKey && (
                                    <div style={{ borderTop: '1px dashed #979090', paddingTop: '6px' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '0.75rem', color: '#666' }}>Universes in Repository</div>
                                        <button
                                          onClick={() => refreshRepoUniversesList(source.user, source.repo)}
                                          style={{ padding: '3px 6px', background: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                        >
                                          Refresh
                                        </button>
                                      </div>
                                      <div style={{ marginTop: '6px', border: '1px solid #979090', borderRadius: '4px', maxHeight: '180px', overflowY: 'auto' }}>
                                        {repoLoading ? (
                                          <div style={{ padding: '6px', fontSize: '0.75rem', color: '#666' }}>Loading…</div>
                                        ) : repoItems.length === 0 ? (
                                          <div style={{ padding: '6px', fontSize: '0.75rem', color: '#666' }}>No universes discovered in this repository</div>
                                        ) : (
                                          repoItems.map((uitem) => {
                                            const existingUniverse = universes.find(u => u.slug === uitem.slug);
                                            const isLinked = existingUniverse && existingUniverse.slug === activeUniverse.slug;
                                            return (
                                              <div key={`${uitem.slug}-${uitem.fileName}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px', borderBottom: '1px dashed #ddd' }}>
                                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                  <span style={{ fontWeight: 600, fontSize: '0.8rem' }}>{uitem.name || uitem.slug}</span>
                                                  <span style={{ fontSize: '0.7rem', color: '#666' }}>{uitem.metadata?.nodeCount || 0} nodes</span>
                                                </div>
                                                <div style={{ display: 'flex', gap: '4px' }}>
                                                  {!isLinked && (
                                                    <button
                                                      onClick={() => handleLinkUniverse(uitem, { type: 'github', user: source.user, repo: source.repo, authMethod: dataAuthMethod || 'oauth' })}
                                                      style={{ padding: '3px 6px', background: '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                                    >
                                                      Link
                                                    </button>
                                                  )}
                                                  {existingUniverse && (
                                                    <button
                                                      onClick={() => handleDeleteDiscoveredUniverse(uitem.slug)}
                                                      style={{ padding: '3px 6px', background: 'transparent', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer' }}
                                                    >
                                                      Delete
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.75rem', color: '#666' }}>No data sources configured for this universe.</div>
                    )}
                  </div>

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
