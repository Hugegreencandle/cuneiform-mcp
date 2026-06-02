// v0.78.0 — Image-modality scaffold (HONEST two-layer deliverable).
//
// LAYER 1 (runs now, zero new deps): fetchTabletPhoto() — resolve + cache a
//   fetchable full-res eBL tablet JPEG to local disk. This is the only
//   verified-working unblock and delivers standalone value.
//
// LAYER 2 (honest scaffold, torch-sidecar-GATED): alignSignPrototype() — when
//   the python3.11 ProtoSnap sidecar is installed (scripts/protosnap/.venv),
//   run REAL per-sign prototype ALIGNMENT on a PRE-CROPPED, ALREADY-IDENTIFIED
//   single-sign image; when absent, degrade gracefully (inference_available:
//   false + an actionable setup message). It NEVER throws on the missing-env
//   path.
//
// SCOPE HONESTY (the load-bearing constraint): ProtoSnap is per-sign prototype
// alignment, NOT sign detection. It does NOT find/segment/label unknown signs
// on a full tablet photo — it snaps a KNOWN sign's skeleton onto a crop whose
// identity you already supply, and outputs an aligned skeleton + a match score
// (no bounding boxes, no labels). End-to-end "tablet photo → detected signs"
// needs an upstream detector (DeepScribe / eBL cuneiform-ocr) that ProtoSnap
// does NOT provide and is OUT OF SCOPE here. This module deliberately exposes
// NO "detect_signs_in_photo" capability.
//
// Image-rights posture: tablet photos are British-Museum-collection material —
// link / fetch-to-cache only, NEVER redistribute or commit. ProtoSnap repo +
// weights are UNLICENSED → setup.sh clones/downloads them into the user's cache
// at their direction; this repo only CALLS, never CONTAINS.

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getEblPhotoApiUrl } from "./fragmentMetadata.js";

// Repo root, resolved from this compiled file (dist/imageModality.js → repo root).
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

/** Absolute path to the (optional) ProtoSnap sidecar venv python. */
export function protosnapVenvPython(): string {
  return join(REPO_ROOT, "scripts", "protosnap", ".venv", "bin", "python");
}

/** Absolute path to the ProtoSnap sidecar entrypoint script. */
export function protosnapAlignScript(): string {
  return join(REPO_ROOT, "scripts", "protosnap", "align_sign.py");
}

/** True iff the torch sidecar venv python exists on disk. */
export function protosnapInstalled(): boolean {
  return existsSync(protosnapVenvPython());
}

// ───────────────────────── LAYER 1: fetch_tablet_photo ─────────────────────

export type FetchTabletPhotoResult = {
  tablet_id: string;
  ebl_photo_api_url: string | null;
  cache_path: string | null;
  bytes: number | null;
  content_type: string | null;
  cached: boolean;
  warnings: string[];
};

/**
 * Resolve the fetchable eBL photo API URL for `tabletId`, fetch the JPEG, and
 * cache it under <cacheDir>/photos/<id>.jpg. Returns the on-disk path + size +
 * content-type. `cached:true` means the file was already present and reused
 * (unless forceRefresh).
 *
 * Never throws on network/HTTP failure — surfaces the problem via warnings and
 * returns cache_path:null. This keeps the tool graceful when eBL has no photo
 * for the tablet (~30-40% of transliterated fragments) or is unreachable.
 */
export async function fetchTabletPhoto(
  tabletId: string,
  cacheDir: string,
  opts: { forceRefresh?: boolean; fetchImpl?: typeof fetch } = {},
): Promise<FetchTabletPhotoResult> {
  const warnings: string[] = [];
  const url = getEblPhotoApiUrl(tabletId);
  const result: FetchTabletPhotoResult = {
    tablet_id: tabletId,
    ebl_photo_api_url: url,
    cache_path: null,
    bytes: null,
    content_type: null,
    cached: false,
    warnings,
  };
  if (!url) {
    warnings.push(`Cannot construct eBL photo API URL for tablet id "${tabletId}".`);
    return result;
  }

  const photosDir = join(cacheDir, "photos");
  // Sanitize the id into a safe filename (museum numbers contain '.' and digits).
  const safeName = tabletId.replace(/[^A-Za-z0-9._-]/g, "_");
  const dest = join(photosDir, `${safeName}.jpg`);

  if (!opts.forceRefresh && existsSync(dest)) {
    const st = statSync(dest);
    result.cache_path = dest;
    result.bytes = st.size;
    result.content_type = "image/jpeg";
    result.cached = true;
    return result;
  }

  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(url, {
      headers: { Accept: "image/jpeg,image/*" },
      redirect: "follow",
    });
    if (!res.ok) {
      warnings.push(
        `eBL photo API returned HTTP ${res.status} for ${tabletId} — likely no photo on file (eBL hosts photos for ~60-70% of transliterated tablets).`,
      );
      return result;
    }
    const contentType = res.headers.get("content-type");
    if (contentType && !contentType.startsWith("image/")) {
      warnings.push(
        `eBL photo API returned non-image content-type "${contentType}" for ${tabletId} — refusing to cache.`,
      );
      return result;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      warnings.push(`eBL photo API returned 0 bytes for ${tabletId}.`);
      return result;
    }
    if (!existsSync(photosDir)) mkdirSync(photosDir, { recursive: true });
    writeFileSync(dest, buf);
    result.cache_path = dest;
    result.bytes = buf.length;
    result.content_type = contentType ?? "image/jpeg";
    result.cached = false;
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`Failed to fetch eBL photo for ${tabletId}: ${msg}`);
    return result;
  }
}

// ──────────────────── LAYER 2: align_sign_prototype (gated) ────────────────

export const ALIGN_SETUP_HINT =
  "ProtoSnap sidecar not installed. Run: bash scripts/protosnap/setup.sh " +
  "(needs Homebrew python3.11 + a one-time multi-GB SD2-1 weights download via gdown). " +
  "This tool aligns a PRE-CROPPED, already-identified single sign — it does NOT detect signs on a tablet photo.";

export const ALIGN_NOTE =
  "alignment-not-detection; requires installed torch sidecar";

export type AlignSignResult = {
  sign_name: string;
  abz_code: string | null;
  sign_crop_path: string;
  inference_available: boolean;
  device: string | null;
  agg_score: number | null;
  aligned_skeleton_path: string | null;
  init_png_path: string | null;
  iterations: number | null;
  warnings: string[];
  note: string;
};

export type AlignSignParams = {
  sign_crop_path: string;
  sign_name: string;
  abz_code?: string;
  img_size?: number;
  device?: "mps" | "cpu";
  timeout_ms?: number;
};

/**
 * Honest scaffold tool. If the ProtoSnap sidecar venv is absent, return a
 * schema-valid `inference_available:false` envelope with an actionable setup
 * message — NEVER throw. If present, shell out (execFile-ONLY, fixed argv,
 * absolute venv-python path, timeout) to align_sign.py on a PRE-CROPPED,
 * PRE-IDENTIFIED single-sign image, parse the stdout JSON, and surface the
 * agg_score + aligned-skeleton path. Any nonzero exit / timeout / parse failure
 * becomes a warning, not a throw.
 *
 * `runner` is injectable for tests (defaults to the real execFile-based runner).
 */
export async function alignSignPrototype(
  params: AlignSignParams,
  cacheDir: string,
  runner: SidecarRunner = defaultSidecarRunner,
): Promise<AlignSignResult> {
  const warnings: string[] = [];
  const result: AlignSignResult = {
    sign_name: params.sign_name,
    abz_code: params.abz_code ?? null,
    sign_crop_path: params.sign_crop_path,
    inference_available: false,
    device: null,
    agg_score: null,
    aligned_skeleton_path: null,
    init_png_path: null,
    iterations: null,
    warnings,
    note: ALIGN_NOTE,
  };

  if (!protosnapInstalled()) {
    warnings.push(ALIGN_SETUP_HINT);
    return result;
  }

  if (!existsSync(params.sign_crop_path)) {
    warnings.push(
      `sign_crop_path does not exist: ${params.sign_crop_path}. ` +
        "This tool needs a PRE-CROPPED single-sign image (it does NOT detect signs on a tablet photo).",
    );
    return result;
  }

  const outDir = join(cacheDir, "protosnap", params.sign_name.replace(/[^A-Za-z0-9._-]/g, "_"));
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const device = params.device ?? "auto";
  const imgSize = params.img_size ?? 512;
  const timeoutMs = params.timeout_ms ?? 600_000;

  // Fixed argv — NO shell interpolation. execFile, not exec.
  const args = [
    protosnapAlignScript(),
    "--img",
    params.sign_crop_path,
    "--prompt",
    params.sign_name,
    "--img-size",
    String(imgSize),
    "--out-dir",
    outDir,
    "--device",
    device,
  ];

  try {
    const { stdout, code } = await runner(protosnapVenvPython(), args, timeoutMs);
    if (code !== 0) {
      warnings.push(`ProtoSnap sidecar exited with code ${code}.`);
      return result;
    }
    let parsed: Record<string, unknown>;
    try {
      // The sidecar may print progress to stdout; take the last JSON object line.
      const jsonLine = lastJsonLine(stdout);
      parsed = JSON.parse(jsonLine);
    } catch {
      warnings.push("Could not parse ProtoSnap sidecar JSON output.");
      return result;
    }
    result.inference_available = true;
    result.device = typeof parsed.device === "string" ? parsed.device : device;
    result.agg_score = typeof parsed.agg_score === "number" ? parsed.agg_score : null;
    result.aligned_skeleton_path =
      typeof parsed.aligned_skeleton_path === "string" ? parsed.aligned_skeleton_path : null;
    result.init_png_path = typeof parsed.init_png_path === "string" ? parsed.init_png_path : null;
    result.iterations = typeof parsed.iterations === "number" ? parsed.iterations : null;
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    warnings.push(`ProtoSnap sidecar failed: ${msg}`);
    return result;
  }
}

function lastJsonLine(stdout: string): string {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith("{") && l.endsWith("}"));
  if (lines.length === 0) {
    // Fall back to the whole blob (single-line JSON, possibly with trailing ws).
    return stdout.trim();
  }
  return lines[lines.length - 1];
}

export type SidecarRunner = (
  python: string,
  args: string[],
  timeoutMs: number,
) => Promise<{ stdout: string; stderr: string; code: number }>;

const defaultSidecarRunner: SidecarRunner = (python, args, timeoutMs) =>
  new Promise((resolvePromise) => {
    execFile(
      python,
      args,
      { timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          // execFile sets err.code to the exit code for nonzero exits, or a
          // string ('ETIMEDOUT') for timeouts. Normalize to a numeric code.
          const code = typeof (err as { code?: unknown }).code === "number"
            ? ((err as { code: number }).code)
            : 1;
          resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? String(err), code });
          return;
        }
        resolvePromise({ stdout: stdout ?? "", stderr: stderr ?? "", code: 0 });
      },
    );
  });
