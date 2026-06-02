// Tests for the SumTablets search surface (src/sumtablets.ts) backing the
// search_sumtablets MCP tool (v0.79.0).
//
// The runtime tool reads the cached metadata sidecar (sumtablets-meta.json)
// produced build-time by scripts/build-sumtablets-signs.mjs — the server never
// touches parquet (hyparquet is dev-only). These tests synthesize a sidecar in
// a temp cache dir and exercise filtering, skew warnings, and graceful absence.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { searchSumtablets, SUMTABLETS_META_FILE } from "../src/sumtablets.js";

let cacheDir: string;

const META = {
  version: "1.0.0",
  built_at: "2026-06-02T00:00:00.000Z",
  source: "SumTablets (test fixture)",
  count: 5,
  period_distribution: { "Ur III": 4, "Old Babylonian": 1 },
  genre_distribution: { Administrative: 4, Literary: 1 },
  records: [
    { id: "P112475", period: "Ur III", genre: "Administrative", transliteration: "4(u) udu siskur₂" },
    { id: "P117318", period: "Ur III", genre: "Administrative", transliteration: "1(diš) maš₂ ki" },
    { id: "P200001", period: "Ur III", genre: "Administrative", transliteration: "gu₄ niga" },
    { id: "P300002", period: "Ur III", genre: "Administrative", transliteration: "še gur" },
    { id: "P400003", period: "Old Babylonian", genre: "Literary", transliteration: "dumu lugal" },
  ],
};

beforeAll(() => {
  cacheDir = mkdtempSync(join(tmpdir(), "sumtablets-test-"));
  writeFileSync(join(cacheDir, SUMTABLETS_META_FILE), JSON.stringify(META));
});

afterAll(() => {
  rmSync(cacheDir, { recursive: true, force: true });
});

describe("searchSumtablets", () => {
  it("returns all records when no filter is given (capped by limit)", () => {
    const r = searchSumtablets({}, cacheDir);
    expect(r.available).toBe(true);
    expect(r.total_corpus).toBe(5);
    expect(r.match_count).toBe(5);
    expect(r.results.length).toBe(5);
  });

  it("filters by id substring", () => {
    const r = searchSumtablets({ id: "P1124" }, cacheDir);
    expect(r.match_count).toBe(1);
    expect(r.results[0].id).toBe("P112475");
  });

  it("filters by period and genre (substring, case-insensitive)", () => {
    const r = searchSumtablets({ period: "old babylonian", genre: "Literary" }, cacheDir);
    expect(r.match_count).toBe(1);
    expect(r.results[0].id).toBe("P400003");
  });

  it("filters by transliteration substring", () => {
    const r = searchSumtablets({ transliteration_contains: "lugal" }, cacheDir);
    expect(r.match_count).toBe(1);
    expect(r.results[0].id).toBe("P400003");
  });

  it("respects the limit cap and reports returned vs match_count", () => {
    const r = searchSumtablets({ limit: 2 }, cacheDir);
    expect(r.match_count).toBe(5);
    expect(r.returned).toBe(2);
    expect(r.results.length).toBe(2);
  });

  it("surfaces the period + genre skew as warnings (Ur III / Administrative dominant)", () => {
    const r = searchSumtablets({}, cacheDir);
    const joined = r.warnings.join(" ");
    expect(joined).toMatch(/Ur III/);
    expect(joined).toMatch(/Administrative/);
  });

  it("emits NO composition-assignment field (Sumerian tablets are not eBL compositions)", () => {
    const r = searchSumtablets({ id: "P112475" }, cacheDir);
    const rec = r.results[0] as Record<string, unknown>;
    expect("composition" in rec).toBe(false);
    expect("composition_id" in rec).toBe(false);
  });

  it("degrades gracefully when the cache is absent (available:false + setup hint)", () => {
    const empty = mkdtempSync(join(tmpdir(), "sumtablets-empty-"));
    mkdirSync(empty, { recursive: true });
    const r = searchSumtablets({}, empty);
    expect(r.available).toBe(false);
    expect(r.match_count).toBe(0);
    expect(r.warnings.join(" ")).toMatch(/fetch-sumtablets/);
    rmSync(empty, { recursive: true, force: true });
  });
});
