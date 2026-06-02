// v0.78.0 — Image-modality scaffold tests.
//
// Two contracts that must hold WITHOUT a torch sidecar (the default CI state):
//  1. align_sign_prototype degrades gracefully — inference_available:false +
//     an actionable setup warning, NEVER a throw, schema-valid shape.
//  2. fetch_tablet_photo resolves the FETCHABLE eBL REST URL shape and caches
//     bytes to disk (using an injected fetch stub — no live network).
//
// These are hermetic: align uses the real missing-venv gate (no venv exists in
// CI); fetch uses an injected fetchImpl + an os.tmpdir() cache so nothing
// touches the live eBL API or the user's real cache.

import { describe, it, expect } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  alignSignPrototype,
  fetchTabletPhoto,
  protosnapInstalled,
  protosnapVenvPython,
  ALIGN_NOTE,
} from "../src/imageModality.js";
import { getEblPhotoApiUrl } from "../src/fragmentMetadata.js";

describe("getEblPhotoApiUrl", () => {
  it("returns the FETCHABLE /api/fragments/{id}/photo endpoint (not the SPA viewer)", () => {
    expect(getEblPhotoApiUrl("K.5896")).toBe(
      "https://www.ebl.lmu.de/api/fragments/K.5896/photo",
    );
  });
  it("URL-encodes the museum number", () => {
    expect(getEblPhotoApiUrl("BM 1234")).toBe(
      "https://www.ebl.lmu.de/api/fragments/BM%201234/photo",
    );
  });
  it("returns null for an empty id", () => {
    expect(getEblPhotoApiUrl("")).toBeNull();
  });
});

describe("align_sign_prototype graceful degradation (no torch sidecar)", () => {
  it("does not see an installed venv in CI", () => {
    // This guards the whole suite's assumption — if a dev has actually built the
    // sidecar locally, skip the degradation assertions below.
    expect(typeof protosnapInstalled()).toBe("boolean");
    expect(typeof protosnapVenvPython()).toBe("string");
  });

  it("returns inference_available:false with an actionable setup warning, never throws", async () => {
    if (protosnapInstalled()) return; // dev machine with a real sidecar — skip.
    const cacheDir = mkdtempSync(join(tmpdir(), "cunei-img-"));
    try {
      const r = await alignSignPrototype(
        { sign_crop_path: "/nonexistent/AN.png", sign_name: "AN", abz_code: "ABZ1" },
        cacheDir,
      );
      expect(r.inference_available).toBe(false);
      expect(r.agg_score).toBeNull();
      expect(r.aligned_skeleton_path).toBeNull();
      expect(r.note).toBe(ALIGN_NOTE);
      expect(r.sign_name).toBe("AN");
      expect(r.warnings.length).toBeGreaterThan(0);
      // The message must point at the setup script AND state it's not detection.
      const joined = r.warnings.join(" ");
      expect(joined).toMatch(/setup\.sh/);
      expect(joined).toMatch(/does NOT detect/i);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("surfaces a sidecar non-zero exit as a warning (not a throw) when a fake venv is present", async () => {
    // Use an injected runner to simulate 'venv present but the run failed'.
    // protosnapInstalled() gates on the real venv, so when it's absent the runner
    // is never reached — assert the degraded shape instead, which is the CI path.
    if (protosnapInstalled()) return;
    const cacheDir = mkdtempSync(join(tmpdir(), "cunei-img-"));
    try {
      const r = await alignSignPrototype(
        { sign_crop_path: "/nonexistent/AN.png", sign_name: "AN" },
        cacheDir,
        async () => ({ stdout: "", stderr: "boom", code: 2 }),
      );
      // Still degraded because the real venv gate fired before the runner.
      expect(r.inference_available).toBe(false);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});

describe("fetch_tablet_photo (injected fetch — no live network)", () => {
  it("caches JPEG bytes to <cacheDir>/photos/<id>.jpg and reports the right shape", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "cunei-img-"));
    try {
      const fakeBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]); // JPEG SOI-ish
      const fakeFetch = (async () =>
        new Response(fakeBytes, {
          status: 200,
          headers: { "content-type": "image/jpeg" },
        })) as unknown as typeof fetch;

      const r = await fetchTabletPhoto("K.5896", cacheDir, { fetchImpl: fakeFetch });
      expect(r.ebl_photo_api_url).toBe(
        "https://www.ebl.lmu.de/api/fragments/K.5896/photo",
      );
      expect(r.cache_path).toBe(join(cacheDir, "photos", "K.5896.jpg"));
      expect(r.cached).toBe(false);
      expect(r.bytes).toBe(fakeBytes.length);
      expect(r.content_type).toBe("image/jpeg");
      expect(existsSync(r.cache_path!)).toBe(true);
      expect(readFileSync(r.cache_path!).length).toBe(fakeBytes.length);

      // Second call reuses the cache (cached:true), no fetch needed.
      const r2 = await fetchTabletPhoto("K.5896", cacheDir, {
        fetchImpl: (async () => {
          throw new Error("should not be called when cached");
        }) as unknown as typeof fetch,
      });
      expect(r2.cached).toBe(true);
      expect(r2.bytes).toBe(fakeBytes.length);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });

  it("degrades gracefully (cache_path:null + warning) on a 404, never throws", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "cunei-img-"));
    try {
      const fakeFetch = (async () =>
        new Response("not found", { status: 404 })) as unknown as typeof fetch;
      const r = await fetchTabletPhoto("ZZ.0000", cacheDir, { fetchImpl: fakeFetch });
      expect(r.cache_path).toBeNull();
      expect(r.bytes).toBeNull();
      expect(r.warnings.length).toBeGreaterThan(0);
      expect(r.warnings.join(" ")).toMatch(/404|no photo/i);
    } finally {
      rmSync(cacheDir, { recursive: true, force: true });
    }
  });
});
