// v0.66.0 — Tests for detect_bilingual_tablet.
//
// Mixes pure-unit tests of classifyFromSignal() with live eBL tests against
// the calibration anchors documented in the v0.66 implementation spec.
//
// Live tests use the skipIf(!EBL_REACHABLE) pattern established in
// tests/cdliEblCrosswalk.test.ts so the test suite stays green when eBL
// (hosted at LMU München) is intermittently unreachable.

import { describe, it, expect } from "vitest";

import {
  detectBilingualTablet,
  classifyFromSignal,
  extractPerTabletBilingualSignal,
  resolveGenrePrior,
  type BilingualSignal,
} from "../src/bilingualDetect.js";
import { isBilingualPriorGenre } from "../src/bilingualGenreRegistry.js";

// ─── eBL reachability probe ───────────────────────────────────────────────

async function probeEblReachable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch("https://www.ebl.lmu.de/api/fragments/K.5896", {
      method: "HEAD",
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}
const EBL_REACHABLE = await probeEblReachable();
if (!EBL_REACHABLE) {
  // eslint-disable-next-line no-console
  console.warn(
    "[bilingualDetect.test] eBL (www.ebl.lmu.de) is unreachable; live tests will be skipped.",
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function mkSignal(overrides: Partial<BilingualSignal>): BilingualSignal {
  const base: BilingualSignal = {
    text_line_count: 0,
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
  const merged = { ...base, ...overrides };
  // Auto-compute shares when caller specified token counts but not shares.
  const total = merged.sumerian_token_count + merged.akkadian_token_count;
  if (total > 0 && overrides.sumerian_token_share === undefined) {
    merged.sumerian_token_share = merged.sumerian_token_count / total;
  }
  if (total > 0 && overrides.akkadian_token_share === undefined) {
    merged.akkadian_token_share = merged.akkadian_token_count / total;
  }
  return merged;
}

// ─── Unit tests — classifier branches ────────────────────────────────────

describe("classifyFromSignal — branch coverage", () => {
  it("insufficient_data when text_line_count < 3", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 2,
        sumerian_token_count: 5,
        akkadian_token_count: 5,
      }),
    );
    expect(r.classification).toBe("insufficient_data");
    expect(r.is_bilingual).toBe(false);
  });

  it("insufficient_data when no language-tagged Words exist", () => {
    const r = classifyFromSignal(mkSignal({ text_line_count: 10 }));
    expect(r.classification).toBe("insufficient_data");
  });

  it("interlinear_bilingual when most lines are mixed and shares are balanced", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 8,
        mixed_token_line_count: 8,
        sumerian_token_count: 21,
        akkadian_token_count: 8,
        alternation_pattern: "interlinear",
      }),
    );
    expect(r.classification).toBe("interlinear_bilingual");
    expect(r.is_bilingual).toBe(true);
  });

  it("alternating_line_bilingual when sum-only and akk-only lines flip and no mixed lines", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 62,
        sumerian_only_line_count: 31,
        akkadian_only_line_count: 31,
        mixed_token_line_count: 0,
        sumerian_token_count: 169,
        akkadian_token_count: 211,
        alternation_pattern: "alternating",
      }),
    );
    expect(r.classification).toBe("alternating_line_bilingual");
    expect(r.is_bilingual).toBe(true);
  });

  it("akkadian_with_sumerograms when minor sum share < 20% but some Sumerian-tagged Words present", () => {
    // K.2798 calibration: sum_share = 28/231 = 0.121, below 0.20 threshold,
    // 28 Sumerian tokens still present → akkadian_with_sumerograms.
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 24,
        akkadian_only_line_count: 18,
        mixed_token_line_count: 6,
        sumerian_token_count: 28,
        akkadian_token_count: 203,
      }),
    );
    expect(r.classification).toBe("akkadian_with_sumerograms");
    expect(r.is_bilingual).toBe(false);
  });

  it("monolingual_akkadian when no Sumerian tokens at all", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 72,
        akkadian_only_line_count: 72,
        sumerian_token_count: 0,
        akkadian_token_count: 660,
      }),
    );
    expect(r.classification).toBe("monolingual_akkadian");
  });

  it("monolingual_sumerian when no Akkadian tokens at all", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 30,
        sumerian_only_line_count: 30,
        sumerian_token_count: 250,
        akkadian_token_count: 0,
      }),
    );
    expect(r.classification).toBe("monolingual_sumerian");
  });

  it("sumerogram edge case: 30 Akkadian Words + 2 Sumerian Words → akkadian_with_sumerograms (NOT bilingual)", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 12,
        akkadian_only_line_count: 10,
        mixed_token_line_count: 2,
        sumerian_token_count: 2,
        akkadian_token_count: 30,
      }),
    );
    expect(r.is_bilingual).toBe(false);
    expect(r.classification).toBe("akkadian_with_sumerograms");
  });

  it("uncertain when token shares are decisive on neither side but pattern is unresolved", () => {
    const r = classifyFromSignal(
      mkSignal({
        text_line_count: 10,
        sumerian_token_count: 5,
        akkadian_token_count: 5,
        // mix_ratio=0, no alternation, no sum-only/akk-only lines
        alternation_pattern: "none",
      }),
    );
    // Both shares == 50% → above threshold; mix ratio 0% < 0.3 and no
    // alternation → uncertain.
    expect(r.classification).toBe("uncertain");
  });
});

describe("bilingualGenreRegistry / resolveGenrePrior", () => {
  it("recognizes 'CANONICAL → Literature → Narrative → Lugal-e' as a bilingual prior", () => {
    expect(
      isBilingualPriorGenre("CANONICAL → Literature → Narrative → Lugal-e"),
    ).toBe(true);
  });

  it("recognizes prior-prefix variants (Marduk's Address with subgenre suffix)", () => {
    expect(
      isBilingualPriorGenre(
        "CANONICAL → Magic → Exorcistic → Marduk’s Address to the Demons (Udugḫul 11)",
      ),
    ).toBe(true);
  });

  it("rejects non-prior genres", () => {
    expect(
      isBilingualPriorGenre("ARCHIVAL → Administrative → Receipts"),
    ).toBe(false);
  });

  it("resolveGenrePrior returns bilingual_genre + matched path for a prior hit", () => {
    const r = resolveGenrePrior([
      "CANONICAL → Literature → Narrative → Lugal-e",
    ]);
    expect(r.genre_prior).toBe("bilingual_genre");
    expect(r.genre_path).toBe("CANONICAL → Literature → Narrative → Lugal-e");
  });

  it("resolveGenrePrior returns monolingual_genre for a non-prior canonical genre", () => {
    const r = resolveGenrePrior(["ARCHIVAL → Administrative → Receipts"]);
    expect(r.genre_prior).toBe("monolingual_genre");
  });

  it("resolveGenrePrior returns unknown for empty / missing input", () => {
    expect(resolveGenrePrior(null).genre_prior).toBe("unknown");
    expect(resolveGenrePrior([]).genre_prior).toBe("unknown");
  });
});

describe("extractPerTabletBilingualSignal — synthetic fragment shape", () => {
  it("counts mixed-line tokens and produces an interlinear pattern", () => {
    const fragment = {
      text: {
        lines: [
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "LanguageShift", language: "AKKADIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "Word", language: "AKKADIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "SurfaceAtLine",
            content: [],
          },
        ],
      },
    };
    const s = extractPerTabletBilingualSignal(fragment);
    expect(s.text_line_count).toBe(3);
    expect(s.mixed_token_line_count).toBe(3);
    expect(s.sumerian_token_count).toBe(3);
    // Line 1: 1 AKK Word + 1 LanguageShift (not counted as Word).
    // Line 2: 2 AKK. Line 3: 1 AKK. Total = 4.
    expect(s.akkadian_token_count).toBe(4);
    expect(s.language_shift_count).toBe(1);
    expect(s.alternation_pattern).toBe("interlinear");
  });

  it("EMESAL tokens count as Sumerian-family", () => {
    const fragment = {
      text: {
        lines: [
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "EMESAL" },
              { type: "Word", language: "EMESAL" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "EMESAL" },
              { type: "Word", language: "AKKADIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "EMESAL" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
        ],
      },
    };
    const s = extractPerTabletBilingualSignal(fragment);
    expect(s.sumerian_token_count).toBe(4);
    expect(s.akkadian_token_count).toBe(4);
    expect(s.mixed_token_line_count).toBe(3);
  });

  it("returns zeroed signal for a fragment with no TextLines", () => {
    const s = extractPerTabletBilingualSignal({ text: { lines: [] } });
    expect(s.text_line_count).toBe(0);
    expect(s.sumerian_token_count).toBe(0);
    expect(s.akkadian_token_count).toBe(0);
  });

  it("handles a completely missing text field gracefully", () => {
    const s = extractPerTabletBilingualSignal({});
    expect(s.text_line_count).toBe(0);
  });
});

// ─── Input validation ────────────────────────────────────────────────────

describe("detectBilingualTablet — input validation", () => {
  it("rejects empty / whitespace-only tablet_id", async () => {
    await expect(detectBilingualTablet({ tabletId: "" })).rejects.toThrow(
      /non-empty string/,
    );
    await expect(detectBilingualTablet({ tabletId: "   " })).rejects.toThrow(
      /non-empty string/,
    );
  });

  it("uses preFetchedFragment without hitting the network", async () => {
    const fragment = {
      text: {
        lines: [
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
          {
            type: "TextLine",
            content: [
              { type: "Word", language: "SUMERIAN" },
              { type: "Word", language: "AKKADIAN" },
            ],
          },
        ],
      },
    };
    const r = await detectBilingualTablet({
      tabletId: "SYNTHETIC.1",
      preFetchedFragment: fragment,
    });
    expect(r.tablet_id).toBe("SYNTHETIC.1");
    expect(r.classification).toBe("interlinear_bilingual");
    expect(r.is_bilingual).toBe(true);
    expect(r.signal.text_line_count).toBe(3);
  });
});

// ─── Live tests — validation anchors ─────────────────────────────────────

describe("detectBilingualTablet — live anchors", () => {
  it.skipIf(!EBL_REACHABLE)(
    "K.4178 (Lugal-e) → interlinear_bilingual",
    async () => {
      const r = await detectBilingualTablet({ tabletId: "K.4178" });
      expect(r.classification).toBe("interlinear_bilingual");
      expect(r.is_bilingual).toBe(true);
      expect(r.signal.text_line_count).toBeGreaterThanOrEqual(3);
      expect(r.signal.mixed_token_line_count).toBeGreaterThan(0);
    },
    30_000,
  );

  it.skipIf(!EBL_REACHABLE)(
    "K.133 (Lugal-e) → alternating_line_bilingual",
    async () => {
      const r = await detectBilingualTablet({ tabletId: "K.133" });
      expect(r.classification).toBe("alternating_line_bilingual");
      expect(r.is_bilingual).toBe(true);
      expect(r.signal.sumerian_only_line_count).toBeGreaterThanOrEqual(3);
      expect(r.signal.akkadian_only_line_count).toBeGreaterThanOrEqual(3);
      expect(r.signal.mixed_token_line_count).toBe(0);
    },
    30_000,
  );

  it.skipIf(!EBL_REACHABLE)(
    "K.2798 (Bīt salāʾ mê) → akkadian_with_sumerograms (NOT bilingual)",
    async () => {
      const r = await detectBilingualTablet({ tabletId: "K.2798" });
      expect(r.is_bilingual).toBe(false);
      // The discriminator IS the load-bearing claim: per-Word language tags
      // separate sumerographic spelling from true bilinguals.
      expect(r.classification).toBe("akkadian_with_sumerograms");
      expect(r.signal.sumerian_token_share).toBeLessThan(0.2);
    },
    30_000,
  );

  it.skipIf(!EBL_REACHABLE)(
    "K.4928 → insufficient_data (textLines: 0 — must NOT misclassify)",
    async () => {
      const r = await detectBilingualTablet({ tabletId: "K.4928" });
      expect(r.classification).toBe("insufficient_data");
      expect(r.signal.text_line_count).toBe(0);
    },
    30_000,
  );

  // Monolingual-Sumerian anchor: the spec acknowledges this is hard to find
  // quickly via a deterministic probe (most lexicography tablets are
  // bilingual; Sumerian-only literary tablets are uncommon in eBL). Park
  // as it.todo per spec guidance.
  it.todo(
    "monolingual_sumerian anchor — find a Sumerian-only literary witness in eBL",
  );
});
