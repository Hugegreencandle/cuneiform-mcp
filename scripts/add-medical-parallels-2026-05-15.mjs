// Phase 3 of v0.10.0 Medical expansion: adds Tier-1 medical parallels from
// the Mesopotamia_Medical_Comparative.md framework brief into the MCP datasets.
//
// 4 entries to mesopotamianParallels.json (Mesopotamia↔Egypt + Mesopotamia↔Greek medical).
// 3 entries to antediluvianParallels.json (Hebrew-anchored medical parallels).
// All anchor to named scholars per the discipline.

import { readFileSync, writeFileSync } from "node:fs";

const MP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/mesopotamianParallels.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const mp = JSON.parse(readFileSync(MP_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

// =============================================================================
// mesopotamianParallels.json — 4 new medical-tradition parallels
// =============================================================================

const newMesopotamianParallels = [
  {
    id: "mp-named-physician-1",
    entity_a: {
      text: "Esagil-kīn-apli — Babylonian court physician under Adad-apla-iddina (c. 1067-1046 BCE); attributed authorship of the Diagnostic Handbook (sa-gig) + the Alamdimmû physiognomic-prognostic series. The 'Mesopotamian Hippocrates' — named scholar whose canonical recension was studied by subsequent generations of asû practitioners.",
      citation: "Heeßel 2000 Babylonisch-assyrische Diagnostik (AOAT 43); Scurlock 2014 Sourcebook (SBL WAW 36); Schmidtchen 2018",
      language: "Akkadian",
      tradition: "babylonian",
      approximate_date: "c. 1067-1046 BCE (reign of Adad-apla-iddina)",
    },
    entity_b: {
      text: "Imhotep — Egyptian polymath under Djoser (3rd Dynasty, c. 2650 BCE); architect of the Step Pyramid, chief physician, later deified as healer-god (Hellenistic period equated with Asclepius). The 'Egyptian Hippocrates' — the foundational named figure of Egyptian medicine.",
      citation: "Hurry 1928 Imhotep (Oxford UP); Nunn 1996 Ancient Egyptian Medicine; Stevens 1975",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "3rd Dynasty c. 2650 BCE; deified c. Late Period; equated with Asclepius in Hellenistic period",
    },
    parallel_type: "structural",
    themes: ["named_authorship", "named_medical_author", "canonical_recension", "deified_physician"],
    deities: ["Imhotep", "Gula", "Asclepius", "Marduk"],
    texts: ["Diagnostic Handbook (sa-gig)", "Alamdimmû"],
    correspondence_strength: "strong",
    scholarly_attribution: [
      {
        author_year: "Scurlock 2014",
        publication:
          "JoAnn Scurlock, Sourcebook for Ancient Mesopotamian Medicine, SBL Writings from the Ancient World 36 (Atlanta: SBL Press, 2014)",
        argument_summary:
          "Treats Esagil-kīn-apli as the Mesopotamian counterpart to Imhotep — both named ANE physician-figures whose canonical works became the standard medical references for their respective traditions. Esagil-kīn-apli's c. 1067 BCE recension of sa-gig sets the canonical Mesopotamian diagnostic framework; Imhotep's legacy (transmitted through subsequent Egyptian medical tradition) sets the Egyptian framework. Both later deified in their respective religious contexts (Imhotep formally; Esagil-kīn-apli scholarly-revered).",
      },
      {
        author_year: "Nunn 1996",
        publication:
          "John F. Nunn, Ancient Egyptian Medicine (Norman, OK: University of Oklahoma Press, 1996)",
        argument_summary:
          "Discusses Imhotep as the canonical named-physician of Egyptian tradition; the structural parallel to Mesopotamian named-physician tradition (Esagil-kīn-apli) is widely noted in comparative ANE medical scholarship.",
      },
      {
        author_year: "Geller 2010",
        publication:
          "Markham J. Geller, Ancient Babylonian Medicine: Theory and Practice (Chichester: Wiley-Blackwell, 2010)",
        argument_summary:
          "Treats the named-author tradition in Mesopotamian and Egyptian medicine as a shared ANE pattern: medicine systematized via canonical author-attributed works (Esagil-kīn-apli + Imhotep) parallel to scribal-literary tradition (Enheduanna + Kabti-ilāni-Marduk).",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.10 Medical expansion — Mesopotamia_Medical_Comparative.md Tier-1 recommendation",
    },
    notes:
      "v0.10.0 Medical expansion. Extends the cluster's named-authorship axis: Enheduanna c. 2300 BCE (Mesopotamian-internal mp-named-authorship-1) → Imhotep c. 2650 BCE (Egyptian, deified) → Esagil-kīn-apli c. 1067 BCE (Mesopotamian, canonical recension) → Kabti-ilāni-Marduk c. 765 BCE → eventually Hippocrates c. 460-370 BCE (Greek). The named-physician tradition is one of the cleanest cross-tradition structural patterns in ANE intellectual history.",
  },
  {
    id: "mp-healing-deity-1",
    entity_a: {
      text: "Gula / Ninkarrak / Bau — Mesopotamian healing goddess; depicted with dog-attribute; patron of the asû profession. Cult centers at Isin and Nippur. Combines healing (illness-curing) and disease-causing (illness-inflicting) attributes — ambivalent patroness of the medical profession.",
      citation: "Black & Green 1992; Scurlock 2014; Avalos 1995",
      language: "Akkadian",
      tradition: "akkadian",
      approximate_date: "Attested from Sumerian period (c. 2500 BCE) onward; major cult c. 2000-500 BCE",
    },
    entity_b: {
      text: "Sekhmet — Egyptian healing goddess; depicted as lioness; patron of physicians (swnw). Combines healing (illness-curing) and disease-causing (lion-headed plague-bringer) attributes — ambivalent patroness of medicine. Cult center at Memphis.",
      citation: "Hornung 1982; Nunn 1996; Stevens 1975",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Attested from Old Kingdom (c. 2500 BCE) onward; major cult throughout Egyptian history",
    },
    parallel_type: "structural",
    themes: ["healing_goddess", "ambivalent_deity", "medical_patron"],
    deities: ["Gula", "Ninkarrak", "Bau", "Sekhmet"],
    texts: ["Sumerian + Akkadian medical incantations", "Egyptian medical papyri"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Hornung 1982",
        publication:
          "Erik Hornung, Conceptions of God in Ancient Egypt: The One and the Many (Ithaca: Cornell UP, 1982; trans. John Baines from 1971 German)",
        argument_summary:
          "Treats Sekhmet as the prototypical Egyptian ambivalent-healing-goddess — both source of plague AND source of healing. Notes the structural parallel to Mesopotamian Gula tradition: both healing-goddesses combine illness-causation with illness-cure, both are patrons of medical practitioners, both have specific animal attributes (Sekhmet lioness; Gula dog).",
      },
      {
        author_year: "Avalos 1995",
        publication:
          "Hector Avalos, Illness and Health Care in the Ancient Near East: The Role of the Temple in Greece, Mesopotamia, and Israel (Atlanta: Scholars Press, 1995)",
        argument_summary:
          "Comparative-ANE study treating healing deities (Gula, Sekhmet, Asclepius) as parallel instances of temple-mediated medical practice. The ambivalent healing-deity (causing-and-curing) is a recurring ANE pattern.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.10 Medical expansion — Mesopotamia_Medical_Comparative.md Tier-1 recommendation",
    },
    notes:
      "v0.10.0 Medical expansion. Both deities share: ambivalent healing/plague duality; cult-center medical institutions; named animal attributes; patron-role for medical practitioners. Differs from Asclepius (Greek) which is unambiguously positive-healing.",
  },
  {
    id: "mp-dual-track-medicine-1",
    entity_a: {
      text: "Mesopotamian dual-track medicine: asû (empirical doctor, pharmacological/surgical, patron deity Gula) + āšipu (exorcist-priest, ritual/incantation, patron deity Asalluḫi/Marduk). Both professions used the same Diagnostic Handbook but applied different therapeutic frameworks. Modern consensus (Scurlock 2014, Geller 2010): complementary not opposed.",
      citation: "Scurlock 2014; Geller 2010; Lenzi 2008",
      language: "Akkadian",
      tradition: "akkadian",
      approximate_date: "Continuous attestation c. 2000 BCE - 100 CE",
    },
    entity_b: {
      text: "Egyptian dual-track medicine: swnw (empirical doctor, pharmacological/surgical, patron deity Sekhmet) + sau (priest-magician, ritual/incantation, patron deity Isis/Thoth). Both professions used the Ebers Papyrus + medical corpus; structurally parallel to Mesopotamian asû/āšipu split.",
      citation: "Nunn 1996; Westendorf 1999; Stevens 1975",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Continuous attestation c. 2500 BCE - 200 CE",
    },
    parallel_type: "structural",
    themes: ["dual_track_medicine", "medical_professions", "empirical_ritual_complement"],
    deities: ["Gula", "Asalluḫi", "Marduk", "Sekhmet", "Isis", "Thoth"],
    texts: ["Diagnostic Handbook", "BAM", "Ebers Papyrus", "Edwin Smith Papyrus"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Scurlock 2014",
        publication:
          "JoAnn Scurlock, Sourcebook for Ancient Mesopotamian Medicine (SBL WAW 36; 2014)",
        argument_summary:
          "Treats Mesopotamian asû/āšipu dual-track as structurally parallel to Egyptian swnw/sau dual-track. Both ANE medical traditions deployed complementary empirical + ritual practitioners with shared canonical texts but distinct therapeutic frameworks. Modern consensus rejects older empirical-vs-magical opposition in favor of complementarity.",
      },
      {
        author_year: "Nunn 1996",
        publication:
          "John F. Nunn, Ancient Egyptian Medicine (Univ. of Oklahoma Press, 1996)",
        argument_summary:
          "Documents the Egyptian swnw/sau dual-track and notes its structural parallel to Mesopotamian medical professional structure. Both traditions integrate empirical (pharmacological/surgical) and ritual (magical/incantational) approaches within a single medical-professional system.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.10 Medical expansion — Mesopotamia_Medical_Comparative.md Tier-2 recommendation",
    },
    notes:
      "v0.10.0 Medical expansion. Both traditions share: paired empirical + ritual practitioners; shared canonical text-base; distinct therapeutic frameworks within single medical system; named patron deities for each track. Differs from Greek (Hippocratic) tradition which moved toward unified naturalistic medicine, explicitly opposing 'sacred-disease' framings.",
  },
  {
    id: "mp-asipu-healing-deity-1",
    entity_a: {
      text: "Asalluḫi — Mesopotamian exorcist-healer god; son of Ea; later syncretized with Marduk. Patron of the āšipu profession. Magical-medical incantation-formula authority. Invoked in Bīt Mēseri + Maqlû + Šurpu ritual series for therapeutic + apotropaic purposes.",
      citation: "Wiggermann 1992; Geller 2010; ORACC AMGG entry on Asalluḫi",
      language: "Akkadian",
      tradition: "akkadian",
      approximate_date: "Attested from Old Babylonian (c. 1700 BCE); merged with Marduk by Kassite period",
    },
    entity_b: {
      text: "Asclepius — Greek healing god; son of Apollo; staff with single serpent (the canonical medical-profession symbol). Asclepieia healing temples across Greco-Roman world. Combines divine-healing-power with named-physician-tradition (Hippocrates traced lineage to Asclepius).",
      citation: "Edelstein & Edelstein 1945 Asclepius (Johns Hopkins UP); Hart 2000",
      language: "Greek",
      tradition: "hellenistic_egyptian",
      approximate_date: "Greek attestation c. 700 BCE onward; Asclepieia cult flourished 500 BCE - 400 CE",
    },
    parallel_type: "structural",
    themes: ["healing_deity_succession", "medical_lineage", "divine_healer"],
    deities: ["Asalluḫi", "Marduk", "Ea", "Asclepius", "Apollo"],
    texts: ["Bīt Mēseri", "Maqlû", "Šurpu", "Asclepieia inscriptions"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Geller 2010",
        publication:
          "Markham J. Geller, Ancient Babylonian Medicine: Theory and Practice (Wiley-Blackwell, 2010)",
        argument_summary:
          "Discusses Mesopotamian Asalluḫi as the prototypical exorcist-healer god whose ritual-medical authority structurally parallels later Greek Asclepius. Both gods are son-of-supreme-deity figures who become specialized medical-divine patrons; both have associated healing-temple traditions (Mesopotamian Esagila + Eanna therapeutic ritual; Greek Asclepieia).",
      },
      {
        author_year: "Avalos 1995",
        publication:
          "Hector Avalos, Illness and Health Care in the Ancient Near East (Atlanta: Scholars Press, 1995)",
        argument_summary:
          "Cross-ANE study of temple-mediated healing. Treats Mesopotamian Asalluḫi tradition + Greek Asclepieia + Israelite temple-medical-purity as parallel instances of religiously-mediated medical practice.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.10 Medical expansion — Mesopotamia_Medical_Comparative.md Tier-3 (structural-only)",
    },
    notes:
      "v0.10.0 Medical expansion. Marked correspondence_strength as moderate because the typological parallel is real but direct genealogical transmission (Mesopotamia → Greece) is debated. Geller 2010 favors substrate influence; Edelstein & Edelstein 1945 emphasizes Greek-internal development. Both positions accept the structural-parallel framework.",
  },
];

// =============================================================================
// antediluvianParallels.json — 3 new Egypt↔Hebrew + Mesopotamia↔Hebrew medical parallels
// =============================================================================

const newAntediluvianQueries = [
  {
    query_match: {
      text_id: "genesis",
      passages: ["Leviticus 13:1-46", "Leviticus 14:1-32"],
      topics: ["sarat_diagnosis", "priestly_diagnosis", "skin_disease_classification"],
    },
    passage_text:
      "And Jehovah spake unto Moses and unto Aaron, saying, When a man shall have in the skin of his flesh a rising, or a scab, or a bright spot, and it become in the skin of his flesh the plague of leprosy [ṣāraʿat], then he shall be brought unto Aaron the priest, or unto one of his sons the priests: and the priest shall look on the plague in the skin of the flesh: and if the hair in the plague be turned white, and the appearance of the plague be deeper than the skin of his flesh, it is the plague of leprosy [ṣāraʿat]; and the priest shall look on him, and pronounce him unclean.",
    passage_translator: "ASV 1901 — Leviticus 13:1-3",
    results: [
      {
        mesopotamian_source: {
          text: "Diagnostic Handbook (sa-gig) skin-disease entries — Tablets 33-35 cover dermatological conditions with detailed symptom-list + prognosis. The diagnostic format ('If a man's skin shows X, it is the hand of Y, he will Z') structurally parallels the Levitical priestly-diagnosis procedure.",
          citation: "Diagnostic Handbook Tablets 33-35 (Heeßel 2000 AOAT 43; Scurlock 2014 SBL WAW 36)",
          language: "Akkadian",
          approximate_date: "Esagil-kīn-apli's recension c. 1067 BCE; substrate older",
        },
        parallel_type: "structural",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Milgrom 1991",
            publication:
              "Jacob Milgrom, Leviticus 1-16: A New Translation with Introduction and Commentary, Anchor Bible 3 (New York: Doubleday, 1991)",
            argument_summary:
              "The standard modern commentary on Leviticus 13-14. Treats the priestly diagnostic procedure as a Hebrew-tradition counterpart to Mesopotamian medical diagnostic procedure, both following the structural format 'if A then B (impurity/affliction classification).' The Hebrew text reorients the diagnostic frame around purity/impurity rather than divine-affliction, but the symptom-classification-by-priest-or-physician structural pattern is consistent.",
          },
          {
            author_year: "Hoffmeier 1996",
            publication:
              "James K. Hoffmeier, Israel in Egypt: The Evidence for the Authenticity of the Exodus Tradition (New York: Oxford UP, 1996)",
            argument_summary:
              "Discusses Levitical skin-disease diagnosis in the context of broader ANE medical-diagnostic tradition. Both Egyptian (Ebers Papyrus skin-disease section) and Mesopotamian (Diagnostic Handbook Tablets 33-35) parallel the Levitical priestly-diagnostic procedure structurally, though Hebrew framing emphasizes ritual purity and Mesopotamian framing emphasizes divine-affliction attribution.",
          },
          {
            author_year: "Scurlock 2014",
            publication:
              "JoAnn Scurlock, Sourcebook for Ancient Mesopotamian Medicine (SBL WAW 36; 2014)",
            argument_summary:
              "Translates and analyzes the Diagnostic Handbook skin-disease entries; notes the structural parallel to Levitical diagnostic procedure as one of the cleanest Mesopotamia↔Hebrew medical-text parallels.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.10.0 Medical expansion (2026-05-15). The Hebrew priest's diagnostic role parallels the Mesopotamian āšipu's diagnostic role (both invoke divine authority to classify the affliction). The 'isolation period' in Levitical procedure (7-day observation) parallels Mesopotamian Diagnostic Handbook daily-prognostic Tablets 15-25. Note: ṣāraʿat is traditionally translated 'leprosy' but modern scholarship (Milgrom 1991) prefers 'scaly skin disease' to avoid the modern Hansen's-disease connotation.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Job 1:1-42:17"],
      topics: ["theodicy", "righteous_suffering", "divine_test", "restoration_after_affliction"],
    },
    passage_text:
      "There was a man in the land of Uz, whose name was Job; and that man was perfect and upright, and one that feared God, and turned away from evil... So the LORD said unto Satan, Behold, all that he hath is in thy power; only upon himself put not forth thy hand. So Satan went forth from the presence of the LORD. Then there came a messenger unto Job, and said... And Job arose, and rent his robe, and shaved his head, and fell down upon the ground, and worshipped; and he said, Naked came I out of my mother's womb, and naked shall I return thither: the LORD gave, and the LORD hath taken away; blessed be the name of the LORD.",
    passage_translator: "ASV 1901 — Job 1:1, 12, 14, 20-21 (composite)",
    results: [
      {
        mesopotamian_source: {
          text: "Ludlul bēl nēmeqi ('I will praise the Lord of Wisdom') — Babylonian first-person poetic narrative attributed to a Kassite-period (c. 1300 BCE) Babylonian official Shubshi-meshre-Sakkan. Four-tablet composition. Sufferer is struck by mysterious physical + mental + social illness; abandoned by family + colleagues + gods; eventually restored by Marduk's intervention. The Mesopotamian psychological autobiography of righteous suffering.",
          citation: "Ludlul bēl nēmeqi Tablets I-IV (Lambert 1960 Babylonian Wisdom Literature; modern translation Foster 2005 Before the Muses)",
          language: "Akkadian",
          approximate_date: "Kassite period c. 1300 BCE; 66+ surviving manuscript fragments",
        },
        parallel_type: "structural",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Lambert 1960",
            publication:
              "W.G. Lambert, Babylonian Wisdom Literature (Oxford: Clarendon Press, 1960; reprint Eisenbrauns 1996)",
            argument_summary:
              "The foundational critical edition + translation of Ludlul bēl nēmeqi. Lambert explicitly identifies the structural parallel between Ludlul and the biblical Book of Job: both present a righteous sufferer struck by inexplicable affliction, abandoned by community + supposed friends, who eventually receives divine restoration. Both texts engage the theodicy problem (why do the righteous suffer?). Becomes the canonical 'Babylonian Job' identification in subsequent scholarship.",
          },
          {
            author_year: "Hartley 1988",
            publication:
              "John E. Hartley, The Book of Job, New International Commentary on the Old Testament (Grand Rapids: Eerdmans, 1988)",
            argument_summary:
              "Standard modern Job commentary. Treats Ludlul bēl nēmeqi as one of the principal ANE comparative-literary references for Job. Notes specific structural parallels: divine wager / test framework, physical + social suffering, dialogue with interlocutors, restoration through divine intervention. Argues for shared ANE theodicy substrate rather than direct literary borrowing.",
          },
          {
            author_year: "Annus & Lenzi 2010",
            publication:
              "Amar Annus & Alan Lenzi, Ludlul bēl nēmeqi: The Standard Babylonian Poem of the Righteous Sufferer, State Archives of Assyria Cuneiform Texts 7 (Helsinki: Neo-Assyrian Text Corpus Project, 2010)",
            argument_summary:
              "Modern critical edition reflecting 50+ years of subsequent manuscript discoveries since Lambert 1960. Confirms the Job comparative framework; the Ludlul text has substantial new material that strengthens specific Job parallels (the 'naked I came / naked I return' motif appears in Ludlul II.51-52 in a form Lambert 1960 didn't have).",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.10.0 Medical expansion (2026-05-15). One of the most-cited single ANE↔Hebrew Bible parallels. Both texts present a 'medical' dimension (physical illness as part of the test) alongside the theological/social dimensions. The Mesopotamian framing (Marduk's anger + restoration) and Hebrew framing (YHWH's wager with Satan + restoration) reflect different theological cosmologies but parallel narrative structures.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["1 Samuel 16:14-23"],
      topics: ["evil_spirit", "demonic_affliction", "music_therapy", "mental_illness"],
    },
    passage_text:
      "Now the Spirit of Jehovah had departed from Saul, and an evil spirit from Jehovah troubled him. And Saul's servants said unto him, Behold now, an evil spirit from God troubleth thee. Let our lord now command thy servants, that are before thee, to seek out a man who is a skilful player on the harp: and it shall come to pass, when the evil spirit from God is upon thee, that he shall play with his hand, and thou shalt be well... And it came to pass, when the evil spirit from God was upon Saul, that David took the harp, and played with his hand: so Saul was refreshed, and was well, and the evil spirit departed from him.",
    passage_translator: "ASV 1901 — 1 Samuel 16:14-16, 23",
    results: [
      {
        mesopotamian_source: {
          text: "Eṭemmu-affliction tradition — the Mesopotamian medical category in which mental disturbance + somatic illness is attributed to the 'hand of the ghost' (qāt eṭemmi); ghost (eṭemmu) of a dead person attaches to a living person, causing mental + physical symptoms. Treatment is apotropaic (Bīt Mēseri ritual) + therapeutic (specific incantations to release the ghost). Music-as-therapy attested in Mesopotamian medical context (specific instruments invoked in healing rituals).",
          citation: "JoAnn Scurlock 2006 Magico-Medical Means of Treating Ghost-Induced Illnesses in Ancient Mesopotamia (AMD 3, Brill/Styx)",
          language: "Akkadian",
          approximate_date: "Continuous attestation c. 2000 BCE - 200 CE",
        },
        parallel_type: "structural",
        correspondence_strength: "moderate",
        scholarly_attribution: [
          {
            author_year: "Scurlock 2006",
            publication:
              "JoAnn Scurlock, Magico-Medical Means of Treating Ghost-Induced Illnesses in Ancient Mesopotamia, Ancient Magic and Divination 3 (Leiden: Brill/Styx, 2006)",
            argument_summary:
              "Comprehensive study of Mesopotamian eṭemmu-affliction medical category. Notes structural parallels to Hebrew Bible 'evil spirit' (rûaḥ rāʿâ) tradition (1 Samuel 16:14, 18:10; 1 Kings 22:21-23). Both traditions: attribute mental disturbance to discrete entity attaching to person; recommend specific therapeutic interventions including music; understand the affliction as removable through correct intervention.",
          },
          {
            author_year: "Scurlock 2014",
            publication:
              "JoAnn Scurlock, Sourcebook for Ancient Mesopotamian Medicine (SBL WAW 36; 2014)",
            argument_summary:
              "Notes the structural parallel between Mesopotamian eṭemmu-affliction medical category and biblical 'evil spirit' affliction (especially Saul in 1 Samuel 16). Music-as-therapy (David's harp) parallels Mesopotamian use of specific instruments in healing rituals.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.10.0 Medical expansion (2026-05-15). The 1 Samuel passage is one of the cleanest biblical texts showing influence of broader ANE 'spirit-attribution' medical framework. Both Mesopotamian eṭemmu-tradition and Hebrew Bible 'evil spirit' tradition share: attribution of mental affliction to discrete spirit-entity; specific therapeutic interventions; recognition that affliction is removable. The Hebrew text is theologically distinctive in attributing the 'evil spirit' to YHWH ('from Jehovah') rather than to a discrete demon; the Mesopotamian text attributes eṭemmu-affliction to the unincorporated ghost of the dead.",
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

mp._meta.v0_10_0_medical_expansion = {
  date: "2026-05-15",
  new_parallels_added: newMesopotamianParallels.length,
  source: "Mesopotamia_Medical_Comparative.md framework brief (Tier-1 + Tier-2 + Tier-3 recommendations)",
};
ap._meta.v0_10_0_medical_expansion = {
  date: "2026-05-15",
  new_queries_added: newAntediluvianQueries.length,
  source: "Mesopotamia_Medical_Comparative.md framework brief (Hebrew-anchored medical parallels)",
};

writeFileSync(MP_PATH, JSON.stringify(mp, null, 2) + "\n");
writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

console.log("v0.10.0 Medical expansion applied.");
console.log(`  mesopotamianParallels.json: +${newMesopotamianParallels.length} entries → total ${mp.parallels.length}`);
console.log(`  antediluvianParallels.json: +${newAntediluvianQueries.length} queries → total ${ap.parallels.length} queries / ${ap.parallels.reduce((s, p) => s + p.results.length, 0)} results`);
