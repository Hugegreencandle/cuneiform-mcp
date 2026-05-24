# cuneiform-mcp v0.24.0 — Lexical-Substitution Axis (Claim 30 Cash-Out)

The v0.23 §3.12 claim 30 promised that aggregating sign2vec sign-cosine into a tablet-pair-level "lexical-substitution score" would complement the existing lexical/fuzzy/thematic axes. v0.24 cashes it out as a single MCP tool and validates the claim empirically — with a productive nuance.

**Tool count: 69 → 70.**

## The new tool — `compute_lexical_substitution_score`

For tablet pair (A, B):
```
score = (exact_overlap + substitution_matches) / max(|A_vocab|, |B_vocab|)
```

Where `substitution_matches` = signs in A whose top-K sign2vec neighbors (cosine ≥ 0.4 default) appear in B's vocabulary. Captures the "same MEANING space, different SIGN TOKENS" case that exact-vocab Jaccard misses.

Optional `include_axis_comparison: true` enriches the output with the 4-axis `compareTabletPair` view (lex_J / fuzzy_J / thematic_cos / scribal_cos) so the substitution score can be read in the context of the other axes.

## Round-9 audit results — 4/4 PASS, but with a sharper finding than expected

| Test | Pair | Score | exact_share | substitution_share |
|---|---|---|---|---|
| Sibling positive | K.5896 ↔ K.9508 | **0.7772** | 0.4293 | **0.3478** |
| Self-pair sanity | K.5896 ↔ K.5896 | 1.0 | 1.0 | 0 |
| Unrelated control | U.21017 ↔ K.9653 | 0.6531 | 0.3673 | 0.2857 |

4-axis context for the K.5896 ↔ K.9508 sibling pair: `lex_J=0.1214 fuzzy_J=0.4048 thematic_cos=0.7964 scribal_cos=0.5011` — the fuzzy + thematic axes already discriminate the sibling relationship strongly.

### Substantive finding — claim 30 cashes out PARTIALLY

The claim that aggregated sign2vec produces a non-trivial substitution component is **empirically confirmed**: 0.3478 of the sibling-pair score comes from substitution rather than exact-vocabulary overlap.

But:
- **Unrelated control's substitution_share is 0.2857** — within striking distance of the sibling pair's 0.3478
- **Δ substitution_share = 0.0621** — only ~22% relative lift
- **Δ total_score = 0.1241** — the substitution axis adds real discrimination but smaller than fuzzy/thematic at the same comparison

Root cause: cuneiform corpora are dominated by a small high-frequency sign core (determinatives, common syllabograms, ABZ480 numerals) that appears nearly everywhere. Both exact-overlap AND sign2vec near-neighbors of those core signs saturate quickly across unrelated pairs, compressing the score range.

**Methodological refinement:** the lexical-substitution axis carries *complementary signal* (it's not noise — the sibling case clearly has more substitution content) but not *decisive signal* at the current corpus state. Best read alongside the thematic / fuzzy axes where the Δ-vs-baseline is substantially larger. The methods-paper §3.13 framing should be honest about this — "measurable but partial" rather than "the missing axis we needed".

A natural v0.25+ polish: lift-over-baseline normalization (subtract a corpus-wide expected baseline at matching vocab size). Recorded in the post-v0.20 roadmap.

## Calibration tally — Round 9

| Lever / Audit | Class | Effect |
|---|---|---|
| `compute_lexical_substitution_score` | **NEW TOOL** | Aggregates sign2vec to pair-level lexical-substitution score. Claim 30 cash-out. 4/4 audit PASS with documented "measurable but partial" empirical finding. |

**Cumulative v0.18 + v0.19 + v0.20 + v0.21 + v0.22 + v0.23 + v0.24 record: 18 calibrations shipped, 4 no-ops.**

## Methods paper §3.13 added

**Refined claim 30**: cashes out partially. Section frames the substantive finding honestly — the lexical-substitution axis is conceptually orthogonal and empirically detectable but not decisive at this corpus scale. The high-frequency sign-core saturation effect is identified as the root cause and recorded as a v0.25+ normalization candidate.

## Parallel-track operational work

Three enrichment bursts ran in this version cycle:
- **v0.23.0-alpha** (107 letter-prefixed targets): +8,632 entries, 73 failures (0.84%)
- **v0.24.0-alpha** (accession-number tablets, 1880,xxxx / 1881,xxxx / etc.): +1,771 entries, 0 failures
- **v0.24-tail** (cleanup pass): +18 entries from prior failures, 162 persistent failures (likely malformed/non-existent fragments)

Final fragment-metadata cache: **36,317 entries** (from a starting 247 → 146× growth across v0.20.0-alpha + v0.23.0-alpha + v0.24.0-alpha + v0.24-tail bursts).

## Reproducibility

```bash
# Pre-conditions: sign2vec index built (~/.cache/cuneiform-mcp/sign-embeddings.json from v0.23)
npm run build
npm run smoke                                                # 70 tools

# Round-9 audit
node scripts/round9-lexical-substitution-audit.mjs           # 4/4 PASS

# Live probe
compute_lexical_substitution_score({
  tablet_a: "K.5896",
  tablet_b: "K.9508",
  include_axis_comparison: true
})
```

## Outstanding (v0.25+)

Per `docs/post-v0.20-roadmap.md` + new v0.24 insights:

- **v0.25 — Lexical-substitution baseline normalization** (NEW addition): subtract a corpus-wide expected baseline at matching vocabulary size; the raw score's 22% discriminative lift is real but should be normalized for cleaner cross-pair comparison. Empirically motivated by the v0.24 high-frequency sign-core saturation finding.
- **v0.25 — sign2vec WINDOW + MIN_OCC ensemble** (original roadmap item)
- **v0.26 — per-period sign embeddings + per-archetype threshold matrix** (Round-3 Lever 5 deferred)
- **v1.0 readiness checklist** (docs only)
