#!/usr/bin/env python3
"""EvaCun token-prediction sidecar — masked-WORD restoration + scoring.

The Node driver `scripts/benchmark-evacun.mjs` shells out to THIS script. It is
intentionally thin: it takes a parsed-masked-examples JSON file on argv, loads a
fine-tuned BERT/WordPiece masked-LM checkpoint, runs the word<->subword BRIDGE
(the integrity crux), scores with EvaCun's own metric (exact-string-match accuracy
over masked WORD positions + top-3), and prints ONE JSON object on stdout:

    {"accuracy": float, "top3_accuracy": float, "n_masked": int,
     "majority_baseline": float, "split": str, "provenance": {...},
     "inference_available": true}

If torch / the checkpoint is absent it prints
    {"inference_available": false, "reason": "...", "setup_hint": "..."}
and exits 0 — it NEVER fabricates a score and never throws an unhandled error.

WHY a fine-tune is required: SLAB-NLP/Akk is MIT and runs here, but ships NO
pretrained weights — there is nothing to load until setup.sh's one-time fine-tune
produces a checkpoint under scripts/evacun/weights. Until then this reports
inference_available:false.

THE BRIDGE (the single thing most likely to silently inflate accuracy):
EvaCun masks WHOLE WORDS and scores exact word match. A BERT WordPiece tokenizer
splits one transliteration word (e.g. {URU}-sa-am-al-la, GU2, su2) into several
subtokens. For each masked word we must:
  (1) tokenize the surrounding line, locate the subword SPAN covering that word,
      and replace the WHOLE span with [MASK] tokens (mask every subword of the
      word, not just one);
  (2) decode the masked span and DETOKENISE the predicted subwords back into a
      single surface WORD (strip WordPiece "##" continuation markers, rejoin), so
      the prediction is comparable to EvaCun gold; for top-3, beam over the span
      and dedup AFTER detokenisation;
  (3) score = exact-string-match(pred_word, gold_word) / n_masked; top-3 = gold
      in the 3 decoded words.
  (4) Normalisation: DEFAULT exact match, NO casefolding / NO diacritic-stripping
      (translit is case- and subscript-sensitive: su2 != SU2, sza vs sa are
      distinct). A "normalized" variant (NFC + strip determinative braces) is
      offered ONLY as a clearly-labelled secondary metric, never the headline.
  (5) EXCLUDE pre-existing gap tokens ('...', 'x', 'X') from masking AND scoring
      so the model is never credited for "predicting" a lacuna. (The Node parser
      already drops these from masked positions; this is the second guard.)

The pure-Python BRIDGE helpers below are torch-free and unit-tested via
`--selftest` (the Node test suite asserts the same contract independently), so the
integrity crux is exercised even on a machine with no torch and no checkpoint.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback
import unicodedata
from typing import List, Optional, Sequence, Tuple

# ── Gap / lacuna tokens excluded from masking and scoring (guard 5). ──────────
GAP_TOKENS = {"...", "x", "X", "…", "[...]", "[…]"}

# ── Determinative braces stripped only in the optional "normalized" variant. ──
_DET_OPEN = "{"
_DET_CLOSE = "}"


def is_gap_token(tok: str) -> bool:
    """A pre-existing damage/lacuna token that must never be masked or scored."""
    return tok.strip() in GAP_TOKENS


def normalize_word(word: str, *, mode: str = "exact") -> str:
    """Normalise a predicted/gold word IDENTICALLY on both sides, or not at all.

    mode="exact"      → return unchanged (the headline metric; case + subscript
                        sensitive: su2 != SU2).
    mode="normalized" → NFC + strip determinative braces {..}. SECONDARY metric
                        only; never the headline.
    """
    if mode == "exact":
        return word
    if mode == "normalized":
        w = unicodedata.normalize("NFC", word)
        w = w.replace(_DET_OPEN, "").replace(_DET_CLOSE, "")
        return w
    raise ValueError(f"unknown normalization mode: {mode!r}")


def detokenize_wordpiece(subtokens: Sequence[str]) -> str:
    """Rejoin WordPiece subtokens into a single surface WORD.

    Continuation pieces carry a "##" prefix and attach with no separator; the
    first piece (and any piece lacking "##") starts a new surface chunk. Special
    tokens ([CLS]/[SEP]/[PAD]/[MASK]) are dropped. This is the inverse of the
    span-masking in (1), used for both top-1 and each top-3 candidate.
    """
    out: List[str] = []
    for t in subtokens:
        if t in ("[CLS]", "[SEP]", "[PAD]", "[MASK]", "[UNK]"):
            # [UNK] is kept as a literal so a UNK prediction never silently
            # matches gold; the others are structural and dropped.
            if t == "[UNK]":
                out.append(t)
            continue
        if t.startswith("##"):
            if out:
                out[-1] = out[-1] + t[2:]
            else:
                out.append(t[2:])
        else:
            out.append(t)
    # A single masked WORD detokenises to exactly one surface chunk; if the model
    # emitted a separator-bearing sequence we join with empty string because the
    # span was contiguous in the original word (hyphens/braces are part of the
    # subtokens themselves in this vocabulary, not separators).
    return "".join(out)


def find_word_span(
    word_index: int,
    word_lengths: Sequence[int],
) -> Tuple[int, int]:
    """Map a WORD index to its [start, end) SUBTOKEN span.

    `word_lengths[i]` = number of subtokens word i tokenised into (in order, with
    NO special tokens counted; the caller offsets by the leading [CLS]). Returns
    a half-open subtoken span relative to the first real token. This is the
    deterministic, torch-free core of bridge step (1) and is unit-tested: the span
    must EXACTLY cover the masked word's subtokens — no off-by-one into a
    neighbouring word, which would corrupt the mask and inflate/deflate accuracy.
    """
    if word_index < 0 or word_index >= len(word_lengths):
        raise IndexError(f"word_index {word_index} out of range [0,{len(word_lengths)})")
    start = sum(word_lengths[:word_index])
    end = start + word_lengths[word_index]
    return start, end


# ─────────────────────────────────────────────────────────────────────────────
# Torch-gated section. Everything above is import-safe with no torch.
# ─────────────────────────────────────────────────────────────────────────────

def _weights_dir() -> str:
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "weights")


def _checkpoint_present() -> bool:
    wd = _weights_dir()
    if not os.path.isdir(wd):
        return False
    # A HF checkpoint dir has config.json + a weights file.
    has_cfg = os.path.exists(os.path.join(wd, "config.json"))
    has_w = any(
        os.path.exists(os.path.join(wd, f))
        for f in ("model.safetensors", "pytorch_model.bin")
    )
    return has_cfg and has_w


def _gated_envelope(reason: str) -> dict:
    return {
        "inference_available": False,
        "reason": reason,
        "setup_hint": (
            "Run scripts/evacun/setup.sh (builds the python3.11 torch venv + clones "
            "SLAB-NLP/Akk), then fine-tune a checkpoint into scripts/evacun/weights/ "
            "from the TRAIN split with the eval split EXCLUDED. See scripts/evacun/SETUP.md."
        ),
    }


def run_eval(examples_path: str, split: str, norm_mode: str, top_k: int) -> dict:
    """Load checkpoint, run the bridge over every masked example, score EvaCun-style.

    Returns the result dict (inference_available:true) or the gated envelope.
    """
    if not _checkpoint_present():
        return _gated_envelope(
            f"no fine-tuned checkpoint under {_weights_dir()} (MODEL gate unmet)"
        )
    try:
        import torch  # noqa: F401
        from transformers import AutoModelForMaskedLM, AutoTokenizer
    except Exception as exc:  # torch/transformers absent — gated, not an error.
        return _gated_envelope(f"torch/transformers not importable ({exc}) — run setup.sh")

    with open(examples_path, encoding="utf-8") as fh:
        payload = json.load(fh)
    examples = payload.get("examples", [])
    if not examples:
        return _gated_envelope("no masked examples supplied by the Node driver")

    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    wd = _weights_dir()
    tok = AutoTokenizer.from_pretrained(wd)
    model = AutoModelForMaskedLM.from_pretrained(wd).to(device).eval()
    mask_id = tok.mask_token_id

    n = 0
    correct = 0
    top3 = 0
    gold_counts: dict = {}

    with torch.no_grad():
        for ex in examples:
            tokens: List[str] = ex["line_tokens"]      # surface words of the line
            wi: int = ex["masked_word_index"]          # which word is masked
            gold: str = ex["gold_word"]
            if is_gap_token(gold):
                continue  # guard 5: never score a lacuna
            gold_counts[gold] = gold_counts.get(gold, 0) + 1
            n += 1

            # BRIDGE (1): tokenise each word, build word_lengths, locate the span.
            per_word = [tok.tokenize(w) for w in tokens]
            word_lengths = [max(1, len(p)) for p in per_word]
            # Words that tokenised to nothing get a single [UNK] placeholder so the
            # span arithmetic stays exact.
            flat: List[str] = []
            for p in per_word:
                flat.extend(p if p else ["[UNK]"])
            start, end = find_word_span(wi, word_lengths)
            masked_pieces = flat[:start] + ["[MASK]"] * (end - start) + flat[end:]

            ids = tok.convert_tokens_to_ids(["[CLS]"] + masked_pieces + ["[SEP]"])
            input_ids = torch.tensor([ids], device=device)
            logits = model(input_ids).logits[0]  # [seq, vocab]

            # BRIDGE (2): decode each masked subtoken position, detokenise to a word.
            span_positions = list(range(start + 1, end + 1))  # +1 for [CLS]
            # top-1: argmax per masked subtoken, then detokenise the span.
            top1_sub = [tok.convert_ids_to_tokens(int(logits[p].argmax())) for p in span_positions]
            pred1 = detokenize_wordpiece(top1_sub)

            g = normalize_word(gold, mode=norm_mode)
            # Empty gold must never score (guards the degenerate empty==empty case
            # that would silently inflate accuracy).
            if g and normalize_word(pred1, mode=norm_mode) == g:
                correct += 1

            # top-3: take the top-k subtoken candidates at each masked position,
            # build candidate words by a small beam, dedup AFTER detokenisation.
            cand_words: List[str] = []
            beam: List[List[str]] = [[]]
            for p in span_positions:
                topk_ids = torch.topk(logits[p], k=min(top_k, logits.shape[-1])).indices.tolist()
                topk_toks = tok.convert_ids_to_tokens(topk_ids)
                new_beam: List[List[str]] = []
                for prefix in beam:
                    for t in topk_toks:
                        new_beam.append(prefix + [t])
                # keep the beam bounded
                beam = new_beam[: max(top_k * 2, 6)]
            seen = set()
            for seq in beam:
                w = detokenize_wordpiece(seq)
                wn = normalize_word(w, mode=norm_mode)
                if wn not in seen:
                    seen.add(wn)
                    cand_words.append(wn)
                if len(cand_words) >= 3:
                    break
            if g and g in cand_words[:3]:
                top3 += 1

    if n == 0:
        return _gated_envelope("0 scorable masked positions after excluding gap tokens")

    # Majority baseline (EvaCun's ~0.04 sanity floor): always-predict-the-most-
    # frequent gold word in THIS eval set.
    maj_word, maj_freq = max(gold_counts.items(), key=lambda kv: kv[1])
    majority_baseline = maj_freq / n

    return {
        "inference_available": True,
        "accuracy": correct / n,
        "top3_accuracy": top3 / n,
        "n_masked": n,
        "majority_baseline": majority_baseline,
        "majority_word": maj_word,
        "split": split,
        "normalization": norm_mode,
        "device": device,
        "provenance": {
            "model": "SLAB-NLP/Akk (MIT) fine-tuned checkpoint @ scripts/evacun/weights",
            "metric": "EvaCun exact-match word accuracy + top-3 over masked positions",
            "examples_source": os.path.basename(examples_path),
            "bridge": "word->subword span mask + WordPiece detokenise to surface word",
        },
    }


# ── Self-test: exercises the torch-free BRIDGE invariants the guardrail names. ─
def selftest() -> int:
    failures: List[str] = []

    def check(name: str, cond: bool) -> None:
        if not cond:
            failures.append(name)

    # span coverage: hyphenated/brace/subscript word in the middle of a line.
    # words: ["AN", "{URU}-sa-am-al-la", "GU2"] tokenising to lengths [1, 5, 2].
    lengths = [1, 5, 2]
    check("span_word0", find_word_span(0, lengths) == (0, 1))
    check("span_word1_multi_subtoken", find_word_span(1, lengths) == (1, 6))
    check("span_word2", find_word_span(2, lengths) == (6, 8))
    # out-of-range raises
    try:
        find_word_span(3, lengths)
        check("span_oob_raises", False)
    except IndexError:
        check("span_oob_raises", True)

    # detokenise round-trip: "##" continuation rejoins; specials dropped.
    check("detok_basic", detokenize_wordpiece(["su", "##2"]) == "su2")
    check("detok_brace", detokenize_wordpiece(["{", "##URU", "##}", "##sa"]) == "{URU}sa")
    check("detok_strips_specials", detokenize_wordpiece(["[CLS]", "GU", "##2", "[SEP]"]) == "GU2")
    check("detok_unk_kept", detokenize_wordpiece(["[UNK]"]) == "[UNK]")

    # normalization: exact is identity & case-sensitive; normalized strips braces.
    check("norm_exact_identity", normalize_word("su2") == "su2")
    check("norm_exact_case_sensitive", normalize_word("su2") != normalize_word("SU2"))
    check("norm_normalized_strips_braces",
          normalize_word("{URU}sa", mode="normalized") == "URUsa")

    # gap-token guard
    check("gap_dots", is_gap_token("...") is True)
    check("gap_x", is_gap_token("x") is True and is_gap_token("X") is True)
    check("gap_real_word_false", is_gap_token("ina") is False)

    # top3 superset of top1 invariant (logical): if pred1==gold then gold must be
    # in any top3 that includes pred1 — asserted structurally in the Node tests;
    # here we assert detok determinism so the same subtokens map to the same word.
    check("detok_deterministic",
          detokenize_wordpiece(["a", "##b"]) == detokenize_wordpiece(["a", "##b"]))

    result = {"selftest": "pass" if not failures else "fail", "failures": failures}
    print(json.dumps(result))
    return 0 if not failures else 1


def main() -> int:
    ap = argparse.ArgumentParser(description="EvaCun masked-word prediction sidecar.")
    ap.add_argument("--examples", help="Path to parsed-masked-examples JSON from the Node driver.")
    ap.add_argument("--split", default="validation", help="Split name for provenance.")
    ap.add_argument("--normalization", default="exact", choices=["exact", "normalized"])
    ap.add_argument("--top-k", type=int, default=5, help="Subtoken beam width for top-3.")
    ap.add_argument("--selftest", action="store_true",
                    help="Run the torch-free BRIDGE unit tests and exit.")
    args = ap.parse_args()

    if args.selftest:
        return selftest()

    if not args.examples:
        print(json.dumps(_gated_envelope("no --examples file supplied")))
        return 0

    try:
        out = run_eval(args.examples, args.split, args.normalization, args.top_k)
        print(json.dumps(out))
        return 0
    except Exception as exc:  # never throw a bare traceback at the Node side.
        sys.stderr.write(traceback.format_exc())
        print(json.dumps(_gated_envelope(f"unhandled error: {exc}")))
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
