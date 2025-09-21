import React, { useEffect, useRef } from 'react';

/**
 * Universe Backend Bootstrap - COMPLETELY DECOUPLED
 *
 * This component only acts as an event bridge. It uses dynamic imports
 * with delayed loading to completely avoid circular dependencies.
 * The backend is loaded ONLY when needed, never during module parse time.
 */
export default function GitFederationBootstrap({ enableEagerInit = false }) {
  const initRef = useRef(false);
  const backendRef = useRef(null);
  const commandListenerRef = useRef(null);

  useEffect(() => {
    if (!enableEagerInit || initRef.current) return;

    initRef.current = true;

    console.log('[GitFederationBootstrap] Setting up event bridge...');

    // Command handler that dynamically loads backend only when first command arrives
    const handleBackendCommand = async (event) => {
      const { command, payload, id } = event.detail;

      try {
        // Lazy load backend only when first command is received
        if (!backendRef.current) {
          console.log('[GitFederationBootstrap] First command received, loading backend...');

          // Use setTimeout to defer the import until next tick to avoid parse-time dependencies
          await new Promise(resolve => setTimeout(resolve, 0));

          const module = await import('../services/universeBackend.js');
          const backend = module.default || module.universeBackend;
          await backend.initialize();
          backendRef.current = backend;

          // Set up status forwarding after backend is loaded
          backend.onStatusChange((status) => {
            window.dispatchEvent(new CustomEvent('universe-backend-status', {
              detail: status
            }));
          });

          console.log('[GitFederationBootstrap] Backend loaded and ready');
        }

        let result;
        const backend = backendRef.current;

        switch (command) {
          case 'getAllUniverses':
            result = backend.getAllUniverses();
            break;
          case 'getActiveUniverse':
            result = backend.getActiveUniverse();
            break;
          case 'getAuthStatus':
            result = backend.getAuthStatus();
            break;
          case 'switchActiveUniverse':
            result = await backend.switchActiveUniverse(payload.slug, payload.options);
            break;
          case 'createUniverse':
            result = await backend.createUniverse(payload.name, payload.options);
            break;
          case 'deleteUniverse':
            result = await backend.deleteUniverse(payload.slug);
            break;
          case 'updateUniverse':
            result = await backend.updateUniverse(payload.slug, payload.updates);
            break;
          case 'discoverUniversesInRepository':
            result = await backend.discoverUniversesInRepository(payload.repoConfig);
            break;
          case 'linkToDiscoveredUniverse':
            result = await backend.linkToDiscoveredUniverse(payload.discoveredUniverse, payload.repoConfig);
            break;
          default:
            throw new Error(`Unknown command: ${command}`);
        }

        window.dispatchEvent(new CustomEvent(`universe-backend-response-${id}`, {
          detail: { result }
        }));
      } catch (error) {
        console.error(`[GitFederationBootstrap] Command ${command} failed:`, error);
        window.dispatchEvent(new CustomEvent(`universe-backend-response-${id}`, {
          detail: { error: error.message }
        }));
      }
    };

    // Set up command listener immediately, but don't load backend yet
    commandListenerRef.current = handleBackendCommand;
    window.addEventListener('universe-backend-command', handleBackendCommand);

    console.log('[GitFederationBootstrap] Event bridge ready (backend will load on first command)');

    // Cleanup
    return () => {
      if (commandListenerRef.current) {
        window.removeEventListener('universe-backend-command', commandListenerRef.current);
      }
      backendRef.current = null;
      commandListenerRef.current = null;
    };
  }, [enableEagerInit]);

  return null;
}


