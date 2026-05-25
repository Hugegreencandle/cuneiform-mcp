#!/usr/bin/env node
// Build the ABZ → Unicode cuneiform glyph map for find_sign_glyph (v0.42.0).
//
// Joins OGSL labasi-signs.json (ABZ → sign_name) with eBL /api/signs/{NAME}
// (sign_name → Unicode codepoints). Writes the result to
// ~/.cache/cuneiform-mcp/abz-glyph-map.json.
//
// Run frequency: once, then re-run only when the eBL sign-list updates
// (rare). Polite consumer: concurrency=2 with 250ms inter-request pacing.
// Expected runtime: ~5-7 minutes for ~239 labasi signs.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const OGSL_URL = "https://raw.githubusercontent.com/oracc/osl/master/00etc/labasi-signs.json";
const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.42 (build-abz-glyph-map)";

const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const OUT_PATH = join(CACHE_DIR, "abz-glyph-map.json");

const CONCURRENCY = 2;
const PACING_MS = 250;
const MAX_RETRIES = 3;

if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

console.log(`cuneiform-mcp build-abz-glyph-map`);
console.log(`  output:     ${OUT_PATH}`);
console.log(`  source:     OGSL Labasi (${OGSL_URL}) + eBL /signs`);
console.log(`  concurrency: ${CONCURRENCY}  ·  pacing: ${PACING_MS}ms between requests`);
console.log(``);

// ─── Step 1: load OGSL Labasi ──────────────────────────────────────────────

console.log(`Fetching OGSL labasi-signs.json...`);
const ogslRes = await fetch(OGSL_URL, { headers: { "User-Agent": USER_AGENT } });
if (!ogslRes.ok) {
  console.error(`OGSL fetch failed: ${ogslRes.status}`);
  process.exit(1);
}
const ogslData = await ogslRes.json();
const signs = (ogslData.results ?? ogslData).filter(
  (s) => s.sign_name && s.abz_number,
);
console.log(`Loaded ${signs.length} Labasi signs with both sign_name and abz_number`);
console.log(``);

// ─── Step 2: fetch eBL /signs/{NAME} per sign ──────────────────────────────

async function fetchEblSignByName(name) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${EBL_BASE}/signs/${encodeURIComponent(name)}`, {
        headers: { "User-Agent": USER_AGENT },
      });
      if (res.status === 404) return { ok: false, status: 404 };
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        return { ok: false, status: res.status };
      }
      return { ok: true, data: await res.json(), via: "by_name" };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { ok: false, error: e.message ?? String(e) };
    }
  }
  return { ok: false };
}

// Fallback: lookup by ABZ number when /signs/{name} returns 404. Labasi's
// sign_name field doesn't always match eBL's canonical sign name (e.g.
// Labasi names ABZ97 "AG" but eBL canonicalizes it as "AK"). The
// list-filter endpoint resolves by ABZ number directly.
async function fetchEblSignByAbz(abzNumber) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${EBL_BASE}/signs?listsName=ABZ&listsNumber=${encodeURIComponent(abzNumber)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        return { ok: false, status: res.status };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, status: 404 };
      }
      // Multiple ABZ-matched signs occasionally exist (cross-list collisions).
      // Take the first record — same convention used by eBL's own UI.
      return { ok: true, data: data[0], via: "by_abz" };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { ok: false, error: e.message ?? String(e) };
    }
  }
  return { ok: false };
}

// v0.56 — fall back to MZL number when both name + ABZ-number lookups fail.
// Some Labasi short names (KAM, KIB, US, ŠÁM) map to compound canonical
// names in eBL (|HI×BAD| etc.) that the by-name path can't find, and eBL
// has no ABZ-number entry for them under the bare ABZ id either. The MZL
// number (from Labasi's meszl_number field) resolves them.
async function fetchEblSignByMzl(mzlNumber) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const url = `${EBL_BASE}/signs?listsName=MZL&listsNumber=${encodeURIComponent(mzlNumber)}`;
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      if (!res.ok) {
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * attempt));
          continue;
        }
        return { ok: false, status: res.status };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return { ok: false, status: 404 };
      }
      return { ok: true, data: data[0], via: "by_mzl" };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 1000 * attempt));
        continue;
      }
      return { ok: false, error: e.message ?? String(e) };
    }
  }
  return { ok: false };
}

async function fetchEblSign(name, abzNumber, mzlNumber) {
  // First try by name (fast path, works for ~140 of 237 Labasi signs).
  const r1 = await fetchEblSignByName(name);
  if (r1.ok) return { name, abz: abzNumber, ...r1 };
  // 404 (or other failure) → fall back to ABZ-number list filter (v0.46).
  const r2 = await fetchEblSignByAbz(abzNumber);
  if (r2.ok) return { name, abz: abzNumber, ...r2 };
  // Last resort — try MZL number if Labasi provided one (v0.56).
  if (mzlNumber !== null && mzlNumber !== undefined) {
    const r3 = await fetchEblSignByMzl(mzlNumber);
    if (r3.ok) return { name, abz: abzNumber, ...r3 };
  }
  return { name, abz: abzNumber, ...r2 };
}

async function paced(fn, ms) {
  const out = await fn();
  await new Promise((r) => setTimeout(r, ms));
  return out;
}

// Process in batches of CONCURRENCY with PACING_MS between batches.
const entries = {};
let okCount = 0;
let failCount = 0;
let with_glyph = 0;
const failures = [];
const t0 = Date.now();

for (let i = 0; i < signs.length; i += CONCURRENCY) {
  const batch = signs.slice(i, i + CONCURRENCY);
  if (i > 0 && i % 20 === 0) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    process.stderr.write(`  progress: ${i}/${signs.length} (${elapsed}s, ${okCount} ok, ${failCount} fail)\n`);
  }
  const results = await Promise.all(
    batch.map((s) =>
      paced(
        () =>
          fetchEblSign(
            s.sign_name,
            parseInt(s.abz_number, 10),
            s.meszl_number ? parseInt(s.meszl_number, 10) : null,
          ),
        PACING_MS,
      ),
    ),
  );
  for (let j = 0; j < batch.length; j++) {
    const sign = batch[j];
    const res = results[j];
    const abz = `ABZ${String(parseInt(sign.abz_number, 10)).padStart(3, "0")}`;
    if (!res.ok || !res.data) {
      failures.push({ abz, sign_name: sign.sign_name, status: res.status, error: res.error });
      failCount++;
      continue;
    }
    const codepoints = res.data.unicode ?? [];
    const glyph = codepoints
      .filter((cp) => typeof cp === "number" && cp > 0)
      .map((cp) => String.fromCodePoint(cp))
      .join("");
    // Use eBL's canonical sign name when available (may differ from Labasi).
    const canonicalName = res.data.name ?? sign.sign_name;
    entries[abz] = {
      sign_name: canonicalName,
      labasi_name: sign.sign_name,
      ebl_canonical_name: res.data.name ?? null,
      via: res.via,
      codepoints,
      glyph,
    };
    okCount++;
    if (codepoints.length > 0) with_glyph++;
  }
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(``);
console.log(`══════════════════════════════════════════════════════════`);
console.log(`Glyph map build complete:`);
console.log(`  signs processed: ${signs.length}`);
console.log(`  ok:              ${okCount}`);
console.log(`  failed:          ${failCount}`);
console.log(`  with glyph:      ${with_glyph}`);
console.log(`  elapsed:         ${elapsed}s`);

if (failures.length > 0) {
  console.log(``);
  console.log(`First 5 failures:`);
  for (const f of failures.slice(0, 5)) {
    console.log(`  ${f.abz} ${f.sign_name}: ${f.status ?? f.error}`);
  }
}

const out = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  source: "OGSL Labasi ∩ eBL /signs",
  build_stats: {
    signs_processed: signs.length,
    ok: okCount,
    failed: failCount,
    with_glyph,
    elapsed_seconds: parseFloat(elapsed),
  },
  entries,
};

writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
console.log(``);
console.log(`Wrote ${Object.keys(entries).length} entries to ${OUT_PATH}`);
