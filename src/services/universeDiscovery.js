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
    console.log('[UniverseDiscovery] Scanning repository for .redstring universe files inside the "universes" folder...');
    const { universes } = await traverseRepositoryForUniverses(provider, { collectStats: false });
    console.log(`[UniverseDiscovery] Discovery complete: Found ${universes.length} universe files`);
    return universes;
  } catch (error) {
    console.error('[UniverseDiscovery] Failed to discover universes:', error);
    return [];
  }
};

export const discoverUniversesWithStats = async (provider) => {
  try {
    console.log('[UniverseDiscovery] Targeted scan for .redstring universe files with detailed statistics...');
    const { universes, stats } = await traverseRepositoryForUniverses(provider, { collectStats: true });
    console.log(`[UniverseDiscovery] Discovery complete: Found ${universes.length} valid universes from ${stats.candidates} candidates across ${stats.scannedDirs} directories`);
    return { universes, stats };
  } catch (error) {
    console.error('[UniverseDiscovery] Failed to discover universes:', error);
    return { universes: [], stats: { scannedDirs: 0, candidates: 0, valid: 0, invalid: 0 } };
  }
};

async function traverseRepositoryForUniverses(provider, { collectStats = false } = {}) {
  const stats = collectStats ? { scannedDirs: 0, candidates: 0, valid: 0, invalid: 0 } : null;
  const universes = [];

  const rootsToCheck = ['universes'];

  const shouldSkipDirectory = (segment) => {
    if (!segment) return false;
    const lower = segment.toLowerCase();
    return lower === 'backups' || lower.startsWith('.');
  };

  const walkDirectory = async (directory) => {
    if (!directory) return;
    if (stats) stats.scannedDirs += 1;

    let entries;
    try {
      entries = await provider.listDirectoryContents(directory);
    } catch (error) {
      if (error?.message?.includes('404')) {
        console.log(`[UniverseDiscovery] Directory '${directory}' not found (expected if repository has not been initialized)`);
        return;
      }
      console.warn(`[UniverseDiscovery] Failed to list directory ${directory}: ${error?.message || error}`);
      return;
    }

    for (const entry of entries) {
      const entryPath = `${directory}/${entry.name}`;

      if (entry.type === 'dir') {
        if (shouldSkipDirectory(entry.name)) {
          continue;
        }
        await walkDirectory(entryPath);
        continue;
      }

      if (entry.type !== 'file' || !entry.name.endsWith('.redstring')) {
        continue;
      }

      if (stats) stats.candidates += 1;

      try {
        const universeInfo = await analyzeUniverseFile(provider, entryPath);
        if (universeInfo) {
          universes.push({
            ...universeInfo,
            path: entryPath,
            location: directory,
            type: 'file',
            universeFolder: extractSchemaPath(entryPath),
            universeFile: entryPath.split('/').pop()
          });
          if (stats) stats.valid += 1;
        } else if (stats) {
          stats.invalid += 1;
        }
      } catch (error) {
        console.warn(`[UniverseDiscovery] Failed to analyze ${entryPath}: ${error.message}`);
        if (stats) stats.invalid += 1;
      }
    }
  };

  for (const root of rootsToCheck) {
    if (shouldSkipDirectory(root)) continue;
    await walkDirectory(root);
  }

  return {
    universes,
    stats: stats || { scannedDirs: rootsToCheck.length, candidates: universes.length, valid: universes.length, invalid: 0 }
  };
}

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
 * Extract universe folder name from universe file path
 * For path "universes/default/default.redstring", returns "default"
 * @param {string} filePath - Full path to universe file
 * @returns {string} Universe folder name (just the folder, not full path)
 */
const extractSchemaPath = (filePath) => {
  const parts = (filePath || '').split('/').filter(Boolean);
  if (parts.length <= 1) {
    const fileBase = parts[parts.length - 1] || '';
    return fileBase.replace(/\.redstring$/i, '') || 'default';
  }
  // Remove filename
  parts.pop();
  const folder = parts.pop();
  return folder || 'default';
};
