#!/usr/bin/env node
// Round-3 untested-tool audit: find_orthographic_outliers_in_prefix.
//
// Risk: tablets with smaller signatures (~50-100 signs) have less-stable LLR
// profiles. Their cosine-to-centroid is noisy. They may surface as outliers
// not because of orthographic difference but because of statistical noise
// from small sample sizes.
//
// Test: probe K and BM prefixes. Compare sign_count + signature_size
// distributions of the surfaced outliers vs the cohort. If outliers are
// systematically smaller than the cohort median, it's a sign-count artifact.

import { findOrthographicOutliers } from "../dist/orthographicOutliers.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 3000));
};

for (const prefix of ["K", "BM"]) {
  log(`Prefix ${prefix}`, "");
  const r = findOrthographicOutliers({
    prefixFilter: prefix,
    minSignCount: 50,
    maxTabletsToScan: 500,
    topNOutliers: 20,
  });
  console.log(`Cohort size: ${r.summary.cohort_size}`);
  console.log(`Mean cosine to centroid: ${r.summary.mean_cosine_to_centroid.toFixed(4)}`);
  console.log(`Median: ${r.summary.median_cosine_to_centroid.toFixed(4)}`);
  console.log(`Stdev: ${r.summary.stdev_cosine_to_centroid.toFixed(4)}`);
  console.log(`Most typical tablets:`);
  for (const t of r.summary.most_typical_tablets) {
    console.log(`  ${t.tablet_id.padEnd(20)} cos=${t.signature_cosine_to_centroid.toFixed(4)}`);
  }
  console.log(`\nTop-20 outliers (lowest cosine):`);
  console.log(`  ${"tablet_id".padEnd(20)} ${"sign_count".padStart(10)} ${"sig_size".padStart(8)} ${"cos".padStart(8)} distinctive`);
  for (const o of r.outliers) {
    const distSigns = o.distinctive_signs.slice(0, 3).map((d) => d.sign).join(",");
    console.log(`  ${o.tablet_id.padEnd(20)} ${String(o.sign_count).padStart(10)} ${String(o.signature_size).padStart(8)} ${o.signature_cosine_to_centroid.toFixed(4).padStart(8)} ${distSigns}`);
  }

  // Distribution check: are outliers smaller than cohort median?
  const outlierSignCounts = r.outliers.map((o) => o.sign_count);
  const outlierSigSizes = r.outliers.map((o) => o.signature_size);
  const sortedSC = [...outlierSignCounts].sort((a, b) => a - b);
  const sortedSS = [...outlierSigSizes].sort((a, b) => a - b);
  const medianOutlierSC = sortedSC[Math.floor(sortedSC.length / 2)];
  const medianOutlierSS = sortedSS[Math.floor(sortedSS.length / 2)];

  console.log(`\nOutlier sign_count: min=${Math.min(...outlierSignCounts)}, median=${medianOutlierSC}, max=${Math.max(...outlierSignCounts)}`);
  console.log(`Outlier sig_size:   min=${Math.min(...outlierSigSizes)}, median=${medianOutlierSS}, max=${Math.max(...outlierSigSizes)}`);
}

// ─── Sign-count threshold sweep on K prefix ──────────────────────────────────
log("Sign-count threshold sweep on K prefix", "");
for (const minSC of [50, 80, 100, 150, 200]) {
  const r = findOrthographicOutliers({
    prefixFilter: "K",
    minSignCount: minSC,
    maxTabletsToScan: 500,
    topNOutliers: 10,
  });
  const sortedSC = [...r.outliers.map((o) => o.sign_count)].sort((a, b) => a - b);
  const med = sortedSC[Math.floor(sortedSC.length / 2)] ?? 0;
  const min = sortedSC[0] ?? 0;
  console.log(`  min_sign_count=${minSC}  cohort=${r.summary.cohort_size}  outlier_sign_count_min=${min}  median=${med}  top1=${r.outliers[0]?.tablet_id ?? "—"} (sc=${r.outliers[0]?.sign_count ?? "—"}, cos=${r.outliers[0]?.signature_cosine_to_centroid.toFixed(4) ?? "—"})`);
}

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Lever-5 orthographic outliers audit complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
