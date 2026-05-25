// v0.40.0 — confidence_calibration.
//
// Panel-review §3.24 / Lindqvist: when a tool says p=0.989, is the true
// accuracy at that confidence bin actually ~99%? This tool measures it.
//
// Workflow: caller supplies a labeled set of (predicted_probability,
// ground_truth_label_match) pairs — typically harvested from
// damaged_passage_composition_probability or identify_composition runs
// on a known-composition tablet set. The tool bins the predictions by
// probability (decile bins by default), reports per-bin true-accuracy
// vs predicted-probability, and computes the Brier score + Expected
// Calibration Error (ECE).
//
// A well-calibrated classifier has bin-accuracy ≈ bin-mean-probability;
// systematically lower accuracy than probability = overconfident
// (the panel's flagged failure mode); higher = underconfident.

export type CalibrationSample = {
  predicted_probability: number;
  correct: boolean;
};

export type CalibrationBin = {
  bin_idx: number;
  bin_lo: number;
  bin_hi: number;
  n_samples: number;
  mean_predicted_probability: number;
  observed_accuracy: number;
  gap: number;
};

export type ConfidenceCalibrationResult = {
  n_samples: number;
  n_bins: number;
  bins: CalibrationBin[];
  brier_score: number;
  expected_calibration_error: number;
  max_calibration_error: number;
  overall_accuracy: number;
  overall_mean_probability: number;
  calibration_verdict: "well_calibrated" | "overconfident" | "underconfident" | "insufficient_data";
  warnings: string[];
};

export type ConfidenceCalibrationOptions = {
  samples: CalibrationSample[];
  nBins?: number;
};

export function computeConfidenceCalibration(
  opts: ConfidenceCalibrationOptions,
): ConfidenceCalibrationResult {
  const warnings: string[] = [];
  const samples = opts.samples ?? [];
  const nBins = Math.max(2, Math.min(100, opts.nBins ?? 10));

  if (samples.length === 0) {
    return {
      n_samples: 0,
      n_bins: nBins,
      bins: [],
      brier_score: 0,
      expected_calibration_error: 0,
      max_calibration_error: 0,
      overall_accuracy: 0,
      overall_mean_probability: 0,
      calibration_verdict: "insufficient_data",
      warnings: ["no samples provided"],
    };
  }
  if (samples.length < nBins * 3) {
    warnings.push(`only ${samples.length} samples for ${nBins} bins — many bins will be empty or have high variance. Recommend ≥${nBins * 10} samples for reliable calibration.`);
  }

  // Validate probabilities.
  for (const s of samples) {
    if (s.predicted_probability < 0 || s.predicted_probability > 1) {
      warnings.push(`out-of-range probability ${s.predicted_probability} — clamping`);
    }
  }

  const bins: CalibrationBin[] = [];
  for (let i = 0; i < nBins; i++) {
    bins.push({
      bin_idx: i,
      bin_lo: i / nBins,
      bin_hi: (i + 1) / nBins,
      n_samples: 0,
      mean_predicted_probability: 0,
      observed_accuracy: 0,
      gap: 0,
    });
  }
  // Bucket samples.
  const binProbSum = new Array(nBins).fill(0);
  const binCorrectCount = new Array(nBins).fill(0);
  let totalCorrect = 0;
  let totalProbSum = 0;
  let brierSum = 0;

  for (const s of samples) {
    const p = Math.max(0, Math.min(1, s.predicted_probability));
    // Bin index — last bin includes p===1.0
    let idx = Math.floor(p * nBins);
    if (idx >= nBins) idx = nBins - 1;
    bins[idx].n_samples++;
    binProbSum[idx] += p;
    if (s.correct) {
      binCorrectCount[idx]++;
      totalCorrect++;
    }
    totalProbSum += p;
    brierSum += Math.pow(p - (s.correct ? 1 : 0), 2);
  }

  let ece = 0;
  let mce = 0;
  for (let i = 0; i < nBins; i++) {
    const b = bins[i];
    if (b.n_samples === 0) continue;
    b.mean_predicted_probability = binProbSum[i] / b.n_samples;
    b.observed_accuracy = binCorrectCount[i] / b.n_samples;
    b.gap = b.observed_accuracy - b.mean_predicted_probability;
    const absGap = Math.abs(b.gap);
    ece += (b.n_samples / samples.length) * absGap;
    if (absGap > mce) mce = absGap;
  }

  const overallAcc = totalCorrect / samples.length;
  const overallProb = totalProbSum / samples.length;
  const brier = brierSum / samples.length;
  const calibDiff = overallAcc - overallProb;

  let verdict: ConfidenceCalibrationResult["calibration_verdict"];
  if (samples.length < 20) verdict = "insufficient_data";
  else if (ece <= 0.05) verdict = "well_calibrated";
  else if (calibDiff < -0.05) verdict = "overconfident";
  else if (calibDiff > 0.05) verdict = "underconfident";
  else verdict = "well_calibrated";

  return {
    n_samples: samples.length,
    n_bins: nBins,
    bins,
    brier_score: brier,
    expected_calibration_error: ece,
    max_calibration_error: mce,
    overall_accuracy: overallAcc,
    overall_mean_probability: overallProb,
    calibration_verdict: verdict,
    warnings,
  };
}
