# cuneiform-mcp v0.19.0 — Sub-Tablet Chunk-Parallel Detection

Round-4 opens the position-aware methodology track. One new MCP tool, `find_chunk_parallels`, wrapped in the same Round-N calibration-audit rigor as v0.18.19 — and producing a substantive amendment to the methods paper §3.6 final-bi-orphan claim along the way.

## Calibration tally — Round 4

| Lever / Audit | Class | Effect |
|---|---|---|
| Lever 1 — Sub-tablet chunk parallel detection | **FIX** | New tool `find_chunk_parallels` exposing every maximal matched-position run ≥ `min_chunk_len` as a primary object (chunk_start + chunk_length + host_tablets[] + cross-genre/cross-period attribution + novelty score). Reuses v0.18.19's 2-of-3 inverted-index infrastructure; no new build artifacts. |
| Lever 1 — `min_chunk_len=20` precision default | **FIX** | Matches v0.18.19 `min_run=20` exactly. IM.49220 → 0 chunks at default; 20 spurious chunks at threshold 10. Same precision/noise tradeoff as run-as-scalar framing — only the output structure differs. |
| Methods-paper §3.6 amendment | **FIX (paper)** | "Final-2 bi-orphans (IM.49220 + K.3306)" narrows to "final-1 (IM.49220 only) after sub-tablet investigation." K.3306 surfaces 92.63% source coverage in K.6685 chunks, invisible to v0.18.19 because K.6685's 4.21× size ratio falls below the default `host_size_multiplier=5` guard. |

**Cumulative v0.18 + v0.19 calibration record:**

| Round | Version | Fixes | No-ops | Class |
|---|---|---|---|---|
| 1 | v0.18.1 | lacuna length-factor (23%→92% top-1) | — | one-line |
| 2 | v0.18.2 | bi-orphan threshold + score rebalance + fuzzy run-bonus | — | three-fix |
| 2 | v0.18.3 | find_parallel_text run-bonus | thematic length-bias + scribal threshold | one fix + two no-ops |
| 3 | v0.18.19 | embedded-fragments tool + commentary verdict + sig-evolution chain default | refrain-thematic + orthographic-outliers | three fix + two no-ops |
| **4** | **v0.19.0** | **chunk-parallels tool + min_chunk_len=20 + §3.6 amendment** | — | **one new primitive + one paper amendment** |

**Total: 9 calibrations shipped, 4 no-ops confirmed across the v0.18 + v0.19 family.**

## The discovery — K.3306 → K.6685

K.3306 has been a methods-paper §3.6 final-2 bi-orphan since v0.18.2 and was reconfirmed under v0.18.19's asymmetric containment probe. `find_chunk_parallels` exposes two chunks shared with K.6685:

- chunk `1:51` — 51 trigram positions (~53 signs)
- chunk `58:37` — 37 trigram positions (~39 signs)

Together they cover **92.63% of K.3306's trigram positions**. The relationship was invisible to v0.18.19 because K.6685 (4.21× K.3306's size) falls below the default `host_size_multiplier=5` guard. **K.3306 should be reclassified from "bi-orphan" to "chunk-related to K.6685, whole-tablet-isolated"** pending manual scholarly review of the shared text — and the §3.6 final-bi-orphan count drops from 2 to 1 (IM.49220 only).

## Calibration consistency

| Test | v0.18.19 Lever 1 | v0.19.0 Lever 1 |
|---|---|---|
| K.9508 positive | longest_run=142 (K.5896 #1, containment 0.986) | chunk_length=142 (K.5896 #1) — exact reproduction |
| K.9508 top-10 hosts | K.5896, BM.45749, K.2987.B, K.163, K.2550, … | Same 10 hosts, same ordering |
| IM.49220 at default | 0 matches | 0 chunks |
| 20-tablet random sample | 8/20 surface ≥1 host | 8/20 surface ≥1 chunk |
| Threshold sweep sweet spot | `min_run=20` | `min_chunk_len=20` |

The two tools agree on every calibration probe except K.3306, where `find_chunk_parallels` surfaces the K.6685 discovery v0.18.19 filtered out structurally.

## Tool surface — 61 MCP tools

| v0.18.3 baseline | + v0.18.4–v0.18.18 expansion | + v0.18.19 round-3 | + v0.19.0 round-4 |
|---|---|---|---|
| 30 tools | 29 new tools (59 total) | 1 new tool (60 total) | 1 new tool (61 total) |

`find_chunk_parallels` is the sole net-new tool in v0.19.0. The Round-4 audit and the §3.6 paper amendment are companion deliverables.

## Reproducibility

```bash
node scripts/build-signs-index.mjs                   # one-time corpus fetch if not cached
npm run build
node scripts/round4-chunk-parallels-audit.mjs        # full six-test audit
npm run smoke                                        # verify 61 tools, all live
```

Audit writeup: `docs/v0.19-calibration-round4-chunk-parallels.md`.

Methods paper §3.9 (the new section) + amendments to §3.6: `docs/methods-paper-cdlj-submission.md`.

## New methods-paper synthesis claims (round 4 adds claims 20-22)

20. Sub-tablet chunk granularity reveals relationships invisible to whole-tablet methods (K.3306 → K.6685, 92.63% source coverage).
21. Chunk-level decomposition preserves whole-tablet calibration thresholds (`min_chunk_len=20` mirrors v0.18.19 `min_run=20`).
22. Per-tablet chunk discovery does not require a corpus-wide chunk-hash index — defer that build to v0.20+ when corpus-wide enumeration tools justify it.

## Outstanding (deferred to v0.19.1 / v0.20)

- **Cross-genre stress on BM.77056** (the *āšipūtu* cluster seed) — blocked by missing fragment-metadata; populate via `enrich_prefix_metadata` before retesting. Expected to surface KAR-44 curriculum cross-genre incipits (medical Sakikkû / lexical Diri-Aa hosts of *āšipūtu* formulae).
- **Manual scholarly review** of K.3306 ↔ K.6685: is the 92.63%-coverage relationship a true textual parallel, a calendrical/numerical formula coincidence, or an unrecognized join?
- **Corpus-wide chunk-hash index** (`scripts/build-chunk-index.mjs`) — original v0.19 plan included it; deferred to v0.20 when the API design demands of `find_formulaic_passages`, `build_citation_graph`, and `trace_chunk_diffusion` can shape the index format.
