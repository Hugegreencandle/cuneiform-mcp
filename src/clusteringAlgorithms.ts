// v0.69.0 — Generic clustering algorithms for tablet-level embedding vectors.
//
// Used by discover_compositions. Three algorithms, all pure-TS, all
// deterministic (mulberry32-seeded):
//
//   - kmeans  — k-means++ init + Lloyd's algorithm. O(n·k·d·iter). Cheap.
//               Mirrors the v0.28 clusterSignsByEmbedding implementation
//               but operates on the larger tablet-embedding space (28K×300).
//   - hierarchical_ward — agglomerative Ward linkage on cluster centroids.
//               O(n²) memory (pairwise-distance matrix). Capped via the
//               max_tablets parameter at the caller layer to stay tractable.
//               Cuts the dendrogram at the requested k.
//   - dbscan_like — density-based. Picks an eps from the median nearest-
//               neighbor distance, expands clusters greedily. Useful for
//               isolating outlier clusters that k/Ward would absorb into
//               a generic "other" bucket.
//
// All three return a uniform ClusteringResult shape so the caller can
// switch algorithms without re-shaping its post-processing.
//
// Geometry: all vectors are assumed L2-normalized (the Random Indexing
// build script outputs unit vectors). Euclidean and cosine are
// monotone-equivalent on the unit sphere, so squared-Euclidean is used
// throughout for speed (no Math.sqrt unless explicitly needed).

// ─── Public types ──────────────────────────────────────────────────────────

export type ClusteringResult = {
  /** Length n. assignments[i] is the cluster id (0-indexed) for point i. */
  assignments: Int32Array;
  /** centroids[c] is the centroid vector (Float32Array of length dim) for cluster c. */
  centroids: Float32Array[];
  /** k actually produced (may differ from requested if algorithm self-terminates). */
  k: number;
  /** Iterations executed (kmeans/ward). 0 for dbscan_like. */
  iterations: number;
  /** True iff the algorithm hit its convergence criterion (rather than maxIter). */
  converged: boolean;
};

export type KMeansOptions = {
  k: number;
  maxIterations?: number;
  seed?: number;
  dim: number;
};

export type WardOptions = {
  /** Target number of clusters to cut the dendrogram at. */
  k: number;
  dim: number;
};

export type DbscanLikeOptions = {
  /** Neighborhood radius (squared Euclidean on unit sphere). */
  eps?: number;
  /** Minimum points (incl. self) for a core point. */
  minPts?: number;
  /** Dimensionality. */
  dim: number;
};

// ─── Deterministic RNG (mulberry32, mirrors v0.28) ────────────────────────

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Shared seed across the discover_compositions algorithms so reruns are
// bit-identical when the underlying corpus + parameters are fixed.
export const DEFAULT_SEED = 20260528;

// ─── Vector helpers ────────────────────────────────────────────────────────

export function squaredEuclidean(a: Float32Array, b: Float32Array, dim: number): number {
  let s = 0;
  for (let k = 0; k < dim; k++) {
    const d = a[k] - b[k];
    s += d * d;
  }
  return s;
}

export function dot(a: Float32Array, b: Float32Array, dim: number): number {
  let s = 0;
  for (let k = 0; k < dim; k++) s += a[k] * b[k];
  return s;
}

/** L2-normalize in place. No-op on a zero vector. */
export function l2NormalizeInPlace(v: Float32Array): void {
  let s = 0;
  for (let k = 0; k < v.length; k++) s += v[k] * v[k];
  if (s === 0) return;
  const inv = 1 / Math.sqrt(s);
  for (let k = 0; k < v.length; k++) v[k] *= inv;
}

/** Cosine similarity. Assumes both inputs are L2-normalized — returns the dot product. */
export function cosineUnit(a: Float32Array, b: Float32Array, dim: number): number {
  return dot(a, b, dim);
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
  for (let i = 0; i < n; i++) minDistSq[i] = squaredEuclidean(vectors[i], centroids[0], dim);

  for (let c = 1; c < k; c++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += minDistSq[i];
    if (total <= 0) {
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
    const newC = centroids[c];
    for (let i = 0; i < n; i++) {
      const d = squaredEuclidean(vectors[i], newC, dim);
      if (d < minDistSq[i]) minDistSq[i] = d;
    }
  }

  return centroids;
}

// ─── k-means (Lloyd's) ─────────────────────────────────────────────────────

export function runKMeans(
  vectors: Float32Array[],
  opts: KMeansOptions,
): ClusteringResult {
  const { dim } = opts;
  const k = Math.max(1, Math.min(opts.k, vectors.length));
  const maxIter = opts.maxIterations ?? 100;
  const rng = mulberry32(opts.seed ?? DEFAULT_SEED);
  const n = vectors.length;

  const centroids = kmeansPlusPlusSeed(vectors, k, rng, dim);
  const assignments = new Int32Array(n);
  assignments.fill(-1);

  let iter = 0;
  let converged = false;
  for (; iter < maxIter; iter++) {
    let changed = 0;
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
        // Empty cluster — Hartigan re-seed to farthest point.
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

  return { assignments, centroids, k, iterations: iter, converged };
}

// ─── Hierarchical Ward ─────────────────────────────────────────────────────
//
// Standard agglomerative Ward linkage. Start with n singletons; at each
// step merge the pair (i, j) that minimizes the Ward objective:
//
//     Δ_ij = (|i|·|j|)/(|i|+|j|) · ||c_i − c_j||²
//
// where c_x is the centroid of cluster x and |x| its size. After the
// merge we update centroids and pairwise Ward costs using the
// Lance-Williams recurrence so we never have to re-scan the raw data:
//
//     d_{(ij),k} = ((|i|+|k|)·d_ik + (|j|+|k|)·d_jk − |k|·d_ij) / (|i|+|j|+|k|)
//
// We cut the dendrogram at k = opts.k clusters (i.e. perform n − k merges).
// The Lance-Williams matrix update is O(n²) memory and O(n²) per merge for
// the row update, so total O(n³). Caller caps n via max_tablets.

export function runHierarchicalWard(
  vectors: Float32Array[],
  opts: WardOptions,
): ClusteringResult {
  const { dim } = opts;
  const targetK = Math.max(1, Math.min(opts.k, vectors.length));
  const n = vectors.length;

  // active[c] indicates whether cluster id c is still alive.
  const active = new Uint8Array(n);
  active.fill(1);
  const sizes = new Int32Array(n);
  sizes.fill(1);

  // Centroids: copy each input vector. Centroids drift off the unit
  // sphere as we merge — Ward operates in Euclidean space, no re-norm.
  const centroids: Float32Array[] = new Array(n);
  for (let i = 0; i < n; i++) centroids[i] = new Float32Array(vectors[i]);

  // Symmetric Ward-cost matrix, lower triangle only. dist[i*n + j] for i > j.
  // Initial cost between singletons {i} and {j}: 0.5 · ||v_i − v_j||² (since
  // |i|·|j| / (|i|+|j|) = 1·1/2 = 0.5 for singletons).
  const dist = new Float32Array(n * n);
  for (let i = 1; i < n; i++) {
    for (let j = 0; j < i; j++) {
      const d = squaredEuclidean(vectors[i], vectors[j], dim);
      dist[i * n + j] = 0.5 * d;
    }
  }

  // parent[i] tracks the surviving cluster id that i was merged into,
  // used at the end to flatten assignments.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;

  let activeCount = n;
  const mergesNeeded = n - targetK;
  let merges = 0;

  for (; merges < mergesNeeded; merges++) {
    // Find the smallest-cost active pair.
    let bestI = -1;
    let bestJ = -1;
    let bestCost = Infinity;
    for (let i = 1; i < n; i++) {
      if (!active[i]) continue;
      const rowBase = i * n;
      for (let j = 0; j < i; j++) {
        if (!active[j]) continue;
        const c = dist[rowBase + j];
        if (c < bestCost) {
          bestCost = c;
          bestI = i;
          bestJ = j;
        }
      }
    }
    if (bestI < 0) break;

    // Merge bestI into bestJ (keep the lower-id slot alive).
    const sI = sizes[bestI];
    const sJ = sizes[bestJ];
    const sN = sI + sJ;

    // Update the centroid of bestJ to be the weighted mean.
    const cI = centroids[bestI];
    const cJ = centroids[bestJ];
    for (let kk = 0; kk < dim; kk++) cJ[kk] = (sI * cI[kk] + sJ * cJ[kk]) / sN;

    // Lance-Williams update of distances from the merged cluster to every
    // other active cluster k.
    for (let kIdx = 0; kIdx < n; kIdx++) {
      if (kIdx === bestI || kIdx === bestJ || !active[kIdx]) continue;
      const sK = sizes[kIdx];
      const dik = kIdx > bestI ? dist[kIdx * n + bestI] : dist[bestI * n + kIdx];
      const djk = kIdx > bestJ ? dist[kIdx * n + bestJ] : dist[bestJ * n + kIdx];
      const dij = bestCost;
      const newD = ((sI + sK) * dik + (sJ + sK) * djk - sK * dij) / (sN + sK);
      if (kIdx > bestJ) {
        dist[kIdx * n + bestJ] = newD;
      } else {
        dist[bestJ * n + kIdx] = newD;
      }
    }

    sizes[bestJ] = sN;
    active[bestI] = 0;
    parent[bestI] = bestJ;
    activeCount--;
  }

  // Flatten: assign every original index to its surviving root.
  const rootOf = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    // Path compression.
    let q = i;
    while (parent[q] !== r) {
      const next = parent[q];
      parent[q] = r;
      q = next;
    }
    return r;
  };

  const rootIds = new Set<number>();
  for (let i = 0; i < n; i++) rootIds.add(rootOf(i));
  const rootList = [...rootIds].sort((a, b) => a - b);
  const rootToCid = new Map<number, number>();
  rootList.forEach((r, c) => rootToCid.set(r, c));

  const assignments = new Int32Array(n);
  for (let i = 0; i < n; i++) assignments[i] = rootToCid.get(rootOf(i)) ?? 0;

  const outCentroids: Float32Array[] = [];
  for (const r of rootList) outCentroids.push(centroids[r]);

  return {
    assignments,
    centroids: outCentroids,
    k: rootList.length,
    iterations: merges,
    converged: merges === mergesNeeded || activeCount === targetK,
  };
}

// ─── DBSCAN-like ───────────────────────────────────────────────────────────
//
// Not a literal DBSCAN reimplementation — this is a budget variant that
// uses squared-Euclidean on unit-sphere vectors as its neighborhood test.
// If eps is omitted we pick it as the median of each point's distance to
// its (minPts)-th nearest neighbor — a standard "knee" heuristic, but
// computed on a random subsample for speed when n is large.

export function runDbscanLike(
  vectors: Float32Array[],
  opts: DbscanLikeOptions,
): ClusteringResult {
  const { dim } = opts;
  const n = vectors.length;
  const minPts = Math.max(2, opts.minPts ?? 5);

  // Auto-eps: median of the k-th nearest-neighbor distance on a subsample.
  let eps = opts.eps;
  if (eps === undefined) {
    const sampleSize = Math.min(200, n);
    const step = Math.max(1, Math.floor(n / sampleSize));
    const knnDistances: number[] = [];
    for (let i = 0; i < n; i += step) {
      const dists: number[] = [];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        dists.push(squaredEuclidean(vectors[i], vectors[j], dim));
      }
      dists.sort((a, b) => a - b);
      if (dists.length >= minPts) knnDistances.push(dists[minPts - 1]);
    }
    knnDistances.sort((a, b) => a - b);
    eps = knnDistances.length > 0 ? knnDistances[Math.floor(knnDistances.length / 2)] : 0.5;
  }

  const assignments = new Int32Array(n);
  assignments.fill(-1);
  const visited = new Uint8Array(n);

  // Greedy region-grow. Standard DBSCAN expansion order.
  function regionQuery(p: number): number[] {
    const out: number[] = [];
    const vp = vectors[p];
    for (let q = 0; q < n; q++) {
      if (squaredEuclidean(vp, vectors[q], dim) <= eps!) out.push(q);
    }
    return out;
  }

  let cId = 0;
  for (let p = 0; p < n; p++) {
    if (visited[p]) continue;
    visited[p] = 1;
    const neighbors = regionQuery(p);
    if (neighbors.length < minPts) continue; // noise — assignments[p] stays -1
    assignments[p] = cId;
    // Expand.
    const queue = neighbors.slice();
    while (queue.length > 0) {
      const q = queue.shift()!;
      if (!visited[q]) {
        visited[q] = 1;
        const qNeighbors = regionQuery(q);
        if (qNeighbors.length >= minPts) {
          for (const r of qNeighbors) if (visited[r] === 0) queue.push(r);
        }
      }
      if (assignments[q] === -1) assignments[q] = cId;
    }
    cId++;
  }

  // Build centroids over assigned points; noise points (assignment = -1)
  // are folded into a synthetic "noise" cluster at the END so downstream
  // consumers can choose to ignore or surface them.
  const k = cId + 1;
  const centroids: Float32Array[] = [];
  for (let c = 0; c < k; c++) centroids.push(new Float32Array(dim));
  const counts = new Int32Array(k);
  for (let i = 0; i < n; i++) {
    const c = assignments[i] === -1 ? cId : assignments[i];
    if (assignments[i] === -1) assignments[i] = cId;
    counts[c]++;
    const dst = centroids[c];
    const src = vectors[i];
    for (let kk = 0; kk < dim; kk++) dst[kk] += src[kk];
  }
  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;
    const inv = 1 / counts[c];
    const dst = centroids[c];
    for (let kk = 0; kk < dim; kk++) dst[kk] *= inv;
    // Re-normalize centroid back to unit sphere for consistency with
    // cosine-based downstream comparisons.
    l2NormalizeInPlace(dst);
  }

  return {
    assignments,
    centroids,
    k,
    iterations: 0,
    converged: true,
  };
}

// ─── Silhouette (subsample) ───────────────────────────────────────────────
//
// Compute mean silhouette on a random subsample of `cap` points to keep
// O(n²) bounded. Returns 0 on empty input or degenerate (k=1) clusterings.
// Uses Euclidean distance (consistent with the k-means objective and
// equivalent to cosine on the unit sphere).

export function silhouetteSubsample(
  vectors: Float32Array[],
  assignments: Int32Array,
  k: number,
  dim: number,
  cap = 500,
  seed = DEFAULT_SEED,
): number {
  const n = vectors.length;
  if (n === 0 || k <= 1) return 0;

  const rng = mulberry32(seed);
  const sampleIdx: number[] = [];
  if (n <= cap) {
    for (let i = 0; i < n; i++) sampleIdx.push(i);
  } else {
    const seen = new Set<number>();
    while (sampleIdx.length < cap) {
      const r = Math.floor(rng() * n);
      if (!seen.has(r)) {
        seen.add(r);
        sampleIdx.push(r);
      }
    }
  }

  const buckets: number[][] = [];
  for (let c = 0; c < k; c++) buckets.push([]);
  for (let i = 0; i < n; i++) {
    const c = assignments[i];
    if (c >= 0 && c < k) buckets[c].push(i);
  }

  let sumS = 0;
  let counted = 0;
  for (const i of sampleIdx) {
    const own = assignments[i];
    if (own < 0 || own >= k) continue;
    const ownMembers = buckets[own];
    let a = 0;
    if (ownMembers.length > 1) {
      for (let j = 0; j < ownMembers.length; j++) {
        const idx = ownMembers[j];
        if (idx === i) continue;
        a += Math.sqrt(squaredEuclidean(vectors[i], vectors[idx], dim));
      }
      a /= ownMembers.length - 1;
    } else {
      counted++;
      continue;
    }
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c === own) continue;
      const m = buckets[c];
      if (m.length === 0) continue;
      let sum = 0;
      for (let j = 0; j < m.length; j++) sum += Math.sqrt(squaredEuclidean(vectors[i], vectors[m[j]], dim));
      const mean = sum / m.length;
      if (mean < b) b = mean;
    }
    const denom = Math.max(a, b);
    const s = denom > 0 && Number.isFinite(b) ? (b - a) / denom : 0;
    sumS += s;
    counted++;
  }
  return counted > 0 ? sumS / counted : 0;
}
