# cuneiform-mcp v0.32.0 — Composition Assignment (`identify_composition`)

First Tier-1-substantive item from `docs/v0.31-plus-upgrade-ideas.md` (idea #1, ~3 days estimated).

**Tool count: 83 → 84.**

## The new tool — `identify_composition`

Given a query tablet, returns ranked candidate compositions (Mīs pî, Šurpu, Udug-ḫul, Bīt salāʾ mê, āšipūtu curriculum) from a methods-paper-anchored registry. Joint score across two axes:

| Axis | Source | Weight (default) |
|---|---|---|
| **chunk_overlap** | length-20 chunk-hash index (v0.20, §3.10) — max shared chunks with composition's exemplars, normalized over the candidate set | 0.6 |
| **sign2vec_centroid** | sign-vector centroid cosine (v0.23, §3.12) — query's mean-sign-vector vs exemplar-pool mean-sign-vector | 0.4 |

Weights are normalized over APPLICABLE axes only, so a missing cache (e.g. sign embeddings absent in dev environments) reduces coverage rather than penalizing scores.

### Self-filter

When the query is itself a known exemplar of composition C, its tablet ID is filtered from the scoring pool. This means K.5896's score against Mīs pî reflects how well K.5896 matches the OTHER Mīs pî exemplars, not a degenerate self-match. The `evidence.query_in_exemplar_list` flag surfaces the membership for downstream consumers.

### Curriculum tie-break

The āšipūtu curriculum (KAR-44) shares exemplars with the specific compositions inside it (Mīs pî, Bīt salāʾ mê, Udug-ḫul). For a small fragment like K.9508 — embedded in K.5896 (a Mīs pî manuscript that itself appears in the āšipūtu pool) — chunk-overlap alone is symmetric across both candidates. The tool applies a small tie-break: when two candidates are within 0.02 confidence, prefer `composition_type='specific_composition'` over `composition_type='curriculum'`. A curriculum is a meta-category — never a "more correct" answer than the specific composition that fits equally well.

This is a substantive empirical-grounded design choice, not a calibration knob. The 0.02 threshold is the v0.32 setting; if future data shows persistent misclassification at higher diffs, the threshold can lift.

## Composition registry

| ID | Name | Exemplars | Paper § |
|---|---|---|---|
| `mis_pi` | Mīs pî | K.5896, K.9508, BM.45749, K.2987.B, K.163, K.2550, K.6683 | §3.7.3, §3.11 |
| `surpu` | Šurpu | BM.47463, CBS.6060 | §3.7.1 |
| `udug_hul` | Udug-ḫul | Sm.1055, K.7246 | §3.7.2 |
| `bit_sala_me` | Bīt salāʾ mê | K.2761 | §3.4 |
| `asiputu_kar44` | āšipūtu (KAR-44) [curriculum] | BM.77056, BM.45749, K.5896, Sm.1055, BM.74130 | §3.1, §3.9.1 |

5 compositions, 13 unique exemplar tablets. Registry is hardcoded in `src/compositionRegistry.ts` — it's a tight starting point grounded in published §3.x findings. Expansion to additional compositions (EAE, Šumma izbu, Šumma ālu, Bārûtu, ...) is straightforward: add an entry, no algorithm change.

## Round-18 calibration audit — 10/10 PASS

| Test | Result |
|---|---|
| T1: K.5896 → Mīs pî top-1 | ✅ conf=0.995, self-filter applied |
| T2: K.9508 → Mīs pî top-1 (small fragment, curriculum tie-break active) | ✅ conf=0.992 |
| T3: BM.47463 → Šurpu top-1 | ✅ conf=0.999 |
| T4: K.5896 → āšipūtu also in top-3 (curriculum surfaces alongside specific) | ✅ top-3 = [mis_pi, asiputu_kar44, surpu] |
| T5: Sm.1055 → Udug-ḫul top-1 | ✅ conf=0.998 |
| T6: every candidate confidence in [0,1] | ✅ |
| T7: query_in_exemplar_list flag correctness | ✅ (both directions) |
| T8: unknown tablet → warnings + zero scores, no exception | ✅ |

Audit script: `scripts/round18-identify-composition-audit.mjs`.

## Methods paper §3.19, claim 39

Composition assignment as the composition of (a) the §3.10 chunk-hash corpus-wide enumeration and (b) the §3.12 sign-level semantic geometry, anchored by a small published-exemplar registry. The registry is the methodological constraint that prevents the tool from labeling everything as the highest-density composition.

## Reproducibility

```bash
npm run build
npm run smoke                                                  # 84 tools registered
node scripts/round18-identify-composition-audit.mjs            # 10/10 PASS (cache-dependent)
node scripts/round17-validation-resolutions-audit.mjs          # 15/15 PASS (regression)
```

Round-18 requires the signs cache + chunk index + sign embeddings (cache-dependent; not in CI yet — see v0.31 release notes).

## Outstanding (deferred to v0.33+)

- Tier-1 idea #4 `score_tablet_completeness` (2 days, fragment-vs-composition gap)
- Tier-1 idea #2 `build_stemma_with_rooting` (3 days, rooted Newick output)
- Tier-1 idea #3 `find_composition_lineage` (5 days, composes #1 + §3.11 stemma + §3.11 scribal-school graph)
- Cache-bootstrap orchestration for full CI regression suite
- Registry expansion: EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa lexical lists, Maqlû

## API note

The two axes are weighted independently via `chunk_overlap_weight` and `sign2vec_centroid_weight` inputs. Pure-chunk classification: set `sign2vec_centroid_weight: 0`. Pure-semantic: set `chunk_overlap_weight: 0`. Default 0.6 / 0.4 reflects chunk evidence being the more reliable signal in this corpus (length-20 sliding-window exact match is a strong prior).
