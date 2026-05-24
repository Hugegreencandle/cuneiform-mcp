// v0.25.0 — lexical-substitution baseline (lift-over-baseline normalization).
//
// v0.24's compute_lexical_substitution_score returns a raw score in [0,1].
// Round-9 audit found that the discriminative gap between a known-sibling
// pair (K.5896 ↔ K.9508, score 0.78) and an unrelated random pair
// (U.21017 ↔ K.9653, score 0.65) is only ~0.13. Root cause: the corpus's
// high-frequency sign core (determinatives, ABZ480 numerals, common
// syllabograms) saturates sign2vec neighborhoods across nearly all pairs,
// so most pair scores cluster in a narrow band even when no real
// distributional equivalence exists.
//
// v0.25 fixes this by SUBTRACTING a vocabulary-size-matched corpus baseline.
// The discriminative signal is the LIFT above the saturation floor — not
// the raw score itself.
//
// The baseline file (one per corpus version) is built once by
// scripts/build-lexical-substitution-baseline.mjs and lives at
// ~/.cache/cuneiform-mcp/lexical-substitution-baseline.json. It samples
// N=100 random tablet pairs in each of 7 vocab-size buckets and records
// the mean + stddev of both the total score and the substitution_share.
//
// At query time, a tablet pair's vocab size selects the matching bucket;
// lift_z_score = (raw_score − bucket_mean) / bucket_stddev.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Public types ──────────────────────────────────────────────────────────

/**
 * One vocab-size bucket of the baseline. Populated by the build script;
 * read-only at runtime.
 */
export type BaselineBucket = {
  /** Center of the vocab-size bucket (signs). Pair is bucketed by its larger
   *  vocab, clamped to the nearest target. */
  vocab_size_target: number;
  /** Half-width of the bucket, as a multiplicative fraction. 0.2 means a
   *  bucket of [target*0.8, target*1.2]. */
  bucket_half_width: number;
  /** Count of random pairs sampled into this bucket. */
  sample_size: number;
  /** Mean of `lexical_substitution_score` across the sampled random pairs. */
  mean_score: number;
  /** Sample stddev of `lexical_substitution_score`. */
  stddev_score: number;
  /** Mean of `substitution_share` (the substitution-only component). */
  mean_substitution_share: number;
  /** Sample stddev of `substitution_share`. */
  stddev_substitution_share: number;
  /** Mean of `exact_share` — useful for interpreting the baseline. */
  mean_exact_share: number;
  /** Median of `lexical_substitution_score`. */
  median_score: number;
};

export type BaselineFile = {
  version: string;
  build_timestamp: string;
  /** N=100 (default). */
  sample_size_per_bucket_target: number;
  /** Top-K sign2vec neighbors used. Must match the query-time topK for the
   *  baseline to be comparable. */
  top_k_neighbors: number;
  /** sign2vec cosine floor used. Must match the query-time cosine. */
  min_neighbor_cosine: number;
  /** Deterministic RNG seed (for reproducibility). */
  rng_seed: number;
  /** Total tablets available in the corpus at build time. */
  corpus_tablets: number;
  buckets: BaselineBucket[];
};

// ─── Module state ──────────────────────────────────────────────────────────

let _baseline: BaselineFile | null = null;
let _loadError: string | null = null;
let _attemptedLoad = false;

const BASELINE_FILE = "lexical-substitution-baseline.json";

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadBaseline(): BaselineFile | null {
  if (_baseline) return _baseline;
  if (_attemptedLoad) return null;
  _attemptedLoad = true;
  const path = join(cacheDir(), BASELINE_FILE);
  if (!existsSync(path)) {
    _loadError = `lexical-substitution baseline not built: ${path} missing — run scripts/build-lexical-substitution-baseline.mjs`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as BaselineFile;
    if (!parsed.buckets || !Array.isArray(parsed.buckets) || parsed.buckets.length === 0) {
      _loadError = `lexical-substitution baseline ${path} has no buckets`;
      return null;
    }
    // Sort buckets ascending by vocab_size_target so lookup can binary-search.
    parsed.buckets.sort((a, b) => a.vocab_size_target - b.vocab_size_target);
    _baseline = parsed;
    return _baseline;
  } catch (e) {
    _loadError = `lexical-substitution baseline load failed: ${e instanceof Error ? e.message : String(e)}`;
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function getBaseline(): BaselineFile | null {
  return loadBaseline();
}

export function getBaselineLoadError(): string | null {
  // Trigger the load attempt so callers querying the error after a never-loaded
  // module get the actual reason rather than null.
  loadBaseline();
  return _loadError;
}

export type BaselineSelection = {
  bucket: BaselineBucket;
  /** How far the query's vocab is from the bucket center, as a fraction of
   *  the center (0 == exact match, 0.2 == 20% deviation). */
  distance_from_center: number;
  /** True if the larger vocab is within the bucket's nominal half-width. */
  in_bucket_range: boolean;
};

/**
 * Pick the baseline bucket whose vocab_size_target is closest (in log-space)
 * to the query's effective vocab size. The query's "effective" vocab is the
 * MAX of (|A_vocab|, |B_vocab|) — the same denominator the raw score uses.
 *
 * Returns the closest bucket regardless of half-width — if the query falls
 * outside any nominal bucket range, `in_bucket_range` is false (warning).
 */
export function selectBaselineBucket(
  effectiveVocab: number,
): BaselineSelection | null {
  const baseline = loadBaseline();
  if (!baseline) return null;
  if (effectiveVocab <= 0) {
    // Pick the smallest bucket as a fallback.
    const smallest = baseline.buckets[0];
    return {
      bucket: smallest,
      distance_from_center: 1,
      in_bucket_range: false,
    };
  }
  // Pick bucket whose log-distance is smallest — vocab sizes span 25→1600,
  // log-space gives more uniform "closeness" than linear.
  let best: BaselineBucket = baseline.buckets[0];
  let bestLogDist = Math.abs(Math.log(effectiveVocab / best.vocab_size_target));
  for (let i = 1; i < baseline.buckets.length; i++) {
    const b = baseline.buckets[i];
    const d = Math.abs(Math.log(effectiveVocab / b.vocab_size_target));
    if (d < bestLogDist) {
      best = b;
      bestLogDist = d;
    }
  }
  const linearDist = Math.abs(effectiveVocab - best.vocab_size_target) / best.vocab_size_target;
  return {
    bucket: best,
    distance_from_center: +linearDist.toFixed(4),
    in_bucket_range: linearDist <= best.bucket_half_width,
  };
}

/**
 * Compute lift_z_score: (raw_score - bucket_mean) / bucket_stddev.
 * Returns 0 if stddev <= 0 (defensive — should never happen with N=100).
 */
export function liftZScore(rawScore: number, bucket: BaselineBucket): number {
  if (bucket.stddev_score <= 0) return 0;
  return (rawScore - bucket.mean_score) / bucket.stddev_score;
}

/** Same formula but for the substitution_share component. */
export function substitutionLiftZScore(
  rawSubShare: number,
  bucket: BaselineBucket,
): number {
  if (bucket.stddev_substitution_share <= 0) return 0;
  return (rawSubShare - bucket.mean_substitution_share) / bucket.stddev_substitution_share;
}

/**
 * Rough percentile estimate: convert a z-score to an approximate one-tail
 * percentile using the standard-normal CDF approximation (Abramowitz–Stegun
 * 26.2.17). NOT exact, but adequate for "how unusual is this lift?" framing.
 * Returns a value in [0, 100].
 */
export function zToPercentile(z: number): number {
  // Phi(z) approximation.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  const phi =
    1 -
    d *
      t *
      (0.319381530 +
        t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const result = z >= 0 ? phi : 1 - phi;
  return +(100 * result).toFixed(2);
}
