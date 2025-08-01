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
  const [authMethod, setAuthMethod] = useState('token'); // 'token' or 'oauth'

  // Initialize sync engine and federation when provider changes
  useEffect(() => {
    if (currentProvider && !syncEngine) {
      const newSyncEngine = new SemanticSyncEngine(providerConfig);
      const newFederation = new SemanticFederation(newSyncEngine);
      
      setSyncEngine(newSyncEngine);
      setFederation(newFederation);
      
      // Subscribe to status updates
      newSyncEngine.onStatusChange((status) => {
        setSyncStatus(status);
      });
      
      // Load initial data
      newSyncEngine.loadFromProvider();
    }
  }, [currentProvider, syncEngine]);

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
        throw new Error(`Cannot connect to ${provider.name}. Please check your configuration.`);
      }
      
      setCurrentProvider(provider);
      setIsConnected(true);
      
    } catch (err) {
      console.error('[GitNativeFederation] Connection failed:', err);
      setError(`Connection failed: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  // Handle GitHub OAuth
  const handleGitHubOAuth = () => {
    // For now, this would redirect to GitHub OAuth
    // In a real implementation, you'd set up OAuth flow
    const clientId = 'your-github-client-id'; // Would come from environment
    const redirectUri = encodeURIComponent(window.location.origin + '/oauth/callback');
    const scope = encodeURIComponent('repo');
    const githubOAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=${scope}`;
    
    window.open(githubOAuthUrl, '_blank');
  };

  // Disconnect from provider
  const handleDisconnect = () => {
    setCurrentProvider(null);
    setSyncEngine(null);
    setFederation(null);
    setIsConnected(false);
    setSyncStatus(null);
    setFederationStats(null);
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
  const InfoTooltip = ({ children, tooltip }) => (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      {children}
      <div
        style={{
          position: 'relative',
          marginLeft: '4px',
          cursor: 'help'
        }}
        title={tooltip}
      >
        <Info size={14} color="#666" />
      </div>
    </div>
  );

  if (!isConnected) {
    return (
      <div style={{ padding: '15px', fontFamily: "'EmOne', sans-serif", height: '100%', color: '#260000' }}>
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ color: '#260000', marginBottom: '10px', fontSize: '1.1rem' }}>
            <GitBranch size={20} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
            Git-Native Semantic Web
          </h3>
          <p style={{ color: '#666', fontSize: '0.9rem', marginBottom: '15px' }}>
            Connect to any Git provider for real-time, decentralized semantic storage with censorship resistance.
          </p>
          <div style={{ 
            padding: '12px', 
            backgroundColor: '#f0f0f0', 
            borderRadius: '6px', 
            fontSize: '0.8rem',
            color: '#555',
            marginBottom: '15px'
          }}>
            <strong>What is this?</strong> This revolutionary protocol treats Git repositories as the fundamental unit of semantic storage, enabling real-time collaboration while maintaining true decentralization and censorship resistance.
          </div>
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
                <InfoTooltip tooltip="The repository name where your semantic data will be stored. Create this repository on GitHub first.">
                  <label htmlFor="github-repo" style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                    Repository Name:
                  </label>
                </InfoTooltip>
                <input
                  id="github-repo"
                  type="text"
                  value={providerConfig.repo}
                  onChange={(e) => setProviderConfig(prev => ({ ...prev, repo: e.target.value }))}
                  placeholder="semantic-knowledge"
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
                  <InfoTooltip tooltip="Create a Personal Access Token on GitHub with 'repo' permissions. Go to Settings > Developer settings > Personal access tokens.">
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
                  <InfoTooltip tooltip="Click to authenticate with GitHub using OAuth. You'll be redirected to GitHub to authorize this application.">
                    <label style={{ display: 'block', color: '#260000', marginBottom: '5px', fontSize: '0.9rem' }}>
                      GitHub OAuth:
                    </label>
                  </InfoTooltip>
                  <button
                    onClick={handleGitHubOAuth}
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
                    <Github size={16} />
                    Connect with GitHub
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
        <button
          onClick={handleConnect}
          disabled={isConnecting || (authMethod === 'oauth' && selectedProvider === 'github')}
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
          {isConnecting ? 'Connecting...' : (authMethod === 'oauth' && selectedProvider === 'github') ? 'Use OAuth Button Above' : 'Connect to Git Provider'}
        </button>

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
            backgroundColor: syncStatus.type === 'error' ? '#ffebee' : '#e8f5e8',
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            {syncStatus.type === 'error' ? (
              <XCircle size={14} color="#d32f2f" />
            ) : syncStatus.type === 'success' ? (
              <CheckCircle size={14} color="#4caf50" />
            ) : (
              <RefreshCw size={14} color="#666" />
            )}
            <span style={{ color: syncStatus.type === 'error' ? '#d32f2f' : '#666' }}>
              {syncStatus.status}
            </span>
          </div>
        )}
      </div>

      {/* Federation Stats */}
      {federationStats && (
        <div style={{ marginBottom: '20px', padding: '15px', backgroundColor: '#979090', borderRadius: '8px' }}>
          <h4 style={{ color: '#260000', marginBottom: '10px', fontSize: '0.9rem' }}>
            <Network size={16} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
            Federation Network
          </h4>
          
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
        </div>
      )}

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
      <div style={{ display: 'flex', gap: '8px' }}>
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