# Sign-variant normalization experiment — negative result
*Run date: 2026-05-14. Follows `TRIGRAM-EXPERIMENT-2026-05-14.md` (the 25.3%
recall@15 baseline that motivated this experiment).*

## Question

Polish queue P4: "Try sign-variant normalization — collapse `ABZ406v2` →
`ABZ406`, split `ABZ85/ABZ84` into two trigram variants. Could increase
recall by matching across paleographic variants of the same sign."

## Method

`scripts/validate-trigram-normalized.mjs` — apples-to-apples re-scoring of
the EXACT same 50 targets + 87 siblings used by the 25.3% trigram baseline
(`validation-results.json`).

Six variants tested against baseline:

| variant | rule |
|---|---|
| baseline | no normalization (re-confirms 25.3%) |
| `vN`-collapse | `ABZ406v2` → `ABZ406` |
| slash-split | `ABZ85/ABZ84` → emit trigrams for BOTH readings at that position (Cartesian product across 3-token window) |
| letter-suffix | `ABZ598a` / `ABZ598b` → `ABZ598` (stretch goal — not in original spec, added because the survey showed letter-suffix is a 6× larger lever than `vN`) |
| `nN`-variant | `ABZ377n1` → `ABZ377` (stretch goal, same rationale) |
| all-aggressive | every rule above combined |

## Token-shape survey (motivation for the variant matrix)

Before writing any normalization code I scanned the cached 36,498-fragment
sign corpus to ground the rule design in actual data:

| pattern | distinct tokens | total occurrences | example |
|---|---|---|---|
| bare `ABZ\d+` | — | 4,664,403 | `ABZ406` |
| `vN` suffix | 2 | 6,168 | `ABZ406v2`, `ABZ405v2` |
| slash form | — | 21,934 | `ABZ68/ABZ1` |
| letter suffix | — | 34,703 | `ABZ598a`, `ABZ129a` |
| `nN` variant | — | 18,255 | `ABZ377n1` |
| `+` compound | — | 12,774 | `ABZ100+063` |
| `X` (unreadable) | 1 | 382,973 | — |

First non-obvious finding: **`ABZ406` and `ABZ406v2` never co-occur in any
fragment, and `ABZ406` (bare) does not appear at all** — 1,888 fragments
contain `ABZ406v2` and zero contain `ABZ406`. So the `vN`-collapse rule, as
written, can only create new matches if some OTHER `ABZ\d+v\d+` token's bare
form is also separately present. The corpus has effectively only two `vN`
tokens, both with zero bare counterpart. Predicted impact: ~zero.

Second prediction: slash-split should be the highest-leverage rule on paper
(21,934 affected tokens, principled "the scribe was unsure between two
readings" semantics).

## Headline result

**None of the rules increase recall@15. The spec rules are zero-effect or
slightly negative.**

| variant                          | recall@15    | median rank | Δrecall vs base | Δmedian |
|----------------------------------|-------------|--------|---|---|
| baseline                         | 22/87 (25.3%) | 89  | +0 | +0 |
| `vN`-collapse                    | 22/87 (25.3%) | 89  | +0 | +0 |
| slash-split                      | 21/87 (24.1%) | 57  | **−1** | −32 |
| letter-suffix                    | 22/87 (25.3%) | 89  | +0 | +0 |
| `nN`-variant                     | 22/87 (25.3%) | 89  | +0 | +0 |
| all-aggressive                   | 21/87 (24.1%) | 57  | **−1** | −32 |

Per-sibling: the three pure-collapse rules (`vN`, letter-suffix, `nN`)
produce **zero rank changes anywhere in the 87-sibling set**. Slash-split
loses one hit: `K.18780 → K.9041` falls from rank 14 to 16 under the
expanded alternatives.

## Why this happened

The collapse rules' near-zero effect is the bigger surprise — the variant
forms exist (~60K occurrences across the corpus), they just don't sit
inside trigram windows that contain join evidence. Two compatible
explanations:

1. **Variant forms cluster by composition.** A given composition tends to
   use one paleographic variant consistently; its parallel manuscripts
   either share that variant (already matching, no rescue needed) or use
   a different reading entirely (collapse doesn't bridge them either).
2. **Variant forms appear mostly in damaged-edge contexts** where the
   surrounding two signs are `X` or fragmentary, making the resulting
   trigram unique-by-noise rather than unique-by-content. The collapse
   still produces no match because the other tokens in the trigram window
   are the discriminator, not the variant-bearing token.

The slash-split regression is more diagnostic. Cartesian-product expansion
inflates the `signs` index by ~1.2% (3,202,488 → 3,242,337 trigrams) but
that inflation is **uniform across all candidates**, including the noise.
At low absolute Jaccard scores (most near-misses live at j < 0.05), uniform
inflation moves the denominator faster than the intersection, demoting
genuine signal. The median rank drops because more candidates accumulate
non-zero scores in the mid-range — but that compression happens below the
top-15 threshold, so it doesn't help.

## Decision

**Shelved.** The polish-queue hypothesis is wrong for this corpus / this
validation set. The 25.3% baseline stands; `find_parallel_text` ships
without normalization.

Code lives at `scripts/validate-trigram-normalized.mjs` and the result
artifact at `trigram-normalized-results.json` — both kept for the record
in case someone wants to re-run on a different corpus split or with a
different signal.

## What's left

The polish queue's other open P4 items are still viable:
- **N=100 trigram validation** when eBL is healthy (would tighten the 19-25%
  confidence interval but won't change the algorithm).
- **Filter `X` tokens** — the 382,973 unreadable-sign occurrences are a
  much bigger lever than any variant-form rule. ~35% of known siblings
  score zero by trigram; if even a small fraction of those zeros are
  caused by `X`-trigram pollution, filtering would help. Worth trying.
- **Auth0 outreach for eBL** — cross-validating against the hosted
  matcher would tell us whether 3% is the algorithm's true ceiling.

The "split known joins by physical-vs-parallel" item still requires an
Assyriologist's review; out of hobby scope.
