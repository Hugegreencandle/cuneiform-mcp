// v0.18.9 — Corpus-wide same-scribe scribal-lineage group discovery.
//
// Generalizes the per-tablet `find_same_scribe_candidates` (v0.18.0) to
// corpus-wide group discovery: instead of asking "who copied this tablet?",
// ask "what scribal-lineage groups exist within prefix X?". Returns all
// mutually-reciprocal same-scribe groups at a configurable cosine threshold,
// with per-group cohesion statistics.
//
// Motivation: the 2026-05-22 BM.77056 cluster survey found a 4-tablet
// same-scribe quartet (BM.34970 + 1881,0204.471 + BM.37658 + 1882,0522.515)
// at signature cosine 0.8866 — a new corpus-wide record (methods paper
// §3.4.1). That finding was opportunistic — surfaced only because
// reconstruct_cluster happened to traverse a cluster member that pulled
// the four tablets together. This tool answers the systematic question:
// "what OTHER same-scribe quartet-class groups exist that have NOT been
// surfaced by happenstance?"
//
// Algorithm:
//   1. Iterate over tablets in the requested prefix (or full corpus if no
//      prefix filter), bounded by min_sign_count and top_n filters
//   2. For each tablet, call findSameScribeCandidates with high topK
//   3. Collect mutually-reciprocal edges at signature_cosine ≥ threshold
//      (i.e., A in B's top-K AND B in A's top-K, both with cos ≥ threshold)
//   4. Apply union-find to merge transitively connected groups
//   5. Filter to groups of size ≥ min_group_size (default 3 for quartet-class)
//   6. Compute per-group cohesion (mean/min/max pairwise cosine within group)
//   7. Return groups sorted by size desc, then cohesion desc
//
// Performance: O(N × candidates_per_query) where N = tablets in prefix.
// For a 2,500-tablet prefix like K, this is ~minutes to complete. The
// `max_tablets_to_scan` parameter caps the cost.
//
// Pure stdlib + reuse of findSameScribeCandidates + getAllTabletRecords.

import { findSameScribeCandidates } from "./scribalFingerprint.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ScribalGroupMember = {
  tablet_id: string;
  intra_group_degree: number; // how many other group members this one is reciprocal with at threshold
};

export type ScribalGroup = {
  group_id: number; // 0-indexed group counter
  size: number;
  members: ScribalGroupMember[];
  cohesion: {
    mean_pairwise_cosine: number;
    min_pairwise_cosine: number;
    max_pairwise_cosine: number;
    edge_count: number; // total reciprocal edges within group
    edge_density: number; // edge_count / (size × (size-1) / 2)
  };
  prefix_distribution: Record<string, number>;
};

export type FindScribalGroupsResult = {
  query: {
    prefix_filter: string | null;
    min_cosine: number;
    min_group_size: number;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_k_per_tablet: number;
  };
  groups: ScribalGroup[];
  totals: {
    tablets_scanned: number;
    reciprocal_edges_found: number;
    groups_returned: number;
    largest_group_size: number;
  };
  warnings: string[];
};

export type FindScribalGroupsOptions = {
  prefixFilter?: string;
  minCosine?: number; // default 0.6 (the 2026-05-22 corpus-wide threshold for "probable same scribe")
  minGroupSize?: number; // default 3 (quartet-class and up; set 2 for all pairs)
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500 (cost cap)
  topKPerTablet?: number; // default 15
};

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function findScribalGroups(opts: FindScribalGroupsOptions = {}): FindScribalGroupsResult {
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const minCosine = Math.max(0, Math.min(1, opts.minCosine ?? 0.6));
  const minGroupSize = Math.max(2, opts.minGroupSize ?? 3);
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topK = Math.max(2, Math.min(30, opts.topKPerTablet ?? 15));
  const warnings: string[] = [];

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return {
      query: {
        prefix_filter: prefixFilter,
        min_cosine: minCosine,
        min_group_size: minGroupSize,
        min_sign_count: minSignCount,
        max_tablets_to_scan: maxScan,
        top_k_per_tablet: topK,
      },
      groups: [],
      totals: { tablets_scanned: 0, reciprocal_edges_found: 0, groups_returned: 0, largest_group_size: 0 },
      warnings: ["Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying."],
    };
  }

  // Build the scan list: tablets in prefix (if specified), with sign_count ≥ threshold,
  // sorted by sign_count desc (prioritize larger tablets — more reliable signatures)
  const scanList = tablets
    .filter((t) => (prefixFilter ? prefixOf(t.id) === prefixFilter : true))
    .filter((t) => t.sign_count >= minSignCount)
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(`No tablets match the scan criteria (prefix=${prefixFilter ?? "any"}, min_sign_count=${minSignCount}).`);
    return {
      query: {
        prefix_filter: prefixFilter,
        min_cosine: minCosine,
        min_group_size: minGroupSize,
        min_sign_count: minSignCount,
        max_tablets_to_scan: maxScan,
        top_k_per_tablet: topK,
      },
      groups: [],
      totals: { tablets_scanned: 0, reciprocal_edges_found: 0, groups_returned: 0, largest_group_size: 0 },
      warnings,
    };
  }

  // For each scan tablet, fetch top-K same-scribe candidates and collect edges.
  // An edge (A,B) is "reciprocal at threshold" iff B in A's top-K with cos ≥ threshold
  // AND A in B's top-K with cos ≥ threshold. We collect all candidate-pairs at threshold
  // from BOTH directions, then post-process to find mutually-reciprocal pairs.
  const scanIdSet = new Set(scanList.map((t) => t.id));
  const cosineByPair = new Map<string, number>(); // pair-key → max observed cosine
  const directionsByPair = new Map<string, Set<string>>(); // pair-key → set of {"a_to_b", "b_to_a"}

  for (const seed of scanList) {
    const result = findSameScribeCandidates({
      tabletId: seed.id,
      topK,
      minJaccard: 0,
      minOverlap: 3,
    });
    if (result.warnings.length > 0 && result.candidates.length === 0) continue;
    for (const cand of result.candidates) {
      // Constrain to the scan list — we only care about within-prefix groups
      if (!scanIdSet.has(cand.tablet_id)) continue;
      if (cand.signature_cosine < minCosine) continue;
      const key = edgeKey(seed.id, cand.tablet_id);
      const prev = cosineByPair.get(key);
      if (prev === undefined || cand.signature_cosine > prev) {
        cosineByPair.set(key, cand.signature_cosine);
      }
      let dirs = directionsByPair.get(key);
      if (!dirs) {
        dirs = new Set();
        directionsByPair.set(key, dirs);
      }
      dirs.add(seed.id < cand.tablet_id ? "a_to_b" : "b_to_a");
    }
  }

  // Keep only mutually-reciprocal edges (observed from BOTH directions)
  const reciprocalEdges: Array<{ a: string; b: string; cosine: number }> = [];
  for (const [key, dirs] of directionsByPair) {
    if (dirs.size < 2) continue; // not reciprocal
    const [a, b] = key.split("|");
    reciprocalEdges.push({ a, b, cosine: cosineByPair.get(key) ?? 0 });
  }

  // Union-find over scan-list tablets, joining via reciprocal edges
  const parent = new Map<string, string>();
  for (const t of scanList) parent.set(t.id, t.id);
  function find(x: string): string {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
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
  for (const e of reciprocalEdges) union(e.a, e.b);

  // Bucket members by component root
  const membersByRoot = new Map<string, string[]>();
  for (const t of scanList) {
    const r = find(t.id);
    let bucket = membersByRoot.get(r);
    if (!bucket) {
      bucket = [];
      membersByRoot.set(r, bucket);
    }
    bucket.push(t.id);
  }

  // Compute per-group stats; filter to size ≥ minGroupSize
  const groups: ScribalGroup[] = [];
  let groupId = 0;
  for (const memberIds of membersByRoot.values()) {
    if (memberIds.length < minGroupSize) continue;
    const memberSet = new Set(memberIds);
    const intraEdges = reciprocalEdges.filter((e) => memberSet.has(e.a) && memberSet.has(e.b));
    const cosines = intraEdges.map((e) => e.cosine);
    const meanCos = cosines.length > 0 ? cosines.reduce((a, b) => a + b, 0) / cosines.length : 0;
    const minCos = cosines.length > 0 ? Math.min(...cosines) : 0;
    const maxCos = cosines.length > 0 ? Math.max(...cosines) : 0;
    const maxPossibleEdges = (memberIds.length * (memberIds.length - 1)) / 2;
    const density = maxPossibleEdges > 0 ? intraEdges.length / maxPossibleEdges : 0;

    // Per-member intra-group degree
    const degreeMap = new Map<string, number>();
    for (const id of memberIds) degreeMap.set(id, 0);
    for (const e of intraEdges) {
      degreeMap.set(e.a, (degreeMap.get(e.a) ?? 0) + 1);
      degreeMap.set(e.b, (degreeMap.get(e.b) ?? 0) + 1);
    }
    const members: ScribalGroupMember[] = memberIds
      .map((id) => ({ tablet_id: id, intra_group_degree: degreeMap.get(id) ?? 0 }))
      .sort((a, b) => b.intra_group_degree - a.intra_group_degree);

    // Prefix distribution within group
    const prefDist: Record<string, number> = {};
    for (const id of memberIds) {
      const p = prefixOf(id);
      prefDist[p] = (prefDist[p] ?? 0) + 1;
    }

    groups.push({
      group_id: groupId++,
      size: memberIds.length,
      members,
      cohesion: {
        mean_pairwise_cosine: +meanCos.toFixed(4),
        min_pairwise_cosine: +minCos.toFixed(4),
        max_pairwise_cosine: +maxCos.toFixed(4),
        edge_count: intraEdges.length,
        edge_density: +density.toFixed(4),
      },
      prefix_distribution: prefDist,
    });
  }

  groups.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return b.cohesion.mean_pairwise_cosine - a.cohesion.mean_pairwise_cosine;
  });

  const largest = groups.length > 0 ? groups[0].size : 0;

  return {
    query: {
      prefix_filter: prefixFilter,
      min_cosine: minCosine,
      min_group_size: minGroupSize,
      min_sign_count: minSignCount,
      max_tablets_to_scan: maxScan,
      top_k_per_tablet: topK,
    },
    groups,
    totals: {
      tablets_scanned: scanList.length,
      reciprocal_edges_found: reciprocalEdges.length,
      groups_returned: groups.length,
      largest_group_size: largest,
    },
    warnings,
  };
}
