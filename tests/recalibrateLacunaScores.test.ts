import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPlattCalibration,
  recalibrateLacunaScores,
  type PlattParams,
} from "../src/recalibrateLacunaScores.js";
import { computeConfidenceCalibration, type CalibrationSample } from "../src/confidenceCalibration.js";

// Note: the source file does NOT export `logit`, `sigmoid`, or `fitPlatt`.
// We exercise the math through `applyPlattCalibration` (the only exported
// helper) and through the end-to-end `recalibrateLacunaScores` orchestrator
// against synthetic calibration-samples files in a temp cache dir.

function withTempCache(fn: (cacheDir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "cuneiform-mcp-test-"));
  const prev = process.env.CUNEIFORM_MCP_CACHE_DIR;
  process.env.CUNEIFORM_MCP_CACHE_DIR = dir;
  try {
    fn(dir);
  } finally {
    if (prev === undefined) delete process.env.CUNEIFORM_MCP_CACHE_DIR;
    else process.env.CUNEIFORM_MCP_CACHE_DIR = prev;
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeSamples(cacheDir: string, samples: CalibrationSample[]): void {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    join(cacheDir, "lacuna-bleu-calibration-samples.json"),
    JSON.stringify({ calibration_samples: samples }),
  );
}

describe("applyPlattCalibration", () => {
  it("returns ~p_raw at a=1, b=0 (identity through logit+sigmoid round-trip)", () => {
    const params: PlattParams = { a: 1, b: 0 };
    for (const p of [0.1, 0.25, 0.5, 0.75, 0.9]) {
      const out = applyPlattCalibration(p, params);
      expect(out).toBeCloseTo(p, 6);
    }
  });

  it("clamps inputs at exactly 0 and 1 without throwing", () => {
    const params: PlattParams = { a: 1, b: 0 };
    const out0 = applyPlattCalibration(0, params);
    const out1 = applyPlattCalibration(1, params);
    expect(Number.isFinite(out0)).toBe(true);
    expect(Number.isFinite(out1)).toBe(true);
    // 0 and 1 are clamped to (1e-7, 1 - 1e-7).
    expect(out0).toBeGreaterThan(0);
    expect(out0).toBeLessThan(0.5);
    expect(out1).toBeLessThan(1);
    expect(out1).toBeGreaterThan(0.5);
  });

  it("returns values in [0, 1] over the full input range", () => {
    const params: PlattParams = { a: -2.5, b: 0.3 };
    for (const p of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
      const out = applyPlattCalibration(p, params);
      expect(out).toBeGreaterThanOrEqual(0);
      expect(out).toBeLessThanOrEqual(1);
    }
  });

  it("is monotonic in p_raw when a > 0", () => {
    const params: PlattParams = { a: 1.5, b: -0.2 };
    let prev = -Infinity;
    for (const p of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const out = applyPlattCalibration(p, params);
      expect(out).toBeGreaterThan(prev);
      prev = out;
    }
  });

  it("inverts monotonicity when a < 0", () => {
    const params: PlattParams = { a: -1.5, b: 0 };
    let prev = Infinity;
    for (const p of [0.05, 0.2, 0.4, 0.6, 0.8, 0.95]) {
      const out = applyPlattCalibration(p, params);
      expect(out).toBeLessThan(prev);
      prev = out;
    }
  });
});

describe("recalibrateLacunaScores (orchestrator)", () => {
  it("returns insufficient_data when samples file is missing", () => {
    withTempCache(() => {
      const r = recalibrateLacunaScores();
      expect(r.n_samples).toBe(0);
      expect(r.before.verdict).toBe("insufficient_data");
      expect(r.after.verdict).toBe("insufficient_data");
      expect(r.warnings.some((w) => /samples file not found/.test(w))).toBe(true);
    });
  });

  it("recovers from parse failure with a parse warning", () => {
    withTempCache((dir) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "lacuna-bleu-calibration-samples.json"), "{not json");
      const r = recalibrateLacunaScores();
      expect(r.n_samples).toBe(0);
      expect(r.warnings.some((w) => /parse failed/.test(w))).toBe(true);
    });
  });

  it("warns when n_samples < 20", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 10; i++) {
        samples.push({ predicted_probability: 0.5, correct: i % 2 === 0 });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      expect(r.n_samples).toBe(10);
      expect(r.warnings.some((w) => /≥100|≥500|samples/i.test(w))).toBe(true);
    });
  });

  it("ECE-after ≤ ECE-before on a shifted-sigmoid synthetic 200-pair set", () => {
    withTempCache((dir) => {
      // Build 200 samples drawn from a "true" probability `q = sigmoid(2*x)`
      // where x ranges over [-2, 2]. The model's reported probability is a
      // shifted, scaled version: `p_raw = sigmoid(0.5 * x + 1.0)`. So the
      // raw scores are overconfident; Platt should recover (a≈4, b≈-2).
      const samples: CalibrationSample[] = [];
      let seed = 1;
      const rand = () => {
        // Mulberry32
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
      for (let i = 0; i < 200; i++) {
        const x = -2 + (4 * i) / 200;
        const qTrue = sigmoid(2 * x);
        const pRaw = sigmoid(0.5 * x + 1.0); // miscalibrated
        const correct = rand() < qTrue;
        samples.push({ predicted_probability: pRaw, correct });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores({ nBins: 10 });
      expect(r.n_samples).toBe(200);
      expect(r.after.expected_calibration_error).toBeLessThanOrEqual(
        r.before.expected_calibration_error + 1e-9,
      );
      // Improvement should be measurable.
      expect(r.improvement.ece_reduction).toBeGreaterThanOrEqual(0);
    });
  });

  it("handles all-correct (degenerate) samples without throwing", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 30; i++) {
        samples.push({ predicted_probability: 0.5 + (i / 200), correct: true });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      expect(r.n_samples).toBe(30);
      expect(Number.isFinite(r.before.expected_calibration_error)).toBe(true);
      expect(Number.isFinite(r.after.expected_calibration_error)).toBe(true);
    });
  });

  it("handles all-incorrect (degenerate) samples without throwing", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 30; i++) {
        samples.push({ predicted_probability: 0.5 + (i / 200), correct: false });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      expect(r.n_samples).toBe(30);
      expect(Number.isFinite(r.before.expected_calibration_error)).toBe(true);
      expect(Number.isFinite(r.after.expected_calibration_error)).toBe(true);
    });
  });

  it("computed Platt params can be reapplied to a raw score via applyPlattCalibration", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 100; i++) {
        // Overconfident: scores near 0.85 but only 50% accuracy.
        samples.push({ predicted_probability: 0.85, correct: i % 2 === 0 });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      const params: PlattParams = { a: r.after.platt_a, b: r.after.platt_b };
      const recal = applyPlattCalibration(0.85, params);
      expect(recal).toBeGreaterThanOrEqual(0);
      expect(recal).toBeLessThanOrEqual(1);
      // Recalibrated 0.85 should be pulled toward ~0.5 (observed accuracy).
      expect(Math.abs(recal - 0.5)).toBeLessThan(Math.abs(0.85 - 0.5));
    });
  });

  it("includes ece_reduction_factor in improvement report", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 50; i++) {
        samples.push({ predicted_probability: 0.9, correct: i % 3 === 0 });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      expect(r.improvement).toHaveProperty("ece_reduction");
      expect(r.improvement).toHaveProperty("ece_reduction_factor");
      expect(Number.isFinite(r.improvement.ece_reduction)).toBe(true);
    });
  });

  it("emits a recommendation string keyed to sample count + post-ECE", () => {
    withTempCache((dir) => {
      const samples: CalibrationSample[] = [];
      for (let i = 0; i < 30; i++) {
        samples.push({ predicted_probability: 0.5, correct: i % 2 === 0 });
      }
      writeSamples(dir, samples);
      const r = recalibrateLacunaScores();
      expect(typeof r.recommendation).toBe("string");
      expect(r.recommendation.length).toBeGreaterThan(10);
      // n=30 < 100 should trigger the "Preliminary" framing.
      expect(/Preliminary|preliminary/.test(r.recommendation)).toBe(true);
    });
  });
});
