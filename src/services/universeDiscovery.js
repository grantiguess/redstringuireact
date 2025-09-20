/**
 * Universe Discovery Service
 * Scans repositories to find existing universes and enables easy linking
 */

const toTitleCase = (value) => value
  .split(/[-_\s]+/)
  .filter(Boolean)
  .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
  .join(' ');

const sanitizeSlug = (value) => {
  if (!value) return 'universe';
  return value
    .toString()
    .replace(/\.redstring$/i, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'universe';
};

const DEFAULT_PLACEHOLDER_NAMES = new Set([
  'untitled',
  'untitled universe',
  'untitled space',
  'untitled graph',
  'untitled web',
  'untitled node',
  'add',
  'switch',
  'nothing'
]);

const derivePathNaming = (filePath) => {
  const parts = (filePath || '').split('/').filter(Boolean);
  const fileName = parts.pop() || '';
  const fileBase = fileName.replace(/\.redstring$/i, '').trim();
  const folderCandidate = parts.length > 0 ? parts[parts.length - 1] : '';

  const genericFileNames = new Set(['universe', 'space', 'default', 'redstring']);
  const isGenericFileName = genericFileNames.has(fileBase.toLowerCase());

  const baseCandidate = (isGenericFileName ? folderCandidate : fileBase) || folderCandidate || fileBase;
  const safeBase = baseCandidate && baseCandidate.trim().length > 0 ? baseCandidate : 'universe';

  const slug = sanitizeSlug(safeBase);
  const fallbackName = toTitleCase(slug);

  return { slug, fallbackName };
};

const pickDisplayName = (candidateName, fallbackName) => {
  const trimmed = (candidateName || '').trim();
  const normalized = trimmed.toLowerCase();

  if (!trimmed || DEFAULT_PLACEHOLDER_NAMES.has(normalized) || normalized.startsWith('untitled ')) {
    return fallbackName;
  }

  return trimmed;
};

/**
 * Discover universes in a repository
 * @param {Object} provider - Git provider instance
 * @returns {Array} Array of discovered universe objects
 */
export const discoverUniversesInRepo = async (provider) => {
  try {
    console.log('[UniverseDiscovery] Scanning repository for .redstring universe files in standard locations (root, universes/, universe/)...');

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
        // Directory might not exist during discovery - this is expected
        if (error.message && error.message.includes('404')) {
          console.log(`[UniverseDiscovery] Directory '${basePath || 'root'}' not found (expected during repository scanning)`);
        } else {
          console.log(`[UniverseDiscovery] Path '${basePath}' not accessible: ${error.message}`);
        }
      }
    }

    console.log(`[UniverseDiscovery] Discovery complete: Found ${universes.length} valid universe files in repository`);
    return universes;

  } catch (error) {
    console.error('[UniverseDiscovery] Failed to discover universes:', error);
    return [];
  }
};

/**
 * Discover universes in a repository with basic statistics
 * @param {Object} provider - Git provider instance
 * @returns {{ universes: Array, stats: { scannedDirs: number, candidates: number, valid: number, invalid: number } }}
 */
export const discoverUniversesWithStats = async (provider) => {
  const stats = { scannedDirs: 0, candidates: 0, valid: 0, invalid: 0 };
  const universes = [];
  try {
    console.log('[UniverseDiscovery] Scanning repository for .redstring universe files with detailed statistics...');

    const universePaths = [
      'universes',
      'universe',
      '',
    ];

    for (const basePath of universePaths) {
      try {
        const contents = await provider.listDirectoryContents(basePath);
        stats.scannedDirs += 1;

        const redstringFiles = contents.filter(item =>
          item.name.endsWith('.redstring') && item.type === 'file'
        );
        stats.candidates += redstringFiles.length;

        const universeDirs = contents.filter(item =>
          item.type === 'dir' && (
            item.name.startsWith('universe') ||
            item.name === 'default' ||
            item.name === 'main'
          )
        );

        for (const file of redstringFiles) {
          const universeInfo = await analyzeUniverseFile(provider, `${basePath}/${file.name}`.replace(/^\//, ''));
          if (universeInfo) {
            universes.push({
              ...universeInfo,
              path: `${basePath}/${file.name}`.replace(/^\//, ''),
              location: basePath || 'root',
              type: 'file'
            });
            stats.valid += 1;
          } else {
            stats.invalid += 1;
          }
        }

        for (const dir of universeDirs) {
          const dirPath = `${basePath}/${dir.name}`.replace(/^\//, '');
          const { universes: dirUniverses, stats: dirStats } = await scanUniverseDirectoryWithStats(provider, dirPath);
          universes.push(...dirUniverses.map(u => ({
            ...u,
            location: dirPath,
            type: 'directory'
          })));
          stats.candidates += dirStats.candidates;
          stats.valid += dirStats.valid;
          stats.invalid += dirStats.invalid;
          stats.scannedDirs += dirStats.scannedDirs;
        }

      } catch (error) {
        // Directory might not exist during discovery - this is expected
        if (error.message && error.message.includes('404')) {
          console.log(`[UniverseDiscovery] Directory '${basePath || 'root'}' not found (expected during repository scanning)`);
        } else {
          console.log(`[UniverseDiscovery] Path '${basePath}' not accessible: ${error.message}`);
        }
      }
    }

    console.log(`[UniverseDiscovery] Discovery complete: Found ${universes.length} valid universes from ${stats.candidates} candidates across ${stats.scannedDirs} directories`);
    return { universes, stats };

  } catch (error) {
    console.error('[UniverseDiscovery] Failed to discover universes:', error);
    return { universes: [], stats };
  }
};

/**
 * Scan a specific directory for universe files with stats
 */
const scanUniverseDirectoryWithStats = async (provider, dirPath) => {
  const stats = { scannedDirs: 1, candidates: 0, valid: 0, invalid: 0 };
  try {
    const contents = await provider.listDirectoryContents(dirPath);
    const universes = [];

    const redstringFiles = contents.filter(item =>
      item.name.endsWith('.redstring') && item.type === 'file'
    );
    stats.candidates += redstringFiles.length;

    for (const file of redstringFiles) {
      const filePath = `${dirPath}/${file.name}`;
      const universeInfo = await analyzeUniverseFile(provider, filePath);
      if (universeInfo) {
        universes.push({
          ...universeInfo,
          path: filePath
        });
        stats.valid += 1;
      } else {
        stats.invalid += 1;
      }
    }

    return { universes, stats };
  } catch (error) {
    if (error.message && error.message.includes('404')) {
      console.log(`[UniverseDiscovery] Directory '${dirPath}' not found (expected during repository scanning)`);
    } else {
      console.error(`[UniverseDiscovery] Failed to scan directory ${dirPath}: ${error.message}`);
    }
    return { universes: [], stats };
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
    if (error.message && error.message.includes('404')) {
      console.log(`[UniverseDiscovery] Directory '${dirPath}' not found (expected during repository scanning)`);
    } else {
      console.error(`[UniverseDiscovery] Failed to scan directory ${dirPath}: ${error.message}`);
    }
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
    // Universe files are JSON .redstring files; read raw contents
    const content = await provider.readFileRaw(filePath);
    if (!content || typeof content !== 'string' || content.trim() === '') {
      // Empty file – skip silently
      return null;
    }
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

    const fallbackName = extractNameFromPath(filePath) || 'Universe';
    const rawCandidateName = metadata.title || metadata.name || userInterface.title;
    const name = pickDisplayName(rawCandidateName, fallbackName);
    const slug = extractSlugFromPath(filePath);

    return {
      name,
      slug,
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
    console.warn(`[UniverseDiscovery] Failed to analyze ${filePath}: ${error.message || error}`);
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
  const { fallbackName } = derivePathNaming(filePath);
  return fallbackName;
};

/**
 * Extract slug from file path for universe identification
 * @param {string} filePath - File path
 * @returns {string} Universe slug
 */
const extractSlugFromPath = (filePath) => {
  const { slug } = derivePathNaming(filePath);
  return slug;
};

/**
 * Create universe configuration for linking to discovered universe
 * @param {Object} discoveredUniverse - Universe found by discovery
 * @param {Object} repoConfig - Repository configuration
 * @returns {Object} Universe configuration for UniverseManager
 */
export const createUniverseConfigFromDiscovered = (discoveredUniverse, repoConfig) => {
  // Enforce name alignment with file name to reduce confusion
  const baseFileName = String(discoveredUniverse.fileName || '').replace(/\.redstring$/i, '');
  return {
    slug: discoveredUniverse.slug,
    name: baseFileName || discoveredUniverse.name,
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
      // Keep semantic schema at default; universes live outside schema
      schemaPath: 'schema',
      // Preserve the discovered universe folder and file for direct Git access
      universeFolder: extractSchemaPath(discoveredUniverse.path),
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
