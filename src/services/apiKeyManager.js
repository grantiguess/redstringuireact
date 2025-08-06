/**
 * API Key Manager for Redstring AI Chat
 * 
 * Securely stores and manages API keys in browser localStorage
 * Keys are stored locally on the user's machine only
 */

class APIKeyManager {
  constructor() {
    this.STORAGE_KEY = 'redstring_ai_api_key';
    this.ENCRYPTION_KEY = 'redstring_ai_encryption_key';
  }

  /**
   * Store API key securely in localStorage
   * @param {string} apiKey - The API key to store
   * @param {string} provider - The provider (e.g., 'anthropic', 'openai')
   */
  async storeAPIKey(apiKey, provider = 'anthropic') {
    try {
      // Simple obfuscation (in production, you might want stronger encryption)
      const obfuscatedKey = this.obfuscate(apiKey);
      
      const keyData = {
        key: obfuscatedKey,
        provider,
        timestamp: Date.now(),
        version: '1.0'
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(keyData));
      
      console.log('[API Key Manager] API key stored successfully');
      return { success: true, provider };
    } catch (error) {
      console.error('[API Key Manager] Failed to store API key:', error);
      throw new Error('Failed to store API key');
    }
  }

  /**
   * Retrieve API key from localStorage
   * @returns {string|null} The API key or null if not found
   */
  async getAPIKey() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const keyData = JSON.parse(stored);
      const deobfuscatedKey = this.deobfuscate(keyData.key);
      
      console.log('[API Key Manager] API key retrieved successfully');
      return deobfuscatedKey;
    } catch (error) {
      console.error('[API Key Manager] Failed to retrieve API key:', error);
      return null;
    }
  }

  /**
   * Get API key info (provider, timestamp, etc.)
   * @returns {object|null} Key information or null if not found
   */
  async getAPIKeyInfo() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const keyData = JSON.parse(stored);
      return {
        provider: keyData.provider,
        timestamp: keyData.timestamp,
        version: keyData.version,
        hasKey: true
      };
    } catch (error) {
      console.error('[API Key Manager] Failed to get API key info:', error);
      return null;
    }
  }

  /**
   * Check if API key exists
   * @returns {boolean} True if key exists
   */
  async hasAPIKey() {
    const key = await this.getAPIKey();
    return key !== null;
  }

  /**
   * Remove API key from localStorage
   */
  async removeAPIKey() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      console.log('[API Key Manager] API key removed successfully');
      return { success: true };
    } catch (error) {
      console.error('[API Key Manager] Failed to remove API key:', error);
      throw new Error('Failed to remove API key');
    }
  }

  /**
   * Validate API key format
   * @param {string} apiKey - The API key to validate
   * @returns {boolean} True if valid
   */
  validateAPIKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Remove whitespace
    const cleanKey = apiKey.trim();
    
    // Just check it's not empty and has reasonable length
    return cleanKey.length >= 5;
  }

  /**
   * Simple obfuscation (not encryption, just makes it not plain text)
   * @param {string} text - Text to obfuscate
   * @returns {string} Obfuscated text
   */
  obfuscate(text) {
    if (!text || typeof text !== 'string') {
      return '';
    }
    return btoa(text.split('').reverse().join(''));
  }

  /**
   * Deobfuscate text
   * @param {string} obfuscated - Obfuscated text
   * @returns {string} Original text
   */
  deobfuscate(obfuscated) {
    if (!obfuscated || typeof obfuscated !== 'string') {
      return '';
    }
    try {
      return atob(obfuscated).split('').reverse().join('');
    } catch (error) {
      console.error('Failed to deobfuscate:', error);
      return '';
    }
  }

  /**
   * Get common provider presets (just for UI convenience)
   * @returns {Array} List of common providers for quick selection
   */
  getCommonProviders() {
    return [
      { id: 'anthropic', name: 'Anthropic Claude' },
      { id: 'openai', name: 'OpenAI GPT' },
      { id: 'kimi', name: 'Kimi K2' },
      { id: 'google', name: 'Google Gemini' },
      { id: 'cohere', name: 'Cohere' },
      { id: 'custom', name: 'Custom Provider' }
    ];
  }
}

// Create and export a singleton instance
const apiKeyManager = new APIKeyManager();
export default apiKeyManager; 