// v0.17.0 — Multi-sign lacuna restoration.
//
// Extends v0.14.2's `infer_damaged_sign` (single-sign bigram inference) to
// multi-sign damaged passages. For a damaged stretch of length k (between
// known boundary signs), the algorithm:
//
//   1. Builds a prefix+suffix context fingerprint (trigrams over the ±W
//      known signs adjacent to the lacuna)
//   2. Scans the 36,498-tablet eBL corpus for templates whose local sign
//      sequence contains BOTH a prefix-trigram AND a suffix-trigram
//      within distance k ± tolerance (the candidate fill region)
//   3. Extracts the intervening signs from each matching template as a
//      candidate fill
//   4. Scores each candidate by:
//        - local_jaccard: Jaccard over (seed prefix+suffix trigrams) vs
//          (template's same-window trigrams) — measures local alignment
//        - bigram_coherence: geometric mean of P(c_i+1|c_i) across the
//          fill + boundary bigrams P(c_0|prefix_last) + P(suffix_first|c_N)
//   5. Returns top-K ranked candidates with full evidence (template
//      tablet, anchors, scores, fill length)
//
// When no template match is found, falls back to a simple bigram
// beam-search using the same signInference index.
//
// Pure stdlib + reuse of v0.14.2's bigram index. Corpus loaded lazily;
// ~3 sec to tokenize 36K tablets on first call.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getBigramIndex, type BigramIndexHandle } from "./signInference.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const EXCLUSIONS_FILE = "corpus-exclusions.json";

// ─── Public types ──────────────────────────────────────────────────────────

export type RestorationMethod = "parallel_template" | "beam_search";

export type LacunaCandidate = {
  signs: string[]; // tokenized fill, length = lacuna_size (or ± tolerance)
  signs_str: string; // space-joined for display
  fill_length: number;
  score: number; // 0-1, higher = more plausible
  method: RestorationMethod;
  evidence: {
    template_tablet?: string;
    local_jaccard?: number;
    bigram_coherence?: number;
    prefix_anchor?: string;
    suffix_anchor?: string;
    fill_position_in_template?: number;
  };
};

export type LacunaRestoreResult = {
  tablet_id: string | null;
  lacuna: { start: number; end: number; size: number };
  context: {
    prefix: string[];
    suffix: string[];
    prefix_trigrams_count: number;
    suffix_trigrams_count: number;
  };
  candidates: LacunaCandidate[];
  index_stats: {
    total_tablets: number;
    templates_examined: number;
    template_matches_found: number;
    fallback_to_beam_search: boolean;
  };
  warnings: string[];
};

// ─── Corpus loader (lazy) ──────────────────────────────────────────────────

type CorpusEntry = { tokens: string[]; trigrams: Set<string> };
let _corpus: Map<string, CorpusEntry> | null = null;
let _excluded = new Set<string>();
let _loadError: string | null = null;

function dataDir(): string {
  return process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(import.meta.dirname ?? process.cwd(), "..", "data");
}

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadCorpus(): Map<string, CorpusEntry> | null {
  if (_corpus) return _corpus;
  if (_loadError) return null;

  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _loadError = `signs cache not found: ${path} (run --prefetch or build-signs-index)`;
    return null;
  }
  try {
    // Load exclusions
    const exPath = join(dataDir(), EXCLUSIONS_FILE);
    if (existsSync(exPath)) {
      const ex = JSON.parse(readFileSync(exPath, "utf-8"));
      _excluded = new Set((ex.excluded_records ?? []).map((r: { id: string }) => r.id));
    }

    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{ _id: string; signs: string }>;
    const out = new Map<string, CorpusEntry>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string" || _excluded.has(r._id)) continue;
      const tokens: string[] = [];
      const trigrams = new Set<string>();
      for (const line of r.signs.split(/\r?\n/)) {
        const toks = line.trim().split(/\s+/).filter(Boolean);
        const base = tokens.length;
        for (const t of toks) tokens.push(t);
        for (let i = 0; i + 2 < toks.length; i++) {
          const a = toks[i], b = toks[i + 1], c = toks[i + 2];
          const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
          if (xCount >= 2) continue;
          trigrams.add(a + " " + b + " " + c);
        }
        void base;
      }
      if (tokens.length === 0) continue;
      out.set(r._id, { tokens, trigrams });
    }
    _corpus = out;
    return out;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function trigramsOf(arr: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 2 < arr.length; i++) {
    out.push(arr[i] + " " + arr[i + 1] + " " + arr[i + 2]);
  }
  return out;
}

function jaccardSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (big.has(x)) inter++;
  if (inter === 0) return 0;
  return inter / (a.size + b.size - inter);
}

function findContiguousX(tokens: string[]): Array<{ start: number; end: number }> {
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i] === "X") {
      const start = i;
      while (i < tokens.length && tokens[i] === "X") i++;
      out.push({ start, end: i });
    } else i++;
  }
  return out;
}

// Bigram coherence over a candidate fill, anchored to prefix_last + suffix_first
function bigramCoherence(
  fill: string[],
  prefixLast: string | null,
  suffixFirst: string | null,
  idx: BigramIndexHandle,
): number {
  if (fill.length === 0) return 0;
  // Build the boundary-padded sequence
  const seq: (string | null)[] = [prefixLast, ...fill, suffixFirst];
  let logSum = 0;
  let n = 0;
  const LAPLACE = 0.5;
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = seq[i];
    const b = seq[i + 1];
    if (!a || !b || a === "X" || b === "X") continue;
    const fromA = idx.nextOf.get(a);
    let totalAfterA = 0;
    if (fromA) for (const v of fromA.values()) totalAfterA += v;
    const countAB = fromA?.get(b) ?? 0;
    const totalDistinct = idx.totals.size;
    // Smoothed conditional
    const p = (countAB + LAPLACE) / (totalAfterA + LAPLACE * totalDistinct);
    logSum += Math.log(p);
    n++;
  }
  if (n === 0) return 0;
  const avgLogP = logSum / n;
  // Map avg log-p to 0-1 with a soft squash
  return Math.exp(avgLogP) ** 0.5;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type LacunaRestoreOptions = {
  tabletId?: string;
  signs?: string;
  lacunaStart?: number;
  lacunaEnd?: number;
  prefixWindow?: number; // default 6 — number of known signs to take as prefix
  suffixWindow?: number; // default 6 — same for suffix
  topKTemplates?: number; // default 50 — how many candidate templates to inspect per match
  topKCandidates?: number; // default 10
  lacunaSizeTolerance?: number; // default 2 — allow fill_length ∈ [size-tol, size+tol]
};

export function restoreLacunaPassage(opts: LacunaRestoreOptions): LacunaRestoreResult {
  const prefixWindow = opts.prefixWindow ?? 6;
  const suffixWindow = opts.suffixWindow ?? 6;
  const topKCandidates = opts.topKCandidates ?? 10;
  const sizeTolerance = opts.lacunaSizeTolerance ?? 2;
  const warnings: string[] = [];

  // 1. Resolve tokens
  const corpus = loadCorpus();
  if (!corpus) {
    return emptyResult(opts.tabletId ?? null, [_loadError ?? "corpus unavailable"]);
  }

  let tokens: string[];
  let tabletId: string | null = null;
  if (opts.tabletId) {
    const entry = corpus.get(opts.tabletId);
    if (!entry) {
      return emptyResult(opts.tabletId, [`tablet '${opts.tabletId}' not in signs cache`]);
    }
    tokens = entry.tokens;
    tabletId = opts.tabletId;
  } else if (opts.signs) {
    tokens = opts.signs.split(/\s+/).filter(Boolean);
  } else {
    return emptyResult(null, ["must provide either tabletId or signs"]);
  }

  // 2. Determine lacuna range
  let lacunaStart: number, lacunaEnd: number;
  if (opts.lacunaStart != null && opts.lacunaEnd != null) {
    lacunaStart = opts.lacunaStart;
    lacunaEnd = opts.lacunaEnd;
  } else {
    const stretches = findContiguousX(tokens);
    if (stretches.length === 0) {
      return {
        tablet_id: tabletId,
        lacuna: { start: -1, end: -1, size: 0 },
        context: { prefix: [], suffix: [], prefix_trigrams_count: 0, suffix_trigrams_count: 0 },
        candidates: [],
        index_stats: { total_tablets: corpus.size, templates_examined: 0, template_matches_found: 0, fallback_to_beam_search: false },
        warnings: ["no X (damaged) tokens found in input — nothing to restore"],
      };
    }
    stretches.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    lacunaStart = stretches[0].start;
    lacunaEnd = stretches[0].end;
    if (stretches.length > 1) warnings.push(`${stretches.length} damaged stretches found; auto-selected the longest (positions ${lacunaStart}-${lacunaEnd - 1}, size ${lacunaEnd - lacunaStart})`);
  }

  const lacunaSize = lacunaEnd - lacunaStart;
  if (lacunaSize <= 0) {
    return emptyResult(tabletId, [`invalid lacuna range [${lacunaStart}, ${lacunaEnd})`]);
  }

  // 3. Build context windows (skip X tokens inside the window)
  const prefix = tokens.slice(Math.max(0, lacunaStart - prefixWindow), lacunaStart).filter((t) => t !== "X");
  const suffix = tokens.slice(lacunaEnd, Math.min(tokens.length, lacunaEnd + suffixWindow)).filter((t) => t !== "X");

  const prefixTris = new Set(trigramsOf(prefix));
  const suffixTris = new Set(trigramsOf(suffix));
  const localContextTris = new Set([...prefixTris, ...suffixTris]);

  const prefixLast = prefix.length > 0 ? prefix[prefix.length - 1] : null;
  const suffixFirst = suffix.length > 0 ? suffix[0] : null;

  if (prefixTris.size === 0 && suffixTris.size === 0) {
    return {
      tablet_id: tabletId,
      lacuna: { start: lacunaStart, end: lacunaEnd, size: lacunaSize },
      context: { prefix, suffix, prefix_trigrams_count: 0, suffix_trigrams_count: 0 },
      candidates: [],
      index_stats: { total_tablets: corpus.size, templates_examined: 0, template_matches_found: 0, fallback_to_beam_search: false },
      warnings: ["insufficient prefix/suffix context: need at least 3 known signs on one side to form a trigram anchor"],
    };
  }

  // 4. Find template matches
  // Strategy: scan all corpus tablets that contain at least one prefix-trigram OR one suffix-trigram.
  // For each, locate prefix-trigram positions, then look ahead by [size - tol, size + tol] for a
  // suffix-trigram. Extract the intervening tokens as a candidate fill.

  const idx = getBigramIndex(); // may throw if corpus not loaded; we already loaded so ok
  let examined = 0;
  let matches = 0;
  const candidateMap = new Map<string, LacunaCandidate>();

  for (const [tid, entry] of corpus) {
    if (tid === tabletId) continue;
    // Quick filter: must intersect prefix OR suffix tri-set
    let hasPref = false, hasSuf = false;
    for (const t of entry.trigrams) {
      if (prefixTris.has(t)) hasPref = true;
      if (suffixTris.has(t)) hasSuf = true;
      if (hasPref && hasSuf) break;
    }
    if (!hasPref || !hasSuf) continue;
    examined++;

    // Walk the template looking for prefix-trigram positions
    const ttok = entry.tokens;
    for (let i = 0; i + 2 < ttok.length; i++) {
      const tri = ttok[i] + " " + ttok[i + 1] + " " + ttok[i + 2];
      if (!prefixTris.has(tri)) continue;
      // The prefix trigram ends at position i+2. Fill starts at i+3.
      const fillStart = i + 3;
      // Look for suffix trigram at fillStart + d for d ∈ [size - tol, size + tol]
      for (let d = Math.max(0, lacunaSize - sizeTolerance); d <= lacunaSize + sizeTolerance; d++) {
        const fillEnd = fillStart + d;
        if (fillEnd + 2 >= ttok.length) break;
        const sufTri = ttok[fillEnd] + " " + ttok[fillEnd + 1] + " " + ttok[fillEnd + 2];
        if (!suffixTris.has(sufTri)) continue;
        // Found alignment — extract fill tokens
        const fillTokens = ttok.slice(fillStart, fillEnd);
        if (fillTokens.length === 0) continue;
        // Reject fills containing X — that would be cheating (template is also damaged here)
        if (fillTokens.some((t) => t === "X")) continue;

        const fillKey = fillTokens.join(" ");
        if (candidateMap.has(fillKey)) continue;

        // Score: local Jaccard on (prefix+suffix tris) vs (template's local window tris)
        const tempLocalWindow = ttok.slice(
          Math.max(0, i - prefixWindow),
          Math.min(ttok.length, fillEnd + suffixWindow),
        );
        const tempLocalTris = new Set(trigramsOf(tempLocalWindow));
        const localJac = jaccardSets(localContextTris, tempLocalTris);
        const coherence = bigramCoherence(fillTokens, prefixLast, suffixFirst, idx);

        // Combined score: weighted geometric mean of local_jaccard and bigram_coherence
        const score = Math.sqrt(Math.max(0, localJac) * Math.max(0, coherence));

        candidateMap.set(fillKey, {
          signs: fillTokens,
          signs_str: fillKey,
          fill_length: fillTokens.length,
          score: +score.toFixed(4),
          method: "parallel_template",
          evidence: {
            template_tablet: tid,
            local_jaccard: +localJac.toFixed(4),
            bigram_coherence: +coherence.toFixed(4),
            prefix_anchor: tri,
            suffix_anchor: sufTri,
            fill_position_in_template: fillStart,
          },
        });
        matches++;
      }
    }
  }

  let fallback = false;
  let ranked = [...candidateMap.values()].sort((a, b) => b.score - a.score).slice(0, topKCandidates);

  // 5. Beam-search fallback if no template matches
  if (ranked.length === 0) {
    fallback = true;
    warnings.push("no parallel-template matches — falling back to bigram beam search (lower-confidence candidates)");
    ranked = beamSearch(idx, prefixLast, suffixFirst, lacunaSize, topKCandidates);
  }

  return {
    tablet_id: tabletId,
    lacuna: { start: lacunaStart, end: lacunaEnd, size: lacunaSize },
    context: {
      prefix,
      suffix,
      prefix_trigrams_count: prefixTris.size,
      suffix_trigrams_count: suffixTris.size,
    },
    candidates: ranked,
    index_stats: {
      total_tablets: corpus.size,
      templates_examined: examined,
      template_matches_found: matches,
      fallback_to_beam_search: fallback,
    },
    warnings,
  };
}

function beamSearch(
  idx: BigramIndexHandle,
  prefixLast: string | null,
  suffixFirst: string | null,
  length: number,
  topK: number,
): LacunaCandidate[] {
  const beamSize = 12;
  type Beam = { seq: string[]; logP: number };
  let beams: Beam[] = [{ seq: [], logP: 0 }];

  for (let step = 0; step < length; step++) {
    const expanded: Beam[] = [];
    for (const b of beams) {
      const prev = b.seq.length > 0 ? b.seq[b.seq.length - 1] : prefixLast;
      if (!prev) {
        // No prior context — sample from top frequencies
        const top = [...idx.totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, beamSize);
        const totalAll = [...idx.totals.values()].reduce((s, v) => s + v, 0);
        for (const [t, c] of top) {
          if (t === "X") continue;
          expanded.push({ seq: [...b.seq, t], logP: b.logP + Math.log(c / totalAll) });
        }
        continue;
      }
      const fromPrev = idx.nextOf.get(prev);
      if (!fromPrev) continue;
      const totalAfterPrev = [...fromPrev.values()].reduce((s, v) => s + v, 0);
      const sorted = [...fromPrev.entries()].sort((a, b) => b[1] - a[1]).slice(0, beamSize);
      for (const [t, c] of sorted) {
        if (t === "X") continue;
        const p = (c + 0.5) / (totalAfterPrev + 0.5 * idx.totals.size);
        expanded.push({ seq: [...b.seq, t], logP: b.logP + Math.log(p) });
      }
    }
    expanded.sort((a, b) => b.logP - a.logP);
    beams = expanded.slice(0, beamSize);
    if (beams.length === 0) break;
  }

  // Final pass: weight by P(suffix_first | last_fill)
  if (suffixFirst) {
    for (const b of beams) {
      const last = b.seq.length > 0 ? b.seq[b.seq.length - 1] : prefixLast;
      if (!last) continue;
      const fromLast = idx.nextOf.get(last);
      const totalAfterLast = fromLast ? [...fromLast.values()].reduce((s, v) => s + v, 0) : 0;
      const c = fromLast?.get(suffixFirst) ?? 0;
      const p = (c + 0.5) / (totalAfterLast + 0.5 * idx.totals.size);
      b.logP += Math.log(p);
    }
    beams.sort((a, b) => b.logP - a.logP);
  }

  return beams.slice(0, topK).map((b) => ({
    signs: b.seq,
    signs_str: b.seq.join(" "),
    fill_length: b.seq.length,
    score: +Math.exp(b.logP / Math.max(1, b.seq.length)).toFixed(4),
    method: "beam_search",
    evidence: {
      bigram_coherence: +Math.exp(b.logP / Math.max(1, b.seq.length)).toFixed(4),
    },
  }));
}

function emptyResult(tabletId: string | null, warnings: string[]): LacunaRestoreResult {
  return {
    tablet_id: tabletId,
    lacuna: { start: -1, end: -1, size: 0 },
    context: { prefix: [], suffix: [], prefix_trigrams_count: 0, suffix_trigrams_count: 0 },
    candidates: [],
    index_stats: { total_tablets: 0, templates_examined: 0, template_matches_found: 0, fallback_to_beam_search: false },
    warnings,
  };
}

export function lacunaIndexStats(): { loaded: boolean; total_tablets: number; load_error: string | null } {
  const corpus = loadCorpus();
  return {
    loaded: !!corpus,
    total_tablets: corpus?.size ?? 0,
    load_error: _loadError,
  };
}
