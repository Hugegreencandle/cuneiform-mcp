// v0.17.1 — Recursive manuscript-cluster reconstructor.
//
// Given a seed tablet, recursively expand via fuzzy trigram-Jaccard
// (1-substitution) parallels until the cluster closes. Output is the
// connected component of likely manuscript siblings under the
// fuzzy-overlap relation.
//
// Motivation: the 2026-05-16 validation pass identified BM.77056 as a
// 12-tablet manuscript-cluster hub. THREE v0.17-filtered bi-orphan
// candidates (BM.45641, BM.36745, BM.47910) all belong to that single
// cluster, but the v0.16 anomaly surface atomized them into three
// disconnected orphans because each was below the 0.30 exact-Jaccard
// threshold to its immediate neighbors. This tool reconstructs the
// full cluster topology in a single call.
//
// Algorithm: BFS from seed. Each frontier node is probed for its
// top-K fuzzy parallels with fuzzy_J ≥ threshold. New tablets are
// added to the cluster + the next frontier. Termination: depth cap,
// size cap, or frontier exhaustion. Result includes per-member
// {depth, parent, fuzzy_j_to_parent} so the cluster topology is
// inspectable.
//
// Pure stdlib + reuse of fuzzyParallels.ts.
//
// v0.18.4 — Added optional `minSignCount` filter to drop marginal-signal
// fragments from cluster membership. Motivation: 2026-05-22 investigation
// of the BM.77056 cluster surfaced 3 NZK.set.* members (NZK.set.{11,12,13})
// with only 5-8 signs each — short enough that fuzzy-Jaccard is false-
// positive-prone. Setting `minSignCount` to e.g. 50 or 100 (mirroring
// `find_anomalous_tablets`'s default-100 quality filter) drops these
// marginal members. Default is undefined (no filter) to preserve
// backward-compatibility with v0.17.1-v0.18.3 reconstructions.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getTabletSignCount } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ClusterMember = {
  tablet_id: string;
  depth: number; // BFS hop from seed (0 = seed)
  parent: string | null; // the tablet that brought this one in
  fuzzy_j_to_parent: number;
};

export type ClusterEdge = {
  source: string;
  target: string;
  fuzzy_jaccard: number;
};

export type ClusterResult = {
  seed_tablet: string;
  cluster_size: number;
  cluster_members: ClusterMember[];
  cluster_edges: ClusterEdge[]; // BFS tree edges only (depth-1 to parent)
  depth_distribution: Record<string, number>;
  prefix_distribution: Record<string, number>;
  cross_prefix_count: number;
  config: {
    min_fuzzy_jaccard: number;
    min_fuzzy_intersect: number;
    max_cluster_size: number;
    max_depth: number;
    top_k_per_node: number;
    min_sign_count: number; // v0.18.4 — 0 disables filter (default)
  };
  termination_reason: "frontier_exhausted" | "max_depth_reached" | "max_size_reached";
  index_stats: {
    total_fuzzy_calls: number;
    expanded_tablets: number;
    filtered_below_sign_count: number; // v0.18.4 — count dropped by min_sign_count filter
    filtered_no_sign_count_data: number; // v0.18.4 — count dropped because anomaly index has no record
  };
  warnings: string[];
};

// ─── Public API ────────────────────────────────────────────────────────────

export type ReconstructClusterOptions = {
  seedTabletId: string;
  minFuzzyJaccard?: number; // default 0.20
  minFuzzyIntersect?: number; // default 5
  maxClusterSize?: number; // default 30
  maxDepth?: number; // default 3
  topKPerNode?: number; // default 12
  minSignCount?: number; // v0.18.4 — default 0 (no filter). Recommended 50-100 to drop short fragments.
};

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

export function reconstructCluster(opts: ReconstructClusterOptions): ClusterResult {
  const minJ = opts.minFuzzyJaccard ?? 0.2;
  const minI = opts.minFuzzyIntersect ?? 5;
  const maxSize = Math.max(2, Math.min(100, opts.maxClusterSize ?? 30));
  const maxDepth = Math.max(1, Math.min(6, opts.maxDepth ?? 3));
  const topK = Math.max(1, Math.min(30, opts.topKPerNode ?? 12));
  const minSignCount = Math.max(0, opts.minSignCount ?? 0);
  const warnings: string[] = [];

  // v0.18.4 quality-filter: should this candidate be included?
  // Returns { include: boolean, reason?: "below_sign_count" | "no_data" }.
  // When minSignCount = 0, every candidate passes (backward-compat default).
  // Seed is exempt — if the user asked for a specific seed, respect it even
  // if it's below the threshold (drop a warning instead of silently empty).
  let filteredBelow = 0;
  let filteredNoData = 0;
  function shouldInclude(tabletId: string, isSeed: boolean): boolean {
    if (minSignCount <= 0) return true;
    if (isSeed) return true;
    const sc = getTabletSignCount(tabletId);
    if (sc == null) {
      filteredNoData++;
      return false;
    }
    if (sc < minSignCount) {
      filteredBelow++;
      return false;
    }
    return true;
  }
  if (minSignCount > 0) {
    const seedSc = getTabletSignCount(opts.seedTabletId);
    if (seedSc == null) {
      warnings.push(
        `Seed ${opts.seedTabletId} has no sign_count in anomaly index — seed is included regardless, but min_sign_count filter cannot evaluate it.`,
      );
    } else if (seedSc < minSignCount) {
      warnings.push(
        `Seed ${opts.seedTabletId} sign_count (${seedSc}) is below min_sign_count (${minSignCount}) — seed included regardless; quality-filter applied only to subsequent candidates.`,
      );
    }
  }

  // Probe the seed first to surface load errors / missing-tablet immediately
  const seedProbe = findFuzzyParallels({
    tabletId: opts.seedTabletId,
    topK,
    minFuzzyJaccard: minJ,
    minFuzzyIntersect: minI,
  });
  if (seedProbe.warnings.length > 0) {
    return {
      seed_tablet: opts.seedTabletId,
      cluster_size: 0,
      cluster_members: [],
      cluster_edges: [],
      depth_distribution: {},
      prefix_distribution: {},
      cross_prefix_count: 0,
      config: { min_fuzzy_jaccard: minJ, min_fuzzy_intersect: minI, max_cluster_size: maxSize, max_depth: maxDepth, top_k_per_node: topK, min_sign_count: minSignCount },
      termination_reason: "frontier_exhausted",
      index_stats: { total_fuzzy_calls: 1, expanded_tablets: 0, filtered_below_sign_count: 0, filtered_no_sign_count_data: 0 },
      warnings: seedProbe.warnings,
    };
  }

  const inCluster = new Map<string, ClusterMember>();
  inCluster.set(opts.seedTabletId, {
    tablet_id: opts.seedTabletId,
    depth: 0,
    parent: null,
    fuzzy_j_to_parent: 1.0,
  });
  const edges: ClusterEdge[] = [];

  // Seed's depth-1 expansion (we already have its parallels from seedProbe)
  let frontier: string[] = [];
  for (const p of seedProbe.parallels) {
    if (inCluster.size >= maxSize) break;
    if (inCluster.has(p.tablet_id)) continue;
    if (!shouldInclude(p.tablet_id, false)) continue; // v0.18.4 quality filter
    inCluster.set(p.tablet_id, {
      tablet_id: p.tablet_id,
      depth: 1,
      parent: opts.seedTabletId,
      fuzzy_j_to_parent: p.fuzzy_jaccard,
    });
    edges.push({ source: opts.seedTabletId, target: p.tablet_id, fuzzy_jaccard: p.fuzzy_jaccard });
    frontier.push(p.tablet_id);
  }

  let fuzzyCalls = 1;
  let expandedTablets = 1; // seed counts as expanded
  let termination: ClusterResult["termination_reason"] = "frontier_exhausted";

  for (let depth = 2; depth <= maxDepth && frontier.length > 0; depth++) {
    if (inCluster.size >= maxSize) { termination = "max_size_reached"; break; }
    const nextFrontier: string[] = [];
    for (const parent of frontier) {
      if (inCluster.size >= maxSize) { termination = "max_size_reached"; break; }
      const r = findFuzzyParallels({
        tabletId: parent,
        topK,
        minFuzzyJaccard: minJ,
        minFuzzyIntersect: minI,
      });
      fuzzyCalls++;
      expandedTablets++;
      for (const p of r.parallels) {
        if (inCluster.size >= maxSize) break;
        if (inCluster.has(p.tablet_id)) {
          // Edge to existing cluster member — track it but don't re-add
          edges.push({ source: parent, target: p.tablet_id, fuzzy_jaccard: p.fuzzy_jaccard });
          continue;
        }
        if (!shouldInclude(p.tablet_id, false)) continue; // v0.18.4 quality filter
        inCluster.set(p.tablet_id, {
          tablet_id: p.tablet_id,
          depth,
          parent,
          fuzzy_j_to_parent: p.fuzzy_jaccard,
        });
        edges.push({ source: parent, target: p.tablet_id, fuzzy_jaccard: p.fuzzy_jaccard });
        nextFrontier.push(p.tablet_id);
      }
    }
    if (depth === maxDepth && nextFrontier.length > 0 && inCluster.size < maxSize) {
      termination = "max_depth_reached";
    }
    frontier = nextFrontier;
  }
  if (inCluster.size >= maxSize) termination = "max_size_reached";

  // Build sorted member list (by depth, then by fuzzy_j to parent desc)
  const members = [...inCluster.values()].sort((a, b) => {
    if (a.depth !== b.depth) return a.depth - b.depth;
    return b.fuzzy_j_to_parent - a.fuzzy_j_to_parent;
  });

  // Stats
  const depthDist: Record<string, number> = {};
  const prefixDist: Record<string, number> = {};
  const seedPrefix = prefixOf(opts.seedTabletId);
  let crossPrefix = 0;
  for (const m of members) {
    depthDist[String(m.depth)] = (depthDist[String(m.depth)] ?? 0) + 1;
    const p = prefixOf(m.tablet_id);
    prefixDist[p] = (prefixDist[p] ?? 0) + 1;
    if (p !== seedPrefix) crossPrefix++;
  }

  // Dedupe edges (BFS may produce both directions)
  const edgeKey = (s: string, t: string) => (s < t ? `${s}|${t}` : `${t}|${s}`);
  const seenEdges = new Map<string, ClusterEdge>();
  for (const e of edges) {
    const k = edgeKey(e.source, e.target);
    const existing = seenEdges.get(k);
    if (!existing || existing.fuzzy_jaccard < e.fuzzy_jaccard) seenEdges.set(k, e);
  }
  const dedupedEdges = [...seenEdges.values()].sort((a, b) => b.fuzzy_jaccard - a.fuzzy_jaccard);

  return {
    seed_tablet: opts.seedTabletId,
    cluster_size: members.length,
    cluster_members: members,
    cluster_edges: dedupedEdges,
    depth_distribution: depthDist,
    prefix_distribution: prefixDist,
    cross_prefix_count: crossPrefix,
    config: {
      min_fuzzy_jaccard: minJ,
      min_fuzzy_intersect: minI,
      max_cluster_size: maxSize,
      max_depth: maxDepth,
      top_k_per_node: topK,
      min_sign_count: minSignCount,
    },
    termination_reason: termination,
    index_stats: {
      total_fuzzy_calls: fuzzyCalls,
      expanded_tablets: expandedTablets,
      filtered_below_sign_count: filteredBelow,
      filtered_no_sign_count_data: filteredNoData,
    },
    warnings,
  };
}
