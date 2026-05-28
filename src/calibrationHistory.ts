// v0.61.0 — Calibration-history registry for per-axis thresholds.
//
// Hand-curated registry of every calibration round that set or moved a
// threshold currently in force on one of the 6 axes consumed by the joint-
// pair model. The values here MUST be cross-checked against the source docs
// listed in `source_doc` whenever a calibration round ships — staleness is
// the explicit failure mode this module guards against.
//
// Consumed by explain_pair_score (v0.61.0) to answer "WHY did the model
// give this verdict?" Each axis verdict, threshold, and decision boundary
// is traced back to the calibration round that established it.
//
// Pure data — no runtime dependencies beyond the FeatureName union.

import type { FeatureName } from "./jointPairScore.js";

export type CalibrationMilestone = {
  /** Release version where this threshold was established or last moved. */
  version: string;
  /** ISO date of the release / calibration round. */
  date: string;
  /** Concrete threshold value(s) in force after this round, with field name. */
  thresholds: Record<string, number | string>;
  /** Path under docs/ that documents this calibration round. */
  source_doc: string;
  /** Short prose: what triggered the calibration, what evidence drove it. */
  rationale: string;
};

export type AxisCalibration = {
  /** Feature name in the joint-pair model. */
  axis: FeatureName;
  /** Plain-language description of what this axis measures. */
  measures: string;
  /** Source tool / module producing the raw signal. */
  source: string;
  /** Ordered milestones (oldest → newest). */
  milestones: CalibrationMilestone[];
};

// ─── Per-axis registry ─────────────────────────────────────────────────────

export const CALIBRATION_REGISTRY: Record<FeatureName, AxisCalibration> = {
  lex_jaccard: {
    axis: "lex_jaccard",
    measures: "Exact sign-trigram Jaccard between the two tablets.",
    source: "compareTabletPair.axes.lexical (projected from fuzzyParallels.exact_jaccard).",
    milestones: [
      {
        version: "v0.4.0",
        date: "2026-05-13",
        thresholds: { trigram_window: 3, score_formula: "intersection / union" },
        source_doc: "docs/SPEC-v0.7.0-discovery-engine.md",
        rationale:
          "Initial spec: sliding 3-sign trigrams indexed corpus-wide; pair-Jaccard from inverted-index lookup. Establishes the lexical axis.",
      },
      {
        version: "v0.18.3",
        date: "2026-05-16",
        thresholds: { run_bonus_multiplier: 0.5, score_formula: "jaccard × (1 + 0.5 × runFactor)" },
        source_doc: "docs/v0.18.3-parallel-text-run-bonus.md",
        rationale:
          "find_parallel_text gets the v0.18.2 contiguous-run bonus. Manuscript-section siblings (K.2798 ↔ K.5896, both Mīs pî family) promoted within top-15. Top-1 rankings on 4 confirmed sibling pairs unchanged — the calibration tightens mid-rank precision without disturbing high-confidence pairs.",
      },
    ],
  },

  fuzzy_jaccard: {
    axis: "fuzzy_jaccard",
    measures: "1-substitution-tolerant trigram Jaccard with contiguous-run bonus.",
    source: "compareTabletPair.axes.fuzzy (findFuzzyParallels).",
    milestones: [
      {
        version: "v0.17.0",
        date: "2026-05-15",
        thresholds: { hamming_tolerance: 1, default_topK: 50 },
        source_doc: "docs/SPEC-v0.13.0-discovery-engine-v2.md",
        rationale:
          "Hamming-1 trigram tolerance: any pair sharing 2-of-3 signs at the same trigram position counts as a fuzzy intersection. Recovers orthographic-variant siblings invisible to exact-J.",
      },
      {
        version: "v0.18.2",
        date: "2026-05-16",
        thresholds: { run_bonus_multiplier: 0.5, min_significant_run: 11 },
        source_doc: "docs/v0.18.2-calibration-audit.md",
        rationale:
          "Contiguous-run bonus introduced. Bi-orphan threshold relaxed 0.60 → 0.50 (corpus-wide bi-orphan count 167 → 11). Calibrated against the 4 confirmed-sibling pairs in the methods paper §3.4.",
      },
      {
        version: "v0.18.19",
        date: "2026-05-19",
        thresholds: { join_candidate_min: 0.5, physical_join_min: 0.7, commentary_run_min: 100 },
        source_doc: "docs/v0.18.19-calibration-round3-commentary-verdict.md",
        rationale:
          "Decision-tree calibration: fuzzy_J≥0.5 + scribal≥0.7 → same_composition_same_scribe; ≥0.7 + scribal≥0.7 → physical_join_candidate; long contiguous run (≥100) + Commentary genre tag → commentary_quotes_base_text (resolves BM.47463 ↔ CBS.6060 Šurpu pair, fuzzy_J=0.81, run=108).",
      },
    ],
  },

  thematic_cosine: {
    axis: "thematic_cosine",
    measures: "Random-indexing semantic-embedding cosine similarity between tablet vectors.",
    source: "compareTabletPair.axes.thematic (findThematicParallel via semanticEmbeddings).",
    milestones: [
      {
        version: "v0.15.0",
        date: "2026-05-14",
        thresholds: { random_indexing_dims: 1000, embedding_mode: "C" },
        source_doc: "docs/SPEC-v0.13.0-discovery-engine-v2.md",
        rationale:
          "Random-indexing Mode C: 1000-dim sparse-ternary vectors trained on lemma co-occurrence within tablet windows. Tablet vector = mean of lemma vectors.",
      },
      {
        version: "v0.18.2",
        date: "2026-05-16",
        thresholds: { bi_orphan_threshold: 0.5, thematic_only_threshold: 0.7 },
        source_doc: "docs/v0.18.2-calibration-audit.md",
        rationale:
          "Bi-orphan threshold dropped 0.60 → 0.50 after K.2798 ↔ Si.776 (confirmed Bīt salāʾ mê siblings) scored 0.5587 — below the original 0.60 cutoff. Distribution audit confirmed manuscript-siblings with mild distributional divergence sit in the 0.50–0.59 band.",
      },
      {
        version: "v0.18.19",
        date: "2026-05-19",
        thresholds: { thematic_only_verdict_min: 0.7, weak_signal_min: 0.5 },
        source_doc: "docs/v0.18.19-calibration-round3-refrain-thematic.md",
        rationale:
          "thematic≥0.7 with low fuzzy/lexical signals classified as 'thematic_only' (paraphrase / bilingual / alt-spelling candidate). thematic≥0.5 alone counts as weak cross-axis signal.",
      },
      {
        version: "v0.70.0",
        date: "2026-05-29",
        thresholds: { thematic_only_scribal_override_min: 0.6 },
        source_doc: "docs/upgrade-plan-post-v0.69.md",
        rationale:
          "§3.4 soft-spot 2: thematic_only now yields to a strong scribal signal — when scribal_cos≥0.6 the verdict becomes same_scribe_different_composition instead. Recovers K.17494 ↔ K.47 (scribal=0.697, 3‰ under the ≥0.7 high-confidence cut, substitution_lift_z=−8.76) previously discarded as thematic_only.",
      },
    ],
  },

  scribal_cosine: {
    axis: "scribal_cosine",
    measures: "Log-likelihood-ratio scribal-signature cosine similarity.",
    source: "compareTabletPair.axes.scribal (findSameScribeCandidates via scribalFingerprint).",
    milestones: [
      {
        version: "v0.18.0",
        date: "2026-05-15",
        thresholds: { signature_dims: 50, min_overlap_count: 1 },
        source_doc: "docs/v0.18-scribal-validation.md",
        rationale:
          "Per-tablet scribal signature = top-50 LLR-scored sign-bigrams (orthographic + ductus fingerprint). Cosine over the shared support set.",
      },
      {
        version: "v0.18.19",
        date: "2026-05-19",
        thresholds: { same_scribe_min: 0.7, weak_scribal_min: 0.4 },
        source_doc: "docs/v0.18.19-calibration-round3-signature-evolution.md",
        rationale:
          "scribal_cos≥0.7 gates 'same scribe' verdicts. Below 0.5 + high fuzzy → 'same_composition_different_scribe'. Calibrated against the methods-paper §3.7.3 K.5896 ↔ K.2761 (same scribe, different subseries) anchor.",
      },
      {
        version: "v0.70.0",
        date: "2026-05-29",
        thresholds: { same_composition_different_scribe_max: 0.7, taper_band: "0.5–0.7 → medium confidence" },
        source_doc: "docs/upgrade-plan-post-v0.69.md",
        rationale:
          "§3.4 soft-spot 1: same_composition_different_scribe widened from scribal_cos<0.5 to <0.7 with confidence tapering (high <0.5, medium in 0.5–0.7). Recovers BM.38552 ↔ K.9270 (scribal_cos=0.503, fuzzy_J=0.404, 102-sign contiguous run) which fell through the 0.5–0.7 gap to weak_relationship while the joint-pair model gave P=0.94.",
      },
    ],
  },

  substitution_lift_z: {
    axis: "substitution_lift_z",
    measures: "Baseline-normalized z-score of sign-substitution lift (sign2vec aggregated to pair).",
    source: "computeLexicalSubstitutionLift.",
    milestones: [
      {
        version: "v0.24.0",
        date: "2026-05-22",
        thresholds: { score_formula: "sign2vec cosine, mean over substituted-sign pairs" },
        source_doc: "docs/RELEASE-v0.24.md",
        rationale:
          "compute_lexical_substitution_score (claim 30): sign2vec PPMI+SVD aggregated to tablet-pair level. Cashes out the v0.23 sign-level semantic embeddings on the pair axis.",
      },
      {
        version: "v0.25.0",
        date: "2026-05-22",
        thresholds: { sigma_separation_anchor: 2.24, anchor_pair: "K.5896 ↔ K.9508" },
        source_doc: "docs/RELEASE-v0.25.md",
        rationale:
          "Baseline-normalized lift z-score: per-pair lift compared against a random-pair baseline distribution. +2.24σ separation on the K.5896 ↔ K.9508 sibling anchor establishes that the z-score is informative independent of raw lift magnitude.",
      },
    ],
  },

  composition_assignment_match: {
    axis: "composition_assignment_match",
    measures: "Composition-registry agreement: 1.0 = same composition, 0.7 = parent-child, 0.5 = same curriculum family, 0 = no match.",
    source: "v0.54 composition-assignments cache + composition registry parent_curriculum lookup.",
    milestones: [
      {
        version: "v0.54.0",
        date: "2026-05-24",
        thresholds: { confidence_floor: 0.5, cache_file: "composition-assignments.json" },
        source_doc: "docs/DISCOVERED-EXEMPLARS-v0.54.md",
        rationale:
          "200-tablet corpus scan yielded 20 discovered candidate exemplars outside the methods-paper registry — 16 Mīs pî + 4 Udug-ḫul. Establishes the composition-assignment cache as a usable feature source.",
      },
      {
        version: "v0.56.0",
        date: "2026-05-25",
        thresholds: {
          same_composition_score: 1.0,
          parent_child_score: 0.7,
          same_curriculum_score: 0.5,
          training_acc_delta: "+0.0192 (0.9423 → 0.9615)",
        },
        source_doc: "docs/CASE-STUDY-K5896.md",
        rationale:
          "Added as the joint-pair model's 6th feature. Lifts training accuracy 0.9423 → 0.9615; the BM.77056 ↔ K.5896 misclassification (curriculum-vs-centerpiece, methods paper §3.22 + §3.28) moves from p=0.046 → 0.328 — +28pp toward correct without flipping the verdict, because the held-out test set's hardest case is genuinely ambiguous.",
      },
    ],
  },
};

// ─── Model-level calibration history (decision boundary) ──────────────────

export type ModelCalibrationMilestone = {
  version: string;
  date: string;
  thresholds: Record<string, number | string>;
  source_doc: string;
  rationale: string;
};

export const MODEL_CALIBRATION_HISTORY: ModelCalibrationMilestone[] = [
  {
    version: "v0.29.0",
    date: "2026-05-23",
    thresholds: {
      positive_min: 0.7,
      negative_max: 0.3,
      training_n_positives: 12,
      training_accuracy: 0.981,
    },
    source_doc: "docs/RELEASE-v0.29.md",
    rationale:
      "Logistic-regression bootstrap on 5 axes. P≥0.7 → positive, ≤0.3 → negative, else uncertain. Trained on 12 methods-paper labeled positives + 40 synthetic random-pair negatives.",
  },
  {
    version: "v0.50.0",
    date: "2026-05-25",
    thresholds: { calibration_method: "Platt scaling", ECE_lift: "1× → 58×" },
    source_doc: "docs/v0.58-platt-vs-isotonic-finding.md",
    rationale:
      "Platt scaling applied to v0.30 lacuna fusion scores (methods paper §3.31, claim 51). Closes the §3.25 overconfidence finding. Subsequent v0.58 cross-check shows isotonic regression is the better choice when ranking discriminability matters more than aggregate calibration.",
  },
  {
    version: "v0.51.0",
    date: "2026-05-25",
    thresholds: { held_out_accuracy: 0.9, AUC: 0.67, test_n: 10 },
    source_doc: "docs/RELEASE-v0.51.md",
    rationale:
      "Held-out train/test split established (methods paper §3.32, claim 52). 90% test accuracy with 1 misclassification (BM.77056 ↔ K.5896) — predictable from the §3.22 curriculum-vs-centerpiece ambiguity of that pair.",
  },
  {
    version: "v0.56.0",
    date: "2026-05-25",
    thresholds: { training_accuracy: 0.9615, n_features: 6 },
    source_doc: "docs/CASE-STUDY-K5896.md",
    rationale:
      "Added composition_assignment_match as 6th feature. Training accuracy 0.9423 → 0.9615; methods paper §3.36, claim 56.",
  },
];

// ─── Lookup helpers ────────────────────────────────────────────────────────

export function getAxisCalibration(axis: FeatureName): AxisCalibration {
  return CALIBRATION_REGISTRY[axis];
}

export function getModelCalibrationHistory(): ModelCalibrationMilestone[] {
  return MODEL_CALIBRATION_HISTORY;
}

/**
 * Pick the calibration milestone whose thresholds apply to a given raw value
 * on a given axis. Heuristic: return the most-recent milestone (last in the
 * `milestones` array). Future-proofing — leaves room for value-aware lookups
 * (e.g. "which threshold band does fuzzy_J=0.42 fall into?").
 */
export function currentMilestoneFor(axis: FeatureName): CalibrationMilestone {
  const ms = CALIBRATION_REGISTRY[axis].milestones;
  return ms[ms.length - 1];
}
