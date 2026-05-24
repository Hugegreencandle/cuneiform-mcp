#!/usr/bin/env node
// cuneiform-mcp v0.27.0 — register-matched per-period sign2vec builder.
//
// v0.26 shipped per-period sign embeddings (NA / NB) and the Round-11 audit
// found 44.2% full top-5 turnover. RELEASE-v0.26.md flagged this as
// "diachronic + register drift, not pure diachronic" because NA is dominated
// by Library of Ashurbanipal canonical literature while NB skews heavily
// toward administrative/archival texts. v0.27's task: train on register-
// MATCHED sub-corpora (e.g. divination-only across both periods,
// magic-only across both periods, literature-only across both periods) and
// measure how much of the v0.26 drift signal survives when register is
// held constant.
//
// SAME core PPMI + truncated-SVD pipeline as v0.23 / v0.26 (WINDOW=5,
// MIN_OCC=20, EMBEDDING_DIM=100). The only thing varying between any TWO
// register-matched buckets is the diachronic axis. Pure stdlib — no new
// dependencies.
//
// Output:
//   ~/.cache/cuneiform-mcp/sign-embeddings-divination-NA.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-divination-NB.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-magic-NA.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-magic-NB.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-literature-NA.json
//   ~/.cache/cuneiform-mcp/sign-embeddings-literature-NB.json
//
// The v0.23 single-config cache, v0.25 ensemble caches, and v0.26
// per-period caches are NOT touched.

import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CACHE_DIR =
  process.env.CUNEIFORM_MCP_CACHE_DIR || join(homedir(), ".cache", "cuneiform-mcp");
const SIGNS_CACHE = join(CACHE_DIR, "all-signs-full.json");
const METADATA_CACHE = join(CACHE_DIR, "fragment-metadata.json");
const EXCLUSIONS_PATH = join(
  homedir(),
  "Desktop",
  "cuneiform-mcp",
  "data",
  "corpus-exclusions.json",
);

// ─── Config ────────────────────────────────────────────────────────────────

const VERSION = "0.27.0";

// Register patterns. Match against meta.genres_flat (the prebuilt flat list
// of all hierarchical genre tokens). A tablet belongs to a register if any
// of its flat-genre tokens appears in the register's match list. This is
// substring-stable, hierarchy-agnostic, and matches what the methods paper
// will report.
const REGISTERS = [
  { key: "divination", label: "Divination (omens, extispicy, celestial, terrestrial)", patterns: ["Divination"] },
  { key: "magic", label: "Magic (āšipūtu — exorcistic, apotropaic, ritual)", patterns: ["Magic"] },
  { key: "literature", label: "Literature (hymns, lamentations, myth)", patterns: ["Literature"] },
];

const PERIODS = [
  { key: "NA", label: "Neo-Assyrian" },
  { key: "NB", label: "Neo-Babylonian" },
];

const WINDOW = 5;
const MIN_OCCURRENCES_DEFAULT = 20;
// Per-spec: if a register has < 1500 tablets in NB, lower MIN_OCC to 10
// for that bucket. The threshold is on tablet count; we also apply the
// same relaxation symmetrically to the NA side if NA-of-the-same-register
// is similarly thin (rare in practice — NA is large).
const SMALL_BUCKET_TABLET_THRESHOLD = 1500;
const MIN_OCCURRENCES_SMALL = 10;

const EMBEDDING_DIM = 100;
const RSVD_OVERSAMPLE = 10;
const RSVD_POWER_ITERS = 2;
const SEED = 42;

console.error(`cuneiform-mcp build-sign-embeddings-register-matched v${VERSION}`);
console.error(`  registers: ${REGISTERS.map((r) => r.key).join(", ")}`);
console.error(`  periods: ${PERIODS.map((p) => `${p.key}(${p.label})`).join(", ")}`);
console.error(`  WINDOW: ±${WINDOW}`);
console.error(`  MIN_OCCURRENCES default: ${MIN_OCCURRENCES_DEFAULT} (lowered to ${MIN_OCCURRENCES_SMALL} for buckets with < ${SMALL_BUCKET_TABLET_THRESHOLD} tablets)`);
console.error(`  EMBEDDING_DIM: ${EMBEDDING_DIM}`);
console.error(`  RSVD oversample: ${RSVD_OVERSAMPLE} · power iters: ${RSVD_POWER_ITERS}`);
console.error(`  SEED: ${SEED} (re-seeded per bucket for determinism)`);
console.error("");

// ─── Load corpus + metadata ────────────────────────────────────────────────

if (!existsSync(SIGNS_CACHE)) {
  console.error(`✘ ${SIGNS_CACHE} not found. Build cuneiform-mcp signs cache first.`);
  process.exit(1);
}
if (!existsSync(METADATA_CACHE)) {
  console.error(`✘ ${METADATA_CACHE} not found. Register + period assignment requires fragment-metadata cache.`);
  process.exit(1);
}

console.error("Loading signs cache...");
const tLoad = Date.now();
const records = JSON.parse(readFileSync(SIGNS_CACHE, "utf-8"));
console.error(`  ${records.length} tablets in ${((Date.now() - tLoad) / 1000).toFixed(1)}s`);

console.error("Loading fragment-metadata cache...");
const tMeta = Date.now();
const metadata = JSON.parse(readFileSync(METADATA_CACHE, "utf-8"));
console.error(
  `  ${Object.keys(metadata).length} metadata entries in ${((Date.now() - tMeta) / 1000).toFixed(1)}s`,
);

let excluded = new Set();
if (existsSync(EXCLUSIONS_PATH)) {
  const ex = JSON.parse(readFileSync(EXCLUSIONS_PATH, "utf-8"));
  excluded = new Set((ex.excluded_records ?? []).map((r) => r.id));
  console.error(`  ${excluded.size} excluded prototype records will be filtered`);
}

function periodOf(meta) {
  if (!meta || !meta.script) return null;
  if (typeof meta.script === "string") return meta.script;
  return meta.script.period ?? null;
}

function flatGenresOf(meta) {
  if (!meta) return [];
  if (Array.isArray(meta.genres_flat)) return meta.genres_flat;
  return [];
}

function matchesRegister(flatGenres, patterns) {
  for (const g of flatGenres) {
    for (const p of patterns) {
      if (g === p) return true;
    }
  }
  return false;
}

// ─── Partition tablets by (register, period) + tokenize ────────────────────

console.error("");
console.error("Partitioning tablets by (register, script.period) and tokenizing...");
const tTok = Date.now();

// buckets[register][period] = { tabletTokens: [][], totalSignOccurrences }
const buckets = {};
for (const r of REGISTERS) {
  buckets[r.key] = {};
  for (const p of PERIODS) {
    buckets[r.key][p.key] = { tabletTokens: [], totalSignOccurrences: 0 };
  }
}

let totalConsidered = 0;
let noMetadata = 0;
let otherPeriod = 0;
let droppedExcluded = 0;
let noGenreMatch = 0;

for (const r of records) {
  if (!r._id || typeof r.signs !== "string") continue;
  totalConsidered++;
  if (excluded.has(r._id)) {
    droppedExcluded++;
    continue;
  }
  const meta = metadata[r._id];
  if (!meta) {
    noMetadata++;
    continue;
  }
  const p = periodOf(meta);
  let pKey = null;
  if (p === "Neo-Assyrian") pKey = "NA";
  else if (p === "Neo-Babylonian") pKey = "NB";
  if (!pKey) {
    otherPeriod++;
    continue;
  }
  const flat = flatGenresOf(meta);

  // A tablet can belong to multiple registers (e.g. tagged with both
  // Magic and Divination) — that's intentional; each register-bucket
  // gets its own copy. Registers are not mutually exclusive here.
  let matchedAny = false;
  for (const reg of REGISTERS) {
    if (!matchesRegister(flat, reg.patterns)) continue;
    matchedAny = true;
    const toks = [];
    for (const line of r.signs.split(/\r?\n/)) {
      for (const t of line.trim().split(/\s+/).filter(Boolean)) {
        if (t === "X") continue;
        toks.push(t);
      }
    }
    if (toks.length === 0) continue;
    buckets[reg.key][pKey].tabletTokens.push(toks);
    buckets[reg.key][pKey].totalSignOccurrences += toks.length;
  }
  if (!matchedAny) noGenreMatch++;
}

console.error(
  `  bucket sizes (tablets · sign-occurrences):`,
);
for (const r of REGISTERS) {
  for (const p of PERIODS) {
    const b = buckets[r.key][p.key];
    console.error(
      `    ${r.key.padEnd(11)}-${p.key}  ${b.tabletTokens.length.toString().padStart(6)} tablets · ${b.totalSignOccurrences.toLocaleString().padStart(10)} sign occurrences`,
    );
  }
}
console.error(
  `  filtered out: ${noMetadata} no-metadata · ${otherPeriod} other-period · ${droppedExcluded} excluded · ${noGenreMatch} period-matched-but-no-register-genre (${((Date.now() - tTok) / 1000).toFixed(1)}s total · ${totalConsidered} records considered)`,
);

// ─── Deterministic PRNG (mulberry32) ───────────────────────────────────────

function mulberry32(seed) {
  let s = seed;
  return function () {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Per-bucket build pipeline ─────────────────────────────────────────────

function buildBucket({ registerKey, registerLabel, periodKey, periodLabel, tabletTokens, totalSignOccurrences, minOcc }) {
  const tStart = Date.now();
  console.error("");
  console.error(`══════════════════════════════════════════════════════════════════════`);
  console.error(`▶ Bucket ${registerKey}/${periodKey} (${registerLabel} · ${periodLabel}) — ${tabletTokens.length} tablets · MIN_OCC=${minOcc}`);
  console.error(`══════════════════════════════════════════════════════════════════════`);

  if (tabletTokens.length === 0) {
    console.error(`  ✘ bucket empty — skipping`);
    return null;
  }

  const rng = mulberry32(SEED);
  function gaussian() {
    let u = 0,
      v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // ─── Vocab gate ──────────────────────────────────────────────────────────
  console.error(`  counting sign frequencies (MIN_OCC=${minOcc})`);
  const freq = new Map();
  for (const toks of tabletTokens) {
    for (const t of toks) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  const vocab = [...freq.entries()]
    .filter(([, f]) => f >= minOcc)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
  const V = vocab.length;
  if (V === 0) {
    console.error(`  ✘ vocab empty at MIN_OCC=${minOcc} — skipping bucket`);
    return null;
  }
  if (V < 50) {
    console.error(`  ⚠ small-vocab warning: only ${V} signs at MIN_OCC=${minOcc}. SVD will still complete but small-sample noise dominates.`);
  }
  const signIdx = new Map(vocab.map((s, i) => [s, i]));
  console.error(
    `  vocab: ${V} signs (filtered from ${freq.size}) covering ${((100 * vocab.reduce((s, v) => s + (freq.get(v) ?? 0), 0)) / totalSignOccurrences).toFixed(1)}% of occurrences`,
  );

  // ─── Co-occurrence ───────────────────────────────────────────────────────
  console.error(`  building cooc matrix (WINDOW=±${WINDOW}, V×V=${V}×${V})`);
  const tC = Date.now();
  const C = new Float64Array(V * V);
  const rowSum = new Float64Array(V);
  let pairsEmitted = 0;
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
  }
  console.error(
    `    cooc done in ${((Date.now() - tC) / 1000).toFixed(1)}s · ${pairsEmitted.toLocaleString()} pairs · ${((V * V * 8) / 1024 / 1024).toFixed(1)} MB`,
  );

  // ─── PPMI ────────────────────────────────────────────────────────────────
  console.error(`  computing PPMI`);
  const tP = Date.now();
  let total = 0;
  for (let i = 0; i < V; i++) total += rowSum[i];

  const P = new Float32Array(V * V);
  let nonZero = 0;
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
      }
    }
  }
  console.error(
    `    PPMI done in ${((Date.now() - tP) / 1000).toFixed(1)}s · ${nonZero.toLocaleString()} non-zeros (${((100 * nonZero) / (V * V)).toFixed(2)}% density)`,
  );

  // ─── Randomized truncated SVD ────────────────────────────────────────────
  // K may exceed V at small-vocab buckets. Clamp K to V.
  const K = Math.min(EMBEDDING_DIM, V);
  const L = Math.min(K + RSVD_OVERSAMPLE, V);
  console.error(
    `  RSVD: target rank K=${K}, oversample p=${L - K}, power iters q=${RSVD_POWER_ITERS}`,
  );
  const tS = Date.now();

  function pTimes(B, leftCols) {
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

  function pTransTimes(B, leftCols) {
    const out = new Float64Array(V * leftCols);
    for (let i = 0; i < V; i++) {
      const oBase = i * leftCols;
      for (let kk = 0; kk < V; kk++) {
        const pv = P[kk * V + i];
        if (pv === 0) continue;
        const bBase = kk * leftCols;
        for (let j = 0; j < leftCols; j++) {
          out[oBase + j] += pv * B[bBase + j];
        }
      }
    }
    return out;
  }

  function gramSchmidtQR(M, rows, cols) {
    const Q = new Float64Array(rows * cols);
    for (let i = 0; i < rows * cols; i++) Q[i] = M[i];
    for (let c = 0; c < cols; c++) {
      for (let prev = 0; prev < c; prev++) {
        let dot = 0;
        for (let r = 0; r < rows; r++) {
          dot += Q[r * cols + c] * Q[r * cols + prev];
        }
        for (let r = 0; r < rows; r++) {
          Q[r * cols + c] -= dot * Q[r * cols + prev];
        }
      }
      let nrm = 0;
      for (let r = 0; r < rows; r++) {
        const v = Q[r * cols + c];
        nrm += v * v;
      }
      nrm = Math.sqrt(nrm);
      if (nrm > 1e-12) {
        for (let r = 0; r < rows; r++) Q[r * cols + c] /= nrm;
      } else {
        for (let r = 0; r < rows; r++) Q[r * cols + c] = gaussian();
        let n2 = 0;
        for (let r = 0; r < rows; r++) n2 += Q[r * cols + c] ** 2;
        n2 = Math.sqrt(n2);
        for (let r = 0; r < rows; r++) Q[r * cols + c] /= n2;
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

  const Omega = new Float64Array(V * L);
  for (let i = 0; i < Omega.length; i++) Omega[i] = gaussian();
  let Y = pTimes(Omega, L);
  for (let q = 0; q < RSVD_POWER_ITERS; q++) {
    Y = gramSchmidtQR(Y, V, L);
    let YPt = pTransTimes(Y, L);
    YPt = gramSchmidtQR(YPt, V, L);
    Y = pTimes(YPt, L);
  }
  const Q = gramSchmidtQR(Y, V, L);

  const B = new Float64Array(L * V);
  for (let i = 0; i < V; i++) {
    const pBase = i * V;
    for (let j = 0; j < V; j++) {
      const pv = P[pBase + j];
      if (pv === 0) continue;
      for (let ell = 0; ell < L; ell++) {
        B[ell * V + j] += Q[i * L + ell] * pv;
      }
    }
  }

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

  function jacobiEigendecomp(A, n, maxSweeps = 100, tol = 1e-12) {
    const M = new Float64Array(A);
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
  const order = Array.from({ length: L }, (_, i) => i).sort(
    (a, b) => eigenvalues[b] - eigenvalues[a],
  );
  const sigma = new Float64Array(L);
  const Ub = new Float64Array(L * L);
  for (let ell = 0; ell < L; ell++) {
    const src = order[ell];
    const ev = Math.max(0, eigenvalues[src]);
    sigma[ell] = Math.sqrt(ev);
    for (let r = 0; r < L; r++) {
      Ub[r * L + ell] = eigenvectors[r * L + src];
    }
  }

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

  const E = new Float64Array(V * K);
  for (let i = 0; i < V; i++) {
    for (let ell = 0; ell < K; ell++) {
      E[i * K + ell] = U[i * K + ell] * Math.sqrt(sigma[ell]);
    }
  }

  // L2-normalize
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
    console.error(`    WARN: ${normFailures} zero-norm signs (rare-context)`);
  }
  console.error(`    SVD done in ${((Date.now() - tS) / 1000).toFixed(1)}s`);

  // ─── Write per-bucket cache ──────────────────────────────────────────────
  const entries = [];
  for (let i = 0; i < V; i++) {
    const vec = new Array(K);
    for (let ell = 0; ell < K; ell++) {
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
    register: registerKey,
    register_label: registerLabel,
    period: periodKey,
    period_label: periodLabel,
    window_size: WINDOW,
    min_occurrences: minOcc,
    embedding_dim: K,
    rsvd_oversample: L - K,
    rsvd_power_iterations: RSVD_POWER_ITERS,
    seed: SEED,
    signs_indexed: V,
    total_corpus_occurrences: totalSignOccurrences,
    tablets_in_bucket: tabletTokens.length,
    excluded_records: excluded.size,
    ppmi_nonzero_entries: nonZero,
    ppmi_density_pct: +((100 * nonZero) / (V * V)).toFixed(4),
    top10_singular_values: Array.from(sigma.slice(0, Math.min(K, 10))).map((v) => +v.toFixed(4)),
    entries,
  };

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });
  const outPath = join(CACHE_DIR, `sign-embeddings-${registerKey}-${periodKey}.json`);
  writeFileSync(outPath, JSON.stringify(out));
  const sz = statSync(outPath).size;
  const elapsed = (Date.now() - tStart) / 1000;
  console.error(
    `  ✓ wrote ${outPath}\n    bucket=${registerKey}/${periodKey} · tablets=${tabletTokens.length} · signs_indexed=${V} · embedding_dim=${K} · min_occ=${minOcc} · size=${(sz / 1024 / 1024).toFixed(2)} MB · ${elapsed.toFixed(1)}s`,
  );

  return {
    register: registerKey,
    period: periodKey,
    register_label: registerLabel,
    period_label: periodLabel,
    tablets_in_bucket: tabletTokens.length,
    total_sign_occurrences: totalSignOccurrences,
    signs_indexed: V,
    embedding_dim: K,
    min_occurrences: minOcc,
    cache_path: outPath,
    cache_bytes: sz,
    elapsed_seconds: +elapsed.toFixed(2),
  };
}

// ─── Drive ────────────────────────────────────────────────────────────────

const tAll = Date.now();
const summary = [];
for (const r of REGISTERS) {
  // Decide MIN_OCC by inspecting BOTH the NA and NB tablet counts for this
  // register. If EITHER side is below the small-bucket threshold, we lower
  // MIN_OCC for BOTH sides of that register — symmetric so the two
  // resulting embeddings remain comparable (no apples-to-oranges MIN_OCC).
  const naTablets = buckets[r.key].NA.tabletTokens.length;
  const nbTablets = buckets[r.key].NB.tabletTokens.length;
  const lowerMinOcc = naTablets < SMALL_BUCKET_TABLET_THRESHOLD || nbTablets < SMALL_BUCKET_TABLET_THRESHOLD;
  const minOcc = lowerMinOcc ? MIN_OCCURRENCES_SMALL : MIN_OCCURRENCES_DEFAULT;
  if (lowerMinOcc) {
    console.error(
      `\nNOTE: register=${r.key} has a thin bucket (NA=${naTablets}, NB=${nbTablets}, threshold=${SMALL_BUCKET_TABLET_THRESHOLD}). Lowering MIN_OCC to ${MIN_OCCURRENCES_SMALL} for BOTH NA and NB of this register so the two embeddings remain comparable.`,
    );
  }
  for (const p of PERIODS) {
    const b = buckets[r.key][p.key];
    const s = buildBucket({
      registerKey: r.key,
      registerLabel: r.label,
      periodKey: p.key,
      periodLabel: p.label,
      tabletTokens: b.tabletTokens,
      totalSignOccurrences: b.totalSignOccurrences,
      minOcc,
    });
    if (s) summary.push(s);
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────
console.error("");
console.error(`══════════════════════════════════════════════════════════════════════`);
console.error(`▶ Register-matched build summary`);
console.error(`══════════════════════════════════════════════════════════════════════`);
console.error(
  `  ${"bucket".padEnd(18)}  ${"tablets".padStart(7)}  ${"occs".padStart(10)}  ${"signs".padStart(6)}  ${"dim".padStart(4)}  ${"min_occ".padStart(7)}  ${"size MB".padStart(8)}  ${"sec".padStart(6)}`,
);
let totalBytes = 0;
for (const s of summary) {
  const bucketLabel = `${s.register}/${s.period}`;
  console.error(
    `  ${bucketLabel.padEnd(18)}  ${s.tablets_in_bucket.toString().padStart(7)}  ${s.total_sign_occurrences.toLocaleString().padStart(10)}  ${s.signs_indexed.toString().padStart(6)}  ${s.embedding_dim.toString().padStart(4)}  ${s.min_occurrences.toString().padStart(7)}  ${(s.cache_bytes / 1024 / 1024).toFixed(2).padStart(8)}  ${s.elapsed_seconds.toFixed(1).padStart(6)}`,
  );
  totalBytes += s.cache_bytes;
}
const totalElapsed = (Date.now() - tAll) / 1000;
console.error("");
console.error(
  `  total: ${summary.length} buckets · ${(totalBytes / 1024 / 1024).toFixed(2)} MB on disk · ${totalElapsed.toFixed(1)}s wall-clock`,
);
console.error("");
console.error(`✓ Register-matched build complete.`);
