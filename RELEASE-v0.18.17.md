# cuneiform-mcp v0.18.17 — Release Notes

*Released 2026-05-22. Seventh 3-tool parallel-build wave. Fourteenth release of the day.*

---

## TL;DR

- **NEW: `find_isolate_compositions`** — substantial tablets with few parallels (rare-witness compositions, methods-paper single-witness sub-cohort candidates)
- **NEW: `find_signature_evolution_in_lineage`** — overlay scribal-signature drift on lineage_chain. Coherence classification: stable / drifting / fragmented
- **NEW: `extend_dataset_to_motif`** — generalize apkallu_attestations to arbitrary motifs. Persistable dataset output. Cross-axis BFS expansion.

**Tool count: 56 → 59. Seven consecutive 3-agent parallel waves shipped clean.**

## Files changed

- `src/isolateCompositions.ts` — NEW, ~310 LOC
- `src/signatureEvolution.ts` — NEW, ~370 LOC
- `src/motifDatasetBuilder.ts` — NEW, ~397 LOC (largest of the wave; persists output to `data/motif-datasets/`)
- `src/index.ts` — 3 imports + 3 registerTool + VERSION + smoke
- `package.json` — version 0.18.17

## Verification

- ✅ All 3 agents `tsc --noEmit` clean
- ✅ Orchestrator `npm run build` clean
- ✅ `npm run smoke` clean: "cuneiform-mcp v0.18.17 smoke OK — 59 tools registered"

## The 2026-05-22 arc — fourteen releases

**Totals: 29 new tools + 1 quality filter + metadata enrichment, ~12,000 LOC, tool count 30 → 59.**
