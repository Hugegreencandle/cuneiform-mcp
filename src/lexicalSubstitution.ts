// v0.24.0 — compute_lexical_substitution_score: sign2vec axis cash-out.
//
// Methods-paper §3.12 claim 30 stated:
//   "aggregating sign-cosine into a tablet-level lexical-substitution score
//    would produce a complement to the existing lexical/fuzzy/thematic axes."
//
// v0.24 builds that aggregation. The motivating intuition: two tablets A and
// B may NOT share many exact sign tokens (low lexical/fuzzy Jaccard) but their
// signs might be DISTRIBUTIONALLY EQUIVALENT — for each sign in A that does
// not appear in B, ask sign2vec "what are the near-neighbors of this sign?"
// and check whether any of those neighbors appear in B's vocabulary. That is
// the lexical-substitution axis: same MEANING space, different SIGN TOKENS.
//
// Score:
//   exact_overlap        = |A_vocab ∩ B_vocab|
//   substitution_matches = #{ s ∈ A_vocab \ B_vocab :
//                              ∃ s' ∈ top-K sign2vec neighbors of s
//                              with cosine ≥ min_neighbor_cosine
//                              such that s' ∈ B_vocab }
//   score = (exact_overlap + substitution_matches) / max(|A_vocab|, |B_vocab|)
//
// max() in the denominator (rather than |A| + |B| − overlap) matches the v0.22
// stemma-distance design choice: it does not over-penalize asymmetric size
// mismatches and directly answers "what fraction of the smaller vocabulary
// is represented (exactly or distributionally) in the larger?"
//
// Vocabulary source: the in-process corpus already loaded by fuzzyParallels.ts
// (trigrams_ordered). We extract the set of distinct non-X tokens that appear
// in each tablet's trigrams_ordered stream. This reuses the existing in-process
// indexes (no double-load of the 36K-tablet signs file).
//
// Companion to v0.23 sign2vec (per-sign embeddings) and v0.18.8 compareTabletPair
// (4-axis verdict). The optional axis_comparison block delegates to the 4-axis
// evaluator so callers can read this tool as a "5-axis view" of a tablet pair.

import { getCorpusAndIndexes, getFuzzyLoadError } from "./fuzzyParallels.js";
import {
  hasSignEmbedding,
  rankSignNeighbors,
  signEmbeddingStats,
  getSignEmbeddingLoadError,
} from "./signEmbeddings.js";
import { compareTabletPair } from "./comparePair.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type SubstitutionPair = {
  /** Sign in A_vocab \ B_vocab whose sign2vec neighbor appears in B_vocab. */
  a_sign: string;
  /** The neighbor (in B_vocab) that triggered the match. */
  b_sign: string;
  /** Cosine similarity between a_sign and b_sign in the sign2vec space. */
  cosine: number;
};

export type LexicalSubstitutionAxisComparison = {
  /** Exact trigram-Jaccard, from compareTabletPair fuzzy axis. */
  lexical_jaccard?: number;
  /** Fuzzy 1-substitution Jaccard, from compareTabletPair fuzzy axis. */
  fuzzy_jaccard?: number;
  /** Random-indexing thematic cosine, from compareTabletPair thematic axis. */
  thematic_cosine?: number;
  /** LLR-signature cosine, from compareTabletPair scribal axis. */
  scribal_cosine?: number;
  /** When compareTabletPair surfaces axis-level "below_threshold" or missing data. */
  notes: string[];
};

export type LexicalSubstitutionResult = {
  tablet_a: string;
  tablet_b: string;
  tablet_a_vocab_size: number;
  tablet_b_vocab_size: number;
  /** |A_vocab ∩ B_vocab| — distinct signs present in both. */
  exact_overlap: number;
  /**
   * Number of signs s ∈ A_vocab \ B_vocab for which at least one top-K sign2vec
   * neighbor of s (cosine ≥ min_neighbor_cosine) is in B_vocab.
   */
  substitution_matches: number;
  /** Up to `pair_sample_cap` representative substitution pairs, ranked by cosine desc. */
  substitution_pairs: SubstitutionPair[];
  /**
   * Primary output: (exact_overlap + substitution_matches) / max(|A_vocab|, |B_vocab|).
   * Bounded in [0, 1]. 1.0 iff the smaller vocab is fully represented (exactly
   * or via substitution) in the larger.
   */
  lexical_substitution_score: number;
  score_breakdown: {
    /** exact_overlap / max(|A_vocab|, |B_vocab|). */
    exact_share: number;
    /** substitution_matches / max(|A_vocab|, |B_vocab|). */
    substitution_share: number;
    /** exact_share + substitution_share = lexical_substitution_score. */
    combined: number;
  };
  /**
   * Optional 4-axis context (lexical / fuzzy / thematic / scribal Jaccard +
   * cosines), if include_axis_comparison was true. Otherwise empty struct
   * with explanatory notes.
   */
  axis_comparison: LexicalSubstitutionAxisComparison;
  index_stats: {
    sign_embeddings_loaded: boolean;
    sign_embeddings_total_indexed: number;
    sign_embeddings_dim: number;
    sign_embeddings_window: number;
    corpus_tablets: number;
    /** How many A_vocab signs were skipped because they have no sign2vec embedding. */
    a_signs_without_embedding: number;
    /** How many A_vocab \ B_vocab signs actually had ≥1 neighbor queried. */
    a_signs_probed: number;
    /** Effective top_k_neighbors after clamping. */
    top_k_neighbors: number;
    /** Effective min_neighbor_cosine. */
    min_neighbor_cosine: number;
  };
  warnings: string[];
};

export type LexicalSubstitutionOptions = {
  tabletA: string;
  tabletB: string;
  /** Top-K sign2vec neighbors to consider per A-vocab-only sign. Default 5, capped at 50. */
  topKNeighbors?: number;
  /** Cosine floor for sign2vec neighbors. Default 0.4. */
  minNeighborCosine?: number;
  /**
   * Include the 4-axis comparePair context. Default false — runs a full
   * cross-axis query (fuzzy/thematic/scribal) which is more expensive than
   * the substitution score itself.
   */
  includeAxisComparison?: boolean;
  /** Cap on substitution_pairs sample size. Default 20. */
  pairSampleCap?: number;
};

// ─── Vocabulary extraction ──────────────────────────────────────────────────

/**
 * Derive the distinct-sign vocabulary of a tablet from its trigrams_ordered
 * stream (already X-filtered at 2-of-3 — any remaining "X" tokens are dropped
 * here too). Returns an empty Set if the tablet has no trigrams.
 */
function tabletVocab(trigramsOrdered: string[]): Set<string> {
  const vocab = new Set<string>();
  for (const tri of trigramsOrdered) {
    // tri is "a b c" — split and add each non-X token.
    const parts = tri.split(" ");
    for (const p of parts) {
      if (p && p !== "X") vocab.add(p);
    }
  }
  return vocab;
}

// ─── Public API ────────────────────────────────────────────────────────────

export function computeLexicalSubstitutionScore(
  opts: LexicalSubstitutionOptions,
): LexicalSubstitutionResult {
  const warnings: string[] = [];
  const a = opts.tabletA.trim();
  const b = opts.tabletB.trim();
  const topK = Math.max(1, Math.min(50, opts.topKNeighbors ?? 5));
  const minCos =
    typeof opts.minNeighborCosine === "number" ? opts.minNeighborCosine : 0.4;
  const includeAxes = opts.includeAxisComparison ?? false;
  const pairCap = Math.max(0, Math.min(200, opts.pairSampleCap ?? 20));

  // ─── Load corpus + sign2vec ───────────────────────────────────────────
  const cx = getCorpusAndIndexes();
  const sigStats = signEmbeddingStats();

  const emptyAxes: LexicalSubstitutionAxisComparison = { notes: [] };
  const emptyStats = {
    sign_embeddings_loaded: sigStats.loaded,
    sign_embeddings_total_indexed: sigStats.total_signs_indexed,
    sign_embeddings_dim: sigStats.embedding_dim,
    sign_embeddings_window: sigStats.window_size,
    corpus_tablets: cx?.corpus.size ?? 0,
    a_signs_without_embedding: 0,
    a_signs_probed: 0,
    top_k_neighbors: topK,
    min_neighbor_cosine: minCos,
  };

  if (!cx) {
    return {
      tablet_a: a,
      tablet_b: b,
      tablet_a_vocab_size: 0,
      tablet_b_vocab_size: 0,
      exact_overlap: 0,
      substitution_matches: 0,
      substitution_pairs: [],
      lexical_substitution_score: 0,
      score_breakdown: { exact_share: 0, substitution_share: 0, combined: 0 },
      axis_comparison: emptyAxes,
      index_stats: emptyStats,
      warnings: [getFuzzyLoadError() ?? "fuzzy/trigram corpus unavailable"],
    };
  }

  if (!sigStats.loaded) {
    warnings.push(
      getSignEmbeddingLoadError() ??
        "sign2vec embeddings unavailable — substitution_matches will be 0",
    );
  }

  const entryA = cx.corpus.get(a);
  const entryB = cx.corpus.get(b);
  if (!entryA) warnings.push(`tablet '${a}' not in corpus`);
  if (!entryB) warnings.push(`tablet '${b}' not in corpus`);
  if (!entryA || !entryB) {
    return {
      tablet_a: a,
      tablet_b: b,
      tablet_a_vocab_size: 0,
      tablet_b_vocab_size: 0,
      exact_overlap: 0,
      substitution_matches: 0,
      substitution_pairs: [],
      lexical_substitution_score: 0,
      score_breakdown: { exact_share: 0, substitution_share: 0, combined: 0 },
      axis_comparison: emptyAxes,
      index_stats: emptyStats,
      warnings,
    };
  }

  // ─── Extract vocabularies ─────────────────────────────────────────────
  const vocabA = tabletVocab(entryA.trigrams_ordered);
  const vocabB = tabletVocab(entryB.trigrams_ordered);
  const sizeA = vocabA.size;
  const sizeB = vocabB.size;
  const denom = Math.max(sizeA, sizeB);

  if (denom === 0) {
    warnings.push("both vocabularies are empty after X-filtering");
    return {
      tablet_a: a,
      tablet_b: b,
      tablet_a_vocab_size: 0,
      tablet_b_vocab_size: 0,
      exact_overlap: 0,
      substitution_matches: 0,
      substitution_pairs: [],
      lexical_substitution_score: 0,
      score_breakdown: { exact_share: 0, substitution_share: 0, combined: 0 },
      axis_comparison: includeAxes
        ? buildAxisComparison(a, b, warnings)
        : emptyAxes,
      index_stats: { ...emptyStats, corpus_tablets: cx.corpus.size },
      warnings,
    };
  }

  // ─── Exact overlap ────────────────────────────────────────────────────
  let exactOverlap = 0;
  for (const s of vocabA) {
    if (vocabB.has(s)) exactOverlap++;
  }

  // ─── Substitution probe ───────────────────────────────────────────────
  let substitutionMatches = 0;
  let aWithoutEmbedding = 0;
  let aProbed = 0;
  const pairs: SubstitutionPair[] = [];

  for (const sA of vocabA) {
    if (vocabB.has(sA)) continue; // exact match already counted
    if (!sigStats.loaded) continue;
    if (!hasSignEmbedding(sA)) {
      aWithoutEmbedding++;
      continue;
    }
    aProbed++;
    const ranked = rankSignNeighbors(sA, topK, minCos);
    if (!ranked || ranked.length === 0) continue;

    // First neighbor in B_vocab counts the match; collect ALL B-vocab
    // neighbors for the substitution_pairs sample (ranked by cosine desc).
    let matched = false;
    for (const n of ranked) {
      if (vocabB.has(n.sign)) {
        if (!matched) {
          substitutionMatches++;
          matched = true;
        }
        pairs.push({ a_sign: sA, b_sign: n.sign, cosine: n.cosine });
      }
    }
  }

  // Rank pairs by cosine desc, then truncate to the sample cap.
  pairs.sort((x, y) => y.cosine - x.cosine);
  const pairsSample = pairs.slice(0, pairCap);

  // ─── Score ────────────────────────────────────────────────────────────
  const exactShare = exactOverlap / denom;
  const substitutionShare = substitutionMatches / denom;
  const combined = exactShare + substitutionShare;

  // ─── Axis comparison (optional) ───────────────────────────────────────
  const axisComparison: LexicalSubstitutionAxisComparison = includeAxes
    ? buildAxisComparison(a, b, warnings)
    : { notes: ["axis_comparison skipped — pass includeAxisComparison=true to run the 4-axis evaluator"] };

  // Self-pair sanity: a vs a → vocab is identical → score 1.0.
  if (a === b) {
    warnings.push("tabletA == tabletB: self-pair returns 1.0 by construction");
  }

  return {
    tablet_a: a,
    tablet_b: b,
    tablet_a_vocab_size: sizeA,
    tablet_b_vocab_size: sizeB,
    exact_overlap: exactOverlap,
    substitution_matches: substitutionMatches,
    substitution_pairs: pairsSample,
    lexical_substitution_score: +combined.toFixed(4),
    score_breakdown: {
      exact_share: +exactShare.toFixed(4),
      substitution_share: +substitutionShare.toFixed(4),
      combined: +combined.toFixed(4),
    },
    axis_comparison: axisComparison,
    index_stats: {
      sign_embeddings_loaded: sigStats.loaded,
      sign_embeddings_total_indexed: sigStats.total_signs_indexed,
      sign_embeddings_dim: sigStats.embedding_dim,
      sign_embeddings_window: sigStats.window_size,
      corpus_tablets: cx.corpus.size,
      a_signs_without_embedding: aWithoutEmbedding,
      a_signs_probed: aProbed,
      top_k_neighbors: topK,
      min_neighbor_cosine: minCos,
    },
    warnings,
  };
}

// ─── Axis-comparison helper ─────────────────────────────────────────────────

function buildAxisComparison(
  a: string,
  b: string,
  warnings: string[],
): LexicalSubstitutionAxisComparison {
  const notes: string[] = [];
  const result: LexicalSubstitutionAxisComparison = { notes };
  try {
    const cmp = compareTabletPair({ tabletA: a, tabletB: b });
    // Lexical
    if (cmp.axes.lexical.status === "found") {
      const v = cmp.axes.lexical.values;
      if (typeof v.exact_jaccard === "number") result.lexical_jaccard = v.exact_jaccard;
    } else if (cmp.axes.lexical.status === "below_threshold") {
      notes.push(`lexical axis below threshold: ${cmp.axes.lexical.threshold_note}`);
    } else if (cmp.axes.lexical.status === "tablet_not_in_index") {
      notes.push(`lexical axis: tablet(s) missing from index: ${cmp.axes.lexical.missing_tablets.join(", ")}`);
    }
    // Fuzzy
    if (cmp.axes.fuzzy.status === "found") {
      const v = cmp.axes.fuzzy.values;
      if (typeof v.fuzzy_jaccard === "number") result.fuzzy_jaccard = v.fuzzy_jaccard;
    } else if (cmp.axes.fuzzy.status === "below_threshold") {
      notes.push(`fuzzy axis below threshold`);
    }
    // Thematic
    if (cmp.axes.thematic.status === "found") {
      const v = cmp.axes.thematic.values;
      if (typeof v.thematic_cosine === "number") result.thematic_cosine = v.thematic_cosine;
    } else if (cmp.axes.thematic.status === "below_threshold") {
      notes.push(`thematic axis below threshold`);
    }
    // Scribal
    if (cmp.axes.scribal.status === "found") {
      const v = cmp.axes.scribal.values;
      if (typeof v.signature_cosine === "number") result.scribal_cosine = v.signature_cosine;
    } else if (cmp.axes.scribal.status === "below_threshold") {
      notes.push(`scribal axis below threshold`);
    }
    if (cmp.warnings.length > 0) {
      for (const w of cmp.warnings) notes.push(`axis_comparison: ${w}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    notes.push(`axis_comparison failed: ${msg}`);
    warnings.push(`axis_comparison failed: ${msg}`);
  }
  return result;
}
