#!/usr/bin/env node
// cuneiform-mcp — build data/ccpo-abz-map.json (OGSL sign-NAME → eBL ABZ code).
//
// THE BRIDGE: ccpo editions are Oracc CDL with TRANSLITERATION, not ABZ codes,
// but every l-node's f.gdl[] carries gdl_sign = the OGSL SIGN NAME. To inject a
// ccpo edition into the eBL all-signs chunk corpus we need OGSL-name → eBL-ABZ.
//
// This script LAYERS, in priority order:
//   (1) invert ~/.cache/cuneiform-mcp/abz-glyph-map.json (519 entries,
//       ABZ→{sign_name,labasi_name,ebl_canonical_name}; eBL/Borger numbering,
//       A=ABZ579). Offline, resolves the bulk.
//   (2) OGSL labasi-signs.json (same source index.ts loads; +a few distinct).
//   (3) GAP-FILL via eBL /api/signs/{NAME} → lists[].number where name=='ABZ',
//       for the names ccpo actually uses that (1)+(2) miss. MUST force IPv4
//       (the abz-glyph-map IPv6 footgun) and cache results BACK into
//       abz-glyph-map.json so the build is offline-reproducible thereafter.
//
// HARD GUARDRAILS (artifact_risks):
//   - eBL ABZ numbering ONLY (A=ABZ579). NEVER OGSL @list ABZL (A=ABZL470).
//     Assert A→ABZ579, AN→ABZ13-family, MA→ABZ444 before writing.
//   - Force IPv4; assert non-empty gap-fill coverage before trusting it.
//   - Map is injective per distinct name; log many-names→one-ABZ collapses.
//
// Output: data/ccpo-abz-map.json (small, committed for reproducibility/citation).

import dns from "node:dns";
import net from "node:net";
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// ── IPv4 hard-pin (eBL's IPv6 listener silently times out; bare fetch=HTTP000)
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const ABZ_GLYPH_MAP = join(CACHE_DIR, "abz-glyph-map.json");
const CCPO_CORPUS_DIR = join(CACHE_DIR, "oracc", "ccpo", "corpusjson");
const OUT_PATH = join(REPO_DIR, "data", "ccpo-abz-map.json");

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.75 (build-ccpo-abz-map)";
const OGSL_SIGNS_URL = "https://raw.githubusercontent.com/oracc/osl/master/00etc/labasi-signs.json";
const PACING_MS = 200;
const MAX_RETRIES = 3;
const OFFLINE = process.env.CCPO_MAP_OFFLINE === "1";

const NUMERAL_RE = /^(\d+)\([^)]+\)$/;
const COMPOUND_DELIM_RE = /[.&×%+]/;

function stripGraphicVariant(name) {
  return name.replace(/@[A-Za-z0-9]+/g, "");
}

// Canonicalize an ABZ code to the UNPADDED eBL all-signs form so ccpo tokens
// share chunks with the base corpus. all-signs-full.json uses ABZ13 / ABZ69 /
// ABZ331e+152i (NO leading zeros), NOT ABZ013. Also normalizes raw eBL numbers
// that carry a parenthetical alternate ("314 (168)" → "314") or stray spaces.
function canonicalAbz(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // From eBL /api/signs the number may be "314 (168)" or "331e+152i"; the
  // primary code is everything up to the first space.
  s = s.split(/\s+/)[0];
  // Ensure ABZ prefix.
  if (!/^ABZ/i.test(s)) s = "ABZ" + s;
  // Strip leading zeros from the leading numeric run only: ABZ013→ABZ13,
  // ABZ069→ABZ69, ABZ001→ABZ1. Preserve composite/letter suffixes.
  s = s.replace(/^ABZ0+(\d)/, "ABZ$1");
  return s;
}

// ── Layer 1: invert abz-glyph-map.json ──────────────────────────────────────
console.log(`cuneiform-mcp build-ccpo-abz-map`);
console.log(`  abz-glyph-map: ${ABZ_GLYPH_MAP}`);
console.log(`  ccpo corpus:   ${CCPO_CORPUS_DIR}`);
console.log(`  output:        ${OUT_PATH}`);
console.log("");

if (!existsSync(ABZ_GLYPH_MAP)) {
  console.error(`✘ required input not found: ${ABZ_GLYPH_MAP}`);
  process.exit(1);
}
if (!existsSync(CCPO_CORPUS_DIR)) {
  console.error(`✘ ccpo corpusjson not found: ${CCPO_CORPUS_DIR}`);
  console.error("  Run ensureBundle('ccp') first.");
  process.exit(1);
}

const glyphMapDoc = JSON.parse(readFileSync(ABZ_GLYPH_MAP, "utf-8"));
const glyphEntries = glyphMapDoc.entries ?? {};

/** name → ABZ; first writer wins (priority). Tracks collapses for review. */
const nameToAbz = new Map();
const provenanceByName = new Map();
const collapses = []; // {name, existing, attempted, via}

function add(name, abzRaw, via) {
  if (!name || !abzRaw) return;
  const abz = canonicalAbz(abzRaw);
  if (!abz) return;
  const existing = nameToAbz.get(name);
  if (existing === undefined) {
    nameToAbz.set(name, abz);
    provenanceByName.set(name, via);
    return;
  }
  if (existing !== abz) {
    collapses.push({ name, existing, attempted: abz, via });
  }
}

let layer1 = 0;
for (const [abz, v] of Object.entries(glyphEntries)) {
  for (const field of ["sign_name", "labasi_name", "ebl_canonical_name"]) {
    if (v[field]) {
      const before = nameToAbz.size;
      add(v[field], abz, `abz-glyph-map:${field}`);
      if (nameToAbz.size > before) layer1++;
    }
  }
  // ccpo_names[]: OGSL names previously gap-filled and cached back here, so an
  // offline rebuild (CCPO_MAP_OFFLINE=1) reproduces the full map with no network.
  if (Array.isArray(v.ccpo_names)) {
    for (const nm of v.ccpo_names) {
      const before = nameToAbz.size;
      add(nm, abz, "abz-glyph-map:ccpo_names");
      if (nameToAbz.size > before) layer1++;
    }
  }
}
console.log(`Layer 1 (abz-glyph-map invert): ${layer1} distinct names`);

// ── Layer 2: OGSL labasi-signs.json (best-effort; network, non-fatal) ───────
let layer2 = 0;
if (!OFFLINE) {
  try {
    const res = await fetch(OGSL_SIGNS_URL, { headers: { "User-Agent": USER_AGENT } });
    if (res.ok) {
      const data = await res.json();
      for (const s of data.results ?? []) {
        if (s.sign_name && s.abz_number) {
          const abz = `ABZ${s.abz_number}`;
          const before = nameToAbz.size;
          add(s.sign_name.toUpperCase(), abz, "labasi");
          if (nameToAbz.size > before) layer2++;
        }
      }
      console.log(`Layer 2 (OGSL labasi): +${layer2} distinct names`);
    } else {
      console.warn(`Layer 2 (OGSL labasi) skipped — HTTP ${res.status}`);
    }
  } catch (e) {
    console.warn(`Layer 2 (OGSL labasi) skipped — ${e.message ?? e}`);
  }
} else {
  console.log("Layer 2 (OGSL labasi) skipped — CCPO_MAP_OFFLINE=1");
}

// ── Enumerate the OGSL names ccpo actually uses ─────────────────────────────
function walkLemmas(nodes, cb) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (!n || typeof n !== "object") continue;
    if (n.node === "c") walkLemmas(n.cdl, cb);
    else if (n.node === "l") cb(n);
  }
}

function offlineResolvable(name) {
  if (name === "X" || name === "x") return true;
  if (NUMERAL_RE.test(name)) return true;
  if (nameToAbz.has(name)) return true;
  const b = stripGraphicVariant(name);
  if (b !== name && nameToAbz.has(b)) return true;
  return false;
}

// Decompose a compound into clean atomic constituent names.
function constituentsOf(name) {
  const inner = name.replace(/^\|/, "").replace(/\|$/, "");
  return inner
    .split(COMPOUND_DELIM_RE)
    .map((p) => p.trim().replace(/^\(+/, "").replace(/\)+$/, "").trim())
    .filter((p) => p.length > 0);
}

const ccpoFiles = readdirSync(CCPO_CORPUS_DIR).filter((f) => f.endsWith(".json"));
const needGapFill = new Set();
const ccpoNameFreq = new Map();
for (const f of ccpoFiles) {
  const j = JSON.parse(readFileSync(join(CCPO_CORPUS_DIR, f), "utf-8"));
  walkLemmas(j.cdl, (l) => {
    for (const g of (l.f && l.f.gdl) || []) {
      const gs = g.gdl_sign;
      if (!gs || gs === "X" || gs === "x") continue;
      if (NUMERAL_RE.test(gs)) continue;
      ccpoNameFreq.set(gs, (ccpoNameFreq.get(gs) || 0) + 1);
      if (offlineResolvable(gs)) continue;
      // Whole compound (try gap-fill for a single canonical ABZ) + atoms.
      if (gs.includes("|") || COMPOUND_DELIM_RE.test(gs)) {
        needGapFill.add(gs);
        for (const c of constituentsOf(gs)) {
          if (!offlineResolvable(c) && !NUMERAL_RE.test(c)) {
            // eBL keys on the base name; @-variants (e.g. AB@g) 404, base hits.
            needGapFill.add(stripGraphicVariant(c));
          }
        }
      } else {
        // eBL /api/signs keys on the BASE name; KALAM@g 404s, KALAM hits.
        needGapFill.add(stripGraphicVariant(gs));
      }
    }
  });
}
console.log(`\nccpo distinct gdl_sign names: ${ccpoNameFreq.size}`);
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

let gapFilled = 0;
let gapMissed = 0;
let gapFailed = 0;
const gapCacheBack = {}; // name → {abz, canonical} to persist into glyph map

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
      const abz = canonicalAbz(r.abz);
      add(r.name, abz, "ebl-api");
      gapCacheBack[r.name] = { abz, canonical: r.canonical ?? r.name };
      gapFilled++;
    } else {
      gapMissed++;
    }
    if ((i + 1) % 20 === 0) process.stderr.write(`  ...${i + 1}/${names.length} (+${gapFilled} filled)\n`);
  }
  console.log(`Layer 3 (eBL gap-fill): +${gapFilled} filled · ${gapMissed} no-ABZ · ${gapFailed} failed`);

  // Assert gap-fill actually worked over IPv4 (catch the HTTP000-empty footgun).
  if (gapFilled === 0 && gapFailed > 0) {
    console.error(`✘ ALL ${gapFailed} eBL gap-fill calls failed — likely IPv6/HTTP000. Aborting.`);
    process.exit(1);
  }
} else if (OFFLINE) {
  console.log("\nLayer 3 (eBL gap-fill) skipped — CCPO_MAP_OFFLINE=1 (offline reproduce)");
}

// ── Cache LABASI-resolved ccpo names back too (offline reproducibility) ─────
// SAR/MES/BAR etc. resolve only via the layer-2 OGSL labasi fetch; without
// persisting them an offline rebuild would lose them. Mirror them into the
// glyph map's ccpo_names under their canonical ABZ so CCPO_MAP_OFFLINE=1
// reproduces the full coverage with zero network.
if (!OFFLINE) {
  for (const name of ccpoNameFreq.keys()) {
    if (provenanceByName.get(name) !== "labasi") continue;
    const abz = nameToAbz.get(name); // already canonical
    if (!abz) continue;
    if (gapCacheBack[name]) continue;
    gapCacheBack[name] = { abz, canonical: name };
  }
}

// ── Cache eBL results BACK into abz-glyph-map.json (one-time network) ────────
if (Object.keys(gapCacheBack).length > 0) {
  let cachedBack = 0;
  for (const [name, info] of Object.entries(gapCacheBack)) {
    if (!glyphEntries[info.abz]) {
      glyphEntries[info.abz] = {
        sign_name: info.canonical,
        labasi_name: null,
        ebl_canonical_name: info.canonical,
        via: "ccpo-gap-fill",
        source: "ebl_api_signs_by_name",
        codepoints: [],
        glyph: "",
      };
      cachedBack++;
    } else {
      // Augment name fields so future inverts resolve this OGSL name offline.
      const e = glyphEntries[info.abz];
      if (!e.ccpo_names) e.ccpo_names = [];
      if (!e.ccpo_names.includes(name)) {
        e.ccpo_names.push(name);
        cachedBack++;
      }
    }
  }
  glyphMapDoc.entries = glyphEntries;
  writeFileSync(ABZ_GLYPH_MAP, JSON.stringify(glyphMapDoc, null, 2));
  console.log(`Cached ${cachedBack} eBL gap-fill results back into ${ABZ_GLYPH_MAP}`);
}

// ── ABZL-vs-ABZ numbering guardrails ────────────────────────────────────────
// Verified eBL/Borger numbering (2026-06-02 against eBL /api/signs), in the
// UNPADDED all-signs form: A → ABZ579, MA → ABZ342, AN → ABZ13. OGSL ABZL
// would give A=ABZL470 (the wrong-numbering footgun).
const sentinels = [
  ["A", "ABZ579"],
  ["MA", "ABZ342"],
  ["AN", "ABZ13"],
];
for (const [name, expected] of sentinels) {
  const got = nameToAbz.get(name);
  if (got !== expected) {
    console.error(`✘ NUMBERING GUARDRAIL FAILED: ${name} → ${got} (expected ${expected}).`);
    console.error("  This indicates OGSL ABZL numbering leaked in (A=ABZL470). Aborting.");
    process.exit(1);
  }
}
console.log(`\nNumbering guardrails passed: A→ABZ579, MA→ABZ342, AN→ABZ13.`);

// ── Coverage measurement over the real ccpo inventory ───────────────────────
function resolveName(name) {
  if (name === "X" || name === "x") return { kind: "damage" };
  if (NUMERAL_RE.test(name)) return { kind: "numeral" };
  if (nameToAbz.has(name)) return { kind: "direct" };
  const b = stripGraphicVariant(name);
  if (b !== name && nameToAbz.has(b)) return { kind: "normalized" };
  if (name.includes("|") || COMPOUND_DELIM_RE.test(name)) {
    if (nameToAbz.has(name) || (b !== name && nameToAbz.has(b))) return { kind: "compound-whole" };
    const parts = constituentsOf(name);
    if (parts.length > 1) {
      const any = parts.some((c) => {
        if (nameToAbz.has(c)) return true;
        const cb = stripGraphicVariant(c);
        return cb !== c && nameToAbz.has(cb);
      });
      if (any) return { kind: "compound-decomposed" };
    }
  }
  return { kind: "unmapped" };
}

let total = 0,
  damage = 0,
  resolved = 0,
  unmapped = 0;
const unmappedFreq = new Map();
for (const f of ccpoFiles) {
  const j = JSON.parse(readFileSync(join(CCPO_CORPUS_DIR, f), "utf-8"));
  walkLemmas(j.cdl, (l) => {
    for (const g of (l.f && l.f.gdl) || []) {
      const gs = g.gdl_sign;
      if (!gs) continue;
      total++;
      const r = resolveName(gs);
      if (r.kind === "damage") damage++;
      else if (r.kind === "unmapped") {
        unmapped++;
        unmappedFreq.set(gs, (unmappedFreq.get(gs) || 0) + 1);
      } else resolved++;
    }
  });
}
const nonDamage = total - damage;
const coverage = nonDamage > 0 ? (100 * resolved) / nonDamage : 0;

// ── Write artifact ──────────────────────────────────────────────────────────
const sortedNames = [...nameToAbz.keys()].sort();
const mapObject = {};
for (const n of sortedNames) mapObject[n] = nameToAbz.get(n);

const out = {
  version: "1.0.0",
  built_at: new Date().toISOString(),
  description:
    "OGSL sign-NAME → eBL ABZ code, for converting ccpo (Oracc CDL) gdl_sign graphemes into eBL all-signs format. eBL/Borger numbering (A=ABZ579), NOT OGSL ABZL.",
  source:
    "Layer 1: invert ~/.cache/cuneiform-mcp/abz-glyph-map.json. Layer 2: OGSL labasi-signs.json. Layer 3: eBL /api/signs/{NAME} lists[].number (ABZ), cached back into abz-glyph-map.json.",
  build_stats: {
    total_names: sortedNames.length,
    layer1_names: layer1,
    layer2_added: layer2,
    gap_filled: gapFilled,
    gap_missed: gapMissed,
    gap_failed: gapFailed,
    collapses: collapses.length,
    ccpo_total_graphemes: total,
    ccpo_damage_X: damage,
    ccpo_non_damage: nonDamage,
    ccpo_resolved: resolved,
    ccpo_unmapped_non_damage: unmapped,
    ccpo_non_damage_coverage_pct: parseFloat(coverage.toFixed(2)),
  },
  residual_unmapped: Object.fromEntries(
    [...unmappedFreq.entries()].sort((a, b) => b[1] - a[1]),
  ),
  many_names_one_abz_collapses: collapses.slice(0, 50),
  map: mapObject,
};

if (!existsSync(join(REPO_DIR, "data"))) mkdirSync(join(REPO_DIR, "data"), { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));

console.log("");
console.log("══════════════════════════════════════════════════════════");
console.log(`ccpo→ABZ map built: ${sortedNames.length} names`);
console.log(`  ccpo total graphemes:     ${total}`);
console.log(`  damage (X):               ${damage} (${(100 * damage / total).toFixed(1)}%)`);
console.log(`  non-damage:               ${nonDamage}`);
console.log(`  resolved:                 ${resolved}`);
console.log(`  unmapped (non-damage):    ${unmapped}`);
console.log(`  NON-DAMAGE COVERAGE:      ${coverage.toFixed(2)}%`);
console.log(`  many-names→one-ABZ:       ${collapses.length} (logged for review)`);
console.log(`Wrote ${OUT_PATH}`);
