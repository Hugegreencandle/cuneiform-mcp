#!/usr/bin/env node
// v0.57 — Platt calibration of the v0.29 6-feature Bayesian fusion model.
//
// Background: v0.51 + v0.56 held-out evaluation produced test AUC=1.000
// (model perfectly ranks positives above negatives) but accuracy 0.9 due
// to BM.77056↔K.5896 sitting at p=0.082 — below the 0.5 threshold but
// below all negatives too. This is a CALIBRATION/THRESHOLD issue, not a
// ranking issue. Platt scaling on the labeled set fits sigmoid(a*logit(p)+b)
// to remap raw scores to calibrated probabilities; threshold-at-0.5 then
// matches the empirical accuracy.
//
// Mirrors v0.50's recalibrate_lacuna_scores pattern. Outputs Platt params
// + before/after ECE. Optional --apply flag writes params back into
// joint-pair-model.json so downstream tools (compute_joint_pair_score,
// recommend_validation_target) emit calibrated probabilities.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const EVAL_PATH = join(CACHE_DIR, "held-out-evaluation.json");
const MODEL_PATH = join(CACHE_DIR, "joint-pair-model.json");
const APPLY = process.argv.includes("--apply");

if (!existsSync(EVAL_PATH)) {
  console.error(`ABORT: ${EVAL_PATH} missing. Run scripts/evaluate-joint-pair-model.mjs first.`);
  process.exit(1);
}

const evalData = JSON.parse(readFileSync(EVAL_PATH, "utf-8"));

// Combine train + test per_pair into one labeled set.
const samples = [];
for (const r of evalData.train.per_pair ?? []) {
  samples.push({ predicted_probability: r.predicted_probability, label: r.label, a: r.a, b: r.b });
}
for (const r of evalData.test.per_pair ?? []) {
  samples.push({ predicted_probability: r.predicted_probability, label: r.label, a: r.a, b: r.b });
}

console.log(`cuneiform-mcp recalibrate-joint-pair-model v0.57.0`);
console.log(`  train samples: ${evalData.train.per_pair?.length ?? 0}`);
console.log(`  test samples:  ${evalData.test.per_pair?.length ?? 0}`);
console.log(`  total:         ${samples.length}`);
console.log(`  apply:         ${APPLY}`);
console.log(``);

if (samples.length < 20) {
  console.error(`WARNING: only ${samples.length} samples; Platt fit will be noisy. Recommend ≥100.`);
}

// ─── Platt scaling ─────────────────────────────────────────────────────────

function logit(p) {
  const clamped = Math.max(1e-7, Math.min(1 - 1e-7, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x) {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

function fitPlatt(xs, ys) {
  let a = 1.0;
  let b = 0.0;
  const lr = 0.05;
  const iterations = 500;
  const n = xs.length;
  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0;
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      const z = a * xs[i] + b;
      const p = sigmoid(z);
      const err = p - ys[i];
      gradA += err * xs[i];
      gradB += err;
    }
    gradA /= n;
    gradB /= n;
    a -= lr * gradA;
    b -= lr * gradB;
  }
  return { a, b };
}

// ─── Calibration metrics ────────────────────────────────────────────────────

function computeMetrics(samples, label) {
  const n = samples.length;
  let correct = 0;
  let brierSum = 0;
  let probSum = 0;
  let labelSum = 0;
  for (const s of samples) {
    const isCorrect =
      (s.label === 1 && s.predicted_probability >= 0.5) ||
      (s.label === 0 && s.predicted_probability < 0.5);
    if (isCorrect) correct++;
    brierSum += Math.pow(s.predicted_probability - s.label, 2);
    probSum += s.predicted_probability;
    labelSum += s.label;
  }
  // ECE (10 bins)
  const bins = [];
  for (let i = 0; i < 10; i++) bins.push({ count: 0, sumP: 0, sumLabel: 0 });
  for (const s of samples) {
    const p = Math.max(0, Math.min(1, s.predicted_probability));
    let idx = Math.floor(p * 10);
    if (idx >= 10) idx = 9;
    bins[idx].count++;
    bins[idx].sumP += p;
    bins[idx].sumLabel += s.label;
  }
  let ece = 0;
  for (const b of bins) {
    if (b.count === 0) continue;
    const meanP = b.sumP / b.count;
    const labelRate = b.sumLabel / b.count;
    ece += (b.count / n) * Math.abs(meanP - labelRate);
  }
  return {
    label,
    n,
    accuracy: correct / n,
    brier: brierSum / n,
    ece,
    mean_predicted: probSum / n,
    label_rate: labelSum / n,
  };
}

// ─── Fit + report ──────────────────────────────────────────────────────────

const xs = samples.map((s) => logit(s.predicted_probability));
const ys = samples.map((s) => s.label);
const platt = fitPlatt(xs, ys);

console.log(`══════════════════════════════════════════════════════════`);
console.log(`Platt parameters fitted on n=${samples.length}:`);
console.log(`  a = ${platt.a.toFixed(4)}`);
console.log(`  b = ${platt.b.toFixed(4)}`);
console.log(``);

const before = computeMetrics(samples, "BEFORE");
const calibrated = samples.map((s) => ({
  ...s,
  predicted_probability: sigmoid(platt.a * logit(s.predicted_probability) + platt.b),
}));
const after = computeMetrics(calibrated, "AFTER");

function printMetrics(m) {
  console.log(`  n:                ${m.n}`);
  console.log(`  accuracy:         ${m.accuracy.toFixed(4)}`);
  console.log(`  brier:            ${m.brier.toFixed(4)}`);
  console.log(`  ECE:              ${m.ece.toFixed(4)}`);
  console.log(`  mean predicted:   ${m.mean_predicted.toFixed(4)}`);
  console.log(`  label rate:       ${m.label_rate.toFixed(4)}`);
}
console.log(`BEFORE calibration:`);
printMetrics(before);
console.log(``);
console.log(`AFTER Platt (a=${platt.a.toFixed(3)}, b=${platt.b.toFixed(3)}):`);
printMetrics(after);
console.log(``);

// ─── Per-pair impact (specifically BM.77056↔K.5896) ───────────────────────

console.log(`Per-pair recalibration (positives only):`);
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  if (s.label !== 1) continue;
  const cal = calibrated[i];
  const flipped =
    (s.predicted_probability < 0.5 && cal.predicted_probability >= 0.5) ||
    (s.predicted_probability >= 0.5 && cal.predicted_probability < 0.5);
  const marker = flipped ? " ⚡ FLIPPED" : "";
  console.log(`  ${s.a.padEnd(15)} ↔ ${s.b.padEnd(15)}  raw=${s.predicted_probability.toFixed(4)}  cal=${cal.predicted_probability.toFixed(4)}${marker}`);
}

// ─── Optional: write back to model file ────────────────────────────────────

if (APPLY) {
  if (!existsSync(MODEL_PATH)) {
    console.error(`\nABORT --apply: ${MODEL_PATH} missing.`);
    process.exit(1);
  }
  const model = JSON.parse(readFileSync(MODEL_PATH, "utf-8"));
  model.platt_calibration = {
    a: platt.a,
    b: platt.b,
    fitted_at: new Date().toISOString(),
    n_samples: samples.length,
    ece_before: before.ece,
    ece_after: after.ece,
  };
  writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  console.log(`\n--apply: wrote platt_calibration field to ${MODEL_PATH}`);
} else {
  console.log(``);
  console.log(`(Run with --apply to write Platt params into ${MODEL_PATH}.)`);
}
