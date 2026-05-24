// v0.17.0 — Fuzzy trigram-Jaccard parallel finder.
//
// Motivated by the 2026-05-16 bi-orphan inspection finding that the
// K.2798 ↔ Si.776 candidate pair shares 12 of the first 14 signs but
// was missed by exact trigram-Jaccard because of localized sign-form
// variants at positions 4 (ABZ231 ↔ ABZ172) and 5 (ABZ383 ↔ ABZ354).
//
// Two trigrams (a,b,c) and (a',b',c') are "fuzzy 1-sub neighbors" iff
// exactly 2 of their 3 positions are equal. The fuzzy intersection of
// two trigram sets counts the number of trigrams in A that have any
// fuzzy 1-sub neighbor in B. Fuzzy Jaccard is computed over this
// intersection vs. the union size (approximation: |A| + |B| - intersect).
//
// Efficiency: for each query, builds three 2-of-3 prefix-pair postings
// (ab, bc, ac) for the target tablets in the corpus, then for each
// trigram in the query, looks up matching trigrams in O(1) per pair.
// Corpus is loaded lazily; postings are built on first call (~5 sec).
//
// Provenance: surfaces candidates that exact trigram-Jaccard misses but
// thematic embeddings catch — the discovery primitive for missed
// manuscript siblings.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ALL_SIGNS_FILE = "all-signs-full.json";
const EXCLUSIONS_FILE = "corpus-exclusions.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type FuzzyParallel = {
  tablet_id: string;
  exact_jaccard: number;
  fuzzy_jaccard: number;
  exact_intersect: number;
  fuzzy_intersect: number;
  query_trigrams: number;
  target_trigrams: number;
  // v0.18.2 calibration audit: contiguous-run signal
  longest_contiguous_run: number;
  contiguous_run_bonus: number;
  final_score: number;
  shared_fuzzy_examples: Array<{ query: string; target: string }>; // up to 5
};

export type FuzzyParallelsResult = {
  tablet_id: string;
  parallels: FuzzyParallel[];
  index_stats: {
    total_tablets_indexed: number;
    query_trigram_count: number;
    candidates_examined: number;
    candidates_with_overlap: number;
  };
  warnings: string[];
};

// ─── Index types ───────────────────────────────────────────────────────────

// v0.19.0: exported for sibling modules (chunkParallels) that need to walk
// the same ordered-trigram + 2-of-3 inverted-index structures.
export type CorpusEntry = {
  trigrams: Set<string>;
  trigrams_ordered: string[]; // v0.18.2: ordered list for contiguous-run analysis
  // 2-of-3 partial keys
  ab: Set<string>; // "a b"
  bc: Set<string>; // "b c"
  ac: Set<string>; // "a c"
};

let _corpus: Map<string, CorpusEntry> | null = null;
let _loadError: string | null = null;
// Reverse postings — for fast lookup of "tablets containing this ab-pair"
let _abIndex: Map<string, Set<string>> | null = null;
let _bcIndex: Map<string, Set<string>> | null = null;
let _acIndex: Map<string, Set<string>> | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function dataDir(): string {
  return process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(import.meta.dirname ?? process.cwd(), "..", "data");
}

function trigramsAndProjections(signsRaw: string): CorpusEntry {
  const trigrams = new Set<string>();
  const trigrams_ordered: string[] = [];
  const ab = new Set<string>();
  const bc = new Set<string>();
  const ac = new Set<string>();
  for (const line of signsRaw.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1], c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      const tri = a + " " + b + " " + c;
      trigrams.add(tri);
      trigrams_ordered.push(tri);
      if (a !== "X" && b !== "X") ab.add(a + " " + b);
      if (b !== "X" && c !== "X") bc.add(b + " " + c);
      if (a !== "X" && c !== "X") ac.add(a + " " + c);
    }
  }
  return { trigrams, trigrams_ordered, ab, bc, ac };
}

function loadCorpus(): Map<string, CorpusEntry> | null {
  if (_corpus) return _corpus;
  if (_loadError) return null;

  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _loadError = `signs cache not found: ${path}`;
    return null;
  }
  try {
    const excluded = new Set<string>();
    const exPath = join(dataDir(), EXCLUSIONS_FILE);
    if (existsSync(exPath)) {
      const ex = JSON.parse(readFileSync(exPath, "utf-8")) as { excluded_records?: Array<{ id: string }> };
      for (const r of ex.excluded_records ?? []) excluded.add(r.id);
    }

    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{ _id: string; signs: string }>;
    const out = new Map<string, CorpusEntry>();
    const abIdx = new Map<string, Set<string>>();
    const bcIdx = new Map<string, Set<string>>();
    const acIdx = new Map<string, Set<string>>();

    for (const r of records) {
      if (!r._id || typeof r.signs !== "string" || excluded.has(r._id)) continue;
      const entry = trigramsAndProjections(r.signs);
      if (entry.trigrams.size === 0) continue;
      out.set(r._id, entry);
      for (const p of entry.ab) {
        let s = abIdx.get(p); if (!s) { s = new Set(); abIdx.set(p, s); }
        s.add(r._id);
      }
      for (const p of entry.bc) {
        let s = bcIdx.get(p); if (!s) { s = new Set(); bcIdx.set(p, s); }
        s.add(r._id);
      }
      for (const p of entry.ac) {
        let s = acIdx.get(p); if (!s) { s = new Set(); acIdx.set(p, s); }
        s.add(r._id);
      }
    }
    _corpus = out;
    _abIndex = abIdx;
    _bcIndex = bcIdx;
    _acIndex = acIdx;
    return out;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Fuzzy intersection ────────────────────────────────────────────────────

function fuzzyIntersection(
  queryEntry: CorpusEntry,
  target: CorpusEntry,
): { exact: number; fuzzy: number; longest_run: number; examples: Array<{ query: string; target: string }> } {
  let exact = 0;
  let fuzzy = 0;
  const examples: Array<{ query: string; target: string }> = [];
  // v0.18.2: track matched positions for contiguous-run analysis
  // Iterate position-ordered query trigrams (NOT the set) so we know positions.
  const matchedPositions: boolean[] = new Array(queryEntry.trigrams_ordered.length).fill(false);
  const seenTrigrams = new Set<string>(); // dedupe Set-semantics scoring
  for (let pos = 0; pos < queryEntry.trigrams_ordered.length; pos++) {
    const qTri = queryEntry.trigrams_ordered[pos];
    const isDupe = seenTrigrams.has(qTri);
    if (target.trigrams.has(qTri)) {
      matchedPositions[pos] = true;
      if (!isDupe) { exact++; fuzzy++; seenTrigrams.add(qTri); }
      continue;
    }
    const parts = qTri.split(" ");
    const a = parts[0], b = parts[1], c = parts[2];
    const matched =
      target.ab.has(a + " " + b) ||
      target.bc.has(b + " " + c) ||
      target.ac.has(a + " " + c);
    if (matched) {
      matchedPositions[pos] = true;
      if (!isDupe) { fuzzy++; seenTrigrams.add(qTri); }
      if (examples.length < 5) {
        // Best-effort: find ONE concrete target trigram that matches at 2 positions
        for (const tTri of target.trigrams) {
          const tParts = tTri.split(" ");
          if (tParts[0] === a && tParts[1] === b && tParts[2] !== c) {
            examples.push({ query: qTri, target: tTri });
            break;
          }
          if (tParts[1] === b && tParts[2] === c && tParts[0] !== a) {
            examples.push({ query: qTri, target: tTri });
            break;
          }
          if (tParts[0] === a && tParts[2] === c && tParts[1] !== b) {
            examples.push({ query: qTri, target: tTri });
            break;
          }
        }
      }
    }
  }
  // v0.18.2: compute longest contiguous run of matched positions in the
  // ordered query trigram stream. Long runs evidence text-section sibling
  // sharing (vs. scattered noise from common-vocabulary co-occurrence).
  let longest_run = 0;
  let current_run = 0;
  for (const matched of matchedPositions) {
    if (matched) {
      current_run++;
      if (current_run > longest_run) longest_run = current_run;
    } else {
      current_run = 0;
    }
  }
  return { exact, fuzzy, longest_run, examples };
}

// ─── v0.19.0 — All-runs variant for sub-tablet chunk discovery ──────────────
//
// `fuzzyIntersection` (above) condenses the match map to a single
// `longest_run` scalar. `find_chunk_parallels` (v0.19) needs every maximal
// run ≥ threshold as a primary object: chunk_start (position in source's
// trigrams_ordered) + chunk_length (run length). This variant runs the same
// alignment walk but emits all qualifying runs instead of max()-ing them.
//
// Same fuzziness semantics as `fuzzyIntersection`: a query trigram matches
// the target iff its exact form is present OR any 2-of-3 prefix-pair
// projection (ab / bc / ac) appears in the target's projections.

export function fuzzyIntersectionAllRuns(
  queryEntry: CorpusEntry,
  target: CorpusEntry,
  minRun: number,
): Array<{ start: number; length: number }> {
  const matchedPositions: boolean[] = new Array(queryEntry.trigrams_ordered.length).fill(false);
  for (let pos = 0; pos < queryEntry.trigrams_ordered.length; pos++) {
    const qTri = queryEntry.trigrams_ordered[pos];
    if (target.trigrams.has(qTri)) {
      matchedPositions[pos] = true;
      continue;
    }
    const parts = qTri.split(" ");
    const a = parts[0], b = parts[1], c = parts[2];
    if (
      target.ab.has(a + " " + b) ||
      target.bc.has(b + " " + c) ||
      target.ac.has(a + " " + c)
    ) {
      matchedPositions[pos] = true;
    }
  }
  const runs: Array<{ start: number; length: number }> = [];
  let runStart = -1;
  for (let i = 0; i < matchedPositions.length; i++) {
    if (matchedPositions[i]) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const length = i - runStart;
      if (length >= minRun) runs.push({ start: runStart, length });
      runStart = -1;
    }
  }
  if (runStart !== -1) {
    const length = matchedPositions.length - runStart;
    if (length >= minRun) runs.push({ start: runStart, length });
  }
  return runs;
}

/**
 * v0.19.0: Cross-module accessor for the lazy-loaded corpus + 2-of-3
 * inverted indexes. Returns null if the trigram cache is unavailable.
 * Sibling modules (chunkParallels) reuse the same in-process indexes to
 * avoid double-loading the 35K-tablet corpus.
 */
export function getCorpusAndIndexes(): {
  corpus: Map<string, CorpusEntry>;
  abIndex: Map<string, Set<string>>;
  bcIndex: Map<string, Set<string>>;
  acIndex: Map<string, Set<string>>;
} | null {
  const corpus = loadCorpus();
  if (!corpus || !_abIndex || !_bcIndex || !_acIndex) return null;
  return { corpus, abIndex: _abIndex, bcIndex: _bcIndex, acIndex: _acIndex };
}

/** v0.19.0: Surface the load error from the lazy corpus loader. */
export function getFuzzyLoadError(): string | null {
  return _loadError;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type FuzzyParallelOptions = {
  tabletId: string;
  topK?: number;
  minFuzzyJaccard?: number;
  minFuzzyIntersect?: number;
  excludeSelfExactMatch?: boolean; // if true, don't return tablets with exact_jaccard ≥ this
};

export function findFuzzyParallels(opts: FuzzyParallelOptions): FuzzyParallelsResult {
  const corpus = loadCorpus();
  if (!corpus) {
    return {
      tablet_id: opts.tabletId,
      parallels: [],
      index_stats: { total_tablets_indexed: 0, query_trigram_count: 0, candidates_examined: 0, candidates_with_overlap: 0 },
      warnings: [_loadError ?? "fuzzy index unavailable"],
    };
  }

  const queryEntry = corpus.get(opts.tabletId);
  if (!queryEntry) {
    return {
      tablet_id: opts.tabletId,
      parallels: [],
      index_stats: { total_tablets_indexed: corpus.size, query_trigram_count: 0, candidates_examined: 0, candidates_with_overlap: 0 },
      warnings: [`tablet '${opts.tabletId}' not in corpus`],
    };
  }

  const topK = Math.max(1, Math.min(50, opts.topK ?? 10));
  const minFuzzyJ = opts.minFuzzyJaccard ?? 0.10;
  const minFuzzyI = opts.minFuzzyIntersect ?? 5;

  // Build candidate set via 2-of-3 inverted indexes
  const candidates = new Set<string>();
  for (const p of queryEntry.ab) {
    const s = _abIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of queryEntry.bc) {
    const s = _bcIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of queryEntry.ac) {
    const s = _acIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  candidates.delete(opts.tabletId);

  const results: FuzzyParallel[] = [];
  let withOverlap = 0;
  for (const cid of candidates) {
    const target = corpus.get(cid)!;
    const { exact, fuzzy, longest_run, examples } = fuzzyIntersection(queryEntry, target);
    if (fuzzy === 0) continue;
    withOverlap++;
    if (fuzzy < minFuzzyI) continue;
    const fuzzyJ = fuzzy / (queryEntry.trigrams.size + target.trigrams.size - fuzzy);
    if (fuzzyJ < minFuzzyJ) continue;
    const exactJ = exact / (queryEntry.trigrams.size + target.trigrams.size - exact);
    // v0.18.2: contiguous-run bonus. Normalized by sqrt(query_trigrams) so the
    // bonus scales sub-linearly with tablet length; capped at a meaningful
    // 0.5 max so it can lift but not dominate fuzzy_jaccard.
    // Multiplier: final_score = fuzzy_jaccard × (1 + 0.5 × run_factor)
    // where run_factor = min(1, longest_run / sqrt(query_trigrams))
    const runFactor = Math.min(1, longest_run / Math.max(1, Math.sqrt(queryEntry.trigrams.size)));
    const runBonus = 0.5 * runFactor;
    const finalScore = fuzzyJ * (1 + runBonus);
    results.push({
      tablet_id: cid,
      exact_jaccard: +exactJ.toFixed(4),
      fuzzy_jaccard: +fuzzyJ.toFixed(4),
      exact_intersect: exact,
      fuzzy_intersect: fuzzy,
      query_trigrams: queryEntry.trigrams.size,
      target_trigrams: target.trigrams.size,
      longest_contiguous_run: longest_run,
      contiguous_run_bonus: +runBonus.toFixed(4),
      final_score: +finalScore.toFixed(4),
      shared_fuzzy_examples: examples,
    });
  }

  // v0.18.2: rank by final_score (fuzzy_jaccard × run-bonus) instead of bare fuzzy_jaccard
  results.sort((a, b) => b.final_score - a.final_score);

  return {
    tablet_id: opts.tabletId,
    parallels: results.slice(0, topK),
    index_stats: {
      total_tablets_indexed: corpus.size,
      query_trigram_count: queryEntry.trigrams.size,
      candidates_examined: candidates.size,
      candidates_with_overlap: withOverlap,
    },
    warnings: [],
  };
}

export function fuzzyIndexStats(): { loaded: boolean; total_tablets: number; load_error: string | null } {
  const corpus = loadCorpus();
  return {
    loaded: !!corpus,
    total_tablets: corpus?.size ?? 0,
    load_error: _loadError,
  };
}

// ─── v0.18.19 — Embedded-fragment (asymmetric containment) probe ─────────────
//
// Calibration audit Round 3 / Lever 1. Motivated by the 2026-05-23 typology
// finding that K.9508 (Mīs pî manuscript) returns ZERO fuzzy neighbors when
// probed symmetrically at default min-J=0.30, but is recovered as a 102-sign
// run when K.5896 (much larger) probes it. The symmetric Jaccard denominator
// |A ∪ B| is dominated by the host's vocabulary, so an embedded-fragment-in-
// host relationship is invisible from the small side. Asymmetric containment
// `intersect / |query_trigrams|` measures "what fraction of the small fragment's
// signal is reproduced in a larger host" — the right primitive for Archetype-5
// (embedded fragment) discovery.
//
// Differs from findFuzzyParallels in three ways:
//  1. Scoring: `containment = fuzzy_intersect / |query|` (NOT symmetric Jaccard)
//  2. Host filter: targets are required to be ≥ host_size_multiplier × |query|
//  3. Threshold: default min_containment 0.50 (half the guest must be in the host)

export type EmbeddedFragmentMatch = {
  host_tablet_id: string;
  containment: number;                  // fuzzy_intersect / |query_trigrams|
  exact_containment: number;            // exact_intersect / |query_trigrams|
  fuzzy_intersect: number;
  exact_intersect: number;
  query_trigrams: number;
  host_trigrams: number;
  host_size_ratio: number;              // host_trigrams / query_trigrams
  longest_contiguous_run: number;
  shared_fuzzy_examples: Array<{ query: string; target: string }>;
};

export type EmbeddedFragmentsResult = {
  guest_tablet_id: string;
  matches: EmbeddedFragmentMatch[];
  index_stats: {
    total_tablets_indexed: number;
    query_trigram_count: number;
    candidates_examined: number;
    candidates_passing_host_filter: number;
    candidates_with_overlap: number;
  };
  warnings: string[];
};

export type EmbeddedFragmentOptions = {
  guestTabletId: string;
  topK?: number;                        // default 10
  minContainment?: number;              // default 0.50
  minRun?: number;                      // default 0 (off; raise to e.g. 10 to require a contiguous run)
  hostSizeMultiplier?: number;          // default 5 (host must be ≥5× guest size)
  maxGuestSize?: number;                // default 2000 — refuse to probe if guest is too big to be "embedded"
};

export function findEmbeddedFragments(opts: EmbeddedFragmentOptions): EmbeddedFragmentsResult {
  const corpus = loadCorpus();
  if (!corpus) {
    return {
      guest_tablet_id: opts.guestTabletId,
      matches: [],
      index_stats: {
        total_tablets_indexed: 0, query_trigram_count: 0,
        candidates_examined: 0, candidates_passing_host_filter: 0, candidates_with_overlap: 0,
      },
      warnings: [_loadError ?? "fuzzy index unavailable"],
    };
  }

  const queryEntry = corpus.get(opts.guestTabletId);
  if (!queryEntry) {
    return {
      guest_tablet_id: opts.guestTabletId,
      matches: [],
      index_stats: {
        total_tablets_indexed: corpus.size, query_trigram_count: 0,
        candidates_examined: 0, candidates_passing_host_filter: 0, candidates_with_overlap: 0,
      },
      warnings: [`tablet '${opts.guestTabletId}' not in corpus`],
    };
  }

  const topK = Math.max(1, Math.min(50, opts.topK ?? 10));
  const minContainment = opts.minContainment ?? 0.50;
  // v0.18.19 calibration: 20-position contiguous run is the precision threshold
  // that suppresses noise hosts on the methods-paper final-2 bi-orphans
  // (IM.49220, K.3306) while preserving the K.9508 ↔ K.5896 positive case
  // (run=142). At min_run=0 every lex-singleton fires; at min_run=20 the
  // 20-tablet random sample drops from 20/20 to 8/20 (precision-tight).
  const minRun = opts.minRun ?? 20;
  const hostSizeMult = opts.hostSizeMultiplier ?? 5;
  const maxGuestSize = opts.maxGuestSize ?? 2000;
  const warnings: string[] = [];

  const qSize = queryEntry.trigrams.size;
  if (qSize > maxGuestSize) {
    warnings.push(
      `guest has ${qSize} trigrams (> max_guest_size=${maxGuestSize}); embedded-fragment relationships are defined for small guests in large hosts`,
    );
  }

  // Build candidate set via 2-of-3 inverted indexes (same as findFuzzyParallels)
  const candidates = new Set<string>();
  for (const p of queryEntry.ab) {
    const s = _abIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of queryEntry.bc) {
    const s = _bcIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  for (const p of queryEntry.ac) {
    const s = _acIndex!.get(p);
    if (s) for (const id of s) candidates.add(id);
  }
  candidates.delete(opts.guestTabletId);

  const minHostTrigrams = Math.ceil(hostSizeMult * qSize);
  let passingHostFilter = 0;
  let withOverlap = 0;
  const results: EmbeddedFragmentMatch[] = [];

  for (const cid of candidates) {
    const target = corpus.get(cid)!;
    if (target.trigrams.size < minHostTrigrams) continue;     // host-size guard
    passingHostFilter++;
    const { exact, fuzzy, longest_run, examples } = fuzzyIntersection(queryEntry, target);
    if (fuzzy === 0) continue;
    withOverlap++;
    const containment = fuzzy / Math.max(1, qSize);
    if (containment < minContainment) continue;
    if (longest_run < minRun) continue;
    const exactContainment = exact / Math.max(1, qSize);
    results.push({
      host_tablet_id: cid,
      containment: +containment.toFixed(4),
      exact_containment: +exactContainment.toFixed(4),
      fuzzy_intersect: fuzzy,
      exact_intersect: exact,
      query_trigrams: qSize,
      host_trigrams: target.trigrams.size,
      host_size_ratio: +(target.trigrams.size / Math.max(1, qSize)).toFixed(2),
      longest_contiguous_run: longest_run,
      shared_fuzzy_examples: examples,
    });
  }

  // Rank by containment desc, tie-break by longest_run desc
  results.sort((a, b) =>
    b.containment - a.containment ||
    b.longest_contiguous_run - a.longest_contiguous_run,
  );

  return {
    guest_tablet_id: opts.guestTabletId,
    matches: results.slice(0, topK),
    index_stats: {
      total_tablets_indexed: corpus.size,
      query_trigram_count: qSize,
      candidates_examined: candidates.size,
      candidates_passing_host_filter: passingHostFilter,
      candidates_with_overlap: withOverlap,
    },
    warnings,
  };
}
