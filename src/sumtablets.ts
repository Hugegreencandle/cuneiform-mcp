// SumTablets search surface (v0.79.0).
//
// SumTablets (Simmons, Diehl-Martinez & Jurafsky — "SumTablets: A Transliteration
// Dataset of Sumerian Tablets", ML4AL @ ACL 2024; HF colesimmons/SumTablets,
// CC-BY-4.0) is a corpus of Sumerian tablet transliterations with CDLI P-number
// ids, period, genre, transliteration, and Unicode glyphs.
//
// The generic chunk tools (find_chunk_parallels et al.) host the ABZ-converted
// SumTablets tablets but do NOT expose their rich native metadata. This module
// backs search_sumtablets, which filters the cached metadata sidecar by
// id / period / genre / transliteration substring. The sidecar
// (~/.cache/cuneiform-mcp/sumtablets-meta.json) is produced build-time by
// scripts/build-sumtablets-signs.mjs — the server reads JSON, never parquet, so
// hyparquet stays a dev-only dependency.
//
// HONESTY: Sumerian tablets are NOT eBL compositions. This tool surfaces native
// SumTablets metadata only; it fabricates no composition assignment.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { corpusCacheDir } from "./corpusSource.js";

export const SUMTABLETS_META_FILE = "sumtablets-meta.json";

export type SumtabletsRecord = {
  id: string;
  period: string | null;
  genre: string | null;
  transliteration: string;
};

export type SumtabletsMeta = {
  version: string;
  built_at: string;
  source: string;
  count: number;
  period_distribution: Record<string, number>;
  genre_distribution: Record<string, number>;
  records: SumtabletsRecord[];
};

let cached: SumtabletsMeta | null | undefined;

export function loadSumtabletsMeta(cacheDirOverride?: string): SumtabletsMeta | null {
  if (cached !== undefined && !cacheDirOverride) return cached;
  const dir = cacheDirOverride || corpusCacheDir();
  const path = join(dir, SUMTABLETS_META_FILE);
  if (!existsSync(path)) {
    if (!cacheDirOverride) cached = null;
    return null;
  }
  try {
    const doc = JSON.parse(readFileSync(path, "utf-8")) as SumtabletsMeta;
    if (!cacheDirOverride) cached = doc;
    return doc;
  } catch {
    if (!cacheDirOverride) cached = null;
    return null;
  }
}

export type SearchSumtabletsArgs = {
  id?: string;
  period?: string;
  genre?: string;
  transliteration_contains?: string;
  limit?: number;
};

export type SearchSumtabletsResult = {
  available: boolean;
  total_corpus: number;
  match_count: number;
  returned: number;
  results: SumtabletsRecord[];
  period_distribution: Record<string, number>;
  genre_distribution: Record<string, number>;
  filters_applied: Record<string, string>;
  warnings: string[];
};

export function searchSumtablets(
  args: SearchSumtabletsArgs,
  cacheDirOverride?: string,
): SearchSumtabletsResult {
  const limit = Math.max(1, Math.min(args.limit ?? 25, 200));
  const meta = loadSumtabletsMeta(cacheDirOverride);
  if (!meta) {
    return {
      available: false,
      total_corpus: 0,
      match_count: 0,
      returned: 0,
      results: [],
      period_distribution: {},
      genre_distribution: {},
      filters_applied: {},
      warnings: [
        "SumTablets metadata cache (sumtablets-meta.json) not found. Run: node scripts/fetch-sumtablets.mjs && node scripts/build-sumtablets-abz-map.mjs && node scripts/build-sumtablets-signs.mjs",
      ],
    };
  }

  const idQ = args.id?.trim().toLowerCase();
  const periodQ = args.period?.trim().toLowerCase();
  const genreQ = args.genre?.trim().toLowerCase();
  const tlQ = args.transliteration_contains?.trim().toLowerCase();

  const filters: Record<string, string> = {};
  if (args.id) filters.id = args.id;
  if (args.period) filters.period = args.period;
  if (args.genre) filters.genre = args.genre;
  if (args.transliteration_contains)
    filters.transliteration_contains = args.transliteration_contains;

  const matched: SumtabletsRecord[] = [];
  const matchedPeriod = new Map<string, number>();
  const matchedGenre = new Map<string, number>();

  for (const r of meta.records) {
    if (idQ && !r.id.toLowerCase().includes(idQ)) continue;
    if (periodQ && !(r.period ?? "").toLowerCase().includes(periodQ)) continue;
    if (genreQ && !(r.genre ?? "").toLowerCase().includes(genreQ)) continue;
    if (tlQ && !r.transliteration.toLowerCase().includes(tlQ)) continue;
    matched.push(r);
    if (r.period) matchedPeriod.set(r.period, (matchedPeriod.get(r.period) || 0) + 1);
    if (r.genre) matchedGenre.set(r.genre, (matchedGenre.get(r.genre) || 0) + 1);
  }

  const warnings: string[] = [];
  // Surface the severe corpus skew so callers don't over-read repetitive admin.
  const total = meta.count || meta.records.length;
  const topPeriod = Object.entries(meta.period_distribution).sort((a, b) => b[1] - a[1])[0];
  const topGenre = Object.entries(meta.genre_distribution).sort((a, b) => b[1] - a[1])[0];
  if (topPeriod && topPeriod[1] / total > 0.5)
    warnings.push(
      `Corpus skew: ${topPeriod[0]} dominates (${((100 * topPeriod[1]) / total).toFixed(0)}% of tablets). Period filtering recommended for non-Ur-III work.`,
    );
  if (topGenre && topGenre[1] / total > 0.5)
    warnings.push(
      `Genre skew: ${topGenre[0]} dominates (${((100 * topGenre[1]) / total).toFixed(0)}% of tablets) — shared chunks are dominated by repetitive admin formulae, not philological parallels.`,
    );

  return {
    available: true,
    total_corpus: total,
    match_count: matched.length,
    returned: Math.min(matched.length, limit),
    results: matched.slice(0, limit),
    period_distribution: Object.fromEntries(
      [...matchedPeriod.entries()].sort((a, b) => b[1] - a[1]),
    ),
    genre_distribution: Object.fromEntries(
      [...matchedGenre.entries()].sort((a, b) => b[1] - a[1]),
    ),
    filters_applied: filters,
    warnings,
  };
}
