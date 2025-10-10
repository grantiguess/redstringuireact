import universeBackendBridge from './universeBackendBridge.js';
import { persistentAuth } from './persistentAuth.js';
import { oauthUrl } from './bridgeConfig.js';
import { formatUniverseNameFromRepo, buildUniqueUniverseName } from '../utils/universeNaming.js';
const STORAGE_TYPES = {
  GIT: 'git',
  LOCAL: 'local',
  BROWSER: 'browser'
};

const slotId = (() => {
  let counter = Date.now();
  return () => `slot_${(counter++).toString(36)}`;
})();

function normalizeRepository(linkedRepo) {
  if (!linkedRepo) return null;
  if (typeof linkedRepo === 'string') {
    const [user, repo] = linkedRepo.split('/');
    return user && repo ? { user, repo } : null;
  }
  if (linkedRepo.user && linkedRepo.repo) {
    return {
      user: linkedRepo.user,
      repo: linkedRepo.repo,
      branch: linkedRepo.branch || 'main',
      universeFolder: linkedRepo.universeFolder,
      universeFile: linkedRepo.universeFile
    };
  }
  return null;
}

function buildSlotsFromUniverse(universe, syncStatus = null) {
  const slots = [];

  if (universe.gitRepo?.linkedRepo) {
    const repo = normalizeRepository(universe.gitRepo.linkedRepo);
    if (repo) {
      const slot = {
        id: slotId(),
        type: STORAGE_TYPES.GIT,
        label: `@${repo.user}/${repo.repo}`,
        repo: {
          ...repo,
          universeFolder: universe.gitRepo.universeFolder,
          universeFile: universe.gitRepo.universeFile,
          priority: universe.gitRepo.priority || (universe.sourceOfTruth === 'git' ? 'primary' : 'secondary'),
          enabled: !!universe.gitRepo.enabled
        },
        lastSync: universe.metadata?.lastSync || null,
        status: syncStatus?.state || universe.metadata?.syncStatus || 'unknown',
        syncDetails: syncStatus || null
      };
      slots.push(slot);
    }
  }

  if (universe.localFile?.enabled) {
    slots.push({
      id: slotId(),
      type: STORAGE_TYPES.LOCAL,
      label: universe.localFile.path || `${universe.name || universe.slug}.redstring`,
      local: {
        path: universe.localFile.path,
        unavailableReason: universe.localFile.unavailableReason || null,
        hadHandle: !!universe.localFile.hadFileHandle
      },
      lastSync: universe.metadata?.lastSync || null,
      status: universe.metadata?.syncStatus || 'unknown'
    });
  }

  if (universe.browserStorage?.enabled) {
    slots.push({
      id: slotId(),
      type: STORAGE_TYPES.BROWSER,
      label: 'Browser cache',
      browser: {
        key: universe.browserStorage.key,
        role: universe.browserStorage.role || 'fallback'
      },
      lastSync: universe.metadata?.lastSync || null,
      status: universe.metadata?.syncStatus || 'unknown'
    });
  }

  return slots;
}

function buildSyncInfo(universe, syncStatus) {
  const gitLinked = !!(universe.gitRepo?.linkedRepo);
  const gitEnabled = !!(universe.gitRepo?.enabled);
  const lastSync = universe.metadata?.lastSync || null;

  if (!gitLinked || !gitEnabled) {
    return {
      state: 'disconnected',
      label: 'Git disconnected',
      tone: '#c62828',
      description: gitLinked ? 'Git slot disabled. Enable sync to resume automatic commits.' : 'Link a Git repository to enable automatic synchronization.',
      engine: null,
      hasGitLink: gitLinked,
      lastSync,
      pendingCommits: 0,
      isRunning: false,
      isHealthy: null,
      isInBackoff: false,
      consecutiveErrors: 0,
      lastCommitTime: null,
      lastErrorTime: null,
      sourceOfTruth: universe.sourceOfTruth
    };
  }

  if (!syncStatus) {
    // Check if auth is available
    const authStatus = persistentAuth.getAuthStatus();
    const hasAuth = authStatus?.isAuthenticated;
    
    return {
      state: 'standby',
      label: hasAuth ? 'Awaiting sync engine' : 'Connect GitHub to sync',
      tone: hasAuth ? '#ef6c00' : '#c62828',
      description: hasAuth 
        ? 'Sync engine not initialized yet. It will start automatically once activity is detected.'
        : 'GitHub authentication required. Click "Connect GitHub" in Accounts & Access to enable sync.',
      engine: null,
      hasGitLink: true,
      lastSync,
      pendingCommits: 0,
      isRunning: false,
      isHealthy: null,
      isInBackoff: false,
      consecutiveErrors: 0,
      lastCommitTime: lastSync,
      lastErrorTime: null,
      sourceOfTruth: universe.sourceOfTruth
    };
  }

  const {
    isRunning = false,
    isPaused = false,
    pendingCommits = 0,
    isHealthy = true,
    isInErrorBackoff = false,
    consecutiveErrors = 0,
    lastCommitTime = null,
    lastErrorTime = null
  } = syncStatus;

  const hasChanges = !!syncStatus.hasChanges;

  let state = 'idle';
  let label = 'All changes saved';
  let tone = '#2e7d32';
  let description = '';

  if (isInErrorBackoff || !isHealthy) {
    state = 'error';
    label = 'Unable to save changes';
    tone = '#c62828';
    description = 'Please check your connection and try again.';
  } else if (isRunning || pendingCommits > 0) {
    state = 'saving';
    label = 'Saving...';
    tone = '#666';
    description = '';
  } else if (isPaused) {
    state = 'paused';
    label = 'Sync paused';
    tone = '#ef6c00';
    description = 'Resume to save changes.';
  } else if (hasChanges) {
    state = 'unsaved';
    label = 'Unsaved changes';
    tone = '#ef6c00';
    description = '';
  }

  return {
    state,
    label,
    tone,
    description,
    engine: syncStatus,
    hasGitLink: true,
    lastSync,
    pendingCommits,
    hasChanges,
    hasUnsavedChanges: hasChanges || pendingCommits > 0,
    isRunning,
    isHealthy,
    isInBackoff: isInErrorBackoff,
    consecutiveErrors,
    lastCommitTime: lastCommitTime || lastSync,
    lastErrorTime,
    sourceOfTruth: universe.sourceOfTruth
  };
}

function mapUniverse(universe, activeSlug, syncStatusMap = {}) {
  const syncStatus = syncStatusMap?.[universe.slug] || null;
  const slots = buildSlotsFromUniverse(universe, syncStatus);
  const primaryType = universe.sourceOfTruth === 'git'
    ? STORAGE_TYPES.GIT
    : universe.sourceOfTruth === 'local'
      ? STORAGE_TYPES.LOCAL
      : STORAGE_TYPES.BROWSER;

  const primarySlot = slots.find(slot => slot.type === primaryType) || slots[0] || null;
  const browserSlot = slots.find(slot => slot.type === STORAGE_TYPES.BROWSER) || null;

  return {
    slug: universe.slug,
    name: universe.name || universe.slug,
    createdAt: universe.metadata?.created || universe.created || null,
    updatedAt: universe.metadata?.lastModified || universe.lastModified || null,
    lastOpenedAt: universe.metadata?.lastOpened || null,
    nodeCount: universe.metadata?.nodeCount || null,
    storage: {
      primary: primarySlot,
      backups: slots.filter(slot => slot !== primarySlot)
    },
    hasBrowserFallback: !!browserSlot,
    browserSlot,
    sources: Array.isArray(universe.sources) ? universe.sources : [],
    isActive: universe.slug === activeSlug,
    sync: buildSyncInfo(universe, syncStatus),
    raw: universe
  };
}

async function buildSyncStatusMap(universes) {
  if (typeof window === 'undefined') {
    return {};
  }

  if (!Array.isArray(universes) || universes.length === 0) {
    return {};
  }

  const entries = await Promise.all(universes.map(async (universe) => {
    if (!universe?.slug) {
      return [null, null];
    }

    try {
      const status = await universeBackendBridge.getSyncStatus(universe.slug);
      return [universe.slug, status];
    } catch (error) {
      console.warn('[gitFederationService] Failed to load sync status for', universe.slug, error);
      return [universe.slug, null];
    }
  }));

  return entries.reduce((acc, [slug, status]) => {
    if (slug) acc[slug] = status;
    return acc;
  }, {});
}

async function loadBackendState() {
  const [universes = [], activeUniverse, gitDashboard] = await Promise.all([
    universeBackendBridge.getAllUniverses(),
    universeBackendBridge.getActiveUniverse(),
    universeBackendBridge.getGitStatusDashboard?.()
  ]);

  const syncStatusMap = await buildSyncStatusMap(universes);
  const activeSlug = activeUniverse?.slug || null;

  return {
    universes: universes.map(universe => mapUniverse(universe, activeSlug, syncStatusMap)),
    activeUniverseSlug: activeSlug,
    activeUniverse: activeSlug ? universes.find(u => u.slug === activeSlug) : null,
    syncStatuses: syncStatusMap,
    gitDashboard: gitDashboard || null
  };
}

async function fetchAuthState() {
  const status = await universeBackendBridge.getAuthStatus();
  const appInstallation = persistentAuth.getAppInstallation();

  return {
    authStatus: status,
    githubAppInstallation: appInstallation
  };
}

async function ensureUniverseName(name, universes, currentSlug) {
  const safe = name?.trim() || 'Universe';
  return buildUniqueUniverseName(safe, universes.map(u => u.raw || u), currentSlug);
}

export const gitFederationService = {
  STORAGE_TYPES,

  async getState() {
    const [backendState, authState] = await Promise.all([
      loadBackendState(),
      fetchAuthState()
    ]);
    return {
      ...backendState,
      ...authState
    };
  },

  async refreshUniverses() {
    return loadBackendState();
  },

  async refreshAuth() {
    return fetchAuthState();
  },

  async createUniverse(name, options = {}) {
    const state = await loadBackendState();
    const uniqueName = await ensureUniverseName(name, state.universes, null);

    const createdUniverse = await universeBackendBridge.createUniverse(uniqueName, {
      enableGit: options.enableGit ?? false,
      enableLocal: options.enableLocal ?? true,
      sourceOfTruth: options.sourceOfTruth
    });
    const nextState = await this.refreshUniverses();
    return {
      ...nextState,
      createdUniverse
    };
  },

  async deleteUniverse(slug) {
    await universeBackendBridge.deleteUniverse(slug);
    return this.refreshUniverses();
  },

  async switchUniverse(slug, { saveCurrent = true } = {}) {
    await universeBackendBridge.switchActiveUniverse(slug, { saveCurrent });
    return this.getState();
  },

  async renameUniverse(slug, nextName) {
    const state = await this.refreshUniverses();
    const universe = state.universes.find(u => u.slug === slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }
    const uniqueName = await ensureUniverseName(nextName, state.universes, slug);
    await universeBackendBridge.updateUniverse(slug, { name: uniqueName });
    return this.refreshUniverses();
  },

  async setPrimaryStorage(slug, type, extra = {}) {
    const state = await this.refreshUniverses();
    const universe = state.universes.find(u => u.slug === slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }

    const payload = {};

    if (type === STORAGE_TYPES.GIT) {
      payload.sourceOfTruth = 'git';
      if (extra.gitRepo) {
        payload.gitRepo = {
          ...universe.raw.gitRepo,
          ...extra.gitRepo,
          enabled: true
        };
      } else if (universe.raw.gitRepo) {
        payload.gitRepo = { ...universe.raw.gitRepo, enabled: true };
      }
    } else if (type === STORAGE_TYPES.LOCAL) {
      payload.sourceOfTruth = 'local';
      payload.gitRepo = { ...universe.raw.gitRepo, enabled: false };
      payload.localFile = { ...universe.raw.localFile, enabled: true };
    } else if (type === STORAGE_TYPES.BROWSER) {
      payload.sourceOfTruth = 'browser';
      payload.browserStorage = { ...universe.raw.browserStorage, enabled: true };
    }

    await universeBackendBridge.updateUniverse(slug, payload);
    return this.refreshUniverses();
  },

  /**
   * Attach Git repository to an existing universe
   * 
   * IMPORTANT: This implements the 2-SLOT STORAGE SYSTEM
   * - Universes can have BOTH local file AND Git storage simultaneously
   * - sourceOfTruth determines which is PRIMARY (authoritative)
   * - The other slot serves as BACKUP/SECONDARY storage
   * 
   * This function preserves the existing sourceOfTruth to avoid data loss:
   * - If universe has local file enabled → keeps 'local' as primary, Git becomes backup
   * - If universe has no sourceOfTruth set → defaults to 'git'
   * - User can explicitly change primary via setPrimaryStorage()
   */
  async attachGitRepository(slug, repoConfig) {
    const state = await this.refreshUniverses();
    const universe = state.universes.find(u => u.slug === slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }

    const repo = {
      type: 'github',
      user: repoConfig.user,
      repo: repoConfig.repo
    };

    const linkedRepo = {
      type: 'github',
      user: repoConfig.user,
      repo: repoConfig.repo,
      authMethod: repoConfig.authMethod || 'oauth'
    };

    // CRITICAL: Respect existing sourceOfTruth to support 2-slot system
    // Only default to 'git' if there's no existing sourceOfTruth preference
    // This allows local-file-only universes to add Git as backup without losing local data
    const preservedSourceOfTruth = universe.raw.sourceOfTruth || 
      (universe.raw.localFile?.enabled ? 'local' : 'git');

    await universeBackendBridge.updateUniverse(slug, {
      gitRepo: {
        ...universe.raw.gitRepo,
        enabled: true,
        linkedRepo,
        universeFolder: repoConfig.universeFolder || universe.raw.gitRepo?.universeFolder || `universes/${slug}`,
        universeFile: repoConfig.universeFile || universe.raw.gitRepo?.universeFile || `${slug}.redstring`
      },
      sourceOfTruth: preservedSourceOfTruth
    });

    await universeBackendBridge.updateUniverse(slug, {
      sources: this.mergeSources(universe.raw.sources, {
        id: `src_${Date.now().toString(36)}`,
        type: 'github',
        user: repo.user,
        repo: repo.repo,
        name: `@${repo.user}/${repo.repo}`,
        addedAt: new Date().toISOString()
      })
    });

    return this.refreshUniverses();
  },

  async detachGitRepository(slug, repo) {
    const state = await this.refreshUniverses();
    const universe = state.universes.find(u => u.slug === slug);
    if (!universe) {
      throw new Error(`Universe not found: ${slug}`);
    }

    const sources = (universe.raw.sources || []).filter(src => {
      if (src.type !== 'github') return true;
      const sameUser = src.user?.toLowerCase() === repo.user.toLowerCase();
      const sameRepo = src.repo?.toLowerCase() === repo.repo.toLowerCase();
      return !(sameUser && sameRepo);
    });

    const payload = {
      sources
    };

    const linkedRepo = normalizeRepository(universe.raw.gitRepo?.linkedRepo);
    const wasLinkedRepo = linkedRepo && linkedRepo.user.toLowerCase() === repo.user.toLowerCase() && linkedRepo.repo.toLowerCase() === repo.repo.toLowerCase();
    
    if (wasLinkedRepo) {
      payload.gitRepo = {
        ...universe.raw.gitRepo,
        enabled: false,
        linkedRepo: null
      };
      payload.sourceOfTruth = universe.raw.localFile?.fileHandle ? 'local' : 'browser';
    }

    await universeBackendBridge.updateUniverse(slug, payload);
    
    // If this was the active linked repo, reload the universe from the new source of truth
    if (wasLinkedRepo) {
      console.log(`[GitFederationService] Reloading universe ${slug} from new source: ${payload.sourceOfTruth}`);
      try {
        await universeBackendBridge.reloadUniverse(slug);
      } catch (error) {
        console.warn(`[GitFederationService] Failed to reload universe after detach:`, error);
      }
    }
    
    return this.refreshUniverses();
  },

  mergeSources(existing = [], next) {
    const dedupeKey = src => src.type === 'github' ? `${src.type}:${src.user?.toLowerCase()}/${src.repo?.toLowerCase()}` : `${src.type}:${src.id}`;
    const map = new Map();
    existing.forEach(item => {
      const key = dedupeKey(item);
      if (!map.has(key)) map.set(key, item);
    });
    const nextKey = dedupeKey(next);
    map.set(nextKey, next);
    return Array.from(map.values());
  },

  async discoverUniverses(repoConfig) {
    const discovered = await universeBackendBridge.discoverUniversesInRepository({
      type: 'github',
      user: repoConfig.user,
      repo: repoConfig.repo,
      authMethod: repoConfig.authMethod || 'oauth'
    });
    return discovered;
  },

  async linkDiscoveredUniverse(discovered, repoConfig) {
    await universeBackendBridge.linkToDiscoveredUniverse(discovered, {
      type: 'github',
      user: repoConfig.user,
      repo: repoConfig.repo,
      authMethod: repoConfig.authMethod || 'oauth'
    });
    return this.getState();
  },

  async forceSave(slug, options) {
    await universeBackendBridge.forceSave(slug, undefined, options);
    return this.refreshUniverses();
  },

  async reloadActiveUniverse() {
    await universeBackendBridge.reloadActiveUniverse?.();
    return this.refreshUniverses();
  },

  async downloadLocalFile(slug) {
    await universeBackendBridge.downloadLocalFile(slug);
    return this.refreshUniverses();
  },

  async downloadGitUniverse(slug) {
    await universeBackendBridge.downloadGitUniverse(slug);
    return this.refreshUniverses();
  },

  async removeLocalFile(slug) {
    await universeBackendBridge.removeLocalFileLink(slug);
    return this.refreshUniverses();
  },

  async uploadLocalFile(file, slug) {
    const result = await universeBackendBridge.uploadLocalFile(file, slug);
    await this.refreshUniverses();
    return result; // Return the upload result so caller can check needsFileHandle flag
  },

  getOAuthRedirectUri() {
    return oauthUrl('/oauth/callback');
  },

  ensureAppInstallation() {
    return persistentAuth.getAppInstallation();
  }
};

export default gitFederationService;
export { STORAGE_TYPES };
