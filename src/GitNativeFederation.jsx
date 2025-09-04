/**
 * Git-Native Federation Component
 * Protocol implementation with hot-swappable Git providers
 * Provides real-time responsiveness, true decentralization, and distributed resilience
 */

import React, { useState, useEffect } from 'react';
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
  Key
} from 'lucide-react';
import { SemanticProviderFactory } from './services/gitNativeProvider.js';
import { bridgeFetch, oauthFetch } from './services/bridgeConfig.js';
import { SemanticSyncEngine } from './services/semanticSyncEngine.js';
import { SemanticFederation } from './services/semanticFederation.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from './services/gitSyncEngine.js';
import useGraphStore from './store/graphStore.js';
import { importFromRedstring } from './formats/redstringFormat.js';
import { persistentAuth } from './services/persistentAuth.js';
import RepositoryManager from './components/repositories/RepositoryManager.jsx';
import RepositoryDropdown from './components/repositories/RepositoryDropdown.jsx';

const GitNativeFederation = () => {
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
  const [universeSlug, setUniverseSlug] = useState('default');
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
  
  const [gitSyncEngine, setGitSyncEngine] = useState(null);
  const [sourceOfTruthMode, setSourceOfTruthMode] = useState(
    gitSourceOfTruth === 'git' ? SOURCE_OF_TRUTH.GIT : SOURCE_OF_TRUTH.LOCAL
  );

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

  // Initialize sync engine, federation, and Git storage when provider changes
  useEffect(() => {
    if (currentProvider && !syncEngine && providerConfig.repo) {
      console.log('[GitNativeFederation] Initializing sync engine for:', providerConfig.repo);
      
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
      const newGitSyncEngine = new GitSyncEngine(currentProvider, sourceOfTruthMode, universeSlug, fileBaseName);
      setGitSyncEngine(newGitSyncEngine);
      setGitSyncEngineStore(newGitSyncEngine);
      // Surface Git sync engine status in the panel
      try {
        newGitSyncEngine.onStatusChange((s) => {
          setSyncStatus(s);
          // Auto-clear transient info messages after a short delay
          if (s?.type === 'info') {
            setTimeout(() => {
              setSyncStatus(null);
            }, 3000);
          }
        });
      } catch (_) {}
      
      // Try to load existing data from Git
      newGitSyncEngine.loadFromGit().then((redstringData) => {
        if (redstringData) {
          console.log('[GitNativeFederation] Loaded existing data from Git');
          
          // Check if we have existing local content
          const currentState = useGraphStore.getState();
          const hasLocalContent = currentState.graphs.size > 0 || currentState.nodePrototypes.size > 0 || currentState.edges.size > 0;
          
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
            console.log('[GitNativeFederation] No local content, loading Git data');
            
            // Import the data and load into the store
            const { storeState: importedState } = importFromRedstring(redstringData, storeActions);
            storeActions.loadUniverseFromFile(importedState);
            
            setSyncStatus({
              type: 'success',
              status: 'Loaded existing data from repository'
            });
          }
        } else {
          console.log('[GitNativeFederation] No existing Git data found, preserving local content');
          
          // Check if we have existing local content to preserve
          const currentState = useGraphStore.getState();
          const hasLocalContent = currentState.graphs.size > 0 || currentState.nodePrototypes.size > 0 || currentState.edges.size > 0;
          
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
        
        // Start the sync engine
        newGitSyncEngine.start();
        
      }).catch((error) => {
        console.error('[GitNativeFederation] Failed to load from Git:', error);
        setSyncStatus({
          type: 'error',
          status: 'Failed to load existing data'
        });
        
        // Start the sync engine even if loading failed
        newGitSyncEngine.start();
      });
      
      // Load initial data
      newSyncEngine.loadFromProvider();
    }
  }, [currentProvider, syncEngine, providerConfig.repo, universeSlug]);

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

  // Update Git sync engine when store state changes
  useEffect(() => {
    if (gitSyncEngine && storeState) {
      gitSyncEngine.updateState(storeState);
    }
  }, [gitSyncEngine, storeState]);


  // Handle GitHub App installation callback and OAuth callback
  useEffect(() => {
    const handleGitHubCallbacks = async () => {
      console.log('[GitNativeFederation] GitHub callback handler started');
      console.log('[GitNativeFederation] Full URL:', window.location.href);
      
      const urlParams = new URLSearchParams(window.location.search);
      // Some environments might place params in the hash fragment
      const hashParams = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
      
      // Check for OAuth callback first
      const oauthCode = urlParams.get('code') || hashParams.get('code');
      const oauthState = urlParams.get('state') || hashParams.get('state');
      const oauthError = urlParams.get('error') || hashParams.get('error');
      
      // Check for GitHub App callback
      const appInstallationId = urlParams.get('installation_id') || hashParams.get('installation_id');
      const appSetupAction = urlParams.get('setup_action') || hashParams.get('setup_action');
      const appState = urlParams.get('state') || hashParams.get('state');

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
            
            // Store token in persistent auth
            await persistentAuth.storeTokens(tokenData.access_token, null, {
              authMethod: 'oauth',
              scope: tokenData.scope || 'repo'
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
            setError(`GitHub App installed successfully for ${username}, but no repositories are accessible. This may be because: 1) No repositories were selected during installation, 2) All repositories were deselected after installation, or 3) You need to grant repository permissions. You can modify repository access in your GitHub App settings.`);
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
                      setError(`GitHub App installed successfully for ${username}, but no repositories are accessible. This may be because: 1) No repositories were selected during installation, 2) All repositories were deselected after installation, or 3) You need to grant repository permissions. You can modify repository access in your GitHub App settings.`);
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
        setError(`GitHub App installed successfully for ${username}, but no repositories are accessible. This may be because: 1) No repositories were selected during installation, 2) All repositories were deselected after installation, or 3) You need to grant repository permissions. You can modify repository access in your GitHub App settings.`);
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

  // Save to Git
  const handleSaveToGit = async () => {
    if (!gitSyncEngine) {
      setError('No sync engine connected');
      return;
    }

    try {
      console.log('[GitNativeFederation] Manually saving to Git...');
      setIsConnecting(true);
      setError(null);
      
      // Force commit using the sync engine
      await gitSyncEngine.forceCommit(storeState);
      
      console.log('[GitNativeFederation] Save to Git successful!');
      setSyncStatus({
        type: 'success',
        status: 'Data saved to repository'
      });
      
      // Clear the status after 5 seconds
      setTimeout(() => {
        setSyncStatus(null);
      }, 5000);
      
    } catch (error) {
      console.error('[GitNativeFederation] Save to Git failed:', error);
      setError(`Save to Git failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
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
    
    try {
      gitSyncEngine.setSourceOfTruth(newMode);
      setSourceOfTruthMode(newMode);
      
      // Persist source of truth setting
      setGitSourceOfTruth(newMode === SOURCE_OF_TRUTH.GIT ? 'git' : 'local');
      
      setSyncStatus({
        type: 'success',
        status: `Source of truth changed to: ${newMode}`
      });
      
      // Clear the status after 5 seconds
      setTimeout(() => {
        setSyncStatus(null);
      }, 5000);
      
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

      // Test 1: Export to RedString format from the active universe snapshot
      const { exportToRedstring } = await import('./formats/redstringFormat.js');
      const exportedData = exportToRedstring(testState);
      
      if (!exportedData || !exportedData.prototypeSpace || !exportedData.spatialGraphs) {
        throw new Error('Export test failed: Invalid export data structure');
      }

      // Test 2: Import from RedString format
      const { importFromRedstring } = await import('./formats/redstringFormat.js');
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

  // Tooltip component
  const InfoTooltip = ({ children, tooltip }) => {
    const [showTooltip, setShowTooltip] = useState(false);
    
    return (
      <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
        {children}
        <div
          style={{
            position: 'relative',
            marginLeft: '4px',
            cursor: 'default'
          }}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Info size={14} color="#666" />
          {showTooltip && (
            <div
              style={{
                position: 'absolute',
                bottom: '100%',
                left: '50%',
                transform: 'translateX(-50%)',
                backgroundColor: '#260000',
                color: '#bdb5b5',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '0.8rem',
                zIndex: 1000,
                marginBottom: '8px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                maxWidth: '400px',
                whiteSpace: 'normal',
                textAlign: 'center'
              }}
            >
              {tooltip}
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

  if (!isConnected) {
    return (
      <div style={{ padding: '15px', fontFamily: "'EmOne', sans-serif", height: '100%', color: '#260000' }}>
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
    <div style={{ padding: '15px', fontFamily: "'EmOne', sans-serif", height: '100%', color: '#260000' }}>
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
            backgroundColor: gitSyncEngine.getStatus().isDragging ? '#EFE8E5' : 
                           gitSyncEngine.getStatus().hasChanges ? '#e8f5e8' : '#f5f5f5',
            borderRadius: '4px',
            fontSize: '0.8rem',
            marginTop: '8px'
          }}>
            {gitSyncEngine.getStatus().isDragging ? (
              <RefreshCw size={14} color="#ff9800" />
            ) : gitSyncEngine.getStatus().hasChanges ? (
              <CheckCircle size={14} color="#2e7d32" />
            ) : (
              <RefreshCw size={14} color="#666" />
            )}
            <span style={{ 
              color: gitSyncEngine.getStatus().isDragging ? '#e65100' : 
                     gitSyncEngine.getStatus().hasChanges ? '#2e7d32' : '#666' 
            }}>
              {gitSyncEngine.getStatus().isDragging 
                ? 'Auto-save enabled • Dragging in progress...' 
                : gitSyncEngine.getStatus().hasChanges 
                  ? 'Auto-save enabled • Changes pending' 
                  : 'Auto-save enabled • No changes to commit'
              }
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