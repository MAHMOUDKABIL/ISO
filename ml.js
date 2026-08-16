/* ══════════════════════════════════════════════════
   ml.js - طرق الفحص الثلاث مكتوبة من الصفر
   غابة العزل - التجميع - الشبكة العصبية
   العزل الذكي - اعداد محمود الباز فوزي قابيل
   ══════════════════════════════════════════════════ */
"use strict";
const ML = (() => {

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function zscore(M) {
    const n = M.length, d = M[0].length;
    const mean = new Array(d).fill(0), std = new Array(d).fill(0);
    for (const r of M) for (let q = 0; q < d; q++) mean[q] += r[q] / n;
    for (const r of M) for (let q = 0; q < d; q++) std[q] += (r[q] - mean[q]) ** 2 / n;
    for (let q = 0; q < d; q++) std[q] = Math.sqrt(std[q]) || 1;
    const Z = M.map(r => r.map((v, q) => (v - mean[q]) / std[q]));
    return { Z, mean, std };
  }

  function minmax(a) {
    let mn = Infinity, mx = -Infinity;
    for (const v of a) { if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx - mn < 1e-12) return a.map(() => 0);
    return a.map(v => (v - mn) / (mx - mn));
  }

  /* 1) غابة العزل */
  const cFactor = n => n <= 1 ? 0 : n === 2 ? 1
    : 2 * (Math.log(n - 1) + 0.5772156649) - 2 * (n - 1) / n;

  function buildTree(Z, idx, depth, maxD, rng) {
    if (idx.length <= 1 || depth >= maxD) return { s: idx.length };
    const d = Z[0].length;
    for (let t = 0; t < d; t++) {
      const f = Math.floor(rng() * d);
      let mn = Infinity, mx = -Infinity;
      for (const i of idx) { const v = Z[i][f]; if (v < mn) mn = v; if (v > mx) mx = v; }
      if (mx === mn) continue;
      const split = mn + rng() * (mx - mn), L = [], R = [];
      for (const i of idx) (Z[i][f] < split ? L : R).push(i);
      return { f, split, L: buildTree(Z, L, depth + 1, maxD, rng), R: buildTree(Z, R, depth + 1, maxD, rng) };
    }
    return { s: idx.length };
  }

  function pathLen(x, node, depth) {
    if (node.f === undefined) return depth + cFactor(node.s);
    return x[node.f] < node.split ? pathLen(x, node.L, depth + 1) : pathLen(x, node.R, depth + 1);
  }

  function isolationForest(Z, opts = {}) {
    const rng = opts.rng || Math.random, trees = opts.trees || 120, sub = opts.sub || 256;
    const n = Z.length, ss = Math.min(sub, n);
    const maxD = Math.ceil(Math.log2(ss + 1)), forest = [];
    for (let t = 0; t < trees; t++) {
      const idx = shuffle([...Array(n).keys()], rng).slice(0, ss);
      forest.push(buildTree(Z, idx, 0, maxD, rng));
    }
    const c = cFactor(ss) || 1;
    return Z.map(x => {
      let s = 0; for (const tr of forest) s += pathLen(x, tr, 0);
      return Math.pow(2, -(s / trees) / c);
    });
  }

  /* 2) التجميع */
  function dist2(a, b) { let s = 0; for (let q = 0; q < a.length; q++) s += (a[q] - b[q]) ** 2; return s; }

  function kmeans(Z, k, rng, iters = 90) {
    const n = Z.length, d = Z[0].length;
    k = Math.min(k, n);
    const cents = [Z[Math.floor(rng() * n)].slice()];
    const D = new Array(n).fill(Infinity);
    while (cents.length < k) {
      for (let i = 0; i < n; i++) D[i] = Math.min(D[i], dist2(Z[i], cents[cents.length - 1]));
      let sum = 0; for (const v of D) sum += v;
      let r = rng() * sum, pick = 0;
      for (let i = 0; i < n; i++) { r -= D[i]; if (r <= 0) { pick = i; break; } }
      cents.push(Z[pick].slice());
    }
    let labels = new Array(n).fill(0);
    for (let it = 0; it < iters; it++) {
      let moved = false;
      for (let i = 0; i < n; i++) {
        let best = 0, bd = Infinity;
        for (let c = 0; c < k; c++) { const dd = dist2(Z[i], cents[c]); if (dd < bd) { bd = dd; best = c; } }
        if (labels[i] !== best) { labels[i] = best; moved = true; }
      }
      const sums = Array.from({ length: k }, () => new Array(d).fill(0)), cnt = new Array(k).fill(0);
      for (let i = 0; i < n; i++) { cnt[labels[i]]++; for (let q = 0; q < d; q++) sums[labels[i]][q] += Z[i][q]; }
      for (let c = 0; c < k; c++) if (cnt[c]) for (let q = 0; q < d; q++) cents[c][q] = sums[c][q] / cnt[c];
      if (!moved) break;
    }
    const sizes = new Array(k).fill(0), dists = new Array(n);
    for (let i = 0; i < n; i++) sizes[labels[i]]++;
    for (let i = 0; i < n; i++) dists[i] = Math.sqrt(dist2(Z[i], cents[labels[i]]));
    return { labels, sizes, dists, k };
  }

  function kmeansScores(km, n) {
    const maxD = Math.max(...km.dists) || 1;
    const smallTh = Math.max(2, Math.floor(n * 0.04));
    return km.dists.map((ds, i) => {
      const small = km.sizes[km.labels[i]] <= smallTh ? 1 : 0;
      return Math.min(1, 0.7 * (ds / maxD) + 0.45 * small);
    });
  }

  /* 3) الشبكة العصبية */
  function trainAutoencoder(Z, opts = {}) {
    const rng = opts.rng || Math.random;
    const n = Z.length, d = Z[0].length;
    const h = Math.max(2, Math.min(opts.hidden || 4, d));
    const epochs = opts.epochs || (n > 900 ? 55 : 110);
    const lr0 = opts.lr || 0.05;
    const init = (r, c) => Array.from({ length: r }, () =>
      Array.from({ length: c }, () => (rng() * 2 - 1) * Math.sqrt(1 / c)));
    const W1 = init(h, d), b1 = new Array(h).fill(0);
    const W2 = init(d, h), b2 = new Array(d).fill(0);
    const order = [...Array(n).keys()];

    for (let e = 0; e < epochs; e++) {
      shuffle(order, rng);
      const lr = lr0 / (1 + e * 0.015);
      for (const i of order) {
        const x = Z[i];
        const z1 = new Array(h);
        for (let j = 0; j < h; j++) {
          let s = b1[j]; for (let q = 0; q < d; q++) s += W1[j][q] * x[q];
          z1[j] = Math.tanh(s);
        }
        const out = new Array(d);
        for (let q = 0; q < d; q++) {
          let s = b2[q]; for (let j = 0; j < h; j++) s += W2[q][j] * z1[j];
          out[q] = s;
        }
        const dOut = new Array(d);
        for (let q = 0; q < d; q++) dOut[q] = out[q] - x[q];
        for (let q = 0; q < d; q++) {
          const g = dOut[q]; if (!g) continue;
          b2[q] -= lr * g;
          for (let j = 0; j < h; j++) W2[q][j] -= lr * g * z1[j];
        }
        const dz1 = new Array(h);
        for (let j = 0; j < h; j++) {
          let s = 0; for (let q = 0; q < d; q++) s += W2[q][j] * dOut[q];
          dz1[j] = s * (1 - z1[j] * z1[j]);
        }
        for (let j = 0; j < h; j++) {
          const g = dz1[j]; if (!g) continue;
          b1[j] -= lr * g;
          for (let q = 0; q < d; q++) W1[j][q] -= lr * g * x[q];
        }
      }
    }
    let total = 0;
    const scores = new Array(n);
    for (let i = 0; i < n; i++) {
      const x = Z[i], z1 = new Array(h);
      for (let j = 0; j < h; j++) {
        let s = b1[j]; for (let q = 0; q < d; q++) s += W1[j][q] * x[q];
        z1[j] = Math.tanh(s);
      }
      let se = 0;
      for (let q = 0; q < d; q++) {
        let s = b2[q]; for (let j = 0; j < h; j++) s += W2[q][j] * z1[j];
        se += (s - x[q]) ** 2;
      }
      scores[i] = se / d; total += scores[i];
    }
    return { scores, avgLoss: total / n };
  }

  return { mulberry32, shuffle, zscore, minmax, isolationForest, kmeans, kmeansScores, trainAutoencoder };
})();