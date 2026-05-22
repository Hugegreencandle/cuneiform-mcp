# cuneiform-mcp v0.18.4 — Release Notes

*Released 2026-05-22. Quality-filter + first new tool since the camera-ready v0.18.3 paper release.*

---

## TL;DR

**v0.18.4 adds one new tool and one quality-filter parameter, both motivated by the BM.77056 *āšipūtu* cluster survey (2026-05-22):**

- **NEW: `coverage_stats_for_collection`** — corpus-level baseline statistics for a museum-collection prefix or list of prefixes. Given `BM`, `K`, `Sm`, `CBS`, `VAT`, `NZK`, etc., reports total tablets + transliteration coverage + sign-count distribution + top-N largest tablets + period/genre/city breakdowns.
- **`reconstruct_cluster` gains `min_sign_count` quality filter** — drop marginal-signal fragments (default disabled for v0.17.1–v0.18.3 backward compatibility). Closes the NZK.set.* calibration question surfaced in the 2026-05-22 survey: NZK records are real eBL data but have only 5-8 signs each, making fuzzy-Jaccard false-positive-prone for cluster inclusion.

Both changes were motivated by gaps in observability identified during the cluster content survey. Both ship without breaking existing tool consumers (the new parameter is optional and defaults to backward-compatible behavior).

**No methods-paper claims affected.** The v0.18.3 paper's "100 members" + "20 prefixes" cluster-recovery claims stand. v0.18.4 is additive, not corrective.

---

## What's new

### Tool count: 30 → 31

The MCP server now registers 31 tools across the same four discovery axes plus the new observability category.

### New tool: `coverage_stats_for_collection`

**Question answered:** "How many tablets does museum prefix X have in the corpus, what's their transliteration coverage, and what's their sign-count distribution?"

**Input:**
- `prefixes: string[]` — required list of prefix strings (e.g. `["BM"]`, `["K", "Sm"]`, `["NZK"]`)
- `top_n: number?` — optional cap on top-largest-tablets surfaced per prefix (default 10, max 50)

**Output:** per-prefix statistics block containing:
- `total_tablets` + `in_lex_graph` + `in_them_index` + `in_both` (corpus-coverage counts)
- `sign_count`: min / median / mean / p90 / max / total / zero_sign_count
- `top_by_sign_count`: top-N tablets ranked by sign count, with their eBL designations
- `period_distribution` / `genre_distribution` / `city_distribution` (top-N each)

Plus corpus totals: total tablets in index, prefixes matched vs. requested, distinct prefixes in the corpus.

**Use cases:**
- **Per-collection deep-dive entry point** — "give me an overview of what's in K, the Kuyunjik prefix"
- **Discover under-cataloged sub-corpora** — prefixes with high `zero_sign_count` or low coverage ratios
- **Find the largest tablets worth a per-tablet brief** — pre-rank by sign count before reading
- **Identify methodologically-marginal prefixes** — prefixes whose median sign count is very low (like NZK at 5-8 signs) are candidates for filtering via the new `reconstruct_cluster` parameter

**Companion to:** `find_anomalous_tablets` (per-tablet anomaly detail) + `reconstruct_cluster` (per-seed manuscript reconstruction). Together the three answer different scales of the same corpus.

### `reconstruct_cluster` gains `min_sign_count` parameter

**Motivation:** The 2026-05-22 BM.77056 cluster survey investigation revealed that the cluster's 100-member recovery includes 3 NZK.set.* members with only 5-8 signs each. At such small sign counts, fuzzy-Jaccard is statistically false-positive-prone. The bug isn't in the data — NZK records are legitimate eBL fragments — but in the lack of a quality filter at the cluster-reconstruction stage. The existing `find_anomalous_tablets` tool already applies a `min_sign_count = 100` default for the same reason (per methods paper §2.4); `reconstruct_cluster` was the only major discovery tool missing this filter.

**Parameter:**
- `min_sign_count: number?` — optional. Default 0 (no filter, backward-compatible). Recommended 50–100 to drop short fragments.

**Behavior:**
- When set > 0, BFS-frontier candidates whose anomaly-index `sign_count` is below the threshold are excluded from cluster membership.
- The seed tablet is always included regardless of its own sign_count; a warning is emitted if the seed is below threshold (allowing seed-on-marginal-tablet workflows but flagging the imprecision).
- Filter statistics are surfaced in `index_stats`: `filtered_below_sign_count` (dropped due to insufficient sign count) and `filtered_no_sign_count_data` (dropped because anomaly index has no record for that tablet).

**Backward compatibility:** Default `min_sign_count = 0` preserves v0.17.1–v0.18.3 behavior exactly. The new fields in `config` and `index_stats` are additive; consumers of the schema that ignore unknown fields are unaffected.

**Worked example:**

```
# Pre-v0.18.4 (backward-compatible default)
reconstruct_cluster(seed='BM.77056', max_size=100)
→ 100 members including NZK.set.{11,12,13}

# v0.18.4 with quality filter
reconstruct_cluster(seed='BM.77056', max_size=100, min_sign_count=50)
→ ~97 members (NZK.set.{11,12,13} dropped as below threshold)
→ index_stats.filtered_below_sign_count = 3
```

Allowing both query modes lets users select whether they want the broadest recovery (default) or the methodologically-tightest cluster (with filter). The methods paper's claims are reproducible from the default; this is the right preservation discipline.

---

## What's NOT in this release

- **No paper-claim corrections needed.** The 2026-05-22 investigation confirmed that NZK.set.* records are real eBL data, not synthetic test fixtures (my initial v2.1 hypothesis was wrong; v2.1.1 corrected it). The paper's 100-member / 20-prefix claims stand.
- **No methods-paper retraction.** v0.18.4 is additive.
- **No other tools introduced.** The cuneiform research program (`HQ/04-Strategy/Cuneiform-Hidden-Information-Research-Program-2026-05-22.md`) lists 6 more tool-extension proposals (find_unpublished_in_publication, extend_dataset_to_motif, cross_reference_against_oracc_translation_coverage, restore_lacuna_with_provenance_filter, provenance_reconstruction, comparative_undeciphered_scripts) — these remain queued for future releases.

---

## Files changed

- `src/anomalySurface.ts` — added `getTabletSignCount()` accessor + `getAllTabletRecords()` accessor + `AnomalyTabletRecord` type re-export
- `src/reconstructCluster.ts` — added `minSignCount` option, quality-filter helper, filter-stats in result
- `src/collectionCoverage.ts` — NEW FILE, new tool's backing module
- `src/index.ts` — registered `coverage_stats_for_collection` tool, added `min_sign_count` param to `reconstruct_cluster`, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.4

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.4 smoke OK — 31 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart (running session uses v0.18.3 cached binary)

---

## Source of changes

This release was motivated by the [BM.77056 *āšipūtu* cluster content survey](https://github.com/Hugegreencandle/kairo-vaultv2/blob/main/HQ/04-Strategy/BM77056-As%CC%84ip%C5%ABtu-Cluster-Content-Survey-2026-05-22.md) v2.1.1 + the [Cuneiform Hidden-Information Research Program](https://github.com/Hugegreencandle/kairo-vaultv2/blob/main/HQ/04-Strategy/Cuneiform-Hidden-Information-Research-Program-2026-05-22.md), both compiled 2026-05-22. The survey's NZK-fixture-vs-real-data investigation produced the quality-filter motivation; the program doc's quick-wins list identified `coverage_stats_for_collection` as the highest-leverage new tool to ship next.
