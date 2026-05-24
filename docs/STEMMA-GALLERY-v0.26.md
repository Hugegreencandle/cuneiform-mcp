# Stemma Gallery (v0.26.0)

build_canonical_recension_tree run against 5 canonical seeds — extending methods paper §3.11 from the single K.5896 case to a gallery. Same neighbor-joining algorithm, same default parameters (max_witnesses=50, min_pairwise_chunks=3). Generated 2026-05-24.

## K.5896

*Mīs pî canonical case (methods §3.7.3, §3.11)*

- Witnesses recovered: **16**
- Internal nodes: 14
- Algorithm: neighbor_joining

Witnesses (closest → farthest from seed):
- K.5896  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.6683  (Neo-Assyrian · ?)
- K.15325  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.9508  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.8994  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.10176  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.3248  (Neo-Assyrian · CANONICAL → Magic)
- K.11920  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- CBS.4506  (Neo-Babylonian · CANONICAL → Lexicography → Thematic Word Lists)
- K.8117  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- … +6 more

Newick:
```
(K.15436:0.499974,K.18036:0.500026,(Sm.290:0.499974,((BM.38617:0.208333,BM.45749:0.208333)N2:0.291581,((CBS.4506:0.470179,(K.8117:0.07568,Rm-II.344:0.067177)N1:0.398868)N8:0.029478,(K.3248:0.497793,((K.10176:0.453199,(K.8994:0.407103,(K.15325:0.257304,K.11920:0.306798)N3:0.137769)N5:0.034971)N6:0.039318,(K.9508:0.455549,(K.5896:0.339934,K.6683:0.409241)N4:0.062603)N7:0.037094)N9:0.008395)N10:0.002037)N11:0.000241)N12:0.000077)N14:0.000026)N13;
```

## BM.77056

**āšipūtu* curriculum seed (§3.1, §3.9.1)*

- Witnesses recovered: **0**
- Internal nodes: 0
- Algorithm: neighbor_joining

Witnesses (closest → farthest from seed):

Newick:
```

```

## Sm.1055

*Udug-ḫul Nineveh chain (§3.7.2)*

- Witnesses recovered: **16**
- Internal nodes: 14
- Algorithm: neighbor_joining

Witnesses (closest → farthest from seed):
- Sm.1055  (Neo-Assyrian · CANONICAL)
- K.2377  (Neo-Assyrian · CANONICAL → Magic → Exorcistic → Asaggiga)
- Sm.296  (Neo-Assyrian · CANONICAL → Technical → Ritual texts)
- K.11968  (Neo-Assyrian · CANONICAL)
- 1880,0719.172  (Neo-Assyrian · CANONICAL)
- K.155  (Neo-Assyrian · CANONICAL → Literature → Hymns → Divine → Šuʾila)
- K.15771  (Neo-Assyrian · CANONICAL)
- BM.128070  (Neo-Assyrian · CANONICAL)
- K.15838  (Neo-Assyrian · CANONICAL)
- K.21987  (Neo-Assyrian · CANONICAL)
- … +6 more

Newick:
```
((K.6293:0.327323,(K.2466:0.347411,K.7246:0.368805)N8:0.008406)N9:0.066849,(K.4902:0.424721,((K.15838:0.265221,K.21987:0.271364)N4:0.068841,(K.4827:0.248263,(BM.128070:0.217896,K.2367:0.224412)N5:0.01304)N6:0.066686)N7:0.086088)N10:0.039,(K.155:0.443675,(K.15771:0.514652,('1880,0719.172':0.457635,(K.11968:0.382912,(Sm.296:0.324039,(Sm.1055:0.096432,K.2377:0.167304)N1:0.154909)N2:0.074533)N3:0.066197)N11:0.024477)N12:0.042745)N14:0.007349)N13;
```

## K.15325

*Refrain-bound liturgical family (§3.3, §3.7.3)*

- Witnesses recovered: **5**
- Internal nodes: 3
- Algorithm: neighbor_joining

Witnesses (closest → farthest from seed):
- K.15325  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.5896  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.11920  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.8994  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)
- K.10176  (Neo-Assyrian · CANONICAL → Magic → Purification → Mīs pî)

Newick:
```
(K.8994:0.367121,K.10176:0.487424,(K.5896:0.437278,(K.15325:0.183063,K.11920:0.38104)N1:0.165159)N3:0.013337)N2;
```

## BM.47463

*Šurpu commentary (§3.7.1)*

- Witnesses recovered: **3**
- Internal nodes: 1
- Algorithm: neighbor_joining

Witnesses (closest → farthest from seed):
- BM.47463  (Persian · CANONICAL → Technical → Commentary)
- CBS.6060  (Neo-Babylonian · ?)
- BM.41361  (Neo-Babylonian · CANONICAL → Technical → Commentary)

Newick:
```
(BM.47463:0,CBS.6060:0.225,BM.41361:0.775)N1;
```

## Methodological observations

The five stemmata span:
- Cluster archetypes 1 (compositional curriculum), 3 (refrain-bound liturgical), 5 (embedded fragment), and 7 (commentary quotation).
- Period distribution from Neo-Assyrian Kuyunjik (K.5896, K.15325, Sm.1055) to Neo-Babylonian (BM.77056, BM.47463).
- Genre coverage: Mīs pî, *āšipūtu* curriculum, Udug-ḫul, refrain-bound liturgy, Šurpu commentary.

Each stemma is auto-generated without philological curation. The trees should be read as **discovery candidates** for scholarly review, not as finished philological products. The K.5896 case (§3.11) has already surfaced K.6683 as a previously-undocumented close sister of K.5896 — a §3.7.3 amendment candidate worth verifying against Walker & Dick 2001's Mīs pî MS sigla. Similar surprises may exist in the other four cases.
