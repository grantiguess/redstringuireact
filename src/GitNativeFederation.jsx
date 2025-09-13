/**
 * Git-Native Federation Component
 * Protocol implementation with hot-swappable Git providers
 * Provides real-time responsiveness, true decentralization, and distributed resilience
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  GitBranch, 
  GitCommit, 
  GitPullRequest,
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
  GitFork,
  GitCompare,
  GitPullRequestClosed,
  GitBranchPlus,
  GitCommitHorizontal,
  GitGraph,
  Info,
  Github,
  Key,
  Edit3,
  Save,
  Trash2
} from 'lucide-react';
import { SemanticProviderFactory } from './services/gitNativeProvider.js';
import { bridgeFetch, oauthFetch } from './services/bridgeConfig.js';
import { SemanticSyncEngine } from './services/semanticSyncEngine.js';
import { SemanticFederation } from './services/semanticFederation.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from './services/gitSyncEngine.js';
import useGraphStore from './store/graphStore.jsx';
import { importFromRedstring, downloadRedstringFile, exportToRedstring } from './formats/redstringFormat.js';
import { persistentAuth } from './services/persistentAuth.js';
import RepositoryManager from './components/repositories/RepositoryManager.jsx';
import RepositoryDropdown from './components/repositories/RepositoryDropdown.jsx';
import { getFileStatus } from './store/fileStorage.js';
import * as fileStorageModule from './store/fileStorage.js';
import universeManager from './services/universeManager.js';
import githubRateLimiter from './services/githubRateLimiter.js';
import startupCoordinator from './services/startupCoordinator.js';
// Note: Using inline device detection to avoid circular dependencies during React initialization
// The external device detection utilities are available but not used during component init

const GitNativeFederation = ({ isVisible = true, isInteractive = true }) => {
  // Use simple device detection to avoid circular dependencies during React initialization
  const [deviceConfig] = useState(() => {
    try {
      // Simple, safe device detection without external dependencies
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const screenWidth = window.screen?.width || 1920;
      const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
      const isTablet = /ipad|android(?!.*mobile)|kindle|silk|playbook|bb10/i.test(navigator.userAgent.toLowerCase()) || 
                       (/macintosh/i.test(navigator.userAgent.toLowerCase()) && isTouch);
      const shouldUseGitOnly = isMobile || isTablet || !('showSaveFilePicker' in window);
      
      return { 
        gitOnlyMode: shouldUseGitOnly, 
        sourceOfTruth: shouldUseGitOnly ? 'git' : 'local', 
        touchOptimizedUI: isTouch,
        enableLocalFileStorage: !shouldUseGitOnly,
        deviceInfo: { isMobile, isTablet, isTouchDevice: isTouch, type: isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop', screenWidth }
      };
    } catch (error) {
      console.warn('[GitNativeFederation] Device config initialization failed, using safe defaults:', error);
      return { 
        gitOnlyMode: false, 
        sourceOfTruth: 'local', 
        touchOptimizedUI: false, 
        enableLocalFileStorage: true,
        deviceInfo: { isMobile: false, isTablet: false, isTouchDevice: false, type: 'desktop', screenWidth: 1920 }
      };
    }
  });
  
  const [deviceInfo] = useState(() => deviceConfig.deviceInfo);
  
  const [deviceCapabilityMessage] = useState(() => {
    if (deviceConfig.gitOnlyMode) {
      if (deviceInfo.isMobile) {
        return { type: 'info', title: 'Mobile-Optimized Experience', message: 'RedString is running in Git-Only mode for the best mobile experience. Your universes will sync directly with Git repositories.', icon: '📱' };
      } else if (deviceInfo.isTablet) {
        return { type: 'info', title: 'Tablet-Optimized Experience', message: 'RedString is optimized for tablet use with Git-based universe management and touch-friendly interface.', icon: '📲' };
      } else {
        return { type: 'info', title: 'Git-Only Mode Active', message: 'File system access is limited on this device. RedString will work directly with Git repositories.', icon: '🔄' };
      }
    }
    return { type: 'success', title: 'Full Desktop Experience', message: 'All RedString features are available including local file management and Git synchronization.', icon: '💻' };
  });
  
  const [currentProvider, setCurrentProvider] = useState(null);
  const [syncEngine, setSyncEngine] = useState(null);
  const [federation, setFederation] = useState(null);
  const [providerConfig, setProviderConfig] = useState({
    type: 'github',
    user: '',
    repo: '',
    token: '',
    semanticPath: 'schema' // Changed from 'semantic' to 'schema'
  });
  const [giteaConfig, setGiteaConfig] = useState({
    type: 'gitea',
    endpoint: '',
    user: '',
    repo: '',
    token: '',
    semanticPath: 'schema' // Changed from 'knowledge' to 'schema'
  });
  const [availableProviders] = useState(SemanticProviderFactory.getAvailableProviders());
  const [selectedProvider, setSelectedProvider] = useState('github');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);
  const [universeSlug, setUniverseSlug] = useState('universe');
  const [federationStats, setFederationStats] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [newSubscriptionUrl, setNewSubscriptionUrl] = useState('');
  const [isAddingSubscription, setIsAddingSubscription] = useState(false);
  const [authMethod, setAuthMethod] = useState('github-app'); // GitHub App only
  const [userRepositories, setUserRepositories] = useState([]);
  const [showRepositorySelector, setShowRepositorySelector] = useState(false);
  const [pendingOAuth, setPendingOAuth] = useState(null); // { username, accessToken, repositories, userData }
  const [githubAppInstallation, setGithubAppInstallation] = useState(null); // { installationId, repositories, userData }
  const [authStatus, setAuthStatus] = useState(persistentAuth.getAuthStatus());
  const [connectionHealth, setConnectionHealth] = useState('unknown'); // 'healthy', 'degraded', 'failed', 'unknown'
  const [showCompleteInstallation, setShowCompleteInstallation] = useState(false);
  const [showRepositoryManager, setShowRepositoryManager] = useState(false);
  const [gitOnlyMode, setGitOnlyMode] = useState(deviceConfig.gitOnlyMode); // Auto-enable for mobile devices
  const containerRef = useRef(null);
  const [isSlim, setIsSlim] = useState(false);
  const [localFileHandles, setLocalFileHandles] = useState({}); // { [universeSlug]: FileSystemFileHandle }
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSaveTime, setLastSaveTime] = useState(Date.now());
  
  // Use UniverseManager for universe state
  const [universes, setUniverses] = useState(universeManager.getAllUniverses());
  const [activeUniverseSlug, setActiveUniverseSlug] = useState(universeManager.activeUniverseSlug);

  // Subscribe to UniverseManager changes
  useEffect(() => {
    const unsubscribe = universeManager.onStatusChange((status) => {
      setSyncStatus(status);
      // Refresh local state when universes change
      setUniverses(universeManager.getAllUniverses());
      setActiveUniverseSlug(universeManager.activeUniverseSlug);
    });
    
    return unsubscribe;
  }, []);

  // Helpers for universes & storage (now using UniverseManager)
  const getActiveUniverse = () => universeManager.getActiveUniverse();
  const updateActiveUniverse = (updates) => {
    try {
      universeManager.updateUniverse(activeUniverseSlug, updates);
      setUniverses(universeManager.getAllUniverses()); // Refresh local state
    } catch (error) {
      console.error('[GitNativeFederation] Failed to update active universe:', error);
    }
  };
  const addUniverse = () => {
    try {
      universeManager.createUniverse(`Universe ${universes.length + 1}`, {
        sourceOfTruth: 'git', // Default to git
        schemaPath: providerConfig.semanticPath || 'schema',
        enableGit: false, // Will be enabled when linked
        enableLocal: true
      });
      setUniverses(universeManager.getAllUniverses());
    } catch (error) {
      console.error('[GitNativeFederation] Failed to create universe:', error);
    }
  };
  const removeUniverse = (slug) => {
    if (universes.length <= 1) return;
    const confirmed = window.confirm('Remove this universe? This does not delete any GitHub data.');
    if (!confirmed) return;
    
    try {
      universeManager.deleteUniverse(slug);
      setUniverses(universeManager.getAllUniverses());
      setActiveUniverseSlug(universeManager.activeUniverseSlug);
      setUniverseSlug(universeManager.activeUniverseSlug);
    } catch (error) {
      console.error('[GitNativeFederation] Failed to remove universe:', error);
    }
  };
  const switchActiveUniverse = async (slug) => {
    if (slug === activeUniverseSlug) return;
    const confirmed = window.confirm('Save current universe before switching?');
    
    try {
      const result = await universeManager.switchActiveUniverse(slug, { saveCurrent: confirmed });
      if (result.storeState) {
        // Load the new universe data into the store
        const loadUniverseFromFile = useGraphStore.getState().loadUniverseFromFile;
        loadUniverseFromFile(result.storeState);
      }
      
      // Update local state
      setActiveUniverseSlug(universeManager.activeUniverseSlug);
      setUniverseSlug(universeManager.activeUniverseSlug);
      setUniverses(universeManager.getAllUniverses());
      
      setTimeout(() => {
        attemptConnectUniverseRepo();
      }, 0);
    } catch (error) {
      console.error('[GitNativeFederation] Failed to switch universe:', error);
      setSyncStatus({ type: 'error', status: `Failed to switch universe: ${error.message}` });
    }
  };
  const sanitizeFilename = (name) => {
    const base = String(name || '').trim().replace(/[^a-zA-Z0-9-_\.\s]/g, '').replace(/\s+/g, '-');
    return base || 'universe';
  };
  const renameActiveUniverse = (newName) => {
    const prev = getActiveUniverse();
    updateActiveUniverse({ name: newName });
    try {
      // If the local path looks like a simple filename or matches previous name, update it to follow the universe name
      const dirPlusFile = (prev?.localPath || `${activeUniverseSlug}.redstring`);
      const parts = dirPlusFile.split('/');
      const oldFile = parts[parts.length - 1] || '';
      const newFile = `${sanitizeFilename(newName)}.redstring`;
      // If old file looked like the previous universe naming or is default 'universe.redstring', replace it
      if (/\.redstring$/i.test(oldFile)) {
        const oldBase = oldFile.replace(/\.redstring$/i, '');
        if (oldBase === sanitizeFilename(prev?.name) || /^(universe|default)$/i.test(oldBase)) {
          parts[parts.length - 1] = newFile;
          const updatedPath = parts.join('/');
          updateActiveUniverse({ localPath: updatedPath });
          // Clear saved handle to avoid writing to the old file name silently
          setLocalFileHandles((h) => ({ ...h, [activeUniverseSlug]: undefined }));
          setSyncStatus({ type: 'info', status: 'Universe renamed • choose a new local file to keep names aligned' });
          setTimeout(() => setSyncStatus(null), 3500);
        }
      }
    } catch {}
  };
  const setActiveUniverseSchema = (newSchema) => {
    updateActiveUniverse({ 
      gitRepo: { 
        ...getActiveUniverse()?.gitRepo, 
        schemaPath: newSchema || 'schema' 
      } 
    });
    setProviderConfig(prev => ({ ...prev, semanticPath: newSchema || 'schema' }));
  };
  const setActiveUniverseStorageMode = (mode) => {
    // Convert storage mode to new dual-slot system
    const updates = {};
    if (mode === 'local') {
      updates.localFile = { ...getActiveUniverse()?.localFile, enabled: true };
      updates.gitRepo = { ...getActiveUniverse()?.gitRepo, enabled: false };
    } else if (mode === 'github') {
      updates.localFile = { ...getActiveUniverse()?.localFile, enabled: false };
      updates.gitRepo = { ...getActiveUniverse()?.gitRepo, enabled: true };
    } else if (mode === 'mixed') {
      updates.localFile = { ...getActiveUniverse()?.localFile, enabled: true };
      updates.gitRepo = { ...getActiveUniverse()?.gitRepo, enabled: true };
    }
    updateActiveUniverse(updates);
  };
  const setActiveUniverseSourceOfTruth = (val) => updateActiveUniverse({ sourceOfTruth: val });

  const handleLinkRepositoryToActiveUniverse = (repo) => {
    const owner = repo?.owner?.login || providerConfig.user || authStatus.userData?.login || 'user';
    const name = repo?.name || providerConfig.repo || '';
    
    // Update universe with linked repository
    const activeUniverse = getActiveUniverse();
    updateActiveUniverse({ 
      gitRepo: { 
        enabled: true,
        linkedRepo: { type: 'github', user: owner, repo: name },
        schemaPath: providerConfig.semanticPath || 'schema',
        universeFolder: `universes/${activeUniverseSlug}`
      }
    });
    
    // Auto-add as a source if not already present
    const existingSources = activeUniverse?.sources || [];
    const alreadyExists = existingSources.some(src => 
      src.type === 'github' && src.user === owner && src.repo === name
    );
    
    if (!alreadyExists) {
      const newSource = {
        id: generateSourceId(),
        type: 'github',
        enabled: true,
        name: `@${owner}/${name}`,
        user: owner,
        repo: name,
        schemaPath: providerConfig.semanticPath || 'schema'
      };
      
      // Add the source to the universe
      updateActiveUniverse({
        sources: [...existingSources, newSource]
      });
      
      setSyncStatus({
        type: 'success',
        status: `Linked repository and added as source: @${owner}/${name}`
      });
    } else {
      setSyncStatus({
        type: 'success',
        status: `Linked repository: @${owner}/${name}`
      });
    }
    
    setTimeout(() => setSyncStatus(null), 3000);
    
    // proceed with existing connect flow
    handleRepositoryManagerSelect(repo);
  };

  const attemptConnectUniverseRepo = async () => {
    try {
      const u = getActiveUniverse();
      if (!u?.gitRepo?.linkedRepo) {
        // If no linked repo but we have a current provider, auto-link it
        if (currentProvider && providerConfig.user && providerConfig.repo) {
          updateActiveUniverse({ 
            gitRepo: {
              enabled: true,
              linkedRepo: { 
                type: 'github', 
                user: providerConfig.user, 
                repo: providerConfig.repo 
              },
              schemaPath: u.gitRepo?.schemaPath || 'schema',
              universeFolder: `universes/${activeUniverseSlug}`
            }
          });
        }
        return;
      }
      const config = {
        type: 'github',
        user: u.gitRepo.linkedRepo.user,
        repo: u.gitRepo.linkedRepo.repo,
        token: undefined,
        authMethod: 'oauth',
        semanticPath: u.gitRepo.schemaPath || 'schema'
      };
      try {
        const token = await persistentAuth.getAccessToken();
        if (token) config.token = token;
      } catch {}
      const provider = SemanticProviderFactory.createProvider(config);
      const ok = await provider.isAvailable();
      if (ok) {
        setProviderConfig(config);
        setCurrentProvider(provider);
        setIsConnected(true);
        setGitConnection({ ...config, token: undefined });
      } else {
        setSyncStatus({ type: 'warning', status: 'Linked repository not accessible yet. Complete GitHub auth.' });
      }
    } catch (e) {
      console.warn('[GitNativeFederation] attemptConnectUniverseRepo failed:', e);
    }
  };

  // File System Access helpers (mobile-aware with graceful fallbacks)
  const pickLocalFileForActiveUniverse = async () => {
    // Skip File System API operations on mobile/tablet devices
    if (!deviceConfig.enableLocalFileStorage) {
      setSyncStatus({
        type: 'info',
        status: deviceInfo.isMobile ? 
          'File management optimized for mobile - use Git repositories for storage' :
          'Local file access not available on this device - using Git-only mode'
      });
      setTimeout(() => setSyncStatus(null), 4000);
      return;
    }
    
    try {
      const u = getActiveUniverse();
      const universeName = sanitizeFilename(u?.name || activeUniverseSlug);
      // Prefer showSaveFilePicker to ensure write access
      if (window.showSaveFilePicker) {
        const suggestedName = `${universeName}.redstring`;
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedName,
          types: [{ description: 'RedString', accept: { 'application/json': ['.redstring'] } }]
        });
        setLocalFileHandles(prev => ({ ...prev, [activeUniverseSlug]: handle }));
        // Update display path to just the chosen filename
        updateActiveUniverse({ localPath: handle.name || suggestedName });
      } else if (window.showOpenFilePicker) {
        const [handle] = await window.showOpenFilePicker({ multiple: false, types: [{ description: 'RedString', accept: { 'application/json': ['.redstring'] } }] });
        setLocalFileHandles(prev => ({ ...prev, [activeUniverseSlug]: handle }));
        updateActiveUniverse({ localPath: handle.name || `${universeName}.redstring` });
      } else {
        // Fallback: prompt user to change the filename text; browser cannot select real path
        const name = prompt('Enter a filename for your .redstring (download will use this):', `${universeName}.redstring`);
        if (name) updateActiveUniverse({ localPath: name });
      }
    } catch (e) {
      console.warn('[GitNativeFederation] pickLocalFileForActiveUniverse failed:', e);
    }
  };

  const saveActiveUniverseToLocalHandle = async () => {
    // Skip File System API operations on mobile/tablet devices
    if (!deviceConfig.enableLocalFileStorage) {
      // On mobile, trigger download instead of file system save
      const current = useGraphStore.getState();
      const u = getActiveUniverse();
      const fileName = `${sanitizeFilename(u?.name || activeUniverseSlug)}.redstring`;
      downloadRedstringFile(current, fileName);
      
      setSyncStatus({
        type: 'success',
        status: `Downloaded ${fileName} to your device`
      });
      setTimeout(() => setSyncStatus(null), 3000);
      return true;
    }
    
    const handle = localFileHandles[activeUniverseSlug];
    if (!handle) return false;
    try {
      const current = useGraphStore.getState();
      const data = exportToRedstring(current);
      const json = JSON.stringify(data, null, 2);
      const writable = await handle.createWritable();
      await writable.write(json);
      await writable.close();
      return true;
    } catch (e) {
      console.warn('[GitNativeFederation] saveActiveUniverseToLocalHandle failed:', e);
      return false;
    }
  };

  // Sources (per active universe)
  const generateSourceId = () => `src_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const addSourceToActiveUniverse = (type) => {
    const u = getActiveUniverse();
    if (!u) return;
    const newSource = { id: generateSourceId(), type, enabled: false, name: '', schemaPath: u.schemaPath || 'schema' };
    if (type === 'github') Object.assign(newSource, { user: '', repo: '' });
    if (type === 'gitea') Object.assign(newSource, { endpoint: '', user: '', repo: '' });
    if (type === 'url') Object.assign(newSource, { urls: [''], behavior: 'cache' });
    if (type === 'local') Object.assign(newSource, { fileName: `${activeUniverseSlug}.redstring` });
    const currentUniverse = getActiveUniverse();
    updateActiveUniverse({ sources: [...(currentUniverse?.sources || []), newSource] });
  };

  const updateSourceInActiveUniverse = (id, updates) => {
    const currentUniverse = getActiveUniverse();
    const updatedSources = (currentUniverse?.sources || []).map(s => 
      s.id === id ? { ...s, ...updates } : s
    );
    updateActiveUniverse({ sources: updatedSources });
  };
  const removeSourceFromActiveUniverse = (id) => {
    const u = getActiveUniverse();
    const src = (u?.sources || []).find(s => s.id === id);
    if (src && src.type === 'url' && src.enabled) {
      try {
        const url = (src.urls && src.urls[0]) || '';
        if (url && federation) federation.unsubscribeFromSpace(url);
      } catch {}
    }
    
    const filteredSources = (u?.sources || []).filter(s => s.id !== id);
    updateActiveUniverse({ sources: filteredSources });
  };
  const toggleSourceEnabled = async (src) => {
    const newEnabled = !src.enabled;
    updateSourceInActiveUniverse(src.id, { enabled: newEnabled });
    try {
      if (src.type === 'url' && federation) {
        const url = (src.urls && src.urls[0]) || '';
        if (!url) return;
        if (newEnabled) {
          await federation.subscribeToSpace(url, { autoImport: true });
        } else {
          federation.unsubscribeFromSpace(url);
        }
      }
    } catch (e) {
      console.warn('[GitNativeFederation] toggleSourceEnabled failed:', e);
    }
  };

  const getSourceHealth = (src) => {
    if (!src?.enabled) return 'disabled';
    if (src.type === 'github') return (src.user && src.repo) ? 'healthy' : 'degraded';
    if (src.type === 'gitea') return (src.endpoint && src.user && src.repo) ? 'healthy' : 'degraded';
    if (src.type === 'url') return (src.urls && src.urls[0]) ? 'healthy' : 'degraded';
    if (src.type === 'local') return src.fileName ? 'healthy' : 'degraded';
    return 'degraded';
  };

  // Sync federation subscriptions into URL sources for the active universe
  useEffect(() => {
    try {
      if (!Array.isArray(subscriptions) || subscriptions.length === 0) return;
      const u = getActiveUniverse();
      if (!u) return;
      const currentUrls = new Set((u.sources || []).filter(s => s.type === 'url').flatMap(s => s.urls || []));
      let didAdd = false;
      subscriptions.forEach(sub => {
        const url = sub?.url || sub?.href || '';
        if (!url || currentUrls.has(url)) return;
        const newSrc = { id: generateSourceId(), type: 'url', enabled: true, name: sub?.name || 'External Source', urls: [url], behavior: 'cache', schemaPath: u.schemaPath || 'schema' };
        const activeUniverse = getActiveUniverse();
        updateActiveUniverse({ sources: [...(activeUniverse?.sources || []), newSrc] });
        didAdd = true;
      });
      if (didAdd) {
        setSyncStatus({ type: 'info', status: 'Discovered external sources have been added to this universe.' });
        setTimeout(() => setSyncStatus(null), 3000);
      }
    } catch (e) {
      // Non-fatal
    }
  }, [subscriptions, activeUniverseSlug]);
  
  // Computed authentication state
  const isAuthenticated = authStatus.isAuthenticated;
  // Get the actual RedString store
  const storeState = useGraphStore();
  const storeActions = useGraphStore.getState();
  
  // Get persistent Git connection state from store
  const gitConnection = useGraphStore(state => state.gitConnection);
  const gitSourceOfTruth = useGraphStore(state => state.gitSourceOfTruth);
  const setGitConnection = useGraphStore(state => state.setGitConnection);
  const clearGitConnection = useGraphStore(state => state.clearGitConnection);
  const setGitSyncEngineStore = useGraphStore(state => state.setGitSyncEngine);
  const setGitSourceOfTruth = useGraphStore(state => state.setGitSourceOfTruth);
  const storeGitSyncEngine = useGraphStore(state => state.gitSyncEngine);
  
  const [gitSyncEngine, setGitSyncEngine] = useState(null);
  const [sourceOfTruthMode, setSourceOfTruthMode] = useState(
    gitSourceOfTruth === 'git' ? SOURCE_OF_TRUTH.GIT : SOURCE_OF_TRUTH.LOCAL
  );

  // Adopt preloaded engine from store for instant readiness on mount/tab switch
  useEffect(() => {
    try {
      if (storeGitSyncEngine && !gitSyncEngine) {
        console.log('[GitNativeFederation] Adopting preloaded Git sync engine');
        setGitSyncEngine(storeGitSyncEngine);
        setGitSyncEngineStore(storeGitSyncEngine);
        
        // Ensure engine is registered with UniverseManager
        const activeUniverse = universeManager.getActiveUniverse();
        if (activeUniverse) {
          universeManager.setGitSyncEngine(activeUniverse.slug, storeGitSyncEngine);
        }
        
        const provider = storeGitSyncEngine.provider;
        if (provider) {
          setCurrentProvider(provider);
          setSelectedProvider('github');
          setProviderConfig(prev => ({
            ...prev,
            type: 'github',
            user: provider.user || prev.user,
            repo: provider.repo || prev.repo,
            semanticPath: provider.semanticPath || prev.semanticPath
          }));
          setIsConnected(true);
          setConnectionHealth('healthy');
        }
        
        // Ensure engine is running
        if (!storeGitSyncEngine.isRunning) {
          console.log('[GitNativeFederation] Preloaded engine not running, starting...');
          storeGitSyncEngine.start();
        }
        
        try {
          storeGitSyncEngine.onStatusChange((s) => setSyncStatus(s));
        } catch (_) {}
      }
    } catch (error) {
      console.error('[GitNativeFederation] Error adopting preloaded engine:', error);
    }
  }, [storeGitSyncEngine, gitSyncEngine, setGitSyncEngineStore]);

  // Set up persistent authentication event handlers
  useEffect(() => {
    console.log('[GitNativeFederation] Setting up persistent auth event handlers');
    
    const handleTokenStored = (data) => {
      console.log('[GitNativeFederation] Token stored event received');
      setAuthStatus(persistentAuth.getAuthStatus());
      setConnectionHealth('healthy');
    };
    
    const handleTokenValidated = (data) => {
      console.log('[GitNativeFederation] Token validated event received');
      setAuthStatus(persistentAuth.getAuthStatus());
      setConnectionHealth('healthy');
    };
    
    const handleAuthExpired = (error) => {
      console.warn('[GitNativeFederation] Authentication expired:', error);
      setAuthStatus(persistentAuth.getAuthStatus());
      setConnectionHealth('failed');
      setError('Authentication expired. Please reconnect to continue using Git features.');
    };
    
    const handleReAuthRequired = (data) => {
      console.warn('[GitNativeFederation] Re-authentication required:', data);
      setConnectionHealth('failed');
      setSyncStatus({
        type: 'error',
        status: `Re-authentication required: ${data.reason}`
      });
    };
    
    const handleHealthCheck = (healthData) => {
      console.log('[GitNativeFederation] Health check result:', healthData);
      setConnectionHealth(healthData.isValid ? 'healthy' : 'degraded');
      
      if (!healthData.isValid) {
        setSyncStatus({
          type: 'warning',
          status: 'Connection degraded - some features may be limited'
        });
      }
    };
    
    const handleAuthDegraded = (data) => {
      console.warn('[GitNativeFederation] Authentication degraded:', data);
      setConnectionHealth('degraded');
      setSyncStatus({
        type: 'warning',
        status: `Connection issues: ${data.reason}`
      });
    };
    
    // Register event listeners
    persistentAuth.on('tokenStored', handleTokenStored);
    persistentAuth.on('tokenValidated', handleTokenValidated);
    persistentAuth.on('authExpired', handleAuthExpired);
    persistentAuth.on('reAuthRequired', handleReAuthRequired);
    persistentAuth.on('healthCheck', handleHealthCheck);
    persistentAuth.on('authDegraded', handleAuthDegraded);
    
    // Cleanup function
    return () => {
      persistentAuth.off('tokenStored', handleTokenStored);
      persistentAuth.off('tokenValidated', handleTokenValidated);
      persistentAuth.off('authExpired', handleAuthExpired);
      persistentAuth.off('reAuthRequired', handleReAuthRequired);
      persistentAuth.off('healthCheck', handleHealthCheck);
      persistentAuth.off('authDegraded', handleAuthDegraded);
      console.log('[GitNativeFederation] Cleaned up persistent auth event handlers');
    };
  }, []);

  // Restore Git connection on mount with automatic recovery
  useEffect(() => {
    // Initialize Git-only mode from localStorage
    try {
      const savedGitOnly = localStorage.getItem('git_only_mode');
      if (savedGitOnly != null) {
        setGitOnlyMode(savedGitOnly === 'true');
      }
    } catch {}

    const restoreConnection = async () => {
      if (gitConnection && !currentProvider) {
        console.log('[GitNativeFederation] Restoring saved Git connection:', gitConnection);
        
        // Check if this is a demo connection - clear it and don't restore
        if (gitConnection.token === 'demo_token_secure' || gitConnection.user === 'demo-user') {
          console.log('[GitNativeFederation] Clearing saved demo connection');
          clearGitConnection();
          return;
        }
        
        // Show restoring status
        setSyncStatus({
          type: 'success',
          status: 'Restoring saved connection...'
        });
        
        // Restore provider config based on auth method
        let restoredConfig = gitConnection;
        try {
          if (gitConnection.authMethod === 'github-app' && gitConnection.installationId) {
            // For GitHub App connections, get a fresh installation token
            console.log('[GitNativeFederation] Restoring GitHub App connection, getting fresh installation token');
            try {
              const installationResponse = await oauthFetch('/api/github/app/installation-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ installation_id: gitConnection.installationId })
              });
              
              if (installationResponse.ok) {
                const installationData = await installationResponse.json();
                restoredConfig = { ...gitConnection, token: installationData.token };
                console.log('[GitNativeFederation] Using fresh GitHub App installation token for connection restoration');
              } else {
                console.warn('[GitNativeFederation] Failed to get GitHub App installation token, connection may fail');
              }
            } catch (appTokenError) {
              console.error('[GitNativeFederation] GitHub App token restoration failed:', appTokenError);
            }
          } else if (gitConnection.authMethod === 'oauth' || !gitConnection.authMethod) {
            // For OAuth connections, try to get token from persistent auth service
            const authStatus = persistentAuth.getAuthStatus();
            if (authStatus.isAuthenticated && !gitConnection.token) {
              const token = await persistentAuth.getAccessToken();
              if (token) {
                restoredConfig = { ...gitConnection, token };
                console.log('[GitNativeFederation] Using persistent OAuth token for connection restoration');
              }
            }
            
            // Fallback to session storage if persistent auth doesn't work
            if (!restoredConfig.token) {
              const sessionToken = sessionStorage.getItem('github_access_token');
              if (sessionToken) {
                restoredConfig = { ...gitConnection, token: sessionToken };
                console.log('[GitNativeFederation] Using session OAuth token as fallback for connection restoration');
              }
            }
          }
        } catch (error) {
          console.warn('[GitNativeFederation] Error during token restoration:', error);
        }
        
        try {
          // Test the connection before considering it restored
          const provider = SemanticProviderFactory.createProvider(restoredConfig);
          const isAvailable = await provider.isAvailable();
          
          if (isAvailable) {
            setProviderConfig(restoredConfig);
            setSelectedProvider(restoredConfig.type);
            setCurrentProvider(provider);
            setIsConnected(true);
            setConnectionHealth('healthy');
            
            console.log('[GitNativeFederation] Git connection restored and verified successfully');
            
            // Clear the status after 3 seconds
            setTimeout(() => {
              setSyncStatus(null);
            }, 3000);
          } else {
            console.warn('[GitNativeFederation] Restored connection failed availability test');
            setConnectionHealth('failed');
            setSyncStatus({
              type: 'warning',
              status: 'Connection restored but needs re-authentication'
            });
            
            // Try to handle authentication issues automatically
            if (gitConnection.authMethod === 'oauth') {
              console.log('[GitNativeFederation] Attempting automatic token validation for OAuth connection');
              try {
                await persistentAuth.refreshAccessToken();
                // If successful, retry the connection
                const retryProvider = SemanticProviderFactory.createProvider(restoredConfig);
                const retryAvailable = await retryProvider.isAvailable();
                
                if (retryAvailable) {
                  setCurrentProvider(retryProvider);
                  setIsConnected(true);
                  setConnectionHealth('healthy');
                  console.log('[GitNativeFederation] Connection recovered after token validation');
                }
              } catch (authError) {
                console.error('[GitNativeFederation] Automatic token validation failed:', authError);
                setSyncStatus({
                  type: 'error',
                  status: 'Authentication expired - please reconnect'
                });
              }
            }
          }
        } catch (connectionError) {
          console.error('[GitNativeFederation] Connection restoration failed:', connectionError);
          setConnectionHealth('failed');
          setSyncStatus({
            type: 'error',
            status: `Connection failed: ${connectionError.message}`
          });
        }
      }
    };
    
    restoreConnection();
  }, [gitConnection, currentProvider, clearGitConnection]);

  // Persist Git-only mode
  useEffect(() => {
    try {
      localStorage.setItem('git_only_mode', gitOnlyMode ? 'true' : 'false');
    } catch {}
  }, [gitOnlyMode]);

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
    // Initial
    try { setIsSlim((el.clientWidth || 0) < 520); } catch {}
    return () => ro.disconnect();
  }, []);

  // Auto-link current provider to active universe when provider connects
  useEffect(() => {
    if (currentProvider && providerConfig.user && providerConfig.repo) {
      const activeUniverse = getActiveUniverse();
      if (!activeUniverse?.gitRepo?.linkedRepo) {
        console.log('[GitNativeFederation] Auto-linking current provider to active universe');
        updateActiveUniverse({ 
          gitRepo: {
            enabled: true,
            linkedRepo: { 
              type: 'github', 
              user: providerConfig.user, 
              repo: providerConfig.repo 
            },
            schemaPath: activeUniverse?.gitRepo?.schemaPath || 'schema',
            universeFolder: `universes/${activeUniverseSlug}`
          }
        });
      }
    }
  }, [currentProvider, providerConfig.user, providerConfig.repo, activeUniverseSlug]);

  // Auto-connect source when universe has linked repository
  useEffect(() => {
    const activeUniverse = getActiveUniverse();
    if (activeUniverse?.gitRepo?.linkedRepo && !currentProvider) {
      const linkedRepo = activeUniverse.gitRepo.linkedRepo;
      console.log('[GitNativeFederation] Auto-connecting to linked repository:', linkedRepo);
      
      // Auto-add as a source if not already present
      const existingSources = activeUniverse?.sources || [];
      const alreadyExists = existingSources.some(src => 
        src.type === 'github' && src.user === linkedRepo.user && src.repo === linkedRepo.repo
      );
      
      if (!alreadyExists) {
        const newSource = {
          id: generateSourceId(),
          type: 'github',
          enabled: true,
          name: `@${linkedRepo.user}/${linkedRepo.repo}`,
          user: linkedRepo.user,
          repo: linkedRepo.repo,
          schemaPath: activeUniverse.gitRepo.schemaPath || 'schema'
        };
        
        updateActiveUniverse({
          sources: [...existingSources, newSource]
        });
        
        console.log('[GitNativeFederation] Auto-added linked repository as source');
      }
      
      // Attempt to connect to the repository
      attemptConnectUniverseRepo();
    }
  }, [activeUniverseSlug, currentProvider]);

  // Control Git sync engine pause state based on panel visibility
  // Only pause/resume, don't change any other state to ensure consistency
  useEffect(() => {
    if (gitSyncEngine) {
      if (isVisible && isInteractive) {
        gitSyncEngine.resume();
      } else {
        gitSyncEngine.pause();
      }
    }
    
    // Also control the store-level engine
    if (storeGitSyncEngine) {
      if (isVisible && isInteractive) {
        storeGitSyncEngine.resume();
      } else {
        storeGitSyncEngine.pause();
      }
    }
  }, [isVisible, isInteractive, gitSyncEngine, storeGitSyncEngine]);

  // Initialize sync engine, federation, and Git storage when provider changes
  // CRITICAL: Only create NEW engines, never recreate existing ones to prevent conflicts
  useEffect(() => {
    // FIRST: Check if we have an existing engine in the store - use it
    if (storeGitSyncEngine) {
      console.log('[GitNativeFederation] Using existing store engine, skipping initialization');
      return;
    }
    
    // SECOND: Check if UniverseManager already has an engine for this universe
    const existingEngine = universeManager.getGitSyncEngine(universeSlug);
    if (existingEngine && currentProvider) {
      console.log('[GitNativeFederation] Using existing UniverseManager engine, adopting it');
      setGitSyncEngine(existingEngine);
      setGitSyncEngineStore(existingEngine);
      
      // Set up status handler
      try {
        existingEngine.onStatusChange((s) => {
          setSyncStatus(s);
          if (s?.type === 'info') {
            setTimeout(() => setSyncStatus(null), 3000);
          }
        });
      } catch (_) {}
      
      return;
    }
    
    // THIRD: Only create new engine if we have provider and no existing engines
    if (currentProvider && !syncEngine && providerConfig.repo && !existingEngine) {
      console.log('[GitNativeFederation] Creating NEW sync engine for:', providerConfig.repo, 'universe:', universeSlug);
      
      const newSyncEngine = new SemanticSyncEngine(providerConfig);
      const newFederation = new SemanticFederation(newSyncEngine);
      
      setSyncEngine(newSyncEngine);
      setFederation(newFederation);
      
      // Subscribe to status updates
      newSyncEngine.onStatusChange((status) => {
        setSyncStatus(status);
      });
      
      // Initialize Git sync engine with current source of truth mode
      // Derive file base name from current connected universe file (if any)
      let fileBaseName = 'universe';
      try {
        const fileStatus = storeActions.getFileStatus?.();
        if (fileStatus?.fileName && fileStatus.fileName.endsWith('.redstring')) {
          fileBaseName = fileStatus.fileName.replace(/\.redstring$/i, '');
        }
      } catch {}
      
      // Check with startup coordinator if we're allowed to initialize
      const initializeEngine = async () => {
        const canInitialize = await startupCoordinator.requestEngineInitialization(universeSlug, 'GitNativeFederation');
        if (!canInitialize) {
          console.log('[GitNativeFederation] Startup coordinator blocked initialization - another component is handling it');
          return;
        }

        console.log(`[GitNativeFederation] Creating new GitSyncEngine for ${universeSlug}...`);
        const newGitSyncEngine = new GitSyncEngine(currentProvider, sourceOfTruthMode, universeSlug, fileBaseName, universeManager);
        
        // Check if the engine was successfully registered (not rejected as duplicate)
        if (!newGitSyncEngine.isRunning && universeManager.getGitSyncEngine(universeSlug) !== newGitSyncEngine) {
          console.log(`[GitNativeFederation] Engine creation was rejected as duplicate, using existing engine`);
          const existingEngine = universeManager.getGitSyncEngine(universeSlug);
          if (existingEngine) {
            setGitSyncEngine(existingEngine);
            setGitSyncEngineStore(existingEngine);
          }
          return;
        }

        // Store the new engine
        setGitSyncEngine(newGitSyncEngine);
        setGitSyncEngineStore(newGitSyncEngine);

        // Set up status handler
        newGitSyncEngine.onStatusChange((s) => {
          setSyncStatus(s);
          if (s?.type === 'info') {
            setTimeout(() => setSyncStatus(null), 3000);
          }
        });

        // Start the engine immediately to ensure it's running
        newGitSyncEngine.start();
      
        // Try to load existing data from Git (only for new engines)
        try {
          const redstringData = await newGitSyncEngine.loadFromGit();
        if (redstringData) {
          console.log('[GitNativeFederation] Loaded existing data from Git');
          
          // Check if we have existing local content (ignored in Git-only mode)
          const currentState = useGraphStore.getState();
          const hasLocalContentRaw = currentState.graphs.size > 0 || currentState.nodePrototypes.size > 0 || currentState.edges.size > 0;
          const hasLocalContent = gitOnlyMode ? false : hasLocalContentRaw;
          
          if (hasLocalContent) {
            console.log('[GitNativeFederation] Found existing local content, merging with Git data');
            
            // Use the merge function to decide what to do
            const mergedData = newGitSyncEngine.mergeWithLocalContent(redstringData, currentState);
            
            if (mergedData) {
              // Import the merged data (only if local is empty) and load into store
              const { storeState: importedState } = importFromRedstring(mergedData, storeActions);
              storeActions.loadUniverseFromFile(importedState);
              setSyncStatus({
                type: 'success',
                status: sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL 
                  ? 'Restored from Git backup (local was empty)' 
                  : 'Loaded from Git source'
              });
            } else {
              // Keep local content, don't import Git data
              setSyncStatus({
                type: 'success',
                status: sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL 
                  ? 'RedString content preserved • Syncing to Git' 
                  : 'Local content preserved • Syncing to Git'
              });
            }
          } else {
            console.log('[GitNativeFederation] No local content (or Git-only), loading Git data');
            
            // Import the data and load into the store
            const { storeState: importedState } = importFromRedstring(redstringData, storeActions);
            storeActions.loadUniverseFromFile(importedState);
            
            setSyncStatus({
              type: 'success',
              status: gitOnlyMode ? 'Loaded from Git (Git-only mode)' : 'Loaded existing data from repository'
            });
          }
        } else {
          console.log('[GitNativeFederation] No existing Git data found, preserving local content');
          
          // Check if we have existing local content to preserve (ignored in Git-only mode)
          const currentState = useGraphStore.getState();
          const hasLocalContent = gitOnlyMode ? false : (currentState.graphs.size > 0 || currentState.nodePrototypes.size > 0 || currentState.edges.size > 0);
          
          if (hasLocalContent) {
            console.log('[GitNativeFederation] Preserving existing RedString content, will sync to Git');
            setSyncStatus({
              type: 'success',
              status: sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL 
                ? 'RedString content preserved • Syncing to Git' 
                : 'Local content preserved • Syncing to Git'
            });
          } else {
            console.log('[GitNativeFederation] No existing content found, will create on first save');
            setSyncStatus({
              type: 'success',
              status: 'Connected to repository • Ready to save RedString data'
            });
          }
        }
        } catch (error) {
          console.error('[GitNativeFederation] Failed to load from Git:', error);
          setSyncStatus({
            type: 'error',
            status: 'Failed to load existing data'
          });
        }
      };
      
      // Execute the async initialization
      initializeEngine().catch(error => {
        console.error('[GitNativeFederation] Failed to initialize engine:', error);
      });
      
      // Load initial data for the semantic sync engine
      newSyncEngine.loadFromProvider();
    }
  }, [currentProvider, providerConfig.repo]); // REMOVED universeSlug and other changing deps to prevent recreation

  // Update federation stats periodically
  useEffect(() => {
    if (federation) {
      const updateStats = () => {
        setFederationStats(federation.getFederationStats());
        setSubscriptions(federation.getSubscriptions());
      };
      
      updateStats();
      const interval = setInterval(updateStats, 10000);
      return () => clearInterval(interval);
    }
  }, [federation]);

  // Initialize SaveCoordinator when federation components are available
  useEffect(() => {
    let saveCoordinator = null;
    
    const initializeSaveCoordinator = async () => {
      try {
        const SaveCoordinatorModule = await import('./services/SaveCoordinator.js');
        saveCoordinator = SaveCoordinatorModule.default;
        
        if (saveCoordinator && fileStorageModule && gitSyncEngine && universeManager) {
          saveCoordinator.initialize(fileStorageModule, gitSyncEngine, universeManager);
          
          // Listen for save status updates
          const unsubscribe = saveCoordinator.onStatusChange((status) => {
            if (status.type === 'success') {
              setHasUnsavedChanges(false);
              setLastSaveTime(Date.now());
            } else if (status.type === 'error') {
              console.error('[GitNativeFederation] Save error:', status.message);
            }
            setSyncStatus(status);
          });
          
          console.log('[GitNativeFederation] SaveCoordinator initialized');
          
          return unsubscribe;
        }
      } catch (error) {
        console.warn('[GitNativeFederation] SaveCoordinator initialization failed:', error);
      }
    };

    if (gitSyncEngine) {
      initializeSaveCoordinator();
    }

    return () => {
      // DO NOT disable SaveCoordinator when GitNativeFederation unmounts
      // The SaveCoordinator should remain active for background saving
      // even when the federation UI tab is not visible
      console.log('[GitNativeFederation] Component unmounting, but keeping SaveCoordinator active for background saves');
    };
  }, [gitSyncEngine, universeManager]);

  // Prevent page unload when there are unsaved changes and add Ctrl+S shortcut
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      // Only prevent if we have a connected Git sync engine and unsaved changes
      if (gitSyncEngine && hasUnsavedChanges && !isSaving) {
        const message = 'You have unsaved changes that will be lost. Are you sure you want to leave?';
        e.preventDefault();
        e.returnValue = message;
        return message;
      }
    };

    const handleUnload = async (e) => {
      // Try to save before unloading if possible
      if (gitSyncEngine && hasUnsavedChanges && !isSaving) {
        try {
          console.log('[GitNativeFederation] Attempting final save before page unload...');
          setIsSaving(true);
          await gitSyncEngine.forceCommit(storeState);
          console.log('[GitNativeFederation] Final save completed');
        } catch (error) {
          console.error('[GitNativeFederation] Final save failed:', error);
        }
      }
    };

    const handleKeyDown = (e) => {
      // Global Ctrl+S (or Cmd+S on Mac) to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (gitSyncEngine && !isSaving) {
          console.log('[GitNativeFederation] Ctrl+S pressed, triggering save...');
          handleSaveToGit();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('unload', handleUnload);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('unload', handleUnload);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [gitSyncEngine, hasUnsavedChanges, isSaving, storeState]);


  // Handle GitHub App installation callback and OAuth callback
  useEffect(() => {
    const handleGitHubCallbacks = async () => {
      console.log('[GitNativeFederation] GitHub callback handler started');
      console.log('[GitNativeFederation] Full URL:', window.location.href);
      console.log('[GitNativeFederation] URL Search params:', window.location.search);
      console.log('[GitNativeFederation] URL Hash:', window.location.hash);
      
      const urlParams = new URLSearchParams(window.location.search);
      // Some environments might place params in the hash fragment
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      
      // Check for OAuth callback from sessionStorage first (popup window flow)
      let oauthCode, oauthState, oauthError;
      const storedOAuthResult = sessionStorage.getItem('github_oauth_result');
      console.log('[GitNativeFederation] Checking sessionStorage for OAuth result:', storedOAuthResult);
      
      if (storedOAuthResult) {
        try {
          const oauthResult = JSON.parse(storedOAuthResult);
          oauthCode = oauthResult.code;
          oauthState = oauthResult.state;
          // Clean up the stored result
          sessionStorage.removeItem('github_oauth_result');
          console.log('[GitNativeFederation] Found OAuth result in sessionStorage:', oauthResult);
        } catch (error) {
          console.error('[GitNativeFederation] Failed to parse stored OAuth result:', error);
          sessionStorage.removeItem('github_oauth_result');
        }
      } else {
        console.log('[GitNativeFederation] No OAuth result found in sessionStorage');
      }
      
      // Check for GitHub App callback from sessionStorage
      const storedAppResult = sessionStorage.getItem('github_app_result');
      console.log('[GitNativeFederation] Checking sessionStorage for GitHub App result:', storedAppResult);
      
      let appInstallationIdFromStorage, appSetupActionFromStorage, appStateFromStorage;
      if (storedAppResult) {
        try {
          const appResult = JSON.parse(storedAppResult);
          appInstallationIdFromStorage = appResult.installation_id;
          appSetupActionFromStorage = appResult.setup_action;
          appStateFromStorage = appResult.state;
          // Clean up the stored result
          sessionStorage.removeItem('github_app_result');
          console.log('[GitNativeFederation] Found GitHub App result in sessionStorage:', appResult);
        } catch (error) {
          console.error('[GitNativeFederation] Failed to parse stored GitHub App result:', error);
          sessionStorage.removeItem('github_app_result');
        }
      } else {
        console.log('[GitNativeFederation] No GitHub App result found in sessionStorage');
      }
      
      // Fallback to URL parameters if no sessionStorage result
      if (!oauthCode) {
        oauthCode = urlParams.get('code') || hashParams.get('code');
        oauthState = urlParams.get('state') || hashParams.get('state');
        oauthError = urlParams.get('error') || hashParams.get('error');
      }
      
      // Check for GitHub App callback (sessionStorage first, then URL parameters)
      const appInstallationId = appInstallationIdFromStorage || urlParams.get('installation_id') || hashParams.get('installation_id');
      const appSetupAction = appSetupActionFromStorage || urlParams.get('setup_action') || hashParams.get('setup_action');
      const appState = appStateFromStorage || urlParams.get('state') || hashParams.get('state');
      
      console.log('[GitNativeFederation] GitHub App params detected:', {
        fromSessionStorage: {
          installationId: appInstallationIdFromStorage,
          setupAction: appSetupActionFromStorage,
          state: appStateFromStorage
        },
        fromURL: {
          installationId: urlParams.get('installation_id') || hashParams.get('installation_id'),
          setupAction: urlParams.get('setup_action') || hashParams.get('setup_action'),
          state: urlParams.get('state') || hashParams.get('state')
        },
        final: {
          installationId: appInstallationId,
          setupAction: appSetupAction,
          state: appState
        }
      });

      // Handle OAuth callback
      if (oauthCode && oauthState) {
        const expectedState = sessionStorage.getItem('github_oauth_state');
        const isPendingOAuth = sessionStorage.getItem('github_oauth_pending') === 'true';
        
        if (isPendingOAuth && oauthState === expectedState) {
          console.log('[GitNativeFederation] Processing OAuth callback...');
          
          try {
            setIsConnecting(true);
            setError(null);
            
            // Clean up session storage
            sessionStorage.removeItem('github_oauth_state');
            sessionStorage.removeItem('github_oauth_pending');
            
            // Exchange code for token - MUST use the same redirect_uri as authorization request
            const redirectUriForToken = window.location.origin + '/oauth/callback';
            console.log('[GitNativeFederation] Token exchange - redirect_uri (unencoded):', JSON.stringify(redirectUriForToken));
            console.log('[GitNativeFederation] Token exchange - redirect_uri (encoded):', JSON.stringify(encodeURIComponent(redirectUriForToken)));
            console.log('[GitNativeFederation] Token exchange - origin:', JSON.stringify(window.location.origin));
            console.log('[GitNativeFederation] Token exchange - full URL:', window.location.href);
            
            // GitHub OAuth spec requires redirect_uri in token exchange to match authorization request exactly
            // Since we encoded it in the authorization request, we should send the unencoded version here
            
            const tokenResp = await oauthFetch('/api/github/oauth/token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                code: oauthCode,
                state: oauthState,
                redirect_uri: redirectUriForToken
              })
            });
            
            if (!tokenResp.ok) {
              const errorText = await tokenResp.text();
              throw new Error(`Token exchange failed: ${tokenResp.status} ${errorText}`);
            }
            
            const tokenData = await tokenResp.json();
            
            console.log('[GitNativeFederation] OAuth token data received:', {
              hasToken: !!tokenData.access_token,
              scope: tokenData.scope,
              tokenType: tokenData.token_type
            });
            
            // Get user info and repositories
            const userResponse = await fetch('https://api.github.com/user', {
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            });
            
            if (!userResponse.ok) {
              throw new Error('Failed to fetch user info');
            }
            
            const userData = await userResponse.json();
            
            // Store token in persistent auth with user data
            await persistentAuth.storeTokens(tokenData, userData);
            
            // Get user repositories
            const reposResponse = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
              headers: {
                'Authorization': `Bearer ${tokenData.access_token}`,
                'Accept': 'application/vnd.github.v3+json'
              }
            });
            
            if (!reposResponse.ok) {
              throw new Error('Failed to fetch repositories');
            }
            
            const repos = await reposResponse.json();
            
            // Store OAuth data for repository operations only
            setPendingOAuth({
              username: userData.login,
              accessToken: tokenData.access_token,
              repositories: repos.map(repo => ({
                name: repo.name,
                full_name: repo.full_name,
                description: repo.description,
                private: repo.private,
                created_at: repo.created_at,
                updated_at: repo.updated_at
              })),
              userData
            });
            setUserRepositories(repos);
            
            // Don't automatically show repository selector - OAuth is only for repo creation
            // User will access repo management through the UI when needed
            console.log('[GitNativeFederation] OAuth completed - ready for repository operations');
            
            console.log('[GitNativeFederation] OAuth authentication successful:', userData.login, repos.length, 'repositories');
            
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
            
          } catch (err) {
            console.error('[GitNativeFederation] OAuth callback failed:', err);
            setError(`GitHub authentication failed: ${err.message}`);
            // Clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          } finally {
            setIsConnecting(false);
          }
          
          return; // Exit early, don't process GitHub App callback
        }
      }
      
      // Handle OAuth error
      if (oauthError) {
        console.error('[GitNativeFederation] OAuth error:', oauthError);
        setError(`GitHub authentication failed: ${oauthError}`);
        sessionStorage.removeItem('github_oauth_state');
        sessionStorage.removeItem('github_oauth_pending');
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      
      const installationId = appInstallationId;
      const setupAction = appSetupAction;
      const state = appState;
      
      console.log('[GitNativeFederation] GitHub App params:', { 
        installationId,
        setupAction,
        state,
        hasInstallationId: !!installationId,
        fullSearchString: window.location.search,
        hash: window.location.hash,
        allUrlParams: Object.fromEntries(urlParams.entries()),
        allHashParams: Object.fromEntries(hashParams.entries())
      });
      
      // Check if we're coming back from GitHub (even without params)
      const isGitHubReturn = document.referrer.includes('github.com') || 
                           sessionStorage.getItem('github_app_pending') === 'true';
      
      if (isGitHubReturn) {
        console.log('[GitNativeFederation] Detected return from GitHub');
        sessionStorage.removeItem('github_app_pending');
      }
      
      // GitHub App can redirect with installation_id for both new installs and existing ones
      if (installationId) {
        // Smart duplicate prevention - only prevent within 30 seconds
        const handledKey = `github_app_handled_${installationId}`;
        const handledData = sessionStorage.getItem(handledKey);
        
        if (handledData) {
          const handledTime = parseInt(handledData, 10);
          const now = Date.now();
          const timeDiff = now - handledTime;
          
          // Only skip if handled within last 30 seconds (30000ms)
          if (timeDiff < 30000) {
            console.log('[GitNativeFederation] GitHub App installation recently handled, skipping duplicate (within 30s)');
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          } else {
            console.log('[GitNativeFederation] Previous installation attempt was over 30s ago, allowing retry');
          }
        }
        
        // Mark as handled with timestamp
        sessionStorage.setItem(handledKey, Date.now().toString());
        
        try {
          setIsConnecting(true);
          setError(null);
          
          console.log('[GitNativeFederation] Processing GitHub App installation...');
          
          // Get installation access token from our backend
          const installationResponse = await oauthFetch('/api/github/app/installation-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              installation_id: installationId
            })
          });
          
          console.log('[GitNativeFederation] Installation token response status:', installationResponse.status);
          
          if (!installationResponse.ok) {
            const errorText = await installationResponse.text();
            console.error('[GitNativeFederation] Installation token failed:', errorText);
            throw new Error(`Failed to get installation token: ${installationResponse.status} ${errorText}`);
          }
          
          const installationData = await installationResponse.json();
          console.log('[GitNativeFederation] Installation token received');

          // Our backend returns { token, expires_at, permissions }
          const accessToken = installationData.token;

          // Fetch installation details and repositories via backend (safer)
          const instDetailsResp = await oauthFetch(`/api/github/app/installation/${encodeURIComponent(installationId)}`, { method: 'GET' });
          if (!instDetailsResp.ok) {
            const errorText = await instDetailsResp.text();
            throw new Error(`Failed to fetch installation details: ${instDetailsResp.status} ${errorText}`);
          }
          const instDetails = await instDetailsResp.json();
          console.log('[GitNativeFederation] Installation details received:', {
            hasRepositories: !!instDetails.repositories,
            repositoriesType: typeof instDetails.repositories,
            repositoriesLength: instDetails.repositories?.length,
            account: instDetails.account?.login,
            fullResponse: instDetails
          });
          
          const repositories = Array.isArray(instDetails.repositories) ? instDetails.repositories.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            private: repo.private,
            created_at: repo.created_at,
            updated_at: repo.updated_at
          })) : [];

          // Derive username from installation account
          const userData = instDetails.account || {};
          const username = userData.login || 'unknown-user';
          
          console.log('[GitNativeFederation] GitHub App installation successful:', username, repositories.length, 'repositories');
          
          // Store the installation data
          setGithubAppInstallation({ 
            installationId, 
            accessToken,
            repositories, 
            userData,
            username
          });
          setUserRepositories(repositories);
          
          // Provide helpful feedback based on repository count
          if (repositories.length === 0) {
            setError(`GitHub App installed successfully for @${username}, but no repositories are accessible.\n\nThis usually means:\n• No repositories were selected during installation\n• Repository access was revoked after installation\n• The app needs additional permissions\n\nTo fix this:\n1. Go to GitHub Settings → Applications → Installed GitHub Apps\n2. Find "RedString" and click "Configure"\n3. Grant access to repositories you want to sync\n4. Come back and try connecting again\n\nAlternatively, you can use OAuth authentication to browse all your repositories.`);
            setShowRepositorySelector(false); // Don't show empty selector
          } else {
            setShowRepositorySelector(true);
            setError(null);
          }
          setIsConnected(false);
          
          // Clean up URL and session storage on success
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Clear the handled flag on successful completion
          const handledKey = `github_app_handled_${installationId}`;
          sessionStorage.removeItem(handledKey);
          
        } catch (err) {
          console.error('[GitNativeFederation] GitHub App installation failed:', err);
          setError(`GitHub App installation failed: ${err.message}`);
          
          // Clean up URL and clear handled flag on error so user can retry
          window.history.replaceState({}, document.title, window.location.pathname);
          const handledKey = `github_app_handled_${installationId}`;
          sessionStorage.removeItem(handledKey);
        } finally {
          setIsConnecting(false);
        }
              } else if (isGitHubReturn) {
        console.log('[GitNativeFederation] Returned from GitHub but no installation_id found');
        console.log('[GitNativeFederation] This suggests the GitHub App Setup URL is pointing to the wrong endpoint');
        console.log('[GitNativeFederation] Current URL:', window.location.href);
        console.log('[GitNativeFederation] Expected: GitHub should redirect to /oauth/callback with installation_id parameter');
        console.log('[GitNativeFederation] Actual: Redirected to root / with no parameters');
        console.log('[GitNativeFederation] Fix: Update GitHub App Setup URL to end with /oauth/callback');
        
        // Check if we've already attempted an automatic retry
        const autoRetryAttempted = sessionStorage.getItem('github_app_auto_retry_attempted');
        
        if (!autoRetryAttempted) {
          console.log('[GitNativeFederation] Attempting automatic installation completion (first retry)...');
          sessionStorage.setItem('github_app_auto_retry_attempted', 'true');
          
          try {
            setIsConnecting(true);
            setError(null);
            
            // Try to get the most recent installation for this user
            const installationsResp = await oauthFetch('/api/github/app/installations', { method: 'GET' });
            
            if (installationsResp.ok) {
              const installations = await installationsResp.json();
              
              if (installations && installations.length > 0) {
                // Use the most recent installation
                const latestInstallation = installations[0];
                const installationId = latestInstallation.id.toString();
                
                console.log('[GitNativeFederation] Found recent installation:', installationId);
                
                // Process this installation as if we got it from the callback
                const installationResponse = await oauthFetch('/api/github/app/installation-token', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ installation_id: installationId })
                });
                
                if (installationResponse.ok) {
                  const installationData = await installationResponse.json();
                  const accessToken = installationData.token;

                  // Fetch installation details
                  const instDetailsResp = await oauthFetch(`/api/github/app/installation/${encodeURIComponent(installationId)}`, { method: 'GET' });
                  if (instDetailsResp.ok) {
                    const instDetails = await instDetailsResp.json();
                    const repositories = Array.isArray(instDetails.repositories) ? instDetails.repositories.map(repo => ({
                      name: repo.name,
                      full_name: repo.full_name,
                      description: repo.description,
                      private: repo.private,
                      created_at: repo.created_at,
                      updated_at: repo.updated_at
                    })) : [];

                    const userData = instDetails.account || {};
                    const username = userData.login || 'unknown-user';
                    
                    console.log('[GitNativeFederation] Automatic installation completion successful:', username, repositories.length, 'repositories');
                    
                    // Store the installation data
                    setGithubAppInstallation({ 
                      installationId, 
                      accessToken,
                      repositories, 
                      userData,
                      username
                    });
                    setUserRepositories(repositories);
                    
                    // Provide helpful feedback based on repository count
                    if (repositories.length === 0) {
                      setError(`GitHub App installed successfully for @${username}, but no repositories are accessible.\n\nThis usually means:\n• No repositories were selected during installation\n• Repository access was revoked after installation\n• The app needs additional permissions\n\nTo fix this:\n1. Go to GitHub Settings → Applications → Installed GitHub Apps\n2. Find "RedString" and click "Configure"\n3. Grant access to repositories you want to sync\n4. Come back and try connecting again`);
                      setShowRepositorySelector(false); // Don't show empty selector
                    } else {
                      setShowRepositorySelector(true);
                      setError(null);
                    }
                    console.log('[GitNativeFederation] GitHub App installation completed - ready for repository operations');
                    setIsConnected(false);
                    
                    // Clean up session storage
                    sessionStorage.removeItem('github_app_auto_retry_attempted');
                    
                    // Don't show manual completion button since we succeeded
                    setShowCompleteInstallation(false);
                    
                    return; // Success, exit early
                  }
                }
              }
            }
            
            // If we get here, automatic retry failed
            console.log('[GitNativeFederation] Automatic retry failed, showing manual completion option...');
            setError('GitHub App installation detected! Please use the "Complete Installation" button below to continue.');
            setShowCompleteInstallation(true);
            
          } catch (retryError) {
            console.error('[GitNativeFederation] Automatic retry failed:', retryError);
            setError('GitHub App installation detected! Please use the "Complete Installation" button below to continue.');
            setShowCompleteInstallation(true);
          } finally {
            setIsConnecting(false);
          }
        } else {
          console.log('[GitNativeFederation] Auto-retry already attempted, showing manual completion option...');
          setError('GitHub App installation detected! Please use the "Complete Installation" button below to continue.');
          setShowCompleteInstallation(true);
        }
      } else {
        console.log('[GitNativeFederation] No GitHub App installation parameters found in URL');
        // Clean up URL if no installation parameters
        if (window.location.search.includes('installation_id=') || window.location.search.includes('setup_action=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };
    
    handleGitHubCallbacks();
  }, []);

  // Connect to provider
  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);
    
    try {
      const config = selectedProvider === 'github' ? providerConfig : giteaConfig;
      const provider = SemanticProviderFactory.createProvider(config);
      
      // Test connection
      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        throw new Error(`Cannot connect to ${provider.name}. Please check your username, repository name, and token permissions.`);
      }
      
      // Check if repository is empty and initialize if needed
      console.log('[GitNativeFederation] Checking repository contents...');
      try {
        const files = await provider.listSemanticFiles();
        console.log('[GitNativeFederation] Repository files found:', files.length);
        
        if (files.length === 0) {
          console.log('[GitNativeFederation] Repository is empty, attempting to initialize...');
          try {
            console.log('[GitNativeFederation] Calling initializeEmptyRepository()...');
            await provider.initializeEmptyRepository();
            console.log('[GitNativeFederation] Repository initialized successfully');
            
            // Show success message to user
            setSyncStatus({
              type: 'success',
              status: `Repository initialized with semantic structure`
            });
            
            // Force a refresh of the files list
            setTimeout(async () => {
              try {
                const updatedFiles = await provider.listSemanticFiles();
                console.log('[GitNativeFederation] After initialization, files found:', updatedFiles.length);
              } catch (refreshError) {
                console.error('[GitNativeFederation] Error refreshing file list:', refreshError);
              }
            }, 2000);
            
          } catch (initError) {
            console.error('[GitNativeFederation] Repository initialization failed:', initError);
            console.warn('[GitNativeFederation] Could not initialize repository (likely read-only token):', initError);
            // Show a helpful message to the user
            setError(`Connected successfully! However, your token doesn't have write permissions. The repository will be initialized when you first create content.`);
          }
        } else {
          console.log('[GitNativeFederation] Repository already has content, no initialization needed');
          setSyncStatus({
            type: 'success',
            status: `Connected to existing repository`
          });
        }
      } catch (error) {
        console.error('[GitNativeFederation] Error checking repository contents:', error);
        console.warn('[GitNativeFederation] Could not check repository contents:', error);
        // Continue anyway - the repository might be accessible but not writable
      }
      
      setCurrentProvider(provider);
      setIsConnected(true);
      
      // Save connection to persistent store
      setGitConnection(config);
      
    } catch (err) {
      console.error('[GitNativeFederation] Connection failed:', err);
      setError(`Connection failed: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle repository selection in OAuth flow or GitHub App flow
  const handleSelectRepository = async (repoName, makePrivate = false, createIfMissing = false) => {
    try {
      // Check for GitHub App installation first, then fallback to OAuth
      let authData;
      if (githubAppInstallation) {
        authData = {
          username: githubAppInstallation.username,
          accessToken: githubAppInstallation.accessToken,
          repositories: githubAppInstallation.repositories,
          userData: githubAppInstallation.userData,
          installationId: githubAppInstallation.installationId,
          isGitHubApp: true
        };
      } else if (pendingOAuth) {
        authData = {
          username: pendingOAuth.username,
          accessToken: pendingOAuth.accessToken,
          repositories: pendingOAuth.repositories,
          userData: pendingOAuth.userData,
          isGitHubApp: false
        };
      } else {
        setError('No authentication session pending. Please authenticate again.');
        return;
      }

      const { username, accessToken, repositories, userData } = authData;

      // If createIfMissing and repoName not in list, create repo
      if (createIfMissing && !repositories.some(r => r.name === repoName)) {
        try {
          // Require OAuth access token before attempting creation
          if (!authData.accessToken) {
            throw new Error('Missing OAuth access token. Please sign in with GitHub (OAuth) and try again.');
          }

          // Always use OAuth user authentication for repository creation (recommended approach)
          console.log('[GitNativeFederation] Creating repository via OAuth user authentication...');
          console.log('[GitNativeFederation] Using access token:', authData.accessToken ? 'Present' : 'Missing');
          console.log('[GitNativeFederation] Repository details:', { name: repoName, private: !!makePrivate });
          
          // Use OAuth user authentication for repository creation via backend
          const resp = await oauthFetch('/api/github/oauth/create-repository', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              access_token: authData.accessToken,
              name: repoName,
              private: !!makePrivate,
              description: 'RedString knowledge graph repository',
              auto_init: true
            })
          });
          
          if (!resp.ok) {
            const errorText = await resp.text();
            console.error('[GitNativeFederation] Backend repository creation failed:', {
              status: resp.status,
              statusText: resp.statusText,
              errorText
            });
            throw new Error(`Repository creation failed: ${resp.status} ${errorText}`);
          }
          
          const newRepo = await resp.json();
          console.log('[GitNativeFederation] Repository created via OAuth:', newRepo.full_name);
        } catch (error) {
          console.error('[GitNativeFederation] Repository creation error:', error);
          
          const lower = String(error.message || '').toLowerCase();
          if (lower.includes('403') || lower.includes('forbidden') || lower.includes('resource not accessible by integration')) {
            throw new Error(
              `Repository creation requires authenticating as a GitHub user (OAuth) with the correct scopes.\n\n` +
              `Please do the following:\n` +
              `1) Click "Sign in with GitHub" and complete OAuth.\n` +
              `2) Ensure the app requests and you grant the 'repo' scope (or at least 'public_repo' if creating public repos).\n` +
              `3) Try creating the repository '${repoName}' again.\n\n` +
              `Alternatively, create it manually at https://github.com/new and link it here.`
            );
          }

          if (lower.includes('missing oauth access token')) {
            throw new Error('Please sign in with GitHub (OAuth) first, then try again.');
          }

          throw new Error(`Failed to create repository: ${error.message}\n\nYou can always create the repository '${repoName}' manually at https://github.com/new and link it here.`);
        }
      }

      const config = {
        type: 'github',
        user: username,
        repo: repoName,
        token: accessToken,
        authMethod: authData.isGitHubApp ? 'github-app' : 'oauth',
        semanticPath: 'schema',
        ...(authData.isGitHubApp && { installationId: authData.installationId })
      };

      const provider = SemanticProviderFactory.createProvider(config);
      provider.userData = userData;
      provider.repositories = repositories;

      const isAvailable = await provider.isAvailable();
      if (!isAvailable) {
        throw new Error('Repository is not accessible. Check permissions or name.');
      }

      setCurrentProvider(provider);
      setProviderConfig(config);
      setIsConnected(true);
      setError(null);
      setShowRepositorySelector(false);
      setPendingOAuth(null);
      setGithubAppInstallation(null);

      // Persist connection without token
      setGitConnection({ ...config, token: undefined });

      console.log(`[GitNativeFederation] Connected via ${authData.isGitHubApp ? 'GitHub App' : 'OAuth'} to`, `${username}/${repoName}`);
    } catch (err) {
      console.error('[GitNativeFederation] Repository selection failed:', err);
      setError(`Repository selection failed: ${err.message}`);
    }
  };

  // Handle manual installation completion (for admin/testing cases)
  const handleCompleteInstallation = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      setShowCompleteInstallation(false);
      
      console.log('[GitNativeFederation] Manual installation completion with known installation ID: 83404431');
      
      // Use the known installation ID from your GitHub App
      const installationId = '83404431';
      
      // Get installation access token
      const installationResponse = await oauthFetch('/api/github/app/installation-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          installation_id: installationId
        })
      });
      
      if (!installationResponse.ok) {
        const errorText = await installationResponse.text();
        throw new Error(`Failed to get installation token: ${installationResponse.status} ${errorText}`);
      }
      
      const installationData = await installationResponse.json();
      const accessToken = installationData.token;

      // Fetch installation details
      const instDetailsResp = await oauthFetch(`/api/github/app/installation/${encodeURIComponent(installationId)}`, { method: 'GET' });
      if (!instDetailsResp.ok) {
        const errorText = await instDetailsResp.text();
        throw new Error(`Failed to fetch installation details: ${instDetailsResp.status} ${errorText}`);
      }
      const instDetails = await instDetailsResp.json();
      const repositories = Array.isArray(instDetails.repositories) ? instDetails.repositories.map(repo => ({
        name: repo.name,
        full_name: repo.full_name,
        description: repo.description,
        private: repo.private,
        created_at: repo.created_at,
        updated_at: repo.updated_at
      })) : [];

      const userData = instDetails.account || {};
      const username = userData.login || 'unknown-user';
      
      console.log('[GitNativeFederation] Manual installation completion successful:', username, repositories.length, 'repositories');
      
      // Store the installation data
      setGithubAppInstallation({ 
        installationId, 
        accessToken,
        repositories, 
        userData,
        username
      });
      setUserRepositories(repositories);
      
      // Provide helpful feedback based on repository count
      if (repositories.length === 0) {
        setError(`GitHub App installed successfully for @${username}, but no repositories are accessible.\n\nThis usually means:\n• No repositories were selected during installation\n• Repository access was revoked after installation\n• The app needs additional permissions\n\nTo fix this:\n1. Go to GitHub Settings → Applications → Installed GitHub Apps\n2. Find "RedString" and click "Configure"\n3. Grant access to repositories you want to sync\n4. Come back and try connecting again`);
        setShowRepositorySelector(false); // Don't show empty selector
      } else {
        setShowRepositorySelector(true);
        setError(null);
      }
      setIsConnected(false);
      
    } catch (err) {
      console.error('[GitNativeFederation] Manual installation completion failed:', err);
      setError(`Installation completion failed: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle GitHub OAuth authentication for repository creation
  const handleGitHubAuth = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      console.log('[GitNativeFederation] Starting GitHub OAuth authentication');
      
      // Get OAuth client ID from backend
      const clientResp = await oauthFetch('/api/github/oauth/client-id');
      if (!clientResp.ok) {
        throw new Error('Failed to get OAuth client ID');
      }
      const { clientId } = await clientResp.json();
      
      if (!clientId) {
        throw new Error('OAuth not configured on server');
      }
      
      // Create OAuth authorization URL with repo scope for repository creation
      const state = Math.random().toString(36).substring(7);
      sessionStorage.setItem('github_oauth_state', state);
      sessionStorage.setItem('github_oauth_pending', 'true');
      
      const redirectUri = window.location.origin + '/oauth/callback';
      const scopes = 'repo'; // Full repo scope needed for repository creation
      // Build URL with proper encoding - encodeURIComponent each parameter value
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
      
      console.log('[GitNativeFederation] Redirecting to GitHub OAuth:', authUrl);
      console.log('[GitNativeFederation] Redirect URI (unencoded):', redirectUri);
      console.log('[GitNativeFederation] Redirect URI (encoded):', encodeURIComponent(redirectUri));
      
      // Redirect to GitHub OAuth in same tab
      window.location.href = authUrl;
      
    } catch (err) {
      console.error('[GitNativeFederation] OAuth failed:', err);
      setError(`GitHub OAuth authentication failed: ${err.message}`);
      setIsConnecting(false);
    }
  };

  // Handle browsing repositories with new repository manager
  const handleBrowseRepositories = () => {
    setShowRepositoryManager(true);
  };

  // Handle repository selection from the repository manager
  const handleRepositoryManagerSelect = (repo) => {
    console.log('[GitNativeFederation] Repository selected from manager:', repo.name);
    
    // Close the repository manager
    setShowRepositoryManager(false);
    
    // Use the selected repository
    handleSelectRepository(repo.name, false, false);
  };

  // Handle GitHub App connection - simple and clean like OAuth
  const handleGitHubApp = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      console.log('[GitNativeFederation] Starting GitHub App authentication');
      
      // Get GitHub App name
      let appName = 'redstring-semantic-sync';
      try {
        const resp = await oauthFetch('/api/github/app/client-id', { method: 'GET' });
        if (resp.ok) {
          const data = await resp.json();
          if (data?.appName) appName = data.appName;
        }
      } catch (e) {
        console.warn('[GitNativeFederation] Could not fetch app name, using default');
      }
      
      // Create installation URL with state for callback
      const state = Math.random().toString(36).substring(7);
      sessionStorage.setItem('github_app_state', state);
      sessionStorage.setItem('github_app_pending', 'true');
      
      const currentOrigin = window.location.origin;
      const installationUrl = `https://github.com/apps/${appName}/installations/new?state=${state}`;
      
      console.log('[GitNativeFederation] Redirecting to GitHub App:', installationUrl);
      console.log('[GitNativeFederation] Set session flag for pending installation');
      
      // Redirect directly (like OAuth does)
      window.location.href = installationUrl;
      
    } catch (err) {
      console.error('[GitNativeFederation] GitHub App failed:', err);
      setError(`GitHub App authentication failed: ${err.message}`);
      setIsConnecting(false);
    }
  };


  // Disconnect from provider
  const handleDisconnect = () => {
    // Stop Git sync engine
    if (gitSyncEngine) {
      gitSyncEngine.stop();
    }
    
    // Remove from UniverseManager
    const activeUniverse = universeManager.getActiveUniverse();
    if (activeUniverse) {
      universeManager.updateUniverse(activeUniverse.slug, {
        gitRepo: { ...activeUniverse.gitRepo, enabled: false }
      });
    }
    
    setCurrentProvider(null);
    setSyncEngine(null);
    setFederation(null);
    setIsConnected(false);
    setSyncStatus(null);
    setFederationStats(null);
    setUserRepositories([]);
    setShowRepositorySelector(false);
    setGitSyncEngine(null);
    setGitSyncEngineStore(null);
    
    // Clear persistent connection
    clearGitConnection();
  };

  // Add subscription
  const handleAddSubscription = async () => {
    if (!newSubscriptionUrl.trim() || !federation) return;
    
    setIsAddingSubscription(true);
    setError(null);
    
    try {
      await federation.subscribeToSpace(newSubscriptionUrl.trim(), {
        autoImport: true
      });
      setNewSubscriptionUrl('');
    } catch (err) {
      console.error('[GitNativeFederation] Failed to add subscription:', err);
      setError(`Failed to add subscription: ${err.message}`);
    } finally {
      setIsAddingSubscription(false);
    }
  };

  // Remove subscription
  const handleRemoveSubscription = (url) => {
    if (federation) {
      federation.unsubscribeFromSpace(url);
    }
  };

  // Force sync
  const handleForceSync = async () => {
    if (syncEngine) {
      await syncEngine.forceSync();
    }
  };

  // Save to Git using SaveCoordinator
  const handleSaveToGit = async () => {
    try {
      console.log('[GitNativeFederation] Initiating force save via SaveCoordinator...');
      setIsConnecting(true);
      setIsSaving(true);
      setError(null);
      
      // Try to use SaveCoordinator for consistent save handling
      let saveResult = false;
      
      try {
        const SaveCoordinatorModule = await import('./services/SaveCoordinator.js');
        const saveCoordinator = SaveCoordinatorModule.default;
        
        if (saveCoordinator && saveCoordinator.isEnabled) {
          await saveCoordinator.forceSave(storeState);
          saveResult = true;
          console.log('[GitNativeFederation] Save via SaveCoordinator successful');
        }
      } catch (coordinatorError) {
        console.warn('[GitNativeFederation] SaveCoordinator failed, falling back to direct GitSyncEngine:', coordinatorError);
      }
      
      // Fallback to direct GitSyncEngine if SaveCoordinator failed
      if (!saveResult && gitSyncEngine) {
        const result = await gitSyncEngine.forceCommit(storeState);
        saveResult = result;
        console.log('[GitNativeFederation] Direct GitSyncEngine save result:', result);
      }
      
      if (!gitSyncEngine && !saveResult) {
        setError('No sync engine or save coordinator available');
        return;
      }
      
      if (saveResult) {
        setHasUnsavedChanges(false);
        setLastSaveTime(Date.now());
        setSyncStatus({
          type: 'success',
          status: 'Data saved to repository'
        });
      } else {
        setSyncStatus({
          type: 'info',
          status: 'Save skipped (rate limited or no changes)'
        });
      }
      
      // Clear the status after 5 seconds
      setTimeout(() => {
        setSyncStatus(null);
      }, 5000);
      
    } catch (error) {
      console.error('[GitNativeFederation] Save to Git failed:', error);
      setError(`Save to Git failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
      setIsSaving(false);
    }
  };

  // Toggle source of truth mode
  const handleToggleSourceOfTruth = () => {
    if (!gitSyncEngine) {
      setError('No sync engine connected');
      return;
    }

    const newMode = sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL 
      ? SOURCE_OF_TRUTH.GIT 
      : SOURCE_OF_TRUTH.LOCAL;
    
    // Add confirmation for switching to Git mode
    if (newMode === SOURCE_OF_TRUTH.GIT) {
      const confirmed = window.confirm(
        '⚠️ WARNING: Switching to Git mode will make the Git repository the authoritative source.\n\n' +
        'This means:\n' +
        '• Git changes can overwrite your local RedString file\n' +
        '• Your local changes may be lost if not committed\n' +
        '• This is experimental and may cause data loss\n\n' +
        'Only enable this if you understand the risks.\n\n' +
        'Continue?'
      );
      if (!confirmed) {
        return;
      }
    }
    
    try {
      gitSyncEngine.setSourceOfTruth(newMode);
      setSourceOfTruthMode(newMode);
      
      // Persist source of truth setting
      setGitSourceOfTruth(newMode === SOURCE_OF_TRUTH.GIT ? 'git' : 'local');
      
      setSyncStatus({
        type: newMode === SOURCE_OF_TRUTH.GIT ? 'warning' : 'success',
        status: `Source of truth changed to: ${newMode === SOURCE_OF_TRUTH.LOCAL ? 'RedString File (Safe)' : 'Git Repository (Experimental)'}`
      });
      
      // Clear the status after 8 seconds for warnings
      setTimeout(() => {
        setSyncStatus(null);
      }, newMode === SOURCE_OF_TRUTH.GIT ? 8000 : 5000);
      
    } catch (error) {
      console.error('[GitNativeFederation] Failed to change source of truth:', error);
      setError(`Failed to change source of truth: ${error.message}`);
    }
  };

  // Initialize repository
  const handleInitializeRepository = async () => {
    if (!currentProvider) {
      setError('No provider connected');
      return;
    }

    try {
      console.log('[GitNativeFederation] Manually initializing repository...');
      setIsConnecting(true);
      setError(null);
      
      await currentProvider.initializeEmptyRepository();
      
      console.log('[GitNativeFederation] Repository initialization successful!');
      setSyncStatus({
        type: 'success',
        status: 'Repository initialized with semantic structure'
      });
      
      // Clear the status after 5 seconds
      setTimeout(() => {
        setSyncStatus(null);
      }, 5000);
      
    } catch (error) {
      console.error('[GitNativeFederation] Repository initialization failed:', error);
      setError(`Repository initialization failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };



  // Migrate provider
  const handleMigrateProvider = async () => {
    if (!syncEngine) return;
    
    const newConfig = selectedProvider === 'github' ? providerConfig : giteaConfig;
    
    try {
      await syncEngine.migrateProvider(newConfig);
      setCurrentProvider(SemanticProviderFactory.createProvider(newConfig));
    } catch (err) {
      console.error('[GitNativeFederation] Migration failed:', err);
      setError(`Migration failed: ${err.message}`);
    }
  };

  // Test function that runs Git federation tests safely
  const runGitFederationTests = async () => {
    try {
      setSyncStatus({ type: 'info', status: 'Running Git federation tests...' });

      // Take a safe snapshot of the active in-memory universe (no mutations)
      const current = useGraphStore.getState();
      const testState = {
        graphs: current.graphs instanceof Map ? new Map(current.graphs) : new Map(),
        nodePrototypes: current.nodePrototypes instanceof Map ? new Map(current.nodePrototypes) : new Map(),
        edges: current.edges instanceof Map ? new Map(current.edges) : new Map(),
        openGraphIds: Array.isArray(current.openGraphIds) ? [...current.openGraphIds] : [],
        activeGraphId: current.activeGraphId ?? null,
        activeDefinitionNodeId: current.activeDefinitionNodeId ?? null,
        expandedGraphIds: current.expandedGraphIds instanceof Set ? new Set(current.expandedGraphIds) : new Set(),
        rightPanelTabs: [],
        savedNodeIds: current.savedNodeIds instanceof Set ? new Set(current.savedNodeIds) : new Set(),
        savedGraphIds: current.savedGraphIds instanceof Set ? new Set(current.savedGraphIds) : new Set(),
        showConnectionNames: !!current.showConnectionNames
      };

      // Test 1: Export to RedString format from the active universe snapshot (use static import)
      const exportedData = exportToRedstring(testState);
      
      if (!exportedData || !exportedData.prototypeSpace || !exportedData.spatialGraphs) {
        throw new Error('Export test failed: Invalid export data structure');
      }

      // Test 2: Import from RedString format (use static import)
      const { storeState: importedState, errors } = importFromRedstring(exportedData);
      
      if (errors && errors.length > 0) {
        throw new Error(`Import test failed: ${errors.join(', ')}`);
      }

      // Test 3: Verify roundtrip fidelity (skip if universe is empty)
      const originalPrototypes = Array.from(testState.nodePrototypes.keys());
      const importedPrototypes = Array.from(importedState.nodePrototypes.keys());
      
      if (originalPrototypes.length > 0 && originalPrototypes.length !== importedPrototypes.length) {
        throw new Error(`Roundtrip test failed: Prototype count mismatch (${originalPrototypes.length} vs ${importedPrototypes.length})`);
      }

      const originalGraphs = Array.from(testState.graphs.keys());
      const importedGraphs = Array.from(importedState.graphs.keys());
      
      if (originalGraphs.length > 0 && originalGraphs.length !== importedGraphs.length) {
        throw new Error(`Roundtrip test failed: Graph count mismatch (${originalGraphs.length} vs ${importedGraphs.length})`);
      }

      // Test 4: Verify edges and instances (skip if universe is empty)
      const originalEdges = Array.from(testState.edges.keys());
      const importedEdges = Array.from(importedState.edges.keys());
      
      if (originalEdges.length > 0 && originalEdges.length !== importedEdges.length) {
        throw new Error(`Roundtrip test failed: Edge count mismatch (${originalEdges.length} vs ${importedEdges.length})`);
      }

      // Test 5: Verify edge structure preservation (if edges exist)
      if (originalEdges.length > 0) {
        // Test the first edge for structure preservation
        const firstEdgeId = originalEdges[0];
        const originalEdge = testState.edges.get(firstEdgeId);
        const importedEdge = importedState.edges.get(firstEdgeId);
        
        if (!originalEdge || !importedEdge) {
          throw new Error('Roundtrip test failed: Edge not found in imported state');
        }

        // Verify basic edge properties are preserved
        if (originalEdge.sourceId !== importedEdge.sourceId || originalEdge.destinationId !== importedEdge.destinationId) {
          throw new Error('Roundtrip test failed: Edge connections not preserved');
        }

        // Verify directionality structure exists (even if empty)
        if (originalEdge.directionality && !importedEdge.directionality) {
          throw new Error('Roundtrip test failed: Edge directionality structure not preserved');
        }

        // Verify definition arrays are preserved
        if (originalEdge.definitionNodeIds && !Array.isArray(importedEdge.definitionNodeIds)) {
          throw new Error('Roundtrip test failed: Edge definition structure not preserved');
        }
      }

      // Test 6: Test Git sync engine functionality (if connected)
      if (gitSyncEngine && currentProvider) {
        try {
          // Test the sync engine's export functionality
          const syncExport = exportToRedstring(testState);
          const jsonString = JSON.stringify(syncExport, null, 2);
          
          // Verify the export is valid JSON
          JSON.parse(jsonString);
          
          setSyncStatus({ 
            type: 'success', 
            status: `✅ All tests passed! Export/Import roundtrip: ${originalPrototypes.length} prototypes, ${originalGraphs.length} graphs, ${originalEdges.length} edges. Multi-edge directionality preserved. Git sync ready.` 
          });
        } catch (syncError) {
          setSyncStatus({ 
            type: 'warning', 
            status: `⚠️ Core tests passed but Git sync test failed: ${syncError.message}` 
          });
        }
      } else {
        setSyncStatus({ 
          type: 'success', 
          status: `✅ Core tests passed! Export/Import roundtrip: ${originalPrototypes.length} prototypes, ${originalGraphs.length} graphs, ${originalEdges.length} edges. Multi-edge directionality preserved. Connect to Git for full testing.` 
        });
      }

    } catch (error) {
      console.error('[GitNativeFederation] Test failed:', error);
      setSyncStatus({ 
        type: 'error', 
        status: `❌ Test failed: ${error.message}` 
      });
    }
  };

  // Tooltip component - Mobile-friendly with touch support
  const InfoTooltip = ({ children, tooltip }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [touchTimeout, setTouchTimeout] = useState(null);
    
    const handleTouchStart = () => {
      // Clear any existing timeout
      if (touchTimeout) {
        clearTimeout(touchTimeout);
      }
      
      // Show tooltip immediately on touch
      setShowTooltip(true);
      
      // Auto-hide after 4 seconds on mobile
      const timeout = setTimeout(() => {
        setShowTooltip(false);
      }, 4000);
      setTouchTimeout(timeout);
    };
    
    const handleTouchEnd = (e) => {
      // Prevent the tooltip from hiding immediately
      e.preventDefault();
    };
    
    const handleMouseEnter = () => {
      if (!deviceInfo.isTouchDevice) {
        setShowTooltip(true);
      }
    };
    
    const handleMouseLeave = () => {
      if (!deviceInfo.isTouchDevice) {
        setShowTooltip(false);
      }
    };
    
    return (
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        {children}
        <div
          style={{
            position: 'relative',
            marginLeft: '4px',
            cursor: deviceInfo.isTouchDevice ? 'pointer' : 'default',
            padding: deviceInfo.isTouchDevice ? '2px' : '0', // Larger touch target
            minWidth: deviceInfo.isTouchDevice ? '20px' : 'auto',
            minHeight: deviceInfo.isTouchDevice ? '20px' : 'auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            // On touch devices, clicking toggles tooltip
            if (deviceInfo.isTouchDevice) {
              e.preventDefault();
              setShowTooltip(!showTooltip);
            }
          }}
        >
          <Info size={deviceInfo.isTouchDevice ? 16 : 14} color="#666" />
          {showTooltip && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#260000',
                color: '#bdb5b5',
                padding: deviceInfo.isTouchDevice ? '12px 16px' : '8px 12px',
                borderRadius: '8px',
                fontSize: deviceInfo.isTouchDevice ? '0.9rem' : '0.8rem',
                zIndex: 1000,
                marginBottom: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                maxWidth: deviceInfo.isTouchDevice ? '280px' : '400px',
                whiteSpace: 'normal',
                textAlign: 'center',
                lineHeight: '1.4'
              }}
            >
              {tooltip}
              {deviceInfo.isTouchDevice && (
                <div style={{ 
                  fontSize: '0.7rem', 
                  marginTop: '8px', 
                  opacity: 0.8,
                  borderTop: '1px solid rgba(189,181,181,0.3)',
                  paddingTop: '6px'
                }}>
                  Tap anywhere to close
                </div>
              )}
              <div
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 0,
                  height: 0,
                  borderLeft: '6px solid transparent',
                  borderRight: '6px solid transparent',
                  borderTop: '6px solid #260000'
                }}
              />
            </div>
          )}
        </div>
      </div>
    );
  };

  // New three-section layout (Accounts & Access, Storage, Sources)  
  const useNewLayout = true;
  
  // Always run connection restoration even with new layout
  // This only runs once on mount to ensure no state changes when switching tabs
  useEffect(() => {
    const restoreConnection = async () => {
      if (gitConnection && !currentProvider) {
        console.log('[GitNativeFederation] Restoring saved Git connection:', gitConnection);
        
        // Check if this is a demo connection - clear it and don't restore
        if (gitConnection.token === 'demo_token_secure' || gitConnection.user === 'demo-user') {
          console.log('[GitNativeFederation] Clearing saved demo connection');
          clearGitConnection();
          return;
        }
        
        // Restore provider config based on auth method
        let restoredConfig = gitConnection;
        try {
          if (gitConnection.authMethod === 'github-app' && gitConnection.installationId) {
            // For GitHub App connections, get a fresh installation token
            console.log('[GitNativeFederation] Restoring GitHub App connection, getting fresh installation token');
            try {
              const installationResponse = await oauthFetch('/api/github/app/installation-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ installation_id: gitConnection.installationId })
              });
              
              if (installationResponse.ok) {
                const installationData = await installationResponse.json();
                restoredConfig = { ...gitConnection, token: installationData.token };
                console.log('[GitNativeFederation] Using fresh GitHub App installation token for connection restoration');
              } else {
                console.warn('[GitNativeFederation] Failed to get GitHub App installation token, connection may fail');
              }
            } catch (appTokenError) {
              console.error('[GitNativeFederation] GitHub App token restoration failed:', appTokenError);
            }
          } else if (gitConnection.authMethod === 'oauth' || !gitConnection.authMethod) {
            // For OAuth connections, try to get token from persistent auth service
            const authStatus = persistentAuth.getAuthStatus();
            if (authStatus.isAuthenticated && !gitConnection.token) {
              const token = await persistentAuth.getAccessToken();
              if (token) {
                restoredConfig = { ...gitConnection, token };
                console.log('[GitNativeFederation] Using persistent OAuth token for connection restoration');
              }
            }
            
            // Fallback to session storage if persistent auth doesn't work
            if (!restoredConfig.token) {
              const sessionToken = sessionStorage.getItem('github_access_token');
              if (sessionToken) {
                restoredConfig = { ...gitConnection, token: sessionToken };
                console.log('[GitNativeFederation] Using session OAuth token as fallback for connection restoration');
              }
            }
          }
        } catch (error) {
          console.warn('[GitNativeFederation] Error during token restoration:', error);
        }
        
        try {
          // Test the connection before considering it restored
          const provider = SemanticProviderFactory.createProvider(restoredConfig);
          const isAvailable = await provider.isAvailable();
          
          if (isAvailable) {
            setProviderConfig(restoredConfig);
            setSelectedProvider(restoredConfig.type);
            setCurrentProvider(provider);
            setIsConnected(true);
            setConnectionHealth('healthy');
            
            console.log('[GitNativeFederation] Git connection restored and verified successfully');
          } else {
            console.warn('[GitNativeFederation] Restored connection failed availability test');
            setConnectionHealth('failed');
            
            // Try to handle authentication issues automatically
            if (gitConnection.authMethod === 'oauth') {
              console.log('[GitNativeFederation] Attempting automatic token validation for OAuth connection');
              try {
                await persistentAuth.refreshAccessToken();
                // If successful, retry the connection
                const retryProvider = SemanticProviderFactory.createProvider(restoredConfig);
                const retryAvailable = await retryProvider.isAvailable();
                
                if (retryAvailable) {
                  setCurrentProvider(retryProvider);
                  setIsConnected(true);
                  setConnectionHealth('healthy');
                  console.log('[GitNativeFederation] Connection recovered after token validation');
                }
              } catch (authError) {
                console.error('[GitNativeFederation] Automatic token validation failed:', authError);
              }
            }
          }
        } catch (connectionError) {
          console.error('[GitNativeFederation] Connection restoration failed:', connectionError);
          setConnectionHealth('failed');
        }
      }
    };
    
    // Only restore connection when needed, but avoid unnecessary re-runs
    restoreConnection();
  }, [gitConnection, currentProvider, clearGitConnection]); // Keep necessary dependencies but minimize re-runs
  
  if (useNewLayout) {
    const activeUniverse = getActiveUniverse();
    const schemaPath = activeUniverse?.gitRepo?.schemaPath || providerConfig.semanticPath || 'schema';
    const oauthReady = !!authStatus?.userData?.login;
    const githubOAuthConnected = oauthReady || isConnected;
    const appInstalled = !!githubAppInstallation;
    const degraded = connectionHealth && connectionHealth !== 'healthy';
    
    // Get actual current file info from fileStorage
    const currentFileStatus = getFileStatus();
    const actualFileName = currentFileStatus?.fileName || `${sanitizeFilename(activeUniverse?.name || 'Universe')}.redstring`;
    
    // Check if we have both OAuth (for repo browsing) and App (for auto-save)
    const hasOAuthForBrowsing = !!authStatus?.userData?.login;
    const hasAppForAutoSave = !!githubAppInstallation || (isConnected && providerConfig.authMethod === 'github-app');

    const [isEditingName, setIsEditingName] = [false, () => {}]; // placeholder no-local state here

    return (
      <div 
        ref={containerRef} 
        style={{ 
          padding: deviceInfo.isMobile ? '12px' : '15px', 
          fontFamily: "'EmOne', sans-serif", 
          height: '100%', 
          color: '#260000',
          pointerEvents: isInteractive ? 'auto' : 'none',
          opacity: isVisible ? 1 : 0.5
        }}
      >
        {/* Device Capability Banner - Show device-optimized experience info */}
        {(deviceInfo.isMobile || deviceInfo.isTablet || deviceConfig.gitOnlyMode) && (
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            backgroundColor: deviceCapabilityMessage.type === 'info' ? '#e3f2fd' : '#e8f5e8',
            border: `1px solid ${deviceCapabilityMessage.type === 'info' ? '#2196f3' : '#4caf50'}`,
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <span style={{ fontSize: '1.2rem' }}>{deviceCapabilityMessage.icon}</span>
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
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            border: `1px solid ${(hasOAuthForBrowsing || hasAppForAutoSave) ? '#7A0000' : '#ff9800'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ 
                width: '8px', 
                height: '8px', 
                borderRadius: '50%', 
                backgroundColor: (hasOAuthForBrowsing || hasAppForAutoSave) ? '#7A0000' : '#ff9800'
              }} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                {(hasOAuthForBrowsing && hasAppForAutoSave) ? 'Fully Connected' : 
                 (hasOAuthForBrowsing || hasAppForAutoSave) ? 'Partially Connected' : 
                 'Not Connected'}
              </span>
            </div>
            <div style={{ fontSize: '0.75rem', color: '#666', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>
                {hasOAuthForBrowsing ? 'Can browse repos' : ''} 
                {hasOAuthForBrowsing && hasAppForAutoSave ? ' • ' : ''}
                {hasAppForAutoSave ? 'Auto-sync enabled' : ''}
                {!hasOAuthForBrowsing && !hasAppForAutoSave ? 'Authentication required' : ''}
              </span>
              {/* Saving indicator */}
              {isSaving && (
                <span style={{ fontSize: '0.7rem', color: '#ff9800', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <RefreshCw size={10} style={{ animation: 'spin 1s linear infinite' }} />
                  Saving...
                </span>
              )}
              {/* Unsaved changes indicator */}
              {!isSaving && hasUnsavedChanges && gitSyncEngine && (
                <span style={{ fontSize: '0.7rem', color: '#d32f2f', fontWeight: 600 }}>
                  • Unsaved changes
                </span>
              )}
              {/* Last saved indicator */}
              {!hasUnsavedChanges && gitSyncEngine && (
                <span style={{ fontSize: '0.7rem', color: '#2e7d32', fontWeight: 600 }}>
                  ✓ Saved {Math.floor((Date.now() - lastSaveTime) / 1000)}s ago
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: isSlim ? '1fr' : '1fr 1fr', gap: '8px' }}>
            <div style={{ background: '#bdb5b5', border: '1px solid #260000', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>GitHub OAuth</div>
                <div style={{ fontSize: '0.75rem', color: hasOAuthForBrowsing ? '#7A0000' : '#666', fontWeight: 600 }}>
                  {hasOAuthForBrowsing ? '✓ Connected' : 'Not connected'}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '8px', lineHeight: '1.3' }}>
                Browse and create repositories
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexWrap: 'wrap', flexDirection: isSlim ? 'column' : 'row' }}>
                {hasOAuthForBrowsing ? (
                  <>
                    <button disabled style={{ padding: '8px 12px', backgroundColor: '#7A0000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.8rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>@{authStatus.userData?.login}</button>
                    <button onClick={handleGitHubAuth} style={{ padding: '6px 10px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', width: isSlim ? '100%' : 'auto' }} title="Reconnect OAuth">Refresh</button>
                  </>
                ) : (
                  <button onClick={handleGitHubAuth} disabled={isConnecting} style={{ padding: '8px 12px', backgroundColor: isConnecting ? '#ccc' : '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', cursor: isConnecting ? 'not-allowed' : 'pointer', fontSize: '0.8rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Connect OAuth</button>
                )}
              </div>
            </div>
            
            <div style={{ background: '#bdb5b5', border: '1px solid #260000', borderRadius: '6px', padding: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600 }}>GitHub App</div>
                <div style={{ fontSize: '0.75rem', color: hasAppForAutoSave ? '#7A0000' : '#666', fontWeight: 600 }}>
                  {hasAppForAutoSave ? '✓ Installed' : 'Not installed'}
                </div>
              </div>
              <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '8px', lineHeight: '1.3' }}>
                Secure auto-sync with permissions
              </div>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch', flexDirection: isSlim ? 'column' : 'row' }}>
                {hasAppForAutoSave ? (
                  <>
                    <button disabled style={{ padding: '8px 12px', backgroundColor: '#7A0000', color: '#bdb5b5', border: 'none', borderRadius: '4px', fontSize: '0.8rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Installed</button>
                    <button onClick={handleGitHubApp} style={{ padding: '6px 10px', backgroundColor: 'transparent', color: '#260000', border: '1px solid #260000', borderRadius: '4px', fontSize: '0.75rem', cursor: 'pointer', width: isSlim ? '100%' : 'auto' }} title="Reconfigure App">Settings</button>
                  </>
                ) : (
                  <button onClick={handleGitHubApp} disabled={isConnecting} style={{ padding: '8px 12px', backgroundColor: isConnecting ? '#ccc' : '#260000', color: '#bdb5b5', border: 'none', borderRadius: '4px', cursor: isConnecting ? 'not-allowed' : 'pointer', fontSize: '0.8rem', width: isSlim ? '100%' : 'auto', fontWeight: 'bold' }}>Install App</button>
                )}
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
            {universes.map((universe) => (
              <div key={universe.slug} style={{ 
                background: '#bdb5b5', 
                border: universe.slug === activeUniverseSlug ? '2px solid #7A0000' : '1px solid #260000', 
                borderRadius: '6px', 
                padding: '10px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {universe.name || universe.slug}
                    </div>
                    {universe.slug === activeUniverseSlug && (
                      <div style={{ fontSize: '0.75rem', color: '#7A0000', fontWeight: 600, padding: '2px 6px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '10px' }}>ACTIVE</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    {universe.slug !== activeUniverseSlug && (
                      <button 
                        onClick={() => switchActiveUniverse(universe.slug)} 
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
                      disabled={universes.length <= 1}
                      style={{ 
                        padding: '4px', 
                        backgroundColor: 'transparent', 
                        color: universes.length <= 1 ? '#999' : '#d32f2f', 
                        border: `1px solid ${universes.length <= 1 ? '#999' : '#d32f2f'}`, 
                        borderRadius: '4px', 
                        cursor: universes.length <= 1 ? 'not-allowed' : 'pointer', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        opacity: universes.length <= 1 ? 0.5 : 1
                      }}
                      title="Delete universe"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Universe Details (only show for active universe) */}
                {universe.slug === activeUniverseSlug && (
                  <div style={{ display: 'grid', gridTemplateColumns: isSlim ? '1fr' : '1fr 1fr', gap: '10px', marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #979090' }}>
                    {/* Name and Schema */}
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Name</div>
                      <input value={universe.name || ''} onChange={(e) => renameActiveUniverse(e.target.value)} className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Schema Path</div>
                      <input value={activeUniverse?.gitRepo?.schemaPath || 'schema'} onChange={(e) => setActiveUniverseSchema(e.target.value)} className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} />
                    </div>

                    {/* Storage Mode */}
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Storage Mode</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {['local','github','mixed'].map(mode => {
                          // Determine if this mode is currently active based on enabled slots
                          const isActive = (() => {
                            const localEnabled = activeUniverse?.localFile?.enabled ?? false;
                            const gitEnabled = activeUniverse?.gitRepo?.enabled ?? false;
                            
                            if (mode === 'local') return localEnabled && !gitEnabled;
                            if (mode === 'github') return !localEnabled && gitEnabled;
                            if (mode === 'mixed') return localEnabled && gitEnabled;
                            return false;
                          })();
                          
                          return (
                            <button key={mode} onClick={() => setActiveUniverseStorageMode(mode)} style={{ padding: '4px 8px', backgroundColor: isActive ? '#260000' : 'transparent', color: isActive ? '#bdb5b5' : '#260000', border: '1px solid #260000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>{mode.toUpperCase()}</button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Source of Truth - Mobile-aware */}
                    <div>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Source of Truth</div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        {deviceConfig.enableLocalFileStorage ? (
                          <button 
                            onClick={() => { if (activeUniverse?.sourceOfTruth !== 'local') { handleToggleSourceOfTruth(); setActiveUniverseSourceOfTruth('local'); } }} 
                            style={{ 
                              padding: '4px 8px', 
                              backgroundColor: activeUniverse?.sourceOfTruth === 'local' ? '#260000' : 'transparent', 
                              color: activeUniverse?.sourceOfTruth === 'local' ? '#bdb5b5' : '#260000', 
                              border: '1px solid #260000', 
                              borderRadius: '4px', 
                              cursor: 'pointer', 
                              fontSize: '0.75rem', 
                              fontWeight: 'bold' 
                            }}
                          >
                            FILE
                          </button>
                        ) : (
                          <div style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#f5f5f5', 
                            color: '#999', 
                            border: '1px solid #ccc', 
                            borderRadius: '4px', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold',
                            opacity: 0.6
                          }}>
                            FILE (N/A)
                          </div>
                        )}
                        <button 
                          onClick={() => { if (activeUniverse?.sourceOfTruth !== 'git') { handleToggleSourceOfTruth(); setActiveUniverseSourceOfTruth('git'); } }} 
                          style={{ 
                            padding: '4px 8px', 
                            backgroundColor: activeUniverse?.sourceOfTruth === 'git' ? '#260000' : 'transparent', 
                            color: activeUniverse?.sourceOfTruth === 'git' ? '#bdb5b5' : '#260000', 
                            border: '1px solid #260000', 
                            borderRadius: '4px', 
                            cursor: 'pointer', 
                            fontSize: '0.75rem', 
                            fontWeight: 'bold' 
                          }}
                        >
                          GIT
                        </button>
                      </div>
                      {!deviceConfig.enableLocalFileStorage && (
                        <div style={{ fontSize: '0.7rem', color: '#666', marginTop: '4px' }}>
                          Git mode recommended for {deviceInfo.isMobile ? 'mobile' : 'this device'}
                        </div>
                      )}
                    </div>

                    {/* Linked Repository */}
                    <div style={{ gridColumn: isSlim ? '1 / span 1' : '1 / span 2' }}>
                      <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Linked Repository</div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div style={{ minWidth: '220px', maxWidth: '360px', flex: 1 }}>
                          <RepositoryDropdown
                            selectedRepository={activeUniverse?.gitRepo?.linkedRepo ? { 
                              name: activeUniverse.gitRepo.linkedRepo.repo, 
                              owner: { login: activeUniverse.gitRepo.linkedRepo.user } 
                            } : null}
                            onSelectRepository={(repo) => handleLinkRepositoryToActiveUniverse(repo)}
                            placeholder={hasOAuthForBrowsing ? 'Browse Repositories' : 'OAuth required for browsing'}
                            disabled={!hasOAuthForBrowsing}
                          />
                        </div>
                        {activeUniverse?.gitRepo?.linkedRepo && (
                          <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: '10px', border: '1px solid #260000', color: '#260000' }}>
                            {activeUniverse.gitRepo.linkedRepo.private ? 'Private' : 'Public'}
                          </span>
                        )}
                      </div>
                      {/* Show universe location in repo */}
                      {activeUniverse?.gitRepo?.linkedRepo && (
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px', fontFamily: 'monospace' }}>
                          📁 {activeUniverse.gitRepo.universeFolder || `universes/${activeUniverseSlug}`}/{activeUniverseSlug}.redstring
                        </div>
                      )}
                    </div>

                    {/* Local File Path - Mobile-aware with conditional display */}
                    {deviceConfig.enableLocalFileStorage ? (
                      <div style={{ gridColumn: isSlim ? '1 / span 1' : '1 / span 2' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Local .redstring Path</div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <input 
                            value={activeUniverse?.localFile?.path || actualFileName} 
                            onChange={(e) => updateActiveUniverse({ 
                              localFile: { 
                                ...activeUniverse?.localFile, 
                                path: e.target.value 
                              } 
                            })} 
                            className="editable-title-input" 
                            style={{ 
                              fontSize: '0.9rem', 
                              padding: '6px 8px', 
                              borderRadius: '4px',
                              flex: 1
                            }} 
                          />
                          <button 
                            onClick={pickLocalFileForActiveUniverse} 
                            title="Edit file location"
                            style={{ 
                              padding: '4px', 
                              backgroundColor: '#EFE8E5', 
                              color: '#260000', 
                              border: '1px solid #260000', 
                              borderRadius: '4px', 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center'
                            }}
                          >
                            <Edit3 size={12} />
                          </button>
                          <button 
                            onClick={async () => {
                              const ok = await saveActiveUniverseToLocalHandle();
                              if (!ok) {
                                const current = useGraphStore.getState();
                                downloadRedstringFile(current, actualFileName);
                              }
                            }} 
                            title="Download file"
                            style={{ 
                              padding: '4px', 
                              backgroundColor: '#EFE8E5', 
                              color: '#260000', 
                              border: '1px solid #260000', 
                              borderRadius: '4px', 
                              cursor: 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              justifyContent: 'center'
                            }}
                          >
                            <Download size={12} />
                          </button>
                        <button 
                          onClick={async () => {
                            try {
                              setIsSaving(true);
                              const localEnabled = activeUniverse?.localFile?.enabled ?? false;
                              const gitEnabled = activeUniverse?.gitRepo?.enabled ?? false;
                              const sourceOfTruth = activeUniverse?.sourceOfTruth || 'local';
                              
                              // Only save to local if local is enabled AND (source of truth is local OR mixed mode)
                              const shouldSaveLocal = localEnabled && (sourceOfTruth === 'local' || (localEnabled && gitEnabled));
                              
                              // Only save to git if git is enabled
                              const shouldSaveGit = gitEnabled;
                              
                              if (shouldSaveLocal) {
                                const current = useGraphStore.getState();
                                const ok = await saveActiveUniverseToLocalHandle();
                                if (!ok) {
                                  downloadRedstringFile(current, actualFileName);
                                }
                              }
                              
                              if (shouldSaveGit) {
                                await handleSaveToGit();
                              }
                              
                              const savedTo = [];
                              if (shouldSaveLocal) savedTo.push('local');
                              if (shouldSaveGit) savedTo.push('git');
                              
                              setHasUnsavedChanges(false);
                              setLastSaveTime(Date.now());
                              setSyncStatus({ 
                                type: 'success', 
                                status: `Manual save completed${savedTo.length ? ' to: ' + savedTo.join(' + ') : ''}` 
                              });
                              setTimeout(() => setSyncStatus(null), 4000);
                            } catch (e) {
                              setError(`Manual save failed: ${e.message}`);
                            } finally {
                              setIsSaving(false);
                            }
                          }} 
                          title="Manual save"
                          disabled={isConnecting || isSaving}
                          style={{ 
                            padding: '4px', 
                            backgroundColor: (isConnecting || isSaving) ? '#ccc' : '#EFE8E5', 
                            color: '#260000', 
                            border: '1px solid #260000', 
                            borderRadius: '4px', 
                            cursor: (isConnecting || isSaving) ? 'not-allowed' : 'pointer', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center'
                          }}
                        >
                          {isSaving ? <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={12} />}
                        </button>
                      </div>
                    </div>
                    ) : (
                      // Mobile-friendly message when local files aren't supported
                      <div style={{ gridColumn: isSlim ? '1 / span 1' : '1 / span 2' }}>
                        <div style={{ 
                          padding: '12px', 
                          backgroundColor: '#e3f2fd', 
                          border: '1px solid #2196f3', 
                          borderRadius: '6px',
                          textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '4px', color: '#1976d2' }}>
                            📱 Mobile-Optimized Storage
                          </div>
                          <div style={{ fontSize: '0.8rem', color: '#666', lineHeight: '1.3' }}>
                            Your device uses Git repositories for storage instead of local files. 
                            All your work is automatically synced to the cloud.
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Status */}
                    {syncStatus && universe.slug === activeUniverseSlug && (
                      <div style={{ gridColumn: isSlim ? '1 / span 1' : '1 / span 2', fontSize: '0.8rem', color: syncStatus.type === 'error' ? '#d32f2f' : '#260000', marginTop: '8px', textAlign: 'center' }}>
                        {syncStatus.status}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sources */}
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#979090', borderRadius: '8px' }}>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: 'bold', fontSize: '1.1rem', marginBottom: '4px' }}>Sources</div>
            <div style={{ fontSize: '0.8rem', color: '#666' }}>Connect data repositories</div>
          </div>

          {/* Add Source Card */}
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
          onClick={() => setShowAddSourceModal(true)}
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
              Add Source
            </div>
          </div>

          {/* Sources Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Sources for active universe */}
            {Array.isArray(getActiveUniverse()?.sources) && getActiveUniverse().sources.map((src) => {
              // Check if this source matches the current connected provider
              const isConnectedSource = currentProvider && 
                src.type === 'github' && 
                src.user === providerConfig.user && 
                src.repo === providerConfig.repo;
              
              // Check if source is configured
              const isConfigured = (() => {
                if (src.type === 'github') return !!(src.user && src.repo);
                if (src.type === 'gitea') return !!(src.endpoint && src.user && src.repo);
                if (src.type === 'url') return !!(src.urls && src.urls[0]);
                if (src.type === 'local') return !!src.fileName;
                return false;
              })();
              
              return (
              <div key={src.id} style={{ 
                background: '#bdb5b5', 
                border: isConnectedSource ? '2px solid #7A0000' : 
                        !isConfigured ? '2px dashed #ff9800' : 
                        '1px solid #260000', 
                borderRadius: '6px', 
                padding: '10px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 600 }}>
                      {src.name || 
                       (src.type === 'github' ? 'GitHub Repository' : 
                        src.type === 'gitea' ? 'Gitea Repository' : 
                        src.type === 'url' ? 'External URL/SPARQL' : 
                        'Local File')}
                    </div>
                    {isConnectedSource && (
                      <div style={{ fontSize: '0.75rem', color: '#7A0000', fontWeight: 600, padding: '2px 6px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '10px' }}>CONNECTED</div>
                    )}
                    {!isConfigured && (
                      <div style={{ fontSize: '0.75rem', color: '#ff9800', fontWeight: 600, padding: '2px 6px', backgroundColor: 'rgba(255,152,0,0.1)', borderRadius: '10px' }}>NEEDS CONFIG</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '0.75rem', color: '#666' }}>Enabled</label>
                    <input 
                      type="checkbox" 
                      checked={!!src.enabled} 
                      onChange={() => toggleSourceEnabled(src)}
                      disabled={!isConfigured}
                      style={{ 
                        accentColor: '#7A0000',
                        transform: 'scale(1.1)',
                        opacity: isConfigured ? 1 : 0.5
                      }}
                    />
                    <button onClick={() => removeSourceFromActiveUniverse(src.id)} style={{ padding: '4px', background: 'transparent', color: '#d32f2f', border: '1px solid #d32f2f', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Remove source">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div style={{ display: 'grid', gridTemplateColumns: isSlim ? '1fr' : '1fr 1fr', gap: '10px', marginTop: '8px' }}>
                  {src.type === 'github' && (
                    <>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Repository</div>
                        <RepositoryDropdown
                          selectedRepository={src.user && src.repo ? { name: src.repo, owner: { login: src.user } } : null}
                          onSelectRepository={(repo) => {
                            updateSourceInActiveUniverse(src.id, { 
                              user: repo?.owner?.login, 
                              repo: repo?.name,
                              name: `@${repo?.owner?.login}/${repo?.name}` // Update display name
                            });
                            // Show feedback
                            setSyncStatus({
                              type: 'success',
                              status: `Repository linked: @${repo?.owner?.login}/${repo?.name}`
                            });
                            setTimeout(() => setSyncStatus(null), 3000);
                          }}
                          placeholder={hasOAuthForBrowsing ? 'Browse Repositories' : 'OAuth required for browsing'}
                          disabled={!hasOAuthForBrowsing}
                        />
                        {!hasOAuthForBrowsing && (
                          <div style={{ fontSize: '0.75rem', color: '#ff9800', marginTop: '4px' }}>
                            Connect GitHub OAuth above to browse repositories
                          </div>
                        )}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Schema Path</div>
                        <input value={src.schemaPath || schemaPath} onChange={(e) => updateSourceInActiveUniverse(src.id, { schemaPath: e.target.value })} className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} />
                      </div>
                    </>
                  )}

                  {src.type === 'gitea' && (
                    <>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Endpoint</div>
                        <input value={src.endpoint || ''} onChange={(e) => updateSourceInActiveUniverse(src.id, { endpoint: e.target.value })} className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Repository</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input value={src.user || ''} onChange={(e) => updateSourceInActiveUniverse(src.id, { user: e.target.value })} placeholder="user" className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px', flex: 1 }} />
                          <input value={src.repo || ''} onChange={(e) => updateSourceInActiveUniverse(src.id, { repo: e.target.value })} placeholder="repo" className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px', flex: 1 }} />
                        </div>
                      </div>
                    </>
                  )}

                  {src.type === 'url' && (
                    <>
                      <div style={{ gridColumn: '1 / span 2' }}>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>URL</div>
                        <input 
                          value={(src.urls && src.urls[0]) || ''} 
                          onChange={(e) => {
                            const url = e.target.value;
                            updateSourceInActiveUniverse(src.id, { 
                              urls: [url],
                              name: url ? `External: ${url.replace(/^https?:\/\//, '').split('/')[0]}` : 'External Endpoint' // Auto-generate name from domain
                            });
                          }} 
                          placeholder="https://example.com/semantic/" 
                          className="editable-title-input" 
                          style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px', width: '100%' }} 
                        />
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                          Enter a SPARQL endpoint or semantic web API URL
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Behavior</div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {['cache','read'].map(b => (
                            <button key={b} onClick={() => updateSourceInActiveUniverse(src.id, { behavior: b })} style={{ padding: '4px 8px', backgroundColor: (src.behavior || 'cache') === b ? '#260000' : 'transparent', color: (src.behavior || 'cache') === b ? '#bdb5b5' : '#260000', border: '1px solid #260000', borderRadius: '4px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold' }}>{b === 'cache' ? 'Cache Locally' : 'Read-through'}</button>
                          ))}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                          Cache: Store data locally • Read: Query on demand
                        </div>
                      </div>
                    </>
                  )}

                  {src.type === 'local' && (
                    <>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>File Name</div>
                        <input 
                          value={src.fileName || `${activeUniverseSlug}.redstring`} 
                          onChange={(e) => {
                            const fileName = e.target.value;
                            updateSourceInActiveUniverse(src.id, { 
                              fileName,
                              name: fileName ? `Local: ${fileName}` : 'Local .redstring File' // Auto-generate name
                            });
                          }} 
                          className="editable-title-input" 
                          style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} 
                          placeholder="universe.redstring"
                        />
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                          Local .redstring file to import from
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.8rem', color: '#666', marginBottom: '4px' }}>Schema Path</div>
                        <input value={src.schemaPath || schemaPath} onChange={(e) => updateSourceInActiveUniverse(src.id, { schemaPath: e.target.value })} className="editable-title-input" style={{ fontSize: '0.9rem', padding: '6px 8px', borderRadius: '4px' }} />
                        <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                          Folder path within the file structure
                        </div>
                      </div>
                    </>
                  )}

                  {/* Per-source Manual Save */}
                  <div style={{ gridColumn: isSlim ? '1 / span 1' : '1 / span 2', display: 'flex', gap: '8px', alignItems: 'stretch', flexDirection: isSlim ? 'column' : 'row' }}>
                    {isConfigured ? (
                      <button onClick={async () => {
                        try {
                          const sourceOfTruth = activeUniverse?.sourceOfTruth || 'local';
                          const gitEnabled = activeUniverse?.gitRepo?.enabled ?? false;
                          
                          if (src.type === 'github' || src.type === 'gitea') {
                            // Only save to git sources if git is enabled
                            if (gitEnabled) {
                              await handleSaveToGit();
                              setSyncStatus({ type: 'success', status: `Saved to @${src.user}/${src.repo}` });
                            } else {
                              setSyncStatus({ type: 'warning', status: 'Git storage not enabled for this universe' });
                            }
                          } else if (src.type === 'local') {
                            // Local sources can always be downloaded regardless of storage mode
                            const current = useGraphStore.getState();
                            downloadRedstringFile(current, src.fileName || `${activeUniverseSlug}.redstring`);
                            setSyncStatus({ type: 'success', status: `Downloaded ${src.fileName}` });
                          } else if (src.type === 'url') {
                            setSyncStatus({ type: 'info', status: 'External sources are read-only' });
                          }
                          setTimeout(() => setSyncStatus(null), 3000);
                        } catch (e) {
                          setError(`Source save failed: ${e.message}`);
                        }
                      }} style={{ 
                        padding: '8px 12px', 
                        backgroundColor: src.type === 'url' ? '#666' : '#260000', 
                        color: '#bdb5b5', 
                        border: 'none', 
                        borderRadius: '4px', 
                        cursor: src.type === 'url' ? 'not-allowed' : 'pointer', 
                        fontSize: '0.8rem', 
                        width: isSlim ? '100%' : 'auto',
                        fontWeight: 'bold'
                      }}>
                        {src.type === 'github' || src.type === 'gitea' ? 'Save to Git' :
                         src.type === 'local' ? 'Download File' :
                         'Read-only'}
                      </button>
                    ) : (
                      <div style={{ 
                        padding: '8px 12px', 
                        backgroundColor: '#ccc', 
                        color: '#666', 
                        borderRadius: '4px', 
                        fontSize: '0.8rem', 
                        textAlign: 'center',
                        fontStyle: 'italic'
                      }}>
                        Configure source to enable actions
                      </div>
                    )}
                  </div>
                </div>
              </div>
              );
            })}

            {/* Show connected provider as a source option if not already in sources */}
            {currentProvider && providerConfig.user && providerConfig.repo && 
             !getActiveUniverse()?.sources?.some(src => 
               src.type === 'github' && 
               src.user === providerConfig.user && 
               src.repo === providerConfig.repo
             ) && (
              <div style={{ background: '#bdb5b5', border: '2px dashed #7A0000', borderRadius: '6px', padding: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      GitHub Repository • @{providerConfig.user}/{providerConfig.repo}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#7A0000', fontWeight: 600, padding: '2px 6px', backgroundColor: 'rgba(122,0,0,0.1)', borderRadius: '10px' }}>AVAILABLE</div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      onClick={() => {
                        // Add this connected repo as a proper source
                        const newSource = {
                          id: generateSourceId(),
                          type: 'github',
                          enabled: true,
                          name: `@${providerConfig.user}/${providerConfig.repo}`,
                          user: providerConfig.user,
                          repo: providerConfig.repo,
                          schemaPath: providerConfig.semanticPath || 'schema'
                        };
                        
                        // Add source through UniverseManager
                        const activeUniverse = getActiveUniverse();
                        updateActiveUniverse({
                          sources: [...(activeUniverse?.sources || []), newSource]
                        });
                        
                        // Show feedback
                        setSyncStatus({
                          type: 'success',
                          status: `Added @${providerConfig.user}/${providerConfig.repo} as source`
                        });
                        setTimeout(() => setSyncStatus(null), 3000);
                      }}
                      style={{ 
                        padding: '6px 12px', 
                        backgroundColor: '#7A0000', 
                        color: '#bdb5b5', 
                        border: 'none', 
                        borderRadius: '4px', 
                        fontSize: '0.8rem', 
                        cursor: 'pointer',
                        fontWeight: 'bold'
                      }}
                    >
                      Add as Source
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Enhanced Add Source Modal */}
        {showAddSourceModal && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
          }}>
            <div style={{ 
              width: '600px', 
              maxWidth: '95%', 
              backgroundColor: '#bdb5b5', 
              border: '2px solid #260000', 
              borderRadius: '12px',
              padding: '24px',
              margin: '0 20px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.3)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <div>
                  <div style={{ fontWeight: 'bold', color: '#260000', fontSize: '1.3rem', marginBottom: '4px' }}>Add Data Source</div>
                  <div style={{ fontSize: '0.9rem', color: '#666' }}>Choose how to sync your universe data</div>
                </div>
                <button 
                  onClick={() => setShowAddSourceModal(false)} 
                  style={{ 
                    background: 'transparent', 
                    border: '2px solid #260000', 
                    color: '#260000', 
                    cursor: 'pointer', 
                    fontSize: '1.2rem',
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold'
                  }}
                >
                  ✕
                </button>
              </div>
              
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: deviceConfig.enableLocalFileStorage ? '1fr 1fr' : (deviceInfo.isMobile ? '1fr' : '1fr 1fr 1fr'), 
                gap: '16px' 
              }}>
                <button
                  onClick={() => {
                    // Close modal and add a GitHub source with repository selector
                    setShowAddSourceModal(false);
                    
                    // Create a new GitHub source
                    const newSource = {
                      id: generateSourceId(),
                      type: 'github',
                      enabled: false,
                      name: 'New GitHub Repository',
                      user: '',
                      repo: '',
                      schemaPath: activeUniverse?.schemaPath || 'schema'
                    };
                    const currentUniverse = getActiveUniverse();
                    updateActiveUniverse({ sources: [...(currentUniverse?.sources || []), newSource] });
                    
                    // Show feedback
                    setSyncStatus({
                      type: 'info',
                      status: 'GitHub source added - configure repository details below'
                    });
                    setTimeout(() => setSyncStatus(null), 4000);
                  }}
                  style={{
                    padding: '24px 16px',
                    backgroundColor: '#979090',
                    border: '2px solid #260000',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bdb5b5';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#979090';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Github size={32} color="#260000" />
                  <div style={{ fontWeight: 700, color: '#260000', fontSize: '1.1rem' }}>GitHub Repository</div>
                  <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', lineHeight: '1.4' }}>
                    Connect to any GitHub repository<br/>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#7A0000' }}>✓ Recommended</span>
                  </div>
                </button>

                <button
                  onClick={() => { setSelectedProvider('gitea'); setShowAdvanced(true); setShowAddSourceModal(false); }}
                  style={{
                    padding: '24px 16px',
                    backgroundColor: '#979090',
                    border: '2px solid #260000',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bdb5b5';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#979090';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Server size={32} color="#260000" />
                  <div style={{ fontWeight: 700, color: '#260000', fontSize: '1.1rem' }}>Gitea Repository</div>
                  <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', lineHeight: '1.4' }}>
                    Self-hosted Git instance<br/>
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>Full control & privacy</span>
                  </div>
                </button>

                <button
                  onClick={() => {
                    // Close modal and add a URL source
                    setShowAddSourceModal(false);
                    
                    // Create a new URL source
                    const newSource = {
                      id: generateSourceId(),
                      type: 'url',
                      enabled: false,
                      name: 'External Endpoint',
                      urls: [''],
                      behavior: 'cache',
                      schemaPath: activeUniverse?.schemaPath || 'schema'
                    };
                    const currentUniverse = getActiveUniverse();
                    updateActiveUniverse({ sources: [...(currentUniverse?.sources || []), newSource] });
                    
                    // Show feedback
                    setSyncStatus({
                      type: 'info',
                      status: 'External URL source added - enter endpoint URL below'
                    });
                    setTimeout(() => setSyncStatus(null), 4000);
                  }}
                  style={{
                    padding: '24px 16px',
                    backgroundColor: '#979090',
                    border: '2px solid #260000',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '12px',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#bdb5b5';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#979090';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <Globe size={32} color="#260000" />
                  <div style={{ fontWeight: 700, color: '#260000', fontSize: '1.1rem' }}>External URL/SPARQL</div>
                  <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', lineHeight: '1.4' }}>
                    Semantic web endpoints<br/>
                    <span style={{ fontSize: '0.8rem', color: '#666' }}>Read-only federation</span>
                  </div>
                </button>

                {/* Only show Local File option on devices that support it */}
                {deviceConfig.enableLocalFileStorage && (
                  <button
                    onClick={() => {
                      // Close modal and add a local file source
                      setShowAddSourceModal(false);
                      
                      // Create a new local file source
                      const newSource = {
                        id: generateSourceId(),
                        type: 'local',
                        enabled: false,
                        name: 'Local .redstring File',
                        fileName: `${activeUniverseSlug}.redstring`,
                        schemaPath: activeUniverse?.schemaPath || 'schema'
                      };
                      const currentUniverse = getActiveUniverse();
                      updateActiveUniverse({ sources: [...(currentUniverse?.sources || []), newSource] });
                      
                      // Show feedback
                      setSyncStatus({
                        type: 'info',
                        status: 'Local file source added - configure file path below'
                      });
                      setTimeout(() => setSyncStatus(null), 4000);
                    }}
                    style={{
                      padding: '24px 16px',
                      backgroundColor: '#979090',
                      border: '2px solid #260000',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '12px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = '#bdb5b5';
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.2)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = '#979090';
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <Copy size={32} color="#260000" />
                    <div style={{ fontWeight: 700, color: '#260000', fontSize: '1.1rem' }}>Local File</div>
                    <div style={{ fontSize: '0.85rem', color: '#666', textAlign: 'center', lineHeight: '1.4' }}>
                      Import .redstring files<br/>
                      <span style={{ fontSize: '0.8rem', color: '#666' }}>One-time import</span>
                    </div>
                  </button>
                )}
              </div>

              <div style={{ 
                marginTop: '20px', 
                padding: '12px', 
                backgroundColor: '#979090', 
                borderRadius: '6px',
                fontSize: '0.8rem',
                color: '#666',
                textAlign: 'center'
              }}>
                Connect multiple sources to sync data from different places into your Universe.
              </div>
            </div>
          </div>
        )}

        {/* Gitea Configuration Modal */}
        {showAdvanced && selectedProvider === 'gitea' && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
          }}>
            <div style={{ 
              width: '520px', 
              maxWidth: '90%', 
              backgroundColor: '#bdb5b5', 
              border: '1px solid #260000', 
              borderRadius: '8px',
              padding: '20px',
              margin: '0 20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div style={{ fontWeight: 'bold', color: '#260000', fontSize: '1.1rem' }}>Connect Gitea</div>
                <button onClick={() => { setShowAdvanced(false); setSelectedProvider('github'); }} style={{ background: 'transparent', border: 'none', color: '#260000', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="gitea-endpoint" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Gitea Endpoint:
                </label>
                <input
                  id="gitea-endpoint"
                  type="url"
                  value={giteaConfig.endpoint}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://git.example.com"
                  className="editable-title-input"
                  style={{ width: '100%', fontSize: '0.9rem', padding: '8px' }}
                />
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="gitea-username" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Username:
                </label>
                <input
                  id="gitea-username"
                  type="text"
                  value={giteaConfig.user}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, user: e.target.value }))}
                  placeholder="your-username"
                  className="editable-title-input"
                  style={{ width: '100%', fontSize: '0.9rem', padding: '8px' }}
                />
              </div>
              
              <div style={{ marginBottom: '15px' }}>
                <label htmlFor="gitea-repo" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Repository Name:
                </label>
                <input
                  id="gitea-repo"
                  type="text"
                  value={giteaConfig.repo}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, repo: e.target.value }))}
                  placeholder="knowledge-base"
                  className="editable-title-input"
                  style={{ width: '100%', fontSize: '0.9rem', padding: '8px' }}
                />
              </div>
              
              <div style={{ marginBottom: '20px' }}>
                <label htmlFor="gitea-token" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Access Token:
                </label>
                <input
                  id="gitea-token"
                  type="password"
                  value={giteaConfig.token}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="your-token"
                  className="editable-title-input"
                  style={{ width: '100%', fontSize: '0.9rem', padding: '8px' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => { setShowAdvanced(false); setSelectedProvider('github'); }}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: 'transparent',
                    color: '#666',
                    border: '1px solid #666',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || !giteaConfig.endpoint || !giteaConfig.user || !giteaConfig.repo || !giteaConfig.token}
                  style={{
                    padding: '10px 16px',
                    backgroundColor: isConnecting ? '#ccc' : '#260000',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  {isConnecting ? 'Connecting...' : 'Connect to Gitea'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Global Save Status Overlay */}
        {isSaving && (
          <div style={{
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: 10000,
            padding: '12px 16px',
            backgroundColor: '#260000',
            color: '#bdb5b5',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.9rem',
            fontWeight: 600
          }}>
            <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
            Saving to Git...
          </div>
        )}

        {/* Unsaved Changes Warning */}
        {!isSaving && hasUnsavedChanges && gitSyncEngine && (
          <div style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 9999,
            padding: '8px 12px',
            backgroundColor: '#ff9800',
            color: '#fff',
            borderRadius: '6px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer'
          }}
          onClick={handleSaveToGit}
          title="Click to save now or press Ctrl+S"
          >
            • Unsaved changes - Click to save
          </div>
        )}

        {error && (
          <div style={{ 
            marginTop: '8px', 
            padding: '10px', 
            backgroundColor: '#ffebee', 
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#d32f2f',
            fontSize: '0.8rem'
          }}>
            {error}
          </div>
        )}
      </div>
    );
  }
  if (!isConnected) {
    return (
      <div 
        style={{ 
          padding: '15px', 
          fontFamily: "'EmOne', sans-serif", 
          height: '100%', 
          color: '#260000',
          pointerEvents: isInteractive ? 'auto' : 'none',
          opacity: isVisible ? 1 : 0.5
        }}
      >
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#260000', marginBottom: '10px', fontSize: '1.1rem' }}>
            <GitBranch size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Git-Native Semantic Web
          </h3>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '15px' }}>
            Connect to any Git provider for real-time, decentralized storage of your own semantic web.
          </p>
        </div>

        {/* Repository Manager Modal */}
        {showRepositoryManager && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
          }}>
            <div style={{ 
              width: '800px', 
              height: '600px',
              maxWidth: '90%', 
              maxHeight: '90%',
              backgroundColor: '#bdb5b5', 
              border: '1px solid #260000', 
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden'
            }}>
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '16px',
                borderBottom: '1px solid #260000'
              }}>
                <div style={{ fontWeight: 'bold', color: '#260000', fontSize: '1.1rem' }}>Repository Manager</div>
                <button 
                  onClick={() => setShowRepositoryManager(false)} 
                  style={{ 
                    background: 'transparent', 
                    border: 'none', 
                    color: '#260000', 
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    padding: '4px'
                  }}
                >
                  ✕
                </button>
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <RepositoryManager 
                  onSelectRepository={handleRepositoryManagerSelect}
                  showCreateOption={true}
                />
              </div>
            </div>
          </div>
        )}

        {/* Repository selection modal (OAuth/GitHub App) */}
        {showRepositorySelector && (pendingOAuth || githubAppInstallation) && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
          }}>
            <div style={{ width: '520px', maxWidth: '90%', backgroundColor: '#bdb5b5', border: '1px solid #260000', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ fontWeight: 'bold', color: '#260000' }}>Select Repository</div>
                <button onClick={() => { setShowRepositorySelector(false); setPendingOAuth(null); setGithubAppInstallation(null); }} style={{ background: 'transparent', border: 'none', color: '#260000', cursor: 'pointer' }}>✕</button>
              </div>
              <div style={{ 
                backgroundColor: '#979090', 
                border: '1px solid #260000', 
                borderRadius: '4px', 
                padding: '8px', 
                marginBottom: '10px',
                fontSize: '0.85rem',
                color: '#260000'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                  Connected as: @{(pendingOAuth || githubAppInstallation)?.username || 'unknown'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                  <span>Choose an existing repository or create a new one for your universe.</span>
                  <a 
                    href={`https://github.com/${(pendingOAuth || githubAppInstallation)?.username || 'user'}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ 
                      color: '#260000', 
                      textDecoration: 'underline',
                      fontWeight: '500',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    View Profile →
                  </a>
                </div>
              </div>
              <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #260000', borderRadius: '6px', backgroundColor: '#979090' }}>
                {userRepositories.map((repo) => (
                  <div key={repo.full_name}
                    onClick={() => handleSelectRepository(repo.name, false, false)}
                    style={{ 
                      padding: '8px 10px', 
                      borderBottom: '1px solid #260000', 
                      cursor: 'pointer', 
                      color: '#260000',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => e.target.style.backgroundColor = '#bdb5b5'}
                    onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                  >
                    <div style={{ fontWeight: 600 }}>{repo.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#333' }}>{repo.description || 'No description'}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input id="new-repo-name" type="text" placeholder="my-redstring-repo (create on GitHub first)" style={{ flex: 1, padding: '8px', border: '1px solid #260000', borderRadius: '4px', backgroundColor: '#979090', color: '#260000' }} />
                <button onClick={() => {
                  const input = document.getElementById('new-repo-name');
                  const name = input && input.value ? String(input.value).trim() : '';
                  if (!name) return;
                  handleSelectRepository(name, false, true);
                }}
                  style={{ 
                    padding: '8px 12px', 
                    backgroundColor: '#260000', 
                    color: '#bdb5b5', 
                    border: 'none', 
                    borderRadius: '4px', 
                    cursor: 'pointer',
                    transition: 'background-color 0.2s'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#333'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = '#260000'}
                >
                  Link Repository
                </button>
              </div>
            </div>
          </div>
        )}

        {/* GitHub App Repository Access Helper */}
        {githubAppInstallation && userRepositories.length === 0 && !showRepositorySelector && (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
          }}>
            <div style={{ width: '520px', maxWidth: '90%', backgroundColor: '#bdb5b5', border: '1px solid #260000', borderRadius: '8px', padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <div style={{ fontWeight: 'bold', color: '#260000', fontSize: '1.1rem' }}>Repository Access Required</div>
                <button onClick={() => { setGithubAppInstallation(null); setError(null); }} style={{ background: 'transparent', border: 'none', color: '#260000', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
              </div>
              
              <div style={{ marginBottom: '15px', color: '#260000', lineHeight: '1.4' }}>
                <p style={{ margin: '0 0 10px 0' }}>
                  <strong>GitHub App installed successfully</strong> for @{githubAppInstallation.username}, but no repositories are accessible.
                </p>
                <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem' }}>
                  This happens when:
                </p>
                <ul style={{ margin: '0 0 15px 20px', fontSize: '0.9rem' }}>
                  <li>No repositories were selected during installation</li>
                  <li>Repository access was revoked after installation</li>
                  <li>The app needs additional repository permissions</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button
                  onClick={() => {
                    const appName = 'redstring-semantic-sync-test'; // Use dev app name
                    window.open(`https://github.com/settings/installations`, '_blank');
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: '#260000',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Manage App Settings
                </button>
                <button
                  onClick={() => {
                    // Try to reinstall/reconfigure
                    handleGitHubApp();
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    color: '#260000',
                    border: '1px solid #260000',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Reconfigure App
                </button>
                <button
                  onClick={() => {
                    setGithubAppInstallation(null);
                    setError(null);
                  }}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    color: '#666',
                    border: '1px solid #666',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Authentication Status Indicator */}
        {(currentProvider || githubAppInstallation || pendingOAuth) && (
          <div style={{ marginBottom: '15px', padding: '12px', backgroundColor: '#e8f5e8', border: '1px solid #4caf50', borderRadius: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#2e7d32' }}>
              <span style={{ fontWeight: 'bold' }}>🔗 Connected:</span>
              {githubAppInstallation && (
                <span>
                  <strong>GitHub App</strong> (@{githubAppInstallation.username}) • 
                  <span style={{ color: '#1976d2', marginLeft: '4px' }}>Optimized Auto-Save</span>
                </span>
              )}
              {pendingOAuth && (
                <span>
                  <strong>OAuth</strong> (@{pendingOAuth.username}) • 
                  <span style={{ color: '#f57c00', marginLeft: '4px' }}>Standard Sync</span>
                </span>
              )}
              {currentProvider && !githubAppInstallation && !pendingOAuth && (
                <span>
                  <strong>{currentProvider.authMethod === 'github-app' ? 'GitHub App' : 'OAuth'}</strong> 
                  ({currentProvider.user}/{currentProvider.repo}) • 
                  <span style={{ color: currentProvider.authMethod === 'github-app' ? '#1976d2' : '#f57c00', marginLeft: '4px' }}>
                    {currentProvider.authMethod === 'github-app' ? 'Optimized Auto-Save' : 'Standard Sync'}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Provider Selection */}
        <div style={{ marginBottom: '20px', marginTop: '30px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ color: '#260000', margin: 0, fontSize: '1.3rem' }}>
                Setup
            </h4>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              style={{
                padding: '4px 8px',
                backgroundColor: 'transparent',
                color: '#260000',
                border: '1px solid #979090',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontFamily: "'EmOne', sans-serif"
              }}
            >
              {showAdvanced ? 'Hide' : 'Show'} Advanced
            </button>
          </div>

          {/* Provider Type Selection */}
          <div style={{ marginBottom: '15px' }}>
            <InfoTooltip tooltip="Choose your Git provider. GitHub is recommended for beginners, while Gitea offers self-hosted control.">
              <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                Git Provider:
              </label>
            </InfoTooltip>
            <div style={{ display: 'flex', gap: '8px' }}>
              {availableProviders.map(provider => (
                <button
                  key={provider.type}
                  onClick={() => setSelectedProvider(provider.type)}
                  style={{
                    flex: 1,
                    padding: '8px',
                    backgroundColor: selectedProvider === provider.type ? '#260000' : 'transparent',
                    color: selectedProvider === provider.type ? '#bdb5b5' : '#260000',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontFamily: "'EmOne', sans-serif"
                  }}
                >
                  {provider.name}
                </button>
              ))}
            </div>
          </div>

          {/* GitHub Configuration */}
          {selectedProvider === 'github' && (
            <div>
              <div style={{ 
                marginBottom: '12px', 
                padding: '8px', 
                backgroundColor: '#979090', 
                borderRadius: '4px', 
                fontSize: '0.8rem', 
                color: '#260000',
                textAlign: 'center'
              }}>
                💡 <strong>Two ways to connect:</strong> Paste any GitHub URL directly, or use Browse button
              </div>
              {/* Manual Configuration (Token Method) */}
              {authMethod === 'token' && (
                <>
                  <div style={{ marginBottom: '10px' }}>
                    <InfoTooltip tooltip="Your GitHub username (e.g., 'johndoe'). This will be used to create your semantic space.">
                      <label htmlFor="github-username" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                        GitHub Username:
                      </label>
                    </InfoTooltip>
                    <input
                      id="github-username"
                      type="text"
                      value={providerConfig.user}
                      onChange={(e) => setProviderConfig(prev => ({ ...prev, user: e.target.value }))}
                      placeholder="your-username"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #979090',
                        borderRadius: '4px',
                        fontSize: '0.9rem',
                        fontFamily: "'EmOne', sans-serif",
                        backgroundColor: '#bdb5b5',
                        color: '#260000',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                  
                                <div style={{ marginBottom: '10px' }}>
                                <InfoTooltip tooltip="Enter the repository name or full GitHub URL (e.g., 'MyWeb' or 'https://github.com/grantiguess/MyWeb.git'), or browse your repositories">
                  <label htmlFor="github-repo" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Repository:
                  </label>
                </InfoTooltip>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                  <input
                    id="github-repo"
                    type="text"
                    value={providerConfig.repo}
                    onChange={(e) => {
                      let repoName = e.target.value;
                      
                      // Handle GitHub URLs like IDE cloning
                      if (repoName.includes('github.com')) {
                        // Extract repo name from URL
                        const match = repoName.match(/github\.com\/([^\/]+)\/([^\/]+)/);
                        if (match) {
                          repoName = match[2].replace('.git', '');
                          // Also update the user if it's different
                          if (match[1] !== providerConfig.user) {
                            setProviderConfig(prev => ({ 
                              ...prev, 
                              user: match[1],
                              repo: repoName 
                            }));
                            return;
                          }
                        }
                      }
                      
                      setProviderConfig(prev => ({ ...prev, repo: repoName }));
                    }}
                    placeholder="repo-name or https://github.com/user/repo.git"
                    style={{
                      flex: 1,
                      padding: '8px',
                      border: '1px solid #979090',
                      borderRadius: '4px',
                      fontSize: '0.9rem',
                      fontFamily: "'EmOne', sans-serif",
                      backgroundColor: '#bdb5b5',
                      color: '#260000',
                      boxSizing: 'border-box'
                    }}
                  />
                  <div style={{ minWidth: '100px' }}>
                    <RepositoryDropdown
                      selectedRepository={null}
                      onSelectRepository={(repo) => {
                        console.log('[GitNativeFederation] Repository selected from dropdown:', repo.name);
                        // Update the repo input field
                        setProviderConfig(prev => ({ 
                          ...prev, 
                          repo: repo.name,
                          user: repo.owner?.login || prev.user 
                        }));
                      }}
                      placeholder="Browse Repos"
                      disabled={!isAuthenticated}
                    />
                  </div>
                </div>
            </div>

            <div style={{ marginBottom: '10px' }}>
              <InfoTooltip tooltip="Universe slug identifies this workspace within your repository. Each universe gets its own folder (e.g., 'default', 'personal', 'work'). Use different slugs to organize multiple cognitive spaces.">
                <label htmlFor="universe-slug" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Universe Slug:
                </label>
              </InfoTooltip>
              <input
                id="universe-slug"
                type="text"
                value={universeSlug}
                onChange={(e) => {
                  const slug = e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
                  setUniverseSlug(slug || 'default');
                }}
                placeholder="default"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #979090',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  fontFamily: "'EmOne', sans-serif",
                  backgroundColor: '#bdb5b5',
                  color: '#260000',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                Files will be saved to: universes/{universeSlug}/universe.redstring
              </div>
            </div>
                </>
              )}

              {/* GitHub App Authentication */}
              <div style={{ marginBottom: '15px' }}>
                <InfoTooltip tooltip="GitHub App provides the most secure and reliable authentication with repository-specific permissions.">
                  <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Authentication:
                  </label>
                </InfoTooltip>
              </div>

              {/* OAuth Configuration */}
              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="OAuth authentication allows you to create repositories and browse your existing repositories. Required for repository creation.">
                  <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    OAuth Authentication:
                  </label>
                </InfoTooltip>
                <button
                  onClick={handleGitHubAuth}
                  disabled={isConnecting}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: isConnecting ? '#ccc' : isAuthenticated ? '#28a745' : '#260000',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Github size={16} />
                  {isConnecting ? 'Connecting...' : isAuthenticated ? `✓ Signed in as ${authStatus.userData?.login || 'user'}` : 'Sign in with GitHub'}
                </button>
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                  {isAuthenticated ? 'Can create repositories • Full repo access' : 'Required for repository creation • Browse repositories'}
                </div>
              </div>

              {/* GitHub App Configuration */}
              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="GitHub App provides the most secure and reliable authentication. Install the RedString app to your GitHub account or organization to get started.">
                  <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    GitHub App:
                  </label>
                </InfoTooltip>
                <button
                  onClick={handleGitHubApp}
                  disabled={isConnecting}
                  style={{
                    width: '100%',
                    padding: '10px',
                    backgroundColor: isConnecting ? '#ccc' : '#260000',
                    color: '#bdb5b5',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: isConnecting ? 'not-allowed' : 'pointer',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Github size={16} />
                  {isConnecting ? 'Connecting...' : 'Connect GitHub App'}
                </button>
                <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                  Secure • Persistent • Repository-specific permissions
                </div>
              </div>

              {/* Complete Installation Button (for admin/testing cases) */}
              {showCompleteInstallation && (
                <div style={{ marginTop: '15px' }}>
                  <button
                    onClick={handleCompleteInstallation}
                    disabled={isConnecting}
                    style={{
                      width: '100%',
                      padding: '10px',
                      backgroundColor: isConnecting ? '#ccc' : '#28a745',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: isConnecting ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                      fontFamily: "'EmOne', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Github size={16} />
                    {isConnecting ? 'Completing Installation...' : 'Complete Installation (ID: 83404431)'}
                  </button>
                  <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px', textAlign: 'center' }}>
                    Use this if GitHub didn't redirect back automatically
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Gitea Configuration */}
          {selectedProvider === 'gitea' && (
            <div>
              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="The URL of your self-hosted Gitea instance (e.g., 'https://git.example.com').">
                  <label htmlFor="gitea-endpoint" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Gitea Endpoint:
                  </label>
                </InfoTooltip>
                <input
                  id="gitea-endpoint"
                  type="url"
                  value={giteaConfig.endpoint}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, endpoint: e.target.value }))}
                  placeholder="https://git.example.com"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    backgroundColor: '#bdb5b5',
                    color: '#260000',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="Your username on the Gitea instance.">
                  <label htmlFor="gitea-username" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Username:
                  </label>
                </InfoTooltip>
                <input
                  id="gitea-username"
                  type="text"
                  value={giteaConfig.user}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, user: e.target.value }))}
                  placeholder="your-username"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    backgroundColor: '#bdb5b5',
                    color: '#260000',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              
              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="The repository name where your semantic data will be stored. Create this repository on Gitea first.">
                  <label htmlFor="gitea-repo" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Repository Name:
                  </label>
                </InfoTooltip>
                <input
                  id="gitea-repo"
                  type="text"
                  value={giteaConfig.repo}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, repo: e.target.value }))}
                  placeholder="knowledge-base"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    backgroundColor: '#bdb5b5',
                    color: '#260000',
                    boxSizing: 'border-box'
                                  }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <InfoTooltip tooltip="Universe slug identifies this workspace within your repository. Each universe gets its own folder (e.g., 'default', 'personal', 'work'). Use different slugs to organize multiple cognitive spaces.">
                <label htmlFor="gitea-universe-slug" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                  Universe Slug:
                </label>
              </InfoTooltip>
              <input
                id="gitea-universe-slug"
                type="text"
                value={universeSlug}
                onChange={(e) => {
                  const slug = e.target.value.replace(/[^a-zA-Z0-9-_]/g, '').toLowerCase();
                  setUniverseSlug(slug || 'default');
                }}
                placeholder="default"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #979090',
                  borderRadius: '4px',
                  fontSize: '0.9rem',
                  fontFamily: "'EmOne', sans-serif",
                  backgroundColor: '#bdb5b5',
                  color: '#260000',
                  boxSizing: 'border-box'
                }}
              />
              <div style={{ fontSize: '0.8rem', color: '#666', marginTop: '4px' }}>
                Files will be saved to: universes/{universeSlug}/universe.redstring
              </div>
            </div>
            
            <div style={{ marginBottom: '10px' }}>
              <InfoTooltip tooltip="Create an access token in your Gitea user settings with 'repo' permissions.">
                  <label htmlFor="gitea-token" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Access Token:
                  </label>
                </InfoTooltip>
                <input
                  id="gitea-token"
                  type="password"
                  value={giteaConfig.token}
                  onChange={(e) => setGiteaConfig(prev => ({ ...prev, token: e.target.value }))}
                  placeholder="your-token"
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    fontSize: '0.9rem',
                    fontFamily: "'EmOne', sans-serif",
                    backgroundColor: '#bdb5b5',
                    color: '#260000',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}

          {/* Advanced Settings */}
          {showAdvanced && (
            <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
              
              {/* Source of Truth Configuration */}
              <div style={{ marginBottom: '15px', padding: '10px', backgroundColor: '#fff3cd', border: '1px solid #ffeaa7', borderRadius: '4px' }}>
                <div style={{ fontWeight: 'bold', color: '#856404', marginBottom: '8px', fontSize: '0.9rem' }}>
                  ⚙️ Data Source Configuration
                </div>
                
                <div style={{ marginBottom: '10px' }}>
                  <InfoTooltip tooltip="Choose whether your local RedString file or the Git repository is the authoritative source. LOCAL (recommended): Your local file is the master copy, Git is backup. GIT (experimental): Git repository overrides local changes.">
                    <label style={{ display: 'block', color: '#856404', marginBottom: '5px', fontSize: '0.8rem' }}>
                      Source of Truth:
                    </label>
                  </InfoTooltip>
                  
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#856404' }}>
                      <input
                        type="radio"
                        name="sourceOfTruth"
                        value="local"
                        checked={sourceOfTruthMode === 'local'}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSourceOfTruthMode('local');
                            setGitSourceOfTruth('local');
                            if (gitSyncEngine) {
                              gitSyncEngine.setSourceOfTruth('local');
                            }
                          }
                        }}
                      />
                      <span style={{ fontWeight: sourceOfTruthMode === 'local' ? 'bold' : 'normal' }}>
                        LOCAL (Safe) - RedString file is master
                      </span>
                    </label>
                    
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: '#856404' }}>
                      <input
                        type="radio"
                        name="sourceOfTruth"
                        value="git"
                        checked={sourceOfTruthMode === 'git'}
                        onChange={(e) => {
                          if (e.target.checked) {
                            const confirmed = window.confirm(
                              'WARNING: Git mode will make the Git repository the authoritative source. ' +
                              'This means Git changes can overwrite your local RedString file. ' +
                              'Only enable this if you understand the risks. Continue?'
                            );
                            if (confirmed) {
                              setSourceOfTruthMode('git');
                              setGitSourceOfTruth('git');
                              if (gitSyncEngine) {
                                gitSyncEngine.setSourceOfTruth('git');
                              }
                            }
                          }
                        }}
                      />
                      <span style={{ fontWeight: sourceOfTruthMode === 'git' ? 'bold' : 'normal', color: sourceOfTruthMode === 'git' ? '#dc3545' : '#856404' }}>
                        GIT (Experimental) - Git overrides local
                      </span>
                    </label>
                  </div>
                </div>
                
                {sourceOfTruthMode === 'git' && (
                  <div style={{ padding: '8px', backgroundColor: '#f8d7da', border: '1px solid #f5c6cb', borderRadius: '3px', fontSize: '0.75rem', color: '#721c24' }}>
                    ⚠️ <strong>Warning:</strong> Git mode enabled. Local changes may be overwritten by Git repository content.
                  </div>
                )}
              </div>

              <div style={{ marginBottom: '10px' }}>
                <InfoTooltip tooltip="The folder name where semantic files will be stored in your repository. 'schema' is the recommended default.">
                  <label htmlFor="schema-path" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.8rem' }}>
                    Schema Path:
                  </label>
                </InfoTooltip>
                <input
                  id="schema-path"
                  type="text"
                  value={selectedProvider === 'github' ? providerConfig.semanticPath : giteaConfig.semanticPath}
                  onChange={(e) => {
                    if (selectedProvider === 'github') {
                      setProviderConfig(prev => ({ ...prev, semanticPath: e.target.value }));
                    } else {
                      setGiteaConfig(prev => ({ ...prev, semanticPath: e.target.value }));
                    }
                  }}
                  placeholder="schema"
                  style={{
                    width: '100%',
                    padding: '6px',
                    border: '1px solid #979090',
                    borderRadius: '4px',
                    fontSize: '0.8rem',
                    fontFamily: "'EmOne', sans-serif",
                    backgroundColor: '#bdb5b5',
                    color: '#260000',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Connection Button - Only for non-GitHub providers */}
        {selectedProvider !== 'github' && (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 15px',
              backgroundColor: isConnecting ? '#ccc' : '#260000',
              color: '#bdb5b5',
              border: 'none',
              borderRadius: '4px',
              cursor: isConnecting ? 'not-allowed' : 'pointer',
              fontSize: '0.9rem',
              fontFamily: "'EmOne', sans-serif",
              width: '100%',
              justifyContent: 'center'
            }}
          >
            <GitBranch size={16} />
            {isConnecting ? 'Connecting...' : 'Connect to Git Provider'}
          </button>
        )}

        {error && (
          <div style={{ 
            marginTop: '15px', 
            padding: '10px', 
            backgroundColor: '#ffebee', 
            border: '1px solid #f44336',
            borderRadius: '4px',
            color: '#d32f2f',
            fontSize: '0.8rem'
          }}>
            <div style={{ marginBottom: '8px' }}>{error}</div>
            {error.includes('GitHub App') && (
              <button
                onClick={() => {
                  // Clear all GitHub App session storage
                  Object.keys(sessionStorage).forEach(key => {
                    if (key.startsWith('github_app_handled_') || key === 'github_app_auto_retry_attempted' || key === 'github_app_pending') {
                      sessionStorage.removeItem(key);
                    }
                  });
                  setError(null);
                  setGithubAppInstallation(null);
                  setShowCompleteInstallation(false);
                  console.log('[GitNativeFederation] Cleared GitHub App session data for retry');
                }}
                style={{
                  padding: '4px 8px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  fontSize: '0.75rem',
                  fontFamily: "'EmOne', sans-serif"
                }}
              >
                Clear & Retry
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div 
      style={{ 
        padding: '15px', 
        fontFamily: "'EmOne', sans-serif", 
        height: '100%', 
        color: '#260000',
        pointerEvents: isInteractive ? 'auto' : 'none',
        opacity: isVisible ? 1 : 0.5
      }}
    >
      {/* Connection Status */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GitBranch size={20} color="#260000" />
            <div>
              <div style={{ color: '#260000', fontWeight: 'bold', fontSize: '0.9rem' }}>
                Connected to {currentProvider?.name}
              </div>
              <div style={{ color: '#666', fontSize: '0.8rem' }}>
                {selectedProvider === 'github' ? 
                  `${providerConfig.user}/${providerConfig.repo}` : 
                  `${giteaConfig.endpoint}/${giteaConfig.user}/${giteaConfig.repo}`
                }
              </div>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              backgroundColor: '#bdb5b5',
              color: '#260000',
              border: '1px solid #979090',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            <XCircle size={14} />
            Disconnect
          </button>
        </div>

        {/* Sync Status */}
        {syncStatus && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px', 
            backgroundColor: syncStatus.type === 'error' ? '#ffebee' : '#bdb5b5',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            {syncStatus.type === 'error' ? (
              <XCircle size={14} color="#d32f2f" />
            ) : syncStatus.type === 'success' ? (
              <CheckCircle size={14} color="#260000" />
            ) : (
              <RefreshCw size={14} color="#666" />
            )}
            <span style={{ color: syncStatus.type === 'error' ? '#d32f2f' : '#260000' }}>
              {syncStatus.status}
            </span>
          </div>
        )}

        {/* Content Status */}
        {gitSyncEngine && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px', 
            backgroundColor: gitSyncEngine.getStatus().isInErrorBackoff ? '#ffebee' :
                           gitSyncEngine.getStatus().isDragging ? '#EFE8E5' : 
                           gitSyncEngine.getStatus().hasChanges ? '#e8f5e8' : '#f5f5f5',
            borderRadius: '4px',
            fontSize: '0.8rem',
            marginTop: '8px',
            border: gitSyncEngine.getStatus().isInErrorBackoff ? '1px solid #f44336' : 'none'
          }}>
            {gitSyncEngine.getStatus().isInErrorBackoff ? (
              <AlertCircle size={14} color="#d32f2f" />
            ) : gitSyncEngine.getStatus().isDragging ? (
              <RefreshCw size={14} color="#ff9800" />
            ) : gitSyncEngine.getStatus().hasChanges ? (
              <CheckCircle size={14} color="#2e7d32" />
            ) : (
              <RefreshCw size={14} color="#666" />
            )}
            <span style={{ 
              color: gitSyncEngine.getStatus().isInErrorBackoff ? '#d32f2f' :
                     gitSyncEngine.getStatus().isPaused ? '#ff9800' :
                     gitSyncEngine.getStatus().isDragging ? '#e65100' : 
                     gitSyncEngine.getStatus().hasChanges ? '#2e7d32' : '#666',
              flex: 1
            }}>
              {gitSyncEngine.getStatus().isInErrorBackoff 
                ? `Sync paused due to errors • ${gitSyncEngine.getStatus().consecutiveErrors} failures`
                : gitSyncEngine.getStatus().isPaused
                  ? 'Sync paused (panel not active)'
                  : gitSyncEngine.getStatus().isDragging 
                    ? 'Auto-save enabled • Dragging in progress...' 
                    : gitSyncEngine.getStatus().hasChanges 
                      ? 'Auto-save enabled • Changes pending' 
                      : 'Auto-save enabled • No changes to commit'
              }
            </span>
            {gitSyncEngine.getStatus().isInErrorBackoff && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => {
                    try {
                      gitSyncEngine.restart();
                      setSyncStatus({ type: 'info', status: 'Sync engine restarted' });
                    } catch (error) {
                      setSyncStatus({ type: 'error', status: `Restart failed: ${error.message}` });
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#f44336',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 'bold'
                  }}
                >
                  Restart Sync
                </button>
                <button
                  onClick={async () => {
                    try {
                      const activeUniverse = getActiveUniverse();
                      if (activeUniverse) {
                        await universeManager.resolveSyncConflict(activeUniverse);
                      }
                    } catch (error) {
                      setSyncStatus({ type: 'error', status: `Conflict resolution failed: ${error.message}` });
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    cursor: 'pointer',
                    fontSize: '0.7rem',
                    fontWeight: 'bold'
                  }}
                >
                  Resolve Conflict
                </button>
              </div>
            )}
          </div>
        )}

        {/* Rate Limit Status */}
        {isConnected && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px', 
            padding: '8px', 
            backgroundColor: '#f5f5f5',
            borderRadius: '4px',
            fontSize: '0.8rem',
            marginTop: '8px'
          }}>
            <span style={{ color: '#666' }}>
              API Usage: {(() => {
                const stats = githubRateLimiter.getUsageStats(providerConfig.authMethod);
                const percentUsed = Math.round(stats.percentUsed);
                const color = percentUsed > 80 ? '#d32f2f' : percentUsed > 60 ? '#ff9800' : '#2e7d32';
                return (
                  <span style={{ color, fontWeight: 'bold' }}>
                    {stats.used}/{stats.limit} ({percentUsed}%)
                  </span>
                );
              })()}
            </span>
          </div>
        )}

        {/* Source of Truth Toggle */}
        {gitSyncEngine && (
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            padding: '12px', 
            backgroundColor: sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#EFE8E5' : '#f3e5f5',
            borderRadius: '4px',
            fontSize: '0.8rem',
            marginTop: '8px',
            border: `1px solid ${sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#ff9800' : '#9c27b0'}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={14} color={sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#ff9800' : '#9c27b0'} />
              <span style={{ color: sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#e65100' : '#4a148c' }}>
                Source of Truth: <strong>{sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL ? '.redstring File' : 'Git Repository'}</strong>
              </span>
            </div>
            <button
              onClick={handleToggleSourceOfTruth}
              style={{
                padding: '4px 8px',
                backgroundColor: sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#ff9800' : '#9c27b0',
                color: '#EFE8E5',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.7rem',
                fontFamily: "'EmOne', sans-serif"
              }}
              title={sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL 
                ? 'Switch to Git mode (experimental)' 
                : 'Switch to RedString mode (safe)'}
            >
              {sourceOfTruthMode === SOURCE_OF_TRUTH.LOCAL ? 'Use Git' : 'Use RedString'}
            </button>
          </div>
        )}

        {/* Git-only Mode Toggle */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '12px', 
          backgroundColor: gitOnlyMode ? '#e8f5e8' : '#f5f5f5',
          borderRadius: '4px',
          fontSize: '0.8rem',
          marginTop: '8px',
          border: `1px solid ${gitOnlyMode ? '#4caf50' : '#ccc'}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Globe size={14} color={gitOnlyMode ? '#2e7d32' : '#666'} />
            <span style={{ color: gitOnlyMode ? '#2e7d32' : '#666' }}>
              Git-only Mode: <strong>{gitOnlyMode ? 'Enabled (ignore local .redstring)' : 'Disabled (may read local)'}</strong>
            </span>
          </div>
          <button
            onClick={() => setGitOnlyMode(!gitOnlyMode)}
            style={{
              padding: '4px 8px',
              backgroundColor: gitOnlyMode ? '#4caf50' : '#9e9e9e',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer',
              fontSize: '0.7rem',
              fontFamily: "'EmOne', sans-serif"
            }}
            title={gitOnlyMode 
              ? 'Currently ignoring local .redstring content (load only from Git)'
              : 'Enable to load only from Git and ignore local .redstring content'}
          >
            {gitOnlyMode ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>

      {/* Federation Stats */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <h4 style={{ color: '#260000', marginBottom: '10px', fontSize: '0.9rem' }}>
          <Network size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Federation Network
        </h4>
        
        {federationStats ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem' }}>
            <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#bdb5b5', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', color: '#260000' }}>
                {federationStats.activeSubscriptions}
              </div>
              <div style={{ color: '#666' }}>Active Subscriptions</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#bdb5b5', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', color: '#260000' }}>
                {federationStats.totalSubscribedConcepts}
              </div>
              <div style={{ color: '#666' }}>External Concepts</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#bdb5b5', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', color: '#260000' }}>
                {federationStats.cachedExternalConcepts}
              </div>
              <div style={{ color: '#666' }}>Cached Concepts</div>
            </div>
            
            <div style={{ textAlign: 'center', padding: '8px', backgroundColor: '#bdb5b5', borderRadius: '4px' }}>
              <div style={{ fontWeight: 'bold', color: '#260000' }}>
                <Zap size={12} style={{ verticalAlign: 'middle' }} />
              </div>
              <div style={{ color: '#666' }}>Real-time Sync</div>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666', fontSize: '0.8rem' }}>
            Loading federation data...
          </div>
        )}
      </div>

      {/* Add Subscription */}
      <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
        <h4 style={{ color: '#260000', marginBottom: '10px', fontSize: '0.9rem' }}>
          <Plus size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
          Add Subscription
        </h4>
        
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            id="subscription-url"
            type="url"
            value={newSubscriptionUrl}
            onChange={(e) => setNewSubscriptionUrl(e.target.value)}
            placeholder="https://alice.github.io/semantic/"
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #979090',
              borderRadius: '4px',
              fontSize: '0.9rem',
              fontFamily: "'EmOne', sans-serif",
              backgroundColor: '#bdb5b5',
              color: '#260000'
            }}
          />
          <button
            onClick={handleAddSubscription}
            disabled={isAddingSubscription || !newSubscriptionUrl.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              backgroundColor: isAddingSubscription ? '#ccc' : '#260000',
              color: '#bdb5b5',
              border: 'none',
              borderRadius: '4px',
              cursor: isAddingSubscription ? 'not-allowed' : 'pointer',
              fontSize: '0.8rem',
              fontFamily: "'EmOne', sans-serif"
            }}
          >
            <Plus size={14} />
            {isAddingSubscription ? 'Adding...' : 'Subscribe'}
          </button>
        </div>
      </div>

      {/* Subscriptions List */}
      {subscriptions.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <h4 style={{ color: '#260000', marginBottom: '10px', fontSize: '0.9rem' }}>
            <Users size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            My Subscriptions ({subscriptions.length})
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {subscriptions.map((subscription, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  backgroundColor: '#979090',
                  border: '1px solid #260000',
                  borderRadius: '6px',
                  fontSize: '0.8rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 'bold', color: '#260000' }}>
                      {subscription.name}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.7rem' }}>
                      {subscription.concepts.size} concepts • Last checked: {new Date(subscription.lastChecked).toLocaleTimeString()}
                    </div>
                    {subscription.lastUpdate && (
                      <div style={{ color: '#4caf50', fontSize: '0.7rem' }}>
                        Updated: {new Date(subscription.lastUpdate).toLocaleTimeString()}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      onClick={() => window.open(subscription.url, '_blank')}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        color: '#260000',
                        border: '1px solid #979090',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                      title="Open in browser"
                    >
                      <ExternalLink size={12} />
                    </button>
                    <button
                      onClick={() => handleRemoveSubscription(subscription.url)}
                      style={{
                        padding: '4px',
                        backgroundColor: 'transparent',
                        color: '#d32f2f',
                        border: '1px solid #d32f2f',
                        borderRadius: '3px',
                        cursor: 'pointer',
                        fontSize: '0.7rem'
                      }}
                      title="Unsubscribe"
                    >
                      <XCircle size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button
          onClick={handleForceSync}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: '#260000',
            color: '#bdb5b5',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontFamily: "'EmOne', sans-serif",
            justifyContent: 'center'
          }}
        >
          <RefreshCw size={14} />
          Force Sync
        </button>
        
        <button
          onClick={handleInitializeRepository}
          disabled={isConnecting}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: isConnecting ? '#ccc' : '#260000',
            color: '#bdb5b5',
            border: 'none',
            borderRadius: '4px',
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            fontFamily: "'EmOne', sans-serif",
            justifyContent: 'center'
          }}
        >
          <GitBranchPlus size={14} />
          {isConnecting ? 'Initializing...' : 'Initialize Repository'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
        <button
          onClick={handleSaveToGit}
          disabled={isConnecting}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: isConnecting ? '#ccc' : '#260000',
            color: '#bdb5b5',
            border: 'none',
            borderRadius: '4px',
            cursor: isConnecting ? 'not-allowed' : 'pointer',
            fontSize: '0.8rem',
            fontFamily: "'EmOne', sans-serif",
            justifyContent: 'center'
          }}
        >
          <Upload size={14} />
          {isConnecting ? 'Saving...' : 'Save to Git'}
        </button>
        
        <button
          onClick={handleMigrateProvider}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            backgroundColor: 'transparent',
            color: '#260000',
            border: '1px solid #979090',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontFamily: "'EmOne', sans-serif",
            justifyContent: 'center'
          }}
        >
          <GitBranchPlus size={14} />
          Migrate
        </button>
      </div>

      {/* Repository selection modal (OAuth/GitHub App) */}
      {showRepositorySelector && (pendingOAuth || githubAppInstallation) && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
        }}>
          <div style={{ width: '520px', maxWidth: '90%', backgroundColor: '#bdb5b5', border: '1px solid #260000', borderRadius: '8px', padding: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontWeight: 'bold', color: '#260000' }}>Select Repository</div>
              <button onClick={() => { setShowRepositorySelector(false); setPendingOAuth(null); setGithubAppInstallation(null); }} style={{ background: 'transparent', border: 'none', color: '#260000', cursor: 'pointer' }}>✕</button>
            </div>
            <div style={{ 
              backgroundColor: '#979090', 
              border: '1px solid #260000', 
              borderRadius: '4px', 
              padding: '8px', 
              marginBottom: '10px',
              fontSize: '0.85rem',
              color: '#260000'
            }}>
              <div style={{ fontWeight: '600', marginBottom: '2px' }}>
                Connected as: @{(pendingOAuth || githubAppInstallation)?.username || 'unknown'}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem' }}>
                <span>Choose an existing repository or create a new one for your universe.</span>
                <a 
                  href={`https://github.com/${(pendingOAuth || githubAppInstallation)?.username || 'user'}`} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    color: '#260000', 
                    textDecoration: 'underline',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  View Profile →
                </a>
              </div>
            </div>
            <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '10px', border: '1px solid #260000', borderRadius: '6px', backgroundColor: '#979090' }}>
              {userRepositories.map((repo) => (
                <div key={repo.full_name}
                  onClick={() => handleSelectRepository(repo.name, false, false)}
                  style={{ 
                    padding: '8px 10px', 
                    borderBottom: '1px solid #260000', 
                    cursor: 'pointer', 
                    color: '#260000',
                    transition: 'background-color 0.2s',
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = '#bdb5b5'}
                  onMouseLeave={(e) => e.target.style.backgroundColor = 'transparent'}
                >
                  <div style={{ fontWeight: 600 }}>{repo.full_name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#333' }}>{repo.description || 'No description'}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input id="new-repo-name" type="text" placeholder="my-redstring-repo (create on GitHub first)" style={{ flex: 1, padding: '8px', border: '1px solid #260000', borderRadius: '4px', backgroundColor: '#979090', color: '#260000' }} />
              <button onClick={() => {
                const input = document.getElementById('new-repo-name');
                const name = input && input.value ? String(input.value).trim() : '';
                if (!name) return;
                handleSelectRepository(name, false, true);
              }}
                style={{ 
                  padding: '8px 12px', 
                  backgroundColor: '#260000', 
                  color: '#bdb5b5', 
                  border: 'none', 
                  borderRadius: '4px', 
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.backgroundColor = '#333'}
                onMouseLeave={(e) => e.target.style.backgroundColor = '#260000'}
              >
                Link Repository
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Button */}
      <div style={{ marginTop: '15px', padding: '10px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <button
          onClick={runGitFederationTests}
          style={{
            width: '100%',
            padding: '10px',
            backgroundColor: '#260000',
            color: '#bdb5b5',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '0.9rem',
            fontFamily: "'EmOne', sans-serif",
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px'
          }}
        >
          <GitCompare size={16} />
          Run Git Federation Tests
        </button>
      </div>


      {error && (
        <div style={{ 
          marginTop: '15px', 
          padding: '10px', 
          backgroundColor: '#ffebee', 
          border: '1px solid #f44336',
          borderRadius: '4px',
          color: '#d32f2f',
          fontSize: '0.8rem'
        }}>
          <div style={{ marginBottom: '8px' }}>{error}</div>
          {error.includes('GitHub App') && (
            <button
              onClick={() => {
                // Clear all GitHub App session storage
                Object.keys(sessionStorage).forEach(key => {
                  if (key.startsWith('github_app_handled_') || key === 'github_app_auto_retry_attempted' || key === 'github_app_pending') {
                    sessionStorage.removeItem(key);
                  }
                });
                setError(null);
                setGithubAppInstallation(null);
                setShowCompleteInstallation(false);
                console.log('[GitNativeFederation] Cleared GitHub App session data for retry');
              }}
              style={{
                padding: '4px 8px',
                backgroundColor: '#f44336',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontFamily: "'EmOne', sans-serif"
              }}
            >
              Clear & Retry
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default GitNativeFederation; 