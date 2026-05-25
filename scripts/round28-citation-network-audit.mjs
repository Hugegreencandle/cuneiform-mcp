#!/usr/bin/env node
// Round-28 calibration audit: extract_citation_network (v0.43.0).

import { extractCitationNetwork } from "../dist/citationNetwork.js";

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

console.log("Round-28 audit: extract_citation_network (v0.43.0)\n");

// T1: basic network build
const r1 = extractCitationNetwork({ topK: 10 });
report(
  "T1: scholars array non-empty",
  r1.scholars.length > 0,
  `n_scholars=${r1.network_stats.n_scholars}`,
);
report(
  "T1: parallels array non-empty",
  r1.parallels.length > 0,
  `n_parallels=${r1.network_stats.n_parallels}`,
);
report(
  "T1: parallel count >= 30 (15 biblical + 17 meso)",
  r1.network_stats.n_parallels >= 30,
  `got=${r1.network_stats.n_parallels}`,
);

// T2: every parallel has a source_dataset
const allHaveDataset = r1.parallels.every((p) => p.source_dataset === "biblical" || p.source_dataset === "mesopotamian");
report("T2: every parallel has source_dataset", allHaveDataset);

// T3: scholars have parallels_supported
const scholarsValid = r1.scholars.every((s) => Array.isArray(s.parallels_supported) && s.parallels_supported.length === s.n_parallels);
report("T3: scholars.parallels_supported.length === n_parallels", scholarsValid);

// T4: co-citation edges have weight ≥ 1 and ordered scholar_a < scholar_b
const edgesValid = r1.co_citation_edges.every((e) => e.weight >= 1 && e.scholar_a < e.scholar_b && e.shared_parallels.length === e.weight);
report("T4: edges valid (weight ≥ 1, alphabetic order, weight === shared_parallels.length)", edgesValid);

// T5: top_scholars_by_parallels sorted desc by n_parallels
let sortedOk = true;
for (let i = 1; i < r1.top_scholars_by_parallels.length; i++) {
  if (r1.top_scholars_by_parallels[i].n_parallels > r1.top_scholars_by_parallels[i - 1].n_parallels) {
    sortedOk = false;
    break;
  }
}
report("T5: top_scholars sorted desc", sortedOk);

// T6: top_co_citation_pairs sorted desc by weight
let weightSortedOk = true;
for (let i = 1; i < r1.top_co_citation_pairs.length; i++) {
  if (r1.top_co_citation_pairs[i].weight > r1.top_co_citation_pairs[i - 1].weight) {
    weightSortedOk = false;
    break;
  }
}
report("T6: top_co_citation_pairs sorted desc", weightSortedOk);

// T7: filter_to_scholar narrows network
if (r1.scholars.length > 0) {
  const focusScholar = r1.top_scholars_by_parallels[0].id;
  const r7 = extractCitationNetwork({ filterToScholar: focusScholar });
  report(
    `T7: filter_to_scholar='${focusScholar}' returns only that scholar`,
    r7.scholars.length === 1 && r7.scholars[0].id === focusScholar,
  );
  report(
    "T7: filtered edges only involve focus scholar",
    r7.co_citation_edges.every((e) => e.scholar_a === focusScholar || e.scholar_b === focusScholar),
  );
} else {
  report("T7: filter_to_scholar skipped (no scholars)", true);
}

// T8: filter_to_parallel narrows network
if (r1.parallels.length > 0) {
  const focusParallel = r1.parallels[0].id;
  const r8 = extractCitationNetwork({ filterToParallel: focusParallel });
  report(
    `T8: filter_to_parallel='${focusParallel}' returns only that parallel`,
    r8.parallels.length === 1 && r8.parallels[0].id === focusParallel,
  );
}

// T9: bridge_scholars have n_parallels ≥ min_bridge_reach
const r9 = extractCitationNetwork({ minBridgeReach: 2 });
const bridgesOk = r9.bridge_scholars.every((s) => s.n_parallels >= 2);
report("T9: bridge scholars all have n_parallels ≥ 2", bridgesOk);

// T10: network_stats internally consistent
const ns = r1.network_stats;
report(
  "T10: max_parallels_per_scholar === top scholar's n_parallels",
  r1.top_scholars_by_parallels[0]?.n_parallels === ns.max_parallels_per_scholar,
);

// Substantive summary
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Substantive findings (§3.27):`);
console.log(`  Scholars in network:        ${ns.n_scholars}`);
console.log(`  Parallels:                  ${ns.n_parallels}`);
console.log(`  Co-citation edges:          ${ns.n_co_citation_edges}`);
console.log(`  Bridge scholars (≥3):       ${ns.n_bridge_scholars}`);
if (r1.top_scholars_by_parallels.length > 0) {
  const top = r1.top_scholars_by_parallels[0];
  console.log(`  Top scholar:                ${top.author_year} (${top.n_parallels} parallels)`);
}
if (r1.top_co_citation_pairs.length > 0) {
  const t = r1.top_co_citation_pairs[0];
  console.log(`  Top co-citation:            ${t.scholar_a} ↔ ${t.scholar_b} (weight ${t.weight})`);
}

console.log(`──────────────────────────────────────────────────────────`);
console.log(`Round-28 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
