#!/usr/bin/env node
// v0.58 cross-validation: does isotonic regression beat Platt on the
// v0.30 lacuna-fusion calibration samples?
//
// The v0.50 paper claim is "Platt scaling reduces ECE 0.6374 → 0.0109
// (58× lift)." But the wallet-fingerprint v0.6.2 work demonstrated
// that isotonic dominates Platt cleanly when the score distribution
// is near-step rather than sigmoid-shaped. This script asks: is the
// v0.30 lacuna joint_score distribution near-step (isotonic wins) or
// continuous sigmoid (Platt is correct)?
//
// Single source of truth: ~/.cache/cuneiform-mcp/lacuna-bleu-calibration-samples.json
// 500 samples, each { predicted_probability, correct }.
//
// Implementation note: this is a one-shot diagnostic, so calibration
// code is inlined rather than imported from wallet-fingerprint.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const samples = JSON.parse(
  readFileSync(join(homedir(), ".cache", "cuneiform-mcp", "lacuna-bleu-calibration-samples.json"), "utf-8"),
).calibration_samples;

const scores = samples.map((s) => s.predicted_probability);
const labels = samples.map((s) => (s.correct ? 1 : 0));
const N = scores.length;

console.log(`# Isotonic-vs-Platt Cross-Validation on v0.30 Lacuna Fusion`);
console.log("");
console.log(`Samples: ${N}`);
console.log(`Positive rate: ${(labels.filter((y) => y === 1).length / N * 100).toFixed(1)}%`);
console.log("");

// === ECE ===
function computeECE(scores, labels, nBins = 10) {
  const bins = Array.from({ length: nBins }, (_, i) => ({
    lo: i / nBins, hi: (i + 1) / nBins,
    count: 0, sumScore: 0, sumLabel: 0,
  }));
  for (let i = 0; i < scores.length; i++) {
    const s = Math.max(0, Math.min(1, scores[i]));
    let b = Math.floor(s * nBins);
    if (b >= nBins) b = nBins - 1;
    bins[b].count++;
    bins[b].sumScore += s;
    bins[b].sumLabel += labels[i];
  }
  let ece = 0;
  for (const b of bins) {
    if (b.count === 0) continue;
    b.meanScore = b.sumScore / b.count;
    b.meanLabel = b.sumLabel / b.count;
    b.gap = Math.abs(b.meanLabel - b.meanScore);
    ece += (b.count / scores.length) * b.gap;
  }
  return { ece, bins };
}

function renderBins(result) {
  const lines = [];
  lines.push("| Bin           | Count | Pred  | Obs   | Gap   |");
  lines.push("|---------------|-------|-------|-------|-------|");
  for (const b of result.bins) {
    if (b.count === 0) {
      lines.push(`| [${b.lo.toFixed(2)}, ${b.hi.toFixed(2)}) | 0     | —     | —     | —     |`);
    } else {
      const arrow = b.meanLabel > b.meanScore ? "▲" : b.meanLabel < b.meanScore ? "▼" : "=";
      lines.push(
        `| [${b.lo.toFixed(2)}, ${b.hi.toFixed(2)}) | ${String(b.count).padEnd(5)} | ${b.meanScore.toFixed(3)} | ${b.meanLabel.toFixed(3)} ${arrow} | ${b.gap.toFixed(3)} |`,
      );
    }
  }
  return lines.join("\n");
}

// === Platt (sign-corrected, with best-NLL tracking) ===
function fitPlatt(scores, labels, opts = {}) {
  const maxIter = opts.maxIter ?? 500;
  const lr0 = opts.lr ?? 0.1;
  let A = -1, B = 0;
  let bestNLL = Infinity, bestA = A, bestB = B;
  let prevNLL = Infinity;
  const N = scores.length;
  for (let iter = 0; iter < maxIter; iter++) {
    let gA = 0, gB = 0, nll = 0;
    for (let i = 0; i < N; i++) {
      const z = -(A * scores[i] + B);
      const p = 1 / (1 + Math.exp(-z));
      const y = labels[i];
      const diff = y - p;
      gA += scores[i] * diff;
      gB += diff;
      nll -= y * Math.log(p + 1e-12) + (1 - y) * Math.log(1 - p + 1e-12);
    }
    gA /= N; gB /= N; nll /= N;
    if (nll < bestNLL) { bestNLL = nll; bestA = A; bestB = B; }
    const lr = nll > prevNLL ? lr0 / Math.max(1, iter / 20) : lr0;
    A -= lr * gA; B -= lr * gB;
    if (Math.abs(prevNLL - nll) < 1e-7) break;
    prevNLL = nll;
  }
  return { A: bestA, B: bestB };
}

function applyPlatt(score, A, B) {
  return 1 / (1 + Math.exp(A * score + B));
}

// === Isotonic (PAV) ===
function fitIsotonic(scores, labels) {
  const sorted = scores.map((s, i) => ({ s, y: labels[i] })).sort((a, b) => a.s - b.s);
  const stack = [];
  for (const p of sorted) {
    let cur = { sum: p.y, n: 1, min_score: p.s, max_score: p.s, mean_label: p.y };
    while (stack.length > 0 && stack[stack.length - 1].mean_label > cur.mean_label) {
      const top = stack.pop();
      cur = {
        sum: top.sum + cur.sum, n: top.n + cur.n,
        min_score: top.min_score, max_score: cur.max_score,
        mean_label: (top.sum + cur.sum) / (top.n + cur.n),
      };
    }
    stack.push(cur);
  }
  // Compact adjacent blocks with identical mean.
  const compacted = [{ ...stack[0] }];
  for (let i = 1; i < stack.length; i++) {
    const top = compacted[compacted.length - 1];
    if (top.mean_label === stack[i].mean_label) {
      top.max_score = stack[i].max_score;
      top.n += stack[i].n;
      top.sum += stack[i].sum;
    } else {
      compacted.push({ ...stack[i] });
    }
  }
  return compacted;
}

function applyIsotonic(score, blocks) {
  if (score <= blocks[0].min_score) return blocks[0].mean_label;
  if (score >= blocks[blocks.length - 1].max_score) return blocks[blocks.length - 1].mean_label;
  let lo = 0, hi = blocks.length - 1, best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (blocks[mid].min_score <= score) { best = mid; lo = mid + 1; }
    else hi = mid - 1;
  }
  return blocks[best].mean_label;
}

// === Run the comparison ===
console.log("## Pre-calibration (raw v0.30 lacuna fusion scores)");
console.log("");
const pre = computeECE(scores, labels);
console.log("```");
console.log(`ECE = ${pre.ece.toFixed(4)}`);
console.log("");
console.log(renderBins(pre));
console.log("```");
console.log("");

console.log("## Score distribution diagnostic");
console.log("");
console.log("Is the raw distribution near-step (isotonic territory) or sigmoid-shaped (Platt territory)?");
console.log("");
const zeroBin = pre.bins[0]; // [0, 0.1)
const lowFraction = (zeroBin?.count ?? 0) / N;
console.log(`- Fraction of mass in [0, 0.1): ${(lowFraction * 100).toFixed(1)}%`);
const highBin = pre.bins[pre.bins.length - 1]; // [0.9, 1)
const highFraction = (highBin?.count ?? 0) / N;
console.log(`- Fraction of mass in [0.9, 1): ${(highFraction * 100).toFixed(1)}%`);
const midFraction = 1 - lowFraction - highFraction;
console.log(`- Fraction of mass in [0.1, 0.9): ${(midFraction * 100).toFixed(1)}%`);
console.log("");
if (lowFraction + highFraction > 0.85) {
  console.log("→ **Near-step distribution.** Most mass at the extremes; isotonic should beat Platt cleanly.");
} else if (midFraction > 0.5) {
  console.log("→ **Continuous distribution.** Mass spread across mid-range; Platt's sigmoid family is well-matched.");
} else {
  console.log("→ **Mixed distribution.** Both methods may have valid niches.");
}
console.log("");

// Platt
console.log("## Platt scaling");
console.log("");
const platt = fitPlatt(scores, labels);
console.log(`Fit: A = ${platt.A.toFixed(4)}, B = ${platt.B.toFixed(4)}`);
const plattScores = scores.map((s) => applyPlatt(s, platt.A, platt.B));
const plattPost = computeECE(plattScores, labels);
console.log("");
console.log("```");
console.log(`ECE = ${plattPost.ece.toFixed(4)}`);
console.log("");
console.log(renderBins(plattPost));
console.log("```");
console.log("");
console.log(`**Platt result:** ECE ${pre.ece.toFixed(4)} → ${plattPost.ece.toFixed(4)} (${(pre.ece / Math.max(plattPost.ece, 1e-9)).toFixed(2)}× lift)`);
console.log("");

// Isotonic
console.log("## Isotonic regression (PAV)");
console.log("");
const isoBlocks = fitIsotonic(scores, labels);
console.log(`Blocks: ${isoBlocks.length}`);
const isoScores = scores.map((s) => applyIsotonic(s, isoBlocks));
const isoPost = computeECE(isoScores, labels);
console.log("");
console.log("```");
console.log(`ECE = ${isoPost.ece.toFixed(4)}`);
console.log("");
console.log(renderBins(isoPost));
console.log("```");
console.log("");
console.log(`**Isotonic result:** ECE ${pre.ece.toFixed(4)} → ${isoPost.ece.toFixed(4)} (${(pre.ece / Math.max(isoPost.ece, 1e-9)).toFixed(2)}× lift)`);
console.log("");

// Block structure
console.log("Block structure:");
console.log("");
console.log("| Block | Score range | n | mean_label |");
console.log("|---|---|---|---|");
for (let i = 0; i < isoBlocks.length; i++) {
  const b = isoBlocks[i];
  console.log(`| ${i + 1} | [${b.min_score.toFixed(4)}, ${b.max_score.toFixed(4)}] | ${b.n} | ${b.mean_label.toFixed(4)} |`);
}
console.log("");

// === Summary ===
console.log("---");
console.log("");
console.log("## Verdict");
console.log("");

const plattLift = pre.ece / Math.max(plattPost.ece, 1e-9);
const isoLift = pre.ece / Math.max(isoPost.ece, 1e-9);
const plattHelped = plattPost.ece < pre.ece;
const isoHelped = isoPost.ece < pre.ece;

console.log("| Method | Pre-ECE | Post-ECE | Lift |");
console.log("|---|---|---|---|");
console.log(`| (raw) | ${pre.ece.toFixed(4)} | — | 1.00× |`);
console.log(`| Platt | ${pre.ece.toFixed(4)} | ${plattPost.ece.toFixed(4)} | ${plattLift.toFixed(2)}× |`);
console.log(`| Isotonic | ${pre.ece.toFixed(4)} | ${isoPost.ece.toFixed(4)} | ${isoLift.toFixed(2)}× |`);
console.log("");

if (isoPost.ece < plattPost.ece * 0.5) {
  console.log("**Isotonic strictly dominates Platt** — refinement worth adding to methods paper §3.31 / Claim 51.");
} else if (isoPost.ece < plattPost.ece) {
  console.log("**Isotonic modestly beats Platt** — consider noting in methods paper as a refinement.");
} else if (Math.abs(isoPost.ece - plattPost.ece) < 0.005) {
  console.log("**Platt and isotonic tie.** v0.50's Platt choice is validated; either method works on this distribution.");
} else {
  console.log("**Platt beats isotonic** on this distribution — v0.50's choice is correct, and the score distribution must be continuous-sigmoid-shaped (not near-step).");
}
console.log("");
console.log("v0.50 paper claim cross-check: previous report stated 'ECE 0.6374 → 0.0109' from Platt.");
console.log(`This re-run: ECE ${pre.ece.toFixed(4)} → ${plattPost.ece.toFixed(4)} from Platt.`);
const v050Match = Math.abs(pre.ece - 0.6374) < 0.005 && Math.abs(plattPost.ece - 0.0109) < 0.005;
console.log(v050Match ? "✓ Matches v0.50 paper claim." : "⚠ Does not match v0.50 — likely different Platt fit settings or random seed.");
