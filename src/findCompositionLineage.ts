// v0.35.0 — find_composition_lineage.
//
// Compose v0.20 chunk index + v0.32 composition registry + fragment metadata
// (period + provenance) to trace a composition's transmission across periods
// and ateliers. For a composition (resolved via composition_id or via
// identify_composition top candidate), enumerate witnesses by BFS-expanding
// from registry exemplars via shared length-20 chunks, bucket each witness
// by (period × provenance), and emit:
//
//   - transmission_nodes: (period, provenance) buckets with members + sign-counts
//   - transmission_edges: chunk-share count between adjacent (P,Pr) buckets
//   - bridge_witnesses: tablets whose chunks straddle period boundaries
//   - diffusion_summary: counts + cross-boundary indicators
//
// Heavy lifting is delegated: v0.22's BFS+chunk-overlap engine is reused
// via `buildCanonicalRecensionTree`'s witness list (the cluster object
// already carries period + provenance per witness).

import {
  COMPOSITION_REGISTRY,
  getCompositionById,
  type CompositionEntry,
} from "./compositionRegistry.js";
import {
  buildCanonicalRecensionTree,
  type RecensionWitness,
} from "./recensionTree.js";
import { getChunksContaining, loadChunkIndex } from "./chunkIndex.js";
import { identifyComposition } from "./identifyComposition.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

// ─── Period ordering ───────────────────────────────────────────────────────

const PERIOD_RANK: Record<string, number> = {
  "Old Babylonian": 1, "OB": 1,
  "Middle Babylonian": 2, "MB": 2,
  "Middle Assyrian": 3, "MA": 3,
  "Neo-Assyrian": 4, "NA": 4,
  "Neo-Babylonian": 5, "NB": 5,
  "Late Babylonian": 6, "LB": 6,
  "Hellenistic": 7, "Achaemenid": 6,
};

function periodRank(period: string | null): number {
  if (!period) return 999;
  if (period in PERIOD_RANK) return PERIOD_RANK[period];
  for (const k of Object.keys(PERIOD_RANK)) {
    if (period.includes(k)) return PERIOD_RANK[k];
  }
  return 999;
}

// ─── Public types ──────────────────────────────────────────────────────────

export type LineageWitness = {
  tablet_id: string;
  period: string | null;
  period_rank: number;
  provenance: string | null;
  sign_count: number | null;
  shared_chunks_with_seed: number;
  host_chunks_total: number;
  is_registry_exemplar: boolean;
};

export type TransmissionNode = {
  node_id: string;            // "{period}|{provenance}"
  period: string | null;
  period_rank: number;
  provenance: string | null;
  member_tablets: string[];
  total_sign_count: number;
  total_host_chunks: number;
};

export type TransmissionEdge = {
  from_node_id: string;
  to_node_id: string;
  shared_chunks: number;
  bridge_witness_ids: string[];   // members of EITHER side that host shared chunks
};

export type BridgeWitness = {
  tablet_id: string;
  spans_n_nodes: number;
  node_ids: string[];
  chunks_in_each_node: number[];
};

export type CompositionResolutionResult = {
  source: "explicit" | "inferred" | "unresolved";
  composition_id: string | null;
  composition_name: string | null;
  inferred_confidence: number | null;
};

export type FindCompositionLineageResult = {
  query: {
    composition_id: string | null;
    seed_tablet_id: string;
    max_witnesses: number;
  };
  composition: CompositionResolutionResult;
  witnesses: LineageWitness[];
  transmission_nodes: TransmissionNode[];
  transmission_edges: TransmissionEdge[];
  bridge_witnesses: BridgeWitness[];
  diffusion_summary: {
    n_witnesses: number;
    n_distinct_periods: number;
    n_distinct_provenances: number;
    n_nodes: number;
    n_edges: number;
    n_cross_period_edges: number;
    n_cross_provenance_edges: number;
    n_bridge_witnesses: number;
    earliest_period: string | null;
    latest_period: string | null;
  };
  warnings: string[];
};

export type FindCompositionLineageOptions = {
  compositionId?: string;
  seedTabletId?: string;
  maxWitnesses?: number;
  minPairwiseChunks?: number;
  minEdgeChunks?: number;
  fallbackMinConfidence?: number;
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function nodeIdOf(period: string | null, provenance: string | null): string {
  return `${period ?? "(period?)"}|${provenance ?? "(prov?)"}`;
}

function chunkHashSetFor(tabletId: string): Set<string> {
  const out = new Set<string>();
  for (const c of getChunksContaining(tabletId)) out.add(c.hash);
  return out;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export function findCompositionLineage(
  opts: FindCompositionLineageOptions,
): FindCompositionLineageResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const maxWitnesses = Math.max(2, Math.min(200, opts.maxWitnesses ?? 50));
  const minPairwiseChunks = Math.max(1, opts.minPairwiseChunks ?? 3);
  const minEdgeChunks = Math.max(1, opts.minEdgeChunks ?? 5);
  const fallbackMin = opts.fallbackMinConfidence ?? 0.3;

  const chunkLoaded = loadChunkIndex() !== null;
  if (!chunkLoaded) warnings.push("chunk index not loaded; lineage trace disabled");

  // ─── Resolve composition + seed ─────────────────────────────────────────
  let entry: CompositionEntry | null = null;
  let compResolution: CompositionResolutionResult;
  let effectiveSeed: string | null = null;

  if (opts.compositionId) {
    entry = getCompositionById(opts.compositionId);
    if (!entry) {
      compResolution = {
        source: "unresolved",
        composition_id: opts.compositionId,
        composition_name: null,
        inferred_confidence: null,
      };
      warnings.push(`composition_id "${opts.compositionId}" not in registry of ${COMPOSITION_REGISTRY.length} compositions`);
    } else {
      compResolution = {
        source: "explicit",
        composition_id: entry.id,
        composition_name: entry.name,
        inferred_confidence: null,
      };
      effectiveSeed = opts.seedTabletId || entry.exemplar_tablets[0] || null;
    }
  } else if (opts.seedTabletId) {
    const ident = identifyComposition({ tabletId: opts.seedTabletId, topK: 3 });
    const top = ident.candidates[0];
    if (!top) {
      compResolution = {
        source: "unresolved",
        composition_id: null,
        composition_name: null,
        inferred_confidence: null,
      };
      warnings.push("identify_composition returned no candidates for seed");
    } else if (top.confidence < fallbackMin) {
      compResolution = {
        source: "unresolved",
        composition_id: top.composition_id,
        composition_name: top.composition_name,
        inferred_confidence: top.confidence,
      };
      warnings.push(`top candidate confidence ${top.confidence.toFixed(3)} below fallback_min ${fallbackMin}; pass composition_id explicitly to override`);
    } else {
      entry = getCompositionById(top.composition_id);
      compResolution = {
        source: "inferred",
        composition_id: top.composition_id,
        composition_name: top.composition_name,
        inferred_confidence: top.confidence,
      };
      effectiveSeed = opts.seedTabletId;
    }
  } else {
    compResolution = {
      source: "unresolved",
      composition_id: null,
      composition_name: null,
      inferred_confidence: null,
    };
    warnings.push("either composition_id or seed_tablet_id must be provided");
  }

  if (!entry || !chunkLoaded || !effectiveSeed) {
    return {
      query: {
        composition_id: opts.compositionId ?? null,
        seed_tablet_id: opts.seedTabletId ?? "",
        max_witnesses: maxWitnesses,
      },
      composition: compResolution,
      witnesses: [],
      transmission_nodes: [],
      transmission_edges: [],
      bridge_witnesses: [],
      diffusion_summary: {
        n_witnesses: 0,
        n_distinct_periods: 0,
        n_distinct_provenances: 0,
        n_nodes: 0,
        n_edges: 0,
        n_cross_period_edges: 0,
        n_cross_provenance_edges: 0,
        n_bridge_witnesses: 0,
        earliest_period: null,
        latest_period: null,
      },
      warnings,
    };
  }

  // ─── BFS witness expansion (delegate to v0.22) ──────────────────────────
  const exemplarSet = new Set(entry.exemplar_tablets);
  const tree = buildCanonicalRecensionTree({
    seedTabletId: effectiveSeed,
    maxWitnesses,
    minPairwiseChunks,
    algorithm: "neighbor_joining",
  });
  if (tree.warnings.length > 0) warnings.push(...tree.warnings);

  const witnesses: LineageWitness[] = tree.witnesses.map((w: RecensionWitness) => ({
    tablet_id: w.tablet_id,
    period: w.period,
    period_rank: periodRank(w.period),
    provenance: w.provenance,
    sign_count: w.sign_count,
    shared_chunks_with_seed: w.shared_chunks_with_seed,
    host_chunks_total: w.host_chunks_total,
    is_registry_exemplar: exemplarSet.has(w.tablet_id),
  }));

  // ─── Bucket by (period, provenance) ─────────────────────────────────────
  const nodeMap = new Map<string, TransmissionNode>();
  for (const w of witnesses) {
    const nid = nodeIdOf(w.period, w.provenance);
    let node = nodeMap.get(nid);
    if (!node) {
      node = {
        node_id: nid,
        period: w.period,
        period_rank: w.period_rank,
        provenance: w.provenance,
        member_tablets: [],
        total_sign_count: 0,
        total_host_chunks: 0,
      };
      nodeMap.set(nid, node);
    }
    node.member_tablets.push(w.tablet_id);
    node.total_sign_count += w.sign_count ?? 0;
    node.total_host_chunks += w.host_chunks_total;
  }

  const transmission_nodes = Array.from(nodeMap.values()).sort(
    (a, b) =>
      a.period_rank - b.period_rank ||
      (a.provenance ?? "").localeCompare(b.provenance ?? ""),
  );

  // ─── Build per-witness chunk sets for edges + bridges ───────────────────
  const witnessChunkSets = new Map<string, Set<string>>();
  for (const w of witnesses) {
    witnessChunkSets.set(w.tablet_id, chunkHashSetFor(w.tablet_id));
  }

  // Node-level chunk-host index (union of members' chunks).
  const nodeChunkSets = new Map<string, Set<string>>();
  for (const node of transmission_nodes) {
    const union = new Set<string>();
    for (const t of node.member_tablets) {
      const cs = witnessChunkSets.get(t);
      if (cs) for (const h of cs) union.add(h);
    }
    nodeChunkSets.set(node.node_id, union);
  }

  // ─── Transmission edges between nodes ───────────────────────────────────
  const transmission_edges: TransmissionEdge[] = [];
  for (let i = 0; i < transmission_nodes.length; i++) {
    for (let j = i + 1; j < transmission_nodes.length; j++) {
      const a = transmission_nodes[i];
      const b = transmission_nodes[j];
      const aSet = nodeChunkSets.get(a.node_id)!;
      const bSet = nodeChunkSets.get(b.node_id)!;
      let shared = 0;
      const sharedHashes = new Set<string>();
      for (const h of aSet) {
        if (bSet.has(h)) {
          shared++;
          sharedHashes.add(h);
        }
      }
      if (shared < minEdgeChunks) continue;
      // Bridge witnesses: members of either side whose chunks intersect with sharedHashes.
      const bridgeIds: string[] = [];
      for (const t of [...a.member_tablets, ...b.member_tablets]) {
        const cs = witnessChunkSets.get(t);
        if (!cs) continue;
        for (const h of cs) {
          if (sharedHashes.has(h)) {
            bridgeIds.push(t);
            break;
          }
        }
      }
      transmission_edges.push({
        from_node_id: a.node_id,
        to_node_id: b.node_id,
        shared_chunks: shared,
        bridge_witness_ids: Array.from(new Set(bridgeIds)),
      });
    }
  }

  // ─── Bridge witnesses: tablets whose chunks appear in ≥2 nodes ──────────
  const bridge_witnesses: BridgeWitness[] = [];
  for (const w of witnesses) {
    const wChunks = witnessChunkSets.get(w.tablet_id)!;
    const counts: Array<{ node_id: string; n: number }> = [];
    for (const node of transmission_nodes) {
      // Don't count the witness's own node.
      if (node.member_tablets.includes(w.tablet_id)) continue;
      const nSet = nodeChunkSets.get(node.node_id)!;
      let n = 0;
      for (const h of wChunks) if (nSet.has(h)) n++;
      if (n > 0) counts.push({ node_id: node.node_id, n });
    }
    if (counts.length >= 2) {
      counts.sort((a, b) => b.n - a.n);
      bridge_witnesses.push({
        tablet_id: w.tablet_id,
        spans_n_nodes: counts.length,
        node_ids: counts.map((c) => c.node_id),
        chunks_in_each_node: counts.map((c) => c.n),
      });
    }
  }
  bridge_witnesses.sort((a, b) => b.spans_n_nodes - a.spans_n_nodes);

  // ─── Summary ────────────────────────────────────────────────────────────
  const distinctPeriods = new Set<string | null>();
  const distinctProvenances = new Set<string | null>();
  for (const w of witnesses) {
    distinctPeriods.add(w.period);
    distinctProvenances.add(w.provenance);
  }
  let nCrossPeriod = 0;
  let nCrossProv = 0;
  for (const e of transmission_edges) {
    const a = nodeMap.get(e.from_node_id)!;
    const b = nodeMap.get(e.to_node_id)!;
    if (a.period !== b.period) nCrossPeriod++;
    if (a.provenance !== b.provenance) nCrossProv++;
  }
  const withPeriod = witnesses.filter((w) => w.period_rank < 999);
  let earliest: string | null = null;
  let latest: string | null = null;
  if (withPeriod.length > 0) {
    const sorted = withPeriod.slice().sort((a, b) => a.period_rank - b.period_rank);
    earliest = sorted[0].period;
    latest = sorted[sorted.length - 1].period;
  }

  return {
    query: {
      composition_id: compResolution.composition_id,
      seed_tablet_id: effectiveSeed,
      max_witnesses: maxWitnesses,
    },
    composition: compResolution,
    witnesses,
    transmission_nodes,
    transmission_edges,
    bridge_witnesses,
    diffusion_summary: {
      n_witnesses: witnesses.length,
      n_distinct_periods: distinctPeriods.size,
      n_distinct_provenances: distinctProvenances.size,
      n_nodes: transmission_nodes.length,
      n_edges: transmission_edges.length,
      n_cross_period_edges: nCrossPeriod,
      n_cross_provenance_edges: nCrossProv,
      n_bridge_witnesses: bridge_witnesses.length,
      earliest_period: earliest,
      latest_period: latest,
    },
    warnings,
  };
}
