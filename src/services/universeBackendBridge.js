/**
 * Universe Backend Bridge Utility
 *
 * Provides a safe, reusable bridge for UI components to communicate with
 * the universe backend via window events. Centralizes command dispatching
 * to avoid temporal dead zone pitfalls and duplicate implementations.
 */

const COMMAND_EVENT = 'universe-backend-command';
const STATUS_EVENT = 'universe-backend-status';
const RESPONSE_EVENT_PREFIX = 'universe-backend-response-';

class UniverseBackendBridge {
  constructor(timeoutMs = 10000) {
    this.timeoutMs = timeoutMs;
  }

  async sendCommand(command, payload = {}) {
    if (typeof window === 'undefined') {
      throw new Error('Universe backend bridge is only available in the browser environment.');
    }

    return new Promise((resolve, reject) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const responseEvent = `${RESPONSE_EVENT_PREFIX}${id}`;
      let timeoutId = null;

      const cleanup = () => {
        window.removeEventListener(responseEvent, handleResponse);
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
          timeoutId = null;
        }
      };

      const handleResponse = (event) => {
        cleanup();
        const detail = event?.detail;
        if (detail?.error) {
          reject(new Error(detail.error));
          return;
        }
        resolve(detail?.result);
      };

      window.addEventListener(responseEvent, handleResponse);

      timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Backend command "${command}" timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

      window.dispatchEvent(new CustomEvent(COMMAND_EVENT, {
        detail: { command, payload, id }
      }));
    });
  }

  onStatusChange(callback) {
    if (typeof window === 'undefined') {
      return () => {};
    }

    const handler = (event) => {
      try {
        callback(event.detail);
      } catch (error) {
        console.warn('[UniverseBackendBridge] status handler error:', error);
      }
    };

    window.addEventListener(STATUS_EVENT, handler);
    return () => window.removeEventListener(STATUS_EVENT, handler);
  }

  // Convenience helpers --------------------------------------------------

  getAllUniverses() {
    return this.sendCommand('getAllUniverses');
  }

  getActiveUniverse() {
    return this.sendCommand('getActiveUniverse');
  }

  getAuthStatus() {
    return this.sendCommand('getAuthStatus');
  }

  switchActiveUniverse(slug, options) {
    return this.sendCommand('switchActiveUniverse', { slug, options });
  }

  createUniverse(name, options) {
    return this.sendCommand('createUniverse', { name, options });
  }

  deleteUniverse(slug) {
    return this.sendCommand('deleteUniverse', { slug });
  }

  updateUniverse(slug, updates) {
    return this.sendCommand('updateUniverse', { slug, updates });
  }

  discoverUniversesInRepository(repoConfig) {
    return this.sendCommand('discoverUniversesInRepository', { repoConfig });
  }

  linkToDiscoveredUniverse(discoveredUniverse, repoConfig) {
    return this.sendCommand('linkToDiscoveredUniverse', { discoveredUniverse, repoConfig });
  }
}

const bridgeInstance = new UniverseBackendBridge();

const universeBackendBridge = {
  sendCommand: bridgeInstance.sendCommand.bind(bridgeInstance),
  onStatusChange: (...args) => bridgeInstance.onStatusChange(...args),
  getAllUniverses: () => bridgeInstance.getAllUniverses(),
  getActiveUniverse: () => bridgeInstance.getActiveUniverse(),
  getAuthStatus: () => bridgeInstance.getAuthStatus(),
  switchActiveUniverse: (slug, options) => bridgeInstance.switchActiveUniverse(slug, options),
  createUniverse: (name, options) => bridgeInstance.createUniverse(name, options),
  deleteUniverse: (slug) => bridgeInstance.deleteUniverse(slug),
  updateUniverse: (slug, updates) => bridgeInstance.updateUniverse(slug, updates),
  discoverUniversesInRepository: (repoConfig) => bridgeInstance.discoverUniversesInRepository(repoConfig),
  linkToDiscoveredUniverse: (discoveredUniverse, repoConfig) => bridgeInstance.linkToDiscoveredUniverse(discoveredUniverse, repoConfig)
};

export default universeBackendBridge;
export { UniverseBackendBridge, bridgeInstance as universeBackendBridgeInstance };
