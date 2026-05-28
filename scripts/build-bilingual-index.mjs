#!/usr/bin/env node
// Build the bilingual index for find_bilingual_tablets (v0.66.0).
//
// For each tablet in the bilingual-genre prior pool (fragment-metadata.json
// pre-filtered to the 12 BILINGUAL_PRIOR_GENRES), fetch eBL
// /fragments/{museum_number} and extract per-line/per-Word language tags.
// Each entry stores the full BilingualSignal + classification label so
// find_bilingual_tablets can rank without re-fetching.
//
// Cache shape: see src/findBilingualTablets.ts comments.
//
// Polite consumer: concurrency=2 + 300ms inter-batch pacing. Resumable —
// merges with any existing cache so interrupted runs can resume.
//
// Full pool (~4,370 tablets) at 1.5s/tablet ≈ 110 minutes wall-clock.
// Limit the run via --max=N or env BILINGUAL_INDEX_MAX.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.66 (build-bilingual-index)";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR ||
  join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = join(CACHE_DIR, "bilingual-index.json");
const METADATA_PATH = join(CACHE_DIR, "fragment-metadata.json");

const CONCURRENCY = 2;
const PACING_MS = 300;
const MAX_RETRIES = 3;

const BILINGUAL_PRIOR_GENRES = [
  "CANONICAL → Literature → Narrative → Lugal-e",
  "CANONICAL → Literature → Narrative → Angim",
  "CANONICAL → Magic → Exorcistic → Udugḫul",
  "CANONICAL → Magic → Purification → Mīs pî",
  "CANONICAL → Magic → Exorcistic → Šurpu",
  "CANONICAL → Lexicography → Sign list → Diri",
  "CANONICAL → Lexicography → Thematic Word Lists → Ura",
  "CANONICAL → Lexicography → God List → An = Anum",
  "CANONICAL → Lexicography → Acrographic word list → Izi",
  "CANONICAL → Literature → Lamentations",
  "CANONICAL → Literature → Hymns → Divine → Šuʾila",
  "CANONICAL → Magic → Exorcistic → Marduk’s Address to the Demons",
];

function matchBilingualPriorGenre(genres) {
  if (!Array.isArray(genres)) return null;
  for (const g of genres) {
    if (typeof g !== "string") continue;
    for (const prior of BILINGUAL_PRIOR_GENRES) {
      if (g === prior || g.startsWith(prior)) return prior;
    }
  }
  return null;
}

// ─── Resolve target tablet list from the metadata cache ────────────────────

function resolveTargets() {
  // Explicit env override (CSV)
  if (process.env.BILINGUAL_INDEX_TARGETS) {
    return process.env.BILINGUAL_INDEX_TARGETS.split(/[,\s]+/).filter(Boolean);
  }
  // CLI positional args (caps-prefix tokens)
  const argTargets = process.argv.slice(2).filter((a) => /^[A-Z]/.test(a));
  if (argTargets.length > 0) return argTargets;

  // Default: scan fragment-metadata.json for bilingual-prior-genre hits.
  if (!existsSync(METADATA_PATH)) {
    console.error(
      `fragment-metadata.json missing at ${METADATA_PATH} — cannot resolve default target pool.`,
    );
    console.error(
      `Either run enrich_prefix_metadata to populate, or supply explicit targets via BILINGUAL_INDEX_TARGETS env / argv.`,
    );
    process.exit(2);
  }
  const md = JSON.parse(readFileSync(METADATA_PATH, "utf-8"));
  const out = [];
  for (const id of Object.keys(md)) {
    const entry = md[id];
    if (!entry) continue;
    const match = matchBilingualPriorGenre(entry.genres);
    if (match) out.push(id);
  }
  return out;
}

let TARGETS = resolveTargets();

// Optional --max=N or env BILINGUAL_INDEX_MAX (default: unbounded).
const maxArg = process.argv.find((a) => a.startsWith("--max="));
const maxFromArg = maxArg ? parseInt(maxArg.slice(6), 10) : NaN;
const maxFromEnv = process.env.BILINGUAL_INDEX_MAX
  ? parseInt(process.env.BILINGUAL_INDEX_MAX, 10)
  : NaN;
const MAX = Number.isFinite(maxFromArg)
  ? maxFromArg
  : Number.isFinite(maxFromEnv)
    ? maxFromEnv
    : 0;
if (MAX > 0) TARGETS = TARGETS.slice(0, MAX);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

console.log(`cuneiform-mcp build-bilingual-index v0.66.0`);
console.log(`  output:      ${OUT_PATH}`);
console.log(`  source:      eBL /fragments/{id} — per-line/per-Word language tags`);
console.log(`  concurrency: ${CONCURRENCY}  ·  pacing: ${PACING_MS}ms`);
console.log(`  pool size:   ${TARGETS.length} tablets${MAX > 0 ? ` (capped via --max=${MAX})` : ""}`);
console.log(``);

// ─── Fetch helpers ─────────────────────────────────────────────────────────

async function fetchFragment(id) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${EBL_BASE}/fragments/${encodeURIComponent(id)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.status === 404) return { id, ok: false, status: 404 };
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        return { id, ok: false, status: res.status };
      }
      return { id, ok: true, data: await res.json() };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { id, ok: false, error: e.message ?? String(e) };
    }
  }
  return { id, ok: false };
}

async function paced(fn, ms) {
  const out = await fn();
  await new Promise((r) => setTimeout(r, ms));
  return out;
}

// ─── Signal extractor (mirrors src/bilingualDetect.ts) ─────────────────────

function extractBilingualSignal(fragmentData) {
  const lines = fragmentData?.text?.lines ?? [];
  const textLines = lines.filter((l) => l?.type === "TextLine");
  let sumOnly = 0;
  let akkOnly = 0;
  let mixed = 0;
  let sumTok = 0;
  let akkTok = 0;
  let shifts = 0;
  const lineLanguages = [];

  for (const tl of textLines) {
    const content = tl.content || [];
    let s = 0;
    let a = 0;
    for (const tk of content) {
      if (tk?.type === "LanguageShift") {
        shifts++;
        continue;
      }
      if (tk?.type !== "Word") continue;
      const lang = tk.language;
      if (lang === "SUMERIAN" || lang === "EMESAL") s++;
      else if (lang === "AKKADIAN") a++;
    }
    sumTok += s;
    akkTok += a;
    if (s > 0 && a > 0) {
      mixed++;
      lineLanguages.push("MIX");
    } else if (s > 0) {
      sumOnly++;
      lineLanguages.push("SUM");
    } else if (a > 0) {
      akkOnly++;
      lineLanguages.push("AKK");
    } else {
      lineLanguages.push("NONE");
    }
  }

  const total = sumTok + akkTok;
  const sumShare = total > 0 ? sumTok / total : 0;
  const akkShare = total > 0 ? akkTok / total : 0;

  let alternation = "none";
  const filtered = lineLanguages.filter((l) => l === "SUM" || l === "AKK");
  if (textLines.length > 0 && mixed / textLines.length >= 0.5) {
    alternation = "interlinear";
  } else if (filtered.length >= 6 && sumOnly >= 3 && akkOnly >= 3) {
    let flips = 0;
    for (let i = 1; i < filtered.length; i++) {
      if (filtered[i] !== filtered[i - 1]) flips++;
    }
    const flipRate = flips / (filtered.length - 1);
    alternation = flipRate >= 0.8 ? "alternating" : "sequential";
  }

  return {
    text_line_count: textLines.length,
    sumerian_only_line_count: sumOnly,
    akkadian_only_line_count: akkOnly,
    mixed_token_line_count: mixed,
    sumerian_token_count: sumTok,
    akkadian_token_count: akkTok,
    sumerian_token_share: sumShare,
    akkadian_token_share: akkShare,
    language_shift_count: shifts,
    alternation_pattern: alternation,
  };
}

function classifyFromSignal(signal) {
  const total = signal.sumerian_token_count + signal.akkadian_token_count;
  if (signal.text_line_count < 3) return { classification: "insufficient_data", is_bilingual: false };
  if (total === 0) return { classification: "insufficient_data", is_bilingual: false };
  const mixRatio = signal.mixed_token_line_count / signal.text_line_count;
  const bothPresent = signal.sumerian_token_share >= 0.2 && signal.akkadian_token_share >= 0.2;
  if (bothPresent) {
    if (mixRatio >= 0.6) return { classification: "interlinear_bilingual", is_bilingual: true };
    if (
      signal.sumerian_only_line_count >= 3 &&
      signal.akkadian_only_line_count >= 3 &&
      signal.mixed_token_line_count === 0
    ) {
      return { classification: "alternating_line_bilingual", is_bilingual: true };
    }
    if (signal.alternation_pattern === "alternating") {
      return { classification: "alternating_line_bilingual", is_bilingual: true };
    }
    if (signal.alternation_pattern === "interlinear" || mixRatio >= 0.3) {
      return { classification: "interlinear_bilingual", is_bilingual: true };
    }
    return { classification: "uncertain", is_bilingual: false };
  }
  if (signal.sumerian_token_share < 0.2) {
    if (signal.akkadian_token_count === 0) return { classification: "monolingual_sumerian", is_bilingual: false };
    if (signal.sumerian_token_count > 0)
      return { classification: "akkadian_with_sumerograms", is_bilingual: false };
    return { classification: "monolingual_akkadian", is_bilingual: false };
  }
  if (signal.akkadian_token_share < 0.2) {
    return { classification: "monolingual_sumerian", is_bilingual: false };
  }
  return { classification: "uncertain", is_bilingual: false };
}

// ─── Main loop ─────────────────────────────────────────────────────────────

// Resumable: merge with existing cache. Skip targets already present unless
// REBUILD=1 is set.
let entries = {};
if (existsSync(OUT_PATH)) {
  try {
    const prior = JSON.parse(readFileSync(OUT_PATH, "utf-8"));
    if (prior?.entries && typeof prior.entries === "object") {
      entries = { ...prior.entries };
      console.log(
        `Merging with existing cache: ${Object.keys(entries).length} entries already present`,
      );
    }
  } catch (e) {
    console.warn(`Could not load existing cache for merge: ${e.message ?? e}`);
  }
}

const REBUILD = process.env.REBUILD === "1";
let queue = TARGETS;
if (!REBUILD) {
  const before = queue.length;
  queue = queue.filter((id) => !(id in entries));
  if (queue.length < before) {
    console.log(`Skipping ${before - queue.length} targets already in cache (set REBUILD=1 to refetch)`);
  }
}

// Genre-path lookup so we can stamp each entry with its prior genre.
let genrePathById = {};
if (existsSync(METADATA_PATH)) {
  try {
    const md = JSON.parse(readFileSync(METADATA_PATH, "utf-8"));
    for (const id of Object.keys(md)) {
      const entry = md[id];
      if (!entry) continue;
      const match = matchBilingualPriorGenre(entry.genres);
      if (match) genrePathById[id] = match;
    }
  } catch (e) {
    console.warn(`Could not load metadata for genre stamping: ${e.message ?? e}`);
  }
}

const priorEntryCount = Object.keys(entries).length;
let okCount = 0;
let failCount = 0;
let bilingualCount = 0;
const failures = [];
const t0 = Date.now();

function writeCacheNow() {
  const out = {
    version: "1.0.0",
    built_at: new Date().toISOString(),
    source: "eBL /fragments/{id} → text.lines[].content[] per-Word language tags",
    build_stats: {
      targets_in_pool: TARGETS.length,
      queue_after_skip: queue.length,
      ok: okCount,
      failed: failCount,
      bilingual: bilingualCount,
      elapsed_seconds: parseFloat(((Date.now() - t0) / 1000).toFixed(1)),
      prior_entries_merged: priorEntryCount,
      total_entries_after_merge: Object.keys(entries).length,
    },
    entries,
  };
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
}

// Periodic flush so an interrupted run leaves a usable partial cache.
const FLUSH_EVERY = 50;

for (let i = 0; i < queue.length; i += CONCURRENCY) {
  const batch = queue.slice(i, i + CONCURRENCY);
  if (i > 0 && i % 10 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(
      `  progress: ${i}/${queue.length} (${elapsed}s, ${okCount} ok, ${failCount} fail, ${bilingualCount} bilingual)\n`,
    );
  }
  const results = await Promise.all(
    batch.map((id) => paced(() => fetchFragment(id), PACING_MS)),
  );
  for (const res of results) {
    if (!res.ok || !res.data) {
      failures.push({ id: res.id, status: res.status, error: res.error });
      failCount++;
      continue;
    }
    const signal = extractBilingualSignal(res.data);
    const cls = classifyFromSignal(signal);
    entries[res.id] = {
      classification: cls.classification,
      is_bilingual: cls.is_bilingual,
      signal,
      genre_path: genrePathById[res.id] ?? null,
    };
    okCount++;
    if (cls.is_bilingual) bilingualCount++;
  }
  if (okCount > 0 && okCount % FLUSH_EVERY === 0) {
    writeCacheNow();
  }
}

writeCacheNow();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Bilingual-index build complete:`);
console.log(`  queue processed:   ${queue.length}`);
console.log(`  ok:                ${okCount}`);
console.log(`  failed:            ${failCount}`);
console.log(`  bilingual:         ${bilingualCount}`);
console.log(`  elapsed:           ${elapsed}s`);
console.log(`  total entries:     ${Object.keys(entries).length}`);

if (failures.length > 0) {
  console.log(``);
  console.log(`First 5 failures:`);
  for (const f of failures.slice(0, 5)) {
    console.log(`  ${f.id}: ${f.status ?? f.error}`);
  }
}

console.log(``);
console.log(`Wrote ${Object.keys(entries).length} entries to ${OUT_PATH}`);
console.log(``);
console.log(
  `To extend: re-run (resumable). To force-rebuild: REBUILD=1 node scripts/build-bilingual-index.mjs`,
);
