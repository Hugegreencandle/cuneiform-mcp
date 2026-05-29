import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The chunk-index loader and composition-assignments loader both memoize on
// first call. We install a fake cache directory BEFORE importing the modules
// under test so per-file isolation (vitest workers) keeps state clean.
const TMP_DIR = mkdtempSync(join(tmpdir(), "cuneiform-mcp-quotation-"));
process.env.CUNEIFORM_MCP_CACHE_DIR = TMP_DIR;

type Occ = { tablet_id: string; start_position: number };
type Entry = { hash: string; signs: string; length: number; occurrences: Occ[] };

// Synthetic chunk-index: 4 compositions worth of tablets.
//   T_mp1, T_mp2 → Mīs pî (mis_pi exemplars from registry: K.5896, K.9508)
//   T_su1       → Šurpu (BM.47463)
//   T_mq1       → Maqlû (K.2961)
//   T_uh1       → Udug-ḫul (Sm.1055)
//
// Use the REAL registry exemplar IDs so the resolver's registry-exemplar
// fast-path classifies them without needing a synthetic assignments cache.
//
// Chunk-host configuration:
//   h1 hosted by [K.5896 (mis_pi), BM.47463 (surpu)]              → mis_pi ↔ surpu
//   h2 hosted by [K.9508 (mis_pi), BM.47463 (surpu)]              → mis_pi ↔ surpu (reinforce)
//   h3 hosted by [BM.47463 (surpu), K.2961 (maqlu)]               → surpu ↔ maqlu
//   h4 hosted by [Sm.1055 (udug_hul), K.2961 (maqlu)]             → udug_hul ↔ maqlu
//   h5 hosted by [K.5896 (mis_pi), K.5896 (mis_pi)]               → SAME composition only (no edge)
const HOSTS: Record<string, string[]> = {
  h1: ["K.5896", "BM.47463"],
  h2: ["K.9508", "BM.47463"],
  h3: ["BM.47463", "K.2961"],
  h4: ["Sm.1055", "K.2961"],
  h5: ["K.5896", "K.9508"],
};

beforeAll(() => {
  const entries: Entry[] = Object.entries(HOSTS).map(([hash, tablets]) => ({
    hash,
    signs: hash,
    length: 25, // satisfies default min_chunk_length=25
    occurrences: tablets.map((t, i) => ({ tablet_id: t, start_position: i })),
  }));
  const chunkIndex = {
    version: "test",
    build_timestamp: new Date().toISOString(),
    window_length: 20,
    total_tablets: 5,
    total_windows_seen: 50,
    total_unique_hashes: entries.length,
    total_non_singleton_hashes: entries.length,
    entries,
  };
  mkdirSync(TMP_DIR, { recursive: true });
  writeFileSync(join(TMP_DIR, "chunk-index.json"), JSON.stringify(chunkIndex));

  // Empty composition-assignments cache — forces the registry-exemplar path,
  // which is the synchronous shortcut and avoids triggering identifyComposition.
  writeFileSync(
    join(TMP_DIR, "composition-assignments.json"),
    JSON.stringify({
      version: "test",
      built_at: new Date().toISOString(),
      assignments: {},
    }),
  );
});

afterAll(() => {
  rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.CUNEIFORM_MCP_CACHE_DIR;
});

async function importNetwork() {
  return await import("../src/quotationNetwork.js");
}

describe("computeQuotationNetwork — synthetic chunk-index", () => {
  it("returns at least 3 cross-composition edges from the synthetic fixture", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    // Expect mis_pi ↔ surpu, surpu ↔ maqlu, udug_hul ↔ maqlu — each
    // contributing in BOTH directions = 6 directed edges total.
    expect(r.edges.length).toBeGreaterThanOrEqual(6);
    const pairs = new Set(r.edges.map((e) => `${e.source_composition}>${e.target_composition}`));
    expect(pairs.has("mis_pi>surpu")).toBe(true);
    expect(pairs.has("surpu>mis_pi")).toBe(true);
    expect(pairs.has("surpu>maqlu")).toBe(true);
    expect(pairs.has("udug_hul>maqlu")).toBe(true);
  });

  it("produces a directed multigraph (no self-loops)", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    for (const e of r.edges) {
      expect(e.source_composition).not.toBe(e.target_composition);
    }
  });

  it("respects min_chunk_length filter (raise above synthetic length 25 → no edges)", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 30, minCitations: 99 });
    expect(r.edges.length).toBe(0);
  });

  it("writes graph.json, graph.dot, and summary.md to a quotation-network/<ts>/ subdirectory", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    expect(existsSync(r.output_paths.json)).toBe(true);
    expect(existsSync(r.output_paths.dot)).toBe(true);
    expect(existsSync(r.output_paths.summary_md)).toBe(true);
    const json = JSON.parse(readFileSync(r.output_paths.json, "utf-8"));
    expect(Array.isArray(json.edges)).toBe(true);
    expect(json.edges.length).toBe(r.edges.length);
    const dot = readFileSync(r.output_paths.dot, "utf-8");
    expect(dot).toMatch(/^digraph quotation_network/);
    expect(dot).toMatch(/->/);
  });

  it("reports nonzero in_degree for compositions on the receiving end of an edge", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    const surpu = r.nodes.find((n) => n.composition_id === "surpu");
    expect(surpu).toBeDefined();
    expect(surpu!.in_degree).toBeGreaterThan(0);
    expect(surpu!.out_degree).toBeGreaterThan(0);
  });

  it("metrics block totals match nodes+edges arrays", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    expect(r.metrics.total_nodes).toBe(r.nodes.length);
    expect(r.metrics.total_edges).toBe(r.edges.length);
    expect(r.metrics.top_quoted_from.length).toBeLessThanOrEqual(10);
    expect(r.metrics.top_quoters.length).toBeLessThanOrEqual(10);
  });

  it("flags isolate compositions (registry compositions absent from any edge)", async () => {
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({ minChunkLength: 25, minCitations: 99 });
    // 11 specific_composition rows in registry, 4 appear in synthetic edges
    // → ≥6 isolates (the curriculum row is excluded as composition_type !== specific).
    expect(r.metrics.isolate_compositions.length).toBeGreaterThanOrEqual(6);
    // mis_pi, surpu, maqlu, udug_hul must NOT be isolates.
    for (const live of ["mis_pi", "surpu", "maqlu", "udug_hul"]) {
      expect(r.metrics.isolate_compositions).not.toContain(live);
    }
  });
});

describe("graphMetrics primitives", () => {
  it("Tarjan SCC handles a simple 2-cycle", async () => {
    const { tarjanSCC } = await import("../src/graphMetrics.js");
    const adj = new Map<string, Map<string, number>>();
    adj.set("A", new Map([["B", 1]]));
    adj.set("B", new Map([["A", 1]]));
    adj.set("C", new Map());
    const sccs = tarjanSCC(adj, ["A", "B", "C"]);
    // 2 components: {A,B} and {C}
    expect(sccs.length).toBe(2);
    const sizes = sccs.map((s) => s.length).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it("sampledBetweennessRanks returns a map and never yields negative ranks", async () => {
    const { sampledBetweennessRanks } = await import("../src/graphMetrics.js");
    const adj = new Map<string, Map<string, number>>();
    adj.set("A", new Map([["B", 1]]));
    adj.set("B", new Map([["C", 1]]));
    adj.set("C", new Map());
    const ranks = sampledBetweennessRanks(adj, ["A", "B", "C"], { sampleSize: 3, seed: 1 });
    for (const v of ranks.values()) expect(v).toBeGreaterThan(0);
  });
});

// Live-corpus test gated on the real cache file existing.
import { existsSync as _exists } from "node:fs";
import { homedir as _home } from "node:os";
import { join as _join } from "node:path";

const liveCacheChunk = _join(_home(), ".cache", "cuneiform-mcp", "chunk-index.json");
const HAS_LIVE_CACHE = _exists(liveCacheChunk);

describe.skipIf(!HAS_LIVE_CACHE)("computeQuotationNetwork — live corpus (smoke)", () => {
  it("produces a defensible graph on the live corpus (anchors: maqlu↔surpu, mis_pi→bit_sala_me)", async () => {
    // Switch cache override to the live cache dir for this single test.
    const liveCacheDir = _join(_home(), ".cache", "cuneiform-mcp");
    const { computeQuotationNetwork, _resetForTests } = await importNetwork();
    _resetForTests();
    const r = computeQuotationNetwork({
      minChunkLength: 20, // chunk-index window length is 20 in v0.20+
      minCitations: 2,
      cacheDirOverride: liveCacheDir,
    });
    expect(r.metrics.total_nodes).toBeGreaterThanOrEqual(4);
    expect(r.metrics.total_edges).toBeGreaterThanOrEqual(4);
    // Sanity: paths exist
    expect(existsSync(r.output_paths.json)).toBe(true);
    // v0.72 directionality: metrics present + graph no longer fully symmetric.
    expect(typeof r.metrics.directed_edge_fraction).toBe("number");
    expect(r.metrics.recommended_min_edge_weight).toBeGreaterThan(0);
    const allSymmetric = r.nodes.every((n) => n.in_degree === n.out_degree);
    expect(allSymmetric).toBe(false);
  }, 120_000);
});

// ── Chronology directionality helpers (hermetic, v0.72) ─────────────────────
describe("periodRank + chunkEdgeDirection", () => {
  it("ranks periods in chronological order, null for undatable", async () => {
    const { periodRank } = await importNetwork();
    expect(periodRank("Old Babylonian")).toBeLessThan(periodRank("Neo-Assyrian")!);
    expect(periodRank("Neo-Assyrian")).toBeLessThan(periodRank("Neo-Babylonian")!);
    expect(periodRank("Neo-Babylonian")).toBeLessThan(periodRank("Hellenistic")!);
    expect(periodRank("Uncertain")).toBeNull();
    expect(periodRank(null)).toBeNull();
    expect(periodRank("")).toBeNull();
  });

  it("tolerates modifiers via substring match", async () => {
    const { periodRank } = await importNetwork();
    expect(periodRank("Neo-Assyrian (Kuyunjik)")).toBe(periodRank("Neo-Assyrian"));
  });

  it("later composition quotes earlier (edge src→tgt = src quotes tgt)", async () => {
    const { chunkEdgeDirection } = await importNetwork();
    // rankA later (9, NB) than rankB (8, NA) → A quotes B
    expect(chunkEdgeDirection(9, 8)).toBe("a_quotes_b");
    expect(chunkEdgeDirection(8, 9)).toBe("b_quotes_a");
  });

  it("equal or undatable ranks → symmetric (half-weight fallback)", async () => {
    const { chunkEdgeDirection } = await importNetwork();
    expect(chunkEdgeDirection(8, 8)).toBe("symmetric");
    expect(chunkEdgeDirection(null, 8)).toBe("symmetric");
    expect(chunkEdgeDirection(8, null)).toBe("symmetric");
    expect(chunkEdgeDirection(null, null)).toBe("symmetric");
  });
});
