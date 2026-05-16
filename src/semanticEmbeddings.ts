// v0.15.0 — Mode C semantic embeddings (Random Indexing distributional semantics).
//
// Loads pre-built tablet-level embeddings from $CUNEIFORM_MCP_CACHE_DIR/
// (produced by scripts/build-embeddings.mjs) and exposes thematic-parallel
// lookup over precomputed top-K cosine neighbors.
//
// Why Random Indexing (Sahlgren 2005): approximates LSA/PPMI-SVD without
// SVD's cost. Each sign gets a sparse k-of-d random index vector; each
// sign's context vector accumulates the index vectors of its window
// neighbors. Tablet vectors = IDF-weighted mean of sign vectors,
// L2-normalized. Cosine over tablet vectors approximates thematic
// similarity in a way trigram-Jaccard cannot — two tablets can share zero
// trigrams yet still cluster together if their constituent signs appear
// in similar distributional contexts.
//
// The build script precomputes top-30 neighbors per tablet; this module
// just loads + filters. Lazy load on first call (~150 ms for ~15 MB JSON).
//
// Pure stdlib — no new dependencies.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const NEIGHBORS_FILE = "tablet-neighbors.json";
const METADATA_FILE = "tabletMetadata.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type ThematicNeighbor = {
  id: string;
  score: number;
  period?: string;
  genre?: string;
  designation?: string;
  city?: string;
};

export type ThematicParallelResult = {
  tablet_id: string;
  neighbors: ThematicNeighbor[];
  filters_applied: {
    min_cosine: number;
    period?: string;
    genre?: string;
  };
  index_stats: {
    total_tablets: number;
    embedding_dim: number;
    method: string;
    vocab_size: number;
    generated_at: string | null;
  };
  warnings: string[];
};

// ─── Index types ───────────────────────────────────────────────────────────

type NeighborRecord = { id: string; score: number };
type TabletMeta = {
  period?: string;
  genre?: string;
  designation?: string;
  city?: string;
};

type EmbeddingIndex = {
  neighbors: Map<string, NeighborRecord[]>;
  meta: Map<string, TabletMeta>;
  stats: {
    total_tablets: number;
    embedding_dim: number;
    method: string;
    vocab_size: number;
    generated_at: string | null;
  };
};

let CACHED: EmbeddingIndex | null = null;
let LOAD_ATTEMPTED = false;
let LOAD_ERROR: string | null = null;

// ─── Lazy load ─────────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function dataDir(): string {
  return join(homedir(), "Desktop", "cuneiform-mcp", "data");
}

function loadIndex(): EmbeddingIndex | null {
  if (CACHED) return CACHED;
  if (LOAD_ATTEMPTED) return null;
  LOAD_ATTEMPTED = true;

  const neighborsPath = join(cacheDir(), NEIGHBORS_FILE);
  if (!existsSync(neighborsPath)) {
    LOAD_ERROR = `${neighborsPath} not found — run \`node scripts/build-embeddings.mjs\``;
    return null;
  }

  try {
    const raw = JSON.parse(readFileSync(neighborsPath, "utf-8")) as {
      _meta?: {
        version?: string;
        method?: string;
        config?: { DIM?: number };
        vocab_size?: number;
        total_tablets?: number;
        generated_at?: string;
      };
      neighbors: Record<string, NeighborRecord[]>;
    };
    const neighborsMap = new Map<string, NeighborRecord[]>();
    for (const [id, list] of Object.entries(raw.neighbors)) neighborsMap.set(id, list);

    const meta = new Map<string, TabletMeta>();
    const metaPath = join(dataDir(), METADATA_FILE);
    if (existsSync(metaPath)) {
      try {
        const m = JSON.parse(readFileSync(metaPath, "utf-8")) as {
          tablets?: Record<string, TabletMeta>;
        };
        for (const [id, info] of Object.entries(m.tablets ?? {})) meta.set(id, info);
      } catch {}
    }

    CACHED = {
      neighbors: neighborsMap,
      meta,
      stats: {
        total_tablets: raw._meta?.total_tablets ?? neighborsMap.size,
        embedding_dim: raw._meta?.config?.DIM ?? 0,
        method: raw._meta?.method ?? "random_indexing",
        vocab_size: raw._meta?.vocab_size ?? 0,
        generated_at: raw._meta?.generated_at ?? null,
      },
    };
    return CACHED;
  } catch (e) {
    LOAD_ERROR = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function findThematicParallel(
  tabletId: string,
  opts: {
    topK?: number;
    minCosine?: number;
    filterPeriod?: string;
    filterGenre?: string;
  } = {},
): ThematicParallelResult {
  const topK = Math.max(1, Math.min(30, opts.topK ?? 10));
  const minCosine = opts.minCosine ?? 0.5;
  const filterPeriod = opts.filterPeriod;
  const filterGenre = opts.filterGenre;

  const idx = loadIndex();
  if (!idx) {
    return {
      tablet_id: tabletId,
      neighbors: [],
      filters_applied: { min_cosine: minCosine, period: filterPeriod, genre: filterGenre },
      index_stats: {
        total_tablets: 0,
        embedding_dim: 0,
        method: "random_indexing",
        vocab_size: 0,
        generated_at: null,
      },
      warnings: [LOAD_ERROR ?? "embeddings index unavailable"],
    };
  }

  const list = idx.neighbors.get(tabletId);
  if (!list) {
    const warnings: string[] = [`tablet '${tabletId}' not in embedding index`];
    if (idx.stats.total_tablets > 0) {
      warnings.push(
        `index contains ${idx.stats.total_tablets} tablets — id may be below the MIN_TABLET_SIGNS=20 threshold, or in the v0.14.4 exclusion list, or unknown.`,
      );
    }
    return {
      tablet_id: tabletId,
      neighbors: [],
      filters_applied: { min_cosine: minCosine, period: filterPeriod, genre: filterGenre },
      index_stats: idx.stats,
      warnings,
    };
  }

  const warnings: string[] = [];
  const out: ThematicNeighbor[] = [];
  for (const n of list) {
    if (n.score < minCosine) break; // list is sorted desc
    const m = idx.meta.get(n.id);
    if (filterPeriod && m?.period !== filterPeriod) continue;
    if (filterGenre && m?.genre !== filterGenre) continue;
    out.push({
      id: n.id,
      score: n.score,
      ...(m?.period ? { period: m.period } : {}),
      ...(m?.genre ? { genre: m.genre } : {}),
      ...(m?.designation ? { designation: m.designation } : {}),
      ...(m?.city ? { city: m.city } : {}),
    });
    if (out.length >= topK) break;
  }

  if ((filterPeriod || filterGenre) && out.length === 0 && list.length > 0) {
    warnings.push(
      `no neighbors matched the period/genre filter (${list.length} candidates available unfiltered)`,
    );
  }

  return {
    tablet_id: tabletId,
    neighbors: out,
    filters_applied: { min_cosine: minCosine, period: filterPeriod, genre: filterGenre },
    index_stats: idx.stats,
    warnings,
  };
}

export function embeddingStats(): {
  loaded: boolean;
  load_error: string | null;
  total_tablets: number;
  embedding_dim: number;
  method: string;
  vocab_size: number;
  generated_at: string | null;
} {
  const idx = loadIndex();
  if (!idx) {
    return {
      loaded: false,
      load_error: LOAD_ERROR,
      total_tablets: 0,
      embedding_dim: 0,
      method: "random_indexing",
      vocab_size: 0,
      generated_at: null,
    };
  }
  return { loaded: true, load_error: null, ...idx.stats };
}

export function hasTabletEmbedding(tabletId: string): boolean {
  const idx = loadIndex();
  return idx?.neighbors.has(tabletId) ?? false;
}
