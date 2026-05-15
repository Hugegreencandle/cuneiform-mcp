// Generates ~/Desktop/Research/PRIMARY-SOURCE-DISCOVERIES-2026-05-15.md from
// data/primarySourceParallels.json. The v0.13.0 human-review artifact.

import { readFileSync, writeFileSync } from "node:fs";

const ds = JSON.parse(
  readFileSync("/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json", "utf8"),
);

const lines = [];
lines.push("# Primary-Source Cuneiform Parallel Candidates — Discovery Engine v2.0");
lines.push("");
lines.push(`*Compiled ${ds._meta.compiled}. Engine ${ds._meta.engine_version}. v0.13.0 MVP — Mode A (lexical reuse) only; cross-boundary metadata filtering (Mode B) deferred to v0.13.1 once metadata enrichment runs.*`);
lines.push("");
lines.push("---");
lines.push("");
lines.push("## How this document was produced");
lines.push("");
lines.push("A one-time AI traversal pass over the **cached eBL primary-source corpus** (~36K cuneiform tablets with sign-data) using sign-trigram Jaccard matching. The Discovery Engine v2.0 differs from v0.7 in TARGET, not in METHOD:");
lines.push("");
lines.push("- **v0.7 traversed:** 48 secondary-literature briefs (research material I'd written + curated)");
lines.push("- **v0.13 traverses:** the eBL primary-source corpus (the actual cuneiform tablets)");
lines.push("");
lines.push(`Pass parameters:`);
lines.push("");
lines.push(`- **Corpus size traversed:** ${ds._meta.corpus_size_traversed} tablets with ≥${ds._meta.min_trigram_count} sign-trigrams each (from ${36498} total cached tablets)`);
lines.push(`- **Sample size:** ${ds._meta.sample_size} query tablets sampled deterministically (seed=${ds._meta.random_seed})`);
lines.push(`- **Min Jaccard:** ${ds._meta.min_jaccard} (filtered out weak matches)`);
lines.push(`- **Min intersection:** ${ds._meta.min_intersection} shared trigrams (filtered out coincidental matches)`);
lines.push(`- **Total candidates found:** ${ds._meta.total_candidates_found}`);
lines.push(`- **Candidates output:** ${ds._meta.candidates_output}`);
lines.push(`- **Discovery pass duration:** ${ds._meta.discovery_pass_duration_seconds}s`);
lines.push(`- **Metadata enrichment status:** \`${ds._meta.metadata_enrichment_status}\``);
lines.push("");
lines.push("**Discipline:** every candidate carries `validation_status: pending`. Promotion to retrieval-tier (or rejection as artifact) requires human-scholar review. Three possible verdicts:");
lines.push("");
lines.push("- **`validated_as_known`** — published scholar has already noted this parallel; add scholarly_attribution");
lines.push("- **`validated_as_novel`** — no published scholar appears to have documented this parallel; flag for further investigation");
lines.push("- **`rejected_as_artifact`** — the match is coincidental (formulaic-genre overlap, royal-titulary, etc.) or otherwise non-meaningful");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## What v0.13.0 limits");
lines.push("");
lines.push("**MVP scope choices that bound this output:**");
lines.push("");
lines.push("1. **Sample-based, not full corpus.** 200 query tablets out of ~20K transliterated tablets. A full-corpus pass would surface ~100× more candidates. Sample is deterministic via seed for reproducibility.");
lines.push("2. **No per-tablet metadata enrichment.** Genre / period / city / language fields are EMPTY in the output. The cross-boundary novelty bonus from the SPEC is therefore inactive — `novelty_score` currently equals `jaccard`. v0.13.1 will run metadata enrichment via eBL `/fragments/<id>` API queries and re-score.");
lines.push("3. **No validation pass yet.** All candidates are `validation_status: pending`. Top candidates need human-scholar review (or automated literature-search via v0.7-style validation subagents) to determine which are novel vs already-documented.");
lines.push("");
lines.push("**Notable artifacts likely present in the top output:**");
lines.push("");
lines.push("- **Probable unrecorded joins** (very high Jaccard >= 0.85) — fragments from the same original tablet now in different museums. The `find_join_candidates` v0.5 tool already finds these one-at-a-time; this pass surfaces them at scale.");
lines.push("- **Same-composition copies** (high Jaccard 0.5-0.85) — same canonical text copied to different tablets by different scribes. Useful for textual-criticism + scribal-school identification.");
lines.push("- **Formulaic parallels** (medium Jaccard 0.30-0.50 with low intersection) — shared royal-titulary, omen-formulae, etc. These are the ARTIFACTS the metadata-enrichment filter (Mode B) will catch.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Top candidates (sorted by Jaccard descending)");
lines.push("");
lines.push(`Showing all ${ds.parallels.length} candidates above the discovery threshold. The Jaccard 0.85+ tier almost certainly contains unrecorded joins; the 0.50-0.85 tier likely contains intentional textual parallels; the 0.30-0.50 tier needs careful filtering.`);
lines.push("");

// Group by Jaccard tier
const tier_strong = ds.parallels.filter((p) => p.match_evidence.jaccard >= 0.85);
const tier_high = ds.parallels.filter((p) => p.match_evidence.jaccard >= 0.5 && p.match_evidence.jaccard < 0.85);
const tier_med = ds.parallels.filter((p) => p.match_evidence.jaccard >= 0.30 && p.match_evidence.jaccard < 0.5);

lines.push(`**Summary by Jaccard tier:**`);
lines.push("");
lines.push(`| Tier | Jaccard range | Count | Likely category |`);
lines.push(`|---|---|---|---|`);
lines.push(`| Tier-1 strong | ≥ 0.85 | ${tier_strong.length} | Probable unrecorded joins |`);
lines.push(`| Tier-2 high | 0.50 - 0.85 | ${tier_high.length} | Probable same-composition copies |`);
lines.push(`| Tier-3 medium | 0.30 - 0.50 | ${tier_med.length} | Mixed — needs filtering |`);
lines.push("");

if (tier_strong.length > 0) {
  lines.push("### Tier-1 strong (Jaccard ≥ 0.85) — Probable unrecorded joins");
  lines.push("");
  for (const p of tier_strong) {
    lines.push(`#### ${p.id}: ${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number}`);
    lines.push(`  - **Jaccard:** ${p.match_evidence.jaccard.toFixed(4)}`);
    lines.push(`  - **Intersection / Union:** ${p.match_evidence.intersection_size} / ${p.match_evidence.union_size}`);
    lines.push(`  - **Tablet A trigram count:** ${p.tablet_a.trigram_count}`);
    lines.push(`  - **Tablet B trigram count:** ${p.tablet_b.trigram_count}`);
    lines.push(`  - **Shared (first 5):** ${p.match_evidence.shared_trigram_sample.slice(0, 5).join(" | ")}`);
    lines.push(`  - **Validation:** \`${p.validation_status}\``);
    lines.push("");
  }
  lines.push("");
}

if (tier_high.length > 0) {
  lines.push("### Tier-2 high (Jaccard 0.50 - 0.85) — Probable same-composition copies");
  lines.push("");
  for (const p of tier_high.slice(0, 30)) {
    lines.push(`#### ${p.id}: ${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number}`);
    lines.push(`  - **Jaccard:** ${p.match_evidence.jaccard.toFixed(4)} · **Intersection / Union:** ${p.match_evidence.intersection_size} / ${p.match_evidence.union_size}`);
    lines.push(`  - **Shared (first 5):** ${p.match_evidence.shared_trigram_sample.slice(0, 5).join(" | ")}`);
    lines.push("");
  }
  if (tier_high.length > 30) {
    lines.push(`*… and ${tier_high.length - 30} more Tier-2 candidates in the dataset.*`);
    lines.push("");
  }
}

if (tier_med.length > 0) {
  lines.push("### Tier-3 medium (Jaccard 0.30 - 0.50) — Mixed candidates");
  lines.push("");
  lines.push(`Listing top 15 of ${tier_med.length}. These need careful filtering to distinguish meaningful parallels from formulaic-genre artifacts. The v0.13.1 metadata-enrichment pass will help: cross-boundary candidates (different genre + period + city) are far more likely to be meaningful than within-boundary candidates.`);
  lines.push("");
  for (const p of tier_med.slice(0, 15)) {
    lines.push(`- **${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number}** (jaccard ${p.match_evidence.jaccard.toFixed(3)}, intersection ${p.match_evidence.intersection_size}/${p.match_evidence.union_size})`);
  }
  lines.push("");
}

lines.push("---");
lines.push("");
lines.push("## Next steps");
lines.push("");
lines.push("### v0.13.1 — Metadata enrichment + cross-boundary scoring");
lines.push("");
lines.push("Run eBL `/fragments/<id>` queries against each unique tablet ID in the candidates to fetch:");
lines.push("- `genre` (literary / lexical / medical / divinatory / royal-inscription / administrative / etc.)");
lines.push("- `period` (Old Babylonian / Middle Babylonian / Neo-Assyrian / Late Babylonian / etc.)");
lines.push("- `provenance` (Nineveh / Babylon / Uruk / Sippar / Aššur / etc.)");
lines.push("- `language` (Akkadian / Sumerian / bilingual)");
lines.push("");
lines.push("Then re-compute `novelty_score` with cross-boundary bonuses and re-rank. Cross-genre + cross-period candidates are the most likely to surface genuinely novel parallels.");
lines.push("");
lines.push("### v0.13.2 — Validation pipeline");
lines.push("");
lines.push("For top-50 candidates (after metadata-enriched re-ranking), spawn validation subagents to:");
lines.push("- Web-search Assyriological literature for any published documentation of the parallel");
lines.push("- Check ORACC composition catalogs for shared compositional attribution");
lines.push("- Check eBL join-database for already-recorded joins");
lines.push("- Update `validation_status` to `validated_as_known` / `validated_as_novel` / `rejected_as_artifact`");
lines.push("");
lines.push("### v0.13.3+ — Full-corpus pass");
lines.push("");
lines.push("Scale from 200-tablet sample to ~20K-tablet full transliterated corpus. The discovery pass took 5 seconds for 200 queries; full-corpus would take ~8 minutes. Output: estimated 30K-100K candidate parallels; top ~1000 by post-metadata novelty_score would be the operational dataset.");
lines.push("");
lines.push("### v0.14+ — Semantic embedding mode (Mode C)");
lines.push("");
lines.push("Train or fine-tune multilingual embeddings on transliterated Sumerian + Akkadian. Enable conceptual-similarity matching across texts that don't share lexical surface forms. Major scope expansion; deferred until Mode A + Mode B mature.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Provenance");
lines.push("");
lines.push("- **Engine version:** ${ds._meta.engine_version}");
lines.push(`- **Discovery date:** ${ds._meta.compiled}`);
lines.push(`- **Underlying corpus:** \`~/.cache/cuneiform-mcp/all-signs-full.json\` (cached eBL \`/fragments/all-signs\`)`);
lines.push(`- **Underlying JSON:** \`/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json\``);
lines.push(`- **MCP tool:** \`discover_primary_source_parallels\` in cuneiform-mcp v0.13.0`);
lines.push(`- **Schema:** \`/Users/danebrown/Desktop/cuneiform-mcp/schemas/discover_primary_source_parallels.schema.json\``);
lines.push(`- **Discovery script:** \`/Users/danebrown/Desktop/cuneiform-mcp/scripts/discovery-primary-v2.mjs\``);
lines.push(`- **Spec:** \`/Users/danebrown/Desktop/cuneiform-mcp/SPEC-v0.13.0-discovery-engine-v2.md\``);
lines.push("");
lines.push("*All candidates are MACHINE-DISCOVERED via sign-trigram Jaccard matching. None carry named scholarly attribution. Treat as hypothesis-generation pending human-scholar review.*");

writeFileSync(
  "/Users/danebrown/Desktop/Research/PRIMARY-SOURCE-DISCOVERIES-2026-05-15.md",
  lines.join("\n") + "\n",
);
console.log("Wrote /Users/danebrown/Desktop/Research/PRIMARY-SOURCE-DISCOVERIES-2026-05-15.md");
console.log(`  ${ds.parallels.length} candidates documented`);
console.log(`  Tier-1 (jaccard ≥0.85): ${tier_strong.length}`);
console.log(`  Tier-2 (jaccard 0.50-0.85): ${tier_high.length}`);
console.log(`  Tier-3 (jaccard 0.30-0.50): ${tier_med.length}`);
