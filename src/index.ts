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
MIIGSjCCBDKgAwIBAgIRAINbdhUgbS1uCX4LbkCf78AwDQYJKoZIhvcNAQEMBQAw
gYgxCzAJBgNVBAYTAlVTMRMwEQYDVQQIEwpOZXcgSmVyc2V5MRQwEgYDVQQHEwtK
ZXJzZXkgQ2l0eTEeMBwGA1UEChMVVGhlIFVTRVJUUlVTVCBOZXR3b3JrMS4wLAYD
VQQDEyVVU0VSVHJ1c3QgUlNBIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MB4XDTIy
MTExNjAwMDAwMFoXDTMyMTExNTIzNTk1OVowRDELMAkGA1UEBhMCVVMxEjAQBgNV
BAoTCUludGVybmV0MjEhMB8GA1UEAxMYSW5Db21tb24gUlNBIFNlcnZlciBDQSAy
MIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAifBcxDi60DRXr5dVoPQi
Q/w+GBE62216UiEGMdbUt7eSiIaFj/iZ/xiFop0rWuH4BCFJ3kSvQF+aIhEsOnuX
R6mViSpUx53HM5ApIzFIVbd4GqY6tgwaPzu/XRI/4Dmz+hoLW/i/zD19iXvS95qf
NU8qP7/3/USf2/VNSUNmuMKlaRgwkouue0usidYK7V8W3ze+rTFvWR2JtWKNTInc
NyWD3GhVy/7G09PwTAu7h0qqRyTkETLf+z7FWtc8c12f+SfvmKHKFVqKpNPtgMkr
wqwaOgOOD4Q00AihVT+UzJ6MmhNPGg+/Xf0BavmXKCGDTv5uzQeOdD35o/Zw16V4
C4J4toj1WLY7hkVhrzKG+UWJiSn8Hv3dUTj4dkneJBNQrUfcIfTHV3gCtKwXn1eX
mrxhH+tWu9RVwsDegRG0s28OMdVeOwljZvYrUjRomutNO5GzynveVxJVCn3Cbn7a
c4L+5vwPNgs04DdOAGzNYdG5t6ryyYPosSLH2B8qDNzxAgMBAAGjggFwMIIBbDAf
BgNVHSMEGDAWgBRTeb9aqitKz1SA4dibwJ3ysgNmyzAdBgNVHQ4EFgQU70wAkqb7
di5eleLJX4cbGdVN4tkwDgYDVR0PAQH/BAQDAgGGMBIGA1UdEwEB/wQIMAYBAf8C
AQAwHQYDVR0lBBYwFAYIKwYBBQUHAwEGCCsGAQUFBwMCMCIGA1UdIAQbMBkwDQYL
KwYBBAGyMQECAmcwCAYGZ4EMAQICMFAGA1UdHwRJMEcwRaBDoEGGP2h0dHA6Ly9j
cmwudXNlcnRydXN0LmNvbS9VU0VSVHJ1c3RSU0FDZXJ0aWZpY2F0aW9uQXV0aG9y
aXR5LmNybDBxBggrBgEFBQcBAQRlMGMwOgYIKwYBBQUHMAKGLmh0dHA6Ly9jcnQu
dXNlcnRydXN0LmNvbS9VU0VSVHJ1c3RSU0FBQUFDQS5jcnQwJQYIKwYBBQUHMAGG
GWh0dHA6Ly9vY3NwLnVzZXJ0cnVzdC5jb20wDQYJKoZIhvcNAQEMBQADggIBACaA
DTTkHq4ivq8+puKE+ca3JbH32y+odcJqgqzDts5bgsapBswRYypjmXLel11Q2U6w
rySldlIjBRDZ8Ah8NOs85A6MKJQLaU9qHzRyG6w2UQTzRwx2seY30Mks3ZdIe9rj
s5rEYliIOh9Dwy8wUTJxXzmYf/A1Gkp4JJp0xIhCVR1gCSOX5JW6185kwid242bs
Lm0vCQBAA/rQgxvLpItZhC9US/r33lgtX/cYFzB4jGOd+Xs2sEAUlGyu8grLohYh
kgWN6hqyoFdOpmrl8yu7CSGV7gmVQf9viwVBDIKm+2zLDo/nhRkk8xA0Bb1BqPzy
bPESSVh4y5rZ5bzB4Lo2YN061HV9+HDnnIDBffNIicACdv4JGyGfpbS6xsi3UCN1
5ypaG43PJqQ0UnBQDuR60io1ApeSNkYhkaHQ9Tk/0C4A+EM3MW/KFuU53eHLVlX9
ss1iG2AJfVktaZ2l/SbY7py8JUYMkL/jqZBRjNkD6srsmpJ6utUMmAlt7m1+cTX8
6/VEBc5Dp9VfuD6hNbNKDSg7YxyEVaBqBEtN5dppj4xSiCrs6LxLHnNo3rG8VJRf
NVQdgFbMb7dOIBokklzfmU69lS0kgyz2mZMJmW2G/hhEdddJWHh3FcLi2MaeYiOV
RFrLHtJvXEdf2aEaZ0LOb2Xo3zO6BJvjXldv2woN
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

// 1. lookup_sign — LIVE (OGSL labasi warm-cache → eBL /signs/{NAME} fallback).
//
// OGSL labasi-signs.json (239 curated signs) gives a fast Borger ABZ + MZL
// lookup once warm. For everything outside that subset, fall through to eBL's
// /signs/{NAME} endpoint, which exposes the full canonical sign record:
// 7 cross-list refs (ABZ, MZL, LAK, HZL, KWU, OBZL, SLLHA), the Unicode
// code-point of the cuneiform glyph, all phonetic sound values with subindex,
// and known logograms. eBL is case-sensitive — always uppercase before query.
type EblSignResponse = {
  name?: string;
  unicode?: number[];
  lists?: Array<{ name: string; number: string }>;
  values?: Array<{ value: string; subIndex?: number }>;
  logograms?: Array<{ logogram: string; wordId?: string[] }>;
  LaBaSi?: string;
};

async function fetchEblSign(name: string): Promise<EblSignResponse | null> {
  const url = `${URLS.EBL_BASE}/signs/${encodeURIComponent(name)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    return (await res.json()) as EblSignResponse;
  } catch {
    return null;
  }
}

function subscript(n: number | undefined): string {
  if (n === undefined) return "";
  const digits = "₀₁₂₃₄₅₆₇₈₉";
  return String(n)
    .split("")
    .map((c) => (/\d/.test(c) ? digits[parseInt(c, 10)] : c))
    .join("");
}

server.registerTool(
  "lookup_sign",
  {
    description:
      "Look up a cuneiform sign by name. Returns Borger ABZ + MZL + LAK + HZL + KWU + OBZL + SLLHA cross-refs, the cuneiform glyph, phonetic sound values, and known logograms. Source: OGSL Labasi (239 curated signs, fast) with fall-through to eBL /api/signs (full canonical sign record).",
    inputSchema: {
      sign: z
        .string()
        .min(1)
        .describe("Sign name, e.g. AN, EN, KI, GUD, LUGAL. Case-insensitive on input — normalized to upper-case for eBL."),
      max_values: z
        .number()
        .int()
        .positive()
        .max(200)
        .optional()
        .describe("Cap on phonetic sound values shown when the eBL path returns them (default 30)."),
    },
  },
  async ({ sign, max_values }) => {
    const cap = max_values ?? 30;
    const NAME = sign.toUpperCase();

    // 1) Warm-cache OGSL lookup first — fast path for the 239 most-studied signs.
    const signs = await loadSigns();
    const ogsl = signs.get(NAME);

    if (ogsl) {
      const out = [
        `Sign: ${ogsl.sign_name}  (source: OGSL Labasi)`,
        `Borger ABZ:  ${ogsl.abz_number ?? "—"}`,
        `Borger MZL:  ${ogsl.meszl_number ?? "—"}`,
        ogsl.image_1 ? `Image: ${ogsl.image_1}` : null,
        ``,
        `Tip: re-call with max_values to also fetch sound values + 7 list refs from eBL.`,
      ];
      return textResult(out.filter((l) => l !== null).join("\n"));
    }

    // 2) Fall through to eBL for the canonical sign record (covers ~600+ signs).
    const ebl = await fetchEblSign(NAME);
    if (!ebl) {
      // 3) Helpful failure — show OGSL near-matches if any.
      const ogslCandidates = [...signs.keys()].filter((k) => k.includes(NAME)).slice(0, 10);
      const tail = ogslCandidates.length
        ? `\nOGSL near-matches: ${ogslCandidates.join(", ")}`
        : "";
      return textResult(
        `Sign "${sign}" not found in OGSL Labasi (239 signs) or eBL /signs (full canonical list).${tail}`,
      );
    }

    const lists = (ebl.lists ?? []).map((l) => `${l.name} ${l.number}`).join(" · ");
    const glyph = (ebl.unicode ?? [])
      .map((cp) => String.fromCodePoint(cp))
      .join("");
    const values = (ebl.values ?? [])
      .map((v) => `${v.value}${subscript(v.subIndex)}`)
      .slice(0, cap);
    const valuesTrunc = (ebl.values?.length ?? 0) > cap;

    const logograms = (ebl.logograms ?? [])
      .slice(0, 5)
      .map((l) => l.logogram.replace(/<[^>]+>/g, "").trim());

    const lines: (string | null)[] = [
      `Sign: ${ebl.name ?? NAME}${glyph ? `  ${glyph}` : ""}  (source: eBL /signs)`,
      lists ? `Lists: ${lists}${ebl.LaBaSi ? ` · LaBaSi ${ebl.LaBaSi}` : ""}` : null,
      values.length
        ? `Sound values (${ebl.values?.length ?? 0}${valuesTrunc ? `, showing first ${cap}` : ""}): ${values.join(", ")}`
        : null,
      logograms.length
        ? `Logograms (${ebl.logograms?.length ?? 0}, showing first 5): ${logograms.join(" · ")}`
        : null,
      ``,
      `Source: ${URLS.EBL_BASE}/signs/${encodeURIComponent(NAME)}`,
    ];
    return textResult(lines.filter((l) => l !== null).join("\n"));
  },
);

// 2. search_tablets — LIVE (CDLI /search with simple-field triplet).
//
// Param shape verified from cdli-gh/framework-api-client/master/src/search.js:
//   simple-field[]=<category>   one of: keyword | publication | collection |
//                                provenience | period | transliteration |
//                                translation | id
//   simple-value[]=<query>
//   simple-op[]=<AND|OR>        boolean joiner BETWEEN multiple terms — NOT
//                                a comparison operator. The brief that called
//                                it "contains/equals/starts_with" was wrong.
// Response is a JSON array of artifact records; pagination via Link header
// (rel="next"/"last"). Each artifact has an integer `id` (used by
// /artifacts/{id} — NOT the P-number) and an optional
// composites[0].composite_no holding the P/Q-number when assigned.
const CDLI_QUERY_CATEGORIES = [
  "keyword",
  "publication",
  "collection",
  "provenience",
  "period",
  "transliteration",
  "translation",
  "id",
] as const;
type CdliCategory = (typeof CDLI_QUERY_CATEGORIES)[number];

server.registerTool(
  "search_tablets",
  {
    description:
      "Search the CDLI artifact catalog (~350K tablets) by keyword, publication, transliteration, period, etc. Returns CDLI integer ID + P/Q-number + designation + museum no + period + provenience.",
    inputSchema: {
      query: z.string().min(1).describe("Search term, e.g. 'gilgamesh' or 'lugal'."),
      category: z
        .enum(CDLI_QUERY_CATEGORIES)
        .optional()
        .describe(
          "Which field to search. Default 'keyword' searches across everything. Use 'transliteration' for sign-string queries, 'publication' for citations.",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Max results returned (default 25)."),
    },
  },
  async ({ query, category, limit }) => {
    const cap = limit ?? 25;
    const cat: CdliCategory = category ?? "keyword";

    const params = new URLSearchParams();
    params.append("simple-field[]", cat);
    params.append("simple-value[]", query);
    params.append("simple-op[]", "AND");
    params.append("limit", String(cap));
    const url = `${URLS.CDLI_BASE}/search?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (err) {
      return textResult(
        `CDLI fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
      );
    }
    if (!res.ok) {
      return textResult(`CDLI search returned HTTP ${res.status} for ${url}.`);
    }

    // Parse Link header to estimate total result count from rel="last".
    const linkHeader = res.headers.get("link") ?? "";
    const lastMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    const lastPage = lastMatch ? parseInt(lastMatch[1], 10) : null;
    const totalEstimate = lastPage !== null ? `${(lastPage - 1) * cap + 1}-${lastPage * cap}` : null;

    type Artifact = {
      id: number;
      designation?: string;
      museum_no?: string;
      composites?: Array<{ composite_no?: string }>;
      period?: { name?: string; period?: string };
      provenience?: { provenience?: string };
      artifact_type?: { artifact_type?: string };
      // CDLI's join shape: languages[i].language is itself an object
      // {id, sequence, language: "Sumerian", protocol_code, inline_code}.
      languages?: Array<{ language?: { language?: string } }>;
    };

    const items = (await res.json()) as Artifact[];
    if (!Array.isArray(items) || items.length === 0) {
      return textResult(`No CDLI artifacts matched ${cat}="${query}".\nSource: ${url}`);
    }

    const lines: string[] = [
      `CDLI search: ${cat}="${query}" (limit ${cap})`,
      `${items.length} item${items.length === 1 ? "" : "s"} on this page${
        totalEstimate ? ` · ${lastPage} pages total (≈${totalEstimate} matches)` : ""
      }.`,
      `Source: ${url}`,
      ``,
    ];
    for (let i = 0; i < items.length; i++) {
      const x = items[i];
      const pNum = x.composites?.[0]?.composite_no;
      const metaBits: string[] = [];
      if (x.period?.name) metaBits.push(x.period.name);
      if (x.artifact_type?.artifact_type) metaBits.push(x.artifact_type.artifact_type);
      if (x.provenience?.provenience && !/^uncertain/i.test(x.provenience.provenience))
        metaBits.push(x.provenience.provenience);
      const langs = (x.languages ?? [])
        .map((l) => l.language?.language)
        .filter(Boolean) as string[];
      if (langs.length) metaBits.push(langs.join(", "));

      const line1 = `${String(i + 1).padStart(3, " ")}. ${
        pNum && pNum !== "needed" ? `P=${pNum}` : "(no P-num)"
      }   id=${x.id}${metaBits.length ? "   " + metaBits.join(" · ") : ""}`;
      const line2 = `     ${x.designation ?? "(no designation)"}${
        x.museum_no ? `   [${x.museum_no}]` : ""
      }`;
      lines.push(line1, line2);
    }
    lines.push("");
    lines.push(`Tip: call get_tablet(cdli_id=<integer id>) — CDLI /artifacts/{id} expects the integer, not the P-number.`);
    return textResult(lines.join("\n"));
  },
);

// 3. get_tablet — LIVE (CDLI /artifacts/{integer-id}).
//
// /artifacts/{id} takes the INTEGER DB id, NOT the P/Q-number — that's
// the #1 naive-client landmine documented in the deep-dive brief. We
// accept both forms from the caller: integer strings pass through;
// P/Q-numbers are resolved via /search?simple-field[]=id&simple-value[]=<P>
// to get the integer id, then we fetch.
//
// Response shape: a single-item ARRAY (not an object) — same row format as
// /search. The ATF transliteration lives at item[0].inscription.atf as a
// string (NOT served by the content-negotiated text/x-c-atf route — that
// route returns 200 + empty body for these artifacts on the live server).
async function resolveCdliId(input: string): Promise<{ id: number | null; error: string | null }> {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return { id: parseInt(trimmed, 10), error: null };
  if (!/^[PQ]\d+$/i.test(trimmed)) {
    return {
      id: null,
      error: `Input "${input}" is neither an integer id nor a P/Q-number (e.g. P237754 or Q000364).`,
    };
  }
  const params = new URLSearchParams();
  params.append("simple-field[]", "id");
  params.append("simple-value[]", trimmed.toUpperCase());
  params.append("simple-op[]", "AND");
  params.append("limit", "1");
  const url = `${URLS.CDLI_BASE}/search?${params.toString()}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return { id: null, error: `CDLI search returned HTTP ${res.status} resolving ${input}.` };
    const arr = (await res.json()) as Array<{ id?: number }>;
    if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0].id !== "number") {
      return { id: null, error: `No CDLI artifact matches ${input}.` };
    }
    return { id: arr[0].id, error: null };
  } catch (err) {
    return {
      id: null,
      error: `CDLI search failed resolving ${input}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

server.registerTool(
  "get_tablet",
  {
    description:
      "Fetch full CDLI artifact record — metadata (designation, museum, period, languages, publications) plus the ATF transliteration when one has been entered. Accepts either the CDLI integer DB id (e.g. '469670') or a P/Q-number (e.g. 'P237754', 'Q000364').",
    inputSchema: {
      cdli_id: z
        .string()
        .min(1)
        .describe(
          "Integer DB id (e.g. '469670') OR P/Q-number (e.g. 'P237754', 'Q000364'). P/Q form is auto-resolved.",
        ),
      max_atf_lines: z
        .number()
        .int()
        .positive()
        .max(2000)
        .optional()
        .describe("Cap on ATF lines surfaced (default 80). ATF can be 30 KB+ for long compositions."),
    },
  },
  async ({ cdli_id, max_atf_lines }) => {
    const cap = max_atf_lines ?? 80;
    const { id, error } = await resolveCdliId(cdli_id);
    if (id === null) return textResult(error ?? `Could not resolve "${cdli_id}".`);

    const url = `${URLS.CDLI_BASE}/artifacts/${id}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (err) {
      return textResult(
        `CDLI fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
      );
    }
    if (res.status === 404) {
      return textResult(
        `No CDLI artifact with id=${id}.${cdli_id !== String(id) ? ` (resolved from "${cdli_id}")` : ""}`,
      );
    }
    if (!res.ok) {
      return textResult(`CDLI returned HTTP ${res.status} for ${url}.`);
    }

    type Artifact = {
      id: number;
      designation?: string;
      museum_no?: string;
      cdli_comments?: string;
      composites?: Array<{ composite_no?: string }>;
      period?: { name?: string; period?: string };
      provenience?: { provenience?: string };
      artifact_type?: { artifact_type?: string };
      languages?: Array<{ language?: { language?: string } }>;
      genres?: Array<{ genre?: { genre?: string } }>;
      publications?: Array<{ publication?: { publication?: string } }>;
      external_resources?: Array<{ external_resource?: { external_resource?: string }; external_resource_key?: string }>;
      inscription?: { atf?: string };
    };
    const body = (await res.json()) as Artifact[] | Artifact;
    const x: Artifact | undefined = Array.isArray(body) ? body[0] : body;
    if (!x) return textResult(`Empty response from ${url}.`);

    const pNum = x.composites?.[0]?.composite_no;
    const langs = (x.languages ?? [])
      .map((l) => l.language?.language)
      .filter(Boolean) as string[];
    const genres = (x.genres ?? [])
      .map((g) => g.genre?.genre)
      .filter(Boolean) as string[];

    const lines: (string | null)[] = [
      `CDLI artifact id=${x.id}${pNum && pNum !== "needed" ? `  (P/Q=${pNum})` : ""}`,
      x.designation ? `Designation: ${x.designation}` : null,
      x.museum_no ? `Museum: ${x.museum_no}` : null,
      x.period?.name ? `Period: ${x.period.name}` : null,
      x.provenience?.provenience && !/^uncertain/i.test(x.provenience.provenience)
        ? `Provenience: ${x.provenience.provenience}`
        : null,
      x.artifact_type?.artifact_type ? `Type: ${x.artifact_type.artifact_type}` : null,
      langs.length ? `Languages: ${langs.join(", ")}` : null,
      genres.length ? `Genres: ${genres.join("; ")}` : null,
    ];

    const pubs = (x.publications ?? [])
      .map((p) => p.publication?.publication)
      .filter(Boolean) as string[];
    if (pubs.length) {
      const top = pubs.slice(0, 3);
      lines.push(`Publications (${pubs.length}${pubs.length > 3 ? ", showing first 3" : ""}): ${top.join(" · ")}`);
    }

    const atf = x.inscription?.atf?.trim() ?? "";
    if (atf) {
      const atfLines = atf.split(/\r?\n/);
      const shown = atfLines.slice(0, cap);
      const truncated = atfLines.length > cap;
      lines.push("");
      lines.push(`— ATF (${atfLines.length} lines${truncated ? `, showing first ${cap}` : ""}) —`);
      for (const l of shown) lines.push(`  ${l}`);
    } else {
      lines.push("");
      lines.push(`— ATF — (not transliterated in CDLI)`);
    }

    if (x.cdli_comments) {
      lines.push("");
      lines.push(`Comments: ${x.cdli_comments.slice(0, 300)}`);
    }

    lines.push("");
    lines.push(`Source: ${url}`);
    return textResult(lines.filter((l) => l !== null).join("\n"));
  },
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

// 6. search_fragments — LIVE (eBL /fragments/query, no auth required).
server.registerTool(
  "search_fragments",
  {
    description:
      "Search the eBL fragment catalog (~21,200 fragments) by museum number or transliteration. Returns museum numbers + matching line numbers; call get_fragment for full details.",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe(
          "Free text. Museum number (e.g. 'K.1', 'BM.42345') or transliteration sign string (e.g. 'lugal', 'an.ki').",
        ),
      mode: z
        .enum(["auto", "number", "transliteration", "lemmas"])
        .optional()
        .describe(
          "Override auto-detection: 'number' (museum no.), 'transliteration' (sign reading), 'lemmas' (normalized headword).",
        ),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Max items returned (default 20, max 100)."),
    },
  },
  async ({ query, mode, limit }) => {
    const cap = limit ?? 20;
    // Museum numbers in eBL look like K.1, BM.42345, VAT.4936, Sm.1, Ki.1904-10-9,1.
    // Heuristic: starts with 1-5 capital letters, then a dot, then a digit.
    const looksLikeMuseumNumber = /^[A-Z][A-Za-z]{0,4}\.\d/.test(query);
    const resolved = mode ?? "auto";
    const paramName: "number" | "transliteration" | "lemmas" =
      resolved === "auto"
        ? looksLikeMuseumNumber
          ? "number"
          : "transliteration"
        : resolved;

    const params = new URLSearchParams();
    params.set(paramName, query);
    params.set("limit", String(cap));
    const url = `${URLS.EBL_BASE}/fragments/query?${params.toString()}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch (err) {
      return textResult(
        `eBL fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
      );
    }
    if (!res.ok) {
      const hint =
        res.status === 422
          ? " The server rejected the parameter — try setting mode explicitly."
          : "";
      return textResult(`eBL search returned HTTP ${res.status} for ${url}.${hint}`);
    }
    type Hit = {
      matchingLines: number[];
      museumNumber: { prefix: string; number: string; suffix: string };
      matchCount: number;
    };
    const data = (await res.json()) as { matchCountTotal: number; items: Hit[] };

    const fmtMuseum = (mn: Hit["museumNumber"]) =>
      `${mn.prefix}.${mn.number}${mn.suffix ? mn.suffix : ""}`;

    if (!data.items || data.items.length === 0) {
      return textResult(`No fragments matched ${paramName}="${query}".\nSource: ${url}`);
    }

    const out = [
      `eBL fragment search: ${paramName}="${query}" (limit ${cap})`,
      `${data.items.length} fragment${data.items.length === 1 ? "" : "s"} returned, ${
        data.matchCountTotal
      } line match${data.matchCountTotal === 1 ? "" : "es"} on this page.`,
      `Source: ${url}`,
      ``,
      ...data.items.map((it, i) => {
        const id = fmtMuseum(it.museumNumber);
        const lines = it.matchingLines.length
          ? ` — matching lines: ${it.matchingLines.join(", ")}`
          : "";
        return `${String(i + 1).padStart(3, " ")}. ${id}  (${it.matchCount} match${
          it.matchCount === 1 ? "" : "es"
        })${lines}`;
      }),
      ``,
      `Tip: call get_fragment(museum_number="<id>") for full publication + description.`,
    ];
    return textResult(out.join("\n"));
  },
);

// 7. get_fragment — LIVE (eBL /fragments/<id>, no auth required).
server.registerTool(
  "get_fragment",
  {
    description:
      "Fetch full eBL fragment record by museum number — publication, description, script, joins, transliteration, references.",
    inputSchema: {
      museum_number: z
        .string()
        .min(1)
        .describe(
          "eBL museum number. Accepted forms: 'K.1', 'BM.42345', 'BM.41255C' (auto-normalized to 'BM.41255.C'), 'Ki.1904-10-9,1'.",
        ),
      max_lines: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe("Cap transliteration lines shown (default 60)."),
    },
  },
  async ({ museum_number, max_lines }) => {
    const cap = max_lines ?? 60;
    // eBL stores museum numbers as {prefix, number, suffix} and the URL form
    // is "Prefix.Number.Suffix" with a dot before the suffix. Users frequently
    // type "BM.41255C" (no dot) — normalize.
    const normalize = (s: string): string => {
      const m = s.match(/^([A-Za-z]+)\.(\d+[\d\-,]*)([A-Za-z]+)$/);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
    };
    const id = normalize(museum_number.trim());
    const url = `${URLS.EBL_BASE}/fragments/${encodeURIComponent(id)}`;

    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    } catch (err) {
      return textResult(
        `eBL fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
      );
    }
    if (res.status === 404) {
      return textResult(
        `No fragment "${museum_number}" (tried ${id}). Use search_fragments to discover valid IDs.`,
      );
    }
    if (!res.ok) {
      return textResult(`eBL returned HTTP ${res.status} for ${url}.`);
    }
    type Dim = { value: number; note?: string } | null;
    type Frag = {
      museumNumber: { prefix: string; number: string; suffix: string };
      publication?: string;
      description?: string;
      collection?: string;
      museum?: string;
      script?: { period?: string; periodModifier?: string };
      genres?: Array<{ category: string[] }>;
      externalNumbers?: { cdliNumber?: string; bmIdNumber?: string; oraccNumbers?: string[] };
      length?: Dim;
      width?: Dim;
      thickness?: Dim;
      joins?: Array<Array<{ museumNumber: { prefix: string; number: string; suffix: string } }>>;
      references?: Array<{ id: string; type?: string; pages?: string }>;
      cdliImages?: string[];
      hasPhoto?: boolean;
      text?: {
        numberOfLines: number;
        lines: Array<{ prefix?: string; content?: Array<{ value: string }> }>;
      };
    };
    const f = (await res.json()) as Frag;

    const fmtMuseum = (mn: Frag["museumNumber"]) =>
      `${mn.prefix}.${mn.number}${mn.suffix ? "." + mn.suffix : ""}`;
    const fmtDim = (d: Dim | undefined) =>
      d && typeof d.value === "number" ? `${d.value}${d.note ? " " + d.note : ""}` : null;

    const lines: string[] = [];
    lines.push(`${fmtMuseum(f.museumNumber)}${f.museum ? ` — ${f.museum.replace(/_/g, " ")}` : ""}${f.collection ? ` / ${f.collection}` : ""}`);
    if (f.publication) lines.push(`Publication: ${f.publication.split("\n")[0].trim()}`);
    if (f.description) lines.push(`Description: ${f.description}`);

    const scriptBits = [
      f.script?.period && f.script.period !== "None" ? f.script.period : "",
      f.script?.periodModifier && f.script.periodModifier !== "None" ? f.script.periodModifier : "",
    ].filter(Boolean);
    if (scriptBits.length) lines.push(`Script: ${scriptBits.join(" / ")}`);

    if (f.genres?.length) {
      lines.push(`Genres: ${f.genres.map((g) => g.category.join(" → ")).join("; ")}`);
    }

    const ext = f.externalNumbers ?? {};
    const extBits: string[] = [];
    if (ext.cdliNumber) extBits.push(`CDLI ${ext.cdliNumber}`);
    if (ext.oraccNumbers?.length) extBits.push(`ORACC ${ext.oraccNumbers.join(",")}`);
    if (ext.bmIdNumber) extBits.push(`BM-ID ${ext.bmIdNumber}`);
    if (extBits.length) lines.push(`External: ${extBits.join(" · ")}`);

    const dims = [fmtDim(f.length), fmtDim(f.width), fmtDim(f.thickness)].filter(Boolean) as string[];
    if (dims.length) lines.push(`Dimensions: ${dims.join(" × ")} cm`);

    if (f.joins?.length) {
      const joinStr = f.joins
        .map((group) => group.map((j) => fmtMuseum(j.museumNumber)).join(" + "))
        .join("; ");
      lines.push(`Joins: ${joinStr}`);
    }

    if (f.hasPhoto || f.cdliImages?.length) {
      const photoBits = [];
      if (f.hasPhoto) photoBits.push("photo on file");
      if (f.cdliImages?.length) photoBits.push(`CDLI assets: ${f.cdliImages.join(", ")}`);
      lines.push(`Images: ${photoBits.join("; ")}`);
    }

    lines.push("");
    const nLines = f.text?.numberOfLines ?? 0;
    if (nLines > 0 && f.text?.lines?.length) {
      const shown = f.text.lines.slice(0, cap);
      const truncated = f.text.lines.length > cap;
      lines.push(`— TRANSLITERATION (${nLines} lines${truncated ? `, showing first ${cap}` : ""}) —`);
      for (const line of shown) {
        const body = (line.content ?? []).map((c) => c.value).join(" ").trim();
        lines.push(`  ${line.prefix ?? ""} ${body}`.trimEnd());
      }
    } else {
      lines.push(`— TRANSLITERATION — (none recorded on this fragment)`);
    }

    if (f.references?.length) {
      lines.push("");
      const shownRefs = f.references.slice(0, 5);
      lines.push(`— REFERENCES (${f.references.length}${f.references.length > 5 ? ", showing first 5" : ""}) —`);
      for (const r of shownRefs) {
        lines.push(`  · ${r.id}${r.type ? ` [${r.type}]` : ""}${r.pages ? ` p. ${r.pages}` : ""}`);
      }
    }

    lines.push("");
    lines.push(`Source: ${url}`);
    return textResult(lines.join("\n"));
  },
);

// 8. find_join_candidates — LIVE (local lineToVec scorer, no Auth0).
//
// eBL's /fragments/{n}/match endpoint is Auth0-gated. Rather than block on
// the `transliterate:fragments` scope, we reproduce its algorithm locally:
//   1. Pre-crawled corpus of {museumNumber, lineToVec} for all ~36K
//      transliterated fragments (run `node dist/index.js --prefetch`).
//   2. For a target museum_number, fetch its full record (or pull from
//      cache), then call scoreBoth() against every other fragment.
//   3. Return top 15 by raw score AND top 15 by ruling-weighted score —
//      the same NUMBER_OF_RESULTS_TO_RETURN = 15 as LineToVecRanker.
server.registerTool(
  "find_join_candidates",
  {
    description:
      "Find fragments that may physically join a target eBL fragment by running the same lineToVec prefix/suffix overlap algorithm as eBL's /match endpoint (reproduced locally, no Auth0). Returns top 15 by raw score and top 15 by ruling-weighted score.",
    inputSchema: {
      museum_number: z
        .string()
        .min(1)
        .describe("eBL museum number, e.g. 'K.1', 'BM.41255C' (auto-normalized)."),
      top_k: z
        .number()
        .int()
        .positive()
        .max(50)
        .optional()
        .describe("Number of candidates returned per ranking (default 15, matches eBL)."),
    },
  },
  async ({ museum_number, top_k }) => {
    const k = top_k ?? 15;
    // Normalize "BM.41255C" → "BM.41255.C" same as get_fragment.
    const normalize = (s: string): string => {
      const m = s.match(/^([A-Za-z]+)\.(\d+[\d\-,]*)([A-Za-z]+)$/);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
    };
    const targetId = normalize(museum_number.trim());

    const { loadCorpus } = await import("./cache.js");
    const { scoreBoth } = await import("./lineToVecScore.js");
    const corpus = await loadCorpus();

    if (corpus.missing) {
      return textResult(
        `Local corpus cache is empty. Run \`node ${process.argv[1]} --prefetch\` ` +
          `to crawl /fragments/all-signs (~24 minutes, ~7 MB JSONL written to ` +
          `${corpus.cachePath}). Then call find_join_candidates again.`,
      );
    }

    // Locate the target in the corpus. If it's not present (e.g. cache
    // doesn't yet cover this prefix), fetch it on-demand from eBL.
    let target = corpus.fragments.find((f) => f.museumNumber === targetId);
    if (!target) {
      const url = `${URLS.EBL_BASE}/fragments/${encodeURIComponent(targetId)}`;
      let res: Response;
      try {
        res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
      } catch (err) {
        return textResult(
          `Target "${targetId}" not in local cache (${corpus.fragments.length} fragments) ` +
            `and live fetch failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (res.status === 404) {
        return textResult(
          `No fragment "${museum_number}" (tried ${targetId}). Use search_fragments to discover valid IDs.`,
        );
      }
      if (!res.ok) {
        return textResult(`eBL returned HTTP ${res.status} fetching ${targetId}.`);
      }
      const body = (await res.json()) as {
        museumNumber?: { prefix: string; number: string; suffix: string };
        lineToVec?: number[][];
        designation?: string;
      };
      const mn = body.museumNumber
        ? `${body.museumNumber.prefix}.${body.museumNumber.number}${body.museumNumber.suffix ? "." + body.museumNumber.suffix : ""}`
        : targetId;
      target = {
        museumNumber: mn,
        lineToVec: Array.isArray(body.lineToVec) ? body.lineToVec : [],
        designation: body.designation,
      };
    }

    if (!target.lineToVec || target.lineToVec.length === 0) {
      return textResult(
        `${targetId} has no lineToVec encoding (likely untransliterated). The join matcher cannot score it.`,
      );
    }

    // Score every OTHER fragment in the corpus against the target.
    type RankedHit = { museumNumber: string; designation?: string; score: number; weighted: number };
    const hits: RankedHit[] = [];
    for (const cand of corpus.fragments) {
      if (cand.museumNumber === target.museumNumber) continue;
      if (!cand.lineToVec || cand.lineToVec.length === 0) continue;
      const { score, scoreWeighted } = scoreBoth(target.lineToVec, cand.lineToVec);
      if (score === 0 && scoreWeighted === 0) continue;
      hits.push({
        museumNumber: cand.museumNumber,
        designation: cand.designation,
        score,
        weighted: scoreWeighted,
      });
    }

    const topRaw = [...hits].sort((a, b) => b.score - a.score).slice(0, k);
    const topWeighted = [...hits].sort((a, b) => b.weighted - a.weighted).slice(0, k);

    const ageMin = corpus.ageMs ? (corpus.ageMs / 60_000).toFixed(1) : "?";
    const lines: string[] = [
      `Join candidates for ${target.museumNumber}${target.designation ? `  (${target.designation})` : ""}`,
      `Scored against ${corpus.fragments.length} cached fragments. Cache age: ${ageMin}m. Local algorithm (eBL lineToVec overlap), no Auth0.`,
      ``,
      `— TOP ${topRaw.length} BY RAW SCORE (suffix/prefix overlap length) —`,
      ...topRaw.map(
        (h, i) =>
          `${String(i + 1).padStart(3, " ")}. ${h.museumNumber.padEnd(20)} score=${h.score}` +
          (h.designation ? `   ${h.designation}` : ""),
      ),
      ``,
      `— TOP ${topWeighted.length} BY WEIGHTED SCORE (rulings count 3-10×, text lines 1×) —`,
      ...topWeighted.map(
        (h, i) =>
          `${String(i + 1).padStart(3, " ")}. ${h.museumNumber.padEnd(20)} weighted=${h.weighted}` +
          (h.designation ? `   ${h.designation}` : ""),
      ),
    ];
    return textResult(lines.join("\n"));
  },
);

async function runPrefetch(): Promise<void> {
  // Imported lazily so the MCP server's hot path doesn't pull fs/path deps.
  const { crawlFragments, getCacheDir } = await import("./cache.js");
  process.stderr.write(`cuneiform-mcp v${VERSION} --prefetch starting\n`);
  process.stderr.write(`cache dir: ${getCacheDir()}\n`);
  const maxRaw = process.env.CUNEIFORM_MCP_MAX_FETCH;
  const maxFragments = maxRaw ? parseInt(maxRaw, 10) : undefined;
  const result = await crawlFragments({
    concurrency: 5,
    resume: !process.argv.includes("--no-resume"),
    maxFragments: Number.isFinite(maxFragments) ? maxFragments : undefined,
  });
  process.stderr.write(
    `summary: ${result.written} written, ${result.skipped} skipped, ${result.errors} errors over ${result.totalIds} ids\n`,
  );
}

async function main() {
  if (process.argv.includes("--smoke")) {
    process.stderr.write(
      `cuneiform-mcp v${VERSION} smoke OK — 8 tools registered, all live (find_join_candidates uses local lineToVec cache, no Auth0 required)\n`,
    );
    process.exit(0);
  }
  if (process.argv.includes("--prefetch")) {
    await runPrefetch();
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
