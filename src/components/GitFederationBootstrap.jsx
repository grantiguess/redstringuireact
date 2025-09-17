import React, { useEffect, useRef } from 'react';
import useGraphStore from '../store/graphStore.jsx';
import { SemanticProviderFactory } from '../services/gitNativeProvider.js';
import { oauthFetch } from '../services/bridgeConfig.js';
import { persistentAuth } from '../services/persistentAuth.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from '../services/gitSyncEngine.js';
import { importFromRedstring } from '../formats/redstringFormat.js';
// Lazy manager to avoid circular init
let __um = null;
const getUniverseManager = async () => {
  if (!__um) {
    const mod = await import('../services/universeManager.js');
    __um = mod.default || mod.universeManager;
  }
  return __um;
};
import startupCoordinator from '../services/startupCoordinator.js';
import * as fileStorageModule from '../store/fileStorage.js';

// Headless bootstrapper to restore Git federation early (before UI panels mount)
export default function GitFederationBootstrap() {
  const gitConnection = useGraphStore(state => state.gitConnection);
  const gitSourceOfTruth = useGraphStore(state => state.gitSourceOfTruth);
  const setGitConnection = useGraphStore(state => state.setGitConnection);
  const setGitSyncEngine = useGraphStore(state => state.setGitSyncEngine);
  const existingEngine = useGraphStore(state => state.gitSyncEngine);
  const storeActionsRef = useRef(null);

  if (!storeActionsRef.current) {
    // Keep a stable ref to store actions without causing re-renders
    storeActionsRef.current = useGraphStore.getState();
  }

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      try {
        if (cancelled) return;
        if (existingEngine) return; // Already initialized
        if (!gitConnection) return; // Nothing to restore

        // Avoid demo connections
        if (gitConnection.token === 'demo_token_secure' || gitConnection.user === 'demo-user') {
          return;
        }

        let restoredConfig = { ...gitConnection };

        // Refresh token depending on auth method
        try {
          if (gitConnection.authMethod === 'github-app' && gitConnection.installationId) {
            const installationResponse = await oauthFetch('/api/github/app/installation-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ installation_id: gitConnection.installationId })
            });
            if (installationResponse.ok) {
              const installationData = await installationResponse.json();
              restoredConfig.token = installationData.token;
            }
          } else if (gitConnection.authMethod === 'oauth' || !gitConnection.authMethod) {
            const auth = persistentAuth.getAuthStatus();
            if (auth.isAuthenticated && !restoredConfig.token) {
              const token = await persistentAuth.getAccessToken();
              if (token) restoredConfig.token = token;
            }
            if (!restoredConfig.token) {
              const sessionToken = sessionStorage.getItem('github_access_token');
              if (sessionToken) restoredConfig.token = sessionToken;
            }
          }
        } catch (_) {}

        // Create provider and verify availability
        const provider = SemanticProviderFactory.createProvider(restoredConfig);
        const available = await provider.isAvailable();
        if (!available) return;

        // Persist sanitized connection (avoid storing volatile token)
        setGitConnection({ ...restoredConfig, token: undefined });

        // Link this Git connection to the active universe
        const um = await getUniverseManager();
        const activeUniverse = um.getActiveUniverse();
        if (activeUniverse && restoredConfig.user && restoredConfig.repo) {
          try {
            um.updateUniverse(activeUniverse.slug, {
              gitRepo: {
                ...activeUniverse.gitRepo,
                enabled: true,
                linkedRepo: { 
                  type: 'github', 
                  user: restoredConfig.user, 
                  repo: restoredConfig.repo 
                },
                schemaPath: restoredConfig.semanticPath || 'schema',
                universeFolder: `universes/${activeUniverse.slug}`
              }
            });
          } catch (error) {
            console.warn('[GitFederationBootstrap] Failed to link repository to active universe:', error);
          }
        }

        // Determine universe file base name from current file status if possible
        let fileBaseName = 'universe';
        try {
          const fileStatus = storeActionsRef.current.getFileStatus?.();
          if (fileStatus?.fileName && fileStatus.fileName.endsWith('.redstring')) {
            fileBaseName = fileStatus.fileName.replace(/\.redstring$/i, '');
          }
        } catch {}

        const sourceOfTruthMode = activeUniverse?.sourceOfTruth === 'local' ? SOURCE_OF_TRUTH.LOCAL : SOURCE_OF_TRUTH.GIT;
        const universeSlug = um.activeUniverseSlug || 'universe';

        // Check with startup coordinator if we're allowed to initialize
        const canInitialize = await startupCoordinator.requestEngineInitialization(universeSlug, 'GitFederationBootstrap');
        if (!canInitialize) {
          // Reduce log noise outside of dev: only warn once per mount cycle
          try {
            if (!window.__rs_bootstrap_blocked_once) {
              console.log('[GitFederationBootstrap] Startup coordinator blocked initialization - another component is handling it');
              window.__rs_bootstrap_blocked_once = true;
              setTimeout(() => { window.__rs_bootstrap_blocked_once = false; }, 3000);
            }
          } catch (_) {}
          return;
        }

        // Double check if there's already an engine for this universe
        if (um.getGitSyncEngine(universeSlug)) {
          console.log('[GitFederationBootstrap] Engine already exists for universe, skipping creation');
          return;
        }
        
        const engine = new GitSyncEngine(provider, sourceOfTruthMode, universeSlug, fileBaseName, um);
        if (cancelled) return;
        
        // If engine creation was rejected, don't proceed
        if (!engine.isRunning) {
          console.log('[GitFederationBootstrap] Engine creation was rejected, stopping');
          return;
        }

        // Mark store as ready immediately to avoid panel delay (only once)
        try {
          const { isUniverseLoaded } = useGraphStore.getState();
          if (!isUniverseLoaded) {
            useGraphStore.setState({ isUniverseLoaded: true, isUniverseLoading: false });
          }
        } catch (_) {}

        // Load from Git and import if needed
        try {
          const redstringData = await engine.loadFromGit();
          if (cancelled) return;
          if (redstringData) {
            const { storeState } = importFromRedstring(redstringData, storeActionsRef.current);
            storeActionsRef.current.loadUniverseFromFile(storeState);
          }
        } catch (_) {}

        // Start engine and expose in store with retry mechanism
        engine.start();
        if (!cancelled) {
          setGitSyncEngine(engine);
          
          // Ensure the engine stays registered with UniverseManager
          if (um && universeSlug) {
            um.setGitSyncEngine(universeSlug, engine);
            
            // Update the universe to enable Git repo if it's linked
            const activeUniverse = um.getActiveUniverse();
            if (activeUniverse && !activeUniverse.gitRepo.enabled && restoredConfig.user && restoredConfig.repo) {
              um.updateUniverse(activeUniverse.slug, {
                gitRepo: {
                  ...activeUniverse.gitRepo,
                  enabled: true,
                  linkedRepo: { 
                    type: 'github', 
                    user: restoredConfig.user, 
                    repo: restoredConfig.repo 
                  }
                }
              });
            }
            
            // Initialize SaveCoordinator with the Git engine (if not already initialized)
            try {
              const SaveCoordinatorModule = await import('../services/SaveCoordinator.js');
              const saveCoordinator = SaveCoordinatorModule.default;
              
              if (saveCoordinator && fileStorageModule && engine) {
                // Only initialize if not already enabled or if Git engine changed
                if (!saveCoordinator.isEnabled || saveCoordinator.gitSyncEngine !== engine) {
                  saveCoordinator.initialize(fileStorageModule, engine, um);
                  console.log('[GitFederationBootstrap] SaveCoordinator initialized/updated with Git sync engine');
                } else {
                  console.log('[GitFederationBootstrap] SaveCoordinator already initialized, skipping');
                }
                
                // Ensure it's enabled (in case it was disabled elsewhere)
                if (!saveCoordinator.isEnabled) {
                  saveCoordinator.setEnabled(true);
                  console.log('[GitFederationBootstrap] Re-enabled SaveCoordinator');
                }
              }
            } catch (error) {
              console.warn('[GitFederationBootstrap] SaveCoordinator initialization failed:', error);
            }
          }
          
          // Add a safety check to restart engine if it stops unexpectedly
          const checkEngineHealth = () => {
            if (!engine.isRunning && !cancelled) {
              console.warn('[GitFederationBootstrap] Git sync engine stopped unexpectedly, restarting...');
              try {
                engine.restart();
              } catch (error) {
                console.error('[GitFederationBootstrap] Failed to restart engine:', error);
              }
            }
          };
          
          // Check engine health every minute
          const healthCheckInterval = setInterval(checkEngineHealth, 60000);
          
          // Cleanup function
          return () => {
            cancelled = true;
            clearInterval(healthCheckInterval);
            if (engine && engine.isRunning) {
              engine.stop();
            }
          };
        }
      } catch (_) {}
    };

    restore();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitConnection, gitSourceOfTruth, existingEngine]);

  return null;
}


