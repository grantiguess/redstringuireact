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
    // Default development bridge port for AI/MCP
    const port = 3001;
    return `${protocol}//${hostname}:${port}`;
  }

  // Server-side or unknown: fallback to localhost
  return 'http://localhost:3001';
}

export function getOAuthBaseUrl() {
  // OAuth server runs on separate port for clean separation
  try {
    // eslint-disable-next-line no-undef
    const envUrl = (
      (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_OAUTH_URL) ||
      (typeof process !== 'undefined' && process.env && process.env.VITE_OAUTH_URL)
    ) || null;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
      return envUrl.replace(/\/+$/, '');
    }
  } catch {}

  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname } = window.location;
    // Dedicated OAuth server port
    const port = 3002;
    return `${protocol}//${hostname}:${port}`;
  }

  // Server-side or unknown: fallback to localhost
  return 'http://localhost:3002';
}

export function bridgeUrl(path = '') {
  const base = getBridgeBaseUrl();
  const normalized = String(path || '');
  return normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
}

export function oauthUrl(path = '') {
  const base = getOAuthBaseUrl();
  const normalized = String(path || '');
  return normalized.startsWith('/') ? `${base}${normalized}` : `${base}/${normalized}`;
}

// Simple connectivity circuit breaker to avoid console/network spam when bridge is down
const __bridgeHealth = {
  consecutiveFailures: 0,
  cooldownUntil: 0
};

export function resetBridgeBackoff() {
  __bridgeHealth.consecutiveFailures = 0;
  __bridgeHealth.cooldownUntil = 0;
}

function isLikelyNetworkRefusal(err) {
  try {
    const msg = String(err && (err.message || err)).toLowerCase();
    return (
      msg.includes('failed to fetch') ||
      msg.includes('networkerror') ||
      msg.includes('net::err_connection_refused') ||
      msg.includes('econnrefused')
    );
  } catch { return false; }
}

export function bridgeFetch(path, options) {
  const now = Date.now();
  if (__bridgeHealth.cooldownUntil && now < __bridgeHealth.cooldownUntil) {
    // Short-circuit without hitting the network to prevent console spam
    const cooldownRemaining = Math.ceil((__bridgeHealth.cooldownUntil - now) / 1000);
    return Promise.reject(new Error(`bridge_unavailable_cooldown: ${cooldownRemaining}s remaining`));
  }
  return fetch(bridgeUrl(path), options)
    .then((res) => {
      // Any response means the listener exists; reset failures
      __bridgeHealth.consecutiveFailures = 0;
      __bridgeHealth.cooldownUntil = 0;
      return res;
    })
    .catch((err) => {
      if (isLikelyNetworkRefusal(err)) {
        __bridgeHealth.consecutiveFailures += 1;
        if (__bridgeHealth.consecutiveFailures >= 3) {
          // Stop trying for a while; panel Refresh/manual reconnect can reset this
          __bridgeHealth.cooldownUntil = Date.now() + 60_000; // 60s cooldown
          console.log(`🔌 MCP Bridge: Connection failed ${__bridgeHealth.consecutiveFailures} times, entering ${60}s cooldown period`);
        } else {
          console.log(`🔌 MCP Bridge: Connection attempt ${__bridgeHealth.consecutiveFailures}/3 failed`);
        }
      }
      // Re-throw so callers can handle softly; no network call will be attempted during cooldown
      throw err;
    });
}

export function bridgeEventSource(path) {
  // Consumers should pass a path like '/events/stream'
  return new EventSource(bridgeUrl(path));
}

// OAuth-specific fetch function (separate server, no circuit breaker needed)
export function oauthFetch(path, options) {
  return fetch(oauthUrl(path), options);
}


