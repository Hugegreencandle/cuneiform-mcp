// v0.27.0 — compare_sign_neighbors_register_matched: register-matched
// diachronic sign2vec query.
//
// For a single query sign + a chosen register, return its top-K nearest
// neighbors from the (register, NA) and (register, NB) sub-corpus
// embeddings (built by scripts/build-sign-embeddings-register-matched.mjs).
// Same drift-signal surface as v0.26's compare_sign_neighbors_across_periods,
// PLUS a `comparison_with_mixed_register` block that asks the methodologically
// interesting question: "how much of the v0.26 drift was register-confounded
// vs how much is residual diachronic signal?"
//
// If `register` is "auto", the tool picks the register where the query sign
// is best-supported in BOTH NA and NB (by min-bucket-tablet-count). A
// warning records which register was selected.
//
// Wraps the StructuredEnvelope schema at
// schemas/compare_sign_neighbors_register_matched.schema.json.

import {
  bucketStats,
  bucketHasSign,
  bucketRankNeighbors,
  pickMostSharedRegister,
  ALL_REGISTERS,
  type PeriodKey,
  type RegisterKey,
  type RegisterSignNeighbor,
} from "./signEmbeddingsRegisterMatched.js";

import {
  periodStats as mixedPeriodStats,
  periodHasSign as mixedPeriodHasSign,
  periodRankNeighbors as mixedPeriodRankNeighbors,
} from "./signEmbeddingsPerPeriod.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DriftSignals = {
  /** Sign codes appearing in BOTH NA top-K and NB top-K of this register. */
  common_neighbors: string[];
  /** Sign codes in NA top-K of this register but not NB top-K. */
  na_only_neighbors: string[];
  /** Sign codes in NB top-K of this register but not NA top-K. */
  nb_only_neighbors: string[];
  na_only_count: number;
  nb_only_count: number;
};

export type BucketIndexStats = {
  register: RegisterKey;
  period: PeriodKey;
  signs_indexed: number;
  tablets_in_bucket: number;
  min_occurrences: number;
  loaded: boolean;
};

export type MixedRegisterComparison = {
  /** v0.26 mixed-register top-K drift for the same sign + same top_k.
   * null if the v0.26 per-period caches are not loaded, or the sign is
   * not in BOTH NA and NB mixed-register vocabs. */
  mixed_register_drift_topk: number | null;
  /** v0.27 register-matched top-K drift for the same sign + same top_k. */
  register_matched_drift_topk: number | null;
  /** Difference: mixed - matched. Positive value = register-matching
   * reduced the drift signal (consistent with the v0.26 register
   * confound hypothesis). null if either side is null. */
  drift_attributable_to_register: number | null;
  /** Mixed-register NA neighbors for eyeball comparison. */
  mixed_neighbors_na: RegisterSignNeighbor[];
  /** Mixed-register NB neighbors for eyeball comparison. */
  mixed_neighbors_nb: RegisterSignNeighbor[];
};

export type CompareSignNeighborsRegisterMatchedResult = {
  query_sign: string;
  register: RegisterKey;
  register_was_auto_selected: boolean;
  in_na: boolean;
  in_nb: boolean;
  neighbors_na: RegisterSignNeighbor[];
  neighbors_nb: RegisterSignNeighbor[];
  drift_signals: DriftSignals;
  register_matched_drift_topk: number;
  comparison_with_mixed_register: MixedRegisterComparison;
  index_stats: BucketIndexStats[];
  warnings: string[];
};

export type CompareSignNeighborsRegisterMatchedOptions = {
  sign: string;
  /** "auto" picks the register that best supports the sign in both periods. */
  register?: RegisterKey | "auto";
  /** Default 5, cap 50. */
  top_k?: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function computeDrift(
  na: RegisterSignNeighbor[],
  nb: RegisterSignNeighbor[],
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

/**
 * "top-K drift" = number of positions whose sign changed between NA-top-K
 * and NB-top-K. Equivalent to max(na_only_count, nb_only_count) since the
 * two sets have equal cardinality K (when both periods returned K neighbors).
 * For partial neighbor lists (degenerate edge case), we take the symmetric-
 * difference half-count: |A \\ B| (= |B \\ A| when |A|=|B|).
 */
function topKDrift(drift: DriftSignals): number {
  return Math.max(drift.na_only_count, drift.nb_only_count);
}

function buildEmptyResult(
  sign: string,
  register: RegisterKey,
  warnings: string[],
  autoSelected: boolean,
): CompareSignNeighborsRegisterMatchedResult {
  return {
    query_sign: sign,
    register,
    register_was_auto_selected: autoSelected,
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
    register_matched_drift_topk: 0,
    comparison_with_mixed_register: {
      mixed_register_drift_topk: null,
      register_matched_drift_topk: null,
      drift_attributable_to_register: null,
      mixed_neighbors_na: [],
      mixed_neighbors_nb: [],
    },
    index_stats: ALL_REGISTERS.flatMap((r) =>
      (["NA", "NB"] as PeriodKey[]).map((p) => {
        const st = bucketStats(r, p);
        return {
          register: r,
          period: p,
          signs_indexed: st.total_signs_indexed,
          tablets_in_bucket: st.tablets_in_bucket,
          min_occurrences: st.min_occurrences,
          loaded: st.loaded,
        };
      }),
    ),
    warnings,
  };
}

// ─── Implementation ────────────────────────────────────────────────────────

export function compareSignNeighborsRegisterMatched(
  opts: CompareSignNeighborsRegisterMatchedOptions,
): CompareSignNeighborsRegisterMatchedResult {
  const warnings: string[] = [];

  if (typeof opts.sign !== "string" || opts.sign.trim() === "") {
    return buildEmptyResult(opts.sign ?? "", "divination", ["`sign` must be a non-empty string"], false);
  }

  const querySign = opts.sign.trim();
  const topK = Math.max(1, Math.min(50, opts.top_k ?? 5));

  // Resolve register.
  let register: RegisterKey;
  let autoSelected = false;
  if (!opts.register || opts.register === "auto") {
    const picked = pickMostSharedRegister(querySign);
    if (!picked) {
      warnings.push(
        `sign '${querySign}' is not present in BOTH NA and NB for any configured register (${ALL_REGISTERS.join(", ")}). Falling back to 'divination' for stats reporting; expect in_na=false / in_nb=false.`,
      );
      register = "divination";
    } else {
      register = picked;
      autoSelected = true;
      warnings.push(
        `register='auto' resolved to '${picked}' (best-supported register for sign '${querySign}' across NA and NB).`,
      );
    }
  } else {
    register = opts.register;
  }

  const naStats = bucketStats(register, "NA");
  const nbStats = bucketStats(register, "NB");

  if (!naStats.loaded) {
    warnings.push(
      `${register}/NA bucket not loaded: ${naStats.load_error ?? "unknown error"}`,
    );
  }
  if (!nbStats.loaded) {
    warnings.push(
      `${register}/NB bucket not loaded: ${nbStats.load_error ?? "unknown error"}`,
    );
  }

  const inNa = naStats.loaded && bucketHasSign(register, "NA", querySign);
  const inNb = nbStats.loaded && bucketHasSign(register, "NB", querySign);

  if (naStats.loaded && !inNa) {
    warnings.push(
      `sign '${querySign}' is not in the ${register}/NA vocab (must occur ≥ ${naStats.min_occurrences} times in NA tablets of register='${register}').`,
    );
  }
  if (nbStats.loaded && !inNb) {
    warnings.push(
      `sign '${querySign}' is not in the ${register}/NB vocab (must occur ≥ ${nbStats.min_occurrences} times in NB tablets of register='${register}').`,
    );
  }
  // Small-sample honesty flag.
  if (nbStats.loaded && nbStats.tablets_in_bucket < 500) {
    warnings.push(
      `small-sample warning: ${register}/NB has only ${nbStats.tablets_in_bucket} tablets. Drift signals from this register are noisier than the mixed-register v0.26 baseline.`,
    );
  }
  if (naStats.loaded && naStats.tablets_in_bucket < 500) {
    warnings.push(
      `small-sample warning: ${register}/NA has only ${naStats.tablets_in_bucket} tablets.`,
    );
  }

  const neighborsNa =
    inNa ? (bucketRankNeighbors(register, "NA", querySign, topK, 0) ?? []) : [];
  const neighborsNb =
    inNb ? (bucketRankNeighbors(register, "NB", querySign, topK, 0) ?? []) : [];

  const drift = computeDrift(neighborsNa, neighborsNb);
  const registerMatchedDrift =
    inNa && inNb && neighborsNa.length === topK && neighborsNb.length === topK
      ? topKDrift(drift)
      : 0;

  // ─── v0.26 mixed-register comparison ─────────────────────────────────────

  const mixedNaStats = mixedPeriodStats("NA");
  const mixedNbStats = mixedPeriodStats("NB");
  const mixedInNa = mixedNaStats.loaded && mixedPeriodHasSign("NA", querySign);
  const mixedInNb = mixedNbStats.loaded && mixedPeriodHasSign("NB", querySign);

  let mixedDriftTopK: number | null = null;
  let mixedNeighborsNa: RegisterSignNeighbor[] = [];
  let mixedNeighborsNb: RegisterSignNeighbor[] = [];
  if (mixedInNa && mixedInNb) {
    mixedNeighborsNa = mixedPeriodRankNeighbors("NA", querySign, topK, 0) ?? [];
    mixedNeighborsNb = mixedPeriodRankNeighbors("NB", querySign, topK, 0) ?? [];
    if (mixedNeighborsNa.length === topK && mixedNeighborsNb.length === topK) {
      const mixedDrift = computeDrift(mixedNeighborsNa, mixedNeighborsNb);
      mixedDriftTopK = topKDrift(mixedDrift);
    }
  } else if (!mixedNaStats.loaded || !mixedNbStats.loaded) {
    warnings.push(
      `v0.26 mixed-register per-period caches not loaded — mixed-register comparison will be null. NA loaded=${mixedNaStats.loaded}, NB loaded=${mixedNbStats.loaded}.`,
    );
  } else {
    warnings.push(
      `sign '${querySign}' not present in BOTH mixed-register NA and NB v0.26 vocabs — mixed-register comparison will be null.`,
    );
  }

  const registerMatchedDriftReport =
    inNa && inNb && neighborsNa.length === topK && neighborsNb.length === topK
      ? registerMatchedDrift
      : null;
  const drift_attributable_to_register =
    mixedDriftTopK !== null && registerMatchedDriftReport !== null
      ? mixedDriftTopK - registerMatchedDriftReport
      : null;

  // ─── Index stats over ALL buckets (handy for callers) ────────────────────
  const indexStats: BucketIndexStats[] = ALL_REGISTERS.flatMap((r) =>
    (["NA", "NB"] as PeriodKey[]).map((p) => {
      const st = bucketStats(r, p);
      return {
        register: r,
        period: p,
        signs_indexed: st.total_signs_indexed,
        tablets_in_bucket: st.tablets_in_bucket,
        min_occurrences: st.min_occurrences,
        loaded: st.loaded,
      };
    }),
  );

  return {
    query_sign: querySign,
    register,
    register_was_auto_selected: autoSelected,
    in_na: inNa,
    in_nb: inNb,
    neighbors_na: neighborsNa,
    neighbors_nb: neighborsNb,
    drift_signals: drift,
    register_matched_drift_topk: registerMatchedDrift,
    comparison_with_mixed_register: {
      mixed_register_drift_topk: mixedDriftTopK,
      register_matched_drift_topk: registerMatchedDriftReport,
      drift_attributable_to_register,
      mixed_neighbors_na: mixedNeighborsNa,
      mixed_neighbors_nb: mixedNeighborsNb,
    },
    index_stats: indexStats,
    warnings,
  };
}
