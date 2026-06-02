// Tests for longest_contiguous_run (v0.76) — the contiguity-aware reporting
// field on find_chunk_parallels.
//
// chunk_length is a trigram-position SPAN that may bridge X-damage gaps via the
// 2-of-3 inverted index. longest_contiguous_run is the largest STRICTLY-
// contiguous verbatim sign run (no " … " discontinuity). It mirrors the
// sliding-window walk in reconstructChunkSigns: an overlapping trigram extends
// the run by one sign; a discontinuity resets it to a fresh 3-sign segment.

import { describe, it, expect } from "vitest";
import { longestContiguousRun } from "../src/chunkParallels.js";

describe("longestContiguousRun", () => {
  it("returns 0 for empty length", () => {
    expect(longestContiguousRun({ trigrams_ordered: ["A B C"] }, 0, 0)).toBe(0);
  });

  it("counts a clean overlapping run as signs (trigrams + 2)", () => {
    // 3 sliding-window trigrams over A B C D E → 5 contiguous signs.
    const src = { trigrams_ordered: ["A B C", "B C D", "C D E"] };
    expect(longestContiguousRun(src, 0, 3)).toBe(5);
  });

  it("single trigram = 3 signs", () => {
    expect(longestContiguousRun({ trigrams_ordered: ["A B C"] }, 0, 1)).toBe(3);
  });

  it("resets at a discontinuity and returns the longest segment", () => {
    // A B C D (run of 4) | gap | X Y Z W (run of 4) → longest = 4, NOT 8.
    const src = {
      trigrams_ordered: ["A B C", "B C D", "X Y Z", "Y Z W"],
    };
    expect(longestContiguousRun(src, 0, 4)).toBe(4);
  });

  it("is much smaller than the span when the chunk is a sparse alignment", () => {
    // A 6-position span whose only overlaps are isolated pairs → every trigram
    // breaks → longest contiguous run stays at the 3-sign floor.
    const src = {
      trigrams_ordered: ["A B C", "D E F", "G H I", "J K L", "M N O", "P Q R"],
    };
    const span = 6;
    const run = longestContiguousRun(src, 0, span);
    expect(run).toBe(3);
    expect(run).toBeLessThan(span + 2); // proves the "sparse alignment" flag fires
  });

  it("respects start offset", () => {
    const src = { trigrams_ordered: ["Z Z Z", "A B C", "B C D"] };
    expect(longestContiguousRun(src, 1, 2)).toBe(4); // A B C D
  });
});
