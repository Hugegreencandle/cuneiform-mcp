#!/usr/bin/env node
// Round-23 calibration audit: versioned registry artifact (v0.37.0).
//
// Tests:
//   T1. Registry loads with version 1.0.0 + license CC-BY-4.0
//   T2. 11 compositions present (5 original + 6 new)
//   T3. Each composition has uri + external_ids + print_editions
//   T4. New compositions: maqlu, enuma_anu_enlil, summa_izbu, summa_alu, barutu, diri_aa
//   T5. Backwards compat: COMPOSITION_REGISTRY array still accessible
//   T6. getCompositionById returns valid entries
//   T7. Curriculum tag preserved (asiputu_kar44 is curriculum, others specific)
//   T8. Exemplar references are non-empty strings
//   T9. Print-editions have all required fields

import { COMPOSITION_REGISTRY, getCompositionById, listCompositions, registryMetadata } from "../dist/compositionRegistry.js";

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

console.log("Round-23 audit: versioned registry artifact (v0.37.0)\n");

// T1
const meta = registryMetadata();
report("registry_version === '1.0.0'", meta.registry_version === "1.0.0", `got=${meta.registry_version}`);
report("license === 'CC-BY-4.0'", meta.license === "CC-BY-4.0");
report("registry_uri non-empty", meta.registry_uri.length > 0, meta.registry_uri);

// T2
report("11 compositions", COMPOSITION_REGISTRY.length === 11, `n=${COMPOSITION_REGISTRY.length}`);

// T3
const haveURI = COMPOSITION_REGISTRY.every((c) => typeof c.uri === "string" && c.uri.length > 0);
const haveExtIds = COMPOSITION_REGISTRY.every((c) => c.external_ids && typeof c.external_ids === "object");
const havePrint = COMPOSITION_REGISTRY.every((c) => Array.isArray(c.print_editions));
report("every composition has uri", haveURI);
report("every composition has external_ids", haveExtIds);
report("every composition has print_editions array", havePrint);

// T4
const newIds = ["maqlu", "enuma_anu_enlil", "summa_izbu", "summa_alu", "barutu", "diri_aa"];
for (const id of newIds) {
  const c = getCompositionById(id);
  report(`new composition '${id}' present`, c !== null, c ? `name=${c.name} exemplars=${c.exemplar_tablets.length}` : "MISSING");
}

// T5
report("listCompositions returns array", Array.isArray(listCompositions()));
report("COMPOSITION_REGISTRY backward-compat", Array.isArray(COMPOSITION_REGISTRY) && COMPOSITION_REGISTRY.length === 11);

// T6
const misPi = getCompositionById("mis_pi");
report("getCompositionById('mis_pi') returns entry", misPi !== null && misPi.name === "Mīs pî");
report("getCompositionById('nonexistent') returns null", getCompositionById("nonexistent") === null);

// T7
const curricula = COMPOSITION_REGISTRY.filter((c) => c.composition_type === "curriculum");
report("exactly 1 curriculum (asiputu_kar44)", curricula.length === 1 && curricula[0].id === "asiputu_kar44");

// T8
const exemplarsValid = COMPOSITION_REGISTRY.every((c) =>
  c.exemplar_tablets.length > 0 && c.exemplar_tablets.every((t) => typeof t === "string" && t.length > 0),
);
report("every composition has ≥1 valid exemplar_tablet", exemplarsValid);

// T9
const peValid = COMPOSITION_REGISTRY.every((c) =>
  c.print_editions.every((pe) =>
    typeof pe.citation === "string" &&
    typeof pe.title === "string" &&
    typeof pe.series === "string" &&
    typeof pe.publisher === "string",
  ),
);
report("every print_edition has citation+title+series+publisher", peValid);

// Summary
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-23 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
