// v0.18.11 — Pairwise cluster-vs-cluster comparator.
//
// Motivation: cuneiform research workflows routinely produce TWO separately-
// reconstructed clusters that LOOK like they might be the same composition
// reached from different seeds — e.g. the BM.77056 *āšipūtu* hub vs the
// K.15325 hub — or that look like they might be distinct witness-groups of
// different compositions whose members happen to overlap on shared incipits.
// Until now answering "are these the same cluster?" required hand-stitching
// two reconstruct_cluster calls + set arithmetic + a manual prefix-roll up.
//
// This tool performs that comparison in one call. Each side accepts EITHER
// a seed_tablet_id (triggers an internal reconstruct_cluster with the
// standard defaults) OR an explicit cluster_members list (skips
// reconstruction and uses the caller-supplied set directly). The tool then
// computes:
//   - shared / A-unique / B-unique membership sets
//   - Jaccard similarity of cluster membership
//   - per-prefix distribution comparison (counts in A, in B, and shared)
//   - the relationship classification: identical / subset_a_in_b /
//     subset_b_in_a / overlap / disjoint
//   - union-level edge-density estimate (via clusterPairSimilarityMatrix
//     over the combined set, capped at 50 tablets to avoid combinatorial
//     blowup)
//   - a generated recommendations list interpreting the comparison
//
// Pure stdlib + reuse of reconstructCluster.ts + clusterMatrix.ts. No new
// analytical primitives — this module is a pure orchestrator.

import { reconstructCluster, type ClusterResult } from "./reconstructCluster.js";
import { clusterPairSimilarityMatrix, type ClusterMatrixResult } from "./clusterMatrix.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ClusterSource = "seed" | "explicit";

export type PrefixCount = {
  prefix: string;
  count: number;
};

export type ClusterSideResult = {
  source: ClusterSource;
  source_id: string | null; // seed museum number, or null for explicit
  member_count: number;
  member_ids: string[];
  prefix_distribution: PrefixCount[]; // sorted desc by count
  reconstruction: ClusterResult | null; // present only when source === "seed"
};

export type ClusterRelationship =
  | "identical"
  | "subset_a_in_b"
  | "subset_b_in_a"
  | "overlap"
  | "disjoint";

export type ComparisonBlock = {
  shared_members: string[];
  a_unique: string[];
  b_unique: string[];
  a_unique_count: number;
  b_unique_count: number;
  shared_count: number;
  jaccard: number; // |A ∩ B| / |A ∪ B|
  relationship: ClusterRelationship;
};

export type PrefixComparison = {
  prefix: string;
  a: number;
  b: number;
  shared: number; // members of this prefix present in BOTH sides
};

export type UnionAnalysis = {
  union_size: number;
  cross_cluster_edges: number; // edges between an A-only and a B-only member
  intra_a_edges: number;
  intra_b_edges: number;
  total_edges: number;
  edge_density: number;
  matrix: ClusterMatrixResult | null; // null when skipped (union too large)
  skipped: boolean;
  skip_reason: string | null;
};

export type CompareClustersQuery = {
  cluster_a: {
    mode: ClusterSource;
    seed: string | null;
    explicit_count: number;
  };
  cluster_b: {
    mode: ClusterSource;
    seed: string | null;
    explicit_count: number;
  };
  min_fuzzy_jaccard: number;
  max_cluster_size: number;
  max_depth: number;
  union_edge_cap: number; // tablets-in-union cap above which the union-edge analysis is skipped
};

export type CompareClustersResult = {
  query: CompareClustersQuery;
  cluster_a: ClusterSideResult;
  cluster_b: ClusterSideResult;
  comparison: ComparisonBlock;
  prefix_comparison: PrefixComparison[]; // sorted desc by max(a, b)
  union_analysis: UnionAnalysis | null;
  recommendations: string[];
  warnings: string[];
};

// ─── Options ───────────────────────────────────────────────────────────────

export type CompareClustersOptions = {
  // Cluster A: exactly one of seed-or-members must be provided.
  clusterASeed?: string;
  clusterAMembers?: string[];

  // Cluster B: exactly one of seed-or-members must be provided.
  clusterBSeed?: string;
  clusterBMembers?: string[];

  // Reconstruction parameters (only used when a seed is provided).
  minFuzzyJaccard?: number; // default 0.20
  maxClusterSize?: number; // default 100
  maxDepth?: number; // default 4
};

// ─── Helpers ───────────────────────────────────────────────────────────────

const UNION_EDGE_CAP = 50;

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function prefixDistribution(ids: string[]): PrefixCount[] {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const p = prefixOf(id);
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}

function classifyRelationship(
  aSet: Set<string>,
  bSet: Set<string>,
  shared: number,
): ClusterRelationship {
  if (shared === 0) return "disjoint";
  if (aSet.size === bSet.size && shared === aSet.size) return "identical";
  if (shared === aSet.size && aSet.size < bSet.size) return "subset_a_in_b";
  if (shared === bSet.size && bSet.size < aSet.size) return "subset_b_in_a";
  return "overlap";
}

function emptySideResult(source: ClusterSource, sourceId: string | null): ClusterSideResult {
  return {
    source,
    source_id: sourceId,
    member_count: 0,
    member_ids: [],
    prefix_distribution: [],
    reconstruction: null,
  };
}

function dedupeStrings(arr: string[] | undefined): string[] {
  if (!arr) return [];
  return [...new Set(arr.filter((s) => typeof s === "string" && s.length > 0))];
}

type SideBuilt = {
  side: ClusterSideResult;
  warnings: string[];
};

function buildSide(
  label: "A" | "B",
  seed: string | undefined,
  explicit: string[] | undefined,
  minJ: number,
  maxSize: number,
  maxDepth: number,
): SideBuilt {
  const warnings: string[] = [];
  const hasExplicit = explicit && explicit.length > 0;

  // Decision: explicit list wins when both are supplied (matches audit_cluster
  // semantics — trust the caller's curated set over a fresh reconstruction).
  if (hasExplicit) {
    if (seed) {
      warnings.push(
        `Cluster ${label}: both seed and explicit members supplied — using the explicit list; reconstruct_cluster was NOT called.`,
      );
    }
    const ids = dedupeStrings(explicit);
    return {
      side: {
        source: "explicit",
        source_id: null,
        member_count: ids.length,
        member_ids: ids,
        prefix_distribution: prefixDistribution(ids),
        reconstruction: null,
      },
      warnings,
    };
  }

  if (!seed) {
    warnings.push(
      `Cluster ${label}: neither a seed nor an explicit members list was supplied.`,
    );
    return { side: emptySideResult("explicit", null), warnings };
  }

  const reconstruction = reconstructCluster({
    seedTabletId: seed,
    minFuzzyJaccard: minJ,
    maxClusterSize: maxSize,
    maxDepth: maxDepth,
  });
  if (reconstruction.warnings.length > 0) {
    warnings.push(
      ...reconstruction.warnings.map((w) => `Cluster ${label} reconstruct: ${w}`),
    );
  }
  const ids = reconstruction.cluster_members.map((m) => m.tablet_id);
  return {
    side: {
      source: "seed",
      source_id: seed,
      member_count: ids.length,
      member_ids: ids,
      prefix_distribution: prefixDistribution(ids),
      reconstruction,
    },
    warnings,
  };
}

function buildPrefixComparison(
  aIds: string[],
  bIds: string[],
  aSet: Set<string>,
  bSet: Set<string>,
): PrefixComparison[] {
  const prefixes = new Set<string>();
  for (const id of aIds) prefixes.add(prefixOf(id));
  for (const id of bIds) prefixes.add(prefixOf(id));

  const aCounts = new Map<string, number>();
  const bCounts = new Map<string, number>();
  const sharedCounts = new Map<string, number>();
  for (const id of aIds) aCounts.set(prefixOf(id), (aCounts.get(prefixOf(id)) ?? 0) + 1);
  for (const id of bIds) bCounts.set(prefixOf(id), (bCounts.get(prefixOf(id)) ?? 0) + 1);
  for (const id of aIds) {
    if (bSet.has(id)) {
      const p = prefixOf(id);
      sharedCounts.set(p, (sharedCounts.get(p) ?? 0) + 1);
    }
  }
  // bSet membership is symmetric — but if A has duplicates we filtered them
  // above (dedupeStrings), so each shared id is counted once.
  void aSet;

  return [...prefixes]
    .map((prefix) => ({
      prefix,
      a: aCounts.get(prefix) ?? 0,
      b: bCounts.get(prefix) ?? 0,
      shared: sharedCounts.get(prefix) ?? 0,
    }))
    .sort((x, y) => Math.max(y.a, y.b) - Math.max(x.a, x.b) || x.prefix.localeCompare(y.prefix));
}

function computeUnionAnalysis(
  aIds: string[],
  bIds: string[],
  aSet: Set<string>,
  bSet: Set<string>,
  minJ: number,
): UnionAnalysis {
  const unionSet = new Set<string>([...aIds, ...bIds]);
  const unionIds = [...unionSet];
  if (unionIds.length < 2) {
    return {
      union_size: unionIds.length,
      cross_cluster_edges: 0,
      intra_a_edges: 0,
      intra_b_edges: 0,
      total_edges: 0,
      edge_density: 0,
      matrix: null,
      skipped: true,
      skip_reason: "Union has fewer than 2 distinct members — no edges possible.",
    };
  }
  if (unionIds.length > UNION_EDGE_CAP) {
    return {
      union_size: unionIds.length,
      cross_cluster_edges: 0,
      intra_a_edges: 0,
      intra_b_edges: 0,
      total_edges: 0,
      edge_density: 0,
      matrix: null,
      skipped: true,
      skip_reason: `Union size ${unionIds.length} exceeds the cap of ${UNION_EDGE_CAP} — skipping union-edge analysis to avoid combinatorial blowup. Re-run with smaller clusters or use cluster_pair_similarity_matrix directly.`,
    };
  }

  const matrix = clusterPairSimilarityMatrix({
    tabletIds: unionIds,
    minJaccard: Math.min(minJ, 0.1),
    topKPerNode: 50,
  });

  let crossCluster = 0;
  let intraA = 0;
  let intraB = 0;
  for (const e of matrix.edges) {
    const aHasS = aSet.has(e.source);
    const aHasT = aSet.has(e.target);
    const bHasS = bSet.has(e.source);
    const bHasT = bSet.has(e.target);
    const sIsAOnly = aHasS && !bHasS;
    const tIsAOnly = aHasT && !bHasT;
    const sIsBOnly = bHasS && !aHasS;
    const tIsBOnly = bHasT && !aHasT;
    if ((sIsAOnly && tIsBOnly) || (sIsBOnly && tIsAOnly)) {
      crossCluster++;
    } else if (aHasS && aHasT) {
      intraA++;
    } else if (bHasS && bHasT) {
      intraB++;
    }
    // Edges incident to shared members fall into intraA or intraB above
    // (shared members are in both sets) — they're not double-counted because
    // we hit the first matching branch.
  }
  return {
    union_size: unionIds.length,
    cross_cluster_edges: crossCluster,
    intra_a_edges: intraA,
    intra_b_edges: intraB,
    total_edges: matrix.edges.length,
    edge_density: matrix.edge_stats.density,
    matrix,
    skipped: false,
    skip_reason: null,
  };
}

function buildRecommendations(
  cmp: ComparisonBlock,
  aSide: ClusterSideResult,
  bSide: ClusterSideResult,
  union: UnionAnalysis | null,
  prefixCmp: PrefixComparison[],
): string[] {
  const recs: string[] = [];
  const jPct = (cmp.jaccard * 100).toFixed(1);

  switch (cmp.relationship) {
    case "identical":
      recs.push(
        `Clusters are IDENTICAL (Jaccard 1.00) — the two seeds reach the same membership set. Consolidate into a single cluster claim.`,
      );
      break;
    case "subset_a_in_b":
      recs.push(
        `Cluster A (${aSide.member_count}) is a STRICT SUBSET of Cluster B (${bSide.member_count}) — B is the larger reconstruction. Prefer B's seed/parameters and treat A as a partial view.`,
      );
      break;
    case "subset_b_in_a":
      recs.push(
        `Cluster B (${bSide.member_count}) is a STRICT SUBSET of Cluster A (${aSide.member_count}) — A is the larger reconstruction. Prefer A's seed/parameters and treat B as a partial view.`,
      );
      break;
    case "overlap":
      if (cmp.jaccard >= 0.75) {
        recs.push(
          `Clusters are ${jPct}% Jaccard-overlapping — likely the same composition with peripheral variation. Inspect the ${cmp.a_unique_count + cmp.b_unique_count} unique members to decide whether to merge.`,
        );
      } else if (cmp.jaccard >= 0.4) {
        recs.push(
          `Clusters share ${cmp.shared_count} members at Jaccard ${jPct}% — moderate overlap. Could be (a) one composition with two reconstructions diverging at the periphery, or (b) two related compositions sharing a common core. Inspect the shared members for incipit/colophon clues.`,
        );
      } else {
        recs.push(
          `Clusters share ${cmp.shared_count} members at Jaccard ${jPct}% — weak overlap. Likely two distinct compositions that share a small intersection (common incipit, ritual frame, or scribal-school overlap). Treat as separate cluster claims.`,
        );
      }
      break;
    case "disjoint":
      recs.push(
        `Clusters are DISJOINT (Jaccard 0.00) — zero shared members. Two distinct witness-groups; safe to publish as separate cluster claims.`,
      );
      break;
  }

  // Prefix-distribution insight: if the two sides share a dominant prefix
  // but have very different counts there, it's a hint that the clusters are
  // anchored in the same collection but reach different sub-corpora.
  const sharedPrefixes = prefixCmp.filter((p) => p.a > 0 && p.b > 0);
  if (sharedPrefixes.length > 0 && cmp.relationship !== "identical") {
    const top = sharedPrefixes[0];
    if (top.shared === 0 && top.a >= 3 && top.b >= 3) {
      recs.push(
        `Prefix ${top.prefix} appears in both clusters (A=${top.a}, B=${top.b}) but NO members are shared — same collection, different sub-corpora. Suggests two distinct compositions catalogued in the same museum.`,
      );
    }
  }

  // Disjoint-prefix insight: one side dominated by a prefix the other lacks.
  const aOnlyPrefixes = prefixCmp.filter((p) => p.a > 0 && p.b === 0);
  const bOnlyPrefixes = prefixCmp.filter((p) => p.b > 0 && p.a === 0);
  if (aOnlyPrefixes.length > 0 && cmp.relationship !== "disjoint") {
    recs.push(
      `Cluster A has ${aOnlyPrefixes.length} prefix(es) absent from B: ${aOnlyPrefixes.slice(0, 4).map((p) => `${p.prefix}(${p.a})`).join(", ")}${aOnlyPrefixes.length > 4 ? "…" : ""}. Provenance asymmetry — A's seed reaches collections B's does not.`,
    );
  }
  if (bOnlyPrefixes.length > 0 && cmp.relationship !== "disjoint") {
    recs.push(
      `Cluster B has ${bOnlyPrefixes.length} prefix(es) absent from A: ${bOnlyPrefixes.slice(0, 4).map((p) => `${p.prefix}(${p.b})`).join(", ")}${bOnlyPrefixes.length > 4 ? "…" : ""}. Provenance asymmetry — B's seed reaches collections A's does not.`,
    );
  }

  // Union-edge insight: cross-cluster edge density is the proxy for whether
  // two disjoint/overlapping clusters are connected at the fuzzy-Jaccard
  // periphery. High cross-cluster edge count + low membership overlap = the
  // clusters are neighbors in fuzzy-Jaccard space (shatter-threshold-adjacent).
  if (union && !union.skipped) {
    if (cmp.relationship === "disjoint" && union.cross_cluster_edges > 0) {
      recs.push(
        `Despite disjoint membership, the union has ${union.cross_cluster_edges} cross-cluster edge(s) at J ≥ 0.10 — the two clusters are NEIGHBORS in fuzzy-Jaccard space, not strangers. Likely related compositions separated by a topology shatter.`,
      );
    } else if (cmp.relationship === "overlap" && union.cross_cluster_edges === 0) {
      recs.push(
        `Membership overlaps but A-only / B-only members share NO direct fuzzy-Jaccard edges — the two halves only touch via the shared members. Suggests the shared members are bridging incipits / boilerplate rather than substantive parallels.`,
      );
    }
  } else if (union && union.skipped) {
    recs.push(
      `Union-edge analysis SKIPPED: ${union.skip_reason}`,
    );
  }

  return recs;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function compareClusters(opts: CompareClustersOptions): CompareClustersResult {
  const minJ = opts.minFuzzyJaccard ?? 0.2;
  const maxSize = Math.max(2, Math.min(100, opts.maxClusterSize ?? 100));
  const maxDepth = Math.max(1, Math.min(6, opts.maxDepth ?? 4));

  const warnings: string[] = [];

  // Validate that each side has at least one source specified. We deliberately
  // do NOT throw — instead we return an empty result with a warning, matching
  // audit_cluster's no-op semantics for missing input.
  const aHas = !!opts.clusterASeed || (opts.clusterAMembers && opts.clusterAMembers.length > 0);
  const bHas = !!opts.clusterBSeed || (opts.clusterBMembers && opts.clusterBMembers.length > 0);
  if (!aHas || !bHas) {
    const missing: string[] = [];
    if (!aHas) missing.push("cluster_a (needs cluster_a_seed or cluster_a_members)");
    if (!bHas) missing.push("cluster_b (needs cluster_b_seed or cluster_b_members)");
    warnings.push(
      `compare_clusters requires both sides: missing ${missing.join(" + ")}.`,
    );
    const emptySide = (mode: ClusterSource, seed: string | null): ClusterSideResult =>
      emptySideResult(mode, seed);
    return {
      query: {
        cluster_a: {
          mode: opts.clusterAMembers && opts.clusterAMembers.length > 0 ? "explicit" : "seed",
          seed: opts.clusterASeed ?? null,
          explicit_count: opts.clusterAMembers?.length ?? 0,
        },
        cluster_b: {
          mode: opts.clusterBMembers && opts.clusterBMembers.length > 0 ? "explicit" : "seed",
          seed: opts.clusterBSeed ?? null,
          explicit_count: opts.clusterBMembers?.length ?? 0,
        },
        min_fuzzy_jaccard: minJ,
        max_cluster_size: maxSize,
        max_depth: maxDepth,
        union_edge_cap: UNION_EDGE_CAP,
      },
      cluster_a: emptySide(
        opts.clusterAMembers && opts.clusterAMembers.length > 0 ? "explicit" : "seed",
        opts.clusterASeed ?? null,
      ),
      cluster_b: emptySide(
        opts.clusterBMembers && opts.clusterBMembers.length > 0 ? "explicit" : "seed",
        opts.clusterBSeed ?? null,
      ),
      comparison: {
        shared_members: [],
        a_unique: [],
        b_unique: [],
        a_unique_count: 0,
        b_unique_count: 0,
        shared_count: 0,
        jaccard: 0,
        relationship: "disjoint",
      },
      prefix_comparison: [],
      union_analysis: null,
      recommendations: [],
      warnings,
    };
  }

  const aBuilt = buildSide(
    "A",
    opts.clusterASeed,
    opts.clusterAMembers,
    minJ,
    maxSize,
    maxDepth,
  );
  const bBuilt = buildSide(
    "B",
    opts.clusterBSeed,
    opts.clusterBMembers,
    minJ,
    maxSize,
    maxDepth,
  );
  warnings.push(...aBuilt.warnings, ...bBuilt.warnings);

  const aSide = aBuilt.side;
  const bSide = bBuilt.side;
  const aSet = new Set(aSide.member_ids);
  const bSet = new Set(bSide.member_ids);

  // Membership comparison
  const shared: string[] = [];
  const aUnique: string[] = [];
  const bUnique: string[] = [];
  for (const id of aSide.member_ids) {
    if (bSet.has(id)) shared.push(id);
    else aUnique.push(id);
  }
  for (const id of bSide.member_ids) {
    if (!aSet.has(id)) bUnique.push(id);
  }
  const unionSize = aSet.size + bSet.size - shared.length;
  const jaccard = unionSize > 0 ? +(shared.length / unionSize).toFixed(4) : 0;
  const relationship = classifyRelationship(aSet, bSet, shared.length);

  const comparison: ComparisonBlock = {
    shared_members: [...shared].sort(),
    a_unique: [...aUnique].sort(),
    b_unique: [...bUnique].sort(),
    a_unique_count: aUnique.length,
    b_unique_count: bUnique.length,
    shared_count: shared.length,
    jaccard,
    relationship,
  };

  const prefixComparison = buildPrefixComparison(aSide.member_ids, bSide.member_ids, aSet, bSet);

  // Union-edge analysis — skipped when union exceeds UNION_EDGE_CAP.
  let unionAnalysis: UnionAnalysis | null = null;
  if (aSide.member_count > 0 && bSide.member_count > 0) {
    unionAnalysis = computeUnionAnalysis(
      aSide.member_ids,
      bSide.member_ids,
      aSet,
      bSet,
      minJ,
    );
    if (unionAnalysis.matrix && unionAnalysis.matrix.warnings.length > 0) {
      warnings.push(...unionAnalysis.matrix.warnings.map((w) => `union_matrix: ${w}`));
    }
  }

  const recommendations = buildRecommendations(
    comparison,
    aSide,
    bSide,
    unionAnalysis,
    prefixComparison,
  );

  const query: CompareClustersQuery = {
    cluster_a: {
      mode: aSide.source,
      seed: aSide.source_id,
      explicit_count: aSide.source === "explicit" ? aSide.member_count : 0,
    },
    cluster_b: {
      mode: bSide.source,
      seed: bSide.source_id,
      explicit_count: bSide.source === "explicit" ? bSide.member_count : 0,
    },
    min_fuzzy_jaccard: minJ,
    max_cluster_size: maxSize,
    max_depth: maxDepth,
    union_edge_cap: UNION_EDGE_CAP,
  };

  return {
    query,
    cluster_a: aSide,
    cluster_b: bSide,
    comparison,
    prefix_comparison: prefixComparison,
    union_analysis: unionAnalysis,
    recommendations,
    warnings,
  };
}
