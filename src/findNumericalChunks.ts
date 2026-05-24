// v0.30.0 — find_numerical_chunks: data-driven numerical-context detection.
//
// Backbone: the v0.28 k-means clustering over the v0.23 sign2vec embedding
// space (src/clusterSignsByEmbedding.ts). v0.21's find_incipits hardcoded
// a 2-sign numerical-context filter — `NUMERICAL_SIGNS = {ABZ480, ABZ411}`
// — that the Round-8.1 audit confirmed behaves correctly EMPIRICALLY but
// rests on a falsified folk-Assyriological premise (v0.23 sign2vec cosine
// between ABZ480 and ABZ411 = 0.097; the two are NOT distributionally
// interchangeable, only co-occurring in numerical-table layouts).
//
// v0.28's k-means clustering surfaced the numerical class as a coherent
// structural feature of the sign2vec geometry: two adjacent clusters whose
// representative signs are dominated by digit strings ("4", "0", "27", "19")
// and the high-frequency numerical-table ABZ codes (ABZ480, ABZ411, ABZ427,
// ABZ598a, BAHAR₂). Round-13 audit verified that {ABZ480, "4", "0"} land
// in the same cluster at k=12 and stay co-clustered at k=15.
//
// This tool replaces the hardcoded 2-sign filter with the empirical
// cluster-membership set (~80-150 signs typically), and exposes a generic
// "numerical-context chunk" query over the v0.20 length-20 chunk-hash
// index. The CORE INVERSION vs find_incipits:
//
//   - find_incipits: numerical_density ≥ 70% → DROP (noise filter)
//   - find_numerical_chunks: numerical_density ≥ 50% → SURFACE (the
//     numerical-content corpus IS the object of interest)
//
// The threshold is lower (50% vs 70%) because we're MARKING content, not
// suppressing noise: a chunk where half its signs are numerical-class is
// already structurally a tabular/calendrical/accounting context.
//
// Methods-paper §3.13 documents v0.21's correct-behavior-wrong-rationale
// finding; v0.30 ships the principled replacement on the v0.28 empirical
// basis.

import {
  clusterSignsByEmbedding,
  type ClusterReport,
  type ClusterSignsResult,
} from "./clusterSignsByEmbedding.js";
import { loadChunkIndex, getChunkIndexLoadError } from "./chunkIndex.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type NumericalChunk = {
  chunk_hash: string;
  chunk_signs: string;
  host_count: number;
  /** Fraction of chunk signs (excluding the "…" X-skip gap marker) in the
   *  numerical_sign_set. Range [0, 1]; 1.0 = every sign is numerical-class. */
  numerical_density: number;
  numerical_sign_count: number;
  total_signs: number;
};

export type FindNumericalChunksResult = {
  /** The empirically-derived numerical-class sign vocabulary, taken as the
   *  union of `all_members` across every v0.28 cluster whose
   *  suggested_label is "numerical" OR whose representative signs include
   *  at least one pure-digit string. Sorted alphabetically for stability. */
  numerical_sign_set: string[];
  numerical_sign_set_size: number;
  chunks: NumericalChunk[];
  index_stats: {
    chunks_examined: number;
    chunks_above_density_threshold: number;
    k_used_for_clustering: number;
  };
  warnings: string[];
};

export type FindNumericalChunksOptions = {
  /** Default 0.5. Range [0, 1]. Chunks at OR ABOVE this density are
   *  surfaced. Inverted vs v0.21 find_incipits (which drops chunks ≥0.7). */
  min_numerical_density?: number;
  /** Default 5. Floor on chunk host count — chunks observed in fewer
   *  tablets than this are dropped (the v0.20 chunk-index has already
   *  pruned singletons, so the floor is structurally ≥2). */
  min_hosts?: number;
  /** Default 30. Hard cap 500. Chunks are ranked by host_count desc,
   *  then numerical_density desc as a tiebreaker. */
  top_k?: number;
  /** Default 12. Passed straight through to clusterSignsByEmbedding.
   *  k=12 is the Round-13 calibration default at which the numerical
   *  class first resolves as a dedicated cluster (at k=8 "4" merges
   *  with the ABZ411-anchored common-syllabogram cluster). */
  k?: number;
};

// ─── Numerical-cluster identification ─────────────────────────────────────
//
// A cluster is "numerical" iff EITHER condition holds:
//
//   1. suggested_label === "numerical"  (the v0.28 label heuristic
//      already fires on ≥40% pure-digit representative signs)
//   2. Any of the cluster's representative_signs is a pure-digit string
//      /^\d+$/ — i.e. "0", "1", ..., "27", ...
//
// Condition (2) is a defense-in-depth check: if the v0.28 label heuristic
// is ever weakened, we still detect digit-class clusters via direct sign
// inspection. It also handles the edge case where a digit-class cluster's
// representative_signs are dominated by ABZ codes (e.g. ABZ480, ABZ411,
// ABZ427) with only one or two raw digit strings — the label-rule's 40%
// threshold could miss this; the representative-sign check catches it.
//
// We use representative_signs (closest-to-centroid) NOT top_signs_by_occurrence
// because high-frequency syllabograms flood the latter and contaminate
// the diagnostic.

const PURE_DIGIT_RE = /^\d+$/;

function isNumericalCluster(cluster: ClusterReport): boolean {
  if (cluster.suggested_label === "numerical") return true;
  for (const r of cluster.representative_signs) {
    if (PURE_DIGIT_RE.test(r.sign)) return true;
  }
  return false;
}

/**
 * Build the empirical numerical-sign vocabulary by taking the union of
 * `all_members` across every cluster the rule above flags as numerical.
 *
 * Exported so the audit script can introspect the set directly.
 */
export function buildNumericalSignSet(
  clusteringResult: ClusterSignsResult,
): { signs: string[]; sourceClusterIds: number[] } {
  const sourceClusterIds: number[] = [];
  const acc = new Set<string>();
  for (const c of clusteringResult.clusters) {
    if (!isNumericalCluster(c)) continue;
    sourceClusterIds.push(c.id);
    for (const m of c.all_members) acc.add(m);
  }
  // Sort alphabetically for stable output.
  const signs = [...acc].sort();
  return { signs, sourceClusterIds };
}

// ─── Sign tokenization (mirrors v0.21 isNumericalOnly) ────────────────────
//
// The chunk-index stores `signs` as a whitespace-joined string, with "…"
// marking X-skip gaps (per src/chunkIndex.ts).  We split on whitespace,
// drop empties, drop "…". Everything else is a candidate sign token.
//
// We deliberately re-implement the tokenization here instead of importing
// `isNumericalOnly` from src/findIncipits.ts because:
//   - the comparison axis is different (≥0.5 surface vs ≥0.7 drop)
//   - the membership set is different (~100 signs vs 2 signs)
//   - we want v0.30 to be readable as a standalone artifact in the methods
//     paper, not a half-overload of an unrelated v0.21 helper

function tokenizeChunkSigns(chunkSigns: string): string[] {
  return chunkSigns.split(/\s+/).filter((t) => t && t !== "…");
}

/** Returns [count_in_set, total_tokens]. */
function countNumericalSigns(
  chunkSigns: string,
  numericalSet: Set<string>,
): { count: number; total: number } {
  const tokens = tokenizeChunkSigns(chunkSigns);
  let count = 0;
  for (const t of tokens) if (numericalSet.has(t)) count++;
  return { count, total: tokens.length };
}

// ─── Public entry point ───────────────────────────────────────────────────

export function findNumericalChunks(
  opts: FindNumericalChunksOptions = {},
): FindNumericalChunksResult {
  const warnings: string[] = [];

  const minDensity = clamp01(opts.min_numerical_density ?? 0.5);
  const minHosts = Math.max(2, Math.floor(opts.min_hosts ?? 5));
  const topK = Math.max(1, Math.min(500, Math.floor(opts.top_k ?? 30)));
  const k = Math.max(2, Math.min(50, Math.floor(opts.k ?? 12)));

  // ── Step 1-3: derive the empirical numerical-sign vocabulary ─────────────

  const clusteringResult = clusterSignsByEmbedding({ k });
  if (clusteringResult.clusters.length === 0) {
    return {
      numerical_sign_set: [],
      numerical_sign_set_size: 0,
      chunks: [],
      index_stats: {
        chunks_examined: 0,
        chunks_above_density_threshold: 0,
        k_used_for_clustering: k,
      },
      warnings: [
        ...clusteringResult.warnings,
        "sign-clustering produced no clusters; cannot derive numerical_sign_set",
      ],
    };
  }
  for (const w of clusteringResult.warnings) warnings.push(`[cluster] ${w}`);

  const { signs: numericalSigns, sourceClusterIds } =
    buildNumericalSignSet(clusteringResult);
  if (numericalSigns.length === 0) {
    return {
      numerical_sign_set: [],
      numerical_sign_set_size: 0,
      chunks: [],
      index_stats: {
        chunks_examined: 0,
        chunks_above_density_threshold: 0,
        k_used_for_clustering: clusteringResult.k,
      },
      warnings: warnings.concat([
        `no numerical clusters detected at k=${clusteringResult.k} ` +
          `(neither label heuristic nor representative-digit check fired); ` +
          `tool cannot produce results — try increasing k`,
      ]),
    };
  }
  const numericalSet = new Set(numericalSigns);

  // ── Step 4: scan the chunk-hash index ────────────────────────────────────

  const chunkIndex = loadChunkIndex();
  if (!chunkIndex) {
    return {
      numerical_sign_set: numericalSigns,
      numerical_sign_set_size: numericalSigns.length,
      chunks: [],
      index_stats: {
        chunks_examined: 0,
        chunks_above_density_threshold: 0,
        k_used_for_clustering: clusteringResult.k,
      },
      warnings: warnings.concat([
        getChunkIndexLoadError() ?? "chunk-index unavailable",
      ]),
    };
  }

  // ── Step 5: score every chunk and threshold ──────────────────────────────

  type Scored = {
    chunk: NumericalChunk;
  };
  const scored: Scored[] = [];
  let chunksExamined = 0;
  let chunksAbove = 0;
  for (const entry of chunkIndex.entries) {
    chunksExamined++;
    if (entry.occurrences.length < minHosts) {
      // chunkIndex entries are sorted by occurrences.length desc; once we
      // drop below minHosts we can early-exit. (This matches the
      // getChunksAboveHostCount helper's strategy.)
      break;
    }
    const { count, total } = countNumericalSigns(entry.signs, numericalSet);
    if (total === 0) continue;
    const density = count / total;
    if (density < minDensity) continue;
    chunksAbove++;
    scored.push({
      chunk: {
        chunk_hash: entry.hash,
        chunk_signs: entry.signs,
        host_count: entry.occurrences.length,
        numerical_density: +density.toFixed(4),
        numerical_sign_count: count,
        total_signs: total,
      },
    });
  }

  // Rank by host_count desc, then numerical_density desc as tiebreaker.
  // Density-as-tiebreaker rewards purer numerical chunks at equal host count,
  // which is what scholarly use ("show me the most-canonical numerical
  // templates") would want.
  scored.sort((a, b) => {
    if (b.chunk.host_count !== a.chunk.host_count)
      return b.chunk.host_count - a.chunk.host_count;
    return b.chunk.numerical_density - a.chunk.numerical_density;
  });

  const chunks = scored.slice(0, topK).map((s) => s.chunk);

  // Provenance breadcrumb for the methods paper.
  warnings.push(
    `numerical_sign_set derived from v0.28 clusters [${sourceClusterIds.join(", ")}] ` +
      `at k=${clusteringResult.k} (silhouette=${clusteringResult.silhouette_score}); ` +
      `size=${numericalSigns.length}`,
  );

  return {
    numerical_sign_set: numericalSigns,
    numerical_sign_set_size: numericalSigns.length,
    chunks,
    index_stats: {
      chunks_examined: chunksExamined,
      chunks_above_density_threshold: chunksAbove,
      k_used_for_clustering: clusteringResult.k,
    },
    warnings,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
