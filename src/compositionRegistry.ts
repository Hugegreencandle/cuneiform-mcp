// v0.37.0 — Composition registry loaded from versioned JSON artifact.
//
// Previously a hardcoded TypeScript constant (v0.32). Per panel-review §3.24
// (Toussaint, Mertens), the registry is now a separately-citable artifact at
// data/compositions-v1.json with: registry_version, license, changelog, URIs,
// print_editions[], external_ids (eBL/OGSL/CAD). 5 → 11 compositions
// (added Maqlû, EAE, Šumma izbu, Šumma ālu, Bārûtu, Diri/Aa).

import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type CompositionType = "specific_composition" | "curriculum";

export type PrintEdition = {
  citation: string;
  title: string;
  series: string;
  publisher: string;
};

export type ExternalIds = {
  ebl_canonical_genre: string | null;
  ogsl: string | null;
  cad_lemma: string | null;
};

export type CompositionEntry = {
  id: string;
  name: string;
  name_akkadian: string;
  description: string;
  composition_type: CompositionType;
  exemplar_tablets: string[];
  paper_sections: string[];
  typical_genre: string | null;
  typical_period: string | null;
  parent_curriculum: string | null;
  print_editions: PrintEdition[];
  external_ids: ExternalIds;
  uri: string;
};

export type RegistryArtifact = {
  $schema?: string;
  registry_version: string;
  registry_uri: string;
  license: string;
  created: string;
  changelog: Array<{ version: string; date: string; note: string }>;
  compositions: CompositionEntry[];
};

// ─── Loader (cached) ──────────────────────────────────────────────────────

function dataDir(): string {
  if (process.env.CUNEIFORM_MCP_DATA_DIR) return process.env.CUNEIFORM_MCP_DATA_DIR;
  // Resolve relative to compiled module location: dist/compositionRegistry.js
  // → walk up to find data/ sibling
  const here = dirname(fileURLToPath(import.meta.url));
  // Try `<here>/../data` first (dist sibling), then `<here>/../../data` (src nested).
  const candidates = [join(here, "..", "data"), join(here, "..", "..", "data")];
  for (const c of candidates) {
    if (existsSync(join(c, "compositions-v1.json"))) return c;
  }
  return join(here, "..", "data");
}

let _artifact: RegistryArtifact | null = null;
let _loadError: string | null = null;

function loadArtifact(): RegistryArtifact {
  if (_artifact) return _artifact;
  if (_loadError) throw new Error(_loadError);
  const path = join(dataDir(), "compositions-v1.json");
  if (!existsSync(path)) {
    _loadError = `composition registry not found: ${path}`;
    throw new Error(_loadError);
  }
  try {
    const raw = readFileSync(path, "utf-8");
    _artifact = JSON.parse(raw) as RegistryArtifact;
    return _artifact;
  } catch (e) {
    _loadError = e instanceof Error ? e.message : String(e);
    throw new Error(`composition registry load failed: ${_loadError}`);
  }
}

// ─── Public API (backwards-compatible with v0.32 callers) ─────────────────

export const COMPOSITION_REGISTRY: CompositionEntry[] = loadArtifact().compositions;

export function getCompositionById(id: string): CompositionEntry | null {
  return COMPOSITION_REGISTRY.find((c) => c.id === id) ?? null;
}

export function listCompositions(): CompositionEntry[] {
  return COMPOSITION_REGISTRY.slice();
}

export function registryMetadata(): {
  registry_version: string;
  registry_uri: string;
  license: string;
  created: string;
  n_compositions: number;
} {
  const a = loadArtifact();
  return {
    registry_version: a.registry_version,
    registry_uri: a.registry_uri,
    license: a.license,
    created: a.created,
    n_compositions: a.compositions.length,
  };
}
