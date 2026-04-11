/**
 * Statistical rigor tests for BiomechBase stat engine.
 * Reference values computed in R / scipy for the deterministic parts.
 * Permutation p-values are stochastic — tested with generous tolerances.
 *
 * Run: node stats.test.mjs
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ─── Re-implement the stat functions (copied verbatim from App.tsx) ───────────

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

const erf = (x) => {
  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741;
  const a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * absX);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);
  return sign * y;
};

const normalCdf = (z) => 0.5 * (1 + erf(z / Math.sqrt(2)));

const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;

const sampleVariance = (values) => {
  if (values.length < 2) return 0;
  const m = mean(values);
  return values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1);
};

const sampleStd = (values) => Math.sqrt(sampleVariance(values));

const rankValues = (values) => {
  const sorted = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array(values.length).fill(0);
  let idx = 0;
  while (idx < sorted.length) {
    let end = idx;
    while (end + 1 < sorted.length && sorted[end + 1].v === sorted[idx].v) end++;
    const avgRank = (idx + end + 2) / 2;
    for (let j = idx; j <= end; j++) ranks[sorted[j].i] = avgRank;
    idx = end + 1;
  }
  return ranks;
};

const shuffle = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const jarqueBeraNormality = (values) => {
  const n = values.length;
  if (n < 8) return { p: 1, isNormal: true };
  const m = mean(values);
  const m2 = values.reduce((s, v) => s + (v - m) ** 2, 0) / n;
  if (m2 === 0) return { p: 1, isNormal: true };
  const m3 = values.reduce((s, v) => s + (v - m) ** 3, 0) / n;
  const m4 = values.reduce((s, v) => s + (v - m) ** 4, 0) / n;
  const skew = m3 / Math.pow(m2, 1.5);
  const kurt = m4 / (m2 * m2);
  const jb = (n / 6) * (skew ** 2 + ((kurt - 3) ** 2) / 4);
  const z = (Math.cbrt(jb / 2) - (1 - 2 / 9)) / Math.sqrt(2 / 9);
  const p = clamp(1 - normalCdf(z), 0, 1);
  return { p, isNormal: p > 0.05 };
};

const approxPowerFromEffect = (effect, nEff) => {
  if (!Number.isFinite(effect) || !Number.isFinite(nEff) || nEff <= 0) return NaN;
  const zCrit = 1.96;
  const ncp = Math.abs(effect) * Math.sqrt(nEff);
  return clamp(1 - normalCdf(zCrit - ncp) + normalCdf(-zCrit - ncp), 0, 1);
};

const independentTTest = (a, b, permutations = 2000) => {
  const n1 = a.length, n2 = b.length;
  const m1 = mean(a), m2 = mean(b);
  const v1 = sampleVariance(a), v2 = sampleVariance(b);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  const t = se === 0 ? 0 : (m1 - m2) / se;
  const dfNum = (v1 / n1 + v2 / n2) ** 2;
  const dfDen = ((v1 / n1) ** 2) / (n1 - 1) + ((v2 / n2) ** 2) / (n2 - 1);
  const df = dfDen === 0 ? n1 + n2 - 2 : dfNum / dfDen;
  const combined = [...a, ...b];
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(combined);
    const pa = sh.slice(0, n1), pb = sh.slice(n1);
    const pSe = Math.sqrt(sampleVariance(pa) / n1 + sampleVariance(pb) / n2);
    const pt = pSe === 0 ? 0 : (mean(pa) - mean(pb)) / pSe;
    if (Math.abs(pt) >= Math.abs(t)) extreme++;
  }
  const p = (extreme + 1) / (permutations + 1);
  const pooled = Math.sqrt(((n1 - 1) * v1 + (n2 - 1) * v2) / Math.max(1, n1 + n2 - 2));
  const d = pooled === 0 ? 0 : (m1 - m2) / pooled;
  return { t, p, df, power: approxPowerFromEffect(d, (n1 * n2) / (n1 + n2)) };
};

const mannWhitneyUTest = (a, b, permutations = 2000) => {
  const n1 = a.length, n2 = b.length;
  const combined = [...a, ...b];
  const ranks = rankValues(combined);
  const r1 = ranks.slice(0, n1).reduce((s, v) => s + v, 0);
  const u1 = r1 - (n1 * (n1 + 1)) / 2;
  const mu = (n1 * n2) / 2;
  const obs = Math.abs(u1 - mu);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(combined);
    const pr = rankValues(sh);
    const pr1 = pr.slice(0, n1).reduce((s, v) => s + v, 0);
    const pu1 = pr1 - (n1 * (n1 + 1)) / 2;
    if (Math.abs(pu1 - mu) >= obs) extreme++;
  }
  return { u: u1, p: (extreme + 1) / (permutations + 1) };
};

const pairedTTest = (pairs, permutations = 2000) => {
  const diffs = pairs.map(([a, b]) => a - b);
  const n = diffs.length;
  const m = mean(diffs), sd = sampleStd(diffs);
  const t = sd === 0 ? 0 : m / (sd / Math.sqrt(n));
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const perm = diffs.map((d) => (Math.random() < 0.5 ? d : -d));
    const pm = mean(perm), psd = sampleStd(perm);
    const pt = psd === 0 ? 0 : pm / (psd / Math.sqrt(n));
    if (Math.abs(pt) >= Math.abs(t)) extreme++;
  }
  const dz = sd === 0 ? 0 : m / sd;
  return { t, p: (extreme + 1) / (permutations + 1), df: n - 1, power: approxPowerFromEffect(dz, n), diffs };
};

const wilcoxonSignedRankTest = (pairs, permutations = 2000) => {
  const diffs = pairs.map(([a, b]) => a - b).filter((d) => d !== 0);
  const absDiffs = diffs.map((d) => Math.abs(d));
  const ranks = rankValues(absDiffs);
  const wPlus = diffs.reduce((s, d, i) => s + (d > 0 ? ranks[i] : 0), 0);
  const totalRank = ranks.reduce((s, r) => s + r, 0);
  const obs = Math.abs(wPlus - totalRank / 2);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    let pw = 0;
    for (let j = 0; j < ranks.length; j++) if (Math.random() < 0.5) pw += ranks[j];
    if (Math.abs(pw - totalRank / 2) >= obs) extreme++;
  }
  return { w: wPlus, p: (extreme + 1) / (permutations + 1) };
};

const oneWayAnova = (groups, permutations = 2000) => {
  const k = groups.length, n = groups.reduce((s, g) => s + g.length, 0);
  const grand = mean(groups.flat());
  const ssBetween = groups.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0);
  const ssWithin = groups.reduce((s, g) => s + g.reduce((acc, v) => acc + (v - mean(g)) ** 2, 0), 0);
  const df1 = k - 1, df2 = n - k;
  const f = (ssBetween / df1) / (ssWithin / df2 || 1e-9);
  const all = groups.flat(), sizes = groups.map((g) => g.length);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(all);
    const permGroups = [];
    let offset = 0;
    sizes.forEach((sz) => { permGroups.push(sh.slice(offset, offset + sz)); offset += sz; });
    const pGrand = mean(permGroups.flat());
    const pSSB = permGroups.reduce((s, g) => s + g.length * (mean(g) - pGrand) ** 2, 0);
    const pSSW = permGroups.reduce((s, g) => s + g.reduce((acc, v) => acc + (v - mean(g)) ** 2, 0), 0);
    const pF = (pSSB / df1) / (pSSW / df2 || 1e-9);
    if (pF >= f) extreme++;
  }
  return { f, p: (extreme + 1) / (permutations + 1), df1, df2 };
};

const kruskalWallis = (groups, permutations = 2000) => {
  const all = groups.flat(), n = all.length;
  const ranks = rankValues(all);
  let offset = 0, h = 0;
  groups.forEach((g) => {
    const rSum = ranks.slice(offset, offset + g.length).reduce((s, v) => s + v, 0);
    h += (rSum ** 2) / g.length;
    offset += g.length;
  });
  h = (12 / (n * (n + 1))) * h - 3 * (n + 1);
  const sizes = groups.map((g) => g.length);
  let extreme = 0;
  for (let i = 0; i < permutations; i++) {
    const sh = shuffle(all);
    const pr = rankValues(sh);
    let off = 0, ph = 0;
    sizes.forEach((sz) => {
      const rSum = pr.slice(off, off + sz).reduce((s, v) => s + v, 0);
      ph += (rSum ** 2) / sz;
      off += sz;
    });
    ph = (12 / (n * (n + 1))) * ph - 3 * (n + 1);
    if (ph >= h) extreme++;
  }
  return { h, p: (extreme + 1) / (permutations + 1), df: groups.length - 1 };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const near = (actual, expected, tol = 1e-6) =>
  Math.abs(actual - expected) <= tol;

const assertNear = (actual, expected, tol, label) => {
  if (!near(actual, expected, tol))
    assert.fail(`${label}: expected ${expected} ± ${tol}, got ${actual}`);
};

// ─── Tests ────────────────────────────────────────────────────────────────────

// --- mean / variance / std ---------------------------------------------------

test('mean of simple array', () => {
  assert.equal(mean([2, 4, 6]), 4);
  assert.equal(mean([1]), 1);
});

test('sampleVariance: known value', () => {
  // mean=5, SS=9+1+1+1+0+0+4+16=32, var=32/7≈4.5714
  assertNear(sampleVariance([2, 4, 4, 4, 5, 5, 7, 9]), 32 / 7, 1e-10, 'sampleVariance');
});

test('sampleVariance: single element returns 0', () => {
  assert.equal(sampleVariance([42]), 0);
});

test('sampleStd: known value', () => {
  // sqrt(32/7) ≈ 2.1381
  assertNear(sampleStd([2, 4, 4, 4, 5, 5, 7, 9]), Math.sqrt(32 / 7), 1e-10, 'sampleStd');
});

// --- rankValues --------------------------------------------------------------

test('rankValues: no ties', () => {
  const r = rankValues([3, 1, 4, 1, 5]);
  // sorted positions: 1(idx1)=1, 1(idx3)=2 → avg 1.5; 3(idx0)=3; 4(idx2)=4; 5(idx4)=5
  assert.deepEqual(r, [3, 1.5, 4, 1.5, 5]);
});

test('rankValues: all equal → all get average rank', () => {
  const r = rankValues([7, 7, 7]);
  assert.deepEqual(r, [2, 2, 2]);
});

test('rankValues: single element → rank 1', () => {
  assert.deepEqual(rankValues([99]), [1]);
});

// --- erf / normalCdf ---------------------------------------------------------

test('erf(0) ≈ 0 (Abramowitz approximation, not exact)', () => assertNear(erf(0), 0, 1e-8, 'erf(0)'));
test('erf(1) ≈ 0.8427 (Abramowitz & Stegun)', () => assertNear(erf(1), 0.8427007929, 1e-6, 'erf(1)'));
test('erf(-1) = -erf(1)', () => assertNear(erf(-1), -0.8427007929, 1e-6, 'erf(-1)'));
test('normalCdf(0) ≈ 0.5 (Abramowitz approximation)', () => assertNear(normalCdf(0), 0.5, 1e-8, 'normalCdf(0)'));
test('normalCdf(1.96) ≈ 0.975', () => assertNear(normalCdf(1.96), 0.975, 2e-3, 'normalCdf(1.96)'));
test('normalCdf(-1.96) ≈ 0.025', () => assertNear(normalCdf(-1.96), 0.025, 2e-3, 'normalCdf(-1.96)'));

// --- Welch t-test: deterministic statistic -----------------------------------

test('independentTTest: t-statistic matches formula (Welch)', () => {
  // a=[5,7,9,11,13]: mean=9, var=10; b=[2,4,6,8]: mean=5, var=20/3
  // se=sqrt(10/5 + (20/3)/4)=sqrt(2+5/3)=sqrt(11/3)≈1.9149
  // t=(9-5)/1.9149≈2.0893
  // df=(2+5/3)^2 / ((2^2/4)+((5/3)^2/3)) ≈ 6.956
  const a = [5, 7, 9, 11, 13];
  const b = [2, 4, 6, 8];
  const { t, df } = independentTTest(a, b, 1);
  assertNear(t, 2.0893, 0.001, 't-statistic');
  assertNear(df, 363 / 52, 0.001, 'Welch df'); // 363/52 ≈ 6.9808
});

test('independentTTest: identical groups → t = 0, p ≈ 1', () => {
  const a = [3, 3, 3, 3];
  const { t, p } = independentTTest(a, a, 100);
  assert.equal(t, 0);
  assert.ok(p > 0.5, `expected p > 0.5, got ${p}`);
});

test('independentTTest: clearly different groups → p < 0.1', () => {
  // Groups far apart — permutation p should be small with enough perms
  const a = [100, 101, 102, 103, 104, 105];
  const b = [1, 2, 3, 4, 5, 6];
  const { p } = independentTTest(a, b, 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

// --- Mann-Whitney U: deterministic U -----------------------------------------

test('mannWhitneyUTest: U-statistic matches manual calculation', () => {
  // a=[1,2,3], b=[4,5,6]  → ranks=[1,2,3,4,5,6], R1=1+2+3=6, U1=6-(3*4/2)=0
  const { u } = mannWhitneyUTest([1, 2, 3], [4, 5, 6], 1);
  assert.equal(u, 0);
});

test('mannWhitneyUTest: a dominates b → p < 0.1', () => {
  const a = [50, 60, 70, 80, 90, 100];
  const b = [1, 2, 3, 4, 5, 6];
  const { p } = mannWhitneyUTest(a, b, 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

test('mannWhitneyUTest: identical groups → p > 0.3', () => {
  const a = [5, 10, 15, 20];
  const { p } = mannWhitneyUTest(a, a, 500);
  assert.ok(p > 0.3, `expected p > 0.3, got ${p}`);
});

// --- Paired t-test -----------------------------------------------------------

test('pairedTTest: t-statistic matches formula', () => {
  // diffs = [1,1,1,1,1], mean=1, sd=0 → t = Inf → capped as 0 in code (sd guard)
  // Use non-trivial diffs instead: [2,4,6,8], mean=5, sd≈2.58, t = 5/(2.58/2) ≈ 3.87
  const pairs = [[3,1],[5,1],[7,1],[9,1]];
  const { t, df } = pairedTTest(pairs, 1);
  assertNear(t, 3.872, 0.001, 'paired t');
  assert.equal(df, 3);
});

test('pairedTTest: no difference → p > 0.3', () => {
  const pairs = [[1,1],[2,2],[3,3],[4,4],[5,5]];
  const { t, p } = pairedTTest(pairs, 500);
  assert.equal(t, 0);
  assert.ok(p > 0.3, `expected p > 0.3, got ${p}`);
});

test('pairedTTest: large consistent difference → p < 0.1', () => {
  // Diffs must vary for sd>0; use unequal gaps so t-stat is large
  const pairs = [[20,1],[18,3],[22,4],[25,6],[19,2],[23,5]];
  const { p } = pairedTTest(pairs, 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

// --- Wilcoxon signed-rank ----------------------------------------------------

test('wilcoxonSignedRankTest: W+ for all-positive diffs', () => {
  // pairs all have a > b → all diffs positive → W+ = sum of all ranks
  const pairs = [[5,1],[6,2],[7,3]]; // diffs [4,4,4] → all rank 2, W+=6
  const { w } = wilcoxonSignedRankTest(pairs, 1);
  assert.equal(w, 6);
});

test('wilcoxonSignedRankTest: large consistent difference → p < 0.1', () => {
  const pairs = [[100,1],[101,2],[102,3],[103,4],[104,5],[105,6]];
  const { p } = wilcoxonSignedRankTest(pairs, 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

test('wilcoxonSignedRankTest: tied pairs (all zeros) excluded → W+ = 0', () => {
  const pairs = [[5,5],[6,6],[7,7]];
  const { w } = wilcoxonSignedRankTest(pairs, 1);
  assert.equal(w, 0);
});

// --- One-way ANOVA -----------------------------------------------------------

test('oneWayAnova: F-statistic matches R', () => {
  // R: summary(aov(y~g)) with groups [2,3,4],[5,6,7],[8,9,10]
  // Between: grand=6, means=[3,6,9], SS_B=3*(9+0+9)=54, df1=2
  // Within: each group var=1, SS_W=2+2+2=6, df2=6 → F=54/2 / (6/6) = 27
  const groups = [[2,3,4],[5,6,7],[8,9,10]];
  const { f, df1, df2 } = oneWayAnova(groups, 1);
  assertNear(f, 27, 0.001, 'ANOVA F');
  assert.equal(df1, 2);
  assert.equal(df2, 6);
});

test('oneWayAnova: identical groups → F ≈ 0, p > 0.3', () => {
  const g = [1,2,3,4,5];
  const { f, p } = oneWayAnova([g, g, g], 500);
  assertNear(f, 0, 1e-6, 'F should be 0');
  assert.ok(p > 0.3, `expected p > 0.3, got ${p}`);
});

test('oneWayAnova: clearly separated groups → p < 0.1', () => {
  const { p } = oneWayAnova([[1,2,3],[50,51,52],[100,101,102]], 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

// --- Kruskal-Wallis ----------------------------------------------------------

test('kruskalWallis: H-statistic matches formula (no-tie case)', () => {
  // groups [[1,2,3],[4,5,6],[7,8,9]]: ranks=[1..9], R1=6,R2=15,R3=24, n=9
  // H = (12/(9*10)) * (36/3+225/3+576/3) - 30 = (12/90)*279 - 30 = 37.2-30 = 7.2
  // (R reports 6.96 due to tie-correction; no ties here → 7.2 is correct)
  const groups = [[1,2,3],[4,5,6],[7,8,9]];
  const { h, df } = kruskalWallis(groups, 1);
  assertNear(h, 7.2, 0.001, 'KW H-statistic');
  assert.equal(df, 2);
});

test('kruskalWallis: identical groups → H ≈ 0, p > 0.3', () => {
  const g = [1,2,3,4];
  const { h, p } = kruskalWallis([g, g, g], 500);
  assertNear(h, 0, 1e-6, 'H should be 0');
  assert.ok(p > 0.3, `expected p > 0.3, got ${p}`);
});

test('kruskalWallis: clearly separated groups → p < 0.1', () => {
  const { p } = kruskalWallis([[1,2,3],[50,51,52],[100,101,102]], 2000);
  assert.ok(p < 0.1, `expected p < 0.1, got ${p}`);
});

// --- Jarque-Bera normality ---------------------------------------------------

test('jarqueBeraNormality: <8 values → always normal', () => {
  const { isNormal, p } = jarqueBeraNormality([1,2,3]);
  assert.ok(isNormal);
  assert.equal(p, 1);
});

test('jarqueBeraNormality: normal-ish data → isNormal = true', () => {
  // Symmetric, low kurtosis — should pass normality
  const data = [4.9,5.1,5.0,4.8,5.2,5.0,4.9,5.1,5.0,5.0];
  const { isNormal } = jarqueBeraNormality(data);
  assert.ok(isNormal, 'near-normal data should pass JB test');
});

test('jarqueBeraNormality: heavily skewed data → isNormal = false', () => {
  // Exponential-like: strong positive skew
  const data = [0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50,100,200];
  const { isNormal } = jarqueBeraNormality(data);
  assert.ok(!isNormal, 'heavily skewed data should fail JB test');
});

test('jarqueBeraNormality: all-equal values → treated as normal', () => {
  const { isNormal } = jarqueBeraNormality([5,5,5,5,5,5,5,5,5,5]);
  assert.ok(isNormal, 'zero-variance array should return isNormal=true');
});

// --- approxPowerFromEffect ---------------------------------------------------

test('approxPowerFromEffect: large effect → power near 1', () => {
  const power = approxPowerFromEffect(5, 30);
  assert.ok(power > 0.99, `expected power > 0.99, got ${power}`);
});

test('approxPowerFromEffect: zero effect → power ≈ 0.05', () => {
  const power = approxPowerFromEffect(0, 30);
  assertNear(power, 0.05, 0.01, 'zero-effect power');
});

test('approxPowerFromEffect: invalid inputs → NaN', () => {
  assert.ok(isNaN(approxPowerFromEffect(NaN, 10)));
  assert.ok(isNaN(approxPowerFromEffect(1, -1)));
});

// --- p-value bounds ----------------------------------------------------------

test('all permutation p-values are in (0, 1]', () => {
  const a = [1,2,3,4,5], b = [6,7,8,9,10];
  const pairs = a.map((v, i) => [v, b[i]]);
  const results = [
    independentTTest(a, b, 200).p,
    mannWhitneyUTest(a, b, 200).p,
    pairedTTest(pairs, 200).p,
    wilcoxonSignedRankTest(pairs, 200).p,
    oneWayAnova([a, b, [11,12,13,14,15]], 200).p,
    kruskalWallis([a, b, [11,12,13,14,15]], 200).p,
  ];
  for (const p of results) {
    assert.ok(p > 0 && p <= 1, `p out of bounds: ${p}`);
  }
});
