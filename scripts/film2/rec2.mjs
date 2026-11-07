/* Records a film on the current design, shot for shot at the source film's own times, from a timeline module.
   Plays the page in film mode at 1280x720 with a 1.5 scale factor and keeps 1920x1080 frames from Chrome's screencast.
   usage: node scripts/film2/rec2.mjs <capture dir> <timeline.mjs>      (SITE defaults to http://127.0.0.1:8800/) */
import fs from 'fs';
import path from 'path';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SITE = process.env.SITE || 'http://127.0.0.1:8800/';
const FONTS = process.env.FONTS_DIR || 'node_modules/@fontsource';
const rd = f => fs.readFileSync(path.join(HERE, f), 'utf8');
const OUT = process.argv[2] || 'film2';
const TL = await import(path.resolve(process.argv[3] || path.join(HERE, 'timeline_overview.mjs')));
const { END, T, UCS, PRE, ENDCARD } = TL;
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
const gallery = [];
for (const [id, name] of UCS) {
  await F(`__film2.tab('${id}');__film2.frame('#${id}',{label:''})`); await p.waitForTimeout(1600);
  const buf = await p.locator('#' + id).screenshot({ type: 'jpeg', quality: 86, scale: 'css' });
  gallery.push({ name, src: 'data:image/jpeg;base64,' + buf.toString('base64') });
}
await p.evaluate(items => __film2.gallery(items), gallery);
/* show the gallery once now, so its pictures are decoded before the clock runs */
await F(`__film2.card('gallery',true)`); await p.waitForTimeout(2500); await F(`__film2.card('gallery',false)`); await p.waitForTimeout(400); await F(`__film2.card('gallery',true)`); await p.waitForTimeout(800); await F(`__film2.card('gallery',false)`);
await F(`__film2.tab('uc-prod');__film2.tab('md-ttm')`);
if (ENDCARD) await p.evaluate(c => __film2.setEnd(c), ENDCARD);
/* opening shot in place before the clock starts */
for (const code of PRE) await F(code);
await p.waitForTimeout(1500);

const cdp = await ctx.newCDPSession(p); let n = 0; const meta = [];
cdp.on('Page.screencastFrame', async f => { const name = String(n++).padStart(5, '0') + '.jpg'; fs.writeFileSync(OUT + '/' + name, Buffer.from(f.data, 'base64')); meta.push({ name, t: f.metadata.timestamp }); try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch (e) {} });
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 90, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
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
