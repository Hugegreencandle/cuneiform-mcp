import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dns from "node:dns";
import net from "node:net";
import https from "node:https";
import tls from "node:tls";
import { URL as NodeURL } from "node:url";
import { provenance, schemaId, type Provenance } from "./types.js";
import {
  compareFloodNarratives,
  findAntediluvianParallel,
  apkalluAttestations,
  discoverParallelCandidates,
  findMesopotamianParallel,
  discoverPrimarySourceParallels,
  listAntediluvianQueries,
  renderFloodMatrix,
  renderParallelEntry,
  renderApkalluSages,
  renderDiscoveredCandidates,
  renderMesopotamianParallels,
  renderPrimarySourceParallels,
} from "./tools/comparative.js";

// eBL (www.ebl.lmu.de) publishes AAAA records but its IPv6 listener is flaky
// — about 1 fragment in 20 returns UND_ERR_CONNECT_TIMEOUT (10s) on undici's
// IPv6 attempt, surfacing to the caller as a bare "fetch failed". curl works
// because it does Happy Eyeballs and falls back to IPv4; Node's fetch does
// not by default. ipv4first alone is NOT enough on Node ≥ 20 — undici/net
// runs autoSelectFamily (its own Happy Eyeballs) at the socket layer and
// ignores the DNS-order hint. We have to disable BOTH: tell DNS to prefer
// IPv4, and disable the socket-level family race so the resolved-first
// address actually gets used. Verified 2026-05-14 on K.2862, IM.77027.
dns.setDefaultResultOrder("ipv4first");
net.setDefaultAutoSelectFamily?.(false);

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

const VERSION = "0.13.0";

const URLS = {
  CDLI_BASE: "https://cdli.earth",
  // Bare oracc.org has been unreachable since at least 2026-Q1; UPenn mirror is the live host.
  ORACC_BASE: "https://oracc.museum.upenn.edu",
  EBL_BASE: "https://www.ebl.lmu.de/api",
  OGSL_SIGNS: "https://raw.githubusercontent.com/oracc/osl/master/00etc/labasi-signs.json",
} as const;

const USER_AGENT = `cuneiform-mcp/${VERSION}`;

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

// v0.5 structured-response helper. Returns the MCP shape with both the
// rendered text (back-compat for any caller treating the response as
// human-readable) AND a structuredContent envelope (typed payload +
// provenance + optional warnings). Callers pass the typed data; this
// helper stamps the envelope around it.
//
// Validates the envelope shape at construction time — catches missing
// required fields (schema URL, provenance source/endpoint/fetched_at/
// mcp_version) before they leak into a response. Throws synchronously
// in the handler if violated, surfacing as an MCP tool error.
function structuredResult<T>(
  text: string,
  envelope: {
    schema: string;
    data: T;
    provenance: import("./types.js").Provenance;
    warnings?: string[];
  },
) {
  if (typeof envelope.schema !== "string" || !envelope.schema.startsWith("http")) {
    throw new Error(`structuredResult: schema must be an http(s) URI, got ${envelope.schema}`);
  }
  if (envelope.data === null || typeof envelope.data !== "object") {
    throw new Error("structuredResult: data must be a non-null object");
  }
  const p = envelope.provenance;
  if (!p || !p.source || !p.endpoint || !p.fetched_at || !p.mcp_version) {
    throw new Error(
      `structuredResult: provenance must include source, endpoint, fetched_at, mcp_version (got ${JSON.stringify(p)})`,
    );
  }
  return {
    content: [{ type: "text" as const, text }],
    structuredContent: {
      schema: envelope.schema,
      data: envelope.data as Record<string, unknown>,
      provenance: envelope.provenance as unknown as Record<string, unknown>,
      ...(envelope.warnings && envelope.warnings.length > 0
        ? { warnings: envelope.warnings }
        : {}),
    },
  };
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
    const SCHEMA = schemaId("lookup_sign");

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
      const cross_refs: Array<{ list: string; number: string }> = [];
      if (ogsl.abz_number) cross_refs.push({ list: "ABZ", number: ogsl.abz_number });
      if (ogsl.meszl_number) cross_refs.push({ list: "MZL", number: ogsl.meszl_number });
      const data = {
        query: sign,
        name: NAME,
        found: true,
        source_path: "OGSL" as const,
        ...(cross_refs.length > 0 ? { cross_refs } : {}),
        ...(ogsl.image_1 ? { ogsl_image: ogsl.image_1 } : {}),
      };
      const prov: Provenance = provenance("OGSL", URLS.OGSL_SIGNS, VERSION, {
        citation: "OGSL Labasi sign-list (curated subset, ~239 signs)",
      });
      return structuredResult(out.filter((l) => l !== null).join("\n"), {
        schema: SCHEMA,
        data,
        provenance: prov,
        warnings: [
          "OGSL warm-cache path returns Borger ABZ/MZL only. Re-call with `max_values` to fetch the full canonical record (cross-refs, sound values, logograms) from eBL.",
        ],
      });
    }

    // 2) Fall through to eBL for the canonical sign record (covers ~600+ signs).
    const eblUrl = `${URLS.EBL_BASE}/signs/${encodeURIComponent(NAME)}`;
    const ebl = await fetchEblSign(NAME);
    if (!ebl) {
      // 3) Helpful failure — show OGSL near-matches if any.
      const ogslCandidates = [...signs.keys()].filter((k) => k.includes(NAME)).slice(0, 10);
      const tail = ogslCandidates.length
        ? `\nOGSL near-matches: ${ogslCandidates.join(", ")}`
        : "";
      return structuredResult(
        `Sign "${sign}" not found in OGSL Labasi (239 signs) or eBL /signs (full canonical list).${tail}`,
        {
          schema: SCHEMA,
          data: {
            query: sign,
            name: NAME,
            found: false,
            source_path: "miss" as const,
            ...(ogslCandidates.length > 0 ? { near_matches: ogslCandidates } : {}),
          },
          provenance: provenance("local", "local:lookup_sign", VERSION),
        },
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
      `Source: ${eblUrl}`,
    ];

    const data = {
      query: sign,
      name: NAME,
      found: true,
      source_path: "eBL" as const,
      ...(glyph ? { glyph } : {}),
      ...(ebl.unicode && ebl.unicode.length > 0 ? { unicode: ebl.unicode } : {}),
      ...(ebl.lists && ebl.lists.length > 0
        ? {
            cross_refs: ebl.lists.map((l) => ({
              list: l.name,
              number: l.number,
            })),
          }
        : {}),
      ...(ebl.LaBaSi ? { labasi: ebl.LaBaSi } : {}),
      ...(ebl.values && ebl.values.length > 0
        ? {
            sound_values: ebl.values.slice(0, cap).map((v) => ({
              value: v.value,
              ...(v.subIndex !== undefined ? { sub_index: v.subIndex } : {}),
              rendered: `${v.value}${subscript(v.subIndex)}`,
            })),
            sound_values_total: ebl.values.length,
            sound_values_truncated: valuesTrunc,
          }
        : {}),
      ...(logograms.length > 0
        ? {
            logograms,
            logograms_total: ebl.logograms?.length ?? 0,
          }
        : {}),
    };

    const warnings: string[] = [];
    if (valuesTrunc) {
      warnings.push(
        `sound_values truncated to first ${cap} of ${ebl.values?.length ?? 0}; re-query with a larger max_values to see the rest.`,
      );
    }
    if ((ebl.logograms?.length ?? 0) > 5) {
      warnings.push(
        `logograms truncated to first 5 of ${ebl.logograms?.length ?? 0}; full list available upstream.`,
      );
    }

    return structuredResult(lines.filter((l) => l !== null).join("\n"), {
      schema: SCHEMA,
      data,
      provenance: provenance("eBL", eblUrl, VERSION),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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
    const SCHEMA = schemaId("search_tablets");

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
      const msg = `CDLI fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`;
      return structuredResult(msg, {
        schema: SCHEMA,
        data: { query, category: cat, limit: cap, count_returned: 0, results: [] },
        provenance: provenance("CDLI", url, VERSION),
        warnings: [`upstream-fetch-failed: ${err instanceof Error ? err.message : String(err)}`],
      });
    }
    if (!res.ok) {
      return structuredResult(`CDLI search returned HTTP ${res.status} for ${url}.`, {
        schema: SCHEMA,
        data: { query, category: cat, limit: cap, count_returned: 0, results: [] },
        provenance: provenance("CDLI", url, VERSION),
        warnings: [`upstream-http-${res.status}`],
      });
    }

    // Parse Link header to estimate total result count from rel="last".
    const linkHeader = res.headers.get("link") ?? "";
    const lastMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="last"/);
    const lastPage = lastMatch ? parseInt(lastMatch[1], 10) : null;
    const pageEstimate =
      lastPage !== null
        ? { last_page: lastPage, estimate_lower: (lastPage - 1) * cap + 1, estimate_upper: lastPage * cap }
        : null;
    const totalEstimate = pageEstimate ? `${pageEstimate.estimate_lower}-${pageEstimate.estimate_upper}` : null;

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
      return structuredResult(`No CDLI artifacts matched ${cat}="${query}".\nSource: ${url}`, {
        schema: SCHEMA,
        data: { query, category: cat, limit: cap, count_returned: 0, results: [] },
        provenance: provenance("CDLI", url, VERSION),
      });
    }

    const structuredResults = items.map((x) => {
      const pNum = x.composites?.[0]?.composite_no;
      const langs = (x.languages ?? [])
        .map((l) => l.language?.language)
        .filter((s): s is string => typeof s === "string");
      const prov = x.provenience?.provenience;
      const useProv = prov && !/^uncertain/i.test(prov);
      return {
        cdli_id: x.id,
        ...(pNum && pNum !== "needed" ? { p_number: pNum } : {}),
        ...(x.designation ? { designation: x.designation } : {}),
        ...(x.museum_no ? { museum_number: x.museum_no } : {}),
        ...(x.period?.name ? { period: x.period.name } : {}),
        ...(x.artifact_type?.artifact_type ? { artifact_type: x.artifact_type.artifact_type } : {}),
        ...(useProv ? { provenience: prov } : {}),
        ...(langs.length > 0 ? { languages: langs } : {}),
      };
    });

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
    return structuredResult(lines.join("\n"), {
      schema: SCHEMA,
      data: {
        query,
        category: cat,
        limit: cap,
        ...(pageEstimate ? { page_estimate: pageEstimate } : {}),
        count_returned: items.length,
        results: structuredResults,
      },
      provenance: provenance("CDLI", url, VERSION),
    });
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
    const SCHEMA = schemaId("get_tablet");
    const { id, error } = await resolveCdliId(cdli_id);
    if (id === null) {
      return structuredResult(error ?? `Could not resolve "${cdli_id}".`, {
        schema: SCHEMA,
        data: {
          cdli_id: 0,
          found: false,
          error: error ?? `Could not resolve "${cdli_id}".`,
        },
        provenance: provenance("CDLI", `${URLS.CDLI_BASE}/search?simple-value[]=${encodeURIComponent(cdli_id)}`, VERSION),
        warnings: ["resolution-failed"],
      });
    }
    const wasResolved = cdli_id !== String(id);

    const url = `${URLS.CDLI_BASE}/artifacts/${id}`;
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      });
    } catch (err) {
      return structuredResult(
        `CDLI fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
        {
          schema: SCHEMA,
          data: {
            cdli_id: id,
            found: false,
            ...(wasResolved ? { resolved_from: cdli_id } : {}),
            error: err instanceof Error ? err.message : String(err),
          },
          provenance: provenance("CDLI", url, VERSION),
          warnings: ["upstream-fetch-failed"],
        },
      );
    }
    if (res.status === 404) {
      return structuredResult(
        `No CDLI artifact with id=${id}.${wasResolved ? ` (resolved from "${cdli_id}")` : ""}`,
        {
          schema: SCHEMA,
          data: {
            cdli_id: id,
            found: false,
            ...(wasResolved ? { resolved_from: cdli_id } : {}),
            error: `CDLI 404 for id=${id}`,
          },
          provenance: provenance("CDLI", url, VERSION),
        },
      );
    }
    if (!res.ok) {
      return structuredResult(`CDLI returned HTTP ${res.status} for ${url}.`, {
        schema: SCHEMA,
        data: {
          cdli_id: id,
          found: false,
          ...(wasResolved ? { resolved_from: cdli_id } : {}),
          error: `CDLI returned HTTP ${res.status}`,
        },
        provenance: provenance("CDLI", url, VERSION),
        warnings: [`upstream-http-${res.status}`],
      });
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
    if (!x) {
      return structuredResult(`Empty response from ${url}.`, {
        schema: SCHEMA,
        data: {
          cdli_id: id,
          found: false,
          ...(wasResolved ? { resolved_from: cdli_id } : {}),
          error: "empty-response",
        },
        provenance: provenance("CDLI", url, VERSION),
      });
    }

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
    let atfStructured: { line_count: number; lines: string[]; truncated: boolean } | undefined;
    if (atf) {
      const atfLines = atf.split(/\r?\n/);
      const shown = atfLines.slice(0, cap);
      const truncated = atfLines.length > cap;
      atfStructured = { line_count: atfLines.length, lines: shown, truncated };
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

    const warnings: string[] = [];
    if (atfStructured?.truncated) {
      warnings.push(`atf truncated to first ${cap} of ${atfStructured.line_count}; re-query with a larger max_atf_lines.`);
    }
    if (pubs.length > 3) {
      warnings.push(`publications truncated to first 3 of ${pubs.length}; full list available upstream.`);
    }

    return structuredResult(lines.filter((l) => l !== null).join("\n"), {
      schema: SCHEMA,
      data: {
        cdli_id: x.id,
        found: true,
        ...(wasResolved ? { resolved_from: cdli_id } : {}),
        ...(pNum && pNum !== "needed" ? { p_number: pNum } : {}),
        ...(x.designation ? { designation: x.designation } : {}),
        ...(x.museum_no ? { museum_number: x.museum_no } : {}),
        ...(x.period?.name ? { period: x.period.name } : {}),
        ...(x.provenience?.provenience && !/^uncertain/i.test(x.provenience.provenience)
          ? { provenience: x.provenience.provenience }
          : {}),
        ...(x.artifact_type?.artifact_type ? { artifact_type: x.artifact_type.artifact_type } : {}),
        ...(langs.length > 0 ? { languages: langs } : {}),
        ...(genres.length > 0 ? { genres } : {}),
        ...(pubs.length > 0
          ? { publications: { count: pubs.length, shown: pubs.slice(0, 3) } }
          : {}),
        ...(x.cdli_comments ? { comments: x.cdli_comments } : {}),
        ...(atfStructured ? { atf: atfStructured } : {}),
      },
      provenance: provenance("CDLI", url, VERSION),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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
    const SCHEMA = schemaId("search_oracc");
    const res = await oraccHttpsGet(url);
    if (!res.ok) {
      return structuredResult(
        `ORACC search failed (${res.status ?? "no-status"}): ${res.error} — ${url}.`,
        {
          schema: SCHEMA,
          data: { query, project: proj, limit: cap, total_hits: 0, unique_texts: 0, hits: [] },
          provenance: provenance("ORACC", url, VERSION),
          warnings: [`upstream-fetch-failed${res.status ? `-${res.status}` : ""}`],
        },
      );
    }
    const html = res.body;
    if (!html.includes("p4Pager")) {
      return structuredResult(
        `Unexpected response shape (no p4Pager) from ${url}. The UPenn mirror may have changed format.`,
        {
          schema: SCHEMA,
          data: { query, project: proj, limit: cap, total_hits: 0, unique_texts: 0, hits: [] },
          provenance: provenance("ORACC", url, VERSION),
          warnings: ["unexpected-response-shape"],
        },
      );
    }
    const imaxMatch = html.match(/data-imax="(\d+)"/);
    const totalHits = imaxMatch ? parseInt(imaxMatch[1], 10) : 0;
    if (totalHits === 0 || html.includes("No results were found for this search")) {
      return structuredResult(`No results for "${query}" in ${proj}.\nSource: ${url}`, {
        schema: SCHEMA,
        data: { query, project: proj, limit: cap, total_hits: 0, unique_texts: 0, hits: [] },
        provenance: provenance("ORACC", url, VERSION),
      });
    }

    // Two result shapes:
    //   translation hit  -> <p class="label">...</p>     + <p class="refline tr">…<span class="cell">…</span></p>
    //   transliteration  -> <p class="ce-label">...</p>  + <p class="ce-result">…</p>
    // Split into two passes so we can tag each hit's type.
    type Hit = {
      text_id: string;
      iref: string;
      citation: string;
      snippet: string;
      hit_type: "translation" | "transliteration";
    };
    const hits: Hit[] = [];
    const translationRegex =
      /<p class="label">\s*<a[^>]*data-iref="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>\s*<p class="refline[^"]*"[^>]*>([\s\S]*?)<\/p>/g;
    const xlitRegex =
      /<p class="ce-label">\s*<a[^>]*data-iref="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/p>\s*<p class="ce-result"[^>]*>([\s\S]*?)<\/p>/g;
    const pushHits = (re: RegExp, hit_type: Hit["hit_type"]) => {
      for (const m of html.matchAll(re)) {
        const iref = m[1];
        const cite = m[2].trim();
        const markedBody = markSelectedSpans(m[3]);
        const snippet = stripXmlTags(markedBody);
        const textIdMatch = iref.match(/^([PQX]\d+)/);
        const text_id = textIdMatch ? textIdMatch[1] : iref;
        hits.push({ text_id, iref, citation: cite, snippet, hit_type });
      }
    };
    pushHits(translationRegex, "translation");
    pushHits(xlitRegex, "transliteration");

    const uniqueTexts = new Set(hits.map((h) => h.text_id)).size;
    const shown = hits.slice(0, cap);
    const truncated = hits.length > cap;

    const out = [
      `ORACC search: "${query}" in ${proj}`,
      `${totalHits} hit${totalHits === 1 ? "" : "s"} across ${uniqueTexts} text${uniqueTexts === 1 ? "" : "s"}${
        truncated ? ` (showing first ${cap} of ${hits.length} parsed)` : ` (${hits.length} parsed)`
      }`,
      `Source: ${url}`,
      ``,
      ...shown.map(
        (h, i) => `${String(i + 1).padStart(3, " ")}. [${h.text_id}] ${h.citation}\n     ${h.snippet}`,
      ),
    ];

    const warnings: string[] = [];
    if (truncated) {
      warnings.push(`hits truncated to first ${cap} of ${hits.length} parsed; re-query with a larger max_results.`);
    }
    const unparsed = Math.max(0, totalHits - hits.length);
    if (unparsed > 0) {
      warnings.push(
        `${unparsed} hit${unparsed === 1 ? "" : "s"} reported by ORACC (data-imax) but not parsed — markup variant we don't yet recognize.`,
      );
    }

    return structuredResult(out.join("\n"), {
      schema: SCHEMA,
      data: {
        query,
        project: proj,
        limit: cap,
        total_hits: totalHits,
        unique_texts: uniqueTexts,
        ...(unparsed > 0 ? { unparsed_hits: unparsed } : {}),
        hits: shown,
      },
      provenance: provenance("ORACC", url, VERSION),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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
    const SCHEMA = schemaId("get_oracc_text");
    const res = await oraccHttpsGet(url);
    if (!res.ok) {
      return structuredResult(
        `ORACC fetch failed (${res.status ?? "no-status"}): ${res.error} — ${url}. Check project + text_id (e.g. saao/saa01 + P224485).`,
        {
          schema: SCHEMA,
          data: {
            project: proj,
            text_id,
            found: false,
            error: `upstream-fetch-failed${res.status ? `-${res.status}` : ""}: ${res.error}`,
          },
          provenance: provenance("ORACC", url, VERSION),
          warnings: ["upstream-fetch-failed"],
        },
      );
    }
    const xml = res.body;
    if (!xml || !xml.includes("<TEI")) {
      return structuredResult(
        `No TEI edition found at ${url}. The UPenn mirror returns 200 + empty body for unknown paths — verify project nesting (e.g. 'saao/saa01' not 'saa01') and text_id casing.`,
        {
          schema: SCHEMA,
          data: {
            project: proj,
            text_id,
            found: false,
            error: "no-tei-content (UPenn mirror returns 200 + empty body for unknown paths)",
          },
          provenance: provenance("ORACC", url, VERSION),
        },
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

    const warnings: string[] = [];
    if (xlitTruncated) warnings.push(`transliteration truncated to first ${cap} of ${parsed.transliteration.length} lines.`);
    if (transTruncated) warnings.push(`translation truncated to first ${cap} of ${parsed.translation.length} blocks.`);

    return structuredResult(out.join("\n"), {
      schema: SCHEMA,
      data: {
        project: proj,
        text_id,
        found: true,
        title: parsed.title,
        ...(parsed.cdliId ? { cdli_id: parsed.cdliId } : {}),
        transliteration: {
          line_count: parsed.transliteration.length,
          lines: xlit,
          truncated: xlitTruncated,
        },
        translation: {
          block_count: parsed.translation.length,
          blocks: trans,
          truncated: transTruncated,
        },
      },
      provenance: provenance("ORACC", url, VERSION, {
        citation: parsed.title !== text_id ? parsed.title : undefined,
      }),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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
    const SCHEMA = schemaId("search_fragments");
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
      return structuredResult(
        `eBL fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
        {
          schema: SCHEMA,
          data: {
            query,
            resolved_mode: paramName,
            limit: cap,
            count_returned: 0,
            match_count_total: 0,
            fragments: [],
          },
          provenance: provenance("eBL", url, VERSION),
          warnings: [`upstream-fetch-failed: ${err instanceof Error ? err.message : String(err)}`],
        },
      );
    }
    if (!res.ok) {
      const hint =
        res.status === 422
          ? " The server rejected the parameter — try setting mode explicitly."
          : "";
      return structuredResult(`eBL search returned HTTP ${res.status} for ${url}.${hint}`, {
        schema: SCHEMA,
        data: {
          query,
          resolved_mode: paramName,
          limit: cap,
          count_returned: 0,
          match_count_total: 0,
          fragments: [],
        },
        provenance: provenance("eBL", url, VERSION),
        warnings: [`upstream-http-${res.status}`],
      });
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
      return structuredResult(`No fragments matched ${paramName}="${query}".\nSource: ${url}`, {
        schema: SCHEMA,
        data: {
          query,
          resolved_mode: paramName,
          limit: cap,
          count_returned: 0,
          match_count_total: data.matchCountTotal ?? 0,
          fragments: [],
        },
        provenance: provenance("eBL", url, VERSION),
      });
    }

    const fragmentsStructured = data.items.map((it) => ({
      museum_number: fmtMuseum(it.museumNumber),
      museum_number_obj: {
        prefix: it.museumNumber.prefix,
        number: it.museumNumber.number,
        suffix: it.museumNumber.suffix ?? "",
      },
      match_count: it.matchCount,
      matching_lines: it.matchingLines ?? [],
    }));

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
    return structuredResult(out.join("\n"), {
      schema: SCHEMA,
      data: {
        query,
        resolved_mode: paramName,
        limit: cap,
        count_returned: data.items.length,
        match_count_total: data.matchCountTotal,
        fragments: fragmentsStructured,
      },
      provenance: provenance("eBL", url, VERSION),
    });
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
    const SCHEMA = schemaId("get_fragment");
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
      return structuredResult(
        `eBL fetch failed: ${err instanceof Error ? err.message : String(err)} (${url})`,
        {
          schema: SCHEMA,
          data: {
            museum_number_input: museum_number,
            museum_number_normalized: id,
            found: false,
            error: err instanceof Error ? err.message : String(err),
          },
          provenance: provenance("eBL", url, VERSION),
          warnings: ["upstream-fetch-failed"],
        },
      );
    }
    if (res.status === 404) {
      return structuredResult(
        `No fragment "${museum_number}" (tried ${id}). Use search_fragments to discover valid IDs.`,
        {
          schema: SCHEMA,
          data: {
            museum_number_input: museum_number,
            museum_number_normalized: id,
            found: false,
            error: "eBL 404",
          },
          provenance: provenance("eBL", url, VERSION),
        },
      );
    }
    if (!res.ok) {
      return structuredResult(`eBL returned HTTP ${res.status} for ${url}.`, {
        schema: SCHEMA,
        data: {
          museum_number_input: museum_number,
          museum_number_normalized: id,
          found: false,
          error: `HTTP ${res.status}`,
        },
        provenance: provenance("eBL", url, VERSION),
        warnings: [`upstream-http-${res.status}`],
      });
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

    // Build structured payload.
    const dimsStruct: Record<string, { value: number; note?: string }> = {};
    if (f.length && typeof f.length.value === "number")
      dimsStruct.length = { value: f.length.value, ...(f.length.note ? { note: f.length.note } : {}) };
    if (f.width && typeof f.width.value === "number")
      dimsStruct.width = { value: f.width.value, ...(f.width.note ? { note: f.width.note } : {}) };
    if (f.thickness && typeof f.thickness.value === "number")
      dimsStruct.thickness = { value: f.thickness.value, ...(f.thickness.note ? { note: f.thickness.note } : {}) };

    const joinsStruct = (f.joins ?? []).map((grp) =>
      grp.map((j) => ({
        museum_number: fmtMuseum(j.museumNumber),
        museum_number_obj: {
          prefix: j.museumNumber.prefix,
          number: j.museumNumber.number,
          suffix: j.museumNumber.suffix ?? "",
        },
      })),
    );
    const selfStr = fmtMuseum(f.museumNumber);
    const joinsFlat: string[] = [];
    for (const grp of joinsStruct) {
      for (const m of grp) {
        if (m.museum_number !== selfStr && !joinsFlat.includes(m.museum_number)) {
          joinsFlat.push(m.museum_number);
        }
      }
    }

    const transliterationStruct =
      (f.text?.numberOfLines ?? 0) > 0 && f.text?.lines?.length
        ? (() => {
            const all = f.text!.lines.map((line) => {
              const body = (line.content ?? []).map((c) => c.value).join(" ").trim();
              return `${line.prefix ?? ""} ${body}`.trimEnd();
            });
            const shown = all.slice(0, cap);
            return {
              line_count: f.text!.numberOfLines,
              lines: shown,
              truncated: all.length > cap,
            };
          })()
        : undefined;

    const refsStruct = f.references && f.references.length > 0
      ? {
          count: f.references.length,
          shown: f.references.slice(0, 5).map((r) => ({
            id: r.id,
            ...(r.type ? { type: r.type } : {}),
            ...(r.pages ? { pages: r.pages } : {}),
          })),
        }
      : undefined;

    const scriptStruct: Record<string, string> = {};
    if (f.script?.period && f.script.period !== "None") scriptStruct.period = f.script.period;
    if (f.script?.periodModifier && f.script.periodModifier !== "None")
      scriptStruct.period_modifier = f.script.periodModifier;

    const externalStruct: Record<string, unknown> = {};
    if (f.externalNumbers?.cdliNumber) externalStruct.cdli_number = f.externalNumbers.cdliNumber;
    if (f.externalNumbers?.bmIdNumber) externalStruct.bm_id_number = f.externalNumbers.bmIdNumber;
    if (f.externalNumbers?.oraccNumbers?.length)
      externalStruct.oracc_numbers = f.externalNumbers.oraccNumbers;

    const warnings: string[] = [];
    if (transliterationStruct?.truncated) {
      warnings.push(
        `transliteration truncated to first ${cap} of ${transliterationStruct.line_count} lines.`,
      );
    }
    if (f.references && f.references.length > 5) {
      warnings.push(`references truncated to first 5 of ${f.references.length}.`);
    }

    return structuredResult(lines.join("\n"), {
      schema: SCHEMA,
      data: {
        museum_number_input: museum_number,
        museum_number_normalized: id,
        found: true,
        museum_number: selfStr,
        museum_number_obj: {
          prefix: f.museumNumber.prefix,
          number: f.museumNumber.number,
          suffix: f.museumNumber.suffix ?? "",
        },
        ...(f.publication ? { publication: f.publication.split("\n")[0].trim() } : {}),
        ...(f.description ? { description: f.description } : {}),
        ...(f.collection ? { collection: f.collection } : {}),
        ...(f.museum ? { museum: f.museum } : {}),
        ...(Object.keys(scriptStruct).length > 0 ? { script: scriptStruct } : {}),
        ...(f.genres?.length ? { genres: f.genres.map((g) => g.category) } : {}),
        ...(Object.keys(externalStruct).length > 0 ? { external: externalStruct } : {}),
        ...(Object.keys(dimsStruct).length > 0 ? { dimensions_cm: dimsStruct } : {}),
        ...(joinsStruct.length > 0 ? { joins: joinsStruct, joins_flat: joinsFlat } : {}),
        ...(f.hasPhoto || f.cdliImages?.length
          ? {
              images: {
                ...(typeof f.hasPhoto === "boolean" ? { has_photo: f.hasPhoto } : {}),
                ...(f.cdliImages?.length ? { cdli_images: f.cdliImages } : {}),
              },
            }
          : {}),
        ...(transliterationStruct ? { transliteration: transliterationStruct } : {}),
        ...(refsStruct ? { references: refsStruct } : {}),
      },
      provenance: provenance("eBL", url, VERSION, {
        citation: f.publication ? f.publication.split("\n")[0].trim() : undefined,
      }),
      warnings: warnings.length > 0 ? warnings : undefined,
    });
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
//
// The scorer is a STRUCTURAL-SIMILARITY ranker, not a physical-join finder:
// it surfaces parallel manuscripts (same composition, different MSS),
// structurally similar bilinguals, AND possible physical joins. To help the
// reader disambiguate, we enrich top-K candidates with their genres + known
// joins from eBL's full record, and optionally filter on those.
//
// Enrichment is on-demand (the JSONL cache only holds lineToVec). For each
// call we fetch ≤ 1 + 2k records (target + union of top-k from each
// ranking). Results are cached process-wide so repeat queries are cheap.

type EnrichedRecord = {
  museumNumber: string;
  designation?: string;
  lineToVec?: number[][];
  genres: string[];             // human-readable category paths, e.g. "Literature → Lugal-e"
  genreSet: Set<string>;        // every category name at every level — for overlap test
  joinMembers: Set<string>;     // every museum number in any of this fragment's join groups
  joinGroupsStr: string;        // joined for display, e.g. "BM.1 + BM.2; K.5"
};

const enrichmentCache = new Map<string, EnrichedRecord | null>();

const fmtMnTuple = (x: { prefix: string; number: string; suffix: string }) =>
  `${x.prefix}.${x.number}${x.suffix ? "." + x.suffix : ""}`;

async function fetchEnrichment(mn: string): Promise<EnrichedRecord | null> {
  if (enrichmentCache.has(mn)) return enrichmentCache.get(mn)!;
  const url = `${URLS.EBL_BASE}/fragments/${encodeURIComponent(mn)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  } catch {
    enrichmentCache.set(mn, null);
    return null;
  }
  if (!res.ok) {
    enrichmentCache.set(mn, null);
    return null;
  }
  type FragRec = {
    museumNumber?: { prefix: string; number: string; suffix: string };
    designation?: string;
    lineToVec?: number[][];
    genres?: Array<{ category: string[] }>;
    joins?: Array<Array<{ museumNumber: { prefix: string; number: string; suffix: string } }>>;
  };
  const body = (await res.json()) as FragRec;
  const genres = (body.genres ?? []).map((g) => g.category.join(" → "));
  const genreSet = new Set<string>();
  // Skip "CANONICAL" — it's the universal top-level marker for every
  // curated-corpus fragment in eBL, so it leaks overlap to all pairs and
  // makes require_genre_overlap useless. We keep it in the display path.
  for (const g of body.genres ?? []) {
    for (const c of g.category) {
      if (c !== "CANONICAL") genreSet.add(c);
    }
  }
  const joinMembers = new Set<string>();
  const joinGroupStrs: string[] = [];
  for (const group of body.joins ?? []) {
    const groupStr = group.map((j) => fmtMnTuple(j.museumNumber)).join(" + ");
    if (groupStr) joinGroupStrs.push(groupStr);
    for (const j of group) joinMembers.add(fmtMnTuple(j.museumNumber));
  }
  const rec: EnrichedRecord = {
    museumNumber: body.museumNumber ? fmtMnTuple(body.museumNumber) : mn,
    designation: body.designation,
    lineToVec: Array.isArray(body.lineToVec) ? body.lineToVec : undefined,
    genres,
    genreSet,
    joinMembers,
    joinGroupsStr: joinGroupStrs.join("; "),
  };
  enrichmentCache.set(mn, rec);
  return rec;
}

async function fetchEnrichmentBatch(mns: string[], concurrency = 5): Promise<void> {
  let cursor = 0;
  async function worker() {
    while (cursor < mns.length) {
      const i = cursor++;
      await fetchEnrichment(mns[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, mns.length) }, () => worker()));
}

server.registerTool(
  "find_join_candidates",
  {
    description:
      "Rank eBL fragments by line-structure fingerprint similarity to a target — surfaces parallel manuscripts of the same composition, structurally similar bilinguals, AND possible physical joins (not all hits are joins). Reproduces eBL's /match algorithm locally (lineToVec prefix/suffix overlap, no Auth0). Returns top 15 by raw overlap length and top 15 by ruling-weighted score, with each candidate's genres + known joins surfaced inline.",
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
      filter_known_joins: z
        .boolean()
        .optional()
        .describe(
          "When true, drop candidates already listed in the target's joins[] (the matcher will otherwise re-surface them). Default false.",
        ),
      require_genre_overlap: z
        .boolean()
        .optional()
        .describe(
          "When true, drop candidates that don't share at least one genre category with the target (at any level of the hierarchy). Helpful for separating parallel manuscripts from coincidentally similar bilinguals. Default false.",
        ),
    },
  },
  async ({ museum_number, top_k, filter_known_joins, require_genre_overlap }) => {
    const k = top_k ?? 15;
    const filterJoins = filter_known_joins === true;
    const requireGenre = require_genre_overlap === true;
    const SCHEMA = schemaId("find_join_candidates");
    // Normalize "BM.41255C" → "BM.41255.C" same as get_fragment.
    const normalize = (s: string): string => {
      const m = s.match(/^([A-Za-z]+)\.(\d+[\d\-,]*)([A-Za-z]+)$/);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
    };
    const targetId = normalize(museum_number.trim());

    const { loadCorpus } = await import("./cache.js");
    const { scoreBoth } = await import("./lineToVecScore.js");
    const corpus = await loadCorpus();

    const emptyTargetData = {
      target: { museum_number: targetId, museum_number_input: museum_number },
      top_k: k,
      filters: { filter_known_joins: filterJoins, require_genre_overlap: requireGenre },
      corpus_size: 0,
      top_by_raw_score: [],
      top_by_weighted_score: [],
    };

    if (corpus.missing) {
      return structuredResult(
        `Local corpus cache is empty. Run \`node ${process.argv[1]} --prefetch\` ` +
          `to crawl /fragments/all-signs (~24 minutes, ~7 MB JSONL written to ` +
          `${corpus.cachePath}). Then call find_join_candidates again.`,
        {
          schema: SCHEMA,
          data: emptyTargetData,
          provenance: provenance("local", `local:lineToVecCorpus:${corpus.cachePath}`, VERSION),
          warnings: ["corpus-cache-missing"],
        },
      );
    }

    // Always fetch target's enriched record — we need genres + joins for
    // display and (optionally) filtering. fetchEnrichment also returns
    // lineToVec, so this single call covers the cache-miss path too.
    const targetEnriched = await fetchEnrichment(targetId);
    if (!targetEnriched) {
      // Distinguish "no such fragment" from "couldn't fetch": loadCorpus
      // already proved the cache works, so a null here means HTTP failure or 404.
      return structuredResult(
        `Couldn't fetch eBL record for "${museum_number}" (tried ${targetId}). Use search_fragments to discover valid IDs.`,
        {
          schema: SCHEMA,
          data: { ...emptyTargetData, corpus_size: corpus.fragments.length },
          provenance: provenance("local", `local:lineToVecCorpus:${corpus.cachePath}`, VERSION),
          warnings: ["target-enrichment-failed"],
        },
      );
    }

    // Prefer the target's lineToVec from the corpus (saves no fetch, but
    // proves the corpus was built from the same /fragments/<id> shape).
    const targetCached = corpus.fragments.find((f) => f.museumNumber === targetEnriched.museumNumber);
    const targetLineToVec = targetCached?.lineToVec ?? targetEnriched.lineToVec;
    const targetDesignation = targetCached?.designation ?? targetEnriched.designation;
    if (!targetLineToVec || targetLineToVec.length === 0) {
      return structuredResult(
        `${targetEnriched.museumNumber} has no lineToVec encoding (likely untransliterated). The join matcher cannot score it.`,
        {
          schema: SCHEMA,
          data: {
            ...emptyTargetData,
            target: {
              museum_number: targetEnriched.museumNumber,
              museum_number_input: museum_number,
              ...(targetEnriched.designation ? { designation: targetEnriched.designation } : {}),
            },
            corpus_size: corpus.fragments.length,
          },
          provenance: provenance("local", `local:lineToVecCorpus:${corpus.cachePath}`, VERSION),
          warnings: ["target-has-no-lineToVec"],
        },
      );
    }

    // Score every OTHER fragment in the corpus against the target.
    type RankedHit = { museumNumber: string; designation?: string; score: number; weighted: number };
    const hits: RankedHit[] = [];
    for (const cand of corpus.fragments) {
      if (cand.museumNumber === targetEnriched.museumNumber) continue;
      if (!cand.lineToVec || cand.lineToVec.length === 0) continue;
      const { score, scoreWeighted } = scoreBoth(targetLineToVec, cand.lineToVec);
      if (score === 0 && scoreWeighted === 0) continue;
      hits.push({
        museumNumber: cand.museumNumber,
        designation: cand.designation,
        score,
        weighted: scoreWeighted,
      });
    }

    // Sort once per ranking; take the union of the top-K candidates from
    // each as the enrichment pool. Filters are applied AFTER enrichment,
    // so the returned list can be shorter than K if filtering culls hits.
    const topRawAll = [...hits].sort((a, b) => b.score - a.score);
    const topWeightedAll = [...hits].sort((a, b) => b.weighted - a.weighted);
    const poolSet = new Set<string>();
    for (const h of topRawAll.slice(0, k)) poolSet.add(h.museumNumber);
    for (const h of topWeightedAll.slice(0, k)) poolSet.add(h.museumNumber);
    await fetchEnrichmentBatch([...poolSet], 5);

    const matchesFilters = (mn: string): boolean => {
      if (filterJoins && targetEnriched.joinMembers.has(mn)) return false;
      if (requireGenre) {
        const candEnriched = enrichmentCache.get(mn);
        if (!candEnriched) return false; // couldn't enrich → can't prove overlap
        let overlap = false;
        for (const c of candEnriched.genreSet) {
          if (targetEnriched.genreSet.has(c)) {
            overlap = true;
            break;
          }
        }
        if (!overlap) return false;
      }
      return true;
    };

    const topRaw = topRawAll.filter((h) => matchesFilters(h.museumNumber)).slice(0, k);
    const topWeighted = topWeightedAll.filter((h) => matchesFilters(h.museumNumber)).slice(0, k);

    const renderHit = (h: RankedHit, i: number, scoreField: "score" | "weighted"): string[] => {
      const cand = enrichmentCache.get(h.museumNumber);
      const out: string[] = [];
      const scoreLabel = scoreField === "score" ? "score" : "weighted";
      out.push(
        `${String(i + 1).padStart(3, " ")}. ${h.museumNumber.padEnd(20)} ${scoreLabel}=${h[scoreField]}` +
          (h.designation ? `   ${h.designation}` : ""),
      );
      if (cand?.genres.length) out.push(`     genres: ${cand.genres.join("; ")}`);
      if (cand?.joinGroupsStr) out.push(`     joins:  ${cand.joinGroupsStr}`);
      return out;
    };

    const targetHeaderBits: string[] = [];
    if (targetEnriched.genres.length) targetHeaderBits.push(`Target genres: ${targetEnriched.genres.join("; ")}`);
    if (targetEnriched.joinGroupsStr) targetHeaderBits.push(`Target known joins: ${targetEnriched.joinGroupsStr}`);

    const filterNotes: string[] = [];
    if (filterJoins) filterNotes.push(`filter_known_joins=true (${targetEnriched.joinMembers.size} fragments excluded)`);
    if (requireGenre) filterNotes.push(`require_genre_overlap=true (${targetEnriched.genreSet.size} target categories)`);

    const ageMin = corpus.ageMs ? (corpus.ageMs / 60_000).toFixed(1) : "?";
    const lines: string[] = [
      `Structural-similarity candidates for ${targetEnriched.museumNumber}${targetDesignation ? `  (${targetDesignation})` : ""}`,
      `Scored against ${corpus.fragments.length} cached fragments. Cache age: ${ageMin}m. Local lineToVec algorithm, no Auth0.`,
      `Note: hits include parallel manuscripts + structurally similar bilinguals + possible physical joins — disambiguate with the genres/joins below each hit.`,
      ...targetHeaderBits,
      ...(filterNotes.length ? [`Filters: ${filterNotes.join(" · ")}`] : []),
      ``,
      `— TOP ${topRaw.length} BY RAW SCORE (suffix/prefix overlap length) —`,
      ...topRaw.flatMap((h, i) => renderHit(h, i, "score")),
      ``,
      `— TOP ${topWeighted.length} BY WEIGHTED SCORE (rulings count 3-10×, text lines 1×) —`,
      ...topWeighted.flatMap((h, i) => renderHit(h, i, "weighted")),
    ];

    const toCandidate = (h: RankedHit) => {
      const enriched = enrichmentCache.get(h.museumNumber);
      return {
        museum_number: h.museumNumber,
        score: h.score,
        weighted_score: h.weighted,
        ...(h.designation ? { designation: h.designation } : {}),
        ...(enriched?.genres.length ? { genres: enriched.genres } : {}),
        ...(enriched?.joinGroupsStr ? { join_groups_str: enriched.joinGroupsStr } : {}),
      };
    };

    return structuredResult(lines.join("\n"), {
      schema: SCHEMA,
      data: {
        target: {
          museum_number: targetEnriched.museumNumber,
          museum_number_input: museum_number,
          ...(targetDesignation ? { designation: targetDesignation } : {}),
          ...(targetEnriched.genres.length > 0 ? { genres: targetEnriched.genres } : {}),
          ...(targetEnriched.joinMembers.size > 0
            ? { joins_flat: [...targetEnriched.joinMembers].filter((m) => m !== targetEnriched.museumNumber) }
            : {}),
          ...(targetEnriched.joinGroupsStr ? { join_groups_str: targetEnriched.joinGroupsStr } : {}),
        },
        top_k: k,
        filters: { filter_known_joins: filterJoins, require_genre_overlap: requireGenre },
        corpus_size: corpus.fragments.length,
        ...(corpus.ageMs !== null ? { corpus_age_ms: corpus.ageMs } : {}),
        top_by_raw_score: topRaw.map(toCandidate),
        top_by_weighted_score: topWeighted.map(toCandidate),
      },
      provenance: provenance("local", `local:lineToVecCorpus:${corpus.cachePath}`, VERSION),
    });
  },
);

// 9. find_parallel_text — LIVE (sign-trigram Jaccard, no Auth0).
//
// Same shape as find_join_candidates, different signal. Where the lineToVec
// matcher scores fragments on prefix/suffix overlap of a 6-symbol
// line-structure encoding (recall@15 = 3.4% on known eBL joins, measured
// 2026-05-14), this tool scores Jaccard similarity on the actual sign
// sequences — within-line trigrams over eBL's `signs` field. Combined
// across two seeds (seed=42 N=50 baseline + seed=137 N=101 stress test):
// 60/267 = 22.5% recall@15, 95% CI [17%, 28%]. The trigram approach
// strictly dominates (zero lineToVec-only wins) and is ~170× faster to
// score. The seed=42 number alone (25.3%) sat on the optimistic end of
// the distribution.
//
// Why the lift: lineToVec encodes only START/TEXT_LINE/SINGLE_RULING/
// DOUBLE_RULING/TRIPLE_RULING/END markers — useful for catching joins that
// align on rulings, blind to anything else. Sign trigrams use the actual
// cuneiform sign-list tokens (~thousands of distinct values) and so
// discriminate at far higher resolution. The tradeoff: trigrams excel at
// parallel manuscripts (any two copies of Šurpu share many trigrams), so
// some hits are textual parallels rather than physical joins. The genres
// + joins enrichment lines help the reader disambiguate, same as in
// find_join_candidates.
//
// See VALIDATION-2026-05-14.md + TRIGRAM-EXPERIMENT-2026-05-14.md for the
// full benchmark. X-FILTER-EXPERIMENT-2026-05-14.md documents the follow-up
// that landed the ≥2-X trigram filter — same recall@15, but median rank of
// known siblings compressed from 89 to 26.
server.registerTool(
  "find_parallel_text",
  {
    description:
      "Rank fragments by sign-sequence parallel-text similarity to a target (within-line trigram Jaccard over eBL's `signs` field). Validation 2026-05-14 (combined N=151 across two seeds, 267 known siblings): ~22% recall@15 on known eBL joins, 95% CI [17%, 28%] — ~6.5× the lineToVec-based `find_join_candidates`. Surfaces parallel manuscripts AND probable physical joins. Use as the primary parallel/join discovery tool; reserve `find_join_candidates` for cross-validating against eBL's published algorithm.",
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
        .describe("Number of candidates returned (default 15)."),
      filter_known_joins: z
        .boolean()
        .optional()
        .describe(
          "When true, drop candidates already listed in the target's joins[] (the matcher will otherwise re-surface them). Default false.",
        ),
      require_genre_overlap: z
        .boolean()
        .optional()
        .describe(
          "When true, drop candidates that don't share at least one genre category with the target (CANONICAL is excluded since it leaks to every pair). Helpful for separating same-composition parallels from coincidentally text-similar fragments. Default false.",
        ),
    },
  },
  async ({ museum_number, top_k, filter_known_joins, require_genre_overlap }) => {
    const k = top_k ?? 15;
    const filterJoins = filter_known_joins === true;
    const requireGenre = require_genre_overlap === true;
    const SCHEMA = schemaId("find_parallel_text");
    const normalize = (s: string): string => {
      const m = s.match(/^([A-Za-z]+)\.(\d+[\d\-,]*)([A-Za-z]+)$/);
      return m ? `${m[1]}.${m[2]}.${m[3]}` : s;
    };
    const targetId = normalize(museum_number.trim());

    const { loadSignsIndex, trigramsFromSigns, jaccard } = await import(
      "./signsIndex.js"
    );
    const idx = await loadSignsIndex();
    const emptyTargetData = {
      target: { museum_number: targetId, museum_number_input: museum_number },
      top_k: k,
      filters: { filter_known_joins: filterJoins, require_genre_overlap: requireGenre },
      corpus_size: 0,
      candidates: [],
    };
    if (idx.missing) {
      return structuredResult(
        `Sign-trigram index missing. Run \`node scripts/build-signs-index.mjs\` ` +
          `to fetch eBL /fragments/all-signs and write the cache at ` +
          `${idx.cachePath} (one ~26 s request, ~33 MB on disk).`,
        {
          schema: SCHEMA,
          data: emptyTargetData,
          provenance: provenance("local", `local:signTrigramIndex:${idx.cachePath}`, VERSION),
          warnings: ["signs-index-missing"],
        },
      );
    }

    // Resolve target trigrams. Prefer the cached index (saves an HTTP
    // request); fall back to a live /fragments/<id> fetch which gives us
    // both the up-to-date `signs` AND the genres/joins we need anyway.
    const targetEnriched = await fetchEnrichment(targetId);
    if (!targetEnriched) {
      return structuredResult(
        `Couldn't fetch eBL record for "${museum_number}" (tried ${targetId}). Use search_fragments to discover valid IDs.`,
        {
          schema: SCHEMA,
          data: { ...emptyTargetData, corpus_size: idx.fragments.size },
          provenance: provenance("local", `local:signTrigramIndex:${idx.cachePath}`, VERSION),
          warnings: ["target-enrichment-failed"],
        },
      );
    }
    let targetTrigrams = idx.fragments.get(targetEnriched.museumNumber);
    if (!targetTrigrams || targetTrigrams.size === 0) {
      // Re-fetch live signs in case the index is stale for this fragment.
      const liveRes = await fetch(
        `${URLS.EBL_BASE}/fragments/${encodeURIComponent(targetEnriched.museumNumber)}`,
        { headers: { "User-Agent": USER_AGENT } },
      );
      if (liveRes.ok) {
        const liveBody = (await liveRes.json()) as { signs?: string };
        if (typeof liveBody.signs === "string") {
          targetTrigrams = trigramsFromSigns(liveBody.signs);
        }
      }
    }
    if (!targetTrigrams || targetTrigrams.size === 0) {
      return structuredResult(
        `${targetEnriched.museumNumber} has no sign-trigram fingerprint (likely untransliterated or too few signs). The parallel-text matcher cannot score it.`,
        {
          schema: SCHEMA,
          data: {
            ...emptyTargetData,
            target: {
              museum_number: targetEnriched.museumNumber,
              museum_number_input: museum_number,
              ...(targetEnriched.designation ? { designation: targetEnriched.designation } : {}),
            },
            corpus_size: idx.fragments.size,
          },
          provenance: provenance("local", `local:signTrigramIndex:${idx.cachePath}`, VERSION),
          warnings: ["target-has-no-trigrams"],
        },
      );
    }

    // Score every candidate. Track intersection_size + union_size + a
    // deterministic sample of shared trigrams — this is the Phase 2
    // audit surface (scholars can see WHY a candidate matched, not just
    // where it ranked).
    type Hit = {
      museumNumber: string;
      jaccard: number;
      intersection: number;
      union: number;
      candFingerprint: number;
      shared: string[]; // small deterministic sample
    };
    const SHARED_SAMPLE_CAP = 10;
    const hits: Hit[] = [];
    for (const [mn, candSet] of idx.fragments) {
      if (mn === targetEnriched.museumNumber) continue;
      const j = jaccard(targetTrigrams, candSet);
      if (j === 0) continue;
      // Manually compute intersection + sample. Iterate the smaller set
      // for performance (same trick as the jaccard helper).
      const [small, big] =
        targetTrigrams.size <= candSet.size ? [targetTrigrams, candSet] : [candSet, targetTrigrams];
      const sharedAll: string[] = [];
      for (const tri of small) if (big.has(tri)) sharedAll.push(tri);
      sharedAll.sort();
      const shared = sharedAll.slice(0, SHARED_SAMPLE_CAP);
      const intersection = sharedAll.length;
      const union = targetTrigrams.size + candSet.size - intersection;
      hits.push({
        museumNumber: mn,
        jaccard: j,
        intersection,
        union,
        candFingerprint: candSet.size,
        shared,
      });
    }
    hits.sort((a, b) => b.jaccard - a.jaccard);

    const poolMns: string[] = [];
    for (const h of hits.slice(0, k * 3)) {
      poolMns.push(h.museumNumber);
      if (poolMns.length >= k * 3) break;
    }
    await fetchEnrichmentBatch(poolMns, 5);

    const matchesFilters = (mn: string): boolean => {
      if (filterJoins && targetEnriched.joinMembers.has(mn)) return false;
      if (requireGenre) {
        const cand = enrichmentCache.get(mn);
        if (!cand) return false;
        let overlap = false;
        for (const c of cand.genreSet) {
          if (targetEnriched.genreSet.has(c)) {
            overlap = true;
            break;
          }
        }
        if (!overlap) return false;
      }
      return true;
    };

    const top = hits.filter((h) => matchesFilters(h.museumNumber)).slice(0, k);

    const renderHit = (h: Hit, i: number): string[] => {
      const cand = enrichmentCache.get(h.museumNumber);
      const out: string[] = [];
      out.push(
        `${String(i + 1).padStart(3, " ")}. ${h.museumNumber.padEnd(20)} jaccard=${h.jaccard.toFixed(4)} ` +
          `(∩=${h.intersection}, ∪=${h.union})` +
          (cand?.designation ? `   ${cand.designation}` : ""),
      );
      if (cand?.genres.length) out.push(`     genres: ${cand.genres.join("; ")}`);
      if (cand?.joinGroupsStr) out.push(`     joins:  ${cand.joinGroupsStr}`);
      return out;
    };

    const targetHeaderBits: string[] = [];
    if (targetEnriched.genres.length) targetHeaderBits.push(`Target genres: ${targetEnriched.genres.join("; ")}`);
    if (targetEnriched.joinGroupsStr) targetHeaderBits.push(`Target known joins: ${targetEnriched.joinGroupsStr}`);

    const filterNotes: string[] = [];
    if (filterJoins) filterNotes.push(`filter_known_joins=true (${targetEnriched.joinMembers.size} fragments excluded)`);
    if (requireGenre) filterNotes.push(`require_genre_overlap=true (${targetEnriched.genreSet.size} target categories)`);

    const ageMin = idx.ageMs ? (idx.ageMs / 60_000).toFixed(1) : "?";
    const lines: string[] = [
      `Parallel-text candidates for ${targetEnriched.museumNumber}${targetEnriched.designation ? `  (${targetEnriched.designation})` : ""}`,
      `Scored against ${idx.fragments.size} cached fragments by sign-trigram Jaccard. Cache age: ${ageMin}m. Target fingerprint: ${targetTrigrams.size} unique trigrams.`,
      `Note: hits include parallel manuscripts + probable physical joins + coincidentally text-similar fragments — disambiguate with the genres/joins below each hit.`,
      `Audit fields: ∩ = intersection size (shared trigrams), ∪ = union size. structuredContent.candidates[*].shared_trigrams_sample carries up to 10 matched trigrams.`,
      ...targetHeaderBits,
      ...(filterNotes.length ? [`Filters: ${filterNotes.join(" · ")}`] : []),
      ``,
      `— TOP ${top.length} BY JACCARD —`,
      ...top.flatMap((h, i) => renderHit(h, i)),
    ];

    return structuredResult(lines.join("\n"), {
      schema: SCHEMA,
      data: {
        target: {
          museum_number: targetEnriched.museumNumber,
          museum_number_input: museum_number,
          ...(targetEnriched.designation ? { designation: targetEnriched.designation } : {}),
          ...(targetEnriched.genres.length > 0 ? { genres: targetEnriched.genres } : {}),
          ...(targetEnriched.joinMembers.size > 0
            ? { joins_flat: [...targetEnriched.joinMembers].filter((m) => m !== targetEnriched.museumNumber) }
            : {}),
          ...(targetEnriched.joinGroupsStr ? { join_groups_str: targetEnriched.joinGroupsStr } : {}),
        },
        target_fingerprint_size: targetTrigrams.size,
        top_k: k,
        filters: { filter_known_joins: filterJoins, require_genre_overlap: requireGenre },
        corpus_size: idx.fragments.size,
        ...(idx.ageMs !== null ? { corpus_age_ms: idx.ageMs } : {}),
        candidates: top.map((h) => {
          const enr = enrichmentCache.get(h.museumNumber);
          return {
            museum_number: h.museumNumber,
            jaccard: h.jaccard,
            intersection_size: h.intersection,
            union_size: h.union,
            candidate_fingerprint_size: h.candFingerprint,
            shared_trigrams_sample: h.shared,
            ...(enr?.designation ? { designation: enr.designation } : {}),
            ...(enr?.genres.length ? { genres: enr.genres } : {}),
            ...(enr?.joinGroupsStr ? { join_groups_str: enr.joinGroupsStr } : {}),
          };
        }),
      },
      provenance: provenance("local", `local:signTrigramIndex:${idx.cachePath}`, VERSION),
    });
  },
);

// ---------------------------------------------------------------------------
// v0.6 comparative-religion tools
//
// Three curated-local tools surfacing Mesopotamian / Hebrew antediluvian-
// wisdom parallels. Underlying data is in /data/*.json; discipline: every
// comparative claim names the scholar(s) who established it.
// ---------------------------------------------------------------------------

server.registerTool(
  "compare_flood_narratives",
  {
    description:
      "Return an episode × witness alignment matrix for the four major Ancient Near Eastern flood narratives: Sumerian Ziusudra story (Nippur OB), Akkadian Atra-ḫasīs (Lambert & Millard 1969), Gilgamesh Tablet XI (George 2003), Hebrew Genesis 6-9 (BHS/MT). Episodes drawn from a controlled vocabulary: creation_of_humanity, overpopulation, divine_decision, forewarning, ark_construction, the_flood, landfall, sacrifice, aftermath, new_order. Each cell carries citation + excerpt + scholarly_anchor + divergence_notes + philological_uncertainty. Use for comparative-religion work and Genesis-6-9 source-critical background.",
    inputSchema: {
      episodes: z
        .array(
          z.enum([
            "creation_of_humanity",
            "overpopulation",
            "divine_decision",
            "forewarning",
            "ark_construction",
            "the_flood",
            "landfall",
            "sacrifice",
            "aftermath",
            "new_order",
          ]),
        )
        .optional()
        .describe("Episodes to include. Omit to return all ten episodes."),
      witnesses: z
        .array(z.enum(["sumerian_ziusudra", "atrahasis", "gilgamesh_xi", "genesis_6_9"]))
        .optional()
        .describe("Witnesses to include. Omit to return all four."),
    },
  },
  async ({ episodes, witnesses }) => {
    const SCHEMA = schemaId("compare_flood_narratives");
    const result = compareFloodNarratives({ episodes, witnesses });
    return structuredResult(renderFloodMatrix(result), {
      schema: SCHEMA,
      data: result,
      provenance: provenance("local", "local:floodNarrativeIndex", VERSION, {
        citation: "Lambert & Millard 1969; George 2003; Westermann 1984",
      }),
    });
  },
);

server.registerTool(
  "find_antediluvian_parallel",
  {
    description:
      "Take a passage from a Jewish/Christian antediluvian-wisdom text (1 Enoch / Jubilees / Genesis 5-6 / Wisdom of Solomon / Ben Sira) and return ranked Mesopotamian source-candidates that comparative-religion scholarship has identified as parallels. Each result names the scholar(s) who established the parallel (Lambert 1967, Kvanvig 1988, Annus 2010, etc.). Discipline: no scholar, no result. Use for Second Temple Judaism / Genesis source-critical work.",
    inputSchema: {
      text_id: z
        .enum(["1_enoch", "jubilees", "genesis", "wisdom_of_solomon", "ben_sira"])
        .describe("Source text. 1_enoch covers the full pentaboroughs of 1 Enoch."),
      passage: z
        .string()
        .optional()
        .describe("Canonical passage reference. E.g. 'Genesis 5:21-24', '1 Enoch 6:1-2'. Either passage or topic should be supplied."),
      topic: z
        .string()
        .optional()
        .describe("Topic-keyword if a specific passage is not known. E.g. 'seventh_patriarch_ascent', 'fallen_angels_teaching_arts', 'nephilim_origin'."),
    },
  },
  async ({ text_id, passage, topic }) => {
    const SCHEMA = schemaId("find_antediluvian_parallel");
    if (!passage && !topic) {
      const queries = listAntediluvianQueries();
      const lines = [
        "find_antediluvian_parallel: supply either `passage` or `topic`.",
        "",
        "Curated queries available:",
        ...queries.map((q) => `  • ${q.text_id} — passages: [${q.passages.join(", ")}]  topics: [${q.topics.join(", ")}]`),
      ];
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: { query: { text_id }, results: [] },
        provenance: provenance("local", "local:antediluvianParallelIndex", VERSION),
        warnings: ["missing-query-parameter"],
      });
    }
    const entry = findAntediluvianParallel({ text_id, passage, topic });
    const text = renderParallelEntry(entry, { text_id, passage, topic });
    if (!entry) {
      return structuredResult(text, {
        schema: SCHEMA,
        data: { query: { text_id, ...(passage ? { passage } : {}), ...(topic ? { topic } : {}) }, results: [] },
        provenance: provenance("local", "local:antediluvianParallelIndex", VERSION),
        warnings: ["no-curated-parallel-for-query"],
      });
    }
    return structuredResult(text, {
      schema: SCHEMA,
      data: {
        query: { text_id, ...(passage ? { passage } : {}), ...(topic ? { topic } : {}) },
        passage_text: entry.passage_text,
        passage_translator: entry.passage_translator,
        results: entry.results,
      },
      provenance: provenance("local", "local:antediluvianParallelIndex", VERSION, {
        citation: "Lambert 1967; Kvanvig 1988; Annus 2010; Reed 2005",
      }),
    });
  },
);

server.registerTool(
  "apkallu_attestations",
  {
    description:
      "Surface named occurrences of the seven antediluvian apkallū (and four postdiluvian successor ummânū) across the cuneiform and Hellenistic textual record. Per-sage entries include: paired antediluvian king (Uruk List of Kings and Sages), discipline specialization where attested, attestations across source-types (Bīt Mēseri ritual text, Uruk List scholarly list, Berossus Hellenistic excerpt, palace reliefs, figurine deposits), and iconographic form (fish_cloaked / bird_headed_griffin / human_form / figurine / composite). Curated from Reiner 1961, Lenzi 2008, Annus 2010, Verderame 2013.",
    inputSchema: {
      sage_name: z
        .string()
        .optional()
        .describe("Specific sage name. E.g. 'Uanna', 'Adapa', 'Utuabzu'. Omit to return all sages."),
      include_iconography: z
        .boolean()
        .optional()
        .describe("Include iconographic-form data on visual attestations. Default true."),
      include_postdiluvian: z
        .boolean()
        .optional()
        .describe("Include the four postdiluvian ummânū (Nungalpirigal, Piriggalnungal, Piriggalabsu, Lu-Nanna). Default true."),
    },
  },
  async ({ sage_name, include_iconography, include_postdiluvian }) => {
    const SCHEMA = schemaId("apkallu_attestations");
    const result = apkalluAttestations({ sage_name, include_iconography, include_postdiluvian });
    const queryEcho: Record<string, unknown> = {};
    if (sage_name) queryEcho.sage_name = sage_name;
    if (include_iconography !== undefined) queryEcho.include_iconography = include_iconography;
    if (include_postdiluvian !== undefined) queryEcho.include_postdiluvian = include_postdiluvian;
    return structuredResult(renderApkalluSages(result), {
      schema: SCHEMA,
      data: { query: queryEcho, sages: result.sages },
      provenance: provenance("local", "local:apkalluAttestationIndex", VERSION, {
        citation: "Reiner 1961; Lenzi 2008; Annus 2010; Verderame 2013",
      }),
    });
  },
);

// ---------------------------------------------------------------------------
// v0.7 Discovery Engine — the generative comparative-religion tool
//
// Inverts the v0.6 discipline: where find_antediluvian_parallel REQUIRES
// named scholarly attribution, discover_parallel_candidates RETURNS
// machine-discovered parallels with `discovered_by: 'ai_traversal'` and
// `validation_status: 'pending'`. Each candidate carries a discovery_trace
// (supporting briefs, structural features, reasoning summary) so the
// proposed parallel is auditable back to the corpus.
//
// Underlying dataset: data/discoveredCandidates.json — produced by a
// one-time AI traversal of the 24-brief corpus + 3 curated v0.6 datasets
// on 2026-05-15. Pre-existing curated parallels are filtered out at
// discovery time; only NEW candidates surface.
// ---------------------------------------------------------------------------

server.registerTool(
  "discover_parallel_candidates",
  {
    description:
      "Return machine-discovered comparative-religion parallel candidates from the cuneiform-mcp curated corpus, with full provenance trace. The v0.7 Discovery Engine: inverts the v0.6 discipline by RETURNING parallels WITHOUT named scholarly attribution — each candidate carries `discovered_by: 'ai_traversal'`, `validation_status: 'pending'`, and a structural-reasoning trace. Use this for hypothesis-generation; promote validated candidates to find_antediluvian_parallel once a human scholar confirms the parallel. Backed by 230-entity inventory across 24 briefs.",
    inputSchema: {
      min_confidence: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum confidence threshold (0-1). Default 0.3 surfaces all confidently-scored candidates; raise to 0.6+ for only the strongest."),
      parallel_type: z
        .enum(["structural", "lexical", "narrative", "topos", "onomastic", "iconographic", "all"])
        .optional()
        .describe("Filter by parallel type. Default 'all'."),
      validation_status: z
        .enum(["pending", "validated", "rejected", "all"])
        .optional()
        .describe("Filter by validation status. Default 'pending' (the new candidates queue)."),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Cap on results. Default 25."),
    },
  },
  async ({ min_confidence, parallel_type, validation_status, max_results }) => {
    const SCHEMA = schemaId("discover_parallel_candidates");
    const result = discoverParallelCandidates({
      min_confidence,
      parallel_type,
      validation_status,
      max_results,
    });
    return structuredResult(renderDiscoveredCandidates(result), {
      schema: SCHEMA,
      data: result,
      provenance: provenance("local", "local:discoveredCandidatesIndex", VERSION, {
        citation: "Machine-discovered via cuneiform-mcp v0.7.0 traversal of 24-brief corpus 2026-05-15. ALL CANDIDATES PENDING HUMAN-SCHOLAR VALIDATION.",
      }),
    });
  },
);

// ---------------------------------------------------------------------------
// v0.8 Mesopotamian-internal parallel retrieval
//
// Sibling to v0.6's find_antediluvian_parallel but for cross-Mesopotamian
// parallels (Sumerian↔Akkadian, Akkadian↔Ugaritic, Hurrian↔Akkadian) that
// don't anchor to a Jewish biblical passage. Same named-scholarship
// discipline — REQUIRES scholarly_attribution. Query by deity, theme,
// tradition-pair, or text.
//
// v0.8.0 dataset ships with 6 parallels promoted from Discovery Engine
// v0.7 validation pipeline (Chaoskampf, Ninurta↔Marduk substitution,
// Hannahanna↔Bēlet-ilī, named-authorship tradition, Lagash↔SKL king-list
// dissent, descent-and-ascent paired motif).
// ---------------------------------------------------------------------------

server.registerTool(
  "find_mesopotamian_parallel",
  {
    description:
      "Return curated cross-Mesopotamian-internal parallels (Sumerian↔Akkadian, Akkadian↔Ugaritic, Hurrian↔Akkadian, Akkadian↔Akkadian, etc.) WITHOUT requiring a Jewish/Christian biblical passage as the entry-point. Sibling to v0.6's find_antediluvian_parallel — same named-scholarship discipline (scholarly_attribution.minItems: 1 enforced). Query filters AND-combine: deity_name + theme + tradition_pair + text_name. v0.8.0 dataset ships with 6 parallels promoted from the Discovery Engine v0.7 validation pipeline.",
    inputSchema: {
      deity_name: z
        .string()
        .optional()
        .describe("Filter results that mention this deity (case-insensitive substring match against per-result deities[]). E.g. 'Marduk', 'Inanna', 'Bēlet-ilī'."),
      theme: z
        .string()
        .optional()
        .describe("Filter by theme tag (matches against themes[]). Common themes: chaoskampf, cosmogonic_combat, divine_substitution, mother_goddess, named_authorship, king_list_dissent, descent_ascent, succession."),
      tradition_pair: z
        .string()
        .optional()
        .describe("Filter by tradition pair, order-insensitive. E.g. 'akkadian↔ugaritic', 'sumerian↔akkadian', 'hurrian_hittite↔akkadian'. Separator can be ↔, <->, <=>, ⇔, --, —, or comma."),
      text_name: z
        .string()
        .optional()
        .describe("Filter by text name (substring match). E.g. 'Enūma Eliš', 'Baal Cycle', 'Erra Epic', 'lugal-e'."),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Cap on results. Default 25."),
    },
  },
  async ({ deity_name, theme, tradition_pair, text_name, max_results }) => {
    const SCHEMA = schemaId("find_mesopotamian_parallel");
    const result = findMesopotamianParallel({
      deity_name,
      theme,
      tradition_pair,
      text_name,
      max_results,
    });
    return structuredResult(renderMesopotamianParallels(result), {
      schema: SCHEMA,
      data: result,
      provenance: provenance("local", "local:mesopotamianParallelsIndex", VERSION, {
        citation: "Curated dataset; each parallel carries named scholarly_attribution",
      }),
    });
  },
);

// ---------------------------------------------------------------------------
// v0.13 Discovery Engine v2.0 — Primary-source corpus traversal
//
// Sibling to v0.7's discover_parallel_candidates (which traversed 48
// secondary-literature briefs and rediscovered published scholar arguments).
// v0.13 traverses the eBL primary-source corpus (~36K tablets in cache) at
// scale that no human scholar can read exhaustively, surfacing sign-trigram
// Jaccard matches as candidate parallels. v0.13.0 MVP runs Mode A (lexical
// reuse) without cross-boundary metadata filtering; Mode B (cross-genre /
// cross-period / cross-city filtering) requires per-tablet metadata
// enrichment, deferred to v0.13.x.
//
// Underlying dataset: data/primarySourceParallels.json — produced by
// scripts/discovery-primary-v2.mjs running against ~/.cache/cuneiform-mcp/
// all-signs-full.json cached corpus.
// ---------------------------------------------------------------------------

server.registerTool(
  "discover_primary_source_parallels",
  {
    description:
      "Return primary-source cuneiform-corpus parallel candidates discovered by the v0.13 Discovery Engine v2.0 sign-trigram Jaccard traversal. Sibling to v0.7's discover_parallel_candidates but targets primary sources (eBL/CDLI/ORACC ~36K tablets) rather than secondary literature. Each candidate carries discovered_by: 'ai_corpus_traversal' + validation_status: 'pending' + match_evidence (jaccard + intersection_size + shared_trigram_sample). Promote to retrieval-tier (or reject as artifact) requires human-scholar review. v0.13.0 MVP: Mode A lexical-reuse only; cross-boundary metadata filtering (Mode B) deferred to v0.13.1 once per-tablet metadata enrichment runs.",
    inputSchema: {
      min_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum Jaccard score (0-1). Default 0 (no filter). >=0.5 = strong overlap."),
      min_novelty: z
        .number()
        .min(0)
        .max(2)
        .optional()
        .describe("Minimum composite novelty score (0-2). In v0.13.0 MVP, novelty_score equals jaccard until metadata enrichment runs. Default 0."),
      cross_genre_only: z
        .boolean()
        .optional()
        .describe("Only return parallels crossing genre boundaries. v0.13.0: always returns 0 results because metadata is not yet enriched."),
      cross_period_only: z
        .boolean()
        .optional()
        .describe("Only return parallels crossing period boundaries. v0.13.0: always returns 0 results because metadata is not yet enriched."),
      validation_status: z
        .enum(["pending", "validated_as_known", "validated_as_novel", "rejected_as_artifact", "all"])
        .optional()
        .describe("Filter by validation status. Default 'all'."),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Cap on results. Default 25."),
    },
  },
  async ({ min_jaccard, min_novelty, cross_genre_only, cross_period_only, validation_status, max_results }) => {
    const SCHEMA = schemaId("discover_primary_source_parallels");
    const result = discoverPrimarySourceParallels({
      min_jaccard,
      min_novelty,
      cross_genre_only,
      cross_period_only,
      validation_status,
      max_results,
    });
    return structuredResult(renderPrimarySourceParallels(result), {
      schema: SCHEMA,
      data: result,
      provenance: provenance("local", "local:primarySourceParallelsIndex", VERSION, {
        citation: "Machine-discovered via cuneiform-mcp v0.13.0 sign-trigram Jaccard traversal of eBL corpus 2026-05-15. ALL CANDIDATES PENDING HUMAN-SCHOLAR VALIDATION.",
      }),
    });
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
      `cuneiform-mcp v${VERSION} smoke OK — 15 tools registered, all live, all emit structuredContent envelopes per PROTOCOL.md (v0.5 corpus + v0.6 retrieval + v0.7 Discovery Engine + v0.8 Mesopotamian-internal + v0.9-v0.12 expansions + v0.13 Primary-Source Discovery Engine v2.0)\n`,
    );
    process.exit(0);
  }
  if (process.argv.includes("--prefetch")) {
    await runPrefetch();
    process.exit(0);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`cuneiform-mcp v${VERSION} listening on stdio (15 tools)\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
