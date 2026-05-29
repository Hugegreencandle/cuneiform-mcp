#!/usr/bin/env python3
"""CuneiBERT — train the masked-sign transformer (needs torch + transformers; Colab T4).

From-scratch BertForMaskedLM (~6L/256H/4heads/maxlen128, ~5-8M params). The
DamageAwareCollator is load-bearing: it masks 15% of REAL signs only, and never
touches special tokens or [DAMAGE] — so a sign whose true value is unknown is
never used as a training label (the #1 correctness trap). Exports HF model +
a flat f32 weight blob + manifest for the pure-TS inference port.

Usage (Colab/venv with requirements.txt; run prepare_corpus.py first):
  python train.py --epochs 15 --batch 64
"""
import argparse
import json
import os
import struct

import torch
from torch.utils.data import Dataset
from transformers import (
    BertConfig,
    BertForMaskedLM,
    Trainer,
    TrainingArguments,
)

HERE = os.path.dirname(__file__)


def load_tok(ds_dir):
    with open(os.path.join(ds_dir, "tokenizer.json")) as f:
        return json.load(f)


class WindowDataset(Dataset):
    def __init__(self, path, max_len):
        self.rows = []
        with open(path) as f:
            for line in f:
                self.rows.append(json.loads(line))
        self.max_len = max_len

    def __len__(self):
        return len(self.rows)

    def __getitem__(self, i):
        ids = self.rows[i][: self.max_len]
        return ids


class DamageAwareCollator:
    """Mask 15% of REAL signs (id >= n_special); never special, never [DAMAGE]."""

    def __init__(self, tok, mlm_prob=0.15):
        self.PAD = tok["PAD"]
        self.MASK = tok["MASK"]
        self.n_special = len(tok["special_tokens"])
        self.vocab_size = tok["vocab_size"]
        self.max_len = tok["max_len"]
        self.mlm_prob = mlm_prob

    def __call__(self, batch):
        bsz = len(batch)
        L = min(self.max_len, max(len(x) for x in batch))
        input_ids = torch.full((bsz, L), self.PAD, dtype=torch.long)
        attn = torch.zeros((bsz, L), dtype=torch.long)
        for i, ids in enumerate(batch):
            ids = ids[:L]
            input_ids[i, : len(ids)] = torch.tensor(ids, dtype=torch.long)
            attn[i, : len(ids)] = 1

        labels = torch.full_like(input_ids, -100)  # -100 = ignored by the loss
        # maskable = real signs only (>= n_special), i.e. exclude PAD/UNK/CLS/SEP/MASK/DAMAGE.
        maskable = input_ids >= self.n_special
        probs = torch.full(input_ids.shape, self.mlm_prob)
        chosen = (torch.bernoulli(probs).bool()) & maskable
        labels[chosen] = input_ids[chosen]

        # 80% -> [MASK], 10% -> random real sign, 10% -> unchanged.
        r = torch.rand(input_ids.shape)
        to_mask = chosen & (r < 0.8)
        to_rand = chosen & (r >= 0.8) & (r < 0.9)
        input_ids[to_mask] = self.MASK
        if to_rand.any():
            rand_signs = torch.randint(self.n_special, self.vocab_size, (int(to_rand.sum()),))
            input_ids[to_rand] = rand_signs
        return {"input_ids": input_ids, "attention_mask": attn, "labels": labels}


def export_weights(model, out_dir):
    """Flat little-endian f32 blob + manifest (name -> {shape, offset, count}) for the TS port."""
    os.makedirs(out_dir, exist_ok=True)
    manifest = []
    offset = 0
    with open(os.path.join(out_dir, "cuneibert.weights.bin"), "wb") as bin_f:
        for name, p in model.named_parameters():
            arr = p.detach().cpu().contiguous().view(-1).to(torch.float32).numpy()
            bin_f.write(struct.pack(f"<{arr.size}f", *arr.tolist()))
            manifest.append({"name": name, "shape": list(p.shape), "offset": offset, "count": int(arr.size)})
            offset += int(arr.size)
    with open(os.path.join(out_dir, "cuneibert.manifest.json"), "w") as f:
        json.dump({"total_floats": offset, "dtype": "f32-le", "tensors": manifest}, f)
    print(f"Exported {offset} float32 weights + manifest to {out_dir}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=os.path.join(HERE, "dataset"))
    ap.add_argument("--out", default=os.path.join(HERE, "model"))
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch", type=int, default=64)
    ap.add_argument("--lr", type=float, default=5e-4)
    args = ap.parse_args()

    tok = load_tok(args.data)
    cfg = BertConfig(
        vocab_size=tok["vocab_size"],
        hidden_size=256,
        num_hidden_layers=6,
        num_attention_heads=4,
        intermediate_size=1024,
        max_position_embeddings=tok["max_len"],
        pad_token_id=tok["PAD"],
        type_vocab_size=1,
    )
    model = BertForMaskedLM(cfg)
    n_params = sum(p.numel() for p in model.parameters())
    print(f"CuneiBERT: {n_params/1e6:.2f}M params · vocab {tok['vocab_size']} · maxlen {tok['max_len']}")

    train_ds = WindowDataset(os.path.join(args.data, "train.jsonl"), tok["max_len"])
    val_ds = WindowDataset(os.path.join(args.data, "val.jsonl"), tok["max_len"])
    collator = DamageAwareCollator(tok)

    targs = TrainingArguments(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch,
        per_device_eval_batch_size=args.batch,
        learning_rate=args.lr,
        warmup_ratio=0.06,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=2,
        logging_steps=100,
        report_to=[],
        fp16=torch.cuda.is_available(),
    )
    trainer = Trainer(model=model, args=targs, train_dataset=train_ds,
                      eval_dataset=val_ds, data_collator=collator)
    trainer.train()
    trainer.save_model(args.out)
    export_weights(model, args.out)
    print(f"Done. HF model + weight blob in {args.out}")


if __name__ == "__main__":
    main()
