#!/usr/bin/env node
// cuneiform-mcp — fetch the SumTablets parquet shards into the runtime cache.
//
// SumTablets (Simmons, Diehl-Martinez, Jurafsky — "SumTablets: A Transliteration
// Dataset of Sumerian Tablets", ML4AL @ ACL 2024; HF colesimmons/SumTablets,
// CC-BY-4.0) is a ~91.6K-row corpus of Sumerian tablet transliterations with
// CDLI P-number ids, period, genre, transliteration, glyph_names (OGSL-style
// SIGN NAMES), and Unicode glyphs.
//
// LICENSING: CC-BY-4.0 — attribution required, otherwise clean / MIT-compatible.
// We mirror the ccpo/ProtoSnap "repo CALLS but never CONTAINS" posture: the
// ~117 MB corpus is fetched to the user's cache (~/.cache/cuneiform-mcp/), NEVER
// committed. This script is user-invoked (`node scripts/fetch-sumtablets.mjs`).
//
// Resolves the HF parquet endpoint, then downloads each split shard to
// ~/.cache/cuneiform-mcp/sumtablets-<split>.parquet. Subsequent build scripts
// (build-sumtablets-abz-map.mjs, build-sumtablets-signs.mjs) read these shards.

import { existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const HF_PARQUET_API =
  "https://huggingface.co/api/datasets/colesimmons/SumTablets/parquet";
const USER_AGENT = "cuneiform-mcp (fetch-sumtablets)";

// Which splits to fetch. Default: all three (train+validation+test = ~91.6K rows).
// Override with SUMTABLETS_SPLITS="train" for just the 82,452-row train shard.
const SPLITS = (process.env.SUMTABLETS_SPLITS || "train,validation,test")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

console.error("cuneiform-mcp fetch-sumtablets");
console.error(`  HF parquet API: ${HF_PARQUET_API}`);
console.error(`  cache dir:      ${CACHE_DIR}`);
console.error(`  splits:         ${SPLITS.join(", ")}`);
console.error("");

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

async function resolveShards() {
  const res = await fetch(HF_PARQUET_API, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HF parquet resolver HTTP ${res.status}`);
  const doc = await res.json();
  // Shape: { "<config>": { "<split>": ["url", ...], ... } }
  const config = doc.default ?? Object.values(doc)[0];
  if (!config) throw new Error("HF parquet resolver returned no config");
  return config;
}

async function download(url, outPath) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 4 || buf.subarray(0, 4).toString("latin1") !== "PAR1") {
    throw new Error(`downloaded shard is not a parquet file (no PAR1 magic): ${url}`);
  }
  writeFileSync(outPath, buf);
  return buf.length;
}

const config = await resolveShards();
let totalBytes = 0;
for (const split of SPLITS) {
  const urls = config[split];
  if (!Array.isArray(urls) || urls.length === 0) {
    console.error(`  ⚠ split "${split}" not found in resolver — skipping`);
    continue;
  }
  if (urls.length > 1) {
    console.error(`  ⚠ split "${split}" has ${urls.length} shards — fetching only shard 0`);
  }
  const outPath = join(CACHE_DIR, `sumtablets-${split}.parquet`);
  if (existsSync(outPath) && process.env.SUMTABLETS_FORCE !== "1") {
    const sz = statSync(outPath).size;
    console.error(`  ${split}: already cached (${sz} bytes) — set SUMTABLETS_FORCE=1 to refetch`);
    totalBytes += sz;
    continue;
  }
  process.stderr.write(`  ${split}: downloading ${urls[0]} ... `);
  const bytes = await download(urls[0], outPath);
  totalBytes += bytes;
  process.stderr.write(`${bytes} bytes → ${outPath}\n`);
}

console.error("");
console.error(`✓ SumTablets shards in cache (${(totalBytes / 1024 / 1024).toFixed(1)} MB total).`);
console.error("  Next: node scripts/build-sumtablets-abz-map.mjs  (then build-sumtablets-signs.mjs)");
console.error("  Cite: Simmons, Diehl-Martinez & Jurafsky, SumTablets (ML4AL @ ACL 2024), CC-BY-4.0.");
