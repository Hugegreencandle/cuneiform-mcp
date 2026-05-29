# Genre-Conflict Sentinel worklist — 2026-05-29

**REVIEW-ONLY — observational, not labels.** Each row is a tablet whose `identify_composition` family (conf > 0.95) disagrees with its eBL editorial genre-family, with the shared length-20 sign-trigram window linking it to a composition exemplar. Rows are CLASSIFIED by window rarity — only the non-formulaic rows are worth reading.

> **Honest caveat.** The window is 20 sign-*trigrams* (it can span breaks) — NOT 20 contiguous verbatim signs. At the default the corroboration removes ~0 cross-family hits, because `identify_composition` is itself chunk-weighted on these exemplars — so a shared window is forced by construction and the corroboration is **not** an independent check. The information is in the window's **rarity**: `formulaic` rows share only a pan-corpus boilerplate hub window (weak); `embedded_quotation_candidate` rows share a rare passage that is *localized* in an otherwise-on-genre tablet (the real phenomenon); `likely_misassignment` rows share a rare passage that *dominates* the tablet (the model is probably just wrong). **Nothing here feeds the v1.0 G2 gate** (that would be circular).

- Scanned **4922** assignments · **311** above conf 0.95 · **76** cross-family · **11** self-exemplars skipped
- Signal: **5** embedded-quotation candidate(s) · **5** likely-misassignment · **66** formulaic (boilerplate)

## By family-pair

| family-pair | count |
|---|---|
| magic-in-medicine | 29 |
| magic-in-literature | 29 |
| magic-in-divination | 13 |
| lexical-in-magic | 3 |
| divination-in-magic | 1 |
| divination-in-literature | 1 |

## embedded_quotation_candidate (5)

| tablet | model composition | conflict | rarest window host-count | shared / total (fraction) | matched exemplar | conf | eBL genre |
|---|---|---|---|---|---|---|---|
| `K.5237` | diri_aa | lexical-in-magic | 2 | 11/42 (0.2619) | `1881,1103.2244` | 0.9922 | CANONICAL → Magic → Exorcistic → Udugḫul |
| `K.8985` | mis_pi | magic-in-divination | 2 | 13/34 (0.3824) | `K.2550` | 0.9826 | CANONICAL → Divination → Teratological → Šumma izbu |
| `K.2433` | udug_hul | magic-in-medicine | 3 | 8/68 (0.1176) | `K.7246` | 0.9784 | CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → XI Anus |
| `K.3499` | enuma_anu_enlil | divination-in-literature | 3 | 10/32 (0.3125) | `K.3716` | 0.989 | CANONICAL → Literature → Hymns → Divine |
| `K.7906` | udug_hul | magic-in-literature | 5 | 8/21 (0.381) | `Sm.1055` | 0.9962 | CANONICAL → Literature → Hymns → Divine → Šigû Prayer |

## likely_misassignment (5)

| tablet | model composition | conflict | rarest window host-count | shared / total (fraction) | matched exemplar | conf | eBL genre |
|---|---|---|---|---|---|---|---|
| `K.5078` | diri_aa | lexical-in-magic | 2 | 39/74 (0.527) | `K.11384` | 0.9937 | CANONICAL → Magic → Exorcistic → Udugḫul |
| `BM.37915` | mis_pi | magic-in-literature | 2 | 10/18 (0.5556) | `K.2550` | 0.9888 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `Sm.290` | mis_pi | magic-in-literature | 2 | 6/10 (0.6) | `K.5896` | 0.9949 | CANONICAL → Literature → Hymns → Divine → Kiutu |
| `Sm.491` | enuma_anu_enlil | divination-in-magic | 2 | 30/45 (0.6667) | `K.3716` | 0.9869 | CANONICAL → Magic |
| `1881,0324.421` | diri_aa | lexical-in-magic | 2 | 1/1 (1) | `1881,1103.2244` | 0.9897 | CANONICAL → Magic |

## formulaic (66)

| tablet | model composition | conflict | rarest window host-count | shared / total (fraction) | matched exemplar | conf | eBL genre |
|---|---|---|---|---|---|---|---|
| `K.6066` | udug_hul | magic-in-medicine | 7 | 7/91 (0.0769) | `K.7246` | 0.9808 | CANONICAL → Technical → Medicine → Therapeutic |
| `K.140` | mis_pi | magic-in-literature | 8 | 142/402 (0.3532) | `K.163` | 0.9954 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `K.3343` | mis_pi | magic-in-literature | 8 | 142/249 (0.5703) | `K.163` | 0.9912 | CANONICAL → Literature → Hymns → Divine → Kiutu |
| `K.3221` | mis_pi | magic-in-literature | 8 | 142/142 (1) | `K.163` | 0.9943 | CANONICAL → Literature → Hymns → Divine |
| `K.3283` | mis_pi | magic-in-literature | 9 | 92/121 (0.7603) | `K.163` | 0.9833 | CANONICAL → Literature → Hymns → Divine |
| `1880,0719.152` | mis_pi | magic-in-literature | 10 | 12/245 (0.049) | `K.2550` | 0.9878 | CANONICAL → Literature → Hymns → Divine |
| `K.2373` | mis_pi | magic-in-literature | 10 | 103/124 (0.8306) | `K.2550` | 0.9939 | CANONICAL → Literature → Hymns → Divine → Kiutu |
| `K.4827` | udug_hul | magic-in-literature | 13 | 16/57 (0.2807) | `Sm.1055` | 0.9936 | CANONICAL → Literature → Narrative → Lugal-e |
| `K.13324` | udug_hul | magic-in-literature | 15 | 15/37 (0.4054) | `K.7246` | 0.9917 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `Rm.268` | asiputu_kar44 | magic-in-divination | 16 | 1/40 (0.025) | `Sm.1055` | 0.9633 | CANONICAL → Divination → Physiognomy → Alamdimmû → 5. Šumma liptu |
| `K.2106` | mis_pi | magic-in-literature | 16 | 100/147 (0.6803) | `K.163` | 0.9924 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `K.2741` | mis_pi | magic-in-literature | 16 | 65/88 (0.7386) | `K.163` | 0.9927 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `Rm.259` | udug_hul | magic-in-literature | 18 | 5/63 (0.0794) | `Sm.1055` | 0.9934 | CANONICAL → Literature |
| `BM.123378` | udug_hul | magic-in-literature | 18 | 15/75 (0.2) | `Sm.1055` | 0.9956 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `Rm.96` | mis_pi | magic-in-literature | 18 | 48/110 (0.4364) | `K.163` | 0.9903 | CANONICAL → Literature → Hymns → Divine |
| `K.3505.B` | mis_pi | magic-in-literature | 18 | 83/154 (0.539) | `K.163` | 0.994 | CANONICAL → Literature → Hymns → Divine |
| `K.10243` | mis_pi | magic-in-literature | 18 | 83/129 (0.6434) | `K.163` | 0.993 | CANONICAL → Literature → Hymns → Divine → Šuʾila |
| `K.3341` | mis_pi | magic-in-literature | 20 | 13/32 (0.4063) | `K.163` | 0.9863 | CANONICAL → Literature → Lamentations → Eršaḫuĝa |
| `K.2445` | mis_pi | magic-in-literature | 21 | 56/412 (0.1359) | `K.163` | 0.9899 | CANONICAL → Literature → Hymns → Divine → Kiutu |
| `K.6067` | mis_pi | magic-in-medicine | 25 | 9/72 (0.125) | `K.163` | 0.9898 | CANONICAL → Technical → Medicine → Therapeutic |
| … +46 more formulaic (boilerplate) | | | | | | | |

