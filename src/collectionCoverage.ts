// v0.18.4 — Coverage statistics for a museum-collection prefix or list of prefixes.
//
// Surfaces the corpus-level question "how much of museum collection X has been
// transliterated, and what is its character?" — a baseline observability tool
// for the cuneiform-mcp corpus (~36,500 tablets across 20+ museum prefixes).
// Useful as the entry-point query for any per-collection deep-dive: identify
// the under-cataloged sub-corpora, the largest tablets worth a per-tablet
// brief, the period/genre/city distribution of a given prefix.
//
// Motivation: the BM.77056 *āšipūtu* cluster survey (2026-05-22) revealed that
// the cluster spans 20 museum prefixes — but for each prefix, no tool surfaced
// "how many tablets in total does that prefix have, what's the transliteration
// coverage, what's the sign-count distribution?" This tool answers that.
//
// Companion to `find_anomalous_tablets` (per-tablet anomaly detail) and
// `reconstruct_cluster` (per-seed manuscript reconstruction). Together the
// three answer different scales of the same corpus.
//
// Pure stdlib + read-only access to the anomaly index via anomalySurface.ts's
// `getAllTabletRecords()` accessor.

import { getAllTabletRecords, type AnomalyTabletRecord } from "./anomalySurface.js";
import { getFragmentMetadata, getPeriod, getCity, getPrimaryGenre } from "./fragmentMetadata.js";

// ─── v0.18.5 — list_collection_prefixes ────────────────────────────────────

export type PrefixSummary = {
  prefix: string;
  tablet_count: number;
  total_sign_count: number;
  mean_sign_count: number;
  in_lex_graph: number;
  in_them_index: number;
  lex_coverage_pct: number; // rounded to 1 decimal
};

export type ListPrefixesResult = {
  query: {
    min_tablet_count: number;
    sort_by: "tablet_count" | "total_sign_count" | "mean_sign_count" | "prefix";
    sort_order: "desc" | "asc";
    top_n: number | null;
  };
  prefixes: PrefixSummary[];
  totals: {
    distinct_prefixes: number;
    prefixes_returned: number;
    total_tablets: number;
    total_signs: number;
    prefixes_filtered_out_by_min_count: number;
  };
  warnings: string[];
};

export type ListPrefixesOptions = {
  minTabletCount?: number; // default 1 (no filter)
  sortBy?: "tablet_count" | "total_sign_count" | "mean_sign_count" | "prefix";
  sortOrder?: "desc" | "asc";
  topN?: number | null; // null = return all
};

function _prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

export function listCollectionPrefixes(opts: ListPrefixesOptions = {}): ListPrefixesResult {
  const minCount = Math.max(1, opts.minTabletCount ?? 1);
  const sortBy = opts.sortBy ?? "tablet_count";
  const sortOrder = opts.sortOrder ?? "desc";
  const topN = opts.topN === undefined ? null : opts.topN;
  const warnings: string[] = [];

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return {
      query: { min_tablet_count: minCount, sort_by: sortBy, sort_order: sortOrder, top_n: topN },
      prefixes: [],
      totals: { distinct_prefixes: 0, prefixes_returned: 0, total_tablets: 0, total_signs: 0, prefixes_filtered_out_by_min_count: 0 },
      warnings: ["Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying."],
    };
  }

  // Single-pass aggregation: bucket all tablets by prefix
  const buckets = new Map<string, AnomalyTabletRecord[]>();
  for (const t of tablets) {
    const p = _prefixOf(t.id);
    let bucket = buckets.get(p);
    if (!bucket) {
      bucket = [];
      buckets.set(p, bucket);
    }
    bucket.push(t);
  }

  // Build summaries
  let allTotalTablets = 0;
  let allTotalSigns = 0;
  let filteredOut = 0;
  const summaries: PrefixSummary[] = [];
  for (const [prefix, bucket] of buckets) {
    const totalSign = bucket.reduce((s, t) => s + t.sign_count, 0);
    const inLex = bucket.filter((t) => t.in_lex_graph).length;
    const inThem = bucket.filter((t) => t.in_them_index).length;
    allTotalTablets += bucket.length;
    allTotalSigns += totalSign;
    if (bucket.length < minCount) {
      filteredOut++;
      continue;
    }
    summaries.push({
      prefix,
      tablet_count: bucket.length,
      total_sign_count: totalSign,
      mean_sign_count: bucket.length > 0 ? Math.round((totalSign / bucket.length) * 10) / 10 : 0,
      in_lex_graph: inLex,
      in_them_index: inThem,
      lex_coverage_pct: bucket.length > 0 ? Math.round((inLex / bucket.length) * 1000) / 10 : 0,
    });
  }

  // Sort
  const cmpAsc = (a: number, b: number) => a - b;
  const cmpDesc = (a: number, b: number) => b - a;
  const cmpStrAsc = (a: string, b: string) => a.localeCompare(b);
  const cmpStrDesc = (a: string, b: string) => b.localeCompare(a);
  summaries.sort((a, b) => {
    switch (sortBy) {
      case "tablet_count":
        return sortOrder === "asc" ? cmpAsc(a.tablet_count, b.tablet_count) : cmpDesc(a.tablet_count, b.tablet_count);
      case "total_sign_count":
        return sortOrder === "asc" ? cmpAsc(a.total_sign_count, b.total_sign_count) : cmpDesc(a.total_sign_count, b.total_sign_count);
      case "mean_sign_count":
        return sortOrder === "asc" ? cmpAsc(a.mean_sign_count, b.mean_sign_count) : cmpDesc(a.mean_sign_count, b.mean_sign_count);
      case "prefix":
        return sortOrder === "asc" ? cmpStrAsc(a.prefix, b.prefix) : cmpStrDesc(a.prefix, b.prefix);
      default:
        return 0;
    }
  });

  const truncated = topN !== null && topN > 0 ? summaries.slice(0, topN) : summaries;

  return {
    query: { min_tablet_count: minCount, sort_by: sortBy, sort_order: sortOrder, top_n: topN },
    prefixes: truncated,
    totals: {
      distinct_prefixes: buckets.size,
      prefixes_returned: truncated.length,
      total_tablets: allTotalTablets,
      total_signs: allTotalSigns,
      prefixes_filtered_out_by_min_count: filteredOut,
    },
    warnings,
  };
}

// ─── v0.18.6 — find_short_fragments (quality-audit primitive) ──────────────

export type ShortFragment = {
  id: string;
  prefix: string;
  sign_count: number;
  in_lex_graph: boolean;
  in_them_index: boolean;
};

export type FindShortFragmentsResult = {
  query: {
    max_sign_count: number;
    prefix_filter: string[] | null; // null = all prefixes
    sort_order: "asc" | "desc";
    top_n: number;
  };
  fragments: ShortFragment[];
  totals: {
    total_tablets_in_index: number;
    total_below_threshold: number;
    total_matching_prefix_filter: number;
    fragments_returned: number;
    prefix_distribution_below_threshold: Record<string, number>;
  };
  warnings: string[];
};

export type FindShortFragmentsOptions = {
  maxSignCount: number; // required — fragments at OR below this count are surfaced
  prefixFilter?: string[]; // optional whitelist of prefixes
  sortOrder?: "asc" | "desc"; // asc = shortest first (default); desc = longest-under-threshold first
  topN?: number; // default 50
};

export function findShortFragments(opts: FindShortFragmentsOptions): FindShortFragmentsResult {
  const maxSign = Math.max(0, opts.maxSignCount);
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const sortOrder = opts.sortOrder ?? "asc";
  const topN = Math.max(1, Math.min(500, opts.topN ?? 50));
  const warnings: string[] = [];

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return {
      query: { max_sign_count: maxSign, prefix_filter: prefixFilter, sort_order: sortOrder, top_n: topN },
      fragments: [],
      totals: { total_tablets_in_index: 0, total_below_threshold: 0, total_matching_prefix_filter: 0, fragments_returned: 0, prefix_distribution_below_threshold: {} },
      warnings: ["Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying."],
    };
  }

  const below: ShortFragment[] = [];
  const prefixDist: Record<string, number> = {};
  let matchedPrefix = 0;
  for (const t of tablets) {
    if (t.sign_count > maxSign) continue;
    const prefix = _prefixOf(t.id);
    if (prefixFilter && !prefixFilter.includes(prefix)) continue;
    matchedPrefix++;
    below.push({
      id: t.id,
      prefix,
      sign_count: t.sign_count,
      in_lex_graph: t.in_lex_graph,
      in_them_index: t.in_them_index,
    });
    prefixDist[prefix] = (prefixDist[prefix] ?? 0) + 1;
  }

  below.sort((a, b) => (sortOrder === "asc" ? a.sign_count - b.sign_count : b.sign_count - a.sign_count));
  const truncated = below.slice(0, topN);

  // Also compute the unfiltered total-below-threshold (across all prefixes)
  let totalBelow = 0;
  for (const t of tablets) {
    if (t.sign_count <= maxSign) totalBelow++;
  }

  return {
    query: { max_sign_count: maxSign, prefix_filter: prefixFilter, sort_order: sortOrder, top_n: topN },
    fragments: truncated,
    totals: {
      total_tablets_in_index: tablets.length,
      total_below_threshold: totalBelow,
      total_matching_prefix_filter: matchedPrefix,
      fragments_returned: truncated.length,
      prefix_distribution_below_threshold: prefixDist,
    },
    warnings,
  };
}

// ─── Public types ──────────────────────────────────────────────────────────

export type CoverageStatsForPrefix = {
  prefix: string;
  total_tablets: number;
  in_lex_graph: number; // transliterated AND in the trigram graph (proxy for processed)
  in_them_index: number; // also in the thematic-embedding index
  in_both: number;
  sign_count: {
    min: number;
    median: number;
    mean: number;
    p90: number;
    max: number;
    total: number;
    zero_sign_count: number; // tablets with no signs at all (placeholder records)
  };
  top_by_sign_count: Array<{ id: string; sign_count: number; designation: string | null }>;
  period_distribution: Record<string, number>;
  genre_distribution: Record<string, number>;
  city_distribution: Record<string, number>;
};

export type CoverageStatsResult = {
  query: {
    prefixes: string[];
    top_n: number;
  };
  per_prefix: CoverageStatsForPrefix[];
  corpus_totals: {
    total_tablets_in_index: number;
    total_tablets_matching_query: number;
    prefixes_matched: number;
    distinct_prefixes_in_corpus: number;
  };
  warnings: string[];
};

// ─── Public API ────────────────────────────────────────────────────────────

export type CoverageStatsOptions = {
  prefixes: string[]; // e.g. ["BM"], ["K", "Sm"], ["NZK"]
  topN?: number; // top-N largest tablets per prefix; default 10
};

function prefixOf(id: string): string {
  // Matches the convention in reconstructCluster.ts:prefixOf
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function collectionCoverage(opts: CoverageStatsOptions): CoverageStatsResult {
  const topN = Math.max(1, Math.min(50, opts.topN ?? 10));
  const warnings: string[] = [];

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return {
      query: { prefixes: opts.prefixes, top_n: topN },
      per_prefix: [],
      corpus_totals: {
        total_tablets_in_index: 0,
        total_tablets_matching_query: 0,
        prefixes_matched: 0,
        distinct_prefixes_in_corpus: 0,
      },
      warnings: [
        "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
      ],
    };
  }

  // Normalize prefixes (strip leading/trailing whitespace; preserve case)
  const queryPrefixes = opts.prefixes.map((p) => p.trim()).filter((p) => p.length > 0);
  if (queryPrefixes.length === 0) {
    warnings.push("No prefixes provided — query yielded empty result.");
  }

  // Build a single pass aggregation: bucket all tablets by prefix in one scan
  const byPrefix = new Map<string, AnomalyTabletRecord[]>();
  const allPrefixes = new Set<string>();
  for (const t of tablets) {
    const p = prefixOf(t.id);
    allPrefixes.add(p);
    if (!queryPrefixes.includes(p)) continue;
    let bucket = byPrefix.get(p);
    if (!bucket) {
      bucket = [];
      byPrefix.set(p, bucket);
    }
    bucket.push(t);
  }

  // Per-prefix stats
  const perPrefix: CoverageStatsForPrefix[] = [];
  let totalMatching = 0;
  for (const prefix of queryPrefixes) {
    const bucket = byPrefix.get(prefix) ?? [];
    totalMatching += bucket.length;
    if (bucket.length === 0) {
      perPrefix.push({
        prefix,
        total_tablets: 0,
        in_lex_graph: 0,
        in_them_index: 0,
        in_both: 0,
        sign_count: { min: 0, median: 0, mean: 0, p90: 0, max: 0, total: 0, zero_sign_count: 0 },
        top_by_sign_count: [],
        period_distribution: {},
        genre_distribution: {},
        city_distribution: {},
      });
      continue;
    }

    const signCounts = bucket.map((t) => t.sign_count);
    const signCountsNonZero = signCounts.filter((c) => c > 0);
    const sortedAsc = [...signCountsNonZero].sort((a, b) => a - b);
    const totalSigns = signCountsNonZero.reduce((a, b) => a + b, 0);
    const zeroCount = bucket.filter((t) => t.sign_count === 0).length;
    const inLex = bucket.filter((t) => t.in_lex_graph).length;
    const inThem = bucket.filter((t) => t.in_them_index).length;
    const inBoth = bucket.filter((t) => t.in_lex_graph && t.in_them_index).length;

    // v0.18.13 — Enrich period/genre/city distributions via fragment-metadata cache.
    // Falls back to the anomaly-index fields (which are NULL for all tablets as of
    // 2026-05-22) when no enriched metadata is available; final fallback is
    // "(unknown — not enriched)" so the gap is explicit. Run enrich_prefix_metadata
    // to populate the cache for this prefix before querying for real distributions.
    const periodDist: Record<string, number> = {};
    const genreDist: Record<string, number> = {};
    const cityDist: Record<string, number> = {};
    let enrichedCount = 0;
    for (const t of bucket) {
      const md = getFragmentMetadata(t.id);
      if (md) enrichedCount++;
      const period = getPeriod(md) ?? t.period ?? "(unknown — not enriched)";
      const genre = getPrimaryGenre(md) ?? t.genre ?? "(unknown — not enriched)";
      const city = getCity(md) ?? t.city ?? "(unknown — not enriched)";
      periodDist[period] = (periodDist[period] ?? 0) + 1;
      genreDist[genre] = (genreDist[genre] ?? 0) + 1;
      cityDist[city] = (cityDist[city] ?? 0) + 1;
    }
    const enrichedPct = bucket.length > 0 ? Math.round((enrichedCount / bucket.length) * 1000) / 10 : 0;
    if (enrichedPct < 5 && bucket.length >= 50) {
      warnings.push(
        `Prefix ${prefix}: only ${enrichedCount}/${bucket.length} tablets (${enrichedPct}%) have enriched metadata. Run enrich_prefix_metadata(prefix_filter="${prefix}") to backfill from the eBL API.`,
      );
    }

    const topTablets = [...bucket]
      .sort((a, b) => b.sign_count - a.sign_count)
      .slice(0, topN)
      .map((t) => ({ id: t.id, sign_count: t.sign_count, designation: t.designation }));

    perPrefix.push({
      prefix,
      total_tablets: bucket.length,
      in_lex_graph: inLex,
      in_them_index: inThem,
      in_both: inBoth,
      sign_count: {
        min: sortedAsc[0] ?? 0,
        median: median(sortedAsc),
        mean: signCountsNonZero.length > 0 ? Math.round((totalSigns / signCountsNonZero.length) * 10) / 10 : 0,
        p90: percentile(sortedAsc, 90),
        max: sortedAsc[sortedAsc.length - 1] ?? 0,
        total: totalSigns,
        zero_sign_count: zeroCount,
      },
      top_by_sign_count: topTablets,
      period_distribution: periodDist,
      genre_distribution: genreDist,
      city_distribution: cityDist,
    });
  }

  return {
    query: { prefixes: queryPrefixes, top_n: topN },
    per_prefix: perPrefix,
    corpus_totals: {
      total_tablets_in_index: tablets.length,
      total_tablets_matching_query: totalMatching,
      prefixes_matched: byPrefix.size,
      distinct_prefixes_in_corpus: allPrefixes.size,
    },
    warnings,
  };
}
