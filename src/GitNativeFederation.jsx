/**
 * Git-Native Federation Component
 * Revolutionary protocol implementation with hot-swappable Git providers
 * Achieves real-time responsiveness, true decentralization, and censorship resistance
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
import { SemanticSyncEngine } from './services/semanticSyncEngine.js';
import { SemanticFederation } from './services/semanticFederation.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from './services/gitSyncEngine.js';
import useGraphStore from './store/graphStore.js';
import { importFromRedstring } from './formats/redstringFormat.js';

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
  const [federationStats, setFederationStats] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState(null);
  const [newSubscriptionUrl, setNewSubscriptionUrl] = useState('');
  const [isAddingSubscription, setIsAddingSubscription] = useState(false);
  const [authMethod, setAuthMethod] = useState('oauth'); // 'token' or 'oauth'
  const [userRepositories, setUserRepositories] = useState([]);
  const [showRepositorySelector, setShowRepositorySelector] = useState(false);
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

  // Restore Git connection on mount
  useEffect(() => {
    if (gitConnection && !currentProvider) {
      console.log('[GitNativeFederation] Restoring saved Git connection:', gitConnection);
      
      // Show restoring status
      setSyncStatus({
        type: 'success',
        status: 'Restoring saved connection...'
      });
      
      // Restore provider config
      setProviderConfig(gitConnection);
      setSelectedProvider(gitConnection.type);
      
      // Create provider from saved config
      const provider = SemanticProviderFactory.createProvider(gitConnection);
      setCurrentProvider(provider);
      setIsConnected(true);
      
      console.log('[GitNativeFederation] Git connection restored successfully');
      
      // Clear the status after 3 seconds
      setTimeout(() => {
        setSyncStatus(null);
      }, 3000);
    }
  }, [gitConnection, currentProvider]);

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
      const newGitSyncEngine = new GitSyncEngine(currentProvider, sourceOfTruthMode);
      setGitSyncEngine(newGitSyncEngine);
      setGitSyncEngineStore(newGitSyncEngine);
      
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
              // Import the merged data (only if local is empty)
              importFromRedstring(mergedData, storeActions);
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
            
            // Import the data into the store
            importFromRedstring(redstringData, storeActions);
            
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
  }, [currentProvider, syncEngine, providerConfig.repo]);

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

  // Handle OAuth callback
  useEffect(() => {
    const handleOAuthCallback = async () => {
      console.log('[GitNativeFederation] OAuth callback handler started');
      
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const state = urlParams.get('state');
      const error = urlParams.get('error');
      
      console.log('[GitNativeFederation] URL params:', { code: !!code, state: !!state, error });
      
      if (error) {
        console.error('[GitNativeFederation] OAuth error from GitHub:', error);
        setError(`OAuth error: ${error}`);
        // Clean up URL and redirect
        window.history.replaceState({}, document.title, window.location.pathname);
        return;
      }
      
      if (code && state) {
        const storedState = sessionStorage.getItem('github_oauth_state');
        console.log('[GitNativeFederation] State validation:', { received: state, stored: storedState });
        
        if (state !== storedState) {
          console.error('[GitNativeFederation] OAuth state mismatch');
          setError('OAuth state mismatch. Please try again.');
          // Clean up URL and redirect
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }
        
        // Clear the state
        sessionStorage.removeItem('github_oauth_state');
        
        try {
          setIsConnecting(true);
          setError(null);
          
          console.log('[GitNativeFederation] Exchanging code for token...');
          
          // Exchange code for access token
          const tokenResponse = await fetch('http://localhost:3001/api/github/oauth/token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              code,
              state,
              redirect_uri: window.location.origin + '/oauth/callback'
            })
          });
          
          console.log('[GitNativeFederation] Token response status:', tokenResponse.status);
          
          if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error('[GitNativeFederation] Token exchange failed:', errorText);
            throw new Error(`Failed to exchange code for token: ${tokenResponse.status} ${errorText}`);
          }
          
          const tokenData = await tokenResponse.json();
          console.log('[GitNativeFederation] Token exchange successful');
          
          const accessToken = tokenData.access_token;
          
          console.log('[GitNativeFederation] Fetching user information...');
          
          // Fetch user information from GitHub
          const userResponse = await fetch('https://api.github.com/user', {
            headers: {
              'Authorization': `token ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          
          if (!userResponse.ok) {
            throw new Error('Failed to fetch user information from GitHub');
          }
          
          const userData = await userResponse.json();
          const username = userData.login;
          console.log('[GitNativeFederation] User authenticated:', username);
          
          // Fetch user's repositories
          const reposResponse = await fetch(`https://api.github.com/user/repos?type=owner&sort=updated&per_page=100`, {
            headers: {
              'Authorization': `token ${accessToken}`,
              'Accept': 'application/vnd.github.v3+json'
            }
          });
          
          if (!reposResponse.ok) {
            throw new Error('Failed to fetch repositories from GitHub');
          }
          
          const reposData = await reposResponse.json();
          const repositories = reposData.map(repo => ({
            name: repo.name,
            full_name: repo.full_name,
            description: repo.description,
            private: repo.private,
            created_at: repo.created_at,
            updated_at: repo.updated_at
          }));
          
          console.log('[GitNativeFederation] Found repositories:', repositories.length);
          
          console.log('[GitNativeFederation] Found repositories:', repositories.length);
          
          // Auto-select the first repository (but let user change it later)
          const defaultRepo = repositories.find(repo => repo.name.includes('semantic') || repo.name.includes('knowledge')) || 
                             repositories[0] || 
                             { name: 'semantic-knowledge', full_name: `${username}/semantic-knowledge` };
          
          console.log('[GitNativeFederation] Auto-selected repo:', defaultRepo.name);
          
          // Create provider with real OAuth token and user data
          const oauthConfig = {
            type: 'github',
            user: username,
            repo: defaultRepo.name,
            token: accessToken,
            authMethod: 'oauth',
            semanticPath: 'schema'
          };
          
          const provider = SemanticProviderFactory.createProvider(oauthConfig);
          const isAvailable = await provider.isAvailable();
          
          if (!isAvailable) {
            throw new Error('OAuth authentication failed. Please try again.');
          }
          
          // Store user data and repositories for later use
          provider.userData = userData;
          provider.repositories = repositories;
          
          setCurrentProvider(provider);
          setProviderConfig(oauthConfig);
          setUserRepositories(repositories);
          setIsConnected(true);
          setError(null);
          
          // Save connection to persistent store
          setGitConnection(oauthConfig);
          
          console.log('[GitNativeFederation] OAuth authentication successful!');
          
          console.log('[GitNativeFederation] OAuth authentication successful!');
          
          // Clean up URL immediately
          window.history.replaceState({}, document.title, window.location.pathname);
          
          // Also clean up on component mount if URL still has OAuth params
          if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
          
        } catch (err) {
          console.error('[GitNativeFederation] OAuth callback failed:', err);
          setError(`OAuth authentication failed: ${err.message}`);
          // Clean up URL and redirect
          window.history.replaceState({}, document.title, window.location.pathname);
        } finally {
          setIsConnecting(false);
        }
      } else {
        console.log('[GitNativeFederation] No OAuth parameters found in URL');
        // Clean up URL if no OAuth parameters
        if (window.location.search.includes('code=') || window.location.search.includes('error=')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      }
    };
    
    handleOAuthCallback();
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

  // Handle GitHub OAuth
  const handleGitHubOAuth = async () => {
    try {
      setIsConnecting(true);
      setError(null);
      
      // Try real GitHub OAuth first, fallback to demo mode
      const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID;
      
      // If we have a real client ID, use real OAuth
      if (clientId && clientId !== 'your-github-client-id' && clientId !== 'your-github-client-id-here') {
        console.log('[GitNativeFederation] Using real GitHub OAuth');
        
        const redirectUri = encodeURIComponent(window.location.origin + '/oauth/callback');
        const scope = encodeURIComponent('repo');
        const state = Math.random().toString(36).substring(7);
        
        sessionStorage.setItem('github_oauth_state', state);
        
        const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
        window.location.href = githubOAuthUrl;
        return;
      }
      
      // Fallback to demo mode
      console.log('[GitNativeFederation] Using demo OAuth flow');
      
      try {
        setIsConnecting(true);
        setError(null);
        
        // Simulate OAuth process with realistic timing
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Generate realistic mock data based on common GitHub patterns
        const mockUserData = {
          login: 'demo-user',
          name: 'Demo User',
          email: 'demo@example.com',
          avatar_url: 'https://avatars.githubusercontent.com/u/123456?v=4',
          public_repos: 15,
          followers: 42,
          following: 23
        };
        
        const mockRepositories = [
          { 
            name: 'semantic-knowledge', 
            full_name: 'demo-user/semantic-knowledge', 
            description: 'Personal knowledge base using semantic web technologies', 
            private: false,
            created_at: '2024-01-15T10:30:00Z',
            updated_at: new Date().toISOString()
          },
          { 
            name: 'my-project', 
            full_name: 'demo-user/my-project', 
            description: 'A sample project for demonstration', 
            private: false,
            created_at: '2024-02-20T14:15:00Z',
            updated_at: new Date().toISOString()
          },
          { 
            name: 'private-notes', 
            full_name: 'demo-user/private-notes', 
            description: 'Private notes and thoughts', 
            private: true,
            created_at: '2024-03-10T09:45:00Z',
            updated_at: new Date().toISOString()
          },
          { 
            name: 'learning-notes', 
            full_name: 'demo-user/learning-notes', 
            description: 'Notes from various learning resources', 
            private: false,
            created_at: '2024-01-05T16:20:00Z',
            updated_at: new Date().toISOString()
          }
        ];
        
        // Create provider with realistic configuration
        const mockProvider = {
          name: 'GitHub (Demo Mode)',
          config: {
            type: 'github',
            user: 'demo-user',
            repo: 'semantic-knowledge',
            token: 'demo_token_secure',
            authMethod: 'oauth',
            semanticPath: 'schema'
          },
          userData: mockUserData,
          repositories: mockRepositories,
          isAvailable: async () => true,
          // Add realistic provider methods
          getUserInfo: async () => mockUserData,
          getRepositories: async () => mockRepositories,
          createRepository: async (name, description, isPrivate = false) => {
            const newRepo = {
              name,
              full_name: `demo-user/${name}`,
              description,
              private: isPrivate,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            mockRepositories.push(newRepo);
            return newRepo;
          }
        };
        
        setCurrentProvider(mockProvider);
        setProviderConfig(mockProvider.config);
        setUserRepositories(mockRepositories);
        setShowRepositorySelector(true);
        setIsConnected(true);
        setError(null);
        
        // Save connection to persistent store
        setGitConnection(mockProvider.config);
        
        console.log('[GitNativeFederation] Zero-config OAuth successful! Ready to use.');
        return;
        
      } catch (err) {
        console.error('[GitNativeFederation] OAuth failed:', err);
        setError(`OAuth authentication failed: ${err.message}`);
        setIsConnecting(false);
        return;
      }
      
      const redirectUri = encodeURIComponent(window.location.origin + '/oauth/callback');
      const scope = encodeURIComponent('repo');
      const state = Math.random().toString(36).substring(7); // CSRF protection
      
      // Store state for verification
      sessionStorage.setItem('github_oauth_state', state);
      
      const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}`;
      
      // Redirect to GitHub OAuth
      window.location.href = githubOAuthUrl;
      
    } catch (err) {
      console.error('[GitNativeFederation] OAuth failed:', err);
      setError(`OAuth authentication failed: ${err.message}`);
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

        {/* Provider Selection */}
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
            <h4 style={{ color: '#260000', margin: 0, fontSize: '0.9rem' }}>
              <Settings size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
              Provider Configuration
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
                <InfoTooltip tooltip="Enter the repository name or full GitHub URL (e.g., 'MyWeb' or 'https://github.com/grantiguess/MyWeb.git')">
                  <label htmlFor="github-repo" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Repository:
                  </label>
                </InfoTooltip>
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
                  placeholder="MyWeb or https://github.com/user/repo.git"
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
                </>
              )}

              {/* OAuth Configuration */}
              {authMethod === 'oauth' && (
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#e8f5e8', 
                  borderRadius: '6px', 
                  fontSize: '0.8rem',
                  color: '#2e7d32',
                  marginBottom: '15px',
                  border: '1px solid #4caf50'
                }}>
                  <strong>✅ Zero-Config OAuth:</strong> Click "Connect with GitHub" below to instantly connect with demo data. No GitHub setup required!
                </div>
              )}


              
              {/* Authentication Method Selection */}
              <div style={{ marginBottom: '15px' }}>
                <InfoTooltip tooltip="Choose between Personal Access Token (manual) or OAuth (automatic). OAuth is easier but requires app setup.">
                  <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Authentication Method:
                  </label>
                </InfoTooltip>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                  <button
                    onClick={() => setAuthMethod('token')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: authMethod === 'token' ? '#260000' : 'transparent',
                      color: authMethod === 'token' ? '#bdb5b5' : '#260000',
                      border: '1px solid #979090',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontFamily: "'EmOne', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Key size={14} />
                    Token
                  </button>
                  <button
                    onClick={() => setAuthMethod('oauth')}
                    style={{
                      flex: 1,
                      padding: '8px',
                      backgroundColor: authMethod === 'oauth' ? '#260000' : 'transparent',
                      color: authMethod === 'oauth' ? '#bdb5b5' : '#260000',
                      border: '1px solid #979090',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontFamily: "'EmOne', sans-serif",
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px'
                    }}
                  >
                    <Github size={14} />
                    OAuth
                  </button>
                </div>
              </div>

              {/* Token Input */}
              {authMethod === 'token' && (
                <div style={{ marginBottom: '10px' }}>
                  <InfoTooltip tooltip="Create a Personal Access Token on GitHub. For fine-grained tokens, ensure 'Contents' read/write permissions. For classic tokens, use 'repo' scope. Go to Settings > Developer settings > Personal access tokens.">
                    <label htmlFor="github-token" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                      Personal Access Token:
                    </label>
                  </InfoTooltip>
                  <input
                    id="github-token"
                    type="password"
                    value={providerConfig.token}
                    onChange={(e) => setProviderConfig(prev => ({ ...prev, token: e.target.value }))}
                    placeholder="ghp_..."
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
              )}

              {/* OAuth Button */}
              {authMethod === 'oauth' && (
                <div style={{ marginBottom: '10px' }}>
                  <InfoTooltip tooltip="Click to connect with GitHub OAuth. Works immediately with demo data - no setup required!">
                    <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                      GitHub OAuth:
                    </label>
                  </InfoTooltip>
                  <button
                    onClick={handleGitHubOAuth}
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
                    {isConnecting ? 'Authenticating...' : 'Connect with GitHub'}
                  </button>
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

        {/* Connection Button */}
        {!(authMethod === 'oauth' && selectedProvider === 'github') && (
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
            {error}
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
            backgroundColor: gitSyncEngine.getStatus().isDragging ? '#fff3e0' : 
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
            backgroundColor: sourceOfTruthMode === SOURCE_OF_TRUTH.GIT ? '#fff3e0' : '#f3e5f5',
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
                color: 'white',
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
                  border: '1px solid #bdb5b5',
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
          {error}
        </div>
      )}
    </div>
  );
};

export default GitNativeFederation; 