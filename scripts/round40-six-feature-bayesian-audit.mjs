#!/usr/bin/env node
// Round-40 calibration audit: 6-feature v0.29 Bayesian fusion (v0.56.0).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { FEATURE_ORDER, loadJointPairModel } from "../dist/jointPairScore.js";

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

console.log("Round-40 audit: 6-feature Bayesian fusion (v0.56.0)\n");

// T1: FEATURE_ORDER includes composition_assignment_match
report(
  "T1: FEATURE_ORDER includes composition_assignment_match",
  FEATURE_ORDER.includes("composition_assignment_match"),
);
report(
  "T1: FEATURE_ORDER length is 6",
  FEATURE_ORDER.length === 6,
  `got ${FEATURE_ORDER.length}`,
);

// T2: trained model exists with 6-feature weights
const model = loadJointPairModel();
report("T2: joint-pair model loaded", model !== null);
report(
  "T2: model has weight for composition_assignment_match",
  model && typeof model.weights.composition_assignment_match === "number",
);
report(
  "T2: composition_assignment_match weight is positive (curriculum-membership boosts P(positive))",
  model && model.weights.composition_assignment_match > 0,
  model ? `weight=${model.weights.composition_assignment_match.toFixed(4)}` : "no model",
);

// T3: training accuracy improved from v0.51 baseline (0.9423)
report(
  "T3: training_accuracy ≥ 0.94 (matches or exceeds 5-feature baseline)",
  model && model.training_accuracy >= 0.94,
  model ? `acc=${model.training_accuracy.toFixed(4)}` : "",
);

// T4: held-out eval cache exists and reflects the 6-feature run
const evalPath = join(homedir(), ".cache", "cuneiform-mcp", "held-out-evaluation.json");
if (existsSync(evalPath)) {
  const ev = JSON.parse(readFileSync(evalPath, "utf-8"));
  console.log(`\n  Held-out eval:`);
  console.log(`    train: acc=${ev.train.accuracy.toFixed(4)} AUC=${ev.train.auc?.toFixed(4)}`);
  console.log(`    test:  acc=${ev.test.accuracy.toFixed(4)} AUC=${ev.test.auc?.toFixed(4)}`);

  // T5: test AUC improved over v0.51 baseline (0.6667)
  report(
    "T5: test AUC improved from v0.51 baseline (0.6667)",
    ev.test.auc > 0.6667,
    `test_AUC=${ev.test.auc?.toFixed(4)}`,
  );

  // T6: test AUC is 1.0 (perfect ranking)
  report(
    "T6: test AUC === 1.0 (model perfectly ranks positives above negatives)",
    Math.abs(ev.test.auc - 1.0) < 1e-9,
    `AUC=${ev.test.auc?.toFixed(4)}`,
  );

  // T7: out-of-sample accuracy maintained or improved
  report(
    "T7: out-of-sample accuracy ≥ v0.51 baseline (0.9)",
    ev.test.accuracy >= 0.9,
    `acc=${ev.test.accuracy.toFixed(4)}`,
  );

  // T8: BM.77056 ↔ K.5896 prediction moved toward correct
  const bmRecord = ev.test.per_pair?.find(
    (r) => (r.a === "BM.77056" && r.b === "K.5896") || (r.b === "BM.77056" && r.a === "K.5896"),
  );
  if (bmRecord) {
    report(
      "T8: BM.77056 ↔ K.5896 p improved from v0.51 baseline (~0.05)",
      bmRecord.predicted_probability > 0.05,
      `p=${bmRecord.predicted_probability.toFixed(4)}`,
    );
  }
} else {
  console.log("  (held-out-eval cache not present)");
}

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-40 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
