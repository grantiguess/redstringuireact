import React, { useEffect, useRef } from 'react';
import universeBackend from '../services/universeBackend.js';

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
    universeBackend.initialize().catch(error => {
      console.error('[GitFederationBootstrap] Backend initialization failed:', error);
    });

    // Cleanup
    return () => {
      // Backend handles its own cleanup
    };
  }, [enableEagerInit]);

  return null;
}


