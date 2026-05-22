# cuneiform-mcp v0.18.11 — Release Notes

*Released 2026-05-22. Second 3-tool parallel-build wave. Eighth release of the day.*

---

## TL;DR

**v0.18.11 ships THREE more tools simultaneously via subagent parallel build:**

- **NEW: `compare_clusters`** — compare two clusters (each by seed OR explicit members), return shared/unique membership, Jaccard similarity, prefix-distribution diff, relationship classification (identical/subset/overlap/disjoint), and union edge-density analysis for small unions. "Is cluster A the same as cluster B?"
- **NEW: `find_strongest_fuzzy_pairs_in_prefix`** — per-prefix top-N strongest fuzzy-Jaccard edges between any tablet pair. Per-collection generalization of `find_fuzzy_parallels` (which is per-tablet). Discovery tool for surfacing sibling-manuscript pairs that nobody has probed within a collection.
- **NEW: `corpus_health_report`** — one-call corpus-level meta-diagnostic. Total tablets, coverage stats, prefix summary, short-fragment count, bi-orphan estimate, quality indicators, generated recommendations. The "system health" snapshot for the cuneiform-mcp pipeline.

**Build pattern repeat:** same as v0.18.10 — 3 subagents in parallel, each writing one src/<tool>.ts file + returning a registerTool snippet, orchestrator does the index.ts wiring in one pass. Total integration time: ~5 minutes.

---

## What's new

### Tool count: 39 → 42

### Tool 1: `compare_clusters`

Take two clusters defined EITHER by seed_tablet_id OR explicit member list. Compute:
- Shared members, A-unique, B-unique, Jaccard similarity
- Per-prefix counts comparison
- Relationship: `identical` / `subset_a_in_b` / `subset_b_in_a` / `overlap` / `disjoint`
- Union edge-density (intra-A / intra-B / cross-cluster) for small unions (≤50 tablets)
- Recommendations text list

**Use case:** "Is the BM.77056 cluster the same as the K.15325 cluster, or distinct?" One call replaces reconstruct_cluster ×2 + set arithmetic + prefix rollup.

### Tool 2: `find_strongest_fuzzy_pairs_in_prefix`

Within a prefix bucket, iterate tablets + fetch fuzzy parallels + collect within-prefix edges + return top-N strongest. Per-tablet involvement count surfaces cluster-hub candidates.

**Use case:** "Within K, what are the 50 strongest sibling-manuscript candidate pairs?" — surfaces methods-paper-grade findings like K.2798↔Si.776 but systematically corpus-wide.

### Tool 3: `corpus_health_report`

Single-call corpus overview:
- Total tablets / in_lex_graph / in_them_index / zero-sign records
- Prefix summary (top-10 by tablet count, top-5 by sign count)
- Short-fragment count + percent
- Bi-orphan estimate (uses pre-aggregated stats at default thresholds, recomputes for custom thresholds)
- Quality indicators (mean coverage %, prefixes with >10% zero-sign records)
- Generated recommendations for next queries

**Use case:** First query in any corpus-exploration session. Also useful as release-artifact snapshot for documenting corpus state.

---

## The 2026-05-22 release arc — eight releases

| Version | Commit | Tool(s) | LOC |
|---|---|---|---|
| v0.18.4 | bc92a40 | `coverage_stats_for_collection` + `min_sign_count` filter | 525 |
| v0.18.5 | 1d5fd6a | `list_collection_prefixes` | 312 |
| v0.18.6 | 615d5a0 | `find_short_fragments` | 285 |
| v0.18.7 | 78258e4 | `cluster_pair_similarity_matrix` | 459 |
| v0.18.8 | c220425 | `compare_tablet_pair` | 507 |
| v0.18.9 | 3257407 | `find_scribal_groups` | 516 |
| v0.18.10 | 8bd6f6b | **3 tools (parallel):** `audit_cluster` + `find_orthographic_outliers` + `find_cross_prefix_scribal_links` | 1,754 |
| v0.18.11 | (this) | **3 tools (parallel):** `compare_clusters` + `find_strongest_fuzzy_pairs_in_prefix` + `corpus_health_report` | ~1,200 |

**Total: 12 new tools + 1 quality filter, ~5,500 LOC, tool count 30 → 42.**

---

## Files changed

- `src/compareClusters.ts` — NEW FILE, ~430 LOC
- `src/strongestFuzzyPairs.ts` — NEW FILE, ~324 LOC
- `src/corpusHealth.ts` — NEW FILE, ~376 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.11

---

## Verification

- ✅ Each agent independently verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator's `npm run build` clean post-integration
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.11 smoke OK — 42 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart

---

## What's next

**The complete tool surface from today's eight releases:**

```
corpus_health_report()                              ← v0.18.11: corpus overview
  ↓
list_collection_prefixes()                          ← v0.18.5: discover prefixes
  ↓
find_short_fragments(prefix_filter='X')             ← v0.18.6: marginal-signal audit
  ↓
coverage_stats_for_collection(prefixes=['X'])       ← v0.18.4: per-prefix stats
  ↓
find_strongest_fuzzy_pairs_in_prefix('X')           ← v0.18.11: discover sibling pairs
  ↓
find_scribal_groups(prefix_filter='X')              ← v0.18.9: scribal-lineage groups
  ↓
find_orthographic_outliers_in_prefix('X')           ← v0.18.10: cohort outliers
  ↓
find_cross_prefix_scribal_links()                   ← v0.18.10: cross-collection scribes
  ↓
reconstruct_cluster(seed='Y', min_sign_count=50)    ← v0.17.1 + v0.18.4 filter
  ↓
audit_cluster(seed_tablet_id='Y')                   ← v0.18.10: composite vetting
  ↓
compare_clusters(cluster_a_seed='Y',                ← v0.18.11: pair-compare clusters
                 cluster_b_seed='Z')
  ↓
cluster_pair_similarity_matrix(cluster_members)     ← v0.18.7: full pairwise topology
  ↓
compare_tablet_pair(top_pair_from_matrix)           ← v0.18.8: per-pair cross-axis
```

**12 new tools across 8 releases, all motivated by the BM.77056 cluster survey, all complementary, all using data at-rest (no metadata-enrichment required).** The metadata-enrichment gap remains for the next phase — once v0.18.12 lands `fragment-metadata.json` plumbing, the program-doc quick-wins (`find_unpublished_in_publication`, `compare_dialects`, `find_tablets_by_genre`) become buildable in another 3-agent parallel wave.
