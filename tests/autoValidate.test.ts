// v0.64.0 — Tests for auto_validate_from_resolutions.
//
// The load-bearing invariants this suite proves:
//   1. mode !== "propose" throws (safety assertion)
//   2. The proposal file is written and contains the expected anchors
//   3. validation-resolutions.json mtime is unchanged after a run
//   4. Rules are applied as documented (positives + negatives counts)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { autoValidateFromResolutions } from "../src/autoValidateFromResolutions.js";
import { resolutionsCachePath } from "../src/validationResolutions.js";

describe("auto_validate_from_resolutions", () => {
  let tmpOut: string;

  beforeEach(() => {
    tmpOut = mkdtempSync(join(tmpdir(), "cuneiform-autoval-"));
  });

  afterEach(() => {
    rmSync(tmpOut, { recursive: true, force: true });
  });

  // ── Safety: mode must be "propose" ─────────────────────────────────────

  it("throws when mode !== 'propose'", () => {
    expect(() =>
      autoValidateFromResolutions({
        // @ts-expect-error: deliberately wrong mode for safety check
        mode: "apply",
        candidate_tablets: ["K.123"],
        output_dir: tmpOut,
      }),
    ).toThrow(/mode must be "propose"/);
  });

  it("throws when mode is undefined", () => {
    expect(() =>
      autoValidateFromResolutions({
        // @ts-expect-error: deliberately missing mode
        mode: undefined,
        candidate_tablets: ["K.123"],
        output_dir: tmpOut,
      }),
    ).toThrow(/mode must be "propose"/);
  });

  // ── Safety: store mtime unchanged ──────────────────────────────────────

  it("does not mutate ~/.cache/cuneiform-mcp/validation-resolutions.json", () => {
    const storePath = resolutionsCachePath();
    const mtimeBefore = existsSync(storePath) ? statSync(storePath).mtime.toISOString() : null;

    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: ["K.7563", "K.5896", "BM.42262"],
      output_dir: tmpOut,
    });

    const mtimeAfter = existsSync(storePath) ? statSync(storePath).mtime.toISOString() : null;

    expect(mtimeAfter).toBe(mtimeBefore);
    expect(r.validation_store_mtime_unchanged).toBe(true);
    expect(r.validation_store_mtime_before).toBe(mtimeBefore);
    expect(r.validation_store_mtime_after).toBe(mtimeAfter);
  });

  // ── Functional: proposals file is written ──────────────────────────────

  it("writes a proposal file with the expected sections", () => {
    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: ["K.7563", "BM.42262", "K.5896"],
      output_dir: tmpOut,
    });

    expect(existsSync(r.proposal_file_path)).toBe(true);
    const md = readFileSync(r.proposal_file_path, "utf-8");
    expect(md).toContain("# auto-validation proposals");
    expect(md).toContain("PROPOSAL-ONLY MODE");
    expect(md).toContain("RULE_A_FINAL1_BIOPRHAN");
    expect(md).toContain("RULE_B_K6683_SIBLING");
    expect(md).toContain("RULE_C_COMMENTARY_QUOTES_BASE");
  });

  // ── Functional: rules produce the right number of proposals ───────────

  it("applies all three rules with documented hit counts", () => {
    // 3 candidates, 1 of which (K.5896) is on the never-pair list →
    // Rule A produces 2 proposals (K.7563 and BM.42262 paired with IM.49220).
    // Rule B produces 1 positive (K.5896 ↔ K.6683).
    // Rule C produces 1 positive (BM.47463 ↔ CBS.6060).
    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: ["K.7563", "BM.42262", "K.5896"],
      output_dir: tmpOut,
    });

    expect(r.proposed_negatives).toBe(2);
    expect(r.proposed_positives).toBe(2);
    expect(r.proposals).toHaveLength(4);

    const ruleA = r.rules_applied.find((x) => x.rule_id === "RULE_A_FINAL1_BIOPRHAN");
    expect(ruleA?.proposals_generated).toBe(2);

    const ruleB = r.rules_applied.find((x) => x.rule_id === "RULE_B_K6683_SIBLING");
    expect(ruleB?.proposals_generated).toBe(1);

    const ruleC = r.rules_applied.find((x) => x.rule_id === "RULE_C_COMMENTARY_QUOTES_BASE");
    expect(ruleC?.proposals_generated).toBe(1);
  });

  it("never pairs the bi-orphan with itself or the other anchor tablets", () => {
    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: ["IM.49220", "K.5896", "K.6683", "BM.47463", "CBS.6060", "K.7563"],
      output_dir: tmpOut,
    });

    // Rule A should only produce 1 proposal (K.7563), since all other
    // candidates are on the never-pair list (anchor tablets).
    const ruleA = r.rules_applied.find((x) => x.rule_id === "RULE_A_FINAL1_BIOPRHAN");
    expect(ruleA?.proposals_generated).toBe(1);

    // No proposal should have IM.49220 paired with itself.
    const selfPair = r.proposals.find(
      (p) => p.tablet_a === "IM.49220" && p.tablet_b === "IM.49220",
    );
    expect(selfPair).toBeUndefined();

    // No Rule-A proposal should pair the bi-orphan with K.6683, K.5896,
    // BM.47463, or CBS.6060 (those have their own positive rules).
    const ruleANegs = r.proposals.filter((p) => p.rule_id === "RULE_A_FINAL1_BIOPRHAN");
    for (const neg of ruleANegs) {
      const other = neg.tablet_a === "IM.49220" ? neg.tablet_b : neg.tablet_a;
      expect(["K.5896", "K.6683", "BM.47463", "CBS.6060"]).not.toContain(other);
    }
  });

  // ── Functional: empty candidates still produces the 2 positive anchors

  it("emits the 2 positive-anchor proposals even with no queue candidates", () => {
    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: [],
      output_dir: tmpOut,
    });

    expect(r.proposed_negatives).toBe(0);
    expect(r.proposed_positives).toBe(2);
    expect(r.proposals.map((p) => p.pair_id).sort()).toEqual(
      ["BM.47463↔CBS.6060", "K.5896↔K.6683"].sort(),
    );
  });

  // ── Functional: result envelope shape ──────────────────────────────────

  it("returns the documented result shape", () => {
    const r = autoValidateFromResolutions({
      mode: "propose",
      candidate_tablets: ["K.7563"],
      output_dir: tmpOut,
    });
    expect(r.mode).toBe("propose");
    expect(typeof r.proposal_file_path).toBe("string");
    expect(typeof r.validation_store_path).toBe("string");
    expect(r.rules_applied).toHaveLength(3);
    for (const rule of r.rules_applied) {
      expect(rule.rule_id).toMatch(/^RULE_[A-C]_/);
      expect(rule.source_doc).toMatch(/methods paper §/);
    }
  });
});
