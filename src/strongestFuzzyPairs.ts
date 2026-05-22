// v0.18.11 — Per-prefix top-N strongest fuzzy-Jaccard pair discovery.
//
// Generalizes the per-tablet `find_fuzzy_parallels` (v0.17.0) to systematic
// within-collection pair surfacing: instead of asking "what's most similar to
// THIS tablet?", ask "within prefix X, what are the strongest sibling-manuscript
// candidate pairs ANYWHERE in the bucket?". The per-collection analogue to
// `find_scribal_groups` (v0.18.9), but along the fuzzy lexical axis rather
// than the scribal-signature axis.
//
// Motivation: the v0.17 calibration audit recovered the K.2798 ↔ Si.776 pair
// (a methods-paper-grade missed sibling) only because Dane probed K.2798
// directly. The systematic question — "what OTHER such pairs exist within a
// collection that nobody has probed?" — was unanswerable without iterating
// every tablet manually. This tool answers it in one call.
//
// Algorithm:
//   1. Iterate over tablets in the requested prefix (bounded by
//      min_sign_count + max_tablets_to_scan, prioritizing larger tablets
//      since fuzzy-J is more reliable with more trigrams)
//   2. For each tablet, call findFuzzyParallels with the configured topK
//      and minFuzzyJaccard
//   3. Filter returned parallels to those in the SAME prefix
//   4. Collect edges via canonical sorted pair-key; if observed from both
//      directions, keep the max fuzzy-J + mark is_reciprocal=true
//   5. Sort edges by fuzzy_jaccard desc, take top_n_pairs
//   6. Compute per-tablet involvement counts (cluster-hub candidates) +
//      edge-weight summary stats
//
// Performance: O(N × fuzzy-query-cost) where N = tablets in prefix.
// Default cap of 500 tablets ≈ 30s on a warm fuzzy index. Major prefixes
// (K=2500+) need max_tablets_to_scan raised to 2500-3000 for full coverage
// and complete in a few minutes.
//
// Pure stdlib + reuse of findFuzzyParallels + getAllTabletRecords.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type StrongestFuzzyPair = {
  tablet_a: string;
  tablet_b: string;
  fuzzy_jaccard: number;
  exact_jaccard: number;
  longest_contiguous_run: number;
  final_score: number;
  is_reciprocal: boolean;
};

export type InvolvedTablet = {
  tablet_id: string;
  pair_count: number;
  max_fuzzy_jaccard: number;
};

export type StrongestFuzzyPairsSummary = {
  total_pairs_returned: number;
  total_pairs_collected: number;
  tablets_scanned: number;
  tablets_with_any_pair: number;
  edge_weight: {
    min_fuzzy_jaccard: number;
    median_fuzzy_jaccard: number;
    max_fuzzy_jaccard: number;
  };
  reciprocal_pair_count: number;
};

export type FindStrongestFuzzyPairsResult = {
  query: {
    prefix_filter: string;
    min_fuzzy_jaccard: number;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_k_per_tablet: number;
    top_n_pairs: number;
  };
  pairs: StrongestFuzzyPair[];
  top_involved_tablets: InvolvedTablet[];
  summary: StrongestFuzzyPairsSummary;
  warnings: string[];
};

export type FindStrongestFuzzyPairsOptions = {
  prefixFilter: string;
  minFuzzyJaccard?: number; // default 0.20
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500, max 5000
  topKPerTablet?: number; // default 15
  topNPairs?: number; // default 50, max 500
};

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type EdgeAccumulator = {
  tablet_a: string;
  tablet_b: string;
  fuzzy_jaccard: number;
  exact_jaccard: number;
  longest_contiguous_run: number;
  final_score: number;
  directions: Set<string>;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function emptyResult(
  query: FindStrongestFuzzyPairsResult["query"],
  warnings: string[],
): FindStrongestFuzzyPairsResult {
  return {
    query,
    pairs: [],
    top_involved_tablets: [],
    summary: {
      total_pairs_returned: 0,
      total_pairs_collected: 0,
      tablets_scanned: 0,
      tablets_with_any_pair: 0,
      edge_weight: { min_fuzzy_jaccard: 0, median_fuzzy_jaccard: 0, max_fuzzy_jaccard: 0 },
      reciprocal_pair_count: 0,
    },
    warnings,
  };
}

export function findStrongestFuzzyPairs(
  opts: FindStrongestFuzzyPairsOptions,
): FindStrongestFuzzyPairsResult {
  const prefixFilter = opts.prefixFilter;
  const minFuzzyJ = Math.max(0, Math.min(1, opts.minFuzzyJaccard ?? 0.20));
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topK = Math.max(2, Math.min(50, opts.topKPerTablet ?? 15));
  const topN = Math.max(1, Math.min(500, opts.topNPairs ?? 50));
  const warnings: string[] = [];

  const query: FindStrongestFuzzyPairsResult["query"] = {
    prefix_filter: prefixFilter,
    min_fuzzy_jaccard: minFuzzyJ,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_k_per_tablet: topK,
    top_n_pairs: topN,
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

  // Build the scan list: tablets in the requested prefix, with sign_count
  // ≥ threshold, sorted by sign_count desc (larger tablets first since
  // fuzzy-J reliability scales with trigram count).
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
  const edges = new Map<string, EdgeAccumulator>();

  // Track whether any scan tablet produced an actionable fuzzy result. If
  // the corpus / fuzzy index isn't loaded, every call returns a warning;
  // we collect at most one such warning to surface it at the end.
  let indexUnavailableWarning: string | null = null;
  let scannedWithResults = 0;

  for (const seed of scanList) {
    const result = findFuzzyParallels({
      tabletId: seed.id,
      topK,
      minFuzzyJaccard: minFuzzyJ,
    });

    if (result.parallels.length === 0 && result.warnings.length > 0) {
      // First-time index-unavailable warning — bail out so we don't burn
      // 500 useless calls. The corpus is loaded lazily on first invocation
      // so a missing-cache message will be deterministic across the loop.
      if (indexUnavailableWarning === null) {
        indexUnavailableWarning = result.warnings[0];
      }
      // Heuristic: if the warning mentions the index or tablet membership
      // and it's the FIRST tablet we've tried, abort to avoid wasted work.
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
      // Within-prefix constraint: only count edges where the partner is
      // also in this prefix's scan set. (Cross-prefix edges are the
      // domain of find_cross_prefix_scribal_links / future fuzzy variant.)
      if (!scanIdSet.has(par.tablet_id)) continue;
      if (par.tablet_id === seed.id) continue;

      const key = pairKey(seed.id, par.tablet_id);
      const direction = seed.id < par.tablet_id ? "a_to_b" : "b_to_a";
      const existing = edges.get(key);

      if (existing) {
        // Keep the BEST observation of this edge across both directions.
        // The fuzzy_intersection is symmetric in trigram-set terms but
        // contiguous-run / examples are asymmetric (depend on which
        // tablet's ordered stream is the query), so different directions
        // can yield slightly different final_scores.
        existing.directions.add(direction);
        if (par.fuzzy_jaccard > existing.fuzzy_jaccard) {
          existing.fuzzy_jaccard = par.fuzzy_jaccard;
        }
        if (par.exact_jaccard > existing.exact_jaccard) {
          existing.exact_jaccard = par.exact_jaccard;
        }
        if (par.longest_contiguous_run > existing.longest_contiguous_run) {
          existing.longest_contiguous_run = par.longest_contiguous_run;
        }
        if (par.final_score > existing.final_score) {
          existing.final_score = par.final_score;
        }
      } else {
        const [a, b] = seed.id < par.tablet_id
          ? [seed.id, par.tablet_id]
          : [par.tablet_id, seed.id];
        edges.set(key, {
          tablet_a: a,
          tablet_b: b,
          fuzzy_jaccard: par.fuzzy_jaccard,
          exact_jaccard: par.exact_jaccard,
          longest_contiguous_run: par.longest_contiguous_run,
          final_score: par.final_score,
          directions: new Set([direction]),
        });
      }
    }
  }

  if (indexUnavailableWarning !== null && edges.size === 0) {
    warnings.push(indexUnavailableWarning);
    return emptyResult(query, warnings);
  }

  // Materialize, sort by fuzzy_jaccard desc, then by final_score desc as
  // tie-breaker; take top_n.
  const allPairs: StrongestFuzzyPair[] = [];
  for (const e of edges.values()) {
    allPairs.push({
      tablet_a: e.tablet_a,
      tablet_b: e.tablet_b,
      fuzzy_jaccard: +e.fuzzy_jaccard.toFixed(4),
      exact_jaccard: +e.exact_jaccard.toFixed(4),
      longest_contiguous_run: e.longest_contiguous_run,
      final_score: +e.final_score.toFixed(4),
      is_reciprocal: e.directions.size >= 2,
    });
  }
  allPairs.sort((a, b) => {
    if (b.fuzzy_jaccard !== a.fuzzy_jaccard) return b.fuzzy_jaccard - a.fuzzy_jaccard;
    return b.final_score - a.final_score;
  });

  const topPairs = allPairs.slice(0, topN);

  // Per-tablet involvement counts — surface cluster-hub candidates.
  // Compute against the RETURNED top-N pairs (not all collected), so
  // hubs reflect the strongest-edge set rather than weak-edge noise.
  const involvement = new Map<string, { count: number; maxJ: number }>();
  for (const p of topPairs) {
    for (const id of [p.tablet_a, p.tablet_b]) {
      const prev = involvement.get(id);
      if (prev) {
        prev.count++;
        if (p.fuzzy_jaccard > prev.maxJ) prev.maxJ = p.fuzzy_jaccard;
      } else {
        involvement.set(id, { count: 1, maxJ: p.fuzzy_jaccard });
      }
    }
  }
  const topInvolved: InvolvedTablet[] = Array.from(involvement.entries())
    .map(([tablet_id, v]) => ({
      tablet_id,
      pair_count: v.count,
      max_fuzzy_jaccard: +v.maxJ.toFixed(4),
    }))
    .sort((a, b) => {
      if (b.pair_count !== a.pair_count) return b.pair_count - a.pair_count;
      return b.max_fuzzy_jaccard - a.max_fuzzy_jaccard;
    })
    .slice(0, 10);

  // Edge-weight summary over the RETURNED top-N (not all collected).
  const returnedJ = topPairs.map((p) => p.fuzzy_jaccard);
  const reciprocalCount = topPairs.filter((p) => p.is_reciprocal).length;

  const tabletsWithAnyPair = new Set<string>();
  for (const p of allPairs) {
    tabletsWithAnyPair.add(p.tablet_a);
    tabletsWithAnyPair.add(p.tablet_b);
  }

  return {
    query,
    pairs: topPairs,
    top_involved_tablets: topInvolved,
    summary: {
      total_pairs_returned: topPairs.length,
      total_pairs_collected: allPairs.length,
      tablets_scanned: scanList.length,
      tablets_with_any_pair: tabletsWithAnyPair.size,
      edge_weight: {
        min_fuzzy_jaccard: returnedJ.length > 0 ? +Math.min(...returnedJ).toFixed(4) : 0,
        median_fuzzy_jaccard: returnedJ.length > 0 ? +median(returnedJ).toFixed(4) : 0,
        max_fuzzy_jaccard: returnedJ.length > 0 ? +Math.max(...returnedJ).toFixed(4) : 0,
      },
      reciprocal_pair_count: reciprocalCount,
    },
    warnings,
  };
}
