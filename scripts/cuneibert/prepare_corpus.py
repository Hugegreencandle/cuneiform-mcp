#!/usr/bin/env python3
"""CuneiBERT — corpus preparation (no torch needed; pure stdlib).

Builds the frozen tokenizer contract, windows each tablet's sign stream into
<=128-token sequences, and writes a TABLET-LEVEL train/val split (a whole tablet
goes to exactly one split — no window-level leakage).

Tokenizer contract (shared by train.py / evaluate.py / the future TS port):
  0 [PAD]  1 [UNK]  2 [CLS]  3 [SEP]  4 [MASK]  5 [DAMAGE]  then 2,082 signs -> 6..2087

Damage tokens (X / x / ?) -> [DAMAGE]. They are kept as input context but are
EXCLUDED from the MLM loss downstream (the #1 correctness trap — never train on
a sign whose true value is unknown). Unknown signs (the ~0.17% compound glyphs
outside the vocab) -> [UNK].
"""
import argparse
import json
import os
import random

SPECIAL = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]", "[DAMAGE]"]
PAD, UNK, CLS, SEP, MASK, DAMAGE = range(6)
DAMAGE_TOKENS = {"X", "x", "?"}
MAX_LEN = 128
CONTENT_LEN = MAX_LEN - 2  # room for [CLS] ... [SEP]
SPLIT_SEED = 20260525
VAL_FRACTION = 0.05


def build_tokenizer(cache_dir):
    with open(os.path.join(cache_dir, "sign-vocab.json")) as f:
        signs = json.load(f)["vocab"]
    # token -> id; signs after the 6 special tokens.
    tok2id = {t: i for i, t in enumerate(SPECIAL)}
    for s in signs:
        if s not in tok2id:  # signs never collide with special-token strings
            tok2id[s] = len(tok2id)
    return tok2id


def encode_token(t, tok2id):
    if t in DAMAGE_TOKENS:
        return DAMAGE
    return tok2id.get(t, UNK)


def windows_for_tablet(tokens, tok2id):
    """Yield <=128-id windows ([CLS] ...content... [SEP]) with >=1 maskable sign."""
    ids = [encode_token(t, tok2id) for t in tokens]
    for start in range(0, len(ids), CONTENT_LEN):
        chunk = ids[start:start + CONTENT_LEN]
        # need at least one real (non-special, non-DAMAGE) token to mask
        if not any(i >= len(SPECIAL) for i in chunk):
            continue
        yield [CLS] + chunk + [SEP]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", default=os.path.expanduser("~/.cache/cuneiform-mcp"),
                    help="dir containing all-signs-full.json + sign-vocab.json")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(__file__), "dataset"))
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    tok2id = build_tokenizer(args.cache)
    vocab_size = len(tok2id)
    print(f"Tokenizer: {vocab_size} ids ({len(SPECIAL)} special + {vocab_size - len(SPECIAL)} signs)")

    with open(os.path.join(args.cache, "all-signs-full.json")) as f:
        records = json.load(f)

    tablets = []
    for r in records:
        if not r.get("_id") or not isinstance(r.get("signs"), str):
            continue
        toks = [t for t in r["signs"].split() if t]
        if len(toks) < 30:
            continue
        tablets.append((r["_id"], toks))
    print(f"Eligible tablets (>=30 tokens): {len(tablets)}")

    # Tablet-level split (deterministic).
    rng = random.Random(SPLIT_SEED)
    ids = [tid for tid, _ in tablets]
    rng.shuffle(ids)
    n_val = int(len(ids) * VAL_FRACTION)
    val_ids = set(ids[:n_val])

    counts = {"train": 0, "val": 0}
    train_f = open(os.path.join(args.out, "train.jsonl"), "w")
    val_f = open(os.path.join(args.out, "val.jsonl"), "w")
    for tid, toks in tablets:
        split = "val" if tid in val_ids else "train"
        f = val_f if split == "val" else train_f
        for w in windows_for_tablet(toks, tok2id):
            f.write(json.dumps(w) + "\n")
            counts[split] += 1
    train_f.close()
    val_f.close()

    with open(os.path.join(args.out, "tokenizer.json"), "w") as f:
        json.dump({
            "special_tokens": SPECIAL,
            "PAD": PAD, "UNK": UNK, "CLS": CLS, "SEP": SEP, "MASK": MASK, "DAMAGE": DAMAGE,
            "max_len": MAX_LEN, "vocab_size": vocab_size,
            "damage_tokens": sorted(DAMAGE_TOKENS),
            "token_to_id": tok2id,
        }, f)

    print(f"Windows: train={counts['train']}  val={counts['val']}  (val tablets={n_val})")
    print(f"Wrote train.jsonl / val.jsonl / tokenizer.json to {args.out}")


if __name__ == "__main__":
    main()
