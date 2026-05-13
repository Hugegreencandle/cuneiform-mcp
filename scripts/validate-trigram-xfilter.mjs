// X-token filter experiment. Same 50 targets + 87 siblings as the 25.3%
// trigram baseline; only the trigram-emission predicate changes.
//
// Variants (gradient of aggressiveness):
//   baseline       — keep all trigrams (matches validate-trigram.mjs)
//   drop-xxx       — drop only pure X-X-X trigrams (2.4% of corpus)
//   drop-≥2x       — drop trigrams with 2 or more X tokens (4.4% of corpus)
//   drop-anyx      — drop any trigram containing ≥1 X (8.8% of corpus, strictest per polish-queue spec)
//   skip-x         — exclude X tokens during tokenization (build trigrams over
//                    the non-X subsequence; this slides over damage instead of
//                    blocking on it, but may conflate signs across breaks)
//
// CLI: node scripts/validate-trigram-xfilter.mjs [TOP_K]

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR ?? path.join(os.homedir(), ".cache", "cuneiform-mcp");
const SIGNS_PATH = path.join(CACHE_DIR, "all-signs-full.json");
const BASELINE_PATH = path.resolve("validation-results.json");
const TOP_K = Number.parseInt(process.argv[2] ?? "15", 10);

function trigramsFromSigns(signs, mode) {
  const out = new Set();
  if (!signs) return out;
  for (const line of signs.split(/\r?\n/)) {
    let toks = line.trim().split(/\s+/).filter(Boolean);
    if (mode === "skip-x") toks = toks.filter((t) => t !== "X");
    if (toks.length < 3) continue;
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i],
        b = toks[i + 1],
        c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (mode === "drop-xxx" && xCount >= 3) continue;
      if (mode === "drop-2x" && xCount >= 2) continue;
      if (mode === "drop-anyx" && xCount >= 1) continue;
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
  const union = a.size + b.size - intersect;
  return intersect / union;
}

function rankIn(sorted, mn) {
  for (let i = 0; i < sorted.length; i++) if (sorted[i].mn === mn) return i + 1;
  return null;
}

function buildIndex(raw, mode) {
  const tg = new Map();
  let total = 0;
  for (const r of raw) {
    const set = trigramsFromSigns(r.signs, mode);
    if (set.size > 0) {
      tg.set(r._id, set);
      total += set.size;
    }
  }
  return { tg, total };
}

function scoreVariant(name, raw, targets, mode) {
  const t0 = Date.now();
  console.log(`\n=== variant: ${name} (mode=${mode}) ===`);
  const { tg, total } = buildIndex(raw, mode);
  console.log(`  ${tg.size} fragments indexed, ${total} trigram instances`);

  const results = [];
  let scoredN = 0;
  let inTopK = 0;
  let totalSiblings = 0;
  const ranks = [];

  for (const t of targets) {
    scoredN++;
    const targetSet = tg.get(t.target);
    if (!targetSet || targetSet.size === 0) {
      results.push({ target: t.target, error: "no trigrams" });
      for (const _s of t.siblings) totalSiblings++;
      continue;
    }
    const hits = [];
    for (const [mn, candSet] of tg) {
      if (mn === t.target) continue;
      const j = jaccard(targetSet, candSet);
      if (j > 0) hits.push({ mn, jaccard: j });
    }
    hits.sort((a, b) => b.jaccard - a.jaccard);

    const sibRanks = t.siblings.map((s) => {
      const r = rankIn(hits, s.mn);
      totalSiblings++;
      if (r !== null) {
        ranks.push(r);
        if (r <= TOP_K) inTopK++;
      }
      return { mn: s.mn, rank: r };
    });
    results.push({ target: t.target, designation: t.designation, siblings: sibRanks });
    if (scoredN % 10 === 0) console.log(`  scored ${scoredN}/${targets.length}`);
  }

  const median = (arr) =>
    arr.length === 0 ? null : [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  const mean = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);

  console.log(
    `  recall@${TOP_K}: ${inTopK}/${totalSiblings}  (${((100 * inTopK) / totalSiblings).toFixed(1)}%)`,
  );
  console.log(
    `  median rank: ${median(ranks) ?? "—"}    mean rank: ${mean(ranks)?.toFixed(1) ?? "—"}`,
  );
  console.log(`  elapsed: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  return {
    name,
    mode,
    corpusSize: tg.size,
    totalTrigrams: total,
    totalSiblings,
    inTopK,
    recall: inTopK / totalSiblings,
    medianRank: median(ranks),
    meanRank: mean(ranks),
    results,
  };
}

const t0 = Date.now();
console.log(`[xfilter] loading sign corpus...`);
const raw = JSON.parse(await fs.readFile(SIGNS_PATH, "utf8"));
console.log(`[xfilter] ${raw.length} records loaded`);

console.log(`[xfilter] loading baseline (validation-results.json)...`);
const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
const targets = baseline.results;
console.log(`[xfilter] ${targets.length} targets, TOP_K=${TOP_K}`);

const variants = [
  scoreVariant("baseline", raw, targets, "none"),
  scoreVariant("drop pure X-X-X", raw, targets, "drop-xxx"),
  scoreVariant("drop ≥2 X", raw, targets, "drop-2x"),
  scoreVariant("drop any X", raw, targets, "drop-anyx"),
  scoreVariant("skip-X tokenization", raw, targets, "skip-x"),
];

console.log("\n\n=== summary ===");
console.log(
  `variant                  trigrams    recall@${TOP_K}    median   mean       Δrecall   Δmedian`,
);
const base = variants[0];
for (const v of variants) {
  const dRecall = v.inTopK - base.inTopK;
  const dMedian =
    v.medianRank != null && base.medianRank != null ? v.medianRank - base.medianRank : null;
  console.log(
    `${v.name.padEnd(24)} ${String(v.totalTrigrams).padStart(8)}    ${
      String(v.inTopK).padStart(2)
    }/${v.totalSiblings}    ${String(v.medianRank ?? "—").padStart(5)}   ${(v.meanRank ?? 0)
      .toFixed(0)
      .padStart(6)}     ${String(dRecall >= 0 ? "+" + dRecall : dRecall).padStart(4)}     ${
      dMedian == null ? "—" : String(dMedian >= 0 ? "+" + dMedian : dMedian)
    }`,
  );
}

// Per-sibling diff
function rescuesByVariant(variant) {
  const rescued = [];
  const lost = [];
  for (let i = 0; i < base.results.length; i++) {
    const b = base.results[i];
    const v = variant.results[i];
    if (!b.siblings || !v.siblings) continue;
    for (let j = 0; j < b.siblings.length; j++) {
      const baseRank = b.siblings[j]?.rank;
      const newRank = v.siblings[j]?.rank;
      const baseHit = baseRank !== null && baseRank <= TOP_K;
      const newHit = newRank !== null && newRank <= TOP_K;
      if (!baseHit && newHit)
        rescued.push({ target: b.target, sibling: b.siblings[j].mn, from: baseRank, to: newRank });
      if (baseHit && !newHit)
        lost.push({ target: b.target, sibling: b.siblings[j].mn, from: baseRank, to: newRank });
    }
  }
  return { rescued, lost };
}

console.log("\n=== per-sibling deltas (vs baseline) ===");
for (const v of variants.slice(1)) {
  const { rescued, lost } = rescuesByVariant(v);
  console.log(`\n[${v.name}]  rescued=${rescued.length}, lost=${lost.length}`);
  for (const r of rescued.slice(0, 15)) {
    console.log(`  RESCUED  ${r.target} → ${r.sibling}  rank ${r.from ?? "—"} → ${r.to}`);
  }
  for (const r of lost.slice(0, 15)) {
    console.log(`  LOST     ${r.target} → ${r.sibling}  rank ${r.from} → ${r.to ?? "—"}`);
  }
}

const outPath = path.resolve("trigram-xfilter-results.json");
await fs.writeFile(
  outPath,
  JSON.stringify(
    { ranAt: new Date().toISOString(), topK: TOP_K, corpusRecords: raw.length, variants },
    null,
    2,
  ),
);
console.log(`\n[xfilter] wrote ${outPath}`);
console.log(`[xfilter] total elapsed: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
