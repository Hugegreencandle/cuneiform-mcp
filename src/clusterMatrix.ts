// v0.18.7 — Pairwise similarity matrix for an arbitrary tablet set.
//
// Motivation: `reconstruct_cluster` (v0.17.1) returns members + BFS-tree edges,
// but the edge set is only the edges discovered during BFS expansion. Sibling-
// to-sibling similarity within the cluster is partially captured (when a
// candidate is already in the cluster, the edge is recorded) but not
// exhaustively — top-K cutoffs at each BFS node mean many low-J sibling
// pairs are never tested. For visualization or topology analysis the full
// N×N pairwise matrix is needed.
//
// This tool fills that gap. Given an arbitrary list of museum numbers
// (typically: the `cluster_members` field from a prior `reconstruct_cluster`
// call), compute the full upper-triangular pairwise fuzzy-Jaccard matrix and
// return:
//   - the matrix as a sparse edge list (pairs with J ≥ min_jaccard)
//   - per-tablet degree count at multiple thresholds
//   - summary statistics (min / median / max edge weight, density)
//   - connected-component breakdowns at multiple thresholds
//
// Pairs missing from a tablet's top-K parallels return as zero; documented
// as a known limitation. For tablets with very many neighbors (>50), use
// `find_fuzzy_parallels` directly for precision.
//
// Pure stdlib + reuse of findFuzzyParallels.ts.

import { findFuzzyParallels } from "./fuzzyParallels.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type MatrixEdge = {
  source: string;
  target: string;
  fuzzy_jaccard: number;
};

export type TabletDegree = {
  tablet_id: string;
  degree_at_0_10: number;
  degree_at_0_20: number;
  degree_at_0_30: number;
  max_edge_weight: number;
};

export type ConnectedComponent = {
  threshold: number;
  component_count: number;
  largest_component_size: number;
  isolated_tablets: number; // tablets with zero edges at this threshold
};

export type ClusterMatrixResult = {
  query: {
    tablet_count: number;
    min_jaccard: number;
    top_k_per_node: number;
  };
  edges: MatrixEdge[];
  edge_stats: {
    total_pairs_possible: number;
    edges_above_threshold: number;
    density: number; // edges_above / total_pairs_possible
    weight_min: number;
    weight_median: number;
    weight_max: number;
    weight_mean: number;
  };
  per_tablet_degree: TabletDegree[];
  connected_components: ConnectedComponent[];
  not_in_corpus: string[]; // tablets that weren't found in the fuzzy-parallel corpus
  warnings: string[];
};

export type ClusterMatrixOptions = {
  tabletIds: string[];
  minJaccard?: number; // default 0.10
  topKPerNode?: number; // default 50 (high to maximize sibling-pair coverage)
};

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function countComponents(tablets: string[], edges: MatrixEdge[], threshold: number): ConnectedComponent {
  // Union-find over the tablets, joining pairs whose edge weight ≥ threshold
  const parent = new Map<string, string>();
  for (const t of tablets) parent.set(t, t);
  function find(x: string): string {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    // Path compression
    let node = x;
    while (parent.get(node) !== cur) {
      const next = parent.get(node)!;
      parent.set(node, cur);
      node = next;
    }
    return cur;
  }
  function union(a: string, b: string): void {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }
  for (const e of edges) {
    if (e.fuzzy_jaccard >= threshold) union(e.source, e.target);
  }
  // Count components + largest
  const sizes = new Map<string, number>();
  for (const t of tablets) {
    const r = find(t);
    sizes.set(r, (sizes.get(r) ?? 0) + 1);
  }
  let largest = 0;
  let isolated = 0;
  for (const size of sizes.values()) {
    if (size > largest) largest = size;
    if (size === 1) isolated++;
  }
  return {
    threshold,
    component_count: sizes.size,
    largest_component_size: largest,
    isolated_tablets: isolated,
  };
}

export function clusterPairSimilarityMatrix(opts: ClusterMatrixOptions): ClusterMatrixResult {
  const minJ = opts.minJaccard ?? 0.10;
  const topK = Math.max(1, Math.min(50, opts.topKPerNode ?? 50));
  const tabletIds = [...new Set(opts.tabletIds)].filter((t) => typeof t === "string" && t.length > 0);

  if (tabletIds.length < 2) {
    return {
      query: { tablet_count: tabletIds.length, min_jaccard: minJ, top_k_per_node: topK },
      edges: [],
      edge_stats: {
        total_pairs_possible: 0,
        edges_above_threshold: 0,
        density: 0,
        weight_min: 0,
        weight_median: 0,
        weight_max: 0,
        weight_mean: 0,
      },
      per_tablet_degree: [],
      connected_components: [],
      not_in_corpus: [],
      warnings: ["At least 2 distinct tablet IDs required to compute a similarity matrix."],
    };
  }

  // Dedupe pair edges via a map keyed by sorted-pair key. When a pair appears
  // from both directions (A→B in A's parallels, B→A in B's parallels), the
  // fuzzy_jaccard values should match; take max for safety against rounding.
  const inputSet = new Set(tabletIds);
  const pairs = new Map<string, MatrixEdge>();
  const notInCorpus: string[] = [];

  for (const tid of tabletIds) {
    const result = findFuzzyParallels({
      tabletId: tid,
      topK,
      minFuzzyJaccard: minJ,
      minFuzzyIntersect: 1, // permissive — let the J threshold do the filtering
    });
    if (result.warnings.length > 0 && result.parallels.length === 0) {
      notInCorpus.push(tid);
      continue;
    }
    for (const p of result.parallels) {
      if (!inputSet.has(p.tablet_id)) continue;
      const key = edgeKey(tid, p.tablet_id);
      const existing = pairs.get(key);
      if (!existing || existing.fuzzy_jaccard < p.fuzzy_jaccard) {
        // Canonicalize source < target for stable output
        const [a, b] = tid < p.tablet_id ? [tid, p.tablet_id] : [p.tablet_id, tid];
        pairs.set(key, { source: a, target: b, fuzzy_jaccard: +p.fuzzy_jaccard.toFixed(4) });
      }
    }
  }

  const edges = [...pairs.values()].sort((a, b) => b.fuzzy_jaccard - a.fuzzy_jaccard);

  // Per-tablet degree at multiple thresholds
  const degreeMap = new Map<string, { d10: number; d20: number; d30: number; max: number }>();
  for (const tid of tabletIds) degreeMap.set(tid, { d10: 0, d20: 0, d30: 0, max: 0 });
  for (const e of edges) {
    for (const t of [e.source, e.target]) {
      const dg = degreeMap.get(t)!;
      if (e.fuzzy_jaccard >= 0.1) dg.d10++;
      if (e.fuzzy_jaccard >= 0.2) dg.d20++;
      if (e.fuzzy_jaccard >= 0.3) dg.d30++;
      if (e.fuzzy_jaccard > dg.max) dg.max = e.fuzzy_jaccard;
    }
  }
  const perTabletDegree: TabletDegree[] = tabletIds
    .filter((t) => !notInCorpus.includes(t))
    .map((t) => {
      const dg = degreeMap.get(t)!;
      return {
        tablet_id: t,
        degree_at_0_10: dg.d10,
        degree_at_0_20: dg.d20,
        degree_at_0_30: dg.d30,
        max_edge_weight: +dg.max.toFixed(4),
      };
    })
    .sort((a, b) => b.degree_at_0_20 - a.degree_at_0_20);

  // Edge-weight summary stats
  const weights = edges.map((e) => e.fuzzy_jaccard).sort((a, b) => a - b);
  const totalPairs = (tabletIds.length * (tabletIds.length - 1)) / 2;
  const edgeStats = {
    total_pairs_possible: totalPairs,
    edges_above_threshold: edges.length,
    density: totalPairs > 0 ? +(edges.length / totalPairs).toFixed(4) : 0,
    weight_min: weights[0] ?? 0,
    weight_median: median(weights),
    weight_max: weights[weights.length - 1] ?? 0,
    weight_mean: weights.length > 0 ? +(weights.reduce((a, b) => a + b, 0) / weights.length).toFixed(4) : 0,
  };

  // Connected components at multiple thresholds
  const tabletList = tabletIds.filter((t) => !notInCorpus.includes(t));
  const ccThresholds = [0.1, 0.2, 0.3, 0.4, 0.5];
  const components = ccThresholds.map((t) => countComponents(tabletList, edges, t));

  const warnings: string[] = [];
  if (notInCorpus.length > 0) {
    warnings.push(`${notInCorpus.length} tablet(s) not found in fuzzy corpus: ${notInCorpus.slice(0, 5).join(", ")}${notInCorpus.length > 5 ? "…" : ""}`);
  }
  if (topK <= 10) {
    warnings.push(`top_k_per_node=${topK} is low — sibling-pair coverage may be incomplete. Recommend ≥30 for cluster-size 20+.`);
  }

  return {
    query: { tablet_count: tabletIds.length, min_jaccard: minJ, top_k_per_node: topK },
    edges,
    edge_stats: edgeStats,
    per_tablet_degree: perTabletDegree,
    connected_components: components,
    not_in_corpus: notInCorpus,
    warnings,
  };
}
