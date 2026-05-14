// Phase 4 of v0.9.0 Egyptian expansion: adds Tier-1 and Tier-2 cross-tradition
// parallels from the Mesopotamia_Egypt_Comparative.md framework brief into the
// MCP datasets.
//
// Adds 4 entries to mesopotamianParallels.json (Mesopotamia↔Egypt) and 3 entries
// to antediluvianParallels.json (Egypt↔Hebrew). All anchor to named scholars
// per the discipline.
//
// Run-once.

import { readFileSync, writeFileSync } from "node:fs";

const MP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/mesopotamianParallels.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const mp = JSON.parse(readFileSync(MP_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

// =============================================================================
// mesopotamianParallels.json — 4 new Mesopotamia↔Egypt parallels
// =============================================================================

const newMesopotamianParallels = [
  {
    id: "mp-creation-by-word-1",
    entity_a: {
      text: "Memphite Theology — Ptah of Memphis creates by heart (conception) and tongue (articulation); the world arises by divine word",
      citation: "Shabaka Stone, BM EA 498 (Allen 1988; Sethe 1928)",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Inscribed c. 716 BCE on Shabaka Stone; theology arguably older (Middle Kingdom?), dating contested per Junge 1973",
    },
    entity_b: {
      text: "Marduk creates by word-and-action in Enūma Eliš Tablet IV — Marduk's divine speech tests his power (a constellation appears and disappears at his word) before he proceeds to split Tiamat and form the cosmos",
      citation: "Enūma Eliš IV.19-26 (Lambert 2013)",
      language: "Akkadian",
      tradition: "babylonian",
      approximate_date: "Standard Babylonian (c. 1100 BCE)",
    },
    parallel_type: "structural",
    themes: ["creation_by_word", "cosmogonic_theology", "divine_speech", "supreme_god_promotion"],
    deities: ["Ptah", "Atum", "Marduk", "Ea"],
    texts: ["Memphite Theology", "Shabaka Stone", "Enūma Eliš"],
    correspondence_strength: "strong",
    scholarly_attribution: [
      {
        author_year: "Allen 1988",
        publication:
          "James P. Allen, Genesis in Egypt: The Philosophy of Ancient Egyptian Creation Accounts, Yale Egyptological Studies 2 (New Haven: Yale UP, 1988)",
        argument_summary:
          "Allen treats the Memphite Theology's heart-and-tongue creation as the most philosophically developed Egyptian creation account, comparing it to Mesopotamian theology where divine speech is also creative. Establishes the structural parallel between Egyptian Ptah-as-word-creator and Mesopotamian Marduk-as-word-creator.",
      },
      {
        author_year: "Assmann 2001",
        publication:
          "Jan Assmann, The Search for God in Ancient Egypt (Ithaca: Cornell UP, 2001; trans. David Lorton from 1984 German)",
        argument_summary:
          "Assmann treats the creation-by-word motif as a shared ANE theological move where one god is elevated to creator-supremacy via speech rather than physical action. The Memphite Theology and Enūma Eliš are placed in the same theological-political category: theology serving city-political consolidation through cosmogonic claims.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.9 Egyptian expansion — curated from Mesopotamia_Egypt_Comparative.md framework brief",
    },
    notes:
      "v0.9.0 Egyptian expansion. The Memphite Theology's heart-tongue creation is also the comparative anchor for the Genesis 1 fiat-creation parallel (see antediluvianParallels.json Genesis 1:1-3 entry) — both Mesopotamia↔Egypt and Egypt↔Hebrew triangulation through this structural pattern.",
  },
  {
    id: "mp-scribal-god-1",
    entity_a: {
      text: "Thoth (Egyptian) — god of writing, scribal craft, magical knowledge, the moon, and divine record-keeping. Patron of the *per-ankh* (House of Life) priestly institution. Often depicted as ibis or baboon. Records the Weighing of the Heart in BD Spell 125.",
      citation: "Pyramid Texts, Coffin Texts, Book of the Dead; Hornung 1982 + Mark Smith 2017",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Attested from Old Kingdom (c. 2400 BCE) onward; canonical scribal-god throughout Egyptian history",
    },
    entity_b: {
      text: "Nabu (Mesopotamian) — god of writing, scribal craft, and divine wisdom. Son of Marduk. Patron of the *bīt mummi* (scribal house). Often depicted with stylus and tablet. Records on the Tablet of Destinies.",
      citation: "Lambert 2013; ORACC AMGG entry on Nabu",
      language: "Akkadian",
      tradition: "babylonian",
      approximate_date: "Attested from Old Babylonian (c. 1700 BCE) onward; canonical scribal-god of late-Babylonian period",
    },
    parallel_type: "structural",
    themes: ["scribal_god", "wisdom", "divine_record_keeping"],
    deities: ["Thoth", "Nabu", "Marduk"],
    texts: ["Egyptian funerary corpus", "Babylonian scholarly texts"],
    correspondence_strength: "strong",
    scholarly_attribution: [
      {
        author_year: "Hornung 1982",
        publication:
          "Erik Hornung, Conceptions of God in Ancient Egypt: The One and the Many (Ithaca: Cornell UP, 1982; trans. John Baines from 1971 German)",
        argument_summary:
          "Hornung treats Thoth as the prototypical Egyptian scribal-wisdom god, structurally parallel to Mesopotamian Nabu — both are subordinate-but-central administrative gods within polytheistic systems organized around a supreme deity (Re/Marduk).",
      },
      {
        author_year: "Mark Smith 2010",
        publication:
          "Mark S. Smith, God in Translation: Deities in Cross-Cultural Discourse in the Biblical World, Forschungen zum Alten Testament 57 (Tübingen: Mohr Siebeck, 2008; reprint Eerdmans 2010)",
        argument_summary:
          "Discusses cross-cultural deity-equation (interpretatio graeca, interpretatio mesopotamica) and treats Thoth-Nabu as one of the cleanest scribal-god equations across ANE traditions. Both gods bridged via Hellenistic Hermes Trismegistus in Greco-Roman period.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.9 Egyptian expansion — curated from Mesopotamia_Egypt_Comparative.md framework brief",
    },
    notes:
      "v0.9.0 Egyptian expansion. Both gods are bridged via Hellenistic Hermes Trismegistus (Egyptian Hermetica corpus). See also Berossus.md for the Hellenistic Mesopotamian wisdom-god syncretism (Ea → Oannes → Hermes Trismegistus).",
  },
  {
    id: "mp-cosmic-order-1",
    entity_a: {
      text: "Egyptian Maat — cosmic order, truth, justice, harmony; the binding principle that all gods and humans must uphold; personified as goddess (daughter of Re) with feather-of-truth; weighed against the heart in BD Spell 125",
      citation: "BD Spell 125 (Faulkner 1985); Pyramid Texts and Coffin Texts substrate; Assmann 1990 Ma'at, Gerechtigkeit und Unsterblichkeit",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Continuous from Old Kingdom (c. 2400 BCE) onward",
    },
    entity_b: {
      text: "Sumerian me — cosmic ordinances, the divinely-decreed structures of civilization; held at Eridu by Enki; transferred to Inanna at Uruk in 'Inanna and Enki'; comprise institutions, professions, technologies, emotional states",
      citation: "Inanna and Enki (ETCSL 1.3.1); Farber-Flügge 1973 (foundational study)",
      language: "Sumerian",
      tradition: "sumerian",
      approximate_date: "Old Babylonian recension c. 1700 BCE; substrate likely older",
    },
    parallel_type: "structural",
    themes: ["cosmic_order", "organizing_principle", "ethical_substrate"],
    deities: ["Maat", "Enki", "Inanna", "Re"],
    texts: ["Book of the Dead Spell 125", "Inanna and Enki", "Coffin Texts"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Assmann 1990",
        publication:
          "Jan Assmann, Ma'at: Gerechtigkeit und Unsterblichkeit im Alten Ägypten (Munich: C.H. Beck, 1990)",
        argument_summary:
          "Foundational German monograph on Maat as Egyptian cosmic-order principle. Compares Maat to other ANE organizing-principle concepts including Mesopotamian me. Both are foundational organizing-principles for their respective theologies but differently structured: Maat is unitary cosmic-justice; me are plural civilizational ordinances.",
      },
      {
        author_year: "Mark Smith 2010",
        publication:
          "Mark S. Smith, God in Translation: Deities in Cross-Cultural Discourse in the Biblical World (Tübingen: Mohr Siebeck / Eerdmans 2010)",
        argument_summary:
          "Discusses Maat and me as structurally comparable cosmic-order concepts within their respective ANE theological systems, though differing in scope and personification.",
      },
    ],
    transmission_hypothesis: "independent_typological_match",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.9 Egyptian expansion — curated from Mesopotamia_Egypt_Comparative.md framework brief",
    },
    notes:
      "v0.9.0 Egyptian expansion. Differences are as load-bearing as similarities: Maat is unitary cosmic-justice personified as goddess; me are plural civilizational ordinances held as objects. Both organize their respective cosmologies but at different scales and granularities.",
  },
  {
    id: "mp-royal-renewal-1",
    entity_a: {
      text: "Egyptian Sed-festival (Heb-Sed) — royal jubilee ritual celebrated at intervals (traditionally 30 years after coronation, then every 3 years); pharaoh's authority renewed through ritual race + recrowning ceremony",
      citation: "Hornung 1992 Idea into Image; various tomb and temple reliefs",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Attested from Old Kingdom (1st Dynasty) onward",
    },
    entity_b: {
      text: "Babylonian Akitu festival — annual New Year ritual at Babylon, 12 days in Nisannu; king's authority renewed before Marduk's cult statue; the king is ritually 'slapped' and 'humiliated' as part of authority-renewal; Enūma Eliš recited on day 4",
      citation: "Bidmead 2002 The Akītu Festival; Black 1981 Religion 11",
      language: "Akkadian",
      tradition: "babylonian",
      approximate_date: "Attested throughout 2nd-1st millennium BCE",
    },
    parallel_type: "structural",
    themes: ["royal_renewal", "ritual_authority", "cyclical_kingship"],
    deities: ["Re", "Marduk"],
    texts: ["Sed-festival reliefs", "Akitu ritual texts", "Enūma Eliš"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Hornung 1992",
        publication:
          "Erik Hornung, Idea into Image: Essays on Ancient Egyptian Thought (New York: Timken, 1992; trans. Elizabeth Bredeck from 1989 German Geist der Pharaonenzeit)",
        argument_summary:
          "Hornung treats the Sed-festival as the Egyptian royal-renewal ritual paralleling but distinct from ANE neighbors. Notes the Mesopotamian Akitu as the closest comparative parallel: both renew royal authority through ritual + cosmogonic recitation. Differs from Akitu in absence of king-humiliation element.",
      },
      {
        author_year: "Bidmead 2002",
        publication:
          "Julye Bidmead, The Akītu Festival: Religious Continuity and Royal Legitimation in Mesopotamia (Piscataway, NJ: Gorgias Press, 2002)",
        argument_summary:
          "Bidmead 2002 explicitly compares the Akitu to Egyptian Sed-festival as parallel royal-legitimation rituals, while moving away from older Frankfort/Hooke myth-and-ritual readings that overstated the cosmogonic dying-and-rising-god framework.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.9 Egyptian expansion — curated from Mesopotamia_Egypt_Comparative.md framework brief",
    },
    notes:
      "v0.9.0 Egyptian expansion. Note: the older myth-and-ritual reading (Frankfort, Hooke) overstated the cosmogonic-renewal dimension. Current consensus (Bidmead 2002, Hornung 1992) treats both rituals as political-theological royal-legitimation rituals with distinct mechanisms — Sed-festival emphasizes recrowning; Akitu emphasizes king-humiliation-and-renewal.",
  },
];

// =============================================================================
// antediluvianParallels.json — 3 new Egypt↔Hebrew parallels
// =============================================================================

const newAntediluvianQueries = [
  {
    query_match: {
      text_id: "genesis",
      passages: ["Psalm 104:1-35"],
      topics: ["aten_hymn_parallel", "creation_hymn", "monotheist_doxology"],
    },
    passage_text:
      "Bless Jehovah, O my soul. O Jehovah my God, thou art very great; Thou art clothed with honor and majesty: Who coverest thyself with light as with a garment; Who stretchest out the heavens like a curtain... O Jehovah, how manifold are thy works! In wisdom hast thou made them all: The earth is full of thy riches.",
    passage_translator: "ASV 1901 — Psalm 104:1-2, 24",
    results: [
      {
        mesopotamian_source: {
          text: "The Great Hymn to the Aten (composed under Akhenaten c. 1353-1336 BCE; inscribed in the tomb of Ay at Akhetaten / modern Amarna)",
          citation: "Murnane 1995 Texts from the Amarna Period (SBL WAW 5); Lichtheim 1976 Ancient Egyptian Literature Vol. 2",
          language: "Egyptian",
          approximate_date: "Amarna period c. 1353-1336 BCE",
        },
        parallel_type: "lexical",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Breasted 1905/1933",
            publication:
              "James Henry Breasted, A History of Egypt (London: Hodder & Stoughton, 1905); also Dawn of Conscience (New York: Scribner's, 1933)",
            argument_summary:
              "Original argument that the Great Hymn to the Aten directly influenced Psalm 104 via Egyptian-Hebrew religious-historical contact. Breasted's reading was that the Hymn's specific phrases ('How manifold are your works!' / 'You make the seasons') were borrowed by the Israelite psalmist. Subsequent scholarship has refined this to a more nuanced shared-substrate position.",
          },
          {
            author_year: "Assmann 1997",
            publication:
              "Jan Assmann, Moses the Egyptian: The Memory of Egypt in Western Monotheism (Cambridge MA: Harvard UP, 1997)",
            argument_summary:
              "Refines Breasted's thesis. Argues the Aten-Psalm 104 parallel reflects common Ancient Near Eastern hymnic conventions and shared religious vocabulary rather than direct Hebrew borrowing from Egyptian text. The 'Mosaic distinction' (monotheism vs polytheism) is a later Israelite theological development; both texts participate in pre-distinction ANE religious discourse.",
          },
          {
            author_year: "Hoffmeier 2015",
            publication:
              "James K. Hoffmeier, Akhenaten and the Origins of Monotheism (Oxford: Oxford UP, 2015)",
            argument_summary:
              "Modern synthesis: confirms specific phraseological parallels between the Aten Hymn and Psalm 104 are real but argues for shared ANE substrate rather than direct borrowing. Reads Atenism as one ANE expression of incipient monotheist tendencies, with Israelite religion as another later expression of the same trajectory.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.9.0 Egyptian expansion (2026-05-15). The Aten Hymn ↔ Psalm 104 parallel is the most-cited single Egypt↔Hebrew Bible parallel in comparative-religion scholarship. Modern consensus has moved from Breasted's direct-borrowing position to a shared-substrate framing (Assmann 1997, Hoffmeier 2015), but the specific phraseological parallels remain documented and load-bearing.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Genesis 1:1-31"],
      topics: ["fiat_creation", "creation_by_word", "cosmogonic_theology"],
    },
    passage_text:
      "In the beginning God created the heavens and the earth... And God said, Let there be light: and there was light. And God saw the light, that it was good: and God divided the light from the darkness... And God said, Let there be a firmament in the midst of the waters, and let it divide the waters from the waters... And God said, Let the earth bring forth living creatures after their kind...",
    passage_translator: "ASV 1901 — Genesis 1:1, 3-4, 6, 24",
    results: [
      {
        mesopotamian_source: {
          text: "Memphite Theology — Ptah of Memphis creates by heart (conception) and tongue (articulation); the world arises by divine word",
          citation: "Shabaka Stone, BM EA 498 (Allen 1988; Sethe 1928)",
          language: "Egyptian",
          approximate_date: "Inscribed c. 716 BCE; theology arguably older",
        },
        parallel_type: "structural",
        correspondence_strength: "moderate",
        scholarly_attribution: [
          {
            author_year: "Allen 1988",
            publication:
              "James P. Allen, Genesis in Egypt: The Philosophy of Ancient Egyptian Creation Accounts, Yale Egyptological Studies 2 (New Haven: Yale UP, 1988)",
            argument_summary:
              "Allen treats the Memphite Theology's heart-and-tongue creation as the most philosophically developed Egyptian creation account. The Egyptian-Hebrew Genesis-1-fiat-creation parallel is one of the cleanest cross-tradition theological parallels: both texts present cosmogony as result of divine speech.",
          },
          {
            author_year: "Hoffmeier 1996",
            publication:
              "James K. Hoffmeier, Israel in Egypt: The Evidence for the Authenticity of the Exodus Tradition (New York: Oxford UP, 1996)",
            argument_summary:
              "Treats the Genesis 1 fiat-creation as drawing from broader ANE creation-by-word substrate of which the Memphite Theology is the most-developed Egyptian example. Argues for shared substrate rather than direct dependence.",
          },
          {
            author_year: "Hoffmeier 2015",
            publication:
              "James K. Hoffmeier, Akhenaten and the Origins of Monotheism (Oxford: Oxford UP, 2015)",
            argument_summary:
              "Extends the comparative argument: notes that creation-by-word is more distinctively Egyptian than Mesopotamian among ANE cosmogonies. The Genesis 1 P-source author was likely aware of this Egyptian tradition through ongoing Egyptian-Israelite cultural contact.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.9.0 Egyptian expansion (2026-05-15). The Memphite Theology ↔ Genesis 1 parallel triangulates with the Mesopotamia↔Egypt parallel (Memphite ↔ Enūma Eliš — see mesopotamianParallels.json mp-creation-by-word-1). Three-way comparison: Memphite ↔ Enūma Eliš ↔ Genesis 1 as instantiations of cosmogonic-creation-by-word across three ANE traditions.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Exodus 20:1-17", "Deuteronomy 5:6-21"],
      topics: ["decalogue", "negative_confession", "ethical_codes"],
    },
    passage_text:
      "And God spake all these words, saying, I am Jehovah thy God, who brought thee out of the land of Egypt, out of the house of bondage. Thou shalt have no other gods before me... Thou shalt not kill. Thou shalt not commit adultery. Thou shalt not steal. Thou shalt not bear false witness against thy neighbor.",
    passage_translator: "ASV 1901 — Exodus 20:1-3, 13-16",
    results: [
      {
        mesopotamian_source: {
          text: "Book of the Dead Spell 125 — the 42 Negative Confessions recited before the 42 judge-gods during the Weighing of the Heart ('I have not killed; I have not stolen; I have not committed adultery; I have not cursed god...')",
          citation: "BD Spell 125 (Faulkner 1985; Hornung 1992 Idea into Image)",
          language: "Egyptian",
          approximate_date: "New Kingdom (c. 1550 BCE onward); inscribed on funerary papyri including Papyrus of Ani (BM EA 10470)",
        },
        parallel_type: "structural",
        correspondence_strength: "moderate",
        scholarly_attribution: [
          {
            author_year: "Hoffmeier 1996",
            publication:
              "James K. Hoffmeier, Israel in Egypt: The Evidence for the Authenticity of the Exodus Tradition (New York: Oxford UP, 1996)",
            argument_summary:
              "Compares Egyptian Negative Confession (BD Spell 125) with Hebrew Decalogue and Levitical purity codes. Both texts share specific ethical-religious prohibitions (killing, theft, adultery, false witness) framed as the violator's accountability before divine judgment. Argues for shared ANE ethical-religious substrate rather than direct borrowing.",
          },
          {
            author_year: "Assmann 2001",
            publication:
              "Jan Assmann, The Search for God in Ancient Egypt (Ithaca: Cornell UP, 2001; trans. David Lorton from 1984 German)",
            argument_summary:
              "Treats the Negative Confession as the Egyptian expression of cosmic-justice (Maat) accountability — structurally parallel to Israelite covenant-ethics (the Decalogue framed as the conditions of covenant fidelity). Both texts assume divine judgment based on ethical-religious behavior; both list specific prohibitions; both function within a cosmic-order theological framework.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.9.0 Egyptian expansion (2026-05-15). The Negative Confession ↔ Decalogue parallel is one of the most-cited Egypt↔Hebrew Bible ethical-religious parallels. Note: the comparison is structural (judgment-by-ethical-criteria) rather than direct literary borrowing. Specific shared prohibitions (killing, theft, adultery, false witness) are well-attested in both texts but reflect common ANE ethical-religious vocabulary rather than direct dependence.",
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

mp._meta.v0_9_0_egyptian_expansion = {
  date: "2026-05-15",
  new_parallels_added: newMesopotamianParallels.length,
  source: "Mesopotamia_Egypt_Comparative.md framework brief (Tier-1 + Tier-2 recommendations)",
};
ap._meta.v0_9_0_egyptian_expansion = {
  date: "2026-05-15",
  new_queries_added: newAntediluvianQueries.length,
  source: "Mesopotamia_Egypt_Comparative.md framework brief (Hebrew↔Egyptian Tier-1 recommendations)",
};

writeFileSync(MP_PATH, JSON.stringify(mp, null, 2) + "\n");
writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

console.log("v0.9.0 Egyptian expansion applied.");
console.log(`  mesopotamianParallels.json:`);
console.log(`    +${newMesopotamianParallels.length} Mesopotamia↔Egypt parallels`);
console.log(`    total entries: ${mp.parallels.length}`);
console.log(`  antediluvianParallels.json:`);
console.log(`    +${newAntediluvianQueries.length} Egypt↔Hebrew query entries`);
console.log(`    total query entries: ${ap.parallels.length}`);
console.log(`    total result entries: ${ap.parallels.reduce((s, p) => s + p.results.length, 0)}`);
