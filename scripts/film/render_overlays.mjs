import fs from 'fs';
import path from 'path';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = process.env.SITE || 'http://127.0.0.1:8800/';
const FONTS = process.env.FONTS_DIR || 'node_modules/@fontsource';
const rd = f => fs.readFileSync(path.join(HERE, f), 'utf8');
const D=process.argv[2];const m=JSON.parse(fs.readFileSync(D+'/meta.json','utf8'));
const caps=[...new Set(m.caps.map(c=>c.h))],labels=[...new Set(m.labels.map(l=>l.h).filter(Boolean))];
fs.mkdirSync(D+'/ovl',{recursive:true});
const b=await chromium.launch({args:['--force-device-scale-factor=1.5','--window-size=1280,720','--hide-scrollbars']});
const ctx=await b.newContext({viewport:null});
const fcss=rd('fonts.css').replace(/url\(\/__f\//g,'url('+SITE+'__f/');
await ctx.route(/\/__f\//,r=>{const f=r.request().url().split('/').pop();const d=f.includes('mono')?'ibm-plex-mono':'ibm-plex-sans';r.fulfill({contentType:'font/woff2',body:fs.readFileSync(FONTS+'/'+d+'/files/'+f)});});
const p=await ctx.newPage();
await p.setContent('<!doctype html><html class="film ovl"><head><style>'+fcss+'</style><style>'+rd('film.css')+'</style></head><body><div id="film-ui"><div class="f-top"><span class="f-brand"><i></i>Real-time intelligence</span><span class="f-label" id="f-label"></span></div><div class="f-cap" id="f-cap"></div></div></body></html>');
await p.evaluate(()=>document.fonts.ready);await p.evaluate(async()=>{for(const w of ['300','400','500'])await document.fonts.load(w+' 23px "IBM Plex Sans"');await document.fonts.load('500 11px "IBM Plex Mono"');});
const set=async(brand,label,cap)=>{await p.evaluate(([brand,label,cap])=>{document.querySelector('.f-brand').style.visibility=brand?'visible':'hidden';document.getElementById('f-label').innerHTML=label;document.getElementById('f-cap').innerHTML=cap?'<span>'+cap+'</span>':'';},[brand,label,cap]);await p.waitForTimeout(30);};
await set(true,'','');await p.screenshot({path:D+'/ovl/brand.png',omitBackground:true});
const index={caps:{},labels:{}};
for(const [i,h] of labels.entries()){await set(false,h,'');const f='lab_'+i+'.png';await p.screenshot({path:D+'/ovl/'+f,omitBackground:true});index.labels[h]=f;}
for(const [i,h] of caps.entries()){await set(false,'',h);const f='cap_'+i+'.png';await p.screenshot({path:D+'/ovl/'+f,omitBackground:true});index.caps[h]=f;}
fs.writeFileSync(D+'/ovl/index.json',JSON.stringify(index));
console.log('labels',labels.length,'caps',caps.length);
await b.close();
