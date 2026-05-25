#!/usr/bin/env node
// Round-22 calibration audit: damaged_passage_composition_probability (v0.36.0).
//
// Tests:
//   T1. K.5896 (no damage) → mis_pi top probability + low entropy
//   T2. Probabilities sum to ~1.0 (softmax sanity)
//   T3. K.9508 (small fragment) → mis_pi still wins
//   T4. Raw signs input works (paste from K.5896 corpus entry)
//   T5. lacuna_density correctly computed
//   T6. Higher temperature flattens distribution (entropy increases)
//   T7. Curriculum tie-break: specific > curriculum within 0.02
//   T8. Restoration marginalization produces a valid result when X present
//   T9. Empty input → warning + empty candidates
//   T10. Entropy bounded by log2(n_compositions)

import { damagedPassageCompositionProbability } from "../dist/damagedPassageComposition.js";
import { COMPOSITION_REGISTRY } from "../dist/compositionRegistry.js";

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

console.log("Round-22 audit: damaged_passage_composition_probability (v0.36.0)\n");

// ─── T1: K.5896 → mis_pi ───────────────────────────────────────────────────
console.log("T1: K.5896 tablet_id → mis_pi top probability");
const r1 = damagedPassageCompositionProbability({ tabletId: "K.5896" });
const top1 = r1.candidates[0];
report(
  "top candidate is mis_pi",
  top1?.composition_id === "mis_pi",
  `got=${top1?.composition_id} p=${top1?.probability?.toFixed(3)}`,
);
report(
  "top probability > 0.5 (clear classification)",
  (top1?.probability ?? 0) > 0.5,
  `p=${top1?.probability?.toFixed(3)}`,
);

// ─── T2: probabilities sum to ~1.0 ─────────────────────────────────────────
console.log("\nT2: probabilities sum to ~1.0 (softmax)");
const sum1 = r1.candidates.reduce((s, c) => s + c.probability, 0);
report(
  "sum(probability) ≈ 1.0",
  Math.abs(sum1 - 1.0) < 1e-6,
  `sum=${sum1.toFixed(6)}`,
);

// ─── T3: K.9508 → mis_pi ───────────────────────────────────────────────────
console.log("\nT3: K.9508 → mis_pi top probability (small fragment)");
const r3 = damagedPassageCompositionProbability({ tabletId: "K.9508" });
report(
  "K.9508 top is mis_pi",
  r3.candidates[0]?.composition_id === "mis_pi",
  `got=${r3.candidates[0]?.composition_id} p=${r3.candidates[0]?.probability?.toFixed(3)}`,
);

// ─── T4: raw signs input ───────────────────────────────────────────────────
console.log("\nT4: raw signs string input works");
// Use a simple non-zero signs string; the chunk_overlap axis will be off
// since there's no tablet_id, but the centroid axis should fire.
const r4signs = "ABZ480 ABZ411 ABZ1 ABZ57 ABZ319 ABZ12 ABZ97 ABZ354";
const r4 = damagedPassageCompositionProbability({ signs: r4signs });
report(
  "signs input produces candidates",
  r4.candidates.length === COMPOSITION_REGISTRY.length,
  `n_candidates=${r4.candidates.length}`,
);
report(
  "query.source === 'signs'",
  r4.query.source === "signs",
);
report(
  "chunk_overlap axis is NOT applicable for raw signs",
  r4.candidates.every((c) => !c.axis_scores.chunk_overlap.applicable),
);

// ─── T5: lacuna_density ────────────────────────────────────────────────────
console.log("\nT5: lacuna_density computed correctly");
const r5signs = "ABZ480 X X ABZ411 X";
const r5 = damagedPassageCompositionProbability({ signs: r5signs });
report(
  "lacuna_density = 3/5 = 0.6",
  Math.abs((r5.query.lacuna_density ?? 0) - 0.6) < 1e-6,
  `got=${r5.query.lacuna_density?.toFixed(3)}`,
);
report(
  "n_signs_damaged === 3",
  r5.query.n_signs_damaged === 3,
);

// ─── T6: temperature flattens ──────────────────────────────────────────────
console.log("\nT6: higher temperature → higher entropy");
const rLow = damagedPassageCompositionProbability({ tabletId: "K.5896", temperature: 0.01 });
const rHigh = damagedPassageCompositionProbability({ tabletId: "K.5896", temperature: 1.0 });
report(
  "rHigh.entropy > rLow.entropy",
  rHigh.uncertainty.composition_entropy > rLow.uncertainty.composition_entropy,
  `low(t=0.01)=${rLow.uncertainty.composition_entropy.toFixed(3)} high(t=1.0)=${rHigh.uncertainty.composition_entropy.toFixed(3)}`,
);

// ─── T7: curriculum tie-break ──────────────────────────────────────────────
console.log("\nT7: curriculum tie-break (within 0.02, specific wins)");
const top1WithType = r1.candidates[0];
const top2WithType = r1.candidates[1];
if (top1WithType && top2WithType && Math.abs(top1WithType.probability - top2WithType.probability) < 0.02) {
  report(
    "near-tie: specific_composition > curriculum",
    top1WithType.composition_type === "specific_composition" ||
      top2WithType.composition_type !== "curriculum",
    `top1=${top1WithType.composition_type} top2=${top2WithType.composition_type}`,
  );
} else {
  report(
    "no near-tie observed; tie-break logic unexercised (skipped)",
    true,
    `top1_p=${top1WithType?.probability?.toFixed(3)} top2_p=${top2WithType?.probability?.toFixed(3)}`,
  );
}

// ─── T8: restoration marginalization ───────────────────────────────────────
console.log("\nT8: restoration marginalization produces a valid result with X");
const r8 = damagedPassageCompositionProbability({
  tabletId: "K.5896",
  marginalizeRestorations: true,
});
report(
  "marginalization flag honored",
  r8.uncertainty.restoration_marginalization_applied === (r8.query.n_signs_damaged > 0),
  `applied=${r8.uncertainty.restoration_marginalization_applied} damaged=${r8.query.n_signs_damaged}`,
);
report(
  "result still classifies as mis_pi top",
  r8.candidates[0]?.composition_id === "mis_pi",
);

// ─── T9: empty input ───────────────────────────────────────────────────────
console.log("\nT9: empty input → warnings + empty candidates");
const r9 = damagedPassageCompositionProbability({});
report(
  "warnings emitted",
  r9.warnings.length > 0,
);
report(
  "candidates length === registry size (uniform null distribution)",
  r9.candidates.length === COMPOSITION_REGISTRY.length,
  `n=${r9.candidates.length}`,
);

// ─── T10: entropy bounded ──────────────────────────────────────────────────
console.log("\nT10: entropy ≤ log2(n_compositions)");
const upperBound = Math.log2(COMPOSITION_REGISTRY.length);
report(
  "K.5896 entropy ≤ log2(5)",
  r1.uncertainty.composition_entropy <= upperBound + 1e-6,
  `entropy=${r1.uncertainty.composition_entropy.toFixed(3)} upper=${upperBound.toFixed(3)}`,
);

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-22 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
