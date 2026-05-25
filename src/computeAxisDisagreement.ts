// v0.49.0 — compute_axis_disagreement.
//
// Panel-review §3.30: identify_composition (sign-trigram + sign2vec centroid
// + chunk-overlap) and find_lemma_parallel (lemma-Jaccard) measure
// orthogonal axes — orthographic reuse vs lexical reuse. When they
// AGREE on a tablet's composition, that's strong convergence; when they
// DISAGREE, it's a methodology signal worth examining (e.g. K.5896 has
// chunk-defined Mīs pî identity but ZERO lemmas → identifyComposition
// classifies via chunk-overlap, find_lemma_parallel can't classify at all).
//
// Output:
//   - composition_top (from identify_composition)
//   - lemma_neighbors_top (from find_lemma_parallel)
//   - inferred_composition_from_lemmas (top neighbor's identify_composition
//     result — second-hop classification through the lemma axis)
//   - agreement: "agree" / "lemma_silent" / "disagree" / "both_silent"
//   - rationale string

import { identifyComposition } from "./identifyComposition.js";
import { findLemmaParallel } from "./lemmaParallel.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "./provenanceTags.js";

export type AxisDisagreementResult = {
  query: {
    tablet_id: string;
    top_k: number;
  };
  composition_axis: {
    top_composition_id: string | null;
    top_composition_name: string | null;
    confidence: number | null;
    candidates: Array<{ composition_id: string; confidence: number }>;
  };
  lemma_axis: {
    n_lemmas: number;
    cache_loaded: boolean;
    top_neighbors: Array<{ tablet_id: string; jaccard: number }>;
    inferred_composition_id: string | null;
    inferred_composition_name: string | null;
    inferred_via_neighbor: string | null;
  };
  agreement: "agree" | "lemma_silent" | "disagree" | "both_silent";
  rationale: string;
  warnings: string[];
};

export type ComputeAxisDisagreementOptions = {
  tabletId: string;
  topK?: number;
};

export function computeAxisDisagreement(
  opts: ComputeAxisDisagreementOptions,
): AxisDisagreementResult {
  const warnings: string[] = [REGISTRY_BOOTSTRAP_NOTE_V1];
  const tabletId = opts.tabletId.trim();
  const topK = Math.max(1, Math.min(20, opts.topK ?? 5));

  // Composition axis
  const idResult = identifyComposition({ tabletId, topK });
  const idTop = idResult.candidates[0] ?? null;

  // Lemma axis — first find neighbors
  const lemma = findLemmaParallel({ tabletId, topK, minJaccard: 0.0 });

  let inferredId: string | null = null;
  let inferredName: string | null = null;
  let inferredVia: string | null = null;
  if (lemma.candidates.length > 0 && lemma.index_stats.cache_loaded) {
    // Second-hop: take the top lemma-neighbor and identify ITS composition
    const topNeighbor = lemma.candidates[0];
    const neighborId = identifyComposition({ tabletId: topNeighbor.tablet_id, topK: 1 });
    if (neighborId.candidates[0]) {
      inferredId = neighborId.candidates[0].composition_id;
      inferredName = neighborId.candidates[0].composition_name;
      inferredVia = topNeighbor.tablet_id;
    }
  }

  // Agreement classification
  let agreement: AxisDisagreementResult["agreement"];
  let rationale: string;
  if (lemma.query.n_lemmas === 0) {
    if (!idTop) {
      agreement = "both_silent";
      rationale = `query has zero lemmas in cache AND identify_composition could not classify — both axes silent.`;
    } else {
      agreement = "lemma_silent";
      rationale = `query has zero lemmas in cache (eBL lemmatization gap); only composition_axis fires. id_axis → ${idTop.composition_id} (conf=${idTop.confidence.toFixed(3)}).`;
    }
  } else if (!inferredId) {
    agreement = "lemma_silent";
    rationale = `lemma neighbors found but second-hop composition inference failed.`;
  } else if (!idTop) {
    agreement = "disagree";
    rationale = `composition axis returned no candidate; lemma axis (via ${inferredVia}) suggests ${inferredId}.`;
  } else if (idTop.composition_id === inferredId) {
    agreement = "agree";
    rationale = `both axes → ${idTop.composition_id} (composition direct, lemma via ${inferredVia}). Strong convergence.`;
  } else {
    agreement = "disagree";
    rationale = `composition_axis → ${idTop.composition_id} (conf=${idTop.confidence.toFixed(3)}); lemma_axis (via ${inferredVia}) → ${inferredId}. Disagreement = methodology signal — examine the orthographic vs lexical evidence separately.`;
  }

  return {
    query: { tablet_id: tabletId, top_k: topK },
    composition_axis: {
      top_composition_id: idTop?.composition_id ?? null,
      top_composition_name: idTop?.composition_name ?? null,
      confidence: idTop?.confidence ?? null,
      candidates: idResult.candidates.slice(0, topK).map((c) => ({
        composition_id: c.composition_id,
        confidence: c.confidence,
      })),
    },
    lemma_axis: {
      n_lemmas: lemma.query.n_lemmas,
      cache_loaded: lemma.index_stats.cache_loaded,
      top_neighbors: lemma.candidates.slice(0, topK).map((c) => ({
        tablet_id: c.tablet_id,
        jaccard: c.jaccard,
      })),
      inferred_composition_id: inferredId,
      inferred_composition_name: inferredName,
      inferred_via_neighbor: inferredVia,
    },
    agreement,
    rationale,
    warnings,
  };
}
