# cuneiform-mcp v0.6 — Comparative-Religion Tools

> *Spec draft, 2026-05-15. Schemas live; implementation pending.*

Three new tools that extend cuneiform-mcp from primary-source corpus access into curated comparative-religion territory. Each tool surfaces *named scholarly attribution* alongside the parallel — comparative claims without a citation behind them are not returned.

## What's new

| Tool | Schema | Returns |
|---|---|---|
| `compare_flood_narratives` | [schemas/compare_flood_narratives.schema.json](schemas/compare_flood_narratives.schema.json) | Episode × witness alignment matrix for the four major flood narratives |
| `find_antediluvian_parallel` | [schemas/find_antediluvian_parallel.schema.json](schemas/find_antediluvian_parallel.schema.json) | Ranked Mesopotamian source-candidates for 1 Enoch / Jubilees / Genesis 5-6 passages |
| `apkallu_attestations` | [schemas/apkallu_attestations.schema.json](schemas/apkallu_attestations.schema.json) | Per-sage attestations across the cuneiform + Hellenistic record, with iconography |

All three follow the v0.5 envelope discipline: `structuredContent` carries `schema`, `data`, `provenance`, `warnings`. Provenance for all three is `source: local` since the underlying alignments are curated, not live-fetched.

## Why this is novel

No MCP server in the public registry exposes Mesopotamian comparative-religion data. The closest existing capability is direct ORACC text-search (which we already wrap in `search_oracc` / `get_oracc_text`). These three tools add the *interpretive layer* — the same layer scholars actually work in — and make it programmatically queryable for downstream agents.

The discipline: **never return a parallel without naming the scholar who established it.** This is the difference between research-grade and pop-culture comparative-religion tooling.

## Data source — curated `local` index

The underlying data is bundled JSON derived from:

- `~/Desktop/Research/Atrahasis.md` → flood-narrative alignments
- `~/Desktop/Research/Apkallu.md` → seven sages + iconography
- `~/Desktop/Research/Sumerian_King_List.md` → antediluvian king list, Enmeduranki
- `~/Desktop/Research/The_Watchers.md` → 1 Enoch / Genesis-6-4 parallels
- `~/Desktop/Research/Enki_Ea.md` → patron deity attestations

Scholarly anchors (cited in the schemas' descriptions):

| Reference | Used by |
|---|---|
| Lambert 1967 — "Enmeduranki and Related Matters" (JCS 21) | `find_antediluvian_parallel` (the Enmeduranki-Enoch parallel) |
| Lambert & Millard 1969 — *Atra-ḫasīs* | `compare_flood_narratives` (all atrahasis cells) |
| Reiner 1961 — "The Etiological Myth of the Seven Sages" | `apkallu_attestations` (Bīt Mēseri base) |
| Kvanvig 1988 — *Roots of Apocalyptic* | `find_antediluvian_parallel` (1 Enoch comparative architecture) |
| George 2003 — *The Babylonian Gilgamesh Epic* | `compare_flood_narratives` (gilgamesh_xi cells) |
| Lenzi 2008 — *Secrecy and the Gods* | `apkallu_attestations` (Uruk List section) |
| Annus 2010 — "On the Origin of Watchers" (JSP 19.4) | `find_antediluvian_parallel` (Watchers/apkallū bridge) |
| Verderame 2013 — apkallu iconography | `apkallu_attestations` (iconography fields) |

## Initial dataset scope

For v0.6.0 ship:

- **`compare_flood_narratives`** — five episodes covered for all four witnesses: `divine_decision`, `forewarning`, `ark_construction`, `the_flood`, `aftermath`. Stretch: add `creation_of_humanity`, `overpopulation`, `new_order`. The Sumerian Ziusudra cells will be predominantly `philological_uncertainty: fragmentary`.
- **`find_antediluvian_parallel`** — three pre-baked queries for the v0.6.0 demo: Genesis 5:21-24 (Enoch ascent), Genesis 6:1-4 (sons of God / Nephilim), 1 Enoch 6:1-8 (Watchers descent). Each returns 3-5 ranked Mesopotamian parallels with named scholarly attribution.
- **`apkallu_attestations`** — all seven antediluvian sages + four postdiluvian successors, with at minimum the Bīt Mēseri III attestation per antediluvian sage and the Uruk List attestation per postdiluvian sage. Iconography for the fish-cloaked Oannes / Uanna form: at least the Nimrud relief BM 124577 and the Aššur figurine deposits.

## What this is NOT for

- **Not live ORACC search.** That's what `search_oracc` already does.
- **Not Sitchin-style speculation.** Every result requires a named living-or-historical scholar's attribution.
- **Not a Genesis commentary.** The Hebrew cells in `compare_flood_narratives` carry standard scholarly attribution (Westermann, Cassuto, Speiser) — they are not the tool's interpretive contribution.

## Implementation path

1. Build the three JSON datasets (`data/floodAlignment.json`, `data/antediluvianParallels.json`, `data/apkalluAttestations.json`) from the Research/ briefs. Hand-curated; small enough that bundling them as static JSON is fine.
2. Tool handlers in `src/tools/`:
   - `compareFloodNarratives.ts` — accepts `episodes?`, `witnesses?`; returns the matrix slice
   - `findAntediluvianParallel.ts` — accepts `text_id` + (`passage` | `topic`); returns ranked candidates
   - `apkalluAttestations.ts` — accepts `sage_name?`, `include_iconography?`, `include_postdiluvian?`; returns per-sage entries
3. Register the tools in `src/index.ts` alongside the existing nine.
4. Add validation: each tool's response is validated against its schema before emission (same pattern as the existing nine).
5. Update `PROTOCOL.md` with three new sections, increment to v0.6.
6. Bump `package.json` to `0.6.0`.

Estimated effort: **~3-4 hours** for the implementation, **~6-8 hours** for the initial dataset curation (the curation is the load-bearing work, and is where research-grade quality is won or lost).

## Demo flow

For the v0.6.0 release post:

```text
> compare_flood_narratives({episodes: ["forewarning", "the_flood"]})

→ Atra-ḫasīs III.i.20-36: Enki speaks through the reed wall...
→ Gilgamesh XI.27-31: Ea, through the reed-hut, addresses Ut-napishti...
→ Sumerian Flood Story 154-160: [fragmentary] ...standing by a wall...
→ Genesis 6:13-17: God spoke directly to Noah...

divergence_summary: All three Mesopotamian witnesses preserve the
"speech-through-the-wall" loophole; Genesis removes it. Enki's
indirect speech is the Mesopotamian theological signature; the
Hebrew redaction substitutes direct divine address.
```

```text
> find_antediluvian_parallel({text_id: "genesis", passage: "Genesis 5:21-24"})

→ Strong structural parallel: Enmeduranki of Sippar (SKL WB 444 col.i)
  scholar: Lambert 1967, JCS 21:126-138
  Both are seventh figures; both ascend to heaven; both receive divine knowledge
  
→ Strong onomastic parallel: Enmeduranki ~ Hanok (Enoch)
  scholar: Kvanvig 1988
  
→ Moderate topos parallel: Adapa wisdom-without-immortality
  scholar: Andersson 2002 [unverified — needs check]
```

```text
> apkallu_attestations({sage_name: "Uanna", include_iconography: true})

→ Bīt Mēseri III.lines 1-7: "Uanna, who completed the plans of heaven
  and earth" (Akkadian, Neo-Assyrian, Reiner 1961 p.4)
→ Berossus, Babyloniaca (Syncellus excerpt): "Oannes emerged from
  the Erythraean Sea..." (Greek, c. 280 BCE)
→ Iconography: fish_cloaked, Nimrud Northwest Palace relief BM 124577
→ Paired king: Ayalu (Alulim) — first antediluvian king of Eridu
```

## Open questions for v0.7+

- **Lagash King List parallel access.** The Lagash dissent (no flood, different king list) deserves its own tool entry — possibly extending `apkallu_attestations` to surface antediluvian sources beyond the WB 444 / Uruk List orthodoxy.
- **Hebrew text base.** Currently using NRSV translations. Should we add an MT/LXX cell pair for Genesis where the witnesses diverge? Probably yes for any v0.7 expansion.
- **Multi-language excerpt support.** Excerpts are English-only in v0.6. Adding the Akkadian transliteration + Sumerian original would be valuable for advanced consumers but is a large dataset addition.
- **Coverage of Adapa, Berossus' Babyloniaca, *Enūma Eliš*.** All three are referenced in the Research/ cluster but not yet directly indexed. The Adapa brief (queued as the next Research addition) would close one of these gaps.

## Risk register

| Risk | Mitigation |
|---|---|
| Curated datasets drift from research consensus | Each cell carries `scholarly_anchor`; auditable; quick to update |
| Translation excerpts under copyright | Use older public-domain translations (Foster's CDL Press editions are CC-BY; Charles 1912 for 1 Enoch is PD) or paraphrase + cite |
| `[unverified]` flags accumulate | Inherit the Research/ cluster's discipline — mark uncertain cells with `philological_uncertainty: reconstructed` |
| Sitchin-aligned consumers misuse the tool | Tool explicitly does NOT return parallels without scholarly attribution; the `correspondence_strength: weak/contested` enum surfaces actual academic doubt |

---

*Companion to the Research/ cluster at `~/Desktop/Research/Research_Index.md`. Each schema cross-references the brief that supplies its underlying knowledge. This is what it looks like when personal-research notes get promoted to executable infrastructure.*
