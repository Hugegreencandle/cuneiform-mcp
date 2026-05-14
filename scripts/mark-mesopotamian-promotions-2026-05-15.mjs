// Mark the 6 candidates promoted to mesopotamianParallels.json in v0.8.0
// Run-once.

import { readFileSync, writeFileSync } from "node:fs";

const DC_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json";
const dc = JSON.parse(readFileSync(DC_PATH, "utf8"));

// Pairs that were promoted to mesopotamianParallels.json in v0.8.0
const promotedPairs = [
  ["Marduk's combat with Tiamat", "Baal's combat with Yam"],
  [
    "Ninurta defeats Asag / recovers Tablet of Destinies",
    "Marduk defeats Tiamat (and inherits her role)",
  ],
  ["Hannahanna (Hurrian-Hittite mother-goddess)", "Bēlet-ilī / Ninhursag"],
  ["Enheduanna (named author)", "Kabti-ilāni-Marduk (named author)"],
  [
    "Lagash KL agricultural-labor cosmology",
    "SKL kingship-from-heaven cosmology",
  ],
  [
    "Inanna's Descent (cosmological descent narrative)",
    "Adapa's ascent (cosmological ascent narrative)",
  ],
];

let marked = 0;
const notFound = [];
const idMap = {
  "Marduk's combat with Tiamat||Baal's combat with Yam": "mp-chaoskampf-1",
  "Ninurta defeats Asag / recovers Tablet of Destinies||Marduk defeats Tiamat (and inherits her role)":
    "mp-divine-substitution-1",
  "Hannahanna (Hurrian-Hittite mother-goddess)||Bēlet-ilī / Ninhursag":
    "mp-mother-goddess-1",
  "Enheduanna (named author)||Kabti-ilāni-Marduk (named author)":
    "mp-named-authorship-1",
  "Lagash KL agricultural-labor cosmology||SKL kingship-from-heaven cosmology":
    "mp-king-list-dissent-1",
  "Inanna's Descent (cosmological descent narrative)||Adapa's ascent (cosmological ascent narrative)":
    "mp-descent-ascent-1",
};

for (const [a, b] of promotedPairs) {
  const c = dc.candidates.find(
    (x) => x.entity_a.name === a && x.entity_b.name === b,
  );
  if (!c) {
    notFound.push(a + " ↔ " + b);
    continue;
  }
  c.validation_log = c.validation_log || {};
  c.validation_log.promotion_target = `mesopotamianParallels.json (id: ${idMap[a + "||" + b]})`;
  c.validation_log.promoted_on = "2026-05-15";
  c.validation_log.promotion_version = "0.8.0";
  marked++;
}

dc._meta.v0_8_0_promotion = {
  date: "2026-05-15",
  promoted_to_mesopotamian: marked,
  target_dataset: "data/mesopotamianParallels.json",
  note:
    "The 6 validated Mesopotamian-internal candidates have been promoted to the v0.8 find_mesopotamian_parallel tool's dataset. With this commit, all 18 validated candidates have first-class homes: 12 in antediluvianParallels.json (Jewish-passage-keyed), 6 in mesopotamianParallels.json (Mesopotamian-internal).",
};

writeFileSync(DC_PATH, JSON.stringify(dc, null, 2) + "\n");

console.log(`Marked ${marked} candidates as promoted to mesopotamianParallels.json.`);
if (notFound.length > 0) {
  console.log("\nNot found (check spellings):");
  notFound.forEach((p) => console.log("  - " + p));
}

// Calculate final disposition for all 33 candidates
const validated = dc.candidates.filter((c) => c.validation_status === "validated");
const rejected = dc.candidates.filter((c) => c.validation_status === "rejected");
const promotedToAnte = validated.filter(
  (c) => c.validation_log?.promotion_target?.includes("antediluvianParallels"),
).length;
const promotedToMeso = validated.filter(
  (c) => c.validation_log?.promotion_target?.includes("mesopotamianParallels"),
).length;
const stillUnpromoted = validated.filter(
  (c) => !c.validation_log?.promotion_target,
).length;

console.log("\nFinal disposition:");
console.log(`  Validated: ${validated.length}`);
console.log(`    promoted to antediluvianParallels.json: ${promotedToAnte}`);
console.log(`    promoted to mesopotamianParallels.json: ${promotedToMeso}`);
console.log(`    still unpromoted: ${stillUnpromoted}`);
console.log(`  Rejected:  ${rejected.length}`);
