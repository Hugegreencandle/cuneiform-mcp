// v0.52.0 — recommend_validation_target.
//
// Active-learning prioritizer: closes the v0.31 validation-resolutions loop.
//
// DESIGN CONSTRAINT: extracting v0.29 full features for arbitrary pairs is
// expensive (~30 sec/pair via compareTabletPair's 5 axes). For an
// interactive recommendation tool, we use a CHEAP proxy for model
// uncertainty:
//
//   - Pairs with HIGH chunk-overlap → model is confident positive
//   - Pairs with LOW chunk-overlap (but non-zero, so they're in the index)
//     → model is confident negative
//   - Pairs with MEDIUM chunk-overlap → model is uncertain — these are
//     the high-information-gain labeling targets
//
// The uncertainty score is computed against percentile bands of all
// chunk-overlap counts in the candidate pool. The band corresponding to
// the median (50th percentile) is the maximum-uncertainty region.
// Per-pair uncertainty = 1 − |2 × percentile − 1|, so percentile=0.5
// yields uncertainty=1.0 (peak), percentile=0 or 1 yields uncertainty=0.
//
// This is a HEURISTIC; the full v0.29-Bayesian-uncertainty version
// requires precomputed features (deferred to v0.53+).

import { getChunksContaining, loadChunkIndex } from "./chunkIndex.js";
import { loadResolutionsStore, canonicalPairId } from "./validationResolutions.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

export type ValidationTargetCandidate = {
  pair_id: string;
  tablet_a: string;
  tablet_b: string;
  chunk_overlap: number;
  overlap_percentile: number;       // 0 = lowest in pool, 1 = highest
  uncertainty_proxy: number;        // 1 − |2*percentile − 1| ∈ [0, 1]
  rationale: string;
};

export type RecommendValidationTargetResult = {
  query: {
    top_k: number;
    n_anchor_tablets: number;
    pairs_per_anchor: number;
    exclude_already_resolved: boolean;
  };
  candidates: ValidationTargetCandidate[];
  pool_stats: {
    candidate_pairs_considered: number;
    already_resolved_skipped: number;
    in_pool_after_filter: number;
    overlap_min: number;
    overlap_median: number;
    overlap_max: number;
  };
  v1_progress: {
    n_positives_in_store: number;
    v1_target: number;
    pairs_needed_to_reach_target: number;
  };
  warnings: string[];
};

export type RecommendValidationTargetOptions = {
  topK?: number;
  nAnchorTablets?: number;
  pairsPerAnchor?: number;
  excludeAlreadyResolved?: boolean;
};

export function recommendValidationTarget(
  opts: RecommendValidationTargetOptions = {},
): RecommendValidationTargetResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const topK = Math.max(1, Math.min(50, opts.topK ?? 10));
  const nAnchor = Math.max(1, Math.min(500, opts.nAnchorTablets ?? 100));
  const pairsPerAnchor = Math.max(1, Math.min(50, opts.pairsPerAnchor ?? 10));
  const excludeResolved = opts.excludeAlreadyResolved ?? true;

  const chunkIdx = loadChunkIndex();
  if (!chunkIdx) {
    warnings.push("chunk index not loaded — cannot build candidate pool");
    return emptyResult(topK, nAnchor, pairsPerAnchor, excludeResolved, warnings);
  }

  const tabletHostCount = new Map<string, number>();
  for (const entry of chunkIdx.entries) {
    for (const occ of entry.occurrences) {
      tabletHostCount.set(occ.tablet_id, (tabletHostCount.get(occ.tablet_id) ?? 0) + 1);
    }
  }
  const anchors = Array.from(tabletHostCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, nAnchor)
    .map(([id]) => id);

  const store = excludeResolved ? loadResolutionsStore() : null;
  const resolvedPairIds = new Set<string>(store?.resolutions.map((r) => r.pair_id) ?? []);

  type RawCandidate = { a: string; b: string; chunkOverlap: number; pairId: string };
  const seenPairs = new Set<string>();
  const pool: RawCandidate[] = [];
  let alreadyResolvedSkipped = 0;

  for (const anchor of anchors) {
    const anchorChunks = getChunksContaining(anchor);
    if (anchorChunks.length === 0) continue;
    const cohostFreq = new Map<string, number>();
    for (const c of anchorChunks) {
      for (const occ of c.occurrences) {
        if (occ.tablet_id === anchor) continue;
        cohostFreq.set(occ.tablet_id, (cohostFreq.get(occ.tablet_id) ?? 0) + 1);
      }
    }
    const cohosts = Array.from(cohostFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, pairsPerAnchor);
    for (const [cohost, overlap] of cohosts) {
      const pid = canonicalPairId(anchor, cohost);
      if (seenPairs.has(pid)) continue;
      seenPairs.add(pid);
      if (excludeResolved && resolvedPairIds.has(pid)) {
        alreadyResolvedSkipped++;
        continue;
      }
      pool.push({ a: anchor, b: cohost, chunkOverlap: overlap, pairId: pid });
    }
  }

  if (pool.length === 0) {
    return emptyResult(topK, nAnchor, pairsPerAnchor, excludeResolved, warnings, alreadyResolvedSkipped);
  }

  // Compute percentile ranks via sort.
  const overlapsSorted = pool.map((p) => p.chunkOverlap).sort((a, b) => a - b);
  const overlap_min = overlapsSorted[0];
  const overlap_median = overlapsSorted[Math.floor(overlapsSorted.length / 2)];
  const overlap_max = overlapsSorted[overlapsSorted.length - 1];

  function percentileOf(value: number): number {
    // Find first index with overlapsSorted[idx] >= value
    let lo = 0;
    let hi = overlapsSorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (overlapsSorted[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return overlapsSorted.length > 1 ? lo / (overlapsSorted.length - 1) : 0.5;
  }

  const candidates: ValidationTargetCandidate[] = pool.map((p) => {
    const pct = percentileOf(p.chunkOverlap);
    const uncertainty = 1 - Math.abs(2 * pct - 1);
    const [aSorted, bSorted] = [p.a, p.b].sort();
    const band =
      pct < 0.25
        ? "low-overlap band (likely negative)"
        : pct > 0.75
        ? "high-overlap band (likely positive)"
        : "mid-overlap band (most uncertain → highest info gain)";
    return {
      pair_id: p.pairId,
      tablet_a: aSorted,
      tablet_b: bSorted,
      chunk_overlap: p.chunkOverlap,
      overlap_percentile: pct,
      uncertainty_proxy: uncertainty,
      rationale: `chunk_overlap=${p.chunkOverlap} (percentile ${(pct * 100).toFixed(0)}%); ${band}. Labeling pairs in mid-overlap reduces variance most.`,
    };
  });

  candidates.sort(
    (a, b) => b.uncertainty_proxy - a.uncertainty_proxy || a.pair_id.localeCompare(b.pair_id),
  );

  const nPositives = store?.stats.n_positive ?? 0;
  const v1Target = 100;
  const bootstrap = store?.stats.bootstrap_positives_from_methods_paper ?? 12;
  const pairsToTarget = Math.max(0, v1Target - nPositives - bootstrap);

  return {
    query: {
      top_k: topK,
      n_anchor_tablets: nAnchor,
      pairs_per_anchor: pairsPerAnchor,
      exclude_already_resolved: excludeResolved,
    },
    candidates: candidates.slice(0, topK),
    pool_stats: {
      candidate_pairs_considered: pool.length + alreadyResolvedSkipped,
      already_resolved_skipped: alreadyResolvedSkipped,
      in_pool_after_filter: pool.length,
      overlap_min,
      overlap_median,
      overlap_max,
    },
    v1_progress: {
      n_positives_in_store: nPositives,
      v1_target: v1Target,
      pairs_needed_to_reach_target: pairsToTarget,
    },
    warnings,
  };
}

function emptyResult(
  topK: number,
  nAnchor: number,
  pairsPerAnchor: number,
  excludeResolved: boolean,
  warnings: string[],
  alreadyResolvedSkipped = 0,
): RecommendValidationTargetResult {
  return {
    query: { top_k: topK, n_anchor_tablets: nAnchor, pairs_per_anchor: pairsPerAnchor, exclude_already_resolved: excludeResolved },
    candidates: [],
    pool_stats: { candidate_pairs_considered: 0, already_resolved_skipped: alreadyResolvedSkipped, in_pool_after_filter: 0, overlap_min: 0, overlap_median: 0, overlap_max: 0 },
    v1_progress: { n_positives_in_store: 0, v1_target: 100, pairs_needed_to_reach_target: 88 },
    warnings,
  };
}
