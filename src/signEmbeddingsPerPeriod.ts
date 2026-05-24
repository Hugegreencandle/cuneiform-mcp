// v0.26.0 — sign2vec per-period: diachronic sign-embedding loader.
//
// Companion to v0.23's signEmbeddings.ts (single corpus-wide config) and
// v0.25's signEmbeddingsEnsemble.ts (same corpus, varying hyperparameters).
// The v0.26 axis is *diachronic*: SAME hyperparameters (WINDOW=5,
// MIN_OCC=20 by default), but trained separately on Neo-Assyrian-only and
// Neo-Babylonian-only sub-corpora. A sign whose nearest neighbors differ
// between the NA and NB embeddings is a candidate diachronic substitution.
//
// Caches live at:
//   ~/.cache/cuneiform-mcp/sign-embeddings-period-NA.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-period-NB.json
//
// Built by scripts/build-sign-embeddings-per-period.mjs. The v0.23 single-
// corpus cache (sign-embeddings.json) and the v0.25 ensemble caches
// (sign-embeddings-w{N}-m{M}.json) are untouched.
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Public types ──────────────────────────────────────────────────────────

export type PeriodKey = "NA" | "NB";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  NA: "Neo-Assyrian",
  NB: "Neo-Babylonian",
};

export type PeriodEmbeddingStats = {
  period: PeriodKey;
  period_label: string;
  loaded: boolean;
  load_error: string | null;
  total_signs_indexed: number;
  embedding_dim: number;
  window_size: number;
  min_occurrences: number;
  algorithm: string;
  build_timestamp: string | null;
  total_corpus_occurrences: number;
  tablets_in_period: number;
  cache_path: string;
};

export type PeriodSignNeighbor = {
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
  period: PeriodKey;
  period_label: string;
  window_size: number;
  min_occurrences: number;
  embedding_dim: number;
  signs_indexed: number;
  total_corpus_occurrences: number;
  tablets_in_period: number;
  entries: DiskEntry[];
};

type LoadedIndex = {
  vectors: Float32Array;
  vocab: string[];
  signToIdx: Map<string, number>;
  occurrences: Int32Array;
  stats: PeriodEmbeddingStats;
};

type PeriodSlot = {
  period: PeriodKey;
  index: LoadedIndex | null;
  loadAttempted: boolean;
  loadError: string | null;
  cachePath: string;
};

// ─── Paths ─────────────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

export function periodCacheFilename(period: PeriodKey): string {
  return `sign-embeddings-period-${period}.json`;
}

export function periodCachePath(period: PeriodKey): string {
  return join(cacheDir(), periodCacheFilename(period));
}

// ─── Slot registry (lazy, per period) ──────────────────────────────────────

const _slots = new Map<PeriodKey, PeriodSlot>();

function getSlot(period: PeriodKey): PeriodSlot {
  const existing = _slots.get(period);
  if (existing) return existing;
  const slot: PeriodSlot = {
    period,
    index: null,
    loadAttempted: false,
    loadError: null,
    cachePath: periodCachePath(period),
  };
  _slots.set(period, slot);
  return slot;
}

function loadSlot(period: PeriodKey): LoadedIndex | null {
  const slot = getSlot(period);
  if (slot.index) return slot.index;
  if (slot.loadAttempted) return null;
  slot.loadAttempted = true;

  if (!existsSync(slot.cachePath)) {
    slot.loadError = `sign-embeddings per-period cache not found: ${slot.cachePath}. Run \`node scripts/build-sign-embeddings-per-period.mjs\`.`;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(slot.cachePath, "utf-8")) as DiskIndex;
    if (!raw || !Array.isArray(raw.entries)) {
      slot.loadError = `sign-embeddings per-period cache malformed at ${slot.cachePath}: missing entries[]`;
      return null;
    }
    const V = raw.entries.length;
    const dim = raw.embedding_dim;
    if (!Number.isFinite(dim) || dim <= 0) {
      slot.loadError = `sign-embeddings per-period cache at ${slot.cachePath} has invalid embedding_dim=${dim}`;
      return null;
    }
    if (raw.period !== period) {
      slot.loadError = `sign-embeddings per-period cache at ${slot.cachePath} reports period=${raw.period} but slot expects period=${period}`;
      return null;
    }

    const vectors = new Float32Array(V * dim);
    const vocab: string[] = new Array(V);
    const signToIdx = new Map<string, number>();
    const occurrences = new Int32Array(V);

    for (let i = 0; i < V; i++) {
      const e = raw.entries[i];
      if (!e || typeof e.sign !== "string" || !Array.isArray(e.vector) || e.vector.length !== dim) {
        slot.loadError = `sign-embeddings per-period cache at ${slot.cachePath}: entry ${i} malformed`;
        return null;
      }
      vocab[i] = e.sign;
      signToIdx.set(e.sign, i);
      occurrences[i] = e.occurrences ?? 0;
      const base = i * dim;
      for (let k = 0; k < dim; k++) vectors[base + k] = e.vector[k];
    }

    const stats: PeriodEmbeddingStats = {
      period,
      period_label: PERIOD_LABELS[period],
      loaded: true,
      load_error: null,
      total_signs_indexed: V,
      embedding_dim: dim,
      window_size: raw.window_size ?? -1,
      min_occurrences: raw.min_occurrences ?? -1,
      algorithm: raw.algorithm ?? "unknown",
      build_timestamp: raw.build_timestamp ?? null,
      total_corpus_occurrences: raw.total_corpus_occurrences ?? 0,
      tablets_in_period: raw.tablets_in_period ?? 0,
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

export function periodStats(period: PeriodKey): PeriodEmbeddingStats {
  const idx = loadSlot(period);
  const slot = getSlot(period);
  if (!idx) {
    return {
      period,
      period_label: PERIOD_LABELS[period],
      loaded: false,
      load_error: slot.loadError,
      total_signs_indexed: 0,
      embedding_dim: 0,
      window_size: 0,
      min_occurrences: 0,
      algorithm: "unknown",
      build_timestamp: null,
      total_corpus_occurrences: 0,
      tablets_in_period: 0,
      cache_path: slot.cachePath,
    };
  }
  return idx.stats;
}

export function periodHasSign(period: PeriodKey, sign: string): boolean {
  const idx = loadSlot(period);
  return idx?.signToIdx.has(sign) ?? false;
}

export function periodVocab(period: PeriodKey): string[] {
  const idx = loadSlot(period);
  if (!idx) return [];
  return idx.vocab.slice();
}

/**
 * Rank top-K nearest neighbors of `sign` within the per-period embedding.
 * Returns null if the index failed to load or `sign` is not in this
 * period's vocab. Use periodStats / periodHasSign to disambiguate.
 */
export function periodRankNeighbors(
  period: PeriodKey,
  sign: string,
  topK: number,
  minCosine: number,
): PeriodSignNeighbor[] | null {
  const idx = loadSlot(period);
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
 * Intersection of NA and NB vocabularies — signs present in both period
 * embeddings. The diachronic-substitution analysis lives over this set.
 */
export function commonSigns(): string[] {
  const na = loadSlot("NA");
  const nb = loadSlot("NB");
  if (!na || !nb) return [];
  const out: string[] = [];
  for (const s of na.vocab) if (nb.signToIdx.has(s)) out.push(s);
  return out;
}

/**
 * Convenience: stats for both periods. Triggers a lazy load of any
 * not-yet-attempted slot.
 */
export function allPeriodStats(): PeriodEmbeddingStats[] {
  return (["NA", "NB"] as PeriodKey[]).map((p) => periodStats(p));
}

/**
 * Test-only: reset the lazy-load cache. The MCP server never calls this in
 * production, but audit harnesses can use it to force a fresh load after
 * rebuilding caches mid-process.
 */
export function _resetPerPeriodForTests(): void {
  _slots.clear();
}
