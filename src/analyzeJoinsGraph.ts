// v0.30 — analyze_joins_graph: corpus-wide manuscript join-graph queries.
//
// Two modes:
//
//   1. top-hosts    — read ~/.cache/cuneiform-mcp/joins-graph.json (built by
//                     scripts/extract-joins-graph.mjs) and surface the top
//                     join-rich tablets corpus-wide, enriched with period +
//                     primary genre where the fragment-metadata cache holds
//                     them.
//
//   2. per-tablet   — fetch /fragments/{museum_number} from eBL live and
//                     parse the joins[] field (an array of join-groups, each
//                     group an array of MuseumNumberObject entries). Flatten
//                     into a direct_joins[] list, drop the query tablet
//                     itself, enrich each neighbor with cached metadata.
//
// The per-tablet path needs a live fetch because the local fragment-metadata
// cache only stores joins_count — the actual edge list isn't persisted (see
// fragmentMetadata.ts:220-223). One eBL round-trip per call is fine for an
// MCP tool; this is companion-of-record to find_join_candidates which already
// goes back to eBL when the local lineToVec corpus is stale.

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
} from "./fragmentMetadata.js";
import { museumNumberToString, type MuseumNumberObject } from "./types.js";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.30.0 (research; danebrown)";
const JOINS_GRAPH_FILE = "joins-graph.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type JoinsGraphCache = {
  version: string;
  build_timestamp: string;
  total_fragments_scanned: number;
  fragments_with_joins: number;
  total_join_edges: number;
  top_join_hosts: Array<{ tablet_id: string; joins_count: number }>;
  distribution: Record<string, number>;
};

export type JoinNeighbor = {
  tablet_id: string;
  period: string | null;
  genre: string | null;
};

export type JoinNeighborhood = {
  direct_joins: JoinNeighbor[];
  joins_count: number;
};

export type TopHostEntry = {
  tablet_id: string;
  joins_count: number;
  period: string | null;
  primary_genre: string | null;
};

export type AnalyzeJoinsGraphResult = {
  mode: "per-tablet" | "top-hosts";
  tablet_id?: string;
  join_neighborhood?: JoinNeighborhood;
  top_hosts?: TopHostEntry[];
  index_stats: {
    total_fragments_with_joins: number;
    total_join_edges: number;
    avg_joins_per_join_host: number;
  };
  warnings: string[];
};

export type AnalyzeJoinsGraphOptions = {
  tabletId?: string;
  listTopHosts?: boolean;
  topK?: number;
};

// ─── Cache loader ──────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), JOINS_GRAPH_FILE);
}

let _graphCache: JoinsGraphCache | null = null;
let _loadAttempted = false;

export function loadJoinsGraph(): JoinsGraphCache | null {
  if (_graphCache) return _graphCache;
  if (_loadAttempted) return _graphCache;
  _loadAttempted = true;
  const p = cachePath();
  if (!existsSync(p)) return null;
  try {
    _graphCache = JSON.parse(readFileSync(p, "utf-8")) as JoinsGraphCache;
    return _graphCache;
  } catch {
    return null;
  }
}

function indexStatsFrom(cache: JoinsGraphCache | null): AnalyzeJoinsGraphResult["index_stats"] {
  if (!cache || cache.fragments_with_joins === 0) {
    return {
      total_fragments_with_joins: 0,
      total_join_edges: 0,
      avg_joins_per_join_host: 0,
    };
  }
  const avg = cache.total_join_edges / cache.fragments_with_joins;
  return {
    total_fragments_with_joins: cache.fragments_with_joins,
    total_join_edges: cache.total_join_edges,
    avg_joins_per_join_host: Math.round(avg * 100) / 100,
  };
}

// ─── Per-tablet: live eBL fetch ────────────────────────────────────────────

type RawJoinEntry = { museumNumber?: MuseumNumberObject };

async function fetchJoinsFor(tabletId: string): Promise<RawJoinEntry[][] | "FETCH_ERROR" | "NOT_FOUND"> {
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(tabletId)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) return "NOT_FOUND";
    if (!res.ok) return "FETCH_ERROR";
    const body = (await res.json()) as Record<string, unknown>;
    const joins = body.joins as RawJoinEntry[][] | undefined;
    if (!Array.isArray(joins)) return [];
    return joins;
  } catch {
    return "FETCH_ERROR";
  }
}

function flattenJoins(groups: RawJoinEntry[][], queryId: string): string[] {
  const ids: string[] = [];
  const seen = new Set<string>([queryId]);
  for (const group of groups) {
    if (!Array.isArray(group)) continue;
    for (const entry of group) {
      if (!entry || !entry.museumNumber) continue;
      const id = museumNumberToString(entry.museumNumber);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
  }
  return ids;
}

function enrichNeighbor(id: string): JoinNeighbor {
  const md = getFragmentMetadata(id);
  return {
    tablet_id: id,
    period: getPeriod(md),
    genre: getPrimaryGenre(md),
  };
}

// ─── Top-hosts mode ────────────────────────────────────────────────────────

function topHosts(cache: JoinsGraphCache, k: number): TopHostEntry[] {
  return cache.top_join_hosts.slice(0, k).map((row) => {
    const md = getFragmentMetadata(row.tablet_id);
    return {
      tablet_id: row.tablet_id,
      joins_count: row.joins_count,
      period: getPeriod(md),
      primary_genre: getPrimaryGenre(md),
    };
  });
}

// ─── Public entry ──────────────────────────────────────────────────────────

export async function analyzeJoinsGraph(
  opts: AnalyzeJoinsGraphOptions,
): Promise<AnalyzeJoinsGraphResult> {
  const warnings: string[] = [];
  const cache = loadJoinsGraph();
  const stats = indexStatsFrom(cache);
  if (!cache) {
    warnings.push(
      `joins-graph cache missing at ${cachePath()} — run scripts/extract-joins-graph.mjs to build it.`,
    );
  }

  const tabletId = opts.tabletId && opts.tabletId.trim().length > 0 ? opts.tabletId.trim() : null;
  const wantTopHosts = !!opts.listTopHosts;
  const topK = Math.max(1, Math.min(500, opts.topK ?? 30));

  if (!tabletId && !wantTopHosts) {
    warnings.push("No mode selected — provide either `tablet_id` or `list_top_hosts: true`. Defaulting to top-hosts.");
  }

  // Per-tablet mode takes priority when an id is supplied.
  if (tabletId) {
    const groups = await fetchJoinsFor(tabletId);
    if (groups === "FETCH_ERROR") {
      warnings.push(`eBL fetch failed for ${tabletId} — network error or upstream unavailable.`);
      return {
        mode: "per-tablet",
        tablet_id: tabletId,
        join_neighborhood: { direct_joins: [], joins_count: 0 },
        index_stats: stats,
        warnings,
      };
    }
    if (groups === "NOT_FOUND") {
      warnings.push(`eBL returned 404 for ${tabletId} — museum number unknown or not in Fragmentarium.`);
      return {
        mode: "per-tablet",
        tablet_id: tabletId,
        join_neighborhood: { direct_joins: [], joins_count: 0 },
        index_stats: stats,
        warnings,
      };
    }
    const neighborIds = flattenJoins(groups, tabletId);
    const direct = neighborIds.map(enrichNeighbor);
    return {
      mode: "per-tablet",
      tablet_id: tabletId,
      join_neighborhood: { direct_joins: direct, joins_count: direct.length },
      index_stats: stats,
      warnings,
    };
  }

  // Top-hosts mode (default).
  if (!cache) {
    return {
      mode: "top-hosts",
      top_hosts: [],
      index_stats: stats,
      warnings,
    };
  }
  return {
    mode: "top-hosts",
    top_hosts: topHosts(cache, topK),
    index_stats: stats,
    warnings,
  };
}
