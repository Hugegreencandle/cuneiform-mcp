# cuneiform-mcp API stability classification (v1.0 readiness)

Generated 2026-05-25 after the v0.40 release. Addresses panel-review §3.24 / Al-Sayyid's ask: "88 tools is too many. What's the canonical ten?"

This document classifies the 92 tools (as of v0.40.0) by **stability tier**. Tools in the **canonical** tier are the ones a researcher should learn first; the **stable** tier is the broader v1.0 API freeze; **experimental** tools may change shape before v1.0; **deprecated** tools should not be used in new work.

---

## Canonical ten (the 80%-of-work API)

These are the tools a researcher learns first. Everything else composes from them or specializes them.

| # | Tool | One-line capability |
|---|---|---|
| 1 | `find_parallel_text` | Sign-trigram Jaccard parallel/join discovery — the primary lexical retrieval tool (22% recall@15, validated). |
| 2 | `find_fuzzy_parallels` | 1-substitution trigram tolerance for whole-manuscript siblings. |
| 3 | `find_chunk_parallels` | Sub-tablet contiguous-chunk discovery (the K.9508↔K.5896 case). |
| 4 | `find_formulaic_passages` | Corpus-wide most-shared length-20 chunks (formulaic-incipit atlas). |
| 5 | `identify_composition` | Compose-anchored classification (Mīs pî / Šurpu / Udug-ḫul / …). |
| 6 | `build_canonical_recension_tree` | Neighbor-joining stemma from chunk overlap. |
| 7 | `build_stemma_with_rooting` | Rooted Newick stemma with three rooting heuristics. |
| 8 | `find_composition_lineage` | (period × provenance) transmission graph for a composition. |
| 9 | `restore_lacuna_passage` | Multi-position parallel-template lacuna restoration (92% §3.5). |
| 10 | `prioritize_validation_queue` | Active-learning ranker for the manual-review backlog. |

These ten cover: lexical retrieval, fuzzy retrieval, sub-tablet discovery, composition assignment, stemma reconstruction, transmission tracing, lacuna restoration, and active-learning prioritization.

---

## Stable surface — v1.0 freezes signature (50 tools)

These will receive `@stable` tag in v1.0. Signature is locked; bug fixes only.

### Discovery & retrieval (8)
`find_parallel_text` · `find_fuzzy_parallels` · `find_chunk_parallels` · `find_formulaic_passages` · `find_incipits` · `trace_chunk_diffusion` · `find_join_candidates` · `find_join_candidates_in_prefix`

### Composition assignment (6)
`identify_composition` · `damaged_passage_composition_probability` · `score_tablet_completeness` · `find_composition_lineage` · `list_compositions` · `build_citation_graph`

### Manuscript structure (7)
`build_canonical_recension_tree` · `build_stemma_with_rooting` · `build_scribal_school_graph` · `reconstruct_cluster` · `find_scribal_groups` · `find_high_join_count_tablets` · `analyze_joins_graph`

### Damage & restoration (4)
`restore_lacuna_passage` · `infer_damaged_sign` · `find_lacuna_restoration_candidates` · `find_embedded_fragments`

### Anomaly & validation (5)
`find_anomalous_tablets` · `describe_anomaly` · `discovery_surface_stats` · `prioritize_validation_queue` · `record_validation_resolution`

### Read companions (3)
`list_validation_resolutions` · `get_tablet_image_links` · `render_stemma_svg`

### Sign-level (4)
`find_similar_signs` · `find_numerical_chunks` · `compute_lexical_substitution_lift` · `cluster_signs_by_embedding`

### Corpus retrieval (8)
`search_fragments` · `get_fragment` · `search_tablets` · `get_tablet` · `lookup_sign` · `get_oracc_text` · `search_oracc` · `find_tablets_by_genre`

### Cross-axis (5)
`compute_joint_pair_score` · `compute_confidence_calibration` · `compare_tablet_pair` · `compare_clusters` · `cluster_pair_similarity_matrix`

---

## Experimental — v1.0 marks as "may change" (24 tools)

Recent additions whose API may evolve before v1.0. Bug fixes + signature changes both possible.

### Sign2vec variants (4)
- `compare_sign_neighbors_across_periods` (v0.26 — per-period; may consolidate)
- `compare_sign_neighbors_register_matched` (v0.27 — register-matched; may consolidate with above)
- `compare_sign_embedding_configs` (v0.25 — ensemble; may move offline)
- `compute_lexical_substitution_score` (v0.24 — superseded by `_lift` variant; may deprecate)

### Per-period chunks (1)
- `find_formulaic_passages_per_period` (v0.28 — may consolidate with `find_formulaic_passages` via `period` parameter)

### Discovery engines v1+v2 (4)
- `discover_parallel_candidates` (v0.7 — secondary-lit, may move to plugin)
- `discover_primary_source_parallels` (v0.13 — known false-positive on prototype records)
- `find_anomalous_tablets` (v0.16 — current scoring may revise)
- `find_isolate_compositions` (v0.18.17 — partial overlap with bi-orphan surface)

### Cluster comparison (3)
- `compare_clusters` (predates v0.26 archetype matrix; Tier-2 idea #6 will rebuild)
- `find_scribal_groups`
- `audit_cluster`

### Calibration helpers (3)
- `recommend_archetype_thresholds` (v0.26 — output format may stabilize)
- `compare_dialects`
- `compare_prefix_pair`

### Lacuna sign2vec (1)
- `restore_lacuna_semantic` — joint_score is NOT a calibrated probability (v0.40 finding). May rename or recalibrate.

### Misc structural (8)
`find_orthographic_outliers_in_prefix` · `find_cross_prefix_scribal_links` · `find_strongest_fuzzy_pairs_in_prefix` · `corpus_health_report` · `find_tablet_neighborhood` · `find_thematic_cluster_in_prefix` · `find_lineage_chain` · `find_signature_evolution_in_lineage`

---

## Specialized / advanced (12 tools)

Stable but specialized — these aren't part of the "first 10 to learn" path.

`enrich_prefix_metadata` · `fragment_metadata_coverage` · `find_unpublished_in_publication` · `find_tablets_by_provenance` · `find_genre_anchor_tablets_in_prefix` · `extend_dataset_to_motif` · `find_short_fragments` · `list_collection_prefixes` · `coverage_stats_for_collection` · `find_thematic_parallel` · `find_biblical_parallel` · `find_antediluvian_parallel` · `find_mesopotamian_parallel`

---

## RAG vault / dossier-retrieval (4 tools)

`get_brief` · `list_briefs` · `query_research` · `find_synthesis_claims`

Stable. These retrieve curated research dossiers, not corpus-derived data; their behavior is decoupled from chunk-index/sign2vec rebuilds.

---

## Apkallu attestations + dataset extension (2)

`apkallu_attestations` · `find_same_scribe_candidates`

Specialized; stable.

---

## Reference summary by tier

| Tier | Count | v1.0 status |
|---|---|---|
| Canonical (top 10) | 10 | Stable + featured |
| Stable | 50 | Signature locked |
| Experimental | 24 | May change |
| Specialized | 16 | Stable, niche |
| Total | 92 | — |

Note: numbers add to 100 because `find_parallel_text` etc appear in both "Canonical" and "Stable" counts (canonical is a featured-subset of stable). Without double-counting, total is 92 tools as of v0.40.0.

---

## v0.40 calibration finding — recommendation for `restore_lacuna_semantic`

The v0.40 BLEU benchmark exposed that `restore_lacuna_semantic`'s `joint_score` is overconfident (top-1 accuracy 16% at mean predicted 80.9%, ECE=0.6490). Before v1.0:

1. **Rename** `joint_score` → `ranking_score` to remove probability connotation, **OR**
2. **Recalibrate** via isotonic regression on a held-out calibration set, **OR**
3. **Document** prominently in tool description that joint_score is a ranking signal, not P(correct)

Recommendation: option (3) as a stopgap (one-line README update), option (2) as the v1.0 fix once the held-out test set exists.

---

## What this classification is not

- Not a permanence guarantee for experimental tools — they may still ship to v1.0 stable if reviewed and locked
- Not a deprecation announcement — no tools are deprecated as of v0.40
- Not coupled to the methods paper claim numbering — paper-claims and tool-stability are independent axes

For deprecation, see the future `docs/DEPRECATIONS.md` (empty as of v0.40).
