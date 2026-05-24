#!/usr/bin/env node
// cuneiform-mcp v0.28.0 — build per-period chunk-hash indexes (NA / NB).
//
// Partition the corpus by fragment-metadata script.period into Neo-Assyrian
// and Neo-Babylonian sub-corpora, then run v0.20's chunk-index build
// (WINDOW=20, X-skip rule, singleton pruning, signs reconstruction) on each
// sub-corpus independently. Produces two caches:
//
//   ~/.cache/cuneiform-mcp/chunk-index-na.json
//   ~/.cache/cuneiform-mcp/chunk-index-nb.json
//
// The v0.20 corpus-wide cache (chunk-index.json) is NOT touched. The two
// per-period caches are the backbone of v0.28's
// find_formulaic_passages_per_period tool, which surfaces chunks formulaic
// in one period but not the other (na_only / nb_only specificity).
//
// Algorithm (per period):
//   1. Filter tablets whose script.period matches the period label.
//   2. Run v0.20's tabletToTrigrams + sliding-WINDOW=20 indexer.
//   3. Aggregate hash → [(tablet_id, position)].
//   4. Drop singletons.
//   5. Reconstruct sign sequence per surviving entry.
//   6. Sort by occurrences.length desc.
//   7. Write JSON.
//
// Pure stdlib — no new dependencies. Runtime target: 30-60 sec total.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const VERSION = "0.28.0";
const WINDOW = 20;

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const REPO_DIR = process.env.CUNEIFORM_MCP_DATA_DIR
  ? join(process.env.CUNEIFORM_MCP_DATA_DIR, "..")
  : join(homedir(), "Desktop", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const METADATA_CACHE = join(CACHE_DIR, "fragment-metadata.json");
const EXCLUSIONS_PATH = join(REPO_DIR, "data", "corpus-exclusions.json");

const PERIODS = [
  { key: "NA", label: "Neo-Assyrian", outFile: "chunk-index-na.json" },
  { key: "NB", label: "Neo-Babylonian", outFile: "chunk-index-nb.json" },
];

console.error(`cuneiform-mcp build-chunk-index-per-period v${VERSION}`);
console.error(`  signs cache:    ${SIGNS_CACHE}`);
console.error(`  metadata cache: ${METADATA_CACHE}`);
console.error(`  exclusions:     ${EXCLUSIONS_PATH}`);
console.error(`  window:         ${WINDOW} trigrams`);
console.error(`  out dir:        ${CACHE_DIR}`);
console.error(`  periods:        ${PERIODS.map((p) => `${p.key}(${p.label})`).join(", ")}`);
console.error("");

// ─── Verify inputs ─────────────────────────────────────────────────────────

if (!existsSync(SIGNS_CACHE)) {
  console.error(`✘ required input not found: ${SIGNS_CACHE}`);
  console.error("  Run the eBL fetch pipeline (--prefetch) before this script.");
  process.exit(1);
}
if (!existsSync(METADATA_CACHE)) {
  console.error(`✘ required input not found: ${METADATA_CACHE}`);
  console.error("  Period partition requires fragment-metadata cache.");
  process.exit(1);
}

// ─── Load exclusions ──────────────────────────────────────────────────────

const excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  try {
    const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
    for (const r of ex.excluded_records ?? []) excluded.add(r.id);
    console.error(`  ${excluded.size} excluded prototypes loaded`);
  } catch (e) {
    console.error(`  ⚠ exclusions load failed: ${e.message}`);
  }
}

// ─── Load metadata + build period lookup ──────────────────────────────────

console.error("Loading fragment-metadata cache...");
const tMeta = Date.now();
const metadata = JSON.parse(readFileSync(METADATA_CACHE, "utf-8"));
console.error(
  `  ${Object.keys(metadata).length} metadata entries in ${((Date.now() - tMeta) / 1000).toFixed(1)}s`,
);

function periodOf(meta) {
  if (!meta || !meta.script) return null;
  if (typeof meta.script === "string") return meta.script;
  return meta.script.period ?? null;
}

function periodKey(p) {
  if (p === "Neo-Assyrian") return "NA";
  if (p === "Neo-Babylonian") return "NB";
  return null;
}

// ─── Per-tablet trigrams_ordered (X-skip rule from fuzzyParallels.ts) ─────
// IDENTICAL to scripts/build-chunk-index.mjs — same window, same X-skip.

function tabletToTrigrams(signsRaw) {
  const trigrams_ordered = [];
  for (const line of signsRaw.split(/\r?\n/)) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    for (let i = 0; i + 2 < toks.length; i++) {
      const a = toks[i],
        b = toks[i + 1],
        c = toks[i + 2];
      const xCount = (a === "X" ? 1 : 0) + (b === "X" ? 1 : 0) + (c === "X" ? 1 : 0);
      if (xCount >= 2) continue;
      trigrams_ordered.push(a + " " + b + " " + c);
    }
  }
  return trigrams_ordered;
}

// IDENTICAL to scripts/build-chunk-index.mjs — same sign-sequence
// reconstruction with "…" gap markers for X-skip jumps.
function reconstructChunkSigns(trigrams_ordered, start, length) {
  if (length === 0) return "";
  const window = trigrams_ordered.slice(start, start + length);
  if (window.length === 0) return "";
  const first = window[0].split(" ");
  const signs = [first[0], first[1], first[2]];
  let prev = first;
  for (let i = 1; i < window.length; i++) {
    const cur = window[i].split(" ");
    if (cur[0] === prev[1] && cur[1] === prev[2]) {
      signs.push(cur[2]);
    } else {
      signs.push("…", cur[0], cur[1], cur[2]);
    }
    prev = cur;
  }
  return signs.join(" ");
}

// ─── Stream records and partition by period ───────────────────────────────

console.error("Reading signs cache...");
const t0 = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
console.error(`  ${records.length} records loaded (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

// Per-period working state. Each period gets its own inverted index +
// per-tablet trigram cache (needed only for the eventual reconstruct pass).
const perPeriod = new Map();
for (const p of PERIODS) {
  perPeriod.set(p.key, {
    config: p,
    byHash: new Map(), // hash → [{tablet_id, start_position}]
    trigramsByTablet: new Map(), // tablet_id → trigrams_ordered
    totalWindows: 0,
    tabletsProcessed: 0,
  });
}

let noMetadata = 0;
let otherPeriod = 0;
let droppedExcluded = 0;
let belowWindow = 0;

console.error("");
console.error("Partitioning + indexing windows...");
const t1 = Date.now();
let scanned = 0;
for (const r of records) {
  scanned++;
  if (!r._id || typeof r.signs !== "string") continue;
  if (excluded.has(r._id)) {
    droppedExcluded++;
    continue;
  }
  const meta = metadata[r._id];
  if (!meta) {
    noMetadata++;
    continue;
  }
  const pk = periodKey(periodOf(meta));
  if (!pk) {
    otherPeriod++;
    continue;
  }
  const state = perPeriod.get(pk);
  if (!state) continue;
  const trigrams = tabletToTrigrams(r.signs);
  if (trigrams.length < WINDOW) {
    belowWindow++;
    continue;
  }
  state.trigramsByTablet.set(r._id, trigrams);
  for (let i = 0; i + WINDOW <= trigrams.length; i++) {
    const hash = trigrams.slice(i, i + WINDOW).join("|");
    let arr = state.byHash.get(hash);
    if (!arr) {
      arr = [];
      state.byHash.set(hash, arr);
    }
    arr.push({ tablet_id: r._id, start_position: i });
    state.totalWindows++;
  }
  state.tabletsProcessed++;
  if (scanned % 5000 === 0) {
    const na = perPeriod.get("NA");
    const nb = perPeriod.get("NB");
    console.error(
      `    scanned=${scanned} · NA=${na.tabletsProcessed}t/${na.byHash.size}h · NB=${nb.tabletsProcessed}t/${nb.byHash.size}h`,
    );
  }
}
console.error(
  `  partition done in ${((Date.now() - t1) / 1000).toFixed(1)}s · filtered: ${noMetadata} no-meta · ${otherPeriod} other-period · ${droppedExcluded} excluded · ${belowWindow} below-window`,
);

// ─── Per-period prune + reconstruct + write ───────────────────────────────

const summary = [];

for (const p of PERIODS) {
  const state = perPeriod.get(p.key);
  console.error("");
  console.error(`══════════════════════════════════════════════════════════════════════`);
  console.error(`▶ Period ${p.key} (${p.label}) — ${state.tabletsProcessed} tablets · ${state.byHash.size} unique hashes`);
  console.error(`══════════════════════════════════════════════════════════════════════`);

  if (state.tabletsProcessed === 0) {
    console.error(`  ✘ no tablets in period ${p.key} — skipping`);
    summary.push({
      period: p.key,
      label: p.label,
      skipped: true,
      tablets_in_period: 0,
    });
    continue;
  }

  console.error(`  pruning singletons + reconstructing signs...`);
  const t2 = Date.now();
  const entries = [];
  for (const [hash, occurrences] of state.byHash.entries()) {
    if (occurrences.length < 2) continue;
    const seed = occurrences[0];
    const trigrams = state.trigramsByTablet.get(seed.tablet_id);
    const signs = trigrams ? reconstructChunkSigns(trigrams, seed.start_position, WINDOW) : "";
    entries.push({ hash, signs, length: WINDOW, occurrences });
  }
  entries.sort((a, b) => b.occurrences.length - a.occurrences.length);
  const totalNonSingleton = entries.length;
  console.error(
    `    ${totalNonSingleton} non-singleton hashes (${((Date.now() - t2) / 1000).toFixed(1)}s)`,
  );

  const out = {
    version: VERSION,
    build_timestamp: new Date().toISOString(),
    period: p.key,
    period_label: p.label,
    window_length: WINDOW,
    total_tablets: state.tabletsProcessed,
    total_windows_seen: state.totalWindows,
    total_unique_hashes: state.byHash.size,
    total_non_singleton_hashes: totalNonSingleton,
    entries,
  };

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const outPath = join(CACHE_DIR, p.outFile);
  console.error(`  writing ${outPath}...`);
  const tW = Date.now();
  writeFileSync(outPath, JSON.stringify(out));
  const sz = statSync(outPath).size;
  console.error(
    `  ✓ wrote ${outPath}  (${(sz / 1024 / 1024).toFixed(1)} MB, ${((Date.now() - tW) / 1000).toFixed(1)}s)`,
  );

  if (entries.length > 0) {
    const top = entries[0];
    console.error(
      `    highest-host chunk: ${top.occurrences.length} hosts · ${top.signs.slice(0, 60)}…`,
    );
  }

  summary.push({
    period: p.key,
    label: p.label,
    skipped: false,
    tablets_in_period: state.tabletsProcessed,
    total_windows_seen: state.totalWindows,
    total_unique_hashes: state.byHash.size,
    total_non_singleton_hashes: totalNonSingleton,
    cache_path: outPath,
    cache_bytes: sz,
  });
}

// ─── Summary ──────────────────────────────────────────────────────────────

console.error("");
console.error(`══════════════════════════════════════════════════════════════════════`);
console.error(`▶ Per-period chunk-index build summary`);
console.error(`══════════════════════════════════════════════════════════════════════`);
console.error(
  `  ${"period".padEnd(8)}  ${"tablets".padStart(8)}  ${"windows".padStart(10)}  ${"uniq".padStart(8)}  ${"non-sing".padStart(8)}  ${"MB".padStart(6)}`,
);
let totalBytes = 0;
for (const s of summary) {
  if (s.skipped) {
    console.error(`  ${s.period.padEnd(8)}  (skipped — 0 tablets)`);
    continue;
  }
  console.error(
    `  ${s.period.padEnd(8)}  ${s.tablets_in_period.toString().padStart(8)}  ${s.total_windows_seen.toString().padStart(10)}  ${s.total_unique_hashes.toString().padStart(8)}  ${s.total_non_singleton_hashes.toString().padStart(8)}  ${(s.cache_bytes / 1024 / 1024).toFixed(1).padStart(6)}`,
  );
  totalBytes += s.cache_bytes;
}
console.error("");
console.error(
  `  total: ${summary.length} periods · ${(totalBytes / 1024 / 1024).toFixed(1)} MB on disk`,
);
console.error("");
console.error(`✓ Per-period chunk-index build complete.`);
