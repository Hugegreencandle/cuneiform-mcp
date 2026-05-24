# cuneiform-mcp v0.26.0 — Per-Period Embeddings + Per-Archetype Threshold Matrix

Two new tools shipped via parallel sub-agents. Closes the Round-3 Lever 5 deferral that's been outstanding since v0.18.19, and opens the diachronic axis on sign2vec — with a honest caveat about register confounds.

**Tool count: 72 → 74.**

## `compare_sign_neighbors_across_periods` (sub-agent A)

Per-period sign2vec embeddings trained separately on Neo-Assyrian and Neo-Babylonian sub-corpora (same WINDOW=5/MIN_OCC=20 hyperparameters as v0.23, applied independently per period).

| Period | Tablets in period | Signs indexed | Cache size | Build time |
|---|---|---|---|---|
| Neo-Assyrian | 14,193 | 435 | 420 KB | 0.2s |
| Neo-Babylonian | 10,861 | 452 | 436 KB | 0.2s |

**387 signs common to both indexes.** Round-11 audit 3/3 PASS.

### Substantive finding — diachronic + register, not pure diachronic

The audit found **44.2% of common signs have full top-5 turnover** between periods. Distribution:

| top-5 drift | Common signs | % |
|---|---|---|
| 0 (identical neighborhood) | 0 | 0.0% |
| 1 | 7 | 1.8% |
| 2 | 27 | 7.0% |
| 3 | 71 | 18.3% |
| 4 | 111 | 28.7% |
| **5 (full turnover)** | **171** | **44.2%** |

Mean common-neighbors at top-5 = **0.94 / 5**.

This is corpus-shape confounded with diachronic substitution, not pure diachronic drift. Two confounds plausibly inflate every number:

1. **Genre asymmetry.** NA is dominated by Library of Ashurbanipal canonical literature (Maqlû, Šumma Ālu, omen series, royal inscriptions); NB skews heavily toward administrative/archival texts (receipts, contracts). A sign's distributional neighbors will diverge across periods because it co-occurs with completely different surrounding vocabulary in scholarly vs. archival registers — even if the *script-level* phonology is identical.
2. **Independent SVD basis.** Two truncated-SVD runs on disjoint sub-corpora live in independent 100-dim coordinate systems. Tiny shifts at low cosine make full top-5 turnover easy.

**Methods paper §3.14 framing:** the tool is real, the drift signal is real, but the headline claim is *"diachronic + register"* drift. Isolating the diachronic axis from the genre/register axis would require either (a) restricting each period sub-corpus to a matched genre (omen-series-only across NA and NB), or (b) reporting drift over a fixed neighbor set rather than top-5. Both deferred to v0.27.

### Sample diachronic-drift candidates

The audit identified 171 signs with full top-5 turnover. Three at the top:

- **ABZ411**: NA top-5 = `28, 27, 13, 29, 21` (NA numerical-context cluster) vs NB top-5 = `ABZ473, ABZ124, 53, 57, 58` (different number-range neighbors)
- **ABZ480** (corpus's most-frequent sign, v0.25 anchor): NA = `ABZ52, ABZ1, ABZ406v2, ABZ570, ABZ344` vs NB = `ABZ111, ABZ331, ABZ598a, ABZ330, ABZ72`
- **ABZ342**: NA = `ABZ570/ABZ593, ABZ170, ABZ377, ABZ565, ABZ62` vs NB = `ABZ134, ABZ366, ABZ595, ABZ468, ABZ539`

These are candidates for scholarly review — empirical drift signals that may or may not survive register-matched controls.

## `recommend_archetype_thresholds` (sub-agent B)

Closes Round-3 Lever 5 (deferred from v0.18.19 — see RELEASE-v0.18.19.md). Per-archetype precision/recall threshold profiles for the 7 cluster archetypes documented in methods paper §3.8.

**Full matrix:**

| archetype | exemplar | fuzzy.min_J | embedded.cont/run/× | chunk.len | thematic.cos | scribal.overlap | cluster.J/depth |
|---|---|---|---|---|---|---|---|
| compositional_curriculum | BM.77056 | 0.08 | 0.30 / 10 / 3 | 15 | 0.45 | 2 | 0.12 / 4 |
| cross_period_bridge | BM.45749 | 0.10 | 0.35 / 20 / 4 | 18 | 0.50 | 2 | 0.10 / 4 |
| embedded_fragment | K.9508 | 0.05 | 0.30 / 30 / 5 | 30 | 0.50 | 2 | 0.08 / 3 |
| refrain_bound_liturgical | K.5896 | 0.12 | 0.40 / 25 / 4 | 20 | 0.60 | 3 | 0.15 / 3 |
| single_collection_school | YBC.5729 | 0.20 | 0.55 / 25 / 4 | 25 | 0.75 | 6 | 0.18 / 2 |
| commentary_quotation | BM.47463 | 0.30 | 0.50 / 100 / 3 | 100 | 0.65 | 3 | 0.25 / 2 |
| verbatim_manuscript_chain | Sm.1055 | 0.35 | 0.70 / 40 / 5 | 30 | 0.70 | 5 | 0.30 / 2 |

Each profile carries a `rationale` string anchoring every threshold to a specific v0.18.x audit finding.

**Tighter-vs-looser ordering invariant:** verbatim_manuscript_chain has strictly tighter thresholds than compositional_curriculum on every axis — empirically defensible from the §3.8 archetype shape differences.

### Classification heuristic — 3/3 on canonical exemplars

`recommendArchetypeThresholds({seed_tablet_id: ...})` returns a best-effort archetype classification:

- K.5896 → `refrain_bound_liturgical` ✓
- BM.77056 → `compositional_curriculum` ✓
- K.9508 → `embedded_fragment` ✓

Documented signal-priority order: commentary genre > embedded-fragment shape > liturgical genre > curricular short-form shape > verbatim fuzzy_J > single-collection prefix-spread > cross-period mismatch > curriculum (fallback).

Round-11 audit 24/24 PASS (well-formed profiles + ordering invariant + classification accuracy).

## Calibration tally — Round 11

| Lever / Audit | Class | Effect |
|---|---|---|
| `compare_sign_neighbors_across_periods` | **NEW TOOL** | Per-period sign2vec (NA/NB). 387 common signs, 44% full top-5 turnover. Honest "diachronic + register" framing. |
| `recommend_archetype_thresholds` | **NEW TOOL** | 7-archetype calibration matrix. Round-3 Lever 5 deferred-since-v0.18.19, finally cashed out. |

**Cumulative v0.18–v0.26 record: 22 calibrations shipped, 4 no-ops.**

## Methods paper §3.14 added

New section after §3.13 documents:
- §3.14.1 Per-period sign embeddings (diachronic + register caveat)
- §3.14.2 Per-archetype threshold matrix + classification heuristic
- §3.14.3 The two axes are conditionally composable (an NA verbatim-chain probe benefits from BOTH the verbatim_manuscript_chain threshold profile AND the period-specific embeddings)

## Reproducibility

```bash
node scripts/build-sign-embeddings-per-period.mjs            # NA + NB indexes, ~0.4s
npm run build && npm run smoke                               # 74 tools
node scripts/round11-per-period-audit.mjs                    # 3/3 PASS
node scripts/round11-archetype-thresholds-audit.mjs          # 24/24 PASS

# Live probes
compare_sign_neighbors_across_periods({ sign: "ABZ480" })
recommend_archetype_thresholds({ list_all: true })
recommend_archetype_thresholds({ seed_tablet_id: "K.5896" })
```

## Outstanding (v0.27 / v1.0)

- **v0.27 candidate**: register-matched per-period embeddings (omen-series-only across NA/NB) to isolate the diachronic axis from the register confound
- **v1.0 readiness checklist** — next phase
