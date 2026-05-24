// v0.19.0 — Sub-tablet chunk-parallel detection.
//
// Surfaces contiguous shared-sign chunks reproduced across tablets as a
// PRIMARY OBJECT rather than a `longest_contiguous_run` scalar buried inside
// `find_embedded_fragments` output. Motivated by methods paper §5.4 (position-
// aware methods are unexplored) and §3.7.3 (K.9508 ↔ K.5896 has a 142-position
// run that is currently invisible to whole-tablet symmetric scoring).
//
// Approach:
//   1. Reuse the existing 2-of-3 inverted indexes from `fuzzyParallels.ts`
//      to enumerate the same candidate set as `findEmbeddedFragments`.
//   2. For each candidate, call `fuzzyIntersectionAllRuns` (new in v0.19)
//      to extract every maximal matched-position run ≥ minChunkLen.
//   3. Group runs by (chunk_start, chunk_length) — these are the chunks; the
//      hosts of a chunk are all candidates whose run for the source begins
//      at that position with that length.
//   4. Cross-genre / cross-period attribution via fragmentMetadata.ts.
//   5. Score: novelty = (1 / log2(2 + host_count)) × (1 + 0.5 × cross-genre
//      fraction + 0.5 × cross-period fraction). Rank by (chunk_length desc,
//      novelty desc).
//
// Polish + frontier: new analytical primitive (sub-tablet granularity)
// shipped wrapped in the same Round-4 calibration audit pattern used in
// v0.18.19 Lever 1 (positive + 2 negatives + threshold sweep + 20-sample).

import {
  type CorpusEntry,
  fuzzyIntersectionAllRuns,
  getCorpusAndIndexes,
  getFuzzyLoadError,
} from "./fuzzyParallels.js";
import {
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ChunkParallelHost = {
  tablet_id: string;
  host_size_ratio: number; // host_trigrams / source_trigrams
};

export type ChunkParallel = {
  /** Canonical "<start>:<length>" key for the chunk within the source tablet. */
  chunk_key: string;
  /** Position in source's ordered trigrams. */
  chunk_start: number;
  /** Run length in trigram positions (≈ sign count − 2). */
  chunk_length: number;
  /**
   * Reconstructed sign sequence (whitespace-joined). When the underlying
   * trigrams_ordered skips X-heavy positions, discontinuities are flagged
   * with " … " between adjacent non-overlapping trigrams.
   */
  chunk_signs: string;
  host_tablets: ChunkParallelHost[];
  host_count: number;
  /** Hosts whose primary genre differs from the source's primary genre. */
  cross_genre_count: number;
  /** Hosts whose period differs from the source's period. */
  cross_period_count: number;
  /**
   * Count of DISTINCT host genres represented in this chunk's hosts, regardless
   * of source-metadata availability. v0.19.1 — the cross-curricular primitive
   * for downstream corpus-wide ranking (find_formulaic_passages). Differs from
   * cross_genre_count, which requires source genre attribution to compute.
   */
  host_genres_spanned: number;
  /**
   * log-scaled inverse host count × cross-boundary boost:
   *   novelty = (1 / log2(2 + host_count)) × (1 + 0.5 × cross_genre_fraction + 0.5 × cross_period_fraction)
   */
  novelty_score: number;
};

export type ChunkParallelsResult = {
  tablet_id: string;
  chunks: ChunkParallel[];
  /** Fraction of source trigram positions covered by ≥1 returned chunk. */
  source_coverage_pct: number;
  index_stats: {
    total_tablets_indexed: number;
    query_trigram_count: number;
    candidates_examined: number;
    candidates_with_runs: number;
    distinct_chunks: number;
  };
  warnings: string[];
};

export type ChunkParallelsOptions = {
  tabletId: string;
  /** Minimum contiguous-run length in TRIGRAM POSITIONS. Default 20 (matches v0.18.19 min_run default). */
  minChunkLen?: number;
  topK?: number;
  /** Require chunks shared with ≥ N other tablets. Default 1 (any host). */
  minHosts?: number;
  /** Drop hosts whose tablet ID starts with any of these prefixes (e.g. ['Asb.'] to suppress colophon prototypes). */
  excludePrefixes?: string[];
  /** Keep only chunks with ≥1 cross-genre host. */
  crossGenreOnly?: boolean;
  /** Keep only chunks with ≥1 cross-period host. */
  crossPeriodOnly?: boolean;
};

// ─── Implementation ────────────────────────────────────────────────────────

function reconstructChunkSigns(
  source: CorpusEntry,
  start: number,
  length: number,
): string {
  if (length === 0) return "";
  const trigrams = source.trigrams_ordered.slice(start, start + length);
  if (trigrams.length === 0) return "";
  const first = trigrams[0].split(" ");
  const signs: string[] = [first[0], first[1], first[2]];
  let prev = first;
  for (let i = 1; i < trigrams.length; i++) {
    const cur = trigrams[i].split(" ");
    if (cur[0] === prev[1] && cur[1] === prev[2]) {
      // Normal sliding-window overlap: append only the new third sign.
      signs.push(cur[2]);
    } else {
      // Discontinuity (X-heavy positions were skipped between trigrams).
      // Mark the gap and emit the full new trigram.
      signs.push("…", cur[0], cur[1], cur[2]);
    }
    prev = cur;
  }
  return signs.join(" ");
}

function hostHasExcludedPrefix(tabletId: string, prefixes: string[]): boolean {
  for (const p of prefixes) {
    if (tabletId.startsWith(p)) return true;
  }
  return false;
}

export function findChunkParallels(opts: ChunkParallelsOptions): ChunkParallelsResult {
  const warnings: string[] = [];
  const handles = getCorpusAndIndexes();
  if (!handles) {
    return {
      tablet_id: opts.tabletId,
      chunks: [],
      source_coverage_pct: 0,
      index_stats: {
        total_tablets_indexed: 0,
        query_trigram_count: 0,
        candidates_examined: 0,
        candidates_with_runs: 0,
        distinct_chunks: 0,
      },
      warnings: [getFuzzyLoadError() ?? "fuzzy index unavailable"],
    };
  }
  const { corpus, abIndex, bcIndex, acIndex } = handles;

  const source = corpus.get(opts.tabletId);
  if (!source) {
    return {
      tablet_id: opts.tabletId,
      chunks: [],
      source_coverage_pct: 0,
      index_stats: {
        total_tablets_indexed: corpus.size,
        query_trigram_count: 0,
        candidates_examined: 0,
        candidates_with_runs: 0,
        distinct_chunks: 0,
      },
      warnings: [`tablet '${opts.tabletId}' not in corpus`],
    };
  }

  const minChunkLen = Math.max(1, opts.minChunkLen ?? 20);
  const topK = Math.max(1, Math.min(100, opts.topK ?? 20));
  const minHosts = Math.max(1, opts.minHosts ?? 1);
  const excludePrefixes = opts.excludePrefixes ?? [];
  const crossGenreOnly = !!opts.crossGenreOnly;
  const crossPeriodOnly = !!opts.crossPeriodOnly;

  // Source metadata for cross-boundary attribution.
  const sourceMeta = getFragmentMetadata(opts.tabletId);
  const sourcePeriod = getPeriod(sourceMeta);
  const sourceGenre = getPrimaryGenre(sourceMeta);
  if (!sourcePeriod && !sourceGenre) {
    warnings.push(
      `source '${opts.tabletId}' has no cached fragment metadata; cross-genre / cross-period boosts will be zero. Run enrich_prefix_metadata to populate.`,
    );
  }

  // Candidate-set construction mirrors findEmbeddedFragments: union of all
  // tablets touched by any of the source's 2-of-3 prefix-pair projections.
  // No host-size filter — chunks can be shared with hosts of any size.
  const candidates = new Set<string>();
  for (const p of source.ab) {
    const s = abIndex.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of source.bc) {
    const s = bcIndex.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of source.ac) {
    const s = acIndex.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  candidates.delete(opts.tabletId);

  const sourceTrigramCount = source.trigrams.size;
  // Group: chunk_key → ChunkParallel-in-progress.
  const chunkMap = new Map<string, {
    chunk_start: number;
    chunk_length: number;
    hosts: ChunkParallelHost[];
    crossGenre: number;
    crossPeriod: number;
    hostGenres: Set<string>;
  }>();
  let candidatesWithRuns = 0;

  for (const cid of candidates) {
    if (excludePrefixes.length > 0 && hostHasExcludedPrefix(cid, excludePrefixes)) continue;
    const target = corpus.get(cid)!;
    const runs = fuzzyIntersectionAllRuns(source, target, minChunkLen);
    if (runs.length === 0) continue;
    candidatesWithRuns++;

    const hostTrigramCount = target.trigrams.size;
    const hostRatio = hostTrigramCount / Math.max(1, sourceTrigramCount);
    const hostMeta = getFragmentMetadata(cid);
    const hostPeriod = getPeriod(hostMeta);
    const hostGenre = getPrimaryGenre(hostMeta);
    const isCrossGenre = !!sourceGenre && !!hostGenre && hostGenre !== sourceGenre;
    const isCrossPeriod = !!sourcePeriod && !!hostPeriod && hostPeriod !== sourcePeriod;

    for (const run of runs) {
      const key = `${run.start}:${run.length}`;
      let entry = chunkMap.get(key);
      if (!entry) {
        entry = {
          chunk_start: run.start,
          chunk_length: run.length,
          hosts: [],
          crossGenre: 0,
          crossPeriod: 0,
          hostGenres: new Set<string>(),
        };
        chunkMap.set(key, entry);
      }
      entry.hosts.push({ tablet_id: cid, host_size_ratio: +hostRatio.toFixed(2) });
      if (isCrossGenre) entry.crossGenre++;
      if (isCrossPeriod) entry.crossPeriod++;
      if (hostGenre) entry.hostGenres.add(hostGenre);
    }
  }

  // Materialize, filter, score, rank.
  const allChunks: ChunkParallel[] = [];
  for (const [key, entry] of chunkMap.entries()) {
    if (entry.hosts.length < minHosts) continue;
    if (crossGenreOnly && entry.crossGenre === 0) continue;
    if (crossPeriodOnly && entry.crossPeriod === 0) continue;
    const hostCount = entry.hosts.length;
    const crossGenreFrac = entry.crossGenre / hostCount;
    const crossPeriodFrac = entry.crossPeriod / hostCount;
    const novelty =
      (1 / Math.log2(2 + hostCount)) *
      (1 + 0.5 * crossGenreFrac + 0.5 * crossPeriodFrac);
    // Sort hosts by ratio desc so the largest hosts appear first.
    entry.hosts.sort((a, b) => b.host_size_ratio - a.host_size_ratio);
    allChunks.push({
      chunk_key: key,
      chunk_start: entry.chunk_start,
      chunk_length: entry.chunk_length,
      chunk_signs: reconstructChunkSigns(source, entry.chunk_start, entry.chunk_length),
      host_tablets: entry.hosts,
      host_count: hostCount,
      cross_genre_count: entry.crossGenre,
      cross_period_count: entry.crossPeriod,
      host_genres_spanned: entry.hostGenres.size,
      novelty_score: +novelty.toFixed(4),
    });
  }

  allChunks.sort((a, b) =>
    b.chunk_length - a.chunk_length || b.novelty_score - a.novelty_score,
  );

  const returnedChunks = allChunks.slice(0, topK);

  // Source coverage: union of [chunk_start, chunk_start+chunk_length) intervals
  // for the RETURNED chunks, divided by source's trigrams_ordered length.
  const denom = Math.max(1, source.trigrams_ordered.length);
  const covered = new Uint8Array(source.trigrams_ordered.length);
  for (const c of returnedChunks) {
    const end = Math.min(c.chunk_start + c.chunk_length, covered.length);
    for (let i = c.chunk_start; i < end; i++) covered[i] = 1;
  }
  let coveredCount = 0;
  for (let i = 0; i < covered.length; i++) coveredCount += covered[i];
  const sourceCoveragePct = +((100 * coveredCount) / denom).toFixed(2);

  return {
    tablet_id: opts.tabletId,
    chunks: returnedChunks,
    source_coverage_pct: sourceCoveragePct,
    index_stats: {
      total_tablets_indexed: corpus.size,
      query_trigram_count: sourceTrigramCount,
      candidates_examined: candidates.size,
      candidates_with_runs: candidatesWithRuns,
      distinct_chunks: allChunks.length,
    },
    warnings,
  };
}
