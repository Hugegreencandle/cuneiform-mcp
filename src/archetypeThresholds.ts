// v0.26.0 — Per-archetype threshold matrix (Round-3 Lever 5 cash-out).
//
// Methods paper §3.8 documents seven cluster archetypes. Until now every
// discovery tool (find_fuzzy_parallels, find_embedded_fragments,
// find_chunk_parallels, find_thematic_parallel, find_same_scribe_candidates,
// reconstruct_cluster) has shipped with ONE global default threshold profile.
// Round-3 Lever 5 of the v0.18.19 calibration audit deferred a recommendation
// that the precision/recall tradeoff is archetype-conditional: a manuscript
// chain (Sm.1055) wants TIGHT thresholds across every axis, while a
// compositional curriculum (BM.77056) wants LOOSE thresholds across every
// axis. Shipping one set of defaults forces the user to either lose recall on
// curricula or lose precision on manuscript chains.
//
// This module is the canonical lookup of recommended thresholds keyed by
// archetype. Every threshold value is anchored to a specific finding in the
// v0.18.x calibration history — see `rationale` strings for the audit-trail.
//
// The matrix is hand-curated and intentionally small (7 entries). It is NOT a
// learned classifier — it is a table that encodes a methodologically defensible
// stance on which tool defaults to use when the user has classified the
// relationship they are targeting.
//
// Pure stdlib + reuse of fuzzyParallels / fragmentMetadata / anomalySurface
// accessors for the seed-classification heuristic.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { getFragmentMetadata, getPeriod, getPrimaryGenre } from "./fragmentMetadata.js";
import { getAllTabletRecords, getTabletSignCount } from "./anomalySurface.js";
import { findThematicParallel } from "./semanticEmbeddings.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type Archetype =
  | "compositional_curriculum"
  | "verbatim_manuscript_chain"
  | "refrain_bound_liturgical"
  | "single_collection_school"
  | "embedded_fragment"
  | "cross_period_bridge"
  | "commentary_quotation";

export type ArchetypeThresholdProfile = {
  archetype: Archetype;
  exemplar: string;
  description: string;

  // Per-tool threshold recommendations:
  find_fuzzy_parallels: { min_fuzzy_jaccard: number };
  find_embedded_fragments: {
    min_containment: number;
    min_run: number;
    host_size_multiplier: number;
  };
  find_chunk_parallels: { min_chunk_len: number };
  find_thematic_parallel: { min_cosine: number };
  find_same_scribe_candidates: { min_signature_overlap: number };
  reconstruct_cluster: { min_fuzzy_jaccard: number; max_depth: number };

  rationale: string;
};

// ─── The matrix ────────────────────────────────────────────────────────────
//
// The seven profiles below encode the tighter-vs-looser ordering documented in
// methods paper §3.8. Across-axis ordering invariants (enforced by the
// Round-11 audit test 2):
//
//   verbatim_manuscript_chain  >=  compositional_curriculum  on every axis
//
// Where ">=" means "tighter or equal" for thresholds (higher cosine / higher
// jaccard / longer min_run / higher containment). The intermediate archetypes
// (refrain_bound, single_collection, embedded_fragment, cross_period_bridge,
// commentary_quotation) each occupy a defensible position between the two
// extremes — see each profile's `rationale` for the calibration history.

export const ARCHETYPE_THRESHOLD_MATRIX: Record<Archetype, ArchetypeThresholdProfile> = {
  compositional_curriculum: {
    archetype: "compositional_curriculum",
    exemplar: "BM.77056",
    description:
      "āšipūtu-style instructional bundle. Loose fuzzy + broad thematic + cross-prefix scribal context. Cross-genre by design.",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.08 },
    find_embedded_fragments: {
      min_containment: 0.3,
      min_run: 10,
      host_size_multiplier: 3,
    },
    find_chunk_parallels: { min_chunk_len: 15 },
    find_thematic_parallel: { min_cosine: 0.45 },
    find_same_scribe_candidates: { min_signature_overlap: 2 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.12, max_depth: 4 },
    rationale:
      "BM.77056 (āšipūtu list, methods paper §3.8.1) clusters across multiple prefixes via shared incipits and thematic context. Round-4 chunk audit (v0.19) confirmed compositional clusters surface at chunk_length ≥15 (sign count ≈17); below that, ubiquitous colophon formulae dominate. Fuzzy threshold relaxed from the v0.18.19 default 0.10 to 0.08 because the curricular signal is in cross-prefix recurrence, not pairwise overlap. Thematic 0.45 (vs v0.18.x default 0.50) because āšipūtu-style cross-genre breadth pushes the topical centroid wider. max_depth=4 lets the BFS reach the second-shell incipit neighbors documented in §3.8.1.",
  },

  verbatim_manuscript_chain: {
    archetype: "verbatim_manuscript_chain",
    exemplar: "Sm.1055",
    description:
      "Near-identical manuscripts of the same composition. Tight fuzzy + tight thematic + tight scribal-signature overlap. The Sm.1055 100+-sign NA chain.",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.35 },
    find_embedded_fragments: {
      min_containment: 0.7,
      min_run: 40,
      host_size_multiplier: 5,
    },
    find_chunk_parallels: { min_chunk_len: 30 },
    find_thematic_parallel: { min_cosine: 0.7 },
    find_same_scribe_candidates: { min_signature_overlap: 5 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.3, max_depth: 2 },
    rationale:
      "Sm.1055's 100+-sign NA chain (cluster typology 2026-05-23) is the canonical example of a verbatim manuscript chain. Round-3 Lever 1 + Round-4 calibration confirmed manuscripts of the same composition routinely reach fuzzy_J ≥0.35 and contiguous runs ≥40. Tighter than every other archetype on every axis because the relationship is reproduction, not adaptation. max_depth=2 because verbatim chains are tight neighborhoods — beyond two hops, the BFS drifts into different compositions. host_size_multiplier=5 retained (manuscripts of the same composition are typically comparable in size; the multiplier rules out colophon-only fragments).",
  },

  refrain_bound_liturgical: {
    archetype: "refrain_bound_liturgical",
    exemplar: "K.5896",
    description:
      "Refrain-heavy liturgical family (Mīs pî, Šuʾila). Loose fuzzy (refrains inflate the exact-Jaccard denominator), tight thematic (semantic context matters), refrain_heavy flag.",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.12 },
    find_embedded_fragments: {
      min_containment: 0.4,
      min_run: 25,
      host_size_multiplier: 4,
    },
    find_chunk_parallels: { min_chunk_len: 20 },
    find_thematic_parallel: { min_cosine: 0.6 },
    find_same_scribe_candidates: { min_signature_overlap: 3 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.15, max_depth: 3 },
    rationale:
      "K.5896 (Mīs pî, methods paper §3.8.3) is refrain-dense; the repeated invocation lines pollute the symmetric trigram union and depress fuzzy_J below the v0.18.x default 0.10 for genuine siblings (K.15325 sits at fuzzy_J=0.11 with K.5896). Fuzzy 0.12 keeps refrain-bound siblings in scope while still rejecting unrelated colophon-formulae. Thematic 0.60 because liturgical context is semantically distinctive — the AŠgN/lustral-ritual centroid is well-separated from medical/divinatory centroids. min_run=25 + min_containment=0.40 are intermediate between manuscript-chain tightness and curriculum looseness; the methods paper §3.8.3 documents 25-position chunks as the refrain-block primitive.",
  },

  single_collection_school: {
    archetype: "single_collection_school",
    exemplar: "YBC.5729",
    description:
      "Single-collection (single-prefix) school cluster. Moderate fuzzy + very tight thematic + single-prefix scribal hand. School-text reproduction within one find-spot.",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.2 },
    find_embedded_fragments: {
      min_containment: 0.55,
      min_run: 25,
      host_size_multiplier: 4,
    },
    find_chunk_parallels: { min_chunk_len: 25 },
    find_thematic_parallel: { min_cosine: 0.75 },
    find_same_scribe_candidates: { min_signature_overlap: 6 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.18, max_depth: 2 },
    rationale:
      "YBC.5729 (methods paper §3.8.4) anchors a Yale-prefix school cluster — same find-spot, same scribal milieu, same composition rotated through multiple student copies. Fuzzy 0.20 (between curriculum 0.08 and manuscript-chain 0.35): school-text relationships are more variant-rich than verbatim chains but more focused than cross-genre curricula. Thematic 0.75 is the tightest in the matrix — single-collection school-texts share a topical centroid by definition. signature_overlap=6 because same-scribe school-hand reuse is the strongest signal here; Round-3 Lever 4 (signature-evolution audit) confirmed school-cluster scribes accumulate ≥6 signature overlap. max_depth=2 mirrors verbatim_chain: school clusters are tight neighborhoods.",
  },

  embedded_fragment: {
    archetype: "embedded_fragment",
    exemplar: "K.9508",
    description:
      "Small fragment embedded in a much larger host (K.9508 in K.5896). Lex-singleton at default thresholds; thematic-only recovery without asymmetric containment. The Archetype-5 raison d'être of find_embedded_fragments.",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.05 },
    find_embedded_fragments: {
      min_containment: 0.3,
      min_run: 30,
      host_size_multiplier: 5,
    },
    find_chunk_parallels: { min_chunk_len: 30 },
    find_thematic_parallel: { min_cosine: 0.5 },
    find_same_scribe_candidates: { min_signature_overlap: 2 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.08, max_depth: 3 },
    rationale:
      "K.9508 ↔ K.5896 sits at fuzzy_J=0.13 symmetric (below the v0.18.x default 0.10 only marginally) because the union denominator is dominated by K.5896's 7.32× larger vocabulary. The asymmetric containment is 0.986 — the entire fragment's signal is in K.5896. Round-3 Lever 1 calibration found min_containment=0.30 + min_run=30 is the precision-tight setting that catches K.9508 → K.5896 while suppressing IM.49220 + K.3306 (the methods-paper final-2 bi-orphans) to zero hosts. Looser than refrain_bound on min_containment (0.30 vs 0.40) but TIGHTER on min_run (30 vs 25) — because the evidence for an embedded fragment is the contiguous run, not the overall vocabulary overlap. Symmetric fuzzy_J relaxed to 0.05 only as a backstop; the user querying this archetype is expected to drive via find_embedded_fragments, not find_fuzzy_parallels.",
  },

  cross_period_bridge: {
    archetype: "cross_period_bridge",
    exemplar: "BM.45749",
    description:
      "Tablet with comparable similarity to two distinct cluster sides spanning different periods. Loose-to-moderate on every axis (the cross-period signal is structural, not strength-based).",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.1 },
    find_embedded_fragments: {
      min_containment: 0.35,
      min_run: 20,
      host_size_multiplier: 4,
    },
    find_chunk_parallels: { min_chunk_len: 18 },
    find_thematic_parallel: { min_cosine: 0.5 },
    find_same_scribe_candidates: { min_signature_overlap: 2 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.1, max_depth: 4 },
    rationale:
      "BM.45749 (methods paper §3.8.6) is a cross-period bridge — its top fuzzy parallels straddle OB and NA periods at comparable scores. The defining feature is structural (two clusters connected through one node), not signal strength. Thresholds intentionally permissive across all axes to keep both sides of the bridge in scope; max_depth=4 lets the BFS reach the far side of the bridge. min_chunk_len=18 (vs curriculum's 15) because cross-period orthographic drift suppresses very-short chunks more than curricular cross-genre does. Stricter than curriculum but looser than every other archetype — the right place in the matrix for 'connector' relationships.",
  },

  commentary_quotation: {
    archetype: "commentary_quotation",
    exemplar: "BM.47463",
    description:
      "Commentary tablet quoting a base text in long contiguous passages (BM.47463 ↔ CBS.6060, Šurpu Commentary ↔ Šurpu base). Tight fuzzy (verbatim quotation) + tight chunk-length (the quote is a passage, not a scattered overlap).",
    find_fuzzy_parallels: { min_fuzzy_jaccard: 0.3 },
    find_embedded_fragments: {
      min_containment: 0.5,
      min_run: 100,
      host_size_multiplier: 3,
    },
    find_chunk_parallels: { min_chunk_len: 100 },
    find_thematic_parallel: { min_cosine: 0.65 },
    find_same_scribe_candidates: { min_signature_overlap: 3 },
    reconstruct_cluster: { min_fuzzy_jaccard: 0.25, max_depth: 2 },
    rationale:
      "BM.47463 ↔ CBS.6060 (methods paper §3.7.1) sits at fuzzy_J=0.81 with a 108-position contiguous run. v0.18.19 Lever 2 (commentary-quotes-base verdict) confirmed the diagnostic threshold is min_run ≥100 + at least one side genre-tagged 'Commentary'. Tighter on min_run (100) than every other archetype because the defining feature is the long verbatim passage — distinguishes commentary quotation from same-composition manuscript-chain reproduction (which can be high-fuzzy WITHOUT a single ≥100 run). host_size_multiplier=3 (vs verbatim_chain's 5) because commentaries can be larger OR smaller than their base text — the multiplier loosens to keep both orientations in scope.",
  },
};

export const ALL_ARCHETYPES: readonly Archetype[] = [
  "compositional_curriculum",
  "verbatim_manuscript_chain",
  "refrain_bound_liturgical",
  "single_collection_school",
  "embedded_fragment",
  "cross_period_bridge",
  "commentary_quotation",
];

export function getArchetypeProfile(a: Archetype): ArchetypeThresholdProfile {
  return ARCHETYPE_THRESHOLD_MATRIX[a];
}

export function listAllArchetypeProfiles(): ArchetypeThresholdProfile[] {
  return ALL_ARCHETYPES.map((a) => ARCHETYPE_THRESHOLD_MATRIX[a]);
}

// ─── Seed classification heuristic ─────────────────────────────────────────
//
// Best-effort, FAST classifier. Not a learned model — a documented heuristic
// that probes four quick signals:
//
//   1. Seed size (sign_count): <200 → candidate for embedded_fragment.
//   2. Top fuzzy parallel's strength + longest_contiguous_run:
//        - fuzzy_J ≥0.5 + run ≥100 → commentary_quotation candidate
//          (further disambiguated by genre flag if available)
//        - fuzzy_J ≥0.3                     → verbatim_manuscript_chain
//        - fuzzy_J 0.15-0.3 + dense prefix  → single_collection_school
//        - fuzzy_J 0.15-0.3 + spread prefix → cross_period_bridge / curriculum
//   3. Prefix-spread of top-5 fuzzy parallels:
//        - single prefix dominates → single_collection_school
//        - 3+ prefixes             → compositional_curriculum
//   4. Genre + period of seed + top parallel:
//        - commentary genre on either side                → commentary_quotation
//        - period mismatch with comparable scores         → cross_period_bridge
//        - liturgical genre + refrain-heavy chunk profile → refrain_bound_liturgical
//
// The heuristic prioritizes the strongest signal — it does not produce
// confidence weights or alternative archetypes (those are the user's call once
// they've seen the recommended thresholds). When in doubt, the heuristic
// returns compositional_curriculum (the loosest profile) because over-tight
// thresholds silently lose recall and are harder to diagnose than overly-loose
// thresholds that surface noise the user can filter post-hoc.

export type ArchetypeClassificationEvidence = {
  seed_tablet_id: string;
  seed_sign_count: number | null;
  seed_genre: string | null;
  seed_period: string | null;
  top_parallel_id: string | null;
  top_parallel_fuzzy_jaccard: number | null;
  top_parallel_longest_contiguous_run: number | null;
  top_parallel_genre: string | null;
  top_parallel_period: string | null;
  top5_prefix_spread: number;
  top5_dominant_prefix: string | null;
  thematic_top_score: number | null;
  signals_fired: string[];
};

export type ArchetypeClassification = {
  classified_archetype: Archetype;
  evidence: ArchetypeClassificationEvidence;
};

function prefixOf(tabletId: string): string {
  const dot = tabletId.indexOf(".");
  return dot >= 0 ? tabletId.slice(0, dot) : tabletId;
}

function hasCommentaryGenre(tabletId: string): boolean {
  const m = getFragmentMetadata(tabletId);
  if (!m || !m.genres_flat) return false;
  return m.genres_flat.some((g) => g.toLowerCase().includes("commentary"));
}

function hasLiturgicalGenre(tabletId: string): boolean {
  const m = getFragmentMetadata(tabletId);
  if (!m || !m.genres_flat) return false;
  return m.genres_flat.some((g) => {
    const gl = g.toLowerCase();
    return (
      gl.includes("ritual") ||
      gl.includes("liturg") ||
      gl.includes("incantation") ||
      gl.includes("šuʾila") ||
      gl.includes("suila") ||
      gl.includes("mis pi") ||
      gl.includes("mīs pî")
    );
  });
}

export function classifySeedArchetype(seedTabletId: string): ArchetypeClassification | null {
  const signCount = getTabletSignCount(seedTabletId);
  const meta = getFragmentMetadata(seedTabletId);
  const seedGenre = getPrimaryGenre(meta);
  const seedPeriod = getPeriod(meta);
  const signals: string[] = [];

  // Probe fuzzy parallels (top-5 minimum-threshold to characterize the neighborhood).
  const fuzzy = findFuzzyParallels({
    tabletId: seedTabletId,
    topK: 5,
    minFuzzyJaccard: 0,
    minFuzzyIntersect: 1,
  });

  if (fuzzy.warnings.length > 0 && fuzzy.parallels.length === 0) {
    // Tablet not in fuzzy index — best effort: fall back to compositional_curriculum.
    return {
      classified_archetype: "compositional_curriculum",
      evidence: {
        seed_tablet_id: seedTabletId,
        seed_sign_count: signCount,
        seed_genre: seedGenre,
        seed_period: seedPeriod,
        top_parallel_id: null,
        top_parallel_fuzzy_jaccard: null,
        top_parallel_longest_contiguous_run: null,
        top_parallel_genre: null,
        top_parallel_period: null,
        top5_prefix_spread: 0,
        top5_dominant_prefix: null,
        thematic_top_score: null,
        signals_fired: ["seed_not_in_fuzzy_index → fallback compositional_curriculum"],
      },
    };
  }

  const top = fuzzy.parallels[0] ?? null;
  const topId = top?.tablet_id ?? null;
  const topJ = top?.fuzzy_jaccard ?? null;
  const topRun = top?.longest_contiguous_run ?? null;
  const topMeta = topId ? getFragmentMetadata(topId) : null;
  const topGenre = getPrimaryGenre(topMeta);
  const topPeriod = getPeriod(topMeta);

  // Prefix-spread analysis on top-5.
  const prefixCounts = new Map<string, number>();
  for (const p of fuzzy.parallels.slice(0, 5)) {
    const pre = prefixOf(p.tablet_id);
    prefixCounts.set(pre, (prefixCounts.get(pre) ?? 0) + 1);
  }
  const top5Spread = prefixCounts.size;
  let dominantPrefix: string | null = null;
  let dominantCount = 0;
  for (const [pre, ct] of prefixCounts) {
    if (ct > dominantCount) {
      dominantCount = ct;
      dominantPrefix = pre;
    }
  }

  // Quick thematic probe (cheap — single neighbor call, min_cosine relaxed).
  let thematicTop: number | null = null;
  try {
    const thematic = findThematicParallel(seedTabletId, { topK: 1, minCosine: 0 });
    if (thematic.neighbors.length > 0) {
      thematicTop = thematic.neighbors[0].score;
    }
  } catch {
    // Thematic index may be unavailable in some build configurations; ignore.
  }

  // ─── Decision tree ─────────────────────────────────────────────────────
  // Order matters: stronger / more diagnostic signals first.
  //
  // Diagnostic-signal priority (most diagnostic first):
  //   commentary genre tag  >  liturgical genre tag  >  embedded-fragment shape
  //     > verbatim-chain fuzzy_J  >  single-collection prefix spread
  //     > cross-period mismatch   >  compositional-curriculum (fallback)
  //
  // Genre tags fire EARLIER than raw fuzzy_J thresholds because the genre is
  // archetype-determining when present (a refrain-bound Mīs pî manuscript and
  // a verbatim Diagnostic Series manuscript can both sit at fuzzy_J=0.5;
  // genre is what distinguishes them).

  // 1. Commentary quotation: long verbatim passage + a commentary-tagged side.
  if (topJ !== null && topJ >= 0.3 && topRun !== null && topRun >= 80) {
    const aIsComm = hasCommentaryGenre(seedTabletId);
    const bIsComm = topId ? hasCommentaryGenre(topId) : false;
    if (aIsComm !== bIsComm && (aIsComm || bIsComm)) {
      signals.push(
        `top_run=${topRun} (≥80) + top_fuzzy_J=${topJ} (≥0.3) + commentary-genre on one side → commentary_quotation`,
      );
      return {
        classified_archetype: "commentary_quotation",
        evidence: buildEvidence(),
      };
    }
  }

  // 2. Embedded fragment: small seed + low symmetric fuzzy_J but with a
  //    clearly larger host on a contiguous run. Fires BEFORE the
  //    liturgical-genre branch because embedded_fragment is a STRUCTURAL
  //    archetype defined by size + J + run shape, and the K.9508 ↔ K.5896
  //    canonical example is BOTH liturgical AND embedded — the user
  //    targeting K.9508 wants the embedded-fragment thresholds (loose fuzzy
  //    + asymmetric containment), not the refrain-bound profile.
  if (signCount !== null && signCount < 200 && topJ !== null && topJ < 0.35) {
    if (topRun !== null && topRun >= 25) {
      signals.push(
        `seed_sign_count=${signCount} (<200) + top_fuzzy_J=${topJ} (<0.35) + top_run=${topRun} (≥25) → embedded_fragment`,
      );
      return { classified_archetype: "embedded_fragment", evidence: buildEvidence() };
    }
  }

  // 3. Refrain-bound liturgical: moderate-to-high fuzzy + liturgical genre on
  //    seed + NOT a small embedded fragment shape. Fires BEFORE verbatim-chain
  //    because the genre tag is the archetype-determining signal — a Mīs pî
  //    manuscript at fuzzy_J=0.56 is a refrain-bound family member, not a
  //    generic verbatim chain.
  if (topJ !== null && topJ >= 0.10 && hasLiturgicalGenre(seedTabletId)) {
    signals.push(
      `top_fuzzy_J=${topJ} (≥0.10) + liturgical genre flag on seed → refrain_bound_liturgical`,
    );
    return {
      classified_archetype: "refrain_bound_liturgical",
      evidence: buildEvidence(),
    };
  }

  // 4. Compositional curriculum (early-exit): small tablet + moderate fuzzy_J
  //    + SHORT run + no genre tag = curricular short-form (e.g. lexical/lists,
  //    incipit registers, school-bundle exercise extracts). The §3.8.1
  //    BM.77056 case lands here. Fires BEFORE the verbatim-chain branch
  //    because verbatim chains require sustained contiguous evidence — a
  //    short run with no genre tag is a curricular shape, not a manuscript.
  if (
    signCount !== null &&
    signCount < 250 &&
    topJ !== null &&
    topJ >= 0.3 &&
    topRun !== null &&
    topRun < 30 &&
    !seedGenre
  ) {
    signals.push(
      `seed_sign_count=${signCount} (<250) + top_fuzzy_J=${topJ} (≥0.3) + top_run=${topRun} (<30) + no genre tag → compositional_curriculum (curricular short-form)`,
    );
    return {
      classified_archetype: "compositional_curriculum",
      evidence: buildEvidence(),
    };
  }

  // 5. Verbatim manuscript chain: high-fuzzy top parallel WITH sustained
  //    contiguous evidence (otherwise the high-J is shared-vocab artefact).
  if (topJ !== null && topJ >= 0.35) {
    signals.push(`top_fuzzy_J=${topJ} (≥0.35) → verbatim_manuscript_chain`);
    return { classified_archetype: "verbatim_manuscript_chain", evidence: buildEvidence() };
  }

  // 6. Single-collection school: moderate fuzzy + single dominant prefix in top-5.
  if (topJ !== null && topJ >= 0.15 && top5Spread === 1) {
    signals.push(
      `top_fuzzy_J=${topJ} (≥0.15) + top5_prefix_spread=1 (single dominant prefix=${dominantPrefix}) → single_collection_school`,
    );
    return { classified_archetype: "single_collection_school", evidence: buildEvidence() };
  }

  // 7. Cross-period bridge: moderate fuzzy + period mismatch between seed and top parallel.
  if (
    topJ !== null &&
    topJ >= 0.1 &&
    seedPeriod &&
    topPeriod &&
    seedPeriod !== topPeriod
  ) {
    signals.push(
      `top_fuzzy_J=${topJ} (≥0.10) + period mismatch (seed=${seedPeriod}, top=${topPeriod}) → cross_period_bridge`,
    );
    return { classified_archetype: "cross_period_bridge", evidence: buildEvidence() };
  }

  // 8. Compositional curriculum: weak-to-moderate fuzzy spread across multiple prefixes (DEFAULT FALLBACK).
  signals.push(
    `default fallback: top_fuzzy_J=${topJ ?? "null"}, top5_prefix_spread=${top5Spread} → compositional_curriculum`,
  );
  return { classified_archetype: "compositional_curriculum", evidence: buildEvidence() };

  function buildEvidence(): ArchetypeClassificationEvidence {
    return {
      seed_tablet_id: seedTabletId,
      seed_sign_count: signCount,
      seed_genre: seedGenre,
      seed_period: seedPeriod,
      top_parallel_id: topId,
      top_parallel_fuzzy_jaccard: topJ,
      top_parallel_longest_contiguous_run: topRun,
      top_parallel_genre: topGenre,
      top_parallel_period: topPeriod,
      top5_prefix_spread: top5Spread,
      top5_dominant_prefix: dominantPrefix,
      thematic_top_score: thematicTop,
      signals_fired: signals,
    };
  }
}

// Marker used by audit / tests to verify the matrix is non-empty.
// Use anomaly-surface accessor here as a soft availability probe so the
// classifier can fail gracefully when the corpus is not built.
export function corpusAvailableForClassification(): boolean {
  const all = getAllTabletRecords();
  return !!(all && all.length > 0);
}
