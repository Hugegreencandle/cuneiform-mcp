# cuneiform-mcp

MCP server exposing CDLI, ORACC, OGSL, and eBL/Fragmentarium cuneiform corpora — plus a Discovery Engine and an indexed scholarly-research vault — to LLM agents. 19 tools, all returning typed `structuredContent` envelopes with source-of-record provenance.

## What's new — v0.14.0 · RAG over the research vault

Added BM25 retrieval over a local cuneiform-research markdown vault (default `~/Desktop/Research/`, overridable via `CUNEIFORM_RESEARCH_DIR`). Four new tools — `query_research`, `get_brief`, `list_briefs`, `find_synthesis_claims` — turn ~50 Mesopotamian scholarly briefs into a queryable knowledge surface with named-Assyriologist citation extraction and explicit `[my synthesis]` flagging. Index built lazily, cached for process lifetime. No new dependencies.

Sample: 58 briefs · 2,364 chunks · 2.1 M chars · 82 synthesis claims indexed.

## Release lineage

| Version | Headline |
|---|---|
| v0.14.0 | RAG over the cuneiform-research markdown vault (4 tools) |
| v0.13.4 | Discovery Engine v2.0 mid-tier validation — 9/11 known + 2/11 colophon-template artifact |
| v0.13.0 | Primary-Source Discovery Engine — corpus traversal with cross-boundary scoring |
| v0.8–v0.12 | Mesopotamian-internal expansions (flood narratives, apkallū attestations, antediluvian parallels, candidate discovery) |
| v0.7 | Discovery Engine v1.0 (secondary literature) |
| v0.5 | Research-grade structured outputs — every tool emits `structuredContent` envelopes with provenance |
| v0.4 | `find_parallel_text` sign-trigram Jaccard (22% recall@15) |
| v0.3 | `find_join_candidates` (lineToVec port) |
| v0.1 | Initial 8-tool MCP wrapping CDLI/ORACC/OGSL/eBL |

## 19 tools live

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

### RAG over the cuneiform-research vault (v0.14) — NEW

| Tool | What it does |
|---|---|
| `query_research` | BM25 retrieval over ~50 markdown briefs. Returns ranked chunks with brief name, section heading, scholarly citations, synthesis flag. |
| `get_brief` | Retrieve a specific brief by name (case-insensitive, .md tolerated), paginated 5 chunks per page. |
| `list_briefs` | Enumerate briefs by cluster (cosmology / theology / royal_myth / divination_science / reception_comparative / monuments / infrastructure). |
| `find_synthesis_claims` | Surface all paragraphs flagged `[my synthesis]` / `[unverified]` / `[Cluster synthesis]` — the author's explicitly-novel interpretive claims (vs. scholarly consensus). 82 currently indexed. |

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

Restart Claude Code. The 19 tools become callable as `mcp__cuneiform__*`.

## Smoke test

```bash
npm run smoke   # prints "19 tools registered" and exits
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
