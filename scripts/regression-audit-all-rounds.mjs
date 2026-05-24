#!/usr/bin/env node
// Regression audit — run all v0.18+ Round-N audits in sequence + report.
// Catches regressions introduced by v0.20+ work breaking earlier tools.

import { execSync } from "node:child_process";
import { readdirSync } from "node:fs";

const auditScripts = readdirSync("scripts")
  .filter((f) => /^(round\d|lever\d|round8\.1).*\.mjs$/.test(f))
  .sort();

console.log(`Found ${auditScripts.length} audit scripts:`);
for (const s of auditScripts) console.log(`  ${s}`);
console.log("");

const results = [];
for (const script of auditScripts) {
  process.stdout.write(`Running ${script}... `);
  const startedAt = Date.now();
  let pass = false;
  let detail = "";
  try {
    const out = execSync(`node scripts/${script}`, { encoding: "utf-8", stdio: "pipe" });
    pass = true;
    // Try to find a "X/Y passed" or similar headline
    const m = out.match(/(\d+)\/(\d+)\s+pass(?:ed)?/i) || out.match(/(\d+)\s+PASS/i);
    detail = m ? m[0] : "(no headline found in output)";
  } catch (e) {
    pass = false;
    const out = (e.stdout || "").toString();
    const errOut = (e.stderr || "").toString();
    const combined = (out + errOut).slice(-500);
    detail = `EXIT ${e.status} — ${combined.replace(/\n/g, " ").slice(-200)}`;
  }
  const elapsedMs = Date.now() - startedAt;
  results.push({ script, pass, elapsedMs, detail });
  console.log(pass ? `✅ ${(elapsedMs / 1000).toFixed(1)}s` : `❌ ${(elapsedMs / 1000).toFixed(1)}s`);
}

console.log("");
console.log("══════════════════════════════════════════════════════════════════════");
console.log(`Regression audit summary: ${results.filter((r) => r.pass).length}/${results.length} PASS`);
console.log("══════════════════════════════════════════════════════════════════════");
for (const r of results) {
  console.log(`  ${r.pass ? "✅" : "❌"} ${r.script.padEnd(50)} ${(r.elapsedMs / 1000).toFixed(1)}s  ${r.detail}`);
}

if (results.some((r) => !r.pass)) process.exit(2);
