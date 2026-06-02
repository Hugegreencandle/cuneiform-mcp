# cuneiform-mcp

MCP server exposing CDLI, ORACC, OGSL, and eBL/Fragmentarium cuneiform corpora to LLM agents, plus a research toolchain for **manuscript-witness discovery, composition assignment, stemma reconstruction, transmission tracing, lacuna restoration, scribal fingerprinting, and an active-learning validation loop**. **113 tools** (v0.74.0), all returning typed `structuredContent` envelopes with source-of-record provenance.

> **Status:** approaching a v1.0 tag. The API surface is frozen (see [`docs/API-STABILITY-v1.0.md`](docs/API-STABILITY-v1.0.md)); the remaining gate is the labeled-positives validation set (see [v1.0 readiness](#v10-readiness) below). Methods paper resubmitted to JOHD as a Discussion Paper (2026-05-28).

## What's new — v0.74.0

The work since v0.18 moved from corpus retrieval into a full **discovery + validation pipeline**, oriented around closing the v1.0 labeled-positives gate.

- **v0.74 — `oracc_index_project` + `oracc_get_edition` (project-aware ORACC adapter, BUNDLE-PRIMARY).** Genuinely unlocks all **5** corpora — DCCLT, SAAo (`saao/saa01`), RINAP (`rinap/rinap1`), RIBo (`ribo/babylon7`), and CCP (`ccpo`) — **with genre/period/provenience metadata**. The primary data path is the build-oracc **bundle ZIP** (`https://build-oracc.museum.upenn.edu/json/<SLUG>.zip`, SLUG = project pathname with `/`→`-`; CCP ships as `ccpo`), downloaded + unzipped in-memory with **fflate** (pure JS, no native build) and cached under `getCacheDir()/oracc/<SLUG>/` (catalogue.json + corpus.json + corpusjson/*.json; 0-byte stubs skipped; 7-day TTL; `refresh:true` re-downloads). `oracc_index_project` enumerates from the bundle's `catalogue.json` (which carries the per-text genre/period/provenience). `oracc_get_edition` reads `corpusjson/<ID>.json`, parses it via `parseCdl` (now preserving **nonw** dividers / scribal deletions / erasure markup), and attaches catalogue metadata. Live per-text **TEI** (saao P-ids + rinap Q-ids) and the pager are retained as fallbacks for ids absent from a bundle.
- **v0.73 — `surface_genre_conflicts` (Genre-Conflict Sentinel).** Surfaces tablets where `identify_composition`'s family disagrees with eBL's editorial genre-family, classified by **shared-window rarity** into `formulaic` (boilerplate — the majority), `likely_misassignment`, or `embedded_quotation_candidate` (a rare passage localized in an on-genre tablet — the real "incantation embedded in a medical text" phenomenon). Observational hypotheses only; corroboration is model-entangled (disclosed); never feeds G2.
- **v0.72 — quotation-network calibration.** `compute_quotation_network` gained chronology directionality (later-median-period composition quotes earlier) + an edge-weight threshold; the symmetric near-complete graph is now directed (honestly weak for this NA-dominated corpus — surfaced as a caveat).
- **v0.71 — `RULE_D` composition-sibling proposals** (opt-in, propose-only). `auto_validate_from_resolutions` can surface NEW positive candidates, justified by eBL editorial genre leaf-match (genuinely independent) **or** chunk-overlap ≥ threshold with a confirmed anchor (a second, *partially model-entangled* signal — useful only because the rule is propose-only and every hit is human-confirmed). `identify_composition` is the pre-filter, never the label justification.
- **v0.70 — §3.4 decision-tree boundary calibration.** Two `compare_tablet_pair` soft-spots fixed (widened `same_composition_different_scribe` band with confidence tapering; `thematic_only` now yields to a strong scribal signal), with both threshold moves recorded in the per-axis `CALIBRATION_REGISTRY` that `explain_pair_score` surfaces.
- **v0.61 — `explain_pair_score`**: full provenance trace for any pairwise verdict — per-axis raw signals + the joint-pair model's additive decomposition + the §3.4 cross-axis verdict + calibration history.
- **v0.54–v0.56 — composition-assignment cache + 6th model feature.** Corpus-wide `identify_composition` assignments feed `list_candidate_exemplars` and a `composition_assignment_match` feature on the joint-pair model.
- **Other recent tools:** `discover_compositions` (unsupervised cluster discovery, v0.69), `compute_quotation_network` (composition-level directed multigraph, v0.68), `detect_bilingual_tablet` / `find_bilingual_tablets` (Sumerian/Akkadian classifier, v0.66), `cdli_ebl_crosswalk` (bidirectional ID mapping, v0.65), `compute_joint_pair_score` (Bayesian fusion, v0.29), and the stemma/lineage/lacuna family (v0.22–v0.36).

Methods paper resubmitted to the Journal of Open Humanities Data as a Discussion Paper (`docs/johd-discussion-paper-2026-05-28.md`).

## Release lineage

| Version | Headline |
|---|---|
| **v0.71** | `RULE_D` composition-sibling proposals — propose-only, genre-leaf-match OR chunk-overlap≥T, model used as pre-filter only. |
| **v0.70** | §3.4 decision-tree boundary calibration (two `compare_tablet_pair` soft-spots; CALIBRATION_REGISTRY milestones). |
| v0.61–v0.64 | `explain_pair_score` (verdict provenance) · `export_session` · `diff_corpus_versions` · `auto_validate_from_resolutions` (propose-only). |
| v0.65–v0.69 | `cdli_ebl_crosswalk` · `detect_bilingual_tablet` · `compute_quotation_network` · `discover_compositions`. |
| v0.52–v0.58 | `recommend_validation_target` · composition-assignment cache + 6th model feature · `list_candidate_exemplars` (100-tool milestone) · `cluster_by_scribal_provenance`. |
| v0.40–v0.51 | calibration tooling (`compute_confidence_calibration`, `recalibrate_lacuna_scores`, held-out eval) + `find_sign_glyph`/`extract_citation_network`/`find_lemma_parallel` (Tier-3). |
| v0.29–v0.36 | `compute_joint_pair_score` (Bayesian fusion) · `identify_composition` · stemma rooting · `find_composition_lineage` · damaged-passage classifier. |
| v0.20–v0.28 | corpus-wide chunk discovery · recension trees · scribal-school graphs · sign2vec sign embeddings + lexical-substitution lift. |
| v0.19 | `find_chunk_parallels` — sub-tablet contiguous-chunk discovery. |
| **v0.18.3** | `find_parallel_text` run-bonus calibration. Methodology-agnostic. K.5896 + K.2761 Mīs pî discoveries surface from BOTH fuzzy AND exact methods. |
| **v0.18.2** | Three-fix calibration audit. Bi-orphan surface 167 → 2. Bi-orphan threshold tightening + score rebalance + fuzzy run-bonus. |
| **v0.18.1** | Lacuna restorer length-factor calibration. Top-1 precision 22.9% → 91.7% from one line of code. |
| v0.18.0 | `restore_lacuna_passage` (multi-sign damaged-passage predictor) + `find_same_scribe_candidates` + `get_scribal_signature` (orthographic-preference clustering via per-tablet LLR signature). |
| v0.17.1 | `reconstruct_cluster` — recursive BFS via fuzzy parallels. BM.77056 → 100+ tablet cluster across 20 collection prefixes. |
| v0.17.0 | Anomaly refinement (4 quality filters) + `find_fuzzy_parallels`. K.2798 ↔ Si.776 rescued at 2.67× exact-J lift. |
| v0.16.0 | Anomaly Surface — `find_anomalous_tablets` + `describe_anomaly` + `discovery_surface_stats`. 167 bi-orphans surfaced. |
| v0.15.0 | `find_thematic_parallel` — Random-Indexing distributional semantic embeddings (Mode C). |
| v0.14.4 | Corpus-exclusion pre-filter (Asb.* prototype records). Closes task #67 false-positive class. |
| **v0.14.3** | `find_biblical_parallel` — 15 canonical Mesopotamian ↔ Hebrew Bible parallels |
| **v0.14.2** | `infer_damaged_sign` — bigram-context sign-inference engine |
| **v0.14.1** | Apsû Explorer backend integration (apsu-explorer repo) |
| **v0.14.0** | RAG over the cuneiform-research markdown vault (4 tools) |
| v0.13.4 | Discovery Engine v2.0 mid-tier validation — 9/11 known + 2/11 colophon-template artifact |
| v0.13.0 | Primary-Source Discovery Engine — corpus traversal with cross-boundary scoring |
| v0.8–v0.12 | Mesopotamian-internal expansions (flood narratives, apkallū attestations, antediluvian parallels, candidate discovery) |
| v0.7 | Discovery Engine v1.0 (secondary literature) |
| v0.5 | Research-grade structured outputs — every tool emits `structuredContent` envelopes with provenance |
| v0.4 | `find_parallel_text` sign-trigram Jaccard (22% recall@15) |
| v0.3 | `find_join_candidates` (lineToVec port) |
| v0.1 | Initial 8-tool MCP wrapping CDLI/ORACC/OGSL/eBL |

## 113 tools

The toolchain has grown well past the point where a flat list is useful. The authoritative references:

- **[`docs/TOOL-INVENTORY.md`](docs/TOOL-INVENTORY.md)** — the full auto-generated list of all 113 tools with one-line descriptions (regenerate with `node scripts/generate-tool-inventory.mjs`).
- **[`docs/API-STABILITY-v1.0.md`](docs/API-STABILITY-v1.0.md)** — tools tiered by stability (canonical / stable / experimental / specialized) for the v1.0 freeze.

### The canonical ten (the 80%-of-work API)

A researcher learns these first; everything else composes from or specializes them.

| # | Tool | Capability |
|---|---|---|
| 1 | `find_parallel_text` | Sign-trigram Jaccard parallel/join discovery — primary lexical retrieval (22% recall@15, validated). |
| 2 | `find_fuzzy_parallels` | 1-substitution trigram tolerance for whole-manuscript siblings. |
| 3 | `find_chunk_parallels` | Sub-tablet contiguous-chunk discovery. |
| 4 | `find_formulaic_passages` | Corpus-wide most-shared length-20 chunks (formulaic-incipit atlas). |
| 5 | `identify_composition` | Composition assignment (Mīs pî / Šurpu / Udug-ḫul / …). |
| 6 | `build_canonical_recension_tree` | Neighbor-joining stemma from chunk overlap. |
| 7 | `build_stemma_with_rooting` | Rooted Newick stemma (three rooting heuristics). |
| 8 | `find_composition_lineage` | (period × provenance) transmission graph for a composition. |
| 9 | `restore_lacuna_passage` | Multi-position parallel-template lacuna restoration. |
| 10 | `prioritize_validation_queue` | Active-learning ranker for the manual-review backlog. |

### By capability area

- **Corpus retrieval** — CDLI / ORACC / OGSL / eBL wrappers (`lookup_sign`, `get_tablet`, `get_fragment`, `search_*`, `get_oracc_text`).
- **Parallel & join detection** — lexical (`find_parallel_text`), fuzzy (`find_fuzzy_parallels`), sub-tablet (`find_chunk_parallels`, `find_embedded_fragments`), lemma (`find_lemma_parallel`), thematic (`find_thematic_parallel`).
- **Composition & transmission** — `identify_composition`, `find_composition_lineage`, recension/stemma builders, `compute_quotation_network`, `discover_compositions`.
- **Scribal & provenance** — `find_same_scribe_candidates`, `get_scribal_signature`, `build_scribal_school_graph`, `find_provenance_clusters`, `cluster_by_scribal_provenance`.
- **Damaged-text restoration** — `infer_damaged_sign`, `restore_lacuna_passage`, `restore_lacuna_semantic`, `recalibrate_lacuna_scores`.
- **Sign embeddings** — `find_similar_signs`, `cluster_signs_by_embedding`, `compute_lexical_substitution_lift`, period/register comparators.
- **Pairwise scoring & calibration** — `compare_tablet_pair`, `compute_joint_pair_score`, `explain_pair_score`, `compute_confidence_calibration`, `compute_axis_disagreement`.
- **Active-learning / v1.0 gate** — `prioritize_validation_queue`, `recommend_validation_target`, `record_validation_resolution`, `list_validation_resolutions`, `auto_validate_from_resolutions`, `list_candidate_exemplars`.
- **Anomaly & discovery surface** — `find_anomalous_tablets`, `describe_anomaly`, `discovery_surface_stats`, `reconstruct_cluster`.
- **Research vault & cross-corpus** — RAG over the cuneiform-research vault (`query_research`, `get_brief`, …), `find_biblical_parallel`, `find_mesopotamian_parallel`, `detect_bilingual_tablet`, `cdli_ebl_crosswalk`.
- **Reproducibility** — `export_session`, `diff_corpus_versions`.

See [PROTOCOL.md](PROTOCOL.md) for the full interface — per-tool input schemas, output envelope shapes, and example requests. Live JSON Schemas in [schemas/](schemas/).

## v1.0 readiness

Three gates remain before a v1.0 tag:

- **G1 — methods paper** (external): resubmitted to JOHD as a Discussion Paper 2026-05-28; awaiting review.
- **G2 — ≥100 labeled positive pairs**: the long pole. The active-learning loop (`prioritize_validation_queue` → `auto_validate_from_resolutions` → operator review → `record_validation_resolution`) feeds it without tainting the labeled set with model output. `RULE_D` (v0.71) proposes defensible candidates from independent evidence; an Assyriologist confirms before recording.
- **G3 — API freeze**: done. The stable surface is documented in [`docs/API-STABILITY-v1.0.md`](docs/API-STABILITY-v1.0.md).

## Install

```bash
cd ~/Desktop/cuneiform-mcp
npm install --ignore-scripts
npm run build
```

## Wire into Claude Code

Add to `~/.claude.json` (or the equivalent MCP-config path for your client) under `mcpServers`:

```json
"cuneiform": {
  "type": "stdio",
  "command": "node",
  "args": ["/Users/danebrown/Desktop/cuneiform-mcp/dist/index.js"],
  "env": {}
}
```

Restart Claude Code. The 113 tools become callable as `mcp__cuneiform__*`.

## Smoke test

```bash
npm run smoke   # prints "v0.74.0 smoke OK — 113 tools registered" and exits
```

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CUNEIFORM_MCP_CACHE_DIR` | `~/.cache/cuneiform-mcp/` | Local cache root for the lineToVec + sign-trigram indices and fragment metadata. |
| `CUNEIFORM_MCP_MAX_FETCH` | unset | Cap on fragments crawled during `--prefetch`. Useful for testing. |
| `CUNEIFORM_RESEARCH_DIR` | `~/Desktop/Research/` | Source directory for `query_research` / `get_brief` / `list_briefs` / `find_synthesis_claims`. Must contain markdown briefs. |

## One-time cache builds (for the local matchers)

`find_join_candidates`, `find_parallel_text`, and `discover_primary_source_parallels` read from local caches under `$CUNEIFORM_MCP_CACHE_DIR`. Build them before first use:

```bash
# lineToVec cache (~24 min, populates fragments.jsonl)
node dist/index.js --prefetch

# sign-trigram cache (one ~26 s request, ~33 MB)
node scripts/build-signs-index.mjs
```

The v0.14 research-vault index is built lazily in-memory on first tool call — no pre-build needed.

## Validation

The two parallel matchers were benchmarked against eBL's `joins[]` ground truth on 2026-05-14 (full 36K-fragment corpus). Combined N=151, 267 known siblings:

- `find_join_candidates` (lineToVec): **3.4% recall@15**, median rank 7,154 / 36,328 (seed=42 only).
- `find_parallel_text` (sign-trigram Jaccard with X-filter): **22.5% recall@15**, 95% CI [17%, 28%]. Per-seed: 25.3% (N=50, seed=42), 21.1% (N=101, seed=137).

Trigram strictly dominates — no lineToVec-only wins on the test set. ~35% of known siblings score zero by either method (the broken pieces share no overlapping content; recoverable only via image/paleography).

The v0.13 Primary-Source Discovery Engine has its own calibration: 11 top cross-boundary candidates manually validated 2026-05-15. **9/11 confirmed as already-documented eBL editor cross-references; 2/11 surfaced a methodological discovery (Asb.* records in eBL are colophon-template prototypes, not tablets, producing systematic false-positive matches).** 100% true-positive rate on real intertextual parallels; 0% false-positive rate on novel scholarship.

See `VALIDATION-2026-05-14.md`, `TRIGRAM-EXPERIMENT-2026-05-14.md`, `VALIDATION-N100-2026-05-14.md`, `data/primarySourceParallels.json` (the v0.13 validation log), and `data/discoveredCandidates.json` (the v0.7 secondary-literature log) for full methodology, rank distributions, and per-candidate verdicts.
