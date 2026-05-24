#!/usr/bin/env node
// cuneiform-mcp v0.20.0 — build chunk-index.json.
//
// One-time build of the corpus-wide chunk-hash index that backs the v0.20.0
// tools find_formulaic_passages, trace_chunk_diffusion, build_citation_graph.
//
// Algorithm:
//   1. Load all-signs-full.json (~35K tablets); skip exclusions.
//   2. For each tablet, reconstruct trigrams_ordered with the same X-skip
//      rule as src/fuzzyParallels.ts (xCount ≥ 2 → skip).
//   3. Slide a length-20 window over each tablet's trigrams_ordered, emit
//      hash = window.join("|") + {tablet_id, start_position}.
//   4. Aggregate into Map<hash, Array<occurrence>>.
//   5. Drop singletons (occurrences.length === 1).
//   6. Reconstruct sign sequence per surviving entry (same logic as
//      chunkParallels.ts reconstructChunkSigns).
//   7. Sort entries by occurrences.length descending.
//   8. Write JSON to ~/.cache/cuneiform-mcp/chunk-index.json.
//
// Runtime target: <15 minutes on a single core, 35K-tablet corpus.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const REPO_DIR = process.env.CUNEIFORM_MCP_DATA_DIR
  ? join(process.env.CUNEIFORM_MCP_DATA_DIR, "..")
  : join(homedir(), "Desktop", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const EXCLUSIONS_PATH = join(REPO_DIR, "data", "corpus-exclusions.json");
const OUT_PATH = join(CACHE_DIR, "chunk-index.json");

const WINDOW = 20;
const MCP_VERSION = "0.20.0";

console.error("cuneiform-mcp build-chunk-index v0.20.0");
console.error(`  signs cache: ${SIGNS_CACHE}`);
console.error(`  exclusions:  ${EXCLUSIONS_PATH}`);
console.error(`  window:      ${WINDOW} trigrams`);
console.error(`  output:      ${OUT_PATH}`);
console.error("");

// ─── Verify inputs ─────────────────────────────────────────────────────────

if (!existsSync(SIGNS_CACHE)) {
  console.error(`✘ required input not found: ${SIGNS_CACHE}`);
  console.error("  Run the eBL fetch pipeline (--prefetch) before this script.");
  process.exit(1);
}

// ─── Load exclusions ──────────────────────────────────────────────────────

const excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  try {
    const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
    for (const r of ex.excluded_records ?? []) excluded.add(r.id);
    console.error(`  ${excluded.size} excluded prototypes loaded`);
  } catch (e) {
    console.error(`  ⚠ exclusions load failed: ${e.message}`);
  }
}

// ─── Per-tablet trigrams_ordered (X-skip rule from fuzzyParallels.ts) ─────

function tabletToTrigrams(signsRaw) {
  const trigrams_ordered = [];
  for (const line of signsRaw.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1], c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      trigrams_ordered.push(a + " " + b + " " + c);
    }
  }
  return trigrams_ordered;
}

// Same logic as src/chunkParallels.ts:reconstructChunkSigns (v0.19.0).
// Duplicated here to keep the build script standalone — see plan v0.20 §2.2.
function reconstructChunkSigns(trigrams_ordered, start, length) {
  if (length === 0) return "";
  const window = trigrams_ordered.slice(start, start + length);
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

// ─── Stream records and build the per-hash inverted index ─────────────────

console.error("Reading signs cache...");
const t0 = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
console.error(`  ${records.length} records loaded (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// hash → Array<{tablet_id, start_position}>
const byHash = new Map();
// tablet_id → trigrams_ordered (kept only for tablets whose chunks survive;
// we don't know that until after singleton pruning, so retain per-source for
// reconstruction). For 35K tablets averaging ~120 trigrams this is bounded.
const trigramsByTablet = new Map();

let totalWindows = 0;
let tabletsProcessed = 0;
const t1 = Date.now();
for (const r of records) {
  if (!r._id || typeof r.signs !== "string") continue;
  if (excluded.has(r._id)) continue;
  const trigrams = tabletToTrigrams(r.signs);
  if (trigrams.length < WINDOW) continue;
  trigramsByTablet.set(r._id, trigrams);
  for (let i = 0; i + WINDOW <= trigrams.length; i++) {
    const hash = trigrams.slice(i, i + WINDOW).join("|");
    let arr = byHash.get(hash);
    if (!arr) {
      arr = [];
      byHash.set(hash, arr);
    }
    arr.push({ tablet_id: r._id, start_position: i });
    totalWindows++;
  }
  tabletsProcessed++;
  if (tabletsProcessed % 2000 === 0) {
    console.error(`    ${tabletsProcessed} tablets · ${byHash.size} unique hashes so far`);
  }
}
console.error(
  `  ${tabletsProcessed} tablets processed · ${totalWindows} windows · ${byHash.size} unique hashes (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
);

// ─── Prune singletons + reconstruct signs ─────────────────────────────────

console.error("");
console.error("Pruning singletons + reconstructing signs...");
const t2 = Date.now();
const entries = [];
for (const [hash, occurrences] of byHash.entries()) {
  if (occurrences.length < 2) continue;
  // Reconstruct from the first occurrence's source tablet.
  const seed = occurrences[0];
  const trigrams = trigramsByTablet.get(seed.tablet_id);
  const signs = trigrams ? reconstructChunkSigns(trigrams, seed.start_position, WINDOW) : "";
  entries.push({ hash, signs, length: WINDOW, occurrences });
}
const totalNonSingleton = entries.length;
console.error(
  `  ${totalNonSingleton} non-singleton hashes (${((Date.now() - t2) / 1000).toFixed(1)}s)`,
);

// Sanity assertion from the plan: 100K-500K expected on a 35K-tablet corpus.
if (totalNonSingleton < 100_000 || totalNonSingleton > 500_000) {
  console.error(
    `  ⚠ non-singleton count outside expected 100K-500K band — investigate before shipping`,
  );
}

// Sort by host count descending.
entries.sort((a, b) => b.occurrences.length - a.occurrences.length);

// ─── Write output ─────────────────────────────────────────────────────────

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const out = {
  version: MCP_VERSION,
  build_timestamp: new Date().toISOString(),
  window_length: WINDOW,
  total_tablets: tabletsProcessed,
  total_windows_seen: totalWindows,
  total_unique_hashes: byHash.size,
  total_non_singleton_hashes: totalNonSingleton,
  entries,
};

console.error("");
console.error(`Writing ${OUT_PATH}...`);
const t3 = Date.now();
writeFileSync(OUT_PATH, JSON.stringify(out));
const sizeMb = (JSON.stringify(out).length / 1024 / 1024).toFixed(1);
console.error(`✓ wrote ${OUT_PATH}  (${sizeMb} MB, ${((Date.now() - t3) / 1000).toFixed(1)}s)`);

console.error("");
console.error("Top-level stats:");
console.error(`  tablets indexed:           ${tabletsProcessed}`);
console.error(`  windows scanned:           ${totalWindows}`);
console.error(`  unique hashes:             ${byHash.size}`);
console.error(`  non-singleton hashes kept: ${totalNonSingleton}`);
if (entries.length > 0) {
  const top = entries[0];
  console.error(`  highest-host chunk:        ${top.occurrences.length} hosts · ${top.signs.slice(0, 60)}…`);
}
