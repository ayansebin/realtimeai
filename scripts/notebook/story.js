/* The pitch as a notebook sketch. Same narration and captions as the film, one page per idea. */
(()=>{
const {P,C,cue,lineStart,beat,scene}=SK;
const {INK,BLUE,GREEN,RED,GRAY,HL}=C;
const A=(o,p)=>Object.assign({},o||{},p||{});
const T=(x,y,s,o)=>P.text(x,y,s,o);
/* small helpers */
const rnd=i=>{const v=Math.sin(i*12.9898+78.233)*43758.5453;return v-Math.floor(v);};
const wav=(x0,x1,yc,amp,n,s)=>{const pts=[];for(let i=0;i<=n;i++){const u=i/n;pts.push([x0+(x1-x0)*u,yc+amp*(Math.sin(u*9+s)*.55+Math.sin(u*23+s*1.7)*.3+(rnd(i+s*10)-.5)*.5)]);}return pts;};
const rot=(x,y,w,h,deg)=>{const a=deg*Math.PI/180,cx=x+w/2,cy=y+h/2;return [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([px,py])=>[cx+(px-cx)*Math.cos(a)-(py-cy)*Math.sin(a),cy+(px-cx)*Math.sin(a)+(py-cy)*Math.cos(a)]);};
const fillB=(o)=>A({fill:'rgba(31,95,214,.16)',fillStyle:'hachure',hachureGap:11,hachureAngle:-41},o);
const fillY=(o)=>A({fill:'rgba(255,196,0,.34)',fillStyle:'hachure',hachureGap:15,hachureAngle:-38,fillWeight:2.2},o);
/* icons, centered at x,y with size s */
const I={
  store:(x,y,s,o)=>[P.gon([[x-s*.6,y-s*.16],[x-s*.48,y-s*.46],[x+s*.48,y-s*.46],[x+s*.6,y-s*.16]],A({fill:'rgba(210,59,59,.25)',fillStyle:'hachure',hachureGap:9},o)),P.rect(x-s*.5,y-s*.16,s,s*.6,o),P.rect(x-s*.13,y+s*.14,s*.26,s*.3,o),P.rect(x+s*.2,y-s*.04,s*.2,s*.16,o)],
  sun:(x,y,r)=>{const out=[P.circ(x,y,r*2,{stroke:'#d99a00',fill:'rgba(255,196,0,.4)',fillStyle:'hachure',hachureGap:6})];for(let k=0;k<8;k++){const a=k*Math.PI/4;out.push(P.line(x+Math.cos(a)*r*1.35,y+Math.sin(a)*r*1.35,x+Math.cos(a)*r*1.85,y+Math.sin(a)*r*1.85,{stroke:'#d99a00',fast:true}));}return out;},
  cloud:(x,y,w,h,o)=>{const l=x-w/2,r=x+w/2,t=y-h/2,b=y+h/2;return P.path(`M${l+w*.14} ${b} C${l-w*.06} ${b} ${l-w*.04} ${y} ${l+w*.16} ${y-h*.06} C${l+w*.12} ${t-h*.05} ${l+w*.4} ${t-h*.12} ${l+w*.47} ${t+h*.12} C${l+w*.56} ${t-h*.16} ${l+w*.88} ${t-h*.02} ${l+w*.82} ${y-h*.06} C${r+w*.07} ${y-h*.08} ${r+w*.05} ${b} ${l+w*.86} ${b} Z`,o);},
  truck:(x,y,s,o)=>[P.rect(x-s*.55,y-s*.32,s*.68,s*.44,o),P.gon([[x+s*.13,y-s*.18],[x+s*.36,y-s*.18],[x+s*.52,y+s*.02],[x+s*.52,y+s*.12],[x+s*.13,y+s*.12]],o),P.circ(x-s*.34,y+s*.16,s*.17,o),P.circ(x+s*.32,y+s*.16,s*.17,o)],
  shelf:(x,y,w,h,o)=>[P.rect(x-w/2,y-h/2,w,h,o),P.line(x-w/2,y-h/6,x+w/2,y-h/6,o),P.line(x-w/2,y+h/6,x+w/2,y+h/6,o)],
  choc:(x,y,w,h)=>[P.rect(x-w/2,y-h/2,w,h,{fill:'rgba(120,70,30,.38)',fillStyle:'hachure',hachureGap:8,stroke:'#5b3a1e'}),P.line(x-w/6,y-h/2,x-w/6,y+h/2,{stroke:'#5b3a1e',fast:true}),P.line(x+w/6,y-h/2,x+w/6,y+h/2,{stroke:'#5b3a1e',fast:true}),P.line(x-w/2,y,x+w/2,y,{stroke:'#5b3a1e',fast:true})],
  thermo:(x,y,s)=>[P.rect(x-s*.08,y-s*.5,s*.16,s*.66,{}),P.circ(x,y+s*.28,s*.3,{stroke:RED,fill:'rgba(210,59,59,.5)',fillStyle:'hachure',hachureGap:5}),P.line(x,y-s*.32,x,y+s*.16,{stroke:RED,strokeWidth:6,fast:true})],
  gear:(x,y,r,o)=>{const out=[P.circ(x,y,r*1.6,o),P.circ(x,y,r*.6,o)];for(let k=0;k<8;k++){const a=k*Math.PI/4;out.push(P.line(x+Math.cos(a)*r*.8,y+Math.sin(a)*r*.8,x+Math.cos(a)*r*1.12,y+Math.sin(a)*r*1.12,A(o,{strokeWidth:6,fast:true})));}return out;},
  boxes:(x,y,s,o)=>[P.rect(x-s*.5,y,s*.48,s*.4,o),P.rect(x+s*.02,y,s*.48,s*.4,o),P.rect(x-s*.24,y-s*.4,s*.48,s*.4,o)],
  warn:(x,y,s,o)=>[P.gon([[x,y-s*.5],[x+s*.55,y+s*.42],[x-s*.55,y+s*.42]],A({stroke:RED},o)),P.line(x,y-s*.16,x,y+s*.14,{stroke:RED,strokeWidth:5,fast:true}),P.circ(x,y+s*.27,s*.05,{stroke:RED,fast:true})],
  card:(x,y,s,o)=>[P.rect(x-s*.5,y-s*.31,s,s*.62,o),P.line(x-s*.5,y-s*.13,x+s*.5,y-s*.13,A(o,{strokeWidth:8,fast:true})),P.rect(x-s*.38,y+s*.02,s*.18,s*.13,A(o,{fast:true})),P.line(x-s*.08,y+s*.19,x+s*.36,y+s*.19,A(o,{fast:true}))],
  plane:(x,y,s,o)=>P.path(`M${x+s*.5} ${y} Q${x+s*.46} ${y-s*.05} ${x+s*.36} ${y-s*.05} L${x+s*.06} ${y-s*.05} L${x-s*.14} ${y-s*.42} L${x-s*.25} ${y-s*.42} L${x-s*.12} ${y-s*.05} L${x-s*.36} ${y-s*.05} L${x-s*.45} ${y-s*.2} L${x-s*.52} ${y-s*.2} L${x-s*.47} ${y} L${x-s*.52} ${y+s*.2} L${x-s*.45} ${y+s*.2} L${x-s*.36} ${y+s*.05} L${x-s*.12} ${y+s*.05} L${x-s*.25} ${y+s*.42} L${x-s*.14} ${y+s*.42} L${x+s*.06} ${y+s*.05} L${x+s*.36} ${y+s*.05} Q${x+s*.46} ${y+s*.05} ${x+s*.5} ${y} Z`,o),
  mag:(x,y,r,o)=>[P.circ(x,y,r*2,o),P.line(x+r*.72,y+r*.72,x+r*1.6,y+r*1.6,A(o,{strokeWidth:9}))],
  cpu:(x,y,s,o)=>{const out=[P.rect(x-s*.36,y-s*.36,s*.72,s*.72,o),P.rect(x-s*.17,y-s*.17,s*.34,s*.34,A({fill:'rgba(31,95,214,.3)',fillStyle:'hachure',hachureGap:5},o))];
    for(let k=0;k<4;k++){const u=-s*.24+k*s*.16;out.push(P.line(x+u,y-s*.36,x+u,y-s*.5,A(o,{fast:true})),P.line(x+u,y+s*.36,x+u,y+s*.5,A(o,{fast:true})),P.line(x-s*.36,y+u,x-s*.5,y+u,A(o,{fast:true})),P.line(x+s*.36,y+u,x+s*.5,y+u,A(o,{fast:true})));}return out;},
  factory:(x,y,s,o)=>[P.gon([[x-s*.5,y+s*.35],[x-s*.5,y-s*.02],[x-s*.25,y+s*.14],[x-s*.25,y-s*.02],[x,y+s*.14],[x,y-s*.02],[x+s*.24,y+s*.14],[x+s*.24,y-s*.42],[x+s*.42,y-s*.42],[x+s*.42,y+s*.35]],o)],
  person:(x,y,s,o)=>[P.circ(x,y-s*.24,s*.34,o),P.arc(x,y+s*.42,s*.78,s*.8,Math.PI,2*Math.PI,o)],
  doc:(x,y,s,o)=>[P.gon([[x-s*.32,y-s*.42],[x+s*.12,y-s*.42],[x+s*.32,y-s*.22],[x+s*.32,y+s*.42],[x-s*.32,y+s*.42]],o),P.line(x-s*.18,y-s*.08,x+s*.18,y-s*.08,A(o,{fast:true})),P.line(x-s*.18,y+s*.08,x+s*.18,y+s*.08,A(o,{fast:true})),P.line(x-s*.18,y+s*.24,x+s*.06,y+s*.24,A(o,{fast:true}))],
  image:(x,y,s,o)=>[P.rect(x-s*.42,y-s*.32,s*.84,s*.64,o),P.poly([[x-s*.36,y+s*.26],[x-s*.12,y-s*.02],[x+s*.04,y+s*.14],[x+s*.16,y+s*.02],[x+s*.36,y+s*.26]],A(o,{fast:true})),P.circ(x+s*.2,y-s*.14,s*.14,A(o,{fast:true}))],
  chat:(x,y,s,o)=>[P.path(`M${x-s*.45} ${y-s*.3} L${x+s*.45} ${y-s*.3} L${x+s*.45} ${y+s*.18} L${x-s*.06} ${y+s*.18} L${x-s*.3} ${y+s*.4} L${x-s*.26} ${y+s*.18} L${x-s*.45} ${y+s*.18} Z`,o),P.circ(x-s*.2,y-s*.06,s*.06,A(o,{fast:true})),P.circ(x,y-s*.06,s*.06,A(o,{fast:true})),P.circ(x+s*.2,y-s*.06,s*.06,A(o,{fast:true}))],
  sparkle:(x,y,s,o)=>P.path(`M${x} ${y-s*.5} Q${x+s*.08} ${y-s*.08} ${x+s*.5} ${y} Q${x+s*.08} ${y+s*.08} ${x} ${y+s*.5} Q${x-s*.08} ${y+s*.08} ${x-s*.5} ${y} Q${x-s*.08} ${y-s*.08} ${x} ${y-s*.5} Z`,o),
  robot:(x,y,s,o)=>[P.rect(x-s*.36,y-s*.24,s*.72,s*.54,o),P.circ(x-s*.14,y,s*.13,A(o,{fast:true})),P.circ(x+s*.14,y,s*.13,A(o,{fast:true})),P.line(x-s*.12,y+s*.17,x+s*.12,y+s*.17,A(o,{fast:true})),P.line(x,y-s*.24,x,y-s*.4,A(o,{fast:true})),P.circ(x,y-s*.45,s*.1,A(o,{fast:true}))],
  cal:(x,y,s,o)=>[P.rect(x-s*.4,y-s*.36,s*.8,s*.76,o),P.line(x-s*.4,y-s*.12,x+s*.4,y-s*.12,A(o,{fast:true})),P.line(x-s*.2,y-s*.46,x-s*.2,y-s*.28,A(o,{fast:true})),P.line(x+s*.2,y-s*.46,x+s*.2,y-s*.28,A(o,{fast:true}))],
  moon:(x,y,r,o)=>P.path(`M${x+r*.2} ${y-r} C${x-r*1.25} ${y-r*.9} ${x-r*1.25} ${y+r*.9} ${x+r*.2} ${y+r} C${x-r*.55} ${y+r*.55} ${x-r*.55} ${y-r*.55} ${x+r*.2} ${y-r} Z`,A({stroke:'#5f6b8a',fill:'rgba(95,107,138,.3)',fillStyle:'hachure',hachureGap:5},o)),
  clock:(x,y,r,o)=>[P.circ(x,y,r*2,o),P.line(x,y,x,y-r*.62,A(o,{fast:true})),P.line(x,y,x+r*.46,y+r*.12,A(o,{fast:true}))],
  flag:(x,y,s)=>[P.line(x,y+s*.5,x,y-s*.5,{strokeWidth:4}),P.gon([[x,y-s*.5],[x+s*.6,y-s*.3],[x,y-s*.1]],{stroke:RED,fill:'rgba(210,59,59,.45)',fillStyle:'hachure',hachureGap:5})],
  shield:(x,y,s,o)=>[P.path(`M${x} ${y-s*.5} L${x+s*.42} ${y-s*.32} L${x+s*.36} ${y+s*.12} Q${x+s*.2} ${y+s*.42} ${x} ${y+s*.52} Q${x-s*.2} ${y+s*.42} ${x-s*.36} ${y+s*.12} L${x-s*.42} ${y-s*.32} Z`,o),P.check(x,y,s*.42,{strokeWidth:4})],
  dial:(x,y,r,frac,o)=>{const out=[P.arc(x,y,r*2,r*2,Math.PI,2*Math.PI,o)];for(let k=0;k<=4;k++){const a=Math.PI+k*Math.PI/4;out.push(P.line(x+Math.cos(a)*r*.82,y+Math.sin(a)*r*.82,x+Math.cos(a)*r,y+Math.sin(a)*r,A(o,{fast:true})));}
    const a=Math.PI+frac*Math.PI;out.push(P.line(x,y,x+Math.cos(a)*r*.78,y+Math.sin(a)*r*.78,{stroke:BLUE,strokeWidth:5}),P.circ(x,y,14,{stroke:BLUE,fast:true}));return out;},
  knob:(x,y,r)=>[P.circ(x,y,r*2,{}),P.line(x,y,x+r*.6,y-r*.6,{strokeWidth:5}),...P.carrow([[x-r*1.35,y+r*.3],[x-r*1.1,y-r*.95],[x+r*.1,y-r*1.4],[x+r*1.1,y-r*.95]],{stroke:BLUE,head:16})],
  loop:(x,y,r,o)=>{const pts=[];for(let k=0;k<=9;k++){const a=Math.PI*.95+k*(Math.PI*1.65/9);pts.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}return P.carrow(pts,A({stroke:BLUE,head:18},o));},
};

/* ============ 0. title ============ */
scene();
beat(lineStart(1),[
  T(960,430,'Time series intelligence',{size:128,color:BLUE,anchor:'middle',weight:700}),
  T(960,580,'meets real-time context',{size:100,anchor:'middle'}),
  P.curve([[740,612],[960,624],[1200,614],[1440,626]],{stroke:GREEN,strokeWidth:5}),
  I.sparkle(1530,330,70,{stroke:BLUE,strokeWidth:3.4})]);

/* ============ 1. from words to decisions ============ */
scene();
const xL=560,xR=1360,sp=175;
beat(cue(1,'Foundation models transformed'),[
  T(xL,150,'wave 1',{size:46,color:GRAY,anchor:'middle'}),
  T(xL,214,'unstructured data',{size:64,anchor:'middle',weight:700}),
  I.doc(xL-sp,330,100),I.image(xL,330,110),T(xL+sp,352,'Aa',{size:76,anchor:'middle',weight:700}),
  T(xL-sp,425,'documents',{size:34,anchor:'middle',color:GRAY}),T(xL,425,'images',{size:34,anchor:'middle',color:GRAY}),T(xL+sp,425,'text',{size:34,anchor:'middle',color:GRAY})]);
beat(cue(1,'unlock value'),[
  P.arrow(xL-sp+10,450,xL-55,515,{head:14}),P.arrow(xL,450,xL,508,{head:14}),P.arrow(xL+sp-10,450,xL+55,515,{head:14}),
  I.cloud(xL,585,270,150,{stroke:BLUE,strokeWidth:3.6}),T(xL,605,'LLMs',{size:64,anchor:'middle',color:BLUE,weight:700})]);
beat(cue(1,'with LLMs'),[
  P.arrow(xL-55,665,xL-sp+10,722,{head:14}),P.arrow(xL,668,xL,722,{head:14}),P.arrow(xL+55,665,xL+sp-10,722,{head:14}),
  I.chat(xL-sp,780,104),I.sparkle(xL,780,84,{stroke:BLUE}),I.robot(xL+sp,786,104),
  T(xL-sp,880,'chatbots',{size:36,anchor:'middle'}),T(xL,880,'copilots',{size:36,anchor:'middle'}),T(xL+sp,880,'agents',{size:36,anchor:'middle'})]);
beat(cue(1,'The bigger prize'),[
  P.carrow([[812,600],[960,548],[1108,600]],{stroke:BLUE,strokeWidth:4.2,head:22}),
  T(xR,150,'wave 2',{size:46,color:GRAY,anchor:'middle'}),
  T(xR,214,'time series and streaming data',{size:56,anchor:'middle',weight:700}),
  T(1660,96,'the bigger prize!',{size:46,color:RED,anchor:'middle',rotate:-4}),I.sparkle(1520,82,36,{stroke:RED,strokeWidth:3}),
  P.curve(wav(xR-sp-55,xR-sp+55,330,22,14,1),{stroke:BLUE,strokeWidth:3.4}),P.curve(wav(xR-55,xR+55,330,22,14,4),{stroke:BLUE,strokeWidth:3.4}),P.curve(wav(xR+sp-55,xR+sp+55,330,22,14,7),{stroke:BLUE,strokeWidth:3.4}),
  T(xR-sp,425,'sensors',{size:34,anchor:'middle',color:GRAY}),T(xR,425,'sales',{size:34,anchor:'middle',color:GRAY}),T(xR+sp,425,'telemetry',{size:34,anchor:'middle',color:GRAY})]);
beat(cue(1,'where the mission-critical'),[
  P.hl(xR-270,200,xR+270,200),
  P.arrow(xR-sp+10,450,xR-80,515,{head:14}),P.arrow(xR,450,xR,508,{head:14}),P.arrow(xR+sp-10,450,xR+80,515,{head:14}),
  P.rect(xR-170,515,340,140,fillB({stroke:BLUE,strokeWidth:3.6})),
  T(xR,575,'time series',{size:50,anchor:'middle',color:BLUE,weight:700}),T(xR,628,'foundation models',{size:40,anchor:'middle',color:BLUE})]);
beat(cue(1,'from production'),[
  P.arrow(xR-80,665,xR-sp+10,722,{head:14}),I.gear(xR-sp,786,34,{}),T(xR-sp,880,'production',{size:36,anchor:'middle'}),
  P.arrow(xR,668,xR,722,{head:14}),I.boxes(xR,790,90,{}),T(xR,872,'demand',{size:36,anchor:'middle'}),T(xR,908,'planning',{size:36,anchor:'middle'}),
  P.arrow(xR+80,665,xR+sp-10,722,{head:14}),I.warn(xR+sp,786,90),T(xR+sp,880,'anomalies',{size:36,anchor:'middle'})]);

/* ============ 2. IBM Granite inside Confluent ============ */
scene();
beat(cue(1,'IBM Granite Time Series models now run'),[
  T(250,190,'Confluent',{size:64,color:BLUE,weight:700}),T(250,236,'data in motion',{size:36,color:GRAY}),
  P.curve([[240,462],[600,440],[960,468],[1320,444],[1690,464]],{stroke:BLUE,strokeWidth:3.6}),
  P.curve([[240,642],[600,620],[960,648],[1320,624],[1690,644]],{stroke:BLUE,strokeWidth:3.6}),
  P.arrow(1705,553,1790,553,{stroke:BLUE,strokeWidth:4,head:20}),
  P.circ(320,552,22,{fast:true}),P.circ(420,548,22,{fast:true}),P.circ(1430,546,22,{fast:true}),P.circ(1560,552,22,{fast:true}),
  P.rect(745,470,430,170,fillB({strokeWidth:3.8})),
  T(960,544,'IBM Granite',{size:60,anchor:'middle',color:BLUE,weight:700}),T(960,604,'Time Series models',{size:46,anchor:'middle'})]);
beat(cue(1,'pretrained to scale'),[
  I.factory(330,320,84),I.store(450,330,82),I.boxes(565,320,64,{}),I.person(670,320,74,{}),
  T(250,410,'pretrained, scales to every series',{size:36}),P.arrow(700,395,770,462,{head:14})]);
beat(cue(1,'efficient on standard CPUs'),[
  I.cpu(1430,300,110,{}),T(1520,296,'standard CPUs',{size:44}),T(1520,342,'no GPUs needed',{size:34,color:GRAY}),P.arrow(1400,375,1170,468,{head:14})]);
beat(cue(1,'and learning as each event lands'),[
  I.loop(820,800,62),T(920,815,'learns as each event lands',{size:46,color:BLUE}),P.arrow(880,742,940,648,{head:14})]);

/* ============ 3. one store on a hot day ============ */
scene();
beat(lineStart(2),[I.store(470,340,260),I.sun(700,180,40),I.thermo(780,340,170),T(470,530,'one store, a hot day',{size:44,anchor:'middle'})]);
beat(cue(2,'The forecast reads the heat wave'),[
  P.line(900,640,1730,640,{}),P.line(900,640,900,220,{}),T(915,212,'demand',{size:34,color:GRAY}),
  P.curve(wav(912,1300,520,34,16,3),{strokeWidth:3.4}),
  P.dash([[1300,500],[1400,450],[1500,398],[1600,348],[1710,300]],{stroke:BLUE,strokeWidth:4.2}),T(1580,280,'forecast',{size:38,color:BLUE})]);
beat(cue(2,'and sees the stockout coming'),[
  P.dash([[1150,372],[1730,372]],{stroke:RED,strokeWidth:3}),T(1160,358,'stock on hand',{size:32,color:RED}),
  P.ell(1550,372,96,74,{stroke:RED,strokeWidth:4}),T(1550,470,'stockout ahead',{size:42,color:RED,anchor:'middle'})]);
beat(cue(2,'so the empty shelf'),[I.shelf(470,760,320,210,{}),I.flag(668,690,120),T(470,925,'flagged in seconds',{size:42,color:RED,anchor:'middle'})]);
beat(lineStart(3),[I.truck(1050,800,210,{}),P.arrow(930,800,670,790,{stroke:GREEN,strokeWidth:3.8,head:20}),
  P.rect(345,672,70,52,{fast:true}),P.rect(430,672,70,52,{fast:true}),P.rect(515,672,70,52,{fast:true}),P.rect(345,742,70,52,{fast:true}),P.rect(430,742,70,52,{fast:true}),P.rect(515,742,70,52,{fast:true}),
  T(1200,812,'next order, optimized',{size:44})]);
beat(cue(3,'while the decision still matters'),[I.clock(1660,780,44,{}),T(1290,880,'decided in time',{size:44,color:GREEN}),P.check(1620,872,40)]);

/* ============ 4. where the data already flows ============ */
scene();
beat(lineStart(4),[P.hl(790,124,1430,124),T(960,140,'intelligence where the data already flows',{size:60,anchor:'middle',weight:700})]);
beat(cue(4,'When store sales stall'),[I.store(300,370,130),T(300,470,'sales stall',{size:36,anchor:'middle',color:GRAY})]);
beat(cue(4,'the event lands'),[P.line(400,335,800,335,{stroke:BLUE,strokeWidth:3.4}),P.line(400,415,800,415,{stroke:BLUE,strokeWidth:3.4}),
  P.circ(470,375,20,{fast:true}),P.circ(560,375,20,{fast:true}),T(560,312,'Confluent topic',{size:38,color:BLUE,anchor:'middle'}),I.shield(760,288,54,{stroke:BLUE})]);
beat(cue(4,'joins the live weather stream'),[I.cloud(905,232,130,74,{}),I.sun(950,206,16),P.arrow(905,280,905,350,{head:14}),T(990,250,'weather',{size:34,color:GRAY})]);
beat(cue(4,'and Granite forecasts it inside Flink'),[P.arrow(805,375,995,375,{head:16}),P.rect(1000,325,310,100,fillB({strokeWidth:3.6})),T(1155,388,'Flink + Granite',{size:44,anchor:'middle',color:BLUE,weight:700})]);
beat(cue(4,'The shelf check goes out'),[P.arrow(1315,375,1455,375,{stroke:GREEN,strokeWidth:3.8,head:18}),P.circ(1515,375,92,{stroke:GREEN,strokeWidth:3.8}),P.check(1515,378,50),
  T(1515,476,'shelf check in under a second',{size:40,color:GREEN,anchor:'middle'})]);
beat(cue(4,'while the usual way copies'),[T(250,640,'the usual way',{size:42,color:GRAY}),
  P.rect(250,670,200,84,{}),T(350,724,'copy',{size:38,anchor:'middle'}),P.arrow(455,712,555,712,{head:14}),
  P.rect(560,670,200,84,{}),T(660,724,'train',{size:38,anchor:'middle'}),P.arrow(765,712,865,712,{head:14}),
  P.rect(870,670,230,84,{}),T(985,724,'nightly batch',{size:38,anchor:'middle'}),I.moon(1085,640,22)]);
beat(cue(4,'and is still a day behind'),[P.arrow(1105,712,1290,712,{stroke:RED,strokeWidth:3.6,head:18}),I.cal(1370,712,116,{stroke:RED}),T(1370,742,'+1',{size:44,anchor:'middle',color:RED,weight:700}),
  T(1450,726,'a day behind',{size:46,color:RED})]);

/* ============ 5. for your teams ============ */
scene();
beat(lineStart(5),[T(960,150,'what changes for your teams',{size:60,anchor:'middle',weight:700}),
  P.gon(rot(270,290,400,300,-2),fillY({})),T(470,452,'10×',{size:120,anchor:'middle',color:BLUE,weight:700}),
  T(470,522,'faster time to value',{size:46,anchor:'middle'})]);
beat(cue(5,'with one universal model'),[T(470,640,'1 universal model',{size:34,anchor:'middle',color:GRAY}),T(470,684,'lower skills barrier',{size:34,anchor:'middle',color:GRAY})]);
beat(cue(5,'Transfer and continuous learning'),[P.gon(rot(760,290,400,300,1.5),fillY({})),T(960,362,'transfer + continuous learning',{size:30,anchor:'middle',color:GRAY}),
  T(960,470,'$M',{size:120,anchor:'middle',color:BLUE,weight:700}),T(960,536,'savings',{size:50,anchor:'middle'}),T(960,640,'optimized decisions',{size:34,anchor:'middle',color:GRAY})]);
beat(cue(5,'and decision time drops'),[P.gon(rot(1250,290,400,300,-1.5),fillY({})),T(1450,412,'days',{size:58,anchor:'middle',color:GRAY}),P.line(1392,396,1508,390,{stroke:RED,strokeWidth:4.5}),
  T(1450,512,'seconds',{size:84,anchor:'middle',color:BLUE,weight:700}),T(1450,640,'decision time',{size:34,anchor:'middle',color:GRAY})]);

/* ============ 6 to 11. use cases, with a hand-drawn navigation strip ============ */
const NAV=['production','anomalies','retail','payments','search','trading'],NX=[540,760,945,1125,1310,1495],NY=118,NW=[150,140,86,132,96,108];
const navEnd=lineStart(13)-.6;
const navCircle=(k,hideAt)=>P.ell(NX[k],NY-12,NW[k]+46,66,{stroke:BLUE,strokeWidth:3.6,hideAt});
const ucStarts=[6,7,8,9,10,11].map(n=>lineStart(n));
const ucScene=(k,first)=>{scene();
  const nav=[];
  if(first){nav.push(T(250,NY,'use cases',{size:44,color:GRAY,weight:700,hideAt:navEnd}),P.line(240,NY+22,1580,NY+18,{stroke:GRAY,strokeWidth:2,roughness:1.4,hideAt:navEnd,fast:true}));
    NAV.forEach((s,j)=>nav.push(T(NX[j],NY,s,{size:40,anchor:'middle',hideAt:navEnd})));}
  else nav.push(P.check(NX[k-1]+NW[k-1]/2+16,NY-30,30,{hideAt:navEnd}));
  nav.push(navCircle(k,k<5?ucStarts[k+1]-.2:navEnd));
  beat(ucStarts[k]-(first?0:.05),nav,{layer:'fixed'});};

ucScene(0,true);
beat(lineStart(6)+.2,[T(960,270,'mission-critical decisions, as each event lands',{size:52,anchor:'middle',weight:700})]);
beat(cue(6,'On a chocolate line'),[I.choc(450,520,300,180),T(450,672,'chocolate line',{size:40,anchor:'middle',color:GRAY})]);
beat(cue(6,'temper is forecast on every reading'),[P.line(860,660,1720,660,{}),P.line(860,660,860,360,{}),
  P.dash([[860,450],[1720,450]],{stroke:GREEN,strokeWidth:3}),T(1720,435,'in temper',{size:34,color:GREEN,anchor:'end'}),
  P.curve(wav(872,1360,410,18,16,2),{strokeWidth:3.4}),P.dash([[1360,415],[1450,450],[1540,500],[1640,540],[1712,560]],{stroke:RED,strokeWidth:4.2}),T(1650,600,'off spec soon',{size:36,color:RED,anchor:'middle'})]);
beat(cue(6,'so setpoints adjust'),[I.knob(980,815,46),T(1060,830,'setpoints adjust',{size:46})]);
beat(cue(6,'turns into rework'),[T(1430,830,'rework',{size:48,color:RED}),P.line(1420,812,1560,808,{stroke:RED,strokeWidth:4.5}),P.check(1600,812,40)]);

ucScene(1);
const sm=[];for(let r=0;r<4;r++)for(let c=0;c<3;c++)sm.push(P.curve(wav(250+c*150,370+c*150,330+r*80,12,10,r*3+c),{strokeWidth:2.6,fast:true,speed:2.2}));
beat(lineStart(7),[...sm,T(250,670,'thousands of signals',{size:40,color:GRAY})]);
const band=wav(820,1560,520,40,22,5);
beat(cue(7,'each series gets its own expected band'),[P.dash(band.map(([x,y])=>[x,y-62]),{stroke:BLUE,strokeWidth:3}),P.dash(band.map(([x,y])=>[x,y+62]),{stroke:BLUE,strokeWidth:3}),
  P.curve(band,{strokeWidth:3.4}),T(830,400,'its own expected band',{size:42,color:BLUE})]);
beat(cue(7,'so weekend peaks pass'),[P.check(1010,400,34),P.check(1330,400,34),T(1090,330,'weekend peaks pass',{size:36,color:GREEN})]);
beat(cue(7,'and only the real breaks'),[P.poly([[1560,520],[1610,700],[1665,560]],{stroke:RED,strokeWidth:4.2}),P.ell(1610,700,110,80,{stroke:RED,strokeWidth:4}),T(1610,800,'a real break',{size:44,color:RED,anchor:'middle'})]);

ucScene(2);
const grid=[];for(let r=0;r<4;r++)for(let c=0;c<6;c++)grid.push(P.rect(250+c*72,310+r*72,52,52,{fast:true,speed:2,roughness:1.3}));
beat(lineStart(8),[T(250,270,'every SKU in every store',{size:42,color:GRAY}),...grid,T(460,650,'one model',{size:46,color:BLUE,anchor:'middle',weight:700})]);
beat(cue(8,'and reorders at the service level'),[I.dial(1180,560,120,.92,{}),T(1180,640,'95% service level',{size:42,anchor:'middle'}),
  P.arrow(1330,520,1470,520,{stroke:GREEN,head:16}),I.boxes(1570,520,110,{}),T(1570,640,'reorder',{size:44,color:GREEN,anchor:'middle'})]);

ucScene(3);
const pb=wav(800,1560,440,30,22,9);
beat(lineStart(9),[I.card(450,430,250,{}),T(450,580,'each card',{size:40,anchor:'middle',color:GRAY}),
  P.dash(pb.map(([x,y])=>[x,y-58]),{stroke:BLUE,strokeWidth:3}),P.dash(pb.map(([x,y])=>[x,y+58]),{stroke:BLUE,strokeWidth:3}),P.curve(pb,{strokeWidth:3.4}),T(810,340,'its own normal',{size:42,color:BLUE})]);
beat(cue(9,'before authorization'),[I.clock(840,640,30,{}),T(890,654,'scored before authorization',{size:40})]);
beat(cue(9,'so card testing is held'),[P.poly([[1560,440],[1590,560],[1610,470],[1630,575],[1650,480]],{stroke:RED,strokeWidth:3.8}),
  P.gon(rot(1520,250,210,90,-7),{stroke:RED,strokeWidth:4.2}),T(1625,312,'HOLD',{size:60,color:RED,anchor:'middle',weight:700,rotate:-7})]);
beat(cue(9,'and travelers get through'),[I.plane(470,800,190,{}),P.check(630,800,44),T(690,812,'travelers get through',{size:44,color:GREEN})]);

ucScene(4);
const hist=[];{let x=250;const pts=[];for(let i=0;i<=60;i++){x=250+i*24;let y=650+Math.sin(i*.7)*14+(rnd(i)-.5)*16;if([9,26,46].some(c=>i===c))y-=110;if([10,27,47].some(c=>i===c))y-=40;pts.push([x,y]);}hist.push(P.poly(pts,{strokeWidth:3.2}));}
beat(lineStart(10),[T(250,520,'years of history',{size:42,color:GRAY}),...hist]);
beat(cue(10,'so one sketch'),[I.mag(640,320,72,{stroke:BLUE}),P.poly([[592,334],[622,334],[636,272],[652,330],[690,334]],{stroke:BLUE,strokeWidth:3.6}),T(760,300,'one sketch',{size:46,color:BLUE}),
  P.ell(478,590,130,150,{stroke:BLUE,strokeWidth:3.6}),P.ell(886,590,130,150,{stroke:BLUE,strokeWidth:3.6}),P.ell(1366,590,130,150,{stroke:BLUE,strokeWidth:3.6}),T(1450,820,'every match found',{size:44,color:BLUE})]);

ucScene(5);
const bars=[];const hs=[150,190,170,230,210,260,240,300,280];hs.forEach((h,i)=>bars.push(P.rect(260+i*62,660-h,40,h,{fast:true})));
const fut=[];[300,330,310,350,330].forEach((h,i)=>fut.push(P.rect(820+i*62,660-h,40,h,{stroke:BLUE,strokeWidth:2.6,fast:true})));
beat(lineStart(11),[T(250,300,'volume',{size:40,color:GRAY}),...bars,...fut,
  P.gon([[805,300],[1135,250],[1135,410],[805,392]],fillB({stroke:BLUE,strokeWidth:2.4})),T(950,230,'probability band',{size:42,color:BLUE,anchor:'middle'})]);
beat(cue(11,'paces large orders'),[P.rect(820,700,40,34,{fast:true}),P.rect(882,700,40,40,{fast:true}),P.rect(944,700,40,36,{fast:true}),P.rect(1006,700,40,44,{fast:true}),P.rect(1068,700,40,38,{fast:true}),
  P.arrow(1130,722,1240,722,{stroke:GREEN,head:16}),T(1260,736,'a large order, paced to the market',{size:44,color:GREEN})]);

/* ============ 12. next steps ============ */
scene();
const row=(y,s)=>[P.rect(290,y-38,52,52,{}),T(380,y,s,{size:54})];
beat(lineStart(13),[T(960,150,'next steps',{size:64,anchor:'middle',weight:700}),...row(300,'Try the models in the playground'),P.check(316,280,46)]);
beat(cue(13,'Sign up for early access'),[...row(420,'Sign up for early access on Confluent Cloud'),P.check(316,400,46)]);
beat(cue(13,'Then bring us a stream'),[...row(540,'Bring us a stream and a decision'),P.check(316,520,46)]);
beat(cue(13,'and we will co-innovate'),[P.circ(1500,420,230,{stroke:GRAY,strokeWidth:3.4}),P.circ(1640,420,230,{stroke:BLUE,strokeWidth:3.6}),
  T(1440,432,'you',{size:42,anchor:'middle',color:GRAY}),T(1700,432,'us',{size:42,anchor:'middle',color:BLUE}),T(1570,600,'co-innovate',{size:54,anchor:'middle',color:BLUE,weight:700})]);
beat(cue(13,'to bring real-time intelligence'),[T(960,790,'realtimeintelligence.io',{size:88,anchor:'middle',weight:700}),
  P.curve([[560,820],[860,834],[1120,824],[1370,836]],{stroke:BLUE,strokeWidth:5}),T(960,890,'real-time intelligence for your enterprise',{size:42,anchor:'middle',color:GRAY})]);
})();
