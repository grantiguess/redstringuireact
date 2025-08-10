// Bridge configuration helpers for building URLs and cross-device access

export function getBridgeBaseUrl() {
  // Allow override via environment for advanced setups
  // Vite exposes env vars prefixed with VITE_
  try {
    // eslint-disable-next-line no-undef
    const envUrl = (
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_BRIDGE_URL) ||
      (typeof process !== 'undefined' && process.env && process.env.VITE_BRIDGE_URL)
    ) || null;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
      return envUrl.replace(/\/+$/, '');
    }
  } catch {}

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    // Default development bridge port
    const port = 3001;
    return `${protocol}//${hostname}:${port}`;
  }

  // Server-side or unknown: fallback to localhost
  return 'http://localhost:3001';
}

export function bridgeUrl(path = '') {
  const base = getBridgeBaseUrl();
  const normalized = String(path || '');
  return normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
}

export function bridgeFetch(path, options) {
  return fetch(bridgeUrl(path), options);
}

export function bridgeEventSource(path) {
  // Consumers should pass a path like '/events/stream'
  return new EventSource(bridgeUrl(path));
}


