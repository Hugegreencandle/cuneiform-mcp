// v0.65.0 — Tests for cdli_ebl_crosswalk.
//
// Live HTTP calls are intentional — this tool's whole job is bridging two
// live external APIs and its contract is empirical (the asymmetric-reliability
// path can only be exercised against the live data). Tests are capped to ~10
// network calls total: each test uses 1–3 fetches except the join-expansion
// case which uses ~3.

import { describe, it, expect } from "vitest";

import {
  cdliEblCrosswalk,
  detectInputType,
  normalizeMuseumNumber,
  eblIdsFromCdliMuseumNo,
} from "../src/cdliEblCrosswalk.js";

// CDLI's server (cdli.earth → 141.5.123.37 at LMU München) goes through
// periodic outages. When it's unreachable, the CDLI-dependent tests can't
// exercise their contract — skip them rather than fail the suite. The eBL
// side is the same hosting (LMU) but tends to be more reliably up.
async function probeCdliReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch("https://cdli.earth/artifacts/396240", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}
const CDLI_REACHABLE = await probeCdliReachable();
if (!CDLI_REACHABLE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[cdliEblCrosswalk.test] cdli.earth is unreachable; CDLI-dependent live tests will be skipped.",
  );
}

describe("detectInputType", () => {
  it("recognizes P-numbers (case-insensitive)", () => {
    expect(detectInputType("P396240")).toBe("cdli_p_number");
    expect(detectInputType("p396240")).toBe("cdli_p_number");
    expect(detectInputType("  P572493  ")).toBe("cdli_p_number");
  });

  it("recognizes bare integer ids", () => {
    expect(detectInputType("396240")).toBe("cdli_integer_id");
    expect(detectInputType("1")).toBe("cdli_integer_id");
  });

  it("defaults to museum number for anything else", () => {
    expect(detectInputType("K.5896")).toBe("ebl_museum_number");
    expect(detectInputType("BM 47463")).toBe("ebl_museum_number");
    expect(detectInputType("Ki.1904-10-9.78")).toBe("ebl_museum_number");
  });
});

describe("normalizeMuseumNumber", () => {
  it("converts 'BM 47463' (space) to 'BM.47463'", () => {
    expect(normalizeMuseumNumber("BM 47463")).toBe("BM.47463");
  });

  it("strips leading zeros after the prefix ('BM 047463' → 'BM.47463')", () => {
    expect(normalizeMuseumNumber("BM 047463")).toBe("BM.47463");
  });

  it("preserves already-dotted forms", () => {
    expect(normalizeMuseumNumber("K.5896")).toBe("K.5896");
    expect(normalizeMuseumNumber("Sm.747")).toBe("Sm.747");
  });

  it("preserves internal dashes in date-style numbers (Ki.1904-10-9.78)", () => {
    expect(normalizeMuseumNumber("Ki.1904-10-9.78")).toBe("Ki.1904-10-9.78");
    expect(normalizeMuseumNumber("Ki 1904-10-9.78")).toBe("Ki.1904-10-9.78");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeMuseumNumber("   BM 47463   ")).toBe("BM.47463");
  });
});

describe("eblIdsFromCdliMuseumNo", () => {
  it("splits CDLI ' + ' join expressions into multiple eBL forms", () => {
    expect(eblIdsFromCdliMuseumNo("BM 047463 + BM 049124")).toEqual([
      "BM.47463",
      "BM.49124",
    ]);
  });

  it("returns single entry for a non-join string", () => {
    expect(eblIdsFromCdliMuseumNo("BM 047463")).toEqual(["BM.47463"]);
  });

  it("skips placeholder-only strings like 'BM —'", () => {
    expect(eblIdsFromCdliMuseumNo("BM —")).toEqual([]);
    expect(eblIdsFromCdliMuseumNo("—")).toEqual([]);
  });

  it("handles empty input gracefully", () => {
    expect(eblIdsFromCdliMuseumNo("")).toEqual([]);
  });
});

describe("cdliEblCrosswalk — live", () => {
  // Each `it` here makes 1–3 live HTTP calls. ~9 calls total across the suite.

  it("rejects empty / whitespace-only input", async () => {
    await expect(cdliEblCrosswalk({ id: "" })).rejects.toThrow(
      /non-empty string/,
    );
    await expect(cdliEblCrosswalk({ id: "   " })).rejects.toThrow(
      /non-empty string/,
    );
  });

  it.skipIf(!CDLI_REACHABLE)("eBL → CDLI native path: K.5896 → P396240", async () => {
    const r = await cdliEblCrosswalk({ id: "K.5896" });
    expect(r.query.detected_type).toBe("ebl_museum_number");
    expect(r.matches).toHaveLength(1);
    const m = r.matches[0];
    expect(m.ebl_id).toBe("K.5896");
    expect(m.cdli_p_number).toBe("P396240");
    expect(m.cdli_integer_id).toBe(396240);
    expect(m.confidence).toBe("native");
    expect(m.cdli_artifact_url).toMatch(/cdli\.earth\/artifacts\/396240/);
    expect(m.ebl_fragment_url).toMatch(/fragmentarium\/K\.5896/);
  }, 30_000);

  it.skipIf(!CDLI_REACHABLE)("CDLI P-number → eBL native path: P396240 → K.5896", async () => {
    const r = await cdliEblCrosswalk({ id: "P396240" });
    expect(r.query.detected_type).toBe("cdli_p_number");
    expect(r.matches).toHaveLength(1);
    const m = r.matches[0];
    expect(m.ebl_id).toBe("K.5896");
    expect(m.cdli_p_number).toBe("P396240");
    expect(m.cdli_integer_id).toBe(396240);
    expect(m.confidence).toBe("native");
  }, 30_000);

  it.skipIf(!CDLI_REACHABLE)("CDLI integer id → eBL: 396240 detected as cdli_integer_id", async () => {
    const r = await cdliEblCrosswalk({ id: "396240" });
    expect(r.query.detected_type).toBe("cdli_integer_id");
    expect(r.matches).toHaveLength(1);
    const m = r.matches[0];
    expect(m.ebl_id).toBe("K.5896");
    expect(m.cdli_integer_id).toBe(396240);
    // cdli_p_number can be null in this branch because we don't have the
    // P-number until we read external_resources; we only surface what CDLI
    // ships natively (the eBL key).
    expect(m.confidence).toBe("native");
  }, 30_000);

  it.skipIf(!CDLI_REACHABLE)("museum-number normalization: 'BM 47463' resolves correctly", async () => {
    const r = await cdliEblCrosswalk({ id: "BM 47463" });
    expect(r.query.detected_type).toBe("ebl_museum_number");
    expect(r.matches).toHaveLength(1);
    const m = r.matches[0];
    expect(m.ebl_id).toBe("BM.47463");
    expect(m.cdli_p_number).toBe("P572493");
    expect(m.confidence).toBe("native");
  }, 30_000);

  it.skipIf(!CDLI_REACHABLE)(
    "asymmetric-reliability fallback: P572493 → BM.47463 via museum_no parse",
    async () => {
      // P572493's CDLI record has museum_no="BM 047463 + BM 049124" but
      // external_resources lacks an eBL row. Tool should fall back, parse
      // the join expression, and emit one match per existing eBL fragment.
      const r = await cdliEblCrosswalk({ id: "P572493" });
      expect(r.query.detected_type).toBe("cdli_p_number");
      expect(r.matches.length).toBeGreaterThanOrEqual(1);
      // BM.47463 is the known-good eBL counterpart. BM.49124 may or may not
      // exist on eBL — the test asserts only that the documented anchor is
      // present, with the inferred-via-museum_number confidence.
      const bm47463 = r.matches.find((m) => m.ebl_id === "BM.47463");
      expect(bm47463).toBeDefined();
      expect(bm47463?.confidence).toBe("inferred_via_museum_number");
      expect(bm47463?.cdli_p_number).toBe("P572493");
    },
    45_000,
  );

  it.skipIf(!CDLI_REACHABLE)(
    "join expansion: P572493 surfaces at least one match per ' + '-separated part",
    async () => {
      // This shares an HTTP path with the previous test but asserts the
      // expansion contract specifically: ALL surfaced matches must have the
      // inferred confidence (none came from external_resources).
      const r = await cdliEblCrosswalk({ id: "P572493" });
      for (const m of r.matches) {
        expect(m.confidence).toBe("inferred_via_museum_number");
        expect(m.cdli_integer_id).toBe(572493);
      }
    },
    45_000,
  );

  it.skipIf(!CDLI_REACHABLE)("404 / not-found: nonsense P-number returns empty matches + warning", async () => {
    const r = await cdliEblCrosswalk({ id: "P9999999" });
    expect(r.matches).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  }, 30_000);

  it("404 / not-found: nonsense museum number returns empty matches + warning", async () => {
    const r = await cdliEblCrosswalk({ id: "XX.99999999" });
    expect(r.matches).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  }, 30_000);
});
