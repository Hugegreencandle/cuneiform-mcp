#!/usr/bin/env node
// Round-10 calibration audit: sign2vec ensemble + compare_sign_embedding_configs
// (cuneiform-mcp v0.25.0).
//
// Validates that the six (WINDOW, MIN_OCC) configurations built by
// scripts/build-sign-embeddings-ensemble.mjs are usable, that the v0.23
// canonical setting (WINDOW=5, MIN_OCC=20) is robust to hyperparameter
// choice (consensus across configs is non-empty for high-frequency signs),
// and that the configs DO produce distinguishable neighbor lists (otherwise
// the ensemble is redundant and the methods-paper §3.12 footnote loses its
// motivation).
//
// Tests:
//   T1. Sanity         — all 6 configs build and load; each has >0 signs
//                        indexed.
//   T2. Stability      — for ABZ480 (the corpus's most-frequent sign), the
//                        consensus_top5_signs set is non-empty (≥1 sign
//                        appears in the top-5 of all loaded configs).
//                        "The embedding is robust to hyperparameter choice."
//   T3. Diversity      — at least one config produces a top-5 neighbor that
//                        another config doesn't. "The configs DO produce
//                        distinguishable results."

import {
  DEFAULT_ENSEMBLE_GRID,
  ensembleAllStats,
} from "../dist/signEmbeddingsEnsemble.js";
import { compareSignEmbeddingConfigs } from "../dist/compareSignEmbeddingConfigs.js";

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

// ─── Pre-flight: dump per-config stats ─────────────────────────────────────

header("Pre-flight: ensemble per-config load stats");
const allStats = ensembleAllStats();
console.log(
  `  ${"config".padEnd(12)}  ${"loaded".padStart(7)}  ${"signs".padStart(6)}  ${"dim".padStart(4)}  algorithm`,
);
for (const s of allStats) {
  console.log(
    `  w${s.window}-m${s.min_occ}`.padEnd(14) +
      `${s.loaded.toString().padStart(7)}  ${s.total_signs_indexed.toString().padStart(6)}  ${s.embedding_dim.toString().padStart(4)}  ${s.algorithm}` +
      (s.load_error ? `  (${s.load_error})` : ""),
  );
}

// ─── TEST 1: Sanity ───────────────────────────────────────────────────────

header(
  "TEST 1: Sanity — all 6 configs build and load; each has > 0 signs indexed",
);

const expectedConfigs = DEFAULT_ENSEMBLE_GRID.length;
const loadedConfigs = allStats.filter((s) => s.loaded);
const allHaveSigns = loadedConfigs.every((s) => s.total_signs_indexed > 0);
const sanityOk = loadedConfigs.length === expectedConfigs && allHaveSigns;
report(
  `all ${expectedConfigs} configs load and have >0 signs indexed`,
  sanityOk,
  sanityOk
    ? `${loadedConfigs.length}/${expectedConfigs} configs loaded · signs_indexed range: ${Math.min(...loadedConfigs.map((s) => s.total_signs_indexed))}…${Math.max(...loadedConfigs.map((s) => s.total_signs_indexed))}`
    : `${loadedConfigs.length}/${expectedConfigs} configs loaded · failures: ${allStats
        .filter((s) => !s.loaded)
        .map((s) => `w${s.window}-m${s.min_occ}=${s.load_error ?? "unknown"}`)
        .join("; ")}`,
);

// ─── TEST 2: Stability ────────────────────────────────────────────────────

header(
  "TEST 2: Stability — consensus_top5_signs non-empty for ABZ480 across all loaded configs",
);

const ANCHOR = "ABZ480";
const cmp = compareSignEmbeddingConfigs({ sign: ANCHOR, top_k: 5 });
const usable = cmp.configs.filter((c) => c.loaded && c.query_in_corpus);
const stabilityOk = cmp.stability.consensus_top5_signs.length >= 1;

console.log(
  `  query=${ANCHOR} · top_k=5 · usable configs: ${usable.length}/${cmp.configs.length}`,
);
console.log(`  consensus_top5_signs: [${cmp.stability.consensus_top5_signs.join(", ")}]`);
console.log(`  unique_to_each_config: [${cmp.stability.unique_to_each_config.join(", ")}]`);
report(
  `consensus_top5_signs has ≥ 1 entry across all loaded configs`,
  stabilityOk,
  `consensus size = ${cmp.stability.consensus_top5_signs.length}`,
);

// ─── TEST 3: Diversity ────────────────────────────────────────────────────

header(
  "TEST 3: Diversity — at least one config produces a top-5 neighbor that another config doesn't",
);

const diversityOk = cmp.stability.unique_to_each_config.some((n) => n > 0);
report(
  `some config has ≥ 1 unique top-5 neighbor`,
  diversityOk,
  `unique counts per config: [${cmp.stability.unique_to_each_config.join(", ")}] · max=${Math.max(...cmp.stability.unique_to_each_config)}`,
);

// ─── Eyeball: per-config top-5 for ABZ480 ──────────────────────────────────

header(`Eyeball: per-config top-5 for ${ANCHOR}`);
for (const c of cmp.configs) {
  console.log(
    `\n  w${c.window}-m${c.min_occ} · loaded=${c.loaded} · in_corpus=${c.query_in_corpus}`,
  );
  if (!c.loaded || !c.query_in_corpus) continue;
  console.log(`  ${"rank".padStart(4)}  ${"sign".padEnd(12)}  ${"occs".padStart(8)}  cosine`);
  for (let i = 0; i < c.neighbors.length; i++) {
    const n = c.neighbors[i];
    console.log(
      `  ${(i + 1).toString().padStart(4)}  ${n.sign.padEnd(12)}  ${n.occurrences.toString().padStart(8)}  ${n.cosine.toFixed(4)}`,
    );
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(
  `Round-10 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`,
);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
