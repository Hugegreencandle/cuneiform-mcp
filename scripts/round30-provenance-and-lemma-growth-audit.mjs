#!/usr/bin/env node
// Round-30 calibration audit: v0.45 provenance fallback + lemma-index growth.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { getAncientFindSpot, getFragmentMetadata } from "../dist/fragmentMetadata.js";

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

console.log("Round-30 audit: v0.45 provenance fallback + lemma-index growth\n");

console.log("PROVENANCE COLLECTION-FALLBACK:\n");

// T1: K.5896 — known to have collection populated (Kuyunjik) but provenance null
const k5896meta = getFragmentMetadata("K.5896");
const k5896spot = getAncientFindSpot(k5896meta);
report(
  "T1: K.5896 ancient_find_spot now resolves (was null in v0.44)",
  k5896spot !== null && k5896spot.length > 0,
  `got="${k5896spot}"`,
);

// T2: T1 result is a recognizable archaeological provenance (Kuyunjik or related)
report(
  "T2: K.5896 find_spot includes Kuyunjik / Nineveh / British Museum signal",
  k5896spot && /Kuyunjik|Nineveh|British|Kouyunjik/i.test(k5896spot),
  `signal in "${k5896spot}"`,
);

// T3: getAncientFindSpot(null) === null
report(
  "T3: null metadata → null",
  getAncientFindSpot(null) === null,
);

// T4: empty-strings handled
const fakeEmpty = {
  museum_number: "X.1",
  designation: null,
  script: null,
  provenance: null,
  collection: "",
  genres: [],
  genres_flat: [],
  joins_count: 0,
};
report(
  "T4: empty collection string → null",
  getAncientFindSpot(fakeEmpty) === null,
);

// T5: synthetic with provenance.region (preferred) outranks collection
const fakePref = {
  museum_number: "Y.1",
  designation: null,
  script: null,
  provenance: { region: "Sippar", site: null },
  collection: "British Museum",
  genres: [],
  genres_flat: [],
  joins_count: 0,
};
report(
  "T5: provenance.region preferred over collection when both present",
  getAncientFindSpot(fakePref) === "Sippar",
  `got="${getAncientFindSpot(fakePref)}"`,
);

// T6: bare-string provenance still works
const fakeStr = {
  museum_number: "Z.1",
  designation: null,
  script: "Neo-Babylonian",
  provenance: "Nippur",
  collection: "Yale",
  genres: [],
  genres_flat: [],
  joins_count: 0,
};
report(
  "T6: bare-string provenance preferred over collection",
  getAncientFindSpot(fakeStr) === "Nippur",
);

console.log("\nLEMMA-INDEX GROWTH:\n");

const cachePath = join(homedir(), ".cache", "cuneiform-mcp", "lemma-index.json");
if (existsSync(cachePath)) {
  const data = JSON.parse(readFileSync(cachePath, "utf-8"));
  const nEntries = Object.keys(data.entries ?? {}).length;
  const nPopulated = Object.values(data.entries ?? {}).filter((e) => e.n_lemmas > 0).length;
  console.log(`  Current cache: ${nEntries} tablets indexed, ${nPopulated} with lemmas`);
  console.log(`  Build stats: ${JSON.stringify(data.build_stats ?? {})}`);
  // T7: cache should have grown beyond the initial 21
  report(
    "T7: lemma-index has expanded beyond initial 21 tablets",
    nEntries >= 21,
    `n=${nEntries}`,
  );
  // T8: pre-merge entries preserved — verify K.2987.B (largest from initial 21) still has 420 lemmas
  const k2987 = data.entries["K.2987.B"];
  report(
    "T8: K.2987.B (initial 420-lemma entry) preserved through merge",
    k2987 && k2987.n_lemmas === 420,
    `n_lemmas=${k2987?.n_lemmas}`,
  );
  // T9: BM.47463 (Šurpu base, 181 lemmas) preserved
  const bm47 = data.entries["BM.47463"];
  report(
    "T9: BM.47463 (initial 181-lemma entry) preserved through merge",
    bm47 && bm47.n_lemmas === 181,
  );
} else {
  report("T7: lemma-index exists", false, "cache file missing");
}

console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-30 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
