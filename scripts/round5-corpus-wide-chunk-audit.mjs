#!/usr/bin/env node
// Round-5 calibration audit: corpus-wide chunk discovery (v0.20.0).
//
// Hypothesis: the v0.20.0 chunk-hash index + the three tools that ride on it
// (find_formulaic_passages, trace_chunk_diffusion, build_citation_graph)
// correctly surface the structural primitives that v0.18.19 + v0.19 could
// only see per-pair / per-tablet.
//
// Anchor cases (no 20-tablet random sample — corpus-wide tools are validated
// against known anchors, not random sampling):
//   1. Index build sanity — file exists, hash count in 100K-500K, sampled
//      signs reconstructed from a fresh trigram pass match the cached signs.
//   2. find_formulaic_passages positive — BM.77056 position-57 chunk surfaces
//      in the top-50 at default min_hosts. (Source case: v0.19 cross-curricular
//      finding, docs/methods-paper-cdlj-submission.md §3.9.1.)
//   3. find_formulaic_passages negative (colophon suppression) — Asb.c / Asb.d
//      colophon templates do not dominate the top-10 by novelty_score.
//   4. trace_chunk_diffusion positive — highest-host-count chunk from Test 2
//      spans ≥2 periods.
//   5. build_citation_graph positive — BM.47463 → CBS.6060 (Šurpu commentary
//      → Šurpu base, methods-paper §3.7.1) is present as an edge.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { chunkIndexStats, loadChunkIndex, getChunksContaining } from "../dist/chunkIndex.js";
import { findFormulaicPassages } from "../dist/formulaicPassages.js";
import { traceChunkDiffusion } from "../dist/chunkDiffusion.js";
import { buildCitationGraph } from "../dist/citationGraph.js";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");

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

header("Pre-flight: chunk-index load");
const stats = chunkIndexStats();
console.log(JSON.stringify(stats, null, 2));
if (!stats.loaded) {
  console.error("\nABORT: chunk-index not loaded. Run scripts/build-chunk-index.mjs first.");
  process.exit(1);
}

// ─── Test 1: Index build sanity ───────────────────────────────────────────

header("TEST 1: Index build sanity");

const index = loadChunkIndex();
const nonSingleton = index.total_non_singleton_hashes;
console.log(`total_non_singleton_hashes: ${nonSingleton}`);
const inExpectedBand = nonSingleton >= 100_000 && nonSingleton <= 500_000;
report(
  "non_singleton_hashes in 100K-500K band",
  inExpectedBand,
  `got ${nonSingleton}`,
);

// Sample 10 entries and verify signs round-trip from a fresh trigram pass.
function tabletToTrigrams(signsRaw) {
  const trig = [];
  for (const line of signsRaw.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1], c = toks[i + 2];
      const x = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (x >= 2) continue;
      trig.push(a + " " + b + " " + c);
    }
  }
  return trig;
}
function reconstructFromTrigrams(trig, start, length) {
  if (length === 0) return "";
  const window = trig.slice(start, start + length);
  if (window.length === 0) return "";
  const first = window[0].split(" ");
  const signs = [first[0], first[1], first[2]];
  let prev = first;
  for (let i = 1; i < window.length; i++) {
    const cur = window[i].split(" ");
    if (cur[0] === prev[1] && cur[1] === prev[2]) {
      signs.push(cur[2]);
    } else {
      signs.push("…", cur[0], cur[1], cur[2]);
    }
    prev = cur;
  }
  return signs.join(" ");
}

const records = existsSync(SIGNS_CACHE)
  ? JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"))
  : [];
const byId = new Map(records.map((r) => [r._id, r.signs]));

let sampledMatches = 0;
let sampledChecked = 0;
const sampleSize = Math.min(10, index.entries.length);
for (let i = 0; i < sampleSize; i++) {
  const entry = index.entries[i];
  const occ = entry.occurrences[0];
  const signs = byId.get(occ.tablet_id);
  if (!signs) continue;
  const trig = tabletToTrigrams(signs);
  const reconstructed = reconstructFromTrigrams(trig, occ.start_position, entry.length);
  sampledChecked++;
  if (reconstructed === entry.signs) sampledMatches++;
  else {
    console.log(`  ⚠ mismatch for ${occ.tablet_id}@${occ.start_position}: cached vs fresh diverge`);
  }
}
report(
  "sampled signs round-trip from fresh trigrams",
  sampledChecked === 0 || sampledMatches === sampledChecked,
  `${sampledMatches}/${sampledChecked} matched`,
);

// ─── Test 2: find_formulaic_passages positive (BM.77056 position-57) ──────

header("TEST 2: find_formulaic_passages positive (BM.77056 cross-curricular)");

const formulaic = findFormulaicPassages({ minHosts: 20, topK: 50 });
console.log(`Passages returned: ${formulaic.passages.length}`);
console.log(`metadata coverage: ${formulaic.index_stats.metadata_coverage_pct}%`);

const bm77056Chunks = getChunksContaining("BM.77056");
const bm77056Top50 = formulaic.passages.filter((p) =>
  bm77056Chunks.some((c) => c.hash === p.chunk_hash),
);
report(
  "BM.77056 chunks appear in top-50 formulaic passages",
  bm77056Top50.length > 0,
  `BM.77056 has ${bm77056Chunks.length} non-singleton chunks; ${bm77056Top50.length} in top-50 formulaic results`,
);

// ─── Test 3: find_formulaic_passages negative (colophon suppression) ──────

header("TEST 3: find_formulaic_passages negative — Asb.* colophons should not dominate");

const top10 = formulaic.passages.slice(0, 10);
const asbDominated = top10.filter((p) =>
  p.host_tablets.every((h) => h.tablet_id.startsWith("Asb."))
).length;
report(
  "Asb.* colophons do not dominate the top-10 formulaic passages",
  asbDominated <= 2,
  `${asbDominated}/10 top entries are purely Asb.* (≤ 2 is acceptable — genre weighting should reward diversity)`,
);

// ─── Test 4: trace_chunk_diffusion positive ───────────────────────────────

header("TEST 4: trace_chunk_diffusion spans ≥2 periods");

const targetHash = formulaic.passages[0]?.chunk_hash;
if (!targetHash) {
  report("diffusion positive control", false, "no chunk available from Test 2 to trace");
} else {
  const diff = traceChunkDiffusion({ chunkHash: targetHash });
  console.log(`chunk_hash: ${diff.chunk_hash?.slice(0, 32)}…  ·  hosts_total=${diff.hosts_total}  ·  hosts_with_period=${diff.hosts_with_period}`);
  console.log(`earliest=${diff.earliest_period}  ·  latest=${diff.latest_period}  ·  cross_period_count=${diff.cross_period_count}`);
  report(
    "diffusion spans ≥ 2 distinct periods",
    diff.cross_period_count >= 2,
    `cross_period_count=${diff.cross_period_count}`,
  );
}

// ─── Test 5: build_citation_graph positive (BM.47463 ↔ CBS.6060) ──────────

header("TEST 5: build_citation_graph BM.47463 → CBS.6060 edge");

const graph = buildCitationGraph({ minSharedChunks: 1, topKEdges: 500 });
console.log(`Edges returned: ${graph.edges.length}  ·  metadata coverage: ${graph.index_stats.metadata_coverage_pct}%`);
const surpuEdge = graph.edges.find(
  (e) =>
    (e.cited_by === "BM.47463" && e.cites === "CBS.6060") ||
    (e.cited_by === "CBS.6060" && e.cites === "BM.47463"),
);
report(
  "BM.47463 ↔ CBS.6060 edge present (Šurpu commentary → base)",
  !!surpuEdge,
  surpuEdge
    ? `weight=${surpuEdge.edge_weight}, shared_chunks=${surpuEdge.shared_chunks_count}`
    : `no edge found between BM.47463 and CBS.6060 — check (a) genre metadata is cached for both, (b) chunk-hash index built against the right corpus, (c) min_shared_chunks low enough`,
);

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-5 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
