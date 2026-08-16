/* ═══════════════════════════════════════════════════════
   app.js — الواجهة، قراءة الملفات، السمات، XAI، التصدير
   إعداد الباحث: محمود الباز فوزي قابيل — بحث علمي فقط
   ═══════════════════════════════════════════════════════ */
"use strict";

/* ── أدوات عامة ─────────────────────────────── */
const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, dec = 2) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: dec }).format(+n || 0);
const todayStr = () => { const d = new Date(); const p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; };
const ddmmyyyy = d => { const p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; };

/* حالة النظام */
let RAW = { rows: [], source: '' };
let FEAT = null, STD = null, RES = null;
let activeTab = 'iso';
const memos = {};
const VAT = 0.14;

/* الرؤوس المتوقعة وتطبيع المفاتيح */
const normKey = s => String(s).replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[\s_\-\.]/g,'')
  .replace(/[\u064B-\u0652\u0640]/g,'').toLowerCase();
const ALIASES = {
  serial:['مسلسل','م','serial','no','id','row'],
  details:['تفاصيل','الوصف','تفاصيلالفاتوره','details','description'],
  docType:['نوعالمستند','النوع','doctype','type'],
  docVersion:['نسخهالمستند','النسخه','docversion','version'],
  status:['الحاله','حاله','status'],
  issueDate:['تاريخالاصدار','اصدار','issuedate','issue','date'],
  submitDate:['تاريخالتقديم','تقديم','submitdate','submissiondate','submit'],
  currency:['عملهالفاتوره','العمله','currency'],
  amount:['قيمهالفاتوره','القيمه','amount','value','totalvalue'],
  vat:['ضريبهالقيمهالمضافه','الضريبه','ضريبه','vat','tax'],
  total:['اجماليالفاتوره','الاجمالي','اجمالي','total','grandtotal'],
  internalNo:['الرقمالداخلي','internalno','internal','refno'],
  electronicNo:['الرقمالالكتروني','electronicno','eno','uuid','eid']
};
const HEADERS_AR = ['مسلسل','تفاصيل','نوع المستند','نسخة المستند','الحالة','تاريخ الإصدار','تاريخ التقديم','عملة الفاتورة','قيمة الفاتورة','ضريبة القيمة المضافة','إجمالى الفاتورة','الرقم الداخلى','الرقم الإلكترونى'];

/* ── السجل والتنبيهات ───────────────────────── */
function log(msg, cls = '') {
  const c = $('#console'), t = new Date().toTimeString().slice(0, 8);
  c.insertAdjacentHTML('beforeend', `<p class="${cls}"><span class="t">[${t}]</span>${esc(msg)}</p>`);
  c.scrollTop = c.scrollHeight;
}
function toast(msg, err = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (err ? ' err' : '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ── تحويل القيم ────────────────────────────── */
function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).replace(/[٬,\s]/g, '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))
    .replace('٫', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000)   // رقم تاريخ Excel
    return new Date(Math.round((v - 25569) * 864e5));
  const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  const d = new Date(v); return isNaN(d) ? null : d;
}
function normStatus(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('invalid') || s.includes('باطل') || s.includes('مرفوض')) return 'Invalid';
  if (s.includes('cancel')  || s.includes('ملغ')) return 'Cancelled';
  return 'Valid';
}

/* ── قراءة ملف JSON ─────────────────────────── */
function rowFromDict(src) {
  const dict = {};
  for (const k in src) { const nk = normKey(k); if (!(nk in dict)) dict[nk] = src[k]; }
  const pick = f => { for (const a of ALIASES[f]) if (a in dict && dict[a] !== '') return dict[a]; return ''; };
  return {
    serial: pick('serial'), details: pick('details'), docType: pick('docType'),
    docVersion: pick('docVersion'), status: normStatus(pick('status')),
    issueDate: parseDate(pick('issueDate')), submitDate: parseDate(pick('submitDate')),
    issueRaw: pick('issueDate'), submitRaw: pick('submitDate'),
    currency: String(pick('currency') || 'EGP').toUpperCase(),
    amount: parseNum(pick('amount')), vat: parseNum(pick('vat')), total: parseNum(pick('total')),
    internalNo: String(pick('internalNo')), electronicNo: String(pick('electronicNo'))
  };
}
function parseJson(text) {
  const obj = JSON.parse(text);
  const arr = Array.isArray(obj) ? obj : (obj.invoices || obj.rows || obj.data || []);
  if (!Array.isArray(arr) || !arr.length) throw new Error('ملف JSON لا يحتوي مصفوفة فواتير');
  return arr.map(rowFromDict);
}

/* ── قراءة شيت Excel ────────────────────────── */
function parseWorkbook(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  // ابحث عن صف الرؤوس في أول ٦ صفوف
  let hIdx = -1, colMap = null;
  for (let r = 0; r < Math.min(6, aoa.length); r++) {
    const norm = aoa[r].map(normKey);
    const map = {};
    for (const f in ALIASES) {
      const ci = norm.findIndex(nk => ALIASES[f].includes(nk));
      if (ci >= 0) map[f] = ci;
    }
    if (map.serial !== undefined && map.electronicNo !== undefined) { hIdx = r; colMap = map; break; }
  }
  if (hIdx < 0) {   // محاولة مواضع قياسية
    if (aoa[0].length >= 12) {
      hIdx = 0; colMap = {};
      Object.keys(ALIASES).forEach((f, i) => colMap[f] = i);
      log('تعذر التعرف التلقائي على الرؤوس — تم اعتماد الترتيب الموضعي القياسي', 'lg-warn');
    } else throw new Error('لم يُعثر على صف الرؤوس المتوقع (مسلسل، تفاصيل، …)');
  } else {
    log(`تم التعرف على صف الرؤوس في السطر ${hIdx + 1} — ${Object.keys(colMap).length} عمودًا مطابقًا`, 'lg-ok');
  }
  const rows = [];
  for (let r = hIdx + 1; r < aoa.length; r++) {
    const cells = aoa[r];
    if (!cells || cells.every(c => c === '' || c == null)) continue;
    const get = f => colMap[f] !== undefined ? cells[colMap[f]] : '';
    rows.push(rowFromDict(Object.fromEntries(Object.keys(colMap).map(f => [f, get(f)]))));
  }
  if (!rows.length) throw new Error('الشيت لا يحتوي بيانات بعد صف الرؤوس');
  return rows;
}

/* ── بناء السمات والقواعد القطعية ───────────── */
function buildFeatures(rows) {
  const n = rows.length;
  const cntInt = {}, cntEno = {};
  rows.forEach(r => {
    if (r.internalNo) cntInt[r.internalNo] = (cntInt[r.internalNo] || 0) + 1;
    if (r.electronicNo) cntEno[r.electronicNo] = (cntEno[r.electronicNo] || 0) + 1;
  });
  const meta = [], M = [];
  rows.forEach((r, i) => {
    const rate = r.amount > 0 ? r.vat / r.amount : (r.vat > 0 ? 1 : 0);
    const mismatch = Math.abs((r.amount + r.vat) - r.total);
    const mismatchRel = r.total > 0 ? Math.min(1, mismatch / r.total) : (mismatch > 1 ? 1 : 0);
    const delay = r.issueDate && r.submitDate ? Math.round((r.submitDate - r.issueDate) / 864e5) : 0;
    const dupInt = r.internalNo && cntInt[r.internalNo] > 1;
    const dupEno = r.electronicNo && cntEno[r.electronicNo] > 1;
    const round = r.amount >= 1000 && r.amount % 1000 === 0;
    let lead = 1; { let a = Math.abs(r.amount); while (a >= 10) a /= 10; lead = Math.floor(a) || 1; }
    const dt = /دائن|credit/i.test(r.docType) ? 2 : /مدين|debit/i.test(r.docType) ? 3 : /فاتور|invoice/i.test(r.docType) ? 1 : 0;
    const st = r.status === 'Invalid' ? 1 : r.status === 'Cancelled' ? 2 : 0;

    Object.assign(r, { _i: i, rate, mismatch, mismatchRel, delay, dupInt, dupEno, round });
    meta.push(r);
    M.push([
      Math.log10(Math.max(0, r.amount) + 1), rate, mismatchRel,
      Math.log1p(Math.max(0, Math.min(365, delay))), delay < 0 ? 1 : 0,
      lead / 9, dt / 3, st / 2, Math.min(3, parseNum(r.docVersion) || 1) / 3,
      r.currency !== 'EGP' ? 1 : 0, round ? 1 : 0, dupInt ? 1 : 0, dupEno ? 1 : 0
    ]);
  });
  return { M, meta };
}

/* القواعد القطعية: تُعزل مهما قالت النماذج */
function hardFlags(r) {
  const out = [];
  if (r.mismatchRel > 0.005 && r.mismatch > 1)
    out.push({ t: `فرق تسوية ${fmt(r.mismatch)} ${r.currency} بين مجموع (القيمة+الضريبة) والإجمالى المُصدر`, w: 3, hard: 1 });
  if (r.dupEno) out.push({ t: `تكرار الرقم الإلكترونى ${r.electronicNo} داخل مجتمع الفحص`, w: 3, hard: 1 });
  if (r.delay < 0) out.push({ t: `تاريخ التقديم (${ddmmyyyy(r.submitDate)}) سابق لتاريخ الإصدار (${ddmmyyyy(r.issueDate)})`, w: 3, hard: 1 });
  if (r.amount > 500 && Math.abs(r.rate - VAT) > 0.04)
    out.push({ t: `انحراف نسبة الضريبة المحتسبة (${(r.rate * 100).toFixed(1)}٪) عن النسبة المقررة 14٪`, w: 2.6, hard: 1 });
  return out;
}

/* أسباب إضافية بصياغة مهنية */
function buildReasons(i, km) {
  const r = FEAT.meta[i], z = STD.Z[i], out = hardFlags(r);
  if (Math.abs(r.rate - VAT) > 0.02 && !out.some(o => o.t.includes('نسبة الضريبة')))
    out.push({ t: `نسبة الضريبة ${(r.rate * 100).toFixed(1)}٪ تبتعد عن المعدل القياسى — تستحق مراجعة المعاملة الضريبية`, w: 2 });
  if (z[0] > 2.2) out.push({ t: `قيمة الفاتورة (${fmt(r.amount)}) تقع فى الذيل الأعلى لتوزيع المجتمع`, w: 1.8 });
  if (z[0] < -2.2) out.push({ t: `قيمة الفاتورة (${fmt(r.amount)}) أدنى بشكل غير معتاد من متوسط المجتمع`, w: 1.6 });
  if (r.delay > 18) out.push({ t: `فجوة ${r.delay} يومًا بين تاريخى الإصدار والتقديم تتجاوز النطاق المعتاد`, w: 1.7 });
  if (r.dupInt) out.push({ t: `تكرار الرقم الداخلى ${r.internalNo} فى أكثر من قيد`, w: 1.9 });
  if (r.round) out.push({ t: `قيمة مستديرة (${fmt(r.amount)}) على غير النمط المعتاد للمستندات`, w: 1 });
  if (r.status !== 'Valid') out.push({ t: `حالة المستند «${r.status}» — تستلزم التحقق من السريان قبل الاعتماد`, w: 1.4 });
  if (km && km.sizes[km.labels[i]] <= Math.max(2, Math.floor(FEAT.meta.length * 0.04)))
    out.push({ t: `تنتمى الفاتورة إلى عنقود ضيق (${km.sizes[km.labels[i]]} فواتير) معزول عن باقى المجتمع`, w: 1.5 });
  if (!out.length) out.push({ t: `درجة اشتباه مركبة مرتفعة من إجماع المحركات الثلاثة دون سبب قطعى واحد — تُراجع مستنديًا`, w: 1 });
  return out.sort((a, b) => b.w - a.w).slice(0, 5);
}

/* ── واجهة خط السير ─────────────────────────── */
function setStage(i, state, metric) {
  const li = $(`#stages li[data-st="${i}"]`);
  if (!li) return;
  li.classList.toggle('active', state === 'active');
  li.classList.toggle('done', state === 'done');
  if (metric !== undefined) li.querySelector('.s-m').textContent = metric;
}
function setProg(p) { $('#progBar').style.width = p + '%'; }

/* ── تشغيل الفحص ────────────────────────────── */
async function run() {
  if (!RAW.rows.length) return toast('ارفع ملفًا أولًا', true);
  const enabled = $$('.alg input').filter(c => c.checked).map(c => c.dataset.alg);
  if (!enabled.length) return toast('فعّل محركًا واحدًا على الأقل', true);
  if (typeof XLSX === 'undefined') return toast('تعذر تحميل مكتبة SheetJS — تحقق من الاتصال ثم أعد التحميل', true);

  const cont = +$('#optCont').value, rpct = +$('#optRand').value,
        seed = +$('#optSeed').value || 1, excl = $('#optExcl').checked;
  const n = RAW.rows.length, rng = ML.mulberry32(seed);

  $('#btnStart').disabled = true;
  $('#btnStart').textContent = 'جارٍ الفحص…';
  $('#led').classList.add('busy'); $('#ledTxt').textContent = 'الفحص قيد التشغيل';
  $$('#stages li').forEach(li => { li.classList.remove('active', 'done'); li.querySelector('.s-m').textContent = '—'; });
  setProg(4);
  log(`بدء الفحص: ${n} فاتورة · عزل ${cont}٪ · عينة ${rpct}٪ · seed=${seed}`, 'lg-gold');

  try {
    /* ١ السمات */
    setStage(0, 'active'); await sleep(220);
    FEAT = buildFeatures(RAW.rows);
    setStage(0, 'done', `${n} صفًا · 13 سمة`); setProg(14);
    log(`تم استخراج 13 سمة عددية + 4 فحوص قواعدية`, 'lg-dim');

    /* ٢ التطبيع */
    setStage(1, 'active'); await sleep(200);
    STD = ML.zscore(FEAT.M);
    setStage(1, 'done', 'Z-score'); setProg(24);

    /* ٣ غابة العزل */
    let ifS = null;
    if (enabled.includes('iforest')) {
      setStage(2, 'active'); await sleep(60);
      const t0 = performance.now();
      ifS = ML.isolationForest(STD.Z, { trees: 120, sub: 256, rng });
      setStage(2, 'done', `${((performance.now() - t0) / 1000).toFixed(1)} ث`);
      log(`غابة العزل: 120 شجرة، عمق أقصى ${Math.ceil(Math.log2(Math.min(256, n) + 1))}`, 'lg-dim');
    } else setStage(2, 'done', 'معطَّل');
    setProg(40); await sleep(120);

    /* ٤ التجميع */
    let km = null, kmS = null;
    if (enabled.includes('kmeans')) {
      setStage(3, 'active'); await sleep(60);
      const k = Math.max(3, Math.min(8, Math.round(Math.sqrt(n / 3))));
      km = ML.kmeans(STD.Z, k, rng);
      kmS = ML.kmeansScores(km, n);
      setStage(3, 'done', `k=${k}`);
      log(`التجميع: ${k} عناقيد، أصغرها ${Math.min(...km.sizes)} فواتير`, 'lg-dim');
    } else setStage(3, 'done', 'معطَّل');
    setProg(56); await sleep(120);

    /* ٥ الشبكة العصبية */
    let nnS = null, loss = 0;
    if (enabled.includes('nn')) {
      setStage(4, 'active'); await sleep(60);
      const ae = ML.trainAutoencoder(STD.Z, { hidden: 4, rng });
      nnS = ae.scores; loss = ae.avgLoss;
      setStage(4, 'done', `خطأ ${loss.toFixed(3)}`);
      log(`الشبكة العصبية: قارورة 13→4→13، متوسط خطأ إعادة البناء ${loss.toFixed(4)}`, 'lg-dim');
    } else setStage(4, 'done', 'معطَّل');
    setProg(72); await sleep(120);

    /* ٦ الدمج والتفسير */
    setStage(5, 'active'); await sleep(150);
    const parts = [], weights = [];
    if (ifS) { parts.push(ML.minmax(ifS)); weights.push(0.4); }
    if (kmS) { parts.push(ML.minmax(kmS)); weights.push(0.3); }
    if (nnS) { parts.push(ML.minmax(nnS)); weights.push(0.3); }
    const wSum = weights.reduce((a, b) => a + b, 0);
    const comp = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let p = 0; p < parts.length; p++) comp[i] += parts[p][i] * weights[p] / wSum;

    // مجموعة العزل: أعلى نسبة + القواعد القطعية
    const iso = new Set(), order = [...Array(n).keys()].sort((a, b) => comp[b] - comp[a]);
    let cut = 0;
    for (let i = 0; i < Math.min(Math.ceil(n * cont / 100), n); i++) { iso.add(order[i]); cut = comp[order[i]]; }
    let hardCount = 0;
    FEAT.meta.forEach((r, i) => { if (hardFlags(r).length) { if (!iso.has(i)) hardCount++; iso.add(i); } });
    const reasons = new Map();
    [...iso].forEach(i => reasons.set(i, buildReasons(i, km)));

    // توافق الخوارزميات
    let agree = 0;
    const normParts = parts;
    [...iso].forEach(i => {
      let c = 0; normParts.forEach(p => { if (p[i] >= 0.55) c++; });
      if (normParts.length === 1 || c >= 2) agree++;
    });
    const cons = iso.size ? Math.round(100 * agree / iso.size) : 0;
    setStage(5, 'done', `عزل ${iso.size}`);
    log(`الدمج الترجيحي: ${iso.size} فاتورة معزولة (منها ${hardCount} بقواعد قطعية)`, 'lg-warn');
    setProg(86); await sleep(120);

    /* ٧ العينة العشوائية والتقرير */
    setStage(6, 'active'); await sleep(150);
    const rng2 = ML.mulberry32(seed + 7);
    const pool = [...Array(n).keys()].filter(i => !(excl && iso.has(i)));
    const kSample = Math.min(pool.length, Math.ceil(n * rpct / 100));
    ML.shuffle(pool, rng2);
    const rand = new Set(pool.slice(0, kSample));
    setStage(6, 'done', `n=${kSample}`);
    setProg(100);
    log(`العينة العشوائية: ${kSample} فاتورة (${rpct}٪) وفق معيار المراجعة المصرى 530 — seed=${seed}`, 'lg-ok');
    log('اكتمل الفحص. النتائج جاهزة أدناه ▼', 'lg-gold');

    RES = { comp, ifS: ifS && ML.minmax(ifS), kmS: kmS && ML.minmax(kmS),
            nnS: nnS && ML.minmax(nnS), iso, rand, reasons, cons, km,
            params: { cont, rpct, seed, excl, enabled, threshold: cut, date: todayStr() },
            maxScore: Math.max(...comp) };
    renderResults();
  } catch (e) {
    log('خطأ: ' + e.message, 'lg-err'); toast(e.message, true);
  } finally {
    $('#btnStart').disabled = false;
    $('#btnStart').textContent = 'بدء عملية الاختبار ◀';
    $('#led').classList.remove('busy'); $('#ledTxt').textContent = 'النظام جاهز';
  }
}

/* ── عرض النتائج ────────────────────────────── */
function countTo(el, val, suf = '', dec = 0) {
  const t0 = performance.now(), dur = 750;
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(val * e, dec) + suf;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderResults() {
  const n = FEAT.meta.length, P = RES.params;
  $('#results').hidden = false;
  countTo($('#statTotal'), n); countTo($('#statIso'), RES.iso.size);
  countTo($('#statRand'), RES.rand.size);
  countTo($('#statRate'), 100 * RES.iso.size / n, '٪', 1);
  countTo($('#statCons'), RES.cons, '٪');
  countTo($('#statTop'), RES.maxScore * 100, '', 1);
  $('#runNote').textContent = `المصدر: ${RAW.source} · نسبة العزل المستهدفة ${P.cont}٪ · العينة ${P.rpct}٪ · البذرة ${P.seed} · المحركات: ${P.enabled.map(a=>({iforest:'غابة العزل',kmeans:'التجميع',nn:'الشبكة العصبية'}[a])).join(' + ')} · ${P.date}`;
  $('#cntIso').textContent = RES.iso.size;
  $('#cntRand').textContent = RES.rand.size;
  $('#cntAll').textContent = n;
  requestAnimationFrame(() => { drawHist(); drawScat(); renderTable(); });
  setTimeout(() => $('#results').scrollIntoView({ behavior: 'smooth' }), 350);
}

/* ── الرسوم على Canvas ──────────────────────── */
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 240;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  return { ctx, w, h };
}
let histBins = [], scatPts = [];

function drawHist() {
  const cv = $('#histCanvas'); if (!cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv);
  const B = 24, counts = new Array(B).fill(0);
  RES.comp.forEach(s => counts[Math.min(B - 1, Math.floor(s * B))]++);
  const thr = RES.params.threshold || .5, mx = Math.max(...counts, 1);
  const L = 34, R = 12, T = 16, Bm = 26, pw = w - L - R, ph = h - T - Bm;
  ctx.clearRect(0, 0, w, h); histBins = [];
  for (let b = 0; b < B; b++) {
    const bh = counts[b] / mx * ph, x = L + b / B * pw, bw = pw / B - 2;
    ctx.fillStyle = (b + .5) / B >= thr ? '#c8912a' : '#177e58';
    ctx.globalAlpha = .9;
    ctx.fillRect(x, T + ph - bh, bw, bh);
    ctx.globalAlpha = 1;
    histBins.push({ x, w: bw, b, c: counts[b] });
  }
  ctx.strokeStyle = '#101d17'; ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(w - R, T + ph); ctx.stroke();
  const tx = L + thr * pw;
  ctx.strokeStyle = '#b23a30'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(tx, T - 4); ctx.lineTo(tx, T + ph); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#b23a30'; ctx.font = '11px IBM Plex Sans Arabic';
  ctx.textAlign = 'right'; ctx.fillText('حد العزل', tx - 5, T + 6);
  ctx.fillStyle = '#26352d'; ctx.textAlign = 'center';
  ctx.fillText('0', L, h - 8); ctx.fillText('درجة الاشتباه →  1', L + pw / 2, h - 8); ctx.fillText('1', L + pw, h - 8);
}
$('#histCanvas')?.addEventListener('mousemove', e => {
  const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, tip = $('#tipHist');
  const hit = histBins.find(bn => x >= bn.x && x <= bn.x + bn.w);
  if (hit && hit.c) {
    tip.style.display = 'block';
    tip.style.right = 'auto'; tip.style.left = (hit.x + hit.w / 2) + 'px'; tip.style.top = '10px';
    tip.textContent = `${Math.round(hit.b / 24 * 100)}–${Math.round((hit.b + 1) / 24 * 100)}٪ : ${hit.c} فاتورة`;
  } else tip.style.display = 'none';
});
$('#histCanvas')?.addEventListener('mouseleave', () => $('#tipHist').style.display = 'none');

function drawScat() {
  const cv = $('#scatCanvas'); if (!cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv);
  const L = 40, R = 14, T = 14, Bm = 26, pw = w - L - R, ph = h - T - Bm;
  const xs = FEAT.meta.map(r => Math.log10(r.amount + 1));
  const xmin = Math.min(...xs), xmax = Math.max(...xs) || 1;
  const ymax = Math.max(20, ...FEAT.meta.map(r => r.rate * 100)) + 3;
  const X = v => L + (v - xmin) / ((xmax - xmin) || 1) * pw;
  const Y = v => T + ph - v / ymax * ph;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(16,29,23,.15)';
  for (let g = 1; g < 5; g++) { ctx.beginPath(); ctx.moveTo(L, T + ph * g / 5); ctx.lineTo(w - R, T + ph * g / 5); ctx.stroke(); }
  ctx.strokeStyle = '#b23a30'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(L, Y(14)); ctx.lineTo(w - R, Y(14)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#b23a30'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'left';
  ctx.fillText('14%', w - R - 26, Y(14) - 4);
  scatPts = [];
  FEAT.meta.forEach((r, i) => {
    const px = X(xs[i]), py = Y(r.rate * 100), flagged = RES.iso.has(i);
    ctx.beginPath(); ctx.arc(px, py, flagged ? 5 : 3, 0, 7);
    ctx.fillStyle = flagged ? '#b23a30' : 'rgba(15,92,64,.45)'; ctx.fill();
    if (flagged) { ctx.strokeStyle = '#e0aa3e'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.lineWidth = 1; }
    scatPts.push({ x: px, y: py, i });
  });
  ctx.strokeStyle = '#101d17'; ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(w - R, T + ph); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.stroke();
  ctx.fillStyle = '#26352d'; ctx.font = '11px IBM Plex Sans Arabic'; ctx.textAlign = 'center';
  ctx.fillText(`قيمة الفاتورة (لوغاريتمى) — من ${fmt(10 ** xmin, 0)} إلى ${fmt(10 ** xmax, 0)}`, L + pw / 2, h - 8);
}
$('#scatCanvas')?.addEventListener('mousemove', e => {
  const r = e.target.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, tip = $('#tipScat');
  const hit = scatPts.find(p => (p.x - mx) ** 2 + (p.y - my) ** 2 < 110);
  if (hit) {
    const inv = FEAT.meta[hit.i];
    tip.style.display = 'block'; tip.style.left = hit.x + 'px'; tip.style.top = (hit.y - 34) + 'px';
    tip.textContent = `م${inv.serial} · ${fmt(inv.amount)} · ضريبة ${(inv.rate * 100).toFixed(1)}٪`;
  } else tip.style.display = 'none';
});
$('#scatCanvas')?.addEventListener('click', e => {
  const r = e.target.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = scatPts.find(p => (p.x - mx) ** 2 + (p.y - my) ** 2 < 140);
  if (hit) openDrawer(hit.i);
});

/* ── الجدول ─────────────────────────────────── */
function statusChip(r, i) {
  if (RES.iso.has(i)) return '<span class="chip c-red">معزولة</span>';
  if (RES.rand.has(i)) return '<span class="chip c-gold">عينة عشوائية</span>';
  return `<span class="chip ${r.status === 'Valid' ? 'c-teal' : 'c-gray'}">${r.status}</span>`;
}
function tableRows(tab, q = '') {
  let idx;
  if (tab === 'iso') idx = [...RES.iso].sort((a, b) => a - b);
  else if (tab === 'rand') idx = [...RES.rand].sort((a, b) => a - b);
  else idx = [...Array(FEAT.meta.length).keys()];
  if (q) {
    const s = q.toLowerCase();
    idx = idx.filter(i => {
      const r = FEAT.meta[i], rs = (RES.reasons.get(i) || []).map(o => o.t).join(' ');
      return [r.serial, r.details, r.internalNo, r.electronicNo, rs].join(' ').toLowerCase().includes(s);
    });
  }
  if (!idx.length) return `<tr class="empty-row"><td colspan="12">${tab === 'iso' ? 'لا توجد فواتير معزولة بهذه المعايير — مؤشر جيد على تجانس المجتمع' : 'لا توجد نتائج مطابقة'}</td></tr>`;
  return idx.map(i => {
    const r = FEAT.meta[i], s = RES.comp[i];
    const chips = (RES.reasons.get(i) || []).slice(0, 2)
      .map(o => `<span class="chip ${o.hard ? 'c-red' : 'c-gold'}">${esc(o.t.length > 46 ? o.t.slice(0, 46) + '…' : o.t)}</span>`).join(' ');
    return `<tr data-i="${i}" class="${RES.iso.has(i) ? 'iso-row' : RES.rand.has(i) ? 'rand-row' : ''}">
      <td class="num">${esc(r.serial)}</td>
      <td class="num" dir="ltr">${esc(r.electronicNo.slice(0, 18))}${r.electronicNo.length > 18 ? '…' : ''}</td>
      <td>${esc(String(r.details).slice(0, 34))}${String(r.details).length > 34 ? '…' : ''}</td>
      <td>${esc(r.docType)}</td>
      <td>${statusChip(r, i)}</td>
      <td class="num">${r.issueDate ? ddmmyyyy(r.issueDate) : '—'}</td>
      <td class="num">${fmt(r.amount)}</td>
      <td class="num">${fmt(r.vat)}</td>
      <td class="num">${fmt(r.total)}</td>
      <td class="score-cell"><span class="sb"><i style="width:${Math.round(s * 100)}%"></i></span> <b class="num">${(s * 100).toFixed(1)}٪</b></td>
      <td>${chips || '<span class="chip c-teal">سليمة</span>'}</td>
      <td><button class="mini-btn">تحليل</button></td>
    </tr>`;
  }).join('');
}
function renderTable() {
  $('#tblBody').innerHTML = tableRows(activeTab, $('#tblSearch').value.trim());
}
$('#tblBody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]');
  if (tr) openDrawer(+tr.dataset.i);
});
$$('.tab').forEach(b => b.addEventListener('click', () => {
  $$('.tab').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); activeTab = b.dataset.tab; renderTable();
}));
$('#tblSearch').addEventListener('input', renderTable);

/* ── درج التحليل XAI ────────────────────────── */
function openDrawer(i) {
  const r = FEAT.meta[i], P = RES.params;
  $('#drSerial').textContent = `${r.electronicNo || r.internalNo || 'م' + r.serial}`;
  $('#drScore').textContent = (RES.comp[i] * 100).toFixed(1) + '٪';
  const badges = [RES.iso.has(i) && '<span class="chip c-red">معزولة للتدقيق</span>',
                  RES.rand.has(i) && '<span class="chip c-gold">ضمن العينة العشوائية</span>',
                  hardFlags(r).length ? '<span class="chip c-red">قاعدة قطعية</span>' : '',
                  `<span class="chip c-gray">${r.status}</span>`].filter(Boolean).join('');
  $('#drBadges').innerHTML = badges;
  const gauges = [
    ['غابة العزل', RES.ifS, '#177e58'], ['التجميع K-Means', RES.kmS, '#c8912a'], ['Autoencoder', RES.nnS, '#b23a30']
  ];
  $('#drGauges').innerHTML = gauges.map(([nm, arr, c]) => arr
    ? `<div class="g"><span>${nm}</span><span class="track"><i data-w="${Math.round(arr[i] * 100)}" style="background:${c}"></i></span><span class="v num">${(arr[i] * 100).toFixed(0)}٪</span></div>`
    : `<div class="g"><span>${nm}</span><span class="track"><i></i></span><span class="v">معطَّل</span></div>`).join('');
  $('#drReasons').innerHTML = (RES.reasons.get(i) || [{ t: 'لا توجد أسباب عزل — الفاتورة ضمن النطاق المعتاد' }])
    .map(o => `<li>${esc(o.t)}${o.hard ? ' <span class="chip c-red">قطعي</span>' : ''}</li>`).join('');
  $('#drMeta').innerHTML = [
    ['الرقم الداخلى', r.internalNo || '—'], ['النوع', r.docType || '—'],
    ['الإصدار', r.issueDate ? ddmmyyyy(r.issueDate) : '—'], ['التقديم', r.submitDate ? ddmmyyyy(r.submitDate) : '—'],
    ['العملة', r.currency], ['النسبة المحتسبة', (r.rate * 100).toFixed(2) + '٪'],
    ['فرق التسوية', fmt(r.mismatch)], ['التفاصيل', String(r.details).slice(0, 40)]
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#drMemo').value = memos[i] || '';
  $('#drMemo').oninput = e => memos[i] = e.target.value;
  $('#drRec').textContent = RES.iso.has(i)
    ? `توصية: فحص المستند ${r.internalNo} مؤيدًا بالمستندات الأصلية، ومطابقة الضريبة المحتسبة، والتحقق من حالة الإعفاء/التسجيل.`
    : 'لا يلزم تدقيق إضافي خارج العينة النظامية.';
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#backdrop').hidden = false; requestAnimationFrame(() => {
    $('#backdrop').classList.add('show');
    $$('#drGauges .track i').forEach(el => el.style.width = el.dataset.w + '%');
  });
}
function closeDrawer() {
  $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
  $('#backdrop').classList.remove('show'); setTimeout(() => $('#backdrop').hidden = true, 300);
}
$('#drClose').addEventListener('click', closeDrawer);
$('#backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });

/* ── التصدير ────────────────────────────────── */
function isoSorted() { return [...RES.iso].sort((a, b) => a - b); }
function randSorted() { return [...RES.rand].sort((a, b) => a - b); }

function exportExcel() {
  if (!RES) return toast('شغّل الفحص أولًا', true);
  const H = [...HEADERS_AR, 'درجة الاشتباه ٪', 'أسباب العزل', 'نوع السبب', 'توصية المراجع', 'تعليق المراجع'];
  const rowOf = i => {
    const r = FEAT.meta[i];
    const rs = RES.reasons.get(i) || [];
    return [r.serial, r.details, r.docType, r.docVersion, r.status,
      r.issueDate ? ddmmyyyy(r.issueDate) : '', r.submitDate ? ddmmyyyy(r.submitDate) : '',
      r.currency, r.amount, r.vat, r.total, r.internalNo, r.electronicNo,
      +(RES.comp[i] * 100).toFixed(1), rs.map(o => o.t).join(' | '),
      rs.some(o => o.hard) ? 'قاعدة قطعية + نماذج' : 'نماذج غير مشرفة',
      RES.iso.has(i) ? 'تدقيق يدوي — مستندات مؤيدة ومطابقة ضريبية' : 'لا يلزم',
      memos[i] || ''];
  };
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet([
    ['مِرْصاد الفواتير — تقرير الفحص غير المُشرف'],
    ['إعداد الباحث', 'محمود الباز فوزي قابيل — لأغراض البحث العلمي فقط'],
    ['هاتف التواصل', '01067777481'], ['تاريخ الفحص', RES.params.date],
    ['المصدر', RAW.source], ['إجمالي المجتمع', FEAT.meta.length],
    ['الفواتير المعزولة', RES.iso.size], ['نسبة العزل المستهدفة', RES.params.cont + '٪'],
    ['العينة العشوائية', RES.rand.size + ' (' + RES.params.rpct + '٪ وفق معيار 530)'],
    ['البذرة Seed', RES.params.seed], ['توافق الخوارزميات', RES.cons + '٪'],
    ['المحركات', 'غابة العزل + K-Means + Autoencoder']
  ]);
  const s2 = XLSX.utils.aoa_to_sheet([H, ...isoSorted().map(rowOf)]);
  const s3 = XLSX.utils.aoa_to_sheet([H, ...randSorted().map(i => {
    const base = rowOf(i); base[15] = 'اختيار عشوائى — معيار المراجعة المصرى 530'; base[16] = 'مراجعة عينات'; return base;
  })]);
  s2['!views'] = s3['!views'] = [{ rightToLeft: true }];
  s1['!cols'] = [{ wch: 22 }, { wch: 55 }];
  s2['!cols'] = s3['!cols'] = H.map((h, c) => ({ wch: c === 14 ? 60 : c === 13 ? 16 : 14 }));
  XLSX.utils.book_append_sheet(wb, s1, 'ملخص الفحص');
  XLSX.utils.book_append_sheet(wb, s2, 'الفواتير المعزولة');
  XLSX.utils.book_append_sheet(wb, s3, 'العينة العشوائية');
  XLSX.writeFile(wb, `تقرير_مرصاد_الفواتير_${RES.params.date.replaceAll('/', '-')}.xlsx`);
  toast('تم تنزيل تقرير Excel — الفواتير المعزولة بنفس ترتيب الملف المرفوع');
}

function reportHTML() {
  const P = RES.params;
  const tbl = (idx, extra) => `
  <table><thead><tr>${HEADERS_AR.map(h => `<th>${h}</th>`).join('')}<th>درجة الاشتباه</th><th>أسباب العزل${extra}</th></tr></thead>
  <tbody>${idx.map(i => {
    const r = FEAT.meta[i], rs = (RES.reasons.get(i) || []).map(o => o.t).join(' • ');
    return `<tr><td>${esc(r.serial)}</td><td>${esc(r.details)}</td><td>${esc(r.docType)}</td><td>${esc(r.docVersion)}</td>
    <td>${r.status}</td><td>${r.issueDate ? ddmmyyyy(r.issueDate) : ''}</td><td>${r.submitDate ? ddmmyyyy(r.submitDate) : ''}</td>
    <td>${r.currency}</td><td>${fmt(r.amount)}</td><td>${fmt(r.vat)}</td><td>${fmt(r.total)}</td>
    <td>${esc(r.internalNo)}</td><td>${esc(r.electronicNo)}</td>
    <td>${(RES.comp[i] * 100).toFixed(1)}٪</td><td>${esc(rs)}${memos[i] ? '<br><b>تعليق المراجع:</b> ' + esc(memos[i]) : ''}</td></tr>`;
  }).join('')}</tbody></table>`;
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير مِرْصاد الفواتير</title>
  <style>
   body{font-family:'Sakkal Majalla','Calibri','Segoe UI',sans-serif;font-size:14px;color:#101d17;margin:0;padding:28px}
   .cover{border:3px double #0d3b2e;padding:26px 30px;margin-bottom:26px}
   h1{color:#0d3b2e;font-size:26px;margin:0 0 4px} h2{color:#0d3b2e;border-bottom:2px solid #c8912a;padding-bottom:4px;margin-top:30px}
   .sub{color:#555}.meta{margin-top:12px;font-size:13px}
   table{border-collapse:collapse;width:100%;margin:12px 0}
   th,td{border:1px solid #555;padding:4px 7px;font-size:11.5px;text-align:right}
   th{background:#0d3b2e;color:#fff}
   tr:nth-child(even) td{background:#f4f6f1}
   .note{background:#f6ecd4;border:1px solid #c8912a;padding:10px 14px;font-size:12.5px;margin-top:22px}
   @page{size:A4;margin:1.4cm}
  </style></head><body>
  <div class="cover">
    <h1>مِرْصاد الفواتير — تقرير الفحص غير المُشرف</h1>
    <p class="sub">عزل الفواتير المشتبه فيها وتوجيه عينة التدقيق اليدوي — إجماع ثلاث خوارزميات غير مشرفة مع تفسير XAI</p>
    <p class="meta"><b>إعداد الباحث:</b> محمود الباز فوزي قابيل — لأغراض البحث العلمي فقط · هاتف: <span dir="ltr">01067777481</span><br>
    <b>تاريخ الفحص:</b> ${P.date} · <b>المصدر:</b> ${esc(RAW.source)} · <b>البذرة:</b> ${P.seed} · <b>المرجع:</b> MBZ-EINV-2025</p>
  </div>
  <h2>١ — نطاق الفحص وملخصه</h2>
  <table>
   <tr><th>إجمالي المجتمع</th><td>${FEAT.meta.length}</td><th>الفواتير المعزولة</th><td>${RES.iso.size}</td></tr>
   <tr><th>نسبة العزل الفعلية</th><td>${(100 * RES.iso.size / FEAT.meta.length).toFixed(1)}٪</td><th>توافق الخوارزميات</th><td>${RES.cons}٪</td></tr>
   <tr><th>العينة العشوائية (معيار 530)</th><td>${RES.rand.size} فاتورة (${P.rpct}٪)</td><th>المحركات</th><td>غابة العزل + K-Means + Autoencoder</td></tr>
  </table>
  <p>اعتمدت المنهجية على الفحص غير المُشرف (بدون بيانات موسومة): تعزل غابة العزل الشواذ بمسارات التقسيم، ويكشف التجميع العناقيد النائية والبُعد عن المراكز، وتلتقط الشبكة العصبية الأنماط التي يعجز نموذج الضغط عن إعادة بنائها، ثم تُدمج الدرجات ترجيحيًا وتُفسر بإسهام السمات.</p>
  <h2>٢ — الفواتير المعزولة للتدقيق اليدوي (بترتيب الملف المرفوع)</h2>
  ${tbl(isoSorted(), ' وتوصية المراجعة')}
  <h2>٣ — العينة العشوائية (${P.rpct}٪ وفق معيار المراجعة المصرى 530)</h2>
  ${tbl(randSorted(), '')}
  <div class="note"><b>تنويه:</b> أُعد هذا التقرير لأغراض البحث العلمي فقط، ونتائجه مؤشرات اشتباه إحصائية تُوجّه التدقيق ولا تُغني عن الحكم المهني للمراجع. إعداد الباحث محمود الباز فوزي قابيل — هاتف <span dir="ltr">01067777481</span>.</div>
  </body></html>`;
}
function exportWord() {
  if (!RES) return toast('شغّل الفحص أولًا', true);
  const blob = new Blob(['\ufeff', reportHTML()], { type: 'application/vnd.ms-word;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `تقرير_مرصاد_الفواتير_${RES.params.date.replaceAll('/', '-')}.doc`;
  a.click(); URL.revokeObjectURL(a.href);
  toast('تم تنزيل تقرير Word متضمنًا أسباب العزل بصياغة مهنية');
}
function printReport() {
  if (!RES) return toast('شغّل الفحص أولًا', true);
  const w = window.open('', '_blank');
  w.document.write(reportHTML().replace('</body>', '<script>setTimeout(()=>print(),400)<\/script></body>'));
  w.document.close();
}
function exportJson() {
  if (!RES) return toast('شغّل الفحص أولًا', true);
  const data = { platform: 'مِرْصاد الفواتير', researcher: 'محمود الباز فوزي قابيل',
    date: RES.params.date, params: RES.params, total: FEAT.meta.length,
    isolated: isoSorted().map(i => ({ ...FEAT.meta[i], reasons: RES.reasons.get(i).map(o => o.t), score: RES.comp[i], memo: memos[i] || '' })),
    randomSample: randSorted() };
  const blob = new Blob([JSON.stringify(data, (k, v) => k[0] === '_' || v instanceof Date ? undefined : v, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `mercad_results_${RES.params.date.replaceAll('/', '-')}.json`; a.click();
}

/* ── البيانات التجريبية ─────────────────────── */
function demoRows() {
  const rng = ML.mulberry32(20251126);
  const randn = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const suppliers = ['شركة النيل للتوريدات الصناعية','مجموعة الدلتا التجارية','مصنع الهرم للمواد الغذائية',
    'شركة القناة للخدمات اللوجستية','مؤسسة الأهرام للحلول الهندسية','شركة الإسكندرية للتعبئة والتغليف',
    'شركة المستقبل للاتصالات','مجموعة الصعيد للتنمية','شركة بورسعيد للاستيراد','مصنع المحلة للغزل والنسيج',
    'شركة سيناء للتعدين','مؤسسة الوجه القبلى للتجارة'];
  const N = 132, rows = [];
  for (let i = 0; i < N; i++) {
    const amount = Math.round(Math.exp(8.4 + randn() * 1.1) * 100) / 100;
    const vat = Math.round(amount * VAT * 100) / 100;
    const issue = new Date(2025, 9, 20 + Math.floor(rng() * 36));
    const submit = new Date(+issue + Math.floor(rng() * 4) * 864e5);
    rows.push({
      serial: i + 1, details: suppliers[Math.floor(rng() * suppliers.length)],
      docType: rng() < .85 ? 'فاتورة ضريبية' : (rng() < .5 ? 'إشعار دائن' : 'إشعار مدين'),
      docVersion: '1.0', status: 'Valid', issueDate: issue, submitDate: submit,
      currency: 'EGP', amount, vat, total: Math.round((amount + vat) * 100) / 100,
      internalNo: `INV-2025-${1001 + i}`,
      electronicNo: 'EGS' + String(10 ** 14 + Math.floor(rng() * 9 * 10 ** 13))
    });
  }
  // حقن حالات شاذة واقعية (~8٪)
  const set = (i, f) => Object.assign(rows[i], f);
  set(7, { vat: Math.round(rows[7].amount * .09 * 100) / 100, total: Math.round(rows[7].amount * 1.09 * 100) / 100 });
  rows[19].amount *= 24; rows[19].vat = Math.round(rows[19].amount * VAT * 100) / 100; rows[19].total = rows[19].amount + rows[19].vat;
  set(26, { total: rows[26].total + 820 });
  set(38, { submitDate: new Date(+rows[38].issueDate + 28 * 864e5) });
  rows[46].electronicNo = rows[45].electronicNo;
  set(57, { amount: 60000, vat: 8400, total: 68400 });
  set(64, { status: 'Invalid' });
  set(78, { vat: Math.round(rows[78].amount * .2 * 100) / 100, total: Math.round(rows[78].amount * 1.2 * 100) / 100 });
  set(90, { amount: 12, vat: 0, total: 12 });
  set(101, { submitDate: new Date(+rows[101].issueDate - 2 * 864e5) });
  set(113, { status: 'Cancelled', vat: Math.round(rows[113].amount * .08 * 100) / 100, total: Math.round(rows[113].amount * 1.08 * 100) / 100 });
  return rows;
}
function loadDemo() {
  RAW = { rows: demoRows(), source: 'بيانات تجريبية مُضمَّنة (132 فاتورة)' };
  $('#fileMeta').hidden = false;
  $('#fileMetaTxt').textContent = `${RAW.source} — جاهز للفحص`;
  $('#btnStart').disabled = false;
  log('تم تحميل 132 فاتورة تجريبية تحاكي صادرات منظومة الفاتورة الإلكترونية، مع 11 حالة شاذة محقونة عمدًا', 'lg-ok');
  toast('حُملت البيانات التجريبية — اضغط «بدء عملية الاختبار»');
}
function downloadDemoXlsx() {
  if (typeof XLSX === 'undefined') return toast('مكتبة SheetJS غير متاحة', true);
  const aoa = [HEADERS_AR];
  demoRows().forEach(r => aoa.push([r.serial, r.details, r.docType, r.docVersion, r.status,
    ddmmyyyy(r.issueDate), ddmmyyyy(r.submitDate), r.currency, r.amount, r.vat, r.total,
    r.internalNo, r.electronicNo]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = HEADERS_AR.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الفواتير');
  XLSX.writeFile(wb, 'ملف_تجريبي_مرصاد_الفواتير.xlsx');
  toast('تم تنزيل الملف التجريبي — ارفعه لاختبار المنصة');
}

/* ── قراءة ملف المستخدم ─────────────────────── */
async function handleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'json'].includes(ext)) return toast('الصيغة غير مدعومة — xlsx/xls/csv/json', true);
  if (typeof XLSX === 'undefined' && ext !== 'json') return toast('مكتبة SheetJS لم تُحمَّل بعد', true);
  log(`قراءة الملف: ${file.name} (${fmt(file.size / 1024, 1)} KB)…`);
  try {
    let rows;
    if (ext === 'json') rows = parseJson(await file.text());
    else rows = parseWorkbook(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
    RAW = { rows, source: file.name };
    $('#fileMeta').hidden = false;
    $('#fileMetaTxt').textContent = `${file.name} — ${rows.length} صفًا — جاهز للفحص`;
    $('#btnStart').disabled = false;
    log(`اكتملت القراءة: ${rows.length} فاتورة، الحالات: ${rows.filter(r=>r.status==='Valid').length} Valid / ${rows.filter(r=>r.status==='Invalid').length} Invalid / ${rows.filter(r=>r.status==='Cancelled').length} Cancelled`, 'lg-ok');
    toast('تم تحليل الملف بنجاح');
  } catch (e) {
    log('فشل التحليل: ' + e.message, 'lg-err'); toast(e.message, true);
  }
}

/* ── الإقلاع والربط ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  $('#todayDate').textContent = todayStr();
  log('مِرْصاد الفواتير v1.0.0 — تم إقلاع المحركات الثلاثة بنجاح', 'lg-gold');
  log('في انتظار ملف الفواتير (Excel أو JSON)…', 'lg-dim');

  $('#btnPick').addEventListener('click', () => $('#fileInput').click());
  $('#dropzone').addEventListener('click', () => $('#fileInput').click());
  $('#dropzone').addEventListener('keydown', e => { if (e.key === 'Enter') $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', e => handleFile(e.target.files[0]));
  const dz = $('#dropzone');
  ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
  dz.addEventListener('drop', e => handleFile(e.dataTransfer.files[0]));
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => e.preventDefault());

  $('#btnDemoFile').addEventListener('click', downloadDemoXlsx);
  $('#btnDemoLoad').addEventListener('click', loadDemo);
  $('#btnStart').addEventListener('click', run);
  $('#optCont').addEventListener('input', e => $('#contVal').textContent = e.target.value + '٪');
  $('#btnReset').addEventListener('click', () => {
    RAW = { rows: [], source: '' }; FEAT = STD = RES = null;
    $('#results').hidden = true; $('#fileMeta').hidden = true; $('#fileInput').value = '';
    $('#btnStart').disabled = true; setProg(0);
    $$('#stages li').forEach(li => { li.classList.remove('active', 'done'); li.querySelector('.s-m').textContent = '—'; });
    $('#console').innerHTML = ''; log('تمت إعادة الضبط — في انتظار ملف جديد', 'lg-dim');
    toast('أُعيد ضبط المنصة');
  });

  $('#btnWord').addEventListener('click', exportWord);
  $('#btnExcel').addEventListener('click', exportExcel);
  $('#btnPrint').addEventListener('click', printReport);
  $('#btnJson').addEventListener('click', exportJson);

  // كشف عند التمرير + شريط التقدم + ظل التنقل
  const io = new IntersectionObserver(es => es.forEach(x => x.isIntersecting && x.target.classList.add('in')), { threshold: .12 });
  $$('.rv').forEach(el => io.observe(el));
  addEventListener('scroll', () => {
    const p = scrollY / (document.body.scrollHeight - innerHeight || 1);
    $('#scrollbar').style.width = (p * 100) + '%';
    $('#nav').classList.toggle('stuck', scrollY > 120);
  }, { passive: true });
  addEventListener('resize', () => { if (RES) { drawHist(); drawScat(); } });
});