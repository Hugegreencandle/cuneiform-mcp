// v0.18.11 — corpus_health_report: one-call corpus-level meta-diagnostic.
//
// "System health" snapshot for the cuneiform-mcp pipeline. Surfaces in one
// query the answers callers usually have to stitch together from
// surfaceStats() + listCollectionPrefixes + findShortFragments + manual
// counting: how many tablets are indexed, what's the lex/them coverage,
// how many prefixes exist, the corpus-wide sign-count distribution, the
// short-fragment count at a given threshold, an approximate bi-orphan
// count at caller-configurable thresholds, plus generated recommendations
// for the next-best query given the corpus state.
//
// Use case: first-query observability tool. Before running expensive
// corpus-wide tools like find_scribal_groups or
// find_cross_prefix_scribal_links, run this to confirm the index is
// loaded and understand its scale + coverage. Also useful for
// documenting corpus state at release time + in the methods paper.
//
// Implementation: reuses surfaceStats() from anomalySurface.ts for the
// already-aggregated bi-orphan + load-state telemetry, and iterates
// over getAllTabletRecords() once for the per-prefix breakdown +
// corpus-wide sign-count distribution.
//
// Pure stdlib — no new dependencies.

import {
  getAllTabletRecords,
  surfaceStats,
  type AnomalyTabletRecord,
  type SurfaceStats,
} from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type CorpusHealthQuery = {
  short_fragment_threshold: number;
  bi_orphan_thresholds: {
    lex_jaccard: number;
    thematic_cosine: number;
  };
};

export type CorpusTotals = {
  total_tablets_in_index: number;
  in_lex_graph: number;
  in_them_index: number;
  in_both: number;
  zero_sign_count: number;
  mean_sign_count: number;
  median_sign_count: number;
  total_signs_corpus_wide: number;
};

export type PrefixCount = {
  prefix: string;
  tablet_count: number;
  total_sign_count: number;
};

export type PrefixSummaryBlock = {
  distinct_prefix_count: number;
  top_10_by_tablet_count: PrefixCount[];
  top_5_by_total_sign_count: PrefixCount[];
  largest_prefix_name: string | null;
  smallest_prefix_name: string | null;
};

export type ShortFragmentsBlock = {
  threshold: number;
  count: number;
  percent_of_corpus: number;
};

export type BiOrphansEstimateBlock = {
  approximate_count: number | null;
  thresholds_used: {
    lex_jaccard: number;
    thematic_cosine: number;
  };
  source: "anomaly_surface_stats" | "live_scan" | "unavailable";
  note: string;
};

export type QualityIndicatorsBlock = {
  mean_lex_coverage_pct: number;
  mean_them_coverage_pct: number;
  prefixes_with_high_zero_sign_count: Array<{
    prefix: string;
    zero_sign_pct: number;
    tablet_count: number;
  }>;
};

export type CorpusHealthResult = {
  query: CorpusHealthQuery;
  corpus_totals: CorpusTotals;
  prefix_summary: PrefixSummaryBlock;
  short_fragments: ShortFragmentsBlock;
  bi_orphans_estimate: BiOrphansEstimateBlock;
  quality_indicators: QualityIndicatorsBlock;
  recommendations: string[];
  warnings: string[];
};

export type CorpusHealthOptions = {
  shortFragmentThreshold?: number; // default 50
  biOrphanThresholds?: {
    lexJaccard?: number; // default 0.30
    thematicCosine?: number; // default 0.50
  };
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const DEFAULT_SHORT_FRAGMENT_THRESHOLD = 50;
const DEFAULT_LEX_JACCARD = 0.3;
const DEFAULT_THEMATIC_COSINE = 0.5;
const HIGH_ZERO_SIGN_FRACTION = 0.1;

function prefixOf(id: string): string {
  // Matches the convention used in collectionCoverage.ts + reconstructCluster.ts.
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function median(sortedAsc: number[]): number {
  if (sortedAsc.length === 0) return 0;
  const mid = Math.floor(sortedAsc.length / 2);
  if (sortedAsc.length % 2 === 0) {
    return (sortedAsc[mid - 1] + sortedAsc[mid]) / 2;
  }
  return sortedAsc[mid];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function emptyResult(query: CorpusHealthQuery, warnings: string[]): CorpusHealthResult {
  return {
    query,
    corpus_totals: {
      total_tablets_in_index: 0,
      in_lex_graph: 0,
      in_them_index: 0,
      in_both: 0,
      zero_sign_count: 0,
      mean_sign_count: 0,
      median_sign_count: 0,
      total_signs_corpus_wide: 0,
    },
    prefix_summary: {
      distinct_prefix_count: 0,
      top_10_by_tablet_count: [],
      top_5_by_total_sign_count: [],
      largest_prefix_name: null,
      smallest_prefix_name: null,
    },
    short_fragments: {
      threshold: query.short_fragment_threshold,
      count: 0,
      percent_of_corpus: 0,
    },
    bi_orphans_estimate: {
      approximate_count: null,
      thresholds_used: query.bi_orphan_thresholds,
      source: "unavailable",
      note: "Anomaly index unavailable — bi-orphan estimate cannot be computed.",
    },
    quality_indicators: {
      mean_lex_coverage_pct: 0,
      mean_them_coverage_pct: 0,
      prefixes_with_high_zero_sign_count: [],
    },
    recommendations: [
      "Run `node scripts/build-anomaly-index.mjs` to populate the corpus cache before re-querying.",
    ],
    warnings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function corpusHealthReport(opts: CorpusHealthOptions = {}): CorpusHealthResult {
  const shortFragmentThreshold = Math.max(
    0,
    opts.shortFragmentThreshold ?? DEFAULT_SHORT_FRAGMENT_THRESHOLD,
  );
  const lexJaccard = opts.biOrphanThresholds?.lexJaccard ?? DEFAULT_LEX_JACCARD;
  const thematicCosine = opts.biOrphanThresholds?.thematicCosine ?? DEFAULT_THEMATIC_COSINE;
  const query: CorpusHealthQuery = {
    short_fragment_threshold: shortFragmentThreshold,
    bi_orphan_thresholds: {
      lex_jaccard: lexJaccard,
      thematic_cosine: thematicCosine,
    },
  };

  const warnings: string[] = [];
  const stats: SurfaceStats = surfaceStats();
  const tablets = getAllTabletRecords();
  if (!tablets) {
    const loadWarn = stats.load_error
      ? `Anomaly index not loaded: ${stats.load_error}`
      : "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache.";
    warnings.push(loadWarn);
    return emptyResult(query, warnings);
  }

  // ─── Single-pass aggregation: per-prefix buckets + corpus-wide sign-count
  //     distribution + lex/them coverage + zero-sign counts.
  const buckets = new Map<string, AnomalyTabletRecord[]>();
  const signCountsAll: number[] = [];
  let totalSignsCorpusWide = 0;
  let zeroSignCount = 0;
  let inLexGraph = 0;
  let inThemIndex = 0;
  let inBoth = 0;
  let shortFragmentCount = 0;

  for (const t of tablets) {
    const p = prefixOf(t.id);
    let bucket = buckets.get(p);
    if (!bucket) {
      bucket = [];
      buckets.set(p, bucket);
    }
    bucket.push(t);

    signCountsAll.push(t.sign_count);
    totalSignsCorpusWide += t.sign_count;
    if (t.sign_count === 0) zeroSignCount++;
    if (t.in_lex_graph) inLexGraph++;
    if (t.in_them_index) inThemIndex++;
    if (t.in_lex_graph && t.in_them_index) inBoth++;
    if (t.sign_count < shortFragmentThreshold) shortFragmentCount++;
  }

  // Corpus-wide sign-count distribution. Mean/median computed across ALL
  // tablets including zero-sign placeholder records; callers needing
  // non-zero stats can use coverage_stats_for_collection.
  const sortedSignCountsAsc = [...signCountsAll].sort((a, b) => a - b);
  const meanSignCount = tablets.length > 0 ? round1(totalSignsCorpusWide / tablets.length) : 0;
  const medianSignCount = median(sortedSignCountsAsc);

  // Per-prefix summaries — flatten the buckets to PrefixCount[] for sorting.
  const prefixCounts: PrefixCount[] = [];
  let largestPrefix: { name: string; count: number } | null = null;
  let smallestPrefix: { name: string; count: number } | null = null;
  const lexCoveragePctPerPrefix: number[] = [];
  const themCoveragePctPerPrefix: number[] = [];
  const highZeroSignPrefixes: Array<{
    prefix: string;
    zero_sign_pct: number;
    tablet_count: number;
  }> = [];

  for (const [prefix, bucket] of buckets) {
    const totalSign = bucket.reduce((s, t) => s + t.sign_count, 0);
    const inLex = bucket.filter((t) => t.in_lex_graph).length;
    const inThem = bucket.filter((t) => t.in_them_index).length;
    const zeroCount = bucket.filter((t) => t.sign_count === 0).length;
    prefixCounts.push({
      prefix,
      tablet_count: bucket.length,
      total_sign_count: totalSign,
    });
    if (bucket.length > 0) {
      lexCoveragePctPerPrefix.push((inLex / bucket.length) * 100);
      themCoveragePctPerPrefix.push((inThem / bucket.length) * 100);
      const zeroFraction = zeroCount / bucket.length;
      if (zeroFraction > HIGH_ZERO_SIGN_FRACTION) {
        highZeroSignPrefixes.push({
          prefix,
          zero_sign_pct: round1(zeroFraction * 100),
          tablet_count: bucket.length,
        });
      }
    }
    if (!largestPrefix || bucket.length > largestPrefix.count) {
      largestPrefix = { name: prefix, count: bucket.length };
    }
    if (!smallestPrefix || bucket.length < smallestPrefix.count) {
      smallestPrefix = { name: prefix, count: bucket.length };
    }
  }

  const top10ByTabletCount = [...prefixCounts]
    .sort((a, b) => b.tablet_count - a.tablet_count)
    .slice(0, 10);
  const top5ByTotalSignCount = [...prefixCounts]
    .sort((a, b) => b.total_sign_count - a.total_sign_count)
    .slice(0, 5);
  highZeroSignPrefixes.sort((a, b) => b.zero_sign_pct - a.zero_sign_pct);

  const meanLexCoveragePct =
    lexCoveragePctPerPrefix.length > 0
      ? round1(
          lexCoveragePctPerPrefix.reduce((a, b) => a + b, 0) / lexCoveragePctPerPrefix.length,
        )
      : 0;
  const meanThemCoveragePct =
    themCoveragePctPerPrefix.length > 0
      ? round1(
          themCoveragePctPerPrefix.reduce((a, b) => a + b, 0) / themCoveragePctPerPrefix.length,
        )
      : 0;

  // ─── Bi-orphan estimate.
  // The anomaly index reports a baked-in bi-orphan count under
  // surfaceStats().totals.bi_orphans, computed at index-build time with
  // the canonical methods-paper thresholds (lex_jaccard≥0.30,
  // thematic_cosine≥0.50). When the caller passes those defaults we
  // surface the cached number directly. When they diverge, we recompute
  // by scanning the records using the caller's thresholds.
  let biOrphansBlock: BiOrphansEstimateBlock;
  const usingDefaults =
    lexJaccard === DEFAULT_LEX_JACCARD && thematicCosine === DEFAULT_THEMATIC_COSINE;
  if (usingDefaults && stats.loaded) {
    biOrphansBlock = {
      approximate_count: stats.totals.bi_orphans,
      thresholds_used: query.bi_orphan_thresholds,
      source: "anomaly_surface_stats",
      note: "Bi-orphan count surfaced from the pre-aggregated anomaly-index totals (lex_jaccard≥0.30 ∧ thematic_cosine≥0.50).",
    };
  } else {
    let liveCount = 0;
    for (const t of tablets) {
      if (!t.in_lex_graph || !t.in_them_index) continue;
      const lexIsolated =
        t.lex_count === 0 || (t.lex_max_jaccard ?? 0) < lexJaccard;
      const themIsolated = (t.them_max_cos ?? 1) < thematicCosine;
      if (lexIsolated && themIsolated) liveCount++;
    }
    biOrphansBlock = {
      approximate_count: liveCount,
      thresholds_used: query.bi_orphan_thresholds,
      source: "live_scan",
      note: `Bi-orphan count recomputed live at caller thresholds (lex_jaccard<${lexJaccard} ∧ thematic_cosine<${thematicCosine}); pre-aggregated value (${stats.totals.bi_orphans}) was at the default thresholds.`,
    };
  }

  // ─── Recommendations.
  const recommendations: string[] = [];
  const distinctPrefixCount = buckets.size;
  recommendations.push(
    `Corpus has ${tablets.length.toLocaleString()} tablets across ${distinctPrefixCount} prefixes — start with \`list_collection_prefixes\` to explore the prefix distribution.`,
  );
  if (tablets.length > 0) {
    const zeroPct = round1((zeroSignCount / tablets.length) * 100);
    if (zeroPct > 10) {
      recommendations.push(
        `${zeroPct}% of tablets have zero sign_count — consider running \`find_short_fragments\` (max_sign_count=0) to audit placeholder records.`,
      );
    }
  }
  if (tablets.length > 0) {
    const shortPct = round1((shortFragmentCount / tablets.length) * 100);
    recommendations.push(
      `${shortPct}% of tablets are below the short-fragment threshold (${shortFragmentThreshold} signs) — use \`find_short_fragments\` to triage them.`,
    );
  }
  if (biOrphansBlock.approximate_count != null && biOrphansBlock.approximate_count > 0) {
    recommendations.push(
      `~${biOrphansBlock.approximate_count} bi-orphans estimated — call \`find_anomalous_tablets\` (anomaly_type='bi_orphan') for the ranked candidate list.`,
    );
  }
  if (highZeroSignPrefixes.length > 0) {
    const sample = highZeroSignPrefixes
      .slice(0, 3)
      .map((p) => `${p.prefix} (${p.zero_sign_pct}%)`)
      .join(", ");
    recommendations.push(
      `${highZeroSignPrefixes.length} prefix(es) have >10% zero-sign records (${sample}) — coverage may be incomplete; cross-check with \`coverage_stats_for_collection\`.`,
    );
  }
  if (meanLexCoveragePct < 50) {
    recommendations.push(
      `Mean per-prefix lex-graph coverage is ${meanLexCoveragePct}% — many prefixes are under-transliterated; corpus-wide tools (find_scribal_groups, find_cross_prefix_scribal_links) will under-recall.`,
    );
  }
  if (!stats.loaded) {
    recommendations.push(
      "Anomaly-index totals report `loaded=false` — re-run the index builder before relying on this report for a release artifact.",
    );
  }

  return {
    query,
    corpus_totals: {
      total_tablets_in_index: tablets.length,
      in_lex_graph: inLexGraph,
      in_them_index: inThemIndex,
      in_both: inBoth,
      zero_sign_count: zeroSignCount,
      mean_sign_count: meanSignCount,
      median_sign_count: medianSignCount,
      total_signs_corpus_wide: totalSignsCorpusWide,
    },
    prefix_summary: {
      distinct_prefix_count: distinctPrefixCount,
      top_10_by_tablet_count: top10ByTabletCount,
      top_5_by_total_sign_count: top5ByTotalSignCount,
      largest_prefix_name: largestPrefix?.name ?? null,
      smallest_prefix_name: smallestPrefix?.name ?? null,
    },
    short_fragments: {
      threshold: shortFragmentThreshold,
      count: shortFragmentCount,
      percent_of_corpus:
        tablets.length > 0 ? round1((shortFragmentCount / tablets.length) * 100) : 0,
    },
    bi_orphans_estimate: biOrphansBlock,
    quality_indicators: {
      mean_lex_coverage_pct: meanLexCoveragePct,
      mean_them_coverage_pct: meanThemCoveragePct,
      prefixes_with_high_zero_sign_count: highZeroSignPrefixes,
    },
    recommendations,
    warnings,
  };
}
