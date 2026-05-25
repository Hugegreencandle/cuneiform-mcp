#!/usr/bin/env node
// v0.29.0 — train the joint-pair-score logistic-regression model.
//
// Trains the cross-axis Bayesian fusion bootstrap model on:
//   - n=12 POSITIVE pairs from the methods paper (siblings/commentary/
//     stemma-sisters/curriculum-cluster/chunk-discovery sisters)
//   - n≈30-50 SYNTHETIC NEGATIVE pairs sampled from the corpus, restricted
//     to (no anomaly-cluster relationship) AND (no chunk-hash co-occurrence)
//     AND (different periods).
//
// Output: ~/.cache/cuneiform-mcp/joint-pair-model.json
//
// Bootstrap quality, NOT production. v1.0 will require ≥100 labeled pairs.
// Deterministic by design: uses mulberry32(20260525). Re-running this script
// MUST produce the same coefficients (modulo build_timestamp).

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  extractPairFeatures,
  trainJointPairModel,
  saveJointPairModel,
  modelCachePath,
  _resetJointPairModelCache,
} from "../dist/jointPairScore.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";
import { getChunksContaining } from "../dist/chunkIndex.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = modelCachePath();

const RNG_SEED = 20260525;
const N_NEGATIVES_TARGET = 40;
const MAX_NEGATIVE_DRAW_ATTEMPTS = 5000;
const ITERATIONS = 300;
const LEARNING_RATE = 0.1;
const L2 = 0.01;

// ─── Labeled positives (methods paper) ─────────────────────────────────────

const METHODS_PAPER_POSITIVES = [
  { a: "K.5896", b: "K.9508", note: "Mīs pî sibling, §3.7.3" },
  { a: "K.5896", b: "K.6683", note: "v0.22 stemma sister, §3.11" },
  { a: "K.5896", b: "BM.45749", note: "Mīs pî sibling, §3.7.3" },
  { a: "K.5896", b: "K.2987.B", note: "Mīs pî sibling" },
  { a: "K.5896", b: "K.163", note: "Mīs pî sibling" },
  { a: "K.5896", b: "K.2550", note: "Mīs pî sibling" },
  { a: "BM.47463", b: "CBS.6060", note: "Šurpu commentary/base, §3.7.1" },
  { a: "K.2798", b: "Si.776", note: "canonical false-negative-rescue case, §1" },
  { a: "K.3306", b: "K.6685", note: "v0.19 chunk-discovery sister, §3.6 amendment" },
  { a: "BM.77056", b: "K.5896", note: "āšipūtu curriculum cluster, §3.1" },
  { a: "BM.77056", b: "BM.45749", note: "āšipūtu curriculum" },
  { a: "Sm.1055", b: "K.7246", note: "Udug-ḫul chain, §3.7.2" },
];

// v0.47 — Merge with persistent validation-resolutions store.
// Reads ~/.cache/cuneiform-mcp/validation-resolutions.json (populated by
// scripts/seed-validation-resolutions.mjs + record_validation_resolution MCP
// tool). Union: methods-paper positives + store-positives, deduped by
// canonical pair_id. Negatives are similarly merged with synthetic negatives
// generated below (the synthetic-negative sampling step now SKIPS pairs
// already in the store as negatives, to avoid sampling them twice).

import { existsSync as _existsForStore, readFileSync as _readForStore } from "node:fs";
import { join as _joinForStore } from "node:path";
import { homedir as _homedirForStore } from "node:os";

function canonicalPairKey(a, b) {
  const [x, y] = [a, b].sort();
  return `${x}↔${y}`;
}

function loadValidationStorePositives() {
  const path = _joinForStore(
    process.env.CUNEIFORM_MCP_CACHE_DIR || _joinForStore(_homedirForStore(), ".cache", "cuneiform-mcp"),
    "validation-resolutions.json",
  );
  if (!_existsForStore(path)) return { positives: [], negatives: [] };
  try {
    const store = JSON.parse(_readForStore(path, "utf-8"));
    const positives = (store.resolutions ?? [])
      .filter((r) => r.verdict === "positive")
      .map((r) => ({ a: r.tablet_a, b: r.tablet_b, note: r.rationale, source: r.source }));
    const negatives = (store.resolutions ?? [])
      .filter((r) => r.verdict === "negative")
      .map((r) => ({ a: r.tablet_a, b: r.tablet_b, note: r.rationale, source: r.source }));
    return { positives, negatives };
  } catch {
    return { positives: [], negatives: [] };
  }
}

const _storeData = loadValidationStorePositives();
const _seenPairKeys = new Set(METHODS_PAPER_POSITIVES.map((p) => canonicalPairKey(p.a, p.b)));
const _storeOnlyPositives = _storeData.positives.filter((p) => {
  const k = canonicalPairKey(p.a, p.b);
  if (_seenPairKeys.has(k)) return false;
  _seenPairKeys.add(k);
  return true;
});
const POSITIVE_PAIRS = [...METHODS_PAPER_POSITIVES, ..._storeOnlyPositives];
const _labeledNegativesFromStore = _storeData.negatives;
console.error(`  positives from methods_paper: ${METHODS_PAPER_POSITIVES.length}`);
console.error(`  positives from store (new):   ${_storeOnlyPositives.length}`);
console.error(`  negatives from store:         ${_labeledNegativesFromStore.length}`);

// ─── Mulberry32 (deterministic RNG) ────────────────────────────────────────

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

// ─── Pre-flight ────────────────────────────────────────────────────────────

console.error("cuneiform-mcp train-joint-pair-model v0.29.0");
console.error(`  output:               ${OUT_PATH}`);
console.error(`  rng seed:             ${RNG_SEED}`);
console.error(`  n positives:          ${POSITIVE_PAIRS.length}`);
console.error(`  n negatives target:   ${N_NEGATIVES_TARGET}`);
console.error(`  iterations:           ${ITERATIONS}`);
console.error(`  learning rate:        ${LEARNING_RATE}`);
console.error(`  l2 regularization:    ${L2}`);
console.error("");

// ─── Sample synthetic negatives ────────────────────────────────────────────

const allTablets = getAllTabletRecords();
if (!allTablets) {
  console.error("ABORT: anomaly index not loaded — run scripts/build-anomaly-index.mjs first.");
  process.exit(1);
}
console.error(`Loaded ${allTablets.length} tablet records.`);

// Build a quick lookup of positive pair tablet ids to avoid sampling them.
const positiveTabletSet = new Set();
for (const p of POSITIVE_PAIRS) {
  positiveTabletSet.add(p.a);
  positiveTabletSet.add(p.b);
}

// Eligible pool: tablets with a period tag + lex_count != null (i.e. in the
// trigram index). We need the trigram index for any axis to fire.
const eligible = allTablets.filter(
  (t) => t.period && t.in_lex_graph && (t.sign_count ?? 0) >= 30,
);
console.error(`  Eligible-for-negatives pool: ${eligible.length} tablets (in lex graph + period tagged + ≥30 signs)`);

// Pre-build a set-of-chunk-tablets-containing-X for each candidate to allow
// O(1) negative co-occurrence checks at sampling time.
function chunkHostSet(tabletId) {
  const chunks = getChunksContaining(tabletId);
  const hosts = new Set();
  for (const c of chunks) {
    for (const occ of c.occurrences) hosts.add(occ.tablet_id);
  }
  return hosts;
}

const rng = mulberry32(RNG_SEED);
const negativePairs = [];
const seen = new Set();
// v0.47 — Pre-populate negatives from the validation-resolutions store.
// These are hand-labeled or audit-resolution negatives and skip the
// synthetic-sampling step entirely. Synthetic sampling tops up to
// N_NEGATIVES_TARGET from there.
for (const n of _labeledNegativesFromStore) {
  const key = n.a < n.b ? `${n.a}|${n.b}` : `${n.b}|${n.a}`;
  if (seen.has(key)) continue;
  seen.add(key);
  negativePairs.push({ a: n.a, b: n.b, source: n.source ?? "store" });
}
console.error(`  Pre-loaded ${negativePairs.length} negatives from validation-resolutions store.`);
let attempts = 0;
const t0 = Date.now();

while (negativePairs.length < N_NEGATIVES_TARGET && attempts < MAX_NEGATIVE_DRAW_ATTEMPTS) {
  attempts++;
  const i = Math.floor(rng() * eligible.length);
  let j = Math.floor(rng() * eligible.length);
  if (i === j) j = (j + 1) % eligible.length;
  const a = eligible[i];
  const b = eligible[j];

  // Skip positive tablets (don't accidentally re-sample known-positive sides).
  if (positiveTabletSet.has(a.id) || positiveTabletSet.has(b.id)) continue;

  // Canonicalize so unordered pair is unique.
  const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
  if (seen.has(key)) continue;

  // Constraint 1: different periods.
  if (a.period === b.period) continue;

  // Constraint 2: no chunk-hash co-occurrence.
  const aChunks = chunkHostSet(a.id);
  if (aChunks.has(b.id)) continue;

  // Constraint 3: no shared anomaly component (component_id, when both present).
  if (
    a.component_id !== null &&
    b.component_id !== null &&
    a.component_id === b.component_id
  ) {
    continue;
  }

  seen.add(key);
  negativePairs.push({ a: a.id, b: b.id });
}
const sampleSecs = ((Date.now() - t0) / 1000).toFixed(1);
console.error(
  `Sampled ${negativePairs.length} negatives in ${attempts} draws (${sampleSecs}s).`,
);
if (negativePairs.length < 20) {
  console.error("WARNING: fewer than 20 synthetic negatives — model may underfit.");
}

// ─── Extract features for every example ────────────────────────────────────

console.error("");
console.error("Extracting features...");

const examples = [];
const failures = [];

function extract(a, b, label, note) {
  try {
    const ext = extractPairFeatures(a, b);
    return {
      tablet_a: a,
      tablet_b: b,
      label,
      features: ext.features,
      _status: ext.per_axis_status,
      _note: note ?? "",
    };
  } catch (e) {
    failures.push({ a, b, err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

console.error("  Positives:");
for (const p of POSITIVE_PAIRS) {
  const ex = extract(p.a, p.b, 1, p.note);
  if (!ex) {
    console.error(`    ✗ ${p.a} ↔ ${p.b} — extraction failed`);
    continue;
  }
  const f = ex.features;
  console.error(
    `    + ${p.a.padEnd(14)} ↔ ${p.b.padEnd(14)}  lex=${f.lex_jaccard.toFixed(3)}  fuz=${f.fuzzy_jaccard.toFixed(3)}  them=${f.thematic_cosine.toFixed(3)}  scr=${f.scribal_cosine.toFixed(3)}  liftZ=${f.substitution_lift_z.toFixed(2)}`,
  );
  examples.push(ex);
}

console.error("  Negatives:");
for (const n of negativePairs) {
  const ex = extract(n.a, n.b, 0);
  if (!ex) {
    console.error(`    ✗ ${n.a} ↔ ${n.b} — extraction failed`);
    continue;
  }
  examples.push(ex);
}
console.error(`  Total examples: ${examples.length} (failures: ${failures.length})`);

// ─── Train ─────────────────────────────────────────────────────────────────

console.error("");
console.error("Training logistic regression...");

const { model, per_example_predictions: preds, loss_history: loss } = trainJointPairModel(
  examples,
  {
    iterations: ITERATIONS,
    learningRate: LEARNING_RATE,
    l2Regularization: L2,
    rngSeed: RNG_SEED,
    version: "v0.29.0",
  },
);

console.error(`  Converged after ${ITERATIONS} iterations.`);
console.error(`  Initial loss:  ${loss[0].toFixed(6)}`);
console.error(`  Final loss:    ${loss[loss.length - 1].toFixed(6)}`);
console.error(`  Training acc:  ${model.training_accuracy}`);
console.error("");
console.error("  Coefficients:");
console.error(`    intercept                = ${model.intercept.toFixed(4)}`);
for (const f of Object.keys(model.weights)) {
  console.error(`    ${f.padEnd(24)} = ${model.weights[f].toFixed(4)}   (mean=${model.feature_means[f].toFixed(4)}, sd=${model.feature_stds[f].toFixed(4)})`);
}

// ─── Save ──────────────────────────────────────────────────────────────────

mkdirSync(dirname(OUT_PATH), { recursive: true });
saveJointPairModel(model);

const exists = existsSync(OUT_PATH);
console.error("");
console.error(`Model saved to ${OUT_PATH} (${exists ? "OK" : "MISSING — write failed"})`);

// ─── Summary of misclassifications ─────────────────────────────────────────

const errors = preds.filter((r) => !r.correct);
if (errors.length === 0) {
  console.error("All training examples classified correctly (100% accuracy).");
} else {
  console.error(`Misclassified: ${errors.length}/${preds.length}`);
  for (const e of errors) {
    console.error(
      `  ${e.tablet_a} ↔ ${e.tablet_b}   label=${e.label}  p=${e.probability.toFixed(3)}`,
    );
  }
}

// Allow downstream scripts in the same Node process (if any) to reload.
_resetJointPairModelCache();

process.exit(0);
