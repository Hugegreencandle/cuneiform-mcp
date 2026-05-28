# Cuneiform-MCP — Upgrade Plan (post-v0.69)

**Status as of 2026-05-29:** v0.69.0, 110 registered tools, vitest green, branch `feat/quotation-network`.
Methods paper desk-rejected by JOHD on format (needs a ~5K-word discussion-paper rework; content never evaluated).

**The three v1.0 gates:**
- **G1 — paper** (external): JOHD discussion-paper rework invited by the editor.
- **G2 — ≥100 labeled positives** (the long pole): currently ~12–29.
- **G3 — API freeze**: ✅ done (`docs/API-STABILITY-v1.0.md`).

**Governing principle:** the highest-leverage "upgrade" right now is **closing G2, not adding tool #111.**

---

## Track A — Close the v1.0 gate (highest leverage)

The active-learning flywheel is built but barely turned. These three feed each other.

### A1 · §3.4 decision-tree boundary calibration — *small, high-confidence, evidence in hand*

Two soft-spots in `src/comparePair.ts` `classify()`, both surfaced by live labeling sessions. **Verified 2026-05-29** against the live source (line numbers + branch logic confirmed; the two pairs are NOT yet in any test → A1 adds regression coverage).

- **Soft-spot 1 (`comparePair.ts:254`):** the `scribCos < 0.5` cutoff in the `same_composition_different_scribe` branch. **BM.38552 ↔ K.9270** has scribCos=0.503 (3‰ over), fuzzy_J=0.404, thematic=0.87, 102-sign contiguous run — falls through the gap (0.5 ≤ scribCos < 0.7 with fuzzyJ≥0.3 is caught by neither line 250 `scribCos≥0.7` nor line 254 `scribCos<0.5`) to `weak_relationship [low]`, while the joint-pair model says P=0.94.
  **Fix:** widen line 254 to `scribCos < 0.7` with confidence tapering — `high` when scribCos<0.5, `medium` in the 0.5–0.7 band.
- **Soft-spot 2 (`comparePair.ts:263`):** `thematic_only` ignores `scribal_cos` entirely. **K.17494 ↔ K.47** has scribal=0.697 (3‰ under the line-259 `≥0.7` high-confidence cut), substitution_lift_z=−8.76 (strongest same-scriptorium signal of the session), but returns `thematic_only [medium]`.
  **Fix:** guard the line-263 branch — if `scribal_cos ≥ 0.6` while thematic_only conditions match, prefer `same_scribe_different_composition [medium]`.

**Validation:** re-run vitest + the consolidated regression-audit harness (`scripts/regression-audit-all-rounds.mjs`); confirm both pairs reclassify without regressing the existing audits. New focused test pins the two counterexamples + guards the untouched branches.
**Risk:** low — threshold widenings with named counterexamples, not new logic.

### A2 · Turn the flywheel end-to-end — *the actual G2 mover*

`auto_validate_from_resolutions` (v0.64) has never been run live. Run `prioritize_validation_queue` → `auto_validate_from_resolutions` (propose mode) → review the generated proposals doc → hand-feed accepted ones into `record_validation_resolution`. This is the only path that moves 12→100. Mostly operational, not code.
*(Note: `docs/auto-validation-proposals-2026-05-27T21-50-14Z.md` exists — a prior propose-mode run output; review/accept those.)*

### A3 · Retrain + recalibrate after labels land

Once A2 adds labels: retrain the joint-pair logistic model (`scripts/train-joint-pair-model.mjs` / `recalibrate-joint-pair-model.mjs`), recompute held-out AUC, re-check ECE. The v0.57 finding was the model is calibration-disciplined out of the box (Platt was a null result) — confirm that holds as n grows past 42.

---

## Track B — Quotation-network calibration (research payoff)

The v0.68 `compute_quotation_network` output is suspicious: 10 nodes, 74 edges, one SCC of size 10, zero isolates — a near-complete graph where every composition quotes every other, in-degree == out-degree for all 10 nodes. Signature of (a) an unnormalized chunk_parallel weight and (b) no real direction inference — edges are symmetric, so "top quoted-from" and "top quoters" are identical lists.

**Upgrade:** asymmetric directionality (base-text vs commentary) needs an asymmetry signal — chronology (period of witnesses) or quotation containment (A's chunks ⊂ B's). Plus an edge-weight threshold so the graph isn't complete.
**Payoff:** a calibrated quotation network is a genuinely novel result for the paper. High research value.

---

## Track C — Deferred Tier-2 tools (need a design conversation first)

- **T2-B · cost-aware memoization wrapper** — deferred from overnight; cache-key design needs judgment (safe to memoize across sessions vs. must invalidate on cache-snapshot change). Scope keys before coding.
- **T2-C · `ingest_external_tablet`** — deferred per memory; sign-normalization is brittle. Highest user-facing upside (analyze a tablet not in eBL) but highest risk. Needs a normalization-contract design pass before any code.

---

## Track D — v1.0 + paper hygiene (low-glamour, gating)

- **README refresh** — headlines v0.18.3 while package is v0.69 (~50 versions stale). First thing a reviewer sees on a v1.0 tag / resubmission. Regenerate tool count (110), release lineage, "what's new." **Do before any v1.0 tag regardless.**
- **Schema drift check** — verify `schemas/*.schema.json` match actual `structuredContent` shapes.
- **PROTOCOL.md envelope verification** against v0.18+ tools (flagged stale).
- **JOHD discussion-paper rework** — the ~5K-word cut the editor invited. Non-code but time-sensitive while the invitation is fresh.

---

## Track E — Enrichment as byproduct (cheap win)

Active learning keeps surfacing tablets with empty `genres_flat` (K.7603, K.9270, K.17494…). Each accepted positive is an implicit genre hint. A small tool/flag that emits proposed `genres_flat` enrichments from the labeling trail — observability win that falls out of work already happening.

---

## Recommended order

1. **A1** — contained, evidence in hand, improves the classifier that gates labeling. *(in progress 2026-05-29)*
2. **A2** — actually move G2 (12→100).
3. **B** — next "real" feature with paper payoff.
4. **Track D README refresh** — slot in before any v1.0 tag regardless.
