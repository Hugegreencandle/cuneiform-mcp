#!/usr/bin/env node
// v0.60.1 calibration audit: Jaccard vs Overlap coefficient.
//
// Replicates the validate-trigram.mjs harness from 2026-05-14 but
// computes BOTH metrics in a single pass for head-to-head comparison.
// Same validation set (validation-results.json, seed=42 N=50 targets,
// 87 known siblings), same denominator, different scorer.
//
// Background: Simonjetz et al. 2024 (LREC-COLING) showed that Jaccard
// is "inadequate because it is sensitive to size differences between
// the input documents" — they switched to overlap coefficient and
// achieved 94% Precision@3 on synthetic fragments. This audit asks:
// does overlap-coefficient improve recall@15 on the existing
// cuneiform-mcp validation set?

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
  return intersect / (a.size + b.size - intersect);
}

function overlapCoefficient(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const x of small) if (big.has(x)) intersect++;
  if (intersect === 0) return 0;
  return intersect / small.size;
}

function rankIn(sorted, mn) {
  for (let i = 0; i < sorted.length; i++) if (sorted[i].mn === mn) return i + 1;
  return null;
}

const t0 = Date.now();
console.error(`[v0.60.1] loading sign corpus...`);
const raw = JSON.parse(await fs.readFile(SIGNS_PATH, "utf8"));
console.error(`[v0.60.1] ${raw.length} records loaded`);

const tg = new Map();
for (const r of raw) {
  const set = trigramsFromSigns(r.signs);
  if (set.size > 0) tg.set(r._id, set);
}
console.error(`[v0.60.1] ${tg.size} fragments with ≥1 trigram`);

const baseline = JSON.parse(await fs.readFile(BASELINE_PATH, "utf8"));
const targets = baseline.results;
console.error(`[v0.60.1] ${targets.length} targets, top_k=${TOP_K}`);

// Score with both metrics in a single pass.
const results = [];
let scoredN = 0;
for (const t of targets) {
  scoredN++;
  const targetSet = tg.get(t.target);
  if (!targetSet || targetSet.size === 0) {
    results.push({ target: t.target, error: "no trigrams for target", siblings: t.siblings });
    continue;
  }

  const hitsJ = [];
  const hitsO = [];
  for (const [mn, candSet] of tg) {
    if (mn === t.target) continue;
    const j = jaccard(targetSet, candSet);
    const o = overlapCoefficient(targetSet, candSet);
    if (j > 0) hitsJ.push({ mn, score: j });
    if (o > 0) hitsO.push({ mn, score: o });
  }
  hitsJ.sort((a, b) => b.score - a.score);
  hitsO.sort((a, b) => b.score - a.score);

  const sibRanks = t.siblings.map((s) => ({
    mn: s.mn,
    rankJaccard: rankIn(hitsJ, s.mn),
    rankOverlap: rankIn(hitsO, s.mn),
  }));
  results.push({
    target: t.target,
    designation: t.designation,
    targetSize: targetSet.size,
    siblings: sibRanks,
  });
  if (scoredN % 10 === 0 || scoredN === targets.length) {
    console.error(`[v0.60.1] scored ${scoredN}/${targets.length}`);
  }
}

// Aggregate.
let totalSiblings = 0;
let inTopK_J = 0, inTopK_O = 0;
let inEither = 0, inBoth = 0;
const ranksJ = [], ranksO = [];
const winsOverlap = []; // overlap found, jaccard missed
const winsJaccard = []; // jaccard found, overlap missed
const ties = []; // both hit but at different ranks

for (const r of results) {
  if (r.error) continue;
  for (const s of r.siblings) {
    totalSiblings++;
    const hitJ = s.rankJaccard !== null && s.rankJaccard <= TOP_K;
    const hitO = s.rankOverlap !== null && s.rankOverlap <= TOP_K;
    if (hitJ) inTopK_J++;
    if (hitO) inTopK_O++;
    if (hitJ || hitO) inEither++;
    if (hitJ && hitO) inBoth++;
    if (hitO && !hitJ) winsOverlap.push({ target: r.target, sibling: s.mn, rankJ: s.rankJaccard, rankO: s.rankOverlap });
    if (hitJ && !hitO) winsJaccard.push({ target: r.target, sibling: s.mn, rankJ: s.rankJaccard, rankO: s.rankOverlap });
    if (hitJ && hitO && s.rankJaccard !== s.rankOverlap) {
      ties.push({ target: r.target, sibling: s.mn, rankJ: s.rankJaccard, rankO: s.rankOverlap });
    }
    if (s.rankJaccard !== null) ranksJ.push(s.rankJaccard);
    if (s.rankOverlap !== null) ranksO.push(s.rankOverlap);
  }
}

const median = (arr) => (arr.length === 0 ? null : [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)]);
const mean = (arr) => (arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length);

// === Markdown report to stdout ===
console.log(`# v0.60.1 Calibration Audit — Jaccard vs Overlap Coefficient`);
console.log(``);
console.log(`Generated: ${new Date().toISOString()}`);
console.log(`Corpus: ${tg.size} fragments with ≥1 trigram`);
console.log(`Validation set: ${results.filter((r) => !r.error).length} targets, ${totalSiblings} known siblings`);
console.log(`Top-K: ${TOP_K}`);
console.log(`Elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(``);
console.log(`## Headline`);
console.log(``);
console.log(`| Metric | Recall@${TOP_K} | Mean rank | Median rank |`);
console.log(`|---|---|---|---|`);
console.log(`| Jaccard (default) | ${inTopK_J}/${totalSiblings} (${(100 * inTopK_J / totalSiblings).toFixed(1)}%) | ${mean(ranksJ)?.toFixed(1) ?? "—"} | ${median(ranksJ) ?? "—"} |`);
console.log(`| Overlap (v0.60) | ${inTopK_O}/${totalSiblings} (${(100 * inTopK_O / totalSiblings).toFixed(1)}%) | ${mean(ranksO)?.toFixed(1) ?? "—"} | ${median(ranksO) ?? "—"} |`);
console.log(``);
const delta = inTopK_O - inTopK_J;
console.log(`**Recall delta:** Overlap ${delta >= 0 ? "+" : ""}${delta} siblings vs Jaccard (${delta >= 0 ? "+" : ""}${(100 * delta / totalSiblings).toFixed(1)} percentage points).`);
console.log(``);
console.log(`## Method overlap`);
console.log(``);
console.log(`| Category | Count | % of total siblings |`);
console.log(`|---|---|---|`);
console.log(`| Both methods found (within top ${TOP_K}) | ${inBoth} | ${(100 * inBoth / totalSiblings).toFixed(1)}% |`);
console.log(`| Either method found | ${inEither} | ${(100 * inEither / totalSiblings).toFixed(1)}% |`);
console.log(`| Overlap-only wins (Jaccard missed) | ${winsOverlap.length} | ${(100 * winsOverlap.length / totalSiblings).toFixed(1)}% |`);
console.log(`| Jaccard-only wins (Overlap missed) | ${winsJaccard.length} | ${(100 * winsJaccard.length / totalSiblings).toFixed(1)}% |`);
console.log(`| Both hit but at different ranks | ${ties.length} | ${(100 * ties.length / totalSiblings).toFixed(1)}% |`);
console.log(``);

console.log(`## Verdict`);
console.log(``);
if (inTopK_O > inTopK_J + 2) {
  console.log(`**Switch the default to overlap.** Overlap recovers ${delta} more siblings at recall@${TOP_K} on the existing validation set, exceeding noise. Recommend updating find_parallel_text default in v0.61 and re-tuning the run-bonus calibration accordingly.`);
} else if (inTopK_O > inTopK_J) {
  console.log(`**Marginal overlap improvement.** Overlap recovers ${delta} more siblings (within typical run-to-run noise). Keep Jaccard as default; expose overlap as opt-in scorer for size-asymmetric edge cases. Re-validate at higher N to confirm.`);
} else if (inTopK_O === inTopK_J) {
  console.log(`**Tie.** Both metrics produce identical recall@${TOP_K} on this validation set. The Simonjetz et al. 2024 size-asymmetry advantage of overlap does not materialize on this corpus — likely because the validation set's targets and known siblings are similar in size (both intra-corpus). Keep Jaccard as default.`);
} else {
  console.log(`**Jaccard wins.** Overlap recovers ${-delta} fewer siblings at recall@${TOP_K}. Keep Jaccard as default. The size-asymmetry advantage Simonjetz reports may not transfer to discovery-style queries where the target is a fragment matching its peers (not a fragment matching a much-larger chapter).`);
}
console.log(``);

if (winsOverlap.length > 0) {
  console.log(`## Overlap-only wins (first 10)`);
  console.log(``);
  console.log(`These are siblings overlap finds within top-${TOP_K} that Jaccard misses or ranks lower.`);
  console.log(``);
  console.log(`| Target | Sibling | Rank (Jaccard) | Rank (Overlap) |`);
  console.log(`|---|---|---|---|`);
  for (const w of winsOverlap.slice(0, 10)) {
    console.log(`| \`${w.target}\` | \`${w.sibling}\` | ${w.rankJ ?? "—"} | ${w.rankO} |`);
  }
  console.log(``);
}

if (winsJaccard.length > 0) {
  console.log(`## Jaccard-only wins (first 10)`);
  console.log(``);
  console.log(`These are siblings Jaccard finds within top-${TOP_K} that Overlap misses.`);
  console.log(``);
  console.log(`| Target | Sibling | Rank (Jaccard) | Rank (Overlap) |`);
  console.log(`|---|---|---|---|`);
  for (const w of winsJaccard.slice(0, 10)) {
    console.log(`| \`${w.target}\` | \`${w.sibling}\` | ${w.rankJ} | ${w.rankO ?? "—"} |`);
  }
  console.log(``);
}

if (ties.length > 0) {
  console.log(`## Rank disagreements (both hit, different rank — first 10)`);
  console.log(``);
  console.log(`| Target | Sibling | Rank (Jaccard) | Rank (Overlap) | Delta |`);
  console.log(`|---|---|---|---|---|`);
  for (const t of ties.slice(0, 10)) {
    const d = (t.rankJ ?? 999) - (t.rankO ?? 999);
    console.log(`| \`${t.target}\` | \`${t.sibling}\` | ${t.rankJ} | ${t.rankO} | ${d >= 0 ? "+" : ""}${d} |`);
  }
  console.log(``);
}

console.log(`## Caveats`);
console.log(``);
console.log(`- This validation set has ${totalSiblings} known siblings — a small sample. Confidence intervals on recall@${TOP_K} are wide.`);
console.log(`- The set was built from eBL's published joins[] arrays, which mix physical joins (same tablet broken apart) and parallel manuscripts (different tablets of the same composition). Both metrics may behave differently on these two classes.`);
console.log(`- The size-asymmetry advantage Simonjetz et al. report applies to fragment-vs-chapter matching (their LCS/N-W comparison). Cuneiform-mcp's primary use case is fragment-vs-fragment, where the asymmetry is less pronounced.`);
console.log(``);
console.log(`---`);
console.log(``);
console.log(`Re-run: \`node scripts/audit-v0.60.1-jaccard-vs-overlap.mjs [TOP_K]\``);
