import React, { useEffect, useRef } from 'react';
import useGraphStore from '../store/graphStore.js';
import { SemanticProviderFactory } from '../services/gitNativeProvider.js';
import { oauthFetch } from '../services/bridgeConfig.js';
import { persistentAuth } from '../services/persistentAuth.js';
import { GitSyncEngine, SOURCE_OF_TRUTH } from '../services/gitSyncEngine.js';
import { importFromRedstring } from '../formats/redstringFormat.js';

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

        // Determine universe file base name from current file status if possible
        let fileBaseName = 'universe';
        try {
          const fileStatus = storeActionsRef.current.getFileStatus?.();
          if (fileStatus?.fileName && fileStatus.fileName.endsWith('.redstring')) {
            fileBaseName = fileStatus.fileName.replace(/\.redstring$/i, '');
          }
        } catch {}

        const sourceOfTruthMode = gitSourceOfTruth === 'git' ? SOURCE_OF_TRUTH.GIT : SOURCE_OF_TRUTH.LOCAL;
        const universeSlug = 'default';

        const engine = new GitSyncEngine(provider, sourceOfTruthMode, universeSlug, fileBaseName);
        if (cancelled) return;

        // Load from Git and import if needed
        try {
          const redstringData = await engine.loadFromGit();
          if (cancelled) return;
          if (redstringData) {
            const { storeState } = importFromRedstring(redstringData, storeActionsRef.current);
            storeActionsRef.current.loadUniverseFromFile(storeState);
          }
        } catch (_) {}

        // Start engine and expose in store
        engine.start();
        if (!cancelled) setGitSyncEngine(engine);
      } catch (_) {}
    };

    restore();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gitConnection, gitSourceOfTruth, existingEngine]);

  return null;
}


