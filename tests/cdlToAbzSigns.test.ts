// Tests for the ccpo CDL → eBL all-signs converter (src/oracc/cdl.ts).
//
// THE BRIDGE: ccpo editions are Oracc CDL with TRANSLITERATION, not ABZ codes,
// but every l-node's f.gdl[] carries gdl_sign = the OGSL SIGN NAME. cdlToAbzSigns
// maps those names → eBL ABZ codes and emits eBL all-signs format (ABZ codes
// space-separated, one line per newline, "X" for damage/unmapped).
//
// Coverage here:
//   1. resolveGdlSignToAbz — every resolution branch (damage, direct, @-strip,
//      numeral, compound-whole, compound-decompose, unmapped→X).
//   2. cdlToAbzSigns on a hand-built CDL doc shaped EXACTLY like a real ccpo
//      corpusjson (verified 2026-06-02), incl. the leading-X line.
//   3. CACHE-GATED: on a real ccpo edition (P237219) + the real ccpo-abz-map,
//      assert the first converted line is the known damage-led MA·GIŠ·NU·NU
//      sequence, and map coverage ≥ 99.5% non-damage (spec floor).

import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { cdlToAbzSigns, resolveGdlSignToAbz, stripGraphicVariant } from "../src/oracc/cdl.js";

// A minimal OGSL-name → eBL-ABZ map covering the signs used below. Real values
// from data/ccpo-abz-map.json (eBL unpadded numbering: A=ABZ579, MA=ABZ342).
const MAP = new Map<string, string>([
  ["A", "ABZ579"],
  ["MA", "ABZ342"],
  ["AN", "ABZ13"],
  ["GIŠ", "ABZ296"],
  ["NU", "ABZ75"],
  ["KALAM", "ABZ312"],
  ["|SAL.TUG₂|", "ABZ556"],
  ["KA", "ABZ15"],
  ["SAL", "ABZ554"],
]);

describe("resolveGdlSignToAbz", () => {
  it("maps damage X → literal X", () => {
    expect(resolveGdlSignToAbz("X", MAP)).toEqual({ kind: "damage", token: "X" });
    expect(resolveGdlSignToAbz("x", MAP)).toEqual({ kind: "damage", token: "X" });
  });

  it("maps a direct sign name to its ABZ code", () => {
    expect(resolveGdlSignToAbz("MA", MAP)).toMatchObject({ kind: "direct", token: "ABZ342" });
    expect(resolveGdlSignToAbz("A", MAP)).toMatchObject({ kind: "direct", token: "ABZ579" });
  });

  it("recovers a graphic-variant @g name by stripping the suffix", () => {
    const r = resolveGdlSignToAbz("KALAM@g", MAP);
    expect(r).toMatchObject({ kind: "normalized", token: "ABZ312", base: "KALAM" });
  });

  it("emits a bare integer for a N(UNIT) numeral", () => {
    expect(resolveGdlSignToAbz("3(DIŠ)", MAP)).toMatchObject({ kind: "numeral", token: "3" });
    expect(resolveGdlSignToAbz("1(GEŠ₂)", MAP)).toMatchObject({ kind: "numeral", token: "1" });
  });

  it("resolves a whole compound that has a single canonical ABZ", () => {
    const r = resolveGdlSignToAbz("|SAL.TUG₂|", MAP);
    expect(r).toMatchObject({ kind: "direct", token: "ABZ556" }); // direct map hit
  });

  it("decomposes an unmapped compound into its constituents' ABZ sequence", () => {
    // |SAL.A| is NOT a map key; decompose on '.' → SAL (ABZ554) + A (ABZ579).
    const r = resolveGdlSignToAbz("|SAL.A|", MAP);
    expect(r).toMatchObject({ kind: "compound-decomposed", token: "ABZ554 ABZ579" });
  });

  it("emits X for a constituent it cannot map (never drops, preserves alignment)", () => {
    // |SAL.ZZZ| → SAL resolves, ZZZ does not → "ABZ554 X".
    const r = resolveGdlSignToAbz("|SAL.ZZZ|", MAP);
    expect(r).toMatchObject({ kind: "compound-decomposed", token: "ABZ554 X" });
  });

  it("emits X for a wholly unmapped sign (never drops)", () => {
    expect(resolveGdlSignToAbz("ZZZ", MAP)).toEqual({ kind: "unmapped", token: "X", name: "ZZZ" });
  });
});

describe("stripGraphicVariant", () => {
  it("strips single and chained @-suffixes", () => {
    expect(stripGraphicVariant("KALAM@g")).toBe("KALAM");
    expect(stripGraphicVariant("DUN₃@g@g")).toBe("DUN₃");
    expect(stripGraphicVariant("NU₁₁@90")).toBe("NU₁₁");
    expect(stripGraphicVariant("MA")).toBe("MA");
  });
});

describe("cdlToAbzSigns (hand-built ccpo-shaped CDL)", () => {
  // Shaped EXACTLY like a real ccpo corpusjson: root "c" → "d" line-start →
  // "l" nodes each carrying f.gdl[] of {v, gdl_sign, oid, break?}.
  const doc = {
    type: "cdl",
    textid: "P000001",
    cdl: [
      {
        node: "c",
        cdl: [
          { node: "d", type: "line-start", n: "1", label: "o 1" },
          {
            node: "l",
            f: {
              gdl: [
                { v: "x", gdl_sign: "X", break: "missing" },
                { v: "ma", gdl_sign: "MA" },
                { v: "giš", gdl_sign: "GIŠ" },
              ],
            },
          },
          { node: "d", type: "line-start", n: "2", label: "o 2" },
          {
            node: "l",
            f: {
              gdl: [
                { v: "nu", gdl_sign: "NU" },
                { v: "nu", gdl_sign: "NU" },
              ],
            },
          },
        ],
      },
    ],
  };

  it("emits eBL all-signs: ABZ space-separated, newline per line, X for damage", () => {
    const { textId, signs, stats } = cdlToAbzSigns(doc, MAP);
    expect(textId).toBe("P000001");
    expect(signs).toBe("X ABZ342 ABZ296\nABZ75 ABZ75");
    expect(stats.totalGraphemes).toBe(5);
    expect(stats.damage).toBe(1);
    expect(stats.direct).toBe(4);
    expect(stats.unmapped).toBe(0);
  });

  it("groups graphemes by line-start, one CDL line = one output line", () => {
    const { signs } = cdlToAbzSigns(doc, MAP);
    expect(signs.split("\n")).toHaveLength(2);
  });

  it("returns empty signs and null id on an empty doc without throwing", () => {
    const r = cdlToAbzSigns({}, MAP);
    expect(r.signs).toBe("");
    expect(r.textId).toBeNull();
  });
});

// ── CACHE-GATED integration check on the REAL ccpo corpus + real map ─────────
const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const CCPO_DIR = join(CACHE_DIR, "oracc", "ccpo", "corpusjson");
const MAP_PATH = join(process.cwd(), "data", "ccpo-abz-map.json");
const HAVE_CCPO = existsSync(join(CCPO_DIR, "P237219.json")) && existsSync(MAP_PATH);

describe.skipIf(!HAVE_CCPO)("cdlToAbzSigns on the REAL ccpo edition P237219", () => {
  const realMap = new Map<string, string>(
    Object.entries(JSON.parse(readFileSync(MAP_PATH, "utf-8")).map),
  );

  it("converts P237219's first line to the known X-led MA·GIŠ·NU·NU sequence", () => {
    const j = JSON.parse(readFileSync(join(CCPO_DIR, "P237219.json"), "utf-8"));
    const { textId, signs } = cdlToAbzSigns(j, realMap);
    expect(textId).toBe("P237219");
    const firstLine = signs.split("\n")[0];
    // Verified against the raw f.gdl[]: 10× damage-X, then MA GIŠ NU NU.
    expect(firstLine).toBe("X X X X X X X X X X ABZ342 ABZ296 ABZ75 ABZ75");
  });

  it("achieves ≥ 99.5% non-damage coverage across all 205 editions (spec floor)", () => {
    const files = readdirSync(CCPO_DIR).filter((f) => f.endsWith(".json"));
    expect(files.length).toBe(205);
    let total = 0;
    let damage = 0;
    let unmapped = 0;
    for (const f of files) {
      const j = JSON.parse(readFileSync(join(CCPO_DIR, f), "utf-8"));
      const { stats } = cdlToAbzSigns(j, realMap);
      total += stats.totalGraphemes;
      damage += stats.damage;
      unmapped += stats.unmapped;
    }
    const nonDamage = total - damage;
    const coverage = (100 * (nonDamage - unmapped)) / nonDamage;
    expect(coverage).toBeGreaterThanOrEqual(99.5);
    // Damage rate should sit near the verified 17.8%.
    expect((100 * damage) / total).toBeGreaterThan(15);
    expect((100 * damage) / total).toBeLessThan(21);
  });
});
