import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// IMPORTANT: chunkIndex loader memoizes on first call (process-wide). We must
// install the fake cache BEFORE importing the modules under test. Vitest
// isolates test files in worker processes by default, so this file owns its
// own loader state.
const TMP_DIR = mkdtempSync(join(tmpdir(), "cuneiform-mcp-recension-"));
process.env.CUNEIFORM_MCP_CACHE_DIR = TMP_DIR;

// Synthesize a chunk-index covering 4 tablets (T1..T4) + an unrelated tablet
// (T5, no overlap with T1 — used for the seed-with-no-hits test).
// T1 hosts chunks {h1,h2,h3,h4,h5}, T2 shares {h1,h2,h3}, T3 shares {h1,h2,h4},
// T4 shares {h1,h2,h5}. Each chunk has occurrences = the tablets in it.
type Occ = { tablet_id: string; start_position: number };
type Entry = { hash: string; signs: string; length: number; occurrences: Occ[] };
const HOSTS: Record<string, string[]> = {
  h1: ["T1", "T2", "T3", "T4"],
  h2: ["T1", "T2", "T3", "T4"],
  h3: ["T1", "T2"],
  h4: ["T1", "T3"],
  h5: ["T1", "T4"],
  h6: ["T5", "T6"], // unrelated cluster
};

beforeAll(() => {
  const entries: Entry[] = Object.entries(HOSTS).map(([hash, tablets]) => ({
    hash,
    signs: hash,
    length: 20,
    occurrences: tablets.map((t, i) => ({ tablet_id: t, start_position: i })),
  }));
  const index = {
    version: "test",
    build_timestamp: new Date().toISOString(),
    window_length: 20,
    total_tablets: 6,
    total_windows_seen: 30,
    total_unique_hashes: entries.length,
    total_non_singleton_hashes: entries.length,
    entries,
  };
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, "chunk-index.json"), JSON.stringify(index));
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.CUNEIFORM_MCP_CACHE_DIR;
});

// Lazy import after env var is set.
async function importTree() {
  return await import("../src/recensionTree.js");
}

describe("buildCanonicalRecensionTree (NJ)", () => {
  it("returns a 4-witness tree on a connected seed (T1)", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
      maxWitnesses: 10,
      algorithm: "neighbor_joining",
    });
    // Witnesses include the seed itself (T1) + the 3 co-hosts.
    expect(r.witnesses.map((w) => w.tablet_id).sort()).toEqual(["T1", "T2", "T3", "T4"]);
    expect(r.algorithm).toBe("neighbor_joining");
    expect(r.distance_matrix.length).toBe(4);
    expect(r.distance_matrix[0].length).toBe(4);
    expect(r.tree.endsWith(";")).toBe(true);
    expect(r.tree_edges.length).toBeGreaterThan(0);
    expect(r.internal_nodes).toBeGreaterThanOrEqual(1);
  });

  it("respects min_pairwise_chunks: filters out witnesses below threshold", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    // At min=4, only T1 itself qualifies (all others share <4 chunks with T1).
    // T2 shares 3 (h1,h2,h3); T3 shares 3 (h1,h2,h4); T4 shares 3 (h1,h2,h5).
    // So min=4 → 0 witnesses after filter → "only 0 witness(es)" warning.
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 4,
      algorithm: "neighbor_joining",
    });
    expect(r.witnesses).toEqual([]);
    expect(r.warnings.some((w) => /witness/i.test(w))).toBe(true);
  });

  it("returns empty result when seed has no chunk-index entries", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({ seedTabletId: "UNKNOWN_SEED" });
    expect(r.witnesses).toEqual([]);
    expect(r.tree).toBe("");
    expect(r.warnings.some((w) => /no entries/i.test(w))).toBe(true);
  });

  it("emits a Newick string with branch lengths and a trailing semicolon", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
      algorithm: "neighbor_joining",
    });
    expect(r.tree).toMatch(/\(.+\).*;$/);
    // Every leaf label should appear in the Newick string.
    for (const w of r.witnesses) {
      expect(r.tree).toContain(w.tablet_id);
    }
  });
});

describe("buildCanonicalRecensionTree (UPGMA)", () => {
  it("produces a rooted binary tree on the same input", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
      algorithm: "upgma",
    });
    expect(r.algorithm).toBe("upgma");
    expect(r.witnesses.length).toBe(4);
    // UPGMA: N-1 internal nodes for N taxa = 3 internal nodes.
    expect(r.internal_nodes).toBe(3);
  });

  it("UPGMA distance matrix has zeros on the diagonal", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
      algorithm: "upgma",
    });
    for (let i = 0; i < r.distance_matrix.length; i++) {
      expect(r.distance_matrix[i][i]).toBe(0);
    }
  });

  it("distance matrix is symmetric", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
      algorithm: "upgma",
    });
    const D = r.distance_matrix;
    for (let i = 0; i < D.length; i++) {
      for (let j = i + 1; j < D.length; j++) {
        expect(D[i][j]).toBeCloseTo(D[j][i], 10);
      }
    }
  });
});

describe("index_stats reporting", () => {
  it("reports seed_host_chunks + candidate_witnesses_examined accurately", async () => {
    const { buildCanonicalRecensionTree } = await importTree();
    const r = buildCanonicalRecensionTree({
      seedTabletId: "T1",
      minPairwiseChunks: 1,
    });
    // T1 hosts 5 chunks (h1..h5).
    expect(r.index_stats.seed_host_chunks).toBe(5);
    // Candidates: T2, T3, T4 (anyone co-hosting any of T1's chunks).
    expect(r.index_stats.candidate_witnesses_examined).toBe(3);
    expect(r.index_stats.witnesses_after_filter).toBe(3);
    expect(r.index_stats.witnesses_returned).toBe(4); // seed + 3
  });
});
