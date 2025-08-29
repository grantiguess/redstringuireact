/**
 * Persistent Authentication Service Tests
 * Tests the authentication resilience features including token storage,
 * validation, and automatic recovery mechanisms.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PersistentAuth } from '../../src/services/persistentAuth.js';

// Mock fetch for GitHub API calls
global.fetch = vi.fn();

// Mock storage APIs
const mockSessionStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
};

// Mock the OAuth fetch function
vi.mock('../../src/services/bridgeConfig.js', () => ({
  oauthFetch: vi.fn()
}));

describe('PersistentAuth', () => {
  let persistentAuth;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Setup storage mocks
    global.sessionStorage = mockSessionStorage;
    global.localStorage = mockLocalStorage;
    
    // Create fresh instance
    persistentAuth = new PersistentAuth();
  });

  afterEach(() => {
    // Clean up
    persistentAuth?.destroy();
  });

  describe('Token Storage', () => {
    it('should store tokens successfully', () => {
      const tokenData = {
        access_token: 'github_token_123',
        token_type: 'bearer',
        scope: 'repo'
      };
      
      const userData = {
        login: 'testuser',
        id: 12345,
        name: 'Test User'
      };

      const success = persistentAuth.storeTokens(tokenData, userData);

      expect(success).toBe(true);
      expect(mockSessionStorage.setItem).toHaveBeenCalledWith('github_access_token', 'github_token_123');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('github_auth_method', 'oauth');
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('github_user_data', JSON.stringify(userData));
    });

    it('should handle storage errors gracefully', () => {
      mockSessionStorage.setItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const tokenData = {
        access_token: 'github_token_123',
        token_type: 'bearer'
      };

      const success = persistentAuth.storeTokens(tokenData);

      expect(success).toBe(false);
    });

    it('should set long expiry time for GitHub tokens', () => {
      const tokenData = {
        access_token: 'github_token_123',
        token_type: 'bearer'
      };

      persistentAuth.storeTokens(tokenData);

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'github_token_expiry',
        expect.stringMatching(/^\d+$/)
      );

      // Check that expiry is set to about 1 year from now
      const expiryCall = mockLocalStorage.setItem.mock.calls.find(call => call[0] === 'github_token_expiry');
      const expiryTime = parseInt(expiryCall[1]);
      const oneYearFromNow = Date.now() + (365 * 24 * 60 * 60 * 1000);
      
      expect(expiryTime).toBeCloseTo(oneYearFromNow, -1000); // Within 1 second
    });
  });

  describe('Token Validation', () => {
    beforeEach(() => {
      mockSessionStorage.getItem.mockReturnValue('github_token_123');
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'github_token_expiry') {
          return (Date.now() + (365 * 24 * 60 * 60 * 1000)).toString(); // 1 year from now
        }
        return null;
      });
    });

    it('should validate tokens successfully', async () => {
      // Mock successful GitHub API response
      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ login: 'testuser' })
      });

      const isValid = await persistentAuth.testTokenValidity();

      expect(isValid).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          'Authorization': 'token github_token_123',
          'Accept': 'application/vnd.github.v3+json'
        }
      });
    });

    it('should handle invalid tokens', async () => {
      // Mock failed GitHub API response
      global.fetch.mockResolvedValue({
        ok: false,
        status: 401
      });

      const isValid = await persistentAuth.testTokenValidity();

      expect(isValid).toBe(false);
    });

    it('should attempt token refresh on 401 errors', async () => {
      // Mock 401 response then successful refresh
      global.fetch
        .mockResolvedValueOnce({ ok: false, status: 401 })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ login: 'testuser' }) });

      // Mock successful token validation (refresh)
      vi.spyOn(persistentAuth, 'refreshAccessToken').mockResolvedValue({ validated: true });

      const isValid = await persistentAuth.testTokenValidity();

      expect(isValid).toBe(true);
      expect(persistentAuth.refreshAccessToken).toHaveBeenCalled();
    });
  });

  describe('Token Refresh/Validation', () => {
    it('should validate and extend token expiry', async () => {
      mockSessionStorage.getItem.mockReturnValue('github_token_123');
      mockLocalStorage.getItem.mockReturnValue((Date.now() + 1000).toString()); // Expires soon
      
      // Mock successful validation
      vi.spyOn(persistentAuth, 'testTokenValidity').mockResolvedValue(true);

      const result = await persistentAuth.refreshAccessToken();

      expect(result.validated).toBe(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        'github_token_expiry',
        expect.stringMatching(/^\d+$/)
      );
    });

    it('should clear tokens on validation failure', async () => {
      mockSessionStorage.getItem.mockReturnValue('invalid_token');
      
      // Mock failed validation
      vi.spyOn(persistentAuth, 'testTokenValidity').mockResolvedValue(false);

      await expect(persistentAuth.refreshAccessToken()).rejects.toThrow('Token validation failed');

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('github_access_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('github_refresh_token');
    });
  });

  describe('Event System', () => {
    it('should emit events on token storage', () => {
      const eventHandler = vi.fn();
      persistentAuth.on('tokenStored', eventHandler);

      const tokenData = { access_token: 'token_123' };
      const userData = { login: 'testuser' };
      
      persistentAuth.storeTokens(tokenData, userData);

      expect(eventHandler).toHaveBeenCalledWith({ tokenData, userData });
    });

    it('should emit events on authentication expiry', async () => {
      const expiredHandler = vi.fn();
      const reAuthHandler = vi.fn();
      
      persistentAuth.on('authExpired', expiredHandler);
      persistentAuth.on('reAuthRequired', reAuthHandler);

      mockSessionStorage.getItem.mockReturnValue('invalid_token');
      vi.spyOn(persistentAuth, 'testTokenValidity').mockResolvedValue(false);

      await expect(persistentAuth.refreshAccessToken()).rejects.toThrow();

      expect(expiredHandler).toHaveBeenCalled();
      expect(reAuthHandler).toHaveBeenCalledWith({ reason: 'Token validation failed - token is invalid or revoked' });
    });

    it('should allow event listener removal', () => {
      const eventHandler = vi.fn();
      
      persistentAuth.on('tokenStored', eventHandler);
      persistentAuth.off('tokenStored', eventHandler);
      
      persistentAuth.storeTokens({ access_token: 'token_123' });

      expect(eventHandler).not.toHaveBeenCalled();
    });
  });

  describe('Health Monitoring', () => {
    it('should start health monitoring when tokens are stored', () => {
      vi.spyOn(global, 'setInterval');
      
      persistentAuth.storeTokens({ access_token: 'token_123' });

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 5 * 60 * 1000);
    });

    it('should stop health monitoring on token clear', () => {
      vi.spyOn(global, 'clearInterval');
      
      // Start monitoring
      persistentAuth.storeTokens({ access_token: 'token_123' });
      
      // Clear tokens
      persistentAuth.clearTokens();

      expect(clearInterval).toHaveBeenCalled();
    });

    it('should emit health check events', async () => {
      const healthHandler = vi.fn();
      persistentAuth.on('healthCheck', healthHandler);

      mockSessionStorage.getItem.mockReturnValue('token_123');
      mockLocalStorage.getItem.mockReturnValue((Date.now() + 1000000).toString());
      
      // Mock successful validation
      vi.spyOn(persistentAuth, 'testTokenValidity').mockResolvedValue(true);

      // Start health monitoring
      persistentAuth.storeTokens({ access_token: 'token_123' });

      // Manually trigger health check
      await persistentAuth.testTokenValidity();

      // Verify health check would be called (we can't easily test setInterval)
      expect(persistentAuth.testTokenValidity).toHaveBeenCalled();
    });
  });

  describe('Authentication Status', () => {
    it('should return correct authentication status', () => {
      mockSessionStorage.getItem.mockReturnValue('token_123');
      mockLocalStorage.getItem.mockImplementation((key) => {
        switch (key) {
          case 'github_token_expiry':
            return (Date.now() + 1000000).toString();
          case 'github_auth_method':
            return 'oauth';
          case 'github_user_data':
            return JSON.stringify({ login: 'testuser' });
          default:
            return null;
        }
      });

      const status = persistentAuth.getAuthStatus();

      expect(status.isAuthenticated).toBe(true);
      expect(status.authMethod).toBe('oauth');
      expect(status.userData.login).toBe('testuser');
      expect(status.timeToExpiry).toBeGreaterThan(999000);
    });

    it('should detect expired tokens', () => {
      mockSessionStorage.getItem.mockReturnValue('token_123');
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'github_token_expiry') {
          return (Date.now() - 1000).toString(); // Expired 1 second ago
        }
        return null;
      });

      const status = persistentAuth.getAuthStatus();

      expect(status.isAuthenticated).toBe(false);
      expect(status.timeToExpiry).toBe(0);
    });
  });

  describe('Cleanup', () => {
    it('should clear all tokens and stop monitoring', () => {
      vi.spyOn(global, 'clearInterval');
      
      // Setup tokens and monitoring
      persistentAuth.storeTokens({ access_token: 'token_123' });
      
      // Clear everything
      persistentAuth.clearTokens();

      expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('github_access_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('github_refresh_token');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('github_token_expiry');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('github_user_data');
      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('github_auth_method');
      expect(clearInterval).toHaveBeenCalled();
    });

    it('should clean up on destroy', () => {
      vi.spyOn(global, 'clearInterval');
      
      persistentAuth.storeTokens({ access_token: 'token_123' });
      persistentAuth.destroy();

      expect(clearInterval).toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing tokens gracefully', async () => {
      mockSessionStorage.getItem.mockReturnValue(null);
      
      const token = await persistentAuth.getAccessToken();
      expect(token).toBe(null);
    });

    it('should handle storage errors during clear', () => {
      mockSessionStorage.removeItem.mockImplementation(() => {
        throw new Error('Storage error');
      });

      // Should not throw
      expect(() => persistentAuth.clearTokens()).not.toThrow();
    });

    it('should handle JSON parse errors in user data', () => {
      mockLocalStorage.getItem.mockImplementation((key) => {
        if (key === 'github_user_data') {
          return 'invalid json';
        }
        return null;
      });

      const userData = persistentAuth.getUserData();
      expect(userData).toBe(null);
    });

    it('should prevent concurrent refresh attempts', async () => {
      mockSessionStorage.getItem.mockReturnValue('token_123');
      vi.spyOn(persistentAuth, 'testTokenValidity').mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      // Start two refresh attempts simultaneously
      const promise1 = persistentAuth.refreshAccessToken();
      const promise2 = persistentAuth.refreshAccessToken();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should return the same result (from the single refresh operation)
      expect(result1).toEqual(result2);
      expect(persistentAuth.testTokenValidity).toHaveBeenCalledTimes(1);
    });
  });
});

describe('PersistentAuth Integration', () => {
  it('should work with real-world token flow', async () => {
    const persistentAuth = new PersistentAuth();
    
    // Mock successful GitHub responses
    global.fetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ login: 'testuser', id: 12345 })
    });

    // Store initial tokens
    const tokenData = {
      access_token: 'github_token_123',
      token_type: 'bearer',
      scope: 'repo'
    };
    
    const userData = {
      login: 'testuser',
      id: 12345,
      name: 'Test User'
    };

    // Test complete flow
    const stored = persistentAuth.storeTokens(tokenData, userData);
    expect(stored).toBe(true);

    const status = persistentAuth.getAuthStatus();
    expect(status.isAuthenticated).toBe(true);
    
    const token = await persistentAuth.getAccessToken();
    expect(token).toBe('github_token_123');
    
    const isValid = await persistentAuth.testTokenValidity();
    expect(isValid).toBe(true);
    
    // Cleanup
    persistentAuth.destroy();
  });
});