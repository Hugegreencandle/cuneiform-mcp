// v0.18.10 — Cross-prefix same-scribe edge discovery.
//
// Surfaces same-scribe edges that cross museum-collection boundaries
// (e.g., BM↔K, BM↔Sm, K↔CBS). Research value:
//   (a) scribal-school networks that transcend single excavation sites
//   (b) ancient manuscript-transmission patterns
//   (c) modern collection-history artifacts — one antiquities lot split
//       across multiple 19th-century European collections
//
// Distinct from v0.18.9 `find_scribal_groups`, which finds within-prefix
// scribal-lineage GROUPS via union-find. This tool finds individual EDGES
// that cross museum-collection prefixes, and aggregates them two ways:
//   - per-prefix-pair counts (which museum pairs share the most scribes?)
//   - per-tablet bridge counts (which individual tablets sit at the
//     intersection of multiple collections?)
//
// Algorithm:
//   1. Iterate over tablets (bounded by min_sign_count + max_tablets_to_scan),
//      optionally scoped to a source prefix_filter.
//   2. For each tablet, call findSameScribeCandidates with high topK.
//   3. For each candidate at signature_cosine ≥ threshold, keep only edges
//      where source.prefix ≠ candidate.prefix.
//   4. Dedupe via canonical (sorted) pair-key + take max observed cosine
//      and best jaccard.
//   5. Optionally filter to mutually-reciprocal edges (A in B's top-K AND
//      B in A's top-K, both at ≥ threshold).
//   6. Return:
//        - edges[] sorted by cosine desc
//        - prefix_pair_summary (top prefix-pairs by edge count)
//        - bridge_tablets[] (top-10 tablets with the most cross-prefix edges)
//
// Performance: O(N × topK) where N = tablets scanned. Defaults cap at 500
// scanned tablets; raise max_tablets_to_scan for full coverage.
//
// Pure stdlib + reuse of findSameScribeCandidates + getAllTabletRecords.

import { findSameScribeCandidates } from "./scribalFingerprint.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type CrossPrefixEdge = {
  tablet_a: string;
  tablet_b: string;
  prefix_a: string;
  prefix_b: string;
  signature_cosine: number;
  signature_jaccard: number;
  is_reciprocal: boolean;
};

export type PrefixPairCount = {
  pair: string; // canonical "A↔B" form (sorted, joined with ↔)
  prefix_a: string;
  prefix_b: string;
  edge_count: number;
  reciprocal_edge_count: number;
  max_cosine: number;
};

export type BridgeTablet = {
  tablet_id: string;
  prefix: string;
  cross_prefix_edge_count: number;
  distinct_other_prefixes: number;
  other_prefixes: string[]; // sorted by edge count desc
  max_cosine: number;
};

export type FindCrossPrefixScribalLinksResult = {
  query: {
    prefix_filter: string | null;
    min_cosine: number;
    require_reciprocal: boolean;
    min_sign_count: number;
    max_tablets_to_scan: number;
    top_k_per_tablet: number;
  };
  edges: CrossPrefixEdge[];
  prefix_pair_summary: PrefixPairCount[];
  bridge_tablets: BridgeTablet[];
  totals: {
    tablets_scanned: number;
    total_edges_above_threshold: number;
    total_reciprocal_edges: number;
    prefixes_involved: number;
  };
  warnings: string[];
};

export type FindCrossPrefixScribalLinksOptions = {
  prefixFilter?: string;
  minCosine?: number; // default 0.6
  requireReciprocal?: boolean; // default true
  minSignCount?: number; // default 50
  maxTabletsToScan?: number; // default 500 (cost cap, max 5000)
  topKPerTablet?: number; // default 15
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}↔${b}` : `${b}↔${a}`;
}

// ─── Main entry ────────────────────────────────────────────────────────────

export function findCrossPrefixScribalLinks(
  opts: FindCrossPrefixScribalLinksOptions = {},
): FindCrossPrefixScribalLinksResult {
  const prefixFilter = opts.prefixFilter && opts.prefixFilter.length > 0 ? opts.prefixFilter : null;
  const minCosine = Math.max(0, Math.min(1, opts.minCosine ?? 0.6));
  const requireReciprocal = opts.requireReciprocal ?? true;
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const maxScan = Math.max(10, Math.min(5000, opts.maxTabletsToScan ?? 500));
  const topK = Math.max(2, Math.min(30, opts.topKPerTablet ?? 15));
  const warnings: string[] = [];

  const emptyResult = (): FindCrossPrefixScribalLinksResult => ({
    query: {
      prefix_filter: prefixFilter,
      min_cosine: minCosine,
      require_reciprocal: requireReciprocal,
      min_sign_count: minSignCount,
      max_tablets_to_scan: maxScan,
      top_k_per_tablet: topK,
    },
    edges: [],
    prefix_pair_summary: [],
    bridge_tablets: [],
    totals: {
      tablets_scanned: 0,
      total_edges_above_threshold: 0,
      total_reciprocal_edges: 0,
      prefixes_involved: 0,
    },
    warnings,
  });

  const tablets = getAllTabletRecords();
  if (!tablets) {
    warnings.push(
      "Anomaly index not loaded — run `node scripts/build-anomaly-index.mjs` to populate the cache before querying.",
    );
    return emptyResult();
  }

  // Build scan list: tablets matching prefix_filter (if set) + sign_count
  // threshold, sorted by sign_count desc (larger tablets first — more
  // reliable signatures), capped at maxScan.
  const scanList = tablets
    .filter((t) => (prefixFilter ? prefixOf(t.id) === prefixFilter : true))
    .filter((t) => t.sign_count >= minSignCount)
    .slice() // copy before sort to avoid mutating readonly
    .sort((a, b) => b.sign_count - a.sign_count)
    .slice(0, maxScan);

  if (scanList.length === 0) {
    warnings.push(
      `No tablets match the scan criteria (prefix=${prefixFilter ?? "any"}, min_sign_count=${minSignCount}).`,
    );
    return emptyResult();
  }

  // For reciprocity tracking we need to know whether each side observed the
  // other. The candidate's tablet may live OUTSIDE the prefix_filter scan
  // window — that's fine, we simply won't observe the reverse direction
  // for those. We index every (seed, candidate) observation by canonical
  // pair-key + record direction set + best cosine + best jaccard.
  type EdgeAccumulator = {
    a: string;
    b: string;
    cosine: number; // max observed
    jaccard: number; // best observed (paired with the max-cosine direction; we keep max)
    directions: Set<string>; // "a_to_b" if A observed B, "b_to_a" if B observed A
  };
  const accByKey = new Map<string, EdgeAccumulator>();

  for (const seed of scanList) {
    const seedPrefix = prefixOf(seed.id);
    let result;
    try {
      result = findSameScribeCandidates({
        tabletId: seed.id,
        topK,
        minJaccard: 0,
        minOverlap: 3,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      warnings.push(`findSameScribeCandidates threw for ${seed.id}: ${msg}`);
      continue;
    }
    if (result.warnings.length > 0 && result.candidates.length === 0) continue;

    for (const cand of result.candidates) {
      if (cand.signature_cosine < minCosine) continue;
      const candPrefix = prefixOf(cand.tablet_id);
      // CORE FILTER: only cross-prefix edges.
      if (candPrefix === seedPrefix) continue;

      const key = edgeKey(seed.id, cand.tablet_id);
      let acc = accByKey.get(key);
      if (!acc) {
        const [a, b] = seed.id < cand.tablet_id ? [seed.id, cand.tablet_id] : [cand.tablet_id, seed.id];
        acc = {
          a,
          b,
          cosine: cand.signature_cosine,
          jaccard: cand.signature_jaccard,
          directions: new Set<string>(),
        };
        accByKey.set(key, acc);
      } else {
        if (cand.signature_cosine > acc.cosine) acc.cosine = cand.signature_cosine;
        if (cand.signature_jaccard > acc.jaccard) acc.jaccard = cand.signature_jaccard;
      }
      // Direction: if seed.id is the canonical "a", this observation is a→b
      const dir = seed.id === acc.a ? "a_to_b" : "b_to_a";
      acc.directions.add(dir);
    }
  }

  // Materialize edges; apply reciprocity filter if requested.
  const allEdges: CrossPrefixEdge[] = [];
  let reciprocalCount = 0;
  for (const acc of accByKey.values()) {
    const isReciprocal = acc.directions.size >= 2;
    if (isReciprocal) reciprocalCount++;
    if (requireReciprocal && !isReciprocal) continue;
    allEdges.push({
      tablet_a: acc.a,
      tablet_b: acc.b,
      prefix_a: prefixOf(acc.a),
      prefix_b: prefixOf(acc.b),
      signature_cosine: +acc.cosine.toFixed(4),
      signature_jaccard: +acc.jaccard.toFixed(4),
      is_reciprocal: isReciprocal,
    });
  }

  allEdges.sort((a, b) => b.signature_cosine - a.signature_cosine);

  // Build prefix-pair summary.
  const pairAcc = new Map<
    string,
    {
      prefix_a: string;
      prefix_b: string;
      edge_count: number;
      reciprocal_edge_count: number;
      max_cosine: number;
    }
  >();
  for (const e of allEdges) {
    const pk = pairKey(e.prefix_a, e.prefix_b);
    const [pa, pb] = e.prefix_a < e.prefix_b ? [e.prefix_a, e.prefix_b] : [e.prefix_b, e.prefix_a];
    let entry = pairAcc.get(pk);
    if (!entry) {
      entry = { prefix_a: pa, prefix_b: pb, edge_count: 0, reciprocal_edge_count: 0, max_cosine: 0 };
      pairAcc.set(pk, entry);
    }
    entry.edge_count++;
    if (e.is_reciprocal) entry.reciprocal_edge_count++;
    if (e.signature_cosine > entry.max_cosine) entry.max_cosine = e.signature_cosine;
  }
  const prefixPairSummary: PrefixPairCount[] = Array.from(pairAcc.entries())
    .map(([pair, v]) => ({
      pair,
      prefix_a: v.prefix_a,
      prefix_b: v.prefix_b,
      edge_count: v.edge_count,
      reciprocal_edge_count: v.reciprocal_edge_count,
      max_cosine: +v.max_cosine.toFixed(4),
    }))
    .sort((a, b) => {
      if (b.edge_count !== a.edge_count) return b.edge_count - a.edge_count;
      return b.max_cosine - a.max_cosine;
    });

  // Build bridge tablets: aggregate by tablet, count distinct other-prefixes.
  type BridgeAcc = {
    prefix: string;
    edges: number;
    otherPrefixCounts: Map<string, number>;
    maxCosine: number;
  };
  const bridgeAcc = new Map<string, BridgeAcc>();
  function bumpBridge(id: string, otherPrefix: string, cosine: number): void {
    let b = bridgeAcc.get(id);
    if (!b) {
      b = { prefix: prefixOf(id), edges: 0, otherPrefixCounts: new Map(), maxCosine: 0 };
      bridgeAcc.set(id, b);
    }
    b.edges++;
    b.otherPrefixCounts.set(otherPrefix, (b.otherPrefixCounts.get(otherPrefix) ?? 0) + 1);
    if (cosine > b.maxCosine) b.maxCosine = cosine;
  }
  for (const e of allEdges) {
    bumpBridge(e.tablet_a, e.prefix_b, e.signature_cosine);
    bumpBridge(e.tablet_b, e.prefix_a, e.signature_cosine);
  }
  const bridgeTablets: BridgeTablet[] = Array.from(bridgeAcc.entries())
    .map(([id, b]) => {
      const otherPrefixes = Array.from(b.otherPrefixCounts.entries())
        .sort((x, y) => y[1] - x[1])
        .map(([p]) => p);
      return {
        tablet_id: id,
        prefix: b.prefix,
        cross_prefix_edge_count: b.edges,
        distinct_other_prefixes: b.otherPrefixCounts.size,
        other_prefixes: otherPrefixes,
        max_cosine: +b.maxCosine.toFixed(4),
      };
    })
    .sort((a, b) => {
      if (b.distinct_other_prefixes !== a.distinct_other_prefixes) {
        return b.distinct_other_prefixes - a.distinct_other_prefixes;
      }
      if (b.cross_prefix_edge_count !== a.cross_prefix_edge_count) {
        return b.cross_prefix_edge_count - a.cross_prefix_edge_count;
      }
      return b.max_cosine - a.max_cosine;
    })
    .slice(0, 10);

  // Distinct prefixes involved across all surfaced edges.
  const prefixesInvolved = new Set<string>();
  for (const e of allEdges) {
    prefixesInvolved.add(e.prefix_a);
    prefixesInvolved.add(e.prefix_b);
  }

  if (allEdges.length === 0) {
    warnings.push(
      `No cross-prefix edges above min_cosine=${minCosine}${requireReciprocal ? " (reciprocal-only)" : ""}. Try lowering min_cosine, setting require_reciprocal=false, or raising max_tablets_to_scan.`,
    );
  }

  return {
    query: {
      prefix_filter: prefixFilter,
      min_cosine: minCosine,
      require_reciprocal: requireReciprocal,
      min_sign_count: minSignCount,
      max_tablets_to_scan: maxScan,
      top_k_per_tablet: topK,
    },
    edges: allEdges,
    prefix_pair_summary: prefixPairSummary,
    bridge_tablets: bridgeTablets,
    totals: {
      tablets_scanned: scanList.length,
      total_edges_above_threshold: allEdges.length,
      total_reciprocal_edges: reciprocalCount,
      prefixes_involved: prefixesInvolved.size,
    },
    warnings,
  };
}
