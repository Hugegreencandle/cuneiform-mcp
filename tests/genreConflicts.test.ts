// v0.73.0 — Genre-Conflict Sentinel tests.
//
// Pure family-extractor unit tests (hermetic) + a live-cache integration test
// that pins the flagship anchor: medical "Teeth" tablets K.2290 / K.2419 must
// surface as magic-in-medicine, chunk-corroborated against Mīs pî exemplar K.163.

import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { compositionFamily, eblGenreFamily, classifyConflict, surfaceGenreConflicts } from "../src/genreConflicts.js";

describe("compositionFamily", () => {
  it("takes the token before '/' in typical_genre", () => {
    expect(compositionFamily("magic / ritual")).toBe("magic");
    expect(compositionFamily("divination / astrology")).toBe("divination");
    expect(compositionFamily("lexical")).toBe("lexical");
  });
  it("returns null for missing genre", () => {
    expect(compositionFamily(null)).toBeNull();
    expect(compositionFamily(undefined)).toBeNull();
    expect(compositionFamily("")).toBeNull();
  });
});

describe("eblGenreFamily", () => {
  it("resolves the eBL primary_genre path to a coarse family", () => {
    expect(eblGenreFamily("CANONICAL → Magic → Purification → Mīs pî")).toBe("magic");
    expect(eblGenreFamily("CANONICAL → Divination → Teratological → Šumma izbu")).toBe("divination");
    expect(eblGenreFamily("CANONICAL → Literature → Hymns → Divine → Šuʾila")).toBe("literature");
    expect(eblGenreFamily("CANONICAL → Lexical")).toBe("lexical");
  });
  it("prioritizes Medicine over Magic so nested Technical→Medicine resolves to medicine", () => {
    // The trap: a Medicine path must NOT be read as magic just because the
    // string later contains magic-adjacent words.
    expect(eblGenreFamily("CANONICAL → Technical → Medicine → Therapeutic → Nineveh Medical Compendium → VI Teeth")).toBe(
      "medicine",
    );
  });
  it("returns null for uncategorized / generic", () => {
    expect(eblGenreFamily("CANONICAL")).toBeNull();
    expect(eblGenreFamily("CANONICAL → Catalogues")).toBeNull();
    expect(eblGenreFamily(null)).toBeNull();
  });
  it("treats eBL Medical/Therapeutic leaves as the medicine family", () => {
    expect(eblGenreFamily("CANONICAL → Technical → Medicine → Therapeutic")).toBe("medicine");
    expect(eblGenreFamily("CANONICAL → Medical")).toBe("medicine");
  });
});

describe("classifyConflict", () => {
  it("formulaic when the rarest shared window is a hub (or absent)", () => {
    expect(classifyConflict(101, 0.01, 5, 0.4)).toBe("formulaic"); // the K.2290 boilerplate case
    expect(classifyConflict(6, 0.1, 5, 0.4)).toBe("formulaic");
    expect(classifyConflict(null, 0.5, 5, 0.4)).toBe("formulaic");
  });
  it("embedded_quotation_candidate: rare window, localized (low fraction)", () => {
    expect(classifyConflict(3, 0.12, 5, 0.4)).toBe("embedded_quotation_candidate"); // the K.2433 case
  });
  it("likely_misassignment: rare window but it dominates the tablet (high fraction)", () => {
    expect(classifyConflict(2, 0.53, 5, 0.4)).toBe("likely_misassignment"); // the K.5078 case
  });
});

// ── Live-cache integration (gated) ──────────────────────────────────────────
const HAS_CACHE =
  existsSync(join(homedir(), ".cache", "cuneiform-mcp", "composition-assignments.json")) &&
  existsSync(join(homedir(), ".cache", "cuneiform-mcp", "chunk-index.json"));

describe.skipIf(!HAS_CACHE)("surfaceGenreConflicts — live corpus", () => {
  it("finds the family-disagreements but DOWNGRADES the K.2290/K.2419 boilerplate case to formulaic", () => {
    const r = surfaceGenreConflicts(); // defaults
    expect(r.stats.corroborated).toBe(r.conflicts.length);
    // Reproduced live: 76 cross-family hits (was the headline count). Floor generously.
    expect(r.stats.corroborated).toBeGreaterThanOrEqual(50);
    // The medical-Teeth tablets are FOUND, but their only shared window with K.163 is
    // hosted by ~101 tablets (pan-corpus boilerplate) → must classify as formulaic,
    // NOT be advertised as a validated quotation.
    for (const t of ["K.2290", "K.2419"]) {
      const hit = r.conflicts.find((c) => c.tablet_id === t);
      expect(hit, `${t} should still be found`).toBeDefined();
      expect(hit!.composition_id).toBe("mis_pi");
      expect(hit!.ebl_family).toBe("medicine");
      expect(hit!.signal).toBe("formulaic");
      expect(hit!.rarest_window_host_count).toBeGreaterThan(5);
    }
  });

  it("isolates the genuine embedded-quotation candidate (K.2433) via discrimination, not the boilerplate", () => {
    const r = surfaceGenreConflicts();
    const k2433 = r.conflicts.find((c) => c.tablet_id === "K.2433");
    expect(k2433, "K.2433 should surface").toBeDefined();
    expect(k2433!.signal).toBe("embedded_quotation_candidate");
    expect(k2433!.rarest_window_host_count).toBeLessThanOrEqual(5);
    expect(k2433!.overlap_fraction).toBeLessThan(0.4); // localized, not dominating
    // Embedded candidates rank ahead of formulaic hits.
    const firstFormulaic = r.conflicts.findIndex((c) => c.signal === "formulaic");
    const k2433Idx = r.conflicts.findIndex((c) => c.tablet_id === "K.2433");
    expect(k2433Idx).toBeLessThan(firstFormulaic);
  });

  it("max_window_host_count=5 keeps only discriminating hits and drops the boilerplate flagship", () => {
    const disc = surfaceGenreConflicts({ maxWindowHostCount: 5 });
    expect(disc.conflicts.every((c) => c.rarest_window_host_count <= 5)).toBe(true);
    expect(disc.conflicts.find((c) => c.tablet_id === "K.2290")).toBeUndefined();
    expect(disc.stats.corroborated).toBeLessThan(surfaceGenreConflicts().stats.corroborated);
  });

  it("excludes registry exemplars (K.2550 is not surfaced as a 'catalog-invisible' conflict)", () => {
    const r = surfaceGenreConflicts();
    expect(r.conflicts.find((c) => c.tablet_id === "K.2550")).toBeUndefined();
    expect(r.stats.exemplars_excluded).toBeGreaterThanOrEqual(1);
  });

  it("compositionId filter restricts to that composition only", () => {
    const r = surfaceGenreConflicts({ compositionId: "mis_pi" });
    expect(r.conflicts.every((c) => c.composition_id === "mis_pi")).toBe(true);
  });
});
