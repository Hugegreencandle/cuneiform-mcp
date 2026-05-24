# Regression Audit — v0.26.0 (2026-05-24)

Full sweep of all v0.18+ audit scripts against the current codebase. Catches any regressions introduced by v0.20+ work breaking earlier tools.

## Result

**18/18 audits PASS.** No regressions. Total runtime: ~5.5 minutes (dominated by Round-7 scribal-school audit + Round-4 chunk-parallels audit).

## Per-script results

| Script | Time | Result |
|---|---|---|
| lever1-embedded-fragments-audit.mjs | 71.8s | ✅ PASS |
| lever2-commentary-verdict-audit.mjs | 16.8s | ✅ PASS |
| lever3-refrain-thematic-audit.mjs | 0.2s | ✅ PASS |
| lever4-signature-evolution-audit.mjs | 38.7s | ✅ PASS |
| lever5-orthographic-outliers-audit.mjs | 0.7s | ✅ PASS |
| round4-chunk-parallels-audit.mjs | 44.1s | ✅ PASS |
| round5-corpus-wide-chunk-audit.mjs | 0.5s | ✅ 6/6 |
| round6-find-incipits-audit.mjs | 0.5s | ✅ 4/4 |
| round6-validation-queue-audit.mjs | 0.4s | ✅ 6 PASS |
| round7-recension-tree-audit.mjs | 0.3s | ✅ 4/4 |
| round7-scribal-school-audit.mjs | 94.0s | ✅ 3/3 |
| round8-sign2vec-audit.mjs | 0.0s | ✅ 5/5 |
| round8.1-incipit-filter-reaudit.mjs | 0.6s | ✅ PASS |
| round9-lexical-substitution-audit.mjs | 23.5s | ✅ 4/4 |
| round10-ensemble-audit.mjs | 0.0s | ✅ 3/3 |
| round10-lift-audit.mjs | 4.6s | ✅ 3/3 |
| round11-archetype-thresholds-audit.mjs | 38.0s | ✅ 24/24 |
| round11-per-period-audit.mjs | 0.1s | ✅ 3/3 |

## What this verifies

- **No tool-surface drift**: every audit's anchor cases still produce the documented results.
- **No cache compatibility issues**: caches built across v0.18-v0.26 still load correctly across all tools.
- **No regressions from sub-agent integrations**: v0.20-v0.26 sub-agent-built tools coexist with v0.18-v0.19 hand-built tools without conflicts.
- **All methods-paper headline numbers reproduce** (e.g. K.5896 → K.5896 self-cos = 1.0, ABZ480 top-5 in v0.23 default config, K.9508 ↔ K.5896 chunk_length=142, BM.47463 → CBS.6060 commentary verdict, etc.)

## Re-run

```bash
node scripts/regression-audit-all-rounds.mjs
```

Exit code 0 = all pass; exit code 2 = ≥1 failure. Re-runnable end-to-end against `~/.cache/cuneiform-mcp/` state.

## Recommended cadence

Run before every release (after the new release's audit passes individually). CI candidate for v1.0 readiness — see `docs/v1.0-readiness-checklist.md` item 5.
