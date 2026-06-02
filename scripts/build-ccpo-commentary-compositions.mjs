#!/usr/bin/env node
// cuneiform-mcp — STAGE B: register ccpo commentaries as DISTINCT compositions.
//
// Why distinct: compute_quotation_network's CompositionResolver builds
// composition→composition edges from shared length-20 chunks; bumpEdge skips
// src===tgt. If a ccpo commentary were folded into its base composition the
// shared chunk would be intra-composition → self-loop → DROPPED. Registering
// each commentary under a per-family bucket (commentary_eae, commentary_alu,…)
// is what MAKES the commentary→base edge exist.
//
// This script writes three artifacts (NO edit to data/compositions-v1.json —
// the citable 11-composition methods-paper registry stays frozen):
//
//   1. data/ccpo-commentary-families.json   (committed, provenance)
//        { built_at, decoder, families: { <commentary_id>: {name, base_id,…} },
//          members: { <P-number>: <commentary_id> } }
//
//   2. data/ccpo-commentary-compositions.json (committed, registry-mergeable)
//        { compositions: [ CompositionEntry … ] } — ~13 commentary buckets,
//        composition_type "specific_composition" so the resolver's cache tier
//        (which requires getCompositionById(id).composition_type ===
//        "specific_composition") ACCEPTS them. Merged into the registry at
//        load time by src/compositionRegistry.ts, existsSync-guarded.
//
//   3. <cache>/composition-assignments.json (mutated in place, additive)
//        adds <P-number> → { top_composition_id: commentary_<family>,
//        confidence 1.0, … } rows so CompositionResolver's CACHE tier tags
//        ccpo tablets DISTINCTLY from any base composition. Existing rows are
//        preserved; only ccpo P-numbers are inserted/overwritten.
//
// Gold decoder (verification_oracle): CCP top-level number → base family.
// CCP number is parsed from catalogue genres_comment ("ccp 3.5.59: …" /
// "commentaries ccp 4.1.10: …"); descriptive comments ("astr omens",
// "terr omens", "šumma immeru") fall back to a keyword map; everything else
// → commentary_other (still DISTINCT, so no false self-loops, but no claimed
// base family).

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_DIR = join(__dirname, "..");
const CACHE_DIR = process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");

const CCPO_SIGNS = join(CACHE_DIR, "ccpo-signs.json");
const CATALOGUE = join(CACHE_DIR, "oracc", "ccpo", "catalogue.json");
const ASSIGNMENTS = join(CACHE_DIR, "composition-assignments.json");

const FAMILIES_OUT = join(REPO_DIR, "data", "ccpo-commentary-families.json");
const COMPS_OUT = join(REPO_DIR, "data", "ccpo-commentary-compositions.json");

console.error("cuneiform-mcp build-ccpo-commentary-compositions");
console.error(`  ccpo signs:   ${CCPO_SIGNS}`);
console.error(`  catalogue:    ${CATALOGUE}`);
console.error(`  assignments:  ${ASSIGNMENTS}`);
console.error("");

for (const p of [CCPO_SIGNS, CATALOGUE]) {
  if (!existsSync(p)) {
    console.error(`✘ required input not found: ${p}`);
    process.exit(1);
  }
}

// ─── Gold decoder: CCP top-level → { family, base_id, base_name } ──────────
// base_id is the resolver id the BASE-text fragments resolve to (registry id
// where one exists; otherwise a cache/identify composition id). The commentary
// bucket id is always commentary_<family>.
const FAMILIES = {
  eae:             { name: "Enūma Anu Enlil",   base_id: "enuma_anu_enlil" },
  alu:             { name: "Šumma ālu",         base_id: "summa_alu" },
  izbu:            { name: "Šumma izbu",        base_id: "summa_izbu" },
  iqqur_ipus:      { name: "Iqqur īpuš",        base_id: "iqqur_ipus" },
  sagig:           { name: "Sa-gig / Diagnostic", base_id: "sagig" },
  therapeutic:     { name: "Therapeutic",       base_id: "therapeutic" },
  codex_hammurapi: { name: "Codex Hammurapi",   base_id: "codex_hammurapi" },
  lexical:         { name: "Lexical (Diri/Aa)", base_id: "diri_aa" },
  god_list:        { name: "God List (An=Anum)", base_id: "an_anum" },
  lugale:          { name: "Lugal-e",           base_id: "lugale" },
  marduk_address:  { name: "Marduk's Address",  base_id: "marduk_address" },
  namburbi:        { name: "Namburbi",          base_id: "namburbi" },
  uncertain:       { name: "Uncertain base",    base_id: null },
  other:           { name: "Unclassified commentary", base_id: null },
};

// CCP top-level-number → family. Longest-prefix wins; 7.2.u* (Uncertain).
const CCP_DECODER = {
  "3.1": "eae",
  "3.5": "alu",
  "3.6": "izbu",
  "3.8": "iqqur_ipus",
  "4.1": "sagig",
  "4.2": "therapeutic",
  "5": "codex_hammurapi",
  "5.1": "codex_hammurapi",
  "6": "lexical",
  "6.1": "lexical",
  "6.2": "lexical",
  "7.1": "god_list",
  "1.2": "lugale",
  "2.2": "marduk_address",
  "2.3": "namburbi",
};

// Keyword decoder over free text (genres_comment OR designation). Returns a
// family or NULL (no match) so the caller can fall through to the next source.
function familyFromText(s0) {
  const s = (s0 || "").toLowerCase();
  if (!s) return null;
  if (/\bnbgt\b|grammatical/.test(s)) return null; // NBGT base absent from eBL — leave unclassified
  if (/astr|astrolog|\beae\b|enuma anu enlil|enūma anu enlil|venus|lunar eclipse/.test(s)) return "eae";
  if (/terr omens|šumma ?ālu|šumma ?alu|summa ?alu/.test(s)) return "alu";
  if (/izbu|šumma izbu|šumma immeru|summa immeru|extispic|bārûtu|barutu/.test(s)) return "izbu";
  if (/therapeut|bulṭu|medical/.test(s)) return "therapeutic";
  if (/sagig|sa-gig|diagnostic/.test(s)) return "sagig";
  if (/god list|god names|an ?= ?anum|an-anum/.test(s)) return "god_list";
  if (/lugal-?e/.test(s)) return "lugale";
  return null; // no match — caller falls through to designation, then "other"
}

function unesc(s) {
  return (s || "")
    .replace(/&#176;/g, "°")
    .replace(/&#226;/g, "â")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function familyFromCcpNumber(ccp) {
  if (/^7\.2\.u/i.test(ccp)) return "uncertain";
  const parts = ccp.split(".");
  for (const len of [2, 1]) {
    const key = parts.slice(0, len).join(".");
    if (CCP_DECODER[key]) return CCP_DECODER[key];
  }
  return null;
}

function decodeFamily(member) {
  const gc = unesc(member.genres_comment);
  const m = gc.match(/ccp\s+([0-9][0-9a-zA-Z.]*?)(?:[:\s]|$)/i);
  if (m) {
    const fam = familyFromCcpNumber(m[1]);
    if (fam) return { family: fam, via: "ccp_number", ccp: m[1] };
  }
  let fam = familyFromText(gc);
  if (fam) return { family: fam, via: "genres_comment", ccp: null };
  // Many commentaries carry the base text ONLY in the designation, e.g.
  // "Commentary A on Šumma Alu 22-23" / "Commentary B on Enuma Anu Enlil 20".
  // This recovers the high-overlap commentaries the genres_comment pass missed
  // (they were the dominant ccp_<pid>↔commentary_<fam> "noise" edges).
  fam = familyFromText(unesc(member.designation));
  if (fam) return { family: fam, via: "designation", ccp: null };
  return { family: "other", via: "none", ccp: null };
}

// ─── Load inputs ───────────────────────────────────────────────────────────
const ccpoSigns = JSON.parse(readFileSync(CCPO_SIGNS, "utf-8"));
const cat = JSON.parse(readFileSync(CATALOGUE, "utf-8"));
const members = cat.members || cat;

const pids = ccpoSigns.map((r) => r._id);
console.error(`  ${pids.length} ccpo members from ccpo-signs.json`);

// ─── Decode per member ─────────────────────────────────────────────────────
const memberMap = {}; // P-number → commentary_<family> (known base) | ccp_<pid> (singleton, null base)
const memberFamily = {}; // P-number → decoded family (provenance, even for singletons)
const famCounts = {};
const viaCounts = {};
let singletonCount = 0;
for (const pid of pids) {
  const e = members[pid] || {};
  const { family, via } = decodeFamily(e);
  memberFamily[pid] = family;
  // Null-base families (other, uncertain) are NOT pooled into a single
  // commentary_<family> node — that 134-member catch-all manufactured the
  // dominant spurious edges (commentary_alu↔commentary_other w=3036). Give each
  // its OWN singleton composition id so it forms no aggregated hub, while a
  // genuine verbatim shared chunk with a base text still surfaces as a
  // low-weight commentary→base edge.
  const baseKnown = FAMILIES[family] && FAMILIES[family].base_id !== null;
  const commId = baseKnown ? `commentary_${family}` : `ccp_${pid}`;
  if (!baseKnown) singletonCount++;
  memberMap[pid] = commId;
  famCounts[family] = (famCounts[family] || 0) + 1;
  viaCounts[via] = (viaCounts[via] || 0) + 1;
}
console.error(`  decode breakdown: ${JSON.stringify(viaCounts)}`);
console.error(`  null-base commentaries singletonized (no commentary_other/uncertain hub): ${singletonCount}`);
console.error(`  family counts: ${JSON.stringify(famCounts)}`);

// Guardrail: the gold positives must decode to their named base family.
const GOLD = {
  P237219: "commentary_eae",
  P286488: "commentary_alu",
  P417216: "commentary_izbu",
  P461113: "commentary_sagig",
  P461247: "commentary_lugale",
  P461271: "commentary_codex_hammurapi",
  P461230: "commentary_god_list",
};
let goldFail = 0;
for (const [pid, want] of Object.entries(GOLD)) {
  if (memberMap[pid] !== want) {
    console.error(`  ✘ GOLD MISMATCH ${pid}: got ${memberMap[pid]}, want ${want}`);
    goldFail++;
  }
}
if (goldFail) {
  console.error(`✘ ${goldFail} gold positives mis-decoded — aborting before write.`);
  process.exit(1);
}
console.error(`  ✓ all 7 gold positives decode to their named base family`);

// ─── Artifact 1: ccpo-commentary-families.json ─────────────────────────────
const familiesArtifact = {
  $schema: "ccpo-commentary-families/v1",
  built_at: new Date().toISOString(),
  source: "ccpo catalogue.json genres_comment + CCP-number gold decoder (verification_oracle)",
  decoder: CCP_DECODER,
  families: Object.fromEntries(
    Object.entries(FAMILIES).map(([k, v]) => [`commentary_${k}`, { name: `Commentary on ${v.name}`, base_id: v.base_id }]),
  ),
  members: memberMap,
  member_families: memberFamily, // decoded family per member, incl. those singletonized (other/uncertain)
  singletonized_null_base: singletonCount,
};
writeFileSync(FAMILIES_OUT, JSON.stringify(familiesArtifact, null, 2));
console.error(`✓ wrote ${FAMILIES_OUT} (${pids.length} members)`);

// ─── Artifact 2: ccpo-commentary-compositions.json (registry-mergeable) ────
// (a) decoded family buckets (base known). Null-base ids are ccp_<pid>
// singletons, handled in (b) — exclude them here.
const usedFamilies = new Set(
  Object.values(memberMap)
    .filter((c) => c.startsWith("commentary_"))
    .map((c) => c.replace(/^commentary_/, "")),
);
const compositions = [];
for (const fam of usedFamilies) {
  const meta = FAMILIES[fam];
  const id = `commentary_${fam}`;
  compositions.push({
    id,
    name: `Commentary on ${meta.name}`,
    name_akkadian: `ṣâtu/mukallimtu (${meta.name})`,
    description:
      `Cuneiform commentary tradition (ccpo) on ${meta.name}. Registered as a DISTINCT composition bucket so that verbatim quotations of the base text surface as commentary→base edges in compute_quotation_network (folding into the base would self-loop and vanish).` +
      (meta.base_id ? ` Base composition id: ${meta.base_id}.` : " Base text not present / unidentified in eBL."),
    composition_type: "specific_composition",
    exemplar_tablets: [],
    paper_sections: ["§ccpo-ingest"],
    typical_genre: "commentary",
    typical_period: "Neo-Assyrian / Neo-Babylonian",
    parent_curriculum: null,
    print_editions: [
      {
        citation: "Frahm, E. 2011. Babylonian and Assyrian Text Commentaries. GMTR 5.",
        title: "Babylonian and Assyrian Text Commentaries",
        series: "Guides to the Mesopotamian Textual Record 5",
        publisher: "Ugarit-Verlag",
      },
    ],
    external_ids: {
      ebl_canonical_genre: null,
      ogsl: null,
      cad_lemma: null,
    },
    uri: `https://ccp.yale.edu/#${id}`,
    base_composition_id: meta.base_id,
    source: "ccpo-ingest (Stage B)",
  });
}
// (b) singleton compositions — one per null-base commentary (replaces the
// commentary_other / commentary_uncertain catch-all). Each is a DISTINCT
// specific_composition so the resolver's cache tier accepts it, but it pools
// with nothing, so no aggregated hub edge can form.
for (const [pid, id] of Object.entries(memberMap)) {
  if (!id.startsWith("ccp_")) continue;
  compositions.push({
    id,
    name: `Unclassified ccpo commentary ${pid}`,
    name_akkadian: "ṣâtu/mukallimtu (unidentified base)",
    description:
      `ccpo commentary ${pid} whose base text could not be decoded from catalogue metadata (decoder family: ${memberFamily[pid]}). Registered as a DISTINCT singleton composition — NOT pooled into a commentary_other/uncertain catch-all — so it forms no spurious aggregated edges; a genuine verbatim shared chunk with a base text still surfaces as a low-weight commentary→base edge.`,
    composition_type: "specific_composition",
    exemplar_tablets: [],
    paper_sections: ["§ccpo-ingest"],
    typical_genre: "commentary",
    typical_period: "Neo-Assyrian / Neo-Babylonian",
    parent_curriculum: null,
    print_editions: [
      {
        citation: "Frahm, E. 2011. Babylonian and Assyrian Text Commentaries. GMTR 5.",
        title: "Babylonian and Assyrian Text Commentaries",
        series: "Guides to the Mesopotamian Textual Record 5",
        publisher: "Ugarit-Verlag",
      },
    ],
    external_ids: { ebl_canonical_genre: null, ogsl: null, cad_lemma: null },
    uri: `https://ccp.yale.edu/${pid}`,
    base_composition_id: null,
    source: "ccpo-ingest (Stage B) singleton",
  });
}
// ── Base compositions named by the gold set but ABSENT from the citable
// 11-composition registry (lugale, sagig, codex_hammurapi, an_anum, …). Without
// these, a commentary→base edge can never resolve its BASE endpoint to a
// composition. We register them in the SAME auxiliary file (compositions-v1.json
// stays frozen). A base witness is assigned to one of these ONLY by doubly-
// corroborated evidence below (verbatim shared chunk + matching eBL genre).
const BASE_FAMILIES = {
  lugale: { name: "Lugal-e", genres: ["Lugal-e"] },
  sagig: { name: "Sa-gig (Diagnostic)", genres: ["Sa-gig", "Sagig", "Diagnostic"] },
  codex_hammurapi: { name: "Codex Hammurapi", genres: ["Hammurapi", "Codex Hammurapi", "Laws"] },
  an_anum: { name: "An = Anum (God List)", genres: ["An = Anum", "God List", "An-Anum"] },
  iqqur_ipus: { name: "Iqqur īpuš", genres: ["Iqqur īpuš", "Iqqur ipus"] },
  therapeutic: { name: "Therapeutic", genres: ["Therapeutic"] },
  namburbi: { name: "Namburbi", genres: ["Namburbi"] },
  marduk_address: { name: "Marduk's Address", genres: ["Marduk's Address"] },
};
// Registry ids that ALREADY exist in compositions-v1.json — never re-register.
const REGISTRY_BASE_IDS = new Set([
  "mis_pi", "surpu", "udug_hul", "bit_sala_me", "maqlu",
  "enuma_anu_enlil", "summa_izbu", "summa_alu", "barutu", "diri_aa", "asiputu_kar44",
]);
for (const [baseId, meta] of Object.entries(BASE_FAMILIES)) {
  if (REGISTRY_BASE_IDS.has(baseId)) continue;
  compositions.push({
    id: baseId,
    name: meta.name,
    name_akkadian: meta.name,
    description: `Base composition ${meta.name}, registered (auxiliary, off compositions-v1.json) so ccpo commentary→base edges can resolve their base endpoint. Witnesses are seeded ONLY where a verbatim length-20 chunk co-occurs with a ccpo commentary AND the eBL editorial genre confirms the family.`,
    composition_type: "specific_composition",
    exemplar_tablets: [],
    paper_sections: ["§ccpo-ingest"],
    typical_genre: "base text (commentated)",
    typical_period: "Neo-Assyrian / Neo-Babylonian",
    parent_curriculum: null,
    print_editions: [],
    external_ids: { ebl_canonical_genre: null, ogsl: null, cad_lemma: null },
    uri: `https://ccp.yale.edu/#base_${baseId}`,
    source: "ccpo-ingest (Stage B) base composition",
  });
}

compositions.sort((a, b) => a.id.localeCompare(b.id));
const compsArtifact = {
  $schema: "ccpo-commentary-compositions/v1",
  registry_version: "ccpo-commentary-1",
  built_at: new Date().toISOString(),
  note: "Auxiliary commentary-bucket + gold base compositions merged into COMPOSITION_REGISTRY at load time. data/compositions-v1.json (the citable 11-composition methods-paper registry) is NOT modified.",
  compositions,
};
writeFileSync(COMPS_OUT, JSON.stringify(compsArtifact, null, 2));
console.error(`✓ wrote ${COMPS_OUT} (${compositions.length} commentary compositions)`);

// ─── Artifact 3: seed composition-assignments.json (additive) ──────────────
if (!existsSync(ASSIGNMENTS)) {
  console.error(`⚠ ${ASSIGNMENTS} absent — skipping cache seed (resolver will use registry tier).`);
} else {
  const asg = JSON.parse(readFileSync(ASSIGNMENTS, "utf-8"));
  asg.assignments = asg.assignments || {};
  let inserted = 0;
  for (const pid of pids) {
    const commId = memberMap[pid];
    const e = members[pid] || {};
    asg.assignments[pid] = {
      top_composition_id: commId,
      top_composition_name: commId.startsWith("ccp_")
        ? `Unclassified ccpo commentary ${pid}`
        : `Commentary on ${FAMILIES[commId.replace(/^commentary_/, "")].name}`,
      composition_type: "specific_composition",
      confidence: 1.0,
      is_in_exemplar_list: false,
      period: e.period || "Neo-Assyrian",
      primary_genre: "Commentary (ccpo)",
      sign_count: null,
      top_2_alternatives: [],
      source: "ccpo-ingest (Stage B)",
    };
    inserted++;
  }
  // ── Evidence-grounded BASE-witness seeding (sensitivity). Seed a base host
  // to a base composition ONLY when BOTH hold: (i) it co-hosts a verbatim
  // length-20 chunk with a ccpo commentary in chunk-index.json, and (ii) its
  // eBL editorial genre (fragment-metadata genres_flat) matches that
  // commentary's base family. Double corroboration — chunk + genre — keeps
  // this from being subjective fragment classification. This is what makes the
  // sensitivity edge (commentary_<fam> → <base>) clear the 0.5 resolver floor.
  let baseSeeded = 0;
  const baseSeedLog = [];
  const CHUNK_INDEX = join(CACHE_DIR, "chunk-index.json");
  const FRAG_META = join(CACHE_DIR, "fragment-metadata.json");
  // family → base composition id, mirrors FAMILIES.base_id
  const famBase = Object.fromEntries(Object.entries(FAMILIES).map(([k, v]) => [k, v.base_id]));
  if (existsSync(CHUNK_INDEX) && existsSync(FRAG_META)) {
    const idx = JSON.parse(readFileSync(CHUNK_INDEX, "utf-8"));
    const fmeta = JSON.parse(readFileSync(FRAG_META, "utf-8"));
    const ccpoSet = new Set(pids);
    const genreMatch = (id, baseId) => {
      const meta = BASE_FAMILIES[baseId];
      const g = (fmeta[id] && fmeta[id].genres_flat) || [];
      const hay = g.join(" ").toLowerCase();
      // base in registry (no BASE_FAMILIES entry) → accept any genre-confirmed match by id presence
      if (!meta) {
        const reg = { enuma_anu_enlil: ["enūma anu enlil", "astrolog", "celestial"], summa_alu: ["šumma ālu", "terrestrial"], summa_izbu: ["izbu"] }[baseId] || [];
        return reg.some((k) => hay.includes(k));
      }
      return meta.genres.some((k) => hay.includes(k.toLowerCase()));
    };
    const proposed = new Map(); // baseId|host → {host, baseId, fam}
    for (const e of idx.entries || []) {
      const ccpoHere = [], baseHere = [];
      for (const o of e.occurrences) {
        if (ccpoSet.has(o.tablet_id)) ccpoHere.push(o.tablet_id);
        else baseHere.push(o.tablet_id);
      }
      if (!ccpoHere.length || !baseHere.length) continue;
      for (const c of ccpoHere) {
        const fam = (memberMap[c] || "").replace(/^commentary_/, "");
        const baseId = famBase[fam];
        if (!baseId) continue; // uncertain/other → never seed a base
        for (const h of baseHere) {
          if (genreMatch(h, baseId)) proposed.set(`${baseId}|${h}`, { host: h, baseId, fam, commentary: c });
        }
      }
    }
    for (const { host, baseId, fam, commentary } of proposed.values()) {
      // Never clobber an existing high-confidence registry/cache assignment.
      const existing = asg.assignments[host];
      if (existing && existing.confidence >= 0.5 && existing.source !== "ccpo-ingest (Stage B) base witness") {
        // still log the conflict for transparency, but don't overwrite
        baseSeedLog.push({ host, baseId, status: "skipped_existing", existing: existing.top_composition_id });
        continue;
      }
      asg.assignments[host] = {
        top_composition_id: baseId,
        top_composition_name: (BASE_FAMILIES[baseId] && BASE_FAMILIES[baseId].name) || baseId,
        composition_type: "specific_composition",
        confidence: 1.0,
        is_in_exemplar_list: false,
        period: (fmeta[host] && fmeta[host].script && fmeta[host].script.period) || "Neo-Babylonian",
        primary_genre: ((fmeta[host] && fmeta[host].genres_flat) || []).join(" → ") || baseId,
        sign_count: null,
        top_2_alternatives: [],
        source: "ccpo-ingest (Stage B) base witness",
      };
      baseSeeded++;
      baseSeedLog.push({ host, baseId, fam, commentary, status: "seeded" });
    }
  }

  asg.ccpo_ingest = {
    built_at: new Date().toISOString(),
    members: inserted,
    base_witnesses_seeded: baseSeeded,
    base_seed_log: baseSeedLog,
    note: "ccpo P-numbers seeded as commentary_<family> buckets so CompositionResolver's cache tier tags them distinctly from base compositions. Base witnesses seeded only on double-corroborated evidence (verbatim shared chunk + eBL genre).",
  };
  writeFileSync(ASSIGNMENTS, JSON.stringify(asg));
  console.error(`✓ seeded ${inserted} ccpo rows + ${baseSeeded} evidence-grounded base witnesses into ${ASSIGNMENTS}`);
  for (const l of baseSeedLog.filter((x) => x.status === "seeded")) {
    console.error(`    base witness: ${l.host} → ${l.baseId} (via ${l.commentary}/${l.fam})`);
  }
}

console.error("");
console.error("Done. Rebuild chunk-index and run compute_quotation_network to surface edges.");
