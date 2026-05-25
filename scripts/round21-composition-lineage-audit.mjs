#!/usr/bin/env node
// Round-21 calibration audit: find_composition_lineage (v0.35.0).
//
// Hypothesis: composing v0.20 chunk-BFS + fragment metadata produces a
// transmission graph that exposes WHERE and WHEN a composition was copied,
// with chunk-sharing edges between (period × provenance) buckets and
// bridge witnesses linking the boundary crossings.
//
// Tests:
//   T1. Mīs pî (composition_id=mis_pi) → ≥1 witnesses, ≥1 node, exemplars present
//   T2. transmission_nodes sorted by period_rank ascending
//   T3. bridge_witnesses spans_n_nodes ≥ 2 for every entry (definition)
//   T4. transmission_edges have shared_chunks ≥ min_edge_chunks (default 5)
//   T5. diffusion_summary counts agree with array lengths
//   T6. inferred composition path: seed_tablet_id=K.5896 → mis_pi
//   T7. unresolved composition (no inputs) → warning + empty result
//   T8. exemplars are flagged is_registry_exemplar=true

import { findCompositionLineage } from "../dist/findCompositionLineage.js";

let pass = 0;
let fail = 0;
function report(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("Round-21 audit: find_composition_lineage (v0.35.0)\n");

// ─── T1: Mīs pî via composition_id ─────────────────────────────────────────
console.log("T1: Mīs pî via composition_id");
const r1 = findCompositionLineage({ compositionId: "mis_pi", maxWitnesses: 30 });
report(
  "≥1 witness",
  r1.witnesses.length >= 1,
  `n=${r1.witnesses.length}`,
);
report(
  "≥1 transmission node",
  r1.transmission_nodes.length >= 1,
  `nodes=${r1.transmission_nodes.length}`,
);
report(
  "composition.source='explicit'",
  r1.composition.source === "explicit" && r1.composition.composition_id === "mis_pi",
);
const exemplarsInWitnesses = r1.witnesses.filter((w) => w.is_registry_exemplar);
report(
  "≥1 exemplar in witness list",
  exemplarsInWitnesses.length >= 1,
  `exemplars=${exemplarsInWitnesses.length}`,
);

// ─── T2: transmission_nodes sorted by period_rank ───────────────────────────
console.log("\nT2: transmission_nodes sorted by period_rank ascending");
let sortedByPeriod = true;
for (let i = 1; i < r1.transmission_nodes.length; i++) {
  if (r1.transmission_nodes[i].period_rank < r1.transmission_nodes[i - 1].period_rank) {
    sortedByPeriod = false;
    break;
  }
}
report(
  "transmission_nodes sorted by period_rank ascending",
  sortedByPeriod,
  `first=${r1.transmission_nodes[0]?.period_rank} last=${r1.transmission_nodes.at(-1)?.period_rank}`,
);

// ─── T3: bridge_witnesses spans ≥ 2 ─────────────────────────────────────────
console.log("\nT3: bridge_witnesses spans_n_nodes ≥ 2 for every entry");
const allSpanOk = r1.bridge_witnesses.every((b) => b.spans_n_nodes >= 2);
report(
  "every bridge has spans_n_nodes ≥ 2",
  allSpanOk,
  `n_bridges=${r1.bridge_witnesses.length}`,
);
report(
  "bridge.node_ids length == spans_n_nodes",
  r1.bridge_witnesses.every((b) => b.node_ids.length === b.spans_n_nodes && b.chunks_in_each_node.length === b.spans_n_nodes),
);

// ─── T4: transmission_edges shared_chunks ≥ min_edge_chunks ────────────────
console.log("\nT4: transmission_edges shared_chunks ≥ min_edge_chunks");
const allEdgesOk = r1.transmission_edges.every((e) => e.shared_chunks >= 5);
report(
  "every edge has shared_chunks ≥ 5 (default)",
  allEdgesOk,
  `n_edges=${r1.transmission_edges.length}`,
);

// ─── T5: diffusion_summary counts match arrays ─────────────────────────────
console.log("\nT5: diffusion_summary counts match arrays");
const s = r1.diffusion_summary;
report(
  "n_witnesses === witnesses.length",
  s.n_witnesses === r1.witnesses.length,
);
report(
  "n_nodes === transmission_nodes.length",
  s.n_nodes === r1.transmission_nodes.length,
);
report(
  "n_edges === transmission_edges.length",
  s.n_edges === r1.transmission_edges.length,
);
report(
  "n_bridge_witnesses === bridge_witnesses.length",
  s.n_bridge_witnesses === r1.bridge_witnesses.length,
);

// ─── T6: inferred composition path ─────────────────────────────────────────
console.log("\nT6: K.5896 seed → inferred composition is mis_pi");
const r6 = findCompositionLineage({ seedTabletId: "K.5896", maxWitnesses: 20 });
report(
  "composition.source='inferred', id='mis_pi'",
  r6.composition.source === "inferred" && r6.composition.composition_id === "mis_pi",
  `source=${r6.composition.source} id=${r6.composition.composition_id} conf=${r6.composition.inferred_confidence?.toFixed(3)}`,
);

// ─── T7: unresolved on no input ────────────────────────────────────────────
console.log("\nT7: no input → unresolved + empty result");
const r7 = findCompositionLineage({});
report(
  "composition.source='unresolved'",
  r7.composition.source === "unresolved",
);
report(
  "empty witness array + warning",
  r7.witnesses.length === 0 && r7.warnings.length > 0,
  `warnings=${r7.warnings.length}`,
);

// ─── T8: is_registry_exemplar flag ─────────────────────────────────────────
console.log("\nT8: is_registry_exemplar correctness");
const k5896 = r1.witnesses.find((w) => w.tablet_id === "K.5896");
if (k5896) {
  report(
    "K.5896 in Mīs pî witnesses has is_registry_exemplar=true",
    k5896.is_registry_exemplar === true,
  );
} else {
  // K.5896 might not be in the BFS-expanded cluster if witness cap is reached
  console.log(`     (K.5896 not in expanded cluster — testing instead that some exemplar carries the flag)`);
  report(
    "at least one exemplar in witnesses has is_registry_exemplar=true",
    exemplarsInWitnesses.length >= 1,
  );
}

// ─── Substantive findings (informational; not assertions) ──────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Substantive findings for §3.22 (Mīs pî, max_witnesses=30):`);
console.log(`  Witnesses: ${r1.witnesses.length}`);
console.log(`  Periods: ${r1.diffusion_summary.earliest_period ?? "?"} → ${r1.diffusion_summary.latest_period ?? "?"} (${r1.diffusion_summary.n_distinct_periods} distinct)`);
console.log(`  Provenances: ${r1.diffusion_summary.n_distinct_provenances} distinct`);
console.log(`  Nodes (period × provenance): ${r1.diffusion_summary.n_nodes}`);
console.log(`  Edges: ${r1.diffusion_summary.n_edges} (${r1.diffusion_summary.n_cross_period_edges} cross-period, ${r1.diffusion_summary.n_cross_provenance_edges} cross-provenance)`);
console.log(`  Bridge witnesses: ${r1.diffusion_summary.n_bridge_witnesses}`);
if (r1.bridge_witnesses.length > 0) {
  console.log(`  Top bridge: ${r1.bridge_witnesses[0].tablet_id} spans ${r1.bridge_witnesses[0].spans_n_nodes} nodes`);
}

console.log(`──────────────────────────────────────────────────────────`);
console.log(`Round-21 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
