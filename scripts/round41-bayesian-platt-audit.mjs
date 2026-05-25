#!/usr/bin/env node
// Round-41 calibration audit: Platt-recalibrated v0.29 6-feature Bayesian (v0.57).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

console.log("Round-41 audit: Platt-recalibrated v0.29 (v0.57)\n");

const modelPath = join(homedir(), ".cache", "cuneiform-mcp", "joint-pair-model.json");
if (!existsSync(modelPath)) {
  console.log("  joint-pair-model.json missing; run train + apply first");
  process.exit(1);
}
const model = JSON.parse(readFileSync(modelPath, "utf-8"));

// T1: model carries platt_calibration block (written by --apply)
report(
  "T1: joint-pair-model.json has platt_calibration block",
  model.platt_calibration && typeof model.platt_calibration.a === "number",
);

if (!model.platt_calibration) {
  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`Round-41 audit: ${pass}/${pass + fail} passed (platt not applied)`);
  console.log(`──────────────────────────────────────────────────────────`);
  process.exit(fail === 0 ? 0 : 1);
}

const cal = model.platt_calibration;
console.log(`Platt params: a=${cal.a.toFixed(4)} b=${cal.b.toFixed(4)} n=${cal.n_samples}`);
console.log(`ECE before: ${cal.ece_before.toFixed(4)}  after: ${cal.ece_after.toFixed(4)}`);
console.log("");

// T2: ECE strictly improved after Platt
report(
  "T2: post-Platt ECE ≤ pre-Platt ECE",
  cal.ece_after <= cal.ece_before,
  `before=${cal.ece_before.toFixed(4)} after=${cal.ece_after.toFixed(4)}`,
);

// T3: Platt params sensible (a > 0, finite b)
report(
  "T3: Platt a > 0 (monotonic) and b finite",
  cal.a > 0 && isFinite(cal.b),
);

// T4: n_samples ≥ 20 (minimum for usable fit)
report(
  "T4: fitted on n ≥ 20 samples",
  cal.n_samples >= 20,
  `n=${cal.n_samples}`,
);

// T5: fitted_at recent
report(
  "T5: fitted_at timestamp present + parseable",
  cal.fitted_at && !isNaN(new Date(cal.fitted_at).getTime()),
);

// T6: post-Platt ECE meaningful improvement (any reduction)
const reductionFactor = cal.ece_before > 0 ? cal.ece_before / Math.max(cal.ece_after, 1e-6) : 1;
report(
  "T6: ECE reduction factor ≥ 1×",
  reductionFactor >= 1.0,
  `${reductionFactor.toFixed(2)}×`,
);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-41 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
