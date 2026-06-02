// v0.74.0 — Tests for the BUNDLE-PRIMARY ORACC adapter (src/oracc/).
//
// The PRIMARY data path is now the build-oracc bundle ZIP. These hermetic
// describes (no network) cover every load-bearing pure function:
//   - parseCdl on a REAL rinap/rinap1 corpusjson edition (Q003416, extracted
//     verbatim from the build-oracc bundle): line numbers, surfaces, lemma
//     fields, translation[]===[], AND preservation of a real nonw "/" divider
//     (the parser bug fixed in this build silently dropped these).
//   - parseCatalogue on a REAL rinap/rinap1 catalogue.json slice: genre /
//     period / provenience attach per text id.
//   - bundleSlug / bundleUrl (incl. the ccp -> ccpo special case).
//   - normalizeProject / projectCacheKey / registry.
//   - classifyCorpusJson / parsePagerIds (legacy fallback probes).
//   - parseOraccTei on REAL saao (P-id) + rinap (Q-id) TEI fixtures.
//
// A describe.skipIf(!ORACC_LIVE) block hits the live mirrors, gated on
// reachability so the suite stays green when upstream is down.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseCdl } from "../src/oracc/cdl.js";
import { parseOraccTei } from "../src/oracc/tei.js";
import {
  normalizeProject,
  projectCacheKey,
  classifyCorpusJson,
  parsePagerIds,
  lookupProject,
  ORACC_TARGET_PROJECTS,
} from "../src/oracc/opendata.js";
import { bundleSlug, bundleUrl, parseCatalogue } from "../src/oracc/bundle.js";
import { oraccHttpsGet, ORACC_BASE } from "../src/oracc/fetch.js";
import { oraccHttpsGetBuffer, ORACC_BUILD_BASE } from "../src/oracc/fetch.js";
import type { OraccFetchOutcome } from "../src/oracc/fetch.js";

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const readFix = (name: string) => readFileSync(path.join(FIX, name), "utf8");

// ---------------------------------------------------------------------------
// parseCdl — on a REAL bundle edition (rinap/rinap1 Q003416), incl. the nonw fix.
// ---------------------------------------------------------------------------
describe("parseCdl (real bundle edition rinap/rinap1 Q003416)", () => {
  const doc = JSON.parse(readFix("oracc-cdl-rinap-Q003416.json"));
  const parsed = parseCdl(doc);

  it("extracts the real textid", () => {
    expect(parsed.textId).toBe("Q003416");
  });

  it("emits one line per line-start node (7 lines, labels 1..7)", () => {
    expect(parsed.lines).toHaveLength(7);
    expect(parsed.lines.map((l) => l.label)).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  });

  it("renders transliteration with padded label + space-joined frags", () => {
    expect(parsed.transliteration[0]).toBe("   1  [... u₂]-ša₂-aš₂-ši-qa");
    expect(parsed.transliteration[2]).toBe("   3  [...] qab-li");
  });

  it("PRESERVES the real nonw '/' divider inline (line 4) — the bug this build fixes", () => {
    // Before the fix, the '/' nonw d-node was silently dropped; the rendered
    // line jumped straight from 'gi-mir' to 'LUGAL.MEŠ'. It must now appear.
    const line4 = parsed.transliteration[3];
    expect(line4).toContain(" / ");
    expect(line4).toBe("   4  [... UGU gi-mir / LUGAL.MEŠ a]-šib BARA₂.MEŠ");

    // And it is a MARKER token, not a lemma — distinguishable for consumers.
    const tokens = parsed.lines[3].tokens;
    const marker = tokens.find((t) => t.frag === "/");
    expect(marker).toBeDefined();
    expect(marker!.kind).toBe("marker");
    expect(marker!.markerType).toBe("nonw");
    expect(marker!.cf).toBeNull();
    // The surrounding lemmas remain lemma-kind with their real frags.
    expect(tokens.filter((t) => t.kind === "lemma").map((t) => t.frag)).toContain("gi-mir");
    expect(tokens.filter((t) => t.kind === "lemma").map((t) => t.frag)).toContain("LUGAL.MEŠ");
  });

  it("tags lemma tokens with kind:'lemma' and captures lang", () => {
    const firstLemma = parsed.lines[0].tokens.find((t) => t.kind === "lemma");
    expect(firstLemma).toBeDefined();
    expect(firstLemma!.lang).toBe("akk");
  });

  it("returns an empty translation[] (CDL carries no translation)", () => {
    expect(parsed.translation).toEqual([]);
  });

  it("does not throw on empty / malformed input", () => {
    expect(parseCdl({}).lines).toEqual([]);
    expect(parseCdl(null).lines).toEqual([]);
    expect(parseCdl({ cdl: "nope" }).lines).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseCatalogue — REAL rinap/rinap1 catalogue slice; metadata attaches.
// ---------------------------------------------------------------------------
describe("parseCatalogue (real rinap/rinap1 catalogue slice)", () => {
  const cat = parseCatalogue(readFix("oracc-catalogue-rinap-sample.json"), "rinap/rinap1");

  it("enumerates the member ids", () => {
    expect(cat.ids).toContain("Q003414");
    expect(cat.ids).toContain("Q003416");
  });

  it("attaches real genre / period / provenience per text id", () => {
    const e = cat.entries["Q003416"];
    expect(e.genre).toBe("Royal Inscription");
    expect(e.period).toBe("Neo-Assyrian");
    expect(e.provenience).toBe("Nimrud (Kalhu)");
    expect(e.designation).toBe("Tiglath-pileser III 03");
    expect(e.cdli_id).toBe("P463048");
  });

  it("treats a non-catalogue body as empty (no throw)", () => {
    expect(parseCatalogue("", "x").ids).toEqual([]);
    expect(parseCatalogue("<html></html>", "x").ids).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// bundleSlug / bundleUrl — the SLUG scheme incl. ccp -> ccpo.
// ---------------------------------------------------------------------------
describe("bundleSlug + bundleUrl", () => {
  it("maps '/' to '-' in the slug", () => {
    expect(bundleSlug("saao/saa01")).toBe("saao-saa01");
    expect(bundleSlug("rinap/rinap1")).toBe("rinap-rinap1");
    expect(bundleSlug("ribo/babylon7")).toBe("ribo-babylon7");
    expect(bundleSlug("dcclt")).toBe("dcclt");
  });
  it("special-cases ccp -> ccpo (ccp.zip is HTTP 500; ccpo.zip is 200)", () => {
    expect(bundleSlug("ccp")).toBe("ccpo");
    expect(bundleSlug("ccpo")).toBe("ccpo");
  });
  it("strips slashes before slugging", () => {
    expect(bundleSlug("/saao/saa01/")).toBe("saao-saa01");
  });
  it("builds the build-oracc zip url", () => {
    expect(bundleUrl("rinap/rinap1")).toBe(`${ORACC_BUILD_BASE}/json/rinap-rinap1.zip`);
    expect(bundleUrl("ccp")).toBe(`${ORACC_BUILD_BASE}/json/ccpo.zip`);
  });
});

// ---------------------------------------------------------------------------
// normalizeProject / projectCacheKey / registry
// ---------------------------------------------------------------------------
describe("normalizeProject + projectCacheKey", () => {
  it("strips leading/trailing slashes", () => {
    expect(normalizeProject("/saao/saa01/")).toBe("saao/saa01");
    expect(normalizeProject("dcclt")).toBe("dcclt");
    expect(normalizeProject("///rinap/rinap1")).toBe("rinap/rinap1");
  });
  it("flattens slashes to dashes for the on-disk cache key", () => {
    expect(projectCacheKey("saao/saa01")).toBe("saao-saa01");
    expect(projectCacheKey("/rinap/rinap1/")).toBe("rinap-rinap1");
    expect(projectCacheKey("dcclt")).toBe("dcclt");
  });
});

describe("project registry", () => {
  it("lists all 5 target corpora incl. ccp (now bundle-served as ccpo)", () => {
    const names = ORACC_TARGET_PROJECTS.map((p) => p.pathname);
    expect(names).toEqual(["dcclt", "saao/saa01", "rinap/rinap1", "ribo/babylon7", "ccp"]);
    // ccp is no longer flagged unavailable — the build-oracc bundle serves it.
    const ccp = ORACC_TARGET_PROJECTS.find((p) => p.pathname === "ccp");
    expect(ccp?.unavailable).toBeUndefined();
  });
  it("resolves a nested sub-project by top-level prefix", () => {
    expect(lookupProject("saao/saa05")?.pathname.split("/")[0]).toBe("saao");
    expect(lookupProject("rinap/rinap4")?.pathname.split("/")[0]).toBe("rinap");
  });
});

// ---------------------------------------------------------------------------
// classifyCorpusJson — legacy dead-opendata classifier (fallback probe).
// ---------------------------------------------------------------------------
describe("classifyCorpusJson", () => {
  const mk = (over: Partial<OraccFetchOutcome>): OraccFetchOutcome =>
    ({ ok: true, status: 200, body: "", contentType: "application/json", ...over } as OraccFetchOutcome);

  it("classifies 200 + 0 bytes as empty-200 (dead opendata)", () => {
    expect(classifyCorpusJson(mk({ body: "" }))).toBe("empty-200");
  });
  it("classifies 200 + text/html (pager-error) as html-error", () => {
    expect(
      classifyCorpusJson(mk({ body: "<html><body>error</body></html>", contentType: "text/html; charset=utf-8" })),
    ).toBe("html-error");
  });
  it("classifies real JSON bytes as available", () => {
    expect(classifyCorpusJson(mk({ body: '{"type":"cdl","cdl":[]}' }))).toBe("available");
  });
  it("classifies a non-2xx as fetch-failed", () => {
    expect(classifyCorpusJson({ ok: false, status: 500, error: "HTTP 500", contentType: null })).toBe("fetch-failed");
  });
});

// ---------------------------------------------------------------------------
// parsePagerIds — id enumeration from a saved DCCLT pager HTML fixture.
// ---------------------------------------------------------------------------
describe("parsePagerIds", () => {
  const html = readFix("oracc-pager-dcclt-king.html");
  const res = parsePagerIds(html, "dcclt", "king", 500);

  it("reads data-imax as the reported total", () => {
    expect(res.reportedTotal).toBeGreaterThan(0);
  });
  it("extracts deduped [PQX]\\d+ ids", () => {
    expect(res.textIds.length).toBeGreaterThan(0);
    for (const id of res.textIds) expect(id).toMatch(/^[PQX]\d+$/);
    expect(new Set(res.textIds).size).toBe(res.textIds.length);
  });
  it("respects the maxIds cap", () => {
    const capped = parsePagerIds(html, "dcclt", "king", 3);
    expect(capped.textIds.length).toBeLessThanOrEqual(3);
  });
  it("returns ok:false + warning (never throws) on a non-pager body", () => {
    const bad = parsePagerIds("<html>nope</html>", "dcclt", "king");
    expect(bad.ok).toBe(false);
    expect(bad.warnings.join(" ")).toMatch(/no p4Pager/);
  });
});

// ---------------------------------------------------------------------------
// parseOraccTei — REAL fixtures (fallback channel), parsing NOT mocked away.
// ---------------------------------------------------------------------------
describe("parseOraccTei (real fixtures — fallback channel)", () => {
  it("parses saao/saa01 P224485 (P-id, 71 KB) into transliteration + translation", () => {
    const xml = readFix("oracc-tei-saao-P224485.xml");
    const parsed = parseOraccTei(xml, "P224485");
    expect(parsed.transliteration.length).toBeGreaterThan(10);
    expect(parsed.translation.length).toBeGreaterThan(0);
    for (const l of parsed.transliteration) expect(l.trim().length).toBeGreaterThan(0);
  });

  it("parses rinap/rinap1 Q003414 (Q-id, 13 KB) into transliteration", () => {
    const xml = readFix("oracc-tei-rinap-Q003414.xml");
    const parsed = parseOraccTei(xml, "Q003414");
    expect(parsed.transliteration.length).toBeGreaterThan(5);
    expect(typeof parsed.title).toBe("string");
  });

  it("returns empty arrays (no throw) for a non-TEI body", () => {
    const parsed = parseOraccTei("<html><body>404</body></html>", "X1");
    expect(parsed.transliteration).toEqual([]);
    expect(parsed.translation).toEqual([]);
    expect(parsed.title).toBe("X1");
  });
});

// ---------------------------------------------------------------------------
// LIVE block — gated on build-oracc bundle host reachability.
// ---------------------------------------------------------------------------
async function buildOraccReachable(): Promise<boolean> {
  // HEAD-equivalent: a small ranged probe would be ideal, but the host doesn't
  // honor Range on these; we just confirm the rinap1 zip responds as a PK zip
  // by fetching it (3.3 MB — acceptable for an opt-in live test) OR skip.
  const res = await oraccHttpsGet(`${ORACC_BASE}/projects.json`, 8000);
  return res.ok;
}
const ORACC_LIVE = await buildOraccReachable();
if (!ORACC_LIVE) {
  // eslint-disable-next-line no-console
  console.warn("[oraccOpendata.test] ORACC mirrors unreachable; live tests skipped.");
}

describe.skipIf(!ORACC_LIVE)("build-oracc bundle live", () => {
  it("rinap-rinap1.zip responds as a genuine PK zip (opt-in, ~3.3 MB)", async () => {
    const res = await oraccHttpsGetBuffer(`${ORACC_BUILD_BASE}/json/rinap-rinap1.zip`, 90000);
    // The bundle is multi-MB and the host is volatile — treat any non-ok
    // outcome (timeout / transient 5xx / truncated read) as a skip, not a
    // failure. The hermetic describes above prove the parse path on the real
    // edition + catalogue extracted from this very bundle.
    if (!res.ok || res.body.length < 4) {
      console.warn("[oraccOpendata.test] build-oracc bundle not fully served right now; skipping assertion.");
      return;
    }
    // PK signature => genuine zip.
    expect(res.body[0]).toBe(0x50);
    expect(res.body[1]).toBe(0x4b);
  }, 120000); // multi-MB download — override vitest's 5s default test timeout.

  it("saao TEI fallback still parses P224485 end-to-end", async () => {
    const res = await oraccHttpsGet(`${ORACC_BASE}/saao/saa01/tei/P224485.xml`);
    if (!res.ok || !res.body.includes("<TEI")) {
      console.warn("[oraccOpendata.test] saao TEI not served right now; skipping assertion.");
      return;
    }
    const parsed = parseOraccTei(res.body, "P224485");
    expect(parsed.transliteration.length).toBeGreaterThan(10);
  });
});
