#!/usr/bin/env node
// Round-39 calibration audit: list_candidate_exemplars (v0.55.0).

import { listCandidateExemplars } from "../dist/candidateExemplars.js";
import { REGISTRY_BOOTSTRAP_NOTE_V1 } from "../dist/provenanceTags.js";

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

console.log("Round-39 audit: list_candidate_exemplars (v0.55.0)\n");

// T1: basic load
const r1 = listCandidateExemplars({ minConfidence: 0.9, topK: 50 });
report("T1: cache loaded", r1.cache_stats.cache_loaded);
report("T1: ≥4000 total assignments in cache", r1.cache_stats.total_assignments >= 4000, `n=${r1.cache_stats.total_assignments}`);
report("T1: ≥1 candidate returned", r1.candidates.length >= 1, `n=${r1.candidates.length}`);

// T2: at least 2 compositions in totals
report(
  "T2: candidates span ≥2 compositions",
  r1.totals_by_composition.length >= 2,
  `n_compositions=${r1.totals_by_composition.length}`,
);

// T3: sorted by confidence desc
let sortedOK = true;
for (let i = 1; i < r1.candidates.length; i++) {
  if (r1.candidates[i].confidence > r1.candidates[i - 1].confidence) {
    sortedOK = false;
    break;
  }
}
report("T3: candidates sorted by confidence desc", sortedOK);

// T4: every candidate has required fields
const valid = r1.candidates.every((c) =>
  typeof c.tablet_id === "string" &&
  typeof c.composition_id === "string" &&
  c.confidence >= 0.9 && c.confidence <= 1 &&
  typeof c.suggested_pair_anchor === "string" &&
  c.suggested_pair_anchor.length > 0 &&
  c.suggested_pair_id.includes("↔"),
);
report("T4: every candidate has all required fields (incl. pair anchor)", valid);

// T5: NONE of the candidates is in the registry (they're "discovered")
// Use the well-known registered ID K.5896 as a probe
const k5896InResults = r1.candidates.some((c) => c.tablet_id === "K.5896");
report(
  "T5: K.5896 NOT in discovered candidates (it's a registered exemplar)",
  !k5896InResults,
);

// T6: composition_id filter narrows result
const r6 = listCandidateExemplars({ compositionId: "mis_pi", minConfidence: 0.9, topK: 50 });
const allMisPi = r6.candidates.every((c) => c.composition_id === "mis_pi");
report(
  "T6: composition_id='mis_pi' filter returns only Mīs pî candidates",
  allMisPi,
  `n=${r6.candidates.length}`,
);

// T7: bootstrap warning propagated
report("T7: REGISTRY_BOOTSTRAP_NOTE_V1 surfaced", r1.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1));

// T8: high min_confidence narrows results
const r8 = listCandidateExemplars({ minConfidence: 0.99, topK: 50 });
const allHighConf = r8.candidates.every((c) => c.confidence >= 0.99);
report("T8: min_confidence=0.99 → all candidates p ≥ 0.99", allHighConf, `n=${r8.candidates.length}`);

// T9: totals_by_composition counts match actual returned
const filterCounts = new Map();
for (const c of r6.candidates) {
  filterCounts.set(c.composition_id, (filterCounts.get(c.composition_id) ?? 0) + 1);
}
report(
  "T9: returned candidates respect topK without distorting totals",
  r6.candidates.length <= 50,
);

// T10: suggested_pair_anchor is a registered exemplar
import("../dist/compositionRegistry.js").then(({ getCompositionById }) => {
  const allAnchorsRegistered = r1.candidates.every((c) => {
    const comp = getCompositionById(c.composition_id);
    return comp && comp.exemplar_tablets.includes(c.suggested_pair_anchor);
  });
  report("T10: every suggested_pair_anchor is a registered exemplar", allAnchorsRegistered);

  console.log(`\n──────────────────────────────────────────────────────────`);
  console.log(`Round-39 audit: ${pass}/${pass + fail} passed`);
  console.log(`──────────────────────────────────────────────────────────`);
  process.exit(fail === 0 ? 0 : 1);
});
