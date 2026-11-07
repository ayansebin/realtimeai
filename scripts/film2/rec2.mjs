/* Records the overview film on the current design, shot for shot at the source film's own times.
   Plays the page in film mode at 1280x720 with a 1.5 scale factor and keeps 1920x1080 frames from Chrome's screencast.
   usage: node scripts/film2/rec2.mjs <capture dir>      (SITE defaults to http://127.0.0.1:8800/) */
import fs from 'fs';
import path from 'path';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = process.env.SITE || 'http://127.0.0.1:8800/';
const FONTS = process.env.FONTS_DIR || 'node_modules/@fontsource';
const rd = f => fs.readFileSync(path.join(HERE, f), 'utf8');
const OUT = process.argv[2] || 'film2';
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ args: ['--force-device-scale-factor=1.5', '--window-size=1280,720', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await b.newContext({ viewport: null });
/* Poppins and Inter are installed on this machine; IBM Plex Mono comes from fontsource */
await ctx.route(/fonts\.googleapis\.com/, r => r.fulfill({ contentType: 'text/css', body: rd('fonts2.css') }));
await ctx.route(/fonts\.gstatic\.com/, r => r.abort());
await ctx.route(/\/__f\//, r => { const f = r.request().url().split('/').pop(); r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(FONTS + '/ibm-plex-mono/files/' + f) }); });
await ctx.addInitScript(() => { window.__filmCapture = true; try { localStorage.setItem('rti-demo-seen', String(Date.now())); } catch (e) {} });
const p = await ctx.newPage(); p.on('pageerror', e => console.log('pageerror', e.message));
await p.goto(SITE, { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1500);
await p.addStyleTag({ content: rd('film2.css') }); await p.addScriptTag({ content: rd('film2.js') }); await p.waitForTimeout(400);
const F = (code) => p.evaluate(code);

/* pre-roll: the use case gallery needs a picture of every panel on the new design */
const UCS = [['uc-prod', 'Production optimization'], ['uc-anom', 'Anomaly detection'], ['uc-demand', 'Supply chain planning'], ['uc-fraud', 'Fraud and security'], ['uc-search', 'Semantic search'], ['uc-trade', 'Trading']];
const gallery = [];
for (const [id, name] of UCS) {
  await F(`__film2.tab('${id}');__film2.frame('#${id}',{label:''})`); await p.waitForTimeout(1600);
  const buf = await p.locator('#' + id).screenshot({ type: 'jpeg', quality: 88 });
  gallery.push({ name, src: 'data:image/jpeg;base64,' + buf.toString('base64') });
}
await p.evaluate(items => __film2.gallery(items), gallery);
await F(`__film2.mdShot();__film2.tab('uc-prod');__film2.tab('md-ttm')`);
/* opening shot in place before the clock starts */
await F(`__film2.frame('#st-why',{label:'<b>01</b>From words to decisions',why:true,brand:'Real-time intelligence'});__film2.setWhy(6)`);
await p.waitForTimeout(1500);

const nav = k => `__film2.nav(${k})`;
const T = [
  [0.00, `__film2.cut('start')`],
  [16.30, `__film2.frame('#st-live',{label:'<b>01</b>Innovation'});__rti.hero.reset();__film2.cut('hero')`],
  [20.43, `__rti.hero.ctx()`],
  [25.90, `__rti.hero.anomaly()`],
  [28.40, `__rti.hero.optimize()`],
  [30.51, `__rti.hero.flash('dom')`],
  [33.40, `__rti.hero.flash('dist')`],
  [36.00, `__film2.card('models',true);__film2.tabsNeutral(true);__film2.frame('#mdtabs',{top:236,width:1200,flat:true,brand:'Real-time intelligence',quiet:true,label:''});__film2.cut('models')`],
  [49.73, `__film2.card('models',false);__film2.tabsNeutral(false);__film2.tab('md-ttm');__film2.frame(__film2.mdShot(),{brand:'A holistic model family.',quiet:false,label:'<b>MODELS</b>'});__film2.cut('md-ttm')`],
  [56.40, `__film2.tab('md-flowstate');__film2.cut('md-flowstate')`],
  [63.13, `__film2.tab('md-patchtstfm');__film2.cut('md-patchtstfm')`],
  [70.37, `__film2.tab('md-tspulse');__film2.cut('md-tspulse')`],
  [77.77, `__film2.frame('#st-arch',{brand:'Real-time intelligence',quiet:false,label:'<b>01</b>Confluent + IBM Granite'});__rti.arch.focus(0,true,2.0);__film2.cut('arch')`],
  [100.87, `__film2.frame('#st-three',{label:'<b>02</b>Productivity, accuracy and responsiveness'});__film2.click('#th-replay');__film2.hiCard('prod');__film2.cut('three')`],
  [105.42, `__film2.hiCard('acc')`],
  [110.80, `__film2.hiCard('resp')`],
  [116.97, `__film2.tab('uc-prod');__film2.frame('#uc-prod',{label:${nav(0)}});__film2.cut('uc-prod')`],
  [122.63, `__film2.click('#pr-inject .chip[data-v="butter"]')`],
  [129.67, `__film2.tab('uc-anom');__film2.click('#an-conf .chip[data-v="99.9"]');__film2.frame('#uc-anom',{label:${nav(1)}});__film2.cut('uc-anom')`],
  [137.64, `window.__n0=+((document.querySelector('#an-flagged')||{}).textContent||0);__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [139.30, `if(+((document.querySelector('#an-flagged')||{}).textContent||0)<=window.__n0)__film2.click('#an-inject .chip[data-v="stockout"]')`],
  [139.97, `__film2.tab('uc-demand');__film2.frame('#uc-demand',{label:${nav(2)}});__film2.cut('uc-demand')`],
  [149.47, `__film2.click('#dm-sl .chip[data-v="95"]')`],
  [151.77, `__film2.tab('uc-fraud');__film2.click('#fr-conf .chip[data-v="99.5"]');__film2.frame('#uc-fraud',{label:${nav(3)}});__film2.cut('uc-fraud')`],
  [157.59, `__film2.click('#fr-inject .chip[data-v="testing"]')`],
  [163.47, `__film2.tab('uc-search');__film2.frame('#uc-search',{label:${nav(4)}});__film2.click('#se-q .chip[data-v="spike"]');__film2.cut('uc-search')`],
  [170.60, `__film2.tab('uc-trade');__film2.frame('#uc-trade',{label:${nav(5)}});__film2.cut('uc-trade')`],
  [177.20, `__film2.click('#tr-inject .chip[data-v="news"]')`],
  [181.80, `__film2.release();__film2.card('gallery',true);__film2.setBrand('Real-time intelligence',true);__film2.setLabel('');__film2.cut('gallery')`],
  [188.10, `__film2.card('end',true);__film2.setBrand(null);__film2.cut('end')`],
  [188.27, `__film2.endStep(1)`],
  [190.17, `__film2.endStep(2)`],
];
const END = 195.4;

const cdp = await ctx.newCDPSession(p); let n = 0; const meta = [];
cdp.on('Page.screencastFrame', async f => { const name = String(n++).padStart(5, '0') + '.jpg'; fs.writeFileSync(OUT + '/' + name, Buffer.from(f.data, 'base64')); meta.push({ name, t: f.metadata.timestamp }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 94, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
await p.waitForTimeout(600);
const t0 = Date.now(); let k = 0; const done = [];
while (Date.now() - t0 < END * 1000) {
  const el = (Date.now() - t0) / 1000;
  while (k < T.length && T[k][0] <= el) { const [at, code] = T[k++]; try { await F(code); } catch (e) { console.log('step failed', at, e.message); } done.push([at, +((Date.now() - t0) / 1000).toFixed(3)]); }
  await p.waitForTimeout(15);
}
await cdp.send('Page.stopScreencast');
const film = await p.evaluate(() => window.__film);
fs.writeFileSync(OUT + '/meta.json', JSON.stringify({ t0, end: END, frames: meta, cuts: film.cuts, labels: film.labels, brands: film.brands, done }));
const secs = (Date.now() - t0) / 1000; console.log('frames', n, 'secs', secs.toFixed(1), 'fps', (n / secs).toFixed(1), 'cuts', film.cuts.map(c => c.why).join(' '));
const late = done.filter(([a, b]) => b - a > 0.25); if (late.length) console.log('late steps', JSON.stringify(late));
await b.close();
