// Reformulation pass for the 6 pending candidates.
// Each candidate gets a verdict: VALIDATED (with reformulation),
// REJECTED (reformulation attempted but no anchor), or DUPLICATE
// (subsumed by existing v0.6 entry).

import { readFileSync, writeFileSync } from "node:fs";

const DC_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/discoveredCandidates.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const dc = JSON.parse(readFileSync(DC_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

const REFORMULATED_ON = "2026-05-15";
const REFORMULATED_BY = "claude-reformulation-pass 2026-05-15";

// Each entry: matches a pending candidate and applies a reformulation verdict.
const reformulations = [
  // ============================================================
  // #1 Inanna-Descent ↔ Adapa-ascent
  // Reformulation: drop the precise '7-gates-vs-2-gatekeepers
  // inversion' framing → broader 'Mesopotamian descent-and-ascent
  // paired-motif cosmological framework' (Annus 2016 actual claim)
  // Status: VALIDATED (Mesopotamian-internal)
  // ============================================================
  {
    pair: [
      "Inanna's Descent through seven gates",
      "Adapa's ascent through Anu's gate-keepers",
    ],
    action: "reformulate_and_validate",
    new_entity_a_name: "Inanna's Descent (cosmological descent narrative)",
    new_entity_b_name: "Adapa's ascent (cosmological ascent narrative)",
    new_parallel_type: "structural",
    new_confidence_score: 0.65,
    new_discovery_trace_summary:
      "REFORMULATED 2026-05-15. Original framing (7 gates ↔ 2 gatekeepers as structural inversion) was too architecturally precise. Reformulated framing: Inanna and Adapa as paired-motif representatives of the Mesopotamian descent-and-ascent cosmological framework. Annus 2016 The Overturned Boat Part Two treats them as such — descent into the underworld/sea was structurally necessary precursor to heavenly ascent in Mesopotamian thought.",
    attribution: [
      {
        author_year: "Annus 2016",
        publication:
          "Amar Annus, The Overturned Boat: Intertextuality of the Adapa Myth and Exorcist Literature, State Archives of Assyria Studies 24 (Helsinki: Neo-Assyrian Text Corpus Project, 2016). Part Two: 'Descent and Ascent.'",
        argument_summary:
          "Devotes Part Two to 'Descent and Ascent' treating Inanna's journey and Adapa's ascent as shared/paired motifs central to Mesopotamian religious experience. Argues that descent into the underworld (sea, netherworld) was a structurally necessary precursor to heavenly ascent in the Mesopotamian cosmological frame — not as 7-gates-vs-2-gatekeepers inversion but as paired cosmological motif.",
      },
    ],
    reformulation_note:
      "Original 7-gates-vs-gatekeepers inversion framing dropped in favor of Annus 2016's actual broader paired-motif argument. Mesopotamian-internal — does not promote to antediluvianParallels.json. Promote target: planned v0.8 find_mesopotamian_parallel.",
  },

  // ============================================================
  // #2 Erra-frame ↔ 1 Enoch frame
  // Reformulation outcome: DUPLICATE. The Mesopotamian↔Jewish
  // authorial-frame parallel IS captured under v0.6's existing
  // Genesis 5:21-24 query (Enmeduranki↔Enoch via Lambert 1967 +
  // VanderKam 1984 + Kvanvig 1988 + Annus 2010). The Erra colophon
  // route doesn't add anything novel that those scholars haven't
  // already framed via the Enmeduranki route.
  // Status: REJECTED with reason DUPLICATE
  // ============================================================
  {
    pair: [
      "Erra Epic authorship-frame (Kabti-ilāni-Marduk)",
      "1 Enoch pseudepigraphic Enoch-frame",
    ],
    action: "reject_as_duplicate",
    rejection_reason:
      "REJECTED after reformulation attempt: the Mesopotamian↔Jewish authorial-frame structural parallel IS already in the v0.6 dataset under Genesis 5:21-24 (Enmeduranki↔Enoch via Lambert 1967 + VanderKam 1984 + Kvanvig 1988 + Annus 2010). The Erra colophon (Kabti-ilāni-Marduk dream-revelation) is a STRUCTURALLY SIMILAR Mesopotamian authorial-frame, but its 1 Enoch reception is via the same Enmeduranki↔Enoch transmission that's already captured. The candidate as stated would be a third citation pointing to the same underlying parallel — duplicate by substance even though entities differ.",
    reformulation_note:
      "Reformulation attempted: re-anchor to Enmeduranki↔Enoch. Outcome: that argument is already in v0.6 dataset, making this candidate effectively a duplicate. The Erra-specific framing does not add new scholarly content.",
  },

  // ============================================================
  // #3 Anunnaki/Igigi binary ↔ Watchers transgression
  // Reformulation: drop 'Igigi tier-binary' framing → restate per
  // Kvanvig 2011's actual claim ('Watchers ↔ pre-flood humans of
  // Atrahasis' — Watchers occupy the role-slot of Atrahasis's
  // pre-flood humans, not the role-slot of rebelling junior gods).
  // Status: VALIDATED — promote-able to antediluvianParallels.json
  // ============================================================
  {
    pair: [
      "Anunnaki/Igigi binary tier-structure",
      "Anunnaki labor → Igigi rebellion → Watchers transgression",
    ],
    action: "reformulate_and_validate",
    new_entity_a_name:
      "Pre-flood humans of Atra-ḫasīs (cosmological role-slot)",
    new_entity_b_name:
      "Watchers of 1 Enoch's Book of the Watchers (occupying the same role-slot)",
    new_parallel_type: "structural",
    new_confidence_score: 0.68,
    new_discovery_trace_summary:
      "REFORMULATED 2026-05-15. Original 'Anunnaki/Igigi binary ↔ Watchers' framing was wrong — Kvanvig 2011's actual claim positions Watchers in the role-slot of Atrahasis's PRE-FLOOD HUMANS, not in the role-slot of rebelling junior gods (Igigi). Reformulated: 'Watchers as structural successors to Atrahasis's pre-flood humans' — both are pre-flood beings whose existence creates the conditions for divine flood-intervention.",
    attribution: [
      {
        author_year: "Kvanvig 2011",
        publication:
          "Helge S. Kvanvig, Primeval History: Babylonian, Biblical, and Enochic. An Intertextual Reading, Supplements to the Journal for the Study of Judaism 149 (Leiden: Brill, 2011), pp. 403-404",
        argument_summary:
          "Argues that the Watchers and giants 'as antediluvian beings, are cast in the same role as the antediluvian human race' in the Mesopotamian Atrahasis framework. Watchers do not parallel the Igigi (rebelling junior gods); they occupy the cosmological role-slot of pre-flood humanity. This is a structural-role parallel, not a tier-class parallel.",
      },
    ],
    reformulation_note:
      "Original 'Igigi tier-binary' framing rejected; reformulation aligns to Kvanvig 2011's actual claim. PROMOTES to antediluvianParallels.json under 1 Enoch 6:1-8 (Watchers descent) as an additional result.",
    promote_to_query: ["1 Enoch 6:1-8", "1 Enoch 7:1-6", "1 Enoch 8:1-3"],
  },

  // ============================================================
  // #4 Inanna trickster-intoxication ↔ Jacob deception
  // Reformulation attempted: broaden to general trickster typology
  // (Niditch 1987 + Inanna-trickster scholarship). Outcome: Niditch
  // 1987 stays internal to Hebrew Bible folklore; no peer-reviewed
  // scholar pairs Inanna's me-theft with Jacob's deception of Isaac.
  // Status: REJECTED — reformulation failed to find anchor
  // ============================================================
  {
    pair: [
      "Inanna trickster-by-intoxication (steals me from Enki)",
      "Jacob's deception of Isaac (Gen 27)",
    ],
    action: "reject_after_failed_reformulation",
    rejection_reason:
      "REJECTED after reformulation attempt. The trickster archetype is widely deployed in folklore studies (Niditch 1987 Underdogs and Tricksters for Hebrew Bible; Inanna-trickster scholarship in Journal for Semitics for Mesopotamia) — but Niditch 1987 stays internal to Hebrew Bible folklore and Inanna-trickster work stays internal to Mesopotamian myth. NO peer-reviewed scholar verified to pair Inanna's me-theft with Jacob's deception of Isaac specifically. Reformulations attempted: (a) broader trickster typology — Niditch doesn't bridge Mesopotamia; (b) broader intoxication-trickery topos (Inanna-Enki + Noah's drunkenness Gen 9 + Lot Gen 19) — different pair, doesn't help; (c) parent-mediated benediction-theft typology — too generic. Mark rejected; the candidate is irreducibly unanchored despite intuitive appeal.",
    reformulation_note:
      "Reformulation attempted 3 ways: (1) broader trickster typology; (2) intoxication-trickery topos; (3) parent-mediated benediction-theft typology. None yields a peer-reviewed pair-specific scholarly anchor. The parallel may be defensible in comparative folklore but is not anchored in current scholarship.",
  },

  // ============================================================
  // #5 Sumerian 7-day flood ↔ Genesis 40-day rain
  // Reformulation: re-anchor on Wenham 1987 WBC Genesis 1-15 which
  // explicitly catalogues 17 points of contact between Genesis and
  // Mesopotamian flood narratives, with duration as one of the
  // documented divergences. Reformulation aligns to what Wenham
  // actually argues (catalogued difference) rather than 'deliberate
  // extension' (which is interpretive overlay).
  // Status: VALIDATED — promotable to antediluvianParallels.json
  // ============================================================
  {
    pair: [
      "Sumerian flood seven-day duration",
      "Genesis 7 forty-day rain duration",
    ],
    action: "reformulate_and_validate",
    new_entity_a_name:
      "Mesopotamian flood duration (7-and-7 across Sumerian, Atra-ḫasīs, Gilgamesh XI)",
    new_entity_b_name:
      "Genesis 7 flood duration (40-day rain + 150-day prevailing waters per P/J)",
    new_parallel_type: "structural",
    new_confidence_score: 0.62,
    new_discovery_trace_summary:
      "REFORMULATED 2026-05-15. Original 'Hebrew tradition as DELIBERATE INNOVATION' framing dropped (Chen 2013's actual directionality is opposite). Reformulated: documented structural difference between Mesopotamian seven-and-seven (preserved across all three witnesses) and Hebrew 40-day rain + 150-day prevailing waters (Gen 7:12 + 7:24). Wenham 1987 WBC catalogues this as one of 17 points of contact-and-divergence; P/J source-critical analysis treats the dual durations as redactional layering of distinct flood-account sources.",
    attribution: [
      {
        author_year: "Wenham 1987",
        publication:
          "Gordon J. Wenham, Genesis 1-15, Word Biblical Commentary 1 (Waco: Word Books, 1987)",
        argument_summary:
          "Catalogues 17 points of contact between Genesis 1-11 and Mesopotamian flood traditions, with flood-duration as one of the documented divergences (Mesopotamian seven-and-seven days vs Hebrew 40-day rain + 150-day prevailing waters). Treats the Hebrew duration scheme as redactional layering of P and J flood sources.",
      },
      {
        author_year: "Lambert & Millard 1969",
        publication:
          "W.G. Lambert & A.R. Millard, Atra-ḫasīs: The Babylonian Story of the Flood (Oxford: Clarendon, 1969)",
        argument_summary:
          "Establishes the seven-and-seven Mesopotamian flood-duration canonical across the Sumerian Flood Story, Atra-ḫasīs, and Gilgamesh XI. The Hebrew variant duration is therefore a documented divergence from the otherwise stable Mesopotamian witness.",
      },
    ],
    reformulation_note:
      "Original 'deliberate Hebrew innovation' interpretive framing softened to 'documented structural divergence per Wenham 1987 catalogue.' Anchor change: Chen 2013 (whose directionality is opposite — argues Mesopotamian innovation in Sumerian OB literature) is removed. PROMOTES to antediluvianParallels.json under a new Genesis 7 query.",
    promote_to_query: ["Genesis 7:11-24"],
  },

  // ============================================================
  // #6 Enki and World Order ↔ Marduk's 50 names
  // Reformulation attempted: Marduk-as-inheritor-of-Ea via the
  // 50-names absorption. Outcome: Lambert 2013 discusses Marduk's
  // 50 names + absorbing Enlil's prerogatives (already validated
  // as C1 Ninurta↔Marduk substitution); the specific 'Marduk
  // inherits Enki's World Order role' claim is not in Lambert
  // 2013 directly. No clean peer-reviewed anchor for the
  // reformulated parallel either.
  // Status: REJECTED — reformulation attempted, no anchor found
  // ============================================================
  {
    pair: [
      "Enki and the World Order assignment of divine domains",
      "Marduk's fifty names absorbing predecessor prerogatives",
    ],
    action: "reject_after_failed_reformulation",
    rejection_reason:
      "REJECTED after reformulation attempt. Lambert 2013 Babylonian Creation Myths argues Marduk's 50 names absorb ENLIL'S prerogatives (already validated as C1 Ninurta↔Marduk substitution — Lambert 1986 explicit). The reformulation as 'Marduk-as-inheritor-of-Enki's-domain-organization-role' is not in Lambert 2013 directly. Marduk is Ea's son in Enūma Eliš I.79-86 and inherits some wisdom-aspects, but the specific 'Enki and the World Order' ↔ 'Marduk 50 names' structural parallel is not anchored in the verified scholarship. Sommerfeld 1982 discusses Marduk's rise but does not make this specific dual-text comparison.",
    reformulation_note:
      "Reformulation attempted: 'Enki-Marduk theological succession via 50 names' or 'Marduk inherits Ea's wisdom-administrative role.' Outcome: Lambert 2013's actual argument is Marduk inheriting ENLIL's role (validated under C1), not Enki's specifically. No clean anchor for the reformulated parallel. The candidate may resurface in a future v0.8 if a specific Lambert/Sommerfeld/Annus argument is located, but as of 2026-05-15 it has no peer-reviewed anchor.",
  },
];

// Apply reformulations to discoveredCandidates.json
let validated = 0;
let rejected = 0;
const newQueryPromotions = [];

for (const r of reformulations) {
  const c = dc.candidates.find(
    (x) => x.entity_a.name === r.pair[0] && x.entity_b.name === r.pair[1],
  );
  if (!c) {
    throw new Error(`Candidate not found: ${r.pair.join(" ↔ ")}`);
  }

  // Update validation_log with reformulation history
  c.validation_log = c.validation_log || {};
  c.validation_log.reformulated_on = REFORMULATED_ON;
  c.validation_log.reformulated_by = REFORMULATED_BY;
  c.validation_log.reformulation_note = r.reformulation_note;
  // Clear the now-superseded inconclusive_notes
  delete c.validation_log.inconclusive_notes;

  if (r.action === "reformulate_and_validate") {
    // Update the candidate IN-PLACE to its reformulated state
    c.entity_a.name = r.new_entity_a_name;
    c.entity_b.name = r.new_entity_b_name;
    c.parallel_type = r.new_parallel_type;
    c.confidence_score = r.new_confidence_score;
    c.discovery_trace.reasoning_summary = r.new_discovery_trace_summary;
    c.validation_status = "validated";
    c.scholarly_attribution = r.attribution;
    if (r.promote_to_query) {
      newQueryPromotions.push({
        candidate: c,
        target_passages: r.promote_to_query,
      });
    }
    validated++;
  } else if (
    r.action === "reject_as_duplicate" ||
    r.action === "reject_after_failed_reformulation"
  ) {
    c.validation_status = "rejected";
    c.validation_log.rejection_reason = r.rejection_reason;
    rejected++;
  }
}

// Update validation_totals
const allValidated = dc.candidates.filter((c) => c.validation_status === "validated").length;
const allRejected = dc.candidates.filter((c) => c.validation_status === "rejected").length;
const allPending = dc.candidates.filter((c) => c.validation_status === "pending").length;
dc._meta.validation_totals = {
  total_candidates: dc.candidates.length,
  validated: allValidated,
  rejected: allRejected,
  pending: allPending,
  rounds_completed: 3,
  total_reviewed: dc.candidates.length,
};
dc._meta.reformulation_pass = {
  pass_date: REFORMULATED_ON,
  pass_label: "Round 3 — Reformulation of 6 pending candidates",
  candidates_reformulated: 6,
  validated_after_reformulation: validated,
  rejected_after_reformulation: rejected,
  reformulation_method:
    "For each pending candidate, attempted reformulation per the validation_log.inconclusive_notes hints. Reformulations that align to a published scholar's actual argument were validated; reformulations that failed to find a peer-reviewed anchor were rejected; one candidate was rejected as a duplicate of an existing v0.6 dataset entry.",
};

writeFileSync(DC_PATH, JSON.stringify(dc, null, 2) + "\n");

// =============================================================================
// Promote newly-validated reformulations to antediluvianParallels.json
// =============================================================================

// #3 Atrahasis-pre-flood-humans ↔ Watchers → append to existing 1 Enoch 6:1-8 query
const reformulated3 = newQueryPromotions.find((p) =>
  p.target_passages.includes("1 Enoch 6:1-8"),
);
if (reformulated3) {
  const enochQuery = ap.parallels.find(
    (p) =>
      p.query_match.text_id === "1_enoch" &&
      p.query_match.passages.includes("1 Enoch 6:1-8"),
  );
  if (enochQuery) {
    enochQuery.results.push({
      mesopotamian_source: {
        text: "Atra-ḫasīs pre-flood humanity (the labor-bearing antediluvian race)",
        citation: "Atra-ḫasīs I.1-339 + III.i-vii (Lambert & Millard 1969)",
        language: "Akkadian",
        approximate_date: "Old Babylonian recension c. 1700 BCE",
      },
      parallel_type: "structural",
      correspondence_strength: "moderate",
      scholarly_attribution: reformulated3.candidate.scholarly_attribution,
      transmission_hypothesis: "babylonian_exile",
      notes:
        "Promoted from Discovery Engine v0.7 reformulation pass (2026-05-15). Kvanvig 2011 Primeval History pp.403-404 argues the Watchers + giants are cast in the SAME COSMOLOGICAL ROLE-SLOT as Atrahasis's pre-flood humans — not as parallel to the rebelling Igigi. Both groups are pre-flood beings whose existence creates the conditions for divine flood-intervention. This structural-role parallel adds a third dimension to the apkallu↔Watchers and Gilgamesh-hybridity↔Watchers parallels already in this query — Watchers as inheritors of the pre-flood-human role.",
    });
    reformulated3.candidate.validation_log.promotion_target =
      "antediluvianParallels.json 1 Enoch 6:1-8 (appended as 4th result)";
    reformulated3.candidate.validation_log.promoted_on = REFORMULATED_ON;
  }
}

// #5 Mesopotamian 7-day ↔ Genesis 40-day → new Genesis 7 query
const reformulated5 = newQueryPromotions.find((p) =>
  p.target_passages.includes("Genesis 7:11-24"),
);
if (reformulated5) {
  ap.parallels.push({
    query_match: {
      text_id: "genesis",
      passages: ["Genesis 7:11-24"],
      topics: ["flood_duration", "mesopotamian_flood_witness_comparison", "P_J_source_layering"],
    },
    passage_text:
      "In the six hundredth year of Noah's life, in the second month, on the seventeenth day of the month, the same day were all the fountains of the great deep broken up, and the windows of heaven were opened. And the rain was upon the earth forty days and forty nights... And the waters prevailed upon the earth a hundred and fifty days.",
    passage_translator: "ASV 1901 (Genesis 7:11-12, 7:24)",
    results: [
      {
        mesopotamian_source: {
          text: "Mesopotamian flood-duration tradition (Sumerian Flood Story + Atra-ḫasīs III.iv + Gilgamesh XI.128-131)",
          citation:
            "Civil 1969 in Lambert & Millard 1969 pp. 138-145 (Sumerian Flood Story); Atra-ḫasīs III.iv (Lambert & Millard 1969); Gilgamesh XI.128-131 (George 2003)",
          language: "Sumerian, Akkadian",
          approximate_date:
            "Sumerian OB (c. 1700 BCE); Atra-ḫasīs OB (c. 1700 BCE); Gilgamesh SB (c. 1200 BCE)",
        },
        parallel_type: "structural",
        correspondence_strength: "moderate",
        scholarly_attribution: reformulated5.candidate.scholarly_attribution,
        transmission_hypothesis: "common_ancient_near_eastern_substrate",
        notes:
          "Promoted from Discovery Engine v0.7 reformulation pass (2026-05-15). Wenham 1987 catalogues 17 points of contact-and-divergence between Genesis and the Mesopotamian flood tradition, with flood-duration as one of the documented divergences. Mesopotamian witnesses preserve a stable seven-and-seven-day duration across all three sources; the Hebrew variant (40-day rain in Gen 7:12 attributed to J; 150-day prevailing waters in Gen 7:24 attributed to P) represents redactional layering of distinct flood-account sources. Lambert & Millard 1969 establishes the Mesopotamian canonical duration.",
      },
    ],
  });
  reformulated5.candidate.validation_log.promotion_target =
    "antediluvianParallels.json Genesis 7:11-24 (new query)";
  reformulated5.candidate.validation_log.promoted_on = REFORMULATED_ON;
}

// Update antediluvian metadata
ap._meta.v0_7_4_reformulation = {
  date: REFORMULATED_ON,
  source: "data/discoveredCandidates.json reformulation pass",
  new_results_added: 2,
  new_queries_added: 1,
  existing_queries_appended: 1,
};

writeFileSync(DC_PATH, JSON.stringify(dc, null, 2) + "\n");
writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

console.log("Reformulation pass complete.");
console.log(`  Reformulated: 6 candidates`);
console.log(`  After reformulation:`);
console.log(`    validated: ${validated}`);
console.log(`    rejected: ${rejected}`);
console.log("");
console.log(`Combined totals after reformulation:`);
console.log(`  Total candidates: ${dc.candidates.length}`);
console.log(`  Validated:        ${allValidated}`);
console.log(`  Rejected:         ${allRejected}`);
console.log(`  Pending:          ${allPending}`);
console.log("");
console.log(`Promotions to antediluvianParallels.json:`);
console.log(`  +1 new query (Genesis 7:11-24 — flood duration)`);
console.log(`  +1 appended result (1 Enoch 6:1-8 — Atrahasis-humans↔Watchers role-slot)`);
console.log(`  Total result entries now: ${ap.parallels.reduce((sum, p) => sum + p.results.length, 0)}`);
