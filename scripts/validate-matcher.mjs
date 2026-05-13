// Validation harness for find_join_candidates.
//
// Approach:
//   1. Load the local JSONL corpus (the same one find_join_candidates reads).
//   2. Sample N fragments with non-trivial lineToVec (length >= 3 lines).
//   3. For each sampled target, fetch its full /fragments/<id> record to get
//      the authoritative `joins[]` list (the cache only stores museumNumber +
//      lineToVec + designation, so joins must be live-fetched).
//   4. Keep only targets whose joins[] contains at least one OTHER fragment
//      that's also present in the local corpus (so there's something to find).
//   5. For each such target, score against every other fragment using the
//      same scoreBoth() used by the live tool, sort by raw + by weighted,
//      and record where each known sibling lands.
//   6. Summarize: top-15 raw recall, top-15 weighted recall, mean/median
//      rank of known siblings, and the spread of "missed" siblings (rank
//      > 15) so we can see whether failures cluster.

import dns from "node:dns";
import net from "node:net";
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

import { loadCorpus } from "../dist/cache.js";
import { scoreBoth } from "../dist/lineToVecScore.js";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp-validator/0.1.0";

// Args: <targets-with-siblings> <seed> <top_k> <max-fetches>
// Sample is grown until N targets have at least one sibling in corpus
// (or max-fetches is exhausted). Most fragments have no joins[]; base rate
// is low, so a strict random-N approach yields too few scorable cases.
const ARG_N = Number.parseInt(process.argv[2] ?? "30", 10);
const ARG_SEED = Number.parseInt(process.argv[3] ?? "42", 10);
const ARG_TOP_K = Number.parseInt(process.argv[4] ?? "15", 10);
const ARG_MAX_FETCH = Number.parseInt(process.argv[5] ?? String(ARG_N * 12), 10);
const FETCH_CONCURRENCY = 5;

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

async function fetchJoins(museumNumber) {
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(museumNumber)}`;
  let res;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (!res.ok) return { error: `HTTP ${res.status}` };
  const body = await res.json();
  const joins = [];
  for (const group of body.joins ?? []) {
    for (const j of group) {
      if (j?.museumNumber) joins.push(fmtMn(j.museumNumber));
    }
  }
  return { joins, designation: body.designation };
}

function pickSample(fragments, n, rng) {
  const eligible = fragments.filter(
    (f) =>
      f.lineToVec &&
      f.lineToVec.length > 0 &&
      f.lineToVec.some((seq) => seq.length >= 3),
  );
  const indices = new Set();
  while (indices.size < Math.min(n, eligible.length)) {
    indices.add(Math.floor(rng() * eligible.length));
  }
  return [...indices].map((i) => eligible[i]);
}

function rankIn(sorted, museumNumber) {
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].museumNumber === museumNumber) return i + 1; // 1-indexed
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  console.log(`[validate] loading corpus...`);
  const corpus = await loadCorpus();
  if (corpus.missing) {
    console.error("[validate] corpus is empty — run --prefetch first.");
    process.exit(1);
  }
  console.log(
    `[validate] corpus: ${corpus.fragments.length} fragments at ${corpus.cachePath}`,
  );

  const byMn = new Map(corpus.fragments.map((f) => [f.museumNumber, f]));
  const rng = mulberry32(ARG_SEED);

  console.log(
    `[validate] hunting for ${ARG_N} targets-with-siblings (seed=${ARG_SEED}, top_k=${ARG_TOP_K}, max-fetches=${ARG_MAX_FETCH})...`,
  );

  // Pre-shuffle a wider eligibility pool so the concurrent workers can pull
  // from a fixed order without re-sampling.
  const eligiblePool = corpus.fragments.filter(
    (f) =>
      f.lineToVec &&
      f.lineToVec.length > 0 &&
      f.lineToVec.some((seq) => seq.length >= 3),
  );
  // Fisher-Yates with seeded RNG so runs are reproducible.
  for (let i = eligiblePool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [eligiblePool[i], eligiblePool[j]] = [eligiblePool[j], eligiblePool[i]];
  }
  const queue = eligiblePool.slice(0, ARG_MAX_FETCH);
  console.log(`[validate] eligible pool=${eligiblePool.length}, fetch cap=${queue.length}`);

  // Phase 1: concurrent fetch with early-stop once we have ARG_N keepers.
  const targets = [];
  const errors = [];
  let fetched = 0;
  let cursor = 0;
  let done = false;

  async function worker() {
    while (!done) {
      const i = cursor++;
      if (i >= queue.length) return;
      const cand = queue[i];
      fetched++;
      const { joins, designation, error } = await fetchJoins(cand.museumNumber);
      if (error) {
        errors.push({ mn: cand.museumNumber, error });
      } else {
        const siblingsInCorpus = (joins ?? [])
          .filter((mn) => mn !== cand.museumNumber)
          .filter((mn) => byMn.has(mn));
        if (siblingsInCorpus.length > 0) {
          targets.push({
            target: cand,
            designation,
            siblings: siblingsInCorpus,
            allDeclaredJoins: joins ?? [],
          });
          if (targets.length >= ARG_N) done = true;
        }
      }
      if (fetched % 25 === 0) {
        console.log(
          `[validate] fetched=${fetched}  keepers=${targets.length}/${ARG_N}  errors=${errors.length}`,
        );
      }
    }
  }
  await Promise.all(Array.from({ length: FETCH_CONCURRENCY }, () => worker()));
  console.log(
    `[validate] phase 1 done. fetched=${fetched}  keepers=${targets.length}  errors=${errors.length}`,
  );

  if (targets.length === 0) {
    console.log("[validate] no scorable targets — nothing to evaluate.");
    return;
  }

  // Phase 2: score each target against the full corpus. This is CPU-only,
  // so it's fast — Python eBL takes ~seconds per query; the TS port matches.
  console.log(`[validate] scoring ${targets.length} targets against full corpus...`);
  const results = [];
  let scoredN = 0;
  for (const t of targets) {
    scoredN++;
    const hits = [];
    for (const cand of corpus.fragments) {
      if (cand.museumNumber === t.target.museumNumber) continue;
      if (!cand.lineToVec || cand.lineToVec.length === 0) continue;
      const { score, scoreWeighted } = scoreBoth(t.target.lineToVec, cand.lineToVec);
      if (score === 0 && scoreWeighted === 0) continue;
      hits.push({ museumNumber: cand.museumNumber, score, weighted: scoreWeighted });
    }
    const byRaw = [...hits].sort(
      (a, b) => b.score - a.score || b.weighted - a.weighted,
    );
    const byWeighted = [...hits].sort(
      (a, b) => b.weighted - a.weighted || b.score - a.score,
    );
    const siblingRanks = t.siblings.map((mn) => ({
      mn,
      rankRaw: rankIn(byRaw, mn),
      rankWeighted: rankIn(byWeighted, mn),
    }));
    results.push({
      target: t.target.museumNumber,
      designation: t.designation ?? t.target.designation,
      siblings: siblingRanks,
      totalScored: hits.length,
    });
    if (scoredN % 25 === 0 || scoredN === targets.length) {
      console.log(`[validate] scored ${scoredN}/${targets.length}`);
    }
  }

  // Phase 3: aggregate.
  let totalSiblings = 0;
  let inRawTopK = 0;
  let inWeightedTopK = 0;
  let inEitherTopK = 0;
  const rawRanks = [];
  const weightedRanks = [];
  const missedExamples = [];
  for (const r of results) {
    for (const s of r.siblings) {
      totalSiblings++;
      const hitRaw = s.rankRaw !== null && s.rankRaw <= ARG_TOP_K;
      const hitW = s.rankWeighted !== null && s.rankWeighted <= ARG_TOP_K;
      if (hitRaw) inRawTopK++;
      if (hitW) inWeightedTopK++;
      if (hitRaw || hitW) inEitherTopK++;
      if (s.rankRaw !== null) rawRanks.push(s.rankRaw);
      if (s.rankWeighted !== null) weightedRanks.push(s.rankWeighted);
      if (!hitRaw && !hitW) {
        missedExamples.push({
          target: r.target,
          sibling: s.mn,
          rankRaw: s.rankRaw,
          rankWeighted: s.rankWeighted,
        });
      }
    }
  }

  const median = (arr) => {
    if (arr.length === 0) return null;
    const s = [...arr].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const mean = (arr) =>
    arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

  console.log("\n=== validation summary ===");
  console.log(`targets evaluated:           ${results.length}`);
  console.log(`known siblings in corpus:    ${totalSiblings}`);
  console.log(
    `recall@${ARG_TOP_K} raw:                ${inRawTopK}/${totalSiblings}  (${(
      (100 * inRawTopK) / totalSiblings
    ).toFixed(1)}%)`,
  );
  console.log(
    `recall@${ARG_TOP_K} weighted:           ${inWeightedTopK}/${totalSiblings}  (${(
      (100 * inWeightedTopK) / totalSiblings
    ).toFixed(1)}%)`,
  );
  console.log(
    `recall@${ARG_TOP_K} either:             ${inEitherTopK}/${totalSiblings}  (${(
      (100 * inEitherTopK) / totalSiblings
    ).toFixed(1)}%)`,
  );
  console.log(
    `mean rank (raw):             ${mean(rawRanks)?.toFixed(1) ?? "—"}`,
  );
  console.log(`median rank (raw):           ${median(rawRanks) ?? "—"}`);
  console.log(
    `mean rank (weighted):        ${mean(weightedRanks)?.toFixed(1) ?? "—"}`,
  );
  console.log(`median rank (weighted):      ${median(weightedRanks) ?? "—"}`);
  console.log(`misses (neither top-${ARG_TOP_K}):    ${missedExamples.length}`);
  console.log(`elapsed:                     ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  if (missedExamples.length > 0) {
    console.log("\n=== sample misses (first 10) ===");
    for (const m of missedExamples.slice(0, 10)) {
      console.log(
        `  ${m.target}  →  ${m.sibling}   raw=${m.rankRaw ?? "—"}  weighted=${m.rankWeighted ?? "—"}`,
      );
    }
  }

  if (errors.length > 0) {
    console.log(`\n=== ${errors.length} fetch errors (first 5) ===`);
    for (const e of errors.slice(0, 5)) console.log(`  ${e.mn}: ${e.error}`);
  }

  // Write a JSON artifact for later inspection / charting.
  const outPath = new URL("../validation-results.json", import.meta.url);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    outPath,
    JSON.stringify(
      {
        ranAt: new Date().toISOString(),
        corpusSize: corpus.fragments.length,
        sampleN: ARG_N,
        seed: ARG_SEED,
        topK: ARG_TOP_K,
        targetsEvaluated: results.length,
        totalSiblings,
        inRawTopK,
        inWeightedTopK,
        inEitherTopK,
        meanRankRaw: mean(rawRanks),
        medianRankRaw: median(rawRanks),
        meanRankWeighted: mean(weightedRanks),
        medianRankWeighted: median(weightedRanks),
        misses: missedExamples,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n[validate] wrote artifact: ${outPath.pathname}`);
}

main().catch((err) => {
  console.error("[validate] fatal:", err);
  process.exit(1);
});
