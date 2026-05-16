// v0.14.4 — Apply the corpus-exclusion pass to primarySourceParallels.json
//
// Closes task #67 by:
//   1. Marking every still-pending parallel involving an Asb.* prototype as
//      rejected_as_artifact with reason: colophon_template_false_positive
//   2. Recording a v0_14_4_exclusion_pass block in the dataset _meta

import { readFileSync, writeFileSync } from "node:fs";

const PSP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json";
const EXCLUSIONS_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/corpus-exclusions.json";

const psp = JSON.parse(readFileSync(PSP_PATH, "utf-8"));
const exclusions = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
const excludedIds = new Set(exclusions.excluded_records.map((r) => r.id));

const PASS_DATE = "2026-05-16";
const PASS_BY = "v0.14.4 corpus-exclusion pass — closes task #67";

let newlyRejected = 0;
let alreadyRejected = 0;
let notInvolvingExcluded = 0;
const involvingExcludedTotal = [];

for (const p of psp.parallels) {
  const a = p.tablet_a.museum_number;
  const b = p.tablet_b.museum_number;
  const involvesExcluded = excludedIds.has(a) || excludedIds.has(b);
  if (!involvesExcluded) {
    notInvolvingExcluded++;
    continue;
  }
  involvingExcludedTotal.push(`${a} ↔ ${b}`);
  if (p.validation_status === "rejected_as_artifact") {
    alreadyRejected++;
    continue;
  }
  // Mark as rejected
  const offender = excludedIds.has(a) ? a : b;
  p.validation_status = "rejected_as_artifact";
  p.validation_log = {
    validated_on: PASS_DATE,
    validated_by: PASS_BY,
    validation_method: `v0.14.4 corpus-exclusion pass. ${offender} is on the prototype-exclusion list (see data/corpus-exclusions.json). Hunger 1968 BAK colophon-type prototype; aggregates standardized Ashurbanipal-library palace-colophon language across many manuscripts. Sign-trigram similarity with any Kuyunjik tablet reflects formulaic colophon-language match, not meaningful intertextual content.`,
    known_publication: null,
    rejection_reason: "colophon_template_false_positive",
  };
  p.notes =
    `v0.14.4 exclusion pass: ${offender} is a Hunger 1968 BAK Type-${offender.split(".")[1].toUpperCase()} Ashurbanipal-library palace colophon prototype, not an individual tablet.` +
    (p.notes ? ` | (prior: ${p.notes})` : "");
  newlyRejected++;
}

psp._meta = psp._meta ?? {};
psp._meta.v0_14_4_exclusion_pass = {
  pass_date: PASS_DATE,
  pass_by: PASS_BY,
  exclusion_list_source: "data/corpus-exclusions.json",
  excluded_record_count: excludedIds.size,
  candidates_reviewed: psp.parallels.length,
  candidates_involving_excluded_records: involvingExcludedTotal.length,
  newly_marked_rejected: newlyRejected,
  already_rejected: alreadyRejected,
  rationale:
    "v0.13.4 calibration identified the colophon-template false-positive class: 2 of 11 top candidates were Asb.* prototype-record matches rather than real intertextual parallels. The Asb.* records in eBL are colophon-type prototypes (Hunger 1968 BAK Types A-Z) that aggregate standardized colophon language across 100-200+ Ashurbanipal-library manuscripts each. Any Kuyunjik tablet trigram-matches them because both share the palace-colophon vocabulary. v0.14.4 (a) excludes all 20 known prototype records from the Discovery Engine corpus at index-build time (scripts/discovery-primary-v2.mjs), and (b) retroactively marks all surfaced Asb.* parallels in the current dataset as rejected_as_artifact.",
  next_steps:
    "v0.14.5 (queued) — extend the exclusion taxonomy to any other corpus-artifact classes that surface in future validation passes. v0.13.6 (queued) — validate jaccard 0.20-0.30 mid-tier candidates, now that prototype-class noise is filtered.",
};

writeFileSync(PSP_PATH, JSON.stringify(psp, null, 2) + "\n");

console.log(`v0.14.4 exclusion pass applied.`);
console.log(`  total parallels: ${psp.parallels.length}`);
console.log(`  involving excluded prototype records: ${involvingExcludedTotal.length}`);
for (const id of involvingExcludedTotal) console.log(`    - ${id}`);
console.log(`  newly marked rejected_as_artifact: ${newlyRejected}`);
console.log(`  already rejected (no-op): ${alreadyRejected}`);
console.log(`  unaffected: ${notInvolvingExcluded}`);
