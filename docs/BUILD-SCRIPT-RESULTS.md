# Build-script results — v0.42 + v0.44 caches populated

Generated 2026-05-25 after running `scripts/build-abz-glyph-map.mjs` and `scripts/build-lemma-index.mjs` against the live eBL API at polite-pacing concurrency=2.

## ABZ → Unicode glyph map (v0.42)

```
signs processed: 237
ok:              140
failed:          97
with glyph:      140
elapsed:         83.2s
cache size:      135 entries at ~/.cache/cuneiform-mcp/abz-glyph-map.json
```

**Failure mode identified:** the 97 failures are 404s on sign names with characters that interact badly with eBL URL routing. Examples: `A'` (apostrophe), `AG`, `AH`, `AM`, `AMA` (these appear to need a specific URL-encoding the script's `encodeURIComponent` doesn't produce, or eBL has multiple sign-name aliases not all of which resolve). Documented as a Round-30 calibration follow-up; current 140-entry cache covers the most-frequent ABZ codes.

### Round-30 follow-up — ABZ-number fallback (re-run 2026-05-25)

Diagnosed: Labasi's `sign_name` field doesn't always match eBL's canonical sign name. Concrete example: **Labasi names ABZ97 "AG" but eBL canonicalizes it as "AK"** (Unicode 73757 = 𒀝). The `/api/signs/AG` endpoint returns 404; `/api/signs?listsName=ABZ&listsNumber=97` returns the sign.

Build script now does a two-step lookup:
1. Try `/api/signs/{name}` (fast path, ~140 hits)
2. On 404, fall back to `/api/signs?listsName=ABZ&listsNumber={N}` (catches the canonical-name mismatch)

Results after re-run with fallback:

```
signs processed: 237
ok:              233    (was 140; +93 recovered)
failed:          4      (was 97; -93)
with glyph:      233
cache size:      222 entries (was 135; +87 new ABZ codes)
```

Remaining 4 failures: ABZ406 (KAM), ABZ228 (KIB), ABZ372 (US), ABZ187 (ŠÁM) — both lookup paths fail. These are likely signs eBL hasn't indexed under ABZ at all, or have list-naming inconsistencies internal to eBL. Documented as known-incomplete.

### v0.56 Track-C MZL-fallback recovery (2026-05-25)

All 4 previously hard-fail ABZ codes recovered via eBL's MZL-list endpoint. Discovery: those signs ARE in eBL but indexed under compound canonical names (|HI×BAD|, |GIŠ%GIŠ|, |ŠE.HU|, |NINDA₂×ŠE|) rather than the Labasi short names KAM/KIB/US/ŠÁM. Looking them up via `/api/signs?listsName=MZL&listsNumber={N}` (using the MZL number from Labasi metadata) returns the full sign record with Unicode.

| Labasi | ABZ | MZL | eBL canonical | Glyph |
|---|---|---|---|---|
| KAM | 406 | 640 | \|HI×BAD\| | 𒄰 |
| KIB | 228 | 378 | \|GIŠ%GIŠ\| | 𒄒 |
| US  | 372 | 583 | \|ŠE.HU\| | 𒊻 |
| ŠÁM | 187 | 333 | \|NINDA₂×ŠE\| | 𒉚 |

Cache now at **519 entries** (was 515). The 4 ABZ codes that were "known-incomplete" in v0.46 are now resolved — no hard fails remain in the Labasi subset.

### Updated K.5896 coverage

```
K.5896 first 27 tokens — resolved: 26/27 = 96.3%  (was 81.5%)

Rendered: 𒂊 𒉡 𒈠 𒅗 𒀭 𒈛 𒋾 𒀸 𒌓 𒊺 𒂵 𒀸 𒊺 𒆸 𒁹 [ABZ168] 𒁹 𒄑 𒃻 𒄘 𒀀 𒁺 𒈠 𒀭 𒌓 𒅆 𒈠
```

Only ABZ168 remains unresolved (likely outside the Labasi 239-sign subset entirely — Labasi covers a focused study set, not the full Borger sign list). The 4 failed ABZ codes in the cache (406, 228, 372, 187) are now documented as eBL-side gaps rather than tool bugs.

Round 27 audit re-runs cleanly with the expanded 222-entry cache (20/20 PASS).

### Live verification — K.5896 first 27 tokens

```
Rendered: 𒂊 𒉡 𒈠 𒅗 𒀭 𒈛 𒋾 𒀸 𒌓 𒊺 𒂵 𒀸 𒊺 𒆸 𒁹 [ABZ168] 𒁹 [ABZ296] [ABZ597] [ABZ106] 𒀀 𒁺 𒈠 𒀭 𒌓 [ABZ449] 𒈠

resolved:   22 of 27 (81.5%)
unresolved:  5 of 27 (Labasi-subset gap)
```

Per-token decoding:
- ABZ308 = 𒂊 (E)
- ABZ075 = 𒉡 (NU)
- ABZ342 = 𒈠 (MA)
- ABZ015 = 𒅗 (KA)
- ABZ013 = 𒀭 (AN — the DINGIR determinative!)
- ABZ321 = 𒈛 (LUH)
- ABZ073 = 𒋾 (TI)
- ABZ001 = 𒀸 (AŠ)
- ABZ381 = 𒌓 (UD)
- ABZ367 = 𒊺 (ŠE)

Real cuneiform appears in tool output. The original Yamamoto / Mertens panel ask is satisfied.

## Lemma index (v0.44) — substantive findings

```
targets processed: 21
ok:                21
failed:            0
with lemmas:       10 (of 21)
elapsed:           31.8s
cache:             ~/.cache/cuneiform-mcp/lemma-index.json
```

### Lemma coverage by tablet (sorted)

| Tablet | n_lemmas | Composition |
|---|---|---|
| K.2987.B | 420 | Mīs pî |
| K.2550 | 296 | Mīs pî |
| BM.47463 | 181 | Šurpu base |
| BM.45749 | 136 | Mīs pî / āšipūtu |
| K.7246 | 47 | Udug-ḫul |
| CBS.6060 | 45 | Šurpu commentary |
| K.3716 | 43 | EAE |
| Rm-II.504 | 30 | EAE |
| Sm.1055 | 29 | Udug-ḫul |
| BM.74130 | 13 | āšipūtu |

### Tablets with ZERO assigned lemmas (11)

`K.5896, K.9508, K.163, K.6683, K.2761, K.2961, K.2467, K.18, K.2950, BM.42125, BM.77056`

**Critical observation: K.5896 — the methods-paper centerpiece — has 938 lemmatizable tokens but ZERO assigned uniqueLemmas in eBL.** The structural slots exist but the canonical-lemma assignment has not been done. This is a coverage gap in eBL's curation, not a parsing bug. The same is true for K.9508, K.163, K.6683 (other Mīs pî witnesses), K.2761 (Bīt salāʾ mê), the 4 Maqlû tablets, BM.42125 (EAE), and BM.77056 (the āšipūtu cluster anchor).

### Cross-tablet lemma-Jaccard results

**Query: K.2987.B (Mīs pî, 420 lemmas) — top 5 by Jaccard**

| Rank | Candidate | Jaccard | Shared / Union | Top shared lemmas |
|---|---|---|---|---|
| 1 | K.2550 | 0.199 | 119 / 597 | awīlu I (man), qātu I (hand), eṭemmu I (ghost), miqtu I (falling) |
| 2 | BM.45749 | 0.142 | 69 / 487 | inūma I (when), pû I (mouth), ilu I (god), ina I (in) |
| 3 | BM.47463 | 0.103 | 56 / 545 | agubbû I (holy water), Ningirim I (goddess), ilu I, abu I (father) |
| 4 | K.3716 | 0.045 | 20 / 443 | rubû I (prince), alāku I (to go), lemuttu I (evil), ša I (rel.) |
| 5 | K.7246 | 0.042 | 19 / 448 | ahāzu I (to grasp), ša I, ina I, šarru I (king) |

**Query: BM.47463 (Šurpu base) — top 3**

| Rank | Candidate | Jaccard | Shared / Union | Top shared lemmas |
|---|---|---|---|---|
| 1 | CBS.6060 | 0.171 | 33 / 193 | bānû I (creator), narāmu I (beloved), Anu I, ša I |
| 2 | BM.45749 | 0.149 | 41 / 276 | ilu I, ina I, agubbû I, pānu I (face) |
| 3 | K.2987.B | 0.103 | 56 / 545 | agubbû I, Ningirim I, ilu I, abu I |

### Publishable findings (methods paper §3.28 amendment)

1. **Lemma-Jaccard recovers Mīs pî sibling-pair status independently of sign-trigram.** K.2987.B ↔ K.2550 at jaccard 0.199 is the strongest pair in the cache — both Mīs pî manuscripts. The lemma axis confirms the §3.7.3 finding using a completely orthogonal signal (lexical vocabulary, not orthographic sign sequences).

2. **Lemma-Jaccard recovers the §3.7.1 Šurpu base/commentary pair independently.** BM.47463 ↔ CBS.6060 at jaccard 0.171 is the top result for BM.47463. The §3.7.1 paper claim is validated by an orthogonal axis.

3. **Cross-composition overlap exposes shared āšipūtu vocabulary.** K.2987.B (Mīs pî) ↔ BM.47463 (Šurpu) at jaccard 0.103, with shared lemmas including `agubbû I` (holy water vessel — a ritual technical term), `Ningirim I` (purification goddess), `ilu I` (god), `abu I` (father). The §3.1 / §3.9.1 KAR-44 āšipūtu curriculum is recoverable from lemma-overlap, not just chunk-overlap.

4. **K.5896 is invisible to lemma-Jaccard because it lacks lemmatization.** The methods-paper centerpiece tablet has 938 lemmatizable tokens but zero scholar-assigned uniqueLemmas. This is a coverage gap in eBL's lemmatization workflow, not a tool failure. Reporting this honestly is the §3.28 amendment.

### Recommendations

- Methods paper §3.28 (lemma-Jaccard claim 48) needs amendment with these empirical numbers
- Continue lemma-index enrichment: 10/21 with-lemmas indicates eBL's lemmatization workflow has prioritized certain manuscripts and not others — characterizing this would be a publishable Round-30 calibration audit
- For composition-classification methodology (v0.32 identify_composition), consider FILTERING the registry's exemplar pool to lemmatized tablets when invoked in lemma-mode — the K.5896-as-exemplar reliance silently degrades when the lemma axis is invoked

### Audit regression status

Round 27 (sign-glyph): 20/20 PASS with real 135-entry cache
Round 29 (lemma-parallel): 18/18 PASS with real 21-entry cache

Both audits' backup/restore logic correctly preserves the real caches during synthetic-cache testing.
