import { describe, it, expect } from "vitest";
import {
  extractScribalProvenance,
  buildScribalProvenanceIndex,
  buildFirstCopyClusters,
  buildFirstCitationClusters,
  classifyTabletProvenance,
  type TabletProvenance,
} from "../src/scribalProvenance.js";

describe("extractScribalProvenance", () => {
  it("returns nulls on null/non-object input", () => {
    const r = extractScribalProvenance(null);
    expect(r).toEqual({
      first_copy_event: null,
      first_copy_period: null,
      first_citation_target: null,
      first_citation_period: null,
    });
  });

  it("picks earliest witness by period (Old Babylonian before Neo-Assyrian)", () => {
    const tablet = {
      id: "TAB1",
      witnesses: [
        { id: "W_NA", period: "Neo-Assyrian" },
        { id: "W_OB", period: "Old Babylonian" },
        { id: "W_NB", period: "Neo-Babylonian" },
      ],
    };
    const r = extractScribalProvenance(tablet);
    expect(r.first_copy_event).toBe("W_OB");
    expect(r.first_copy_period).toBe("Old Babylonian");
  });

  it("picks earliest citation by period using `citations` field", () => {
    const tablet = {
      id: "TAB2",
      citations: [
        { id: "C_NB", period: "Neo-Babylonian" },
        { id: "C_NA", period: "Neo-Assyrian" },
      ],
    };
    const r = extractScribalProvenance(tablet);
    expect(r.first_citation_target).toBe("C_NA");
    expect(r.first_citation_period).toBe("Neo-Assyrian");
  });

  it("falls back to `commentary` field when `citations` missing", () => {
    const tablet = {
      id: "TAB3",
      commentary: [{ id: "COMM1", period: "Late Babylonian" }],
    };
    const r = extractScribalProvenance(tablet);
    expect(r.first_citation_target).toBe("COMM1");
    expect(r.first_citation_period).toBe("Late Babylonian");
  });

  it("returns nulls when witnesses[] / citations[] are missing", () => {
    const tablet = { id: "TAB4" };
    const r = extractScribalProvenance(tablet);
    expect(r.first_copy_event).toBeNull();
    expect(r.first_citation_target).toBeNull();
  });

  it("breaks period ties by ID lexicographically (determinism)", () => {
    const tablet = {
      id: "TAB5",
      witnesses: [
        { id: "Z_OB", period: "Old Babylonian" },
        { id: "A_OB", period: "Old Babylonian" },
        { id: "M_OB", period: "Old Babylonian" },
      ],
    };
    const r = extractScribalProvenance(tablet);
    expect(r.first_copy_event).toBe("A_OB");
  });

  it("extracts IDs from bare-string witness entries", () => {
    const tablet = {
      id: "TAB6",
      witnesses: ["W1", "W2"],
    };
    const r = extractScribalProvenance(tablet);
    // No periods, so tie-broken by lex order → "W1".
    expect(r.first_copy_event).toBe("W1");
  });

  it("sorts unknown-period witnesses to the end", () => {
    const tablet = {
      id: "TAB7",
      witnesses: [
        { id: "W_NOPER" }, // no period
        { id: "W_NA", period: "Neo-Assyrian" },
      ],
    };
    const r = extractScribalProvenance(tablet);
    expect(r.first_copy_event).toBe("W_NA");
  });
});

describe("buildScribalProvenanceIndex", () => {
  it("returns Map sized to input (one entry per tablet with an ID)", () => {
    const tablets = [
      { id: "A", witnesses: [{ id: "W1", period: "Neo-Assyrian" }] },
      { id: "B", witnesses: [{ id: "W2", period: "Old Babylonian" }] },
      { id: "C" }, // no witnesses; still indexed with nulls
    ];
    const idx = buildScribalProvenanceIndex(tablets);
    expect(idx.size).toBe(3);
    expect(idx.get("A")?.first_copy_event).toBe("W1");
    expect(idx.get("C")?.first_copy_event).toBeNull();
  });

  it("silently skips entries without an extractable ID", () => {
    const tablets = [
      { id: "A" },
      { /* no id */ witnesses: [] },
      { tablet_id: "B" }, // tablet_id fallback works
    ];
    const idx = buildScribalProvenanceIndex(tablets);
    expect(idx.has("A")).toBe(true);
    expect(idx.has("B")).toBe(true);
    expect(idx.size).toBe(2);
  });

  it("returns empty Map on non-array input", () => {
    const idx = buildScribalProvenanceIndex(null as any);
    expect(idx.size).toBe(0);
  });

  it("later duplicate ID overwrites earlier entry (Map semantics)", () => {
    const tablets = [
      { id: "DUP", witnesses: [{ id: "FIRST", period: "Neo-Assyrian" }] },
      { id: "DUP", witnesses: [{ id: "SECOND", period: "Neo-Assyrian" }] },
    ];
    const idx = buildScribalProvenanceIndex(tablets);
    expect(idx.size).toBe(1);
    expect(idx.get("DUP")?.first_copy_event).toBe("SECOND");
  });
});

describe("buildFirstCopyClusters", () => {
  it("groups tablets by shared first_copy_event and drops singletons", () => {
    const index = new Map<string, TabletProvenance>([
      ["A", { first_copy_event: "W1", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["B", { first_copy_event: "W1", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["C", { first_copy_event: "W1", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["D", { first_copy_event: "W2", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["E", { first_copy_event: "W2", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["F", { first_copy_event: "W3", first_copy_period: null, first_citation_target: null, first_citation_period: null }], // singleton, dropped
      ["G", { first_copy_event: null, first_copy_period: null, first_citation_target: null, first_citation_period: null }], // skipped
    ]);
    const clusters = buildFirstCopyClusters(index);
    expect(clusters.size).toBe(2);
    expect(clusters.get("W1")).toEqual(["A", "B", "C"]);
    expect(clusters.get("W2")).toEqual(["D", "E"]);
    expect(clusters.has("W3")).toBe(false);
  });

  it("orders entries by member count descending", () => {
    const index = new Map<string, TabletProvenance>([
      ["A", { first_copy_event: "small", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["B", { first_copy_event: "small", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["C", { first_copy_event: "big", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["D", { first_copy_event: "big", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["E", { first_copy_event: "big", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
    ]);
    const clusters = buildFirstCopyClusters(index);
    const keys = [...clusters.keys()];
    expect(keys[0]).toBe("big");
    expect(keys[1]).toBe("small");
  });

  it("respects custom minMembers parameter", () => {
    const index = new Map<string, TabletProvenance>([
      ["A", { first_copy_event: "W1", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["B", { first_copy_event: "W1", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
      ["C", { first_copy_event: "W2", first_copy_period: null, first_citation_target: null, first_citation_period: null }],
    ]);
    // minMembers=1 keeps singletons too.
    const clusters = buildFirstCopyClusters(index, { minMembers: 1 });
    expect(clusters.size).toBe(2);
  });
});

describe("buildFirstCitationClusters", () => {
  it("symmetric companion: groups tablets by shared first_citation_target", () => {
    const index = new Map<string, TabletProvenance>([
      ["A", { first_copy_event: null, first_copy_period: null, first_citation_target: "C1", first_citation_period: null }],
      ["B", { first_copy_event: null, first_copy_period: null, first_citation_target: "C1", first_citation_period: null }],
      ["C", { first_copy_event: null, first_copy_period: null, first_citation_target: "C2", first_citation_period: null }],
      ["D", { first_copy_event: null, first_copy_period: null, first_citation_target: "C2", first_citation_period: null }],
      ["E", { first_copy_event: null, first_copy_period: null, first_citation_target: "C2", first_citation_period: null }],
    ]);
    const clusters = buildFirstCitationClusters(index);
    expect(clusters.size).toBe(2);
    // Sorted by size desc.
    expect([...clusters.keys()][0]).toBe("C2");
    expect(clusters.get("C2")).toEqual(["C", "D", "E"]);
  });
});

describe("classifyTabletProvenance", () => {
  function mkIdx(entries: Array<[string, Partial<TabletProvenance>]>): Map<string, TabletProvenance> {
    const m = new Map<string, TabletProvenance>();
    for (const [k, v] of entries) {
      m.set(k, {
        first_copy_event: null,
        first_copy_period: null,
        first_citation_target: null,
        first_citation_period: null,
        ...v,
      });
    }
    return m;
  }

  it("returns 'unknown' when either tablet is missing from the index", () => {
    const idx = mkIdx([["A", { first_copy_event: "W1" }]]);
    expect(classifyTabletProvenance(idx, "A", "MISSING")).toBe("unknown");
    expect(classifyTabletProvenance(idx, "MISSING", "A")).toBe("unknown");
  });

  it("returns 'shared-copy-event' on matching first_copy_event", () => {
    const idx = mkIdx([
      ["A", { first_copy_event: "W1" }],
      ["B", { first_copy_event: "W1" }],
    ]);
    expect(classifyTabletProvenance(idx, "A", "B")).toBe("shared-copy-event");
  });

  it("returns 'shared-citation-target' when only citations match (no copy data)", () => {
    const idx = mkIdx([
      ["A", { first_citation_target: "C1" }],
      ["B", { first_citation_target: "C1" }],
    ]);
    expect(classifyTabletProvenance(idx, "A", "B")).toBe("shared-citation-target");
  });

  it("returns 'shared-both' when copy AND citation both match", () => {
    const idx = mkIdx([
      ["A", { first_copy_event: "W1", first_citation_target: "C1" }],
      ["B", { first_copy_event: "W1", first_citation_target: "C1" }],
    ]);
    expect(classifyTabletProvenance(idx, "A", "B")).toBe("shared-both");
  });

  it("returns 'different' when both have copy data but neither match", () => {
    const idx = mkIdx([
      ["A", { first_copy_event: "W1", first_citation_target: "C1" }],
      ["B", { first_copy_event: "W2", first_citation_target: "C2" }],
    ]);
    expect(classifyTabletProvenance(idx, "A", "B")).toBe("different");
  });

  it("returns 'unknown' when copy data is missing on one side and citations don't match", () => {
    const idx = mkIdx([
      ["A", { first_citation_target: "C1" }],
      ["B", { first_citation_target: "C2" }],
    ]);
    expect(classifyTabletProvenance(idx, "A", "B")).toBe("unknown");
  });
});
