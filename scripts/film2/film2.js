/* film mode driver, timeline edition: the recorder calls window.__film2 at the source film's own times.
   Frames one chart at a time, swaps the cards in and out, and logs every cut and label for the editor. */
(()=>{
  const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
  const VW=innerWidth,VH=innerHeight,TOP=40,CAP=92,MX=40,CAPTURE=!!window.__filmCapture;
  document.documentElement.classList.add('film');
  window.scrollTo=function(){};window.scroll=function(){};Element.prototype.scrollIntoView=function(){};
  const LINES='<svg class="lines" viewBox="0 0 600 600" aria-hidden="true" preserveAspectRatio="none"><g fill="none" stroke="#9BE7FF" stroke-width="1" stroke-opacity=".55"><path d="M0 600 L600 0"/><path d="M60 600 L600 60"/><path d="M120 600 L600 120"/><path d="M180 600 L600 180"/><path d="M240 600 L600 240"/><path d="M300 600 L600 300"/><path d="M360 600 L600 360"/><path d="M420 600 L600 420"/><path d="M480 600 L600 480"/><path d="M0 540 L540 0"/><path d="M0 480 L480 0"/><path d="M0 420 L420 0"/><path d="M0 360 L360 0"/></g></svg>';
  const ui=document.createElement('div');ui.id='film-ui';if(CAPTURE)ui.classList.add('capture');
  ui.innerHTML='<div class="f-top"><span class="f-brand" id="f-brand"><i></i>Real-time intelligence</span><span class="f-label" id="f-label"></span></div>'+
    '<div class="f-cap" id="f-cap"></div>'+
    '<div class="f-card f-models" id="f-models" hidden><div class="f-head"><div class="f-eye"><i></i>IBM Granite Time Series</div><h1>A holistic model family.</h1><p class="sub">Different strengths for different jobs, data rhythms and budgets.</p></div>'+
      '<div class="f-proof"><strong>Leading forecasting and anomaly detection benchmark performers</strong><span>In production with multiple clients</span><small>Forecasting: commercial-friendly zero-shot category · GIFT-Eval, Aug 2026.<br>Anomaly detection: #1 in univariate and multivariate · TSB-AD.</small></div></div>'+
    '<div class="f-card f-gallery" id="f-gallery" hidden><h1>Mission-critical decisions across the business.</h1><div class="grid" id="f-grid"></div></div>'+
    '<div class="f-card f-end" id="f-end" hidden><div class="f-eye"><i></i>Real-time intelligence</div><h1>Turn time series into <em class="b">better decisions</em>.</h1>'+
      '<div class="f-steps">'+
        '<div class="fs" data-k="1"><b>01</b><strong>Try the time series models</strong><span>Forecast, detect and optimize. realtimeintelligence.io/playground</span></div>'+
        '<div class="fs" data-k="2"><b>02</b><strong>Get in touch</strong><span>Bring real-time intelligence to your business. realtimeintelligence.io</span></div>'+
      '</div></div>';
  document.body.appendChild(ui);
  const brand=$('#f-brand'),label=$('#f-label');
  const log=window.__film={cuts:[],labels:[],brands:[]};
  const cut=why=>log.cuts.push({t:Date.now(),why});
  const setLabel=h=>{if(label.innerHTML===h)return;label.innerHTML=h;log.labels.push({t:Date.now(),h});};
  const setBrand=(text,quiet)=>{const h=text===null?'':(quiet?'<i></i>'+text:'<i></i>'+text);brand.style.visibility=text===null?'hidden':(CAPTURE?'':'visible');brand.classList.toggle('quiet',!!quiet);brand.innerHTML=h;log.brands.push({t:Date.now(),text,quiet:!!quiet});};
  let cur=null,shotZ=1,shotT=0,shotOpt={};
  function release(el){if(!el)return;el.classList.remove('film-shot','why','flat');['position','left','top','width','zoom','margin','z-index'].forEach(p=>el.style.removeProperty(p));}
  function fit(force){
    const el=cur;if(!el)return;
    const z0=parseFloat(el.style.zoom)||1,h=el.getBoundingClientRect().height/z0,avail=VH-TOP-CAP;
    const W=shotOpt.width||(VW-2*MX);
    let z=Math.min(1,(avail-8)/h);if(shotOpt.top!=null)z=1;if(!force)z=Math.min(z,shotZ);
    if(!force&&Math.abs(z-z0)<0.004)return;
    shotZ=z;const vw=W*z,vh=h*z,left=(VW-vw)/2,top=shotOpt.top!=null?shotOpt.top:TOP+(avail-vh)/2;
    el.style.setProperty('zoom',String(z));el.style.setProperty('left',(left/z)+'px','important');el.style.setProperty('top',(top/z)+'px','important');
    window.dispatchEvent(new Event('resize'));
  }
  function frame(sel,opt){
    const el=typeof sel==='string'?$(sel):sel;if(!el)return;opt=opt||{};
    if(cur!==el){release(cur);cur=el;el.classList.add('film-shot');shotZ=1;shotT=performance.now();}
    shotOpt=opt;el.classList.toggle('why',!!opt.why);el.classList.toggle('flat',!!opt.flat);
    const W=opt.width||(VW-2*MX);
    el.style.setProperty('width',W+'px','important');el.style.setProperty('zoom','1');el.style.setProperty('left',MX+'px','important');el.style.setProperty('top',TOP+'px','important');
    fit(true);
    if(opt.label!=null)setLabel(opt.label);
    if(opt.brand!==undefined)setBrand(opt.brand,opt.quiet);
  }
  (function watch(){fit(false);setTimeout(watch,performance.now()-shotT<1500?60:250);})();
  const UCN=['Production optimization','Anomaly detection','Supply chain planning','Fraud and security','Semantic search','Trading'];
  const nav=(k,names,head)=>(head||'<b>03</b>Use cases')+'<span class="nav-uc">'+(names||UCN).map((n,j)=>'<i class="'+(j<k?'done':j===k?'on':'')+'">'+n+'</i>').join('')+'</span>';
  const setWhy=k=>{const w=$('#st-why');if(w)['s1','s2','s3','s4','s5','s6'].forEach((c,j)=>w.classList.toggle(c,j<k));};
  /* the models shot: tabs and panels in one box, so they travel together */
  function mdShot(){let w=$('#md-shot');if(w)return w;const tabs=$('#mdtabs');if(!tabs)return null;w=document.createElement('div');w.id='md-shot';tabs.before(w);
    const parts=[tabs,...$$('.mdpanel')];parts.forEach(p=>w.appendChild(p));return w;}
  const tab=id=>{const f=window.__rti&&__rti.tabSel&&__rti.tabSel[id];if(f){f();return true;}const b=$('[role=tab][aria-controls="'+id+'"]');if(b)b.click();return !!b;};
  const click=sel=>{const e=$(sel);if(e)e.click();return !!e;};
  const cards={models:$('#f-models'),gallery:$('#f-gallery'),end:$('#f-end')};
  const card=(name,on)=>{Object.entries(cards).forEach(([k,e])=>{e.hidden=!(on&&k===name);});};
  const hiCard=k=>{$$('#st-three .v4c.tour-hi').forEach(e=>e.classList.remove('tour-hi'));const e=$('#st-three .v4c[data-k="'+k+'"]');if(e)e.classList.add('tour-hi');};
  const gallery=items=>{$('#f-grid').innerHTML=items.map((it,i)=>'<div class="cell"><b><i>0'+(i+1)+'</i>'+it.name+'</b><img src="'+it.src+'" alt=""></div>').join('');};
  const endStep=k=>{const e=$('#f-end .fs[data-k="'+k+'"]');if(e)e.classList.add('on');};
  const setEnd=c=>{const e=$('#f-end');if(!e||!c)return;if(c.title)e.querySelector('h1').innerHTML=c.title;if(c.steps)e.querySelector('.f-steps').innerHTML=c.steps.map((s,i)=>'<div class="fs" data-k="'+(i+1)+'"><b>0'+(i+1)+'</b><strong>'+s[0]+'</strong><span>'+s[1]+'</span></div>').join('');};
  const tabsNeutral=on=>{const t=$('#mdtabs');if(t)t.classList.toggle('neutral',!!on);};
  window.__film2={frame,setLabel,setBrand,setWhy,mdShot,tab,click,card,hiCard,gallery,endStep,setEnd,cut,nav,tabsNeutral,release:()=>{release(cur);cur=null;}};
})();
