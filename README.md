# cuneiform-mcp

MCP server exposing CDLI, ORACC, OGSL, and eBL/Fragmentarium cuneiform corpora to LLM agents.

## v0.1.0 — harness validated

| Tool | Status | Source |
|---|---|---|
| `lookup_sign` | **working** | OGSL `labasi-signs.json` (239 signs, ABZ + MZL refs) |
| `search_tablets` | stub | CDLI Framework API |
| `get_tablet` | stub | CDLI Framework API |
| `search_oracc` | stub | ORACC corpusjson exports |
| `get_oracc_text` | stub | ORACC corpusjson exports |
| `search_fragments` | stub | eBL `/api/fragments` |
| `get_fragment` | stub | eBL `/api/fragments/{id}` |
| `find_join_candidates` | stub | eBL Fragmentarium |

Each stub returns a structured response naming the live source URL and the v0.2 plan.

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

Restart Claude Code. The 8 tools become callable as `mcp__cuneiform__*`.

## Smoke test

```bash
npm run smoke   # prints "8 tools registered" and exits
```

## Next (v0.2)

Wire each stub to its live source. Order: `search_tablets` + `get_tablet` (CDLI) → `search_fragments` + `get_fragment` (eBL) → ORACC pair → `find_join_candidates`.
