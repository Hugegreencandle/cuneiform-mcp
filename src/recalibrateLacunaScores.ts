// v0.50.0 — recalibrate_lacuna_scores.
//
// Panel-review §3.31 / Lindqvist + the v0.25 calibration finding:
// restore_lacuna_semantic.joint_score is overconfident by ~13× ECE
// threshold (16% top-1 accuracy at mean predicted 80.9%, ECE=0.6490).
// This tool fits a Platt-scaling logistic regression on the labeled
// (predicted_probability, correct) pairs from
// ~/.cache/cuneiform-mcp/lacuna-bleu-calibration-samples.json and
// reports the calibrated ECE alongside the original.
//
// Platt scaling: fit p_calibrated = sigmoid(a * logit(p_raw) + b) via
// gradient descent on negative log-likelihood. Output: {a, b} +
// recalibrated samples + ECE before/after + recommended action.
//
// Note: this tool MEASURES calibration; it does NOT silently rewrite
// joint_score values upstream. Consumers can apply the fitted (a, b) to
// any future joint_score via the exported applyPlattCalibration helper.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import {
  computeConfidenceCalibration,
  type CalibrationSample,
} from "./confidenceCalibration.js";

const SAMPLES_FILE = "lacuna-bleu-calibration-samples.json";

export type PlattParams = { a: number; b: number };

export type RecalibrateLacunaScoresResult = {
  source_file: string;
  n_samples: number;
  before: {
    expected_calibration_error: number;
    max_calibration_error: number;
    brier_score: number;
    mean_predicted: number;
    observed_accuracy: number;
    verdict: string;
  };
  after: {
    platt_a: number;
    platt_b: number;
    expected_calibration_error: number;
    max_calibration_error: number;
    brier_score: number;
    mean_predicted: number;
    observed_accuracy: number;
    verdict: string;
  };
  improvement: {
    ece_reduction: number;
    ece_reduction_factor: number;
  };
  recommendation: string;
  warnings: string[];
};

export type RecalibrateLacunaScoresOptions = {
  method?: "platt";
  nBins?: number;
};

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function logit(p: number): number {
  // Clamp to avoid log(0)
  const clamped = Math.max(1e-7, Math.min(1 - 1e-7, p));
  return Math.log(clamped / (1 - clamped));
}

function sigmoid(x: number): number {
  if (x >= 0) {
    const e = Math.exp(-x);
    return 1 / (1 + e);
  }
  const e = Math.exp(x);
  return e / (1 + e);
}

export function applyPlattCalibration(rawProb: number, params: PlattParams): number {
  return sigmoid(params.a * logit(rawProb) + params.b);
}

// Fit Platt scaling via gradient descent on negative log-likelihood.
// Variables a (scale) and b (bias) fit y = sigmoid(a * logit(p) + b).
function fitPlatt(samples: CalibrationSample[]): PlattParams {
  let a = 1.0;
  let b = 0.0;
  const lr = 0.05;
  const iterations = 500;
  const n = samples.length;

  // Pre-compute logit-x for each sample
  const xs = samples.map((s) => logit(s.predicted_probability));
  const ys = samples.map((s) => (s.correct ? 1 : 0));

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

export function recalibrateLacunaScores(
  opts: RecalibrateLacunaScoresOptions = {},
): RecalibrateLacunaScoresResult {
  const warnings: string[] = [];
  const nBins = opts.nBins ?? 10;
  const samplesPath = join(cacheDir(), SAMPLES_FILE);

  if (!existsSync(samplesPath)) {
    warnings.push(`samples file not found: ${samplesPath} — run scripts/benchmark-lacuna-bleu.mjs first`);
    return {
      source_file: samplesPath,
      n_samples: 0,
      before: { expected_calibration_error: 0, max_calibration_error: 0, brier_score: 0, mean_predicted: 0, observed_accuracy: 0, verdict: "insufficient_data" },
      after: { platt_a: 1, platt_b: 0, expected_calibration_error: 0, max_calibration_error: 0, brier_score: 0, mean_predicted: 0, observed_accuracy: 0, verdict: "insufficient_data" },
      improvement: { ece_reduction: 0, ece_reduction_factor: 1 },
      recommendation: "Run scripts/benchmark-lacuna-bleu.mjs with BLEU_BENCHMARK_SAMPLE_SIZE=500 to populate the calibration samples, then re-run this tool.",
      warnings,
    };
  }

  let samplesData;
  try {
    samplesData = JSON.parse(readFileSync(samplesPath, "utf-8"));
  } catch (e) {
    warnings.push(`samples file parse failed: ${e instanceof Error ? e.message : String(e)}`);
    return {
      source_file: samplesPath,
      n_samples: 0,
      before: { expected_calibration_error: 0, max_calibration_error: 0, brier_score: 0, mean_predicted: 0, observed_accuracy: 0, verdict: "insufficient_data" },
      after: { platt_a: 1, platt_b: 0, expected_calibration_error: 0, max_calibration_error: 0, brier_score: 0, mean_predicted: 0, observed_accuracy: 0, verdict: "insufficient_data" },
      improvement: { ece_reduction: 0, ece_reduction_factor: 1 },
      recommendation: "Parse failure — inspect the samples JSON.",
      warnings,
    };
  }

  const samples: CalibrationSample[] = samplesData.calibration_samples ?? [];
  if (samples.length < 20) {
    warnings.push(`only ${samples.length} samples — Platt scaling needs ≥100 for reliability, ≥500 recommended`);
  }

  // Before calibration
  const beforeResult = computeConfidenceCalibration({ samples, nBins });

  // Fit Platt parameters
  const params = fitPlatt(samples);

  // Apply Platt to each sample
  const calibratedSamples: CalibrationSample[] = samples.map((s) => ({
    predicted_probability: applyPlattCalibration(s.predicted_probability, params),
    correct: s.correct,
  }));
  const afterResult = computeConfidenceCalibration({ samples: calibratedSamples, nBins });

  const eceReduction = beforeResult.expected_calibration_error - afterResult.expected_calibration_error;
  const eceFactor =
    afterResult.expected_calibration_error > 0
      ? beforeResult.expected_calibration_error / afterResult.expected_calibration_error
      : Infinity;

  let recommendation: string;
  if (samples.length < 100) {
    recommendation = `Preliminary calibration on n=${samples.length} samples. Re-run benchmark-lacuna-bleu with BLEU_BENCHMARK_SAMPLE_SIZE=500 for reliable Platt parameters before deploying to consumers.`;
  } else if (afterResult.expected_calibration_error <= 0.05) {
    recommendation = `Platt-calibrated scores are well-calibrated (ECE=${afterResult.expected_calibration_error.toFixed(4)} ≤ 0.05). Consumers can apply applyPlattCalibration(raw_score, {a: ${params.a.toFixed(3)}, b: ${params.b.toFixed(3)}}) to recalibrate joint_score outputs.`;
  } else {
    recommendation = `Platt calibration reduced ECE from ${beforeResult.expected_calibration_error.toFixed(4)} → ${afterResult.expected_calibration_error.toFixed(4)} (${eceFactor.toFixed(1)}× improvement), but post-calibration ECE still exceeds 0.05. Consider isotonic regression instead.`;
  }

  return {
    source_file: samplesPath,
    n_samples: samples.length,
    before: {
      expected_calibration_error: beforeResult.expected_calibration_error,
      max_calibration_error: beforeResult.max_calibration_error,
      brier_score: beforeResult.brier_score,
      mean_predicted: beforeResult.overall_mean_probability,
      observed_accuracy: beforeResult.overall_accuracy,
      verdict: beforeResult.calibration_verdict,
    },
    after: {
      platt_a: params.a,
      platt_b: params.b,
      expected_calibration_error: afterResult.expected_calibration_error,
      max_calibration_error: afterResult.max_calibration_error,
      brier_score: afterResult.brier_score,
      mean_predicted: afterResult.overall_mean_probability,
      observed_accuracy: afterResult.overall_accuracy,
      verdict: afterResult.calibration_verdict,
    },
    improvement: {
      ece_reduction: eceReduction,
      ece_reduction_factor: eceFactor,
    },
    recommendation,
    warnings,
  };
}
