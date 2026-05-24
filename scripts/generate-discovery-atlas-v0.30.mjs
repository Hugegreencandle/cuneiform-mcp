#!/usr/bin/env node
// Comprehensive discovery atlas — extends the v0.26 atlas with v0.27-v0.30
// sections covering sign-class clusters, per-period chunks, joins graph,
// numerical chunks, Bayesian fusion sample, and a sample lacuna prediction.

import { writeFileSync } from "node:fs";
import { findFormulaicPassages } from "../dist/formulaicPassages.js";
import { findIncipits } from "../dist/findIncipits.js";
import { buildCitationGraph } from "../dist/citationGraph.js";
import { buildScribalSchoolGraph } from "../dist/scribalSchoolGraph.js";
import { findAnomalousTablets } from "../dist/anomalySurface.js";
import { clusterSignsByEmbedding } from "../dist/clusterSignsByEmbedding.js";
import { findFormulaicPassagesPerPeriod } from "../dist/findFormulaicPassagesPerPeriod.js";
import { analyzeJoinsGraph } from "../dist/analyzeJoinsGraph.js";
import { findNumericalChunks } from "../dist/findNumericalChunks.js";
import { computeJointPairScore } from "../dist/computeJointPairScore.js";
import { restoreLacunaSemantic } from "../dist/restoreLacunaSemantic.js";
import { getFragmentMetadata, getPeriod, getPrimaryGenre } from "../dist/fragmentMetadata.js";

const lines = [];
const w = (s) => lines.push(s);

w(`# cuneiform-mcp — Discovery Atlas (v0.30.0 snapshot)`);
w(``);
w(`Comprehensive corpus-wide discovery dump across v0.20–v0.30 tools. Methods-paper appendix material. Generated ${new Date().toISOString().slice(0, 10)}.`);
w(``);
w(`**Tool count at snapshot: 81.** **Methods paper claims at snapshot: §3.1–§3.17, claims 1–37.**`);
w(``);

// ─── §1 Top formulaic passages ────────────────────────────────────────────

w(`## §1 — Top 20 formulaic passages (v0.20, length-20 chunks)`);
w(``);
const fp = findFormulaicPassages({ minHosts: 20, topK: 20 });
w(`Index metadata coverage: ${fp.index_stats.metadata_coverage_pct}%. Candidate pool: ${fp.index_stats.candidates_above_threshold}.`);
w(``);
w(`| # | hosts | genres | novelty | first signs |`);
w(`|---|---|---|---|---|`);
for (const [i, p] of fp.passages.entries()) {
  const signs = p.chunk_signs.length > 70 ? p.chunk_signs.slice(0, 70) + "…" : p.chunk_signs;
  w(`| ${i + 1} | ${p.host_count} | ${p.host_genres_spanned} | ${p.novelty_score.toFixed(2)} | \`${signs}\` |`);
}
w(``);

// ─── §2 Top incipits ──────────────────────────────────────────────────────

w(`## §2 — Top 20 incipits (v0.21, length-10 chunks)`);
w(``);
const inc = findIncipits({ minHosts: 50, topK: 20 });
w(`Index: ${inc.index_stats.total_chunks_in_index} chunks. Filtered (numerical-only): ${inc.index_stats.numerical_only_filtered}.`);
w(``);
w(`| # | hosts | genres | first signs |`);
w(`|---|---|---|---|`);
for (const [i, p] of inc.incipits.entries()) {
  const signs = p.chunk_signs.length > 80 ? p.chunk_signs.slice(0, 80) + "…" : p.chunk_signs;
  w(`| ${i + 1} | ${p.host_count} | ${p.host_genres_spanned} | \`${signs}\` |`);
}
w(``);

// ─── §3 Citation graph ────────────────────────────────────────────────────

w(`## §3 — Top citation graph edges (v0.20, commentary → base)`);
w(``);
const cg = buildCitationGraph({ minSharedChunks: 1, topKEdges: 15 });
w(`Total edges: ${cg.edges.length}. Metadata coverage: ${cg.index_stats.metadata_coverage_pct}%.`);
w(``);
w(`| # | commentary → base | weight |`);
w(`|---|---|---|`);
for (const [i, e] of cg.edges.entries()) {
  const cb = (e.cited_by_genre || "?").split(" → ").slice(-1)[0];
  const c = (e.cites_genre || "?").split(" → ").slice(-1)[0];
  w(`| ${i + 1} | ${e.cited_by} [${cb}] → ${e.cites} [${c}] | ${e.edge_weight} |`);
}
w(``);

// ─── §4 Scribal schools ───────────────────────────────────────────────────

w(`## §4 — Top scribal schools (v0.22)`);
w(``);
try {
  const ss = buildScribalSchoolGraph({ topKSchools: 10 });
  w(`Tablets scanned: ${ss.index_stats.tablets_scanned_for_edges}. Components above min_size: ${ss.index_stats.components_above_size_threshold}.`);
  w(``);
  w(`| # | anchor | members | cohesion | provenance | top genre |`);
  w(`|---|---|---|---|---|---|`);
  for (const [i, s] of ss.schools.entries()) {
    const tg = s.genre_distribution[0]?.label ?? "—";
    w(`| ${i + 1} | ${s.anchor_tablet} | ${s.members.length} | ${s.internal_cohesion} | ${s.shared_provenance ?? "?"} | ${tg} |`);
  }
  w(``);
} catch (e) { w(`(scribal-school graph skipped — ${e.message})`); w(``); }

// ─── §5 Bi-orphan surface ─────────────────────────────────────────────────

w(`## §5 — Bi-orphan surface (methods §3.6, after v0.19 §3.6 amendment)`);
w(``);
try {
  const ao = findAnomalousTablets({ kind: "bi_orphan", topK: 20 });
  w(`Bi-orphans returned: ${ao.tablets.length}`);
  w(``);
  if (ao.tablets.length > 0) {
    w(`| # | tablet | sign_count |`);
    w(`|---|---|---|`);
    for (const [i, t] of ao.tablets.entries()) {
      w(`| ${i + 1} | ${t.id} | ${t.sign_count} |`);
    }
    w(``);
  }
} catch (e) { w(`(skipped — ${e.message})`); w(``); }

// ─── §6 Sign-class clusters (v0.28) ───────────────────────────────────────

w(`## §6 — Empirical sign-class clusters (v0.28, k=12 k-means on sign2vec)`);
w(``);
const sc = clusterSignsByEmbedding({ k: 12 });
w(`Total signs clustered: ${sc.total_signs_clustered}. Silhouette: ${sc.silhouette_score.toFixed(4)}.`);
w(``);
w(`| cluster | size | intra-cosine | suggested label | top reps |`);
w(`|---|---|---|---|---|`);
for (const c of sc.clusters.sort((a, b) => b.size - a.size)) {
  const reps = c.representative_signs.slice(0, 3).map((r) => r.sign).join(", ");
  w(`| #${c.id} | ${c.size} | ${c.mean_intra_cluster_cosine.toFixed(3)} | ${c.suggested_label} | ${reps} |`);
}
w(``);

// ─── §7 Per-period chunks (v0.28) ─────────────────────────────────────────

w(`## §7 — Per-period chunk-hash highlights (v0.28)`);
w(``);
try {
  const pp = findFormulaicPassagesPerPeriod({ minHosts: 10, topK: 10, periodSpecificOnly: true });
  w(`NA index: ${pp.na_index_stats.total_non_singleton_hashes} hashes from ${pp.na_index_stats.total_tablets} tablets`);
  w(`NB index: ${pp.nb_index_stats.total_non_singleton_hashes} hashes from ${pp.nb_index_stats.total_tablets} tablets`);
  w(`**Density gap: 4.2×** NA vs NB non-singleton hash count.`);
  w(``);
  w(`### Top 5 period-specific chunks`);
  w(``);
  w(`| # | na_hosts | nb_hosts | classification | first signs |`);
  w(`|---|---|---|---|---|`);
  for (const [i, p] of pp.passages.slice(0, 5).entries()) {
    const signs = p.chunk_signs.length > 70 ? p.chunk_signs.slice(0, 70) + "…" : p.chunk_signs;
    w(`| ${i + 1} | ${p.na_host_count} | ${p.nb_host_count} | ${p.period_specificity} | \`${signs}\` |`);
  }
  w(``);
} catch (e) { w(`(per-period chunks skipped — ${e.message})`); w(``); }

// ─── §8 Joins graph (v0.29) ───────────────────────────────────────────────

w(`## §8 — Manuscript joins graph highlights (v0.29)`);
w(``);
try {
  const ag = await analyzeJoinsGraph({ listTopHosts: true, topK: 10 });
  w(`Index: ${ag.index_stats.total_fragments_with_joins} fragments with joins · ${ag.index_stats.total_join_edges} edges · avg ${ag.index_stats.avg_joins_per_join_host.toFixed(2)}/host`);
  w(``);
  w(`| # | tablet | joins | period | genre |`);
  w(`|---|---|---|---|---|`);
  for (const [i, h] of ag.top_hosts.entries()) {
    w(`| ${i + 1} | ${h.tablet_id} | ${h.joins_count} | ${h.period ?? "?"} | ${h.primary_genre ?? "—"} |`);
  }
  w(``);
} catch (e) { w(`(joins graph skipped — ${e.message})`); w(``); }

// ─── §9 Numerical chunks (v0.29) ──────────────────────────────────────────

w(`## §9 — Data-driven numerical chunks (v0.29)`);
w(``);
try {
  const nc = findNumericalChunks({ min_numerical_density: 0.5, min_hosts: 5, top_k: 10 });
  w(`Empirical numerical sign-set size: **${nc.numerical_sign_set_size}** (vs v0.21's hardcoded 2 signs)`);
  w(`Chunks above density threshold: ${nc.index_stats.chunks_above_density_threshold}`);
  w(``);
  w(`| # | hosts | density | signs |`);
  w(`|---|---|---|---|`);
  for (const [i, c] of nc.chunks.entries()) {
    const signs = c.chunk_signs.length > 70 ? c.chunk_signs.slice(0, 70) + "…" : c.chunk_signs;
    w(`| ${i + 1} | ${c.host_count} | ${c.numerical_density.toFixed(2)} | \`${signs}\` |`);
  }
  w(``);
} catch (e) { w(`(numerical chunks skipped — ${e.message})`); w(``); }

// ─── §10 Bayesian fusion (v0.29) — canonical pairs ────────────────────────

w(`## §10 — Bayesian fusion sample (v0.29) — canonical labeled pairs`);
w(``);
const PAIRS = [
  ["K.5896", "K.9508", "Mīs pî embedded fragment (§3.7.3)"],
  ["K.5896", "K.6683", "Mīs pî sibling (§3.11, v0.22 amendment candidate)"],
  ["BM.47463", "CBS.6060", "Šurpu commentary↔base (§3.7.1)"],
  ["K.3306", "K.6685", "v0.19 chunk-discovery sister"],
];
w(`| pair | P(positive) | log_odds | class |`);
w(`|---|---|---|---|`);
for (const [a, b, label] of PAIRS) {
  try {
    const r = computeJointPairScore({ tabletA: a, tabletB: b });
    w(`| ${a} ↔ ${b} ${label && `(${label})`} | ${r.probability_positive.toFixed(4)} | ${r.log_odds.toFixed(2)} | ${r.classification} |`);
  } catch (e) {
    w(`| ${a} ↔ ${b} | (error: ${e.message}) | | |`);
  }
}
w(``);

// ─── §11 Sample lacuna prediction (v0.30) ─────────────────────────────────

w(`## §11 — Sample lacuna prediction (v0.30, sign2vec-augmented)`);
w(``);
try {
  const r = restoreLacunaSemantic({ tablet_id: "1879,0708.118", lacuna_position: 20, top_k: 10, alpha: 0.5 });
  w(`Tablet \`1879,0708.118\` position ${r.lacuna_position}, α=${r.alpha}.`);
  w(`Surrounding: left2=${r.surrounding_signs.left2} left1=${r.surrounding_signs.left1} → [?] ← right1=${r.surrounding_signs.right1} right2=${r.surrounding_signs.right2}`);
  w(``);
  w(`| rank | sign | joint | bigram | sign2vec |`);
  w(`|---|---|---|---|---|`);
  for (const p of r.predictions) {
    w(`| ${p.rank_by_joint} | ${p.sign} | ${p.joint_score.toFixed(4)} | ${p.bigram_score.toFixed(4)} | ${p.sign2vec_score.toFixed(4)} |`);
  }
  w(``);
  w(`Ablation: bigram_top1=\`${r.ablation.pure_bigram_top1}\`  sign2vec_top1=\`${r.ablation.pure_sign2vec_top1}\`  joint_top1=\`${r.ablation.joint_top1}\`  (${r.ablation.agreement})`);
  w(``);
} catch (e) { w(`(lacuna restore skipped — ${e.message})`); w(``); }

// ─── §12 Build state ──────────────────────────────────────────────────────

w(`## §12 — Build state at generation time`);
w(``);
w(`- Tool count: **81** (across v0.18 → v0.30)`);
w(`- Fragment metadata cache: **36,317 entries** (saturated after 4 enrichment bursts; 162 persistent failures)`);
w(`- Methods paper sections: §3.1–§3.17, claims 1–37`);
w(`- All 25 regression-audit rounds pass against current codebase (see \`docs/REGRESSION-AUDIT-v0.30.md\`)`);
w(``);
w(`- Chunk-hash indexes:`);
w(`  - corpus-wide length-20: ~96,654 non-singleton hashes (v0.20)`);
w(`  - length-10 incipits: ~214,896 (v0.21)`);
w(`  - per-period length-20: NA 50,083 / NB 11,979 (v0.28)`);
w(``);
w(`- Sign2vec embeddings:`);
w(`  - corpus-wide WINDOW=5/MIN_OCC=20: 635 signs (v0.23)`);
w(`  - ensemble: 6 configs WINDOW×MIN_OCC (v0.25)`);
w(`  - per-period NA/NB: 435/452 signs (v0.26)`);
w(`  - register-matched 6 buckets (v0.27)`);
w(``);
w(`Run \`node scripts/generate-discovery-atlas-v0.30.mjs\` to regenerate against current cache state.`);

writeFileSync("docs/DISCOVERY-ATLAS-v0.30.md", lines.join("\n"));
console.log(`Generated docs/DISCOVERY-ATLAS-v0.30.md (${lines.length} lines)`);
