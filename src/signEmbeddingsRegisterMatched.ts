// v0.27.0 — sign2vec register-matched per-period: isolates the diachronic
// axis from the register confound that v0.26 honestly flagged.
//
// v0.26 shipped per-period sign embeddings (NA / NB) and the Round-11 audit
// found 44.2 % full top-5 turnover. RELEASE-v0.26.md flagged this as
// "diachronic + register drift, not pure diachronic" because NA is dominated
// by Library of Ashurbanipal canonical literature while NB skews toward
// administrative/archival texts. v0.27 trains on register-MATCHED sub-corpora
// so the diachronic axis is the only thing varying between two embeddings
// for any single register.
//
// Companion loader to v0.26's signEmbeddingsPerPeriod.ts. Keyed by
// (register, period). Caches live at:
//   ~/.cache/cuneiform-mcp/sign-embeddings-{register}-{period}.json
//
// Built by scripts/build-sign-embeddings-register-matched.mjs. The v0.23
// single-config cache, v0.25 ensemble caches, and v0.26 per-period caches
// are untouched.
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Public types ──────────────────────────────────────────────────────────

export type PeriodKey = "NA" | "NB";
export type RegisterKey = "divination" | "magic" | "literature";

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  NA: "Neo-Assyrian",
  NB: "Neo-Babylonian",
};

export const REGISTER_LABELS: Record<RegisterKey, string> = {
  divination: "Divination (omens, extispicy, celestial, terrestrial)",
  magic: "Magic (āšipūtu — exorcistic, apotropaic, ritual)",
  literature: "Literature (hymns, lamentations, myth)",
};

/**
 * Genre-substring patterns used to filter tablets per register. The build
 * script does `metadata.genres_flat.some(g => REGISTER_PATTERNS[r].includes(g))`.
 * Kept here so the loader, build script, and audit all agree on what a
 * register IS.
 */
export const REGISTER_PATTERNS: Record<RegisterKey, string[]> = {
  divination: ["Divination"],
  magic: ["Magic"],
  literature: ["Literature"],
};

export const ALL_REGISTERS: RegisterKey[] = ["divination", "magic", "literature"];
export const ALL_PERIODS: PeriodKey[] = ["NA", "NB"];

export type RegisterEmbeddingStats = {
  register: RegisterKey;
  register_label: string;
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
  tablets_in_bucket: number;
  cache_path: string;
};

export type RegisterSignNeighbor = {
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
  register: RegisterKey;
  register_label: string;
  period: PeriodKey;
  period_label: string;
  window_size: number;
  min_occurrences: number;
  embedding_dim: number;
  signs_indexed: number;
  total_corpus_occurrences: number;
  tablets_in_bucket: number;
  entries: DiskEntry[];
};

type LoadedIndex = {
  vectors: Float32Array;
  vocab: string[];
  signToIdx: Map<string, number>;
  occurrences: Int32Array;
  stats: RegisterEmbeddingStats;
};

type BucketSlot = {
  register: RegisterKey;
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

export function bucketCacheFilename(register: RegisterKey, period: PeriodKey): string {
  return `sign-embeddings-${register}-${period}.json`;
}

export function bucketCachePath(register: RegisterKey, period: PeriodKey): string {
  return join(cacheDir(), bucketCacheFilename(register, period));
}

function bucketKey(register: RegisterKey, period: PeriodKey): string {
  return `${register}/${period}`;
}

// ─── Slot registry (lazy, per (register, period)) ──────────────────────────

const _slots = new Map<string, BucketSlot>();

function getSlot(register: RegisterKey, period: PeriodKey): BucketSlot {
  const key = bucketKey(register, period);
  const existing = _slots.get(key);
  if (existing) return existing;
  const slot: BucketSlot = {
    register,
    period,
    index: null,
    loadAttempted: false,
    loadError: null,
    cachePath: bucketCachePath(register, period),
  };
  _slots.set(key, slot);
  return slot;
}

function loadSlot(register: RegisterKey, period: PeriodKey): LoadedIndex | null {
  const slot = getSlot(register, period);
  if (slot.index) return slot.index;
  if (slot.loadAttempted) return null;
  slot.loadAttempted = true;

  if (!existsSync(slot.cachePath)) {
    slot.loadError = `sign-embeddings register-matched cache not found: ${slot.cachePath}. Run \`node scripts/build-sign-embeddings-register-matched.mjs\`.`;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(slot.cachePath, "utf-8")) as DiskIndex;
    if (!raw || !Array.isArray(raw.entries)) {
      slot.loadError = `sign-embeddings register-matched cache malformed at ${slot.cachePath}: missing entries[]`;
      return null;
    }
    const V = raw.entries.length;
    const dim = raw.embedding_dim;
    if (!Number.isFinite(dim) || dim <= 0) {
      slot.loadError = `sign-embeddings register-matched cache at ${slot.cachePath} has invalid embedding_dim=${dim}`;
      return null;
    }
    if (raw.period !== period) {
      slot.loadError = `sign-embeddings register-matched cache at ${slot.cachePath} reports period=${raw.period} but slot expects period=${period}`;
      return null;
    }
    if (raw.register !== register) {
      slot.loadError = `sign-embeddings register-matched cache at ${slot.cachePath} reports register=${raw.register} but slot expects register=${register}`;
      return null;
    }

    const vectors = new Float32Array(V * dim);
    const vocab: string[] = new Array(V);
    const signToIdx = new Map<string, number>();
    const occurrences = new Int32Array(V);

    for (let i = 0; i < V; i++) {
      const e = raw.entries[i];
      if (!e || typeof e.sign !== "string" || !Array.isArray(e.vector) || e.vector.length !== dim) {
        slot.loadError = `sign-embeddings register-matched cache at ${slot.cachePath}: entry ${i} malformed`;
        return null;
      }
      vocab[i] = e.sign;
      signToIdx.set(e.sign, i);
      occurrences[i] = e.occurrences ?? 0;
      const base = i * dim;
      for (let k = 0; k < dim; k++) vectors[base + k] = e.vector[k];
    }

    const stats: RegisterEmbeddingStats = {
      register,
      register_label: REGISTER_LABELS[register],
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
      tablets_in_bucket: raw.tablets_in_bucket ?? 0,
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

export function bucketStats(register: RegisterKey, period: PeriodKey): RegisterEmbeddingStats {
  const idx = loadSlot(register, period);
  const slot = getSlot(register, period);
  if (!idx) {
    return {
      register,
      register_label: REGISTER_LABELS[register],
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
      tablets_in_bucket: 0,
      cache_path: slot.cachePath,
    };
  }
  return idx.stats;
}

export function bucketHasSign(register: RegisterKey, period: PeriodKey, sign: string): boolean {
  const idx = loadSlot(register, period);
  return idx?.signToIdx.has(sign) ?? false;
}

export function bucketVocab(register: RegisterKey, period: PeriodKey): string[] {
  const idx = loadSlot(register, period);
  if (!idx) return [];
  return idx.vocab.slice();
}

/**
 * Rank top-K nearest neighbors of `sign` within the (register, period)
 * embedding. Returns null if the index failed to load or `sign` is not in
 * this bucket's vocab. Use bucketStats / bucketHasSign to disambiguate.
 */
export function bucketRankNeighbors(
  register: RegisterKey,
  period: PeriodKey,
  sign: string,
  topK: number,
  minCosine: number,
): RegisterSignNeighbor[] | null {
  const idx = loadSlot(register, period);
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
 * Intersection of a register's NA and NB vocabularies — signs present in
 * BOTH period embeddings for the same register. Register-matched
 * diachronic-substitution analysis lives over this set.
 */
export function commonSignsForRegister(register: RegisterKey): string[] {
  const na = loadSlot(register, "NA");
  const nb = loadSlot(register, "NB");
  if (!na || !nb) return [];
  const out: string[] = [];
  for (const s of na.vocab) if (nb.signToIdx.has(s)) out.push(s);
  return out;
}

/**
 * For "auto" register resolution: among the configured registers, return
 * the one with the largest (NA-presence + NB-presence) for `sign` across
 * (register, NA) and (register, NB) — i.e. the register that "most shares"
 * this sign. Ties broken by alphabetical order (deterministic). Returns
 * null if no register has the sign present in BOTH periods.
 */
export function pickMostSharedRegister(sign: string): RegisterKey | null {
  let best: RegisterKey | null = null;
  let bestScore = -1;
  for (const r of ALL_REGISTERS) {
    const inNa = bucketHasSign(r, "NA", sign);
    const inNb = bucketHasSign(r, "NB", sign);
    if (!inNa || !inNb) continue;
    // Score by the smaller of the two occurrence counts (we want the
    // register where the sign is well-supported in BOTH periods, not one).
    const naStats = bucketStats(r, "NA");
    const nbStats = bucketStats(r, "NB");
    const score = Math.min(naStats.tablets_in_bucket, nbStats.tablets_in_bucket);
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/**
 * Convenience: stats for every (register, period) bucket. Triggers a lazy
 * load of any not-yet-attempted slot.
 */
export function allBucketStats(): RegisterEmbeddingStats[] {
  const out: RegisterEmbeddingStats[] = [];
  for (const r of ALL_REGISTERS) {
    for (const p of ALL_PERIODS) {
      out.push(bucketStats(r, p));
    }
  }
  return out;
}

/**
 * Test-only: reset the lazy-load cache. The MCP server never calls this in
 * production, but audit harnesses can use it to force a fresh load after
 * rebuilding caches mid-process.
 */
export function _resetRegisterMatchedForTests(): void {
  _slots.clear();
}
