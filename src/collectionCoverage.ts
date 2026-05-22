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

    const periodDist: Record<string, number> = {};
    const genreDist: Record<string, number> = {};
    const cityDist: Record<string, number> = {};
    for (const t of bucket) {
      const period = t.period ?? "(unknown)";
      const genre = t.genre ?? "(unknown)";
      const city = t.city ?? "(unknown)";
      periodDist[period] = (periodDist[period] ?? 0) + 1;
      genreDist[genre] = (genreDist[genre] ?? 0) + 1;
      cityDist[city] = (cityDist[city] ?? 0) + 1;
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
