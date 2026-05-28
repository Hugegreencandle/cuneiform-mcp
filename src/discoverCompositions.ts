// v0.69.0 — discover_compositions.
//
// Unsupervised cluster discovery over the v0.15 tablet-level Random
// Indexing embeddings (~28K tablets × 300-dim, unit-normalized). The
// methodological point: every OTHER tool in cuneiform-mcp that surfaces
// composition-level structure uses genre labels or exemplar registries
// as a prior (identify_composition, find_tablets_by_genre, etc.). This
// one explicitly avoids them and asks the question:
//
//     "What does clustering produce if you let the embedding space
//      speak for itself? Do the registered compositions fall out
//      naturally, and do additional clusters appear that DON'T match
//      anything in the registry?"
//
// Method (full pipeline):
//   1. Load tablet-vectors.f32 + tablet-embed-index.json + fragment
//      metadata cache.
//   2. Subsample to max_tablets (default 5000). Subsampling is
//      DETERMINISTIC via mulberry32 — re-runs at the same max_tablets
//      see the same tablet set.
//   3. Run the selected clustering algorithm.
//   4. Build a centroid per registered composition from its
//      exemplar_tablets list (skip the registered composition if none
//      of its exemplars have an embedding — happens for very short
//      exemplars below v0.15's MIN_TABLET_SIGNS=20).
//   5. For each emergent cluster: compute novelty = 1 − max cosine
//      similarity to any registered-composition centroid. Clusters
//      above novelty_threshold are surfaced as candidate new
//      compositions.
//   6. Tag every candidate with metadata-dominant heuristic labels
//      (dominant period, dominant find-spot, dominant genre) so the
//      operator can scan them without inspecting every member.
//   7. Write outputs: JSON dump + Markdown summary at
//      ~/.cache/cuneiform-mcp/composition-discovery/<iso-ts>/.
//
// Honest reporting contract: the summary doc explicitly distinguishes
// "candidate finding" (high-confidence, metadata-coherent cluster
// nowhere near a registered composition) from "clustering artifact"
// (small clusters, sign-count outliers, metadata-incoherent). The
// summary's "next steps" section recommends investigate-vs-tune.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import {
  runKMeans,
  runHierarchicalWard,
  runDbscanLike,
  silhouetteSubsample,
  cosineUnit,
  l2NormalizeInPlace,
  mulberry32,
  DEFAULT_SEED,
  type ClusteringResult,
} from "./clusteringAlgorithms.js";
import { COMPOSITION_REGISTRY, type CompositionEntry } from "./compositionRegistry.js";
import { getFragmentMetadata } from "./fragmentMetadata.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type DiscoverCompositionsAlgorithm =
  | "kmeans"
  | "hierarchical_ward"
  | "dbscan_like";

export type DiscoverCompositionsOptions = {
  min_cluster_size?: number;
  novelty_threshold?: number;
  algorithm?: DiscoverCompositionsAlgorithm;
  k?: number;
  max_tablets?: number;
};

export type RegisteredCompositionRecovery = {
  composition_id: string;
  composition_name: string;
  matched_cluster_id: string | null;
  max_cosine_to_cluster_centroid: number;
  exemplar_count: number;
  exemplars_with_embeddings: number;
};

export type CandidateNewComposition = {
  cluster_id: string;
  tablet_count: number;
  representative_tablets: string[];
  centroid_thematic_neighbors: string[];
  nearest_registered_composition: {
    id: string;
    cosine_distance: number;
  };
  novelty_score: number;
  suggested_label: string;
  dominant_metadata: {
    period: { value: string; share: number } | null;
    city: { value: string; share: number } | null;
    genre: { value: string; share: number } | null;
  };
};

export type DiscoverCompositionsResult = {
  algorithm_used: DiscoverCompositionsAlgorithm;
  clusters_found: number;
  registered_compositions_recovered: number;
  candidate_new_compositions: CandidateNewComposition[];
  registered_recovery_detail: RegisteredCompositionRecovery[];
  metrics: {
    silhouette_score: number;
    total_tablets_clustered: number;
    tablets_in_candidate_new_compositions: number;
    embedding_dim: number;
    iterations: number;
    converged: boolean;
  };
  parameters: {
    min_cluster_size: number;
    novelty_threshold: number;
    algorithm: DiscoverCompositionsAlgorithm;
    k: number;
    max_tablets: number;
    seed: number;
  };
  output_paths: {
    json: string;
    summary_md: string;
  };
  warnings: string[];
};

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_MIN_CLUSTER_SIZE = 5;
const DEFAULT_NOVELTY_THRESHOLD = 0.5;
const DEFAULT_ALGORITHM: DiscoverCompositionsAlgorithm = "hierarchical_ward";
const DEFAULT_K = 50;
const DEFAULT_MAX_TABLETS = 5000;
const HARD_CAP_WARD = 5000;
const HARD_CAP_DBSCAN = 3000;
const TOP_REPS = 5;

// ─── Cache loaders ────────────────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

type EmbeddingBundle = {
  ids: string[];
  vectors: Float32Array[]; // n × dim
  dim: number;
  meta: {
    method: string;
    generated_at: string | null;
    total_tablets: number;
  };
};

function loadTabletVectors(): EmbeddingBundle {
  const indexPath = join(cacheDir(), "tablet-embed-index.json");
  const vectorsPath = join(cacheDir(), "tablet-vectors.f32");
  if (!existsSync(indexPath)) {
    throw new Error(
      `tablet-embed-index.json not found at ${indexPath}. Build via \`node scripts/build-embeddings.mjs\` (v0.15+).`,
    );
  }
  if (!existsSync(vectorsPath)) {
    throw new Error(
      `tablet-vectors.f32 not found at ${vectorsPath}. Build via \`node scripts/build-embeddings.mjs\` (v0.15+).`,
    );
  }
  const raw = JSON.parse(readFileSync(indexPath, "utf-8")) as {
    _meta?: {
      method?: string;
      generated_at?: string;
      total_tablets?: number;
      config?: { DIM?: number };
    };
    ids: string[];
  };
  const dim = raw._meta?.config?.DIM ?? 300;
  const ids = raw.ids;
  const buf = readFileSync(vectorsPath);
  const f32 = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  if (f32.length !== ids.length * dim) {
    throw new Error(
      `tablet-vectors.f32 length mismatch: ${f32.length} floats, expected ${ids.length}×${dim}=${ids.length * dim}`,
    );
  }
  const vectors: Float32Array[] = new Array(ids.length);
  for (let i = 0; i < ids.length; i++) {
    vectors[i] = f32.slice(i * dim, (i + 1) * dim);
  }
  return {
    ids,
    vectors,
    dim,
    meta: {
      method: raw._meta?.method ?? "random_indexing",
      generated_at: raw._meta?.generated_at ?? null,
      total_tablets: raw._meta?.total_tablets ?? ids.length,
    },
  };
}

// ─── Subsampling ──────────────────────────────────────────────────────────

function subsample(
  bundle: EmbeddingBundle,
  cap: number,
  seed: number,
): { idsSub: string[]; vecsSub: Float32Array[]; origIndices: Int32Array } {
  const n = bundle.ids.length;
  if (n <= cap) {
    return {
      idsSub: bundle.ids.slice(),
      vecsSub: bundle.vectors.slice(),
      origIndices: Int32Array.from({ length: n }, (_, i) => i),
    };
  }
  const rng = mulberry32(seed);
  // Fisher-Yates partial shuffle: pick `cap` indices uniformly.
  const indices = Int32Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < cap; i++) {
    const j = i + Math.floor(rng() * (n - i));
    const tmp = indices[i];
    indices[i] = indices[j];
    indices[j] = tmp;
  }
  const chosen = indices.slice(0, cap);
  const idsSub: string[] = [];
  const vecsSub: Float32Array[] = [];
  for (let i = 0; i < cap; i++) {
    idsSub.push(bundle.ids[chosen[i]]);
    vecsSub.push(bundle.vectors[chosen[i]]);
  }
  return { idsSub, vecsSub, origIndices: chosen };
}

// ─── Registered-composition centroids ─────────────────────────────────────

type CompositionCentroid = {
  composition_id: string;
  composition_name: string;
  centroid: Float32Array;
  exemplar_count: number;
  exemplars_with_embeddings: number;
};

function buildRegisteredCentroids(
  bundle: EmbeddingBundle,
): { centroids: CompositionCentroid[]; warnings: string[] } {
  const idIndex = new Map<string, number>();
  for (let i = 0; i < bundle.ids.length; i++) idIndex.set(bundle.ids[i], i);
  const out: CompositionCentroid[] = [];
  const warnings: string[] = [];
  for (const c of COMPOSITION_REGISTRY as CompositionEntry[]) {
    const acc = new Float32Array(bundle.dim);
    let found = 0;
    for (const ex of c.exemplar_tablets) {
      const idx = idIndex.get(ex);
      if (idx === undefined) continue;
      const v = bundle.vectors[idx];
      for (let k = 0; k < bundle.dim; k++) acc[k] += v[k];
      found++;
    }
    if (found === 0) {
      warnings.push(
        `composition ${c.id} (${c.name}) — 0 of ${c.exemplar_tablets.length} exemplars have embeddings; skipping centroid`,
      );
      continue;
    }
    const inv = 1 / found;
    for (let k = 0; k < bundle.dim; k++) acc[k] *= inv;
    l2NormalizeInPlace(acc);
    out.push({
      composition_id: c.id,
      composition_name: c.name,
      centroid: acc,
      exemplar_count: c.exemplar_tablets.length,
      exemplars_with_embeddings: found,
    });
  }
  return { centroids: out, warnings };
}

// ─── Metadata-dominant suggested label ────────────────────────────────────

function dominantSlice(values: (string | null | undefined)[]): { value: string; share: number } | null {
  const nonNull = values.filter((v): v is string => typeof v === "string" && v.length > 0);
  if (nonNull.length === 0) return null;
  const counts = new Map<string, number>();
  for (const v of nonNull) counts.set(v, (counts.get(v) ?? 0) + 1);
  let bestVal = "";
  let bestN = 0;
  for (const [k, v] of counts) {
    if (v > bestN) {
      bestN = v;
      bestVal = k;
    }
  }
  return { value: bestVal, share: bestN / nonNull.length };
}

function pickPeriod(md: ReturnType<typeof getFragmentMetadata>): string | null {
  if (!md) return null;
  const s = md.script;
  if (s && typeof s === "object" && "period" in s) {
    const p = (s as { period?: string }).period;
    return typeof p === "string" && p.length > 0 ? p : null;
  }
  if (typeof s === "string" && s.length > 0) return s;
  return null;
}

function pickCity(md: ReturnType<typeof getFragmentMetadata>): string | null {
  if (!md) return null;
  const p = md.provenance;
  if (p && typeof p === "object" && "site" in p) {
    const s = (p as { site?: string }).site;
    if (typeof s === "string" && s.length > 0) return s;
  }
  if (typeof md.collection === "string" && md.collection.length > 0) return md.collection;
  return null;
}

function pickGenre(md: ReturnType<typeof getFragmentMetadata>): string | null {
  if (!md) return null;
  const gs = md.genres_flat ?? md.genres ?? [];
  if (Array.isArray(gs) && gs.length > 0 && typeof gs[0] === "string") return gs[0];
  return null;
}

function buildSuggestedLabel(
  dom: CandidateNewComposition["dominant_metadata"],
  size: number,
): string {
  const parts: string[] = [];
  if (dom.period && dom.period.share >= 0.4) parts.push(dom.period.value);
  if (dom.genre && dom.genre.share >= 0.4) parts.push(dom.genre.value.toLowerCase());
  if (dom.city && dom.city.share >= 0.4) parts.push(`@${dom.city.value}`);
  if (parts.length === 0) return `mixed_emergent_cluster_n${size}`;
  return parts.join(" ") + ` (n=${size})`;
}

// ─── Main orchestrator ───────────────────────────────────────────────────

export function discoverCompositions(
  opts: DiscoverCompositionsOptions = {},
): DiscoverCompositionsResult {
  const warnings: string[] = [];

  const min_cluster_size = Math.max(2, opts.min_cluster_size ?? DEFAULT_MIN_CLUSTER_SIZE);
  const novelty_threshold = Math.max(0, Math.min(1, opts.novelty_threshold ?? DEFAULT_NOVELTY_THRESHOLD));
  const algorithm: DiscoverCompositionsAlgorithm = opts.algorithm ?? DEFAULT_ALGORITHM;
  const k = Math.max(2, opts.k ?? DEFAULT_K);
  let max_tablets = Math.max(50, opts.max_tablets ?? DEFAULT_MAX_TABLETS);

  // Apply algorithm-specific safety caps so a confused caller can't ask
  // for an O(n³) Ward run on the full 28K-tablet corpus.
  if (algorithm === "hierarchical_ward" && max_tablets > HARD_CAP_WARD) {
    warnings.push(
      `max_tablets ${max_tablets} exceeds hierarchical_ward safety cap ${HARD_CAP_WARD}; capping`,
    );
    max_tablets = HARD_CAP_WARD;
  }
  if (algorithm === "dbscan_like" && max_tablets > HARD_CAP_DBSCAN) {
    warnings.push(
      `max_tablets ${max_tablets} exceeds dbscan_like safety cap ${HARD_CAP_DBSCAN}; capping`,
    );
    max_tablets = HARD_CAP_DBSCAN;
  }

  // Load embeddings.
  const bundle = loadTabletVectors();

  // Build registered centroids (over the FULL corpus, not the subsample —
  // we want the most accurate centroid we can build).
  const { centroids: regCentroids, warnings: regWarnings } = buildRegisteredCentroids(bundle);
  warnings.push(...regWarnings);
  if (regCentroids.length === 0) {
    warnings.push(
      "no registered composition centroids could be built; novelty scoring will treat every cluster as novel",
    );
  }

  // Subsample for clustering.
  const sub = subsample(bundle, max_tablets, DEFAULT_SEED);

  // Run clustering.
  let clustering: ClusteringResult;
  switch (algorithm) {
    case "kmeans":
      clustering = runKMeans(sub.vecsSub, { k, dim: bundle.dim, seed: DEFAULT_SEED });
      break;
    case "hierarchical_ward":
      clustering = runHierarchicalWard(sub.vecsSub, { k, dim: bundle.dim });
      break;
    case "dbscan_like":
      clustering = runDbscanLike(sub.vecsSub, { dim: bundle.dim, minPts: min_cluster_size });
      break;
  }

  // Silhouette (subsampled to keep O(n²) bounded).
  const silhouette = silhouetteSubsample(
    sub.vecsSub,
    clustering.assignments,
    clustering.k,
    bundle.dim,
    500,
    DEFAULT_SEED,
  );

  // Bucket members per cluster.
  const buckets: number[][] = [];
  for (let c = 0; c < clustering.k; c++) buckets.push([]);
  for (let i = 0; i < clustering.assignments.length; i++) {
    const c = clustering.assignments[i];
    if (c >= 0 && c < clustering.k) buckets[c].push(i);
  }

  // For each cluster, build a centroid and compute novelty vs registered.
  type ClusterInfo = {
    cluster_id: number;
    size: number;
    centroid: Float32Array;
    best_reg_id: string;
    best_reg_cos: number;
    novelty: number;
  };

  const infos: ClusterInfo[] = [];
  for (let c = 0; c < clustering.k; c++) {
    const members = buckets[c];
    if (members.length < min_cluster_size) continue;
    const centroid = clustering.centroids[c];
    let bestId = "(none)";
    let bestCos = -1;
    for (const rc of regCentroids) {
      const cs = cosineUnit(centroid, rc.centroid, bundle.dim);
      if (cs > bestCos) {
        bestCos = cs;
        bestId = rc.composition_id;
      }
    }
    const novelty = regCentroids.length === 0 ? 1 : 1 - bestCos;
    infos.push({
      cluster_id: c,
      size: members.length,
      centroid,
      best_reg_id: bestId,
      best_reg_cos: bestCos,
      novelty,
    });
  }

  // Recovery: for each registered composition, find which cluster has
  // the highest cosine to its centroid.
  const recoveryDetail: RegisteredCompositionRecovery[] = [];
  let recovered = 0;
  const RECOVERY_THRESHOLD = 0.5; // cosine ≥ 0.5 counts as "recovered"
  for (const rc of regCentroids) {
    let bestCluster = -1;
    let bestCos = -1;
    for (const info of infos) {
      const cs = cosineUnit(info.centroid, rc.centroid, bundle.dim);
      if (cs > bestCos) {
        bestCos = cs;
        bestCluster = info.cluster_id;
      }
    }
    const isRecovered = bestCos >= RECOVERY_THRESHOLD;
    if (isRecovered) recovered++;
    recoveryDetail.push({
      composition_id: rc.composition_id,
      composition_name: rc.composition_name,
      matched_cluster_id: bestCluster >= 0 ? `cluster_${bestCluster}` : null,
      max_cosine_to_cluster_centroid: +bestCos.toFixed(4),
      exemplar_count: rc.exemplar_count,
      exemplars_with_embeddings: rc.exemplars_with_embeddings,
    });
  }

  // Candidate new compositions: novelty > threshold.
  const candidates: CandidateNewComposition[] = [];
  let tabletsInCandidates = 0;
  for (const info of infos) {
    if (info.novelty <= novelty_threshold) continue;
    const members = buckets[info.cluster_id];
    // Representative tablets: top-N by cosine to centroid.
    const withCos = members
      .map((idx) => ({ idx, cos: cosineUnit(sub.vecsSub[idx], info.centroid, bundle.dim) }))
      .sort((a, b) => b.cos - a.cos);
    const reps = withCos.slice(0, TOP_REPS).map((m) => sub.idsSub[m.idx]);
    // Centroid thematic neighbors: top-K member ids closer to centroid
    // (re-using the same sort for compactness).
    const neighbors = withCos.slice(0, 10).map((m) => sub.idsSub[m.idx]);

    // Dominant metadata.
    const periods: (string | null)[] = [];
    const cities: (string | null)[] = [];
    const genres: (string | null)[] = [];
    for (const idx of members) {
      const md = getFragmentMetadata(sub.idsSub[idx]);
      periods.push(pickPeriod(md));
      cities.push(pickCity(md));
      genres.push(pickGenre(md));
    }
    const dom: CandidateNewComposition["dominant_metadata"] = {
      period: dominantSlice(periods),
      city: dominantSlice(cities),
      genre: dominantSlice(genres),
    };

    tabletsInCandidates += members.length;
    candidates.push({
      cluster_id: `cluster_${info.cluster_id}`,
      tablet_count: members.length,
      representative_tablets: reps,
      centroid_thematic_neighbors: neighbors,
      nearest_registered_composition: {
        id: info.best_reg_id,
        cosine_distance: +(1 - info.best_reg_cos).toFixed(4),
      },
      novelty_score: +info.novelty.toFixed(4),
      suggested_label: buildSuggestedLabel(dom, members.length),
      dominant_metadata: dom,
    });
  }

  // Sort candidates by novelty desc, then size desc.
  candidates.sort((a, b) => {
    if (b.novelty_score !== a.novelty_score) return b.novelty_score - a.novelty_score;
    return b.tablet_count - a.tablet_count;
  });

  // Write outputs.
  const outDir = join(cacheDir(), "composition-discovery", new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(outDir, { recursive: true });
  const jsonPath = join(outDir, "result.json");
  const mdPath = join(outDir, "summary.md");

  const result: DiscoverCompositionsResult = {
    algorithm_used: algorithm,
    clusters_found: infos.length,
    registered_compositions_recovered: recovered,
    candidate_new_compositions: candidates,
    registered_recovery_detail: recoveryDetail,
    metrics: {
      silhouette_score: +silhouette.toFixed(4),
      total_tablets_clustered: sub.vecsSub.length,
      tablets_in_candidate_new_compositions: tabletsInCandidates,
      embedding_dim: bundle.dim,
      iterations: clustering.iterations,
      converged: clustering.converged,
    },
    parameters: {
      min_cluster_size,
      novelty_threshold,
      algorithm,
      k,
      max_tablets,
      seed: DEFAULT_SEED,
    },
    output_paths: {
      json: jsonPath,
      summary_md: mdPath,
    },
    warnings,
  };

  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  writeFileSync(mdPath, renderSummary(result, bundle));

  return result;
}

// ─── Markdown summary ────────────────────────────────────────────────────

function renderSummary(result: DiscoverCompositionsResult, bundle: EmbeddingBundle): string {
  const lines: string[] = [];
  lines.push(`# discover_compositions — unsupervised cluster discovery`);
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push(`## Run parameters`);
  lines.push("");
  lines.push("| field | value |");
  lines.push("|---|---|");
  lines.push(`| algorithm | ${result.parameters.algorithm} |`);
  lines.push(`| k | ${result.parameters.k} |`);
  lines.push(`| max_tablets | ${result.parameters.max_tablets} |`);
  lines.push(`| min_cluster_size | ${result.parameters.min_cluster_size} |`);
  lines.push(`| novelty_threshold | ${result.parameters.novelty_threshold} |`);
  lines.push(`| seed | ${result.parameters.seed} |`);
  lines.push(`| embedding source | tablet-vectors.f32 (${bundle.meta.method}, ${bundle.dim}-dim) |`);
  lines.push(`| embedding generated_at | ${bundle.meta.generated_at ?? "(unknown)"} |`);
  lines.push("");
  lines.push(`## Metrics`);
  lines.push("");
  lines.push("| metric | value |");
  lines.push("|---|---|");
  lines.push(`| clusters_found (≥ min_cluster_size) | ${result.clusters_found} |`);
  lines.push(`| silhouette_score (subsample n=500) | ${result.metrics.silhouette_score} |`);
  lines.push(`| total_tablets_clustered | ${result.metrics.total_tablets_clustered} |`);
  lines.push(`| tablets_in_candidate_new_compositions | ${result.metrics.tablets_in_candidate_new_compositions} |`);
  lines.push(`| iterations | ${result.metrics.iterations} |`);
  lines.push(`| converged | ${result.metrics.converged} |`);
  lines.push("");
  lines.push(`## Registered-composition recovery (cosine ≥ 0.5 = recovered)`);
  lines.push("");
  lines.push(`Recovered: **${result.registered_compositions_recovered} / ${result.registered_recovery_detail.length}**`);
  lines.push("");
  lines.push("| composition | best cluster | max cosine | exemplars (embedded / total) |");
  lines.push("|---|---|---|---|");
  for (const r of result.registered_recovery_detail) {
    lines.push(
      `| ${r.composition_name} (${r.composition_id}) | ${r.matched_cluster_id ?? "(none)"} | ${r.max_cosine_to_cluster_centroid.toFixed(4)} | ${r.exemplars_with_embeddings} / ${r.exemplar_count} |`,
    );
  }
  lines.push("");
  lines.push(
    `## Candidate new compositions (novelty > ${result.parameters.novelty_threshold})`,
  );
  lines.push("");
  lines.push(`Total candidates surfaced: **${result.candidate_new_compositions.length}**`);
  lines.push("");
  if (result.candidate_new_compositions.length === 0) {
    lines.push(
      `> No clusters cleared the novelty threshold. This is a publishable null result: the unsupervised partition at these parameters does not produce structure beyond the existing 11-composition registry. Consider tuning: lower novelty_threshold, raise k, or switch algorithms.`,
    );
  } else {
    lines.push(`### Top-5 candidates`);
    lines.push("");
    lines.push("| rank | cluster | n | novelty | nearest registered (cos_dist) | suggested label | reps |");
    lines.push("|---|---|---|---|---|---|---|");
    for (const [i, c] of result.candidate_new_compositions.slice(0, 5).entries()) {
      const reps = c.representative_tablets.slice(0, 5).join(", ");
      lines.push(
        `| ${i + 1} | ${c.cluster_id} | ${c.tablet_count} | ${c.novelty_score.toFixed(3)} | ${c.nearest_registered_composition.id} (${c.nearest_registered_composition.cosine_distance.toFixed(3)}) | ${c.suggested_label} | ${reps} |`,
      );
    }
    lines.push("");
    lines.push(`### Full candidate list`);
    lines.push("");
    for (const c of result.candidate_new_compositions) {
      lines.push(`#### ${c.cluster_id} — ${c.suggested_label}`);
      lines.push("");
      lines.push(`- size: ${c.tablet_count}`);
      lines.push(`- novelty_score: ${c.novelty_score.toFixed(4)} (cos_dist to ${c.nearest_registered_composition.id} = ${c.nearest_registered_composition.cosine_distance.toFixed(4)})`);
      if (c.dominant_metadata.period)
        lines.push(`- dominant period: ${c.dominant_metadata.period.value} (${(c.dominant_metadata.period.share * 100).toFixed(0)}%)`);
      if (c.dominant_metadata.city)
        lines.push(`- dominant find-spot/collection: ${c.dominant_metadata.city.value} (${(c.dominant_metadata.city.share * 100).toFixed(0)}%)`);
      if (c.dominant_metadata.genre)
        lines.push(`- dominant genre tag: ${c.dominant_metadata.genre.value} (${(c.dominant_metadata.genre.share * 100).toFixed(0)}%)`);
      lines.push(`- representative tablets (top-${c.representative_tablets.length} by centroid centrality): ${c.representative_tablets.join(", ")}`);
      lines.push("");
    }
  }
  lines.push(`## Honest reporting`);
  lines.push("");
  lines.push(
    `Clustering does not equal discovery. A candidate cluster may be a real finding (a coherent composition or sub-corpus not yet in the registry) OR a methodological artifact (sign-count outliers, genre-label noise propagated by the embedding, or low-density regions an algorithm naïvely walls off). The metadata dominance percentages above are the first cheap filter:`,
  );
  lines.push("");
  lines.push(
    `- High period + high genre + high find-spot share (≥ 60% each) → likely a real corpus pattern worth investigating with identify_composition and find_chunk_parallels.`,
  );
  lines.push(
    `- Low metadata dominance across all three axes → likely a mixed cluster picking up incidental embedding-space neighbors. Tune (higher k, raise novelty_threshold, or switch algorithm).`,
  );
  lines.push(
    `- Cluster sizes near min_cluster_size → fragile; re-run at a different max_tablets and check if the cluster reappears (stability test).`,
  );
  lines.push("");
  lines.push(`## Next steps for the operator`);
  lines.push("");
  if (result.candidate_new_compositions.length === 0) {
    lines.push(
      `- This run produced no candidates. Try \`novelty_threshold: 0.3\` or \`algorithm: "kmeans"\` and \`k: 100\` to surface finer structure.`,
    );
  } else {
    lines.push(`- For each top-5 candidate, run identify_composition on each representative tablet to see if the existing registry would in fact absorb them at the per-tablet scoring level (it might — centroid-level novelty can mask exemplar-level near-matches).`);
    lines.push(`- For high-dominance candidates, draft a registry-amendment proposal at data/compositions-v2.draft.json with the representative_tablets as initial exemplars.`);
    lines.push(`- Re-run with different max_tablets (e.g. 2500 vs 5000) and check candidate stability — a true finding should reappear; clustering artifacts won't.`);
  }
  lines.push("");
  if (result.warnings.length > 0) {
    lines.push(`## Warnings`);
    lines.push("");
    for (const w of result.warnings) lines.push(`- ${w}`);
    lines.push("");
  }
  return lines.join("\n");
}
