// v0.18.10 — Orthographic outlier discovery within a museum-collection prefix.
//
// Complements `find_scribal_groups` (v0.18.9). Where that tool surfaces the
// TIGHT same-scribe groups (mutually-reciprocal high-cosine clusters), this
// tool surfaces the LONERS: tablets whose scribal-signature LLR profile is
// furthest from their cohort's centroid. Practical use cases:
//
//   * imports — a tablet excavated/cataloged under prefix X whose orthography
//     does not match the X-cohort's house style (candidate for re-attribution
//     to a different scribal school or origin)
//   * mislabeling — a museum-number prefix collision where the tablet was
//     filed alongside a different corpus's material
//   * outlier scribal-school — a genuinely local but idiosyncratic hand whose
//     sign-frequency profile diverges from the prefix's modal practice
//
// Algorithm:
//   1. Iterate tablets in the requested prefix, filtering by min_sign_count
//      and capping at max_tablets_to_scan (sorted by sign_count desc to
//      prioritize tablets with the most reliable signatures)
//   2. For each tablet, retrieve its scribal signature via getScribalSignature
//   3. Build the cohort centroid: a Map<sign, summed_llr> aggregating every
//      cohort tablet's per-sign LLR weights. Sign coverage = total weight.
//   4. For each tablet, compute cosine(tablet_sig, centroid) over the
//      shared-sign intersection (standard sparse cosine). Deviation = 1 - cos.
//   5. Surface the top-N tablets with the LOWEST cosine (= most deviant) and
//      enumerate each one's distinctive signs (in the tablet's signature but
//      NOT in the cohort centroid's top-30)
//   6. Also surface the centroid's top-15 signs as a baseline + summary
//      stats (mean/median cosine, variance, top-3 most-typical tablets)
//
// Performance: O(N) signature retrievals where N = tablets in the scan
// list, then O(N × S_avg) for the centroid + cosine pass. For a 500-tablet
// scan with ~50 signature signs per tablet this is well under a second on
// a warm index.
//
// Pure stdlib + reuse of getScribalSignature + getAllTabletRecords.

import { getScribalSignature } from "./scribalFingerprint.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type CentroidSign = {
  sign: string;
  summed_llr: number;
  tablet_count: number; // how many cohort tablets carry this sign in their signature
};

export type CohortCentroid = {
  cohort_size: number;
  total_signature_signs_aggregated: number; // sum over all cohort tablets of |signature_signs|
  top_signs: CentroidSign[]; // top-15 by summed_llr
};

export type OrthographicOutlier = {
  tablet_id: string;
  sign_count: number;
  signature_size: number; // |signature_signs|
  signature_cosine_to_centroid: number;
  deviation_score: number; // 1 - cosine
  distinctive_signs: Array<{ sign: string; llr: number }>; // signs in tablet sig NOT in centroid top-30
};

export type TypicalTablet = {
  tablet_id: string;
  signature_cosine_to_centroid: number;
};

export type FindOrthographicOutliersResult = {
  query: {
    prefix_filter: string;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_n_outliers: number;
  };
  cohort_centroid: CohortCentroid;
  outliers: OrthographicOutlier[];
  summary: {
    cohort_size: number;
    mean_cosine_to_centroid: number;
    median_cosine_to_centroid: number;
    stdev_cosine_to_centroid: number; // population stdev — cohort variance metric
    min_cosine_to_centroid: number;
    max_cosine_to_centroid: number;
    most_typical_tablets: TypicalTablet[]; // top-3 by cosine to centroid
  };
  warnings: string[];
};

export type FindOrthographicOutliersOptions = {
  prefixFilter: string;
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500 (capped at 5000)
  topNOutliers?: number; // default 20
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  // Standard sparse cosine over the shared-key intersection.
  // Both vectors' norms are over their own full key set (a, b respectively).
  if (a.size === 0 || b.size === 0) return 0;
  // Iterate the smaller map for the dot product
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [k, v] of small) {
    const other = large.get(k);
    if (other !== undefined) dot += v * other;
  }
  if (dot === 0) return 0;
  let normA = 0;
  for (const v of a.values()) normA += v * v;
  let normB = 0;
  for (const v of b.values()) normB += v * v;
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2;
  return sorted[mid];
}

// ─── Main entry point ──────────────────────────────────────────────────────

export function findOrthographicOutliers(
  opts: FindOrthographicOutliersOptions,
): FindOrthographicOutliersResult {
  const prefixFilter = opts.prefixFilter;
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topN = Math.max(1, Math.min(200, opts.topNOutliers ?? 20));
  const warnings: string[] = [];

  const queryEcho = {
    prefix_filter: prefixFilter,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_n_outliers: topN,
  };

  const emptyResult = (extraWarnings: string[]): FindOrthographicOutliersResult => ({
    query: queryEcho,
    cohort_centroid: {
      cohort_size: 0,
      total_signature_signs_aggregated: 0,
      top_signs: [],
    },
    outliers: [],
    summary: {
      cohort_size: 0,
      mean_cosine_to_centroid: 0,
      median_cosine_to_centroid: 0,
      stdev_cosine_to_centroid: 0,
      min_cosine_to_centroid: 0,
      max_cosine_to_centroid: 0,
      most_typical_tablets: [],
    },
    warnings: [...warnings, ...extraWarnings],
  });

  if (!prefixFilter || prefixFilter.length === 0) {
    return emptyResult(["prefix_filter is required."]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult([
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  const scanList = tablets
    .filter((t) => prefixOf(t.id) === prefixFilter)
    .filter((t) => t.sign_count >= minSignCount)
    .slice()
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the scan criteria (prefix=${prefixFilter}, min_sign_count=${minSignCount}).`,
    );
    return emptyResult([]);
  }
  if (scanList.length < 3) {
    warnings.push(
      `Cohort size ${scanList.length} is very small — outlier ranking will not be statistically meaningful.`,
    );
  }

  // Retrieve signatures and build per-tablet sparse vectors.
  type TabletSig = {
    id: string;
    signCount: number;
    sigMap: Map<string, number>;
  };
  const tabletSigs: TabletSig[] = [];
  let totalSignaturesAggregated = 0;
  let signaturelessCount = 0;
  for (const rec of scanList) {
    const sig = getScribalSignature(rec.id);
    if (sig.signature_signs.length === 0) {
      signaturelessCount += 1;
      continue;
    }
    const sigMap = new Map<string, number>();
    for (const s of sig.signature_signs) {
      // If a sign appears more than once (shouldn't, but defensive) keep the max LLR
      const prev = sigMap.get(s.sign);
      if (prev === undefined || s.llr > prev) sigMap.set(s.sign, s.llr);
    }
    tabletSigs.push({ id: rec.id, signCount: rec.sign_count, sigMap });
    totalSignaturesAggregated += sigMap.size;
  }

  if (signaturelessCount > 0) {
    warnings.push(
      `${signaturelessCount}/${scanList.length} cohort tablets had empty signatures and were skipped.`,
    );
  }

  if (tabletSigs.length === 0) {
    return emptyResult([
      `No usable signatures in cohort (all ${scanList.length} scanned tablets returned empty signatures).`,
    ]);
  }

  // Build the centroid: summed LLR per sign + tablet-presence count.
  const centroidSummed = new Map<string, number>();
  const centroidPresence = new Map<string, number>();
  for (const ts of tabletSigs) {
    for (const [sign, llr] of ts.sigMap) {
      centroidSummed.set(sign, (centroidSummed.get(sign) ?? 0) + llr);
      centroidPresence.set(sign, (centroidPresence.get(sign) ?? 0) + 1);
    }
  }

  const centroidEntries: CentroidSign[] = Array.from(centroidSummed.entries())
    .map(([sign, summed_llr]) => ({
      sign,
      summed_llr: +summed_llr.toFixed(4),
      tablet_count: centroidPresence.get(sign) ?? 0,
    }))
    .sort((a, b) => b.summed_llr - a.summed_llr);

  const centroidTop15 = centroidEntries.slice(0, 15);
  const centroidTop30Set = new Set(centroidEntries.slice(0, 30).map((e) => e.sign));

  // Compute cosine for each tablet against the full centroid vector.
  type Scored = {
    id: string;
    signCount: number;
    signatureSize: number;
    sigMap: Map<string, number>;
    cosine: number;
  };
  const scored: Scored[] = tabletSigs.map((ts) => ({
    id: ts.id,
    signCount: ts.signCount,
    signatureSize: ts.sigMap.size,
    sigMap: ts.sigMap,
    cosine: sparseCosine(ts.sigMap, centroidSummed),
  }));

  const cosines = scored.map((s) => s.cosine);
  const sortedCosines = cosines.slice().sort((a, b) => a - b);
  const sumCos = cosines.reduce((a, b) => a + b, 0);
  const meanCos = cosines.length > 0 ? sumCos / cosines.length : 0;
  const variance =
    cosines.length > 0
      ? cosines.reduce((acc, v) => acc + (v - meanCos) * (v - meanCos), 0) / cosines.length
      : 0;
  const stdev = Math.sqrt(variance);
  const medianCos = median(sortedCosines);
  const minCos = sortedCosines.length > 0 ? sortedCosines[0] : 0;
  const maxCos = sortedCosines.length > 0 ? sortedCosines[sortedCosines.length - 1] : 0;

  // Outliers = lowest cosine. Sort ascending by cosine, take topN.
  const outlierSorted = scored.slice().sort((a, b) => a.cosine - b.cosine);
  const outliers: OrthographicOutlier[] = outlierSorted.slice(0, topN).map((s) => {
    const distinctive = Array.from(s.sigMap.entries())
      .filter(([sign]) => !centroidTop30Set.has(sign))
      .map(([sign, llr]) => ({ sign, llr: +llr.toFixed(4) }))
      .sort((a, b) => b.llr - a.llr)
      .slice(0, 10);
    return {
      tablet_id: s.id,
      sign_count: s.signCount,
      signature_size: s.signatureSize,
      signature_cosine_to_centroid: +s.cosine.toFixed(4),
      deviation_score: +(1 - s.cosine).toFixed(4),
      distinctive_signs: distinctive,
    };
  });

  // Most-typical = highest cosine. Take top-3.
  const typicalSorted = scored.slice().sort((a, b) => b.cosine - a.cosine);
  const mostTypical: TypicalTablet[] = typicalSorted.slice(0, 3).map((s) => ({
    tablet_id: s.id,
    signature_cosine_to_centroid: +s.cosine.toFixed(4),
  }));

  return {
    query: queryEcho,
    cohort_centroid: {
      cohort_size: tabletSigs.length,
      total_signature_signs_aggregated: totalSignaturesAggregated,
      top_signs: centroidTop15,
    },
    outliers,
    summary: {
      cohort_size: tabletSigs.length,
      mean_cosine_to_centroid: +meanCos.toFixed(4),
      median_cosine_to_centroid: +medianCos.toFixed(4),
      stdev_cosine_to_centroid: +stdev.toFixed(4),
      min_cosine_to_centroid: +minCos.toFixed(4),
      max_cosine_to_centroid: +maxCos.toFixed(4),
      most_typical_tablets: mostTypical,
    },
    warnings,
  };
}
