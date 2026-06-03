# Research — Expansion Scout (2026-06-03)

> Multi-agent scout workflow (run wf_efc27edc-ad8): 28 sources scouted -> 14 verified real, 10 discovery functions proposed. Each source adversarially verified for real access + license; anti-overclaim. PROPOSAL ONLY — nothing wired into the MCP yet. Sequenced against v0.79 / 116 tools, excluding everything already integrated (Oracc/CCP/SumTablets/eBL/ProtoSnap/CDLI/OGSL) and on-backlog (DeepScribe, Prosobab, EvaCun, HeiCuBeDa).

I have enough verified data to synthesize this directly. No further investigation is needed since the sources are pre-verified and the proposed functions are fully specified.

# Cuneiform MCP Expansion Roadmap (from v0.79 / 116 tools)

## (A) Top New Scrapable Sources — ranked, commercial-friendly first

| # | Source | Holdings | Access | License | Why it's new | Effort |
|---|--------|----------|--------|---------|--------------|--------|
| 1 | **MTAAC Gold Corpus** (cdli-gh/mtaac_gold_corpus) | 372 manual + 610 auto Ur III Sumerian texts, ~24.6k tokens, per-morpheme lemma/POS/morph in CDLI-CoNLL | git clone (branch `workflow`, files under `morph/external/`) | **CC0** ✅ | Gold morphological annotation, not bare transliteration; distinct from CDLI ATF + SumTablets | S |
| 2 | **Pleiades** gazetteer | 41,480 ancient places w/ lat-lon, stable IDs | bulk `pleiades-places-latest.json.gz` (atlantides.org, daily-fresh, no auth) | **CC BY 3.0** ✅ | First coordinate/geo authority in the MCP (zero lat/lon today). Note: Greco-Roman-weighted, thin ANE | S |
| 3 | **Achemenet (Helsinki/Alstola)** | ~2,830 Achaemenid-period (539–330 BCE) Babylonian texts, lemmatized/POS in ATF/CONLL-U/VRT | Zenodo `19067652` bulk zip (~2 MB) | **CC BY 4.0** ✅ | Late-period Babylonian register; conf 0.97 | M |
| 4 | **SAAo morphosyntactic treebank** (Ong 2024) | ~2,600 NA letters, 10 SAAo vols, POS+lemma+morph+dependencies, CONLL-U/spaCy/Turtle | Zenodo `10622983` (~7.6 MB conllu zip) | **CC BY 4.0** ✅ (corrected — NOT BY-SA) | Gold dependency/dialect layer; conf 0.95 | M |
| 5 | **PNA Social Network** (Jauhiainen et al.) | 17,000+ Neo-Assyrian persons, co-occurrence + person↔text graphs, per-person metadata, CSV+Gephi | Zenodo `5862904` (Networks.zip 5.66 MB) | **CC BY-SA 3.0** ⚠️ share-alike | First historical-person social layer; ships derived graph only (no PNA prose) | M |
| 6 | **MAPA gazetteer** (DigitalPasts/MAPA) | ~377 Uruk-hinterland toponyms, coords + Pleiades/WHG IDs, Linked Places JSON-LD | Zenodo `6411251` v1.0 (canonical) | **CC BY-SA 3.0** ⚠️ share-alike | Mesopotamia-dense toponym layer. **Do NOT advertise CDLI crosswalk** (verified 8/381 only) | S |
| 7 | **TLHdig — Hittite/Anatolian** (HPM Mainz) | ~22k XML docs / ~400k lines; Hittite + Luwian/Palaic/Hattic/Hurrian + Hittite-context Akk/Sum | Zenodo `15459134` bulk XML zip (use zenodo_get/browser — WAF 403s curl) | **CC BY 4.0** ✅ | First non-Mesopotamian script family in the engine | L |
| 8 | **Yale LUX / IIIF** (Peabody Babylonian) | ~25,670 imaged cuneiform records; IIIF Image API 2.0 level2 region/tile | LUX Linked Art search → `/ypm/nat/<numericId>` manifest → Image API | **CC0** ✅ | First deep-zoom region-crop image channel (vs flat eBL JPEGs) | L |
| 9 | **Akkademia / `akkadian` pip** (gaigutherz) | sign→translit tagger (HMM/MEMM/BiLSTM 96.7%) | git+pip; **Python 3.7-only** (hard friction) | **MIT** ✅ (NOT the README's CC BY-SA) | Could feed infer_damaged_sign | M |
| 10 | **BabyLemmatizer 2.x + HF models** (asahala) | per-dialect lemmatizer+POS (NA/MA/Bab1/Bab2/Sumerian/Urartian) | git clone + HF .tar.gz (local pipeline, no API) | **UNCLEAR** ⚠️ no LICENSE file | Multi-dialect morphology attach | M |

**Non-commercial sources** (research/sidecar only — see Cautions): ETCSL, Munich sign-image dataset, SEAL, BDTNS.

## (B) Top New Discovery Functions — ranked

**1. `index_entity_attestations`** — *needs:* no new source (reuses Oracc CDL `pos`/`cf` tags already extracted in `src/oracc/cdl.ts`); optional MAPA toponym normalization. *Unlocks:* inverts text-centric search into person/place/deity-centric — "where does king/deity/place X appear across all corpora, in what period/genre mix." Foundation layer for all prosopography. **M.** *Risk:* indexes ONLY already-tagged entities (no NER on raw translit); must report per-corpus coverage honestly; homonym collision unresolved; do NOT advertise MAPA CDLI bridge.

**2. `link_prosopographical_network`** — *needs:* PNA Zenodo `5862904` (CC BY-SA 3.0 ⚠️). *Unlocks:* turns the corpus into a queryable Neo-Assyrian social graph (ego-networks, professions, shared-text edges) joined to corpus lines via #1. No person-as-social-actor layer exists in 116 tools. **M.** *Risk:* share-alike copyleft → fetch-on-demand, don't bake into proprietary output; NA-only; derived graph only (no PNA prose); join is partial pending name-normalization.

**3. `geocode_find_spots`** — *needs:* Pleiades (CC BY 3.0 ✅) + MAPA (CC BY-SA 3.0 ⚠️). *Unlocks:* first coordinate layer — resolves free-text find-spots to lat/lon + Pleiades IDs; surfaces collection-vs-find-spot conflicts geographically. **M.** *Risk:* low match rate MUST be reported (Pleiades thin on ANE, MAPA Uruk-scoped, find-spot field is often a collection proxy); flag ambiguous, never invent coordinates.

**4. `map_chunk_geodiffusion`** — *needs:* #3 + existing `chunkIndex.ts`/`trace_chunk_diffusion`. *Unlocks:* spatial counterpart to chronological diffusion — haversine spread, centroid, max inter-site distance → locally-copied vs pan-Mesopotamian travelling text. **M.** *Risk:* bounded by geocoding coverage (report `n_geocoded` vs `n_total`); site-level approximations; descriptive geometry, NOT a causal trade-route claim.

**5. `ingest_hittite_archive` + `profile_anatolian_sign_repertoire`** — *needs:* TLHdig Zenodo `15459134` (CC BY 4.0 ✅). *Unlocks:* first non-Mesopotamian corpus; cross-archive recension discovery (Boğazköy Akkadian copies vs eBL/Oracc originals via sign-sequence parallels) + Anatolian-vs-Mesopotamian repertoire scoring. **L.** *Risk:* sign-sequence matching only — strongest for Hittite-context Akk/Sum, weakest for Hittite-language text; must NOT claim translation; bulk-XML index (no API); exact zip size unverified through WAF.

**6. `date_tablet_by_sign_forms`** — *needs:* Munich metadata JSON (38 MB) only, NOT the 11 GiB tarball. **CC BY-NC 4.0 ⚠️ NC.** *Unlocks:* palaeographic dating aid — script-bucket posterior over sign-name repertoire; flags mis-dated/archaizing tablets. **M.** *Risk:* dates by sign NAMES attested per script, NOT glyph SHAPE — must label "repertoire-based, not morphology"; `type=OCR` entries are noisy; NC = research sidecar, hard blocker for any commercial KV feature; abstain on short inputs.

**7. `rank_join_candidates_by_break_edge_image`** — *needs:* Yale LUX/IIIF (CC0 ✅). *Unlocks:* re-ranks existing `find_join_candidates` by visual break-edge continuity with curator-verifiable crop URLs. **L.** *Risk:* coverage-gated (most pairs return `visual_available:false`; many objects under `yuag` not `ypm`); hand-built continuity proxy, NOT a join classifier — frame as a prior; rotation/lighting noise.

**8. `extract_bilingual_lexical_equations`** + **`etcsl_english_concordance_search`** — *needs:* ETCSL OTA `etcsl.zip?sequence=11`. **CC BY-NC-SA 3.0 ⚠️ NC + share-alike — HARD commercial blocker.** *Unlocks:* corpus-grounded Sumerian↔Akkadian equation table (ETCSL EN as alignment anchor) + first English→cuneiform discovery channel. **M each.** *Risk:* positional/statistical alignment, human-review candidates not dictionary entries; ETCSL is frozen-2006 ASCII (own scheme, not Unicode), literary-only EN coverage; NC+SA must stay on the noncommercial side of the project (like the eBL image dataset).

## (C) Sequenced Plan

1. **`index_entity_attestations` first (M).** Zero new source, zero license risk, reuses existing CDL tags. It is the substrate that #2 (prosopography join) and the entity side of everything else operate on. Highest leverage per unit effort.
2. **`geocode_find_spots` (M)** + ingest **Pleiades + MAPA** together. Both commercial-friendly; adds the entirely-missing coordinate axis. Pleiades is CC BY (clean); keep MAPA's share-alike slice fetch-on-demand.
3. **`map_chunk_geodiffusion` (M).** Cheap once #2 lands — pure geometry over the existing chunk index; immediately strengthens the panel's "find-spot ≠ collection" thesis with a when+where view.
4. **`link_prosopographical_network` (M)** + PNA ingest. Pairs with #1 for the headline "corpus as social graph" capability. Treat CC BY-SA as fetch-on-demand/attributed.
5. **Ingest the three commercial-OK CONLL gold corpora** (MTAAC CC0, SAAo CC BY 4.0, Achemenet CC BY 4.0) as a batch — pure adapter work (S/M), all clean licenses, all feed morphology into existing lemma tools. Low-risk filler between bigger builds.
6. **TLHdig Hittite adapter + repertoire profiler (L).** Biggest net-new capability (first non-Mesopotamian family), CC BY 4.0 clean, but L-effort XML-schema work — do it once the geo/prosopo lanes are proven.
7. **Yale IIIF join re-ranker (L).** CC0-clean but coverage-gated; build last among commercial-safe items since most pairs return no image.
8. **NC-licensed items LAST and quarantined** (`date_tablet_by_sign_forms`, ETCSL pair). Build only behind a clear noncommercial/research boundary, never in the shippable commercial product surface.

Rationale: front-load zero-license-risk, high-leverage entity/geo layers that unlock each other; batch the clean CONLL ingests; defer L-effort and NC-quarantined work.

## (D) Cautions

**Non-commercial — hard blockers for any paid/commercial KV feature:**
- **ETCSL** (CC BY-NC-SA 3.0): NC **and** share-alike. The two ETCSL functions must live on the noncommercial side only; shipped derivatives carry SA. Also: frozen-2006, ASCII (not Unicode cuneiform), literary-only.
- **Munich sign-image dataset** (CC BY-NC 4.0): blocks any commercial training/eval/product feature; research/benchmark sidecar only. `type=OCR` records are machine-detected — not gold.
- **SEAL** (CC BY-NC-ND): most restrictive in the set — NC **and** no-derivatives. Analysis/indexing only; cannot ship modified text. Scrape behind a WAF (needs Playwright); CSV export is metadata-only.
- **BDTNS** — **OVERCLAIMED & messy.** Stale URL (use `http://bdtns.cesga.es/`, not `.filol.csic.es`). License is NOT "unclear": explicit **noncommercial** (Molina/CSIC). Export popup is broken. Better path: ~58% overlaps CDLI bulk dump (already integrable) — only scrape BDTNS for unique Ur III material, and clear NC terms before any redistribution.

**Share-alike (copyleft) — constrains closed/commercial redistribution:**
- **PNA network** (CC BY-SA 3.0), **MAPA** (CC BY-SA 3.0): commercial use OK but redistributed derivatives must carry SA + attribution → prefer fetch-on-demand over baking into proprietary output.

**Unclear license:**
- **BabyLemmatizer + HF models**: no LICENSE file, empty HF YAML → all-rights-reserved by default. Contact Aleksi Sahala before any commercial use.
- **AkkParser / Akkadian-language-models** (megamattc): SPLIT license — code/wrappers MIT, but the CONLLU annotation data is CC BY-SA 4.0 with Oracc/SAAo provenance. Don't rely on the repo MIT file for the data layer. Also: ~3.57 GB clone; the 2024 DOI is Ong solo (not "Ong & Gordin"); cdli-gh **mtaac_syntax_corpus** has `license:null` — do NOT assume CC0 like the gold corpus.

**License-string corrections (don't propagate the wrong term):**
- **SAAo treebank** is **CC BY 4.0**, not CC BY-SA — the JOHD paper is internally inconsistent; deposit metadata is authoritative.
- **Akkademia** is **MIT**, not the README's "CC BY-SA 3.0" — do not impose a nonexistent share-alike term.

**Access/accuracy footguns:**
- **ETCSL** download needs `?sequence=11` (filename-only URL returns a 178-byte stub); ignore the bundled `.exe/.dll` SGML binaries.
- **MTAAC** files are on branch `workflow` under `morph/external/` — a `master` clone misses them.
- **Yale** manifests are keyed `/ypm/nat/<numericId>` (NOT image UUID, NOT `/ypm/<uuid>`); discover via LUX Linked Art search; some tablets sit under `yuag` not `ypm`.
- **TLHdig / SAAo / Munich** Zenodo: WAF/datacenter 403s affect scripted curl only — use `zenodo_get`/browser/wget; metadata + access are verified real.
- **MAPA**: do NOT advertise a CDLI provenance-number crosswalk (unverified, ~8/381). Confirmed links are Pleiades + WHG only.
- **Akkademia**: Python 3.7-only + PyTorch — needs an isolated venv or pickle port before wiring into `infer_damaged_sign`/`find_similar_signs`.

**Already-built / no overclaim slipped through:** All 12 proposed functions are genuinely net-new against the 116-tool surface (verified: no entity-centric, geo/coordinate, historical-person-network, non-Mesopotamian-corpus, English-query, IIIF-region, or bilingual-equation-extraction tool exists today). `trace_chunk_diffusion` is period-only (no spatial code), `detect_bilingual_tablet` only classifies (no equation extraction), `find_join_candidates` is text-only, ProtoSnap aligns known crops only — none duplicated.
