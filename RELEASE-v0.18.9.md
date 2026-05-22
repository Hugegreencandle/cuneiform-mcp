# cuneiform-mcp v0.18.9 — Release Notes

*Released 2026-05-22. Sixth release of the day. Corpus-wide same-scribe group discovery — generalizes the BM.34970-quartet methodology to systematic discovery.*

---

## TL;DR

**v0.18.9 adds one corpus-wide discovery tool:**

- **NEW: `find_scribal_groups`** — given a museum-collection prefix (e.g., `K`, `BM`, `Sm`), surface ALL mutually-reciprocal same-scribe groups at a configurable cosine threshold. Returns groups of size ≥ 3 (the quartet-class) by default, with per-group cohesion statistics + per-member intra-group degree.

Generalizes the per-tablet `find_same_scribe_candidates` (v0.18.0) to systematic discovery. Answers the question: **"what same-scribe scribal-lineage groups exist that we have NOT yet found by happenstance?"**

The motivating context is the 2026-05-22 methods paper §3.4.1 BM.34970 quartet finding — a 4-tablet same-scribe group at signature cosine 0.8866 (new corpus-wide record). That finding was **opportunistic**, surfaced only because `reconstruct_cluster` happened to traverse a cluster member that pulled the four tablets together. This tool answers the systematic question — and could surface additional quartet-class or larger scribal-lineage groups corpus-wide that have not yet been published.

---

## What's new

### Tool count: 35 → 36

### New tool: `find_scribal_groups`

**Algorithm:**

1. Iterate over tablets in the requested prefix (cost-bounded by `max_tablets_to_scan`), prioritizing larger tablets (more reliable signatures)
2. For each tablet, fetch top-K same-scribe candidates with cosine ≥ threshold
3. Collect **mutually-reciprocal** edges (A in B's top-K AND B in A's top-K — same discipline as the methods paper §3.4 reciprocal-pair criterion)
4. Apply union-find to merge transitively-connected groups
5. Filter to groups of size ≥ `min_group_size` (default 3 = quartet-class)
6. Compute per-group cohesion (mean / min / max pairwise cosine within group + edge density)
7. Return groups sorted by size desc, then cohesion desc

**Input:**
- `prefix_filter: string?` — scope (e.g. `'K'`). Omit for full corpus scan.
- `min_cosine: number?` — minimum signature cosine for a reciprocal edge. Default 0.6.
- `min_group_size: number?` — minimum group size to return. Default 3 (quartet-class). Set 2 to surface all same-scribe pairs.
- `min_sign_count: number?` — skip tablets below this sign_count. Default 50.
- `max_tablets_to_scan: number?` — cost cap. Default 500. Increase to ~2500 for full coverage of a major prefix.
- `top_k_per_tablet: number?` — same-scribe candidates per query. Default 15.

**Output (per group):**
- `group_id` + `size`
- `members[]` — each with `tablet_id` + `intra_group_degree` (how many other members are reciprocal with this one)
- `cohesion` — `mean_pairwise_cosine`, `min_pairwise_cosine`, `max_pairwise_cosine`, `edge_count`, `edge_density`
- `prefix_distribution` — across-prefix breakdown (most groups are within-prefix but cross-collection groups are interesting)

**Use case:**

```
# Scan the K (Kuyunjik) prefix for all quartet-class scribal groups
find_scribal_groups(prefix_filter='K', min_cosine=0.6, min_group_size=3, max_tablets_to_scan=2500)
→ For each group found: list members + cohesion stats
→ Top groups are candidates for methods-paper supplementary findings
```

**Methodological alignment:** mirrors the methods paper §3.4 reciprocal-pair criterion and §3.4.1 quartet-class identification. The 2026-05-22 BM.34970 quartet (signature cosines 0.6031–0.8866) would be re-discovered by this tool at default thresholds, validating that it surfaces the same class of finding as the opportunistic discovery.

---

## The 2026-05-22 release arc — six releases shipped

| Version | Commit | Tool | LOC | Scope |
|---|---|---|---|---|
| v0.18.4 | bc92a40 | `coverage_stats_for_collection` + `min_sign_count` filter | 525 | Per-collection |
| v0.18.5 | 1d5fd6a | `list_collection_prefixes` | 312 | Corpus-wide |
| v0.18.6 | 615d5a0 | `find_short_fragments` | 285 | Quality-audit |
| v0.18.7 | 78258e4 | `cluster_pair_similarity_matrix` | 459 | Per-cluster topology |
| v0.18.8 | c220425 | `compare_tablet_pair` | 507 | Per-pair cross-axis |
| v0.18.9 | (this) | `find_scribal_groups` | ~450 | Corpus-wide scribal-lineage |

Combined: **6 new tools + 1 quality filter, ~2,540 LOC, tool count 30 → 36.**

---

## Files changed

- `src/scribalGroups.ts` — NEW FILE, new tool's backing module
- `src/index.ts` — registered `find_scribal_groups` tool, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.9

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.9 smoke OK — 36 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart

---

## What's next

**Highest research-value validation candidate:** run `find_scribal_groups(prefix_filter='K', max_tablets_to_scan=2500)` once the MCP server is restarted to pick up v0.18.9. If the BM.34970 quartet appears in the results (it should — BM.34970 quartet members are partially in K), the tool is validated. If NEW quartet-class groups appear that are NOT in the methods paper, they're candidate findings for a §3.4.2 supplementary section.

**Still queued (program-doc):**

- v0.18.10 (planned): metadata-enrichment of `fragment-metadata.json` cache — unblocks `find_unpublished_in_publication` + `compare_dialects`
- `audit_cluster` — composite quality + topology + provenance check, one-call replacement for the corpus-cluster-pair workflow
- `find_orthographic_outliers_in_prefix` — within-cohort signature-outlier surfacing (related to but distinct from same-scribe-group finding)
