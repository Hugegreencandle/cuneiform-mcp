# discover_compositions — unsupervised cluster discovery

Generated: 2026-05-28T13:48:58.933Z

## Run parameters

| field | value |
|---|---|
| algorithm | hierarchical_ward |
| k | 50 |
| max_tablets | 2000 |
| min_cluster_size | 5 |
| novelty_threshold | 0.5 |
| seed | 20260528 |
| embedding source | tablet-vectors.f32 (random_indexing, 300-dim) |
| embedding generated_at | 2026-05-16T10:33:37.629Z |

## Metrics

| metric | value |
|---|---|
| clusters_found (≥ min_cluster_size) | 50 |
| silhouette_score (subsample n=500) | 0.0719 |
| total_tablets_clustered | 2000 |
| tablets_in_candidate_new_compositions | 1081 |
| iterations | 1950 |
| converged | true |

## Registered-composition recovery (cosine ≥ 0.5 = recovered)

Recovered: **10 / 11**

| composition | best cluster | max cosine | exemplars (embedded / total) |
|---|---|---|---|
| Mīs pî (mis_pi) | cluster_20 | 0.5975 | 7 / 7 |
| Šurpu (surpu) | cluster_3 | 0.4673 | 2 / 2 |
| Udug-ḫul (udug_hul) | cluster_20 | 0.7463 | 2 / 2 |
| Bīt salāʾ mê (bit_sala_me) | cluster_3 | 0.7591 | 1 / 1 |
| Maqlû (maqlu) | cluster_5 | 0.7239 | 1 / 4 |
| Enūma Anu Enlil (enuma_anu_enlil) | cluster_46 | 0.6082 | 3 / 3 |
| Šumma izbu (summa_izbu) | cluster_17 | 0.5612 | 1 / 3 |
| Šumma ālu (summa_alu) | cluster_29 | 0.5997 | 3 / 3 |
| Bārûtu (barutu) | cluster_29 | 0.6912 | 2 / 3 |
| Diri / Aa (diri_aa) | cluster_11 | 0.6778 | 2 / 2 |
| āšipūtu (KAR-44 curriculum) (asiputu_kar44) | cluster_20 | 0.5592 | 5 / 5 |

## Candidate new compositions (novelty > 0.5)

Total candidates surfaced: **33**

### Top-5 candidates

| rank | cluster | n | novelty | nearest registered (cos_dist) | suggested label | reps |
|---|---|---|---|---|---|---|
| 1 | cluster_28 | 38 | 0.948 | summa_izbu (0.948) | Ur III archival (n=38) | U.7155, HS.306, U.4204, U.3870, BM.52134 |
| 2 | cluster_38 | 11 | 0.934 | surpu (0.934) | Ur III archival @Newly Registered Fragments (n=11) | U.30135, U.5464, IM.50908, U.7814.E, U.30502 |
| 3 | cluster_7 | 19 | 0.899 | bit_sala_me (0.899) | Ur III archival @Kuyunjik (n=19) | BM.38029, U.21278, U.4066, U.21191, U.3852 |
| 4 | cluster_9 | 68 | 0.850 | summa_izbu (0.850) | Old Babylonian archival (n=68) | YBC.3768, U.7814.K, U.3053, IM.85095, U.7103 |
| 5 | cluster_25 | 101 | 0.792 | summa_izbu (0.792) | Neo-Babylonian archival @Uruk (Warka) (n=101) | YBC.3516, Bod-AB.A.134, YBC.3775, Ashm-1923.735, Ashm-1930.576 |

### Full candidate list

#### cluster_28 — Ur III archival (n=38)

- size: 38
- novelty_score: 0.9475 (cos_dist to summa_izbu = 0.9475)
- dominant period: Ur III (45%)
- dominant find-spot/collection: Sippar (38%)
- dominant genre tag: ARCHIVAL (94%)
- representative tablets (top-5 by centroid centrality): U.7155, HS.306, U.4204, U.3870, BM.52134

#### cluster_38 — Ur III archival @Newly Registered Fragments (n=11)

- size: 11
- novelty_score: 0.9339 (cos_dist to surpu = 0.9339)
- dominant period: Ur III (45%)
- dominant find-spot/collection: Newly Registered Fragments (50%)
- dominant genre tag: ARCHIVAL (73%)
- representative tablets (top-5 by centroid centrality): U.30135, U.5464, IM.50908, U.7814.E, U.30502

#### cluster_7 — Ur III archival @Kuyunjik (n=19)

- size: 19
- novelty_score: 0.8988 (cos_dist to bit_sala_me = 0.8988)
- dominant period: Ur III (53%)
- dominant find-spot/collection: Kuyunjik (44%)
- dominant genre tag: ARCHIVAL (73%)
- representative tablets (top-5 by centroid centrality): BM.38029, U.21278, U.4066, U.21191, U.3852

#### cluster_9 — Old Babylonian archival (n=68)

- size: 68
- novelty_score: 0.8498 (cos_dist to summa_izbu = 0.8498)
- dominant period: Old Babylonian (42%)
- dominant find-spot/collection: Uruk (Warka) (29%)
- dominant genre tag: ARCHIVAL (98%)
- representative tablets (top-5 by centroid centrality): YBC.3768, U.7814.K, U.3053, IM.85095, U.7103

#### cluster_25 — Neo-Babylonian archival @Uruk (Warka) (n=101)

- size: 101
- novelty_score: 0.7925 (cos_dist to summa_izbu = 0.7925)
- dominant period: Neo-Babylonian (52%)
- dominant find-spot/collection: Uruk (Warka) (47%)
- dominant genre tag: ARCHIVAL (98%)
- representative tablets (top-5 by centroid centrality): YBC.3516, Bod-AB.A.134, YBC.3775, Ashm-1923.735, Ashm-1930.576

#### cluster_10 — Neo-Babylonian lexicography @Kuyunjik (n=13)

- size: 13
- novelty_score: 0.7867 (cos_dist to barutu = 0.7867)
- dominant period: Neo-Babylonian (54%)
- dominant find-spot/collection: Kuyunjik (54%)
- dominant genre tag: Lexicography (50%)
- representative tablets (top-5 by centroid centrality): BM.36652, BM.42126, K.13645, 1880,0719.310, BM.46208

#### cluster_24 — Neo-Assyrian @Kuyunjik (n=30)

- size: 30
- novelty_score: 0.7808 (cos_dist to asiputu_kar44 = 0.7808)
- dominant period: Neo-Assyrian (57%)
- dominant find-spot/collection: Kuyunjik (52%)
- dominant genre tag: Literature (29%)
- representative tablets (top-5 by centroid centrality): K.8567, BM.82841, F.90, K.17772, 1880,0617.2371

#### cluster_8 — Neo-Babylonian archival @Uruk (Warka) (n=26)

- size: 26
- novelty_score: 0.7678 (cos_dist to summa_izbu = 0.7678)
- dominant period: Neo-Babylonian (58%)
- dominant find-spot/collection: Uruk (Warka) (47%)
- dominant genre tag: ARCHIVAL (92%)
- representative tablets (top-5 by centroid centrality): MLC.2191, VAT.3046, MLC.1739, YBC.11427, BM.51200

#### cluster_21 — archival (n=30)

- size: 30
- novelty_score: 0.7655 (cos_dist to surpu = 0.7655)
- dominant period: Old Babylonian (37%)
- dominant find-spot/collection: Kuyunjik (31%)
- dominant genre tag: ARCHIVAL (74%)
- representative tablets (top-5 by centroid centrality): UM.29-13-141, U.5510, IM.49276, CBS.11354, IM.174801

#### cluster_1 — Neo-Babylonian archival @Uruk (Warka) (n=56)

- size: 56
- novelty_score: 0.7400 (cos_dist to summa_izbu = 0.7400)
- dominant period: Neo-Babylonian (75%)
- dominant find-spot/collection: Uruk (Warka) (77%)
- dominant genre tag: ARCHIVAL (98%)
- representative tablets (top-5 by centroid centrality): GCBC.689, NCBT.464, GCBC.287, GCBC.162, NBC.4638

#### cluster_39 — Neo-Assyrian @Kuyunjik (n=27)

- size: 27
- novelty_score: 0.7029 (cos_dist to asiputu_kar44 = 0.7029)
- dominant period: Neo-Assyrian (44%)
- dominant find-spot/collection: Kuyunjik (43%)
- dominant genre tag: ARCHIVAL (39%)
- representative tablets (top-5 by centroid centrality): YBC.17067, ISACM-A.3682, BM.30155, GCBC.925, Sm.1080

#### cluster_45 — Ur III archival (n=37)

- size: 37
- novelty_score: 0.6837 (cos_dist to bit_sala_me = 0.6837)
- dominant period: Ur III (78%)
- dominant find-spot/collection: Uruk (Warka) (31%)
- dominant genre tag: ARCHIVAL (100%)
- representative tablets (top-5 by centroid centrality): HS.1224, HS.1230, HS.1169, HS.1286, HS.1226

#### cluster_49 — lexicography @Kuyunjik (n=13)

- size: 13
- novelty_score: 0.6836 (cos_dist to maqlu = 0.6836)
- dominant period: Neo-Babylonian (38%)
- dominant find-spot/collection: Kuyunjik (57%)
- dominant genre tag: Lexicography (50%)
- representative tablets (top-5 by centroid centrality): U.30684, CBS.10945, U.30141, IM.135212, IM.135131.C

#### cluster_0 — Neo-Assyrian divination @Kuyunjik (n=32)

- size: 32
- novelty_score: 0.6824 (cos_dist to summa_izbu = 0.6824)
- dominant period: Neo-Assyrian (44%)
- dominant find-spot/collection: Kuyunjik (63%)
- dominant genre tag: Divination (48%)
- representative tablets (top-5 by centroid centrality): Rm.1000, IM.76875, 1879,0708.246, Sm.768, BM.134550

#### cluster_36 — Neo-Assyrian technical @Kuyunjik (n=22)

- size: 22
- novelty_score: 0.6755 (cos_dist to barutu = 0.6755)
- dominant period: Neo-Assyrian (52%)
- dominant find-spot/collection: Kuyunjik (45%)
- dominant genre tag: Technical (88%)
- representative tablets (top-5 by centroid centrality): K.6520, K.2357.A, K.2421, K.15948, IM.202652

#### cluster_14 — Neo-Babylonian @Kuyunjik (n=25)

- size: 25
- novelty_score: 0.6645 (cos_dist to surpu = 0.6645)
- dominant period: Neo-Babylonian (48%)
- dominant find-spot/collection: Kuyunjik (53%)
- dominant genre tag: ARCHIVAL (35%)
- representative tablets (top-5 by centroid centrality): K.6618, BM.36893, BM.36324, BM.128042, U.31001

#### cluster_42 — Neo-Assyrian divination @Kuyunjik (n=11)

- size: 11
- novelty_score: 0.6575 (cos_dist to surpu = 0.6575)
- dominant period: Neo-Assyrian (70%)
- dominant find-spot/collection: Kuyunjik (88%)
- dominant genre tag: Divination (44%)
- representative tablets (top-5 by centroid centrality): K.17939, Bab.46600.BP, K.12088, IM.65056, K.19922

#### cluster_47 — Ur III archival @Drehem (n=22)

- size: 22
- novelty_score: 0.6502 (cos_dist to bit_sala_me = 0.6502)
- dominant period: Ur III (91%)
- dominant find-spot/collection: Drehem (100%)
- dominant genre tag: ARCHIVAL (100%)
- representative tablets (top-5 by centroid centrality): U.3863, U.5088, U.6347, U.4568, U.4089

#### cluster_41 — Neo-Assyrian lexicography @Kuyunjik (n=8)

- size: 8
- novelty_score: 0.6197 (cos_dist to summa_izbu = 0.6197)
- dominant period: Neo-Assyrian (50%)
- dominant find-spot/collection: Kuyunjik (50%)
- dominant genre tag: Lexicography (40%)
- representative tablets (top-5 by centroid centrality): BM.43681, K.21944, K.15552, BM.37489, K.17677

#### cluster_23 — Ur III archival @Babylon (n=51)

- size: 51
- novelty_score: 0.6164 (cos_dist to bit_sala_me = 0.6164)
- dominant period: Ur III (59%)
- dominant find-spot/collection: Babylon (58%)
- dominant genre tag: ARCHIVAL (84%)
- representative tablets (top-5 by centroid centrality): U.7178, U.3661, YBC.5517, U.5180, U.5266

#### cluster_35 — Neo-Assyrian @Kuyunjik (n=55)

- size: 55
- novelty_score: 0.6121 (cos_dist to udug_hul = 0.6121)
- dominant period: Neo-Assyrian (55%)
- dominant find-spot/collection: Kuyunjik (60%)
- dominant genre tag: Divination (23%)
- representative tablets (top-5 by centroid centrality): Sm.1584, 1889,0426.79, BM.47158, BM.48375, CBS.3912

#### cluster_12 — Neo-Assyrian divination @Kuyunjik (n=27)

- size: 27
- novelty_score: 0.6063 (cos_dist to summa_alu = 0.6063)
- dominant period: Neo-Assyrian (59%)
- dominant find-spot/collection: Kuyunjik (71%)
- dominant genre tag: Divination (47%)
- representative tablets (top-5 by centroid centrality): K.3949, K.5876, K.19518, K.10748, K.3832

#### cluster_43 — Neo-Babylonian divination @Kuyunjik (n=15)

- size: 15
- novelty_score: 0.5845 (cos_dist to enuma_anu_enlil = 0.5845)
- dominant period: Neo-Babylonian (47%)
- dominant find-spot/collection: Kuyunjik (71%)
- dominant genre tag: Divination (73%)
- representative tablets (top-5 by centroid centrality): K.16307, K.14459, K.7030, BM.48962, K.6617

#### cluster_30 — Neo-Assyrian divination @Kuyunjik (n=43)

- size: 43
- novelty_score: 0.5822 (cos_dist to summa_izbu = 0.5822)
- dominant period: Neo-Assyrian (49%)
- dominant find-spot/collection: Kuyunjik (63%)
- dominant genre tag: Divination (76%)
- representative tablets (top-5 by centroid centrality): K.4024, K.3682, Sm.955, K.16246, BM.48116

#### cluster_40 — Neo-Assyrian divination @Kuyunjik (n=36)

- size: 36
- novelty_score: 0.5759 (cos_dist to barutu = 0.5759)
- dominant period: Neo-Assyrian (75%)
- dominant find-spot/collection: Kuyunjik (79%)
- dominant genre tag: Divination (74%)
- representative tablets (top-5 by centroid centrality): K.3490, Sm.2186, BM.32259, BM.46020, K.12232

#### cluster_13 — Neo-Babylonian lexicography @Sippar (n=6)

- size: 6
- novelty_score: 0.5676 (cos_dist to surpu = 0.5676)
- dominant period: Neo-Babylonian (67%)
- dominant find-spot/collection: Sippar (50%)
- dominant genre tag: Lexicography (60%)
- representative tablets (top-5 by centroid centrality): 1882,0323.135, BM.70783, K.15259, BM.76858, BM.37611

#### cluster_27 — Neo-Babylonian @Kuyunjik (n=34)

- size: 34
- novelty_score: 0.5531 (cos_dist to diri_aa = 0.5531)
- dominant period: Neo-Babylonian (53%)
- dominant find-spot/collection: Kuyunjik (52%)
- dominant genre tag: Literature (36%)
- representative tablets (top-5 by centroid centrality): BM.39252, BM.38879, IM.77198, Rm-IV.745, K.13848

#### cluster_22 — Neo-Babylonian @Kuyunjik (n=32)

- size: 32
- novelty_score: 0.5382 (cos_dist to maqlu = 0.5382)
- dominant period: Neo-Babylonian (56%)
- dominant find-spot/collection: Kuyunjik (52%)
- dominant genre tag: Magic (27%)
- representative tablets (top-5 by centroid centrality): BM.48066, BM.33841, F.142, K.10944, IM.74404

#### cluster_32 — Neo-Assyrian @Kuyunjik (n=33)

- size: 33
- novelty_score: 0.5355 (cos_dist to bit_sala_me = 0.5355)
- dominant period: Neo-Assyrian (45%)
- dominant find-spot/collection: Kuyunjik (47%)
- dominant genre tag: Lexicography (23%)
- representative tablets (top-5 by centroid centrality): 1880,0617.2578, Sm.902, Sm.1008.B, BM.55476, BM.134502

#### cluster_26 — Neo-Assyrian @Kuyunjik (n=71)

- size: 71
- novelty_score: 0.5294 (cos_dist to maqlu = 0.5294)
- dominant period: Neo-Assyrian (58%)
- dominant find-spot/collection: Kuyunjik (75%)
- dominant genre tag: Divination (31%)
- representative tablets (top-5 by centroid centrality): K.9673, ND.5497.17, K.3661, K.9849, BM.32782

#### cluster_44 — Neo-Assyrian magic @Kuyunjik (n=21)

- size: 21
- novelty_score: 0.5195 (cos_dist to udug_hul = 0.5195)
- dominant period: Neo-Assyrian (52%)
- dominant find-spot/collection: Kuyunjik (58%)
- dominant genre tag: Magic (56%)
- representative tablets (top-5 by centroid centrality): K.18414, BM.39879, BM.41625, Sm.187, BM.47069

#### cluster_18 — Old Babylonian archival @Kuyunjik (n=22)

- size: 22
- novelty_score: 0.5110 (cos_dist to diri_aa = 0.5110)
- dominant period: Old Babylonian (50%)
- dominant find-spot/collection: Kuyunjik (56%)
- dominant genre tag: ARCHIVAL (65%)
- representative tablets (top-5 by centroid centrality): IM.183453.4, IM.183584.3, IM.183216.3, IM.183066.1, Um.3533

#### cluster_16 — Neo-Babylonian archival @Kuyunjik (n=46)

- size: 46
- novelty_score: 0.5096 (cos_dist to summa_izbu = 0.5096)
- dominant period: Neo-Babylonian (43%)
- dominant find-spot/collection: Kuyunjik (50%)
- dominant genre tag: ARCHIVAL (46%)
- representative tablets (top-5 by centroid centrality): AO.6477, BM.36665, DT.183, Rm-II.179, BM.32397

## Honest reporting

Clustering does not equal discovery. A candidate cluster may be a real finding (a coherent composition or sub-corpus not yet in the registry) OR a methodological artifact (sign-count outliers, genre-label noise propagated by the embedding, or low-density regions an algorithm naïvely walls off). The metadata dominance percentages above are the first cheap filter:

- High period + high genre + high find-spot share (≥ 60% each) → likely a real corpus pattern worth investigating with identify_composition and find_chunk_parallels.
- Low metadata dominance across all three axes → likely a mixed cluster picking up incidental embedding-space neighbors. Tune (higher k, raise novelty_threshold, or switch algorithm).
- Cluster sizes near min_cluster_size → fragile; re-run at a different max_tablets and check if the cluster reappears (stability test).

## Next steps for the operator

- For each top-5 candidate, run identify_composition on each representative tablet to see if the existing registry would in fact absorb them at the per-tablet scoring level (it might — centroid-level novelty can mask exemplar-level near-matches).
- For high-dominance candidates, draft a registry-amendment proposal at data/compositions-v2.draft.json with the representative_tablets as initial exemplars.
- Re-run with different max_tablets (e.g. 2500 vs 5000) and check candidate stability — a true finding should reappear; clustering artifacts won't.
