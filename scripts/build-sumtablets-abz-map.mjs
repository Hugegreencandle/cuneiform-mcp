#!/usr/bin/env node
// cuneiform-mcp — build data/sumtablets-abz-map.json (OGSL sign-NAME → eBL ABZ).
//
// THE BRIDGE (SumTablets edition): SumTablets `glyph_names` are OGSL-style SIGN
// NAMES (MAŠ₂, EŠ₂, |AMAR×ŠE.AMAR×ŠE|, ...), the SAME name space ccpo's
// build-ccpo-abz-map.mjs already mapped to eBL ABZ codes. The committed
// data/ccpo-abz-map.json (657 entries, Akkadian-tuned) covers ~90% of SumTablets
// sign tokens out of the box. This script runs the eBL Layer-3 gap-fill over the
// SUMTABLETS-SPECIFIC residual names (genuine Sumerian signs absent from the
// Akkadian map: EŠ₂, ŠA₃, SAR, |EN.ZU|, GURUŠ, ...) and writes a SMALL committed
// LAYER (data/sumtablets-abz-map.json) that the converter applies ON TOP of
// ccpo-abz-map.json — exactly the same canonicalAbz()/IPv4 machinery as ccpo.
//
// HARD GUARDRAILS (mirror build-ccpo-abz-map.mjs):
//   - eBL/Borger numbering ONLY (A=ABZ579). Assert sentinels before write.
//   - Force IPv4 (eBL's IPv6 listener silently times out → HTTP000 footgun).
//   - Whole pipe-compounds first; emit a single ABZ via eBL or leave unmapped
//     (the converter emits 'X' for unmapped — alignment-preserving, NOT a lossy
//     partial decomposition).
//
// Output: data/sumtablets-abz-map.json (small, committed for reproducibility).
// Requires: scripts/fetch-sumtablets.mjs run first (cached parquet shards).
//           hyparquet + hyparquet-compressors (devDependencies).

import dns from "node:dns";
import net from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parquetReadObjects, parquetMetadataAsync } from "hyparquet";
import { compressors } from "hyparquet-compressors";

// ── IPv4 hard-pin (eBL's IPv6 listener silently times out) ──────────────────
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const CCPO_MAP_PATH = join(REPO_DIR, "data", "ccpo-abz-map.json");
const OUT_PATH = join(REPO_DIR, "data", "sumtablets-abz-map.json");

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp (build-sumtablets-abz-map)";
const PACING_MS = 200;
const MAX_RETRIES = 3;
const OFFLINE = process.env.SUMTABLETS_MAP_OFFLINE === "1";
const BATCH = 8000;

// Structural / damage / numeral classifiers (shared with the converter spec).
const STRUCT = new Set(["<SURFACE>", "<COLUMN>", "<RULING>", "<BLANK_SPACE>"]);
const COMPOUND_DELIM_RE = /[.&×%+]/;

function isDamage(t) {
  return t === "<unk>" || t.includes("...");
}
function isNumeral(t) {
  // 4(U), 3(DIŠ), 2(GEŠ₂), bare digits, and the SumTablets repeat-marker MIN.
  return /^[0-9]/.test(t) || t === "MIN";
}
function stripGraphicVariant(name) {
  return name.replace(/@[A-Za-z0-9]+/g, "");
}
function canonicalAbz(raw) {
  if (!raw) return null;
  let s = String(raw).trim().split(/\s+/)[0];
  if (!/^ABZ/i.test(s)) s = "ABZ" + s;
  s = s.replace(/^ABZ0+(\d)/, "ABZ$1");
  return s;
}
function constituentsOf(name) {
  const inner = name.replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .split(COMPOUND_DELIM_RE)
    .map((p) => p.trim().replace(/^\(+/, "").replace(/\)+$/, "").trim())
    .filter((p) => p.length > 0);
}

console.log("cuneiform-mcp build-sumtablets-abz-map");
console.log(`  ccpo base map: ${CCPO_MAP_PATH}`);
console.log(`  output:        ${OUT_PATH}`);
console.log("");

if (!existsSync(CCPO_MAP_PATH)) {
  console.error(`✘ required base map not found: ${CCPO_MAP_PATH}`);
  console.error("  Run scripts/build-ccpo-abz-map.mjs first.");
  process.exit(1);
}

// ── Load the ccpo base map (priority layer; SumTablets layer only ADDS) ─────
const ccpoDoc = JSON.parse(readFileSync(CCPO_MAP_PATH, "utf-8"));
const baseMap = new Map(Object.entries(ccpoDoc.map ?? {}));
console.log(`Loaded ccpo base map: ${baseMap.size} names.`);

function resolvableInBase(name) {
  if (baseMap.has(name)) return true;
  const b = stripGraphicVariant(name);
  return b !== name && baseMap.has(b);
}

// ── Enumerate the distinct glyph_names SumTablets actually uses ─────────────
const shardFiles = readdirSync(CACHE_DIR).filter(
  (f) => /^sumtablets-.*\.parquet$/.test(f),
);
if (shardFiles.length === 0) {
  console.error(`✘ no sumtablets-*.parquet shards in ${CACHE_DIR}`);
  console.error("  Run scripts/fetch-sumtablets.mjs first.");
  process.exit(1);
}
console.log(`Scanning ${shardFiles.length} shard(s): ${shardFiles.join(", ")}`);

const nameFreq = new Map();
for (const f of shardFiles) {
  const buf = readFileSync(join(CACHE_DIR, f));
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const meta = await parquetMetadataAsync(ab);
  const N = Number(meta.num_rows);
  for (let s = 0; s < N; s += BATCH) {
    const e = Math.min(s + BATCH, N);
    const rows = await parquetReadObjects({
      file: ab,
      compressors,
      rowStart: s,
      rowEnd: e,
      columns: ["glyph_names"],
    });
    for (const r of rows) {
      for (const line of String(r.glyph_names ?? "").split("\n")) {
        for (const t of line.trim().split(/\s+/).filter(Boolean)) {
          if (STRUCT.has(t) || isDamage(t) || isNumeral(t)) continue;
          nameFreq.set(t, (nameFreq.get(t) || 0) + 1);
        }
      }
    }
  }
  console.log(`  ${f}: ${N} rows scanned (${nameFreq.size} distinct names cumulative)`);
}
console.log(`\nSumTablets distinct sign names: ${nameFreq.size}`);

// Build the gap-fill set: names (and compound atoms) NOT resolvable in baseMap.
const needGapFill = new Set();
for (const name of nameFreq.keys()) {
  if (resolvableInBase(name)) continue;
  // Whole compound first (a single canonical ABZ if eBL knows it) + atoms.
  if (name.includes("|") || COMPOUND_DELIM_RE.test(name)) {
    needGapFill.add(name);
    for (const c of constituentsOf(name)) {
      if (!resolvableInBase(c) && !isNumeral(c)) needGapFill.add(stripGraphicVariant(c));
    }
  } else {
    needGapFill.add(stripGraphicVariant(name));
  }
}
console.log(`Names needing eBL gap-fill: ${needGapFill.size}`);

// ── Layer 3: eBL /api/signs/{NAME} gap-fill (IPv4) ──────────────────────────
async function fetchEblSign(name) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${EBL_BASE}/signs/${encodeURIComponent(name)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (res.status === 404) return { name, ok: true, found: false };
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 800 * attempt));
          continue;
        }
        return { name, ok: false, status: res.status };
      }
      const j = await res.json();
      const lists = Array.isArray(j.lists) ? j.lists : [];
      const abzList = lists.filter((l) => l.name === "ABZ").map((l) => l.number);
      return { name, ok: true, found: abzList.length > 0, abz: abzList[0], canonical: j.name };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 800 * attempt));
        continue;
      }
      return { name, ok: false, error: e.message ?? String(e) };
    }
  }
  return { name, ok: false };
}

const layerMap = new Map(); // name → ABZ (the NEW layer only)
let gapFilled = 0;
let gapMissed = 0;
let gapFailed = 0;

if (!OFFLINE && needGapFill.size > 0) {
  console.log(`\nGap-filling ${needGapFill.size} names via eBL /api/signs (IPv4)...`);
  const names = [...needGapFill].sort();
  for (let i = 0; i < names.length; i++) {
    const r = await fetchEblSign(names[i]);
    await new Promise((res) => setTimeout(res, PACING_MS));
    if (!r.ok) {
      gapFailed++;
      continue;
    }
    if (r.found && r.abz) {
      layerMap.set(r.name, canonicalAbz(r.abz));
      gapFilled++;
    } else {
      gapMissed++;
    }
    if ((i + 1) % 25 === 0)
      process.stderr.write(`  ...${i + 1}/${names.length} (+${gapFilled} filled)\n`);
  }
  console.log(`Layer 3 (eBL gap-fill): +${gapFilled} filled · ${gapMissed} no-ABZ · ${gapFailed} failed`);
  if (gapFilled === 0 && gapFailed > 0) {
    console.error(`✘ ALL ${gapFailed} eBL gap-fill calls failed — likely IPv6/HTTP000. Aborting.`);
    process.exit(1);
  }
} else if (OFFLINE) {
  console.log("\nLayer 3 (eBL gap-fill) skipped — SUMTABLETS_MAP_OFFLINE=1 (reuse existing layer)");
  if (existsSync(OUT_PATH)) {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf-8"));
    for (const [n, a] of Object.entries(prev.map ?? {})) layerMap.set(n, a);
    console.log(`  reloaded ${layerMap.size} names from existing ${OUT_PATH}`);
  }
}

// ── Numbering guardrails: the COMBINED (base ⊕ layer) map must obey eBL/Borger.
function combined(name) {
  return layerMap.get(name) ?? baseMap.get(name) ?? null;
}
const sentinels = [
  ["A", "ABZ579"],
  ["MA", "ABZ342"],
  ["AN", "ABZ13"],
];
for (const [name, expected] of sentinels) {
  const got = combined(name);
  if (got && got !== expected) {
    console.error(`✘ NUMBERING GUARDRAIL FAILED: ${name} → ${got} (expected ${expected}). Aborting.`);
    process.exit(1);
  }
}
console.log(`\nNumbering guardrails passed (base⊕layer): A→ABZ579, MA→ABZ342, AN→ABZ13.`);

// ── Coverage measurement over the SumTablets inventory (base ⊕ layer) ───────
let totalTok = 0;
let resolved = 0;
let unmapped = 0;
const unmappedFreq = new Map();
function resolveCombined(name) {
  if (combined(name)) return true;
  const b = stripGraphicVariant(name);
  if (b !== name && combined(b)) return true;
  return false;
}
for (const [name, freq] of nameFreq.entries()) {
  totalTok += freq;
  if (resolveCombined(name)) resolved += freq;
  else {
    unmapped += freq;
    unmappedFreq.set(name, freq);
  }
}
const coverage = totalTok > 0 ? (100 * resolved) / totalTok : 0;

// ── Write the small committed layer ─────────────────────────────────────────
const sortedNames = [...layerMap.keys()].sort();
const mapObject = {};
for (const n of sortedNames) mapObject[n] = layerMap.get(n);

const out = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  description:
    "OGSL/SumTablets sign-NAME → eBL ABZ code — a SMALL gap-fill LAYER applied ON TOP of data/ccpo-abz-map.json for the Sumerian sign names absent from the Akkadian-tuned ccpo map. eBL/Borger numbering (A=ABZ579), NOT OGSL ABZL. Built by scripts/build-sumtablets-abz-map.mjs (eBL /api/signs Layer-3 gap-fill, IPv4-pinned).",
  source:
    "SumTablets distinct glyph_names (Simmons, Diehl-Martinez & Jurafsky, ML4AL @ ACL 2024; HF colesimmons/SumTablets, CC-BY-4.0) NOT resolvable in ccpo-abz-map.json, gap-filled via eBL /api/signs/{NAME} lists[].number (ABZ).",
  layers_over: "data/ccpo-abz-map.json",
  build_stats: {
    sumtablets_distinct_names: nameFreq.size,
    layer_names: sortedNames.length,
    gap_filled: gapFilled,
    gap_missed: gapMissed,
    gap_failed: gapFailed,
    sumtablets_sign_tokens: totalTok,
    sumtablets_resolved_base_plus_layer: resolved,
    sumtablets_unmapped: unmapped,
    sumtablets_coverage_pct_base_plus_layer: parseFloat(coverage.toFixed(2)),
  },
  residual_unmapped: Object.fromEntries(
    [...unmappedFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200),
  ),
  map: mapObject,
};

if (!existsSync(join(REPO_DIR, "data"))) mkdirSync(join(REPO_DIR, "data"), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

console.log("");
console.log("══════════════════════════════════════════════════════════");
console.log(`sumtablets→ABZ layer built: ${sortedNames.length} new names`);
console.log(`  sumtablets sign tokens:     ${totalTok}`);
console.log(`  resolved (base⊕layer):      ${resolved}`);
console.log(`  unmapped:                   ${unmapped}`);
console.log(`  COVERAGE (base⊕layer):      ${coverage.toFixed(2)}%`);
console.log(`Wrote ${OUT_PATH}`);
