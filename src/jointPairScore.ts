// v0.29.0 — joint pair score model: cross-axis Bayesian fusion bootstrap.
//
// Aggregates the 5 per-axis discovery signals (lexical Jaccard, fuzzy Jaccard,
// thematic cosine, scribal cosine, substitution lift z-score) into ONE
// calibrated probability that the pair is a "positive" (sibling / commentary /
// stemma-sister / curriculum cluster / chunk-discovery sister).
//
// v0.29 ships a BOOTSTRAP model trained on n=12 positive pairs from the
// methods paper + n≈30-50 synthetic random-pair negatives. This is a
// proof-of-concept for v1.0-readiness — production-quality fusion requires
// ≥100 labeled pairs. The tool surface explicitly warns about this.
//
// Implementation:
//   1. Feature extraction via comparePair.compareTabletPair + computeLexical
//      SubstitutionLift. 5 features per pair; missing axes default to 0.
//   2. Logistic regression with z-standardized features (mean=0, sd=1 per
//      feature using the training-set distribution). Pure TS — sigmoid +
//      cross-entropy loss + gradient descent. ~200 iterations, lr=0.1.
//   3. Cache coefficients (intercept + 5 weights + means + stds) at
//      ~/.cache/cuneiform-mcp/joint-pair-model.json (~1 KB).
//   4. Per-feature contribution_to_log_odds = standardized_x * weight.
//      Sum + intercept = log_odds. Transparent / additive.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

import { compareTabletPair } from "./comparePair.js";
import { computeLexicalSubstitutionLift } from "./computeLexicalSubstitutionLift.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type FeatureName =
  | "lex_jaccard"
  | "fuzzy_jaccard"
  | "thematic_cosine"
  | "scribal_cosine"
  | "substitution_lift_z"
  | "composition_assignment_match";

export const FEATURE_ORDER: FeatureName[] = [
  "lex_jaccard",
  "fuzzy_jaccard",
  "thematic_cosine",
  "scribal_cosine",
  "substitution_lift_z",
  "composition_assignment_match",
];

export type FeatureVector = Record<FeatureName, number>;

export type JointPairModel = {
  version: string;
  build_timestamp: string;
  trained_on_n_positives: number;
  trained_on_n_negatives: number;
  training_accuracy: number;
  final_loss: number;
  iterations: number;
  learning_rate: number;
  rng_seed: number;
  /** Intercept (bias). */
  intercept: number;
  /** Weights in FEATURE_ORDER. */
  weights: Record<FeatureName, number>;
  /** Per-feature mean (used to z-standardize at query time). */
  feature_means: Record<FeatureName, number>;
  /** Per-feature stddev (sample). */
  feature_stds: Record<FeatureName, number>;
  /** Sanity caveat surfaced into the tool output. */
  bootstrap_warning: string;
};

// ─── Cache path ────────────────────────────────────────────────────────────

const MODEL_FILE = "joint-pair-model.json";

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

export function modelCachePath(): string {
  return join(cacheDir(), MODEL_FILE);
}

// ─── Model load (lazy, memoized) ───────────────────────────────────────────

let _model: JointPairModel | null = null;
let _loadAttempted = false;
let _loadError: string | null = null;

export function loadJointPairModel(): JointPairModel | null {
  if (_model) return _model;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  const path = modelCachePath();
  if (!existsSync(path)) {
    _loadError = `joint-pair model not built: ${path} missing — run scripts/train-joint-pair-model.mjs`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as JointPairModel;
    // Sanity: every feature must be present in weights/means/stds.
    for (const f of FEATURE_ORDER) {
      if (typeof parsed.weights?.[f] !== "number") {
        _loadError = `joint-pair model missing weight for feature '${f}'`;
        return null;
      }
      if (typeof parsed.feature_means?.[f] !== "number") {
        _loadError = `joint-pair model missing mean for feature '${f}'`;
        return null;
      }
      if (typeof parsed.feature_stds?.[f] !== "number") {
        _loadError = `joint-pair model missing stddev for feature '${f}'`;
        return null;
      }
    }
    _model = parsed;
    return _model;
  } catch (e) {
    _loadError = `joint-pair model load failed: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

export function getJointPairModelLoadError(): string | null {
  loadJointPairModel();
  return _loadError;
}

export function saveJointPairModel(model: JointPairModel): void {
  const path = modelCachePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(model, null, 2));
}

/** Test-only — resets memoized load state. Exported so the training script can
 *  re-save and the audit can re-read in the same Node process. */
export function _resetJointPairModelCache(): void {
  _model = null;
  _loadAttempted = false;
  _loadError = null;
}

// ─── Feature extraction ────────────────────────────────────────────────────

export type FeatureExtractionResult = {
  features: FeatureVector;
  per_axis_status: Record<FeatureName, "ok" | "below_threshold" | "missing">;
  warnings: string[];
};

/**
 * Extract the 5-axis feature vector for a tablet pair. Below-threshold or
 * missing axes return 0 (a deliberate conservative default — the model learns
 * that 0 means "no signal" from the negative training set, which is dominated
 * by 0s).
 */
export function extractPairFeatures(
  tabletA: string,
  tabletB: string,
): FeatureExtractionResult {
  const warnings: string[] = [];
  const features: FeatureVector = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
    composition_assignment_match: 0,
  };
  const status: Record<FeatureName, "ok" | "below_threshold" | "missing"> = {
    lex_jaccard: "missing",
    fuzzy_jaccard: "missing",
    thematic_cosine: "missing",
    scribal_cosine: "missing",
    substitution_lift_z: "missing",
    composition_assignment_match: "missing",
  };

  // ── compareTabletPair: lexical / fuzzy / thematic / scribal ──────────────
  try {
    const pair = compareTabletPair({ tabletA, tabletB });
    for (const w of pair.warnings) warnings.push(w);

    const lex = pair.axes.lexical;
    if (lex.status === "found") {
      features.lex_jaccard = Number(lex.values.exact_jaccard ?? 0);
      status.lex_jaccard = "ok";
    } else if (lex.status === "below_threshold") {
      status.lex_jaccard = "below_threshold";
    }

    const fuz = pair.axes.fuzzy;
    if (fuz.status === "found") {
      features.fuzzy_jaccard = Number(fuz.values.fuzzy_jaccard ?? 0);
      status.fuzzy_jaccard = "ok";
    } else if (fuz.status === "below_threshold") {
      status.fuzzy_jaccard = "below_threshold";
    }

    const them = pair.axes.thematic;
    if (them.status === "found") {
      features.thematic_cosine = Number(them.values.thematic_cosine ?? 0);
      status.thematic_cosine = "ok";
    } else if (them.status === "below_threshold") {
      status.thematic_cosine = "below_threshold";
    }

    const scr = pair.axes.scribal;
    if (scr.status === "found") {
      features.scribal_cosine = Number(scr.values.signature_cosine ?? 0);
      status.scribal_cosine = "ok";
    } else if (scr.status === "below_threshold") {
      status.scribal_cosine = "below_threshold";
    }
  } catch (e) {
    warnings.push(
      `compareTabletPair failed for ${tabletA} ↔ ${tabletB}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── computeLexicalSubstitutionLift: substitution_lift_z ──────────────────
  try {
    const lift = computeLexicalSubstitutionLift({ tabletA, tabletB });
    for (const w of lift.warnings) warnings.push(w);
    // lift_z_score may be NaN if stddev was 0; coerce to 0 with a warning.
    const z = Number(lift.lift_z_score);
    if (Number.isFinite(z)) {
      features.substitution_lift_z = z;
      status.substitution_lift_z = "ok";
    } else {
      warnings.push(`substitution_lift_z is non-finite for ${tabletA} ↔ ${tabletB}; defaulting to 0`);
    }
  } catch (e) {
    warnings.push(
      `computeLexicalSubstitutionLift failed for ${tabletA} ↔ ${tabletB}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // ── v0.56 composition_assignment_match ──────────────────────────────────
  // Reads from the v0.54 composition-assignments cache. For pair (A, B):
  //   1.0 → same composition_id at p ≥ 0.5
  //   0.7 → comp(A) === parent_curriculum(comp(B)), or vice versa
  //   0.5 → comp(A).parent_curriculum === comp(B).parent_curriculum (both
  //         in same curriculum family, e.g. Mīs pî + Šurpu both → āšipūtu)
  //   0.0 → no relationship
  // Cache loaded lazily; absent cache yields 0 and "missing" status.
  try {
    const compMatch = composeCompositionAssignmentMatch(tabletA, tabletB);
    if (compMatch !== null) {
      features.composition_assignment_match = compMatch;
      status.composition_assignment_match = "ok";
    }
  } catch (e) {
    warnings.push(
      `composition_assignment_match failed for ${tabletA} ↔ ${tabletB}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return { features, per_axis_status: status, warnings };
}

// ─── v0.56 composition-assignment-match helper ─────────────────────────────

const ASSIGNMENTS_FILE = "composition-assignments.json";
let _assignCache: Record<string, { top_composition_id: string; confidence: number }> | null = null;
let _assignAttempted = false;

function loadAssignCache(): Record<string, { top_composition_id: string; confidence: number }> | null {
  if (_assignCache) return _assignCache;
  if (_assignAttempted) return null;
  _assignAttempted = true;
  const path = join(cacheDir(), ASSIGNMENTS_FILE);
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, "utf-8"));
    _assignCache = data?.assignments ?? null;
    return _assignCache;
  } catch {
    return null;
  }
}

// Registry parent_curriculum lookup, lazy.
let _registryCurriculum: Map<string, string | null> | null = null;
function loadRegistryCurriculum(): Map<string, string | null> {
  if (_registryCurriculum) return _registryCurriculum;
  _registryCurriculum = new Map();
  try {
    // The composition registry lives at data/compositions-v1.json relative
    // to the cuneiform-mcp repo root. Resolution mirrors the data-dir logic
    // in src/compositionRegistry.ts.
    const candidates = [
      join(dirname(cacheDir()), "..", "..", "Desktop", "cuneiform-mcp", "data", "compositions-v1.json"),
      // Common fallback: process.cwd-relative
      join(process.cwd(), "data", "compositions-v1.json"),
      // ESM-relative: ../data/compositions-v1.json
      join(dirname(new URL(import.meta.url).pathname), "..", "..", "data", "compositions-v1.json"),
      join(dirname(new URL(import.meta.url).pathname), "..", "data", "compositions-v1.json"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const reg = JSON.parse(readFileSync(p, "utf-8"));
        for (const c of reg.compositions ?? []) {
          _registryCurriculum.set(c.id, c.parent_curriculum ?? null);
        }
        break;
      }
    }
  } catch {
    // empty map fallback
  }
  return _registryCurriculum;
}

function composeCompositionAssignmentMatch(a: string, b: string): number | null {
  const assignments = loadAssignCache();
  if (!assignments) return null;
  const a1 = assignments[a];
  const b1 = assignments[b];
  if (!a1 || !b1) return 0; // both must have assignments for a non-null comparison
  if (a1.confidence < 0.5 || b1.confidence < 0.5) return 0;
  if (a1.top_composition_id === b1.top_composition_id) return 1.0;
  const curric = loadRegistryCurriculum();
  const parentA = curric.get(a1.top_composition_id) ?? null;
  const parentB = curric.get(b1.top_composition_id) ?? null;
  // One is parent of the other?
  if (a1.top_composition_id === parentB || b1.top_composition_id === parentA) return 0.7;
  // Both in same curriculum family?
  if (parentA && parentA === parentB) return 0.5;
  return 0;
}

// ─── Numerical helpers ─────────────────────────────────────────────────────

export function sigmoid(z: number): number {
  // Numerically-stable sigmoid.
  if (z >= 0) {
    const ez = Math.exp(-z);
    return 1 / (1 + ez);
  }
  const ez = Math.exp(z);
  return ez / (1 + ez);
}

export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) {
    const d = x - m;
    s += d * d;
  }
  // Sample stddev. Guard against degenerate sd=0 (all values identical).
  return Math.sqrt(s / (xs.length - 1));
}

export function standardize(
  vec: FeatureVector,
  means: Record<FeatureName, number>,
  stds: Record<FeatureName, number>,
): FeatureVector {
  const out: FeatureVector = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
    composition_assignment_match: 0,
  };
  for (const f of FEATURE_ORDER) {
    const s = stds[f];
    out[f] = s > 1e-9 ? (vec[f] - means[f]) / s : 0;
  }
  return out;
}

// ─── Training: logistic regression ─────────────────────────────────────────

export type TrainingExample = {
  tablet_a: string;
  tablet_b: string;
  label: 0 | 1; // 1 = positive (true relationship), 0 = negative
  features: FeatureVector;
};

export type TrainingResult = {
  model: JointPairModel;
  per_example_predictions: {
    tablet_a: string;
    tablet_b: string;
    label: 0 | 1;
    probability: number;
    correct: boolean;
  }[];
  loss_history: number[];
};

export type TrainOptions = {
  iterations?: number;
  learningRate?: number;
  l2Regularization?: number;
  rngSeed?: number;
  version?: string;
};

/**
 * Train a logistic-regression model on the supplied examples.
 * - Standardizes features using the training-set mean/std (cached for query time).
 * - Gradient descent on cross-entropy loss; lr=0.1, default 300 iterations.
 * - L2 regularization (default 0.01) prevents weights from blowing up on the
 *   tiny training set.
 */
export function trainJointPairModel(
  examples: TrainingExample[],
  opts: TrainOptions = {},
): TrainingResult {
  const iterations = opts.iterations ?? 300;
  const lr = opts.learningRate ?? 0.1;
  const l2 = opts.l2Regularization ?? 0.01;
  const rngSeed = opts.rngSeed ?? 20260525;
  const version = opts.version ?? "v0.29.0";

  if (examples.length === 0) {
    throw new Error("trainJointPairModel: no examples provided");
  }

  // Compute training-set per-feature mean + sample stddev.
  const featureMeans: Record<FeatureName, number> = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
    composition_assignment_match: 0,
  };
  const featureStds: Record<FeatureName, number> = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
    composition_assignment_match: 0,
  };
  for (const f of FEATURE_ORDER) {
    const xs = examples.map((e) => e.features[f]);
    featureMeans[f] = mean(xs);
    featureStds[f] = stddev(xs);
  }

  // Standardize every example up-front.
  const X: number[][] = examples.map((e) => {
    const s = standardize(e.features, featureMeans, featureStds);
    return FEATURE_ORDER.map((f) => s[f]);
  });
  const y: number[] = examples.map((e) => e.label);

  // Initialize weights at 0 + intercept at log-odds of the positive class
  // (a calibrated starting point).
  const nPos = y.reduce((a, b) => a + b, 0);
  const nNeg = y.length - nPos;
  const priorLogOdds = nPos > 0 && nNeg > 0 ? Math.log(nPos / nNeg) : 0;

  let weights = FEATURE_ORDER.map(() => 0);
  let intercept = priorLogOdds;

  const lossHistory: number[] = [];

  for (let iter = 0; iter < iterations; iter++) {
    // Forward pass: predictions + loss
    const preds = X.map((row) => {
      let z = intercept;
      for (let i = 0; i < weights.length; i++) z += weights[i] * row[i];
      return sigmoid(z);
    });
    let loss = 0;
    for (let i = 0; i < preds.length; i++) {
      const p = Math.max(1e-12, Math.min(1 - 1e-12, preds[i]));
      loss += -(y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p));
    }
    loss /= preds.length;
    // L2 penalty (excludes intercept)
    let l2Pen = 0;
    for (const w of weights) l2Pen += w * w;
    loss += 0.5 * l2 * l2Pen;
    lossHistory.push(loss);

    // Gradients
    const gradW = new Array(weights.length).fill(0);
    let gradB = 0;
    for (let i = 0; i < preds.length; i++) {
      const diff = preds[i] - y[i];
      gradB += diff;
      for (let j = 0; j < weights.length; j++) gradW[j] += diff * X[i][j];
    }
    gradB /= preds.length;
    for (let j = 0; j < weights.length; j++) {
      gradW[j] /= preds.length;
      gradW[j] += l2 * weights[j];
    }

    // Update
    intercept -= lr * gradB;
    for (let j = 0; j < weights.length; j++) weights[j] -= lr * gradW[j];
  }

  // Final accuracy
  const perExample = examples.map((e, idx) => {
    const row = X[idx];
    let z = intercept;
    for (let i = 0; i < weights.length; i++) z += weights[i] * row[i];
    const p = sigmoid(z);
    return {
      tablet_a: e.tablet_a,
      tablet_b: e.tablet_b,
      label: e.label,
      probability: p,
      correct: (p >= 0.5 ? 1 : 0) === e.label,
    };
  });
  const correct = perExample.filter((r) => r.correct).length;
  const accuracy = correct / perExample.length;

  const weightsRecord: Record<FeatureName, number> = {
    lex_jaccard: weights[0],
    fuzzy_jaccard: weights[1],
    thematic_cosine: weights[2],
    scribal_cosine: weights[3],
    substitution_lift_z: weights[4],
    composition_assignment_match: weights[5],
  };

  const model: JointPairModel = {
    version,
    build_timestamp: new Date().toISOString(),
    trained_on_n_positives: nPos,
    trained_on_n_negatives: nNeg,
    training_accuracy: +accuracy.toFixed(4),
    final_loss: +lossHistory[lossHistory.length - 1].toFixed(6),
    iterations,
    learning_rate: lr,
    rng_seed: rngSeed,
    intercept: +intercept.toFixed(6),
    weights: weightsRecord,
    feature_means: featureMeans,
    feature_stds: featureStds,
    bootstrap_warning: `Bootstrap quality, NOT production. Trained on n=${nPos} positives (methods-paper labeled pairs) + n=${nNeg} synthetic random-pair negatives. v1.0 will require ≥100 labeled pairs for production-quality fusion.`,
  };

  return { model, per_example_predictions: perExample, loss_history: lossHistory };
}

// ─── Prediction ────────────────────────────────────────────────────────────

export type PerFeatureContribution = {
  feature: FeatureName;
  raw_value: number;
  standardized_value: number;
  weight: number;
  contribution_to_log_odds: number;
};

export type JointPairPrediction = {
  features: FeatureVector;
  features_standardized: FeatureVector;
  log_odds: number;
  probability_positive: number;
  classification: "positive" | "negative" | "uncertain";
  per_feature_contribution: PerFeatureContribution[];
  intercept: number;
};

/**
 * Score a feature vector against a trained model.
 *  - probability_positive ≥ 0.7  → "positive"
 *  - probability_positive ≤ 0.3  → "negative"
 *  - otherwise                   → "uncertain"
 */
export function scoreWithModel(
  features: FeatureVector,
  model: JointPairModel,
): JointPairPrediction {
  const std = standardize(features, model.feature_means, model.feature_stds);
  let logOdds = model.intercept;
  const contributions: PerFeatureContribution[] = [];
  for (const f of FEATURE_ORDER) {
    const w = model.weights[f];
    const sv = std[f];
    const c = w * sv;
    logOdds += c;
    contributions.push({
      feature: f,
      raw_value: +features[f].toFixed(6),
      standardized_value: +sv.toFixed(6),
      weight: +w.toFixed(6),
      contribution_to_log_odds: +c.toFixed(6),
    });
  }
  const p = sigmoid(logOdds);
  let classification: "positive" | "negative" | "uncertain" = "uncertain";
  if (p >= 0.7) classification = "positive";
  else if (p <= 0.3) classification = "negative";

  return {
    features,
    features_standardized: std,
    log_odds: +logOdds.toFixed(6),
    probability_positive: +p.toFixed(6),
    classification,
    per_feature_contribution: contributions,
    intercept: model.intercept,
  };
}
