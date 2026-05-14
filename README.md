# cuneiform-mcp

MCP server exposing CDLI, ORACC, OGSL, and eBL/Fragmentarium cuneiform corpora to LLM agents.

## v0.4.0 — 9 tools live

| Tool | Source |
|---|---|
| `lookup_sign` | OGSL `labasi-signs.json` warm cache → eBL `/api/signs/{NAME}` fallback (glyph + 8 sign-list refs + sound values) |
| `search_tablets` | CDLI `/search` (simple-field/value/op triplet, closed-enum field validation) |
| `get_tablet` | CDLI `/artifacts/{int-id}` with P/Q-number → integer id shim |
| `search_oracc` | ORACC `pager?q=…` HTML scrape (handles translation + transliteration result shapes) |
| `get_oracc_text` | ORACC TEI XML at `/<project>/tei/<text_id>.xml` (UPenn mirror) |
| `search_fragments` | eBL `/api/fragments/query` with museum-number / transliteration auto-detection |
| `get_fragment` | eBL `/api/fragments/{id}` (`BM.41255C` → `BM.41255.C` normalized) |
| `find_join_candidates` | local lineToVec scorer — faithful port of eBL's `LineToVecRanker`. Validation 2026-05-14: **3.4% recall@15** on known joins. Useful for cross-validating against eBL's `/match`. |
| `find_parallel_text` | local sign-trigram Jaccard. Validation 2026-05-14 (combined N=151, 267 known siblings): **22% recall@15** on known joins, 95% CI [17%, 28%] (~6.5× the lineToVec scorer). Primary parallel/join discovery tool. |

See `VALIDATION-2026-05-14.md` + `TRIGRAM-EXPERIMENT-2026-05-14.md` + `VALIDATION-N100-2026-05-14.md` for the benchmark methodology and per-target results.

## Install

```bash
cd ~/Desktop/cuneiform-mcp
npm install --ignore-scripts
npm run build
```

## Wire into Claude Code

Add to `~/.claude/settings.json` under `mcpServers`:

```json
"cuneiform": {
  "command": "node",
  "args": ["/Users/danebrown/Desktop/cuneiform-mcp/dist/index.js"]
}
```

Restart Claude Code. The 9 tools become callable as `mcp__cuneiform__*`.

## Smoke test

```bash
npm run smoke   # prints "9 tools registered" and exits
```

## One-time cache builds (for the local matchers)

Both `find_join_candidates` and `find_parallel_text` read from local caches under `~/.cache/cuneiform-mcp/`. Build them before using either tool:

```bash
# lineToVec cache (~24 min, populates fragments.jsonl)
node dist/index.js --prefetch

# sign-trigram cache (one ~26 s request, ~33 MB)
node scripts/build-signs-index.mjs
```

## Validation

Both matchers were benchmarked against eBL's `joins[]` ground truth on 2026-05-14 (full 36K-fragment corpus). Headline numbers (combined across seed=42 N=50 and seed=137 N=101, 267 known siblings):

- `find_join_candidates` (lineToVec): **3.4% recall@15**, median rank 7,154 / 36,328 (seed=42 only).
- `find_parallel_text` (sign-trigram Jaccard): **22.5% recall@15**, 95% CI [17%, 28%]. Per-seed: 25.3% (N=50, seed=42) and 21.1% (N=101, seed=137).

Trigram strictly dominates — no lineToVec-only wins on the test set. ~35% of known siblings score zero by either method (the broken pieces share no overlapping content). See `VALIDATION-2026-05-14.md`, `TRIGRAM-EXPERIMENT-2026-05-14.md`, and `VALIDATION-N100-2026-05-14.md` for full methodology, rank distributions, and notable cases.
