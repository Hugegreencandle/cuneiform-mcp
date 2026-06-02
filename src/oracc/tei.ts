// src/oracc/tei.ts — ORACC TEI-XML edition parser.
//
// This is the LIVE, load-bearing parse path for the opendata adapter. It is a
// faithful copy of parseOraccTei + stripXmlTags from src/index.ts (lines
// ~499 and ~546), lifted into src/oracc/ so the adapter and its unit tests can
// reuse it WITHOUT importing index.ts (whose module top-level boots the MCP
// server via main()). Behaviour is identical and verified against the same
// fixtures the index.ts copy is verified against:
//   - saao/saa01 P224485.xml (71 KB, P-id TEI)
//   - rinap/rinap1 Q003414.xml (13 KB, Q-id TEI)
//
// The wiring agent may later collapse the two copies into this single module
// (have index.ts import from here). That de-dup is optional and out of scope
// for this build stage — the goal here is a self-contained, tested adapter.

export type ParsedTei = {
  title: string;
  cdliId: string | null;
  transliteration: string[];
  translation: string[];
};

export function stripXmlTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function parseOraccTei(xml: string, fallbackId: string): ParsedTei {
  const titleMatch = xml.match(
    /<name[^>]*type="cdlicat:primary_publication"[^>]*>([^<]+)<\/name>/,
  );
  const cdliMatch = xml.match(/<name[^>]*type="cdlicat:id_text"[^>]*>([^<]+)<\/name>/);
  const title = titleMatch ? titleMatch[1].trim() : fallbackId;
  const cdliId = cdliMatch ? cdliMatch[1].trim() : null;

  // Transliteration: TEI emits <lb n="N"/> then a run of <w lemma="..."><...>txt</w>
  // up to the next <lb>, </p>, <milestone>, or </body>.
  const parts = xml.split(/<lb\s+n="([^"]+)"\s*\/>/);
  const transliteration: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const lineNum = parts[i];
    const body = (parts[i + 1] ?? "").split(/<\/p>|<milestone\b|<div\d|<\/body>/)[0];
    const words = [...body.matchAll(/<w\b[^>]*>([\s\S]*?)<\/w>/g)]
      .map((m) => stripXmlTags(m[1]))
      .filter(Boolean);
    if (words.length) {
      transliteration.push(`${lineNum.padStart(4, " ")}  ${words.join(" ")}`);
    }
  }

  // Translation: <div3 type="tr" ... xtr:label="N">English text</div3>
  const trRegex = /<div3\b[^>]*type="tr"[^>]*xtr:label="([^"]+)"[^>]*>([\s\S]*?)<\/div3>/g;
  const translation: string[] = [];
  for (const m of xml.matchAll(trRegex)) {
    const label = m[1];
    const text = stripXmlTags(m[2]);
    if (text) translation.push(`${label.padStart(4, " ")}  ${text}`);
  }

  return { title, cdliId, transliteration, translation };
}
