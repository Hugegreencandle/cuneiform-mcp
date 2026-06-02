#!/usr/bin/env node
// cuneiform-mcp — build ~/.cache/cuneiform-mcp/sumtablets-signs.json.
//
// Converts the cached SumTablets parquet shards (glyph_names = OGSL-style SIGN
// NAMES) to the eBL all-signs {_id, signs} shape so the chunk engine can ingest
// Sumerian tablets as first-class corpus members — the SAME shape and the SAME
// downstream wiring as ccpo-signs.json (STAGE B mirror of the v0.75 ccpo bridge).
//
//   _id   = SumTablets row id (CDLI P-number, e.g. P112475)
//   signs = eBL all-signs string: space-separated UNPADDED ABZ codes per sign,
//           one line per newline, "X" for damage / unmapped / numerals;
//           structural markers (<SURFACE>/<COLUMN>/<RULING>/<BLANK_SPACE>) dropped.
//
// Map: data/ccpo-abz-map.json ⊕ data/sumtablets-abz-map.json (the SumTablets
// gap-fill layer takes priority on overlapping names; both eBL/Borger unpadded).
//
// HONESTY: Sumerian tablets are NOT eBL compositions — they participate ONLY as
// chunk-index / find_chunk_parallels hosts. This script fabricates NO composition
// assignment; it emits only {_id, signs}.
//
// Requires: scripts/fetch-sumtablets.mjs + scripts/build-sumtablets-abz-map.mjs.
//           hyparquet + hyparquet-compressors (devDependencies). PRINTS the
//           measured non-damage coverage %.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parquetReadObjects, parquetMetadataAsync } from "hyparquet";
import { compressors } from "hyparquet-compressors";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const CCPO_MAP_PATH = join(REPO_DIR, "data", "ccpo-abz-map.json");
const SUMTABLETS_MAP_PATH = join(REPO_DIR, "data", "sumtablets-abz-map.json");
const OUT_PATH = join(CACHE_DIR, "sumtablets-signs.json");
// Runtime metadata sidecar consumed by the search_sumtablets MCP tool. Keeps
// hyparquet a BUILD-TIME (dev) dependency only — the server reads this JSON, not
// the parquet. Holds the native SumTablets metadata the ABZ signs blob drops.
const META_OUT_PATH = join(CACHE_DIR, "sumtablets-meta.json");
const BATCH = 8000;
const TRANSLIT_CAP = 4000; // cap stored transliteration length (keep the sidecar lean)

const STRUCT = new Set(["<SURFACE>", "<COLUMN>", "<RULING>", "<BLANK_SPACE>"]);
const COMPOUND_DELIM_RE = /[.&×%+]/;

function isDamage(t) {
  return t === "<unk>" || t.includes("...");
}
function isNumeral(t) {
  return /^[0-9]/.test(t) || t === "MIN";
}
function stripGraphicVariant(name) {
  return name.replace(/@[A-Za-z0-9]+/g, "");
}

console.error("cuneiform-mcp build-sumtablets-signs");
console.error(`  ccpo base map:     ${CCPO_MAP_PATH}`);
console.error(`  sumtablets layer:  ${SUMTABLETS_MAP_PATH}`);
console.error(`  output:            ${OUT_PATH}`);
console.error("");

if (!existsSync(CCPO_MAP_PATH)) {
  console.error(`✘ ccpo-abz-map.json not found: ${CCPO_MAP_PATH}`);
  console.error("  Run scripts/build-ccpo-abz-map.mjs first.");
  process.exit(1);
}

// ── Load base ⊕ layer map (layer priority on overlap) ───────────────────────
const baseDoc = JSON.parse(readFileSync(CCPO_MAP_PATH, "utf-8"));
const nameToAbz = new Map(Object.entries(baseDoc.map ?? {}));
let layerCount = 0;
if (existsSync(SUMTABLETS_MAP_PATH)) {
  const layerDoc = JSON.parse(readFileSync(SUMTABLETS_MAP_PATH, "utf-8"));
  for (const [n, a] of Object.entries(layerDoc.map ?? {})) {
    nameToAbz.set(n, a); // layer overrides on overlap
    layerCount++;
  }
}
console.error(`Loaded ${nameToAbz.size} name→ABZ mappings (ccpo base + ${layerCount} sumtablets layer).`);

// Sanity: A must be ABZ579 (unpadded eBL/Borger).
if (nameToAbz.get("A") !== "ABZ579") {
  console.error(`✘ A → ${nameToAbz.get("A")} (expected ABZ579). Padding/numbering bug. Aborting.`);
  process.exit(1);
}

function mapName(name) {
  const direct = nameToAbz.get(name);
  if (direct) return direct;
  const b = stripGraphicVariant(name);
  if (b !== name) {
    const bv = nameToAbz.get(b);
    if (bv) return bv;
  }
  return null;
}

// Convert one glyph_names blob → {signsText, denom, hit, unmapped}.
function convertGlyphNames(gn) {
  const outLines = [];
  let denom = 0,
    hit = 0,
    unmapped = 0;
  for (const line of String(gn ?? "").split("\n")) {
    const toks = line.trim().split(/\s+/).filter(Boolean);
    const out = [];
    for (const t of toks) {
      if (STRUCT.has(t)) continue; // structural → drop
      if (isDamage(t)) {
        out.push("X");
        continue;
      } // damage → X (not counted)
      if (isNumeral(t)) {
        out.push("X");
        continue;
      } // numeral → X (not counted)
      denom++;
      const abz = mapName(t);
      if (abz) {
        out.push(abz);
        hit++;
      } else {
        out.push("X");
        unmapped++;
      }
    }
    if (out.length) outLines.push(out.join(" "));
  }
  return { signsText: outLines.join("\n"), denom, hit, unmapped };
}

// ── Stream the cached shards ────────────────────────────────────────────────
const shardFiles = readdirSync(CACHE_DIR).filter((f) => /^sumtablets-.*\.parquet$/.test(f));
if (shardFiles.length === 0) {
  console.error(`✘ no sumtablets-*.parquet shards in ${CACHE_DIR}`);
  console.error("  Run scripts/fetch-sumtablets.mjs first.");
  process.exit(1);
}

const members = [];
const metaRecords = []; // {id, period, genre, transliteration} for search_sumtablets
const periodFreq = new Map();
const genreFreq = new Map();
const seenIds = new Set();
let totalDenom = 0,
  totalHit = 0,
  totalUnmapped = 0;
let emptySigns = 0,
  dupIds = 0,
  noId = 0;
const unmappedFreq = new Map();

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
      columns: ["id", "period", "genre", "transliteration", "glyph_names"],
    });
    for (const r of rows) {
      const id = r.id;
      if (!id) {
        noId++;
        continue;
      }
      if (seenIds.has(id)) {
        dupIds++;
        continue;
      } // dedupe across splits
      seenIds.add(id);
      const c = convertGlyphNames(r.glyph_names);
      totalDenom += c.denom;
      totalHit += c.hit;
      totalUnmapped += c.unmapped;
      if (c.signsText.trim().length === 0) emptySigns++;
      members.push({ _id: id, signs: c.signsText });
      const period = r.period ? String(r.period) : null;
      const genre = r.genre ? String(r.genre) : null;
      const translit = String(r.transliteration ?? "").slice(0, TRANSLIT_CAP);
      metaRecords.push({ id, period, genre, transliteration: translit });
      if (period) periodFreq.set(period, (periodFreq.get(period) || 0) + 1);
      if (genre) genreFreq.set(genre, (genreFreq.get(genre) || 0) + 1);
      for (const line of String(r.glyph_names ?? "").split("\n")) {
        for (const t of line.trim().split(/\s+/).filter(Boolean)) {
          if (STRUCT.has(t) || isDamage(t) || isNumeral(t)) continue;
          if (!mapName(t)) unmappedFreq.set(t, (unmappedFreq.get(t) || 0) + 1);
        }
      }
    }
  }
  console.error(`  ${f}: ${N} rows processed (${members.length} members cumulative)`);
}

const coverage = totalDenom > 0 ? (100 * totalHit) / totalDenom : 0;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(members));

// Runtime metadata sidecar for search_sumtablets (period/genre skew surfaced).
const metaDoc = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  source:
    "SumTablets (Simmons, Diehl-Martinez & Jurafsky, ML4AL @ ACL 2024; HF colesimmons/SumTablets, CC-BY-4.0)",
  count: metaRecords.length,
  period_distribution: Object.fromEntries(
    [...periodFreq.entries()].sort((a, b) => b[1] - a[1]),
  ),
  genre_distribution: Object.fromEntries(
    [...genreFreq.entries()].sort((a, b) => b[1] - a[1]),
  ),
  records: metaRecords,
};
writeFileSync(META_OUT_PATH, JSON.stringify(metaDoc));

const topUnmapped = [...unmappedFreq.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([n, c]) => `${n}(${c})`)
  .join(" ");

console.error("");
console.error("══════════════════════════════════════════════════════════");
console.error(`sumtablets-signs.json built: ${members.length} members`);
console.error(`  sign tokens (denom):      ${totalDenom}`);
console.error(`  mapped:                   ${totalHit}`);
console.error(`  unmapped → X:             ${totalUnmapped}`);
console.error(`  NON-DAMAGE COVERAGE:      ${coverage.toFixed(2)}%`);
console.error(`  distinct unmapped names:  ${unmappedFreq.size}`);
console.error(`  top unmapped:             ${topUnmapped}`);
console.error(`  members w/ empty signs:   ${emptySigns}`);
console.error(`  duplicate ids skipped:    ${dupIds}`);
console.error(`  rows w/ no id:            ${noId}`);
console.error(`Wrote ${OUT_PATH}`);
console.error(`Wrote ${META_OUT_PATH} (${metaRecords.length} metadata records)`);
