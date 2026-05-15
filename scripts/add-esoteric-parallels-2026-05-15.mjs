// v0.12.0 Esoteric expansion — adds 3 Tier-1 parallels from
// Mesopotamian_Esoteric_Reception.md framework brief.

import { readFileSync, writeFileSync } from "node:fs";

const MP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/mesopotamianParallels.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const mp = JSON.parse(readFileSync(MP_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

// =============================================================================
// mesopotamianParallels.json — 1 new esoteric parallel
// =============================================================================

const newMesopotamianParallels = [
  {
    id: "mp-astrology-transmission-1",
    entity_a: {
      text: "Mesopotamian horoscopy + mathematical astronomy — the first documented horoscopes appear in Babylonia c. 410 BCE; the 12-sign zodiac is standardized in Babylonian astronomical texts by c. 500 BCE; the Astronomical Cuneiform Texts (ACT) corpus c. 350 BCE-100 CE develops procedural mathematical astronomy with sexagesimal arithmetic + linear zigzag functions for precise planetary-position prediction. Practiced at Esagila (Babylon) + Eanna (Uruk) temple-schools.",
      citation: "Rochberg 1998 Babylonian Horoscopes (TAPS 88.1); Hunger & Pingree 1999 Astral Sciences in Mesopotamia (HdO I.44); Neugebauer 1955 Astronomical Cuneiform Texts (3 vols); Ossendrijver 2012 Babylonian Mathematical Astronomy (Springer)",
      language: "Akkadian",
      tradition: "babylonian",
      approximate_date: "Horoscopy c. 410 BCE - 69 BCE; ACT c. 350 BCE - 100 CE; latest cuneiform astronomical tablet (Almanac W22340a Uruk) c. 79/80 CE",
    },
    entity_b: {
      text: "Hellenistic Greek astrology + Ptolemy's astronomical-astrological synthesis — Berossus transmits Babylonian astronomy to Greek world c. 280 BCE; Hipparchus c. 150 BCE explicitly cites Babylonian observations + discovers precession of equinoxes using them; Ptolemy's Almagest + Tetrabiblos c. 150 CE is the canonical Greco-Roman synthesis with substantial Babylonian substrate (zodiac, planetary motion theory, eclipse prediction).",
      citation: "Pingree 1997 From Astral Omens to Astrology: From Babylon to Bīkāner (Serie Orientale Roma LXXVIII); Jones 2010 Ptolemy's First Commentator; Tester 1987 A History of Western Astrology",
      language: "Greek",
      tradition: "hellenistic_egyptian",
      approximate_date: "Berossus c. 280 BCE; Hipparchus c. 150 BCE; Ptolemy c. 150 CE; reception in Arabic + medieval European astrology continues to present day",
    },
    parallel_type: "structural",
    themes: ["technical_knowledge_transmission", "astronomy", "astrology", "zodiac", "horoscopy", "mathematical_astronomy", "longest_continuous_intellectual_tradition"],
    deities: ["Marduk", "Nabu", "Anu", "Šamaš", "Sin"],
    texts: ["Mul.Apin", "Enūma Anu Enlil", "Astronomical Cuneiform Texts (ACT)", "Astronomical Diaries", "Ptolemy Tetrabiblos", "Ptolemy Almagest"],
    correspondence_strength: "strong",
    scholarly_attribution: [
      {
        author_year: "Pingree 1997",
        publication:
          "David Pingree, From Astral Omens to Astrology: From Babylon to Bīkāner, Serie Orientale Roma 78 (Rome: Istituto Italiano per il Medio ed Estremo Oriente, 1997)",
        argument_summary:
          "The foundational study of Mesopotamian → Greek → Arabic → European astronomical-astrological transmission. Pingree documents the continuous documentary chain: Babylonian Mul.Apin + ACT mathematical-astronomical procedure texts → Berossus's Greek-language Babyloniaca (c. 280 BCE) → Hellenistic Greek astrologers (Sudines, Antigonus, others with Babylonian-derived names) → Ptolemy's Almagest + Tetrabiblos (c. 150 CE) → Arabic medieval astrology (al-Biruni, al-Kindi, Picatrix) → European medieval + modern astrology. The 12-sign zodiac alone is direct translation of Babylonian constellation-names. Pingree's argument is widely accepted: this is the longest documented continuous technical-intellectual transmission in human history.",
      },
      {
        author_year: "Rochberg 2004",
        publication:
          "Francesca Rochberg, The Heavenly Writing: Divination, Horoscopy, and Astronomy in Mesopotamian Culture (Cambridge: Cambridge UP, 2004)",
        argument_summary:
          "Modern synthesis treating Mesopotamian celestial divination + horoscopy + mathematical astronomy as a unified intellectual tradition (rather than separate fields). The Mesopotamian → Greek transmission is foregrounded; Rochberg argues that Hellenistic astrology is substantially a continuation of Babylonian practice with Greek mathematical refinements.",
      },
      {
        author_year: "Hunger & Pingree 1999",
        publication:
          "Hermann Hunger & David Pingree, Astral Sciences in Mesopotamia, Handbuch der Orientalistik I.44 (Leiden: Brill, 1999)",
        argument_summary:
          "Foundational handbook covering the full Mesopotamian astronomical-astrological corpus including the earliest surviving Babylonian horoscopes c. 410 BCE. Hunger and Pingree document the specific texts + procedures that constitute the Babylonian astronomical tradition before its Hellenistic transmission.",
      },
    ],
    transmission_hypothesis: "scribal_transmission",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.12 Esoteric expansion — Mesopotamian_Esoteric_Reception.md Tier-1 recommendation",
    },
    notes:
      "v0.12.0 Esoteric expansion. THE LONGEST DOCUMENTED CONTINUOUS TECHNICAL-INTELLECTUAL TRANSMISSION IN HUMAN HISTORY: Mul.Apin c. 1500 BCE → Late-Babylonian horoscopy c. 410 BCE → Berossus c. 280 BCE → Hipparchus c. 150 BCE → Ptolemy c. 150 CE → Arabic medieval astrology c. 800-1200 CE → European medieval + modern astrology → modern newspaper horoscopes. The 12-sign zodiac alone preserves direct Babylonian constellation-names across 4,000+ years. transmission_hypothesis: scribal_transmission reflects the documented direct-borrowing chain.",
  },
];

// =============================================================================
// antediluvianParallels.json — 2 new Mesopotamia↔Hebrew esoteric parallels
// =============================================================================

const newAntediluvianQueries = [
  {
    query_match: {
      text_id: "genesis",
      passages: ["Daniel 12:4", "Daniel 12:9", "Deuteronomy 29:29"],
      topics: [
        "secret_knowledge",
        "apocalyptic_secrecy",
        "sealed_books",
        "esoteric_transmission",
        "qumran_secrecy",
      ],
    },
    passage_text:
      "But thou, O Daniel, shut up the words, and seal the book, even to the time of the end: many shall run to and fro, and knowledge shall be increased... And he said, Go thy way, Daniel: for the words are shut up and sealed till the time of the end... The secret things belong unto Jehovah our God; but the things that are revealed belong unto us and to our children for ever, that we may do all the words of this law.",
    passage_translator: "ASV 1901 — Daniel 12:4, 9 + Deuteronomy 29:29 (composite)",
    results: [
      {
        mesopotamian_source: {
          text: "Mesopotamian niṣirtu / pirištu secrecy tradition — scribal secrecy formulae protecting esoteric scholarly texts (astronomical, divinatory, magical, medical). 'Niṣirtu' = guarded knowledge; 'pirištu' = secret/hidden thing. Colophonic formulae: 'Let the knowing show the knowing; the not-knowing shall not see.' Protected genres include: Enūma Anu Enlil celestial omens; Iškar Ziqīqu dream-interpretation; Bīt Mēseri apotropaic ritual; Bārûtu hepatoscopy; ACT mathematical astronomy.",
          citation: "Lenzi 2008 Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel (State Archives of Assyria Studies 19)",
          language: "Akkadian",
          approximate_date: "Continuous attestation c. 1500 BCE - 79/80 CE (latest cuneiform tablet)",
        },
        parallel_type: "structural",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Lenzi 2008",
            publication:
              "Alan Lenzi, Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel, State Archives of Assyria Studies 19 (Helsinki: Neo-Assyrian Text Corpus Project, 2008)",
            argument_summary:
              "Foundational comparative study. Lenzi argues that Israelite secret-knowledge traditions — Deuteronomy 29:29, Daniel 12:4 + 12:9, Qumran community esoteric scribal practices — draw substantially on the Mesopotamian niṣirtu-pirištu substrate. The structural parallels are: (a) divine origin of secret knowledge; (b) restriction to qualified initiates; (c) apocalyptic-eschatological framing ('sealed until end-time'); (d) scribal-textual transmission with explicit protection formulae. The Israelite tradition is a theologically distinctive but historically genealogically connected expression of the ANE secret-knowledge tradition that originated in Mesopotamian scholarly practice.",
          },
        ],
        transmission_hypothesis: "babylonian_exile",
        notes:
          "Promoted from v0.12.0 Esoteric expansion (2026-05-15). The niṣirtu tradition is the meta-framework for ALL of the cluster's Mesopotamian esoteric content (hepatoscopy, hemerologies, dream interpretation, late-Babylonian astrology). The Daniel/Qumran reception is the cleanest documented adoption of the Mesopotamian secret-knowledge framework in Jewish literature. The Watchers tradition (1 Enoch 6:1-8 — see existing antediluvianParallels.json entry under 1 Enoch 6:1-8 result 1) is essentially 'niṣirtu-violated' (Asael's metallurgy teaches forbidden technology) — this niṣirtu entry surfaces the underlying mechanism.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Genesis 37:5-11", "Genesis 40:1-23", "Genesis 41:1-57", "Daniel 2:1-49", "Daniel 4:1-37"],
      topics: [
        "dream_interpretation",
        "court_interpreter",
        "symbolic_dreams",
        "babylonian_court_dreams",
        "joseph_daniel_pattern",
      ],
    },
    passage_text:
      "And Joseph dreamed a dream, and he told it to his brethren: and they hated him yet the more... It came to pass at the end of two full years, that Pharaoh dreamed: and, behold, he stood by the river... And in the second year of the reign of Nebuchadnezzar, Nebuchadnezzar dreamed dreams; and his spirit was troubled, and his sleep brake from him.",
    passage_translator: "ASV 1901 — Genesis 37:5, 41:1, Daniel 2:1 (composite)",
    results: [
      {
        mesopotamian_source: {
          text: "Mesopotamian dream-interpretation tradition — the Iškar Ziqīqu series (11 tablets) is the foundational systematic dream-book; the šā'ilu profession is the dream-interpreter specialist (one of the seven canonical āšipūtu disciplines per apkallu-knowledge tradition); major Mesopotamian narratives (Gilgamesh Tablets I + IV; Atra-ḫasīs III.i; Erra Epic colophon's dream-revelation frame; Nabonidus's royal-court dreams) center dream-interpretation as a sophisticated scribal-scholarly practice.",
          citation: "Oppenheim 1956 The Interpretation of Dreams in the Ancient Near East (TAPS 46.3); Butler 1998 Mesopotamian Conceptions of Dreams (AOAT 258); Husser 1994 Dreams and Dream Narratives in the Biblical World",
          language: "Akkadian",
          approximate_date: "Continuous attestation c. 2000 BCE - 100 CE; Iškar Ziqīqu Old Babylonian + Ashurbanipal-library recensions",
        },
        parallel_type: "narrative",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Oppenheim 1956",
            publication:
              "A. Leo Oppenheim, The Interpretation of Dreams in the Ancient Near East: With a Translation of an Assyrian Dream-Book, Transactions of the American Philosophical Society 46.3 (Philadelphia: APS, 1956)",
            argument_summary:
              "The foundational comparative study. Oppenheim treats the Iškar Ziqīqu series + Mesopotamian dream-narrative tradition + Hebrew Bible dream-narratives as participating in a common ANE substrate. The structural parallels between Mesopotamian + biblical dream-traditions include: (a) symbolic-dream format requiring interpretation; (b) court-interpreter institution; (c) specific shared motifs (royal-court dreams indicating political-cosmic significance; dreams as divine communication; dual-dream confirmation patterns).",
          },
          {
            author_year: "Flannery-Dailey 2004",
            publication:
              "Frances Flannery-Dailey, Dreamers, Scribes, and Priests: Jewish Dreams in the Hellenistic and Roman Eras, Supplements to the Journal for the Study of Judaism 90 (Leiden: Brill, 2004)",
            argument_summary:
              "Modern systematic treatment of Jewish dream-traditions arguing for substantial Mesopotamian (and broader ANE) influence. Flannery-Dailey specifically identifies the Joseph + Daniel narratives as reflecting the Mesopotamian šā'ilu (dream-interpreter) institutional tradition: both biblical figures are framed as dream-interpreters in pagan royal courts (Joseph in Egypt; Daniel in Babylon), which is the canonical Mesopotamian narrative shape. The Joseph-Daniel pattern is a documented case of Mesopotamian → diaspora-Jewish literary transmission.",
          },
          {
            author_year: "Husser 1994",
            publication:
              "Jean-Marie Husser, Dreams and Dream Narratives in the Biblical World, trans. Jill M. Munro (Sheffield: Sheffield Academic Press, 1999; original French 1994)",
            argument_summary:
              "Comparative-religion study of dream traditions across the biblical world. Husser places biblical dream-narratives (Joseph, Jacob, Daniel, Saul) within ANE substrate including Mesopotamian Iškar Ziqīqu. Argues for shared-substrate framework rather than direct dependence in most cases, but acknowledges the Daniel narratives' explicit Babylonian-court setting as direct cultural-contact context.",
          },
        ],
        transmission_hypothesis: "babylonian_exile",
        notes:
          "Promoted from v0.12.0 Esoteric expansion (2026-05-15). The Joseph + Daniel court-dream-interpreter pattern is the cleanest documented Mesopotamian → Hebrew Bible narrative-tradition transmission. The Joseph narrative is set in Egypt but uses the Mesopotamian šā'ilu institutional structure; the Daniel narratives are set in Babylon and directly contact the Mesopotamian dream-interpretation tradition. Both figures interpret royal dreams (Pharaoh's seven cows + Nebuchadnezzar's statue + tree) using symbolic-correlation methodology consistent with Iškar Ziqīqu. Flannery-Dailey 2004 treats this as the Joseph-Daniel structural pattern; Husser 1994 explores it in the broader biblical context.",
      },
    ],
  },
];

// Apply
for (const p of newMesopotamianParallels) {
  mp.parallels.push(p);
}
for (const q of newAntediluvianQueries) {
  ap.parallels.push(q);
}

mp._meta.v0_12_0_esoteric_expansion = {
  date: "2026-05-15",
  new_parallels_added: newMesopotamianParallels.length,
  source: "Mesopotamian_Esoteric_Reception.md framework brief (Tier-1 recommendations)",
};
ap._meta.v0_12_0_esoteric_expansion = {
  date: "2026-05-15",
  new_queries_added: newAntediluvianQueries.length,
  source: "Mesopotamian_Esoteric_Reception.md framework brief (Hebrew-anchored Tier-1 esoteric parallels)",
};

writeFileSync(MP_PATH, JSON.stringify(mp, null, 2) + "\n");
writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

console.log("v0.12.0 Esoteric expansion applied.");
console.log(`  mesopotamianParallels.json: +${newMesopotamianParallels.length} entries → total ${mp.parallels.length}`);
console.log(`  antediluvianParallels.json: +${newAntediluvianQueries.length} queries → total ${ap.parallels.length} queries / ${ap.parallels.reduce((s, p) => s + p.results.length, 0)} results`);
