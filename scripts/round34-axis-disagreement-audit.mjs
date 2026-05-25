#!/usr/bin/env node
// Round-34 calibration audit: compute_axis_disagreement (v0.49.0).

import { computeAxisDisagreement } from "../dist/computeAxisDisagreement.js";
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

console.log("Round-34 audit: compute_axis_disagreement (v0.49.0)\n");

// T1: K.5896 (zero lemmas) → lemma_silent
const r1 = computeAxisDisagreement({ tabletId: "K.5896" });
console.log(`  K.5896: agreement=${r1.agreement}`);
console.log(`    comp_axis → ${r1.composition_axis.top_composition_id} (conf=${r1.composition_axis.confidence?.toFixed(3)})`);
console.log(`    lemma_axis → n_lemmas=${r1.lemma_axis.n_lemmas}`);
report(
  "T1: K.5896 → agreement='lemma_silent' (zero lemmas at eBL)",
  r1.agreement === "lemma_silent",
);
report(
  "T1: K.5896 composition_axis correctly classifies as mis_pi",
  r1.composition_axis.top_composition_id === "mis_pi",
);

// T2: K.2987.B (420 lemmas, largest in cache) → should have data on both axes
const r2 = computeAxisDisagreement({ tabletId: "K.2987.B" });
console.log(`\n  K.2987.B: agreement=${r2.agreement}`);
console.log(`    comp_axis → ${r2.composition_axis.top_composition_id} (conf=${r2.composition_axis.confidence?.toFixed(3)})`);
console.log(`    lemma_axis → n_lemmas=${r2.lemma_axis.n_lemmas} inferred=${r2.lemma_axis.inferred_composition_id} via=${r2.lemma_axis.inferred_via_neighbor}`);
report(
  "T2: K.2987.B both axes report data",
  r2.lemma_axis.n_lemmas > 0 && r2.composition_axis.top_composition_id !== null,
);
report(
  "T2: K.2987.B agreement in {agree, disagree} (not silent)",
  r2.agreement === "agree" || r2.agreement === "disagree",
);

// T3: BM.47463 (181 lemmas) — both axes should fire
const r3 = computeAxisDisagreement({ tabletId: "BM.47463" });
console.log(`\n  BM.47463: agreement=${r3.agreement}`);
console.log(`    comp_axis → ${r3.composition_axis.top_composition_id}`);
console.log(`    lemma_axis → inferred=${r3.lemma_axis.inferred_composition_id}`);
report(
  "T3: BM.47463 lemma axis has data + classifies",
  r3.lemma_axis.n_lemmas > 0 && r3.lemma_axis.inferred_composition_id !== null,
);

// T4: rationale is non-empty
report("T4: every result has non-empty rationale", r1.rationale.length > 0 && r2.rationale.length > 0 && r3.rationale.length > 0);

// T5: REGISTRY_BOOTSTRAP_NOTE_V1 propagated
report("T5: REGISTRY_BOOTSTRAP_NOTE_V1 surfaced", r2.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1));

// T6: Z.99999999 (unknown) → graceful degradation:
//   - lemma_axis n_lemmas=0 (not in lemma cache)
//   - composition_axis confidence=0 (no signs match any pool centroid)
//   - agreement='lemma_silent' (both axes returned data structures but
//     lemma side has no signal; composition side has technically a top
//     entry but at conf=0)
const r6 = computeAxisDisagreement({ tabletId: "Z.99999999" });
report(
  "T6: unknown tablet → lemma_silent + composition confidence=0 (graceful)",
  r6.agreement === "lemma_silent" &&
    r6.lemma_axis.n_lemmas === 0 &&
    r6.composition_axis.confidence === 0,
);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-34 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
