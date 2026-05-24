// v0.32.0 — identify_composition.
//
// Given a query tablet, return the most-probable composition assignments
// from the methods-paper-anchored registry. Two axes:
//   (a) chunk_overlap — Jaccard-like score over length-20 chunk-host sets
//   (b) sign2vec_centroid — cosine between query's sign-centroid and the
//       composition's pooled-exemplar sign-centroid
//
// Self-handling: if the query itself is an exemplar of composition C, its
// own appearance in the exemplar list is filtered out before scoring so
// the chunk-overlap score reflects true sibling overlap rather than a
// degenerate self-match.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  COMPOSITION_REGISTRY,
  type CompositionEntry,
} from "./compositionRegistry.js";
import { getChunksContaining, loadChunkIndex } from "./chunkIndex.js";
import { getSignVector, hasSignEmbedding, signEmbeddingStats } from "./signEmbeddings.js";
import { getFragmentMetadata, getPeriod, getPrimaryGenre } from "./fragmentMetadata.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);
const MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC = 5;

export type IdentifyCompositionAxisScore = {
  raw: number;
  normalized: number;
  applicable: boolean;
  note: string | null;
};

export type IdentifyCompositionCandidate = {
  composition_id: string;
  composition_name: string;
  composition_type: "specific_composition" | "curriculum";
  paper_sections: string[];
  confidence: number;
  axis_scores: {
    chunk_overlap: IdentifyCompositionAxisScore;
    sign2vec_centroid: IdentifyCompositionAxisScore;
  };
  evidence: {
    n_exemplars_considered: number;
    n_exemplars_with_chunks: number;
    top_exemplar_id: string | null;
    top_exemplar_shared_chunks: number;
    query_in_exemplar_list: boolean;
  };
  rationale: string;
};

export type IdentifyCompositionResult = {
  query: {
    tablet_id: string;
    sign_count: number | null;
    period: string | null;
    primary_genre: string | null;
  };
  candidates: IdentifyCompositionCandidate[];
  compositions_considered: number;
  index_stats: {
    chunk_index_loaded: boolean;
    sign_embeddings_loaded: boolean;
    signs_cache_loaded: boolean;
    query_signs_with_embedding: number;
  };
  warnings: string[];
};

export type IdentifyCompositionOptions = {
  tabletId: string;
  topK?: number;
  axisWeights?: { chunk_overlap?: number; sign2vec_centroid?: number };
  minConfidence?: number;
};

// ─── Local signs cache (mirrors restoreLacunaSemantic pattern) ─────────────

type CorpusEntry = { tokens: string[] };
let _corpus: Map<string, CorpusEntry> | null = null;
let _corpusLoadError: string | null = null;

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadSignsCorpus(): Map<string, CorpusEntry> | null {
  if (_corpus) return _corpus;
  if (_corpusLoadError) return null;

  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    _corpusLoadError = `signs cache not found: ${path}`;
    return null;
  }
  try {
    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{
      _id: string;
      signs: string;
    }>;
    const out = new Map<string, CorpusEntry>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string") continue;
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

export function _resetCacheForTests(): void {
  _corpus = null;
  _corpusLoadError = null;
}

// ─── Sign centroid helpers ─────────────────────────────────────────────────

function signsForTablet(tabletId: string): string[] {
  const corpus = loadSignsCorpus();
  if (!corpus) return [];
  const entry = corpus.get(tabletId);
  if (!entry) return [];
  return entry.tokens.filter((t) => !DAMAGE_TOKENS.has(t));
}

function signCentroid(signs: string[]): { centroid: Float32Array | null; n_embedded: number } {
  let centroid: Float32Array | null = null;
  let n = 0;
  for (const s of signs) {
    if (!hasSignEmbedding(s)) continue;
    const v = getSignVector(s);
    if (!v) continue;
    if (!centroid) centroid = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) centroid[i] += v[i];
    n++;
  }
  if (!centroid || n === 0) return { centroid: null, n_embedded: 0 };
  for (let i = 0; i < centroid.length; i++) centroid[i] /= n;
  // L2 normalize
  let norm = 0;
  for (let i = 0; i < centroid.length; i++) norm += centroid[i] * centroid[i];
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < centroid.length; i++) centroid[i] /= norm;
  }
  return { centroid, n_embedded: n };
}

function cosineUnit(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

// ─── Chunk overlap helpers ─────────────────────────────────────────────────

function chunkHashSet(tabletId: string): Set<string> {
  const chunks = getChunksContaining(tabletId);
  const out = new Set<string>();
  for (const c of chunks) out.add(c.hash);
  return out;
}

// ─── Main entry point ──────────────────────────────────────────────────────

export function identifyComposition(opts: IdentifyCompositionOptions): IdentifyCompositionResult {
  const tabletId = opts.tabletId.trim();
  const topK = opts.topK ?? 5;
  const wChunk = opts.axisWeights?.chunk_overlap ?? 0.6;
  const wS2v = opts.axisWeights?.sign2vec_centroid ?? 0.4;
  const minConfidence = opts.minConfidence ?? 0;

  const warnings: string[] = [];

  const chunkIndex = loadChunkIndex();
  const chunkLoaded = chunkIndex !== null;
  if (!chunkLoaded) warnings.push("chunk index not loaded; chunk_overlap axis disabled");

  const s2vStats = signEmbeddingStats();
  const s2vLoaded = s2vStats.loaded;
  if (!s2vLoaded) warnings.push("sign embeddings not loaded; sign2vec_centroid axis disabled");

  const querySigns = signsForTablet(tabletId);
  const signsLoaded = querySigns.length > 0;
  if (!signsLoaded) warnings.push(`query tablet "${tabletId}" not found in signs cache or has no usable tokens`);

  const queryChunks = chunkLoaded && signsLoaded ? chunkHashSet(tabletId) : new Set<string>();
  const { centroid: qCentroid, n_embedded: qEmbedded } = s2vLoaded && signsLoaded
    ? signCentroid(querySigns)
    : { centroid: null, n_embedded: 0 };

  const meta = signsLoaded ? getFragmentMetadata(tabletId) : null;
  const period = meta ? getPeriod(meta) : null;
  const primaryGenre = meta ? getPrimaryGenre(meta) : null;

  type Raw = {
    entry: CompositionEntry;
    chunkRaw: number;
    chunkExemplarsHit: number;
    chunkExemplarsConsidered: number;
    topExemplarId: string | null;
    topExemplarShared: number;
    s2vRaw: number | null;
    s2vApplicable: boolean;
    s2vNote: string | null;
    queryInExemplarList: boolean;
  };

  const raws: Raw[] = [];

  for (const entry of COMPOSITION_REGISTRY) {
    const queryInList = entry.exemplar_tablets.includes(tabletId);
    const exemplars = entry.exemplar_tablets.filter((e) => e !== tabletId);

    // Chunk axis
    let topShared = 0;
    let topId: string | null = null;
    let exemplarsHit = 0;
    if (chunkLoaded && signsLoaded) {
      for (const ex of exemplars) {
        const exChunks = chunkHashSet(ex);
        if (exChunks.size === 0) continue;
        let shared = 0;
        for (const h of queryChunks) if (exChunks.has(h)) shared++;
        if (shared > 0) exemplarsHit++;
        if (shared > topShared) {
          topShared = shared;
          topId = ex;
        }
      }
    }

    // Sign2vec axis: build composition centroid from pooled exemplar signs.
    let s2vRaw: number | null = null;
    let s2vApplicable = false;
    let s2vNote: string | null = null;
    if (s2vLoaded && qCentroid && qEmbedded >= MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC) {
      const pooled: string[] = [];
      for (const ex of exemplars) pooled.push(...signsForTablet(ex));
      if (pooled.length === 0) {
        s2vNote = "no exemplar signs available in cache";
      } else {
        const { centroid: cCentroid, n_embedded: cEmbedded } = signCentroid(pooled);
        if (!cCentroid || cEmbedded < MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC) {
          s2vNote = `exemplar pool had only ${cEmbedded} embedded signs (min ${MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC})`;
        } else {
          s2vRaw = cosineUnit(qCentroid, cCentroid);
          s2vApplicable = true;
        }
      }
    } else if (s2vLoaded && qEmbedded < MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC) {
      s2vNote = `query had only ${qEmbedded} embedded signs (min ${MIN_EMBEDDED_SIGNS_FOR_SIGN2VEC})`;
    } else if (!s2vLoaded) {
      s2vNote = "sign embeddings not loaded";
    }

    raws.push({
      entry,
      chunkRaw: topShared,
      chunkExemplarsHit: exemplarsHit,
      chunkExemplarsConsidered: exemplars.length,
      topExemplarId: topId,
      topExemplarShared: topShared,
      s2vRaw,
      s2vApplicable,
      s2vNote,
      queryInExemplarList: queryInList,
    });
  }

  // Normalize. Chunk normalization: max across compositions. Sign2vec: cosine
  // is already in [-1,1] → clamp negatives to 0 + leave as-is (positive
  // semantic alignment is what we care about).
  const maxChunk = raws.reduce((m, r) => Math.max(m, r.chunkRaw), 0);

  const candidates: IdentifyCompositionCandidate[] = raws.map((r) => {
    const chunkNorm = maxChunk > 0 ? r.chunkRaw / maxChunk : 0;
    const chunkApplicable = chunkLoaded && signsLoaded;
    const chunkScore: IdentifyCompositionAxisScore = {
      raw: r.chunkRaw,
      normalized: chunkNorm,
      applicable: chunkApplicable,
      note: chunkApplicable ? null : "chunk index or signs cache not loaded",
    };
    const s2vNorm = r.s2vApplicable && r.s2vRaw !== null ? Math.max(0, r.s2vRaw) : 0;
    const s2vScore: IdentifyCompositionAxisScore = {
      raw: r.s2vRaw ?? 0,
      normalized: s2vNorm,
      applicable: r.s2vApplicable,
      note: r.s2vNote,
    };

    // Joint score: weighted sum of normalized scores from APPLICABLE axes only.
    let wSum = 0;
    let scoreSum = 0;
    if (chunkScore.applicable) {
      wSum += wChunk;
      scoreSum += wChunk * chunkScore.normalized;
    }
    if (s2vScore.applicable) {
      wSum += wS2v;
      scoreSum += wS2v * s2vScore.normalized;
    }
    const confidence = wSum > 0 ? scoreSum / wSum : 0;

    const rationaleParts: string[] = [];
    if (r.queryInExemplarList) rationaleParts.push("query is a known exemplar of this composition");
    if (chunkScore.applicable && r.chunkRaw > 0) {
      rationaleParts.push(`${r.chunkRaw} chunks shared with top exemplar ${r.topExemplarId} (${r.chunkExemplarsHit}/${r.chunkExemplarsConsidered} exemplars hit)`);
    } else if (chunkScore.applicable) {
      rationaleParts.push(`0 chunks shared with any of ${r.chunkExemplarsConsidered} exemplars`);
    }
    if (s2vScore.applicable) {
      rationaleParts.push(`sign-centroid cosine to exemplar pool = ${(r.s2vRaw ?? 0).toFixed(3)}`);
    }
    if (r.entry.composition_type === "curriculum") {
      rationaleParts.push("CURRICULUM tag — high score here is compatible with a specific-composition hit elsewhere");
    }

    return {
      composition_id: r.entry.id,
      composition_name: r.entry.name,
      composition_type: r.entry.composition_type,
      paper_sections: r.entry.paper_sections,
      confidence,
      axis_scores: {
        chunk_overlap: chunkScore,
        sign2vec_centroid: s2vScore,
      },
      evidence: {
        n_exemplars_considered: r.chunkExemplarsConsidered,
        n_exemplars_with_chunks: r.chunkExemplarsHit,
        top_exemplar_id: r.topExemplarId,
        top_exemplar_shared_chunks: r.topExemplarShared,
        query_in_exemplar_list: r.queryInExemplarList,
      },
      rationale: rationaleParts.join("; "),
    };
  });

  // Sort by confidence desc, but break near-ties (< 0.02) by preferring
  // specific_composition over curriculum — a curriculum is a meta-category,
  // never a "more correct" answer than the specific composition that fits
  // equally well.
  candidates.sort((a, b) => {
    const diff = b.confidence - a.confidence;
    if (Math.abs(diff) < 0.02) {
      const aSpec = a.composition_type === "specific_composition" ? 1 : 0;
      const bSpec = b.composition_type === "specific_composition" ? 1 : 0;
      if (aSpec !== bSpec) return bSpec - aSpec;
    }
    return diff;
  });
  const filtered = candidates.filter((c) => c.confidence >= minConfidence).slice(0, topK);

  return {
    query: {
      tablet_id: tabletId,
      sign_count: signsLoaded ? querySigns.length : null,
      period,
      primary_genre: primaryGenre,
    },
    candidates: filtered,
    compositions_considered: COMPOSITION_REGISTRY.length,
    index_stats: {
      chunk_index_loaded: chunkLoaded,
      sign_embeddings_loaded: s2vLoaded,
      signs_cache_loaded: signsLoaded,
      query_signs_with_embedding: qEmbedded,
    },
    warnings,
  };
}
