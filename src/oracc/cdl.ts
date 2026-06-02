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
