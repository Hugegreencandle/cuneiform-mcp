#!/usr/bin/env node
// v0.46 — Extend the ABZ → Unicode glyph map beyond Labasi's 239-sign subset.
//
// build-abz-glyph-map.mjs (v0.42 + v0.42 fallback fix) covers the OGSL Labasi
// subset = ~239 signs, yielding 222 cached entries. The full Borger ABZ list
// extends to ~ABZ600+ with sub-codes (a, b, c suffixes) — many of which
// occur in eBL transliterations (K.5896's ABZ168 was unresolved by the
// Labasi pass).
//
// Strategy: enumerate ABZ numbers from 1 → 900 via eBL's list-filter
// endpoint `/api/signs?listsName=ABZ&listsNumber={n}`. The endpoint
// returns 200 + empty array for non-existent ABZ numbers (not 404).
// We define "empty result" as a miss and apply the backoff:
//   - If 100 consecutive empty results, stop scanning (range exhausted)
//
// MERGES with existing ~/.cache/cuneiform-mcp/abz-glyph-map.json — doesn't
// overwrite. Repeat runs are idempotent + add only new ABZ codes.
//
// Polite: concurrency=2, 250ms inter-batch pacing, 3 retries with backoff.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.46 (build-abz-glyph-map-full)";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = join(CACHE_DIR, "abz-glyph-map.json");

const CONCURRENCY = 2;
const PACING_MS = 250;
const MAX_RETRIES = 3;

// Range scan parameters.
const ABZ_MIN = 1;
const ABZ_MAX = parseInt(process.env.ABZ_MAX ?? "900", 10);
const CONSECUTIVE_EMPTY_STOP = parseInt(process.env.ABZ_STOP_AFTER_EMPTY ?? "100", 10);

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

console.log(`cuneiform-mcp build-abz-glyph-map-full v0.46.0`);
console.log(`  output:                ${OUT_PATH}`);
console.log(`  source:                eBL /api/signs?listsName=ABZ&listsNumber={n}`);
console.log(`  range:                 ABZ${ABZ_MIN} → ABZ${ABZ_MAX}`);
console.log(`  consecutive-empty stop: ${CONSECUTIVE_EMPTY_STOP}`);
console.log(`  concurrency:           ${CONCURRENCY}  ·  pacing: ${PACING_MS}ms`);
console.log(``);

// ─── Load existing cache for dedup + merge ────────────────────────────────

let entries = {};
let priorEntryCount = 0;
if (existsSync(OUT_PATH)) {
  try {
    const prior = JSON.parse(readFileSync(OUT_PATH, "utf-8"));
    if (prior?.entries && typeof prior.entries === "object") {
      entries = { ...prior.entries };
      priorEntryCount = Object.keys(entries).length;
      console.log(`Merging with existing cache: ${priorEntryCount} entries already present`);
    }
  } catch (e) {
    console.warn(`Could not load existing cache for merge: ${e.message ?? e}`);
  }
}

function isAlreadyCached(abzNumber) {
  const key = `ABZ${String(abzNumber).padStart(3, "0")}`;
  return entries[key] !== undefined;
}

// ─── Fetcher ──────────────────────────────────────────────────────────────

async function fetchEblAbz(abzNumber) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${EBL_BASE}/signs?listsName=ABZ&listsNumber=${abzNumber}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        return { abzNumber, ok: false, status: res.status };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { abzNumber, ok: true, empty: true };
      }
      return { abzNumber, ok: true, empty: false, data: data[0] };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { abzNumber, ok: false, error: e.message ?? String(e) };
    }
  }
  return { abzNumber, ok: false };
}

async function paced(fn, ms) {
  const out = await fn();
  await new Promise((r) => setTimeout(r, ms));
  return out;
}

// ─── Main loop ────────────────────────────────────────────────────────────

let okNew = 0;
let okSkipped = 0;
let empty = 0;
let failed = 0;
let withGlyph = 0;
let consecutiveEmpty = 0;
let stoppedEarly = false;
const failures = [];

const t0 = Date.now();
let lastABZ = ABZ_MIN - 1;

for (let n = ABZ_MIN; n <= ABZ_MAX; n += CONCURRENCY) {
  const batch = [];
  for (let k = 0; k < CONCURRENCY && (n + k) <= ABZ_MAX; k++) {
    batch.push(n + k);
  }
  if ((n - ABZ_MIN) > 0 && (n - ABZ_MIN) % 50 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(`  progress: ABZ${n} (${elapsed}s, +${okNew} new, ${empty} empty, ${consecutiveEmpty} consec)\n`);
  }
  const results = await Promise.all(
    batch.map((abzNum) => {
      if (isAlreadyCached(abzNum)) {
        return Promise.resolve({ abzNumber: abzNum, ok: true, skipped: true });
      }
      return paced(() => fetchEblAbz(abzNum), PACING_MS);
    }),
  );
  for (const res of results) {
    lastABZ = Math.max(lastABZ, res.abzNumber);
    if (res.skipped) {
      okSkipped++;
      // Skipping does NOT increment consecutiveEmpty
      consecutiveEmpty = 0;
      continue;
    }
    if (!res.ok || !res.data) {
      if (res.empty) {
        empty++;
        consecutiveEmpty++;
      } else {
        failures.push({ abz: `ABZ${String(res.abzNumber).padStart(3, "0")}`, status: res.status, error: res.error });
        failed++;
        consecutiveEmpty++;
      }
      continue;
    }
    consecutiveEmpty = 0;
    const abz = `ABZ${String(res.abzNumber).padStart(3, "0")}`;
    const codepoints = res.data.unicode ?? [];
    const glyph = codepoints
      .filter((cp) => typeof cp === "number" && cp > 0)
      .map((cp) => String.fromCodePoint(cp))
      .join("");
    entries[abz] = {
      sign_name: res.data.name ?? null,
      labasi_name: null,
      ebl_canonical_name: res.data.name ?? null,
      via: "by_abz",
      source: "borger_full_v046",
      codepoints,
      glyph,
    };
    okNew++;
    if (codepoints.length > 0) withGlyph++;
  }
  if (consecutiveEmpty >= CONSECUTIVE_EMPTY_STOP) {
    stoppedEarly = true;
    console.log(``);
    console.log(`Stopping at ABZ${lastABZ} — ${consecutiveEmpty} consecutive empty results (range exhausted).`);
    break;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Full ABZ glyph map build complete:`);
console.log(`  ABZ range scanned:     ${ABZ_MIN} → ${lastABZ}`);
console.log(`  new entries added:     ${okNew}`);
console.log(`  pre-cached skipped:    ${okSkipped}`);
console.log(`  empty results:         ${empty}`);
console.log(`  failed (network):      ${failed}`);
console.log(`  with glyph:            ${withGlyph}`);
console.log(`  total in cache:        ${Object.keys(entries).length}  (was ${priorEntryCount})`);
console.log(`  stopped early:         ${stoppedEarly}`);
console.log(`  elapsed:               ${elapsed}s`);

const out = {
  version: "1.1.0",
  built_at: new Date().toISOString(),
  source: "OGSL Labasi ∩ eBL /signs by name (v0.42) + full ABZ range probe via list-filter (v0.46)",
  build_stats: {
    abz_range_scanned: { min: ABZ_MIN, max: lastABZ },
    new_entries_added: okNew,
    pre_cached_skipped: okSkipped,
    empty_results: empty,
    failed: failed,
    with_glyph: withGlyph,
    total_in_cache: Object.keys(entries).length,
    prior_entries_merged: priorEntryCount,
    stopped_early: stoppedEarly,
    elapsed_seconds: parseFloat(elapsed),
  },
  entries,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(``);
console.log(`Wrote ${Object.keys(entries).length} entries to ${OUT_PATH}`);
