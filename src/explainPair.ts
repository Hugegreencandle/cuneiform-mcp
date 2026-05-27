// v0.61.0 — explain_pair_score: full provenance trace for any pairwise verdict.
//
// Single tool that takes (tablet_a, tablet_b) and returns the per-axis raw
// signals, the Bayesian-fusion per-feature decomposition, AND the calibration
// history that gated each threshold. Closes the "WHY did the model say X?"
// loop that nothing in the existing 101 tools answers directly.
//
// Reuses computeJointPairScore (v0.29.0) and compareTabletPair (v0.18.8); adds
// the calibration-history join from src/calibrationHistory.ts. No new model,
// no new index — pure surfacing of what's already there with the calibration
// provenance attached.
//
// Methods paper §3.x (post-JOHD: documented in T1-A upgrade plan).

import { compareTabletPair, type ComparePairResult, type AxisScore } from "./comparePair.js";
import { computeJointPairScore, type ComputeJointPairScoreResult } from "./computeJointPairScore.js";
import { FEATURE_ORDER, type FeatureName } from "./jointPairScore.js";
import {
  CALIBRATION_REGISTRY,
  MODEL_CALIBRATION_HISTORY,
  type AxisCalibration,
  type ModelCalibrationMilestone,
} from "./calibrationHistory.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type AxisExplanation = {
  axis: FeatureName;
  measures: string;
  source: string;
  /**
   * Status of the raw signal in the underlying axis index. 'ok' = pair found
   * in the axis top-K. 'below_threshold' = pair below top-K but axis is
   * indexed. 'missing' = at least one tablet not in the axis index.
   */
  status: "ok" | "below_threshold" | "missing";
  /** Direction the pair was found in (a→b or b→a) when status='ok'. */
  direction: "a_to_b" | "b_to_a" | null;
  /**
   * Raw signals from the source tool (compareTabletPair). Shape varies per
   * axis: fuzzy carries fuzzy_jaccard, exact_jaccard, longest_contiguous_run,
   * exact_intersect, etc.; scribal carries signature_cosine, signature_jaccard,
   * signature_overlap_count; thematic carries thematic_cosine.
   */
  raw_signals: Record<string, number>;
  /** Threshold note from the underlying axis when status='below_threshold'. */
  threshold_note: string | null;
  /** Feature value as consumed by the joint-pair model (may be 0 if missing). */
  feature_value: number;
  /** Standardized value (z-score under training-set mean/std). */
  standardized_value: number;
  /** Model weight for this axis. */
  weight: number;
  /** Additive contribution to log_odds = standardized × weight. */
  contribution_to_log_odds: number;
  /**
   * Sign of the contribution: 'positive' = pushes toward positive class,
   * 'negative' = pushes toward negative, 'neutral' = ≈0 contribution.
   */
  contribution_direction: "positive" | "negative" | "neutral";
  /** Full calibration history for this axis (all milestones, oldest first). */
  calibration_history: AxisCalibration;
};

export type ExplainPairResult = {
  tablet_a: string;
  tablet_b: string;
  /** Headline verdict from the joint-pair model. */
  pair_score: {
    probability_positive: number;
    log_odds: number;
    intercept: number;
    classification: "positive" | "negative" | "uncertain";
  };
  /** Per-axis breakdown with raw signals + decomposition + calibration. */
  per_axis_explanation: AxisExplanation[];
  /**
   * Cross-axis classification verdict from compareTabletPair (independent of
   * the logistic-regression model — pattern-matched against the methods
   * paper §3.4 decision tree).
   */
  verdict: {
    primary_relationship: string;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
  /** Logistic-regression model provenance. */
  model_metadata: {
    version: string;
    build_timestamp: string;
    trained_on_n_positives: number;
    trained_on_n_negatives: number;
    training_accuracy: number;
    warning: string;
  };
  /** Per-milestone history of the joint-pair model + calibration boundary. */
  model_calibration_history: ModelCalibrationMilestone[];
  /** Top 2-3 axes ranked by absolute contribution, narrated. */
  decision_summary: string[];
  warnings: string[];
};

export type ExplainPairOptions = {
  tabletA: string;
  tabletB: string;
};

// ─── Implementation ────────────────────────────────────────────────────────

export function explainPairScore(opts: ExplainPairOptions): ExplainPairResult {
  const a = opts.tabletA.trim();
  const b = opts.tabletB.trim();

  // 1. Cross-axis pair comparison — gives raw signals + verdict.
  const pair: ComparePairResult = compareTabletPair({ tabletA: a, tabletB: b });

  // 2. Joint-pair model — gives standardized features + per-feature contributions.
  const score: ComputeJointPairScoreResult = computeJointPairScore({ tabletA: a, tabletB: b });

  // 3. Build per-axis explanations.
  const perAxis: AxisExplanation[] = FEATURE_ORDER.map((axis) =>
    buildAxisExplanation(axis, pair, score),
  );

  // 4. Decision summary — top contributors by |contribution_to_log_odds|.
  const summary = narrateDecision(perAxis, score);

  const warnings = mergeWarnings(pair.warnings, score.warnings);

  return {
    tablet_a: a,
    tablet_b: b,
    pair_score: {
      probability_positive: score.probability_positive,
      log_odds: score.log_odds,
      intercept: score.model_metadata.intercept,
      classification: score.classification,
    },
    per_axis_explanation: perAxis,
    verdict: {
      primary_relationship: pair.verdict.primary_relationship,
      confidence: pair.verdict.confidence,
      evidence: pair.verdict.evidence,
    },
    model_metadata: {
      version: score.model_metadata.version,
      build_timestamp: score.model_metadata.build_timestamp,
      trained_on_n_positives: score.model_metadata.trained_on_n_positives,
      trained_on_n_negatives: score.model_metadata.trained_on_n_negatives,
      training_accuracy: score.model_metadata.training_accuracy,
      warning: score.model_metadata.warning,
    },
    model_calibration_history: MODEL_CALIBRATION_HISTORY,
    decision_summary: summary,
    warnings,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function buildAxisExplanation(
  axis: FeatureName,
  pair: ComparePairResult,
  score: ComputeJointPairScoreResult,
): AxisExplanation {
  const contrib = score.per_feature_contribution.find((c) => c.feature === axis);
  const rawValue = contrib?.raw_value ?? 0;
  const stdValue = contrib?.standardized_value ?? 0;
  const weight = contrib?.weight ?? 0;
  const contribLogOdds = contrib?.contribution_to_log_odds ?? 0;

  const { rawSignals, status, direction, thresholdNote } = sourceRawSignalsFor(axis, pair);

  return {
    axis,
    measures: CALIBRATION_REGISTRY[axis].measures,
    source: CALIBRATION_REGISTRY[axis].source,
    status,
    direction,
    raw_signals: rawSignals,
    threshold_note: thresholdNote,
    feature_value: rawValue,
    standardized_value: stdValue,
    weight,
    contribution_to_log_odds: contribLogOdds,
    contribution_direction:
      Math.abs(contribLogOdds) < 1e-6 ? "neutral" : contribLogOdds > 0 ? "positive" : "negative",
    calibration_history: CALIBRATION_REGISTRY[axis],
  };
}

type RawSignalSource = {
  rawSignals: Record<string, number>;
  status: "ok" | "below_threshold" | "missing";
  direction: "a_to_b" | "b_to_a" | null;
  thresholdNote: string | null;
};

function sourceRawSignalsFor(axis: FeatureName, pair: ComparePairResult): RawSignalSource {
  // Project compareTabletPair axes onto the model's 6-feature vocabulary.
  // For lex/fuzzy/thematic/scribal the mapping is direct; substitution_lift_z
  // and composition_assignment_match are not part of compareTabletPair and
  // surface as empty raw_signals — the feature_value/contribution still come
  // from the joint-pair model.
  if (axis === "lex_jaccard") return readAxis(pair.axes.lexical);
  if (axis === "fuzzy_jaccard") return readAxis(pair.axes.fuzzy);
  if (axis === "thematic_cosine") return readAxis(pair.axes.thematic);
  if (axis === "scribal_cosine") return readAxis(pair.axes.scribal);
  // substitution_lift_z and composition_assignment_match: signals are
  // produced inside the joint-pair model's feature extractor (sign2vec lift
  // computation + composition-assignments cache), not surfaced separately
  // through compareTabletPair. Report status='ok' if the model got a value.
  return {
    rawSignals: {},
    status: "ok",
    direction: null,
    thresholdNote: null,
  };
}

function readAxis(axis: AxisScore): RawSignalSource {
  if (axis.status === "found") {
    return {
      rawSignals: axis.values,
      status: "ok",
      direction: axis.direction,
      thresholdNote: null,
    };
  }
  if (axis.status === "below_threshold") {
    return {
      rawSignals: {},
      status: "below_threshold",
      direction: null,
      thresholdNote: axis.threshold_note,
    };
  }
  // tablet_not_in_index
  return {
    rawSignals: {},
    status: "missing",
    direction: null,
    thresholdNote: `Tablet not in axis index: ${axis.missing_tablets.join(", ")}`,
  };
}

function narrateDecision(
  perAxis: AxisExplanation[],
  score: ComputeJointPairScoreResult,
): string[] {
  const ranked = [...perAxis].sort(
    (x, y) => Math.abs(y.contribution_to_log_odds) - Math.abs(x.contribution_to_log_odds),
  );
  const lines: string[] = [];

  // Headline.
  const cls = score.classification;
  const p = score.probability_positive;
  lines.push(
    `Verdict: ${cls} (P=${p.toFixed(3)}). Log-odds = intercept ${score.model_metadata.intercept.toFixed(3)} + sum of per-axis contributions = ${score.log_odds.toFixed(3)}.`,
  );

  // Top 3 contributors.
  const top = ranked.slice(0, 3);
  for (const r of top) {
    if (Math.abs(r.contribution_to_log_odds) < 1e-6) continue;
    const dirWord = r.contribution_direction === "positive" ? "toward positive" : "toward negative";
    const latest = r.calibration_history.milestones[r.calibration_history.milestones.length - 1];
    lines.push(
      `${r.axis}: raw=${r.feature_value.toFixed(4)} · z=${r.standardized_value.toFixed(3)} · weight=${r.weight.toFixed(3)} → ${r.contribution_to_log_odds >= 0 ? "+" : ""}${r.contribution_to_log_odds.toFixed(3)} log-odds ${dirWord} (current calibration: ${latest.version}, ${latest.source_doc}).`,
    );
  }

  // Axes that defaulted to 0 because of missing/below-threshold.
  const skipped = perAxis.filter((r) => r.status !== "ok");
  if (skipped.length > 0) {
    lines.push(
      `Defaulted to 0: ${skipped.map((s) => `${s.axis} (${s.status})`).join(", ")} — score is approximate on these axes.`,
    );
  }

  return lines;
}

function mergeWarnings(...lists: string[][]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const l of lists) {
    for (const w of l) {
      if (!seen.has(w)) {
        seen.add(w);
        out.push(w);
      }
    }
  }
  return out;
}
