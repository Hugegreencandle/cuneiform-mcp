// v0.26.0 — compare_sign_neighbors_across_periods: diachronic sign2vec query.
//
// For a single query sign, return its top-K nearest neighbors from the
// Neo-Assyrian and Neo-Babylonian period sub-corpus embeddings (built by
// scripts/build-sign-embeddings-per-period.mjs). Surfaces three drift
// signals:
//   - common_neighbors  — signs that share the top-K ranking in both
//                         periods (the stable distributional core).
//   - na_only_neighbors — signs in NA's top-K but not in NB's.
//   - nb_only_neighbors — vice versa.
// A sign with non-trivial NA-only ∪ NB-only count is a candidate
// diachronic substitution — its distributional behavior changed between
// the Neo-Assyrian and Neo-Babylonian sub-corpora.
//
// Companion to v0.23's find_similar_signs (corpus-wide) and v0.25's
// compare_sign_embedding_configs (hyperparameter axis). This tool is
// additive: it does NOT touch any other sign2vec cache and does NOT
// replace either of the existing tools.
//
// Wraps the StructuredEnvelope schema at
// schemas/compare_sign_neighbors_across_periods.schema.json.

import {
  periodStats,
  periodHasSign,
  periodRankNeighbors,
  type PeriodSignNeighbor,
} from "./signEmbeddingsPerPeriod.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DriftSignals = {
  /** Sign codes appearing in BOTH NA top-K and NB top-K. */
  common_neighbors: string[];
  /** Sign codes in NA top-K but not NB top-K. */
  na_only_neighbors: string[];
  /** Sign codes in NB top-K but not NA top-K. */
  nb_only_neighbors: string[];
  na_only_count: number;
  nb_only_count: number;
};

export type PeriodIndexStats = {
  na_signs_indexed: number;
  nb_signs_indexed: number;
  na_tablets_in_period: number;
  nb_tablets_in_period: number;
};

export type CompareSignNeighborsAcrossPeriodsResult = {
  query_sign: string;
  in_na: boolean;
  in_nb: boolean;
  neighbors_na: PeriodSignNeighbor[];
  neighbors_nb: PeriodSignNeighbor[];
  drift_signals: DriftSignals;
  index_stats: PeriodIndexStats;
  warnings: string[];
};

export type CompareSignNeighborsAcrossPeriodsOptions = {
  sign: string;
  /** Default 5, cap 50. */
  top_k?: number;
};

// ─── Implementation ────────────────────────────────────────────────────────

export function compareSignNeighborsAcrossPeriods(
  opts: CompareSignNeighborsAcrossPeriodsOptions,
): CompareSignNeighborsAcrossPeriodsResult {
  const warnings: string[] = [];

  if (typeof opts.sign !== "string" || opts.sign.trim() === "") {
    return {
      query_sign: opts.sign ?? "",
      in_na: false,
      in_nb: false,
      neighbors_na: [],
      neighbors_nb: [],
      drift_signals: {
        common_neighbors: [],
        na_only_neighbors: [],
        nb_only_neighbors: [],
        na_only_count: 0,
        nb_only_count: 0,
      },
      index_stats: {
        na_signs_indexed: 0,
        nb_signs_indexed: 0,
        na_tablets_in_period: 0,
        nb_tablets_in_period: 0,
      },
      warnings: ["`sign` must be a non-empty string"],
    };
  }

  const querySign = opts.sign.trim();
  const topK = Math.max(1, Math.min(50, opts.top_k ?? 5));

  const naStats = periodStats("NA");
  const nbStats = periodStats("NB");

  if (!naStats.loaded) {
    warnings.push(
      `Neo-Assyrian per-period embedding not loaded: ${naStats.load_error ?? "unknown error"}`,
    );
  }
  if (!nbStats.loaded) {
    warnings.push(
      `Neo-Babylonian per-period embedding not loaded: ${nbStats.load_error ?? "unknown error"}`,
    );
  }

  const inNa = naStats.loaded && periodHasSign("NA", querySign);
  const inNb = nbStats.loaded && periodHasSign("NB", querySign);

  if (naStats.loaded && !inNa) {
    warnings.push(
      `sign '${querySign}' is not in the Neo-Assyrian vocab (must occur ≥ ${naStats.min_occurrences} times in NA tablets).`,
    );
  }
  if (nbStats.loaded && !inNb) {
    warnings.push(
      `sign '${querySign}' is not in the Neo-Babylonian vocab (must occur ≥ ${nbStats.min_occurrences} times in NB tablets).`,
    );
  }

  const neighborsNa = inNa ? (periodRankNeighbors("NA", querySign, topK, 0) ?? []) : [];
  const neighborsNb = inNb ? (periodRankNeighbors("NB", querySign, topK, 0) ?? []) : [];

  const drift = computeDrift(neighborsNa, neighborsNb);

  return {
    query_sign: querySign,
    in_na: inNa,
    in_nb: inNb,
    neighbors_na: neighborsNa,
    neighbors_nb: neighborsNb,
    drift_signals: drift,
    index_stats: {
      na_signs_indexed: naStats.total_signs_indexed,
      nb_signs_indexed: nbStats.total_signs_indexed,
      na_tablets_in_period: naStats.tablets_in_period,
      nb_tablets_in_period: nbStats.tablets_in_period,
    },
    warnings,
  };
}

function computeDrift(
  na: PeriodSignNeighbor[],
  nb: PeriodSignNeighbor[],
): DriftSignals {
  const naSet = new Set(na.map((n) => n.sign));
  const nbSet = new Set(nb.map((n) => n.sign));

  const common: string[] = [];
  for (const n of na) {
    if (nbSet.has(n.sign)) common.push(n.sign);
  }
  const naOnly: string[] = [];
  for (const n of na) {
    if (!nbSet.has(n.sign)) naOnly.push(n.sign);
  }
  const nbOnly: string[] = [];
  for (const n of nb) {
    if (!naSet.has(n.sign)) nbOnly.push(n.sign);
  }

  return {
    common_neighbors: common,
    na_only_neighbors: naOnly,
    nb_only_neighbors: nbOnly,
    na_only_count: naOnly.length,
    nb_only_count: nbOnly.length,
  };
}
