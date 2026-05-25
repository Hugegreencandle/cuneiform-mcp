#!/usr/bin/env node
// Round-37 calibration audit: recommend_validation_target (v0.52.0 chunk-overlap proxy).

import { recommendValidationTarget } from "../dist/recommendValidationTarget.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "../dist/provenanceTags.js";
import { loadResolutionsStore } from "../dist/validationResolutions.js";

let pass = 0;
let fail = 0;
function report(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("Round-37 audit: recommend_validation_target (v0.52.0)\n");

const t0 = Date.now();
const r = recommendValidationTarget({ topK: 10, nAnchorTablets: 50, pairsPerAnchor: 5 });
const elapsed = (Date.now() - t0) / 1000;

console.log(`Elapsed: ${elapsed.toFixed(1)}s`);
console.log(`Candidates returned: ${r.candidates.length}`);
console.log(`Pool stats: ${JSON.stringify(r.pool_stats)}`);
console.log(`v1 progress: ${r.v1_progress.n_positives_in_store} positives in store, ${r.v1_progress.pairs_needed_to_reach_target} to v1.0`);
console.log("");
console.log("Top 5:");
for (const c of r.candidates.slice(0, 5)) {
  console.log(`  ${c.tablet_a.padEnd(15)} ↔ ${c.tablet_b.padEnd(15)}  chunks=${c.chunk_overlap}  pctile=${(c.overlap_percentile * 100).toFixed(0)}%  unc=${c.uncertainty_proxy.toFixed(3)}`);
}
console.log("");

// T1: tool returns candidates
report("T1: ≥1 candidate returned", r.candidates.length >= 1);

// T2: must be fast (< 5s — chunk-overlap proxy version)
report("T2: tool runs in < 5s (fast chunk-overlap proxy)", elapsed < 5, `${elapsed.toFixed(1)}s`);

// T3: candidates sorted by uncertainty_proxy desc
let sortedOK = true;
for (let i = 1; i < r.candidates.length; i++) {
  if (r.candidates[i].uncertainty_proxy > r.candidates[i - 1].uncertainty_proxy) {
    sortedOK = false;
    break;
  }
}
report("T3: candidates sorted by uncertainty_proxy desc (highest first)", sortedOK);

// T4: percentile ∈ [0, 1], uncertainty_proxy ∈ [0, 1], chunk_overlap > 0
const valid = r.candidates.every((c) =>
  c.overlap_percentile >= 0 && c.overlap_percentile <= 1 &&
  c.uncertainty_proxy >= 0 && c.uncertainty_proxy <= 1 &&
  c.chunk_overlap > 0,
);
report("T4: all percentile/uncertainty/overlap in valid ranges", valid);

// T5: uncertainty_proxy === 1 − |2*percentile − 1|
const formulaCorrect = r.candidates.every((c) => Math.abs(c.uncertainty_proxy - (1 - Math.abs(2 * c.overlap_percentile - 1))) < 1e-6);
report("T5: uncertainty_proxy = 1 − |2*percentile − 1|", formulaCorrect);

// T6: top candidate is near median percentile (~50%)
const top = r.candidates[0];
report(
  "T6: top candidate near 50th percentile (high uncertainty)",
  Math.abs(top.overlap_percentile - 0.5) < 0.15,
  `pctile=${(top.overlap_percentile * 100).toFixed(0)}%`,
);

// T7: exclude_already_resolved filter working
const store = loadResolutionsStore();
const storeIds = new Set(store.resolutions.map((res) => res.pair_id));
const overlaps = r.candidates.filter((c) => storeIds.has(c.pair_id));
report(
  "T7: no recommended candidate is already in validation-resolutions store",
  overlaps.length === 0,
  overlaps.length > 0 ? `LEAK: [${overlaps.map((o) => o.pair_id).join(", ")}]` : "",
);

// T8: bootstrap note propagated
report("T8: REGISTRY_BOOTSTRAP_NOTE_V1 surfaced", r.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1));

// T9: v1_progress correctness
const expected = Math.max(0, 100 - store.stats.n_positive - store.stats.bootstrap_positives_from_methods_paper);
report(
  "T9: pairs_needed_to_reach_target correct",
  r.v1_progress.pairs_needed_to_reach_target === expected,
);

// T10: each candidate has rationale
report("T10: every candidate has non-empty rationale", r.candidates.every((c) => c.rationale.length > 0));

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-37 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
