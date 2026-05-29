# CuneiBERT — build doc (the first neural model of cuneiform)

A from-scratch masked-**sign** transformer trained on the eBL sign corpus, benchmarked
head-to-head against the pinned lacuna-restoration baseline. Flagship of `ROADMAP-MINDBLOWING-v0.72.md`.

> **Status: de-risk GREEN (2026-05-29). Training not yet run** (needs torch/GPU — see Toolchain).
> This directory is the Colab-ready pipeline; inference will be a pure-TS port so the MCP server
> keeps its tiny `npx` footprint.

---

## 1. De-risk gate — PASSED (the go decision)

The roadmap's first step was "de-risk the data, not the model." Both gates pass:

**Gate 1 — baseline reproduces bit-exact.** `BLEU_BENCHMARK_SAMPLE_SIZE=500 node scripts/benchmark-lacuna-bleu.mjs`
on the live corpus regenerated the pinned numbers exactly: **27,112 eligible tablets (≥30 tokens) → 500
gaps → top-1 18.20% (91/500), top-3 29.40%, top-5 36.00%, MRR 0.2597.** The 500-gap set + scoring are
deterministic (mulberry32 @ seed 20260525), so a CuneiBERT head-to-head on the identical gaps is valid.

**Gate 2 — tokenizer aligned.** Of 4,874,046 non-damage corpus tokens, **99.83% map to the 2,082-sign
vocab** (`sign-vocab.json`); only 0.17% (8,242) unmapped — all rare compound glyphs (e.g. `ABZ532/ABZ74`),
which map to `[UNK]`. Plus **382,978 damage tokens (`X`/`x`/`?`)** — the native `[MASK]` supply (~7.3%).
No tokenizer misalignment; the plan does not stall.

**Honest recalibration (correcting the roadmap):** the 0.182 baseline is `restore_lacuna_semantic`
(the v0.30 **sign2vec-augmented** restorer), NOT a "trivial bigram." So CuneiBERT's target (≈ doubling
top5 → ~0.6–0.7) is a *tougher* bar than the roadmap implied — beating a real embedding model, not a strawman.

---

## 2. Architecture

- BERT-style bidirectional **masked-language model**, from scratch (no pretrained weights — there is no
  cuneiform LM to fine-tune).
- **~6 layers / 256 hidden / 4 heads / max_len 128 / intermediate 1024** → ~5–8M params. Tiny because the
  vocab is only ~2,088 — trainable in hours on a single Colab T4.
- **Vocab (2,088):** 6 special tokens `[PAD]=0 [UNK]=1 [CLS]=2 [SEP]=3 [MASK]=4 [DAMAGE]=5` + the 2,082
  signs from `sign-vocab.json` (ids 6…2087). Frozen contract shared by prepare/train/evaluate and the TS port.

### The #1 correctness trap (load-bearing)

Real damage tokens (`X`/`x`/`?`, ~7.3% of all tokens) map to **`[DAMAGE]`** and are **excluded from the
MLM loss** — they stay in the input as context ("a sign was here") but are NEVER masked-as-targets and
NEVER predicted-against, because we don't know their true value. Training on them would be self-labeling
and would silently inflate accuracy. The custom data collator enforces this: it masks 15% of *real,
non-special, non-DAMAGE* positions only.

---

## 3. Pipeline (this directory)

| File | Runs where | What |
|---|---|---|
| `prepare_corpus.py` | Colab/venv | Build the tokenizer, window tablets to ≤128 tokens, **tablet-level** train/val split (no leakage), write `dataset/{train,val}.jsonl` + `tokenizer.json`. |
| `train.py` | Colab GPU | HF `BertForMaskedLM` (config above) + `DamageAwareCollator` (15% masking, never DAMAGE), ~10–20 epochs, save HF model + export `cuneibert.weights.bin` (f32) + `cuneibert.config.json` for the TS port. |
| `export_gaps.mjs` | local Node | Regenerate the **identical** benchmark gaps (reuses `benchmark-lacuna-bleu.mjs`'s exact mulberry32 synthesis) → `dataset/gaps.json`. This is how evaluate.py gets the same 500 gaps without re-porting the RNG. |
| `evaluate.py` | Colab/venv | Load the trained model, read `gaps.json`, window each gap, masked-predict, compute top-1/3/5 + MRR, print the **head-to-head table vs 0.182 / 0.36**. |
| `requirements.txt` | — | torch + transformers + numpy (pinned; Python 3.11/3.12). |

---

## 4. Toolchain reality + how to run

This box is **Python 3.14.5 with no torch** (wheels unavailable). Train in **Google Colab** (free T4) or a
local **3.11/3.12 venv**:

```bash
# 1. Locally (Node present): regenerate the frozen gap set for evaluation
node scripts/cuneibert/export_gaps.mjs            # → scripts/cuneibert/dataset/gaps.json

# 2. In Colab (or a 3.11 venv with requirements.txt), with the cache files uploaded:
python prepare_corpus.py --cache <dir-with-all-signs-full.json+sign-vocab.json>
python train.py --epochs 15
python evaluate.py                                 # prints the head-to-head table
```

Upload to Colab: `all-signs-full.json`, `sign-vocab.json` (from `~/.cache/cuneiform-mcp/`), this `cuneibert/`
dir, and `dataset/gaps.json`.

---

## 5. The wow demo (success criterion)

One table on the **identical frozen 500-gap set**:

| Restorer | top1 | top5 | MRR |
|---|---|---|---|
| `restore_lacuna_semantic` (baseline, pinned) | 0.182 | 0.360 | 0.260 |
| **CuneiBERT** | ? | **target ~0.6–0.7** | ? |

Credible because the model sees the whole bidirectional line, not one bigram of context.

---

## 6. After training — the TS inference port (separate PR)

`src/cuneibert.ts`: a ~300-line pure-TS forward pass (hand-rolled matmul over `Float32Array`) reading
`cuneibert.weights.bin` once, lazy-cached like `signInference.ts`. Register `restore_lacuna_neural`
(copy the `restore_lacuna_semantic` registration block) and route its softmax through the existing
`recalibrateLacunaScores` Platt path. **Gate before shipping:** a logit-parity test (the TS forward pass
must match PyTorch logits to ~1e-4 on a fixed input — watch layernorm eps, gelu variant, softmax order).
Keeps the server's 2-dependency footprint; no Python at runtime. Write the neural benchmark to a NEW file
so the 0.182 baseline stays pinned (`/tmp/lacuna-baseline-pinned.json` is the current backup).
