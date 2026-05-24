#!/usr/bin/env node
// v0.25.0 — build the lexical-substitution baseline distribution.
//
// Samples N=100 random tablet pairs in each of 7 vocab-size buckets, computes
// the v0.24 raw lexical_substitution_score for each pair, and records the
// per-bucket mean + stddev of both the total score and the substitution_share.
//
// Output: ~/.cache/cuneiform-mcp/lexical-substitution-baseline.json
//
// At query time, compute_lexical_substitution_lift looks up the bucket
// whose vocab_size_target is closest (in log-space) to the query pair's
// effective vocab (max(|A|, |B|)) and reports
//     lift_z_score = (raw_score − bucket_mean) / bucket_stddev.
//
// Deterministic by design: uses mulberry32(20260524). Re-running this script
// MUST produce the same JSON (modulo build_timestamp).
//
// Target build time: 1-2 minutes (~700 pair computations).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { computeLexicalSubstitutionScore } from "../dist/lexicalSubstitution.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const ALL_SIGNS = join(CACHE_DIR, "all-signs-full.json");
const SIGN_EMBED = join(CACHE_DIR, "sign-embeddings.json");
const EXCLUSIONS_PATH = join(REPO_DIR, "data", "corpus-exclusions.json");
const OUT_PATH = join(CACHE_DIR, "lexical-substitution-baseline.json");

// Bucket centers chosen to match the actual eBL trigram-corpus vocab
// distribution (n=35,330 tablets, max vocab ≈ 250). The original spec
// proposed {25, 50, 100, 200, 400, 800, 1600} but the upper three are empty
// at this corpus size (only 49 tablets have vocab ≥ 200, zero with ≥ 300).
// The 7-bucket schedule below covers the populated range with reasonable
// per-bucket pool sizes (≥ 200 tablets each at ±25% half-width). Future
// corpus expansions (e.g. ORACC large composite tablets) can introduce
// higher buckets without breaking the runtime lookup, which picks the
// closest bucket in log-space.
const VOCAB_BUCKETS = [15, 25, 50, 80, 120, 160, 220];
const BUCKET_HALF_WIDTH = 0.25; // ±25% around each target
const SAMPLE_SIZE = 100;
const TOP_K = 5;
const MIN_COS = 0.4;
const RNG_SEED = 20260524;
// Max draws per bucket before we accept whatever we have. Random-pair sampling
// converges fast for the small/mid buckets and slowly for the large buckets
// (the corpus has very few tablets with vocab > 1000).
const MAX_DRAW_ATTEMPTS_PER_BUCKET = 4000;

// ─── Pre-flight ───────────────────────────────────────────────────────────

if (!existsSync(ALL_SIGNS)) {
  console.error(`ABORT: ${ALL_SIGNS} missing. Build the signs cache first.`);
  process.exit(1);
}
if (!existsSync(SIGN_EMBED)) {
  console.error(
    `ABORT: ${SIGN_EMBED} missing. Build the v0.23 sign2vec embeddings first.`,
  );
  process.exit(1);
}

console.error("cuneiform-mcp build-lexical-substitution-baseline v0.25.0");
console.error(`  signs cache:        ${ALL_SIGNS}`);
console.error(`  sign embeddings:    ${SIGN_EMBED}`);
console.error(`  output:             ${OUT_PATH}`);
console.error(`  vocab buckets:      [${VOCAB_BUCKETS.join(", ")}]`);
console.error(`  bucket half-width:  ±${BUCKET_HALF_WIDTH * 100}%`);
console.error(`  sample size/bucket: ${SAMPLE_SIZE}`);
console.error(`  top_k_neighbors:    ${TOP_K}`);
console.error(`  min_neighbor_cos:   ${MIN_COS}`);
console.error(`  rng seed:           ${RNG_SEED}`);
console.error("");

// ─── Helpers ──────────────────────────────────────────────────────────────

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

function tabletVocabFromSigns(signsRaw) {
  // Mirrors src/lexicalSubstitution.ts tabletVocab(): extract distinct non-X
  // tokens from the 2-of-3 filtered trigrams_ordered stream. To avoid the
  // expense of building the full trigrams structure here, we approximate the
  // vocab as the set of non-X tokens that have AT LEAST ONE 2-of-3 trigram
  // they appear in. In practice (and verified by spot check on the corpus),
  // the resulting size matches the lexicalSubstitution implementation exactly:
  // every non-X token that appears anywhere in a tablet will be in some 2-of-3
  // trigram unless the tablet has fewer than 3 tokens total.
  const vocab = new Set();
  for (const line of signsRaw.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i],
        b = toks[i + 1],
        c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      if (a !== "X") vocab.add(a);
      if (b !== "X") vocab.add(b);
      if (c !== "X") vocab.add(c);
    }
  }
  return vocab.size;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  let s = 0;
  for (const v of arr) s += v;
  return s / arr.length;
}

function sampleStddev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  let s = 0;
  for (const v of arr) s += (v - m) * (v - m);
  return Math.sqrt(s / (arr.length - 1));
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const n = sorted.length;
  return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[(n - 1) / 2];
}

// ─── Load exclusions + index tablets by vocab size ────────────────────────

const excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  try {
    const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
    for (const r of ex.excluded_records ?? []) excluded.add(r.id);
  } catch {
    // ignore — exclusions file is optional
  }
}

console.error("Indexing tablets by vocab size...");
const t0 = Date.now();
const records = JSON.parse(readFileSync(ALL_SIGNS, "utf-8"));

// vocabByTablet : Map<tabletId, number>
const vocabByTablet = new Map();
for (const r of records) {
  if (!r._id || typeof r.signs !== "string") continue;
  if (excluded.has(r._id)) continue;
  const v = tabletVocabFromSigns(r.signs);
  if (v <= 0) continue;
  vocabByTablet.set(r._id, v);
}
console.error(`  ${vocabByTablet.size} tablets with vocab > 0 (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// Per-bucket eligible tablet pool: any tablet whose vocab is within ±half_width
// of the bucket center.
const bucketPools = VOCAB_BUCKETS.map((target) => {
  const lo = Math.floor(target * (1 - BUCKET_HALF_WIDTH));
  const hi = Math.ceil(target * (1 + BUCKET_HALF_WIDTH));
  const pool = [];
  for (const [id, v] of vocabByTablet) {
    if (v >= lo && v <= hi) pool.push(id);
  }
  return { target, lo, hi, pool };
});

console.error("");
console.error("Pool sizes:");
for (const { target, lo, hi, pool } of bucketPools) {
  console.error(`  vocab ~ ${String(target).padStart(4)}  [${lo}, ${hi}]  pool=${pool.length}`);
}
console.error("");

// ─── Sample pairs and compute scores ──────────────────────────────────────

const rng = mulberry32(RNG_SEED);
const buckets = [];

for (const { target, pool } of bucketPools) {
  console.error(`Bucket ${target}: sampling up to ${SAMPLE_SIZE} pairs (pool=${pool.length})...`);
  const scores = [];
  const subShares = [];
  const exactShares = [];
  let attempts = 0;
  const seenPairs = new Set();

  if (pool.length < 2) {
    console.error(`  pool too small (${pool.length}) — skipping with zero samples`);
    buckets.push({
      vocab_size_target: target,
      bucket_half_width: BUCKET_HALF_WIDTH,
      sample_size: 0,
      mean_score: 0,
      stddev_score: 0,
      mean_substitution_share: 0,
      stddev_substitution_share: 0,
      mean_exact_share: 0,
      median_score: 0,
    });
    continue;
  }

  const bucketStart = Date.now();
  while (scores.length < SAMPLE_SIZE && attempts < MAX_DRAW_ATTEMPTS_PER_BUCKET) {
    attempts++;
    const i = Math.floor(rng() * pool.length);
    let j = Math.floor(rng() * pool.length);
    if (i === j) {
      j = (j + 1) % pool.length;
    }
    const a = pool[i];
    const b = pool[j];
    // Canonicalize so we don't sample the same UNORDERED pair twice.
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seenPairs.has(key)) continue;
    seenPairs.add(key);

    let result;
    try {
      result = computeLexicalSubstitutionScore({
        tabletA: a,
        tabletB: b,
        topKNeighbors: TOP_K,
        minNeighborCosine: MIN_COS,
        includeAxisComparison: false,
        pairSampleCap: 0,
      });
    } catch (e) {
      // Tablet not in corpus or other transient — skip and continue.
      void e;
      continue;
    }
    if (
      result.tablet_a_vocab_size === 0 ||
      result.tablet_b_vocab_size === 0 ||
      !Number.isFinite(result.lexical_substitution_score)
    ) {
      continue;
    }
    scores.push(result.lexical_substitution_score);
    subShares.push(result.score_breakdown.substitution_share);
    exactShares.push(result.score_breakdown.exact_share);
  }
  const elapsed = ((Date.now() - bucketStart) / 1000).toFixed(1);
  const m = mean(scores);
  const sd = sampleStddev(scores);
  const subM = mean(subShares);
  const subSd = sampleStddev(subShares);
  const exM = mean(exactShares);
  const med = median(scores);
  console.error(
    `  ${scores.length} samples in ${elapsed}s — mean_score=${m.toFixed(4)} stddev=${sd.toFixed(4)} sub_mean=${subM.toFixed(4)} sub_stddev=${subSd.toFixed(4)}`,
  );
  buckets.push({
    vocab_size_target: target,
    bucket_half_width: BUCKET_HALF_WIDTH,
    sample_size: scores.length,
    mean_score: +m.toFixed(6),
    stddev_score: +sd.toFixed(6),
    mean_substitution_share: +subM.toFixed(6),
    stddev_substitution_share: +subSd.toFixed(6),
    mean_exact_share: +exM.toFixed(6),
    median_score: +med.toFixed(6),
  });
}

// ─── Write output ─────────────────────────────────────────────────────────

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
const out = {
  version: "0.25.0",
  build_timestamp: new Date().toISOString(),
  sample_size_per_bucket_target: SAMPLE_SIZE,
  top_k_neighbors: TOP_K,
  min_neighbor_cosine: MIN_COS,
  rng_seed: RNG_SEED,
  corpus_tablets: vocabByTablet.size,
  buckets,
};
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.error("");
console.error(`✓ wrote ${OUT_PATH}`);
console.error("");
console.error("Per-bucket summary:");
console.error("  vocab |  N | mean_score | stddev_score | mean_sub_share | stddev_sub_share");
for (const b of buckets) {
  console.error(
    `  ${String(b.vocab_size_target).padStart(5)} | ${String(b.sample_size).padStart(2)} | ${b.mean_score.toFixed(4).padStart(10)} | ${b.stddev_score.toFixed(4).padStart(12)} | ${b.mean_substitution_share.toFixed(4).padStart(14)} | ${b.stddev_substitution_share.toFixed(4).padStart(16)}`,
  );
}
