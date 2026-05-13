# SPEC v0.3 — `find_join_candidates` (local reimplementation)

**Status:** Draft, 2026-05-13. Owner: Dane. Implements the last stub
in `cuneiform-mcp` without depending on eBL Auth0 access.

**Why local:** eBL's `/fragments/{n}/match` returns 403 to anonymous
callers and requires the `transliterate:fragments` scope. Both the
algorithm and its inputs are open, so we can reproduce the match
in-process. Outreach for an Auth0 grant remains an option (see
`AUTH0-OUTREACH-DRAFT.md`), but this spec assumes we never get one.

---

## 1. Algorithm — what we're actually reproducing

The deep-dive brief called this an "ngram match against the `signs`
field." **That's wrong.** Reading the live source on
`ElectronicBabylonianLiterature/ebl-api@master`, the matcher uses an
entirely different approach:

### Input: `lineToVec`

Each fragment exposes a field `lineToVec` (top-level, openly readable
via `GET /fragments/{n}`) shaped as a tuple of tuples of small ints.
Each inner tuple is one "side" or "surface" of the tablet (obverse,
reverse, edge). Each int is one of 6 structural tokens:

| int | meaning              |
|-----|----------------------|
| 0   | START                |
| 1   | TEXT_LINE            |
| 2   | SINGLE_RULING        |
| 3   | DOUBLE_RULING        |
| 4   | TRIPLE_RULING        |
| 5   | END                  |

Source: `ebl/fragmentarium/domain/line_to_vec_encoding.py`. Empty for
fragments with no transliteration entered yet — these can be skipped.

Live samples I verified:
- `BM.41255.C` (12 text lines, no rulings) → `[[1,1,1,1,1,1,1,1,1,1,1,1]]`
- `VAT.4936`   (two-sided, 10 + 5 text lines)     → `[[1,1,1,1,1,1,1,1,1,1],[1,1,1,1,1]]`

### Scoring: longest suffix/prefix overlap (both directions)

Source: `ebl/fragmentarium/application/matches/line_to_vec_score.py`.

For two fragments A and B, both with `lineToVec = [seq, seq, ...]`:

1. For every (seqA, seqB) pair across the two fragments — and also
   for every pair with seqA / seqB reversed — compute all overlaps
   where the suffix of the shorter sequence equals the prefix of the
   longer (or any aligned interior match).
2. `score(A, B) = max length` of any such overlap.
3. `score_weighted(A, B) = max sum-of-weights` over the same overlap
   set, with weights:
   - `START` = 3, `END` = 3
   - `TEXT_LINE` = 1
   - `SINGLE_RULING` = 3
   - `DOUBLE_RULING` = 6
   - `TRIPLE_RULING` = 10

Why this works for joins: physical tablet fragments that join share a
broken edge. The `lineToVec` captures the structural rhythm (text
lines + rulings) across that edge. Aligning fragment A's bottom rhythm
to fragment B's top rhythm finds plausible joins. Rulings score more
because they're rare and diagnostic; plain text lines are common
filler.

### Output: top 15 by each score

`LineToVecRanker` keeps the top 15 ranked by `score` (unweighted) and
the top 15 ranked by `score_weighted`. Returns both lists. Excludes
the candidate fragment itself.

---

## 2. Architecture

```
                  ┌─────────────────────────────────┐
                  │  cuneiform-mcp process (Node)   │
                  │                                 │
   user query ──> │   find_join_candidates(museumN) │
                  │     │                           │
                  │     ▼                           │
                  │   ensure_corpus_loaded() ──────►│── (one-time crawl)
                  │     │                           │      eBL /fragments/query (paginate)
                  │     ▼                           │      → ~21K fragments
                  │   load_one(museumN)             │      → JSONL on disk
                  │     │                           │      → in-memory index on warm load
                  │     ▼                           │
                  │   score_all_pairs(this, all)    │   ← O(N × m × n), but m,n typically ≤ 50
                  │     │                           │
                  │     ▼                           │
                  │   format_top_15 unweighted +    │
                  │   format_top_15 weighted        │
                  └─────────────────────────────────┘
```

### 2a. The crawl (one-time + incremental)

eBL doesn't publish a bulk dump for fragments. We have to paginate the
search endpoint. From source (`FragmentRepository.ts`) the search
takes `latest=true` and is paginated via `limit` — there's also a
`/fragments/latest` for the most recent additions.

**Plan:** crawl `/fragments/query?latest=true&limit=200` from page 1,
walking forward by adjusting any returned cursor/`search_after` token
(eBL pager returns one). Store each fragment's
`{museumNumber, lineToVec, designation}` as a JSONL line. Throttle
to ~5 req/s. Resumable via the last-seen museum number on disk.

**Initial cost:** ~21,200 fragments / 200 per page = ~106 requests.
At 5 req/s that's ~21 seconds of network + however long eBL takes
per page (recall transliteration queries can be ~8 s; expect 30–90 s
total for a cold crawl).

**Incremental sync:** on each run, hit `/fragments/latest`. If any
returned fragment isn't in the local cache (by museum number), pull
that one record and append. Cheap. Run on every MCP startup OR every
N days — see Open Q4.

**Storage size estimate:** each line is `{museumNumber: "Prefix.Number
.Suffix", lineToVec: [...], designation: "..."}`. Mean line ≤ 300 B.
Total: ~6 MB JSONL on disk. Negligible.

### 2b. In-memory representation

```ts
type Side = number[];           // e.g. [1,1,2,1,1,1,5]
type LineToVec = Side[];        // one entry per inscribed surface

type FragRecord = {
  museumNumber: string;         // "BM.41255.C" canonical form
  lineToVec: LineToVec;
  designation?: string;
};

let corpus: FragRecord[] | null = null;  // populated lazily
```

### 2c. Scoring kernel

Port `compute_score`, `list_of_overlaps`, `score`, `score_weighted`,
`weight_subsequence` from `line_to_vec_score.py` to TypeScript. The
Python uses `pydash.flatten` and `itertools.product` — both trivial
to inline in JS. ~60 lines of TypeScript total.

### 2d. Indexing — almost certainly not needed at this scale

A naive scan over 21K fragments per query is ~21K × O(m·n) where m,n
are sequence lengths. Median m,n is small (typical lineToVec inner
length 5–50). Upper-bound back-of-envelope: 21K × 50 × 50 = 52M
operations — sub-second on Node 24 even without optimisation. Skip
indexing for v0.3. Revisit only if anyone complains.

### 2e. Cache location decision (Open Q1)

Three options, none of them clearly best:
1. `~/.cache/cuneiform-mcp/fragments.jsonl` — XDG-compliant on Linux,
   Mac uses `~/Library/Caches/`. Cross-user safe.
2. `~/Desktop/cuneiform-mcp/cache/fragments.jsonl` — colocated with
   the codebase. Easy to inspect / wipe.
3. `process.env.CUNEIFORM_MCP_CACHE_DIR` with a sensible default.
   Most flexible; what most production MCP servers do.

I lean toward #3 with default `~/.cache/cuneiform-mcp/` on Mac/Linux.

---

## 3. Tool surface

```ts
server.registerTool("find_join_candidates", {
  description:
    "Find fragments that may physically join a target eBL fragment, " +
    "using the same lineToVec scoring algorithm as eBL's /match endpoint " +
    "(reproduced locally — no Auth0 required). Returns top 15 by raw " +
    "score and top 15 by ruling-weighted score.",
  inputSchema: {
    museum_number: z.string().min(1).describe(
      "eBL museum number, e.g. 'K.1', 'BM.41255C' (auto-normalized)."
    ),
    weighted: z.boolean().optional().describe(
      "If true, return the ruling-weighted top 15 (rulings count more). " +
      "Default false = raw text-line overlap count."
    ),
    refresh_cache: z.boolean().optional().describe(
      "Force re-crawl before scoring. Slow (~30–90 s); use only if " +
      "you suspect the local cache is missing recently-added fragments."
    ),
  },
}, async ({ museum_number, weighted, refresh_cache }) => {
  await ensureCorpusLoaded({ refresh: refresh_cache });
  const id = normalizeMuseumNumber(museum_number);
  const target = corpus.find(f => f.museumNumber === id);
  if (!target) return notFound(museum_number);
  if (target.lineToVec.length === 0) return noLineToVec(museum_number);
  const ranked = rankAll(target, corpus, weighted);
  return formatTopK(ranked, 15, weighted);
});
```

Output sketch (matches the existing search_fragments tone):

```
Join candidates for BM.41255.C  (weighted=false)
Top 15 of 21,184 transliterated fragments ranked. Local algorithm,
no Auth0 required. Cache age: 7m ago.

  1. BM.40774         score=12   designation=Lexical god list
  2. BM.41255.B       score=12   designation=…
  3. K.7390           score=11   designation=…
  ...

Tip: pass weighted=true to re-rank by ruling weight (TEXT_LINE=1,
SINGLE_RULING=3, DOUBLE_RULING=6, TRIPLE_RULING=10, START/END=3).

Source: local-only, see SPEC-v0.3-find_join_candidates.md.
```

---

## 4. Phasing

| Phase | What | Effort estimate |
|-------|------|-----------------|
| **P1** | Crawl `/fragments/query` paginated, write JSONL cache. CLI command `cuneiform-mcp --prefetch`. Throttle to 5 req/s, resumable via last-museum-number watermark. | ~3 h |
| **P2** | Port `line_to_vec_score.py` to TS. Unit tests against known eBL outputs (pick 5–10 fragments where eBL's matcher result is known via reading their docs / publications). | ~3 h |
| **P3** | Wire `find_join_candidates` tool. Lazy-load corpus on first call. Cache age reporting. | ~1 h |
| **P4** | Incremental sync via `/fragments/latest` on startup. Skip if last sync <24 h ago. | ~1 h |
| **P5** | Document the cache location, prefetch command, refresh-cache flag in README. | ~0.5 h |

**Total ~ one long weekend.** Matches the brief's estimate.

---

## 5. Open questions for Dane

1. **Cache location** (see § 2e). Default to `~/.cache/cuneiform-mcp/`?
   Override via env var?
2. **Prefetch UX.** Should the first `find_join_candidates` call
   transparently trigger a 30–90 s crawl, OR refuse and tell the user
   to run `npx cuneiform-mcp prefetch` first? I lean transparent + a
   progress line on stderr.
3. **Incremental sync.** Run on every MCP startup (cheap, ~1 req if
   nothing new), or only on a user-issued `refresh_cache: true`?
4. **Should we publish a precomputed cache** as a build artifact (eBL
   data is open) so users can `npm install` and skip the crawl
   entirely? Pros: instant first call. Cons: stale by package release
   date; extra ~6 MB in the published tarball; cache-shape changes
   require republishing. I lean NO for v0.3.
5. **Should we cross-validate against eBL's hosted matcher**
   before shipping? Hard — the matcher is exactly the Auth0-gated
   endpoint we're avoiding. Best we can do is verify against any
   joined-fragment pairs documented in eBL publications.
6. **Auth0 outreach in parallel.** Plan A (GitHub Issue) and Plan C
   (this spec) are not mutually exclusive. If outreach succeeds
   later, we could keep the local matcher AND offer a `--remote`
   flag that proxies to the official endpoint. Decide whether to send
   the outreach now in parallel with implementing this spec, or
   commit to local-only.

---

## 6. Risks + landmines

- **Algorithm drift.** If eBL changes their `LineToVecEncoding` enum
  (e.g. add a new structural token), our local matcher silently
  becomes wrong on new data. Mitigation: warn on any `lineToVec`
  containing an int we don't recognise.
- **Rate limits.** No documented rate limits, but a 5 req/s ceiling
  is a reasonable neighbour-policy. Anything aggressive could get
  the IP throttled or blocked.
- **`/fragments?random=true` returns 975 B with no `lineToVec`.**
  That endpoint is a slimmer view of a single fragment. Don't use it
  for the crawl — use `/fragments/query` instead, which returns full
  records.
- **The 200+empty-body footgun is ORACC-only.** eBL returns clean
  4xx codes when something's wrong. No need for the `<TEI` content
  guard we use on the ORACC client.
- **Latency on common transliteration queries.** eBL's
  `/fragments/query?transliteration=lugal` took ~8 s during testing.
  We're using `latest=true` for the crawl which should be faster
  (no transliteration scoring), but expect occasional slow pages.

---

## 7. Decision needed before P1 starts

Just one: **cache location + override env var name** (Open Q1). Every
other open question can be answered with a sensible default and
revisited later. Tell me the cache decision and I can start P1.
