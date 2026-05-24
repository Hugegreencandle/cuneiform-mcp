// v0.20.0 — trace_chunk_diffusion: chronological diffusion of a single chunk.
//
// Given a chunk (by hash, or by source tablet + chunk index), return its
// hosts grouped by period and ordered chronologically. The diffusion array
// is the corpus-level transmission map for a passage — Old Babylonian →
// Middle Babylonian → Neo-Assyrian → Neo-Babylonian → Hellenistic for the
// canonical KAR-44 *āšipūtu* curriculum, for example.
//
// Backbone: chunk-hash index (src/chunkIndex.ts) + periodChronology.ts.
// Metadata via fragmentMetadata.ts.

import {
  getChunkByHash,
  getChunkIndexLoadError,
  getChunksContaining,
  loadChunkIndex,
  type ChunkIndexEntry,
} from "./chunkIndex.js";
import { getFragmentMetadata, getPeriod, getPrimaryGenre } from "./fragmentMetadata.js";
import { getPeriodInfo, periodSortKey } from "./periodChronology.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DiffusionTablet = {
  tablet_id: string;
  genre: string | null;
};

export type DiffusionPeriodBucket = {
  period: string | null;
  period_sort_key: number;
  approx_start_bce: number | null;
  approx_end_bce: number | null;
  tablets: DiffusionTablet[];
};

export type ChunkDiffusionResult = {
  chunk_hash: string | null;
  chunk_signs: string;
  chunk_length: number;
  diffusion: DiffusionPeriodBucket[];
  earliest_period: string | null;
  latest_period: string | null;
  /** Approx span in years; null if any endpoint is unknown. */
  period_span_years_approx: number | null;
  cross_period_count: number;
  hosts_total: number;
  hosts_with_period: number;
  warnings: string[];
};

export type ChunkDiffusionOptions = {
  chunkHash?: string;
  tabletId?: string;
  chunkIndexInTablet?: number; // 0-based selector within getChunksContaining(tabletId)
};

// ─── Implementation ────────────────────────────────────────────────────────

function emptyResult(warnings: string[]): ChunkDiffusionResult {
  return {
    chunk_hash: null,
    chunk_signs: "",
    chunk_length: 0,
    diffusion: [],
    earliest_period: null,
    latest_period: null,
    period_span_years_approx: null,
    cross_period_count: 0,
    hosts_total: 0,
    hosts_with_period: 0,
    warnings,
  };
}

export function traceChunkDiffusion(opts: ChunkDiffusionOptions): ChunkDiffusionResult {
  const warnings: string[] = [];
  const index = loadChunkIndex();
  if (!index) {
    return emptyResult([getChunkIndexLoadError() ?? "chunk-index unavailable"]);
  }

  let entry: ChunkIndexEntry | null = null;
  if (opts.chunkHash) {
    entry = getChunkByHash(opts.chunkHash);
    if (!entry) return emptyResult([`chunk_hash '${opts.chunkHash}' not in index`]);
  } else if (opts.tabletId) {
    const candidates = getChunksContaining(opts.tabletId);
    if (candidates.length === 0) {
      return emptyResult([`tablet '${opts.tabletId}' has no non-singleton chunks in the index`]);
    }
    const which = Math.max(0, Math.min(candidates.length - 1, opts.chunkIndexInTablet ?? 0));
    entry = candidates[which];
  } else {
    return emptyResult(["must provide chunk_hash or tablet_id"]);
  }

  // Bucket hosts by period.
  const buckets = new Map<string, DiffusionPeriodBucket>();
  let hostsWithPeriod = 0;
  for (const occ of entry.occurrences) {
    const meta = getFragmentMetadata(occ.tablet_id);
    const period = getPeriod(meta);
    const genre = getPrimaryGenre(meta);
    const sortKey = periodSortKey(period);
    const periodKey = period ?? "(unknown)";
    let bucket = buckets.get(periodKey);
    if (!bucket) {
      const info = getPeriodInfo(period);
      bucket = {
        period: period,
        period_sort_key: sortKey,
        approx_start_bce: info?.approx_start_bce ?? null,
        approx_end_bce: info?.approx_end_bce ?? null,
        tablets: [],
      };
      buckets.set(periodKey, bucket);
    }
    bucket.tablets.push({ tablet_id: occ.tablet_id, genre: genre ?? null });
    if (period) hostsWithPeriod++;
  }

  const diffusion = Array.from(buckets.values()).sort((a, b) => a.period_sort_key - b.period_sort_key);

  // Earliest/latest = bounds across periods with known sort_keys (skip unknowns).
  const known = diffusion.filter((b) => Number.isFinite(b.period_sort_key));
  const earliestPeriod = known[0]?.period ?? null;
  const latestPeriod = known[known.length - 1]?.period ?? null;
  let spanYears: number | null = null;
  if (known.length >= 2) {
    const start = known[0].approx_start_bce;
    const end = known[known.length - 1].approx_end_bce;
    if (start !== null && end !== null) {
      // BCE values stored positive; subtraction is start - end.
      // For Sasanian we use negative BCE (i.e. CE-as-negative), so the diff
      // still measures the years between epoch midpoints.
      spanYears = Math.abs(start - end);
    }
  }

  const crossPeriodCount = diffusion.filter((b) => b.period !== null).length;
  if (hostsWithPeriod === 0) {
    warnings.push(
      "no host has cached period metadata — run enrich_prefix_metadata to populate fragment-metadata cache before interpreting diffusion",
    );
  }

  return {
    chunk_hash: entry.hash,
    chunk_signs: entry.signs,
    chunk_length: entry.length,
    diffusion,
    earliest_period: earliestPeriod,
    latest_period: latestPeriod,
    period_span_years_approx: spanYears,
    cross_period_count: crossPeriodCount,
    hosts_total: entry.occurrences.length,
    hosts_with_period: hostsWithPeriod,
    warnings,
  };
}
