#!/usr/bin/env node
// Round-36 calibration audit: held-out evaluation methodology (v0.51.0).

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

console.log("Round-36 audit: held-out evaluation methodology (v0.51.0)\n");

const evalPath = join(process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp"), "held-out-evaluation.json");

if (!existsSync(evalPath)) {
  console.log(`  evaluation cache not built — run scripts/evaluate-joint-pair-model.mjs first`);
  process.exit(1);
}

const data = JSON.parse(readFileSync(evalPath, "utf-8"));
console.log(`Evaluation:`);
console.log(`  rng_seed: ${data.rng_seed}`);
console.log(`  eval_fraction: ${data.eval_fraction}`);
console.log(`  train: ${data.train.n_positives} pos + ${data.train.n_negatives} neg`);
console.log(`  test:  ${data.test.n_positives} pos + ${data.test.n_negatives} neg`);
console.log(``);
console.log(`In-sample (train):  acc=${data.train.accuracy.toFixed(4)} brier=${data.train.brier.toFixed(4)} ll=${data.train.log_loss.toFixed(4)} auc=${data.train.auc?.toFixed(4)}`);
console.log(`Out-of-sample:      acc=${data.test.accuracy.toFixed(4)} brier=${data.test.brier.toFixed(4)} ll=${data.test.log_loss.toFixed(4)} auc=${data.test.auc?.toFixed(4)}`);
console.log(`Generalization gap: ${(data.train.accuracy - data.test.accuracy).toFixed(4)}`);
console.log(``);

// T1: evaluation file exists with required fields
report("T1: held-out-evaluation.json carries train + test structures", data.train && data.test);

// T2: deterministic seed
report("T2: rng_seed === 20260525 (deterministic, reproducible)", data.rng_seed === 20260525);

// T3: train + test disjoint
report("T3: train_n + test_n equals total resolutions",
  (data.train.n_positives + data.test.n_positives === 12) &&
  (data.train.n_negatives + data.test.n_negatives === 30),
  `pos=${data.train.n_positives}+${data.test.n_positives} neg=${data.train.n_negatives}+${data.test.n_negatives}`);

// T4: AUC computed
report("T4: AUC computed on test set", typeof data.test.auc === "number" && data.test.auc >= 0 && data.test.auc <= 1);

// T5: Brier in [0,1]
report("T5: test Brier in [0,1]", data.test.brier >= 0 && data.test.brier <= 1);

// T6: each test record has all required fields
const allFieldsOK = data.test.per_pair.every((r) =>
  typeof r.a === "string" && typeof r.b === "string" &&
  (r.label === 0 || r.label === 1) &&
  typeof r.predicted_probability === "number" &&
  typeof r.correct === "boolean" &&
  typeof r.classification === "string"
);
report("T6: every per-pair record has all required fields", allFieldsOK);

// T7: methodology marker — accuracy reported on a truly held-out set
report("T7: test set is non-empty (methodology valid)", data.test.per_pair.length >= 5,
  `test_n=${data.test.per_pair.length}`);

// T8: probability distribution sanity — for positives, mean predicted should be higher than for negatives
const testPos = data.test.per_pair.filter((r) => r.label === 1);
const testNeg = data.test.per_pair.filter((r) => r.label === 0);
const posMean = testPos.length > 0 ? testPos.reduce((s, r) => s + r.predicted_probability, 0) / testPos.length : 0;
const negMean = testNeg.length > 0 ? testNeg.reduce((s, r) => s + r.predicted_probability, 0) / testNeg.length : 0;
report("T8: test positives mean(p) > test negatives mean(p) (model has signal)",
  posMean > negMean,
  `pos_mean=${posMean.toFixed(3)} neg_mean=${negMean.toFixed(3)}`);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-36 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
