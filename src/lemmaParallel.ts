// v0.44.0 — find_lemma_parallel.
//
// Panel-review Tier-3 #9: lemma-aware textual parallels, complementary to
// the v0.18 sign-trigram approach. Where trigrams measure orthographic
// reuse (same signs in same order), lemmas measure lexical reuse (same
// underlying Akkadian/Sumerian words, irrespective of writing variant).
//
// Data dependency: ~/.cache/cuneiform-mcp/lemma-index.json, built by
// scripts/build-lemma-index.mjs (one-time polite-pace eBL enrichment).
// Cache structure:
//   {
//     "version": "1.0.0",
//     "built_at": "...",
//     "source": "eBL /fragments/{id} → lemmas[] extraction",
//     "entries": {
//       "K.5896": { lemmas: ["ana", "bīt", "salāʾ", ...], n_lemmas: 1234 },
//       "K.9508": { lemmas: ["ana", "mīs", "pî", ...], n_lemmas: 152 },
//       ...
//     }
//   }
//
// Cache-free fallback: graceful warning + empty results, telling caller
// how to populate.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const LEMMA_INDEX_FILE = "lemma-index.json";

export type LemmaEntry = {
  lemmas: string[];
  n_lemmas: number;
};

export type LemmaIndex = {
  version: string;
  built_at: string;
  source: string;
  entries: Record<string, LemmaEntry>;
};

export type LemmaParallelCandidate = {
  tablet_id: string;
  shared_lemmas: string[];
  intersection_size: number;
  union_size: number;
  jaccard: number;
  candidate_lemma_count: number;
};

export type FindLemmaParallelResult = {
  query: {
    tablet_id: string;
    n_lemmas: number;
    top_k: number;
    min_jaccard: number;
  };
  candidates: LemmaParallelCandidate[];
  index_stats: {
    cache_loaded: boolean;
    cache_version: string | null;
    cache_built_at: string | null;
    n_tablets_in_index: number;
  };
  warnings: string[];
};

export type FindLemmaParallelOptions = {
  tabletId: string;
  topK?: number;
  minJaccard?: number;
  excludeSelf?: boolean;
  maxSharedSampleSize?: number;
};

// ─── Cache loader ──────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), LEMMA_INDEX_FILE);
}

let _index: LemmaIndex | null = null;
let _loadAttempted = false;
let _loadError: string | null = null;

export function loadLemmaIndex(): LemmaIndex | null {
  if (_index) return _index;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  const path = cachePath();
  if (!existsSync(path)) {
    _loadError = `lemma index not built: ${path} missing — run scripts/build-lemma-index.mjs`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as LemmaIndex;
    if (typeof parsed.entries !== "object" || parsed.entries === null) {
      _loadError = "lemma index: entries field invalid";
      return null;
    }
    _index = parsed;
    return parsed;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function getLemmaIndexLoadError(): string | null {
  return _loadError;
}

export function _resetForTests(): void {
  _index = null;
  _loadAttempted = false;
  _loadError = null;
}

// ─── Lemma-set Jaccard ─────────────────────────────────────────────────────

function jaccard(a: Set<string>, b: Set<string>): { intersection: string[]; union_size: number; jaccard: number } {
  if (a.size === 0 || b.size === 0) {
    return { intersection: [], union_size: a.size + b.size, jaccard: 0 };
  }
  const intersection: string[] = [];
  // Iterate smaller for speed.
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const x of smaller) if (larger.has(x)) intersection.push(x);
  const union = a.size + b.size - intersection.length;
  return { intersection, union_size: union, jaccard: union > 0 ? intersection.length / union : 0 };
}

// ─── Main entry point ──────────────────────────────────────────────────────

export function findLemmaParallel(opts: FindLemmaParallelOptions): FindLemmaParallelResult {
  const warnings: string[] = [];
  const tabletId = opts.tabletId.trim();
  const topK = Math.max(1, Math.min(200, opts.topK ?? 20));
  const minJaccard = Math.max(0, Math.min(1, opts.minJaccard ?? 0.05));
  const excludeSelf = opts.excludeSelf ?? true;
  const maxSampleSize = Math.max(1, Math.min(50, opts.maxSharedSampleSize ?? 10));

  const index = loadLemmaIndex();
  if (!index) {
    const err = getLemmaIndexLoadError();
    if (err) warnings.push(err);
    return {
      query: { tablet_id: tabletId, n_lemmas: 0, top_k: topK, min_jaccard: minJaccard },
      candidates: [],
      index_stats: { cache_loaded: false, cache_version: null, cache_built_at: null, n_tablets_in_index: 0 },
      warnings,
    };
  }

  const queryEntry = index.entries[tabletId];
  if (!queryEntry) {
    warnings.push(`tablet '${tabletId}' not in lemma index (only ${Object.keys(index.entries).length} tablets indexed)`);
    return {
      query: { tablet_id: tabletId, n_lemmas: 0, top_k: topK, min_jaccard: minJaccard },
      candidates: [],
      index_stats: {
        cache_loaded: true,
        cache_version: index.version,
        cache_built_at: index.built_at,
        n_tablets_in_index: Object.keys(index.entries).length,
      },
      warnings,
    };
  }

  const querySet = new Set(queryEntry.lemmas);

  const candidates: LemmaParallelCandidate[] = [];
  for (const [otherId, otherEntry] of Object.entries(index.entries)) {
    if (excludeSelf && otherId === tabletId) continue;
    if (otherEntry.lemmas.length === 0) continue;
    const otherSet = new Set(otherEntry.lemmas);
    const j = jaccard(querySet, otherSet);
    if (j.jaccard < minJaccard) continue;
    candidates.push({
      tablet_id: otherId,
      shared_lemmas: j.intersection.slice(0, maxSampleSize),
      intersection_size: j.intersection.length,
      union_size: j.union_size,
      jaccard: j.jaccard,
      candidate_lemma_count: otherSet.size,
    });
  }

  candidates.sort((a, b) => b.jaccard - a.jaccard || a.tablet_id.localeCompare(b.tablet_id));
  const limited = candidates.slice(0, topK);

  return {
    query: {
      tablet_id: tabletId,
      n_lemmas: queryEntry.n_lemmas,
      top_k: topK,
      min_jaccard: minJaccard,
    },
    candidates: limited,
    index_stats: {
      cache_loaded: true,
      cache_version: index.version,
      cache_built_at: index.built_at,
      n_tablets_in_index: Object.keys(index.entries).length,
    },
    warnings,
  };
}
