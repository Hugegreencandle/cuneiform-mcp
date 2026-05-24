// v0.32.0 — Composition registry for identify_composition.
//
// Hardcoded from methods-paper §§3.1, 3.4, 3.7.1, 3.7.2, 3.7.3, 3.9.1, 3.11.
// Each entry maps a named composition (Mīs pî, Šurpu, etc.) to a list of
// exemplar tablets known to be witnesses of it. Identification works by
// scoring a query tablet against each composition's exemplar pool on
// (a) chunk-overlap and (b) sign-vocabulary cosine.
//
// Curricula (e.g. āšipūtu / KAR-44) are tagged composition_type="curriculum" —
// a query tablet that scores high on BOTH a curriculum AND a specific
// composition within that curriculum is correctly classified as a member
// of the specific composition, copied within the curriculum's tradition.

export type CompositionType = "specific_composition" | "curriculum";

export type CompositionEntry = {
  id: string;
  name: string;
  description: string;
  composition_type: CompositionType;
  exemplar_tablets: string[];
  paper_sections: string[];
  typical_genre: string | null;
  typical_period: string | null;
  parent_curriculum: string | null;
};

export const COMPOSITION_REGISTRY: CompositionEntry[] = [
  {
    id: "mis_pi",
    name: "Mīs pî",
    description: "Mouth-washing ritual; canonical āšipūtu composition.",
    composition_type: "specific_composition",
    exemplar_tablets: [
      "K.5896",
      "K.9508",
      "BM.45749",
      "K.2987.B",
      "K.163",
      "K.2550",
      "K.6683",
    ],
    paper_sections: ["§3.7.3", "§3.11"],
    typical_genre: "magic / ritual",
    typical_period: "Neo-Assyrian",
    parent_curriculum: "asiputu_kar44",
  },
  {
    id: "surpu",
    name: "Šurpu",
    description: "Anti-witchcraft incantation series; commentary tradition (BM.47463 base / CBS.6060 commentary).",
    composition_type: "specific_composition",
    exemplar_tablets: ["BM.47463", "CBS.6060"],
    paper_sections: ["§3.7.1"],
    typical_genre: "magic / anti-witchcraft",
    typical_period: "Neo-Assyrian",
    parent_curriculum: "asiputu_kar44",
  },
  {
    id: "udug_hul",
    name: "Udug-ḫul",
    description: "Anti-demon incantation series.",
    composition_type: "specific_composition",
    exemplar_tablets: ["Sm.1055", "K.7246"],
    paper_sections: ["§3.7.2"],
    typical_genre: "magic / anti-demon",
    typical_period: "Neo-Assyrian",
    parent_curriculum: "asiputu_kar44",
  },
  {
    id: "bit_sala_me",
    name: "Bīt salāʾ mê",
    description: "Mouth-purification ritual; āšipūtu canon. K.2761 surfaced via v0.18.3 cross-method validation.",
    composition_type: "specific_composition",
    exemplar_tablets: ["K.2761"],
    paper_sections: ["§3.4"],
    typical_genre: "magic / ritual",
    typical_period: "Neo-Assyrian",
    parent_curriculum: "asiputu_kar44",
  },
  {
    id: "asiputu_kar44",
    name: "āšipūtu (KAR-44 curriculum)",
    description: "Cross-composition exorcist curriculum (Mīs pî + Bīt salāʾ mê + Udug-ḫul + Šuʾila + Namburbi + ...). Recovered empirically from BM.77056 cluster.",
    composition_type: "curriculum",
    exemplar_tablets: ["BM.77056", "BM.45749", "K.5896", "Sm.1055", "BM.74130"],
    paper_sections: ["§3.1", "§3.9.1"],
    typical_genre: "magic / ritual",
    typical_period: "Neo-Assyrian",
    parent_curriculum: null,
  },
];

export function getCompositionById(id: string): CompositionEntry | null {
  return COMPOSITION_REGISTRY.find((c) => c.id === id) ?? null;
}

export function listCompositions(): CompositionEntry[] {
  return COMPOSITION_REGISTRY.slice();
}
