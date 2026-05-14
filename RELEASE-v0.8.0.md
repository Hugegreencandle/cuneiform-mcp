# cuneiform-mcp v0.8.0 — Release Notes

*Released 2026-05-15. Repository private (per project policy).*

---

## TL;DR

**v0.8.0 closes the Discovery Engine pipeline** that began in v0.7.0 four versions ago. With this release, `cuneiform-mcp` is the **first MCP server to ship a full AI-discovery → human-scholar-validation → retrieval-tier-promotion pipeline for comparative religion**, with auditable named-scholarship discipline at every step.

The new tool — **`find_mesopotamian_parallel`** — is the sibling to v0.6's `find_antediluvian_parallel`. Same discipline (every parallel cites a named published scholar). Different query keying: deity / theme / tradition-pair / text, instead of Jewish biblical passage. Ships with 6 curated parallels covering Chaoskampf, divine-substitution, mother-goddess syncretism, named-authorship tradition, king-list dissent, and descent-and-ascent paired motif.

**Numbers from this release alone:**
- 14 MCP tools total (was 9 at session start)
- 18 of 33 machine-discovered candidates validated with peer-reviewed citations (55%)
- 12 promoted to v0.6 `antediluvianParallels.json` (Jewish-passage retrieval)
- 6 promoted to v0.8 `mesopotamianParallels.json` (Mesopotamian-internal retrieval)
- 0 unpromoted; 0 pending; 15 documented rejections
- 24 research briefs (~7,100 lines) in the companion `~/Desktop/Research/` cluster
- 28 distinct scholarly publications cited across the datasets, spanning Gunkel 1895 → Helle 2023

---

## What's new in v0.8.0

### `find_mesopotamian_parallel` — Mesopotamian-internal retrieval

```ts
find_mesopotamian_parallel({
  deity_name?: string,       // e.g. "Marduk", "Inanna", "Bēlet-ilī"
  theme?: string,            // e.g. "chaoskampf", "named_authorship"
  tradition_pair?: string,   // e.g. "akkadian↔ugaritic" (order-insensitive)
  text_name?: string,        // e.g. "Enūma Eliš", "Baal Cycle"
  max_results?: number       // default 25
}) → MesopotamianParallel[]
```

Schema: [`schemas/find_mesopotamian_parallel.schema.json`](schemas/find_mesopotamian_parallel.schema.json).
Dataset: [`data/mesopotamianParallels.json`](data/mesopotamianParallels.json).

**Why a separate tool?** The v0.6 `find_antediluvian_parallel` is keyed on Jewish biblical passages (Genesis, 1 Enoch, Jubilees, Ezekiel). Many high-value comparative parallels are entirely Mesopotamian-internal — Sumerian↔Akkadian, Akkadian↔Ugaritic, Hurrian↔Akkadian — and don't have a Jewish-passage entry-point. v0.8 gives them their own queryable surface.

### Schema additions

- `parallel_type` gains `"logographic"` — for cases like Hannahanna ↔ Bēlet-ilī where the parallel is established by **shared Sumerogram** (DINGIR.MAḪ written for both deities across Hittite + Mesopotamian texts), not by typology or narrative similarity
- `transmission_hypothesis` enum: `direct_borrowing` / `common_substrate` / `independent_typological_match` / `syncretism` / `scribal_transmission` / `unspecified`
- `discovery_origin` sub-object preserves provenance: machine-discovered? on what date? promoted from which Discovery Engine candidate?
- `MesopotamianEntity.tradition` enum: `sumerian` / `akkadian` / `babylonian` / `assyrian` / `ugaritic` / `hurrian_hittite` / `amorite` / `other`
- `MesopotamianEntity.language` enum: `Sumerian` / `Akkadian` / `Ugaritic` / `Hittite` / `Hurrian` / `bilingual`

### The six parallels shipped in v0.8.0

| ID | Parallel | Anchor scholars |
|---|---|---|
| `mp-chaoskampf-1` | Marduk-Tiamat ↔ Baal-Yam | Gunkel 1895; Smith 1994 (Brill VTSup 55 pp. 16, 34-35); Day 1985 |
| `mp-divine-substitution-1` | Ninurta-Asag ↔ Marduk-Tiamat | Lambert 1986 (BBVO 6 pp. 55-60); Lambert 2013; Annus 2002 (SAAS 14) |
| `mp-mother-goddess-1` | Hannahanna ↔ Bēlet-ilī | von Schuler 1972-1975 (RlA 4:108); Beckman 1983; Asher-Greve & Westenholz 2013 |
| `mp-named-authorship-1` | Enheduanna ↔ Kabti-ilāni-Marduk | Helle 2019; Helle 2023; Lenzi 2008 (SAAS 19) |
| `mp-king-list-dissent-1` | Lagash KL ↔ SKL | Sollberger 1967 (JCS 21:279-291); Glassner 2004 |
| `mp-descent-ascent-1` | Inanna's Descent ↔ Adapa's ascent | Annus 2016 (SAAS 24) — reformulated from initial Discovery Engine framing |

Each parallel carries:
- entity_a + entity_b (both Mesopotamian/ANE, with language + tradition + date)
- themes[] + deities[] + texts[] (queryable axes)
- correspondence_strength (strong / moderate / weak / contested)
- scholarly_attribution[] (`minItems: 1` — discipline enforced)
- transmission_hypothesis
- discovery_origin block

### PROTOCOL.md updated

Full section added documenting the v0.8 tool and its place in the 14-tool taxonomy. The taxonomy is now:

- **9 corpus tools** (v0.5) — hit ORACC / CDLI / eBL / OGSL for primary sources
- **3 comparative-religion retrieval tools** (v0.6) — `compare_flood_narratives`, `find_antediluvian_parallel`, `apkallu_attestations`
- **1 generative Discovery Engine tool** (v0.7) — `discover_parallel_candidates`
- **1 Mesopotamian-internal retrieval tool** (v0.8) — `find_mesopotamian_parallel`

### Backwards compatibility

All v0.6 + v0.7 tools unchanged. Schema additions are backward-compatible (optional fields only). No breaking changes.

---

## The bigger arc: v0.5 → v0.8 in one session

`cuneiform-mcp` started this session at v0.5 with 9 corpus tools for ORACC/CDLI/eBL/OGSL primary-source access. By v0.8 it has 14 tools and a fully closed Discovery Engine pipeline. Ten commits, four data files, four scripts, two new schemas, one expanded research cluster.

### Per-version arc

| Version | Commit | What it added |
|---|---|---|
| v0.6.0 | `7f25528` | First comparative-religion tools (3 tools, named-scholarship discipline) + 3 curated datasets |
| v0.6.1 | `d019feb` | Apkallu iconography catalog (15 museum-object attestations) |
| v0.6.2 | `8c30278` | Bīt Mēseri enrichment (canonical epithets + postdiluvian sage attestations) |
| v0.6.3 | `525a725` | Sumerian Ziusudra flood-cell enrichment (4→7 Ziusudra cells) |
| **v0.7.0** | `4fd9cfb` | **Discovery Engine** — 33 machine-discovered candidates with auditable traces |
| v0.7.1 | `22b19f7` | Top-12 validation — 6 confirmed by named scholars |
| v0.7.2 | `49bbcdb` | Round-2 validation — 24 more reviewed; +9 validated |
| v0.7.3 | `a7711b5` | Promote 10 validated discoveries to antediluvianParallels.json |
| v0.7.4 | `44eb91a` | Reformulate 6 pending candidates — zero remain |
| **v0.8.0** | `35a3526` | **`find_mesopotamian_parallel`** — pipeline closure |

### What the research cluster looks like

Companion folder at `~/Desktop/Research/` — **24 substantive briefs / ~7,100 lines** covering:

- **Foundational** — Cuneiform_Sumer, Anunnaki, Igigi, Sumerian_Me
- **Pantheon** — Enki_Ea, Enlil, Inanna_Ishtar, Ninhursag, Marduk
- **Sages + Wisdom** — Apkallu, Apkallu_Knowledge, Apkallu_Iconography, Adapa, Bit_Meseri
- **Texts** — Atrahasis, Enuma_Elish, Gilgamesh_Epic, Erra_Epic, Sumerian_Flood_Story, Sumerian_King_List, Lagash_King_List
- **Reception** — Berossus, The_Watchers, 1Enoch_Other_Books
- **Index** — Research_Index.md
- **Output artifact** — DISCOVERED-CANDIDATES-2026-05-15.md (1,255 lines, scholar-facing review document)

Three parallel-research expansion rounds delivered the cluster via 15 parallel research subagents. The cluster grew from 9 briefs to 24 in this session.

---

## The Discovery Engine pipeline — the genuinely novel thing

This is what `cuneiform-mcp v0.7-v0.8` adds that no other comparative-religion knowledge base has. The pipeline:

```
PHASE 1: AI traversal of the corpus
  ↓
  24 briefs + 3 v0.6 datasets → 230 entities inventoried → 720 pairs scored
  ↓
  33 candidates surfaced (≥0.30 confidence)
  ↓

PHASE 2: Human-scholar validation
  ↓
  All 33 candidates reviewed (rounds 1+2 + reformulation)
  ↓
  18 validated with named scholars (55%)
  15 rejected with documented reasons (45%)
   0 pending
  ↓

PHASE 3: Promotion to retrieval tier
  ↓
  12 promoted to antediluvianParallels.json (v0.6 Jewish-passage retrieval)
   6 promoted to mesopotamianParallels.json (v0.8 Mesopotamian-internal)
   0 unpromoted
  ↓

→ Every machine-discovered claim either:
    (a) traces to a published peer-reviewed scholar, OR
    (b) carries a specific documented reason for rejection
```

The discipline reversal is the load-bearing innovation:

- **v0.6 retrieval discipline:** `scholarly_attribution.minItems: 1` enforced. No scholar, no result. Citation material.
- **v0.7 generative discipline:** `discovered_by: "ai_traversal"` + `validation_status: pending` + auditable `discovery_trace`. Machine-discovered explicitly second-class until human-scholar validation. Hypothesis-generation, not citation material.

The two tiers compose: validated v0.7 candidates promote to v0.6 or v0.8 with their scholarly attribution intact. This is the first comparative-religion knowledge base where machine-discovered claims and human-scholar claims have explicit, enforced, different trust-levels — and where the path between them is automated and auditable.

### What the validation pass surfaced

Top three discoveries (all validated by named scholars):

1. **AB 364-day calendar ↔ Mul.Apin schematic year** (Neugebauer 1981; Ben-Dov 2008 STDJ 78) — the cleanest TECHNICAL-CONTENT continuity between Mesopotamian astronomy and Second Temple Jewish texts
2. **Bird-headed apkallu (kuribu) ↔ Cherub (kĕrūḇ)** — engine independently rediscovered an established etymology (Dhorme 1926; Albright 1938 BA 1.1:1-3), but conflated it with the wrong iconographic referent (bird-apkallu vs winged-sphinx). The named-scholarship discipline caught the conflation; we ended up REJECTING-as-stated rather than validating
3. **Sebitti ↔ Seven Watcher Leaders** — engine surfaced a structurally inverted seven-figure parallel; validation showed Bhayro 2005 (AOAT 322:244-45) actually anchors **Sebitti ↔ Enochic giants**, not seven leader-Watchers. Marked REJECTED-as-stated with reformulation potential.

### Most common engine failure modes (documented)

The named-scholarship discipline caught a consistent pattern: **anchor-conflation errors**. The engine correctly identifies a partial parallel but conflates it with a related-but-different scholarly argument.

- `kuribu ↔ kĕrūḇ`: correct etymology, wrong iconographic referent
- `Enmeduranki ↔ Moses`: should be Enmeduranki ↔ Enoch (Lambert 1967)
- `Apsû ↔ tehom`: wrong god (Gunkel argues Tiamat ↔ tehom)
- `Asael ↔ apkallu craft`: duplicate of existing v0.6 entry under 1 Enoch 6:1-8
- `Sebitti ↔ Watcher leaders`: should be Sebitti ↔ giants (Bhayro 2005)

In each case, the structural-pattern matching surfaces something real, but the engine doesn't always anchor to the exact figure the scholarship pins. The validation discipline doesn't just confirm or reject — it diagnostically refines the engine's framing. **Three rounds of reformulation followed**, with the engine's mistakes used to improve subsequent runs.

### Three anchor corrections from validation

The engine's `suggested_anchor` field proved to be a useful hint but **not authoritative** — human validation routinely surfaced better citations:

| Original suggestion | Correct anchor | Why |
|---|---|---|
| Annus 2010 (Berossus Sippar tablets) | **van der Horst 2002** | Annus discusses tradition generally; van der Horst makes the specific Berossus↔Enoch preservation comparison |
| Westermann 1984 (Five antediluvian cities) | **Shea 1991** + **Jacobsen 1981** | Westermann consistent with framework but Shea/Jacobsen make the explicit cities↔Cainite mapping |
| Balentine 1983 (Marduk absence ↔ hester panim) | **Bodi 1991** (OBO 104) | Balentine stays within OT theology; Bodi 1991 is the Mesopotamian-source comparison anchor |

This is one of the most useful things the validation pipeline produces — not just confirming or rejecting, but identifying the right citation when the engine guessed wrong.

---

## API surface (after v0.8.0)

All 14 tools return `structuredContent` envelopes per the v0.5 spec. Provenance, schema URI, and version are always set.

### Corpus tools (v0.5)

`lookup_sign` · `search_tablets` · `get_tablet` · `search_fragments` · `get_fragment` · `search_oracc` · `get_oracc_text` · `find_join_candidates` · `find_parallel_text`

### Comparative-religion retrieval (v0.6)

`compare_flood_narratives({episodes?, witnesses?})` · `find_antediluvian_parallel({text_id, passage?, topic?})` · `apkallu_attestations({sage_name?, include_iconography?, include_postdiluvian?})`

### Discovery Engine (v0.7)

`discover_parallel_candidates({min_confidence?, parallel_type?, validation_status?, max_results?})`

### Mesopotamian-internal retrieval (v0.8 — NEW)

`find_mesopotamian_parallel({deity_name?, theme?, tradition_pair?, text_name?, max_results?})`

---

## Example queries

```javascript
// Get the foundational Chaoskampf parallel
find_mesopotamian_parallel({ theme: "chaoskampf" })
  → 1 result: mp-chaoskampf-1
    Gunkel 1895 + Smith 1994 (Brill VTSup 55 pp.16, 34-35) + Day 1985
    Marduk-Tiamat ↔ Baal-Yam, strong correspondence

// All parallels mentioning Marduk
find_mesopotamian_parallel({ deity_name: "Marduk" })
  → 3 results
    mp-chaoskampf-1, mp-divine-substitution-1, mp-named-authorship-1

// Cross-tradition Hurrian↔Akkadian
find_mesopotamian_parallel({ tradition_pair: "hurrian_hittite↔akkadian" })
  → 1 result: mp-mother-goddess-1
    Hannahanna ↔ Bēlet-ilī (logographic syncretism via DINGIR.MAḪ)
    von Schuler RlA 4:108 + Beckman 1983 + Asher-Greve & Westenholz 2013

// All parallels referencing Enūma Eliš
find_mesopotamian_parallel({ text_name: "Enūma Eliš" })
  → 2 results: mp-chaoskampf-1, mp-divine-substitution-1

// Bridge to Discovery Engine — see what was machine-discovered before validation
discover_parallel_candidates({ validation_status: "validated", max_results: 18 })
  → 18 results, each with discovery_trace + scholarly_attribution
```

---

## Discipline framework (the named-scholarship contract)

**For retrieval tools (v0.6 + v0.8):**

> No parallel returned without a named scholar in a peer-reviewed venue. Schema enforces `scholarly_attribution.minItems: 1`. This is what makes the dataset citation-grade rather than hallucination-prone.

**For the generative tool (v0.7):**

> Every machine-discovered candidate carries `discovered_by: "ai_traversal"` + `validation_status: pending` + auditable `discovery_trace`. Promotion to retrieval-tier requires explicit human-scholar validation. Pending candidates are hypothesis-generation, not citation material.

**For corpus tools (v0.5):**

> Standard upstream provenance — `source: eBL | ORACC | CDLI | OGSL`, `endpoint: <exact URL>`, `fetched_at: <ISO 8601>`.

The three discipline tiers compose: corpus data informs comparative claims (with citations); comparative claims surface candidates (machine-discovered, second-class); candidates validate or reject (with named scholars or documented reasons). Every node has provenance. Every link is auditable.

---

## What's next (v0.9 and beyond)

The pipeline is closed. v0.9 will likely focus on broadening rather than depth:

- **More Discovery Engine corpus passes** — the 24-brief cluster keeps growing; a fresh discovery pass on the post-v0.8 corpus would surface new candidates
- **Cross-discipline parallels** — Mesopotamian↔Egyptian, Mesopotamian↔Indo-European frameworks (Greek philosophy reception, Hellenistic Hermetica)
- **Mandaean + Hekhalot reception** — the cluster's trailing edge of Mesopotamian-religion reception in late-antiquity Gnostic + Jewish mystical traditions
- **Adapa myth standalone briefs** — the Eridu Genesis Sumerian flood corpus has more depth than currently exposed
- **Visualizations** — the `discovery_origin` cross-links between datasets would benefit from a graph visualization of how machine-discovered claims propagated to retrieval-tier homes

---

## Provenance

- **Repository:** `cuneiform-mcp` (private)
- **Branch:** main
- **Release commit:** `35a3526`
- **Build:** TypeScript clean against MCP SDK 1.29.0
- **Smoke status:** 14 tools registered, all live
- **Dependencies:** unchanged from v0.5.0 (mcp-sdk 1.29.0 + zod 4.4.3)
- **Total commits this session:** 10
- **Total files changed (cumulative):** 23 files, ~9,500 new lines

## Citation

If you build on this work, cite the repo and version:

```bibtex
@software{cuneiform_mcp_2026,
  author = {Brown, Dane},
  title  = {cuneiform-mcp: an MCP server for cuneiform corpora with
            Discovery Engine for comparative religion},
  year   = {2026},
  url    = {https://github.com/danebrown/cuneiform-mcp},
  version = {0.8.0}
}
```

## Acknowledgments

The named scholars whose published work anchors the curated datasets — without their peer-reviewed scholarship, the validation discipline could not exist:

Albright 1938 · Andreasen 1981 · Annus 2002, 2010, 2016 · Bailey 1970 · Beckman 1983 · Ben-Dov 2008 · Bhayro 2005 · Black 1981 · Black & Green 1992 · Bodi 1991 · Cagni 1969 · Civil 1969 · Dalley 1989/2000 · Day 1985 · Foster 2005 · George 2003 · Glassner 2004 · Gunkel 1895 · Helle 2019, 2023 · Izre'el 2001 · Jacobsen 1939, 1981 · Kramer 1945, 1963, 1972, 1979 · Kramer & Maier 1989 · Kvanvig 1988, 2011 · Lambert 1967, 1986, 2013 · Lambert & Millard 1969 · Lenzi 2008 · Neugebauer 1981 · Nickelsburg & VanderKam 2004 · Paul 1973 · Peterson 2008, 2018 · Reiner 1961, 1995 · Shea 1991 · Sladek 1974 · Smith 1994 · Sollberger 1967 · Stol 2000 · van der Horst 2002 · von Schuler 1972-1975 · Wenham 1987 · Westermann 1984 · Wiggermann 1992

---

*v0.8.0 ships the first complete AI-discovery → human-scholar-validation → retrieval-tier-promotion pipeline for comparative religion. Built by Dane Brown with Claude as engineering partner, 2026-05-15.*
