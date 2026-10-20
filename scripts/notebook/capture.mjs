const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
import fs from 'fs';import path from 'path';
const OUT=process.argv[2]||'frames',FPS=30,WORKERS=+(process.argv[3]||2);
fs.mkdirSync(OUT,{recursive:true});
const b=await chromium.launch();
async function worker(w){const ctx=await b.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1});const p=await ctx.newPage();
  p.on('pageerror',e=>console.log('pageerror',e.message));
  await p.goto('file://'+path.join(path.dirname(new URL(import.meta.url).pathname),'sketch.html'));const info=await p.evaluate(()=>window.__ready);
  const N=Math.ceil(info.duration*FPS);const cdp=await ctx.newCDPSession(p);
  for(let k=w;k<N;k+=WORKERS){const f=OUT+'/'+String(k).padStart(5,'0')+'.jpg';if(fs.existsSync(f))continue;
    await p.evaluate(t=>SK.render(t),k/FPS);
    const r=await cdp.send('Page.captureScreenshot',{format:'jpeg',quality:92});fs.writeFileSync(f,Buffer.from(r.data,'base64'));
    if(w===0&&k%300===0)console.log('frame',k,'/',N,new Date().toISOString().slice(11,19));}
  return N;}
const t0=Date.now();const Ns=await Promise.all([...Array(WORKERS).keys()].map(worker));
console.log('done',Ns[0],'frames in',((Date.now()-t0)/1000).toFixed(0),'s');await b.close();
