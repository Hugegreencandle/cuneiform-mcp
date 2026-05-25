#!/usr/bin/env node
// v0.51 — Held-out train/test evaluation of the v0.29 Bayesian fusion model.
//
// Panel-review G1: until we have ≥100 labeled pairs, true out-of-sample
// evaluation isn't reliable. But the METHODOLOGY can be demonstrated now,
// at n=42 (12 positives + 30 negatives from the validation-resolutions
// store), so that when the labeled set grows the same script produces
// publishable metrics.
//
// Procedure:
//   1. Load positives + negatives from validation-resolutions.json
//      (plus methods-paper hardcoded positives for the base 12)
//   2. Deterministically split into train (75%) and test (25%) sets
//      via mulberry32(20260525) — same seed family as train script
//   3. Train v0.29 Bayesian fusion on TRAIN set
//   4. Score every TEST pair via scoreWithModel
//   5. Report: out-of-sample accuracy + Brier + log-loss + AUC (via
//      rank-based proxy) + per-pair predictions for inspection
//
// Methodology paper §3.32 / Claim 52: the same script will produce
// reliable numbers once labeled set reaches ≥100 (panel G1 target).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  extractPairFeatures,
  trainJointPairModel,
  scoreWithModel,
} from "../dist/jointPairScore.js";
import {
  getAllTabletRecords,
} from "../dist/anomalySurface.js";
import { getChunksContaining } from "../dist/chunkIndex.js";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const STORE_PATH = join(CACHE_DIR, "validation-resolutions.json");
const RNG_SEED = 20260525;
const EVAL_FRACTION = parseFloat(process.env.EVAL_FRACTION ?? "0.25");

console.error(`cuneiform-mcp evaluate-joint-pair-model v0.51.0`);
console.error(`  store:          ${STORE_PATH}`);
console.error(`  rng seed:       ${RNG_SEED}`);
console.error(`  eval fraction:  ${EVAL_FRACTION}`);
console.error(``);

// ─── Load store ────────────────────────────────────────────────────────────

if (!existsSync(STORE_PATH)) {
  console.error(`ABORT: validation-resolutions.json missing — run seed-validation-resolutions.mjs first.`);
  process.exit(1);
}
const store = JSON.parse(readFileSync(STORE_PATH, "utf-8"));
const positives = store.resolutions.filter((r) => r.verdict === "positive").map((r) => ({
  a: r.tablet_a,
  b: r.tablet_b,
  source: r.source,
  rationale: r.rationale,
}));
const negatives = store.resolutions.filter((r) => r.verdict === "negative").map((r) => ({
  a: r.tablet_a,
  b: r.tablet_b,
  source: r.source,
  rationale: r.rationale,
}));
console.error(`  positives in store: ${positives.length}`);
console.error(`  negatives in store: ${negatives.length}`);

if (positives.length < 8 || negatives.length < 16) {
  console.error(`WARNING: small labeled set — eval results will be noisy. Need ≥40 positives and ≥80 negatives for reliable metrics.`);
}

// ─── Mulberry32 + deterministic shuffle ────────────────────────────────────

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(arr, rng) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const rng = mulberry32(RNG_SEED);
const posShuffled = shuffled(positives, rng);
const negShuffled = shuffled(negatives, rng);
const posTestN = Math.max(1, Math.floor(posShuffled.length * EVAL_FRACTION));
const negTestN = Math.max(1, Math.floor(negShuffled.length * EVAL_FRACTION));
const posTrain = posShuffled.slice(posTestN);
const posTest = posShuffled.slice(0, posTestN);
const negTrain = negShuffled.slice(negTestN);
const negTest = negShuffled.slice(0, negTestN);

console.error(`  train: ${posTrain.length} pos + ${negTrain.length} neg = ${posTrain.length + negTrain.length}`);
console.error(`  test:  ${posTest.length} pos + ${negTest.length} neg = ${posTest.length + negTest.length}`);

// ─── Build feature vectors ─────────────────────────────────────────────────

const allTablets = getAllTabletRecords();
if (!allTablets) {
  console.error("ABORT: anomaly index not loaded.");
  process.exit(1);
}
const byId = new Map(allTablets.map((t) => [t.id, t]));

function featuresForPair(a, b) {
  try {
    const result = extractPairFeatures(a, b);
    return result?.features ?? null;
  } catch {
    return null;
  }
}

function buildSet(pairs, label) {
  const out = [];
  let skipped = 0;
  for (const p of pairs) {
    const feats = featuresForPair(p.a, p.b);
    if (!feats) {
      skipped++;
      continue;
    }
    out.push({ a: p.a, b: p.b, features: feats, label });
  }
  if (skipped > 0) console.error(`    skipped ${skipped} (no feature vector)`);
  return out;
}

console.error(``);
console.error(`Extracting features...`);
const trainPositives = buildSet(posTrain, 1);
const trainNegatives = buildSet(negTrain, 0);
const testPositives = buildSet(posTest, 1);
const testNegatives = buildSet(negTest, 0);
console.error(`  train usable: ${trainPositives.length} pos + ${trainNegatives.length} neg`);
console.error(`  test usable:  ${testPositives.length} pos + ${testNegatives.length} neg`);

if (trainPositives.length < 3 || testPositives.length < 1) {
  console.error(`ABORT: too few usable training/test positives after feature extraction.`);
  process.exit(1);
}

// ─── Train ─────────────────────────────────────────────────────────────────

console.error(``);
console.error(`Training on ${trainPositives.length} pos + ${trainNegatives.length} neg...`);
const trainingExamples = [
  ...trainPositives.map((e) => ({ tablet_a: e.a, tablet_b: e.b, label: 1, features: e.features })),
  ...trainNegatives.map((e) => ({ tablet_a: e.a, tablet_b: e.b, label: 0, features: e.features })),
];
const { model } = trainJointPairModel(trainingExamples, {
  iterations: 300,
  learningRate: 0.1,
  l2Regularization: 0.01,
});
console.error(`  Train accuracy: ${model.training_accuracy.toFixed(4)}`);

// ─── Evaluate on test set ──────────────────────────────────────────────────

console.error(``);
console.error(`Evaluating on held-out test set...`);

function evalSet(name, examples) {
  const records = [];
  let correct = 0;
  let brierSum = 0;
  let logLossSum = 0;
  for (const ex of examples) {
    const pred = scoreWithModel(ex.features, model);
    const p = Math.max(1e-7, Math.min(1 - 1e-7, pred.probability_positive));
    const isCorrect = (ex.label === 1 && p >= 0.5) || (ex.label === 0 && p < 0.5);
    if (isCorrect) correct++;
    brierSum += Math.pow(p - ex.label, 2);
    logLossSum += ex.label === 1 ? -Math.log(p) : -Math.log(1 - p);
    records.push({
      a: ex.a, b: ex.b, label: ex.label, predicted_probability: p, correct: isCorrect, classification: pred.classification,
    });
  }
  const n = examples.length;
  return {
    name,
    n,
    accuracy: n > 0 ? correct / n : 0,
    brier: n > 0 ? brierSum / n : 0,
    log_loss: n > 0 ? logLossSum / n : 0,
    records,
  };
}

// AUC via Mann-Whitney U: how often a random positive scores higher than a random negative?
function computeAUC(posRecords, negRecords) {
  if (posRecords.length === 0 || negRecords.length === 0) return null;
  let wins = 0;
  let ties = 0;
  let total = posRecords.length * negRecords.length;
  for (const pr of posRecords) {
    for (const nr of negRecords) {
      if (pr.predicted_probability > nr.predicted_probability) wins++;
      else if (pr.predicted_probability === nr.predicted_probability) ties++;
    }
  }
  return (wins + ties / 2) / total;
}

const testCombined = [...testPositives, ...testNegatives];
const trainCombined = [...trainPositives, ...trainNegatives];

const trainEval = evalSet("train", trainCombined);
const testEval = evalSet("test", testCombined);
const testAUC = computeAUC(
  testEval.records.filter((r) => r.label === 1),
  testEval.records.filter((r) => r.label === 0),
);
const trainAUC = computeAUC(
  trainEval.records.filter((r) => r.label === 1),
  trainEval.records.filter((r) => r.label === 0),
);

console.error(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`HELD-OUT EVALUATION RESULTS`);
console.log(`══════════════════════════════════════════════════════════`);
console.log(``);
console.log(`Eval fraction:            ${EVAL_FRACTION}`);
console.log(`Train set:                ${trainPositives.length} pos + ${trainNegatives.length} neg = ${trainCombined.length}`);
console.log(`Test set (held-out):      ${testPositives.length} pos + ${testNegatives.length} neg = ${testCombined.length}`);
console.log(``);
console.log(`In-sample (train):`);
console.log(`  accuracy:   ${trainEval.accuracy.toFixed(4)}`);
console.log(`  brier:      ${trainEval.brier.toFixed(4)}`);
console.log(`  log-loss:   ${trainEval.log_loss.toFixed(4)}`);
console.log(`  AUC:        ${trainAUC?.toFixed(4) ?? "n/a"}`);
console.log(``);
console.log(`Out-of-sample (test):`);
console.log(`  accuracy:   ${testEval.accuracy.toFixed(4)}`);
console.log(`  brier:      ${testEval.brier.toFixed(4)}`);
console.log(`  log-loss:   ${testEval.log_loss.toFixed(4)}`);
console.log(`  AUC:        ${testAUC?.toFixed(4) ?? "n/a"}`);
console.log(``);
console.log(`Generalization gap (in − out):`);
console.log(`  accuracy:   ${(trainEval.accuracy - testEval.accuracy).toFixed(4)}`);
console.log(`  brier:      ${(trainEval.brier - testEval.brier).toFixed(4)}`);
console.log(``);
console.log(`Per-test-pair predictions:`);
for (const r of testEval.records) {
  const mark = r.correct ? "✅" : "❌";
  console.log(`  ${mark} ${r.label === 1 ? "POS" : "NEG"} ${r.a.padEnd(15)} ↔ ${r.b.padEnd(15)} p=${r.predicted_probability.toFixed(4)} → ${r.classification}`);
}

// Write detailed results
const OUT_PATH = join(CACHE_DIR, "held-out-evaluation.json");
writeFileSync(OUT_PATH, JSON.stringify({
  rng_seed: RNG_SEED,
  eval_fraction: EVAL_FRACTION,
  evaluated_at: new Date().toISOString(),
  train: { n_positives: trainPositives.length, n_negatives: trainNegatives.length, accuracy: trainEval.accuracy, brier: trainEval.brier, log_loss: trainEval.log_loss, auc: trainAUC, per_pair: trainEval.records },
  test: { n_positives: testPositives.length, n_negatives: testNegatives.length, accuracy: testEval.accuracy, brier: testEval.brier, log_loss: testEval.log_loss, auc: testAUC, per_pair: testEval.records },
  model: { trained_on_n_positives: model.trained_on_n_positives, trained_on_n_negatives: model.trained_on_n_negatives, training_accuracy: model.training_accuracy },
}, null, 2));
console.log(``);
console.log(`Detailed results written: ${OUT_PATH}`);
