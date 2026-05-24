// v0.28.0 — Per-period chunk-hash index loader (NA / NB).
//
// Companion to v0.20's corpus-wide chunk-hash index (src/chunkIndex.ts).
// v0.20 emitted ONE inverted index over the full 35K-tablet corpus; v0.28
// emits TWO — one trained on Neo-Assyrian-only tablets, one on
// Neo-Babylonian-only — using the same WINDOW=20 sliding window + same
// X-skip rule + same singleton pruning. The diachronic split exposes
// chunks that are formulaic in one period but NOT reproduced in the other,
// i.e. period-specific canonical/administrative formulae the v0.20
// corpus-wide tool can't isolate because it doesn't condition on period.
//
// Caches:
//   ~/.cache/cuneiform-mcp/chunk-index-na.json
//   ~/.cache/cuneiform-mcp/chunk-index-nb.json
//
// Built by scripts/build-chunk-index-per-period.mjs.
//
// This file is the runtime LOADER + QUERY layer for the per-period indexes —
// mirrors src/chunkIndex.ts (corpus-wide) but keyed by PeriodKey. Pure stdlib.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// ─── Period keys ───────────────────────────────────────────────────────────

export type PeriodKey = "NA" | "NB";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  NA: "Neo-Assyrian",
  NB: "Neo-Babylonian",
};

function cacheFilename(period: PeriodKey): string {
  return `chunk-index-${period.toLowerCase()}.json`;
}

// ─── Public types ──────────────────────────────────────────────────────────

export type ChunkOccurrence = {
  tablet_id: string;
  start_position: number;
};

export type ChunkIndexEntry = {
  /** Canonical hash: trigrams joined by "|". length-20 window in v0.28.0. */
  hash: string;
  /** Reconstructed sign sequence (whitespace-joined; "…" marks X-skip gaps). */
  signs: string;
  /** Window length in trigram positions. Fixed at 20 in v0.28.0. */
  length: number;
  occurrences: ChunkOccurrence[]; // length ≥ 2 (singletons pruned at build)
};

export type PerPeriodChunkIndex = {
  version: string;
  build_timestamp: string;
  period: PeriodKey;
  period_label: string;
  window_length: number;
  total_tablets: number;
  total_windows_seen: number;
  total_unique_hashes: number;
  total_non_singleton_hashes: number;
  entries: ChunkIndexEntry[]; // sorted by occurrences.length desc
};

export type PerPeriodChunkIndexStats = {
  period: PeriodKey;
  period_label: string;
  loaded: boolean;
  load_error: string | null;
  entries: number;
  window_length: number | null;
  build_timestamp: string | null;
  total_tablets: number;
  total_windows_seen: number;
  total_unique_hashes: number;
  total_non_singleton_hashes: number;
  cache_path: string;
};

// ─── Internal state (lazy, per period) ─────────────────────────────────────

type PeriodSlot = {
  period: PeriodKey;
  index: PerPeriodChunkIndex | null;
  byHash: Map<string, ChunkIndexEntry> | null;
  byTablet: Map<string, ChunkIndexEntry[]> | null;
  loadAttempted: boolean;
  loadError: string | null;
  cachePath: string;
};

const _slots = new Map<PeriodKey, PeriodSlot>();

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

export function periodCachePath(period: PeriodKey): string {
  return join(cacheDir(), cacheFilename(period));
}

function getSlot(period: PeriodKey): PeriodSlot {
  const existing = _slots.get(period);
  if (existing) return existing;
  const slot: PeriodSlot = {
    period,
    index: null,
    byHash: null,
    byTablet: null,
    loadAttempted: false,
    loadError: null,
    cachePath: periodCachePath(period),
  };
  _slots.set(period, slot);
  return slot;
}

function buildDerivedLookups(slot: PeriodSlot, index: PerPeriodChunkIndex): void {
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
  slot.byHash = byHash;
  slot.byTablet = byTablet;
}

// ─── Public loaders + accessors ────────────────────────────────────────────

/**
 * Lazy-load the per-period chunk-hash index for `period`. Returns null if
 * the cache file is missing or malformed; surface the reason via
 * perPeriodChunkIndexStats(period).load_error.
 */
export function loadPerPeriodChunkIndex(period: PeriodKey): PerPeriodChunkIndex | null {
  const slot = getSlot(period);
  if (slot.index) return slot.index;
  if (slot.loadAttempted) return null;
  slot.loadAttempted = true;
  if (!existsSync(slot.cachePath)) {
    slot.loadError = `per-period chunk-index not found: ${slot.cachePath}. Run scripts/build-chunk-index-per-period.mjs.`;
    return null;
  }
  try {
    const raw = readFileSync(slot.cachePath, "utf-8");
    const parsed = JSON.parse(raw) as PerPeriodChunkIndex;
    if (!parsed || !Array.isArray(parsed.entries)) {
      slot.loadError = `per-period chunk-index malformed: missing entries[] at ${slot.cachePath}`;
      return null;
    }
    if (parsed.period !== period) {
      slot.loadError = `per-period chunk-index at ${slot.cachePath} reports period=${parsed.period} but slot expects period=${period}`;
      return null;
    }
    slot.index = parsed;
    buildDerivedLookups(slot, parsed);
    return slot.index;
  } catch (e) {
    slot.loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function perPeriodChunkIndexStats(period: PeriodKey): PerPeriodChunkIndexStats {
  const idx = loadPerPeriodChunkIndex(period);
  const slot = getSlot(period);
  if (!idx) {
    return {
      period,
      period_label: PERIOD_LABELS[period],
      loaded: false,
      load_error: slot.loadError,
      entries: 0,
      window_length: null,
      build_timestamp: null,
      total_tablets: 0,
      total_windows_seen: 0,
      total_unique_hashes: 0,
      total_non_singleton_hashes: 0,
      cache_path: slot.cachePath,
    };
  }
  return {
    period,
    period_label: PERIOD_LABELS[period],
    loaded: true,
    load_error: null,
    entries: idx.entries.length,
    window_length: idx.window_length,
    build_timestamp: idx.build_timestamp,
    total_tablets: idx.total_tablets,
    total_windows_seen: idx.total_windows_seen,
    total_unique_hashes: idx.total_unique_hashes,
    total_non_singleton_hashes: idx.total_non_singleton_hashes,
    cache_path: slot.cachePath,
  };
}

export function getPerPeriodChunkIndexLoadError(period: PeriodKey): string | null {
  const slot = getSlot(period);
  if (!slot.loadAttempted) loadPerPeriodChunkIndex(period);
  return slot.loadError;
}

/** All chunks for `period` whose host count is at least `min`. Index
 *  entries are pre-sorted by occurrences.length desc, so callers early-exit. */
export function getPerPeriodChunksAboveHostCount(
  period: PeriodKey,
  min: number,
): ChunkIndexEntry[] {
  const idx = loadPerPeriodChunkIndex(period);
  if (!idx) return [];
  const out: ChunkIndexEntry[] = [];
  for (const entry of idx.entries) {
    if (entry.occurrences.length < min) break;
    out.push(entry);
  }
  return out;
}

export function getPerPeriodChunkByHash(
  period: PeriodKey,
  hash: string,
): ChunkIndexEntry | null {
  loadPerPeriodChunkIndex(period);
  const slot = getSlot(period);
  if (!slot.byHash) return null;
  return slot.byHash.get(hash) ?? null;
}

export function getPerPeriodChunksContaining(
  period: PeriodKey,
  tabletId: string,
): ChunkIndexEntry[] {
  loadPerPeriodChunkIndex(period);
  const slot = getSlot(period);
  if (!slot.byTablet) return [];
  return slot.byTablet.get(tabletId) ?? [];
}

/** Stats for both periods. Triggers lazy load on any not-yet-attempted slot. */
export function allPerPeriodChunkStats(): PerPeriodChunkIndexStats[] {
  return (["NA", "NB"] as PeriodKey[]).map((p) => perPeriodChunkIndexStats(p));
}

/** Test-only: reset the lazy-load cache. */
export function _resetPerPeriodChunkIndexForTests(): void {
  _slots.clear();
}
