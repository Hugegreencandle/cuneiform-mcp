# cuneiform-mcp v0.36.0 — Damaged Passage Composition Probability

First Tier-2 item from `docs/v0.31-plus-upgrade-ideas.md` (#7, ~5 days estimated). Composes v0.30 lacuna restorer + v0.32 composition registry + v0.20 chunk index + v0.23 sign2vec.

**Tool count: 87 → 88.**

## The new tool — `damaged_passage_composition_probability`

Probabilistic composition classifier with two innovations over v0.32 `identify_composition`:

1. **Raw signs input** — accepts a space-separated signs string (with X/x/? as damage markers), not just corpus-resident tablet_ids. Hand-transliterated passages are directly classifiable.
2. **Restoration marginalization** (opt-in) — for each X position, the centroid uses a weighted mixture of v0.30 lacuna-restorer top-K predictions rather than dropping the position. Damage contributes partial mass instead of zero.

Output is a softmax probability distribution + Shannon entropy as uncertainty metric.

## Two scoring axes (mirror v0.32 normalization)

| Axis | Source | Active when |
|---|---|---|
| `sign2vec_centroid` | v0.23 — query centroid vs each composition's pool centroid (self-filtered) | always (when sign embeddings loaded) |
| `chunk_overlap` | v0.20 — max shared chunks across non-self exemplars, normalized over candidates | only when `tablet_id` provided |

Self-filter: if the query is a registered exemplar of composition C, it's excluded from C's pool before scoring (matches v0.32 logic — without this, K.5896 was misclassified as `asiputu_kar44` because both pools contained it).

Chunk normalization: `chunk_norm = chunk_raw / max(chunk_raw across all candidates)`. Without this, smaller-pool compositions (Šurpu/Bīt salāʾ mê) got inflated ratios on the "fraction of canonical chunks" denominator.

## Restoration marginalization

When `marginalize_restorations=true` and the input has damage tokens:

```
for each X position:
  call v0.30 restore_lacuna_semantic, top-K predictions with joint_score weights
  fuzzy_sign_vector = sum_{p in predictions} (joint_score[p] / sum_weights) * embedding[p]
  centroid += fuzzy_sign_vector
```

Each damage position contributes a weighted mixture of plausible restorations rather than being dropped. Reported in `uncertainty.restoration_marginalization_applied` + `uncertainty.restored_positions_used`.

## Round-22 calibration audit — 16/16 PASS

| Test | Result |
|---|---|
| T1: K.5896 → mis_pi top probability | ✅ p=0.989 (top2 p=0.002) |
| T2: probabilities sum to 1.0 (softmax) | ✅ sum=1.000000 |
| T3: K.9508 (small fragment) → mis_pi top | ✅ |
| T4: raw signs input produces candidates, chunk_overlap disabled | ✅ |
| T5: lacuna_density = 3/5 = 0.6 on "ABZ480 X X ABZ411 X" | ✅ |
| T6: temperature=1.0 entropy > temperature=0.01 entropy | ✅ 2.272 > 0.000 |
| T7: curriculum tie-break (within 0.02 prefer specific) | ✅ vacuous: p_gap=0.987 |
| T8: marginalization flag honored + still classifies K.5896 → mis_pi | ✅ 51 X positions marginalized |
| T9: empty input → warnings + uniform distribution | ✅ |
| T10: entropy ≤ log2(n_compositions) | ✅ 0.110 ≤ 2.322 |

Audit: `scripts/round22-damaged-passage-composition-audit.mjs`. Cache-dependent.

Regression rounds 17 + 18 + 19 + 20 + 21: all PASS.

## Methodological finding surfaced by initial audit failures (§3.23)

The initial audit had K.5896 misclassifying as `asiputu_kar44` (curriculum) instead of `mis_pi`. Root cause traced to two algorithmic bugs in the first implementation:

1. **No self-filter.** K.5896 is in BOTH the Mīs pî and the āšipūtu-curriculum exemplar pools. Without filtering K.5896 from its own pools before scoring, both compositions got K.5896's own signal as a contribution — and the curriculum (broader vocabulary) won.
2. **Wrong chunk-overlap normalization.** Using "fraction of canonical chunks covered" (denominator = canonical_chunks_count) gave smaller-pool compositions (Šurpu, Bīt salāʾ mê) inflated scores — denominators of 31 vs Mīs pî's 152 made it trivially easier to hit high ratios on the small compositions.

v0.32 identify_composition got both right; v0.36 now matches its algorithm and the failures resolve cleanly (K.5896 → mis_pi at p=0.989, K.9508 → mis_pi). Methods paper §3.23 records the calibration insight: when composing compositions with overlapping exemplars, self-filtering on the query is necessary, and chunk-overlap must be normalized across candidates rather than within a composition's exemplar pool.

## Methods paper §3.23, claim 43

**Claim 43.** *Probabilistic composition classification for damaged passages must (a) accept raw signs strings to support hand-transliterations, (b) self-filter the query from registered exemplar pools when it appears there, (c) normalize chunk-overlap across candidates not within a candidate's pool, and (d) optionally marginalize damage positions over lacuna-restorer top-K predictions to recover partial centroid mass. Shannon entropy of the softmax distribution provides a calibrated uncertainty metric: 0 = certain, log2(N_compositions) = uniform. K.5896 (1.4% damage) yields entropy=0.110 bits and p(mis_pi)=0.989; the v0.32 algorithm with self-filter and cross-candidate chunk normalization is the load-bearing piece.*

## Reproducibility

```bash
npm run build
npm run smoke                                                  # 88 tools registered
node scripts/round22-damaged-passage-composition-audit.mjs     # 16/16 PASS
# Regression: rounds 17-21 all unchanged
```

## API contract

- One of `{tablet_id, signs}` is required.
- `marginalize_restorations` defaults to false (cheap path). When true, each X position triggers a v0.30 lacuna call (~10ms per X with sign embeddings loaded); for high-damage fragments this can be slow.
- `restoration_top_k` defaults to 5. Higher values smooth the centroid mixture; lower values commit harder to the top restoration.
- `temperature` defaults to 0.1 (sharp distribution). Set to 1.0+ for a flatter ranking-aware probability distribution.

## Outstanding (deferred to v0.37+)

- **Tier-2 #6** `compare_clusters_v2` — multi-axis cluster comparison with v0.26 per-archetype thresholds
- **Tier-2 #8** `bayesian_fusion_at_scale` — production Bayesian retrain once validation-resolutions store accumulates positives. Depends on user feedback loop activation.
- **Tier-3 #11** `find_sign_glyph` — Unicode glyph lookup (1 day, pure data, no novel methodology)
- **Tier-4 #13** — extend CI to run the cache-dependent regression suite (needs cache-bootstrap orchestration)
- Registry expansion: EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa, Maqlû
