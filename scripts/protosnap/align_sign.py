#!/usr/bin/env python3
"""ProtoSnap sidecar — per-sign prototype ALIGNMENT (NOT detection).

The cuneiform-mcp Node tool `align_sign_prototype` shells out to THIS script.
It is intentionally thin: it takes a PRE-CROPPED, ALREADY-IDENTIFIED single-sign
image plus the sign's KNOWN name, runs ProtoSnap's prototype-alignment pipeline,
and prints a single JSON object on stdout:

    {"agg_score": float, "transform": [...], "init_png_path": "...",
     "aligned_skeleton_path": "...", "iterations": int, "device": "mps"|"cpu"}

It does NOT detect, segment, or label signs on a tablet photo. The crop and the
sign identity are INPUTS. An upstream detector (DeepScribe / eBL cuneiform-ocr,
out of scope for this repo) must produce the crop.

This script imports from the ProtoSnap repo cloned by setup.sh into
scripts/protosnap/.cache/ProtoSnap. Until setup.sh has run (venv + clone +
weights), the Node tool reports inference_available:false and never calls this
file — so a bare checkout with no torch is fine; nothing here is import-time
required by the MCP.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import traceback


def _pick_device(requested: str) -> str:
    try:
        import torch
    except Exception:  # torch absent — should never reach here via the gate.
        return "cpu"
    if requested == "cpu":
        return "cpu"
    if requested == "mps":
        return "mps" if torch.backends.mps.is_available() else "cpu"
    # auto
    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> int:
    ap = argparse.ArgumentParser(description="ProtoSnap per-sign alignment sidecar.")
    ap.add_argument("--img", required=True, help="Path to a PRE-CROPPED single-sign image.")
    ap.add_argument("--prompt", required=True, help="KNOWN sign name/identity (e.g. 'AN').")
    ap.add_argument("--img-size", type=int, default=512)
    ap.add_argument("--out-dir", required=True, help="Directory for alignment outputs.")
    ap.add_argument("--device", default="auto", choices=["auto", "mps", "cpu"])
    args = ap.parse_args()

    os.makedirs(args.out_dir, exist_ok=True)
    device = _pick_device(args.device)

    # Make the cloned ProtoSnap package importable.
    here = os.path.dirname(os.path.abspath(__file__))
    protosnap_dir = os.path.join(here, ".cache", "ProtoSnap")
    for cand in (protosnap_dir, os.path.join(protosnap_dir, "src")):
        if os.path.isdir(cand) and cand not in sys.path:
            sys.path.insert(0, cand)

    try:
        # ProtoSnap's public entrypoint name has drifted across commits; try the
        # documented ones in order. Each is expected to return (agg_score,
        # transform, artifact_paths) or write artifacts to out_dir.
        align_fn = None
        try:
            from protosnap.align import align_sign as align_fn  # type: ignore
        except Exception:
            try:
                from align import align_sign as align_fn  # type: ignore
            except Exception:
                align_fn = None

        if align_fn is None:
            raise ImportError(
                "Could not import ProtoSnap's align_sign entrypoint. Ensure setup.sh "
                "cloned the ProtoSnap repo into scripts/protosnap/.cache/ProtoSnap and "
                "that its public API matches; adjust the import in align_sign.py if the "
                "upstream entrypoint has moved."
            )

        result = align_fn(
            image_path=args.img,
            sign=args.prompt,
            img_size=args.img_size,
            out_dir=args.out_dir,
            device=device,
        )

        # Normalize whatever the upstream returns into our flat contract.
        out = {
            "device": device,
            "agg_score": None,
            "transform": None,
            "init_png_path": None,
            "aligned_skeleton_path": None,
            "iterations": None,
        }
        if isinstance(result, dict):
            out.update({k: result.get(k, out.get(k)) for k in out})
        print(json.dumps(out))
        return 0

    except Exception as exc:  # surface a JSON error the Node side can log.
        sys.stderr.write(traceback.format_exc())
        print(json.dumps({"error": str(exc), "device": device}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
