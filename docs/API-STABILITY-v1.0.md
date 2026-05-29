# cuneiform-mcp API stability classification (v1.0 readiness)

Generated 2026-05-25 after the v0.40 release. Last updated 2026-05-29 at v0.73.0 (added `surface_genre_conflicts` as Experimental; re-tiered the +10 tools from v0.58–v0.69; prior update v0.57.0). Addresses panel-review §3.24 / Al-Sayyid's ask: "88 tools is too many. What's the canonical ten?"

This document classifies the 111 tools (as of v0.73.0) by **stability tier**. Tools in the **canonical** tier are the ones a researcher should learn first; the **stable** tier is the broader v1.0 API freeze; **experimental** tools may change shape before v1.0; **deprecated** tools should not be used in new work.

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

## Stable surface — v1.0 freezes signature (64 tools)

These will receive `@stable` tag in v1.0. Signature is locked; bug fixes only.

### Discovery & retrieval (9)
`find_parallel_text` · `find_fuzzy_parallels` · `find_chunk_parallels` · `find_formulaic_passages` · `find_incipits` · `trace_chunk_diffusion` · `find_join_candidates` · `find_join_candidates_in_prefix` · `find_lemma_parallel` *(v0.44, Tier-3 #9)*

### Composition assignment (7)
`identify_composition` · `damaged_passage_composition_probability` · `score_tablet_completeness` · `find_composition_lineage` · `list_compositions` · `build_citation_graph` · `extract_citation_network` *(v0.43, Tier-3 #10)*

### Manuscript structure (9)
`build_canonical_recension_tree` · `build_stemma_with_rooting` · `build_scribal_school_graph` · `reconstruct_cluster` · `find_scribal_groups` · `find_high_join_count_tablets` · `analyze_joins_graph` · `find_provenance_clusters` *(v0.45/v0.48, ancient find-spot clustering)* · `cluster_by_scribal_provenance` *(v0.58 — textual-lineage clustering: first-copy-event + first-citation-target, complements geographic find-spot clustering)*

### Damage & restoration (4)
`restore_lacuna_passage` · `infer_damaged_sign` · `find_lacuna_restoration_candidates` · `find_embedded_fragments`

### Anomaly & validation (6)
`find_anomalous_tablets` · `describe_anomaly` · `discovery_surface_stats` · `prioritize_validation_queue` · `record_validation_resolution` · `recommend_validation_target` *(v0.52, active-learning prioritizer)*

### Read companions (3)
`list_validation_resolutions` · `get_tablet_image_links` · `render_stemma_svg`

### Sign-level (6)
`find_similar_signs` · `find_numerical_chunks` · `compute_lexical_substitution_lift` · `cluster_signs_by_embedding` · `find_sign_glyph` *(v0.42, ABZ→Unicode glyph)* · `get_scribal_signature` *(v0.18, scribal fingerprint — formalizing tier)*

### Corpus retrieval (9)
`search_fragments` · `get_fragment` · `search_tablets` · `get_tablet` · `lookup_sign` · `get_oracc_text` · `search_oracc` · `find_tablets_by_genre` · `cdli_ebl_crosswalk` *(v0.65 — bidirectional CDLI ↔ eBL ID mapping, native + inferred-via-museum-number confidence)*

### Cross-axis (7)
`compute_joint_pair_score` · `compute_confidence_calibration` · `compare_tablet_pair` · `compare_clusters` · `cluster_pair_similarity_matrix` · `compute_axis_disagreement` *(v0.49, cross-axis disagreement)* · `explain_pair_score` *(v0.61 — read-only verdict provenance: per-axis raw signals + joint-pair additive decomposition + §3.4 cross-axis verdict + calibration history)*

### Bilingual detection (2)
`detect_bilingual_tablet` · `find_bilingual_tablets` *(v0.66 — Sumerian/Akkadian classifier; fixed verdict enum: interlinear_bilingual / alternating_line_bilingual / akkadian_with_sumerograms / insufficient_data; conservative by design)*

### Reproducibility (2)
`export_session` *(v0.62 — session ring-buffer + snapshot bundle)* · `diff_corpus_versions` *(v0.63 — read-only cache-snapshot delta with sha256 manifests)*

---

## Experimental — v1.0 marks as "may change" (30 tools)

Recent additions whose API may evolve before v1.0. Bug fixes + signature changes both possible.

### Active-learning automation (1, v0.64)
- `auto_validate_from_resolutions` (v0.64 — PROPOSE-ONLY external-anchor proposals; surface is still growing: v0.71 added the opt-in RULE_D composition-sibling rule + threshold/min-conf params, so the input schema may extend further before v1.0. Core safety contract — mode must be "propose", store never mutated — is locked.)

### Network analysis (1, v0.68)
- `compute_quotation_network` (v0.68 — composition-level directed multigraph; current edges are near-symmetric/near-complete. Track B will add asymmetric directionality + an edge-weight threshold, which WILL change the output schema.)

### Unsupervised discovery (1, v0.69)
- `discover_compositions` (v0.69 — k-means / Ward / DBSCAN over RI tablet embeddings as a registry-free negative-control; novelty-score formula + cluster-label heuristics may revise.)

### Observational mining (1, v0.73)
- `surface_genre_conflicts` (v0.73 — Genre-Conflict Sentinel: identify_composition family vs eBL editorial genre-family disagreements, classified by shared-window rarity into formulaic / likely_misassignment / embedded_quotation_candidate. Observational HYPOTHESES, not labels; corroboration is model-entangled; thresholds + signal taxonomy may revise. Never feeds G2.)

### Calibration utilities (1, v0.50)
- `recalibrate_lacuna_scores` (v0.50 — Platt scaling for lacuna_semantic; output format may consolidate with `compute_confidence_calibration`)

### Candidate-exemplar discovery (1, v0.55)
- `list_candidate_exemplars` (v0.55 — 310 discovered at p>0.9 in corpus-wide composition-classification scan; output schema fresh, may stabilize)


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

## Specialized / advanced (13 tools)

Stable but specialized — these aren't part of the "first 10 to learn" path.

`enrich_prefix_metadata` · `fragment_metadata_coverage` · `find_unpublished_in_publication` · `find_tablets_by_provenance` · `find_genre_anchor_tablets_in_prefix` · `extend_dataset_to_motif` · `find_short_fragments` · `list_collection_prefixes` · `coverage_stats_for_collection` · `find_thematic_parallel` · `find_biblical_parallel` · `find_antediluvian_parallel` · `find_mesopotamian_parallel` · `compare_flood_narratives` *(v0.6, comparative religion — formalizing tier)*

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
| Stable | 64 | Signature locked |
| Experimental | 29 | May change |
| Specialized | 13 | Stable, niche |
| RAG vault | 4 | Stable |
| Apkallu / dataset extension | 2 | Stable |
| **Total unique** | **111** | as of v0.73.0 |

Notes:
- **Canonical** is a featured re-listing of ten Stable tools (for visibility), not an additional tier — it is not added to the total.
- The **authoritative unique total is 111** (as of v0.73.0), per `docs/TOOL-INVENTORY.md` (auto-generated from `server.registerTool` calls) and the smoke banner. The v0.71 re-tier added the +10 tools from v0.58–v0.69 as 7 Stable + 3 Experimental; v0.73 added `surface_genre_conflicts` (Experimental).
- The per-tier row counts carry minor pre-existing drift (a few sub-section headers were off by 1–2 before this update, e.g. the Stable header read "50" while its sub-sections summed to 57). Treat the per-tier numbers as approximate; the 110 unique total is the exact figure. A full per-tier recount is deferred to the v1.0 tag.

---

## v0.40 calibration finding — recommendation for `restore_lacuna_semantic`

The v0.40 BLEU benchmark exposed that `restore_lacuna_semantic`'s `joint_score` is overconfident (top-1 accuracy 16% at mean predicted 80.9%, ECE=0.6490). Before v1.0:

1. **Rename** `joint_score` → `ranking_score` to remove probability connotation, **OR**
2. **Recalibrate** via isotonic regression on a held-out calibration set, **OR**
3. **Document** prominently in tool description that joint_score is a ranking signal, not P(correct)

**Status (v0.50 + v0.57):** option (2) shipped via `recalibrate_lacuna_scores` Platt scaling on v0.30 lacuna fusion — ECE 0.6374 → 0.0109 (58× lift). The v0.57 follow-up applying Platt to v0.29 logistic regression was a **HONEST NULL RESULT**: pre-Platt ECE 0.0165 (already well-calibrated), post-Platt 0.0140 (marginal); accuracy unchanged at 0.9524. v0.29's calibration discipline is built into the model class. Different model classes warrant different calibration assumptions — Platt is appropriate for lacuna fusion, not for v0.29 logistic regression.

## v0.57 calibration finding — model-class-aware calibration

The Platt scaling tool (`recalibrate_lacuna_scores`) is appropriate for: (a) joint-score fusions where the input is a heuristic ensemble (e.g. lacuna semantic), (b) any output rank-ordered but not probability-calibrated. It is **not** appropriate for outputs of a calibration-disciplined model class (logistic regression with proper loss). Pre-flight check: compute ECE before applying Platt; if ECE < 0.05, the model is already calibrated and Platt provides no value.

---

## What this classification is not

- Not a permanence guarantee for experimental tools — they may still ship to v1.0 stable if reviewed and locked
- Not a deprecation announcement — no tools are deprecated as of v0.40
- Not coupled to the methods paper claim numbering — paper-claims and tool-stability are independent axes

For deprecation, see the future `docs/DEPRECATIONS.md` (empty as of v0.40).
