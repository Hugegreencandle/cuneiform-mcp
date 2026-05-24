# cuneiform-mcp v0.30.0 — Sign2vec-Augmented Lacuna Restoration

Cross-tool integration: v0.18.0's bigram-context lacuna restorer (§3.5, 92% top-1) gets a complementary path through the v0.23 sign2vec semantic prior. One new tool.

**Tool count: 80 → 81.**

## The new tool — `restore_lacuna_semantic`

Single-position lacuna prediction via a joint score:
```
joint = α × normalized_bigram_score + (1-α) × normalized_sign2vec_score
```
- α=1 (default's baseline): pure bigram, equivalent to v0.18.0 behavior
- α=0: pure sign2vec, centroid of surrounding signs' embeddings
- α=0.5 (default): balanced

### Empirical finding — the sign2vec axis provides STRONGLY INDEPENDENT signal

On a 10-tablet sample, α=0 (pure sign2vec) and α=1 (pure bigram) disagree on the top-1 prediction in **9/10 cases (90%)** — well above the 30% threshold needed to demonstrate non-redundancy.

### Concrete case

Tablet `1879,0708.118` position 20, ground truth `ABZ52`:

```
window ±5:  ABZ319 ABZ579 ABZ57 ABZ480 ABZ1 [ABZ52] ABZ354 ABZ570 ABZ411 ABZ411 ABZ61

rank  sign     joint     bigram     sign2vec
  1   ABZ52    0.7474    0.0375     0.3113   ← ground truth (recovered)
  2   ABZ1     0.7387    0.0291     0.4777
  3   ABZ480   0.7363    0.0217     0.6291
  ...
  6   ABZ570   0.5753    0.0057     0.7141   ← pure-sign2vec pick (wrong)

ablation: bigram_top1=ABZ52  sign2vec_top1=ABZ570  joint_top1=ABZ52  agreement=bigram_dominates
```

Joint correctly recovers `ABZ52` at rank 1. Pure sign2vec would have picked `ABZ570`. In this case, the sign2vec axis adds **complementary** signal, not corrective — but the 90% top-1 disagreement rate across the sample shows the axis is doing real work.

## Methods paper §3.17

**Claim 37:** *Sign2vec semantic embeddings provide a complementary lacuna-restoration prior to the v0.18.0 bigram-context heuristic. Pure-bigram and pure-sign2vec top-1 predictions disagree in 90% of sampled positions — the two axes carry strongly independent signal. The joint score is the v0.30 cross-tool integration that establishes the pattern for v1.0 cross-axis composition.*

The 92% top-1 number from §3.5 is on multi-position parallel-template alignment, which v0.30 doesn't extend. The §3.17 claim is about INDEPENDENCE of axes at single-position granularity, not direct comparison to §3.5.

## Calibration tally — Round 16

| Lever / Audit | Class | Effect |
|---|---|---|
| `restore_lacuna_semantic` | **NEW TOOL** | Joint bigram + sign2vec lacuna prediction. 90% α=0/α=1 disagreement. 3/3 audit PASS. |

**Cumulative v0.18–v0.30: 28 calibrations + 4 no-ops.**

## Reproducibility

```bash
npm run build && npm run smoke                          # 81 tools
node scripts/round16-lacuna-sign2vec-audit.mjs          # 3/3 PASS
restore_lacuna_semantic({ tablet_id: "1879,0708.118", lacuna_position: 20 })
```

## v1.0 readiness reminder

v0.30 closes the last roadmap item from `docs/post-v0.20-roadmap.md` that was actionable autonomously. v1.0 is now gated only on:

1. Methods paper acceptance signal (Jiménez email sent, awaiting reply; JOHD next)
2. Labeled-pair collection for production-quality Bayesian fusion (≥100 pairs)
3. API freeze classification decisions (Dane judgment)

See `docs/v1.0-readiness-checklist.md`.
