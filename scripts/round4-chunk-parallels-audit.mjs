#!/usr/bin/env node
// Round-4 calibration audit: sub-tablet chunk-parallel detection.
//
// Hypothesis: v0.18.19's `find_embedded_fragments` condenses the matched-run
// signal to a single `longest_contiguous_run` scalar. Surfacing every maximal
// run ≥ threshold as a primary object (chunk → hosts) will:
//   1. Reproduce the K.9508 ↔ K.5896 142-position run exactly (positive control).
//   2. Confirm IM.49220 stays bi-orphan at chunk granularity (true isolation).
//   3. EXPOSE sub-tablet relationships that whole-tablet methods miss — the
//      methods-paper §3.6 "final-2 bi-orphans" claim may need revision if a
//      bi-orphan acquires a chunk-level host.
//
// Ground truth:
//   Positive — K.9508 → K.5896 (chunk_length=142, host_size_ratio=7.32×).
//              Already proven by v0.18.19's longest_contiguous_run=142.
//   Negative — IM.49220 + K.3306 are methods-paper §3.6 final-2 bi-orphans;
//              the test is whether they REMAIN bi-orphan at chunk granularity.
//   Sample — 20 random lex-singletons under 200 signs (same mulberry32 seed
//            as v0.18.19 Lever 1 for direct comparability).
//   Cross-genre — BM.77056 (āšipūtu cluster seed) with cross_genre_only=true.

import { findChunkParallels } from "../dist/chunkParallels.js";
import { fuzzyIndexStats } from "../dist/fuzzyParallels.js";
import { getAllTabletRecords } from "../dist/anomalySurface.js";

const log = (label, data) => {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${label}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
  if (data) console.log(typeof data === "string" ? data : JSON.stringify(data, null, 2).slice(0, 2500));
};

const fuzzyStats = fuzzyIndexStats();
console.log("Fuzzy index:", fuzzyStats);
if (!fuzzyStats.loaded) {
  console.error("ABORT: fuzzy index unavailable. Run `node scripts/build-signs-index.mjs` first.");
  process.exit(1);
}

// ─── Test 1: K.9508 — the canonical positive case ───────────────────────────
log("TEST 1: K.9508 positive control — expects chunk_length≈142 with K.5896 as host");

const k9508 = findChunkParallels({ tabletId: "K.9508", topK: 10 });
console.log(`K.9508: ${k9508.chunks.length} chunks returned (of ${k9508.index_stats.distinct_chunks} distinct after filters)`);
console.log(`  index: ${k9508.index_stats.total_tablets_indexed} tablets · ${k9508.index_stats.query_trigram_count} source trigrams`);
console.log(`  candidates_examined=${k9508.index_stats.candidates_examined} · with_runs=${k9508.index_stats.candidates_with_runs}`);
console.log(`  source coverage by returned chunks: ${k9508.source_coverage_pct}%`);
for (const c of k9508.chunks) {
  const hostPreview = c.host_tablets.slice(0, 3).map((h) => `${h.tablet_id}(${h.host_size_ratio}×)`).join(", ");
  console.log(`    chunk ${c.chunk_key}  length=${c.chunk_length}  hosts=${c.host_count}  novelty=${c.novelty_score}  → ${hostPreview}`);
}
const top = k9508.chunks[0];
const passPositive = top && top.chunk_length === 142 && top.host_tablets.some((h) => h.tablet_id === "K.5896");
console.log(`\nPositive control: ${passPositive ? "✅ PASS" : "❌ FAIL"} — expected chunk_length=142 with K.5896 host, got chunk_length=${top?.chunk_length} hosts=[${top?.host_tablets.map((h) => h.tablet_id).join(",")}]`);

// ─── Test 2: bi-orphans IM.49220 + K.3306 — true isolation at chunk granularity? ─
log("TEST 2: methods-paper §3.6 bi-orphans IM.49220 + K.3306 at default thresholds");

for (const id of ["IM.49220", "K.3306"]) {
  const r = findChunkParallels({ tabletId: id, topK: 10 });
  console.log(`\n${id}:`);
  console.log(`  query_trigrams=${r.index_stats.query_trigram_count}  candidates_examined=${r.index_stats.candidates_examined}  with_runs=${r.index_stats.candidates_with_runs}`);
  console.log(`  chunks returned: ${r.chunks.length}`);
  for (const c of r.chunks) {
    const hostPreview = c.host_tablets.slice(0, 3).map((h) => `${h.tablet_id}(${h.host_size_ratio}×)`).join(", ");
    console.log(`    chunk ${c.chunk_key}  length=${c.chunk_length}  hosts=${c.host_count}  → ${hostPreview}`);
  }
  if (r.chunks.length > 0) {
    console.log(`  ⚠  ${id} acquired chunk-level host(s) — methods-paper §3.6 claim narrows from "final-2" to fewer bi-orphans`);
  } else {
    console.log(`  ✅ ${id} remains bi-orphan at chunk granularity (truly isolated)`);
  }
}

// ─── Test 3: threshold sweep ────────────────────────────────────────────────
log("TEST 3: threshold sweep — minChunkLen ∈ {10, 15, 20, 25, 30, 50}");

const sweepRows = [];
for (const minLen of [10, 15, 20, 25, 30, 50]) {
  const k9508R = findChunkParallels({ tabletId: "K.9508", minChunkLen: minLen, topK: 1 });
  const imR = findChunkParallels({ tabletId: "IM.49220", minChunkLen: minLen });
  const k3R = findChunkParallels({ tabletId: "K.3306", minChunkLen: minLen });
  sweepRows.push({
    minChunkLen: minLen,
    K9508_top_length: k9508R.chunks[0]?.chunk_length ?? 0,
    K9508_top_host: k9508R.chunks[0]?.host_tablets[0]?.tablet_id ?? "—",
    IM49220_chunks: imR.chunks.length,
    K3306_chunks: k3R.chunks.length,
    K3306_top_host: k3R.chunks[0]?.host_tablets[0]?.tablet_id ?? "—",
    K3306_top_length: k3R.chunks[0]?.chunk_length ?? 0,
  });
}
console.table(sweepRows);

// ─── Test 4: 20-tablet random sample ────────────────────────────────────────
log("TEST 4: 20-tablet random sample at default minChunkLen=20 (same seed as v0.18.19 Lever 1)");

const allRecs = getAllTabletRecords();
if (!allRecs) {
  console.error("ABORT: anomaly index not loaded");
  process.exit(1);
}

const lexSingletons = allRecs.filter(
  (t) => t.in_lex_graph && t.lex_count === 0 && t.sign_count > 0 && t.sign_count < 200,
);
console.log(`Total lex-singletons under 200 signs in corpus: ${lexSingletons.length}`);

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260523);
const shuffled = [...lexSingletons].sort(() => rng() - 0.5);
const sample = shuffled.slice(0, 20);

let withChunks = 0;
const sampleRows = [];
for (const t of sample) {
  const r = findChunkParallels({ tabletId: t.id, topK: 1 });
  if (r.chunks.length > 0) withChunks++;
  sampleRows.push({
    id: t.id,
    sign_count: t.sign_count,
    chunks: r.chunks.length,
    top_chunk_length: r.chunks[0]?.chunk_length ?? null,
    top_host: r.chunks[0]?.host_tablets[0]?.tablet_id ?? "—",
    coverage_pct: r.source_coverage_pct,
  });
}
console.log(`\nWith ≥1 chunk: ${withChunks}/${sample.length}  ·  without: ${sample.length - withChunks}/${sample.length}`);
console.log(`(v0.18.19 Lever 1 saw 8/20 at find_embedded_fragments defaults — chunk_parallels has no host-size filter so may surface more.)`);
console.table(sampleRows);

// ─── Test 5: cross-genre stress test on BM.77056 ────────────────────────────
log("TEST 5: BM.77056 (āšipūtu cluster seed) with cross_genre_only=true");

const bmCross = findChunkParallels({ tabletId: "BM.77056", crossGenreOnly: true, topK: 10 });
console.log(`BM.77056 (cross_genre_only=true):`);
console.log(`  warnings: ${bmCross.warnings.join("; ") || "—"}`);
console.log(`  chunks returned: ${bmCross.chunks.length} (of ${bmCross.index_stats.distinct_chunks} distinct chunks total)`);
for (const c of bmCross.chunks) {
  const hostPreview = c.host_tablets.slice(0, 3).map((h) => `${h.tablet_id}(${h.host_size_ratio}×)`).join(", ");
  console.log(`    chunk ${c.chunk_key}  length=${c.chunk_length}  hosts=${c.host_count}  cross_genre=${c.cross_genre_count}  novelty=${c.novelty_score}  → ${hostPreview}`);
}
if (bmCross.warnings.length > 0 && bmCross.warnings[0].includes("no cached fragment metadata")) {
  console.log(`  ⚠  source lacks metadata — populate via enrich_prefix_metadata to enable cross-genre attribution`);
}

// ─── Test 6: K.3306 unexpected-host follow-up ────────────────────────────────
log("TEST 6: K.3306 → K.6685 discovery follow-up (the v0.19 'why this matters' finding)");

const k3306 = findChunkParallels({ tabletId: "K.3306", topK: 10 });
if (k3306.chunks.length > 0) {
  console.log(`K.3306 has ${k3306.chunks.length} chunks. Top host: ${k3306.chunks[0].host_tablets[0]?.tablet_id} (ratio ${k3306.chunks[0].host_tablets[0]?.host_size_ratio}×).`);
  console.log(`  longest chunk: ${k3306.chunks[0].chunk_length} trigram positions ≈ ${k3306.chunks[0].chunk_length + 2} signs`);
  console.log(`  source coverage by returned chunks: ${k3306.source_coverage_pct}% — high coverage suggests a substantial passage-level relationship, not noise`);
  console.log(`  Why this is invisible to v0.18.19 find_embedded_fragments:`);
  const ratio = k3306.chunks[0].host_tablets[0]?.host_size_ratio ?? 0;
  if (ratio < 5) {
    console.log(`    → host_size_ratio=${ratio}× is below find_embedded_fragments' default host_size_multiplier=5 filter.`);
    console.log(`    → sub-tablet chunk overlap with hosts <5× source size is the v0.19 frontier.`);
  }
} else {
  console.log(`K.3306 has 0 chunks. Bi-orphan status preserved.`);
}

console.log("\n══════════════════════════════════════════════════════════════════════");
console.log("✅ Round-4 chunk-parallel audit complete.");
console.log("══════════════════════════════════════════════════════════════════════\n");
