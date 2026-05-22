# cuneiform-mcp v0.18.14 — Release Notes

*Released 2026-05-22. Fourth 3-tool parallel-build wave. Eleventh release of the day. Tool count crosses 50.*

---

## TL;DR

**v0.18.14 ships the three program-doc quick-wins that v0.18.13's metadata enrichment unblocked:**

- **NEW: `find_unpublished_in_publication`** — surface tablets cataloged in a museum publication (CT, KAR, BAM, OECT, CTN) that haven't been transliterated yet. The untransliterated-backlog discovery tool. Filters by `designation` field (newly available via fragment-metadata).
- **NEW: `compare_dialects`** — within a city+period cohort (e.g. Sippar/Old Babylonian), surface tablets whose scribal signature deviates from the cohort centroid. Historical-provenance analogue of v0.18.10 `find_orthographic_outliers_in_prefix` (which buckets by museum prefix).
- **NEW: `find_tablets_by_genre`** — query tablets matching a genre pattern (Mīs pî, Šuʾila, Maqlû, etc.). Substring match against the `genres` array.

**Tool count hits 50.** All three new tools depend on enriched fragment-metadata (which v0.18.13 ships the plumbing for). Each emits a warning prompting `enrich_prefix_metadata` when coverage is low.

---

## What's new

### Tool count: 47 → 50

### Tool 1: `find_unpublished_in_publication`

Filters tablets by `designation` (publication abbreviation substring) and splits by `in_lex_graph` (transliterated yes/no). Returns untransliterated list sorted by sign_count desc — the largest tablets first, since they carry more lexical signal and yield more downstream parallel coverage when transliterated.

**Use case:** "Which CT-series tablets in the British Museum haven't been transliterated yet?" Targets new transliteration work where the upstream editorial step (publication) is already complete.

### Tool 2: `compare_dialects`

Within a city+period cohort, build the cohort scribal centroid (aggregated LLR weights from `getScribalSignature`), then rank each cohort tablet by sparse cosine to centroid. Surface lowest-cosine = most deviant.

**Use case:** "Within Sippar/Old Babylonian, which tablets have anomalous scribal practice?" — candidates for ancient imports, mislabeled provenance, or dialect outliers. Buckets by historical provenance instead of modern museum-acquisition history.

### Tool 3: `find_tablets_by_genre`

Substring match against `genres` (hierarchy strings like "CANONICAL → Magic → Purification → Mīs pî") AND `genres_flat` (flat per-category list). Sorted by sign_count desc.

**Use case:** "Find all Mīs pî tablets in the corpus." Useful for genre-cohort building + methods-paper-aligned per-genre witness expansion.

---

## The 2026-05-22 release arc — eleven releases

| Version | Tool(s) | Pattern |
|---|---|---|
| v0.18.4–v0.18.9 | 6 sequential releases (1 tool each) | sequential |
| v0.18.10 | 3 tools | 3-agent parallel |
| v0.18.11 | 3 tools | 3-agent parallel |
| v0.18.12 | 3 tools | 3-agent parallel |
| v0.18.13 | 2 tools + plumbing | sequential (interconnected) |
| v0.18.14 | 3 tools | **3-agent parallel** |

**Totals: 20 new tools + 1 quality filter + metadata-enrichment plumbing, ~8,500 LOC, tool count 30 → 50.**

**Four consecutive 3-agent parallel waves shipped clean. Pattern is rock-solid.**

---

## The complete cuneiform-mcp tool surface (50 tools)

**Per-tablet (single-tablet zoom):**
- `find_fuzzy_parallels` (lexical), `find_thematic_parallel` (semantic), `find_same_scribe_candidates` (orthographic), `find_join_candidates` (physical), `find_tablet_neighborhood` (4-axis composite)

**Per-pair (two-tablet comparison):**
- `compare_tablet_pair` (cross-axis verdict)

**Per-cluster (manuscript-witness reconstruction):**
- `reconstruct_cluster`, `cluster_pair_similarity_matrix`, `audit_cluster`, `compare_clusters`

**Per-prefix (museum-collection discovery):**
- `list_collection_prefixes`, `coverage_stats_for_collection`, `find_short_fragments`, `find_strongest_fuzzy_pairs_in_prefix`, `find_scribal_groups`, `find_orthographic_outliers_in_prefix`, `find_thematic_cluster_in_prefix`, `find_cross_prefix_scribal_links`

**Per-historical-cohort (city+period):**
- `compare_dialects` ← v0.18.14

**Per-publication (museum series):**
- `find_unpublished_in_publication` ← v0.18.14

**Per-genre (composition class):**
- `find_tablets_by_genre` ← v0.18.14

**Corpus-wide:**
- `corpus_health_report`, `find_anomalous_tablets`

**Restoration workflow:**
- `restore_lacuna_passage`, `infer_damaged_sign`, `find_lacuna_restoration_candidates`

**Metadata infrastructure:**
- `enrich_prefix_metadata`, `fragment_metadata_coverage`

**Plus** the v0.5–v0.14 retrieval, RAG, sign-inference, biblical-parallel finder, and ~20 lookup/search tools that pre-dated today's session.

---

## Files changed

- `src/unpublishedInPublication.ts` — NEW FILE, ~290 LOC
- `src/compareDialects.ts` — NEW FILE, ~330 LOC
- `src/findByGenre.ts` — NEW FILE, ~290 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.14

---

## Verification

- ✅ Each agent independently verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator's `npm run build` clean post-integration
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.14 smoke OK — 50 tools registered"
- ⏳ Live MCP verification deferred to host-process restart

---

## What's next

The original program-doc quick-wins list is now ALL SHIPPED. Remaining queued tools require either:

- More metadata enrichment (corpus-wide, not just per-prefix) — would unblock `find_tablets_by_period`, `find_tablets_by_provenance`, `genre_distribution_across_prefixes`
- New analysis primitives — `find_signature_evolution_in_period`, `find_temporal_clusters`, `extend_dataset_to_motif` (the apkallu_attestations pattern generalized to any caller-specified motif)

Or pivot completely:
- `compare_prefix_pair` — two-prefix relationship analysis
- `find_genre_anchor_tablets_in_prefix` — canonical-template candidates per prefix
- Methods-paper §3.5 / §3.6 supplementary findings using v0.18.4–v0.18.14 tools against the BM.77056 cluster
