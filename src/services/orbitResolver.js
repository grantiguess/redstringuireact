import { normalizeToCandidate } from './candidates.js';
import { KnowledgeFederation } from './knowledgeFederation.js';
import { findRelatedConcepts } from './semanticWebQuery.js';

// Simple in-memory cache keyed by prototypeId
const orbitCache = new Map(); // prototypeId -> { timestamp, candidates }

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours for UI orbit suggestions

// Map provider/source to nominal trust
const SOURCE_TRUST = {
  wikidata: 0.95,
  dbpedia: 0.85,
  schemaorg: 0.8,
  crossref: 0.8,
  musicbrainz: 0.85,
  external: 0.7,
};

function getSourceTrust(source) {
  return SOURCE_TRUST[String(source).toLowerCase()] ?? 0.75;
}

export async function fetchOrbitCandidatesForPrototype(prototype, options = {}) {
  if (!prototype || !prototype.name) return { inner: [], outer: [], all: [] };
  const key = prototype.id;
  const now = Date.now();
  const cached = orbitCache.get(key);
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.candidates;
  }

  try {
    // Mock data for testing - remove this when real resolvers are implemented
    const mockCandidates = [
      { id: 'mock-1', name: 'Test Concept 1', uri: 'http://example.org/1', source: 'mock', score: 0.9, tier: 'A' },
      { id: 'mock-2', name: 'Test Concept 2', uri: 'http://example.org/2', source: 'mock', score: 0.85, tier: 'A' },
      { id: 'mock-3', name: 'Test Concept 3', uri: 'http://example.org/3', source: 'mock', score: 0.8, tier: 'A' },
      { id: 'mock-4', name: 'Test Concept 4', uri: 'http://example.org/4', source: 'mock', score: 0.75, tier: 'B' },
      { id: 'mock-5', name: 'Test Concept 5', uri: 'http://example.org/5', source: 'mock', score: 0.7, tier: 'B' },
      { id: 'mock-6', name: 'Test Concept 6', uri: 'http://example.org/6', source: 'mock', score: 0.65, tier: 'B' },
      { id: 'mock-7', name: 'Test Concept 7', uri: 'http://example.org/7', source: 'mock', score: 0.6, tier: 'C' },
      { id: 'mock-8', name: 'Test Concept 8', uri: 'http://example.org/8', source: 'mock', score: 0.55, tier: 'C' },
    ];

    console.log('🎭 Using mock candidates for testing:', mockCandidates);

    // Split into inner (Tier A) and outer (Tier B/C)
    const inner = mockCandidates.filter(c => c.tier === 'A');
    const outer = mockCandidates.filter(c => c.tier !== 'A');
    const aggregated = mockCandidates;

    const result = { inner, outer, all: aggregated };
    orbitCache.set(key, { timestamp: now, candidates: result });
    return result;

    // TODO: Uncomment when real resolvers are ready
    // const graphStore = (await import('../store/graphStore.js')).default.getState();
  } catch {}

  const graphStore = (await import('../store/graphStore.js')).default.getState();
  const federation = new KnowledgeFederation(graphStore);

  const seed = prototype.name;
  const context = { contextFit: 0.85 };

  const providers = [];
  // 1) KnowledgeFederation: importSingleEntity then findEntitiesRelated if available
  try {
    providers.push(
      federation.importSingleEntity(seed, ['wikidata', 'dbpedia']).then((entity) => {
        if (!entity) return [];
        const asCandidate = [];
        // Convert properties to pairs resembling predicate -> value
        if (entity.properties instanceof Map) {
          entity.properties.forEach((arr, predicate) => {
            arr.forEach((p) => {
              asCandidate.push(
                normalizeToCandidate(
                  {
                    name: String(p.value?.label || p.value || ''),
                    uri: p.value?.uri || null,
                    predicate,
                    source: p.source,
                    sourceTrust: getSourceTrust(p.source),
                    externalLinks: p.value?.uri ? [p.value.uri] : [],
                    types: entity.types?.map?.(t => t.type) || [],
                  },
                  context
                )
              );
            });
          });
        }
        return asCandidate;
      })
    );
  } catch {}

  // 2) Semantic web query utility
  try {
    providers.push(
      findRelatedConcepts(seed, { limit: 32 }).then((results) => {
        if (!Array.isArray(results)) return [];
        return results.map((r) =>
          normalizeToCandidate(
            {
              name: r.name || r.label,
              uri: r.uri,
              predicate: r.predicate,
              source: r.source || 'external',
              sourceTrust: getSourceTrust(r.source || 'external'),
              externalLinks: r.externalLinks || (r.uri ? [r.uri] : []),
              equivalentClasses: r.types || [],
              claims: r.claims || [],
            },
            context
          )
        );
      })
    );
  } catch {}

  // 3) Fallback: use simple heuristics from prototype.externalLinks (sameAs)
  const externalLinks = prototype.externalLinks || [];
  if (Array.isArray(externalLinks) && externalLinks.length > 0) {
    const linkCandidates = externalLinks.slice(0, 16).map((uri) =>
      normalizeToCandidate(
        {
          name: uri,
          uri,
          predicate: 'externalUrl',
          source: 'external',
          sourceTrust: getSourceTrust('external'),
          externalLinks: [uri],
        },
        context
      )
    );
    providers.push(Promise.resolve(linkCandidates));
  }

  let aggregated = [];
  const batches = await Promise.allSettled(providers);
  batches.forEach((b) => {
    if (b.status === 'fulfilled' && Array.isArray(b.value)) aggregated.push(...b.value);
  });

  // Dedupe by uri+name
  const seen = new Set();
  aggregated = aggregated.filter((c) => {
    const key = `${c.uri || ''}|${c.name}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by score desc
  aggregated.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Partition into inner (Tier A top 8) and outer (others up to 32)
  const tierA = aggregated.filter((c) => c.tier === 'A');
  const inner = tierA.slice(0, 8);
  const outer = aggregated.filter((c) => !inner.includes(c)).slice(0, 64);

  const result = { inner, outer, all: aggregated };
  orbitCache.set(key, { timestamp: now, candidates: result });
  return result;
}

export function invalidateOrbitCacheForPrototype(prototypeId) {
  orbitCache.delete(prototypeId);
}


