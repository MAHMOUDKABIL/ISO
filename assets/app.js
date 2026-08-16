/* ══════════════════ ديوان المُراجِع — خوارزميات غير مُشرِفة ══════════════════ */

/* --------- أدوات عامة --------- */
const fmt = (n, d=0) => Number(n).toLocaleString('en-US', {minimumFractionDigits:d, maximumFractionDigits:d});
const rand = (a,b) => a + Math.random()*(b-a);
const sum  = arr => arr.reduce((s,x)=>s+x,0);
const mean = arr => sum(arr)/arr.length;
const std  = arr => { const m=mean(arr); return Math.sqrt(sum(arr.map(x=>(x-m)**2))/arr.length); };

/* --------- توليد بيانات تجريبية --------- */
function demoData(n=60){
  const vendors = ["شركة النخيل للتوريدات","مؤسسة الأفق للتقنية","مصنع البحر للمعادن",
                   "دار الصرح للطباعة","شركة المدى للخدمات"];
  const bases = [1200, 2500, 4800, 950, 7300];
  const rows = [];
  for(let i=0;i<n;i++){
    const base = bases[Math.floor(Math.random()*bases.length)];
    rows.push({id:`INV-${1000+i}`, label:vendors[Math.floor(Math.random()*vendors.length)],
               amount:+(base*rand(.8,1.25)).toFixed(2)});
  }
  rows.push({id:'INV-1901', label:vendors[1], amount:97500});
  rows.push({id:'INV-1902', label:vendors[3], amount:13.5});
  rows.push({id:'INV-1903', label:vendors[0], amount:88888});
  rows.push({id:'INV-1904', label:vendors[2], amount:61234});
  return rows;
}

/* --------- قراءة CSV --------- */
function parseCSV(text){
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',').map(h=>h.trim());
  const rows = [];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim()) continue;
    const cols = lines[i].split(',');
    const obj = {};
    headers.forEach((h,j)=> obj[h]=cols[j]?.trim()||'');
    rows.push(obj);
  }
  return {headers, rows};
}

function findCol(rows, keys){
  if(!rows.length) return null;
  const keys0 = Object.keys(rows[0]);
  for(const k of keys) for(const c of keys0) if(c.toLowerCase().includes(k.toLowerCase())) return c;
  return null;
}

function normalizeRecords(raw, headers){
  const amtCol = findCol(raw, ['مبلغ','قيمة','amount','total','price']);
  const lblCol = findCol(raw, ['مورد','بيان','وصف','بند','vendor','description','item']);
  const numCol = findCol(raw, ['رقم','number','id','no','ref']);
  if(!amtCol) throw new Error('لم أجد عمود المبلغ — تأكد أن الملف يحوي عمودًا رقميًا.');
  return raw.map((r,i)=>({
    id: r[numCol] || String(i+1),
    label: r[lblCol] || `بند ${i+1}`,
    amount: +String(r[amtCol]).replace(/,/g,'')
  })).filter(r=>!isNaN(r.amount) && r.amount>0);
}

/* --------- Isolation Forest (مبسّطة) --------- */
function iTree(data, depth, maxDepth){
  if(data.length<=1 || depth>=maxDepth) return {size:data.length};
  const cols = Object.keys(data[0]).filter(k=>typeof data[0][k]==='number');
  const col = cols[Math.floor(Math.random()*cols.length)];
  const vals = data.map(r=>r[col]);
  const min = Math.min(...vals), max = Math.max(...vals);
  if(min===max) return {size:data.length};
  const split = rand(min,max);
  const left = data.filter(r=>r[col]<split);
  const right = data.filter(r=>r[col]>=split);
  return {split, col, left:iTree(left,depth+1,maxDepth), right:iTree(right,depth+1,maxDepth)};
}

function pathLength(point, tree, depth=0){
  if(tree.size!==undefined) return depth + (tree.size<=1?0:2*(Math.log(tree.size-1)+0.5772));
  return point[tree.col]<tree.split ? pathLength(point, tree.left, depth+1) : pathLength(point, tree.right, depth+1);
}

function isolationForest(rows, contamination=0.08, nTrees=150){
  const feats = rows.map(r=>({
    ...r,
    amount:r.amount,
    log: Math.log1p(r.amount),
    digits: Math.floor(Math.log10(Math.max(r.amount,1)))+1
  }));
  const subSize = Math.min(256, feats.length);
  const trees = [];
  for(let t=0;t<nTrees;t++){
    const sample = [];
    for(let i=0;i<subSize;i++) sample.push(feats[Math.floor(Math.random()*feats.length)]);
    trees.push(iTree(sample, 0, Math.ceil(Math.log2(subSize))));
  }
  const c = 2*(Math.log(subSize-1)+0.5772) - 2*(subSize-1)/subSize;
  const scores = feats.map(f=>{
    const avg = mean(trees.map(t=>pathLength(f,t)));
    return Math.pow(2, -avg/c);
  });
  const sorted = [...scores].sort((a,b)=>b-a);
  const threshold = sorted[Math.floor(contamination*sorted.length)-1] || 0.5;
  const min=Math.min(...scores), max=Math.max(...scores);
  return rows.map((r,i)=>({
    ...r,
    score: ((scores[i]-min)/(max-min+1e-9))*100,
    flag: scores[i]>=threshold
  }));
}

/* --------- خوارزمية K-Means --------- */
function kmeans(points, k, maxIter=50){
  if(points.length<k) throw new Error('عدد الصفوف أقل من عدد الشرائح.');
  let centroids = [];
  const used = new Set();
  while(centroids.length<k){
    const i = Math.floor(Math.random()*points.length);
    if(!used.has(i)){used.add(i); centroids.push([...points[i]]);}
  }
  let labels = Array(points.length).fill(0);
  for(let it=0;it<maxIter;it++){
    const newLabels = points.map(p=>{
      let best=0, bestD=Infinity;
      centroids.forEach((c,i)=>{
        const d = c.reduce((s,v,j)=>s+(v-p[j])**2,0);
        if(d<bestD){bestD=d;best=i;}
      });
      return best;
    });
    if(JSON.stringify(newLabels)===JSON.stringify(labels)) break;
    labels = newLabels;
    for(let i=0;i<k;i++){
      const cluster = points.filter((_,j)=>labels[j]===i);
      if(!cluster.length) continue;
      const dim = cluster[0].length;
      centroids[i] = Array(dim).fill(0).map((_,j)=>mean(cluster.map(p=>p[j])));
    }
  }
  return labels;
}

/* --------- قانون بنفور --------- */
function benfordLaw(amounts){
  const ints = amounts.map(a=>Math.abs(Math.floor(a))).filter(a=>a>0);
  if(ints.length<30) throw new Error('قانون بنفور يحتاج ٣٠ رقمًا على الأقل.');
  const first = ints.map(n=>+String(n)[0]);
  const obs = Array(9).fill(0);
  first.forEach(d=>{if(d>=1&&d<=9) obs[d-1]++;});
  obs.forEach((v,i)=>obs[i]=v/ints.length);
  const exp = Array.from({length:9},(_,i)=>Math.log10(1+1/(i+1)));
  const mad = obs.reduce((s,v,i)=>s+Math.abs(v-exp[i]),0)/9;
  let grade, verdict;
  if(mad<0.006){grade='ok';verdict='توافق ممتاز مع القانون — لا مؤشرات على تلاعب';}
  else if(mad<0.012){grade='ok';verdict='توافق مقبول — الوضع طبيعي إجمالًا';}
  else if(mad<0.015){grade='warn';verdict='توافق ضعيف — يُنصح بفحص استقصائي';}
  else {grade='bad';verdict='انحراف جوهري عن القانون — يلزم فحص موسّع';}
  return {obs, exp, mad, grade, verdict, n:ints.length};
}

/* --------- العيّنات --------- */
function simpleSample(N,n){
  const s = new Set();
  while(s.size<n) s.add(1+Math.floor(Math.random()*N));
  return [...s].sort((a,b)=>a-b);
}
function systematicSample(N,n){
  const k = Math.max(1, Math.floor(N/n));
  const start = 1+Math.floor(Math.random()*k);
  const sel=[];
  for(let i=start;i<=N&&sel.length<n;i+=k) sel.push(i);
  return {sel, k, start};
}
function musSample(amounts, n){
  if(!amounts.length) throw new Error('MUS تحتاج مبالغ.');
  const total = sum(amounts);
  const interval = total/n;
  const r0 = Math.random()*interval;
  const points = Array.from({length:n},(_,i)=>r0+i*interval);
  let cum=0, pi=0;
  const picks=[];
  for(const p of points){
    while(pi<amounts.length-1 && cum+amounts[pi]<p){cum+=amounts[pi];pi++;}
    if(!picks.length || picks[picks.length-1].idx!==pi)
      picks.push({idx:pi, amount:amounts[pi], id:String(pi+1), label:`مفردة ${pi+1}`});
  }
  return {picks, total, interval};
}

/* --------- تصدير للخارج --------- */
window.AuditorTools = {
  demoData, parseCSV, normalizeRecords, isolationForest,
  kmeans, benfordLaw, simpleSample, systematicSample, musSample,
  fmt, mean, std, sum
};

/* --------- تهيئة القوائم النشطة --------- */
document.addEventListener('DOMContentLoaded', ()=>{
  const path = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.side nav a').forEach(a=>{
    const href = a.getAttribute('href').split('/').pop();
    if(href===path) a.classList.add('active');
    else a.classList.remove('active');
  });
});