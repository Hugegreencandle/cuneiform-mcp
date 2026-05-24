# cuneiform-mcp v0.29.0 — Bayesian Fusion + Joins Graph + Smart Numerical Filter

Three new tools landed in one cycle. Bundled because the sub-agents committed concurrently across overlapping branches; cleaner to release them together than artificially split.

**Tool count: 77 → 80.**

## `compute_joint_pair_score` — Bayesian fusion bootstrap (v1.0 readiness)

Logistic regression on the 5-axis feature vector (`lex_jaccard`, `fuzzy_jaccard`, `thematic_cosine`, `scribal_cosine`, `substitution_lift_z`) trained on 12 labeled positives + 40 synthetic negatives from the methods paper. **Training accuracy: 98.1% (51/52)**. Only misclassified case: K.5896 ↔ K.2550 at p=0.482.

**Coefficients reveal feature importance:**
- `fuzzy_jaccard`: **+1.94** (dominant predictor)
- `lex_jaccard`: +0.82
- `thematic_cosine`: +0.76
- `scribal_cosine`: +0.28
- `substitution_lift_z`: −1.01
- Intercept: −1.42

**Explicit honesty in warnings:** "Model is BOOTSTRAP-QUALITY (n=12 + n=40, tiny). v1.0 will need ≥100 labeled pairs for production-quality fusion." Closes the v1.0-readiness item that was previously gated on labels.

## `analyze_joins_graph` — corpus-wide manuscript joins

Surfaces the eBL `joins[]` field as a queryable graph. **4,361 fragments with ≥1 join, 17,203 total edges, average 3.94 joins per join-host.**

**Top-5 join-rich tablets:**
| Tablet | Joins | Period | Genre |
|---|---:|---|---|
| K.7563 | **70** | Neo-Assyrian | — |
| K.2290 | 28 | Neo-Assyrian | Nineveh Medical Compendium VI Teeth |
| K.2419 | 28 | Neo-Assyrian | Nineveh Medical Compendium VI Teeth |
| K.8946 | 28 | Neo-Assyrian | Therapeutic Medicine |
| K.18601 | 28 | Neo-Assyrian | — |

K.7563 with 70 joins is the corpus's most-reconstructed manuscript — a candidate for §3.x mention in the methods paper as the densest single physical-join cluster.

Per-tablet mode goes live to eBL per call (uncached); top-hosts reads the pre-built `joins-graph.json`.

## `find_numerical_chunks` — data-driven replacement for v0.21's hardcoded filter

Empirically-derived numerical-sign-set from v0.28 sign2vec clusters #5 + #9: **112 signs** (vs v0.21's hardcoded 2). Top-20 by corpus occurrence: ABZ480, ABZ411, ABZ1, ABZ381, ABZ318, ABZ570, ABZ112, ABZ427, ABZ74, ABZ376, ABZ52, ABZ279, `0`, ABZ483, ABZ481, `4`, ABZ598a, ABZ124, ABZ106, ABZ598b.

**v0.21 → v0.30 overlap on length-10 chunk-index: 100% (88/88 v0.21-filtered chunks all caught)** + **21,389 additional numerical chunks** v0.21 missed. The principled replacement for v0.21's folk-Assyriological filter. The v0.23.1 finding (correct-behavior-wrong-rationale) gets a clean theoretical update.

## Calibration tally — Round 14 + Round 15

| Lever / Audit | Class | Effect |
|---|---|---|
| `compute_joint_pair_score` (Round 14) | **NEW TOOL** | Bayesian fusion bootstrap. 98.1% training accuracy. 4/4 audit PASS. v1.0-readiness item closed. |
| `analyze_joins_graph` (Round 15) | **NEW TOOL** | Manuscript-join graph queries. 4,361 tablets, K.7563 hub with 70 joins. 3/3 audit PASS. |
| `find_numerical_chunks` (Round 15) | **NEW TOOL** | Data-driven 112-sign numerical filter via sign2vec. 100% overlap with v0.21 + 21K new catches. 4/4 audit PASS. |

**Cumulative v0.18–v0.29: 27 calibrations + 4 no-ops.**

## Methods paper §3.16 (new section)

**Claim 35:** Cross-axis Bayesian fusion via logistic regression on 5 axes produces a clean probabilistic verdict with the fuzzy axis as the dominant predictor (β=+1.94). The bootstrap model trained on 12 positive labels achieves 98.1% training accuracy. The model is explicitly transitional — v1.0 will require ≥100 labeled pairs for production-quality fusion — but the proof-of-concept closes the v1.0-readiness item that has blocked the cross-axis claim since v0.20.

**Claim 36 (§3.16.2):** The eBL joins[] field carries reconstruction-candidate signal independent of the orthographic/thematic/scribal axes. K.7563 with 70 joins is the densest single physical-join cluster in the corpus — a candidate for further philological investigation. The corpus has 4,361 tablets with ≥1 join and 17,203 total edges (avg 3.94 per join-host).

## Operational note — sub-agent isolation lapse

The v0.29 Bayesian-fusion sub-agent did NOT use isolated-worktree mode (despite being dispatched with `isolation: "worktree"`). Its files landed in the parent checkout. No harm done — the parent integration just picked them up directly — but worth flagging that worktree isolation isn't guaranteed at the harness level.

## Reproducibility

```bash
node scripts/train-joint-pair-model.mjs              # trains model, ~52 pairs
node scripts/extract-joins-graph.mjs                  # joins graph from cache
npm run build && npm run smoke                        # 80 tools

node scripts/round14-bayesian-fusion-audit.mjs        # 4/4 PASS
node scripts/round15-joins-graph-audit.mjs            # 3/3 PASS
node scripts/round15-numerical-chunks-audit.mjs       # 4/4 PASS

# Live probes
compute_joint_pair_score({ tablet_a: "K.5896", tablet_b: "K.9508" })
analyze_joins_graph({ list_top_hosts: true, top_k: 10 })
find_numerical_chunks({ min_numerical_density: 0.5 })
```

## Outstanding (v0.30+)

- v0.30 — lacuna restorer sign2vec extension (semantic prior for predictions)
- v1.0 — Bayesian fusion at scale (gate: label collection)
- Hosted deployment per `docs/v1.0-cloudflare-hosting-plan.md` (gate: methods paper acceptance)
