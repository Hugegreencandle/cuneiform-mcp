// v0.23.0 — sign2vec: per-sign semantic embeddings (PPMI + truncated SVD).
//
// Loader + accessor + ranking layer for the sign-embeddings index built by
// scripts/build-sign-embeddings.mjs. Lazy-loaded on first call; held in
// memory for the lifetime of the process. Used by findSimilarSigns to expose
// "which signs mean the same thing?" as a query primitive.
//
// Companion to semanticEmbeddings.ts (v0.15 tablet-level Random Indexing).
// That module operates on per-TABLET vectors; this one on per-SIGN vectors.
// The two axes are orthogonal — tablet embeddings approximate thematic
// similarity (composition-level); sign embeddings approximate distributional
// equivalence (logogram-substitution detection, period-specific sign
// equivalences, phonetic/semantic clusters).
//
// Algorithm provenance is recorded in scripts/build-sign-embeddings.mjs
// (Levy & Goldberg 2014 PPMI-SVD baseline with randomized truncated SVD via
// Halko–Martinsson–Tropp 2011).
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SIGN_EMBEDDINGS_FILE = "sign-embeddings.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type SignEmbeddingStats = {
  loaded: boolean;
  load_error: string | null;
  total_signs_indexed: number;
  embedding_dim: number;
  window_size: number;
  min_occurrences: number;
  algorithm: string;
  build_timestamp: string | null;
  total_corpus_occurrences: number;
};

export type SignEmbeddingEntry = {
  sign: string;
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

type SignIndex = {
  /** Packed Float32 matrix [V × DIM] for fast cosine. */
  vectors: Float32Array;
  /** Parallel vocab list — index → sign code. */
  vocab: string[];
  /** Reverse map for O(1) sign → row index. */
  signToIdx: Map<string, number>;
  /** Per-sign corpus occurrences. */
  occurrences: Int32Array;
  stats: SignEmbeddingStats;
};

let _index: SignIndex | null = null;
let _loadAttempted = false;
let _loadError: string | null = null;

// ─── Paths ─────────────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), SIGN_EMBEDDINGS_FILE);
}

// ─── Lazy load ─────────────────────────────────────────────────────────────

function loadIndex(): SignIndex | null {
  if (_index) return _index;
  if (_loadAttempted) return null;
  _loadAttempted = true;

  const path = cachePath();
  if (!existsSync(path)) {
    _loadError = `sign-embeddings not found: ${path}. Run \`node scripts/build-sign-embeddings.mjs\`.`;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as DiskIndex;
    if (!raw || !Array.isArray(raw.entries)) {
      _loadError = `sign-embeddings malformed at ${path}: missing entries[]`;
      return null;
    }
    const V = raw.entries.length;
    const dim = raw.embedding_dim;
    if (!Number.isFinite(dim) || dim <= 0) {
      _loadError = `sign-embeddings has invalid embedding_dim=${dim}`;
      return null;
    }

    const vectors = new Float32Array(V * dim);
    const vocab: string[] = new Array(V);
    const signToIdx = new Map<string, number>();
    const occurrences = new Int32Array(V);

    for (let i = 0; i < V; i++) {
      const e = raw.entries[i];
      if (!e || typeof e.sign !== "string" || !Array.isArray(e.vector) || e.vector.length !== dim) {
        _loadError = `sign-embeddings entry ${i} malformed`;
        return null;
      }
      vocab[i] = e.sign;
      signToIdx.set(e.sign, i);
      occurrences[i] = e.occurrences ?? 0;
      const base = i * dim;
      for (let k = 0; k < dim; k++) vectors[base + k] = e.vector[k];
    }

    _index = {
      vectors,
      vocab,
      signToIdx,
      occurrences,
      stats: {
        loaded: true,
        load_error: null,
        total_signs_indexed: V,
        embedding_dim: dim,
        window_size: raw.window_size ?? -1,
        min_occurrences: raw.min_occurrences ?? -1,
        algorithm: raw.algorithm ?? "unknown",
        build_timestamp: raw.build_timestamp ?? null,
        total_corpus_occurrences: raw.total_corpus_occurrences ?? 0,
      },
    };
    return _index;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function signEmbeddingStats(): SignEmbeddingStats {
  const idx = loadIndex();
  if (!idx) {
    return {
      loaded: false,
      load_error: _loadError,
      total_signs_indexed: 0,
      embedding_dim: 0,
      window_size: 0,
      min_occurrences: 0,
      algorithm: "unknown",
      build_timestamp: null,
      total_corpus_occurrences: 0,
    };
  }
  return idx.stats;
}

export function hasSignEmbedding(sign: string): boolean {
  const idx = loadIndex();
  return idx?.signToIdx.has(sign) ?? false;
}

export function getSignEmbeddingLoadError(): string | null {
  if (!_loadAttempted) loadIndex();
  return _loadError;
}

/**
 * Return the L2-normalized embedding for `sign`, or null if not indexed.
 * Returned vector is a copy — callers may freely mutate.
 */
export function getSignVector(sign: string): Float32Array | null {
  const idx = loadIndex();
  if (!idx) return null;
  const i = idx.signToIdx.get(sign);
  if (i === undefined) return null;
  const dim = idx.stats.embedding_dim;
  const out = new Float32Array(dim);
  const base = i * dim;
  for (let k = 0; k < dim; k++) out[k] = idx.vectors[base + k];
  return out;
}

export function getSignOccurrences(sign: string): number {
  const idx = loadIndex();
  if (!idx) return 0;
  const i = idx.signToIdx.get(sign);
  if (i === undefined) return 0;
  return idx.occurrences[i];
}

export type SignNeighbor = {
  sign: string;
  cosine: number;
  occurrences: number;
};

/**
 * Rank every indexed sign (except `sign` itself) by cosine similarity to
 * `sign`, return the top `topK` with cosine ≥ `minCosine`.
 *
 * Returns null when the index is unavailable or `sign` is not in the vocab.
 * Callers should distinguish those two cases via `hasSignEmbedding` /
 * `signEmbeddingStats().loaded`.
 */
export function rankSignNeighbors(
  sign: string,
  topK: number,
  minCosine: number,
): SignNeighbor[] | null {
  const idx = loadIndex();
  if (!idx) return null;
  const queryRow = idx.signToIdx.get(sign);
  if (queryRow === undefined) return null;

  const dim = idx.stats.embedding_dim;
  const V = idx.vocab.length;
  const qBase = queryRow * dim;

  // Maintain a min-heap of size `topK` sorted ascending by cosine. We use a
  // simple sorted-array implementation here since topK is small (cap 50).
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
      // Bubble up to maintain ascending sort.
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
 * Return the top-N most frequent signs in the vocab. Used by the audit script
 * to pick benchmark signs without baking specific ABZ codes into the test.
 */
export function topMostFrequentSigns(n: number): SignEmbeddingEntry[] {
  const idx = loadIndex();
  if (!idx) return [];
  const all: SignEmbeddingEntry[] = [];
  for (let i = 0; i < idx.vocab.length; i++) {
    all.push({ sign: idx.vocab[i], occurrences: idx.occurrences[i] });
  }
  all.sort((a, b) => b.occurrences - a.occurrences);
  return all.slice(0, n);
}
