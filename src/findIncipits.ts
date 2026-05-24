// v0.21.0 — find_incipits: corpus-wide opening-formulae discovery.
//
// Backbone: the v0.21 length-10 chunk-hash index (src/incipitsIndex.ts).
// Where v0.20's find_formulaic_passages uses length-20 windows to catch
// long-form repeated formulae (incantations, ritual scripts, colophon
// templates), v0.21's find_incipits uses length-10 windows to catch the
// 3-8 sign opening formulae (incipits) that scholars use to identify
// compositions across the corpus.
//
// Calibration regime is different. Length-10 admits much more numerical-
// table noise (long ABZ480 / ABZ411 / cuneiform numeral 1 runs that mark
// calendrical and tabular text, NOT text incipits), so:
//   - default min_hosts is 50 (vs find_formulaic_passages' 20)
//   - exclude_numerical_only filter drops chunks whose signs are ≥70%
//     ABZ480 / ABZ411 (the numeral-1 family)
//
// Scoring follows find_formulaic_passages:
//   novelty_score = host_genres_spanned × log(1 + host_count)
// True incipits used in multiple curricular streams (commentary, ritual,
// lexical, omen) outrank within-curriculum colophon repeats.

import {
  getIncipitsIndexLoadError,
  getIncipitsAboveHostCount,
  loadIncipitsIndex,
  type IncipitsIndexEntry,
} from "./incipitsIndex.js";
import {
  getFragmentMetadata,
  getPeriod,
  getPrimaryGenre,
} from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type IncipitHost = {
  tablet_id: string;
  period: string | null;
  genre: string | null;
};

export type Incipit = {
  chunk_hash: string;
  chunk_signs: string;
  chunk_length: number;
  host_count: number;
  host_genres_spanned: number;
  host_periods_spanned: number;
  host_tablets: IncipitHost[];
  /** host_genres_spanned × log(1 + host_count). Rewards cross-curricular incipits. */
  novelty_score: number;
};

export type IncipitsResult = {
  incipits: Incipit[];
  index_stats: {
    loaded: boolean;
    total_chunks_in_index: number;
    candidates_above_threshold: number;
    after_filters: number;
    numerical_only_filtered: number;
    metadata_coverage_pct: number;
  };
  warnings: string[];
};

export type FindIncipitsOptions = {
  minHosts?: number;
  topK?: number;
  excludePrefixes?: string[];
  excludeNumericalOnly?: boolean;
  crossGenreOnly?: boolean;
};

// ─── Implementation ────────────────────────────────────────────────────────

// Pattern-detection filter for numerical-table residue. ABZ480 is the
// cuneiform numeral 1; ABZ411 is a high-frequency sign that EMPIRICALLY
// appears as a recurring count token in numerical/calendrical structures,
// typically interleaved with ABZ480 separators.
// NOTE — v0.23 finding: ABZ480 ↔ ABZ411 are NOT distributionally
// interchangeable (sign2vec embedding cosine = 0.097; their contexts in
// the corpus are largely disjoint). The earlier comment "same family used
// in numeral tables (Diš variants)" was a folk-Assyriological assumption
// that the v0.23 embedding falsified. The filter works anyway because
// chunks dominated by repeated ABZ411 with ABZ480 separators ARE
// numerical-table residue at the *pattern* level, independent of whether
// the two signs are distributionally equivalent.
// Round-8.1 audit (docs/v0.23.1-incipit-filter-reaudit.md, 2026-05-24)
// confirmed: 67 of 88 filtered chunks owe their filtering to ABZ411
// specifically; all 67 are genuine numerical-pattern structure when
// inspected. Filter stays as-is; only the named rationale was wrong.
const NUMERICAL_SIGNS = new Set(["ABZ480", "ABZ411"]);
const NUMERICAL_DENSITY_THRESHOLD = 0.7;

function startsWithAny(id: string, prefixes: string[]): boolean {
  for (const p of prefixes) if (id.startsWith(p)) return true;
  return false;
}

/**
 * Returns true if the chunk's signs are ≥70% ABZ480/ABZ411 — i.e. a
 * numerical-table fragment masquerading as an incipit. The "…" gap marker
 * is ignored (not a sign).
 */
export function isNumericalOnly(chunkSigns: string): boolean {
  const tokens = chunkSigns.split(/\s+/).filter((t) => t && t !== "…");
  if (tokens.length === 0) return false;
  let numericalCount = 0;
  for (const tok of tokens) {
    if (NUMERICAL_SIGNS.has(tok)) numericalCount++;
  }
  return numericalCount / tokens.length >= NUMERICAL_DENSITY_THRESHOLD;
}

export function findIncipits(opts: FindIncipitsOptions): IncipitsResult {
  const warnings: string[] = [];
  const index = loadIncipitsIndex();
  if (!index) {
    return {
      incipits: [],
      index_stats: {
        loaded: false,
        total_chunks_in_index: 0,
        candidates_above_threshold: 0,
        after_filters: 0,
        numerical_only_filtered: 0,
        metadata_coverage_pct: 0,
      },
      warnings: [getIncipitsIndexLoadError() ?? "incipits-index unavailable"],
    };
  }

  const minHosts = Math.max(2, opts.minHosts ?? 50);
  const topK = Math.max(1, Math.min(100, opts.topK ?? 30));
  const excludePrefixes = opts.excludePrefixes ?? [];
  const excludeNumericalOnly = opts.excludeNumericalOnly ?? true;
  const crossGenreOnly = !!opts.crossGenreOnly;

  const candidates: IncipitsIndexEntry[] = getIncipitsAboveHostCount(minHosts);

  type Annotated = {
    entry: IncipitsIndexEntry;
    hosts: IncipitHost[];
    genres: Set<string>;
    periods: Set<string>;
    metadataResolvedCount: number;
  };
  const annotated: Annotated[] = [];
  let totalHostsExamined = 0;
  let totalHostsWithMetadata = 0;
  let numericalOnlyFiltered = 0;

  for (const entry of candidates) {
    if (excludeNumericalOnly && isNumericalOnly(entry.signs)) {
      numericalOnlyFiltered++;
      continue;
    }
    const hosts: IncipitHost[] = [];
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
    annotated.push({ entry, hosts, genres, periods, metadataResolvedCount: metadataResolved });
  }

  const incipits: Incipit[] = annotated.map((a) => {
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
      host_tablets: a.hosts.slice(0, 20),
      novelty_score: +novelty.toFixed(4),
    };
  });

  incipits.sort((a, b) => b.novelty_score - a.novelty_score || b.host_count - a.host_count);
  const returned = incipits.slice(0, topK);

  const metadataCoveragePct = totalHostsExamined > 0
    ? +((100 * totalHostsWithMetadata) / totalHostsExamined).toFixed(2)
    : 0;
  if (metadataCoveragePct < 10) {
    warnings.push(
      `host metadata coverage is ${metadataCoveragePct}% — cross-genre attribution will be noisy. Run enrich_prefix_metadata to populate.`,
    );
  }
  if (excludeNumericalOnly && numericalOnlyFiltered > 0) {
    warnings.push(
      `${numericalOnlyFiltered} candidate chunks dropped by numerical-only filter (ABZ480/ABZ411 ≥70%). Pass exclude_numerical_only=false to retain them.`,
    );
  }

  return {
    incipits: returned,
    index_stats: {
      loaded: true,
      total_chunks_in_index: index.entries.length,
      candidates_above_threshold: candidates.length,
      after_filters: incipits.length,
      numerical_only_filtered: numericalOnlyFiltered,
      metadata_coverage_pct: metadataCoveragePct,
    },
    warnings,
  };
}
