# cuneiform-mcp v0.35.0 — Composition Lineage (`find_composition_lineage`)

Final Tier-1 idea from `docs/v0.31-plus-upgrade-ideas.md` (#3, ~5 days estimated). **All 5 Tier-1 items now shipped.**

**Tool count: 86 → 87.**

## The new tool — `find_composition_lineage`

Composes four existing primitives into a transmission tracer:

| Component | Source | Role |
|---|---|---|
| Composition resolution | v0.32 registry + identify_composition | Anchor the cluster to a published composition |
| BFS witness expansion | v0.22 build_canonical_recension_tree | Enumerate cluster members via shared chunks |
| Period + provenance | v0.18 fragment metadata | Bucket each witness by (period × provenance) |
| Chunk-sharing edges | v0.20 chunk-hash index | Quantify transmission between adjacent nodes |

**Output structure:**

- `witnesses[]` — BFS-expanded cluster with period/provenance per tablet + `is_registry_exemplar` flag
- `transmission_nodes[]` — (period × provenance) buckets, sorted by period_rank ascending
- `transmission_edges[]` — pairs of nodes sharing ≥`min_edge_chunks` length-20 chunks, with bridge_witness_ids
- `bridge_witnesses[]` — tablets whose chunks appear in ≥2 OTHER transmission nodes (excluding their own)
- `diffusion_summary` — period range, cross-period edge count, cross-provenance edge count, bridge count

## Empirical finding (methods paper §3.22)

Running on Mīs pî (`composition_id="mis_pi"`, `max_witnesses=30`):

```
Witnesses:      16
Periods:        Neo-Assyrian → Neo-Babylonian (2 distinct)
Provenances:    1 distinct
Nodes:          2 (one per period; provenance uniform)
Edges:          1 (cross-period NA↔NB)
Bridge witnesses: 0
```

**Two methodological observations:**

1. **Single-provenance concentration.** All 16 BFS-expanded Mīs pî witnesses share a single provenance (Kuyunjik / British Museum cluster, given the K.* and Sm.* prefix dominance). The current chunk-index expansion of Mīs pî is geographically uniform — there is no atelier-to-atelier transmission story to tell at this expansion depth. Whether this is a coverage gap (other-provenance Mīs pî witnesses exist but are below the BFS threshold) or a real concentration (the Nineveh redaction dominates the surviving record) is a §3.22 question to flag.

2. **Two-period diffusion confirms §3.20.** The rooted-stemma section already noted no pre-NA witness in this cluster. v0.35 confirms it from a different direction: the only two periods that appear at all are Neo-Assyrian (rank 4) and Neo-Babylonian (rank 5). The cross-period NA↔NB edge demonstrates active transmission within this 2-period window.

3. **Zero bridge witnesses despite NA→NB transmission.** Because there's only one provenance in the cluster, no individual tablet "spans" multiple ateliers — the chunks bridge ACROSS time inside a single geographic node, not across ateliers. The 0-count is structurally correct, not a missing-data artifact.

## Round-21 calibration audit — 16/16 PASS

| Test | Result |
|---|---|
| T1: Mīs pî → ≥1 witness, ≥1 node, exemplars present | ✅ 16w, 2 nodes, 4 exemplars |
| T2: transmission_nodes sorted by period_rank ascending | ✅ first=4 last=5 |
| T3: bridge_witnesses entries all have spans ≥ 2 | ✅ (n=0 vacuously) |
| T4: every edge has shared_chunks ≥ 5 (default) | ✅ |
| T5: diffusion_summary counts match array lengths | ✅ 4/4 |
| T6: seed_tablet_id=K.5896 → inferred mis_pi (conf 0.995) | ✅ |
| T7: no input → unresolved + warning | ✅ |
| T8: K.5896 is_registry_exemplar=true | ✅ |

Plus substantive findings printed for §3.22 anchor.

Audit: `scripts/round21-composition-lineage-audit.mjs`. Cache-dependent (chunk index + fragment metadata).

Regression rounds 17 + 18 + 19 + 20: all PASS unchanged.

## Tier-1 complete — `v0.31-plus-upgrade-ideas.md`

All 5 items shipped:

- ✅ #1 `identify_composition` (v0.32)
- ✅ #2 `build_stemma_with_rooting` (v0.33)
- ✅ #3 `find_composition_lineage` (v0.35, this release)
- ✅ #4 `score_tablet_completeness` (v0.34)
- ✅ #5 `record_validation_resolution` (v0.31)

5 versions, 7 new tools (record + list both count for #5), 5 methods-paper sections (§3.18–§3.22), 5 new claims (38–42), 5 calibration audits (Round 17–21, all PASS).

## Methods paper §3.22, claim 42

**Claim 42.** *Composition transmission tracing — bucketing chunk-cluster witnesses by (period × provenance) — exposes both the temporal trajectory and the geographic concentration of a composition's surviving record. The Mīs pî cluster in the eBL chunk-index reduces to 16 witnesses across 2 periods (NA → NB) and 1 provenance, with one cross-period transmission edge and zero bridge witnesses. The single-provenance finding is itself substantive: it identifies either a coverage gap (other-provenance Mīs pî witnesses below BFS threshold) or a real geographic concentration (Nineveh redaction dominance) — the tool exposes the structural absence rather than fabricating diffusion.*

## Reproducibility

```bash
npm run build
npm run smoke                                          # 87 tools registered
node scripts/round21-composition-lineage-audit.mjs     # 16/16 PASS
node scripts/round20-score-completeness-audit.mjs      # 14/14 PASS (regression)
node scripts/round19-rooted-stemma-audit.mjs           # 17/17 PASS (regression)
node scripts/round18-identify-composition-audit.mjs    # 10/10 PASS (regression)
node scripts/round17-validation-resolutions-audit.mjs  # 15/15 PASS (regression)
```

## What's next

Tier-1 closed. Per the v0.31+ doc, candidate post-Tier-1 work:

- **Tier 2 #7** — `damaged_passage_composition_probability` (composes v0.30 lacuna + v0.32 identify_composition + v0.29 Bayesian fusion)
- **Tier 2 #6** — `compare_clusters_v2` with v0.26 per-archetype thresholds
- **Tier 2 #8** — production Bayesian retrain once `validation-resolutions.json` accumulates positives
- **Tier 3 #11** — `find_sign_glyph` (Unicode glyph lookup, 1 day, pure data)
- **Tier 4 #13** — Extend CI to run the cache-dependent regression suite
- **Tier 1 follow-up** — Registry expansion (EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa, Maqlû)

The Tier-1 dependencies that compose into Tier-2 are now in place. Tier 2 #7 (damaged_passage_composition_probability) is the next natural piece — it uses v0.30 lacuna + v0.32 identify + v0.29 Bayesian fusion in one tool.
