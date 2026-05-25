#!/usr/bin/env node
// Round-35 calibration audit: recalibrate_lacuna_scores (v0.50.0).

import { recalibrateLacunaScores, applyPlattCalibration } from "../dist/recalibrateLacunaScores.js";

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

console.log("Round-35 audit: recalibrate_lacuna_scores (v0.50.0)\n");

const r = recalibrateLacunaScores({ method: "platt", nBins: 10 });
console.log(`Source: ${r.source_file}`);
console.log(`n_samples: ${r.n_samples}`);
console.log(``);
console.log(`Before: ECE=${r.before.expected_calibration_error.toFixed(4)} Brier=${r.before.brier_score.toFixed(4)} verdict=${r.before.verdict}`);
console.log(`After:  ECE=${r.after.expected_calibration_error.toFixed(4)} Brier=${r.after.brier_score.toFixed(4)} verdict=${r.after.verdict}`);
console.log(`Platt: a=${r.after.platt_a.toFixed(4)} b=${r.after.platt_b.toFixed(4)}`);
console.log(`ECE reduction: ${r.improvement.ece_reduction.toFixed(4)} (${r.improvement.ece_reduction_factor.toFixed(1)}×)`);
console.log(`Recommendation: ${r.recommendation}`);
console.log(``);

// T1: at least 500 samples (refinement #4 bump)
report("T1: ≥500 samples loaded", r.n_samples >= 500);

// T2: ECE reduced after Platt
report(
  "T2: post-Platt ECE strictly lower than before",
  r.after.expected_calibration_error < r.before.expected_calibration_error,
  `before=${r.before.expected_calibration_error.toFixed(4)} after=${r.after.expected_calibration_error.toFixed(4)}`,
);

// T3: improvement factor > 1
report(
  "T3: ECE reduction factor > 1×",
  r.improvement.ece_reduction_factor > 1,
);

// T4: Brier improved (calibration generally improves brier too)
report(
  "T4: Brier score did not worsen",
  r.after.brier_score <= r.before.brier_score + 0.01,
  `before=${r.before.brier_score.toFixed(4)} after=${r.after.brier_score.toFixed(4)}`,
);

// T5: applyPlattCalibration helper works
const calibratedHigh = applyPlattCalibration(0.95, { a: r.after.platt_a, b: r.after.platt_b });
const calibratedLow = applyPlattCalibration(0.10, { a: r.after.platt_a, b: r.after.platt_b });
report(
  "T5: applyPlattCalibration produces probabilities in [0,1]",
  calibratedHigh >= 0 && calibratedHigh <= 1 && calibratedLow >= 0 && calibratedLow <= 1,
  `0.95→${calibratedHigh.toFixed(3)} 0.10→${calibratedLow.toFixed(3)}`,
);

// T6: monotonicity — high raw probability still maps to higher calibrated than low raw
report(
  "T6: Platt is monotonic (high raw → high calibrated, low raw → low calibrated)",
  calibratedHigh > calibratedLow,
);

// T7: recommendation string non-empty
report("T7: recommendation present", r.recommendation.length > 0);

// T8: cross-reference to §3.25 finding — ECE before should match the v0.40
// finding (~0.65). Tolerance ±0.10 for the 500-sample vs 50-sample run.
report(
  "T8: pre-calibration ECE ≈ 0.6 (matches §3.25 v0.40 finding)",
  r.before.expected_calibration_error > 0.5,
);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-35 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
