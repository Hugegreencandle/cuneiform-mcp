# Discovered Composition Exemplars (v0.54)

Generated 2026-05-25 from `scripts/build-corpus-composition-assignments.mjs`.

Scanned the top-200 chunk-host tablets via v0.32 `identify_composition` (2.7s elapsed, 14ms/tablet). Identified 20 tablets classifying at p > 0.9 to a registry composition but NOT currently in the registry's exemplar_tablets list.

These are **candidate exemplars** for registry expansion AND **candidate positives** for the validation-resolutions store (record_validation_resolution with verdict="positive" + rationale citing the assignment).

---

## Summary

| Metric | Value |
|---|---|
| Tablets scanned | 200 (top chunk-hosts, range 2,737 → 199 hosted chunks) |
| Elapsed | 2.7s (14ms/tablet) |
| High-confidence assignments (>0.9) | 21 (1 registry K.5896 + 20 discovered) |
| Discovered Mīs pî candidates | 16 |
| Discovered Udug-ḫul candidates | 4 |
| Other (Šurpu, EAE, etc.) | 0 discovered at this threshold |

---

## Discovered Mīs pî exemplar candidates (16)

| Tablet | Confidence | Period | Genre |
|---|---|---|---|
| K.140 | 0.995 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| K.3270 | 0.994 | Neo-Assyrian | CANONICAL → Magic → Varia → Zu |
| K.2866 | 0.994 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.155 | 0.994 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| K.44 | 0.993 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.4945 | 0.991 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.3343 | 0.991 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| K.136 | 0.990 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.2445 | 0.990 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| K.2290 | 0.989 | Neo-Assyrian | CANONICAL → Technical → Medicine |
| K.2419 | 0.989 | Neo-Assyrian | CANONICAL → Technical → Medicine |
| Rm-II.156 | 0.989 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.10935 | 0.988 | Neo-Assyrian | CANONICAL → Technical → Medicine |
| 1880,0719.152 | 0.988 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| K.131 | 0.973 | Neo-Assyrian | CANONICAL → Divination → Teratology |
| (one more) | | | |

**Genre-cross-check signal:** 11 of 16 candidates have explicit Magic/Hymns/Literature genres — consistent with Mīs pî's CANONICAL → Magic → Exorcistic ancestry. 3 fall under Technical → Medicine (K.2290, K.2419, K.10935) and 1 under Divination → Teratology (K.131). The medicine cluster suggests Mīs pî and *šumma amēlu* medical texts share ritual vocabulary (already documented in the BM.77056 §3.9.1 KAR-44 finding). The Divination/Teratology outlier (K.131) may be a methodological false positive worth flagging in the validation queue.

## Discovered Udug-ḫul exemplar candidates (5)

| Tablet | Confidence | Period | Genre |
|---|---|---|---|
| K.1284 | 0.994 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| Rm.290 | 0.992 | Neo-Assyrian | CANONICAL → Literature → Hymns |
| Sm.1061 | 0.992 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.2427 | 0.975 | Neo-Assyrian | CANONICAL → Magic → Exorcistic |
| K.2297 | 0.960 | Neo-Assyrian | CANONICAL → Divination → Teratology |

Udug-ḫul candidates skew strongly Magic → Exorcistic, expected. K.2297 (Teratology) is the same kind of genre-cross-check outlier as Mīs pî's K.131.

## Methodological note

**This is a discovery, not a verification.** identify_composition's high-confidence assignment is necessary but NOT sufficient evidence for true exemplar status. Each candidate should be:

1. Validated against published editions (Walker & Dick 2001 for Mīs pî, Geller 2016 for Udug-ḫul)
2. Recorded via record_validation_resolution with verdict="positive" / "uncertain" / "negative"
3. Optionally added to the registry's exemplar_tablets list if confirmed

20 candidates × scholarly review ~ 1-2 hours per candidate = ~30-40 person-hours to fully validate. The active-learning prioritizer (v0.52) can sequence this work optimally.

## Per-composition discovery rates

Registry compositions ranked by discovered-candidate yield at p>0.9:

| Composition | In registry | Discovered (p>0.9) | Growth opportunity |
|---|---|---|---|
| Mīs pî | 7 | 16 | 16/7 = 2.3× expansion candidate |
| Udug-ḫul | 2 | 5 | 5/2 = 2.5× expansion candidate |
| Šurpu | 2 | 0 (in scanned set) | scan larger pool |
| Bīt salāʾ mê | 1 | 0 | scan larger pool |
| Maqlû | 4 | 0 | scan larger pool |
| EAE | 3 | 0 | scan larger pool |
| Šumma izbu | 3 | 0 | scan larger pool |
| Šumma ālu | 3 | 0 | scan larger pool |
| Bārûtu | 3 | 0 | scan larger pool |
| Diri/Aa | 2 | 0 | scan larger pool |

The mis_pi + udug_hul lead is partly explained by chunk-density — both are highly-attested in eBL with substantial parallel-cluster structure, while the divination + lexical compositions are more scattered.

## Scaling implications

Extrapolating: if 200 chunk-host tablets yielded 20 discoveries, scanning the full chunk-index (4,922 tablets) would yield approximately:
- 4922 / 200 × 20 = **~490 discoveries at p>0.9**, conservatively half that as candidates (the long tail of low-host tablets has weaker signal)
- ~250 candidates × 1 hour validation = 250 person-hours to label
- Even labeling 88 of them (to reach v1.0 G1 of 100 positives) is ~88 hours

This is **a tractable path to the v1.0 ≥100-positives gate**. Combined with v0.52's active-learning prioritizer, the path is concrete:
1. Scale corpus-wide assignment scan (~30 min)
2. Filter to p>0.9 discovered candidates (sub-second)
3. Use recommend_validation_target to prioritize labeling order
4. Scholar reviews + records via record_validation_resolution
5. Loop

The v1.0 G1 gate is now **operationally reachable**, not just methodologically.

## Reproducibility

```bash
# Build the assignment cache (one-time, ~3s for 200 / ~3min for full corpus)
COMPOSITION_ASSIGN_N=200 node scripts/build-corpus-composition-assignments.mjs

# Or with a specific target list
COMPOSITION_ASSIGN_TARGETS=K.140,K.3270,K.2866 node scripts/build-corpus-composition-assignments.mjs

# Cache location: ~/.cache/cuneiform-mcp/composition-assignments.json
```
