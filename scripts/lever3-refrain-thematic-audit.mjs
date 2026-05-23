#!/usr/bin/env node
// Round-3 calibration audit, Lever 3: refrain-heavy thematic threshold.
//
// Hypothesis: Archetype-3 (refrain-bound liturgical, e.g. Mīs pî) has
// "loose fuzzy + tight thematic" profile because the refrain depresses
// fuzzy-J. If the thematic embedding for refrain-flagged tablets is
// systematically inflated (concentrated vocabulary → inflated cosine), then
// the default thematic cutoff (0.50) is noise-leaky for these candidates and
// should tighten to ~0.70 for cluster formation.
//
// This is a strong no-op CANDIDATE per the round-3 plan — running the same
// sample-based decomposition that closed the v0.18.3 thematic length-bias
// audit as a no-op.

import { findThematicParallel } from "../dist/semanticEmbeddings.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 2500));
};

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

// ─── Test 1: how many refrain-heavy tablets? ─────────────────────────────────
const refrain = allRecs.filter((t) => (t.max_3gram_repeat ?? 0) > 3 && t.in_them_index);
const nonRefrain = allRecs.filter((t) => (t.max_3gram_repeat ?? 0) <= 3 && t.in_them_index);
log("TEST 1: Refrain-flagged corpus distribution", {
  refrain_heavy_count: refrain.length,
  non_refrain_count: nonRefrain.length,
  refrain_fraction: +(refrain.length / (refrain.length + nonRefrain.length)).toFixed(4),
});

if (refrain.length < 20) {
  console.log(`Only ${refrain.length} refrain-flagged tablets — sample is the full set.`);
}

// ─── Test 2: 20-tablet sample of refrain-flagged + matched-sign-count non-refrain ─
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Restrict to ≥100 signs for stable thematic embeddings.
const refrainStable = refrain.filter((t) => t.sign_count >= 100);
const nonRefrainStable = nonRefrain.filter((t) => t.sign_count >= 100);

const rng = mulberry32(20260524);
const refrainSample = [...refrainStable].sort(() => rng() - 0.5).slice(0, 20);
const nonRefrainSample = [...nonRefrainStable].sort(() => rng() - 0.5).slice(0, 20);

function analyzeBucket(records, label) {
  let totalNeighbors50_70 = 0;
  let totalNeighbors70plus = 0;
  let medianMaxCosBucket = [];
  for (const t of records) {
    const r = findThematicParallel(t.id, { topK: 30, minCosine: 0.50 });
    const at50_70 = r.neighbors.filter((n) => n.score >= 0.50 && n.score < 0.70).length;
    const at70plus = r.neighbors.filter((n) => n.score >= 0.70).length;
    totalNeighbors50_70 += at50_70;
    totalNeighbors70plus += at70plus;
    if (r.neighbors.length > 0) medianMaxCosBucket.push(r.neighbors[0].score);
  }
  medianMaxCosBucket.sort((a, b) => a - b);
  const med = medianMaxCosBucket[Math.floor(medianMaxCosBucket.length / 2)] ?? null;
  return {
    bucket: label,
    n: records.length,
    avg_neighbors_50_70: +(totalNeighbors50_70 / records.length).toFixed(2),
    avg_neighbors_70plus: +(totalNeighbors70plus / records.length).toFixed(2),
    median_max_cosine: med != null ? +med.toFixed(4) : null,
  };
}

const refrainAnalysis = analyzeBucket(refrainSample, "refrain-flagged");
const nonRefrainAnalysis = analyzeBucket(nonRefrainSample, "non-refrain");

log("TEST 2: Thematic-neighbor distribution comparison (n=20 each, ≥100 signs)", {
  refrain: refrainAnalysis,
  non_refrain: nonRefrainAnalysis,
});

// ─── Test 3: hypothesis — if refrain-flagged tablets have *more* 0.50-0.70
//     neighbors than non-refrain, that's the noise-inflation pattern.
//     If they have *fewer* or the same, the threshold doesn't need tuning. ───
const noiseInflation =
  refrainAnalysis.avg_neighbors_50_70 - nonRefrainAnalysis.avg_neighbors_50_70;
const tightInflation =
  refrainAnalysis.avg_neighbors_70plus - nonRefrainAnalysis.avg_neighbors_70plus;

log("TEST 3: Threshold-tuning hypothesis check", {
  noise_band_delta_0_50_to_0_70: +noiseInflation.toFixed(2),
  tight_band_delta_0_70plus: +tightInflation.toFixed(2),
  interpretation:
    Math.abs(noiseInflation) > 3
      ? "Refrain tablets have substantially MORE 0.50-0.70 neighbors than non-refrain — supports threshold tightening"
      : "No substantial difference in 0.50-0.70 band — refrain flag does NOT inflate noise; tightening would lose recall without gaining precision",
});

// ─── Test 4: spot-check a known refrain-cluster seed (K.5896 Mīs pî) ─────────
log("TEST 4: Spot-check K.5896 (known refrain-bound Mīs pî)", "");
const k5896 = findThematicParallel("K.5896", { topK: 15, minCosine: 0.50 });
console.log(`K.5896 thematic neighbors (min_cos=0.50, top-15):`);
for (const n of k5896.neighbors) {
  console.log(`  ${n.id.padEnd(20)}  cos=${n.score.toFixed(4)}`);
}

const inMidBand = k5896.neighbors.filter((n) => n.score < 0.70).length;
const inHighBand = k5896.neighbors.filter((n) => n.score >= 0.70).length;
console.log(`\n  in 0.50-0.70: ${inMidBand} · in ≥0.70: ${inHighBand}`);

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Lever 3 decomposition complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
