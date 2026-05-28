import { describe, it, expect } from "vitest";
import {
  runKMeans,
  runHierarchicalWard,
  runDbscanLike,
  silhouetteSubsample,
  cosineUnit,
  l2NormalizeInPlace,
  squaredEuclidean,
  mulberry32,
  DEFAULT_SEED,
} from "../src/clusteringAlgorithms.js";

// ─── Synthetic data helpers ───────────────────────────────────────────────

// Sample a vector from N(center, sigma) and L2-normalize. Yields points that
// cluster around `center` on the unit sphere.
function sampleAround(
  center: Float32Array,
  sigma: number,
  rng: () => number,
  dim: number,
): Float32Array {
  const v = new Float32Array(dim);
  for (let k = 0; k < dim; k++) {
    // Box-Muller-ish via two uniforms — not perfect Gaussian but tight enough.
    const u1 = Math.max(1e-9, rng());
    const u2 = rng();
    const n = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    v[k] = center[k] + sigma * n;
  }
  l2NormalizeInPlace(v);
  return v;
}

function makeAxisCenter(axis: number, dim: number): Float32Array {
  const v = new Float32Array(dim);
  v[axis] = 1;
  return v;
}

// Build 3 well-separated clusters of `nEach` points each, around the +e0/+e1/+e2 axes.
function buildSyntheticCorpus(
  nEach: number,
  dim: number,
  sigma: number,
  seed: number,
): { vectors: Float32Array[]; trueAssignments: Int32Array } {
  const rng = mulberry32(seed);
  const vectors: Float32Array[] = [];
  const trueAssign = new Int32Array(nEach * 3);
  for (let c = 0; c < 3; c++) {
    const center = makeAxisCenter(c, dim);
    for (let i = 0; i < nEach; i++) {
      vectors.push(sampleAround(center, sigma, rng, dim));
      trueAssign[c * nEach + i] = c;
    }
  }
  return { vectors, trueAssignments: trueAssign };
}

// Adjusted-rand-index-light: count pairwise concordance. Returns
// (#concordant pairs) / (#total pairs). 1.0 = perfect; ~0.33 = random.
function pairwiseConcordance(a: Int32Array, b: Int32Array): number {
  const n = a.length;
  let total = 0;
  let concordant = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      total++;
      const sameA = a[i] === a[j];
      const sameB = b[i] === b[j];
      if (sameA === sameB) concordant++;
    }
  }
  return total === 0 ? 0 : concordant / total;
}

// ─── Vector helpers ────────────────────────────────────────────────────────

describe("squaredEuclidean", () => {
  it("returns 0 for identical vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(squaredEuclidean(a, b, 3)).toBe(0);
  });

  it("returns 2 for orthogonal unit vectors (geometry sanity)", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    // ||e0 − e1||² = 1 + 1 = 2.
    expect(squaredEuclidean(a, b, 3)).toBeCloseTo(2, 5);
  });
});

describe("l2NormalizeInPlace", () => {
  it("normalizes a non-zero vector to unit length", () => {
    const v = new Float32Array([3, 4, 0]);
    l2NormalizeInPlace(v);
    expect(v[0]).toBeCloseTo(0.6, 5);
    expect(v[1]).toBeCloseTo(0.8, 5);
    let s = 0;
    for (const x of v) s += x * x;
    expect(s).toBeCloseTo(1, 5);
  });

  it("no-ops on a zero vector (no NaN)", () => {
    const v = new Float32Array([0, 0, 0]);
    l2NormalizeInPlace(v);
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    expect(v[2]).toBe(0);
  });
});

describe("cosineUnit", () => {
  it("returns 1 for identical unit vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    expect(cosineUnit(a, a, 3)).toBe(1);
  });

  it("returns 0 for orthogonal unit vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineUnit(a, b, 3)).toBe(0);
  });
});

// ─── mulberry32 determinism ────────────────────────────────────────────────

describe("mulberry32", () => {
  it("is deterministic given the same seed", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(42);
    for (let i = 0; i < 10; i++) expect(r1()).toBe(r2());
  });

  it("differs between seeds", () => {
    const r1 = mulberry32(42);
    const r2 = mulberry32(43);
    let allEqual = true;
    for (let i = 0; i < 10; i++) {
      if (r1() !== r2()) {
        allEqual = false;
        break;
      }
    }
    expect(allEqual).toBe(false);
  });
});

// ─── k-means on a well-separated 3-cluster synthetic corpus ──────────────

describe("runKMeans", () => {
  it("recovers 3 well-separated clusters on synthetic data (concordance ≥ 0.9)", () => {
    const { vectors, trueAssignments } = buildSyntheticCorpus(40, 16, 0.1, 1234);
    const result = runKMeans(vectors, {
      k: 3,
      dim: 16,
      maxIterations: 100,
      seed: DEFAULT_SEED,
    });
    expect(result.k).toBe(3);
    expect(result.assignments.length).toBe(120);
    const conc = pairwiseConcordance(result.assignments, trueAssignments);
    expect(conc).toBeGreaterThanOrEqual(0.9);
  });

  it("converges within max iterations on tight clusters", () => {
    const { vectors } = buildSyntheticCorpus(30, 16, 0.05, 5678);
    const result = runKMeans(vectors, { k: 3, dim: 16, maxIterations: 100 });
    expect(result.converged).toBe(true);
    expect(result.iterations).toBeLessThan(100);
  });

  it("is reproducible with the same seed (bit-identical assignments)", () => {
    const { vectors } = buildSyntheticCorpus(20, 16, 0.1, 99);
    const r1 = runKMeans(vectors, { k: 3, dim: 16, seed: 12345 });
    const r2 = runKMeans(vectors, { k: 3, dim: 16, seed: 12345 });
    expect(Array.from(r1.assignments)).toEqual(Array.from(r2.assignments));
  });
});

// ─── Hierarchical Ward ───────────────────────────────────────────────────

describe("runHierarchicalWard", () => {
  it("recovers 3 well-separated clusters at k=3 (concordance ≥ 0.9)", () => {
    const { vectors, trueAssignments } = buildSyntheticCorpus(30, 16, 0.1, 4321);
    const result = runHierarchicalWard(vectors, { k: 3, dim: 16 });
    expect(result.k).toBe(3);
    const conc = pairwiseConcordance(result.assignments, trueAssignments);
    expect(conc).toBeGreaterThanOrEqual(0.9);
  });

  it("merges all points into one cluster at k=1", () => {
    const { vectors } = buildSyntheticCorpus(10, 8, 0.1, 1);
    const result = runHierarchicalWard(vectors, { k: 1, dim: 8 });
    expect(result.k).toBe(1);
    for (let i = 0; i < result.assignments.length; i++) {
      expect(result.assignments[i]).toBe(0);
    }
  });

  it("is deterministic: same inputs produce same assignments", () => {
    const { vectors } = buildSyntheticCorpus(15, 8, 0.1, 7);
    const r1 = runHierarchicalWard(vectors, { k: 3, dim: 8 });
    const r2 = runHierarchicalWard(vectors, { k: 3, dim: 8 });
    expect(Array.from(r1.assignments)).toEqual(Array.from(r2.assignments));
  });
});

// ─── DBSCAN-like ──────────────────────────────────────────────────────────

describe("runDbscanLike", () => {
  it("clusters tight blobs and labels outliers", () => {
    // Build two tight clusters + a far-away outlier point.
    const dim = 8;
    const rng = mulberry32(2024);
    const c0 = makeAxisCenter(0, dim);
    const c1 = makeAxisCenter(1, dim);
    const vectors: Float32Array[] = [];
    for (let i = 0; i < 15; i++) vectors.push(sampleAround(c0, 0.02, rng, dim));
    for (let i = 0; i < 15; i++) vectors.push(sampleAround(c1, 0.02, rng, dim));
    // Outlier: well-separated from both axes.
    const outlier = new Float32Array(dim);
    outlier[5] = 1;
    vectors.push(outlier);

    const result = runDbscanLike(vectors, { dim, minPts: 5 });
    // At least 2 clusters worth of structure.
    expect(result.k).toBeGreaterThanOrEqual(2);
    // The outlier should not be in the same cluster as cluster-0 anchor.
    expect(result.assignments[30]).not.toBe(result.assignments[0]);
  });
});

// ─── Silhouette ───────────────────────────────────────────────────────────

describe("silhouetteSubsample", () => {
  it("is positive for well-separated clusters", () => {
    const { vectors, trueAssignments } = buildSyntheticCorpus(20, 16, 0.05, 1010);
    const score = silhouetteSubsample(vectors, trueAssignments, 3, 16, 60, DEFAULT_SEED);
    expect(score).toBeGreaterThan(0.3);
  });

  it("returns 0 for k=1 (degenerate)", () => {
    const { vectors } = buildSyntheticCorpus(10, 16, 0.1, 1);
    const assign = new Int32Array(vectors.length); // all zeros
    const score = silhouetteSubsample(vectors, assign, 1, 16);
    expect(score).toBe(0);
  });

  it("is near 0 or negative on randomly-assigned labels (no real structure)", () => {
    const { vectors } = buildSyntheticCorpus(20, 16, 0.1, 7777);
    const rng = mulberry32(8888);
    const assign = new Int32Array(vectors.length);
    for (let i = 0; i < assign.length; i++) assign[i] = Math.floor(rng() * 3);
    const score = silhouetteSubsample(vectors, assign, 3, 16, 60, DEFAULT_SEED);
    expect(score).toBeLessThan(0.2);
  });
});

// ─── discoverCompositions orchestrator (skipif no cache) ─────────────────
//
// The full corpus run depends on ~/.cache/cuneiform-mcp/tablet-vectors.f32
// being present. We only run it if the cache is available.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const cacheReady = (() => {
  const cacheDir = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
  return (
    existsSync(join(cacheDir, "tablet-vectors.f32")) &&
    existsSync(join(cacheDir, "tablet-embed-index.json"))
  );
})();

describe.skipIf(!cacheReady)("discoverCompositions (full-corpus smoke)", () => {
  it("runs kmeans on a small subsample and returns a valid result envelope", async () => {
    const { discoverCompositions } = await import("../src/discoverCompositions.js");
    const r = discoverCompositions({
      algorithm: "kmeans",
      k: 20,
      max_tablets: 500,
      min_cluster_size: 3,
      novelty_threshold: 0.5,
    });
    expect(r.algorithm_used).toBe("kmeans");
    expect(r.clusters_found).toBeGreaterThan(0);
    expect(r.metrics.total_tablets_clustered).toBeLessThanOrEqual(500);
    expect(r.metrics.embedding_dim).toBe(300);
    expect(r.parameters.seed).toBe(DEFAULT_SEED);
    expect(r.output_paths.json).toMatch(/composition-discovery/);
    expect(r.output_paths.summary_md).toMatch(/summary\.md$/);
    expect(existsSync(r.output_paths.json)).toBe(true);
    expect(existsSync(r.output_paths.summary_md)).toBe(true);
  }, 60_000);

  it("runs hierarchical_ward and recovers at least one registered composition", async () => {
    const { discoverCompositions } = await import("../src/discoverCompositions.js");
    const r = discoverCompositions({
      algorithm: "hierarchical_ward",
      k: 30,
      max_tablets: 800,
      min_cluster_size: 3,
      novelty_threshold: 0.5,
    });
    expect(r.algorithm_used).toBe("hierarchical_ward");
    expect(r.clusters_found).toBeGreaterThan(0);
    // Recovery is opportunistic — depends on which tablets the deterministic
    // subsample happens to include — but on max_tablets=800 we expect at least
    // one registered composition to have an embedded exemplar in the sample.
    expect(r.registered_recovery_detail.length).toBeGreaterThan(0);
  }, 300_000);
});
