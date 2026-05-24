// v0.25.0 — compare_sign_embedding_configs: multi-config sign2vec query.
//
// For a single query sign, return the top-K nearest neighbors from each of
// the six (WINDOW, MIN_OCC) configurations in the v0.25 ensemble, plus
// stability metadata: which neighbors are consensus across configs (the
// embedding is robust) vs. unique to a single config (the embedding does
// produce distinguishable results — the configs aren't redundant).
//
// Companion to v0.23's findSimilarSigns (single canonical config). This
// tool is additive: it does NOT replace findSimilarSigns and does NOT
// touch the v0.23 cache (~/.cache/cuneiform-mcp/sign-embeddings.json).
//
// Wraps the StructuredEnvelope schema at
// schemas/compare_sign_embedding_configs.schema.json.

import {
  DEFAULT_ENSEMBLE_GRID,
  ensembleConfigStats,
  ensembleHasSign,
  ensembleRankNeighbors,
  type EnsembleConfigKey,
  type EnsembleSignNeighbor,
} from "./signEmbeddingsEnsemble.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type ConfigNeighborhood = {
  window: number;
  min_occ: number;
  loaded: boolean;
  query_in_corpus: boolean;
  neighbors: EnsembleSignNeighbor[];
};

export type EnsembleStability = {
  /**
   * Sign codes that appear in the top-K of EVERY loaded config (the consensus
   * set). A non-empty consensus is the headline "robust to hyperparameter
   * choice" signal.
   */
  consensus_top5_signs: string[];
  /**
   * Per-config count of top-K neighbors that don't appear in any other
   * loaded config's top-K. A non-zero value somewhere is the headline
   * "configs produce distinguishable results" signal.
   *
   * Ordered to match `configs[]`.
   */
  unique_to_each_config: number[];
};

export type CompareSignEmbeddingConfigsResult = {
  query_sign: string;
  configs: ConfigNeighborhood[];
  stability: EnsembleStability;
  warnings: string[];
};

export type CompareSignEmbeddingConfigsOptions = {
  sign: string;
  /** Default 5, cap 50 (matches the methods-paper §3.12 top-5 reporting). */
  top_k?: number;
  /**
   * Override the default ensemble grid. Defaults to
   * DEFAULT_ENSEMBLE_GRID = {2,5,10} × {10,20} = 6 configs.
   */
  grid?: ReadonlyArray<EnsembleConfigKey>;
};

// ─── Implementation ────────────────────────────────────────────────────────

export function compareSignEmbeddingConfigs(
  opts: CompareSignEmbeddingConfigsOptions,
): CompareSignEmbeddingConfigsResult {
  const warnings: string[] = [];

  if (typeof opts.sign !== "string" || opts.sign.trim() === "") {
    return {
      query_sign: opts.sign ?? "",
      configs: [],
      stability: { consensus_top5_signs: [], unique_to_each_config: [] },
      warnings: ["`sign` must be a non-empty string"],
    };
  }

  const querySign = opts.sign.trim();
  const topK = Math.max(1, Math.min(50, opts.top_k ?? 5));
  const grid = opts.grid ?? DEFAULT_ENSEMBLE_GRID;

  // Per-config probe.
  const configs: ConfigNeighborhood[] = [];
  for (const key of grid) {
    const stats = ensembleConfigStats(key);
    if (!stats.loaded) {
      warnings.push(
        `config window=${key.window} min_occ=${key.min_occ} not loaded: ${stats.load_error ?? "unknown error"}`,
      );
      configs.push({
        window: key.window,
        min_occ: key.min_occ,
        loaded: false,
        query_in_corpus: false,
        neighbors: [],
      });
      continue;
    }

    const inCorpus = ensembleHasSign(key, querySign);
    if (!inCorpus) {
      warnings.push(
        `sign '${querySign}' is not in the vocab for config window=${key.window} min_occ=${key.min_occ} (must occur ≥ ${key.min_occ} times in the corpus).`,
      );
      configs.push({
        window: key.window,
        min_occ: key.min_occ,
        loaded: true,
        query_in_corpus: false,
        neighbors: [],
      });
      continue;
    }

    const ranked = ensembleRankNeighbors(key, querySign, topK, 0);
    configs.push({
      window: key.window,
      min_occ: key.min_occ,
      loaded: true,
      query_in_corpus: true,
      neighbors: ranked ?? [],
    });
  }

  // Stability analysis: only configs where query is in corpus contribute.
  const stability = computeStability(configs);

  return {
    query_sign: querySign,
    configs,
    stability,
    warnings,
  };
}

function computeStability(configs: ConfigNeighborhood[]): EnsembleStability {
  const usable = configs.filter((c) => c.loaded && c.query_in_corpus);
  if (usable.length === 0) {
    return {
      consensus_top5_signs: [],
      unique_to_each_config: configs.map(() => 0),
    };
  }

  // Consensus: signs present in EVERY usable config's top-K.
  const perConfigSets = usable.map((c) => new Set(c.neighbors.map((n) => n.sign)));
  const intersection = new Set<string>(perConfigSets[0]);
  for (let i = 1; i < perConfigSets.length; i++) {
    for (const s of intersection) {
      if (!perConfigSets[i].has(s)) intersection.delete(s);
    }
  }
  // Order the consensus set by mean cosine across configs (highest first) so
  // the most consistently-strong signs lead the list.
  const consensusList = [...intersection];
  consensusList.sort((a, b) => meanCos(usable, b) - meanCos(usable, a));

  // Per-config uniqueness: how many of this config's top-K don't appear in
  // ANY other config's top-K. Ordered to match the input `configs[]`, with
  // unloaded / no-query slots reporting 0.
  const unique_to_each_config: number[] = configs.map((c) => {
    if (!c.loaded || !c.query_in_corpus) return 0;
    const others = configs.filter(
      (d) =>
        d !== c &&
        d.loaded &&
        d.query_in_corpus &&
        !(d.window === c.window && d.min_occ === c.min_occ),
    );
    const otherSigns = new Set<string>();
    for (const d of others) for (const n of d.neighbors) otherSigns.add(n.sign);
    let count = 0;
    for (const n of c.neighbors) if (!otherSigns.has(n.sign)) count++;
    return count;
  });

  return {
    consensus_top5_signs: consensusList,
    unique_to_each_config,
  };
}

function meanCos(configs: ConfigNeighborhood[], sign: string): number {
  let sum = 0;
  let n = 0;
  for (const c of configs) {
    const hit = c.neighbors.find((x) => x.sign === sign);
    if (hit) {
      sum += hit.cosine;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}
