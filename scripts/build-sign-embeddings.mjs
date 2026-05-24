#!/usr/bin/env node
// cuneiform-mcp v0.23.0 — sign2vec: sign-level semantic embeddings.
//
// Companion to v0.15's tablet-level Random Indexing embeddings. Operates on
// the orthogonal complement axis: instead of vectors per TABLET, we learn
// vectors per SIGN from corpus co-occurrence so we can answer "which signs
// mean the same thing?" — empirically recovering logogram substitutions
// (DINGIR ↔ AN), period-specific equivalences, and phonetic/semantic
// clusters.
//
// Algorithm (Levy & Goldberg 2014 baseline; standard distributional-semantics
// recipe used in word2vec post-hoc analyses):
//   1. Sliding window (±WINDOW) co-occurrence count over the same cleaned
//      tokenization used by fuzzyParallels.ts (X-skip applied at the
//      tokenizer; rare-sign cutoff applied at the sign-vocab gate).
//   2. PPMI: PMI(i,j) = log(c[i,j] * N / (row_i * col_j)); clamp to ≥0.
//   3. Truncated SVD on the dense PPMI matrix (vocab × vocab) via the
//      Halko–Martinsson–Tropp randomized algorithm — ~50 lines of plain TS,
//      no numerical-linalg dependency. Sign embedding = U[:, :K] * Σ[:K]^0.5
//      (the standard SVD-of-PPMI factorization).
//   4. L2-normalize each row so cosine similarity is dot product.
//
// Output: ~/.cache/cuneiform-mcp/sign-embeddings.json
//   { version, build_timestamp, window_size, min_occurrences, embedding_dim,
//     signs_indexed, total_corpus_occurrences, entries: [{sign, vector,
//     occurrences}, ...] }
//
// Pure stdlib — no new dependencies. Runs in <2 min for ~3000-sign vocab.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const EXCLUSIONS_PATH = join(
  homedir(),
  "Desktop",
  "cuneiform-mcp",
  "data",
  "corpus-exclusions.json",
);
const OUT_PATH = join(CACHE_DIR, "sign-embeddings.json");

// ─── Config ────────────────────────────────────────────────────────────────

const VERSION = "0.23.0";
const WINDOW = 5; // ±5 sign context window
const MIN_OCCURRENCES = 20; // sign must appear ≥20 times to be embedded
const EMBEDDING_DIM = 100; // truncated-SVD rank
const RSVD_OVERSAMPLE = 10; // p in Halko-Martinsson-Tropp (typical 5-20)
const RSVD_POWER_ITERS = 2; // power-iteration steps for spectral decay tablets
const SEED = 42;

console.error(`cuneiform-mcp build-sign-embeddings v${VERSION}`);
console.error(`  WINDOW: ±${WINDOW}`);
console.error(`  MIN_OCCURRENCES: ${MIN_OCCURRENCES}`);
console.error(`  EMBEDDING_DIM: ${EMBEDDING_DIM} (truncated SVD via randomized projection)`);
console.error(`  RSVD oversample: ${RSVD_OVERSAMPLE} · power iters: ${RSVD_POWER_ITERS}`);
console.error(`  SEED: ${SEED}`);
console.error("");

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────────────

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
// Box-Muller for unit-Gaussian samples (used by RSVD)
function gaussian() {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Load corpus ───────────────────────────────────────────────────────────

if (!existsSync(SIGNS_CACHE)) {
  console.error(`✘ ${SIGNS_CACHE} not found. Build cuneiform-mcp signs cache first.`);
  process.exit(1);
}

console.error("Loading signs cache...");
const t0 = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
console.error(`  ${records.length} tablets in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

let excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
  excluded = new Set((ex.excluded_records ?? []).map((r) => r.id));
  console.error(`  ${excluded.size} excluded prototype records will be filtered`);
}

// ─── Tokenize each tablet ──────────────────────────────────────────────────
// Same rule as build-embeddings.mjs: split on whitespace per line, drop X tokens
// (damage markers). Tablet IDs are kept just for the totals report.

console.error("");
console.error("Tokenizing...");
const t1 = Date.now();
const tabletTokens = []; // string[][]
let totalSignOccurrences = 0;
for (const r of records) {
  if (!r._id || typeof r.signs !== "string" || excluded.has(r._id)) continue;
  const toks = [];
  for (const line of r.signs.split(/\r?\n/)) {
    for (const t of line.trim().split(/\s+/).filter(Boolean)) {
      if (t === "X") continue;
      toks.push(t);
    }
  }
  if (toks.length > 0) {
    tabletTokens.push(toks);
    totalSignOccurrences += toks.length;
  }
}
console.error(
  `  ${tabletTokens.length} non-empty tablets · ${totalSignOccurrences.toLocaleString()} sign occurrences (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
);

// ─── Vocab gating ──────────────────────────────────────────────────────────

console.error("");
console.error(`Counting sign frequencies (MIN_OCCURRENCES=${MIN_OCCURRENCES})...`);
const freq = new Map();
for (const toks of tabletTokens) {
  for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
}
const vocab = [...freq.entries()]
  .filter(([, f]) => f >= MIN_OCCURRENCES)
  .sort((a, b) => b[1] - a[1])
  .map(([s]) => s);
const V = vocab.length;
const signIdx = new Map(vocab.map((s, i) => [s, i]));
console.error(
  `  vocab: ${V} signs (filtered from ${freq.size}) covering ${((100 * vocab.reduce((s, v) => s + (freq.get(v) ?? 0), 0)) / totalSignOccurrences).toFixed(1)}% of occurrences`,
);

// ─── Co-occurrence matrix ──────────────────────────────────────────────────
// Dense V×V Float32 matrix. At V≈3000 that's 9M × 4 bytes = ~36 MB — fine.

console.error("");
console.error("Building co-occurrence matrix (sliding window pass)...");
const t2 = Date.now();
const C = new Float64Array(V * V);
const rowSum = new Float64Array(V);
let pairsEmitted = 0;
let processed = 0;
for (const toks of tabletTokens) {
  const ids = new Int32Array(toks.length);
  for (let i = 0; i < toks.length; i++) {
    const v = signIdx.get(toks[i]);
    ids[i] = v === undefined ? -1 : v;
  }
  for (let i = 0; i < toks.length; i++) {
    const ci = ids[i];
    if (ci < 0) continue;
    const lo = Math.max(0, i - WINDOW);
    const hi = Math.min(toks.length - 1, i + WINDOW);
    for (let j = lo; j <= hi; j++) {
      if (j === i) continue;
      const cj = ids[j];
      if (cj < 0) continue;
      C[ci * V + cj] += 1;
      rowSum[ci] += 1;
      pairsEmitted++;
    }
  }
  processed++;
  if (processed % 5000 === 0) {
    console.error(
      `  ${processed}/${tabletTokens.length} tablets · ${pairsEmitted.toLocaleString()} cooc pairs`,
    );
  }
}
console.error(
  `  done in ${((Date.now() - t2) / 1000).toFixed(1)}s · ${pairsEmitted.toLocaleString()} pairs · dense matrix ${V}×${V} = ${((V * V * 8) / 1024 / 1024).toFixed(1)} MB`,
);

// ─── PPMI ──────────────────────────────────────────────────────────────────
// PMI(i,j) = log( C[i,j] * total / (rowSum[i] * rowSum[j]) )
// PPMI = max(0, PMI). C is symmetric (it's a cooc window count), so colSum = rowSum.
// Use the global cooc total for the normalization.

console.error("");
console.error("Computing PPMI...");
const t3 = Date.now();
let total = 0;
for (let i = 0; i < V; i++) total += rowSum[i];
console.error(`  total cooc weight: ${total.toLocaleString()}`);

const P = new Float32Array(V * V);
let nonZero = 0;
let ppmiTotal = 0;
for (let i = 0; i < V; i++) {
  const ri = rowSum[i];
  if (ri === 0) continue;
  const ibase = i * V;
  for (let j = 0; j < V; j++) {
    const c = C[ibase + j];
    if (c === 0) continue;
    const rj = rowSum[j];
    if (rj === 0) continue;
    const pmi = Math.log((c * total) / (ri * rj));
    if (pmi > 0) {
      P[ibase + j] = pmi;
      nonZero++;
      ppmiTotal += pmi;
    }
  }
}
console.error(
  `  PPMI done in ${((Date.now() - t3) / 1000).toFixed(1)}s · ${nonZero.toLocaleString()} non-zeros (${((100 * nonZero) / (V * V)).toFixed(2)}% density) · mean = ${(ppmiTotal / Math.max(1, nonZero)).toFixed(3)}`,
);

// ─── Randomized truncated SVD (Halko-Martinsson-Tropp 2011) ────────────────
// We want top-K left singular vectors and singular values of P (V×V).
// PPMI matrices are not strictly symmetric here because (PMI is symmetric but
// row L1-norms differ from col L1-norms slightly under our cooc formulation
// — actually with symmetric C they coincide, so P IS symmetric). We still run
// the standard non-symmetric RSVD recipe so the algorithm is robust to small
// numerical asymmetries.
//
// Algorithm:
//   1. Draw Ω ∈ R^{V × (K+p)} with Gaussian entries.
//   2. Form Y = P · Ω  (V × (K+p))
//   3. Power iterations to amplify dominant subspace:
//        repeat q times: Y = P · (Pᵀ · Y), then re-orthonormalize.
//   4. QR-decompose Y → Q (V × (K+p)) orthonormal.
//   5. B = Qᵀ · P   ((K+p) × V).
//   6. Full SVD of B (small dimension) → U_b, Σ, Vᵀ.
//   7. U = Q · U_b. Return first K columns.

const K = EMBEDDING_DIM;
const L = K + RSVD_OVERSAMPLE;

console.error("");
console.error(
  `Randomized truncated SVD: target rank K=${K}, oversample p=${RSVD_OVERSAMPLE}, power iters q=${RSVD_POWER_ITERS}`,
);
const t4 = Date.now();

// Helpers: dense matrix mul-and-vector / mul-matrix. We store matrices as
// Float64Array row-major.
function matMul(A, B, m, k, n) {
  // A: m×k, B: k×n  →  m×n. Plain triple loop with j-inner for cache locality
  // on the row-major B is too slow at V≈3000. Switch to ik-outer / j-inner
  // accumulating into a row vector: that gives us O(mkn) with stride-1
  // inner over B's rows.
  const out = new Float64Array(m * n);
  for (let i = 0; i < m; i++) {
    const aBase = i * k;
    const oBase = i * n;
    for (let p = 0; p < k; p++) {
      const a = A[aBase + p];
      if (a === 0) continue;
      const bBase = p * n;
      for (let j = 0; j < n; j++) {
        out[oBase + j] += a * B[bBase + j];
      }
    }
  }
  return out;
}

// Multiply P (V×V) by dense B (V×L). Treat P as dense Float32, B as Float64.
function pTimes(B, leftCols) {
  // returns V×leftCols
  const out = new Float64Array(V * leftCols);
  for (let i = 0; i < V; i++) {
    const oBase = i * leftCols;
    const pBase = i * V;
    for (let kk = 0; kk < V; kk++) {
      const pv = P[pBase + kk];
      if (pv === 0) continue;
      const bBase = kk * leftCols;
      for (let j = 0; j < leftCols; j++) {
        out[oBase + j] += pv * B[bBase + j];
      }
    }
  }
  return out;
}

// Transposed multiply: Pᵀ × B  (P symmetric here, so == P × B; but write
// it generically in case of small asymmetries from float-roundoff).
function pTransTimes(B, leftCols) {
  const out = new Float64Array(V * leftCols);
  for (let i = 0; i < V; i++) {
    const oBase = i * leftCols;
    for (let kk = 0; kk < V; kk++) {
      const pv = P[kk * V + i]; // Pᵀ[i,kk] = P[kk,i]
      if (pv === 0) continue;
      const bBase = kk * leftCols;
      for (let j = 0; j < leftCols; j++) {
        out[oBase + j] += pv * B[bBase + j];
      }
    }
  }
  return out;
}

// Gram-Schmidt QR for tall-skinny (V × L) matrix. Returns Q (orthonormal cols)
// in place via the input buffer — modifies and returns.
function gramSchmidtQR(M, rows, cols) {
  const Q = new Float64Array(rows * cols);
  // Copy so we can mutate.
  for (let i = 0; i < rows * cols; i++) Q[i] = M[i];
  for (let c = 0; c < cols; c++) {
    // Subtract projections onto previous columns.
    for (let prev = 0; prev < c; prev++) {
      let dot = 0;
      for (let r = 0; r < rows; r++) {
        dot += Q[r * cols + c] * Q[r * cols + prev];
      }
      for (let r = 0; r < rows; r++) {
        Q[r * cols + c] -= dot * Q[r * cols + prev];
      }
    }
    // Normalize.
    let nrm = 0;
    for (let r = 0; r < rows; r++) {
      const v = Q[r * cols + c];
      nrm += v * v;
    }
    nrm = Math.sqrt(nrm);
    if (nrm > 1e-12) {
      for (let r = 0; r < rows; r++) Q[r * cols + c] /= nrm;
    } else {
      // Replace with a fresh random unit vector if a column collapsed.
      for (let r = 0; r < rows; r++) Q[r * cols + c] = gaussian();
      let n2 = 0;
      for (let r = 0; r < rows; r++) n2 += Q[r * cols + c] ** 2;
      n2 = Math.sqrt(n2);
      for (let r = 0; r < rows; r++) Q[r * cols + c] /= n2;
      // Re-orthogonalize against previous (one extra pass is sufficient).
      for (let prev = 0; prev < c; prev++) {
        let dot = 0;
        for (let r = 0; r < rows; r++) {
          dot += Q[r * cols + c] * Q[r * cols + prev];
        }
        for (let r = 0; r < rows; r++) {
          Q[r * cols + c] -= dot * Q[r * cols + prev];
        }
      }
      let n3 = 0;
      for (let r = 0; r < rows; r++) n3 += Q[r * cols + c] ** 2;
      n3 = Math.sqrt(n3);
      if (n3 > 1e-12) for (let r = 0; r < rows; r++) Q[r * cols + c] /= n3;
    }
  }
  return Q;
}

// Step 1: random Gaussian Ω ∈ R^{V × L}
console.error(`  step 1: random Gaussian projection (${V}×${L})`);
const Omega = new Float64Array(V * L);
for (let i = 0; i < Omega.length; i++) Omega[i] = gaussian();

// Step 2: Y = P · Ω
console.error("  step 2: Y = P · Ω");
let Y = pTimes(Omega, L);

// Step 3: power iterations with re-orthonormalization at each step.
for (let q = 0; q < RSVD_POWER_ITERS; q++) {
  console.error(`  step 3.${q + 1}: power iteration (orthonormalize Y → P^T·Y → P·…)`);
  Y = gramSchmidtQR(Y, V, L);
  let YPt = pTransTimes(Y, L);
  YPt = gramSchmidtQR(YPt, V, L);
  Y = pTimes(YPt, L);
}

// Step 4: QR(Y) → Q (V × L)
console.error("  step 4: QR(Y) → Q");
const Q = gramSchmidtQR(Y, V, L);

// Step 5: B = Qᵀ · P  (L × V)
console.error("  step 5: B = Qᵀ · P");
const B = new Float64Array(L * V);
for (let i = 0; i < V; i++) {
  const pBase = i * V;
  for (let j = 0; j < V; j++) {
    const pv = P[pBase + j];
    if (pv === 0) continue;
    // Q has shape V×L, row-major. Q[i, ell] = Q[i*L + ell]
    // B[ell, j] += Q[i, ell] * P[i, j]
    for (let ell = 0; ell < L; ell++) {
      B[ell * V + j] += Q[i * L + ell] * pv;
    }
  }
}

// Step 6: Full SVD of B (L × V) via B Bᵀ eigendecomposition (small L×L matrix).
// B = U_b · Σ · Vᵀ_b. We only need U_b (L×L) and Σ (L singular values).
// Method: compute G = B · Bᵀ (L × L), eigendecompose via Jacobi rotations,
// singular values are sqrt(eigenvalues), U_b columns are the eigenvectors.

console.error("  step 6: SVD of B via Jacobi eigendecomposition of B·B^T");
const G = new Float64Array(L * L);
for (let ell = 0; ell < L; ell++) {
  for (let m = 0; m < L; m++) {
    let s = 0;
    for (let j = 0; j < V; j++) {
      s += B[ell * V + j] * B[m * V + j];
    }
    G[ell * L + m] = s;
  }
}

// Jacobi eigendecomposition of symmetric L×L G.
// Reference: Golub & Van Loan, Matrix Computations §8.4.
function jacobiEigendecomp(A, n, maxSweeps = 100, tol = 1e-12) {
  const M = new Float64Array(A); // copy
  const Vmat = new Float64Array(n * n);
  for (let i = 0; i < n; i++) Vmat[i * n + i] = 1;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i !== j) off += M[i * n + j] * M[i * n + j];
      }
    }
    if (off < tol) break;
    for (let p = 0; p < n - 1; p++) {
      for (let qq = p + 1; qq < n; qq++) {
        const Mpq = M[p * n + qq];
        if (Math.abs(Mpq) < tol) continue;
        const Mpp = M[p * n + p];
        const Mqq = M[qq * n + qq];
        const theta = (Mqq - Mpp) / (2 * Mpq);
        let t;
        if (Math.abs(theta) > 1e15) {
          t = 1 / (2 * theta);
        } else {
          t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        }
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;
        // Update M
        M[p * n + p] = Mpp - t * Mpq;
        M[qq * n + qq] = Mqq + t * Mpq;
        M[p * n + qq] = 0;
        M[qq * n + p] = 0;
        for (let i = 0; i < n; i++) {
          if (i !== p && i !== qq) {
            const Mip = M[i * n + p];
            const Miq = M[i * n + qq];
            M[i * n + p] = c * Mip - s * Miq;
            M[p * n + i] = M[i * n + p];
            M[i * n + qq] = s * Mip + c * Miq;
            M[qq * n + i] = M[i * n + qq];
          }
        }
        // Update V (accumulate rotations)
        for (let i = 0; i < n; i++) {
          const Vip = Vmat[i * n + p];
          const Viq = Vmat[i * n + qq];
          Vmat[i * n + p] = c * Vip - s * Viq;
          Vmat[i * n + qq] = s * Vip + c * Viq;
        }
      }
    }
  }
  const eigenvalues = new Float64Array(n);
  for (let i = 0; i < n; i++) eigenvalues[i] = M[i * n + i];
  return { eigenvalues, eigenvectors: Vmat };
}

const { eigenvalues, eigenvectors } = jacobiEigendecomp(G, L);

// Sort eigenvalues descending, gather corresponding eigenvectors as U_b columns.
const order = Array.from({ length: L }, (_, i) => i).sort(
  (a, b) => eigenvalues[b] - eigenvalues[a],
);
const sigma = new Float64Array(L);
const Ub = new Float64Array(L * L); // row-major; column ell of U_b is sorted eigenvector
for (let ell = 0; ell < L; ell++) {
  const src = order[ell];
  // Clamp tiny negatives from floating-point noise.
  const ev = Math.max(0, eigenvalues[src]);
  sigma[ell] = Math.sqrt(ev);
  for (let r = 0; r < L; r++) {
    Ub[r * L + ell] = eigenvectors[r * L + src];
  }
}

// Step 7: U = Q · U_b  (V × L). Keep top K columns.
console.error("  step 7: U = Q · U_b  and form sign embeddings U[:,:K] · diag(σ^0.5)");
const U = new Float64Array(V * K);
for (let i = 0; i < V; i++) {
  for (let ell = 0; ell < K; ell++) {
    let s = 0;
    for (let m = 0; m < L; m++) {
      s += Q[i * L + m] * Ub[m * L + ell];
    }
    U[i * K + ell] = s;
  }
}

// Sign embedding = U[i,:] · sqrt(Σ). Then L2-normalize so cosine == dot.
const E = new Float64Array(V * K);
for (let i = 0; i < V; i++) {
  for (let ell = 0; ell < K; ell++) {
    E[i * K + ell] = U[i * K + ell] * Math.sqrt(sigma[ell]);
  }
}

console.error(`  SVD complete in ${((Date.now() - t4) / 1000).toFixed(1)}s`);
console.error(
  `  top-${Math.min(K, 10)} singular values: [${Array.from(sigma.slice(0, Math.min(K, 10)))
    .map((v) => v.toFixed(2))
    .join(", ")}]`,
);

// L2-normalize each sign vector
let normFailures = 0;
for (let i = 0; i < V; i++) {
  let s = 0;
  for (let ell = 0; ell < K; ell++) s += E[i * K + ell] ** 2;
  s = Math.sqrt(s);
  if (s > 0) {
    for (let ell = 0; ell < K; ell++) E[i * K + ell] /= s;
  } else {
    normFailures++;
  }
}
if (normFailures > 0) {
  console.error(`  WARN: ${normFailures} signs had zero-norm embeddings (rare-context signs)`);
}

// ─── Write output ──────────────────────────────────────────────────────────

console.error("");
console.error("Writing output...");
if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

const entries = [];
for (let i = 0; i < V; i++) {
  const vec = new Array(K);
  for (let ell = 0; ell < K; ell++) {
    // Round to 6 sig figs to keep JSON small but cosines stable.
    vec[ell] = +E[i * K + ell].toFixed(6);
  }
  entries.push({
    sign: vocab[i],
    vector: vec,
    occurrences: freq.get(vocab[i]) ?? 0,
  });
}

const out = {
  version: VERSION,
  build_timestamp: new Date().toISOString(),
  algorithm: "ppmi_svd",
  window_size: WINDOW,
  min_occurrences: MIN_OCCURRENCES,
  embedding_dim: K,
  rsvd_oversample: RSVD_OVERSAMPLE,
  rsvd_power_iterations: RSVD_POWER_ITERS,
  seed: SEED,
  signs_indexed: V,
  total_corpus_occurrences: totalSignOccurrences,
  excluded_records: excluded.size,
  ppmi_nonzero_entries: nonZero,
  ppmi_density_pct: +((100 * nonZero) / (V * V)).toFixed(4),
  top10_singular_values: Array.from(sigma.slice(0, Math.min(K, 10))).map((v) => +v.toFixed(4)),
  entries,
};

writeFileSync(OUT_PATH, JSON.stringify(out));
const sz = statSync(OUT_PATH).size;
console.error(`  ✓ ${OUT_PATH}`);
console.error(`  size: ${(sz / 1024 / 1024).toFixed(2)} MB`);
console.error("");
console.error(`✓ Build complete in ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
console.error(`  signs_indexed: ${V}`);
console.error(`  embedding_dim: ${K}`);
console.error(`  total_corpus_occurrences: ${totalSignOccurrences.toLocaleString()}`);
