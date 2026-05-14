// Spawn the built MCP server, send tools/call for lookup_sign("AN"),
// print the response. Used to sanity-check the structured envelope
// shape during Phase 1 of v0.5. Once schemas are in place for all 9
// tools this becomes a proper conformance test.

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "..", "dist", "index.js");

const proc = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "inherit"] });

let buf = "";
const pending = new Map();
let nextId = 1;

proc.stdout.on("data", (chunk) => {
  buf += chunk.toString("utf8");
  let nl;
  while ((nl = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const resolver = pending.get(msg.id);
      if (resolver) {
        pending.delete(msg.id);
        resolver(msg);
      }
    } catch (e) {
      console.error("parse error on:", line.slice(0, 200));
    }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

// 1. initialize
const init = await rpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "probe-structured", version: "0.1.0" },
});
if (init.error) {
  console.error("initialize failed:", JSON.stringify(init.error, null, 2));
  proc.kill();
  process.exit(1);
}
console.log("initialize ok, server:", init.result.serverInfo);

proc.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
);

// 2. tools/call lookup_sign AN
const r = await rpc("tools/call", {
  name: "lookup_sign",
  arguments: { sign: "AN" },
});

if (r.error) {
  console.error("tool call failed:", JSON.stringify(r.error, null, 2));
  proc.kill();
  process.exit(1);
}

console.log("\n=== rendered text (content[0]) ===");
console.log(r.result.content?.[0]?.text);

console.log("\n=== structuredContent envelope ===");
console.log(JSON.stringify(r.result.structuredContent, null, 2));

// Sanity assertions on the envelope shape
const sc = r.result.structuredContent;
const checks = [
  ["envelope has schema URI", typeof sc?.schema === "string" && sc.schema.startsWith("http")],
  ["envelope has data object", sc?.data && typeof sc.data === "object"],
  ["envelope has provenance", sc?.provenance && typeof sc.provenance === "object"],
  ["data.name === AN", sc?.data?.name === "AN"],
  ["data.found === true", sc?.data?.found === true],
  [
    "provenance.source is one of expected",
    ["OGSL", "eBL", "local"].includes(sc?.provenance?.source),
  ],
  ["provenance.fetched_at parseable", !isNaN(Date.parse(sc?.provenance?.fetched_at))],
];

console.log("\n=== sanity checks ===");
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`  ${ok ? "✓" : "✗"} ${name}`);
  if (!ok) failed++;
}

proc.kill();
process.exit(failed > 0 ? 1 : 0);
