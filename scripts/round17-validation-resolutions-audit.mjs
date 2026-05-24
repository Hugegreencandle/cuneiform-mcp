#!/usr/bin/env node
// Round-17 calibration audit: validation-resolutions store (v0.31.0).
//
// Hypothesis: persistent active-learning feedback closes the v1.0 ≥100-positives
// readiness gate organically as Dane works the prioritize_validation_queue.
//
// Tests:
//   T1. Empty store sanity         — fresh store loads as empty + stats zero.
//   T2. Record + read              — round-trip a positive resolution.
//   T3. Canonical pair_id          — (A,B) and (B,A) collapse to same record.
//   T4. Update semantics           — re-recording overwrites + returns previous.
//   T5. Filter by verdict + source — list_resolutions filtering works.
//   T6. Stats consistency          — n_positive / progress_to_v1_target match.
//   T7. Self-pair refuses          — canonicalPairId throws on A === A.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  recordResolution,
  listResolutions,
  loadResolutionsStore,
  resolutionsCachePath,
  canonicalPairId,
  _resetForTests,
} from "../dist/validationResolutions.js";

let pass = 0;
let fail = 0;
const results = [];
function report(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
  results.push({ name, ok, detail });
}

console.log("Round-17 audit: validation-resolutions store (v0.31.0)\n");

// ─── Setup: clean slate ────────────────────────────────────────────────────
const cachePath = resolutionsCachePath();
let backedUp = null;
if (fs.existsSync(cachePath)) {
  backedUp = fs.readFileSync(cachePath, "utf8");
  fs.unlinkSync(cachePath);
  console.log(`(backed up existing store; will restore after audit)`);
}

// ─── T1: empty store sanity ────────────────────────────────────────────────
console.log("\nT1: empty store sanity");
const empty = loadResolutionsStore();
report(
  "empty store loads with zero counts",
  empty.resolutions.length === 0 &&
    empty.stats.n_total === 0 &&
    empty.stats.n_positive === 0 &&
    empty.stats.bootstrap_positives_from_methods_paper === 12 &&
    empty.stats.v1_target_positives === 100,
  `n_total=${empty.stats.n_total}, bootstrap=${empty.stats.bootstrap_positives_from_methods_paper}, target=${empty.stats.v1_target_positives}`,
);

// ─── T2: record + read ─────────────────────────────────────────────────────
console.log("\nT2: record + read");
const r1 = recordResolution({
  tabletA: "K.5896",
  tabletB: "K.9508",
  verdict: "positive",
  rationale: "Mīs pî sibling — 142-position shared chunk, §3.7.3",
  recordedBy: "audit-T2",
  source: "methods_paper",
  methodsPaperSection: "§3.7.3",
  toolVersion: "0.31.0",
});
report(
  "record returns 'created' action",
  r1.action === "created" && r1.resolution.verdict === "positive" && r1.previous === null,
  `action=${r1.action}, prev=${r1.previous}`,
);
report(
  "store stats updated to n_positive=1",
  r1.store_stats.n_positive === 1 && r1.store_stats.n_total === 1,
);

const listed = listResolutions();
report(
  "list returns the recorded resolution",
  listed.resolutions.length === 1 && listed.resolutions[0].pair_id === "K.5896↔K.9508",
  `pair_id=${listed.resolutions[0]?.pair_id}`,
);

// ─── T3: canonical pair_id ─────────────────────────────────────────────────
console.log("\nT3: canonical pair_id (A,B) === (B,A)");
report(
  "canonicalPairId is order-independent",
  canonicalPairId("K.9508", "K.5896") === canonicalPairId("K.5896", "K.9508"),
);
const r3 = recordResolution({
  tabletA: "K.9508",
  tabletB: "K.5896",
  verdict: "positive",
  rationale: "Re-recording with swapped order — should UPDATE, not create",
  toolVersion: "0.31.0",
});
report(
  "swapped-order record collapses to UPDATE",
  r3.action === "updated" && r3.previous !== null,
  `action=${r3.action}`,
);
const afterSwap = loadResolutionsStore();
report(
  "store still has exactly 1 resolution after swap",
  afterSwap.resolutions.length === 1,
);

// ─── T4: update semantics ──────────────────────────────────────────────────
console.log("\nT4: update semantics");
const r4 = recordResolution({
  tabletA: "K.5896",
  tabletB: "K.9508",
  verdict: "uncertain",
  rationale: "Reverting to uncertain to test update path",
  toolVersion: "0.31.0",
});
report(
  "update returns previous verdict",
  r4.action === "updated" && r4.previous?.verdict === "positive" && r4.resolution.verdict === "uncertain",
  `prev=${r4.previous?.verdict} now=${r4.resolution.verdict}`,
);
report(
  "stats reflect verdict change",
  r4.store_stats.n_positive === 0 && r4.store_stats.n_uncertain === 1,
);

// Restore to positive for downstream tests
recordResolution({
  tabletA: "K.5896",
  tabletB: "K.9508",
  verdict: "positive",
  rationale: "Restoring to positive",
  source: "methods_paper",
  methodsPaperSection: "§3.7.3",
  toolVersion: "0.31.0",
});

// ─── T5: filter by verdict + source ────────────────────────────────────────
console.log("\nT5: filter by verdict + source");
recordResolution({
  tabletA: "BM.47463",
  tabletB: "CBS.6060",
  verdict: "positive",
  rationale: "Šurpu commentary/base sibling",
  source: "methods_paper",
  methodsPaperSection: "§3.7.1",
  toolVersion: "0.31.0",
});
recordResolution({
  tabletA: "K.0001",
  tabletB: "K.0002",
  verdict: "negative",
  rationale: "Synthetic false-positive test case",
  source: "validation_queue",
  toolVersion: "0.31.0",
});

const posOnly = listResolutions({ verdict: "positive" });
report(
  "verdict='positive' filter returns 2",
  posOnly.resolutions.length === 2 && posOnly.total_matched === 2,
  `matched=${posOnly.total_matched}`,
);
const fromQueue = listResolutions({ source: "validation_queue" });
report(
  "source='validation_queue' filter returns 1",
  fromQueue.resolutions.length === 1 && fromQueue.resolutions[0].verdict === "negative",
);
const byTablet = listResolutions({ tablet: "K.5896" });
report(
  "tablet='K.5896' filter returns 1 resolution involving it",
  byTablet.resolutions.length === 1 && byTablet.resolutions[0].pair_id === "K.5896↔K.9508",
);

// ─── T6: stats consistency ─────────────────────────────────────────────────
console.log("\nT6: stats consistency");
const final = loadResolutionsStore();
const expectedProgress = (final.stats.n_positive + 12) / 100;
report(
  "n_positive + bootstrap matches progress",
  Math.abs(final.stats.progress_to_v1_target - expectedProgress) < 1e-9,
  `progress=${final.stats.progress_to_v1_target.toFixed(4)} expected=${expectedProgress.toFixed(4)}`,
);
report(
  "n_by_source sums to n_total",
  Object.values(final.stats.n_by_source).reduce((a, b) => a + b, 0) === final.stats.n_total,
);

// ─── T7: self-pair refuses ─────────────────────────────────────────────────
console.log("\nT7: self-pair refuses");
let threw = false;
try {
  canonicalPairId("K.5896", "K.5896");
} catch {
  threw = true;
}
report("canonicalPairId(A,A) throws", threw);

// ─── Teardown ──────────────────────────────────────────────────────────────
_resetForTests();
if (backedUp !== null) {
  fs.writeFileSync(cachePath, backedUp);
  console.log(`\n(restored prior store)`);
}

// ─── Summary ───────────────────────────────────────────────────────────────
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-17 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
