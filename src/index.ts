import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.1.0";

const URLS = {
  CDLI_BASE: "https://cdli.earth",
  ORACC_BASE: "https://oracc.org",
  EBL_BASE: "https://www.ebl.lmu.de/api",
  OGSL_SIGNS: "https://raw.githubusercontent.com/oracc/osl/master/00etc/labasi-signs.json",
} as const;

type LabasiSign = {
  sign_name: string;
  abz_number: string | null;
  meszl_number: string | null;
  image_1: string | null;
  image_2: string | null;
};

let signCache: Map<string, LabasiSign> | null = null;

async function loadSigns(): Promise<Map<string, LabasiSign>> {
  if (signCache) return signCache;
  const res = await fetch(URLS.OGSL_SIGNS);
  if (!res.ok) throw new Error(`OGSL fetch failed: ${res.status}`);
  const data = (await res.json()) as { results: LabasiSign[] };
  const map = new Map<string, LabasiSign>();
  for (const s of data.results) {
    if (s.sign_name) map.set(s.sign_name.toUpperCase(), s);
  }
  signCache = map;
  return map;
}

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function stubResult(toolName: string, sourceUrl: string, roadmap: string) {
  return textResult(
    [
      `[cuneiform-mcp v${VERSION}] ${toolName} is stubbed in v0.1.`,
      ``,
      `Live source: ${sourceUrl}`,
      ``,
      `Roadmap: ${roadmap}`,
    ].join("\n"),
  );
}

const server = new McpServer({
  name: "cuneiform-mcp",
  version: VERSION,
});

// 1. lookup_sign — WORKING (OGSL labasi-signs.json, 239 signs).
server.registerTool(
  "lookup_sign",
  {
    description:
      "Look up a cuneiform sign by name. Returns Borger ABZ + MZL sign-list reference numbers. Source: ORACC OGSL labasi-signs.json (239 signs).",
    inputSchema: {
      sign: z
        .string()
        .min(1)
        .describe("Sign name, e.g. AN, EN, KI, GUD. Case-insensitive."),
    },
  },
  async ({ sign }) => {
    const signs = await loadSigns();
    const hit = signs.get(sign.toUpperCase());
    if (!hit) {
      const candidates = [...signs.keys()]
        .filter((k) => k.includes(sign.toUpperCase()))
        .slice(0, 10);
      return textResult(
        candidates.length
          ? `Sign "${sign}" not found exactly. Candidates: ${candidates.join(", ")}`
          : `Sign "${sign}" not found in OGSL labasi subset (239 signs). For full coverage see https://oracc.org/ogsl/`,
      );
    }
    return textResult(
      [
        `Sign: ${hit.sign_name}`,
        `Borger ABZ:  ${hit.abz_number ?? "—"}`,
        `Borger MZL:  ${hit.meszl_number ?? "—"}`,
        hit.image_1 ? `Image: ${hit.image_1}` : null,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  },
);

// 2. search_tablets — STUB (CDLI live API needs param mapping; v0.2).
server.registerTool(
  "search_tablets",
  {
    description:
      "[v0.1 stub] Search the CDLI catalog by free text and filters (period, genre, language).",
    inputSchema: {
      query: z.string().describe("Free-text query, e.g. 'gilgamesh' or 'temple inventory'."),
      period: z.string().optional().describe("e.g. 'Old Babylonian', 'Neo-Assyrian'."),
      genre: z.string().optional().describe("e.g. 'Literary', 'Administrative'."),
      language: z.string().optional().describe("e.g. 'Sumerian', 'Akkadian'."),
    },
  },
  async () =>
    stubResult(
      "search_tablets",
      `${URLS.CDLI_BASE}/docs/api`,
      "v0.2 — wire to CDLI Framework /artifacts with content negotiation. Live probes during scaffolding returned 500 on naive GETs; need to inspect cdli-gh/framework-api-client for actual request shape.",
    ),
);

// 3. get_tablet — STUB.
server.registerTool(
  "get_tablet",
  {
    description: "[v0.1 stub] Fetch full metadata + transliteration for one CDLI artifact.",
    inputSchema: {
      cdli_id: z.string().describe("CDLI P-number, e.g. 'P000001'."),
    },
  },
  async () =>
    stubResult(
      "get_tablet",
      `${URLS.CDLI_BASE}/artifacts/`,
      "v0.2 — same blocker as search_tablets. Inscriptions endpoint returns C-ATF / CoNLL-U; will surface both raw transliteration and structured form.",
    ),
);

// 4. search_oracc — STUB.
server.registerTool(
  "search_oracc",
  {
    description:
      "[v0.1 stub] Search annotated text editions across ORACC sub-corpora (saa01, dcclt, blms, etc.).",
    inputSchema: {
      query: z.string().describe("Free-text query."),
      project: z.string().optional().describe("ORACC project code, e.g. 'saa01'."),
    },
  },
  async () =>
    stubResult(
      "search_oracc",
      `${URLS.ORACC_BASE}/`,
      "v0.2 — ORACC publishes per-project corpusjson exports; need to mirror locally for fast search since the live site has TLS issues on its UPenn mirror.",
    ),
);

// 5. get_oracc_text — STUB.
server.registerTool(
  "get_oracc_text",
  {
    description: "[v0.1 stub] Fetch one ORACC edition with translation + lemmatization.",
    inputSchema: {
      project: z.string().describe("ORACC project code."),
      text_id: z.string().describe("Text identifier within the project."),
    },
  },
  async () =>
    stubResult(
      "get_oracc_text",
      `${URLS.ORACC_BASE}/`,
      "v0.2 — fetches /<project>/corpusjson/<text_id>.json once URL pattern is confirmed.",
    ),
);

// 6. search_fragments — STUB (eBL).
server.registerTool(
  "search_fragments",
  {
    description: "[v0.1 stub] Search the eBL fragment catalog (~21,200 fragments).",
    inputSchema: {
      query: z.string().describe("Free-text or museum number prefix."),
    },
  },
  async () =>
    stubResult(
      "search_fragments",
      `${URLS.EBL_BASE}/fragments`,
      "v0.2 — endpoint is live but returned 422 on a parameter-less GET; need to reverse-engineer required query params from ebl-frontend repo.",
    ),
);

// 7. get_fragment — STUB.
server.registerTool(
  "get_fragment",
  {
    description: "[v0.1 stub] Get one eBL fragment by museum number (e.g. 'K.1').",
    inputSchema: {
      museum_number: z.string().describe("eBL museum number, e.g. 'K.1', 'BM.42345'."),
    },
  },
  async () =>
    stubResult(
      "get_fragment",
      `${URLS.EBL_BASE}/fragments/`,
      "v0.2 — Auth0-protected endpoints exist; need to verify which read paths are open vs scope-required.",
    ),
);

// 8. find_join_candidates — STUB (Fragmentarium).
server.registerTool(
  "find_join_candidates",
  {
    description:
      "[v0.1 stub] Get computed Fragmentarium join candidates for an eBL fragment.",
    inputSchema: {
      museum_number: z.string().describe("eBL museum number to find joins for."),
    },
  },
  async () =>
    stubResult(
      "find_join_candidates",
      `${URLS.EBL_BASE}/fragments/`,
      "v0.2 — wraps eBL ngram-matcher output; depends on get_fragment integration first.",
    ),
);

async function main() {
  if (process.argv.includes("--smoke")) {
    process.stderr.write(`cuneiform-mcp v${VERSION} smoke OK — 8 tools registered\n`);
    process.exit(0);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`cuneiform-mcp v${VERSION} listening on stdio (8 tools)\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
