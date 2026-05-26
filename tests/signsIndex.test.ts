import { describe, it, expect } from "vitest";
import { jaccard, overlapCoefficient, similarityScore } from "../src/signsIndex.js";

describe("jaccard", () => {
  it("returns 0 on disjoint sets", () => {
    expect(jaccard(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("returns 1 on identical sets", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("returns 0 when either set is empty", () => {
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
    expect(jaccard(new Set(["a"]), new Set())).toBe(0);
  });

  it("computes |A∩B|/|A∪B| correctly on partial overlap", () => {
    // |{a,b,c} ∩ {b,c,d}| = 2; |∪| = 4; → 0.5
    expect(jaccard(new Set(["a", "b", "c"]), new Set(["b", "c", "d"]))).toBe(0.5);
  });
});

describe("overlapCoefficient (Szymkiewicz-Simpson)", () => {
  it("returns 0 on disjoint sets", () => {
    expect(overlapCoefficient(new Set(["a"]), new Set(["b"]))).toBe(0);
  });

  it("returns 1 on identical sets", () => {
    expect(overlapCoefficient(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
  });

  it("returns 0 when either set is empty", () => {
    expect(overlapCoefficient(new Set(), new Set(["a"]))).toBe(0);
    expect(overlapCoefficient(new Set(["a"]), new Set())).toBe(0);
  });

  it("returns 1 when smaller set is fully contained in larger", () => {
    // The key size-asymmetry case Simonjetz et al. 2024 flag as a Jaccard
    // weakness: small fragment whose every trigram is in the large chapter.
    const fragment = new Set(["a", "b"]);
    const chapter = new Set(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(overlapCoefficient(fragment, chapter)).toBe(1);
    // Jaccard on the same pair penalizes the size asymmetry.
    expect(jaccard(fragment, chapter)).toBe(2 / 8);
  });

  it("normalizes by the SMALLER set, not the union", () => {
    // |{a,b,c} ∩ {a,d,e,f,g}| = 1; min(|F|, |C|) = 3; → 1/3.
    // Jaccard would give 1/7 ≈ 0.143; overlap gives 1/3 ≈ 0.333.
    expect(overlapCoefficient(new Set(["a", "b", "c"]), new Set(["a", "d", "e", "f", "g"])))
      .toBeCloseTo(1 / 3, 6);
  });

  it("is symmetric (order-independent)", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d", "e"]);
    expect(overlapCoefficient(a, b)).toBe(overlapCoefficient(b, a));
  });
});

describe("similarityScore dispatcher", () => {
  it("defaults to jaccard when metric is omitted", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["b", "c"]);
    expect(similarityScore(a, b)).toBe(jaccard(a, b));
  });

  it("routes to jaccard when metric is 'jaccard'", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["b", "c"]);
    expect(similarityScore(a, b, "jaccard")).toBe(jaccard(a, b));
  });

  it("routes to overlap when metric is 'overlap'", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["b", "c"]);
    expect(similarityScore(a, b, "overlap")).toBe(overlapCoefficient(a, b));
  });

  it("produces different scores for the two metrics on size-asymmetric pairs", () => {
    const fragment = new Set(["a", "b", "c"]);
    const chapter = new Set(["a", "b", "c", "d", "e", "f"]);
    const j = similarityScore(fragment, chapter, "jaccard");
    const o = similarityScore(fragment, chapter, "overlap");
    expect(o).toBeGreaterThan(j); // overlap rewards full containment
    expect(j).toBe(3 / 6);
    expect(o).toBe(1);
  });
});
