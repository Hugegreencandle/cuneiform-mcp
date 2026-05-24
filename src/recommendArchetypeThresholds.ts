// v0.26.0 — recommend_archetype_thresholds MCP tool.
//
// Surfaces the per-archetype threshold matrix from archetypeThresholds.ts as a
// callable tool. Three usage modes:
//
//   1. archetype=<name>  → return that one profile
//   2. list_all=true     → return all 7 profiles
//   3. seed_tablet_id=ID → classify the seed via the documented heuristic,
//                          return the inferred archetype's profile + evidence
//
// Mode precedence: explicit `archetype` wins, then `seed_tablet_id`, then
// `list_all`. If none are provided the tool returns all 7 (same as list_all).

import {
  ALL_ARCHETYPES,
  ARCHETYPE_THRESHOLD_MATRIX,
  classifySeedArchetype,
  corpusAvailableForClassification,
  type Archetype,
  type ArchetypeClassificationEvidence,
  type ArchetypeThresholdProfile,
} from "./archetypeThresholds.js";

export type RecommendArchetypeThresholdsOptions = {
  archetype?: Archetype;
  list_all?: boolean;
  seed_tablet_id?: string;
};

export type RecommendArchetypeThresholdsResult = {
  profiles: ArchetypeThresholdProfile[];
  classified_archetype?: Archetype;
  classification_evidence?: ArchetypeClassificationEvidence;
  warnings: string[];
};

function isArchetype(value: unknown): value is Archetype {
  return (
    typeof value === "string" && (ALL_ARCHETYPES as readonly string[]).includes(value)
  );
}

export function recommendArchetypeThresholds(
  opts: RecommendArchetypeThresholdsOptions,
): RecommendArchetypeThresholdsResult {
  const warnings: string[] = [];

  // Mode 1: explicit archetype.
  if (opts.archetype !== undefined) {
    if (!isArchetype(opts.archetype)) {
      warnings.push(
        `unknown archetype '${String(opts.archetype)}' — expected one of: ${ALL_ARCHETYPES.join(", ")}. Returning all 7 profiles.`,
      );
      return {
        profiles: ALL_ARCHETYPES.map((a) => ARCHETYPE_THRESHOLD_MATRIX[a]),
        warnings,
      };
    }
    return {
      profiles: [ARCHETYPE_THRESHOLD_MATRIX[opts.archetype]],
      warnings,
    };
  }

  // Mode 2: seed classification.
  if (opts.seed_tablet_id !== undefined && opts.seed_tablet_id.trim() !== "") {
    if (!corpusAvailableForClassification()) {
      warnings.push(
        "anomaly-surface corpus unavailable; cannot classify seed. Returning all 7 profiles for manual selection.",
      );
      return {
        profiles: ALL_ARCHETYPES.map((a) => ARCHETYPE_THRESHOLD_MATRIX[a]),
        warnings,
      };
    }
    const classification = classifySeedArchetype(opts.seed_tablet_id.trim());
    if (!classification) {
      warnings.push(
        `seed '${opts.seed_tablet_id}' could not be classified (likely not in corpus). Returning all 7 profiles for manual selection.`,
      );
      return {
        profiles: ALL_ARCHETYPES.map((a) => ARCHETYPE_THRESHOLD_MATRIX[a]),
        warnings,
      };
    }
    const profile = ARCHETYPE_THRESHOLD_MATRIX[classification.classified_archetype];
    warnings.push(
      "classification heuristic is best-effort, not authoritative. Verify by inspecting evidence.signals_fired and the recommended profile's rationale.",
    );
    return {
      profiles: [profile],
      classified_archetype: classification.classified_archetype,
      classification_evidence: classification.evidence,
      warnings,
    };
  }

  // Mode 3: default to list_all (also explicit list_all=true).
  return {
    profiles: ALL_ARCHETYPES.map((a) => ARCHETYPE_THRESHOLD_MATRIX[a]),
    warnings,
  };
}
