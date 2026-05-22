# cuneiform-mcp v0.18.6 — Release Notes

*Released 2026-05-22. Quality-audit tool completing the v0.18.4-v0.18.6 NZK-finding response sequence.*

---

## TL;DR

**v0.18.6 adds one quality-audit tool:**

- **NEW: `find_short_fragments`** — surface tablets at or below a sign-count threshold. Direct programmatic complement to the v0.18.4 `reconstruct_cluster` `min_sign_count` filter: where the filter drops short fragments inline at BFS time, this tool exposes the same marginal-signal surface as a queryable view.

This closes the v0.18.4 → v0.18.5 → v0.18.6 sequence of tools shipped in response to the 2026-05-22 BM.77056 cluster survey's NZK.set.* finding. The three tools together give researchers (a) a quality filter at cluster-time, (b) a corpus-exploration entry point, and (c) a quality-audit primitive for pre-screening before cluster reconstruction.

---

## What's new

### Tool count: 32 → 33

### New tool: `find_short_fragments`

**Question answered:** "Which tablets in the corpus have very few signs (and are therefore unreliable for statistical methods)?"

**Input:**
- `max_sign_count: number` — required. Surface tablets with `sign_count ≤ threshold`. Common values: `10` (micro-fragments), `50` (quality-filter floor for cluster reconstruction), `100` (anomaly-tool default per methods paper §2.4).
- `prefix_filter: string[]?` — optional whitelist of museum-collection prefixes. E.g. `['NZK']` to inspect the NZK.set.* tablets specifically; `['BM', 'K']` for the two major BM collections.
- `sort_order: enum?` — `asc` (default; shortest first) / `desc` (longest-under-threshold first).
- `top_n: number?` — default 50, capped at 500.

**Output:** per-fragment list + corpus statistics:
- Per-fragment: `id`, `prefix`, `sign_count`, `in_lex_graph`, `in_them_index`
- Corpus totals: total tablets in index, total below threshold (unfiltered), total matching prefix filter, prefix-distribution-below-threshold

**Use cases:**

```
# Identify the marginal-signal surface corpus-wide
find_short_fragments(max_sign_count=20, top_n=100)
→ See which prefixes are over-represented in the short-fragment surface

# Pre-audit a prefix before cluster reconstruction
find_short_fragments(max_sign_count=50, prefix_filter=['BM'])
→ Decide whether to apply min_sign_count filter to BM-seeded clusters

# Investigate a specific prefix (like NZK)
find_short_fragments(max_sign_count=20, prefix_filter=['NZK'])
→ All 12 NZK.set.* tablets surface (5-8 signs each)
```

**Complementary tool sequence:**

```
list_collection_prefixes()                     ← discover prefixes (v0.18.5)
  ↓
find_short_fragments(prefix_filter=['X'])      ← audit short fragments in X (v0.18.6)
  ↓
coverage_stats_for_collection(prefixes=['X'])  ← full coverage stats for X (v0.18.4)
  ↓
reconstruct_cluster(seed='Y',                  ← cluster with optional quality filter (v0.18.4)
                    min_sign_count=50)
```

Four tools that together form a complete corpus-exploration + quality-audit workflow.

---

## The v0.18.4 → v0.18.6 arc — what motivated this sequence

The 2026-05-22 BM.77056 *āšipūtu* cluster survey investigation surfaced three gaps in observability:

1. **Cluster-time quality filtering** — the 100-member cluster recovery included 3 NZK.set.* members with only 5-8 signs each, marginal-signal candidates for false-positive cluster inclusion. **Solution: v0.18.4 `min_sign_count` parameter for `reconstruct_cluster`.**
2. **Corpus-exploration entry point** — researchers needed to query a collection's coverage stats but had no way to discover what prefixes existed. **Solution: v0.18.5 `list_collection_prefixes`.**
3. **Quality-audit primitive** — beyond the cluster-time filter, researchers needed a corpus-wide view of marginal-signal tablets for pre-screening + exclusion-list generation. **Solution: v0.18.6 `find_short_fragments` (this release).**

Each tool was identified by working through an actual research session and recording where the existing surface forced manual data-mining instead of a single MCP call. The three-tool arc is the response.

---

## Files changed

- `src/collectionCoverage.ts` — added `findShortFragments()` function + `ShortFragment` + `FindShortFragmentsResult` + `FindShortFragmentsOptions` types
- `src/index.ts` — registered `find_short_fragments` tool, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.6

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.6 smoke OK — 33 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart (same session-cache issue as v0.18.4 + v0.18.5; all three releases will become live on the next reload)

---

## What's next (v0.18.7+)

The metadata-enrichment gap noted in v0.18.4 + v0.18.5 release notes remains the highest-leverage next item:

- **v0.18.7 (planned): metadata enrichment** — load `fragment-metadata.json` to populate the period/genre/city distributions in `coverage_stats_for_collection`. The on-demand cache currently only carries 226 of 36,476 tablets; enriching either via batch backfill (eBL API rate-limited but doable) or via opt-in per-prefix loading would close the "(unknown)" gap.

After metadata enrichment lands, the remaining program-doc quick-wins (`find_unpublished_in_publication`, `compare_dialects`) become buildable without further data work.
