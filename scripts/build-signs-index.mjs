// Fetch eBL /fragments/all-signs and persist the full {_id, signs} list.
// One request (~26 s, ~35 MB) yields the complete signs corpus for every
// transliterated fragment. We previously discarded `signs` during the
// lineToVec crawl; this re-fetches it for the trigram experiment.

import dns from "node:dns";
import net from "node:net";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

const URL = "https://www.ebl.lmu.de/api/fragments/all-signs";
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR ?? path.join(os.homedir(), ".cache", "cuneiform-mcp");
const OUT = path.join(CACHE_DIR, "all-signs-full.json");

await fs.mkdir(CACHE_DIR, { recursive: true });
console.log(`[signs-index] fetching ${URL} ...`);
const t0 = Date.now();
const res = await fetch(URL, { headers: { "User-Agent": "cuneiform-mcp-trigram/0.1" } });
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const body = await res.json();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
console.log(`[signs-index] got ${body.length} records in ${elapsed} s`);

// Keep _id + signs; drop anything else if present.
const trimmed = body.map((r) => ({ _id: r._id, signs: r.signs ?? "" }));
const withSigns = trimmed.filter((r) => r.signs.length > 0).length;
console.log(`[signs-index] ${withSigns} have non-empty signs`);

await fs.writeFile(OUT, JSON.stringify(trimmed));
const sz = (await fs.stat(OUT)).size;
console.log(`[signs-index] wrote ${OUT} (${(sz / 1024 / 1024).toFixed(1)} MB)`);
