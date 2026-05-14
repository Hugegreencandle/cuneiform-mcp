// Generates ~/Desktop/Research/DISCOVERED-CANDIDATES-2026-05-15.md
// from data/discoveredCandidates.json. Phase-4 of v0.7.0 release.

import { readFileSync, writeFileSync } from "node:fs";

const ds = JSON.parse(
  readFileSync("/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json", "utf8"),
);
const sorted = [...ds.candidates].sort((a, b) => b.confidence_score - a.confidence_score);

const lines = [];
lines.push("# Discovered Comparative-Religion Parallels — 2026-05-15");
lines.push("");
lines.push("*Phase-6 human-review artifact. Companion to cuneiform-mcp v0.7.0 Discovery Engine. All candidates are MACHINE-DISCOVERED and PENDING human-scholar validation.*");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## How this document was produced");
lines.push("");
lines.push("A one-time AI traversal pass over the **24-brief Mesopotamian-theology corpus** at `~/Desktop/Research/` plus the **3 curated v0.6 MCP datasets** at `~/Desktop/cuneiform-mcp/data/`. The Phase-2 Discovery Engine subagent:");
lines.push("");
lines.push(`- Inventoried **${ds._meta.entities_traversed} distinct entities** (deities, motifs, groups, narratives, texts, iconographic forms, places, rituals, concepts) across the corpus`);
lines.push(`- Generated and scored **${ds._meta.pairs_evaluated} candidate entity-pairs**`);
lines.push(`- Surfaced **${ds._meta.candidates_surfaced} parallels** with confidence ≥ 0.30`);
lines.push("- Explicitly **filtered out parallels already curated** in `antediluvianParallels.json` (Genesis 5:21-24 ↔ Enmeduranki; Genesis 6:1-4 ↔ apkallū; 1 Enoch 6 ↔ apkallū fish-cloaked descent)");
lines.push("");
lines.push("Each candidate carries a **discovery_trace**: which briefs supported the comparison, which structural features matched, what transmission route is hypothesized, and what scholar/publication a human reviewer should check to validate or reject the candidate.");
lines.push("");
lines.push("**Discipline:** machine-discovered parallels are explicitly second-class. The `discovered_by: ai_traversal` flag is load-bearing. Until human-scholar validation, these are *hypothesis-generation*, not citation material.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Summary statistics");
lines.push("");
const byType = sorted.reduce((acc, c) => {
  acc[c.parallel_type] = (acc[c.parallel_type] || 0) + 1;
  return acc;
}, {});
const conf = sorted.map((c) => c.confidence_score);
const high = conf.filter((c) => c >= 0.7).length;
const mid = conf.filter((c) => c >= 0.5 && c < 0.7).length;
const low = conf.filter((c) => c >= 0.3 && c < 0.5).length;
lines.push(`- **Total candidates:** ${sorted.length}`);
lines.push(`- **By parallel_type:** ${Object.entries(byType).map(([k, v]) => `${k}: ${v}`).join(", ")}`);
lines.push(`- **High confidence (≥ 0.70):** ${high}`);
lines.push(`- **Medium confidence (0.50-0.70):** ${mid}`);
lines.push(`- **Low confidence (0.30-0.50):** ${low}`);
lines.push("");

const traditions = new Set();
sorted.forEach((c) => {
  if (c.entity_a.tradition) traditions.add(c.entity_a.tradition);
  if (c.entity_b.tradition) traditions.add(c.entity_b.tradition);
});
lines.push(`- **Traditions touched:** ${[...traditions].sort().join(", ")}`);
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Candidates by confidence tier");
lines.push("");

const tier = (c) => (c >= 0.7 ? "high" : c >= 0.5 ? "medium" : "low");
let currentTier = "";
let candidateIndex = 0;
for (const c of sorted) {
  candidateIndex++;
  const t = tier(c.confidence_score);
  if (t !== currentTier) {
    currentTier = t;
    const heading =
      t === "high"
        ? "### High confidence (≥ 0.70) — strongest candidates"
        : t === "medium"
        ? "### Medium confidence (0.50 - 0.70) — solid candidates worth investigating"
        : "### Low confidence (0.30 - 0.50) — speculative; surface but require deeper review";
    lines.push("");
    lines.push(heading);
    lines.push("");
  }
  lines.push(`#### ${candidateIndex}. ${c.entity_a.name} (${c.entity_a.tradition || "unknown"}) ↔ ${c.entity_b.name} (${c.entity_b.tradition || "unknown"})`);
  lines.push("");
  lines.push(`- **Parallel type:** ${c.parallel_type}`);
  lines.push(`- **Confidence:** ${c.confidence_score.toFixed(2)}`);
  lines.push(`- **Validation status:** \`${c.validation_status}\``);
  if (c.transmission_direction) lines.push(`- **Transmission direction:** ${c.transmission_direction}`);
  lines.push("");
  lines.push(`**Reasoning:** ${c.discovery_trace.reasoning_summary}`);
  lines.push("");
  lines.push("**Structural features matched:**");
  for (const f of c.discovery_trace.structural_features) lines.push(`- ${f}`);
  if (c.discovery_trace.lexical_overlap && c.discovery_trace.lexical_overlap.length > 0) {
    lines.push("");
    lines.push(`**Lexical overlap:** ${c.discovery_trace.lexical_overlap.join(", ")}`);
  }
  if (c.discovery_trace.transmission_route) {
    lines.push("");
    lines.push(`**Transmission route:** ${c.discovery_trace.transmission_route}`);
  }
  lines.push("");
  lines.push(`**Supporting briefs:** ${c.discovery_trace.supporting_briefs.map((b) => "`" + b + "`").join(", ")}`);
  if (c.suggested_anchor) {
    lines.push("");
    lines.push(`**Suggested anchor for human review:** ${c.suggested_anchor}`);
  }
  if (c.notes) {
    lines.push("");
    lines.push(`**Notes:** ${c.notes}`);
  }
  lines.push("");
  lines.push("---");
  lines.push("");
}

lines.push("");
lines.push("## How to validate a candidate");
lines.push("");
lines.push("1. **Locate the suggested anchor.** Check the named scholar/publication via JSTOR / Brill / institutional access.");
lines.push("2. **Cross-check the supporting briefs.** Open each listed brief in `~/Desktop/Research/` and verify the structural features claimed actually appear there.");
lines.push("3. **Search for prior scholarship.** Use the entity names + parallel-type as query terms. If a published scholar has already made this argument, the candidate can be promoted with their attribution.");
lines.push("4. **Make a verdict:** `validated` (a human scholar has made this argument; promote into `antediluvianParallels.json`) / `rejected` (the parallel doesn't hold; keep here with a rejection-reason note) / `pending` (uncertain; keep in this file).");
lines.push("5. **For validated candidates:** update `/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json` and consider adding a new entry to `antediluvianParallels.json` with a real `scholarly_attribution` array.");
lines.push("");
lines.push("---");
lines.push("");
lines.push("## Provenance");
lines.push("");
lines.push(`- **Discovery pass date:** ${ds._meta.discovery_pass_date}`);
lines.push(`- **Engine version:** ${ds._meta.engine_version}`);
lines.push(`- **Corpus size:** ${ds._meta.brief_count} briefs + ${ds._meta.dataset_count} datasets`);
lines.push(`- **Entities traversed:** ${ds._meta.entities_traversed}`);
lines.push(`- **Pairs evaluated:** ${ds._meta.pairs_evaluated}`);
lines.push(`- **Candidates surfaced:** ${ds._meta.candidates_surfaced}`);
lines.push("- **Underlying JSON:** `/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json`");
lines.push("- **Underlying entity inventory:** `/Users/danebrown/Desktop/cuneiform-mcp/data/entityInventory.json`");
lines.push("- **MCP tool:** `discover_parallel_candidates` in cuneiform-mcp v0.7.0");
lines.push("- **Schema:** `/Users/danebrown/Desktop/cuneiform-mcp/schemas/discover_parallel_candidates.schema.json`");
lines.push("");
lines.push("*All candidates are MACHINE-DISCOVERED via structural-pattern matching. None carry named scholarly attribution. Treat as hypothesis-generation pending human-scholar review.*");

writeFileSync(
  "/Users/danebrown/Desktop/Research/DISCOVERED-CANDIDATES-2026-05-15.md",
  lines.join("\n") + "\n",
);
console.log("Wrote /Users/danebrown/Desktop/Research/DISCOVERED-CANDIDATES-2026-05-15.md");
