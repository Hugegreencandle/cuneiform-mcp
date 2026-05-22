// v0.18.8 — Cross-axis pair-comparison tool.
//
// Given two museum numbers, returns the comprehensive cross-axis similarity
// of the pair across all four cuneiform-mcp discovery axes:
//   - Lexical    (exact sign-trigram-Jaccard)
//   - Fuzzy      (1-substitution Jaccard + contiguous-run bonus)
//   - Thematic   (random-indexing embedding cosine)
//   - Scribal    (LLR-signature cosine + Jaccard)
//
// Plus an identification verdict that maps the four-axis pattern to the
// likely relationship class: same-composition / same-scribe / join-candidate /
// weak-match / unrelated. Mirrors the methodological framing of the methods
// paper §3.4 + §3.4.1: each axis answers a distinct question, and the
// combined cross-axis pattern is more informative than any single metric.
//
// Implementation: per-axis top-K query for tablet A; locate tablet B in each
// result set. If B is below A's top-K for an axis, retry B→A direction. If
// neither direction surfaces the pair, report "below_threshold" with the
// threshold values explicit.
//
// Pure stdlib + reuse of findFuzzyParallels, findThematicParallel,
// findSameScribeCandidates.

import { findFuzzyParallels } from "./fuzzyParallels.js";
import { findThematicParallel } from "./semanticEmbeddings.js";
import { findSameScribeCandidates } from "./scribalFingerprint.js";

// ─── Public types ──────────────────────────────────────────────────────────

export type AxisScore =
  | {
      status: "found";
      direction: "a_to_b" | "b_to_a";
      values: Record<string, number>;
    }
  | {
      status: "below_threshold";
      direction_attempted: "both" | "a_to_b_only" | "b_to_a_only";
      threshold_note: string;
    }
  | {
      status: "tablet_not_in_index";
      missing_tablets: string[];
    };

export type ComparePairResult = {
  tablet_a: string;
  tablet_b: string;
  axes: {
    lexical: AxisScore; // exact-J
    fuzzy: AxisScore; // fuzzy-J, run-bonus, final_score, exact_intersect, fuzzy_intersect
    thematic: AxisScore; // thematic cosine
    scribal: AxisScore; // signature cosine + jaccard + overlap_count
  };
  verdict: {
    primary_relationship: PairRelationship;
    confidence: "high" | "medium" | "low";
    evidence: string[];
  };
  warnings: string[];
};

export type PairRelationship =
  | "same_composition_same_scribe" // strongest — high fuzzy + high scribal
  | "same_composition_different_scribe" // high fuzzy/lexical + low scribal
  | "same_scribe_different_composition" // high scribal + moderate fuzzy
  | "thematic_only" // high thematic + low lexical/fuzzy → paraphrase / bilingual
  | "physical_join_candidate" // very-high fuzzy-J (≥0.5) + scribal match — possible reconstruction
  | "weak_relationship" // some signal but below confident thresholds
  | "unrelated"; // no signal across any axis

export type ComparePairOptions = {
  tabletA: string;
  tabletB: string;
};

function queryFuzzyPair(a: string, b: string): AxisScore {
  // First try A→B with high topK
  const fwd = findFuzzyParallels({ tabletId: a, topK: 50, minFuzzyJaccard: 0, minFuzzyIntersect: 1 });
  if (fwd.warnings.length > 0 && fwd.parallels.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [a] };
  }
  const fwdHit = fwd.parallels.find((p) => p.tablet_id === b);
  if (fwdHit) {
    return {
      status: "found",
      direction: "a_to_b",
      values: {
        exact_jaccard: fwdHit.exact_jaccard,
        fuzzy_jaccard: fwdHit.fuzzy_jaccard,
        final_score: fwdHit.final_score,
        contiguous_run_bonus: fwdHit.contiguous_run_bonus,
        longest_contiguous_run: fwdHit.longest_contiguous_run,
        exact_intersect: fwdHit.exact_intersect,
        fuzzy_intersect: fwdHit.fuzzy_intersect,
        query_trigrams: fwdHit.query_trigrams,
        target_trigrams: fwdHit.target_trigrams,
      },
    };
  }
  // Retry B→A
  const rev = findFuzzyParallels({ tabletId: b, topK: 50, minFuzzyJaccard: 0, minFuzzyIntersect: 1 });
  if (rev.warnings.length > 0 && rev.parallels.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [b] };
  }
  const revHit = rev.parallels.find((p) => p.tablet_id === a);
  if (revHit) {
    return {
      status: "found",
      direction: "b_to_a",
      values: {
        exact_jaccard: revHit.exact_jaccard,
        fuzzy_jaccard: revHit.fuzzy_jaccard,
        final_score: revHit.final_score,
        contiguous_run_bonus: revHit.contiguous_run_bonus,
        longest_contiguous_run: revHit.longest_contiguous_run,
        exact_intersect: revHit.exact_intersect,
        fuzzy_intersect: revHit.fuzzy_intersect,
        query_trigrams: revHit.query_trigrams,
        target_trigrams: revHit.target_trigrams,
      },
    };
  }
  return {
    status: "below_threshold",
    direction_attempted: "both",
    threshold_note: "Pair not in top-50 of either direction; fuzzy_jaccard likely < threshold for both A and B.",
  };
}

function queryThematicPair(a: string, b: string): AxisScore {
  const fwd = findThematicParallel(a, { topK: 30, minCosine: 0 });
  if (fwd.warnings.length > 0 && fwd.neighbors.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [a] };
  }
  const fwdHit = fwd.neighbors.find((n) => n.id === b);
  if (fwdHit) {
    return {
      status: "found",
      direction: "a_to_b",
      values: { thematic_cosine: fwdHit.score },
    };
  }
  const rev = findThematicParallel(b, { topK: 30, minCosine: 0 });
  if (rev.warnings.length > 0 && rev.neighbors.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [b] };
  }
  const revHit = rev.neighbors.find((n) => n.id === a);
  if (revHit) {
    return {
      status: "found",
      direction: "b_to_a",
      values: { thematic_cosine: revHit.score },
    };
  }
  return {
    status: "below_threshold",
    direction_attempted: "both",
    threshold_note: "Pair not in top-30 of either direction; thematic cosine likely < neighborhood threshold (typically ~0.50-0.60).",
  };
}

function queryScribalPair(a: string, b: string): AxisScore {
  const fwd = findSameScribeCandidates({ tabletId: a, topK: 30, minJaccard: 0, minOverlap: 1 });
  if (fwd.warnings.length > 0 && fwd.candidates.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [a] };
  }
  const fwdHit = fwd.candidates.find((c) => c.tablet_id === b);
  if (fwdHit) {
    return {
      status: "found",
      direction: "a_to_b",
      values: {
        signature_cosine: fwdHit.signature_cosine,
        signature_jaccard: fwdHit.signature_jaccard,
        signature_overlap_count: fwdHit.signature_overlap_count,
      },
    };
  }
  const rev = findSameScribeCandidates({ tabletId: b, topK: 30, minJaccard: 0, minOverlap: 1 });
  if (rev.warnings.length > 0 && rev.candidates.length === 0) {
    return { status: "tablet_not_in_index", missing_tablets: [b] };
  }
  const revHit = rev.candidates.find((c) => c.tablet_id === a);
  if (revHit) {
    return {
      status: "found",
      direction: "b_to_a",
      values: {
        signature_cosine: revHit.signature_cosine,
        signature_jaccard: revHit.signature_jaccard,
        signature_overlap_count: revHit.signature_overlap_count,
      },
    };
  }
  return {
    status: "below_threshold",
    direction_attempted: "both",
    threshold_note: "Pair not in top-30 of either direction; signature cosine likely < typical same-scribe range (~0.5+).",
  };
}

function classify(
  fuzzy: AxisScore,
  thematic: AxisScore,
  scribal: AxisScore,
): { primary_relationship: PairRelationship; confidence: "high" | "medium" | "low"; evidence: string[] } {
  const evidence: string[] = [];
  const fuzzyJ = fuzzy.status === "found" ? (fuzzy.values.fuzzy_jaccard ?? 0) : 0;
  const exactJ = fuzzy.status === "found" ? (fuzzy.values.exact_jaccard ?? 0) : 0;
  const themCos = thematic.status === "found" ? (thematic.values.thematic_cosine ?? 0) : 0;
  const scribCos = scribal.status === "found" ? (scribal.values.signature_cosine ?? 0) : 0;
  const longRun = fuzzy.status === "found" ? (fuzzy.values.longest_contiguous_run ?? 0) : 0;

  // Decision tree mirrors the methods paper §3.4 + §3.4.1 framing
  if (fuzzyJ >= 0.5 && scribCos >= 0.7) {
    evidence.push(`fuzzy_J=${fuzzyJ} (≥0.5: very-high lexical) + scribal_cos=${scribCos} (≥0.7: same scribe)`);
    if (fuzzyJ >= 0.7) evidence.push(`fuzzy_J ≥ 0.7 suggests possible physical-join candidate; check find_join_candidates`);
    return { primary_relationship: fuzzyJ >= 0.7 ? "physical_join_candidate" : "same_composition_same_scribe", confidence: "high", evidence };
  }
  if (fuzzyJ >= 0.3 && scribCos >= 0.7) {
    evidence.push(`fuzzy_J=${fuzzyJ} (moderate lexical) + scribal_cos=${scribCos} (≥0.7: same scribe)`);
    return { primary_relationship: "same_scribe_different_composition", confidence: "medium", evidence };
  }
  if (fuzzyJ >= 0.3 && scribCos < 0.5) {
    evidence.push(`fuzzy_J=${fuzzyJ} (≥0.3: composition-level match) + scribal_cos=${scribCos} (low: different scribes)`);
    if (longRun >= 15) evidence.push(`longest_contiguous_run=${longRun} (≥15: continuous-text manuscript-section sibling — methods paper §3.3 pattern)`);
    return { primary_relationship: "same_composition_different_scribe", confidence: "high", evidence };
  }
  if (scribCos >= 0.7 && fuzzyJ < 0.2) {
    evidence.push(`scribal_cos=${scribCos} (≥0.7: same scribe) + fuzzy_J=${fuzzyJ} (low: different composition)`);
    return { primary_relationship: "same_scribe_different_composition", confidence: "high", evidence };
  }
  if (themCos >= 0.7 && fuzzyJ < 0.15 && exactJ < 0.05) {
    evidence.push(`thematic_cos=${themCos} (≥0.7: thematic match) + low lexical (exact_J=${exactJ}, fuzzy_J=${fuzzyJ}) — paraphrase/bilingual/alt-spelling candidate`);
    return { primary_relationship: "thematic_only", confidence: "medium", evidence };
  }
  if (fuzzyJ >= 0.15 || themCos >= 0.5 || scribCos >= 0.4) {
    evidence.push(`weak cross-axis signal: fuzzy_J=${fuzzyJ}, thematic_cos=${themCos}, scribal_cos=${scribCos}`);
    return { primary_relationship: "weak_relationship", confidence: "low", evidence };
  }
  evidence.push(`no axis above weak-signal threshold: fuzzy_J=${fuzzyJ}, thematic_cos=${themCos}, scribal_cos=${scribCos}`);
  return { primary_relationship: "unrelated", confidence: "high", evidence };
}

export function compareTabletPair(opts: ComparePairOptions): ComparePairResult {
  const warnings: string[] = [];
  const a = opts.tabletA.trim();
  const b = opts.tabletB.trim();
  if (a === b) {
    warnings.push("tabletA and tabletB are identical — comparison is trivial.");
  }

  // Lexical axis: derive from fuzzy result's exact_jaccard field (same computation)
  const fuzzy = queryFuzzyPair(a, b);
  const thematic = queryThematicPair(a, b);
  const scribal = queryScribalPair(a, b);

  // Lexical is a projection of fuzzy.values.exact_jaccard for clarity in output
  const lexical: AxisScore =
    fuzzy.status === "found"
      ? { status: "found", direction: fuzzy.direction, values: { exact_jaccard: fuzzy.values.exact_jaccard, exact_intersect: fuzzy.values.exact_intersect } }
      : fuzzy.status === "below_threshold"
        ? { status: "below_threshold", direction_attempted: fuzzy.direction_attempted, threshold_note: "Exact-J is derived from fuzzy result; pair below fuzzy threshold means exact-J also low." }
        : fuzzy;

  // Aggregate warnings
  for (const axis of [fuzzy, thematic, scribal]) {
    if (axis.status === "tablet_not_in_index") {
      warnings.push(`Tablet not in index: ${axis.missing_tablets.join(", ")}`);
    }
  }

  const verdict = classify(fuzzy, thematic, scribal);

  return {
    tablet_a: a,
    tablet_b: b,
    axes: { lexical, fuzzy, thematic, scribal },
    verdict,
    warnings,
  };
}
