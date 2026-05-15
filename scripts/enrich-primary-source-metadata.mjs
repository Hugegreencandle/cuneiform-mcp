// v0.13.1 — Metadata enrichment for the v0.13.0 primary-source parallels.
// Fetches eBL /fragments/<id> for each unique tablet ID and extracts
// genre + period (script) + provenance + language. Re-scores parallels
// with cross-boundary bonuses per the SPEC formula.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const EBL_BASE = "https://www.ebl.lmu.de/api";
const USER_AGENT = "cuneiform-mcp/0.13.1 (research; danebrown)";

const PSP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json";
const METADATA_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/tabletMetadata.json";
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const METADATA_CACHE = join(CACHE_DIR, "fragment-metadata.json");

// CLI
const args = process.argv.slice(2);
function arg(name, def) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx < 0) return def;
  return args[idx + 1];
}
const CONCURRENCY = parseInt(arg("concurrency", "5"), 10);
const REFRESH_CACHE = args.includes("--refresh");

console.error(`v0.13.1 Metadata Enrichment`);
console.error(`  concurrency: ${CONCURRENCY}`);
console.error(`  cache: ${METADATA_CACHE}`);
console.error("");

// Load primary-source parallels
const psp = JSON.parse(readFileSync(PSP_PATH, "utf8"));
const uniqueIds = new Set();
for (const p of psp.parallels) {
  uniqueIds.add(p.tablet_a.museum_number);
  uniqueIds.add(p.tablet_b.museum_number);
}
console.error(`Loaded ${psp.parallels.length} parallels with ${uniqueIds.size} unique tablet IDs`);

// Load existing metadata cache if present
let cache = {};
if (existsSync(METADATA_CACHE) && !REFRESH_CACHE) {
  try {
    cache = JSON.parse(readFileSync(METADATA_CACHE, "utf8"));
    console.error(`Loaded ${Object.keys(cache).length} cached metadata records`);
  } catch (e) {
    console.error(`  cache load failed: ${e.message}`);
    cache = {};
  }
}

// Fetch metadata for a single ID
async function fetchOne(id) {
  if (cache[id] !== undefined) return { id, cached: true, data: cache[id] };
  const url = `${EBL_BASE}/fragments/${encodeURIComponent(id)}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) {
      cache[id] = null;
      return { id, cached: false, data: null, http_status: res.status };
    }
    const body = await res.json();
    // Extract the metadata we care about
    const genres = [];
    const genresFlat = [];
    for (const g of body.genres ?? []) {
      const cat = g.category || [];
      genresFlat.push(...cat.filter((c) => c !== "CANONICAL"));
      if (cat.length > 0) genres.push(cat.join(" → "));
    }
    const data = {
      museum_number: body.museumNumber
        ? `${body.museumNumber.prefix}.${body.museumNumber.number}${body.museumNumber.suffix ? "." + body.museumNumber.suffix : ""}`
        : id,
      designation: body.designation || null,
      script: body.script || body.scriptPeriod || null, // period
      provenance: body.provenance?.site || body.provenance || null, // city
      collection: body.collection || null,
      genres,
      genres_flat: genresFlat,
      joins_count: (body.joins || []).reduce((sum, g) => sum + (g.length || 0), 0),
    };
    cache[id] = data;
    return { id, cached: false, data };
  } catch (e) {
    cache[id] = null;
    return { id, cached: false, data: null, error: e.message };
  }
}

// Concurrent fetch with progress reporting
async function fetchAll(ids) {
  const idsArr = [...ids];
  let cursor = 0;
  let fetched = 0;
  let cached = 0;
  let failed = 0;
  const t0 = Date.now();

  async function worker(workerId) {
    while (cursor < idsArr.length) {
      const i = cursor++;
      const id = idsArr[i];
      const result = await fetchOne(id);
      if (result.cached) cached++;
      else if (result.data) fetched++;
      else failed++;

      if ((fetched + cached + failed) % 25 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = (fetched + cached + failed) / elapsed;
        const eta = (idsArr.length - (fetched + cached + failed)) / rate;
        console.error(
          `  ${fetched + cached + failed}/${idsArr.length} · cached=${cached} fetched=${fetched} failed=${failed} · ${elapsed.toFixed(0)}s elapsed · ~${eta.toFixed(0)}s ETA`,
        );
      }
    }
  }

  const workers = [];
  for (let w = 0; w < CONCURRENCY; w++) workers.push(worker(w));
  await Promise.all(workers);

  return { fetched, cached, failed, elapsed_s: (Date.now() - t0) / 1000 };
}

console.error("Fetching metadata from eBL...");
const stats = await fetchAll(uniqueIds);
console.error(
  `Done: fetched=${stats.fetched}, cached=${stats.cached}, failed=${stats.failed} in ${stats.elapsed_s.toFixed(0)}s`,
);

// Persist cache
writeFileSync(METADATA_CACHE, JSON.stringify(cache, null, 0));
console.error(`Cache saved to ${METADATA_CACHE} (${Object.keys(cache).length} entries)`);
console.error("");

// =============================================================================
// Re-score parallels with cross-boundary bonuses
// =============================================================================

// Genre normalization — map specific eBL genre tags to broad categories
const GENRE_NORMALIZATION = {
  // Canonical literary genres → "literary"
  "LITERATURE": "literary",
  "EPIC": "literary",
  "MYTH": "literary",
  "HYMN": "literary",
  "PRAYER": "literary",
  "WISDOM": "literary",
  // Divinatory
  "DIVINATION": "divinatory",
  "OMEN": "divinatory",
  "EXTISPICY": "divinatory",
  "ASTROLOGY": "divinatory",
  "HEMEROLOGY": "divinatory",
  // Magical/ritual
  "MAGIC": "magical_ritual",
  "RITUAL": "magical_ritual",
  "INCANTATION": "magical_ritual",
  "MEDICINE": "magical_ritual",
  // Lexical
  "LEXICAL": "lexical",
  "SIGNS": "lexical",
  // Administrative
  "ADMINISTRATIVE": "administrative",
  "ECONOMIC": "administrative",
  "ACCOUNTS": "administrative",
  "LETTER": "administrative",
  // Mathematical/astronomical
  "MATHEMATICS": "mathematical",
  "ASTRONOMY": "astronomical",
  // Royal
  "ROYAL": "royal_inscription",
  "INSCRIPTION": "royal_inscription",
};

// Genres that are heavily formulaic (and so generate noisy matches)
const FORMULAIC_GENRES = new Set([
  "royal_inscription",
  "administrative",
]);

function normalizeGenre(genres) {
  // genres is an array of strings (the genres_flat field)
  if (!genres || genres.length === 0) return null;
  // Map each to broad category; pick most-specific or first
  for (const g of genres) {
    const upper = g.toUpperCase().split(" → ").pop() || g.toUpperCase();
    if (GENRE_NORMALIZATION[upper]) return GENRE_NORMALIZATION[upper];
  }
  // Fallback: first genre flattened
  return genres[0].toLowerCase().replace(/\s+/g, "_");
}

function normalizePeriod(script) {
  if (!script) return null;
  const s = (typeof script === "string" ? script : script.name || "").toLowerCase();
  if (!s) return null;
  // Broad period buckets
  if (/old.babylonian|ob\b/.test(s)) return "Old_Babylonian";
  if (/middle.babylonian|mb\b/.test(s)) return "Middle_Babylonian";
  if (/neo.assyrian|na\b/.test(s)) return "Neo_Assyrian";
  if (/neo.babylonian|nb\b/.test(s)) return "Neo_Babylonian";
  if (/late.babylonian|lb\b/.test(s)) return "Late_Babylonian";
  if (/middle.assyrian|ma\b/.test(s)) return "Middle_Assyrian";
  if (/old.assyrian|oa\b/.test(s)) return "Old_Assyrian";
  if (/persian|achaem/.test(s)) return "Achaemenid";
  if (/seleucid|hellen/.test(s)) return "Seleucid";
  if (/ur.iii|ur3|neo.sumerian/.test(s)) return "Ur_III";
  if (/early.dynastic|ed\b/.test(s)) return "Early_Dynastic";
  return s.replace(/\s+/g, "_");
}

function normalizeCity(provenance) {
  if (!provenance) return null;
  const p = (typeof provenance === "string" ? provenance : provenance.name || "").toLowerCase();
  if (!p) return null;
  // Strip qualifiers; pick canonical name
  for (const city of ["nineveh", "babylon", "uruk", "nippur", "sippar", "assur", "aššur", "kish", "kiš", "ur", "lagash", "girsu", "umma", "drehem", "puzrish-dagan", "isin", "larsa", "borsippa"]) {
    if (p.includes(city)) return city.replace(/š/g, "sh").replace(/^./, (c) => c.toUpperCase());
  }
  return p.replace(/\s+/g, "_");
}

// Tablet metadata index
const tabletMeta = new Map();
for (const id of uniqueIds) {
  const raw = cache[id];
  if (!raw) {
    tabletMeta.set(id, null);
    continue;
  }
  tabletMeta.set(id, {
    museum_number: raw.museum_number || id,
    designation: raw.designation,
    genre: normalizeGenre(raw.genres_flat || []),
    period: normalizePeriod(raw.script),
    city: normalizeCity(raw.provenance),
    raw_genres: raw.genres_flat || [],
    raw_script: raw.script,
    raw_provenance: raw.provenance,
  });
}

// Now re-score every parallel
function isFormulaic(meta) {
  if (!meta || !meta.genre) return false;
  return FORMULAIC_GENRES.has(meta.genre);
}

let withFullMetadata = 0;
let withPartialMetadata = 0;
let withNoMetadata = 0;

for (const p of psp.parallels) {
  const metaA = tabletMeta.get(p.tablet_a.museum_number) || null;
  const metaB = tabletMeta.get(p.tablet_b.museum_number) || null;

  // Update tablet refs with metadata
  if (metaA) {
    if (metaA.designation) p.tablet_a.designation = metaA.designation;
    if (metaA.genre) p.tablet_a.genre = metaA.genre;
    if (metaA.period) p.tablet_a.period = metaA.period;
    if (metaA.city) p.tablet_a.city = metaA.city;
  }
  if (metaB) {
    if (metaB.designation) p.tablet_b.designation = metaB.designation;
    if (metaB.genre) p.tablet_b.genre = metaB.genre;
    if (metaB.period) p.tablet_b.period = metaB.period;
    if (metaB.city) p.tablet_b.city = metaB.city;
  }

  // Cross-boundary computation — false if either side missing the field
  const diffGenre = !!(metaA?.genre && metaB?.genre && metaA.genre !== metaB.genre);
  const diffPeriod = !!(metaA?.period && metaB?.period && metaA.period !== metaB.period);
  const diffCity = !!(metaA?.city && metaB?.city && metaA.city !== metaB.city);

  p.cross_boundary = {
    different_genre: diffGenre,
    different_period: diffPeriod,
    different_city: diffCity,
    different_language: false, // not extracted from this metadata pass
  };

  // Novelty score per the SPEC formula
  let novelty = p.match_evidence.jaccard;
  if (diffGenre) novelty += 0.15;
  if (diffPeriod) novelty += 0.10;
  if (diffCity) novelty += 0.10;
  // Language bonus skipped
  // Penalty for formulaic
  if (isFormulaic(metaA) || isFormulaic(metaB)) novelty -= 0.30;

  p.novelty_score = parseFloat(Math.max(0, Math.min(2, novelty)).toFixed(4));

  // Track metadata coverage
  const metaFields = [metaA?.genre, metaA?.period, metaA?.city, metaB?.genre, metaB?.period, metaB?.city];
  const fieldsPresent = metaFields.filter((f) => f).length;
  if (fieldsPresent === 6) withFullMetadata++;
  else if (fieldsPresent > 0) withPartialMetadata++;
  else withNoMetadata++;
}

// Re-sort by novelty_score
psp.parallels.sort((a, b) => b.novelty_score - a.novelty_score);

// Update meta
psp._meta.metadata_enrichment_status =
  withFullMetadata > psp.parallels.length * 0.5 ? "complete" : "partial_only_eBL";
psp._meta.metadata_enrichment_date = new Date().toISOString().substring(0, 10);
psp._meta.metadata_coverage = {
  total_parallels: psp.parallels.length,
  with_full_metadata: withFullMetadata,
  with_partial_metadata: withPartialMetadata,
  with_no_metadata: withNoMetadata,
  cross_genre_count: psp.parallels.filter((p) => p.cross_boundary.different_genre).length,
  cross_period_count: psp.parallels.filter((p) => p.cross_boundary.different_period).length,
  cross_city_count: psp.parallels.filter((p) => p.cross_boundary.different_city).length,
};
psp._meta.note =
  "v0.13.1: metadata enrichment via eBL /fragments/<id> complete. Cross-boundary bonuses now applied in novelty_score. Formulaic-genre penalty (-0.30) applies to royal_inscription + administrative tablets.";

writeFileSync(PSP_PATH, JSON.stringify(psp, null, 2) + "\n");

// Write standalone tablet metadata
const tabletMetaObj = {};
for (const [id, meta] of tabletMeta) {
  if (meta) tabletMetaObj[id] = meta;
}
writeFileSync(
  METADATA_PATH,
  JSON.stringify(
    {
      _meta: {
        compiled: new Date().toISOString().substring(0, 10),
        source: "eBL /fragments/<id> API",
        total_tablets: Object.keys(tabletMetaObj).length,
      },
      tablets: tabletMetaObj,
    },
    null,
    2,
  ) + "\n",
);

console.error("v0.13.1 metadata enrichment complete.");
console.error(`  ${psp.parallels.length} parallels re-scored`);
console.error(`  Coverage: full=${withFullMetadata}, partial=${withPartialMetadata}, none=${withNoMetadata}`);
console.error(`  Cross-boundary counts: genre=${psp._meta.metadata_coverage.cross_genre_count}, period=${psp._meta.metadata_coverage.cross_period_count}, city=${psp._meta.metadata_coverage.cross_city_count}`);
console.error("");
console.error("Top 10 after re-scoring:");
psp.parallels.slice(0, 10).forEach((p, i) => {
  const aMeta = `${p.tablet_a.genre || "?"}/${p.tablet_a.period || "?"}/${p.tablet_a.city || "?"}`;
  const bMeta = `${p.tablet_b.genre || "?"}/${p.tablet_b.period || "?"}/${p.tablet_b.city || "?"}`;
  const boundary = [];
  if (p.cross_boundary.different_genre) boundary.push("G");
  if (p.cross_boundary.different_period) boundary.push("P");
  if (p.cross_boundary.different_city) boundary.push("C");
  console.error(
    `  ${i + 1}. ${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number} · novelty=${p.novelty_score.toFixed(3)} · jaccard=${p.match_evidence.jaccard.toFixed(3)} · [${boundary.join("")}] · A:${aMeta} B:${bMeta}`,
  );
});
