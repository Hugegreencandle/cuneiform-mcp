// v0.13.1 re-score: use the existing cached metadata + apply CORRECT normalizers.
// The initial enrichment pass missed period + city because script is nested
// and provenance is null on most tablets (collection is the proxy).

import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PSP_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/primarySourceParallels.json";
const METADATA_PATH = "/Users/danebrown/Desktop/cuneiform-mcp/data/tabletMetadata.json";
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const METADATA_CACHE = join(CACHE_DIR, "fragment-metadata.json");

const psp = JSON.parse(readFileSync(PSP_PATH, "utf8"));
const cache = JSON.parse(readFileSync(METADATA_CACHE, "utf8"));

const GENRE_NORMALIZATION = {
  LITERATURE: "literary",
  LITERARY: "literary",
  EPIC: "literary",
  MYTH: "literary",
  HYMN: "literary",
  PRAYER: "literary",
  WISDOM: "literary",
  LAMENTATIONS: "literary",
  DIVINATION: "divinatory",
  OMEN: "divinatory",
  EXTISPICY: "divinatory",
  ASTROLOGY: "divinatory",
  HEMEROLOGY: "divinatory",
  MAGIC: "magical_ritual",
  RITUAL: "magical_ritual",
  INCANTATION: "magical_ritual",
  EXORCISTIC: "magical_ritual",
  MEDICINE: "magical_ritual",
  MEDICAL: "magical_ritual",
  UDUGHUL: "magical_ritual",
  LEXICAL: "lexical",
  SIGNS: "lexical",
  ADMINISTRATIVE: "administrative",
  ARCHIVAL: "administrative",
  ECONOMIC: "administrative",
  ACCOUNTS: "administrative",
  LETTER: "administrative",
  MATHEMATICS: "mathematical",
  MATHEMATICAL: "mathematical",
  ASTRONOMY: "astronomical",
  ASTRONOMICAL: "astronomical",
  ROYAL: "royal_inscription",
  INSCRIPTION: "royal_inscription",
  TECHNICAL: "technical",
};

const FORMULAIC_GENRES = new Set(["royal_inscription", "administrative"]);

// Collection → city mapping (eBL stores findspot via `collection` field)
const COLLECTION_TO_CITY = {
  Kuyunjik: "Nineveh",
  "Kuyunjik (Nineveh)": "Nineveh",
  Nineveh: "Nineveh",
  "Uruk (Warka)": "Uruk",
  Uruk: "Uruk",
  Warka: "Uruk",
  Babylon: "Babylon",
  Nippur: "Nippur",
  Sippar: "Sippar",
  "Sippar-Jaḫrurum": "Sippar",
  Aššur: "Assur",
  Assur: "Assur",
  Kish: "Kish",
  Kalḫu: "Nimrud",
  Nimrud: "Nimrud",
  Calah: "Nimrud",
  Khorsabad: "Khorsabad",
  "Dūr-Šarrukēn": "Khorsabad",
  Ur: "Ur",
  Lagash: "Lagash",
  Girsu: "Girsu",
  "Tell Telloh": "Girsu",
  Umma: "Umma",
  Drehem: "Drehem",
  "Puzriš-Dagan": "Drehem",
  Larsa: "Larsa",
  Isin: "Isin",
  Borsippa: "Borsippa",
  Mari: "Mari",
  Ebla: "Ebla",
  Eshnunna: "Eshnunna",
  Tutub: "Tutub",
  Adab: "Adab",
  Shuruppak: "Shuruppak",
  "Tell Fara": "Shuruppak",
  Tello: "Girsu",
};

function normalizeGenre(genresFlat) {
  if (!genresFlat || genresFlat.length === 0) return null;
  // Walk most-specific to least-specific; map first match
  for (let i = genresFlat.length - 1; i >= 0; i--) {
    const g = genresFlat[i].toUpperCase().replace(/\s+/g, "").replace(/[ḫ]/gi, "h").replace(/[š]/gi, "sh");
    if (GENRE_NORMALIZATION[g]) return GENRE_NORMALIZATION[g];
  }
  // Fallback: take first genre, lowercase
  return genresFlat[0].toLowerCase().replace(/\s+/g, "_");
}

function normalizePeriod(scriptObj) {
  if (!scriptObj) return null;
  const p = (typeof scriptObj === "string" ? scriptObj : scriptObj.period || "").toString();
  if (!p) return null;
  // eBL period field is already canonical: "Neo-Babylonian", "Neo-Assyrian", etc.
  return p.replace(/-/g, "_").replace(/\s+/g, "_");
}

function normalizeCity(provenance, collection) {
  // Try provenance first
  if (provenance) {
    if (typeof provenance === "string" && COLLECTION_TO_CITY[provenance]) return COLLECTION_TO_CITY[provenance];
    const site = provenance.site || provenance.name;
    if (site && COLLECTION_TO_CITY[site]) return COLLECTION_TO_CITY[site];
  }
  // Fallback to collection (the museum sub-collection, often correlated with findspot)
  if (collection) {
    const c = typeof collection === "string" ? collection : collection.name;
    if (c && COLLECTION_TO_CITY[c]) return COLLECTION_TO_CITY[c];
    // Substring match
    if (c) {
      for (const [key, city] of Object.entries(COLLECTION_TO_CITY)) {
        if (c.includes(key)) return city;
      }
    }
  }
  return null;
}

// Build tablet meta
const tabletMeta = new Map();
const allIds = new Set();
for (const p of psp.parallels) {
  allIds.add(p.tablet_a.museum_number);
  allIds.add(p.tablet_b.museum_number);
}

for (const id of allIds) {
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
    city: normalizeCity(raw.provenance, raw.collection),
    raw_genres: raw.genres_flat || [],
    raw_script: raw.script,
    raw_collection: raw.collection,
  });
}

// Stats
let withFullMetadata = 0;
let withPartialMetadata = 0;
let withNoMetadata = 0;
let crossGenre = 0;
let crossPeriod = 0;
let crossCity = 0;

for (const p of psp.parallels) {
  const metaA = tabletMeta.get(p.tablet_a.museum_number) || null;
  const metaB = tabletMeta.get(p.tablet_b.museum_number) || null;

  if (metaA) {
    if (metaA.designation) p.tablet_a.designation = metaA.designation;
    if (metaA.genre) p.tablet_a.genre = metaA.genre;
    else delete p.tablet_a.genre;
    if (metaA.period) p.tablet_a.period = metaA.period;
    else delete p.tablet_a.period;
    if (metaA.city) p.tablet_a.city = metaA.city;
    else delete p.tablet_a.city;
  }
  if (metaB) {
    if (metaB.designation) p.tablet_b.designation = metaB.designation;
    if (metaB.genre) p.tablet_b.genre = metaB.genre;
    else delete p.tablet_b.genre;
    if (metaB.period) p.tablet_b.period = metaB.period;
    else delete p.tablet_b.period;
    if (metaB.city) p.tablet_b.city = metaB.city;
    else delete p.tablet_b.city;
  }

  const diffGenre = !!(metaA?.genre && metaB?.genre && metaA.genre !== metaB.genre);
  const diffPeriod = !!(metaA?.period && metaB?.period && metaA.period !== metaB.period);
  const diffCity = !!(metaA?.city && metaB?.city && metaA.city !== metaB.city);

  p.cross_boundary = {
    different_genre: diffGenre,
    different_period: diffPeriod,
    different_city: diffCity,
    different_language: false,
  };

  let novelty = p.match_evidence.jaccard;
  if (diffGenre) novelty += 0.15;
  if (diffPeriod) novelty += 0.10;
  if (diffCity) novelty += 0.10;
  if (FORMULAIC_GENRES.has(metaA?.genre) || FORMULAIC_GENRES.has(metaB?.genre)) novelty -= 0.30;

  p.novelty_score = parseFloat(Math.max(0, Math.min(2, novelty)).toFixed(4));

  if (diffGenre) crossGenre++;
  if (diffPeriod) crossPeriod++;
  if (diffCity) crossCity++;

  const fieldsPresent = [metaA?.genre, metaA?.period, metaA?.city, metaB?.genre, metaB?.period, metaB?.city].filter((f) => f).length;
  if (fieldsPresent === 6) withFullMetadata++;
  else if (fieldsPresent > 0) withPartialMetadata++;
  else withNoMetadata++;
}

psp.parallels.sort((a, b) => b.novelty_score - a.novelty_score);

psp._meta.metadata_enrichment_status =
  withFullMetadata > psp.parallels.length * 0.5 ? "complete" : "partial_only_eBL";
psp._meta.metadata_enrichment_date = new Date().toISOString().substring(0, 10);
psp._meta.metadata_coverage = {
  total_parallels: psp.parallels.length,
  with_full_metadata: withFullMetadata,
  with_partial_metadata: withPartialMetadata,
  with_no_metadata: withNoMetadata,
  cross_genre_count: crossGenre,
  cross_period_count: crossPeriod,
  cross_city_count: crossCity,
};
psp._meta.note =
  "v0.13.1 (re-scored): metadata enrichment via eBL /fragments/<id> complete with corrected normalizers (script.period nested object; collection as city proxy where provenance is null). Cross-boundary bonuses applied to novelty_score. Formulaic-genre penalty (-0.30) applies to royal_inscription + administrative tablets.";

writeFileSync(PSP_PATH, JSON.stringify(psp, null, 2) + "\n");

// Save tablet metadata for queryability
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

console.log("v0.13.1 re-score complete.");
console.log(`  Coverage: full=${withFullMetadata}, partial=${withPartialMetadata}, none=${withNoMetadata}`);
console.log(`  Cross-boundary: genre=${crossGenre}, period=${crossPeriod}, city=${crossCity}`);
console.log("");
console.log("Top 15 after corrected re-scoring:");
psp.parallels.slice(0, 15).forEach((p, i) => {
  const aMeta = `${p.tablet_a.genre || "?"}/${p.tablet_a.period || "?"}/${p.tablet_a.city || "?"}`;
  const bMeta = `${p.tablet_b.genre || "?"}/${p.tablet_b.period || "?"}/${p.tablet_b.city || "?"}`;
  const boundary = [];
  if (p.cross_boundary.different_genre) boundary.push("G");
  if (p.cross_boundary.different_period) boundary.push("P");
  if (p.cross_boundary.different_city) boundary.push("C");
  console.log(
    `  ${i + 1}. ${p.tablet_a.museum_number} ↔ ${p.tablet_b.museum_number} · novelty=${p.novelty_score.toFixed(3)} · jaccard=${p.match_evidence.jaccard.toFixed(3)} · [${boundary.join("") || "·"}] · A:${aMeta} B:${bMeta}`,
  );
});
