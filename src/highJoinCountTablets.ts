// v0.18.16 — High-join-count tablet discovery over the enriched fragment-metadata cache.
//
// Surfaces tablets in the corpus with the highest joins_count field (per the
// eBL /fragments API, captured into fragment-metadata.json). These are the
// "champion fragments" — large compositions that have been substantially
// reconstructed via the eBL editorial join-recovery process. A 13-tablet
// join group (such as K.5896, surfaced by the BM.77056 *āšipūtu* cluster
// survey on 2026-05-22) means thirteen distinct museum-number fragments
// have been physically/textually joined into a single original tablet.
//
// Use case: "Which tablets have the most known physical joins?" Researchers
// often want these as the canonical anchor for a composition because they
// have the most reconstructed text and are therefore the most informative
// witnesses to anchor parallel-search, lacuna-restoration, or scribal-
// fingerprint work against. Companion to find_join_candidates (which
// proposes NEW joins) — this tool surfaces ALREADY-RECOVERED joins.
//
// Critical caveat: matching runs against the enriched fragment-metadata
// cache (see fragmentMetadata.ts). As of v0.18.15 the cache holds only
// ~0.6% of the corpus (~226 of ~36,500 tablets). Most tablets will be
// silently skipped because they were never queried. The tool emits a
// coverage warning when fewer than ~10% of scanned tablets have metadata.
// Run enrich_prefix_metadata(prefix_filter="X") to backfill specific
// prefixes before running broad join-count queries.
//
// Algorithm:
//   1. Iterate getAllTabletRecords() from anomalySurface
//   2. Optional prefix-filter narrowing
//   3. For each candidate, fetch FragmentMetadata via getFragmentMetadata
//   4. Skip if no metadata; optionally skip if joins_count < min_joins_count
//      (or joins_count == 0 when include_zero_joins=false)
//   5. Sort by joins_count desc; tie-break by sign_count desc; cap at top_n
//   6. Build per-prefix + per-period distributions over ALL matches
//      (not just the returned slice)
//
// Pure stdlib + read-only access to the anomaly index and metadata cache.

import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
  getPrimaryGenre,
  metadataCoverage,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type HighJoinCountMatch = {
  tablet_id: string;
  prefix: string;
  joins_count: number;
  sign_count: number;
  designation: string | null;
  period: string | null;
  genre: string | null; // primary (first hierarchy string)
  city: string | null;
};

export type FindHighJoinCountTabletsSummary = {
  total_matching: number;
  total_returned: number;
  total_with_metadata_in_corpus: number;
  total_scanned: number;
  metadata_coverage_pct: number; // over the SCANNED set (post prefix-filter), 1 decimal
  max_joins_count_seen: number;
  mean_joins_count: number; // mean over MATCHES (not the whole scan set), 2 decimals
  prefix_distribution: Record<string, number>; // top-15 only
  period_distribution: Record<string, number>; // top-5 only
};

export type FindHighJoinCountTabletsResult = {
  query: {
    prefix_filter: string | null;
    min_joins_count: number;
    top_n: number;
    include_zero_joins: boolean;
  };
  tablets: HighJoinCountMatch[];
  summary: FindHighJoinCountTabletsSummary;
  warnings: string[];
};

export type FindHighJoinCountTabletsOptions = {
  prefixFilter?: string;
  minJoinsCount?: number; // default 1 — show only tablets with at least 1 known join
  topN?: number; // default 50, max 500
  includeZeroJoins?: boolean; // default false — if true, surface "metadata present but no joins"
};

// ─── Internals ─────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  // Matches the convention used across the codebase (reconstructCluster,
  // collectionCoverage, findByGenre, findByProvenance). Splits before the
  // first "." or ",".
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function emptyResult(
  query: FindHighJoinCountTabletsResult["query"],
  warnings: string[],
): FindHighJoinCountTabletsResult {
  return {
    query,
    tablets: [],
    summary: {
      total_matching: 0,
      total_returned: 0,
      total_with_metadata_in_corpus: 0,
      total_scanned: 0,
      metadata_coverage_pct: 0,
      max_joins_count_seen: 0,
      mean_joins_count: 0,
      prefix_distribution: {},
      period_distribution: {},
    },
    warnings,
  };
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findHighJoinCountTablets(
  opts: FindHighJoinCountTabletsOptions,
): FindHighJoinCountTabletsResult {
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.trim().length > 0
    ? opts.prefixFilter.trim()
    : null;
  const includeZeroJoins = opts.includeZeroJoins ?? false;
  // Default min_joins_count is 1 — only tablets with at least one known
  // join. When include_zero_joins is true, the floor drops to 0 unless
  // the caller explicitly overrode min_joins_count.
  const rawMin = opts.minJoinsCount;
  const minJoinsCount = rawMin !== undefined && rawMin !== null
    ? Math.max(0, rawMin)
    : (includeZeroJoins ? 0 : 1);
  const topN = Math.max(1, Math.min(500, opts.topN ?? 50));
  const warnings: string[] = [];

  const query: FindHighJoinCountTabletsResult["query"] = {
    prefix_filter: prefixFilter,
    min_joins_count: minJoinsCount,
    top_n: topN,
    include_zero_joins: includeZeroJoins,
  };

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

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

  const matches: HighJoinCountMatch[] = [];
  let enrichedCount = 0;
  let maxJoinsSeen = 0;
  let joinsSum = 0;

  for (const t of scanList) {
    const md = getFragmentMetadata(t.id);
    if (!md) continue;
    enrichedCount++;

    const joinsCount = typeof md.joins_count === "number" ? md.joins_count : 0;
    if (joinsCount > maxJoinsSeen) maxJoinsSeen = joinsCount;

    // Filter: respect min_joins_count and include_zero_joins.
    if (joinsCount < minJoinsCount) continue;
    if (!includeZeroJoins && joinsCount === 0) continue;

    joinsSum += joinsCount;

    matches.push({
      tablet_id: t.id,
      prefix: prefixOf(t.id),
      joins_count: joinsCount,
      sign_count: t.sign_count,
      designation: md.designation ?? t.designation ?? null,
      period: getPeriod(md) ?? t.period ?? null,
      genre: getPrimaryGenre(md) ?? t.genre ?? null,
      city: getCity(md) ?? t.city ?? null,
    });
  }

  // Sort by joins_count desc; tie-break by sign_count desc; final tie-break
  // alphabetically by tablet_id for stable output.
  matches.sort((a, b) => {
    if (b.joins_count !== a.joins_count) return b.joins_count - a.joins_count;
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return a.tablet_id.localeCompare(b.tablet_id);
  });

  // Distributions are computed over ALL matches (not the returned slice)
  // so callers can reason about the full population even when top_n is
  // restrictive.
  const prefixDistAll: Record<string, number> = {};
  const periodDistAll: Record<string, number> = {};
  for (const m of matches) {
    prefixDistAll[m.prefix] = (prefixDistAll[m.prefix] ?? 0) + 1;
    const periodKey = m.period ?? "(unknown)";
    periodDistAll[periodKey] = (periodDistAll[periodKey] ?? 0) + 1;
  }

  // Top-15 prefix distribution.
  const prefixDistTop15: Record<string, number> = {};
  Object.entries(prefixDistAll)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([k, v]) => {
      prefixDistTop15[k] = v;
    });

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
  const meanJoins = matches.length > 0
    ? Math.round((joinsSum / matches.length) * 100) / 100
    : 0;

  // Low-coverage warning — researchers need to know that "0 matches" might
  // mean "no metadata", not "no high-join-count tablets in the corpus".
  if (scanList.length >= 50 && coveragePct < 10) {
    warnings.push(
      `Low metadata coverage: only ${enrichedCount}/${scanList.length} scanned tablets (${coveragePct}%) have enriched metadata. Most tablets were silently skipped. Run enrich_prefix_metadata${prefixFilter ? `(prefix_filter="${prefixFilter}")` : "()"} to backfill from the eBL API before relying on this result for completeness.`,
    );
  }
  if (enrichedCount === 0 && scanList.length > 0) {
    warnings.push(
      `No tablets in the scan set have enriched metadata. Join-count ranking is impossible — run enrich_prefix_metadata to populate the cache.`,
    );
  }

  // Corpus-wide metadata totals for context (independent of the prefix
  // filter — answers "how much of the whole corpus is enriched?").
  const corpusCoverage = metadataCoverage();

  return {
    query,
    tablets: truncated,
    summary: {
      total_matching: matches.length,
      total_returned: truncated.length,
      total_with_metadata_in_corpus: corpusCoverage.total_with_metadata,
      total_scanned: scanList.length,
      metadata_coverage_pct: coveragePct,
      max_joins_count_seen: maxJoinsSeen,
      mean_joins_count: meanJoins,
      prefix_distribution: prefixDistTop15,
      period_distribution: periodDistTop5,
    },
    warnings,
  };
}
