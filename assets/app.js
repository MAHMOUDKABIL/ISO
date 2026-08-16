/* ══════════════════════════════════════════════════════════════
   ديوان المُراجِع — د. محمود الباز قابيل
   خوارزميات التعلم الآلي غير الخاضع للإشراف:
   1) غابة العزل Isolation Forest
   2) التجميع K-Means
   3) الشبكات العصبية Autoencoders
   + محرك قابلية التفسير + مصدّرات Word / Excel
═══════════════════════════════════════════════════════════════ */
const AUDITOR={name:'د. محمود الباز قابيل',title:'محاسب ومراجع قانوني'};

/* ---------- أدوات عامة ---------- */
const fmt=(n,d=0)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d});
const rand=(a,b)=>a+Math.random()*(b-a);
const sum=a=>a.reduce((s,x)=>s+x,0);
const mean=a=>a.length?sum(a)/a.length:0;
const std=a=>{const m=mean(a);return Math.sqrt(sum(a.map(x=>(x-m)**2))/a.length)};
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[Math.floor(s.length/2)]||0};
const todayAr=()=>new Intl.DateTimeFormat('ar-EG',{dateStyle:'long'}).format(new Date());
const riskLevel=r=>r>=70?['hi','مرتفعة']:r>=40?['mid','متوسطة']:['lo','منخفضة'];

/* ---------- بيانات تجريبية ---------- */
function demoData(n=60){
  const vendors=["شركة النخيل للتوريدات","مؤسسة الأفق للتقنية","مصنع البحر للمعادن","دار الصرح للطباعة","شركة المدى للخدمات"];
  const bases=[1200,2500,4800,950,7300],rows=[];
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

/* ---------- قراءة الملفات (xlsx / xls / csv / txt) ---------- */
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
  return lines.slice(1).filter(l=>l.trim()).map(l=>{
    const cols=l.split(','),obj={};
    headers.forEach((h,j)=>obj[h]=cols[j]?.trim()||'');
    return obj;
  });
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
  if(!amtCol)throw new Error('لم أجد عمود المبلغ — حمّل النموذج الجاهز أو تأكد من وجود عمود «المبلغ» أو «القيمة».');
  return raw.map((r,i)=>({
    id:String(r[numCol]||i+1),
    label:String(r[lblCol]||`بند ${i+1}`),
    amount:+String(r[amtCol]).replace(/,/g,'')
  })).filter(r=>!isNaN(r.amount)&&r.amount>0);
}

/* ---------- النموذج الجاهز للتحميل ---------- */
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

/* ---------- تجهيز الميزات وتوحيدها ---------- */
function buildFeatures(rows){
  return rows.map(r=>[r.amount,Math.log1p(r.amount),
    Math.floor(Math.log10(Math.max(r.amount,1)))+1,(r.amount%1>0)?1:0]);
}
function standardize(rows){
  const feats=buildFeatures(rows);
  const dim=feats[0].length;
  const means=Array.from({length:dim},(_,j)=>mean(feats.map(f=>f[j])));
  const stds=Array.from({length:dim},(_,j)=>std(feats.map(f=>f[j]))+1e-9);
  return feats.map(f=>f.map((v,j)=>(v-means[j])/stds[j]));
}

/* ══════════ الخوارزمية 1: غابة العزل Isolation Forest ══════════ */
function iTree(data,depth,maxDepth){
  if(data.length<=1||depth>=maxDepth)return{size:data.length};
  const cols=Object.keys(data[0]).filter(k=>typeof data[0][k]==='number');
  const col=cols[Math.floor(Math.random()*cols.length)];
  const vals=data.map(r=>r[col]),min=Math.min(...vals),max=Math.max(...vals);
  if(min===max)return{size:data.length};
  const split=rand(min,max);
  return{split,col,
    left:iTree(data.filter(r=>r[col]<split),depth+1,maxDepth),
    right:iTree(data.filter(r=>r[col]>=split),depth+1,maxDepth)};
}
function pathLen(p,tree,d=0){
  if(tree.size!==undefined)return d+(tree.size<=1?0:2*(Math.log(tree.size-1)+0.5772));
  return p[tree.col]<tree.split?pathLen(p,tree.left,d+1):pathLen(p,tree.right,d+1);
}
function isolationForest(rows,contamination=0.08,nTrees=150){
  const feats=rows.map((r,i)=>({idx:i,...buildFeatures([r])[0]}));
  const sub=Math.min(256,feats.length),trees=[];
  for(let t=0;t<nTrees;t++){
    const s=[];for(let i=0;i<sub;i++)s.push(feats[Math.floor(Math.random()*feats.length)]);
    trees.push(iTree(s,0,Math.ceil(Math.log2(Math.max(2,sub)))));
  }
  const c=2*(Math.log(Math.max(1,sub-1))+0.5772)-2*Math.max(1,sub-1)/sub;
  const raw=feats.map(f=>Math.pow(2,-mean(trees.map(t=>pathLen(f,t)))/c));
  const sorted=[...raw].sort((a,b)=>b-a);
  const th=sorted[Math.max(0,Math.floor(contamination*sorted.length)-1)]??0.5;
  const min=Math.min(...raw),max=Math.max(...raw);
  return rows.map((r,i)=>({...r,
    score:((raw[i]-min)/(max-min+1e-9))*100,
    flag:raw[i]>=th}));
}

/* ══════════ الخوارزمية 2: التجميع K-Means ══════════ */
function kmeans(points,k,maxIter=60){
  if(points.length<k)throw new Error('عدد الصفوف أقل من عدد المجموعات.');
  const used=new Set();let centroids=[];
  while(centroids.length<k){
    const i=Math.floor(Math.random()*points.length);
    if(!used.has(i)){used.add(i);centroids.push([...points[i]]);}
  }
  let labels=Array(points.length).fill(0);
  for(let it=0;it<maxIter;it++){
    const newLabels=points.map(p=>{
      let best=0,bestD=Infinity;
      centroids.forEach((c,i)=>{
        const d=c.reduce((s,v,j)=>s+(v-p[j])**2,0);
        if(d<bestD){bestD=d;best=i;}
      });
      return best;
    });
    if(JSON.stringify(newLabels)===JSON.stringify(labels))break;
    labels=newLabels;
    for(let i=0;i<k;i++){
      const cl=points.filter((_,j)=>labels[j]===i);
      if(!cl.length)continue;
      centroids[i]=Array(cl[0].length).fill(0).map((_,j)=>mean(cl.map(p=>p[j])));
    }
  }
  return{labels,centroids};
}
function kmeansAnomaly(rows,k=4){
  const feats=standardize(rows);
  k=Math.min(k,Math.max(2,Math.floor(rows.length/3)));
  const {labels,centroids}=kmeans(feats,k);
  const sizes=Array.from({length:k},(_,c)=>labels.filter(l=>l===c).length);
  const dists=feats.map((p,i)=>Math.sqrt(centroids[labels[i]].reduce((s,v,j)=>s+(v-p[j])**2,0)));
  const dmax=Math.max(...dists,1e-9);
  const scores=dists.map((d,i)=>{
    let s=d/dmax*100;
    if(sizes[labels[i]]/rows.length<0.05)s=Math.min(100,s+25); /* عقوبة المجموعات الصغيرة */
    return s;
  });
  return{labels,sizes,dists,scores,k};
}

/* ══════════ الخوارزمية 3: الشبكات العصبية Autoencoder ══════════ */
function autoencoderAnomaly(rows,epochs=200,lr=0.05){
  const feats=standardize(rows);
  const nIn=feats[0].length,h1=8,h2=2;
  const mk=(r,c)=>{const lim=Math.sqrt(6/(r+c));
    return Array.from({length:r},()=>Array.from({length:c},()=>rand(-lim,lim)));};
  let W1=mk(h1,nIn),b1=Array(h1).fill(0),
      W2=mk(h2,h1),b2=Array(h2).fill(0),
      W3=mk(h1,h2),b3=Array(h1).fill(0),
      W4=mk(nIn,h1),b4=Array(nIn).fill(0);
  const forward=x=>{
    const a1=W1.map((row,i)=>b1[i]+row.reduce((s,w,j)=>s+w*x[j],0)).map(Math.tanh);
    const a2=W2.map((row,i)=>b2[i]+row.reduce((s,w,j)=>s+w*a1[j],0)).map(Math.tanh);
    const a3=W3.map((row,i)=>b3[i]+row.reduce((s,w,j)=>s+w*a2[j],0)).map(Math.tanh);
    const out=W4.map((row,i)=>b4[i]+row.reduce((s,w,j)=>s+w*a3[j],0));
    return{a1,a2,a3,out};
  };
  const N=feats.length;
  for(let e=0;e<epochs;e++){
    let gW1=W1.map(r=>r.map(()=>0)),gb1=Array(h1).fill(0),
        gW2=W2.map(r=>r.map(()=>0)),gb2=Array(h2).fill(0),
        gW3=W3.map(r=>r.map(()=>0)),gb3=Array(h1).fill(0),
        gW4=W4.map(r=>r.map(()=>0)),gb4=Array(nIn).fill(0);
    for(const x of feats){
      const{a1,a2,a3,out}=forward(x);
      const d4=out.map((o,i)=>2*(o-x[i])/nIn);
      for(let i=0;i<nIn;i++){gb4[i]+=d4[i];for(let j=0;j<h1;j++)gW4[i][j]+=d4[i]*a3[j];}
      const d3=a3.map((a,j)=>(1-a*a)*W4.reduce((s,row,i)=>s+d4[i]*row[j],0));
      for(let j=0;j<h1;j++){gb3[j]+=d3[j];for(let k=0;k<h2;k++)gW3[j][k]+=d3[j]*a2[k];}
      const d2=a2.map((a,k)=>(1-a*a)*W3.reduce((s,row,j)=>s+d3[j]*row[k],0));
      for(let k=0;k<h2;k++){gb2[k]+=d2[k];for(let j=0;j<h1;j++)gW2[k][j]+=d2[k]*a1[j];}
      const d1=a1.map((a,j)=>(1-a*a)*W2.reduce((s,row,k)=>s+d2[k]*row[j],0));
      for(let j=0;j<h1;j++){gb1[j]+=d1[j];for(let i=0;i<nIn;i++)gW1[j][i]+=d1[j]*x[i];}
    }
    const st=lr/N;
    W4=W4.map((row,i)=>row.map((w,j)=>w-st*gW4[i][j]));b4=b4.map((v,i)=>v-st*gb4[i]);
    W3=W3.map((row,j)=>row.map((w,k)=>w-st*gW3[j][k]));b3=b3.map((v,j)=>v-st*gb3[j]);
    W2=W2.map((row,k)=>row.map((w,j)=>w-st*gW2[k][j]));b2=b2.map((v,k)=>v-st*gb2[k]);
    W1=W1.map((row,j)=>row.map((w,i)=>w-st*gW1[j][i]));b1=b1.map((v,j)=>v-st*gb1[j]);
  }
  const errs=feats.map(x=>{
    const{out}=forward(x);
    return out.reduce((s,o,i)=>s+(o-x[i])**2,0)/nIn;
  });
  const min=Math.min(...errs),max=Math.max(...errs);
  return errs.map(e=>(e-min)/(max-min+1e-9)*100);
}

/* ══════════ الفحص الموحّد: الخوارزميات الثلاث معًا ══════════ */
function flagTop(scores,contamination){
  const sorted=[...scores].sort((a,b)=>b-a);
  const th=sorted[Math.max(0,Math.floor(contamination*scores.length)-1)]??101;
  return scores.map(v=>v>=th);
}
function tripleScan(records,contamination=0.08){
  const iso=isolationForest(records,contamination);
  const km=kmeansAnomaly(records,4);
  const ae=autoencoderAnomaly(records);
  const kmFlag=flagTop(km.scores,contamination);
  const aeFlag=flagTop(ae,contamination);
  const amounts=records.map(r=>r.amount);
  const m=mean(amounts),s=std(amounts),med=median(amounts);

  const rows=records.map((r,i)=>{
    const votes=(iso[i].flag?1:0)+(kmFlag[i]?1:0)+(aeFlag[i]?1:0);
    const risk=Math.round(Math.min(100,
      iso[i].score*0.40+km.scores[i]*0.30+ae[i]*0.30+votes*5));
    return{...r,
      isoScore:Math.round(iso[i].score),isoFlag:iso[i].flag,
      kmScore:Math.round(km.scores[i]),kmFlag:kmFlag[i],
      cluster:km.labels[i]+1,clusterSize:km.sizes[km.labels[i]],
      aeScore:Math.round(ae[i]),aeFlag:aeFlag[i],
      votes,risk,
      z:+(Math.abs(r.amount-m)/(s+1e-9)).toFixed(2),
      median:med};
  });
  rows.forEach(r=>r.reasons=explainRecord(r));
  rows.sort((a,b)=>b.risk-a.risk);
  const isolated=rows.filter(r=>r.votes>=2||r.risk>=70);
  return{rows,isolated,clusters:km.sizes,k:km.k,n:records.length,
    total:sum(amounts)};
}

/* ══════════ محرك قابلية التفسير ══════════ */
function explainRecord(r){
  const reasons=[];
  const ratio=r.amount/(r.median||1);
  if(r.isoFlag)reasons.push(`غابة العزل: درجة عزل ${r.isoScore}٪ — العملية بعيدة عن السلوك العام للسجل.`);
  if(r.aeFlag)reasons.push(`الشبكة العصبية: خطأ إعادة بناء ${r.aeScore}٪ — نمط غير مألوف عجزت الشبكة عن تمثيله.`);
  if(r.kmFlag)reasons.push(`التجميع K-Means: تقع في المجموعة ${r.cluster} الصغيرة (${r.clusterSize} عمليات فقط) وبعيدة عن مركزها بدرجة ${r.kmScore}٪.`);
  if(ratio>=3)reasons.push(`المبلغ ${fmt(r.amount,0)} يبلغ ${ratio.toFixed(1)} ضعف وسيط السجل.`);
  else if(ratio<=0.15)reasons.push(`المبلغ ${fmt(r.amount,2)} أدنى بكثير من وسيط السجل (${fmt(r.median,0)}).`);
  if(r.z>=3)reasons.push(`انحراف إحصائي شديد: Z = ${r.z} عن متوسط السجل.`);
  if(!reasons.length)reasons.push('ضمن النمط الطبيعي للسجل — لم ترصدها الخوارزميات.');
  return reasons;
}

/* ══════════ مصدّرات التقارير (Word / Excel) ══════════ */
function exportWord(title,bodyHtml){
  const html=`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${title}</title>
  <style>
    body{font-family:'Cairo','Segoe UI',Tahoma,sans-serif;direction:rtl;color:#2E3745;font-size:13px}
    h1{color:#0B1F3F;border-bottom:3px solid #0B1F3F;padding-bottom:8px}
    h2{color:#12305B;margin-top:22px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th{background:#0B1F3F;color:#fff;padding:7px 10px;font-size:12px;text-align:right}
    td{border:1px solid #C9D1DC;padding:6px 10px;font-size:12px}
    tr.hit td{background:#EEF2F8}
    .meta{color:#5A6478;font-size:12px}
    .sig{margin-top:40px}
  </style></head><body>
  <h1>${title}</h1>
  <p class="meta">ديوان المُراجِع — ${AUDITOR.name}، ${AUDITOR.title} · تاريخ التقرير: ${todayAr()}</p>
  ${bodyHtml}
  <div class="sig"><b>${AUDITOR.name}</b><br>${AUDITOR.title}<br><br>التوقيع: .........................</div>
  </body></html>`;
  const blob=new Blob(['\ufeff'+html],{type:'application/msword'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=title.replace(/[^\u0600-\u06FFa-zA-Z0-9- ]/g,'')+'.doc';
  a.click();
  URL.revokeObjectURL(a.href);
}
function exportExcel(filename,sheets){
  const wb=XLSX.utils.book_new();
  sheets.forEach(s=>{
    const ws=XLSX.utils.aoa_to_sheet(s.rows);
    if(s.widths)ws['!cols']=s.widths.map(w=>({wch:w}));
    XLSX.utils.book_append_sheet(wb,ws,s.name);
  });
  XLSX.writeFile(wb,filename);
}

/* ══════════ قانون بنفور ══════════ */
function benfordLaw(amounts){
  const ints=amounts.map(a=>Math.abs(Math.floor(a))).filter(a=>a>0);
  if(ints.length<30)throw new Error('قانون بنفور يحتاج ٣٠ رقمًا على الأقل لنتيجة يُعتد بها.');
  const obs=Array(9).fill(0);
  ints.map(n=>+String(n)[0]).forEach(d=>{if(d>=1&&d<=9)obs[d-1]++;});
  obs.forEach((v,i)=>obs[i]=v/ints.length);
  const exp=Array.from({length:9},(_,i)=>Math.log10(1+1/(i+1)));
  const mad=obs.reduce((s,v,i)=>s+Math.abs(v-exp[i]),0)/9;
  let grade,verdict;
  if(mad<0.006){grade='ok';verdict='توافق ممتاز مع القانون — لا مؤشرات على تلاعب';}
  else if(mad<0.012){grade='ok';verdict='توافق مقبول — الوضع طبيعي إجمالًا';}
  else if(mad<0.015){grade='warn';verdict='توافق ضعيف — يُنصح بفحص استقصائي';}
  else{grade='bad';verdict='انحراف جوهري عن القانون — يلزم فحص موسّع';}
  return{obs,exp,mad,grade,verdict,n:ints.length};
}

/* ══════════ كشف التكرارات ══════════ */
function findDuplicates(records){
  const byNum={},byPair={},byAmt={};
  records.forEach(r=>{
    (byNum[r.id]=byNum[r.id]||[]).push(r);
    (byPair[r.label+'|'+r.amount]=byPair[r.label+'|'+r.amount]||[]).push(r);
    (byAmt[r.amount]=byAmt[r.amount]||[]).push(r);
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

/* ══════════ العيّنات ══════════ */
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

/* ---------- القائمة النشطة ---------- */
document.addEventListener('DOMContentLoaded',()=>{
  const path=location.pathname.split('/').pop()||'index.html';
  document.querySelectorAll('.side nav a').forEach(a=>{
    a.classList.toggle('active',a.getAttribute('href').split('/').pop()===path);
  });
});

window.AuditorTools={AUDITOR,fmt,todayAr,riskLevel,demoData,readWorkbook,parseCSV,
  normalizeRecords,downloadTemplateXLSX,downloadTemplateCSV,
  isolationForest,kmeansAnomaly,autoencoderAnomaly,tripleScan,explainRecord,
  exportWord,exportExcel,benfordLaw,findDuplicates,seqGaps,
  simpleSample,systematicSample,musSample};