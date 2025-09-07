import React, { useEffect, useRef } from 'react';
import useGraphStore from '../store/graphStore.js';
import { SemanticProviderFactory } from '../services/gitNativeProvider.js';
import { oauthFetch } from '../services/bridgeConfig.js';
import { persistentAuth } from '../services/persistentAuth.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from '../services/gitSyncEngine.js';
import { importFromRedstring } from '../formats/redstringFormat.js';
import universeManager from '../services/universeManager.js';

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
        const activeUniverse = universeManager.getActiveUniverse();
        if (activeUniverse && restoredConfig.user && restoredConfig.repo) {
          try {
            universeManager.updateUniverse(activeUniverse.slug, {
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
        const universeSlug = universeManager.activeUniverseSlug || 'universe';

        const engine = new GitSyncEngine(provider, sourceOfTruthMode, universeSlug, fileBaseName, universeManager);
        if (cancelled) return;

        // Mark store as ready immediately to avoid panel delay
        try {
          useGraphStore.setState({ isUniverseLoaded: true, isUniverseLoading: false });
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
          if (universeManager && universeSlug) {
            universeManager.setGitSyncEngine(universeSlug, engine);
            
            // Update the universe to enable Git repo if it's linked
            const activeUniverse = universeManager.getActiveUniverse();
            if (activeUniverse && !activeUniverse.gitRepo.enabled && restoredConfig.user && restoredConfig.repo) {
              universeManager.updateUniverse(activeUniverse.slug, {
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
            
            // Initialize SaveCoordinator with the Git engine
            try {
              const SaveCoordinatorModule = await import('../services/SaveCoordinator.js');
              const saveCoordinator = SaveCoordinatorModule.default;
              
              const fileStorageModule = await import('../store/fileStorage.js');
              
              if (saveCoordinator && fileStorageModule && engine) {
                saveCoordinator.initialize(fileStorageModule, engine, universeManager);
                console.log('[GitFederationBootstrap] SaveCoordinator initialized with Git sync engine');
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


