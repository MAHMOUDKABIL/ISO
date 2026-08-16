/* ══════════════════════════════════════════════════
   app.js - العزل الذكي
   الواجهة وقراءة الملفات وتفسير النتائج والاخراج
   اعداد الباحث: محمود الباز فوزي قابيل - بحث علمي فقط
   ══════════════════════════════════════════════════ */
"use strict";

const $  = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = (n, dec = 2) => new Intl.NumberFormat('en-EG', { maximumFractionDigits: dec }).format(+n || 0);
const todayStr = () => { const d = new Date(), p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; };
const ddmmyyyy = d => { const p = x => String(x).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`; };
const VAT = 0.14;

let RAW = { rows: [], source: '' };
let FEAT = null, STD = null, RES = null;
let activeTab = 'overview', activeRisk = 'all', quickFilter = null;
const statuses = {}, memos = {}, auditLog = [];

/* السجل والتنبيهات */
function log(msg, cls = '') {
  const t = new Date().toTimeString().slice(0, 8);
  auditLog.push({ time: t, msg: msg.replace(/<[^>]*>/g, '') });
  const c = $('#logBox');
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

/* الخطوات */
function setStep(n) {
  $$('.step').forEach(s => {
    const i = +s.dataset.step;
    s.classList.toggle('done', i < n);
    s.classList.toggle('active', i === n);
  });
}

/* قراءة القيم */
const normKey = s => String(s).replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
  .replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/[\s_\-\.]/g,'')
  .replace(/[\u064B-\u0652\u0640]/g,'').toLowerCase();
const ALIASES = {
  serial:['مسلسل','م','serial','no','id','row'],
  details:['تفاصيل','الوصف','details','description'],
  docType:['نوعالمستند','النوع','doctype','type'],
  docVersion:['نسخهالمستند','النسخه','docversion','version'],
  status:['الحاله','status'],
  issueDate:['تاريخالاصدار','اصدار','issuedate','issue','date'],
  submitDate:['تاريخالتقديم','تقديم','submitdate','submissiondate','submit'],
  currency:['عملهالفاتوره','العمله','currency'],
  amount:['قيمهالفاتوره','القيمه','amount','value'],
  vat:['ضريبهالقيمهالمضافه','الضريبه','vat','tax'],
  total:['اجماليالفاتوره','الاجمالي','total','grandtotal'],
  internalNo:['الرقمالداخلي','internalno','internal','refno'],
  electronicNo:['الرقمالالكتروني','electronicno','eno','uuid']
};
const HEADERS_AR = ['مسلسل','تفاصيل','نوع المستند','نسخة المستند','الحالة','تاريخ الاصدار','تاريخ التقديم','عملة الفاتورة','قيمة الفاتورة','ضريبة القيمة المضافة','اجمالي الفاتورة','الرقم الداخلي','الرقم الالكتروني'];

function parseNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).replace(/[٬,\s]/g, '')
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace('٫', '.');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) return v;
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Math.round((v - 25569) * 864e5));
  const m = String(v).trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  const d = new Date(v); return isNaN(d) ? null : d;
}
function normStatus(v) {
  const s = String(v || '').toLowerCase();
  if (s.includes('invalid') || s.includes('باطل') || s.includes('مرفوض')) return 'Invalid';
  if (s.includes('cancel') || s.includes('ملغ')) return 'Cancelled';
  return 'Valid';
}
function rowFromDict(src) {
  const dict = {};
  for (const k in src) { const nk = normKey(k); if (!(nk in dict)) dict[nk] = src[k]; }
  const pick = f => { for (const a of ALIASES[f]) if (a in dict && dict[a] !== '') return dict[a]; return ''; };
  return {
    serial: pick('serial'), details: pick('details'), docType: pick('docType'),
    docVersion: pick('docVersion'), status: normStatus(pick('status')),
    issueDate: parseDate(pick('issueDate')), submitDate: parseDate(pick('submitDate')),
    currency: String(pick('currency') || 'EGP').toUpperCase(),
    amount: parseNum(pick('amount')), vat: parseNum(pick('vat')), total: parseNum(pick('total')),
    internalNo: String(pick('internalNo')), electronicNo: String(pick('electronicNo'))
  };
}
function parseJson(text) {
  const obj = JSON.parse(text);
  const arr = Array.isArray(obj) ? obj : (obj.invoices || obj.rows || obj.data || []);
  if (!Array.isArray(arr) || !arr.length) throw new Error('ملف JSON لا يحتوي على فواتير');
  return arr.map(rowFromDict);
}
function parseWorkbook(wb) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  let hIdx = -1, colMap = null;
  for (let r = 0; r < Math.min(6, aoa.length); r++) {
    const norm = aoa[r].map(normKey), map = {};
    for (const f in ALIASES) {
      const ci = norm.findIndex(nk => ALIASES[f].includes(nk));
      if (ci >= 0) map[f] = ci;
    }
    if (map.serial !== undefined && map.electronicNo !== undefined) { hIdx = r; colMap = map; break; }
  }
  if (hIdx < 0) {
    if (aoa[0].length >= 12) {
      hIdx = 0; colMap = {};
      Object.keys(ALIASES).forEach((f, i) => colMap[f] = i);
      log('لم نتعرف على اسماء الاعمدة، استخدمنا الترتيب الافتراضي', 'lg-warn');
    } else throw new Error('لم نجد صف العناوين المطلوب في الملف');
  } else {
    log(`وجدنا صف العناوين في السطر ${hIdx + 1} وتطابق ${Object.keys(colMap).length} عمود`, 'lg-ok');
  }
  const rows = [];
  for (let r = hIdx + 1; r < aoa.length; r++) {
    const cells = aoa[r];
    if (!cells || cells.every(c => c === '' || c == null)) continue;
    const get = f => colMap[f] !== undefined ? cells[colMap[f]] : '';
    rows.push(rowFromDict(Object.fromEntries(Object.keys(colMap).map(f => [f, get(f)]))));
  }
  if (!rows.length) throw new Error('الملف لا يحتوي على بيانات بعد صف العناوين');
  return rows;
}

/* بناء السمات */
function buildFeatures(rows) {
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
    Object.assign(r, { _i: i, rate, mismatch, mismatchRel, delay, dupInt, dupEno, round, lead });
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

/* الفحوص القطعية (تطبق دائما قبل النماذج) */
function hardFlags(r) {
  const out = [];
  if (r.mismatchRel > 0.005 && r.mismatch > 1)
    out.push({ t: `فرق في الحساب: مجموع القيمة والضريبة لا يساوي الاجمالي (الفرق ${fmt(r.mismatch)} ${r.currency})`, w: 3, hard: 1 });
  if (r.dupEno) out.push({ t: `الرقم الالكتروني ${r.electronicNo} مكرر في اكثر من فاتورة`, w: 3, hard: 1 });
  if (r.delay < 0) out.push({ t: `تاريخ التقديم (${ddmmyyyy(r.submitDate)}) قبل تاريخ الاصدار (${ddmmyyyy(r.issueDate)})`, w: 3, hard: 1 });
  if (r.amount > 500 && Math.abs(r.rate - VAT) > 0.04)
    out.push({ t: `نسبة الضريبة في الفاتورة ${(r.rate * 100).toFixed(1)}% والنسبة المقررة 14%`, w: 2.6, hard: 1 });
  return out;
}
function buildReasons(i, km) {
  const r = FEAT.meta[i], z = STD.Z[i], out = hardFlags(r);
  if (Math.abs(r.rate - VAT) > 0.02 && !out.some(o => o.t.includes('نسبة الضريبة')))
    out.push({ t: `نسبة الضريبة ${(r.rate * 100).toFixed(1)}% بعيدة عن النسبة المقررة 14%`, w: 2 });
  if (z[0] > 2.2) out.push({ t: `قيمة الفاتورة (${fmt(r.amount)}) اعلى بكثير من المعتاد في هذا المجتمع`, w: 1.8 });
  if (z[0] < -2.2) out.push({ t: `قيمة الفاتورة (${fmt(r.amount)}) اقل بكثير من المعتاد`, w: 1.6 });
  if (r.delay > 18) out.push({ t: `مرت ${r.delay} يوم بين تاريخ الاصدار وتاريخ التقديم، وهذا غير معتاد`, w: 1.7 });
  if (r.dupInt) out.push({ t: `الرقم الداخلي ${r.internalNo} مكرر في اكثر من قيد`, w: 1.9 });
  if (r.round) out.push({ t: `قيمة الفاتورة رقم مستدير (${fmt(r)}) على غير العادة`, w: 1 });
  if (r.status !== 'Valid') out.push({ t: `حالة المستند ${r.status} ويجب التأكد من سريانه`, w: 1.4 });
  if (km && km.sizes[km.labels[i]] <= Math.max(2, Math.floor(FEAT.meta.length * 0.04)))
    out.push({ t: `الفاتورة ضمن مجموعة صغيرة جدا (${km.sizes[km.labels[i]]} فواتير) بعيدة عن باقي المجتمع`, w: 1.5 });
  if (!out.length) out.push({ t: `درجة الشك الاجمالية مرتفعة حسب اتفاق الطرق الثلاث، وينصح بمراجعتها مستنديا`, w: 1 });
  return out.sort((a, b) => b.w - a.w).slice(0, 5);
}

/* الاختبارات السريعة */
const QUICK = [
  { k: 'mismatch', name: 'خطأ في الحساب', desc: 'القيمة + الضريبة لا تساوي الاجمالي', f: r => r.mismatchRel > 0.005 && r.mismatch > 1 },
  { k: 'vat', name: 'نسبة ضريبة مخالفة', desc: 'بعيدة عن النسبة المقررة 14%', f: r => r.amount > 500 && Math.abs(r.rate - VAT) > 0.02 },
  { k: 'dup', name: 'ارقام مكررة', desc: 'رقم الكتروني او داخلي مكرر', f: r => r.dupInt || r.dupEno },
  { k: 'delay', name: 'فرق تواريخ كبير', desc: 'اكثر من 18 يوم او تقديم قبل اصدار', f: r => r.delay > 18 || r.delay < 0 },
  { k: 'status', name: 'حالة غير سارية', desc: 'Invalid او Cancelled', f: r => r.status !== 'Valid' }
];

/* تشغيل الفحص */
async function run() {
  if (!RAW.rows.length) return toast('ارفع ملفا اولا', true);
  const enabled = $$('.alg input').filter(c => c.checked).map(c => c.dataset.alg);
  if (!enabled.length) return toast('اختر طريقة فحص واحدة على الاقل', true);
  if (typeof XLSX === 'undefined') return toast('مكتبة قراءة Excel لم تحمل، تحقق من الانترنت ثم اعد فتح الصفحة', true);

  const cont = +$('#optCont').value, rpct = +$('#optRand').value,
        seed = +$('#optSeed').value || 1, excl = $('#optExcl').checked;
  const n = RAW.rows.length, rng = ML.mulberry32(seed);

  $('#btnStart').disabled = true;
  $('#btnStart').textContent = 'جاري الفحص...';
  $('#led').classList.add('busy'); $('#ledTxt').textContent = 'جاري الفحص';
  setStep(2);
  log(`بدء فحص ${n} فاتورة - نسبة العزل ${cont}% - العينة ${rpct}% - رقم الثبات ${seed}`);

  try {
    FEAT = buildFeatures(RAW.rows);
    log('تم استخراج بيانات كل فاتورة وتجهيزها للفحص', 'lg-dim');
    await sleep(150);
    STD = ML.zscore(FEAT.M);

    let ifS = null;
    if (enabled.includes('iforest')) {
      ifS = ML.isolationForest(STD.Z, { trees: 120, sub: 256, rng });
      log('غابة العزل: انتهت (120 شجرة)', 'lg-dim');
    }
    await sleep(100);

    let km = null, kmS = null;
    if (enabled.includes('kmeans')) {
      const k = Math.max(3, Math.min(8, Math.round(Math.sqrt(n / 3))));
      km = ML.kmeans(STD.Z, k, rng);
      kmS = ML.kmeansScores(km, n);
      log(`التجميع: انتهى (${k} مجموعات)`, 'lg-dim');
    }
    await sleep(100);

    let nnS = null;
    if (enabled.includes('nn')) {
      const ae = ML.trainAutoencoder(STD.Z, { hidden: 4, rng });
      nnS = ae.scores;
      log(`الشبكة العصبية: انتهى التدريب (نسبة الخطأ ${ae.avgLoss.toFixed(3)})`, 'lg-dim');
    }

    const parts = [], weights = [];
    if (ifS) { parts.push(ML.minmax(ifS)); weights.push(0.4); }
    if (kmS) { parts.push(ML.minmax(kmS)); weights.push(0.3); }
    if (nnS) { parts.push(ML.minmax(nnS)); weights.push(0.3); }
    const wSum = weights.reduce((a, b) => a + b, 0);
    const comp = new Array(n).fill(0);
    for (let i = 0; i < n; i++)
      for (let p = 0; p < parts.length; p++) comp[i] += parts[p][i] * weights[p] / wSum;

    const iso = new Set(), order = [...Array(n).keys()].sort((a, b) => comp[b] - comp[a]);
    let cut = 0;
    for (let i = 0; i < Math.min(Math.ceil(n * cont / 100), n); i++) { iso.add(order[i]); cut = comp[order[i]]; }
    const hardSet = new Set();
    FEAT.meta.forEach((r, i) => { if (hardFlags(r).length) { iso.add(i); hardSet.add(i); } });
    const reasons = new Map();
    [...iso].forEach(i => reasons.set(i, buildReasons(i, km)));

    let agree = 0;
    [...iso].forEach(i => {
      let c = 0; parts.forEach(p => { if (p[i] >= 0.55) c++; });
      if (parts.length === 1 || c >= 2) agree++;
    });
    const cons = iso.size ? Math.round(100 * agree / iso.size) : 0;

    const rng2 = ML.mulberry32(seed + 7);
    const pool = [...Array(n).keys()].filter(i => !(excl && iso.has(i)));
    const kSample = Math.min(pool.length, Math.ceil(n * rpct / 100));
    ML.shuffle(pool, rng2);
    const rand = new Set(pool.slice(0, kSample));

    const risk = new Array(n).fill(0);
    [...iso].forEach(i => risk[i] = (comp[i] >= 0.7 || hardSet.has(i)) ? 2 : 1);

    RES = { comp, ifS: ifS && ML.minmax(ifS), kmS: kmS && ML.minmax(kmS), nnS: nnS && ML.minmax(nnS),
            iso, rand, reasons, cons, km, hardSet, risk,
            params: { cont, rpct, seed, excl, enabled, threshold: cut, date: todayStr() },
            maxScore: Math.max(...comp) };

    log(`النتيجة: ${iso.size} فاتورة معزولة، منها ${hardSet.size} بسبب خطأ واضح مباشر`, 'lg-warn');
    log(`العينة العشوائية: ${kSample} فاتورة (${rpct}%) حسب معيار المراجعة المصري 530`, 'lg-ok');
    log('اكتمل الفحص. راجع النتائج في اللوحة التالية', 'lg-ok');
    setStep(3);
    renderResults();
  } catch (e) {
    log('حدث خطأ: ' + e.message, 'lg-err'); toast(e.message, true);
  } finally {
    $('#btnStart').disabled = false;
    $('#btnStart').textContent = 'بدء عملية الاختبار';
    $('#led').classList.remove('busy'); $('#ledTxt').textContent = 'النظام جاهز';
  }
}

/* عرض النتائج */
function countTo(el, val, suf = '') {
  const t0 = performance.now(), dur = 750;
  const step = t => {
    const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(val * e, 0) + suf;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
function renderResults() {
  const n = FEAT.meta.length, P = RES.params;
  $('#dashboard').hidden = false;
  countTo($('#kTotal'), n);
  countTo($('#kIso'), RES.iso.size);
  countTo($('#kHigh'), RES.risk.filter(r => r === 2).length);
  countTo($('#kMid'), RES.risk.filter(r => r === 1).length);
  countTo($('#kRand'), RES.rand.size);
  $('#kCons').textContent = RES.cons + '%';
  const algNames = P.enabled.map(a => ({ iforest: 'غابة العزل', kmeans: 'التجميع', nn: 'الشبكة العصبية' }[a])).join(' + ');
  $('#runNote').textContent = `المصدر: ${RAW.source} | نسبة العزل ${P.cont}% | العينة ${P.rpct}% | رقم الثبات ${P.seed} | الطرق: ${algNames} | التاريخ: ${P.date}`;
  $('#cntIso').textContent = RES.iso.size;
  $('#cntRand').textContent = RES.rand.size;
  $('#cntAll').textContent = n;
  renderOverview();
  requestAnimationFrame(() => { if (activeTab === 'overview') drawAllCharts(); });
  setTimeout(() => $('#dashboard').scrollIntoView({ behavior: 'smooth' }), 300);
}

/* النظرة العامة */
function renderOverview() {
  const amounts = FEAT.meta.map(r => r.amount).sort((a, b) => a - b);
  const n = amounts.length;
  const median = n % 2 ? amounts[(n - 1) / 2] : (amounts[n / 2 - 1] + amounts[n / 2]) / 2;
  const sum = amounts.reduce((a, b) => a + b, 0);
  $('#statCards').innerHTML = [
    ['عدد الفواتير', fmt(n, 0)], ['اجمالي القيم', fmt(sum)],
    ['المتوسط', fmt(sum / n)], ['الوسيط', fmt(median)],
    ['اكبر قيمة', fmt(amounts[n - 1])], ['اصغر قيمة', fmt(amounts[0])]
  ].map(([k, v]) => `<div class="stat-cell"><span>${k}</span><b>${v}</b></div>`).join('');

  $('#top10Body').innerHTML = [...FEAT.meta].sort((a, b) => b.amount - a.amount).slice(0, 10)
    .map(r => `<tr class="${RES.iso.has(r._i) ? 'flag' : ''}">
      <td class="num">${esc(r.serial)}</td><td>${esc(String(r.details).slice(0, 30))}</td>
      <td class="num">${fmt(r.amount)}</td>
      <td>${RES.iso.has(r._i) ? '<span class="chip c-red">معزولة</span>' : '<span class="chip c-gray">سليمة</span>'}</td></tr>`).join('');

  $('#testsList').innerHTML = QUICK.map(q => {
    const c = FEAT.meta.filter(q.f).length;
    return `<li data-q="${q.k}"><span class="t-name">${q.name}<small>${q.desc}</small></span>
      <span class="t-count ${c ? '' : 'zero'}">${c}</span></li>`;
  }).join('');
}
$('#testsList').addEventListener('click', e => {
  const li = e.target.closest('li[data-q]');
  if (!li) return;
  quickFilter = li.dataset.q; activeRisk = 'all';
  setTab('all');
  toast('نعرض لك كل الحالات المطابقة لهذا الاختبار');
});

/* التبويبات والفلاتر */
function setTab(t) {
  activeTab = t;
  $$('.tabbtn').forEach(b => b.classList.toggle('active', b.dataset.tab === t));
  $('#paneOverview').hidden = t !== 'overview';
  $('#paneTable').hidden = t === 'overview';
  if (t === 'overview') drawAllCharts(); else renderTable();
}
$$('.tabbtn').forEach(b => b.addEventListener('click', () => { quickFilter = null; setTab(b.dataset.tab); }));
$$('.rchip').forEach(b => b.addEventListener('click', () => {
  activeRisk = b.dataset.risk;
  $$('.rchip').forEach(x => x.classList.toggle('active', x === b));
  renderTable();
}));
$('#tblSearch').addEventListener('input', renderTable);

/* الجدول */
function riskChip(i) {
  const r = RES.risk[i];
  if (r === 2) return '<span class="chip c-red">عالية</span>';
  if (r === 1) return '<span class="chip c-amber">متوسطة</span>';
  return '<span class="chip c-gray">منخفضة</span>';
}
function statusChip(i) {
  const s = statuses[i] || 'new';
  return { new: '<span class="chip c-gray">جديدة</span>',
           prog: '<span class="chip c-amber">قيد المراجعة</span>',
           done: '<span class="chip c-green">تمت المراجعة</span>' }[s];
}
function tableRows() {
  let idx;
  if (activeTab === 'iso') idx = [...RES.iso].sort((a, b) => a - b);
  else if (activeTab === 'rand') idx = [...RES.rand].sort((a, b) => a - b);
  else idx = [...Array(FEAT.meta.length).keys()];

  if (activeRisk === 'high') idx = idx.filter(i => RES.risk[i] === 2);
  if (activeRisk === 'mid') idx = idx.filter(i => RES.risk[i] === 1);
  if (quickFilter) { const q = QUICK.find(x => x.k === quickFilter); idx = idx.filter(i => q.f(FEAT.meta[i])); }

  const s = $('#tblSearch').value.trim().toLowerCase();
  if (s) idx = idx.filter(i => {
    const r = FEAT.meta[i], rs = (RES.reasons.get(i) || []).map(o => o.t).join(' ');
    return [r.serial, r.details, r.internalNo, r.electronicNo, rs].join(' ').toLowerCase().includes(s);
  });

  if (!idx.length) return `<tr class="empty-row"><td colspan="14">لا توجد نتائج مطابقة</td></tr>`;
  return idx.map(i => {
    const r = FEAT.meta[i];
    const chips = (RES.reasons.get(i) || []).slice(0, 2)
      .map(o => `<span class="chip ${o.hard ? 'c-red' : 'c-amber'}">${esc(o.t.length > 42 ? o.t.slice(0, 42) + '...' : o.t)}</span>`).join(' ');
    return `<tr data-i="${i}" class="${RES.iso.has(i) ? 'iso-row' : RES.rand.has(i) ? 'rand-row' : ''}">
      <td class="num">${esc(r.serial)}</td>
      <td class="num" dir="ltr">${esc(r.electronicNo.slice(0, 16))}${r.electronicNo.length > 16 ? '...' : ''}</td>
      <td>${esc(String(r.details).slice(0, 30))}${String(r.details).length > 30 ? '...' : ''}</td>
      <td>${esc(r.docType)}</td>
      <td><span class="chip ${r.status === 'Valid' ? 'c-navy' : 'c-gray'}">${r.status}</span></td>
      <td class="num">${r.issueDate ? ddmmyyyy(r.issueDate) : '-'}</td>
      <td class="num">${fmt(r.amount)}</td>
      <td class="num">${fmt(r.vat)}</td>
      <td class="num">${fmt(r.total)}</td>
      <td><span class="sb"><i style="width:${Math.round(RES.comp[i] * 100)}%"></i></span> <b class="num" style="font-size:11px">${(RES.comp[i] * 100).toFixed(0)}%</b></td>
      <td>${riskChip(i)}</td>
      <td>${chips || '<span class="chip c-green">لا يوجد</span>'}</td>
      <td>${statusChip(i)}</td>
      <td><button class="mini-btn">عرض</button></td>
    </tr>`;
  }).join('');
}
function renderTable() { $('#tblBody').innerHTML = tableRows(); }
$('#tblBody').addEventListener('click', e => {
  const tr = e.target.closest('tr[data-i]');
  if (tr) openDrawer(+tr.dataset.i);
});

/* الرسوم */
function setupCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = 230;
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  return { ctx, w, h };
}
let histBins = [], scatPts = [];
function drawAllCharts() { drawHist(); drawScat(); drawBenf(); }

function drawHist() {
  const cv = $('#histCanvas'); if (!cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv);
  const B = 24, counts = new Array(B).fill(0);
  RES.comp.forEach(s => counts[Math.min(B - 1, Math.floor(s * B))]++);
  const thr = RES.params.threshold || .5, mx = Math.max(...counts, 1);
  const L = 30, R = 10, T = 14, Bm = 24, pw = w - L - R, ph = h - T - Bm;
  ctx.clearRect(0, 0, w, h); histBins = [];
  for (let b = 0; b < B; b++) {
    const bh = counts[b] / mx * ph, x = L + b / B * pw, bw = pw / B - 2;
    ctx.fillStyle = (b + .5) / B >= thr ? '#d97706' : '#1b4a7e';
    ctx.fillRect(x, T + ph - bh, bw, bh);
    histBins.push({ x, w: bw, b, c: counts[b] });
  }
  ctx.strokeStyle = '#64748b'; ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(w - R, T + ph); ctx.stroke();
  const tx = L + thr * pw;
  ctx.strokeStyle = '#c0392b'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(tx, T - 2); ctx.lineTo(tx, T + ph); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#c0392b'; ctx.font = '11px IBM Plex Sans Arabic'; ctx.textAlign = 'right';
  ctx.fillText('حد العزل', tx - 4, T + 8);
}
function drawScat() {
  const cv = $('#scatCanvas'); if (!cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv);
  const L = 36, R = 12, T = 12, Bm = 24, pw = w - L - R, ph = h - T - Bm;
  const xs = FEAT.meta.map(r => Math.log10(r.amount + 1));
  const xmin = Math.min(...xs), xmax = Math.max(...xs) || 1;
  const ymax = Math.max(20, ...FEAT.meta.map(r => r.rate * 100)) + 3;
  const X = v => L + (v - xmin) / ((xmax - xmin) || 1) * pw;
  const Y = v => T + ph - v / ymax * ph;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(100,116,139,.25)';
  for (let g = 1; g < 5; g++) { ctx.beginPath(); ctx.moveTo(L, T + ph * g / 5); ctx.lineTo(w - R, T + ph * g / 5); ctx.stroke(); }
  ctx.strokeStyle = '#c0392b'; ctx.setLineDash([5, 4]);
  ctx.beginPath(); ctx.moveTo(L, Y(14)); ctx.lineTo(w - R, Y(14)); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = '#c0392b'; ctx.font = '11px IBM Plex Mono'; ctx.textAlign = 'left';
  ctx.fillText('14%', w - R - 28, Y(14) - 4);
  scatPts = [];
  FEAT.meta.forEach((r, i) => {
    const px = X(xs[i]), py = Y(r.rate * 100), flagged = RES.iso.has(i);
    ctx.beginPath(); ctx.arc(px, py, flagged ? 5 : 3, 0, 7);
    ctx.fillStyle = flagged ? '#c0392b' : 'rgba(27,74,126,.4)'; ctx.fill();
    if (flagged) { ctx.strokeStyle = '#d97706'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.lineWidth = 1; }
    scatPts.push({ x: px, y: py, i });
  });
  ctx.strokeStyle = '#64748b';
  ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(w - R, T + ph); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(L, T); ctx.lineTo(L, T + ph); ctx.stroke();
  ctx.fillStyle = '#64748b'; ctx.font = '11px IBM Plex Sans Arabic'; ctx.textAlign = 'center';
  ctx.fillText(`قيمة الفاتورة من ${fmt(10 ** xmin, 0)} الى ${fmt(10 ** xmax, 0)}`, L + pw / 2, h - 6);
}
function drawBenf() {
  const cv = $('#benfCanvas'); if (!cv.clientWidth) return;
  const { ctx, w, h } = setupCanvas(cv);
  const L = 30, R = 10, T = 16, Bm = 26, pw = w - L - R, ph = h - T - Bm;
  const counts = new Array(9).fill(0); let tot = 0;
  FEAT.meta.forEach(r => { if (r.amount > 0) { counts[r.lead - 1]++; tot++; } });
  const act = counts.map(c => tot ? c / tot * 100 : 0);
  const exp = Array.from({ length: 9 }, (_, d) => Math.log10(1 + 1 / (d + 1)) * 100);
  const mx = Math.max(...act, ...exp, 1) * 1.15;
  ctx.clearRect(0, 0, w, h);
  const bw = pw / 9;
  for (let d = 0; d < 9; d++) {
    const x = L + d * bw + bw * 0.18, ah = act[d] / mx * ph, eh = exp[d] / mx * ph;
    ctx.fillStyle = '#1b4a7e';
    ctx.fillRect(x, T + ph - ah, bw * 0.64, ah);
    ctx.strokeStyle = '#d97706'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x - 3, T + ph - eh); ctx.lineTo(x + bw * 0.64 + 3, T + ph - eh); ctx.stroke(); ctx.lineWidth = 1;
    ctx.fillStyle = '#64748b'; ctx.font = '12px IBM Plex Mono'; ctx.textAlign = 'center';
    ctx.fillText(String(d + 1), x + bw * 0.32, h - 8);
  }
  ctx.strokeStyle = '#94a3b8'; ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(w - R, T + ph); ctx.stroke();
  const dev = act.reduce((s, a, d) => s + Math.abs(a - exp[d]), 0) / 2;
  $('#benfNote').innerHTML = `الاعمدة = التوزيع الفعلي، والعلامات البرتقالية = المتوقع طبيعيا. نسبة الاختلاف الكلية: <b>${dev.toFixed(1)}%</b>${dev > 12 ? ' - فرق ملحوظ يستحق الانتباه' : ' - الفرق في الحدود الطبيعية'}`;
}
$('#histCanvas')?.addEventListener('mousemove', e => {
  const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, tip = $('#tipHist');
  const hit = histBins.find(b => x >= b.x && x <= b.x + b.w);
  if (hit && hit.c) {
    tip.style.display = 'block'; tip.style.left = (hit.x + hit.w / 2) + 'px'; tip.style.top = '8px';
    tip.textContent = `${Math.round(hit.b / 24 * 100)}-${Math.round((hit.b + 1) / 24 * 100)}% : ${hit.c} فاتورة`;
  } else tip.style.display = 'none';
});
$('#scatCanvas')?.addEventListener('mousemove', e => {
  const r = e.target.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, tip = $('#tipScat');
  const hit = scatPts.find(p => (p.x - mx) ** 2 + (p.y - my) ** 2 < 110);
  if (hit) {
    const inv = FEAT.meta[hit.i];
    tip.style.display = 'block'; tip.style.left = hit.x + 'px'; tip.style.top = (hit.y - 32) + 'px';
    tip.textContent = `م${inv.serial} | ${fmt(inv.amount)} | ضريبة ${(inv.rate * 100).toFixed(1)}%`;
  } else tip.style.display = 'none';
});
$('#scatCanvas')?.addEventListener('click', e => {
  const r = e.target.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const hit = scatPts.find(p => (p.x - mx) ** 2 + (p.y - my) ** 2 < 140);
  if (hit) openDrawer(hit.i);
});
[$('#histCanvas'), $('#scatCanvas'), $('#benfCanvas')].forEach(cv =>
  cv?.addEventListener('mouseleave', () => { $('#tipHist').style.display = 'none'; $('#tipScat').style.display = 'none'; }));

/* نافذة التفاصيل */
let drawerIdx = null;
function openDrawer(i) {
  drawerIdx = i;
  const r = FEAT.meta[i];
  $('#drSerial').textContent = r.electronicNo || r.internalNo || 'م' + r.serial;
  $('#drScore').textContent = (RES.comp[i] * 100).toFixed(1) + '%';
  $('#drBadges').innerHTML = [
    RES.iso.has(i) ? '<span class="chip c-red">معزولة للمراجعة اليدوية</span>' : '',
    RES.rand.has(i) ? '<span class="chip c-amber">ضمن العينة العشوائية</span>' : '',
    RES.hardSet.has(i) ? '<span class="chip c-red">سبب مباشر واضح</span>' : '',
    `<span class="chip c-navy">${r.status}</span>`].filter(Boolean).join('');
  const gauges = [['غابة العزل', RES.ifS, '#1b4a7e'], ['التجميع', RES.kmS, '#64748b'], ['الشبكة العصبية', RES.nnS, '#c0392b']];
  $('#drGauges').innerHTML = gauges.map(([nm, arr, c]) => arr
    ? `<div class="g"><span>${nm}</span><span class="track"><i data-w="${Math.round(arr[i] * 100)}" style="background:${c}"></i></span><span class="v">${(arr[i] * 100).toFixed(0)}%</span></div>`
    : `<div class="g"><span>${nm}</span><span class="track"><i></i></span><span class="v">معطلة</span></div>`).join('');
  $('#drReasons').innerHTML = (RES.reasons.get(i) || [{ t: 'لا توجد اسباب عزل - الفاتورة في الحدود الطبيعية' }])
    .map(o => `<li>${esc(o.t)}</li>`).join('');
  $('#drMeta').innerHTML = [
    ['الرقم الداخلي', r.internalNo || '-'], ['النوع', r.docType || '-'],
    ['تاريخ الاصدار', r.issueDate ? ddmmyyyy(r.issueDate) : '-'], ['تاريخ التقديم', r.submitDate ? ddmmyyyy(r.submitDate) : '-'],
    ['العملة', r.currency], ['نسبة الضريبة الفعلية', (r.rate * 100).toFixed(2) + '%'],
    ['فرق الحساب', fmt(r.mismatch)], ['التفاصيل', String(r.details).slice(0, 40)]
  ].map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
  $('#drMemo').value = memos[i] || '';
  $('#drMemo').oninput = e => memos[i] = e.target.value;
  $$('.stbtn').forEach(b => b.classList.toggle('on', (statuses[i] || 'new') === b.dataset.st));
  $('#drRec').textContent = RES.iso.has(i)
    ? `ننصح بمراجعة المستند ${r.internalNo} مع المستندات الاصلية، والتأكد من حساب الضريبة وحالة التسجيل.`
    : 'لا تحتاج مراجعة اضافية خارج العينة النظامية.';
  $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false');
  $('#backdrop').hidden = false;
  requestAnimationFrame(() => {
    $('#backdrop').classList.add('show');
    $$('#drGauges .track i').forEach(el => el.style.width = (el.dataset.w || 0) + '%');
  });
}
function closeDrawer() {
  $('#drawer').classList.remove('open'); $('#drawer').setAttribute('aria-hidden', 'true');
  $('#backdrop').classList.remove('show'); setTimeout(() => $('#backdrop').hidden = true, 300);
}
$('#drClose').addEventListener('click', closeDrawer);
$('#backdrop').addEventListener('click', closeDrawer);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeDrawer(); });
$$('.stbtn').forEach(b => b.addEventListener('click', () => {
  if (drawerIdx === null) return;
  statuses[drawerIdx] = b.dataset.st;
  $$('.stbtn').forEach(x => x.classList.toggle('on', x === b));
  renderTable();
  log(`تحديث حالة مراجعة الفاتورة م${FEAT.meta[drawerIdx].serial} الى: ${{new:'جديدة',prog:'قيد المراجعة',done:'تمت المراجعة'}[b.dataset.st]}`, 'lg-dim');
}));

/* الاخراج */
function isoSorted() { return [...RES.iso].sort((a, b) => a - b); }
function randSorted() { return [...RES.rand].sort((a, b) => a - b); }
const stTxt = i => ({ new: 'جديدة', prog: 'قيد المراجعة', done: 'تمت المراجعة' }[statuses[i] || 'new']);

function exportExcel() {
  if (!RES) return toast('شغل الفحص اولا', true);
  const H = [...HEADERS_AR, 'درجة الشك %', 'مستوى الخطورة', 'اسباب العزل', 'حالة المراجعة', 'تعليق المراجع'];
  const riskTxt = i => ['منخفضة', 'متوسطة', 'عالية'][RES.risk[i]];
  const rowOf = (i, note) => {
    const r = FEAT.meta[i];
    return [r.serial, r.details, r.docType, r.docVersion, r.status,
      r.issueDate ? ddmmyyyy(r.issueDate) : '', r.submitDate ? ddmmyyyy(r.submitDate) : '',
      r.currency, r.amount, r.vat, r.total, r.internalNo, r.electronicNo,
      +(RES.comp[i] * 100).toFixed(1), riskTxt(i),
      note || (RES.reasons.get(i) || []).map(o => o.t).join(' | '),
      stTxt(i), memos[i] || ''];
  };
  const wb = XLSX.utils.book_new();
  const s1 = XLSX.utils.aoa_to_sheet([
    ['العزل الذكي - تقرير فحص الفواتير الالكترونية'],
    ['اعداد الباحث', 'محمود الباز فوزي قابيل - اغراض البحث العلمي فقط'],
    ['هاتف التواصل', '01067777481'], ['تاريخ الفحص', RES.params.date],
    ['المصدر', RAW.source], ['اجمالي الفواتير', FEAT.meta.length],
    ['الفواتير المعزولة', RES.iso.size], ['خطورة عالية', RES.risk.filter(r => r === 2).length],
    ['خطورة متوسطة', RES.risk.filter(r => r === 1).length],
    ['العينة العشوائية', RES.rand.size + ' (' + RES.params.rpct + '%)'],
    ['رقم الثبات', RES.params.seed], ['اتفاق الطرق', RES.cons + '%'],
    ['الطرق المستخدمة', 'غابة العزل + التجميع + الشبكة العصبية']
  ]);
  const s2 = XLSX.utils.aoa_to_sheet([H, ...isoSorted().map(i => rowOf(i))]);
  const s3 = XLSX.utils.aoa_to_sheet([H, ...randSorted().map(i => rowOf(i, 'اختيار عشوائي حسب معيار المراجعة المصري 530'))]);
  const s4 = XLSX.utils.aoa_to_sheet([['الوقت', 'الحدث'], ...auditLog.map(l => [l.time, l.msg])]);
  [s2, s3, s4].forEach(s => s['!views'] = [{ rightToLeft: true }]);
  s2['!cols'] = s3['!cols'] = H.map((_, c) => ({ wch: c === 15 ? 60 : 15 }));
  s1['!cols'] = [{ wch: 22 }, { wch: 55 }];
  s4['!cols'] = [{ wch: 12 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, s1, 'ملخص الفحص');
  XLSX.utils.book_append_sheet(wb, s2, 'الفواتير المعزولة');
  XLSX.utils.book_append_sheet(wb, s3, 'العينة العشوائية');
  XLSX.utils.book_append_sheet(wb, s4, 'سجل التدقيق');
  XLSX.writeFile(wb, `العزل_الذكي_تقرير_${RES.params.date.replaceAll('/', '-')}.xlsx`);
  setStep(5);
  log('تم تصدير تقرير Excel (4 اوراق: ملخص، معزولة، عينة، سجل)', 'lg-ok');
  toast('تم تنزيل تقرير Excel');
}

function reportHTML() {
  const P = RES.params;
  const tbl = idx => `
  <table><thead><tr>${HEADERS_AR.map(h => `<th>${h}</th>`).join('')}<th>درجة الشك</th><th>اسباب العزل</th><th>حالة المراجعة</th></tr></thead>
  <tbody>${idx.map(i => {
    const r = FEAT.meta[i], rs = (RES.reasons.get(i) || []).map(o => o.t).join(' - ');
    return `<tr><td>${esc(r.serial)}</td><td>${esc(r.details)}</td><td>${esc(r.docType)}</td><td>${esc(r.docVersion)}</td>
    <td>${r.status}</td><td>${r.issueDate ? ddmmyyyy(r.issueDate) : ''}</td><td>${r.submitDate ? ddmmyyyy(r.submitDate) : ''}</td>
    <td>${r.currency}</td><td>${fmt(r.amount)}</td><td>${fmt(r.vat)}</td><td>${fmt(r.total)}</td>
    <td>${esc(r.internalNo)}</td><td>${esc(r.electronicNo)}</td>
    <td>${(RES.comp[i] * 100).toFixed(1)}%</td><td>${esc(rs)}${memos[i] ? '<br>تعليق المراجع: ' + esc(memos[i]) : ''}</td><td>${stTxt(i)}</td></tr>`;
  }).join('')}</tbody></table>`;
  const tests = QUICK.map(q => `<li>${q.name}: ${FEAT.meta.filter(q.f).length} حالة</li>`).join('');
  return `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير العزل الذكي</title>
  <style>
   body{font-family:'Calibri','Segoe UI',sans-serif;font-size:14px;color:#1e293b;margin:0;padding:26px}
   .cover{border:3px double #0e2a47;padding:24px 28px;margin-bottom:24px}
   h1{color:#0e2a47;font-size:24px;margin:0 0 4px}
   h2{color:#0e2a47;border-bottom:2px solid #d97706;padding-bottom:4px;margin-top:26px}
   .sub{color:#64748b}.meta{margin-top:10px;font-size:13px}
   table{border-collapse:collapse;width:100%;margin:10px 0}
   th,td{border:1px solid #64748b;padding:4px 7px;font-size:11px;text-align:right}
   th{background:#0e2a47;color:#fff}
   tr:nth-child(even) td{background:#f1f5f9}
   .note{background:#fef3e2;border:1px solid #d97706;padding:10px 14px;font-size:12px;margin-top:20px}
   @page{size:A4;margin:1.4cm}
  </style></head><body>
  <div class="cover">
    <h1>العزل الذكي - تقرير فحص الفواتير الالكترونية</h1>
    <p class="sub">عزل الفواتير المشكوك فيها وتوجيه المراجعة اليدوية باستخدام ثلاث طرق ذكية تعمل بدون تدخل مسبق</p>
    <p class="meta">اعداد الباحث: محمود الباز فوزي قابيل - اغراض البحث العلمي فقط | هاتف: 01067777481<br>
    تاريخ الفحص: ${P.date} | المصدر: ${esc(RAW.source)} | رقم الثبات: ${P.seed}</p>
  </div>
  <h2>1 - ملخص الفحص</h2>
  <table>
   <tr><th>اجمالي الفواتير</th><td>${FEAT.meta.length}</td><th>الفواتير المعزولة</th><td>${RES.iso.size}</td></tr>
   <tr><th>خطورة عالية</th><td>${RES.risk.filter(r => r === 2).length}</td><th>خطورة متوسطة</th><td>${RES.risk.filter(r => r === 1).length}</td></tr>
   <tr><th>العينة العشوائية</th><td>${RES.rand.size} (${P.rpct}%)</td><th>اتفاق الطرق الثلاث</th><td>${RES.cons}%</td></tr>
  </table>
  <h2>2 - نتائج الاختبارات السريعة</h2>
  <ul>${tests}</ul>
  <h2>3 - طريقة العمل</h2>
  <p>فحصت كل الفواتير بثلاث طرق معا: غابة العزل (تعزل القيم الغريبة)، التجميع (يبعد الفواتير الخارجة عن المجموعات)، الشبكة العصبية (تلتقط ما يخالف الشكل المعتاد). ثم جمعت الدرجات وحددت الفواتير المشكوك فيها، وكتب سبب واضح لكل عزل.</p>
  <h2>4 - الفواتير المعزولة للمراجعة اليدوية (بترتيب الملف الاصلي)</h2>
  ${tbl(isoSorted())}
  <h2>5 - العينة العشوائية ${P.rpct}% (معيار المراجعة المصري 530)</h2>
  ${tbl(randSorted())}
  <div class="note">تنبيه: اعد هذا التقرير لاغراض البحث العلمي فقط، ونتائجه مؤشرات تساعد المراجع ولا تغني عن حكمه المهني. اعداد الباحث محمود الباز فوزي قابيل - هاتف 01067777481.</div>
  </body></html>`;
}
function exportWord() {
  if (!RES) return toast('شغل الفحص اولا', true);
  const blob = new Blob(['\ufeff', reportHTML()], { type: 'application/vnd.ms-word;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `العزل_الذكي_تقرير_${RES.params.date.replaceAll('/', '-')}.doc`;
  a.click(); URL.revokeObjectURL(a.href);
  setStep(5);
  log('تم تصدير تقرير Word', 'lg-ok');
  toast('تم تنزيل تقرير Word');
}
function printReport() {
  if (!RES) return toast('شغل الفحص اولا', true);
  const w = window.open('', '_blank');
  w.document.write(reportHTML().replace('</body>', '<script>setTimeout(()=>print(),400)<\/script></body>'));
  w.document.close();
  setStep(5);
}
function exportJson() {
  if (!RES) return toast('شغل الفحص اولا', true);
  const data = { platform: 'العزل الذكي', researcher: 'محمود الباز فوزي قابيل', phone: '01067777481',
    date: RES.params.date, params: RES.params, total: FEAT.meta.length,
    isolated: isoSorted().map(i => ({ ...FEAT.meta[i], reasons: RES.reasons.get(i).map(o => o.t),
      score: RES.comp[i], risk: ['منخفضة','متوسطة','عالية'][RES.risk[i]], status: stTxt(i), memo: memos[i] || '' })),
    randomSample: randSorted(), auditLog };
  const blob = new Blob([JSON.stringify(data, (k, v) => (k[0] === '_' || v instanceof Date) ? undefined : v, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `العزل_الذكي_نتائج_${RES.params.date.replaceAll('/', '-')}.json`; a.click();
  setStep(5);
}

/* البيانات التجريبية */
function demoRows() {
  const rng = ML.mulberry32(20251126);
  const randn = () => { let u = 0, v = 0; while (!u) u = rng(); while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const suppliers = ['شركة النيل للتوريدات الصناعية','مجموعة الدلتا التجارية','مصنع الهرم للمواد الغذائية',
    'شركة القناة للخدمات اللوجستية','مؤسسة الاهرام للحلول الهندسية','شركة الاسكندرية للتعبئة والتغليف',
    'شركة المستقبل للاتصالات','مجموعة الصعيد للتنمية','شركة بورسعيد للاستيراد','مصنع المحلة للغزل والنسيج',
    'شركة سيناء للتعدين','مؤسسة الوجه القبلي للتجارة'];
  const N = 132, rows = [];
  for (let i = 0; i < N; i++) {
    const amount = Math.round(Math.exp(8.4 + randn() * 1.1) * 100) / 100;
    const vat = Math.round(amount * VAT * 100) / 100;
    const issue = new Date(2025, 9, 20 + Math.floor(rng() * 36));
    const submit = new Date(+issue + Math.floor(rng() * 4) * 864e5);
    rows.push({
      serial: i + 1, details: suppliers[Math.floor(rng() * suppliers.length)],
      docType: rng() < .85 ? 'فاتورة ضريبية' : (rng() < .5 ? 'اشعار دائن' : 'اشعار مدين'),
      docVersion: '1.0', status: 'Valid', issueDate: issue, submitDate: submit,
      currency: 'EGP', amount, vat, total: Math.round((amount + vat) * 100) / 100,
      internalNo: `INV-2025-${1001 + i}`,
      electronicNo: 'EGS' + String(10 ** 14 + Math.floor(rng() * 9 * 10 ** 13))
    });
  }
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
  RAW = { rows: demoRows(), source: 'بيانات تجريبية جاهزة (132 فاتورة)' };
  $('#fileMeta').hidden = false;
  $('#fileMetaTxt').textContent = `${RAW.source} - جاهز للفحص`;
  $('#btnStart').disabled = false;
  setStep(2);
  log('حملنا 132 فاتورة تجريبية تحاكي ملفات منظومة الفاتورة الالكترونية، وفيها 11 حالة غير طبيعية عمدا لاختبار المنصة', 'lg-ok');
  toast('حملت البيانات التجريبية، اضغط بدء عملية الاختبار');
}
function downloadDemoXlsx() {
  if (typeof XLSX === 'undefined') return toast('مكتبة Excel لم تحمل بعد', true);
  const aoa = [HEADERS_AR];
  demoRows().forEach(r => aoa.push([r.serial, r.details, r.docType, r.docVersion, r.status,
    ddmmyyyy(r.issueDate), ddmmyyyy(r.submitDate), r.currency, r.amount, r.vat, r.total,
    r.internalNo, r.electronicNo]));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = HEADERS_AR.map(() => ({ wch: 16 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'الفواتير');
  XLSX.writeFile(wb, 'ملف_تجريبي_العزل_الذكي.xlsx');
  toast('تم تنزيل الملف التجريبي، ارفعه لتجربة المنصة');
}

/* قراءة ملف المستخدم */
async function handleFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  if (!['xlsx', 'xls', 'csv', 'json'].includes(ext)) return toast('الصيغة غير مدعومة. استخدم xlsx او xls او csv او json', true);
  if (typeof XLSX === 'undefined' && ext !== 'json') return toast('مكتبة قراءة Excel لم تحمل بعد', true);
  log(`جاري قراءة الملف: ${file.name}`);
  try {
    const rows = ext === 'json' ? parseJson(await file.text())
                                : parseWorkbook(XLSX.read(await file.arrayBuffer(), { type: 'array' }));
    RAW = { rows, source: file.name };
    $('#fileMeta').hidden = false;
    $('#fileMetaTxt').textContent = `${file.name} - ${rows.length} فاتورة - جاهز للفحص`;
    $('#btnStart').disabled = false;
    setStep(2);
    log(`تمت القراءة: ${rows.length} فاتورة (Valid: ${rows.filter(r => r.status === 'Valid').length} / Invalid: ${rows.filter(r => r.status === 'Invalid').length} / Cancelled: ${rows.filter(r => r.status === 'Cancelled').length})`, 'lg-ok');
    toast('تم تحليل الملف بنجاح');
  } catch (e) {
    log('فشل التحليل: ' + e.message, 'lg-err'); toast(e.message, true);
  }
}

/* الاقلاع */
document.addEventListener('DOMContentLoaded', () => {
  setStep(1);
  log('العزل الذكي - تم تشغيل النظام، في انتظار ملف الفواتير', 'lg-ok');

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
  $('#optCont').addEventListener('input', e => $('#contVal').textContent = e.target.value + '%');
  $('#btnReset').addEventListener('click', () => {
    RAW = { rows: [], source: '' }; FEAT = STD = RES = null;
    $('#dashboard').hidden = true; $('#fileMeta').hidden = true; $('#fileInput').value = '';
    $('#btnStart').disabled = true; setStep(1);
    $('#logBox').innerHTML = ''; auditLog.length = 0;
    log('تمت اعادة الضبط، في انتظار ملف جديد', 'lg-dim');
    toast('تمت اعادة الضبط');
  });

  $('#btnWord').addEventListener('click', exportWord);
  $('#btnExcel').addEventListener('click', exportExcel);
  $('#btnPrint').addEventListener('click', printReport);
  $('#btnJson').addEventListener('click', exportJson);

  const io = new IntersectionObserver(es => es.forEach(x => x.isIntersecting && x.target.classList.add('in')), { threshold: .12 });
  $$('.rv').forEach(el => io.observe(el));
  addEventListener('scroll', () => {
    const p = scrollY / (document.body.scrollHeight - innerHeight || 1);
    $('#scrollbar').style.width = (p * 100) + '%';
  }, { passive: true });
  addEventListener('resize', () => { if (RES && activeTab === 'overview') drawAllCharts(); });
});