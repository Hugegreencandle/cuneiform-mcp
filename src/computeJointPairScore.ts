// v0.29.0 — compute_joint_pair_score: cross-axis Bayesian fusion tool.
//
// Aggregates the 5 per-axis discovery signals into one calibrated probability
// using the logistic-regression model trained by
// scripts/train-joint-pair-model.mjs. Surfaces the per-feature
// contribution_to_log_odds so callers can see WHY a pair scored as it did.
//
// Bootstrap quality, NOT production. Trained on n≈12 positives + n≈30-50
// negatives from the methods paper. Use as a research signal, not a verdict.
// v1.0 will need ≥100 labeled pairs.

import {
  loadJointPairModel,
  getJointPairModelLoadError,
  extractPairFeatures,
  scoreWithModel,
  FEATURE_ORDER,
  type FeatureName,
  type JointPairModel,
  type PerFeatureContribution,
  type FeatureVector,
} from "./jointPairScore.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ComputeJointPairScoreOptions = {
  tabletA: string;
  tabletB: string;
};

export type ComputeJointPairScoreResult = {
  tablet_a: string;
  tablet_b: string;
  features: FeatureVector;
  features_standardized: FeatureVector;
  per_axis_status: Record<FeatureName, "ok" | "below_threshold" | "missing">;
  probability_positive: number;
  log_odds: number;
  classification: "positive" | "negative" | "uncertain";
  per_feature_contribution: PerFeatureContribution[];
  model_metadata: {
    version: string;
    build_timestamp: string;
    trained_on_n_positives: number;
    trained_on_n_negatives: number;
    training_accuracy: number;
    intercept: number;
    warning: string;
  };
  warnings: string[];
};

// ─── Public API ────────────────────────────────────────────────────────────

export function computeJointPairScore(
  opts: ComputeJointPairScoreOptions,
): ComputeJointPairScoreResult {
  const warnings: string[] = [];
  const a = opts.tabletA.trim();
  const b = opts.tabletB.trim();
  if (a === b) {
    warnings.push("tabletA and tabletB are identical — score is meaningless.");
  }

  const model: JointPairModel | null = loadJointPairModel();
  if (!model) {
    const err = getJointPairModelLoadError() ?? "joint-pair model unavailable";
    warnings.push(err);
    return emptyResult(a, b, warnings);
  }

  warnings.push(model.bootstrap_warning);

  // Extract the 5-axis feature vector
  const ext = extractPairFeatures(a, b);
  for (const w of ext.warnings) warnings.push(w);

  // Flag missing axes
  const missing = FEATURE_ORDER.filter((f) => ext.per_axis_status[f] === "missing");
  if (missing.length > 0) {
    warnings.push(
      `Axes with no value (defaulted to 0): ${missing.join(", ")}. Score is approximate.`,
    );
  }

  const pred = scoreWithModel(ext.features, model);

  return {
    tablet_a: a,
    tablet_b: b,
    features: pred.features,
    features_standardized: pred.features_standardized,
    per_axis_status: ext.per_axis_status,
    probability_positive: pred.probability_positive,
    log_odds: pred.log_odds,
    classification: pred.classification,
    per_feature_contribution: pred.per_feature_contribution,
    model_metadata: {
      version: model.version,
      build_timestamp: model.build_timestamp,
      trained_on_n_positives: model.trained_on_n_positives,
      trained_on_n_negatives: model.trained_on_n_negatives,
      training_accuracy: model.training_accuracy,
      intercept: model.intercept,
      warning: model.bootstrap_warning,
    },
    warnings,
  };
}

function emptyResult(
  a: string,
  b: string,
  warnings: string[],
): ComputeJointPairScoreResult {
  const zeroVec: FeatureVector = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
  };
  const status: Record<FeatureName, "ok" | "below_threshold" | "missing"> = {
    lex_jaccard: "missing",
    fuzzy_jaccard: "missing",
    thematic_cosine: "missing",
    scribal_cosine: "missing",
    substitution_lift_z: "missing",
  };
  return {
    tablet_a: a,
    tablet_b: b,
    features: zeroVec,
    features_standardized: zeroVec,
    per_axis_status: status,
    probability_positive: 0,
    log_odds: 0,
    classification: "uncertain",
    per_feature_contribution: FEATURE_ORDER.map((f) => ({
      feature: f,
      raw_value: 0,
      standardized_value: 0,
      weight: 0,
      contribution_to_log_odds: 0,
    })),
    model_metadata: {
      version: "unknown",
      build_timestamp: "",
      trained_on_n_positives: 0,
      trained_on_n_negatives: 0,
      training_accuracy: 0,
      intercept: 0,
      warning: "Model not loaded — see warnings[] for details.",
    },
    warnings,
  };
}
