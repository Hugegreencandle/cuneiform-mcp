// v0.18.12 — Lacuna-restoration backlog discovery.
//
// Discovery + workflow-primer for the v0.18.0 `restore_lacuna_passage` tool:
// surfaces tablets where (a) restoration is NEEDED (high X-token ratio,
// indicating missing/broken signs) AND (b) restoration is POSSIBLE (strong
// fuzzy parallels exist, so the restorer has templates from which to predict
// the missing signs). The intersection is the high-value restoration backlog.
//
// Motivation: the lacuna restorer is only as good as the parallel-template
// pool it has to draw from. Iterating "every damaged tablet" is wasteful —
// half are practically destroyed (no surviving context) and many lack any
// fuzzy parallels strong enough to drive prediction. Iterating "every tablet
// with fuzzy parallels" wastes the restorer on essentially-complete tablets.
// This tool answers: which tablets sit in the sweet spot where the restorer
// will actually produce useful output?
//
// Algorithm:
//   1. Iterate tablets (optionally scoped by prefix), filtering by
//      sign_count >= min and x_ratio in [min_damage, max_damage].
//      Defaults: 10%-50% damaged, >= 50 signs.
//   2. For each candidate, call findFuzzyParallels(topK=5, minJ=0.15) — a
//      LOW fuzzy threshold because restoration uses parallels as templates,
//      not as identity claims; even weak parallels can supply a sign-bigram
//      distribution that beats a uniform prior.
//   3. Compute restoration_priority_score = damage_ratio × strongest_fuzzy_j.
//      Equal-weight reward: a 30%-damaged tablet with a 0.7 parallel (0.21)
//      beats a 10%-damaged tablet with a 0.9 parallel (0.09).
//   4. Sort by priority desc, return top_n.
//
// Sweet spot: 0.10 < x_ratio < 0.40. Below ~0.05 = restoration unnecessary.
// Above ~0.50 = too little surviving context for the restorer's n-gram
// conditioning to converge (Mīs pî K.5896 / K.2761 are honorable exceptions
// the user can chase manually with a raised max_damage_ratio).
//
// Pure stdlib + reuse of findFuzzyParallels + getAllTabletRecords.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type LacunaRestorationCandidate = {
  tablet_id: string;
  prefix: string;
  sign_count: number;
  x_ratio: number;
  damaged_sign_count: number;
  strongest_parallel_id: string | null;
  strongest_parallel_fuzzy_j: number;
  strongest_parallel_run: number;
  parallel_count_above_threshold: number;
  restoration_priority_score: number;
};

export type LacunaRestorationSummary = {
  total_tablets_scanned: number;
  total_candidates_with_damage: number;
  total_candidates_surfaced: number;
  mean_damage_ratio: number;
  mean_priority_score: number;
};

export type FindLacunaRestorationCandidatesResult = {
  query: {
    prefix_filter: string | null;
    min_damage_ratio: number;
    max_damage_ratio: number;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_n_candidates: number;
  };
  candidates: LacunaRestorationCandidate[];
  summary: LacunaRestorationSummary;
  warnings: string[];
};

export type FindLacunaRestorationCandidatesOptions = {
  prefixFilter?: string;
  minDamageRatio?: number; // default 0.10
  maxDamageRatio?: number; // default 0.50
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500, max 5000
  topNCandidates?: number; // default 30
};

// Internal: fuzzy threshold for the restorer-driven probe. Deliberately low
// (0.15) — restoration uses parallels as conditioning templates, not as
// identity matches, so weaker edges still contribute useful signal.
const FUZZY_PROBE_THRESHOLD = 0.15;
const FUZZY_PROBE_TOPK = 5;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function emptyResult(
  query: FindLacunaRestorationCandidatesResult["query"],
  warnings: string[],
): FindLacunaRestorationCandidatesResult {
  return {
    query,
    candidates: [],
    summary: {
      total_tablets_scanned: 0,
      total_candidates_with_damage: 0,
      total_candidates_surfaced: 0,
      mean_damage_ratio: 0,
      mean_priority_score: 0,
    },
    warnings,
  };
}

export function findLacunaRestorationCandidates(
  opts: FindLacunaRestorationCandidatesOptions,
): FindLacunaRestorationCandidatesResult {
  const prefixFilter =
    opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const minDamage = Math.max(0, Math.min(1, opts.minDamageRatio ?? 0.10));
  const maxDamage = Math.max(0, Math.min(1, opts.maxDamageRatio ?? 0.50));
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topN = Math.max(1, Math.min(500, opts.topNCandidates ?? 30));
  const warnings: string[] = [];

  const query: FindLacunaRestorationCandidatesResult["query"] = {
    prefix_filter: prefixFilter,
    min_damage_ratio: minDamage,
    max_damage_ratio: maxDamage,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_n_candidates: topN,
  };

  if (minDamage >= maxDamage) {
    return emptyResult(query, [
      `min_damage_ratio (${minDamage}) must be < max_damage_ratio (${maxDamage}). No tablets can match an empty interval.`,
    ]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(query, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Build the scan list: tablets in the damage window, with enough surviving
  // signs to be worth restoring, sorted by sign_count desc (larger surviving
  // contexts give the fuzzy probe + downstream restorer more to work with).
  // We bound the scan to maxScan to keep cost predictable.
  const damageFilteredAll = tablets.filter((t) => {
    if (prefixFilter !== null && prefixOf(t.id) !== prefixFilter) return false;
    if (t.sign_count < minSignCount) return false;
    const x = t.x_ratio ?? 0;
    if (x < minDamage) return false;
    if (x > maxDamage) return false;
    return true;
  });

  const scanList = [...damageFilteredAll]
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match damage window [${minDamage}, ${maxDamage}] with sign_count >= ${minSignCount}${
        prefixFilter !== null ? ` and prefix=${prefixFilter}` : ""
      }.`,
    );
    return emptyResult(query, warnings);
  }

  // Track whether the fuzzy index is missing — if the FIRST probe returns
  // an index-failure warning, bail out so we don't burn maxScan calls.
  let indexUnavailableWarning: string | null = null;
  let probedWithResults = 0;

  const candidates: LacunaRestorationCandidate[] = [];

  for (const seed of scanList) {
    const fuzzy = findFuzzyParallels({
      tabletId: seed.id,
      topK: FUZZY_PROBE_TOPK,
      minFuzzyJaccard: FUZZY_PROBE_THRESHOLD,
    });

    if (fuzzy.parallels.length === 0 && fuzzy.warnings.length > 0) {
      if (indexUnavailableWarning === null) {
        indexUnavailableWarning = fuzzy.warnings[0];
      }
      const looksLikeIndexFailure =
        /not loaded|cache not found|fuzzy index unavailable/i.test(indexUnavailableWarning);
      if (looksLikeIndexFailure && probedWithResults === 0) {
        warnings.push(indexUnavailableWarning);
        return emptyResult(query, warnings);
      }
      // Otherwise: this tablet simply isn't in the fuzzy index (e.g. short
      // fragment skipped at index-build time). Skip it — no parallel = no
      // restoration template = not a candidate.
      continue;
    }

    if (fuzzy.parallels.length === 0) {
      // No parallels above threshold — restorer would fall back to a
      // uniform prior. Not a candidate.
      continue;
    }

    probedWithResults++;

    const strongest = fuzzy.parallels[0]; // already sorted by final_score desc
    const xRatio = seed.x_ratio ?? 0;
    const damagedSignCount = Math.round(seed.sign_count * xRatio);
    const priority = xRatio * strongest.fuzzy_jaccard;

    candidates.push({
      tablet_id: seed.id,
      prefix: prefixOf(seed.id),
      sign_count: seed.sign_count,
      x_ratio: +xRatio.toFixed(4),
      damaged_sign_count: damagedSignCount,
      strongest_parallel_id: strongest.tablet_id,
      strongest_parallel_fuzzy_j: +strongest.fuzzy_jaccard.toFixed(4),
      strongest_parallel_run: strongest.longest_contiguous_run,
      parallel_count_above_threshold: fuzzy.parallels.length,
      restoration_priority_score: +priority.toFixed(4),
    });
  }

  if (indexUnavailableWarning !== null && candidates.length === 0) {
    warnings.push(indexUnavailableWarning);
    return emptyResult(query, warnings);
  }

  candidates.sort((a, b) => {
    if (b.restoration_priority_score !== a.restoration_priority_score) {
      return b.restoration_priority_score - a.restoration_priority_score;
    }
    // Tie-break: prefer larger surviving context (more for the restorer to
    // condition on), then higher fuzzy_j (stronger template).
    if (b.sign_count !== a.sign_count) return b.sign_count - a.sign_count;
    return b.strongest_parallel_fuzzy_j - a.strongest_parallel_fuzzy_j;
  });

  const topCandidates = candidates.slice(0, topN);

  // Summary stats — computed over the RETURNED set so the means reflect what
  // the user will see in `candidates`, not the larger discarded pool.
  const meanDamage =
    topCandidates.length > 0
      ? topCandidates.reduce((sum, c) => sum + c.x_ratio, 0) / topCandidates.length
      : 0;
  const meanPriority =
    topCandidates.length > 0
      ? topCandidates.reduce((sum, c) => sum + c.restoration_priority_score, 0) /
        topCandidates.length
      : 0;

  return {
    query,
    candidates: topCandidates,
    summary: {
      total_tablets_scanned: scanList.length,
      total_candidates_with_damage: damageFilteredAll.length,
      total_candidates_surfaced: candidates.length,
      mean_damage_ratio: +meanDamage.toFixed(4),
      mean_priority_score: +meanPriority.toFixed(4),
    },
    warnings,
  };
}
