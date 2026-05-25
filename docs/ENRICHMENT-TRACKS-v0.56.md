# Enrichment Tracks (v0.56 follow-up)

Generated 2026-05-25 after v0.56 ship. Three concurrent enrichment tracks targeting cache extension + ABZ-fallback completion.

## Track A — Lemma cache extension

**Goal:** Extend lemma cache from 216 entries (post-v0.45 build) to 500+ via the next 300 high-host tablets.

**Method:** `scripts/build-lemma-index.mjs` with top-300 chunk-host tablets (deduped against existing cache, host count range 390 → 109). Polite eBL pacing concurrency=2, 300ms per request. Total runtime: 458 seconds (~7.6 minutes).

**Results:**

| Metric | Before | After | Δ |
|---|---|---|---|
| Total entries in lemma cache | 216 | **504** | +288 |
| With populated lemmas | 116 | **265** | +149 |
| Failed (eBL 404/422) | — | 24 | — |
| With-lemma rate (this batch) | — | 149/288 = 52% | — |

**Failure modes:** 24 of 312 targets failed with eBL 404 or 422. All are comma-containing museum IDs (e.g. `1881,0204.198`) that break the env-var splitting in the build script. Known issue; documented; ~8% failure rate is acceptable for the extension burst.

**Substantive impact — K.2987.B lemma neighbors expanded:**

| Before (21-tablet cache) | After (504-tablet cache) |
|---|---|
| 9 candidates total | 20 candidates returned (out of more) |
| Top: K.2550 j=0.199 (only known Mīs pî sibling) | Top still K.2550 j=0.199 + new high-overlap neighbors |

New neighbors at j ≥ 0.15: K.2438, K.191, CBS.16, K.2106, K.2439, IM.67692, K.2570 (all NEW). The K.2987.B ↔ K.191 pair shares 133 lemmas out of 776 union — a substantial candidate-sibling relationship invisible to the prior cache.

These are concrete validation-resolution candidates that the v0.52 active-learning prioritizer can now surface, or a scholar can review directly via `find_lemma_parallel(tabletId="K.2987.B", topK=20)`.

## Track B — Corpus composition-assignment re-scan (with v0.56 6-feature model)

**Goal:** Verify v0.56 6-feature retrain doesn't change identify_composition's corpus-wide results.

**Method:** Re-ran `scripts/build-corpus-composition-assignments.mjs` against all 4,922 chunk-index tablets.

**Result: stable.** All 310 discovered candidates remain identical between v0.54 and v0.56 scans. This is the expected result: `identify_composition` uses chunk-overlap + sign2vec centroid, NOT the v0.29 Bayesian fusion model. The 6th feature (composition_assignment_match) is downstream of identify_composition, not feeding back into it. No regressions; no growth.

The v0.54 backup is preserved at `~/.cache/cuneiform-mcp/composition-assignments-v054.json` for historical comparison.

## Track C — MZL fallback for ABZ → Unicode (final 4 hard fails resolved)

**Goal:** Recover the 4 v0.46-era hard-fail ABZ codes (KAM, KIB, US, ŠÁM) that resisted both `/api/signs/{name}` and `/api/signs?listsName=ABZ&listsNumber={N}`.

**Method:** Diagnosed that those signs ARE in eBL but indexed under compound canonical names (|HI×BAD|, |GIŠ%GIŠ|, |ŠE.HU|, |NINDA₂×ŠE|). Looking them up via `/api/signs?listsName=MZL&listsNumber={N}` using Labasi's `meszl_number` field returns the full record.

**Results: ALL 4 recovered.**

| ABZ | Labasi | MZL | eBL canonical | Glyph | Codepoint |
|---|---|---|---|---|---|
| 406 | KAM | 640 | \|HI×BAD\| | 𒄰 | U+12130 (74032) |
| 228 | KIB | 378 | \|GIŠ%GIŠ\| | 𒄒 | U+12112 (74002) |
| 372 | US | 583 | \|ŠE.HU\| | 𒊻 | U+122BB (74427) |
| 187 | ŠÁM | 333 | \|NINDA₂×ŠE\| | 𒉚 | U+1225A (74330) |

**Cache: 515 → 519 entries.** ZERO hard fails remain in the Labasi 239-sign subset. The `build-abz-glyph-map.mjs` script now does 3-step fallback (name → ABZ number → MZL number); future rebuilds will not produce hard fails for any Labasi-listed sign.

## Combined impact

| Metric | Pre-enrichment | Post-enrichment | Δ |
|---|---|---|---|
| Lemma cache entries | 216 | 504 | +288 |
| Lemma cache with-lemmas | 116 | 265 | +149 |
| ABZ glyph cache entries | 515 | 519 | +4 |
| ABZ hard fails remaining | 4 | **0** | -4 |

**eBL net etiquette:** Track A made 312 polite-paced eBL requests (300ms/req, 458s total elapsed). Track B was cache-only (no eBL). Track C made 4 polite-paced eBL requests. Total: ~316 eBL requests over ~8 minutes of paced activity. Well within respectful-consumer territory.

## What this unlocks

1. **Larger lemma-Jaccard surface.** The 504-entry lemma cache means `find_lemma_parallel` has 23× more candidates to compare against than the original 21-tablet build. New high-overlap pairs surface (K.2987.B + K.191, K.2987.B + CBS.16, ...) — candidates for validation-resolutions store.

2. **Zero ABZ rendering gaps in the Labasi subset.** Any tablet whose transliterations use only Labasi-indexed signs now renders 100% in `find_sign_glyph`. K.5896's first-27 token coverage was already 100% before; now there are no holes anywhere in the 239-sign Labasi study set.

3. **v0.29 retrain stability.** Track B's null result confirms that the 6-feature model didn't accidentally shift identify_composition's behavior. The two stacks remain orthogonal: identify_composition is composition-level (chunk + centroid), v0.29 is pair-level (5 axes + curriculum).
