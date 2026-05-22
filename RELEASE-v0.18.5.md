# cuneiform-mcp v0.18.5 — Release Notes

*Released 2026-05-22. Discovery-layer companion to v0.18.4 collection-coverage.*

---

## TL;DR

**v0.18.5 adds one discovery tool that completes the corpus-exploration pair started in v0.18.4:**

- **NEW: `list_collection_prefixes`** — corpus-level discovery tool. Returns the full list of distinct museum-collection prefixes in the eBL corpus (typically 30-50 prefixes), ranked by tablet count with per-prefix counts + sign totals + transliteration coverage. Surfaces the long tail of small collections (NZK, Ashm-1923, NMI, etc.) alongside the major prefixes (BM, K, Sm).

**The corpus-exploration query pair is now complete:**

1. **`list_collection_prefixes`** (v0.18.5) — "what prefixes exist?" — the first query in any corpus-exploration session
2. **`coverage_stats_for_collection`** (v0.18.4) — "give me detail on prefix X" — the second query, once you know what to dig into

This pair establishes the corpus-exploration layer atop the existing per-tablet (`find_anomalous_tablets`) and per-seed (`reconstruct_cluster`) layers. Three scales of the same corpus are now queryable.

---

## What's new

### Tool count: 31 → 32

### New tool: `list_collection_prefixes`

**Question answered:** "What museum-collection prefixes exist in the corpus, and how big are they?"

**Input:**
- `min_tablet_count: number?` — drop prefixes with fewer than this many tablets. Default 1 (no filter). Use higher (e.g. 10, 100) to focus on the major collections.
- `sort_by: enum?` — `tablet_count` (default) / `total_sign_count` / `mean_sign_count` / `prefix`. The `mean_sign_count` option surfaces prefixes with the largest average tablets (proxy for ritual/literary vs. administrative composition); the `prefix` option is alphabetical.
- `sort_order: enum?` — `desc` (default) / `asc`
- `top_n: number?` — optional cap on returned prefixes. Omit to return all distinct prefixes.

**Output:** per-prefix summary block with:
- `tablet_count` — total tablets carrying this prefix
- `total_sign_count` + `mean_sign_count` — corpus-volume contribution
- `in_lex_graph` + `lex_coverage_pct` — transliteration-pipeline coverage (proxy for "processed by trigram corpus")
- `in_them_index` — coverage in the thematic-embedding index

Plus corpus totals: distinct prefixes, prefixes returned vs. filtered, total tablets, total signs.

**Use case sequence:**

```
# Step 1 — Discover what's in the corpus
list_collection_prefixes(top_n=10)
→ K=2,485 / BM=2,304 / Sm=948 / VAT=489 / ... / NZK=12 / Ashm-1923=4

# Step 2 — Drill into a specific prefix
coverage_stats_for_collection(prefixes=["K"])
→ K's full sign-count distribution, top-10 largest tablets, period/genre/city breakdowns

# Step 3 — Pick a seed and run cluster reconstruction
reconstruct_cluster(seed='K.2798', min_sign_count=50)
→ full cluster topology with quality filter
```

The three queries answer three different scales of the same question, and together form a clean corpus-exploration workflow.

---

## What's NOT in this release

- **No metadata enrichment** — both `list_collection_prefixes` and `coverage_stats_for_collection` use the anomaly-index, which has `period`/`genre`/`city`/`designation` fields populated as null for all 36,476 tablets. The rich eBL metadata lives in `fragment-metadata.json` but is sparsely cached (226 entries, 0.6% coverage; populated on-demand from per-tablet API calls). Enriching the coverage stats with on-demand metadata loading is queued for **v0.18.6**.
- **No more tools from the program-doc quick-wins list** in this release. `find_unpublished_in_publication` + `compare_dialects` remain queued — they require richer metadata than the at-rest corpus provides, so they're naturally sequenced after the v0.18.6 metadata-enrichment work.

---

## Files changed

- `src/collectionCoverage.ts` — added `listCollectionPrefixes()` function + `PrefixSummary` + `ListPrefixesResult` types + `ListPrefixesOptions` type
- `src/index.ts` — registered `list_collection_prefixes` tool, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.5

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.5 smoke OK — 32 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart (same session-cache issue as v0.18.4)

---

## Source of changes

The corpus-exploration gap was identified when shipping v0.18.4's `coverage_stats_for_collection`: that tool requires the user to know the prefix already (you can't query "BM" if you don't know "BM" is a valid prefix). `list_collection_prefixes` closes that loop. The same shipping pattern motivated the v0.18.6 backlog item — using the v0.18.4 tool against the BM.77056 cluster's 20 prefixes immediately revealed that period/genre/city distributions all surface as "(unknown)" due to the sparse fragment-metadata cache, which is the next problem to solve.
