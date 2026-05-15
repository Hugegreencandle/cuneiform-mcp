// v0.11.0 Farming expansion — adds 4 Tier-1 parallels from Mesopotamia_Agricultural_Comparative.md
// framework brief. The Wright 2009 Hammurabi↔Exodus dependence parallel is the highest-leverage
// single addition in this round.

import { readFileSync, writeFileSync } from "node:fs";

const MP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/mesopotamianParallels.json";
const AP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/antediluvianParallels.json";

const mp = JSON.parse(readFileSync(MP_PATH, "utf8"));
const ap = JSON.parse(readFileSync(AP_PATH, "utf8"));

// =============================================================================
// mesopotamianParallels.json — 2 new agricultural-tradition parallels
// =============================================================================

const newMesopotamianParallels = [
  {
    id: "mp-agricultural-didactic-1",
    entity_a: {
      text: "Sumerian Farmer's Instructions — 111-line father-to-son didactic agricultural manual covering the full annual farming cycle (field preparation → irrigation → plowing → seeding → weeding → harvesting → threshing); composed in the *edubba-a* (scribal school) literary tradition; framed under Ninurta as agricultural patron deity.",
      citation: "Miguel Civil, The Farmer's Instructions: A Sumerian Agricultural Manual, Aula Orientalis Supplementa 5 (Sabadell: Editorial AUSA, 1994); ETCSL 5.6.3",
      language: "Sumerian",
      tradition: "sumerian",
      approximate_date: "Old Babylonian recension c. 1700 BCE; substrate likely older",
    },
    entity_b: {
      text: "Hesiod's Works and Days — 828-line Greek didactic poem covering the agricultural year (autumn plowing → winter rest → spring plowing → summer harvest) plus moral admonitions; framed as advice from Hesiod to his brother Perses; one of the foundational works of Greek literature.",
      citation: "M.L. West, Hesiod: Works and Days, edited with prolegomena and commentary (Oxford: Clarendon Press, 1978)",
      language: "Greek",
      tradition: "hellenistic_egyptian",
      approximate_date: "c. 700 BCE",
    },
    parallel_type: "structural",
    themes: ["agricultural_didactic", "wisdom_literature", "father_son_instruction", "annual_agricultural_cycle"],
    deities: ["Ninurta", "Demeter", "Zeus"],
    texts: ["Farmer's Instructions", "Works and Days"],
    correspondence_strength: "strong",
    scholarly_attribution: [
      {
        author_year: "West 1978",
        publication:
          "M.L. West, Hesiod: Works and Days, edited with prolegomena and commentary (Oxford: Clarendon Press, 1978)",
        argument_summary:
          "West's foundational commentary on Hesiod's Works and Days explicitly treats the poem as participating in a broader ANE wisdom-literature substrate that includes the Sumerian Farmer's Instructions. Both texts share: father-to-son advice format; annual-cycle agricultural structure; integration of agricultural with moral-religious advice; didactic poetic register. West argues for substrate-influence rather than direct borrowing.",
      },
      {
        author_year: "West 1997",
        publication:
          "M.L. West, The East Face of Helicon: West Asiatic Elements in Greek Poetry and Myth (Oxford: Oxford UP, 1997)",
        argument_summary:
          "Extended argument that Hesiod systematically draws on ANE wisdom-literature traditions including Mesopotamian agricultural and cosmogonic poetry. The Works and Days's structural similarity to Farmer's Instructions is one of West's principal pieces of evidence.",
      },
      {
        author_year: "Burkert 1992",
        publication:
          "Walter Burkert, The Orientalizing Revolution: Near Eastern Influence on Greek Culture in the Early Archaic Age (Cambridge MA: Harvard UP, 1992; trans. Margaret E. Pinder & Walter Burkert from 1984 German)",
        argument_summary:
          "Foundational argument for substantial Mesopotamian → Greek cultural transmission c. 750-650 BCE via Phoenician and Aramaean intermediaries. The Farmer's Instructions ↔ Works and Days parallel is part of Burkert's broader case for ANE didactic-poetry transmission to early Greek literature.",
      },
      {
        author_year: "Civil 1994",
        publication:
          "Miguel Civil, The Farmer's Instructions: A Sumerian Agricultural Manual, Aula Orientalis Supplementa 5 (Sabadell: Editorial AUSA, 1994)",
        argument_summary:
          "Foundational critical edition of the Sumerian text. Civil notes the structural parallel to Hesiod's Works and Days as one of the canonical ANE↔Greek didactic-agricultural literature comparisons; treats both as instantiations of shared ANE wisdom-literature genre.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.11 Farming expansion — Mesopotamia_Agricultural_Comparative.md Tier-1 recommendation",
    },
    notes:
      "v0.11.0 Farming expansion. The canonical ANE↔Greek agricultural-didactic-poetry parallel; West 1978 + 1997 + Burkert 1992 establish the broader Mesopotamian → Greek wisdom-literature transmission framework. Both texts also share Ninurta/Zeus as agricultural-patron deities (different cosmologies but parallel structural role).",
  },
  {
    id: "mp-irrigation-hydrology-1",
    entity_a: {
      text: "Mesopotamian canal irrigation system — dual-river (Tigris + Euphrates) alluvial plain requiring active hydraulic engineering: main canals (ÍD/nāru), branch canals (pa₅/palgu), field channels (atappu), drainage networks. Required corvée-labor + institutional management (Bīt-bēl-pâni canal-head institutions). Long-term salinization → wheat-to-barley shift.",
      citation: "Robert McC. Adams, Heartland of Cities (Univ. of Chicago, 1981); Jacobsen & Adams 1958 Science 128:1251-1258",
      language: "Akkadian",
      tradition: "akkadian",
      approximate_date: "Continuous attestation c. 3500 BCE onward",
    },
    entity_b: {
      text: "Egyptian basin irrigation system — single-river (Nile) annual-flood-driven; floodwater channeled into basins via earthen dikes; basins drained after sediment-deposition + crop-establishment. Minimal active hydraulic engineering required after initial basin construction; no salinization due to annual flood-renewal.",
      citation: "Karl W. Butzer, Early Hydraulic Civilization in Egypt (Univ. of Chicago, 1976); Eyre 1999 in Bowman & Rogan eds. Agriculture in Egypt",
      language: "Egyptian",
      tradition: "egyptian",
      approximate_date: "Continuous attestation c. 3500 BCE onward",
    },
    parallel_type: "structural",
    themes: ["irrigation_institutions", "hydrological_civilization", "agricultural_engineering"],
    deities: ["Enki", "Enbilulu", "Ninkasi", "Hapi", "Khnum"],
    texts: ["Hammurabi Code §§53-56", "Egyptian administrative agricultural texts"],
    correspondence_strength: "moderate",
    scholarly_attribution: [
      {
        author_year: "Adams 1981",
        publication:
          "Robert McC. Adams, Heartland of Cities: Surveys of Ancient Settlement and Land Use on the Central Floodplain of the Euphrates (Chicago: University of Chicago Press, 1981)",
        argument_summary:
          "Foundational archaeological-landscape study reconstructing Mesopotamian irrigation networks across millennia. Adams discusses the divergent hydrological + institutional structures of Mesopotamian canal irrigation vs Egyptian basin irrigation as the two paradigmatic ANE 'hydraulic civilizations.' Both produced agricultural surplus enabling complex civilization but via fundamentally different water-management approaches.",
      },
      {
        author_year: "Butzer 1976",
        publication:
          "Karl W. Butzer, Early Hydraulic Civilization in Egypt: A Study in Cultural Ecology (Chicago: University of Chicago Press, 1976)",
        argument_summary:
          "Counterpart to Adams 1981 — the foundational study of Egyptian basin irrigation. Butzer demonstrates the institutional + ecological differences: Nile basin irrigation requires far less centralized authority and produces no salinization, in contrast to Mesopotamian canal irrigation. Both Adams + Butzer effectively pair these traditions as the two paradigmatic ANE hydraulic-civilization types.",
      },
      {
        author_year: "Jacobsen & Adams 1958",
        publication:
          "Thorkild Jacobsen & Robert McC. Adams, 'Salt and Silt in Ancient Mesopotamian Agriculture,' Science 128.3334 (1958): 1251-1258",
        argument_summary:
          "Documents the long-term salinization-driven decline of Mesopotamian agricultural productivity + the wheat-to-barley shift c. 2400-1700 BCE — explicitly contrasted with Egyptian agricultural stability due to annual Nile flood-renewal. The single most-cited comparative agricultural-ecological argument in ANE studies.",
      },
    ],
    transmission_hypothesis: "common_substrate",
    discovery_origin: {
      discovered_by: "human_scholar",
      promoted_on: "2026-05-15",
      discovery_candidate_pair: "v0.11 Farming expansion — Mesopotamia_Agricultural_Comparative.md Tier-1 recommendation",
    },
    notes:
      "v0.11.0 Farming expansion. The two paradigmatic ANE hydraulic-civilization traditions. Diverged in both institutional structure (centralized vs distributed water-management) and ecological trajectory (salinization vs stability). The Wittfogel 'hydraulic despotism' thesis attempted to unify them politically; modern scholarship (Adams 1981; Trigger 2003) has substantially rejected unification in favor of recognizing institutional + ecological diversity.",
  },
];

// =============================================================================
// antediluvianParallels.json — 2 new Hebrew-anchored agricultural parallels
// =============================================================================

const newAntediluvianQueries = [
  {
    query_match: {
      text_id: "genesis",
      passages: ["Exodus 21:1-23:33", "Deuteronomy 19:1-25:19"],
      topics: [
        "covenant_code",
        "agricultural_laws",
        "livestock_liability",
        "irrigation_canal_breach",
        "fugitive_slave",
        "thresher_ox",
        "fruit_tree_damage",
      ],
    },
    passage_text:
      "If a man leave his ox loose, and he go into another man's field, and feed thereof; of the best of his own field, and of the best of his own vineyard, shall he make restitution. If fire break out, and catch in thorns, so that the shocks of grain, or the standing grain, or the field be consumed therewith; he that kindled the fire shall surely make restitution... Thou shalt not muzzle the ox when he treadeth out the grain.",
    passage_translator: "ASV 1901 — Exodus 22:5-6 + Deuteronomy 25:4 (composite)",
    results: [
      {
        mesopotamian_source: {
          text: "Hammurabi Code agricultural laws (§§42-65 land + §§53-56 irrigation-canal-breach liability + §240+ ox + thresher-ox laws). The single longest legal-textual continuous corpus addressing agricultural responsibility in the ANE; provides specific liability rules for livestock damage, fire-spread, canal-breach, fugitive-slave, fruit-tree damage, etc.",
          citation: "Roth 1995 Law Collections from Mesopotamia and Asia Minor (SBL WAW 6, pp. 84-105); Westbrook 1988 + 1994",
          language: "Akkadian",
          approximate_date: "Hammurabi reign c. 1792-1750 BCE; legal substrate older",
        },
        parallel_type: "narrative",
        correspondence_strength: "strong",
        scholarly_attribution: [
          {
            author_year: "Wright 2009",
            publication:
              "David P. Wright, Inventing God's Law: How the Covenant Code of the Bible Used and Revised the Laws of Hammurabi (New York: Oxford University Press, 2009)",
            argument_summary:
              "Argues for SUBSTANTIAL DIRECT DEPENDENCE of the biblical Covenant Code (Exodus 21-23) + adjacent Deuteronomic agricultural laws on the Laws of Hammurabi. Evidence: (1) sequential ordering of specific laws in the biblical text matches Hammurabi's ordering at the section level; (2) specific wording shows borrowing not just structural similarity; (3) characteristic inversions + reversals (e.g. fugitive-slave laws — Hammurabi §16-17 require return; Deuteronomy 23:15-16 prohibits return — exact reversal patterns characteristic of literary citation-via-revision). Hammurabi §53-56 (irrigation-canal-breach liability) ↔ Exodus 22:5-6 (fire-spread liability) is one of Wright's specific parallel cases. Wright's position is increasingly accepted in mainstream biblical-studies but remains contested; some scholars (Roth, Westbrook) maintain shared ANE legal substrate framing without direct dependence.",
          },
          {
            author_year: "Westbrook 1988",
            publication:
              "Raymond Westbrook, Studies in Biblical and Cuneiform Law, Cahiers de la Revue Biblique 26 (Paris: Gabalda, 1988)",
            argument_summary:
              "Pre-Wright foundational comparative-legal study treating biblical agricultural laws as drawing on ANE legal substrate including Hammurabi Code. Westbrook's position is shared-substrate rather than direct dependence — explicitly distinguishes from Wright 2009's stronger direct-dependence position. Foundational reference for comparative ANE legal scholarship.",
          },
          {
            author_year: "Roth 1995",
            publication:
              "Martha T. Roth, Law Collections from Mesopotamia and Asia Minor, SBL Writings from the Ancient World 6 (Atlanta: Scholars Press, 1995)",
            argument_summary:
              "Standard modern English critical edition of Hammurabi Code + other Mesopotamian + Hittite law collections. Roth provides the systematic English text + commentary that supports both Westbrook 1988's shared-substrate framing and Wright 2009's direct-dependence framing. Roth herself maintains a careful comparative position.",
          },
        ],
        transmission_hypothesis: "direct_borrowing",
        notes:
          "Promoted from v0.11.0 Farming expansion (2026-05-15). The Wright 2009 direct-dependence argument is THE strongest single Mesopotamia↔Hebrew Bible textual-dependence case in any axis of the cluster. Specific Wright-paralleled laws include: Hammurabi §53-56 (canal-breach liability) ↔ Exodus 22:5-6 (fire-spread); Hammurabi §59 (fruit-tree damage) ↔ Deuteronomy 20:19-20 (war-fruit-tree-protection); Hammurabi §240+ (thresher-ox not-muzzled) ↔ Deuteronomy 25:4 (thresher-ox not-muzzled — DIRECT verbal parallel); Hammurabi §16-17 (fugitive-slave-return required) ↔ Deuteronomy 23:15-16 (fugitive-slave-return prohibited — INVERSION as Wright's signature direct-dependence diagnostic). NOTE: this entry's transmission_hypothesis = direct_borrowing reflects Wright 2009's position; the older shared-substrate framing (Westbrook 1988) is also widely held.",
      },
    ],
  },
  {
    query_match: {
      text_id: "genesis",
      passages: ["Leviticus 25:1-55"],
      topics: ["jubilee_year", "sabbatical_year", "restorative_justice", "agricultural_reform", "social_reset"],
    },
    passage_text:
      "And ye shall hallow the fiftieth year, and proclaim liberty throughout the land unto all the inhabitants thereof: it shall be a jubilee unto you; and ye shall return every man unto his possession, and ye shall return every man unto his family... The land shall not be sold in perpetuity; for the land is mine: for ye are strangers and sojourners with me. And in all the land of your possession ye shall grant a redemption for the land.",
    passage_translator: "ASV 1901 — Leviticus 25:10, 23-24 (composite)",
    results: [
      {
        mesopotamian_source: {
          text: "Urukagina's reform inscriptions (Lagash, c. 2350 BCE) — the earliest documented social-reform texts in human history. Urukagina (also: Uru'inimgina), king of Lagash, issued reform inscriptions documenting + reversing: temple-priesthood land-monopoly abuses; tax-collection abuses; debt-slavery abuses; restorative measures returning land + freedom to common people. Foundational template for ANE + Mediterranean restorative-justice agricultural-economic reform tradition.",
          citation: "Cooper 1986 Presargonic Inscriptions (American Oriental Society); Lambert 1956",
          language: "Sumerian",
          tradition: "sumerian",
          approximate_date: "c. 2350 BCE (Urukagina's reign of Lagash)",
        },
        parallel_type: "structural",
        correspondence_strength: "moderate",
        scholarly_attribution: [
          {
            author_year: "Cooper 1986",
            publication:
              "Jerrold S. Cooper, Presargonic Inscriptions, Sumerian and Akkadian Royal Inscriptions Vol. 1 (American Oriental Society, 1986)",
            argument_summary:
              "Foundational publication of Urukagina's reform inscriptions. Cooper treats Urukagina's reforms as the earliest documented social-reform texts in human history — addressing land-monopoly abuses, debt-slavery, and tax-collection oppression. Notes the structural parallel to later ANE + Mediterranean restorative-justice traditions including the Israelite Jubilee year.",
          },
          {
            author_year: "Westbrook 1991",
            publication:
              "Raymond Westbrook, Property and the Family in Biblical Law, JSOT Supplement 113 (Sheffield: JSOT Press, 1991)",
            argument_summary:
              "Comparative-ANE legal study of biblical property laws including the Jubilee year. Treats the Israelite Jubilee as participating in broader ANE restorative-justice tradition rooted in Mesopotamian precedents like Urukagina's reforms and the Sumerian-Akkadian *mīšarum* (royal-edict debt-cancellation) tradition. The Jubilee year is the most-developed religious-systematic articulation of this ANE tradition.",
          },
          {
            author_year: "Wright 2009",
            publication:
              "David P. Wright, Inventing God's Law: How the Covenant Code of the Bible Used and Revised the Laws of Hammurabi (Oxford University Press, 2009)",
            argument_summary:
              "Within his broader argument for Hammurabi-Covenant-Code dependence, Wright notes the structural parallel between Mesopotamian royal restorative-edict tradition (Urukagina + Hammurabi's *mīšarum* + Ammisaduqa's edict) and the Israelite Jubilee + Sabbatical year traditions. Both traditions reset agricultural-economic relations periodically; both protect against permanent land-alienation; both frame the reset as divine + royal authority.",
          },
        ],
        transmission_hypothesis: "common_substrate",
        notes:
          "Promoted from v0.11.0 Farming expansion (2026-05-15). The structural parallel is between (a) royal-edict restorative-justice tradition (Urukagina + Hammurabi + Ammisaduqa) — episodic, periodically issued — and (b) Israelite Jubilee+Sabbatical — periodic, systematized into 7-year and 50-year cycles. The Israelite tradition is the most-developed religious-systematic articulation of this ANE tradition. Cross-reference Lagash_King_List.md §7-8 for the Urukagina reform context within Sumerian historiography.",
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

mp._meta.v0_11_0_farming_expansion = {
  date: "2026-05-15",
  new_parallels_added: newMesopotamianParallels.length,
  source: "Mesopotamia_Agricultural_Comparative.md framework brief (Tier-1 recommendations)",
};
ap._meta.v0_11_0_farming_expansion = {
  date: "2026-05-15",
  new_queries_added: newAntediluvianQueries.length,
  source: "Mesopotamia_Agricultural_Comparative.md framework brief (Hebrew-anchored Tier-1 agricultural-legal parallels)",
  wright_2009_anchor: "The Hammurabi↔Exodus/Deuteronomy direct-dependence parallel is the strongest single Mesopotamia↔Hebrew textual-dependence case in the cluster",
};

writeFileSync(MP_PATH, JSON.stringify(mp, null, 2) + "\n");
writeFileSync(AP_PATH, JSON.stringify(ap, null, 2) + "\n");

console.log("v0.11.0 Farming expansion applied.");
console.log(`  mesopotamianParallels.json: +${newMesopotamianParallels.length} entries → total ${mp.parallels.length}`);
console.log(`  antediluvianParallels.json: +${newAntediluvianQueries.length} queries → total ${ap.parallels.length} queries / ${ap.parallels.reduce((s, p) => s + p.results.length, 0)} results`);
