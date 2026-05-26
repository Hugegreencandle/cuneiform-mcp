import { describe, it, expect } from "vitest";
import {
  computeConfidenceCalibration,
  type CalibrationSample,
} from "../src/confidenceCalibration.js";

describe("computeConfidenceCalibration", () => {
  it("returns ECE = 0 on perfectly-calibrated synthetic data", () => {
    // All samples in a single bin where predicted == observed accuracy.
    // 10 samples all at p=0.5, 5 correct + 5 incorrect → bin acc = 0.5.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 5; i++) samples.push({ predicted_probability: 0.5, correct: true });
    for (let i = 0; i < 5; i++) samples.push({ predicted_probability: 0.5, correct: false });
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.expected_calibration_error).toBe(0);
  });

  it("reports large ECE on anti-calibrated input", () => {
    // All samples claim p=0.95 but none are correct → gap ≈ 0.95.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 10; i++) samples.push({ predicted_probability: 0.95, correct: false });
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.expected_calibration_error).toBeGreaterThan(0.9);
    expect(r.max_calibration_error).toBeGreaterThan(0.9);
  });

  it("respects custom n_bins parameter", () => {
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 10; i++) samples.push({ predicted_probability: 0.5, correct: true });
    const r5 = computeConfidenceCalibration({ samples, nBins: 5 });
    const r20 = computeConfidenceCalibration({ samples, nBins: 20 });
    expect(r5.n_bins).toBe(5);
    expect(r5.bins).toHaveLength(5);
    expect(r20.n_bins).toBe(20);
    expect(r20.bins).toHaveLength(20);
  });

  it("returns insufficient_data verdict + empty bins on empty input", () => {
    const r = computeConfidenceCalibration({ samples: [], nBins: 10 });
    expect(r.n_samples).toBe(0);
    expect(r.bins).toEqual([]);
    expect(r.calibration_verdict).toBe("insufficient_data");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("handles bin boundary edge: p=0.1 lands in bin index 1, not 0", () => {
    // nBins=10: bin 0 covers [0, 0.1), bin 1 covers [0.1, 0.2).
    // Math.floor(0.1 * 10) = 1.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 5; i++) samples.push({ predicted_probability: 0.1, correct: true });
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.bins[0].n_samples).toBe(0);
    expect(r.bins[1].n_samples).toBe(5);
  });

  it("places p=1.0 in the last bin (not out-of-range)", () => {
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 5; i++) samples.push({ predicted_probability: 1.0, correct: true });
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.bins[9].n_samples).toBe(5);
  });

  it("returns well_calibrated verdict when ECE ≤ 0.05 and n ≥ 20", () => {
    // 20 samples at p=0.5 with 10/20 correct → 0 ECE.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 10; i++) samples.push({ predicted_probability: 0.5, correct: true });
    for (let i = 0; i < 10; i++) samples.push({ predicted_probability: 0.5, correct: false });
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.calibration_verdict).toBe("well_calibrated");
  });

  it("returns overconfident verdict on systematically overconfident input", () => {
    // 30 samples all at p=0.9 but only 30% correct.
    const samples: CalibrationSample[] = [];
    for (let i = 0; i < 30; i++) {
      samples.push({ predicted_probability: 0.9, correct: i < 9 });
    }
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.calibration_verdict).toBe("overconfident");
  });

  it("clamps out-of-range probability and warns", () => {
    const samples: CalibrationSample[] = [
      { predicted_probability: 1.5, correct: true },
      { predicted_probability: -0.1, correct: false },
    ];
    const r = computeConfidenceCalibration({ samples, nBins: 10 });
    expect(r.warnings.some((w) => /out-of-range/.test(w))).toBe(true);
  });
});
