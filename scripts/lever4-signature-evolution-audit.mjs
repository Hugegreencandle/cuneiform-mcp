#!/usr/bin/env node
// Round-3 untested-tool audit: find_signature_evolution_in_lineage.
//
// Plan: validate the 4 thresholds (jump 0.40, stable_min_mean 0.65,
// drifting_min_mean 0.45, fragmented_min_jumps 3) against 5 known lineages.
// Spot-check whether the coherence classification matches a human read.
//
// Known lineages (per methods paper + 2026-05-23 typology):
//   K.5896 — Mīs pî, Babylonian/NA transmission (refrain-bound liturgical)
//   BM.77056 — āšipūtu compositional curriculum (multi-composition canon)
//   K.2798 — Bīt salāʾ mê manuscript siblings (typology Archetype 2)
//   Sm.1055 — 100+ Neo-Assyrian Nineveh chain (typology Archetype 2)
//   K.5036 — cross-period bridge (typology Archetype 6)
//
// Methodology mirrors the v0.18.2 calibration audit: decompose the
// classification, sample, tabulate, decide ship vs no-op.

import { findSignatureEvolutionInLineage } from "../dist/signatureEvolution.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 3000));
};

const seeds = ["K.5896", "BM.77056", "K.2798", "Sm.1055", "K.5036"];

const rows = [];
for (const seed of seeds) {
  // Use library defaults (v0.18.19: maxChainSize=8). Override locally if needed.
  const r = findSignatureEvolutionInLineage({
    seedTabletId: seed,
  });
  console.log(`\n── ${seed} ──`);
  console.log(`  chain_size: ${r.summary.total_members}`);
  console.log(`  total_jumps: ${r.summary.total_jumps}`);
  console.log(`  mean_sig_cosine_to_seed: ${r.summary.mean_sig_cosine_to_seed_across_chain?.toFixed(4) ?? "n/a"}`);
  console.log(`  coherence: ${r.summary.scribal_coherence_classification}`);
  console.log(`  termination: ${r.summary.underlying_chain_termination}`);
  console.log(`  chain members (depth · id · sig_cos_to_seed):`);
  for (const m of r.chain_with_signatures.slice(0, 12)) {
    console.log(`    d=${m.depth}  ${m.tablet_id.padEnd(18)}  cos_to_seed=${(m.sig_cosine_to_seed ?? 0).toFixed(4)}  ${m.is_jump ? "[JUMP]" : ""}`);
  }
  if (r.signature_jumps.length > 0) {
    console.log(`  jumps:`);
    for (const j of r.signature_jumps) {
      console.log(`    ${JSON.stringify(j)}`);
    }
  }
  rows.push({
    seed,
    n: r.summary.total_members,
    jumps: r.summary.total_jumps,
    mean: +(r.summary.mean_sig_cosine_to_seed_across_chain ?? 0).toFixed(4),
    coherence: r.summary.scribal_coherence_classification,
  });
}

log("Summary table", rows);

// ─── Heuristic check: does the classification make sense? ────────────────────
console.log("\n── Heuristic check ──");
console.log("  Expected (per methods paper + typology):");
console.log("    K.5896 (Mīs pî transmission, multi-collection): drifting OR stable");
console.log("    BM.77056 (āšipūtu curriculum, multi-composition): drifting OR fragmented");
console.log("    K.2798 (Bīt salāʾ mê manuscript-sibling pair): stable OR drifting");
console.log("    Sm.1055 (NA single-composition chain): stable");
console.log("    K.5036 (cross-period bridge): drifting OR fragmented");

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Lever-4 signature evolution audit complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
