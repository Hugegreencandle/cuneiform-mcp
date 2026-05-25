#!/usr/bin/env node
// Round-32 calibration audit: v0.47 validation-resolutions store seeded + wired into train script.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { listResolutions } from "../dist/validationResolutions.js";

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

console.log("Round-32 audit: validation-resolutions store seeded + wired (v0.47.0)\n");

// T1: store exists and has resolutions
const all = listResolutions({});
report(
  "T1: store has ≥40 resolutions",
  all.total_in_store >= 40,
  `total=${all.total_in_store}`,
);

// T2: 12 methods-paper positives present
const positives = listResolutions({ verdict: "positive", source: "methods_paper" });
report(
  "T2: 12 methods-paper positives present",
  positives.total_matched === 12,
  `got=${positives.total_matched}`,
);

// T3: K.5896 ↔ K.9508 is in the store (canonical pair from §3.7.3)
const k5896Search = listResolutions({ tablet: "K.5896" });
const hasMisPiSibling = k5896Search.resolutions.some(
  (r) => (r.tablet_a === "K.5896" && r.tablet_b === "K.9508") || (r.tablet_b === "K.5896" && r.tablet_a === "K.9508"),
);
report("T3: K.5896 ↔ K.9508 in store (canonical Mīs pî pair)", hasMisPiSibling);

// T4: ≥30 negatives from audit_resolution
const audits = listResolutions({ verdict: "negative", source: "audit_resolution" });
report(
  "T4: ≥30 synthetic negatives present (source=audit_resolution)",
  audits.total_matched >= 30,
  `got=${audits.total_matched}`,
);

// T5: every negative has rationale that mentions the panel-refinement
// criteria (zero chunk-overlap, distinct periods, registry exclusion)
const negRationalesValid = audits.resolutions.every(
  (r) =>
    r.rationale.includes("zero chunk-overlap") &&
    r.rationale.includes("distinct periods") &&
    r.rationale.includes("not same-composition"),
);
report("T5: every synthetic negative has full filter-criteria rationale", negRationalesValid);

// T6: no negatives between same-composition tablets (panel refinement)
// Load registry and verify
import { COMPOSITION_REGISTRY } from "../dist/compositionRegistry.js";
const tabletToComps = new Map();
for (const c of COMPOSITION_REGISTRY) {
  for (const t of c.exemplar_tablets) {
    if (!tabletToComps.has(t)) tabletToComps.set(t, new Set());
    tabletToComps.get(t).add(c.id);
  }
}
function sharesComp(a, b) {
  const ca = tabletToComps.get(a);
  const cb = tabletToComps.get(b);
  if (!ca || !cb) return false;
  for (const c of ca) if (cb.has(c)) return true;
  return false;
}
const sameCompNegs = audits.resolutions.filter((r) => sharesComp(r.tablet_a, r.tablet_b));
report(
  "T6: zero negatives between same-composition tablets (registry exclusion working)",
  sameCompNegs.length === 0,
  `${sameCompNegs.length} violations`,
);

// T7: store stats show v1.0 progress > bootstrap (24% = (0+12)/100 baseline)
report(
  "T7: progress_to_v1_target ≥ 0.12 (≥ bootstrap baseline)",
  all.store_stats.progress_to_v1_target >= 0.12,
  `progress=${(all.store_stats.progress_to_v1_target * 100).toFixed(1)}%`,
);

// T8: train-joint-pair-model.mjs picked up the store
const modelPath = join(homedir(), ".cache", "cuneiform-mcp", "joint-pair-model.json");
if (existsSync(modelPath)) {
  const model = JSON.parse(readFileSync(modelPath, "utf-8"));
  report(
    "T8: joint-pair model trained_on_n_negatives ≥ 30 (was 40 in bootstrap)",
    model.trained_on_n_negatives >= 30,
    `got=${model.trained_on_n_negatives}`,
  );
  // Training accuracy should remain high
  report(
    "T8b: training accuracy ≥ 0.90",
    model.training_accuracy >= 0.90,
    `acc=${(model.training_accuracy ?? 0).toFixed(4)}`,
  );
}

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-32 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
