// src/oracc/fetch.ts — shared ORACC HTTPS fetcher for the opendata adapter.
//
// oracc.museum.upenn.edu's TLS handshake OMITS the "InCommon RSA Server CA 2"
// intermediate. Browsers/curl recover it via AIA chasing; Node does NOT, so a
// plain fetch()/https.get against the mirror fails with
// "unable to verify the first certificate". We pin the intermediate into the
// CA bundle (it chains to USERTrust RSA CA, already in Node's root set).
//
// This mirrors the oraccHttpsGet helper in src/index.ts (kept self-contained
// here so the adapter + its unit tests do not import index.ts, whose module
// top-level boots the MCP server). The wiring agent may later have index.ts
// import oraccHttpsGet from here to de-duplicate; that is an optional cleanup,
// not required by this build stage.
//
// Sourced from http://crt.sectigo.com/InCommonRSAServerCA2.crt
// Valid 2022-11-16 → 2032-11-15.

import https from "node:https";
import tls from "node:tls";
import { URL as NodeURL } from "node:url";

const INCOMMON_RSA_SERVER_CA_2 = `-----BEGIN CERTIFICATE-----
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
-----END CERTIFICATE-----
`;

const ORACC_CA_BUNDLE = [...tls.rootCertificates, INCOMMON_RSA_SERVER_CA_2];

export type OraccFetchOutcome =
  | { ok: true; status: number; body: string; contentType: string | null }
  | { ok: false; status: number | null; error: string; contentType: string | null };

/**
 * GET one ORACC URL over the InCommon-pinned CA bundle. Never throws — all
 * failures resolve to { ok:false }. Returns the raw body string and the
 * Content-Type header (needed to classify the dead opendata layer's
 * 200+text/html pager-error responses vs real JSON).
 */
export function oraccHttpsGet(url: string, timeoutMs = 20000): Promise<OraccFetchOutcome> {
  return new Promise((resolve) => {
    let u: NodeURL;
    try {
      u = new NodeURL(url);
    } catch {
      resolve({ ok: false, status: null, error: `Invalid URL: ${url}`, contentType: null });
      return;
    }
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": ORACC_USER_AGENT,
          Accept: "application/json,application/xml,text/xml,text/html,*/*",
        },
        ca: ORACC_CA_BUNDLE,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          const ct = (res.headers["content-type"] as string | undefined) ?? null;
          if (status >= 200 && status < 300)
            resolve({ ok: true, status, body, contentType: ct });
          else resolve({ ok: false, status, error: `HTTP ${status}`, contentType: ct });
        });
        res.on("error", (err) =>
          resolve({ ok: false, status: null, error: err.message, contentType: null }),
        );
      },
    );
    req.on("error", (err) =>
      resolve({ ok: false, status: null, error: err.message, contentType: null }),
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, status: null, error: `timeout after ${timeoutMs}ms`, contentType: null });
    });
    req.end();
  });
}

export type OraccBufferOutcome =
  | { ok: true; status: number; body: Buffer; contentType: string | null }
  | { ok: false; status: number | null; error: string; contentType: string | null };

/**
 * Binary-safe GET over the InCommon-pinned CA bundle. Identical transport to
 * oraccHttpsGet but resolves the raw response Buffer (NOT a utf8 string), so
 * the build-oracc bundle ZIPs (application/zip, PK..) survive intact for
 * fflate to unzip. Never throws. Longer default timeout — bundles run to tens
 * of MB (dcclt.zip is ~73 MB).
 */
export function oraccHttpsGetBuffer(url: string, timeoutMs = 120000): Promise<OraccBufferOutcome> {
  return new Promise((resolve) => {
    let u: NodeURL;
    try {
      u = new NodeURL(url);
    } catch {
      resolve({ ok: false, status: null, error: `Invalid URL: ${url}`, contentType: null });
      return;
    }
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: "GET",
        headers: {
          "User-Agent": ORACC_USER_AGENT,
          Accept: "application/zip,application/octet-stream,*/*",
        },
        ca: ORACC_CA_BUNDLE,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(Buffer.from(c)));
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          const status = res.statusCode ?? 0;
          const ct = (res.headers["content-type"] as string | undefined) ?? null;
          if (status >= 200 && status < 300) resolve({ ok: true, status, body, contentType: ct });
          else resolve({ ok: false, status, error: `HTTP ${status}`, contentType: ct });
        });
        res.on("error", (err) =>
          resolve({ ok: false, status: null, error: err.message, contentType: null }),
        );
      },
    );
    req.on("error", (err) =>
      resolve({ ok: false, status: null, error: err.message, contentType: null }),
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, status: null, error: `timeout after ${timeoutMs}ms`, contentType: null });
    });
    req.end();
  });
}

/** Kept in sync with index.ts USER_AGENT; bump alongside VERSION at wiring time. */
export const ORACC_USER_AGENT = "cuneiform-mcp/0.74.0";

export const ORACC_BASE = "https://oracc.museum.upenn.edu";

/** build-oracc bundle host — the LIVE bulk source serving genuine ZIPs. */
export const ORACC_BUILD_BASE = "https://build-oracc.museum.upenn.edu";
