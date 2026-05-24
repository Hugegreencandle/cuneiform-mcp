// v0.23.0 — find_similar_signs: query tool for sign-level semantic embeddings.
//
// Given a query sign code (e.g. "ABZ001"), return the top-K signs whose
// distributional context vectors are closest in cosine. Built on the sign2vec
// embedding index (signEmbeddings.ts ← scripts/build-sign-embeddings.mjs).
//
// Why this exists: the v0.15 tablet embeddings answer "which COMPOSITIONS
// look thematically similar?" but cannot answer "which SIGNS mean the same
// thing?" Sign-level distributional equivalence is the natural primitive
// for spotting logogram substitutions, period-specific sign equivalences,
// and phonetic/semantic clusters — a previously unexposed analytical axis
// in computational Assyriology.
//
// Wraps the StructuredEnvelope schema at schemas/find_similar_signs.schema.json.

import {
  hasSignEmbedding,
  rankSignNeighbors,
  signEmbeddingStats,
  type SignNeighbor,
} from "./signEmbeddings.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type SimilarSign = {
  sign: string;
  cosine: number;
  occurrences: number;
};

export type FindSimilarSignsResult = {
  query_sign: string;
  query_in_corpus: boolean;
  neighbors: SimilarSign[];
  index_stats: {
    total_signs_indexed: number;
    embedding_dim: number;
    window_size: number;
    build_timestamp: string;
  };
  warnings: string[];
};

export type FindSimilarSignsOptions = {
  sign: string;
  /** Default 10, cap 50. */
  topK?: number;
  /** Default 0.0 — no floor. */
  minCosine?: number;
};

// ─── Implementation ────────────────────────────────────────────────────────

export function findSimilarSigns(opts: FindSimilarSignsOptions): FindSimilarSignsResult {
  const warnings: string[] = [];

  if (typeof opts.sign !== "string" || opts.sign.trim() === "") {
    return {
      query_sign: opts.sign ?? "",
      query_in_corpus: false,
      neighbors: [],
      index_stats: {
        total_signs_indexed: 0,
        embedding_dim: 0,
        window_size: 0,
        build_timestamp: "",
      },
      warnings: ["`sign` must be a non-empty string"],
    };
  }

  const querySign = opts.sign.trim();
  const topK = Math.max(1, Math.min(50, opts.topK ?? 10));
  const minCosine = typeof opts.minCosine === "number" ? opts.minCosine : 0;

  const stats = signEmbeddingStats();
  if (!stats.loaded) {
    return {
      query_sign: querySign,
      query_in_corpus: false,
      neighbors: [],
      index_stats: {
        total_signs_indexed: 0,
        embedding_dim: 0,
        window_size: 0,
        build_timestamp: "",
      },
      warnings: [
        stats.load_error ?? "sign embeddings index unavailable",
      ],
    };
  }

  const inCorpus = hasSignEmbedding(querySign);
  if (!inCorpus) {
    warnings.push(
      `sign '${querySign}' is not in the sign2vec vocabulary (must occur ≥ ${stats.min_occurrences} times in the corpus).`,
    );
    return {
      query_sign: querySign,
      query_in_corpus: false,
      neighbors: [],
      index_stats: {
        total_signs_indexed: stats.total_signs_indexed,
        embedding_dim: stats.embedding_dim,
        window_size: stats.window_size,
        build_timestamp: stats.build_timestamp ?? "",
      },
      warnings,
    };
  }

  const ranked = rankSignNeighbors(querySign, topK, minCosine);
  // ranked === null is unreachable here: we just verified hasSignEmbedding +
  // loaded; defend against it anyway.
  const neighbors: SimilarSign[] =
    ranked === null
      ? []
      : ranked.map(
          (n: SignNeighbor): SimilarSign => ({
            sign: n.sign,
            cosine: n.cosine,
            occurrences: n.occurrences,
          }),
        );

  if (ranked !== null && ranked.length === 0 && minCosine > 0) {
    warnings.push(
      `no neighbors above minCosine=${minCosine} for '${querySign}'. Try lowering the floor.`,
    );
  }

  return {
    query_sign: querySign,
    query_in_corpus: true,
    neighbors,
    index_stats: {
      total_signs_indexed: stats.total_signs_indexed,
      embedding_dim: stats.embedding_dim,
      window_size: stats.window_size,
      build_timestamp: stats.build_timestamp ?? "",
    },
    warnings,
  };
}
