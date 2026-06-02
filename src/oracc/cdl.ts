// src/oracc/cdl.ts — ORACC CDL/XCL corpusjson parser.
//
// STATUS: DORMANT but committed and fully unit-tested. The canonical Oracc
// opendata JSON layer (/<proj>/corpus.json, json.zip, per-text corpusjson)
// returns 200 + 0 bytes (or a text/html pager-error page) upstream as of
// 2026-06-02 — re-probe before relying on it. This parser is invoked ONLY
// when corpusJsonFastPath (src/oracc/opendata.ts) reports the project's
// corpus.json returned real bytes, so the fast-path lights up cleanly the
// moment UPenn restores opendata, with zero further code change.
//
// The shape of a corpusjson document (per Oracc's opendata docs) is:
//   { "type":"cdl", "textid":"P######", "cdl":[ <root chunk> ] }
// where cdl[0] is the root "c" (chunk) node. We depth-first walk it:
//   node "c"  = chunk        -> recurse into its own .cdl[]
//   node "d"  = discontinuity:
//                 type "line-start"  carries n (line number) + label
//                                    -> emit a new logical line
//                 type "surface"     subtype obverse/reverse/... -> track surface
//                 type "damage"/"object"/... -> noted, no token emitted
//   node "l"  = lemma        -> a token {frag, cf, sense, pos, lang}
//                 grouped under the currently-open line-start.
//
// CDL carries NO translation (translations live in a separate
// gloss-translation layer that opendata does not bundle per-text the same
// way), so translation[] is ALWAYS [] here. That is documented behaviour,
// not a bug — callers wanting translation must use the TEI channel.

/** One token within a CDL line — either a lemma or a non-word marker. */
export type CdlToken = {
  /**
   * "lemma"  — a lemmatized word (node "l"), carries cf/sense/pos.
   * "marker" — a frag-bearing discontinuity (node "d", type "nonw" and any
   *            other d-type carrying a frag): line dividers ("/"), scribal
   *            deletions ("<<KI>>", "<<URU>>"), erasure/traces markup
   *            ("($erased signs$)", "($traces$)"). Preserved so the CDL channel
   *            matches the TEI channel, which renders these inline.
   */
  kind: "lemma" | "marker";
  /** Surface transliteration fragment, e.g. "lugal", "e2-gal", "/", "<<KI>>". */
  frag: string;
  /** Citation form (dictionary headword), e.g. "lugal". null for markers. */
  cf: string | null;
  /** Gloss / sense, preferring f.sense then f.gw. null for markers. */
  sense: string | null;
  /** Part of speech, e.g. "N", "V". null for markers. */
  pos: string | null;
  /** Language tag, e.g. "sux" (Sumerian), "akk" (Akkadian). */
  lang: string | null;
  /** For markers: the originating d-node type (e.g. "nonw"). undefined for lemmas. */
  markerType?: string;
};

/** One logical line emitted by a CDL line-start, with its grouped tokens. */
export type CdlLine = {
  /** Line number from the line-start node's `n` field, e.g. "1". */
  n: string;
  /** Full line label, e.g. "o 1", "r 12'". Falls back to n when absent. */
  label: string;
  /** Surface this line sits on: "obverse" | "reverse" | other subtype | null. */
  surface: string | null;
  /** Lemmatized tokens in reading order. */
  tokens: CdlToken[];
};

/**
 * Parsed CDL edition. Output shape intentionally mirrors the rendered side
 * of ParsedTei (transliteration[] / translation[]) so oracc_get_edition can
 * present TEI and CDL editions through the same envelope.
 */
export type ParsedCdl = {
  textId: string | null;
  /** Structured lines (richer than the flat string transliteration[]). */
  lines: CdlLine[];
  /** Rendered transliteration: one string per line, "<label>  frag frag …". */
  transliteration: string[];
  /** Always [] — CDL has no translation layer. */
  translation: string[];
};

/**
 * One grapheme element inside an l-node's f.gdl[] array (the OGSL graphemic
 * decomposition layer). Each element names ONE sign-instance in reading order.
 *
 * Verified against ccpo corpusjson (2026-06-02): every l-node carries f.gdl[];
 * each element has { v (reading e.g. "ma"), gdl_sign (the OGSL SIGN NAME, e.g.
 * "MA"/"AN"/"GIŠ"/"|SAL.TUG₂|", or "X" for damage), oid (Oracc sign id e.g.
 * "o0000601"), break ("missing"/"damaged"), breakStart, delim }.
 */
export type GdlGrapheme = {
  /** Reading value, e.g. "ma", "x". Informational only. */
  v?: string;
  /** OGSL sign NAME (the bridge to ABZ), e.g. "MA", "AN", "|SAL.TUG₂|", "X". */
  gdl_sign?: string;
  /** Oracc sign id, e.g. "o0000601". Optional normalizer key. */
  oid?: string;
  /** "missing" | "damaged" when the grapheme sits under a break, else absent. */
  break?: string;
};

type CdlNode = {
  node?: string;
  type?: string;
  subtype?: string;
  n?: string;
  label?: string;
  frag?: string;
  f?: {
    lang?: string;
    cf?: string;
    sense?: string;
    gw?: string;
    pos?: string;
    gdl?: GdlGrapheme[];
  };
  cdl?: CdlNode[];
};

const SURFACE_SUBTYPES = new Set([
  "obverse",
  "reverse",
  "top",
  "bottom",
  "left",
  "right",
  "edge",
  "surface",
]);

/**
 * Parse an ORACC corpusjson document into a ParsedCdl. Pure function — no
 * I/O, no throws on well-formed-but-empty input (returns empty lines[]).
 *
 * @param corpusjson the parsed JSON object (NOT a string) of one text's
 *   corpusjson, i.e. { type:"cdl", textid, cdl:[root] }.
 */
export function parseCdl(corpusjson: unknown): ParsedCdl {
  const doc = (corpusjson ?? {}) as { textid?: string; cdl?: CdlNode[] };
  const textId = typeof doc.textid === "string" ? doc.textid : null;
  const lines: CdlLine[] = [];

  // Walk state carried through the depth-first traversal.
  const state = { surface: null as string | null, current: null as CdlLine | null };

  const walk = (nodes: CdlNode[] | undefined): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const kind = node.node;
      if (kind === "c") {
        // Chunk — recurse. Surface/line state intentionally persists across
        // the recursion so a phrase chunk's lemmas attach to the open line.
        walk(node.cdl);
      } else if (kind === "d") {
        const t = node.type;
        if (t === "line-start") {
          const n = typeof node.n === "string" ? node.n : "";
          const label = typeof node.label === "string" && node.label.length > 0 ? node.label : n;
          const line: CdlLine = { n, label, surface: state.surface, tokens: [] };
          lines.push(line);
          state.current = line;
        } else if (t === "surface" || (node.subtype && SURFACE_SUBTYPES.has(node.subtype))) {
          state.surface = typeof node.subtype === "string" ? node.subtype : null;
        } else if (typeof node.frag === "string" && node.frag.length > 0) {
          // FRAG-BEARING discontinuity (type "nonw" + any other d-type carrying
          // a frag): line dividers "/", scribal deletions "<<KI>>"/"<<URU>>",
          // erasure/traces "($erased signs$)"/"($traces$)". Previously these
          // were silently DROPPED, losing ~8% of RINAP1 texts' divider/deletion
          // markup. Emit them as non-lemma marker tokens so the CDL channel
          // preserves what the TEI channel renders inline.
          const marker: CdlToken = {
            kind: "marker",
            frag: node.frag,
            cf: null,
            sense: null,
            pos: null,
            lang: typeof node.f?.lang === "string" ? node.f.lang : null,
            markerType: typeof t === "string" ? t : "d",
          };
          if (state.current) {
            state.current.tokens.push(marker);
          } else {
            const orphan: CdlLine = { n: "", label: "", surface: state.surface, tokens: [marker] };
            lines.push(orphan);
            state.current = orphan;
          }
        }
        // type "damage", "object", "nonx" (no frag), etc. — noted, emit nothing.
      } else if (kind === "l") {
        const f = node.f ?? {};
        const token: CdlToken = {
          kind: "lemma",
          frag: typeof node.frag === "string" ? node.frag : "",
          cf: typeof f.cf === "string" ? f.cf : null,
          sense:
            typeof f.sense === "string" && f.sense.length > 0
              ? f.sense
              : typeof f.gw === "string" && f.gw.length > 0
                ? f.gw
                : null,
          pos: typeof f.pos === "string" ? f.pos : null,
          lang: typeof f.lang === "string" ? f.lang : null,
        };
        if (state.current) {
          state.current.tokens.push(token);
        } else {
          // Lemma before any line-start — synthesize an unlabeled line so no
          // token is silently dropped.
          const orphan: CdlLine = { n: "", label: "", surface: state.surface, tokens: [token] };
          lines.push(orphan);
          state.current = orphan;
        }
      }
      // Unknown node kinds are ignored.
    }
  };

  walk(doc.cdl);

  const transliteration = lines.map((ln) => {
    const frags = ln.tokens.map((t) => t.frag).filter((x) => x.length > 0);
    const lbl = (ln.label || ln.n || "").padStart(4, " ");
    return `${lbl}  ${frags.join(" ")}`;
  });

  return { textId, lines, transliteration, translation: [] };
}

// ───────────────────────────────────────────────────────────────────────────
// gdl → ABZ channel (the ccpo → eBL all-signs bridge).
//
// ccpo editions are Oracc CDL with TRANSLITERATION, not ABZ sign-list codes.
// But every l-node carries f.gdl[] — the OGSL graphemic decomposition — where
// each element's gdl_sign is the OGSL SIGN NAME. Mapping that name → eBL ABZ
// number and emitting the eBL all-signs format (ABZ codes space-separated, one
// line per newline, "X" for damage) turns a ccpo edition into a first-class
// member of the chunk-hash corpus, with ZERO change to the existing lemma
// CdlToken/CdlLine path above.
//
// The map is OGSL-name → ABZ; build it offline (eBL numbering) via
// scripts/build-ccpo-abz-map.mjs. See data/ccpo-abz-map.json for provenance.
// ───────────────────────────────────────────────────────────────────────────

/** A grapheme converted to its eBL all-signs token, with how it resolved. */
export type AbzGraphemeResolution =
  | { kind: "damage"; token: "X" }
  | { kind: "direct"; token: string; name: string }
  | { kind: "normalized"; token: string; name: string; base: string }
  | { kind: "numeral"; token: string; name: string }
  | { kind: "compound-whole"; token: string; name: string }
  | { kind: "compound-decomposed"; token: string; name: string; parts: string[] }
  | { kind: "unmapped"; token: "X"; name: string };

/** Per-edition conversion stats — coverage telemetry for the build script. */
export type CdlAbzStats = {
  totalGraphemes: number;
  damage: number;
  direct: number;
  normalized: number;
  numeral: number;
  compoundWhole: number;
  compoundDecomposed: number;
  unmapped: number;
  /** name → count of non-damage graphemes that fell through to "X". */
  unmappedNames: Record<string, number>;
};

const emptyStats = (): CdlAbzStats => ({
  totalGraphemes: 0,
  damage: 0,
  direct: 0,
  normalized: 0,
  numeral: 0,
  compoundWhole: 0,
  compoundDecomposed: 0,
  unmapped: 0,
  unmappedNames: {},
});

/**
 * Strip graphic-variant / phonetic-determinative @-suffixes (e.g. "@g", "@t",
 * "@s", "@z", "@90", and chained "@g@g") so a graphic variant can fall back to
 * its base sign-name in the map. Recovers e.g. KALAM@g → KALAM, DUN₃@g@g →
 * DUN₃, NU₁₁@90 → NU₁₁. Compounds keep their delimiters; only the @-runs go.
 */
export function stripGraphicVariant(name: string): string {
  return name.replace(/@[A-Za-z0-9]+/g, "");
}

const NUMERAL_RE = /^(\d+)\([^)]+\)$/;
const COMPOUND_DELIM_RE = /[.&×%+]/;

/**
 * Resolve ONE gdl_sign (OGSL sign name) to an eBL all-signs token.
 *
 * Priority, per the converter spec:
 *   1. "X"               → damage token "X".
 *   2. numeral "N(SIGN)" → bare integer "N" (matches eBL's bare-int numerals).
 *   3. direct map hit    → the ABZ code.
 *   4. @-stripped hit    → the ABZ code of the base name.
 *   5. compound whole    → its single canonical ABZ if the whole name is mapped.
 *   6. compound decompose→ ABZ sequence of constituents (split on . & × % +);
 *                          any unmapped constituent emits "X" (never dropped).
 *   7. otherwise         → "X" (preserve line/sign alignment; never drop).
 *
 * @param gdlSign the raw OGSL sign name from f.gdl[].gdl_sign.
 * @param nameToAbz OGSL-name → eBL-ABZ-code map (eBL numbering, NOT ABZL).
 */
export function resolveGdlSignToAbz(
  gdlSign: string,
  nameToAbz: Map<string, string>,
): AbzGraphemeResolution {
  const name = gdlSign;

  // 1. Damage.
  if (name === "X" || name === "x") return { kind: "damage", token: "X" };

  // 2. Numeral notation "N(UNIT)" → bare integer (eBL all-signs encodes
  //    numerals as bare integers, e.g. "14", alongside ABZ codes).
  const num = NUMERAL_RE.exec(name);
  if (num) return { kind: "numeral", token: num[1], name };

  // 3. Direct hit.
  const direct = nameToAbz.get(name);
  if (direct) return { kind: "direct", token: direct, name };

  // 4. @-variant strip then retry the base name.
  const base = stripGraphicVariant(name);
  if (base !== name) {
    const hit = nameToAbz.get(base);
    if (hit) return { kind: "normalized", token: hit, name, base };
  }

  // 5/6. Compound: try the whole compound first, then decompose.
  if (name.includes("|") || COMPOUND_DELIM_RE.test(name)) {
    // 5. Whole-compound canonical ABZ (e.g. |SAL.TUG₂| = ABZ556).
    const whole = nameToAbz.get(name) ?? (base !== name ? nameToAbz.get(base) : undefined);
    if (whole) return { kind: "compound-whole", token: whole, name };

    // 6. Decompose on inner delimiters . & × % +.
    const inner = name.replace(/^\|/, "").replace(/\|$/, "");
    const constituents = inner
      .split(COMPOUND_DELIM_RE)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (constituents.length > 1) {
      const parts = constituents.map((c) => {
        if (c === "X" || c === "x") return "X";
        const hit = nameToAbz.get(c);
        if (hit) return hit;
        const cb = stripGraphicVariant(c);
        if (cb !== c) {
          const hb = nameToAbz.get(cb);
          if (hb) return hb;
        }
        const cn = NUMERAL_RE.exec(c);
        if (cn) return cn[1];
        return "X"; // unmapped constituent → X, never dropped
      });
      // A decomposition is "useful" only if at least one constituent resolved.
      if (parts.some((p) => p !== "X")) {
        return { kind: "compound-decomposed", token: parts.join(" "), name, parts };
      }
    }
  }

  // 7. Residual — emit X to preserve line/sign alignment for the chunk index.
  return { kind: "unmapped", token: "X", name };
}

/** Result of converting a whole ccpo edition into eBL all-signs format. */
export type CdlAbzResult = {
  textId: string | null;
  /**
   * eBL all-signs "signs" string: space-separated ABZ tokens per line, one
   * line per newline, "X" for damage/unmapped. Exactly the format consumed by
   * scripts/build-chunk-index.mjs (tabletToTrigrams) and all-signs-full.json.
   */
  signs: string;
  stats: CdlAbzStats;
};

/**
 * Convert a ccpo (Oracc CDL) corpusjson document into eBL all-signs format by
 * walking every l-node's f.gdl[] in line-start groups.
 *
 * One CDL line-start → one newline-separated line in the output; the graphemes
 * of every l-node grouped under that line are emitted left-to-right, ABZ codes
 * space-separated, "X" for damage/unmapped. Lemmas appearing before any
 * line-start are attached to a synthesized leading line (mirrors parseCdl's
 * orphan handling) so no grapheme is dropped.
 *
 * Pure function — no I/O. Leaves the lemma CdlToken/CdlLine path untouched.
 *
 * @param corpusjson the parsed corpusjson object ({ textid, cdl:[root] }).
 * @param nameToAbz OGSL-name → eBL-ABZ map (eBL numbering — see build script).
 */
export function cdlToAbzSigns(
  corpusjson: unknown,
  nameToAbz: Map<string, string>,
): CdlAbzResult {
  const doc = (corpusjson ?? {}) as { textid?: string; cdl?: CdlNode[] };
  const textId = typeof doc.textid === "string" ? doc.textid : null;
  const stats = emptyStats();

  // Lines as arrays of tokens; a new array opens on each line-start "d" node.
  const lineTokens: string[][] = [];
  let current: string[] | null = null;

  const openLine = (): void => {
    current = [];
    lineTokens.push(current);
  };

  const tally = (r: AbzGraphemeResolution): void => {
    switch (r.kind) {
      case "damage":
        stats.damage++;
        break;
      case "direct":
        stats.direct++;
        break;
      case "normalized":
        stats.normalized++;
        break;
      case "numeral":
        stats.numeral++;
        break;
      case "compound-whole":
        stats.compoundWhole++;
        break;
      case "compound-decomposed":
        stats.compoundDecomposed++;
        break;
      case "unmapped":
        stats.unmapped++;
        stats.unmappedNames[r.name] = (stats.unmappedNames[r.name] ?? 0) + 1;
        break;
    }
  };

  const walk = (nodes: CdlNode[] | undefined): void => {
    if (!Array.isArray(nodes)) return;
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const kind = node.node;
      if (kind === "c") {
        walk(node.cdl);
      } else if (kind === "d") {
        if (node.type === "line-start") openLine();
        // surfaces / damage / other d-types emit no grapheme here.
      } else if (kind === "l") {
        const gdl = node.f?.gdl;
        if (!Array.isArray(gdl)) continue;
        if (!current) openLine(); // orphan lemma before any line-start
        for (const g of gdl) {
          const gs = g?.gdl_sign;
          if (typeof gs !== "string" || gs.length === 0) continue;
          stats.totalGraphemes++;
          const r = resolveGdlSignToAbz(gs, nameToAbz);
          tally(r);
          current!.push(r.token);
        }
      }
    }
  };

  walk(doc.cdl);

  const signs = lineTokens.map((toks) => toks.join(" ")).join("\n");
  return { textId, signs, stats };
}
