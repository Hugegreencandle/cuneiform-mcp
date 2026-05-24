#!/usr/bin/env node
// Round-18 calibration audit: identify_composition (v0.32.0).
//
// Hypothesis: composition assignment via joint chunk-overlap + sign2vec-centroid
// against the methods-paper exemplar registry correctly classifies known
// Mīs pî manuscripts as Mīs pî, known Šurpu manuscripts as Šurpu, etc., and
// surfaces curriculum membership (āšipūtu/KAR-44) alongside specific-composition
// assignments rather than instead of them.
//
// Tests:
//   T1. K.5896 → top-1 Mīs pî (with self filtered from exemplar pool)
//   T2. K.9508 → Mīs pî top-1 (fragment, smaller signal)
//   T3. BM.47463 → Šurpu top-1
//   T4. K.5896 query: āšipūtu (curriculum) also fires high alongside Mīs pî
//   T5. Sm.1055 → Udug-ḫul top-1 over Mīs pî
//   T6. Confidence in [0,1] for every candidate
//   T7. self_filter: query in exemplar list → evidence.query_in_exemplar_list=true
//   T8. Graceful degradation: unknown tablet returns warnings + zero scores
//      (signs cache miss → empty candidates, no exception)

import { identifyComposition } from "../dist/identifyComposition.js";

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

console.log("Round-18 audit: identify_composition (v0.32.0)\n");

// ─── T1: K.5896 → Mīs pî ───────────────────────────────────────────────────
console.log("T1: K.5896 → top-1 should be Mīs pî");
const r1 = identifyComposition({ tabletId: "K.5896", topK: 5 });
const top1 = r1.candidates[0];
report(
  "K.5896 top-1 composition_id === 'mis_pi'",
  top1?.composition_id === "mis_pi",
  `got="${top1?.composition_id}" conf=${top1?.confidence?.toFixed(3)} (sign_count=${r1.query.sign_count} embedded=${r1.index_stats.query_signs_with_embedding})`,
);
report(
  "K.5896 listed as Mīs pî exemplar (self-filter applied)",
  top1?.evidence?.query_in_exemplar_list === true,
);

// ─── T2: K.9508 → Mīs pî ───────────────────────────────────────────────────
console.log("\nT2: K.9508 → top-1 should be Mīs pî (small fragment)");
const r2 = identifyComposition({ tabletId: "K.9508", topK: 5 });
const r2top = r2.candidates[0];
report(
  "K.9508 top-1 composition_id === 'mis_pi'",
  r2top?.composition_id === "mis_pi",
  `got="${r2top?.composition_id}" conf=${r2top?.confidence?.toFixed(3)}`,
);

// ─── T3: BM.47463 → Šurpu ──────────────────────────────────────────────────
console.log("\nT3: BM.47463 → top-1 should be Šurpu");
const r3 = identifyComposition({ tabletId: "BM.47463", topK: 5 });
const r3top = r3.candidates[0];
report(
  "BM.47463 top-1 composition_id === 'surpu'",
  r3top?.composition_id === "surpu",
  `got="${r3top?.composition_id}" conf=${r3top?.confidence?.toFixed(3)}`,
);

// ─── T4: K.5896 curriculum also fires ──────────────────────────────────────
console.log("\nT4: K.5896 → āšipūtu curriculum also in top-3");
const cIds = r1.candidates.slice(0, 3).map((c) => c.composition_id);
report(
  "K.5896 has 'asiputu_kar44' in top-3",
  cIds.includes("asiputu_kar44"),
  `top-3=[${cIds.join(", ")}]`,
);

// ─── T5: Sm.1055 → Udug-ḫul ────────────────────────────────────────────────
console.log("\nT5: Sm.1055 → top-1 should be Udug-ḫul");
const r5 = identifyComposition({ tabletId: "Sm.1055", topK: 5 });
const r5top = r5.candidates[0];
report(
  "Sm.1055 top-1 composition_id === 'udug_hul'",
  r5top?.composition_id === "udug_hul",
  `got="${r5top?.composition_id}" conf=${r5top?.confidence?.toFixed(3)}`,
);

// ─── T6: confidence in [0,1] ───────────────────────────────────────────────
console.log("\nT6: every candidate confidence in [0,1]");
const allInRange = [r1, r2, r3, r5].every((r) =>
  r.candidates.every((c) => c.confidence >= 0 && c.confidence <= 1),
);
report("confidence in [0,1] across all probed tablets", allInRange);

// ─── T7: self-filter ───────────────────────────────────────────────────────
console.log("\nT7: query_in_exemplar_list flag set when query is exemplar");
const r7misPi = r1.candidates.find((c) => c.composition_id === "mis_pi");
report(
  "K.5896 in Mīs pî exemplar list → flag true",
  r7misPi?.evidence?.query_in_exemplar_list === true,
);
const r7surpu = r1.candidates.find((c) => c.composition_id === "surpu");
report(
  "K.5896 NOT in Šurpu exemplar list → flag false",
  r7surpu?.evidence?.query_in_exemplar_list === false,
);

// ─── T8: graceful degradation on unknown tablet ────────────────────────────
console.log("\nT8: unknown tablet returns zero scores without throwing");
const r8 = identifyComposition({ tabletId: "Z.99999999", topK: 5 });
report(
  "Z.99999999 returns warnings + zero-score candidates",
  r8.warnings.length > 0 && r8.candidates.every((c) => c.confidence === 0 || !c.axis_scores.chunk_overlap.applicable),
  `warnings=${r8.warnings.length} top_conf=${r8.candidates[0]?.confidence}`,
);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-18 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
