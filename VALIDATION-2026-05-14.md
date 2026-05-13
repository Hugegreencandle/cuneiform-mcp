# Validation — `find_join_candidates` on the full 36,328-fragment corpus
*Run date: 2026-05-14. Corpus snapshot: `~/.cache/cuneiform-mcp/fragments.jsonl`,
36,328 fragments with non-empty `lineToVec` (crawl finished 2026-05-14 00:10
JST, day after v0.3 ship).*

## Question

`find_join_candidates` reproduces eBL's `LineToVecRanker` locally. Yesterday's
v0.3 demo ran against 1,419 fragments (≈4% of the transliterated set) and
surfaced one plausible-looking sister cluster (`BM.122625` and `BM.122629`
both pointing at `1881,0204.196`). With the full corpus now crawled — does
the matcher actually recover known physical joins?

## Method

`scripts/validate-matcher.mjs`:

1. Load the 36,328-fragment corpus from JSONL (same code path as the live tool).
2. Seeded Fisher-Yates shuffle over the eligible pool (lineToVec with ≥3 entries
   on at least one surface).
3. Fetch `/fragments/<id>` with concurrency=5 for each candidate; extract
   declared `joins[]`. Keep only candidates whose joins[] contains at least
   one *other* fragment that is also in the local corpus (a sibling we have
   *any chance* of finding). Hunt continues until N keepers found.
4. For each keeper, score against every other fragment in the corpus using the
   same `scoreBoth` the live tool uses. Record where each known sibling lands
   in both the raw and ruling-weighted rankings.
5. Aggregate recall@15 plus rank distribution.

Two runs: N=7 keepers (sanity-check, 360 fetches) and N=50 keepers (1,497
fetches). The N=50 numbers are what's reported below — N=7 came in at 7.1%
recall@15 but the sample was too small to trust.

## Headline

**The matcher recovers known joined siblings 3.4% of the time at top-15.** It
is, as the P1 rename already conceded, a structural-similarity ranker — not a
join finder.

| Metric | Value |
|---|---|
| Targets evaluated | 50 |
| Targets fetched | 1,497 (base rate ≈3.3% have any in-corpus sibling) |
| Known siblings present in corpus | 87 |
| recall@15 raw | **3 / 87  (3.4%)** |
| recall@15 weighted | 3 / 87  (3.4%) — same three hits |
| recall@15 either | 3 / 87  (3.4%) |
| Per-target recall@15 | 3 / 50  (6.0%) |
| Median rank of known sibling (raw) | 7,154 / 36,328 |
| Mean rank (raw) | ~10,800 |

### Rank distribution of the 87 known siblings (raw scoring)

| Bucket | Count | % |
|---|---|---|
| top-15 | 3 | 3.4% |
| 16–50 | 2 | 2.3% |
| 51–100 | 0 | 0.0% |
| 101–500 | 7 | 8.0% |
| 501–1,000 | 4 | 4.6% |
| 1,001–5,000 | 23 | 26.4% |
| 5,001–10,000 | 13 | 14.9% |
| beyond 10,000 | 35 | **40.2%** |

The long tail dominates: 40% of known siblings rank below position 10,000.
That isn't a ranking failure mode — it's the algorithm telling us those pairs
share no overlapping prefix or suffix in their `lineToVec` encoding, so they
score zero or near-zero regardless of being physically joined.

### The 3 successful hits

| Target | Sibling | Rank (raw) | Rank (weighted) |
|---|---|---|---|
| `Ist-A.7` | `VAT.10383` | 1 | 1 |
| `K.6206` | `K.2416` | 1 | 1 |
| `K.10669` | `K.12066` | 11 | 11 |

All three are also #1 in *both* rankings (with one exception at #11), which
suggests when the algorithm does find a join, the signal is strong. Failure is
the dominant mode, not weak signal.

## Why recall is this low — three reinforcing causes

### 1. `lineToVec` coverage is incomplete

eBL `/api/statistics` reports 36,583 transliterated fragments today.
`/fragments/all-signs` returns 36,493 IDs. Our cache holds 36,328 with
non-empty `lineToVec`. So roughly **250 fragments are transliterated but have
no `lineToVec` encoding at all**.

Crucially, this gap concentrates in joined fragments. Spot-checked:

- **K.2862 cluster** (4 pieces, declared join `K.02862+K.02868+K.05065.A+Rm.0111`):
  the target has lineToVec, but K.2868, K.5065.A, and Rm.111 all have **empty
  `lineToVec`** despite eBL holding 28-line transliterations of K.2868. None of
  the three are in `/fragments/all-signs`.
- **BM.122625 cluster** (3 pieces): same picture — siblings BM.122651 and
  BM.123380 are not in our corpus.

The validation harness explicitly filters siblings to those in the corpus
before computing recall, so the 3.4% already accounts for this. The harder
version of the question — "of all known joined pairs, how many does the
matcher find?" — is much lower than 3.4%, because the matcher can't even see
the un-encoded fragments.

### 2. Even pairs that have `lineToVec` rarely overlap structurally

Physical joins frequently meet on broken edges that interrupt the line
structure: one piece has the top of the tablet (with rulings), another has
the middle (text-only), a third has the bottom. Their `lineToVec` sequences
are different cross-sections of a tablet and don't share a prefix or suffix.
The algorithm scores by prefix/suffix overlap of `(START, TEXT_LINE,
SINGLE_RULING, DOUBLE_RULING, TRIPLE_RULING, END)` sequences — so two
fragments of the same physical tablet can score zero against each other.

### 3. Yesterday's apparent wins were small-corpus artifacts

Re-running BM.122625 against the full corpus, its old #1 weighted candidate
`1881,0204.196` is gone from the top-5 entirely. The new top-5 is `K.2862,
IM.67597, IM.67587, IM.67547, IM.77027` — completely different fragments. The
match yesterday wasn't a discovery of a hidden sibling; it was the only
plausible-looking row in a sparse 1,419-fragment ranking. With 36,328
candidates competing, the noise floor moves a lot.

This is the most embarrassing finding. The session log entry calling the
BM.122625/BM.122629 result "strong signal they form a multi-piece join group"
should be treated as withdrawn; neither fragment has any in-corpus sibling
declared at eBL, so there was nothing to find.

## What the algorithm *is* good for

Looking at the cases that scored highly even when they weren't joins — the
matcher reliably surfaces:

- Parallel manuscripts of the same composition. Many of K.2862's top hits
  (K.2362, IM.77027, VAT.9304) are other manuscripts of the same
  literary/magical text, not physical joins.
- Fragments with similar genre + script that conform to the same
  composition's columnar structure.

In other words: the "structural similarity ranker" rebrand from P1 is
correct, and the tool's current description (which already says "not all hits
are joins") is accurate. It's a parallel-manuscript ranker that occasionally
also finds a join.

## Suggested follow-up actions

These are deliberately *suggested*, not committed — Dane to choose.

1. **Surface this in the README and tool description.** Add a one-paragraph
   "Performance" section saying "recovers known joins ~3% of the time at
   top-15; works best as a parallel-manuscript ranker." Honest framing matters
   more than the small marketing cost.

2. **Send the Auth0 outreach (POLISH-QUEUE P2).** Cross-validating against
   eBL's hosted `/match` endpoint would confirm the algorithm port is faithful
   to upstream, not lossy from a TS porting bug. If eBL's own `/match` returns
   the same ~3% recall, the algorithm itself is the limit. If it returns
   notably higher, there's a port bug to find. (Hypothesis: the numbers will
   match. The `lineToVecScore.ts` port is direct.)

3. **Don't try to improve the matcher.** This is the published algorithm from
   `ebl-api/application/matches/line_to_vec_score.py`. Improving it would mean
   inventing a different algorithm, which is beyond a hobby MCP project — and
   the better signal is the obvious one: encode `lineToVec` for the ~250
   transliterated fragments that don't have it. That's a project for the eBL
   team, not us.

4. **Add a second crawl pass that covers the all-signs gap.** Crawl every
   joined fragment in the corpus's `joins[]` arrays even if the museum number
   isn't in `/fragments/all-signs`. Most will have empty lineToVec (matching
   K.2868), but a handful might. Cost: ~1,000 extra HTTP requests, ~3 minutes.

## Artifacts

| Path | What |
|---|---|
| `scripts/validate-matcher.mjs` | the harness (Phase 1 fetch + Phase 2 score + Phase 3 aggregate) |
| `scripts/inspect-target.mjs` | one-target diagnostic (used to verify K.2862's siblings have empty lineToVec) |
| `validation-results.json` | full N=50 results — per-target sibling ranks + raw/weighted scores |
| `VALIDATION-2026-05-14.md` | this writeup |

To rerun: `node scripts/validate-matcher.mjs <N-keepers> <seed> <top-k> <max-fetch-cap>`.
Defaults: `30 42 15 360`. The N=50 run used `50 42 15 3000`.
