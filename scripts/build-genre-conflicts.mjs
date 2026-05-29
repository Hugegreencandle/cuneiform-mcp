#!/usr/bin/env node
// build-genre-conflicts.mjs — Genre-Conflict Sentinel worklist (v0.73).
//
// Renders surfaceGenreConflicts() to a dated Markdown review doc, classified by
// shared-window rarity. NOT labels, NOT a v1.0 G2 source (corroboration isn't
// model-independent). Run: node scripts/build-genre-conflicts.mjs [outfile] [stamp]

import { surfaceGenreConflicts } from "../dist/genreConflicts.js";
import { writeFileSync } from "node:fs";

const STAMP = process.argv[3] || "2026-05-29";
const OUT = process.argv[2] || `docs/genre-conflicts-${STAMP}.md`;

const r = surfaceGenreConflicts();
const s = r.by_signal;
const L = [];
L.push(`# Genre-Conflict Sentinel worklist — ${STAMP}`);
L.push("");
L.push(
  "**REVIEW-ONLY — observational, not labels.** Each row is a tablet whose `identify_composition` family (conf > 0.95) disagrees with its eBL editorial genre-family, with the shared length-20 sign-trigram window linking it to a composition exemplar. Rows are CLASSIFIED by window rarity — only the non-formulaic rows are worth reading.",
);
L.push("");
L.push("> **Honest caveat.** The window is 20 sign-*trigrams* (it can span breaks) — NOT 20 contiguous verbatim signs. At the default the corroboration removes ~0 cross-family hits, because `identify_composition` is itself chunk-weighted on these exemplars — so a shared window is forced by construction and the corroboration is **not** an independent check. The information is in the window's **rarity**: `formulaic` rows share only a pan-corpus boilerplate hub window (weak); `embedded_quotation_candidate` rows share a rare passage that is *localized* in an otherwise-on-genre tablet (the real phenomenon); `likely_misassignment` rows share a rare passage that *dominates* the tablet (the model is probably just wrong). **Nothing here feeds the v1.0 G2 gate** (that would be circular).");
L.push("");
L.push(
  `- Scanned **${r.stats.assignments_scanned}** assignments · **${r.stats.conf_above_threshold}** above conf ${r.params.min_confidence} · **${r.stats.cross_family}** cross-family · **${r.stats.exemplars_excluded}** self-exemplars skipped`,
);
L.push(
  `- Signal: **${s.embedded_quotation_candidate}** embedded-quotation candidate(s) · **${s.likely_misassignment}** likely-misassignment · **${s.formulaic}** formulaic (boilerplate)`,
);
L.push("");
L.push("## By family-pair");
L.push("");
L.push("| family-pair | count |");
L.push("|---|---|");
for (const [k, n] of Object.entries(r.by_family_pair).sort((a, b) => b[1] - a[1])) L.push(`| ${k} | ${n} |`);
L.push("");

for (const sig of ["embedded_quotation_candidate", "likely_misassignment", "formulaic"]) {
  const rows = r.conflicts.filter((c) => c.signal === sig);
  if (rows.length === 0) continue;
  L.push(`## ${sig} (${rows.length})`);
  L.push("");
  L.push("| tablet | model composition | conflict | rarest window host-count | shared / total (fraction) | matched exemplar | conf | eBL genre |");
  L.push("|---|---|---|---|---|---|---|---|");
  // cap formulaic to keep the doc readable; the informative tiers list in full
  const shown = sig === "formulaic" ? rows.slice(0, 20) : rows;
  for (const c of shown) {
    L.push(
      `| \`${c.tablet_id}\` | ${c.composition_id} | ${c.composition_family}-in-${c.ebl_family} | ${c.rarest_window_host_count} | ${c.shared_window_count}/${c.tablet_window_count} (${c.overlap_fraction}) | \`${c.matched_exemplar}\` | ${c.confidence} | ${c.ebl_genre} |`,
    );
  }
  if (sig === "formulaic" && rows.length > 20) L.push(`| … +${rows.length - 20} more formulaic (boilerplate) | | | | | | | |`);
  L.push("");
}

if (r.warnings.length) {
  L.push("## Warnings");
  L.push("");
  for (const w of r.warnings) L.push(`- ${w}`);
  L.push("");
}

writeFileSync(OUT, L.join("\n") + "\n");
console.log(
  `Wrote ${OUT} — ${r.stats.corroborated} hits (${s.embedded_quotation_candidate} embedded-candidate, ${s.likely_misassignment} misassignment, ${s.formulaic} formulaic)`,
);
