# G2 adjudication worklist — 2026-05-29

**REVIEW-ONLY.** Nothing here is written to `validation-resolutions.json`. Confirm each Tier-1 pair against eBL, then hand-invoke `record_validation_resolution` for the ones you accept.

- **G2 status:** 17 / 100 validated positives.
- **Candidate source:** v0.54 composition-assignment cache (identify_composition over chunk-host tablets). NOT ground truth — see integrity note.

## Integrity note — why this is a worklist, not auto-labels

`identify_composition` confidence is the *model's own* output. Recording it as a positive into the gate store that trains/validates that model would be circular self-labeling. It is also wrong often enough to matter: medical "Teeth" tablets (e.g. K.2290, K.2419) are assigned Mīs pî at 0.99 on sign-overlap alone. So we cross-check each candidate's model-composition against its **independent eBL editorial genre** and tier accordingly. Only operator-confirmed pairs get recorded.

## Mīs pî  (anchor: `K.2550`, confirmed positive)

Candidates ≥0.95: **153** — Tier 1 confirm: **10**, Tier 2 review: 126, Tier 3 likely-reject: 17.

### Tier 1 — model + eBL genre both name Mīs pî (propose as positive sibling of `K.2550`)

| # | proposed positive pair | model conf | eBL genre | period | eBL |
|---|---|---|---|---|---|
| 1 | `K.11920 ↔ K.2550` | 0.993 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.11920) |
| 2 | `Rm-II.344 ↔ K.2550` | 0.988 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/Rm-II.344) |
| 3 | `K.8117 ↔ K.2550` | 0.988 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.8117) |
| 4 | `K.10060 ↔ K.2550` | 0.985 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.10060) |
| 5 | `K.15325 ↔ K.2550` | 0.983 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.15325) |
| 6 | `K.18036 ↔ K.2550` | 0.980 | CANONICAL → Magic → Purification → Mīs pî | Neo-Babylonian | [link](https://www.ebl.lmu.de/fragmentarium/K.18036) |
| 7 | `BM.38617 ↔ K.2550` | 0.978 | CANONICAL → Magic → Purification → Mīs pî | Neo-Babylonian | [link](https://www.ebl.lmu.de/fragmentarium/BM.38617) |
| 8 | `K.15436 ↔ K.2550` | 0.976 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.15436) |
| 9 | `K.8994 ↔ K.2550` | 0.976 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.8994) |
| 10 | `K.10176 ↔ K.2550` | 0.975 | CANONICAL → Magic → Purification → Mīs pî | Neo-Assyrian | [link](https://www.ebl.lmu.de/fragmentarium/K.10176) |

### Tier 2 — ritual/āšipūtu genre but a different or unspecified leaf (REVIEW: may be a sibling of its genre's composition, not Mīs pî)

| candidate | model conf | eBL genre | eBL |
|---|---|---|---|
| `K.8753` | 0.997 | CANONICAL → Magic → Exorcistic → Šēp lemutti | [link](https://www.ebl.lmu.de/fragmentarium/K.8753) |
| `IM.76881` | 0.997 | CANONICAL → Technical → Ritual texts | [link](https://www.ebl.lmu.de/fragmentarium/IM.76881) |
| `K.2596` | 0.997 | CANONICAL → Magic → Varia → Zuburudabeda | [link](https://www.ebl.lmu.de/fragmentarium/K.2596) |
| `BM.64517` | 0.997 | CANONICAL → Magic → Varia → Building Rituals | [link](https://www.ebl.lmu.de/fragmentarium/BM.64517) |
| `K.3996` | 0.996 | CANONICAL → Catalogues | [link](https://www.ebl.lmu.de/fragmentarium/K.3996) |
| `K.3648` | 0.996 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.3648) |
| `K.140` | 0.995 | CANONICAL → Literature → Hymns → Divine → Šuʾila | [link](https://www.ebl.lmu.de/fragmentarium/K.140) |
| `K.6018` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.6018) |
| `BM.121037` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/BM.121037) |
| `Sm.290` | 0.995 | CANONICAL → Literature → Hymns → Divine → Kiutu | [link](https://www.ebl.lmu.de/fragmentarium/Sm.290) |
| `K.9404` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.9404) |
| `K.3270` | 0.994 | CANONICAL → Magic → Varia → Zuburudabeda | [link](https://www.ebl.lmu.de/fragmentarium/K.3270) |
| `K.3221` | 0.994 | CANONICAL → Literature → Hymns → Divine | [link](https://www.ebl.lmu.de/fragmentarium/K.3221) |
| `BM.38709` | 0.994 | CANONICAL → Magic → Varia → Building Rituals | [link](https://www.ebl.lmu.de/fragmentarium/BM.38709) |
| `K.4994` | 0.994 |  | [link](https://www.ebl.lmu.de/fragmentarium/K.4994) |
| `K.2866` | 0.994 | CANONICAL → Magic → Exorcistic → Šurpu | [link](https://www.ebl.lmu.de/fragmentarium/K.2866) |
| `K.3505.B` | 0.994 | CANONICAL → Literature → Hymns → Divine | [link](https://www.ebl.lmu.de/fragmentarium/K.3505.B) |
| `K.2373` | 0.994 | CANONICAL → Literature → Hymns → Divine → Kiutu | [link](https://www.ebl.lmu.de/fragmentarium/K.2373) |
| `K.2783` | 0.994 | CANONICAL → Magic → Varia → Zuburudabeda | [link](https://www.ebl.lmu.de/fragmentarium/K.2783) |
| `K.155` | 0.994 | CANONICAL → Literature → Hymns → Divine → Šuʾila | [link](https://www.ebl.lmu.de/fragmentarium/K.155) |
| `K.2438` | 0.994 | CANONICAL → Magic | [link](https://www.ebl.lmu.de/fragmentarium/K.2438) |
| `K.2380` | 0.994 | CANONICAL → Magic → Purification → Bīt rimki | [link](https://www.ebl.lmu.de/fragmentarium/K.2380) |
| `K.3420` | 0.993 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.3420) |
| `K.10243` | 0.993 | CANONICAL → Literature → Hymns → Divine → Šuʾila | [link](https://www.ebl.lmu.de/fragmentarium/K.10243) |
| `K.44` | 0.993 | CANONICAL → Magic → Exorcistic → Šurpu | [link](https://www.ebl.lmu.de/fragmentarium/K.44) |
| … +101 more | | | |

### Tier 3 — genre conflicts with Mīs pî (likely model false-positive; confirm rejection)

- `K.2432` (0.997) — CANONICAL → Magic → Medical → Sagalla
- `K.7854` (0.991) — CANONICAL → Technical → Medicine
- `1879,0708.48` (0.991) — CANONICAL → Divination → Celestial → Enūma Anu Enlil → Adad (EAE 36–49)
- `K.3243` (0.990) — CANONICAL → Technical → Medicine
- `K.6067` (0.990) — CANONICAL → Technical → Medicine → Therapeutic
- `K.2233` (0.990) — CANONICAL → Divination → Celestial → Enūma Anu Enlil → Adad (EAE 36–49)
- `K.2290` (0.989) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → VI Teeth
- `K.2419` (0.989) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → VI Teeth
- `Rm-II.135` (0.989) — CANONICAL → Divination → Terrestrial → Šumma ālu
- `K.10935` (0.988) — CANONICAL → Technical → Medicine
- `K.3804` (0.986) — CANONICAL → Divination → Physiognomy
- `K.8071` (0.986) — CANONICAL → Divination → Physiognomy
- … +5 more

## Udug-ḫul  (anchor: `Sm.1055`, confirmed positive)

Candidates ≥0.95: **135** — Tier 1 confirm: **0**, Tier 2 review: 111, Tier 3 likely-reject: 24.

### Tier 2 — ritual/āšipūtu genre but a different or unspecified leaf (REVIEW: may be a sibling of its genre's composition, not Udug-ḫul)

| candidate | model conf | eBL genre | eBL |
|---|---|---|---|
| `K.15728` | 0.999 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.15728) |
| `K.7288` | 0.999 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.7288) |
| `Rm-II.266` | 0.999 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/Rm-II.266) |
| `Rm-II.198` | 0.999 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/Rm-II.198) |
| `K.7203` | 0.998 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.7203) |
| `Sm.806` | 0.998 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/Sm.806) |
| `K.17136` | 0.998 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.17136) |
| `Rm-II.257` | 0.998 | CANONICAL → Magic | [link](https://www.ebl.lmu.de/fragmentarium/Rm-II.257) |
| `K.7825` | 0.998 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.7825) |
| `K.9578` | 0.998 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.9578) |
| `1881,0204.260` | 0.997 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/1881,0204.260) |
| `K.6293` | 0.997 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.6293) |
| `K.10853` | 0.997 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.10853) |
| `K.8991` | 0.997 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.8991) |
| `K.20519` | 0.996 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.20519) |
| `K.7919` | 0.996 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.7919) |
| `K.7906` | 0.996 | CANONICAL → Literature → Hymns → Divine → Šigû Prayer | [link](https://www.ebl.lmu.de/fragmentarium/K.7906) |
| `K.19266` | 0.996 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.19266) |
| `1880,0719.172` | 0.996 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/1880,0719.172) |
| `BM.123378` | 0.996 | CANONICAL → Literature → Hymns → Divine → Šuʾila | [link](https://www.ebl.lmu.de/fragmentarium/BM.123378) |
| `K.887` | 0.995 | CANONICAL → Magic | [link](https://www.ebl.lmu.de/fragmentarium/K.887) |
| `K.11607` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.11607) |
| `K.15597` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/K.15597) |
| `Sm.953` | 0.995 | CANONICAL → Magic → Varia → Zuburudabeda | [link](https://www.ebl.lmu.de/fragmentarium/Sm.953) |
| `Rm-II.335` | 0.995 | CANONICAL | [link](https://www.ebl.lmu.de/fragmentarium/Rm-II.335) |
| … +86 more | | | |

### Tier 3 — genre conflicts with Udug-ḫul (likely model false-positive; confirm rejection)

- `K.6198` (0.996) — CANONICAL → Technical → Medicine
- `K.9111` (0.993) — CANONICAL → Technical → Medicine
- `K.11772` (0.993) — CANONICAL → Technical → Medicine
- `1880,0719.292` (0.991) — CANONICAL → Divination
- `K.3993` (0.991) — CANONICAL → Technical → Medicine → Therapeutic
- `K.2566` (0.989) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → I Cranium
- `K.7642` (0.987) — CANONICAL → Technical → Medicine → Therapeutic
- `K.2531` (0.987) — CANONICAL → Technical → Medicine → Therapeutic
- `K.2448` (0.985) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → IV Neck
- `K.15448` (0.983) — CANONICAL → Technical → Medicine → Therapeutic
- `K.191` (0.983) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → VIII Stomach
- `K.2462` (0.982) — CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → VII Bronchia
- … +12 more

## Šurpu  (anchor: `BM.47463`, confirmed positive)

Candidates ≥0.95: **1** — Tier 1 confirm: **0**, Tier 2 review: 1, Tier 3 likely-reject: 0.

### Tier 2 — ritual/āšipūtu genre but a different or unspecified leaf (REVIEW: may be a sibling of its genre's composition, not Šurpu)

| candidate | model conf | eBL genre | eBL |
|---|---|---|---|
| `BM.41361` | 0.987 | CANONICAL → Technical → Commentary | [link](https://www.ebl.lmu.de/fragmentarium/BM.41361) |

## How to record a confirmed pair

For each Tier-1 pair you confirm against eBL, invoke `record_validation_resolution` with:
```
{ tablet_a: "<candidate>", tablet_b: "<anchor>", verdict: "positive",
  rationale: "identify_composition <conf> + eBL genre leaf-match; operator-confirmed vs <anchor> (<composition>)",
  source: "validation_queue" }
```

**Tier-1 genre-confirmed candidates: 10** (vs a 83-positive gap to G2). This is the honest yield: demanding an independent genre-leaf match collapses the ~300 high-conf model assignments to 10 defensible ones — almost all Mīs pî. The model's Udug-ḫul cluster has **no** genre-leaf corroboration (broad-magic/untagged grab-bag + medical false positives), so it yields zero Tier-1.

Confirming the 10 Tier-1 pairs would move G2 17 → ~27. The rest of the gap lives in Tier-2 (untagged `CANONICAL` candidates) and needs a **second independent signal** — chunk-overlap with the anchor — to become confirmable. That is the external-evidence rule below.

## Next: external-evidence rule (A2 step 2)

The genre-leaf-match used here is one independent signal; chunk-overlap is the other. An `auto_validate` rule should require **model-composition ≥0.95 AND (eBL genre leaf names the same composition OR chunk-overlap with a confirmed anchor ≥ threshold)**, with the threshold calibrated against the 17 known positives before it can write proposals. That rescues the untagged Tier-2 candidates (genre silent but textually overlapping a known sibling) without the circular self-labeling of trusting model confidence alone. Scoping pass to follow.
