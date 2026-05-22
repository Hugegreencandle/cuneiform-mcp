// v0.18.17 — Isolate-composition discovery (substantial + few parallels).
//
// Surfaces tablets that are SUBSTANTIAL (high sign count) but have FEW
// fuzzy parallels in the corpus — i.e., compositions that are NOT well-
// represented by multiple witnesses. These are candidates for:
//   (a) unique surviving compositions of historical significance,
//   (b) compositions studied as singletons in the secondary literature,
//   (c) the "we have only one witness — handle with care" sub-cohort that
//       belongs in pitch material + the methods-paper single-witness corner.
//
// Different from find_anomalous_tablets (bi-orphan = lexically AND
// thematically isolated, with any sign_count). This tool is specifically
// the "lexically-isolated AND substantial" intersection — short fragments
// with no parallels are not interesting (they're just under-attested);
// the prize is a 400-sign tablet that stands alone in the trigram graph.
//
// Algorithm:
//   1. Iterate getAllTabletRecords(), filter by min_sign_count (default 200,
//      i.e. SUBSTANTIAL only) + optional prefix.
//   2. For each survivor, call findFuzzyParallels(topK=10, minJ=0.20).
//   3. parallel_count = parallels above threshold.
//   4. Keep tablets where parallel_count <= max_parallel_count (default 2).
//   5. Score by isolation_score = sign_count / (parallel_count + 1) — large
//      + few parallels = high isolation. The +1 keeps zero-parallel cases
//      finite and rank-comparable.
//   6. Return top-N sorted by isolation_score desc.
//
// Pure stdlib + reuse of findFuzzyParallels + getAllTabletRecords +
// fragmentMetadata helpers. No new deps.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type IsolateComposition = {
  tablet_id: string;
  prefix: string;
  sign_count: number;
  parallel_count: number;
  isolation_score: number;
  top_parallel_id: string | null;
  top_parallel_fuzzy_j: number;
  period: string | null;
  city: string | null;
  designation: string | null;
};

export type IsolateCompositionsSummary = {
  total_tablets_scanned: number;
  total_isolates_surfaced: number;
  mean_isolation_score: number;
  prefix_distribution: Record<string, number>;
};

export type FindIsolateCompositionsResult = {
  query: {
    prefix_filter: string | null;
    min_sign_count: number;
    max_parallel_count: number;
    min_fuzzy_jaccard: number;
    max_tablets_to_scan: number;
    top_n: number;
  };
  isolates: IsolateComposition[];
  summary: IsolateCompositionsSummary;
  warnings: string[];
};

export type FindIsolateCompositionsOptions = {
  prefixFilter?: string;
  minSignCount?: number; // default 200 — substantial-only
  maxParallelCount?: number; // default 2 — <=2 parallels = isolated
  minFuzzyJaccard?: number; // default 0.20 — parallel threshold
  maxTabletsToScan?: number; // default 500, max 5000
  topN?: number; // default 30
};

// Internal: probe topK. We ask for 10 parallels so a tablet that just sits
// at parallel_count=3 (just over the default cutoff) is still distinguishable
// from one with parallel_count=10 — useful when callers raise
// max_parallel_count to widen the surface.
const FUZZY_PROBE_TOPK = 10;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function emptyResult(
  query: FindIsolateCompositionsResult["query"],
  warnings: string[],
): FindIsolateCompositionsResult {
  return {
    query,
    isolates: [],
    summary: {
      total_tablets_scanned: 0,
      total_isolates_surfaced: 0,
      mean_isolation_score: 0,
      prefix_distribution: {},
    },
    warnings,
  };
}

export function findIsolateCompositions(
  opts: FindIsolateCompositionsOptions,
): FindIsolateCompositionsResult {
  const prefixFilter =
    opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const minSignCount = Math.max(0, opts.minSignCount ?? 200);
  const maxParallelCount = Math.max(0, opts.maxParallelCount ?? 2);
  const minFuzzyJaccard = Math.max(0, Math.min(1, opts.minFuzzyJaccard ?? 0.20));
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topN = Math.max(1, Math.min(500, opts.topN ?? 30));
  const warnings: string[] = [];

  const query: FindIsolateCompositionsResult["query"] = {
    prefix_filter: prefixFilter,
    min_sign_count: minSignCount,
    max_parallel_count: maxParallelCount,
    min_fuzzy_jaccard: minFuzzyJaccard,
    max_tablets_to_scan: maxScan,
    top_n: topN,
  };

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Build the scan list: tablets above the sign-count floor (optionally
  // scoped to one prefix), sorted by sign_count desc so the biggest /
  // most-substantial candidates get probed first. Bounded by maxScan.
  const sizeFilteredAll = tablets.filter((t) => {
    if (prefixFilter !== null && prefixOf(t.id) !== prefixFilter) return false;
    if (t.sign_count < minSignCount) return false;
    return true;
  });

  const scanList = [...sizeFilteredAll]
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match sign_count >= ${minSignCount}${
        prefixFilter !== null ? ` and prefix=${prefixFilter}` : ""
      }. Lower min_sign_count or drop prefix_filter to widen the surface.`,
    );
    return emptyResult(query, warnings);
  }

  // Track whether the fuzzy index is missing — if the FIRST probe returns
  // an index-failure warning, bail out so we don't burn maxScan calls.
  let indexUnavailableWarning: string | null = null;
  let probedWithResults = 0;

  const isolates: IsolateComposition[] = [];

  for (const seed of scanList) {
    const fuzzy = findFuzzyParallels({
      tabletId: seed.id,
      topK: FUZZY_PROBE_TOPK,
      minFuzzyJaccard: minFuzzyJaccard,
    });

    if (fuzzy.parallels.length === 0 && fuzzy.warnings.length > 0) {
      if (indexUnavailableWarning === null) {
        indexUnavailableWarning = fuzzy.warnings[0];
      }
      const looksLikeIndexFailure =
        /not loaded|cache not found|fuzzy index unavailable/i.test(
          indexUnavailableWarning,
        );
      if (looksLikeIndexFailure && probedWithResults === 0) {
        warnings.push(indexUnavailableWarning);
        return emptyResult(query, warnings);
      }
      // Tablet simply isn't in the fuzzy index — treat as zero parallels
      // (which IS the isolation signal we're looking for). Fall through.
    } else if (fuzzy.parallels.length > 0) {
      probedWithResults++;
    }

    const parallelCount = fuzzy.parallels.length;
    if (parallelCount > maxParallelCount) continue;

    const top = parallelCount > 0 ? fuzzy.parallels[0] : null;
    const isolationScore = seed.sign_count / (parallelCount + 1);

    const meta = getFragmentMetadata(seed.id);
    const period = getPeriod(meta) ?? seed.period ?? null;
    const city = getCity(meta) ?? seed.city ?? null;
    const designation = (meta && meta.designation) ?? seed.designation ?? null;

    isolates.push({
      tablet_id: seed.id,
      prefix: prefixOf(seed.id),
      sign_count: seed.sign_count,
      parallel_count: parallelCount,
      isolation_score: +isolationScore.toFixed(4),
      top_parallel_id: top ? top.tablet_id : null,
      top_parallel_fuzzy_j: top ? +top.fuzzy_jaccard.toFixed(4) : 0,
      period,
      city,
      designation,
    });
  }

  if (indexUnavailableWarning !== null && isolates.length === 0) {
    warnings.push(indexUnavailableWarning);
    return emptyResult(query, warnings);
  }

  isolates.sort((a, b) => {
    if (b.isolation_score !== a.isolation_score) {
      return b.isolation_score - a.isolation_score;
    }
    // Tie-break: prefer larger surviving context (more text to study),
    // then fewer parallels (more isolated), then lower top-parallel j.
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    if (a.parallel_count !== b.parallel_count) {
      return a.parallel_count - b.parallel_count;
    }
    return a.top_parallel_fuzzy_j - b.top_parallel_fuzzy_j;
  });

  const topIsolates = isolates.slice(0, topN);

  // Summary stats — computed over the RETURNED set so means reflect what
  // the user will see in `isolates`, not the larger discarded pool.
  const meanIsolation =
    topIsolates.length > 0
      ? topIsolates.reduce((sum, c) => sum + c.isolation_score, 0) /
        topIsolates.length
      : 0;

  const prefixDistribution: Record<string, number> = {};
  for (const c of topIsolates) {
    prefixDistribution[c.prefix] = (prefixDistribution[c.prefix] ?? 0) + 1;
  }

  return {
    query,
    isolates: topIsolates,
    summary: {
      total_tablets_scanned: scanList.length,
      total_isolates_surfaced: isolates.length,
      mean_isolation_score: +meanIsolation.toFixed(4),
      prefix_distribution: prefixDistribution,
    },
    warnings,
  };
}
