// v0.13.0 Discovery Engine v2.0 — Primary-Source Mode
// Runs sign-trigram Jaccard discovery across the cached eBL corpus (~36K tablets).
// MVP: Mode A (lexical reuse) without cross-boundary filtering (Mode B requires
// per-tablet metadata enrichment — deferred to v0.13.x).

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const OUT_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json";
const EXCLUSIONS_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/corpus-exclusions.json";

// v0.14.4 (task #67) — corpus pre-filter for colophon-template prototype records
let EXCLUDED_IDS = new Set();
try {
  const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
  EXCLUDED_IDS = new Set((ex.excluded_records ?? []).map((r) => r.id));
  console.error(`Loaded exclusion list: ${EXCLUDED_IDS.size} prototype records will be filtered out`);
} catch (e) {
  console.error(`(no exclusion list found at ${EXCLUSIONS_PATH}; running without prototype filter)`);
}

// CLI args
const args = process.argv.slice(2);
function arg(name, def) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx < 0) return def;
  return args[idx + 1];
}

const SAMPLE_SIZE = parseInt(arg("sample-size", "200"), 10);
const MIN_JACCARD = parseFloat(arg("min-jaccard", "0.30"));
const MIN_INTERSECTION = parseInt(arg("min-intersection", "10"), 10);
const MIN_TRIGRAM_COUNT = parseInt(arg("min-trigram-count", "30"), 10);
const RANDOM_SEED = parseInt(arg("seed", "137"), 10);
const MAX_OUTPUT = parseInt(arg("max-output", "500"), 10);

console.error(`Discovery Engine v2.0 — Primary-Source Mode`);
console.error(`  sample-size: ${SAMPLE_SIZE}`);
console.error(`  min-jaccard: ${MIN_JACCARD}`);
console.error(`  min-intersection: ${MIN_INTERSECTION}`);
console.error(`  min-trigram-count: ${MIN_TRIGRAM_COUNT}`);
console.error(`  seed: ${RANDOM_SEED}`);
console.error(`  max-output: ${MAX_OUTPUT}`);
console.error("");

// Load cached signs
console.error("Loading cached eBL signs...");
const t0 = Date.now();
const raw = readFileSync(SIGNS_CACHE, "utf8");
const records = JSON.parse(raw);
console.error(`  loaded ${records.length} tablet records in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// Build trigram sets
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

console.error("Building trigram index...");
const t1 = Date.now();
const fragments = new Map();
let skippedExcluded = 0;
for (const r of records) {
  if (!r._id || typeof r.signs !== "string") continue;
  if (EXCLUDED_IDS.has(r._id)) { skippedExcluded++; continue; } // v0.14.4 — skip prototype records
  const set = trigramsFromSigns(r.signs);
  if (set.size >= MIN_TRIGRAM_COUNT) fragments.set(r._id, set);
}
console.error(`  ${fragments.size} tablets with >=${MIN_TRIGRAM_COUNT} trigrams (${((Date.now() - t1) / 1000).toFixed(1)}s)`);
if (skippedExcluded > 0) console.error(`  filtered out ${skippedExcluded} excluded prototype records`);

// Sample query tablets (deterministic via seed)
function* lcg(seed) {
  let s = seed;
  while (true) {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    yield s / 2 ** 32;
  }
}

const allIds = [...fragments.keys()];
const rng = lcg(RANDOM_SEED);
const querySet = new Set();
while (querySet.size < SAMPLE_SIZE && querySet.size < allIds.length) {
  const idx = Math.floor(rng.next().value * allIds.length);
  querySet.add(allIds[idx]);
}
console.error(`Sampled ${querySet.size} query tablets (seed=${RANDOM_SEED})`);
console.error("");

// Jaccard with early-termination optimization
function jaccardFast(a, b, minJaccard) {
  if (a.size === 0 || b.size === 0) return 0;
  // Early termination: if a.size+b.size are very unequal, jaccard upper-bound is small
  // jaccard_max = min(a.size, b.size) / max(a.size, b.size)
  const sizeBound = Math.min(a.size, b.size) / Math.max(a.size, b.size);
  if (sizeBound < minJaccard) return 0;

  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let intersect = 0;
  for (const x of small) if (big.has(x)) intersect++;
  if (intersect === 0) return 0;
  return intersect / (a.size + b.size - intersect);
}

// Discovery pass
console.error("Running discovery pass...");
const t2 = Date.now();
const candidates = [];
const seenPairs = new Set();
let progressN = 0;

for (const queryId of querySet) {
  const qTrigrams = fragments.get(queryId);
  if (!qTrigrams) continue;

  for (const [candId, cTrigrams] of fragments) {
    if (candId === queryId) continue;

    // Symmetric pair dedup
    const pairKey = queryId < candId ? `${queryId}||${candId}` : `${candId}||${queryId}`;
    if (seenPairs.has(pairKey)) continue;

    const jac = jaccardFast(qTrigrams, cTrigrams, MIN_JACCARD);
    if (jac < MIN_JACCARD) continue;

    // Compute intersection size for audit
    const [small, big] = qTrigrams.size <= cTrigrams.size ? [qTrigrams, cTrigrams] : [cTrigrams, qTrigrams];
    let intersect = 0;
    for (const x of small) if (big.has(x)) intersect++;
    if (intersect < MIN_INTERSECTION) continue;

    // Get sample of shared trigrams (deterministic, sorted)
    const shared = [];
    for (const x of small) if (big.has(x)) shared.push(x);
    shared.sort();
    const sample = shared.slice(0, 10);

    const union = qTrigrams.size + cTrigrams.size - intersect;
    candidates.push({
      tablet_a_id: queryId,
      tablet_b_id: candId,
      jaccard: jac,
      intersection_size: intersect,
      union_size: union,
      shared_trigram_sample: sample,
      tablet_a_trigram_count: qTrigrams.size,
      tablet_b_trigram_count: cTrigrams.size,
    });
    seenPairs.add(pairKey);
  }

  progressN++;
  if (progressN % 25 === 0) {
    const elapsed = (Date.now() - t2) / 1000;
    const rate = progressN / elapsed;
    const eta = (querySet.size - progressN) / rate;
    console.error(`  ${progressN}/${querySet.size} queries · ${candidates.length} candidates so far · ${elapsed.toFixed(0)}s elapsed · ~${eta.toFixed(0)}s ETA`);
  }
}

const discoveryElapsed = (Date.now() - t2) / 1000;
console.error(`Discovery pass complete in ${discoveryElapsed.toFixed(0)}s — ${candidates.length} candidates found`);
console.error("");

// Sort by jaccard descending; slice top max-output
candidates.sort((a, b) => b.jaccard - a.jaccard);
const top = candidates.slice(0, MAX_OUTPUT);

// Build PrimarySourceParallel records
const today = new Date().toISOString().substring(0, 10);
const parallels = top.map((c, idx) => ({
  id: `psp-${today}-${String(idx + 1).padStart(4, "0")}`,
  tablet_a: {
    museum_number: c.tablet_a_id,
    trigram_count: c.tablet_a_trigram_count,
  },
  tablet_b: {
    museum_number: c.tablet_b_id,
    trigram_count: c.tablet_b_trigram_count,
  },
  match_evidence: {
    match_type: "sign_trigram_jaccard",
    jaccard: parseFloat(c.jaccard.toFixed(4)),
    intersection_size: c.intersection_size,
    union_size: c.union_size,
    shared_trigram_sample: c.shared_trigram_sample,
  },
  cross_boundary: {
    different_genre: false,
    different_period: false,
    different_city: false,
    different_language: false,
  },
  novelty_score: parseFloat(c.jaccard.toFixed(4)), // = jaccard until metadata enrichment runs
  discovered_by: "ai_corpus_traversal",
  discovery_date: today,
  validation_status: "pending",
}));

// Write output
const output = {
  _meta: {
    description:
      "Primary-source corpus parallel candidates discovered by Discovery Engine v2.0 sign-trigram Jaccard traversal of cached eBL corpus. v0.13.0 MVP — Mode A (lexical reuse) only; cross-boundary metadata filtering (Mode B) deferred to v0.13.x once per-tablet metadata enrichment runs.",
    compiled: today,
    engine_version: "v0.13.0",
    sample_size: SAMPLE_SIZE,
    min_jaccard: MIN_JACCARD,
    min_intersection: MIN_INTERSECTION,
    min_trigram_count: MIN_TRIGRAM_COUNT,
    random_seed: RANDOM_SEED,
    corpus_size_traversed: fragments.size,
    total_candidates_found: candidates.length,
    candidates_output: parallels.length,
    discovery_pass_duration_seconds: parseFloat(discoveryElapsed.toFixed(1)),
    metadata_enrichment_status: "partial_no_metadata",
    note:
      "All cross_boundary flags are false because per-tablet metadata (genre/period/city/language) is not yet enriched. v0.13.1 metadata-enrichment pass will populate these. The novelty_score currently equals jaccard.",
  },
  parallels,
};

writeFileSync(OUT_PATH, JSON.stringify(output, null, 2) + "\n");

console.error("OUTPUT");
console.error(`  Wrote ${parallels.length} primary-source parallels to ${OUT_PATH}`);
console.error("");
console.error("Top 10 by jaccard:");
parallels.slice(0, 10).forEach((p, i) => {
  console.error(
    `  ${i + 1}. ${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number} · jaccard=${p.match_evidence.jaccard.toFixed(3)} · intersection=${p.match_evidence.intersection_size}/${p.match_evidence.union_size}`,
  );
});
