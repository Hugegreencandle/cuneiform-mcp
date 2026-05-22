// v0.18.12 — Corpus-wide thematic-neighborhood group discovery.
//
// Generalizes the per-tablet `find_thematic_parallel` (v0.15.0) to corpus-wide
// group discovery on the THEMATIC (embedding-cosine) axis: instead of asking
// "what's most topically similar to THIS tablet?", asks "within prefix X, what
// thematic neighborhoods exist?". Returns all mutually-reciprocal thematic
// groups at a configurable cosine threshold, with per-group cohesion statistics.
//
// The thematic-axis analogue of:
//   - find_scribal_groups (v0.18.9) — same union-find pattern, but scribal-signature axis
//   - find_strongest_fuzzy_pairs_in_prefix (v0.18.11) — same prefix-scoped pattern, but lexical axis
//
// Motivation: lexical methods (fuzzy-Jaccard / trigram) miss topical neighborhoods
// that DON'T share sign sequences — paraphrases, bilingual pairs (a Sumerian
// original + its Akkadian translation), alt-spellings, and same-genre
// compositions copied by different traditions. Embedding cosine surfaces those
// by topic-vector proximity instead. This tool answers systematically:
// "within prefix X, what thematic neighborhoods exist that lexical and scribal
// methods don't see?"
//
// Algorithm (identical to find_scribal_groups except the similarity axis):
//   1. Iterate tablets in the requested prefix, bounded by min_sign_count and
//      max_tablets_to_scan (sorted by sign_count desc — larger tablets first)
//   2. For each tablet, call findThematicParallel with high topK
//   3. Constrain neighbors to the SAME prefix (we surface within-prefix groups)
//   4. Collect mutually-reciprocal edges at cosine ≥ threshold (A in B's top-K
//      AND B in A's top-K, both with cos ≥ threshold)
//   5. Apply union-find to merge transitively-connected groups
//   6. Filter to groups of size ≥ min_group_size (default 3)
//   7. Compute per-group cohesion (mean/min/max pairwise cosine within group)
//   8. Return groups sorted by size desc, then cohesion desc
//
// Threshold note: thematic-embedding cosine has a different distribution than
// scribal-signature cosine. The default min_cosine of 0.65 corresponds to
// "topically related" rather than "topically identical" — empirically the
// random_indexing thematic neighbor lists trend lower than LLR-weighted
// scribal signatures, so this threshold is looser than the 0.6 scribal default
// but is calibrated to the same intent ("probable topical neighborhood").
//
// Performance: O(N × topK) where N = tablets in prefix. For a 2,500-tablet
// prefix like K, this is ~minutes to complete. The `max_tablets_to_scan`
// parameter caps the cost.
//
// Pure stdlib + reuse of findThematicParallel + getAllTabletRecords.

import { findThematicParallel } from "./semanticEmbeddings.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ThematicClusterMember = {
  tablet_id: string;
  intra_group_degree: number; // how many other group members this one is reciprocal with at threshold
};

export type ThematicClusterCohesion = {
  mean_pairwise_cosine: number;
  min_pairwise_cosine: number;
  max_pairwise_cosine: number;
};

export type ThematicCluster = {
  group_id: number; // 0-indexed group counter
  size: number;
  members: ThematicClusterMember[];
  cohesion: ThematicClusterCohesion;
  edge_count: number; // reciprocal edges within group
  edge_density: number; // edge_count / (size × (size-1) / 2)
};

export type FindThematicClusterInPrefixResult = {
  query: {
    prefix_filter: string;
    min_cosine: number;
    min_group_size: number;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_k_per_tablet: number;
  };
  groups: ThematicCluster[];
  totals: {
    tablets_scanned: number;
    reciprocal_edges_found: number;
    groups_returned: number;
    largest_group_size: number;
  };
  warnings: string[];
};

export type FindThematicClusterInPrefixOptions = {
  prefixFilter: string;
  minCosine?: number; // default 0.65 — thematic-axis "topically related" threshold
  minGroupSize?: number; // default 3 (triplet-class and up; set 2 for all pairs)
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500 (cost cap, max 5000)
  topKPerTablet?: number; // default 15
};

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

type EdgeDirection = "a_to_b" | "b_to_a";

function directionOf(seed: string, neighbor: string): EdgeDirection {
  return seed < neighbor ? "a_to_b" : "b_to_a";
}

function emptyResult(
  prefixFilter: string,
  minCosine: number,
  minGroupSize: number,
  minSignCount: number,
  maxScan: number,
  topK: number,
  warnings: string[],
): FindThematicClusterInPrefixResult {
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
    totals: {
      tablets_scanned: 0,
      reciprocal_edges_found: 0,
      groups_returned: 0,
      largest_group_size: 0,
    },
    warnings,
  };
}

export function findThematicClusterInPrefix(
  opts: FindThematicClusterInPrefixOptions,
): FindThematicClusterInPrefixResult {
  const prefixFilter = opts.prefixFilter;
  if (!prefixFilter || prefixFilter.length === 0) {
    return emptyResult("", 0.65, 3, 50, 500, 15, [
      "prefix_filter is required — supply a museum-collection prefix bucket (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT').",
    ]);
  }

  const minCosine = Math.max(0, Math.min(1, opts.minCosine ?? 0.65));
  const minGroupSize = Math.max(2, opts.minGroupSize ?? 3);
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topK = Math.max(2, Math.min(30, opts.topKPerTablet ?? 15));
  const warnings: string[] = [];

  const tablets = getAllTabletRecords();
  if (!tablets) {
    return emptyResult(prefixFilter, minCosine, minGroupSize, minSignCount, maxScan, topK, [
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    ]);
  }

  // Build scan list: tablets in prefix with sign_count ≥ threshold AND that
  // are present in the thematic embedding index (in_them_index). Sorted by
  // sign_count desc — larger tablets have more reliable embeddings.
  const scanList = tablets
    .filter((t) => prefixOf(t.id) === prefixFilter)
    .filter((t) => t.sign_count >= minSignCount)
    .filter((t) => t.in_them_index)
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets in prefix '${prefixFilter}' match scan criteria (min_sign_count=${minSignCount}, must be in thematic embedding index).`,
    );
    return emptyResult(prefixFilter, minCosine, minGroupSize, minSignCount, maxScan, topK, warnings);
  }

  // For each scan tablet, fetch top-K thematic parallels and collect edges.
  // We restrict edges to the scan list (same prefix) — within-prefix groups
  // are the surface of interest here; cross-prefix bridges belong to a
  // separate tool.
  const scanIdSet = new Set(scanList.map((t) => t.id));
  const cosineByPair = new Map<string, number>(); // pair-key → max observed cosine
  const directionsByPair = new Map<string, Set<EdgeDirection>>(); // pair-key → directions observed

  for (const seed of scanList) {
    const result = findThematicParallel(seed.id, {
      topK,
      minCosine,
    });
    if (result.neighbors.length === 0) continue;
    for (const n of result.neighbors) {
      if (n.id === seed.id) continue; // self
      if (!scanIdSet.has(n.id)) continue; // out of prefix scope
      if (n.score < minCosine) continue;
      const key = edgeKey(seed.id, n.id);
      const prev = cosineByPair.get(key);
      if (prev === undefined || n.score > prev) {
        cosineByPair.set(key, n.score);
      }
      let dirs = directionsByPair.get(key);
      if (!dirs) {
        dirs = new Set();
        directionsByPair.set(key, dirs);
      }
      dirs.add(directionOf(seed.id, n.id));
    }
  }

  // Keep only mutually-reciprocal edges (observed from BOTH directions)
  const reciprocalEdges: Array<{ a: string; b: string; cosine: number }> = [];
  for (const [key, dirs] of directionsByPair) {
    if (dirs.size < 2) continue; // not reciprocal
    const parts = key.split("|");
    if (parts.length !== 2) continue;
    const [a, b] = parts;
    reciprocalEdges.push({ a, b, cosine: cosineByPair.get(key) ?? 0 });
  }

  // Union-find over scan-list tablets, joining via reciprocal edges
  const parent = new Map<string, string>();
  for (const t of scanList) parent.set(t.id, t.id);
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
  const groups: ThematicCluster[] = [];
  let groupId = 0;
  for (const memberIds of membersByRoot.values()) {
    if (memberIds.length < minGroupSize) continue;
    const memberSet = new Set(memberIds);
    const intraEdges = reciprocalEdges.filter(
      (e) => memberSet.has(e.a) && memberSet.has(e.b),
    );
    const cosines = intraEdges.map((e) => e.cosine);
    const meanCos =
      cosines.length > 0 ? cosines.reduce((acc, v) => acc + v, 0) / cosines.length : 0;
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
    const members: ThematicClusterMember[] = memberIds
      .map((id) => ({ tablet_id: id, intra_group_degree: degreeMap.get(id) ?? 0 }))
      .sort((a, b) => b.intra_group_degree - a.intra_group_degree);

    groups.push({
      group_id: groupId++,
      size: memberIds.length,
      members,
      cohesion: {
        mean_pairwise_cosine: +meanCos.toFixed(4),
        min_pairwise_cosine: +minCos.toFixed(4),
        max_pairwise_cosine: +maxCos.toFixed(4),
      },
      edge_count: intraEdges.length,
      edge_density: +density.toFixed(4),
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
