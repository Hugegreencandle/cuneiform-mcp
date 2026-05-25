#!/usr/bin/env node
// Build the lemma index for find_lemma_parallel (v0.44.0).
//
// For each fragment ID in TARGET_TABLETS (passed via env or defaulting to
// a small high-host set), fetches eBL /fragments/{id} and extracts the
// lemmas from the line-by-line `text.lines[].content[].lemma` arrays.
//
// Cache shape: see src/lemmaParallel.ts comments.
//
// Polite consumer: concurrency=2 + 300ms inter-batch pacing. Expect ~3
// seconds per fragment, so ~1 minute for 20 fragments, ~50 min for 1000.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.44 (build-lemma-index)";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = join(CACHE_DIR, "lemma-index.json");

const CONCURRENCY = 2;
const PACING_MS = 300;
const MAX_RETRIES = 3;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

// Resolve target tablet list. Priority:
//   1. env LEMMA_INDEX_TARGETS=K.5896,K.9508,BM.47463
//   2. argv tail
//   3. Default high-host set from methods paper §§3.x
function resolveTargets() {
  if (process.env.LEMMA_INDEX_TARGETS) {
    return process.env.LEMMA_INDEX_TARGETS.split(/[,\s]+/).filter(Boolean);
  }
  const argTargets = process.argv.slice(2).filter((a) => /^[A-Z]+/.test(a));
  if (argTargets.length > 0) return argTargets;
  return [
    "K.5896", "K.9508", "BM.45749", "K.2987.B", "K.163", "K.2550", "K.6683",  // Mīs pî
    "BM.47463", "CBS.6060",                                                    // Šurpu
    "Sm.1055", "K.7246",                                                       // Udug-ḫul
    "K.2761",                                                                  // Bīt salāʾ mê
    "K.2961", "K.2467", "K.18", "K.2950",                                      // Maqlû
    "K.3716", "Rm-II.504", "BM.42125",                                         // EAE
    "BM.77056", "BM.74130",                                                    // āšipūtu curriculum
  ];
}

const TARGETS = resolveTargets();

console.log(`cuneiform-mcp build-lemma-index v0.44.0`);
console.log(`  output:      ${OUT_PATH}`);
console.log(`  source:      eBL /fragments/{id} lemmas extraction`);
console.log(`  concurrency: ${CONCURRENCY}  ·  pacing: ${PACING_MS}ms`);
console.log(`  targets:     ${TARGETS.length} tablets`);
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

// eBL /fragments/{id} returns a `text` object with `lines[]`. Each line has
// `content[]` of tokens, some of which carry `unique_lemma[]` arrays
// (canonical lemma IDs like "rabû I" or "ana I"). Extract all unique
// lemmas across all lines.
function extractLemmas(fragmentData) {
  const lemmas = new Set();
  const lines = fragmentData?.text?.lines ?? [];
  for (const line of lines) {
    const content = line?.content ?? [];
    for (const token of content) {
      if (Array.isArray(token?.unique_lemma)) {
        for (const lem of token.unique_lemma) {
          if (typeof lem === "string" && lem.length > 0) lemmas.add(lem);
        }
      }
    }
  }
  return Array.from(lemmas);
}

async function paced(fn, ms) {
  const out = await fn();
  await new Promise((r) => setTimeout(r, ms));
  return out;
}

// ─── Main loop ─────────────────────────────────────────────────────────────

const entries = {};
let okCount = 0;
let failCount = 0;
let withLemmas = 0;
const failures = [];
const t0 = Date.now();

for (let i = 0; i < TARGETS.length; i += CONCURRENCY) {
  const batch = TARGETS.slice(i, i + CONCURRENCY);
  if (i > 0 && i % 10 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(`  progress: ${i}/${TARGETS.length} (${elapsed}s, ${okCount} ok, ${failCount} fail)\n`);
  }
  const results = await Promise.all(batch.map((id) => paced(() => fetchFragment(id), PACING_MS)));
  for (const res of results) {
    if (!res.ok || !res.data) {
      failures.push({ id: res.id, status: res.status, error: res.error });
      failCount++;
      continue;
    }
    const lemmas = extractLemmas(res.data);
    entries[res.id] = {
      lemmas,
      n_lemmas: lemmas.length,
    };
    okCount++;
    if (lemmas.length > 0) withLemmas++;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Lemma-index build complete:`);
console.log(`  targets processed: ${TARGETS.length}`);
console.log(`  ok:                ${okCount}`);
console.log(`  failed:            ${failCount}`);
console.log(`  with lemmas:       ${withLemmas}`);
console.log(`  elapsed:           ${elapsed}s`);

if (failures.length > 0) {
  console.log(``);
  console.log(`First 5 failures:`);
  for (const f of failures.slice(0, 5)) {
    console.log(`  ${f.id}: ${f.status ?? f.error}`);
  }
}

const out = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  source: "eBL /fragments/{id} → text.lines[].content[].unique_lemma[]",
  build_stats: {
    targets_processed: TARGETS.length,
    ok: okCount,
    failed: failCount,
    with_lemmas: withLemmas,
    elapsed_seconds: parseFloat(elapsed),
  },
  entries,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(``);
console.log(`Wrote ${Object.keys(entries).length} entries to ${OUT_PATH}`);
console.log(``);
console.log(`To extend: re-run with LEMMA_INDEX_TARGETS env var or argv list.`);
console.log(`Example: LEMMA_INDEX_TARGETS=K.5896,K.9508 node scripts/build-lemma-index.mjs`);
