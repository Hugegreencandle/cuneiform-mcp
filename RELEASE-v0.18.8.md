# cuneiform-mcp v0.18.8 — Release Notes

*Released 2026-05-22. Cross-axis pair-comparison tool — fifth release of the day in the cluster-survey response sequence.*

---

## TL;DR

**v0.18.8 adds one cross-axis pair-comparison tool:**

- **NEW: `compare_tablet_pair`** — given two museum numbers, return the full cross-axis similarity across all four discovery axes (lexical exact-J, fuzzy-J + run-bonus, thematic cosine, scribal-signature cosine + Jaccard) PLUS an identification verdict mapping the pattern to the likely relationship class (same_composition_same_scribe / same_composition_different_scribe / same_scribe_different_composition / physical_join_candidate / thematic_only / weak_relationship / unrelated).

Single-call cross-axis pair diagnostic — completes the per-pair zoom layer that the v0.18.4-v0.18.7 tools handled at corpus/cluster scale. The verdict decision-tree mirrors the methods paper §3.4 + §3.4.1 framing: each axis answers a distinct Assyriological question, and the combined cross-axis pattern is more informative than any single metric.

---

## What's new

### Tool count: 34 → 35

### New tool: `compare_tablet_pair`

**Question answered:** "How are these two tablets related?"

**Input:**
- `tablet_a: string` — first museum number
- `tablet_b: string` — second museum number

**Output:** four axis blocks + a verdict block:

**Per axis** (`lexical`, `fuzzy`, `thematic`, `scribal`):
- `status: "found"` + `direction: "a_to_b" | "b_to_a"` + `values: Record<string, number>` — the per-axis score(s) when the pair is in either tablet's top-K
- `status: "below_threshold"` + threshold note — when neither A→B nor B→A surfaces the pair
- `status: "tablet_not_in_index"` + missing tablet IDs — when one or both tablets aren't indexed for an axis

**Verdict:**
- `primary_relationship` — one of 7 enumerated classes
- `confidence` — high / medium / low
- `evidence` — list of cross-axis signal patterns that drove the classification

**Verdict decision tree (summarized from `classify()`):**

| Pattern | Verdict |
|---|---|
| fuzzy_J ≥ 0.7 + scribal_cos ≥ 0.7 | `physical_join_candidate` (run find_join_candidates) |
| fuzzy_J ≥ 0.5 + scribal_cos ≥ 0.7 | `same_composition_same_scribe` (the BM.34970-quartet class) |
| fuzzy_J ≥ 0.3 + scribal_cos < 0.5 | `same_composition_different_scribe` (the K.2798↔Si.776 class) |
| fuzzy_J ≥ 0.3 + scribal_cos ≥ 0.7 | `same_scribe_different_composition` |
| scribal_cos ≥ 0.7 + fuzzy_J < 0.2 | `same_scribe_different_composition` (different composition by same hand) |
| thematic_cos ≥ 0.7 + low lexical | `thematic_only` (paraphrase / bilingual / alt-spelling candidate) |
| Any signal but below confident thresholds | `weak_relationship` |
| All axes below weak-signal | `unrelated` |

**Use case examples:**

```
# Verify a same-scribe claim from a cluster reconstruction
compare_tablet_pair("BM.34970", "1881,0204.471")
→ verdict: same_composition_same_scribe (high confidence)
→ evidence: fuzzy_J=0.8069 + scribal_cos=0.6031 + cross-axis convergence

# Investigate whether two tablets are physical joins
compare_tablet_pair("K.5896", "K.6324")
→ verdict: physical_join_candidate (high confidence) if fuzzy_J ≥ 0.7

# Disambiguate a thematic-but-not-lexical pairing
compare_tablet_pair("X", "Y")
→ if thematic_cos high + lexical low → thematic_only (paraphrase candidate)
```

**Composition flow:**

```
list_collection_prefixes()                        ← v0.18.5
  ↓
coverage_stats_for_collection(...)                ← v0.18.4
  ↓
reconstruct_cluster(seed='Y')                     ← v0.17.1 + v0.18.4 quality filter
  ↓
cluster_pair_similarity_matrix(cluster_members)   ← v0.18.7
  ↓
compare_tablet_pair(top_edge_pair)                ← v0.18.8 (deep-dive)
  ↓
find_join_candidates(...) / find_same_scribe(...) ← (axis-specific follow-up)
```

The user can now zoom from the whole corpus to a specific pair in a single chain of MCP calls, with each tool's output feeding the next.

---

## The 2026-05-22 release arc — final summary

Five releases shipped this session, all motivated by the BM.77056 cluster survey:

| Version | Commit | Tool | LOC | Closes |
|---|---|---|---|---|
| v0.18.4 | bc92a40 | `coverage_stats_for_collection` + `min_sign_count` filter | 525 | Cluster-time quality (NZK lesson) |
| v0.18.5 | 1d5fd6a | `list_collection_prefixes` | 312 | Corpus-exploration entry point |
| v0.18.6 | 615d5a0 | `find_short_fragments` | 285 | Quality-audit primitive |
| v0.18.7 | 78258e4 | `cluster_pair_similarity_matrix` | 459 | Cluster-topology completeness |
| v0.18.8 | (this) | `compare_tablet_pair` | ~400 | Per-pair cross-axis zoom |

Combined: 5 new tools + 1 quality filter, ~1,980 LOC, tool count 30 → 35.

---

## Files changed

- `src/comparePair.ts` — NEW FILE, new tool's backing module
- `src/index.ts` — registered `compare_tablet_pair` tool, bumped VERSION, updated smoke-OK message
- `package.json` — bumped version to 0.18.8

---

## Verification

- ✅ `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.8 smoke OK — 35 tools registered"
- ⏳ Live MCP verification deferred to next host-process restart

---

## What's next

The metadata-enrichment gap noted in v0.18.4-v0.18.7 release notes remains the highest-leverage next item. Once `fragment-metadata.json` enrichment lands (planned for v0.18.9 or v0.19.0):

- The v0.18.4 coverage-stats tool surfaces real period/genre/city distributions instead of "(unknown)"
- `find_unpublished_in_publication` becomes buildable (program-doc quick-win, blocked on metadata)
- `compare_dialects` becomes buildable (program-doc quick-win, blocked on metadata)
- `find_tablets_by_genre` / `find_tablets_by_period` cross-cut tools become possible

After metadata enrichment, the natural next-tool list is:
- `find_strong_scribal_groups_in_prefix` — corpus-wide same-scribe group discovery (the BM.34970-quartet class generalized)
- `audit_cluster` — composite quality + topology + provenance check for a cluster, one-call replacement for the current 4-tool workflow
- `find_orthographic_outliers_in_prefix` — within-cohort scribal-signature outlier detection
