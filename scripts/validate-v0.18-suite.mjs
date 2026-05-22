#!/usr/bin/env node
// v0.18 suite validation — imports compiled modules directly + tests new tools
// against real data without needing the MCP transport layer. Confirms that
// v0.18.4 through v0.18.15 tools actually work end-to-end against the
// production anomaly-index + fuzzy-parallels cache + scribal-fingerprint cache.

import { listCollectionPrefixes, collectionCoverage, findShortFragments } from "../dist/collectionCoverage.js";
import { corpusHealthReport } from "../dist/corpusHealth.js";
import { reconstructCluster } from "../dist/reconstructCluster.js";
import { clusterPairSimilarityMatrix } from "../dist/clusterMatrix.js";
import { findStrongestFuzzyPairs } from "../dist/strongestFuzzyPairs.js";
import { findScribalGroups } from "../dist/scribalGroups.js";
import { compareTabletPair } from "../dist/comparePair.js";
import { findTabletNeighborhood } from "../dist/tabletNeighborhood.js";
import { auditCluster } from "../dist/auditCluster.js";
import { compareClusters } from "../dist/compareClusters.js";
import { metadataCoverage } from "../dist/fragmentMetadata.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(JSON.stringify(data, null, 2).slice(0, 3000));
};

// ─── Test 1: corpus_health_report (v0.18.11) ─────────────────────────────
console.log("\n┌─ TEST 1: corpus_health_report ─┐");
const health = corpusHealthReport({});
log("Corpus totals", health.corpus_totals);
log("Prefix summary", {
  distinct_prefix_count: health.prefix_summary.distinct_prefix_count,
  top_10: health.prefix_summary.top_10_by_tablet_count.slice(0, 10),
});
console.log(`Bi-orphans estimate: ${health.bi_orphans_estimate.approximate_count} [${health.bi_orphans_estimate.source}]`);
console.log(`Short fragments (<50 signs): ${health.short_fragments.count.toLocaleString()} (${health.short_fragments.percent_of_corpus}%)`);

// ─── Test 2: list_collection_prefixes (v0.18.5) ──────────────────────────
console.log("\n┌─ TEST 2: list_collection_prefixes ─┐");
const prefixes = listCollectionPrefixes({ minTabletCount: 10, topN: 15 });
log("Top 15 prefixes by tablet count", prefixes.prefixes);
console.log(`Total distinct prefixes in corpus: ${prefixes.totals.distinct_prefixes}`);
console.log(`Prefixes filtered out (< 10 tablets): ${prefixes.totals.prefixes_filtered_out_by_min_count}`);

// ─── Test 3: find_short_fragments (v0.18.6) — NZK validation ─────────────
console.log("\n┌─ TEST 3: find_short_fragments — NZK validation ─┐");
const nzkShorts = findShortFragments({ maxSignCount: 10, prefixFilter: ["NZK"], topN: 20 });
log("NZK.set.* tablets with sign_count ≤ 10", {
  total_below_threshold: nzkShorts.totals.total_below_threshold,
  prefix_distribution_below_threshold: nzkShorts.totals.prefix_distribution_below_threshold,
  fragments: nzkShorts.fragments.map((f) => ({ id: f.id, sign_count: f.sign_count })),
});

// ─── Test 4: reconstruct_cluster with min_sign_count filter (v0.18.4) ────
console.log("\n┌─ TEST 4: BM.77056 cluster reconstruction + min_sign_count=50 filter ─┐");
const cluster = reconstructCluster({
  seedTabletId: "BM.77056",
  maxClusterSize: 100,
  maxDepth: 4,
  minFuzzyJaccard: 0.20,
  minSignCount: 50,
});
log("Cluster overview", {
  cluster_size: cluster.cluster_size,
  termination_reason: cluster.termination_reason,
  cross_prefix_count: cluster.cross_prefix_count,
  prefix_distribution: cluster.prefix_distribution,
  config: cluster.config,
  index_stats: cluster.index_stats,
});
const nzkInCluster = cluster.cluster_members.filter((m) => m.tablet_id.startsWith("NZK"));
console.log(`NZK members in filtered cluster: ${nzkInCluster.length} (expected: 0 — filter should drop them)`);

// ─── Test 5: cluster_pair_similarity_matrix (v0.18.7) ────────────────────
console.log("\n┌─ TEST 5: cluster_pair_similarity_matrix on BM.77056 cluster (30-member subset) ─┐");
const memberIds = cluster.cluster_members.slice(0, 30).map((m) => m.tablet_id);
const matrix = clusterPairSimilarityMatrix({
  tabletIds: memberIds,
  minJaccard: 0.20,
  topKPerNode: 30,
});
log("Matrix summary", {
  edges_above_threshold: matrix.edge_stats.edges_above_threshold,
  density: matrix.edge_stats.density,
  weight_mean: matrix.edge_stats.weight_mean,
  weight_max: matrix.edge_stats.weight_max,
});
log("Top hubs by degree at J≥0.20", matrix.per_tablet_degree.slice(0, 5));
log("Connected components by threshold", matrix.connected_components);

// ─── Test 6: compare_tablet_pair on BM.34970 quartet (v0.18.8) ───────────
console.log("\n┌─ TEST 6: compare_tablet_pair — BM.34970 ↔ 1881,0204.471 (the §3.4.1 quartet leader) ─┐");
const pairVerdict = compareTabletPair({
  tabletA: "BM.34970",
  tabletB: "1881,0204.471",
});
log("Cross-axis verdict", {
  primary_relationship: pairVerdict.verdict.primary_relationship,
  confidence: pairVerdict.verdict.confidence,
  evidence: pairVerdict.verdict.evidence,
});
log("Lexical axis", pairVerdict.axes.lexical);
log("Fuzzy axis", pairVerdict.axes.fuzzy);
log("Scribal axis", pairVerdict.axes.scribal);
log("Thematic axis", pairVerdict.axes.thematic);

// ─── Test 7: find_tablet_neighborhood for K.2798 (v0.18.12) ──────────────
console.log("\n┌─ TEST 7: find_tablet_neighborhood — K.2798 (methods-paper §1 anchor) ─┐");
const neighborhood = findTabletNeighborhood({ tabletId: "K.2798", topKPerAxis: 5 });
log("K.2798 tablet info", neighborhood.tablet);
console.log(`Fuzzy parallels (${neighborhood.axes.fuzzy_parallels.length}):`);
for (const p of neighborhood.axes.fuzzy_parallels) console.log(`  ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}`);
console.log(`Thematic neighbors (${neighborhood.axes.thematic_neighbors.length}):`);
for (const n of neighborhood.axes.thematic_neighbors) console.log(`  ${n.tablet_id}  cos=${n.thematic_cosine}`);
console.log(`Scribal candidates (${neighborhood.axes.scribal_candidates.length}):`);
for (const c of neighborhood.axes.scribal_candidates) console.log(`  ${c.tablet_id}  sig_cos=${c.signature_cosine}`);
console.log("Cross-axis multiplicity:", neighborhood.cross_axis_summary.counts_by_axis_multiplicity);
console.log("Recommendations:");
for (const r of neighborhood.recommendations) console.log(`  • ${r}`);

// ─── Test 8: audit_cluster on BM.77056 (v0.18.10) ────────────────────────
console.log("\n┌─ TEST 8: audit_cluster on BM.77056 (composite diagnostic) ─┐");
const audit = auditCluster({
  seedTabletId: "BM.77056",
  minSignCount: 50,
});
log("Audit summary", {
  cluster_member_count: audit.cluster.member_count,
  quality_sign_count: audit.quality.sign_count,
  marginal_signal_count: audit.quality.marginal_signal_count,
  recommended_exclusions: audit.quality.recommended_exclusions.slice(0, 5),
});
log("Topology", {
  distinct_prefix_count: audit.topology.distinct_prefix_count,
  cross_prefix_ratio: audit.topology.cross_prefix_ratio,
  shatter_threshold: audit.topology.shatter_threshold,
});
console.log("Recommendations:");
for (const r of audit.recommendations) console.log(`  • ${r}`);

// ─── Test 9: compare_clusters — BM.77056 vs K.15325 (v0.18.11) ───────────
console.log("\n┌─ TEST 9: compare_clusters — BM.77056 vs K.15325 (āšipūtu vs Mīs pî hub) ─┐");
const comparison = compareClusters({
  clusterASeed: "BM.77056",
  clusterBSeed: "K.15325",
  maxClusterSize: 100,
  maxDepth: 4,
  minFuzzyJaccard: 0.20,
});
log("Comparison", {
  cluster_a_size: comparison.cluster_a.member_count,
  cluster_b_size: comparison.cluster_b.member_count,
  shared_count: comparison.comparison.shared_count,
  jaccard: comparison.comparison.jaccard,
  relationship: comparison.comparison.relationship,
});
log("Union analysis", comparison.union_analysis);
console.log("Recommendations:");
for (const r of comparison.recommendations) console.log(`  • ${r}`);

// ─── Test 10: metadataCoverage (v0.18.13) — baseline before enrichment ───
console.log("\n┌─ TEST 10: fragment_metadata_coverage baseline ─┐");
const coverage = metadataCoverage();
log("Metadata coverage", coverage);
console.log(`\nCorpus-wide coverage: ${coverage.total_with_metadata} / 36,476 = ${((coverage.total_with_metadata / 36476) * 100).toFixed(2)}%`);

// ─── Test 11: find_strongest_fuzzy_pairs in Sm (v0.18.11) ────────────────
console.log("\n┌─ TEST 11: find_strongest_fuzzy_pairs_in_prefix — Sm, top 10 ─┐");
const fuzzyPairs = findStrongestFuzzyPairs({
  prefixFilter: "Sm",
  minFuzzyJaccard: 0.30,
  minSignCount: 50,
  maxTabletsToScan: 200,
  topKPerTablet: 10,
  topNPairs: 10,
});
log("Sm prefix top fuzzy pairs", {
  total_pairs_collected: fuzzyPairs.summary.total_pairs_collected,
  tablets_scanned: fuzzyPairs.summary.tablets_scanned,
  reciprocal_pair_count: fuzzyPairs.summary.reciprocal_pair_count,
  pairs: fuzzyPairs.pairs.map((p) => ({ a: p.tablet_a, b: p.tablet_b, fuzzy_j: p.fuzzy_jaccard, reciprocal: p.is_reciprocal })),
});

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ v0.18 suite validation complete — all 11 tests executed against live data.");
console.log("══════════════════════════════════════════════════════════════════════\n");
