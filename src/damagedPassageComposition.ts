// v0.36.0 — damaged_passage_composition_probability.
//
// Given a damaged passage (a signs string with X markers OR a tablet_id),
// return a probability distribution over candidate compositions from the
// v0.32 registry. Composes:
//
//   - v0.23 sign2vec embeddings  — query centroid vs each composition's pool
//   - v0.20 chunk-hash index     — exact-chunk overlap when tablet_id given
//   - v0.30 lacuna_semantic      — optional restoration-marginalized centroid:
//                                  for each X, the centroid weights its
//                                  top-K candidate restorations rather than
//                                  dropping the position
//   - v0.32 composition registry — anchored exemplar pools
//
// Two key innovations over v0.32 identify_composition:
//   1. Accepts raw signs string (not just corpus-resident tablet_ids), so
//      hand-transliterated passages are directly classifiable.
//   2. Optional restoration marginalization: damage positions can
//      contribute *partial* centroid mass weighted by lacuna-restorer
//      sign2vec confidence, rather than being silently skipped.
//
// Output reports uncertainty explicitly: lacuna_density,
// restoration_marginalization_applied, composition_entropy (Shannon
// entropy over the normalized probability distribution).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  COMPOSITION_REGISTRY,
  type CompositionEntry,
} from "./compositionRegistry.js";
import { getChunksContaining, loadChunkIndex } from "./chunkIndex.js";
import {
  getSignVector,
  hasSignEmbedding,
  signEmbeddingStats,
} from "./signEmbeddings.js";
import { restoreLacunaSemantic } from "./restoreLacunaSemantic.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

const ALL_SIGNS_FILE = "all-signs-full.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);
const MIN_EMBEDDED_SIGNS = 5;

export type CompositionCandidate = {
  composition_id: string;
  composition_name: string;
  composition_type: "specific_composition" | "curriculum";
  raw_score: number;
  probability: number;
  axis_scores: {
    sign2vec_centroid: { cosine: number; applicable: boolean };
    chunk_overlap: { shared_canonical_chunks: number; canonical_chunks_count: number; ratio: number | null; applicable: boolean };
  };
};

export type DamagedPassageCompositionResult = {
  query: {
    source: "tablet_id" | "signs";
    tablet_id: string | null;
    n_signs_total: number;
    n_signs_visible: number;
    n_signs_damaged: number;
    lacuna_density: number | null;
  };
  candidates: CompositionCandidate[];
  uncertainty: {
    composition_entropy: number;
    restoration_marginalization_applied: boolean;
    restored_positions_used: number;
    n_signs_with_embedding: number;
    max_probability: number;
  };
  index_stats: {
    chunk_index_loaded: boolean;
    sign_embeddings_loaded: boolean;
    signs_cache_loaded: boolean;
  };
  warnings: string[];
};

export type DamagedPassageCompositionOptions = {
  tabletId?: string;
  signs?: string;
  topK?: number;
  marginalizeRestorations?: boolean;
  restorationTopK?: number;
  temperature?: number;
};

// ─── Local signs cache ─────────────────────────────────────────────────────

type CorpusEntry = { tokens: string[]; rawSigns: string };
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
    const records = JSON.parse(readFileSync(path, "utf-8")) as Array<{ _id: string; signs: string }>;
    const out = new Map<string, CorpusEntry>();
    for (const r of records) {
      if (!r._id || typeof r.signs !== "string") continue;
      const tokens = r.signs.split(/\s+/).filter(Boolean);
      if (tokens.length === 0) continue;
      out.set(r._id, { tokens, rawSigns: r.signs });
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

// ─── Centroid helpers ─────────────────────────────────────────────────────

function l2Normalize(v: Float32Array): boolean {
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm);
  if (norm === 0) return false;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
  return true;
}

function plainCentroid(signs: string[]): { centroid: Float32Array | null; n_embedded: number } {
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
  l2Normalize(centroid);
  return { centroid, n_embedded: n };
}

function marginalizedCentroid(
  tokens: string[],
  signsString: string,
  restorationTopK: number,
): { centroid: Float32Array | null; n_embedded: number; restored: number } {
  let centroid: Float32Array | null = null;
  let nEmbedded = 0;
  let restored = 0;

  for (let pos = 0; pos < tokens.length; pos++) {
    const t = tokens[pos];
    if (!DAMAGE_TOKENS.has(t)) {
      if (!hasSignEmbedding(t)) continue;
      const v = getSignVector(t);
      if (!v) continue;
      if (!centroid) centroid = new Float32Array(v.length);
      for (let i = 0; i < v.length; i++) centroid[i] += v[i];
      nEmbedded++;
      continue;
    }
    // Damage position — get top-K restorations.
    const lac = restoreLacunaSemantic({
      signs: signsString,
      lacuna_position: pos,
      top_k: restorationTopK,
      alpha: 0.5,
    });
    if (lac.predictions.length === 0) continue;
    // Use joint_score as weight (sums to ~1 across top-K).
    let wSum = 0;
    for (const p of lac.predictions) wSum += Math.max(0, p.joint_score);
    if (wSum === 0) continue;
    const mix = new Float32Array(centroid?.length ?? 0);
    let mixInit = false;
    let mixWeight = 0;
    for (const p of lac.predictions) {
      if (!hasSignEmbedding(p.sign)) continue;
      const v = getSignVector(p.sign);
      if (!v) continue;
      if (!mixInit) {
        if (!centroid) centroid = new Float32Array(v.length);
        if (mix.length !== v.length) {
          const resized = new Float32Array(v.length);
          mix.set(resized);
        }
        mixInit = true;
      }
      const w = Math.max(0, p.joint_score) / wSum;
      for (let i = 0; i < v.length; i++) mix[i] += w * v[i];
      mixWeight += w;
    }
    if (!mixInit || mixWeight === 0 || !centroid) continue;
    // Add the mixture as a single "fuzzy sign" contribution.
    for (let i = 0; i < centroid.length; i++) centroid[i] += mix[i];
    nEmbedded++;
    restored++;
  }

  if (!centroid || nEmbedded === 0) return { centroid: null, n_embedded: 0, restored: 0 };
  for (let i = 0; i < centroid.length; i++) centroid[i] /= nEmbedded;
  l2Normalize(centroid);
  return { centroid, n_embedded: nEmbedded, restored };
}

function cosineUnit(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}

function softmax(scores: number[], temperature: number): number[] {
  if (scores.length === 0) return [];
  const t = Math.max(0.01, temperature);
  const xs = scores.map((s) => s / t);
  const maxV = Math.max(...xs);
  const exps = xs.map((x) => Math.exp(x - maxV));
  const sum = exps.reduce((a, b) => a + b, 0);
  if (sum === 0) return scores.map(() => 1 / scores.length);
  return exps.map((e) => e / sum);
}

function shannonEntropy(probs: number[]): number {
  let h = 0;
  for (const p of probs) {
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

// ─── Composition-pool signs ───────────────────────────────────────────────

function compositionPoolSigns(entry: CompositionEntry): string[] {
  const corpus = loadSignsCorpus();
  if (!corpus) return [];
  const out: string[] = [];
  for (const ex of entry.exemplar_tablets) {
    const c = corpus.get(ex);
    if (!c) continue;
    for (const t of c.tokens) if (!DAMAGE_TOKENS.has(t)) out.push(t);
  }
  return out;
}

function canonicalChunksFor(entry: CompositionEntry): Set<string> {
  const counts = new Map<string, number>();
  for (const ex of entry.exemplar_tablets) {
    const seen = new Set<string>();
    for (const c of getChunksContaining(ex)) seen.add(c.hash);
    for (const h of seen) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const out = new Set<string>();
  for (const [h, n] of counts) {
    if (n >= 2) out.add(h);
  }
  return out;
}

// ─── Main entry point ─────────────────────────────────────────────────────

export function damagedPassageCompositionProbability(
  opts: DamagedPassageCompositionOptions,
): DamagedPassageCompositionResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const topK = opts.topK ?? COMPOSITION_REGISTRY.length;
  const marginalize = opts.marginalizeRestorations ?? false;
  const restorationTopK = opts.restorationTopK ?? 5;
  const temperature = opts.temperature ?? 0.1;

  const chunkLoaded = loadChunkIndex() !== null;
  const s2vLoaded = signEmbeddingStats().loaded;
  const signsLoaded = loadSignsCorpus() !== null;

  if (!s2vLoaded) warnings.push("sign embeddings not loaded; centroid axis disabled");
  if (!signsLoaded) warnings.push("signs cache not loaded; composition-pool centroids unavailable");

  // Resolve input → tokens + signsString + optional tabletId.
  let tokens: string[] = [];
  let signsString = "";
  let source: "tablet_id" | "signs";
  let tabletIdInput: string | null = null;

  if (opts.tabletId) {
    source = "tablet_id";
    tabletIdInput = opts.tabletId.trim();
    const corpus = loadSignsCorpus();
    if (!corpus) {
      warnings.push("signs cache unavailable; cannot resolve tablet_id");
    } else {
      const entry = corpus.get(tabletIdInput);
      if (!entry) {
        warnings.push(`tablet_id "${tabletIdInput}" not found in signs cache`);
      } else {
        tokens = entry.tokens;
        signsString = entry.rawSigns;
      }
    }
  } else if (opts.signs) {
    source = "signs";
    signsString = opts.signs;
    tokens = signsString.split(/\s+/).filter(Boolean);
  } else {
    source = "signs";
    warnings.push("neither tablet_id nor signs was provided");
  }

  const nTotal = tokens.length;
  const nDamage = tokens.filter((t) => DAMAGE_TOKENS.has(t)).length;
  const nVisible = nTotal - nDamage;
  const lacunaDensity = nTotal > 0 ? nDamage / nTotal : null;

  // Build query centroid.
  let queryCentroid: Float32Array | null = null;
  let nEmbedded = 0;
  let restoredCount = 0;
  if (s2vLoaded && tokens.length > 0) {
    if (marginalize && nDamage > 0) {
      const m = marginalizedCentroid(tokens, signsString, restorationTopK);
      queryCentroid = m.centroid;
      nEmbedded = m.n_embedded;
      restoredCount = m.restored;
    } else {
      const visible = tokens.filter((t) => !DAMAGE_TOKENS.has(t));
      const c = plainCentroid(visible);
      queryCentroid = c.centroid;
      nEmbedded = c.n_embedded;
    }
  }

  // Compute axis scores per composition.
  // Chunk-overlap mirrors v0.32 identify_composition: max shared chunks
  // across exemplars (excluding self if query is a registered exemplar),
  // then normalize across compositions (chunk_norm = chunk_raw / max_raw).
  // Cosine axis: pool centroid built from exemplar signs, query is filtered
  // from the pool if it appears there.
  type Raw = {
    entry: CompositionEntry;
    cosine: number;
    cosineApplicable: boolean;
    chunkRaw: number;
    topExemplar: string | null;
    chunkApplicable: boolean;
  };
  const raws: Raw[] = [];

  const queryChunks = tabletIdInput && chunkLoaded
    ? new Set(getChunksContaining(tabletIdInput).map((c) => c.hash))
    : new Set<string>();

  for (const entry of COMPOSITION_REGISTRY) {
    // Self-filter: if the query tablet is a registered exemplar of this
    // composition, exclude it from the pool used for both axes.
    const exemplars = tabletIdInput
      ? entry.exemplar_tablets.filter((e) => e !== tabletIdInput)
      : entry.exemplar_tablets.slice();

    // sign2vec axis: pool from non-self exemplars only.
    let cosine = 0;
    let cosineApplicable = false;
    if (queryCentroid && s2vLoaded && signsLoaded && nEmbedded >= MIN_EMBEDDED_SIGNS) {
      const corpus = loadSignsCorpus();
      const poolSigns: string[] = [];
      if (corpus) {
        for (const ex of exemplars) {
          const c = corpus.get(ex);
          if (!c) continue;
          for (const t of c.tokens) if (!DAMAGE_TOKENS.has(t)) poolSigns.push(t);
        }
      }
      const { centroid: poolCentroid, n_embedded: poolEmbedded } = plainCentroid(poolSigns);
      if (poolCentroid && poolEmbedded >= MIN_EMBEDDED_SIGNS) {
        cosine = cosineUnit(queryCentroid, poolCentroid);
        cosineApplicable = true;
      }
    }

    // chunk axis: max shared chunks across non-self exemplars.
    let topShared = 0;
    let topExemplar: string | null = null;
    let chunkApplicable = false;
    if (chunkLoaded && queryChunks.size > 0) {
      for (const ex of exemplars) {
        const exChunks = new Set(getChunksContaining(ex).map((c) => c.hash));
        if (exChunks.size === 0) continue;
        let shared = 0;
        for (const h of queryChunks) if (exChunks.has(h)) shared++;
        if (shared > topShared) {
          topShared = shared;
          topExemplar = ex;
        }
      }
      chunkApplicable = exemplars.length > 0;
    }

    raws.push({
      entry,
      cosine,
      cosineApplicable,
      chunkRaw: topShared,
      topExemplar,
      chunkApplicable,
    });
  }

  // Normalize chunk_raw across compositions (matching v0.32).
  const maxChunkRaw = raws.reduce((m, r) => Math.max(m, r.chunkRaw), 0);

  // Joint score per composition: chunk normalized over compositions (v0.32
  // pattern), cosine clamped at 0. Weights chunk=0.6, cosine=0.4 mirror v0.32.
  const wCos = 0.4;
  const wChunk = 0.6;
  const rawScores: number[] = [];
  const candidates: CompositionCandidate[] = raws.map((r) => {
    const cosNorm = r.cosineApplicable ? Math.max(0, r.cosine) : 0;
    const chunkNorm = r.chunkApplicable && maxChunkRaw > 0 ? r.chunkRaw / maxChunkRaw : 0;

    let wSum = 0;
    let sum = 0;
    if (r.cosineApplicable) {
      wSum += wCos;
      sum += wCos * cosNorm;
    }
    if (r.chunkApplicable) {
      wSum += wChunk;
      sum += wChunk * chunkNorm;
    }
    const rawScore = wSum > 0 ? sum / wSum : 0;
    rawScores.push(rawScore);

    // Surface the canonical-chunks count for diagnostic continuity with v0.34
    // score_tablet_completeness consumers.
    const canon = r.chunkApplicable ? canonicalChunksFor(r.entry) : new Set<string>();

    return {
      composition_id: r.entry.id,
      composition_name: r.entry.name,
      composition_type: r.entry.composition_type,
      raw_score: rawScore,
      probability: 0, // filled in below
      axis_scores: {
        sign2vec_centroid: { cosine: r.cosine, applicable: r.cosineApplicable },
        chunk_overlap: {
          shared_canonical_chunks: r.chunkRaw,
          canonical_chunks_count: canon.size,
          ratio: r.chunkApplicable && canon.size > 0 ? r.chunkRaw / canon.size : null,
          applicable: r.chunkApplicable,
        },
      },
    };
  });

  const probabilities = softmax(rawScores, temperature);
  for (let i = 0; i < candidates.length; i++) candidates[i].probability = probabilities[i];

  // Sort descending by probability, with curriculum tie-break (specific > curriculum)
  // matching v0.32 identify_composition.
  candidates.sort((a, b) => {
    const diff = b.probability - a.probability;
    if (Math.abs(diff) < 0.02) {
      const aSpec = a.composition_type === "specific_composition" ? 1 : 0;
      const bSpec = b.composition_type === "specific_composition" ? 1 : 0;
      if (aSpec !== bSpec) return bSpec - aSpec;
    }
    return diff;
  });

  const limited = candidates.slice(0, topK);
  const entropy = shannonEntropy(candidates.map((c) => c.probability));
  const maxProb = candidates.length > 0 ? Math.max(...candidates.map((c) => c.probability)) : 0;

  return {
    query: {
      source,
      tablet_id: tabletIdInput,
      n_signs_total: nTotal,
      n_signs_visible: nVisible,
      n_signs_damaged: nDamage,
      lacuna_density: lacunaDensity,
    },
    candidates: limited,
    uncertainty: {
      composition_entropy: entropy,
      restoration_marginalization_applied: marginalize && nDamage > 0,
      restored_positions_used: restoredCount,
      n_signs_with_embedding: nEmbedded,
      max_probability: maxProb,
    },
    index_stats: {
      chunk_index_loaded: chunkLoaded,
      sign_embeddings_loaded: s2vLoaded,
      signs_cache_loaded: signsLoaded,
    },
    warnings,
  };
}
