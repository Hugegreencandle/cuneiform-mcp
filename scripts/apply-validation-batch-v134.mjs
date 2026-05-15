// v0.13.4 — apply validation verdicts to mid-tier candidates (jaccard 0.30-0.55).
// Validated via direct eBL /fragments/<id> fetch reading editor notes + descriptions.
//
// KEY METHODOLOGICAL FINDING: Asb.c / Asb.d / Asb.q in the eBL corpus are NOT
// tablets — they are colophon-TYPE templates aggregating standardized
// Ashurbanipal-library colophon language across 100-200+ manuscripts (Asb.c =
// 212 records, Asb.d = 116 records). Sign-trigram overlap with these prototypes
// represents formulaic colophon-language match, NOT a meaningful intertextual
// parallel. Recommend tagging Asb.* in the corpus as "template" entries with a
// special scoring rule in v0.13.5+.

import { readFileSync, writeFileSync } from "node:fs";

const PSP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json";
const psp = JSON.parse(readFileSync(PSP_PATH, "utf8"));

const VALIDATED_ON = "2026-05-15";
const VALIDATED_BY = "claude-direct-eBL-fetch-v0.13.4";

const verdicts = [
  // ===== Candidate 1: K.3716 ↔ Asb.d — FALSE POSITIVE (colophon template) =====
  {
    pair: ["K.3716", "Asb.d"],
    status: "rejected_as_artifact",
    method:
      "Direct eBL /fragments/Asb.d fetch reveals Asb.d is NOT a tablet — description: 'Colophon Asb Type d'. Notes: '116 records: Literature 16%, Lexicography 15%, Magic 11%, Hymn 7%, Astrology 5%, ...'. Asb.d is a colophon-type prototype aggregating standardized Ashurbanipal-colophon language across 116 manuscripts. Sign-trigram overlap with this prototype represents formulaic colophon-language match (royal-library palace markers like AN.ŠÁR-DÙ-A É.GAL), NOT a meaningful intertextual parallel between two specific tablets.",
    known_publication: null,
    composition:
      "Artifact: Asb.d is a Hunger 1968 BAK colophon-type prototype (= Type-d Ashurbanipal palace colophon), not a specific tablet. The 'parallel' between K.3716 and Asb.d is a sign-overlap with the standardized colophon vocabulary that appears on 116 Ashurbanipal-library manuscripts. The engine should treat Asb.* prototype records as template-class with a -1.0 novelty penalty.",
    rejection_reason: "colophon_template_false_positive",
  },
  // ===== Candidate 2: K.3716 ↔ Asb.c — FALSE POSITIVE (colophon template) =====
  {
    pair: ["K.3716", "Asb.c"],
    status: "rejected_as_artifact",
    method:
      "Same artifact class as #1. Asb.c eBL description: 'Colophon Asb Type c'. Notes: '212 records: 54% magic, 4% medicine, 1% literature, 1% lexicography, 0% astrology, 0% hemerology?, 39% uncertain [SC]'. Asb.c is the Type-c Ashurbanipal-colophon prototype distributed across 212 manuscripts.",
    known_publication: null,
    composition:
      "Same artifact class as #1. Hunger 1968 BAK Type-c Ashurbanipal palace colophon prototype.",
    rejection_reason: "colophon_template_false_positive",
  },
  // ===== Candidate 3: 1881,1103.2244 ↔ K.11384 — VALIDATED (Udug Hul IX) =====
  {
    pair: ["1881,1103.2244", "K.11384"],
    status: "validated_as_known",
    method:
      "Direct eBL /fragments/<id> fetch. 1881,1103.2244 notes field reads VERBATIM: 'UH IX 84-88' — i.e. UDUG HUL series, tablet 9, lines 84-88. UDUG HUL is the Sumerian-Akkadian canonical exorcistic-incantation series (Geller 2016 edition). K.11384 (Neo-Assyrian Kuyunjik) is part of a large multi-fragment reconstruction: '(+) K.5078 r iii. Probably same tablet as K.3251, K.5046, K.5073, K.5078, K.5126, K.9831, K.14168, Sm.1766 [TM/FS]'. The NB↔NA parallel reflects standard Udug Hul transmission to the Ashurbanipal library.",
    known_publication:
      "Geller 2016 Healing Magic and Evil Demons: Canonical Udug-hul Incantations (BAM 8, De Gruyter). The Udug Hul series Tablet IX is the standard edition for this material.",
    composition:
      "UDUG HUL (Sumerian: udug ḫul-gál = 'evil utukku-demon'), tablet 9, lines 84-88. Bilingual Sumerian-Akkadian exorcistic series — the major canonical exorcistic compilation alongside Maqlû and Šurpu. Two witnesses: 1881,1103.2244 (NB) + K.11384 (NA Kuyunjik, part of a ~9-fragment NA reconstruction).",
  },
  // ===== Candidate 4: VAT.21810 ↔ IM.58541 — VALIDATED (Inanna B / Ninmešara) =====
  {
    pair: ["VAT.21810", "IM.58541"],
    status: "validated_as_known",
    method:
      "Direct eBL /fragments/<id> fetch. VAT.21810 notes: 'Inanna B ?-?, 41-47; cf. Bab.46600.CT, VAT.21793 and Bab.46880.AE [ZsF]'. IM.58541 notes: 'Ninmešara 1.7.2 38-47, 54-57'. Inanna B = Ninmešara = 'nin-me-šara' = Enheduana's famous Sumerian hymn 'Lady of All the Me's'. Both tablets witness lines 38-57. eBL editor ZsF cross-references additional witnesses (Bab.46600.CT, VAT.21793, Bab.46880.AE).",
    known_publication:
      "Hallo & van Dijk 1968 The Exaltation of Inanna (Yale Near Eastern Researches 3, Yale University Press) — the foundational edition. Updated in Zgoll 1997 Der Rechtsfall der En-ḫedu-Ana (AOAT 246, Münster) and Helle 2023 Enheduana: The Complete Poems of the World's First Author (Yale UP).",
    composition:
      "Ninmešara / Inanna B (ETCSL 4.07.2) — Sumerian literary hymn attributed to Enheduana, daughter of Sargon of Akkad and high priestess of Nanna at Ur. Multi-witness Old Babylonian literary corpus. Two witnesses in this pair: VAT.21810 (Berlin, OB Babylon) + IM.58541 (Baghdad, OB unspecified).",
  },
  // ===== Candidate 5: BM.46116 ↔ BM.34134 — VALIDATED (ACT 207a/b) =====
  {
    pair: ["BM.46116", "BM.34134"],
    status: "validated_as_known",
    method:
      "Direct eBL /fragments/<id> fetch. BM.46116 publication field: 'ACT 207a, colophon Zra; Ossendrijver, BMAPT, no. 69'. BM.34134 publication: 'ACT 207b; LBAT 98; Ossendrijver, BMAPT, no. 70'. Both are Late-Babylonian astronomical procedure texts for the moon, System A. The 'a/b/c' suffix in ACT 207 denotes multiple witnesses of the SAME procedure text.",
    known_publication:
      "Neugebauer 1955 Astronomical Cuneiform Texts (ACT, Lund Humphries) Vol II §207a, §207b. Updated edition in Ossendrijver 2012 Babylonian Mathematical Astronomy: Procedure Texts (BMAPT, Springer) nos. 69 + 70. BM.34134 also in LBAT (Pinches/Sachs 1955 Late Babylonian Astronomical and Related Texts, Brown UP) no. 98.",
    composition:
      "Late-Babylonian lunar procedure text, System A — one of the two mathematical-astronomical systems (alongside System B) for predicting lunar motion. Both witnesses cover the same procedure rules. Witnesses: BM.46116 (Babylon, Hellenistic; colophon Zra) + BM.34134 (Babylon, Hellenistic). Part of the Babylonian mathematical-astronomy corpus produced by scribal families (Ekur-zākir, Mušēzib, Nidintu-Anu) in 4th-2nd century BCE Babylon + Uruk.",
  },
  // ===== Candidate 6: BM.46116 ↔ BM.34737 — VALIDATED (ACT 207a/c) =====
  {
    pair: ["BM.46116", "BM.34737"],
    status: "validated_as_known",
    method:
      "Direct eBL /fragments/<id> fetch. BM.34737 publication: 'ACT 207c; LBAT 99; Ossendrijver, BMAPT, no. 71'. Same triadic cluster as #5: ACT 207a/b/c are three witnesses of the same System-A lunar procedure text.",
    known_publication:
      "Same as #5: Neugebauer 1955 ACT §207c; Ossendrijver 2012 BMAPT no. 71; Pinches/Sachs 1955 LBAT 99.",
    composition:
      "Same as #5: Late-Babylonian lunar procedure System A. Third witness BM.34737 (Babylon, Hellenistic) completing the ACT 207a/b/c triad.",
  },
];

let updated = 0;
const verdictCounts = {
  validated_as_known: 0,
  validated_as_novel: 0,
  rejected_as_artifact: 0,
};

for (const v of verdicts) {
  const parallel = psp.parallels.find(
    (p) =>
      (p.tablet_a.museum_number === v.pair[0] && p.tablet_b.museum_number === v.pair[1]) ||
      (p.tablet_a.museum_number === v.pair[1] && p.tablet_b.museum_number === v.pair[0]),
  );
  if (!parallel) {
    console.error(`Not found: ${v.pair.join(" ↔ ")}`);
    continue;
  }
  parallel.validation_status = v.status;
  parallel.validation_log = {
    validated_on: VALIDATED_ON,
    validated_by: VALIDATED_BY,
    validation_method: v.method,
    known_publication: v.known_publication,
    ...(v.rejection_reason ? { rejection_reason: v.rejection_reason } : {}),
  };
  parallel.notes =
    `v0.13.4 validation: ${v.composition}` +
    (parallel.notes ? ` | (prior: ${parallel.notes})` : "");
  verdictCounts[v.status]++;
  updated++;
}

// Record meta for v0.13.4
psp._meta.v0_13_4_validation = {
  pass_date: VALIDATED_ON,
  candidates_reviewed: verdicts.length,
  validated_as_known: verdictCounts.validated_as_known,
  validated_as_novel: verdictCounts.validated_as_novel,
  rejected_as_artifact: verdictCounts.rejected_as_artifact,
  validation_method:
    "Direct eBL /fragments/<id> fetch (via Node + native fetch) for 14 unique tablets resolving 6 mid-tier candidates from the rank-6-to-22 cohort. Reading: notes field, description field, publication field, genre tags. Avoided subagent rate-limit issues by doing the lookups directly.",
  key_finding:
    "Asb.* records in the eBL corpus (Asb.c, Asb.d, Asb.q, etc.) are NOT individual tablets — they are colophon-TYPE prototypes that aggregate standardized Ashurbanipal-library palace-colophon language across 100-200+ manuscripts (Asb.c = 212 records, Asb.d = 116 records). Sign-trigram parallels involving Asb.* prototype entries are FORMULAIC ARTIFACTS, not meaningful intertextual relationships. The discovery engine should be patched in v0.13.5 to either (a) exclude Asb.* from the corpus, or (b) tag them as 'colophon_template' class with a strong novelty penalty.",
  novel_methodological_discovery:
    "Engine failure mode identified: COLOPHON-TEMPLATE FALSE POSITIVES. This is a real (and reportable) discovery about the failure modes of trigram-Jaccard parallel-detection over the eBL corpus. The engine WILL flag any Ashurbanipal-library tablet as a 'parallel' to the Asb.* prototype because they share the colophon vocabulary. v0.13.5 must add a corpus pre-filter excluding prototype entries.",
  outcome_summary:
    "Mid-tier (rank 6-22) validation yielded 4 validated_as_known (Udug Hul IX + Ninmešara + ACT 207a/b + ACT 207a/c) and 2 rejected_as_artifact (colophon-template false positives). Combined with v0.13.2 (5/5 validated_as_known), the engine's CONFIRMED CALIBRATION is: 9/11 candidates evaluated → real intertextual parallels (all already documented by eBL editors or in published canonical editions), 2/11 candidates → colophon-template artifacts. The novel-findings rate remains 0/11 in the top tier; v0.13.5 corpus-cleaning + v0.13.6 deeper-tier validation are the next steps.",
  next_steps:
    "v0.13.5 — corpus pre-filter excluding Asb.*/MB.*/colophon-template prototype records; re-score the entire corpus. v0.13.6 — validate jaccard 0.20-0.30 candidates (deeper tier where eBL editors are less likely to have curated). v0.13.3 (deferred from v0.13.2) — full-corpus pass beyond the 200-tablet sample.",
};

writeFileSync(PSP_PATH, JSON.stringify(psp, null, 2) + "\n");

console.log(`v0.13.4 validation applied.`);
console.log(`  ${updated} candidates updated.`);
console.log(`  Validated as known: ${verdictCounts.validated_as_known}`);
console.log(`  Validated as novel: ${verdictCounts.validated_as_novel}`);
console.log(`  Rejected as artifact: ${verdictCounts.rejected_as_artifact}`);
console.log("");
console.log("KEY METHODOLOGICAL FINDING:");
console.log("  Asb.* records in eBL corpus are COLOPHON TEMPLATES, not tablets.");
console.log("  These produce formulaic-language false-positive parallels.");
console.log("  v0.13.5 must add a corpus pre-filter for prototype entries.");
