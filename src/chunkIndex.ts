// v0.20.0 — Corpus-wide chunk-hash index loader + query helpers.
//
// v0.19's find_chunk_parallels probes one source tablet at a time against the
// fuzzy 2-of-3 inverted indexes. v0.20 ships corpus-wide enumeration tools
// (find_formulaic_passages, trace_chunk_diffusion, build_citation_graph) that
// need an exact-hash lookup over EVERY length-20 trigram window seen anywhere
// in the corpus, with hosts pre-pruned for singletons.
//
// Build pipeline: scripts/build-chunk-index.mjs reads
// ~/.cache/cuneiform-mcp/all-signs-full.json, slides a length-20 window over
// each tablet's trigrams_ordered stream, aggregates per-hash occurrences,
// drops singletons, reconstructs sign sequences, and writes a single
// ~/.cache/cuneiform-mcp/chunk-index.json file (~100-200 MB).
//
// This module is the runtime LOADER + QUERY layer — lazy load on first call,
// in-memory map for O(1) hash lookups, and pre-bucketed accessors that the
// three v0.20 tools use as their direct backbone.
//
// Provenance: the chunk-hash index is the corpus-wide complement to the
// per-tablet probe — same alignment semantics, different output structure.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CHUNK_INDEX_FILE = "chunk-index.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type ChunkOccurrence = {
  tablet_id: string;
  start_position: number; // index into the tablet's trigrams_ordered
};

export type ChunkIndexEntry = {
  /** Canonical hash: trigrams joined by "|". length-20 window in v0.20.0. */
  hash: string;
  /** Reconstructed sign sequence (whitespace-joined; "…" marks X-skip gaps). */
  signs: string;
  /** Window length in trigram positions. Fixed at 20 in v0.20.0. */
  length: number;
  occurrences: ChunkOccurrence[]; // length ≥ 2 (singletons pruned at build)
};

export type ChunkIndex = {
  version: string; // mcp version that built the index
  build_timestamp: string;
  window_length: number;
  total_tablets: number;
  total_windows_seen: number;
  total_unique_hashes: number;
  total_non_singleton_hashes: number;
  entries: ChunkIndexEntry[]; // sorted by occurrences.length desc
};

export type ChunkIndexStats = {
  loaded: boolean;
  entries: number;
  window_length: number | null;
  build_timestamp: string | null;
  load_error: string | null;
};

// ─── Internal state ────────────────────────────────────────────────────────

let _index: ChunkIndex | null = null;
let _loadError: string | null = null;
let _loadAttempted = false;

// Derived lookups, built on first load.
let _byHash: Map<string, ChunkIndexEntry> | null = null;
let _byTablet: Map<string, ChunkIndexEntry[]> | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), CHUNK_INDEX_FILE);
}

function buildDerivedLookups(index: ChunkIndex): void {
  const byHash = new Map<string, ChunkIndexEntry>();
  const byTablet = new Map<string, ChunkIndexEntry[]>();
  for (const entry of index.entries) {
    byHash.set(entry.hash, entry);
    for (const occ of entry.occurrences) {
      let arr = byTablet.get(occ.tablet_id);
      if (!arr) {
        arr = [];
        byTablet.set(occ.tablet_id, arr);
      }
      arr.push(entry);
    }
  }
  _byHash = byHash;
  _byTablet = byTablet;
}

// ─── Public loaders + accessors ────────────────────────────────────────────

/**
 * Lazy-load the chunk-hash index from disk. Returns null if the cache file is
 * missing or malformed; surface the reason via chunkIndexStats().load_error.
 */
export function loadChunkIndex(): ChunkIndex | null {
  if (_index) return _index;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  const path = cachePath();
  if (!existsSync(path)) {
    _loadError = `chunk-index not found: ${path}. Run scripts/build-chunk-index.mjs.`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as ChunkIndex;
    if (!parsed || !Array.isArray(parsed.entries)) {
      _loadError = `chunk-index malformed: missing entries[] at ${path}`;
      return null;
    }
    _index = parsed;
    buildDerivedLookups(parsed);
    return _index;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function chunkIndexStats(): ChunkIndexStats {
  const idx = loadChunkIndex();
  return {
    loaded: !!idx,
    entries: idx?.entries.length ?? 0,
    window_length: idx?.window_length ?? null,
    build_timestamp: idx?.build_timestamp ?? null,
    load_error: _loadError,
  };
}

export function getChunkIndexLoadError(): string | null {
  if (!_loadAttempted) loadChunkIndex();
  return _loadError;
}

/** All chunks whose host count is at least `min`. Index entries are already
 *  sorted by occurrences.length descending, so callers can early-exit. */
export function getChunksAboveHostCount(min: number): ChunkIndexEntry[] {
  const idx = loadChunkIndex();
  if (!idx) return [];
  const out: ChunkIndexEntry[] = [];
  for (const entry of idx.entries) {
    if (entry.occurrences.length < min) break;
    out.push(entry);
  }
  return out;
}

/** Every chunk that lists `tabletId` among its occurrences. */
export function getChunksContaining(tabletId: string): ChunkIndexEntry[] {
  loadChunkIndex();
  if (!_byTablet) return [];
  return _byTablet.get(tabletId) ?? [];
}

export function getChunkByHash(hash: string): ChunkIndexEntry | null {
  loadChunkIndex();
  if (!_byHash) return null;
  return _byHash.get(hash) ?? null;
}
