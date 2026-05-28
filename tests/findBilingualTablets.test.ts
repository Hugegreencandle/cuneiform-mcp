// v0.66.0 — Tests for find_bilingual_tablets.
//
// Cache-only tests — no network. Uses a per-test override of
// CUNEIFORM_MCP_CACHE_DIR pointing at a temp directory so we can craft the
// bilingual-index.json shape we want each test to exercise.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  findBilingualTablets,
  _resetForTests,
  computeConfidence,
  type BilingualIndex,
  type BilingualIndexEntry,
} from "../src/findBilingualTablets.js";

let tmp: string;
const ORIG_CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cuneiform-mcp-bilingual-test-"));
  process.env.CUNEIFORM_MCP_CACHE_DIR = tmp;
  _resetForTests();
});

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  if (ORIG_CACHE_DIR === undefined) delete process.env.CUNEIFORM_MCP_CACHE_DIR;
  else process.env.CUNEIFORM_MCP_CACHE_DIR = ORIG_CACHE_DIR;
  _resetForTests();
});

// ─── Builders ─────────────────────────────────────────────────────────────

function mkEntry(
  classification: BilingualIndexEntry["classification"],
  signalOverrides: Partial<BilingualIndexEntry["signal"]> = {},
  genrePath: string | null = null,
): BilingualIndexEntry {
  const baseSignal: BilingualIndexEntry["signal"] = {
    text_line_count: 10,
    sumerian_only_line_count: 0,
    akkadian_only_line_count: 0,
    mixed_token_line_count: 0,
    sumerian_token_count: 0,
    akkadian_token_count: 0,
    sumerian_token_share: 0,
    akkadian_token_share: 0,
    language_shift_count: 0,
    alternation_pattern: "none",
    genre_prior: "unknown",
    genre_path: null,
  };
  const signal = { ...baseSignal, ...signalOverrides };
  return {
    classification,
    is_bilingual:
      classification === "interlinear_bilingual" ||
      classification === "alternating_line_bilingual",
    signal,
    genre_path: genrePath,
  };
}

function writeIndex(entries: Record<string, BilingualIndexEntry>): void {
  const idx: BilingualIndex = {
    version: "1.0.0",
    built_at: "2026-05-28T00:00:00Z",
    source: "test fixture",
    entries,
  };
  mkdirSync(tmp, { recursive: true });
  writeFileSync(join(tmp, "bilingual-index.json"), JSON.stringify(idx));
}

// ─── Empty / missing cache ────────────────────────────────────────────────

describe("findBilingualTablets — missing/empty cache", () => {
  it("returns an empty envelope + actionable warning when the cache file is absent", () => {
    const r = findBilingualTablets();
    expect(r.tablets).toEqual([]);
    expect(r.cache_stats.cache_exists).toBe(false);
    expect(r.cache_stats.tablets_in_cache).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.join("\n")).toMatch(/scripts\/build-bilingual-index\.mjs/);
  });

  it("returns an empty envelope + warning when the cache exists but contains zero entries", () => {
    writeIndex({});
    const r = findBilingualTablets();
    expect(r.tablets).toEqual([]);
    expect(r.cache_stats.cache_exists).toBe(true);
    expect(r.cache_stats.tablets_in_cache).toBe(0);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("malformed cache (invalid JSON) yields graceful error envelope, no crash", () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "bilingual-index.json"), "{not valid json");
    const r = findBilingualTablets();
    expect(r.tablets).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings.join("\n")).toMatch(/unreadable|rebuild/i);
  });

  it("malformed cache (entries field missing) yields graceful error envelope", () => {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(
      join(tmp, "bilingual-index.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    const r = findBilingualTablets();
    expect(r.tablets).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

// ─── Filter + ranking ─────────────────────────────────────────────────────

describe("findBilingualTablets — filter + ranking", () => {
  it("returns only bilingual classifications by default", () => {
    writeIndex({
      "T.1": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
        mixed_token_line_count: 10,
      }),
      "T.2": mkEntry("monolingual_akkadian", {
        akkadian_token_count: 100,
        akkadian_token_share: 1,
      }),
      "T.3": mkEntry("alternating_line_bilingual", {
        sumerian_token_count: 40,
        akkadian_token_count: 40,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
        sumerian_only_line_count: 10,
        akkadian_only_line_count: 10,
      }),
      "T.4": mkEntry("akkadian_with_sumerograms", {
        sumerian_token_count: 5,
        akkadian_token_count: 95,
        sumerian_token_share: 0.05,
        akkadian_token_share: 0.95,
      }),
    });
    const r = findBilingualTablets();
    const ids = r.tablets.map((t) => t.tablet_id).sort();
    expect(ids).toEqual(["T.1", "T.3"]);
    expect(r.cache_stats.tablets_in_cache).toBe(4);
    expect(r.cache_stats.tablets_classified_bilingual).toBe(2);
  });

  it("respects top_k", () => {
    const entries: Record<string, BilingualIndexEntry> = {};
    for (let i = 0; i < 10; i++) {
      entries[`T.${i}`] = mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50 - i,
        akkadian_token_count: 50,
        sumerian_token_share: (50 - i) / (100 - i),
        akkadian_token_share: 50 / (100 - i),
        mixed_token_line_count: 10,
      });
    }
    writeIndex(entries);
    const r = findBilingualTablets({ topK: 3 });
    expect(r.tablets.length).toBe(3);
  });

  it("respects classification_filter", () => {
    writeIndex({
      "T.1": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
      }),
      "T.2": mkEntry("alternating_line_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
      }),
      "T.3": mkEntry("akkadian_with_sumerograms", {
        sumerian_token_count: 5,
        akkadian_token_count: 95,
        sumerian_token_share: 0.05,
        akkadian_token_share: 0.95,
      }),
    });
    const r = findBilingualTablets({
      classificationFilter: ["alternating_line_bilingual"],
    });
    expect(r.tablets.length).toBe(1);
    expect(r.tablets[0].tablet_id).toBe("T.2");
  });

  it("classification_filter accepting non-bilingual class still returns those entries", () => {
    writeIndex({
      "T.1": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
      }),
      "T.2": mkEntry("akkadian_with_sumerograms", {
        sumerian_token_count: 5,
        akkadian_token_count: 95,
        sumerian_token_share: 0.05,
        akkadian_token_share: 0.95,
      }),
    });
    const r = findBilingualTablets({
      classificationFilter: ["akkadian_with_sumerograms"],
    });
    expect(r.tablets.length).toBe(1);
    expect(r.tablets[0].tablet_id).toBe("T.2");
  });

  it("respects min_confidence", () => {
    writeIndex({
      "HI.1": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
        mixed_token_line_count: 10,
      }),
      "LO.1": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 21,
        akkadian_token_count: 79,
        sumerian_token_share: 0.21, // barely above threshold
        akkadian_token_share: 0.79,
      }),
    });
    const r = findBilingualTablets({ minConfidence: 0.5 });
    const ids = r.tablets.map((t) => t.tablet_id);
    expect(ids).toContain("HI.1");
    expect(ids).not.toContain("LO.1");
  });

  it("ranks by confidence desc (balanced bilinguals score higher)", () => {
    writeIndex({
      "T.balanced": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 50,
        akkadian_token_count: 50,
        sumerian_token_share: 0.5,
        akkadian_token_share: 0.5,
        mixed_token_line_count: 10,
      }),
      "T.skewed": mkEntry("interlinear_bilingual", {
        sumerian_token_count: 22,
        akkadian_token_count: 78,
        sumerian_token_share: 0.22,
        akkadian_token_share: 0.78,
        mixed_token_line_count: 10,
      }),
    });
    const r = findBilingualTablets();
    expect(r.tablets[0].tablet_id).toBe("T.balanced");
  });

  it("surfaces genre_path on each candidate", () => {
    writeIndex({
      "T.1": mkEntry(
        "interlinear_bilingual",
        {
          sumerian_token_count: 50,
          akkadian_token_count: 50,
          sumerian_token_share: 0.5,
          akkadian_token_share: 0.5,
          mixed_token_line_count: 10,
        },
        "CANONICAL → Literature → Narrative → Lugal-e",
      ),
    });
    const r = findBilingualTablets();
    expect(r.tablets[0].genre_path).toBe(
      "CANONICAL → Literature → Narrative → Lugal-e",
    );
  });
});

// ─── Confidence scoring ───────────────────────────────────────────────────

describe("computeConfidence", () => {
  it("perfect 50/50 bilingual scores high (>= 0.75)", () => {
    const e = mkEntry("interlinear_bilingual", {
      sumerian_token_count: 50,
      akkadian_token_count: 50,
      sumerian_token_share: 0.5,
      akkadian_token_share: 0.5,
    });
    expect(computeConfidence(e)).toBeGreaterThanOrEqual(0.75);
  });

  it("insufficient_data scores 0", () => {
    const e = mkEntry("insufficient_data", {
      text_line_count: 0,
    });
    expect(computeConfidence(e)).toBe(0);
  });

  it("akkadian_with_sumerograms (95/5) scores well — strong monolingual signal", () => {
    const e = mkEntry("akkadian_with_sumerograms", {
      sumerian_token_share: 0.05,
      akkadian_token_share: 0.95,
    });
    expect(computeConfidence(e)).toBeGreaterThan(0.4);
  });
});
