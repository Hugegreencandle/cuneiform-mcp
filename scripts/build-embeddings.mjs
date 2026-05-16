#!/usr/bin/env node
// cuneiform-mcp v0.15.0 — Random-Indexing sign + tablet embeddings.
//
// Method: Sahlgren 2005 Random Indexing — approximates LSA/PPMI-SVD
// distributional semantics without explicit SVD. Each sign gets a
// random sparse k-of-d "index vector"; each sign's "context vector"
// accumulates the index vectors of its neighbors within a ±W window.
// Tablet embeddings = IDF-weighted mean of sign vectors, L2-normalized.
// Top-K cosine neighbors per tablet precomputed for fast lookup.
//
// Outputs (to ~/.cache/cuneiform-mcp/):
//   sign-vocab.json          — vocab + metadata
//   sign-vectors.f32         — vocab.length × DIM float32 matrix
//   tablet-embed-index.json  — tablet id list + metadata
//   tablet-vectors.f32       — tablets × DIM float32 matrix
//   tablet-neighbors.json    — id → top-K {neighbor, score} list

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const EXCLUSIONS_PATH = join(homedir(), "Desktop", "cuneiform-mcp", "data", "corpus-exclusions.json");
const METADATA_PATH = join(homedir(), "Desktop", "cuneiform-mcp", "data", "tabletMetadata.json");

// ─── Config ────────────────────────────────────────────────────────────────

const DIM = 300;
const K_NONZERO = 8;        // nonzeros per random index vector (Sahlgren default 4-10)
const WINDOW = 3;           // ±3 sign context window
const MIN_SIGN_FREQ = 3;    // ignore signs occurring < 3 times in the corpus
const MIN_TABLET_SIGNS = 20; // require ≥20 sign tokens per tablet
const TOP_K_NEIGHBORS = 30;  // precomputed nearest neighbors per tablet
const SEED = 42;

console.error("cuneiform-mcp build-embeddings v0.15.0");
console.error(`  DIM: ${DIM}, K_NONZERO: ${K_NONZERO}, WINDOW: ±${WINDOW}`);
console.error(`  MIN_SIGN_FREQ: ${MIN_SIGN_FREQ}, MIN_TABLET_SIGNS: ${MIN_TABLET_SIGNS}`);
console.error(`  TOP_K_NEIGHBORS: ${TOP_K_NEIGHBORS}, SEED: ${SEED}`);
console.error("");

// ─── Load corpus + exclusions + metadata ───────────────────────────────────

if (!existsSync(SIGNS_CACHE)) {
  console.error(`✘ ${SIGNS_CACHE} not found. Build cuneiform-mcp signs cache first.`);
  process.exit(1);
}

console.error("Loading signs cache...");
const t0 = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
console.error(`  ${records.length} tablets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
  excluded = new Set((ex.excluded_records ?? []).map((r) => r.id));
  console.error(`  ${excluded.size} excluded prototype records will be filtered`);
}

let metadata = new Map();
if (existsSync(METADATA_PATH)) {
  try {
    const meta = JSON.parse(readFileSync(METADATA_PATH, "utf-8"));
    for (const [id, info] of Object.entries(meta.tablets ?? {})) metadata.set(id, info);
    console.error(`  ${metadata.size} tablets have period/genre metadata`);
  } catch {}
}

// ─── Tokenize + filter ─────────────────────────────────────────────────────

console.error("");
console.error("Tokenizing...");
const t1 = Date.now();
const tabletTokens = new Map(); // id → string[]
for (const r of records) {
  if (!r._id || typeof r.signs !== "string" || excluded.has(r._id)) continue;
  const toks = [];
  for (const line of r.signs.split(/\r?\n/)) {
    for (const t of line.trim().split(/\s+/).filter(Boolean)) {
      if (t === "X") continue; // skip damaged-marker tokens
      toks.push(t);
    }
  }
  if (toks.length >= MIN_TABLET_SIGNS) tabletTokens.set(r._id, toks);
}
console.error(`  ${tabletTokens.size} tablets with ≥${MIN_TABLET_SIGNS} tokens (${((Date.now() - t1) / 1000).toFixed(1)}s)`);

// ─── Build sign vocab ──────────────────────────────────────────────────────

const signFreq = new Map();
let totalTokens = 0;
for (const toks of tabletTokens.values()) {
  for (const t of toks) {
    signFreq.set(t, (signFreq.get(t) ?? 0) + 1);
    totalTokens++;
  }
}
const vocab = [...signFreq.entries()]
  .filter(([, f]) => f >= MIN_SIGN_FREQ)
  .sort((a, b) => b[1] - a[1])
  .map(([s]) => s);
const signIdx = new Map(vocab.map((s, i) => [s, i]));
console.error(`  vocab size: ${vocab.length} (filtered from ${signFreq.size}); ${totalTokens.toLocaleString()} total sign tokens`);

// ─── Random index vectors (deterministic, seed=42) ─────────────────────────

console.error("");
console.error("Generating random index vectors...");
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const indexPositions = new Int32Array(vocab.length * K_NONZERO);
const indexSigns = new Int8Array(vocab.length * K_NONZERO);
for (let i = 0; i < vocab.length; i++) {
  const used = new Set();
  for (let k = 0; k < K_NONZERO; k++) {
    let p;
    do {
      p = Math.floor(rng() * DIM);
    } while (used.has(p));
    used.add(p);
    indexPositions[i * K_NONZERO + k] = p;
    indexSigns[i * K_NONZERO + k] = rng() < 0.5 ? -1 : 1;
  }
}

// ─── Accumulate context vectors ────────────────────────────────────────────

console.error("");
console.error("Accumulating sign context vectors (sliding window pass)...");
const t2 = Date.now();
const ctx = new Float64Array(vocab.length * DIM);

let processed = 0;
const tabletList = [...tabletTokens.entries()];
for (const [, toks] of tabletList) {
  // Map tokens to indices once per tablet, with -1 for OOV
  const ids = new Int32Array(toks.length);
  for (let i = 0; i < toks.length; i++) {
    const v = signIdx.get(toks[i]);
    ids[i] = v === undefined ? -1 : v;
  }
  for (let i = 0; i < toks.length; i++) {
    const centerIdx = ids[i];
    if (centerIdx < 0) continue;
    const ctxBase = centerIdx * DIM;
    const lo = Math.max(0, i - WINDOW);
    const hi = Math.min(toks.length - 1, i + WINDOW);
    for (let j = lo; j <= hi; j++) {
      if (j === i) continue;
      const ctxIdx = ids[j];
      if (ctxIdx < 0) continue;
      const ivBase = ctxIdx * K_NONZERO;
      for (let k = 0; k < K_NONZERO; k++) {
        ctx[ctxBase + indexPositions[ivBase + k]] += indexSigns[ivBase + k];
      }
    }
  }
  processed++;
  if (processed % 5000 === 0) {
    console.error(`  ${processed}/${tabletList.length} (${(100 * processed / tabletList.length).toFixed(1)}%)`);
  }
}
console.error(`  context vectors built in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

// ─── L2-normalize sign vectors ─────────────────────────────────────────────

for (let i = 0; i < vocab.length; i++) {
  let s = 0;
  const base = i * DIM;
  for (let k = 0; k < DIM; k++) s += ctx[base + k] * ctx[base + k];
  s = Math.sqrt(s);
  if (s > 0) {
    for (let k = 0; k < DIM; k++) ctx[base + k] /= s;
  }
}

// ─── IDF ───────────────────────────────────────────────────────────────────

const docFreq = new Map();
for (const toks of tabletTokens.values()) {
  const seen = new Set();
  for (const t of toks) {
    if (seen.has(t)) continue;
    seen.add(t);
    docFreq.set(t, (docFreq.get(t) ?? 0) + 1);
  }
}
const N = tabletTokens.size;
const idfByIdx = new Float64Array(vocab.length);
for (let i = 0; i < vocab.length; i++) {
  const df = docFreq.get(vocab[i]) ?? 1;
  idfByIdx[i] = Math.log((N + 1) / (df + 1)) + 1; // smoothed
}

// ─── Per-tablet embeddings ─────────────────────────────────────────────────

console.error("");
console.error("Building per-tablet embeddings (IDF-weighted mean)...");
const t3 = Date.now();
const tabletIds = [...tabletTokens.keys()];
const tabVec = new Float32Array(tabletIds.length * DIM);
const buf = new Float64Array(DIM);
for (let ti = 0; ti < tabletIds.length; ti++) {
  buf.fill(0);
  const toks = tabletTokens.get(tabletIds[ti]);
  let wsum = 0;
  for (const t of toks) {
    const si = signIdx.get(t);
    if (si === undefined) continue;
    const w = idfByIdx[si];
    const sb = si * DIM;
    for (let k = 0; k < DIM; k++) buf[k] += w * ctx[sb + k];
    wsum += w;
  }
  if (wsum > 0) for (let k = 0; k < DIM; k++) buf[k] /= wsum;
  let s = 0;
  for (let k = 0; k < DIM; k++) s += buf[k] * buf[k];
  s = Math.sqrt(s);
  const tb = ti * DIM;
  if (s > 0) for (let k = 0; k < DIM; k++) tabVec[tb + k] = buf[k] / s;
}
console.error(`  ${tabletIds.length} tablet vectors in ${((Date.now() - t3) / 1000).toFixed(1)}s`);

// ─── Mean-center + re-normalize (Mu & Viswanath 2018 "All-but-the-Top" lite) ───
// IDF-weighted mean-pooling collapses every tablet vector toward a common
// centroid (raw-cosine median 0.97 between random pairs — verified empirically).
// Subtracting the corpus mean restores meaningful spread (centered-cosine
// median ~0). This is the most-cited mean-pooling post-processing fix.
console.error("");
console.error("Mean-centering tablet vectors...");
const meanVec = new Float64Array(DIM);
for (let i = 0; i < tabletIds.length; i++) {
  const base = i * DIM;
  for (let k = 0; k < DIM; k++) meanVec[k] += tabVec[base + k];
}
for (let k = 0; k < DIM; k++) meanVec[k] /= tabletIds.length;
let meanNorm = 0;
for (let k = 0; k < DIM; k++) meanNorm += meanVec[k] * meanVec[k];
console.error(`  mean vector L2 norm before centering: ${Math.sqrt(meanNorm).toFixed(4)}`);

for (let i = 0; i < tabletIds.length; i++) {
  const base = i * DIM;
  for (let k = 0; k < DIM; k++) tabVec[base + k] -= meanVec[k];
  let s = 0;
  for (let k = 0; k < DIM; k++) s += tabVec[base + k] * tabVec[base + k];
  s = Math.sqrt(s);
  if (s > 0) for (let k = 0; k < DIM; k++) tabVec[base + k] /= s;
}

// ─── Top-K cosine neighbors per tablet ─────────────────────────────────────

console.error("");
console.error(`Computing top-${TOP_K_NEIGHBORS} cosine neighbors per tablet (O(N²) pass)...`);
const t4 = Date.now();
const neighbors = new Array(tabletIds.length);
for (let i = 0; i < tabletIds.length; i++) {
  if (i % 2000 === 0 && i > 0) {
    const elapsed = (Date.now() - t4) / 1000;
    const eta = (tabletIds.length - i) * elapsed / i;
    console.error(`  ${i}/${tabletIds.length} (${(100 * i / tabletIds.length).toFixed(1)}%, ETA ${(eta / 60).toFixed(1)}m)`);
  }
  const ib = i * DIM;
  // Min-heap as sorted array, size TOP_K_NEIGHBORS. Track min for early skip.
  const heap = []; // [score, j], maintained sorted ascending by score
  let heapMin = -2;
  for (let j = 0; j < tabletIds.length; j++) {
    if (i === j) continue;
    const jb = j * DIM;
    let s = 0;
    for (let k = 0; k < DIM; k++) s += tabVec[ib + k] * tabVec[jb + k];
    if (heap.length < TOP_K_NEIGHBORS) {
      heap.push([s, j]);
      if (heap.length === TOP_K_NEIGHBORS) {
        heap.sort((a, b) => a[0] - b[0]);
        heapMin = heap[0][0];
      }
    } else if (s > heapMin) {
      heap[0] = [s, j];
      // Bubble up to maintain sort
      let p = 0;
      while (p + 1 < heap.length && heap[p][0] > heap[p + 1][0]) {
        const tmp = heap[p];
        heap[p] = heap[p + 1];
        heap[p + 1] = tmp;
        p++;
      }
      heapMin = heap[0][0];
    }
  }
  heap.sort((a, b) => b[0] - a[0]);
  neighbors[i] = heap.map(([score, j]) => ({ id: tabletIds[j], score: +score.toFixed(4) }));
}
console.error(`  neighbors pass done in ${((Date.now() - t4) / 60000).toFixed(1)}m`);

// ─── Write outputs ─────────────────────────────────────────────────────────

console.error("");
console.error("Writing outputs...");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const _meta = {
  version: "0.15.0",
  method: "random_indexing",
  generated_at: new Date().toISOString(),
  config: { DIM, K_NONZERO, WINDOW, MIN_SIGN_FREQ, MIN_TABLET_SIGNS, TOP_K_NEIGHBORS, SEED },
  vocab_size: vocab.length,
  total_tablets: tabletIds.length,
  total_tokens: totalTokens,
  excluded_records: excluded.size,
};

// Sign vocab
writeFileSync(
  join(CACHE_DIR, "sign-vocab.json"),
  JSON.stringify({ _meta, vocab }),
);
console.error(`  ✓ sign-vocab.json (${vocab.length} signs)`);

// Sign vectors — float32 binary
const signF32 = new Float32Array(vocab.length * DIM);
for (let i = 0; i < signF32.length; i++) signF32[i] = ctx[i];
writeFileSync(join(CACHE_DIR, "sign-vectors.f32"), Buffer.from(signF32.buffer));
console.error(`  ✓ sign-vectors.f32 (${(signF32.byteLength / 1024 / 1024).toFixed(1)} MB)`);

// Tablet index
writeFileSync(
  join(CACHE_DIR, "tablet-embed-index.json"),
  JSON.stringify({ _meta, ids: tabletIds }),
);
console.error(`  ✓ tablet-embed-index.json (${tabletIds.length} tablets)`);

// Tablet vectors — float32 binary
writeFileSync(join(CACHE_DIR, "tablet-vectors.f32"), Buffer.from(tabVec.buffer));
console.error(`  ✓ tablet-vectors.f32 (${(tabVec.byteLength / 1024 / 1024).toFixed(1)} MB)`);

// Tablet neighbors — JSON keyed by id
const neighborsByID = {};
for (let i = 0; i < tabletIds.length; i++) neighborsByID[tabletIds[i]] = neighbors[i];
writeFileSync(
  join(CACHE_DIR, "tablet-neighbors.json"),
  JSON.stringify({ _meta, neighbors: neighborsByID }),
);
const nbSize = JSON.stringify(neighborsByID).length;
console.error(`  ✓ tablet-neighbors.json (${(nbSize / 1024 / 1024).toFixed(1)} MB, ${tabletIds.length} × ${TOP_K_NEIGHBORS})`);

console.error("");
console.error("✓ Build complete.");
console.error(`  vocab: ${vocab.length}`);
console.error(`  tablets: ${tabletIds.length}`);
console.error(`  total embedding bytes: ${((signF32.byteLength + tabVec.byteLength) / 1024 / 1024).toFixed(1)} MB`);
