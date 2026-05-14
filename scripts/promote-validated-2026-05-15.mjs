// Promotes 10 of the 15 validated candidates from discoveredCandidates.json
// into antediluvianParallels.json (the v0.6 retrieval-tier dataset). The
// remaining 5 validated candidates are Mesopotamian-internal (Mesopotamian↔
// Mesopotamian, Hurrian↔Akkadian, or Mesopotamian↔Ugaritic) and don't fit
// the v0.6 tool's Jewish-passage-query structure — they stay in
// discoveredCandidates.json with validation_status: validated until a
// future MCP tool surfaces them (planned: v0.8 find_mesopotamian_parallel).
//
// Run-once.

import { readFileSync, writeFileSync } from "node:fs";

const DC_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const dc = JSON.parse(readFileSync(DC_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

// Look up DiscoveryCandidate by entity-pair
function findCandidate(entityAName, entityBName) {
  const c = dc.candidates.find(
    (x) => x.entity_a.name === entityAName && x.entity_b.name === entityBName,
  );
  if (!c) throw new Error(`Candidate not found: ${entityAName} ↔ ${entityBName}`);
  return c;
}

// Convert DiscoveryCandidate confidence_score + notes to correspondence_strength.
// Validated candidates inherit a strength judgment based on how categorical the
// scholarly attribution is.
function strengthFor(_candidate, override) {
  return override; // we'll set this per promoted candidate by hand
}

// Helper: convert a DiscoveryCandidate to a ParallelCandidate (the v0.6 shape).
function convert(disc, mesopotamianSource, strength, transmissionHypothesis, notesOverride) {
  return {
    mesopotamian_source: mesopotamianSource,
    parallel_type:
      disc.parallel_type === "iconographic" ? "topos" : disc.parallel_type,
    correspondence_strength: strength,
    scholarly_attribution: disc.scholarly_attribution,
    transmission_hypothesis: transmissionHypothesis,
    notes: notesOverride ?? disc.notes ?? "",
  };
}

// =============================================================================
// Build the 10 promoted ParallelCandidates
// =============================================================================

// D3 — Eridu/Dilmun ↔ Eden
const cD3 = findCandidate(
  "Eridu / Dilmun paradise framework",
  "Eden (Genesis 2)",
);
const pD3 = convert(
  cD3,
  {
    text: "Enki and Ninhursag (Sumerian Dilmun myth) + Sumerian Flood Story (Dilmun eternal-life destination)",
    citation: "ETCSL 1.1.1 (Enki and Ninhursag); Civil 1969 lines 251-261 (Flood Story)",
    language: "Sumerian",
    approximate_date: "Old Babylonian recension c. 1700 BCE",
  },
  "strong",
  "common_ancient_near_eastern_substrate",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Kramer 1945 Crozer Quarterly 22 was first systematic statement; Kramer 1963 The Sumerians p.149 restates; Kramer & Maier 1989 expands. Both the Dilmun-Eden paradise parallel AND the Ninti/Eve-rib pun (Sumerian ti = both 'rib' and 'to live') are foundational comparative-religion arguments in Sumerology.",
);

// F3 — Adapa ↔ Adam
const cF3 = findCandidate(
  "Adapa-Adam onomastic and structural parallel",
  "Adam (Genesis 2-3)",
);
const pF3 = convert(
  cF3,
  {
    text: "Adapa myth",
    citation: "EA 356 (Amarna fragment) + K.8743 (Neo-Assyrian fragment) + Izre'el 2001 critical edition",
    language: "Akkadian",
    approximate_date: "Old Babylonian / Amarna period (c. 1350 BCE)",
  },
  "moderate",
  "common_ancient_near_eastern_substrate",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Andreasen 1981 himself describes the parallels as 'real but seriously blunted by the entirely different contexts.' Validates the STRUCTURAL parallel (both are first/prototype humans, both tested with food, both lose immortality through food-test). The ONOMASTIC component (Adapa→Adaba→Adam phonological progression) is NOT in Andreasen and should be re-attributed to other scholars (Sjöberg on Sumerian a-dam) or dropped.",
);

// I3 — Eṭemmu ↔ Genesis 2:7 divine breath
const cI3 = findCandidate(
  "Eṭemmu (ghost / divine remnant in humans)",
  "Imago Dei / divine breath in humans (Genesis 1-2)",
);
const pI3 = convert(
  cI3,
  {
    text: "Atra-ḫasīs anthropogenesis (Wē-ila slain god + divine blood mixed with clay)",
    citation: "Atra-ḫasīs I.190-260 (Lambert & Millard 1969, pp. 56-67)",
    language: "Akkadian",
    approximate_date: "Old Babylonian (c. 1700 BCE)",
  },
  "moderate",
  "babylonian_exile",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Lambert & Millard 1969 explicitly compares 'divine blood in clay-formed humans' (Mesopotamian Atra-ḫasīs) with 'divine breath in dust-formed humans' (Genesis 2:7). Validation scope: Genesis 2:7 divine-breath leg only; Genesis 1 imago Dei leg is implied but not explicitly drawn (Westermann 1984 reads imago Dei relationally and is more cautious).",
);

// J2 — Shamhat ↔ Eve
const cJ2 = findCandidate(
  "Shamhat civilizing Enkidu through sex",
  "Eve's role in Adam's knowledge-gain",
);
const pJ2 = convert(
  cJ2,
  {
    text: "Gilgamesh Epic — Shamhat civilizing Enkidu (SB Tablet I)",
    citation: "Gilgamesh SB I.150-220 (George 2003, vol. 1)",
    language: "Akkadian",
    approximate_date: "Standard Babylonian recension c. 1200 BCE",
  },
  "moderate",
  "common_ancient_near_eastern_substrate",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Bailey 1970 JBL 89.2:137-150 is the foundational explicit comparison of Shamhat-as-primal-woman with Eve-as-primal-woman. Later HTR article 'A Suitable Match: Eve, Enkidu, and the Boundaries of Humanity' complicates with Eve↔Enkidu reading — both Bailey's Eve↔Shamhat and the rebuttal Eve↔Enkidu belong in the comparative corpus.",
);

// H4 — Five antediluvian cities ↔ Genesis 4
const cH4 = findCandidate(
  "Five antediluvian cities (Sumerian Flood Story)",
  "Pre-flood civilization (Genesis 4)",
);
const pH4 = convert(
  cH4,
  {
    text: "Sumerian Flood Story (CBS 10673)",
    citation: "Sumerian Flood Story lines 84-100 (Civil 1969, in Lambert & Millard 1969 pp. 138-145); ETCSL 1.7.4",
    language: "Sumerian",
    approximate_date: "Old Babylonian (c. 1700-1600 BCE)",
  },
  "moderate",
  "common_ancient_near_eastern_substrate",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Shea 1991 Origins 18 explicitly maps Cainite cultural-accomplishments (Jabal pastoralism / Jubal music / Tubal-Cain metallurgy / city-building / Lamech polygyny) onto the five Sumerian antediluvian cities (Eridu, Bad-tibira, Larak, Sippar, Shuruppak with tutelary deities). Jacobsen 1981 JBL 100:513-529 'The Eridu Genesis' provides the broader interpretive framework treating both as 'primeval history' genre.",
);

// A1 — AB calendar ↔ Mul.Apin
const cA1 = findCandidate(
  "Astronomical Book 364-day calendar",
  "Mul.Apin schematic year",
);
const pA1 = convert(
  cA1,
  {
    text: "Mul.Apin (Babylonian astronomical compendium)",
    citation: "Mul.Apin Tablets I-II (Hunger & Pingree 1989)",
    language: "Akkadian",
    approximate_date: "Standard text c. 1000 BCE; manuscripts Neo-Assyrian and later",
  },
  "strong",
  "babylonian_exile",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Neugebauer 1981 (foundational, cautious 'inspired by' framing); Ben-Dov 2008 STDJ 78 'The Astronomical Book and Babylonian Astronomy: MUL.APIN and EAE' (modern systematic case). The 364-day schematic year of 1 Enoch's Astronomical Book (chs 72-82) is the cleanest TECHNICAL-CONTENT continuity (not just narrative parallel) between Mesopotamian astronomy and Second Temple Jewish texts.",
);

// E3 — Tablet of Destinies ↔ Heavenly Tablets
const cE3 = findCandidate(
  "Tablet of Destinies",
  "Heavenly Tablets (1 Enoch / Jubilees)",
);
const pE3 = convert(
  cE3,
  {
    text: "Tablet of Destinies (tuppi šīmāti)",
    citation: "Enūma Eliš IV.121-122 + LKA 146 (seven apkallu possess Tablet)",
    language: "Akkadian",
    approximate_date: "Standard Babylonian (Enūma Eliš c. 1100 BCE); divinatory tradition older",
  },
  "strong",
  "babylonian_exile",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Annus 2010 JSP 19.4 p.284 + fn.8 verbatim: 'the Tablet of Destinies corresponds to heavenly tablets and the Pargod in 3 Enoch.' Paul 1973 JANES 5:345-353 provides the foundational treatment from Sumerian tuppi-šīmāti through biblical/Talmudic 'book of life' tradition. Arbel 2006:372 separate published treatment.",
);

// H1 — Berossus Sippar tablets ↔ Enoch/Jubilees preservation
const cH1 = findCandidate(
  "Berossus' Sippar buried-tablets motif",
  "Enoch's writings preserved across Flood",
);
const pH1 = convert(
  cH1,
  {
    text: "Berossus, Babyloniaca (Xisuthros' Sippar-tablet burial)",
    citation: "Berossus frag. F4b (preserved in Syncellus + Eusebius); Verbrugghe & Wickersham 1996 pp. 49-50",
    language: "Greek",
    approximate_date: "Hellenistic (c. 280 BCE); reflects older Babylonian tradition",
  },
  "moderate",
  "hellenistic_continuity",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). van der Horst 2002 'Antediluvian Knowledge' in Japheth in the Tents of Shem (Peeters) explicitly compares Berossus' Sippar-tablet-burial with Jubilees' Cainan-stone-writing tradition and the Enochic preservation-of-wisdom-across-Flood motif. Treats them as cognate antediluvian-knowledge-survival traditions reflecting a common Ancient Near Eastern substrate. Annus 2010 provides broader context.",
);

// I4 — Marduk absence ↔ hester panim
const cI4 = findCandidate(
  "Marduk's absence in Erra Epic",
  "YHWH's hester panim (hiding of face)",
);
const pI4 = convert(
  cI4,
  {
    text: "Erra Epic (Marduk's absence from Babylon enables Erra's rampage)",
    citation: "Erra Epic Tablet I.131-189 (Marduk's departure; Cagni 1969)",
    language: "Akkadian",
    approximate_date: "Late Babylonian (c. 765-763 BCE per Kabti-ilāni-Marduk's authorial frame)",
  },
  "strong",
  "common_ancient_near_eastern_substrate",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Bodi 1991 OBO 104 'The Book of Ezekiel and the Poem of Erra' is the foundational treatment — explicitly identifies 'absence of the divinity from its shrine' as one of TWELVE shared motifs between the Erra Epic and Ezekiel. Block 2000 'The Gods of the Nations' + 'Divine Abandonment' article extends to broader Hebrew Bible. The hester panim (post-biblical rabbinic term) is technically distinct from Bodi's 'divine absence' but the underlying motif is the same.",
);

// B2 — Lu-Nanna ↔ Gilgamesh (append to existing Genesis 6:1-4)
const cB2 = findCandidate(
  "Lu-Nanna 'two-thirds apkallu / one-third human'",
  "Gilgamesh 'two-thirds god / one-third human'",
);
const pB2 = convert(
  cB2,
  {
    text: "Uruk List of Kings and Sages (Lu-Nanna 'two-thirds apkallu') + Gilgamesh Epic SB I.46-48 ('two-thirds divine')",
    citation: "W.20030,7 obv.col.i.19-21 (Lu-Nanna); Gilgamesh SB I.46-48 (George 2003 vol.1 p.540)",
    language: "Akkadian",
    approximate_date: "Seleucid Uruk List (c. 165 BCE); SB Gilgamesh (c. 1200 BCE)",
  },
  "strong",
  "babylonian_exile",
  "Promoted from Discovery Engine v0.7 (machine-discovered, human-scholar validated 2026-05-15). Annus 2010 JSP 19.4 pp.282-283 summary point 7 verbatim: Lu-Nanna's status as 'two-thirds apkallu' 'exactly matches the status of Gilgamesh in the post-diluvian world, as he also was two-thirds divine, and one-third human.' Annus treats this as a single Mesopotamian theological-genealogical formula expressing antediluvian-postdiluvian hybridity, explicitly linking it to the Nephilim of Genesis 6:4 / 1 Enoch 7:2.",
);

// =============================================================================
// New query entries for antediluvianParallels.json
// =============================================================================

const newQueries = [
  {
    query_match: {
      text_id: "genesis",
      passages: ["Genesis 2:7-25"],
      topics: [
        "eden",
        "creation_of_humanity",
        "creation_of_woman",
        "eternal_life_lost",
        "divine_breath",
      ],
    },
    passage_text:
      "And Jehovah God formed man of the dust of the ground, and breathed into his nostrils the breath of life; and man became a living soul. And Jehovah God planted a garden eastward, in Eden; and there he put the man whom he had formed... And the rib, which Jehovah God had taken from the man, made he a woman, and brought her unto the man.",
    passage_translator: "ASV 1901 (paraphrased composite of Genesis 2:7, 2:8, 2:22)",
    results: [pD3, pF3, pI3, pJ2],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Genesis 4:17-26"],
      topics: ["pre_flood_civilization", "cainite_culture_founders"],
    },
    passage_text:
      "And Cain knew his wife; and she conceived, and bare Enoch: and he builded a city... And Adah bare Jabal: he was the father of such as dwell in tents and have cattle. And his brother's name was Jubal: he was the father of all such as handle the harp and pipe. And Zillah, she also bare Tubal-cain, the forger of every cutting instrument of brass and iron...",
    passage_translator: "ASV 1901 (Genesis 4:17-22)",
    results: [pH4],
  },
  {
    query_match: {
      text_id: "1_enoch",
      passages: ["1 Enoch 72:1-82:20"],
      topics: ["364_day_calendar", "schematic_year", "babylonian_astronomy", "astronomical_book"],
    },
    passage_text:
      "The book of the courses of the luminaries of heaven, the relations of each, according to their classes, their dominion and their seasons, according to their names and places of origin, and according to their months, which Uriel, the holy angel who was with me, showed me; and he showed me all their laws exactly as they are, and how it is with regard to all the years of the world and unto eternity, till the new creation is accomplished which dureth till eternity.",
    passage_translator: "R.H. Charles 1912 (public domain) — 1 Enoch 72:1",
    results: [pA1],
  },
  {
    query_match: {
      text_id: "1_enoch",
      passages: ["1 Enoch 81:1-2", "1 Enoch 93:2", "Jubilees 4:32"],
      topics: ["heavenly_tablets", "book_of_destiny", "divine_record_keeping"],
    },
    passage_text:
      "And he said unto me: 'O Enoch, observe these heavenly tablets, and read what is written thereon, and mark every individual fact.' And I observed the heavenly tablets, and read everything which was written and understood everything, and read the book of all the deeds of mankind, and of all the children of flesh that shall be upon the earth to the remotest generations.",
    passage_translator: "R.H. Charles 1912 (public domain) — 1 Enoch 81:1-2",
    results: [pE3],
  },
  {
    query_match: {
      text_id: "jubilees",
      passages: ["Jubilees 4:17-25", "Jubilees 8:1-4", "1 Enoch 65:1-11"],
      topics: ["antediluvian_wisdom_preservation", "wisdom_across_flood"],
    },
    passage_text:
      "And [Enoch] was the first among men that are born on earth who learnt writing and knowledge and wisdom and who wrote down the signs of heaven according to the order of their months in a book... And he was moreover with the angels of God these six jubilees of years, and they showed him everything which is on earth and in the heavens, the rule of the sun, and he wrote down everything.",
    passage_translator: "R.H. Charles 1903 (public domain) — Jubilees 4:17-21",
    results: [pH1],
  },
  {
    query_match: {
      text_id: "ezekiel",
      passages: ["Ezekiel 10:18-19", "Ezekiel 11:22-23"],
      topics: ["divine_abandonment", "hester_panim", "glory_departing_temple"],
    },
    passage_text:
      "And the glory of Jehovah went forth from over the threshold of the house, and stood over the cherubim. And the cherubim lifted up their wings, and mounted up from the earth in my sight when they went forth... And the glory of Jehovah went up from the midst of the city, and stood upon the mountain which is on the east side of the city.",
    passage_translator: "ASV 1901 — Ezekiel 10:18-19, 11:23",
    results: [pI4],
  },
];

// =============================================================================
// Apply: add new queries + append B2 to existing Genesis 6:1-4 query
// =============================================================================

// Append B2 to existing Genesis 6:1-4 entry
const gen6 = ap.parallels.find(
  (p) =>
    p.query_match.text_id === "genesis" &&
    p.query_match.passages.includes("Genesis 6:1-4"),
);
if (!gen6) throw new Error("Existing Genesis 6:1-4 query not found in antediluvianParallels.json");
gen6.results.push(pB2);

// Add new queries
for (const q of newQueries) {
  ap.parallels.push(q);
}

// Update metadata
ap._meta.description =
  "Curated parallels between Jewish/Christian antediluvian-wisdom texts (1 Enoch, Jubilees, Genesis 5-6, Ezekiel) and Mesopotamian source-candidates. Each parallel names the scholar(s) who established it. Curated from Research/The_Watchers.md plus Lambert 1967, Kvanvig 1988, Annus 2010, Reed 2005; expanded 2026-05-15 with 10 promoted candidates from cuneiform-mcp v0.7 Discovery Engine validation.";
ap._meta.v0_7_3_promotion = {
  date: "2026-05-15",
  source: "data/discoveredCandidates.json (machine-discovered, human-scholar validated)",
  promoted_count: 10,
  new_queries_added: 6,
  existing_queries_appended: 1,
  candidates_remaining_in_discovered: 5,
  candidates_remaining_reason:
    "5 validated candidates are Mesopotamian-internal (Mesopotamian↔Mesopotamian, Hurrian↔Akkadian, or Mesopotamian↔Ugaritic) and don't fit the v0.6 tool's Jewish-passage-query structure. They are: Marduk-Tiamat ↔ Baal-Yam; Enheduanna ↔ Kabti-ilāni-Marduk; Hannahanna ↔ Bēlet-ilī; Lagash KL ↔ SKL; Ninurta-Asag ↔ Marduk-Tiamat. Planned home: v0.8 find_mesopotamian_parallel tool with a Mesopotamian-internal query structure.",
};

writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

// =============================================================================
// Mark promoted candidates in discoveredCandidates.json
// =============================================================================

const promotedPairs = new Set([
  "Eridu / Dilmun paradise framework||Eden (Genesis 2)",
  "Adapa-Adam onomastic and structural parallel||Adam (Genesis 2-3)",
  "Eṭemmu (ghost / divine remnant in humans)||Imago Dei / divine breath in humans (Genesis 1-2)",
  "Shamhat civilizing Enkidu through sex||Eve's role in Adam's knowledge-gain",
  "Five antediluvian cities (Sumerian Flood Story)||Pre-flood civilization (Genesis 4)",
  "Astronomical Book 364-day calendar||Mul.Apin schematic year",
  "Tablet of Destinies||Heavenly Tablets (1 Enoch / Jubilees)",
  "Berossus' Sippar buried-tablets motif||Enoch's writings preserved across Flood",
  "Marduk's absence in Erra Epic||YHWH's hester panim (hiding of face)",
  "Lu-Nanna 'two-thirds apkallu / one-third human'||Gilgamesh 'two-thirds god / one-third human'",
]);

for (const c of dc.candidates) {
  const key = c.entity_a.name + "||" + c.entity_b.name;
  if (promotedPairs.has(key)) {
    c.validation_log = c.validation_log || {};
    c.validation_log.promotion_target =
      "antediluvianParallels.json (v0.7.3 promotion 2026-05-15)";
    c.validation_log.promoted_on = "2026-05-15";
  }
}

// Update validation_totals
dc._meta.v0_7_3_promotion = {
  date: "2026-05-15",
  promoted_to_antediluvian: 10,
  remaining_validated_unpromoted: 5,
  reason_unpromoted:
    "Mesopotamian-internal parallels (Mesopotamian↔Mesopotamian, Hurrian↔Akkadian, Mesopotamian↔Ugaritic) — no Jewish-passage query maps. Planned: v0.8 find_mesopotamian_parallel tool.",
};

writeFileSync(DC_PATH, JSON.stringify(dc, null, 2) + "\n");

console.log("Promotion complete.");
console.log(`  Added 6 new queries to antediluvianParallels.json`);
console.log(`  Appended 1 result to existing Genesis 6:1-4 query`);
console.log(`  Total promoted candidates: 10`);
console.log(`  Marked 10 candidates in discoveredCandidates.json with promotion_target`);
console.log(`  5 validated Mesopotamian-internal candidates remain in discoveredCandidates.json`);
console.log(`     (awaiting v0.8 find_mesopotamian_parallel tool)`);
