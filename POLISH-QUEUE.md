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

- [ ] **Surface the matcher's measured recall in user-facing text.** N=50 validation (2026-05-14) shows recall@15 = 3.4% on known joins where both pieces have `lineToVec`. Current tool description says "not all hits are joins" (true) but doesn't quantify. Options: add a one-paragraph "Performance" section to `README.md`, append a note to the tool description, or leave as-is. See `VALIDATION-2026-05-14.md` for the full rank distribution and the three successful hits.

- [ ] **Second crawl pass covering the `/fragments/all-signs` gap.** K.2862's three known siblings (K.2868, K.5065.A, Rm.111) have transliteration content at eBL but are missing from `/fragments/all-signs` and have empty `lineToVec` on `/fragments/<id>`. eBL stats: 36,583 transliterated, 36,493 in all-signs, 36,328 in our cache with non-empty `lineToVec` — gap of ~250 fragments, concentrated in joined ones. Pass would crawl every museum number declared in any cached fragment's `joins[]`; most will return empty, but some will fill the gap. Cost: ~1,000 extra HTTPs, ~3 min.

- [x] **Retract yesterday's "BM.122625 ↔ 1881,0204.196 → multi-piece join group" claim** in the project memory + session log. At full corpus, `1881,0204.196` is not in BM.122625's top-5. The result was a small-corpus artifact (1,419 fragments). Done as part of this writeup (no separate commit — see `VALIDATION-2026-05-14.md` § "Why recall is this low" item 3).

## Done

- (P0) `get_fragment` fetch failure via undici Happy Eyeballs (`d9c1038` + `2a9d01c`)
- (P1) `find_join_candidates` ranker semantics + genre/joins filters (`2a9d01c`)

<!-- Add new items at the bottom of the appropriate priority section. Roll completed items into "Done" with commit sha. -->
