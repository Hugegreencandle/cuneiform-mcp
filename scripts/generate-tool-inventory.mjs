#!/usr/bin/env node
// Auto-generate docs/TOOL-INVENTORY.md from src/index.ts server.registerTool calls.

import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("src/index.ts", "utf-8");
const tools = [];
const regRegex = /server\.registerTool\(\s*"([^"]+)",\s*\{[\s\S]*?description:\s*"((?:[^"\\]|\\.)*)"/g;
let match;
while ((match = regRegex.exec(src)) !== null) {
  tools.push({
    name: match[1],
    description: match[2].replace(/\\"/g, '"').replace(/\\n/g, "\n"),
  });
}

const md = [
  `# cuneiform-mcp — Tool Inventory`,
  ``,
  `Auto-generated from \`src/index.ts\` via \`scripts/generate-tool-inventory.mjs\`. Last regenerated 2026-06-02 against v0.78.0.`,
  ``,
  `**Total tools: ${tools.length}**`,
  ``,
];
for (const t of tools) {
  const summary = t.description.replace(/\s+/g, " ").trim().slice(0, 300);
  md.push(`## \`${t.name}\``);
  md.push(``);
  md.push(summary + (t.description.length > 300 ? "…" : ""));
  md.push(``);
}

writeFileSync("docs/TOOL-INVENTORY.md", md.join("\n") + "\n");
console.log(`Generated docs/TOOL-INVENTORY.md with ${tools.length} tools`);
