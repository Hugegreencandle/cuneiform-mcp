#!/usr/bin/env node
// export_gaps.mjs — dump the EXACT benchmark gap set for CuneiBERT evaluation.
//
// Mirrors scripts/benchmark-lacuna-bleu.mjs's gap synthesis VERBATIM (same
// mulberry32 seed, same ≥30-token eligibility, same insertion order, same
// visible-position selection) so evaluate.py scores CuneiBERT on the identical
// 500 gaps as the pinned baseline (top1=0.182). We export the gaps rather than
// re-porting the RNG to Python — eliminating any chance of a subtle mismatch.
//
// Output: scripts/cuneibert/dataset/gaps.json
//   { seed, sample_size, gaps: [{ tablet_id, lacuna_position, ground_truth, tokens:[...] }] }

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const ALL_SIGNS_FILE = "all-signs-full.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);
const RNG_SEED = 20260525;
const SAMPLE_SIZE = parseInt(process.env.BLEU_BENCHMARK_SAMPLE_SIZE ?? "500", 10);

function cacheDir() {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function loadCorpus() {
  const path = join(cacheDir(), ALL_SIGNS_FILE);
  if (!existsSync(path)) {
    console.error(`signs cache not found: ${path}`);
    process.exit(1);
  }
  const records = JSON.parse(readFileSync(path, "utf-8"));
  const out = new Map();
  for (const r of records) {
    if (!r._id || typeof r.signs !== "string") continue;
    const tokens = r.signs.split(/\s+/).filter(Boolean);
    if (tokens.length < 30) continue;
    out.set(r._id, tokens);
  }
  return out;
}

// Mulberry32 deterministic RNG — IDENTICAL to benchmark-lacuna-bleu.mjs.
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const corpus = loadCorpus();
const tabletIds = Array.from(corpus.keys());
const rng = mulberry32(RNG_SEED);
const shuffled = tabletIds.slice();
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}

const gaps = [];
for (const id of shuffled) {
  if (gaps.length >= SAMPLE_SIZE) break;
  const tokens = corpus.get(id);
  const visiblePositions = [];
  for (let i = 5; i < tokens.length - 5; i++) {
    if (!DAMAGE_TOKENS.has(tokens[i])) visiblePositions.push(i);
  }
  if (visiblePositions.length === 0) continue;
  const pos = visiblePositions[Math.floor(rng() * visiblePositions.length)];
  const groundTruth = tokens[pos];
  if (DAMAGE_TOKENS.has(groundTruth)) continue;
  gaps.push({ tablet_id: id, lacuna_position: pos, ground_truth: groundTruth, tokens });
}

const outDir = join(dirname(fileURLToPath(import.meta.url)), "dataset");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "gaps.json");
writeFileSync(outPath, JSON.stringify({ seed: RNG_SEED, sample_size: gaps.length, gaps }));
console.log(`Wrote ${gaps.length} gaps to ${outPath} (corpus: ${corpus.size} eligible tablets, seed ${RNG_SEED})`);
