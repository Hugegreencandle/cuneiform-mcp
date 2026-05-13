// Diagnostic: pick one target with known joins, print its lineToVec
// length, fetch its full joins list, and report each sibling's score
// + rank in raw + weighted rankings.

import dns from "node:dns";
import net from "node:net";
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

import { loadCorpus } from "../dist/cache.js";
import { scoreBoth } from "../dist/lineToVecScore.js";

const target = process.argv[2] ?? "K.2862";
const EBL = "https://www.ebl.lmu.de/api";

const corpus = await loadCorpus();
const byMn = new Map(corpus.fragments.map((f) => [f.museumNumber, f]));
console.log(`corpus: ${corpus.fragments.length} fragments`);

const t = byMn.get(target);
if (!t) {
  console.error(`${target} not in corpus`);
  process.exit(1);
}
console.log(
  `target: ${t.museumNumber}  surfaces=${t.lineToVec.length}  lengths=[${t.lineToVec.map((s) => s.length).join(",")}]`,
);

const res = await fetch(`${EBL}/fragments/${encodeURIComponent(target)}`);
const body = await res.json();
const allSiblings = [];
for (const group of body.joins ?? []) {
  for (const j of group) {
    const mn = `${j.museumNumber.prefix}.${j.museumNumber.number}${j.museumNumber.suffix ? "." + j.museumNumber.suffix : ""}`;
    if (mn !== target) allSiblings.push(mn);
  }
}
console.log(`declared joins (excluding self): ${allSiblings.join(", ")}`);

const hits = [];
for (const cand of corpus.fragments) {
  if (cand.museumNumber === target) continue;
  if (!cand.lineToVec || cand.lineToVec.length === 0) continue;
  const { score, scoreWeighted } = scoreBoth(t.lineToVec, cand.lineToVec);
  if (score === 0 && scoreWeighted === 0) continue;
  hits.push({ mn: cand.museumNumber, score, weighted: scoreWeighted });
}
const byRaw = [...hits].sort((a, b) => b.score - a.score || b.weighted - a.weighted);
const byW = [...hits].sort((a, b) => b.weighted - a.weighted || b.score - a.score);

console.log(`\nscored ${hits.length} non-zero candidates`);
console.log("\ntop 5 by raw:");
for (const h of byRaw.slice(0, 5)) console.log(`  ${h.mn}  raw=${h.score}  w=${h.weighted}`);
console.log("top 5 by weighted:");
for (const h of byW.slice(0, 5)) console.log(`  ${h.mn}  raw=${h.score}  w=${h.weighted}`);

console.log("\nsibling ranks:");
for (const mn of allSiblings) {
  const inCorpus = byMn.has(mn);
  if (!inCorpus) {
    console.log(`  ${mn}: NOT in corpus`);
    continue;
  }
  const rawIdx = byRaw.findIndex((h) => h.mn === mn);
  const wIdx = byW.findIndex((h) => h.mn === mn);
  const sib = byMn.get(mn);
  const sibLens = sib.lineToVec.map((s) => s.length);
  const { score, scoreWeighted } = scoreBoth(t.lineToVec, sib.lineToVec);
  console.log(
    `  ${mn}: surfaces=${sib.lineToVec.length} lengths=[${sibLens.join(",")}] score=${score} weighted=${scoreWeighted} rankRaw=${rawIdx >= 0 ? rawIdx + 1 : "—"} rankW=${wIdx >= 0 ? wIdx + 1 : "—"}`,
  );
}
