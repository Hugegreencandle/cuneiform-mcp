// v0.20.0 — find_formulaic_passages: corpus-wide formulaic-passage discovery.
//
// Backbone: the v0.20 chunk-hash index (src/chunkIndex.ts). Surfaces every
// length-20 trigram window shared with ≥ min_hosts tablets, ranked by
// `host_genres_spanned * log(host_count)`. The genre-diversity weighting
// rewards cross-curricular formulae (e.g. KAR-44 incipits spanning Mīs pî +
// Ritual + Lexical hosts) and demotes ubiquitous colophon templates whose
// host count is high but whose host genres collapse to one (Library of
// Ashurbanipal).
//
// This tool is the "WHAT chunks repeat across the corpus?" primitive — the
// corpus-wide complement to find_chunk_parallels' per-tablet probe. Its
// validation case is BM.77056's position-57 cross-curricular pattern: those
// chunks should surface in the top-N at default min_hosts.

import {
  getChunkIndexLoadError,
  getChunksAboveHostCount,
  loadChunkIndex,
  type ChunkIndexEntry,
} from "./chunkIndex.js";
import {
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type FormulaicHost = {
  tablet_id: string;
  period: string | null;
  genre: string | null;
};

export type FormulaicPassage = {
  chunk_hash: string;
  chunk_signs: string;
  chunk_length: number;
  host_count: number;
  host_genres_spanned: number;
  host_periods_spanned: number;
  host_tablets: FormulaicHost[];
  /** host_genres_spanned × log(1 + host_count). Rewards cross-curricular formulae. */
  novelty_score: number;
};

export type FormulaicPassagesResult = {
  passages: FormulaicPassage[];
  index_stats: {
    loaded: boolean;
    total_chunks_in_index: number;
    candidates_above_threshold: number;
    after_filters: number;
    metadata_coverage_pct: number;
  };
  warnings: string[];
};

export type FormulaicPassagesOptions = {
  minHosts?: number;
  topK?: number;
  crossGenreOnly?: boolean;
  crossPeriodOnly?: boolean;
  excludePrefixes?: string[];
};

// ─── Implementation ────────────────────────────────────────────────────────

function startsWithAny(id: string, prefixes: string[]): boolean {
  for (const p of prefixes) if (id.startsWith(p)) return true;
  return false;
}

export function findFormulaicPassages(opts: FormulaicPassagesOptions): FormulaicPassagesResult {
  const warnings: string[] = [];
  const index = loadChunkIndex();
  if (!index) {
    return {
      passages: [],
      index_stats: {
        loaded: false,
        total_chunks_in_index: 0,
        candidates_above_threshold: 0,
        after_filters: 0,
        metadata_coverage_pct: 0,
      },
      warnings: [getChunkIndexLoadError() ?? "chunk-index unavailable"],
    };
  }

  const minHosts = Math.max(2, opts.minHosts ?? 20);
  const topK = Math.max(1, Math.min(100, opts.topK ?? 50));
  const excludePrefixes = opts.excludePrefixes ?? [];
  const crossGenreOnly = !!opts.crossGenreOnly;
  const crossPeriodOnly = !!opts.crossPeriodOnly;

  const candidates: ChunkIndexEntry[] = getChunksAboveHostCount(minHosts);

  // Per-chunk metadata-resolved host attributions + ranking.
  type Annotated = { entry: ChunkIndexEntry; hosts: FormulaicHost[]; genres: Set<string>; periods: Set<string>; metadataResolvedCount: number };
  const annotated: Annotated[] = [];
  let totalHostsExamined = 0;
  let totalHostsWithMetadata = 0;

  for (const entry of candidates) {
    const hosts: FormulaicHost[] = [];
    const genres = new Set<string>();
    const periods = new Set<string>();
    let metadataResolved = 0;
    for (const occ of entry.occurrences) {
      if (excludePrefixes.length > 0 && startsWithAny(occ.tablet_id, excludePrefixes)) continue;
      const meta = getFragmentMetadata(occ.tablet_id);
      const genre = getPrimaryGenre(meta);
      const period = getPeriod(meta);
      if (meta) metadataResolved++;
      hosts.push({ tablet_id: occ.tablet_id, period: period ?? null, genre: genre ?? null });
      if (genre) genres.add(genre);
      if (period) periods.add(period);
    }
    totalHostsExamined += entry.occurrences.length;
    totalHostsWithMetadata += metadataResolved;
    if (hosts.length < minHosts) continue;
    if (crossGenreOnly && genres.size < 2) continue;
    if (crossPeriodOnly && periods.size < 2) continue;
    annotated.push({ entry, hosts, genres, periods, metadataResolvedCount: metadataResolved });
  }

  // novelty = host_genres_spanned × log(1 + host_count). When metadata is
  // missing (genres.size === 0), we fall back to log(1 + host_count) alone so
  // results don't all-zero in low-coverage regimes.
  const passages: FormulaicPassage[] = annotated.map((a) => {
    const hostCount = a.hosts.length;
    const genresSpanned = a.genres.size;
    const periodsSpanned = a.periods.size;
    const log = Math.log(1 + hostCount);
    const novelty = (genresSpanned > 0 ? genresSpanned : 1) * log;
    return {
      chunk_hash: a.entry.hash,
      chunk_signs: a.entry.signs,
      chunk_length: a.entry.length,
      host_count: hostCount,
      host_genres_spanned: genresSpanned,
      host_periods_spanned: periodsSpanned,
      host_tablets: a.hosts.slice(0, 20), // cap inline preview; full set still in index
      novelty_score: +novelty.toFixed(4),
    };
  });

  passages.sort((a, b) => b.novelty_score - a.novelty_score || b.host_count - a.host_count);
  const returned = passages.slice(0, topK);

  const metadataCoveragePct = totalHostsExamined > 0
    ? +((100 * totalHostsWithMetadata) / totalHostsExamined).toFixed(2)
    : 0;
  if (metadataCoveragePct < 10) {
    warnings.push(
      `host metadata coverage is ${metadataCoveragePct}% — cross-genre attribution will be noisy. Run enrich_prefix_metadata to populate.`,
    );
  }

  return {
    passages: returned,
    index_stats: {
      loaded: true,
      total_chunks_in_index: index.entries.length,
      candidates_above_threshold: candidates.length,
      after_filters: passages.length,
      metadata_coverage_pct: metadataCoveragePct,
    },
    warnings,
  };
}
