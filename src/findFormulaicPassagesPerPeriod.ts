// v0.28.0 — find_formulaic_passages_per_period: diachronic chunk discovery.
//
// Companion to v0.20's find_formulaic_passages (corpus-wide length-20
// chunk-hash index). v0.28 splits the index by script.period (NA vs NB)
// and surfaces chunks that are PERIOD-SPECIFIC: present in one period's
// non-singleton index but absent (or near-absent) in the other.
//
// The methodologically interesting output is `period_specificity`:
//   • na_only           — chunk has hosts only in the NA index
//   • nb_only           — chunk has hosts only in the NB index
//   • shared_majority_na — both periods, but ≥ 67% of hosts are NA
//   • shared_majority_nb — both periods, but ≥ 67% of hosts are NB
//   • both              — both periods, neither side dominant
//
// `na_only` chunks at min_hosts=10 are the publishable finding: canonical
// Library-of-Ashurbanipal formulae that are absent from Neo-Babylonian
// administrative/archival texts. `nb_only` is the symmetric administrative-
// period vocabulary.
//
// Backbone: src/chunkIndexPerPeriod.ts (two-period loader). Pure stdlib.

import {
  getPerPeriodChunkByHash,
  getPerPeriodChunkIndexLoadError,
  getPerPeriodChunksAboveHostCount,
  loadPerPeriodChunkIndex,
  perPeriodChunkIndexStats,
  type ChunkIndexEntry,
  type PerPeriodChunkIndexStats,
} from "./chunkIndexPerPeriod.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type PeriodSpecificity =
  | "na_only"
  | "nb_only"
  | "both"
  | "shared_majority_na"
  | "shared_majority_nb";

export type FormulaicPassagePerPeriod = {
  chunk_hash: string;
  chunk_signs: string;
  chunk_length: number;
  na_host_count: number;
  nb_host_count: number;
  period_specificity: PeriodSpecificity;
  host_sample_na: string[]; // top-3 NA tablet ids
  host_sample_nb: string[]; // top-3 NB tablet ids
};

export type FindFormulaicPassagesPerPeriodResult = {
  na_index_stats: PerPeriodChunkIndexStats;
  nb_index_stats: PerPeriodChunkIndexStats;
  passages: FormulaicPassagePerPeriod[];
  warnings: string[];
};

export type FindFormulaicPassagesPerPeriodOptions = {
  minHosts?: number;
  topK?: number;
  periodSpecificOnly?: boolean;
};

// ─── Classification ────────────────────────────────────────────────────────

/**
 * Classify a chunk by host counts in the two period indexes.
 *
 * "na_only" requires na ≥ minHosts AND nb === 0. The 0 floor (not "<
 * minHosts") is intentional: the v0.20-style minHosts gate is already
 * applied to the NA index before this function sees the chunk; the absent-
 * in-NB side is a hard signal that the formula didn't transmit.
 *
 * Shared-with-majority thresholds: ≥ 67% of total hosts in the dominant
 * period (= 2× the other side). This catches "common but skewed" chunks
 * — formulae that exist in both registers but were predominantly produced
 * in one period.
 */
function classify(na: number, nb: number): PeriodSpecificity {
  if (na > 0 && nb === 0) return "na_only";
  if (nb > 0 && na === 0) return "nb_only";
  const total = na + nb;
  if (total === 0) return "both"; // degenerate; caller should filter
  const naFrac = na / total;
  if (naFrac >= 2 / 3) return "shared_majority_na";
  if (naFrac <= 1 / 3) return "shared_majority_nb";
  return "both";
}

// ─── Implementation ────────────────────────────────────────────────────────

export function findFormulaicPassagesPerPeriod(
  opts: FindFormulaicPassagesPerPeriodOptions,
): FindFormulaicPassagesPerPeriodResult {
  const warnings: string[] = [];

  const naIdx = loadPerPeriodChunkIndex("NA");
  const nbIdx = loadPerPeriodChunkIndex("NB");
  const naStats = perPeriodChunkIndexStats("NA");
  const nbStats = perPeriodChunkIndexStats("NB");

  if (!naIdx) {
    const err = getPerPeriodChunkIndexLoadError("NA") ?? "NA chunk-index unavailable";
    warnings.push(`NA index: ${err}`);
  }
  if (!nbIdx) {
    const err = getPerPeriodChunkIndexLoadError("NB") ?? "NB chunk-index unavailable";
    warnings.push(`NB index: ${err}`);
  }

  if (!naIdx && !nbIdx) {
    return {
      na_index_stats: naStats,
      nb_index_stats: nbStats,
      passages: [],
      warnings,
    };
  }

  const minHosts = Math.max(2, opts.minHosts ?? 10);
  // Cap at 5000 — audit + survey paths legitimately want broad pulls; the
  // returned-payload shape is small (10 fields per row) so 5000 ≈ 200KB.
  const topK = Math.max(1, Math.min(5000, opts.topK ?? 30));
  const periodSpecificOnly = !!opts.periodSpecificOnly;

  // Gather candidates from both indexes above the minHosts threshold.
  // We need to compare per-chunk-hash across both indexes, so build a
  // unified hash → {naEntry?, nbEntry?} map.

  type Candidate = {
    hash: string;
    signs: string;
    length: number;
    naEntry: ChunkIndexEntry | null;
    nbEntry: ChunkIndexEntry | null;
  };
  const candidates = new Map<string, Candidate>();

  if (naIdx) {
    const naAbove = getPerPeriodChunksAboveHostCount("NA", minHosts);
    for (const entry of naAbove) {
      candidates.set(entry.hash, {
        hash: entry.hash,
        signs: entry.signs,
        length: entry.length,
        naEntry: entry,
        nbEntry: null,
      });
    }
  }

  if (nbIdx) {
    const nbAbove = getPerPeriodChunksAboveHostCount("NB", minHosts);
    for (const entry of nbAbove) {
      const existing = candidates.get(entry.hash);
      if (existing) {
        existing.nbEntry = entry;
      } else {
        candidates.set(entry.hash, {
          hash: entry.hash,
          signs: entry.signs,
          length: entry.length,
          naEntry: null,
          nbEntry: entry,
        });
      }
    }
  }

  // For each candidate, look up the OTHER period's full host count even
  // when that period was below the minHosts gate — we need accurate "0 vs
  // present" classification for na_only / nb_only labels. The other-side
  // lookup is O(1) via the byHash map; if the chunk doesn't appear there,
  // its host count is genuinely 0 (singletons were pruned at build, but a
  // chunk that exists in NA as a 30-host formula and in NB only as a
  // singleton would have been dropped — that's the desired behavior:
  // singletons aren't formulaic).

  for (const cand of candidates.values()) {
    if (!cand.naEntry && naIdx) {
      cand.naEntry = getPerPeriodChunkByHash("NA", cand.hash);
    }
    if (!cand.nbEntry && nbIdx) {
      cand.nbEntry = getPerPeriodChunkByHash("NB", cand.hash);
    }
  }

  // Classify, filter, score.
  type Scored = {
    passage: FormulaicPassagePerPeriod;
    sortKey: number;
  };
  const scored: Scored[] = [];

  for (const cand of candidates.values()) {
    const na = cand.naEntry?.occurrences.length ?? 0;
    const nb = cand.nbEntry?.occurrences.length ?? 0;
    if (na === 0 && nb === 0) continue;
    const cls = classify(na, nb);
    if (periodSpecificOnly && cls !== "na_only" && cls !== "nb_only") continue;

    const hostSampleNa = cand.naEntry
      ? cand.naEntry.occurrences.slice(0, 3).map((o) => o.tablet_id)
      : [];
    const hostSampleNb = cand.nbEntry
      ? cand.nbEntry.occurrences.slice(0, 3).map((o) => o.tablet_id)
      : [];

    // Ranking strategy depends on the query mode:
    //   • periodSpecificOnly=true:  only na_only/nb_only enter scored[]
    //     (the filter above) — rank purely by max(na, nb).
    //   • periodSpecificOnly=false: mixed pool — rank by max(na, nb) WITHOUT
    //     a period-specific boost. Boosting would saturate the top-K with
    //     period-specific chunks (NA-only alone is 10K+ entries) and starve
    //     the cross-period transmission band that this mode is built to
    //     surface. Callers wanting only period-specific results pass
    //     periodSpecificOnly=true.
    const sortKey = Math.max(na, nb);

    scored.push({
      passage: {
        chunk_hash: cand.hash,
        chunk_signs: cand.signs,
        chunk_length: cand.length,
        na_host_count: na,
        nb_host_count: nb,
        period_specificity: cls,
        host_sample_na: hostSampleNa,
        host_sample_nb: hostSampleNb,
      },
      sortKey,
    });
  }

  scored.sort((a, b) => b.sortKey - a.sortKey);
  const returned = scored.slice(0, topK).map((s) => s.passage);

  return {
    na_index_stats: naStats,
    nb_index_stats: nbStats,
    passages: returned,
    warnings,
  };
}
