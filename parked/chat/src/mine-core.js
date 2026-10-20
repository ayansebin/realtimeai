/* ---------- your data: upload a file or describe a stream, then TTM r3 forecasts it in this browser ---------- */
const ORT_CDN='https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/',XLSX_CDN='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const SEC={min:60,'2min':120,'5min':300,'10min':600,'15min':900,'30min':1800,h:3600,'2h':7200,'3h':10800,'6h':21600,'12h':43200,D:86400,B:86400,W:604800,MS:2629746,QS:7889238,YS:31556952};
const MAXN=20000,MAXW=120;
const DEFN={min:3000,'2min':3000,'5min':3000,'10min':3000,'15min':4000,'30min':2500,h:2400,'2h':2000,'3h':2000,'6h':1500,'12h':1200,D:900,B:1000,W:260,MS:120,QS:60,YS:40};
const MINE={mode:null,up:null,rc:null,cand:null,busy:false,k:0,lastKind:null};
const med=a=>{const b=Float64Array.from(a.filter(x=>isFinite(x))).sort();const n=b.length;return n?(n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2):NaN;};
const fmtMB=b=>(b/1e6).toFixed(b>=1e7?0:1)+' MB';

/* runtime, models and inference */
const scripts={};
function loadScript(src){if(!scripts[src])scripts[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.crossOrigin='anonymous';s.onload=()=>res();s.onerror=()=>{delete scripts[src];s.remove();rej(new Error('Could not reach '+src.split('/')[2]+'. Check the connection and try again.'));};document.head.appendChild(s);});return scripts[src];}
let ortP=null,manP=null;const SESS={};
function ortLib(){if(!ortP)ortP=loadScript(ORT_CDN+'ort.wasm.min.js').then(()=>{const o=window.ort;if(!o)throw new Error('ONNX Runtime did not load.');o.env.wasm.wasmPaths=ORT_CDN;o.env.wasm.numThreads=1;return o;}).catch(e=>{ortP=null;throw e;});return ortP;}
let MANV='';function manifest(){if(!manP)manP=fetch('/models/manifest.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw new Error('The models are not published yet.');return r.json();}).then(m=>{MANV=String(m.built||'').replace(/\D/g,'').slice(0,14);return m;}).catch(e=>{manP=null;throw e;});return manP;}
async function fetchBytes(url,onp,size){const r=await fetch(url);if(!r.ok)throw new Error('Could not download the model ('+r.status+').');const total=size||+r.headers.get('content-length')||0;if(!r.body||!r.body.getReader)return new Uint8Array(await r.arrayBuffer());const rd=r.body.getReader(),parts=[];let got=0;for(;;){const x=await rd.read();if(x.done)break;parts.push(x.value);got+=x.value.length;if(onp)onp(Math.min(got,total||got),total);}const out=new Uint8Array(got);let o=0;parts.forEach(p=>{out.set(p,o);o+=p.length;});return out;}
function session(v,onp){if(!SESS[v.name])SESS[v.name]=(async()=>{const r=await Promise.all([ortLib(),fetchBytes('/models/'+v.file+(MANV?'?v='+MANV:''),onp,v.bytes)]);return r[0].InferenceSession.create(r[1],{executionProviders:['wasm'],graphOptimizationLevel:'all'});})().catch(e=>{delete SESS[v.name];throw e;});return SESS[v.name];}
const LADDER=s=>s<86400?['ttm-r3-1024-96','ttm-r3-512-96','ttm-r3-180-60','ttm-r3-90-30','ttm-r3-52-16']:s<=86400?['ttm-r3-512-30','ttm-r3-90-30','ttm-r3-52-16']:['ttm-r3-156-16','ttm-r3-52-16'];
function pickVariant(man,freq,n){const vs=man.variants||[],lad=LADDER(SEC[freq]||3600).map(k=>vs.find(v=>v.name===k)).filter(Boolean);return lad.find(v=>n>=v.ctx+3*v.h)||lad.find(v=>n>=v.ctx+v.h)||null;}
function ctxGuess(freq,n){const lad=LADDER(SEC[freq]||3600).map(k=>{const a=k.split('-');return {ctx:+a[2],h:+a[3]};});const v=lad.find(v=>n>=v.ctx+3*v.h)||lad.find(v=>n>=v.ctx+v.h);return v?v.ctx:52;}
const minLen=man=>Math.min.apply(null,(man.variants||[]).map(v=>v.ctx+v.h).concat([68]));
async function infer(v,wins,onp){const o=await ortLib(),s=await session(v);const C=v.ctx,h=v.h,B=16,pt=[],qs=[];const t0=performance.now();
  for(let b0=0;b0<wins.length;b0+=B){const bs=Math.min(B,wins.length-b0),x=new Float32Array(bs*C);for(let i=0;i<bs;i++)x.set(wins[b0+i],i*C);
    const r=await s.run({past_values:new o.Tensor('float32',x,[bs,C,1])});const f=r.forecast.data;
    for(let i=0;i<bs;i++)pt.push(Array.from(f.subarray(i*h,(i+1)*h)));
    if(r.quantiles){const Q=r.quantiles.dims[1],q=r.quantiles.data;for(let i=0;i<bs;i++){const row=[];for(let k=0;k<Q;k++)row.push(Array.from(q.subarray((i*Q+k)*h,(i*Q+k+1)*h)));qs.push(row);}}
    if(onp)onp(b0+bs,wins.length);await new Promise(res=>setTimeout(res,0));}
  return {pt,qs,ms:(performance.now()-t0)/Math.max(1,wins.length)};}
function qIdx(v){const lv=v.quantiles||[];const f=x=>{let b=-1,d=1;lv.forEach((q,i)=>{if(Math.abs(q-x)<d){d=Math.abs(q-x);b=i;}});return b;};return {lo:f(0.1),mid:f(0.5),hi:f(0.9)};}
function seasonOf(freq,C){const s={min:60,'2min':30,'5min':288,'10min':144,'15min':96,'30min':48,h:24,'2h':12,'3h':8,'6h':4,'12h':2,D:7,B:5,W:52,MS:12,QS:4,YS:1}[freq]||1;return s<C*0.8?s:1;}
async function forecastMine(ds,onp){const man=await manifest();const v=pickVariant(man,ds.freq,ds.n);if(!v)throw new Error('Needs at least '+minLen(man)+' points. This has '+ds.n+'.');
  const C=v.ctx,h=v.h,n=ds.n,y=ds.values;const K=Math.max(1,Math.min(8,Math.floor((n-h-C)/h)+1)),os=[];for(let k=0;k<K;k++)os.push(K===1?n-h:Math.round(C+(n-h-C)*k/(K-1)));os.push(n);
  onp('load',0,v.bytes);await session(v,(g,t)=>onp('load',g,t));
  const r=await infer(v,os.map(o=>Float32Array.from(y.slice(o-C,o))),(d,t)=>onp('run',d,t));
  /* a window the model returns no numbers for is dropped, and the forecast itself must come back */
  const fin=a=>a.every(x=>isFinite(x)),okw=r.pt.map((a,i)=>fin(a)&&(!r.qs.length||r.qs[i].every(fin)));
  if(!okw[okw.length-1])throw new Error('TTM r3 returned no forecast for the end of this series. Try another column.');
  if(okw.some(x=>!x)){const keep=okw.map((x,i)=>x?i:-1).filter(i=>i>=0);os.splice(0,os.length,...keep.map(i=>os[i]));r.pt=keep.map(i=>r.pt[i]);if(r.qs.length)r.qs=keep.map(i=>r.qs[i]);}
  const qi=qIdx(v),hasQ=r.qs.length&&qi.lo>=0&&qi.hi>=0&&qi.mid>=0,R=a=>a.map(x=>+x.toPrecision(6));
  const point=hasQ?r.qs.map(q=>R(q[qi.mid])):r.pt.map(R),lo=hasQ?r.qs.map(q=>R(q[qi.lo])):[],hi=hasQ?r.qs.map(q=>R(q[qi.hi])):[];
  const m=seasonOf(ds.freq,C),nv=os.map(o=>{const p=[];for(let j=0;j<h;j++)p.push(y[o-m+(j%m)]);return p;});
  const scale=os.map(o=>{let s=0,c=0;for(let t=o-C+m;t<o;t++){s+=Math.abs(y[t]-y[t-m]);c++;}return c&&s?s/c:1;});
  ds.season=m;ds.fc={ctx:C,h,origins:os,scale,future:true,hopts:h>=96?[24,48,96]:h>=60?[15,30,60]:h>=30?[7,14,30]:[4,8,16],
    models:{ttm:{label:'TTM r3',status:'ok',point,lo,hi,ms:r.ms},snaive:{label:'Seasonal naive',status:'ok',point:nv},flowstate:{status:'na'},patchtstfm:{status:'na'}}};
  ds.ad={};ds.mine.v=v;ds.mine.canScore=n>=C+16;}
/* anomaly score from the model's own range: how far each point falls from the median forecast, in units of the 10 to 90 width */
async function scoreMine(ds,onp){const v=ds.mine.v,C=v.ctx,n=ds.n,y=ds.values,mw=clamp(Math.round(3500/Math.max(4,ds.fc.models.ttm.ms||20)),24,MAXW),stride=Math.max(1,Math.min(v.h,Math.ceil((n-C)/mw))),os=[];for(let o=C;o<n;o+=stride)os.push(o);
  const t0=performance.now();const r=await infer(v,os.map(o=>Float32Array.from(y.slice(o-C,o))),onp);
  const d=[];for(let i=1;i<n;i++)d.push(Math.abs(y[i]-y[i-1]));const fl=Math.max(1e-9,(med(d)||0)*0.75);
  const qi=qIdx(v),hasQ=r.qs.length&&qi.lo>=0,zs=new Float64Array(n).fill(NaN),sc=new Array(n).fill(0);
  /* how far each point sits from the median forecast, in units of the spread: the model's own 10 to 90 range, or the spread of its
     actual misses at that lead time on this series, whichever is wider, so a range that runs narrow far ahead does not raise alarms */
  const BK=Math.max(1,Math.ceil(stride/8)),miss=[];os.forEach((o,k)=>{for(let j=0;j<stride&&o+j<n;j++){const p=hasQ?r.qs[k][qi.mid][j]:r.pt[k][j];const b=Math.floor(j/BK);(miss[b]=miss[b]||[]).push(y[o+j]-p);}});
  const spread=miss.map(e=>{if(!e||e.length<6)return 0;const m0=med(e),a=Float64Array.from(e.map(x=>Math.abs(x-m0))).sort();return a[Math.floor(a.length*0.9)]/1.645;});
  os.forEach((o,k)=>{for(let j=0;j<stride&&o+j<n;j++){const p=hasQ?r.qs[k][qi.mid][j]:r.pt[k][j],w=hasQ?(r.qs[k][qi.hi][j]-r.qs[k][qi.lo][j])/2.563:0;zs[o+j]=Math.abs(y[o+j]-p)/Math.max(fl,w,spread[Math.floor(j/BK)]||0);}});
  const cal=clamp((med(Array.from(zs))||0.6745)/0.6745,1,4);
  for(let i=0;i<n;i++){const z=zs[i]/cal;sc[i]=isFinite(z)?Math.round(1000/(1+Math.exp(-2*(z-3))))/1000:0;}
  ds.ad={ttm:{label:'TTM r3',status:'ok',score:sc,ms:performance.now()-t0,cal}};}

/* datasets you made */
function makeDs(c){const id='mine-'+(++MINE.k);return {id,name:c.name,domain:c.kind==='synth'?'Generated':'Your data',kind:'mine',blurb:'',source:{name:'yours',url:'',license:''},unit:c.unit||'',freq:c.freq,start:c.start||'2026-01-01T00:00:00',n:c.values.length,values:c.values,labels:c.labels||[],noTime:!!c.noTime,mine:{kind:c.kind},spark:sparkOf(c.values)};}
function sparkOf(v){const k=Math.max(1,Math.floor(v.length/64)),out=[];for(let i=0;i+k<=v.length;i+=k){let s=0;for(let j=i;j<i+k;j++)s+=v[j];out.push(s/k);}return out;}
function spanText(n,f){const s=n*(SEC[f]||3600);return s<2*86400?Math.round(s/3600)+' hours':s<120*86400?Math.round(s/86400)+' days':s<3*365*86400?Math.round(s/(30.44*86400))+' months':(s/(365.25*86400)).toFixed(s<20*365*86400?1:0).replace(/\.0$/,'')+' years';}
/* ---------- upload: CSV, TSV, Excel, JSON or pasted cells ---------- */
function splitDelim(text){const lines=[];let i=0;while(lines.length<40&&i<text.length){const j=text.indexOf('\n',i);const l=text.slice(i,j<0?text.length:j);if(l.trim())lines.push(l);if(j<0)break;i=j+1;}
  const cnt=(l,d)=>{let c=0,q=false;for(let k=0;k<l.length;k++){const ch=l[k];if(ch==='"')q=!q;else if(ch===d&&!q)c++;}return c;};
  let best='',bs=0;['\t',';',',','|'].forEach(d=>{const cs=lines.map(l=>cnt(l,d));const freq={};cs.forEach(c=>{if(c>0)freq[c]=(freq[c]||0)+1;});let mode=0,mc=0;Object.keys(freq).forEach(k=>{if(freq[k]>mc){mc=freq[k];mode=+k;}});if(!mode)return;const sc=mc*(1+Math.min(mode,6)/10);if(sc>bs){bs=sc;best=d;}});return best;}
function parseCSV(text){text=text.replace(/^﻿/,'');const d=splitDelim(text);if(!d)return {rows:text.split(/\r\n|\n|\r/).filter(l=>l.trim()).map(l=>[l.trim()]),delim:''};
  const rows=[];let row=[],cell='',q=false;const N=text.length;
  for(let i=0;i<N;i++){const ch=text[i];
    if(q){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else q=false;}else cell+=ch;continue;}
    if(ch==='"'&&cell.trim()===''){q=true;cell='';continue;}
    if(ch===d){row.push(cell);cell='';continue;}
    if(ch==='\n'||ch==='\r'){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x.trim()!==''))rows.push(row);row=[];continue;}
    cell+=ch;}
  row.push(cell);if(row.some(x=>x.trim()!==''))rows.push(row);return {rows,delim:d};}
function numParser(cells,delim){let dc=0,dp=0;cells.forEach(x=>{const s=String(x==null?'':x).trim();if(/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s)||(delim!==','&&/^-?\d+,\d+$/.test(s)))dc++;else if(/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)||/^-?\d*\.\d+$/.test(s))dp++;});const comma=delim!==','&&dc>dp;
  return x=>{if(typeof x==='number')return x;let s=String(x==null?'':x).trim();if(!s)return NaN;s=s.replace(/^[$€£¥]|[$€£¥%]$/g,'').replace(/\s/g,'');if(comma)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,(?=\d{3}(\D|$))/g,'');if(!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s))return NaN;return parseFloat(s);};}
const MONS={jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11};
function timeParser(cells,timey){let df=0,mf=0;cells.forEach(x=>{const m=String(x==null?'':x).trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);if(m){if(+m[1]>12)df++;if(+m[2]>12)mf++;}});const dayFirst=df>mf;
  const hm=(h,ap)=>{h=+(h||0);if(ap){const pm=/p/i.test(ap);if(h===12)h=pm?12:0;else if(pm)h+=12;}return h;};
  return x=>{if(x instanceof Date)return isNaN(x)?NaN:Date.UTC(x.getFullYear(),x.getMonth(),x.getDate(),x.getHours(),x.getMinutes(),x.getSeconds());
    if(typeof x==='number'){if(timey&&x>20000&&x<80000)return Date.UTC(1899,11,30)+Math.round(x*864e5);x=String(x);}
    const s=String(x==null?'':x).trim();if(!s)return NaN;let m;
    if((m=s.match(/^(\d{4})[-\/.](\d{1,2})(?:[-\/.](\d{1,2}))?(?:[ T](\d{1,2})(?::(\d{2}))?(?::(\d{2}))?(?:[.,]\d+)?)?\s*(am|pm)?\s*(?:Z|UTC|GMT|[+-]\d{2}:?\d{2})?$/i)))return Date.UTC(+m[1],+m[2]-1,+(m[3]||1),hm(m[4],m[7]),+(m[5]||0),+(m[6]||0));
    if((m=s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?)?$/i))){let y=+m[3];if(y<100)y+=y<70?2000:1900;const a=+m[1],b=+m[2];return Date.UTC(y,(dayFirst?b:a)-1,dayFirst?a:b,hm(m[4],m[7]),+(m[5]||0),+(m[6]||0));}
    if((m=s.match(/^(\d{4})[- ]?q([1-4])$/i)))return Date.UTC(+m[1],(+m[2]-1)*3,1);
    if((m=s.match(/^q([1-4])[- ](\d{4})$/i)))return Date.UTC(+m[2],(+m[1]-1)*3,1);
    if((m=s.match(/^([a-z]{3})[a-z]*\.?[ -](\d{4})$/i))&&MONS[m[1].toLowerCase()]!=null)return Date.UTC(+m[2],MONS[m[1].toLowerCase()],1);
    if((m=s.match(/^(\d{4})[ -]([a-z]{3})[a-z]*$/i))&&MONS[m[2].toLowerCase()]!=null)return Date.UTC(+m[1],MONS[m[2].toLowerCase()],1);
    if((m=s.match(/^(\d{1,2})[ -]([a-z]{3})[a-z]*\.?[ -,]+(\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/i))&&MONS[m[2].toLowerCase()]!=null)return Date.UTC(+m[3],MONS[m[2].toLowerCase()],+m[1],+(m[4]||0),+(m[5]||0));
    if((m=s.match(/^(?:[a-z]{3,9},? )?([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})(?:[ T,]+(\d{1,2}):(\d{2}))?/i))&&MONS[m[1].toLowerCase()]!=null)return Date.UTC(+m[3],MONS[m[1].toLowerCase()],+m[2],+(m[4]||0),+(m[5]||0));
    if(/^\d{10}(\.\d+)?$/.test(s))return timey?Math.round(+s*1000):NaN;
    if(/^\d{13}$/.test(s))return timey?+s:NaN;
    if(/^\d{4}$/.test(s))return timey&&+s>=1800&&+s<=2200?Date.UTC(+s,0,1):NaN;
    if(/^-?\d+([.,]\d+)?$/.test(s))return NaN;
    const t=Date.parse(s);if(isNaN(t))return NaN;const d=new Date(t);return Date.UTC(d.getFullYear(),d.getMonth(),d.getDate(),d.getHours(),d.getMinutes(),d.getSeconds());};}
const TIMEY=/time|date|^ts$|_ts$|stamp|epoch|period|^day|^month|^week|^hour|^year|^t$|^dt$|when/i,IDY=/(^|_|\b)id$|^id|code|zip|^index$|^#|year/i;
function analyze(rows,delim){const ncol=Math.max(1,...rows.slice(0,60).map(r=>r.length));const pick=(a,k)=>{if(a.length<=k)return a;const o=[];for(let i=0;i<k;i++)o.push(a[Math.floor(i*a.length/k)]);return o;};
  const head=rows[0]||[];const S0=pick(rows.slice(1),300);const np=numParser([].concat(...S0.map(r=>r.slice(0,ncol))).slice(0,3000),delim);
  const isNum=x=>isFinite(np(x));
  const tp0=[];for(let j=0;j<ncol;j++)tp0.push(timeParser(S0.map(r=>r[j]),TIMEY.test(String(head[j]||''))));
  let header=false;for(let j=0;j<ncol;j++){const c=head[j];if(c==null||String(c).trim()==='')continue;if(!isNum(c)&&!isFinite(tp0[j](c))){const col=S0.map(r=>r[j]);if(col.filter(x=>isNum(x)||isFinite(tp0[j](x))).length>=col.length*0.6){header=true;break;}}}
  if(!header&&head.length&&head.every(c=>!isNum(c)))header=true;
  const names=[];for(let j=0;j<ncol;j++){const h=header&&head[j]!=null?String(head[j]).trim():'';names.push(h||'Column '+(j+1));}
  const body=header?rows.slice(1):rows,S=pick(body,400),cols=[],tps=[];
  for(let j=0;j<ncol;j++){const timey=TIMEY.test(names[j]),tp=timeParser(S.map(r=>r[j]),timey);tps.push(tp);const vals=S.map(r=>r[j]).filter(x=>x!=null&&String(x).trim()!=='');const nn=vals.length||1;
    cols.push({j,name:names[j],fNum:vals.filter(isNum).length/nn,fTime:vals.filter(x=>isFinite(tp(x))).length/nn,uniq:new Set(vals.map(String)).size,timey});}
  let tc=-1,best=0;cols.forEach(c=>{const s=c.fTime+(c.timey?0.2:0);if(c.fTime>=0.8&&s>best){best=s;tc=c.j;}});
  const vcs=cols.filter(c=>c.j!==tc&&c.fNum>=0.8&&c.uniq>1).map(c=>c.j);
  const scs=cols.filter(c=>c.j!==tc&&c.fNum<0.5&&c.fTime<0.5&&c.uniq>=2&&c.uniq<=2000).map(c=>c.j);
  return {names,body,np,tps,tc,vcs,scs};}
function seriesIds(a,s){const cnt=new Map();a.body.forEach(r=>{const k=String(r[s]==null?'':r[s]).trim();if(k)cnt.set(k,(cnt.get(k)||0)+1);});return Array.from(cnt.entries()).sort((x,y)=>y[1]-x[1]).slice(0,300);}
function snapFreq(s,T){const D=86400;if(s>=27*D&&s<=32*D)return 'MS';if(s>=88*D&&s<=93*D)return 'QS';if(s>=360*D&&s<=367*D)return 'YS';let b='h',d=1e9;['min','2min','5min','10min','15min','30min','h','2h','3h','6h','12h','D','W'].forEach(k=>{const e=Math.abs(Math.log(s/SEC[k]));if(e<d){d=e;b=k;}});
  if(b==='D'&&T.length>=10&&!T.some(t=>{const w=new Date(t).getUTCDay();return w===0||w===6;}))return 'B';return b;}
function bdays(a,b){const d0=Math.floor(a/864e5),d1=Math.floor(b/864e5);if(d1<d0)return -1;const full=Math.floor((d1-d0)/7);let c=full*5;for(let d=d0+full*7+1;d<=d1;d++){const w=(d+4)%7;if(w!==0&&w!==6)c++;}return c;}
function gridIdx(f,t0){if(MSTEP[f]){const d0=new Date(t0),m0=d0.getUTCFullYear()*12+d0.getUTCMonth(),k=MSTEP[f];return t=>{const d=new Date(t);return Math.floor((d.getUTCFullYear()*12+d.getUTCMonth()-m0)/k);};}if(f==='B')return t=>bdays(t0,t);const s=SEC[f]*1000;return t=>Math.round((t-t0)/s);}
const isoOf=t=>new Date(t).toISOString().slice(0,19);
function candFromUpload(u0){const u=u0||MINE.up,a=u.a,sel=u.sel;if(sel.v<0)throw new Error('No column with numbers found.');const np=a.np,tp=sel.t>=0?a.tps[sel.t]:null,pts=[];
  for(const r of a.body){if(sel.s>=0&&sel.sv!==''&&String(r[sel.s]==null?'':r[sel.s]).trim()!==sel.sv)continue;const y=np(r[sel.v]);if(!isFinite(y))continue;if(tp){const t=tp(r[sel.t]);if(!isFinite(t))continue;pts.push([t,y]);}else pts.push([pts.length,y]);}
  if(pts.length<2)throw new Error('No numbers found in '+a.names[sel.v]+'.');
  const base={name:u.title,unit:a.names[sel.v],kind:'upload',file:u.file,labels:[]};
  if(!tp){let v=pts.map(p=>p[1]),cut=0;if(v.length>MAXN){cut=v.length-MAXN;v=v.slice(cut);}return Object.assign(base,{values:v,freq:sel.f||'h',noTime:true,start:'2026-01-01T00:00:00',gaps:0,cut});}
  pts.sort((x,y)=>x[0]-y[0]);const T=[],Y=[];let k=0;for(const p of pts){if(T.length&&T[T.length-1]===p[0]){Y[Y.length-1]=(Y[Y.length-1]*k+p[1])/(k+1);k++;}else{T.push(p[0]);Y.push(p[1]);k=1;}}
  if(T.length<2)throw new Error('Every row has the same time stamp.');
  const dif=[];for(let i=1;i<T.length;i++)dif.push((T[i]-T[i-1])/1000);let f=snapFreq(med(dif),T);
  let t0=T[0];if(MSTEP[f]){const d=new Date(t0);t0=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1);}
  const ix=gridIdx(f,t0),N=ix(T[T.length-1])+1;
  if(N>T.length*4+50){let v=Y.slice(),cut=0;if(v.length>MAXN){cut=v.length-MAXN;v=v.slice(cut);}return Object.assign(base,{values:v,freq:f,noTime:true,start:isoOf(t0),gaps:0,cut});}
  const g=new Float64Array(N).fill(NaN),c=new Uint32Array(N);for(let i=0;i<T.length;i++){const q=ix(T[i]);if(q<0||q>=N)continue;g[q]=c[q]?(g[q]*c[q]+Y[i])/(c[q]+1):Y[i];c[q]++;}
  let gaps=0,last=-1;for(let i=0;i<N;i++){if(!c[i]){gaps++;continue;}if(last>=0&&i-last>1)for(let q=last+1;q<i;q++)g[q]=g[last]+(g[i]-g[last])*(q-last)/(i-last);last=i;}
  let v=Array.from(g),cut=0;if(v.length>MAXN){cut=v.length-MAXN;v=v.slice(cut);}
  const start=cut?isoOf(dateAt({start:isoOf(t0),freq:f},cut).getTime()):isoOf(t0);
  return Object.assign(base,{values:v,freq:f,noTime:false,start,gaps,cut});}
function rowsFromJSON(j){if(j&&!Array.isArray(j)&&typeof j==='object'){for(const k of ['data','values','series','rows','records','items','observations','result']){if(j[k]&&typeof j[k]==='object')return rowsFromJSON(j[k]);}
    const ks=Object.keys(j);if(ks.length&&ks.every(k=>Array.isArray(j[k]))){const n=Math.max(...ks.map(k=>j[k].length)),rows=[ks];for(let i=0;i<n;i++)rows.push(ks.map(k=>j[k][i]));return rows;}
    if(ks.length>2&&ks.every(k=>typeof j[k]==='number'))return [['time','value']].concat(ks.map(k=>[k,j[k]]));}
  if(Array.isArray(j)&&j.length){if(typeof j[0]!=='object'||j[0]===null)return [['value']].concat(j.map(v=>[v]));if(Array.isArray(j[0]))return j;const ks=[];j.slice(0,200).forEach(o=>Object.keys(o||{}).forEach(k=>{if(ks.indexOf(k)<0)ks.push(k);}));return [ks].concat(j.map(o=>ks.map(k=>o&&o[k]!=null?o[k]:'')));}
  throw new Error('Could not find a table in this JSON.');}
async function readFile(file){if(file.size>60e6)throw new Error('That file is over 60 MB. Try a smaller extract.');const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(/^(xlsx|xls|xlsm|ods)$/.test(ext)){await loadScript(XLSX_CDN);const X=window.XLSX,wb=X.read(await file.arrayBuffer(),{type:'array',cellDates:true}),ws=wb.Sheets[wb.SheetNames[0]];return {rows:X.utils.sheet_to_json(ws,{header:1,raw:true,defval:''}).filter(r=>r.some(c=>String(c).trim()!=='')),delim:''};}
  const text=await file.text();if(ext==='json'||/^\s*[\[{]/.test(text.slice(0,64))){try{return {rows:rowsFromJSON(JSON.parse(text)),delim:''};}catch(e){if(ext==='json')throw new Error(e instanceof SyntaxError?'This JSON does not parse.':e.message);}}
  return parseCSV(text);}
function tableUp(t,file){if(!t.rows.length)throw new Error('The file is empty.');const a=analyze(t.rows,t.delim);if(!a.vcs.length)throw new Error('No column with numbers found.');
  const v=a.vcs.find(j=>!IDY.test(a.names[j]))!=null?a.vcs.find(j=>!IDY.test(a.names[j])):a.vcs[0];
  let s=-1,sv='';if(a.tc>=0&&a.scs.length){const ts=new Set();let dup=false;for(let i=0;i<Math.min(a.body.length,5000);i++){const k=String(a.body[i][a.tc]);if(ts.has(k)){dup=true;break;}ts.add(k);}if(dup){s=a.scs[0];sv=seriesIds(a,s)[0][0];}}
  const title=file?file.replace(/\.[a-z0-9]+$/i,'').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim():'Pasted data';
  return {a,file:file||'',title:title.charAt(0).toUpperCase()+title.slice(1),sel:{t:a.tc,v,s,sv,f:'h'}};}
/* ---------- describe: a few words and a handful of dials become a stream with known events ---------- */
const KINDS={
  energy:{label:'Energy',name:'Factory energy use',unit:'kW',freq:'15min',n:4000,level:420,say:'Energy use of a factory every 15 minutes, around 420 kW, quiet nights and weekends, a few spikes and one outage'},
  sales:{label:'Store sales',name:'Store sales',unit:'units',freq:'D',n:900,level:140,say:'Daily sales of one store, around 140 units, busy weekends, yearly seasonality, slight upward trend, two stockouts'},
  traffic:{label:'Web traffic',name:'Website visits',unit:'visits',freq:'h',n:2400,level:1800,say:'Hourly website visits, around 1,800, evening peaks, quiet weekends, growing 10%, one outage'},
  payments:{label:'Payments',name:'Card payments',unit:'payments',freq:'5min',n:4000,level:640,say:'Card payments every 5 minutes, around 640 payments, lunch and evening peaks, a few drops'},
  sensor:{label:'Sensor',name:'Machine temperature',unit:'°C',freq:'5min',n:3000,level:68,say:'Machine temperature every 5 minutes, around 68 °C, smooth, slow drift and one level shift'},
  latency:{label:'Latency',name:'API latency',unit:'ms',freq:'min',n:3000,level:120,say:'API latency every minute, around 120 ms, heavy tails, three spikes and a noise burst'},
  price:{label:'Price',name:'Commodity price',unit:'$',freq:'B',n:1000,level:80,say:'Commodity price on trading days, around $80, random walk, one jump to a new level'},
  calls:{label:'Calls',name:'Call center volume',unit:'calls',freq:'30min',n:2500,level:45,say:'Call center volume every 30 minutes, around 45 calls, busy mornings, closed weekends, a few surges'}};
const KWX={energy:/\b(energy|power|electric\w*|load|kwh?|mwh?|grid|consumption|plant|factory|utility|meter)\b/g,sales:/\b(sales|sold|orders?|demand|skus?|stores?|shop|retail|units|revenue|bookings|stockouts?|spare parts?)\b/g,traffic:/\b(traffic|visits?|visitors|sessions|page ?views|clicks|website|site|requests)\b/g,payments:/\b(payments?|transactions?|cards?|authori[sz]ations?|checkouts?|transfers)\b/g,sensor:/\b(sensors?|temperature|temp|pressure|vibration|humidity|machine|motor|pump|bearing|kiln|furnace)\b/g,latency:/\b(latency|response times?|p9[59]|api|server|endpoint)\b/g,price:/\b(prices?|stocks?|shares?|fx|exchange rate|commodit\w*|oil|bitcoin|crypto|yields?|bonds?)\b/g,calls:/\b(calls?|call cent(er|re)s?|tickets|contact cent(er|re)s?|helpdesk)\b/g};
const EVN={spikes:'spike',dips:'dip',outage:'outage',shift:'level shift',drift:'drift',burst:'noise burst'};
const EVL=[['spikes','Spikes'],['dips','Dips'],['shift','Level shift'],['outage','Outage'],['drift','Drift'],['burst','Noise burst']];
const SHAPES=[['normal','Normal'],['counts','Counts'],['heavy','Heavy tails'],['inter','Intermittent'],['walk','Random walk']];
const FREQS=[['min','1 min'],['5min','5 min'],['15min','15 min'],['30min','30 min'],['h','Hourly'],['D','Daily'],['B','Trading days'],['W','Weekly'],['MS','Monthly']];
function baseRecipe(kind){const k=KINDS[kind];return {kind,name:k.name,unit:k.unit,freq:k.freq,n:k.n,level:k.level,trend:0,daily:0,weekly:0,yearly:0,wkHigh:false,noise:0.3,shape:'normal',ev:{},seed:MINE.rc?MINE.rc.seed:7};}
const NUMW={a:1,an:1,one:1,single:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,couple:2,few:3,several:4,some:3,many:6,lots:6,frequent:6,occasional:2,rare:1};
function countBefore(t,i){const pre=t.slice(Math.max(0,i-22),i).replace(/[^a-z0-9 ]/g,' ').trim().split(/\s+/).slice(-3);for(let k=pre.length-1;k>=0;k--){const w=pre[k];if(/^\d+$/.test(w))return Math.max(1,Math.min(9,+w));if(NUMW[w]!=null)return NUMW[w];if(/^(and|of|with|plus|the)$/.test(w))continue;break;}return 0;}
function strengthNear(t,i){const pre=t.slice(Math.max(0,i-24),i);if(/\b(very strong|huge|massive)\b/.test(pre))return 0.95;if(/\b(strong|big|large|clear|pronounced|sharp|deep|busy|closed)\b/.test(pre))return 0.8;if(/\b(weak|slight|mild|small|subtle|gentle|light|soft|little|faint)\b/.test(pre))return 0.25;return 0.55;}
function parseDesc(txt,cur){const t=' '+String(txt||'').toLowerCase().replace(/[–—]/g,'-').replace(/\s+/g,' ')+' ';
  let kind=null,bestN=0;Object.keys(KWX).forEach(k=>{const m=t.match(KWX[k]);const n=m?m.length:0;if(n>bestN){bestN=n;kind=k;}});
  const rc=baseRecipe(kind||(cur&&cur.kind)||'energy');let m;
  // name: the first clause, or the kind's name
  let first=String(txt||'').split(/[,;\n]|\.(?!\d)| with | and /i)[0].replace(/\s(around|about|approximately|roughly|averag\w*|mean|typically|between|near|~|≈)(\s|\$|\d).*$/i,'').replace(/\b(every|each|per)\s+\d*\s*(min(ute)?s?|hours?|days?|weeks?|months?)\b|\b(hourly|daily|weekly|monthly|quarterly|minutely)\b|\bon (trading|business|working) days\b|\b\d+[- ]?min(ute)?s?\b/gi,' ').replace(/\s+/g,' ').trim();
  if(first.split(' ').length>=2){if(first.length>44)first=first.slice(0,44).replace(/\s+\S*$/,'');rc.name=first.charAt(0).toUpperCase()+first.slice(1);}
  // how often
  const FQ=[[/\b(every\s+)?2[- ]?min(ute)?s?\b/,'2min'],[/\b(every\s+)?5[- ]?min(ute)?s?\b|\bfive[- ]minutes?\b/,'5min'],[/\b(every\s+)?10[- ]?min(ute)?s?\b|\bten[- ]minutes?\b/,'10min'],[/\b(every\s+)?15[- ]?min(ute)?s?\b|\bquarter[- ]hour(ly)?\b|\bfifteen[- ]minutes?\b/,'15min'],[/\b(every\s+)?30[- ]?min(ute)?s?\b|\bhalf[- ]hour(ly)?\b|\bthirty[- ]minutes?\b/,'30min'],[/\b(every|each|per|a)\s+(1\s+)?min(ute)?\b|\bminutely\b|\b1[- ]min(ute)?\b/,'min'],[/\bhourly\b|\b(every|each|per)\s+hour\b|\bby the hour\b/,'h'],[/\b(business|trading|working)[- ]days?\b/,'B'],[/\bdaily\b(?! (cycle|pattern|season\w*|peaks?|profile|rhythm|swings?|shape))|\b(every|each|per)\s+day\b/,'D'],[/\bweekly\b(?! (cycle|pattern|season\w*|peaks?|profile|rhythm|swings?))|\b(every|each|per)\s+week\b/,'W'],[/\bmonthly\b(?! (cycle|pattern|season\w*))|\b(every|each|per)\s+month\b/,'MS']];
  let fi=1e9;FQ.forEach(([re,f])=>{const x=t.search(re);if(x>=0&&x<fi){fi=x;rc.freq=f;}});
  // level and unit
  const UN={kw:'kW',mw:'MW',gw:'GW',kwh:'kWh',mwh:'MWh',w:'W','°c':'°C',degc:'°C',degrees:'°C','°f':'°F',ms:'ms',seconds:'s',sec:'s','%':'%',bar:'bar',psi:'psi',rpm:'rpm'};
  const mult=s=>s==='k'||s==='thousand'?1e3:s==='m'||s==='million'?1e6:s==='bn'||s==='billion'?1e9:1;
  const nm=s=>parseFloat(String(s).replace(/,/g,''));const NOUN=/^(units|orders|visits|visitors|calls|payments|transactions|requests|users|sessions|items|tickets|rides|trips|cars|vehicles|people|riders|passengers|kg|tons|tonnes|liters|litres|bookings|clicks|messages|events)$/;
  const unitOf=w=>!w?'':UN[w]||(NOUN.test(w)||/^[a-z°%0-9]{1,4}\/[a-z0-9]{1,4}$/.test(w)?w:'');const NUM='(-?\\d+(?:,\\d{3})*(?:\\.\\d+)?)';
  if((m=t.match(new RegExp('\\bbetween\\s+([$€£])?\\s*'+NUM+'\\s*(k|m)?\\s*(?:and|-|to)\\s*[$€£]?'+NUM+'\\s*(k|m)?\\b\\s*([a-z°%]+)?')))){rc.level=(nm(m[2])*mult(m[3])+nm(m[4])*mult(m[5]||m[3]))/2;if(m[1])rc.unit=m[1];else if(unitOf(m[6]))rc.unit=unitOf(m[6]);}
  else if((m=t.match(new RegExp('(?:around|about|approximately|approx\\.?|roughly|near|close to|~|≈|averag(?:e|es|ing)|mean(?: of)?|typically|baseline(?: of)?|level(?: of)?)\\s*(?:of\\s*)?([$€£])?\\s*'+NUM+'\\s*(k|m|bn|thousand|million|billion)?\\b\\s*([a-z°%\\/]+)?')))){rc.level=nm(m[2])*mult(m[3]);if(m[1])rc.unit=m[1];else if(unitOf(m[4]))rc.unit=unitOf(m[4]);}
  else if((m=t.match(new RegExp('([$€£])\\s?'+NUM+'\\s*(k|m|bn)?\\b')))){rc.level=nm(m[2])*mult(m[3]);rc.unit=m[1];}
  else if((m=t.match(new RegExp(NUM+'\\s*(k|m)?\\s*(kwh|mwh|kw|mw|gw|°c|°f|degc|ms|bar|psi|rpm)\\b')))){rc.level=nm(m[1])*mult(m[2]);rc.unit=UN[m[3]]||m[3];}
  if(!isFinite(rc.level)||rc.level===0)rc.level=KINDS[rc.kind].level;
  // cycles
  const CY=[['daily',/\b(daily (cycle|pattern|season\w*|peaks?|profile|rhythm|swings?|shape)|day[- ]night|diurnal|nights?|overnight|rush hours?|business hours|office hours|working hours|opening hours|mornings?|evenings?|lunch\w*|afternoons?|24[- ]?h(our)? cycle)\b/],['weekly',/\b(weekly (cycle|pattern|season\w*|peaks?|profile|rhythm|swings?)|weekends?|weekdays?|7[- ]day cycle|mondays?|fridays?|saturdays?|sundays?)\b/],['yearly',/\b((yearly|annual) (cycle|pattern|season\w*|peaks?)|seasonal\w*|summers?|winters?|holidays?|christmas|black friday|year[- ]end)\b/]];
  CY.forEach(([k,re])=>{const x=t.search(re);if(x>=0)rc[k]=strengthNear(t,x);});
  rc.yrPk=/\b(christmas|holidays?|black friday|year[- ]end|december)\b/.test(t)?355:/\bsummers?\b/.test(t)?200:/\bwinters?\b/.test(t)?15:null;
  if(/\b(busy|high|higher|peak|more|strong) (on )?weekends?\b|\bweekends? (are )?(busy|higher|peak)\b/.test(t))rc.wkHigh=true;
  if(/\bno (cycles?|seasonality|seasons|patterns?)\b|\b(non|a)[- ]?seasonal\b/.test(t)){rc.daily=rc.weekly=rc.yearly=0;}
  [['daily',/\bno daily\b/],['weekly',/\bno weekly\b|\bno weekend\b/],['yearly',/\bno (yearly|annual)\b/]].forEach(([k,re])=>{if(re.test(t))rc[k]=0;});
  // trend
  const up=/\b(upward|uptrend|rising|rises|grow(s|ing|th)?|increas(e|es|ing)|climb(s|ing)|trend(s|ing)? up|going up)\b/,dn=/\b(downward|downtrend|falling|declin(e|es|ing)|decreas(e|es|ing)|shrink(s|ing)|trend(s|ing)? down|going down)\b/;
  const iu=t.search(up),id=t.search(dn);if(iu>=0||id>=0){const i0=iu>=0&&(id<0||iu<id)?iu:id,sg=i0===iu?1:-1;const win=t.slice(Math.max(0,i0-30),i0+40),pc=win.match(/(\d+(?:\.\d+)?)\s*%/);let mag=pc?Math.min(1.5,+pc[1]/100):/\b(slight|slow|slowly|gentle|mild|modest|small)\b/.test(win)?0.08:/\b(strong|steep|fast|rapid|sharp|big)\b/.test(win)?0.45:0.2;rc.trend=sg*mag;}
  if(/\b(no trend|flat|trendless|stationary)\b/.test(t))rc.trend=0;
  // noise and shape
  if(/\b(very|extremely|super|highly) (noisy|volatile|erratic)\b|\bchaotic\b/.test(t))rc.noise=0.8;else if(/\b(noisy|volatile|erratic|jumpy|choppy|bumpy|irregular|unpredictable)\b/.test(t))rc.noise=0.55;else if(/\b(smooth|steady|stable|calm|clean|low noise|little noise|predictable)\b/.test(t))rc.noise=0.12;
  if(/\b(random walk|wander\w*|brownian|martingale)\b/.test(t)||(rc.kind==='price'&&!/\b(gaussian|normal|counts?)\b/.test(t)))rc.shape='walk';else if(/\b(intermittent|sparse|lumpy|many zeros|mostly zeros?|slow[- ]mov\w*|sporadic|zero[- ]inflated)\b/.test(t))rc.shape='inter';else if(/\b(heavy[- ]tail\w*|fat[- ]tail\w*|long[- ]tail\w*|bursty|spiky)\b/.test(t))rc.shape='heavy';else if(/\b(counts?|count data|integers?|whole numbers|arrivals|poisson)\b/.test(t)||/^(sales|traffic|payments|calls)$/.test(rc.kind))rc.shape='counts';
  if(/\b(gaussian|normal(ly)? distributed|bell[- ]shaped)\b/.test(t))rc.shape='normal';
  // events, longest phrases first so one phrase counts once
  let u=t;const EX=[['outage',/\b(outages?|downtime|offline|blackouts?|shut ?downs?|stoppages?|breakdowns?|goes to zero|drops? to zero|closures?)\b/g],['shift',/\b(level shifts?|step changes?|step (up|down)|regime (change|shift)s?|structural breaks?|new (baseline|level)|shifts? (up|down))\b/g],['burst',/\b(noise bursts?|volatil\w* bursts?|unstable (period|stretch)|jitter|turbulen\w*)\b/g],['drift',/\b(drifts?|drifting|degrad\w*|wear|creep\w*|fouling)\b/g],['spikes',/\b(spikes?|surges?|bursts?|promotions?|promos?|outliers?)\b/g],['dips',/\b(dips?|drops?|crash(es)?|plunges?|stock-?outs?|shortfalls?)\b/g]];
  EX.forEach(([k,re])=>{u=u.replace(re,(w,...a)=>{const i=a[a.length-2];if(/\b(no|without|never)\s+(\w+\s+)?$/.test(u.slice(Math.max(0,i-14),i)))return ' '.repeat(w.length);const c=countBefore(u,i);rc.ev[k]=Math.min(9,(rc.ev[k]||0)+(c||(/s$/.test(w)&&!/ss$/.test(w)?3:1)));return ' '.repeat(w.length);});});
  if(/\b(no (anomalies|events|incidents)|nothing unusual|clean data)\b/.test(t))rc.ev={};
  // length
  let lenSet=false;if((m=t.match(/(\d[\d,]*)\s*(points|rows|samples|observations|readings|values)\b/))){rc.n=nm(m[1]);lenSet=true;}
  else if((m=t.match(/\b(?:last|past|over|for|covering|spanning)\s+(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|months?|years?)\b/))||(m=t.match(/\b(\d+(?:\.\d+)?)\s*(hours?|days?|weeks?|months?|years?)\s+(?:of\s+)?(?:data|history|values|records)\b/))){const sp=+m[1]*({h:3600,d:86400,w:604800,m:2629746,y:31556952})[m[2][0]];rc.n=Math.round(sp/(SEC[rc.freq]||3600));lenSet=true;}
  if(!lenSet)rc.n=DEFN[rc.freq]||KINDS[rc.kind].n;rc.n=clamp(Math.round(rc.n),120,MAXN);
  if(cur&&cur.seed)rc.seed=cur.seed;return rc;}
/* the generator: level and trend, daily, weekly and yearly shapes, a noise distribution, then the events, each one labelled */
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return (s+0.5)/4294967296;};}
const gauss=r=>Math.sqrt(-2*Math.log(r()))*Math.cos(2*Math.PI*r());
function gam(r,k){if(k<1)return gam(r,k+1)*Math.pow(r(),1/k);const d=k-1/3,c=1/Math.sqrt(9*d);for(;;){let x,v;do{x=gauss(r);v=1+c*x;}while(v<=0);v=v*v*v;const q=r();if(q<1-0.0331*x*x*x*x||Math.log(q)<0.5*x*x+d*(1-v+Math.log(v)))return d*v;}}
function pois(r,l){if(l<=0)return 0;if(l<40){const L=Math.exp(-l);let k=0,p=1;do{k++;p*=r();}while(p>L);return k-1;}return Math.max(0,Math.round(l+Math.sqrt(l)*gauss(r)));}
const tdist=(r,nu)=>{let c=0;for(let i=0;i<nu;i++){const z=gauss(r);c+=z*z;}return gauss(r)/Math.sqrt(c/nu);};
const PROF={};
function dayShape(kind){if(PROF[kind])return PROF[kind];const g=(hr,mu,s)=>{let d=Math.abs(hr-mu);d=Math.min(d,24-d);return Math.exp(-0.5*(d/s)*(d/s));},sg=x=>1/(1+Math.exp(-x*2.2));
  const f=hr=>kind==='energy'?sg(hr-6)-sg(hr-22)+0.15*g(hr,13,3):kind==='traffic'?1.5*g(hr,20.5,2.6)+0.9*g(hr,12.5,2.4)+0.3*g(hr,9,1.6):kind==='payments'?1.4*g(hr,12.5,1.7)+1.2*g(hr,18.5,2)+0.5*g(hr,9,1.4):kind==='calls'?(sg(hr-8)-sg(hr-18))*(1+0.6*g(hr,10.5,1.8)):-Math.cos(2*Math.PI*(hr-3)/24);
  const xs=[];for(let i=0;i<96;i++)xs.push(f(i/4));const mu=xs.reduce((a,b)=>a+b,0)/96,mx=Math.max(...xs.map(x=>Math.abs(x-mu)))||1;return PROF[kind]=hr=>(f(hr)-mu)/mx;}
function synth(rc){const r=rng(rc.seed),n=clamp(rc.n|0,120,MAXN),f=rc.freq,L0=rc.level;
  // end at the last full step before now, so the forecast points at the real future
  const now=new Date();let end;if(MSTEP[f])end=Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1);else if(SEC[f]>=86400){end=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate())-864e5;if(f==='B')while([0,6].indexOf(new Date(end).getUTCDay())>=0)end-=864e5;if(f==='W')end-=new Date(end).getUTCDay()*864e5;}else{const s=SEC[f]*1000;end=Math.floor(now.getTime()/s)*s-s;}
  let start;if(MSTEP[f]){const d=new Date(end);start=Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-(n-1)*MSTEP[f],1);}else if(f==='B'){let t=end,k=n-1;while(k>0){t-=864e5;const w=new Date(t).getUTCDay();if(w!==0&&w!==6)k--;}start=t;}else start=end-(n-1)*SEC[f]*1000;
  const sub=SEC[f]<86400,perDay=sub?Math.round(86400/SEC[f]):1;
  const ds=dayShape(rc.kind),wk=rc.wkHigh?[0.6,-0.475,-0.475,-0.475,-0.475,0.3,1]:[-1,0.4,0.4,0.4,0.4,0.4,-1],yrPk=rc.yrPk!=null?rc.yrPk:rc.kind==='sales'?355:rc.kind==='energy'?15:200;
  const aD=sub?rc.daily*0.9:0,aW=f==='W'||MSTEP[f]?0:rc.weekly*(rc.wkHigh?0.45:0.95),aY=rc.yearly*0.4;
  const mu=new Float64Array(n),sf=new Float64Array(n),base=new Float64Array(n);let tt=start;for(let i=0;i<n;i++){if(i){if(MSTEP[f]){const q=new Date(tt);tt=Date.UTC(q.getUTCFullYear(),q.getUTCMonth()+MSTEP[f],1);}else if(f==='B'){do{tt+=864e5;}while([0,6].indexOf(new Date(tt).getUTCDay())>=0);}else tt+=SEC[f]*1000;}
    const d=new Date(tt),hr=d.getUTCHours()+d.getUTCMinutes()/60,doy=(tt-Date.UTC(d.getUTCFullYear(),0,1))/864e5;
    const dw=d.getUTCDay();let w=wk[dw];if(sub){if(hr<3){const b=0.5+hr/6;w=wk[(dw+6)%7]*(1-b)+w*b;}else if(hr>21){const b=0.5+(24-hr)/6;w=w*b+wk[(dw+1)%7]*(1-b);}}
    sf[i]=Math.max(0.03,(1+aD*ds(hr))*(1+aW*w)*(1+aY*Math.cos(2*Math.PI*(doy-yrPk)/365.25)));base[i]=L0*(1+rc.trend*i/Math.max(1,n-1));mu[i]=base[i]*sf[i];}
  // events: spread across the part of the series the model can see history for
  const evs=[];Object.keys(rc.ev).forEach(k=>{for(let c=0;c<rc.ev[k];c++)evs.push(k);});for(let i=evs.length-1;i>0;i--){const j=Math.floor(r()*(i+1));const t=evs[i];evs[i]=evs[j];evs[j]=t;}
  const lo=Math.min(Math.round(n*0.6),Math.max(Math.round(n*0.25),ctxGuess(f,n)+8)),hi=n-Math.max(6,Math.round(n*0.03)),labels=[],plan=[];
  evs.forEach((k0,i)=>{const k=rc.shape==='walk'&&(k0==='spikes'||k0==='dips')?'shift':k0,sg=k0==='spikes'?1:k0==='dips'?-1:0;let a=Math.round(lo+(hi-lo)*(i+0.2+0.6*r())/evs.length);
    if(k==='dips'||k==='outage'||k==='spikes'){const span=Math.max(2,Math.round((hi-lo)/evs.length*0.3));let best=a,bv=-Infinity;for(let q=Math.max(lo,a-span);q<=Math.min(hi-2,a+span);q++){const sc_=k==='spikes'?-Math.abs(mu[q]-L0)+r()*L0*0.2:mu[q];if(sc_>bv){bv=sc_;best=q;}}a=best;}const len=k==='spikes'?(sub?1+Math.floor(r()*3):1):k==='dips'?(sub?1+Math.floor(r()*3):1+Math.floor(r()*3)):k==='outage'?(sub?clamp(Math.round(perDay/10),3,36):clamp(Math.round(2+r()*3),2,5)):k==='shift'?Math.max(4,Math.min(48,sub?perDay:7)):k==='drift'?clamp(Math.round(n*0.1),12,400):clamp(Math.round(n*0.03),8,160);plan.push({k,a,len:Math.min(len,n-a-1),sg});});
  plan.forEach(p=>{if(p.k==='shift'){const g=(p.sg||(r()<0.5?-1:1))*(rc.shape==='walk'?0.18:0.3);for(let i=p.a;i<n;i++)mu[i]*=1+g;}if(p.k==='drift'){for(let i=p.a;i<n;i++)mu[i]+=L0*0.22*clamp((i-p.a)/p.len,0,1);}});
  const y=new Array(n),z=rc.noise;let walk=0;const vol=new Float64Array(n).fill(1);plan.forEach(p=>{if(p.k==='burst')for(let i=p.a;i<p.a+p.len&&i<n;i++)vol[i]=4;});
  const phi=Math.max(1e-3,z*z*0.35),pz=0.35+0.5*z,drift=Math.log(Math.max(0.05,1+rc.trend))/n,rv=Math.max(0.002,z*0.025);
  const noiseAt=i=>{const m0=Math.max(0,mu[i]);return rc.shape==='counts'?Math.sqrt(m0+phi*m0*m0):rc.shape==='inter'?Math.sqrt(m0/(1-pz))*(1+Math.sqrt(pz/(1-pz))*Math.sqrt(m0)):rc.shape==='heavy'?m0*0.2*z*1.42:z*0.25*base[i]*Math.sqrt(sf[i]);};
  for(let i=0;i<n;i++){const m0=mu[i];let v;
    if(rc.shape==='counts'){v=pois(r,m0*(vol[i]>1?gam(r,1/(phi*vol[i]))*phi*vol[i]:gam(r,1/phi)*phi));}
    else if(rc.shape==='inter'){v=r()<pz?0:pois(r,m0/(1-pz));}
    else if(rc.shape==='heavy'){v=m0*Math.exp(Math.max(-3,Math.min(3,0.2*z*vol[i]*tdist(r,4))));}
    else if(rc.shape==='walk'){walk+=drift+rv*vol[i]*gauss(r);v=m0/(1+rc.trend*i/Math.max(1,n-1))*Math.exp(walk);}
    else v=m0+z*0.25*base[i]*Math.sqrt(sf[i])*vol[i]*gauss(r);
    y[i]=v;}
  plan.forEach(p=>{const e=Math.min(n,p.a+p.len);for(let i=p.a;i<e;i++){const sd=noiseAt(i);if(p.k==='spikes')y[i]=Math.max(y[i]*(1.6+0.7*r())+0.4*Math.abs(L0),mu[i]+(6+2*r())*sd);else if(p.k==='dips')y[i]=Math.min(y[i]*(0.08+0.17*r()),mu[i]-(5+2*r())*sd);else if(p.k==='outage')y[i]=rc.kind==='sensor'||rc.shape==='walk'?y[p.a-1]:0;}
    labels.push([p.a,p.k==='shift'||p.k==='drift'?Math.min(n,p.a+Math.max(p.len,6)):Math.max(p.a+1,e),EVN[p.k]]);});
  const ints=rc.shape==='counts'||rc.shape==='inter',dec=L0>=1000?0:L0>=100?1:L0>=10?2:3,pw=Math.pow(10,dec);
  for(let i=0;i<n;i++){let v=y[i];if(L0>0&&v<0)v=0;y[i]=ints?Math.round(v):Math.round(v*pw)/pw;}
  labels.sort((a,b)=>a[0]-b[0]);
  return {name:rc.name,unit:rc.unit,kind:'synth',freq:f,start:isoOf(start),values:y,labels,noTime:false};}
