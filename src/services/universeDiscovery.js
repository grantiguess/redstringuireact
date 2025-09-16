/**
 * Universe Discovery Service
 * Scans repositories to find existing universes and enables easy linking
 */

/**
 * Discover universes in a repository
 * @param {Object} provider - Git provider instance
 * @returns {Array} Array of discovered universe objects
 */
export const discoverUniversesInRepo = async (provider) => {
  try {
    console.log('[UniverseDiscovery] Scanning repository for universes...');

    const universes = [];

    // Check for universes in standard locations
    const universePaths = [
      'universes',
      'universe',
      '',  // root level
    ];

    for (const basePath of universePaths) {
      try {
        const contents = await provider.listDirectoryContents(basePath);

        // Look for .redstring files
        const redstringFiles = contents.filter(item =>
          item.name.endsWith('.redstring') && item.type === 'file'
        );

        // Look for universe directories
        const universeDirs = contents.filter(item =>
          item.type === 'dir' && (
            item.name.startsWith('universe') ||
            item.name === 'default' ||
            item.name === 'main'
          )
        );

        // Process .redstring files at this level
        for (const file of redstringFiles) {
          const universeInfo = await analyzeUniverseFile(provider, `${basePath}/${file.name}`.replace(/^\//, ''));
          if (universeInfo) {
            universes.push({
              ...universeInfo,
              path: `${basePath}/${file.name}`.replace(/^\//, ''),
              location: basePath || 'root',
              type: 'file'
            });
          }
        }

        // Process universe directories
        for (const dir of universeDirs) {
          const dirPath = `${basePath}/${dir.name}`.replace(/^\//, '');
          const dirUniverses = await scanUniverseDirectory(provider, dirPath);
          universes.push(...dirUniverses.map(u => ({
            ...u,
            location: dirPath,
            type: 'directory'
          })));
        }

      } catch (error) {
        // Directory might not exist, continue
        console.log(`[UniverseDiscovery] Path ${basePath} not accessible:`, error.message);
      }
    }

    console.log(`[UniverseDiscovery] Found ${universes.length} universes in repository`);
    return universes;

  } catch (error) {
    console.error('[UniverseDiscovery] Failed to discover universes:', error);
    return [];
  }
};

/**
 * Scan a specific directory for universe files
 * @param {Object} provider - Git provider instance
 * @param {string} dirPath - Directory path to scan
 * @returns {Array} Array of universe objects in this directory
 */
const scanUniverseDirectory = async (provider, dirPath) => {
  try {
    const contents = await provider.listDirectoryContents(dirPath);
    const universes = [];

    const redstringFiles = contents.filter(item =>
      item.name.endsWith('.redstring') && item.type === 'file'
    );

    for (const file of redstringFiles) {
      const filePath = `${dirPath}/${file.name}`;
      const universeInfo = await analyzeUniverseFile(provider, filePath);
      if (universeInfo) {
        universes.push({
          ...universeInfo,
          path: filePath
        });
      }
    }

    return universes;
  } catch (error) {
    console.error(`[UniverseDiscovery] Failed to scan directory ${dirPath}:`, error);
    return [];
  }
};

/**
 * Analyze a universe file to extract metadata
 * @param {Object} provider - Git provider instance
 * @param {string} filePath - Path to the .redstring file
 * @returns {Object|null} Universe metadata or null if invalid
 */
const analyzeUniverseFile = async (provider, filePath) => {
  try {
    const content = await provider.readSemanticFile(filePath);
    const data = JSON.parse(content);

    // Check if it's a valid redstring file with content
    const hasContent = checkUniverseHasContent(data);

    if (!hasContent) {
      return null; // Skip empty universe files
    }

    // Extract metadata
    const metadata = data.metadata || {};
    const userInterface = data.userInterface || {};

    // Count content
    const stats = getUniverseStats(data);

    // Determine universe name from multiple sources
    const name =
      metadata.title ||
      metadata.name ||
      userInterface.title ||
      extractNameFromPath(filePath) ||
      'Untitled Universe';

    return {
      name,
      slug: extractSlugFromPath(filePath),
      fileName: filePath.split('/').pop(),
      stats,
      metadata: {
        created: metadata.created,
        modified: metadata.modified,
        version: metadata.version || data.format?.version,
        description: metadata.description
      },
      format: data.format || { version: 'unknown' },
      hasContent: true
    };

  } catch (error) {
    console.error(`[UniverseDiscovery] Failed to analyze ${filePath}:`, error);
    return null;
  }
};

/**
 * Check if universe data has actual content (updated logic from GitSyncEngine)
 * @param {Object} data - Parsed universe data
 * @returns {boolean} True if universe has content
 */
const checkUniverseHasContent = (data) => {
  if (!data) return false;

  // Check for content in any of the supported RedString formats
  return (
    // New format (v2.0.0-semantic): prototypeSpace, spatialGraphs, relationships
    (data.prototypeSpace && data.prototypeSpace.prototypes && Object.keys(data.prototypeSpace.prototypes).length > 0) ||
    (data.spatialGraphs && data.spatialGraphs.graphs && Object.keys(data.spatialGraphs.graphs).length > 0) ||
    (data.relationships && data.relationships.edges && Object.keys(data.relationships.edges).length > 0) ||

    // Legacy format with legacy section
    (data.legacy && data.legacy.graphs && Object.keys(data.legacy.graphs).length > 0) ||
    (data.legacy && data.legacy.nodePrototypes && Object.keys(data.legacy.nodePrototypes).length > 0) ||
    (data.legacy && data.legacy.edges && Object.keys(data.legacy.edges).length > 0) ||

    // Old legacy format (v1.0.0): direct properties
    (data.graphs && Object.keys(data.graphs).length > 0) ||
    (data.nodePrototypes && Object.keys(data.nodePrototypes).length > 0) ||
    (data.edges && Object.keys(data.edges).length > 0)
  );
};

/**
 * Get statistics about universe content
 * @param {Object} data - Parsed universe data
 * @returns {Object} Content statistics
 */
const getUniverseStats = (data) => {
  const stats = {
    nodes: 0,
    graphs: 0,
    edges: 0,
    format: 'unknown'
  };

  // New format
  if (data.prototypeSpace && data.prototypeSpace.prototypes) {
    stats.nodes = Object.keys(data.prototypeSpace.prototypes).length;
    stats.format = 'semantic';
  }
  if (data.spatialGraphs && data.spatialGraphs.graphs) {
    stats.graphs = Object.keys(data.spatialGraphs.graphs).length;
  }
  if (data.relationships && data.relationships.edges) {
    stats.edges = Object.keys(data.relationships.edges).length;
  }

  // Legacy format
  if (data.legacy) {
    if (data.legacy.nodePrototypes) {
      stats.nodes += Object.keys(data.legacy.nodePrototypes).length;
      stats.format = 'legacy-section';
    }
    if (data.legacy.graphs) {
      stats.graphs += Object.keys(data.legacy.graphs).length;
    }
    if (data.legacy.edges) {
      stats.edges += Object.keys(data.legacy.edges).length;
    }
  }

  // Old legacy format
  if (data.nodePrototypes && stats.format === 'unknown') {
    stats.nodes = Object.keys(data.nodePrototypes).length;
    stats.format = 'legacy';
  }
  if (data.graphs && stats.format === 'unknown') {
    stats.graphs = Object.keys(data.graphs).length;
  }
  if (data.edges && stats.format === 'unknown') {
    stats.edges = Object.keys(data.edges).length;
  }

  return stats;
};

/**
 * Extract universe name from file path
 * @param {string} filePath - File path
 * @returns {string} Extracted name
 */
const extractNameFromPath = (filePath) => {
  const fileName = filePath.split('/').pop();
  const baseName = fileName.replace('.redstring', '');

  // Clean up common naming patterns
  return baseName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase())
    .trim();
};

/**
 * Extract slug from file path for universe identification
 * @param {string} filePath - File path
 * @returns {string} Universe slug
 */
const extractSlugFromPath = (filePath) => {
  const fileName = filePath.split('/').pop();
  return fileName.replace('.redstring', '').toLowerCase();
};

/**
 * Create universe configuration for linking to discovered universe
 * @param {Object} discoveredUniverse - Universe found by discovery
 * @param {Object} repoConfig - Repository configuration
 * @returns {Object} Universe configuration for UniverseManager
 */
export const createUniverseConfigFromDiscovered = (discoveredUniverse, repoConfig) => {
  return {
    slug: discoveredUniverse.slug,
    name: discoveredUniverse.name,
    sourceOfTruth: 'git',
    localFile: {
      enabled: false,
      unavailableReason: 'Linked to Git repository'
    },
    gitRepo: {
      enabled: true,
      linkedRepo: {
        type: repoConfig.type,
        user: repoConfig.user,
        repo: repoConfig.repo,
        authMethod: repoConfig.authMethod
      },
      schemaPath: extractSchemaPath(discoveredUniverse.path),
      universeFile: discoveredUniverse.fileName,
      priority: 'primary'
    },
    metadata: {
      ...discoveredUniverse.metadata,
      discoveredAt: new Date().toISOString(),
      originalPath: discoveredUniverse.path
    }
  };
};

/**
 * Extract schema path from universe file path
 * @param {string} filePath - Full path to universe file
 * @returns {string} Schema path (directory containing the file)
 */
const extractSchemaPath = (filePath) => {
  const parts = filePath.split('/');
  parts.pop(); // Remove filename
  return parts.join('/') || 'schema';
};