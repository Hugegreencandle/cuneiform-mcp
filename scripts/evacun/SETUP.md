# EvaCun token-prediction harness — SETUP

This directory is an **honest, gated benchmark harness** for the **EvaCun 2025
token-prediction shared task** (missing-WORD restoration in transliterated
cuneiform). It mirrors the ProtoSnap-Layer-2 pattern: the Node driver
[`scripts/benchmark-evacun.mjs`](../benchmark-evacun.mjs) *shells out* to
`predict_masked.py` here via `execFile`, and the repo **never contains** the model
weights or the EvaCun corpus.

It is **benchmark-script-only** — it ships **no MCP tool** and **does not change
the tool count (stays 115)**.

> **Bottom line:** no faithful EvaCun accuracy can be printed on this machine
> today, for a **DATA** reason (not a model reason). The harness says so honestly
> and never fabricates a "beats SOTA" number.

## The task (confirmed)

EvaCun 2025 (Gordin / Sahala / Spencer / Klein, ACL ALP 2025) masks **15% of
WORDS** in transliterated cuneiform (Latin alphabet; Akkadian + Sumerian; eBL
Canonical + Archibab Old-Babylonian) with `[MASK]` and asks you to predict the
original word at each masked position. Metric = **accuracy** (fraction of masked
positions predicted correctly) + **top-3 accuracy**.

**Published references (genuine task figures, accurate):**

| system | accuracy | top-3 |
| --- | --- | --- |
| majority baseline | 0.04 | — |
| best single model (Mistral) | 0.221 | — |
| ensemble | 0.269 | 0.377 |

## Two gates (why no number prints yet)

### (1) DATA gate — decisive, NOT clearable here

The EvaCun masked-word **token-prediction files** are **organizer-distributed**
and have **no public download / DOI**. Both the organizers' paper
(`aclanthology 2025.alp-1.33`) and the participant paper (`arXiv:2510.15561`)
describe the file format only in **prose**; the organizers handed files to
participants directly.

The Zenodo DOI in circulation — **`10.5281/zenodo.17220687`** — resolves to a
**different artifact**: *"EvaCun: ORACC Akkadian Parallel Corpus"* v0.1 (Anderson,
**CC0**), a line-aligned three-way **machine-translation** corpus (Akkadian
translit / cuneiform Unicode / English). It has **no token IDs, no line/word-index
fields, no language column, no `[MASK]` markers, no gold-at-masked-position, and no
accuracy metric** (`grep MASK` = 0; the `...` tokens are tablet damage, not task
masks). This was **SHA256-verified during recon**. Building a `[MASK]` / word-index
/ accuracy parser against it would parse a format that does not exist there — the
exact overclaim to avoid.

**GATE STATUS: PERMANENTLY CLOSED (2026-06-11).** The files were requested from
the organizers and **officially declined** — Shai Gordin replied that the
agreement with the task's sponsors prohibits sharing the data publicly after the
event. **Do not re-request.** The official EvaCun test set will never be
available here, so no head-to-head EvaCun accuracy can ever be printed —
the harness's honest `data_available:false` posture is now the permanent,
correct behavior.

**The sanctioned avenue instead (from the same reply):** both **eBL** and
**Archibab** — the two sources the task corpus was drawn from (eBL Canonical +
Archibab Old-Babylonian) — now expose public APIs. A future **EvaCun-style**
benchmark can be built from API data using the published protocol (mask 15% of
words, accuracy + top-3). Any such number MUST be labeled
*"EvaCun-style protocol on self-drawn eBL/Archibab data — NOT the official test
set, NOT comparable head-to-head with the published 0.221/0.269 figures."*
Tracked as an expansion-backlog item; not built.

The original (now unreachable) clearing path is kept below for the record:

```
scripts/evacun/.cache/corpus/        # gitignored; license unconfirmed
  train.{tsv|jsonl}
  valid.{tsv|jsonl}                   # held-out eval — gold available, NOT trained on
```

Then wire `parseCorpusFiles()` in `benchmark-evacun.mjs` to the **documented**
field layout. The parser deliberately **refuses to guess a schema** — if files are
present but the layout is unconfirmed it reports `data_available:false` rather than
silently emitting a mis-scored number.

### (2) MODEL gate — secondary, clearable with your data

`SLAB-NLP/Akk` is **MIT** and runs on this M5 (python3.11 + `torch==2.2.1` + MPS;
load ~58 s, infer < 3 s, verified). But it ships **no pretrained weights** — it
must be **fine-tuned** from its in-repo ORACC data into a checkpoint before it can
predict anything.

**Build the checkpoint** (the integrity-critical part): fine-tune on the **TRAIN
split ONLY**, with the **eval split provably EXCLUDED** (else the accuracy is
contaminated and meaningless). Write the HF checkpoint to:

```
scripts/evacun/weights/              # gitignored
  config.json
  model.safetensors  (or pytorch_model.bin)
  tokenizer files
```

Until a checkpoint exists, `predict_masked.py` reports
`inference_available:false`.

## The word↔subword BRIDGE (the integrity crux)

EvaCun masks **whole words** and scores exact word match; the model's tokenizer is
**subword** (WordPiece). `predict_masked.py` implements the bridge and it is
**unit-tested before any end-to-end run**:

1. **Span coverage** — for each masked word, tokenize the surrounding line, locate
   the **subword span** covering that word, and replace the **whole span** with
   `[MASK]` (mask every subword of the word, not just one). `find_word_span()` is
   tested to cover hyphen / brace-group / subscript words exactly (no off-by-one
   into a neighbour).
2. **Detokenise** — decode the masked span and rejoin WordPiece subtokens (strip
   `##` continuations) back into a single surface **word** so the prediction is
   comparable to EvaCun gold. Top-3 beams over the span and dedups **after**
   detokenisation. `detokenize_wordpiece()` is round-trip tested.
3. **Score** — `accuracy = exact_match(pred_word, gold_word) / n_masked`;
   `top-3 = gold in 3 decoded words`. EvaCun's own metric.
4. **Normalisation** — DEFAULT **exact match, no casefolding, no diacritic
   stripping** (`su2 ≠ SU2`, `sza` vs `sa` distinct); prediction and gold are
   normalised **identically or not at all**. A `normalized` variant (NFC + strip
   determinative braces) is offered only as a clearly-labelled **secondary**
   metric, never the headline.
5. **Gap guard** — pre-existing gap tokens (`...`, `x`, `X`) are excluded from
   masking **and** scoring so the model is never credited for "predicting" a
   lacuna.

Run the bridge unit tests standalone (no torch, no checkpoint needed):

```bash
/opt/homebrew/bin/python3.11 scripts/evacun/predict_masked.py --selftest
# → {"selftest": "pass", "failures": []}
```

The Node test suite (`tests/evacunBridge.test.ts`) asserts the **same** invariants
independently, so the integrity crux is exercised in `npm run test`.

## Eval protocol & provenance (mandatory)

- **PREFERRED:** evaluate ONLY the held-out **validation** subset (gold available,
  not trained on) — the genuine EvaCun eval split — scored beside the references.
  Blocked by the DATA gate until the real files arrive.
- **FALLBACK (clearly relabelled):** if you accept the available MT corpus, it is
  an **"EvaCun-PROTOCOL replication"**, **NOT "the EvaCun benchmark"** — not
  comparable to 0.221 / 0.269 (different docs, masking RNG, doc-id grouping). It
  still requires the model fine-tuned on a **train-only** split with validation
  excluded.
- The harness always prints the **split name, example counts, and the train/eval
  source files** in its provenance block.

## Steps

```bash
# 1) one-time build (venv + pinned torch stack + SLAB-NLP/Akk clone)
bash scripts/evacun/setup.sh
#    (override the interpreter with EVACUN_PY311=/path/to/python3.11)

# 2) obtain the real EvaCun token-prediction files (DATA gate) → .cache/corpus/
# 3) fine-tune a checkpoint (MODEL gate) → weights/  [train-only; eval excluded]

# 4) run the benchmark
node scripts/benchmark-evacun.mjs
#    → prints accuracy + top-3 beside 0.04 / 0.221 / 0.269 / 0.377 if BOTH gates
#      clear; otherwise prints exactly which gate is unmet + how to clear it.
```

## Hard environment requirement

- **Python 3.11 from Homebrew** (`/opt/homebrew/bin/python3.11`). `torch==2.2.1`
  ships a prebuilt **cp311 arm64** wheel; the system `python3` (3.14) has **no
  torch wheel**. `setup.sh` enforces 3.11.

## Licensing — your responsibility

- The repo is **MIT**; this directory commits **only** our harness code
  (`setup.sh`, `requirements.txt`, `predict_masked.py`, `SETUP.md`, and the Node
  driver one level up).
- `SLAB-NLP/Akk` code+models are **MIT** (safe to clone + derive) but are kept
  **cache-only** by choice (`.cache/Akk`, gitignored).
- The **fine-tuned checkpoint** (`weights/`) and the **EvaCun corpus**
  (`.cache/corpus/`) are gitignored and **never redistributed** — committing
  weights would taint the MIT repo and committing the corpus would import a foreign
  license. The Zenodo MT corpus is **CC0** (Anderson); the real token-prediction
  files' license is **organizer-distributed / unconfirmed** — keep both
  cache-only.

## Citation

EvaCun 2025 Shared Task on Cuneiform Token Prediction — Gordin, Sahala, Spencer,
Klein (eds.), **ACL ALP 2025** (`aclanthology 2025.alp-1.33`).
