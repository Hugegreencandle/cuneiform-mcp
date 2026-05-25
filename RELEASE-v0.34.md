# cuneiform-mcp v0.34.0 — Fragment Completeness (`score_tablet_completeness`)

Tier-1 idea #4 from `docs/v0.31-plus-upgrade-ideas.md` (~2 days estimated). Closes the Tier-1 short-scope items.

**Tool count: 85 → 86.**

## The new tool — `score_tablet_completeness`

Given a fragment, estimate what fraction of the original composition is preserved. Two complementary metrics:

| Metric | Definition | Interpretation |
|---|---|---|
| `sign_count_ratio` | `query.sign_count / largest_exemplar.sign_count`, clamped to [0,1] | **Physical-size proxy** — how big is this fragment vs the biggest known witness? |
| `chunk_coverage_ratio` | `\|query_chunks ∩ canonical_chunks\| / \|canonical_chunks\|` | **Fit-to-composition** — what fraction of the structural backbone does this fragment host? |

`canonical_chunks` = length-20 chunk hashes appearing in **≥2** of the composition's registry exemplars. The ≥2 threshold strips single-witness noise; what remains is the structural backbone shared across the tradition.

### Critical distinction surfaced by the audit

`sign_count_ratio` and `chunk_coverage_ratio` measure DIFFERENT things, and the audit's initial test runs exposed why this matters:

**K.5896 vs Mīs pî:** sign_count_ratio=0.488, chunk_coverage=0.974 (148/152)
**K.5896 vs Šurpu:** sign_count_ratio=1.000, chunk_coverage=0.000 (0/31)

The sign_count_ratio for K.5896 vs Šurpu is 1.0 because K.5896 (1,881 signs) dwarfs both Šurpu exemplars (BM.47463 + CBS.6060, both small). It clamps to the ceiling. But the chunk_coverage is exactly 0 — K.5896 hosts zero of Šurpu's canonical chunks. **chunk_coverage_ratio is the proper fit-to-composition metric;** sign_count_ratio is a physical-size proxy.

This is documented in §3.21 + the metric descriptions so consumers don't misread sign_count_ratio as "fit."

## Empirical finding — K.5896 is NOT the largest Mīs pî exemplar

The audit's T1 originally asserted that K.5896 would score `sign_count_ratio = 1.0` because the methods paper centers on it. The test FAILED: K.5896 has 1,881 signs, but **K.2987.B has 3,853 signs** — twice as large. K.5896 is the *most-cited* Mīs pî manuscript, not the *largest*.

This is a real methodological observation. Several §3.x claims that frame K.5896 as the "centerpiece" or "dominant" Mīs pî witness need the qualification "by chunk-overlap network centrality, not by physical size." Methods paper §3.21 records the finding and revises the framing.

## Composition resolution

Two paths:

1. **Explicit**: pass `composition_id` → metric computed against that composition's exemplar pool, with `composition.source='explicit'`.
2. **Inferred**: omit `composition_id` → identify_composition's top candidate is used IF confidence ≥ `fallback_min_confidence` (default 0.3). Otherwise `composition.source='unresolved'`, metrics become null.

This means the tool gracefully refuses to score completeness against a composition it can't confidently assign — preventing the "every fragment is 0% complete because we picked the wrong composition" failure mode.

## Round-20 calibration audit — 14/14 PASS

| Test | Result |
|---|---|
| T1: K.5896 sign_count_ratio ∈ (0,1) — substantial but not largest | ✅ ratio=0.488, largest=K.2987.B |
| T1b: largest Mīs pî exemplar is K.2987.B (§3.21 finding) | ✅ |
| T2: K.9508 sign_count_ratio < K.5896's | ✅ 0.047 vs 0.488 |
| T3: K.5896 chunk coverage ≥ K.9508's | ✅ 148 vs 65 |
| T4: Mīs pî has canonical-chunk backbone | ✅ 152 canonical chunks |
| T5: inference for K.5896 → mis_pi (conf 0.995) | ✅ |
| T6: high fallback_min forces 'unresolved' for unknown | ✅ |
| T7: include_chunk_lists populates preserved + missing arrays | ✅ 148+4=152 |
| T8: K.5896 vs surpu — chunk_coverage is the proper fit metric | ✅ 0.000 vs 0.974 |
| T9: lacuna_density ∈ [0,1] | ✅ K.5896 lacuna=0.027 |
| T10: graceful unknown-tablet handling | ✅ |

Audit script: `scripts/round20-score-completeness-audit.mjs`. Cache-dependent (chunk index + signs cache).

Regression rounds 17 + 18 + 19: all PASS unchanged.

## Methods paper §3.21, claim 41

**Claim 41.** *Fragment-vs-composition completeness must be reported on two axes — physical-size proxy (sign_count_ratio) and structural-fit (chunk_coverage_ratio against canonical-chunk backbone) — because they can dissociate strongly. K.5896 vs Šurpu produces sign_count_ratio=1.0 alongside chunk_coverage=0.0; conflating them would treat K.5896 as a complete Šurpu witness when it is in fact a complete Mīs pî witness mis-classified by an explicit composition_id override. The canonical-chunk backbone (length-20 hashes in ≥2 exemplars) is the structural invariant; the sign-count comparison is a physical-size proxy that ceilings out for large fragments.*

**Methodological note for §3.21:** K.5896 (1,881 signs) is the most-cited but NOT the largest Mīs pî exemplar; K.2987.B (3,853 signs) is. Several earlier §3.x framings of K.5896 as the "dominant" witness should be qualified as "dominant by chunk-overlap network centrality, not by physical size."

## Reproducibility

```bash
npm run build
npm run smoke                                          # 86 tools registered
node scripts/round20-score-completeness-audit.mjs      # 14/14 PASS
node scripts/round19-rooted-stemma-audit.mjs           # 17/17 PASS (regression)
node scripts/round18-identify-composition-audit.mjs    # 10/10 PASS (regression)
node scripts/round17-validation-resolutions-audit.mjs  # 15/15 PASS (regression)
```

## Tier-1 status (`docs/v0.31-plus-upgrade-ideas.md`)

- ✅ #1 `identify_composition` — v0.32
- ✅ #2 `build_stemma_with_rooting` — v0.33
- 🟦 #3 `find_composition_lineage` — composes #1 + §3.11 stemma + scribal-school graph. ~5 days. The biggest remaining Tier-1 item.
- ✅ #4 `score_tablet_completeness` — v0.34 (this release)
- ✅ #5 `record_validation_resolution` — v0.31

4 of 5 Tier-1 items shipped. Only `find_composition_lineage` remains.

## Outstanding (deferred to v0.35+)

- Tier-1 idea #3 `find_composition_lineage`
- Tier-2 idea #7 `damaged_passage_composition_probability` — natural follow-up to v0.34 (sign_count_ratio + chunk_coverage feed into a probabilistic restoration prior)
- Cache-bootstrap orchestration so the chunk-dependent audits can run in CI
- Registry expansion to EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa, Maqlû
