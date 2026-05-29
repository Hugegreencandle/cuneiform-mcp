#!/usr/bin/env python3
"""CuneiBERT — head-to-head evaluation on the IDENTICAL frozen 500-gap set.

Reads dataset/gaps.json (exported by export_gaps.mjs from the exact benchmark
synthesis), windows each gap around its lacuna position, masked-predicts the
sign, and reports top-1/3/5 + MRR against the pinned baseline:
  restore_lacuna_semantic  ->  top1 0.182  top3 0.294  top5 0.360  MRR 0.260

Usage (after train.py):  python evaluate.py
"""
import argparse
import json
import os

import torch
from transformers import BertForMaskedLM

HERE = os.path.dirname(__file__)
BASELINE = {"top1": 0.182, "top3": 0.294, "top5": 0.360, "mrr": 0.260}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "dataset"))
    ap.add_argument("--model", default=os.path.join(HERE, "model"))
    ap.add_argument("--topk", type=int, default=10)
    args = ap.parse_args()

    with open(os.path.join(args.data, "tokenizer.json")) as f:
        tok = json.load(f)
    tok2id = tok["token_to_id"]
    id2tok = {v: k for k, v in tok2id.items()}
    n_special = len(tok["special_tokens"])
    MASK, DAMAGE, CLS, SEP = tok["MASK"], tok["DAMAGE"], tok["CLS"], tok["SEP"]
    max_len, content = tok["max_len"], tok["max_len"] - 2
    damage = set(tok["damage_tokens"])

    with open(os.path.join(args.data, "gaps.json")) as f:
        gaps = json.load(f)["gaps"]

    model = BertForMaskedLM.from_pretrained(args.model)
    model.eval()
    dev = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(dev)

    # Sign-only logit mask: predictions restricted to real signs (id >= n_special).
    sign_ids = torch.arange(n_special, tok["vocab_size"])

    def enc(t):
        return DAMAGE if t in damage else tok2id.get(t, tok["UNK"])

    top1 = top3 = top5 = 0
    mrr = 0.0
    n = 0
    for g in gaps:
        toks, pos, truth = g["tokens"], g["lacuna_position"], g["ground_truth"]
        # Window of <=content tokens containing pos, centered where possible.
        half = content // 2
        start = max(0, min(pos - half, len(toks) - content))
        start = max(0, start)
        window = toks[start:start + content]
        rel = pos - start
        if rel < 0 or rel >= len(window):
            continue
        ids = [CLS] + [enc(t) for t in window] + [SEP]
        rel_id = rel + 1  # account for [CLS]
        ids[rel_id] = MASK
        x = torch.tensor([ids], device=dev)
        with torch.no_grad():
            logits = model(x).logits[0, rel_id]  # (vocab,)
        sign_logits = logits[sign_ids]
        k = min(args.topk, sign_logits.shape[0])
        top = sign_ids[torch.topk(sign_logits, k).indices].tolist()
        preds = [id2tok.get(i, "[UNK]") for i in top]

        rank = preds.index(truth) + 1 if truth in preds else -1
        if rank == 1:
            top1 += 1
        if 0 < rank <= 3:
            top3 += 1
        if 0 < rank <= 5:
            top5 += 1
        if rank > 0:
            mrr += 1.0 / rank
        n += 1

    print(f"\nCuneiBERT — {n} gaps (same frozen set as the baseline)\n")
    print(f"{'metric':<8}{'CuneiBERT':>12}{'baseline':>12}{'delta':>10}")
    for key, label in [("top1", "top-1"), ("top3", "top-3"), ("top5", "top-5")]:
        val = {"top1": top1, "top3": top3, "top5": top5}[key] / n
        b = BASELINE[key]
        print(f"{label:<8}{val:>12.3f}{b:>12.3f}{val-b:>+10.3f}")
    mrr_v = mrr / n
    print(f"{'MRR':<8}{mrr_v:>12.3f}{BASELINE['mrr']:>12.3f}{mrr_v-BASELINE['mrr']:>+10.3f}")
    print(f"\nWow target: top5 ~0.6-0.7 (≈ doubling the 0.360 baseline).")


if __name__ == "__main__":
    main()
