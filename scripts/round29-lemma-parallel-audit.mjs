#!/usr/bin/env node
// Round-29 calibration audit: find_lemma_parallel (v0.44.0).
//
// Cache-free tests for both graceful degradation AND synthetic-cache lookup.

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { findLemmaParallel, _resetForTests } from "../dist/lemmaParallel.js";

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

console.log("Round-29 audit: find_lemma_parallel (v0.44.0)\n");

const cacheDir = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const cachePath = join(cacheDir, "lemma-index.json");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

let backedUp = null;
if (existsSync(cachePath)) {
  backedUp = readFileSync(cachePath, "utf-8");
  unlinkSync(cachePath);
}

// ─── Phase 1: cache missing → graceful degradation ─────────────────────────
console.log("PHASE 1: cache missing\n");
_resetForTests();
const r1 = findLemmaParallel({ tabletId: "K.5896" });
report("T1: warning emitted", r1.warnings.length > 0);
report("T1: cache_loaded === false", r1.index_stats.cache_loaded === false);
report("T1: empty candidates", r1.candidates.length === 0);

// ─── Phase 2: synthetic 4-tablet cache ─────────────────────────────────────
console.log("\nPHASE 2: synthetic cache lookup\n");
const synthetic = {
  version: "1.0.0-synthetic",
  built_at: "2026-05-25T00:00:00Z",
  source: "synthetic-audit",
  entries: {
    "K.5896":  { lemmas: ["ana", "mīs", "pî", "ina", "bīt", "rabû", "ūmu"], n_lemmas: 7 },
    "K.9508":  { lemmas: ["ana", "mīs", "pî", "ina", "bīt"],                n_lemmas: 5 },
    "BM.4321": { lemmas: ["šurpu", "ina", "akkadû", "ūmu"],                  n_lemmas: 4 },
    "K.0001":  { lemmas: ["zip", "zap", "zop"],                              n_lemmas: 3 },
  },
};
writeFileSync(cachePath, JSON.stringify(synthetic, null, 2));
_resetForTests();

const r2 = findLemmaParallel({ tabletId: "K.5896", minJaccard: 0 });
report("T2: cache_loaded === true", r2.index_stats.cache_loaded === true);
report("T2: n_tablets_in_index === 4", r2.index_stats.n_tablets_in_index === 4);
report("T2: query.n_lemmas === 7", r2.query.n_lemmas === 7);
report("T2: 3 candidates (excludes self)", r2.candidates.length === 3);

// K.5896 (7 lemmas) vs K.9508 (5 lemmas): intersection = {ana, mīs, pî, ina, bīt} = 5
// union = 7. Jaccard = 5/7 ≈ 0.714
const k9508cand = r2.candidates.find((c) => c.tablet_id === "K.9508");
report(
  "T3: K.5896 ↔ K.9508 jaccard ≈ 5/7 ≈ 0.714",
  k9508cand && Math.abs(k9508cand.jaccard - 5 / 7) < 1e-6,
  `got=${k9508cand?.jaccard?.toFixed(4)}`,
);
report(
  "T3: K.5896 ↔ K.9508 intersection_size === 5",
  k9508cand?.intersection_size === 5,
);
report(
  "T3: K.5896 ↔ K.9508 union_size === 7",
  k9508cand?.union_size === 7,
);

// BM.4321 has {šurpu, ina, akkadû, ūmu}; intersection with K.5896 = {ina, ūmu} = 2
// union = 7+4-2 = 9; jaccard = 2/9 ≈ 0.222
const bmCand = r2.candidates.find((c) => c.tablet_id === "BM.4321");
report(
  "T4: K.5896 ↔ BM.4321 jaccard ≈ 2/9",
  bmCand && Math.abs(bmCand.jaccard - 2 / 9) < 1e-6,
);

// K.0001 (zip/zap/zop) intersects 0 with K.5896; jaccard = 0
// With minJaccard=0 it should still appear since the candidate has lemmas; but
// jaccard === 0 satisfies the threshold (≥ 0). Verify.
const zeroCand = r2.candidates.find((c) => c.tablet_id === "K.0001");
report(
  "T5: K.0001 (zero-overlap) included when min_jaccard=0",
  zeroCand && zeroCand.intersection_size === 0,
);

// Top candidate should be K.9508 (highest jaccard).
report(
  "T6: candidates sorted desc by jaccard (top === K.9508)",
  r2.candidates[0].tablet_id === "K.9508",
);

// ─── Phase 3: min_jaccard threshold ────────────────────────────────────────
console.log("\nPHASE 3: min_jaccard filter\n");
const r3 = findLemmaParallel({ tabletId: "K.5896", minJaccard: 0.5 });
report(
  "T7: min_jaccard=0.5 → only K.9508 (jaccard 0.714)",
  r3.candidates.length === 1 && r3.candidates[0].tablet_id === "K.9508",
);

// ─── Phase 4: exclude_self toggle ──────────────────────────────────────────
console.log("\nPHASE 4: exclude_self\n");
const r4 = findLemmaParallel({ tabletId: "K.5896", excludeSelf: false, minJaccard: 0 });
report(
  "T8: exclude_self=false → 4 candidates (includes K.5896 itself)",
  r4.candidates.length === 4 && r4.candidates.some((c) => c.tablet_id === "K.5896"),
);
const selfCand = r4.candidates.find((c) => c.tablet_id === "K.5896");
report(
  "T8: K.5896 vs K.5896 jaccard === 1.0",
  selfCand && Math.abs(selfCand.jaccard - 1.0) < 1e-9,
);

// ─── Phase 5: tablet not in index ──────────────────────────────────────────
console.log("\nPHASE 5: unknown tablet\n");
const r5 = findLemmaParallel({ tabletId: "Z.99999999" });
report("T9: unknown tablet → warning + empty candidates", r5.warnings.length > 0 && r5.candidates.length === 0);

// ─── Phase 6: shared_lemmas sample cap ─────────────────────────────────────
console.log("\nPHASE 6: shared_lemmas sample cap\n");
const r6 = findLemmaParallel({ tabletId: "K.5896", minJaccard: 0, maxSharedSampleSize: 2 });
report(
  "T10: shared_lemmas capped at maxSharedSampleSize=2",
  r6.candidates.every((c) => c.shared_lemmas.length <= 2),
);

// Teardown
unlinkSync(cachePath);
if (backedUp) writeFileSync(cachePath, backedUp);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-29 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
