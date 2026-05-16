# cuneiform-mcp

MCP server exposing CDLI, ORACC, OGSL, and eBL/Fragmentarium cuneiform corpora — plus two Discovery Engines, an indexed scholarly-research vault, a damaged-sign inference engine, a curated Mesopotamian ↔ Hebrew Bible parallel database, a Random-Indexing semantic-embeddings layer, a bi-orphan **Anomaly Surface** for discovering previously-unknown compositions, a fuzzy trigram-Jaccard parallel finder for catching missed manuscript siblings, and a recursive cluster reconstructor — to LLM agents. **27 tools**, all returning typed `structuredContent` envelopes with source-of-record provenance.

## What's new — v0.17.1

**`reconstruct_cluster`** — recursive BFS expansion from a seed tablet via fuzzy parallels to reconstruct full manuscript-witness clusters. Validation: seeded at `BM.77056`, reconstructs a **100+ tablet manuscript-witness cluster spanning 20 museum prefixes** (BM, K, Sm, CBS, ND, N, IM, VAT, SU, UM, Rm-IV, Rm-II, Ni, W, + multiple BM accession ranges 1880–2023). 34 fuzzy calls reach 100 members; the actual underlying composition is wider. Seeded at `K.2798`, reconstructs a 20-tablet cluster with depth-2 sub-hub `K.15325` whose depth-3 members include K.8994 (fuzzy_J=0.49) and K.11920 (fuzzy_J=0.41) — peripheral-witness pattern. **Per-member topology** (depth from seed, parent that brought it in, fuzzy_j to parent) makes the cluster relationships fully inspectable.

## What's new — v0.17.0

**Anomaly Surface refinement + fuzzy parallels.** Four quality filters (`formulaic`, `refrain_heavy`, `heavily_damaged`, `provenance_cluster`) cut bi-orphan candidates 42 → 28 by removing false-positive classes identified in the 2026-05-16 inspection. Plus a new tool `find_fuzzy_parallels` for catching manuscript siblings that exact trigram-Jaccard misses because of localized sign-form variants. Validation: `K.2798 ↔ Si.776` (the publishable test case from the v0.16 inspection) ranks **#1 with fuzzy_J=0.41 vs exact_J=0.15 — 2.67× lift**, 129 of 311 query trigrams match fuzzily. Several candidates with 17× and 32× lifts also surface (BM.35512, BM.34795) as new investigation targets.

- **v0.16.0** — Anomaly Surface: three tools (`find_anomalous_tablets`, `describe_anomaly`, `discovery_surface_stats`) that join the corpus-viz lexical graph with the v0.15 thematic-embedding index + tabletMetadata. Surfaces bi-orphans (167 corpus-wide).

- **v0.15.0** — `find_thematic_parallel` — Random-Indexing distributional embeddings (Sahlgren 2005) over the 28,665-tablet eBL sign corpus. Surfaces siblings sharing zero trigrams but with similar distributional sign contexts. 300-dim, ±3 window, mean-centered (fixes mean-pooling collapse).

**Recent v0.14 train:**
- **v0.14.4** — Corpus-exclusion pre-filter (`data/corpus-exclusions.json`) closes the colophon-template false-positive class identified in v0.13.4 calibration.
- **v0.14.3** — `find_biblical_parallel`: 15 canonical Mesopotamian ↔ Hebrew Bible parallels (Flood, Creation, Eden/Adapa, Babel, Job/Theodicy, Eccl/Šiduri, Daniel 7 beasts, Ezekiel 1 chariot, Leviathan, Song of Songs, Isaiah 14 hubris, Proverbs, plant of life, sacrifice-flies, healing serpent) with named-Assyriologist attribution + transmission hypothesis + brief-in-vault pointer.
- **v0.14.2** — `infer_damaged_sign`: bigram-context inference engine over the 36,498-tablet eBL corpus (4.69 M bigram pairs). Suggests ranked sign-candidates for each `X` damaged-position token with optional period/genre conditioning.
- **v0.14.1** — Apsû Explorer backend integration: hard-coded entity panels now pull full brief content from the research vault via `get_brief`.
- **v0.14.0** — RAG over cuneiform-research vault: 4 tools (`query_research`, `get_brief`, `list_briefs`, `find_synthesis_claims`) indexing 58 briefs · 2,364 chunks · 2.1 M chars · 82 synthesis claims.

## Release lineage

| Version | Headline |
|---|---|
| **v0.18.0** | `restore_lacuna_passage` (multi-sign damaged-passage predictor) + `find_same_scribe_candidates` + `get_scribal_signature` (orthographic-preference clustering via per-tablet LLR signature). |
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

## 30 tools live

### Corpus retrieval (v0.1–v0.5)

| Tool | Source |
|---|---|
| `lookup_sign` | OGSL `labasi-signs.json` warm cache → eBL `/api/signs/{NAME}` fallback. Glyph + 8 sign-list refs + sound values. |
| `search_tablets` | CDLI `/search` (simple-field/value/op triplet, closed-enum validation). |
| `get_tablet` | CDLI `/artifacts/{int-id}` with P/Q-number → integer id shim. |
| `search_oracc` | ORACC `pager?q=…` HTML scrape (translation + transliteration result shapes). |
| `get_oracc_text` | ORACC TEI XML at `/<project>/tei/<text_id>.xml` (UPenn mirror). |
| `search_fragments` | eBL `/api/fragments/query` with museum-number / transliteration auto-detection. |
| `get_fragment` | eBL `/api/fragments/{id}` (`BM.41255C` → `BM.41255.C` normalized). |

### Parallel detection (v0.3, v0.4)

| Tool | Method · Validated recall@15 |
|---|---|
| `find_join_candidates` | Local lineToVec scorer, faithful port of eBL's `LineToVecRanker`. **3.4%** (seed=42, N=50). |
| `find_parallel_text` | Local sign-trigram Jaccard with X-filter. **22%** combined (N=151, 267 siblings, 95% CI [17%, 28%]). Primary parallel/join discovery tool. |

### Mesopotamian-internal corpus tools (v0.8–v0.12)

| Tool | What it does |
|---|---|
| `compare_flood_narratives` | Side-by-side alignment of Atra-ḫasīs, Sumerian Flood Story, Gilgamesh XI, Berossus. |
| `find_antediluvian_parallel` | Parallels across pre-flood texts (Sumerian King List, Adapa, Etana, apkallū lists). |
| `apkallu_attestations` | Indexed attestations of named apkallū sages across the corpus. |
| `find_mesopotamian_parallel` | General Mesopotamian-internal parallel search with named-scholar validation. |
| `discover_parallel_candidates` | Secondary-literature Discovery Engine v1.0 — surfaces candidate parallels with novelty scoring. |

### Primary-source Discovery Engine v2.0 (v0.13)

| Tool | What it does |
|---|---|
| `discover_primary_source_parallels` | Pairwise sign-trigram Jaccard over the eBL 36,498-tablet sign corpus, with cross-boundary scoring (genre/period/city) and validation-status filtering. Calibrated 9/11 true-positive rate on top-tier candidates (2026-05-15). |

### RAG over the cuneiform-research vault (v0.14.0)

| Tool | What it does |
|---|---|
| `query_research` | BM25 retrieval over ~50 markdown briefs. Returns ranked chunks with brief name, section heading, scholarly citations, synthesis flag. |
| `get_brief` | Retrieve a specific brief by name (case-insensitive, .md tolerated), paginated 5 chunks per page. |
| `list_briefs` | Enumerate briefs by cluster (cosmology / theology / royal_myth / divination_science / reception_comparative / monuments / infrastructure). |
| `find_synthesis_claims` | Surface all paragraphs flagged `[my synthesis]` / `[unverified]` / `[Cluster synthesis]` — the author's explicitly-novel interpretive claims (vs. scholarly consensus). 82 currently indexed. |

### Sign-inference engine (v0.14.2)

| Tool | What it does |
|---|---|
| `infer_damaged_sign` | For each `X` damaged-position token in an eBL transliteration, suggest the most-probable sign via bigram context (`P(sign\|prev) × P(sign\|next)`) with Laplace smoothing + optional period/genre conditioning. Bigram index: 36,498 tablets, 4.69 M pairs, 8,757 distinct signs. Built lazily on first call (~5 sec). Real assyriological tool. |

### Biblical-parallel finder (v0.14.3)

| Tool | What it does |
|---|---|
| `find_biblical_parallel` | 15 canonical Mesopotamian ↔ Hebrew Bible parallels with named-Assyriologist attribution + transmission hypothesis + `brief_in_vault` pointer. Look up by biblical reference (`Gen 6:9`, `Job 3`), theme (`flood`, `wisdom`, `throne-chariot`), or Mesopotamian source (`Atrahasis`, `Gilgamesh`, `Enuma Elish`). Strong-consensus (12) + moderate-consensus (3) parallels. Composes with `get_brief` for drill-down. |

### Semantic embeddings — Mode C (v0.15.0)

| Tool | What it does |
|---|---|
| `find_thematic_parallel` | Random-Indexing distributional embeddings (Sahlgren 2005) over the eBL sign corpus. Returns top-30 cosine-similar tablets per seed. Unlike the lexical/trigram methods, surfaces siblings that share zero exact trigrams but use signs with similar distributional contexts. 300-dim, ±3 window, k=8 nonzeros, mean-centered (fixes mean-pooling collapse). 28,665 tablets in index after MIN_TABLET_SIGNS=20 + v0.14.4 exclusion filter. Build with `node scripts/build-embeddings.mjs` (~4 min). Pair with `discover_primary_source_parallels` for compound lexical+thematic discovery. |

### Anomaly Surface — discovery joiner (v0.16.0, refined v0.17.0)

| Tool | What it does |
|---|---|
| `find_anomalous_tablets` | Surfaces tablets that don't fit anywhere — candidates for previously-unknown compositions. Joins corpus-viz lexical graph with v0.15 embedding index + metadata. 7 anomaly criteria: `bi_orphan` (no lex AND no thematic — highest priority, **167 corpus-wide**), `lexical_singleton`, `thematic_orphan`, `cluster_genre_misfit`, `cluster_period_misfit`, `low_lexical_high_thematic`, `low_thematic_high_lexical`. **v0.17 quality filters** (default ON for bi_orphan/lex_singleton/thematic_orphan): excludes formulaic tablets (top1 sign-share > 12%), refrain-heavy tablets (3-gram repeats > 3× in head), heavily-damaged tablets (x_ratio > 50%), and provenance-cluster members (top neighbors > 80% same prefix). Returns ranked list with interpretation + follow-up + eBL URL. Build with `node scripts/build-anomaly-index.mjs`. |
| `describe_anomaly` | Per-tablet drill-down: lex + thematic neighbor counts, cluster membership + dominants, anomaly-flag evaluation, **v0.17 quality flags** + metrics, reasons, follow-up steps. |
| `discovery_surface_stats` | Top-level stats: how many tablets in each index, lexical singletons, thematic orphans, bi-orphans by sign-length bucket. |

### Fuzzy parallel finder + cluster reconstructor (v0.17.0–v0.17.1)

| Tool | What it does |
|---|---|
| `find_fuzzy_parallels` | Finds manuscript siblings exact trigram-Jaccard misses. Two trigrams match fuzzily iff exactly 2 of 3 positions are equal (1-substitution neighbors). Validation: `K.2798 ↔ Si.776` ranks #1 at fuzzy_J=0.41 vs exact_J=0.15 — **2.67× lift**. Returns up to 5 concrete fuzzy-match examples per candidate. ~7 sec first call; <1 sec thereafter. |
| `reconstruct_cluster` | Given a seed tablet, recursively expand via fuzzy parallels until the cluster closes. BFS with configurable depth + size caps. Output: per-member topology (depth, parent, fuzzy_j_to_parent) + full edge set + prefix/depth distributions. Validated on BM.77056 → **100+ tablet cluster spanning 20 museum prefixes** at depth 4. Use to reconstruct full manuscript-witness clusters from any seed point. |

### Lacuna restoration + scribal fingerprint (v0.18.0)

| Tool | What it does |
|---|---|
| `restore_lacuna_passage` | Predicts the most-probable sign sequence for a multi-sign damaged passage. Strategy: build a context fingerprint (prefix + suffix trigrams) from known signs around the lacuna, scan 36K-tablet eBL corpus for templates whose local sign sequence contains BOTH a prefix-trigram and a suffix-trigram within distance k ± tolerance, extract intervening signs as candidate fills. Falls back to bigram beam-search when no parallel templates exist (lower confidence). |
| `find_same_scribe_candidates` | Surfaces tablets with similar orthographic preferences — candidate same-scribe pairs. Per-tablet signature = top-30 signs by log-likelihood ratio of in-tablet vs. corpus-baseline frequency. Two tablets with overlapping signatures share unusual orthographic preferences (variant-sign choices, logogram-vs-syllabic habits, sign-compound preferences). NB: eBL transliterations normalize paleographic variation, so this measures spelling-preference fingerprint rather than handwriting paleography in the strict sense. Validation: K.2798 and Si.776 (confirmed manuscript siblings) do NOT appear in each other's same-scribe candidates — correctly distinguishing "same composition, different scribes" from "same scribe." |
| `get_scribal_signature` | Retrieves the scribal-signature profile for a specific tablet (top-30 signs by LLR with corpus-share comparison). |

See [PROTOCOL.md](PROTOCOL.md) for the full interface — per-tool input schemas, output envelope shapes, and example requests. Live JSON Schemas in [schemas/](schemas/).

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

Restart Claude Code. The 21 tools become callable as `mcp__cuneiform__*`.

## Smoke test

```bash
npm run smoke   # prints "21 tools registered" and exits
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
