// v0.66.0 — detect_bilingual_tablet
//
// Single-tablet Sumerian/Akkadian bilingual classifier. Hits eBL's
// /fragments/{museum_number} endpoint live (no cache dependency) and walks
// `text.lines[].content[]` — eBL's lemmatized line-token tree — to count
// per-Word language tags. Per the verified data path:
//
//   response.text.lines[]
//     └─ .type === "TextLine"
//     └─ .content[]
//          ├─ .type === "LanguageShift" → .language ∈ {SUMERIAN, AKKADIAN, EMESAL}
//          └─ .type === "Word"          → .language ∈ {SUMERIAN, AKKADIAN, EMESAL}
//
// The load-bearing discrimination is per-Word `.language`. eBL's lemmatizer
// correctly tags a sumerogram such as `EN₂` (functioning as the Akkadian
// logogram for `šiptu`) with `language: AKKADIAN` and `uniqueLemma`
// pointing to the Akkadian dictionary entry. This separates a true
// bilingual line (where some Words are tagged SUMERIAN and others
// AKKADIAN) from "Akkadian written with sumerograms" (where the surface
// looks Sumerian but every Word is tagged AKKADIAN).
//
// Classifier output is deliberately conservative — when the signal is
// ambiguous, we prefer "uncertain" or "insufficient_data" over a false
// positive bilingual call. Empty / lemma-bare fragments (e.g. K.4928 with
// textLines: 0) return "insufficient_data" rather than being misclassified.

import {
  isBilingualPriorGenre,
  matchBilingualPriorGenre,
} from "./bilingualGenreRegistry.js";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const DEFAULT_TIMEOUT_MS = 15_000;

// ─── Public types ──────────────────────────────────────────────────────────

export type BilingualClassification =
  | "interlinear_bilingual"
  | "alternating_line_bilingual"
  | "akkadian_with_sumerograms"
  | "monolingual_sumerian"
  | "monolingual_akkadian"
  | "insufficient_data"
  | "uncertain";

export type AlternationPattern =
  | "alternating"
  | "interlinear"
  | "sequential"
  | "none";

export type GenrePrior = "bilingual_genre" | "monolingual_genre" | "unknown";

export type BilingualSignal = {
  text_line_count: number;
  sumerian_only_line_count: number;
  akkadian_only_line_count: number;
  mixed_token_line_count: number;
  sumerian_token_count: number;
  akkadian_token_count: number;
  sumerian_token_share: number;
  akkadian_token_share: number;
  language_shift_count: number;
  alternation_pattern: AlternationPattern;
  genre_prior: GenrePrior;
  genre_path: string | null;
};

export type DetectBilingualTabletResult = {
  tablet_id: string;
  is_bilingual: boolean;
  classification: BilingualClassification;
  signal: BilingualSignal;
  reasoning: string[];
  warnings: string[];
};

export type DetectBilingualTabletOptions = {
  tabletId: string;
  /** User-Agent header sent to eBL. Defaults to a generic v0.66 string. */
  userAgent?: string;
  /** Override timeout for the /fragments/{id} call (ms). */
  timeoutMs?: number;
  /**
   * Optional pre-fetched eBL fragment payload — used by the cache builder
   * so we don't double-fetch. When supplied, no live HTTP is made.
   */
  preFetchedFragment?: unknown;
  /** Optional override of the genre prior — used by tests. */
  genreHint?: GenrePrior;
  /** Optional override of the genre path — used by tests. */
  genrePath?: string | null;
};

// ─── HTTP fetch (eBL) ──────────────────────────────────────────────────────

async function fetchEblFragmentLive(
  tabletId: string,
  userAgent: string,
  timeoutMs: number,
): Promise<{ ok: true; data: unknown } | { ok: false; status: number | null; error: string }> {
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(tabletId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── Per-line tokenizer ────────────────────────────────────────────────────

type EblToken = {
  type?: string;
  language?: string;
  uniqueLemma?: unknown;
};

type EblLine = {
  type?: string;
  content?: EblToken[];
};

type EblFragment = {
  text?: {
    lines?: EblLine[];
  };
};

/**
 * Walk an eBL fragment payload and count per-line language tags. EMESAL
 * (a Sumerian sociolect used in cultic and lamentation registers) is
 * folded into the SUMERIAN bucket — the bilingual question is "is there
 * a non-Akkadian language layer?" and Emesal answers yes.
 */
export function extractPerTabletBilingualSignal(
  fragmentData: unknown,
): Omit<BilingualSignal, "genre_prior" | "genre_path"> {
  const lines = ((fragmentData as EblFragment)?.text?.lines ?? []) as EblLine[];
  const textLines = lines.filter((l) => l?.type === "TextLine");

  let sumOnly = 0;
  let akkOnly = 0;
  let mixed = 0;
  let sumTok = 0;
  let akkTok = 0;
  let shifts = 0;

  // Track which lines are sum-only vs akk-only in order, so we can detect
  // the alternating-vs-sequential pattern downstream.
  const lineLanguages: ("SUM" | "AKK" | "MIX" | "NONE")[] = [];

  for (const tl of textLines) {
    const content = tl.content ?? [];
    let s = 0;
    let a = 0;
    for (const tk of content) {
      if (tk?.type === "LanguageShift") {
        shifts++;
        continue;
      }
      if (tk?.type !== "Word") continue;
      const lang = tk.language;
      if (lang === "SUMERIAN" || lang === "EMESAL") {
        s++;
      } else if (lang === "AKKADIAN") {
        a++;
      }
    }
    sumTok += s;
    akkTok += a;
    if (s > 0 && a > 0) {
      mixed++;
      lineLanguages.push("MIX");
    } else if (s > 0) {
      sumOnly++;
      lineLanguages.push("SUM");
    } else if (a > 0) {
      akkOnly++;
      lineLanguages.push("AKK");
    } else {
      lineLanguages.push("NONE");
    }
  }

  const total = sumTok + akkTok;
  const sumShare = total > 0 ? sumTok / total : 0;
  const akkShare = total > 0 ? akkTok / total : 0;

  // Alternation pattern detection. We classify the SEQUENCE of sum/akk
  // single-language lines (ignoring MIX and NONE):
  //   - alternating: at least 3 SUM and 3 AKK, and adjacent pairs flip
  //     (SUM→AKK or AKK→SUM) for ≥80% of transitions in the filtered
  //     sequence.
  //   - sequential: at least 3 SUM and 3 AKK but they cluster in two
  //     contiguous blocks instead of flipping.
  //   - interlinear: mixed_token_line_count / text_line_count >= 0.5
  //   - none: otherwise.
  let alternation: AlternationPattern = "none";
  const filtered = lineLanguages.filter((l) => l === "SUM" || l === "AKK") as (
    | "SUM"
    | "AKK"
  )[];
  if (textLines.length > 0 && mixed / textLines.length >= 0.5) {
    alternation = "interlinear";
  } else if (filtered.length >= 6 && sumOnly >= 3 && akkOnly >= 3) {
    let flips = 0;
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i] !== filtered[i - 1]) flips++;
    }
    const flipRate = flips / (filtered.length - 1);
    alternation = flipRate >= 0.8 ? "alternating" : "sequential";
  }

  return {
    text_line_count: textLines.length,
    sumerian_only_line_count: sumOnly,
    akkadian_only_line_count: akkOnly,
    mixed_token_line_count: mixed,
    sumerian_token_count: sumTok,
    akkadian_token_count: akkTok,
    sumerian_token_share: sumShare,
    akkadian_token_share: akkShare,
    language_shift_count: shifts,
    alternation_pattern: alternation,
  };
}

// ─── Classifier ────────────────────────────────────────────────────────────

/**
 * Thresholds calibrated against the validation anchors (see test file). Two
 * key calibration points:
 *
 *   - K.4178 (Lugal-e): 8/8 textLines are mixed, sumShare=72% — clear
 *     interlinear_bilingual.
 *   - K.133 (Lugal-e): 31 sum-only + 31 akk-only lines, 0 mixed —
 *     alternating_line_bilingual.
 *   - K.2798 (Bīt salāʾ mê): sumShare = 28/231 = 12.1%, sumOnly = 0, 18 of
 *     24 lines are akk-only — must NOT misclassify as bilingual despite
 *     the 12% token share. Calibrated SUM_SHARE_THRESHOLD = 0.20 (above
 *     K.2798's 12.1%, below K.4178's 72%).
 */
const MIN_TEXT_LINES = 3;
const SUM_SHARE_THRESHOLD = 0.2;
const AKK_SHARE_THRESHOLD = 0.2;
const INTERLINEAR_MIX_RATIO = 0.6;

export type ClassifyFromSignalResult = {
  classification: BilingualClassification;
  is_bilingual: boolean;
  reasoning: string[];
};

export function classifyFromSignal(
  signal: BilingualSignal,
): ClassifyFromSignalResult {
  const reasoning: string[] = [];
  const total = signal.sumerian_token_count + signal.akkadian_token_count;

  if (signal.text_line_count < MIN_TEXT_LINES) {
    reasoning.push(
      `text_line_count=${signal.text_line_count} < ${MIN_TEXT_LINES} — insufficient_data`,
    );
    return { classification: "insufficient_data", is_bilingual: false, reasoning };
  }
  if (total === 0) {
    reasoning.push(
      `no language-tagged Words across ${signal.text_line_count} TextLines — insufficient_data`,
    );
    return { classification: "insufficient_data", is_bilingual: false, reasoning };
  }

  const mixRatio =
    signal.text_line_count > 0
      ? signal.mixed_token_line_count / signal.text_line_count
      : 0;

  // Bilingual? Both shares must clear the threshold.
  const bothLanguagesPresent =
    signal.sumerian_token_share >= SUM_SHARE_THRESHOLD &&
    signal.akkadian_token_share >= AKK_SHARE_THRESHOLD;

  if (bothLanguagesPresent) {
    if (mixRatio >= INTERLINEAR_MIX_RATIO) {
      reasoning.push(
        `mixed-line ratio ${(mixRatio * 100).toFixed(1)}% ≥ ${(INTERLINEAR_MIX_RATIO * 100).toFixed(0)}% — interlinear_bilingual`,
      );
      reasoning.push(
        `sum_share=${(signal.sumerian_token_share * 100).toFixed(1)}% / akk_share=${(signal.akkadian_token_share * 100).toFixed(1)}%`,
      );
      return {
        classification: "interlinear_bilingual",
        is_bilingual: true,
        reasoning,
      };
    }
    if (
      signal.sumerian_only_line_count >= 3 &&
      signal.akkadian_only_line_count >= 3 &&
      signal.mixed_token_line_count === 0
    ) {
      reasoning.push(
        `${signal.sumerian_only_line_count} sum-only + ${signal.akkadian_only_line_count} akk-only lines + 0 mixed — alternating_line_bilingual`,
      );
      reasoning.push(`alternation_pattern=${signal.alternation_pattern}`);
      return {
        classification: "alternating_line_bilingual",
        is_bilingual: true,
        reasoning,
      };
    }
    // Both languages clear threshold but the line-level pattern is unclear.
    if (signal.alternation_pattern === "alternating") {
      reasoning.push(
        "both languages above threshold + alternation_pattern=alternating — alternating_line_bilingual",
      );
      return {
        classification: "alternating_line_bilingual",
        is_bilingual: true,
        reasoning,
      };
    }
    if (signal.alternation_pattern === "interlinear" || mixRatio >= 0.3) {
      reasoning.push(
        `both languages above threshold + mix_ratio=${(mixRatio * 100).toFixed(1)}% — interlinear_bilingual (sub-threshold mix ratio)`,
      );
      return {
        classification: "interlinear_bilingual",
        is_bilingual: true,
        reasoning,
      };
    }
    reasoning.push(
      `both languages above threshold but pattern unresolved (mix_ratio=${(mixRatio * 100).toFixed(1)}%, alternation=${signal.alternation_pattern}) — uncertain`,
    );
    return { classification: "uncertain", is_bilingual: false, reasoning };
  }

  // Akkadian-dominant branch. If there are ANY SUMERIAN-tagged Words, flag
  // the sumerogram sub-class so reviewers know the surface includes
  // logograms (functionally Akkadian per the lemmatizer).
  if (signal.sumerian_token_share < SUM_SHARE_THRESHOLD) {
    if (signal.akkadian_token_count === 0) {
      reasoning.push(
        `sum_share=${(signal.sumerian_token_share * 100).toFixed(1)}% < ${(SUM_SHARE_THRESHOLD * 100).toFixed(0)}% AND no Akkadian tokens — monolingual_sumerian`,
      );
      return {
        classification: "monolingual_sumerian",
        is_bilingual: false,
        reasoning,
      };
    }
    if (signal.sumerian_token_count > 0) {
      reasoning.push(
        `sum_share=${(signal.sumerian_token_share * 100).toFixed(1)}% < ${(SUM_SHARE_THRESHOLD * 100).toFixed(0)}% AND ${signal.sumerian_token_count} sumerogram-tagged Words present — akkadian_with_sumerograms`,
      );
      return {
        classification: "akkadian_with_sumerograms",
        is_bilingual: false,
        reasoning,
      };
    }
    reasoning.push(
      `no Sumerian tokens, ${signal.akkadian_token_count} Akkadian tokens — monolingual_akkadian`,
    );
    return {
      classification: "monolingual_akkadian",
      is_bilingual: false,
      reasoning,
    };
  }

  // Sumerian-dominant branch (Akkadian share below threshold).
  if (signal.akkadian_token_share < AKK_SHARE_THRESHOLD) {
    reasoning.push(
      `akk_share=${(signal.akkadian_token_share * 100).toFixed(1)}% < ${(AKK_SHARE_THRESHOLD * 100).toFixed(0)}% — monolingual_sumerian`,
    );
    return {
      classification: "monolingual_sumerian",
      is_bilingual: false,
      reasoning,
    };
  }

  reasoning.push(
    `share split not decisive (sum=${(signal.sumerian_token_share * 100).toFixed(1)}%, akk=${(signal.akkadian_token_share * 100).toFixed(1)}%) — uncertain`,
  );
  return { classification: "uncertain", is_bilingual: false, reasoning };
}

// ─── Public entry point ────────────────────────────────────────────────────

export async function detectBilingualTablet(
  opts: DetectBilingualTabletOptions,
): Promise<DetectBilingualTabletResult> {
  const tabletId = (opts.tabletId ?? "").trim();
  if (tabletId.length === 0) {
    throw new Error("detect_bilingual_tablet: tablet_id must be a non-empty string.");
  }
  const ua =
    opts.userAgent ?? "cuneiform-mcp/0.66.0 (detect_bilingual_tablet)";
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const warnings: string[] = [];

  // Genre prior is informational only — never gates the classification.
  // It is filled by callers (e.g. find_bilingual_tablets reads it from
  // fragment-metadata.json) or supplied via the test hooks.
  let genrePrior: GenrePrior = opts.genreHint ?? "unknown";
  let genrePath: string | null = opts.genrePath ?? null;

  // Live HTTP unless caller passed pre-fetched data.
  let fragmentData: unknown = opts.preFetchedFragment ?? null;
  if (!fragmentData) {
    const res = await fetchEblFragmentLive(tabletId, ua, timeoutMs);
    if (!res.ok) {
      warnings.push(
        `eBL /fragments/${tabletId} fetch failed: ${res.error}${res.status ? ` (HTTP ${res.status})` : ""}`,
      );
      const emptySignal: BilingualSignal = {
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
        genre_prior: genrePrior,
        genre_path: genrePath,
      };
      return {
        tablet_id: tabletId,
        is_bilingual: false,
        classification: "insufficient_data",
        signal: emptySignal,
        reasoning: ["upstream fetch failed — insufficient_data"],
        warnings,
      };
    }
    fragmentData = res.data;
  }

  const baseSignal = extractPerTabletBilingualSignal(fragmentData);
  const signal: BilingualSignal = {
    ...baseSignal,
    genre_prior: genrePrior,
    genre_path: genrePath,
  };

  const { classification, is_bilingual, reasoning } = classifyFromSignal(signal);

  if (genrePrior === "bilingual_genre" && !is_bilingual) {
    reasoning.push(
      `note: genre_prior='bilingual_genre' (${genrePath ?? "unknown path"}) but signal does not support a bilingual call`,
    );
  }

  return {
    tablet_id: tabletId,
    is_bilingual,
    classification,
    signal,
    reasoning,
    warnings,
  };
}

// ─── Genre-prior helper for callers (used by find_bilingual_tablets) ──────

/**
 * Resolve a genre prior from a fragment-metadata genres[] list. Surfaces
 * both the prior label and the matching genre path so reasoning chains
 * can attribute the prior to a specific genre.
 */
export function resolveGenrePrior(
  genres: readonly string[] | undefined | null,
): { genre_prior: GenrePrior; genre_path: string | null } {
  if (!Array.isArray(genres) || genres.length === 0) {
    return { genre_prior: "unknown", genre_path: null };
  }
  const match = matchBilingualPriorGenre(genres);
  if (match) return { genre_prior: "bilingual_genre", genre_path: match };
  // Any other recognized canonical genre is "monolingual_genre" by exclusion.
  for (const g of genres) {
    if (typeof g === "string" && g.length > 0 && !isBilingualPriorGenre(g)) {
      return { genre_prior: "monolingual_genre", genre_path: g };
    }
  }
  return { genre_prior: "unknown", genre_path: null };
}
