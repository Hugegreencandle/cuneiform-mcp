// Port of ebl-api's `ebl/fragmentarium/application/matches/line_to_vec_score.py`
// at commit master (read 2026-05-13).
//
// Algorithm: given two fragments whose `lineToVec` is a tuple of int-sequences
// (one per inscribed surface — obverse, reverse, edge), find the longest
// prefix/suffix overlap between any pair of sequences across the two fragments,
// also trying both sequences reversed. Return (a) the max overlap LENGTH and
// (b) the max weighted SUM under the ruling-weight scheme below.
//
// Encoding values (LineToVecEncoding enum, port of line_to_vec_encoding.py):
//   0 = START          weight 3
//   1 = TEXT_LINE      weight 1
//   2 = SINGLE_RULING  weight 3
//   3 = DOUBLE_RULING  weight 6
//   4 = TRIPLE_RULING  weight 10
//   5 = END            weight 3
//
// Why those weights: rulings are rare and diagnostic for joining tablet
// fragments physically. A text-line-on-text-line overlap is weak evidence;
// matching a SINGLE_RULING alignment is strong; matching a TRIPLE_RULING
// alignment is very strong (these mark major section boundaries).

export type LineToVecSequence = number[];
export type LineToVec = LineToVecSequence[];

export const LineToVecEncoding = {
  START: 0,
  TEXT_LINE: 1,
  SINGLE_RULING: 2,
  DOUBLE_RULING: 3,
  TRIPLE_RULING: 4,
  END: 5,
} as const;

const WEIGHTS: Record<number, number> = {
  0: 3, // START
  1: 1, // TEXT_LINE
  2: 3, // SINGLE_RULING
  3: 6, // DOUBLE_RULING
  4: 10, // TRIPLE_RULING
  5: 3, // END
};

function arraysEqual(a: LineToVecSequence, b: LineToVecSequence): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// Port of the Python `compute_score`. Given two sequences, returns every
// matching overlap as its own sequence. The Python form:
//
//   shorter, longer = sorted((seq1, seq2), key=len)
//   return tuple(
//     shorter[-i:]
//     for i in range(1, len(longer)+1)
//     if (i >= len(shorter) and longer[i-len(shorter):i] == shorter[-i:])
//        or longer[:i] == shorter[-i:]
//   )
//
// The first branch (i >= len(shorter) with a window match) captures the case
// where the shorter sequence appears fully embedded inside the longer one as
// a window of width len(shorter), aligned at offset `i - len(shorter)`. The
// second branch (longer[:i] == shorter[-i:]) captures the case where the
// last `i` of the shorter match the first `i` of the longer — i.e. the
// shorter's suffix joins the longer's prefix. Both produce shorter[-i:] as
// the overlap representative.
export function computeScore(
  seq1: LineToVecSequence,
  seq2: LineToVecSequence,
): LineToVecSequence[] {
  const [shorter, longer] = seq1.length <= seq2.length ? [seq1, seq2] : [seq2, seq1];
  const overlaps: LineToVecSequence[] = [];
  for (let i = 1; i <= longer.length; i++) {
    const tail = shorter.slice(-i); // last i of shorter (may be all of it)
    if (i >= shorter.length) {
      const start = i - shorter.length;
      if (arraysEqual(longer.slice(start, i), tail)) {
        overlaps.push(tail);
        continue;
      }
    }
    if (arraysEqual(longer.slice(0, i), tail)) {
      overlaps.push(tail);
    }
  }
  return overlaps;
}

function computeScoreForAll(
  seqs1: LineToVecSequence[],
  seqs2: LineToVecSequence[],
): LineToVecSequence[] {
  const out: LineToVecSequence[] = [];
  for (const a of seqs1) {
    for (const b of seqs2) {
      out.push(...computeScore(a, b));
    }
  }
  return out;
}

// Port of `list_of_overlaps` — combine forward and reversed-sequence overlaps.
// Reversing matters because join candidates may share a broken edge in either
// direction; the matcher checks both.
function listOfOverlaps(seqs1: LineToVec, seqs2: LineToVec): LineToVecSequence[] {
  const seqs1Backwards = seqs1.map((s) => [...s].reverse());
  const seqs2Backwards = seqs2.map((s) => [...s].reverse());
  return [
    ...computeScoreForAll(seqs1, seqs2),
    ...computeScoreForAll(seqs1Backwards, seqs2Backwards),
  ];
}

export function score(seq1: LineToVec, seq2: LineToVec): number {
  const overlaps = listOfOverlaps(seq1, seq2);
  if (overlaps.length === 0) return 0;
  let max = 0;
  for (const o of overlaps) if (o.length > max) max = o.length;
  return max;
}

function weightSubsequence(seqs: LineToVecSequence[]): number {
  // Python: max(sum(weighting[number] for number in seq) for seq in seqs)
  let max = 0;
  for (const seq of seqs) {
    let sum = 0;
    for (const n of seq) sum += WEIGHTS[n] ?? 0;
    if (sum > max) max = sum;
  }
  return max;
}

export function scoreWeighted(seq1: LineToVec, seq2: LineToVec): number {
  const overlaps = listOfOverlaps(seq1, seq2);
  if (overlaps.length === 0) return 0;
  return weightSubsequence(overlaps);
}

// Convenience: compute both scores in one pass over overlaps. Useful for the
// ranking loop where we want to populate the LineToVecRanker's two top-15
// lists from a single scan rather than recomputing overlaps twice.
export function scoreBoth(
  seq1: LineToVec,
  seq2: LineToVec,
): { score: number; scoreWeighted: number } {
  const overlaps = listOfOverlaps(seq1, seq2);
  if (overlaps.length === 0) return { score: 0, scoreWeighted: 0 };
  let maxLen = 0;
  let maxW = 0;
  for (const o of overlaps) {
    if (o.length > maxLen) maxLen = o.length;
    let sum = 0;
    for (const n of o) sum += WEIGHTS[n] ?? 0;
    if (sum > maxW) maxW = sum;
  }
  return { score: maxLen, scoreWeighted: maxW };
}
