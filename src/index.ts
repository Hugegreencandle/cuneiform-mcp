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
  queryResearch,
  getBrief,
  listBriefs,
  findSynthesisClaims,
  vaultStats,
  knownClusters,
} from "./researchVault.js";
import {
  inferDamagedSigns,
  getCachedSigns,
  indexStats as signInferenceStats,
} from "./signInference.js";
import {
  findBiblicalParallel,
  datasetStats as biblicalParallelsStats,
} from "./biblicalParallels.js";
import {
  findThematicParallel,
  embeddingStats,
  hasTabletEmbedding,
} from "./semanticEmbeddings.js";
import {
  findAnomalousTablets,
  describeAnomaly,
  surfaceStats,
} from "./anomalySurface.js";
import {
  findFuzzyParallels,
  fuzzyIndexStats,
} from "./fuzzyParallels.js";
import {
  reconstructCluster,
} from "./reconstructCluster.js";
import {
  collectionCoverage,
  listCollectionPrefixes,
  findShortFragments,
} from "./collectionCoverage.js";
import {
  restoreLacunaPassage,
  lacunaIndexStats,
} from "./lacunaRestore.js";
import {
  getScribalSignature,
  findSameScribeCandidates,
  scribalIndexStats,
} from "./scribalFingerprint.js";
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

const VERSION = "0.18.6";

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

    const { loadSignsIndex, trigramsFromSigns, trigramsOrderedFromSigns, jaccard } = await import(
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
    let targetTrigramsOrdered = idx.fragmentsOrdered.get(targetEnriched.museumNumber) ?? [];
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
          targetTrigramsOrdered = trigramsOrderedFromSigns(liveBody.signs);
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
      // v0.18.3 run-bonus calibration
      longest_run: number;
      run_bonus: number;
      final_score: number;
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

      // v0.18.3 — longest contiguous run of matching trigrams in the target's
      // ordered position stream. Same pattern as fuzzyParallels v0.18.2.
      let longestRun = 0;
      let currentRun = 0;
      for (const tri of targetTrigramsOrdered) {
        if (candSet.has(tri)) {
          currentRun++;
          if (currentRun > longestRun) longestRun = currentRun;
        } else {
          currentRun = 0;
        }
      }
      // Run-bonus: capped 0.5 lift; normalized by sqrt(target_trigrams).
      const runFactor = Math.min(1, longestRun / Math.max(1, Math.sqrt(targetTrigrams.size)));
      const runBonus = 0.5 * runFactor;
      const finalScore = j * (1 + runBonus);

      hits.push({
        museumNumber: mn,
        jaccard: j,
        intersection,
        union,
        candFingerprint: candSet.size,
        shared,
        longest_run: longestRun,
        run_bonus: +runBonus.toFixed(4),
        final_score: +finalScore.toFixed(4),
      });
    }
    // v0.18.3: rank by final_score (jaccard × run-bonus) instead of bare jaccard
    hits.sort((a, b) => b.final_score - a.final_score);

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
        `${String(i + 1).padStart(3, " ")}. ${h.museumNumber.padEnd(20)} final=${h.final_score.toFixed(4)} ` +
          `jaccard=${h.jaccard.toFixed(4)} run=${h.longest_run} bonus=${h.run_bonus.toFixed(3)} ` +
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

// ─── v0.14.0 — RAG over the cuneiform-research markdown vault ─────────────

server.registerTool(
  "query_research",
  {
    description:
      "Semantic-keyword search over the cuneiform-research vault — ~50 Mesopotamian scholarly briefs (cosmology, theology, royal myth, divination/science, reception, monuments). BM25 retrieval over section-chunked markdown. Each hit returns the chunk text, brief name, section heading, scholarly citations (named Assyriologists like Lambert 2013, George 2003), and a synthesis-flag indicating whether the chunk carries `[my synthesis]` / `[unverified]` markers. Index built lazily on first call from CUNEIFORM_RESEARCH_DIR (default ~/Desktop/Research).",
    inputSchema: {
      query: z
        .string()
        .min(1)
        .describe("The question or phrase to search for. Examples: 'Inanna descent seven gates', 'Tablet of Shamash river preservation', 'apkallu Bīt mēseri figurines'."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Number of top hits to return. Default 6."),
      cluster: z
        .enum(["cosmology", "theology", "royal_myth", "divination_science", "reception_comparative", "monuments", "infrastructure", "uncategorized"])
        .optional()
        .describe("Restrict to one topical cluster. Default: all clusters."),
      brief: z
        .string()
        .optional()
        .describe("Substring filter against brief filenames (case-insensitive). E.g. 'Gilgamesh' to search only Gilgamesh_Epic.md."),
    },
  },
  async ({ query, top_k, cluster, brief }) => {
    const SCHEMA = schemaId("query_research");
    try {
      const hits = queryResearch(query, { topK: top_k, cluster, briefFilter: brief });
      const lines = [
        `Query: "${query}"`,
        cluster ? `Cluster filter: ${cluster}` : null,
        brief ? `Brief filter: ${brief}` : null,
        ``,
        `Hits: ${hits.length}`,
        ``,
      ].filter((l) => l !== null);
      for (const h of hits) {
        const synth = h.chunk.synthesis_flag ? "  [synthesis]" : "";
        lines.push(`— ${h.chunk.brief}.md > ${h.chunk.section_path}   (score ${h.score.toFixed(3)})${synth}`);
        if (h.chunk.scholar_citations.length > 0) {
          lines.push(`  scholars: ${h.chunk.scholar_citations.slice(0, 6).join(", ")}${h.chunk.scholar_citations.length > 6 ? ", …" : ""}`);
        }
        const snippet = h.chunk.text.length > 360 ? h.chunk.text.slice(0, 360).trim() + "…" : h.chunk.text.trim();
        lines.push(`  ${snippet.replace(/\n/g, " ")}`);
        lines.push(``);
      }
      const data = {
        query,
        ...(cluster ? { cluster_filter: cluster } : {}),
        ...(brief ? { brief_filter: brief } : {}),
        hit_count: hits.length,
        hits: hits.map((h) => ({
          brief: h.chunk.brief,
          section_path: h.chunk.section_path,
          text: h.chunk.text,
          score: h.score,
          scholar_citations: h.chunk.scholar_citations,
          synthesis_flag: h.chunk.synthesis_flag,
          cluster: h.chunk.cluster,
        })),
      };
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data,
        provenance: provenance("local", "local:cuneiform-research", VERSION, {
          citation: "BM25 over the cuneiform-research markdown vault. CUNEIFORM_RESEARCH_DIR configurable.",
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`query_research error: ${msg}`, {
        schema: SCHEMA,
        data: { query, hit_count: 0, hits: [] as never[] },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "get_brief",
  {
    description:
      "Retrieve a specific research brief from the cuneiform-research vault by name. Returns paginated chunks (5 chunks per page) with section headings, citation lists, and synthesis-claim flags. Filenames are case-insensitive and the .md suffix is tolerated. Examples: 'Adapa', 'Royal_Descents', 'Tablet_of_Shamash'.",
    inputSchema: {
      name: z.string().min(1).describe("Brief name (without .md suffix). Case-insensitive."),
      page: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("1-indexed page number. 5 chunks per page. Default 1."),
    },
  },
  async ({ name, page }) => {
    const SCHEMA = schemaId("get_brief");
    try {
      const result = getBrief(name, page ?? 1);
      if (!result) {
        const available = listBriefs().map((b) => b.name);
        const near = available.filter((n) => n.toLowerCase().includes(name.toLowerCase().replace(/\.md$/i, ""))).slice(0, 10);
        return structuredResult(
          `Brief "${name}" not found in cuneiform-research vault.\n` +
            (near.length > 0 ? `Near matches: ${near.join(", ")}\n` : "") +
            `Use list_briefs to see all ${available.length} briefs.`,
          {
            schema: SCHEMA,
            data: {
              query: name,
              found: false,
              ...(near.length > 0 ? { available_briefs: near } : {}),
            },
            provenance: provenance("local", "local:cuneiform-research", VERSION),
          },
        );
      }
      const lines = [
        `Brief: ${result.name}.md   (cluster: ${result.cluster})`,
        `Page ${result.page} of ${result.total_pages}   (total chunks: ${result.total_chunks})`,
        ``,
      ];
      for (const c of result.chunks) {
        lines.push(`── ${c.section_path}${c.synthesis_flag ? "   [synthesis]" : ""}`);
        if (c.scholar_citations.length > 0) {
          lines.push(`   scholars: ${c.scholar_citations.slice(0, 8).join(", ")}${c.scholar_citations.length > 8 ? ", …" : ""}`);
        }
        lines.push(``);
        lines.push(c.text.trim());
        lines.push(``);
      }
      const data = {
        query: name,
        found: true,
        name: result.name,
        cluster: result.cluster,
        page: result.page,
        total_pages: result.total_pages,
        total_chunks: result.total_chunks,
        chunks: result.chunks.map((c) => ({
          section_path: c.section_path,
          text: c.text,
          scholar_citations: c.scholar_citations,
          synthesis_flag: c.synthesis_flag,
        })),
      };
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data,
        provenance: provenance("local", "local:cuneiform-research", VERSION),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`get_brief error: ${msg}`, {
        schema: SCHEMA,
        data: { query: name, found: false },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "list_briefs",
  {
    description:
      "Enumerate briefs in the cuneiform-research vault, optionally filtered by topical cluster. Returns per-brief summaries: name, cluster, section count, chunk count, total chars, unique scholarly citation count, and whether the brief contains [my synthesis] claims. Use this to discover what's in the vault before calling query_research or get_brief.",
    inputSchema: {
      cluster: z
        .enum(["cosmology", "theology", "royal_myth", "divination_science", "reception_comparative", "monuments", "infrastructure", "uncategorized"])
        .optional()
        .describe("Restrict to one cluster. Omit to list all briefs across all clusters."),
    },
  },
  async ({ cluster }) => {
    const SCHEMA = schemaId("list_briefs");
    try {
      const briefs = listBriefs(cluster);
      const stats = vaultStats();
      const lines = [
        `cuneiform-research vault — ${stats.dir}`,
        `${stats.briefs} briefs total · ${stats.chunks} chunks · ${stats.total_chars.toLocaleString()} chars`,
        cluster ? `Filter: cluster=${cluster}` : null,
        ``,
        `Briefs (${briefs.length}):`,
        ``,
      ].filter((l) => l !== null);
      for (const b of briefs) {
        const synth = b.has_synthesis_claims ? "  [synthesis]" : "";
        lines.push(`  ${b.name.padEnd(40)} ${b.cluster.padEnd(24)} ${String(b.chunk_count).padStart(3)} chunks · ${String(b.citation_count).padStart(3)} cites${synth}`);
      }
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: {
          cluster_filter: cluster ?? null,
          brief_count: briefs.length,
          briefs,
          clusters_available: knownClusters(),
          vault_stats: {
            dir: stats.dir,
            total_briefs: stats.briefs,
            total_chunks: stats.chunks,
            total_chars: stats.total_chars,
          },
        },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`list_briefs error: ${msg}`, {
        schema: SCHEMA,
        data: { cluster_filter: cluster ?? null, brief_count: 0, briefs: [] as never[], clusters_available: knownClusters() },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_synthesis_claims",
  {
    description:
      "Find all `[my synthesis]` / `[unverified]` / `[Cluster synthesis — my reading]` flagged paragraphs across the cuneiform-research vault. These are the novel interpretive claims the brief author has explicitly marked as their own synthesis (vs. scholarly consensus) — the structural readings worth defending or testing. Optional query string filters to claims relevant to a topic via BM25.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Optional question to filter synthesis claims by BM25 relevance. Omit to return all flagged claims."),
    },
  },
  async ({ query }) => {
    const SCHEMA = schemaId("find_synthesis_claims");
    try {
      const claims = findSynthesisClaims(query);
      const lines = [
        query ? `Query: "${query}"` : `All synthesis-flagged claims:`,
        ``,
        `Claims: ${claims.length}`,
        ``,
      ];
      for (const c of claims) {
        lines.push(`── ${c.brief}.md > ${c.section_path}   ${c.marker}`);
        const trimmed = c.paragraph.length > 500 ? c.paragraph.slice(0, 500).trim() + "…" : c.paragraph.trim();
        lines.push(trimmed.replace(/\n/g, " "));
        lines.push(``);
      }
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: { query: query ?? null, claim_count: claims.length, claims },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_synthesis_claims error: ${msg}`, {
        schema: SCHEMA,
        data: { query: query ?? null, claim_count: 0, claims: [] as never[] },
        provenance: provenance("local", "local:cuneiform-research", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.14.2 — Damaged-Tablet Sign-Inference Engine ────────────────────────

server.registerTool(
  "infer_damaged_sign",
  {
    description:
      "For each `X` damaged-position token in an eBL transliteration, suggest the most-probable sign based on bigram context across the 36,498-tablet sign corpus. Scoring: geometric mean of P(sign | prev_sign) × P(sign | next_sign) with Laplace smoothing, plus optional period/genre conditioning from the v0.13.1 tablet metadata. Input either a museum number (e.g. 'K.3982') to fetch the cached signs, or a raw signs string. Index built lazily on first call (~3 sec), then cached. Useful for scholarly join/parallel work where you have a partial tablet and want to know what likely fills the gaps.",
    inputSchema: {
      tablet_id: z
        .string()
        .optional()
        .describe("Museum number to fetch signs for (e.g., 'K.3982', 'BM.41255.C'). Mutually exclusive with `signs`."),
      signs: z
        .string()
        .optional()
        .describe("Raw signs string (whitespace + newline separated tokens, with `X` marking damaged positions). Mutually exclusive with `tablet_id`."),
      position: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Specific position to infer (0-indexed token position). If omitted, all X positions in the input are inferred."),
      period: z
        .enum(["Old_Akkadian", "Ur_III", "Old_Babylonian", "Old_Assyrian", "Middle_Babylonian", "Middle_Assyrian", "Neo_Assyrian", "Neo_Babylonian", "Late_Babylonian", "Hellenistic"])
        .optional()
        .describe("Period to condition the inference on (boosts signs typical of that period). Only effective when the period is represented in v0.13.1 tablet metadata."),
      genre: z
        .enum(["literary", "divinatory", "magical_ritual", "lexical", "administrative", "mathematical", "astronomical", "royal_inscription", "technical"])
        .optional()
        .describe("Genre to condition the inference on. Only effective when the genre is represented in v0.13.1 tablet metadata."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Number of candidates returned per damaged position. Default 8."),
      candidate_pool: z
        .enum(["intersection", "union", "next_of_prev", "prev_of_next"])
        .optional()
        .describe("How to assemble the candidate pool. `intersection` (default, strictest): signs that follow `prev_sign` AND precede `next_sign`. Falls back to union if the intersection is empty. `union`: all candidates from either side. `next_of_prev`/`prev_of_next`: one side only (use when the other side is unavailable)."),
    },
  },
  async ({ tablet_id, signs, position, period, genre, top_k, candidate_pool }) => {
    const SCHEMA = schemaId("infer_damaged_sign");
    try {
      // Resolve signs source
      let signsRaw: string;
      let resolvedTabletId: string | null = null;
      if (tablet_id) {
        const cached = getCachedSigns(tablet_id);
        if (!cached) {
          return structuredResult(
            `tablet_id '${tablet_id}' not found in the sign cache. Either the museum number is unknown or the cache hasn't been built. Run --prefetch or pass \`signs\` directly.`,
            {
              schema: SCHEMA,
              data: {
                tablet_id,
                input_signs_length: 0,
                damaged_positions: [] as number[],
                inferences: [] as never[],
                conditioning: { applied: false },
                index_stats: signInferenceStats(),
                warnings: [`tablet_id '${tablet_id}' not in cache`],
              },
              provenance: provenance("local", `local:sign-inference:${tablet_id}`, VERSION),
            },
          );
        }
        signsRaw = cached;
        resolvedTabletId = tablet_id;
      } else if (signs) {
        signsRaw = signs;
      } else {
        throw new Error("must provide either tablet_id or signs");
      }

      const result = inferDamagedSigns(signsRaw, {
        position,
        period,
        genre,
        topK: top_k,
        candidatePool: candidate_pool,
      });

      // Render
      const lines = [
        resolvedTabletId ? `Tablet: ${resolvedTabletId}` : "Inline signs input",
        `Tokens: ${result.input_signs_length} · Damaged positions: ${result.damaged_positions.length}`,
        period || genre ? `Conditioning: period=${period ?? "—"}, genre=${genre ?? "—"} (applied: ${result.conditioning.applied})` : null,
        `Index: ${result.index_stats.total_tablets} tablets · ${result.index_stats.bigram_pairs.toLocaleString()} bigram pairs · ${result.index_stats.distinct_signs} distinct signs`,
        ``,
      ].filter((l) => l !== null);
      for (const inf of result.inferences) {
        lines.push(`── position ${inf.position}: ${inf.context.snippet}`);
        if (inf.context.prev_sign) lines.push(`   prev: ${inf.context.prev_sign}`);
        if (inf.context.next_sign) lines.push(`   next: ${inf.context.next_sign}`);
        for (const c of inf.candidates) {
          lines.push(`   ${c.sign.padEnd(16)} score=${c.score.toFixed(5)}  (fwd ${c.evidence.forward_prob.toFixed(4)} from ${c.evidence.forward_count} · bwd ${c.evidence.backward_prob.toFixed(4)} from ${c.evidence.backward_count} · total ${c.evidence.total_corpus_count})`);
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) {
        lines.push(`Warnings: ${result.warnings.join("; ")}`);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: { tablet_id: resolvedTabletId, ...result },
        provenance: provenance("local", "local:sign-inference-bigram-index", VERSION, {
          citation: "Bigram inference over eBL all-signs-full.json corpus (36,498 tablets). v0.14.2.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`infer_damaged_sign error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id: tablet_id ?? null,
          input_signs_length: 0,
          damaged_positions: [] as never[],
          inferences: [] as never[],
          conditioning: { applied: false },
          index_stats: { total_tablets: 0, total_signs: 0, distinct_signs: 0, bigram_pairs: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:sign-inference-bigram-index", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.14.3 — Mesopotamian ↔ Hebrew Bible parallel finder ─────────────────

server.registerTool(
  "find_biblical_parallel",
  {
    description:
      "Find Mesopotamian textual parallels to a Hebrew Bible passage, theme, or Mesopotamian source. Returns canonical scholarly parallels from a curated dataset (15 parallels staged 2026-05-16) with named-Assyriologist attribution, transmission hypothesis, shared narrative elements, and pointers to the relevant brief in the cuneiform-research vault. Coverage: Flood (Gen 6-9 ↔ Atrahasis + Gilgamesh XI + Berossus), Creation (Gen 1 ↔ Enuma Elish), Eden (Gen 2-3 ↔ Adapa), Babel (Gen 11 ↔ Etemenanki), Theodicy (Job ↔ Babylonian Theodicy + Ludlul), Vanity (Eccl ↔ Šiduri's speech + Šamaš Hymn), Daniel 7 beasts ↔ Enuma Elish + Anzu, Ezekiel 1 throne-chariot ↔ Apkallū iconography, Leviathan ↔ Tiamat + Lotan, Song of Songs ↔ Inanna-Dumuzi sacred-marriage, Isaiah 14 hubris fall ↔ Mesopotamian royal-deification, Proverbs ↔ Sumerian + Akkadian wisdom, plant of life, sacrifice/gods-as-flies, healing serpent. Use `get_brief` with the returned `brief_in_vault` field to read the fuller scholarly context.",
    inputSchema: {
      biblical_reference: z
        .string()
        .optional()
        .describe("A Hebrew Bible reference. Tolerant of abbreviations: 'Gen 6:9', 'Genesis 6', 'Job 3', 'Eccl 1:9', 'Isa 14', 'Daniel 7', 'Ezekiel 1'."),
      theme: z
        .string()
        .optional()
        .describe("A theme to match against parallels: 'flood', 'creation', 'wisdom', 'descent', 'kingship', 'throne-chariot', 'sacred marriage', 'plant of life', 'serpent', 'dragon'."),
      mesopotamian_source: z
        .string()
        .optional()
        .describe("Search by Mesopotamian source: 'Atrahasis', 'Gilgamesh', 'Enuma Elish', 'Adapa', 'Babylonian Theodicy', 'Apkallu', 'Sacred Marriage'."),
      confidence_min: z
        .enum(["weak", "moderate", "strong"])
        .optional()
        .describe("Minimum scholarly-consensus confidence. Default: weak (no filter)."),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe("Cap on results. Default 10."),
    },
  },
  async ({ biblical_reference, theme, mesopotamian_source, confidence_min, max_results }) => {
    const SCHEMA = schemaId("find_biblical_parallel");
    try {
      const result = findBiblicalParallel({
        biblical_reference,
        theme,
        mesopotamian_source,
        confidence_min,
        max_results,
      });

      const lines = [
        biblical_reference ? `Biblical reference: ${biblical_reference}` : null,
        theme ? `Theme: ${theme}` : null,
        mesopotamian_source ? `Mesopotamian source: ${mesopotamian_source}` : null,
        confidence_min ? `Min confidence: ${confidence_min}` : null,
        ``,
        `Matches: ${result.match_count}`,
        ``,
      ].filter((l) => l !== null);
      for (const p of result.parallels) {
        lines.push(`── ${p.id}   [${p.confidence}]`);
        lines.push(`   ${p.biblical.reference} — ${p.biblical.theme}`);
        lines.push(`   Mesopotamian sources:`);
        for (const src of p.mesopotamian_sources) {
          lines.push(`     · ${src.text} (${src.tablet_reference}) → brief: ${src.brief_in_vault}.md`);
        }
        lines.push(`   Shared elements: ${p.shared_elements.length}`);
        lines.push(`   Scholars: ${p.scholarly_attribution.slice(0, 3).join(" · ")}${p.scholarly_attribution.length > 3 ? ` · …(+${p.scholarly_attribution.length - 3} more)` : ""}`);
        lines.push(`   Transmission: ${p.transmission_hypothesis}`);
        lines.push(``);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:biblicalParallels", VERSION, {
          citation: "Curated Mesopotamian ↔ Hebrew Bible parallels dataset. Named-Assyriologist attribution required for every entry. See data/biblicalParallels.json _meta.",
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_biblical_parallel error: ${msg}`, {
        schema: SCHEMA,
        data: { query: { biblical_reference, theme, mesopotamian_source, confidence_min, max_results }, match_count: 0, parallels: [] as never[] },
        provenance: provenance("local", "local:biblicalParallels", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.15.0 — Mode C semantic embeddings (Random Indexing) ────────────────

server.registerTool(
  "find_thematic_parallel",
  {
    description:
      "Find tablets thematically similar to a given tablet using Random-Indexing distributional embeddings over the eBL sign corpus. Unlike `discover_primary_source_parallels` (lexical/trigram-Jaccard) and `find_parallel_text` (line-level n-gram), this tool surfaces siblings that share zero exact trigrams but use signs with similar distributional contexts — i.e., thematic rather than lexical similarity. Method: Sahlgren 2005 Random Indexing, 300-dim, ±3 window, k=8 nonzeros per index vector, deterministic seed. Tablet vectors are IDF-weighted means of sign vectors. Top-30 cosine neighbors precomputed per tablet (built by scripts/build-embeddings.mjs); ~20K tablets in index after MIN_TABLET_SIGNS=20 + v0.14.4 exclusion filter. Pair with `discover_primary_source_parallels` for compound discovery: lexical AND thematic siblings together cover the parallel surface.",
    inputSchema: {
      tablet_id: z
        .string()
        .describe("Museum number of the seed tablet (e.g., 'K.3982', 'BM.41255'). Must be in the embedding index — short tablets (<20 sign tokens) and v0.14.4 exclusions are absent."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("Number of thematic neighbors to return. Default 10. Hard cap 30 (the precomputed neighbor-list depth)."),
      min_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum cosine similarity to include a neighbor. Default 0.5. Random-Indexing cosines are typically 0.6–0.9 for clear thematic siblings, 0.4–0.6 for weak parallels, <0.4 for unrelated tablets."),
      filter_period: z
        .enum(["Old_Akkadian", "Ur_III", "Old_Babylonian", "Old_Assyrian", "Middle_Babylonian", "Middle_Assyrian", "Neo_Assyrian", "Neo_Babylonian", "Late_Babylonian", "Hellenistic"])
        .optional()
        .describe("Optional period filter — only return neighbors whose metadata period matches. Only effective for tablets in v0.13.1 tabletMetadata.json."),
      filter_genre: z
        .enum(["literary", "divinatory", "magical_ritual", "lexical", "administrative", "mathematical", "astronomical", "royal_inscription", "technical"])
        .optional()
        .describe("Optional genre filter. Use for cross-period thematic discovery within a single genre, or for genre-misfit detection by filtering to a genre the seed tablet is NOT classified as."),
    },
  },
  async ({ tablet_id, top_k, min_cosine, filter_period, filter_genre }) => {
    const SCHEMA = schemaId("find_thematic_parallel");
    try {
      const result = findThematicParallel(tablet_id, {
        topK: top_k,
        minCosine: min_cosine,
        filterPeriod: filter_period,
        filterGenre: filter_genre,
      });

      const lines: string[] = [
        `Seed tablet: ${tablet_id}`,
        `Method: ${result.index_stats.method} · dim ${result.index_stats.embedding_dim} · ${result.index_stats.total_tablets} tablets indexed`,
        result.filters_applied.period || result.filters_applied.genre
          ? `Filters: period=${result.filters_applied.period ?? "—"}, genre=${result.filters_applied.genre ?? "—"}`
          : `Filter: min_cosine ≥ ${result.filters_applied.min_cosine}`,
        ``,
        `Thematic neighbors: ${result.neighbors.length}`,
        ``,
      ];
      for (const n of result.neighbors) {
        const tags = [
          n.period ? `period:${n.period}` : null,
          n.genre ? `genre:${n.genre}` : null,
          n.city ? `city:${n.city}` : null,
        ].filter(Boolean);
        lines.push(
          `   ${n.id.padEnd(20)} cos=${n.score.toFixed(4)}${tags.length > 0 ? "  [" + tags.join(" · ") + "]" : ""}${n.designation ? "  — " + n.designation : ""}`,
        );
      }
      if (result.warnings.length > 0) {
        lines.push(``);
        lines.push(`Warnings: ${result.warnings.join("; ")}`);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:semantic-embeddings-random-indexing", VERSION, {
          citation:
            "Sahlgren 2005 Random Indexing over eBL all-signs-full.json corpus. v0.15.0. 300-dim, ±3 window, k=8 nonzeros, deterministic seed.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_thematic_parallel error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id,
          neighbors: [] as never[],
          filters_applied: { min_cosine: min_cosine ?? 0.5, period: filter_period, genre: filter_genre },
          index_stats: embeddingStats(),
          warnings: [msg],
        },
        provenance: provenance("local", "local:semantic-embeddings-random-indexing", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.16.0 — Anomaly Surface (bi-orphan detector + describe + stats) ────

server.registerTool(
  "find_anomalous_tablets",
  {
    description:
      "Surface tablets that don't fit anywhere — candidates for previously-unknown compositions, miscatalogued fragments, or rare witnesses of poorly-attested texts. Joins the corpus-viz lexical-graph (trigram-Jaccard ≥ 0.30) with the v0.15 thematic-embedding index (cosine ≥ 0.5) + tabletMetadata + v0.14.4 exclusions. Discovery thesis: ~88% of tablets are lexical singletons; tablets isolated in BOTH lexical AND thematic spaces (**bi-orphans**) are the highest-priority discovery candidates. Current surface (2026-05-16 build): 167 bi-orphans corpus-wide, 42 with sign_count ≥ 100. Rebuild with `node scripts/build-anomaly-index.mjs` after corpus-viz or v0.15 embeddings change. Pair with describe_anomaly for per-tablet drill-down.",
    inputSchema: {
      anomaly_type: z
        .enum([
          "bi_orphan",
          "lexical_singleton",
          "thematic_orphan",
          "cluster_genre_misfit",
          "cluster_period_misfit",
          "low_lexical_high_thematic",
          "low_thematic_high_lexical",
        ])
        .describe(
          "Anomaly criterion. `bi_orphan` (recommended starter): no lex AND no thematic neighbors — highest-priority. `lexical_singleton`: zero trigram neighbors above min-jaccard=0.30. `thematic_orphan`: max embedding cos < 0.6. `cluster_genre_misfit`: tablet genre ≠ lexical-cluster dominant genre (cluster size ≥ 3, dominant share ≥ 60%). `cluster_period_misfit`: same for period. `low_lexical_high_thematic`: ≤ 1 lex neighbor but ≥ 10 thematic — paraphrase / bilingual / alt-spelling candidate. `low_thematic_high_lexical`: ≥ 5 lex but ≤ 2 thematic — formulaic-text outlier.",
        ),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .max(10000)
        .optional()
        .describe("Minimum sign-token count (excluding X). Default 100. Drops short fragments where methodology is unreliable. Set 0 to disable filtering."),
      period_filter: z
        .enum(["Old_Akkadian", "Ur_III", "Old_Babylonian", "Old_Assyrian", "Middle_Babylonian", "Middle_Assyrian", "Neo_Assyrian", "Neo_Babylonian", "Late_Babylonian", "Hellenistic"])
        .optional()
        .describe("Restrict to tablets with this metadata period (subset that has v0.13.1 metadata)."),
      genre_filter: z
        .enum(["literary", "divinatory", "magical_ritual", "lexical", "administrative", "mathematical", "astronomical", "royal_inscription", "technical"])
        .optional()
        .describe("Restrict to tablets with this metadata genre."),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Cap on results. Default 20."),
    },
  },
  async ({ anomaly_type, min_sign_count, period_filter, genre_filter, max_results }) => {
    const SCHEMA = schemaId("find_anomalous_tablets");
    try {
      const result = findAnomalousTablets({
        anomalyType: anomaly_type,
        minSignCount: min_sign_count,
        periodFilter: period_filter,
        genreFilter: genre_filter,
        maxResults: max_results,
      });

      const lines: string[] = [
        `Anomaly type: ${anomaly_type}`,
        `Filters: min_sign_count=${result.query.min_sign_count}${period_filter ? `, period=${period_filter}` : ""}${genre_filter ? `, genre=${genre_filter}` : ""}`,
        ``,
        `Total matching anomalies: ${result.anomaly_count}`,
        `Returned: ${result.anomalies.length}`,
        ``,
      ];
      for (const a of result.anomalies) {
        const tags = [
          a.metadata.period ? `period:${a.metadata.period}` : null,
          a.metadata.genre ? `genre:${a.metadata.genre}` : null,
          a.metadata.city ? `city:${a.metadata.city}` : null,
        ].filter(Boolean);
        lines.push(`── ${a.tablet_id}   signs=${a.metadata.sign_count}${tags.length ? "  [" + tags.join(" · ") + "]" : ""}`);
        lines.push(
          `   lex: count=${a.scores.lex_count ?? "—"}, max_jaccard=${a.scores.lex_max_jaccard ?? "—"}  ·  them: count=${a.scores.them_count ?? "—"}, max_cos=${a.scores.them_max_cos ?? "—"}`,
        );
        lines.push(`   ${a.interpretation}`);
        lines.push(`   Follow-up: ${a.follow_up}`);
        lines.push(``);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:anomaly-surface", VERSION, {
          citation:
            "Joined index over corpus-viz lexical graph (Jaccard-trigram) + v0.15 Random-Indexing embeddings + tabletMetadata + v0.14.4 exclusions. v0.16.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_anomalous_tablets error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            anomaly_type,
            min_sign_count: min_sign_count ?? 100,
            period_filter,
            genre_filter,
            max_results: max_results ?? 20,
          },
          anomaly_count: 0,
          anomalies: [] as never[],
          index_stats: surfaceStats(),
          warnings: [msg],
        },
        provenance: provenance("local", "local:anomaly-surface", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "describe_anomaly",
  {
    description:
      "For a specific tablet, return a structured anomaly report: lexical + thematic neighbor counts, lexical-cluster membership + dominants, anomaly-flag evaluation across all v0.16 criteria, human-readable reasons, and ordered follow-up steps. Use after `find_anomalous_tablets` to drill into a specific candidate, or to evaluate any tablet known by museum-number for anomaly status.",
    inputSchema: {
      tablet_id: z.string().describe("Museum number (e.g., 'K.3982', 'BM.41255'). Tablet must be present in either the lexical graph or thematic embedding index."),
    },
  },
  async ({ tablet_id }) => {
    const SCHEMA = schemaId("describe_anomaly");
    try {
      const result = describeAnomaly(tablet_id);
      const lines: string[] = [
        `Tablet: ${tablet_id}`,
        `In lex graph: ${result.exists_in_lex_graph} · In thematic index: ${result.exists_in_them_index}`,
        `Sign count: ${result.metadata.sign_count}`,
        result.metadata.period ? `Period: ${result.metadata.period}` : null,
        result.metadata.genre ? `Genre: ${result.metadata.genre}` : null,
        result.metadata.designation ? `Designation: ${result.metadata.designation}` : null,
        ``,
        `Lexical: ${result.lexical.neighbor_count ?? "—"} neighbors (max jaccard ${result.lexical.max_jaccard ?? "—"})`,
        result.lexical.component_id != null
          ? `  component ${result.lexical.component_id}, size ${result.lexical.component_size}, dominant genre: ${result.lexical.component_dominant_genre ?? "—"} (${result.lexical.component_dominant_genre_share ?? "—"})`
          : null,
        `Thematic: ${result.thematic.neighbor_count ?? "—"} neighbors above cos≥0.5 (max cos ${result.thematic.max_cosine ?? "—"})`,
        ``,
        `Flags:`,
        `  bi_orphan:        ${result.flags.is_bi_orphan}`,
        `  lex_singleton:    ${result.flags.is_lex_singleton}`,
        `  thematic_orphan:  ${result.flags.is_them_orphan}`,
        `  genre_misfit:     ${result.flags.is_genre_misfit}`,
        `  period_misfit:    ${result.flags.is_period_misfit}`,
        ``,
        `Reasons:`,
        ...result.reasons.map((r) => `  · ${r}`),
        ``,
        `Follow-up:`,
        ...result.follow_up.map((f) => `  · ${f}`),
        ``,
        `eBL: ${result.ebl_url}`,
      ].filter((l): l is string => l !== null);
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:anomaly-surface", VERSION),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`describe_anomaly error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id,
          exists_in_lex_graph: false,
          exists_in_them_index: false,
          metadata: { sign_count: 0 },
          lexical: { neighbor_count: null, max_jaccard: null, component_id: null, component_size: null },
          thematic: { neighbor_count: null, max_cosine: null },
          flags: {
            is_bi_orphan: false,
            is_lex_singleton: false,
            is_them_orphan: false,
            is_genre_misfit: false,
            is_period_misfit: false,
          },
          reasons: [] as never[],
          follow_up: [] as never[],
          ebl_url: "",
          warnings: [msg],
        },
        provenance: provenance("local", "local:anomaly-surface", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "discovery_surface_stats",
  {
    description:
      "Top-level stats on the v0.16 discovery surface: how many tablets are in each index, how many are lexical singletons, how many are thematic orphans, how many are bi-orphans, and bi-orphan counts bucketed by sign length. Useful for tracking how the discovery surface evolves as the exclusion list + thresholds change. No inputs.",
    inputSchema: {},
  },
  async () => {
    const SCHEMA = schemaId("discovery_surface_stats");
    try {
      const stats = surfaceStats();
      const totals = stats.totals;
      const lines: string[] = [
        `Anomaly index loaded: ${stats.loaded}`,
        stats.generated_at ? `Built: ${stats.generated_at}` : `(not built)`,
        ``,
        `Total tablets considered:     ${totals.tablets}`,
        `In lexical (trigram) graph:   ${totals.in_lex_graph}`,
        `In thematic embedding index:  ${totals.in_them_index}`,
        `In BOTH (intersection):       ${totals.in_both}`,
        ``,
        `Lexical singletons (no jaccard ≥0.30 nbr): ${totals.lex_singletons}`,
        `Thematic orphans (max cos < 0.6):          ${totals.them_orphans}`,
        `BI-ORPHANS (both at once):                 ${totals.bi_orphans}`,
        ``,
        `Bi-orphans by sign-length bucket:`,
      ];
      for (const [bucket, [bi, total]] of Object.entries(stats.bi_orphans_by_length)) {
        lines.push(`  ${bucket.padEnd(10)} ${bi}/${total}`);
      }
      if (stats.load_error) lines.push(``, `Load error: ${stats.load_error}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: stats,
        provenance: provenance("local", "local:anomaly-surface", VERSION),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`discovery_surface_stats error: ${msg}`, {
        schema: SCHEMA,
        data: {
          loaded: false,
          load_error: msg,
          generated_at: null,
          totals: { tablets: 0, in_lex_graph: 0, in_them_index: 0, in_both: 0, lex_singletons: 0, them_orphans: 0, bi_orphans: 0 },
          bi_orphans_by_length: {},
        },
        provenance: provenance("local", "local:anomaly-surface", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.17.0 — Fuzzy trigram-Jaccard parallel finder ───────────────────────

server.registerTool(
  "find_fuzzy_parallels",
  {
    description:
      "Find parallel tablets to a given tablet via fuzzy (1-substitution) trigram matching. Two trigrams match fuzzily if exactly 2 of 3 positions are equal — this catches manuscript siblings whose lexical-trigram-Jaccard is too low because of localized sign-form variants (e.g., the K.2798 ↔ Si.776 pair which shares 12 of the first 14 signs but was missed by exact-trigram-Jaccard due to single-sign substitutions at positions 4 and 5). v0.17 motivation: 2026-05-16 bi-orphan inspection showed this is the #1 false-negative class in v0.16's lexical methodology. Use as a complement to discover_primary_source_parallels (which is strictly exact) when you suspect a missed sibling. Returns up to 5 concrete fuzzy-match examples per candidate.",
    inputSchema: {
      tablet_id: z.string().describe("Museum number of the query tablet (e.g., 'K.2798'). Must be in the eBL signs cache."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of parallel candidates to return. Default 10. Hard cap 50."),
      min_fuzzy_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum fuzzy Jaccard score for inclusion. Default 0.10. Fuzzy Jaccard is typically 1.5-3× higher than exact Jaccard for true manuscript siblings."),
      min_fuzzy_intersect: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum number of fuzzy-matching trigrams. Default 5. Filters out coincidental short overlaps."),
    },
  },
  async ({ tablet_id, top_k, min_fuzzy_jaccard, min_fuzzy_intersect }) => {
    const SCHEMA = schemaId("find_fuzzy_parallels");
    try {
      const result = findFuzzyParallels({
        tabletId: tablet_id,
        topK: top_k,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minFuzzyIntersect: min_fuzzy_intersect,
      });
      const lines: string[] = [
        `Query tablet: ${tablet_id}`,
        `Index: ${result.index_stats.total_tablets_indexed} tablets · query has ${result.index_stats.query_trigram_count} trigrams`,
        `Candidates examined: ${result.index_stats.candidates_examined} · with any fuzzy overlap: ${result.index_stats.candidates_with_overlap}`,
        ``,
        `Fuzzy parallels returned: ${result.parallels.length}`,
        ``,
      ];
      for (const p of result.parallels) {
        const lift = p.exact_jaccard > 0 ? (p.fuzzy_jaccard / p.exact_jaccard).toFixed(2) + "×" : "∞";
        lines.push(`── ${p.tablet_id}`);
        lines.push(`   fuzzy: ${p.fuzzy_intersect}/${p.query_trigrams + p.target_trigrams - p.fuzzy_intersect} = ${p.fuzzy_jaccard}  ·  exact: ${p.exact_intersect}/${p.query_trigrams + p.target_trigrams - p.exact_intersect} = ${p.exact_jaccard}  ·  fuzzy/exact lift: ${lift}`);
        if (p.shared_fuzzy_examples.length > 0) {
          lines.push(`   examples (query → target):`);
          for (const ex of p.shared_fuzzy_examples) {
            lines.push(`     · '${ex.query}' ↔ '${ex.target}'`);
          }
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:fuzzy-trigram-parallels", VERSION, {
          citation:
            "Fuzzy (1-substitution) trigram-Jaccard over the eBL all-signs-full.json corpus. v0.17.0. Catches manuscript siblings missed by exact trigram-Jaccard due to localized sign-form variants.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_fuzzy_parallels error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id,
          parallels: [] as never[],
          index_stats: { total_tablets_indexed: 0, query_trigram_count: 0, candidates_examined: 0, candidates_with_overlap: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:fuzzy-trigram-parallels", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.17.1 — Recursive manuscript-cluster reconstructor ─────────────────

server.registerTool(
  "reconstruct_cluster",
  {
    description:
      "Given a seed tablet, reconstruct the full manuscript-witness cluster by recursively expanding via fuzzy trigram-Jaccard (1-substitution) parallels. Each BFS frontier member's top-K fuzzy parallels are probed; new tablets join the cluster until depth/size caps or frontier exhaustion. Output includes per-member topology (depth from seed, parent that brought it in, fuzzy_j to parent) + the full BFS edge set. Use case: a 2026-05-16 validation showed BM.77056 anchors a 12-tablet cluster spanning BM + K + Sm + CBS collections, where v0.16 atomized THREE separate members as 'bi-orphans' because each was below the exact-J 0.30 threshold. This tool reveals the underlying compositional unity in one call. Pair with find_fuzzy_parallels for ad-hoc probing, reconstruct_cluster for systematic cluster reconstruction.",
    inputSchema: {
      seed_tablet_id: z.string().describe("Museum number of the seed tablet (e.g., 'BM.77056', 'K.2798'). Must be in the eBL signs cache."),
      min_fuzzy_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum fuzzy Jaccard score for cluster membership. Default 0.20. Tighter (e.g., 0.30) yields a smaller core cluster; looser (e.g., 0.10) yields a larger neighborhood."),
      min_fuzzy_intersect: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum fuzzy-matching trigram count. Default 5."),
      max_cluster_size: z
        .number()
        .int()
        .min(2)
        .max(100)
        .optional()
        .describe("Cap on total cluster size (terminates BFS when reached). Default 30."),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("Maximum BFS depth from seed. Default 3. Higher = larger clusters but more compute cost (each depth-2 node adds top_k fuzzy calls)."),
      top_k_per_node: z
        .number()
        .int()
        .min(1)
        .max(30)
        .optional()
        .describe("How many fuzzy parallels to expand per node. Default 12. Lower = tighter cluster, higher = more exploration."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("v0.18.4 quality filter — drop cluster candidates whose anomaly-index sign_count is below this threshold. Default 0 (no filter, backward-compatible with v0.17.1-v0.18.3). Recommended 50-100 to drop marginal-signal fragments (e.g. NZK.set.* sub-cluster surfaced in the BM.77056 validation 2026-05-22 had only 5-8 signs each). Seed is always included regardless of its own sign_count; a warning is emitted if the seed is below threshold."),
    },
  },
  async ({ seed_tablet_id, min_fuzzy_jaccard, min_fuzzy_intersect, max_cluster_size, max_depth, top_k_per_node, min_sign_count }) => {
    const SCHEMA = schemaId("reconstruct_cluster");
    try {
      const result = reconstructCluster({
        seedTabletId: seed_tablet_id,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minFuzzyIntersect: min_fuzzy_intersect,
        maxClusterSize: max_cluster_size,
        maxDepth: max_depth,
        topKPerNode: top_k_per_node,
        minSignCount: min_sign_count,
      });

      const lines: string[] = [
        `Seed: ${seed_tablet_id}`,
        `Cluster size: ${result.cluster_size} · Termination: ${result.termination_reason}`,
        `BFS fuzzy calls: ${result.index_stats.total_fuzzy_calls} · Expanded tablets: ${result.index_stats.expanded_tablets}`,
        `Config: min_J=${result.config.min_fuzzy_jaccard}, min_I=${result.config.min_fuzzy_intersect}, max_size=${result.config.max_cluster_size}, max_depth=${result.config.max_depth}, top_k=${result.config.top_k_per_node}, min_sign_count=${result.config.min_sign_count}`,
        result.config.min_sign_count > 0
          ? `Quality filter: dropped ${result.index_stats.filtered_below_sign_count} candidates below sign_count threshold + ${result.index_stats.filtered_no_sign_count_data} with no anomaly-index data`
          : `Quality filter: disabled (min_sign_count=0)`,
        ``,
        `Depth distribution: ${Object.entries(result.depth_distribution).map(([d, c]) => `d${d}=${c}`).join(", ")}`,
        `Prefix distribution: ${Object.entries(result.prefix_distribution).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p}=${c}`).join(", ")}`,
        `Cross-prefix members: ${result.cross_prefix_count}/${result.cluster_size}`,
        ``,
        `Members (depth · parent · fuzzy_j):`,
      ];
      for (const m of result.cluster_members) {
        if (m.depth === 0) {
          lines.push(`  ${m.tablet_id.padEnd(22)} d=0 (seed)`);
        } else {
          lines.push(`  ${m.tablet_id.padEnd(22)} d=${m.depth}  ← ${m.parent}  fuzzy_j=${m.fuzzy_j_to_parent.toFixed(4)}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:reconstruct-cluster", VERSION, {
          citation:
            "BFS reconstruction of manuscript-witness clusters via fuzzy trigram-Jaccard. v0.17.1. Builds on find_fuzzy_parallels.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`reconstruct_cluster error: ${msg}`, {
        schema: SCHEMA,
        data: {
          seed_tablet: seed_tablet_id,
          cluster_size: 0,
          cluster_members: [] as never[],
          cluster_edges: [] as never[],
          depth_distribution: {},
          prefix_distribution: {},
          cross_prefix_count: 0,
          config: { min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.2, min_fuzzy_intersect: min_fuzzy_intersect ?? 5, max_cluster_size: max_cluster_size ?? 30, max_depth: max_depth ?? 3, top_k_per_node: top_k_per_node ?? 12, min_sign_count: min_sign_count ?? 0 },
          termination_reason: "frontier_exhausted",
          index_stats: { total_fuzzy_calls: 0, expanded_tablets: 0, filtered_below_sign_count: 0, filtered_no_sign_count_data: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:reconstruct-cluster", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.6 — Quality-audit: surface short fragments below threshold ──────

server.registerTool(
  "find_short_fragments",
  {
    description:
      "Quality-audit tool — surface tablets at or below a sign-count threshold. Direct programmatic complement to the v0.18.4 reconstruct_cluster `min_sign_count` filter: where the filter drops short fragments inline at BFS time, this tool exposes the same marginal-signal surface as a queryable view. Motivated by the 2026-05-22 BM.77056 cluster survey's NZK.set.* finding (3 cluster members at 5-8 signs each — too short for reliable fuzzy-Jaccard). Use this tool to (a) pre-audit a prefix before running cluster reconstruction, (b) generate exclusion lists for batch workflows, (c) discover under-cataloged sub-corpora corpus-wide.",
    inputSchema: {
      max_sign_count: z
        .number()
        .int()
        .min(0)
        .describe("Surface tablets with sign_count AT OR BELOW this threshold. E.g. 10 = micro-fragments only; 50 = quality-filter floor recommended for cluster reconstruction; 100 = anomaly-tool default (per methods paper §2.4)."),
      prefix_filter: z
        .array(z.string().min(1))
        .optional()
        .describe("Optional whitelist of museum-collection prefixes to scope the query. E.g. ['NZK'] to inspect the NZK.set.* tablets only; ['BM', 'K'] for the two major British Museum prefixes. Omit to scan the entire corpus."),
      sort_order: z
        .enum(["asc", "desc"])
        .optional()
        .describe("`asc` (default) lists shortest first (the most marginal); `desc` lists longest-under-threshold first (the candidates closest to the threshold)."),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Cap on returned fragments. Default 50. Capped at 500."),
    },
  },
  async ({ max_sign_count, prefix_filter, sort_order, top_n }) => {
    const SCHEMA = schemaId("find_short_fragments");
    try {
      const result = findShortFragments({
        maxSignCount: max_sign_count,
        prefixFilter: prefix_filter,
        sortOrder: sort_order,
        topN: top_n,
      });

      const lines: string[] = [
        `Threshold: sign_count ≤ ${result.query.max_sign_count}${result.query.prefix_filter ? ` · prefixes: [${result.query.prefix_filter.join(", ")}]` : ` · all prefixes`}`,
        `Corpus: ${result.totals.total_tablets_in_index.toLocaleString()} tablets in index · ${result.totals.total_below_threshold.toLocaleString()} below threshold corpus-wide${result.query.prefix_filter ? ` · ${result.totals.total_matching_prefix_filter.toLocaleString()} after prefix filter` : ""}`,
        `Returning: ${result.totals.fragments_returned} fragments (sort: ${result.query.sort_order})`,
        ``,
      ];
      const prefixDist = Object.entries(result.totals.prefix_distribution_below_threshold).sort((a, b) => b[1] - a[1]).slice(0, 15);
      if (prefixDist.length > 0) {
        lines.push(`Prefix distribution (below threshold): ${prefixDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
        lines.push(``);
      }
      lines.push(`Fragment                 signs   lex   them`);
      lines.push(`──────────────────────  ──────  ────  ────`);
      for (const f of result.fragments) {
        lines.push(
          `${f.id.padEnd(22).slice(0, 22)}  ${String(f.sign_count).padStart(6)}  ${f.in_lex_graph ? "  ✓ " : "  - "}  ${f.in_them_index ? "  ✓ " : "  - "}`,
        );
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:short-fragments", VERSION, {
          citation:
            "Quality-audit surface for marginal-signal tablets. v0.18.6. Programmatic complement to reconstruct_cluster's min_sign_count filter (v0.18.4).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_short_fragments error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { max_sign_count: max_sign_count ?? 0, prefix_filter: prefix_filter ?? null, sort_order: sort_order ?? "asc", top_n: top_n ?? 50 },
          fragments: [] as never[],
          totals: { total_tablets_in_index: 0, total_below_threshold: 0, total_matching_prefix_filter: 0, fragments_returned: 0, prefix_distribution_below_threshold: {} },
          warnings: [msg],
        },
        provenance: provenance("local", "local:short-fragments", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.5 — Discovery: list all museum-collection prefixes ──────────────

server.registerTool(
  "list_collection_prefixes",
  {
    description:
      "Discovery tool — returns the full list of distinct museum-collection prefixes in the corpus, ranked by tablet count (or alternative metric), with per-prefix tablet count + total sign count + transliteration coverage. The companion query to coverage_stats_for_collection: this tool answers 'what prefixes exist?' so the user knows what to query coverage_stats with. Useful as the FIRST query in any corpus-exploration session — surfaces the long tail of small collections (NZK, Ashm-1923, etc.) alongside the major prefixes (BM, K, Sm). Default sort is descending by tablet_count.",
    inputSchema: {
      min_tablet_count: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Drop prefixes with fewer than this many tablets. Default 1 (no filter). Use higher values (e.g. 10, 100) to focus on the major collections only."),
      sort_by: z
        .enum(["tablet_count", "total_sign_count", "mean_sign_count", "prefix"])
        .optional()
        .describe("Sort key. Default 'tablet_count'. 'mean_sign_count' surfaces prefixes with the largest average tablets; 'prefix' is alphabetical."),
      sort_order: z
        .enum(["desc", "asc"])
        .optional()
        .describe("Sort direction. Default 'desc' (largest first)."),
      top_n: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Optional cap on returned prefixes. Omit to return all distinct prefixes (typically 30-50)."),
    },
  },
  async ({ min_tablet_count, sort_by, sort_order, top_n }) => {
    const SCHEMA = schemaId("list_collection_prefixes");
    try {
      const result = listCollectionPrefixes({
        minTabletCount: min_tablet_count,
        sortBy: sort_by,
        sortOrder: sort_order,
        topN: top_n ?? null,
      });

      const lines: string[] = [
        `Corpus: ${result.totals.total_tablets.toLocaleString()} tablets across ${result.totals.distinct_prefixes} distinct prefixes (${result.totals.total_signs.toLocaleString()} total signs)`,
        `Query: sort_by=${result.query.sort_by} ${result.query.sort_order}, min_tablet_count=${result.query.min_tablet_count}${result.query.top_n ? `, top_n=${result.query.top_n}` : ""}`,
        `Returned: ${result.totals.prefixes_returned} prefixes${result.totals.prefixes_filtered_out_by_min_count > 0 ? ` (${result.totals.prefixes_filtered_out_by_min_count} filtered out by min_tablet_count)` : ""}`,
        ``,
        `Prefix           Tablets    Total signs  Mean signs  In-lex (%)`,
        `──────────────  ────────  ────────────  ──────────  ──────────`,
      ];
      for (const p of result.prefixes) {
        lines.push(
          `${p.prefix.padEnd(14).slice(0, 14)}  ${String(p.tablet_count).padStart(8)}  ${p.total_sign_count.toLocaleString().padStart(12)}  ${String(p.mean_sign_count).padStart(10)}  ${String(p.in_lex_graph).padStart(6)} (${String(p.lex_coverage_pct).padStart(5)}%)`,
        );
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:list-prefixes", VERSION, {
          citation:
            "Corpus-prefix discovery over the anomaly-index. v0.18.5. Companion to coverage_stats_for_collection.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`list_collection_prefixes error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            min_tablet_count: min_tablet_count ?? 1,
            sort_by: sort_by ?? "tablet_count",
            sort_order: sort_order ?? "desc",
            top_n: top_n ?? null,
          },
          prefixes: [] as never[],
          totals: { distinct_prefixes: 0, prefixes_returned: 0, total_tablets: 0, total_signs: 0, prefixes_filtered_out_by_min_count: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:list-prefixes", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.4 — Coverage statistics for museum-collection prefix ────────────

server.registerTool(
  "coverage_stats_for_collection",
  {
    description:
      "Corpus-level baseline: for a given museum-collection prefix (or list of prefixes) like 'BM', 'K', 'Sm', 'CBS', 'VAT', 'NZK', etc., return total tablet count + transliteration coverage + sign-count distribution + top-N largest tablets + period/genre/city breakdowns. Useful as the entry-point query for any per-collection deep-dive: identify under-cataloged sub-corpora, the largest tablets worth a per-tablet brief, and the historical character of a collection. Companion to find_anomalous_tablets (per-tablet anomaly detail) and reconstruct_cluster (per-seed manuscript reconstruction). The 2026-05-22 BM.77056 *āšipūtu* cluster survey motivated this tool — the cluster spanned 20 museum prefixes but no existing tool surfaced 'how many total tablets in prefix X, what's their sign-count distribution?'",
    inputSchema: {
      prefixes: z
        .array(z.string().min(1))
        .min(1)
        .describe(
          "List of museum-collection prefixes to aggregate. Examples: ['BM'] · ['K', 'Sm'] · ['NZK'] · ['MLC', 'YBC']. Prefix matching is case-sensitive and uses the eBL convention (the substring before the first '.' or ',' in the museum number).",
        ),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Top-N largest tablets per prefix to surface (by sign_count). Default 10. Capped at 50."),
    },
  },
  async ({ prefixes, top_n }) => {
    const SCHEMA = schemaId("coverage_stats_for_collection");
    try {
      const result = collectionCoverage({ prefixes, topN: top_n });

      const lines: string[] = [
        `Coverage query: [${result.query.prefixes.join(", ")}] · top_n=${result.query.top_n}`,
        `Corpus totals: ${result.corpus_totals.total_tablets_in_index.toLocaleString()} tablets in index across ${result.corpus_totals.distinct_prefixes_in_corpus} prefixes`,
        `Query match: ${result.corpus_totals.total_tablets_matching_query.toLocaleString()} tablets across ${result.corpus_totals.prefixes_matched}/${result.query.prefixes.length} requested prefixes`,
        ``,
      ];
      for (const pp of result.per_prefix) {
        if (pp.total_tablets === 0) {
          lines.push(`Prefix ${pp.prefix}: no matching tablets in the anomaly index.`);
          lines.push(``);
          continue;
        }
        const lexPct = ((pp.in_lex_graph / pp.total_tablets) * 100).toFixed(1);
        const themPct = ((pp.in_them_index / pp.total_tablets) * 100).toFixed(1);
        const bothPct = ((pp.in_both / pp.total_tablets) * 100).toFixed(1);
        lines.push(
          `─── ${pp.prefix} (${pp.total_tablets} tablets) ───`,
          `  Coverage: ${pp.in_lex_graph} in lex graph (${lexPct}%) · ${pp.in_them_index} in thematic index (${themPct}%) · ${pp.in_both} in both (${bothPct}%)`,
          `  Sign counts (excluding ${pp.sign_count.zero_sign_count} zero-sign records): min=${pp.sign_count.min} median=${pp.sign_count.median} mean=${pp.sign_count.mean} p90=${pp.sign_count.p90} max=${pp.sign_count.max} total=${pp.sign_count.total.toLocaleString()}`,
        );
        const periods = Object.entries(pp.period_distribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (periods.length > 0) {
          lines.push(`  Top periods: ${periods.map(([k, v]) => `${k}=${v}`).join(", ")}`);
        }
        const genres = Object.entries(pp.genre_distribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (genres.length > 0) {
          lines.push(`  Top genres: ${genres.map(([k, v]) => `${k}=${v}`).join(", ")}`);
        }
        const cities = Object.entries(pp.city_distribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (cities.length > 0) {
          lines.push(`  Top cities: ${cities.map(([k, v]) => `${k}=${v}`).join(", ")}`);
        }
        lines.push(`  Top ${pp.top_by_sign_count.length} by sign count:`);
        for (const t of pp.top_by_sign_count) {
          lines.push(`    ${t.id.padEnd(22)} ${String(t.sign_count).padStart(6)} signs${t.designation ? `  · ${t.designation}` : ""}`);
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:collection-coverage", VERSION, {
          citation:
            "Per-prefix corpus statistics over the anomaly-index. v0.18.4. Companion to find_anomalous_tablets + reconstruct_cluster.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`coverage_stats_for_collection error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefixes: prefixes ?? [], top_n: top_n ?? 10 },
          per_prefix: [] as never[],
          corpus_totals: {
            total_tablets_in_index: 0,
            total_tablets_matching_query: 0,
            prefixes_matched: 0,
            distinct_prefixes_in_corpus: 0,
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:collection-coverage", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.0 — Lacuna restoration (multi-sign damaged-passage predictor) ───

server.registerTool(
  "restore_lacuna_passage",
  {
    description:
      "Predict the most-probable sign sequence for a multi-sign damaged passage. Extends v0.14.2's single-sign infer_damaged_sign to multi-sign lacunae via parallel-template alignment (find templates whose local sign sequence contains BOTH a prefix-trigram and a suffix-trigram within distance k ± tolerance, extract the intervening signs as candidate fills) + bigram beam-search fallback when no parallel templates exist.",
    inputSchema: {
      tablet_id: z.string().optional().describe("Museum number to fetch signs for. Auto-detects the longest X stretch."),
      signs: z.string().optional().describe("Raw signs string with X markers."),
      lacuna_start: z.number().int().min(0).optional().describe("0-indexed start of the lacuna."),
      lacuna_end: z.number().int().min(0).optional().describe("0-indexed end (exclusive)."),
      prefix_window: z.number().int().min(3).max(20).optional().describe("Default 6."),
      suffix_window: z.number().int().min(3).max(20).optional().describe("Default 6."),
      top_k_candidates: z.number().int().min(1).max(30).optional().describe("Default 10."),
      lacuna_size_tolerance: z.number().int().min(0).max(5).optional().describe("Default 2."),
    },
  },
  async ({ tablet_id, signs, lacuna_start, lacuna_end, prefix_window, suffix_window, top_k_candidates, lacuna_size_tolerance }) => {
    const SCHEMA = schemaId("restore_lacuna_passage");
    try {
      const result = restoreLacunaPassage({
        tabletId: tablet_id, signs,
        lacunaStart: lacuna_start, lacunaEnd: lacuna_end,
        prefixWindow: prefix_window, suffixWindow: suffix_window,
        topKCandidates: top_k_candidates, lacunaSizeTolerance: lacuna_size_tolerance,
      });
      const lines: string[] = [
        `Tablet: ${result.tablet_id ?? "(inline)"}`,
        `Lacuna: positions ${result.lacuna.start}-${result.lacuna.end} (size ${result.lacuna.size})`,
        `Prefix: ${result.context.prefix.slice(-6).join(" ")}`,
        `Suffix: ${result.context.suffix.slice(0, 6).join(" ")}`,
        `Templates: ${result.index_stats.templates_examined} examined, ${result.index_stats.template_matches_found} matches, fallback=${result.index_stats.fallback_to_beam_search}`,
        ``,
        `Top candidates (${result.candidates.length}):`,
      ];
      for (const c of result.candidates) {
        lines.push(`  [${c.method}] score=${c.score} fill_len=${c.fill_length}  signs: ${c.signs_str}`);
        if (c.evidence.template_tablet) {
          lines.push(`    template: ${c.evidence.template_tablet} jac=${c.evidence.local_jaccard} coh=${c.evidence.bigram_coherence}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA, data: result,
        provenance: provenance("local", "local:lacuna-restore", VERSION, {
          citation: "Multi-sign lacuna restoration via parallel-template alignment + bigram beam-search. v0.18.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`restore_lacuna_passage error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id: tablet_id ?? null,
          lacuna: { start: -1, end: -1, size: 0 },
          context: { prefix: [] as never[], suffix: [] as never[], prefix_trigrams_count: 0, suffix_trigrams_count: 0 },
          candidates: [] as never[],
          index_stats: { total_tablets: 0, templates_examined: 0, template_matches_found: 0, fallback_to_beam_search: false },
          warnings: [msg],
        },
        provenance: provenance("local", "local:lacuna-restore", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.0 — Scribal fingerprint (orthographic-preference clustering) ────

server.registerTool(
  "find_same_scribe_candidates",
  {
    description:
      "Find tablets with similar orthographic preferences — candidate same-scribe or same-scribal-school pairs. Computes per-tablet 'scribal signature' = top-30 signs by log-likelihood ratio of in-tablet vs. corpus-baseline frequency. Two tablets with overlapping signatures share unusual orthographic preferences (variant-sign choices, logogram-vs-syllabic habits, sign-compound preferences). NB: eBL transliterations normalize paleographic variation, so this measures 'spelling-preference fingerprint' rather than handwriting paleography.",
    inputSchema: {
      tablet_id: z.string().describe("Museum number. Must be ≥30 non-X sign tokens."),
      top_k: z.number().int().min(1).max(30).optional().describe("Default 10."),
      min_overlap: z.number().int().min(1).max(30).optional().describe("Min signature signs in common. Default 3."),
      min_jaccard: z.number().min(0).max(1).optional().describe("Min signature Jaccard. Default 0.10."),
    },
  },
  async ({ tablet_id, top_k, min_overlap, min_jaccard }) => {
    const SCHEMA = schemaId("find_same_scribe_candidates");
    try {
      const result = findSameScribeCandidates({
        tabletId: tablet_id, topK: top_k, minOverlap: min_overlap, minJaccard: min_jaccard,
      });
      const lines: string[] = [
        `Query: ${tablet_id} · signature size: ${result.query_signature_size}`,
        `Index: ${result.index_stats.total_tablets} tablets · examined: ${result.index_stats.candidates_examined}`,
        ``,
        `Candidates: ${result.candidates.length}`,
      ];
      for (const c of result.candidates) {
        lines.push(``);
        lines.push(`── ${c.tablet_id}  overlap=${c.signature_overlap_count} jac=${c.signature_jaccard} cos=${c.signature_cosine}`);
        if (c.shared_top_signs.length > 0) {
          lines.push(`   shared:`);
          for (const s of c.shared_top_signs) {
            lines.push(`     · ${s.sign.padEnd(16)} qLLR=${s.query_llr.toFixed(2)} tLLR=${s.target_llr.toFixed(2)}`);
          }
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA, data: result,
        provenance: provenance("local", "local:scribal-fingerprint", VERSION, {
          citation: "Orthographic-preference fingerprint via per-tablet LLR signature. v0.18.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_same_scribe_candidates error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query_tablet_id: tablet_id, query_signature_size: 0,
          candidates: [] as never[],
          index_stats: { total_tablets: 0, candidates_examined: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:scribal-fingerprint", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "get_scribal_signature",
  {
    description:
      "Retrieve the scribal-signature profile for a tablet: top-30 signs whose in-tablet frequency is unusually high (log-likelihood ratio) vs. corpus baseline. Use to inspect a tablet's orthographic preferences or to cross-check shared signs flagging a find_same_scribe_candidates pair.",
    inputSchema: {
      tablet_id: z.string().describe("Museum number."),
    },
  },
  async ({ tablet_id }) => {
    const SCHEMA = schemaId("get_scribal_signature");
    try {
      const result = getScribalSignature(tablet_id);
      const lines: string[] = [
        `Tablet: ${tablet_id}  · total signs: ${result.total_signs_in_tablet} · signature: ${result.signature_signs.length}`,
        ``,
      ];
      if (result.signature_signs.length > 0) {
        lines.push(`Top signature signs (sign · corpus_share · LLR):`);
        for (const s of result.signature_signs) {
          lines.push(`  ${s.sign.padEnd(20)} corpus=${s.corpus_share.toFixed(6)}  LLR=${s.llr}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA, data: result,
        provenance: provenance("local", "local:scribal-fingerprint", VERSION),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`get_scribal_signature error: ${msg}`, {
        schema: SCHEMA,
        data: { tablet_id, signature_signs: [] as never[], total_signs_in_tablet: 0, warnings: [msg] },
        provenance: provenance("local", "local:scribal-fingerprint", VERSION),
        warnings: [msg],
      });
    }
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
      `cuneiform-mcp v${VERSION} smoke OK — 33 tools registered, all live, all emit structuredContent envelopes per PROTOCOL.md (v0.5 corpus + v0.6 retrieval + v0.7 Discovery Engine + v0.8 Mesopotamian-internal + v0.9-v0.12 expansions + v0.13 Primary-Source Discovery Engine v2.0 + v0.14.0 RAG + v0.14.2 Sign-Inference Engine + v0.14.3 Biblical-Parallel Finder + v0.15.0 Semantic-Embeddings Mode C + v0.16.0 Anomaly Surface + v0.17.0 Refinement + Fuzzy Parallels + v0.17.1 Cluster Reconstructor + v0.18.0 Lacuna Restorer + Scribal Fingerprint + v0.18.4 Collection Coverage + reconstruct_cluster min_sign_count quality filter + v0.18.5 list_collection_prefixes + v0.18.6 find_short_fragments quality-audit)\n`,
    );
    process.exit(0);
  }
  if (process.argv.includes("--prefetch")) {
    await runPrefetch();
    process.exit(0);
  }
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write(`cuneiform-mcp v${VERSION} listening on stdio (30 tools)\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
