#!/usr/bin/env node
// Round-24 calibration audit: bootstrap-warning propagation + cross-tool
// consistency on shared inputs (v0.38.0).
//
// Panel-review claim 43 + Mertens/Lindqvist asks: when multiple tools
// classify the same query (K.5896), they must agree on the top
// composition, and their outputs must surface the registry's bootstrap
// nature so consumers don't infer production quality.
//
// Tests:
//   T1. identify_composition emits REGISTRY_BOOTSTRAP_NOTE_V1
//   T2. score_tablet_completeness emits REGISTRY_BOOTSTRAP_NOTE_V1
//   T3. find_composition_lineage emits REGISTRY_BOOTSTRAP_NOTE_V1
//   T4. damaged_passage_composition_probability emits REGISTRY_BOOTSTRAP_NOTE_V1
//   T5. All 4 tools agree on K.5896 → mis_pi
//   T6. All 4 tools agree on BM.47463 → surpu (Šurpu base)

import { identifyComposition } from "../dist/identifyComposition.js";
import { scoreTabletCompleteness } from "../dist/scoreTabletCompleteness.js";
import { findCompositionLineage } from "../dist/findCompositionLineage.js";
import { damagedPassageCompositionProbability } from "../dist/damagedPassageComposition.js";
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

console.log("Round-24 audit: bootstrap-warning propagation + cross-tool consistency (v0.38.0)\n");

const QUERY1 = "K.5896";
const QUERY2 = "BM.47463";

const r1id = identifyComposition({ tabletId: QUERY1 });
const r1sc = scoreTabletCompleteness({ tabletId: QUERY1 });
const r1cl = findCompositionLineage({ seedTabletId: QUERY1, maxWitnesses: 20 });
const r1dp = damagedPassageCompositionProbability({ tabletId: QUERY1 });

const r2id = identifyComposition({ tabletId: QUERY2 });
const r2sc = scoreTabletCompleteness({ tabletId: QUERY2 });
const r2cl = findCompositionLineage({ seedTabletId: QUERY2, maxWitnesses: 20 });
const r2dp = damagedPassageCompositionProbability({ tabletId: QUERY2 });

console.log("BOOTSTRAP-WARNING PROPAGATION:\n");
report(
  "T1: identify_composition surfaces REGISTRY_BOOTSTRAP_NOTE_V1",
  r1id.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1),
);
report(
  "T2: score_tablet_completeness surfaces REGISTRY_BOOTSTRAP_NOTE_V1",
  r1sc.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1),
);
report(
  "T3: find_composition_lineage surfaces REGISTRY_BOOTSTRAP_NOTE_V1",
  r1cl.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1),
);
report(
  "T4: damaged_passage_composition_probability surfaces REGISTRY_BOOTSTRAP_NOTE_V1",
  r1dp.warnings.includes(REGISTRY_BOOTSTRAP_NOTE_V1),
);

console.log("\nCROSS-TOOL CONSISTENCY:\n");

// T5: K.5896 → mis_pi across all 4 tools
const idTop1 = r1id.candidates[0]?.composition_id;
const scComp1 = r1sc.composition.composition_id;
const clComp1 = r1cl.composition.composition_id;
const dpTop1 = r1dp.candidates[0]?.composition_id;
report(
  "T5a: identify_composition top === mis_pi",
  idTop1 === "mis_pi",
  `got=${idTop1}`,
);
report(
  "T5b: score_tablet_completeness inferred === mis_pi",
  scComp1 === "mis_pi",
  `got=${scComp1}`,
);
report(
  "T5c: find_composition_lineage inferred === mis_pi",
  clComp1 === "mis_pi",
  `got=${clComp1}`,
);
report(
  "T5d: damaged_passage_composition_probability top === mis_pi",
  dpTop1 === "mis_pi",
  `got=${dpTop1}`,
);
report(
  "T5: all 4 tools agree on K.5896 → mis_pi",
  idTop1 === "mis_pi" && scComp1 === "mis_pi" && clComp1 === "mis_pi" && dpTop1 === "mis_pi",
);

// T6: BM.47463 → surpu across all 4
const idTop2 = r2id.candidates[0]?.composition_id;
const scComp2 = r2sc.composition.composition_id;
const clComp2 = r2cl.composition.composition_id;
const dpTop2 = r2dp.candidates[0]?.composition_id;
report(
  "T6: all 4 tools agree on BM.47463 → surpu",
  idTop2 === "surpu" && scComp2 === "surpu" && clComp2 === "surpu" && dpTop2 === "surpu",
  `id=${idTop2} sc=${scComp2} cl=${clComp2} dp=${dpTop2}`,
);

// Summary
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-24 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
