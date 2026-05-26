import { describe, it, expect } from "vitest";
import {
  sigmoid,
  mean,
  stddev,
  standardize,
  trainJointPairModel,
  scoreWithModel,
  FEATURE_ORDER,
  type FeatureVector,
  type FeatureName,
  type TrainingExample,
} from "../src/jointPairScore.js";

// Helper: build a FeatureVector from partial input (missing axes → 0).
function fv(partial: Partial<FeatureVector>): FeatureVector {
  const out: FeatureVector = {
    lex_jaccard: 0,
    fuzzy_jaccard: 0,
    thematic_cosine: 0,
    scribal_cosine: 0,
    substitution_lift_z: 0,
    composition_assignment_match: 0,
  };
  return { ...out, ...partial };
}

describe("sigmoid", () => {
  it("evaluates to 0.5 at z = 0", () => {
    expect(sigmoid(0)).toBe(0.5);
  });

  it("saturates to ~1 at large positive z", () => {
    expect(sigmoid(20)).toBeGreaterThan(0.999);
    expect(sigmoid(20)).toBeLessThanOrEqual(1);
  });

  it("saturates to ~0 at large negative z", () => {
    expect(sigmoid(-20)).toBeLessThan(0.001);
    expect(sigmoid(-20)).toBeGreaterThanOrEqual(0);
  });

  it("returns finite values across extreme inputs (numerical stability)", () => {
    for (const z of [-1000, -100, -1, 0, 1, 100, 1000]) {
      const s = sigmoid(z);
      expect(Number.isFinite(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });
});

describe("mean", () => {
  it("returns 0 on empty input", () => {
    expect(mean([])).toBe(0);
  });

  it("computes arithmetic mean on simple arrays", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    expect(mean([0, 0, 0])).toBe(0);
    expect(mean([-1, 0, 1])).toBe(0);
  });
});

describe("stddev", () => {
  it("returns 0 on degenerate (single-element) input", () => {
    expect(stddev([])).toBe(0);
    expect(stddev([42])).toBe(0);
  });

  it("returns 0 on zero-variance input (all values identical)", () => {
    expect(stddev([7, 7, 7, 7])).toBe(0);
  });

  it("computes sample stddev on a known sequence", () => {
    // {2,4,4,4,5,5,7,9}: variance = 32/(8-1) = 32/7 ≈ 4.5714.
    // sample stddev = sqrt(32/7) ≈ 2.13809.
    expect(stddev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(Math.sqrt(32 / 7), 10);
  });
});

describe("standardize", () => {
  it("returns zeros when stddev is below 1e-9 (degenerate column)", () => {
    const means = Object.fromEntries(FEATURE_ORDER.map((f) => [f, 0.5])) as Record<FeatureName, number>;
    const stds = Object.fromEntries(FEATURE_ORDER.map((f) => [f, 0])) as Record<FeatureName, number>;
    const out = standardize(fv({ lex_jaccard: 0.9 }), means, stds);
    for (const f of FEATURE_ORDER) expect(out[f]).toBe(0);
  });

  it("z-standardizes correctly when mean/stddev are nonzero", () => {
    const means = Object.fromEntries(FEATURE_ORDER.map((f) => [f, 0.5])) as Record<FeatureName, number>;
    const stds = Object.fromEntries(FEATURE_ORDER.map((f) => [f, 0.1])) as Record<FeatureName, number>;
    const out = standardize(fv({ lex_jaccard: 0.6 }), means, stds);
    // (0.6 - 0.5) / 0.1 = 1.0
    expect(out.lex_jaccard).toBeCloseTo(1.0, 9);
    // missing-feature columns: (0 - 0.5) / 0.1 = -5.0
    expect(out.fuzzy_jaccard).toBeCloseTo(-5.0, 9);
  });
});

describe("FEATURE_ORDER", () => {
  it("locks the canonical 6-axis ordering (regression snapshot)", () => {
    // If this snapshot ever changes, downstream consumers + the cached
    // joint-pair-model.json must be re-trained in lockstep.
    expect(FEATURE_ORDER).toEqual([
      "lex_jaccard",
      "fuzzy_jaccard",
      "thematic_cosine",
      "scribal_cosine",
      "substitution_lift_z",
      "composition_assignment_match",
    ]);
  });
});

describe("trainJointPairModel", () => {
  it("throws on empty examples", () => {
    expect(() => trainJointPairModel([])).toThrow(/no examples/);
  });

  it("converges on linearly-separable 2D toy data (lex + fuzzy)", () => {
    // 10 examples: 5 positives where lex_jaccard high, fuzzy high; 5 negatives
    // where both are low. The other 4 features stay at 0 so the model has
    // zero-variance columns there (standardize returns 0).
    const examples: TrainingExample[] = [];
    for (let i = 0; i < 5; i++) {
      examples.push({
        tablet_a: `posA${i}`,
        tablet_b: `posB${i}`,
        label: 1,
        features: fv({ lex_jaccard: 0.8 + i * 0.01, fuzzy_jaccard: 0.85 + i * 0.005 }),
      });
    }
    for (let i = 0; i < 5; i++) {
      examples.push({
        tablet_a: `negA${i}`,
        tablet_b: `negB${i}`,
        label: 0,
        features: fv({ lex_jaccard: 0.05 + i * 0.005, fuzzy_jaccard: 0.1 + i * 0.005 }),
      });
    }
    const r = trainJointPairModel(examples, { iterations: 500, learningRate: 0.2 });
    expect(r.model.training_accuracy).toBeGreaterThanOrEqual(0.8);
    expect(r.loss_history.length).toBe(500);
    // Loss should decrease overall.
    expect(r.loss_history[r.loss_history.length - 1]).toBeLessThan(r.loss_history[0]);
  });

  it("scoreWithModel returns probability in [0,1] and matches per_example_predictions", () => {
    const examples: TrainingExample[] = [
      { tablet_a: "a1", tablet_b: "b1", label: 1, features: fv({ lex_jaccard: 0.9 }) },
      { tablet_a: "a2", tablet_b: "b2", label: 1, features: fv({ lex_jaccard: 0.85 }) },
      { tablet_a: "a3", tablet_b: "b3", label: 0, features: fv({ lex_jaccard: 0.1 }) },
      { tablet_a: "a4", tablet_b: "b4", label: 0, features: fv({ lex_jaccard: 0.15 }) },
    ];
    const r = trainJointPairModel(examples, { iterations: 300 });
    const pred = scoreWithModel(fv({ lex_jaccard: 0.9 }), r.model);
    expect(pred.probability_positive).toBeGreaterThanOrEqual(0);
    expect(pred.probability_positive).toBeLessThanOrEqual(1);
    expect(["positive", "negative", "uncertain"]).toContain(pred.classification);
    expect(pred.per_feature_contribution).toHaveLength(FEATURE_ORDER.length);
  });

  it("scoreWithModel classification respects 0.3 / 0.7 thresholds", () => {
    // Synthesize a near-deterministic model: huge positive weight on
    // lex_jaccard, all others zero. mean=0, sd=1 → standardized value
    // ≈ raw value.
    const fakeModel = {
      version: "test",
      build_timestamp: new Date().toISOString(),
      trained_on_n_positives: 1,
      trained_on_n_negatives: 1,
      training_accuracy: 1,
      final_loss: 0,
      iterations: 0,
      learning_rate: 0,
      rng_seed: 0,
      intercept: 0,
      weights: {
        lex_jaccard: 10,
        fuzzy_jaccard: 0,
        thematic_cosine: 0,
        scribal_cosine: 0,
        substitution_lift_z: 0,
        composition_assignment_match: 0,
      },
      feature_means: {
        lex_jaccard: 0,
        fuzzy_jaccard: 0,
        thematic_cosine: 0,
        scribal_cosine: 0,
        substitution_lift_z: 0,
        composition_assignment_match: 0,
      },
      feature_stds: {
        lex_jaccard: 1,
        fuzzy_jaccard: 1,
        thematic_cosine: 1,
        scribal_cosine: 1,
        substitution_lift_z: 1,
        composition_assignment_match: 1,
      },
      bootstrap_warning: "test",
    };
    const high = scoreWithModel(fv({ lex_jaccard: 0.9 }), fakeModel);
    const low = scoreWithModel(fv({ lex_jaccard: -0.9 }), fakeModel);
    const mid = scoreWithModel(fv({ lex_jaccard: 0 }), fakeModel);
    expect(high.classification).toBe("positive");
    expect(low.classification).toBe("negative");
    expect(mid.classification).toBe("uncertain");
  });

  it("model.feature_means + feature_stds are populated for every feature", () => {
    const examples: TrainingExample[] = [
      { tablet_a: "a", tablet_b: "b", label: 1, features: fv({ lex_jaccard: 0.5, fuzzy_jaccard: 0.6 }) },
      { tablet_a: "c", tablet_b: "d", label: 0, features: fv({ lex_jaccard: 0.1, fuzzy_jaccard: 0.2 }) },
      { tablet_a: "e", tablet_b: "f", label: 1, features: fv({ lex_jaccard: 0.7, fuzzy_jaccard: 0.8 }) },
    ];
    const r = trainJointPairModel(examples, { iterations: 50 });
    for (const f of FEATURE_ORDER) {
      expect(typeof r.model.feature_means[f]).toBe("number");
      expect(typeof r.model.feature_stds[f]).toBe("number");
      expect(typeof r.model.weights[f]).toBe("number");
    }
  });
});
