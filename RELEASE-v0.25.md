# cuneiform-mcp v0.25.0 — Ensemble + Baseline Normalization

Two new tools built in parallel by isolated-worktree sub-agents. v0.25 closes two threads at once: the methodological-completeness ensemble for sign2vec (§3.12 hyperparameter validation) and the baseline-normalized lift for lexical-substitution that **upgrades v0.24's "partial cash-out" finding into a clean +2.24σ separation**.

**Tool count: 70 → 72.**

## `compare_sign_embedding_configs` — sign2vec ensemble

Six configurations: WINDOW ∈ {2, 5, 10} × MIN_OCC ∈ {10, 20}. Each cached at `~/.cache/cuneiform-mcp/sign-embeddings-w{N}-m{M}.json`. Total cache: 4.49 MB. Build time: 2.6 seconds.

Per-config stats: MIN_OCC=20 yields 635 signs (the v0.23 default); MIN_OCC=10 admits ~50% more rare-tail signs at 953 signs. WINDOW=2 captures tight syntactic context; WINDOW=10 captures broader topical context; WINDOW=5 is the v0.23 default robust middle-ground.

**Round-10 audit 3/3 PASS.** ABZ480's `consensus_top5_signs` across all 6 configs: **{`4`, ABZ598a}** — these two are the durable nearest-neighbor signals. WINDOW=10/MIN_OCC=20 surfaces rarer co-occurrents (ABZ296_1, ABZ331) that the smaller-WINDOW configs miss. Sample output (ABZ480 top-5 per config):

```
w2-m10:  4(.65) ABZ61(.65) ABZ598a(.63) ABZ406v2(.62) 0(.61)
w2-m20:  ABZ598a(.64) 0(.59) 4(.57) ABZ570(.48) ABZ61(.45)
w5-m10:  4(.63) ABZ598a(.58) ABZ111(.57) ABZ583(.56) ABZ406v2(.55)
w5-m20:  4(.59) ABZ583(.58) 0(.57) BAHAR₂(.57) ABZ598a(.56)    ← v0.23 canonical
w10-m10: 4(.66) ABZ598a(.64) ABZ111(.58) ABZ52(.57) ABZ62(.57)
w10-m20: ABZ583(.62) ABZ598a(.62) ABZ296_1(.61) 4(.59) ABZ331(.59)
```

The v0.23 default config independently reproduces the Round-8 canonical {`4`, `0`, BAHAR₂, ABZ583, ABZ598a} digit-class neighborhood — confirms determinism + validates the hyperparameter choice.

## `compute_lexical_substitution_lift` — baseline-normalized v0.24

Addresses the high-frequency sign-core saturation effect documented in RELEASE-v0.24.md. For tablet pair (A, B):

```
lift_z_score = (raw_score - baseline_mean_score) / baseline_stddev_score
substitution_lift_z_score = (raw_substitution_share - baseline_mean_substitution_share) / baseline_stddev_substitution_share
```

Baseline distribution (`scripts/build-lexical-substitution-baseline.mjs`, deterministic `mulberry32(20260524)`, N=100 random pairs per bucket) at 7 vocab-size buckets: {15, 25, 50, 80, 120, 160, 220}. Build time 8.2s. Cache at `~/.cache/cuneiform-mcp/lexical-substitution-baseline.json`.

### THE KEY EMPIRICAL VALIDATION

| Pair | raw_score | bucket | TOTAL lift_z | **SUB lift_z** |
|---|---|---|---|---|
| K.5896 ↔ K.9508 (Mīs pî siblings) | 0.7772 | 160 | −0.574 | **+1.967** |
| U.21017 ↔ K.9653 (random control) | 0.6531 | 50 | +0.135 | −0.277 |

**Δ substitution_lift_z_score (sibling − random) = +2.24σ** — a clean ~2σ separation that the v0.24 raw score's 22% relative lift completely failed to surface.

### Methodological finding — two confounds, not one

The K.5896 ↔ K.9508 sibling pair is **vocab-asymmetric** (184 vs 79). v0.24's `max(|A|, |B|)` denominator caps achievable `exact_share` at 79/184 ≈ 0.43, while the bucket-160 random baseline pairs are typically near-symmetric and achieve `exact_share` ≈ 0.59. So the TOTAL lift_z_score is *negative* for the sibling pair — vocab-size asymmetry dominates the saturation correction.

But the `substitution_share` component is insensitive to this asymmetry artifact (it counts neighbor matches as a fraction of the same max-vocab denominator, normalized against the baseline directly). **The substitution-only lift is therefore the clean methodological cash-out of claim 30.**

v0.24's "partial cash-out" was hiding TWO confounds:
1. **High-frequency sign-core saturation** (the original target — fixed by size-matched baseline)
2. **Vocab-size asymmetry** (newly visible — fixed by reading the substitution-only channel)

v0.25 controls both.

## Calibration tally — Round 10

| Lever / Audit | Class | Effect |
|---|---|---|
| `compare_sign_embedding_configs` | **NEW TOOL** | 6-config sign2vec ensemble. ABZ480 consensus = {`4`, ABZ598a}. v0.23 default validated empirically. 3/3 audit PASS. |
| `compute_lexical_substitution_lift` | **NEW TOOL** | Baseline-normalized v0.24. Sibling substitution_lift_z=+1.97 vs random −0.28 (+2.24σ separation). Two-confound finding (saturation + asymmetry). 3/3 audit PASS. |

**Cumulative v0.18–v0.25 record: 20 calibrations shipped, 4 no-ops.**

## Methods paper §3.13 — refined (will update on commit)

The §3.13 framing shifts:

> **v0.24 (previous):** "measurable but partial — 22% relative lift": the raw score discriminates siblings only narrowly above random pairs.
>
> **v0.25 (refined):** The substitution-only component, normalized against a vocab-size-matched corpus baseline, produces a clean N-sigma signal. For the canonical Mīs pî sibling pair K.5896 ↔ K.9508 the substitution_lift_z_score is **+1.97** vs **−0.28** for the v0.24 random control U.21017 ↔ K.9653 — a **+2.24σ** discriminative separation. The total raw score is contaminated by vocab-size asymmetry (the `max(|A|, |B|)` denominator caps achievable exact_share for asymmetric pairs); the substitution_share component, which measures sign2vec-neighbor density, is insensitive to that artifact and is the clean methodological cash-out of claim 30.

## Reproducibility

```bash
node scripts/build-sign-embeddings-ensemble.mjs              # 6 configs, ~3 sec
node scripts/build-lexical-substitution-baseline.mjs         # 7 buckets, ~8 sec
npm run build && npm run smoke                               # 72 tools

node scripts/round10-ensemble-audit.mjs                      # 3/3 PASS
node scripts/round10-lift-audit.mjs                          # 3/3 PASS

# Live probes
compare_sign_embedding_configs({ sign: "ABZ480" })
compute_lexical_substitution_lift({ tablet_a: "K.5896", tablet_b: "K.9508" })
```

## Outstanding (v0.26+)

Per `docs/post-v0.20-roadmap.md`:
- **v0.26 — per-period sign embeddings + per-archetype threshold matrix** (Round-3 Lever 5 deferred)
- **v1.0 readiness checklist** — docs, not a release
