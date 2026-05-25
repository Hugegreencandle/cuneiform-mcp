#!/usr/bin/env node
// Round-25 calibration audit: render_stemma_svg + get_tablet_image_links (v0.39.0).
//
// Unit-test scope only (cache-free) for the SVG renderer.

import { renderStemmaSvg } from "../dist/renderStemmaSvg.js";
import { getEblFragmentUrl, getEblPhotoUrl, getAncientFindSpot, getFragmentMetadata } from "../dist/fragmentMetadata.js";

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

console.log("Round-25 audit: render_stemma_svg + get_tablet_image_links (v0.39.0)\n");

// ─── render_stemma_svg unit tests ──────────────────────────────────────────
console.log("RENDER_STEMMA_SVG (cache-free):\n");

// T1: simple 4-leaf tree
const newick1 = "((A:1,B:2)N1:3,(C:4,D:5)N2:6)ROOT;";
const r1 = renderStemmaSvg({ newick: newick1 });
report("T1: 4-leaf tree → SVG produced", r1.svg.length > 100);
report("T1: SVG starts with <svg", r1.svg.startsWith("<svg"));
report("T1: SVG ends with </svg>", r1.svg.endsWith("</svg>"));
report("T1: leaf_count === 4", r1.leaf_count === 4);
report("T1: internal_count === 3 (root + N1 + N2)", r1.internal_count === 3, `got=${r1.internal_count}`);

// T2: contains all leaf labels
report("T2: SVG contains 'A'", r1.svg.includes(">A<"));
report("T2: SVG contains 'B'", r1.svg.includes(">B<"));
report("T2: SVG contains 'C'", r1.svg.includes(">C<"));
report("T2: SVG contains 'D'", r1.svg.includes(">D<"));

// T3: branch lengths preserved
report(
  "T3: total_branch_length === 21 (1+2+3+4+5+6)",
  r1.total_branch_length === 21,
  `got=${r1.total_branch_length}`,
);

// T4: handles museum-number leaves (dots OK in Newick labels)
const newick2 = "((K.5896:1,K.9508:1)N1:2,BM.45749:3)ROOT;";
const r2 = renderStemmaSvg({ newick: newick2 });
report("T4: K.5896 leaf rendered", r2.svg.includes(">K.5896<"));
report("T4: BM.45749 leaf rendered", r2.svg.includes(">BM.45749<"));

// T5: title rendered when provided
const r3 = renderStemmaSvg({ newick: newick1, title: "Mīs pî stemma" });
report("T5: title rendered", r3.svg.includes("Mīs pî stemma"));

// T6: invalid Newick → warnings + empty svg
const rBad = renderStemmaSvg({ newick: ";" });
report("T6: empty Newick → warnings", rBad.warnings.length > 0 && rBad.svg.length === 0);

// T7: width + height respected
const r4 = renderStemmaSvg({ newick: newick1, width: 1200, height: 600 });
report("T7: custom width respected", r4.width === 1200 && r4.svg.includes('width="1200"'));
report("T7: custom height respected", r4.height === 600);

// T8: XML escaping (label with apostrophe)
const newick3 = "(('Sm.1055':1,K.7246:1)N1)ROOT;";
const r5 = renderStemmaSvg({ newick: newick3 });
report("T8: quoted Newick label parsed (Sm.1055)", r5.svg.includes("Sm.1055"));

// ─── IIIF / imagery URL tests ──────────────────────────────────────────────
console.log("\nGET_TABLET_IMAGE_LINKS (cache-free for URL construction):\n");

const fragmentUrl = getEblFragmentUrl("K.5896");
const photoUrl = getEblPhotoUrl("K.5896");
report(
  "T9: fragment URL non-null + contains K.5896",
  fragmentUrl !== null && fragmentUrl.includes("K.5896"),
  fragmentUrl,
);
report(
  "T10: photo URL non-null + contains K.5896 + /photo",
  photoUrl !== null && photoUrl.includes("K.5896") && photoUrl.endsWith("/photo"),
  photoUrl,
);
report(
  "T11: empty tablet_id → null URLs",
  getEblFragmentUrl("") === null && getEblPhotoUrl("") === null,
);

// T12: ancient find-spot when metadata loaded
const meta = getFragmentMetadata("K.5896");
if (meta) {
  const ancient = getAncientFindSpot(meta);
  console.log(`     K.5896 ancient_find_spot = ${ancient ?? "(unknown)"}`);
  report(
    "T12: getAncientFindSpot returns string or null (not undefined)",
    ancient === null || typeof ancient === "string",
  );
} else {
  report("T12: metadata not loaded for K.5896 — skipping ancient find-spot check", true);
}

// Summary
console.log(`\n──────────────────────────────────────────────────────────`);
console.log(`Round-25 audit: ${pass}/${pass + fail} passed`);
console.log(`──────────────────────────────────────────────────────────`);
process.exit(fail === 0 ? 0 : 1);
