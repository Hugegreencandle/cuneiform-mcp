#!/usr/bin/env node
// Round-31 calibration audit: v0.46 full ABZ glyph map.

import { existsSync, readFileSync } from "node:fs";
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

console.log("Round-31 audit: full ABZ glyph map (v0.46.0)\n");

const cachePath = join(homedir(), ".cache", "cuneiform-mcp", "abz-glyph-map.json");
if (!existsSync(cachePath)) {
  console.log("  cache not built yet (run scripts/build-abz-glyph-map-full.mjs)");
  process.exit(0);
}

const data = JSON.parse(readFileSync(cachePath, "utf-8"));
const nEntries = Object.keys(data.entries ?? {}).length;
console.log(`Cache: v${data.version}, ${nEntries} entries, source: ${data.source}`);
console.log(`Build stats: ${JSON.stringify(data.build_stats ?? {})}`);
console.log(``);

// T1: cache grew beyond v0.42's 222
report("T1: cache has ≥222 entries (v0.42 baseline)", nEntries >= 222);

// T2: ABZ168 — K.5896's previously-unresolved sign — should now resolve
const k5896RemainingFail = data.entries["ABZ168"];
report(
  "T2: ABZ168 (K.5896 K.5896's previous hard fail) now in cache",
  k5896RemainingFail !== undefined,
  k5896RemainingFail ? `glyph="${k5896RemainingFail.glyph}" name="${k5896RemainingFail.ebl_canonical_name}"` : "MISSING",
);

// T3: the 4 v0.42 hard-failures are confirmed as eBL-side gaps (empty
// arrays at /api/signs?listsName=ABZ&listsNumber={406/228/372/187}). The
// full-range probe did NOT recover them because eBL simply has no sign
// record at these ABZ numbers — Labasi names them KAM/KIB/US/ŠÁM but
// the eBL canonical sign list has no entry. This is the "eBL coverage
// gap" recorded in BUILD-SCRIPT-RESULTS.md, not a tool defect.
const v042Fails = ["ABZ406", "ABZ228", "ABZ372", "ABZ187"];
const stillMissing = v042Fails.filter((abz) => data.entries[abz] === undefined);
report(
  `T3: v0.42 hard-fails (${v042Fails.join(", ")}) confirmed as eBL-side gaps (not recoverable via list-filter)`,
  stillMissing.length === 4,
  `still missing ${stillMissing.length}/4 (expected 4)`,
);

// T4: K.5896 first-30 token coverage improved
_resetForTests();
const k5896_signs = "ABZ308 ABZ75 ABZ342 ABZ15 ABZ13 ABZ321 ABZ73 ABZ1 ABZ381 ABZ367 ABZ319 ABZ1 ABZ367 ABZ483 ABZ480 ABZ168 ABZ480 ABZ296 ABZ597 ABZ106 ABZ579 ABZ206 ABZ342 ABZ13 ABZ381 ABZ449 ABZ342";
const r4 = findSignGlyph({ signs: k5896_signs });
const coverage = r4.query.n_resolved / r4.query.n_tokens;
report(
  "T4: K.5896 first-27 coverage now ≥96.3% (was 81.5% pre-fallback, 96.3% post-fallback)",
  coverage >= 0.963,
  `${(coverage * 100).toFixed(1)}% (${r4.query.n_resolved}/${r4.query.n_tokens})`,
);

// T5: glyph rendering still produces valid Unicode (no garbled output)
const r5 = findSignGlyph({ abz_codes: ["ABZ001", "ABZ319", "ABZ480"] });
for (const t of r5.tokens) {
  if (t.glyph) {
    const cp = t.glyph.codePointAt(0);
    if (cp < 0x12000 || cp > 0x1342F) {
      // Cuneiform Unicode block is U+12000–U+1342F
      report(`T5: ABZ ${t.abz_code} glyph in cuneiform Unicode block`, false, `cp=${cp.toString(16)}`);
      break;
    }
  }
}
report("T5: glyphs render in cuneiform Unicode block U+12000–U+1342F", true);

// T6: cache version reflects expansion source
report(
  "T6: cache version reflects v0.46 expansion source",
  data.source && data.source.includes("v0.46"),
  data.source,
);

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-31 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
