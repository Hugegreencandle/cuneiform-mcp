# Enrichment Tracks — Sourced Reference Data (2026-06-03)

> Multi-agent enrichment workflow (run wf_89474d3b-206): 6 tracks, 70 curated items -> **52 confirmed / 18 flagged** by adversarial fact-check. Agents grounded claims in the MCP's OWN tools (real P-/Q-/K- numbers retrieved live) + cited editions; a per-track fact-checker dropped/corrected/down-weighted everything unsupported. PROPOSAL ONLY — NOT yet written into data/ or wired into tools (this is load-bearing reference data; review before committing as canonical). Read the CAUTIONS section before using any item.

I have what I need. The MCP uses curated JSON in `data/` with `_meta` headers, versioned registries (compositions-v1.json), and tools that load them. Now I'll produce the committable plan.

---

# Cuneiform Enrichment Packaging Plan — MCP v0.79 → v0.80

Six adversarially-checked enrichment tracks, packaged for commit. Each surviving claim keeps its evidence. Flagged items are dropped or annotated per the fact-check, never silently shipped.

Repo conventions observed: curated data lives in `data/*.json` with a `_meta`/`$schema` header, a versioned registry pattern (`compositions-v1.json`), and TS loaders in `src/` (e.g. `apkalluAttestations.json` → `src/tools/comparative.ts`). Recommendations below follow that pattern.

---

## Track 1 — Apkallū (sages / iconography)

**Fact-check verdict: minor-issues. 8/12 confirmed. 4 flagged.**

### Confirmed enrichment

- **Uanna / Oannes — 1st antediluvian apkallu.** First of seven; paired with first king Ayalu/Alulim of Eridu; founder of writing/civilizing arts; Bīt Mēseri III epithet "who accomplishes the plans of heaven and earth"; Berossos' fish-bodied sage. — *Bīt Mēseri III.1-7 (Reiner, Orientalia 30, 1961, pp.4-5; re-ed. Borger, JNES 33, 1974, pp.183-196); Berossos F1 ap. Syncellus (Verbrugghe & Wickersham 1996, pp.43-47).* conf 0.92
- **Utuabzu — 7th apkallu, "who ascended to heaven."** Paired with Enmeduranki of Sippar; in-corpus `mu3-tu-abzu ABGAL`. Underpins the Enoch (Gen 5:24) comparison. — *ORACC cams/gkab P363353 (BagM Beih. 02, 089); Bīt Mēseri III.18-21 (Reiner 1961; Borger 1974). NOTE: cite line as the CDL-bundle locus (o 7), not the pager-snippet "o 6" — see Cautions.* conf 0.9
- **Enmeduranki of Sippar.** Antediluvian king summoned to heaven, shown lecanomancy + tablet of the gods; foundation myth of the bārû guild; paired with Utuabzu. — *Lambert, JCS 21 (1967), pp.126-138, DOI 10.2307/1359367 (ed. K.2486 + dupls.).* conf 0.9
- **Lu-Nanna — "two-thirds apkallu, one-third human."** Last sage in Bīt Mēseri, paired with Shulgi of Ur; divine-human hybrid descent; Annus links to Nephilim (Gen 6:4 / 1 Enoch 7:2). — *Bīt Mēseri III.28-29 (Reiner 1961, p.6; Borger 1974); Annus, JSP 19 (2010); IDD apkallu article.* conf 0.82
- **Nungalpirigal — 1st postdiluvian ummânu.** First sage of human descent after the Flood, paired with Enmerkar of Uruk; marks apkallū→ummânū transition; in-corpus `mNUN.GAL.PIRIG.GAL ABGAL`. — *ORACC cams/gkab P363353 (postdiluvian pair, CDL-bundle locus o 8 — see Cautions); Bīt Mēseri III.22-23; Lenzi 2008.* conf 0.9
- **Marduk as ABGAL DINGIR-MEŠ ("apkallu of the gods").** apkallu is a transferable wisdom-title, not only the named-sage tradition. **Fully corpus-confirmed verbatim.** — *ORACC cams/gkab P338385.5 (STT 1, 067 o 4); P363581.5 (CTN 4, 167 o 4); P348627.248 (SpTU 2, 022 + SpTU 3, 085 r ii 41), retrieved 2026-06-03.* conf 0.88
- **Uruk List of Kings and Sages (W 20030,7) — provenance & significance.** Excavated from the Bīt Rēš (Anu) temple at Uruk (1959/60), ed. princeps van Dijk UVB 18 (1962) pp.44-52 pl.27; Lenzi argues the genealogy legitimized the Anu-cult scholars' professional ancestry. — *Lenzi, JANER 8:2 (2008), pp.137-169, DOI 10.1163/156921208786611764.* conf 0.93
- **Apkallū three-type iconographic taxonomy (Wiggermann).** purādu fish-cloaked / bird-headed (apkallu-griffin) / ūmu human-form; confirmed by ritual texts + buried clay figurines. Foundation figurines were buried per Bīt Mēseri ("protected house") ritual. — *Wiggermann, Mesopotamian Protective Spirits (CM 1, 1992), pp.65-99.* conf 0.88 *(taxonomy only; specific museum object IDs flagged — see Cautions)*

### MCP mapping

- **Primary:** extend existing `data/apkalluAttestations.json` (schema already has `sages[]` with `attestations[]`, `paired_king`, `tier`, `discipline_specialization`, iconography by museum object). Feeds `apkallu_attestations` tool. **Effort S** for the textual/pairing items (Uanna, Utuabzu, Enmeduranki, Lu-Nanna, Nungalpirigal, Marduk-as-ABGAL) — they slot directly into the existing shape.
- **Corpus cross-links:** add the verified ORACC `cams/gkab` P-numbers (P363353, P338385, P363581, P348627) as `corpus_attestations[]` on the relevant sages so `apkallu_attestations` can hand off to `get_oracc_text`/`search_oracc`. **Effort S.**
- **Iconography:** update the existing iconography block to Wiggermann's three-type taxonomy with **corrected/lowered-confidence object IDs** (see Cautions). **Effort S.**

---

## Track 2 — Babylonian Map of the World (BM 92687)

**Fact-check verdict: clean. 11/11 confirmed. 1 cosmetic flag.**

### Confirmed enrichment

- **Identity & catalog.** BM 92687, Neo-Babylonian, Akkadian, genre "Scholarly or scientific," provenience Sippar-Yahrurum (Tell Abu Habbah). **In-corpus, retrieved live.** — *CDLI id 365726 / BM 092687 (get_tablet, MCP v0.79.0). BM registration `1882,0714.509` (canonical comma/period form — see Cautions).* conf 0.9
- **Provenance & physical.** Excavated by Rassam at Sippar (~60 km N of Babylon, east bank Euphrates); acquired 1882; 12.2 × 8.2 cm. — *BM object; Horowitz 1988.* conf 0.88
- **Dating.** Late/Neo-Babylonian copy, no earlier than 9th c. BC, late-8th/7th c. more likely (copy itself ~6th c. BC). — *Horowitz; BM dating.* conf 0.8
- **Standard editions.** Horowitz, "The Babylonian Map of the World," Iraq 50 (1988), pp.147-165, **DOI 10.2307/4200289**; re-edited in Horowitz, *Mesopotamian Cosmic Geography* (Eisenbrauns, MC 8, 1998). conf 0.85-0.92
- **marratu (bitter river / salt sea).** Encircling ring boundary, two concentric circles. — *Horowitz 1988; Wikipedia/CDLI Wiki.* conf 0.82
- **Eight nagû (outer regions).** "Travel 7 leagues" formula; five of eight descriptions survive on the damaged reverse. — *CDLI Wiki; Horowitz 1988.* conf 0.83
- **Interior geography.** Babylon (centre, astride Euphrates), Assyria, Urartu, Der, Susa (Elam), Habban, Bit-Yakin, southern marsh; Euphrates north→south. — *Horowitz 1988.* conf 0.78
- **Legend figures.** Utnapishtim, Sargon, Nur-Dagan (Sargon-legend opponent, king of Buršaḫanda) — links map to epic tradition. — *Horowitz 1988 (via secondary summaries).* conf 0.7
- **Reinterpretation.** Delnero, "A Land with No Borders," JANEH 4/1-2 (2017), pp.19-37, **DOI 10.1515/janeh-2017-0014** — challenges the Babylon-at-centre ideological reading. conf 0.85

### MCP mapping

- **New file:** `data/bm-map-of-world.json` (single-tablet enrichment record: catalog id, provenance, dating, editions w/ DOIs, the marratu/nagû/interior-label/legend-figure structured content, Delnero counter-reading). **Effort M.**
- **Existing tool feed:** register as a `composition` entry in `data/compositions-v1.json` (e.g. id `bm_map_of_world`, exemplar `BM.92687` / CDLI 365726, print_editions Horowitz 1988+1998 & Delnero 2017) so `identify_composition` / `list_compositions` surface it. **Effort S.**
- **No transliteration ingest** — MCP has no ATF/TEI edition of the tablet (interpretive content is reference-grounded, not corpus-retrieved). Keep `external_ids`/editions populated; do NOT claim an in-corpus edition.

---

## Track 3 — Lexical & omen series

**Fact-check verdict: minor-issues. 10/14 confirmed. 4 flagged (1 evidence-trail, 3 over-precise counts).**

### Confirmed enrichment

- **Urra=ḫubullu.** 24-tablet thematic Sumerian–Akkadian lexical series (~10,000 entries); standard edition MSL series (Landsberger, MSL V 1957 / MSL VI 1958, continuing). Titular incipit `ur₅-ra : ḫubullum` genuinely attested in DCCLT. — *MSL V/VI; incipit attestation real at P347786 = Ashm 1924-1547+ (MSL SS 1, 064), resolved via get_tablet. **Cite P347786's resolved edition line, NOT the unreproducible colon-snippets — see Cautions.*** conf 0.9
- **DCCLT corpus coverage (verified live).** 10,215 texts; 8,123 genre "Lexical"; 4,831 full editions; 5,302 Old Babylonian. **EXACT, retrieved.** — *oracc_index_project project=dcclt, 2026-06-03.* conf 0.97
- **Enūma Anu Enlil.** ~70-tablet celestial-omen series (lunar 1-22, solar ~23-30, weather, planetary/stellar ~50-70). Reiner & Pingree, BPO 1-4 (1975-2005); van Soldt, Solar Omens, PIHANS 73. EAE commentary **fully retrieved**: P238552 (ccpo, Nineveh NA, 57 lines, Saturn=`{d}UDU.IDIM.SAG.UŠ`, eclipse `AN.GE₆`). — *oracc_get_edition ccpo P238552.* conf 0.9-0.95
- **Sakikkû / SA.GIG.** 40-tablet diagnostic series in 6 sub-sections, serialized by Esagil-kīn-apli under Adad-apla-iddina (~1068-1047 BCE). Labat TDP (1951); Heeßel AOAT 43 (2000); Schmidtchen catalogue ed. CCP returns 105 "Sagig" commentary hits (verified). Witnesses P273377 (TDP pl.63, BM 46228), P396964 (AOAT 43). conf 0.9
- **Bārûtu.** 10-chapter extispicy series; front-of-liver chapters Manzāzu/Padānu/Pān Tākalti ed. Koch-Westenholz, *Babylonian Liver Omens* (CNI 25, 2000). Witnesses P394461 (K 2484+, Nineveh), P363330 (BagM Beih. 02, Uruk Hellenistic). conf 0.85-0.88
- **Maqlû.** 9 tablets (8 incantation + 1 ritual), ~100 incantations, performed over one night/morning at end of month Abu. Abusch, AMD 10 (Brill, 2016) + SAACT student ed. Witness P363506 = CTN 4, 092 = IM 067635 (Kalhu, NA, "Ritual and liturgical") **verified via get_tablet.** conf 0.92-0.93
- **Šumma ālu.** ~120-tablet terrestrial-omen series (>13,000 omens); Freedman, *If a City Is Set on a Height*, 3 vols. (1998/2006/2017, Tablets 1-63). conf 0.88

### MCP mapping

- **Primary:** these six series already exist in `data/compositions-v1.json` (the changelog explicitly lists "EAE, Maqlû, Šumma izbu, Šumma ālu, Bārûtu base, Diri/Aa lexical"). **Enrich the existing entries** with: tablet counts, sub-section structure, standard-edition `print_editions[]`, and the **verified corpus-witness P-numbers** as `exemplar_tablets[]` / `corpus_witnesses[]`. **Effort M** (one structured pass per series, feeds `identify_composition` + `list_compositions`).
- **Commentary linkage:** the EAE/SA.GIG ccpo edition IDs (P238552, P273377, P396964) wire into `oracc_get_edition` and the ccpo commentary data already in `data/ccpo-commentary-compositions.json`. **Effort S.**
- **Counts metadata is reference-sourced, not corpus-encoded** — tag tablet-count fields with edition evidence, never as a corpus query result.

---

## Track 4 — Core pantheon

**Fact-check verdict: minor-issues. 11/14 confirmed. 3 flagged (citation misattributions, all fixable).**

### Confirmed enrichment (epithets verbatim from RINAP 1 Q003448 = Tiglath-pileser III 35, i 1-11, ed. Tadmor & Yamada 2011, unless noted)

- **Aššur** — "Enlil of the gods, who decrees fates" (`aš-šur EN GAL dEN.LIL2.LA2 DINGIR.MEŠ mu-ši-me NAM.MEŠ`, i 1); temple Ešarra in Assur; AN.ŠÁR=Anšar syncretism (SAA 3 1 / P334930, Ashurbanipal Coronation Hymn). conf 0.95-0.97
- **Marduk** — "who formulates the designs, creator of mankind, who makes firm the foundations of the land" (i 2-3); Bēl, temple Esagil. conf 0.96
- **Nabû** — "holder of the stylus, bearer of the tablet of the destinies of the gods" (`dAG ta-mi-ih GI.DUB na-ši DUB ši-mat DINGIR.DINGIR`, i 4); Ezida/Borsippa. conf 0.96
- **Sîn** — "bright luminary, who gives sceptre and crown, establishes lordship" (i 8); Ur, Ekišnugal. conf 0.96
- **Adad** — "canal-inspector of heaven and earth, who heaps up abundance" (i 9); Karkar (per AMGG). conf 0.93
- **Ea** — "lord of wisdom, who fashions everything there is and beautifies (its) creatures" (i 10); Eridu, E-abzu. conf 0.96
- **Ištar** — "who loves the king, her favourite" (i 11; i 28 `mu-ṭib lib₃-bi iš₈-tar₂`); Uruk, Eanna. *(The "bēlet tāḫāzi u qabli" epithet must be re-cited — see Cautions.)* conf 0.9
- **Nergal** — warrior "whose onslaught cannot be opposed" (i 5-6); Cutha, Emeslam (per AMGG). conf 0.92
- **Anu** — sky-god, Uruk (Eanna / later Bīt Rēš), apex of An = Anum. *(AMGG-sourced; An=Anum has no seeded exemplar tablets in MCP.)* conf 0.78
- **Enlil** — "who decrees the fates," Nippur/Ekur; rank transferred to Aššur. *(AMGG + transfer attestation.)* conf 0.85

### MCP mapping

- **New file:** `data/core-pantheon.json` — deity records: name, alt_names (Sumerian), epithets[] (each with transliteration + RINAP Q-number + line + edition), cult_centre, temple, source-tier (`corpus` vs `amgg`). **Effort M.**
- **Existing tool feed:** wire into `entityInventory.json`-backed lookups (the entity inventory already exists). Deities map cleanly to entity entries; the pantheon file becomes the authoritative epithet/cult-centre layer. **Effort M.**
- **Confidence discipline:** AMGG-only cult-centre facts stay at 0.78-0.85; corpus-line epithets at 0.9+. Never present a CDLI keyword `search_tablets` hit as a deity attestation (it returns personal/place names — see notes).

---

## Track 5 — Flood tradition

**Fact-check verdict: minor-issues. 11/13 confirmed. 1 substantive (drop third exemplar), 1 minor.**

### Confirmed enrichment

- **Sumerian Flood Story (Ziusudra).** CDLI Literary Q000357. **Two exemplars** (corrected): ex.001 = CBS 10673 + CBS 10867 (cdli_id 265876, OB Nippur, the principal/sole-source witness); ex.002 = MS 3026 (Schøyen, cdli_id 252032, informally reported). Lines 1-36 + landfall lost. — *get_tablet Q000357; Penn Museum / Peterson 2008. **DROP the claimed "Ur exemplar"; lower conf to ~0.85 — see Cautions.*** conf 0.85
- **Atra-ḫasīs.** OB base = CT 46, 03 = BM 78942 + BM 78971 + BM 80385 (+) MAH 16064 (cdli_id 285811, Sippar-Yahrurum); later witnesses IM 124646, IM 124649, K 14697 (all verified). Ed. Lambert & Millard 1969, pp.42-105. conf 0.95
- **Wall-loophole forewarning motif.** Across all three witnesses (Sumerian 135-162; Atra-ḫasīs III.i.11-50; Gilg XI.20-31); removed in Gen 6:13-22. — *compare_flood_narratives; Civil/Lambert & Millard 1969; George 2003 vol.1 pp.706-709; Westermann 1984.* conf 0.93
- **Flood duration ~7 days.** Sumerian 7/7; Atra-ḫasīs III.iv.25 7/7; Gilg XI.96-131 6/7; Genesis diverges (40 days rain, 150 prevailing — Priestly). conf 0.9
- **Ūta-napišti (Gilg XI).** Cube boat (6 decks, 9 compartments/deck, XI.48-85); grounds on Mt Nimush (=Niṣir); dove/swallow/raven (XI.141-156, reverse of Genesis); "gods gathered like flies" inherited from Atra-ḫasīs. — *George 2003 vol.1 pp.704-721. (Cited to edition — no CDLI ID for the Gilg XI flood MS surfaced.)* conf 0.92
- **Enmeduranki ↔ Enoch.** 7th antediluvian king (SKL, WB 444), 7th-from-first parallel to Enoch; both ascend/receive divine knowledge. — *find_antediluvian_parallel; Lambert 1967; Kvanvig 1988; Annus 2010. (WB 444 not in corpus — curated + Lambert.)* conf 0.9
- **Utuabzu ↔ Enoch.** 7th apkallu "ascends to heaven," Bīt Mēseri III.18-21 — second 7th-figure parallel. — *Reiner 1961; Borger 1974.* conf 0.88
- **Uanna/Oannes ↔ Berossos.** Links Mesopotamian seven-sages tradition to Hellenistic flood/Xisouthros frame. — *Reiner 1961; Verbrugghe & Wickersham 1996 (F1).* conf 0.85
- **Mother goddess as co-creator/syncretism.** Bēlet-ilī (Ninhursag/Ninmah/Nintu/Mami) creates humanity from slain-god blood + clay (Atra-ḫasīs I.190-260); equated (DINGIR.MAḪ / dNIN.TU) with Hurrian-Hittite Ḫannaḫanna. — *find_mesopotamian_parallel mp-mother-goddess-1; von Schuler RlA 4; Beckman StBoT 29; Asher-Greve & Westenholz OBO 259.* conf 0.86
- **Survivor rewards diverge.** Ziusudra → eternal life in Dilmun; Ūta-napišti → "mouth of the rivers"; Atra-ḫasīs → population controls (mortality, miscarriage, celibate priestesses, Pašittu); Genesis → covenant + "be fruitful." conf 0.88
- **Utu epiphany (Sumerian-only).** Ziusudra prostrates before risen sun-god Utu, sacrifices ox+sheep (lines 240-250); absent from Atra-ḫasīs and Gilg XI. conf 0.84

### MCP mapping

- **Primary:** enrich existing `data/floodAlignment.json` (+ `antediluvianParallels.json`, `mesopotamianParallels.json`) — these back `compare_flood_narratives`, `find_antediluvian_parallel`, `find_mesopotamian_parallel`. Add verified manuscript IDs (Q000357 ex.001/002, CT 46 03 cdli 285811, IM/K witnesses) to the witness lists. **Effort M.**
- **Corpus IDs only where retrieved** — Gilg XI and WB 444 stay edition-cited (no live CDLI ID), preserving the existing curated `scholarly_attribution` evidence. **Effort S.**

---

## Track 6 — Site gazetteer

**Fact-check verdict: minor-issues. 12/12 evidence-clean. 2 ORACC archive items need "every→subset" softening.**

### Confirmed enrichment (all 12 CDLI anchor IDs + 12 Pleiades coordinates verified live)

| Site (modern) | Pleiades | lat / lon | Anchor CDLI ID | Note |
|---|---|---|---|---|
| Nineveh (Kuyunjik) | 874621 | 36.361 / 43.160 | — | Library of Ashurbanipal; K/Sm prefixes |
| Nippur (Nuffar) | 912910 | 32.126 / 45.231 | 385414 (OECT 10) | Sumerian literary "Tablet Hill" |
| Sippar (Tell Abu Habbah) | 894089 | 33.060 / 44.254 | 107424 (Edinburgh 02) | Ebabbar/Šamaš; temple library |
| Uruk (Warka) | 912986 | 31.323 / 45.639 | 3 (ATU 3, archaic) | Type-site of earliest writing; Rēš library |
| Babylon (Bābil) | 893951 | 32.537 / 44.425 | 347160 (VS 24) | ~225 BM commentaries |
| Aššur (Qalat Sherqat) | 893945 | 35.456 / 43.261 | 540653 (Frahm MDOG 134) | House of the exorcist |
| Kalḫu / Nimrud | 894019 | 36.100 / 43.332 | 224378 (CTN 5 ND 2390) | Nimrud Letters; state archives |
| Girsu / Tello | 912855 | 31.560 / 46.178 | 10055 (DP 038) | Pre-Sargonic + Ur III archives |
| Ur (Tell al-Muqayyar) | 912985 | 30.961 / 46.106 | 346186 (UET 6, Q000509) | Ur III + OB school tablets |
| Mari (Tell Hariri) | 286681704 | 34.550 / 40.889 | 127807 (ARM 19) | **SYRIA, not Iraq;** Mari letters |

- **In-corpus ORACC archive anchors (verified):** SAA 1 (saao/saa01, 265 NA admin letters; **a subset incl. SAA 01 175 = P224395 is prov. Nimrud/Kalhu** — corrected from "every"); RINAP 4 (rinap/rinap4, 183 Esarhaddon royal inscriptions; **a large subset incl. Esarhaddon 001 = Q003230 = P462851 is prov. Kuyunjik/Nineveh** — corrected). — *oracc_index_project; Parpola SAA 1 1987; Leichty RINAP 4 2011.* conf 0.97
- **Library/archive characterizations** (Ashurbanipal library size, Sippar Ebabbar, Uruk Rēš, Babylon BM commentaries, Assur House-of-the-exorcist) — *Cuneiform Commentaries Project (ccp.yale.edu), reference-cited not invented.* conf 0.90

### MCP mapping

- **New file:** `data/site-gazetteer.json` — per-site record: canonical name, modern name, Pleiades id + URL, lat/lon (store as lat/lon explicitly; Pleiades JSON is [lon,lat] — see Cautions), country, period range observed, anchor CDLI ID, library/archive note (reference-tier). **Effort M.**
- **Existing tool feed:** wire into `find_tablets_by_provenance` / `findByProvenance.ts` (which currently uses bare city strings like 'Sippar','Nineveh') as a normalized provenance→coordinate lookup layer. Adds geospatial grounding to provenance queries. **Effort M.**
- **Do not use** the local `find_tablets_by_provenance` enriched-metadata cache for site strings on these prefixes (returned ZERO for Nineveh without `enrich_prefix_metadata` first); CDLI live catalog is the working route.

---

## CAUTIONS — flagged, dropped, corrected, and low-coverage

### Items DROPPED outright
- **Flood / Sumerian Flood Story "third (Ur) exemplar"** — does not exist; corpus returns only 2 exemplars; contradicted by Penn Museum / Peterson 2008 ("sole source… searched in vain for duplicates"). Drop it; reframe as two exemplars (Schøyen informally reported); lower conf 0.97→0.85.
- **Pantheon / Šamaš fuller epithet** "šar šamê u erṣeti bānû ṣalmāt qaqqadi" — NOT present in cited Q003448 i 7 (which reads only "bestows protection"). Drop the corpus attribution; keep only the in-corpus "bestows protection" + "listed among great gods." The fuller epithet is AMGG/standard-knowledge if retained at all.

### Items CORRECTED before commit (real fact, wrong citation/locus)
- **Pantheon / Marduk triad** (Bēl-Nabû-Nergal, Esagil/Ezida/Emeslam) — cited Q003429 is the WRONG text (a military-campaign text with no such passage). Correct to **Q006333 / Q006329** (TP III Annals). Quotation is genuine; ID was misattributed.
- **Pantheon / Ištar "bēlet tāḫāzi u qabli"** — cited Q003449 line 11' is WRONG (reads "Sarduri of Urarṭu…"). Correct to **Q003416 (TP III 3), line 3**. The Q003448 portions of the same item are correct and stay.
- **Apkallū line labels** — pager-snippet loci "o 6" (Utuabzu) and "o 7" (Nungalpirigal) disagree with the authoritative `oracc_get_edition` CDL bundle, which places **Utuabzu at o 7** and **Nungalpirigal at o 8**. Use the bundle loci and note the pager/CDL numbering conflict.
- **Apkallū Item-2 pairing list** — silently dropped the FIRST pair **Ayalu : Uanna (U₄-d60 ABGAL, o 1)** while folding in a POSTdiluvian pair (Enmerkar : Nungalpirigal, o 8). Restate the list to include Ayalu:Uanna and explicitly mark Enmerkar:Nungalpirigal as postdiluvian. "Each antediluvian king paired with his apkallu" overstates the quoted lines.
- **BM 92687 registration number** — render canonically as **`1882,0714.509`** (comma + period), not the hyphenated web-slug `1882-0714-509` / `W_…`. Cosmetic; same object.
- **Lexical / Urra incipit (Item 2)** — the quoted `search_oracc` colon-snippets (`[ur₅-ra] : ḫu-bul-lum`, line-refs like "K 2016A+ r iii 25'") do NOT reproduce live (ḫubullu search = 0 hits; ur5-ra returns different P-ids). The underlying attestation IS real. Cite **P347786's resolved edition line** (`o i 1: ur₅-ra hu-bul-lum`, no colon) directly; drop the unreproducible snippets; lower conf 0.95→0.9.

### Counts WIDENED to match actual tool output (over-precision)
- EAE: claimed "81-85" → tool returns **76-100**.
- SA.GIG / sa-gig: claimed "26-30" → tool returns **26-50**.
- Maqlû: claimed "91-100" → tool returns **76-100**.
- All three are CDLI keyword `page_estimate` ranges (noisy; conflate base texts, commentaries, modern publication titles). Treat as lower-bound corpus presence, NOT canonical exemplar counts.

### Iconographic object IDs — UNVERIFIED externally (tool-grounded only, lower confidence)
- **BM 124577** (fish-cloaked apkallu) — unconfirmed; likely a slip for the well-attested **BM 124573**. Swap to BM 124573 or lower confidence and label tool-grounded.
- **MMA 32.143.7** described as "bird-headed apkallu" — the Met catalogues it as a king-and-attendant panel; the bird-headed bucket-and-cone figure is a *different* Met object. Over-specific; relabel or drop the "bird-headed" identification.
- **AO 19849** (Khorsabad, Sargon II) — within the genuine Louvre accession range but its subject as a bird-headed apkallu on "façade L" is unconfirmed.
- **VA Ass 03595 / deposit "Qd. kB 9I"** (Aššur figurine) — the *practice* (purādu-fish figurines buried in the priest's house) is solidly Wiggermann 1992; the specific museum number + deposit locus are unverified, curated-index-only. Keep the practice; lower confidence on the exact object ID.

### Low / no MCP corpus coverage (reference-grounded, NOT corpus-retrieved — do not claim in-corpus)
- **BM Map of the World:** NO ATF/TEI edition in MCP; `marratu`/`nagû` ORACC searches returned only unparsed pager hits. All textual/interpretive content is Horowitz/Delnero/reference-grounded. The CDLI designation string `CT 22, pl. 48, BM 092687` mis-attaches a Neo-Babylonian Letters publication — do NOT cite CT 22 as the map's edition.
- **Apkallū:** Berossos/Oannes, Bīt Mēseri line attributions, and ALL relief/figurine iconography are NOT in the searchable corpus (curated index + published editions only). `find_antediluvian_parallel` returned empty for `seventh_patriarch_ascent` — Utuabzu↔Enoch and Lu-Nanna↔Nephilim carry Annus 2010 anchors, not a dedicated parallel record (lower confidence).
- **Lexical/omen tablet counts** (24 Urra, ~70 EAE, 40 SA.GIG, 10 Bārûtu chapters, 9 Maqlû, ~120 Šumma ālu): edition/reference-sourced; the MCP does NOT encode series-tablet-count metadata. ccpo search hits flagged "unparsed (markup variant)" — report total_hits counts, not parsed snippets, except where `oracc_get_edition` succeeded (EAE P238552).
- **Pantheon:** corpus is divination/incantation/royal-inscription-centric, NOT a pantheon-hymn corpus. An=Anum (id `an_anum`) has ZERO seeded exemplar tablets → Anu/Enlil rest on AMGG + transfer attestation. CDLI keyword `search_tablets` for deity names is NOISY (returns personal names, place names) — never use as deity attestation.
- **Flood:** Gilg XI flood MS not surfaced as a CDLI ID (George 2003 edition-cited). WB 444 (SKL) not confirmed as a CDLI record (curated + Lambert 1967). `cams/gkab` "flood" hits are abūbu-as-weapon/omen, NOT the flood-survivor narrative — excluded.
- **Site gazetteer:** Pleiades JSON returns **[lon, lat]** order — store coordinates explicitly as lat/lon to avoid the transposition slip caught in the original sweep (e.g. Nippur 45.23/32.12 → corrected to lat 32.126 / lon 45.231). Local `find_tablets_by_provenance` cache unreliable for site strings without `enrich_prefix_metadata`. Periods listed per site are sampled from returned CDLI records, not full occupation ranges. Library characterizations are CCP-reference-tier, not corpus-retrieved.

---

## Commit summary

| Track | Target file | Existing tool fed | Effort | New file? |
|---|---|---|---|---|
| Apkallū | `data/apkalluAttestations.json` | `apkallu_attestations` | S | no |
| BM Map of World | `data/bm-map-of-world.json` + `compositions-v1.json` | `identify_composition`, `list_compositions` | M | yes |
| Lexical/omen series | `data/compositions-v1.json` + `ccpo-commentary-compositions.json` | `identify_composition`, `oracc_get_edition` | M | no |
| Core pantheon | `data/core-pantheon.json` + `entityInventory.json` | entity lookups | M | yes |
| Flood tradition | `data/floodAlignment.json`, `antediluvianParallels.json`, `mesopotamianParallels.json` | `compare_flood_narratives`, `find_antediluvian_parallel` | M | no |
| Site gazetteer | `data/site-gazetteer.json` | `find_tablets_by_provenance` | M | yes |

All new/edited files follow the repo's `_meta`/`$schema` header convention. Bump curated-data version with v0.80; per the MEMORY update-checklist, sync tool counts and any README/PROTOCOL references after commit. No claim ships without its evidence; every flagged item above is dropped, corrected, or confidence-lowered as specified.

Relevant absolute paths:
- `/Users/danebrown/Desktop/cuneiform-mcp/data/apkalluAttestations.json`
- `/Users/danebrown/Desktop/cuneiform-mcp/data/compositions-v1.json`
- `/Users/danebrown/Desktop/cuneiform-mcp/data/floodAlignment.json` (+ `antediluvianParallels.json`, `mesopotamianParallels.json`, `entityInventory.json`, `ccpo-commentary-compositions.json`)
- `/Users/danebrown/Desktop/cuneiform-mcp/src/tools/comparative.ts` (apkallu loader)
- `/Users/danebrown/Desktop/cuneiform-mcp/src/findByProvenance.ts` (gazetteer consumer)
- New: `/Users/danebrown/Desktop/cuneiform-mcp/data/bm-map-of-world.json`, `data/core-pantheon.json`, `data/site-gazetteer.json`
