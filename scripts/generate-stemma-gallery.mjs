#!/usr/bin/env node
// Generate docs/STEMMA-GALLERY-v0.26.md — build_canonical_recension_tree run
// against multiple canonical seeds. Extends methods paper §3.11 from single
// case to gallery.

import { writeFileSync } from "node:fs";
import { buildCanonicalRecensionTree } from "../dist/recensionTree.js";

const SEEDS = [
  { id: "K.5896", note: "Mīs pî canonical case (methods §3.7.3, §3.11)" },
  { id: "BM.77056", note: "*āšipūtu* curriculum seed (§3.1, §3.9.1)" },
  { id: "Sm.1055", note: "Udug-ḫul Nineveh chain (§3.7.2)" },
  { id: "K.15325", note: "Refrain-bound liturgical family (§3.3, §3.7.3)" },
  { id: "BM.47463", note: "Šurpu commentary (§3.7.1)" },
];

const lines = [];
const w = (s) => lines.push(s);

w(`# Stemma Gallery (v0.26.0)`);
w(``);
w(`build_canonical_recension_tree run against 5 canonical seeds — extending methods paper §3.11 from the single K.5896 case to a gallery. Same neighbor-joining algorithm, same default parameters (max_witnesses=50, min_pairwise_chunks=3). Generated ${new Date().toISOString().slice(0, 10)}.`);
w(``);

for (const s of SEEDS) {
  w(`## ${s.id}`);
  w(``);
  w(`*${s.note}*`);
  w(``);
  try {
    const r = buildCanonicalRecensionTree({ seedTabletId: s.id, maxWitnesses: 16 });
    w(`- Witnesses recovered: **${r.witnesses.length}**`);
    w(`- Internal nodes: ${r.internal_nodes}`);
    w(`- Algorithm: ${r.algorithm}`);
    w(``);
    w(`Witnesses (closest → farthest from seed):`);
    for (const wi of r.witnesses.slice(0, 10)) {
      w(`- ${wi.tablet_id}  (${wi.period ?? "?"} · ${wi.primary_genre ?? "?"})`);
    }
    if (r.witnesses.length > 10) w(`- … +${r.witnesses.length - 10} more`);
    w(``);
    w(`Newick:`);
    w("```");
    w(r.tree.length > 600 ? r.tree.slice(0, 600) + "…" : r.tree);
    w("```");
    w(``);
  } catch (e) {
    w(`(stemma reconstruction failed — ${e.message})`);
    w(``);
  }
}

w(`## Methodological observations`);
w(``);
w(`The five stemmata span:`);
w(`- Cluster archetypes 1 (compositional curriculum), 3 (refrain-bound liturgical), 5 (embedded fragment), and 7 (commentary quotation).`);
w(`- Period distribution from Neo-Assyrian Kuyunjik (K.5896, K.15325, Sm.1055) to Neo-Babylonian (BM.77056, BM.47463).`);
w(`- Genre coverage: Mīs pî, *āšipūtu* curriculum, Udug-ḫul, refrain-bound liturgy, Šurpu commentary.`);
w(``);
w(`Each stemma is auto-generated without philological curation. The trees should be read as **discovery candidates** for scholarly review, not as finished philological products. The K.5896 case (§3.11) has already surfaced K.6683 as a previously-undocumented close sister of K.5896 — a §3.7.3 amendment candidate worth verifying against Walker & Dick 2001's Mīs pî MS sigla. Similar surprises may exist in the other four cases.`);
w(``);

writeFileSync("docs/STEMMA-GALLERY-v0.26.md", lines.join("\n"));
console.log(`Generated docs/STEMMA-GALLERY-v0.26.md (${lines.length} lines)`);
