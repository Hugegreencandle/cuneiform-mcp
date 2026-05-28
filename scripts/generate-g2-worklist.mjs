#!/usr/bin/env node
// generate-g2-worklist.mjs — A2 adjudication worklist for the v1.0 G2 gate.
//
// Reads the v0.54 composition-assignment cache + the validation-resolutions
// store and emits a tiered, integrity-flagged worklist of POSITIVE-pair
// candidates for human (Assyriologist) adjudication. It does NOT mutate the
// store — confirmed pairs are hand-fed to record_validation_resolution.
//
// Why tiers: identify_composition confidence alone is not ground truth (the
// v0.51 held-out eval misclassified BM.77056↔K.5896; medical "Teeth" tablets
// get assigned Mīs pî at 0.99 on sign-overlap). The candidate's eBL editorial
// genre is an INDEPENDENT signal, so we cross-check model-composition against
// the genre leaf:
//   Tier 1 (CONFIRM)  — genre leaf names the same composition → strongest.
//   Tier 2 (REVIEW)   — āšipūtu/ritual genre but different/unspecified leaf →
//                       may be a sibling of the genre-named composition, not
//                       the anchor's; re-target before recording.
//   Tier 3 (REJECT?)  — medical/divination/lexical genre → likely a model
//                       false positive; listed so rejection is deliberate.
//
// Usage: node scripts/generate-g2-worklist.mjs [outfile]

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache/cuneiform-mcp");
const STAMP = process.argv[3] || "2026-05-29"; // pass-in to keep deterministic
const OUT = process.argv[2] || `docs/g2-adjudication-worklist-${STAMP}.md`;

const A = JSON.parse(readFileSync(join(CACHE, "composition-assignments.json"))).assignments;
const store = JSON.parse(readFileSync(join(CACHE, "validation-resolutions.json")));
const pos = new Set();
for (const r of store.resolutions.filter((r) => r.verdict === "positive")) {
  pos.add(r.tablet_a);
  pos.add(r.tablet_b);
}
const nPos = store.stats?.n_positive ?? 0;
const target = store.stats?.v1_target_positives ?? 100;

// Per-composition confirmed anchor = highest model-conf store-positive of that comp.
const anchors = {};
for (const t of pos) {
  const a = A[t];
  if (!a) continue;
  const c = a.top_composition_id;
  if (!anchors[c] || a.confidence > anchors[c].conf) anchors[c] = { tablet: t, conf: a.confidence };
}

// Genre classifiers. PLAUS = ritual/exorcist corpus; FLAG = clearly-other genre.
const PLAUS = /magic|ritual|incant|exorc|namburb|m[iī]s ?p[iî]|udug|šu.?ila|prayer|hymn|literary|religio|apotropaic|b[iī]t/i;
const FLAG = /medic|divinat|omen|astrolog|astronom|lexical|mathemat|administ|royal inscr|letter|legal|account/i;
// Per-composition leaf matchers (does the eBL genre name THIS composition?).
const LEAF = {
  mis_pi: /m[iī]s ?p[iî]|mouth.?(wash|open)/i,
  udug_hul: /udug.?[hḫ]ul|utukk/i,
  surpu: /šurpu|surpu/i,
  bit_sala_me: /b[iī]t sal[aā]|sal[aā].?m[eê]/i,
  enuma_anu_enlil: /en[uū]ma anu|EAE/i,
};

const NAMES = {
  mis_pi: "Mīs pî", udug_hul: "Udug-ḫul", surpu: "Šurpu",
  bit_sala_me: "Bīt salāʾ mê", enuma_anu_enlil: "Enūma Anu Enlil",
};
const ebl = (t) => `https://www.ebl.lmu.de/fragmentarium/${t}`;

// Only composition with a *solid* anchor (model-conf ≥ 0.7) AND ≥0.95 candidates.
const TARGET_COMPS = Object.keys(anchors).filter((c) => anchors[c].conf >= 0.7 && LEAF[c]);

function candidates(comp) {
  const rows = [];
  for (const [t, a] of Object.entries(A)) {
    if (a.top_composition_id !== comp || a.is_in_exemplar_list || pos.has(t) || a.confidence < 0.95) continue;
    const g = a.primary_genre || "";
    let tier;
    if (LEAF[comp].test(g)) tier = 1;
    else if (FLAG.test(g)) tier = 3;
    else if (PLAUS.test(g)) tier = 2;
    else tier = 2; // untagged/generic → review
    rows.push({ t, conf: a.confidence, g, tier, period: a.period || "" });
  }
  rows.sort((x, y) => x.tier - y.tier || y.conf - x.conf);
  return rows;
}

const L = [];
L.push(`# G2 adjudication worklist — ${STAMP}`);
L.push("");
L.push("**REVIEW-ONLY.** Nothing here is written to `validation-resolutions.json`. Confirm each Tier-1 pair against eBL, then hand-invoke `record_validation_resolution` for the ones you accept.");
L.push("");
L.push(`- **G2 status:** ${nPos} / ${target} validated positives.`);
L.push(`- **Candidate source:** v0.54 composition-assignment cache (identify_composition over chunk-host tablets). NOT ground truth — see integrity note.`);
L.push("");
L.push("## Integrity note — why this is a worklist, not auto-labels");
L.push("");
L.push("`identify_composition` confidence is the *model's own* output. Recording it as a positive into the gate store that trains/validates that model would be circular self-labeling. It is also wrong often enough to matter: medical \"Teeth\" tablets (e.g. K.2290, K.2419) are assigned Mīs pî at 0.99 on sign-overlap alone. So we cross-check each candidate's model-composition against its **independent eBL editorial genre** and tier accordingly. Only operator-confirmed pairs get recorded.");
L.push("");

let tier1Total = 0;
for (const comp of TARGET_COMPS) {
  const rows = candidates(comp);
  const t1 = rows.filter((r) => r.tier === 1);
  const t2 = rows.filter((r) => r.tier === 2);
  const t3 = rows.filter((r) => r.tier === 3);
  tier1Total += t1.length;
  const anchor = anchors[comp].tablet;
  L.push(`## ${NAMES[comp] || comp}  (anchor: \`${anchor}\`, confirmed positive)`);
  L.push("");
  L.push(`Candidates ≥0.95: **${rows.length}** — Tier 1 confirm: **${t1.length}**, Tier 2 review: ${t2.length}, Tier 3 likely-reject: ${t3.length}.`);
  L.push("");
  if (t1.length) {
    L.push(`### Tier 1 — model + eBL genre both name ${NAMES[comp] || comp} (propose as positive sibling of \`${anchor}\`)`);
    L.push("");
    L.push("| # | proposed positive pair | model conf | eBL genre | period | eBL |");
    L.push("|---|---|---|---|---|---|");
    t1.forEach((r, i) =>
      L.push(`| ${i + 1} | \`${r.t} ↔ ${anchor}\` | ${r.conf.toFixed(3)} | ${r.g} | ${r.period} | [link](${ebl(r.t)}) |`),
    );
    L.push("");
  }
  if (t2.length) {
    L.push(`### Tier 2 — ritual/āšipūtu genre but a different or unspecified leaf (REVIEW: may be a sibling of its genre's composition, not ${NAMES[comp] || comp})`);
    L.push("");
    L.push("| candidate | model conf | eBL genre | eBL |");
    L.push("|---|---|---|---|");
    t2.slice(0, 25).forEach((r) => L.push(`| \`${r.t}\` | ${r.conf.toFixed(3)} | ${r.g} | [link](${ebl(r.t)}) |`));
    if (t2.length > 25) L.push(`| … +${t2.length - 25} more | | | |`);
    L.push("");
  }
  if (t3.length) {
    L.push(`### Tier 3 — genre conflicts with ${NAMES[comp] || comp} (likely model false-positive; confirm rejection)`);
    L.push("");
    t3.slice(0, 12).forEach((r) => L.push(`- \`${r.t}\` (${r.conf.toFixed(3)}) — ${r.g}`));
    if (t3.length > 12) L.push(`- … +${t3.length - 12} more`);
    L.push("");
  }
}

L.push("## How to record a confirmed pair");
L.push("");
L.push("For each Tier-1 pair you confirm against eBL, invoke `record_validation_resolution` with:");
L.push("```");
L.push("{ tablet_a: \"<candidate>\", tablet_b: \"<anchor>\", verdict: \"positive\",");
L.push("  rationale: \"identify_composition <conf> + eBL genre leaf-match; operator-confirmed vs <anchor> (<composition>)\",");
L.push("  source: \"validation_queue\" }");
L.push("```");
L.push("");
L.push(`**Tier-1 genre-confirmed candidates: ${tier1Total}** (vs a ${target - nPos}-positive gap to G2). This is the honest yield: demanding an independent genre-leaf match collapses the ~300 high-conf model assignments to ${tier1Total} defensible ones — almost all Mīs pî. The model's Udug-ḫul cluster has **no** genre-leaf corroboration (broad-magic/untagged grab-bag + medical false positives), so it yields zero Tier-1.`);
L.push("");
L.push(`Confirming the ${tier1Total} Tier-1 pairs would move G2 ${nPos} → ~${nPos + tier1Total}. The rest of the gap lives in Tier-2 (untagged \`CANONICAL\` candidates) and needs a **second independent signal** — chunk-overlap with the anchor — to become confirmable. That is the external-evidence rule below.`);
L.push("");
L.push("## Next: external-evidence rule (A2 step 2)");
L.push("");
L.push("The genre-leaf-match used here is one independent signal; chunk-overlap is the other. An `auto_validate` rule should require **model-composition ≥0.95 AND (eBL genre leaf names the same composition OR chunk-overlap with a confirmed anchor ≥ threshold)**, with the threshold calibrated against the 17 known positives before it can write proposals. That rescues the untagged Tier-2 candidates (genre silent but textually overlapping a known sibling) without the circular self-labeling of trusting model confidence alone. Scoping pass to follow.");

const out = L.join("\n") + "\n";
writeFileSync(OUT, out);
console.log(`Wrote ${OUT} — Tier-1 total ${tier1Total}, comps: ${TARGET_COMPS.join(", ")}`);
