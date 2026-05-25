#!/usr/bin/env node
// Lacuna restoration BLEU/CHRF benchmark — panel-review Lindqvist ask.
//
// Synthesizes K single-sign gaps across a stratified sample of corpus
// tablets, runs v0.30 restore_lacuna_semantic + v0.18 restore_lacuna_passage
// where available, and reports:
//   - top-1 sign accuracy (the only true metric for single-position gaps)
//   - mean reciprocal rank (MRR) over top-K predictions
//   - confidence-correlated accuracy: how often is the top-1 right at
//     each top1_score percentile bucket?
//
// BLEU/CHRF in the traditional sense (n-gram precision over sequences)
// don't apply to single-sign predictions. Reported here as character-level
// BLEU-1 (exact-match) which is operationally equivalent to top-1 accuracy
// for single-sign prediction. The Gutherz 2023 80.0 BLEU figure is on
// multi-sign sequence completion, not directly comparable to v0.30's
// single-position framing — that distinction is documented in the output.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { restoreLacunaSemantic } from "../dist/restoreLacunaSemantic.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);

function cacheDir() {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadCorpus() {
  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    console.error(`signs cache not found: ${path}`);
    process.exit(1);
  }
  const records = JSON.parse(readFileSync(path, "utf-8"));
  const out = new Map();
  for (const r of records) {
    if (!r._id || typeof r.signs !== "string") continue;
    const tokens = r.signs.split(/\s+/).filter(Boolean);
    if (tokens.length < 30) continue;
    out.set(r._id, tokens);
  }
  return out;
}

// Mulberry32 deterministic RNG.
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

const RNG_SEED = 20260525;
const SAMPLE_SIZE = parseInt(process.env.BLEU_BENCHMARK_SAMPLE_SIZE ?? "200", 10);

console.log(`Lacuna BLEU benchmark — v0.30 restore_lacuna_semantic`);
console.log(`Sample size: ${SAMPLE_SIZE}  ·  seed: ${RNG_SEED}`);
console.log(``);

const corpus = loadCorpus();
console.log(`Corpus: ${corpus.size} eligible tablets (≥30 tokens)`);

const tabletIds = Array.from(corpus.keys());
const rng = mulberry32(RNG_SEED);
const shuffled = tabletIds.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const samples = [];
for (const id of shuffled) {
  if (samples.length >= SAMPLE_SIZE) break;
  const tokens = corpus.get(id);
  // Find a non-damage position to synthesize a gap.
  const visiblePositions = [];
  for (let i = 5; i < tokens.length - 5; i++) {
    if (!DAMAGE_TOKENS.has(tokens[i])) visiblePositions.push(i);
  }
  if (visiblePositions.length === 0) continue;
  const pos = visiblePositions[Math.floor(rng() * visiblePositions.length)];
  const groundTruth = tokens[pos];
  if (DAMAGE_TOKENS.has(groundTruth)) continue;
  // Create synthetic gap by replacing groundTruth with X
  const masked = tokens.slice();
  masked[pos] = "X";
  samples.push({
    tablet_id: id,
    lacuna_position: pos,
    ground_truth: groundTruth,
    masked_signs: masked.join(" "),
  });
}

console.log(`Synthesized ${samples.length} gaps`);
console.log(``);

let top1Correct = 0;
let top3Correct = 0;
let top5Correct = 0;
let mrrSum = 0;
const calibrationSamples = [];
const errors = [];

const t0 = Date.now();
for (let i = 0; i < samples.length; i++) {
  const s = samples[i];
  if (i > 0 && i % 50 === 0) {
    process.stderr.write(`  progress: ${i}/${samples.length}\n`);
  }
  let lac;
  try {
    lac = restoreLacunaSemantic({
      signs: s.masked_signs,
      lacuna_position: s.lacuna_position,
      top_k: 10,
      alpha: 0.5,
    });
  } catch (e) {
    errors.push(`${s.tablet_id}#${s.lacuna_position}: ${e.message ?? e}`);
    continue;
  }
  if (lac.predictions.length === 0) {
    errors.push(`${s.tablet_id}#${s.lacuna_position}: empty predictions`);
    continue;
  }
  let rank = -1;
  for (let r = 0; r < lac.predictions.length; r++) {
    if (lac.predictions[r].sign === s.ground_truth) {
      rank = r + 1;
      break;
    }
  }
  if (rank === 1) top1Correct++;
  if (rank > 0 && rank <= 3) top3Correct++;
  if (rank > 0 && rank <= 5) top5Correct++;
  if (rank > 0) mrrSum += 1 / rank;
  // Calibration: top-1 joint_score vs whether top-1 is correct
  calibrationSamples.push({
    predicted_probability: Math.max(0, Math.min(1, lac.predictions[0].joint_score)),
    correct: lac.predictions[0].sign === s.ground_truth,
  });
}

const elapsed = (Date.now() - t0) / 1000;
const n = samples.length;

console.log(`Elapsed: ${elapsed.toFixed(1)}s  (${(elapsed * 1000 / n).toFixed(1)} ms/sample)`);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Lacuna restoration benchmark — ${n} synthetic gaps`);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`  top-1 accuracy: ${(top1Correct / n * 100).toFixed(2)}%  (${top1Correct}/${n})`);
console.log(`  top-3 accuracy: ${(top3Correct / n * 100).toFixed(2)}%`);
console.log(`  top-5 accuracy: ${(top5Correct / n * 100).toFixed(2)}%`);
console.log(`  MRR:            ${(mrrSum / n).toFixed(4)}`);
console.log(``);
console.log(`Note: top-1 accuracy = character-level BLEU-1 = exact-match`);
console.log(`for single-sign restoration. Gutherz et al. 2023 reports`);
console.log(`80.0 BLEU on Akkadian → English TRANSLATION (different task,`);
console.log(`multi-token sequence generation); not directly comparable.`);
console.log(`Methods paper §3.5 reports 92% top-1 on PARALLEL-TEMPLATE`);
console.log(`alignment which uses additional structural context; this`);
console.log(`benchmark is on bare context-window prediction.`);
if (errors.length > 0) {
  console.log(``);
  console.log(`Errors: ${errors.length} samples failed (first 3):`);
  for (const e of errors.slice(0, 3)) console.log(`  ${e}`);
}
console.log(``);
console.log(`Calibration samples written for compute_confidence_calibration:`);
console.log(`  ${calibrationSamples.length} samples; copy/paste:`);
console.log(``);
console.log(JSON.stringify(calibrationSamples.slice(0, 5)) + "  // (truncated)");
console.log(``);
console.log(`Mean top-1 confidence: ${(calibrationSamples.reduce((s, x) => s + x.predicted_probability, 0) / calibrationSamples.length).toFixed(4)}`);
console.log(`Top-1 accuracy:        ${(top1Correct / n).toFixed(4)}`);
console.log(`Gap (acc - conf):      ${(top1Correct / n - calibrationSamples.reduce((s, x) => s + x.predicted_probability, 0) / calibrationSamples.length).toFixed(4)}`);
console.log(``);
// Write calibration samples to a file the audit can ingest.
const outPath = join(cacheDir(), "lacuna-bleu-calibration-samples.json");
const fs = await import("node:fs");
fs.writeFileSync(outPath, JSON.stringify({
  benchmark_run: {
    seed: RNG_SEED,
    sample_size: n,
    elapsed_seconds: elapsed,
    top1_accuracy: top1Correct / n,
    top3_accuracy: top3Correct / n,
    top5_accuracy: top5Correct / n,
    mrr: mrrSum / n,
  },
  calibration_samples: calibrationSamples,
}, null, 2));
console.log(`Calibration samples written to: ${outPath}`);
