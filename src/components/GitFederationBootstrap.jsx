import React, { useEffect, useRef } from 'react';

// Lazy import to avoid circular dependency
let _universeBackend = null;
const getUniverseBackend = async () => {
  if (!_universeBackend) {
    const module = await import('../services/universeBackend.js');
    _universeBackend = module.default || module.universeBackend;
  }
  return _universeBackend;
};

/**
 * Universe Backend Bootstrap
 *
 * This component ONLY initializes the backend service.
 * No UI logic, no Git engine creation, no state management.
 * Just starts the backend and lets it handle everything.
 */
export default function GitFederationBootstrap({ enableEagerInit = false }) {
  const initRef = useRef(false);

  useEffect(() => {
    if (!enableEagerInit || initRef.current) return;

    initRef.current = true;

    console.log('[GitFederationBootstrap] Initializing universe backend...');

    // The backend handles EVERYTHING now
    // No UI logic, no engine creation, no state management here
    // Just initialize the backend service and it takes care of the rest
    getUniverseBackend().then(backend => {
      return backend.initialize();
    }).catch(error => {
      console.error('[GitFederationBootstrap] Backend initialization failed:', error);
    });

    // Cleanup
    return () => {
      // Backend handles its own cleanup
    };
  }, [enableEagerInit]);

  return null;
}


