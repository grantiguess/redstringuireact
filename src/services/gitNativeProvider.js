/**
 * Git-Native Semantic Web Provider
 * Core abstraction for hot-swappable Git providers
 * Enables real-time responsiveness, true decentralization, and censorship resistance
 */

/**
 * Universal Semantic Provider Interface
 * All Git providers must implement this interface
 */
export class SemanticProvider {
  constructor(config) {
    this.name = config.name;
    this.rootUrl = config.rootUrl;
    this.authMechanism = config.authMechanism; // "oauth" | "token" | "basic" | "webid"
    this.config = config;
  }

  /**
   * Authenticate with the provider
   * @returns {Promise<AuthToken>} Authentication token
   */
  async authenticate() {
    throw new Error('authenticate() must be implemented by provider');
  }

  /**
   * Create a new semantic space
   * @param {string} name - Name of the semantic space
   * @returns {Promise<SpaceInfo>} Space information
   */
  async createSemanticSpace(name) {
    throw new Error('createSemanticSpace() must be implemented by provider');
  }

  /**
   * Write semantic content to a file
   * @param {string} path - File path within semantic space
   * @param {string} ttlContent - TTL content to write
   * @returns {Promise<void>}
   */
  async writeSemanticFile(path, ttlContent) {
    throw new Error('writeSemanticFile() must be implemented by provider');
  }

  /**
   * Read semantic content from a file
   * @param {string} path - File path within semantic space
   * @returns {Promise<string>} TTL content
   */
  async readSemanticFile(path) {
    throw new Error('readSemanticFile() must be implemented by provider');
  }

  /**
   * Commit changes to the repository
   * @param {string} message - Commit message
   * @param {string[]} files - Array of changed file paths
   * @returns {Promise<void>}
   */
  async commitChanges(message, files) {
    throw new Error('commitChanges() must be implemented by provider');
  }

  /**
   * Export the full semantic graph
   * @returns {Promise<SemanticArchive>} Complete semantic archive
   */
  async exportFullGraph() {
    throw new Error('exportFullGraph() must be implemented by provider');
  }

  /**
   * Import a full semantic graph
   * @param {SemanticArchive} archive - Semantic archive to import
   * @returns {Promise<void>}
   */
  async importFullGraph(archive) {
    throw new Error('importFullGraph() must be implemented by provider');
  }

  /**
   * Check if provider is available
   * @returns {Promise<boolean>} True if provider is accessible
   */
  async isAvailable() {
    throw new Error('isAvailable() must be implemented by provider');
  }

  /**
   * Get provider status information
   * @returns {Promise<ProviderStatus>} Provider status
   */
  async getStatus() {
    throw new Error('getStatus() must be implemented by provider');
  }
}

/**
 * GitHub Semantic Provider Implementation
 */
export class GitHubSemanticProvider extends SemanticProvider {
  constructor(config) {
    super({
      name: 'GitHub',
      rootUrl: `https://api.github.com/repos/${config.user}/${config.repo}/contents`,
      authMechanism: 'oauth',
      ...config
    });
    
    this.user = config.user;
    this.repo = config.repo;
    this.token = config.token;
    this.semanticPath = config.semanticPath || 'schema';
  }

  async authenticate() {
    if (!this.token) {
      throw new Error('GitHub token required for authentication');
    }
    return { token: this.token, type: 'oauth' };
  }

  async createSemanticSpace(name) {
    const spacePath = `${this.semanticPath}/${name}`;
    
    // Create initial directory structure
    const structure = this.generateStandardStructure(name);
    
    for (const [path, content] of Object.entries(structure)) {
      await this.writeSemanticFile(`${spacePath}/${path}`, content);
    }

    return {
      name,
      url: `https://github.com/${this.user}/${this.repo}/tree/main/${spacePath}`,
      apiUrl: `${this.rootUrl}/${spacePath}`,
      createdAt: new Date().toISOString()
    };
  }

  async initializeEmptyRepository() {
    try {
      console.log('[GitHubSemanticProvider] Initializing empty repository...');
      console.log('[GitHubSemanticProvider] Repository:', `${this.user}/${this.repo}`);
      console.log('[GitHubSemanticProvider] Semantic path:', this.semanticPath);
      
      // Create the semantic path directory with a README
      const readmeContent = `# Semantic Knowledge Base

This repository contains semantic data for the RedString UI React application.

## Structure

- \`${this.semanticPath}/\` - Contains semantic files in Turtle (.ttl) format
- \`profile/\` - User profile and preferences
- \`vocabulary/\` - Ontology and schema definitions
- \`federation/\` - Federation and subscription data

## Getting Started

This repository was automatically initialized by RedString UI React. You can now start adding semantic data through the application interface.
`;

      console.log('[GitHubSemanticProvider] Creating README file...');
      // Create the semantic path directory
      await this.writeSemanticFile('README', readmeContent);
      
      console.log('[GitHubSemanticProvider] Creating standard directory structure...');
      
      // Create the standard directory structure
      const structure = this.generateStandardStructure(`${this.user}-${this.repo}`);
      
      for (const [path, content] of Object.entries(structure)) {
        console.log('[GitHubSemanticProvider] Creating file:', path);
        await this.writeSemanticFile(path, content);
      }
      
      console.log('[GitHubSemanticProvider] Repository initialized successfully');
      return true;
    } catch (error) {
      console.error('[GitHubSemanticProvider] Failed to initialize repository:', error);
      throw error;
    }
  }

  async writeSemanticFile(path, ttlContent) {
    const fullPath = `${this.semanticPath}/${path}.ttl`;
    
    console.log('[GitHubSemanticProvider] Writing file:', fullPath);
    
    try {
      // Check if file exists to get current SHA
      const existingFile = await this.getFileInfo(fullPath);
      
      const requestBody = {
        message: `Update ${path} semantic data`,
        content: btoa(ttlContent)
      };
      
      // Only include SHA if file exists (for updates)
      if (existingFile?.sha) {
        requestBody.sha = existingFile.sha;
        console.log('[GitHubSemanticProvider] Updating existing file');
      } else {
        console.log('[GitHubSemanticProvider] Creating new file');
      }
      
      const response = await fetch(`${this.rootUrl}/${fullPath}`, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      console.log('[GitHubSemanticProvider] Write response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[GitHubSemanticProvider] Write failed:', response.status, errorText);
        throw new Error(`GitHub API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('[GitHubSemanticProvider] File written successfully:', path);
      return result;
    } catch (error) {
      console.error('[GitHubSemanticProvider] Write failed:', error);
      throw error;
    }
  }

  async readSemanticFile(path) {
    const fullPath = `${this.semanticPath}/${path}.ttl`;
    
    try {
      const fileInfo = await this.getFileInfo(fullPath);
      if (!fileInfo) {
        throw new Error(`File not found: ${path}`);
      }
      
      const content = atob(fileInfo.content);
      return content;
    } catch (error) {
      console.error('[GitHubProvider] Read failed:', error);
      throw error;
    }
  }

  async commitChanges(message, files) {
    // GitHub automatically commits on each file write
    // This method is for batch operations if needed
    return Promise.resolve();
  }

  async exportFullGraph() {
    const archive = {
      provider: 'github',
      user: this.user,
      repo: this.repo,
      exportedAt: new Date().toISOString(),
      files: {}
    };

    // Recursively fetch all semantic files
    const files = await this.listSemanticFiles();
    
    for (const file of files) {
      if (file.path.startsWith(this.semanticPath) && file.path.endsWith('.ttl')) {
        const content = await this.readSemanticFile(file.path.replace(`${this.semanticPath}/`, '').replace('.ttl', ''));
        archive.files[file.path] = content;
      }
    }

    return archive;
  }

  async importFullGraph(archive) {
    if (archive.provider !== 'github') {
      throw new Error('Archive is not from GitHub provider');
    }

    for (const [path, content] of Object.entries(archive.files)) {
      const relativePath = path.replace(`${this.semanticPath}/`, '').replace('.ttl', '');
      await this.writeSemanticFile(relativePath, content);
    }
  }

  async isAvailable() {
    try {
      // Check if the repository exists by accessing the repo info, not contents
      const repoUrl = `https://api.github.com/repos/${this.user}/${this.repo}`;
      const response = await fetch(repoUrl, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      if (response.ok) {
        return true; // Repository exists and is accessible
      }
      
      // If 404, repository doesn't exist
      if (response.status === 404) {
        return false;
      }
      
      // For other errors (401, 403, etc.), check if it's an auth issue
      return false;
    } catch (error) {
      console.error('[GitHubSemanticProvider] isAvailable error:', error);
      return false;
    }
  }

  async getStatus() {
    const isAvailable = await this.isAvailable();
    return {
      provider: 'github',
      available: isAvailable,
      user: this.user,
      repo: this.repo,
      semanticPath: this.semanticPath,
      lastChecked: new Date().toISOString()
    };
  }

  // Helper methods
  async getFileInfo(path) {
    try {
      const response = await fetch(`${this.rootUrl}/${path}`, {
        headers: {
          'Authorization': `token ${this.token}`
        }
      });
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      return null;
    }
  }

  async listSemanticFiles() {
    try {
      const response = await fetch(`${this.rootUrl}/${this.semanticPath}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      
      // If 404, the semantic path doesn't exist (empty repo or no schema folder)
      if (response.status === 404) {
        return [];
      }
      
      if (!response.ok) {
        // console.error('[GitHubSemanticProvider] listSemanticFiles error:', response.status, response.statusText);
        return [];
      }
      
      return await response.json();
    } catch (error) {
      // console.error('[GitHubSemanticProvider] listSemanticFiles error:', error);
      return [];
    }
  }

  generateStandardStructure(spaceName) {
    return {
      'profile/webid.ttl': `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .

<#me> a foaf:Person ;
    foaf:name "${spaceName} Owner" ;
    schema:url <https://github.com/${this.user}/${this.repo}> .`,
      
      'profile/preferences.ttl': `@prefix pref: <https://redstring.io/vocab/preferences/> .

pref:DisplaySettings a pref:Settings ;
    pref:theme "dark" ;
    pref:language "en" .`,
      
      'vocabulary/schemas/core-schema.ttl': `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

<#Concept> a owl:Class ;
    rdfs:label "Concept" ;
    rdfs:comment "A semantic concept in the knowledge space" .`,
      
      'federation/subscriptions.ttl': `@prefix fed: <https://redstring.io/vocab/federation/> .

fed:Subscriptions a fed:SubscriptionList ;
    fed:lastUpdated "${new Date().toISOString()}" .`,
      
      'federation/permissions.ttl': `@prefix acl: <http://www.w3.org/ns/auth/acl#> .

acl:DefaultPermissions a acl:AccessControl ;
    acl:mode acl:Read ;
    acl:agentClass foaf:Agent .`
    };
  }
}

/**
 * Self-Hosted Gitea Provider Implementation
 */
export class GiteaSemanticProvider extends SemanticProvider {
  constructor(config) {
    super({
      name: 'Self-Hosted Gitea',
      rootUrl: `${config.endpoint}/api/v1/repos/${config.user}/${config.repo}/contents`,
      authMechanism: 'token',
      ...config
    });
    
    this.endpoint = config.endpoint;
    this.user = config.user;
    this.repo = config.repo;
    this.token = config.token;
    this.semanticPath = config.semanticPath || 'schema';
  }

  async authenticate() {
    if (!this.token) {
      throw new Error('Gitea token required for authentication');
    }
    return { token: this.token, type: 'token' };
  }

  async createSemanticSpace(name) {
    const spacePath = `${this.semanticPath}/${name}`;
    
    // Create initial directory structure
    const structure = this.generateStandardStructure(name);
    
    for (const [path, content] of Object.entries(structure)) {
      await this.writeSemanticFile(`${spacePath}/${path}`, content);
    }

    return {
      name,
      url: `${this.endpoint}/${this.user}/${this.repo}/src/branch/main/${spacePath}`,
      apiUrl: `${this.rootUrl}/${spacePath}`,
      createdAt: new Date().toISOString()
    };
  }

  async writeSemanticFile(path, ttlContent) {
    const fullPath = `${this.semanticPath}/${path}.ttl`;
    
    try {
      const response = await fetch(`${this.rootUrl}/${fullPath}`, {
        method: 'POST',
        headers: {
          'Authorization': `token ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `Update ${path} semantic data`,
          content: btoa(ttlContent),
          branch: 'main'
        })
      });

      if (!response.ok) {
        throw new Error(`Gitea API error: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[GiteaProvider] Write failed:', error);
      throw error;
    }
  }

  async readSemanticFile(path) {
    const fullPath = `${this.semanticPath}/${path}.ttl`;
    
    try {
      const response = await fetch(`${this.rootUrl}/${fullPath}?ref=main`, {
        headers: {
          'Authorization': `token ${this.token}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`File not found: ${path}`);
      }
      
      const fileInfo = await response.json();
      const content = atob(fileInfo.content);
      return content;
    } catch (error) {
      console.error('[GiteaProvider] Read failed:', error);
      throw error;
    }
  }

  async commitChanges(message, files) {
    // Gitea automatically commits on each file write
    return Promise.resolve();
  }

  async exportFullGraph() {
    const archive = {
      provider: 'gitea',
      endpoint: this.endpoint,
      user: this.user,
      repo: this.repo,
      exportedAt: new Date().toISOString(),
      files: {}
    };

    // Recursively fetch all semantic files
    const files = await this.listSemanticFiles();
    
    for (const file of files) {
      if (file.path.startsWith(this.semanticPath) && file.path.endsWith('.ttl')) {
        const content = await this.readSemanticFile(file.path.replace(`${this.semanticPath}/`, '').replace('.ttl', ''));
        archive.files[file.path] = content;
      }
    }

    return archive;
  }

  async importFullGraph(archive) {
    if (archive.provider !== 'gitea') {
      throw new Error('Archive is not from Gitea provider');
    }

    for (const [path, content] of Object.entries(archive.files)) {
      const relativePath = path.replace(`${this.semanticPath}/`, '').replace('.ttl', '');
      await this.writeSemanticFile(relativePath, content);
    }
  }

  async isAvailable() {
    try {
      const response = await fetch(`${this.endpoint}/api/v1/version`, {
        headers: {
          'Authorization': `token ${this.token}`
        }
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getStatus() {
    const isAvailable = await this.isAvailable();
    return {
      provider: 'gitea',
      available: isAvailable,
      endpoint: this.endpoint,
      user: this.user,
      repo: this.repo,
      semanticPath: this.semanticPath,
      lastChecked: new Date().toISOString()
    };
  }

  // Helper methods
  async listSemanticFiles() {
    try {
      const response = await fetch(`${this.rootUrl}/${this.semanticPath}?ref=main`, {
        headers: {
          'Authorization': `token ${this.token}`
        }
      });
      
      if (!response.ok) {
        return [];
      }
      
      return await response.json();
    } catch (error) {
      return [];
    }
  }

  generateStandardStructure(spaceName) {
    return {
      'profile/webid.ttl': `@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix schema: <http://schema.org/> .

<#me> a foaf:Person ;
    foaf:name "${spaceName} Owner" ;
    schema:url <${this.endpoint}/${this.user}/${this.repo}> .`,
      
      'profile/preferences.ttl': `@prefix pref: <https://redstring.io/vocab/preferences/> .

pref:DisplaySettings a pref:Settings ;
    pref:theme "dark" ;
    pref:language "en" .`,
      
      'vocabulary/schemas/core-schema.ttl': `@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .

<#Concept> a owl:Class ;
    rdfs:label "Concept" ;
    rdfs:comment "A semantic concept in the knowledge space" .`,
      
      'federation/subscriptions.ttl': `@prefix fed: <https://redstring.io/vocab/federation/> .

fed:Subscriptions a fed:SubscriptionList ;
    fed:lastUpdated "${new Date().toISOString()}" .`,
      
      'federation/permissions.ttl': `@prefix acl: <http://www.w3.org/ns/auth/acl#> .

acl:DefaultPermissions a acl:AccessControl ;
    acl:mode acl:Read ;
    acl:agentClass foaf:Agent .`
    };
  }
}

/**
 * Provider Factory
 * Creates provider instances based on configuration
 */
export class SemanticProviderFactory {
  static createProvider(config) {
    switch (config.type) {
      case 'github':
        return new GitHubSemanticProvider(config);
      case 'gitea':
        return new GiteaSemanticProvider(config);
      default:
        throw new Error(`Unknown provider type: ${config.type}`);
    }
  }

  static getAvailableProviders() {
    return [
      {
        type: 'github',
        name: 'GitHub',
        description: 'GitHub-hosted semantic spaces',
        authMechanism: 'oauth',
        configFields: ['user', 'repo', 'token', 'semanticPath']
      },
      {
        type: 'gitea',
        name: 'Self-Hosted Gitea',
        description: 'Self-hosted Gitea instance',
        authMechanism: 'token',
        configFields: ['endpoint', 'user', 'repo', 'token', 'semanticPath']
      }
    ];
  }
} 