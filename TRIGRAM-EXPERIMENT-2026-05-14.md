# Sign-trigram experiment — answering "can we build a real join finder?"
*Run date: 2026-05-14. Follows `VALIDATION-2026-05-14.md` (the lineToVec
benchmark that motivated this experiment).*

## Question

The lineToVec validation showed `find_join_candidates` recovers known eBL
joined siblings 3.4% of the time at top-15 — algorithm-as-published, faithful
TS port of `ebl-api/application/matches/line_to_vec_score.py`. Dane asked: is
it possible to do better?

Hypothesis: yes, by switching the signal. lineToVec encodes only line-break
structure over a 6-symbol alphabet (`START / TEXT_LINE / SINGLE_RULING /
DOUBLE_RULING / TRIPLE_RULING / END`). eBL's `signs` field contains the
actual cuneiform sign-list tokens — `ABZ151`, `ABZ406v2`, `ABZ85/ABZ84`, etc.
— with thousands of distinct values. A trigram-Jaccard scorer over `signs`
should discriminate far better than the 6-symbol alphabet allows.

## Method

`scripts/build-signs-index.mjs` — one ~26 s request to `/fragments/all-signs`
returns `{_id, signs}` for 36,498 transliterated fragments. Persisted as
`~/.cache/cuneiform-mcp/all-signs-full.json` (33 MB).

`scripts/validate-trigram.mjs` — apples-to-apples re-scoring of the EXACT
same 50 targets and 87 siblings from `validation-results.json`:

- Tokenize each fragment's `signs` string. Tokens are space-separated;
  newlines mark tablet-line boundaries; we generate trigrams **within
  lines** only (no boundary crossing). 35,579 fragments have ≥1 trigram.
- Score Jaccard between target trigrams and each candidate's trigrams.
- Sort and find each known sibling's rank.

`scripts/validate-matcher-trigram.mjs` — a fresh-sample run for stress
testing: seed=137, hunt for N=100 keepers from a re-shuffle of the corpus.
*Truncated at N=26 by an eBL outage* — HTTP started returning errors at
fetch=550 and continued to the cap. Independent confirmation, smaller N.

## Headline result

**Sign-trigram Jaccard recovers known siblings ~22% of the time at top-15 —
6-7× the lineToVec baseline of 3.4%.**

| | lineToVec (baseline) | Sign-trigram Jaccard |
|---|---|---|
| Algorithm | prefix/suffix overlap of 6-symbol line-break encoding | within-line trigram Jaccard over sign-list tokens |
| N=50 (seed=42, same targets/siblings) | 3 / 87 (3.4%) | **22 / 87 (25.3%)** |
| N=26 (seed=137, fresh sample, truncated) | — | **11 / 57 (19.3%)** |
| Median rank of known sibling | 7,154 / 36,328 | **89** (N=50) / 120 (N=26) |
| Mean rank | ~10,800 | 1,952 (N=50) |
| Scoring time (50 targets vs 36K) | 433 s | 2.5 s |
| Algorithm published by | eBL (`LineToVecRanker`) | this project |

## What trigram catches that lineToVec misses

19 sibling-pair recoveries in the N=50 run were trigram-only wins (lineToVec
ranked them outside the top-15, trigram brought them inside). Notable cases:

| Target | Sibling | Trigram rank | lineToVec rank | Likely category |
|---|---|---|---|---|
| `HS.2164` | `HS.1326` | 1 | 19,849 | physical join (paired Hilprecht-Sammlung pieces) |
| `HS.2739.B` | `HS.2739.AH` | 2 | 31,599 | sub-fragments of one tablet |
| `HS.2739.B` | `HS.2739.J` | 1 | 31,602 | sub-fragments of one tablet |
| `K.13973` | `K.5900` | 4 | 34,477 | likely join |
| `BM.50958` | `BM.51367` | 1 | 870 | parallel manuscript or join |
| `K.6211` | `Sm.1044` | 1 | 40 | close-miss in lineToVec; clean hit here |
| `K.20251` | `1879,0708.147` | 1 | 2,031 | likely parallel manuscript |

The `HS.2739.{B,AH,J}` cluster is the cleanest case: these are three labeled
sub-fragments of the same physical tablet (`HS.2739`). lineToVec couldn't
find them; trigram puts them at ranks 1-2. That's the kind of recovery the
matcher needs to do to be useful.

**Zero lineToVec-only wins.** Every sibling lineToVec found at top-15 was
*also* in trigram's top-15. There's no recall trade-off; trigram strictly
dominates on this signal.

## Why doesn't trigram find the remaining ~75% of siblings?

50.9% of siblings in the N=26 run (and 35.6% in N=50) score zero trigram
similarity to their target — no shared sign-trigram anywhere in the
fragments. These are pairs where:

1. The pieces fit physically but the break ran through different lines of
   text, so they share no overlapping sign sequence.
2. One piece is heavily damaged — many `X` (unreadable) tokens dilute the
   trigram set with non-discriminative entries.
3. eBL's `joins[]` includes some non-textual joins (envelope fragments,
   covered surfaces) where signs differ by design.

No text-similarity method can recover these. The next signal to try would be
image/edge geometry (real CV) or paleography — both substantially out of
scope for a hobby MCP project. The remaining gap is a property of the data,
not the algorithm.

## eBL's `joins[]` mixes physical joins with parallel manuscripts

Spot-checked while debugging: `Ist-A.7` and `VAT.10383` have *identical*
opening signs (`ABZ115 ABZ320 ABZ481 / ABZ115 ABZ320 ABZ481 / ...`). They're
two separate manuscripts of the same text, not pieces of one tablet. eBL's
`joins[]` field labels them as "joined" anyway. This explains part of the
trigram advantage: it excels at finding parallel manuscripts (which by
definition share many trigrams), and eBL's join data conflates parallels with
physical joins.

This doesn't change the practical answer to Dane's question — yes, building
a better matcher is possible, and the "better" version finds *both* parallels
*and* physical joins more reliably. But the headline number (25.3% recall@15)
is on a mixed set, and the pure-physical-join number is lower.

## Decision — ship as a separate tool

The new tool `find_parallel_text` ships alongside `find_join_candidates`.
Both stay because:

- `find_join_candidates` (lineToVec) reproduces eBL's published algorithm
  faithfully. Useful for cross-validation against eBL's hosted `/match`
  endpoint if/when Auth0 outreach succeeds (POLISH-QUEUE P2).
- `find_parallel_text` (trigram) is what an end-user actually wants — best
  measured recall on known siblings, 170× faster, no Auth0 needed.

Tool description on `find_parallel_text` is explicit: "~25% recall@15 on
known eBL joins — ~7.5× the lineToVec-based `find_join_candidates`. Use as
the primary parallel/join discovery tool; reserve `find_join_candidates` for
cross-validating against eBL's published algorithm."

## Limitations / honest framing

1. **The benchmark uses a single ground-truth source.** eBL's `joins[]` is
   curated by Assyriologists but conflates physical joins with parallel
   manuscripts. We're measuring against that — not against "true physical
   joins" alone.
2. **Trigram surfaces parallel manuscripts very aggressively.** For a user
   asking "is this a join?", many top-K hits will be parallels, not joins.
   The genres + joins enrichment lines on each hit help disambiguate, but
   the tool doesn't claim to discriminate.
3. **No filtering of `X` tokens or normalization of variants.** A future
   experiment could try filtering trigrams containing `X` and/or
   normalizing `ABZ406v2` → `ABZ406`. If recall jumps further, ship it; if
   it doesn't, current default stands.
4. **eBL outage on 2026-05-14 evening truncated the N=100 run** at N=26.
   Result still well above baseline; rerun for a fuller sample when
   `/api/fragments/<id>` is healthy again.

## Artifacts

| Path | What |
|---|---|
| `src/signsIndex.ts` | the index loader, trigram tokenizer, Jaccard |
| `src/index.ts` (tool 9) | `find_parallel_text` registration |
| `scripts/build-signs-index.mjs` | one-shot crawl of `/fragments/all-signs` |
| `scripts/validate-trigram.mjs` | apples-to-apples re-score vs N=50 baseline |
| `scripts/validate-matcher-trigram.mjs` | fresh-sample harness for stress testing |
| `trigram-results.json` | N=50 raw artifact (seed=42, against same targets as `validation-results.json`) |
| `trigram-validation-N100-seed137.json` | N=26 raw artifact (truncated N=100 run) |
| `~/.cache/cuneiform-mcp/all-signs-full.json` | 33 MB sign-corpus dump |
