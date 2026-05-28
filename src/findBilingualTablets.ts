// v0.66.0 — find_bilingual_tablets
//
// Cache-backed corpus-wide surface over the bilingual-index produced by
// scripts/build-bilingual-index.mjs. The cache lives at
// ~/.cache/cuneiform-mcp/bilingual-index.json — one entry per probed
// tablet, where each entry stores the BilingualSignal + classification
// label so this tool can rank without re-fetching live eBL data.
//
// Cache shape:
//   {
//     "version": "1.0.0",
//     "built_at": "<iso>",
//     "source": "eBL /fragments/{id} → text.lines[].content[] tokens",
//     "entries": {
//       "K.4178": { classification, signal, genre_path, is_bilingual, reasoning },
//       "K.133":  { ... },
//       ...
//     }
//   }
//
// When the cache is absent or empty the tool returns an explicit
// empty-result envelope with a warning telling the caller how to build
// it — never crashes the caller.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type {
  BilingualClassification,
  BilingualSignal,
} from "./bilingualDetect.js";

const BILINGUAL_INDEX_FILE = "bilingual-index.json";

// ─── Cache types ───────────────────────────────────────────────────────────

export type BilingualIndexEntry = {
  classification: BilingualClassification;
  is_bilingual: boolean;
  signal: BilingualSignal;
  genre_path: string | null;
  reasoning?: string[];
  warnings?: string[];
};

export type BilingualIndex = {
  version: string;
  built_at: string;
  source: string;
  entries: Record<string, BilingualIndexEntry>;
};

// ─── Public types ──────────────────────────────────────────────────────────

export type FindBilingualTabletsCandidate = {
  tablet_id: string;
  classification: BilingualClassification;
  genre_path: string | null;
  text_line_count: number;
  sumerian_token_share: number;
  akkadian_token_share: number;
  alternation_pattern: string;
  confidence: number;
};

export type FindBilingualTabletsResult = {
  query: {
    top_k: number;
    classification_filter: string[] | null;
    min_confidence: number;
  };
  tablets: FindBilingualTabletsCandidate[];
  cache_stats: {
    cache_path: string;
    cache_exists: boolean;
    cache_built_at: string | null;
    tablets_in_cache: number;
    tablets_classified_bilingual: number;
  };
  warnings: string[];
};

export type FindBilingualTabletsOptions = {
  topK?: number;
  classificationFilter?: string[];
  minConfidence?: number;
};

// ─── Cache loader ──────────────────────────────────────────────────────────

function cacheDir(): string {
  return (
    process.env.CUNEIFORM_MCP_CACHE_DIR ||
    join(homedir(), ".cache", "cuneiform-mcp")
  );
}

function cachePath(): string {
  return join(cacheDir(), BILINGUAL_INDEX_FILE);
}

type LoadOutcome =
  | { ok: true; index: BilingualIndex; path: string }
  | { ok: false; reason: "missing" | "malformed"; path: string; error?: string };

let _cached: BilingualIndex | null = null;
let _attempted = false;

function loadIndex(): LoadOutcome {
  const path = cachePath();
  if (_cached) return { ok: true, index: _cached, path };
  if (_attempted && !_cached) {
    if (!existsSync(path)) return { ok: false, reason: "missing", path };
  }
  _attempted = true;
  if (!existsSync(path)) return { ok: false, reason: "missing", path };
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BilingualIndex>;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.entries !== "object" ||
      parsed.entries === null
    ) {
      return { ok: false, reason: "malformed", path, error: "entries field invalid" };
    }
    const idx: BilingualIndex = {
      version: typeof parsed.version === "string" ? parsed.version : "0.0.0",
      built_at: typeof parsed.built_at === "string" ? parsed.built_at : "",
      source: typeof parsed.source === "string" ? parsed.source : "",
      entries: parsed.entries as Record<string, BilingualIndexEntry>,
    };
    _cached = idx;
    return { ok: true, index: idx, path };
  } catch (e) {
    return {
      ok: false,
      reason: "malformed",
      path,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Reset module-level cache. Tests only. */
export function _resetForTests(): void {
  _cached = null;
  _attempted = false;
}

// ─── Confidence scoring ────────────────────────────────────────────────────

/**
 * Composite confidence in [0, 1]. Two ingredients:
 *
 *   1. Threshold gap: how far the dominant token share sits above the
 *      bilingual decision threshold (0.20). For bilinguals, larger
 *      shares of the MINOR language imply a more confident bilingual call.
 *      For monolinguals, the gap is measured the opposite way (how far
 *      below 0.20 the minor-language share sits).
 *   2. Token-share balance: 2 * min(sum, akk) — a perfectly balanced
 *      bilingual (50/50) scores 1.0, a 80/20 split scores 0.4.
 *
 * The two are averaged. The aggregate is then clamped to [0, 1].
 */
export function computeConfidence(entry: BilingualIndexEntry): number {
  const sig = entry.signal;
  const min = Math.min(sig.sumerian_token_share, sig.akkadian_token_share);
  const max = Math.max(sig.sumerian_token_share, sig.akkadian_token_share);
  const THRESHOLD = 0.2;

  const balance = Math.min(1, 2 * min);

  let gap = 0;
  if (entry.is_bilingual) {
    // Minor language must be ABOVE threshold — measure distance above.
    gap = Math.min(1, Math.max(0, (min - THRESHOLD) / (0.5 - THRESHOLD)));
  } else {
    // Minor language is BELOW threshold OR text_line_count too small.
    if (sig.text_line_count < 3) {
      return 0; // insufficient_data has zero confidence.
    }
    gap = Math.min(
      1,
      Math.max(0, (max - 0.5) / 0.5), // dominant share's distance above 50%
    );
  }

  return Math.max(0, Math.min(1, 0.5 * (balance + gap)));
}

// ─── Public entry point ────────────────────────────────────────────────────

const BILINGUAL_CLASSIFICATIONS: BilingualClassification[] = [
  "interlinear_bilingual",
  "alternating_line_bilingual",
];

export function findBilingualTablets(
  opts: FindBilingualTabletsOptions = {},
): FindBilingualTabletsResult {
  const topK = Math.max(1, Math.min(1000, opts.topK ?? 50));
  const minConfidence = Math.max(0, Math.min(1, opts.minConfidence ?? 0));
  const classificationFilter =
    Array.isArray(opts.classificationFilter) && opts.classificationFilter.length > 0
      ? opts.classificationFilter.slice()
      : null;
  const warnings: string[] = [];

  const outcome = loadIndex();
  if (!outcome.ok) {
    if (outcome.reason === "missing") {
      warnings.push(
        `bilingual index not built: ${outcome.path} missing — run \`node scripts/build-bilingual-index.mjs\` to populate the cache (3-4 hour wall-clock job for the full ~4,370-tablet bilingual-genre prior).`,
      );
      return {
        query: {
          top_k: topK,
          classification_filter: classificationFilter,
          min_confidence: minConfidence,
        },
        tablets: [],
        cache_stats: {
          cache_path: outcome.path,
          cache_exists: false,
          cache_built_at: null,
          tablets_in_cache: 0,
          tablets_classified_bilingual: 0,
        },
        warnings,
      };
    }
    // malformed
    warnings.push(
      `bilingual index unreadable: ${outcome.path} (${outcome.error ?? "unknown error"}). Rebuild with \`node scripts/build-bilingual-index.mjs\`.`,
    );
    return {
      query: {
        top_k: topK,
        classification_filter: classificationFilter,
        min_confidence: minConfidence,
      },
      tablets: [],
      cache_stats: {
        cache_path: outcome.path,
        cache_exists: true,
        cache_built_at: null,
        tablets_in_cache: 0,
        tablets_classified_bilingual: 0,
      },
      warnings,
    };
  }

  const idx = outcome.index;
  const entries = idx.entries;
  const allIds = Object.keys(entries);
  let bilingualCount = 0;

  const targetClassifications = classificationFilter ?? BILINGUAL_CLASSIFICATIONS;
  const targetSet = new Set(targetClassifications);

  const candidates: FindBilingualTabletsCandidate[] = [];
  for (const id of allIds) {
    const e = entries[id];
    if (!e || typeof e !== "object") continue;
    if (e.is_bilingual) bilingualCount++;
    if (!targetSet.has(e.classification)) continue;
    const confidence = computeConfidence(e);
    if (confidence < minConfidence) continue;
    candidates.push({
      tablet_id: id,
      classification: e.classification,
      genre_path: e.genre_path ?? null,
      text_line_count: e.signal?.text_line_count ?? 0,
      sumerian_token_share: e.signal?.sumerian_token_share ?? 0,
      akkadian_token_share: e.signal?.akkadian_token_share ?? 0,
      alternation_pattern: e.signal?.alternation_pattern ?? "none",
      confidence,
    });
  }

  candidates.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.text_line_count - a.text_line_count ||
      a.tablet_id.localeCompare(b.tablet_id),
  );
  const limited = candidates.slice(0, topK);

  if (allIds.length === 0) {
    warnings.push(
      `bilingual index is present but empty. Run \`node scripts/build-bilingual-index.mjs\` to populate.`,
    );
  } else if (bilingualCount === 0) {
    warnings.push(
      `${allIds.length} tablets indexed but none classified bilingual — the prior-genre pool may need a wider scan or the threshold tuned.`,
    );
  }

  return {
    query: {
      top_k: topK,
      classification_filter: classificationFilter,
      min_confidence: minConfidence,
    },
    tablets: limited,
    cache_stats: {
      cache_path: outcome.path,
      cache_exists: true,
      cache_built_at: idx.built_at || null,
      tablets_in_cache: allIds.length,
      tablets_classified_bilingual: bilingualCount,
    },
    warnings,
  };
}
