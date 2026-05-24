// v0.25.0 — compute_lexical_substitution_lift.
//
// Lift-over-baseline normalization for v0.24's raw lexical-substitution score.
//
// The v0.24 raw score (exact_overlap + substitution_matches) / max(|A|, |B|)
// works in [0,1] but suffers from high-frequency sign-core saturation:
// nearly all pairs in the corpus return scores in [0.4, 0.8] because the
// sign-vocabulary core (determinatives, numerals, common syllabograms)
// fills both exact-overlap and sign2vec-neighbor matches even for unrelated
// tablets. The Round-9 finding: sibling-pair K.5896 ↔ K.9508 scored 0.78,
// random-pair U.21017 ↔ K.9653 scored 0.65 — a 0.13 gap but a NARROW 22%
// relative lift.
//
// v0.25 reports the DISCRIMINATIVE signal directly. For a query pair:
//
//   1. Compute raw_score via the v0.24 implementation.
//   2. Look up the baseline bucket whose vocab_size_target is closest to
//      max(|A|, |B|) in log-space.
//   3. lift_z_score = (raw_score − bucket_mean) / bucket_stddev.
//   4. Surface is_meaningfully_above_baseline (lift_z_score > 2) and a
//      rough one-tail percentile.
//
// This tool is ADDITIVE: v0.24's raw-score tool stays for backward compat.
// The baseline JSON is built once via scripts/build-lexical-substitution-baseline.mjs.

import {
  computeLexicalSubstitutionScore,
  type LexicalSubstitutionResult,
} from "./lexicalSubstitution.js";
import {
  getBaseline,
  getBaselineLoadError,
  selectBaselineBucket,
  liftZScore,
  substitutionLiftZScore,
  zToPercentile,
  type BaselineBucket,
} from "./lexicalSubstitutionBaseline.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type LexicalSubstitutionLiftOptions = {
  tabletA: string;
  tabletB: string;
  /** Top-K sign2vec neighbors. Default 5. SHOULD match baseline build's topK. */
  topKNeighbors?: number;
  /** Cosine floor for sign2vec neighbors. Default 0.4. SHOULD match baseline. */
  minNeighborCosine?: number;
  /** Cap on substitution_pairs sample size carried through. Default 20. */
  pairSampleCap?: number;
};

export type LexicalSubstitutionLiftResult = {
  tablet_a: string;
  tablet_b: string;
  tablet_a_vocab_size: number;
  tablet_b_vocab_size: number;
  /** max(|A_vocab|, |B_vocab|) — the same denominator the raw score uses, and
   *  the value used to pick the matching baseline bucket. */
  effective_vocab_size: number;
  /** v0.24-compatible raw score in [0,1]. */
  raw_score: number;
  /** v0.24-compatible: exact_overlap / max(|A|, |B|). */
  raw_exact_share: number;
  /** v0.24-compatible: substitution_matches / max(|A|, |B|). */
  raw_substitution_share: number;
  /** Center vocab_size_target of the baseline bucket selected for this pair. */
  baseline_bucket_size: number;
  /** Half-width fraction of the bucket (e.g. 0.2 means ±20% nominally). */
  baseline_bucket_half_width: number;
  /** True if the query's effective_vocab_size falls within the bucket's
   *  half-width. If false, the lift z-score is still computed but flagged. */
  in_bucket_range: boolean;
  /** Number of random pairs sampled to build the selected bucket. */
  baseline_sample_size: number;
  /** Mean lexical_substitution_score across the bucket's random pairs. */
  baseline_mean_score: number;
  /** Sample stddev of lexical_substitution_score in the bucket. */
  baseline_stddev_score: number;
  /** Mean substitution_share across the bucket's random pairs. */
  baseline_mean_substitution_share: number;
  /** Sample stddev of substitution_share in the bucket. */
  baseline_stddev_substitution_share: number;
  /** PRIMARY OUTPUT: (raw_score − bucket_mean) / bucket_stddev. */
  lift_z_score: number;
  /** Same z-formula, applied to the substitution-only component. */
  substitution_lift_z_score: number;
  /** True if lift_z_score > 2 (rough "≥97.5th percentile" threshold). */
  is_meaningfully_above_baseline: boolean;
  /** Rough one-tail percentile from lift_z_score (Φ(z) approximation). */
  percentile_above_baseline: number;
  /** Carried through from v0.24's raw score, ranked by cosine desc. */
  substitution_pairs: LexicalSubstitutionResult["substitution_pairs"];
  index_stats: LexicalSubstitutionResult["index_stats"] & {
    baseline_loaded: boolean;
    baseline_total_buckets: number;
  };
  warnings: string[];
};

// ─── Public API ────────────────────────────────────────────────────────────

export function computeLexicalSubstitutionLift(
  opts: LexicalSubstitutionLiftOptions,
): LexicalSubstitutionLiftResult {
  const warnings: string[] = [];
  const a = opts.tabletA.trim();
  const b = opts.tabletB.trim();
  const topK = opts.topKNeighbors ?? 5;
  const minCos = opts.minNeighborCosine ?? 0.4;
  const pairCap = opts.pairSampleCap ?? 20;

  const raw = computeLexicalSubstitutionScore({
    tabletA: a,
    tabletB: b,
    topKNeighbors: topK,
    minNeighborCosine: minCos,
    includeAxisComparison: false,
    pairSampleCap: pairCap,
  });
  for (const w of raw.warnings) warnings.push(w);

  const effectiveVocab = Math.max(raw.tablet_a_vocab_size, raw.tablet_b_vocab_size);

  const baseline = getBaseline();
  if (!baseline) {
    const err = getBaselineLoadError() ?? "baseline unavailable";
    warnings.push(err);
    return emptyResult(a, b, raw, effectiveVocab, warnings);
  }

  // Sanity: warn if the baseline was built with different (topK, minCos) than
  // the current query, since the lift assumes apples-to-apples comparison.
  if (baseline.top_k_neighbors !== topK) {
    warnings.push(
      `baseline built with top_k_neighbors=${baseline.top_k_neighbors} but query uses top_k_neighbors=${topK} — lift z-score may be biased`,
    );
  }
  if (Math.abs(baseline.min_neighbor_cosine - minCos) > 1e-6) {
    warnings.push(
      `baseline built with min_neighbor_cosine=${baseline.min_neighbor_cosine} but query uses min_neighbor_cosine=${minCos} — lift z-score may be biased`,
    );
  }

  const selection = selectBaselineBucket(effectiveVocab);
  if (!selection) {
    warnings.push("could not select a baseline bucket — falling back to raw score");
    return emptyResult(a, b, raw, effectiveVocab, warnings);
  }
  const bucket: BaselineBucket = selection.bucket;
  if (!selection.in_bucket_range) {
    warnings.push(
      `effective_vocab=${effectiveVocab} is outside the chosen bucket's half-width (target=${bucket.vocab_size_target}, half_width=${bucket.bucket_half_width}, distance=${selection.distance_from_center}) — lift z-score is approximate`,
    );
  }

  const lift = liftZScore(raw.lexical_substitution_score, bucket);
  const subLift = substitutionLiftZScore(raw.score_breakdown.substitution_share, bucket);
  const percentile = zToPercentile(lift);

  return {
    tablet_a: a,
    tablet_b: b,
    tablet_a_vocab_size: raw.tablet_a_vocab_size,
    tablet_b_vocab_size: raw.tablet_b_vocab_size,
    effective_vocab_size: effectiveVocab,
    raw_score: raw.lexical_substitution_score,
    raw_exact_share: raw.score_breakdown.exact_share,
    raw_substitution_share: raw.score_breakdown.substitution_share,
    baseline_bucket_size: bucket.vocab_size_target,
    baseline_bucket_half_width: bucket.bucket_half_width,
    in_bucket_range: selection.in_bucket_range,
    baseline_sample_size: bucket.sample_size,
    baseline_mean_score: bucket.mean_score,
    baseline_stddev_score: bucket.stddev_score,
    baseline_mean_substitution_share: bucket.mean_substitution_share,
    baseline_stddev_substitution_share: bucket.stddev_substitution_share,
    lift_z_score: +lift.toFixed(4),
    substitution_lift_z_score: +subLift.toFixed(4),
    is_meaningfully_above_baseline: lift > 2,
    percentile_above_baseline: percentile,
    substitution_pairs: raw.substitution_pairs,
    index_stats: {
      ...raw.index_stats,
      baseline_loaded: true,
      baseline_total_buckets: baseline.buckets.length,
    },
    warnings,
  };
}

function emptyResult(
  a: string,
  b: string,
  raw: LexicalSubstitutionResult,
  effectiveVocab: number,
  warnings: string[],
): LexicalSubstitutionLiftResult {
  return {
    tablet_a: a,
    tablet_b: b,
    tablet_a_vocab_size: raw.tablet_a_vocab_size,
    tablet_b_vocab_size: raw.tablet_b_vocab_size,
    effective_vocab_size: effectiveVocab,
    raw_score: raw.lexical_substitution_score,
    raw_exact_share: raw.score_breakdown.exact_share,
    raw_substitution_share: raw.score_breakdown.substitution_share,
    baseline_bucket_size: 0,
    baseline_bucket_half_width: 0,
    in_bucket_range: false,
    baseline_sample_size: 0,
    baseline_mean_score: 0,
    baseline_stddev_score: 0,
    baseline_mean_substitution_share: 0,
    baseline_stddev_substitution_share: 0,
    lift_z_score: 0,
    substitution_lift_z_score: 0,
    is_meaningfully_above_baseline: false,
    percentile_above_baseline: 0,
    substitution_pairs: raw.substitution_pairs,
    index_stats: {
      ...raw.index_stats,
      baseline_loaded: false,
      baseline_total_buckets: 0,
    },
    warnings,
  };
}
