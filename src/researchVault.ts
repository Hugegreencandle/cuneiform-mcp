// v0.14.0 — RAG over the cuneiform-research markdown vault.
//
// Loads ~50 .md briefs from CUNEIFORM_RESEARCH_DIR (default ~/Desktop/Research),
// chunks them by H2/H3 sections (capped at ~1500 chars with overlap), builds an
// in-memory BM25 index, and exposes query / retrieval / synthesis-claim
// extraction. Lazy: index is built on first call, cached for the process
// lifetime.
//
// Design choices:
//   - BM25 over embeddings: the corpus is keyword-rich (proper nouns, scholar
//     names, technical Akkadian/Sumerian terms) and BM25 handles those better
//     than generic sentence embeddings without external model deps.
//   - Chunks by section heading: preserves brief context (each chunk carries
//     its parent H1 + section path). Brief-level retrieval also works because
//     a full-brief query will match its leading TL;DR chunk strongly.
//   - Citation extraction: regex matches "Surname YYYY" pattern, the standard
//     scholarly-citation form used uniformly across the briefs.
//   - Cluster heuristics: based on filename patterns (see CLUSTER_RULES).
//   - Synthesis markers: [my synthesis] and [unverified] (and a few variants
//     like [Cluster synthesis — my reading]) are extracted as a separate index.
//
// No external dependencies. Pure stdlib (node:fs, node:path).

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, basename, extname } from "node:path";
import { homedir } from "node:os";

// ─── Configuration ─────────────────────────────────────────────────────────

function defaultResearchDir(): string {
  return process.env.CUNEIFORM_RESEARCH_DIR || join(homedir(), "Desktop", "Research");
}

const MAX_CHUNK_CHARS = 1500;
const CHUNK_OVERLAP_CHARS = 150;
const BM25_K1 = 1.5;
const BM25_B = 0.75;

// ─── Types ─────────────────────────────────────────────────────────────────

export type ResearchChunk = {
  brief: string; // filename without .md
  section_path: string; // e.g. "§3. The five (or seven) antediluvian cities > §3.4 …"
  text: string;
  scholar_citations: string[]; // ["Lambert 2013", "George 2003"]
  synthesis_flag: boolean; // contains [my synthesis] or [unverified]
  cluster: string;
};

export type ResearchHit = {
  chunk: ResearchChunk;
  score: number;
};

export type SynthesisClaim = {
  brief: string;
  section_path: string;
  marker: string; // the actual marker text used
  paragraph: string;
};

// ─── Cluster classification ────────────────────────────────────────────────

const CLUSTER_RULES: Array<{ cluster: string; patterns: RegExp[] }> = [
  {
    cluster: "cosmology",
    patterns: [/^Apsu_/i, /^Royal_Descents/i, /^Subterranean_Cities/i, /^Anunnaki/i, /^Igigi/i],
  },
  {
    cluster: "theology",
    patterns: [/^Apkallu/i, /^Adapa/i, /^Enki/i, /^Enlil/i, /^Inanna/i, /^Bit_Meseri/i],
  },
  {
    cluster: "royal_myth",
    patterns: [/^Gilgamesh/i, /^Enuma_Elish/i, /^Atrahasis/i, /^Erra/i, /^Sumerian_King_List/i, /^Sumerian_Flood/i, /^Lagash_King_List/i, /^Sumerian_Me/i],
  },
  {
    cluster: "divination_science",
    patterns: [/^Hepatoscopy/i, /^Diagnostic_Handbook/i, /^Late_Babylonian_Astrology/i],
  },
  {
    cluster: "reception_comparative",
    patterns: [/^Berossus/i, /^1Enoch/i, /^Amarna_Religion/i, /^Book_of_the_Dead/i, /^Coffin_Texts/i],
  },
  {
    cluster: "monuments",
    patterns: [/^Tablet_of_Shamash/i],
  },
  {
    cluster: "infrastructure",
    patterns: [/^Cuneiform_API/i, /^Cuneiform_Sumer/i, /^Cuneiform_Tools/i, /^DISCOVERED-CANDIDATES/i],
  },
];

function classifyCluster(filename: string): string {
  for (const rule of CLUSTER_RULES) {
    for (const pat of rule.patterns) {
      if (pat.test(filename)) return rule.cluster;
    }
  }
  return "uncategorized";
}

// ─── Citation + synthesis extraction ───────────────────────────────────────

// "Lambert 2013", "George 2003", "Walker & Dick 2001", "Reiner & Pingree 1975-2005"
const CITATION_RE = /\b([A-Z][a-zü-ḫ]+(?:[\s&]+[A-Z][a-zü-ḫ]+){0,2})\s+(\d{4}(?:[\-–]\d{4})?)\b/g;

function extractCitations(text: string): string[] {
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((m = CITATION_RE.exec(text)) !== null) {
    set.add(`${m[1]} ${m[2]}`);
  }
  return [...set];
}

const SYNTHESIS_MARKERS = [
  /\[my synthesis\]/i,
  /\[unverified\]/i,
  /\[Cluster synthesis[^\]]*\]/i,
];

function hasSynthesisMarker(text: string): boolean {
  return SYNTHESIS_MARKERS.some((re) => re.test(text));
}

function findSynthesisMarkers(text: string): string[] {
  const found: string[] = [];
  for (const re of SYNTHESIS_MARKERS) {
    const m = re.exec(text);
    if (m) found.push(m[0]);
  }
  return found;
}

// ─── Chunking ──────────────────────────────────────────────────────────────

type Section = { heading: string; depth: number; text: string };

// Walks a markdown blob, splits on ## and ### headings, returns sections
// keyed by their heading path. The H1 (#) heading is treated as the brief
// title and prepended to every section's heading.
function splitSections(md: string): Section[] {
  const lines = md.split("\n");
  const sections: Section[] = [];
  let current: Section = { heading: "preamble", depth: 1, text: "" };
  for (const line of lines) {
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    const h3 = /^###\s+(.+?)\s*$/.exec(line);
    if (h2) {
      if (current.text.trim().length > 0) sections.push(current);
      current = { heading: h2[1], depth: 2, text: "" };
      continue;
    }
    if (h3) {
      if (current.text.trim().length > 0) sections.push(current);
      current = { heading: h3[1], depth: 3, text: "" };
      continue;
    }
    current.text += line + "\n";
  }
  if (current.text.trim().length > 0) sections.push(current);
  return sections;
}

function chunkSection(section: Section): string[] {
  const t = section.text.trim();
  if (t.length <= MAX_CHUNK_CHARS) return [t];
  // Split by paragraph breaks; pack into windows up to MAX_CHUNK_CHARS with overlap.
  const paragraphs = t.split(/\n\s*\n/);
  const chunks: string[] = [];
  let cur = "";
  for (const para of paragraphs) {
    if (cur.length + para.length + 2 <= MAX_CHUNK_CHARS) {
      cur += (cur ? "\n\n" : "") + para;
    } else {
      if (cur) chunks.push(cur);
      // Start the next chunk with a small overlap from the previous, for context preservation.
      const tail = cur.slice(-CHUNK_OVERLAP_CHARS);
      cur = (tail ? tail + "\n\n" : "") + para;
      if (cur.length > MAX_CHUNK_CHARS) {
        // Single paragraph too big; force-split.
        chunks.push(cur.slice(0, MAX_CHUNK_CHARS));
        cur = cur.slice(MAX_CHUNK_CHARS - CHUNK_OVERLAP_CHARS);
      }
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

function parseBrief(path: string, contents: string): ResearchChunk[] {
  const filename = basename(path, ".md");
  const cluster = classifyCluster(filename);
  const sections = splitSections(contents);
  const out: ResearchChunk[] = [];
  for (const section of sections) {
    const pieces = chunkSection(section);
    for (const piece of pieces) {
      out.push({
        brief: filename,
        section_path: section.heading,
        text: piece,
        scholar_citations: extractCitations(piece),
        synthesis_flag: hasSynthesisMarker(piece),
        cluster,
      });
    }
  }
  return out;
}

// ─── BM25 index ────────────────────────────────────────────────────────────

const TOKEN_SPLIT_RE = /[^\p{L}\p{N}]+/u;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(TOKEN_SPLIT_RE)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "are", "was", "were",
  "but", "not", "have", "has", "had", "his", "her", "its", "their", "into",
  "than", "then", "when", "what", "which", "who", "why", "how", "all", "any",
  "can", "will", "would", "should", "could", "may", "might", "must",
]);

type IndexState = {
  chunks: ResearchChunk[];
  tokenDocs: string[][]; // tokenized version of each chunk
  docFreq: Map<string, number>; // token → number of chunks containing it
  avgLen: number;
  brief_index: Map<string, ResearchChunk[]>; // brief name → its chunks (insertion-ordered)
};

let _state: IndexState | null = null;
let _buildError: Error | null = null;

function buildIndex(): IndexState {
  if (_state) return _state;
  if (_buildError) throw _buildError;
  try {
    const dir = defaultResearchDir();
    if (!existsSync(dir)) {
      throw new Error(
        `Research directory not found: ${dir}. Set CUNEIFORM_RESEARCH_DIR env var to point at your cuneiform-research markdown vault.`,
      );
    }
    const files = readdirSync(dir)
      .filter((f) => extname(f) === ".md")
      .map((f) => join(dir, f))
      .filter((p) => statSync(p).isFile());
    const allChunks: ResearchChunk[] = [];
    const briefIdx = new Map<string, ResearchChunk[]>();
    for (const file of files) {
      const contents = readFileSync(file, "utf-8");
      const briefChunks = parseBrief(file, contents);
      allChunks.push(...briefChunks);
      const fname = basename(file, ".md");
      briefIdx.set(fname, briefChunks);
    }
    // Build BM25 statistics.
    const tokenDocs = allChunks.map((c) => tokenize(c.text));
    const docFreq = new Map<string, number>();
    for (const tokens of tokenDocs) {
      const seen = new Set<string>();
      for (const tok of tokens) {
        if (seen.has(tok)) continue;
        seen.add(tok);
        docFreq.set(tok, (docFreq.get(tok) ?? 0) + 1);
      }
    }
    const totalLen = tokenDocs.reduce((s, d) => s + d.length, 0);
    const avgLen = tokenDocs.length > 0 ? totalLen / tokenDocs.length : 0;
    _state = { chunks: allChunks, tokenDocs, docFreq, avgLen, brief_index: briefIdx };
    return _state;
  } catch (e) {
    _buildError = e instanceof Error ? e : new Error(String(e));
    throw _buildError;
  }
}

function bm25Score(queryTokens: string[], docTokens: string[], state: IndexState): number {
  const N = state.tokenDocs.length;
  // Term frequencies in this doc
  const tf = new Map<string, number>();
  for (const tok of docTokens) tf.set(tok, (tf.get(tok) ?? 0) + 1);
  let score = 0;
  for (const qt of new Set(queryTokens)) {
    const f = tf.get(qt) ?? 0;
    if (f === 0) continue;
    const df = state.docFreq.get(qt) ?? 0;
    if (df === 0) continue;
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
    const norm = 1 - BM25_B + BM25_B * (docTokens.length / (state.avgLen || 1));
    score += idf * ((f * (BM25_K1 + 1)) / (f + BM25_K1 * norm));
  }
  return score;
}

// ─── Public API ────────────────────────────────────────────────────────────

export type QueryOptions = {
  topK?: number;
  cluster?: string;
  briefFilter?: string; // substring match against brief name
};

export function queryResearch(question: string, opts: QueryOptions = {}): ResearchHit[] {
  const state = buildIndex();
  const qTokens = tokenize(question);
  if (qTokens.length === 0) return [];
  const topK = opts.topK ?? 6;
  const candidates: ResearchHit[] = [];
  for (let i = 0; i < state.chunks.length; i++) {
    const c = state.chunks[i];
    if (opts.cluster && c.cluster !== opts.cluster) continue;
    if (opts.briefFilter && !c.brief.toLowerCase().includes(opts.briefFilter.toLowerCase())) continue;
    const s = bm25Score(qTokens, state.tokenDocs[i], state);
    if (s > 0) candidates.push({ chunk: c, score: s });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, topK);
}

export type BriefSummary = {
  name: string;
  cluster: string;
  section_count: number;
  chunk_count: number;
  total_chars: number;
  citation_count: number; // unique scholarly citations
  has_synthesis_claims: boolean;
};

export function listBriefs(cluster?: string): BriefSummary[] {
  const state = buildIndex();
  const out: BriefSummary[] = [];
  for (const [name, chunks] of state.brief_index) {
    if (chunks.length === 0) continue;
    const c0 = chunks[0];
    if (cluster && c0.cluster !== cluster) continue;
    const sections = new Set(chunks.map((c) => c.section_path));
    const totalChars = chunks.reduce((s, c) => s + c.text.length, 0);
    const allCitations = new Set<string>();
    for (const c of chunks) for (const cit of c.scholar_citations) allCitations.add(cit);
    out.push({
      name,
      cluster: c0.cluster,
      section_count: sections.size,
      chunk_count: chunks.length,
      total_chars: totalChars,
      citation_count: allCitations.size,
      has_synthesis_claims: chunks.some((c) => c.synthesis_flag),
    });
  }
  out.sort((a, b) => (a.cluster + a.name).localeCompare(b.cluster + b.name));
  return out;
}

export type BriefDoc = {
  name: string;
  cluster: string;
  total_chunks: number;
  page: number;
  total_pages: number;
  chunks: ResearchChunk[];
};

const PAGE_SIZE = 5; // chunks per page

export function getBrief(name: string, page = 1): BriefDoc | null {
  const state = buildIndex();
  // Case-insensitive lookup, allow .md suffix
  const cleanName = name.replace(/\.md$/i, "");
  let chunks = state.brief_index.get(cleanName);
  if (!chunks) {
    // Try case-insensitive match
    for (const [k, v] of state.brief_index) {
      if (k.toLowerCase() === cleanName.toLowerCase()) {
        chunks = v;
        break;
      }
    }
  }
  if (!chunks || chunks.length === 0) return null;
  const totalPages = Math.max(1, Math.ceil(chunks.length / PAGE_SIZE));
  const p = Math.max(1, Math.min(page, totalPages));
  const start = (p - 1) * PAGE_SIZE;
  return {
    name: chunks[0].brief,
    cluster: chunks[0].cluster,
    total_chunks: chunks.length,
    page: p,
    total_pages: totalPages,
    chunks: chunks.slice(start, start + PAGE_SIZE),
  };
}

export function findSynthesisClaims(query?: string): SynthesisClaim[] {
  const state = buildIndex();
  const qTokens = query ? tokenize(query) : [];
  const claims: SynthesisClaim[] = [];
  for (let i = 0; i < state.chunks.length; i++) {
    const c = state.chunks[i];
    if (!c.synthesis_flag) continue;
    if (qTokens.length > 0) {
      const s = bm25Score(qTokens, state.tokenDocs[i], state);
      if (s <= 0) continue;
    }
    // Extract paragraphs that contain a synthesis marker
    const paragraphs = c.text.split(/\n\s*\n/);
    for (const p of paragraphs) {
      const markers = findSynthesisMarkers(p);
      if (markers.length > 0) {
        claims.push({
          brief: c.brief,
          section_path: c.section_path,
          marker: markers.join(" "),
          paragraph: p.trim(),
        });
      }
    }
  }
  return claims;
}

export function vaultStats(): { dir: string; briefs: number; chunks: number; total_chars: number } {
  const state = buildIndex();
  return {
    dir: defaultResearchDir(),
    briefs: state.brief_index.size,
    chunks: state.chunks.length,
    total_chars: state.chunks.reduce((s, c) => s + c.text.length, 0),
  };
}

export function knownClusters(): string[] {
  return [...new Set(CLUSTER_RULES.map((r) => r.cluster)), "uncategorized"];
}
