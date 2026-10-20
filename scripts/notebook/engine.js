/* Notebook sketch engine: a pen draws rough.js strokes and handwritten words in time with the narration.
   Deterministic: render(t) puts every stroke, the camera, the pen and the caption in their place at time t. */
window.SK=(()=>{
  const W=1920,H=1080,SCENE_H=1200,PAN=0.9,GAP=0.05,TRAVEL=0.26,STROKE_PPS=1400,TEXT_CPS=20;
  const C={INK:'#23262e',BLUE:'#1f5fd6',GREEN:'#1e8a4c',RED:'#d23b3b',GRAY:'#7a7f88',HL:'rgba(255,208,0,.42)',LBLUE:'rgba(31,95,214,.55)'};
  const TL=window.TIMING,gen=rough.generator();
  const NS='http://www.w3.org/2000/svg';
  const mk=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;};
  let seed=7,SC=-1;const beats=[];
  const api={C,W,H,SCENE_H};
  api.L=n=>{const l=TL.find(x=>x.n===n);if(!l)throw new Error('no line '+n);return l;};
  api.cue=(n,phrase,off)=>{const L=api.L(n);const i=L.text.indexOf(phrase);if(i<0)throw new Error('cue not found: '+n+' '+phrase);return L.start+L.lead+(i/L.text.length)*(L.dur-L.lead)+(off||0);};
  api.lineStart=n=>{const L=api.L(n);return L.start+L.lead;};
  api.scene=()=>++SC;
  api.beat=(t,items,o)=>{beats.push({t,items:items.flat(Infinity).filter(Boolean),scene:SC,layer:(o&&o.layer)||'world'});};
  /* primitives, in scene coordinates */
  const R=(f,a,o)=>({k:'r',f,a,o:o||{}});
  const P=api.P={
    rect:(x,y,w,h,o)=>R('rectangle',[x,y,w,h],o),
    ell:(cx,cy,w,h,o)=>R('ellipse',[cx,cy,w,h],o),
    circ:(cx,cy,d,o)=>R('circle',[cx,cy,d],o),
    line:(x1,y1,x2,y2,o)=>R('line',[x1,y1,x2,y2],o),
    poly:(pts,o)=>R('linearPath',[pts],o),
    gon:(pts,o)=>R('polygon',[pts],o),
    curve:(pts,o)=>R('curve',[pts],o),
    arc:(cx,cy,w,h,a0,a1,o)=>R('arc',[cx,cy,w,h,a0,a1,false],o),
    path:(d,o)=>R('path',[d],o),
    text:(x,y,s,o)=>({k:'t',x,y,s,o:o||{}}),
    hl:(x1,y1,x2,y2,o)=>R('line',[x1,y1,x2,y2],Object.assign({stroke:C.HL,strokeWidth:26,roughness:.5,bowing:.4,disableMultiStroke:true,hl:true},o||{})),
    wait:d=>({k:'w',d}),
    arrow:(x1,y1,x2,y2,o)=>{o=o||{};const a=Math.atan2(y2-y1,x2-x1),h=o.head||18,s=.5;
      const hx1=x2-h*Math.cos(a-s),hy1=y2-h*Math.sin(a-s),hx2=x2-h*Math.cos(a+s),hy2=y2-h*Math.sin(a+s);
      return [R('line',[x1,y1,x2,y2],o),R('path',['M'+hx1+' '+hy1+' L'+x2+' '+y2+' L'+hx2+' '+hy2],Object.assign({},o,{fast:true}))];},
    carrow:(pts,o)=>{o=o||{};const n=pts.length,[x2,y2]=pts[n-1],[x1,y1]=pts[n-2],a=Math.atan2(y2-y1,x2-x1),h=o.head||18,s=.5;
      return [R('curve',[pts],o),R('path',['M'+(x2-h*Math.cos(a-s))+' '+(y2-h*Math.sin(a-s))+' L'+x2+' '+y2+' L'+(x2-h*Math.cos(a+s))+' '+(y2-h*Math.sin(a+s))],Object.assign({},o,{fast:true}))];},
    dash:(pts,o)=>{let d='';for(let i=0;i<pts.length-1;i++){const[x1,y1]=pts[i],[x2,y2]=pts[i+1],L=Math.hypot(x2-x1,y2-y1),n=Math.max(1,Math.floor(L/22));for(let k=0;k<n;k++){const u0=k/n,u1=(k+.55)/n;d+='M'+(x1+(x2-x1)*u0)+' '+(y1+(y2-y1)*u0)+' L'+(x1+(x2-x1)*u1)+' '+(y1+(y2-y1)*u1)+' ';}}return R('path',[d],Object.assign({roughness:.6,disableMultiStroke:true},o||{}));},
    check:(x,y,s,o)=>R('path',['M'+(x-s*.5)+' '+(y)+' L'+(x-s*.12)+' '+(y+s*.4)+' L'+(x+s*.6)+' '+(y-s*.5)],Object.assign({stroke:C.GREEN,strokeWidth:5},o||{})),
    cross:(x,y,s,o)=>{o=Object.assign({stroke:C.RED,strokeWidth:4.5},o||{});return [R('line',[x-s/2,y-s/2,x+s/2,y+s/2],o),R('line',[x+s/2,y-s/2,x-s/2,y+s/2],o)];},
  };
  /* ---------- build ---------- */
  const items=[];let scenesN=0;
  api.build=async()=>{
    for(const w of [400,500,600,700])await document.fonts.load(w+' 40px Caveat');
    await document.fonts.load('400 30px "IBM Plex Sans"');await document.fonts.ready;
    const world=document.getElementById('world'),fixed=document.getElementById('fixed');
    const groups={};
    const grp=(layer,scene)=>{const key=layer+scene;if(groups[key])return groups[key];
      const g=mk('g',layer==='world'?{transform:'translate(0,'+(scene*SCENE_H)+')'}:{},layer==='world'?world:fixed);
      groups[key]={hl:mk('g',{},g),ink:mk('g',{},g)};return groups[key];};
    const defs=document.getElementById('defs');let clipN=0;
    beats.sort((a,b)=>a.t-b.t);
    for(const b of beats){scenesN=Math.max(scenesN,b.scene+1);
      const G=grp(b.layer,b.scene);
      for(const it of b.items){
        it.layer=b.layer;it.scene=b.scene;it.beat=b;
        if(it.k==='w'){it.nominal=it.d;continue;}
        if(it.k==='t'){const o=it.o,size=o.size||44;
          const cid='c'+(clipN++);const cp=mk('clipPath',{id:cid},defs);const cr=mk('rect',{x:0,y:0,width:0,height:0},cp);
          const g=mk('g',{'clip-path':'url(#'+cid+')'},G.ink);
          const te=mk('text',{x:it.x,y:it.y,'font-family':'Caveat','font-size':size,'font-weight':o.weight||600,fill:o.color||C.INK,'text-anchor':o.anchor||'start'},g);
          if(o.rotate)te.setAttribute('transform','rotate('+o.rotate+' '+it.x+' '+it.y+')');
          te.textContent=it.s;const bb=te.getBBox();it.bb={x:bb.x-6,y:bb.y-8,w:bb.width+12,h:bb.height+16};
          cr.setAttribute('x',it.bb.x);cr.setAttribute('y',it.bb.y);cr.setAttribute('height',it.bb.h);
          it.clip=cr;it.root=g;it.size=size;
          it.nominal=Math.min(2.6,Math.max(.3,it.s.length/TEXT_CPS*(size>90?1.2:1)/(o.speed||1)));continue;}
        const o=it.o;seed+=3;
        const opts=Object.assign({seed,roughness:1.1,bowing:1.1,stroke:C.INK,strokeWidth:3.2,preserveVertices:true},o);
        delete opts.hl;delete opts.fast;delete opts.speed;delete opts.hideAt;
        const dr=gen[it.f](...it.a,opts);const ps=gen.toPaths(dr);
        const strokes=ps.filter(p=>!(p.fill&&p.fill!=='none'));
        const sorted=strokes.filter(p=>p.stroke===opts.stroke).concat(strokes.filter(p=>p.stroke!==opts.stroke));
        const g=mk('g',{},o.hl?G.hl:G.ink);it.root=g;it.els=[];let tot=0,wt=0;
        for(const p of sorted){const fillPath=p.stroke!==opts.stroke;
          const e=mk('path',{d:p.d,fill:'none',stroke:p.stroke,'stroke-width':p.strokeWidth,'stroke-linecap':'round','stroke-linejoin':'round'},g);
          const L=Math.max(.5,e.getTotalLength());e.setAttribute('stroke-dasharray',L+' '+(L+2));e.setAttribute('stroke-dashoffset',L);
          it.els.push({e,L,off:tot,last:-1});tot+=L;wt+=fillPath?L/9:L;}
        it.len=tot;it.nominal=Math.min(1.5,Math.max(o.fast?.08:.16,wt/STROKE_PPS/(o.speed||1)));
        if(o.hl)it.nominal*=.8;}
    }
    /* schedule: one pen, beats in order, a pan when the scene changes */
    let q=0.15,cur=-1;api.pans=[];
    for(let j=0;j<beats.length;j++){const b=beats[j];
      let start=Math.max(b.t,q+GAP);
      if(b.scene!==cur){if(cur>=0){const p0=Math.max(b.t-PAN,q+.05);api.pans.push({t0:p0,t1:p0+PAN,from:cur,to:b.scene});start=Math.max(start,p0+PAN+.05);}cur=b.scene;}
      const next=j+1<beats.length?beats[j+1].t:Infinity;
      const total=b.items.reduce((s,it)=>s+it.nominal,0)+GAP*(b.items.length-1);
      /* finish before the next phrase starts: draw faster when the voice gets ahead */
      const avail=next-start-.05;const scale=total>avail?Math.max(.3,avail/total):1;
      let t=start;for(const it of b.items){it.start=t;it.end=t+it.nominal*scale;t=it.end+(it.k==='w'?0:GAP);items.push(it);}
      q=t;}
    items.sort((a,b)=>a.start-b.start);
    api.drawn=items.filter(it=>it.k!=='w');
    const lastL=TL[TL.length-1];api.duration=Math.max(lastL.start+lastL.dur+4.2,q+3);
    /* captions, timed by text length inside each line, like the site demo */
    api.caps=[];for(const L of TL){const vis=s=>s.replace(/<[^>]+>/g,'').length,tot=L.subs.reduce((s,x)=>s+vis(x),0);let acc=0;
      L.subs.forEach((h,k)=>{const t=k===0?L.start+Math.max(0,L.lead-.15):L.start+L.lead+(acc/tot)*(L.dur-L.lead)-.1;api.caps.push({t,h});acc+=vis(h);});
      api.caps.push({t:L.start+L.dur+.35,h:''});}
    api.caps.sort((a,b)=>a.t-b.t);
    return {duration:api.duration,items:api.drawn.length,scenes:scenesN,end:q};
  };
  /* ---------- render ---------- */
  const ease=x=>x<=0?0:x>=1?1:x*x*(3-2*x);
  const camY=t=>{let y=0;for(const p of api.pans){if(t>=p.t1)y=p.to*SCENE_H;else if(t>=p.t0){y=p.from*SCENE_H+(p.to-p.from)*SCENE_H*ease((t-p.t0)/(p.t1-p.t0));break;}else break;}return y;};
  function tip(it,p){
    if(it.k==='t'){const x=it.bb.x+it.bb.w*p,y=it.y-it.size*.22;return [x,y];}
    const d=it.len*p;for(const s of it.els){if(d<=s.off+s.L){const pt=s.e.getPointAtLength(Math.max(0,d-s.off));return [pt.x,pt.y];}}
    const s=it.els[it.els.length-1],pt=s.e.getPointAtLength(s.L);return [pt.x,pt.y];}
  const scr=(it,pt,cy)=>it.layer==='world'?[pt[0],pt[1]+it.scene*SCENE_H-cy]:pt;
  let lastCap=null;
  api.render=t=>{
    const cy=camY(t);
    document.getElementById('world').setAttribute('transform','translate(0,'+(-cy)+')');
    document.getElementById('paper').style.backgroundPosition='0 0,0 '+(-cy)+'px,0 '+(-cy)+'px';
    document.getElementById('spiral').style.backgroundPosition='0 '+(-cy)+'px';
    let active=null,prev=null,next=null;
    for(const it of api.drawn){
      const p=it.start>=t?0:Math.min(1,(t-it.start)/(it.end-it.start));
      if(it.start<=t&&t<it.end)active=it;else if(it.end<=t)prev=it;else if(!next&&it.start>t)next=it;
      if(it.k==='t'){const w=p<=0?0:it.bb.w*p+3;if(it._w!==w){it.clip.setAttribute('width',w);it._w=w;}}
      else{const d=it.len*p;for(const s of it.els){const v=Math.max(0,Math.min(s.L,d-s.off)),off=s.L-v;if(s.last!==off){s.e.setAttribute('stroke-dashoffset',off);s.last=off;}}}
      const h=it.o.hideAt;if(h!=null){const op=t<h?1:Math.max(0,1-(t-h)/.35);if(it._op!==op){it.root.setAttribute('opacity',op);it._op=op;}}
    }
    /* the pen */
    let x,y,lift=0;
    if(active){const p=(t-active.start)/(active.end-active.start);[x,y]=scr(active,tip(active,p),cy);
      if(active.k==='t'){x+=Math.sin(t*31)*2;y+=Math.sin(t*38)*5+Math.cos(t*23)*3;}}
    else{let rest=prev?scr(prev,tip(prev,1),cy):[2050,1250];lift=1;
      if(!next){const u=prev?ease((t-prev.end)/1.1):1;rest=[rest[0]+(2050-rest[0])*u,rest[1]+(1250-rest[1])*u];}
      if(next&&next.start-t<TRAVEL){const tg=scr(next,tip(next,0),cy),u=ease(1-(next.start-t)/TRAVEL);x=rest[0]+(tg[0]-rest[0])*u;y=rest[1]+(tg[1]-rest[1])*u;lift=1-u;}
      else{x=rest[0];y=rest[1];}}
    document.getElementById('pen').setAttribute('transform','translate('+(x+10*lift)+','+(y+14*lift)+')');
    document.getElementById('penShadow').setAttribute('transform','translate('+(16+16*lift)+','+(14+16*lift)+')');
    /* caption */
    let h='';for(const c of api.caps){if(c.t<=t)h=c.h;else break;}
    if(h!==lastCap){document.getElementById('cap').innerHTML=h?'<span>'+h.trim()+'</span>':'';lastCap=h;}
    const f=Math.max(0,1-t/.5,(t-(api.duration-.8))/.8);document.getElementById('fade').style.opacity=Math.min(1,f);
  };
  return api;
})();
