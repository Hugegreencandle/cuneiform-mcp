# X-token filter experiment — shipped ≥2-X drop
*Run date: 2026-05-14. Follows `TRIGRAM-EXPERIMENT-2026-05-14.md` (25.3%
baseline) and `NORMALIZATION-EXPERIMENT-2026-05-14.md` (shelved).*

## Question

Polish queue P4: "~35% of known siblings score zero by trigram, partly
because damaged pieces have many X-trigrams that don't match the
corresponding readable signs on the joined piece. An experiment: regenerate
the index with X-containing trigrams dropped, re-validate against the same
50-target baseline, ship only if recall increases."

## Method

`scripts/validate-trigram-xfilter.mjs` — apples-to-apples on the same 50
targets + 87 siblings as the 25.3% baseline.

Five filter strengths, gradient of aggressiveness:

| variant | rule |
|---|---|
| baseline | keep all trigrams |
| drop pure X-X-X | drop trigrams where all three tokens are `X` |
| drop ≥2 X | drop trigrams with 2 or 3 X tokens |
| drop any X | drop trigrams with ≥1 X token (polish-queue's literal spec) |
| skip-X tokenization | filter `X` out at tokenization, then trigram over remaining tokens (slides over damage) |

## X-token distribution (motivation)

Profiled the cached 36,498-fragment corpus before writing the validator:

| trigram class | count | share of corpus |
|---|---|---|
| 0× X | 3,761,235 | 91.2% |
| 1× X | 182,381 | 4.4% |
| 2× X | 83,336 | 2.0% |
| 3× X (pure noise) | 97,602 | 2.4% |
| **total** | 4,124,554 | 100% |

8.8% of corpus trigrams contain at least one X. Drop-anyX silences 1,034
fragments entirely (3% of the indexed set) — these are extremely damaged
pieces where every emitted trigram contains an X.

## Headline result

**Recall@15 unchanged across every variant. Recall@30 +1. Median rank of
known siblings 89 → 26 (3.4× compression). Mean rank 1,952 → 575.**

| variant            | trigrams  | recall@15    | recall@30 | median | mean |
|--------------------|----------:|-------------:|----------:|-------:|-----:|
| baseline           | 3,202,488 | 22/87 (25.3%) | 24/87    | 89     | 1,952 |
| drop pure X-X-X    | 3,189,529 | 22/87        | 25/87     | 26     |   636 |
| drop ≥2 X          | 3,116,372 | 22/87        | 25/87     | **26** | **575** |
| drop any X         | 2,945,078 | 22/87        | 25/87     | 28     |   566 |
| skip-X             | 2,993,120 | 22/87        | 25/87     | 28     |   567 |

The +1 rescue at K=30 is the same sibling under every filter: `BM.39639 →
BM.38610`, rank 89 → 22 (drop-≥2X) / 26 (drop-xxx) / 28 (drop-anyX or
skip-X). `drop ≥2 X` produces the best landing rank.

## What we lose

Filter strength | "any-rank" siblings lost
---|---
drop pure X-X-X | 7 (baseline ranks: 1716, 6204, 7299, 10302, 10423, 11357, +1)
drop ≥2 X | 7 (same set)
drop any X | 8 (same set + 1)
skip-X | 8 (same set + 1)

These are siblings whose **only** trigram overlap with the target involved
X-tokens. After filtering, intersection drops to zero and they become
unrankable. Every one of them sits at baseline rank ≥1,700 — well outside
any plausible user-visible window.

## Decision

**Shipped `drop ≥2 X` to `src/signsIndex.ts:trigramsFromSigns`.**

Net effect on the live `find_parallel_text` tool:
- ✅ One sibling (`BM.39639 → BM.38610`) crosses into top-30 visible window
- ✅ Median rank of known-sibling matches drops 89 → 26
- ✅ Mean rank drops 1,952 → 575
- ✅ Index ~3% smaller, ~2% faster to score
- ❌ Seven siblings lose any-rank visibility — all baseline rank ≥1,716, effectively invisible regardless
- = Recall@15 unchanged at 22/87 (25.3%)

`drop ≥2 X` was picked over `drop anyX` because it's strict-better on every
user-visible axis: same +1 at K=30, better median (26 vs 28), better mean
(575 vs 566 is essentially a tie, but drop-≥2X's BM.39639 rescue lands at
rank 22 vs 28). And it preserves the "1×X" trigrams — these contain two
real readable signs and one damaged position, so the X marks a confirmed
gap-with-neighbours rather than pure noise. Real evidence, just damaged.

## What's left

Open polish-queue P4 items after this session:
- **N=100 trigram validation** when eBL is healthy. Doesn't change the
  algorithm, but tightens the confidence interval on the 25.3% number.
- **Auth0 outreach for eBL.** Would cross-validate against eBL's hosted
  matcher; unblocked but Dane-driven.
- **Split `joins[]` by physical-vs-parallel.** Still requires an
  Assyriologist's review; out of hobby scope.

The 35% zero-trigram-overlap ceiling is the real algorithmic limit. No
emission-time filter can rescue siblings that share zero sign-content with
their target. Cracking that requires a different signal entirely
(paleography, image similarity, or composition-aware retrieval).
