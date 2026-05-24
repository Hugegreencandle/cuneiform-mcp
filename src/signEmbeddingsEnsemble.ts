// v0.25.0 — sign2vec ensemble: parametric loader for multiple sign-embedding
// configurations.
//
// Companion to v0.23's signEmbeddings.ts (single canonical config at
// WINDOW=5, MIN_OCC=20). The ensemble loader holds N independent sign2vec
// indices in memory, each built with a different (WINDOW, MIN_OCC) pair and
// cached at ~/.cache/cuneiform-mcp/sign-embeddings-w{N}-m{M}.json. It
// underwrites compareSignEmbeddingConfigs (the new v0.25 tool) and the
// methods-paper §3.12 robustness footnote ("WINDOW=5 / MIN_OCC=20 is
// validated empirically against WINDOW ∈ {2, 5, 10} × MIN_OCC ∈ {10, 20}").
//
// Design notes:
//   • Caches each config separately. Lazy-loaded on first lookup; held for
//     the lifetime of the process.
//   • Per-config load errors are recorded (per-config) without aborting the
//     ensemble — a missing build for WINDOW=10/MIN_OCC=10 still leaves the
//     other 5 configs queryable.
//   • Mirrors the data structures of signEmbeddings.ts but is fully
//     independent — v0.23's single-config loader is untouched.
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Public types ──────────────────────────────────────────────────────────

export type EnsembleConfigKey = {
  window: number;
  min_occ: number;
};

export type EnsembleConfigStats = {
  window: number;
  min_occ: number;
  loaded: boolean;
  load_error: string | null;
  total_signs_indexed: number;
  embedding_dim: number;
  algorithm: string;
  build_timestamp: string | null;
  total_corpus_occurrences: number;
  cache_path: string;
};

export type EnsembleSignNeighbor = {
  sign: string;
  cosine: number;
  occurrences: number;
};

// ─── Internal index types ──────────────────────────────────────────────────

type DiskEntry = {
  sign: string;
  vector: number[];
  occurrences: number;
};

type DiskIndex = {
  version: string;
  build_timestamp: string;
  algorithm: string;
  window_size: number;
  min_occurrences: number;
  embedding_dim: number;
  signs_indexed: number;
  total_corpus_occurrences: number;
  entries: DiskEntry[];
};

type LoadedIndex = {
  vectors: Float32Array;
  vocab: string[];
  signToIdx: Map<string, number>;
  occurrences: Int32Array;
  stats: EnsembleConfigStats;
};

type EnsembleSlot = {
  key: EnsembleConfigKey;
  index: LoadedIndex | null;
  loadAttempted: boolean;
  loadError: string | null;
  cachePath: string;
};

// ─── Default ensemble grid ─────────────────────────────────────────────────

export const DEFAULT_ENSEMBLE_GRID: ReadonlyArray<EnsembleConfigKey> = [
  { window: 2, min_occ: 10 },
  { window: 2, min_occ: 20 },
  { window: 5, min_occ: 10 },
  { window: 5, min_occ: 20 },
  { window: 10, min_occ: 10 },
  { window: 10, min_occ: 20 },
];

// ─── Paths ─────────────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

export function ensembleCacheFilename(key: EnsembleConfigKey): string {
  return `sign-embeddings-w${key.window}-m${key.min_occ}.json`;
}

export function ensembleCachePath(key: EnsembleConfigKey): string {
  return join(cacheDir(), ensembleCacheFilename(key));
}

// ─── Slot registry (lazy, per (window, min_occ) pair) ──────────────────────

const _slots = new Map<string, EnsembleSlot>();

function slotKeyId(key: EnsembleConfigKey): string {
  return `w${key.window}-m${key.min_occ}`;
}

function getSlot(key: EnsembleConfigKey): EnsembleSlot {
  const id = slotKeyId(key);
  const existing = _slots.get(id);
  if (existing) return existing;
  const slot: EnsembleSlot = {
    key: { window: key.window, min_occ: key.min_occ },
    index: null,
    loadAttempted: false,
    loadError: null,
    cachePath: ensembleCachePath(key),
  };
  _slots.set(id, slot);
  return slot;
}

function loadSlot(key: EnsembleConfigKey): LoadedIndex | null {
  const slot = getSlot(key);
  if (slot.index) return slot.index;
  if (slot.loadAttempted) return null;
  slot.loadAttempted = true;

  if (!existsSync(slot.cachePath)) {
    slot.loadError = `sign-embeddings ensemble cache not found: ${slot.cachePath}. Run \`node scripts/build-sign-embeddings-ensemble.mjs\`.`;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(slot.cachePath, "utf-8")) as DiskIndex;
    if (!raw || !Array.isArray(raw.entries)) {
      slot.loadError = `sign-embeddings ensemble cache malformed at ${slot.cachePath}: missing entries[]`;
      return null;
    }
    const V = raw.entries.length;
    const dim = raw.embedding_dim;
    if (!Number.isFinite(dim) || dim <= 0) {
      slot.loadError = `sign-embeddings ensemble cache at ${slot.cachePath} has invalid embedding_dim=${dim}`;
      return null;
    }
    // Cross-check the on-disk hyperparameters against the slot key. A mismatch
    // suggests the user moved or renamed files manually.
    if (raw.window_size !== key.window || raw.min_occurrences !== key.min_occ) {
      slot.loadError = `sign-embeddings ensemble cache at ${slot.cachePath} reports window=${raw.window_size} min_occ=${raw.min_occurrences} but slot expects window=${key.window} min_occ=${key.min_occ}`;
      return null;
    }

    const vectors = new Float32Array(V * dim);
    const vocab: string[] = new Array(V);
    const signToIdx = new Map<string, number>();
    const occurrences = new Int32Array(V);

    for (let i = 0; i < V; i++) {
      const e = raw.entries[i];
      if (!e || typeof e.sign !== "string" || !Array.isArray(e.vector) || e.vector.length !== dim) {
        slot.loadError = `sign-embeddings ensemble cache at ${slot.cachePath}: entry ${i} malformed`;
        return null;
      }
      vocab[i] = e.sign;
      signToIdx.set(e.sign, i);
      occurrences[i] = e.occurrences ?? 0;
      const base = i * dim;
      for (let k = 0; k < dim; k++) vectors[base + k] = e.vector[k];
    }

    const stats: EnsembleConfigStats = {
      window: key.window,
      min_occ: key.min_occ,
      loaded: true,
      load_error: null,
      total_signs_indexed: V,
      embedding_dim: dim,
      algorithm: raw.algorithm ?? "unknown",
      build_timestamp: raw.build_timestamp ?? null,
      total_corpus_occurrences: raw.total_corpus_occurrences ?? 0,
      cache_path: slot.cachePath,
    };

    slot.index = { vectors, vocab, signToIdx, occurrences, stats };
    return slot.index;
  } catch (e) {
    slot.loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function ensembleConfigStats(key: EnsembleConfigKey): EnsembleConfigStats {
  const idx = loadSlot(key);
  const slot = getSlot(key);
  if (!idx) {
    return {
      window: key.window,
      min_occ: key.min_occ,
      loaded: false,
      load_error: slot.loadError,
      total_signs_indexed: 0,
      embedding_dim: 0,
      algorithm: "unknown",
      build_timestamp: null,
      total_corpus_occurrences: 0,
      cache_path: slot.cachePath,
    };
  }
  return idx.stats;
}

export function ensembleHasSign(key: EnsembleConfigKey, sign: string): boolean {
  const idx = loadSlot(key);
  return idx?.signToIdx.has(sign) ?? false;
}

/**
 * Rank top-K nearest neighbors of `sign` within the (window, min_occ) config.
 * Returns null if the index failed to load or if `sign` is not in this
 * config's vocab. Use ensembleConfigStats / ensembleHasSign to disambiguate.
 */
export function ensembleRankNeighbors(
  key: EnsembleConfigKey,
  sign: string,
  topK: number,
  minCosine: number,
): EnsembleSignNeighbor[] | null {
  const idx = loadSlot(key);
  if (!idx) return null;
  const queryRow = idx.signToIdx.get(sign);
  if (queryRow === undefined) return null;

  const dim = idx.stats.embedding_dim;
  const V = idx.vocab.length;
  const qBase = queryRow * dim;

  // Small sorted-array min-heap; topK ≤ 50 in practice.
  const heap: { idx: number; cosine: number }[] = [];
  let heapMin = -Infinity;

  for (let j = 0; j < V; j++) {
    if (j === queryRow) continue;
    const jBase = j * dim;
    let s = 0;
    for (let k = 0; k < dim; k++) s += idx.vectors[qBase + k] * idx.vectors[jBase + k];
    if (s < minCosine) continue;
    if (heap.length < topK) {
      heap.push({ idx: j, cosine: s });
      if (heap.length === topK) {
        heap.sort((a, b) => a.cosine - b.cosine);
        heapMin = heap[0].cosine;
      }
    } else if (s > heapMin) {
      heap[0] = { idx: j, cosine: s };
      let p = 0;
      while (p + 1 < heap.length && heap[p].cosine > heap[p + 1].cosine) {
        const tmp = heap[p];
        heap[p] = heap[p + 1];
        heap[p + 1] = tmp;
        p++;
      }
      heapMin = heap[0].cosine;
    }
  }

  heap.sort((a, b) => b.cosine - a.cosine);
  return heap.map((h) => ({
    sign: idx.vocab[h.idx],
    cosine: +h.cosine.toFixed(4),
    occurrences: idx.occurrences[h.idx],
  }));
}

/**
 * Convenience: stats for every config in the ensemble grid (default or
 * caller-supplied). Triggers a lazy load of any not-yet-attempted slot.
 */
export function ensembleAllStats(
  grid: ReadonlyArray<EnsembleConfigKey> = DEFAULT_ENSEMBLE_GRID,
): EnsembleConfigStats[] {
  return grid.map((k) => ensembleConfigStats(k));
}

/**
 * Test-only: reset the lazy-load cache. The MCP server never calls this in
 * production, but ensemble-audit harnesses can use it to force a fresh load
 * after rebuilding caches mid-process.
 */
export function _resetEnsembleForTests(): void {
  _slots.clear();
}
