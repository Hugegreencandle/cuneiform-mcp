// v0.14.2 — Damaged-Tablet Sign-Inference Engine.
//
// For each `X` (damaged-position token) in an eBL transliteration, suggest
// the most-probable sign based on bigram context across the eBL corpus.
// Scoring: P(sign | prev_sign) × P(sign | next_sign), normalized, with
// optional period/genre conditioning when tablet metadata is available.
//
// The bigram index is built lazily on first call from
// $CUNEIFORM_MCP_CACHE_DIR/all-signs-full.json (the same cache the v0.13
// Discovery Engine reads from). 36,498 tablets, ~1.8M bigrams, builds in
// ~3 seconds and stays in memory for the process lifetime.
//
// Period/genre conditioning is opt-in and uses data/tabletMetadata.json
// (the v0.13.1 enrichment dataset; 226 tablets with normalized metadata).
// When period/genre is requested but not in the metadata, the inference
// falls back to the unconditioned bigram score with a `warnings` flag.
//
// Pure stdlib — no new dependencies beyond what cuneiform-mcp already uses.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ALL_SIGNS_FILE = "all-signs-full.json";
const METADATA_FILE = "tabletMetadata.json";
const DAMAGE_TOKENS = new Set(["X", "x"]);

// ─── Public types ──────────────────────────────────────────────────────────

export type InferenceCandidate = {
  sign: string;
  score: number;
  evidence: {
    forward_prob: number;
    backward_prob: number;
    forward_count: number;
    backward_count: number;
    total_corpus_count: number;
  };
};

export type InferenceForPosition = {
  position: number; // index in the sign-token array
  context: {
    prev_sign: string | null;
    next_sign: string | null;
    snippet: string; // small window for human display
  };
  candidates: InferenceCandidate[];
};

export type InferenceResult = {
  tablet_id: string | null;
  input_signs_length: number;
  damaged_positions: number[];
  inferences: InferenceForPosition[];
  conditioning: {
    period?: string;
    genre?: string;
    applied: boolean;
  };
  index_stats: {
    total_tablets: number;
    total_signs: number;
    distinct_signs: number;
    bigram_pairs: number;
  };
  warnings: string[];
};

// ─── Index types ───────────────────────────────────────────────────────────

type SignCounts = Map<string, number>;

type BigramIndex = {
  // For each sign s: { what sign came BEFORE s, with count }
  prevOf: Map<string, SignCounts>;
  // For each sign s: { what sign came AFTER s, with count }
  nextOf: Map<string, SignCounts>;
  // Unconditional sign frequency
  totals: Map<string, number>;
  // Period-conditioned sign frequency (e.g. "Neo_Assyrian" → SignCounts)
  byPeriod: Map<string, SignCounts>;
  // Genre-conditioned sign frequency
  byGenre: Map<string, SignCounts>;
  // Bookkeeping
  totalTablets: number;
  totalSignTokens: number;
  distinctSigns: number;
  bigramPairs: number;
};

// ─── Cache directory ───────────────────────────────────────────────────────

function getCacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function getDataDir(): string {
  // tabletMetadata.json lives in the repo's data/ folder
  return process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(import.meta.dirname ?? process.cwd(), "..", "data");
}

// ─── Tokenization ──────────────────────────────────────────────────────────

function tokenizeSigns(raw: string): string[] {
  return raw.split(/\s+/).filter((t) => t.length > 0);
}

function isDamaged(token: string): boolean {
  return DAMAGE_TOKENS.has(token);
}

// ─── Index build (lazy, cached) ────────────────────────────────────────────

let _index: BigramIndex | null = null;
let _buildError: Error | null = null;

function buildIndex(): BigramIndex {
  if (_index) return _index;
  if (_buildError) throw _buildError;
  try {
    const path = join(getCacheDir(), ALL_SIGNS_FILE);
    if (!existsSync(path)) {
      throw new Error(
        `Sign corpus cache not found: ${path}. Run 'npm run prefetch' or 'node scripts/build-signs-index.mjs' first.`,
      );
    }
    const raw = readFileSync(path, "utf-8");
    const records: Array<{ _id: string; signs: string }> = JSON.parse(raw);

    // Load tablet metadata for period/genre conditioning (best-effort).
    let metadataMap: Map<string, { period?: string; genre?: string }> = new Map();
    const metaPath = join(getDataDir(), METADATA_FILE);
    if (existsSync(metaPath)) {
      try {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
        const tablets = meta.tablets ?? {};
        for (const [id, info] of Object.entries(tablets) as Array<[string, { period?: string; genre?: string }]>) {
          metadataMap.set(id, info);
        }
      } catch {
        // Skip; metadata is optional.
      }
    }

    const prevOf = new Map<string, SignCounts>();
    const nextOf = new Map<string, SignCounts>();
    const totals = new Map<string, number>();
    const byPeriod = new Map<string, SignCounts>();
    const byGenre = new Map<string, SignCounts>();

    let totalSignTokens = 0;
    let bigramPairs = 0;

    for (const rec of records) {
      const tokens = tokenizeSigns(rec.signs);
      const meta = metadataMap.get(rec._id);

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (isDamaged(t)) continue;
        totalSignTokens++;
        totals.set(t, (totals.get(t) ?? 0) + 1);
        if (meta?.period) {
          let m = byPeriod.get(meta.period);
          if (!m) { m = new Map(); byPeriod.set(meta.period, m); }
          m.set(t, (m.get(t) ?? 0) + 1);
        }
        if (meta?.genre) {
          let m = byGenre.get(meta.genre);
          if (!m) { m = new Map(); byGenre.set(meta.genre, m); }
          m.set(t, (m.get(t) ?? 0) + 1);
        }
      }

      // Bigram pairs — skip pairs that include damage tokens
      for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i];
        const b = tokens[i + 1];
        if (isDamaged(a) || isDamaged(b)) continue;
        // nextOf[a][b]++
        let n = nextOf.get(a);
        if (!n) { n = new Map(); nextOf.set(a, n); }
        n.set(b, (n.get(b) ?? 0) + 1);
        // prevOf[b][a]++
        let p = prevOf.get(b);
        if (!p) { p = new Map(); prevOf.set(b, p); }
        p.set(a, (p.get(a) ?? 0) + 1);
        bigramPairs++;
      }
    }

    _index = {
      prevOf,
      nextOf,
      totals,
      byPeriod,
      byGenre,
      totalTablets: records.length,
      totalSignTokens,
      distinctSigns: totals.size,
      bigramPairs,
    };
    return _index;
  } catch (e) {
    _buildError = e instanceof Error ? e : new Error(String(e));
    throw _buildError;
  }
}

function sumValues(m: SignCounts | undefined): number {
  if (!m) return 0;
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

// ─── Inference ─────────────────────────────────────────────────────────────

export type InferOptions = {
  position?: number;
  period?: string;
  genre?: string;
  topK?: number;
  candidatePool?: "next_of_prev" | "prev_of_next" | "union" | "intersection";
};

function inferAtPosition(
  tokens: string[],
  position: number,
  idx: BigramIndex,
  opts: InferOptions,
): InferenceForPosition {
  const topK = opts.topK ?? 8;
  const pool = opts.candidatePool ?? "intersection";

  let prev: string | null = null;
  for (let i = position - 1; i >= 0; i--) {
    if (!isDamaged(tokens[i])) { prev = tokens[i]; break; }
  }
  let next: string | null = null;
  for (let i = position + 1; i < tokens.length; i++) {
    if (!isDamaged(tokens[i])) { next = tokens[i]; break; }
  }

  const fromPrev = prev ? idx.nextOf.get(prev) : undefined; // signs that came AFTER prev
  const fromNext = next ? idx.prevOf.get(next) : undefined; // signs that came BEFORE next
  const totalFromPrev = sumValues(fromPrev);
  const totalFromNext = sumValues(fromNext);

  // Candidate pool
  let candidates = new Set<string>();
  const addAll = (m: SignCounts | undefined) => { if (m) for (const k of m.keys()) candidates.add(k); };
  if (pool === "next_of_prev") {
    addAll(fromPrev);
  } else if (pool === "prev_of_next") {
    addAll(fromNext);
  } else if (pool === "union") {
    addAll(fromPrev); addAll(fromNext);
  } else { // intersection — strictest, falls back to union if intersection is empty
    if (fromPrev && fromNext) {
      for (const k of fromPrev.keys()) if (fromNext.has(k)) candidates.add(k);
    }
    if (candidates.size === 0) { addAll(fromPrev); addAll(fromNext); }
  }
  candidates.delete("X"); candidates.delete("x");

  // Optional period/genre conditioning pool
  const periodCounts = opts.period ? idx.byPeriod.get(opts.period) : undefined;
  const genreCounts = opts.genre ? idx.byGenre.get(opts.genre) : undefined;
  const periodTotal = sumValues(periodCounts);
  const genreTotal = sumValues(genreCounts);

  // Score each candidate
  const scored: InferenceCandidate[] = [];
  for (const c of candidates) {
    const forwardCount = fromPrev?.get(c) ?? 0;
    const backwardCount = fromNext?.get(c) ?? 0;
    const corpusCount = idx.totals.get(c) ?? 0;
    const forwardProb = totalFromPrev > 0 ? forwardCount / totalFromPrev : 0;
    const backwardProb = totalFromNext > 0 ? backwardCount / totalFromNext : 0;
    // Use geometric mean of P(c|prev) and P(c|next).
    // Apply Laplace-style smoothing (+1e-5) to avoid zero-product when one side
    // is missing (e.g., position 0 has no `prev`).
    let score = Math.sqrt((forwardProb + 1e-5) * (backwardProb + 1e-5));
    // Conditioning: soft multiplicative boost from period/genre distribution.
    if (periodCounts && periodTotal > 0) {
      const periodProb = (periodCounts.get(c) ?? 0) / periodTotal;
      score *= 0.5 + periodProb;
    }
    if (genreCounts && genreTotal > 0) {
      const genreProb = (genreCounts.get(c) ?? 0) / genreTotal;
      score *= 0.5 + genreProb;
    }
    scored.push({
      sign: c,
      score,
      evidence: {
        forward_prob: forwardProb,
        backward_prob: backwardProb,
        forward_count: forwardCount,
        backward_count: backwardCount,
        total_corpus_count: corpusCount,
      },
    });
  }
  scored.sort((a, b) => b.score - a.score);

  // Snippet for human display: 5 tokens around position with [?] for damaged
  const start = Math.max(0, position - 3);
  const end = Math.min(tokens.length, position + 4);
  const snippet = tokens.slice(start, end)
    .map((t, idx2) => (start + idx2 === position) ? "[?]" : t)
    .join(" ");

  return {
    position,
    context: { prev_sign: prev, next_sign: next, snippet },
    candidates: scored.slice(0, topK),
  };
}

export function inferDamagedSigns(
  signsRaw: string,
  opts: InferOptions = {},
): Omit<InferenceResult, "tablet_id"> {
  const idx = buildIndex();
  const tokens = tokenizeSigns(signsRaw);

  // Find all damaged positions
  const damagedPositions: number[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (isDamaged(tokens[i])) damagedPositions.push(i);
  }

  const targets = opts.position !== undefined ? [opts.position] : damagedPositions;
  const warnings: string[] = [];

  const inferences: InferenceForPosition[] = [];
  for (const p of targets) {
    if (p < 0 || p >= tokens.length) {
      warnings.push(`position ${p} out of range`);
      continue;
    }
    if (opts.position !== undefined && !isDamaged(tokens[p])) {
      warnings.push(`position ${p} ("${tokens[p]}") is not a damage token, but inferring anyway`);
    }
    inferences.push(inferAtPosition(tokens, p, idx, opts));
  }

  const periodApplied = opts.period && idx.byPeriod.has(opts.period);
  const genreApplied = opts.genre && idx.byGenre.has(opts.genre);
  if (opts.period && !periodApplied) warnings.push(`period "${opts.period}" not represented in tablet metadata; conditioning skipped`);
  if (opts.genre && !genreApplied) warnings.push(`genre "${opts.genre}" not represented in tablet metadata; conditioning skipped`);

  return {
    input_signs_length: tokens.length,
    damaged_positions: damagedPositions,
    inferences,
    conditioning: {
      ...(opts.period ? { period: opts.period } : {}),
      ...(opts.genre ? { genre: opts.genre } : {}),
      applied: !!(periodApplied || genreApplied),
    },
    index_stats: {
      total_tablets: idx.totalTablets,
      total_signs: idx.totalSignTokens,
      distinct_signs: idx.distinctSigns,
      bigram_pairs: idx.bigramPairs,
    },
    warnings,
  };
}

// Look up a tablet by museum number in the all-signs cache.
export function getCachedSigns(museumNumber: string): string | null {
  // Walk the cache. Inefficient at 36k but only called once per tool invocation
  // and the lookup is on first-use after cache load.
  buildIndex(); // ensure cache is loaded
  const path = join(getCacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) return null;
  const records: Array<{ _id: string; signs: string }> = JSON.parse(readFileSync(path, "utf-8"));
  const found = records.find((r) => r._id === museumNumber);
  return found?.signs ?? null;
}

export function indexStats() {
  const idx = buildIndex();
  return {
    total_tablets: idx.totalTablets,
    total_signs: idx.totalSignTokens,
    distinct_signs: idx.distinctSigns,
    bigram_pairs: idx.bigramPairs,
    period_buckets: [...idx.byPeriod.keys()],
    genre_buckets: [...idx.byGenre.keys()],
  };
}

// v0.17.1 / v0.18 — expose the internal bigram index for downstream tools
// (lacuna restorer + others that need the prev_sign/next_sign tables).
export type BigramIndexHandle = {
  prevOf: Map<string, Map<string, number>>;
  nextOf: Map<string, Map<string, number>>;
  totals: Map<string, number>;
};

export function getBigramIndex(): BigramIndexHandle {
  const idx = buildIndex();
  return { prevOf: idx.prevOf, nextOf: idx.nextOf, totals: idx.totals };
}
