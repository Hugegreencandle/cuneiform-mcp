// v0.30.0 — Sign2vec-augmented single-position lacuna restorer.
//
// Complement (NOT replacement) of v0.18.0's `restore_lacuna_passage`. The
// production multi-sign restorer (src/lacunaRestore.ts) uses parallel-template
// alignment + bigram-coherence; its single-position kin is v0.14.2's
// `inferDamagedSigns` (src/signInference.ts), which scores by bigram context
// alone: P(s | prev) × P(s | next).
//
// This tool augments single-position prediction with a SEMANTIC PRIOR derived
// from the v0.23+ sign2vec embeddings. Hypothesis: the missing sign's
// distributional neighborhood should overlap the distributional neighborhoods
// of its observed neighbors. Operationalized as cosine similarity of each
// candidate's embedding to the mean-pooled embedding of the surrounding
// visible signs.
//
// Joint score: α · norm(bigram) + (1-α) · norm(sign2vec) , α default 0.5.
// At α=1 the joint collapses to pure bigram (≈ the v0.18 baseline). At α=0
// the joint collapses to pure sign2vec — exposing the semantic axis as a
// disagreement diagnostic (see audit T3 in scripts/round16-lacuna-sign2vec-audit.mjs).
//
// Cross-tool integration: this is the methodologically cleanest place to
// compose v0.18.0's bigram baseline with v0.23.0's semantic axis, because
// both work on the same `_id → tokens` index and both already expose the
// primitives the joint score needs.
//
// Pure stdlib + reuse of existing module-level caches.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getBigramIndex, type BigramIndexHandle } from "./signInference.js";
import { getSignVector, hasSignEmbedding, signEmbeddingStats } from "./signEmbeddings.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const EXCLUSIONS_FILE = "corpus-exclusions.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);
const LAPLACE = 0.5;

// ─── Public types ──────────────────────────────────────────────────────────

export type SemanticLacunaPrediction = {
  sign: string;
  joint_score: number;
  bigram_score: number;
  sign2vec_score: number;
  rank_by_joint: number;
};

export type SemanticLacunaAblation = {
  pure_bigram_top1: string | null;
  pure_sign2vec_top1: string | null;
  joint_top1: string | null;
  agreement:
    | "all_agree"
    | "bigram_dominates"
    | "sign2vec_dominates"
    | "joint_compromise"
    | "insufficient_signal";
};

export type SemanticLacunaResult = {
  tablet_id: string | null;
  lacuna_position: number;
  surrounding_signs: {
    left2: string | null;
    left1: string | null;
    right1: string | null;
    right2: string | null;
  };
  predictions: SemanticLacunaPrediction[];
  ablation: SemanticLacunaAblation;
  alpha: number;
  embedding_stats: {
    context_signs_with_embedding: number;
    centroid_dim: number;
    embedding_index_loaded: boolean;
  };
  warnings: string[];
};

export type RestoreLacunaSemanticOptions = {
  tablet_id?: string;
  signs?: string;
  lacuna_position: number;
  top_k?: number;
  alpha?: number;
};

// ─── Corpus loader (local copy — keeps this module decoupled from
//     lacunaRestore's private cache, mirroring its tokenization rules) ─────

type CorpusEntry = { tokens: string[] };
let _corpus: Map<string, CorpusEntry> | null = null;
let _excluded = new Set<string>();
let _corpusLoadError: string | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function dataDir(): string {
  return (
    process.env.CUNEIFORM_MCP_DATA_DIR ||
    join(import.meta.dirname ?? process.cwd(), "..", "data")
  );
}

function loadCorpus(): Map<string, CorpusEntry> | null {
  if (_corpus) return _corpus;
  if (_corpusLoadError) return null;

  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _corpusLoadError = `signs cache not found: ${path}`;
    return null;
  }
  try {
    const exPath = join(dataDir(), EXCLUSIONS_FILE);
    if (existsSync(exPath)) {
      const ex = JSON.parse(readFileSync(exPath, "utf-8"));
      _excluded = new Set((ex.excluded_records ?? []).map((r: { id: string }) => r.id));
    }
    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{
      _id: string;
      signs: string;
    }>;
    const out = new Map<string, CorpusEntry>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string" || _excluded.has(r._id)) continue;
      const tokens = r.signs.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      out.set(r._id, { tokens });
    }
    _corpus = out;
    return out;
  } catch (e) {
    _corpusLoadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function isDamaged(token: string | null | undefined): boolean {
  return typeof token === "string" && DAMAGE_TOKENS.has(token);
}

// First non-damaged token strictly LEFT of `position`, skipping `skipOne`
// already-claimed positions. Returns the token at the requested rank
// (1 = immediate left, 2 = next-left, etc.) or null if not found.
function nthLeftVisible(tokens: string[], position: number, rank: number): string | null {
  let found = 0;
  for (let i = position - 1; i >= 0; i--) {
    const t = tokens[i];
    if (!isDamaged(t)) {
      found++;
      if (found === rank) return t;
    }
  }
  return null;
}

function nthRightVisible(tokens: string[], position: number, rank: number): string | null {
  let found = 0;
  for (let i = position + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (!isDamaged(t)) {
      found++;
      if (found === rank) return t;
    }
  }
  return null;
}

function sumValues(m: Map<string, number> | undefined): number {
  if (!m) return 0;
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

// L2-normalize in place. Returns false if the vector is the zero vector
// (in which case the caller should drop it from the centroid).
function l2NormalizeInPlace(v: Float32Array): boolean {
  let s = 0;
  for (let k = 0; k < v.length; k++) s += v[k] * v[k];
  if (s === 0) return false;
  const inv = 1 / Math.sqrt(s);
  for (let k = 0; k < v.length; k++) v[k] *= inv;
  return true;
}

// Min-max normalize a numeric array into [0, 1]. If all values are equal,
// returns all-zeros (so the axis contributes nothing to the joint score —
// this matches the intuition that a flat axis has no information).
function minMaxNormalize(xs: number[]): number[] {
  if (xs.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const x of xs) {
    if (x < min) min = x;
    if (x > max) max = x;
  }
  const span = max - min;
  if (span <= 0) return xs.map(() => 0);
  return xs.map((x) => (x - min) / span);
}

// ─── Bigram score for a single candidate at a position ───────────────────

function bigramScore(
  candidate: string,
  prevVisible: string | null,
  nextVisible: string | null,
  idx: BigramIndexHandle,
): number {
  if (isDamaged(candidate)) return 0;

  const fromPrev = prevVisible ? idx.nextOf.get(prevVisible) : undefined;
  const fromNext = nextVisible ? idx.prevOf.get(nextVisible) : undefined;
  const totalFromPrev = sumValues(fromPrev);
  const totalFromNext = sumValues(fromNext);

  // P(candidate | prev) — smoothed
  const forwardCount = fromPrev?.get(candidate) ?? 0;
  const distinct = idx.totals.size;
  const forwardProb =
    totalFromPrev > 0
      ? (forwardCount + LAPLACE) / (totalFromPrev + LAPLACE * distinct)
      : 0;
  // P(next | candidate) — i.e. how often does `nextVisible` follow this
  // candidate? equivalent to prev-of-next direction.
  const backwardCount = fromNext?.get(candidate) ?? 0;
  const backwardProb =
    totalFromNext > 0
      ? (backwardCount + LAPLACE) / (totalFromNext + LAPLACE * distinct)
      : 0;

  // Geometric mean — matches v0.14.2/v0.18 baseline.
  if (forwardProb === 0 && backwardProb === 0) return 0;
  // If only one side has signal, geometric mean would zero out. Fall back
  // to single-side score in that case (mirrors signInference.ts behavior
  // with its 1e-5 smoothing).
  const eps = 1e-5;
  return Math.sqrt((forwardProb + eps) * (backwardProb + eps));
}

// ─── Sign2vec centroid score ─────────────────────────────────────────────

function buildContextCentroid(
  contextSigns: Array<string | null>,
): { centroid: Float32Array | null; signsUsed: number; dim: number } {
  let centroid: Float32Array | null = null;
  let dim = 0;
  let signsUsed = 0;
  for (const s of contextSigns) {
    if (!s || isDamaged(s)) continue;
    if (!hasSignEmbedding(s)) continue;
    const v = getSignVector(s);
    if (!v) continue;
    if (!centroid) {
      centroid = new Float32Array(v.length);
      dim = v.length;
    }
    for (let k = 0; k < dim; k++) centroid[k] += v[k];
    signsUsed++;
  }
  if (centroid && signsUsed > 0) {
    for (let k = 0; k < dim; k++) centroid[k] /= signsUsed;
    if (!l2NormalizeInPlace(centroid)) {
      return { centroid: null, signsUsed: 0, dim };
    }
  }
  return { centroid, signsUsed, dim };
}

function sign2vecScore(
  candidate: string,
  centroid: Float32Array | null,
): number {
  if (!centroid) return 0;
  const v = getSignVector(candidate);
  if (!v) return 0;
  // getSignVector returns L2-normalized vectors per signEmbeddings.ts spec.
  let s = 0;
  for (let k = 0; k < v.length; k++) s += v[k] * centroid[k];
  return s; // cosine ∈ [-1, 1]
}

// ─── Main entry point ────────────────────────────────────────────────────

export function restoreLacunaSemantic(
  opts: RestoreLacunaSemanticOptions,
): SemanticLacunaResult {
  const warnings: string[] = [];
  const topK = Math.max(1, Math.min(100, opts.top_k ?? 10));
  const rawAlpha = typeof opts.alpha === "number" ? opts.alpha : 0.5;
  const alpha = Math.max(0, Math.min(1, rawAlpha));
  if (rawAlpha !== alpha) {
    warnings.push(`alpha clamped from ${rawAlpha} to [0, 1] → ${alpha}`);
  }

  // Resolve tokens
  const corpus = loadCorpus();
  if (!corpus) {
    return emptyResult(opts.tablet_id ?? null, opts.lacuna_position, alpha, [
      _corpusLoadError ?? "corpus unavailable",
    ]);
  }

  let tokens: string[];
  let tabletId: string | null = null;
  if (opts.tablet_id) {
    const entry = corpus.get(opts.tablet_id);
    if (!entry) {
      return emptyResult(opts.tablet_id, opts.lacuna_position, alpha, [
        `tablet '${opts.tablet_id}' not in signs cache`,
      ]);
    }
    tokens = entry.tokens;
    tabletId = opts.tablet_id;
  } else if (opts.signs) {
    tokens = opts.signs.split(/\s+/).filter(Boolean);
  } else {
    return emptyResult(null, opts.lacuna_position, alpha, [
      "must provide either tablet_id or signs",
    ]);
  }

  const p = opts.lacuna_position;
  if (!Number.isInteger(p) || p < 0 || p >= tokens.length) {
    return emptyResult(tabletId, p, alpha, [
      `lacuna_position ${p} out of range [0, ${tokens.length})`,
    ]);
  }

  // Surrounding signs (skip damaged when walking left/right)
  const left1 = nthLeftVisible(tokens, p, 1);
  const left2 = nthLeftVisible(tokens, p, 2);
  const right1 = nthRightVisible(tokens, p, 1);
  const right2 = nthRightVisible(tokens, p, 2);

  if (!left1 && !right1) {
    return {
      tablet_id: tabletId,
      lacuna_position: p,
      surrounding_signs: { left2, left1, right1, right2 },
      predictions: [],
      ablation: {
        pure_bigram_top1: null,
        pure_sign2vec_top1: null,
        joint_top1: null,
        agreement: "insufficient_signal",
      },
      alpha,
      embedding_stats: {
        context_signs_with_embedding: 0,
        centroid_dim: 0,
        embedding_index_loaded: signEmbeddingStats().loaded,
      },
      warnings: [
        ...warnings,
        "no visible signs adjacent to lacuna_position — bigram axis has no context",
      ],
    };
  }

  // Build candidate pool: union of next-of-left1 and prev-of-right1, with
  // damage tokens removed. This mirrors signInference's "union" pool and
  // keeps the candidate set tractable (no need to score the full 600-sign
  // vocab — the bigram-relevant subset is typically 50-500 signs).
  const bigramIdx = getBigramIndex();
  const fromLeft = left1 ? bigramIdx.nextOf.get(left1) : undefined;
  const fromRight = right1 ? bigramIdx.prevOf.get(right1) : undefined;
  const candidates = new Set<string>();
  if (fromLeft) for (const k of fromLeft.keys()) candidates.add(k);
  if (fromRight) for (const k of fromRight.keys()) candidates.add(k);
  for (const d of DAMAGE_TOKENS) candidates.delete(d);

  if (candidates.size === 0) {
    return {
      tablet_id: tabletId,
      lacuna_position: p,
      surrounding_signs: { left2, left1, right1, right2 },
      predictions: [],
      ablation: {
        pure_bigram_top1: null,
        pure_sign2vec_top1: null,
        joint_top1: null,
        agreement: "insufficient_signal",
      },
      alpha,
      embedding_stats: {
        context_signs_with_embedding: 0,
        centroid_dim: 0,
        embedding_index_loaded: signEmbeddingStats().loaded,
      },
      warnings: [
        ...warnings,
        "empty candidate pool — neither left1 nor right1 has any bigram successors/predecessors in the corpus",
      ],
    };
  }

  // Build sign2vec centroid from up to 4 surrounding signs
  const embStats = signEmbeddingStats();
  if (!embStats.loaded) {
    warnings.push(
      `sign2vec embeddings not loaded (${embStats.load_error ?? "unknown reason"}); semantic axis disabled`,
    );
  }
  const { centroid, signsUsed: contextEmbeddingCount, dim: centroidDim } =
    buildContextCentroid([left2, left1, right1, right2]);

  if (embStats.loaded && contextEmbeddingCount === 0) {
    warnings.push(
      "none of the 4 surrounding signs have sign2vec embeddings; semantic axis contributes 0",
    );
  }

  // Score each candidate on both axes
  type Scored = {
    sign: string;
    bigram: number;
    sign2vec: number;
  };
  const scored: Scored[] = [];
  for (const c of candidates) {
    const bg = bigramScore(c, left1, right1, bigramIdx);
    const sv = sign2vecScore(c, centroid);
    scored.push({ sign: c, bigram: bg, sign2vec: sv });
  }

  // Normalize each axis to [0, 1]. Min-max keeps the axes commensurable
  // and makes α a true interpolation knob.
  const normBigram = minMaxNormalize(scored.map((s) => s.bigram));
  const normSign2vec = minMaxNormalize(scored.map((s) => s.sign2vec));

  // Build the three rankings we report
  const withNorm = scored.map((s, i) => ({
    ...s,
    nBigram: normBigram[i],
    nSign2vec: normSign2vec[i],
    joint: alpha * normBigram[i] + (1 - alpha) * normSign2vec[i],
  }));

  // Pure-axis top-1s (for ablation)
  const sortedByBigram = [...withNorm].sort((a, b) => b.nBigram - a.nBigram);
  const sortedBySign2vec = [...withNorm].sort((a, b) => b.nSign2vec - a.nSign2vec);
  const sortedByJoint = [...withNorm].sort((a, b) => b.joint - a.joint);

  const pureBigramTop1 = sortedByBigram[0]?.sign ?? null;
  const pureSign2vecTop1 = sortedBySign2vec[0]?.sign ?? null;
  const jointTop1 = sortedByJoint[0]?.sign ?? null;

  let agreement: SemanticLacunaAblation["agreement"];
  if (!pureBigramTop1 || !pureSign2vecTop1 || !jointTop1) {
    agreement = "insufficient_signal";
  } else if (pureBigramTop1 === pureSign2vecTop1 && pureSign2vecTop1 === jointTop1) {
    agreement = "all_agree";
  } else if (jointTop1 === pureBigramTop1) {
    agreement = "bigram_dominates";
  } else if (jointTop1 === pureSign2vecTop1) {
    agreement = "sign2vec_dominates";
  } else {
    agreement = "joint_compromise";
  }

  const predictions: SemanticLacunaPrediction[] = sortedByJoint
    .slice(0, topK)
    .map((s, i) => ({
      sign: s.sign,
      joint_score: +s.joint.toFixed(6),
      bigram_score: +s.bigram.toFixed(6),
      sign2vec_score: +s.sign2vec.toFixed(6),
      rank_by_joint: i + 1,
    }));

  return {
    tablet_id: tabletId,
    lacuna_position: p,
    surrounding_signs: { left2, left1, right1, right2 },
    predictions,
    ablation: {
      pure_bigram_top1: pureBigramTop1,
      pure_sign2vec_top1: pureSign2vecTop1,
      joint_top1: jointTop1,
      agreement,
    },
    alpha,
    embedding_stats: {
      context_signs_with_embedding: contextEmbeddingCount,
      centroid_dim: centroid ? centroidDim : 0,
      embedding_index_loaded: embStats.loaded,
    },
    warnings,
  };
}

function emptyResult(
  tabletId: string | null,
  position: number,
  alpha: number,
  warnings: string[],
): SemanticLacunaResult {
  return {
    tablet_id: tabletId,
    lacuna_position: position,
    surrounding_signs: { left2: null, left1: null, right1: null, right2: null },
    predictions: [],
    ablation: {
      pure_bigram_top1: null,
      pure_sign2vec_top1: null,
      joint_top1: null,
      agreement: "insufficient_signal",
    },
    alpha,
    embedding_stats: {
      context_signs_with_embedding: 0,
      centroid_dim: 0,
      embedding_index_loaded: signEmbeddingStats().loaded,
    },
    warnings,
  };
}

// Expose corpus loader for the audit script (read-only — returns a snapshot
// of tablet_id → tokens). Used to pick benchmark tablets without hard-coding.
export function listIndexedTablets(): Array<{ id: string; length: number }> {
  const c = loadCorpus();
  if (!c) return [];
  const out: Array<{ id: string; length: number }> = [];
  for (const [id, entry] of c) {
    out.push({ id, length: entry.tokens.length });
  }
  return out;
}

export function getTabletTokens(id: string): string[] | null {
  const c = loadCorpus();
  if (!c) return null;
  return c.get(id)?.tokens ?? null;
}
