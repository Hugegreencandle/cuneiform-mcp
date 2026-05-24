#!/usr/bin/env node
// Round-16 calibration audit: restore_lacuna_semantic (v0.30).
//
// The §3.5 lacuna restorer (v0.18.0 production) ships 92% top-1 precision on
// the parallel-template alignment task. This audit tests the v0.30 SEMANTIC
// AUGMENTATION — a complementary single-position prediction path that fuses
// the bigram baseline with a sign2vec centroid prior.
//
// Three tests:
//
//   T1. Sanity — tool runs on a real corpus tablet, returns ≥10 candidates,
//                score decomposition (joint/bigram/sign2vec) populated, and
//                the surrounding_signs block correctly identifies the
//                visible neighbors.
//
//   T2. Bigram-baseline preserved at alpha=1.0 — at pure-bigram weighting,
//                the joint top-1 must equal the pure_bigram_top1 (trivially
//                true by construction, but the test guards against a refactor
//                that drifts the joint score away from the bigram axis).
//
//   T3. sign2vec contribution — on a 10-tablet sample, the alpha=0.0 top-1
//                disagrees with the alpha=1.0 top-1 on ≥ 30% of cases. This
//                proves the semantic axis is providing INDEPENDENT signal
//                rather than re-deriving the bigram ranking.
//
// Eyeball: one fully decomposed prediction for a chosen tablet at position 20.

import {
  restoreLacunaSemantic,
  listIndexedTablets,
  getTabletTokens,
} from "../dist/restoreLacunaSemantic.js";
import { signEmbeddingStats } from "../dist/signEmbeddings.js";

const results = [];
function report(name, pass, detail) {
  const tag = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`\n${tag} — ${name}`);
  if (detail) console.log(`  ${detail}`);
  results.push({ name, pass });
}

function header(title) {
  console.log(`\n══════════════════════════════════════════════════════════════════════`);
  console.log(`▶ ${title}`);
  console.log(`══════════════════════════════════════════════════════════════════════`);
}

// ─── Pre-flight ──────────────────────────────────────────────────────────

header("Pre-flight: sign2vec index + signs corpus");

const embStats = signEmbeddingStats();
console.log(JSON.stringify(embStats, null, 2));
if (!embStats.loaded) {
  console.error("\nABORT: sign-embeddings not loaded. Run scripts/build-sign-embeddings.mjs first.");
  process.exit(1);
}

const indexed = listIndexedTablets();
console.log(`\n  indexed tablets in signs cache: ${indexed.length}`);
if (indexed.length === 0) {
  console.error("\nABORT: no tablets in signs cache.");
  process.exit(1);
}

// Pick a stable sample of "medium" tablets (100-200 signs) with at least one
// token at position 20. Use a deterministic ordering so the audit is
// reproducible.
const mediumTablets = indexed
  .filter((t) => t.length >= 100 && t.length <= 200)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
console.log(`  tablets in [100, 200] sign band: ${mediumTablets.length}`);

if (mediumTablets.length < 10) {
  console.error("\nABORT: not enough medium-length tablets for the 10-sample T3 test.");
  process.exit(1);
}

const SAMPLE_TABLETS = mediumTablets.slice(0, 10);
const FOCUS_TABLET = SAMPLE_TABLETS[0];
const FOCUS_POSITION = 20;

// ─── TEST 1: Sanity ───────────────────────────────────────────────────────

header(
  `TEST 1: Sanity — tool returns ≥10 candidates with decomposed scores on a real tablet (${FOCUS_TABLET.id}, position ${FOCUS_POSITION})`,
);

const r1 = restoreLacunaSemantic({
  tablet_id: FOCUS_TABLET.id,
  lacuna_position: FOCUS_POSITION,
  top_k: 10,
  alpha: 0.5,
});

let t1Pass = true;
const issues = [];
if (r1.predictions.length < 10) {
  t1Pass = false;
  issues.push(`expected ≥10 predictions, got ${r1.predictions.length}`);
}
for (const p of r1.predictions) {
  if (typeof p.joint_score !== "number" || typeof p.bigram_score !== "number" || typeof p.sign2vec_score !== "number") {
    t1Pass = false;
    issues.push(`prediction for ${p.sign} missing score decomposition`);
    break;
  }
}
if (!r1.ablation || !r1.ablation.joint_top1) {
  t1Pass = false;
  issues.push("ablation block missing joint_top1");
}
// Verify surrounding_signs has at least left1 or right1 (else we'd expect a
// warning about insufficient context — but at position 20 in a 100+ sign
// tablet we should always have neighbors).
if (!r1.surrounding_signs.left1 && !r1.surrounding_signs.right1) {
  t1Pass = false;
  issues.push("surrounding_signs has no left1 or right1");
}

console.log(
  `  surrounding: left2=${r1.surrounding_signs.left2} left1=${r1.surrounding_signs.left1} ▢ right1=${r1.surrounding_signs.right1} right2=${r1.surrounding_signs.right2}`,
);
console.log(`  context signs with embedding: ${r1.embedding_stats.context_signs_with_embedding}/4`);
console.log(`  predictions returned: ${r1.predictions.length}`);
console.log(
  `  ablation: bigram=${r1.ablation.pure_bigram_top1} sign2vec=${r1.ablation.pure_sign2vec_top1} joint=${r1.ablation.joint_top1} (${r1.ablation.agreement})`,
);
if (r1.warnings.length > 0) console.log(`  warnings: ${r1.warnings.join("; ")}`);

report(
  "tool runs, ≥10 candidates with score decomposition, ablation populated",
  t1Pass,
  t1Pass
    ? `predictions=${r1.predictions.length}, agreement=${r1.ablation.agreement}`
    : issues.join("; "),
);

// ─── TEST 2: alpha=1.0 → joint top-1 == pure_bigram_top1 ──────────────────

header(
  "TEST 2: At alpha=1.0 (pure bigram), joint_top1 must equal pure_bigram_top1 on every tablet in the 10-sample (bigram baseline preserved)",
);

let t2Pass = true;
const t2Rows = [];
for (const t of SAMPLE_TABLETS) {
  const r = restoreLacunaSemantic({
    tablet_id: t.id,
    lacuna_position: FOCUS_POSITION,
    top_k: 5,
    alpha: 1.0,
  });
  const ok = r.ablation.joint_top1 === r.ablation.pure_bigram_top1;
  if (!ok) t2Pass = false;
  t2Rows.push({
    id: t.id,
    bigram_top1: r.ablation.pure_bigram_top1,
    joint_top1: r.ablation.joint_top1,
    ok,
  });
}
console.log(`  ${"tablet".padEnd(36)}  ${"bigram_top1".padEnd(12)}  ${"joint_top1".padEnd(12)}  ok`);
for (const row of t2Rows) {
  console.log(
    `  ${row.id.padEnd(36)}  ${(row.bigram_top1 ?? "(null)").padEnd(12)}  ${(row.joint_top1 ?? "(null)").padEnd(12)}  ${row.ok ? "✓" : "✗"}`,
  );
}
report(
  "alpha=1.0 preserves bigram baseline on all 10 sample tablets",
  t2Pass,
  `agreements: ${t2Rows.filter((r) => r.ok).length}/${t2Rows.length}`,
);

// ─── TEST 3: sign2vec contribution — alpha=0 vs alpha=1 disagree ≥ 30% ──

header(
  "TEST 3: sign2vec INDEPENDENT-signal — on the 10-tablet sample, alpha=0.0 top-1 differs from alpha=1.0 top-1 on ≥ 30%",
);

const DISAGREE_FLOOR = 0.3;
let disagreeCount = 0;
let evaluable = 0;
const t3Rows = [];
for (const t of SAMPLE_TABLETS) {
  const pureBigram = restoreLacunaSemantic({
    tablet_id: t.id,
    lacuna_position: FOCUS_POSITION,
    top_k: 3,
    alpha: 1.0,
  });
  const pureSign2vec = restoreLacunaSemantic({
    tablet_id: t.id,
    lacuna_position: FOCUS_POSITION,
    top_k: 3,
    alpha: 0.0,
  });
  const bigTop = pureBigram.ablation.joint_top1;
  const semTop = pureSign2vec.ablation.joint_top1;
  if (bigTop && semTop) {
    evaluable++;
    if (bigTop !== semTop) disagreeCount++;
  }
  t3Rows.push({
    id: t.id,
    bigram_top1: bigTop,
    sign2vec_top1: semTop,
    disagree: bigTop && semTop && bigTop !== semTop,
  });
}

const disagreeRate = evaluable > 0 ? disagreeCount / evaluable : 0;
console.log(`  ${"tablet".padEnd(36)}  ${"α=1.0 top1".padEnd(12)}  ${"α=0.0 top1".padEnd(12)}  disagree?`);
for (const row of t3Rows) {
  console.log(
    `  ${row.id.padEnd(36)}  ${(row.bigram_top1 ?? "(null)").padEnd(12)}  ${(row.sign2vec_top1 ?? "(null)").padEnd(12)}  ${row.disagree ? "✓" : "·"}`,
  );
}
console.log(`\n  disagreement rate: ${disagreeCount}/${evaluable} = ${(disagreeRate * 100).toFixed(1)}%`);

const t3Pass = disagreeRate >= DISAGREE_FLOOR;
report(
  `α=0.0 vs α=1.0 top-1 disagreement rate ≥ ${(DISAGREE_FLOOR * 100).toFixed(0)}%`,
  t3Pass,
  `${disagreeCount}/${evaluable} = ${(disagreeRate * 100).toFixed(1)}% (floor ${(DISAGREE_FLOOR * 100).toFixed(0)}%)`,
);

// ─── Eyeball dump ────────────────────────────────────────────────────────

header(
  `Eyeball: full decomposition for ${FOCUS_TABLET.id} position ${FOCUS_POSITION} at alpha=0.5`,
);

const focusTokens = getTabletTokens(FOCUS_TABLET.id) ?? [];
const startWin = Math.max(0, FOCUS_POSITION - 5);
const endWin = Math.min(focusTokens.length, FOCUS_POSITION + 6);
const window = focusTokens.slice(startWin, endWin)
  .map((t, i) => (startWin + i === FOCUS_POSITION ? `[${t}]` : t))
  .join(" ");
console.log(`  tablet length: ${focusTokens.length} signs`);
console.log(`  window ±5 around position ${FOCUS_POSITION}: ${window}`);
console.log(`  (the masked target is the actual sign at position ${FOCUS_POSITION}: "${focusTokens[FOCUS_POSITION]}")`);
console.log("");
console.log(`  ${"rank".padStart(4)}  ${"sign".padEnd(12)}  ${"joint".padStart(8)}  ${"bigram_raw".padStart(12)}  ${"sign2vec".padStart(10)}`);
for (const p of r1.predictions) {
  console.log(
    `  ${p.rank_by_joint.toString().padStart(4)}  ${p.sign.padEnd(12)}  ${p.joint_score.toFixed(4).padStart(8)}  ${p.bigram_score.toExponential(3).padStart(12)}  ${p.sign2vec_score.toFixed(4).padStart(10)}`,
  );
}

// Was the actual sign in the top-10?
const actualSign = focusTokens[FOCUS_POSITION];
const hitRank = r1.predictions.findIndex((p) => p.sign === actualSign);
if (hitRank >= 0) {
  console.log(`\n  ✓ ground-truth sign "${actualSign}" appears at rank ${hitRank + 1} in joint top-10`);
} else {
  console.log(`\n  · ground-truth sign "${actualSign}" not in joint top-10 (this is informational, not a test)`);
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════════════════════════`);
console.log(`Round-16 audit summary: ${results.filter((r) => r.pass).length}/${results.length} passed`);
console.log(`══════════════════════════════════════════════════════════════════════\n`);
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.name}`);
}
console.log("");

if (results.some((r) => !r.pass)) process.exit(2);
