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
