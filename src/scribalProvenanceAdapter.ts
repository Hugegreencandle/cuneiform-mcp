// v0.58 — scribalProvenanceAdapter: bridges scribalProvenance.ts (which
// expects per-tablet `witnesses[]` and `citations[]` arrays in
// TabletMetadata shape) to the actual cuneiform-mcp data sources:
//
//   witnesses  ← chunkIndex co-occurrence (every other tablet sharing
//                ≥1 length-20 chunk window with this tablet, one hop).
//                The "earliest manuscript witness" is then derived by
//                scribalProvenance.extractScribalProvenance sorting on
//                period via comparePeriods.
//   citations  ← buildCitationGraph()'s commentary→base edges, INVERTED.
//                Each tablet T accumulates the commentaries whose
//                `cites = T` — i.e. the derivatives that quote T.
//
// Period attribution comes from getFragmentMetadata + getPeriod.
//
// The build is lazy + singleton: first call pays the (potentially
// multi-second) construction cost; subsequent calls reuse the cached
// Map. Pass { rebuild: true } to force a refresh (e.g. after metadata
// enrichment).
//
// Failure modes are degraded gracefully:
//   - If buildCitationGraph throws or returns no edges, the citations
//     map is empty and a warning is logged to stderr. Witnesses still
//     populate.
//   - If chunkIndex isn't loaded, witnesses are empty.
//
// This module NEVER blocks module load — the cache is built only on
// the first call to buildTabletProvenanceContext().

import { getChunksContaining } from "./chunkIndex.js";
import {
  buildCitationGraph,
  type CitationGraphResult,
} from "./citationGraph.js";
import {
  getFragmentMetadata,
  getPeriod,
} from "./fragmentMetadata.js";
import { getAllTabletRecords } from "./anomalySurface.js";

// ─── Public types ──────────────────────────────────────────────────────────

export interface TabletProvenanceInput {
  id: string;
  witnesses?: Array<{ id: string; period: string | null }>;
  citations?: Array<{ id: string; period: string | null }>;
}

// ─── Internal state ────────────────────────────────────────────────────────

let _cache: Map<string, TabletProvenanceInput> | null = null;

function periodFor(tabletId: string): string | null {
  const meta = getFragmentMetadata(tabletId);
  return getPeriod(meta);
}

/**
 * Invert buildCitationGraph's edge list into a Map<baseId, Array<{id, period}>>.
 * Each base tablet collects the commentaries that cite it. The commentary's
 * period is attached via fragmentMetadata lookup. Degrades gracefully on
 * failure — returns an empty map and stashes the error on `warnings`.
 *
 * Uses top_k_edges = 500 (the hard cap in CitationGraphOptions) and
 * min_shared_chunks = 1 to get the broadest possible citation surface;
 * the downstream extractScribalProvenance does its own period-based
 * "earliest" selection so we want the full candidate set, not just
 * high-confidence edges.
 */
function buildInvertedCitations(warnings: string[]): Map<
  string,
  Array<{ id: string; period: string | null }>
> {
  const out = new Map<string, Array<{ id: string; period: string | null }>>();
  let result: CitationGraphResult;
  try {
    result = buildCitationGraph({ minSharedChunks: 1, topKEdges: 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`buildCitationGraph failed during provenance build: ${msg}`);
    return out;
  }
  if (!result.index_stats.loaded) {
    warnings.push(
      `chunk-index not loaded — citation graph empty (${result.warnings.join("; ")})`,
    );
    return out;
  }
  for (const edge of result.edges) {
    const base = edge.cites;
    const commentary = edge.cited_by;
    if (!base || !commentary || base === commentary) continue;
    let arr = out.get(base);
    if (!arr) {
      arr = [];
      out.set(base, arr);
    }
    arr.push({ id: commentary, period: periodFor(commentary) });
  }
  return out;
}

/**
 * Build the corpus-wide tablet→provenance-input map.
 *
 * For each tablet in `getAllTabletRecords()`:
 *   1. witnesses: every co-occurring tablet via getChunksContaining
 *      (deduplicated, self skipped). Periods attached via metadata.
 *   2. citations: the inverted citation graph entry, or empty array.
 *
 * Lazy singleton — first call pays the build cost, subsequent calls
 * return the same Map. `{ rebuild: true }` discards the cache.
 *
 * Module load is NEVER blocked — this only runs when called.
 */
export function buildTabletProvenanceContext(
  opts: { rebuild?: boolean } = {},
): Map<string, TabletProvenanceInput> {
  if (_cache && !opts.rebuild) return _cache;

  const warnings: string[] = [];
  const invertedCitations = buildInvertedCitations(warnings);

  const out = new Map<string, TabletProvenanceInput>();
  const tablets = getAllTabletRecords();
  if (!tablets) {
    // Corpus-wide tablet index not loaded — degrade to empty result.
    // Caller (the tool handler) will surface low-coverage warnings.
    _cache = out;
    return out;
  }

  for (const rec of tablets) {
    const id = rec.id;
    if (!id) continue;

    // Witnesses: chunkIndex co-occurrence one-hop.
    const seenWitness = new Set<string>();
    const witnesses: Array<{ id: string; period: string | null }> = [];
    const chunks = getChunksContaining(id);
    for (const chunk of chunks) {
      for (const occ of chunk.occurrences) {
        const wid = occ.tablet_id;
        if (!wid || wid === id) continue;
        if (seenWitness.has(wid)) continue;
        seenWitness.add(wid);
        witnesses.push({ id: wid, period: periodFor(wid) });
      }
    }

    // Citations: inverted citation graph.
    const citations = invertedCitations.get(id) ?? [];

    out.set(id, { id, witnesses, citations });
  }

  if (warnings.length > 0) {
    // eslint-disable-next-line no-console
    console.error(`[scribalProvenanceAdapter] ${warnings.join("; ")}`);
  }

  _cache = out;
  return out;
}
