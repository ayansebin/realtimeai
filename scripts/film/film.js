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
    '<div class="f-card f-end" id="f-end" hidden><h1>Bring us <em class="b">a stream and a decision</em>.</h1><p>Contact us to start.</p><div class="f-url"><i></i>realtimeintelligence.io</div></div>';
  document.body.appendChild(ui);
  const label=$('#f-label'),cap=$('#f-cap'),title=$('#f-title'),end=$('#f-end');
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
  const CS={'cs-telco':'Telco <s>·</s> Network Intelligence','cs-cement':'Manufacturing <s>·</s> Cement plant production','cs-fin':'Financial services <s>·</s> Forecasting for trading'};
  let step=-1,subN=0;
  function hideTitle(){if(title.hidden)return;title.hidden=true;cap.style.opacity='';cut('title');}
  function onStep(i){
    if(i===step)return;step=i;subN=0;
    if(i<=2){if(i===0){title.hidden=false;cap.style.opacity='0';cut('start');}frame($('#st-live'),'<b>01</b>Innovation');if(i>0)hideTitle();return;}
    if(i===3){frame($('#st-arch'),'<b>01</b>Confluent + IBM Granite');cut('arch');return;}
    if(i===4){frame($('#st-three'),'<b>02</b>Three things change for your teams');cut('value');return;}
    if(UC[i]){frame($(UC[i][0]),nav(i-5));cut(UC[i][0]);return;}
    if(i===11){log.skipped=(log.skipped||[]).concat([{t:Date.now(),step:i}]);$('#pitch-next').click();return;}  /* the film leaves out the case studies */
    if(i===12){end.hidden=false;cap.style.opacity='0';setLabel('');cut('end');return;}
  }
  const stepEl=$('#pitch-step');
  new MutationObserver(()=>{const m=/^(\d+)\s*\//.exec(stepEl.textContent.trim());if(m)onStep(+m[1]-1);}).observe(stepEl,{childList:true,characterData:true,subtree:true});
  const pc=$('#pitch-cap');
  new MutationObserver(()=>{const h=pc.innerHTML;cap.innerHTML='<span>'+h+'</span>';cap.classList.remove('in');void cap.offsetWidth;cap.classList.add('in');log.caps.push({t:Date.now(),h,step});
    subN++;if(step===0&&subN===2)hideTitle();}).observe(pc,{childList:true,subtree:true,characterData:true});
  new MutationObserver(()=>{if(step!==11||log.skipped)return;const v=$$('.cspanel').find(p=>!p.hidden);if(v&&v!==cur){frame(v,'<b>04</b>In the field <s>·</s> '+(CS[v.id]||''));cut(v.id);}})
    .observe(document.body,{subtree:true,attributes:true,attributeFilter:['hidden']});
  window.__cuts=log.cuts;
})();
