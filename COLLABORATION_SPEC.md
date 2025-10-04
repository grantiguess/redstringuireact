# Redstring Collaboration & Federation Spec (Git‑First)

Note: This draft spec described intended behavior. For the up-to-date implementation guide of Git federation as it exists now, see `GIT_FEDERATION.md`.

Status: Draft

This spec describes a Git‑first, decentralized collaboration model for Redstring that:
- Uses Git (GitHub, GitLab, Gitea/Forgejo, SourceHut, or self‑hosted) as the primary collaboration engine
- Keeps in‑app collaboration minimal; Redstring focuses on local‑first editing, semantic diffs, and background sync
- Treats Redstring as a “port” for multiple identities — no single global account
- Extends the on‑disk format with Git‑aware federation references while remaining compatible with existing files

This spec complements: `redstring-format-spec.md`, `GIT_NATIVE_PROTOCOL.md`, `DYNAMIC_FEDERATION_GUIDE.md`, and `UNIVERSE_SHARING_FEATURES.md`.

## 1. Scope & Principles

Goals
- Git as source of collaboration: forks, branches, PRs/MRs.
- Minimal central services; optional relays/indexers do not store user data.
- Decentralized identity: link external accounts (WebID, Git, PGP, Sigstore, social) without creating a Redstring account.
- Merge‑friendly storage: canonical file plus an optional sharded mirror.
- Reproducible federation: cross‑universe links pin exact Git commits (SHAs) with clear update semantics.

Non‑Goals
- Real‑time CRDT co‑editing in the app (can be added later).
- Centralized identity management or mandatory hosted accounts.

Definitions
- Universe: A Redstring workspace stored in a Git repo.
- Canonical file: `universe.redstring` — whole universe JSON‑LD.
- Sharded mirror: `universe/**` — per‑node/edge/graph JSON files for merge friendliness.
- Pinned reference: A cross‑repo link specifying a commit SHA (or tag/branch) and path.

## 2. Repository Structure

Required
- `universe.redstring` — Canonical universe file (JSON‑LD per `redstring-format-spec.md`).

Recommended (sharded mirror for low‑conflict PRs)
- `universe/nodes/*.json` — One file per node; filename equals node id + `.json`.
- `universe/edges/*.json` — One file per edge; filename equals edge id + `.json`.
- `universe/graphs/*.json` — One file per graph; filename equals graph id + `.json`.
- `federation/references.jsonld` — External references with Git pinning (see §4).
- `federation/subscriptions.ttl` — Spaces followed by this universe.
- `federation/cross-refs/` — Cached snapshots of pinned external artifacts.
- `profile/identities.jsonld` — Linked identities (see §5).

Optional
- `.github/PULL_REQUEST_TEMPLATE/redstring.md` — Semantic change template.
- `.github/workflows/redstring-validate.yml` — JSON‑LD + graph integrity validation.
- `CODEOWNERS` — Ownership rules (e.g., `universe/graphs/*`).

Bidirectional Mapping
- The app MUST be able to read/write the canonical file and optionally maintain the sharded mirror. Round‑tripping must not lose information.

## 3. Sharded Mirror Conventions

File naming
- Nodes: `universe/nodes/<nodeId>.json`
- Edges: `universe/edges/<edgeId>.json`
- Graphs: `universe/graphs/<graphId>.json`

Content shape
- Each sharded file holds exactly one top‑level entity (`@type` Node|Edge|Graph) matching the canonical entity shape in `universe.redstring`.
- Sharded files MUST be canonicalized: stable key order; omit null/empty fields unless required by schema; stable ID casing.

Composition
- When exporting `universe.redstring`, the app composes from sharded files if present; otherwise uses in‑memory state.
- When importing edits, the app updates both in‑memory state and sharded files; differences propagate to the canonical file.

## 4. Federation Reference Extension (Git‑Aware)

Purpose
- Allow edges, nodes, and graphs to reference external artifacts stored in other Git repos with reproducible pinning.

Location
- Canonical: `universe.redstring.metadata.federation.references[]`
- Mirror: `federation/references.jsonld` — same entries, JSON‑LD context‑aware.

Git reference object
```
git: {
  host: "github.com" | "gitlab.com" | "<domain>",
  repo: "owner/name" | "group/project",
  url: "https://<host>/<owner>/<name>",
  path: "universe/nodes/solar.json",   // path within repo
  ref:  "<sha|tag|branch>",
  refType: "sha" | "tag" | "branch",
  integrity?: {
    algo: "sha256" | "sha512",
    digest: "<hex>"                    // of file content at ref
  },
  signed?: {
    type: "pgp" | "sigstore",
    signer: "<fingerprint|issuer/subject>",
    signature: "<ascii-armored|bundle-uri>"
  }
}
```

Reference entry example (JSON‑LD)
```
{
  "@context": "https://redstring.net/contexts/v1.jsonld",
  "nodeId": "renewable-energy",
  "relationship": "relatedTo",
  "rdfStatement": {
    "@type": "Statement",
    "subject": {"@id": "node:renewable-energy-prototype"},
    "predicate": {"@id": "node:related-to"},
    "object": {"@id": "node:solar-power-prototype"}
  },
  "git": {
    "host": "github.com",
    "repo": "alice/climate-universe",
    "url": "https://github.com/alice/climate-universe",
    "path": "universe/nodes/solar-power.json",
    "ref": "6b1e2c8f…",
    "refType": "sha"
  }
}
```

Caching
- The app MAY cache the referenced file at `federation/cross-refs/<host>/<owner>/<repo>/<sha>/<path>` to ensure offline reproducibility.

Update semantics
- `refType: sha` — immutable; updates require an explicit ref change.
- `refType: tag` — app SHOULD resolve to a SHA and record it upon import.
- `refType: branch` — app SHOULD prompt to pin a SHA before applying changes.

## 5. Identity as Ports (Decentralized Identity Linking)

File: `profile/identities.jsonld`

Purpose
- Link multiple external identities without creating a Redstring account.

Shape (example)
```
{
  "@context": {
    "@vocab": "https://redstring.net/vocab/",
    "webid": "http://xmlns.com/foaf/0.1/webId",
    "github": "https://schema.org/identifier",
    "gitlab": "https://schema.org/identifier",
    "gitea": "https://schema.org/identifier",
    "sourcehut": "https://schema.org/identifier",
    "mastodon": "https://schema.org/identifier",
    "atproto": "https://schema.org/identifier",
    "pgp": "https://w3id.org/security#publicKey",
    "sigstore": "https://sigstore.dev/claims#identity"
  },
  "identities": {
    "webId": "https://alice.com/profile/card#me",
    "github": "alice",
    "gitlab": "alice@lab",
    "gitea": {"host": "git.example.org", "user": "alice"},
    "sourcehut": "~alice",
    "mastodon": "@alice@fosstodon.org",
    "atproto": "alice.bsky.social",
    "pgp": {"fingerprint": "ABCD…"},
    "sigstore": {"issuer": "https://accounts.google.com", "subject": "alice@example.com"}
  }
}
```

Usage
- UI displays verification badges from commit signatures (PGP/sigstore) and linked accounts.
- No central registry; mappings live in the repo and local app state.

## 6. Collaboration Flows (Git‑Native)

Open/Sync
- Connect a provider (OAuth/PAT/SSH). Select a repo. The app edits locally, shows semantic diffs, and syncs in background. Users can choose Sync Mode: `Local` (default) or `Git` (experimental) per `GIT_NATIVE_PROTOCOL.md`.

Propose Change
- “Propose PR/MR” creates a branch, commits sharded + canonical updates, and opens a provider URL with a prefilled semantic change summary.

Import Universe
- Paste a Git URL or select from provider search. App loads `universe.redstring` or sharded mirror, creates a new branch locally, and (optionally) pins the import to a SHA.

Cross‑Link Nodes/Edges
- Creating a link to an external item writes an RDF triple and a `federation.references[]` entry with a Git pin.

Pull Updates
- “Pull latest” discovers upstream changes and shows a semantic diff. For branch‑tracked references, app prompts to pin specific SHAs before applying.

Subscriptions
- `federation/subscriptions.ttl` lists followed spaces. App polls or uses webhooks if available, surfacing a lightweight “updates available” banner.

## 7. Conflict Resolution & Merge Policy

General rules
- Prefer sharded merges to avoid large file conflicts.
- IDs are authoritative; merges are key‑based by `id`.
- Non‑overlapping additions merge cleanly. Field collisions prompt a review.

Node/Edge merge
- Scalars: last‑writer‑wins with prompt when both sides changed.
- Arrays (e.g., `definitionNodeIds`): union by value with stable ordering; duplicates removed.
- Objects (e.g., `spatial`, `cognitive`): deep merge by key; prompts on conflicting scalars.

Graph merge
- `nodeIds`/`edgeIds`: set‑union with stable ordering.
- `definingNodeIds`: set‑union; preserve semantics from `redstring-format-spec.md`.

RDF dual format
- `rdfStatement` MUST reflect resulting `sourcePrototypeId`, `predicatePrototypeId`, `destinationPrototypeId`. If any prototype mapping changed, the app MUST re‑derive the triple.

## 8. Semantic Diff Standard

Summary JSON (generated per PR/MR)
```
{
  "nodesAdded": ["solar-power"],
  "nodesRemoved": [],
  "nodesModified": [{"id": "renewable-energy", "fields": ["description", "color"]}],
  "edgesAdded": ["price-energy-connection"],
  "edgesRemoved": [],
  "graphsModified": ["main-workspace"],
  "triplesAdded": ["alice:SolarPower alice:relatesTo alice:RenewableEnergy"],
  "triplesRemoved": []
}
```

Human‑Readable PR Section
- What changed (nodes/edges/graphs)
- Why (free text)
- Impacted references (external links updated)

## 9. Validation & CI (Recommended)

Validation rules
- JSON‑LD is parseable using the declared context.
- All IDs unique across nodes/edges/graphs.
- Edge endpoints exist; dual format alignment holds (prototypes consistent with instance references).
- Sharded mirror and canonical compose without loss.
- `federation.references[].git` objects include valid `repo`, `path`, and `ref`.

CI suggestion
- Provide a workflow (e.g., `.github/workflows/redstring-validate.yml`) that runs validation on PRs. It SHOULD fetch pinned refs to verify reproducibility when network policy allows.

## 10. Security & Integrity

Recommendations
- Enable required signed commits on shared repos (PGP or Sigstore). Surface signature verification in the app.
- Prefer `refType: sha` for external references. For tags/branches, prompt to pin a SHA when importing.
- Minimize token scopes; store tokens locally and never commit them.

## 11. Provider Compatibility

Supported concepts
- GitHub, GitLab (cloud or self‑host), Gitea/Forgejo, SourceHut, generic Git over SSH/HTTP.

Auth
- OAuth (GitHub/GitLab), Personal Access Tokens, or SSH keys as supported by provider.

Operations mapping
- Read/write files, create branches, open PRs/MRs, fetch commit metadata for signatures and SHAs.

## 12. Discovery (Decentralized)

Git‑native
- Use repository topics/labels (e.g., `redstring-universe`), README badges, and provider search to discover universes.

RDF/WebID
- Follow `.well-known/redstring-discovery`, `federation/subscriptions.ttl`, and cross‑domain links per `DYNAMIC_FEDERATION_GUIDE.md`.

Optional hosted index
- A stateless indexer MAY ingest webhook URLs from opted‑in repos to improve searchability. It MUST not be required for collaboration.

## 13. Minimal UI Surfaces

- Provider connect (choose repo; set Sync Mode: Local|Git).
- Semantic Diff panel for staged/remote changes.
- “Propose PR/MR” (opens provider UI) and “Pull Latest”.
- Federation panel: paste Git URL to subscribe, view pinned SHA, “Update to latest”, “Pin SHA”.
- Identity panel: link accounts (WebID/Git/PGP/Sigstore/social); show verification badges.

## 14. Backward Compatibility

- Universes containing only `universe.redstring` remain valid.
- Sharded mirror is optional; the app MUST operate with canonical‑only repos.
- Federation references without `git` blocks remain valid; Git pinning augments but does not replace existing RDF fields.

## 15. Examples

Sharded node file: `universe/nodes/renewable-energy.json`
```
{
  "@type": "Node",
  "id": "renewable-energy",
  "name": "Renewable Energy",
  "description": "Clean energy technologies and systems",
  "color": "#FF6F00",
  "spatial": {"x": 500, "y": 200, "scale": 1.0},
  "definitionGraphIds": []
}
```

Sharded edge file: `universe/edges/price-energy-connection.json`
```
{
  "@type": "Edge",
  "id": "price-energy-connection",
  "sourceId": "carbon-pricing",
  "destinationId": "renewable-energy",
  "name": "Economic Incentive",
  "typeNodeId": "base-connection-prototype",
  "rdfStatement": {
    "@type": "Statement",
    "subject": {"@id": "node:carbon-pricing-prototype"},
    "predicate": {"@id": "node:base-connection-prototype"},
    "object": {"@id": "node:renewable-energy-prototype"}
  },
  "sourcePrototypeId": "carbon-pricing-prototype",
  "destinationPrototypeId": "renewable-energy-prototype",
  "predicatePrototypeId": "base-connection-prototype"
}
```

Federation reference (with pin): `federation/references.jsonld`
```
[
  {
    "nodeId": "renewable-energy",
    "relationship": "relatedTo",
    "git": {
      "host": "github.com",
      "repo": "alice/climate-universe",
      "url": "https://github.com/alice/climate-universe",
      "path": "universe/nodes/solar-power.json",
      "ref": "6b1e2c8f…",
      "refType": "sha"
    }
  }
]
```

## 16. Appendix: JSON Schema Fragments (Informal)

`FederationGitRef` (informal)
```
type FederatedGitRef = {
  host: string,
  repo: string,
  url?: string,
  path: string,
  ref: string,
  refType: "sha" | "tag" | "branch",
  integrity?: { algo: "sha256" | "sha512", digest: string },
  signed?: { type: "pgp" | "sigstore", signer: string, signature: string }
}
```

`Identities` (informal)
```
type Identities = {
  webId?: string,
  github?: string,
  gitlab?: string,
  gitea?: { host: string, user: string },
  sourcehut?: string,
  mastodon?: string,
  atproto?: string,
  pgp?: { fingerprint: string },
  sigstore?: { issuer: string, subject: string }
}
```

---

This spec defines the minimal, interoperable surface for Git‑first collaboration with decentralized identity, while preserving Redstring’s existing format and philosophy. Implementers can adopt the canonical file only, add the sharded mirror for merge ergonomics, and optionally integrate CI validation and identity verification signals.

