# Polish Queue

Backlog of small fixes, refinements, and follow-up ideas for cuneiform-mcp. Pull from the top when picking up a polish session. Mark `- [x]` when shipped (with commit sha).

## P0 — bugs / correctness

- [x] **`get_fragment` failed on some fragments — undici IPv6 timeout, NOT body size.** Fixed via `dns.setDefaultResultOrder("ipv4first")` + `net.setDefaultAutoSelectFamily(false)` at top of `src/index.ts` (`d9c1038` then extended in `2a9d01c`, 2026-05-14).

  Original symptom (2026-05-14): `IM.77027` and `IM.67587` returned `"eBL fetch failed: fetch failed (...)"` while same-day `curl` succeeded. Initial hypothesis was payload bloat (IM.77027 returned ~1 MB with a 41-entry `record[]`). **Wrong.** Probing the error cause exposed `UND_ERR_CONNECT_TIMEOUT` against `2001:4ca0:800::8af6:e1c7:443:443` after 10 s — eBL publishes AAAA records but its IPv6 listener is intermittent. curl does Happy Eyeballs and falls back to IPv4; undici does not by default. IM.67587 actually has a 4-entry `record[]` — the "bloated record" theory disintegrates when you check.

  **2026-05-14 follow-up — `ipv4first` alone is insufficient on Node ≥ 20.** When polish-pass smoke testing on K.2862 the next morning, the same "fetch failed" returned in ~660ms even with `dns.setDefaultResultOrder("ipv4first")` in effect. Root cause: undici/net runs its own socket-level Happy Eyeballs (`autoSelectFamily`, default `true` since Node 20) which races IPv6 and IPv4 connections independently of the DNS-resolution order, sees the failing IPv6 SYN first, and surfaces `ETIMEDOUT` instead of waiting for the IPv4 success. Direct `node:https` to the literal IPv4 address worked fine. Repro: `node --input-type=module -e 'import dns from "node:dns"; dns.setDefaultResultOrder("ipv4first"); await fetch("https://www.ebl.lmu.de/api/fragments/K.2862")'` fails on undici-Happy-Eyeballs even with the env hint. Real fix: ALSO call `net.setDefaultAutoSelectFamily?.(false)` so the resolved-first address is the one actually dialed. Verified end-to-end on K.2862 + BM.122625 + IM.77027 (all return 200 in 1.5-7 s).

  Validation (combined): full 5-fragment sweep + the new structural-similarity flow on K.2862 / BM.122625 passes. Fix is process-wide — every host the MCP touches (ORACC, CDLI, eBL) now prefers IPv4 AND disables the socket family race. ORACC and CDLI never used IPv6 anyway; only eBL was affected.

  Trade-off: future IPv6-only infrastructure becomes invisible. Not a concern for the current source set (eBL, ORACC, CDLI all have functional IPv4). Revisit if any source drops IPv4.

## P1 — UX / labeling

- [x] **`find_join_candidates` is a structural-similarity ranker, not a join finder.** Shipped in `2a9d01c` (2026-05-14). All four sub-items landed:
  1. Tool description rewritten to "Rank eBL fragments by line-structure fingerprint similarity… surfaces parallel manuscripts + structurally similar bilinguals + possible physical joins (not all hits are joins)."
  2. Each candidate now renders its `genres` (full category path) and `joins` (known join-group siblings) inline so the reader can disambiguate same-composition vs structurally-similar-but-unrelated at a glance.
  3. `filter_known_joins` flag (default false) drops candidates already listed in the target's `joins[]`.
  4. `require_genre_overlap` flag (default false) drops candidates that don't share at least one genre category with the target. **Note:** `CANONICAL` is the universal eBL top-level marker for the curated corpus, so the overlap test explicitly skips it — otherwise every fragment-pair "overlaps" and the filter is a no-op. Display still shows the full path including `CANONICAL`.

  Validation: ran the K.2862 + BM.122625 cases from yesterday's chase. With `require_genre_overlap=true`, Magic-genre hits (IM.67587/Šurpu, IM.67547/Ardat lilî) are correctly excluded for both Lugal-e targets, while the Literature-genre hits (K.2362, IM.77027, K.2361, VAT.9304, IM.67597) are kept. With `filter_known_joins=true`, the 4-fragment K.2862 cluster and the 3-fragment BM.122625 cluster are excluded from the search space (visible in the "X fragments excluded" header).

  Implementation: target's full record is always fetched once (needed for target genres + joins to filter against), then the union of top-K from each ranking is enriched concurrently (pool of 5). `enrichmentCache` is process-wide so repeat queries within a session are free. Pure additive — old call shapes (`{museum_number}` only, or with `top_k`) behave identically aside from the new inline genres/joins lines.

## P2 — research / outreach (Dane-driven, non-code)

- [ ] **Auth0 outreach for eBL** — draft at `AUTH0-OUTREACH-DRAFT.md`. Would unlock cross-validation of `find_join_candidates` against eBL's hosted `/fragments/<id>/match` endpoint. Not blocking; local implementation works. **Validation 2026-05-14 raises this from "nice-to-have" to "useful":** if hosted `/match` returns the same ~3% recall@15 we measured, the algorithm is the ceiling; if it returns higher, there's a TS port bug to find. See `VALIDATION-2026-05-14.md`.

## P3 — findings worth deciding on

- [x] **Surface the matcher's measured recall in user-facing text.** Shipped 2026-05-14 with the v0.4 ship: README and both tool descriptions now quote the validated numbers (3.4% for lineToVec, 25% for trigram).

- [x] **Second crawl pass covering the `/fragments/all-signs` gap.** CLOSED 2026-05-14 as no-op. The premise was wrong: the polish-queue note assumed K.2862's siblings had transliteration content at `/fragments/<id>` even though missing from `/fragments/all-signs`. They don't. Probed 106 gap candidates discovered from 300 random K.* fragments' `joins[]` — every one returns 200 OK but with empty `signs` and empty `lineToVec`. 46 of 300 K.* fragments (15%) touch at least one gap-member, so the gap is common but uniformly empty. eBL knows these museum numbers exist (because in-corpus fragments declare joins to them) but has no transliteration content recorded yet. Full writeup: `GAP-PROBE-2026-05-14.md`. **Side-finding worth surfacing as a future UX item:** `find_parallel_text` could annotate "known sibling, no transliteration available at eBL" when the target has joins to gap fragments — informational only, not a matcher improvement.

## P4 — sign-trigram follow-ups (post-v0.4)

- [x] **Run a clean N=100 trigram validation when eBL is healthy.** SHIPPED 2026-05-14. seed=137 N=101 (one over due to concurrency overshoot) on healthy eBL: recall@15 = 38/180 = **21.1%**. Combined with the seed=42 baseline (22/87 = 25.3%) we get 60/267 = **22.5%** across both seeds with 95% CI ≈ [17%, 28%]. The original 25.3% sat on the optimistic end; 21-22% is the more reliable headline number. The truncated 19.3%/N=57 result was within sampling noise. **35.6% zero-trigram-overlap floor** confirmed at full sample size — siblings with zero shared trigrams are the hard algorithmic limit, identical fraction to seed=42 baseline. Phase 1 took 540s (2,171 fetches for 101 keepers, 4.6% keeper rate matches the truncated run, confirming eBL outage was the only difference last time). Full writeup: `VALIDATION-N100-2026-05-14.md`.

- [x] **Try filtering `X` (unreadable) tokens from trigrams.** SHIPPED `drop ≥2 X` 2026-05-14. Tested 5 strengths against the 50/87 baseline. **Recall@15 unchanged at 22/87 (25.3%)** — no filter strength rescues a sibling into top-15. But median rank of known siblings compresses dramatically: 89 → 26 (3.4×), mean 1,952 → 575. One sibling (`BM.39639 → BM.38610`) rescued into top-30 (rank 89 → 22 under drop-≥2X). Seven siblings lose any-rank visibility, all baseline rank ≥1,716 (invisible regardless). `drop ≥2 X` picked over the polish-queue's literal `drop anyX` spec because it produces the same K=30 rescue at a better landing rank (22 vs 28) and preserves "1×X" trigrams (two real signs + one damaged position = real evidence, not noise). Live in `src/signsIndex.ts:trigramsFromSigns`. Full writeup: `X-FILTER-EXPERIMENT-2026-05-14.md`.

- [x] **Try sign-variant normalization** — SHELVED 2026-05-14 (negative result). Wrote `scripts/validate-trigram-normalized.mjs` testing 6 variants (`vN`-collapse, slash-split, letter-suffix collapse, `nN`-variant collapse, all-conservative, all-aggressive) against the same 50 target / 87 sibling baseline. Pure-collapse rules (`vN`, letter-suffix, `nN`) produced **zero rank changes anywhere in the 87-sibling set** — the variant forms exist (~60K total occurrences) but don't co-occur in trigram windows that contain join evidence. Slash-split actively hurt: lost K.18780 → K.9041 from rank 14 to 16 because Cartesian-product expansion inflates the Jaccard denominator uniformly across candidates faster than it grows true-pair intersections. 25.3% baseline stands. Full writeup: `NORMALIZATION-EXPERIMENT-2026-05-14.md`. `find_parallel_text` ships without normalization.

- [ ] **Tag eBL `joins[]` entries by physical-vs-parallel.** `Ist-A.7` ↔ `VAT.10383` is in `joins[]` but they're parallel manuscripts (literally identical opening signs), not physical pieces of one tablet. Filtering these out would let us measure pure-physical-join recall separately. Probably requires an Assyriologist's review of edge cases — not a hobby-scale project.

- [x] **Retract yesterday's "BM.122625 ↔ 1881,0204.196 → multi-piece join group" claim** in the project memory + session log. At full corpus, `1881,0204.196` is not in BM.122625's top-5. The result was a small-corpus artifact (1,419 fragments). Done as part of this writeup (no separate commit — see `VALIDATION-2026-05-14.md` § "Why recall is this low" item 3).

## Done

- (P0) `get_fragment` fetch failure via undici Happy Eyeballs (`d9c1038` + `2a9d01c`)
- (P1) `find_join_candidates` ranker semantics + genre/joins filters (`2a9d01c`)
- (P4) Sign-variant normalization — shelved, negative result (`NORMALIZATION-EXPERIMENT-2026-05-14.md`)
- (P4) X-trigram filter (`drop ≥2 X`) — shipped, median rank 89 → 26 (`X-FILTER-EXPERIMENT-2026-05-14.md`)
- (P3) `/fragments/all-signs` gap-fill crawl — closed as no-op, gap fragments are uniformly empty stubs at eBL (`GAP-PROBE-2026-05-14.md`)
- (P4) N=100 trigram re-validation — 21.1% on seed=137, combined 22.5% across both seeds with CI [17%, 28%] (`VALIDATION-N100-2026-05-14.md`)

<!-- Add new items at the bottom of the appropriate priority section. Roll completed items into "Done" with commit sha. -->
