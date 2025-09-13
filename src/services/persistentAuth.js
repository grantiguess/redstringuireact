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
  AUTH_METHOD: 'github_auth_method'
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
      // Check if we need to refresh
      if (this.shouldRefreshToken()) {
        console.log('[PersistentAuth] Token needs refresh');
        await this.refreshAccessToken();
      }
      
      const token = sessionStorage.getItem(STORAGE_KEYS.ACCESS_TOKEN);
      return token;
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
          'Authorization': `token ${accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      const isValid = response.ok;
      
      if (!isValid) {
        console.warn('[PersistentAuth] Token validation failed:', response.status);
        
        // Try to refresh if we get 401 Unauthorized
        if (response.status === 401) {
          try {
            await this.refreshAccessToken();
            return true; // Refresh successful
          } catch (refreshError) {
            console.error('[PersistentAuth] Token refresh during validation failed:', refreshError);
            return false;
          }
        }
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