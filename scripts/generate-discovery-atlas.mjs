#!/usr/bin/env node
// Generate docs/DISCOVERY-ATLAS-v0.26.md — concrete corpus discoveries dumped
// from each v0.20+ corpus-wide tool. Publishable as methods-paper appendix data.

import { writeFileSync } from "node:fs";
import { findFormulaicPassages } from "../dist/formulaicPassages.js";
import { findIncipits } from "../dist/findIncipits.js";
import { buildCitationGraph } from "../dist/citationGraph.js";
import { buildScribalSchoolGraph } from "../dist/scribalSchoolGraph.js";
import { findAnomalousTablets } from "../dist/anomalySurface.js";
import { getFragmentMetadata, getPeriod, getPrimaryGenre } from "../dist/fragmentMetadata.js";

const lines = [];
const w = (s) => lines.push(s);

w(`# cuneiform-mcp — Discovery Atlas (v0.26.0 snapshot)`);
w(``);
w(`Auto-generated corpus-wide discovery dump from the v0.20+ tools. Methods-paper appendix material. Run \`node scripts/generate-discovery-atlas.mjs\` to regenerate against current cache state. Generated ${new Date().toISOString().slice(0, 10)}.`);
w(``);

// ─── §1 Top formulaic passages ────────────────────────────────────────────

w(`## §1 — Top 30 formulaic passages (length-20 chunks, ranked by host_genres_spanned × log(host_count))`);
w(``);
const fp = findFormulaicPassages({ minHosts: 20, topK: 30 });
w(`Index metadata coverage: ${fp.index_stats.metadata_coverage_pct}%. Candidate pool: ${fp.index_stats.candidates_above_threshold}.`);
w(``);
w(`| # | host_count | genres | novelty | first signs (truncated) |`);
w(`|---|---|---|---|---|`);
for (const [i, p] of fp.passages.entries()) {
  const signs = p.chunk_signs.length > 70 ? p.chunk_signs.slice(0, 70) + "…" : p.chunk_signs;
  w(`| ${i + 1} | ${p.host_count} | ${p.host_genres_spanned} | ${p.novelty_score.toFixed(2)} | \`${signs}\` |`);
}
w(``);

// ─── §2 Top incipits ──────────────────────────────────────────────────────

w(`## §2 — Top 30 incipits (length-10 chunks)`);
w(``);
const inc = findIncipits({ minHosts: 50, topK: 30 });
w(`Index: ${inc.index_stats.total_chunks_in_index} chunks. Candidates: ${inc.index_stats.candidates_above_threshold}. Numerical-only filtered: ${inc.index_stats.numerical_only_filtered}.`);
w(``);
w(`| # | host_count | genres | first signs |`);
w(`|---|---|---|---|`);
for (const [i, p] of inc.incipits.entries()) {
  const signs = p.chunk_signs.length > 80 ? p.chunk_signs.slice(0, 80) + "…" : p.chunk_signs;
  w(`| ${i + 1} | ${p.host_count} | ${p.host_genres_spanned} | \`${signs}\` |`);
}
w(``);

// ─── §3 Citation graph edges ──────────────────────────────────────────────

w(`## §3 — Top citation graph edges (commentary → base text)`);
w(``);
const cg = buildCitationGraph({ minSharedChunks: 1, topKEdges: 20 });
w(`Total edges (this scan): ${cg.edges.length}. Metadata coverage: ${cg.index_stats.metadata_coverage_pct}%.`);
w(``);
w(`| # | commentary | → | base | weight | shared chunks |`);
w(`|---|---|---|---|---|---|`);
for (const [i, e] of cg.edges.entries()) {
  const cb = (e.cited_by_genre || "?").split(" → ").slice(-1)[0];
  const c = (e.cites_genre || "?").split(" → ").slice(-1)[0];
  w(`| ${i + 1} | ${e.cited_by} [${cb}] | → | ${e.cites} [${c}] | ${e.edge_weight} | ${e.shared_chunks_count ?? e.shared_chunks?.length ?? "?"} |`);
}
w(``);

// ─── §4 Scribal schools ───────────────────────────────────────────────────

w(`## §4 — Top scribal schools`);
w(``);
try {
  const ss = buildScribalSchoolGraph({ topKSchools: 15 });
  w(`Tablets scanned: ${ss.index_stats.tablets_scanned_for_edges}. Components above min_size: ${ss.index_stats.components_above_size_threshold}. Elapsed ${ss.index_stats.elapsed_seconds}s.`);
  w(``);
  w(`| # | anchor | members | cohesion | provenance | top period | top genre |`);
  w(`|---|---|---|---|---|---|---|`);
  for (const [i, s] of ss.schools.entries()) {
    const tp = s.period_distribution[0]?.label ?? "—";
    const tg = s.genre_distribution[0]?.label ?? "—";
    w(`| ${i + 1} | ${s.anchor_tablet} | ${s.members.length} | ${s.internal_cohesion} | ${s.shared_provenance ?? "?"} | ${tp} | ${tg} |`);
  }
  w(``);
} catch (e) {
  w(`(scribal-school graph skipped — ${e.message})`);
  w(``);
}

// ─── §5 Final bi-orphan list ──────────────────────────────────────────────

w(`## §5 — Bi-orphan surface (methods paper §3.6 final residue)`);
w(``);
try {
  const ao = findAnomalousTablets({ kind: "bi_orphan", topK: 30 });
  w(`Bi-orphans returned: ${ao.tablets.length}`);
  w(``);
  if (ao.tablets.length > 0) {
    w(`| # | tablet | sign_count | reasons (truncated) |`);
    w(`|---|---|---|---|`);
    for (const [i, t] of ao.tablets.entries()) {
      const meta = getFragmentMetadata(t.id);
      const reasons = (t.anomaly_reasons ?? []).slice(0, 2).join("; ").slice(0, 100);
      w(`| ${i + 1} | ${t.id} | ${t.sign_count} | ${reasons} |`);
    }
    w(``);
  }
} catch (e) {
  w(`(bi-orphan surface query skipped — ${e.message})`);
  w(``);
}

// ─── §6 Stats footer ──────────────────────────────────────────────────────

w(`## §6 — Build state at generation time`);
w(``);
w(`- v0.20 chunk-hash index (length-20): ~96,654 non-singleton entries`);
w(`- v0.21 incipits index (length-10): ~214,896 non-singleton entries`);
w(`- Fragment-metadata cache: ~36,317 entries`);
w(`- sign2vec corpus-wide: 635 signs (WINDOW=5, MIN_OCC=20)`);
w(`- sign2vec ensemble: 6 configs (4.5 MB)`);
w(`- sign2vec per-period: NA 435 / NB 452 signs (387 common)`);
w(`- Tool count: 74`);
w(``);
w(`Methods paper §3.1–§3.14 documents the methodology behind these results.`);
w(``);

writeFileSync("docs/DISCOVERY-ATLAS-v0.26.md", lines.join("\n"));
console.log(`Generated docs/DISCOVERY-ATLAS-v0.26.md (${lines.length} lines)`);
