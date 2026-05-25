#!/usr/bin/env node
// Round-27 calibration audit: find_sign_glyph (v0.42.0).
//
// Tests both with and without the glyph map cache populated.

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { findSignGlyph, _resetForTests } from "../dist/signGlyph.js";

let pass = 0;
let fail = 0;
function report(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ PASS — ${name}${detail ? ` (${detail})` : ""}`);
  } else {
    fail++;
    console.log(`  ❌ FAIL — ${name}${detail ? ` (${detail})` : ""}`);
  }
}

console.log("Round-27 audit: find_sign_glyph (v0.42.0)\n");

const cacheDir = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const cachePath = join(cacheDir, "abz-glyph-map.json");
if (!existsSync(cacheDir)) mkdirSync(cacheDir, { recursive: true });

// Back up real cache if present, write a synthetic one for testing.
let backedUp = null;
if (existsSync(cachePath)) {
  backedUp = readFileSync(cachePath, "utf-8");
  unlinkSync(cachePath);
}

// ─── Phase 1: WITHOUT cache (graceful degradation) ─────────────────────────
console.log("PHASE 1: cache missing — graceful degradation\n");
_resetForTests();
const r1 = findSignGlyph({ signs: "ABZ480 ABZ075 X ABZ319" });
report(
  "T1: returns 4 token entries",
  r1.tokens.length === 4,
);
report(
  "T1: warning emitted about missing cache",
  r1.warnings.length > 0,
);
report(
  "T1: cache_loaded === false",
  r1.glyph_map_stats.cache_loaded === false,
);
report(
  "T1: ABZ tokens still have abz_code populated (parser independent of cache)",
  r1.tokens[0].abz_code === "ABZ480" && r1.tokens[1].abz_code === "ABZ075",
);
report(
  "T1: damage token correctly classified",
  r1.tokens[2].is_damage === true && r1.tokens[2].abz_code === null,
);
report(
  "T1: rendered_string contains bracketed tokens for unresolved",
  r1.rendered_glyph_string.includes("[ABZ480]") || r1.rendered_glyph_string.includes("[ABZ"),
);

// ─── Phase 2: WITH synthetic cache ─────────────────────────────────────────
console.log("\nPHASE 2: synthetic cache — verify lookups\n");
const syntheticCache = {
  version: "1.0.0-synthetic",
  built_at: "2026-05-25T00:00:00Z",
  source: "synthetic-audit",
  entries: {
    "ABZ001": { sign_name: "AŠ", codepoints: [73784], glyph: String.fromCodePoint(73784) }, // 𒀸
    "ABZ319": { sign_name: "DINGIR", codepoints: [73843], glyph: String.fromCodePoint(73843) },
    "ABZ480": { sign_name: "DIŠ", codepoints: [73970], glyph: String.fromCodePoint(73970) },
  },
};
writeFileSync(cachePath, JSON.stringify(syntheticCache, null, 2));
_resetForTests();

const r2 = findSignGlyph({ signs: "ABZ480 ABZ319 ABZ001 X ABZ999" });
report(
  "T2: cache_loaded === true",
  r2.glyph_map_stats.cache_loaded === true,
);
report(
  "T2: cache_version matches",
  r2.glyph_map_stats.cache_version === "1.0.0-synthetic",
);
report(
  "T2: 3 of 5 tokens resolved (ABZ480, ABZ319, ABZ001)",
  r2.query.n_resolved === 3,
  `got n_resolved=${r2.query.n_resolved}`,
);
report(
  "T2: 1 damage token",
  r2.query.n_damage === 1,
);
report(
  "T2: 1 unresolved (ABZ999 not in cache)",
  r2.query.n_unresolved === 1,
);
report(
  "T2: ABZ480 resolves to glyph",
  r2.tokens[0].glyph === String.fromCodePoint(73970),
);
report(
  "T2: rendered string contains resolved glyphs",
  r2.rendered_glyph_string.includes(String.fromCodePoint(73970)),
);
report(
  "T2: unresolved ABZ999 rendered as bracketed",
  r2.rendered_glyph_string.includes("[ABZ999]"),
);

// ─── Phase 3: abz_codes array input path ───────────────────────────────────
console.log("\nPHASE 3: abz_codes array input\n");
const r3 = findSignGlyph({ abz_codes: ["ABZ480", "ABZ319", "ABZ001"] });
report(
  "T3: array input resolves all 3 tokens",
  r3.query.n_resolved === 3,
);
report(
  "T3: rendered string is space-joined glyphs",
  r3.rendered_glyph_string.split(" ").length === 3,
);

// ─── Phase 4: damage glyph customization ───────────────────────────────────
console.log("\nPHASE 4: damage placeholder customization\n");
const r4 = findSignGlyph({ signs: "X ABZ480 X", damage_glyph: "?" });
report(
  "T4: custom damage_glyph honored",
  r4.rendered_glyph_string.startsWith("?"),
  `rendered: ${r4.rendered_glyph_string}`,
);
const r5 = findSignGlyph({ signs: "X X ABZ480", include_damage_placeholder: false });
report(
  "T5: include_damage_placeholder=false omits damage from render",
  !r5.rendered_glyph_string.includes("·") && !r5.rendered_glyph_string.includes(" ·"),
);

// ─── Phase 5: ABZ-code normalization (3-digit padding) ─────────────────────
console.log("\nPHASE 5: ABZ code normalization\n");
const r6 = findSignGlyph({ signs: "ABZ1 ABZ001 ABZ01" });
report(
  "T6: ABZ1, ABZ001, ABZ01 all normalize to ABZ001 and resolve",
  r6.query.n_resolved === 3,
  `n_resolved=${r6.query.n_resolved}`,
);

// ─── Phase 6: empty / no-input ─────────────────────────────────────────────
console.log("\nPHASE 6: empty inputs\n");
const r7 = findSignGlyph({});
report(
  "T7: no input → empty tokens + warning",
  r7.tokens.length === 0 && r7.warnings.length > 0,
);

// Teardown: restore original cache if any.
unlinkSync(cachePath);
if (backedUp) writeFileSync(cachePath, backedUp);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-27 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
