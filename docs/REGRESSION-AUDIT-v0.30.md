# Regression Audit — v0.30.0 (2026-05-25)

Full sweep of all v0.18+ audit scripts after the v0.23→v0.30 autonomous run completed (10 versions, 12 new tools, 4 enrichment bursts).

## Result

**25/25 audits PASS.** No regressions across the 10 versions shipped autonomously. Total runtime: ~9 minutes (dominated by Round-7 scribal-school + Round-4 chunk-parallels + lever1 embedded-fragments).

## Per-script results (25 of 25)

| Script | Time | Result |
|---|---|---|
| lever1-embedded-fragments-audit.mjs | 105.9s | ✅ PASS |
| lever2-commentary-verdict-audit.mjs | 26.3s | ✅ PASS |
| lever3-refrain-thematic-audit.mjs | 0.3s | ✅ PASS |
| lever4-signature-evolution-audit.mjs | 59.5s | ✅ PASS |
| lever5-orthographic-outliers-audit.mjs | 1.2s | ✅ PASS |
| round4-chunk-parallels-audit.mjs | 56.3s | ✅ PASS |
| round5-corpus-wide-chunk-audit.mjs | 0.7s | ✅ 6/6 |
| round6-find-incipits-audit.mjs | 0.9s | ✅ 4/4 |
| round6-validation-queue-audit.mjs | 0.7s | ✅ 6 PASS |
| round7-recension-tree-audit.mjs | 0.5s | ✅ 4/4 |
| round7-scribal-school-audit.mjs | 127.5s | ✅ 3/3 |
| round8-sign2vec-audit.mjs | 0.1s | ✅ 5/5 |
| round8.1-incipit-filter-reaudit.mjs | 0.7s | ✅ PASS |
| round9-lexical-substitution-audit.mjs | 32.6s | ✅ 4/4 |
| round10-ensemble-audit.mjs | 0.1s | ✅ 3/3 |
| round10-lift-audit.mjs | 6.3s | ✅ 3/3 |
| round11-archetype-thresholds-audit.mjs | 59.5s | ✅ 24/24 |
| round11-per-period-audit.mjs | 0.1s | ✅ 3/3 |
| round12-register-matched-audit.mjs | 0.2s | ✅ 4/4 |
| round13-per-period-chunks-audit.mjs | 0.3s | ✅ 3/3 |
| round13-sign-clustering-audit.mjs | 0.3s | ✅ 3/3 |
| round14-bayesian-fusion-audit.mjs | 52.4s | ✅ 4 PASS |
| round15-joins-graph-audit.mjs | 11.1s | ✅ 3/3 |
| round15-numerical-chunks-audit.mjs | 0.9s | ✅ 4/4 |
| round16-lacuna-sign2vec-audit.mjs | 1.3s | ✅ 3/3 |

## Cumulative empirical validation

All headline numbers from the methods paper still reproduce against the current codebase:
- K.9508 ↔ K.5896 chunk_length=142 (§3.9, v0.19)
- K.5896 → K.5896 sign2vec self-cosine = 1.0 (§3.12, v0.23)
- K.5896 ↔ K.9508 substitution_lift_z = +1.967 (§3.13, v0.25)
- BM.77056 6-subgenre cross-curricular chunk pattern (§3.9.1, v0.19)
- K.3306 → K.6685 chunk-51 reclassification (§3.6 amendment, v0.19)
- BM.47463 ↔ CBS.6060 Šurpu commentary edge (§3.7.1)
- KAR-44 curriculum recovery — third independent (§3.10, v0.20)
- Per-archetype threshold matrix order (§3.14.2, v0.26)
- Diachronic axis dominates register confound (§3.14.4, v0.27)
- 12-cluster sign-taxonomy emergence (§3.15, v0.28)
- 4.2× NA/NB chunk-density gap (§3.15, v0.28)
- Bayesian fusion 98.1% training accuracy (§3.16.1, v0.29)
- 4,361 fragments with ≥1 join, K.7563 hub (§3.16.2, v0.29)
- 90% α=0/α=1 disagreement on sign2vec lacuna (§3.17, v0.30)

## Re-run

```bash
node scripts/regression-audit-all-rounds.mjs
```

Exit code 0 = all pass. Re-runnable end-to-end against `~/.cache/cuneiform-mcp/` state.
