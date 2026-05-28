// v0.65.0 — cdli_ebl_crosswalk
//
// Bidirectional ID mapping between CDLI artifact records and eBL fragment
// records. Both upstream APIs publish the cross-reference as a typed field:
//
//   - eBL  GET /api/fragments/{museum_number}      → externalNumbers.cdliNumber
//   - CDLI GET /artifacts/{integer-id}             → external_resources[] with
//                                                    abbrev === "eBL" carrying
//                                                    the eBL museum_number as
//                                                    external_resource_key
//
// Asymmetric reliability: the eBL → CDLI direction is more complete. Several
// CDLI records lack the reciprocal eBL backlink even when eBL points to them
// (e.g. P572493 ↔ BM.47463). When CDLI's external_resources is missing the
// eBL link, this tool falls back to parsing CDLI's `museum_no` string into
// dotted eBL form ("BM 047463" → "BM.47463") and probes eBL directly. A
// `museum_no` containing " + " (a CDLI join expression, e.g.
// "BM 047463 + BM 049124") expands into multiple eBL matches.
//
// Pure HTTP + tiny normalizer; no local cache, no side effects.

const CDLI_BASE = "https://cdli.earth";
const EBL_BASE = "https://www.ebl.lmu.de/api";

// ─── Public types ──────────────────────────────────────────────────────────

export type InputType =
  | "cdli_p_number"
  | "ebl_museum_number"
  | "cdli_integer_id";

export type Confidence = "native" | "inferred_via_museum_number";

export type CrosswalkMatch = {
  ebl_id: string;
  cdli_p_number: string | null;
  cdli_integer_id: number | null;
  museum_number_normalized: string;
  cdli_artifact_url: string | null;
  ebl_fragment_url: string;
  confidence: Confidence;
};

export type CrosswalkResult = {
  query: {
    input_id: string;
    detected_type: InputType;
  };
  matches: CrosswalkMatch[];
  warnings: string[];
};

// ─── Input detection + normalization ──────────────────────────────────────

/**
 * Detect the input form. Order matters: P-numbers (case-insensitive) before
 * bare integers, because both can be all-digits after normalization.
 */
export function detectInputType(raw: string): InputType {
  const s = raw.trim();
  if (/^P\d{4,7}$/i.test(s)) return "cdli_p_number";
  if (/^\d{1,7}$/.test(s)) return "cdli_integer_id";
  return "ebl_museum_number";
}

/**
 * Normalize a free-form museum number into eBL's dotted form. Examples:
 *   "BM 47463"       → "BM.47463"
 *   "BM.47463"       → "BM.47463"
 *   "Sm.747"         → "Sm.747"
 *   "K.5896"         → "K.5896"
 *   "Ki.1904-10-9.78" → "Ki.1904-10-9.78"   (internal dashes preserved)
 *
 * Rules:
 *   - Trim outer whitespace.
 *   - Convert the FIRST run of whitespace between the alpha prefix and the
 *     number into a dot. Subsequent dashes/dots/commas inside the number are
 *     preserved verbatim (the Ki.1904-10-9.78 case).
 *   - If the input already starts with "prefix.number" we leave it alone.
 *   - Strip CDLI-style leading zeros after the prefix: "BM 047463" → "BM.47463"
 *     (matches eBL's canonical form for British Museum numbers).
 */
export function normalizeMuseumNumber(raw: string): string {
  let s = raw.trim();
  // Collapse internal whitespace runs into a single space first.
  s = s.replace(/\s+/g, " ");
  // If "Prefix Number..." form, join with a dot. We only target the FIRST
  // alpha/digit boundary — anything after the first number block stays.
  const m = s.match(/^([A-Za-z]+)[\s.]+(\d.*)$/);
  if (m) {
    const prefix = m[1];
    let rest = m[2];
    // Strip leading zeros on the first number segment ONLY, before any
    // dash/dot/comma. eBL stores BM numbers without leading zeros.
    const restMatch = rest.match(/^(\d+)(.*)$/);
    if (restMatch) {
      const leading = restMatch[1].replace(/^0+(?=\d)/, "");
      rest = leading + restMatch[2];
    }
    s = `${prefix}.${rest}`;
  }
  return s;
}

// ─── HTTP helpers (timeout + UA) ───────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 15_000;

async function jsonFetch<T>(
  url: string,
  userAgent: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<
  | { ok: true; status: number; body: T }
  | { ok: false; status: number | null; error: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": userAgent, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as T;
    return { ok: true, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      status: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ─── CDLI helpers ──────────────────────────────────────────────────────────

type CdliExternalResource = {
  external_resource?: { abbrev?: string };
  external_resource_key?: string;
};

type CdliArtifact = {
  id?: number;
  museum_no?: string;
  external_resources?: CdliExternalResource[];
};

type CdliSearchHit = { id?: number };

/**
 * Resolve a CDLI P-number to its integer DB id via /search. Mirrors the
 * existing resolveCdliId() in src/index.ts so the crosswalk tool is
 * self-contained (no circular import from index.ts).
 */
export async function resolveCdliPNumber(
  pNumber: string,
  userAgent: string,
): Promise<{ id: number | null; error: string | null }> {
  const params = new URLSearchParams();
  params.append("simple-field[]", "id");
  params.append("simple-value[]", pNumber.toUpperCase());
  params.append("simple-op[]", "AND");
  params.append("limit", "1");
  const url = `${CDLI_BASE}/search?${params.toString()}`;
  const res = await jsonFetch<CdliSearchHit[]>(url, userAgent);
  if (!res.ok) {
    return { id: null, error: `CDLI search failed for ${pNumber}: ${res.error}` };
  }
  const arr = res.body;
  if (!Array.isArray(arr) || arr.length === 0 || typeof arr[0].id !== "number") {
    return { id: null, error: `No CDLI artifact matches ${pNumber}.` };
  }
  return { id: arr[0].id, error: null };
}

/**
 * Fetch the CDLI artifact record by integer id. Returns the single-row form
 * (CDLI returns a one-element ARRAY from /artifacts/{id}; we unwrap).
 */
export async function fetchCdliArtifact(
  id: number,
  userAgent: string,
): Promise<{ artifact: CdliArtifact | null; error: string | null }> {
  const url = `${CDLI_BASE}/artifacts/${id}`;
  const res = await jsonFetch<CdliArtifact[] | CdliArtifact>(url, userAgent);
  if (!res.ok) {
    if (res.status === 404) return { artifact: null, error: null };
    return { artifact: null, error: `CDLI fetch failed for id=${id}: ${res.error}` };
  }
  const body = res.body;
  const x = Array.isArray(body) ? body[0] : body;
  if (!x || typeof x !== "object") return { artifact: null, error: null };
  return { artifact: x, error: null };
}

/**
 * Extract the eBL museum_number from a CDLI artifact's external_resources
 * array, if present. Returns null when CDLI's record lacks the eBL link.
 */
export function eblIdFromCdliExternalResources(
  artifact: CdliArtifact,
): string | null {
  const ext = artifact.external_resources ?? [];
  for (const er of ext) {
    const abbrev = er.external_resource?.abbrev;
    if (typeof abbrev === "string" && abbrev.toLowerCase() === "ebl") {
      const key = er.external_resource_key;
      if (typeof key === "string" && key.length > 0) return key;
    }
  }
  return null;
}

/**
 * Parse a CDLI museum_no field into a list of eBL-form museum numbers. The
 * `museum_no` is a free-text string; a " + " separator denotes a CDLI join
 * expression, e.g. "BM 047463 + BM 049124" → ["BM.47463", "BM.49124"]. A
 * trailing " —" or em-dash means "BM number not explicitly assigned" — we
 * skip parts that look like that.
 *
 * This is the fallback used when CDLI's external_resources lacks an eBL row.
 */
export function eblIdsFromCdliMuseumNo(museumNo: string): string[] {
  if (!museumNo) return [];
  const parts = museumNo.split(/\s\+\s/);
  const out: string[] = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    // Skip placeholder-only strings ("BM —", "—", empty after trim).
    if (/^[A-Za-z]+\s*[—–-]\s*$/.test(trimmed)) continue;
    if (/^[—–-]$/.test(trimmed)) continue;
    const norm = normalizeMuseumNumber(trimmed);
    // Sanity: require at least "Prefix.Number" form to push.
    if (/^[A-Za-z]+\.\d/.test(norm)) out.push(norm);
  }
  return out;
}

// ─── eBL helpers ───────────────────────────────────────────────────────────

type EblFragment = {
  museumNumber?: { prefix?: string; number?: string; suffix?: string };
  externalNumbers?: { cdliNumber?: string; bmIdNumber?: string };
};

/**
 * Format an eBL museumNumber object as "Prefix.Number(.Suffix)". Mirrors the
 * fmtMuseumNumber() helper in src/cache.ts and the inline fmtMuseum() inside
 * the get_fragment tool — kept inline here to keep this module self-contained.
 */
export function fmtEblMuseumNumber(mn: {
  prefix?: string;
  number?: string;
  suffix?: string;
}): string {
  const prefix = mn.prefix ?? "";
  const number = mn.number ?? "";
  const suffix = mn.suffix && mn.suffix.length > 0 ? "." + mn.suffix : "";
  return `${prefix}.${number}${suffix}`;
}

/**
 * Fetch an eBL fragment record. Returns null on 404; surfaces other errors.
 */
export async function fetchEblFragment(
  museumNumber: string,
  userAgent: string,
): Promise<{ fragment: EblFragment | null; error: string | null }> {
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(museumNumber)}`;
  const res = await jsonFetch<EblFragment>(url, userAgent);
  if (!res.ok) {
    if (res.status === 404) return { fragment: null, error: null };
    return { fragment: null, error: `eBL fetch failed for ${museumNumber}: ${res.error}` };
  }
  return { fragment: res.body, error: null };
}

// ─── URL builders ──────────────────────────────────────────────────────────

function cdliArtifactUrl(id: number): string {
  return `${CDLI_BASE}/artifacts/${id}`;
}

function eblFragmentUrl(museumNumber: string): string {
  return `https://www.ebl.lmu.de/fragmentarium/${encodeURIComponent(museumNumber)}`;
}

// ─── Main crosswalk ────────────────────────────────────────────────────────

export type CrosswalkOptions = {
  id: string;
  /** User-Agent header for both APIs. Defaults to a generic v0.65.0 string. */
  userAgent?: string;
};

/**
 * Bidirectional CDLI ↔ eBL ID crosswalk. Behaviour by input type:
 *
 *   - cdli_p_number / cdli_integer_id:
 *       1. Resolve to integer id (P-number → /search → id).
 *       2. Fetch /artifacts/{id}.
 *       3. If artifact.external_resources contains an eBL row → confidence
 *          "native", emit one match.
 *       4. Else fall back to parsing artifact.museum_no into eBL forms; for
 *          each parsed candidate, probe /api/fragments/{n}. Each existing
 *          fragment emits a match with confidence "inferred_via_museum_number".
 *
 *   - ebl_museum_number:
 *       1. Normalize.
 *       2. Fetch /api/fragments/{n}.
 *       3. If fragment.externalNumbers.cdliNumber present → confidence
 *          "native", emit one match (with CDLI integer id resolved via
 *          /search so the consumer doesn't need a second hop).
 *       4. Else emit one match with cdli fields nulled, confidence "native"
 *          (the eBL record exists; the absence of the link is informational).
 */
export async function cdliEblCrosswalk(
  opts: CrosswalkOptions,
): Promise<CrosswalkResult> {
  const inputRaw = opts.id;
  if (typeof inputRaw !== "string" || inputRaw.trim().length === 0) {
    throw new Error("cdli_ebl_crosswalk: id must be a non-empty string.");
  }
  const ua = opts.userAgent ?? "cuneiform-mcp/0.65.0 (cdli_ebl_crosswalk)";

  const detected = detectInputType(inputRaw);
  const warnings: string[] = [];
  const matches: CrosswalkMatch[] = [];

  if (detected === "ebl_museum_number") {
    const normalized = normalizeMuseumNumber(inputRaw);
    const { fragment, error } = await fetchEblFragment(normalized, ua);
    if (error) warnings.push(error);
    if (fragment) {
      const canonical = fragment.museumNumber
        ? fmtEblMuseumNumber(fragment.museumNumber)
        : normalized;
      const cdliP = fragment.externalNumbers?.cdliNumber ?? null;
      let cdliIntId: number | null = null;
      let cdliUrl: string | null = null;
      if (cdliP) {
        const r = await resolveCdliPNumber(cdliP, ua);
        if (r.id !== null) {
          cdliIntId = r.id;
          cdliUrl = cdliArtifactUrl(r.id);
        } else if (r.error) {
          warnings.push(r.error);
        }
      }
      matches.push({
        ebl_id: canonical,
        cdli_p_number: cdliP,
        cdli_integer_id: cdliIntId,
        museum_number_normalized: normalized,
        cdli_artifact_url: cdliUrl,
        ebl_fragment_url: eblFragmentUrl(canonical),
        confidence: "native",
      });
    } else if (!error) {
      warnings.push(
        `eBL has no fragment "${normalized}" (404). No crosswalk match.`,
      );
    }
    return {
      query: { input_id: inputRaw, detected_type: detected },
      matches,
      warnings,
    };
  }

  // CDLI side: resolve to integer id then fetch the artifact.
  let cdliIntId: number;
  let cdliP: string | null;
  if (detected === "cdli_p_number") {
    cdliP = inputRaw.trim().toUpperCase();
    const r = await resolveCdliPNumber(cdliP, ua);
    if (r.id === null) {
      warnings.push(r.error ?? `Could not resolve ${cdliP} to a CDLI id.`);
      return {
        query: { input_id: inputRaw, detected_type: detected },
        matches: [],
        warnings,
      };
    }
    cdliIntId = r.id;
  } else {
    // cdli_integer_id — bare integer; we don't know the P-number yet.
    cdliIntId = parseInt(inputRaw.trim(), 10);
    cdliP = null;
  }

  const { artifact, error: artErr } = await fetchCdliArtifact(cdliIntId, ua);
  if (artErr) warnings.push(artErr);
  if (!artifact) {
    if (!artErr) {
      warnings.push(`CDLI has no artifact with id=${cdliIntId} (404).`);
    }
    return {
      query: { input_id: inputRaw, detected_type: detected },
      matches: [],
      warnings,
    };
  }

  // Try native path first.
  const nativeEbl = eblIdFromCdliExternalResources(artifact);
  if (nativeEbl) {
    const normalized = normalizeMuseumNumber(nativeEbl);
    matches.push({
      ebl_id: normalized,
      cdli_p_number: cdliP,
      cdli_integer_id: cdliIntId,
      museum_number_normalized: normalized,
      cdli_artifact_url: cdliArtifactUrl(cdliIntId),
      ebl_fragment_url: eblFragmentUrl(normalized),
      confidence: "native",
    });
    return {
      query: { input_id: inputRaw, detected_type: detected },
      matches,
      warnings,
    };
  }

  // Fallback: parse museum_no string and probe eBL for each candidate.
  const candidates = artifact.museum_no
    ? eblIdsFromCdliMuseumNo(artifact.museum_no)
    : [];
  if (candidates.length === 0) {
    warnings.push(
      `CDLI artifact ${cdliIntId} has no eBL backlink and museum_no="${artifact.museum_no ?? ""}" yielded no parseable candidates.`,
    );
    return {
      query: { input_id: inputRaw, detected_type: detected },
      matches: [],
      warnings,
    };
  }

  for (const cand of candidates) {
    const { fragment, error } = await fetchEblFragment(cand, ua);
    if (error) {
      warnings.push(error);
      continue;
    }
    if (!fragment) continue;
    const canonical = fragment.museumNumber
      ? fmtEblMuseumNumber(fragment.museumNumber)
      : cand;
    matches.push({
      ebl_id: canonical,
      cdli_p_number: cdliP,
      cdli_integer_id: cdliIntId,
      museum_number_normalized: cand,
      cdli_artifact_url: cdliArtifactUrl(cdliIntId),
      ebl_fragment_url: eblFragmentUrl(canonical),
      confidence: "inferred_via_museum_number",
    });
  }

  if (matches.length === 0) {
    warnings.push(
      `CDLI artifact ${cdliIntId} has no eBL backlink; museum_no fallback tried [${candidates.join(", ")}] but none resolved on eBL.`,
    );
  }

  return {
    query: { input_id: inputRaw, detected_type: detected },
    matches,
    warnings,
  };
}
