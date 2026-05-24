// v0.28.0 — cluster_signs_by_embedding: k-means over sign2vec embeddings.
//
// Companion to v0.23's find_similar_signs (per-sign distributional embeddings)
// and v0.15's tablet-level Random Indexing. Where find_similar_signs answers
// "which signs are nearest neighbors?", this tool answers the higher-order
// question:
//
//   "Without scholar curation, does the sign2vec embedding space SEPARATE
//    into coherent classes (numerals, common syllabograms, compound
//    logograms, etc.)? If so, what are they?"
//
// Method: k-means++ on the L2-normalized 100-dim sign vectors (Lloyd's
// algorithm, Euclidean distance — which is monotone-equivalent to cosine
// on the unit sphere). Deterministic via a `mulberry32(20260525)` seed so
// audits and re-runs reproduce identical clusterings.
//
// Output is shaped to be a methods-paper artifact: per-cluster member lists,
// top-3 most-representative signs (nearest to centroid), mean intra-cluster
// cosine, nearest-other-cluster distance, plus a best-effort heuristic
// `suggested_label` so the reader can scan the dump without inspecting
// every member. The label heuristic is documented in `suggestLabel` below.
//
// The silhouette score is the overall cluster-quality scalar; we report it
// as a single number, not per-sign, to keep payloads small.

import {
  signEmbeddingStats,
  getSignVector,
  getSignOccurrences,
  topMostFrequentSigns,
  type SignEmbeddingEntry,
} from "./signEmbeddings.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ClusterRepresentative = {
  sign: string;
  occurrences: number;
  cosine_to_centroid: number;
};

export type ClusterReport = {
  id: number;
  size: number;
  mean_intra_cluster_cosine: number;
  nearest_other_cluster_distance: number;
  representative_signs: ClusterRepresentative[];
  top_signs_by_occurrence: ClusterRepresentative[];
  all_members: string[];
  suggested_label: string;
};

export type ClusterSignsResult = {
  k: number;
  total_signs_clustered: number;
  iterations_run: number;
  converged: boolean;
  silhouette_score: number;
  clusters: ClusterReport[];
  index_stats: {
    total_signs_indexed: number;
    embedding_dim: number;
    window_size: number;
    build_timestamp: string;
  };
  warnings: string[];
};

export type ClusterSignsOptions = {
  /** Default 12, hard cap 50. Floor 2. */
  k?: number;
  /** Default 100. */
  max_iterations?: number;
};

// ─── Deterministic RNG (mulberry32, seed 20260525) ────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KMEANS_SEED = 20260525;

// ─── Vector helpers ────────────────────────────────────────────────────────

function squaredEuclidean(a: Float32Array, b: Float32Array, dim: number): number {
  let s = 0;
  for (let k = 0; k < dim; k++) {
    const d = a[k] - b[k];
    s += d * d;
  }
  return s;
}

function dot(a: Float32Array, b: Float32Array, dim: number): number {
  let s = 0;
  for (let k = 0; k < dim; k++) s += a[k] * b[k];
  return s;
}

/** L2-normalize in place. No-op if norm is 0. */
function l2NormalizeInPlace(v: Float32Array): void {
  let s = 0;
  for (let k = 0; k < v.length; k++) s += v[k] * v[k];
  if (s === 0) return;
  const inv = 1 / Math.sqrt(s);
  for (let k = 0; k < v.length; k++) v[k] *= inv;
}

// ─── k-means++ seeding ─────────────────────────────────────────────────────

function kmeansPlusPlusSeed(
  vectors: Float32Array[],
  k: number,
  rng: () => number,
  dim: number,
): Float32Array[] {
  const n = vectors.length;
  const centroids: Float32Array[] = [];
  const firstIdx = Math.floor(rng() * n);
  centroids.push(new Float32Array(vectors[firstIdx]));

  const minDistSq = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    minDistSq[i] = squaredEuclidean(vectors[i], centroids[0], dim);
  }

  for (let c = 1; c < k; c++) {
    // Cumulative distribution proportional to minDistSq.
    let total = 0;
    for (let i = 0; i < n; i++) total += minDistSq[i];
    if (total <= 0) {
      // Degenerate (all points already at a centroid) — pick a random one.
      centroids.push(new Float32Array(vectors[Math.floor(rng() * n)]));
    } else {
      const target = rng() * total;
      let acc = 0;
      let pick = n - 1;
      for (let i = 0; i < n; i++) {
        acc += minDistSq[i];
        if (acc >= target) {
          pick = i;
          break;
        }
      }
      centroids.push(new Float32Array(vectors[pick]));
    }
    // Update minDistSq with the new centroid.
    const newC = centroids[c];
    for (let i = 0; i < n; i++) {
      const d = squaredEuclidean(vectors[i], newC, dim);
      if (d < minDistSq[i]) minDistSq[i] = d;
    }
  }

  return centroids;
}

// ─── Lloyd's algorithm ─────────────────────────────────────────────────────

type KMeansState = {
  centroids: Float32Array[];
  assignments: Int32Array;
  iterations: number;
  converged: boolean;
};

function runKMeans(
  vectors: Float32Array[],
  k: number,
  maxIter: number,
  rng: () => number,
  dim: number,
): KMeansState {
  const n = vectors.length;
  const centroids = kmeansPlusPlusSeed(vectors, k, rng, dim);
  const assignments = new Int32Array(n);
  assignments.fill(-1);

  let iter = 0;
  let converged = false;
  for (; iter < maxIter; iter++) {
    let changed = 0;
    // Assignment step.
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestDist = squaredEuclidean(vectors[i], centroids[0], dim);
      for (let c = 1; c < k; c++) {
        const d = squaredEuclidean(vectors[i], centroids[c], dim);
        if (d < bestDist) {
          bestDist = d;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed++;
      }
    }

    // Update step. We re-L2-normalize centroids so they live on the unit
    // sphere alongside the data — this keeps the geometry interpretable as
    // cosine and prevents centroid drift toward the origin in low-density
    // clusters.
    const newCentroids: Float32Array[] = [];
    const counts = new Int32Array(k);
    for (let c = 0; c < k; c++) newCentroids.push(new Float32Array(dim));
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const dst = newCentroids[c];
      const src = vectors[i];
      for (let kk = 0; kk < dim; kk++) dst[kk] += src[kk];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Empty cluster — re-seed it to the data point farthest from any
        // existing centroid. This is the standard Hartigan fix.
        let farIdx = 0;
        let farDist = -1;
        for (let i = 0; i < n; i++) {
          let nearest = Infinity;
          for (let cc = 0; cc < k; cc++) {
            const d = squaredEuclidean(vectors[i], newCentroids[cc], dim);
            if (d < nearest) nearest = d;
          }
          if (nearest > farDist) {
            farDist = nearest;
            farIdx = i;
          }
        }
        newCentroids[c] = new Float32Array(vectors[farIdx]);
      } else {
        const inv = 1 / counts[c];
        const dst = newCentroids[c];
        for (let kk = 0; kk < dim; kk++) dst[kk] *= inv;
        l2NormalizeInPlace(dst);
      }
      centroids[c] = newCentroids[c];
    }

    if (changed === 0) {
      converged = true;
      iter++;
      break;
    }
  }

  return { centroids, assignments, iterations: iter, converged };
}

// ─── Silhouette score ──────────────────────────────────────────────────────
//
// Silhouette for point i:
//   s(i) = (b(i) - a(i)) / max(a(i), b(i))
// where a(i) is mean intra-cluster distance, b(i) is the min mean distance
// to any other cluster. Range [-1, 1]; > 0 indicates the point is closer
// to its own cluster than to its nearest neighbor cluster. We report the
// mean over all points.
//
// Distance metric: Euclidean (consistent with the k-means objective).

function silhouette(
  vectors: Float32Array[],
  assignments: Int32Array,
  k: number,
  dim: number,
): number {
  const n = vectors.length;
  if (n === 0) return 0;

  // Pre-bucket members per cluster.
  const buckets: number[][] = [];
  for (let c = 0; c < k; c++) buckets.push([]);
  for (let i = 0; i < n; i++) buckets[assignments[i]].push(i);

  let sumS = 0;
  let counted = 0;
  for (let i = 0; i < n; i++) {
    const own = assignments[i];
    const ownMembers = buckets[own];
    // a(i): mean distance to other members of own cluster.
    let a = 0;
    if (ownMembers.length > 1) {
      for (let j = 0; j < ownMembers.length; j++) {
        const idx = ownMembers[j];
        if (idx === i) continue;
        a += Math.sqrt(squaredEuclidean(vectors[i], vectors[idx], dim));
      }
      a /= ownMembers.length - 1;
    } else {
      // Singleton cluster — silhouette is defined as 0 by convention.
      counted++;
      continue;
    }
    // b(i): min over other clusters of mean distance.
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own) continue;
      const m = buckets[c];
      if (m.length === 0) continue;
      let sum = 0;
      for (let j = 0; j < m.length; j++) {
        sum += Math.sqrt(squaredEuclidean(vectors[i], vectors[m[j]], dim));
      }
      const mean = sum / m.length;
      if (mean < b) b = mean;
    }
    const denom = Math.max(a, b);
    const s = denom > 0 ? (b - a) / denom : 0;
    sumS += s;
    counted++;
  }
  return counted > 0 ? sumS / counted : 0;
}

// ─── Suggested-label heuristic ────────────────────────────────────────────
//
// Pure best-effort. The methods paper should treat these labels as
// LITERATURE-FACING SHORTHAND, not as a typological claim — the empirical
// clusters are the artifact.
//
// We score the cluster's TOP-K signs CLOSEST TO CENTROID (representative
// signs), not the top-by-occurrence. Closest-to-centroid signs are the
// geometric exemplars of the cluster; top-by-occurrence is biased toward
// high-frequency syllabograms that flood every cluster.
//
// Rule order (first to fire wins):
//   1. ≥40% pure-digit strings (/^\d+$/) → "numerical"
//   2. ≥40% compound-logogram markers (×, |…|, +, /, %) → "compound_logogram"
//   3. ≥40% lowercase phonetic-reading tokens (single ASCII lowercase
//      word, optionally with subscript digit suffix) → "phonetic_reading_family"
//   4. ≥60% ABZNNN-prefixed → "abz_syllabogram_family"
//   5. else → "mixed_distributional_group_<id>"
//
// Thresholds: numerical/compound/phonetic at 40% because they are
// MARKED categories — even partial enrichment is diagnostic. ABZ at 60%
// because it is the unmarked default (most signs are ABZ-prefixed, so
// "majority ABZ" is the residual case).

function suggestLabel(representativeSigns: string[], clusterId: number): string {
  if (representativeSigns.length === 0) return `empty_cluster_${clusterId}`;
  const sample = representativeSigns.slice(0, 10);
  const n = sample.length;
  const markedThreshold = Math.max(1, Math.ceil(n * 0.4));
  const unmarkedThreshold = Math.ceil(n * 0.6);

  let digits = 0;
  let compound = 0;
  let abz = 0;
  let phonetic = 0;
  for (const s of sample) {
    if (/^\d+$/.test(s)) digits++;
    if (
      s.includes("×") ||
      s.includes("|") ||
      s.includes("+") ||
      s.includes("/") ||
      s.includes("%") ||
      s.includes("@")
    ) {
      compound++;
    }
    if (/^ABZ\d+/.test(s)) abz++;
    // Phonetic reading: pure lowercase ASCII (optionally with subscript-digit
    // or trailing digit suffix). Excludes ABZ codes (uppercase) and digit
    // strings.
    if (/^[a-zšṣṭṯĝḫ]+[₁-₉]?$/.test(s)) phonetic++;
  }

  if (digits >= markedThreshold) return "numerical";
  if (compound >= markedThreshold) return "compound_logogram";
  if (phonetic >= markedThreshold) return "phonetic_reading_family";
  if (abz >= unmarkedThreshold) return "abz_syllabogram_family";
  return `mixed_distributional_group_${clusterId}`;
}

// ─── Per-cluster reporting ────────────────────────────────────────────────

function buildClusterReports(
  vectors: Float32Array[],
  vocab: string[],
  occurrences: number[],
  assignments: Int32Array,
  centroids: Float32Array[],
  dim: number,
): ClusterReport[] {
  const k = centroids.length;
  const buckets: number[][] = [];
  for (let c = 0; c < k; c++) buckets.push([]);
  for (let i = 0; i < vectors.length; i++) buckets[assignments[i]].push(i);

  const reports: ClusterReport[] = [];
  for (let c = 0; c < k; c++) {
    const members = buckets[c];
    if (members.length === 0) {
      reports.push({
        id: c,
        size: 0,
        mean_intra_cluster_cosine: 0,
        nearest_other_cluster_distance: 0,
        representative_signs: [],
        top_signs_by_occurrence: [],
        all_members: [],
        suggested_label: `empty_cluster_${c}`,
      });
      continue;
    }

    // Sort members by occurrence (desc).
    const sortedByOcc = [...members].sort(
      (a, b) => occurrences[b] - occurrences[a],
    );

    // Representative: top-3 closest to centroid by cosine.
    const centroid = centroids[c];
    const withCos = members.map((idx) => ({
      idx,
      cos: dot(vectors[idx], centroid, dim),
    }));
    withCos.sort((a, b) => b.cos - a.cos);
    const representative_signs: ClusterRepresentative[] = withCos
      .slice(0, 3)
      .map((m) => ({
        sign: vocab[m.idx],
        occurrences: occurrences[m.idx],
        cosine_to_centroid: +m.cos.toFixed(4),
      }));

    const top_signs_by_occurrence: ClusterRepresentative[] = sortedByOcc
      .slice(0, 10)
      .map((idx) => {
        const cos = dot(vectors[idx], centroid, dim);
        return {
          sign: vocab[idx],
          occurrences: occurrences[idx],
          cosine_to_centroid: +cos.toFixed(4),
        };
      });

    // Mean intra-cluster cosine: average pairwise cosine of members.
    // For singletons defined as 1.0.
    let meanIntraCos = 1.0;
    if (members.length > 1) {
      let sum = 0;
      let pairs = 0;
      for (let i = 0; i < members.length; i++) {
        for (let j = i + 1; j < members.length; j++) {
          sum += dot(vectors[members[i]], vectors[members[j]], dim);
          pairs++;
        }
      }
      meanIntraCos = pairs > 0 ? sum / pairs : 1.0;
    }

    // Nearest-other-cluster distance: min Euclidean from this centroid to
    // any other centroid. Maps to nearest neighboring class in the embedding
    // — a separation diagnostic.
    let nearestOther = Infinity;
    for (let cc = 0; cc < k; cc++) {
      if (cc === c) continue;
      const d = Math.sqrt(squaredEuclidean(centroids[c], centroids[cc], dim));
      if (d < nearestOther) nearestOther = d;
    }
    if (!Number.isFinite(nearestOther)) nearestOther = 0;

    const all_members = sortedByOcc.map((idx) => vocab[idx]);
    // Use the top-10 closest-to-centroid signs as the label-heuristic input.
    // These are the geometric exemplars of the cluster, free of the
    // high-frequency-syllabogram bias that contaminates top-by-occurrence.
    const top_signs_for_label = withCos.slice(0, 10).map((m) => vocab[m.idx]);
    const suggested_label = suggestLabel(top_signs_for_label, c);

    reports.push({
      id: c,
      size: members.length,
      mean_intra_cluster_cosine: +meanIntraCos.toFixed(4),
      nearest_other_cluster_distance: +nearestOther.toFixed(4),
      representative_signs,
      top_signs_by_occurrence,
      all_members,
      suggested_label,
    });
  }

  // Sort clusters by size desc for readability (id is preserved on the
  // record so the original 0-indexed identity is retained).
  reports.sort((a, b) => b.size - a.size);
  return reports;
}

// ─── Public entry point ───────────────────────────────────────────────────

export function clusterSignsByEmbedding(
  opts: ClusterSignsOptions = {},
): ClusterSignsResult {
  const warnings: string[] = [];

  const stats = signEmbeddingStats();
  if (!stats.loaded) {
    return {
      k: 0,
      total_signs_clustered: 0,
      iterations_run: 0,
      converged: false,
      silhouette_score: 0,
      clusters: [],
      index_stats: {
        total_signs_indexed: 0,
        embedding_dim: 0,
        window_size: 0,
        build_timestamp: "",
      },
      warnings: [stats.load_error ?? "sign embeddings index unavailable"],
    };
  }

  const requestedK = opts.k ?? 12;
  const k = Math.max(2, Math.min(50, Math.floor(requestedK)));
  if (k !== requestedK) {
    warnings.push(
      `k=${requestedK} clamped to [2, 50] → using k=${k}`,
    );
  }
  const maxIter = Math.max(1, Math.min(1000, opts.max_iterations ?? 100));

  // Pull the full sign vocab from the index. `topMostFrequentSigns(N)` with
  // N === total_signs_indexed returns every vocab entry sorted desc by
  // occurrence, which we then de-sort into vector-order. We re-fetch each
  // vector via getSignVector to keep a single source-of-truth for the
  // numeric data.
  const allEntries: SignEmbeddingEntry[] = topMostFrequentSigns(
    stats.total_signs_indexed,
  );
  const vocab: string[] = [];
  const occurrences: number[] = [];
  const vectors: Float32Array[] = [];
  const dim = stats.embedding_dim;
  for (const e of allEntries) {
    const v = getSignVector(e.sign);
    if (!v) continue;
    vocab.push(e.sign);
    occurrences.push(getSignOccurrences(e.sign));
    vectors.push(v);
  }

  if (vectors.length < k) {
    warnings.push(
      `only ${vectors.length} signs available but k=${k} requested; reducing k`,
    );
  }
  const effectiveK = Math.min(k, vectors.length);
  if (effectiveK < 2) {
    return {
      k: effectiveK,
      total_signs_clustered: vectors.length,
      iterations_run: 0,
      converged: false,
      silhouette_score: 0,
      clusters: [],
      index_stats: {
        total_signs_indexed: stats.total_signs_indexed,
        embedding_dim: stats.embedding_dim,
        window_size: stats.window_size,
        build_timestamp: stats.build_timestamp ?? "",
      },
      warnings: warnings.concat(["fewer than 2 signs available; cannot cluster"]),
    };
  }

  const rng = mulberry32(KMEANS_SEED);
  const state = runKMeans(vectors, effectiveK, maxIter, rng, dim);

  const silhouetteScore = +silhouette(
    vectors,
    state.assignments,
    effectiveK,
    dim,
  ).toFixed(4);

  const clusters = buildClusterReports(
    vectors,
    vocab,
    occurrences,
    state.assignments,
    state.centroids,
    dim,
  );

  if (!state.converged) {
    warnings.push(
      `k-means did not converge within ${maxIter} iterations; reporting final-iteration assignments`,
    );
  }

  return {
    k: effectiveK,
    total_signs_clustered: vectors.length,
    iterations_run: state.iterations,
    converged: state.converged,
    silhouette_score: silhouetteScore,
    clusters,
    index_stats: {
      total_signs_indexed: stats.total_signs_indexed,
      embedding_dim: stats.embedding_dim,
      window_size: stats.window_size,
      build_timestamp: stats.build_timestamp ?? "",
    },
    warnings,
  };
}
