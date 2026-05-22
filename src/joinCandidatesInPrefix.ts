// v0.18.16 — Per-prefix systematic physical-join candidate surfacing.
//
// The join-axis mirror of v0.18.11 `find_strongest_fuzzy_pairs_in_prefix`
// (lexical-axis) and v0.18.9 `find_scribal_groups` (scribal-axis). Asks:
// "within museum-collection prefix X, which tablet pairs look like candidates
// for PHYSICAL JOIN — i.e. fragments of one originally-whole tablet broken
// into multiple pieces and re-cataloged separately?" Joins are the highest-
// value discovery class for eBL editorial work since they directly enable
// reconstruction of lost text from now-physically-separated fragments.
//
// Algorithm (NOT a re-implementation of eBL's /match — we hold that channel
// for the existing per-tablet `find_join_candidates` tool which already wraps
// it via the local lineToVec scorer):
//
//   1. Iterate getAllTabletRecords() and filter to tablets in `prefix_filter`
//      with sign_count ≥ `min_sign_count` (default 50 — joins need enough
//      text on EACH side for the matcher to be confident).
//   2. Sort by sign_count desc (larger tablets first; fuzzy-J reliability
//      scales with trigram count, same as v0.18.11).
//   3. Cap at `max_tablets_to_scan` (default 500, max 5000).
//   4. For each seed, call findFuzzyParallels with topK=10 +
//      minFuzzyJaccard=`min_fuzzy_jaccard` (default 0.50 — VERY high; joins
//      typically have very-high fuzzy-J because the broken-along-the-edge
//      text is literally the same composition wording).
//   5. Keep only edges where BOTH endpoints are in the same prefix scan set.
//   6. For each candidate pair, look up FragmentMetadata.joins_count for
//      both endpoints; surface that as `a_has_known_joins` /
//      `b_has_known_joins` (boolean, joins_count > 0). Pairs where BOTH
//      tablets have NO known joins are the highest-value "untouched" join
//      candidates; pairs where one has joins but not the other suggest the
//      cataloger missed a piece of an already-known join cluster.
//   7. Canonical pair-key dedupe (same as v0.18.11): if observed from both
//      directions, take the MAX fuzzy_jaccard / longest_contiguous_run and
//      mark is_reciprocal.
//   8. Score by `fuzzy_jaccard * sqrt(min(sign_count_a, sign_count_b))` —
//      both endpoints must carry substantial text for a join to be real;
//      the sqrt of the smaller sign_count rewards substantial-fragment
//      pairs over a substantial-paired-with-tiny pair.
//   9. Sort by join_score desc, take top_n_candidates (default 30).
//
// Coverage caveat: `joins_count` lives in the FragmentMetadata cache
// (~226 entries as of 2026-05-22, ~0.6% corpus coverage). If most scanned
// tablets are missing from that cache, the a_has_known_joins / b_has_known_joins
// booleans will be conservatively `false` (treating "uncached" as "no known
// joins"). We surface a warning in that case directing the caller to run
// `enrich_prefix_metadata` first for accurate joins-coverage flags.
//
// Pure stdlib + reuse of findFuzzyParallels + getAllTabletRecords +
// getFragmentMetadata + metadataCoverage. No network in this tool.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getAllTabletRecords } from "./anomalySurface.js";
import { getFragmentMetadata, isInCache, metadataCoverage } from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type JoinCandidate = {
  tablet_a: string;
  tablet_b: string;
  prefix: string;
  fuzzy_jaccard: number;
  longest_contiguous_run: number;
  sign_count_a: number;
  sign_count_b: number;
  join_score: number;
  a_has_known_joins: boolean;
  b_has_known_joins: boolean;
  is_reciprocal: boolean;
};

export type JoinCandidatesSummary = {
  total_tablets_scanned: number;
  total_candidates_surfaced: number;
  total_candidates_collected: number;
  mean_fuzzy_jaccard: number;
  total_with_known_joins_either_side: number;
  total_with_no_known_joins_either_side: number;
  reciprocal_pair_count: number;
};

export type FindJoinCandidatesInPrefixResult = {
  query: {
    prefix_filter: string;
    min_fuzzy_jaccard: number;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_n_candidates: number;
  };
  candidates: JoinCandidate[];
  summary: JoinCandidatesSummary;
  warnings: string[];
};

export type FindJoinCandidatesInPrefixOptions = {
  prefixFilter: string;
  minFuzzyJaccard?: number; // default 0.50
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500, max 5000
  topNCandidates?: number; // default 30, max 200
};

// ─── Internals ─────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function joinsCountFor(tabletId: string): number {
  const meta = getFragmentMetadata(tabletId);
  if (!meta) return 0;
  return typeof meta.joins_count === "number" ? meta.joins_count : 0;
}

type EdgeAccumulator = {
  tablet_a: string;
  tablet_b: string;
  sign_count_a: number;
  sign_count_b: number;
  fuzzy_jaccard: number;
  longest_contiguous_run: number;
  directions: Set<string>;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

function emptyResult(
  query: FindJoinCandidatesInPrefixResult["query"],
  warnings: string[],
): FindJoinCandidatesInPrefixResult {
  return {
    query,
    candidates: [],
    summary: {
      total_tablets_scanned: 0,
      total_candidates_surfaced: 0,
      total_candidates_collected: 0,
      mean_fuzzy_jaccard: 0,
      total_with_known_joins_either_side: 0,
      total_with_no_known_joins_either_side: 0,
      reciprocal_pair_count: 0,
    },
    warnings,
  };
}

// ─── Public entry ──────────────────────────────────────────────────────────

export function findJoinCandidatesInPrefix(
  opts: FindJoinCandidatesInPrefixOptions,
): FindJoinCandidatesInPrefixResult {
  const prefixFilter = opts.prefixFilter;
  const minFuzzyJ = Math.max(0, Math.min(1, opts.minFuzzyJaccard ?? 0.5));
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topN = Math.max(1, Math.min(200, opts.topNCandidates ?? 30));
  const warnings: string[] = [];

  const query: FindJoinCandidatesInPrefixResult["query"] = {
    prefix_filter: prefixFilter,
    min_fuzzy_jaccard: minFuzzyJ,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_n_candidates: topN,
  };

  if (!prefixFilter || prefixFilter.length === 0) {
    return emptyResult(query, [
      "prefix_filter is required — this tool scopes to a single museum-collection bucket. Use list_collection_prefixes to enumerate options.",
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Build the scan list: prefix + min-sign-count, sorted by sign_count desc,
  // capped at maxScan. Larger tablets first — same as v0.18.11.
  const scanList = tablets
    .filter((t) => prefixOf(t.id) === prefixFilter)
    .filter((t) => t.sign_count >= minSignCount)
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the scan criteria (prefix=${prefixFilter}, min_sign_count=${minSignCount}).`,
    );
    return emptyResult(query, warnings);
  }

  const scanIdSet = new Set(scanList.map((t) => t.id));
  const signCountById = new Map<string, number>();
  for (const t of scanList) signCountById.set(t.id, t.sign_count);

  const edges = new Map<string, EdgeAccumulator>();

  // Same bail-out heuristic as v0.18.11: if the first tablet returns an
  // index-unavailable warning and zero parallels, abort to avoid burning
  // 500 useless calls.
  let indexUnavailableWarning: string | null = null;
  let scannedWithResults = 0;

  for (const seed of scanList) {
    const result = findFuzzyParallels({
      tabletId: seed.id,
      topK: 10,
      minFuzzyJaccard: minFuzzyJ,
    });

    if (result.parallels.length === 0 && result.warnings.length > 0) {
      if (indexUnavailableWarning === null) {
        indexUnavailableWarning = result.warnings[0];
      }
      const looksLikeIndexFailure =
        /not loaded|cache not found|fuzzy index unavailable/i.test(indexUnavailableWarning);
      if (looksLikeIndexFailure && scannedWithResults === 0) {
        warnings.push(indexUnavailableWarning);
        return emptyResult(query, warnings);
      }
      continue;
    }

    if (result.parallels.length > 0) scannedWithResults++;

    for (const par of result.parallels) {
      // Within-prefix only — joins are necessarily intra-collection.
      if (!scanIdSet.has(par.tablet_id)) continue;
      if (par.tablet_id === seed.id) continue;

      const key = pairKey(seed.id, par.tablet_id);
      const direction = seed.id < par.tablet_id ? "a_to_b" : "b_to_a";
      const existing = edges.get(key);

      if (existing) {
        existing.directions.add(direction);
        if (par.fuzzy_jaccard > existing.fuzzy_jaccard) {
          existing.fuzzy_jaccard = par.fuzzy_jaccard;
        }
        if (par.longest_contiguous_run > existing.longest_contiguous_run) {
          existing.longest_contiguous_run = par.longest_contiguous_run;
        }
      } else {
        const [a, b] = seed.id < par.tablet_id
          ? [seed.id, par.tablet_id]
          : [par.tablet_id, seed.id];
        edges.set(key, {
          tablet_a: a,
          tablet_b: b,
          sign_count_a: signCountById.get(a) ?? 0,
          sign_count_b: signCountById.get(b) ?? 0,
          fuzzy_jaccard: par.fuzzy_jaccard,
          longest_contiguous_run: par.longest_contiguous_run,
          directions: new Set([direction]),
        });
      }
    }
  }

  if (indexUnavailableWarning !== null && edges.size === 0) {
    warnings.push(indexUnavailableWarning);
    return emptyResult(query, warnings);
  }

  // Score + materialize.
  const allCandidates: JoinCandidate[] = [];
  for (const e of edges.values()) {
    const minSigns = Math.min(e.sign_count_a, e.sign_count_b);
    const joinScore = e.fuzzy_jaccard * Math.sqrt(Math.max(0, minSigns));
    const aJoins = joinsCountFor(e.tablet_a);
    const bJoins = joinsCountFor(e.tablet_b);
    allCandidates.push({
      tablet_a: e.tablet_a,
      tablet_b: e.tablet_b,
      prefix: prefixFilter,
      fuzzy_jaccard: +e.fuzzy_jaccard.toFixed(4),
      longest_contiguous_run: e.longest_contiguous_run,
      sign_count_a: e.sign_count_a,
      sign_count_b: e.sign_count_b,
      join_score: +joinScore.toFixed(4),
      a_has_known_joins: aJoins > 0,
      b_has_known_joins: bJoins > 0,
      is_reciprocal: e.directions.size >= 2,
    });
  }
  allCandidates.sort((a, b) => {
    if (b.join_score !== a.join_score) return b.join_score - a.join_score;
    return b.fuzzy_jaccard - a.fuzzy_jaccard;
  });

  const topCandidates = allCandidates.slice(0, topN);

  // Fragment-metadata coverage check on the SCAN set. If most scanned
  // tablets aren't in the metadata cache, the joins-count flags are
  // unreliable (uncached → false). Surface this as a warning.
  let scanIdsInMetadataCache = 0;
  for (const t of scanList) {
    if (isInCache(t.id)) scanIdsInMetadataCache++;
  }
  const scanCoverage = scanList.length > 0 ? scanIdsInMetadataCache / scanList.length : 0;
  if (scanCoverage < 0.25) {
    const cov = metadataCoverage();
    warnings.push(
      `fragment-metadata coverage low for scan set: ${scanIdsInMetadataCache}/${scanList.length} ` +
        `(${(scanCoverage * 100).toFixed(1)}%) of scanned tablets have FragmentMetadata cached ` +
        `(global cache: ${cov.total_with_metadata} entries with data, ${cov.total_null} null). ` +
        `joins_count fields default to 0 for uncached tablets, so a_has_known_joins / ` +
        `b_has_known_joins flags may be conservatively false. Run enrich_prefix_metadata ` +
        `for prefix=${prefixFilter} first for accurate join-coverage flags.`,
    );
  }

  // Summary stats over the RETURNED top-N (consistent with v0.18.11).
  const returnedJ = topCandidates.map((c) => c.fuzzy_jaccard);
  let withKnownJoinsEither = 0;
  let withNoKnownJoinsEither = 0;
  for (const c of topCandidates) {
    if (c.a_has_known_joins || c.b_has_known_joins) withKnownJoinsEither++;
    else withNoKnownJoinsEither++;
  }
  const reciprocalCount = topCandidates.filter((c) => c.is_reciprocal).length;

  return {
    query,
    candidates: topCandidates,
    summary: {
      total_tablets_scanned: scanList.length,
      total_candidates_surfaced: topCandidates.length,
      total_candidates_collected: allCandidates.length,
      mean_fuzzy_jaccard: +mean(returnedJ).toFixed(4),
      total_with_known_joins_either_side: withKnownJoinsEither,
      total_with_no_known_joins_either_side: withNoKnownJoinsEither,
      reciprocal_pair_count: reciprocalCount,
    },
    warnings,
  };
}
