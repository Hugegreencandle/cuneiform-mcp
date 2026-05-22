// v0.18.14 — Genre-based discovery over the enriched fragment-metadata cache.
//
// Answers the methods-paper-aligned question "find all tablets of genre X in
// the corpus" — e.g. "all Mīs pî tablets", "all Šuʾila prayers", "all Maqlû
// rituals". Companion to coverage_stats_for_collection's per-prefix
// genre_distribution (which counts by genre) and to reconstruct_cluster
// (which works from a seed). Where those tools answer "what genres exist
// here?" and "what's adjacent to seed X?", this tool answers "give me the
// per-genre witness list across the entire corpus".
//
// Motivation: the BM.77056 *āšipūtu* cluster survey (2026-05-22) revealed
// 20-prefix spread, but the per-genre breakdown ("of those 100+ tablets,
// which are Mīs pî vs. Šuʾila vs. Bīt rimki?") required manual probing.
// This tool surfaces per-genre witness lists in a single call, sorted by
// sign_count desc so the largest/most-informative witnesses surface first.
//
// Critical caveat: matching runs against the enriched fragment-metadata
// cache (see fragmentMetadata.ts). As of v0.18.13 the cache holds only
// ~0.6% of the corpus (~226 of ~36,500 tablets). Most tablets will be
// silently skipped because their genre is unknown. The tool emits a
// coverage warning when fewer than ~10% of scanned tablets have metadata.
// Run enrich_prefix_metadata(prefix_filter="X") to backfill specific
// prefixes before running broad genre queries.
//
// Algorithm:
//   1. Iterate getAllTabletRecords() from anomalySurface
//   2. Optional prefix-filter narrowing
//   3. For each candidate, fetch FragmentMetadata via getFragmentMetadata
//   4. If metadata + genres present, test pattern against genres[] (full
//      hierarchy strings) AND genres_flat[] (per-category strings) using
//      case-insensitive includes() — unless include_subgenres=false, in
//      which case only genres_flat[] is tested (treated as category-exact)
//   5. Apply min_sign_count filter
//   6. Sort by sign_count desc; cap at top_n
//   7. Build per-prefix + per-period distributions over ALL matches (not
//      just the returned slice)
//
// Pure stdlib + read-only access to the anomaly index and metadata cache.

import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
  metadataCoverage,
  type FragmentMetadata,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type GenreMatch = {
  tablet_id: string;
  prefix: string;
  designation: string | null;
  sign_count: number;
  period: string | null;
  city: string | null;
  genres: string[]; // full hierarchy strings, e.g. "CANONICAL → Magic → Purification → Mīs pî"
  in_lex_graph: boolean;
};

export type FindTabletsByGenreSummary = {
  total_matches: number;
  total_returned: number;
  total_with_metadata_in_corpus: number;
  total_scanned: number;
  metadata_coverage_pct: number; // over the SCANNED set (post prefix-filter), rounded to 1 decimal
  prefix_distribution: Record<string, number>;
  period_distribution: Record<string, number>; // top-5 only
};

export type FindTabletsByGenreResult = {
  query: {
    genre_pattern: string;
    prefix_filter: string | null;
    min_sign_count: number;
    top_n: number;
    include_subgenres: boolean;
  };
  matches: GenreMatch[];
  summary: FindTabletsByGenreSummary;
  warnings: string[];
};

export type FindTabletsByGenreOptions = {
  genrePattern: string;
  prefixFilter?: string;
  minSignCount?: number; // default 0 — include all matching witnesses
  topN?: number; // default 50, max 500
  includeSubgenres?: boolean; // default true
};

// ─── Internals ─────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  // Matches the convention used across the codebase (e.g. reconstructCluster,
  // collectionCoverage). Splits before the first "." or ",".
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function emptyResult(
  query: FindTabletsByGenreResult["query"],
  warnings: string[],
): FindTabletsByGenreResult {
  return {
    query,
    matches: [],
    summary: {
      total_matches: 0,
      total_returned: 0,
      total_with_metadata_in_corpus: 0,
      total_scanned: 0,
      metadata_coverage_pct: 0,
      prefix_distribution: {},
      period_distribution: {},
    },
    warnings,
  };
}

/**
 * Test whether the given metadata matches the requested genre pattern.
 *
 * With include_subgenres=true (default): case-insensitive substring match
 * against EACH element of metadata.genres[] (full hierarchy strings) AND
 * metadata.genres_flat[] (per-category strings). Matching "Magic" hits any
 * tablet whose hierarchy contains "Magic" anywhere ("Magic", "Purification",
 * "Mīs pî" — all reachable from a "Magic" query).
 *
 * With include_subgenres=false: only match per-category strings in
 * genres_flat[]. The user's pattern is treated as expecting an exact
 * category-level hit (still case-insensitive). E.g. "Mīs pî" matches only
 * tablets whose genres_flat[] contains a "Mīs pî" entry — not the broader
 * "Magic" or "Purification" categories.
 */
function genreMatches(
  metadata: FragmentMetadata,
  patternLower: string,
  includeSubgenres: boolean,
): boolean {
  const flat = metadata.genres_flat;
  if (!Array.isArray(flat) || flat.length === 0) {
    // No flat categories — fall back to hierarchy strings only when
    // include_subgenres is true (which permits substring matching there).
    if (!includeSubgenres) return false;
    const hier = metadata.genres;
    if (!Array.isArray(hier)) return false;
    for (const h of hier) {
      if (typeof h === "string" && h.toLowerCase().includes(patternLower)) return true;
    }
    return false;
  }

  if (includeSubgenres) {
    // Test both arrays so e.g. "Magic" hits hierarchy strings AND flat
    // categories; "Mīs pî" hits both as well.
    for (const cat of flat) {
      if (typeof cat === "string" && cat.toLowerCase().includes(patternLower)) return true;
    }
    const hier = metadata.genres;
    if (Array.isArray(hier)) {
      for (const h of hier) {
        if (typeof h === "string" && h.toLowerCase().includes(patternLower)) return true;
      }
    }
    return false;
  }

  // include_subgenres=false: category-level only. Still case-insensitive,
  // but only matches against flat per-category entries.
  for (const cat of flat) {
    if (typeof cat === "string" && cat.toLowerCase().includes(patternLower)) return true;
  }
  return false;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findTabletsByGenre(
  opts: FindTabletsByGenreOptions,
): FindTabletsByGenreResult {
  const patternRaw = (opts.genrePattern ?? "").trim();
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.trim().length > 0
    ? opts.prefixFilter.trim()
    : null;
  const minSignCount = Math.max(0, opts.minSignCount ?? 0);
  const topN = Math.max(1, Math.min(500, opts.topN ?? 50));
  const includeSubgenres = opts.includeSubgenres ?? true;
  const warnings: string[] = [];

  const query: FindTabletsByGenreResult["query"] = {
    genre_pattern: patternRaw,
    prefix_filter: prefixFilter,
    min_sign_count: minSignCount,
    top_n: topN,
    include_subgenres: includeSubgenres,
  };

  if (patternRaw.length === 0) {
    return emptyResult(query, [
      "genre_pattern is required and must be non-empty. Examples: 'Mīs pî', 'Šuʾila', 'Maqlû', 'Šurpu', 'Magic'.",
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  const patternLower = patternRaw.toLowerCase();

  // Build the scan set: optionally prefix-narrowed.
  const scanList = prefixFilter
    ? tablets.filter((t) => prefixOf(t.id) === prefixFilter)
    : tablets;

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the scan criteria${prefixFilter ? ` (prefix=${prefixFilter})` : ""}.`,
    );
    return emptyResult(query, warnings);
  }

  const matches: GenreMatch[] = [];
  let enrichedCount = 0;

  for (const t of scanList) {
    const md = getFragmentMetadata(t.id);
    if (!md) continue;
    enrichedCount++;
    if (!genreMatches(md, patternLower, includeSubgenres)) continue;
    if (t.sign_count < minSignCount) continue;

    matches.push({
      tablet_id: t.id,
      prefix: prefixOf(t.id),
      designation: md.designation ?? t.designation ?? null,
      sign_count: t.sign_count,
      period: getPeriod(md) ?? t.period ?? null,
      city: getCity(md) ?? t.city ?? null,
      genres: Array.isArray(md.genres) ? md.genres : [],
      in_lex_graph: t.in_lex_graph,
    });
  }

  // Sort by sign_count desc — largest/most-informative witnesses first.
  // Tie-break alphabetically by tablet_id for stable output.
  matches.sort((a, b) => {
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return a.tablet_id.localeCompare(b.tablet_id);
  });

  // Distributions are computed over ALL matches (not the returned slice)
  // so callers can reason about the full witness population even when
  // top_n is restrictive.
  const prefixDist: Record<string, number> = {};
  const periodDistAll: Record<string, number> = {};
  for (const m of matches) {
    prefixDist[m.prefix] = (prefixDist[m.prefix] ?? 0) + 1;
    const periodKey = m.period ?? "(unknown)";
    periodDistAll[periodKey] = (periodDistAll[periodKey] ?? 0) + 1;
  }

  // Top-5 period distribution.
  const periodDistTop5: Record<string, number> = {};
  Object.entries(periodDistAll)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .forEach(([k, v]) => {
      periodDistTop5[k] = v;
    });

  const truncated = matches.slice(0, topN);

  const coveragePct = scanList.length > 0
    ? Math.round((enrichedCount / scanList.length) * 1000) / 10
    : 0;

  // Low-coverage warning — researchers need to know that "0 matches" might
  // mean "no metadata", not "no witnesses in the corpus".
  if (scanList.length >= 50 && coveragePct < 10) {
    warnings.push(
      `Low metadata coverage: only ${enrichedCount}/${scanList.length} scanned tablets (${coveragePct}%) have enriched metadata. Most tablets were silently skipped. Run enrich_prefix_metadata${prefixFilter ? `(prefix_filter="${prefixFilter}")` : "()"} to backfill from the eBL API before relying on this result for completeness.`,
    );
  }
  if (enrichedCount === 0 && scanList.length > 0) {
    warnings.push(
      `No tablets in the scan set have enriched metadata. Genre matching is impossible — run enrich_prefix_metadata to populate the cache.`,
    );
  }

  // Corpus-wide metadata totals for context (independent of the prefix
  // filter — answers "how much of the whole corpus is enriched?").
  const corpusCoverage = metadataCoverage();

  return {
    query,
    matches: truncated,
    summary: {
      total_matches: matches.length,
      total_returned: truncated.length,
      total_with_metadata_in_corpus: corpusCoverage.total_with_metadata,
      total_scanned: scanList.length,
      metadata_coverage_pct: coveragePct,
      prefix_distribution: prefixDist,
      period_distribution: periodDistTop5,
    },
    warnings,
  };
}
