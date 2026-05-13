// Sign-trigram experiment: same 50 targets + 87 in-corpus siblings as the
// lineToVec validation run (loaded from validation-results.json), scored
// by Jaccard similarity on sign-trigrams instead. Apples-to-apples: same
// denominator, different signal.
//
// Tokenization:
//   - signs string is space-separated sign-list tokens (e.g. "ABZ151 ABZ61")
//     with literal `\n` newlines marking line breaks on the tablet.
//   - we generate trigrams WITHIN each tablet-line only (no boundary
//     crossing). This is the standard text-similarity choice and reflects
//     the way Assyriologists scan for parallel passages.
//   - X = unreadable sign; kept as-is. Removing X-trigrams would be a
//     follow-up experiment if the baseline numbers warrant.

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR ?? path.join(os.homedir(), ".cache", "cuneiform-mcp");
const SIGNS_PATH = path.join(CACHE_DIR, "all-signs-full.json");
const BASELINE_PATH = path.resolve("validation-results.json");
const TOP_K = Number.parseInt(process.argv[2] ?? "15", 10);

function trigramsFromSigns(signs) {
  const out = new Set();
  if (!signs) return out;
  // eBL signs string uses literal newlines between tablet lines.
  for (const line of signs.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      out.add(toks[i] + " " + toks[i + 1] + " " + toks[i + 2]);
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
  const union = a.size + b.size - intersect;
  return intersect / union;
}

function rankIn(sorted, mn) {
  for (let i = 0; i < sorted.length; i++) if (sorted[i].mn === mn) return i + 1;
  return null;
}

const t0 = Date.now();
console.log(`[trigram] loading sign corpus...`);
const raw = JSON.parse(await fs.readFile(SIGNS_PATH, "utf8"));
console.log(`[trigram] ${raw.length} records loaded from disk`);

console.log(`[trigram] building trigram sets...`);
const tg = new Map(); // _id -> Set<trigram>
let totalTrigrams = 0;
for (const r of raw) {
  const set = trigramsFromSigns(r.signs);
  if (set.size > 0) {
    tg.set(r._id, set);
    totalTrigrams += set.size;
  }
}
console.log(
  `[trigram] ${tg.size} fragments with ≥1 trigram, total ${totalTrigrams} trigram instances`,
);

console.log(`[trigram] loading lineToVec baseline (validation-results.json)...`);
const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
const targets = baseline.results;
console.log(`[trigram] ${targets.length} targets to evaluate, top_k=${TOP_K}`);

// Strict apples-to-apples: same targets, same siblings (those that were
// in the lineToVec corpus). We also report a relaxed pass that scores
// against any sibling that has a trigram set, to see how many additional
// joins become recoverable when we don't require lineToVec coverage.
const results = [];
let scoredN = 0;
for (const t of targets) {
  scoredN++;
  const targetSet = tg.get(t.target);
  if (!targetSet || targetSet.size === 0) {
    results.push({ target: t.target, error: "no trigrams for target", siblings: t.siblings });
    continue;
  }

  // Score against everyone (except self) that has trigrams.
  const hits = [];
  for (const [mn, candSet] of tg) {
    if (mn === t.target) continue;
    const j = jaccard(targetSet, candSet);
    if (j > 0) hits.push({ mn, jaccard: j });
  }
  hits.sort((a, b) => b.jaccard - a.jaccard);

  const sibRanks = t.siblings.map((s) => ({
    mn: s.mn,
    rankTrigram: rankIn(hits, s.mn),
    rankRawLineToVec: s.rankRaw,
    rankWeightedLineToVec: s.rankWeighted,
  }));
  results.push({
    target: t.target,
    designation: t.designation,
    totalScored: hits.length,
    siblings: sibRanks,
  });
  if (scoredN % 10 === 0 || scoredN === targets.length) {
    console.log(`[trigram] scored ${scoredN}/${targets.length}`);
  }
}

// Aggregate.
let totalSiblings = 0;
let inTopKTrigram = 0;
let inTopKLineToVec = 0;
let inEither = 0;
let inBoth = 0;
const trigramRanks = [];
const buckets = { top15: 0, top50: 0, top100: 0, top500: 0, top1k: 0, top5k: 0, top10k: 0, beyond: 0, none: 0 };
const winsTrigram = []; // sibling that trigram found but lineToVec missed
const winsLineToVec = []; // sibling that lineToVec found but trigram missed

for (const r of results) {
  if (r.error) continue;
  for (const s of r.siblings) {
    totalSiblings++;
    const hitTri = s.rankTrigram !== null && s.rankTrigram <= TOP_K;
    const hitLTV = s.rankRawLineToVec !== null && s.rankRawLineToVec <= TOP_K;
    if (hitTri) inTopKTrigram++;
    if (hitLTV) inTopKLineToVec++;
    if (hitTri || hitLTV) inEither++;
    if (hitTri && hitLTV) inBoth++;
    if (hitTri && !hitLTV) winsTrigram.push({ target: r.target, sibling: s.mn, rankTri: s.rankTrigram, rankLTV: s.rankRawLineToVec });
    if (!hitTri && hitLTV) winsLineToVec.push({ target: r.target, sibling: s.mn, rankTri: s.rankTrigram, rankLTV: s.rankRawLineToVec });

    if (s.rankTrigram === null) buckets.none++;
    else if (s.rankTrigram <= 15) buckets.top15++;
    else if (s.rankTrigram <= 50) buckets.top50++;
    else if (s.rankTrigram <= 100) buckets.top100++;
    else if (s.rankTrigram <= 500) buckets.top500++;
    else if (s.rankTrigram <= 1000) buckets.top1k++;
    else if (s.rankTrigram <= 5000) buckets.top5k++;
    else if (s.rankTrigram <= 10000) buckets.top10k++;
    else buckets.beyond++;

    if (s.rankTrigram !== null) trigramRanks.push(s.rankTrigram);
  }
}

const median = (arr) => (arr.length === 0 ? null : [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)]);
const mean = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);

console.log("\n=== trigram experiment ===");
console.log(`targets evaluated:           ${results.filter((r) => !r.error).length}`);
console.log(`known siblings:              ${totalSiblings}`);
console.log(
  `recall@${TOP_K} (trigram):      ${inTopKTrigram}/${totalSiblings}  (${(
    (100 * inTopKTrigram) / totalSiblings
  ).toFixed(1)}%)`,
);
console.log(
  `recall@${TOP_K} (lineToVec):    ${inTopKLineToVec}/${totalSiblings}  (${(
    (100 * inTopKLineToVec) / totalSiblings
  ).toFixed(1)}%)  [baseline]`,
);
console.log(
  `recall@${TOP_K} (either):       ${inEither}/${totalSiblings}  (${(
    (100 * inEither) / totalSiblings
  ).toFixed(1)}%)`,
);
console.log(
  `recall@${TOP_K} (both):         ${inBoth}/${totalSiblings}  (${(
    (100 * inBoth) / totalSiblings
  ).toFixed(1)}%)`,
);
console.log(`mean rank (trigram):         ${mean(trigramRanks)?.toFixed(1) ?? "—"}`);
console.log(`median rank (trigram):       ${median(trigramRanks) ?? "—"}`);
console.log(`elapsed:                     ${((Date.now() - t0) / 1000).toFixed(1)} s`);

console.log("\nrank distribution (trigram, raw):");
for (const [k, v] of Object.entries(buckets)) {
  console.log(`  ${k.padEnd(10)} ${String(v).padStart(4)}  (${((100 * v) / totalSiblings).toFixed(1)}%)`);
}

console.log(`\ntrigram-only wins (lineToVec missed): ${winsTrigram.length}`);
for (const w of winsTrigram.slice(0, 15)) {
  console.log(
    `  ${w.target} → ${w.sibling}  trigram=${w.rankTri}  lineToVec=${w.rankLTV ?? "—"}`,
  );
}

console.log(`\nlineToVec-only wins (trigram missed): ${winsLineToVec.length}`);
for (const w of winsLineToVec.slice(0, 15)) {
  console.log(
    `  ${w.target} → ${w.sibling}  trigram=${w.rankTri ?? "—"}  lineToVec=${w.rankLTV}`,
  );
}

const outPath = path.resolve("trigram-results.json");
await fs.writeFile(
  outPath,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      corpusSize: tg.size,
      topK: TOP_K,
      totalSiblings,
      inTopKTrigram,
      inTopKLineToVec,
      inEither,
      inBoth,
      meanRankTrigram: mean(trigramRanks),
      medianRankTrigram: median(trigramRanks),
      buckets,
      winsTrigram,
      winsLineToVec,
      results,
    },
    null,
    2,
  ),
);
console.log(`\n[trigram] wrote artifact: ${outPath}`);
