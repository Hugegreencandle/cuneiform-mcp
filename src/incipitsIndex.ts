// v0.21.0 — Length-10 chunk-hash index loader + query helpers (incipits).
//
// Parallel structure to src/chunkIndex.ts (v0.20's length-20 index). The
// shorter window catches the 3-8 sign opening formulae (incipits) that
// scholars use to identify compositions across the corpus — but length-10
// admits more numerical-table noise than length-20, so the calibration
// regime (default min_hosts, numerical-only filter) is different.
//
// Build pipeline: scripts/build-incipits-index.mjs reads
// ~/.cache/cuneiform-mcp/all-signs-full.json, slides a length-10 window over
// each tablet's trigrams_ordered stream, aggregates per-hash occurrences,
// drops singletons, reconstructs sign sequences, and writes a single
// ~/.cache/cuneiform-mcp/incipits-index.json file (200-500 MB expected).
//
// This module is the runtime LOADER + QUERY layer for the length-10 index —
// lazy load on first call, in-memory map for O(1) hash lookups, and pre-
// bucketed accessors that find_incipits uses as its direct backbone.
//
// Provenance: length-10 incipits index is the corpus-wide complement to the
// length-20 formulaic-passages index — same alignment semantics, different
// window calibration. The two indexes co-exist in cache; loading one does
// not affect the other.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const INCIPITS_INDEX_FILE = "incipits-index.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type IncipitsOccurrence = {
  tablet_id: string;
  start_position: number; // index into the tablet's trigrams_ordered
};

export type IncipitsIndexEntry = {
  /** Canonical hash: trigrams joined by "|". length-10 window in v0.21.0. */
  hash: string;
  /** Reconstructed sign sequence (whitespace-joined; "…" marks X-skip gaps). */
  signs: string;
  /** Window length in trigram positions. Fixed at 10 in v0.21.0. */
  length: number;
  occurrences: IncipitsOccurrence[]; // length ≥ 2 (singletons pruned at build)
};

export type IncipitsIndex = {
  version: string; // mcp version that built the index
  build_timestamp: string;
  window_length: number;
  total_tablets: number;
  total_windows_seen: number;
  total_unique_hashes: number;
  total_non_singleton_hashes: number;
  entries: IncipitsIndexEntry[]; // sorted by occurrences.length desc
};

export type IncipitsIndexStats = {
  loaded: boolean;
  entries: number;
  window_length: number | null;
  build_timestamp: string | null;
  load_error: string | null;
};

// ─── Internal state ────────────────────────────────────────────────────────

let _index: IncipitsIndex | null = null;
let _loadError: string | null = null;
let _loadAttempted = false;

// Derived lookups, built on first load.
let _byHash: Map<string, IncipitsIndexEntry> | null = null;
let _byTablet: Map<string, IncipitsIndexEntry[]> | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), INCIPITS_INDEX_FILE);
}

function buildDerivedLookups(index: IncipitsIndex): void {
  const byHash = new Map<string, IncipitsIndexEntry>();
  const byTablet = new Map<string, IncipitsIndexEntry[]>();
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
 * Lazy-load the incipits (length-10) chunk-hash index from disk. Returns null
 * if the cache file is missing or malformed; surface the reason via
 * incipitsIndexStats().load_error.
 */
export function loadIncipitsIndex(): IncipitsIndex | null {
  if (_index) return _index;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  const path = cachePath();
  if (!existsSync(path)) {
    _loadError = `incipits-index not found: ${path}. Run scripts/build-incipits-index.mjs.`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as IncipitsIndex;
    if (!parsed || !Array.isArray(parsed.entries)) {
      _loadError = `incipits-index malformed: missing entries[] at ${path}`;
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

export function incipitsIndexStats(): IncipitsIndexStats {
  const idx = loadIncipitsIndex();
  return {
    loaded: !!idx,
    entries: idx?.entries.length ?? 0,
    window_length: idx?.window_length ?? null,
    build_timestamp: idx?.build_timestamp ?? null,
    load_error: _loadError,
  };
}

export function getIncipitsIndexLoadError(): string | null {
  if (!_loadAttempted) loadIncipitsIndex();
  return _loadError;
}

/** All chunks whose host count is at least `min`. Index entries are already
 *  sorted by occurrences.length descending, so callers can early-exit. */
export function getIncipitsAboveHostCount(min: number): IncipitsIndexEntry[] {
  const idx = loadIncipitsIndex();
  if (!idx) return [];
  const out: IncipitsIndexEntry[] = [];
  for (const entry of idx.entries) {
    if (entry.occurrences.length < min) break;
    out.push(entry);
  }
  return out;
}

/** Every incipit chunk that lists `tabletId` among its occurrences. */
export function getIncipitsContaining(tabletId: string): IncipitsIndexEntry[] {
  loadIncipitsIndex();
  if (!_byTablet) return [];
  return _byTablet.get(tabletId) ?? [];
}

export function getIncipitByHash(hash: string): IncipitsIndexEntry | null {
  loadIncipitsIndex();
  if (!_byHash) return null;
  return _byHash.get(hash) ?? null;
}
