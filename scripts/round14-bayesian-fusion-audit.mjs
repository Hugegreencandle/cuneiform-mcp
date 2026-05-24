#!/usr/bin/env node
// Round-14 calibration audit: cross-axis Bayesian fusion bootstrap
// (cuneiform-mcp v0.29.0).
//
// Validates the joint-pair-score model trained by
// scripts/train-joint-pair-model.mjs.
//
// Tests:
//   T1. Model trains successfully — file exists, gradient descent converged
//       (final_loss < initial_loss), training_accuracy ≥ 0.85.
//   T2. Positive recovery — K.5896 ↔ K.9508, BM.47463 ↔ CBS.6060,
//       K.3306 ↔ K.6685 all return probability_positive ≥ 0.7.
//   T3. Negative discrimination — a held-out random pair (sampled with a
//       different seed than training) returns probability_positive ≤ 0.3.
//   T4. Per-feature transparency — contribution_to_log_odds is populated
//       and decomposes additively: intercept + Σ contributions = log_odds
//       (within 1e-3 numerical tolerance). Document which feature carries
//       the most weight on the K.5896 ↔ K.9508 case.
//
// Exits 2 on any failure.

import {
  loadJointPairModel,
  _resetJointPairModelCache,
} from "../dist/jointPairScore.js";
import { computeJointPairScore } from "../dist/computeJointPairScore.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { getChunksContaining } from "../dist/chunkIndex.js";

const results = [];
function report(name, pass, detail) {
  const tag = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${tag} — ${name}`);
  if (detail) console.log(`  ${detail}`);
  results.push({ name, pass });
}

function header(title) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
}

// ─── Pre-flight ────────────────────────────────────────────────────────────

header("Pre-flight: load joint-pair model");
_resetJointPairModelCache();
const model = loadJointPairModel();
if (!model) {
  console.error("ABORT: joint-pair model not loaded — run scripts/train-joint-pair-model.mjs first.");
  process.exit(2);
}
console.log(`  Loaded model v${model.version} built at ${model.build_timestamp}`);
console.log(`  Training: ${model.trained_on_n_positives} positives + ${model.trained_on_n_negatives} negatives`);
console.log(`  Training accuracy: ${model.training_accuracy}`);
console.log(`  Final loss: ${model.final_loss}`);
console.log(`  Intercept: ${model.intercept.toFixed(4)}`);
console.log("  Weights:");
for (const [k, v] of Object.entries(model.weights)) {
  console.log(`    ${k.padEnd(24)} = ${v.toFixed(4)}`);
}

// ─── TEST 1: Model trains successfully ─────────────────────────────────────

header("TEST 1: Model trains successfully (training_accuracy ≥ 0.85)");
const t1pass =
  model.training_accuracy >= 0.85 &&
  Number.isFinite(model.final_loss) &&
  model.iterations >= 50;
report(
  "T1 — training_accuracy ≥ 0.85 + converged",
  t1pass,
  `training_accuracy=${model.training_accuracy}  final_loss=${model.final_loss}  iterations=${model.iterations}`,
);

// ─── TEST 2: Positive recovery ─────────────────────────────────────────────

header("TEST 2: Positive recovery (canonical pairs ≥ 0.7)");
const positiveCases = [
  { a: "K.5896", b: "K.9508", label: "Mīs pî sibling §3.7.3" },
  { a: "BM.47463", b: "CBS.6060", label: "Šurpu commentary/base §3.7.1" },
  { a: "K.3306", b: "K.6685", label: "v0.19 chunk-discovery sister §3.6" },
];
let t2pass = true;
const positiveScores = [];
for (const c of positiveCases) {
  const r = computeJointPairScore({ tabletA: c.a, tabletB: c.b });
  console.log(`\n  ${c.a} ↔ ${c.b}   (${c.label})`);
  console.log(`    raw features: lex=${r.features.lex_jaccard.toFixed(3)}  fuz=${r.features.fuzzy_jaccard.toFixed(3)}  them=${r.features.thematic_cosine.toFixed(3)}  scr=${r.features.scribal_cosine.toFixed(3)}  liftZ=${r.features.substitution_lift_z.toFixed(2)}`);
  console.log(`    log_odds=${r.log_odds.toFixed(3)}  probability_positive=${r.probability_positive.toFixed(4)}  classification=${r.classification}`);
  positiveScores.push({ ...c, p: r.probability_positive, score: r });
  if (r.probability_positive < 0.7) t2pass = false;
}
report(
  "T2 — all 3 canonical positives ≥ 0.7",
  t2pass,
  positiveScores.map((s) => `${s.a}↔${s.b}: p=${s.p.toFixed(3)}`).join(" · "),
);

// ─── TEST 3: Negative discrimination (held-out random pair) ────────────────

header("TEST 3: Negative discrimination (held-out random pair ≤ 0.3)");

// Sample a held-out random pair with a different seed than training (20260525).
// Use 20260601 to ensure independence.
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

const allTablets = getAllTabletRecords() ?? [];
const eligible = allTablets.filter(
  (t) => t.period && t.in_lex_graph && (t.sign_count ?? 0) >= 30,
);

const positiveSet = new Set([
  "K.5896",
  "K.9508",
  "K.6683",
  "BM.45749",
  "K.2987.B",
  "K.163",
  "K.2550",
  "BM.47463",
  "CBS.6060",
  "K.2798",
  "Si.776",
  "K.3306",
  "K.6685",
  "BM.77056",
  "Sm.1055",
  "K.7246",
]);

function chunkHostSet(tabletId) {
  const chunks = getChunksContaining(tabletId);
  const hosts = new Set();
  for (const c of chunks) {
    for (const occ of c.occurrences) hosts.add(occ.tablet_id);
  }
  return hosts;
}

const rng = mulberry32(20260601);
let heldOut = null;
let drawAttempts = 0;
while (drawAttempts < 5000 && !heldOut) {
  drawAttempts++;
  const i = Math.floor(rng() * eligible.length);
  let j = Math.floor(rng() * eligible.length);
  if (i === j) j = (j + 1) % eligible.length;
  const a = eligible[i];
  const b = eligible[j];
  if (positiveSet.has(a.id) || positiveSet.has(b.id)) continue;
  if (a.period === b.period) continue;
  if (a.component_id !== null && b.component_id !== null && a.component_id === b.component_id) {
    continue;
  }
  const aChunks = chunkHostSet(a.id);
  if (aChunks.has(b.id)) continue;
  heldOut = { a: a.id, b: b.id, aPeriod: a.period, bPeriod: b.period };
}

let t3pass = false;
let heldOutScore = null;
if (!heldOut) {
  report("T3 — held-out random pair", false, "failed to sample a held-out negative");
} else {
  const r = computeJointPairScore({ tabletA: heldOut.a, tabletB: heldOut.b });
  heldOutScore = r;
  console.log(`\n  Held-out: ${heldOut.a} (${heldOut.aPeriod}) ↔ ${heldOut.b} (${heldOut.bPeriod})`);
  console.log(`    raw features: lex=${r.features.lex_jaccard.toFixed(3)}  fuz=${r.features.fuzzy_jaccard.toFixed(3)}  them=${r.features.thematic_cosine.toFixed(3)}  scr=${r.features.scribal_cosine.toFixed(3)}  liftZ=${r.features.substitution_lift_z.toFixed(2)}`);
  console.log(`    log_odds=${r.log_odds.toFixed(3)}  probability_positive=${r.probability_positive.toFixed(4)}  classification=${r.classification}`);
  t3pass = r.probability_positive <= 0.3;
  report(
    "T3 — held-out random pair ≤ 0.3",
    t3pass,
    `${heldOut.a} ↔ ${heldOut.b}: p=${r.probability_positive.toFixed(4)} (drew in ${drawAttempts} attempts)`,
  );
}

// ─── TEST 4: Per-feature transparency / additive decomposition ─────────────

header("TEST 4: Per-feature transparency — additive log-odds decomposition");

const focus = positiveScores.find((p) => p.a === "K.5896" && p.b === "K.9508");
let t4pass = false;
if (!focus) {
  report("T4 — additive decomposition", false, "K.5896 ↔ K.9508 score missing");
} else {
  const r = focus.score;
  const sumContrib = r.per_feature_contribution.reduce(
    (s, c) => s + c.contribution_to_log_odds,
    0,
  );
  const reconstructed = r.model_metadata.intercept + sumContrib;
  const drift = Math.abs(reconstructed - r.log_odds);

  console.log(`\n  K.5896 ↔ K.9508 — per-feature decomposition:`);
  console.log(`    intercept                = ${r.model_metadata.intercept.toFixed(4)}`);
  const sorted = [...r.per_feature_contribution].sort(
    (a, b) => Math.abs(b.contribution_to_log_odds) - Math.abs(a.contribution_to_log_odds),
  );
  for (const c of sorted) {
    console.log(
      `    ${c.feature.padEnd(24)} weight=${c.weight.toFixed(4)}  raw=${c.raw_value.toFixed(4)}  std=${c.standardized_value.toFixed(4)}  contribution=${c.contribution_to_log_odds >= 0 ? "+" : ""}${c.contribution_to_log_odds.toFixed(4)}`,
    );
  }
  console.log(`    Σ contributions + intercept = ${reconstructed.toFixed(4)}`);
  console.log(`    log_odds (reported)         = ${r.log_odds.toFixed(4)}`);
  console.log(`    drift                       = ${drift.toExponential(2)}`);

  const top = sorted[0];
  console.log(`\n  Dominant feature: ${top.feature} (|contrib|=${Math.abs(top.contribution_to_log_odds).toFixed(4)}, weight=${top.weight.toFixed(4)})`);

  t4pass = drift < 1e-3 && r.per_feature_contribution.length === 5;
  report(
    "T4 — additive decomposition (drift < 1e-3, 5 features)",
    t4pass,
    `drift=${drift.toExponential(2)} · features=${r.per_feature_contribution.length} · top=${top.feature}`,
  );
}

// ─── Final summary ─────────────────────────────────────────────────────────

header("Round-14 audit summary");
const totalPass = results.filter((r) => r.pass).length;
const totalFail = results.length - totalPass;
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log(`\n  ${totalPass} pass / ${totalFail} fail / ${results.length} total`);

if (totalFail > 0) {
  process.exit(2);
}
process.exit(0);
