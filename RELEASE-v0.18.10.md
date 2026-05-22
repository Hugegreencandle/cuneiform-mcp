# cuneiform-mcp v0.18.10 — Release Notes

*Released 2026-05-22. Three-tool parallel build via subagent orchestration — seventh release of the day.*

---

## TL;DR

**v0.18.10 ships THREE new tools simultaneously, built in parallel via subagent orchestration:**

- **NEW: `audit_cluster`** — composite quality + topology + provenance diagnostic for a cluster. One-call replacement for the manual `reconstruct_cluster` → `find_short_fragments` → `cluster_pair_similarity_matrix` → per-prefix coverage workflow. Designed for pre-publish cluster vetting.
- **NEW: `find_orthographic_outliers_in_prefix`** — within a museum-collection prefix bucket, surface tablets whose scribal-signature LLR profile is FURTHEST from the cohort centroid. Complements v0.18.9 `find_scribal_groups` — that finds tight same-scribe clusters; this finds the loners (candidates for imports / mislabeling / outlier scribal-school).
- **NEW: `find_cross_prefix_scribal_links`** — same-scribe edges that CROSS museum-collection boundaries (BM↔K, BM↔Sm, K↔CBS, etc.). Surfaces scribal-school networks transcending single excavation sites, ancient manuscript-transmission patterns, and 19th-century antiquities-lot artifacts.

**Build pattern:** three subagents in parallel built one tool module each (~300-400 LOC per module); orchestrator integrated all three into `src/index.ts` in a single pass. Each agent shipped a `tsc --noEmit` clean module + a ready-to-paste `server.registerTool()` snippet. Integration: 3 import lines + 3 registerTool blocks + 1 version bump + 1 smoke-message update. Total integration time: ~5 minutes.

---

## What's new

### Tool count: 36 → 39

Three new tools in one release — the most tools shipped in a single cuneiform-mcp release to date.

### Tool 1: `audit_cluster`

**Purpose:** One-call cluster vetting. Accepts EITHER a seed_tablet_id (triggers internal reconstruct_cluster) OR an explicit cluster_members list, returns the composite audit envelope.

**Returns:**
- `quality` — sign-count distribution + marginal-signal count + recommended-exclusion list
- `topology` — prefix distribution + cross-prefix ratio + top-N hubs + components/edge-density at 5 thresholds + first-shatter threshold
- `provenance` — distinct prefixes + per-prefix corpus coverage + missing-from-corpus list
- `recommendations` — generated text list of suggested next actions

**Use case:** Before publishing a cluster claim, run `audit_cluster(seed_tablet_id="BM.77056")` to get a single-call envelope covering everything the 4-tool manual workflow surfaces. Validates publication-readiness in one step.

### Tool 2: `find_orthographic_outliers_in_prefix`

**Purpose:** Within-cohort outlier surfacing. Complements `find_scribal_groups` from v0.18.9.

**Algorithm:**
1. Build cohort (all tablets in `prefix_filter` above `min_sign_count`)
2. Compute centroid signature (sum LLR weights across cohort)
3. Rank each tablet by cosine to centroid
4. Return tablets with LOWEST cosine (= most deviant) + their distinctive signs

**Returns:**
- `outliers[]` — top-N most-deviant tablets with signature_cosine_to_centroid + deviation_score + distinctive_signs (signs in tablet's signature but NOT in centroid top-30)
- `cohort_centroid` — top-15 baseline signs for reference
- `summary` — mean/median/stdev cosine + top-3 most-typical tablets

**Use case:** "Within Kuyunjik (K) tablets above 50 signs, which tablets have anomalous orthographic practice?" → candidates for imports, mislabeling, or outlier scribal-school.

### Tool 3: `find_cross_prefix_scribal_links`

**Purpose:** Surface same-scribe edges that cross museum-collection boundaries.

**Algorithm:**
1. Iterate tablets (optionally scoped to one source prefix)
2. For each, fetch top-K same-scribe candidates
3. Keep only edges where `source.prefix ≠ candidate.prefix` at cosine ≥ threshold
4. Optionally require mutual reciprocity (default true)

**Returns:**
- `edges[]` — cross-prefix edges sorted by cosine + per-edge metadata
- `prefix_pair_summary` — aggregate counts per prefix-pair (e.g. `BM↔K: 25`, `BM↔Sm: 12`)
- `bridge_tablets[]` — top-10 tablets with the most cross-prefix edges (likely scribes whose work spans multiple modern collections)

**Use case:** "Which scribes had work distributed across multiple British Museum + Berlin VAT collections?" → surfaces both ancient manuscript-transmission networks and 19th-century antiquities-lot splits.

---

## Build pattern: parallel subagent orchestration

This release used a new build pattern: **3 subagents working in parallel, integrated by the orchestrator in a single sequential pass.**

**Agent contracts (identical for all three):**
- Write ONE new file at a specific path (`src/<tool>.ts`)
- Reply with: file path, exported function name, import line, ready-to-paste `registerTool()` snippet, integration notes
- DO NOT modify `index.ts`, `package.json`, or any existing file (conflict surface — orchestrator handles)
- DO NOT run `npm run build` or `git commit` (the integration phase is the orchestrator's)
- Match existing project conventions (verified via Read of existing tools); pass `tsc --noEmit` cleanly

**Orchestrator's integration phase:**
1. Add 3 import lines to `src/index.ts`
2. Paste 3 registerTool blocks above the prior version's section divider
3. Bump VERSION constant + smoke-message text
4. Bump package.json
5. `npm run build` + `npm run smoke` to verify
6. Write release notes
7. Commit + push

**Result:** Three tools, ~1,100 LOC, one release, zero file-collision errors, single clean commit. The pattern scales — could be 5+ tools in parallel by raising agent wave size (per CLAUDE.md guidance: ≤3 per wave; for >3 tools, two waves).

---

## The 2026-05-22 release arc — seven releases shipped

| Version | Commit | Tool(s) | LOC |
|---|---|---|---|
| v0.18.4 | bc92a40 | `coverage_stats_for_collection` + `min_sign_count` filter | 525 |
| v0.18.5 | 1d5fd6a | `list_collection_prefixes` | 312 |
| v0.18.6 | 615d5a0 | `find_short_fragments` | 285 |
| v0.18.7 | 78258e4 | `cluster_pair_similarity_matrix` | 459 |
| v0.18.8 | c220425 | `compare_tablet_pair` | 507 |
| v0.18.9 | 3257407 | `find_scribal_groups` | 516 |
| v0.18.10 | (this) | `audit_cluster` + `find_orthographic_outliers_in_prefix` + `find_cross_prefix_scribal_links` | ~1,100 |

**Total: 9 new tools + 1 quality filter, ~3,700 LOC, tool count 30 → 39.**

---

## Files changed

- `src/auditCluster.ts` — NEW FILE, ~430 LOC
- `src/orthographicOutliers.ts` — NEW FILE, ~315 LOC
- `src/crossPrefixScribal.ts` — NEW FILE, ~350 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.10

---

## Verification

- ✅ Each agent independently verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator's `npm run build` clean post-integration
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.10 smoke OK — 39 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart

---

## What's next

The metadata-enrichment gap noted in v0.18.4-v0.18.9 release notes remains. Once `fragment-metadata.json` enrichment lands (planned for v0.18.11):

- v0.18.4 `coverage_stats_for_collection` surfaces real period/genre/city distributions instead of "(unknown)"
- `find_unpublished_in_publication` becomes buildable (program-doc quick-win)
- `compare_dialects` becomes buildable (program-doc quick-win)
- `find_tablets_by_genre` / `find_tablets_by_period` cross-cut tools become possible

If continuing the parallel-build pattern: the v0.18.11 release could ship `find_unpublished_in_publication` + `compare_dialects` + `find_tablets_by_genre` in a single 3-agent wave after the metadata-enrichment plumbing lands.
