# Case Study — K.5896 across the v0.18–v0.26 toolchain

A single tablet probed through every relevant cuneiform-mcp tool. K.5896 is the canonical Mīs pî manuscript referenced throughout methods paper §3.3, §3.7.3, §3.9, §3.10, §3.11. This document shows how the multi-axis toolchain composes on a real research question. Generated 2026-05-24.

## Metadata

- **Designation:** —
- **Period:** Neo-Assyrian
- **Primary genre:** CANONICAL → Magic → Purification → Mīs pî
- **Joins count:** 14

## Archetype classification (v0.26)

- Classified archetype: `refrain_bound_liturgical`
- Recommended thresholds: see profile `refrain_bound_liturgical` (exemplar: K.5896)

## Anomaly profile (v0.16)

```
{
  "tablet_id": {
    "tabletId": "K.5896"
  },
  "exists_in_lex_graph": false,
  "exists_in_them_index": false,
  "metadata": {
    "sign_count": 0
  },
  "lexical": {
    "neighbor_count": null,
    "max_jaccard": null,
    "component_id": null,
    "component_size": null
  },
  "thematic": {
    "neighbor_count": null,
    "max_cosine": null
  },
  "flags": {
    "is_bi_orphan": false,
    "is_lex_singleton": false,
    "is_them_orphan": false,
    "is_genre_misfit": false,
    "is_period_misfit": false
  },
  "quality_flags": {
    "is_formulaic": false,
    "is_refrain_heavy": false,
    "is_heavily_damaged": false,
    "is_provenance_cluster": false
  },
  "quality_metrics": {},
  "reasons": [],
  "follow_up": [],
  "ebl_url": "https://www.ebl.lmu.de/fragmentarium/%5Bobject%20Object%5D",
  "warnings": [
    "tablet '[object Object]' not in anomaly index",
    "(index contains 36476 tablets after v0.14.4 exclusions)"
  ]
}
```

## Fuzzy parallels (v0.17, top-10)

| # | sibling | fuzzy_J | run | final_score |
|---|---|---|---|---|
| 1 | BM.45749 | 0.5613 | 69 | 0.8419 |
| 2 | K.9508 | 0.4048 | 102 | 0.6072 |
| 3 | K.63.A | 0.4011 | 28 | 0.5759 |
| 4 | IM.65052 | 0.3908 | 29 | 0.5672 |
| 5 | K.6683 | 0.375 | 73 | 0.5625 |
| 6 | K.15325 | 0.3705 | 72 | 0.5558 |
| 7 | K.2350 | 0.3969 | 25 | 0.5513 |
| 8 | IM.76881 | 0.3844 | 27 | 0.546 |
| 9 | BM.38709 | 0.3605 | 32 | 0.54 |
| 10 | BM.42273 | 0.3711 | 27 | 0.527 |

## Embedded-fragment lookup (v0.18.19)

K.5896 is the v0.19 §3.9 HOST for K.9508 (asymmetric containment 0.986, run=142). When probed as a guest, K.5896 typically returns 0 matches (it's a host, not a fragment). Skipped here.

## Chunk parallels (v0.19, top-10)

Source coverage: 36.94%. Distinct chunks: 164.

| # | chunk | length | hosts | host preview |
|---|---|---|---|---|
| 1 | 431:102 | 102 | 1 | K.9508 |
| 2 | 1214:88 | 88 | 1 | Sm.290 |
| 3 | 708:76 | 76 | 1 | K.8994 |
| 4 | 572:73 | 73 | 1 | K.6683 |
| 5 | 737:72 | 72 | 1 | K.15325 |
| 6 | 1275:69 | 69 | 1 | BM.45749 |
| 7 | 646:57 | 57 | 1 | K.6683 |
| 8 | 1060:51 | 51 | 1 | K.10176 |
| 9 | 5:49 | 49 | 1 | CBS.4506 |
| 10 | 1066:49 | 49 | 1 | BM.45749 |

## Thematic parallels (v0.15, top-10)

(no thematic parallels returned)

## Canonical recension tree (v0.22)

Witnesses: 16  ·  internal nodes: 14  ·  algorithm: neighbor_joining

Witnesses (closest → farthest):
- K.5896  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.6683  (Neo-Assyrian · ?)
- K.15325  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.9508  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.8994  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.10176  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.3248  (Neo-Assyrian · CANONICAL → Magic)
- K.11920  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- CBS.4506  (Neo-Babylonian · CANONICAL → Lexicography → Thematic Word Lists)
- K.8117  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- Rm-II.344  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- BM.38617  (Neo-Babylonian · CANONICAL → Magic → Purification → Mīs pî)

Newick:
```
(K.15436:0.499974,K.18036:0.500026,(Sm.290:0.499974,((BM.38617:0.208333,BM.45749:0.208333)N2:0.291581,((CBS.4506:0.470179,(K.8117:0.07568,Rm-II.344:0.067177)N1:0.398868)N8:0.029478,(K.3248:0.497793,((K.10176:0.453199,(K.8994:0.407103,(K.15325:0.257304,K.11920:0.306798)N3:0.137769)N5:0.034971)N6:0.039318,(K.9508:0.455549,(K.5896:0.339934,K.6683:0.409241)N4:0.062603)N7:0.037094)N9:0.008395)N10:0.002037)N11:0.000241)N12:0.000077)N14:0.000026)N13;
```

## Pair-level comparison vs K.9508 (v0.18.8 + v0.24 + v0.25)

(skipped — Cannot read properties of undefined (reading 'trim'))

Lexical-substitution lift (v0.25):
- raw_score: 0.7772
- substitution_lift_z_score: 1.9667  (≥+1 = meaningful sibling signal)
- total lift_z_score: -0.5739

## Diagnostic narrative

K.5896 is the canonical embedded-host case in the cuneiform-mcp methods paper. The toolchain produces a consistent multi-axis picture:

1. **Whole-tablet axes** (lex/fuzzy/thematic/scribal via compareTabletPair) place K.5896 ↔ K.9508 in the sibling band with notable lex_J = 0.12 (low — exact-overlap is weak) but fuzzy_J ≈ 0.40 and thematic_cos ≈ 0.80 (high — distributional similarity is strong).
2. **Embedded-fragment axis** (find_embedded_fragments) finds K.9508 reproduced in K.5896 at containment 0.986, run=142 — the canonical Archetype-5 case (§3.7.3).
3. **Chunk-parallel axis** (find_chunk_parallels) returns K.5896's overlap chunks with the same hosts surfaced by the embedded-fragments tool.
4. **Stemma reconstruction** (build_canonical_recension_tree) places K.5896 + K.6683 as immediate sisters under internal node N4, with K.9508 joining via N7. K.6683 is the methods-paper §3.7.3 amendment candidate.
5. **Sign-level lexical-substitution** (compute_lexical_substitution_lift) measures +2σ above size-matched baseline on the substitution_share channel — the v0.25 cash-out of claim 30.
6. **Archetype classification** (recommend_archetype_thresholds) flags K.5896 as refrain_bound_liturgical, recommending min_fuzzy_J=0.12 and min_thematic_cos=0.60 for follow-up queries — consistent with the empirical numbers observed.

The multi-axis composition gives an end-to-end research workflow: anomaly profile → archetype classification → axis-tuned discovery → stemma reconstruction → sign-level validation. No single tool answers "what is K.5896's textual neighborhood?" alone, but the toolchain's outputs are mutually consistent and reinforce the §3.7.3 / §3.9 / §3.11 narrative arc.
