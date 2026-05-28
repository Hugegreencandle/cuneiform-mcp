// comparePair classifyFromAxes — §3.4 decision-tree boundary tests (v0.70)
//
// Pins the two A1 boundary-calibration soft-spots (with the live-labeling
// counterexamples that motivated them) and guards the untouched branches so a
// future threshold tweak can't silently regress them.

import { describe, it, expect } from "vitest";
import { classifyFromAxes } from "../src/comparePair.js";

// Convenience: default the axes that a given branch doesn't read.
const axes = (o: Partial<Parameters<typeof classifyFromAxes>[0]>) =>
  classifyFromAxes({ fuzzyJ: 0, exactJ: 0, themCos: 0, scribCos: 0, longRun: 0, ...o });

describe("classifyFromAxes — A1 soft-spot recoveries", () => {
  it("soft-spot 1: BM.38552↔K.9270 (scribCos=0.503, fuzzy_J=0.404, run=102) → same_composition_different_scribe [medium]", () => {
    const r = axes({ fuzzyJ: 0.404, scribCos: 0.503, themCos: 0.87, longRun: 102, exactJ: 0.1 });
    expect(r.primary_relationship).toBe("same_composition_different_scribe");
    expect(r.confidence).toBe("medium"); // tapered in the 0.5–0.7 band
  });

  it("soft-spot 2: K.17494↔K.47 (scribal=0.697, thematic≥0.7, fuzzy<0.15) → same_scribe_different_composition [medium]", () => {
    const r = axes({ scribCos: 0.697, themCos: 0.8, fuzzyJ: 0.1, exactJ: 0.02 });
    expect(r.primary_relationship).toBe("same_scribe_different_composition");
    expect(r.confidence).toBe("medium");
  });
});

describe("classifyFromAxes — untouched branches (regression guards)", () => {
  it("very-high lexical + same scribe → physical_join_candidate [high]", () => {
    const r = axes({ fuzzyJ: 0.8, scribCos: 0.8 });
    expect(r.primary_relationship).toBe("physical_join_candidate");
    expect(r.confidence).toBe("high");
  });

  it("high lexical (0.5–0.7) + same scribe → same_composition_same_scribe [high]", () => {
    const r = axes({ fuzzyJ: 0.6, scribCos: 0.75 });
    expect(r.primary_relationship).toBe("same_composition_same_scribe");
  });

  it("moderate lexical + same scribe (≥0.7) → same_scribe_different_composition [medium]", () => {
    const r = axes({ fuzzyJ: 0.4, scribCos: 0.75 });
    expect(r.primary_relationship).toBe("same_scribe_different_composition");
    expect(r.confidence).toBe("medium");
  });

  it("moderate lexical + low scribe (<0.5) → same_composition_different_scribe [high]", () => {
    const r = axes({ fuzzyJ: 0.4, scribCos: 0.3 });
    expect(r.primary_relationship).toBe("same_composition_different_scribe");
    expect(r.confidence).toBe("high"); // still high below 0.5
  });

  it("same scribe (≥0.7) + low lexical → same_scribe_different_composition [high]", () => {
    const r = axes({ scribCos: 0.8, fuzzyJ: 0.1 });
    expect(r.primary_relationship).toBe("same_scribe_different_composition");
    expect(r.confidence).toBe("high");
  });

  it("thematic-only still fires when scribal signal is weak (<0.6)", () => {
    const r = axes({ themCos: 0.8, fuzzyJ: 0.1, exactJ: 0.02, scribCos: 0.2 });
    expect(r.primary_relationship).toBe("thematic_only");
  });

  it("weak cross-axis signal → weak_relationship [low]", () => {
    const r = axes({ fuzzyJ: 0.16, themCos: 0.1, scribCos: 0.1 });
    expect(r.primary_relationship).toBe("weak_relationship");
    expect(r.confidence).toBe("low");
  });

  it("nothing above threshold → unrelated [high]", () => {
    const r = axes({ fuzzyJ: 0.05, themCos: 0.05, scribCos: 0.05 });
    expect(r.primary_relationship).toBe("unrelated");
  });
});
