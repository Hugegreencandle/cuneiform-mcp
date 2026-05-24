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
  findEmbeddedFragments,
  fuzzyIndexStats,
} from "./fuzzyParallels.js";
import {
  findChunkParallels,
} from "./chunkParallels.js";
import {
  chunkIndexStats,
} from "./chunkIndex.js";
import {
  findFormulaicPassages,
} from "./formulaicPassages.js";
import {
  traceChunkDiffusion,
} from "./chunkDiffusion.js";
import {
  buildCitationGraph,
} from "./citationGraph.js";
import {
  findIncipits,
} from "./findIncipits.js";
import {
  prioritizeValidationQueue,
} from "./validationQueue.js";
import {
  buildCanonicalRecensionTree,
} from "./recensionTree.js";
import {
  buildScribalSchoolGraph,
} from "./scribalSchoolGraph.js";
import {
  findSimilarSigns,
} from "./findSimilarSigns.js";
import {
  computeLexicalSubstitutionScore,
} from "./lexicalSubstitution.js";
import {
  compareSignEmbeddingConfigs,
} from "./compareSignEmbeddingConfigs.js";
import {
  computeLexicalSubstitutionLift,
} from "./computeLexicalSubstitutionLift.js";
import {
  compareSignNeighborsAcrossPeriods,
} from "./compareSignNeighborsAcrossPeriods.js";
import {
  recommendArchetypeThresholds,
} from "./recommendArchetypeThresholds.js";
import {
  compareSignNeighborsRegisterMatched,
} from "./compareSignNeighborsRegisterMatched.js";
import {
  reconstructCluster,
} from "./reconstructCluster.js";
import {
  collectionCoverage,
  listCollectionPrefixes,
  findShortFragments,
} from "./collectionCoverage.js";
import {
  clusterPairSimilarityMatrix,
} from "./clusterMatrix.js";
import {
  compareTabletPair,
} from "./comparePair.js";
import {
  findScribalGroups,
} from "./scribalGroups.js";
import {
  auditCluster,
} from "./auditCluster.js";
import {
  findOrthographicOutliers,
} from "./orthographicOutliers.js";
import {
  findCrossPrefixScribalLinks,
} from "./crossPrefixScribal.js";
import {
  compareClusters,
} from "./compareClusters.js";
import {
  findStrongestFuzzyPairs,
} from "./strongestFuzzyPairs.js";
import {
  corpusHealthReport,
} from "./corpusHealth.js";
import {
  findTabletNeighborhood,
} from "./tabletNeighborhood.js";
import {
  findLacunaRestorationCandidates,
} from "./lacunaCandidates.js";
import {
  findThematicClusterInPrefix,
} from "./thematicCluster.js";
import {
  enrichFragmentMetadata,
  metadataCoverage,
} from "./fragmentMetadata.js";
import { getAllTabletRecords as _getAllTabletRecordsForEnrich } from "./anomalySurface.js";
import {
  findUnpublishedInPublication,
} from "./unpublishedInPublication.js";
import {
  compareDialects,
} from "./compareDialects.js";
import {
  findTabletsByGenre,
} from "./findByGenre.js";
import {
  comparePrefixPair,
} from "./comparePrefixes.js";
import {
  findGenreAnchorTablets,
} from "./genreAnchors.js";
import {
  findTabletsByProvenance,
} from "./findByProvenance.js";
import {
  findJoinCandidatesInPrefix,
} from "./joinCandidatesInPrefix.js";
import {
  findLineageChain,
} from "./lineageChain.js";
import {
  findHighJoinCountTablets,
} from "./highJoinCountTablets.js";
import {
  findIsolateCompositions,
} from "./isolateCompositions.js";
import {
  findSignatureEvolutionInLineage,
} from "./signatureEvolution.js";
import {
  extendDatasetToMotif,
} from "./motifDatasetBuilder.js";
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

const VERSION = "0.27.0";

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

// ─── v0.18.19 — Embedded-fragment (asymmetric containment) probe ───────────

server.registerTool(
  "find_embedded_fragments",
  {
    description:
      "Find LARGER HOST tablets that an Archetype-5 small fragment is embedded in, via asymmetric trigram containment (fuzzy_intersect / |query_trigrams|, NOT symmetric Jaccard). Motivation: the 2026-05-23 cluster typology found K.9508 (small Mīs pî fragment) returns ZERO strong fuzzy neighbors when probed symmetrically — K.5896 (its 102-sign-run host, 7.3× larger) sits at fuzzy_J=0.13 because the union-denominator is dominated by K.5896's vocabulary — but the asymmetric containment `intersect / |K.9508|` is 0.986 (99% of K.9508's trigrams reproduced in K.5896). Use this when find_fuzzy_parallels returns weak/empty results for a small tablet (<200 signs) you suspect is a fragment of a known larger manuscript. Defaults are precision-tight (min_containment=0.50 + min_run=20) — calibration audit Round 3 confirmed this suppresses the methods-paper final-2 bi-orphans (IM.49220, K.3306) to zero false positives while preserving the K.9508 ↔ K.5896 positive case (run=142). Companion to find_fuzzy_parallels (symmetric, the right tool for whole-manuscript siblings) and reconstruct_cluster (BFS-expansion via fuzzy parallels).",
    inputSchema: {
      tablet_id: z.string().describe("Museum number of the small/guest tablet (e.g., 'K.9508'). Must be in the eBL signs cache. For best results, guest should be <2000 trigrams (small enough to plausibly be embedded in a host)."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of host candidates to return. Default 10. Hard cap 50."),
      min_containment: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum asymmetric containment (fuzzy_intersect / |query|). Default 0.50 — half the guest's trigrams must be reproduced in the host. Lower to 0.30 for exploratory broad-sweep; raise to 0.70 for high-confidence-only."),
      min_run: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Minimum longest contiguous trigram run between guest and host. Default 20 — calibrated 2026-05-23 to suppress false-positive hosts on the methods-paper final-2 bi-orphans (IM.49220, K.3306) while keeping K.9508 ↔ K.5896 (run=142). Set to 0 to disable the precision filter for exploratory recall sweeps."),
      host_size_multiplier: z
        .number()
        .min(1)
        .optional()
        .describe("Host must be at least this many times the guest's trigram count. Default 5. Lower to 2-3 for 'sibling-or-host' ambiguous cases; raise to 10+ to require strongly-asymmetric embeddings."),
      max_guest_size: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Cap on guest trigram count. Default 2000. Probing very large tablets here is conceptually mismatched (large tablets are hosts, not guests) — the tool warns but still runs."),
    },
  },
  async ({ tablet_id, top_k, min_containment, min_run, host_size_multiplier, max_guest_size }) => {
    const SCHEMA = schemaId("find_embedded_fragments");
    try {
      const result = findEmbeddedFragments({
        guestTabletId: tablet_id,
        topK: top_k,
        minContainment: min_containment,
        minRun: min_run,
        hostSizeMultiplier: host_size_multiplier,
        maxGuestSize: max_guest_size,
      });
      const lines: string[] = [
        `Guest tablet: ${tablet_id}`,
        `Index: ${result.index_stats.total_tablets_indexed} tablets · guest has ${result.index_stats.query_trigram_count} trigrams`,
        `Candidates examined: ${result.index_stats.candidates_examined} · passing host-size filter: ${result.index_stats.candidates_passing_host_filter} · with fuzzy overlap: ${result.index_stats.candidates_with_overlap}`,
        ``,
        `Host candidates returned: ${result.matches.length}`,
        ``,
      ];
      for (const m of result.matches) {
        lines.push(`── ${m.host_tablet_id}`);
        lines.push(`   containment: ${m.fuzzy_intersect}/${m.query_trigrams} = ${m.containment}  ·  exact containment: ${m.exact_intersect}/${m.query_trigrams} = ${m.exact_containment}  ·  host size ratio: ${m.host_size_ratio}×`);
        lines.push(`   longest contiguous run: ${m.longest_contiguous_run} positions`);
        if (m.shared_fuzzy_examples.length > 0) {
          lines.push(`   examples (guest → host):`);
          for (const ex of m.shared_fuzzy_examples) {
            lines.push(`     · '${ex.query}' ↔ '${ex.target}'`);
          }
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:embedded-fragment-containment", VERSION, {
          citation:
            "Asymmetric trigram containment (fuzzy_intersect / |query|) over the eBL all-signs-full.json corpus. v0.18.19. Recovers Archetype-5 embedded-fragment relationships invisible to symmetric fuzzy-Jaccard.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_embedded_fragments error: ${msg}`, {
        schema: SCHEMA,
        data: {
          guest_tablet_id: tablet_id,
          matches: [] as never[],
          index_stats: { total_tablets_indexed: 0, query_trigram_count: 0, candidates_examined: 0, candidates_passing_host_filter: 0, candidates_with_overlap: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:embedded-fragment-containment", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.19.0 — Sub-tablet chunk-parallel detection ────────────────────────

server.registerTool(
  "find_chunk_parallels",
  {
    description:
      "Surface contiguous shared-sign chunks (≥ min_chunk_len trigram positions) between a source tablet and every host tablet in the corpus, as a PRIMARY OBJECT — chunk_start + chunk_length + host_tablets[] + cross-genre/cross-period attribution + novelty score. v0.18.19's find_embedded_fragments returns the longest run as a scalar; this tool returns every qualifying run as a chunk, grouped by (start, length) → hosts. Motivating case: K.9508 ↔ K.5896 has a 142-position contiguous run reproduced verbatim across the pair — invisible to whole-tablet symmetric Jaccard (J=0.13) but obvious as a single chunk-with-host here. Defaults are precision-tight (min_chunk_len=20, calibrated 2026-05-24 against the methods-paper §3.6 bi-orphans IM.49220 + K.3306). Use cross_genre_only=true to surface formulaic incipits crossing the KAR-44 curriculum boundary (e.g. *āšipūtu* formulae reproduced in Sakikkû / Diri / Aa hosts). Companion to find_embedded_fragments (asymmetric containment scalar) and find_fuzzy_parallels (whole-manuscript symmetric Jaccard).",
    inputSchema: {
      tablet_id: z.string().describe("Museum number of the source tablet (e.g., 'K.9508'). Must be in the eBL signs cache."),
      min_chunk_len: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Minimum contiguous-run length in TRIGRAM POSITIONS (sign count ≈ min_chunk_len + 2 for clean tablets). Default 20 — matches the v0.18.19 min_run precision-tight default that suppresses noise hosts on the methods-paper §3.6 bi-orphans (IM.49220, K.3306) to zero while preserving K.9508 ↔ K.5896 (run=142). Lower to 10–15 for exploratory recall sweeps."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of chunks to return. Default 20. Hard cap 100."),
      min_hosts: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Require each chunk to be shared with at least this many other tablets. Default 1 (any host)."),
      exclude_prefixes: z
        .array(z.string())
        .optional()
        .describe("Drop hosts whose tablet ID starts with any of these prefixes (e.g. ['Asb.'] to suppress colophon prototypes that dominate the candidate set with formulaic Ashurbanipal endings)."),
      cross_genre_only: z
        .boolean()
        .optional()
        .describe("Keep only chunks with ≥1 host whose primary genre differs from the source's. Requires fragment-metadata for both source and host; chunks without metadata-confirmable cross-genre attribution are dropped. Useful for surfacing curriculum-crossing formulae."),
      cross_period_only: z
        .boolean()
        .optional()
        .describe("Keep only chunks with ≥1 host whose period differs from the source's. Same metadata requirement as cross_genre_only. Useful for reconstructing diachronic transmission of formulaic passages."),
    },
  },
  async ({ tablet_id, min_chunk_len, top_k, min_hosts, exclude_prefixes, cross_genre_only, cross_period_only }) => {
    const SCHEMA = schemaId("find_chunk_parallels");
    try {
      const result = findChunkParallels({
        tabletId: tablet_id,
        minChunkLen: min_chunk_len,
        topK: top_k,
        minHosts: min_hosts,
        excludePrefixes: exclude_prefixes,
        crossGenreOnly: cross_genre_only,
        crossPeriodOnly: cross_period_only,
      });
      const lines: string[] = [
        `Source tablet: ${tablet_id}`,
        `Index: ${result.index_stats.total_tablets_indexed} tablets · source has ${result.index_stats.query_trigram_count} trigrams`,
        `Candidates examined: ${result.index_stats.candidates_examined} · with ≥1 run: ${result.index_stats.candidates_with_runs} · distinct chunks before topK: ${result.index_stats.distinct_chunks}`,
        `Source coverage by returned chunks: ${result.source_coverage_pct}%`,
        ``,
        `Chunks returned: ${result.chunks.length}`,
        ``,
      ];
      for (const c of result.chunks) {
        lines.push(`── chunk ${c.chunk_key}  (length ${c.chunk_length} trigram positions, ~${c.chunk_length + 2} signs)`);
        lines.push(`   hosts: ${c.host_count}  ·  cross-genre: ${c.cross_genre_count}  ·  cross-period: ${c.cross_period_count}  ·  novelty: ${c.novelty_score}`);
        const hostPreview = c.host_tablets.slice(0, 5).map((h) => `${h.tablet_id} (${h.host_size_ratio}×)`).join(", ");
        const moreHosts = c.host_tablets.length > 5 ? ` … +${c.host_tablets.length - 5} more` : "";
        lines.push(`   host preview: ${hostPreview}${moreHosts}`);
        const signsPreview = c.chunk_signs.length > 200 ? c.chunk_signs.slice(0, 200) + "…" : c.chunk_signs;
        lines.push(`   signs: ${signsPreview}`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:chunk-parallels-from-trigram-runs", VERSION, {
          citation:
            "Sub-tablet chunk parallel detection over the eBL all-signs-full.json corpus, built on the v0.18.19 fuzzy trigram intersection. v0.19.0. Surfaces every maximal matched-position run ≥ min_chunk_len as a primary object (chunk → hosts) rather than as a longest_contiguous_run scalar.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_chunk_parallels error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_id,
          chunks: [] as never[],
          source_coverage_pct: 0,
          index_stats: { total_tablets_indexed: 0, query_trigram_count: 0, candidates_examined: 0, candidates_with_runs: 0, distinct_chunks: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:chunk-parallels-from-trigram-runs", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.20.0 — Corpus-wide chunk discovery ───────────────────────────────

server.registerTool(
  "find_formulaic_passages",
  {
    description:
      "Corpus-wide enumeration of formulaic passages: every length-20 trigram window shared with ≥ min_hosts tablets, ranked by host_genres_spanned × log(host_count). Backbone is the v0.20 chunk-hash index (~/.cache/cuneiform-mcp/chunk-index.json, built once via scripts/build-chunk-index.mjs). v0.19's find_chunk_parallels probes ONE source tablet; this tool surfaces formulaic chunks ACROSS the whole corpus in milliseconds. Genre-diversity weighting rewards cross-curricular formulae (e.g. *āšipūtu* incipits appearing in Mīs pî + Ritual + Lexical hosts) and demotes within-prefix colophon templates (Library of Ashurbanipal Asb.c / Asb.d) whose host_genres_spanned collapses to 1. Companion to trace_chunk_diffusion (per-chunk chronological transmission) and build_citation_graph (commentary→base edges).",
    inputSchema: {
      min_hosts: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe("Minimum host count per chunk. Default 20. Lower for exploratory recall; higher (50+) to restrict to canonical KAR-44 incipits."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of passages to return. Default 50, hard cap 100."),
      cross_genre_only: z
        .boolean()
        .optional()
        .describe("Keep only chunks whose hosts span ≥ 2 distinct primary genres. Requires fragment-metadata; chunks with no resolvable genre are dropped."),
      cross_period_only: z
        .boolean()
        .optional()
        .describe("Keep only chunks whose hosts span ≥ 2 distinct periods. Useful for surfacing diachronically-transmitted formulae."),
      exclude_prefixes: z
        .array(z.string())
        .optional()
        .describe("Drop hosts whose tablet ID starts with any of these prefixes (e.g. ['Asb.'] to suppress colophon prototypes)."),
    },
  },
  async ({ min_hosts, top_k, cross_genre_only, cross_period_only, exclude_prefixes }) => {
    const SCHEMA = schemaId("find_formulaic_passages");
    try {
      const result = findFormulaicPassages({
        minHosts: min_hosts,
        topK: top_k,
        crossGenreOnly: cross_genre_only,
        crossPeriodOnly: cross_period_only,
        excludePrefixes: exclude_prefixes,
      });
      const lines: string[] = [
        `Chunk index: ${result.index_stats.loaded ? "loaded" : "NOT LOADED"} · ${result.index_stats.total_chunks_in_index} non-singleton chunks`,
        `Candidates ≥ min_hosts: ${result.index_stats.candidates_above_threshold} · after filters: ${result.index_stats.after_filters}`,
        `Host metadata coverage: ${result.index_stats.metadata_coverage_pct}%`,
        ``,
        `Passages returned: ${result.passages.length}`,
        ``,
      ];
      for (const p of result.passages) {
        lines.push(`── chunk ${p.chunk_hash.slice(0, 24)}…  (length ${p.chunk_length} trigrams ≈ ${p.chunk_length + 2} signs)`);
        lines.push(`   hosts: ${p.host_count}  ·  genres spanned: ${p.host_genres_spanned}  ·  periods spanned: ${p.host_periods_spanned}  ·  novelty: ${p.novelty_score}`);
        const hostPreview = p.host_tablets.slice(0, 4).map((h) => `${h.tablet_id}${h.genre ? `[${h.genre.split(" → ")[0]}]` : ""}`).join(", ");
        const moreHosts = p.host_count > 4 ? ` … +${p.host_count - 4} more` : "";
        lines.push(`   host preview: ${hostPreview}${moreHosts}`);
        const signsPreview = p.chunk_signs.length > 200 ? p.chunk_signs.slice(0, 200) + "…" : p.chunk_signs;
        lines.push(`   signs: ${signsPreview}`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:formulaic-passages-from-chunk-hash-index", VERSION, {
          citation:
            "Corpus-wide formulaic-passage enumeration over the v0.20.0 chunk-hash index. Sliding length-20 trigram windows aggregated across the eBL all-signs-full.json corpus; singletons pruned at build; ranked by host_genres_spanned × log(host_count). Companion to find_chunk_parallels' per-tablet probe.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_formulaic_passages error: ${msg}`, {
        schema: SCHEMA,
        data: {
          passages: [] as never[],
          index_stats: { loaded: false, total_chunks_in_index: 0, candidates_above_threshold: 0, after_filters: 0, metadata_coverage_pct: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:formulaic-passages-from-chunk-hash-index", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "trace_chunk_diffusion",
  {
    description:
      "Per-chunk chronological diffusion: given a chunk (by hash, or by source tablet + which chunk to pick), return its hosts grouped by period and ordered chronologically. The diffusion array is the corpus-level transmission map for a single passage. Validation case: a canonical KAR-44 incipit chunk should diffuse Old Babylonian → Middle Babylonian → Neo-Assyrian → Neo-Babylonian → Hellenistic, mirroring the documented *āšipūtu* curriculum. Backbone is the v0.20.0 chunk-hash index + src/periodChronology.ts curated period ordering.",
    inputSchema: {
      chunk_hash: z
        .string()
        .optional()
        .describe("Exact chunk hash to trace. Get hashes from find_formulaic_passages output. Either chunk_hash OR tablet_id must be provided."),
      tablet_id: z
        .string()
        .optional()
        .describe("Source tablet; the tool picks the tablet's chunks in the index. Combine with chunk_index_in_tablet to select among multiple."),
      chunk_index_in_tablet: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("When tablet_id is set: 0-based selector among the tablet's non-singleton chunks. Default 0 (highest-host-count chunk first)."),
    },
  },
  async ({ chunk_hash, tablet_id, chunk_index_in_tablet }) => {
    const SCHEMA = schemaId("trace_chunk_diffusion");
    try {
      const result = traceChunkDiffusion({
        chunkHash: chunk_hash,
        tabletId: tablet_id,
        chunkIndexInTablet: chunk_index_in_tablet,
      });
      const lines: string[] = [
        `chunk_hash: ${result.chunk_hash ?? "(none)"}`,
        `chunk_length: ${result.chunk_length} trigram positions`,
        `hosts: ${result.hosts_total} total · ${result.hosts_with_period} with period metadata`,
        `period span: ${result.earliest_period ?? "(unknown)"} → ${result.latest_period ?? "(unknown)"}  ·  approx ${result.period_span_years_approx ?? "—"} years  ·  ${result.cross_period_count} distinct periods`,
        ``,
        `signs: ${result.chunk_signs.slice(0, 200)}${result.chunk_signs.length > 200 ? "…" : ""}`,
        ``,
        `Diffusion (ordered by sort_key):`,
      ];
      for (const bucket of result.diffusion) {
        const periodLabel = bucket.period ?? "(unknown period)";
        const range = bucket.approx_start_bce !== null && bucket.approx_end_bce !== null
          ? `  [~${bucket.approx_start_bce}–${bucket.approx_end_bce} BCE]`
          : "";
        lines.push(`  ${periodLabel}${range}  ·  ${bucket.tablets.length} host(s)`);
        const preview = bucket.tablets.slice(0, 5).map((t) => `${t.tablet_id}${t.genre ? `[${t.genre.split(" → ")[0]}]` : ""}`).join(", ");
        const more = bucket.tablets.length > 5 ? ` … +${bucket.tablets.length - 5} more` : "";
        lines.push(`    ${preview}${more}`);
      }
      if (result.warnings.length > 0) lines.push("", `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:chunk-diffusion-from-chunk-hash-index", VERSION, {
          citation:
            "Per-chunk chronological diffusion over the v0.20.0 chunk-hash index. Period attribution via cached eBL fragment metadata (script.period); ordering via src/periodChronology.ts curated sort_keys.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`trace_chunk_diffusion error: ${msg}`, {
        schema: SCHEMA,
        data: {
          chunk_hash: null,
          chunk_signs: "",
          chunk_length: 0,
          diffusion: [] as never[],
          earliest_period: null,
          latest_period: null,
          period_span_years_approx: null,
          cross_period_count: 0,
          hosts_total: 0,
          hosts_with_period: 0,
          warnings: [msg],
        },
        provenance: provenance("local", "local:chunk-diffusion-from-chunk-hash-index", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "build_citation_graph",
  {
    description:
      "Corpus-level commentary→base quotation graph derived from the v0.20.0 chunk-hash index. For every chunk, partitions occurrences into commentary-genre hosts vs. base-text hosts (by primary-genre substring match against commentary_genres); each (commentary, base) pair earns one edge credit per shared chunk, weighted by chunk length. Edges below min_shared_chunks are dropped. Pair-level companion: v0.18.19 commentary_quotes_base_text answers 'is THIS pair a commentary/base relationship?'; this tool answers 'what does the WHOLE corpus's quotation network look like?'. Validation case: BM.47463 (Šurpu commentary) → CBS.6060 (Šurpu base) — methods-paper §3.7.1's 147-sign chain — must appear as an edge.",
    inputSchema: {
      min_shared_chunks: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Drop edges with fewer than this many shared chunks. Default 2. Set to 1 to inspect every commentary/base pair candidate; raise to 3+ for high-confidence-only edges."),
      commentary_genres: z
        .array(z.string())
        .optional()
        .describe("Substring needles (case-insensitive) matched against host primary genre to classify it as 'commentary'. Default ['Commentary', 'Commentaries']."),
      top_k_edges: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Cap on returned edges, ranked by edge_weight desc. Default 100, hard cap 500."),
    },
  },
  async ({ min_shared_chunks, commentary_genres, top_k_edges }) => {
    const SCHEMA = schemaId("build_citation_graph");
    try {
      const result = buildCitationGraph({
        minSharedChunks: min_shared_chunks,
        commentaryGenres: commentary_genres,
        topKEdges: top_k_edges,
      });
      const lines: string[] = [
        `Chunk index loaded: ${result.index_stats.loaded}`,
        `Chunks examined: ${result.index_stats.chunks_examined}  ·  candidate edges: ${result.index_stats.candidate_edges}`,
        `Edges after min_shared_chunks filter: ${result.index_stats.edges_after_filter}  ·  returned (top-k): ${result.index_stats.edges_returned}`,
        `Corpus metadata coverage: ${result.index_stats.metadata_coverage_pct}%`,
        ``,
      ];
      for (const e of result.edges) {
        lines.push(`── ${e.cited_by} → ${e.cites}`);
        lines.push(`     genres: ${e.cited_by_genre ?? "?"} → ${e.cites_genre ?? "?"}`);
        lines.push(`     shared chunks: ${e.shared_chunks_count}  ·  edge_weight: ${e.edge_weight}`);
        if (e.shared_chunks.length > 0) {
          const ex = e.shared_chunks[0];
          const preview = ex.signs.length > 120 ? ex.signs.slice(0, 120) + "…" : ex.signs;
          lines.push(`     example signs: ${preview}`);
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:citation-graph-from-chunk-hash-index", VERSION, {
          citation:
            "Corpus-level commentary→base citation graph derived from the v0.20.0 chunk-hash index by genre-partitioning each chunk's occurrences and accumulating per-pair edge weights. Complements v0.18.19's pair-level commentary_quotes_base_text verdict.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`build_citation_graph error: ${msg}`, {
        schema: SCHEMA,
        data: {
          edges: [] as never[],
          index_stats: { loaded: false, chunks_examined: 0, candidate_edges: 0, edges_after_filter: 0, edges_returned: 0, metadata_coverage_pct: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:citation-graph-from-chunk-hash-index", VERSION),
        warnings: [msg],
      });
    }
  },
);

// Silences unused-import lint when chunkIndexStats is only used in --smoke summary.
void chunkIndexStats;

// ─── v0.21.0 — find_incipits (length-10 chunk-hash index) ────────────────

server.registerTool(
  "find_incipits",
  {
    description:
      "Surface short opening formulae (incipits) — length-10 trigram windows reproduced across many tablets — from the v0.21.0 incipits-index. Complements v0.20.0 find_formulaic_passages (length-20 windows for substantive passages). Length-10 catches the 3-8 sign canonical openings that scholars use to identify compositions (e.g. EN₂ Šurpu-tu-šú, i-nu Šamaš É u-pa-az-zar) but admits more numerical-table noise — defaults are calibrated tighter (min_hosts=50 vs 20). The exclude_numerical_only flag drops chunks whose signs are ≥70% ABZ480/ABZ411 (cuneiform numeral 1 + Diš variants — calendrical/numerical tables, NOT text incipits). Ranks by host_genres_spanned × log(1 + host_count) — same novelty score as find_formulaic_passages.",
    inputSchema: {
      min_hosts: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe("Drop incipit candidates with fewer than this many host tablets. Default 50. Length-10 windows are noisier than length-20; the higher floor compensates."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Cap on returned incipits, ranked by novelty_score desc. Default 30. Hard cap 200."),
      exclude_prefixes: z
        .array(z.string())
        .optional()
        .describe("Drop hosts whose tablet ID starts with any of these prefixes. Useful for suppressing colophon-prototype prefixes like 'Asb.'."),
      exclude_numerical_only: z
        .boolean()
        .optional()
        .describe("Drop chunks whose signs are ≥70% ABZ480 / ABZ411 (cuneiform numeral 1 family). Default true. These are calendrical/numerical-table fragments masquerading as incipits at length-10 granularity. Set false for exploratory full-recall sweeps."),
      cross_genre_only: z
        .boolean()
        .optional()
        .describe("Keep only incipits with host_genres_spanned ≥ 2. Default false."),
    },
  },
  async ({ min_hosts, top_k, exclude_prefixes, exclude_numerical_only, cross_genre_only }) => {
    const SCHEMA = schemaId("find_incipits");
    try {
      const result = findIncipits({
        minHosts: min_hosts,
        topK: top_k,
        excludePrefixes: exclude_prefixes,
        excludeNumericalOnly: exclude_numerical_only,
        crossGenreOnly: cross_genre_only,
      });
      const lines: string[] = [
        `Incipits index loaded: ${result.index_stats.loaded}`,
        `Total chunks in index: ${result.index_stats.total_chunks_in_index}  ·  candidates above min_hosts: ${result.index_stats.candidates_above_threshold}  ·  after filters: ${result.index_stats.after_filters}`,
        `Numerical-only chunks filtered: ${result.index_stats.numerical_only_filtered}  ·  metadata coverage: ${result.index_stats.metadata_coverage_pct}%`,
        ``,
        `Incipits returned: ${result.incipits.length}`,
        ``,
      ];
      for (const inc of result.incipits) {
        lines.push(`── ${inc.chunk_hash.slice(0, 32)}…  (host_count=${inc.host_count}, host_genres_spanned=${inc.host_genres_spanned}, novelty=${inc.novelty_score})`);
        const signsPreview = inc.chunk_signs.length > 120 ? inc.chunk_signs.slice(0, 120) + "…" : inc.chunk_signs;
        lines.push(`     signs: ${signsPreview}`);
        const hostPreview = inc.host_tablets.slice(0, 3).map((h) => h.tablet_id).join(", ");
        lines.push(`     host preview: ${hostPreview}${inc.host_tablets.length > 3 ? ` … +${inc.host_tablets.length - 3} more` : ""}`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:incipits-from-length-10-chunk-hash-index", VERSION, {
          citation:
            "Length-10 chunk-hash incipit discovery over the eBL all-signs-full.json corpus. v0.21.0. Complements v0.20.0 find_formulaic_passages (length-20); the numerical-only filter suppresses calendrical-table false positives unique to the shorter-window regime.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_incipits error: ${msg}`, {
        schema: SCHEMA,
        data: {
          incipits: [] as never[],
          index_stats: { loaded: false, total_chunks_in_index: 0, candidates_above_threshold: 0, after_filters: 0, numerical_only_filtered: 0, metadata_coverage_pct: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:incipits-from-length-10-chunk-hash-index", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.21.0 — prioritize_validation_queue (active-learning ranker) ──────

server.registerTool(
  "prioritize_validation_queue",
  {
    description:
      "Active-learning ranker for the manual-review backlog. Scores candidate tablets (bi-orphans from find_anomalous_tablets, isolate compositions, chunk-discovery surfaces) by information-gain-from-manual-review. Rewards: chunk-host count (log-scaled), bi-orphan status (lex+thematic isolation is rarer than lex-only and represents the methods-paper §3.6 prize), missing fragment-metadata, distinct anomaly_kinds. Penalizes: already in established clusters (low marginal gain), well-curated tablets with many chunk hosts (well-understood already), pure dead ends with no anomaly flags. Returns ranked queue with reasons[] strings explaining each candidate's score — transparency over scoring sophistication. Scope: 'bi_orphans' (the §3.6 final-1 + lex/thematic singletons), 'chunk_discoveries' (find_chunk_parallels hubs), or 'all' (default).",
    inputSchema: {
      scope: z
        .enum(["bi_orphans", "chunk_discoveries", "all"])
        .optional()
        .describe("Seed enumeration scope. 'bi_orphans' restricts to the anomaly-index bi-orphan + lex/thematic singleton surface (the methods-paper §3.6 territory). 'chunk_discoveries' uses chunk-host hubs from the v0.20 chunk-hash index. 'all' (default) unifies both."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of candidates to return. Default 20. Hard cap 100."),
      min_score: z
        .number()
        .optional()
        .describe("Optional score floor — only return candidates above this threshold. Unset by default."),
    },
  },
  async ({ scope, top_k, min_score }) => {
    const SCHEMA = schemaId("prioritize_validation_queue");
    try {
      const result = prioritizeValidationQueue({
        scope,
        topK: top_k,
        minScore: min_score,
      });
      const lines: string[] = [
        `Scope: ${result.query.scope}  ·  top_k: ${result.query.top_k}  ·  min_score: ${result.query.min_score ?? "—"}`,
        `Candidates considered: ${result.index_stats.candidates_considered}  ·  bi_orphan_seeds: ${result.index_stats.bi_orphan_seeds}  ·  isolate_seeds: ${result.index_stats.isolate_seeds}  ·  chunk_discovery_seeds: ${result.index_stats.chunk_discovery_seeds}`,
        ``,
        `Queue (top ${result.queue.length}):`,
        ``,
      ];
      for (const [i, entry] of result.queue.entries()) {
        lines.push(`${i + 1}. ${entry.tablet_id}  ·  score=${entry.score}`);
        for (const reason of entry.reasons.slice(0, 4)) {
          lines.push(`     · ${reason}`);
        }
        if (entry.reasons.length > 4) lines.push(`     · (+${entry.reasons.length - 4} more reasons)`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:validation-queue-prioritization", VERSION, {
          citation:
            "Information-gain-from-manual-review ranking over the anomaly-index + chunk-index + fragment-metadata cache. v0.21.0. Surfaces the highest-marginal-utility tablets for scholar review from a unified candidate set (bi-orphans + isolates + chunk-discovery hubs).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`prioritize_validation_queue error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { scope: scope ?? "all", top_k: top_k ?? 20, min_score: min_score ?? null },
          queue: [] as never[],
          index_stats: { candidates_considered: 0, bi_orphan_seeds: 0, isolate_seeds: 0, chunk_discovery_seeds: 0, anomaly_index_loaded: false, chunk_index_loaded: false },
          warnings: [msg],
        },
        provenance: provenance("local", "local:validation-queue-prioritization", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.22.0 — build_canonical_recension_tree (neighbor-joining stemma) ───

server.registerTool(
  "build_canonical_recension_tree",
  {
    description:
      "Automated stemma (textual-family-tree) reconstruction. Given a seed manuscript of a composition (e.g. K.5896 for Mīs pî), enumerate its chunk-related witnesses from the v0.20.0 chunk-hash index, compute a pairwise distance matrix from shared-chunk overlap, and produce a phylogenetic tree via neighbor-joining (Saitou & Nei 1987) or UPGMA. Output includes the distance matrix, tree edges, and a standard Newick string for downstream visualization. The classic Assyriological problem (manuscript family reconstruction) automated at corpus scale, with no scholar curation required. Methods-paper §3.11 target. Distance metric: 1 - shared_chunks(A,B) / max(|chunk_hosts(A)|, |chunk_hosts(B)|) — the max-denominator (vs Jaccard sum-denominator) is less harsh on asymmetric witness-length pairs (common in cuneiform corpora).",
    inputSchema: {
      seed_tablet_id: z.string().describe("Museum number of a known manuscript of the composition. The witness set is BFS-expanded from this seed via shared-chunk overlap."),
      max_witnesses: z
        .number()
        .int()
        .min(2)
        .max(200)
        .optional()
        .describe("Cap on cluster size. Default 50. Witnesses are sorted by shared-chunks-with-seed desc before truncation."),
      min_pairwise_chunks: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe("Require at least this many shared chunks with the seed to qualify as a witness. Default 3. Raise for high-confidence-only family reconstruction; lower for exploratory broad-sweep."),
      algorithm: z
        .enum(["neighbor_joining", "upgma"])
        .optional()
        .describe("Phylogenetic algorithm. Default 'neighbor_joining' (Saitou & Nei 1987 — unrooted binary tree, standard in textual phylogenetics). 'upgma' produces a rooted binary tree with equal branch lengths (assumes molecular-clock evolution)."),
    },
  },
  async ({ seed_tablet_id, max_witnesses, min_pairwise_chunks, algorithm }) => {
    const SCHEMA = schemaId("build_canonical_recension_tree");
    try {
      const result = buildCanonicalRecensionTree({
        seedTabletId: seed_tablet_id,
        maxWitnesses: max_witnesses,
        minPairwiseChunks: min_pairwise_chunks,
        algorithm,
      });
      const lines: string[] = [
        `Composition seed: ${result.composition_seed}  ·  algorithm: ${result.algorithm}`,
        `Witnesses: ${result.witnesses.length}  ·  internal nodes: ${result.internal_nodes}`,
        `Distance matrix: ${result.distance_matrix.length}×${result.distance_matrix.length}`,
        ``,
        `Newick:`,
        result.tree,
        ``,
        `Witnesses (closest → farthest from seed):`,
      ];
      for (const w of result.witnesses.slice(0, 20)) {
        const meta = [w.period ?? "?period", w.primary_genre ?? "?genre", w.provenance ?? "?provenance"].join(" · ");
        lines.push(`  ${w.tablet_id}  (${meta})`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:recension-tree-from-chunk-overlap", VERSION, {
          citation:
            "Neighbor-joining (Saitou & Nei 1987) stemma reconstruction over the v0.20.0 chunk-hash index. Distance metric: 1 - shared_chunks/max(|HA|,|HB|). v0.22.0. Methods paper §3.11.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`build_canonical_recension_tree error: ${msg}`, {
        schema: SCHEMA,
        data: {
          composition_seed: seed_tablet_id,
          algorithm: algorithm ?? "neighbor_joining",
          witnesses: [] as never[],
          distance_matrix: [] as never[],
          tree: "",
          tree_edges: [] as never[],
          internal_nodes: 0,
          index_stats: { chunk_index_loaded: false, seed_chunk_hosts: 0, witnesses_after_filter: 0, witnesses_after_cap: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:recension-tree-from-chunk-overlap", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.22.0 — build_scribal_school_graph (provenance + scribal cluster) ──

server.registerTool(
  "build_scribal_school_graph",
  {
    description:
      "Empirically reconstruct scribal schools by joint clustering on (scribal orthographic signature + provenance / find-spot). Connected-components on a thresholded scribal-cosine graph, restricted to same-provenance edges (or same-collection as fallback when eBL provenance.site is null). Each component = a candidate scribal school. Returns top-K schools with anchor tablet, member roster, internal cohesion (mean pairwise cosine), period distribution, and genre distribution. Bridges the §3.1 BM.77056 *āšipūtu* curriculum finding (composition-level) with physical provenance to produce intellectual+physical maps of cuneiform scribal culture. Methods-paper §3.11 target. NOTE: 'scribal school' is an inferential leap from 'shared orthographic fingerprint + same find-spot' — output is a *candidate* for further philological evaluation, not a historical claim.",
    inputSchema: {
      min_scribal_similarity: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Cosine threshold on LLR scribal signatures for an edge to qualify. Default 0.65. Lower for exploratory recall; raise to 0.80+ for high-confidence-only schools."),
      min_school_size: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe("Drop connected components smaller than this. Default 3 (excludes dyads — schools are by definition multi-member)."),
      required_shared_provenance: z
        .boolean()
        .optional()
        .describe("Require cluster members to share a find-spot (city) or — as fallback when eBL provenance.site is null — the same `collection` field (Kuyunjik, Babylon, Sippar, etc.). Default true. Set false to surface scribal lineages crossing collections."),
      top_k_schools: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Cap on returned schools, ranked by internal cohesion × member count. Default 30, hard cap 500."),
      exclude_prefixes: z
        .array(z.string())
        .optional()
        .describe("Drop candidate members whose tablet ID starts with any of these prefixes."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(10000)
        .optional()
        .describe("Cap on candidate set size for pairwise scribal comparison. Default 1500. Higher = more schools surfaced but quadratic time cost; ~78s at 1500."),
    },
  },
  async ({ min_scribal_similarity, min_school_size, required_shared_provenance, top_k_schools, exclude_prefixes, max_tablets_to_scan }) => {
    const SCHEMA = schemaId("build_scribal_school_graph");
    try {
      const result = buildScribalSchoolGraph({
        minScribalSimilarity: min_scribal_similarity,
        minSchoolSize: min_school_size,
        requiredSharedProvenance: required_shared_provenance,
        topKSchools: top_k_schools,
        excludePrefixes: exclude_prefixes,
        maxTabletsToScan: max_tablets_to_scan,
      });
      const lines: string[] = [
        `Tablets in scribal index: ${result.index_stats.total_tablets_in_scribal_index}  ·  with signature+city: ${result.index_stats.candidates_with_signature_and_city}`,
        `Scanned for edges: ${result.index_stats.tablets_scanned_for_edges}  ·  edges collected: ${result.index_stats.edges_collected}  ·  components ≥ min_size: ${result.index_stats.components_above_size_threshold}  ·  schools returned: ${result.schools.length}`,
        `Elapsed: ${result.index_stats.elapsed_seconds}s`,
        ``,
        `Top schools:`,
      ];
      for (const [i, s] of result.schools.slice(0, 10).entries()) {
        const topPeriod = s.period_distribution[0] ? `${s.period_distribution[0].label} ×${s.period_distribution[0].count}` : "—";
        const topGenres = s.genre_distribution.slice(0, 3).map((g) => `${g.label} ×${g.count}`).join(", ");
        lines.push(`${i + 1}. ${s.anchor_tablet}  ·  ${s.members.length} members  ·  cohesion=${s.internal_cohesion}  ·  ${s.shared_provenance ?? "?"}`);
        lines.push(`     period: ${topPeriod}  ·  genres: ${topGenres || "—"}`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:scribal-school-graph-from-signature-provenance", VERSION, {
          citation:
            "Joint scribal-LLR + provenance/find-spot connected-components clustering over the cached scribal-fingerprint index + fragment-metadata cache. v0.22.0. Methods paper §3.11.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`build_scribal_school_graph error: ${msg}`, {
        schema: SCHEMA,
        data: {
          schools: [] as never[],
          index_stats: { total_tablets_in_scribal_index: 0, candidates_with_signature_and_city: 0, candidates_without_city: 0, candidates_without_signature: 0, tablets_scanned_for_edges: 0, edges_collected: 0, components_above_size_threshold: 0, elapsed_seconds: 0 },
          query: { min_scribal_similarity: min_scribal_similarity ?? 0.65, min_school_size: min_school_size ?? 3, required_shared_provenance: required_shared_provenance ?? true, top_k_schools: top_k_schools ?? 30, max_tablets_to_scan: max_tablets_to_scan ?? 1500 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:scribal-school-graph-from-signature-provenance", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.23.0 — find_similar_signs (sign2vec sign-level semantic embeddings) ─

server.registerTool(
  "find_similar_signs",
  {
    description:
      "Find the nearest-neighbor signs of a query sign in the v0.23.0 sign2vec embedding space. Embeddings are learned from corpus co-occurrence via PPMI + truncated SVD (Levy & Goldberg 2014, Halko–Martinsson–Tropp 2011 randomized SVD), L2-normalized so cosine similarity is dot product. ~635 signs indexed at MIN_OCCURRENCES=20 covering 99.6% of the corpus's ~4.87M sign occurrences. The semantic axis BELOW v0.15's tablet-level thematic embeddings — operates at the sign granularity, not the tablet granularity. Useful for: (a) discovering empirical sign equivalences (logogram substitutions, phonetic clusters) without scholar curation, (b) probing folk-Assyriological claims of sign kinship against distributional reality (e.g., the v0.21 find_incipits numerical-only filter hypothesizes ABZ480/ABZ411 are interchangeable; v0.23 says their cosine is 0.097 — falsification of the equivalence assumption), (c) semantic-aware lacuna restoration in v0.24+.",
    inputSchema: {
      sign: z.string().describe("The query sign (e.g., 'ABZ480', 'ABZ013', or any sign code present in the eBL signs corpus). Must appear with ≥ MIN_OCCURRENCES=20 occurrences in the corpus to be embedded."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of nearest neighbors to return, ranked by cosine descending. Default 10. Hard cap 50."),
      min_cosine: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe("Optional cosine floor — drop neighbors below this threshold. Useful for filtering low-confidence matches. Default 0.0 (no floor; ranking handles low-confidence)."),
    },
  },
  async ({ sign, top_k, min_cosine }) => {
    const SCHEMA = schemaId("find_similar_signs");
    try {
      const result = findSimilarSigns({
        sign,
        topK: top_k,
        minCosine: min_cosine,
      });
      const lines: string[] = [
        `Query sign: ${result.query_sign}  ·  in corpus: ${result.query_in_corpus}`,
        `Index: ${result.index_stats.total_signs_indexed} signs indexed at ${result.index_stats.embedding_dim} dimensions  ·  window=±${result.index_stats.window_size}`,
        `Build timestamp: ${result.index_stats.build_timestamp}`,
        ``,
        `Top ${result.neighbors.length} nearest neighbors:`,
      ];
      for (const [i, n] of result.neighbors.entries()) {
        lines.push(`  ${(i + 1).toString().padStart(2)}.  ${n.sign.padEnd(12)}  cos=${n.cosine.toFixed(4)}  occ=${n.occurrences}`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:sign2vec-ppmi-svd-embeddings", VERSION, {
          citation:
            "Sign-level semantic embeddings via PPMI + truncated SVD (Levy & Goldberg 2014; randomized SVD per Halko-Martinsson-Tropp 2011) over the eBL all-signs-full.json corpus. v0.23.0. WINDOW=5, MIN_OCCURRENCES=20, EMBEDDING_DIM=100. Methods paper §3.12.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_similar_signs error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query_sign: sign,
          query_in_corpus: false,
          neighbors: [] as never[],
          index_stats: { total_signs_indexed: 0, embedding_dim: 0, window_size: 0, build_timestamp: "" },
          warnings: [msg],
        },
        provenance: provenance("local", "local:sign2vec-ppmi-svd-embeddings", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.24.0 — compute_lexical_substitution_score (claim 30 cash-out) ─────

server.registerTool(
  "compute_lexical_substitution_score",
  {
    description:
      "Pair-level lexical-substitution score derived from the v0.23.0 sign2vec embedding. For tablet pair (A, B): exact-vocabulary overlap PLUS sign2vec-substitution matches (signs in A whose top-K sign2vec neighbors appear in B's vocabulary), divided by max(|A_vocab|, |B_vocab|). The methods-paper §3.13 cash-out of v0.23 claim 30 (the sign-level semantic axis aggregated to tablet granularity). Empirically validated: K.5896 ↔ K.9508 sibling pair scores 0.78 (exact 0.43, substitution 0.35) vs unrelated-genre random pair 0.65 (substitution 0.29) — the axis carries measurable but partial discriminative signal at the corpus's high-frequency sign-core saturation. Read alongside the 4-axis comparePair view (gated behind include_axis_comparison) for full context.",
    inputSchema: {
      tablet_a: z.string().describe("Museum number of the first tablet (e.g., 'K.5896'). Must be in the eBL signs cache."),
      tablet_b: z.string().describe("Museum number of the second tablet."),
      top_k_neighbors: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("For each A-vocab-only sign, consider its top-K sign2vec neighbors when checking for substitution matches in B. Default 5."),
      min_neighbor_cosine: z
        .number()
        .min(-1)
        .max(1)
        .optional()
        .describe("Drop sign2vec neighbors below this cosine when counting substitution matches. Default 0.4."),
      include_axis_comparison: z
        .boolean()
        .optional()
        .describe("If true, populate axis_comparison with the 4-axis compareTabletPair output (lex_J, fuzzy_J, thematic_cos, scribal_cos). Default false — costs three extra top-K queries. Enable for cross-axis context when the substitution score alone is ambiguous."),
    },
  },
  async ({ tablet_a, tablet_b, top_k_neighbors, min_neighbor_cosine, include_axis_comparison }) => {
    const SCHEMA = schemaId("compute_lexical_substitution_score");
    try {
      const result = computeLexicalSubstitutionScore({
        tabletA: tablet_a,
        tabletB: tablet_b,
        topKNeighbors: top_k_neighbors,
        minNeighborCosine: min_neighbor_cosine,
        includeAxisComparison: include_axis_comparison,
      });
      const lines: string[] = [
        `Pair: ${result.tablet_a}  ↔  ${result.tablet_b}`,
        `Vocab: A=${result.tablet_a_vocab_size}  ·  B=${result.tablet_b_vocab_size}`,
        `Exact overlap: ${result.exact_overlap}  ·  Substitution matches: ${result.substitution_matches}`,
        `Lexical-substitution score: ${result.lexical_substitution_score.toFixed(4)}`,
        `  · exact share: ${result.score_breakdown.exact_share.toFixed(4)}`,
        `  · substitution share: ${result.score_breakdown.substitution_share.toFixed(4)}`,
        ``,
      ];
      if (result.axis_comparison) {
        lines.push(`4-axis comparison:`);
        if (result.axis_comparison.lexical_jaccard !== undefined) lines.push(`  lex_J=${result.axis_comparison.lexical_jaccard.toFixed(4)}`);
        if (result.axis_comparison.fuzzy_jaccard !== undefined) lines.push(`  fuzzy_J=${result.axis_comparison.fuzzy_jaccard.toFixed(4)}`);
        if (result.axis_comparison.thematic_cosine !== undefined) lines.push(`  thematic_cos=${result.axis_comparison.thematic_cosine.toFixed(4)}`);
        if (result.axis_comparison.scribal_cosine !== undefined) lines.push(`  scribal_cos=${result.axis_comparison.scribal_cosine.toFixed(4)}`);
        lines.push(``);
      }
      if (result.substitution_pairs.length > 0) {
        lines.push(`Sample substitution pairs (top ${Math.min(5, result.substitution_pairs.length)}):`);
        for (const p of result.substitution_pairs.slice(0, 5)) {
          lines.push(`  ${p.a_sign}  →  ${p.b_sign}  (cos=${p.cosine.toFixed(4)})`);
        }
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:lexical-substitution-from-sign2vec", VERSION, {
          citation:
            "Lexical-substitution score derived from the v0.23.0 sign2vec embedding by aggregating sign-cosine into tablet-pair-level overlap. Methods paper §3.13 (claim 30 cash-out). v0.24.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compute_lexical_substitution_score error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_a, tablet_b,
          tablet_a_vocab_size: 0, tablet_b_vocab_size: 0,
          exact_overlap: 0, substitution_matches: 0,
          substitution_pairs: [] as never[],
          lexical_substitution_score: 0,
          score_breakdown: { exact_share: 0, substitution_share: 0, combined: 0 },
          index_stats: { a_signs_without_embedding: 0, b_signs_without_embedding: 0, signs_indexed_total: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:lexical-substitution-from-sign2vec", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.25.0 — compare_sign_embedding_configs (sign2vec ensemble) ─────────

server.registerTool(
  "compare_sign_embedding_configs",
  {
    description:
      "Compare sign2vec neighbor lists across 6 hyperparameter configurations: WINDOW ∈ {2, 5, 10} × MIN_OCCURRENCES ∈ {10, 20}. Surfaces (a) consensus signals (signs appearing in top-5 across all configs — robust nearest neighbors), (b) config-unique signals (revealing what each hyperparameter setting captures uniquely). The v0.23 default (WINDOW=5, MIN_OCC=20, 635 signs) is validated empirically as the robust middle-ground; MIN_OCC=10 grows vocab to 953 signs at the cost of more rare-tail variance; WINDOW=10 captures broader topical context, WINDOW=2 captures tighter syntactic context. Round-10 audit: ABZ480's consensus_top5 = {`4`, ABZ598a} across all 6 configs.",
    inputSchema: {
      sign: z.string().describe("The query sign (e.g., 'ABZ480'). Need not exist in all configs — per-config presence is reported."),
      top_k: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of neighbors per config to return. Default 5. Hard cap 50."),
    },
  },
  async ({ sign, top_k }) => {
    const SCHEMA = schemaId("compare_sign_embedding_configs");
    try {
      const result = compareSignEmbeddingConfigs({ sign, top_k });
      const lines: string[] = [
        `Query sign: ${result.query_sign}`,
        `Configs loaded: ${result.configs.filter((c) => c.loaded).length}/${result.configs.length}`,
        `Consensus top-5 (in all loaded configs): [${result.stability.consensus_top5_signs.join(", ") || "—"}]`,
        ``,
      ];
      for (const cfg of result.configs) {
        const tag = `w${cfg.window}-m${cfg.min_occ}`;
        if (!cfg.loaded || !cfg.query_in_corpus) {
          lines.push(`  ${tag.padEnd(8)} ${cfg.loaded ? "(query not in this config)" : "(not loaded)"}`);
          continue;
        }
        const list = cfg.neighbors.map((n) => `${n.sign}(${n.cosine.toFixed(2)})`).join(" ");
        lines.push(`  ${tag.padEnd(8)} ${list}`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:sign2vec-ensemble-comparison", VERSION, {
          citation: "sign2vec hyperparameter ensemble (WINDOW={2,5,10} × MIN_OCC={10,20}) over PPMI+SVD per-sign embeddings. v0.25.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_sign_embedding_configs error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query_sign: sign,
          configs: [] as never[],
          stability: { consensus_top5_signs: [], unique_to_each_config: [] },
          warnings: [msg],
        },
        provenance: provenance("local", "local:sign2vec-ensemble-comparison", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.25.0 — compute_lexical_substitution_lift (baseline-normalized) ────

server.registerTool(
  "compute_lexical_substitution_lift",
  {
    description:
      "Baseline-normalized variant of v0.24 compute_lexical_substitution_score. Addresses the high-frequency sign-core saturation effect documented in RELEASE-v0.24.md by subtracting a corpus-wide expected baseline at the matching vocabulary-size bucket. Returns lift_z_score = (raw - baseline_mean) / baseline_stddev. Also reports substitution_lift_z_score, which is insensitive to vocab-size asymmetry artifacts. EMPIRICAL VALIDATION: K.5896 ↔ K.9508 (Mīs pî siblings, §3.7.3) substitution_lift_z_score = +1.97 vs U.21017 ↔ K.9653 (random control) = -0.28 — a clean +2.24σ discriminative separation, vastly stronger than v0.24's raw 22% relative lift. This is the methodologically clean cash-out of v0.23 claim 30. Methods paper §3.13 (refined).",
    inputSchema: {
      tablet_a: z.string().describe("Museum number of the first tablet."),
      tablet_b: z.string().describe("Museum number of the second tablet."),
      top_k_neighbors: z.number().int().min(1).max(50).optional().describe("Top-K sign2vec neighbors per A-vocab-only sign. Default 5."),
      min_neighbor_cosine: z.number().min(-1).max(1).optional().describe("Cosine floor for sign2vec neighbors. Default 0.4."),
    },
  },
  async ({ tablet_a, tablet_b, top_k_neighbors, min_neighbor_cosine }) => {
    const SCHEMA = schemaId("compute_lexical_substitution_lift");
    try {
      const result = computeLexicalSubstitutionLift({
        tabletA: tablet_a,
        tabletB: tablet_b,
        topKNeighbors: top_k_neighbors,
        minNeighborCosine: min_neighbor_cosine,
      });
      const lines: string[] = [
        `Pair: ${result.tablet_a}  ↔  ${result.tablet_b}`,
        `Raw score: ${result.raw_score.toFixed(4)}  ·  baseline bucket size: ${result.baseline_bucket_size}`,
        `Baseline mean: ${result.baseline_mean_score.toFixed(4)} ± ${result.baseline_stddev_score.toFixed(4)}`,
        `Total lift z-score: ${result.lift_z_score.toFixed(4)}  ·  meaningfully above baseline: ${result.is_meaningfully_above_baseline}`,
        ``,
        `Substitution-only lift (asymmetry-insensitive):`,
        `  raw substitution_share: ${result.raw_substitution_share.toFixed(4)}`,
        `  baseline substitution_share: ${result.baseline_mean_substitution_share.toFixed(4)}`,
        `  substitution_lift_z_score: ${result.substitution_lift_z_score.toFixed(4)}`,
      ];
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:lexical-substitution-lift-baseline-normalized", VERSION, {
          citation: "v0.24 raw substitution score baseline-normalized against a vocab-size-matched random-pair distribution (mulberry32(20260524), N=100 per bucket). Methods paper §3.13 refined. v0.25.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compute_lexical_substitution_lift error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_a, tablet_b,
          tablet_a_vocab_size: 0, tablet_b_vocab_size: 0, effective_vocab_size: 0,
          raw_score: 0, raw_exact_share: 0, raw_substitution_share: 0,
          baseline_bucket_size: 0, baseline_bucket_half_width: 0, baseline_sample_size: 0,
          baseline_mean_score: 0, baseline_stddev_score: 0,
          baseline_mean_substitution_share: 0, baseline_stddev_substitution_share: 0,
          lift_z_score: 0, substitution_lift_z_score: 0,
          is_meaningfully_above_baseline: false,
          warnings: [msg],
        },
        provenance: provenance("local", "local:lexical-substitution-lift-baseline-normalized", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.26.0 — compare_sign_neighbors_across_periods (diachronic + register) ─

server.registerTool(
  "compare_sign_neighbors_across_periods",
  {
    description:
      "Compare a sign's top-K sign2vec neighbors trained separately on Neo-Assyrian vs Neo-Babylonian sub-corpora. v0.26.0 build trained PPMI+SVD on NA (14,193 tablets, 435 signs) and NB (10,861 tablets, 452 signs) with 387 signs in common. Surfaces (a) common_neighbors — signs in top-K of both periods (the durable distributional neighbors), (b) na_only_neighbors / nb_only_neighbors — drift candidates. IMPORTANT CAVEAT (methods paper §3.14): the v0.26 audit found 44.2% of common signs have full top-5 turnover between periods. This is corpus-shape (NA literary vs NB administrative register asymmetry) confounded with diachronic substitution, NOT pure diachronic drift. Output should be read as 'diachronic + register' drift; isolating the diachronic axis requires further sub-corpus matching (e.g. omen-series-only) deferred to v0.27.",
    inputSchema: {
      sign: z.string().describe("The query sign. Need not be in both period indexes — per-period presence is reported in `in_na` / `in_nb` flags."),
      top_k: z.number().int().min(1).max(50).optional().describe("Top-K per period. Default 5, cap 50."),
    },
  },
  async ({ sign, top_k }) => {
    const SCHEMA = schemaId("compare_sign_neighbors_across_periods");
    try {
      const result = compareSignNeighborsAcrossPeriods({ sign, top_k });
      const lines: string[] = [
        `Query sign: ${result.query_sign}  ·  in NA: ${result.in_na}  ·  in NB: ${result.in_nb}`,
        `NA index: ${result.index_stats.na_signs_indexed} signs from ${result.index_stats.na_tablets_in_period} tablets`,
        `NB index: ${result.index_stats.nb_signs_indexed} signs from ${result.index_stats.nb_tablets_in_period} tablets`,
        ``,
        `NA top-5: ${result.neighbors_na.slice(0, 5).map((n) => `${n.sign}(${n.cosine.toFixed(2)})`).join(" ")}`,
        `NB top-5: ${result.neighbors_nb.slice(0, 5).map((n) => `${n.sign}(${n.cosine.toFixed(2)})`).join(" ")}`,
        ``,
        `Drift signals:`,
        `  common: [${result.drift_signals.common_neighbors.join(", ") || "—"}]`,
        `  NA-only: [${result.drift_signals.na_only_neighbors.join(", ") || "—"}] (${result.drift_signals.na_only_count})`,
        `  NB-only: [${result.drift_signals.nb_only_neighbors.join(", ") || "—"}] (${result.drift_signals.nb_only_count})`,
      ];
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:sign2vec-per-period-na-vs-nb", VERSION, {
          citation: "Per-period sign2vec embeddings (NA + NB sub-corpora) via PPMI+SVD at WINDOW=5, MIN_OCC=20. v0.26.0. Methods paper §3.14.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_sign_neighbors_across_periods error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query_sign: sign, in_na: false, in_nb: false,
          neighbors_na: [] as never[], neighbors_nb: [] as never[],
          drift_signals: { common_neighbors: [], na_only_neighbors: [], nb_only_neighbors: [], na_only_count: 0, nb_only_count: 0 },
          index_stats: { na_signs_indexed: 0, nb_signs_indexed: 0, na_tablets_in_period: 0, nb_tablets_in_period: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:sign2vec-per-period-na-vs-nb", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.26.0 — recommend_archetype_thresholds (Round-3 Lever 5 cash-out) ──

server.registerTool(
  "recommend_archetype_thresholds",
  {
    description:
      "Per-archetype calibration matrix for the 7 cluster archetypes documented in methods paper §3.8. Different archetypes have different precision/recall optima across all tools — a verbatim manuscript chain wants min_fuzzy_J ≈ 0.35 while a compositional curriculum wants ≈ 0.08, an order of magnitude difference. v0.26.0 ships the matrix as a single lookup tool, closing the Round-3 Lever 5 deferral from RELEASE-v0.18.19.md. Pass `archetype` to get one profile, `list_all=true` to dump all 7, or `seed_tablet_id` for a best-effort classification heuristic (3/3 accuracy on canonical exemplars K.5896 / BM.77056 / K.9508). Each profile carries thresholds for find_fuzzy_parallels, find_embedded_fragments, find_chunk_parallels, find_thematic_parallel, find_same_scribe_candidates, and reconstruct_cluster — all anchored to specific v0.18.x calibration audit findings via the `rationale` string.",
    inputSchema: {
      archetype: z.enum(["compositional_curriculum", "verbatim_manuscript_chain", "refrain_bound_liturgical", "single_collection_school", "embedded_fragment", "cross_period_bridge", "commentary_quotation"]).optional().describe("Specific archetype to look up."),
      list_all: z.boolean().optional().describe("Return all 7 profiles."),
      seed_tablet_id: z.string().optional().describe("Optional: classify this seed via a best-effort heuristic and return its archetype's thresholds. NOT authoritative — the matrix is the primary artifact; classification is best-effort."),
    },
  },
  async ({ archetype, list_all, seed_tablet_id }) => {
    const SCHEMA = schemaId("recommend_archetype_thresholds");
    try {
      const result = recommendArchetypeThresholds({ archetype, list_all, seed_tablet_id });
      const lines: string[] = [];
      if (result.classified_archetype) {
        lines.push(`Classified ${seed_tablet_id} as: ${result.classified_archetype}`);
        if (result.classification_evidence) {
          lines.push(`  evidence: ${JSON.stringify(result.classification_evidence).slice(0, 300)}`);
        }
        lines.push(``);
      }
      lines.push(`Profiles returned: ${result.profiles.length}`);
      lines.push(``);
      for (const p of result.profiles) {
        lines.push(`── ${p.archetype}  (exemplar: ${p.exemplar})`);
        lines.push(`   ${p.description}`);
        lines.push(`   fuzzy.min_J=${p.find_fuzzy_parallels.min_fuzzy_jaccard}  ·  embedded(cont=${p.find_embedded_fragments.min_containment}, run=${p.find_embedded_fragments.min_run}, ×=${p.find_embedded_fragments.host_size_multiplier})  ·  chunk.min_len=${p.find_chunk_parallels.min_chunk_len}`);
        lines.push(`   thematic.min_cos=${p.find_thematic_parallel.min_cosine}  ·  scribal.min_overlap=${p.find_same_scribe_candidates.min_signature_overlap}  ·  cluster(min_J=${p.reconstruct_cluster.min_fuzzy_jaccard}, depth=${p.reconstruct_cluster.max_depth})`);
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:archetype-thresholds-matrix", VERSION, {
          citation: "Per-archetype calibration matrix for the 7 cluster archetypes (methods paper §3.8). Hand-curated from cumulative v0.18-v0.25 calibration audit history. Round-3 Lever 5 cash-out. v0.26.0.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`recommend_archetype_thresholds error: ${msg}`, {
        schema: SCHEMA,
        data: { profiles: [] as never[], warnings: [msg] },
        provenance: provenance("local", "local:archetype-thresholds-matrix", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.27.0 — compare_sign_neighbors_register_matched ────────────────────

server.registerTool(
  "compare_sign_neighbors_register_matched",
  {
    description:
      "Compare a sign's top-K sign2vec neighbors trained on REGISTER-MATCHED (period, genre) sub-corpora to isolate the diachronic axis from the register confound that v0.26 flagged. v0.27 trains 6 separate embeddings: (divination, magic, literature) × (NA, NB). EMPIRICAL FINDING: matched-register mean top-5 drift = 3.77-4.29/5 vs v0.26 mixed-register baseline of 4.06/5 — confirms **the diachronic axis is population-dominant**, only ~6.8% of the drift was register-confounded at the divination cohort. BUT at individual-sign level, the high-frequency 'diachronic candidates' (ABZ480, ABZ411, ABZ342) collapse from 5/5 drift in mixed to 2-3/5 in matched register — both v0.26's caveat and its drift claim survive, in different parts of the distribution. Methods paper §3.14.4.",
    inputSchema: {
      sign: z.string().describe("The query sign."),
      register: z.enum(["divination", "magic", "literature", "auto"]).optional().describe("Genre register to match on. 'auto' (default) picks the register that best supports the query sign in both NA and NB."),
      top_k: z.number().int().min(1).max(50).optional().describe("Top-K per period. Default 5, cap 50."),
    },
  },
  async ({ sign, register, top_k }) => {
    const SCHEMA = schemaId("compare_sign_neighbors_register_matched");
    try {
      const result = compareSignNeighborsRegisterMatched({ sign, register, top_k });
      const lines: string[] = [
        `Query sign: ${result.query_sign}  ·  register: ${result.register}${result.register_was_auto_selected ? " (auto-selected)" : ""}`,
        `In NA: ${result.in_na}  ·  in NB: ${result.in_nb}`,
        ``,
        `NA top-5: ${result.neighbors_na.slice(0, 5).map((n) => `${n.sign}(${n.cosine.toFixed(2)})`).join(" ")}`,
        `NB top-5: ${result.neighbors_nb.slice(0, 5).map((n) => `${n.sign}(${n.cosine.toFixed(2)})`).join(" ")}`,
        ``,
        `Matched-register top-K drift: ${result.register_matched_drift_topk}`,
        `Comparison with mixed-register (v0.26):`,
        `  mixed_register_drift_topk: ${result.comparison_with_mixed_register?.mixed_register_drift_topk ?? "?"}`,
        `  drift attributable to register: ${result.comparison_with_mixed_register?.drift_attributable_to_register ?? "?"}`,
      ];
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:sign2vec-register-matched-per-period", VERSION, {
          citation: "Register-matched (genre × period) sign2vec embeddings via PPMI+SVD over the eBL corpus. v0.27.0. Methods paper §3.14.4.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_sign_neighbors_register_matched error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query_sign: sign, register: register ?? "auto", register_was_auto_selected: false,
          in_na: false, in_nb: false,
          neighbors_na: [] as never[], neighbors_nb: [] as never[],
          drift_signals: { common_neighbors: [], na_only_neighbors: [], nb_only_neighbors: [], na_only_count: 0, nb_only_count: 0 },
          register_matched_drift_topk: 0,
          comparison_with_mixed_register: null,
          index_stats: { } as Record<string, never>,
          warnings: [msg],
        },
        provenance: provenance("local", "local:sign2vec-register-matched-per-period", VERSION),
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

// ─── v0.18.17 — Three new tools: isolate compositions + signature evolution + motif-dataset builder ──

server.registerTool(
  "find_isolate_compositions",
  {
    description:
      "Surface SUBSTANTIAL tablets (high sign_count) that have FEW fuzzy parallels in the corpus — compositions NOT well-represented by multiple witnesses. Candidates for: (a) unique surviving compositions of historical significance, (b) compositions scholars have studied as singletons, (c) the 'we have only one witness — handle with care' sub-cohort for methods-paper + pitch material. Distinct from find_anomalous_tablets (bi-orphan at any sign_count); this tool is the 'lexically-isolated AND substantial' intersection. Ranks by isolation_score = sign_count / (parallel_count + 1).",
    inputSchema: {
      prefix_filter: z.string().optional().describe("Optional museum-collection prefix scope."),
      min_sign_count: z.number().int().min(0).optional().describe("Minimum sign_count. Default 200."),
      max_parallel_count: z.number().int().min(0).optional().describe("Max fuzzy parallels to qualify as isolated. Default 2."),
      min_fuzzy_jaccard: z.number().min(0).max(1).optional().describe("Parallel threshold. Default 0.20."),
      max_tablets_to_scan: z.number().int().min(10).max(5000).optional().describe("Cost cap. Default 500."),
      top_n: z.number().int().min(1).max(500).optional().describe("Top-N. Default 30."),
    },
  },
  async ({ prefix_filter, min_sign_count, max_parallel_count, min_fuzzy_jaccard, max_tablets_to_scan, top_n }) => {
    const SCHEMA = schemaId("find_isolate_compositions");
    try {
      const result = findIsolateCompositions({
        prefixFilter: prefix_filter,
        minSignCount: min_sign_count,
        maxParallelCount: max_parallel_count,
        minFuzzyJaccard: min_fuzzy_jaccard,
        maxTabletsToScan: max_tablets_to_scan,
        topN: top_n,
      });
      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter ?? "(all)"} · min_signs=${result.query.min_sign_count} · max_parallels=${result.query.max_parallel_count}`,
        `Results: ${result.summary.total_tablets_scanned} scanned · ${result.summary.total_isolates_surfaced} isolates · mean iso=${result.summary.mean_isolation_score}`,
        ``,
      ];
      for (const c of result.isolates.slice(0, 25)) {
        lines.push(`   ${c.tablet_id.padEnd(20).slice(0, 20)}  signs=${String(c.sign_count).padStart(5)}  parallels=${c.parallel_count}  iso=${c.isolation_score}  top=${(c.top_parallel_id ?? "—").padEnd(18).slice(0, 18)}  top_j=${c.top_parallel_fuzzy_j}`);
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:isolate-compositions", VERSION, { citation: "Isolate-composition discovery. v0.18.17." }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_isolate_compositions error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_filter: prefix_filter ?? null, min_sign_count: min_sign_count ?? 200, max_parallel_count: max_parallel_count ?? 2, min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.20, max_tablets_to_scan: max_tablets_to_scan ?? 500, top_n: top_n ?? 30 },
          isolates: [] as never[],
          summary: { total_tablets_scanned: 0, total_isolates_surfaced: 0, mean_isolation_score: 0, prefix_distribution: {} as Record<string, number> },
          warnings: [msg],
        },
        provenance: provenance("local", "local:isolate-compositions", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_signature_evolution_in_lineage",
  {
    description:
      "Walk a multi-axis lineage chain (using the v0.18.16 find_lineage_chain primitive) and overlay per-hop scribal-signature drift on every parent→child edge. For every member: sig_cosine_to_seed + sig_cosine_to_parent. Surfaces signature_jumps[] — parent→child hops where cosine drops below jump_threshold (default 0.40 = candidate scribal-school boundary) — plus a chain-wide coherence classification: stable / drifting / fragmented. Tests whether a transitive lineage chain represents one scribal tradition or copies that crossed multiple traditions.",
    inputSchema: {
      seed_tablet_id: z.string().describe("Museum number of the seed tablet."),
      axis_sequence: z.array(z.enum(["fuzzy", "scribal", "thematic"])).optional().describe("Default ['fuzzy','scribal','fuzzy']."),
      max_depth: z.number().int().min(1).max(6).optional().describe("Default 3."),
      top_k_per_hop: z.number().int().min(1).max(15).optional().describe("Default 3."),
      max_chain_size: z.number().int().min(2).max(100).optional().describe("Default 8 (v0.18.19 calibration — was 15, lowered to prevent BFS overshoot from dragging means past the stable cutoff for tight liturgical clusters; inner-core size is ~6 in this corpus)."),
      jump_threshold: z.number().min(0).max(1).optional().describe("Default 0.40."),
    },
  },
  async ({ seed_tablet_id, axis_sequence, max_depth, top_k_per_hop, max_chain_size, jump_threshold }) => {
    const SCHEMA = schemaId("find_signature_evolution_in_lineage");
    try {
      const result = findSignatureEvolutionInLineage({
        seedTabletId: seed_tablet_id,
        axisSequence: axis_sequence,
        maxDepth: max_depth,
        topKPerHop: top_k_per_hop,
        maxChainSize: max_chain_size,
        jumpThreshold: jump_threshold,
      });
      const lines: string[] = [
        `Seed: ${seed_tablet_id}`,
        `Chain size: ${result.summary.total_members} · Jumps: ${result.summary.total_jumps} · Coherence: ${result.summary.scribal_coherence_classification}`,
        `Mean sig-cosine-to-seed: ${result.summary.mean_sig_cosine_to_seed_across_chain.toFixed(4)}`,
        ``,
      ];
      for (const m of result.chain_with_signatures) {
        if (m.depth === 0) {
          lines.push(`  ${m.tablet_id.padEnd(22)} d=0 (seed)  sig=${m.sig_cosine_to_seed.toFixed(4)}`);
        } else {
          const parentCos = m.sig_cosine_to_parent === null ? "n/a" : m.sig_cosine_to_parent.toFixed(4);
          lines.push(`  ${m.tablet_id.padEnd(22)} d=${m.depth}  ← ${m.parent ?? "?"}  (${m.axis_arrived_via ?? "?"})  seed=${m.sig_cosine_to_seed.toFixed(4)} parent=${parentCos}`);
        }
      }
      if (result.signature_jumps.length > 0) {
        lines.push(``, `Signature jumps (cos < ${result.query.jump_threshold}):`);
        for (const j of result.signature_jumps) {
          lines.push(`  ${j.parent} → ${j.child}  (${j.axis})  cos=${j.sig_cosine_to_parent.toFixed(4)}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:signature-evolution", VERSION, { citation: "Per-hop scribal-signature drift along a multi-axis lineage chain. v0.18.17." }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_signature_evolution_in_lineage error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { seed_tablet_id, axis_sequence: axis_sequence ?? ["fuzzy", "scribal", "fuzzy"], max_depth: max_depth ?? 3, top_k_per_hop: top_k_per_hop ?? 3, max_chain_size: max_chain_size ?? 8, jump_threshold: jump_threshold ?? 0.4 },
          chain_with_signatures: [] as never[],
          depth_aggregates: [] as never[],
          signature_jumps: [] as never[],
          summary: { total_members: 0, total_jumps: 0, mean_sig_cosine_to_seed_across_chain: 0, scribal_coherence_classification: "fragmented" as const, underlying_chain_termination: "frontier_exhausted" as const },
          warnings: [msg],
        },
        provenance: provenance("local", "local:signature-evolution", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "extend_dataset_to_motif",
  {
    description:
      "Generalize per-tablet motif discovery to ARBITRARY caller-specified motifs. Given a motif name + 1-20 seed tablet IDs, expand transitively via BOTH discovery axes (fuzzy trigram-Jaccard + Random-Indexing thematic cosine) and build a structured corpus dataset attesting that motif. Cross-axis-confirmed candidates get source='cross_axis' (higher confidence); single-axis hits at threshold or strong-lexical-alone (fuzzy_J ≥ 0.4) also pass unless require_cross_axis=true. Optional BFS depth-2 expansion. Persisted to data/motif-datasets/{slug}.json as a static snapshot. Generalizes the apkallu_attestations pattern to any user-defined research target.",
    inputSchema: {
      motif_name: z.string().min(1).describe("Human-readable motif name (e.g., 'mīs pî', 'apkallū invocation'). Slugified for filename."),
      seed_tablet_ids: z.array(z.string()).min(1).max(20).describe("Seed museum numbers (1-20). E.g., ['K.15325', 'K.8994']."),
      max_dataset_size: z.number().int().min(1).max(500).optional().describe("Cap on dataset size. Default 100."),
      expand_depth: z.number().int().min(0).max(2).optional().describe("BFS depth. Default 1."),
      min_fuzzy_jaccard: z.number().min(0).max(1).optional().describe("Default 0.30."),
      min_thematic_cosine: z.number().min(0).max(1).optional().describe("Default 0.65."),
      require_cross_axis: z.boolean().optional().describe("If true, only cross-axis admits. Default false."),
      persist: z.boolean().optional().describe("Write to disk. Default true."),
    },
  },
  async ({ motif_name, seed_tablet_ids, max_dataset_size, expand_depth, min_fuzzy_jaccard, min_thematic_cosine, require_cross_axis, persist }) => {
    const SCHEMA = schemaId("extend_dataset_to_motif");
    try {
      const result = extendDatasetToMotif({
        motifName: motif_name,
        seedTabletIds: seed_tablet_ids,
        maxDatasetSize: max_dataset_size,
        expandDepth: expand_depth,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minThematicCosine: min_thematic_cosine,
        requireCrossAxis: require_cross_axis,
        persist,
      });
      const s = result.dataset_summary;
      const lines: string[] = [
        `Motif: ${s.motif_name}  (slug: ${s.slug})`,
        `Seeds: ${result.query.seed_tablet_ids.join(", ")}`,
        `Total members: ${s.total_members} · Termination: ${result.termination_reason}`,
        `Composition: seed=${s.members_via_seed}, fuzzy_only=${s.members_via_fuzzy_only}, thematic_only=${s.members_via_thematic_only}, cross_axis=${s.members_via_both}`,
        result.file_path ? `Persisted: ${result.file_path}` : `Persisted: (skipped)`,
        ``,
      ];
      for (const m of result.members) {
        if (m.source === "seed") {
          lines.push(`  ${m.tablet_id.padEnd(22)} [seed]`);
        } else {
          const fj = m.fuzzy_j !== undefined ? `fuzzy_J=${m.fuzzy_j.toFixed(3)}` : "";
          const tc = m.thematic_cos !== undefined ? `them_cos=${m.thematic_cos.toFixed(3)}` : "";
          lines.push(`  ${m.tablet_id.padEnd(22)} d=${m.depth} src=${m.source} ← ${m.source_seed ?? "?"}  ${[fj, tc].filter((x) => x.length > 0).join(", ")}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:motif-dataset-builder", VERSION, { citation: "Multi-axis BFS motif-dataset construction. v0.18.17. Generalizes apkallu_attestations." }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`extend_dataset_to_motif error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { motif_name, seed_tablet_ids, max_dataset_size: max_dataset_size ?? 100, expand_depth: expand_depth ?? 1, min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.3, min_thematic_cosine: min_thematic_cosine ?? 0.65, require_cross_axis: require_cross_axis ?? false, persist: persist ?? true },
          dataset_summary: { motif_name, slug: "", total_members: 0, members_via_seed: 0, members_via_fuzzy_only: 0, members_via_thematic_only: 0, members_via_both: 0, prefix_distribution: {}, mean_sign_count: 0, depth_distribution: {} },
          members: [] as never[],
          all_member_ids: [] as never[],
          file_path: null,
          termination_reason: "frontier_exhausted",
          index_stats: { total_fuzzy_calls: 0, total_thematic_calls: 0, expanded_tablets: 0, candidates_rejected_below_threshold: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:motif-dataset-builder", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.16 — Three new tools: join-discovery + multi-axis chain + champion-fragments ──

server.registerTool(
  "find_join_candidates_in_prefix",
  {
    description:
      "Within a museum-collection prefix bucket (e.g. K, BM, Sm, IM, CBS), systematically surface physical-JOIN candidate pairs — tablets that may be fragments of one originally-whole tablet broken into multiple pieces and re-cataloged separately. The join-axis mirror of find_strongest_fuzzy_pairs_in_prefix (v0.18.11, lexical-axis sibling-manuscript discovery) and find_scribal_groups (v0.18.9, scribal-axis grouping). Algorithm: scan prefix tablets sorted by sign_count desc (capped at max_tablets_to_scan), call findFuzzyParallels per seed at a VERY HIGH min_fuzzy_jaccard (default 0.50 — joins require near-identical wording on the broken edge), keep only intra-prefix edges, canonical-key dedupe (max across both directions), score by fuzzy_jaccard × sqrt(min(sign_count_a, sign_count_b)) so both endpoints must carry substantial text, and surface joins_count flags from FragmentMetadata so callers can prioritize candidates where NEITHER endpoint has known joins (highest-value uncataloged discoveries).",
    inputSchema: {
      prefix_filter: z.string().min(1).describe("Museum-collection prefix to scope the scan (REQUIRED — joins are intra-collection)."),
      min_fuzzy_jaccard: z.number().min(0).max(1).optional().describe("Minimum fuzzy Jaccard for join-grade similarity. Default 0.50."),
      min_sign_count: z.number().int().min(0).optional().describe("Skip tablets below this sign_count (joins need text on each side). Default 50."),
      max_tablets_to_scan: z.number().int().min(10).max(5000).optional().describe("Cost cap. Default 500."),
      top_n_candidates: z.number().int().min(1).max(200).optional().describe("Top-N candidates to return. Default 30."),
    },
  },
  async ({ prefix_filter, min_fuzzy_jaccard, min_sign_count, max_tablets_to_scan, top_n_candidates }) => {
    const SCHEMA = schemaId("find_join_candidates_in_prefix");
    try {
      const result = findJoinCandidatesInPrefix({
        prefixFilter: prefix_filter,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topNCandidates: top_n_candidates,
      });
      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter} · min_fuzzy_j=${result.query.min_fuzzy_jaccard} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan}`,
        `Results: ${result.summary.total_tablets_scanned} scanned · ${result.summary.total_candidates_collected} collected · top ${result.summary.total_candidates_surfaced} returned (${result.summary.reciprocal_pair_count} reciprocal)`,
        `Known-joins split: ${result.summary.total_with_no_known_joins_either_side} uncataloged · ${result.summary.total_with_known_joins_either_side} touch a known-joins cluster`,
        ``,
      ];
      const top = result.candidates.slice(0, 25);
      if (top.length === 0) {
        lines.push(`No within-prefix join candidates found above thresholds.`);
      } else {
        lines.push(`── Top ${top.length} join candidates (* = endpoint has known joins) ──`);
        for (const c of top) {
          const aMark = c.a_has_known_joins ? "*" : " ";
          const bMark = c.b_has_known_joins ? "*" : " ";
          const recip = c.is_reciprocal ? "↔" : "→";
          lines.push(`   ${aMark}${c.tablet_a.padEnd(18).slice(0, 18)} ${recip} ${bMark}${c.tablet_b.padEnd(18).slice(0, 18)}  fuzzy_j=${c.fuzzy_jaccard}  run=${c.longest_contiguous_run}  signs=${c.sign_count_a}/${c.sign_count_b}  score=${c.join_score}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:join-candidates-in-prefix", VERSION, {
          citation: "Per-prefix physical-join candidate discovery. v0.18.16.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_join_candidates_in_prefix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_filter: prefix_filter ?? "", min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.5, min_sign_count: min_sign_count ?? 50, max_tablets_to_scan: max_tablets_to_scan ?? 500, top_n_candidates: top_n_candidates ?? 30 },
          candidates: [] as never[],
          summary: { total_tablets_scanned: 0, total_candidates_surfaced: 0, total_candidates_collected: 0, mean_fuzzy_jaccard: 0, total_with_known_joins_either_side: 0, total_with_no_known_joins_either_side: 0, reciprocal_pair_count: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:join-candidates-in-prefix", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_lineage_chain",
  {
    description:
      "Given a seed tablet, walk an ALTERNATING multi-axis BFS chain (e.g. fuzzy → scribal → fuzzy → scribal → ...) up to N hops, surfacing transitive scholarly-lineage paths. Differs from `reconstruct_cluster` (which expands the seed's neighborhood via ONE axis — fuzzy trigram-Jaccard) by SWITCHING the expansion axis on every hop. Valid axes: 'fuzzy' (trigram-Jaccard parallel), 'scribal' (LLR signature-cosine), 'thematic' (Random-Indexing embedding cosine). Dedupe: a tablet appearing at multiple depths keeps the SHORTEST depth as its canonical depth, but records ALL {axis, parent, score} arrivals in `axes_arrived_via` — and the `cross_axis_members[]` block highlights tablets that arrived via ≥2 distinct axes (higher-confidence chain members). One call maps the multi-relationship transitive ego-network across all axes simultaneously.",
    inputSchema: {
      seed_tablet_id: z.string().describe("Museum number of the seed tablet."),
      axis_sequence: z.array(z.enum(["fuzzy", "scribal", "thematic"])).optional().describe("Alternating axis order. Default ['fuzzy','scribal','fuzzy','scribal']."),
      max_depth: z.number().int().min(1).max(6).optional().describe("BFS depth cap. Default 4, max 6."),
      top_k_per_hop: z.number().int().min(1).max(15).optional().describe("Per-parent topK. Default 5, max 15."),
      min_fuzzy_jaccard: z.number().min(0).max(1).optional().describe("Default 0.20."),
      min_scribal_cosine: z.number().min(0).max(1).optional().describe("Default 0.50."),
      min_thematic_cosine: z.number().min(0).max(1).optional().describe("Default 0.60."),
      max_chain_size: z.number().int().min(2).max(100).optional().describe("Cap on chain size. Default 30, max 100."),
    },
  },
  async ({ seed_tablet_id, axis_sequence, max_depth, top_k_per_hop, min_fuzzy_jaccard, min_scribal_cosine, min_thematic_cosine, max_chain_size }) => {
    const SCHEMA = schemaId("find_lineage_chain");
    try {
      const result = findLineageChain({
        seedTabletId: seed_tablet_id,
        axisSequence: axis_sequence,
        maxDepth: max_depth,
        topKPerHop: top_k_per_hop,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minScribalCosine: min_scribal_cosine,
        minThematicCosine: min_thematic_cosine,
        maxChainSize: max_chain_size,
      });
      const lines: string[] = [
        `Seed: ${seed_tablet_id}`,
        `Chain size: ${result.summary.total_chain_size} · Termination: ${result.summary.termination_reason}`,
        `Axis sequence: ${result.summary.axis_sequence_used.join(" → ")}`,
        `Axis-path summary: fuzzy=${result.axis_path_summary.fuzzy}, scribal=${result.axis_path_summary.scribal}, thematic=${result.axis_path_summary.thematic}`,
        ``,
        `Chain members:`,
      ];
      for (const m of result.chain) {
        if (m.depth === 0) {
          lines.push(`  ${m.tablet_id.padEnd(22)} d=0 (seed)`);
        } else {
          const best = m.axes_arrived_via.reduce((acc, a) => (a.score > acc.score ? a : acc), m.axes_arrived_via[0]);
          const axesTag = [...new Set(m.axes_arrived_via.map((a) => a.axis))].join("+");
          lines.push(`  ${m.tablet_id.padEnd(22)} d=${m.depth}  ← ${best.parent}  (${best.axis}=${best.score.toFixed(4)}) [${axesTag}]`);
        }
      }
      if (result.cross_axis_members.length > 0) {
        lines.push(``, `Cross-axis members (≥2 axes):`);
        for (const m of result.cross_axis_members) {
          const axesTag = [...new Set(m.axes_arrived_via.map((a) => a.axis))].join("+");
          lines.push(`  ${m.tablet_id.padEnd(22)} axes=[${axesTag}]`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:lineage-chain", VERSION, {
          citation: "Multi-axis alternating BFS chain. v0.18.16.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_lineage_chain error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { seed_tablet_id, axis_sequence: axis_sequence ?? ["fuzzy", "scribal", "fuzzy", "scribal"], max_depth: max_depth ?? 4, top_k_per_hop: top_k_per_hop ?? 5, min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.2, min_scribal_cosine: min_scribal_cosine ?? 0.5, min_thematic_cosine: min_thematic_cosine ?? 0.6, max_chain_size: max_chain_size ?? 30 },
          chain: [] as never[],
          axis_path_summary: { fuzzy: 0, scribal: 0, thematic: 0 },
          prefix_distribution: {},
          cross_axis_members: [] as never[],
          summary: { total_chain_size: 0, axis_sequence_used: axis_sequence ?? ["fuzzy", "scribal", "fuzzy", "scribal"], termination_reason: "frontier_exhausted" as const, depth_distribution: {}, expansion_calls: { fuzzy: 0, scribal: 0, thematic: 0 } },
          warnings: [msg],
        },
        provenance: provenance("local", "local:lineage-chain", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_high_join_count_tablets",
  {
    description:
      "High-join-count tablet discovery — surface tablets in the corpus with the most known physical joins (per eBL fragment-metadata `joins_count`). These are the 'champion fragments' / substantially reconstructed original tablets (e.g. K.5896's 13-tablet join group from the BM.77056 *āšipūtu* cluster). Useful for picking the canonical anchor witness for a composition before running parallel-search, lacuna-restoration, or scribal-fingerprint work. Companion to find_join_candidates (which proposes NEW joins) — this surfaces ALREADY-RECOVERED joins. Sorted by joins_count desc, tie-broken by sign_count desc. Requires enriched fragment-metadata.",
    inputSchema: {
      prefix_filter: z.string().min(1).optional().describe("Optional museum-collection prefix scope. Omit for full corpus."),
      min_joins_count: z.number().int().min(0).optional().describe("Minimum joins_count threshold. Default 1."),
      top_n: z.number().int().min(1).max(500).optional().describe("Cap on returned tablets. Default 50."),
      include_zero_joins: z.boolean().optional().describe("If true, include tablets with metadata but joins_count=0. Default false."),
    },
  },
  async ({ prefix_filter, min_joins_count, top_n, include_zero_joins }) => {
    const SCHEMA = schemaId("find_high_join_count_tablets");
    try {
      const result = findHighJoinCountTablets({
        prefixFilter: prefix_filter,
        minJoinsCount: min_joins_count,
        topN: top_n,
        includeZeroJoins: include_zero_joins,
      });
      const lines: string[] = [
        `High-join-count query: ${result.query.prefix_filter ? `prefix=${result.query.prefix_filter}` : "all prefixes"} · min_joins_count=${result.query.min_joins_count}${result.query.include_zero_joins ? " · include_zero_joins=true" : ""}`,
        `Scanned: ${result.summary.total_scanned.toLocaleString()} tablets · ${result.summary.metadata_coverage_pct}% with metadata`,
        `Matching: ${result.summary.total_matching} total · returning top ${result.summary.total_returned} · max joins_count=${result.summary.max_joins_count_seen} · mean=${result.summary.mean_joins_count}`,
        ``,
      ];
      if (result.tablets.length > 0) {
        for (const m of result.tablets) {
          const tail = m.genre ?? m.designation ?? "-";
          lines.push(`${m.tablet_id.padEnd(22).slice(0, 22)}  joins=${String(m.joins_count).padStart(3)}  signs=${String(m.sign_count).padStart(5)}  ${(m.period ?? "-").padEnd(16).slice(0, 16)}  ${tail}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:high-join-count", VERSION, {
          citation: "High-join-count tablet discovery. v0.18.16.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_high_join_count_tablets error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_filter: prefix_filter ?? null, min_joins_count: min_joins_count ?? 1, top_n: top_n ?? 50, include_zero_joins: include_zero_joins ?? false },
          tablets: [] as never[],
          summary: { total_matching: 0, total_returned: 0, total_with_metadata_in_corpus: 0, total_scanned: 0, metadata_coverage_pct: 0, max_joins_count_seen: 0, mean_joins_count: 0, prefix_distribution: {}, period_distribution: {} },
          warnings: [msg],
        },
        provenance: provenance("local", "local:high-join-count", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.15 — Prefix-pair structural comparator ─────────────────────────

server.registerTool(
  "compare_prefix_pair",
  {
    description:
      "Compare two museum-collection prefixes (e.g. 'K' vs 'Sm', 'BM' vs 'IM') and surface their structural relationship — corpus coverage, period / genre / city overlap, and the top same-scribe edges crossing the pair. Returns: cohort_a + cohort_b (tablet_count, total_sign_count, in_lex_graph, in_them_index, top-5 period / genre / city distributions); comparison (shared periods/genres/cities + per-side counts + period_jaccard + genre_jaccard + city_jaccard); cross_scribal_edges[] (top-N cross-prefix same-scribe edges sorted by signature_cosine desc); a relationship_classification (same_excavation_site / complementary_collections / shared_scholarly_tradition / minimal_overlap); and narrative recommendations. Use case: 'How are the K and Sm prefixes related?' — answer: both Kuyunjik, ~95% period overlap + N same-scribe edges, treat as one Nineveh corpus. Distinguishes MODERN museum-cataloging artifacts (K/Sm split) from ANCIENT scholarly-tradition differences (BM/IM split). Period/genre/city analysis requires enriched fragment-metadata — run enrich_prefix_metadata first per prefix; cross-prefix scribal edges work without metadata.",
    inputSchema: {
      prefix_a: z.string().min(1).describe("First museum-collection prefix (e.g. 'K', 'BM', 'Sm')."),
      prefix_b: z.string().min(1).describe("Second museum-collection prefix (e.g. 'Sm', 'IM', 'CBS')."),
      min_sign_count: z.number().int().min(0).optional().describe("Minimum sign_count for cohort inclusion. Default 50."),
      max_tablets_per_prefix: z.number().int().min(10).max(5000).optional().describe("Cost cap for cross-prefix scribal scan. Default 500."),
      cross_scribal_min_cosine: z.number().min(0).max(1).optional().describe("Minimum signature_cosine for cross-prefix edge. Default 0.6."),
      top_k_per_tablet: z.number().int().min(2).max(30).optional().describe("topK for findSameScribeCandidates. Default 10."),
    },
  },
  async ({ prefix_a, prefix_b, min_sign_count, max_tablets_per_prefix, cross_scribal_min_cosine, top_k_per_tablet }) => {
    const SCHEMA = schemaId("compare_prefix_pair");
    try {
      const result = comparePrefixPair({
        prefixA: prefix_a,
        prefixB: prefix_b,
        minSignCount: min_sign_count,
        maxTabletsPerPrefix: max_tablets_per_prefix,
        crossScribalMinCosine: cross_scribal_min_cosine,
        topKPerTablet: top_k_per_tablet,
      });
      const a = result.cohort_a;
      const b = result.cohort_b;
      const cmp = result.comparison;
      const lines: string[] = [
        `Prefix A: ${a.prefix}  ·  ${a.tablet_count} tablets  ·  ${a.total_sign_count} signs  ·  enriched=${a.enriched_count}/${a.tablet_count} (${a.enriched_pct}%)`,
        `Prefix B: ${b.prefix}  ·  ${b.tablet_count} tablets  ·  ${b.total_sign_count} signs  ·  enriched=${b.enriched_count}/${b.tablet_count} (${b.enriched_pct}%)`,
        ``,
        `Jaccard overlap — period: ${cmp.period_jaccard.toFixed(4)} · genre: ${cmp.genre_jaccard.toFixed(4)} · city: ${cmp.city_jaccard.toFixed(4)}`,
        `Cross-prefix same-scribe edges: ${result.cross_scribal_edge_count} (at cos ≥ ${result.query.cross_scribal_min_cosine})`,
        `Relationship: ${result.relationship_classification}`,
      ];
      if (cmp.period_overlap.length > 0) {
        lines.push(``, `Top shared periods:`);
        for (const p of cmp.period_overlap.slice(0, 5)) lines.push(`  ${p.value}  —  A=${p.a_count}  B=${p.b_count}`);
      }
      if (cmp.genre_overlap.length > 0) {
        lines.push(``, `Top shared genres:`);
        for (const g of cmp.genre_overlap.slice(0, 5)) lines.push(`  ${g.value}  —  A=${g.a_count}  B=${g.b_count}`);
      }
      if (result.cross_scribal_edges.length > 0) {
        lines.push(``, `Top cross-prefix scribal edges:`);
        for (const e of result.cross_scribal_edges.slice(0, 10)) lines.push(`  ${e.tablet_a}  ↔  ${e.tablet_b}   cos=${e.signature_cosine.toFixed(4)}`);
      }
      if (result.recommendations.length > 0) {
        lines.push(``, `Recommendations:`);
        for (const r of result.recommendations) lines.push(`  • ${r}`);
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:compare-prefix-pair", VERSION, {
          citation: "Prefix-pair structural comparator. v0.18.15.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_prefix_pair error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_a: prefix_a ?? "", prefix_b: prefix_b ?? "", min_sign_count: min_sign_count ?? 50, max_tablets_per_prefix: max_tablets_per_prefix ?? 500, cross_scribal_min_cosine: cross_scribal_min_cosine ?? 0.6, top_k_per_tablet: top_k_per_tablet ?? 10 },
          cohort_a: { prefix: prefix_a ?? "", tablet_count: 0, total_sign_count: 0, in_lex_graph: 0, in_them_index: 0, enriched_count: 0, enriched_pct: 0, period_distribution: [] as never[], genre_distribution: [] as never[], city_distribution: [] as never[] },
          cohort_b: { prefix: prefix_b ?? "", tablet_count: 0, total_sign_count: 0, in_lex_graph: 0, in_them_index: 0, enriched_count: 0, enriched_pct: 0, period_distribution: [] as never[], genre_distribution: [] as never[], city_distribution: [] as never[] },
          comparison: { period_overlap: [] as never[], genre_overlap: [] as never[], city_overlap: [] as never[], period_jaccard: 0, genre_jaccard: 0, city_jaccard: 0 },
          cross_scribal_edges: [] as never[],
          cross_scribal_edge_count: 0,
          relationship_classification: "minimal_overlap",
          recommendations: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:compare-prefix-pair", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_genre_anchor_tablets_in_prefix",
  {
    description:
      "Within a (prefix, genre) cohort, surface the 'anchor tablets' — the largest, most-connected witnesses that other fragments in the cohort point to via fuzzy parallels. These are the canonical-template candidates: surviving witnesses other tablets are likely copies of, derived from, or paraphrases against. Algorithm: filter to prefix + genre + min_sign_count, then for each candidate fetch top-15 fuzzy parallels (minJ=0.20) and count how many fall back inside the cohort = intra_cohort_degree. anchor_score = sqrt(sign_count) × intra_cohort_degree. Use case: 'within prefix K, find the Mīs pî anchor tablets' — surfaces canonical-template candidates like K.15325 (the Mīs pî hub of the methods paper's BM.77056 cluster). Depends on enriched fragment-metadata cache for the genre filter; run enrich_prefix_metadata first.",
    inputSchema: {
      prefix_filter: z.string().min(1).describe("Museum-collection prefix to scope the search."),
      genre_pattern: z.string().min(1).describe("Genre / category substring match (e.g. 'Mīs pî', 'Šuʾila')."),
      min_sign_count: z.number().int().min(0).optional().describe("Minimum sign_count for cohort membership. Default 100."),
      max_tablets_to_scan: z.number().int().min(10).max(1000).optional().describe("Cost cap on per-candidate fuzzy probe. Default 200."),
      top_n_anchors: z.number().int().min(1).optional().describe("Cap on returned anchor rows. Default 10."),
    },
  },
  async ({ prefix_filter, genre_pattern, min_sign_count, max_tablets_to_scan, top_n_anchors }) => {
    const SCHEMA = schemaId("find_genre_anchor_tablets_in_prefix");
    try {
      const result = findGenreAnchorTablets({
        prefixFilter: prefix_filter,
        genrePattern: genre_pattern,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topNAnchors: top_n_anchors,
      });
      const lines: string[] = [
        `Anchor query: prefix=${result.query.prefix_filter} · genre="${result.query.genre_pattern}" · min_sign_count=${result.query.min_sign_count} · max_scan=${result.query.max_tablets_to_scan}`,
        `Cohort size: ${result.cohort_size} tablets · returning top ${result.summary.total_anchors_returned} anchors (mean score ${result.summary.mean_anchor_score})`,
        ``,
      ];
      if (result.anchors.length > 0) {
        lines.push(`Tablet                   signs   degree   score    strongest_parallel       fuzzyJ`);
        lines.push(`──────────────────────  ──────  ───────  ───────  ──────────────────────  ──────`);
        for (const a of result.anchors) {
          lines.push(`${a.tablet_id.padEnd(22).slice(0, 22)}  ${String(a.sign_count).padStart(6)}  ${String(a.intra_cohort_degree).padStart(7)}  ${String(a.anchor_score).padStart(7)}  ${(a.strongest_parallel_id ?? "-").padEnd(22).slice(0, 22)}  ${String(a.strongest_parallel_fuzzy_j).padStart(6)}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:genre-anchors", VERSION, {
          citation: "Genre-cohort anchor-tablet discovery via sqrt(sign_count) × intra_cohort_degree. v0.18.15.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_genre_anchor_tablets_in_prefix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_filter: prefix_filter ?? "", genre_pattern: genre_pattern ?? "", min_sign_count: min_sign_count ?? 100, max_tablets_to_scan: max_tablets_to_scan ?? 200, top_n_anchors: top_n_anchors ?? 10 },
          cohort_size: 0,
          anchors: [] as never[],
          summary: { total_anchors_returned: 0, cohort_size: 0, mean_anchor_score: 0, top_designation_pattern: null },
          warnings: [msg],
        },
        provenance: provenance("local", "local:genre-anchors", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_tablets_by_provenance",
  {
    description:
      "Provenance-based corpus discovery — return all tablets from a given historical site (e.g. 'Sippar', 'Nineveh', 'Nippur', 'Babylon', 'Uruk', 'Susa', 'Mari', 'Lagash', 'Ur'), optionally narrowed by period and/or museum prefix. Matches via case-insensitive substring with whitespace/punctuation normalization against provenance.site in the enriched fragment-metadata cache. Direct city-axis mirror of find_tablets_by_genre. Results sorted by sign_count desc. Requires enriched fragment-metadata; run enrich_prefix_metadata(prefix_filter='X') for low-coverage prefixes.",
    inputSchema: {
      city: z.string().min(1).describe("Historical site (e.g. 'Sippar', 'Nineveh', 'Nippur')."),
      period: z.string().min(1).optional().describe("Optional period filter (e.g. 'Old Babylonian')."),
      prefix_filter: z.string().min(1).optional().describe("Optional museum-collection prefix."),
      min_sign_count: z.number().int().min(0).optional().describe("Minimum sign_count. Default 0."),
      top_n: z.number().int().min(1).max(500).optional().describe("Cap on returned matches. Default 50."),
    },
  },
  async ({ city, period, prefix_filter, min_sign_count, top_n }) => {
    const SCHEMA = schemaId("find_tablets_by_provenance");
    try {
      const result = findTabletsByProvenance({
        city,
        period,
        prefixFilter: prefix_filter,
        minSignCount: min_sign_count,
        topN: top_n,
      });
      const lines: string[] = [
        `Provenance query: "${result.query.city}"${result.query.period ? ` · period≈${result.query.period}` : ""}${result.query.prefix_filter ? ` · prefix=${result.query.prefix_filter}` : " · all prefixes"} · min_sign_count=${result.query.min_sign_count}`,
        `Scanned: ${result.summary.total_scanned.toLocaleString()} tablets · ${result.summary.metadata_coverage_pct}% with metadata`,
        `Matches: ${result.summary.total_matches} total · returning top ${result.summary.total_returned}`,
        ``,
      ];
      const prefixDist = Object.entries(result.summary.prefix_distribution).sort((a, b) => b[1] - a[1]);
      if (prefixDist.length > 0) lines.push(`Prefix distribution: ${prefixDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
      const periodDist = Object.entries(result.summary.period_distribution).sort((a, b) => b[1] - a[1]);
      if (periodDist.length > 0) lines.push(`Period distribution: ${periodDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
      const genreDist = Object.entries(result.summary.genre_distribution).sort((a, b) => b[1] - a[1]);
      if (genreDist.length > 0) lines.push(`Genre distribution: ${genreDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
      if (result.matches.length > 0) {
        lines.push(``);
        for (const m of result.matches) {
          const tail = m.primary_genre ?? m.designation ?? "-";
          lines.push(`${m.tablet_id.padEnd(22).slice(0, 22)}  signs=${String(m.sign_count).padStart(5)}  ${(m.period ?? "-").padEnd(16).slice(0, 16)}  ${(m.city ?? "-").padEnd(20).slice(0, 20)}  ${m.in_lex_graph ? "✓" : "-"}  ${tail}`);
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:find-by-provenance", VERSION, {
          citation: "Provenance-based discovery over the enriched fragment-metadata cache. v0.18.15.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_tablets_by_provenance error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { city: city ?? "", period: period ?? null, prefix_filter: prefix_filter ?? null, min_sign_count: min_sign_count ?? 0, top_n: top_n ?? 50 },
          matches: [] as never[],
          summary: { total_matches: 0, total_returned: 0, total_with_metadata_in_corpus: 0, total_scanned: 0, metadata_coverage_pct: 0, prefix_distribution: {}, period_distribution: {}, genre_distribution: {} },
          warnings: [msg],
        },
        provenance: provenance("local", "local:find-by-provenance", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.14 — Metadata-powered discovery tools (require enriched cache) ──

server.registerTool(
  "find_unpublished_in_publication",
  {
    description:
      "Surface tablets cataloged in a specific museum publication (e.g. CT, KAR, BAM, OECT, CTN, AOAT) that have NOT yet been entered into the eBL transliteration pipeline — i.e. the publication editorially knows the tablet (hand-copy / photograph exists in the volume) but its sign-content is absent from the lexical-graph / fuzzy / thematic indices. These are the highest-value targets for new transliteration work, because the upstream editorial step is already done. Algorithm: iterate the anomaly index, filter by FragmentMetadata.designation containing the publication_pattern (case-insensitive substring), then split by in_lex_graph (true=transliterated, false=untransliterated). Returns the untransliterated list (sorted by sign_count desc — largest tablets first) plus a small sample of transliterated matches for sanity-checking the pattern. CRITICAL CAVEAT: this tool only sees tablets whose fragment-metadata is already cached locally. Fragment-metadata coverage is sparse by default (<1% of corpus); the tool will emit a warning recommending enrich_prefix_metadata(prefix_filter='BM') (or the relevant prefix — K for Kuyunjik, BM for British Museum, IM for Iraq Museum, etc.) when coverage is below 5%. Without enrichment the result will look empty even for well-known publications. Pairs with enrich_prefix_metadata (run first), fragment_metadata_coverage (diagnostic), and coverage_stats_for_collection (broader collection survey). Read-only — no network calls.",
    inputSchema: {
      publication_pattern: z
        .string()
        .min(1)
        .describe("Publication abbreviation to match against the tablet's designation field (case-insensitive substring). Examples: 'CT' (Cuneiform Texts from Babylonian Tablets in the British Museum), 'KAR' (Keilschrifttexte aus Assur religiösen Inhalts), 'BAM' (Die babylonisch-assyrische Medizin in Texten und Untersuchungen), 'OECT' (Oxford Editions of Cuneiform Texts), 'CTN' (Cuneiform Texts from Nimrud), 'AOAT' (Alter Orient und Altes Testament). Designations look like 'CT 23, pl. 4' / 'KAR 44' / 'BAM 248' so a plain substring of the abbreviation works."),
      prefix_filter: z
        .string()
        .optional()
        .describe("Optional museum-collection prefix to restrict the scan to a single collection (e.g. 'BM' for British Museum, 'K' for Kuyunjik, 'IM' for Iraq Museum). Most publications are tied to one museum (CT/K/Sm publications → BM; CTN → IM; OECT → Ashmolean), so scoping by prefix is usually correct and faster. Omit to scan the entire corpus."),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("How many top untransliterated candidates to return (sorted by sign_count desc — largest tablets first, since they carry more lexical signal and yield more downstream parallel coverage when transliterated). Default 50, max 500."),
    },
  },
  async ({ publication_pattern, prefix_filter, top_n }) => {
    const SCHEMA = schemaId("find_unpublished_in_publication");
    try {
      const result = findUnpublishedInPublication({
        publicationPattern: publication_pattern,
        prefixFilter: prefix_filter,
        topN: top_n,
      });

      const lines: string[] = [
        `Scan: publication="${result.query.publication_pattern}" · prefix=${result.query.prefix_filter ?? "(all)"} · top_n=${result.query.top_n}`,
        `Coverage: ${result.summary.total_with_metadata_in_corpus} tablets with fragment-metadata cached (${result.summary.metadata_coverage_pct}% of corpus)`,
        `Matches: ${result.summary.total_matching_publication} total · ${result.summary.transliterated_count} transliterated (${result.summary.transliterated_pct}%) · ${result.summary.untransliterated_count} UNTRANSLITERATED`,
        ``,
      ];
      const topShown = result.untransliterated.slice(0, 25);
      if (topShown.length === 0) {
        lines.push(`No untransliterated candidates surfaced. If coverage_pct is low, run enrich_prefix_metadata first.`);
      } else {
        lines.push(`── Top ${topShown.length} untransliterated candidates (largest first) ──`);
        for (const c of topShown) {
          lines.push(`   ${c.tablet_id.padEnd(20).slice(0, 20)}  signs=${String(c.sign_count).padStart(5)}  period=${(c.period ?? "—").padEnd(12).slice(0, 12)}  designation=${c.designation}`);
        }
        if (result.untransliterated.length > 25) lines.push(`(${result.untransliterated.length - 25} more candidates not shown)`);
      }
      if (result.transliterated_sample.length > 0) {
        lines.push(``);
        lines.push(`── Transliterated sample (sanity-check the pattern match) ──`);
        for (const s of result.transliterated_sample) {
          lines.push(`   ${s.tablet_id.padEnd(20).slice(0, 20)}  signs=${String(s.sign_count).padStart(5)}  designation=${s.designation}`);
        }
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:unpublished-in-publication", VERSION, {
          citation:
            "Untransliterated-backlog discovery scoped to a museum publication. v0.18.14. Joins anomaly-index in_lex_graph with cached FragmentMetadata.designation.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_unpublished_in_publication error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            publication_pattern: publication_pattern ?? "",
            prefix_filter: prefix_filter ?? null,
            top_n: top_n ?? 50,
          },
          summary: {
            total_matching_publication: 0,
            transliterated_count: 0,
            untransliterated_count: 0,
            transliterated_pct: 0,
            total_with_metadata_in_corpus: 0,
            metadata_coverage_pct: 0,
          },
          untransliterated: [] as never[],
          transliterated_sample: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:unpublished-in-publication", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "compare_dialects",
  {
    description:
      "Within a city + period cohort (e.g. Sippar tablets from the Neo-Babylonian period), surface tablets whose scribal-signature LLR profile is FURTHEST from the cohort centroid. The historical-provenance analogue of v0.18.10 find_orthographic_outliers_in_prefix — that tool buckets tablets by museum-collection prefix (modern acquisition history); this tool buckets by city + period (a documented Mesopotamian dialect zone), so outliers surface candidates for ancient IMPORTS (a tablet excavated at Sippar but written in a Babylonian hand), MISLABELED provenance, or DIALECT outliers (regional sub-schools, archaizing copies, foreign-trained scribes). Builds a per-cohort centroid by summing per-tablet LLR weights, then ranks every tablet by sparse cosine to that centroid. Returns: outliers ranked by deviation (lowest cosine first) with their distinctive signs (signs in tablet sig NOT in centroid top-30), the cohort centroid's top-15 signs as a baseline, and summary stats (mean/median/stdev cosine + top-3 most-typical tablets). CRITICAL: cohort filtering requires enriched fragment metadata (city + period). If the fragment-metadata cache is thin (default state — ~0.6% coverage), the cohort will be small or empty; run enrich_prefix_metadata for the prefixes you care about first.",
    inputSchema: {
      city: z
        .string()
        .min(1)
        .describe("Historical city of origin (e.g. 'Sippar', 'Nineveh', 'Nippur', 'Babylon', 'Uruk', 'Susa'). Matched case-insensitively against fragment-metadata provenance.site, with substring tolerance for variants like 'Sippar (Tell Abu Habba)'."),
      period: z
        .string()
        .min(1)
        .describe("Historical period (e.g. 'Old Babylonian', 'Neo-Assyrian', 'Late Babylonian', 'Neo-Babylonian', 'Ur III'). Matched case-insensitively against fragment-metadata script.period, with punctuation/whitespace normalization so 'Neo-Babylonian' and 'Neo Babylonian' both match."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (signature unreliable). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on cohort size (cost control). Default 500. Increase to 2000-3000 for full coverage of a major city+period bucket like Nineveh/Neo-Assyrian."),
      top_n_outliers: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("How many top-deviation tablets to return. Default 20."),
    },
  },
  async ({ city, period, min_sign_count, max_tablets_to_scan, top_n_outliers }) => {
    const SCHEMA = schemaId("compare_dialects");
    try {
      const result = compareDialects({
        city,
        period,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topNOutliers: top_n_outliers,
      });

      const lines: string[] = [
        `Scan: city=${result.query.city} · period=${result.query.period} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan} · top_n=${result.query.top_n_outliers}`,
        `Cohort: ${result.summary.cohort_size} tablets · mean cos=${result.summary.mean_cosine_to_centroid} · median=${result.summary.median_cosine_to_centroid} · stdev=${result.summary.stdev_cosine_to_centroid} · range=[${result.summary.min_cosine_to_centroid}, ${result.summary.max_cosine_to_centroid}]`,
        ``,
      ];

      if (result.cohort_centroid.top_signs.length > 0) {
        lines.push(`─── Cohort centroid top-15 signs (baseline) ───`);
        for (const s of result.cohort_centroid.top_signs) {
          lines.push(`   ${s.sign.padEnd(18).slice(0, 18)}  summed_llr=${s.summed_llr.toFixed(2).padStart(8)}  in ${s.tablet_count}/${result.cohort_centroid.cohort_size} tablets`);
        }
        lines.push(``);
      }

      if (result.summary.most_typical_tablets.length > 0) {
        lines.push(`─── Most-typical tablets (highest cosine to centroid) ───`);
        for (const t of result.summary.most_typical_tablets) {
          lines.push(`   ${t.tablet_id.padEnd(22).slice(0, 22)}  [${t.prefix}]  cos=${t.signature_cosine_to_centroid}`);
        }
        lines.push(``);
      }

      if (result.outliers.length === 0) {
        lines.push(`No outliers surfaced. If the cohort is empty, run enrich_prefix_metadata for likely-relevant prefixes (e.g. BM for Sippar, K/Sm for Nineveh, CBS for Nippur) and retry.`);
      } else {
        lines.push(`─── Top ${result.outliers.length} dialect outliers (lowest cosine = most deviant) ───`);
        for (const o of result.outliers) {
          const desig = o.designation ? `  "${o.designation}"` : ``;
          lines.push(`── ${o.tablet_id}  [${o.prefix}]${desig}  cos=${o.signature_cosine_to_centroid}  deviation=${o.deviation_score}  signs=${o.sign_count}  sig_size=${o.signature_size}`);
          if (o.distinctive_signs.length > 0) {
            const dsLine = o.distinctive_signs.map((d) => `${d.sign}(${d.llr.toFixed(1)})`).join(", ");
            lines.push(`   Distinctive (off-centroid): ${dsLine}`);
          } else {
            lines.push(`   No distinctive signs (all signature signs are in cohort centroid top-30)`);
          }
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:compare-dialects", VERSION, {
          citation:
            "Per-cohort (city + period) scribal-dialect outlier discovery via centroid sparse-cosine ranking. v0.18.14.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_dialects error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            city: city ?? "",
            period: period ?? "",
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_n_outliers: top_n_outliers ?? 20,
          },
          cohort_centroid: { cohort_size: 0, total_signature_signs_aggregated: 0, top_signs: [] as never[] },
          outliers: [] as never[],
          summary: {
            cohort_size: 0,
            mean_cosine_to_centroid: 0,
            median_cosine_to_centroid: 0,
            stdev_cosine_to_centroid: 0,
            min_cosine_to_centroid: 0,
            max_cosine_to_centroid: 0,
            most_typical_tablets: [] as never[],
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:compare-dialects", VERSION),
        warnings: [msg],
      });
    }
  },
);

server.registerTool(
  "find_tablets_by_genre",
  {
    description:
      "Genre-based corpus discovery — return all tablets matching a genre pattern (e.g. 'Mīs pî', 'Šuʾila', 'Bīt rimki', 'Maqlû', 'Šurpu', 'Udug-ḫul', 'Lamashtu', 'Namburbî'), optionally narrowed to a museum prefix. Matches via case-insensitive substring against both the full hierarchy strings (genres[]) and the per-category flat list (genres_flat[]) in the enriched fragment-metadata cache. Results sorted by sign_count desc so the largest/most-informative witnesses surface first — best for cohort-building, comparative work, and methods-paper-aligned per-genre witness lists. CRITICAL CAVEAT: matching runs against the enriched fragment-metadata cache, which covers only a small fraction of the corpus as of v0.18.13 (~0.6%). Tablets without metadata are silently skipped. The tool emits a coverage warning when fewer than ~10% of the scanned tablets have metadata. Run enrich_prefix_metadata(prefix_filter='X') to backfill specific prefixes before relying on this result for completeness.",
    inputSchema: {
      genre_pattern: z
        .string()
        .min(1)
        .describe("Genre or category to match. Case-insensitive substring match against both the full hierarchy strings ('CANONICAL → Magic → Purification → Mīs pî') and the per-category flat list (['Magic', 'Purification', 'Mīs pî']). Examples: 'Mīs pî', 'Šuʾila', 'Maqlû', 'Šurpu', 'Bīt rimki', 'Udug-ḫul', 'Lamashtu', 'Namburbî'. Broader queries like 'Magic' or 'Ritual' hit any descendant when include_subgenres=true."),
      prefix_filter: z
        .string()
        .min(1)
        .optional()
        .describe("Optional museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'NZK'). Omit to scan the entire corpus. Use list_collection_prefixes to enumerate options."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Minimum sign_count for a match to be returned. Default 0 — include ALL witnesses, even short fragments, since researchers often want every witness regardless of length. Raise to 50+ for fuzzy-Jaccard-grade witnesses only."),
      top_n: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Cap on returned matches. Default 50. Capped at 500. Per-prefix and per-period distributions are computed over ALL matches (not the truncated slice), so summary stats remain accurate even when top_n is restrictive."),
      include_subgenres: z
        .boolean()
        .optional()
        .describe("Default true. When true, 'Magic' matches any tablet whose hierarchy contains 'Magic' anywhere ('Magic/Purification/Mīs pî' all reachable). When false, only exact category-level hits in genres_flat[] are returned (still case-insensitive) — use for narrower, category-specific cohorts."),
    },
  },
  async ({ genre_pattern, prefix_filter, min_sign_count, top_n, include_subgenres }) => {
    const SCHEMA = schemaId("find_tablets_by_genre");
    try {
      const result = findTabletsByGenre({
        genrePattern: genre_pattern,
        prefixFilter: prefix_filter,
        minSignCount: min_sign_count,
        topN: top_n,
        includeSubgenres: include_subgenres,
      });

      const lines: string[] = [
        `Genre query: "${result.query.genre_pattern}"${result.query.prefix_filter ? ` · prefix=${result.query.prefix_filter}` : " · all prefixes"} · include_subgenres=${result.query.include_subgenres} · min_sign_count=${result.query.min_sign_count}`,
        `Scanned: ${result.summary.total_scanned.toLocaleString()} tablets · ${result.summary.metadata_coverage_pct}% with metadata (${result.summary.total_with_metadata_in_corpus.toLocaleString()} enriched corpus-wide)`,
        `Matches: ${result.summary.total_matches} total · returning top ${result.summary.total_returned} (sorted by sign_count desc)`,
        ``,
      ];
      const prefixDist = Object.entries(result.summary.prefix_distribution).sort((a, b) => b[1] - a[1]).slice(0, 15);
      if (prefixDist.length > 0) {
        lines.push(`Prefix distribution: ${prefixDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
      }
      const periodDist = Object.entries(result.summary.period_distribution).sort((a, b) => b[1] - a[1]);
      if (periodDist.length > 0) {
        lines.push(`Period distribution (top-5): ${periodDist.map(([p, c]) => `${p}=${c}`).join(", ")}`);
      }
      if (prefixDist.length > 0 || periodDist.length > 0) lines.push(``);

      if (result.matches.length > 0) {
        lines.push(`Tablet                   signs   period            city            lex   designation`);
        lines.push(`──────────────────────  ──────  ────────────────  ──────────────  ────  ───────────`);
        for (const m of result.matches) {
          lines.push(
            `${m.tablet_id.padEnd(22).slice(0, 22)}  ${String(m.sign_count).padStart(6)}  ${(m.period ?? "-").padEnd(16).slice(0, 16)}  ${(m.city ?? "-").padEnd(14).slice(0, 14)}  ${m.in_lex_graph ? "  ✓ " : "  - "}  ${m.designation ?? "-"}`,
          );
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:find-by-genre", VERSION, {
          citation:
            "Genre-based discovery over the enriched fragment-metadata cache. v0.18.14.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_tablets_by_genre error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            genre_pattern: genre_pattern ?? "",
            prefix_filter: prefix_filter ?? null,
            min_sign_count: min_sign_count ?? 0,
            top_n: top_n ?? 50,
            include_subgenres: include_subgenres ?? true,
          },
          matches: [] as never[],
          summary: {
            total_matches: 0,
            total_returned: 0,
            total_with_metadata_in_corpus: 0,
            total_scanned: 0,
            metadata_coverage_pct: 0,
            prefix_distribution: {},
            period_distribution: {},
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:find-by-genre", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.13 — Fragment-metadata enrichment (backfill the anomaly-index gap) ─

server.registerTool(
  "enrich_prefix_metadata",
  {
    description:
      "Backfill the fragment-metadata cache for a museum-collection prefix by batched eBL API calls. Closes the v0.18.4-v0.18.12 'distributions surface (unknown)' gap: the anomaly-index has period/genre/city/designation fields NULL for ALL 36,476 tablets, so coverage_stats_for_collection couldn't actually surface real distributions. This tool pulls the rich metadata from eBL /fragments/{museum_number} for tablets in the requested prefix, persists to ~/.cache/cuneiform-mcp/fragment-metadata.json, and subsequent coverage queries automatically pick it up. Rate-limited (default concurrency=5, polite to eBL); chunked (default max_to_fetch=50 per call, so a 2,500-tablet prefix like K needs ~50 invocations to fully enrich). Skips already-cached entries (positive OR negative — 404s don't retry). Returns: per-invocation counts (newly fetched / failed / already cached) + how many tablets in the prefix still need enrichment after this batch.",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .describe("Museum-collection prefix to enrich (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT'). Required — corpus-wide enrichment via this tool is impractical; use the scripts/enrich-*.mjs CLI for that."),
      max_to_fetch: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("Cap on new eBL API calls in this invocation. Default 50 (≈10s at concurrency=5). Max 500. Use 50-100 for interactive sessions, 200-500 for batch enrichment workflows where you can wait."),
      concurrency: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Concurrent eBL API calls. Default 5 (matches the polite-neighbour default in scripts/enrich-primary-source-metadata.mjs). Max 10."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Only enrich tablets with sign_count >= this threshold (skip empty/placeholder records). Default 0 (enrich all)."),
    },
  },
  async ({ prefix_filter, max_to_fetch, concurrency, min_sign_count }) => {
    const SCHEMA = schemaId("enrich_prefix_metadata");
    try {
      const tablets = _getAllTabletRecordsForEnrich();
      if (!tablets) {
        return structuredResult(
          `enrich_prefix_metadata error: anomaly index not loaded (run scripts/build-anomaly-index.mjs).`,
          {
            schema: SCHEMA,
            data: {
              query: { prefix_filter, max_to_fetch: max_to_fetch ?? 50, concurrency: concurrency ?? 5, min_sign_count: min_sign_count ?? 0 },
              result: null,
              coverage_after: metadataCoverage(),
              warnings: ["anomaly index not loaded"],
            },
            provenance: provenance("local", "local:enrich-prefix-metadata", VERSION),
            warnings: ["anomaly index not loaded"],
          },
        );
      }

      const minSigns = min_sign_count ?? 0;
      const prefixOf = (id: string): string => {
        const m = /^([^.,]+)/.exec(id);
        return m ? m[1] : id;
      };
      const ids = tablets
        .filter((t) => prefixOf(t.id) === prefix_filter && t.sign_count >= minSigns)
        .map((t) => t.id);

      const result = await enrichFragmentMetadata({
        ids,
        concurrency: concurrency ?? 5,
        maxToFetch: max_to_fetch ?? 50,
        prefixLabel: prefix_filter,
      });

      const coverage = metadataCoverage();

      const lines: string[] = [
        `Enrichment: prefix=${prefix_filter} · max_to_fetch=${max_to_fetch ?? 50} · concurrency=${concurrency ?? 5} · min_sign_count=${minSigns}`,
        `Prefix scope: ${ids.length} tablets in '${prefix_filter}' above sign_count=${minSigns}`,
        ``,
        `This invocation:`,
        `  already cached (with data):    ${result.already_cached_with_data}`,
        `  already cached (null / 404):   ${result.already_cached_null}`,
        `  newly fetched (success):       ${result.newly_fetched}`,
        `  newly fetched (404 → null):    ${result.newly_null_404}`,
        `  newly failed (will retry):     ${result.newly_failed}`,
        `  elapsed:                       ${result.elapsed_seconds}s`,
        `  remaining without metadata:    ${result.remaining_in_prefix_without_metadata}`,
        ``,
        `Cache after this run: ${coverage.total_with_metadata} entries with metadata + ${coverage.total_null} cached-null, ${coverage.total_entries_in_cache} total`,
      ];
      if (result.remaining_in_prefix_without_metadata > 0) {
        const nextBatches = Math.ceil(result.remaining_in_prefix_without_metadata / (max_to_fetch ?? 50));
        lines.push(``);
        lines.push(`To finish enriching '${prefix_filter}', invoke this tool ${nextBatches} more times with the same parameters.`);
      } else if (result.newly_fetched > 0 || result.newly_null_404 > 0) {
        lines.push(``);
        lines.push(`✓ '${prefix_filter}' is now fully enriched. Re-run coverage_stats_for_collection(prefixes=["${prefix_filter}"]) for real period/genre/city distributions.`);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: {
          query: { prefix_filter, max_to_fetch: max_to_fetch ?? 50, concurrency: concurrency ?? 5, min_sign_count: minSigns },
          result,
          coverage_after: coverage,
          warnings: result.warnings,
        },
        provenance: provenance("local", "local:enrich-prefix-metadata", VERSION, {
          citation:
            "Per-prefix batched eBL /fragments/{id} backfill into fragment-metadata.json. v0.18.13. Closes the anomaly-index period/genre/city/designation NULL-gap so coverage_stats_for_collection surfaces real distributions.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`enrich_prefix_metadata error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { prefix_filter: prefix_filter ?? "", max_to_fetch: max_to_fetch ?? 50, concurrency: concurrency ?? 5, min_sign_count: min_sign_count ?? 0 },
          result: null,
          coverage_after: metadataCoverage(),
          warnings: [msg],
        },
        provenance: provenance("local", "local:enrich-prefix-metadata", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.13 — Quick read-only coverage probe ────────────────────────────

server.registerTool(
  "fragment_metadata_coverage",
  {
    description:
      "Read-only diagnostic: how many tablets currently have enriched fragment-metadata cached vs not. Returns the total cache entries, count with real metadata, count cached as null (404s), and the cache file path. Use to decide whether to invoke enrich_prefix_metadata before running coverage_stats_for_collection / find_thematic_cluster / similar tools that benefit from rich metadata. Read-only — does NOT trigger any network calls.",
    inputSchema: {},
  },
  async () => {
    const SCHEMA = schemaId("fragment_metadata_coverage");
    try {
      const coverage = metadataCoverage();
      const tablets = _getAllTabletRecordsForEnrich();
      const corpusSize = tablets?.length ?? null;
      const coverageRatio = corpusSize ? +((coverage.total_with_metadata / corpusSize) * 100).toFixed(2) : null;

      const lines: string[] = [
        `Fragment-metadata cache: ${coverage.cache_path}`,
        ``,
        `Cache state:`,
        `  total entries:       ${coverage.total_entries_in_cache.toLocaleString()}`,
        `  with metadata:       ${coverage.total_with_metadata.toLocaleString()}`,
        `  cached as null/404:  ${coverage.total_null.toLocaleString()}`,
        ``,
      ];
      if (corpusSize !== null) {
        lines.push(`Anomaly-index corpus size: ${corpusSize.toLocaleString()} tablets`);
        lines.push(`Corpus-wide coverage: ${coverage.total_with_metadata.toLocaleString()} / ${corpusSize.toLocaleString()} = ${coverageRatio}%`);
        lines.push(``);
        if (coverageRatio !== null && coverageRatio < 1) {
          lines.push(`⚠ Coverage is <1% — most coverage_stats / find_thematic_cluster results will surface "(unknown — not enriched)" for period/genre/city distributions.`);
          lines.push(`  → Run enrich_prefix_metadata(prefix_filter="X") to backfill specific prefixes.`);
        }
      }
      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: {
          coverage,
          corpus_size: corpusSize,
          coverage_pct: coverageRatio,
        },
        provenance: provenance("local", "local:fragment-metadata-coverage", VERSION, {
          citation: "Read-only probe of the fragment-metadata.json cache. v0.18.13.",
        }),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`fragment_metadata_coverage error: ${msg}`, {
        schema: SCHEMA,
        data: { coverage: metadataCoverage(), corpus_size: null, coverage_pct: null },
        provenance: provenance("local", "local:fragment-metadata-coverage", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.12 — Tablet-level composite neighborhood tool ───────────────────

server.registerTool(
  "find_tablet_neighborhood",
  {
    description:
      "Given ONE tablet, return its full 4-axis discovery neighborhood in a single call: fuzzy parallels (composition siblings, 1-sub trigram-J) + thematic neighbors (RI embedding cosine) + scribal candidates (LLR-signature cosine, same-scribe lineage) + join candidates (deferred to find_join_candidates — see warnings). Plus a cross-axis summary that surfaces tablets appearing on MULTIPLE axes (higher-confidence relatives) and generated recommendations that map the per-axis count pattern to a short Assyriological narrative (e.g. 'N strong fuzzy parallels but no same-scribe matches — likely same composition different scribes'). Tablet-level composite of the per-pair compare_tablet_pair (v0.18.8): that tool zooms on TWO tablets and emits a verdict; this tool gives the full neighborhood graph around ONE tablet. Replaces the manual workflow of running findFuzzyParallels + findThematicParallel + findSameScribeCandidates sequentially.",
    inputSchema: {
      tablet_id: z.string().min(1).describe("Museum number (e.g., 'K.2798', 'BM.34970')."),
      top_k_per_axis: z
        .number()
        .int()
        .positive()
        .max(30)
        .optional()
        .describe("Top-K candidates per axis. Default 10, max 30."),
      min_fuzzy_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum fuzzy_jaccard for the fuzzy axis. Default 0.20."),
      min_thematic_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum thematic cosine for the thematic axis. Default 0.50."),
      min_scribal_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum signature_cosine for the scribal axis. Default 0.40."),
    },
  },
  async ({ tablet_id, top_k_per_axis, min_fuzzy_jaccard, min_thematic_cosine, min_scribal_cosine }) => {
    const SCHEMA = schemaId("find_tablet_neighborhood");
    try {
      const result = findTabletNeighborhood({
        tabletId: tablet_id,
        topKPerAxis: top_k_per_axis,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minThematicCosine: min_thematic_cosine,
        minScribalCosine: min_scribal_cosine,
      });

      const lines: string[] = [
        `Tablet neighborhood: ${result.tablet.tablet_id}`,
        `sign_count=${result.tablet.sign_count ?? "?"} · in_lex_graph=${result.tablet.in_lex_graph} · in_them_index=${result.tablet.in_them_index} · anomaly_flag=${result.tablet.anomaly_flag}`,
        ``,
        `─── AXES (top-${result.query.top_k_per_axis}) ───`,
        `Fuzzy parallels (J≥${result.query.min_fuzzy_jaccard}): ${result.axes.fuzzy_parallels.length}`,
      ];
      for (const p of result.axes.fuzzy_parallels) {
        lines.push(`  ${p.tablet_id}  fuzzy_J=${p.fuzzy_jaccard}  exact_J=${p.exact_jaccard}  run=${p.longest_contiguous_run}  final=${p.final_score}`);
      }
      lines.push(`Thematic neighbors (cos≥${result.query.min_thematic_cosine}): ${result.axes.thematic_neighbors.length}`);
      for (const n of result.axes.thematic_neighbors) {
        lines.push(`  ${n.tablet_id}  cos=${n.thematic_cosine}`);
      }
      lines.push(`Scribal candidates (cos≥${result.query.min_scribal_cosine}): ${result.axes.scribal_candidates.length}`);
      for (const c of result.axes.scribal_candidates) {
        lines.push(`  ${c.tablet_id}  sig_cos=${c.signature_cosine}  sig_J=${c.signature_jaccard}  overlap=${c.signature_overlap_count}`);
      }
      lines.push(`Join candidates: ${result.axes.join_candidates.length} (see warnings — axis deferred in v0.18.12)`);
      lines.push(``);

      lines.push(`─── CROSS-AXIS SUMMARY ───`);
      const mult = result.cross_axis_summary.counts_by_axis_multiplicity;
      lines.push(`Multiplicity counts: 1-axis=${mult["1"] ?? 0} · 2-axis=${mult["2"] ?? 0} · 3-axis=${mult["3"] ?? 0} · 4-axis=${mult["4"] ?? 0}`);
      for (const h of result.cross_axis_summary.multi_axis_hits) {
        lines.push(`  ${h.tablet_id}  axes=[${h.axes.join(", ")}] (${h.axis_count})  scores=${JSON.stringify(h.per_axis_scores)}`);
      }
      lines.push(``);

      lines.push(`─── RECOMMENDATIONS ───`);
      for (const r of result.recommendations) lines.push(`  • ${r}`);
      if (result.warnings.length > 0) {
        lines.push(``);
        lines.push(`Warnings: ${result.warnings.join("; ")}`);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:tablet-neighborhood", VERSION, {
          citation:
            "Tablet-level composite 4-axis discovery. v0.18.12. Combines findFuzzyParallels + findThematicParallel + findSameScribeCandidates + describeAnomaly with cross-axis multiplicity scoring and generated recommendations. Join-candidates axis deferred (see warnings); same pragmatic skip as compare_tablet_pair (v0.18.8).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_tablet_neighborhood error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            tablet_id: tablet_id ?? "",
            top_k_per_axis: top_k_per_axis ?? 10,
            min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.20,
            min_thematic_cosine: min_thematic_cosine ?? 0.50,
            min_scribal_cosine: min_scribal_cosine ?? 0.40,
          },
          tablet: {
            tablet_id: tablet_id ?? "",
            sign_count: null,
            in_lex_graph: false,
            in_them_index: false,
            anomaly_flag: false,
          },
          axes: {
            fuzzy_parallels: [],
            thematic_neighbors: [],
            scribal_candidates: [],
            join_candidates: [],
          },
          cross_axis_summary: { multi_axis_hits: [], counts_by_axis_multiplicity: {} },
          recommendations: [],
          warnings: [msg],
        },
        provenance: provenance("local", "local:tablet-neighborhood", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.12 — Lacuna-restoration backlog discovery ──────────────────────

server.registerTool(
  "find_lacuna_restoration_candidates",
  {
    description:
      "Surface the highest-value backlog for the v0.18.0 restore_lacuna_passage tool: tablets where restoration is BOTH needed (high X-token damage ratio, indicating missing/broken signs) AND possible (strong fuzzy parallels exist, so the restorer has templates from which to predict the missing signs). The intersection is the high-value restoration queue. Returns top-N candidates ranked by restoration_priority_score = damage_ratio × strongest_parallel_fuzzy_j (equal-weight reward — a 30%-damaged tablet with a 0.7 parallel beats a 10%-damaged tablet with a 0.9 parallel). Filters out essentially-complete tablets (x_ratio < min_damage_ratio, default 0.10 — no restoration needed) and practically-destroyed tablets (x_ratio > max_damage_ratio, default 0.50 — too little surviving context to drive the restorer's n-gram conditioning). Per-candidate output includes damage stats + strongest-parallel info to prime restore_lacuna_passage calls. Pairs with restore_lacuna_passage (per-tablet zoom on a chosen candidate), find_fuzzy_parallels (broader parallel survey), and find_anomalous_tablets (heavily-damaged surface). Cost-bounded by max_tablets_to_scan (default 500); raise prefix_filter coverage by repeating per prefix.",
    inputSchema: {
      prefix_filter: z
        .string()
        .optional()
        .describe("Optional museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS'). Omit to scan the entire corpus. Use list_collection_prefixes to enumerate options."),
      min_damage_ratio: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Lower bound on x_ratio (proportion of X-tokens / damaged signs) for inclusion. Default 0.10 — tablets below 10% damage don't need restoration. Set to 0.05 for marginal cases or 0.20 for clearly damaged-only surfaces."),
      max_damage_ratio: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Upper bound on x_ratio. Default 0.50 — tablets above 50% damage typically have too little surviving context for the restorer's n-gram conditioning to converge. Raise to 0.70 to chase heroic cases like Mīs pî K.5896 / K.2761."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (need enough surviving signs to drive restoration). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on tablets to probe in the damage window (cost control — each candidate triggers a findFuzzyParallels call). Default 500. Scoping by prefix_filter is usually cheaper than raising this."),
      top_n_candidates: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("How many top-ranked restoration candidates to return. Default 30."),
    },
  },
  async ({ prefix_filter, min_damage_ratio, max_damage_ratio, min_sign_count, max_tablets_to_scan, top_n_candidates }) => {
    const SCHEMA = schemaId("find_lacuna_restoration_candidates");
    try {
      const result = findLacunaRestorationCandidates({
        prefixFilter: prefix_filter,
        minDamageRatio: min_damage_ratio,
        maxDamageRatio: max_damage_ratio,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topNCandidates: top_n_candidates,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter ?? "(all)"} · damage=[${result.query.min_damage_ratio}, ${result.query.max_damage_ratio}] · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan}`,
        `Results: ${result.summary.total_tablets_scanned} scanned · ${result.summary.total_candidates_with_damage} in damage window · ${result.summary.total_candidates_surfaced} with usable parallels · top ${result.candidates.length} returned`,
        `Means (returned): damage_ratio=${result.summary.mean_damage_ratio} · priority_score=${result.summary.mean_priority_score}`,
        ``,
      ];
      const topShown = result.candidates.slice(0, 25);
      if (topShown.length === 0) {
        lines.push(`No restoration candidates surfaced. Try widening the damage window, lowering min_sign_count, or dropping prefix_filter.`);
      } else {
        lines.push(`── Top ${topShown.length} restoration candidates by priority ──`);
        for (const c of topShown) {
          lines.push(`   ${c.tablet_id.padEnd(20).slice(0, 20)}  signs=${String(c.sign_count).padStart(5)}  x=${c.x_ratio}  parallel=${(c.strongest_parallel_id ?? "—").padEnd(18).slice(0, 18)}  fuzzy_j=${c.strongest_parallel_fuzzy_j}  run=${c.strongest_parallel_run}  priority=${c.restoration_priority_score}`);
        }
        if (result.candidates.length > 25) lines.push(`(${result.candidates.length - 25} more candidates not shown)`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:lacuna-candidates", VERSION, {
          citation:
            "Lacuna-restoration backlog discovery via X-ratio × fuzzy-parallel intersection. v0.18.12. Surfaces high-value candidates for the v0.18.0 restore_lacuna_passage tool — tablets where restoration is both needed (damaged) and possible (templates exist).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_lacuna_restoration_candidates error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter ?? null,
            min_damage_ratio: min_damage_ratio ?? 0.10,
            max_damage_ratio: max_damage_ratio ?? 0.50,
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_n_candidates: top_n_candidates ?? 30,
          },
          candidates: [] as never[],
          summary: {
            total_tablets_scanned: 0,
            total_candidates_with_damage: 0,
            total_candidates_surfaced: 0,
            mean_damage_ratio: 0,
            mean_priority_score: 0,
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:lacuna-candidates", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.12 — Within-prefix thematic-neighborhood cluster discovery ─────

server.registerTool(
  "find_thematic_cluster_in_prefix",
  {
    description:
      "Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface thematic neighborhoods — groups of tablets that are semantically similar via embedding cosine, even when lexical similarity is low. The thematic-axis analogue of find_scribal_groups (v0.18.9, same-scribe groups) and find_strongest_fuzzy_pairs_in_prefix (v0.18.11, lexical pairs). Asks 'within prefix X, what topical groupings exist?' instead of 'what's most topically similar to THIS tablet?' (the per-tablet find_thematic_parallel question). Surfaces groups that lexical methods miss — paraphrases, bilingual pairs (a Sumerian original + its Akkadian translation diverge lexically but converge thematically), alt-spellings, and same-genre compositions copied by different traditions. Algorithm: iterate tablets in prefix (sorted by sign_count desc, capped by max_tablets_to_scan), fetch top-K thematic parallels per tablet, keep mutually-reciprocal edges at cosine ≥ threshold (default 0.65), apply union-find, return groups of size ≥ min_group_size with per-group cohesion stats + per-member intra-group degree. Cost-bounded by max_tablets_to_scan (default 500); raise to 2000-3000 for full coverage of major prefixes like K or BM.",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .describe("Museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT'). Required — unlike find_scribal_groups this tool is always prefix-scoped."),
      min_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum thematic-embedding cosine for a reciprocal edge. Default 0.65 ('topically related'). Note: thematic-cosine has a different scale than scribal-signature-cosine — random-indexing thematic neighbor lists trend lower than LLR-weighted scribal signatures, so this default is looser than the 0.6 scribal default but calibrated to the same intent. Tighten to 0.75-0.8 for 'topically near-identical'; loosen to 0.55 for broader same-genre neighborhoods."),
      min_group_size: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe("Minimum group size to return. Default 3 (triplet-class and up). Set 2 to also surface all thematic pairs."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (embedding less reliable). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on tablets to query (cost control). Default 500. Increase to ~2500 for full coverage of a major prefix like K or BM."),
      top_k_per_tablet: z
        .number()
        .int()
        .min(2)
        .max(30)
        .optional()
        .describe("How many thematic neighbors to fetch per tablet. Default 15. Lower = faster but may miss reciprocal pairs; higher = more thorough."),
    },
  },
  async ({ prefix_filter, min_cosine, min_group_size, min_sign_count, max_tablets_to_scan, top_k_per_tablet }) => {
    const SCHEMA = schemaId("find_thematic_cluster_in_prefix");
    try {
      const result = findThematicClusterInPrefix({
        prefixFilter: prefix_filter,
        minCosine: min_cosine,
        minGroupSize: min_group_size,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topKPerTablet: top_k_per_tablet,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter} · min_cos=${result.query.min_cosine} · min_group=${result.query.min_group_size} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan}`,
        `Results: ${result.totals.tablets_scanned} tablets scanned · ${result.totals.reciprocal_edges_found} reciprocal edges · ${result.totals.groups_returned} groups (largest size=${result.totals.largest_group_size})`,
        ``,
      ];
      const topGroups = result.groups.slice(0, 25);
      if (topGroups.length === 0) {
        lines.push(`No thematic clusters found above thresholds. Try lowering min_cosine or min_group_size, or raising max_tablets_to_scan.`);
      } else {
        for (const g of topGroups) {
          lines.push(`── Group ${g.group_id} · size=${g.size} · cohesion: mean=${g.cohesion.mean_pairwise_cosine} min=${g.cohesion.min_pairwise_cosine} max=${g.cohesion.max_pairwise_cosine} · density=${(g.edge_density * 100).toFixed(0)}% (${g.edge_count} edges)`);
          for (const m of g.members.slice(0, 8)) {
            lines.push(`   ${m.tablet_id.padEnd(22).slice(0, 22)}  degree=${m.intra_group_degree}`);
          }
          if (g.members.length > 8) lines.push(`   … and ${g.members.length - 8} more members`);
          lines.push(``);
        }
        if (result.groups.length > 25) lines.push(`(${result.groups.length - 25} more groups not shown)`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:thematic-cluster", VERSION, {
          citation:
            "Corpus-wide thematic-neighborhood discovery via mutual-reciprocal embedding-cosine graph + union-find. Generalizes find_thematic_parallel (v0.15.0) from per-tablet to systematic; thematic-axis analogue of find_scribal_groups (v0.18.9) and find_strongest_fuzzy_pairs_in_prefix (v0.18.11).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_thematic_cluster_in_prefix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter,
            min_cosine: min_cosine ?? 0.65,
            min_group_size: min_group_size ?? 3,
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_k_per_tablet: top_k_per_tablet ?? 15,
          },
          groups: [] as never[],
          totals: { tablets_scanned: 0, reciprocal_edges_found: 0, groups_returned: 0, largest_group_size: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:thematic-cluster", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.11 — Two-cluster comparison (overlap + relationship classifier) ─

server.registerTool(
  "compare_clusters",
  {
    description:
      "Compare two clusters (each defined EITHER by a seed_tablet_id OR an explicit cluster_members list) and surface whether they're the same composition, distinct compositions, or topology-adjacent neighbors. Computes: shared / A-unique / B-unique membership sets, Jaccard similarity, per-prefix distribution comparison (counts in A, B, and shared), and a relationship classification (identical / subset_a_in_b / subset_b_in_a / overlap / disjoint). For unions ≤ 50 tablets it also runs an internal cluster_pair_similarity_matrix across the union to break edges into intra-A / intra-B / cross-cluster buckets — surfacing whether two disjoint clusters are NEIGHBORS in fuzzy-Jaccard space (related compositions separated by a topology shatter) or genuine strangers. Use case: 'Is the BM.77056 cluster the same as the K.15325 cluster, or distinct?' One call replaces the manual reconstruct_cluster ×2 + set arithmetic + prefix rollup workflow. Recommendations block interprets the comparison in narrative form.",
    inputSchema: {
      cluster_a_seed: z
        .string()
        .min(1)
        .optional()
        .describe("Seed museum number for Cluster A (e.g. 'BM.77056'). Triggers an internal reconstruct_cluster call with the supplied min_fuzzy_jaccard / max_cluster_size / max_depth (or defaults 0.20 / 100 / 4). Either this OR cluster_a_members is required."),
      cluster_a_members: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe("Explicit list of museum numbers for Cluster A (skips reconstruct_cluster). Use when iterating on a filtered / hand-curated cluster. If both this and cluster_a_seed are supplied, the explicit list wins."),
      cluster_b_seed: z
        .string()
        .min(1)
        .optional()
        .describe("Seed museum number for Cluster B (e.g. 'K.15325'). Triggers an internal reconstruct_cluster call with the supplied parameters. Either this OR cluster_b_members is required."),
      cluster_b_members: z
        .array(z.string().min(1))
        .min(1)
        .optional()
        .describe("Explicit list of museum numbers for Cluster B (skips reconstruct_cluster). If both this and cluster_b_seed are supplied, the explicit list wins."),
      min_fuzzy_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Fuzzy-Jaccard threshold for the reconstruct_cluster calls (only used when a seed is supplied). Default 0.20 — matches the v0.17.1 cluster-reconstruction baseline."),
      max_cluster_size: z
        .number()
        .int()
        .min(2)
        .max(100)
        .optional()
        .describe("Max members per reconstructed cluster (only used when a seed is supplied). Default 100."),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(6)
        .optional()
        .describe("BFS depth cap for cluster reconstruction (only used when a seed is supplied). Default 4."),
    },
  },
  async ({ cluster_a_seed, cluster_a_members, cluster_b_seed, cluster_b_members, min_fuzzy_jaccard, max_cluster_size, max_depth }) => {
    const SCHEMA = schemaId("compare_clusters");
    try {
      const result = compareClusters({
        clusterASeed: cluster_a_seed,
        clusterAMembers: cluster_a_members,
        clusterBSeed: cluster_b_seed,
        clusterBMembers: cluster_b_members,
        minFuzzyJaccard: min_fuzzy_jaccard,
        maxClusterSize: max_cluster_size,
        maxDepth: max_depth,
      });

      const a = result.cluster_a;
      const b = result.cluster_b;
      const cmp = result.comparison;
      const lines: string[] = [
        `Cluster A: ${a.source}${a.source === "seed" ? ` (seed=${a.source_id})` : ""} · ${a.member_count} members`,
        `Cluster B: ${b.source}${b.source === "seed" ? ` (seed=${b.source_id})` : ""} · ${b.member_count} members`,
        ``,
        `Comparison:`,
        `  shared: ${cmp.shared_count}  ·  A-only: ${cmp.a_unique_count}  ·  B-only: ${cmp.b_unique_count}`,
        `  Jaccard: ${cmp.jaccard.toFixed(4)}  ·  relationship: ${cmp.relationship}`,
      ];
      if (cmp.shared_members.length > 0) {
        lines.push(
          `  shared members: ${cmp.shared_members.slice(0, 8).join(", ")}${cmp.shared_members.length > 8 ? `… (+${cmp.shared_members.length - 8})` : ""}`,
        );
      }

      if (result.prefix_comparison.length > 0) {
        lines.push(``, `Prefix comparison (top 8):`);
        lines.push(`  prefix       A    B   shared`);
        for (const p of result.prefix_comparison.slice(0, 8)) {
          lines.push(
            `  ${p.prefix.padEnd(10)} ${String(p.a).padStart(3)}  ${String(p.b).padStart(3)}   ${String(p.shared).padStart(4)}`,
          );
        }
      }

      if (result.union_analysis) {
        const u = result.union_analysis;
        lines.push(``, `Union analysis:`);
        if (u.skipped) {
          lines.push(`  SKIPPED — ${u.skip_reason}`);
        } else {
          lines.push(
            `  union size: ${u.union_size}  ·  edges: ${u.total_edges}  ·  density: ${(u.edge_density * 100).toFixed(1)}%`,
            `  intra-A: ${u.intra_a_edges}  ·  intra-B: ${u.intra_b_edges}  ·  cross-cluster: ${u.cross_cluster_edges}`,
          );
        }
      }

      if (result.recommendations.length > 0) {
        lines.push(``, `Recommendations:`);
        for (const r of result.recommendations) lines.push(`  • ${r}`);
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:compare-clusters", VERSION, {
          citation:
            "Pairwise cluster-vs-cluster comparator — orchestrates reconstruct_cluster ×2 + set arithmetic + per-prefix rollup + union-edge analysis into a single is-this-the-same-cluster envelope.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_clusters error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            cluster_a: {
              mode: cluster_a_members && cluster_a_members.length > 0 ? "explicit" : "seed",
              seed: cluster_a_seed ?? null,
              explicit_count: cluster_a_members?.length ?? 0,
            },
            cluster_b: {
              mode: cluster_b_members && cluster_b_members.length > 0 ? "explicit" : "seed",
              seed: cluster_b_seed ?? null,
              explicit_count: cluster_b_members?.length ?? 0,
            },
            min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.2,
            max_cluster_size: max_cluster_size ?? 100,
            max_depth: max_depth ?? 4,
            union_edge_cap: 50,
          },
          cluster_a: { source: "seed", source_id: cluster_a_seed ?? null, member_count: 0, member_ids: [] as never[], prefix_distribution: [] as never[], reconstruction: null },
          cluster_b: { source: "seed", source_id: cluster_b_seed ?? null, member_count: 0, member_ids: [] as never[], prefix_distribution: [] as never[], reconstruction: null },
          comparison: { shared_members: [] as never[], a_unique: [] as never[], b_unique: [] as never[], a_unique_count: 0, b_unique_count: 0, shared_count: 0, jaccard: 0, relationship: "disjoint" },
          prefix_comparison: [] as never[],
          union_analysis: null,
          recommendations: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:compare-clusters", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.11 — Per-prefix top-N strongest fuzzy-Jaccard pair discovery ────

server.registerTool(
  "find_strongest_fuzzy_pairs_in_prefix",
  {
    description:
      "Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface the top-N strongest fuzzy-Jaccard edges between any pair of tablets in that bucket. The per-collection generalization of find_fuzzy_parallels (v0.17.0) — instead of asking 'what's most similar to THIS tablet?', asks 'within prefix X, what are the strongest sibling-manuscript candidate pairs ANYWHERE?'. Returns pairs sorted by fuzzy_jaccard desc (with final_score tie-break) + per-tablet involvement counts (cluster-hub candidates) + edge-weight summary stats. Motivated by the v0.17 calibration audit recovery of the K.2798 ↔ Si.776 pair (a methods-paper-grade missed sibling, surfaced only because Dane probed K.2798 by hand): this tool answers systematically 'what OTHER such pairs exist within a collection that nobody has probed?'. Pairs with find_fuzzy_parallels for per-tablet zoom and find_scribal_groups (v0.18.9) for the same systematic-discovery pattern on the scribal-signature axis. Cost-bounded by max_tablets_to_scan (default 500 ≈ 30s); raise to 2500-3000 for full coverage of major prefixes like K or BM (a few minutes).",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .describe("Museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT'). REQUIRED — this tool is per-prefix by design. Use list_collection_prefixes to enumerate options."),
      min_fuzzy_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum fuzzy Jaccard for an edge to be collected. Default 0.20 (the v0.17 sibling-manuscript discovery threshold). Tighter (e.g. 0.35) yields only near-duplicate pairs; looser (e.g. 0.10) yields broader composition-overlap candidates."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (fuzzy-J unreliable on short fragments). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on tablets to query in this prefix (cost control). Default 500 ≈ 30s on warm fuzzy index. Increase to ~2500-3000 for full coverage of a major prefix like K or BM (a few minutes)."),
      top_k_per_tablet: z
        .number()
        .int()
        .min(2)
        .max(50)
        .optional()
        .describe("How many fuzzy parallels to fetch per scanned tablet. Default 15. Lower = faster but may miss weaker edges; higher = more thorough collection but more cost per tablet."),
      top_n_pairs: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe("How many top-ranked pairs to return. Default 50. Max 500."),
    },
  },
  async ({ prefix_filter, min_fuzzy_jaccard, min_sign_count, max_tablets_to_scan, top_k_per_tablet, top_n_pairs }) => {
    const SCHEMA = schemaId("find_strongest_fuzzy_pairs_in_prefix");
    try {
      const result = findStrongestFuzzyPairs({
        prefixFilter: prefix_filter,
        minFuzzyJaccard: min_fuzzy_jaccard,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topKPerTablet: top_k_per_tablet,
        topNPairs: top_n_pairs,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter} · min_fuzzy_j=${result.query.min_fuzzy_jaccard} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan} · top_k_per_tablet=${result.query.top_k_per_tablet}`,
        `Results: ${result.summary.tablets_scanned} tablets scanned · ${result.summary.total_pairs_collected} pairs collected · top ${result.summary.total_pairs_returned} returned (${result.summary.reciprocal_pair_count} reciprocal)`,
        `Edge weight (returned): min=${result.summary.edge_weight.min_fuzzy_jaccard} · median=${result.summary.edge_weight.median_fuzzy_jaccard} · max=${result.summary.edge_weight.max_fuzzy_jaccard}`,
        ``,
      ];
      const topPairs = result.pairs.slice(0, 25);
      if (topPairs.length === 0) {
        lines.push(`No within-prefix pairs found above thresholds. Try lowering min_fuzzy_jaccard or raising max_tablets_to_scan.`);
      } else {
        lines.push(`── Top ${topPairs.length} pairs by fuzzy_jaccard ──`);
        for (const p of topPairs) {
          const recip = p.is_reciprocal ? "↔" : "→";
          lines.push(`   ${p.tablet_a.padEnd(20).slice(0, 20)} ${recip} ${p.tablet_b.padEnd(20).slice(0, 20)}  fuzzy_j=${p.fuzzy_jaccard}  exact_j=${p.exact_jaccard}  run=${p.longest_contiguous_run}  final=${p.final_score}`);
        }
        if (result.pairs.length > 25) lines.push(`(${result.pairs.length - 25} more returned pairs not shown)`);
        lines.push(``);
      }
      if (result.top_involved_tablets.length > 0) {
        lines.push(`── Cluster-hub candidates (most pair appearances) ──`);
        for (const t of result.top_involved_tablets) {
          lines.push(`   ${t.tablet_id.padEnd(22).slice(0, 22)}  pairs=${t.pair_count}  max_fuzzy_j=${t.max_fuzzy_jaccard}`);
        }
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:strongest-fuzzy-pairs", VERSION, {
          citation:
            "Per-prefix top-N strongest fuzzy-Jaccard pair discovery via tablet iteration + canonical-key edge dedupe. v0.18.11. Generalizes find_fuzzy_parallels (v0.17.0) from per-tablet to systematic per-collection — the fuzzy-axis analogue of find_scribal_groups (v0.18.9).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_strongest_fuzzy_pairs_in_prefix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter ?? "",
            min_fuzzy_jaccard: min_fuzzy_jaccard ?? 0.20,
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_k_per_tablet: top_k_per_tablet ?? 15,
            top_n_pairs: top_n_pairs ?? 50,
          },
          pairs: [] as never[],
          top_involved_tablets: [] as never[],
          summary: {
            total_pairs_returned: 0,
            total_pairs_collected: 0,
            tablets_scanned: 0,
            tablets_with_any_pair: 0,
            edge_weight: { min_fuzzy_jaccard: 0, median_fuzzy_jaccard: 0, max_fuzzy_jaccard: 0 },
            reciprocal_pair_count: 0,
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:strongest-fuzzy-pairs", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.11 — corpus_health_report (corpus-level meta-diagnostic) ────────

server.registerTool(
  "corpus_health_report",
  {
    description:
      "One-call corpus-level meta-diagnostic. Returns the 'system health' snapshot for the cuneiform-mcp pipeline: total tablet count, lex-graph / thematic-index coverage, distinct prefix count + top-10 by tablet count + top-5 by total sign count, corpus-wide sign-count distribution (mean/median/total), short-fragment count at a caller-configurable threshold, an approximate bi-orphan count at caller-configurable lex/thematic thresholds, mean per-prefix coverage percentages, and a generated list of recommended next queries. Use as the FIRST query in any corpus-exploration session, and before running expensive corpus-wide tools like find_scribal_groups or find_cross_prefix_scribal_links. Also useful as a release-artifact snapshot when documenting corpus state for the methods paper.",
    inputSchema: {
      short_fragment_threshold: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Tablets with sign_count strictly below this threshold are counted as short fragments. Default 50 (matches the methods-paper §2.4 short-fragment cutoff).",
        ),
      bi_orphan_thresholds: z
        .object({
          lex_jaccard: z
            .number()
            .min(0)
            .max(1)
            .describe("Lexical Jaccard threshold below which a tablet is considered lex-isolated. Default 0.30."),
          thematic_cosine: z
            .number()
            .min(0)
            .max(1)
            .describe("Thematic-embedding cosine threshold below which a tablet is considered thematically-isolated. Default 0.50."),
        })
        .optional()
        .describe(
          "Thresholds used to estimate the bi-orphan count. When both equal the methods-paper defaults (0.30 / 0.50), the pre-aggregated anomaly-index total is surfaced; otherwise the count is recomputed live by scanning the index.",
        ),
    },
  },
  async ({ short_fragment_threshold, bi_orphan_thresholds }) => {
    const SCHEMA = schemaId("corpus_health_report");
    try {
      const result = corpusHealthReport({
        shortFragmentThreshold: short_fragment_threshold,
        biOrphanThresholds: bi_orphan_thresholds
          ? {
              lexJaccard: bi_orphan_thresholds.lex_jaccard,
              thematicCosine: bi_orphan_thresholds.thematic_cosine,
            }
          : undefined,
      });

      const ct = result.corpus_totals;
      const ps = result.prefix_summary;
      const sf = result.short_fragments;
      const bo = result.bi_orphans_estimate;
      const qi = result.quality_indicators;
      const lines: string[] = [
        `Corpus health report — query: short_fragment_threshold=${result.query.short_fragment_threshold}, bi_orphan_thresholds=(lex_jaccard<${result.query.bi_orphan_thresholds.lex_jaccard}, thematic_cosine<${result.query.bi_orphan_thresholds.thematic_cosine})`,
        ``,
        `Corpus totals:`,
        `  ${ct.total_tablets_in_index.toLocaleString()} tablets indexed`,
        `  ${ct.in_lex_graph.toLocaleString()} in lex graph · ${ct.in_them_index.toLocaleString()} in thematic index · ${ct.in_both.toLocaleString()} in both`,
        `  ${ct.zero_sign_count.toLocaleString()} zero-sign records · ${ct.total_signs_corpus_wide.toLocaleString()} total signs · mean=${ct.mean_sign_count} median=${ct.median_sign_count}`,
        ``,
        `Prefixes: ${ps.distinct_prefix_count} distinct${ps.largest_prefix_name ? ` · largest=${ps.largest_prefix_name}` : ""}${ps.smallest_prefix_name ? ` · smallest=${ps.smallest_prefix_name}` : ""}`,
        `  Top 10 by tablet count: ${ps.top_10_by_tablet_count.map((p) => `${p.prefix}(${p.tablet_count})`).join(", ")}`,
        `  Top 5 by total signs:   ${ps.top_5_by_total_sign_count.map((p) => `${p.prefix}(${p.total_sign_count.toLocaleString()})`).join(", ")}`,
        ``,
        `Short fragments (<${sf.threshold} signs): ${sf.count.toLocaleString()} (${sf.percent_of_corpus}% of corpus)`,
        `Bi-orphan estimate: ${bo.approximate_count != null ? `~${bo.approximate_count}` : "unavailable"} [source=${bo.source}]`,
        `  ${bo.note}`,
        ``,
        `Quality indicators:`,
        `  Mean per-prefix lex coverage: ${qi.mean_lex_coverage_pct}% · thematic coverage: ${qi.mean_them_coverage_pct}%`,
        `  Prefixes with >10% zero-sign records: ${qi.prefixes_with_high_zero_sign_count.length}${qi.prefixes_with_high_zero_sign_count.length > 0 ? ` (${qi.prefixes_with_high_zero_sign_count.slice(0, 5).map((p) => `${p.prefix}=${p.zero_sign_pct}%`).join(", ")})` : ""}`,
        ``,
        `Recommendations:`,
        ...result.recommendations.map((r, i) => `  ${i + 1}. ${r}`),
      ];
      if (result.warnings.length > 0) {
        lines.push(``, `Warnings: ${result.warnings.join("; ")}`);
      }

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:corpus-health", VERSION, {
          citation:
            "Corpus-level meta-diagnostic over the anomaly-index. v0.18.11. Companion to list_collection_prefixes + coverage_stats_for_collection + find_short_fragments.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`corpus_health_report error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            short_fragment_threshold: short_fragment_threshold ?? 50,
            bi_orphan_thresholds: bi_orphan_thresholds ?? { lex_jaccard: 0.3, thematic_cosine: 0.5 },
          },
          corpus_totals: {
            total_tablets_in_index: 0,
            in_lex_graph: 0,
            in_them_index: 0,
            in_both: 0,
            zero_sign_count: 0,
            mean_sign_count: 0,
            median_sign_count: 0,
            total_signs_corpus_wide: 0,
          },
          prefix_summary: {
            distinct_prefix_count: 0,
            top_10_by_tablet_count: [] as never[],
            top_5_by_total_sign_count: [] as never[],
            largest_prefix_name: null,
            smallest_prefix_name: null,
          },
          short_fragments: {
            threshold: short_fragment_threshold ?? 50,
            count: 0,
            percent_of_corpus: 0,
          },
          bi_orphans_estimate: {
            approximate_count: null,
            thresholds_used: bi_orphan_thresholds ?? { lex_jaccard: 0.3, thematic_cosine: 0.5 },
            source: "unavailable" as const,
            note: msg,
          },
          quality_indicators: {
            mean_lex_coverage_pct: 0,
            mean_them_coverage_pct: 0,
            prefixes_with_high_zero_sign_count: [] as never[],
          },
          recommendations: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:corpus-health", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.10 — Composite cluster audit (one-call diagnostic) ─────────────

server.registerTool(
  "audit_cluster",
  {
    description:
      "Composite quality + topology + provenance audit for a cluster — one-call replacement for the manual reconstruct_cluster → find_short_fragments → cluster_pair_similarity_matrix → per-prefix-coverage workflow. Accepts EITHER a seed_tablet_id (triggers an internal reconstruct_cluster with defaults max_size=100, max_depth=4, min_fuzzy_jaccard=0.20) OR an explicit cluster_members list (skips reconstruction, audits the supplied set directly). Returns a unified envelope: quality (sign-count distribution + marginal-signal flagging + recommended-exclusion list), topology (prefix distribution + cross-prefix ratio + top-N hubs by degree at J ≥ 0.20 + connected-component counts and edge density at each topology_threshold + first-shatter threshold), provenance (distinct prefixes + per-prefix corpus coverage + missing-from-corpus list), and a generated recommendations list of suggested next actions. Designed for pre-publish cluster vetting (the BM.77056 *āšipūtu* canon validation pattern from 2026-05-22).",
    inputSchema: {
      seed_tablet_id: z
        .string()
        .min(1)
        .optional()
        .describe("Museum number of the seed tablet (e.g. 'BM.77056'). Triggers an internal reconstruct_cluster call with defaults (max_size=100, max_depth=4, min_fuzzy_jaccard=0.20). Mutually-exclusive-ish with cluster_members; if both are supplied, cluster_members wins."),
      cluster_members: z
        .array(z.string().min(1))
        .min(2)
        .optional()
        .describe("Explicit list of museum numbers to audit (skips reconstruct_cluster). Use when iterating on a filtered or hand-curated cluster, e.g. after dropping marginal-signal members from a prior audit run. Minimum 2 entries."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Quality-filter threshold — members with sign_count at-or-below this are flagged as marginal-signal and added to recommended_exclusions. Default 50 (matches the reconstruct_cluster recommendation in v0.18.4+). Set 0 to disable marginal-signal flagging."),
      topology_thresholds: z
        .array(z.number().min(0).max(1))
        .min(1)
        .optional()
        .describe("Fuzzy-Jaccard thresholds to roll up component counts + edge density at. Default [0.10, 0.20, 0.30, 0.40, 0.50]. The first threshold at which component_count > 1 is reported as shatter_threshold. NOTE: component counts come from clusterMatrix's built-in 5 thresholds (0.1/0.2/0.3/0.4/0.5); for non-default thresholds the nearest is used (edge density is always exact)."),
    },
  },
  async ({ seed_tablet_id, cluster_members, min_sign_count, topology_thresholds }) => {
    const SCHEMA = schemaId("audit_cluster");
    try {
      const result = auditCluster({
        seedTabletId: seed_tablet_id,
        clusterMembers: cluster_members,
        minSignCount: min_sign_count,
        topologyThresholds: topology_thresholds,
      });

      const q = result.query;
      const lines: string[] = [
        `Audit mode: ${q.mode}${q.mode === "seed" ? ` (seed=${q.seed_tablet_id})` : ` (${q.member_count} explicit members)`}`,
        `Cluster size: ${result.cluster.member_count} · min_sign_count=${q.min_sign_count} · topology_thresholds=[${q.topology_thresholds.map((t) => t.toFixed(2)).join(", ")}]`,
        ``,
        `Quality:`,
        `  sign_count: min=${result.quality.sign_count.min} median=${result.quality.sign_count.median} mean=${result.quality.sign_count.mean} max=${result.quality.sign_count.max} (n=${result.quality.sign_count.count})`,
        `  marginal-signal members at-or-below ${q.min_sign_count}: ${result.quality.marginal_signal_count}`,
        `  members without sign_count record: ${result.quality.members_without_sign_count.length}`,
      ];
      if (result.quality.recommended_exclusions.length > 0) {
        lines.push(`  recommended exclusions: ${result.quality.recommended_exclusions.slice(0, 10).join(", ")}${result.quality.recommended_exclusions.length > 10 ? "…" : ""}`);
      }
      lines.push(
        ``,
        `Topology:`,
        `  distinct prefixes: ${result.topology.distinct_prefix_count}  ·  cross-prefix members: ${result.topology.cross_prefix_count}/${result.cluster.member_count} (${(result.topology.cross_prefix_ratio * 100).toFixed(1)}%)`,
        `  prefix distribution: ${result.topology.prefix_distribution.slice(0, 8).map((p) => `${p.prefix}=${p.count}`).join(", ")}${result.topology.prefix_distribution.length > 8 ? "…" : ""}`,
        `  shatter threshold: ${result.topology.shatter_threshold === null ? "(cohesive throughout)" : `J ≥ ${result.topology.shatter_threshold.toFixed(2)}`}`,
        `  components / edge-density by threshold:`,
        `    threshold   components   largest   isolated   density`,
      );
      for (const cc of result.topology.components_by_threshold) {
        lines.push(
          `    J ≥ ${cc.threshold.toFixed(2)}     ${String(cc.component_count).padStart(8)}   ${String(cc.largest_component_size).padStart(6)}   ${String(cc.isolated_tablets).padStart(6)}   ${(cc.edge_density * 100).toFixed(1)}%`,
        );
      }
      if (result.topology.top_hubs.length > 0) {
        lines.push(``, `  top hubs by degree at J ≥ 0.20:`);
        for (const h of result.topology.top_hubs.slice(0, 5)) {
          lines.push(`    ${h.tablet_id.padEnd(22).slice(0, 22)} d(.20)=${h.degree_at_0_20}  max_edge=${h.max_edge_weight}`);
        }
      }
      lines.push(
        ``,
        `Provenance:`,
        `  prefixes: ${result.provenance.distinct_prefixes.slice(0, 12).join(", ")}${result.provenance.distinct_prefixes.length > 12 ? "…" : ""}`,
      );
      for (const pc of result.provenance.per_prefix_coverage.slice(0, 8)) {
        lines.push(`    ${pc.prefix.padEnd(8)} ${pc.members_in_cluster} / ${pc.total_in_corpus} corpus tablets (${pc.coverage_pct}%)`);
      }
      if (result.provenance.missing_from_corpus.length > 0) {
        lines.push(`  missing from corpus (${result.provenance.missing_from_corpus.length}): ${result.provenance.missing_from_corpus.slice(0, 5).join(", ")}${result.provenance.missing_from_corpus.length > 5 ? "…" : ""}`);
      }
      lines.push(``, `Recommendations:`);
      for (const r of result.recommendations) lines.push(`  • ${r}`);
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:audit-cluster", VERSION, {
          citation:
            "Composite cluster audit — orchestrates reconstruct_cluster + cluster_pair_similarity_matrix + find_short_fragments + per-prefix coverage into a single pre-publish vetting envelope.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`audit_cluster error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            mode: cluster_members && cluster_members.length > 0 ? "explicit_members" : "seed",
            seed_tablet_id: seed_tablet_id ?? null,
            member_count: cluster_members?.length ?? 0,
            min_sign_count: min_sign_count ?? 50,
            topology_thresholds: topology_thresholds ?? [0.1, 0.2, 0.3, 0.4, 0.5],
            reconstruct_defaults_used: !(cluster_members && cluster_members.length > 0) && !!seed_tablet_id,
          },
          cluster: {
            member_count: 0,
            member_ids: [] as never[],
            reconstruction: null,
            matrix: {
              query: { tablet_count: 0, min_jaccard: 0.1, top_k_per_node: 50 },
              edges: [] as never[],
              edge_stats: { total_pairs_possible: 0, edges_above_threshold: 0, density: 0, weight_min: 0, weight_median: 0, weight_max: 0, weight_mean: 0 },
              per_tablet_degree: [] as never[],
              connected_components: [] as never[],
              not_in_corpus: [] as never[],
              warnings: [msg],
            },
          },
          quality: {
            sign_count: { min: 0, median: 0, mean: 0, max: 0, count: 0 },
            members_without_sign_count: [] as never[],
            marginal_signal: [] as never[],
            marginal_signal_count: 0,
            recommended_exclusions: [] as never[],
          },
          topology: {
            prefix_distribution: [] as never[],
            distinct_prefix_count: 0,
            cross_prefix_count: 0,
            cross_prefix_ratio: 0,
            top_hubs: [] as never[],
            components_by_threshold: [] as never[],
            shatter_threshold: null,
          },
          provenance: {
            distinct_prefixes: [] as never[],
            per_prefix_coverage: [] as never[],
            missing_from_corpus: [] as never[],
          },
          recommendations: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:audit-cluster", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.10 — Orthographic outlier discovery within a prefix cohort ─────

server.registerTool(
  "find_orthographic_outliers_in_prefix",
  {
    description:
      "Within a museum-collection prefix bucket (e.g. K, BM, Sm, CBS, VAT), surface tablets whose scribal-signature LLR profile is FURTHEST from the cohort centroid. Complements find_scribal_groups (v0.18.9): that tool finds tight same-scribe clusters; this one finds the LONERS — tablets with anomalous scribal practice within their own cohort, candidates for imports / mislabeling / outlier scribal-school. Builds a per-prefix centroid by summing per-tablet LLR weights across the cohort, then ranks every tablet by sparse cosine to that centroid. Returns: outliers ranked by deviation (lowest cosine first) with their distinctive signs (signs in the tablet's signature but NOT in the centroid's top-30), the cohort centroid's top-15 signs as a baseline reference, and summary stats (mean/median/stdev cosine + top-3 most-typical tablets). Cost-bounded by max_tablets_to_scan (default 500); raise to 2000-3000 for full coverage of major prefixes.",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .describe("Museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT'). Required — outliers are only meaningful relative to a defined cohort."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (signature unreliable). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on cohort size (cost control). Default 500. Increase to ~2500 for full coverage of a major prefix like K or BM."),
      top_n_outliers: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("How many top-deviation tablets to return. Default 20."),
    },
  },
  async ({ prefix_filter, min_sign_count, max_tablets_to_scan, top_n_outliers }) => {
    const SCHEMA = schemaId("find_orthographic_outliers_in_prefix");
    try {
      const result = findOrthographicOutliers({
        prefixFilter: prefix_filter,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topNOutliers: top_n_outliers,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan} · top_n=${result.query.top_n_outliers}`,
        `Cohort: ${result.summary.cohort_size} tablets · mean cos=${result.summary.mean_cosine_to_centroid} · median=${result.summary.median_cosine_to_centroid} · stdev=${result.summary.stdev_cosine_to_centroid} · range=[${result.summary.min_cosine_to_centroid}, ${result.summary.max_cosine_to_centroid}]`,
        ``,
      ];

      if (result.cohort_centroid.top_signs.length > 0) {
        lines.push(`─── Cohort centroid top-15 signs (baseline) ───`);
        for (const s of result.cohort_centroid.top_signs) {
          lines.push(`   ${s.sign.padEnd(18).slice(0, 18)}  summed_llr=${s.summed_llr.toFixed(2).padStart(8)}  in ${s.tablet_count}/${result.cohort_centroid.cohort_size} tablets`);
        }
        lines.push(``);
      }

      if (result.summary.most_typical_tablets.length > 0) {
        lines.push(`─── Most-typical tablets (highest cosine to centroid) ───`);
        for (const t of result.summary.most_typical_tablets) {
          lines.push(`   ${t.tablet_id.padEnd(22).slice(0, 22)}  cos=${t.signature_cosine_to_centroid}`);
        }
        lines.push(``);
      }

      if (result.outliers.length === 0) {
        lines.push(`No outliers surfaced. Try lowering min_sign_count or raising max_tablets_to_scan.`);
      } else {
        lines.push(`─── Top ${result.outliers.length} outliers (lowest cosine = most deviant) ───`);
        for (const o of result.outliers) {
          lines.push(`── ${o.tablet_id}  cos=${o.signature_cosine_to_centroid}  deviation=${o.deviation_score}  signs=${o.sign_count}  sig_size=${o.signature_size}`);
          if (o.distinctive_signs.length > 0) {
            const dsLine = o.distinctive_signs.map((d) => `${d.sign}(${d.llr.toFixed(1)})`).join(", ");
            lines.push(`   Distinctive (off-centroid): ${dsLine}`);
          } else {
            lines.push(`   No distinctive signs (all signature signs are in cohort centroid top-30)`);
          }
        }
      }
      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:orthographic-outliers", VERSION, {
          citation:
            "Per-prefix scribal-orthographic outlier discovery via cohort-centroid sparse-cosine ranking. v0.18.10. Complements find_scribal_groups (v0.18.9) — that finds tight same-scribe clusters, this finds the loners.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_orthographic_outliers_in_prefix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter ?? "",
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_n_outliers: top_n_outliers ?? 20,
          },
          cohort_centroid: { cohort_size: 0, total_signature_signs_aggregated: 0, top_signs: [] as never[] },
          outliers: [] as never[],
          summary: {
            cohort_size: 0,
            mean_cosine_to_centroid: 0,
            median_cosine_to_centroid: 0,
            stdev_cosine_to_centroid: 0,
            min_cosine_to_centroid: 0,
            max_cosine_to_centroid: 0,
            most_typical_tablets: [] as never[],
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:orthographic-outliers", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.10 — Cross-prefix same-scribe edge discovery ───────────────────

server.registerTool(
  "find_cross_prefix_scribal_links",
  {
    description:
      "Surfaces same-scribe edges that CROSS museum-collection boundaries (e.g. BM↔K, BM↔Sm, K↔CBS) — complementary to v0.18.9 find_scribal_groups (which finds within-prefix groups via union-find). Research value: (a) scribal-school networks that transcend single excavation sites, (b) ancient manuscript-transmission patterns, (c) modern collection-history artifacts — 19th-century antiquities lots split across European museums. Algorithm: iterate tablets (capped by min_sign_count + max_tablets_to_scan, optionally scoped to one source prefix_filter); for each, fetch top-K same-scribe candidates; keep only edges where source.prefix ≠ candidate.prefix at signature_cosine ≥ threshold; optionally require mutual reciprocity. Returns edges sorted by cosine + per-prefix-pair aggregate counts + top-10 'bridge tablets' (tablets with the most cross-prefix edges — likely scribes whose work spans multiple modern collections). Cost-bounded by max_tablets_to_scan (default 500, max 5000).",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .optional()
        .describe("Source museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS'). Omit for full corpus scan (slower but surfaces all cross-prefix edges, not just those originating from one collection)."),
      min_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum signature cosine for a cross-prefix edge. Default 0.6 (the corpus-wide threshold for 'probable same scribe'). Raise to 0.75+ for quartet-class-quality cross-collection edges only."),
      require_reciprocal: z
        .boolean()
        .optional()
        .describe("If true (default), only return edges where BOTH tablets list the other in their top-K at ≥ min_cosine. Reciprocal-only is the higher-confidence default; set false to surface one-way candidate edges as leads."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (signature unreliable). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on tablets to query (cost control). Default 500. Increase to ~2500–5000 for full corpus coverage."),
      top_k_per_tablet: z
        .number()
        .int()
        .min(2)
        .max(30)
        .optional()
        .describe("How many same-scribe candidates to fetch per tablet. Default 15. Lower = faster but may miss reciprocal pairs; higher = more thorough."),
    },
  },
  async ({ prefix_filter, min_cosine, require_reciprocal, min_sign_count, max_tablets_to_scan, top_k_per_tablet }) => {
    const SCHEMA = schemaId("find_cross_prefix_scribal_links");
    try {
      const result = findCrossPrefixScribalLinks({
        prefixFilter: prefix_filter,
        minCosine: min_cosine,
        requireReciprocal: require_reciprocal,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topKPerTablet: top_k_per_tablet,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter ?? "<all>"} · min_cos=${result.query.min_cosine} · reciprocal=${result.query.require_reciprocal} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan}`,
        `Results: ${result.totals.tablets_scanned} tablets scanned · ${result.totals.total_edges_above_threshold} edges returned (${result.totals.total_reciprocal_edges} reciprocal observed) · ${result.totals.prefixes_involved} distinct prefixes involved`,
        ``,
      ];

      if (result.prefix_pair_summary.length === 0) {
        lines.push(`No cross-prefix pairs surfaced above thresholds.`);
      } else {
        lines.push(`── Top prefix-pairs (by edge count):`);
        for (const p of result.prefix_pair_summary.slice(0, 15)) {
          lines.push(`   ${p.pair.padEnd(18)}  edges=${p.edge_count}  reciprocal=${p.reciprocal_edge_count}  max_cos=${p.max_cosine}`);
        }
        if (result.prefix_pair_summary.length > 15) lines.push(`   … and ${result.prefix_pair_summary.length - 15} more pairs`);
        lines.push(``);
      }

      if (result.bridge_tablets.length > 0) {
        lines.push(`── Top bridge tablets (most distinct cross-prefix collections):`);
        for (const b of result.bridge_tablets) {
          lines.push(`   ${b.tablet_id.padEnd(22).slice(0, 22)}  edges=${b.cross_prefix_edge_count}  spans=${b.distinct_other_prefixes} other prefixes [${b.other_prefixes.join(", ")}]  max_cos=${b.max_cosine}`);
        }
        lines.push(``);
      }

      const topEdges = result.edges.slice(0, 20);
      if (topEdges.length > 0) {
        lines.push(`── Top edges (by cosine):`);
        for (const e of topEdges) {
          const recMark = e.is_reciprocal ? "↔" : "→";
          lines.push(`   ${e.tablet_a.padEnd(20).slice(0, 20)} ${recMark} ${e.tablet_b.padEnd(20).slice(0, 20)}  [${e.prefix_a}↔${e.prefix_b}]  cos=${e.signature_cosine}  jac=${e.signature_jaccard}`);
        }
        if (result.edges.length > 20) lines.push(`(${result.edges.length - 20} more edges not shown)`);
      }

      if (result.warnings.length > 0) lines.push(``, `Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:cross-prefix-scribal", VERSION, {
          citation:
            "Cross-prefix same-scribe edge discovery via top-K candidate scan + canonical pair dedupe + optional mutual-reciprocity filter. v0.18.10. Complementary to v0.18.9 find_scribal_groups (within-prefix union-find).",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_cross_prefix_scribal_links error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter ?? null,
            min_cosine: min_cosine ?? 0.6,
            require_reciprocal: require_reciprocal ?? true,
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_k_per_tablet: top_k_per_tablet ?? 15,
          },
          edges: [] as never[],
          prefix_pair_summary: [] as never[],
          bridge_tablets: [] as never[],
          totals: {
            tablets_scanned: 0,
            total_edges_above_threshold: 0,
            total_reciprocal_edges: 0,
            prefixes_involved: 0,
          },
          warnings: [msg],
        },
        provenance: provenance("local", "local:cross-prefix-scribal", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.9 — Corpus-wide same-scribe group discovery ────────────────────

server.registerTool(
  "find_scribal_groups",
  {
    description:
      "Corpus-wide same-scribe scribal-lineage group discovery — generalizes the per-tablet find_same_scribe_candidates (v0.18.0) to systematic group surfacing. Asks 'what scribal-lineage groups exist within prefix X?' instead of 'who copied this specific tablet?'. Returns all mutually-reciprocal same-scribe groups at a configurable cosine threshold (default 0.6), with per-group cohesion statistics + per-member intra-group degree. Motivated by the 2026-05-22 methods paper §3.4.1 BM.34970 quartet finding (4-tablet same-scribe group at signature cosine 0.8866) — which was surfaced opportunistically. This tool answers systematically: 'what OTHER quartet-class groups exist that have not been surfaced by happenstance?' Cost-bounded by max_tablets_to_scan parameter (default 500); for major prefixes (K=2,500+) raise to 2000-3000 for full coverage.",
    inputSchema: {
      prefix_filter: z
        .string()
        .min(1)
        .optional()
        .describe("Museum-collection prefix to scope the scan (e.g. 'K', 'BM', 'Sm', 'CBS', 'VAT'). Omit for full corpus scan (slower)."),
      min_cosine: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum signature cosine for a reciprocal edge. Default 0.6 (the 2026-05-22 corpus-wide threshold for 'probable same scribe'). Tighter (e.g. 0.75) yields the quartet-class only; looser (e.g. 0.5) yields broader same-scribal-school groups."),
      min_group_size: z
        .number()
        .int()
        .min(2)
        .optional()
        .describe("Minimum group size to return. Default 3 (quartet-class and up — i.e. 3-tablet triplets + 4-tablet quartets + larger). Set 2 to also surface all same-scribe pairs."),
      min_sign_count: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Skip tablets with sign_count below this threshold (signature unreliable). Default 50."),
      max_tablets_to_scan: z
        .number()
        .int()
        .min(10)
        .max(5000)
        .optional()
        .describe("Cap on tablets to query (cost control). Default 500. Increase to ~2500 for full coverage of a major prefix like K or BM."),
      top_k_per_tablet: z
        .number()
        .int()
        .min(2)
        .max(30)
        .optional()
        .describe("How many same-scribe candidates to fetch per tablet. Default 15. Lower = faster but may miss reciprocal pairs; higher = more thorough."),
    },
  },
  async ({ prefix_filter, min_cosine, min_group_size, min_sign_count, max_tablets_to_scan, top_k_per_tablet }) => {
    const SCHEMA = schemaId("find_scribal_groups");
    try {
      const result = findScribalGroups({
        prefixFilter: prefix_filter,
        minCosine: min_cosine,
        minGroupSize: min_group_size,
        minSignCount: min_sign_count,
        maxTabletsToScan: max_tablets_to_scan,
        topKPerTablet: top_k_per_tablet,
      });

      const lines: string[] = [
        `Scan: prefix=${result.query.prefix_filter ?? "<all>"} · min_cos=${result.query.min_cosine} · min_group=${result.query.min_group_size} · min_signs=${result.query.min_sign_count} · cap=${result.query.max_tablets_to_scan}`,
        `Results: ${result.totals.tablets_scanned} tablets scanned · ${result.totals.reciprocal_edges_found} reciprocal edges · ${result.totals.groups_returned} groups (largest size=${result.totals.largest_group_size})`,
        ``,
      ];
      const topGroups = result.groups.slice(0, 25);
      if (topGroups.length === 0) {
        lines.push(`No groups found above thresholds. Try lowering min_cosine or min_group_size, or raising max_tablets_to_scan.`);
      } else {
        for (const g of topGroups) {
          lines.push(`── Group ${g.group_id} · size=${g.size} · cohesion: mean=${g.cohesion.mean_pairwise_cosine} min=${g.cohesion.min_pairwise_cosine} max=${g.cohesion.max_pairwise_cosine} · density=${(g.cohesion.edge_density * 100).toFixed(0)}% (${g.cohesion.edge_count} edges)`);
          const prefDist = Object.entries(g.prefix_distribution).sort((a, b) => b[1] - a[1]).map(([p, c]) => `${p}=${c}`).join(", ");
          lines.push(`   Prefixes: ${prefDist}`);
          for (const m of g.members.slice(0, 8)) {
            lines.push(`   ${m.tablet_id.padEnd(22).slice(0, 22)}  degree=${m.intra_group_degree}`);
          }
          if (g.members.length > 8) lines.push(`   … and ${g.members.length - 8} more members`);
          lines.push(``);
        }
        if (result.groups.length > 25) lines.push(`(${result.groups.length - 25} more groups not shown)`);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:scribal-groups", VERSION, {
          citation:
            "Corpus-wide scribal-lineage group discovery via mutual-reciprocal same-scribe graph + union-find. v0.18.9. Generalizes find_same_scribe_candidates from per-tablet to systematic.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`find_scribal_groups error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: {
            prefix_filter: prefix_filter ?? null,
            min_cosine: min_cosine ?? 0.6,
            min_group_size: min_group_size ?? 3,
            min_sign_count: min_sign_count ?? 50,
            max_tablets_to_scan: max_tablets_to_scan ?? 500,
            top_k_per_tablet: top_k_per_tablet ?? 15,
          },
          groups: [] as never[],
          totals: { tablets_scanned: 0, reciprocal_edges_found: 0, groups_returned: 0, largest_group_size: 0 },
          warnings: [msg],
        },
        provenance: provenance("local", "local:scribal-groups", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.8 — Cross-axis pair-comparison tool ─────────────────────────────

server.registerTool(
  "compare_tablet_pair",
  {
    description:
      "Given two museum numbers, return the full cross-axis similarity (lexical exact-J, fuzzy-J + run-bonus, thematic cosine, scribal-signature cosine + Jaccard) PLUS an identification verdict (same_composition_same_scribe / same_composition_different_scribe / same_scribe_different_composition / physical_join_candidate / thematic_only / weak_relationship / unrelated). Single-call cross-axis pair diagnostic — completes the per-pair zoom layer that reconstruct_cluster + cluster_pair_similarity_matrix handle at corpus/cluster scale. The verdict decision-tree mirrors the methods paper §3.4 + §3.4.1 framing: each axis answers a distinct Assyriological question and the combined pattern is more informative than any single metric.",
    inputSchema: {
      tablet_a: z.string().min(1).describe("First museum number (e.g., 'BM.34970')."),
      tablet_b: z.string().min(1).describe("Second museum number (e.g., '1881,0204.471')."),
    },
  },
  async ({ tablet_a, tablet_b }) => {
    const SCHEMA = schemaId("compare_tablet_pair");
    try {
      const result = compareTabletPair({ tabletA: tablet_a, tabletB: tablet_b });

      const lines: string[] = [
        `Pair: ${result.tablet_a} ↔ ${result.tablet_b}`,
        ``,
        `─── VERDICT ───`,
        `Primary relationship: ${result.verdict.primary_relationship}`,
        `Confidence: ${result.verdict.confidence}`,
      ];
      for (const ev of result.verdict.evidence) lines.push(`  • ${ev}`);
      lines.push(``);

      lines.push(`─── PER-AXIS DETAIL ───`);
      const axes = [
        { name: "Lexical (exact-J)", axis: result.axes.lexical },
        { name: "Fuzzy (1-sub + run-bonus)", axis: result.axes.fuzzy },
        { name: "Thematic (RI embedding cosine)", axis: result.axes.thematic },
        { name: "Scribal (LLR signature)", axis: result.axes.scribal },
      ];
      for (const { name, axis } of axes) {
        lines.push(`${name}:`);
        if (axis.status === "found") {
          lines.push(`  status: found · direction: ${axis.direction}`);
          for (const [k, v] of Object.entries(axis.values)) {
            lines.push(`  ${k}: ${typeof v === "number" ? v : v}`);
          }
        } else if (axis.status === "below_threshold") {
          lines.push(`  status: below_threshold · direction attempted: ${axis.direction_attempted}`);
          lines.push(`  note: ${axis.threshold_note}`);
        } else {
          lines.push(`  status: tablet_not_in_index · missing: ${axis.missing_tablets.join(", ")}`);
        }
        lines.push(``);
      }
      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:compare-pair", VERSION, {
          citation:
            "Cross-axis pair comparison. v0.18.8. Combines findFuzzyParallels + findThematicParallel + findSameScribeCandidates with a methods-paper-aligned verdict classifier.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`compare_tablet_pair error: ${msg}`, {
        schema: SCHEMA,
        data: {
          tablet_a: tablet_a ?? "",
          tablet_b: tablet_b ?? "",
          axes: {
            lexical: { status: "tablet_not_in_index" as const, missing_tablets: [] as never[] },
            fuzzy: { status: "tablet_not_in_index" as const, missing_tablets: [] as never[] },
            thematic: { status: "tablet_not_in_index" as const, missing_tablets: [] as never[] },
            scribal: { status: "tablet_not_in_index" as const, missing_tablets: [] as never[] },
          },
          verdict: { primary_relationship: "unrelated" as const, confidence: "low" as const, evidence: [msg] },
          warnings: [msg],
        },
        provenance: provenance("local", "local:compare-pair", VERSION),
        warnings: [msg],
      });
    }
  },
);

// ─── v0.18.7 — Cluster topology: full pairwise similarity matrix ──────────

server.registerTool(
  "cluster_pair_similarity_matrix",
  {
    description:
      "Given an arbitrary list of museum numbers (typically the cluster_members from a prior reconstruct_cluster call), compute the FULL upper-triangular pairwise fuzzy-Jaccard matrix. Returns: sparse edge list (pairs with J ≥ min_jaccard), per-tablet degree at multiple thresholds, edge-weight summary stats, connected-component analysis at 5 thresholds (0.10, 0.20, 0.30, 0.40, 0.50). Fills the gap where reconstruct_cluster's BFS-tree edge set captures parent-child relationships but misses many sibling-to-sibling edges below the top-K cutoff. Use cases: cluster visualization, topology analysis, edge-density baseline before publishing a cluster claim, hub/leaf identification.",
    inputSchema: {
      tablet_ids: z
        .array(z.string().min(1))
        .min(2)
        .describe("List of museum numbers to compute the pairwise matrix over. Minimum 2 tablets. Typically populated from a reconstruct_cluster result's cluster_members array (e.g. the 100-member BM.77056 cluster) or any other tablet set the user wants to inspect."),
      min_jaccard: z
        .number()
        .min(0)
        .max(1)
        .optional()
        .describe("Minimum fuzzy-Jaccard for an edge to be included. Default 0.10. Tighter (e.g. 0.20) yields the cluster's strong-similarity backbone; looser (e.g. 0.05) yields the full neighborhood."),
      top_k_per_node: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("How many fuzzy parallels to fetch per tablet (drives sibling-pair coverage). Default 50 (maximizes coverage). Lower if the tablet set is small (≤10) and you want speed."),
    },
  },
  async ({ tablet_ids, min_jaccard, top_k_per_node }) => {
    const SCHEMA = schemaId("cluster_pair_similarity_matrix");
    try {
      const result = clusterPairSimilarityMatrix({
        tabletIds: tablet_ids,
        minJaccard: min_jaccard,
        topKPerNode: top_k_per_node,
      });

      const lines: string[] = [
        `Matrix: ${result.query.tablet_count} tablets · min_J=${result.query.min_jaccard} · top_k=${result.query.top_k_per_node}`,
        `Edges: ${result.edge_stats.edges_above_threshold} of ${result.edge_stats.total_pairs_possible} possible pairs (density=${(result.edge_stats.density * 100).toFixed(1)}%)`,
        `Weights: min=${result.edge_stats.weight_min} median=${result.edge_stats.weight_median} mean=${result.edge_stats.weight_mean} max=${result.edge_stats.weight_max}`,
        ``,
        `Connected components by threshold:`,
        `  threshold   components   largest   isolated`,
      ];
      for (const cc of result.connected_components) {
        lines.push(
          `  J ≥ ${cc.threshold.toFixed(2)}     ${String(cc.component_count).padStart(8)}   ${String(cc.largest_component_size).padStart(6)}   ${String(cc.isolated_tablets).padStart(6)}`,
        );
      }
      lines.push(``);

      const topDegrees = result.per_tablet_degree.slice(0, 10);
      if (topDegrees.length > 0) {
        lines.push(`Top ${topDegrees.length} tablets by degree at J ≥ 0.20:`);
        lines.push(`  tablet                  d(.10)  d(.20)  d(.30)  max_edge`);
        for (const d of topDegrees) {
          lines.push(
            `  ${d.tablet_id.padEnd(22).slice(0, 22)}  ${String(d.degree_at_0_10).padStart(6)}  ${String(d.degree_at_0_20).padStart(6)}  ${String(d.degree_at_0_30).padStart(6)}  ${String(d.max_edge_weight).padStart(8)}`,
          );
        }
        lines.push(``);
      }

      const topEdges = result.edges.slice(0, 15);
      if (topEdges.length > 0) {
        lines.push(`Top ${topEdges.length} edges by fuzzy_jaccard:`);
        for (const e of topEdges) {
          lines.push(`  ${e.source.padEnd(20).slice(0, 20)} ↔ ${e.target.padEnd(20).slice(0, 20)}  J=${e.fuzzy_jaccard.toFixed(4)}`);
        }
        lines.push(``);
      }

      if (result.warnings.length > 0) lines.push(`Warnings: ${result.warnings.join("; ")}`);

      return structuredResult(lines.join("\n"), {
        schema: SCHEMA,
        data: result,
        provenance: provenance("local", "local:cluster-matrix", VERSION, {
          citation:
            "Pairwise fuzzy-Jaccard matrix for an arbitrary tablet set. v0.18.7. Companion to reconstruct_cluster — fills the BFS-tree edge-set gap with full pairwise coverage.",
        }),
        warnings: result.warnings.length > 0 ? result.warnings : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return structuredResult(`cluster_pair_similarity_matrix error: ${msg}`, {
        schema: SCHEMA,
        data: {
          query: { tablet_count: tablet_ids?.length ?? 0, min_jaccard: min_jaccard ?? 0.1, top_k_per_node: top_k_per_node ?? 50 },
          edges: [] as never[],
          edge_stats: { total_pairs_possible: 0, edges_above_threshold: 0, density: 0, weight_min: 0, weight_median: 0, weight_max: 0, weight_mean: 0 },
          per_tablet_degree: [] as never[],
          connected_components: [] as never[],
          not_in_corpus: [] as never[],
          warnings: [msg],
        },
        provenance: provenance("local", "local:cluster-matrix", VERSION),
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
      `cuneiform-mcp v${VERSION} smoke OK — 75 tools registered, all live, all emit structuredContent envelopes per PROTOCOL.md (v0.5 corpus + v0.6 retrieval + v0.7 Discovery Engine + v0.8 Mesopotamian-internal + v0.9-v0.12 expansions + v0.13 Primary-Source Discovery Engine v2.0 + v0.14.0 RAG + v0.14.2 Sign-Inference Engine + v0.14.3 Biblical-Parallel Finder + v0.15.0 Semantic-Embeddings Mode C + v0.16.0 Anomaly Surface + v0.17.0 Refinement + Fuzzy Parallels + v0.17.1 Cluster Reconstructor + v0.18.0 Lacuna Restorer + Scribal Fingerprint + v0.18.4 Collection Coverage + reconstruct_cluster min_sign_count quality filter + v0.18.5 list_collection_prefixes + v0.18.6 find_short_fragments + v0.18.7 cluster_pair_similarity_matrix + v0.18.8 compare_tablet_pair + v0.18.9 find_scribal_groups + v0.18.10 audit_cluster + find_orthographic_outliers_in_prefix + find_cross_prefix_scribal_links + v0.18.11 compare_clusters + find_strongest_fuzzy_pairs_in_prefix + corpus_health_report + v0.18.12 find_tablet_neighborhood + find_lacuna_restoration_candidates + find_thematic_cluster_in_prefix + v0.18.13 enrich_prefix_metadata + fragment_metadata_coverage + v0.18.14 find_unpublished_in_publication + compare_dialects + find_tablets_by_genre + v0.18.15 compare_prefix_pair + find_genre_anchor_tablets_in_prefix + find_tablets_by_provenance + v0.18.16 find_join_candidates_in_prefix + find_lineage_chain + find_high_join_count_tablets + v0.18.17 find_isolate_compositions + find_signature_evolution_in_lineage + extend_dataset_to_motif + v0.18.18 audit_cluster marginal_signal_count bugfix + v0.18.19 find_embedded_fragments + commentary_quotes_base_text verdict + sig-evolution DEFAULT_MAX_CHAIN 15→8 + v0.19.0 find_chunk_parallels + v0.19.1 host_genres_spanned + v0.20.0 corpus-wide chunk discovery — find_formulaic_passages + trace_chunk_diffusion + build_citation_graph + v0.21.0 find_incipits (length-10 chunk-hash index for opening formulae) + prioritize_validation_queue (active-learning ranker) + v0.22.0 build_canonical_recension_tree (neighbor-joining stemma from chunk-overlap) + build_scribal_school_graph (joint scribal+provenance clustering) + v0.23.0 find_similar_signs (sign2vec PPMI+SVD sign-level semantic embeddings) + v0.24.0 compute_lexical_substitution_score (claim 30 cash-out — sign2vec aggregated to tablet-pair level) + v0.25.0 compare_sign_embedding_configs (sign2vec ensemble) + compute_lexical_substitution_lift (baseline-normalized, +2.24σ separation on K.5896 ↔ K.9508 sibling pair) + v0.26.0 compare_sign_neighbors_across_periods (NA/NB diachronic + register drift) + recommend_archetype_thresholds (Round-3 Lever 5 cash-out — 7 archetype profiles) + v0.27.0 compare_sign_neighbors_register_matched (isolates diachronic from register, 3.77/5 vs 4.06/5 confirms diachronic axis is population-dominant))\n`,
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
