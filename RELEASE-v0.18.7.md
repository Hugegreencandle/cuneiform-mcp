# cuneiform-mcp v0.18.7 — Release Notes

*Released 2026-05-22. Cluster-topology tool — fills the BFS-tree edge-set gap in reconstruct_cluster.*

---

## TL;DR

**v0.18.7 adds one cluster-topology tool:**

- **NEW: `cluster_pair_similarity_matrix`** — given an arbitrary list of museum numbers (typically the `cluster_members` from a prior `reconstruct_cluster` call), compute the FULL upper-triangular pairwise fuzzy-Jaccard matrix. Returns edges, per-tablet degree at multiple thresholds, edge-weight summary stats, and connected-component analysis at 5 thresholds.

This closes a gap exposed by the 2026-05-22 BM.77056 cluster survey: `reconstruct_cluster` returns members + BFS-tree edges, but those edges are only what was discovered during expansion. Sibling-pair similarity within the cluster is partially captured (when a candidate is already-in-cluster, the edge is recorded) but never exhaustively tested. For visualization, topology analysis, or hub/leaf identification, the full N×N pairwise matrix is needed. v0.18.7 provides it.

---

## What's new

### Tool count: 33 → 34

### New tool: `cluster_pair_similarity_matrix`

**Question answered:** "Given this set of tablets, what is the full pairwise similarity topology — not just the BFS-tree backbone?"

**Input:**
- `tablet_ids: string[]` — required, minimum 2. Typically the `cluster_members` array from a `reconstruct_cluster` result, but any set of museum numbers works.
- `min_jaccard: number?` — minimum fuzzy-Jaccard for an edge to be included. Default 0.10. Tighter (e.g. 0.20) yields the strong-similarity backbone; looser (e.g. 0.05) yields the full neighborhood.
- `top_k_per_node: number?` — how many fuzzy parallels to fetch per tablet (drives sibling-pair coverage). Default 50 (maximizes coverage). Lower if the tablet set is small.

**Output:**
- `edges` — sparse edge list (pairs with J ≥ min_jaccard), sorted by fuzzy_jaccard descending
- `edge_stats` — total possible pairs, edges above threshold, density, weight-distribution stats (min/median/mean/max)
- `per_tablet_degree` — for each input tablet: degree at thresholds 0.10/0.20/0.30 + max edge weight, sorted by d@0.20 descending (surfaces hub tablets)
- `connected_components` — component count + largest-component size + isolated-tablet count at thresholds 0.10/0.20/0.30/0.40/0.50 (the topology threshold ladder)
- `not_in_corpus` — input tablet IDs that weren't found in the fuzzy-parallel corpus (typically: synthetic IDs, malformed museum numbers)

**Use cases:**

```
# Step 1 — Reconstruct a cluster
result = reconstruct_cluster(seed='BM.77056', max_size=100)

# Step 2 — Get the full pairwise topology of the cluster
member_ids = result.cluster_members.map(m => m.tablet_id)
matrix = cluster_pair_similarity_matrix(tablet_ids=member_ids, min_jaccard=0.10)

# Step 3 — Identify hub tablets (high degree at J≥0.20)
top_hubs = matrix.per_tablet_degree.slice(0, 5)  // sorted by degree

# Step 4 — Decide threshold for topology visualization
# matrix.connected_components shows how the cluster fragments at higher J
# e.g. one big component at J=0.10 → 5 components at J=0.30 → 25 isolated nodes at J=0.50
```

**Companion to:** `reconstruct_cluster` (v0.17.1, BFS expansion) and `find_fuzzy_parallels` (v0.17.0, per-tablet top-K). Together they form a three-level zoom: per-tablet neighbors → cluster reconstruction → full pairwise matrix.

**Known limitation:** For tablets with very many neighbors (>50), the top-K cutoff means a pair (A,B) might not appear in A's top-K if A has 100+ high-similarity neighbors. The tool surfaces both A→B and B→A directions and takes the max; raising `top_k_per_node` to 50 (the default) mitigates this for most clusters but cannot eliminate it for extreme-density nodes.

---

## The v0.18.4 → v0.18.7 arc — full sequence

| Version | Tool | Closes |
|---|---|---|
| v0.18.4 | `coverage_stats_for_collection` + `reconstruct_cluster.min_sign_count` | Cluster-time quality filtering (NZK lesson) |
| v0.18.5 | `list_collection_prefixes` | Corpus-exploration entry point |
| v0.18.6 | `find_short_fragments` | Quality-audit primitive (corpus-wide marginal-signal view) |
| v0.18.7 | `cluster_pair_similarity_matrix` | Cluster-topology completeness (BFS-tree → full matrix) |

Four releases shipped 2026-05-22 in response to gaps identified during the BM.77056 cluster survey. Combined: 4 new tools + 1 quality filter, ~1,400 LOC across `src/collectionCoverage.ts` + `src/clusterMatrix.ts` + `src/anomalySurface.ts` + `src/index.ts` + `src/reconstructCluster.ts`.

---

## Files changed

- `src/clusterMatrix.ts` — NEW FILE, new tool's backing module (`clusterPairSimilarityMatrix()` + supporting types + union-find component analysis)
- `src/index.ts` — registered `cluster_pair_similarity_matrix` tool, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.7

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.7 smoke OK — 34 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart (v0.18.4-v0.18.7 all become live on next reload)

---

## What's next (v0.18.8+)

The metadata-enrichment gap noted in v0.18.4/5/6 release notes is now the only obvious blocker on shipping the original program-doc quick-wins (`find_unpublished_in_publication` + `compare_dialects`). Both require populated `period`/`genre`/`city`/`designation` fields, which currently exist only for 226 of 36,476 tablets in the cache.

Path forward for v0.18.8:
- Load `fragment-metadata.json` on tool startup
- Backfill missing entries on-demand when a coverage or filter query references them
- OR provide a batch-backfill script that respects eBL API rate limits

After metadata enrichment lands, the v0.18.4 coverage-stats tool will surface real period/genre/city distributions instead of "(unknown)" — closing the v0.18.4 known-issue and unblocking the next two quick-win tools.
