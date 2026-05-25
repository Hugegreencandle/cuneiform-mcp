#!/usr/bin/env node
// Round-38 calibration audit: corpus composition-assignment discovery (v0.54).

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

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

console.log("Round-38 audit: corpus composition-assignment discovery (v0.54)\n");

const cachePath = join(homedir(), ".cache", "cuneiform-mcp", "composition-assignments.json");
if (!existsSync(cachePath)) {
  console.log("  cache not built — run scripts/build-corpus-composition-assignments.mjs first");
  process.exit(1);
}

const data = JSON.parse(readFileSync(cachePath, "utf-8"));
const registry = JSON.parse(readFileSync(join(process.cwd(), "data", "compositions-v1.json"), "utf-8"));

const registered = new Set();
for (const comp of registry.compositions) {
  for (const t of comp.exemplar_tablets) registered.add(t);
}

const entries = Object.entries(data.assignments);
const highConf = entries.filter(([, a]) => a.confidence > 0.9);
const discovered = highConf.filter(([t]) => !registered.has(t));

console.log(`Tablets scanned: ${entries.length}`);
console.log(`High-confidence (>0.9): ${highConf.length}`);
console.log(`Discovered (not in registry): ${discovered.length}`);
console.log("");
console.log("Top 5 discovered:");
for (const [tid, a] of discovered.slice(0, 5)) {
  console.log(`  ${tid.padEnd(15)} → ${a.top_composition_id.padEnd(15)} p=${a.confidence.toFixed(3)} period=${a.period || "?"}`);
}
console.log("");

// T1: cache loads with expected shape
report("T1: cache loads with build_stats + assignments", data.build_stats && data.assignments);

// T2: build_stats internally consistent
report(
  "T2: build_stats.targets_processed === assignments count",
  data.build_stats.targets_processed === entries.length,
);

// T3: every assignment has required fields
const allValid = entries.every(([, a]) =>
  typeof a.top_composition_id === "string" &&
  typeof a.confidence === "number" &&
  a.confidence >= 0 && a.confidence <= 1,
);
report("T3: every assignment has top_composition_id + valid confidence", allValid);

// T4: ≥10 high-confidence assignments
report("T4: ≥10 high-confidence (>0.9) assignments in 200-tablet scan", highConf.length >= 10);

// T5: discovered candidates exist (registry-expansion signal)
report("T5: ≥5 discovered candidates outside registry", discovered.length >= 5);

// T6: K.5896 in registered (sanity)
const k5896 = data.assignments["K.5896"];
report(
  "T6: K.5896 assignment is_in_exemplar_list === true",
  k5896 && k5896.is_in_exemplar_list === true,
);

// T7: discovered candidates split across multiple compositions
const discoveredComps = new Set(discovered.map(([, a]) => a.top_composition_id));
report(
  "T7: discovered candidates span ≥2 distinct compositions",
  discoveredComps.size >= 2,
  `compositions=[${[...discoveredComps].join(", ")}]`,
);

// T8: cache build was fast (sanity check)
report(
  "T8: build elapsed < 60s (efficient scanning)",
  data.build_stats.elapsed_seconds < 60,
  `${data.build_stats.elapsed_seconds}s`,
);

// T9: composition_type recorded
const allHaveType = entries.every(([, a]) =>
  a.composition_type === "specific_composition" || a.composition_type === "curriculum",
);
report("T9: every assignment has composition_type", allHaveType);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-38 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
