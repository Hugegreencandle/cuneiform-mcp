// v0.42.0 — find_sign_glyph: ABZ → Unicode cuneiform glyph lookup.
//
// Panel-review Tier-3 idea #11: convert ABZ codes (e.g. ABZ480) to Unicode
// cuneiform glyphs (e.g. 𒈦). Pure data-loading, no novel methodology.
//
// Data source: ~/.cache/cuneiform-mcp/abz-glyph-map.json, populated by
// scripts/build-abz-glyph-map.mjs. The build script joins OGSL labasi-signs
// (ABZ→name mapping) with eBL /signs/{NAME} (name→Unicode codepoints) into
// a flat {abz_code: {sign_name, codepoints, glyph}} cache.
//
// Cache structure:
//   {
//     "version": "1.0.0",
//     "built_at": "2026-05-25T...",
//     "source": "OGSL Labasi ∩ eBL /signs",
//     "entries": {
//       "ABZ001": { sign_name: "AŠ",   codepoints: [73784], glyph: "𒀸" },
//       "ABZ480": { sign_name: "1",    codepoints: [73934], glyph: "𒋮" },
//       ...
//     }
//   }
//
// If the cache is missing, the tool returns a populated-with-nulls result
// + a warning telling the caller how to build it.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const GLYPH_MAP_FILE = "abz-glyph-map.json";
const DAMAGE_TOKENS = new Set(["X", "x", "?"]);

export type GlyphEntry = {
  sign_name: string;
  codepoints: number[];
  glyph: string;
};

export type GlyphMap = {
  version: string;
  built_at: string;
  source: string;
  entries: Record<string, GlyphEntry>;
};

export type TokenGlyph = {
  token: string;
  is_damage: boolean;
  abz_code: string | null;
  sign_name: string | null;
  glyph: string | null;
  codepoints: number[] | null;
};

export type FindSignGlyphResult = {
  query: {
    n_tokens: number;
    n_resolved: number;
    n_damage: number;
    n_unresolved: number;
  };
  tokens: TokenGlyph[];
  rendered_glyph_string: string;
  glyph_map_stats: {
    cache_loaded: boolean;
    cache_version: string | null;
    cache_built_at: string | null;
    n_entries_in_cache: number;
  };
  warnings: string[];
};

export type FindSignGlyphOptions = {
  signs?: string;
  abz_codes?: string[];
  include_damage_placeholder?: boolean;
  damage_glyph?: string;
};

// ─── Cache loader (lazy, sync) ─────────────────────────────────────────────

function cacheDir(): string {
  return process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
}

function cachePath(): string {
  return join(cacheDir(), GLYPH_MAP_FILE);
}

let _glyphMap: GlyphMap | null = null;
let _loadAttempted = false;
let _loadError: string | null = null;

export function loadGlyphMap(): GlyphMap | null {
  if (_glyphMap) return _glyphMap;
  if (_loadAttempted) return null;
  _loadAttempted = true;
  const path = cachePath();
  if (!existsSync(path)) {
    _loadError = `glyph map not built: ${path} missing — run scripts/build-abz-glyph-map.mjs`;
    return null;
  }
  try {
    const raw = readFileSync(path, "utf-8");
    const parsed = JSON.parse(raw) as GlyphMap;
    if (typeof parsed.entries !== "object" || parsed.entries === null) {
      _loadError = "glyph map: entries field invalid";
      return null;
    }
    _glyphMap = parsed;
    return parsed;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    return null;
  }
}

export function getGlyphLoadError(): string | null {
  return _loadError;
}

export function _resetForTests(): void {
  _glyphMap = null;
  _loadAttempted = false;
  _loadError = null;
  _glyphToAbz = null;
  _nameToAbz = null;
  _reverseIndexBuiltFor = null;
}

// ─── Token classification + lookup ─────────────────────────────────────────

function normalizeToAbzCode(token: string): string | null {
  // eBL transliterations use ABZ-prefixed tokens (ABZ480, ABZ075, etc.) plus
  // variants like ABZ331e+152i (composite signs). For the simple lookup, only
  // bare ABZ codes are resolved; composites return null.
  const m = /^ABZ(\d+)$/.exec(token);
  if (!m) return null;
  // Normalize to 3-digit padded form to match build script's canonicalization.
  const num = parseInt(m[1], 10);
  return `ABZ${String(num).padStart(3, "0")}`;
}

export function lookupGlyphForToken(token: string, map: GlyphMap | null): TokenGlyph {
  if (DAMAGE_TOKENS.has(token)) {
    return {
      token,
      is_damage: true,
      abz_code: null,
      sign_name: null,
      glyph: null,
      codepoints: null,
    };
  }
  if (!map) {
    return {
      token,
      is_damage: false,
      abz_code: normalizeToAbzCode(token),
      sign_name: null,
      glyph: null,
      codepoints: null,
    };
  }
  const abz = normalizeToAbzCode(token);
  if (!abz) {
    return {
      token,
      is_damage: false,
      abz_code: null,
      sign_name: null,
      glyph: null,
      codepoints: null,
    };
  }
  const entry = map.entries[abz];
  if (!entry) {
    return {
      token,
      is_damage: false,
      abz_code: abz,
      sign_name: null,
      glyph: null,
      codepoints: null,
    };
  }
  return {
    token,
    is_damage: false,
    abz_code: abz,
    sign_name: entry.sign_name,
    glyph: entry.glyph,
    codepoints: entry.codepoints,
  };
}

// ─── v0.58 — Defensive multi-format sign-token decoder ────────────────────
//
// Ported from wallet-fingerprint/src/tokenize.mjs `decodeCurrencyHex`:
// XRPL currency codes arrive in 4 forms (LP-prefix / ASCII / non-printable
// hex / unknown) and the decoder falls through cases preserving provenance
// without ever throwing. Cuneiform sign tokens have the same polymorphism:
// numeric `ABZ123`, raw Unicode glyph `𒀀`, damaged placeholder `x/X/?`,
// and ASCII sign names like `AN` or `DINGIR`.
//
// Contract:
//  - Falls through cases in order; first match wins.
//  - NEVER throws — returns form="unknown" + resolved=false on bad input.
//  - Preserves the input verbatim in `raw`.
//  - Reuses loadGlyphMap() + normalizeToAbzCode() + DAMAGE_TOKENS above.

export type SignTokenForm =
  | "abz_numeric"
  | "unicode_glyph"
  | "damaged_placeholder"
  | "ascii_name"
  | "unknown";

export interface DecodedSign {
  form: SignTokenForm;
  canonical: string; // canonical ABZ id if resolvable, else original
  raw: string; // input as-given
  resolved: boolean; // true if a canonical form was found
}

// Lazy reverse indexes built once from the loaded GlyphMap.
let _glyphToAbz: Map<string, string> | null = null;
let _nameToAbz: Map<string, string> | null = null;
let _reverseIndexBuiltFor: GlyphMap | null = null;

function buildReverseIndexes(map: GlyphMap): void {
  if (_reverseIndexBuiltFor === map) return;
  const glyphIdx = new Map<string, string>();
  const nameIdx = new Map<string, string>();
  for (const [abz, entry] of Object.entries(map.entries)) {
    if (entry.glyph) glyphIdx.set(entry.glyph, abz);
    if (entry.sign_name) {
      // Canonical name + uppercase variant — sign names are conventionally
      // uppercase (AN, DINGIR) but eBL data occasionally carries Akkadian-
      // style mixed case (Aleph). Index both for tolerant lookup.
      nameIdx.set(entry.sign_name, abz);
      nameIdx.set(entry.sign_name.toUpperCase(), abz);
    }
  }
  _glyphToAbz = glyphIdx;
  _nameToAbz = nameIdx;
  _reverseIndexBuiltFor = map;
}

function isCuneiformGlyph(token: string): boolean {
  // Unicode Cuneiform block: U+12000–U+123FF (signs), U+12400–U+1247F (numerics
  // and punctuation). A single glyph or short cluster of cuneiform codepoints
  // qualifies — we don't try to split multi-glyph strings here, just detect
  // that the token is in the cuneiform script.
  if (!token) return false;
  for (const ch of token) {
    const cp = ch.codePointAt(0);
    if (cp === undefined) return false;
    if (cp < 0x12000 || cp > 0x1247f) return false;
  }
  return true;
}

function isAsciiSignNameShape(token: string): boolean {
  // Sign names are ASCII letters / digits / hyphens / dots / subscript digits.
  // We treat anything matching this shape as a candidate for the name index;
  // failed lookup falls through to "unknown".
  return /^[A-Za-z][A-Za-z0-9._-]*$/.test(token);
}

export function decodeSignToken(token: string): DecodedSign {
  const raw = typeof token === "string" ? token : "";
  if (!raw) {
    return { form: "unknown", canonical: raw, raw, resolved: false };
  }

  // 1) Damaged placeholder — cheap, no cache needed.
  if (DAMAGE_TOKENS.has(raw)) {
    return { form: "damaged_placeholder", canonical: raw, raw, resolved: true };
  }

  // 2) ABZ numeric — reuse the existing normalizer for canonicalization.
  const abz = normalizeToAbzCode(raw);
  if (abz) {
    const map = loadGlyphMap();
    const resolved = map !== null && Object.prototype.hasOwnProperty.call(map.entries, abz);
    return { form: "abz_numeric", canonical: abz, raw, resolved };
  }

  // 3) Unicode cuneiform glyph — reverse-lookup via cache if loaded.
  if (isCuneiformGlyph(raw)) {
    const map = loadGlyphMap();
    if (map) {
      buildReverseIndexes(map);
      const hit = _glyphToAbz?.get(raw);
      if (hit) {
        return { form: "unicode_glyph", canonical: hit, raw, resolved: true };
      }
    }
    // Glyph shape recognized but no cache hit — preserve raw, not resolved.
    return { form: "unicode_glyph", canonical: raw, raw, resolved: false };
  }

  // 4) ASCII sign name — reverse-lookup via name index.
  if (isAsciiSignNameShape(raw)) {
    const map = loadGlyphMap();
    if (map) {
      buildReverseIndexes(map);
      const hit = _nameToAbz?.get(raw) ?? _nameToAbz?.get(raw.toUpperCase());
      if (hit) {
        return { form: "ascii_name", canonical: hit, raw, resolved: true };
      }
    }
    // Shape looked like a name but no entry matched — keep form=ascii_name
    // unresolved so callers can distinguish from genuinely unknown garbage.
    return { form: "ascii_name", canonical: raw, raw, resolved: false };
  }

  // 5) Fall-through: anything else (composite ABZ codes like ABZ331e+152i,
  // mixed-script junk, empty-ish strings) → preserve raw, mark unresolved.
  return { form: "unknown", canonical: raw, raw, resolved: false };
}

// ─── Public entry point ────────────────────────────────────────────────────

export function findSignGlyph(opts: FindSignGlyphOptions): FindSignGlyphResult {
  const warnings: string[] = [];
  const damageGlyph = opts.damage_glyph ?? "·";
  const includeDamage = opts.include_damage_placeholder ?? true;

  const map = loadGlyphMap();
  if (!map) {
    const err = getGlyphLoadError();
    if (err) warnings.push(err);
  }

  // Resolve input.
  let tokens: string[] = [];
  if (opts.signs) {
    tokens = opts.signs.split(/\s+/).filter(Boolean);
  } else if (opts.abz_codes && opts.abz_codes.length > 0) {
    tokens = opts.abz_codes;
  } else {
    warnings.push("either signs or abz_codes must be provided");
  }

  const results: TokenGlyph[] = tokens.map((t) => lookupGlyphForToken(t, map));
  const nDamage = results.filter((r) => r.is_damage).length;
  const nResolved = results.filter((r) => r.glyph !== null).length;
  const nUnresolved = results.length - nDamage - nResolved;

  // Build rendered string: glyph if resolved, damage placeholder if damaged,
  // and bracketed token if unresolved.
  const renderParts: string[] = [];
  for (const r of results) {
    if (r.is_damage) {
      if (includeDamage) renderParts.push(damageGlyph);
    } else if (r.glyph) {
      renderParts.push(r.glyph);
    } else {
      renderParts.push(`[${r.token}]`);
    }
  }

  return {
    query: {
      n_tokens: tokens.length,
      n_resolved: nResolved,
      n_damage: nDamage,
      n_unresolved: nUnresolved,
    },
    tokens: results,
    rendered_glyph_string: renderParts.join(" "),
    glyph_map_stats: {
      cache_loaded: map !== null,
      cache_version: map?.version ?? null,
      cache_built_at: map?.built_at ?? null,
      n_entries_in_cache: map ? Object.keys(map.entries).length : 0,
    },
    warnings,
  };
}
