// Stress-test the trigram approach with a fresh sample. Same harness as
// validate-matcher.mjs, but the scorer is sign-trigram Jaccard against the
// cached all-signs-full.json (not lineToVec). Phase 1 (HTTP fetch of
// joins[]) is the bottleneck — phase 2 scoring is sub-second per target.
//
// Tokenizer matches src/signsIndex.ts: drops trigrams with ≥2 X tokens
// (shipped 2026-05-14, commit 6d79d5a, X-FILTER-EXPERIMENT-2026-05-14.md).
// Recall@15 is filter-invariant on the 50/87 baseline, but mean/median
// rank do differ — the validation should mirror the live tool's behavior.

import dns from "node:dns";
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

const ARG_N = Number.parseInt(process.argv[2] ?? "100", 10);
const ARG_SEED = Number.parseInt(process.argv[3] ?? "137", 10);
const ARG_TOP_K = Number.parseInt(process.argv[4] ?? "15", 10);
const ARG_MAX_FETCH = Number.parseInt(process.argv[5] ?? String(ARG_N * 35), 10);
const FETCH_CONCURRENCY = 5;

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR ?? path.join(os.homedir(), ".cache", "cuneiform-mcp");
const SIGNS_PATH = path.join(CACHE_DIR, "all-signs-full.json");
const EBL = "https://www.ebl.lmu.de/api";
const UA = "cuneiform-mcp-trigram-validate/0.1";

function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fmtMn(mn) {
  return `${mn.prefix}.${mn.number}${mn.suffix ? "." + mn.suffix : ""}`;
}

function trigramsFromSigns(signs) {
  const out = new Set();
  if (!signs) return out;
  for (const line of signs.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i], b = toks[i + 1], c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      out.add(a + " " + b + " " + c);
    }
  }
  return out;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const x of small) if (big.has(x)) intersect++;
  if (intersect === 0) return 0;
  return intersect / (a.size + b.size - intersect);
}

async function fetchJoins(museumNumber) {
  let res;
  try {
    res = await fetch(`${EBL}/fragments/${encodeURIComponent(museumNumber)}`, {
      headers: { "User-Agent": UA },
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const body = await res.json();
  const joins = [];
  for (const group of body.joins ?? []) {
    for (const j of group) if (j?.museumNumber) joins.push(fmtMn(j.museumNumber));
  }
  return { joins, designation: body.designation };
}

const t0 = Date.now();
console.log(`[validate-trigram] loading sign corpus...`);
const raw = JSON.parse(await fs.readFile(SIGNS_PATH, "utf8"));
console.log(`[validate-trigram] ${raw.length} records on disk`);

const tg = new Map();
for (const r of raw) {
  const set = trigramsFromSigns(r.signs);
  if (set.size > 0) tg.set(r._id, set);
}
console.log(`[validate-trigram] ${tg.size} fragments with ≥1 trigram`);

const eligibleIds = [...tg.keys()];
const rng = mulberry32(ARG_SEED);
for (let i = eligibleIds.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [eligibleIds[i], eligibleIds[j]] = [eligibleIds[j], eligibleIds[i]];
}
const queue = eligibleIds.slice(0, ARG_MAX_FETCH);
console.log(
  `[validate-trigram] hunting for ${ARG_N} keepers (seed=${ARG_SEED}, top_k=${ARG_TOP_K}, max-fetch=${queue.length})`,
);

const targets = [];
const errors = [];
let fetched = 0;
let cursor = 0;
let done = false;

async function worker() {
  while (!done) {
    const i = cursor++;
    if (i >= queue.length) return;
    const mn = queue[i];
    fetched++;
    const { joins, designation, error } = await fetchJoins(mn);
    if (error) {
      errors.push({ mn, error });
    } else {
      const siblings = (joins ?? [])
        .filter((s) => s !== mn)
        .filter((s) => tg.has(s));
      if (siblings.length > 0) {
        targets.push({ target: mn, designation, siblings });
        if (targets.length >= ARG_N) done = true;
      }
    }
    if (fetched % 50 === 0) {
      console.log(
        `[validate-trigram] fetched=${fetched}  keepers=${targets.length}/${ARG_N}  errors=${errors.length}`,
      );
    }
  }
}
await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => worker()));
console.log(
  `[validate-trigram] phase 1 done. fetched=${fetched}  keepers=${targets.length}  errors=${errors.length}`,
);

console.log(`[validate-trigram] phase 2: scoring against ${tg.size} candidates`);
const results = [];
for (const t of targets) {
  const targetSet = tg.get(t.target);
  const hits = [];
  for (const [mn, candSet] of tg) {
    if (mn === t.target) continue;
    const j = jaccard(targetSet, candSet);
    if (j > 0) hits.push({ mn, jaccard: j });
  }
  hits.sort((a, b) => b.jaccard - a.jaccard);
  const sibRanks = t.siblings.map((mn) => {
    let rank = null;
    for (let i = 0; i < hits.length; i++) if (hits[i].mn === mn) { rank = i + 1; break; }
    return { mn, rank };
  });
  results.push({
    target: t.target,
    designation: t.designation,
    totalScored: hits.length,
    siblings: sibRanks,
  });
}

let totalSiblings = 0;
let inTopK = 0;
const ranks = [];
const buckets = { top15: 0, top50: 0, top100: 0, top500: 0, top1k: 0, top5k: 0, top10k: 0, beyond: 0, none: 0 };
for (const r of results) {
  for (const s of r.siblings) {
    totalSiblings++;
    if (s.rank !== null && s.rank <= ARG_TOP_K) inTopK++;
    if (s.rank !== null) ranks.push(s.rank);
    if (s.rank === null) buckets.none++;
    else if (s.rank <= 15) buckets.top15++;
    else if (s.rank <= 50) buckets.top50++;
    else if (s.rank <= 100) buckets.top100++;
    else if (s.rank <= 500) buckets.top500++;
    else if (s.rank <= 1000) buckets.top1k++;
    else if (s.rank <= 5000) buckets.top5k++;
    else if (s.rank <= 10000) buckets.top10k++;
    else buckets.beyond++;
  }
}
const median = (a) => (a.length === 0 ? null : [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]);
const mean = (a) => (a.length === 0 ? null : a.reduce((x, y) => x + y, 0) / a.length);

console.log("\n=== trigram validation summary ===");
console.log(`targets evaluated:    ${results.length}`);
console.log(`known siblings:       ${totalSiblings}`);
console.log(
  `recall@${ARG_TOP_K}:           ${inTopK}/${totalSiblings}  (${((100 * inTopK) / totalSiblings).toFixed(1)}%)`,
);
console.log(`mean rank:            ${mean(ranks)?.toFixed(1) ?? "—"}`);
console.log(`median rank:          ${median(ranks) ?? "—"}`);
console.log(`elapsed:              ${((Date.now() - t0) / 1000).toFixed(1)} s`);
console.log("\nrank distribution:");
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  (${((100 * v) / totalSiblings).toFixed(1)}%)`);
}

const outPath = path.resolve(`trigram-validation-N${ARG_N}-seed${ARG_SEED}.json`);
await fs.writeFile(
  outPath,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      sampleN: ARG_N,
      seed: ARG_SEED,
      topK: ARG_TOP_K,
      targetsEvaluated: results.length,
      totalSiblings,
      inTopK,
      meanRank: mean(ranks),
      medianRank: median(ranks),
      buckets,
      results,
    },
    null,
    2,
  ),
);
console.log(`\n[validate-trigram] wrote artifact: ${outPath}`);
