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

type CorpusEntry = {
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
