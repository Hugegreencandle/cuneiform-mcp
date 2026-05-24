#!/usr/bin/env node
// Generate docs/CLAIMS-INVENTORY.md — extract every `[my synthesis]` claim
// from the methods paper into a single reference.

import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("docs/methods-paper-cdlj-submission.md", "utf-8");

// Match numbered claims like "29. **`[my synthesis]`** **Title.** Body..."
// or "29. **[my synthesis]** ..."
const lines = src.split("\n");
const claims = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(\d+)\.\s+\*?\*?`?\[my synthesis\]`?\*?\*?\s+\*\*([^*]+)\*\*(.*)$/);
  if (m) {
    claims.push({
      number: parseInt(m[1], 10),
      title: m[2].trim().replace(/\.$/, ""),
      body: m[3].trim(),
      line_in_paper: i + 1,
    });
  }
}

const md = [
  `# cuneiform-mcp methods paper — [my synthesis] Claims Inventory`,
  ``,
  `Auto-extracted from \`docs/methods-paper-cdlj-submission.md\` via \`scripts/generate-claims-inventory.mjs\`. Generated ${new Date().toISOString().slice(0, 10)}.`,
  ``,
  `**${claims.length} numbered claims** spanning §3.1 → §3.14 + §5 + appendix.`,
  ``,
  `Use this as a quick reference for cross-checking, paper-edit passes, and v1.0 review.`,
  ``,
];

for (const c of claims) {
  md.push(`## ${c.number}. ${c.title}`);
  md.push(``);
  md.push(`Paper line ~${c.line_in_paper}.`);
  md.push(``);
  if (c.body) {
    md.push(c.body.length > 600 ? c.body.slice(0, 600) + "…" : c.body);
    md.push(``);
  }
}

md.push(`---`);
md.push(``);
md.push(`## Claim categories (rough grouping)`);
md.push(``);
md.push(`- **§3.1–§3.6 (v0.13–v0.18.2 era):** original methods paper claims (1–13)`);
md.push(`- **§3.7.x:** cluster-typology findings (e.g. K.5896 transmission)`);
md.push(`- **§3.8:** archetype typology (locked 2026-05-23)`);
md.push(`- **§3.9 + §3.9.1 (v0.19.0 + post-enrichment):** chunk-parallels per-tablet probe + BM.77056 KAR-44 cross-curricular finding`);
md.push(`- **§3.10 (v0.20.0):** corpus-wide chunk discovery (claims 23–25)`);
md.push(`- **§3.11 (v0.22.0):** stemma reconstruction + scribal schools (claims 26–28)`);
md.push(`- **§3.12 + §3.13 (v0.23–v0.25):** sign2vec + lexical-substitution axis (claims 29–31, with v0.25 refinement)`);
md.push(`- **§3.14 (v0.26.0):** per-period + per-archetype conditional calibration (claim 32)`);
md.push(``);

writeFileSync("docs/CLAIMS-INVENTORY.md", md.join("\n") + "\n");
console.log(`Generated docs/CLAIMS-INVENTORY.md with ${claims.length} claims extracted`);
