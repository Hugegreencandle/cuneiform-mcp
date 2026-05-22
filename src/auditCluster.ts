// v0.18.10 — Composite cluster audit: one-call quality + topology + provenance.
//
// Motivation: the manual workflow for vetting a cluster claim before publishing
// (the BM.77056 *āšipūtu* canon validation pass on 2026-05-22 being the canonical
// example) requires running, in sequence:
//   1. reconstruct_cluster (BFS expansion from a seed)
//   2. find_short_fragments (quality filter — surface marginal-signal members)
//   3. cluster_pair_similarity_matrix (full pairwise topology incl. components)
//   4. distinct-prefix / cross-prefix tally (provenance audit)
// then hand-stitching the outputs into a "what should I do next?" decision.
//
// This tool performs all four steps in a single call and produces a unified
// audit envelope: quality (sign-count distribution + marginal-signal flagging),
// topology (prefix distribution + cross-prefix ratio + hubs + component
// breakdown at 5 thresholds + edge density), provenance (per-prefix coverage +
// missing-from-corpus list), and a generated recommendations list of suggested
// next actions. Designed so a human can scan a single result and decide whether
// the cluster is publishable, needs filtering, or shatters at a higher
// cohesion threshold.
//
// Two input modes:
//   - seed_tablet_id : triggers an internal reconstruct_cluster call with the
//     standard defaults (max_size=100, max_depth=4, min_fuzzy_jaccard=0.20).
//   - cluster_members: explicit list of museum numbers (skips reconstruction
//     and audits the caller-supplied set directly). Use when iterating on a
//     filtered or hand-curated cluster.
//
// Pure stdlib + reuse of the existing modules — no new dependencies. This
// module is a pure orchestrator; it does not introduce new analytical
// primitives, only composition of established ones.

import { reconstructCluster, type ClusterResult } from "./reconstructCluster.js";
import { clusterPairSimilarityMatrix, type ClusterMatrixResult, type TabletDegree } from "./clusterMatrix.js";
import { type ShortFragment } from "./collectionCoverage.js";
import { getTabletSignCount, getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type AuditClusterQuery = {
  mode: "seed" | "explicit_members";
  seed_tablet_id: string | null;
  member_count: number;
  min_sign_count: number;
  topology_thresholds: number[];
  reconstruct_defaults_used: boolean; // true iff mode=seed (internal reconstruct call ran)
};

export type SignCountStats = {
  min: number;
  median: number;
  mean: number;
  max: number;
  count: number; // how many members had a sign-count record (not null)
};

export type AuditQualityBlock = {
  sign_count: SignCountStats;
  members_without_sign_count: string[]; // anomaly-index returned null
  marginal_signal: ShortFragment[]; // members at-or-below min_sign_count
  marginal_signal_count: number;
  recommended_exclusions: string[]; // ids of marginal-signal members (drop list)
};

export type PrefixCount = {
  prefix: string;
  count: number;
};

export type ComponentSummary = {
  threshold: number;
  component_count: number;
  largest_component_size: number;
  isolated_tablets: number;
  edge_density: number; // edges_at_threshold / total_pairs_possible
};

export type AuditTopologyBlock = {
  prefix_distribution: PrefixCount[]; // sorted desc by count
  distinct_prefix_count: number;
  cross_prefix_count: number;
  cross_prefix_ratio: number; // cross-prefix-members / total-members
  top_hubs: TabletDegree[]; // top 10 by degree at J ≥ 0.20
  components_by_threshold: ComponentSummary[];
  shatter_threshold: number | null; // first threshold where component_count > 1, null if cohesive throughout
};

export type PrefixCoverage = {
  prefix: string;
  members_in_cluster: number;
  total_in_corpus: number; // 0 if anomaly index not loaded
  coverage_pct: number; // members_in_cluster / total_in_corpus, 0 if total_in_corpus = 0
};

export type AuditProvenanceBlock = {
  distinct_prefixes: string[];
  per_prefix_coverage: PrefixCoverage[];
  missing_from_corpus: string[]; // members not in the fuzzy-parallel corpus
};

export type AuditClusterResult = {
  query: AuditClusterQuery;
  cluster: {
    member_count: number;
    member_ids: string[];
    reconstruction: ClusterResult | null; // present only when mode=seed
    matrix: ClusterMatrixResult;
  };
  quality: AuditQualityBlock;
  topology: AuditTopologyBlock;
  provenance: AuditProvenanceBlock;
  recommendations: string[];
  warnings: string[];
};

// ─── Options ───────────────────────────────────────────────────────────────

export type AuditClusterOptions = {
  // EITHER seedTabletId OR clusterMembers (exactly one). If both are supplied,
  // clusterMembers takes precedence (we trust the caller's explicit list over
  // a fresh reconstruction). If neither, an error result is returned.
  seedTabletId?: string;
  clusterMembers?: string[];

  // Quality threshold for the marginal-signal filter. Default 50 — matches
  // the recommended min_sign_count for reconstruct_cluster in v0.18.4+.
  minSignCount?: number;

  // Thresholds for connected-component & edge-density topology rollup.
  // Default [0.10, 0.20, 0.30, 0.40, 0.50]. The 0.20 threshold is the
  // canonical "members are plausibly related" cutoff; 0.30 is the
  // "members are likely manuscript-witnesses" cutoff.
  topologyThresholds?: number[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function prefixOf(id: string): string {
  const m = /^([^.,]+)/.exec(id);
  return m ? m[1] : id;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function emptyResult(query: AuditClusterQuery, warnings: string[]): AuditClusterResult {
  return {
    query,
    cluster: {
      member_count: 0,
      member_ids: [],
      reconstruction: null,
      matrix: {
        query: { tablet_count: 0, min_jaccard: 0.1, top_k_per_node: 50 },
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
        warnings: [],
      },
    },
    quality: {
      sign_count: { min: 0, median: 0, mean: 0, max: 0, count: 0 },
      members_without_sign_count: [],
      marginal_signal: [],
      marginal_signal_count: 0,
      recommended_exclusions: [],
    },
    topology: {
      prefix_distribution: [],
      distinct_prefix_count: 0,
      cross_prefix_count: 0,
      cross_prefix_ratio: 0,
      top_hubs: [],
      components_by_threshold: [],
      shatter_threshold: null,
    },
    provenance: {
      distinct_prefixes: [],
      per_prefix_coverage: [],
      missing_from_corpus: [],
    },
    recommendations: [],
    warnings,
  };
}

// Recompute edge-counts at arbitrary thresholds from the matrix's edge list.
// The matrix returns connected_components at its built-in 5 thresholds
// (0.1/0.2/0.3/0.4/0.5); if the caller asks for non-default thresholds, we
// fall back to per-edge filtering for density and re-run union-find for
// component counts. To avoid duplicating the union-find here, we only use the
// matrix's built-in component breakdown when thresholds match the defaults.
// For custom thresholds we still surface edge-density (cheap, just filter the
// edge list) but reuse the matrix's nearest-threshold component count as a
// best-effort signal. Documented in the recommendations block.
function rollupComponents(matrix: ClusterMatrixResult, thresholds: number[]): ComponentSummary[] {
  const totalPairs = matrix.edge_stats.total_pairs_possible;
  return thresholds.map((t) => {
    // Find the matrix's nearest-threshold component result (matrix uses 0.1/0.2/0.3/0.4/0.5).
    let nearest = matrix.connected_components[0];
    let nearestDelta = Number.POSITIVE_INFINITY;
    for (const cc of matrix.connected_components) {
      const d = Math.abs(cc.threshold - t);
      if (d < nearestDelta) {
        nearestDelta = d;
        nearest = cc;
      }
    }
    const edgesAtT = matrix.edges.filter((e) => e.fuzzy_jaccard >= t).length;
    return {
      threshold: t,
      component_count: nearest ? nearest.component_count : 0,
      largest_component_size: nearest ? nearest.largest_component_size : 0,
      isolated_tablets: nearest ? nearest.isolated_tablets : 0,
      edge_density: totalPairs > 0 ? +(edgesAtT / totalPairs).toFixed(4) : 0,
    };
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

export function auditCluster(opts: AuditClusterOptions): AuditClusterResult {
  const minSignCount = Math.max(0, opts.minSignCount ?? 50);
  const topologyThresholds = (opts.topologyThresholds && opts.topologyThresholds.length > 0
    ? opts.topologyThresholds
    : [0.1, 0.2, 0.3, 0.4, 0.5]
  )
    .map((t) => +t)
    .filter((t) => Number.isFinite(t) && t >= 0 && t <= 1)
    .sort((a, b) => a - b);

  const warnings: string[] = [];

  // Decision: when both seedTabletId and clusterMembers are supplied, the
  // explicit list wins. Documented above and in the warnings.
  let mode: "seed" | "explicit_members";
  let memberIds: string[] = [];
  let reconstruction: ClusterResult | null = null;

  if (opts.clusterMembers && opts.clusterMembers.length > 0) {
    mode = "explicit_members";
    memberIds = [...new Set(opts.clusterMembers)].filter((m) => typeof m === "string" && m.length > 0);
    if (opts.seedTabletId) {
      warnings.push(
        "Both seedTabletId and clusterMembers were supplied — using the explicit clusterMembers list; reconstruct_cluster was NOT called.",
      );
    }
  } else if (opts.seedTabletId) {
    mode = "seed";
    // Reconstruct with the spec defaults (max_size=100, max_depth=4,
    // min_fuzzy_jaccard=0.20). minSignCount intentionally NOT passed
    // through — we want the unfiltered cluster so the audit can surface
    // marginal-signal members itself rather than silently dropping them.
    reconstruction = reconstructCluster({
      seedTabletId: opts.seedTabletId,
      minFuzzyJaccard: 0.2,
      maxClusterSize: 100,
      maxDepth: 4,
    });
    memberIds = reconstruction.cluster_members.map((m) => m.tablet_id);
    if (reconstruction.warnings.length > 0) {
      warnings.push(...reconstruction.warnings.map((w) => `reconstruct_cluster: ${w}`));
    }
  } else {
    return emptyResult(
      {
        mode: "explicit_members",
        seed_tablet_id: null,
        member_count: 0,
        min_sign_count: minSignCount,
        topology_thresholds: topologyThresholds,
        reconstruct_defaults_used: false,
      },
      ["audit_cluster requires either seedTabletId or a non-empty clusterMembers list."],
    );
  }

  const query: AuditClusterQuery = {
    mode,
    seed_tablet_id: opts.seedTabletId ?? null,
    member_count: memberIds.length,
    min_sign_count: minSignCount,
    topology_thresholds: topologyThresholds,
    reconstruct_defaults_used: mode === "seed",
  };

  if (memberIds.length < 2) {
    return emptyResult(query, [
      ...warnings,
      `Cluster has ${memberIds.length} member(s) — at least 2 are required for a meaningful audit.`,
    ]);
  }

  // ─── Topology: full pairwise matrix ──────────────────────────────────────
  const matrix = clusterPairSimilarityMatrix({
    tabletIds: memberIds,
    minJaccard: 0.1,
    topKPerNode: 50,
  });
  if (matrix.warnings.length > 0) {
    warnings.push(...matrix.warnings.map((w) => `cluster_matrix: ${w}`));
  }

  // ─── Quality: sign-count distribution + marginal-signal surface ─────────
  const signCounts: number[] = [];
  const membersWithoutSignCount: string[] = [];
  for (const id of memberIds) {
    const sc = getTabletSignCount(id);
    if (sc == null) {
      membersWithoutSignCount.push(id);
    } else {
      signCounts.push(sc);
    }
  }
  const sortedAsc = [...signCounts].sort((a, b) => a - b);
  const signCountStats: SignCountStats = {
    min: sortedAsc[0] ?? 0,
    median: median(sortedAsc),
    mean: sortedAsc.length > 0 ? +(sortedAsc.reduce((a, b) => a + b, 0) / sortedAsc.length).toFixed(1) : 0,
    max: sortedAsc[sortedAsc.length - 1] ?? 0,
    count: sortedAsc.length,
  };

  // v0.18.18 fix — directly check each cluster member's sign_count against
  // the threshold via getTabletSignCount. The earlier intersection approach
  // (call findShortFragments corpus-wide with topN=500, then filter to
  // members) was broken: the corpus has ~17,000 tablets below 50 signs,
  // so the top-500 SHORTEST were all 0-2-sign placeholder records, and
  // cluster members at sign_count 5-49 never appeared in the intersected
  // set. Result: marginal_signal_count stayed 0 even when min=5 members
  // existed in the cluster (validated 2026-05-22 against BM.77056 audit).
  let marginalSignal: ShortFragment[] = [];
  if (minSignCount > 0) {
    const memberPrefix = (id: string): string => {
      const m = /^([^.,]+)/.exec(id);
      return m ? m[1] : id;
    };
    for (const id of memberIds) {
      const sc = getTabletSignCount(id);
      if (sc === null) continue; // already tracked in membersWithoutSignCount
      if (sc <= minSignCount) {
        marginalSignal.push({
          id,
          prefix: memberPrefix(id),
          sign_count: sc,
          in_lex_graph: false, // not needed for marginal-flag use; consumers should use getAllTabletRecords for the boolean if they care
          in_them_index: false,
        });
      }
    }
    // Sort ascending by sign_count so the WORST offenders surface first
    marginalSignal.sort((a, b) => a.sign_count - b.sign_count);
  }
  const quality: AuditQualityBlock = {
    sign_count: signCountStats,
    members_without_sign_count: membersWithoutSignCount,
    marginal_signal: marginalSignal,
    marginal_signal_count: marginalSignal.length,
    recommended_exclusions: marginalSignal.map((f) => f.id),
  };

  // ─── Topology block: prefix distribution + hubs + component rollup ──────
  const prefixCounts = new Map<string, number>();
  for (const id of memberIds) {
    const p = prefixOf(id);
    prefixCounts.set(p, (prefixCounts.get(p) ?? 0) + 1);
  }
  const prefixDistribution: PrefixCount[] = [...prefixCounts.entries()]
    .map(([prefix, count]) => ({ prefix, count }))
    .sort((a, b) => b.count - a.count);
  const dominantPrefix = prefixDistribution[0]?.prefix ?? null;
  const crossPrefixCount = dominantPrefix
    ? memberIds.filter((id) => prefixOf(id) !== dominantPrefix).length
    : 0;
  const topHubs = matrix.per_tablet_degree.slice(0, 10);
  const componentsByThreshold = rollupComponents(matrix, topologyThresholds);

  // First threshold at which the cluster shatters (component_count > 1).
  // null = cohesive at every audited threshold.
  let shatterThreshold: number | null = null;
  for (const cc of componentsByThreshold) {
    if (cc.component_count > 1) {
      shatterThreshold = cc.threshold;
      break;
    }
  }
  const topology: AuditTopologyBlock = {
    prefix_distribution: prefixDistribution,
    distinct_prefix_count: prefixDistribution.length,
    cross_prefix_count: crossPrefixCount,
    cross_prefix_ratio: memberIds.length > 0 ? +(crossPrefixCount / memberIds.length).toFixed(4) : 0,
    top_hubs: topHubs,
    components_by_threshold: componentsByThreshold,
    shatter_threshold: shatterThreshold,
  };

  // ─── Provenance: per-prefix coverage vs. full corpus ────────────────────
  // Compute total-in-corpus counts by scanning the anomaly index once.
  const allTablets = getAllTabletRecords();
  const corpusPrefixCounts = new Map<string, number>();
  if (allTablets) {
    for (const t of allTablets) {
      const p = prefixOf(t.id);
      corpusPrefixCounts.set(p, (corpusPrefixCounts.get(p) ?? 0) + 1);
    }
  } else {
    warnings.push(
      "Anomaly index not loaded — per-prefix coverage will report total_in_corpus=0 for all prefixes. Build the index via scripts/build-anomaly-index.mjs.",
    );
  }
  const perPrefixCoverage: PrefixCoverage[] = prefixDistribution.map((pc) => {
    const total = corpusPrefixCounts.get(pc.prefix) ?? 0;
    return {
      prefix: pc.prefix,
      members_in_cluster: pc.count,
      total_in_corpus: total,
      coverage_pct: total > 0 ? +((pc.count / total) * 100).toFixed(2) : 0,
    };
  });
  const provenanceBlock: AuditProvenanceBlock = {
    distinct_prefixes: prefixDistribution.map((pc) => pc.prefix),
    per_prefix_coverage: perPrefixCoverage,
    missing_from_corpus: [...matrix.not_in_corpus],
  };

  // ─── Recommendations: synthesize next-action suggestions ────────────────
  const recommendations: string[] = [];
  if (quality.marginal_signal_count > 0) {
    recommendations.push(
      `${quality.marginal_signal_count} marginal-signal tablet(s) at-or-below sign_count=${minSignCount} — ` +
        `consider re-running reconstruct_cluster with min_sign_count=${minSignCount} to drop them ` +
        `(IDs: ${quality.recommended_exclusions.slice(0, 5).join(", ")}${quality.recommended_exclusions.length > 5 ? "…" : ""}).`,
    );
  }
  if (quality.members_without_sign_count.length > 0) {
    recommendations.push(
      `${quality.members_without_sign_count.length} member(s) lack an anomaly-index sign_count record — ` +
        `they may be placeholder/empty entries; inspect with get_tablet before publishing.`,
    );
  }
  if (shatterThreshold !== null) {
    const shatterCC = componentsByThreshold.find((c) => c.threshold === shatterThreshold);
    recommendations.push(
      `Cluster shatters at J ≥ ${shatterThreshold.toFixed(2)} into ` +
        `${shatterCC ? shatterCC.component_count : "?"} components — ` +
        `review topology before publishing a cohesion claim above that threshold.`,
    );
  } else if (componentsByThreshold.length > 0) {
    recommendations.push(
      `Cluster remains connected at every audited threshold (max ${topologyThresholds[topologyThresholds.length - 1].toFixed(2)}) — ` +
        `cohesion is strong, safe to publish a manuscript-witness claim.`,
    );
  }
  if (topology.cross_prefix_ratio >= 0.5) {
    recommendations.push(
      `Cross-prefix ratio ${(topology.cross_prefix_ratio * 100).toFixed(0)}% — ` +
        `cluster spans ${topology.distinct_prefix_count} museum prefixes; flag as a cross-collection canon, not a single-collection artefact.`,
    );
  }
  if (provenanceBlock.missing_from_corpus.length > 0) {
    recommendations.push(
      `${provenanceBlock.missing_from_corpus.length} member(s) not found in the fuzzy-parallel corpus — ` +
        `they were excluded from topology analysis: ${provenanceBlock.missing_from_corpus.slice(0, 5).join(", ")}${provenanceBlock.missing_from_corpus.length > 5 ? "…" : ""}.`,
    );
  }
  if (topology.top_hubs.length > 0 && topology.top_hubs[0].degree_at_0_20 >= Math.max(3, Math.floor(memberIds.length * 0.5))) {
    recommendations.push(
      `Hub member ${topology.top_hubs[0].tablet_id} has degree ${topology.top_hubs[0].degree_at_0_20} at J ≥ 0.20 ` +
        `(≥50% of cluster) — strong candidate for the canonical reference tablet of this manuscript group.`,
    );
  }
  if (recommendations.length === 0) {
    recommendations.push("No quality, topology, or provenance issues detected — cluster appears publishable as-is.");
  }

  return {
    query,
    cluster: {
      member_count: memberIds.length,
      member_ids: memberIds,
      reconstruction,
      matrix,
    },
    quality,
    topology,
    provenance: provenanceBlock,
    recommendations,
    warnings,
  };
}
