// Applies the round-2 validation pass results (24 candidates across batches E-J)
// to discoveredCandidates.json. Run-once.

import { readFileSync, writeFileSync } from "node:fs";

const DS_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json";
const ds = JSON.parse(readFileSync(DS_PATH, "utf8"));

const COMMON_VALIDATED_BY = "claude-validation-subagent-round2 2026-05-15";
const COMMON_VALIDATED_ON = "2026-05-15";

const validations = [
  // ===== Batch E =====
  {
    pair: ["Sebitti", "Seven Watcher Leaders"],
    status: "rejected",
    rejection_reason:
      "Rejected as stated after dedicated round-2 verification. Bhayro 2005 (AOAT 322:244-45, cited by Annus 2010 fn. 53) validates ONLY the reformulation 'Sebitti ↔ Enochic giants/Nephilim' — not 'Sebitti ↔ seven leader-Watchers' as stated. The chief Watchers are counted as 20 (1 Enoch 6:7), not 7. Recommended action: re-run discovery with the corrected entity-pair (Sebitti ↔ Enochic giants), which would validate via Bhayro 2005.",
    method:
      "Round-2 WebFetch of Annus 2010 PDF — verified fn. 53 verbatim. Bhayro 2005 publication record confirmed; full pp. 244-45 not open-access but the citation chain via Annus is itself peer-reviewed.",
  },
  {
    pair: [
      "Erra Epic authorship-frame (Kabti-ilāni-Marduk)",
      "1 Enoch pseudepigraphic Enoch-frame",
    ],
    status: "pending",
    inconclusive_notes:
      "Round-2 verification confirms inconclusive. Full-text search of Annus 2010 PDF found no Kabti-colophon ↔ Enoch-frame structural argument. Drawnel 2012 review of Kvanvig 2011 *Primeval History* confirms Kvanvig devotes a full Erra section but argues Watcher-Story ↔ Babylonian-imperial-ideology, not Erra-colophon ↔ Enoch-frame. Adjacent published arguments (VanderKam 1984 Enmeduranki↔Enoch; Borger 1971 Marduk/Shulgi Prophecies↔Daniel) use different Mesopotamian sources. Recommend re-anchoring against Enmeduranki↔Enoch or parking.",
    method:
      "WebFetch of Annus 2010 PDF (full-text grep for 'Kabti', 'colophon', 'pseudepigraph'); Drawnel 2012 review of Kvanvig 2011; Britannica + Encyclopedia.com on Kabti-ilāni-Marduk.",
  },
  {
    pair: [
      "Tablet of Destinies",
      "Heavenly Tablets (1 Enoch / Jubilees)",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Annus 2010",
        publication:
          "Amar Annus, 'On the Origin of Watchers: A Comparative Study of the Antediluvian Wisdom in Mesopotamian and Jewish Traditions,' Journal for the Study of the Pseudepigrapha 19.4 (2010): 277-320, at p. 284 and fn. 8",
        argument_summary:
          "Verbatim: 'In Mesopotamian tradition, such a divine source of information was the Tablet of Destinies, which corresponds to heavenly tablets and the Pargod in 3 Enoch, on which the divine secrets are written.' Fn. 8 adds: 'At least one Mesopotamian myth (LKA 146) presents the seven apkallus as possessors of the Tablet of Destinies. See Denning-Bolle 1992: 50; Lenzi 2008a: 122-25.'",
      },
      {
        author_year: "Paul 1973",
        publication:
          "Shalom M. Paul, 'Heavenly Tablets and the Book of Life,' Journal of the Ancient Near Eastern Society 5 (1973): 345-353",
        argument_summary:
          "Foundational treatment of the heavenly-tablets motif from Sumerian tuppi šīmāti through Mesopotamian, biblical, and Talmudic times. Establishes that the gods in Mesopotamia were determiners of destiny who wrote decisions on 'tablets of destiny' (tuppi simati), and that this concept underlies the biblical/Second Temple 'book of life' tradition.",
      },
      {
        author_year: "Arbel 2006",
        publication:
          "Vita Daphna Arbel, 'Seal of Resemblance, Full of Wisdom, and Perfect in Beauty: The Enoch/Metatron Narrative of 3 Enoch and Ancient Near Eastern Mythology,' p. 372 (cited by Annus 2010)",
        argument_summary:
          "Separate published treatment of the Tablet-of-Destinies → heavenly-tablets/Pargod correspondence, cited by Annus 2010 alongside his own argument.",
      },
    ],
    method:
      "WebFetch of Annus 2010 PDF — verified the explicit p. 284 + fn. 8 argument; Paul 1973 JANES verified open-access.",
  },
  {
    pair: [
      "Anunnaki/Igigi binary tier-structure",
      "Anunnaki labor → Igigi rebellion → Watchers transgression",
    ],
    status: "pending",
    inconclusive_notes:
      "Round-2 verification: Annus 2010 contains zero hits for 'Igigi' or 'Anunnaki' in any context. Kvanvig 2011 *Primeval History* makes the closest published argument but his framing (Watchers ↔ Atrahasis humans in the role-slot of pre-flood humanity, NOT Watchers ↔ Igigi in the role-slot of rebelling junior gods) is structurally different from the candidate. The Anunnaki/Igigi tier-binary ↔ Watchers framing appears as editorial gloss on intertextual.bible but no peer-reviewed scholar makes it explicitly. Recommend reformulation against Kvanvig 2011's actual claim (Watchers ↔ humans) or parking.",
    method:
      "Full-text search of Annus 2010 PDF for 'Igigi'/'Anunnaki'; review of intertextual.bible citing Kvanvig 2011:403-404; Drawnel 2012 review; Annus 2024 MDPI Religions article keywords.",
  },
  // ===== Batch F =====
  {
    pair: [
      "Inanna's Descent through seven gates",
      "Adapa's ascent through Anu's gate-keepers",
    ],
    status: "pending",
    inconclusive_notes:
      "Round-2: Annus 2016 *The Overturned Boat* Part Two has a 'Descent and Ascent' chapter that pairs Inanna and Adapa as shared/paired motifs in Mesopotamian cosmological frame. HOWEVER, the candidate's specific 'seven gates ↔ Anu's gatekeepers (Dumuzi/Gishzida) as structural inversion' framing is a more architectural claim than what surfaces in publisher summaries and reviews of Annus 2016. Annus appears to argue cosmological continuity (descent enables ascent), not specifically a 7-gates-vs-2-gatekeepers inversion of narrative units. Recommend: obtain full chapter text + promote to validated OR rephrase candidate to match Annus's actual framing.",
    method:
      "Eisenbrauns publisher description + Artemov OLZ review + Equinox JCH review + academia.edu literature extracts on Annus 2016.",
  },
  {
    pair: [
      "Ut-napishti's sleep-test (seven nights)",
      "Adapa refusing bread-of-life",
    ],
    status: "rejected",
    rejection_reason:
      "Sanders 2017 *From Adapa to Enoch* table-of-contents covers Mesopotamian-Judean scribal continuity but does NOT pair Gilgamesh XI's sleep-test with Adapa's bread-of-life refusal as parallel mortality-failure-tests. Multiple book-note reviews (Ancient Jew Review, Biblical Review, Mohr Siebeck) confirm this is not in Sanders's scope. George 2003 treats the sleep-test within Gilgamesh's narrative but does not pair with Adapa. The parallel is intuitive and frequently cited at the comparative-mythology level but not anchored in peer-reviewed scholarship in venues searched.",
    method:
      "Sanders 2017 Mohr Siebeck listing + PSU library catalog TOC + Ancient Jew Review book note + Biblical Review.",
  },
  {
    pair: [
      "Adapa-Adam onomastic and structural parallel",
      "Adam (Genesis 2-3)",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Andreasen 1981",
        publication:
          "Niels-Erik Andreasen, 'Adam and Adapa: Two Anthropological Characters,' Andrews University Seminary Studies 19.3 (1981): 179-194",
        argument_summary:
          "Catalogues the parallels between Adam and Adapa — both first/prototype humans, both tested with food (and drink in Adapa's case), both involve obeying a divine figure (Ea/El), both involve loss of eternal life through the food test, both involve proper clothing. Argues the parallels are real but 'seriously blunted by the entirely different contexts in which they occur.' Treats them as 'anthropological characters' belonging to a shared Ancient Near Eastern type — the moderate position between 'identical figures' and 'illusory parallels' poles.",
      },
    ],
    notes_update:
      "VALIDATION CAVEAT: The 'onomastic' component of the candidate as originally stated (Adapa→Adaba→Adam phonological progression) is NOT supported by Andreasen 1981 — his thesis is explicitly STRUCTURAL/typological ('Two Anthropological Characters'), and he distances himself from the same-person/onomastic-identification camp. The phonological-pipeline argument appears to belong to other scholars (Sjöberg on Sumerian a-dam) or older 19th-c. assyriology. The structural parallel is validated; the onomastic component should be dropped or re-attributed.",
    method:
      "Open-access verification via Andrews Digital Commons (digitalcommons.andrews.edu/old-testament-pubs/66/) and AUSS PDF (andrews.edu/library/car/cardigital/Periodicals/AUSS/1981-3/1981-3-01.pdf).",
  },
  {
    pair: [
      "Adapa breaks the wing of south wind",
      "Watchers' transgression at Mount Hermon",
    ],
    status: "rejected",
    rejection_reason:
      "Sanders 2017 *From Adapa to Enoch* does not treat this pairing — book scope is scribal-persona Mesopotamian-to-Judean continuity (Adapa → 'I am Adapa!' exorcist persona → Enoch as Judean scribal hero), not pre-flood transgression narratives. Nickelsburg 2001 Hermeneia 1 Enoch and Izre'el 2001 Adapa treat their respective transgressions but not as paired pre-flood foundational disruptions. Annus 2010 traces apkallu → Watchers via list-rewriting, not via transgression-parallel. The candidate's 'foundational pre-flood transgressions by quasi-divine figures' framing is a plausible comparative-religion observation but no peer-reviewed scholar makes the explicit pairing.",
    method:
      "Sanders 2017 Mohr Siebeck + PSU library catalog TOC + Ancient Jew Review + Biblical Review + WebFetch of Annus 2010 PDF.",
  },
  // ===== Batch G =====
  {
    pair: ["Apsû slain by Ea", "Tehom of Genesis 1:2"],
    status: "rejected",
    rejection_reason:
      "Rejected as framed — conflates two distinct Mesopotamian primordial waters. Apsû (freshwater abyss, slain by Ea in Enūma Eliš Tablet I) is NOT the figure scholars connect to Hebrew tehom. The scholarly tradition (Gunkel 1895 onward) connects TIAMAT (saltwater, slain by Marduk in Tablet IV) to tehom — on grounds of phonological similarity, gender (both feminine), and cosmogonic function. Additionally: Westermann 1984 actively REJECTS the linguistic parallel (concludes tehom is a common Semitic cognate, cf. Ugaritic thm / Akkadian tiamtum / Eblaite ti'amatum / Arabic tihamat, not a borrowing). Modern phonological consensus follows Westermann: tehom CANNOT be linguistically derived from Tiamat. If reformulated as 'Tiamat ↔ tehom (cognate cosmogonic role, not linguistic derivation)' the candidate is partially validated by Gunkel 1895 but with major caveat.",
    method:
      "WebFetch of Gunkel 1895 (Internet Archive) + Westermann 1984 listing + Wikipedia tehom article + standard Semitic-cognate references.",
  },
  {
    pair: [
      "Enki and the World Order assignment of divine domains",
      "Marduk's fifty names absorbing predecessor prerogatives",
    ],
    status: "pending",
    inconclusive_notes:
      "Round-2: Both texts are well-studied. Lambert 2013 discusses the 50 names extensively + Marduk's absorption of Enlil's prerogatives; Kramer & Maier 1989 translate 'Enki and the World Order.' Neither explicitly compares the two as parallel divine-administrative narratives in materials accessed. The Enki→Marduk theological succession (father-son framing) IS attested in scholarship — but that is a different claim than the structural-parallel framing of the candidate. Recommend full-book access review before validating.",
    method:
      "JSTOR Lambert 2013 listing + Internet Archive Kramer & Maier 1989 + secondary literature review.",
  },
  {
    pair: ["Enheduanna (named author)", "Kabti-ilāni-Marduk (named author)"],
    status: "validated",
    attribution: [
      {
        author_year: "Helle 2019",
        publication:
          "Sophus Helle, 'Enheduana: The Birth of Literature through the Goddess,' Iraq 81 (2019), Cambridge Core",
        argument_summary:
          "Treats Enheduana as the first named author in literary history, in a Mesopotamian tradition that systematically named authors via the Neo-Assyrian Catalogue of Texts and Authors. Discusses Kabti-ilāni-Marduk by name as a later, rare case of self-identifying authorship (revealed in dream), establishing the 'tradition of named authorship within anonymity' frame.",
      },
      {
        author_year: "Helle 2023",
        publication:
          "Sophus Helle, Enheduana: The Complete Poems of the World's First Author (Yale University Press, 2023)",
        argument_summary:
          "Extended treatment placing Enheduana within Mesopotamian named-authorship tradition with Kabti-ilāni-Marduk as parallel case.",
      },
      {
        author_year: "Lenzi 2008",
        publication:
          "Alan Lenzi, Secrecy and the Gods: Secret Knowledge in Ancient Mesopotamia and Biblical Israel (State Archives of Assyria Studies 19; Helsinki, 2008)",
        argument_summary:
          "Discusses Kabti-ilāni-Marduk's dream-revelation framing as a scribal strategy for legitimating texts as divine revelation. Explicitly compares Mesopotamian scribal authority claims to biblical Israel (Moses as parallel mediator) — the documented Mesopotamia→biblical reception argument.",
      },
    ],
    notes_update:
      "VALIDATION CAVEAT: Drop the 'Hellenistic-pseudepigraphy' extension of the original candidate claim. Neither Helle nor Lenzi explicitly extends the named-authorship tradition to Hellenistic Greek pseudepigraphy in materials verified. The biblical/ANE reception link is solid (Lenzi 2008); the Hellenistic link needs a separate scholar.",
    method:
      "Cambridge Core Helle 2019; Helle's own PDF 'The First Authors'; CORE PDF of Lenzi 2008 Secrecy and the Gods; Britannica on Kabti-ilāni-Marduk.",
  },
  {
    pair: [
      "Inanna-Aphrodite continuity chain",
      "Enki/Ea → Hermes Trismegistus continuity",
    ],
    status: "rejected",
    rejection_reason:
      "Rejected as a single paired structural parallel. The two chains operate in different periods: Inanna→Astarte→Aphrodite peaks in Bronze Age + Archaic Greek (Burkert 1992 Orientalizing Revolution focuses on 750-650 BCE); Enki→Hermes Trismegistus is Hellenistic syncretism (Berossus 3rd c. BCE + later Hermetic corpus). Burkert, West 1997, Budin 2003, and Copenhaver 1992 each treat their respective chain but no scholar verified to treat them as instances of one transmission pattern. Each chain individually IS validated by its respective anchors — but the PAIRED structural-parallel framing is unsupported. Recommend splitting into two separate parallels (Inanna↔Aphrodite via Burkert/Budin; Enki↔Hermes via Copenhaver) rather than a single paired claim.",
    method:
      "Burkert 1992 Internet Archive + West 1997 BMCR review + JNES review of Budin 2003 + Copenhaver 1992 + Wikipedia Enūma Eliš.",
  },
  // ===== Batch H =====
  {
    pair: [
      "Berossus' Sippar buried-tablets motif",
      "Enoch's writings preserved across Flood",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "van der Horst 2002",
        publication:
          "Pieter W. van der Horst, 'Antediluvian Knowledge: Jewish Speculations About Wisdom From Before the Flood in Their Ancient Context,' in Japheth in the Tents of Shem: Studies on Jewish Hellenism in Antiquity (Peeters, 2002)",
        argument_summary:
          "Explicitly compares Berossus' Sippar-tablet-burial (preserved in Syncellus and Eusebius) with Jubilees' Cainan-stone-writing tradition and the Enochic preservation-of-wisdom-across-Flood motif. Treats them as cognate antediluvian-knowledge-survival traditions reflecting a common Ancient Near Eastern substrate.",
      },
      {
        author_year: "Annus 2010",
        publication:
          "Amar Annus, 'On the Origin of Watchers,' Journal for the Study of the Pseudepigrapha 19.4 (2010): 277-320",
        argument_summary:
          "Secondary support: discusses the broader Mesopotamian-Jewish antediluvian wisdom substrate from which both Berossus and 1 Enoch / Jubilees draw.",
      },
    ],
    notes_update:
      "ANCHOR CORRECTION: van der Horst 2002 is the primary anchor (not Annus 2010 as initially suggested by the Discovery Engine). Annus 2010 is supporting/contextual.",
    method:
      "TheTorah.com piece by Sharon citing van der Horst 2002 fn. 12; BMCR review of van der Horst 2002.",
  },
  {
    pair: [
      "Lagash KL agricultural-labor cosmology",
      "SKL kingship-from-heaven cosmology",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Sollberger 1967",
        publication:
          "Edmond Sollberger, 'The Rulers of Lagaš,' Journal of Cuneiform Studies 21 (1967): 279-291",
        argument_summary:
          "Editio princeps. Describes the Lagash King List as a satirical/pseudo-historical composition responding to the SKL — a deliberate dissent from the WB-444 framework.",
      },
      {
        author_year: "Glassner 2004",
        publication:
          "Jean-Jacques Glassner, Mesopotamian Chronicles (Society of Biblical Literature, Writings from the Ancient World 19; 2004)",
        argument_summary:
          "Explicitly organizes the Lagash King List under the section heading 'A Parody: The Royal Chronicle of Lagash' (Chronicle 6). Frames the agricultural-labor cosmology as a deliberate inversion of the SKL's 'kingship descended from heaven' formula. The Lagash text's opening (ETCSL 2.1.2) confirms: 'After the flood had swept over… kingship and the crown of the city had not yet come out from heaven, and Nin-ĝirsu had not yet established for the multitude of well-guarded people the pickaxe, the spade, the earth basket and the plough, which mean life for the Land.'",
      },
    ],
    notes_update:
      "Drop Marchesi 2010/2011 (handles ED chronology, not cosmological-dispute argument) and Wilcke 1989 (tangential) from the anchors — Sollberger 1967 + Glassner 2004 are the clean validated pair.",
    method:
      "Sollberger 1967 JCS access + ETCSL 2.1.2 translation + Glassner 2004 Livius CM 6 page.",
  },
  {
    pair: [
      "Sumerian flood seven-day duration",
      "Genesis 7 forty-day rain duration",
    ],
    status: "pending",
    inconclusive_notes:
      "Round-2: The structural contrast (Mesopotamian 7-and-7 across all 3 witnesses vs Hebrew 40-day rain + 150-day prevailing waters) IS standard scholarly consensus (Lambert & Millard 1969 + Wenham 1987 + standard P/J source criticism). HOWEVER, the candidate's specific 'Hebrew tradition as DELIBERATE INNOVATION over Mesopotamian' framing was attributed to Chen 2013 — but Chen 2013's actual thesis is the OPPOSITE directionality: he argues the Mesopotamian flood motif itself was an OB-period innovation in Sumerian literature, not that Hebrew authors innovated over Mesopotamian models. The deliberate-extension interpretive claim needs Wenham 1987 (WBC Genesis 1-15) as anchor, not Chen 2013. Recommend re-anchoring + re-running validation.",
    method:
      "Chen 2013 OUP product page + Lambert & Millard 1969 Internet Archive + Wenham WBC Internet Archive + Wikipedia Genesis flood narrative.",
  },
  {
    pair: [
      "Five antediluvian cities (Sumerian Flood Story)",
      "Pre-flood civilization (Genesis 4)",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Shea 1991",
        publication:
          "William H. Shea, 'The Antediluvians,' Origins (Geoscience Research Institute) 18 (1991)",
        argument_summary:
          "Explicitly maps the Cainite cultural-accomplishments of Genesis 4 (animal husbandry via Jabal, music via Jubal, metallurgy via Tubal-Cain, city-building, polygyny via Lamech) onto the Sumerian/Mesopotamian antediluvian-cities tradition (Eridu, Bad-tibira, Larak, Sippar, Shuruppak). Treats them as typologically parallel pre-flood civilization-founding sections.",
      },
      {
        author_year: "Jacobsen 1981",
        publication:
          "Thorkild Jacobsen, 'The Eridu Genesis,' Journal of Biblical Literature 100 (1981): 513-529",
        argument_summary:
          "Interpretive framework treating the Sumerian Flood Story's antediluvian-cities + Genesis pre-flood civilization sections as parallel instances of a broader 'primeval history' genre. The 'Eridu Genesis' label has become the standard framework for this comparative reading.",
      },
      {
        author_year: "Civil 1969",
        publication:
          "Miguel Civil, in W.G. Lambert & A.R. Millard, Atra-ḫasīs: The Babylonian Story of the Flood (Oxford UP, 1969), appendix pp. 138-145",
        argument_summary:
          "Editio princeps of the Sumerian Flood Story's antediluvian-cities list (lines 84-100), naming the five cities with tutelary deities — the textual foundation for the parallel.",
      },
    ],
    notes_update:
      "ANCHOR CORRECTION: Shea 1991 + Jacobsen 1981 are the primary anchors (not Westermann 1984 as initially suggested). Westermann 1984 is consistent with the parallel via his ANE-comparative method but the specific five-cities/Cainite-genealogy mapping is more explicit in Shea/Jacobsen.",
    method:
      "Shea 1991 Geoscience Research Institute PDF + Jacobsen 1981 JBL discussion in Armstrong Institute Eridu/Cain article + Civil 1969 in Lambert & Millard appendix.",
  },
  // ===== Batch I =====
  {
    pair: [
      "Ninhursag's omega-uterus",
      "Apkallu bucket-and-cone",
    ],
    status: "rejected",
    rejection_reason:
      "Rejected: no peer-reviewed scholar verified to make this iconographic-parallel argument. Stol 2000 Birth in Babylonia and the Bible discusses the omega-symbol as stylized uterus associated with the mother goddess but does NOT compare it to apkallū bucket-and-cone. Wiggermann 1992 treats the bucket-and-cone gesture as a purification mechanism for cosmic boundary-maintenance but NOT in iconographic dialogue with Ninhursag's omega. Black & Green 1992 treat the two motifs in separate iconographic registers. Multiple searches for an explicit pairing returned the two motifs in separate encyclopedic contexts but no structural-parallel argument. This is exactly the pattern-match parallel that pattern-matching can surface but published scholarship doesn't anchor.",
    method:
      "Stol 2000 Internet Archive + Wiggermann 1992 Internet Archive + JANER 2025 omega-iconography article + ORACC AMGG entries.",
  },
  {
    pair: [
      "Sacred-marriage (king-Inanna)",
      "Akitu king-humiliation rite",
    ],
    status: "rejected",
    rejection_reason:
      "Anchors argue AGAINST the parallel. Cooper 1993 'Sacred Marriage and Popular Cult in Early Mesopotamia' (Heidelberg conference volume) frames sacred marriage as a literary/cultic phenomenon rooted in early-Mesopotamian popular religion — does NOT frame it as a structural parallel to the Akitu king-humiliation rite. Bidmead 2002 The Akītu Festival explicitly moves AWAY from the older Frankfort/Hooke myth-and-ritual reading: 'examines the akītu for its political and sociological significance, doing away with the concepts of hieros gamos, cultic battle, and the motif of the dying-rising god.' The parallel existed in the older Frankfort/Hooke 'myth-and-ritual school' but is rejected by current consensus. 'The evidence for a sacred marriage involving Marduk during the Babylonian Akitu is at best sketchy' — current consensus.",
    method:
      "Bidmead 2002 Akītu Festival + Cooper 1993 Google Books + JANES article 'Rectifying the King or Renewing the Cosmos'.",
  },
  {
    pair: [
      "Eṭemmu (ghost / divine remnant in humans)",
      "Imago Dei / divine breath in humans (Genesis 1-2)",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Lambert & Millard 1969",
        publication:
          "W.G. Lambert & A.R. Millard, Atra-ḫasīs: The Babylonian Story of the Flood (Oxford: Clarendon, 1969)",
        argument_summary:
          "Explicitly state — and this is widely cited downstream — that 'in all probability the Babylonians conceived of man as matter (clay) activated by the addition of divine blood,' paired with the observation that 'the Hebrew account of creation in Genesis 2 explains that God imparted the breath of life into man, and so animation began.' This IS a direct comparative move treating the divine element in humans in Atrahasis as the Mesopotamian counterpart to Genesis 2:7's divine breath. The eṭemmu / ṭemu / damu wordplay (ghost / reason / blood) tied to the slain Wē-ila is the Lambert & Millard reading reproduced in most subsequent scholarship.",
      },
    ],
    notes_update:
      "VALIDATION SCOPE: The candidate has two legs. (1) Eṭemmu ↔ Genesis 2:7 divine breath — VALIDATED by Lambert & Millard 1969 explicitly. (2) Eṭemmu ↔ Genesis 1 imago Dei — Westermann 1984 treats imago Dei relationally and is more cautious; this leg is implied but not explicitly drawn. Recommend separating the two legs into distinct candidates in any future re-run.",
    method:
      "Lambert & Millard 1969 Atrahasis Internet Archive + Westermann 1984 Genesis 1-11 listing + Britannica eṭemmu entry.",
  },
  {
    pair: [
      "Marduk's absence in Erra Epic",
      "YHWH's hester panim (hiding of face)",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Bodi 1991",
        publication:
          "Daniel Bodi, The Book of Ezekiel and the Poem of Erra (Orbis Biblicus et Orientalis 104; Fribourg/Göttingen: Vandenhoeck & Ruprecht, 1991)",
        argument_summary:
          "The foundational scholarly treatment that explicitly identifies 'the absence of the divinity from its shrine' as one of twelve shared motifs between the Erra Epic and the book of Ezekiel. Bodi argues that the Erra-poem's Marduk-absence motif shaped Ezekiel's portrayal of YHWH's withdrawal from the Jerusalem temple — the Mesopotamian textual source for the biblical divine-abandonment motif.",
      },
      {
        author_year: "Block 2000",
        publication:
          "Daniel I. Block, The Gods of the Nations: Studies in Ancient Near Eastern National Theology (Apollos / Baker Academic, 2000); cf. Block, 'Divine Abandonment: Ezekiel's Adaptation of an Ancient Near Eastern Motif'",
        argument_summary:
          "Extends Bodi's argument into the broader Hebrew Bible. Treats the divine-absence motif as a structural parallel between Mesopotamian and biblical corpora.",
      },
    ],
    notes_update:
      "ANCHOR CORRECTION: Bodi 1991 (NOT Balentine 1983) is the correct anchor. Balentine 1983 works within Hebrew Bible / OT theology and does not engage Mesopotamian sources for hester panim. The Mesopotamian-side parallel is supplied by Bodi + Block. The post-biblical rabbinic term 'hester panim' is technically distinct from Bodi's 'divine absence' terminology but the underlying motif is the same.",
    method:
      "Bodi 1991 ZORA/UZH archived PDF + Block 2000 references + Researchgate AOAT 390 on divine abandonment.",
  },
  // ===== Batch J =====
  {
    pair: [
      "Enmeduranki receives divination from Šamaš + Adad",
      "Moses receives Torah on Mount Sinai",
    ],
    status: "rejected",
    rejection_reason:
      "Rejected. Lambert 1967 (JCS 21:126-138) anchors Enmeduranki to ENOCH (already validated in v0.6 dataset for Genesis 5:21-24), not Moses. The Moses comparison appears in the literature only in an INVERTED POLEMICAL form: Second Temple Enochic literature positioned Enoch's revelation as competing-with-or-superior-to Moses's Sinai revelation (Annus 2010 + Orlov in Marquette/Maqom volumes). That is an internal Jewish polemic about Enoch-vs-Moses authority, NOT a direct Enmeduranki↔Moses structural parallel. Sommer 2009 Bodies of God surfaces no Enmeduranki-Moses comparison. The candidate conflates 'Enoch is modeled on Enmeduranki' (validated) with 'Moses is modeled on Enmeduranki' (not published). Sacred-mountain revelation is too generic a frame to bear a 1:1 comparison absent an explicit scholar.",
    method:
      "Lambert 1967 Semantic Scholar + Orlov Marquette/Maqom papers + Sommer 2009 Internet Archive.",
  },
  {
    pair: [
      "Shamhat civilizing Enkidu through sex",
      "Eve's role in Adam's knowledge-gain",
    ],
    status: "validated",
    attribution: [
      {
        author_year: "Bailey 1970",
        publication:
          "John A. Bailey, 'Initiation and the Primal Woman in Gilgamesh and Genesis 2-3,' Journal of Biblical Literature 89.2 (1970): 137-150",
        argument_summary:
          "Real, peer-reviewed (JBL) article that explicitly compares Shamhat and Eve as primal-women initiators of male protagonists into civilization/knowledge. Both narratives center female-mediated transition from primal-innocence to civilized-knowledge. The 'Eve-Shamhat framework' is foundational and described in secondary literature as influential in biblical scholarship.",
      },
    ],
    notes_update:
      "NUANCE: Later scholarship (Harvard Theological Review 'A Suitable Match: Eve, Enkidu, and the Boundaries of Humanity') complicates Bailey by arguing Eve ↔ Enkidu (suitable-match typology) — a competing but related reading. Both belong in the comparative corpus.",
    method:
      "Bailey 1970 markbwilson.com PDF + Cambridge Core HTR 'Suitable Match' article + verification of JBL 89:137-150 reference chain.",
  },
  {
    pair: [
      "Inanna trickster-by-intoxication (steals me from Enki)",
      "Jacob's deception of Isaac (Gen 27)",
    ],
    status: "pending",
    inconclusive_notes:
      "Both halves individually well-established: Inanna obtains the me from a drunk Enki (Kramer 1972, Sumerian myth Inanna and Enki / Transfer of Arts of Civilization); Jacob as biblical trickster is central in Niditch 1987 Underdogs and Tricksters. HOWEVER, Niditch 1987's actual content does NOT bridge to Mesopotamia explicitly with Inanna-Enki paired with Jacob-Isaac. Folklore-typology arguments may surface widely (Inanna-trickster archetype in Journal for Semitics; Jacob-as-divine-trickster Baylor dissertation) but no peer-reviewed publication verified pairing Inanna's me-theft with Jacob's deception of Isaac as parallel trickster-obtains-divine-benediction. The trickster archetype is published; THIS pairing is not. Per Round-2 discipline: inconclusive (lean reject).",
    method:
      "Niditch 1987 Underdogs and Tricksters Internet Archive + Journal for Semitics + Baylor dissertation references.",
  },
  {
    pair: [
      "Igigi 40-year labor (Atrahasis)",
      "Israelites' 40 years in wilderness",
    ],
    status: "rejected",
    rejection_reason:
      "Rejected. No peer-reviewed scholarship surfaces this parallel. Where the Atrahasis Igigi-rebellion is compared to biblical material, the comparand is 1 Enoch 6 (Watchers' descent), not the wilderness narrative (intertextual.bible Atrahasis I ↔ 1 Enoch 6:2; Annus 2010). The 40-year figure in Atrahasis is itself TEXTUALLY CONTESTED — Lambert & Millard 1969 note manuscript variants reading 2,500 years rather than 40. Kilmer 1972 'Mesopotamian Concept of Overpopulation' treats Atrahasis as overpopulation/flood theodicy, not wilderness-formation. The 40 in the wilderness narrative is a standard biblical typological number (40 days flood, 40 days Sinai, 40 days Elijah, 40 days Jesus) with no specific connection to Atrahasis's contested 40. Numerological-coincidence at best.",
    method:
      "Intertextual.bible Atrahasis ↔ 1 Enoch 6 + Lambert & Millard 1969 commentary + Kilmer 1972 Orientalia + Westermann 1984 standard numerology discussion.",
  },
];

// Apply each validation to the matched candidate
let updated = 0;
let notFound = [];
const summary = { validated: 0, rejected: 0, pending: 0 };

for (const v of validations) {
  const idx = ds.candidates.findIndex(
    (c) =>
      c.entity_a.name === v.pair[0] && c.entity_b.name === v.pair[1],
  );
  if (idx < 0) {
    notFound.push(v.pair.join(" ↔ "));
    continue;
  }
  const c = ds.candidates[idx];
  c.validation_status = v.status;
  summary[v.status]++;
  if (v.attribution) {
    c.scholarly_attribution = v.attribution;
  }
  c.validation_log = {
    validated_on: COMMON_VALIDATED_ON,
    validated_by: COMMON_VALIDATED_BY,
    validation_method: v.method,
    ...(v.rejection_reason ? { rejection_reason: v.rejection_reason } : {}),
    ...(v.inconclusive_notes ? { inconclusive_notes: v.inconclusive_notes } : {}),
  };
  if (v.notes_update) {
    c.notes = c.notes ? c.notes + " | " + v.notes_update : v.notes_update;
  }
  updated++;
}

// Update validation-pass metadata
ds._meta.validation_pass_round2 = {
  pass_date: COMMON_VALIDATED_ON,
  pass_label: "Round 2 — All 24 remaining pending candidates",
  candidates_reviewed: 24,
  validated: summary.validated,
  rejected: summary.rejected,
  pending: summary.pending,
  validation_method:
    "Six parallel Claude subagents (batches E-J), each verifying 4 candidates by searching scholarly literature for suggested anchor publications.",
};

// Calculate combined totals across rounds 1 + 2
const allValidated = ds.candidates.filter((c) => c.validation_status === "validated").length;
const allRejected = ds.candidates.filter((c) => c.validation_status === "rejected").length;
const allPending = ds.candidates.filter((c) => c.validation_status === "pending").length;
ds._meta.validation_totals = {
  total_candidates: ds.candidates.length,
  validated: allValidated,
  rejected: allRejected,
  pending: allPending,
  rounds_completed: 2,
  total_reviewed: 12 + 24,
};

writeFileSync(DS_PATH, JSON.stringify(ds, null, 2) + "\n");

console.log(`Round-2 applied: ${updated} candidates updated.`);
console.log(`  Round-2 verdict counts: validated=${summary.validated}, rejected=${summary.rejected}, pending=${summary.pending}`);
console.log("");
console.log(`Combined totals (rounds 1+2):`);
console.log(`  Total candidates: ${ds.candidates.length}`);
console.log(`  Validated:        ${allValidated}`);
console.log(`  Rejected:         ${allRejected}`);
console.log(`  Pending:          ${allPending}`);
if (notFound.length > 0) {
  console.log("\nNot found (check spellings):");
  notFound.forEach((p) => console.log("  - " + p));
}
