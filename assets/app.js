/* ══════════════════════════════════════════════════════════════
   ديوان المُراجِع — د. محمود الباز قابيل
   خوارزميات التعلم الآلي غير الخاضع للإشراف:
   1) غابة العزل Isolation Forest
   2) التجميع K-Means
   3) الشبكات العصبية Autoencoders
   + محرك قابلية التفسير + مصدّرات Word / Excel
═══════════════════════════════════════════════════════════════ */
"use strict";

var AUDITOR = { name: "د. محمود الباز قابيل", title: "محاسب ومراجع قانوني" };

/* ═══════════ أدوات عامة ═══════════ */
function fmt(n, d) {
  d = d || 0;
  return Number(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function rand(a, b) { return a + Math.random() * (b - a); }
function sum(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s; }
function mean(a) { return a.length ? sum(a) / a.length : 0; }
function std(a) {
  var m = mean(a), s = 0;
  for (var i = 0; i < a.length; i++) s += (a[i] - m) * (a[i] - m);
  return Math.sqrt(s / a.length);
}
function median(a) {
  var s = a.slice().sort(function (x, y) { return x - y; });
  return s[Math.floor(s.length / 2)] || 0;
}
function todayAr() {
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "long" }).format(new Date());
}
function riskLevel(r) {
  return r >= 70 ? ["hi", "مرتفعة"] : r >= 40 ? ["mid", "متوسطة"] : ["lo", "منخفضة"];
}

/* ═══════════ بيانات تجريبية ═══════════ */
function demoData(n) {
  n = n || 60;
  var vendors = ["شركة النخيل للتوريدات", "مؤسسة الأفق للتقنية", "مصنع البحر للمعادن", "دار الصرح للطباعة", "شركة المدى للخدمات"];
  var bases = [1200, 2500, 4800, 950, 7300];
  var rows = [];
  for (var i = 0; i < n; i++) {
    var base = bases[Math.floor(Math.random() * bases.length)];
    rows.push({
      id: "INV-" + (1000 + i),
      label: vendors[Math.floor(Math.random() * vendors.length)],
      amount: +(base * rand(0.8, 1.25)).toFixed(2)
    });
  }
  rows.push({ id: "INV-1901", label: vendors[1], amount: 97500 });
  rows.push({ id: "INV-1902", label: vendors[3], amount: 13.5 });
  rows.push({ id: "INV-1903", label: vendors[0], amount: 88888 });
  rows.push({ id: "INV-1904", label: vendors[2], amount: 61234 });
  return rows;
}

/* ═══════════ قراءة الملفات (xlsx / xls / csv / txt) ═══════════ */
function readWorkbook(file) {
  return new Promise(function (res, rej) {
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        var ws = wb.Sheets[wb.SheetNames[0]];
        res(XLSX.utils.sheet_to_json(ws, { defval: "" }));
      } catch (err) {
        rej(new Error("تعذر قراءة الملف — تأكد أنه ملف جدول صالح (xlsx/xls/csv/txt)."));
      }
    };
    fr.onerror = function () { rej(new Error("تعذر فتح الملف.")); };
    fr.readAsArrayBuffer(file);
  });
}

function parseCSV(text) {
  var lines = text.trim().split(/\r?\n/);
  var headers = lines[0].split(",").map(function (h) { return h.trim(); });
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    var cols = lines[i].split(",");
    var obj = {};
    for (var j = 0; j < headers.length; j++) obj[headers[j]] = (cols[j] || "").trim();
    rows.push(obj);
  }
  return rows;
}

function findCol(rows, keys) {
  if (!rows.length) return null;
  var cols = Object.keys(rows[0]);
  for (var k = 0; k < keys.length; k++) {
    for (var c = 0; c < cols.length; c++) {
      if (String(cols[c]).toLowerCase().indexOf(keys[k]) !== -1) return cols[c];
    }
  }
  return null;
}

function normalizeRecords(raw) {
  var amtCol = findCol(raw, ["مبلغ", "قيمة", "amount", "total", "price"]);
  var lblCol = findCol(raw, ["مورد", "بيان", "وصف", "بند", "vendor", "description", "item"]);
  var numCol = findCol(raw, ["رقم", "number", "id", "no", "ref"]);
  if (!amtCol) throw new Error("لم أجد عمود المبلغ — حمّل النموذج الجاهز أو تأكد من وجود عمود «المبلغ» أو «القيمة».");
  var out = [];
  for (var i = 0; i < raw.length; i++) {
    var r = raw[i];
    var amt = parseFloat(String(r[amtCol]).replace(/,/g, ""));
    if (isNaN(amt) || amt <= 0) continue;
    out.push({
      id: String(r[numCol] || (i + 1)),
      label: String(r[lblCol] || ("بند " + (i + 1))),
      amount: amt
    });
  }
  return out;
}

/* ═══════════ النموذج الجاهز للتحميل ═══════════ */
var TEMPLATE_HEADERS = ["رقم الفاتورة", "المورد", "التاريخ", "المبلغ"];
var TEMPLATE_ROWS = [
  ["INV-1001", "شركة النخيل للتوريدات", "2025-01-05", 4800],
  ["INV-1002", "مؤسسة الأفق للتقنية", "2025-01-08", 2450],
  ["INV-1003", "مصنع البحر للمعادن", "2025-01-12", 7300],
  ["INV-1004", "دار الصرح للطباعة", "2025-01-15", 1150],
  ["INV-1005", "شركة المدى للخدمات", "2025-01-19", 3600]
];

function downloadTemplateXLSX() {
  var data = [TEMPLATE_HEADERS].concat(TEMPLATE_ROWS);
  var ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 14 }, { wch: 30 }, { wch: 12 }, { wch: 12 }];
  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "الفواتير");
  XLSX.writeFile(wb, "نموذج-الفحص-ديوان-المراجع.xlsx");
}

function downloadTemplateCSV() {
  var lines = [TEMPLATE_HEADERS.join(",")];
  for (var i = 0; i < TEMPLATE_ROWS.length; i++) lines.push(TEMPLATE_ROWS[i].join(","));
  var csv = "\uFEFF" + lines.join("\n");
  var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "نموذج-الفحص.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ═══════════ تجهيز الميزات ═══════════ */
function buildFeatures(rows) {
  var feats = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    feats.push([
      r.amount,
      Math.log1p(r.amount),
      Math.floor(Math.log10(Math.max(r.amount, 1))) + 1,
      (r.amount % 1 > 0) ? 1 : 0
    ]);
  }
  return feats;
}

function standardize(rows) {
  var feats = buildFeatures(rows);
  var dim = feats[0].length;
  var means = [], stds = [];
  for (var j = 0; j < dim; j++) {
    var col = feats.map(function (f) { return f[j]; });
    means.push(mean(col));
    stds.push(std(col) + 1e-9);
  }
  return feats.map(function (f) {
    return f.map(function (v, j) { return (v - means[j]) / stds[j]; });
  });
}

/* ═══════════ الخوارزمية 1: غابة العزل Isolation Forest ═══════════ */
function iTree(data, depth, maxDepth) {
  if (data.length <= 1 || depth >= maxDepth) return { size: data.length };
  var cols = Object.keys(data[0]).filter(function (k) { return typeof data[0][k] === "number"; });
  var col = cols[Math.floor(Math.random() * cols.length)];
  var vals = data.map(function (r) { return r[col]; });
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min === max) return { size: data.length };
  var split = rand(min, max);
  return {
    split: split, col: col,
    left: iTree(data.filter(function (r) { return r[col] < split; }), depth + 1, maxDepth),
    right: iTree(data.filter(function (r) { return r[col] >= split; }), depth + 1, maxDepth)
  };
}

function pathLen(p, tree, d) {
  d = d || 0;
  if (tree.size !== undefined) {
    return d + (tree.size <= 1 ? 0 : 2 * (Math.log(tree.size - 1) + 0.5772));
  }
  return p[tree.col] < tree.split ? pathLen(p, tree.left, d + 1) : pathLen(p, tree.right, d + 1);
}

function isolationForest(rows, contamination, nTrees) {
  contamination = contamination || 0.08;
  nTrees = nTrees || 150;
  var feats = buildFeatures(rows).map(function (f, i) {
    var o = { idx: i };
    for (var j = 0; j < f.length; j++) o["f" + j] = f[j];
    return o;
  });
  var sub = Math.min(256, feats.length);
  var trees = [];
  for (var t = 0; t < nTrees; t++) {
    var s = [];
    for (var i = 0; i < sub; i++) s.push(feats[Math.floor(Math.random() * feats.length)]);
    trees.push(iTree(s, 0, Math.ceil(Math.log2(Math.max(2, sub)))));
  }
  var c = 2 * (Math.log(Math.max(1, sub - 1)) + 0.5772) - 2 * Math.max(1, sub - 1) / sub;
  var raw = feats.map(function (f) {
    var total = 0;
    for (var i = 0; i < trees.length; i++) total += pathLen(f, trees[i]);
    return Math.pow(2, -(total / trees.length) / c);
  });
  var sorted = raw.slice().sort(function (a, b) { return b - a; });
  var th = sorted[Math.max(0, Math.floor(contamination * sorted.length) - 1)] || 0.5;
  var min = Math.min.apply(null, raw), max = Math.max.apply(null, raw);
  return rows.map(function (r, i) {
    return {
      id: r.id, label: r.label, amount: r.amount,
      score: ((raw[i] - min) / (max - min + 1e-9)) * 100,
      flag: raw[i] >= th
    };
  });
}

/* ═══════════ الخوارزمية 2: التجميع K-Means ═══════════ */
function kmeans(points, k, maxIter) {
  maxIter = maxIter || 60;
  if (points.length < k) throw new Error("عدد الصفوف أقل من عدد المجموعات.");
  var used = {}, centroids = [];
  while (centroids.length < k) {
    var idx = Math.floor(Math.random() * points.length);
    if (!used[idx]) { used[idx] = true; centroids.push(points[idx].slice()); }
  }
  var labels = points.map(function () { return 0; });
  for (var it = 0; it < maxIter; it++) {
    var newLabels = points.map(function (p) {
      var best = 0, bestD = Infinity;
      for (var i = 0; i < centroids.length; i++) {
        var d = 0;
        for (var j = 0; j < p.length; j++) d += (centroids[i][j] - p[j]) * (centroids[i][j] - p[j]);
        if (d < bestD) { bestD = d; best = i; }
      }
      return best;
    });
    var same = true;
    for (var i = 0; i < labels.length; i++) { if (labels[i] !== newLabels[i]) { same = false; break; } }
    if (same) break;
    labels = newLabels;
    for (var c = 0; c < k; c++) {
      var cl = points.filter(function (_, j) { return labels[j] === c; });
      if (!cl.length) continue;
      centroids[c] = [];
      for (var j = 0; j < cl[0].length; j++) {
        centroids[c].push(mean(cl.map(function (p) { return p[j]; })));
      }
    }
  }
  return { labels: labels, centroids: centroids };
}

function kmeansAnomaly(rows, k) {
  k = k || 4;
  var feats = standardize(rows);
  k = Math.min(k, Math.max(2, Math.floor(rows.length / 3)));
  var result = kmeans(feats, k);
  var labels = result.labels, centroids = result.centroids;
  var sizes = [];
  for (var c = 0; c < k; c++) sizes.push(labels.filter(function (l) { return l === c; }).length);
  var dists = feats.map(function (p, i) {
    var d = 0;
    for (var j = 0; j < p.length; j++) d += (centroids[labels[i]][j] - p[j]) * (centroids[labels[i]][j] - p[j]);
    return Math.sqrt(d);
  });
  var dmax = Math.max.apply(null, dists.concat([1e-9]));
  var scores = dists.map(function (d, i) {
    var s = (d / dmax) * 100;
    if (sizes[labels[i]] / rows.length < 0.05) s = Math.min(100, s + 25);
    return s;
  });
  return { labels: labels, sizes: sizes, dists: dists, scores: scores, k: k };
}

/* ═══════════ الخوارزمية 3: الشبكات العصبية Autoencoder ═══════════ */
function autoencoderAnomaly(rows, epochs, lr) {
  epochs = epochs || 200;
  lr = lr || 0.05;
  var feats = standardize(rows);
  var nIn = feats[0].length, h1 = 8, h2 = 2;

  function mk(r, c) {
    var lim = Math.sqrt(6 / (r + c));
    var m = [];
    for (var i = 0; i < r; i++) {
      m.push([]);
      for (var j = 0; j < c; j++) m[i].push(rand(-lim, lim));
    }
    return m;
  }

  var W1 = mk(h1, nIn), b1 = new Array(h1).fill(0);
  var W2 = mk(h2, h1),  b2 = new Array(h2).fill(0);
  var W3 = mk(h1, h2),  b3 = new Array(h1).fill(0);
  var W4 = mk(nIn, h1), b4 = new Array(nIn).fill(0);

  function forward(x) {
    var a1 = [], a2 = [], a3 = [], out = [];
    for (var i = 0; i < h1; i++) { var s = b1[i]; for (var j = 0; j < nIn; j++) s += W1[i][j] * x[j]; a1.push(Math.tanh(s)); }
    for (var i = 0; i < h2; i++) { var s = b2[i]; for (var j = 0; j < h1; j++) s += W2[i][j] * a1[j]; a2.push(Math.tanh(s)); }
    for (var i = 0; i < h1; i++) { var s = b3[i]; for (var j = 0; j < h2; j++) s += W3[i][j] * a2[j]; a3.push(Math.tanh(s)); }
    for (var i = 0; i < nIn; i++) { var s = b4[i]; for (var j = 0; j < h1; j++) s += W4[i][j] * a3[j]; out.push(s); }
    return { a1: a1, a2: a2, a3: a3, out: out };
  }

  var N = feats.length;
  for (var e = 0; e < epochs; e++) {
    var gW1 = mk(h1, nIn).map(function (r) { return r.map(function () { return 0; }); });
    var gb1 = new Array(h1).fill(0);
    var gW2 = mk(h2, h1).map(function (r) { return r.map(function () { return 0; }); });
    var gb2 = new Array(h2).fill(0);
    var gW3 = mk(h1, h2).map(function (r) { return r.map(function () { return 0; }); });
    var gb3 = new Array(h1).fill(0);
    var gW4 = mk(nIn, h1).map(function (r) { return r.map(function () { return 0; }); });
    var gb4 = new Array(nIn).fill(0);

    for (var fi = 0; fi < feats.length; fi++) {
      var x = feats[fi];
      var f = forward(x);
      var d4 = f.out.map(function (o, i) { return 2 * (o - x[i]) / nIn; });
      for (var i = 0; i < nIn; i++) { gb4[i] += d4[i]; for (var j = 0; j < h1; j++) gW4[i][j] += d4[i] * f.a3[j]; }
      var d3 = f.a3.map(function (a, j) { var s = 0; for (var i = 0; i < nIn; i++) s += d4[i] * W4[i][j]; return (1 - a * a) * s; });
      for (var j = 0; j < h1; j++) { gb3[j] += d3[j]; for (var k = 0; k < h2; k++) gW3[j][k] += d3[j] * f.a2[k]; }
      var d2 = f.a2.map(function (a, k) { var s = 0; for (var j = 0; j < h1; j++) s += d3[j] * W3[j][k]; return (1 - a * a) * s; });
      for (var k = 0; k < h2; k++) { gb2[k] += d2[k]; for (var j = 0; j < h1; j++) gW2[k][j] += d2[k] * f.a1[j]; }
      var d1 = f.a1.map(function (a, j) { var s = 0; for (var k = 0; k < h2; k++) s += d2[k] * W2[k][j]; return (1 - a * a) * s; });
      for (var j = 0; j < h1; j++) { gb1[j] += d1[j]; for (var i = 0; i < nIn; i++) gW1[j][i] += d1[j] * x[i]; }
    }
    var st = lr / N;
    for (var i = 0; i < nIn; i++) { b4[i] -= st * gb4[i]; for (var j = 0; j < h1; j++) W4[i][j] -= st * gW4[i][j]; }
    for (var j = 0; j < h1; j++) { b3[j] -= st * gb3[j]; for (var k = 0; k < h2; k++) W3[j][k] -= st * gW3[j][k]; }
    for (var k = 0; k < h2; k++) { b2[k] -= st * gb2[k]; for (var j = 0; j < h1; j++) W2[k][j] -= st * gW2[k][j]; }
    for (var j = 0; j < h1; j++) { b1[j] -= st * gb1[j]; for (var i = 0; i < nIn; i++) W1[j][i] -= st * gW1[j][i]; }
  }

  var errs = feats.map(function (x) {
    var f = forward(x);
    var s = 0;
    for (var i = 0; i < nIn; i++) s += (f.out[i] - x[i]) * (f.out[i] - x[i]);
    return s / nIn;
  });
  var emin = Math.min.apply(null, errs), emax = Math.max.apply(null, errs);
  return errs.map(function (e) { return ((e - emin) / (emax - emin + 1e-9)) * 100; });
}

/* ═══════════ الفحص الموحّد: الخوارزميات الثلاث معًا ═══════════ */
function flagTop(scores, contamination) {
  var sorted = scores.slice().sort(function (a, b) { return b - a; });
  var th = sorted[Math.max(0, Math.floor(contamination * sorted.length) - 1)] || 101;
  return scores.map(function (v) { return v >= th; });
}

function tripleScan(records, contamination) {
  contamination = contamination || 0.08;
  var iso = isolationForest(records, contamination);
  var km = kmeansAnomaly(records, 4);
  var ae = autoencoderAnomaly(records);
  var kmFlag = flagTop(km.scores, contamination);
  var aeFlag = flagTop(ae, contamination);
  var amounts = records.map(function (r) { return r.amount; });
  var m = mean(amounts), s = std(amounts), med = median(amounts);

  var rows = records.map(function (r, i) {
    var votes = (iso[i].flag ? 1 : 0) + (kmFlag[i] ? 1 : 0) + (aeFlag[i] ? 1 : 0);
    var risk = Math.round(Math.min(100, iso[i].score * 0.40 + km.scores[i] * 0.30 + ae[i] * 0.30 + votes * 5));
    return {
      id: r.id, label: r.label, amount: r.amount,
      isoScore: Math.round(iso[i].score), isoFlag: iso[i].flag,
      kmScore: Math.round(km.scores[i]), kmFlag: kmFlag[i],
      cluster: km.labels[i] + 1, clusterSize: km.sizes[km.labels[i]],
      aeScore: Math.round(ae[i]), aeFlag: aeFlag[i],
      votes: votes, risk: risk,
      z: +(Math.abs(r.amount - m) / (s + 1e-9)).toFixed(2),
      median: med
    };
  });

  for (var i = 0; i < rows.length; i++) rows[i].reasons = explainRecord(rows[i]);
  rows.sort(function (a, b) { return b.risk - a.risk; });
  var isolated = rows.filter(function (r) { return r.votes >= 2 || r.risk >= 70; });
  return { rows: rows, isolated: isolated, clusters: km.sizes, k: km.k, n: records.length, total: sum(amounts) };
}

/* ═══════════ محرك قابلية التفسير ═══════════ */
function explainRecord(r) {
  var reasons = [];
  var ratio = r.amount / (r.median || 1);
  if (r.isoFlag) reasons.push("غابة العزل: درجة عزل " + r.isoScore + "٪ — العملية بعيدة عن السلوك العام للسجل.");
  if (r.aeFlag) reasons.push("الشبكة العصبية: خطأ إعادة بناء " + r.aeScore + "٪ — نمط غير مألوف عجزت الشبكة عن تمثيله.");
  if (r.kmFlag) reasons.push("التجميع K-Means: تقع في المجموعة " + r.cluster + " الصغيرة (" + r.clusterSize + " عمليات فقط) وبعيدة عن مركزها بدرجة " + r.kmScore + "٪.");
  if (ratio >= 3) reasons.push("المبلغ " + fmt(r.amount, 0) + " يبلغ " + ratio.toFixed(1) + " ضعف وسيط السجل.");
  else if (ratio <= 0.15) reasons.push("المبلغ " + fmt(r.amount, 2) + " أدنى بكثير من وسيط السجل (" + fmt(r.median, 0) + ").");
  if (r.z >= 3) reasons.push("انحراف إحصائي شديد: Z = " + r.z + " عن متوسط السجل.");
  if (!reasons.length) reasons.push("ضمن النمط الطبيعي للسجل — لم ترصدها الخوارزميات.");
  return reasons;
}

/* ═══════════ مصدّرات التقارير ═══════════ */
function exportWord(title, bodyHtml) {
  var html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + title + '</title>' +
    '<style>body{font-family:Cairo,Segoe UI,Tahoma,sans-serif;direction:rtl;color:#2E3745;font-size:13px}' +
    'h1{color:#0B1F3F;border-bottom:3px solid #0B1F3F;padding-bottom:8px}' +
    'h2{color:#12305B;margin-top:22px}' +
    'table{width:100%;border-collapse:collapse;margin:12px 0}' +
    'th{background:#0B1F3F;color:#fff;padding:7px 10px;font-size:12px;text-align:right}' +
    'td{border:1px solid #C9D1DC;padding:6px 10px;font-size:12px}' +
    'tr.hit td{background:#EEF2F8}.meta{color:#5A6478;font-size:12px}.sig{margin-top:40px}</style>' +
    '</head><body><h1>' + title + '</h1>' +
    '<p class="meta">ديوان المُراجِع — ' + AUDITOR.name + '، ' + AUDITOR.title + ' · تاريخ التقرير: ' + todayAr() + '</p>' +
    bodyHtml +
    '<div class="sig"><b>' + AUDITOR.name + '</b><br>' + AUDITOR.title + '<br><br>التوقيع: .........................</div>' +
    '</body></html>';
  var blob = new Blob(["\ufeff" + html], { type: "application/msword" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = title.replace(/[^\u0600-\u06FFa-zA-Z0-9- ]/g, "") + ".doc";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportExcel(filename, sheets) {
  var wb = XLSX.utils.book_new();
  for (var i = 0; i < sheets.length; i++) {
    var ws = XLSX.utils.aoa_to_sheet(sheets[i].rows);
    if (sheets[i].widths) ws["!cols"] = sheets[i].widths.map(function (w) { return { wch: w }; });
    XLSX.utils.book_append_sheet(wb, ws, sheets[i].name);
  }
  XLSX.writeFile(wb, filename);
}

/* ═══════════ قانون بنفور ═══════════ */
function benfordLaw(amounts) {
  var ints = amounts.map(function (a) { return Math.abs(Math.floor(a)); }).filter(function (a) { return a > 0; });
  if (ints.length < 30) throw new Error("قانون بنفور يحتاج ٣٠ رقمًا على الأقل لنتيجة يُعتد بها.");
  var obs = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  ints.map(function (n) { return +String(n)[0]; }).forEach(function (d) { if (d >= 1 && d <= 9) obs[d - 1]++; });
  obs = obs.map(function (v) { return v / ints.length; });
  var exp = [];
  for (var i = 1; i <= 9; i++) exp.push(Math.log10(1 + 1 / i));
  var mad = 0;
  for (var i = 0; i < 9; i++) mad += Math.abs(obs[i] - exp[i]);
  mad /= 9;
  var grade, verdict;
  if (mad < 0.006) { grade = "ok"; verdict = "توافق ممتاز مع القانون — لا مؤشرات على تلاعب"; }
  else if (mad < 0.012) { grade = "ok"; verdict = "توافق مقبول — الوضع طبيعي إجمالًا"; }
  else if (mad < 0.015) { grade = "warn"; verdict = "توافق ضعيف — يُنصح بفحص استقصائي"; }
  else { grade = "bad"; verdict = "انحراف جوهري عن القانون — يلزم فحص موسّع"; }
  return { obs: obs, exp: exp, mad: mad, grade: grade, verdict: verdict, n: ints.length };
}

/* ═══════════ كشف التكرارات ═══════════ */
function findDuplicates(records) {
  var byNum = {}, byPair = {}, byAmt = {};
  records.forEach(function (r) {
    if (!byNum[r.id]) byNum[r.id] = [];
    byNum[r.id].push(r);
    var pk = r.label + "|" + r.amount;
    if (!byPair[pk]) byPair[pk] = [];
    byPair[pk].push(r);
    if (!byAmt[r.amount]) byAmt[r.amount] = [];
    byAmt[r.amount].push(r);
  });
  return {
    dupNum: Object.keys(byNum).map(function (k) { return byNum[k]; }).filter(function (g) { return g.length > 1; }),
    dupPair: Object.keys(byPair).map(function (k) { return byPair[k]; }).filter(function (g) { return g.length > 1; }),
    dupAmt: Object.keys(byAmt).map(function (k) { return byAmt[k]; }).filter(function (g) { return g.length > 2; })
  };
}

function seqGaps(records) {
  var nums = records.map(function (r) { return parseInt(String(r.id).replace(/\D/g, ""), 10); })
    .filter(function (n) { return !isNaN(n); }).sort(function (a, b) { return a - b; });
  if (nums.length < 3) return [];
  var gaps = [];
  for (var i = 1; i < nums.length; i++) {
    if (nums[i] - nums[i - 1] > 1) gaps.push({ from: nums[i - 1], to: nums[i], missing: nums[i] - nums[i - 1] - 1 });
  }
  return gaps.slice(0, 20);
}

/* ═══════════ العيّنات ═══════════ */
function simpleSample(N, n) {
  var s = {};
  while (Object.keys(s).length < n) s[1 + Math.floor(Math.random() * N)] = true;
  return Object.keys(s).map(Number).sort(function (a, b) { return a - b; });
}

function systematicSample(N, n) {
  var k = Math.max(1, Math.floor(N / n));
  var start = 1 + Math.floor(Math.random() * k);
  var sel = [];
  for (var i = start; i <= N && sel.length < n; i += k) sel.push(i);
  return { sel: sel, k: k, start: start };
}

function musSample(amounts, n) {
  var total = sum(amounts), interval = total / n, r0 = Math.random() * interval;
  var points = [];
  for (var i = 0; i < n; i++) points.push(r0 + i * interval);
  var cum = 0, pi = 0, picks = [];
  for (var p = 0; p < points.length; p++) {
    while (pi < amounts.length - 1 && cum + amounts[pi] < points[p]) { cum += amounts[pi]; pi++; }
    if (!picks.length || picks[picks.length - 1].idx !== pi) {
      picks.push({ idx: pi, amount: amounts[pi], id: String(pi + 1), label: "مفردة " + (pi + 1) });
    }
  }
  return { picks: picks, total: total, interval: interval };
}

/* ═══════════ القائمة النشطة ═══════════ */
document.addEventListener("DOMContentLoaded", function () {
  var path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".side nav a").forEach(function (a) {
    var href = a.getAttribute("href").split("/").pop();
    if (href === path) a.classList.add("active");
    else a.classList.remove("active");
  });
});

/* ═══════════ التصدير النهائي ═══════════ */
window.AuditorTools = {
  AUDITOR: AUDITOR,
  fmt: fmt, todayAr: todayAr, riskLevel: riskLevel,
  sum: sum, mean: mean, std: std, median: median,
  demoData: demoData,
  readWorkbook: readWorkbook, parseCSV: parseCSV, normalizeRecords: normalizeRecords,
  downloadTemplateXLSX: downloadTemplateXLSX, downloadTemplateCSV: downloadTemplateCSV,
  isolationForest: isolationForest, kmeansAnomaly: kmeansAnomaly,
  autoencoderAnomaly: autoencoderAnomaly, tripleScan: tripleScan,
  explainRecord: explainRecord, exportWord: exportWord, exportExcel: exportExcel,
  benfordLaw: benfordLaw, findDuplicates: findDuplicates, seqGaps: seqGaps,
  simpleSample: simpleSample, systematicSample: systematicSample, musSample: musSample
};
console.log("✅ تم التحميل — sum:", typeof sum, "— tripleScan:", typeof tripleScan);
  AUDITOR: AUDITOR,
  fmt: fmt,
  todayAr: todayAr,
  riskLevel: riskLevel,
  sum: sum,
  mean: mean,
  std: std,
  median: median,
  demoData: demoData,
  readWorkbook: readWorkbook,
  parseCSV: parseCSV,
  normalizeRecords: normalizeRecords,
  downloadTemplateXLSX: downloadTemplateXLSX,
  downloadTemplateCSV: downloadTemplateCSV,
  isolationForest: isolationForest,
  kmeansAnomaly: kmeansAnomaly,
  autoencoderAnomaly: autoencoderAnomaly,
  tripleScan: tripleScan,
  explainRecord: explainRecord,
  exportWord: exportWord,
  exportExcel: exportExcel,
  benfordLaw: benfordLaw,
  findDuplicates: findDuplicates,
  seqGaps: seqGaps,
  simpleSample: simpleSample,
  systematicSample: systematicSample,
  musSample: musSample
};

console.log("✅ ديوان المُراجِع — تم تحميل جميع الخوارزميات بنجاح (tripleScan + sum جاهزان)");

console.log("✅ ديوان المُراجِع — تم تحميل جميع الخوارزميات بنجاح (tripleScan جاهز)");