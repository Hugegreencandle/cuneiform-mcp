// v0.18.14 — Cohort-based dialect-deviation discovery: city + period analogue
// of v0.18.10 find_orthographic_outliers_in_prefix.
//
// Where v0.18.10 buckets tablets by museum-collection prefix (BM, K, Sm,
// CBS, VAT — modern acquisition history), this tool buckets by HISTORICAL
// provenance: city (e.g. Sippar, Nineveh, Nippur, Babylon, Uruk, Susa) +
// period (e.g. Old Babylonian, Neo-Assyrian, Late Babylonian, Neo-Babylonian,
// Ur III). The resulting cohort is a documented Mesopotamian dialect zone,
// so outliers in this cohort surface tablets whose scribal practice deviates
// from the local-period orthographic norm — candidates for:
//
//   * imports — a tablet excavated at Sippar but written in a hand more
//     characteristic of Babylon or Nippur (trade, exile, scribal mobility)
//   * mislabeled provenance — modern museum cataloging error where a
//     tablet's site of origin was misrecorded at acquisition
//   * dialect outlier — a genuinely local scribe whose orthography
//     diverges from the city-period modal practice (regional sub-school,
//     archaizing copy, foreign-trained scribe)
//
// Algorithm (structurally identical to orthographicOutliers.ts; only the
// cohort definition differs):
//   1. Iterate getAllTabletRecords(); for each tablet fetch fragment
//      metadata via getFragmentMetadata(id). Filter to those whose city +
//      period match (case-insensitive substring match — eBL period strings
//      vary in punctuation, so a strict equality match would miss e.g.
//      "Neo-Babylonian" vs "Neo Babylonian").
//   2. Apply min_sign_count + max_tablets_to_scan caps (sorted by
//      sign_count desc to prioritize tablets with reliable signatures).
//   3. For each tablet, retrieve its scribal signature via
//      getScribalSignature.
//   4. Build cohort centroid: Map<sign, summed_llr> aggregating every
//      cohort tablet's per-sign LLR weights.
//   5. For each tablet, compute cosine(tablet_sig, centroid) over the
//      shared-sign intersection (sparse cosine). Deviation = 1 - cos.
//   6. Surface top-N tablets with LOWEST cosine + their distinctive signs
//      (signs in tablet sig but NOT in cohort centroid top-30), plus
//      centroid top-15 baseline + summary stats + most-typical top-3.
//
// CRITICAL CAVEAT: Cohort filtering requires enriched fragment metadata
// (both city + period). As of v0.18.13 only ~0.6% of the 36K tablet
// surface has metadata in cache. If the cohort comes back small/empty
// the tool emits a warning prompting the caller to run
// enrich_prefix_metadata for the relevant prefix(es) first.
//
// Pure stdlib + reuse of getScribalSignature + getAllTabletRecords +
// getFragmentMetadata.

import { getScribalSignature } from "./scribalFingerprint.js";
import { getAllTabletRecords } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getCity,
  getPeriod,
  metadataCoverage,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DialectCentroidSign = {
  sign: string;
  summed_llr: number;
  tablet_count: number; // how many cohort tablets carry this sign in their signature
};

export type DialectCohortCentroid = {
  cohort_size: number;
  total_signature_signs_aggregated: number; // sum over all cohort tablets of |signature_signs|
  top_signs: DialectCentroidSign[]; // top-15 by summed_llr
};

export type DialectOutlier = {
  tablet_id: string;
  prefix: string;
  sign_count: number;
  signature_size: number;
  signature_cosine_to_centroid: number;
  deviation_score: number; // 1 - cosine
  distinctive_signs: Array<{ sign: string; llr: number }>; // signs in tablet sig NOT in centroid top-30
  designation: string | null;
};

export type DialectTypicalTablet = {
  tablet_id: string;
  prefix: string;
  signature_cosine_to_centroid: number;
};

export type CompareDialectsResult = {
  query: {
    city: string;
    period: string;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_n_outliers: number;
  };
  cohort_centroid: DialectCohortCentroid;
  outliers: DialectOutlier[];
  summary: {
    cohort_size: number;
    mean_cosine_to_centroid: number;
    median_cosine_to_centroid: number;
    stdev_cosine_to_centroid: number; // population stdev — cohort variance metric
    min_cosine_to_centroid: number;
    max_cosine_to_centroid: number;
    most_typical_tablets: DialectTypicalTablet[]; // top-3 by cosine to centroid
  };
  warnings: string[];
};

export type CompareDialectsOptions = {
  city: string;
  period: string;
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500 (capped at 5000)
  topNOutliers?: number; // default 20
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function normalizeForMatch(s: string | null): string {
  if (!s) return "";
  // Lowercase + strip punctuation/whitespace so "Neo-Babylonian", "Neo Babylonian"
  // and "neo_babylonian" all collapse to "neobabylonian". eBL field values are
  // not perfectly normalized across the corpus, so a strict equality match
  // would silently drop legitimate cohort members.
  return s.toLowerCase().replace(/[\s_\-.,/()]+/g, "");
}

function cityMatches(metadataCity: string | null, queryCity: string): boolean {
  const m = normalizeForMatch(metadataCity);
  const q = normalizeForMatch(queryCity);
  if (m.length === 0 || q.length === 0) return false;
  // Substring match in either direction to tolerate "Sippar (Tell Abu Habba)"
  // vs "Sippar" and similar variants.
  return m === q || m.includes(q) || q.includes(m);
}

function periodMatches(metadataPeriod: string | null, queryPeriod: string): boolean {
  const m = normalizeForMatch(metadataPeriod);
  const q = normalizeForMatch(queryPeriod);
  if (m.length === 0 || q.length === 0) return false;
  return m === q || m.includes(q) || q.includes(m);
}

function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  // Standard sparse cosine over the shared-key intersection.
  if (a.size === 0 || b.size === 0) return 0;
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

export function compareDialects(opts: CompareDialectsOptions): CompareDialectsResult {
  const city = opts.city;
  const period = opts.period;
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topN = Math.max(1, Math.min(200, opts.topNOutliers ?? 20));
  const warnings: string[] = [];

  const queryEcho = {
    city,
    period,
    min_sign_count: minSignCount,
    max_tablets_to_scan: maxScan,
    top_n_outliers: topN,
  };

  const emptyResult = (extraWarnings: string[]): CompareDialectsResult => ({
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

  if (!city || city.length === 0) {
    return emptyResult(["city is required."]);
  }
  if (!period || period.length === 0) {
    return emptyResult(["period is required."]);
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult([
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Filter to the city+period cohort using the fragment-metadata cache.
  // Tablets without cached metadata are skipped (NOT counted as misses).
  type CohortMember = {
    id: string;
    signCount: number;
    designation: string | null;
  };
  const cohortMembers: CohortMember[] = [];
  let scannedWithMetadata = 0;
  for (const t of tablets) {
    if (t.sign_count < minSignCount) continue;
    const md = getFragmentMetadata(t.id);
    if (!md) continue;
    scannedWithMetadata++;
    const mdCity = getCity(md);
    const mdPeriod = getPeriod(md);
    if (!mdCity || !mdPeriod) continue;
    if (!cityMatches(mdCity, city)) continue;
    if (!periodMatches(mdPeriod, period)) continue;
    cohortMembers.push({
      id: t.id,
      signCount: t.sign_count,
      designation: md.designation,
    });
  }

  // Apply the max-scan cap, preferring tablets with the most signs (most
  // statistically reliable signatures).
  cohortMembers.sort((a, b) => b.signCount - a.signCount);
  const scanList = cohortMembers.slice(0, maxScan);

  // Surface a low-coverage warning when the metadata cache itself is thin —
  // helps the caller understand whether an empty cohort means "the dialect
  // is small" or "the cache hasn't been enriched yet".
  const coverage = metadataCoverage();
  if (coverage.total_with_metadata < 1000) {
    warnings.push(
      `Fragment-metadata cache is thin (${coverage.total_with_metadata} entries with data) — cohort filtering by city+period only sees tablets that have already been enriched. Consider running enrich_prefix_metadata for the prefixes you care about before trusting an empty result.`,
    );
  }

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the cohort (city≈${city}, period≈${period}, min_sign_count=${minSignCount}). ${scannedWithMetadata} tablets had cached metadata; none matched both filters.`,
    );
    return emptyResult([]);
  }
  if (scanList.length < 10) {
    warnings.push(
      `Cohort size ${scanList.length} is small — outlier ranking will not be statistically meaningful. Enrich more fragments for this city+period via enrich_prefix_metadata.`,
    );
  } else if (scanList.length < 3) {
    warnings.push(
      `Cohort size ${scanList.length} is degenerate — at least 3 tablets are needed for a meaningful centroid.`,
    );
  }

  // Retrieve signatures and build per-tablet sparse vectors.
  type TabletSig = {
    id: string;
    signCount: number;
    designation: string | null;
    sigMap: Map<string, number>;
  };
  const tabletSigs: TabletSig[] = [];
  let totalSignaturesAggregated = 0;
  let signaturelessCount = 0;
  for (const member of scanList) {
    const sig = getScribalSignature(member.id);
    if (sig.signature_signs.length === 0) {
      signaturelessCount += 1;
      continue;
    }
    const sigMap = new Map<string, number>();
    for (const s of sig.signature_signs) {
      const prev = sigMap.get(s.sign);
      if (prev === undefined || s.llr > prev) sigMap.set(s.sign, s.llr);
    }
    tabletSigs.push({
      id: member.id,
      signCount: member.signCount,
      designation: member.designation,
      sigMap,
    });
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

  // Build the centroid.
  const centroidSummed = new Map<string, number>();
  const centroidPresence = new Map<string, number>();
  for (const ts of tabletSigs) {
    for (const [sign, llr] of ts.sigMap) {
      centroidSummed.set(sign, (centroidSummed.get(sign) ?? 0) + llr);
      centroidPresence.set(sign, (centroidPresence.get(sign) ?? 0) + 1);
    }
  }

  const centroidEntries: DialectCentroidSign[] = Array.from(centroidSummed.entries())
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
    designation: string | null;
    signatureSize: number;
    sigMap: Map<string, number>;
    cosine: number;
  };
  const scored: Scored[] = tabletSigs.map((ts) => ({
    id: ts.id,
    signCount: ts.signCount,
    designation: ts.designation,
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

  // Outliers = lowest cosine.
  const outlierSorted = scored.slice().sort((a, b) => a.cosine - b.cosine);
  const outliers: DialectOutlier[] = outlierSorted.slice(0, topN).map((s) => {
    const distinctive = Array.from(s.sigMap.entries())
      .filter(([sign]) => !centroidTop30Set.has(sign))
      .map(([sign, llr]) => ({ sign, llr: +llr.toFixed(4) }))
      .sort((a, b) => b.llr - a.llr)
      .slice(0, 10);
    return {
      tablet_id: s.id,
      prefix: prefixOf(s.id),
      sign_count: s.signCount,
      signature_size: s.signatureSize,
      signature_cosine_to_centroid: +s.cosine.toFixed(4),
      deviation_score: +(1 - s.cosine).toFixed(4),
      distinctive_signs: distinctive,
      designation: s.designation,
    };
  });

  // Most-typical = highest cosine.
  const typicalSorted = scored.slice().sort((a, b) => b.cosine - a.cosine);
  const mostTypical: DialectTypicalTablet[] = typicalSorted.slice(0, 3).map((s) => ({
    tablet_id: s.id,
    prefix: prefixOf(s.id),
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
