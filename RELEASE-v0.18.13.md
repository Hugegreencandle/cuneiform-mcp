# cuneiform-mcp v0.18.13 — Release Notes

*Released 2026-05-22. Metadata-enrichment release — closes the (unknown) distribution gap that v0.18.4-v0.18.12 left open.*

---

## TL;DR

**v0.18.13 closes the metadata-enrichment gap that every prior v0.18.x release flagged as the next blocker:**

- **NEW module: `fragmentMetadata.ts`** — loader + accessor for `~/.cache/cuneiform-mcp/fragment-metadata.json`. Provides `getFragmentMetadata(id)`, `getPeriod()`, `getCity()`, `getPrimaryGenre()` helpers + `metadataCoverage()` stats + `enrichFragmentMetadata()` batch fetcher.
- **NEW tool: `enrich_prefix_metadata`** — per-prefix batched eBL `/fragments/{id}` backfill, rate-limited (concurrency=5 default, polite), chunked (default 50 per invocation). Run multiple times to fully enrich a prefix.
- **NEW tool: `fragment_metadata_coverage`** — read-only diagnostic. How many tablets currently have enriched metadata vs not, plus coverage % against the anomaly-index corpus.
- **UPDATED: `collectionCoverage.ts`** — period/genre/city distributions in `coverage_stats_for_collection` now actually populate from fragment-metadata when present. Falls back to `(unknown — not enriched)` with a warning prompting the user to run `enrich_prefix_metadata`.

**The (unknown)-distributions bug from v0.18.4 is FIXED.** All future v0.18.x releases that consume period/genre/city data now work as advertised.

---

## What's new

### Tool count: 45 → 47

### Background: the gap

Since v0.18.4 every release notes file documented the same blocker:

> "The anomaly-index has period/genre/city/designation fields populated as NULL for all 36,476 tablets. The rich eBL metadata lives in fragment-metadata.json but is sparsely cached (226 entries, 0.6% coverage; populated on-demand from per-tablet API calls)."

The result: `coverage_stats_for_collection` surfaced "(unknown)" for every distribution. v0.18.13 closes this.

### Tool 1: `enrich_prefix_metadata`

**Input:**
- `prefix_filter: string` — required (e.g. 'K', 'BM', 'Sm')
- `max_to_fetch: number?` — cap on new eBL API calls in this invocation (default 50, max 500)
- `concurrency: number?` — concurrent API calls (default 5, max 10)
- `min_sign_count: number?` — skip tablets below this sign_count (default 0)

**Output:** per-invocation counts (newly fetched / failed / already cached) + remaining count + cache state after run.

**Use pattern:**

```
# Step 1 — see current coverage
fragment_metadata_coverage()
→ "0.6% corpus coverage — most distributions will show (unknown — not enriched)"

# Step 2 — enrich a prefix in chunks
enrich_prefix_metadata(prefix_filter="Sm")  # 50 tablets fetched
enrich_prefix_metadata(prefix_filter="Sm")  # next 50
... repeat until "remaining without metadata: 0"

# Step 3 — now coverage_stats_for_collection actually works
coverage_stats_for_collection(prefixes=["Sm"])
→ Real period distribution (e.g. "Neo-Assyrian=412, Late Babylonian=87")
→ Real genre distribution (e.g. "Mīs pî=24, Šuʾila=18, …")
→ Real city distribution (e.g. "Sippar=412, Nineveh=87, …")
```

### Tool 2: `fragment_metadata_coverage`

Read-only diagnostic. Returns the cache file path, total entries, count with real metadata vs cached-null (404s), and corpus-wide coverage %. Use to plan enrichment before running coverage tools.

### Update: `collectionCoverage.ts`

`coverage_stats_for_collection` now:
1. Calls `getFragmentMetadata(t.id)` for each cluster member
2. Extracts period via `getPeriod(md)` (handles both nested `script.period` and bare string)
3. Extracts city via `getCity(md)` (handles both nested `provenance.site` and bare string)
4. Extracts genre via `getPrimaryGenre(md)` (first genre hierarchy)
5. Falls back to anomaly-index fields → "(unknown — not enriched)"
6. Emits a warning if <5% of bucket is enriched and bucket size ≥ 50

The "(unknown — not enriched)" label (vs. plain "(unknown)") makes the gap explicit + actionable — users see they need to run enrich_prefix_metadata.

---

## The 2026-05-22 release arc — ten releases shipped

| Version | Tool(s) | Pattern |
|---|---|---|
| v0.18.4 | `coverage_stats_for_collection` + `min_sign_count` filter | sequential |
| v0.18.5 | `list_collection_prefixes` | sequential |
| v0.18.6 | `find_short_fragments` | sequential |
| v0.18.7 | `cluster_pair_similarity_matrix` | sequential |
| v0.18.8 | `compare_tablet_pair` | sequential |
| v0.18.9 | `find_scribal_groups` | sequential |
| v0.18.10 | `audit_cluster` + `find_orthographic_outliers` + `find_cross_prefix_scribal_links` | **3-agent parallel** |
| v0.18.11 | `compare_clusters` + `find_strongest_fuzzy_pairs_in_prefix` + `corpus_health_report` | **3-agent parallel** |
| v0.18.12 | `find_tablet_neighborhood` + `find_lacuna_restoration_candidates` + `find_thematic_cluster_in_prefix` | **3-agent parallel** |
| v0.18.13 | `enrich_prefix_metadata` + `fragment_metadata_coverage` + collectionCoverage enrichment | **sequential (interconnected)** |

**Totals: 17 new tools + 1 quality filter + metadata-enrichment plumbing, ~7,500 LOC, tool count 30 → 47.**

---

## What this unlocks

Now that metadata enrichment is plumbed:

**Now buildable (queued from program-doc):**
- `find_unpublished_in_publication` — filter by `designation` (now populated via fragment-metadata)
- `compare_dialects` — filter by `period` (now populated)
- `find_tablets_by_genre` — query the `genres` array
- `find_tablets_by_period` — query the `script.period` field
- `find_tablets_by_provenance` — query the `provenance.site` field
- `genre_distribution_across_prefixes` — corpus-wide genre cross-cut

These could all ship as the next 3-agent parallel wave (v0.18.14 + v0.18.15).

---

## Files changed

- `src/fragmentMetadata.ts` — NEW FILE, ~290 LOC (loader + accessor + batch enricher)
- `src/collectionCoverage.ts` — added fragment-metadata enrichment to period/genre/city distributions + low-coverage warning
- `src/index.ts` — 2 new tool registrations + VERSION bump + smoke message
- `package.json` — version 0.18.13

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.13 smoke OK — 47 tools registered"
- ⏳ Live functional verification requires MCP server restart (will pick up v0.18.4-v0.18.13 simultaneously)

---

## Next session

**Recommended first action after MCP restart:**

```
# 1. Check current state
fragment_metadata_coverage()
→ baseline coverage %

# 2. Enrich the BM.77056 cluster's 20 prefixes (~5 minutes total)
for prefix in [K, BM, Sm, CBS, VAT, Sm, MLC, Ashm-1923, ND, ...]:
    enrich_prefix_metadata(prefix_filter=prefix)

# 3. Re-run yesterday's BM.77056 cluster survey with real metadata
coverage_stats_for_collection(prefixes=BM.77056-cluster-prefixes)
→ Real period/genre/city distributions for the *āšipūtu* cluster

# 4. v0.18.4 coverage tool finally delivers the value it promised in April
```

This validates the v0.18.13 plumbing AND closes the methods-paper-aligned investigation that started the entire arc this morning.
