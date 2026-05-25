// v0.38.0 — Shared provenance tags for cross-tool bootstrap-warning
// propagation.
//
// Panel-review claim 43 + Mertens/Lindqvist concern: when a tool's output
// depends on the v0.29 Bayesian fusion model (trained on n=12 bootstrap
// positives), the consumer must know — silently inheriting bootstrap
// quality through a downstream tool is the misuse-by-association failure
// mode the panel flagged.
//
// Tools that read the v0.29 model should emit the
// `BOOTSTRAP_WARNING_V029` string in their `warnings[]` envelope field.
// Tools that depend on the v0.32 registry should emit
// `REGISTRY_BOOTSTRAP_NOTE` to signal that the registry is a small
// hand-curated set, not a production classifier.

import { loadJointPairModel } from "./jointPairScore.js";

export const BOOTSTRAP_WARNING_V029_TEMPLATE = (nPos: number, nNeg: number) =>
  `v0.29 fusion model: bootstrap quality, NOT production (trained on n=${nPos} positives + n=${nNeg} synthetic negatives). v1.0 gate requires ≥100 confirmed positives — accumulate via prioritize_validation_queue + record_validation_resolution.`;

export const REGISTRY_BOOTSTRAP_NOTE_V1 =
  "v1.0.0 composition registry: 11 hand-curated compositions anchored in methods-paper §§3.1, 3.4, 3.7.1-3.7.3, 3.9.1, 3.11, 3.24. Classification probabilities are calibrated against these exemplars only — tablets outside the represented compositions will receive low confidence across all candidates rather than 'unclassified'.";

let _v029WarningCached: string | null = null;

export function getV029BootstrapWarning(): string | null {
  if (_v029WarningCached !== null) return _v029WarningCached;
  const model = loadJointPairModel();
  if (!model) return null;
  const w = BOOTSTRAP_WARNING_V029_TEMPLATE(
    model.trained_on_n_positives,
    model.trained_on_n_negatives,
  );
  _v029WarningCached = w;
  return w;
}

export function appendBootstrapWarnings(
  warnings: string[],
  flags: { v029_fusion?: boolean; registry_v1?: boolean } = {},
): string[] {
  const out = warnings.slice();
  if (flags.v029_fusion) {
    const w = getV029BootstrapWarning();
    if (w) out.push(w);
  }
  if (flags.registry_v1) {
    out.push(REGISTRY_BOOTSTRAP_NOTE_V1);
  }
  return out;
}
