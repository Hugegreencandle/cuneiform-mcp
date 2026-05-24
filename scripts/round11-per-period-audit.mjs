#!/usr/bin/env node
// Round-11 calibration audit: per-period sign2vec + compare_sign_neighbors_across_periods
// (cuneiform-mcp v0.26.0).
//
// Validates that the Neo-Assyrian and Neo-Babylonian period-split
// embeddings (built by scripts/build-sign-embeddings-per-period.mjs) are
// usable, that the periods share a non-trivial common vocabulary, and that
// at least one sign shows non-trivial neighbor-list drift between the two
// embeddings (otherwise the per-period split isn't producing distinguishable
// distributions and that's a corpus-shape finding worth flagging).
//
// Tests:
//   T1. Sanity              — both period embeddings load with > 100 signs each.
//   T2. Common vocabulary   — intersect(NA_signs, NB_signs) > 50 signs.
//   T3. Drift surface       — for at least ONE common sign, NA top-5 and NB top-5
//                             differ by at least 2 signs.

import {
  allPeriodStats,
  commonSigns,
  periodVocab,
} from "../dist/signEmbeddingsPerPeriod.js";
import { compareSignNeighborsAcrossPeriods } from "../dist/compareSignNeighborsAcrossPeriods.js";

const results = [];
function report(name, pass, detail) {
  const tag = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${tag} — ${name}`);
  if (detail) console.log(`  ${detail}`);
  results.push({ name, pass });
}

function header(title) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
}

// ─── Pre-flight: dump per-period stats ─────────────────────────────────────

header("Pre-flight: per-period load stats");
const stats = allPeriodStats();
console.log(
  `  ${"period".padEnd(8)}  ${"loaded".padStart(7)}  ${"signs".padStart(6)}  ${"dim".padStart(4)}  ${"tablets".padStart(8)}  algorithm`,
);
for (const s of stats) {
  console.log(
    `  ${s.period.padEnd(8)}  ${s.loaded.toString().padStart(7)}  ${s.total_signs_indexed.toString().padStart(6)}  ${s.embedding_dim.toString().padStart(4)}  ${s.tablets_in_period.toString().padStart(8)}  ${s.algorithm}` +
      (s.load_error ? `  (${s.load_error})` : ""),
  );
}

// ─── TEST 1: Sanity ───────────────────────────────────────────────────────

header("TEST 1: Sanity — both period embeddings load with > 100 signs each");
const na = stats.find((s) => s.period === "NA");
const nb = stats.find((s) => s.period === "NB");
const sanityOk =
  !!na && !!nb && na.loaded && nb.loaded && na.total_signs_indexed > 100 && nb.total_signs_indexed > 100;
report(
  `both periods load with > 100 signs each`,
  sanityOk,
  sanityOk
    ? `NA: ${na.total_signs_indexed} signs · NB: ${nb.total_signs_indexed} signs`
    : `NA loaded=${na?.loaded} signs=${na?.total_signs_indexed ?? 0} · NB loaded=${nb?.loaded} signs=${nb?.total_signs_indexed ?? 0}`,
);

// ─── TEST 2: Common vocabulary ────────────────────────────────────────────

header("TEST 2: Common vocabulary — intersect(NA, NB) > 50 signs");
const common = commonSigns();
const commonOk = common.length > 50;
report(
  `intersection of NA and NB vocab has > 50 signs`,
  commonOk,
  `intersection size = ${common.length}`,
);

// ─── TEST 3: Drift surface ────────────────────────────────────────────────

header(
  "TEST 3: Drift surface — at least ONE common sign has NA top-5 vs NB top-5 differ by ≥ 2 signs",
);

// Probe a sweep over the common-vocabulary signs to find the strongest
// drift candidates. We rank by max(na_only_count, nb_only_count) =
// "how many top-5 neighbors changed".
const driftRanked = [];
const probeBudget = Math.min(common.length, 400); // cap to keep audit fast
for (let i = 0; i < probeBudget; i++) {
  const sign = common[i];
  const r = compareSignNeighborsAcrossPeriods({ sign, top_k: 5 });
  if (!r.in_na || !r.in_nb) continue;
  const drift = Math.max(r.drift_signals.na_only_count, r.drift_signals.nb_only_count);
  driftRanked.push({ sign, drift, result: r });
}
driftRanked.sort((a, b) => b.drift - a.drift);

const driftOk = driftRanked.length > 0 && driftRanked[0].drift >= 2;
report(
  `at least one common sign has top-5 neighbor-list drift ≥ 2`,
  driftOk,
  driftRanked.length > 0
    ? `probed ${driftRanked.length}/${probeBudget} common signs · max drift = ${driftRanked[0].drift} (sign: ${driftRanked[0].sign})`
    : `no common signs probed`,
);

// ─── Eyeball: top-3 diachronic drift candidates ──────────────────────────

header("Eyeball: top-3 diachronic drift candidates");
for (const { sign, drift, result } of driftRanked.slice(0, 3)) {
  console.log(`\n  sign=${sign} · max(na_only,nb_only)=${drift}`);
  console.log(`    NA top-5: ${result.neighbors_na.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
  console.log(`    NB top-5: ${result.neighbors_nb.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
  console.log(`    common:   [${result.drift_signals.common_neighbors.join(", ")}]`);
  console.log(`    NA-only:  [${result.drift_signals.na_only_neighbors.join(", ")}]`);
  console.log(`    NB-only:  [${result.drift_signals.nb_only_neighbors.join(", ")}]`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(
  `Round-11 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`,
);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

// Suppress unused-binding lint
void periodVocab;

if (results.some((r) => !r.pass)) process.exit(2);
