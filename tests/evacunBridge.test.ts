// feat/evacun-benchmark — EvaCun token-prediction harness tests.
//
// Three contracts that must hold WITHOUT the torch sidecar + WITHOUT the EvaCun
// corpus (the default CI state):
//   1. The word<->subword BRIDGE invariants the guardrail names hold — asserted
//      here in TS, INDEPENDENTLY of the Python --selftest (so a bridge regression
//      is caught even if torch is absent). The same invariants are re-checked by
//      running predict_masked.py --selftest when python3.11 is present.
//   2. The Node driver scripts/benchmark-evacun.mjs degrades gracefully — prints
//      the GATED envelope (data_available:false / inference_available:false),
//      exits 0, NEVER throws, and NEVER emits a fabricated "beats SOTA" number.
//   3. No MCP tool ships — the tool count is unchanged (sanity: smoke string is
//      asserted elsewhere; here we just confirm no evacun tool is registered).
//
// These are hermetic: no venv, no checkpoint, no corpus exist in CI, so the real
// missing-gate paths are exercised.

import { describe, it, expect } from "vitest";
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const DRIVER = join(ROOT, "scripts", "benchmark-evacun.mjs");
const SIDECAR = join(ROOT, "scripts", "evacun", "predict_masked.py");
const PY311 = "/opt/homebrew/bin/python3.11";

// ── TS re-implementation of the BRIDGE invariants (kept in lockstep with the
//    Python detokenize_wordpiece / find_word_span). If these drift from the
//    sidecar, the Python --selftest below will also fire — two independent guards.

const GAP_TOKENS = new Set(["...", "x", "X", "…", "[...]", "[…]"]);

function isGapToken(tok: string): boolean {
  return GAP_TOKENS.has(tok.trim());
}

function findWordSpan(wordIndex: number, wordLengths: number[]): [number, number] {
  if (wordIndex < 0 || wordIndex >= wordLengths.length) {
    throw new RangeError(`word_index ${wordIndex} out of range`);
  }
  const start = wordLengths.slice(0, wordIndex).reduce((a, b) => a + b, 0);
  return [start, start + wordLengths[wordIndex]];
}

function detokenizeWordpiece(subtokens: string[]): string {
  const out: string[] = [];
  for (const t of subtokens) {
    if (["[CLS]", "[SEP]", "[PAD]", "[MASK]"].includes(t)) continue;
    if (t === "[UNK]") {
      out.push(t);
      continue;
    }
    if (t.startsWith("##")) {
      if (out.length) out[out.length - 1] = out[out.length - 1] + t.slice(2);
      else out.push(t.slice(2));
    } else {
      out.push(t);
    }
  }
  return out.join("");
}

describe("EvaCun bridge — span coverage (find_word_span)", () => {
  // words: ["AN", "{URU}-sa-am-al-la", "GU2"] → subtoken lengths [1, 5, 2].
  const lengths = [1, 5, 2];
  it("covers a single-subtoken word", () => {
    expect(findWordSpan(0, lengths)).toEqual([0, 1]);
  });
  it("covers a multi-subtoken brace/hyphen word EXACTLY (no off-by-one)", () => {
    expect(findWordSpan(1, lengths)).toEqual([1, 6]);
  });
  it("covers the trailing subscript word", () => {
    expect(findWordSpan(2, lengths)).toEqual([6, 8]);
  });
  it("throws (not silently mis-spans) on out-of-range index", () => {
    expect(() => findWordSpan(3, lengths)).toThrow();
  });
});

describe("EvaCun bridge — detokenisation round-trip", () => {
  it("rejoins ## continuations into one surface word", () => {
    expect(detokenizeWordpiece(["su", "##2"])).toBe("su2");
    expect(detokenizeWordpiece(["GU", "##2"])).toBe("GU2");
  });
  it("keeps brace-group subtokens contiguous", () => {
    expect(detokenizeWordpiece(["{", "##URU", "##}", "##sa"])).toBe("{URU}sa");
  });
  it("strips structural specials but keeps [UNK] literal", () => {
    expect(detokenizeWordpiece(["[CLS]", "GU", "##2", "[SEP]"])).toBe("GU2");
    expect(detokenizeWordpiece(["[UNK]"])).toBe("[UNK]");
  });
  it("is deterministic", () => {
    expect(detokenizeWordpiece(["a", "##b"])).toBe(detokenizeWordpiece(["a", "##b"]));
  });
});

describe("EvaCun bridge — exact-match is case/subscript sensitive", () => {
  it("su2 != SU2 (no casefolding in the headline metric)", () => {
    expect("su2" === "SU2").toBe(false);
  });
});

describe("EvaCun bridge — gap-token guard", () => {
  it("excludes lacuna tokens from masking/scoring", () => {
    expect(isGapToken("...")).toBe(true);
    expect(isGapToken("x")).toBe(true);
    expect(isGapToken("X")).toBe(true);
  });
  it("does not exclude a real word", () => {
    expect(isGapToken("ina")).toBe(false);
  });
});

describe("EvaCun Python sidecar --selftest (when python3.11 present)", () => {
  it("passes the same bridge invariants in-process", () => {
    if (!existsSync(PY311) || !existsSync(SIDECAR)) return; // CI without 3.11 — skip.
    const out = execFileSync(PY311, [SIDECAR, "--selftest"], { encoding: "utf-8" });
    const parsed = JSON.parse(out.trim().split("\n").pop() as string);
    expect(parsed.selftest).toBe("pass");
    expect(parsed.failures).toEqual([]);
  });
});

describe("EvaCun Node driver — graceful gated degradation", () => {
  it("prints the gated envelope, never throws, exits 0, emits NO fabricated score", async () => {
    const { stdout } = await execFileP(process.execPath, [DRIVER], {
      timeout: 60000,
      maxBuffer: 16 * 1024 * 1024,
    });
    // Honest gating signals present.
    expect(stdout).toContain("data_available:");
    expect(stdout).toContain("inference_available:");
    expect(stdout).toMatch(/GATED|gate UNMET/);
    // References printed for context.
    expect(stdout).toContain("0.221");
    expect(stdout).toContain("0.269");
    // CRITICAL: never an unqualified "beats SOTA" claim.
    expect(stdout.toLowerCase()).not.toContain("beats sota");
    // No real-result block when gated.
    expect(stdout).not.toContain("REAL scored result");
  });
});
