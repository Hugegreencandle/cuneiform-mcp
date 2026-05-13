# Polish Queue

Backlog of small fixes, refinements, and follow-up ideas for cuneiform-mcp. Pull from the top when picking up a polish session. Mark `- [x]` when shipped (with commit sha).

## P0 — bugs / correctness

- [ ] **`get_fragment` fails on bloated fragment records (~1MB+).**
  Diagnosed 2026-05-14 while chasing the BM.122625 ↔ K.2862 join candidate. **NOT a stale-cache issue** — retry on the same day distinguished two cases:
  - `VAT.9304` — failed first try, succeeded on retry. Transient eBL blip. Ignore.
  - `IM.77027` — failed both tries. Direct `curl` succeeded with **HTTP 200, 1,064,737 bytes (~1 MB), 7.54 s**. The fragment has a massive `record[]` revision array (dozens of entries from one editor "Simkó" in early Feb 2026) bloating the JSON payload.
  - `IM.67587` — also fails through MCP. Same pattern: likely a similarly bloated record.

  Repro:
  ```
  find_join_candidates BM.122625 → top hits include IM.77027 + IM.67587
  get_fragment IM.77027 → "eBL fetch failed: fetch failed (...)"
  curl https://www.ebl.lmu.de/api/fragments/IM.77027 → HTTP 200, ~1 MB, ~7-8 s
  ```

  Code surface: `src/index.ts:928` does bare `await fetch(url, { headers: { "User-Agent": USER_AGENT } })` with no timeout, no abort signal, no body-size handling. The `fetch failed` string is undici's internal error — thrown from inside `fetch` or `res.json()` before the catch on line 929 can hit (the catch only wraps the initial `fetch` call, not the `await res.json()` on line 964, so JSON-parse failures on big bodies escape).

  Likely root cause: undici quirk on responses with very large `record[]` arrays — possibly TLS connection-reset under slow body-read, possibly a streaming-parse issue. Same machine handles 1 MB curl fine.

  Fix options (cheap → robust):
  1. Wrap the JSON parse in its own try/catch so the error message is honest (`JSON parse failed: …`) instead of pretending it's a network failure.
  2. Strip the `record[]` field server-side: switch to `${URL}?fields=museumNumber,publication,description,...` (verify eBL accepts a `fields` filter — `FragmentQuery.ts` doesn't list one; may need projection at parse time instead).
  3. After fetching, immediately drop `record[]`, `lineToVec`, `signs`, `notes[]`, and any other heavy fields from `f` before formatting. The current formatter only uses ~12 top-level keys anyway.
  4. Use `node:https` with explicit timeout + retries, like the ORACC path already does for the InCommon TLS quirk.

  Recommended sequence: **(1) first** (always-on, takes 5 min, surfaces the real error), then **(3)** as the actual fix (~30 min — projection at parse time costs nothing and shrinks memory pressure across all calls).

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
