# cuneiform-mcp v0.18.12 — Release Notes

*Released 2026-05-22. Third 3-tool parallel-build wave. Ninth release of the day.*

---

## TL;DR

**v0.18.12 ships THREE more tools simultaneously via the now-proven 3-agent parallel build pattern:**

- **NEW: `find_tablet_neighborhood`** — given ONE tablet, return its full 4-axis discovery neighborhood in one call (fuzzy + thematic + scribal + join candidates). Tablet-level composite of v0.18.8 `compare_tablet_pair` (which zooms TWO tablets).
- **NEW: `find_lacuna_restoration_candidates`** — surface the highest-value backlog for `restore_lacuna_passage` (v0.18.0): tablets where restoration is both NEEDED (high X-token damage) AND POSSIBLE (strong fuzzy parallels). Priority-scored intersection.
- **NEW: `find_thematic_cluster_in_prefix`** — thematic-axis analogue of `find_scribal_groups` (v0.18.9) and `find_strongest_fuzzy_pairs_in_prefix` (v0.18.11). Surfaces same-topic groupings within a prefix even when lexical similarity is low (bilingual pairs, paraphrases, alt-spellings).

**The three axes (fuzzy + scribal + thematic) now each have a corpus-wide systematic group-discovery tool, completing the symmetry.**

---

## What's new

### Tool count: 42 → 45

### Tool 1: `find_tablet_neighborhood`

Single-call composite that runs `findFuzzyParallels` + `findThematicParallel` + `findSameScribeCandidates` for one tablet, returning all axes + cross-axis multiplicity summary (tablets appearing on multiple axes = higher-confidence relatives) + generated Assyriological narrative recommendations.

**Use case:** "Tell me everything about K.2798." Replaces the manual 3-tool sequential workflow.

**Join-candidate axis deferred** (same pragmatic skip as v0.18.8 `compare_tablet_pair`).

### Tool 2: `find_lacuna_restoration_candidates`

Surfaces tablets where:
- `min_damage_ratio < x_ratio < max_damage_ratio` (damaged enough to need restoration, not too damaged for n-gram conditioning)
- `strongest_fuzzy_parallel_j ≥ 0.15` (parallel templates exist)

Ranked by `restoration_priority_score = damage_ratio × strongest_parallel_fuzzy_j`. Output primes `restore_lacuna_passage` calls.

**Use case:** "Which tablets in the corpus would benefit most from lacuna restoration?" Pre-screens the restoration backlog.

### Tool 3: `find_thematic_cluster_in_prefix`

Mirrors `find_scribal_groups` (v0.18.9) but on the thematic-embedding axis. Same algorithm: per-tablet thematic-parallel scan → reciprocal-edge collection → union-find → groups ≥ min_group_size with cohesion stats.

**Use case:** "Within Sm (Sippar), what thematic neighborhoods exist?" Surfaces topical groupings that lexical methods miss — bilingual pairs (Sumerian original + Akkadian translation lexically diverge but thematically converge), paraphrases, same-genre compositions copied by different traditions.

---

## The three-axis symmetry now complete

| Axis | Per-tablet | Within-prefix groups | Within-prefix top-N pairs |
|---|---|---|---|
| Fuzzy lexical | `find_fuzzy_parallels` (v0.17.0) | — | `find_strongest_fuzzy_pairs_in_prefix` (v0.18.11) |
| Thematic semantic | `find_thematic_parallel` (v0.15.0) | `find_thematic_cluster_in_prefix` (v0.18.12) | — |
| Scribal lineage | `find_same_scribe_candidates` (v0.18.0) | `find_scribal_groups` (v0.18.9) | — |

The thematic + scribal axes have within-prefix group-discovery tools (clusters of ≥3 mutually-reciprocal tablets); the fuzzy axis has within-prefix top-N pair discovery (since lexical clusters tend to be larger and merge into compositional clusters via reconstruct_cluster). Three axes, complementary discovery patterns, full coverage.

---

## The 2026-05-22 release arc — nine releases shipped

| Version | Tool(s) | Pattern |
|---|---|---|
| v0.18.4 | `coverage_stats_for_collection` + `min_sign_count` filter | sequential |
| v0.18.5 | `list_collection_prefixes` | sequential |
| v0.18.6 | `find_short_fragments` | sequential |
| v0.18.7 | `cluster_pair_similarity_matrix` | sequential |
| v0.18.8 | `compare_tablet_pair` | sequential |
| v0.18.9 | `find_scribal_groups` | sequential |
| v0.18.10 | `audit_cluster` + `find_orthographic_outliers` + `find_cross_prefix_scribal_links` | **3-agent parallel** |
| v0.18.11 | `compare_clusters` + `find_strongest_fuzzy_pairs_in_prefix` + `corpus_health_report` | **3-agent parallel** |
| v0.18.12 | `find_tablet_neighborhood` + `find_lacuna_restoration_candidates` + `find_thematic_cluster_in_prefix` | **3-agent parallel** |

**Totals: 15 new tools + 1 quality filter, ~7,000 LOC, tool count 30 → 45.**

**Three consecutive 3-agent parallel waves shipped clean. Pattern validated.**

---

## Files changed

- `src/tabletNeighborhood.ts` — NEW FILE, ~370 LOC
- `src/lacunaCandidates.ts` — NEW FILE, ~300 LOC
- `src/thematicCluster.ts` — NEW FILE, ~322 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.12

---

## Verification

- ✅ Each agent independently verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator caught one paste-typo (`SCHEMA` → `schema: SCHEMA`) before build
- ✅ `npm run build` clean post-fix
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.12 smoke OK — 45 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart

---

## What's next

**Metadata enrichment v0.18.13** remains the next major-leverage release — unlocks the program-doc quick-wins (`find_unpublished_in_publication`, `compare_dialects`, `find_tablets_by_genre`) that need populated period/genre/city/designation fields.

**No-metadata-needed tools still in the queue** (candidates for v0.18.13+ parallel waves):
- `find_signature_pair_distance_matrix` — like cluster_pair_similarity_matrix but for scribal signatures
- `compare_prefix_pair` — given two prefixes, surface their relationship (shared scribal groups, cross-prefix edges)
- `find_genre_anchor_tablets_in_prefix` — surface highest-degree-within-cluster tablets (canonical-template candidates)
- `find_join_candidates_in_prefix` — per-collection join discovery (mirror of cross_prefix_scribal but on join axis)
