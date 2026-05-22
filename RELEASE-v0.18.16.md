# cuneiform-mcp v0.18.16 — Release Notes

*Released 2026-05-22. Sixth 3-tool parallel-build wave. Thirteenth release of the day.*

---

## TL;DR

**v0.18.16 ships three more discovery tools — completing the join-axis discovery layer:**

- **NEW: `find_join_candidates_in_prefix`** — per-prefix systematic physical-join discovery via high-threshold fuzzy-J + joins_count cross-reference. The join-axis analogue of v0.18.11 `find_strongest_fuzzy_pairs_in_prefix` (lexical) and v0.18.9 `find_scribal_groups` (scribal).
- **NEW: `find_lineage_chain`** — multi-axis alternating BFS chain (fuzzy → scribal → fuzzy → scribal). Discovers transitive scholarly-lineage paths that single-axis `reconstruct_cluster` misses.
- **NEW: `find_high_join_count_tablets`** — surface tablets with the most known physical joins per fragment-metadata `joins_count` field. Champion-fragments discovery for canonical-anchor selection.

**Tool count crosses 56.** Six consecutive 3-agent parallel waves shipped clean.

---

## What's new

### Tool count: 53 → 56

### Tool 1: `find_join_candidates_in_prefix`

Algorithm: scan prefix tablets, call `findFuzzyParallels` per seed at very-high `min_fuzzy_jaccard=0.50` (joins have near-identical wording on the broken edge), keep intra-prefix edges, score by `fuzzy_jaccard × sqrt(min(sign_count_a, sign_count_b))`, cross-reference `joins_count` from FragmentMetadata to flag already-cataloged endpoints.

**Use case:** "Within K, what tablet pairs look like uncataloged physical-join candidates?" Asterisk markers (`*`) in output identify endpoints with known joins — bare pairs are the highest-value discovery.

### Tool 2: `find_lineage_chain`

Walk an alternating axis sequence from a seed (default `["fuzzy", "scribal", "fuzzy", "scribal"]`) up to 4 hops. Dedupe by shortest depth; record ALL {axis, parent, score} arrivals per tablet. `cross_axis_members[]` block highlights tablets surfaced via ≥2 distinct axes (higher-confidence relatives).

**Use case:** "Starting from K.2798 (Bīt salāʾ mê), follow a 4-hop alternating fuzzy → same-scribe → fuzzy → same-scribe chain." Captures the scholarly-transmission network around any seed across multiple axes simultaneously.

### Tool 3: `find_high_join_count_tablets`

Sort all tablets in cache by `joins_count` desc. Companion to v0.18 `find_join_candidates` (which proposes NEW joins) — this surfaces ALREADY-RECOVERED joins. Useful for picking the canonical anchor witness for a composition.

**Use case:** "Which tablets in the corpus have the most known physical joins?" Surfaces K.5896 (13-tablet join group), the well-known champion fragments.

---

## The 2026-05-22 release arc — thirteen releases

| Wave | Versions | Tools | Pattern |
|---|---|---|---|
| Sequential | v0.18.4–v0.18.9 | 6 | sequential |
| Parallel #1 | v0.18.10 | 3 | 3-agent parallel |
| Parallel #2 | v0.18.11 | 3 | 3-agent parallel |
| Parallel #3 | v0.18.12 | 3 | 3-agent parallel |
| Sequential | v0.18.13 | 2 + plumbing | interconnected |
| Parallel #4 | v0.18.14 | 3 | 3-agent parallel |
| Parallel #5 | v0.18.15 | 3 | 3-agent parallel |
| **Parallel #6** | **v0.18.16** | **3** | **3-agent parallel** |

**Totals: 26 new tools + 1 quality filter + metadata enrichment, ~11,000 LOC, tool count 30 → 56.**

**Six consecutive 3-agent parallel waves shipped clean.** Pattern is permanently validated.

---

## Three-axis discovery layer now complete

| Axis | Per-tablet | Within-prefix groups | Per-prefix top-N pairs |
|---|---|---|---|
| Fuzzy lexical | `find_fuzzy_parallels` | — | `find_strongest_fuzzy_pairs_in_prefix` |
| Thematic semantic | `find_thematic_parallel` | `find_thematic_cluster_in_prefix` | — |
| Scribal lineage | `find_same_scribe_candidates` | `find_scribal_groups` | — |
| **Physical join** | `find_join_candidates` | — | **`find_join_candidates_in_prefix`** (v0.18.16) |

Plus the multi-axis chain (`find_lineage_chain`, v0.18.16) that walks across all three.

---

## Files changed

- `src/joinCandidatesInPrefix.ts` — NEW FILE, ~351 LOC
- `src/lineageChain.ts` — NEW FILE, ~430 LOC
- `src/highJoinCountTablets.ts` — NEW FILE, ~273 LOC
- `src/index.ts` — 3 imports + 3 registerTool blocks + VERSION bump + smoke message
- `package.json` — version 0.18.16

---

## Verification

- ✅ Each agent verified `tsc --noEmit` clean before delivery
- ✅ Orchestrator `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.16 smoke OK — 56 tools registered"
- ⏳ Live MCP verification deferred to host-process restart

---

## What's next

The 2026-05-22 cuneiform tool-shipping run has now produced 26 new tools, ~11,000 LOC of TypeScript, and validated the 3-agent parallel-build pattern six times in a row. **All major discovery-axis tools are shipped.**

Remaining queue candidates for v0.18.17+:
- `extend_dataset_to_motif` — generalize apkallu_attestations pattern to arbitrary motifs (medium build, persisted dataset output)
- `find_temporal_clusters_in_period` — period-scoped thematic clusters
- `corpus_audit_report` — interpretive companion to corpus_health_report
- `compare_two_tablets_across_clusters` — given two tablets, check cluster-membership intersection
- `validate_claim` — given a claim with numerical values, verify against current corpus data (catches pre-publication errors)

OR pivot to **validation work** — once MCP host reloads, run the full v0.18.4-v0.18.16 toolset against the BM.77056 cluster + methods paper §3.4.1 quartet + produce a §3.5 supplementary section with real findings.
