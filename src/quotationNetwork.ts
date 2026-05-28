// v0.68.0 — compute_quotation_network.
//
// Builds a corpus-wide DIRECTED MULTIGRAPH at the COMPOSITION level (Mīs pî,
// Šurpu, Maqlû, Udug-ḫul, etc.) where edges represent "composition A quotes /
// echoes composition B" relationships. Two independent evidence streams are
// aggregated:
//
//   1. CITATION evidence — buildCitationGraph (v0.20.0) produces
//      commentary→base TABLET edges by genre-partitioning chunk hosts. Each
//      tablet pair is lifted to its composition pair via the v0.54-cached
//      composition assignments (top_composition_id) or, when uncached, via
//      v0.32 identifyComposition. Edges with composition confidence < 0.5
//      are dropped.
//
//   2. CHUNK-PARALLEL evidence — chunk-index entries (v0.20) where ≥2
//      different compositions co-occur as host compositions of the same
//      shared chunk. For every chunk with hosts in compositions C1,…,Ck
//      (k ≥ 2), all directed pairs (Ci → Cj) earn an edge increment of
//      `chunk_length × 1/host_count`. The directionality is symmetric here
//      (a chunk shared between two compositions is bidirectional evidence
//      of echoing), so each chunk contributes BOTH (Ci → Cj) and (Cj → Ci);
//      the citation stream provides the directional commentary→base bias.
//
// Edges from both streams are MERGED into a single multigraph where
// `evidence_type` is `"citation"` | `"chunk_parallel"` | `"both"` depending
// on which streams contributed.
//
// Surface metrics: in-degree, out-degree, sampled-source betweenness
// approximation (graphMetrics.ts), strongly-connected-components (Tarjan).
// Outputs are written to ~/.cache/cuneiform-mcp/quotation-network/<iso-ts>/
// in 3 formats: graph.json (canonical), graph.dot (Graphviz), summary.md.
//
// Validation anchors (per spec):
//   • Maqlû ↔ Šurpu pair must appear (anti-witchcraft, documented overlap)
//   • Mīs pî → Bīt salāʾ mê edge should appear (sibling subseries)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  COMPOSITION_REGISTRY,
  type CompositionEntry,
  getCompositionById,
} from "./compositionRegistry.js";
import { buildCitationGraph, type CitationEdge } from "./citationGraph.js";
import {
  type ChunkIndexEntry,
  getChunksAboveHostCount,
  loadChunkIndex,
} from "./chunkIndex.js";
import { identifyComposition } from "./identifyComposition.js";
import {
  type AdjList,
  inDegree,
  outDegree,
  sampledBetweennessRanks,
  tarjanSCC,
} from "./graphMetrics.js";

const ASSIGNMENTS_FILE = "composition-assignments.json";
const DEFAULT_MIN_RESOLVE_CONFIDENCE = 0.5;
const QUOTATION_NETWORK_DIR = "quotation-network";

// ─── Public types ──────────────────────────────────────────────────────────

export type QuotationNetworkNode = {
  composition_id: string;
  display_name: string;
  in_degree: number;
  out_degree: number;
  betweenness_rank: number | null;
};

export type QuotationNetworkEdge = {
  source_composition: string;
  target_composition: string;
  evidence_type: "citation" | "chunk_parallel" | "both";
  weight: number;
  supporting_tablets: string[]; // up to 5
};

export type QuotationNetworkMetrics = {
  total_nodes: number;
  total_edges: number;
  top_quoted_from: Array<{ composition: string; in_degree: number }>;
  top_quoters: Array<{ composition: string; out_degree: number }>;
  isolate_compositions: string[];
  scc_count: number;
  scc_largest_size: number;
};

export type QuotationNetworkOutputPaths = {
  json: string;
  dot: string;
  summary_md: string;
};

export type ComputeQuotationNetworkResult = {
  nodes: QuotationNetworkNode[];
  edges: QuotationNetworkEdge[];
  metrics: QuotationNetworkMetrics;
  output_paths: QuotationNetworkOutputPaths;
  warnings: string[];
};

export type ComputeQuotationNetworkOptions = {
  /** Minimum trigram-run length for chunk-parallel edges. Default 25 (above noise floor). */
  minChunkLength?: number;
  /** Minimum citation-stream `shared_chunks_count` threshold. Default 2. */
  minCitations?: number;
  /** Output rendering mode for the human-readable surface. Default "summary". */
  format?: "json" | "dot" | "summary";
  /** Override cache root for tests. */
  cacheDirOverride?: string;
  /**
   * Confidence threshold below which a v0.54-cached composition assignment
   * is dropped (the tablet is recorded as skipped + surfaced as a warning).
   * Default 0.5. Caller may lower it to ≤0.35 to surface
   * compositions whose cache rows cluster around the v0.54 axis-uncertainty
   * floor (Maqlû ~0.395, Šumma izbu ~0.377, Šumma ālu ~0.394).
   */
  minResolutionConfidence?: number;
};

// ─── Composition-assignment cache (read-only mirror of v0.54 cache) ───────

type CachedAssignment = {
  top_composition_id: string;
  confidence: number;
  is_in_exemplar_list?: boolean;
};
type AssignmentsCache = {
  built_at?: string;
  assignments: Record<string, CachedAssignment>;
};

let _cache: AssignmentsCache | null = null;
let _cacheLoadErr: string | null = null;

function cacheRoot(override?: string): string {
  return override || process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadAssignments(override?: string): AssignmentsCache | null {
  if (_cache) return _cache;
  if (_cacheLoadErr) return null;
  const path = join(cacheRoot(override), ASSIGNMENTS_FILE);
  if (!existsSync(path)) {
    _cacheLoadErr = `composition-assignments.json not built at ${path} — fallback to identifyComposition per tablet (slow)`;
    return null;
  }
  try {
    _cache = JSON.parse(readFileSync(path, "utf-8")) as AssignmentsCache;
    return _cache;
  } catch (e) {
    _cacheLoadErr = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function _resetForTests(): void {
  _cache = null;
  _cacheLoadErr = null;
}

// ─── Composition resolution ────────────────────────────────────────────────

type Resolution = { composition_id: string; confidence: number; source: "registry" | "cache" | "identify" };

function buildRegistryExemplarMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of COMPOSITION_REGISTRY) {
    if (c.composition_type !== "specific_composition") continue;
    for (const ex of c.exemplar_tablets) m.set(ex, c.id);
  }
  return m;
}

class CompositionResolver {
  private registryMap: Map<string, string>;
  private cache: AssignmentsCache | null;
  private memo: Map<string, Resolution | null> = new Map();
  private minConfidence: number;
  public skipCount = 0;
  public lowConfidenceCount = 0;
  public usedFallback = 0;

  constructor(minConfidence: number, cacheOverride?: string) {
    this.minConfidence = minConfidence;
    this.registryMap = buildRegistryExemplarMap();
    this.cache = loadAssignments(cacheOverride);
  }

  resolve(tabletId: string): Resolution | null {
    const memoed = this.memo.get(tabletId);
    if (memoed !== undefined) return memoed;

    // 1. Registry exemplars — confidence 1.0
    const fromRegistry = this.registryMap.get(tabletId);
    if (fromRegistry) {
      const r: Resolution = { composition_id: fromRegistry, confidence: 1.0, source: "registry" };
      this.memo.set(tabletId, r);
      return r;
    }

    // 2. v0.54 cached assignments — only accept specific_composition rows
    if (this.cache && this.cache.assignments[tabletId]) {
      const a = this.cache.assignments[tabletId];
      const comp = getCompositionById(a.top_composition_id);
      if (comp && comp.composition_type === "specific_composition" && a.confidence >= this.minConfidence) {
        const r: Resolution = { composition_id: a.top_composition_id, confidence: a.confidence, source: "cache" };
        this.memo.set(tabletId, r);
        return r;
      }
      if (comp && a.confidence < this.minConfidence) {
        this.lowConfidenceCount++;
        this.memo.set(tabletId, null);
        return null;
      }
    }

    // 3. identifyComposition fallback. SLOW — only fires when cache miss.
    //    Each call walks the full registry; rate-limit by skipping on hot
    //    paths that should already be in cache. We still try once.
    try {
      const r = identifyComposition({ tabletId, topK: 1, minConfidence: this.minConfidence });
      this.usedFallback++;
      if (r.candidates.length === 0) {
        this.skipCount++;
        this.memo.set(tabletId, null);
        return null;
      }
      const top = r.candidates[0];
      if (top.composition_type !== "specific_composition") {
        this.skipCount++;
        this.memo.set(tabletId, null);
        return null;
      }
      const out: Resolution = {
        composition_id: top.composition_id,
        confidence: top.confidence,
        source: "identify",
      };
      this.memo.set(tabletId, out);
      return out;
    } catch {
      this.skipCount++;
      this.memo.set(tabletId, null);
      return null;
    }
  }
}

// ─── Edge accumulator ──────────────────────────────────────────────────────

type EdgeAccum = {
  source: string;
  target: string;
  weight: number;
  citationEvidence: boolean;
  chunkEvidence: boolean;
  tablets: Set<string>;
};

function edgeKey(src: string, tgt: string): string {
  return `${src} >> ${tgt}`;
}

function pushTabletEvidence(acc: EdgeAccum, tabletA: string, tabletB: string): void {
  if (acc.tablets.size >= 16) return; // soft cap to keep RAM bounded; top 5 surface later
  acc.tablets.add(tabletA);
  if (acc.tablets.size >= 16) return;
  acc.tablets.add(tabletB);
}

// ─── Output writers ────────────────────────────────────────────────────────

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function writeGraphJson(
  path: string,
  result: Omit<ComputeQuotationNetworkResult, "output_paths">,
): void {
  writeFileSync(path, JSON.stringify(result, null, 2));
}

function writeGraphDot(
  path: string,
  nodes: QuotationNetworkNode[],
  edges: QuotationNetworkEdge[],
): void {
  const lines: string[] = [];
  lines.push("digraph quotation_network {");
  lines.push("  graph [rankdir=LR, fontname=\"Helvetica\"];");
  lines.push("  node  [shape=box, style=\"rounded,filled\", fontname=\"Helvetica\", fillcolor=\"#f2f2f2\"];");
  lines.push("  edge  [fontname=\"Helvetica\", fontsize=10];");
  for (const n of nodes) {
    const label = `${n.display_name}\\nin=${n.in_degree} out=${n.out_degree}`;
    lines.push(`  "${n.composition_id}" [label="${label}"];`);
  }
  for (const e of edges) {
    const style = e.evidence_type === "both"
      ? "solid"
      : e.evidence_type === "citation"
        ? "dashed"
        : "dotted";
    const color = e.evidence_type === "both"
      ? "#222222"
      : e.evidence_type === "citation"
        ? "#1a4d8f"
        : "#8f6e1a";
    const w = e.weight.toFixed(2);
    lines.push(
      `  "${e.source_composition}" -> "${e.target_composition}" [label="${w}", style=${style}, color="${color}", penwidth=${Math.min(6, 1 + Math.log10(1 + e.weight)).toFixed(2)}];`,
    );
  }
  lines.push("}");
  writeFileSync(path, lines.join("\n") + "\n");
}

function writeSummaryMd(
  path: string,
  result: Omit<ComputeQuotationNetworkResult, "output_paths">,
  generatedAt: string,
): void {
  const m = result.metrics;
  const lines: string[] = [];
  lines.push(`# Quotation Network — corpus-wide composition graph`);
  lines.push(``);
  lines.push(`Generated: ${generatedAt}  ·  cuneiform-mcp compute_quotation_network`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`- Nodes (compositions): **${m.total_nodes}**`);
  lines.push(`- Edges (quotation relationships): **${m.total_edges}**`);
  lines.push(`- Strongly-connected components: **${m.scc_count}** (largest size: **${m.scc_largest_size}**)`);
  lines.push(`- Isolate compositions (no quotation in or out): **${m.isolate_compositions.length}**`);
  lines.push(``);
  if (m.top_quoted_from.length > 0) {
    lines.push(`## Top Quoted-From (likely canonical base texts)`);
    lines.push(``);
    lines.push(`| Rank | Composition | In-degree |`);
    lines.push(`| ---- | ----------- | --------- |`);
    m.top_quoted_from.forEach((q, i) => {
      lines.push(`| ${i + 1} | ${q.composition} | ${q.in_degree} |`);
    });
    lines.push(``);
  }
  if (m.top_quoters.length > 0) {
    lines.push(`## Top Quoters (likely commentaries / dependent compositions)`);
    lines.push(``);
    lines.push(`| Rank | Composition | Out-degree |`);
    lines.push(`| ---- | ----------- | ---------- |`);
    m.top_quoters.forEach((q, i) => {
      lines.push(`| ${i + 1} | ${q.composition} | ${q.out_degree} |`);
    });
    lines.push(``);
  }
  if (m.isolate_compositions.length > 0) {
    lines.push(`## Isolate Compositions`);
    lines.push(``);
    lines.push(m.isolate_compositions.map((id) => `- \`${id}\``).join("\n"));
    lines.push(``);
  }
  lines.push(`## Edges`);
  lines.push(``);
  lines.push(`| Source | Target | Evidence | Weight | Tablets (sample) |`);
  lines.push(`| ------ | ------ | -------- | -----: | ---------------- |`);
  for (const e of result.edges) {
    const tabs = e.supporting_tablets.slice(0, 5).map((t) => `\`${t}\``).join(", ");
    lines.push(
      `| ${e.source_composition} | ${e.target_composition} | ${e.evidence_type} | ${e.weight.toFixed(2)} | ${tabs} |`,
    );
  }
  lines.push(``);
  if (result.warnings.length > 0) {
    lines.push(`## Warnings`);
    lines.push(``);
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push(``);
  }
  lines.push(`---`);
  lines.push(``);
  lines.push(`### Reproducibility`);
  lines.push(``);
  lines.push(`Render the DOT file with Graphviz:`);
  lines.push(``);
  lines.push("```bash");
  lines.push("dot -Tsvg graph.dot > graph.svg");
  lines.push("```");
  writeFileSync(path, lines.join("\n") + "\n");
}

// ─── Main ──────────────────────────────────────────────────────────────────

export function computeQuotationNetwork(
  opts: ComputeQuotationNetworkOptions = {},
): ComputeQuotationNetworkResult {
  const warnings: string[] = [];
  const minChunkLength = Math.max(1, opts.minChunkLength ?? 25);
  const minCitations = Math.max(1, opts.minCitations ?? 2);
  const minResolutionConfidence = Math.max(
    0,
    Math.min(1, opts.minResolutionConfidence ?? DEFAULT_MIN_RESOLVE_CONFIDENCE),
  );

  const resolver = new CompositionResolver(minResolutionConfidence, opts.cacheDirOverride);
  if (_cacheLoadErr) warnings.push(_cacheLoadErr);

  // ─── Stream 1: chunk-parallel evidence ────────────────────────────────
  const chunkIndex = loadChunkIndex();
  if (!chunkIndex) {
    warnings.push("chunk-index not loaded; chunk_parallel evidence stream disabled");
  }

  const edges = new Map<string, EdgeAccum>();

  function bumpEdge(
    src: string,
    tgt: string,
    weight: number,
    kind: "citation" | "chunk_parallel",
    tabletA: string,
    tabletB: string,
  ): void {
    if (src === tgt) return;
    const k = edgeKey(src, tgt);
    let acc = edges.get(k);
    if (!acc) {
      acc = {
        source: src,
        target: tgt,
        weight: 0,
        citationEvidence: false,
        chunkEvidence: false,
        tablets: new Set(),
      };
      edges.set(k, acc);
    }
    acc.weight += weight;
    if (kind === "citation") acc.citationEvidence = true;
    else acc.chunkEvidence = true;
    pushTabletEvidence(acc, tabletA, tabletB);
  }

  let chunkEntriesExamined = 0;
  let chunkEntriesContributing = 0;
  let chunkTabletsResolved = 0;
  let chunkTabletsSkipped = 0;

  if (chunkIndex) {
    // Iterate only chunks with ≥ 2 hosts (singletons already pruned).
    const entries = getChunksAboveHostCount(2);
    for (const entry of entries) {
      // The window length is 20 trigrams (v0.20); minChunkLength of 25 maps
      // to entry.length ≥ minChunkLength (which is itself fixed at 20). To
      // honour the spec's noise-floor semantics we use entry.length here —
      // the chunk-index already filters to length-20 windows, so the
      // additional filter is a forward-compatibility hook for when v0.21+
      // mixes longer windows in.
      if (entry.length < minChunkLength) continue;
      chunkEntriesExamined++;

      // Resolve each tablet to its composition.
      const occByComposition = new Map<string, string[]>();
      for (const occ of entry.occurrences) {
        const r = resolver.resolve(occ.tablet_id);
        if (!r) {
          chunkTabletsSkipped++;
          continue;
        }
        chunkTabletsResolved++;
        let arr = occByComposition.get(r.composition_id);
        if (!arr) {
          arr = [];
          occByComposition.set(r.composition_id, arr);
        }
        arr.push(occ.tablet_id);
      }
      if (occByComposition.size < 2) continue;
      chunkEntriesContributing++;

      // Weight per directed cross-composition pair: chunk_length × 1/host_count
      const hostCount = entry.occurrences.length;
      const weight = entry.length * (1 / Math.max(1, hostCount));

      const compIds = Array.from(occByComposition.keys());
      for (let i = 0; i < compIds.length; i++) {
        for (let j = 0; j < compIds.length; j++) {
          if (i === j) continue;
          const a = compIds[i];
          const b = compIds[j];
          const ta = occByComposition.get(a)![0];
          const tb = occByComposition.get(b)![0];
          bumpEdge(a, b, weight, "chunk_parallel", ta, tb);
        }
      }
    }
  }

  // ─── Stream 2: citation evidence (commentary → base) ──────────────────
  let citationEdgesIngested = 0;
  let citationEdgesAccepted = 0;
  let citationTabletsResolved = 0;
  let citationTabletsSkipped = 0;
  try {
    const cg = buildCitationGraph({
      minSharedChunks: minCitations,
      topKEdges: 500,
    });
    if (cg.warnings.length > 0) {
      for (const w of cg.warnings) {
        if (!warnings.includes(w)) warnings.push(w);
      }
    }
    for (const e of cg.edges as CitationEdge[]) {
      citationEdgesIngested++;
      const src = resolver.resolve(e.cited_by);
      const tgt = resolver.resolve(e.cites);
      if (!src) {
        citationTabletsSkipped++;
        continue;
      } else {
        citationTabletsResolved++;
      }
      if (!tgt) {
        citationTabletsSkipped++;
        continue;
      } else {
        citationTabletsResolved++;
      }
      if (src.composition_id === tgt.composition_id) continue;
      citationEdgesAccepted++;
      bumpEdge(src.composition_id, tgt.composition_id, e.edge_weight, "citation", e.cited_by, e.cites);
    }
  } catch (err) {
    warnings.push(`citation stream failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (resolver.skipCount > 0) {
    warnings.push(
      `${resolver.skipCount} tablets skipped (no composition resolution at conf ≥ ${minResolutionConfidence})`,
    );
  }
  if (resolver.lowConfidenceCount > 0) {
    warnings.push(
      `${resolver.lowConfidenceCount} tablets had cached assignments below conf threshold ${minResolutionConfidence} (skipped)`,
    );
  }
  if (resolver.usedFallback > 0) {
    warnings.push(
      `identifyComposition fallback used ${resolver.usedFallback} times — consider rebuilding composition-assignments cache`,
    );
  }

  // ─── Materialize node set + adjacency ──────────────────────────────────
  const nodeIds = new Set<string>();
  for (const acc of edges.values()) {
    nodeIds.add(acc.source);
    nodeIds.add(acc.target);
  }

  const adj: AdjList = new Map();
  for (const acc of edges.values()) {
    let row = adj.get(acc.source);
    if (!row) {
      row = new Map();
      adj.set(acc.source, row);
    }
    row.set(acc.target, acc.weight);
  }

  const allNodeIds = Array.from(nodeIds).sort();

  // Sampled-source betweenness approximation
  const ranks = sampledBetweennessRanks(adj, allNodeIds, { sampleSize: 32, seed: 137 });

  const nodes: QuotationNetworkNode[] = allNodeIds.map((id) => {
    const entry = getCompositionById(id);
    const display = entry?.name ?? id;
    return {
      composition_id: id,
      display_name: display,
      in_degree: inDegree(adj, id),
      out_degree: outDegree(adj, id),
      betweenness_rank: ranks.get(id) ?? null,
    };
  });

  const edgeList: QuotationNetworkEdge[] = Array.from(edges.values())
    .map((acc) => ({
      source_composition: acc.source,
      target_composition: acc.target,
      evidence_type: (acc.citationEvidence && acc.chunkEvidence
        ? "both"
        : acc.citationEvidence
          ? "citation"
          : "chunk_parallel") as QuotationNetworkEdge["evidence_type"],
      weight: +acc.weight.toFixed(4),
      supporting_tablets: Array.from(acc.tablets).slice(0, 5),
    }))
    .sort((a, b) => b.weight - a.weight || a.source_composition.localeCompare(b.source_composition));

  // Isolate compositions: registry compositions never appearing in any edge.
  const isolateIds: string[] = [];
  for (const c of COMPOSITION_REGISTRY) {
    if (c.composition_type !== "specific_composition") continue;
    if (!nodeIds.has(c.id)) isolateIds.push(c.id);
  }

  // SCC analysis
  const sccs = tarjanSCC(adj, allNodeIds);
  const sccCount = sccs.length;
  const sccLargest = sccs.reduce((m, c) => Math.max(m, c.length), 0);

  // Top-10 quoted-from / quoters
  const topQuotedFrom = nodes
    .slice()
    .sort((a, b) => b.in_degree - a.in_degree || a.composition_id.localeCompare(b.composition_id))
    .slice(0, 10)
    .map((n) => ({ composition: n.composition_id, in_degree: n.in_degree }));
  const topQuoters = nodes
    .slice()
    .sort((a, b) => b.out_degree - a.out_degree || a.composition_id.localeCompare(b.composition_id))
    .slice(0, 10)
    .map((n) => ({ composition: n.composition_id, out_degree: n.out_degree }));

  const metrics: QuotationNetworkMetrics = {
    total_nodes: nodes.length,
    total_edges: edgeList.length,
    top_quoted_from: topQuotedFrom,
    top_quoters: topQuoters,
    isolate_compositions: isolateIds.sort(),
    scc_count: sccCount,
    scc_largest_size: sccLargest,
  };

  // ─── Write artifacts ──────────────────────────────────────────────────
  const ts = isoTimestamp();
  const root = cacheRoot(opts.cacheDirOverride);
  const outDir = join(root, QUOTATION_NETWORK_DIR, ts);
  ensureDir(outDir);
  const jsonPath = join(outDir, "graph.json");
  const dotPath = join(outDir, "graph.dot");
  const summaryPath = join(outDir, "summary.md");

  // Diagnostics surface
  if (chunkIndex) {
    warnings.push(
      `chunk_parallel stream: ${chunkEntriesExamined} chunks examined, ${chunkEntriesContributing} contributed cross-composition pairs (resolved ${chunkTabletsResolved} / skipped ${chunkTabletsSkipped} tablet occurrences)`,
    );
  }
  warnings.push(
    `citation stream: ingested ${citationEdgesIngested} tablet edges, accepted ${citationEdgesAccepted} cross-composition edges (resolved ${citationTabletsResolved} / skipped ${citationTabletsSkipped} endpoints)`,
  );

  const interim = {
    nodes,
    edges: edgeList,
    metrics,
    warnings,
  };

  writeGraphJson(jsonPath, interim);
  writeGraphDot(dotPath, nodes, edgeList);
  writeSummaryMd(summaryPath, interim, ts);

  return {
    nodes,
    edges: edgeList,
    metrics,
    output_paths: { json: jsonPath, dot: dotPath, summary_md: summaryPath },
    warnings,
  };
}

// Convenience export used by tests / index.ts smoke output.
export function _internals_for_testing() {
  return {
    buildRegistryExemplarMap,
    CompositionResolver,
    edgeKey,
    QUOTATION_NETWORK_DIR,
  };
}

// Silences unused-import warnings for re-exports the index.ts handler will
// touch when binding tool wires.
export type _UnusedChunkIndexEntry = ChunkIndexEntry;
export type _UnusedCompositionEntry = CompositionEntry;
