// v0.48.0 — find_provenance_clusters.
//
// Panel-review Patel ask (§3.29): cluster tablets by ancient find-spot
// (not modern museum collection). With v0.45's collection-fallback, every
// metadata-present tablet now has a populated ancient_find_spot string —
// this tool groups them.
//
// Output: provenance clusters sorted by tablet count, each cluster with:
//   - cluster_id (the find-spot string)
//   - n_tablets, top tablets sample
//   - period distribution within the cluster
//   - collection-prefix distribution (K.*, BM.*, Sm.*, ...)
//   - shows when a single find-spot spans multiple museum prefixes
//     (the panel's "find-spot ≠ collection" thesis empirically)

import {
  loadAllMetadata,
  getAncientFindSpot,
  getPeriod,
} from "./fragmentMetadata.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

export type ProvenanceCluster = {
  cluster_id: string;
  n_tablets: number;
  top_tablets: string[];
  period_distribution: Array<{ period: string; count: number }>;
  collection_prefix_distribution: Array<{ prefix: string; count: number }>;
  spans_multiple_prefixes: boolean;
};

export type FindProvenanceClustersResult = {
  query: {
    site_filter: string | null;
    min_tablets: number;
    include_null_provenance: boolean;
    top_k_per_cluster: number;
  };
  clusters: ProvenanceCluster[];
  n_clusters: number;
  n_tablets_total: number;
  n_tablets_with_provenance: number;
  n_tablets_null_provenance: number;
  warnings: string[];
};

export type FindProvenanceClustersOptions = {
  siteFilter?: string;
  minTablets?: number;
  includeNullProvenance?: boolean;
  topKPerCluster?: number;
  topKClusters?: number;
};

function prefixOf(tabletId: string): string {
  const m = /^([^.,0-9]+)/.exec(tabletId);
  return m ? m[1] : "?";
}

export function findProvenanceClusters(
  opts: FindProvenanceClustersOptions = {},
): FindProvenanceClustersResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const minTablets = Math.max(1, opts.minTablets ?? 5);
  const includeNull = opts.includeNullProvenance ?? false;
  const topKPerCluster = Math.max(1, Math.min(200, opts.topKPerCluster ?? 20));
  const topKClusters = Math.max(1, Math.min(500, opts.topKClusters ?? 50));
  const siteFilter = opts.siteFilter?.trim() ?? null;

  const cache = loadAllMetadata();
  if (!cache || Object.keys(cache).length === 0) {
    warnings.push("fragment-metadata cache not loaded");
    return {
      query: {
        site_filter: siteFilter,
        min_tablets: minTablets,
        include_null_provenance: includeNull,
        top_k_per_cluster: topKPerCluster,
      },
      clusters: [],
      n_clusters: 0,
      n_tablets_total: 0,
      n_tablets_with_provenance: 0,
      n_tablets_null_provenance: 0,
      warnings,
    };
  }

  // Bucket tablets by find-spot.
  type Bucket = {
    tablets: string[];
    periodCounts: Map<string, number>;
    prefixCounts: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();
  let nTotal = 0;
  let nWithProv = 0;
  let nNullProv = 0;

  for (const [tabletId, meta] of Object.entries(cache)) {
    if (!meta) continue;
    nTotal++;
    const findSpot = getAncientFindSpot(meta);
    if (!findSpot) {
      nNullProv++;
      if (!includeNull) continue;
    } else {
      nWithProv++;
    }
    const clusterId = findSpot ?? "(unknown)";
    if (siteFilter && clusterId !== siteFilter) continue;
    let bucket = buckets.get(clusterId);
    if (!bucket) {
      bucket = { tablets: [], periodCounts: new Map(), prefixCounts: new Map() };
      buckets.set(clusterId, bucket);
    }
    bucket.tablets.push(tabletId);
    const period = getPeriod(meta);
    if (period) bucket.periodCounts.set(period, (bucket.periodCounts.get(period) ?? 0) + 1);
    const prefix = prefixOf(tabletId);
    bucket.prefixCounts.set(prefix, (bucket.prefixCounts.get(prefix) ?? 0) + 1);
  }

  const clusters: ProvenanceCluster[] = [];
  for (const [clusterId, bucket] of buckets) {
    if (bucket.tablets.length < minTablets) continue;
    const periodDist = Array.from(bucket.periodCounts.entries())
      .map(([period, count]) => ({ period, count }))
      .sort((a, b) => b.count - a.count);
    const prefixDist = Array.from(bucket.prefixCounts.entries())
      .map(([prefix, count]) => ({ prefix, count }))
      .sort((a, b) => b.count - a.count);
    clusters.push({
      cluster_id: clusterId,
      n_tablets: bucket.tablets.length,
      top_tablets: bucket.tablets.slice(0, topKPerCluster),
      period_distribution: periodDist,
      collection_prefix_distribution: prefixDist,
      spans_multiple_prefixes: prefixDist.length > 1,
    });
  }
  clusters.sort(
    (a, b) => b.n_tablets - a.n_tablets || a.cluster_id.localeCompare(b.cluster_id),
  );
  const limited = clusters.slice(0, topKClusters);

  return {
    query: {
      site_filter: siteFilter,
      min_tablets: minTablets,
      include_null_provenance: includeNull,
      top_k_per_cluster: topKPerCluster,
    },
    clusters: limited,
    n_clusters: clusters.length,
    n_tablets_total: nTotal,
    n_tablets_with_provenance: nWithProv,
    n_tablets_null_provenance: nNullProv,
    warnings,
  };
}
