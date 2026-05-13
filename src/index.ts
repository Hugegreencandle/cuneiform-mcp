import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import https from "node:https";
import tls from "node:tls";
import { URL as NodeURL } from "node:url";

// InCommon RSA Server CA 2 — the intermediate that oracc.museum.upenn.edu's
// server omits from its TLS handshake. Browsers/curl resolve it via AIA
// chasing; Node does not. Chains to USERTrust RSA Certification Authority,
// which IS in Node's bundled root set. Valid 2022-11-16 → 2032-11-15.
// Sourced from http://crt.sectigo.com/InCommonRSAServerCA2.crt
const INCOMMON_RSA_SERVER_CA_2 = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----
`;

const ORACC_CA_BUNDLE = [...tls.rootCertificates, INCOMMON_RSA_SERVER_CA_2];

type FetchOutcome =
  | { ok: true; status: number; body: string }
  | { ok: false; status: number | null; error: string };

function oraccHttpsGet(url: string): Promise<FetchOutcome> {
  return new Promise((resolve) => {
    let u: NodeURL;
    try {
      u = new NodeURL(url);
    } catch (err) {
      resolve({ ok: false, status: null, error: `Invalid URL: ${url}` });
      return;
    }
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: { "User-Agent": USER_AGENT, Accept: "application/xml,text/xml,*/*" },
        ca: ORACC_CA_BUNDLE,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) resolve({ ok: true, status, body });
          else resolve({ ok: false, status, error: `HTTP ${status}` });
        });
        res.on("error", (err) => resolve({ ok: false, status: null, error: err.message }));
      },
    );
    req.on("error", (err) => resolve({ ok: false, status: null, error: err.message }));
    req.end();
  });
}

const VERSION = "0.2.0";

const URLS = {
  CDLI_BASE: "https://cdli.earth",
  // Bare oracc.org has been unreachable since at least 2026-Q1; UPenn mirror is the live host.
  ORACC_BASE: "https://oracc.museum.upenn.edu",
  EBL_BASE: "https://www.ebl.lmu.de/api",
  OGSL_SIGNS: "https://raw.githubusercontent.com/oracc/osl/master/00etc/labasi-signs.json",
} as const;

const USER_AGENT = `cuneiform-mcp/${"0.2.0"}`;

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

function stripXmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Wrap each <span class="w selected ...">...</span> with ** markers,
// handling nested <span>...</span> children (the transliteration shape has
// inner <span class="sign sux">KUR</span>.<span>mus</span>-… that a flat
// non-greedy regex would close on prematurely).
function markSelectedSpans(html: string): string {
  const openRe = /<span\s[^>]*class="w selected[^"]*"[^>]*>/g;
  let out = "";
  let i = 0;
  for (const open of html.matchAll(openRe)) {
    const openIdx = open.index!;
    out += html.slice(i, openIdx) + "**";
    let depth = 1;
    let j = openIdx + open[0].length;
    const tagRe = /<(\/?)span\b[^>]*>/g;
    tagRe.lastIndex = j;
    let m: RegExpExecArray | null;
    while ((m = tagRe.exec(html)) !== null) {
      out += html.slice(j, m.index);
      j = m.index + m[0].length;
      if (m[1] === "/") {
        depth--;
        if (depth === 0) {
          out += "**";
          break;
        }
      } else {
        depth++;
      }
    }
    if (depth !== 0) out += "**";
    i = j;
  }
  out += html.slice(i);
  return out;
}

type ParsedTei = {
  title: string;
  cdliId: string | null;
  transliteration: string[];
  translation: string[];
};

function parseOraccTei(xml: string, fallbackId: string): ParsedTei {
  const titleMatch = xml.match(
    /<name[^>]*type="cdlicat:primary_publication"[^>]*>([^<]+)<\/name>/,
  );
  const cdliMatch = xml.match(
    /<name[^>]*type="cdlicat:id_text"[^>]*>([^<]+)<\/name>/,
  );
  const title = titleMatch ? titleMatch[1].trim() : fallbackId;
  const cdliId = cdliMatch ? cdliMatch[1].trim() : null;

  // Transliteration: TEI emits <lb n="N"/> then a run of <w lemma="..."><...>txt</w>
  // up to the next <lb>, </p>, <milestone>, or </body>.
  const parts = xml.split(/<lb\s+n="([^"]+)"\s*\/>/);
  const transliteration: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lineNum = parts[i];
    const body = (parts[i + 1] ?? "").split(
      /<\/p>|<milestone\b|<div\d|<\/body>/,
    )[0];
    const words = [...body.matchAll(/<w\b[^>]*>([\s\S]*?)<\/w>/g)]
      .map((m) => stripXmlTags(m[1]))
      .filter(Boolean);
    if (words.length) {
      transliteration.push(`${lineNum.padStart(4, " ")}  ${words.join(" ")}`);
    }
  }

  // Translation: <div3 type="tr" ... xtr:label="N">English text</div3>
  const trRegex =
    /<div3\b[^>]*type="tr"[^>]*xtr:label="([^"]+)"[^>]*>([\s\S]*?)<\/div3>/g;
  const translation: string[] = [];
  for (const m of xml.matchAll(trRegex)) {
    const label = m[1];
    const text = stripXmlTags(m[2]);
    if (text) translation.push(`${label.padStart(4, " ")}  ${text}`);
  }

  return { title, cdliId, transliteration, translation };
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

// 4. search_oracc — LIVE (UPenn pager HTML scrape).
server.registerTool(
  "search_oracc",
  {
    description:
      "Full-text search within one ORACC project. Returns matched text IDs, canonical citations, and snippets with the hit term marked **like this**.",
    inputSchema: {
      query: z.string().min(1).describe("Free-text query, e.g. 'king', 'Phrygian', 'Aššur'."),
      project: z
        .string()
        .min(1)
        .describe(
          "ORACC project code. Top-level (e.g. 'dcclt') or nested (e.g. 'saao/saa01', 'rinap/rinap4'). Cross-project search is not yet supported.",
        ),
      max_results: z
        .number()
        .int()
        .positive()
        .max(200)
        .optional()
        .describe("Cap match blocks returned (default 25)."),
    },
  },
  async ({ query, project, max_results }) => {
    const cap = max_results ?? 25;
    const proj = project.replace(/^\/+|\/+$/g, "");
    const url = `${URLS.ORACC_BASE}/${proj}/pager?q=${encodeURIComponent(query)}`;
    const res = await oraccHttpsGet(url);
    if (!res.ok) {
      return textResult(
        `ORACC search failed (${res.status ?? "no-status"}): ${res.error} — ${url}.`,
      );
    }
    const html = res.body;
    if (!html.includes("p4Pager")) {
      return textResult(
        `Unexpected response shape (no p4Pager) from ${url}. The UPenn mirror may have changed format.`,
      );
    }
    const imaxMatch = html.match(/data-imax="(\d+)"/);
    const totalHits = imaxMatch ? parseInt(imaxMatch[1], 10) : 0;
    if (totalHits === 0 || html.includes("No results were found for this search")) {
      return textResult(
        `No results for "${query}" in ${proj}.\nSource: ${url}`,
      );
    }

    // Two result shapes:
    //   translation hit  -> <p class="label">...</p>     + <p class="refline tr">…<span class="cell">…</span></p>
    //   transliteration  -> <p class="ce-label">...</p>  + <p class="ce-result">…</p>
    const pairRegex =
      /<p class="(?:label|ce-label)">\s*<a[^>]*data-iref="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>\s*<p class="(?:refline[^"]*|ce-result)"[^>]*>([\s\S]*?)<\/p>/g;

    type Hit = { textId: string; iref: string; cite: string; snippet: string };
    const hits: Hit[] = [];
    for (const m of html.matchAll(pairRegex)) {
      const iref = m[1];
      const cite = m[2].trim();
      const markedBody = markSelectedSpans(m[3]);
      const snippet = stripXmlTags(markedBody);
      const textIdMatch = iref.match(/^([PQX]\d+)/);
      const textId = textIdMatch ? textIdMatch[1] : iref;
      hits.push({ textId, iref, cite, snippet });
    }

    const uniqueTexts = new Set(hits.map((h) => h.textId)).size;
    const shown = hits.slice(0, cap);
    const truncated = hits.length > cap;

    const out = [
      `ORACC search: "${query}" in ${proj}`,
      `${totalHits} hit${totalHits === 1 ? "" : "s"} across ${uniqueTexts} text${uniqueTexts === 1 ? "" : "s"}${
        truncated ? ` (showing first ${cap} of ${hits.length} parsed)` : ` (${hits.length} parsed)`
      }`,
      `Source: ${url}`,
      ``,
      ...shown.map((h, i) => `${String(i + 1).padStart(3, " ")}. [${h.textId}] ${h.cite}\n     ${h.snippet}`),
    ];
    return textResult(out.join("\n"));
  },
);

// 5. get_oracc_text — LIVE (TEI XML from UPenn mirror).
server.registerTool(
  "get_oracc_text",
  {
    description:
      "Fetch one ORACC edition (transliteration + English translation) from the UPenn ORACC mirror's TEI XML.",
    inputSchema: {
      project: z
        .string()
        .min(1)
        .describe(
          "ORACC project code. Top-level (e.g. 'dcclt') or nested (e.g. 'saao/saa01', 'rinap/rinap4').",
        ),
      text_id: z
        .string()
        .min(1)
        .describe("Text identifier within the project, e.g. 'P224485' or 'Q003456'."),
      max_lines: z
        .number()
        .int()
        .positive()
        .max(2000)
        .optional()
        .describe("Cap transliteration + translation lines returned (default 300)."),
    },
  },
  async ({ project, text_id, max_lines }) => {
    const cap = max_lines ?? 300;
    const proj = project.replace(/^\/+|\/+$/g, "");
    const url = `${URLS.ORACC_BASE}/${proj}/tei/${text_id}.xml`;
    const res = await oraccHttpsGet(url);
    if (!res.ok) {
      return textResult(
        `ORACC fetch failed (${res.status ?? "no-status"}): ${res.error} — ${url}. Check project + text_id (e.g. saao/saa01 + P224485).`,
      );
    }
    const xml = res.body;
    if (!xml || !xml.includes("<TEI")) {
      return textResult(
        `No TEI edition found at ${url}. The UPenn mirror returns 200 + empty body for unknown paths — verify project nesting (e.g. 'saao/saa01' not 'saa01') and text_id casing.`,
      );
    }
    const parsed = parseOraccTei(xml, text_id);
    const xlit = parsed.transliteration.slice(0, cap);
    const xlitTruncated = parsed.transliteration.length > cap;
    const trans = parsed.translation.slice(0, cap);
    const transTruncated = parsed.translation.length > cap;

    const out = [
      `${parsed.title}  (${proj} / ${text_id}${parsed.cdliId && parsed.cdliId !== text_id ? ` ↔ ${parsed.cdliId}` : ""})`,
      `Source: ${url}`,
      ``,
      `— TRANSLITERATION (${parsed.transliteration.length} line${parsed.transliteration.length === 1 ? "" : "s"}${xlitTruncated ? `, showing first ${cap}` : ""}) —`,
      ...(xlit.length ? xlit : ["  (no lines parsed)"]),
      ``,
      `— TRANSLATION (${parsed.translation.length} block${parsed.translation.length === 1 ? "" : "s"}${transTruncated ? `, showing first ${cap}` : ""}) —`,
      ...(trans.length ? trans : ["  (no translation blocks)"]),
    ];
    return textResult(out.join("\n"));
  },
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
    process.stderr.write(
      `cuneiform-mcp v${VERSION} smoke OK — 8 tools registered (3 live: lookup_sign, search_oracc, get_oracc_text)\n`,
    );
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
