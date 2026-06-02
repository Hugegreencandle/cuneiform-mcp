# ProtoSnap sidecar — SETUP

This directory is the **gated Layer-2** of cuneiform-mcp's image modality. It is
an **honest scaffold + runnable harness**: the MCP `align_sign_prototype` tool
*shells out* to `align_sign.py` here, but the repo **never contains** the
ProtoSnap code or its weights. Until you run `setup.sh`, the tool reports
`inference_available: false` and degrades gracefully (it never crashes).

## What this actually does — and does NOT do

- **DOES:** *per-sign prototype ALIGNMENT.* Given a **pre-cropped,
  already-identified** single-sign image **and** the sign's known name, ProtoSnap
  snaps that sign's prototype skeleton onto the crop and returns a match score +
  aligned skeleton. Both the crop and the identity are **inputs**.
- **DOES NOT:** detect, segment, or label signs on a full tablet photo. No
  bounding boxes, no labels, no "find the signs" step. End-to-end
  *tablet photo → detected signs* requires an **upstream detector**
  (e.g. DeepScribe or eBL `cuneiform-ocr`) that ProtoSnap does **not** provide and
  is **out of scope** for this repo.

If you need full-res tablet images on disk (the verified-working unblock), use
the `fetch_tablet_photo` MCP tool instead — it needs **none** of this setup.

## Hard environment requirement (the feasibility crux)

- **Python 3.11 from Homebrew** (`/opt/homebrew/bin/python3.11`). Verified live
  2026-06-02 on an Apple M5: a 3.11 venv installs the pinned `torch==2.2.1`
  (prebuilt **cp311 arm64** wheel), imports clean, and runs a real **MPS** matmul.
- The machine's **system `python3` is 3.14**, which has **no torch wheel yet** —
  do **not** use it. `setup.sh` enforces 3.11.

## Steps

```bash
# 1) one-time build (venv + pinned torch stack + ProtoSnap clone + dift MPS patch)
bash scripts/protosnap/setup.sh
#    (override the interpreter with PROTOSNAP_PY311=/path/to/python3.11 if needed)

# 2) download the multi-GB SD2-1 / ControlNet weights into the cache.
#    NOT auto-pulled by setup.sh to avoid a surprise multi-GB download.
#    Use the gdown id from the ProtoSnap repo's README, e.g.:
source scripts/protosnap/.venv/bin/activate
gdown --folder "<PROTOSNAP_WEIGHTS_GDRIVE_FOLDER_ID>" \
      -O scripts/protosnap/.cache/weights
#    (the exact folder/file id is published in the ProtoSnap repo you cloned in
#     step 1 — see its README/`download_weights` instructions.)
```

After step 1 succeeds, `align_sign_prototype` flips to `inference_available:
true` and runs real alignment (weights from step 2 are required for the
diffusion-feature stage).

## Status / known gaps (honest)

- **Verified in recon:** the 3.11 venv + `torch==2.2.1` install, clean import,
  and a live MPS matmul. So the sidecar **can** execute on this M5.
- **Not verified end-to-end in recon:** the multi-GB weights download and a full
  alignment run against the SD checkpoint. Treat step 2 as untested until it
  succeeds on your machine.
- **`dift.py` MPS patch:** upstream `dift.py` hardcodes cuda-or-cpu and never
  selects MPS (silent CPU fallback). `setup.sh` applies a one-line, idempotent
  patch (the file already has MPS dtype branches). Review it if alignment runs on
  CPU unexpectedly.
- **`transformers` pin:** upstream leaves `transformers` unpinned and it resolves
  to 5.x, which breaks `diffusers 0.27`. `requirements.txt` pins `~=4.38` +
  `numpy==1.26.4`. Do not unpin.

## Licensing — your responsibility

- **ProtoSnap repo + weights are UNLICENSED** (no license card). `setup.sh`
  clones/downloads them into `scripts/protosnap/.cache/` **at your direction**;
  this MCP repo only *calls* the sidecar and ships **no** ProtoSnap code/weights.
- **SD2-1 weights have no license card** — **commercial use is UNCONFIRMED**.
- **Tablet photos** are British-Museum-collection material — link / fetch to your
  local cache only; never redistribute or commit.
- Everything under `scripts/protosnap/.venv`, `scripts/protosnap/.cache`, and the
  MCP cache (`~/.cache/cuneiform-mcp/protosnap`, `.../photos`) is **gitignored**.

## Citation

ProtoSnap: Prototype Alignment for Cuneiform Signs — Mikulinsky, Cohen, et al.,
**ICLR 2025**.
