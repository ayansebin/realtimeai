(function(){
'use strict';
/*@CORE@*/
/*@MINE@*/

/* ---------- chat: Claude talks, the models run here, each result lands as a card ---------- */
const CH=$('#ch'),TH=$('#ch-thread'),Q=$('#ch-q'),SEND=$('#ch-send'),FILE=$('#ch-file'),ATT=$('#ch-att'),NEW=$('#ch-new'),DROP=$('#ch-drop');
const S={convo:[],items:[],busy:false,ctrl:null,index:null,cache:{},streams:{},att:null,ready:null,t0:Date.now(),turns:0,pending:null,T:null};
const SKEY='rti-chat-v1',MAXTURNS=40,COARSE=window.matchMedia&&matchMedia('(pointer:coarse)').matches;
const idxP=fetch('/data/pg/index.json',{cache:'no-cache'}).then(r=>r.ok?r.json():null).then(j=>{S.index=j;return j;}).catch(()=>null);
const el=(tag,cls,html)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;};
const sig=(v,n)=>v==null||!isFinite(v)?null:+(+v).toPrecision(n||4);
const pct=v=>v==null||!isFinite(v)?null:Math.round(v*1000)/10;
const vsGuess=(a,b)=>{if(!a||!b||!b.mase||!isFinite(a.mase))return null;const g=1-a.mase/b.mase;return g>=0?Math.round(g*100)+'% better than the simple guess':Math.round(-g*100)+'% worse than the simple guess';};
const gainOf=(a,b)=>a&&b&&b.mase&&isFinite(a.mase)?1-a.mase/b.mase:NaN;
const betterTxt=g=>isNaN(g)?'–':(g>=0?Math.round(g*100)+'% better':Math.round(-g*100)+'% worse');
const fmtMs=ms=>ms==null||!isFinite(ms)?'–':ms<10?ms.toFixed(1)+' ms':ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(1)+' s';
function tlabel(ds,i){if(ds.noTime)return 'step '+(i+1);const d=dateAt(ds,i),p=n=>String(n).padStart(2,'0');const ymd=d.getUTCFullYear()+'-'+p(d.getUTCMonth()+1)+'-'+p(d.getUTCDate());
  if(ds.freq==='MS'||ds.freq==='QS')return ymd.slice(0,7);if(ds.freq==='YS')return String(d.getUTCFullYear());if(ds.freq==='D'||ds.freq==='B'||ds.freq==='W')return ymd+' '+DOW[d.getUTCDay()];return ymd+' '+DOW[d.getUTCDay()]+' '+p(d.getUTCHours())+':'+p(d.getUTCMinutes());}
const sampleIdx=(h,k)=>{const out=[];for(let i=0;i<k;i++){const j=Math.round(i*(h-1)/Math.max(1,k-1));if(out.indexOf(j)<0)out.push(j);}return out;};
const ICON={file:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13" fill="none" stroke="currentColor" stroke-width="1.1"/><path d="M6 11.5l1.6-2 1.4 1.2 1.8-2.6" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>',
  copy:'<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8.5" height="8.5" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M3 10.5V2.5h8" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  up:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 7l2.6-5c1.1 0 1.8.8 1.6 1.9L8.8 6.5h3.9c.9 0 1.5.8 1.3 1.6l-1.1 4.9c-.1.6-.7 1-1.3 1H5z M2 7h3v7H2z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>',
  down:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 9l-2.6 5c-1.1 0-1.8-.8-1.6-1.9l.4-2.6H3.3c-.9 0-1.5-.8-1.3-1.6l1.1-4.9c.1-.6.7-1 1.3-1H11z M14 9h-3V2h3z" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linejoin="round"/></svg>',
  ok:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'};

/* ---------- markdown, small and safe: everything is escaped first ---------- */
const hlSQL=q=>highlight(q).replace(/\b(GROUP|CAST|SUM|TABLE|TUMBLE|DESCRIPTOR|INTERVAL|SECOND|CREATE|DOUBLE|INSERT|INTO|WITH|LIMIT|JOIN|ON|CASE|WHEN|THEN|ELSE|END|NOT|NULL|IS|IN|COUNT|AVG|MIN|MAX)\b/g,'<span class="k">$1</span>');
function mdInline(s){return String(s).split(/(`[^`\n]+`)/g).map(p=>{if(/^`[^`\n]+`$/.test(p))return '<code>'+esc(p.slice(1,-1))+'</code>';
  let t=esc(p);
  t=t.replace(/\[([^\]\n]+)\]\(((?:https?:\/\/|\/(?!\/))[^\s)]*)\)/g,(m,a,u)=>'<a href="'+u.replace(/"/g,'%22')+'"'+(/^https?:/.test(u)&&!/^https:\/\/(www\.)?realtimeintelligence\.io(\/|$)/.test(u)?' target="_blank" rel="noopener"':'')+'>'+a+'</a>');
  t=t.replace(/(^|[\s(])(https?:\/\/[^\s<)]+[^\s<).,:!?'"])/g,(m,pre,u)=>pre+'<a href="'+u+'"'+(/^https:\/\/(www\.)?realtimeintelligence\.io(\/|$)/.test(u)?'':' target="_blank" rel="noopener"')+'>'+u+'</a>');
  t=t.replace(/\*\*([^*\n]+?)\*\*/g,'<b>$1</b>').replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g,'$1<i>$2</i>').replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g,'$1<i>$2</i>');
  return t;}).join('');}
function mdTable(rows){const cells=r=>r.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim());const head=cells(rows[0]);const body=rows.slice(2).map(cells);
  return '<table><thead><tr>'+head.map(c=>'<th>'+mdInline(c)+'</th>').join('')+'</tr></thead><tbody>'+body.map(r=>'<tr>'+head.map((_,k)=>'<td>'+mdInline(r[k]||'')+'</td>').join('')+'</tr>').join('')+'</tbody></table>';}
function mdCode(code,lang){const sql=lang==='sql'||(!lang&&/\b(SELECT|CREATE TABLE)\b/.test(code));return '<div class="md-code"><div class="md-ch"><span>'+esc(lang||(sql?'sql':'code'))+'</span><button type="button" class="md-cp">Copy</button></div><pre><code>'+(sql?hlSQL(code):esc(code))+'</code></pre></div>';}
function md(src){const L=String(src||'').replace(/\r/g,'').split('\n');let html='',i=0;const para=[];const flush=()=>{if(para.length){html+='<p>'+para.map(mdInline).join('<br>')+'</p>';para.length=0;}};
  const LI=/^\s*([-*+•]|\d+[.)])\s+/;
  while(i<L.length){const l=L[i];let m;
    if((m=l.match(/^\s*```\s*([\w+-]*)\s*$/))){flush();const lang=(m[1]||'').toLowerCase(),code=[];i++;while(i<L.length&&!/^\s*```\s*$/.test(L[i])){code.push(L[i]);i++;}i++;html+=mdCode(code.join('\n'),lang);continue;}
    if(!l.trim()){flush();i++;continue;}
    if((m=l.match(/^\s*#{1,6}\s+(.*)$/))){flush();html+='<h4>'+mdInline(m[1])+'</h4>';i++;continue;}
    if(LI.test(l)){flush();const num=l.match(/^\s*(\d+)[.)]/),items=[];while(i<L.length&&LI.test(L[i])){let it=L[i].replace(LI,'');i++;while(i<L.length&&/^\s{2,}\S/.test(L[i])&&!LI.test(L[i])){it+=' '+L[i].trim();i++;}items.push(it);}
      html+=(num?'<ol'+(+num[1]>1?' start="'+(+num[1])+'"':'')+'>':'<ul>')+items.map(x=>'<li>'+mdInline(x)+'</li>').join('')+(num?'</ol>':'</ul>');continue;}
    if(/^\s*\|.*\|\s*$/.test(l)&&i+1<L.length&&/^\s*\|?\s*:?-{2,}/.test(L[i+1])){flush();const rows=[];while(i<L.length&&/^\s*\|.*\|\s*$/.test(L[i])){rows.push(L[i]);i++;}html+=mdTable(rows);continue;}
    if(/^\s*>\s?/.test(l)){flush();const qs=[];while(i<L.length&&/^\s*>\s?/.test(L[i])){qs.push(L[i].replace(/^\s*>\s?/,''));i++;}html+='<blockquote>'+qs.map(mdInline).join('<br>')+'</blockquote>';continue;}
    if(/^\s*(---+|\*\*\*+)\s*$/.test(l)){flush();html+='<hr>';i++;continue;}
    para.push(l);i++;}
  flush();return html;}
TH.addEventListener('click',e=>{const b=e.target.closest('.md-cp');if(!b)return;const code=b.closest('.md-code').querySelector('pre').textContent;copyText(code,()=>{b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1500);});});
function copyText(t,ok){if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t).then(ok,()=>{});}

/* ---------- the thread ---------- */
function setEmpty(on){CH.dataset.empty=on?'1':'0';NEW.hidden=on;}
function chipEl(c,removable){const e=el('span','ch-chip'+(c.err?' err':''));e.innerHTML=ICON.file+'<b>'+esc(c.name)+'</b><small>'+esc(c.meta||'')+'</small>'+(removable?'<button type="button" aria-label="Remove the file">×</button>':'');return e;}
function addUser(text,chip){const w=el('div','m-u');if(chip)w.appendChild(chipEl(chip,false));if(text){const b=el('div','m-ub');b.textContent=text;w.appendChild(b);}TH.appendChild(w);return w;}
/* follow the answer while it grows, unless the visitor scrolls up to read: only their own wheel, finger, keys or
   scrollbar can unpin it, so a page that briefly gets shorter does not */
let stick=true,ty=null,bar=false,lastY=window.scrollY;const gapEnd=()=>document.documentElement.scrollHeight-(window.innerHeight+window.scrollY);
window.addEventListener('wheel',e=>{if(e.deltaY<0)stick=false;},{passive:true});
window.addEventListener('touchstart',e=>{ty=e.touches[0].clientY;},{passive:true});
window.addEventListener('touchmove',e=>{if(ty!=null&&e.touches[0].clientY-ty>12)stick=false;},{passive:true});
window.addEventListener('touchend',()=>{ty=null;},{passive:true});
window.addEventListener('keydown',e=>{if(/^(PageUp|ArrowUp|Home)$/.test(e.key)&&!/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))stick=false;});
window.addEventListener('pointerdown',e=>{bar=e.clientX>=document.documentElement.clientWidth;},{passive:true});
window.addEventListener('pointerup',()=>{bar=false;},{passive:true});
window.addEventListener('scroll',()=>{const y=window.scrollY;if(bar&&y<lastY)stick=false;if(gapEnd()<90)stick=true;lastY=y;},{passive:true});
function scrollEnd(force){if(force)stick=true;if(!stick)return;const top=document.documentElement.scrollHeight-window.innerHeight;if(Math.abs(top-window.scrollY)>1)window.scrollTo({top});}
if(window.ResizeObserver)new ResizeObserver(()=>{if(CH.dataset.empty==='0')scrollEnd();}).observe(TH);
function note(text,cls,act){const n=el('div','ch-note'+(cls?' '+cls:''));n.innerHTML='<span>'+text+'</span>';if(act){const b=el('button');b.type='button';b.textContent=act[0];b.addEventListener('click',()=>{n.remove();act[1]();});n.appendChild(b);}TH.appendChild(n);scrollEnd(true);return n;}

class Turn{
  constructor(item){this.item=item||{r:'a',parts:[]};this.el=el('div','m-a');this.el.innerHTML='<div class="m-who"><i></i>Claude</div><div class="m-body"></div>';this.body=$('.m-body',this.el);this.cur=null;this.tools={};this.req='';this.raf=0;this.think=null;TH.appendChild(this.el);}
  live(on){this.el.classList.toggle('live',!!on);if(on)this.thinking();}
  thinking(){if(this.think||this.cur)return;this.think=el('div','m-think','<span class="m-dots"><i></i><i></i><i></i></span>');this.body.appendChild(this.think);scrollEnd();}
  unthink(){if(this.think){this.think.remove();this.think=null;}}
  text(d){this.unthink();if(!this.cur){const part={k:'t',md:''};this.item.parts.push(part);this.cur={part,el:el('div','md')};this.body.appendChild(this.cur.el);}this.cur.part.md+=d;this.req+=d;this.paint();}
  paint(){if(this.raf)return;this.raf=requestAnimationFrame(()=>{this.raf=0;if(!this.cur)return;this.cur.el.innerHTML=md(this.cur.part.md);const last=this.cur.el.lastElementChild;const cur=el('span','m-cursor');if(last&&/^(P|LI|H4)$/.test(last.tagName))last.appendChild(cur);else if(last&&/^(UL|OL)$/.test(last.tagName)&&last.lastElementChild)last.lastElementChild.appendChild(cur);else this.cur.el.appendChild(cur);scrollEnd();});}
  close(){if(this.raf){cancelAnimationFrame(this.raf);this.raf=0;}if(this.cur){this.cur.el.innerHTML=md(this.cur.part.md);this.cur=null;}}
  tool(id,name){this.close();this.unthink();const line=el('div','m-tool','<span class="sp"></span><span class="lab">'+esc(TOOLS[name]?TOOLS[name].label({}):'Working')+'</span>');this.body.appendChild(line);this.tools[id]={line,name};scrollEnd();}
  toolInput(id,name,input){const t=this.tools[id];if(t&&TOOLS[name])$('.lab',t.line).textContent=TOOLS[name].label(input||{});}
  note(text,cls){this.close();this.unthink();const n=el('div','ch-note'+(cls?' '+cls:''),'<span>'+text+'</span>');this.body.appendChild(n);this.item.parts.push({k:'n',text,cls:cls||''});scrollEnd();return n;}
  finish(){this.close();this.unthink();this.live(false);this.el.classList.remove('live');if(this.item.parts.some(p=>p.k==='t'&&p.md.trim()))addActs(this);
    const sr=$('#ch-sr');if(sr){const t=this.item.parts.filter(p=>p.k==='t').map(p=>p.md).join(' ').replace(/[*`#|>_]/g,'').slice(0,400);sr.textContent=t?'Claude: '+t:'Claude finished.';}}
}
function addActs(T){if($('.m-acts',T.el))return;const a=el('div','m-acts');const fb=T.item.fb||'';
  a.innerHTML='<button type="button" class="m-act" data-a="copy" aria-label="Copy the answer" title="Copy">'+ICON.copy+'</button><button type="button" class="m-act" data-a="up" aria-label="Good answer" title="Good answer" aria-pressed="'+(fb==='up')+'">'+ICON.up+'</button><button type="button" class="m-act" data-a="down" aria-label="Bad answer" title="Bad answer" aria-pressed="'+(fb==='down')+'">'+ICON.down+'</button>';
  T.el.appendChild(a);
  a.addEventListener('click',e=>{const b=e.target.closest('.m-act');if(!b)return;const k=b.dataset.a;
    if(k==='copy'){copyText(T.item.parts.filter(p=>p.k==='t').map(p=>p.md).join('\n\n'),()=>{b.innerHTML=ICON.ok;setTimeout(()=>b.innerHTML=ICON.copy,1400);});return;}
    if(T.item.fb===k)return;T.item.fb=k;$$('.m-act[data-a="up"],.m-act[data-a="down"]',a).forEach(x=>x.setAttribute('aria-pressed',x.dataset.a===k?'true':'false'));save();
    const ctx=exchangeOf(T.item);sendFeedback({rating:k,context:ctx});
    let f=$('.m-fb',T.el);if(f)f.remove();f=el('div','m-fb');f.innerHTML='<p>'+(k==='up'?'Thanks. What worked for you?':'Thanks. What went wrong?')+' <small style="color:var(--ink-4)">Your rating and this exchange go to the team behind this site.</small></p><textarea rows="2" maxlength="1500" placeholder="Optional"></textarea><input type="email" maxlength="200" placeholder="Email, if you want a reply (optional)"><div class="row"><button type="button" class="btn sm ghost" data-v="0">Skip</button><button type="button" class="btn sm" data-v="1">Send</button></div>';
    T.el.appendChild(f);$('textarea',f).focus({preventScroll:true});
    f.addEventListener('click',async ev=>{const x=ev.target.closest('[data-v]');if(!x)return;if(x.dataset.v==='1'){const notes=$('textarea',f).value.trim(),email=$('input',f).value.trim();if(!notes&&!email){f.remove();return;}x.disabled=true;const ok=await sendFeedback({rating:k,notes,email,context:ctx});f.innerHTML='<p>'+(ok?'Sent. Thank you.':'Could not send it right now. Please try again later.')+'</p>';setTimeout(()=>f.remove(),2600);}else f.remove();});});}
function exchangeOf(item){const i=S.items.indexOf(item);let q='';for(let k=i-1;k>=0;k--){if(S.items[k].r==='u'){q=S.items[k].text||(S.items[k].att?'[attached '+S.items[k].att.name+']':'');break;}}
  const a=item.parts.map(p=>p.k==='t'?p.md:p.k==='c'?'['+p.name+' '+JSON.stringify(p.input||{})+']':'').filter(Boolean).join('\n');return ('Visitor: '+q+'\n\nClaude: '+a).slice(0,5800);}
async function sendFeedback(o){try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'chat-feedback',rating:o.rating,notes:o.notes||'',email:o.email||'',context:o.context||'',page:'/chat',t:Date.now()-S.t0})});return r.ok;}catch(e){return false;}}

/* ---------- talking to /api/chat ---------- */
function payloadMsgs(){let m=S.convo.slice();const size=()=>JSON.stringify(m).length;if(size()<=360000)return m;
  while(m.length>2&&size()>360000){m.shift();while(m.length&&(m[0].role!=='user'||m[0].content.some(b=>b.type==='tool_result')))m.shift();}
  /* once early turns are dropped, older thinking blocks no longer match their context, so only the latest keeps them */
  const lastA=m.map(x=>x.role).lastIndexOf('assistant');return m.map((x,k)=>x.role==='assistant'&&k!==lastA?{role:'assistant',content:x.content.filter(b=>b.type!=='thinking'&&b.type!=='redacted_thinking')}:x).filter(x=>x.content.length);}
function pushUser(blocks){const last=S.convo[S.convo.length-1];if(last&&last.role==='user')last.content=last.content.concat(blocks);else S.convo.push({role:'user',content:blocks});}
const abortErr=()=>Object.assign(new Error('stopped'),{code:'stopped'});
async function callChat(T){
  let r;try{r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:payloadMsgs()}),signal:S.ctrl.signal});}
  catch(e){if(S.ctrl.signal.aborted)throw abortErr();throw Object.assign(new Error('network'),{code:'network'});}
  if(!r.ok){let j={};try{j=await r.json();}catch(e){}throw Object.assign(new Error(j.error||'http'),{code:j.error||'http',status:r.status,detail:j.detail||''});}
  const rd=r.body.getReader(),dec=new TextDecoder();let buf='',done=null;T.req='';
  for(;;){let x;try{x=await rd.read();}catch(e){if(S.ctrl.signal.aborted)throw abortErr();throw Object.assign(new Error('cut'),{code:'network'});}
    if(x.done)break;buf+=dec.decode(x.value,{stream:true}).replace(/\r\n?/g,'\n');let i;
    while((i=buf.indexOf('\n\n'))>=0){const chunk=buf.slice(0,i);buf=buf.slice(i+2);let data='';chunk.split('\n').forEach(l=>{if(l.startsWith('data:'))data+=l.slice(5).trim();});if(!data)continue;let ev;try{ev=JSON.parse(data);}catch(e){continue;}
      if(ev.t==='text')T.text(ev.d);else if(ev.t==='tool')T.tool(ev.id,ev.name);else if(ev.t==='tool_input')T.toolInput(ev.id,ev.name,ev.input);else if(ev.t==='thinking')T.thinking();
      else if(ev.t==='done')done=ev;else if(ev.t==='error')throw Object.assign(new Error(ev.code),{code:ev.code||'upstream'});}}
  if(!done)throw Object.assign(new Error('cut'),{code:'network'});
  return done;}
const ERR={not_configured:'The chat is not switched on yet. Until it is, the <a href="/playground">playground</a> runs every model on the same streams.',
  busy:'Lots of people are asking at once. Wait a minute and try again.',overloaded:'Claude is busy right now. Try again in a moment.',
  too_long:'This conversation is too long to continue. Start a new chat.',origin:'This page cannot reach the chat service from here.',
  network:'The connection dropped.',upstream:'Something went wrong on the way to Claude.',bad_request:'Something in this conversation could not be sent. Start a new chat.',
  unavailable:'The chat is resting for now. The <a href="/playground">playground</a> runs every model on the same streams.',thinking:'This conversation could not continue. Start a new chat.'};
async function runTurn(T){
  T=T||new Turn();if(S.items.indexOf(T.item)<0)S.items.push(T.item);S.T=T;S.busy=true;setBusy(true);T.live(true);let stopped=false;
  try{
    for(let step=0;step<8;step++){
      S.ctrl=new AbortController();T.thinking();
      let done;try{done=await callChat(T);}catch(e){if(e.code!=='thinking'||T.retried)throw e;T.retried=true;stripThinking();done=await callChat(T);}T.close();
      const content=(done.content||[]).filter(b=>b&&b.type);
      S.convo.push({role:'assistant',content:content.length?content:[{type:'text',text:'(no answer)'}]});
      if(done.stop==='max_tokens')T.note('The answer was cut short. Ask Claude to continue.');
      if(done.stop==='refusal')T.note('Claude stopped this answer.');
      if(done.stop!=='tool_use')break;
      const uses=content.filter(b=>b.type==='tool_use'),results=[];S.pendingUses={uses,results};
      for(const b of uses){if(S.ctrl.signal.aborted)break;results.push(await execTool(T,b));}
      S.pendingUses=null;
      if(S.ctrl.signal.aborted){stopResults(uses,results);stopped=true;break;}
      S.convo.push({role:'user',content:results});save();
      if(step===7)T.note('That took several steps. Ask a follow-up to keep going.');}
  }catch(e){
    if(e.code==='stopped'||(S.ctrl&&S.ctrl.signal.aborted)){stopped=true;
      if(S.pendingUses){stopResults(S.pendingUses.uses,S.pendingUses.results);S.pendingUses=null;}
      else{const last=S.convo[S.convo.length-1];if(!last||last.role==='user')S.convo.push({role:'assistant',content:[{type:'text',text:T.req.trim()?T.req+'\n\n(stopped by the visitor)':'(stopped by the visitor)'}]});}}
    else{T.close();T.unthink();const msg=ERR[e.code]||ERR.upstream;const n=T.note(msg+(e.detail&&e.code==='bad_request'?' <small>('+esc(e.detail)+')</small>':''),'err');T.item.parts.pop();
      if(['network','overloaded','busy','upstream','not_configured'].indexOf(e.code)>=0){const b=el('button');b.type='button';b.textContent='Try again';b.addEventListener('click',()=>{n.remove();if(!S.busy)runTurn(T);});n.appendChild(b);}
      if(e.code==='not_configured')$('#ch-off').hidden=false;}
  }finally{S.busy=false;S.ctrl=null;S.T=null;setBusy(false);T.finish();if(stopped)T.note('Stopped.');save();}}
function stopResults(uses,results){const got=new Set(results.map(r=>r.tool_use_id));uses.forEach(b=>{if(!got.has(b.id))results.push({type:'tool_result',tool_use_id:b.id,content:'Stopped by the visitor before this ran.',is_error:true});});S.convo.push({role:'user',content:results});}
/* thinking blocks from finished turns may be left out, which is the fix when the API no longer accepts them */
function stripThinking(){S.convo=S.convo.map(m=>m.role==='assistant'?{role:'assistant',content:m.content.filter(b=>b.type!=='thinking'&&b.type!=='redacted_thinking')}:m).filter(m=>m.content.length);}
/* every tool call needs its result right after it, even when the page was closed before it ran */
function repair(){const out=[];for(let i=0;i<S.convo.length;i++){const m=S.convo[i];out.push(m);if(m.role!=='assistant')continue;const ids=m.content.filter(b=>b.type==='tool_use').map(b=>b.id);if(!ids.length)continue;
  const nx=S.convo[i+1];const have=nx&&nx.role==='user'?nx.content.filter(b=>b.type==='tool_result').map(b=>b.tool_use_id):[];const miss=ids.filter(id=>have.indexOf(id)<0).map(id=>({type:'tool_result',tool_use_id:id,content:'This did not run, the page was closed first.',is_error:true}));
  if(!miss.length)continue;if(nx&&nx.role==='user'){S.convo[i+1]={role:'user',content:nx.content.filter(b=>b.type==='tool_result').concat(miss,nx.content.filter(b=>b.type!=='tool_result'))};}else out.push({role:'user',content:miss});}
  S.convo=out;}
function stop(){if(S.pending){const p=S.pending;S.pending=null;p();}if(S.ctrl)S.ctrl.abort();}

/* ---------- the tools, run here in the browser ---------- */
async function getDs(id){id=String(id||'').trim();await idxP;
  if(/^mine-\d+$/.test(id)){const d=S.streams[id];if(!d)throw new Error('Stream '+id+' is not in this browser any more, for example after a reload. Ask the visitor to attach the file again, or make the stream again.');return d;}
  const meta=S.index&&S.index.datasets.find(d=>d.id===id);if(!meta)throw new Error('There is no stream called '+id+'. Use an id from the catalog, such as steel, or a visitor stream such as mine-1.');
  if(!S.cache[id]){const r=await fetch('/data/pg/'+id+'.json',{cache:'force-cache'});if(!r.ok)throw new Error('Could not load '+meta.name+'.');S.cache[id]=await r.json();}
  return S.cache[id];}
function sname(id){const d=S.streams[id]||S.cache[id]||(S.index&&S.index.datasets.find(x=>x.id===id));return d?d.name:(id?String(id):'the stream');}
async function ensureFc(ds,P){if(ds.fc)return;P.status('Starting TTM r3 in your browser');
  await forecastMine(ds,(ph,a,b)=>{if(ph==='load')P.status(a?'Downloading TTM r3 once, '+fmtMB(a)+' of '+fmtMB(b):'Starting TTM r3 in your browser');else P.status('Forecasting '+b+' windows in your browser');});
  ds.fc.hopts=null;}
function typicalBefore(ds,a){const m=clamp(ds.season>1?ds.season:48,24,400),v=ds.values.slice(Math.max(0,a-m),a).filter(x=>x!=null);return v.length?med(v):null;}
function attInfo(ds,u){const a=u&&u.a,sel=u&&u.sel,v=ds.values;let lo=Infinity,hi=-Infinity,t=0;v.forEach(x=>{if(x<lo)lo=x;if(x>hi)hi=x;t+=x;});
  const o={stream_id:ds.id,name:ds.name};if(u){o.file=u.file||'pasted cells';o.value_column=a.names[sel.v];const oth=a.vcs.filter(j=>j!==sel.v).map(j=>a.names[j]);if(oth.length)o.other_number_columns=oth.slice(0,12);o.time_column=sel.t>=0?a.names[sel.t]:'none, rows in order';}
  o.every=ds.noTime?(freqLabel[ds.freq]||ds.freq)+' assumed, no timestamps':freqLabel[ds.freq]||ds.freq;o.points=ds.n;o.from=tlabel(ds,0);o.to=tlabel(ds,ds.n-1);o.min=sig(lo);o.max=sig(hi);o.mean=sig(t/v.length);o.last=sig(v[v.length-1]);
  if(u&&sel.t>=0&&a.scs.length){const s=sel.s>=0?sel.s:a.scs[0],ids=seriesIds(a,s);o.series_column=a.names[s];o.series_count=ids.length;o.series_used=sel.s>=0?sel.sv:'all rows averaged';o.largest_series=ids.slice(0,6).map(e=>e[0]);}
  if(ds.mine.gaps)o.gaps_filled=ds.mine.gaps;if(ds.mine.cut)o.note='Only the last '+MAXN.toLocaleString('en-US')+' points are used.';if(ds.n<68)o.warning='Too short to forecast, TTM r3 needs at least 68 points.';return o;}
function dsFromCand(c,u){const ds=makeDs(c);ds.mine.gaps=c.gaps||0;ds.mine.cut=c.cut||0;if(u)ds.mine.up=u;if(u&&u.sel.sv)ds.name=c.name+' · '+u.sel.sv;S.streams[ds.id]=ds;return ds;}
const evList=ds=>(ds.labels||[]).map(l=>({event:l[2],from:tlabel(ds,l[0]),to:tlabel(ds,Math.max(l[0],l[1]-1))}));
const TOOLS={
  forecast:{label:i=>'Forecasting '+sname(i.stream_id)+' with '+(MODEL_NAMES[i.model]||'TTM r3'),async run(i,P){
    const ds=await getDs(i.stream_id);let model=MODEL_NAMES[i.model]&&FCK.indexOf(i.model)>=0?i.model:'ttm',noteT='';
    if(ds.mine){if(model!=='ttm')noteT='Only TTM r3 runs in the browser, so TTM r3 was used.';model='ttm';await ensureFc(ds,P);}
    const M=ds.fc.models[model];if(!M||M.status!=='ok')throw new Error((MODEL_NAMES[model]||model)+' has no forecast for '+ds.name+'.');
    const K=ds.fc.origins.length,fut=!!ds.fc.future,h=clamp(Math.round(+i.horizon||ds.fc.h),1,ds.fc.h);
    const oi=fut?K-1:(i.start_index==null||!isFinite(+i.start_index)?K-1:clamp(Math.round(+i.start_index),0,K-1)),o=ds.fc.origins[oi];
    const one=fut?null:metrics(ds,model,oi,h),oneN=fut?null:metrics(ds,'snaive',oi,h),all=avgMetrics(ds,model,h),allN=avgMetrics(ds,'snaive',h);
    const pts=M.point[oi].slice(0,h),lo=M.lo&&M.lo.length?M.lo[oi]:null,hi=M.hi&&M.hi.length?M.hi[oi]:null;
    const sample=sampleIdx(h,8).map(j=>{const r={time:tlabel(ds,o+j),q50:sig(pts[j])};if(lo){r.q10=sig(lo[j]);r.q90=sig(hi[j]);}if(!fut&&ds.values[o+j]!=null)r.actual=sig(ds.values[o+j]);return r;});
    let jx=0,jn=0;pts.forEach((v,j)=>{if(v>pts[jx])jx=j;if(v<pts[jn])jn=j;});
    const res={stream:ds.name,stream_id:ds.id,model:MODEL_NAMES[model],kind:fut?'future forecast, run live in the visitor browser':'backtest replay, precomputed, the model saw only the history before the start',every:freqLabel[ds.freq]||ds.freq,unit:ds.unit||'',
      horizon_steps:h,forecast_from:tlabel(ds,o),forecast_to:tlabel(ds,o+h-1),history_seen:Math.min(ds.fc.ctx,o)+' points',forecast_sample:sample,forecast_high:{time:tlabel(ds,o+jx),q50:sig(pts[jx])},forecast_low:{time:tlabel(ds,o+jn),q50:sig(pts[jn])}};
    if(one)res.this_start={average_error_pct:pct(one.wape),mase:sig(one.mase,3),vs_simple_guess:vsGuess(one,oneN),in_range_pct:pct(one.cov)};
    if(all)res[fut?'backtests_at_earlier_starts':'all_start_points']={tests:all.n,average_error_pct:pct(all.wape),mase:sig(all.mase,3),vs_simple_guess:vsGuess(all,allN),in_range_pct:pct(all.cov)};
    if(!fut){res.start_index=oi;res.start_points=ds.fc.origins.map((x,k)=>k+': '+tlabel(ds,x));}
    if(M.ms!=null)res.ms_per_forecast=sig(M.ms,3);res.ran_on=ds.mine?'the visitor browser, ONNX Runtime Web':'a CPU runner, precomputed';if(noteT)res.note=noteT;
    return {res,view:{type:'fc',id:ds.id,oi,h,model}};}},
  compare_models:{label:i=>'Racing the models on '+sname(i.stream_id),async run(i,P){
    const ds=await getDs(i.stream_id);if(ds.mine)await ensureFc(ds,P);const h=clamp(Math.round(+i.horizon||ds.fc.h),1,ds.fc.h);
    const nv=avgMetrics(ds,'snaive',h),rows=FCK.filter(k=>ds.fc.models[k]&&ds.fc.models[k].status==='ok').map(k=>({k,a:avgMetrics(ds,k,h)})).filter(r=>r.a).sort((x,y)=>x.a.mase-y.a.mase);
    if(!rows.length)throw new Error('No backtests to compare on '+ds.name+'.');
    const res={stream:ds.name,stream_id:ds.id,every:freqLabel[ds.freq]||ds.freq,horizon_steps:h,tests_per_model:rows[0].a.n,
      ranking:rows.map(r=>({model:MODEL_NAMES[r.k],average_error_pct:pct(r.a.wape),mase:sig(r.a.mase,3),vs_simple_guess:vsGuess(r.a,nv),in_range_pct:pct(r.a.cov),ms_per_forecast:sig(ds.fc.models[r.k].ms,3)})),
      simple_guess:nv?{average_error_pct:pct(nv.wape),mase:sig(nv.mase,3)}:null,best:MODEL_NAMES[rows[0].k]};
    if(ds.mine)res.note='Only TTM r3 runs in the browser. FlowState and PatchTST-FM are compared on the sample streams, and all three run on Confluent.';
    const K=ds.fc.origins.length;return {res,view:{type:'race',id:ds.id,h,oi:ds.fc.future?Math.max(0,K-2):K-1}};}},
  detect_anomalies:{label:i=>'Scoring every point of '+sname(i.stream_id),async run(i,P){
    const ds=await getDs(i.stream_id);
    if(ds.mine){await ensureFc(ds,P);if(!ds.mine.canScore)throw new Error('This stream is too short to score, it needs at least '+(ds.fc.ctx+16)+' points.');
      if(!adOk(ds)){P.status('Scoring every point with TTM r3 in your browser');await scoreMine(ds,(d,t)=>P.status('Scoring every point with TTM r3 in your browser · '+Math.round(d/t*100)+'%'));}}
    else if(!adOk(ds))throw new Error('There are no anomaly scores for '+ds.name+'. TSPulse needs at least 1,536 points and this stream has '+ds.n.toLocaleString('en-US')+'.');
    const thr=i.threshold!=null&&isFinite(+i.threshold)?clamp(+i.threshold,0.1,0.98):(ds.mine?0.8:defaultThr(ds)),A=adOf(ds),sc=adScore(ds,thr);
    const top=sc.wins.slice().sort((a,b)=>b.peak-a.peak).slice(0,8).sort((a,b)=>a.a-b.a);
    const res={stream:ds.name,stream_id:ds.id,model:ds.mine?'TTM r3, distance outside its own forecast range':'TSPulse r1',threshold:sig(thr,2),points_scored:ds.n,flagged_windows:sc.wins.length,
      windows:top.map(w=>{let pk=w.a;for(let k=w.a;k<w.b;k++)if(A.score[k]>A.score[pk])pk=k;return {from:tlabel(ds,w.a),to:tlabel(ds,Math.max(w.a,w.b-1)),peak_score:sig(w.peak,2),value_at_peak:sig(ds.values[pk]),typical_before:sig(typicalBefore(ds,w.a))};})};
    if(sc.wins.length>top.length)res.windows_note='The '+top.length+' strongest of '+sc.wins.length+' are listed.';
    if(ds.labels&&ds.labels.length)res.known_events={total:sc.total,caught:sc.caught,false_alarms:sc.falseAlarms,events:ds.labels.map(l=>({event:l[2],from:tlabel(ds,l[0]),to:tlabel(ds,Math.max(l[0],l[1]-1)),caught:sc.wins.some(w=>w.a<l[1]+8&&w.b>l[0]-8)}))};
    if(A.ms!=null)res.seconds_to_score=sig(A.ms/1000,2);res.ran_on=ds.mine?'the visitor browser':'a CPU runner, precomputed';
    return {res,view:{type:'ad',id:ds.id,thr}};}},
  inspect_stream:{label:i=>'Reading '+sname(i.stream_id),async run(i){
    const ds=await getDs(i.stream_id),v=ds.values.filter(x=>x!=null&&isFinite(x)),s=Float64Array.from(v).sort(),mean=v.reduce((a,b)=>a+b,0)/Math.max(1,v.length);
    const B=24,sk=[];for(let k=0;k<B;k++){const a=Math.floor(k*ds.n/B),b=Math.max(a+1,Math.floor((k+1)*ds.n/B));let t=0,c=0;for(let j=a;j<b&&j<ds.n;j++){const y=ds.values[j];if(y!=null){t+=y;c++;}}sk.push(c?sig(t/c,3):null);}
    const res={stream:ds.name,stream_id:ds.id,source:ds.mine?(ds.mine.kind==='synth'?'generated in the visitor browser':'the visitor file, read in the browser'):(ds.kind==='synthetic'?'synthetic sample with known events':'public sample: '+ds.source.name+', '+ds.source.license),
      every:ds.noTime?'no timestamps':freqLabel[ds.freq]||ds.freq,points:ds.n,from:tlabel(ds,0),to:tlabel(ds,ds.n-1),unit:ds.unit||'',min:sig(s[0]),median:sig(s[Math.floor(s.length/2)]),mean:sig(mean),max:sig(s[s.length-1]),last_values:ds.values.slice(-6).map(x=>sig(x)),sketch_24_buckets:sk};
    if(ds.blurb)res.about=ds.blurb;if(ds.season>1)res.cycle_length_steps=ds.season;if(ds.labels&&ds.labels.length)res.known_events=evList(ds);if(ds.mine&&ds.mine.gaps)res.gaps_filled=ds.mine.gaps;
    return {res,view:{type:'prev',id:ds.id}};}},
  make_stream:{label:()=>'Generating the stream',async run(i){
    const rc=parseDesc(String(i.description||''),null);
    if(i.every&&SEC[i.every]){rc.freq=i.every;if(!i.points)rc.n=DEFN[rc.freq]||rc.n;if(SEC[rc.freq]>=86400)rc.daily=0;}
    if(i.level!=null&&isFinite(+i.level)&&+i.level!==0)rc.level=+i.level;if(i.unit)rc.unit=String(i.unit).slice(0,16);
    if(i.points)rc.n=clamp(Math.round(+i.points),120,MAXN);if(i.seed!=null&&isFinite(+i.seed))rc.seed=Math.abs(Math.round(+i.seed))%1e6||7;
    const c=synth(rc),ds=dsFromCand(c,null);ds.mine.rc=rc;ds.blurb=String(i.description||'').slice(0,240);
    const w=x=>x>=0.7?'strong':x>=0.4?'medium':x>0?'weak':'none';
    const res={stream_id:ds.id,name:ds.name,unit:ds.unit,every:freqLabel[ds.freq]||ds.freq,points:ds.n,from:tlabel(ds,0),to:tlabel(ds,ds.n-1),
      recipe:{level:rc.level,trend_pct_over_period:Math.round(rc.trend*100),daily_cycle:w(rc.daily),weekly_cycle:w(rc.weekly),yearly_cycle:w(rc.yearly),noise:rc.noise>=0.65?'high':rc.noise>=0.3?'medium':'low',shape:{normal:'normal',counts:'counts',heavy:'heavy tails',inter:'intermittent',walk:'random walk'}[rc.shape],seed:rc.seed},
      known_events:evList(ds),note:'Generated in the visitor browser. It ends at the last full step before now, so a forecast points at the real future.'};
    return {res,view:{type:'prev',id:ds.id}};}},
  use_column:{label:i=>'Switching '+sname(i.stream_id)+' to '+(i.column||i.series||'another column'),async run(i){
    const ds=S.streams[String(i.stream_id||'').trim()];if(!ds)throw new Error('Stream '+i.stream_id+' is not in this browser.');const u0=ds.mine&&ds.mine.up;if(!u0)throw new Error('use_column works on streams made from an uploaded file.');
    const a=u0.a,sel=Object.assign({},u0.sel);
    if(i.column){const want=String(i.column).trim().toLowerCase();let j=a.vcs.find(j=>a.names[j].toLowerCase()===want);if(j==null)j=a.vcs.find(j=>a.names[j].toLowerCase().indexOf(want)>=0);if(j==null)throw new Error('No number column called '+i.column+'. The number columns are '+a.vcs.map(j=>a.names[j]).join(', ')+'.');sel.v=j;}
    if(i.series){if(String(i.series).toLowerCase()==='all'){sel.s=-1;sel.sv='';}else{if(!a.scs.length||sel.t<0)throw new Error('This file has no series column.');const sc=sel.s>=0?sel.s:a.scs[0],ids=seriesIds(a,sc),want=String(i.series).trim();
      const hit=ids.find(e=>e[0]===want)||ids.find(e=>e[0].toLowerCase()===want.toLowerCase());if(!hit)throw new Error('No series '+want+'. Some of the series: '+ids.slice(0,12).map(e=>e[0]).join(', ')+'.');sel.s=sc;sel.sv=hit[0];}}
    if(i.every&&sel.t<0)sel.f=i.every;
    const u={a,file:u0.file,title:u0.title,sel},c=candFromUpload(u),nds=dsFromCand(c,u);
    return {res:attInfo(nds,u),view:{type:'prev',id:nds.id}};}},
  send_feedback:{label:()=>'A note for the team',run(i,P){return new Promise(resolve=>{
    const card=P.card('<div class="ck-h"><b>A note for the team</b><span>'+esc(i.kind||'feedback')+'</span></div><div class="ck-fb"><textarea rows="3" maxlength="1500" aria-label="Your note"></textarea><input type="email" maxlength="200" placeholder="Email, if you want a reply (optional)" aria-label="Email"><div class="row"><span>Goes to the team behind this site, with this exchange.</span><button type="button" class="btn ghost" data-v="0">Not now</button><button type="button" class="btn" data-v="1">Send</button></div></div>');
    $('textarea',card).value=String(i.message||'');$('input',card).value=String(i.email||'');
    const box=$('.ck-fb',card),ta=$('textarea',card),em=$('input',card);
    const fin=(sent,why,html)=>{const text=ta.value.trim();box.innerHTML=html;S.pending=null;resolve({res:sent?{sent:true}:{sent:false,reason:why},view:{type:'fb',sent,text}});};
    const notSent='<div class="ck-done" style="color:var(--ink-3)">Not sent.</div>';
    S.pending=()=>fin(false,'Stopped before it was sent.',notSent);
    card.addEventListener('click',async e=>{const b=e.target.closest('[data-v]');if(!b||!S.pending)return;
      if(b.dataset.v==='0'){fin(false,'The visitor chose not to send it.',notSent);return;}
      const notes=ta.value.trim(),email=em.value.trim();if(!notes){ta.focus();return;}b.disabled=true;
      const ok=await sendFeedback({rating:i.kind||'idea',notes,email,context:exchangeOf(S.T?S.T.item:S.items[S.items.length-1])});
      if(!S.pending)return;
      fin(ok,ok?'':'The note could not be sent, the service did not answer.',ok?'<div class="ck-done">Sent. Thank you.</div>':'<div class="ck-done" style="color:#ff8389">Could not send it right now.</div>');});});}}};
async function execTool(T,b){const t=T.tools[b.id]||(T.tool(b.id,b.name),T.tools[b.id]);T.toolInput(b.id,b.name,b.input);const line=t.line,lab=$('.lab',line),base=lab.textContent;
  const P={status:s=>{lab.textContent=s;},card:html=>{const c=el('div','ck stage',html);line.replaceWith(c);return c;}};
  const impl=TOOLS[b.name];
  try{if(!impl)throw new Error('Unknown tool '+b.name+'.');
    const out=await impl.run(b.input||{},P);lab.textContent=base;
    const part={k:'c',name:b.name,input:b.input||{},res:out.res,view:out.view};T.item.parts.push(part);
    if(line.isConnected){const c=await cardFor(part);line.replaceWith(c);}
    scrollEnd();return {type:'tool_result',tool_use_id:b.id,content:JSON.stringify(out.res)};}
  catch(e){const msg=e&&e.message?e.message:String(e);line.classList.add('err');lab.textContent='Could not run this: '+msg;T.item.parts.push({k:'e',text:'Could not run this: '+msg});
    return {type:'tool_result',tool_use_id:b.id,content:msg,is_error:true};}}

/* ---------- cards ---------- */
const tile=(v,k,cls)=>'<div class="pg-tile"><b class="'+(cls||'')+'">'+v+'</b><span>'+k+'</span></div>';
const pgLink=(id,ad)=>S.index&&S.index.datasets.some(d=>d.id===id)?'<a href="/playground?ds='+encodeURIComponent(id)+(ad?'&task=ad':'')+'" target="_blank" rel="noopener">Open in the playground ↗</a>':'';
async function cardFor(part){const v=part.view||{},r=part.res||{};
  if(v.type==='fb'){return el('div','ck stage','<div class="ck-h"><b>A note for the team</b><span>'+(v.sent?'sent':'not sent')+'</span></div>'+(v.text?'<div class="ck-done" style="color:var(--ink-2)">'+esc(v.text)+'</div>':''));}
  let ds=null;try{ds=v.id?(/^mine-/.test(v.id)?S.streams[v.id]||null:await getDs(v.id)):null;}catch(e){ds=null;}
  const c=el('div','ck stage');
  if(!ds){c.innerHTML='<div class="ck-h"><b>'+esc(r.stream||r.name||'Your stream')+'</b><span>'+esc(part.name.replace(/_/g,' '))+'</span></div><div class="ck-w sm"><div class="ck-gone">This chart used data from an earlier visit. It stays in the browser only while the page is open.</div></div>';return c;}
  if(v.type==='fc'){const M=ds.fc.models[v.model],o=ds.fc.origins[v.oi],fut=!!ds.fc.future&&v.oi===ds.fc.origins.length-1,where=ds.mine?'your browser':'CPU';
    const one=fut?null:metrics(ds,v.model,v.oi,v.h),nv=fut?null:metrics(ds,'snaive',v.oi,v.h),a=avgMetrics(ds,v.model,v.h),an=avgMetrics(ds,'snaive',v.h),m=fut?a:one,g=fut?gainOf(a,an):gainOf(one,nv);
    c.innerHTML='<div class="ck-h"><b>'+esc(ds.name)+'</b><span>'+esc(MODEL_NAMES[v.model])+' · '+(fut?'next ':'')+v.h+' '+esc(stepWord(ds,v.h))+(fut?'':' · from '+esc(fmtDate(ds,o)))+'</span></div><div class="ck-w"><canvas aria-label="Forecast chart"></canvas><div class="tip"></div></div>'+
      '<div class="pg-legend"><span><i style="background:'+C.ink+'"></i>history the model saw</span>'+(fut?'':'<span><i style="background:'+C.ink3+'"></i>what really happened</span>')+'<span><i style="background:'+MC[v.model]+'"></i>'+esc(MODEL_NAMES[v.model])+'</span><span><i class="band"></i>likely range</span>'+(fut?'':'<span><i style="background:'+C.ink4+';height:1px"></i>simple guess</span>')+'</div>'+
      '<div class="ck-tiles">'+tile(m&&isFinite(m.wape)?(m.wape*100).toFixed(1)+'%':'–',fut?'average error, '+(a?a.n:0)+' tests':'average error')+tile(betterTxt(g),'vs simple guess',g>=0?'green':'')+tile(m&&isFinite(m.cov)?Math.round(m.cov*100)+'%':'–','inside the range',m&&m.cov>=.7?'green':'')+tile(fmtMs(M.ms),'per forecast, '+where,'blue')+'</div>'+
      '<div class="ck-f"><span>'+(fut?'Forecast of the real future. Accuracy comes from backtests at earlier start points.':'Backtest. The model saw only the history before the dashed line.')+'</span>'+pgLink(ds.id)+'</div>';}
  else if(v.type==='race'){const keys=FCK.filter(k=>ds.fc.models[k]&&ds.fc.models[k].status==='ok'),nv=avgMetrics(ds,'snaive',v.h);const rows=keys.map(k=>({k,a:avgMetrics(ds,k,v.h)})).filter(x=>x.a).sort((x,y)=>x.a.mase-y.a.mase);
    c.innerHTML='<div class="ck-h"><b>'+esc(ds.name)+'</b><span>race · '+v.h+' '+esc(stepWord(ds,v.h))+' ahead · '+(rows[0]?rows[0].a.n:0)+' start points</span></div><div class="ck-w"><canvas aria-label="Race chart"></canvas><div class="tip"></div></div>'+
      '<table class="ck-tbl"><tr><th>Model</th><th>vs simple guess</th><th>avg error</th><th>in range</th><th>per forecast</th></tr>'+rows.map((x,k)=>'<tr class="'+(k===0?'best':'')+'"><td><i class="mdot" style="background:'+MC[x.k]+'"></i>'+esc(MODEL_NAMES[x.k])+'</td><td>'+betterTxt(gainOf(x.a,nv))+'</td><td>'+(x.a.wape*100).toFixed(1)+'%</td><td>'+(isFinite(x.a.cov)?Math.round(x.a.cov*100)+'%':'–')+'</td><td>'+fmtMs(ds.fc.models[x.k].ms)+'</td></tr>').join('')+(nv?'<tr><td><i class="mdot" style="background:'+C.ink4+'"></i>Simple guess</td><td>–</td><td>'+(nv.wape*100).toFixed(1)+'%</td><td>–</td><td>–</td></tr>':'')+'</table>'+
      '<div class="ck-f"><span>Averaged over every start point. The chart shows the latest one.</span>'+pgLink(ds.id)+'</div>';}
  else if(v.type==='ad'){const sc=adScore(ds,v.thr),A=adOf(ds);
    c.innerHTML='<div class="ck-h"><b>'+esc(ds.name)+'</b><span>'+esc(ds.mine?'TTM r3 in your browser':'TSPulse r1')+' · threshold '+v.thr.toFixed(2)+'</span></div><div class="ck-w"><canvas aria-label="Anomaly chart"></canvas><div class="tip"></div></div>'+
      '<div class="pg-legend"><span><i style="background:'+C.ink+'"></i>stream</span><span><i style="background:'+C.orange+'"></i>anomaly score</span><span><i class="ev"></i>flagged</span>'+(sc.total?'<span><i class="gt"></i>known event</span>':'')+'</div>'+
      '<div class="ck-tiles'+(sc.total?'':' t3')+'">'+tile(sc.wins.length,'flagged windows')+(sc.total?tile(sc.caught+' of '+sc.total,'known events caught',sc.caught===sc.total?'green':'')+tile(sc.falseAlarms,sc.falseAlarms===1?'false alarm':'false alarms',sc.falseAlarms===0?'green':''):tile(ds.n.toLocaleString('en-US'),'points scored'))+tile(A.ms!=null?(A.ms/1000).toFixed(1)+' s':'–',ds.mine?'in your browser':'on CPU','blue')+'</div>'+
      '<div class="ck-f"><span>'+(ds.mine?'Scored by how far each point falls outside TTM r3\'s own range.':'Every point scored from 0 to 1.')+'</span>'+pgLink(ds.id,1)+'</div>';}
  else{const evs=(ds.labels||[]).length;
    c.innerHTML='<div class="ck-h"><b>'+esc(ds.name)+'</b><span>'+esc(ds.noTime?'no timestamps':freqLabel[ds.freq]||ds.freq)+' · '+ds.n.toLocaleString('en-US')+' points'+(ds.unit?' · '+esc(ds.unit):'')+(evs?' · '+evs+' known event'+(evs===1?'':'s'):'')+'</span></div><div class="ck-w sm"><canvas aria-label="Preview of the stream"></canvas><div class="tip"></div></div>'+
      '<div class="ck-f"><span>'+(ds.mine?(ds.mine.kind==='synth'?'Generated in your browser · '+esc(ds.id):'Read in your browser, not uploaded · '+esc(ds.id)):esc(ds.source&&ds.source.name||''))+'</span>'+pgLink(ds.id)+'</div>';}
  const cv=$('canvas',c);if(cv){cv._v=v;cv._ds=ds;cv._tip=$('.tip',c);hookChart(cv);}
  return c;}

/* ---------- charts inside the cards ---------- */
const PD={l:46,r:12,t:14,b:24};
function prep(cv){const r=cv.getBoundingClientRect();if(r.width<4)return null;const dpr=Math.min(2,window.devicePixelRatio||1),W=r.width,H=r.height,w=Math.round(W*dpr),h=Math.round(H*dpr);if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h;}const x=cv.getContext('2d');x.setTransform(dpr,0,0,dpr,0,0);x.clearRect(0,0,W,H);return {x,W,H};}
function nstep(r,n){const raw=r/n,p=Math.pow(10,Math.floor(Math.log10(raw||1)));const f=raw/p;return (f<1.5?1:f<3.5?2:f<7.5?5:10)*p;}
const fnt=(x,px,mono)=>{x.font='400 '+px+'px '+(mono?MONO:SANS);};
function yGrid(g,lo,hi,Y,bottom,unit){const {x,W}=g;x.strokeStyle=C.grid;x.lineWidth=1;fnt(x,10,true);x.fillStyle=C.ink3;x.textAlign='right';const st=nstep(hi-lo,4),dec=st>=1?0:Math.min(3,-Math.floor(Math.log10(st)));
  const fm=v=>Math.abs(v)>=1e6?(v/1e6).toFixed(1)+'M':Math.abs(v)>=1e4?Math.round(v/1e3)+'k':v.toFixed(dec);
  for(let v=Math.ceil(lo/st)*st;v<=hi+1e-9;v+=st){const y=Y(v);if(y>bottom||y<PD.t-2)continue;x.beginPath();x.moveTo(PD.l,y+.5);x.lineTo(W-PD.r,y+.5);x.stroke();x.fillText(fm(v),PD.l-6,y+3);}
  if(unit){x.textAlign='left';x.fillStyle=C.ink4;x.fillText(unit,PD.l+4,PD.t+8);}}
function xTicks(g,ds,x0,x1,X){const {x,W,H}=g;fnt(x,10,true);x.fillStyle=C.ink3;x.textAlign='center';const n=Math.max(2,Math.min(6,Math.floor(W/150)));for(let k=0;k<=n;k++){const i=Math.round(x0+(x1-1-x0)*k/n);const px=X(i);if(px<PD.l+18||px>W-PD.r-18)continue;x.fillText(fmtDate(ds,i,true),px,H-PD.b+16);}}
function pline(x,get,a,b,X,Y,c,lw,dash){x.beginPath();let on=false;for(let i=a;i<b;i++){const v=get(i);if(v==null||!isFinite(v)){on=false;continue;}on?x.lineTo(X(i),Y(v)):x.moveTo(X(i),Y(v));on=true;}x.strokeStyle=c;x.lineWidth=lw;x.setLineDash(dash||[]);x.stroke();x.setLineDash([]);}
/* many points: one vertical stroke per pixel column, min to max */
function dline(x,vals,a,b,X,Y,c,lw){const W=X(b-1)-X(a);if(b-a<W*1.5)return pline(x,i=>vals[i],a,b,X,Y,c,lw);x.beginPath();let px=-1,mn=0,mx=0,first=true;
  for(let i=a;i<b;i++){const v=vals[i];if(v==null)continue;const p=Math.round(X(i));if(p!==px){if(px>=0){if(first){x.moveTo(px,Y(mn));first=false;}x.lineTo(px,Y(mx));x.lineTo(px,Y(mn));}px=p;mn=mx=v;}else{if(v<mn)mn=v;if(v>mx)mx=v;}}
  if(px>=0){x.lineTo(px,Y(mx));x.lineTo(px,Y(mn));}x.strokeStyle=c;x.lineWidth=lw;x.stroke();}
function paint(cv){const g=prep(cv);if(!g)return;const v=cv._v,ds=cv._ds;if(v.type==='fc'||v.type==='race')paintFc(g,cv,ds,v);else if(v.type==='ad')paintAd(g,cv,ds,v);else paintPrev(g,cv,ds);}
function paintFc(g,cv,ds,v){const {x,W,H}=g,o=ds.fc.origins[v.oi],h=v.h,fut=!!ds.fc.future&&v.oi===ds.fc.origins.length-1,keys=v.type==='race'?FCK.filter(k=>ds.fc.models[k]&&ds.fc.models[k].status==='ok'):[v.model];
  const pre=Math.min(ds.fc.ctx,o,W<520?Math.max(Math.round(1.5*h),h>=96?120:h>=30?45:18):Math.max(3*h,h>=96?240:h>=30?90:36)),x0=o-pre,x1=o+h,vals=ds.values;
  let lo=Infinity,hi=-Infinity;const see=y=>{if(y!=null&&isFinite(y)){if(y<lo)lo=y;if(y>hi)hi=y;}};for(let i=x0;i<Math.min(x1,ds.n);i++)see(vals[i]);
  keys.forEach(k=>{const M=ds.fc.models[k];for(let j=0;j<h;j++){see(M.point[v.oi][j]);if(keys.length===1&&M.lo&&M.lo.length){see(M.lo[v.oi][j]);see(M.hi[v.oi][j]);}}});
  if(!isFinite(lo)){lo=0;hi=1;}const pad=(hi-lo)*0.1||1,nn=lo>=0;lo-=pad;hi+=pad;if(nn&&lo<0)lo=0;
  const X=i=>PD.l+(W-PD.l-PD.r)*(i-x0)/Math.max(1,x1-1-x0),Y=y=>PD.t+(H-PD.t-PD.b)*(1-(y-lo)/(hi-lo));cv._geo={x0,x1,X};
  yGrid(g,lo,hi,Y,H-PD.b,ds.unit);xTicks(g,ds,x0,x1,X);
  const ox=X(o)-(X(o)-X(o-1))/2;x.setLineDash([3,4]);x.strokeStyle='rgba(255,255,255,.35)';x.lineWidth=1;x.beginPath();x.moveTo(ox,PD.t);x.lineTo(ox,H-PD.b);x.stroke();x.setLineDash([]);
  fnt(x,10,true);x.fillStyle=C.ink3;x.textAlign=ox>W-110?'right':'left';x.fillText('forecast starts',ox>W-110?ox-6:ox+6,PD.t+10);
  pline(x,i=>vals[i],x0,o,X,Y,C.ink,1.3);
  if(!fut)pline(x,i=>vals[i],o-1,Math.min(x1,ds.n),X,Y,C.ink3,1.2,[4,3]);
  if(keys.length===1){const M=ds.fc.models[keys[0]],nv=ds.fc.models.snaive;
    if(!fut&&nv&&nv.status==='ok')pline(x,i=>i===o-1?vals[o-1]:nv.point[v.oi][i-o],o-1,x1,X,Y,C.ink4,1,[2,3]);
    if(M.lo&&M.lo.length){x.beginPath();for(let j=0;j<h;j++){const px=X(o+j),py=Y(M.hi[v.oi][j]);j?x.lineTo(px,py):x.moveTo(px,py);}for(let j=h-1;j>=0;j--)x.lineTo(X(o+j),Y(M.lo[v.oi][j]));x.closePath();x.fillStyle=C.band;x.fill();}}
  keys.forEach(k=>{const M=ds.fc.models[k];pline(x,i=>i===o-1?vals[o-1]:M.point[v.oi][i-o],o-1,x1,X,Y,MC[k],2);x.fillStyle=MC[k];x.beginPath();x.arc(X(x1-1),Y(M.point[v.oi][h-1]),2.6,0,Math.PI*2);x.fill();});
  if(cv._hx!=null){const i=clamp(Math.round(x0+(x1-1-x0)*(cv._hx-PD.l)/(W-PD.l-PD.r)),x0,x1-1),j=i-o,y=vals[i];x.strokeStyle='rgba(255,255,255,.28)';x.lineWidth=1;x.beginPath();x.moveTo(X(i),PD.t);x.lineTo(X(i),H-PD.b);x.stroke();
    let t='<b>'+esc(fmtDate(ds,i))+'</b>';if(y!=null&&(j<0||!fut))t+='<br>'+(j<0?'history ':'actual ')+fmtNum(y)+(ds.unit?' '+esc(ds.unit):'');
    if(j>=0)keys.forEach(k=>{const M=ds.fc.models[k];t+='<br><span style="color:'+MC[k]+'">'+esc(MODEL_NAMES[k])+'</span> '+fmtNum(M.point[v.oi][j])+(keys.length===1&&M.lo&&M.lo.length?' · range '+fmtNum(M.lo[v.oi][j])+' to '+fmtNum(M.hi[v.oi][j]):'');});
    tipAt(cv,X(i),t);}else cv._tip.style.display='none';}
function paintAd(g,cv,ds,v){const {x,W,H}=g,s=adOf(ds).score,vals=ds.values,x0=0,x1=ds.n;let lo=Infinity,hi=-Infinity;vals.forEach(y=>{if(y!=null){if(y<lo)lo=y;if(y>hi)hi=y;}});if(!isFinite(lo)){lo=0;hi=1;}
  const pad=(hi-lo)*0.08||1,nn=lo>=0;lo-=pad;hi+=pad;if(nn&&lo<0)lo=0;const split=H-PD.b-Math.round((H-PD.t-PD.b)*0.3);
  const X=i=>PD.l+(W-PD.l-PD.r)*(i-x0)/Math.max(1,x1-1-x0),Y=y=>PD.t+(split-PD.t-6)*(1-(y-lo)/(hi-lo)),YS=q=>H-PD.b-(H-PD.b-split-8)*q;cv._geo={x0,x1,X};
  yGrid(g,lo,hi,Y,split-6,ds.unit);xTicks(g,ds,x0,x1,X);
  (ds.labels||[]).forEach(l=>{const a=X(l[0]),w=Math.max(2,X(l[1])-X(l[0]));x.fillStyle='rgba(66,190,101,.13)';x.fillRect(a,PD.t,w,H-PD.t-PD.b);x.strokeStyle='rgba(66,190,101,.5)';x.strokeRect(a+.5,PD.t+.5,w-1,H-PD.t-PD.b-1);});
  flagged(ds,v.thr).forEach(w=>{x.fillStyle='rgba(250,77,86,.2)';x.fillRect(X(w.a),PD.t,Math.max(2,X(w.b)-X(w.a)),H-PD.t-PD.b);});
  dline(x,vals,x0,x1,X,Y,C.ink,1);
  x.strokeStyle='rgba(255,255,255,.12)';x.beginPath();x.moveTo(PD.l,split+.5);x.lineTo(W-PD.r,split+.5);x.stroke();fnt(x,9.5,true);x.fillStyle=C.ink3;x.textAlign='left';x.fillText('anomaly score',PD.l+4,split+12);
  x.beginPath();x.moveTo(X(0),YS(0));const stp=Math.max(1,Math.floor(ds.n/(W-PD.l-PD.r)));for(let i=0;i<ds.n;i+=stp){let m=0;for(let k=i;k<Math.min(ds.n,i+stp);k++)m=Math.max(m,s[k]||0);x.lineTo(X(i),YS(clamp(m,0,1)));}x.lineTo(X(ds.n-1),YS(0));x.closePath();x.fillStyle='rgba(255,131,43,.3)';x.fill();
  const ty=YS(v.thr);x.setLineDash([3,3]);x.strokeStyle='rgba(255,131,137,.85)';x.lineWidth=1;x.beginPath();x.moveTo(PD.l,ty);x.lineTo(W-PD.r,ty);x.stroke();x.setLineDash([]);
  if(cv._hx!=null){const i=clamp(Math.round(x0+(x1-1-x0)*(cv._hx-PD.l)/(W-PD.l-PD.r)),0,ds.n-1);x.strokeStyle='rgba(255,255,255,.28)';x.beginPath();x.moveTo(X(i),PD.t);x.lineTo(X(i),H-PD.b);x.stroke();
    const l=(ds.labels||[]).find(q=>i>=q[0]&&i<q[1]);tipAt(cv,X(i),'<b>'+esc(fmtDate(ds,i))+'</b><br>value '+fmtNum(vals[i])+(ds.unit?' '+esc(ds.unit):'')+'<br>score '+(s[i]||0).toFixed(2)+((s[i]||0)>=v.thr?' · <span style="color:#ff8389">flagged</span>':'')+(l?'<br><span style="color:#6fdc8c">known: '+esc(l[2])+'</span>':''));}else cv._tip.style.display='none';}
function paintPrev(g,cv,ds){const {x,W,H}=g,vals=ds.values;let lo=Infinity,hi=-Infinity;vals.forEach(y=>{if(y!=null){if(y<lo)lo=y;if(y>hi)hi=y;}});if(!isFinite(lo)){lo=0;hi=1;}if(hi===lo){hi+=1;lo-=1;}const pad=(hi-lo)*0.1;lo-=pad;hi+=pad;
  const T=10,B=18,X=i=>PD.l+(W-PD.l-PD.r)*i/Math.max(1,ds.n-1),Y=y=>T+(H-T-B)*(1-(y-lo)/(hi-lo));cv._geo={x0:0,x1:ds.n,X};
  (ds.labels||[]).forEach(l=>{x.fillStyle='rgba(66,190,101,.16)';x.fillRect(X(l[0]),T,Math.max(2,X(l[1])-X(l[0])),H-T-B);x.fillStyle='rgba(111,220,140,.9)';x.fillRect(X(l[0]),T,Math.max(2,X(l[1])-X(l[0])),2);});
  fnt(x,10,true);x.fillStyle=C.ink3;x.textAlign='right';x.fillText(fmtNum(hi-pad),PD.l-6,Y(hi-pad)+3);x.fillText(fmtNum(lo+pad),PD.l-6,Y(lo+pad)+3);
  x.textAlign='left';x.fillText(fmtDate(ds,0,true),PD.l,H-5);x.textAlign='right';x.fillText(fmtDate(ds,ds.n-1,true),W-PD.r,H-5);
  dline(x,vals,0,ds.n,X,Y,'rgba(244,244,244,.92)',1);
  if(cv._hx!=null){const i=clamp(Math.round((ds.n-1)*(cv._hx-PD.l)/(W-PD.l-PD.r)),0,ds.n-1);x.strokeStyle='rgba(255,255,255,.28)';x.beginPath();x.moveTo(X(i),T);x.lineTo(X(i),H-B);x.stroke();
    const l=(ds.labels||[]).find(q=>i>=q[0]&&i<q[1]);tipAt(cv,X(i),'<b>'+esc(fmtDate(ds,i))+'</b><br>'+fmtNum(vals[i])+(ds.unit?' '+esc(ds.unit):'')+(l?'<br><span style="color:#6fdc8c">'+esc(l[2])+'</span>':''));}else cv._tip.style.display='none';}
function tipAt(cv,px,html){const t=cv._tip;t.innerHTML=html;t.style.display='block';const W=cv.getBoundingClientRect().width,w=t.offsetWidth;t.style.left=Math.max(4,Math.min(W-w-4,px>W*0.6?px-12-w:px+12))+'px';t.style.top='10px';}
const RO=window.ResizeObserver?new ResizeObserver(es=>es.forEach(e=>{const cv=$('canvas',e.target);if(cv&&cv._v)paint(cv);})):null;
function hookChart(cv){const move=e=>{const r=cv.getBoundingClientRect();const px=e.clientX-r.left;cv._hx=px<PD.l||px>r.width-PD.r?null:px;paint(cv);};
  cv.addEventListener('pointermove',move);cv.addEventListener('pointerdown',move);cv.addEventListener('pointerleave',()=>{cv._hx=null;paint(cv);});
  if(RO)RO.observe(cv.parentElement);requestAnimationFrame(()=>paint(cv));}

/* ---------- attaching data: files, drops and pasted cells ---------- */
function renderAtt(){ATT.innerHTML='';const a=S.att;ATT.hidden=!a;if(a){const c=chipEl(a.chip,!a.busy);ATT.appendChild(c);const x=$('button',c);if(x)x.addEventListener('click',()=>{S.att=null;renderAtt();refreshSend();Q.focus();});}refreshSend();}
async function attachFile(file){if(S.busy)return;S.att={busy:true,chip:{name:file.name,meta:'reading…'}};renderAtt();
  try{const t=await readFile(file);takeTable(t,file.name);}catch(e){S.att={err:true,chip:{name:file.name,meta:e.message||String(e),err:true}};renderAtt();S.att.bad=true;}}
function takeTable(t,name){const u=tableUp(t,name),c=candFromUpload(u),ds=dsFromCand(c,u),info=attInfo(ds,u);
  S.att={ds,info,chip:{name:name||'Pasted data',meta:ds.n.toLocaleString('en-US')+' points · '+(ds.noTime?'no timestamps':(freqLabel[ds.freq]||ds.freq))+' · '+info.value_column}};renderAtt();Q.focus();}
FILE.addEventListener('change',()=>{const f=FILE.files&&FILE.files[0];FILE.value='';if(f)attachFile(f);});
$('#ch-attach').addEventListener('click',()=>FILE.click());
let dragN=0;const hasFiles=e=>e.dataTransfer&&Array.from(e.dataTransfer.types||[]).indexOf('Files')>=0;
window.addEventListener('dragenter',e=>{if(!hasFiles(e))return;e.preventDefault();dragN++;DROP.hidden=false;});
window.addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault();});
window.addEventListener('dragleave',e=>{if(!hasFiles(e))return;dragN=Math.max(0,dragN-1);if(!dragN)DROP.hidden=true;});
window.addEventListener('drop',e=>{if(!hasFiles(e))return;e.preventDefault();dragN=0;DROP.hidden=true;const f=e.dataTransfer.files&&e.dataTransfer.files[0];if(f)attachFile(f);});
Q.addEventListener('paste',e=>{const t=e.clipboardData&&e.clipboardData.getData('text/plain');if(!t||S.busy)return;const lines=t.split(/\r\n|\n|\r/).filter(l=>l.trim());if(lines.length<20)return;
  try{const tb=parseCSV(t);const u=tableUp(tb,'');const c=candFromUpload(u);if(c.values.length<20)return;e.preventDefault();takeTable(tb,'Pasted data');}catch(er){/* plain text after all */}});

/* ---------- the composer ---------- */
function grow(){Q.style.height='auto';Q.style.height=Math.min(220,Q.scrollHeight+2)+'px';}
function refreshSend(){if(S.busy){SEND.disabled=false;return;}SEND.disabled=!Q.value.trim()&&!(S.att&&S.att.ds);}
function setBusy(on){SEND.classList.toggle('stop',!!on);SEND.setAttribute('aria-label',on?'Stop':'Send');refreshSend();}
Q.addEventListener('input',()=>{grow();refreshSend();});
Q.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&!COARSE){e.preventDefault();if(!S.busy)submit();}});
$('#ch-box').addEventListener('submit',e=>{e.preventDefault();if(S.busy)stop();else submit();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&S.busy)stop();});
$$('.ch-st').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.attach){FILE.click();return;}if(!S.busy)submit(b.dataset.q);}));
NEW.addEventListener('click',()=>{if(S.busy)stop();S.convo=[];S.items=[];S.turns=0;TH.innerHTML='';setEmpty(true);try{localStorage.removeItem(SKEY);}catch(e){}Q.focus();});
function submit(preset){const text=(preset!=null?preset:Q.value).trim(),att=S.att&&S.att.ds?S.att:null;if(S.busy||(!text&&!att))return;
  if(S.turns>=MAXTURNS){note('This conversation is long. Start a new chat to keep going.');return;}
  setEmpty(false);S.att=null;renderAtt();if(preset==null){Q.value='';grow();}
  addUser(text,att&&att.chip);const blocks=[];
  if(att)blocks.push({type:'text',text:'[Attached data, read in the visitor\'s browser and not uploaded] '+JSON.stringify(att.info)});
  blocks.push({type:'text',text:text||'(The visitor attached data without a question.)'});
  pushUser(blocks);S.items.push({r:'u',text,att:att&&att.chip});S.turns++;scrollEnd(true);runTurn();}

/* ---------- keeping the conversation in this browser ---------- */
function save(){try{if(!S.convo.length){localStorage.removeItem(SKEY);return;}const s=JSON.stringify({v:1,at:Date.now(),k:MINE.k,turns:S.turns,convo:S.convo,items:S.items});if(s.length<3e6)localStorage.setItem(SKEY,s);}catch(e){/* storage full or blocked */}}
async function restore(){let o=null;try{o=JSON.parse(localStorage.getItem(SKEY)||'null');}catch(e){o=null;}
  if(!o||o.v!==1||!Array.isArray(o.convo)||!o.convo.length||Date.now()-o.at>14*864e5)return;
  S.convo=o.convo;repair();S.items=o.items||[];S.turns=o.turns||0;MINE.k=Math.max(MINE.k,o.k||0);setEmpty(false);await idxP;
  for(const it of S.items){if(it.r==='u'){addUser(it.text,it.att);continue;}
    const T=new Turn(it);for(const p of it.parts){if(p.k==='t'){const d=el('div','md');d.innerHTML=md(p.md);T.body.appendChild(d);}else if(p.k==='c'){T.body.appendChild(await cardFor(p));}else if(p.k==='e'){T.body.appendChild(el('div','m-tool err','<span class="lab">'+esc(p.text)+'</span>'));}else if(p.k==='n'){T.body.appendChild(el('div','ch-note'+(p.cls?' '+p.cls:''),'<span>'+p.text+'</span>'));}}
    T.finish();}
  const last=S.convo[S.convo.length-1];if(last&&last.role==='user'&&!last.content.some(b=>b.type==='tool_result')){note('The last answer did not finish.','',['Try again',()=>runTurn()]);}
  requestAnimationFrame(()=>scrollEnd(true));}

/* ---------- start ---------- */
if(COARSE)Q.placeholder='Ask about the models, or attach a CSV';
(function(){const on=$('.nav-links a.on');if(on&&on.parentElement.scrollWidth>on.parentElement.clientWidth+4)on.parentElement.scrollLeft=Math.max(0,on.offsetLeft-on.parentElement.clientWidth/2+on.offsetWidth/2);})();
document.addEventListener('click',e=>{const a=e.target.closest('a[href="#ch-skill"]');if(!a)return;e.preventDefault();const d=$('#ch-skill');d.open=true;d.scrollIntoView({block:'nearest'});d.querySelector('summary').focus({preventScroll:true});});
fetch('/api/chat',{cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{S.ready=!!(j&&j.ready);if(j&&!j.ready)$('#ch-off').hidden=false;}).catch(()=>{});
restore().then(()=>{refreshSend();if(!COARSE&&CH.dataset.empty==='1')Q.focus({preventScroll:true});});
manifest().catch(()=>{});
})();
