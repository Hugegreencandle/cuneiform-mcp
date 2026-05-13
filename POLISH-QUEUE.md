# Polish Queue

Backlog of small fixes, refinements, and follow-up ideas for cuneiform-mcp. Pull from the top when picking up a polish session. Mark `- [x]` when shipped (with commit sha).

## P0 — bugs / correctness

- [ ] **Stale entries in lineToVec cache vs eBL fragment record availability.**
  Discovered 2026-05-14 while chasing the BM.122625 ↔ K.2862 join candidate.
  `IM.77027` and `VAT.9304` are in the local lineToVec corpus (~36,328 fragments cached). They surface as tied top hits for K.2862 (score=76 raw, 126 weighted — identical scores, almost certainly the same structural fingerprint). But `GET /api/fragments/IM.77027` and `GET /api/fragments/VAT.9304` both return `fetch failed` (same moment, both at once — could be a transient eBL outage rather than a stale-cache issue).
  - Repro: `find_join_candidates BM.122625` → top results include IM.77027 and VAT.9304 → `get_fragment IM.77027` → fetch failed.
  - First step: retry over the next few days. If failure persists, the lineToVec corpus has entries the fragment-record API no longer serves.
  - Fix options: (a) on `loadCorpus`, drop entries whose `/fragments/<id>` HEAD 404s; (b) leave the cache alone and tag missing-record results in the `find_join_candidates` output (`"BM.X (record unavailable)"`); (c) add a `--validate` flag to the prefetch crawl that prunes dead museum-numbers.
  - Estimated time: 30 min to retry-check + 1 hr to wire validation if real.

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
