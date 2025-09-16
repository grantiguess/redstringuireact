/**
 * Persistent Authentication Service
 * 
 * Handles GitHub OAuth token management with automatic refresh,
 * secure storage, and connection health monitoring.
 */

import { oauthFetch } from './bridgeConfig.js';
import { storageWrapper } from '../utils/storageWrapper.js';

// Token storage keys
const STORAGE_KEYS = {
  ACCESS_TOKEN: 'github_access_token',
  REFRESH_TOKEN: 'github_refresh_token',
  TOKEN_EXPIRY: 'github_token_expiry',
  USER_DATA: 'github_user_data',
  AUTH_METHOD: 'github_auth_method',
  // GitHub App Installation keys
  APP_INSTALLATION_ID: 'github_app_installation_id',
  APP_ACCESS_TOKEN: 'github_app_access_token',
  APP_REPOSITORIES: 'github_app_repositories',
  APP_USER_DATA: 'github_app_user_data',
  APP_LAST_UPDATED: 'github_app_last_updated'
};

// Token refresh buffer - refresh 5 minutes before expiry
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Health check interval - check every 5 minutes
const HEALTH_CHECK_INTERVAL = 5 * 60 * 1000;

export class PersistentAuth {
  constructor() {
    this.isRefreshing = false;
    this.refreshPromise = null;
    this.healthCheckInterval = null;
    this.eventListeners = new Map();
    
    // Start health monitoring if we have tokens
    if (this.hasValidTokens()) {
      this.startHealthMonitoring();
    }
  }

  /**
   * Store OAuth tokens securely
   */
  storeTokens(tokenData, userData = null) {
    const { access_token, refresh_token, expires_in, token_type } = tokenData;
    
    try {
      // Store in session for immediate use
      sessionStorage.setItem(STORAGE_KEYS.ACCESS_TOKEN, access_token);
      
      // GitHub tokens don't usually have refresh tokens or expiry
      // But we'll store them if provided for future compatibility
      if (refresh_token) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refresh_token);
      }
      
      // For GitHub, tokens don't expire by default
      // We'll set a very long expiry time or none at all
      const expiryTime = expires_in ? 
        Date.now() + (expires_in * 1000) : 
        Date.now() + (365 * 24 * 60 * 60 * 1000); // Default 1 year for GitHub
      
      localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, expiryTime.toString());
      localStorage.setItem(STORAGE_KEYS.AUTH_METHOD, 'oauth');
      
      // Store user data if provided
      if (userData) {
        localStorage.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(userData));
      }
      
      console.log('[PersistentAuth] Tokens stored successfully', {
        hasAccessToken: !!access_token,
        hasRefreshToken: !!refresh_token,
        expiresIn: expires_in,
        expiryTime: new Date(expiryTime).toISOString(),
        note: 'GitHub tokens typically do not expire'
      });
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      this.emit('tokenStored', { tokenData, userData });
      
      return true;
    } catch (error) {
      console.error('[PersistentAuth] Failed to store tokens:', error);
      return false;
    }
  }

  /**
   * Get current access token, refreshing if needed
   */
  async getAccessToken() {
    try {
      // Always read the token first
      const token = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      if (!token) {
        // No token present; do not trigger validation/refresh loop
        return null;
      }
      // Check if we need to validate/refresh
      if (this.shouldRefreshToken()) {
        console.log('[PersistentAuth] Token needs validation/refresh');
        await this.refreshAccessToken();
      }
      return sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN) || null;
    } catch (error) {
      console.error('[PersistentAuth] Failed to get access token:', error);
      this.emit('authError', error);
      return null;
    }
  }

  /**
   * Check if we have valid tokens
   */
  hasValidTokens() {
    const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    const expiryTime = parseInt(localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY) || '0');
    const now = Date.now();
    
    return !!(accessToken && expiryTime > now);
  }

  /**
   * Check if token should be refreshed
   * For GitHub, we don't typically need to refresh, but we validate instead
   */
  shouldRefreshToken() {
    // GitHub tokens don't expire by default, so we focus on validation
    // We only "refresh" (re-validate) if the token is very old or we've had recent failures
    const expiryTime = parseInt(localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY) || '0');
    const now = Date.now();
    
    // Only consider refresh if token is approaching our artificial expiry
    const refreshTime = expiryTime - REFRESH_BUFFER_MS;
    return now >= refreshTime;
  }

  /**
   * "Refresh" access token by validating it and potentially triggering re-auth
   * For GitHub, this is more of a validation + re-auth flow since true refresh isn't supported
   */
  async refreshAccessToken() {
    // Prevent multiple simultaneous refresh attempts
    if (this.isRefreshing) {
      return this.refreshPromise;
    }
    
    this.isRefreshing = true;
    this.refreshPromise = this.performTokenValidation();
    
    try {
      const result = await this.refreshPromise;
      return result;
    } finally {
      this.isRefreshing = false;
      this.refreshPromise = null;
    }
  }

  /**
   * Validate current token and trigger re-auth if needed
   */
  async performTokenValidation() {
    try {
      console.log('[PersistentAuth] Validating current token...');
      
      const isValid = await this.testTokenValidity();
      
      if (isValid) {
        // Token is still valid, extend its life
        const newExpiryTime = Date.now() + (365 * 24 * 60 * 60 * 1000); // Another year
        localStorage.setItem(STORAGE_KEYS.TOKEN_EXPIRY, newExpiryTime.toString());
        
        console.log('[PersistentAuth] Token validation successful, extended expiry');
        this.emit('tokenValidated', { 
          newExpiryTime: new Date(newExpiryTime).toISOString() 
        });
        
        return { validated: true };
      } else {
        throw new Error('Token validation failed - token is invalid or revoked');
      }
    } catch (error) {
      console.error('[PersistentAuth] Token validation failed:', error);
      
      // Clear invalid tokens and trigger re-authentication
      this.clearTokens();
      this.emit('authExpired', error);
      this.emit('reAuthRequired', { reason: error.message });
      
      throw error;
    }
  }

  /**
   * Test if current tokens are valid by making a test request
   */
  async testTokenValidity() {
    const accessToken = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
    
    if (!accessToken) {
      return false;
    }

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const isValid = response.ok;
      
      if (!isValid) {
        console.warn('[PersistentAuth] Token validation failed:', response.status);
        // Do not attempt to refresh here to avoid re-entrancy; return false and let caller handle re-auth
        if (response.status === 401) return false;
      }
      
      return isValid;
    } catch (error) {
      console.error('[PersistentAuth] Token validation failed:', error);
      return false;
    }
  }

  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      return; // Already monitoring
    }
    
    console.log('[PersistentAuth] Starting health monitoring');
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const isValid = await this.testTokenValidity();
        
        this.emit('healthCheck', {
          isValid,
          timestamp: new Date().toISOString(),
          hasTokens: this.hasValidTokens()
        });
        
        if (!isValid) {
          console.warn('[PersistentAuth] Health check failed - tokens invalid');
          this.emit('authDegraded', { reason: 'Token validation failed' });
        }
      } catch (error) {
        console.error('[PersistentAuth] Health check error:', error);
        this.emit('healthCheckError', error);
      }
    }, HEALTH_CHECK_INTERVAL);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[PersistentAuth] Health monitoring stopped');
    }
  }

  /**
   * Clear all stored tokens
   */
  clearTokens() {
    try {
      sessionStorage.removeItem(STORAGE_KEYS.ACCESS_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);
      localStorage.removeItem(STORAGE_KEYS.TOKEN_EXPIRY);
      localStorage.removeItem(STORAGE_KEYS.USER_DATA);
      localStorage.removeItem(STORAGE_KEYS.AUTH_METHOD);
      
      this.stopHealthMonitoring();
      
      console.log('[PersistentAuth] Tokens cleared');
      this.emit('tokensCleared');
    } catch (error) {
      console.error('[PersistentAuth] Failed to clear tokens:', error);
    }
  }

  /**
   * Get stored user data
   */
  getUserData() {
    try {
      const userData = localStorage.getItem(STORAGE_KEYS.USER_DATA);
      return userData ? JSON.parse(userData) : null;
    } catch (error) {
      console.error('[PersistentAuth] Failed to get user data:', error);
      return null;
    }
  }

  /**
   * Get authentication status
   */
  getAuthStatus() {
    const hasTokens = this.hasValidTokens();
    const needsRefresh = this.shouldRefreshToken();
    const expiryTime = parseInt(localStorage.getItem(STORAGE_KEYS.TOKEN_EXPIRY) || '0');
    
    return {
      isAuthenticated: hasTokens,
      needsRefresh,
      expiryTime: expiryTime > 0 ? new Date(expiryTime) : null,
      timeToExpiry: expiryTime > 0 ? Math.max(0, expiryTime - Date.now()) : 0,
      authMethod: localStorage.getItem(STORAGE_KEYS.AUTH_METHOD),
      userData: this.getUserData(),
      isRefreshing: this.isRefreshing
    };
  }

  /**
   * Event handling
   */
  on(eventName, callback) {
    if (!this.eventListeners.has(eventName)) {
      this.eventListeners.set(eventName, []);
    }
    this.eventListeners.get(eventName).push(callback);
  }

  off(eventName, callback) {
    const listeners = this.eventListeners.get(eventName);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  emit(eventName, data) {
    const listeners = this.eventListeners.get(eventName) || [];
    listeners.forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[PersistentAuth] Event listener error for ${eventName}:`, error);
      }
    });
  }

  /**
   * Store GitHub App installation data
   */
  storeAppInstallation(installationData) {
    const { installationId, accessToken, repositories, userData } = installationData;
    
    try {
      // Store app installation data with storageWrapper to respect debug settings
      storageWrapper.setItem(STORAGE_KEYS.APP_INSTALLATION_ID, installationId);
      storageWrapper.setItem(STORAGE_KEYS.APP_ACCESS_TOKEN, accessToken);
      storageWrapper.setItem(STORAGE_KEYS.APP_REPOSITORIES, JSON.stringify(repositories || []));
      storageWrapper.setItem(STORAGE_KEYS.APP_USER_DATA, JSON.stringify(userData || {}));
      storageWrapper.setItem(STORAGE_KEYS.APP_LAST_UPDATED, Date.now().toString());
      
      console.log('[PersistentAuth] GitHub App installation stored successfully');
      this.emit('appInstallationStored', installationData);
    } catch (error) {
      console.error('[PersistentAuth] Failed to store GitHub App installation:', error);
      this.emit('authError', error);
    }
  }

  /**
   * Get stored GitHub App installation data
   */
  getAppInstallation() {
    try {
      const installationId = storageWrapper.getItem(STORAGE_KEYS.APP_INSTALLATION_ID);
      const accessToken = storageWrapper.getItem(STORAGE_KEYS.APP_ACCESS_TOKEN);
      const repositories = storageWrapper.getItem(STORAGE_KEYS.APP_REPOSITORIES);
      const userData = storageWrapper.getItem(STORAGE_KEYS.APP_USER_DATA);
      const lastUpdated = storageWrapper.getItem(STORAGE_KEYS.APP_LAST_UPDATED);
      
      if (!installationId || !accessToken) {
        return null;
      }
      
      return {
        installationId,
        accessToken,
        repositories: repositories ? JSON.parse(repositories) : [],
        userData: userData ? JSON.parse(userData) : {},
        lastUpdated: lastUpdated ? parseInt(lastUpdated) : Date.now()
      };
    } catch (error) {
      console.error('[PersistentAuth] Failed to get GitHub App installation:', error);
      return null;
    }
  }

  /**
   * Check if we have a valid GitHub App installation
   */
  hasAppInstallation() {
    const installation = this.getAppInstallation();
    return !!(installation?.installationId && installation?.accessToken);
  }

  /**
   * Clear GitHub App installation data
   */
  clearAppInstallation() {
    try {
      storageWrapper.removeItem(STORAGE_KEYS.APP_INSTALLATION_ID);
      storageWrapper.removeItem(STORAGE_KEYS.APP_ACCESS_TOKEN);
      storageWrapper.removeItem(STORAGE_KEYS.APP_REPOSITORIES);
      storageWrapper.removeItem(STORAGE_KEYS.APP_USER_DATA);
      storageWrapper.removeItem(STORAGE_KEYS.APP_LAST_UPDATED);
      
      console.log('[PersistentAuth] GitHub App installation cleared');
      this.emit('appInstallationCleared');
    } catch (error) {
      console.error('[PersistentAuth] Failed to clear GitHub App installation:', error);
    }
  }

  /**
   * Get comprehensive authentication status including GitHub App
   */
  getComprehensiveAuthStatus() {
    const oauthStatus = this.getAuthStatus();
    const appInstallation = this.getAppInstallation();
    
    return {
      ...oauthStatus,
      githubApp: {
        isInstalled: this.hasAppInstallation(),
        installation: appInstallation
      }
    };
  }

  /**
   * Cleanup when not needed
   */
  destroy() {
    this.stopHealthMonitoring();
    this.eventListeners.clear();
    console.log('[PersistentAuth] Service destroyed');
  }
}

// Export singleton instance
export const persistentAuth = new PersistentAuth();

// Export utility functions
export const getAccessToken = () => persistentAuth.getAccessToken();
export const hasValidTokens = () => persistentAuth.hasValidTokens();
export const getAuthStatus = () => persistentAuth.getAuthStatus();
export const clearTokens = () => persistentAuth.clearTokens();