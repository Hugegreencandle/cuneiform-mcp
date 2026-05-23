# cuneiform-mcp v0.18.19 — Round-3 Calibration Audit

Round-3 calibration audit on the 30-tool v0.18.3 base and the 29-tool v0.18.4–v0.18.18 expansion. Three substantive fixes shipped; two no-ops confirmed. Audits are reproducible end-to-end from the dated scripts in `scripts/lever{1,2,3,4,5}-*.mjs`.

## Calibration tally — Round 3

| Lever / Audit | Class | Effect |
|---|---|---|
| Lever 1 — Embedded-fragment asymmetry | **FIX** | New tool `find_embedded_fragments` with asymmetric containment scoring. K.9508 → K.5896 containment 0.986 (vs symmetric J=0.134), run=142. Default `min_run=20` calibrated against methods-paper §3.6 final-2 bi-orphans (IM.49220, K.3306 → 0 spurious hosts). |
| Lever 2 — Commentary-quotation verdict | **FIX** | New `commentary_quotes_base_text` verdict in `compare_tablet_pair`. BM.47463↔CBS.6060 (Šurpu commentary quoting Šurpu base, run=108) reclassified from `physical_join_candidate`. K.2798↔Si.776 unchanged. |
| Lever 3 — Refrain-heavy thematic threshold | **NO-OP** | Refrain-flagged tablets show no noise-band inflation (Δ avg neighbors in 0.50-0.70 = +0.65, statistically indistinguishable). Tightening would lose real Mīs pî witnesses (U.5124 at cos=0.6971). |
| Untested-tool #1 — `find_signature_evolution_in_lineage` | **FIX** | `DEFAULT_MAX_CHAIN` 15 → 8. Default 15 invites BFS overshoot that causes K.5896 to misclassify as fragmented at chain=10. Inner-core size for tight clusters in this corpus is empirically ~6. JUMP=0.40, STABLE_MEAN=0.65, DRIFTING_MEAN=0.45, FRAGMENTED_JUMPS=3 all validated as no-ops. |
| Untested-tool #2 — `find_orthographic_outliers_in_prefix` | **NO-OP** | Hypothesis (small-signature artifacts) refuted: outlier median sign_count is 934 (K) / 775 (BM). `min_sign_count=50` is dead code because the sort+cap dominates the cohort. Tool is correctly calibrated. |

**Cumulative v0.18 calibration record across rounds 1-3:**

| Round | Version | Fixes | No-ops | Class |
|---|---|---|---|---|
| 1 | v0.18.1 | lacuna length-factor (23%→92% top-1) | — | one-line |
| 2 | v0.18.2 | bi-orphan threshold + score rebalance + fuzzy run-bonus | — | three-fix |
| 2 | v0.18.3 | find_parallel_text run-bonus | thematic length-bias + scribal threshold | one fix + two no-ops |
| 3 | v0.18.19 | embedded-fragments tool + commentary verdict + sig-evolution chain default | refrain-thematic + orthographic-outliers | three fix + two no-ops |

**Total: 8 calibrations shipped, 4 no-ops confirmed across the v0.18 family.**

## Deferred to round 4

- **Lever 4** (cross-period bridge detector) — partially absorbed by Lever 1's tool (BM.45749 surfaced as K.9508's #2 host without a separate tool). Standalone detector deferred until needed.
- **Lever 5** (per-archetype threshold matrix) — explicitly deferred from the round-3 plan as the highest-effort lever with the lowest confidence.

## Tool surface — 60 MCP tools

| v0.18.3 baseline | + v0.18.4–v0.18.18 expansion | + v0.18.19 round-3 |
|---|---|---|
| 30 tools | 29 new tools (59 total) | 1 new tool (60 total) |

The single net-new tool in v0.18.19 is `find_embedded_fragments`. All other Lever 2/4 fixes refine existing behavior.

## Reproducibility

All audits are self-contained scripts that import the compiled `dist/` modules and exercise them against the local cache (`~/.cache/cuneiform-mcp/`). Re-run order:

```bash
node scripts/lever1-embedded-fragments-audit.mjs
node scripts/lever2-commentary-verdict-audit.mjs
node scripts/lever3-refrain-thematic-audit.mjs
node scripts/lever4-signature-evolution-audit.mjs
node scripts/lever5-orthographic-outliers-audit.mjs
node scripts/validate-v0.18-suite.mjs           # regression smoke
```

Audit writeups, one per lever, in `docs/v0.18.19-calibration-round3-*.md`.

## New methods-paper synthesis claims (round 3 adds claims 14-22)

14-16: embedded-fragment asymmetry (Lever 1) — symmetric Jaccard's union denominator is unsuitable for Archetype-5; run-bonus is methodology-agnostic; cross-period bridge nodes surface as side-effect of asymmetric containment.

17-18: commentary verdict (Lever 2) — high-fuzzy-J + long-run + asymmetric Commentary genre is a quotation pattern; genre tagging in the verdict classifier is precision-positive without harming recall on anchor cases.

19: refrain-thematic no-op (Lever 3) — per-archetype threshold tuning is low-yield when corpus-wide embedding is build-time-calibrated.

20-21: signature-evolution (untested-tool #1) — coherence labels refer to scribal lineage, not composition transmission; default BFS chain size should match corpus-specific inner-core size.

22: orthographic-outliers (untested-tool #2) — cohort homogeneity is a tool-output signal worth surfacing alongside per-outlier scores (deferred enhancement).

## Outstanding (future work)

Round-3 confirms the v0.18 calibration arc is largely closed: 4 no-ops in a row at the threshold-tuning frontier suggest the corpus + embedding are well-conditioned for the current methodology. Future calibration work belongs in:

- **Build-time** changes (signs-index, embedding generation, anomaly-index reconstruction)
- **New tool** surface area (per Lever 4, Lever 5, and the §3.7.3 cross-period bridge framework)
- **Documentation** — minor description-text fixes surfaced by the untested-tool audits

NOT in further round-N threshold sweeps on the existing toolchain.
