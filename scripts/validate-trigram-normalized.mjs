// Sign-variant normalization experiment. Same 50 targets + 87 siblings as
// `validate-trigram.mjs`, but trigram emission now applies two normalization
// rules from POLISH-QUEUE.md (P4 § "sign-variant normalization"):
//
//   Rule 1 (vN collapse): ABZ406v2 → ABZ406. Strips a `vN` suffix from any
//   token that looks like `ABZ<digits>v<digits>`. Other tokens pass through.
//
//   Rule 2 (slash split): "ABZ85/ABZ84" → emit trigrams for BOTH readings as
//   parallel alternatives at that position. Implementation: when we encounter
//   a slash token, treat it as a set of N alternatives and emit one trigram
//   for every combination of choices in the 3-token window.
//
// Tokenization otherwise matches the baseline: space-separated within a line,
// newlines mark tablet-line boundaries, no cross-line trigrams, X kept as-is.
//
// The runs four variants for comparison:
//   - baseline: neither rule (re-derived to confirm we match validate-trigram.mjs)
//   - vN only
//   - slash only
//   - both
//
// CLI: node scripts/validate-trigram-normalized.mjs [TOP_K]

import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR ?? path.join(os.homedir(), ".cache", "cuneiform-mcp");
const SIGNS_PATH = path.join(CACHE_DIR, "all-signs-full.json");
const BASELINE_PATH = path.resolve("validation-results.json");
const TOP_K = Number.parseInt(process.argv[2] ?? "15", 10);

function expandToken(tok, applySlash) {
  // Returns array of "alternative readings" for this token position. For
  // non-slash tokens this is always a 1-element array.
  if (!applySlash || !tok.includes("/")) return [tok];
  const parts = tok.split("/");
  // Each part is a candidate sign. Empty parts (e.g. "ABZ85/") shouldn't
  // happen in practice but defend against them.
  const clean = parts.filter(Boolean);
  return clean.length === 0 ? [tok] : clean;
}

function normalizeToken(tok, opts) {
  // opts is { vN: bool, letterSuffix: bool, nVariant: bool }
  if (typeof opts === "boolean") opts = { vN: opts };
  let out = tok;
  if (opts.vN) out = out.replace(/^(ABZ\d+)v\d+$/, "$1");
  if (opts.letterSuffix) out = out.replace(/^(ABZ\d+)[a-z]+$/, "$1");
  if (opts.nVariant) out = out.replace(/^(ABZ\d+)n\d+$/, "$1");
  return out;
}

function trigramsFromSigns(signs, opts) {
  const out = new Set();
  if (!signs) return out;
  const normOpts = {
    vN: !!opts.applyVn,
    letterSuffix: !!opts.applyLetterSuffix,
    nVariant: !!opts.applyNvariant,
  };
  for (const line of signs.split(/\r?\n/)) {
    const toks = line
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => normalizeToken(t, normOpts));
    if (toks.length < 3) continue;
    const alts = toks.map((t) => expandToken(t, opts.applySlash));
    for (let i = 0; i + 2 < alts.length; i++) {
      // Cartesian product across the three positions of the trigram.
      for (const a of alts[i]) {
        for (const b of alts[i + 1]) {
          for (const c of alts[i + 2]) {
            out.add(a + " " + b + " " + c);
          }
        }
      }
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

function buildIndex(raw, opts) {
  const tg = new Map();
  let total = 0;
  for (const r of raw) {
    const set = trigramsFromSigns(r.signs, opts);
    if (set.size > 0) {
      tg.set(r._id, set);
      total += set.size;
    }
  }
  return { tg, total };
}

function scoreVariant(name, raw, targets, opts) {
  const t0 = Date.now();
  console.log(`\n=== variant: ${name} ===`);
  console.log(`  options: ${JSON.stringify(opts)}`);
  const { tg, total } = buildIndex(raw, opts);
  console.log(`  ${tg.size} fragments indexed, ${total} trigram instances`);

  const results = [];
  let scoredN = 0;
  let inTopK = 0;
  let totalSiblings = 0;
  const ranks = [];
  const buckets = {
    top15: 0,
    top50: 0,
    top100: 0,
    top500: 0,
    top1k: 0,
    top5k: 0,
    top10k: 0,
    beyond: 0,
    none: 0,
  };

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
        if (r <= 15) buckets.top15++;
        else if (r <= 50) buckets.top50++;
        else if (r <= 100) buckets.top100++;
        else if (r <= 500) buckets.top500++;
        else if (r <= 1000) buckets.top1k++;
        else if (r <= 5000) buckets.top5k++;
        else if (r <= 10000) buckets.top10k++;
        else buckets.beyond++;
      } else {
        buckets.none++;
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
  console.log(`  median rank: ${median(ranks) ?? "—"}    mean rank: ${mean(ranks)?.toFixed(1) ?? "—"}`);
  console.log(`  elapsed: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  return {
    name,
    opts,
    corpusSize: tg.size,
    totalSiblings,
    inTopK,
    recall: inTopK / totalSiblings,
    medianRank: median(ranks),
    meanRank: mean(ranks),
    buckets,
    results,
  };
}

const t0 = Date.now();
console.log(`[normalize] loading sign corpus from ${SIGNS_PATH}...`);
const raw = JSON.parse(await fs.readFile(SIGNS_PATH, "utf8"));
console.log(`[normalize] ${raw.length} records loaded`);

console.log(`[normalize] loading baseline (validation-results.json)...`);
const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
const targets = baseline.results;
console.log(`[normalize] ${targets.length} targets to evaluate, TOP_K=${TOP_K}`);

const variants = [
  scoreVariant("baseline", raw, targets, {}),
  scoreVariant("vN-collapse", raw, targets, { applyVn: true }),
  scoreVariant("slash-split", raw, targets, { applySlash: true }),
  scoreVariant("letter-suffix", raw, targets, { applyLetterSuffix: true }),
  scoreVariant("nN-variant", raw, targets, { applyNvariant: true }),
  scoreVariant("all-conservative (vN+slash)", raw, targets, {
    applyVn: true,
    applySlash: true,
  }),
  scoreVariant("all-aggressive (vN+slash+letter+nN)", raw, targets, {
    applyVn: true,
    applySlash: true,
    applyLetterSuffix: true,
    applyNvariant: true,
  }),
];

console.log("\n\n=== summary ===");
console.log(
  `variant                          recall@${TOP_K}    median   mean       Δrecall   Δmedian`,
);
const base = variants[0];
for (const v of variants) {
  const dRecall = v.inTopK - base.inTopK;
  const dMedian = v.medianRank != null && base.medianRank != null ? v.medianRank - base.medianRank : null;
  console.log(
    `${v.name.padEnd(32)} ${String(v.inTopK).padStart(2)}/${v.totalSiblings}    ${
      String(v.medianRank ?? "—").padStart(5)
    }   ${(v.meanRank ?? 0).toFixed(0).padStart(6)}     ${String(dRecall >= 0 ? "+" + dRecall : dRecall).padStart(4)}     ${dMedian == null ? "—" : String(dMedian >= 0 ? "+" + dMedian : dMedian)}`,
  );
}

// Per-sibling diff: which siblings did each rule rescue?
console.log("\n=== per-sibling deltas (vs baseline) ===");
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
      if (!baseHit && newHit) rescued.push({ target: b.target, sibling: b.siblings[j].mn, from: baseRank, to: newRank });
      if (baseHit && !newHit) lost.push({ target: b.target, sibling: b.siblings[j].mn, from: baseRank, to: newRank });
    }
  }
  return { rescued, lost };
}

for (const v of variants.slice(1)) {
  const { rescued, lost } = rescuesByVariant(v);
  console.log(`\n[${v.name}]  rescued=${rescued.length}, lost=${lost.length}`);
  for (const r of rescued.slice(0, 10)) {
    console.log(`  RESCUED  ${r.target} → ${r.sibling}  rank ${r.from ?? "—"} → ${r.to}`);
  }
  for (const r of lost.slice(0, 10)) {
    console.log(`  LOST     ${r.target} → ${r.sibling}  rank ${r.from} → ${r.to ?? "—"}`);
  }
}

const outPath = path.resolve("trigram-normalized-results.json");
await fs.writeFile(
  outPath,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      topK: TOP_K,
      corpusRecords: raw.length,
      variants,
    },
    null,
    2,
  ),
);
console.log(`\n[normalize] wrote ${outPath}`);
console.log(`[normalize] total elapsed: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
