/* ══════════ ديوان المُراجِع — د. محمود الباز قابيل ══════════ */
const AUDITOR = { name:'د. محمود الباز قابيل', title:'محاسب ومراجع قانوني' };

const fmt  = (n,d=0)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const rand = (a,b)=>a+Math.random()*(b-a);
const sum  = a=>a.reduce((s,x)=>s+x,0);
const mean = a=>sum(a)/a.length;
const std  = a=>{const m=mean(a);return Math.sqrt(sum(a.map(x=>(x-m)**2))/a.length)};
const todayAr = ()=>new Intl.DateTimeFormat('ar-EG',{dateStyle:'long'}).format(new Date());

/* --------- بيانات تجريبية --------- */
function demoData(n=60){
  const vendors=["شركة النخيل للتوريدات","مؤسسة الأفق للتقنية","مصنع البحر للمعادن","دار الصرح للطباعة","شركة المدى للخدمات"];
  const bases=[1200,2500,4800,950,7300], rows=[];
  for(let i=0;i<n;i++){
    const base=bases[Math.floor(Math.random()*bases.length)];
    rows.push({id:`INV-${1000+i}`,label:vendors[Math.floor(Math.random()*vendors.length)],amount:+(base*rand(.8,1.25)).toFixed(2)});
  }
  rows.push({id:'INV-1901',label:vendors[1],amount:97500});
  rows.push({id:'INV-1902',label:vendors[3],amount:13.5});
  rows.push({id:'INV-1903',label:vendors[0],amount:88888});
  rows.push({id:'INV-1904',label:vendors[2],amount:61234});
  return rows;
}

/* --------- قراءة الجداول (xlsx / csv / txt) --------- */
function readWorkbook(file){
  return new Promise((res,rej)=>{
    const fr=new FileReader();
    fr.onload=e=>{
      try{
        const wb=XLSX.read(new Uint8Array(e.target.result),{type:'array'});
        const ws=wb.Sheets[wb.SheetNames[0]];
        res(XLSX.utils.sheet_to_json(ws,{defval:''}));
      }catch(err){rej(new Error('تعذر قراءة الملف — تأكد أنه ملف جدول صالح (xlsx/xls/csv/txt).'));}
    };
    fr.onerror=()=>rej(new Error('تعذر فتح الملف.'));
    fr.readAsArrayBuffer(file);
  });
}
function parseCSV(text){
  const lines=text.trim().split(/\r?\n/);
  const headers=lines[0].split(',').map(h=>h.trim());
  const rows=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i].trim())continue;
    const cols=lines[i].split(',');
    const obj={};headers.forEach((h,j)=>obj[h]=cols[j]?.trim()||'');
    rows.push(obj);
  }
  return rows;
}
function findCol(rows,keys){
  if(!rows.length)return null;
  const cols=Object.keys(rows[0]);
  for(const k of keys)for(const c of cols)if(String(c).toLowerCase().includes(k))return c;
  return null;
}
function normalizeRecords(raw){
  const amtCol=findCol(raw,['مبلغ','قيمة','amount','total','price']);
  const lblCol=findCol(raw,['مورد','بيان','وصف','بند','vendor','description','item']);
  const numCol=findCol(raw,['رقم','number','id','no','ref']);
  if(!amtCol)throw new Error('لم أجد عمود المبلغ — استخدم النموذج الجاهز أو تأكد من وجود عمود «المبلغ» أو «القيمة».');
  return raw.map((r,i)=>({
    id:String(r[numCol]||i+1),
    label:String(r[lblCol]||`بند ${i+1}`),
    amount:+String(r[amtCol]).replace(/,/g,'')
  })).filter(r=>!isNaN(r.amount)&&r.amount>0);
}

/* --------- النموذج الجاهز للتحميل --------- */
const TEMPLATE_HEADERS=['رقم الفاتورة','المورد','التاريخ','المبلغ'];
const TEMPLATE_ROWS=[
  ['INV-1001','شركة النخيل للتوريدات','2025-01-05',4800],
  ['INV-1002','مؤسسة الأفق للتقنية','2025-01-08',2450],
  ['INV-1003','مصنع البحر للمعادن','2025-01-12',7300],
  ['INV-1004','دار الصرح للطباعة','2025-01-15',1150],
  ['INV-1005','شركة المدى للخدمات','2025-01-19',3600],
];
function downloadTemplateXLSX(){
  const ws=XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS,...TEMPLATE_ROWS]);
  ws['!cols']=[{wch:14},{wch:30},{wch:12},{wch:12}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'الفواتير');
  XLSX.writeFile(wb,'نموذج-الفحص-ديوان-المراجع.xlsx');
}
function downloadTemplateCSV(){
  const csv='\uFEFF'+[TEMPLATE_HEADERS.join(','),...TEMPLATE_ROWS.map(r=>r.join(','))].join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download='نموذج-الفحص.csv';a.click();
  URL.revokeObjectURL(a.href);
}

/* --------- 1) غابة العزل (Isolation Forest) --------- */
function iTree(data,depth,maxDepth){
  if(data.length<=1||depth>=maxDepth)return{size:data.length};
  const cols=Object.keys(data[0]).filter(k=>typeof data[0][k]==='number');
  const col=cols[Math.floor(Math.random()*cols.length)];
  const vals=data.map(r=>r[col]),min=Math.min(...vals),max=Math.max(...vals);
  if(min===max)return{size:data.length};
  const split=rand(min,max);
  return{split,col,left:iTree(data.filter(r=>r[col]<split),depth+1,maxDepth),
         right:iTree(data.filter(r=>r[col]>=split),depth+1,maxDepth)};
}
function pathLen(p,tree,d=0){
  if(tree.size!==undefined)return d+(tree.size<=1?0:2*(Math.log(tree.size-1)+0.5772));
  return p[tree.col]<tree.split?pathLen(p,tree.left,d+1):pathLen(p,tree.right,d+1);
}
function isolationForest(rows,contamination=0.08,nTrees=150){
  const feats=rows.map(r=>({...r,amount:r.amount,log:Math.log1p(r.amount),
    digits:Math.floor(Math.log10(Math.max(r.amount,1)))+1}));
  const sub=Math.min(256,feats.length),trees=[];
  for(let t=0;t<nTrees;t++){
    const s=[];for(let i=0;i<sub;i++)s.push(feats[Math.floor(Math.random()*feats.length)]);
    trees.push(iTree(s,0,Math.ceil(Math.log2(sub))));
  }
  const c=2*(Math.log(sub-1)+0.5772)-2*(sub-1)/sub;
  const scores=feats.map(f=>Math.pow(2,-mean(trees.map(t=>pathLen(f,t)))/c));
  const sorted=[...scores].sort((a,b)=>b-a);
  const th=sorted[Math.max(0,Math.floor(contamination*sorted.length)-1)]||.5;
  const min=Math.min(...scores),max=Math.max(...scores);
  return rows.map((r,i)=>({...r,score:((scores[i]-min)/(max-min+1e-9))*100,flag:scores[i]>=th}));
}

/* --------- الفحص الموحّد: الخوارزميات الثلاث معًا --------- */
function ensembleScan(records,contamination=0.08){
  const iso=isolationForest(records,contamination);
  const amounts=records.map(r=>r.amount);
  const m=mean(amounts),s=std(amounts);
  const sorted=[...amounts].sort((a,b)=>a-b);
  const q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))];
  const q1=q(.25),q3=q(.75),iqr=q3-q1;
  const lo=q1-1.5*iqr,hi=q3+1.5*iqr;
  const zAbs=amounts.map(a=>Math.abs(a-m)/(s+1e-9));
  const zMax=Math.max(...zAbs,1e-9);
  const rows=records.map((r,i)=>{
    const outIQR=amounts[i]<lo||amounts[i]>hi;
    const risk=Math.round(Math.min(100,Math.max(0,
      iso[i].score*0.60+(zAbs[i]/zMax*100)*0.25+(outIQR?15:0))));
    return{...r,score:Math.round(iso[i].score),z:+zAbs[i].toFixed(2),outIQR,isoFlag:iso[i].flag,risk};
  });
  rows.sort((a,b)=>b.risk-a.risk);
  return rows;
}
const riskLevel=r=>r>=70?['hi','مرتفعة']:r>=40?['mid','متوسطة']:['lo','منخفضة'];

/* --------- 2) قانون بنفور --------- */
function benfordLaw(amounts){
  const ints=amounts.map(a=>Math.abs(Math.floor(a))).filter(a=>a>0);
  if(ints.length<30)throw new Error('قانون بنفور يحتاج ٣٠ رقمًا على الأقل لنتيجة يُعتد بها.');
  const obs=Array(9).fill(0);
  ints.map(n=>+String(n)[0]).forEach(d=>{if(d>=1&&d<=9)obs[d-1]++;});
  obs.forEach((v,i)=>obs[i]=v/int.length);
  const exp=Array.from({length:9},(_,i)=>Math.log10(1+1/(i+1)));
  const mad=obs.reduce((s,v,i)=>s+Math.abs(v-exp[i]),0)/9;
  let grade,verdict;
  if(mad<0.006){grade='ok';verdict='توافق ممتاز مع القانون — لا مؤشرات على تلاعب';}
  else if(mad<0.012){grade='ok';verdict='توافق مقبول — الوضع طبيعي إجمالًا';}
  else if(mad<0.015){grade='warn';verdict='توافق ضعيف — يُنصح بفحص استقصائي';}
  else{grade='bad';verdict='انحراف جوهري عن القانون — يلزم فحص موسّع';}
  return{obs,exp,mad,grade,verdict,n:ints.length};
}

/* --------- 3) كشف التكرارات والتطابقات --------- */
function findDuplicates(records){
  const byNum={},byPair={},byAmt={};
  records.forEach(r=>{
    (byNum[r.id]??=[]).push(r);
    (byPair[r.label+'|'+r.amount]??=[]).push(r);
    (byAmt[r.amount]??=[]).push(r);
  });
  return{
    dupNum:Object.values(byNum).filter(g=>g.length>1),
    dupPair:Object.values(byPair).filter(g=>g.length>1),
    dupAmt:Object.values(byAmt).filter(g=>g.length>2)
  };
}
function seqGaps(records){
  const nums=records.map(r=>parseInt(String(r.id).replace(/\D/g,'')))
    .filter(n=>!isNaN(n)).sort((a,b)=>a-b);
  if(nums.length<3)return[];
  const gaps=[];
  for(let i=1;i<nums.length;i++)
    if(nums[i]-nums[i-1]>1)gaps.push({from:nums[i-1],to:nums[i],missing:nums[i]-nums[i-1]-1});
  return gaps.slice(0,20);
}

/* --------- 4) العيّنات --------- */
function simpleSample(N,n){
  const s=new Set();
  while(s.size<n)s.add(1+Math.floor(Math.random()*N));
  return[...s].sort((a,b)=>a-b);
}
function systematicSample(N,n){
  const k=Math.max(1,Math.floor(N/n)),start=1+Math.floor(Math.random()*k),sel=[];
  for(let i=start;i<=N&&sel.length<n;i+=k)sel.push(i);
  return{sel,k,start};
}
function musSample(amounts,n){
  const total=sum(amounts),interval=total/n,r0=Math.random()*interval;
  const points=Array.from({length:n},(_,i)=>r0+i*interval);
  let cum=0,pi=0;const picks=[];
  for(const p of points){
    while(pi<amounts.length-1&&cum+amounts[pi]<p){cum+=amounts[pi];pi++;}
    if(!picks.length||picks[picks.length-1].idx!==pi)
      picks.push({idx:pi,amount:amounts[pi],id:String(pi+1),label:`مفردة ${pi+1}`});
  }
  return{picks,total,interval};
}

/* --------- القائمة النشطة --------- */
document.addEventListener('DOMContentLoaded',()=>{
  const path=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.side nav a').forEach(a=>{
    const href=a.getAttribute('href').split('/').pop();
    a.classList.toggle('active',href===path);
  });
});

window.AuditorTools={AUDITOR,fmt,todayAr,demoData,readWorkbook,parseCSV,normalizeRecords,
  downloadTemplateXLSX,downloadTemplateCSV,isolationForest,ensembleScan,riskLevel,
  benfordLaw,findDuplicates,seqGaps,simpleSample,systematicSample,musSample};