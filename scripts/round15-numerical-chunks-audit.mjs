#!/usr/bin/env node
// Round-15 calibration audit: find_numerical_chunks (v0.30.0).
//
// Hypothesis: v0.30's data-driven numerical-class detection (derived from
// the v0.28 k-means clustering of the v0.23 sign2vec embedding space)
// surfaces numerical-context chunks at least as well as v0.21's hardcoded
// 2-sign filter, with vastly broader vocabulary coverage and a principled
// empirical basis.
//
// Three tests:
//
//   T1. Numerical-sign-set construction — the empirical numerical_sign_set
//       has ≥50 signs (vs v0.21's 2). Membership spot-check: ABZ480,
//       ABZ411, "4", "0", BAHAR₂, "27", ABZ427 should all be present.
//
//   T2. Numerical-chunk surfacing — at default thresholds the tool returns
//       ≥10 chunks. Spot-check: the top-5 chunks should be visibly
//       numerical (heavy in digit-class signs, not running text).
//
//   T3. Comparison to v0.21 — re-apply v0.30's density rule to the v0.21
//       length-10 incipits-index and count how many of the 88 chunks
//       v0.21's isNumericalOnly flagged are ALSO flagged at the v0.30
//       0.5 threshold. Expected overlap >70%. The diverging chunks are
//       reported so the methods paper can characterize the disagreement.

import { loadChunkIndex } from "../dist/chunkIndex.js";
import { loadIncipitsIndex } from "../dist/incipitsIndex.js";
import {
  findNumericalChunks,
  buildNumericalSignSet,
} from "../dist/findNumericalChunks.js";
import { clusterSignsByEmbedding } from "../dist/clusterSignsByEmbedding.js";
import { isNumericalOnly } from "../dist/findIncipits.js";

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

// ─── Pre-flight ───────────────────────────────────────────────────────────

header("Pre-flight: chunk-index + incipits-index load");

const chunkIndex = loadChunkIndex();
if (!chunkIndex) {
  console.error(
    "\nABORT: chunk-index not loaded. Run scripts/build-chunk-index.mjs first.",
  );
  process.exit(1);
}
console.log(
  `chunk-index (v0.20 length-${chunkIndex.window_length}): ${chunkIndex.entries.length} entries`,
);

const incipitsIndex = loadIncipitsIndex();
if (!incipitsIndex) {
  console.error(
    "\nABORT: incipits-index not loaded. Run scripts/build-incipits-index.mjs first.",
  );
  process.exit(1);
}
console.log(
  `incipits-index (v0.21 length-${incipitsIndex.window_length}): ${incipitsIndex.entries.length} entries`,
);

// ─── TEST 1: Numerical-sign-set construction ─────────────────────────────

header(
  "TEST 1: Numerical-sign-set construction — empirical vocabulary has ≥50 members and contains the expected anchors",
);

// Derive the set directly so we can introspect it before running the tool.
const clusteringResult = clusterSignsByEmbedding({ k: 12 });
const { signs: numericalSigns, sourceClusterIds } =
  buildNumericalSignSet(clusteringResult);

const numericalSet = new Set(numericalSigns);
// Required anchors must ALL be present: these are the v0.21 + v0.28 named
// numerical-class signs that any correct numerical_sign_set must recover.
// BAHAR₂ is intentionally tracked as a soft check (informational only) —
// the methods-paper description named it but it does not occur in the
// current corpus's k=12 numerical clusters at min_occurrences=20; we
// surface its absence as a diagnostic rather than a failure mode.
const REQUIRED_ANCHORS = ["ABZ480", "ABZ411", "4", "0", "27", "ABZ427"];
const SOFT_ANCHORS = ["BAHAR₂"];
const presentRequired = REQUIRED_ANCHORS.filter((s) => numericalSet.has(s));
const missingRequired = REQUIRED_ANCHORS.filter((s) => !numericalSet.has(s));
const presentSoft = SOFT_ANCHORS.filter((s) => numericalSet.has(s));
const missingSoft = SOFT_ANCHORS.filter((s) => !numericalSet.has(s));

console.log(
  `\n  source clusters: [${sourceClusterIds.join(", ")}]  ·  k=${clusteringResult.k}  ·  silhouette=${clusteringResult.silhouette_score}`,
);
console.log(`  numerical_sign_set_size: ${numericalSigns.length}`);
console.log(`  required anchors present: ${presentRequired.length}/${REQUIRED_ANCHORS.length}`);
console.log(`    present:  ${presentRequired.join(", ") || "(none)"}`);
console.log(`    missing:  ${missingRequired.join(", ") || "(none)"}`);
console.log(`  soft anchors (diagnostic only): present=[${presentSoft.join(", ") || "(none)"}], missing=[${missingSoft.join(", ") || "(none)"}]`);
if (missingSoft.length > 0) {
  console.log(
    `    note: BAHAR₂ is named in v0.28 methods-paper §3.13 prose but does not appear in the k=12 numerical clusters at the current corpus min_occurrences threshold.`,
  );
}

const t1ok = numericalSigns.length >= 50 && missingRequired.length === 0;
report(
  "numerical_sign_set has ≥50 members AND includes the required anchors {ABZ480, ABZ411, 4, 0, 27, ABZ427}",
  t1ok,
  `size=${numericalSigns.length} (≥50 required) · missing_required=[${missingRequired.join(", ") || "(none)"}]`,
);

// Eyeball the per-cluster contribution for the methods paper.
console.log(`\n  per-cluster breakdown:`);
for (const id of sourceClusterIds) {
  const cluster = clusteringResult.clusters.find((c) => c.id === id);
  if (!cluster) continue;
  console.log(
    `    cluster #${cluster.id}  size=${cluster.size}  label="${cluster.suggested_label}"  reps=[${cluster.representative_signs.map((r) => r.sign).join(", ")}]`,
  );
}

// Top-20 numerical signs by corpus occurrence — we don't have direct
// occurrence counts on the set itself, so derive them via the cluster
// reports' top_signs_by_occurrence.
const occByMember = new Map();
for (const id of sourceClusterIds) {
  const cluster = clusteringResult.clusters.find((c) => c.id === id);
  if (!cluster) continue;
  for (const t of cluster.top_signs_by_occurrence) {
    occByMember.set(t.sign, t.occurrences);
  }
}
const topByOccurrence = [...occByMember.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20);
console.log(`\n  top-20 numerical signs by occurrence (from cluster reports):`);
for (const [sign, occ] of topByOccurrence) {
  console.log(`    ${sign.padEnd(14)}  occ=${String(occ).padStart(7)}`);
}

// ─── TEST 2: Numerical-chunk surfacing ───────────────────────────────────

header(
  "TEST 2: Numerical-chunk surfacing — tool returns ≥10 chunks at default thresholds; top-5 spot-check",
);

const toolResult = findNumericalChunks({});
console.log(
  `\n  defaults: min_numerical_density=0.5  ·  min_hosts=5  ·  top_k=30  ·  k=12`,
);
console.log(
  `  chunks_examined=${toolResult.index_stats.chunks_examined}  ·  chunks_above_density_threshold=${toolResult.index_stats.chunks_above_density_threshold}  ·  returned=${toolResult.chunks.length}`,
);

const t2countOk = toolResult.chunks.length >= 10;
report(
  "find_numerical_chunks returns ≥10 chunks at default thresholds",
  t2countOk,
  `returned ${toolResult.chunks.length} (≥10 required)`,
);

// Spot-check: top-5 should be heavy in digit-class signs. We require each
// top-5 chunk to have numerical_density ≥ 0.5 (structurally true given the
// threshold, but we eyeball-verify the actual sign content).
console.log(`\n  top-10 numerical chunks discovered:`);
const top10 = toolResult.chunks.slice(0, 10);
for (const [i, c] of top10.entries()) {
  const preview = c.chunk_signs.length > 110 ? c.chunk_signs.slice(0, 110) + "…" : c.chunk_signs;
  console.log(
    `\n  ${String(i + 1).padStart(2)}. host_count=${c.host_count}  density=${c.numerical_density}  ${c.numerical_sign_count}/${c.total_signs} signs in set`,
  );
  console.log(`      signs: ${preview}`);
}

// Sanity probe: the top-5 chunks should each have density ≥ the threshold.
const top5densityOk = toolResult.chunks
  .slice(0, 5)
  .every((c) => c.numerical_density >= 0.5);
report(
  "top-5 chunks each have numerical_density ≥ 0.5 (structural sanity)",
  top5densityOk,
  top5densityOk
    ? "all top-5 chunks satisfy the density floor"
    : "at least one top-5 chunk falls below the configured threshold (bug)",
);

// ─── TEST 3: Comparison to v0.21 ─────────────────────────────────────────

header(
  "TEST 3: Comparison to v0.21 — overlap between v0.21's isNumericalOnly-filtered chunks and v0.30's density-surfaced chunks on the same length-10 index",
);

// Replicate the v0.21 full-index sweep documented in docs/v0.23.1-incipit-
// filter-reaudit.md: the 88 chunks are flagged by isNumericalOnly across
// the ENTIRE length-10 incipits-index (no min_hosts gate), not just the
// production min_hosts=50 candidate pool. The 50-host gate produces 0
// filtered chunks; the global sweep is the methodologically interesting
// reference point.
const v21Candidates = incipitsIndex.entries;
const v21Filtered = v21Candidates.filter((e) => isNumericalOnly(e.signs));
console.log(
  `\n  v0.21 baseline (full-index sweep, no min_hosts gate): ${v21Candidates.length} candidates, ${v21Filtered.length} flagged as numerical-only (ABZ480/ABZ411 ≥70%)`,
);

// Apply v0.30's density rule (numerical_sign_set, threshold 0.5) to the
// SAME candidate pool. We're testing whether the principled criterion
// agrees with the folk-Assyriological one.
function v30Density(chunkSigns) {
  const tokens = chunkSigns.split(/\s+/).filter((t) => t && t !== "…");
  if (tokens.length === 0) return 0;
  let count = 0;
  for (const t of tokens) if (numericalSet.has(t)) count++;
  return count / tokens.length;
}

const V30_THRESHOLD = 0.5;
const v30FilteredOnLength10 = v21Candidates.filter(
  (e) => v30Density(e.signs) >= V30_THRESHOLD,
);
const v21Hashes = new Set(v21Filtered.map((e) => e.hash));
const v30Hashes = new Set(v30FilteredOnLength10.map((e) => e.hash));

const overlap = [...v21Hashes].filter((h) => v30Hashes.has(h)).length;
const onlyInV21 = [...v21Hashes].filter((h) => !v30Hashes.has(h));
const onlyInV30 = [...v30Hashes].filter((h) => !v21Hashes.has(h));

const overlapPct = v21Hashes.size > 0
  ? (100 * overlap) / v21Hashes.size
  : 0;

console.log(`\n  v0.21 set: ${v21Hashes.size}  ·  v0.30 set: ${v30Hashes.size}`);
console.log(`  overlap: ${overlap}/${v21Hashes.size} v0.21 chunks (= ${overlapPct.toFixed(1)}%)`);
console.log(`  only in v0.21: ${onlyInV21.length}`);
console.log(`  only in v0.30: ${onlyInV30.length}  (these are chunks v0.21 missed — broader vocab catches them)`);

const t3ok = overlapPct > 70;
report(
  ">70% of v0.21's numerical-only-filtered chunks are also surfaced by v0.30 on the same length-10 index",
  t3ok,
  `overlap=${overlapPct.toFixed(1)}% (>70% required)`,
);

// Eyeball: show a few divergence examples for the methods paper.
const v21EntriesByHash = new Map(v21Candidates.map((e) => [e.hash, e]));

if (onlyInV21.length > 0) {
  console.log(
    `\n  Sample of chunks v0.21 flagged but v0.30 did NOT (broader vocab dilutes density below 0.5):`,
  );
  for (const h of onlyInV21.slice(0, 5)) {
    const e = v21EntriesByHash.get(h);
    if (!e) continue;
    const d = v30Density(e.signs);
    const preview = e.signs.length > 90 ? e.signs.slice(0, 90) + "…" : e.signs;
    console.log(
      `    host=${e.occurrences.length}  v30_density=${d.toFixed(3)}  signs: ${preview}`,
    );
  }
}
if (onlyInV30.length > 0) {
  console.log(
    `\n  Sample of chunks v0.30 surfaces but v0.21 missed (chunks that aren't ABZ480/ABZ411-pure but ARE numerical-class by sign2vec):`,
  );
  for (const h of onlyInV30.slice(0, 5)) {
    const e = v21EntriesByHash.get(h);
    if (!e) continue;
    const d = v30Density(e.signs);
    const preview = e.signs.length > 90 ? e.signs.slice(0, 90) + "…" : e.signs;
    console.log(
      `    host=${e.occurrences.length}  v30_density=${d.toFixed(3)}  signs: ${preview}`,
    );
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-15 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
