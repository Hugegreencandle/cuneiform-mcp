#!/usr/bin/env node
// Round-26 calibration audit: compute_confidence_calibration (v0.40.0).
// Cache-free unit tests on synthetic samples.

import { computeConfidenceCalibration } from "../dist/confidenceCalibration.js";

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

console.log("Round-26 audit: compute_confidence_calibration (v0.40.0)\n");

// T1: perfectly calibrated synthetic data
// 100 samples/bin × 10 bins = 1000 samples, accuracy exactly = bin_mid.
const perfectSamples = [];
for (let bin = 0; bin < 10; bin++) {
  const binMid = (bin + 0.5) / 10;
  const targetCorrect = Math.round(binMid * 100); // out of 100 per bin
  for (let i = 0; i < 100; i++) {
    perfectSamples.push({
      predicted_probability: binMid,
      correct: i < targetCorrect,
    });
  }
}
const r1 = computeConfidenceCalibration({ samples: perfectSamples, nBins: 10 });
report("T1: 100 perfectly-calibrated samples → ECE ≤ 0.05", r1.expected_calibration_error <= 0.05, `ECE=${r1.expected_calibration_error.toFixed(4)}`);
report("T1: verdict === 'well_calibrated'", r1.calibration_verdict === "well_calibrated");

// T2: overconfident classifier (high prob, low accuracy)
const overconfidentSamples = [];
for (let i = 0; i < 100; i++) {
  overconfidentSamples.push({
    predicted_probability: 0.95,
    correct: i < 50, // 50% accuracy at 95% confidence
  });
}
const r2 = computeConfidenceCalibration({ samples: overconfidentSamples, nBins: 10 });
report("T2: overconfident → verdict 'overconfident'", r2.calibration_verdict === "overconfident", `verdict=${r2.calibration_verdict} gap=${(r2.overall_accuracy - r2.overall_mean_probability).toFixed(3)}`);
report("T2: Brier score high (>0.20)", r2.brier_score > 0.20);

// T3: underconfident classifier
const underconfidentSamples = [];
for (let i = 0; i < 100; i++) {
  underconfidentSamples.push({
    predicted_probability: 0.30,
    correct: i < 80, // 80% accuracy at 30% confidence
  });
}
const r3 = computeConfidenceCalibration({ samples: underconfidentSamples, nBins: 10 });
report("T3: underconfident → verdict 'underconfident'", r3.calibration_verdict === "underconfident", `verdict=${r3.calibration_verdict}`);

// T4: insufficient data
const r4 = computeConfidenceCalibration({ samples: [{ predicted_probability: 0.5, correct: true }] });
report("T4: 1 sample → verdict 'insufficient_data'", r4.calibration_verdict === "insufficient_data");

// T5: empty samples
const r5 = computeConfidenceCalibration({ samples: [] });
report("T5: empty samples → verdict 'insufficient_data' + warning", r5.calibration_verdict === "insufficient_data" && r5.warnings.length > 0);

// T6: Brier score for perfect predictions = 0
const r6 = computeConfidenceCalibration({
  samples: [
    { predicted_probability: 1.0, correct: true },
    { predicted_probability: 1.0, correct: true },
    { predicted_probability: 0.0, correct: false },
    { predicted_probability: 0.0, correct: false },
  ],
});
report("T6: perfect predictions → Brier === 0", r6.brier_score === 0, `Brier=${r6.brier_score}`);

// T7: bin counts sum to n_samples
const totalInBins = r1.bins.reduce((s, b) => s + b.n_samples, 0);
report("T7: bin counts sum to n_samples", totalInBins === r1.n_samples);

// T8: out-of-range probability handled
const r8 = computeConfidenceCalibration({
  samples: [
    { predicted_probability: 1.5, correct: true },
    { predicted_probability: -0.2, correct: false },
    { predicted_probability: 0.5, correct: true },
  ],
});
report("T8: out-of-range probabilities → warnings + clamped", r8.warnings.length > 0, `n_warnings=${r8.warnings.length}`);

// T9: ECE strictly in [0,1]
const allInRange = [r1, r2, r3, r6].every((r) =>
  r.expected_calibration_error >= 0 &&
  r.expected_calibration_error <= 1 &&
  r.max_calibration_error >= 0 &&
  r.max_calibration_error <= 1 &&
  r.brier_score >= 0 &&
  r.brier_score <= 1,
);
report("T9: ECE/MCE/Brier all in [0,1]", allInRange);

// T10: gap = observed_accuracy - mean_predicted_probability
const gapsOk = r2.bins.every((b) => {
  if (b.n_samples === 0) return true;
  return Math.abs(b.gap - (b.observed_accuracy - b.mean_predicted_probability)) < 1e-9;
});
report("T10: gap === observed_accuracy - mean_predicted_probability", gapsOk);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-26 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
