// v0.18.15 — Prefix-pair structural comparator.
//
// Motivation: museum-collection prefixes encode TWO entangled signals that
// look identical at the surface but mean different things:
//
//   (a) MODERN collection history — the prefix records which 19th-century
//       institution catalogued the tablet. K and Sm both come from
//       George Smith's Kuyunjik (Nineveh) excavations and were split into
//       the K (Kuyunjik) and Sm (Smith) British Museum sub-series mostly
//       by accession year. Their prefix difference is a museum-cataloging
//       artifact, NOT an ancient-tradition difference.
//
//   (b) ANCIENT scholarly tradition — BM and IM (Iraq Museum) collect
//       tablets from different excavation sites + periods + scribal
//       lineages. Their prefix difference DOES reflect an ancient-
//       tradition difference.
//
// Until now, distinguishing (a) from (b) for an arbitrary prefix pair
// required hand-stitching collection_coverage ×2 + a scoped run of
// find_cross_prefix_scribal_links + manual overlap arithmetic. This tool
// performs that comparison in one call.
//
// For each side it computes:
//   - tablet_count, total_sign_count, in_lex_graph, in_them_index counts
//   - top-5 period / genre / city distributions (via fragment-metadata)
//
// Across the pair it computes:
//   - shared periods / genres / cities with per-side counts
//   - Jaccard overlap on period-sets and genre-sets
//   - top-N same-scribe edges crossing prefix A ↔ prefix B
//   - relationship classification:
//       same_excavation_site         (high period + genre + scribal overlap)
//       complementary_collections    (high period + genre, ~no scribal)
//       shared_scholarly_tradition   (high genre, low period)
//       minimal_overlap              (otherwise)
//
// Critical caveat: period / genre / city analysis requires enriched
// fragment-metadata (run enrich_prefix_metadata on each prefix first).
// Cross-prefix scribal edges work without metadata — they're computed
// from the scribal-fingerprint sign index directly.
//
// Pure stdlib + reuse of anomalySurface + fragmentMetadata +
// findSameScribeCandidates. No new analytical primitives — orchestrator only.

import { getAllTabletRecords, type AnomalyTabletRecord } from "./anomalySurface.js";
import {
  getFragmentMetadata,
  getPeriod,
  getCity,
  getPrimaryGenre,
  metadataCoverage,
} from "./fragmentMetadata.js";
import { findSameScribeCandidates } from "./scribalFingerprint.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DistributionEntry = {
  value: string;
  count: number;
};

export type PrefixCohort = {
  prefix: string;
  tablet_count: number;
  total_sign_count: number;
  in_lex_graph: number;
  in_them_index: number;
  enriched_count: number;
  enriched_pct: number;
  period_distribution: DistributionEntry[]; // top-5 by count desc
  genre_distribution: DistributionEntry[]; // top-5 by count desc
  city_distribution: DistributionEntry[]; // top-5 by count desc
};

export type OverlapBucket = {
  value: string;
  a_count: number;
  b_count: number;
};

export type ComparisonBlock = {
  period_overlap: OverlapBucket[]; // shared periods, sorted by min(a,b) desc
  genre_overlap: OverlapBucket[];
  city_overlap: OverlapBucket[];
  period_jaccard: number;
  genre_jaccard: number;
  city_jaccard: number;
};

export type CrossPrefixScribalEdge = {
  tablet_a: string; // always in prefix A
  tablet_b: string; // always in prefix B
  signature_cosine: number;
  signature_jaccard: number;
};

export type PrefixRelationshipClassification =
  | "same_excavation_site"
  | "complementary_collections"
  | "shared_scholarly_tradition"
  | "minimal_overlap";

export type ComparePrefixPairQuery = {
  prefix_a: string;
  prefix_b: string;
  min_sign_count: number;
  max_tablets_per_prefix: number;
  cross_scribal_min_cosine: number;
  top_k_per_tablet: number;
};

export type ComparePrefixPairResult = {
  query: ComparePrefixPairQuery;
  cohort_a: PrefixCohort;
  cohort_b: PrefixCohort;
  comparison: ComparisonBlock;
  cross_scribal_edges: CrossPrefixScribalEdge[];
  cross_scribal_edge_count: number;
  relationship_classification: PrefixRelationshipClassification;
  recommendations: string[];
  warnings: string[];
};

// ─── Options ───────────────────────────────────────────────────────────────

export type ComparePrefixPairOptions = {
  prefixA: string;
  prefixB: string;
  minSignCount?: number; // default 50 (cohort inclusion)
  maxTabletsPerPrefix?: number; // default 500 (cross-prefix scribal scan cap)
  crossScribalMinCosine?: number; // default 0.6
  topKPerTablet?: number; // default 10
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const TOP_DISTRIBUTION_K = 5;
const MAX_CROSS_SCRIBAL_EDGES = 50;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function topNByCount(map: Map<string, number>, n: number): DistributionEntry[] {
  return [...map.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((x, y) => y.count - x.count || x.value.localeCompare(y.value))
    .slice(0, n);
}

function jaccardOfSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const v of a) if (b.has(v)) intersection++;
  const union = a.size + b.size - intersection;
  if (union === 0) return 0;
  return +(intersection / union).toFixed(4);
}

function emptyCohort(prefix: string): PrefixCohort {
  return {
    prefix,
    tablet_count: 0,
    total_sign_count: 0,
    in_lex_graph: 0,
    in_them_index: 0,
    enriched_count: 0,
    enriched_pct: 0,
    period_distribution: [],
    genre_distribution: [],
    city_distribution: [],
  };
}

type CohortBuilt = {
  cohort: PrefixCohort;
  periodCounts: Map<string, number>;
  genreCounts: Map<string, number>;
  cityCounts: Map<string, number>;
  members: AnomalyTabletRecord[]; // filtered to min_sign_count, sorted by sign_count desc
};

function buildCohort(
  prefix: string,
  allTablets: readonly AnomalyTabletRecord[],
  minSignCount: number,
): CohortBuilt {
  const members = allTablets
    .filter((t) => prefixOf(t.id) === prefix && t.sign_count >= minSignCount)
    .slice()
    .sort((a, b) => b.sign_count - a.sign_count);

  const periodCounts = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const cityCounts = new Map<string, number>();
  let totalSigns = 0;
  let inLex = 0;
  let inThem = 0;
  let enriched = 0;

  for (const t of members) {
    totalSigns += t.sign_count;
    if (t.in_lex_graph) inLex++;
    if (t.in_them_index) inThem++;
    const md = getFragmentMetadata(t.id);
    if (md) enriched++;
    const period = getPeriod(md) ?? t.period;
    const genre = getPrimaryGenre(md) ?? t.genre;
    const city = getCity(md) ?? t.city;
    if (period) periodCounts.set(period, (periodCounts.get(period) ?? 0) + 1);
    if (genre) genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    if (city) cityCounts.set(city, (cityCounts.get(city) ?? 0) + 1);
  }

  const enrichedPct = members.length > 0
    ? Math.round((enriched / members.length) * 1000) / 10
    : 0;

  return {
    cohort: {
      prefix,
      tablet_count: members.length,
      total_sign_count: totalSigns,
      in_lex_graph: inLex,
      in_them_index: inThem,
      enriched_count: enriched,
      enriched_pct: enrichedPct,
      period_distribution: topNByCount(periodCounts, TOP_DISTRIBUTION_K),
      genre_distribution: topNByCount(genreCounts, TOP_DISTRIBUTION_K),
      city_distribution: topNByCount(cityCounts, TOP_DISTRIBUTION_K),
    },
    periodCounts,
    genreCounts,
    cityCounts,
    members,
  };
}

function buildOverlap(
  aCounts: Map<string, number>,
  bCounts: Map<string, number>,
): { entries: OverlapBucket[]; jaccard: number } {
  const aSet = new Set(aCounts.keys());
  const bSet = new Set(bCounts.keys());
  const shared: OverlapBucket[] = [];
  for (const key of aSet) {
    if (!bSet.has(key)) continue;
    shared.push({
      value: key,
      a_count: aCounts.get(key) ?? 0,
      b_count: bCounts.get(key) ?? 0,
    });
  }
  shared.sort((x, y) => {
    const xMin = Math.min(x.a_count, x.b_count);
    const yMin = Math.min(y.a_count, y.b_count);
    if (yMin !== xMin) return yMin - xMin;
    return x.value.localeCompare(y.value);
  });
  return { entries: shared, jaccard: jaccardOfSets(aSet, bSet) };
}

function discoverCrossPrefixEdges(
  prefixA: string,
  prefixB: string,
  membersA: AnomalyTabletRecord[],
  membersB: AnomalyTabletRecord[],
  maxScan: number,
  minCosine: number,
  topK: number,
  warnings: string[],
): CrossPrefixScribalEdge[] {
  // Scan FROM the smaller cohort if both are populated — fewer iterations
  // hit the same edges symmetrically. When one cohort exceeds the scan cap
  // we still walk it (capped at maxScan), but the resulting edge set will
  // be incomplete vs. a full bidirectional scan.
  const aCount = membersA.length;
  const bCount = membersB.length;
  const scanFromA = aCount <= bCount;
  const scanFrom = scanFromA ? membersA : membersB;
  const targetPrefix = scanFromA ? prefixB : prefixA;
  const scanList = scanFrom.slice(0, maxScan);

  if (scanFrom.length > maxScan) {
    warnings.push(
      `Cross-prefix scribal scan capped at ${maxScan} of ${scanFrom.length} tablets in prefix ${scanFromA ? prefixA : prefixB}. Some same-scribe edges may be missed; raise max_tablets_per_prefix for full coverage.`,
    );
  }

  type EdgeAcc = {
    a: string; // canonical: in prefix A
    b: string; // canonical: in prefix B
    cosine: number;
    jaccard: number;
  };
  const byKey = new Map<string, EdgeAcc>();

  for (const seed of scanList) {
    let result;
    try {
      result = findSameScribeCandidates({
        tabletId: seed.id,
        topK,
        minJaccard: 0,
        minOverlap: 3,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`findSameScribeCandidates threw for ${seed.id}: ${msg}`);
      continue;
    }
    if (result.candidates.length === 0) continue;

    for (const cand of result.candidates) {
      if (cand.signature_cosine < minCosine) continue;
      const candPrefix = prefixOf(cand.tablet_id);
      // Only edges pointing INTO the opposite prefix of this pair.
      if (candPrefix !== targetPrefix) continue;

      // Canonical ordering: tablet_a always in prefix A, tablet_b in prefix B
      const aId = scanFromA ? seed.id : cand.tablet_id;
      const bId = scanFromA ? cand.tablet_id : seed.id;
      const key = edgeKey(aId, bId);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          a: aId,
          b: bId,
          cosine: cand.signature_cosine,
          jaccard: cand.signature_jaccard,
        });
      } else {
        if (cand.signature_cosine > existing.cosine) existing.cosine = cand.signature_cosine;
        if (cand.signature_jaccard > existing.jaccard) existing.jaccard = cand.signature_jaccard;
      }
    }
  }

  return [...byKey.values()]
    .map((e) => ({
      tablet_a: e.a,
      tablet_b: e.b,
      signature_cosine: +e.cosine.toFixed(4),
      signature_jaccard: +e.jaccard.toFixed(4),
    }))
    .sort((x, y) => y.signature_cosine - x.signature_cosine);
}

function classifyRelationship(
  periodJaccard: number,
  genreJaccard: number,
  crossEdgeCount: number,
): PrefixRelationshipClassification {
  if (periodJaccard >= 0.7 && genreJaccard >= 0.5 && crossEdgeCount >= 10) {
    return "same_excavation_site";
  }
  if (periodJaccard >= 0.5 && genreJaccard >= 0.5 && crossEdgeCount < 5) {
    return "complementary_collections";
  }
  if (genreJaccard >= 0.5 && periodJaccard < 0.5) {
    return "shared_scholarly_tradition";
  }
  return "minimal_overlap";
}

function buildRecommendations(
  prefixA: string,
  prefixB: string,
  cohortA: PrefixCohort,
  cohortB: PrefixCohort,
  comparison: ComparisonBlock,
  crossEdgeCount: number,
  classification: PrefixRelationshipClassification,
): string[] {
  const recs: string[] = [];
  const pjPct = (comparison.period_jaccard * 100).toFixed(1);
  const gjPct = (comparison.genre_jaccard * 100).toFixed(1);

  switch (classification) {
    case "same_excavation_site":
      recs.push(
        `${prefixA} and ${prefixB} show ${pjPct}% period overlap + ${gjPct}% genre overlap + ${crossEdgeCount} cross-prefix same-scribe edges — consistent with a SINGLE excavation site split by modern museum cataloging. Consider as one corpus for cluster reconstruction + scribal-lineage analysis.`,
      );
      break;
    case "complementary_collections":
      recs.push(
        `${prefixA} and ${prefixB} show ${pjPct}% period + ${gjPct}% genre overlap but only ${crossEdgeCount} same-scribe edges — COMPLEMENTARY collections (overlapping eras + genres, disjoint scribal hands). Likely two different sites in the same scholarly tradition, or one tradition's output split between two excavation lots.`,
      );
      break;
    case "shared_scholarly_tradition":
      recs.push(
        `${prefixA} and ${prefixB} show ${gjPct}% genre overlap but only ${pjPct}% period overlap — SHARED SCHOLARLY TRADITION across eras. Same canonical-text corpus copied at different times in different places. Useful for diachronic textual-transmission studies.`,
      );
      break;
    case "minimal_overlap":
      recs.push(
        `${prefixA} and ${prefixB} show minimal overlap (period ${pjPct}%, genre ${gjPct}%, ${crossEdgeCount} scribal edges) — distinct collections with no significant shared structure. Treat as independent for cluster + scribal analysis.`,
      );
      break;
  }

  // Highlight the strongest shared period (if any) for orientation.
  if (comparison.period_overlap.length > 0) {
    const top = comparison.period_overlap[0];
    recs.push(
      `Strongest shared period: "${top.value}" — ${top.a_count} tablets in ${prefixA}, ${top.b_count} in ${prefixB}.`,
    );
  }

  // Highlight the strongest shared genre (if any).
  if (comparison.genre_overlap.length > 0) {
    const top = comparison.genre_overlap[0];
    recs.push(
      `Strongest shared genre: "${top.value}" — ${top.a_count} tablets in ${prefixA}, ${top.b_count} in ${prefixB}.`,
    );
  }

  // Highlight shared cities — strongest signal of same-excavation-site.
  if (comparison.city_overlap.length > 0) {
    const top = comparison.city_overlap[0];
    recs.push(
      `Strongest shared city: "${top.value}" — ${top.a_count} tablets in ${prefixA}, ${top.b_count} in ${prefixB}. Confirms common provenance even when modern prefixes differ.`,
    );
  }

  // Asymmetry hint when one cohort is much larger than the other.
  if (cohortA.tablet_count > 0 && cohortB.tablet_count > 0) {
    const ratio = cohortA.tablet_count / cohortB.tablet_count;
    if (ratio >= 4 || ratio <= 0.25) {
      const larger = ratio >= 1 ? prefixA : prefixB;
      const smaller = ratio >= 1 ? prefixB : prefixA;
      const fold = ratio >= 1 ? ratio : 1 / ratio;
      recs.push(
        `Cohort sizes are highly asymmetric (${prefixA}=${cohortA.tablet_count}, ${prefixB}=${cohortB.tablet_count}) — ${larger} is ~${fold.toFixed(1)}× larger than ${smaller}. Read overlap percentages with that asymmetry in mind.`,
      );
    }
  }

  return recs;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function comparePrefixPair(opts: ComparePrefixPairOptions): ComparePrefixPairResult {
  const prefixA = (opts.prefixA ?? "").trim();
  const prefixB = (opts.prefixB ?? "").trim();
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxTabletsPerPrefix = Math.max(10, Math.min(5000, opts.maxTabletsPerPrefix ?? 500));
  const crossScribalMinCosine = Math.max(0, Math.min(1, opts.crossScribalMinCosine ?? 0.6));
  const topK = Math.max(2, Math.min(30, opts.topKPerTablet ?? 10));
  const warnings: string[] = [];

  const query: ComparePrefixPairQuery = {
    prefix_a: prefixA,
    prefix_b: prefixB,
    min_sign_count: minSignCount,
    max_tablets_per_prefix: maxTabletsPerPrefix,
    cross_scribal_min_cosine: crossScribalMinCosine,
    top_k_per_tablet: topK,
  };

  const emptyResult = (extraWarnings: string[] = []): ComparePrefixPairResult => ({
    query,
    cohort_a: emptyCohort(prefixA),
    cohort_b: emptyCohort(prefixB),
    comparison: {
      period_overlap: [],
      genre_overlap: [],
      city_overlap: [],
      period_jaccard: 0,
      genre_jaccard: 0,
      city_jaccard: 0,
    },
    cross_scribal_edges: [],
    cross_scribal_edge_count: 0,
    relationship_classification: "minimal_overlap",
    recommendations: [],
    warnings: [...warnings, ...extraWarnings],
  });

  if (prefixA.length === 0 || prefixB.length === 0) {
    warnings.push("compare_prefix_pair requires both prefix_a and prefix_b (non-empty).");
    return emptyResult();
  }
  if (prefixA === prefixB) {
    warnings.push(
      `prefix_a and prefix_b are identical ("${prefixA}") — comparison is trivially self-overlap. Provide two distinct prefixes.`,
    );
    return emptyResult();
  }

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult([
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  const aBuilt = buildCohort(prefixA, tablets, minSignCount);
  const bBuilt = buildCohort(prefixB, tablets, minSignCount);

  if (aBuilt.members.length === 0) {
    warnings.push(`Prefix "${prefixA}" has no tablets at sign_count ≥ ${minSignCount}.`);
  }
  if (bBuilt.members.length === 0) {
    warnings.push(`Prefix "${prefixB}" has no tablets at sign_count ≥ ${minSignCount}.`);
  }

  // Metadata-coverage warnings — period / genre / city analysis is unreliable
  // when most tablets in a cohort have no enriched metadata.
  const COV_LOW_PCT = 25;
  if (aBuilt.cohort.tablet_count >= 20 && aBuilt.cohort.enriched_pct < COV_LOW_PCT) {
    warnings.push(
      `Prefix ${prefixA}: only ${aBuilt.cohort.enriched_count}/${aBuilt.cohort.tablet_count} tablets (${aBuilt.cohort.enriched_pct}%) have enriched metadata — period/genre/city overlap is partial. Run enrich_prefix_metadata(prefix_filter="${prefixA}") to backfill.`,
    );
  }
  if (bBuilt.cohort.tablet_count >= 20 && bBuilt.cohort.enriched_pct < COV_LOW_PCT) {
    warnings.push(
      `Prefix ${prefixB}: only ${bBuilt.cohort.enriched_count}/${bBuilt.cohort.tablet_count} tablets (${bBuilt.cohort.enriched_pct}%) have enriched metadata — period/genre/city overlap is partial. Run enrich_prefix_metadata(prefix_filter="${prefixB}") to backfill.`,
    );
  }

  const periodCmp = buildOverlap(aBuilt.periodCounts, bBuilt.periodCounts);
  const genreCmp = buildOverlap(aBuilt.genreCounts, bBuilt.genreCounts);
  const cityCmp = buildOverlap(aBuilt.cityCounts, bBuilt.cityCounts);

  const comparison: ComparisonBlock = {
    period_overlap: periodCmp.entries,
    genre_overlap: genreCmp.entries,
    city_overlap: cityCmp.entries,
    period_jaccard: periodCmp.jaccard,
    genre_jaccard: genreCmp.jaccard,
    city_jaccard: cityCmp.jaccard,
  };

  // Cross-prefix scribal edges (only meaningful when both sides have members).
  let crossEdges: CrossPrefixScribalEdge[] = [];
  if (aBuilt.members.length > 0 && bBuilt.members.length > 0) {
    crossEdges = discoverCrossPrefixEdges(
      prefixA,
      prefixB,
      aBuilt.members,
      bBuilt.members,
      maxTabletsPerPrefix,
      crossScribalMinCosine,
      topK,
      warnings,
    );
  }
  const totalCrossEdges = crossEdges.length;
  const topEdges = crossEdges.slice(0, MAX_CROSS_SCRIBAL_EDGES);

  // Metadata-coverage caveat when classifying with low coverage on either side.
  const usableMetadata =
    (aBuilt.cohort.tablet_count === 0 || aBuilt.cohort.enriched_pct >= COV_LOW_PCT) &&
    (bBuilt.cohort.tablet_count === 0 || bBuilt.cohort.enriched_pct >= COV_LOW_PCT);
  if (!usableMetadata) {
    warnings.push(
      "Period/genre/city Jaccard scores may be unreliable due to low metadata coverage on at least one prefix — relationship classification is best-effort.",
    );
  }

  const classification = classifyRelationship(
    comparison.period_jaccard,
    comparison.genre_jaccard,
    totalCrossEdges,
  );

  const recommendations = buildRecommendations(
    prefixA,
    prefixB,
    aBuilt.cohort,
    bBuilt.cohort,
    comparison,
    totalCrossEdges,
    classification,
  );

  // Append the global cache-coverage stat once, for orientation.
  const cov = metadataCoverage();
  if (cov.total_with_metadata === 0) {
    warnings.push(
      "Fragment-metadata cache is empty (0 enriched entries) — period/genre/city distributions will be empty. Run enrich_prefix_metadata to populate.",
    );
  }

  return {
    query,
    cohort_a: aBuilt.cohort,
    cohort_b: bBuilt.cohort,
    comparison,
    cross_scribal_edges: topEdges,
    cross_scribal_edge_count: totalCrossEdges,
    relationship_classification: classification,
    recommendations,
    warnings,
  };
}
