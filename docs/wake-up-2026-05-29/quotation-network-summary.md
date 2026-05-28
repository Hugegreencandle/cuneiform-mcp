# Quotation Network — corpus-wide composition graph

Generated: 2026-05-28T13-51-47-846Z  ·  cuneiform-mcp compute_quotation_network

## Summary

- Nodes (compositions): **10**
- Edges (quotation relationships): **74**
- Strongly-connected components: **1** (largest size: **10**)
- Isolate compositions (no quotation in or out): **0**

## Top Quoted-From (likely canonical base texts)

| Rank | Composition | In-degree |
| ---- | ----------- | --------- |
| 1 | maqlu | 9 |
| 2 | mis_pi | 9 |
| 3 | udug_hul | 9 |
| 4 | enuma_anu_enlil | 8 |
| 5 | summa_alu | 8 |
| 6 | bit_sala_me | 7 |
| 7 | summa_izbu | 7 |
| 8 | surpu | 7 |
| 9 | barutu | 6 |
| 10 | diri_aa | 4 |

## Top Quoters (likely commentaries / dependent compositions)

| Rank | Composition | Out-degree |
| ---- | ----------- | ---------- |
| 1 | maqlu | 9 |
| 2 | mis_pi | 9 |
| 3 | udug_hul | 9 |
| 4 | enuma_anu_enlil | 8 |
| 5 | summa_alu | 8 |
| 6 | bit_sala_me | 7 |
| 7 | summa_izbu | 7 |
| 8 | surpu | 7 |
| 9 | barutu | 6 |
| 10 | diri_aa | 4 |

## Edges

| Source | Target | Evidence | Weight | Tablets (sample) |
| ------ | ------ | -------- | -----: | ---------------- |
| enuma_anu_enlil | mis_pi | both | 37431.83 | `Sm.491`, `K.10243`, `K.3499`, `1880,0719.152`, `K.7913` |
| mis_pi | enuma_anu_enlil | chunk_parallel | 37171.83 | `K.10243`, `Sm.491`, `1880,0719.152`, `K.3499`, `1879,0708.48` |
| mis_pi | udug_hul | chunk_parallel | 26009.85 | `1879,0708.48`, `1879,0708.49`, `BM.128070`, `1880,0719.349`, `1882,0522.561` |
| udug_hul | mis_pi | chunk_parallel | 26009.85 | `1879,0708.49`, `1879,0708.48`, `BM.128070`, `1882,0522.561`, `1880,0719.349` |
| maqlu | mis_pi | chunk_parallel | 23658.58 | `K.19565`, `1879,0708.48`, `K.3151.A`, `K.3441`, `K.7271` |
| mis_pi | maqlu | chunk_parallel | 23658.58 | `1879,0708.48`, `K.19565`, `K.3441`, `K.3151.A`, `DT.226` |
| enuma_anu_enlil | summa_izbu | chunk_parallel | 21794.56 | `1881,0727.124`, `1879,0708.90`, `1881,0204.310`, `BM.45743`, `K.3773` |
| summa_izbu | enuma_anu_enlil | chunk_parallel | 21794.56 | `1879,0708.90`, `1881,0727.124`, `1881,0204.310`, `K.3773`, `BM.45743` |
| mis_pi | summa_izbu | chunk_parallel | 16677.18 | `MLC.2119`, `NCBT.1949`, `K.1365`, `1879,0708.90`, `BM.30119` |
| summa_izbu | mis_pi | chunk_parallel | 16677.18 | `NCBT.1949`, `MLC.2119`, `1879,0708.90`, `K.1365`, `MLC.2111` |
| barutu | mis_pi | chunk_parallel | 14722.61 | `K.2484`, `K.1365`, `1881,0204.198`, `K.2265`, `1868,0523.1` |
| mis_pi | barutu | chunk_parallel | 14722.61 | `K.1365`, `K.2484`, `1881,0204.198`, `1868,0523.1`, `K.2265` |
| bit_sala_me | mis_pi | chunk_parallel | 14289.75 | `Sm.1429`, `1882,0522.505`, `1882,0522.566`, `BM.121055`, `Sm.905` |
| mis_pi | bit_sala_me | chunk_parallel | 14289.75 | `1882,0522.505`, `Sm.1429`, `BM.121055`, `1882,0522.566`, `K.4614` |
| maqlu | udug_hul | chunk_parallel | 10620.61 | `K.19565`, `BM.123379`, `K.3151.A`, `1880,0719.126`, `K.7271` |
| udug_hul | maqlu | chunk_parallel | 10620.61 | `BM.123379`, `K.19565`, `1880,0719.126`, `K.3151.A`, `K.1284` |
| bit_sala_me | udug_hul | chunk_parallel | 8738.18 | `Sm.905`, `1880,0719.342`, `K.4629`, `K.2489`, `K.15725` |
| udug_hul | bit_sala_me | chunk_parallel | 8738.18 | `1880,0719.342`, `Sm.905`, `K.4629`, `K.15725`, `K.2489` |
| mis_pi | surpu | chunk_parallel | 8253.41 | `1879,0708.48`, `1881,0204.216`, `1891,0509.159`, `1882,0522.505`, `K.14854` |
| surpu | mis_pi | chunk_parallel | 8253.41 | `1881,0204.216`, `1879,0708.48`, `1891,0509.159`, `K.14854`, `1882,0522.505` |
| barutu | enuma_anu_enlil | chunk_parallel | 6648.46 | `K.2484`, `1881,0727.124`, `1880,0719.316`, `DT.139`, `K.2265` |
| enuma_anu_enlil | barutu | chunk_parallel | 6648.46 | `1881,0727.124`, `K.2484`, `1880,0719.316`, `DT.139`, `K.2265` |
| bit_sala_me | diri_aa | chunk_parallel | 6286.11 | `1882,0522.566`, `BM.123377`, `K.10070`, `BM.33598`, `K.9397` |
| diri_aa | bit_sala_me | chunk_parallel | 6286.11 | `BM.123377`, `1882,0522.566`, `K.10070`, `K.9397`, `BM.33598` |
| bit_sala_me | maqlu | chunk_parallel | 5490.54 | `1882,0522.566`, `K.3517`, `K.10070`, `K.4629`, `K.22273` |
| maqlu | bit_sala_me | chunk_parallel | 5490.54 | `K.3517`, `1882,0522.566`, `K.10070`, `K.22273`, `K.4629` |
| enuma_anu_enlil | summa_alu | chunk_parallel | 4306.67 | `DT.139`, `K.3949`, `K.11947`, `K.18635`, `K.9423` |
| summa_alu | enuma_anu_enlil | chunk_parallel | 4306.67 | `K.3949`, `DT.139`, `K.18635`, `K.11947`, `1881,0204.348` |
| diri_aa | maqlu | chunk_parallel | 3112.44 | `BM.123377`, `K.3517`, `Um.3508`, `Um.unn.8`, `1891,0509.160` |
| maqlu | diri_aa | chunk_parallel | 3112.44 | `K.3517`, `BM.123377`, `Um.unn.8`, `Um.3508`, `BM.38422` |
| enuma_anu_enlil | udug_hul | both | 2832.70 | `Sm.491`, `1881,0204.260`, `K.3499`, `K.7913`, `BM.123379` |
| udug_hul | enuma_anu_enlil | chunk_parallel | 2792.70 | `1881,0204.260`, `Sm.491`, `K.3499`, `BM.123379`, `K.7913` |
| diri_aa | mis_pi | chunk_parallel | 2337.75 | `K.5078`, `K.10243`, `BM.123377`, `BM.121055`, `K.155` |
| mis_pi | diri_aa | chunk_parallel | 2337.75 | `K.10243`, `K.5078`, `BM.121055`, `BM.123377`, `K.155` |
| bit_sala_me | surpu | chunk_parallel | 2204.63 | `U.3627`, `U.4143`, `NBC.10001`, `HS.1293`, `U.4524` |
| surpu | bit_sala_me | chunk_parallel | 2204.63 | `U.4143`, `U.3627`, `HS.1293`, `NBC.10001`, `U.4290` |
| mis_pi | summa_alu | chunk_parallel | 2053.33 | `K.4030`, `K.12285`, `K.3846`, `1881,0204.348`, `Sm.790` |
| summa_alu | mis_pi | chunk_parallel | 2053.33 | `K.12285`, `K.4030`, `1881,0204.348`, `K.3846`, `BM.41661` |
| diri_aa | udug_hul | chunk_parallel | 1840.58 | `K.5078`, `1881,0204.260`, `1879,0708.66`, `1880,0719.172`, `K.15771` |
| udug_hul | diri_aa | chunk_parallel | 1840.58 | `1881,0204.260`, `K.5078`, `1879,0708.66`, `1880,0719.172`, `K.15771` |
| surpu | udug_hul | chunk_parallel | 1794.88 | `1881,0204.216`, `BM.123379`, `1891,0509.159`, `1879,0708.49`, `BM.128070` |
| udug_hul | surpu | chunk_parallel | 1794.88 | `BM.123379`, `1881,0204.216`, `1879,0708.49`, `1891,0509.159`, `BM.128070` |
| summa_izbu | udug_hul | chunk_parallel | 1345.17 | `1879,0708.90`, `K.15807`, `K.3095`, `K.2048` |
| udug_hul | summa_izbu | chunk_parallel | 1345.17 | `K.15807`, `1879,0708.90`, `K.2048`, `K.3095` |
| enuma_anu_enlil | maqlu | chunk_parallel | 1024.25 | `K.7913`, `K.19565`, `K.7271`, `K.3499`, `K.4114` |
| maqlu | enuma_anu_enlil | chunk_parallel | 1024.25 | `K.19565`, `K.7913`, `K.7271`, `K.4114`, `K.3499` |
| barutu | summa_alu | chunk_parallel | 716.67 | `BM.48051`, `K.12285`, `K.2265`, `K.3949`, `K.3968` |
| summa_alu | barutu | chunk_parallel | 716.67 | `K.12285`, `BM.48051`, `K.3949`, `K.2265`, `BM.35442` |
| bit_sala_me | enuma_anu_enlil | chunk_parallel | 481.16 | `Sm.1429`, `K.2170`, `Sm.905`, `K.8353`, `K.4629` |
| enuma_anu_enlil | bit_sala_me | chunk_parallel | 481.16 | `K.2170`, `Sm.1429`, `K.8353`, `Sm.905`, `K.4629` |
| summa_izbu | surpu | chunk_parallel | 470.00 | `BM.36318`, `1884,0211.664`, `MLC.2110`, `VAT.7536` |
| surpu | summa_izbu | chunk_parallel | 470.00 | `1884,0211.664`, `BM.36318`, `VAT.7536`, `MLC.2110` |
| barutu | summa_izbu | chunk_parallel | 384.99 | `K.2484`, `1879,0708.90`, `K.2265`, `K.3797`, `K.3728` |
| summa_izbu | barutu | chunk_parallel | 384.99 | `1879,0708.90`, `K.2484`, `K.2265`, `K.3728`, `K.3797` |
| enuma_anu_enlil | surpu | chunk_parallel | 375.47 | `K.7913`, `1881,0204.216`, `K.2170`, `K.14854`, `K.2794` |
| surpu | enuma_anu_enlil | chunk_parallel | 375.47 | `1881,0204.216`, `K.7913`, `K.14854`, `K.2170`, `K.2794` |
| maqlu | summa_alu | chunk_parallel | 300.00 | `YBC.5009`, `YBC.5049` |
| summa_alu | maqlu | chunk_parallel | 300.00 | `YBC.5049`, `YBC.5009` |
| summa_alu | surpu | chunk_parallel | 240.00 | `K.6315`, `BM.46630`, `VAT.17115`, `BM.48887` |
| surpu | summa_alu | chunk_parallel | 240.00 | `BM.46630`, `K.6315`, `BM.48887`, `VAT.17115` |
| summa_alu | summa_izbu | chunk_parallel | 226.67 | `BM.41661`, `K.9645` |
| summa_izbu | summa_alu | chunk_parallel | 226.67 | `K.9645`, `BM.41661` |
| bit_sala_me | summa_alu | chunk_parallel | 210.00 | `BM.43223`, `BM.43449` |
| summa_alu | bit_sala_me | chunk_parallel | 210.00 | `BM.43449`, `BM.43223` |
| barutu | udug_hul | chunk_parallel | 167.55 | `K.2484`, `K.15790`, `K.2265`, `1889,0426.121`, `K.15807` |
| udug_hul | barutu | chunk_parallel | 167.55 | `K.15790`, `K.2484`, `1889,0426.121`, `K.2265`, `K.15807` |
| maqlu | surpu | chunk_parallel | 144.49 | `K.19565`, `1881,0204.216`, `K.3151.A`, `Rm-II.172`, `K.7271` |
| surpu | maqlu | chunk_parallel | 144.49 | `1881,0204.216`, `K.19565`, `Rm-II.172`, `K.3151.A`, `K.7271` |
| maqlu | summa_izbu | chunk_parallel | 120.00 | `EAE.col`, `DT.274` |
| summa_izbu | maqlu | chunk_parallel | 120.00 | `DT.274`, `EAE.col` |
| barutu | maqlu | chunk_parallel | 35.00 | `K.3870`, `K.3819` |
| maqlu | barutu | chunk_parallel | 35.00 | `K.3819`, `K.3870` |
| summa_alu | udug_hul | chunk_parallel | 30.00 | `MLC.2615`, `MLC.2614` |
| udug_hul | summa_alu | chunk_parallel | 30.00 | `MLC.2614`, `MLC.2615` |

## Warnings

- 1 tablets skipped (no composition resolution at conf ≥ 0.35)
- 567 tablets had cached assignments below conf threshold 0.35 (skipped)
- identifyComposition fallback used 1 times — consider rebuilding composition-assignments cache
- chunk_parallel stream: 96654 chunks examined, 24679 contributed cross-composition pairs (resolved 205373 / skipped 22791 tablet occurrences)
- citation stream: ingested 10 tablet edges, accepted 4 cross-composition edges (resolved 18 / skipped 1 endpoints)

---

### Reproducibility

Render the DOT file with Graphviz:

```bash
dot -Tsvg graph.dot > graph.svg
```
