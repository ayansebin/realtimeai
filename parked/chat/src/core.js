/* ---------- shared helpers: dates, numbers, metrics. Used by the playground and the chat ---------- */
const $=(s,r)=>(r||document).querySelector(s);
const $$=(s,r)=>Array.from((r||document).querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const ease=t=>t<.5?2*t*t:-1+(4-2*t)*t;
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const C={ink:'#f4f4f4',ink2:'#c1c7cd',ink3:'#8d99a8',ink4:'#697077',grid:'rgba(255,255,255,.08)',blue:'#0f62fe',blue2:'#4589ff',blue3:'#78a9ff',blue4:'#a6c8ff',band:'rgba(120,169,255,.18)',red:'#fa4d56',red2:'#ff8389',green:'#42be65',green2:'#6fdc8c',orange:'#ff832b',purple:'#be95ff',yellow:'#f1c21b'};
const SANS='"IBM Plex Sans", Arial, sans-serif',MONO='"IBM Plex Mono", Menlo, monospace';
const KW='SELECT|FROM|WHERE|AS|OVER|PARTITION|BY|ORDER|RANGE|BETWEEN|UNBOUNDED|PRECEDING|AND|CURRENT|ROW|VALUE';
const FN='AI_FORECAST|AI_DETECT_ANOMALIES|JSON_OBJECT';
const TOK=new RegExp("(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b(?:"+FN+")\\b)|(\\b\\d+(?:[\\.,]\\d+)?\\b)|(\\b(?:"+KW+")\\b)","g");
function highlight(sql){return esc(sql).replace(TOK,(m,c,s,f,n,k)=>{if(c)return'<span class="c">'+m+'</span>';if(s)return'<span class="s">'+m+'</span>';if(f)return'<span class="f">'+m+'</span>';if(n)return'<span class="n">'+m+'</span>';return'<span class="k">'+m+'</span>';});}
const MODEL_NAMES={ttm:'TTM r3',flowstate:'FlowState r1.1',patchtstfm:'PatchTST-FM r2',tspulse:'TSPulse r1',snaive:'Seasonal naive'};
const MODEL_SQL={ttm:'ttm',flowstate:'flowstate',patchtstfm:'patchtstfm',tspulse:'tspulse'};
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const STEP={min:60,'2min':120,'5min':300,'10min':600,'15min':900,'30min':1800,h:3600,'2h':7200,'3h':10800,'6h':21600,'12h':43200,D:86400,B:86400,W:604800,MS:0,QS:0,YS:0},MSTEP={MS:1,QS:3,YS:12};
function dateAt(ds,i){const iso=ds.start.indexOf('Z')>0||/[+-]\d\d:\d\d$/.test(ds.start)?ds.start:ds.start+'Z';const t0=new Date(iso);if(MSTEP[ds.freq]){const d=new Date(t0);d.setUTCMonth(d.getUTCMonth()+i*MSTEP[ds.freq]);return d;}if(ds.freq==='B'){const d=new Date(t0);let k=i;while(k>0){d.setUTCDate(d.getUTCDate()+1);const w=d.getUTCDay();if(w!==0&&w!==6)k--;}return d;}return new Date(t0.getTime()+i*(STEP[ds.freq]||3600)*1000);}
function fmtDate(ds,i,short){if(ds.noTime)return '#'+(i+1).toLocaleString('en-US');const d=dateAt(ds,i);const p=n=>String(n).padStart(2,'0');if(ds.freq==='MS')return MON[d.getUTCMonth()]+' '+d.getUTCFullYear();if(ds.freq==='QS')return 'Q'+(Math.floor(d.getUTCMonth()/3)+1)+' '+d.getUTCFullYear();if(ds.freq==='YS')return String(d.getUTCFullYear());if(ds.freq==='D'||ds.freq==='B'||ds.freq==='W')return (short?'':DOW[d.getUTCDay()]+' ')+d.getUTCDate()+' '+MON[d.getUTCMonth()]+(short?'':' '+d.getUTCFullYear());return (short?'':DOW[d.getUTCDay()]+' ')+d.getUTCDate()+' '+MON[d.getUTCMonth()]+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());}
const fmtNum=(v,unit)=>{if(v==null||isNaN(v))return '–';const a=Math.abs(v);const s=a>=1e6?(v/1e6).toFixed(2)+'M':a>=1e4?Math.round(v).toLocaleString('en-US'):a>=100?v.toFixed(0):a>=10?v.toFixed(1):v.toFixed(2);return s;};
const freqLabel={min:'1 min','2min':'2 min','5min':'5 min','10min':'10 min','15min':'15 min','30min':'30 min',h:'hourly','2h':'every 2 h','3h':'every 3 h','6h':'every 6 h','12h':'every 12 h',D:'daily',B:'daily (trading days)',W:'weekly',MS:'monthly',QS:'quarterly',YS:'yearly'};
const topicOf=id=>({steel:'plant.energy',traffic:'road.i94.volume',bikes:'bikes.rentals',grid:'grid.nsw.demand',retail:'retail.sales',wti:'markets.wti',subway:'mta.subway.riders','syn-kiln':'kiln.telemetry','syn-sku':'store.sku.sales','syn-cards':'cards.authorizations','syn-api':'api.latency'})[id]||id.replace(/-/g,'.');
const MC={ttm:'#78a9ff',flowstate:'#3ddbd9',patchtstfm:'#be95ff'},FCK=['ttm','flowstate','patchtstfm'];
const adOf=ds=>ds&&ds.ad?(ds.ad.tspulse||ds.ad.ttm||null):null,adOk=ds=>{const a=adOf(ds);return !!(a&&a.status==='ok');};
function defaultThr(ds){const a=adOk(ds)?adOf(ds).score.slice().sort((x,y)=>x-y):null;if(!a)return 0.5;const q=a[Math.floor(a.length*0.985)]||0.5;return clamp(Math.round(Math.max(0.5,q+0.02)*20)/20,0.5,0.95);}
function hOptions(ds){if(ds.fc.hopts)return ds.fc.hopts;const h=ds.fc.h;return h>=96?[24,48,96]:h>=30?[7,14,30]:[6,12].filter(x=>x<=h);}
function stepWord(ds,h){if(ds.noTime)return 'steps';return ({min:'min','2min':'× 2 min','5min':'× 5 min','10min':'× 10 min','15min':'× 15 min','30min':'× 30 min',h:'h','2h':'× 2 h','3h':'× 3 h','6h':'× 6 h','12h':'× 12 h',D:'days',B:'days',W:'weeks',MS:'months',QS:'quarters',YS:'years'})[ds.freq]||'steps';}
function metrics(ds,mk,oi,h){const m=ds.fc.models[mk];if(!m||m.status!=='ok')return null;const o=ds.fc.origins[oi];const y=ds.values.slice(o,o+h),p=m.point[oi].slice(0,h);const hasB=m.lo&&m.lo.length;let ae=0,sy=0,cov=0,n=0;for(let j=0;j<h;j++){if(y[j]==null||p[j]==null)continue;n++;ae+=Math.abs(y[j]-p[j]);sy+=Math.abs(y[j]);if(hasB&&y[j]>=m.lo[oi][j]&&y[j]<=m.hi[oi][j])cov++;}if(!n)return null;const mae=ae/n;return {mase:mae/(ds.fc.scale[oi]||1),wape:sy?ae/sy:NaN,cov:hasB?cov/n:NaN,mae};}
function avgMetrics(ds,mk,h){const rows=ds.fc.origins.map((o,i)=>metrics(ds,mk,i,h)).filter(Boolean);if(!rows.length)return null;const avg=k=>{const v=rows.map(r=>r[k]).filter(x=>!isNaN(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:NaN;};return {mase:avg('mase'),wape:avg('wape'),cov:avg('cov'),n:rows.length};}
function flagged(ds,thr){const s=adOk(ds)?adOf(ds).score:null;if(!s)return [];const out=[];let a=-1,peak=0;for(let i=0;i<=s.length;i++){const on=i<s.length&&s[i]>=thr;if(on){if(a<0){a=i;peak=0;}peak=Math.max(peak,s[i]);}else if(a>=0){out.push({a,b:i,peak});a=-1;}}
  /* merge windows closer than 12 points */const merged=[];out.forEach(w=>{const l=merged[merged.length-1];if(l&&w.a-l.b<12){l.b=w.b;l.peak=Math.max(l.peak,w.peak);}else merged.push(Object.assign({},w));});return merged;}
function adScore(ds,thr){const wins=flagged(ds,thr);const labels=ds.labels||[];const overl=(w,l)=>w.a<l[1]+8&&w.b>l[0]-8;const caught=labels.filter(l=>wins.some(w=>overl(w,l))).length;const falseAlarms=wins.filter(w=>!labels.some(l=>overl(w,l))).length;return {wins,caught,total:labels.length,falseAlarms};}
