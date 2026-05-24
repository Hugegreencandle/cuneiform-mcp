# cuneiform-mcp v0.31.0 — Active-Learning Feedback Loop + CI

First step toward v1.0 readiness: persistent validation-resolution store that grows the labeled-pair set organically as the prioritize_validation_queue is worked, plus minimal GitHub Actions CI catching build/smoke regressions before they reach main.

**Tool count: 81 → 83.**

## The new tools

### `record_validation_resolution`

Persists a human-confirmed verdict (positive / negative / uncertain) on a tablet pair to `~/.cache/cuneiform-mcp/validation-resolutions.json`. Canonical pair_id collapses `(A,B)` and `(B,A)` to one record. Re-recording the same pair UPDATES the prior verdict and returns the previous state in `previous`.

```
Workflow:
  1. prioritize_validation_queue → top-K candidates
  2. Dane reviews; concludes positive / negative / uncertain
  3. record_validation_resolution → persist verdict + rationale
  4. (offline) scripts/train-joint-pair-model.mjs reads persisted positives
     alongside methods-paper hardcoded list for next retrain
```

### `list_validation_resolutions`

Read companion. Filters: `verdict`, `source`, `tablet`, `since_iso`, `limit`. Sorts most-recent first. Surfaces v1.0-readiness progress: `(n_positive + 12 bootstrap) / 100`.

## Why this closes a v1.0 gate

The v0.29 Bayesian fusion model trains on n=12 hardcoded positives in `scripts/train-joint-pair-model.mjs` + n=40 synthetic random-pair negatives. The model's own `bootstrap_warning` says:

> *Bootstrap quality, NOT production. v1.0 will require ≥100 labeled pairs for production-quality fusion.*

Idea #5 in `docs/v0.31-plus-upgrade-ideas.md`:

> *Extend v0.21 `prioritize_validation_queue` with persistent resolution feedback. User marks a candidate as "real sibling" or "false positive"; the resolution feeds back into the v0.29 Bayesian model as a NEW labeled pair, growing the labeled set toward the ≥100 v1.0 threshold organically.*

v0.31 ships the persistence half. The training-script integration is a 2-3 line change to `scripts/train-joint-pair-model.mjs` once enough positives accumulate; deferred to its own commit when the store reaches a useful threshold (~10+ new positives).

## CI — `.github/workflows/ci.yml`

Three checks on push to main and PRs:

- `npm run build` — TypeScript strict mode
- `npm run smoke` — all 83 tools register + envelope contract
- `node scripts/round17-validation-resolutions-audit.mjs` — cache-independent unit audit

Cache-dependent regression audits (the 25-script suite at `~/tmp/regression-v0.30.log`) are NOT yet wired into CI — they require ~36K-entry fragment-metadata cache + sign-embeddings + chunk index. v0.32+ will add a cache-bootstrap job once the network-dependent fetches can be controlled (eBL rate limits make CI invocation a real concern).

## Calibration tally — Round 17

| Audit | Class | Effect |
|---|---|---|
| `round17-validation-resolutions-audit.mjs` | **NEW** | 15/15 PASS: empty store sanity, record+read round-trip, canonical pair_id (order-independent), update semantics, filter by verdict/source/tablet, stats consistency, self-pair rejection |

## Methods paper §3.18

**Claim 38:** *Persistent active-learning feedback (validation-resolutions store) is the missing infrastructure for migrating the v0.29 Bayesian fusion model from bootstrap quality (n=12 hardcoded positives) to production quality (≥100 confirmed positives). Coupled with prioritize_validation_queue's information-gain ranking, the system constitutes a closed loop: rank uncertain pairs → human review → persist verdict → retrain. The decoupling of verdict persistence from model retraining (verdicts in JSON store, retraining as offline script) preserves reproducibility and makes the active-learning trajectory auditable.*

## Reproducibility

```bash
npm run build
npm run smoke                                # 83 tools registered
node scripts/round17-validation-resolutions-audit.mjs   # 15/15 PASS
```

The audit is cache-independent (no eBL fetches, no sign-embedding load, no chunk-index load). Suitable for CI without bootstrap.

## Outstanding (deferred to v0.32+)

- Training-script integration: `scripts/train-joint-pair-model.mjs` should read `~/.cache/cuneiform-mcp/validation-resolutions.json` and union `verdict==='positive'` resolutions with the hardcoded list. Trivial change, deferred until store has accumulated.
- Full regression suite in CI: needs cache-bootstrap orchestration.
- Tier-1 idea #1 (`identify_composition`) + idea #4 (`score_tablet_completeness`) — next two v0.32 candidates per the v0.31+ doc sequencing.
