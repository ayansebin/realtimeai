/* the "from words to decisions" chart for the film opening: wave one on unstructured data, wave two on time series */
window.__shiftHTML=(()=>{
  const ic={
    text:'<path d="M4 6h16M4 10h16M4 14h11M4 18h8"/>',
    image:'<rect x="3.5" y="4.5" width="17" height="15" rx="1"/><path d="M5 17l5-5.5 4 4 2.5-2.5L20 17"/><circle cx="15.5" cy="9" r="1.6"/>',
    doc:'<path d="M6 3.5h8l4.5 4.5v12.5h-12.5z"/><path d="M14 3.5V8h4.5M9 12.5h6.5M9 16h6.5"/>',
    chat:'<path d="M4 5.5h16v10H10l-4.5 3.5v-3.5H4z"/><path d="M8 10h.01M12 10h.01M16 10h.01" stroke-width="2.4" stroke-linecap="round"/>',
    copilot:'<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
    agent:'<circle cx="12" cy="6" r="2.4"/><circle cx="5.5" cy="17.5" r="2.4"/><circle cx="18.5" cy="17.5" r="2.4"/><path d="M10.9 8.1l-3.9 7.2M13.1 8.1l3.9 7.2M7.9 17.5h8.2"/>',
    gear:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.6M12 17.9v2.6M3.5 12h2.6M17.9 12h2.6M6 6l1.8 1.8M16.2 16.2L18 18M6 18l1.8-1.8M16.2 7.8L18 6"/>',
    bars:'<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="6"/><rect x="10.5" y="8" width="3" height="10"/><rect x="15.5" y="5" width="3" height="13"/>',
    pulse:'<path d="M3 13h4l2-5 3.5 9 2.5-6 1.5 2H21"/><circle cx="18.5" cy="6" r="1.6"/>'
  };
  const svg=k=>'<svg class="sh-ic" viewBox="0 0 24 24" aria-hidden="true">'+ic[k]+'</svg>';
  /* a little live line for each stream: the path is two periods long and slides left */
  const spark=(d)=>'<svg class="sh-sp" viewBox="0 0 60 20" preserveAspectRatio="none" aria-hidden="true"><g class="sh-sp-g"><path d="'+d+'"/></g></svg>';
  const S1='M0 12 L6 9 L12 13 L18 7 L24 11 L30 6 L36 12 L42 10 L48 14 L54 8 L60 12 L66 9 L72 13 L78 7 L84 11 L90 6 L96 12 L102 10 L108 14 L114 8 L120 12';
  const S2='M0 14 L10 14 L14 4 L18 14 L30 14 L34 8 L38 14 L50 14 L54 3 L58 14 L60 14 L70 14 L74 4 L78 14 L90 14 L94 8 L98 14 L110 14 L114 3 L118 14 L120 14';
  const S3='M0 10 C10 4 20 4 30 10 S50 16 60 10 S80 4 90 10 S110 16 120 10';
  const chip=(cls,icon,label,extra)=>'<div class="sh-chip '+cls+'">'+svg(icon)+'<span>'+label+'</span>'+(extra||'')+'</div>';
  const flow=(side,ins,node,outs)=>'<div class="sh-viz">'+
      '<svg class="sh-wires" viewBox="0 0 520 300" preserveAspectRatio="none" aria-hidden="true">'+
        [50,150,250].map(y=>'<path class="w in" d="M146 '+y+' C 166 '+y+', 162 150, 182 150"/>').join('')+
        [50,150,250].map(y=>'<path class="w out" d="M282 150 C 302 150, 298 '+y+', 318 '+y+'"/>').join('')+
      '</svg>'+
      '<div class="sh-col ins">'+ins.join('')+'</div>'+
      '<div class="sh-node">'+node+'</div>'+
      '<div class="sh-col outs">'+outs.join('')+'</div>'+
    '</div>';
  const A='<div class="sh-card a">'+
      '<div class="sh-top"><span class="sh-n"><b>01</b>Unstructured data</span><span class="sh-pill">Transformed</span></div>'+
      '<div class="sh-big">Foundation models for language and vision</div>'+
      flow('a',[chip('i1','text','Text'),chip('i2','image','Images'),chip('i3','doc','Documents')],
        '<b>LLMs</b><span>foundation models</span>',
        [chip('o1','chat','Chatbots'),chip('o2','copilot','Copilots'),chip('o3','agent','Agents')])+
      '<div class="sh-foot">Where knowledge work lives.</div>'+
    '</div>';
  const B='<div class="sh-card b">'+
      '<div class="sh-top"><span class="sh-n"><b>02</b>Time series and streaming data</span><span class="sh-pill on">The bigger prize</span></div>'+
      '<div class="sh-big">Time series foundation models</div>'+
      flow('b',[chip('i1','pulse','Sensors',spark(S1)),chip('i2','bars','Transactions',spark(S2)),chip('i3','pulse','Telemetry',spark(S3))],
        '<em>IBM Granite</em><b>Time Series</b><span>foundation models</span>',
        [chip('o1','gear','Production optimization'),chip('o2','bars','Demand planning'),chip('o3','pulse','Anomaly detection')])+
      '<div class="sh-foot">Where the mission-critical decisions live.</div>'+
    '</div>';
  return '<div class="sh-stage"><div class="sh-head"><h2>From words to decisions</h2>'+
      '<p><i class="lg a"></i>Wave one: unstructured data<i class="lg b"></i>Wave two: time series and streaming data</p></div>'+
    '<div class="sh-grid">'+A+'<div class="sh-mid"><svg viewBox="0 0 40 16" aria-hidden="true"><path d="M0 8h34M28 2l7 6-7 6"/></svg></div>'+B+'</div></div>';
})();

/* film mode driver: follows the demo's steps and frames one chart at a time.
   Logs every cut, caption and label so the editor can crossfade shots and draw the captions on top. */
(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const VW=innerWidth,VH=innerHeight,TOP=40,CAP=92,MX=40,CAPTURE=!!window.__filmCapture;
  document.documentElement.classList.add('film');
  window.scrollTo=function(){};window.scroll=function(){};Element.prototype.scrollIntoView=function(){};
  const ui=document.createElement('div');ui.id='film-ui';if(CAPTURE)ui.classList.add('capture');
  ui.innerHTML='<div class="f-top"><span class="f-brand"><i></i>Real-time intelligence</span><span class="f-label" id="f-label"></span></div>'+
    '<div class="f-cap" id="f-cap"></div>'+
    '<div class="f-card f-title" id="f-title"><div class="f-eye"><i></i>IBM Granite Time Series models on Confluent</div><h1><em class="b">Time series intelligence</em> meets <em class="g">real-time context</em>.</h1></div>'+
    '<div class="f-card f-shift" id="f-thesis" hidden>'+window.__shiftHTML+'</div>'+
    '<div class="f-card f-end" id="f-end" hidden><div class="f-eye"><i></i>Real-time intelligence</div><h1>Bring us <em class="b">a stream and a decision</em>.</h1>'+
      '<div class="f-steps">'+
        '<div class="fs" data-k="1"><b>01</b><strong>Try the models</strong><span>realtimeintelligence.io/playground</span></div>'+
        '<div class="fs" data-k="2"><b>02</b><strong>Sign up for early access</strong><span>confluent.io/get-started</span></div>'+
        '<div class="fs" data-k="3"><b>03</b><strong>Co-innovate with us</strong><span>realtimeintelligence.io</span></div>'+
      '</div></div>';
  document.body.appendChild(ui);
  const label=$('#f-label'),cap=$('#f-cap'),title=$('#f-title'),thesis=$('#f-thesis'),end=$('#f-end');
  const log=window.__film={cuts:[],caps:[],labels:[]};
  const cut=why=>log.cuts.push({t:Date.now(),why});
  const setLabel=h=>{if(label.innerHTML===h)return;label.innerHTML=h;log.labels.push({t:Date.now(),h});};
  let cur=null,shotZ=1,shotT=0;
  function release(el){if(!el)return;el.classList.remove('film-shot');['position','left','top','width','zoom','margin','z-index'].forEach(p=>el.style.removeProperty(p));}
  function fit(force){
    const el=cur;if(!el)return;
    const z0=parseFloat(el.style.zoom)||1,h=el.getBoundingClientRect().height/z0,avail=VH-TOP-CAP;
    let z=Math.min(1,(avail-8)/h);if(!force)z=Math.min(z,shotZ);
    if(!force&&Math.abs(z-z0)<0.004)return;
    shotZ=z;const vw=(VW-2*MX)*z,vh=h*z,left=(VW-vw)/2,top=TOP+(avail-vh)/2;
    el.style.setProperty('zoom',String(z));el.style.setProperty('left',(left/z)+'px','important');el.style.setProperty('top',(top/z)+'px','important');
    window.dispatchEvent(new Event('resize'));
  }
  function frame(el,lab){
    if(!el)return;
    if(cur!==el){release(cur);cur=el;el.classList.add('film-shot');shotZ=1;shotT=performance.now();}
    el.style.setProperty('width',(VW-2*MX)+'px','important');el.style.setProperty('zoom','1');el.style.setProperty('left',MX+'px','important');el.style.setProperty('top',TOP+'px','important');
    fit(true);
    if(lab!=null)setLabel(lab);
  }
  (function watch(){fit(false);setTimeout(watch,performance.now()-shotT<1500?60:250);})();
  const UC={5:['#uc-prod','Production optimization'],6:['#uc-anom','Anomaly detection'],7:['#uc-demand','Supply chain planning'],8:['#uc-fraud','Fraud and security'],9:['#uc-search','Semantic search'],10:['#uc-trade','Trading']};
  /* use case navigation: every use case in a row, the current one underlined, so the viewer always knows where they are */
  const UCN=[5,6,7,8,9,10].map(k=>UC[k][1]);
  const nav=k=>'<b>03</b>Use cases<span class="nav-uc">'+UCN.map((n,j)=>'<i class="'+(j<k?'done':j===k?'on':'')+'">'+n+'</i>').join('')+'</span>';
  let step=-1,subN=0;
  /* opening: title card, then the thesis card, then the live hero chart */
  function toThesis(){if(title.hidden)return;title.hidden=true;thesis.hidden=false;cut('title');}
  function toHero(){if(thesis.hidden&&title.hidden&&cap.style.opacity==='')return;title.hidden=true;thesis.hidden=true;cap.style.opacity='';cut('hero');}
  function onStep(i){
    if(i===step)return;step=i;subN=0;
    if(i<=2){if(i===0){title.hidden=false;thesis.hidden=true;cap.style.opacity='0';cut('start');}frame($('#st-live'),'<b>01</b>Innovation');if(i>0)toHero();return;}
    if(i===3){frame($('#st-arch'),'<b>01</b>Confluent + IBM Granite');cut('arch');return;}
    if(i===4){frame($('#st-three'),'<b>02</b>Three things change for your teams');cut('value');return;}
    if(UC[i]){frame($(UC[i][0]),nav(i-5));cut(UC[i][0]);return;}
    if(i===11){end.hidden=false;cap.style.opacity='0';setLabel('');cut('end');return;}  /* the film script ends on the call to action */
  }
  function onCap(){
    if(step===0){if(subN===2)toThesis();if(subN>=2&&subN<=7)thesis.classList.add('s'+(subN-1));if(subN===8)toHero();}
    if(step===11){const on=k=>{const e=end.querySelector('.fs[data-k="'+k+'"]');if(e)e.classList.add('on');};if(subN===1)on(1);if(subN===2)on(2);if(subN===4)on(3);}
  }
  const stepEl=$('#pitch-step');
  new MutationObserver(()=>{const m=/^(\d+)\s*\//.exec(stepEl.textContent.trim());if(m)onStep(+m[1]-1);}).observe(stepEl,{childList:true,characterData:true,subtree:true});
  const pc=$('#pitch-cap');
  new MutationObserver(()=>{const h=pc.innerHTML;cap.innerHTML='<span>'+h+'</span>';cap.classList.remove('in');void cap.offsetWidth;cap.classList.add('in');log.caps.push({t:Date.now(),h,step});
    subN++;onCap();}).observe(pc,{childList:true,subtree:true,characterData:true});
  window.__cuts=log.cuts;
})();
