#!/usr/bin/env node
// Round-12 calibration audit: register-matched per-period sign2vec +
// compare_sign_neighbors_register_matched (cuneiform-mcp v0.27.0).
//
// Closes the v0.26 honest-caveat thread: how much of the 0.94/5 mean
// mixed-register top-5 drift survives when register is held constant?
//
// Tests:
//   T1. Build sanity        — all 6 (register, period) caches load with
//                             a plausible sign count.
//   T2. Sample-size honesty — report per-bucket tablet counts; flag any
//                             bucket with < 500 tablets (small-sample
//                             warning, NOT a fail).
//   T3. Drift comparison    — for ≥10 common signs in divination, compute
//                             register-matched-top-5-drift, report the
//                             mean, and compare to v0.26's 0.94/5
//                             mixed-register baseline.
//   T4. Headline signs      — for ABZ480, ABZ411, ABZ342 (v0.26's
//                             "diachronic candidates"), compare
//                             register-matched drift vs mixed-register
//                             drift. Document whether they shrink, stay
//                             similar, or grow.

import {
  allBucketStats,
  commonSignsForRegister,
  ALL_REGISTERS,
  ALL_PERIODS,
} from "../dist/signEmbeddingsRegisterMatched.js";
import { compareSignNeighborsRegisterMatched } from "../dist/compareSignNeighborsRegisterMatched.js";
import {
  periodStats as mixedPeriodStats,
  periodHasSign as mixedPeriodHasSign,
  periodRankNeighbors as mixedPeriodRankNeighbors,
} from "../dist/signEmbeddingsPerPeriod.js";

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

// v0.26 baseline. Documented in RELEASE-v0.26.md:
//   "Mean common-neighbors at top-5 = 0.94 / 5."
//   → mean top-5 drift = 5 - 0.94 = 4.06 / 5.
// We compare against THIS expected drift baseline.
const V026_MEAN_DRIFT_TOP5 = 5 - 0.94;

// ─── Pre-flight: dump per-(register, period) stats ────────────────────────

header("Pre-flight: per-bucket load stats");
const stats = allBucketStats();
console.log(
  `  ${"register".padEnd(11)}  ${"period".padEnd(7)}  ${"loaded".padStart(7)}  ${"signs".padStart(6)}  ${"dim".padStart(4)}  ${"tablets".padStart(8)}  ${"min_occ".padStart(7)}  algorithm`,
);
for (const s of stats) {
  console.log(
    `  ${s.register.padEnd(11)}  ${s.period.padEnd(7)}  ${s.loaded.toString().padStart(7)}  ${s.total_signs_indexed.toString().padStart(6)}  ${s.embedding_dim.toString().padStart(4)}  ${s.tablets_in_bucket.toString().padStart(8)}  ${s.min_occurrences.toString().padStart(7)}  ${s.algorithm}` +
      (s.load_error ? `  (${s.load_error})` : ""),
  );
}

// ─── TEST 1: Build sanity ─────────────────────────────────────────────────

header(
  "TEST 1: Build sanity — all (register, period) caches load with > 50 signs each",
);
const allLoaded = stats.every((s) => s.loaded);
const allSignsOk = stats.every((s) => s.total_signs_indexed > 50);
const sanityOk = allLoaded && allSignsOk;
const fails = stats.filter((s) => !s.loaded || s.total_signs_indexed <= 50);
report(
  `all ${stats.length} buckets load with > 50 signs`,
  sanityOk,
  sanityOk
    ? `bucket signs indexed: ${stats.map((s) => `${s.register}/${s.period}=${s.total_signs_indexed}`).join(", ")}`
    : `failed buckets: ${fails.map((s) => `${s.register}/${s.period} loaded=${s.loaded} signs=${s.total_signs_indexed}`).join(", ")}`,
);

// ─── TEST 2: Sample-size honesty ──────────────────────────────────────────

header("TEST 2: Sample-size honesty — per-bucket tablet counts");
let smallBuckets = 0;
for (const s of stats) {
  if (s.tablets_in_bucket < 500) {
    smallBuckets++;
    console.log(
      `  ⚠ ${s.register}/${s.period} has ${s.tablets_in_bucket} tablets (< 500) — small-sample noise expected.`,
    );
  } else {
    console.log(`  ✓ ${s.register}/${s.period} has ${s.tablets_in_bucket} tablets (≥ 500).`);
  }
}
// This test is documentation, not a fail-gate. We pass if every bucket
// was at least populated (> 0 tablets).
const populated = stats.every((s) => s.tablets_in_bucket > 0);
report(
  `every bucket has ≥ 1 tablet (small-sample warnings logged separately, not a fail)`,
  populated,
  populated
    ? `populated buckets: ${stats.length}/${stats.length}, with ${smallBuckets} flagged as small-sample (< 500 tablets)`
    : `${stats.filter((s) => s.tablets_in_bucket === 0).length} buckets have 0 tablets — register pattern mismatch?`,
);

// ─── TEST 3: Drift comparison ─────────────────────────────────────────────

header(
  `TEST 3: Drift comparison — register-matched top-5 mean drift vs v0.26 mixed-register mean drift = ${V026_MEAN_DRIFT_TOP5.toFixed(3)}/5`,
);

const driftSummaryByRegister = {};
for (const register of ALL_REGISTERS) {
  const common = commonSignsForRegister(register);
  if (common.length < 10) {
    console.log(`  ⚠ register=${register}: only ${common.length} common signs across NA and NB — drift comparison skipped for this register.`);
    driftSummaryByRegister[register] = { tested: 0, mean_matched_drift: null, mean_mixed_drift: null };
    continue;
  }

  // Probe up to all common signs (cap to keep audit fast).
  const probeBudget = Math.min(common.length, 400);
  const driftsMatched = [];
  const driftsMixed = []; // mixed-register drift for the SAME signs (paired sample).
  let mixedAvailableCount = 0;
  for (let i = 0; i < probeBudget; i++) {
    const sign = common[i];
    const r = compareSignNeighborsRegisterMatched({ sign, register, top_k: 5 });
    if (!r.in_na || !r.in_nb) continue;
    if (r.neighbors_na.length !== 5 || r.neighbors_nb.length !== 5) continue;
    driftsMatched.push(r.register_matched_drift_topk);
    if (
      r.comparison_with_mixed_register.mixed_register_drift_topk !== null &&
      r.comparison_with_mixed_register.register_matched_drift_topk !== null
    ) {
      driftsMixed.push(r.comparison_with_mixed_register.mixed_register_drift_topk);
      mixedAvailableCount++;
    }
  }

  const mean = driftsMatched.length > 0
    ? driftsMatched.reduce((a, b) => a + b, 0) / driftsMatched.length
    : null;
  const meanMixedPaired = driftsMixed.length > 0
    ? driftsMixed.reduce((a, b) => a + b, 0) / driftsMixed.length
    : null;

  driftSummaryByRegister[register] = {
    tested: driftsMatched.length,
    mean_matched_drift: mean,
    mean_mixed_drift_same_signs: meanMixedPaired,
    mixed_available: mixedAvailableCount,
  };

  console.log(
    `  register=${register.padEnd(11)} · tested=${driftsMatched.length.toString().padStart(4)} common signs · mean matched top-5 drift=${mean !== null ? mean.toFixed(3) : "n/a"}/5 · paired mixed-register mean=${meanMixedPaired !== null ? meanMixedPaired.toFixed(3) : "n/a"}/5 (on same ${mixedAvailableCount} signs)`,
  );
}

// Pass condition: at least ONE register has ≥ 10 tested common signs and
// produced a finite mean. The "is matched < mixed" claim is reported but
// not gated — it's the empirical finding we ship regardless of direction.
const driftAnyValid = Object.values(driftSummaryByRegister).some((d) => d.tested >= 10 && d.mean_matched_drift !== null);
report(
  `at least one register produced ≥ 10 paired (NA, NB) drift samples`,
  driftAnyValid,
  `register summaries: ${Object.entries(driftSummaryByRegister).map(([r, d]) => `${r}:tested=${d.tested},matched_mean=${d.mean_matched_drift !== null ? d.mean_matched_drift.toFixed(3) : "n/a"}`).join(" · ")}`,
);

// ─── Empirical headline finding ───────────────────────────────────────────

header("Empirical headline finding — register-matched vs mixed-register drift");
console.log(`  v0.26 mixed-register mean top-5 drift = ${V026_MEAN_DRIFT_TOP5.toFixed(3)}/5 (across ALL ~387 common signs)`);
console.log("");
for (const [register, d] of Object.entries(driftSummaryByRegister)) {
  if (d.tested === 0 || d.mean_matched_drift === null) continue;
  const matched = d.mean_matched_drift;
  const pairedMixed = d.mean_mixed_drift_same_signs;
  const drop = pairedMixed !== null ? pairedMixed - matched : null;
  const pctDrop = pairedMixed !== null && pairedMixed > 0 ? (100 * drop / pairedMixed) : null;
  console.log(`  register=${register}:`);
  console.log(`    register-matched top-5 mean drift = ${matched.toFixed(3)}/5  (n=${d.tested})`);
  if (pairedMixed !== null) {
    console.log(`    paired mixed-register top-5 mean   = ${pairedMixed.toFixed(3)}/5  (same ${d.mixed_available} signs)`);
    console.log(`    drift attributable to register     = ${drop.toFixed(3)}/5 ${pctDrop !== null ? `(${pctDrop.toFixed(1)}% reduction)` : ""}`);
  } else {
    console.log(`    paired mixed-register baseline unavailable for this sample.`);
  }
  // Interpretation per spec:
  //   < 0.5/5  → register-confound hypothesis CONFIRMED (matched drift collapsed)
  //   0.5–0.7  → ambiguous: partial confound, partial diachronic signal
  //   > 0.7/5  → diachronic axis is REAL and substantial
  let verdict;
  if (matched < 0.5) verdict = "register-confound CONFIRMED (matched drift collapsed below 0.5/5)";
  else if (matched < 0.7) verdict = "MIXED: partial register confound + partial residual diachronic signal";
  else verdict = "diachronic axis is REAL and SUBSTANTIAL (matched drift > 0.7/5)";
  console.log(`    methods-paper verdict: ${verdict}`);
  console.log("");
}

// ─── TEST 4: Headline sign comparison ─────────────────────────────────────

header(
  "TEST 4: Headline signs (ABZ480, ABZ411, ABZ342) — register-matched vs mixed-register drift",
);
const HEADLINE_SIGNS = ["ABZ480", "ABZ411", "ABZ342"];
const headlineResults = [];
let headlinePass = true;
for (const sign of HEADLINE_SIGNS) {
  console.log(`\n  sign=${sign}`);

  // Mixed-register baseline (v0.26).
  const mixedNa = mixedPeriodStats("NA").loaded && mixedPeriodHasSign("NA", sign);
  const mixedNb = mixedPeriodStats("NB").loaded && mixedPeriodHasSign("NB", sign);
  let mixedDriftTopK = null;
  if (mixedNa && mixedNb) {
    const na = mixedPeriodRankNeighbors("NA", sign, 5, 0) ?? [];
    const nb = mixedPeriodRankNeighbors("NB", sign, 5, 0) ?? [];
    if (na.length === 5 && nb.length === 5) {
      const naSet = new Set(na.map((x) => x.sign));
      let nbOnly = 0;
      for (const x of nb) if (!naSet.has(x.sign)) nbOnly++;
      mixedDriftTopK = nbOnly;
      console.log(`    v0.26 mixed-register NA top-5: ${na.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
      console.log(`    v0.26 mixed-register NB top-5: ${nb.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
      console.log(`    v0.26 mixed-register top-5 drift = ${mixedDriftTopK}/5`);
    }
  } else {
    console.log(`    v0.26 mixed-register: sign not present in both periods.`);
  }

  // Register-matched (try every register that contains the sign).
  let bestMatched = null;
  for (const register of ALL_REGISTERS) {
    const r = compareSignNeighborsRegisterMatched({ sign, register, top_k: 5 });
    if (!r.in_na || !r.in_nb) {
      console.log(`    register=${register}: not in both buckets (in_na=${r.in_na}, in_nb=${r.in_nb}).`);
      continue;
    }
    console.log(`    register=${register}/NA top-5: ${r.neighbors_na.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
    console.log(`    register=${register}/NB top-5: ${r.neighbors_nb.map((n) => `${n.sign}(${n.cosine.toFixed(3)})`).join(", ")}`);
    console.log(`    register=${register} matched top-5 drift = ${r.register_matched_drift_topk}/5`);
    if (bestMatched === null || r.register_matched_drift_topk < bestMatched.drift) {
      bestMatched = { register, drift: r.register_matched_drift_topk };
    }
  }

  if (bestMatched !== null && mixedDriftTopK !== null) {
    const delta = mixedDriftTopK - bestMatched.drift;
    let interpretation;
    if (delta > 0) interpretation = `SHRANK by ${delta} (register=${bestMatched.register} matched drift = ${bestMatched.drift}/5, attributable to register)`;
    else if (delta === 0) interpretation = `STAYED SIMILAR (matched ${bestMatched.drift}/5 ≈ mixed ${mixedDriftTopK}/5 — diachronic axis dominates)`;
    else interpretation = `GREW by ${-delta} (matched ${bestMatched.drift}/5 > mixed ${mixedDriftTopK}/5 — small-sample noise OR register IS the diachronic axis)`;
    console.log(`    >> verdict: drift ${interpretation}`);
    headlineResults.push({ sign, mixed: mixedDriftTopK, matched_best: bestMatched.drift, register_best: bestMatched.register, delta });
  } else {
    headlinePass = false;
    headlineResults.push({ sign, mixed: mixedDriftTopK, matched_best: null, register_best: null, delta: null });
    console.log(`    >> verdict: insufficient data (could not run paired comparison).`);
  }
}

report(
  `all ${HEADLINE_SIGNS.length} headline signs produced a paired (mixed, matched) comparison`,
  headlinePass,
  `results: ${headlineResults.map((h) => `${h.sign}:mixed=${h.mixed}/5,matched=${h.matched_best !== null ? h.matched_best : "n/a"}/5${h.register_best ? `@${h.register_best}` : ""}`).join(" · ")}`,
);

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(
  `Round-12 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`,
);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

// Suppress unused-binding lint
void ALL_PERIODS;

if (results.some((r) => !r.pass)) process.exit(2);
