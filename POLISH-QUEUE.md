# Polish Queue

Backlog of small fixes, refinements, and follow-up ideas for cuneiform-mcp. Pull from the top when picking up a polish session. Mark `- [x]` when shipped (with commit sha).

## P0 — bugs / correctness

- [x] **`get_fragment` failed on some fragments — undici IPv6 timeout, NOT body size.** Fixed via `dns.setDefaultResultOrder("ipv4first")` at top of `src/index.ts` (`d9c1038`, 2026-05-14).

  Original symptom (2026-05-14): `IM.77027` and `IM.67587` returned `"eBL fetch failed: fetch failed (...)"` while same-day `curl` succeeded. Initial hypothesis was payload bloat (IM.77027 returned ~1 MB with a 41-entry `record[]`). **Wrong.** Probing the error cause exposed `UND_ERR_CONNECT_TIMEOUT` against `2001:4ca0:800::8af6:e1c7:443:443` after 10 s — eBL publishes AAAA records but its IPv6 listener is intermittent. curl does Happy Eyeballs and falls back to IPv4; undici does not by default. IM.67587 actually has a 4-entry `record[]` — the "bloated record" theory disintegrates when you check.

  Validation: same 5-fragment sweep that previously failed on IM.77027 + IM.67587 now passes on all five (IM.77027 3.5 s, IM.67587 0.9 s, VAT.9304 1.6 s, K.2862 1.5 s, BM.122625 2.3 s) with `ipv4first` enabled. The fix is process-wide — every host the MCP touches (ORACC, CDLI, eBL) now prefers IPv4. ORACC and CDLI never used IPv6 anyway; only eBL was affected.

  Trade-off: future IPv6-only infrastructure becomes invisible. Not a concern for the current source set (eBL, ORACC, CDLI all have functional IPv4). Revisit if any source drops IPv4.

## P1 — UX / labeling

- [ ] **`find_join_candidates` is a structural-similarity ranker, not a join finder.**
  The lineToVec algorithm encodes line structure only (TEXT_LINE / SINGLE_RULING / DOUBLE_RULING / TRIPLE_RULING). For canonical bilingual literary fragments (Lugal-e, Enūma Eliš, Šurpu, Maqlû, hymns/prayers) it surfaces *other parallel manuscripts of the same composition* plus *structurally similar unrelated bilinguals* — not necessarily physical joins. Concrete example from the 2026-05-14 K.2862 chase:
  - BM.122625 ↔ K.2862 mutually rank each other top-10 weighted (60/60) → **both are Lugal-e**, different scripts (Middle Assyrian / Neo-Assyrian), but they have *separate* known physical join clusters. They are parallel manuscripts.
  - K.2862 #3 weighted = K.2361, which is a **prayer to Nabu** (Hymns → Divine), not Lugal-e at all. Algorithm picked it up because both share the bilingual line / Akkadian gloss / single-ruling rhythm.
  - This matches eBL's own algorithm exactly — not a bug, but the tool's surface labeling could be clearer.
  - Ideas:
    1. Rename the tool description from "Find fragments that may physically join…" to "Find fragments with similar line-structure fingerprints (parallel manuscripts + structurally similar texts + possible physical joins)."
    2. Surface each candidate's `genres[]` and `joins[]` in the result so the user can immediately see "same composition?" / "already in a known cluster?"
    3. Add a `filter_known_joins` flag (default false) that suppresses candidates already in the target's `joins` field.
    4. Add a `require_genre_overlap` flag (default false) that filters to candidates sharing at least one genre.
  - Estimated time: ~2 hr for (1)+(2), additional ~2 hr for (3)+(4).

## P2 — research / outreach (Dane-driven, non-code)

- [ ] **Auth0 outreach for eBL** — draft at `AUTH0-OUTREACH-DRAFT.md`. Would unlock cross-validation of `find_join_candidates` against eBL's hosted `/fragments/<id>/match` endpoint. Not blocking; local implementation works.

## Done

(none yet)

<!-- Add new items at the bottom of the appropriate priority section. Roll completed items into "Done" with commit sha. -->
