# cuneiform-mcp v0.18.15 — Release Notes

*Released 2026-05-22. Fifth 3-tool parallel-build wave. Twelfth release of the day.*

---

## TL;DR

**v0.18.15 ships three more discovery tools via parallel-build pattern, all leveraging the v0.18.13 metadata-enrichment plumbing:**

- **NEW: `compare_prefix_pair`** — structural comparison of two museum-collection prefixes (period/genre/city overlap + cross-prefix scribal edges + relationship classification: same_excavation_site / complementary_collections / shared_scholarly_tradition / minimal_overlap)
- **NEW: `find_genre_anchor_tablets_in_prefix`** — canonical-template candidate identification within a (prefix, genre) cohort using `sqrt(sign_count) × intra_cohort_degree`
- **NEW: `find_tablets_by_provenance`** — corpus-wide city-based search with optional period+prefix narrowing

**Tool count crosses 53.** Twelve consecutive releases shipped in one session.

---

## What's new

### Tool count: 50 → 53

### Tool 1: `compare_prefix_pair`

Two-prefix structural comparator. Inputs: two prefix strings + optional thresholds. Output:
- Per-cohort enrichment stats (period/genre/city distributions for both sides)
- Jaccard overlap on three metadata axes (period, genre, city)
- Top cross-prefix same-scribe edges (from findSameScribeCandidates with prefix filtering)
- Relationship classification (4 buckets)
- Generated recommendations

**Use case:** "How are K and Sm related?" → both Kuyunjik, high period overlap + cross-scribal edges → treat as one Nineveh corpus.

### Tool 2: `find_genre_anchor_tablets_in_prefix`

Surface canonical-template candidates within a (prefix, genre) cohort. Anchor score = `sqrt(sign_count) × intra_cohort_degree`. The sqrt sub-linearly rewards size; degree linearly rewards parallel-density.

**Use case:** "Within K, find the Mīs pî anchor tablets" — surfaces K.15325 (the Mīs pî hub of the methods paper's BM.77056 cluster).

### Tool 3: `find_tablets_by_provenance`

Mirror of v0.18.14 `find_tablets_by_genre` on the city axis. Substring match against `provenance.site` with optional period + prefix narrowing.

**Use case:** "All Sippar/Old Babylonian tablets in the corpus" → historical-cohort building, scribal-school analysis.

---

## The 2026-05-22 release arc — twelve releases

| Version | Tool(s) | LOC |
|---|---|---|
| v0.18.4 | `coverage_stats_for_collection` + `min_sign_count` filter | 525 |
| v0.18.5 | `list_collection_prefixes` | 312 |
| v0.18.6 | `find_short_fragments` | 285 |
| v0.18.7 | `cluster_pair_similarity_matrix` | 459 |
| v0.18.8 | `compare_tablet_pair` | 507 |
| v0.18.9 | `find_scribal_groups` | 516 |
| v0.18.10 | `audit_cluster` + `find_orthographic_outliers` + `find_cross_prefix_scribal_links` | 1,754 |
| v0.18.11 | `compare_clusters` + `find_strongest_fuzzy_pairs_in_prefix` + `corpus_health_report` | 1,200 |
| v0.18.12 | `find_tablet_neighborhood` + `find_lacuna_restoration_candidates` + `find_thematic_cluster_in_prefix` | 1,000 |
| v0.18.13 | `enrich_prefix_metadata` + `fragment_metadata_coverage` + plumbing | 700 |
| v0.18.14 | `find_unpublished_in_publication` + `compare_dialects` + `find_tablets_by_genre` | 900 |
| v0.18.15 | `compare_prefix_pair` + `find_genre_anchor_tablets_in_prefix` + `find_tablets_by_provenance` | ~1,100 |

**Totals: 23 new tools + 1 quality filter + metadata enrichment, ~9,500 LOC, tool count 30 → 53.**

**Five consecutive 3-agent parallel waves shipped clean.**

---

## Files changed

- `src/comparePrefixes.ts` — NEW FILE, ~470 LOC
- `src/genreAnchors.ts` — NEW FILE, ~320 LOC
- `src/findByProvenance.ts` — NEW FILE, ~310 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.15

---

## Verification

- ✅ Each agent verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.15 smoke OK — 53 tools registered"
- ⏳ Live MCP verification deferred to host-process restart

---

## What's next

Remaining no-metadata-needed candidates for v0.18.16+:
- `extend_dataset_to_motif` — generalize apkallu_attestations pattern to arbitrary motifs (medium build — produces a new persisted dataset file)
- `find_temporal_clusters_in_period` — period-scoped thematic clusters
- `find_signature_evolution_in_lineage` — track scribal-signature drift across joins/parallels
- `corpus_audit_report` — corpus-wide health + recommendations (companion to corpus_health_report, more interpretive)

Or pivot — methods-paper supplementary findings using the v0.18.4-v0.18.15 toolset against the BM.77056 cluster (validation work, no new tools).
