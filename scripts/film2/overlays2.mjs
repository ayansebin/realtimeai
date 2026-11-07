/* Renders the brand, the labels and every caption of the subtitle track as transparent PNGs in the film's typography.
   usage: node scripts/film2/overlays2.mjs <capture dir> <captions.srt> */
import fs from 'fs';
import path from 'path';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const FONTS = process.env.FONTS_DIR || 'node_modules/@fontsource';
const rd = f => fs.readFileSync(path.join(HERE, f), 'utf8');
const D = process.argv[2], SRT = process.argv[3];
const m = JSON.parse(fs.readFileSync(D + '/meta.json', 'utf8'));
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const caps = fs.readFileSync(SRT, 'utf8').trim().split(/\n\s*\n/).map(b => { const l = b.split('\n'); const [a, z] = l[1].split(' --> ').map(t => { const [h, mi, s] = t.trim().split(':'); return +h * 3600 + +mi * 60 + parseFloat(s.replace(',', '.')); }); return { a, z, h: esc(l.slice(2).join(' ').trim()) }; });
const labels = [...new Set(m.labels.map(l => l.h).filter(Boolean))];
const brands = [...new Map(m.brands.filter(b => b.text !== null).map(b => [b.text + '|' + b.quiet, b])).values()];
fs.mkdirSync(D + '/ovl', { recursive: true });
const b = await chromium.launch({ args: ['--force-device-scale-factor=1.5', '--window-size=1280,720', '--hide-scrollbars'] });
const ctx = await b.newContext({ viewport: null });
await ctx.route(/\/__f\//, r => { const f = r.request().url().split('/').pop(); r.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(FONTS + '/ibm-plex-mono/files/' + f) }); });
const p = await ctx.newPage();
await p.setContent('<!doctype html><html class="film ovl"><head><style>' + rd('fonts2.css').replace(/url\(\/__f\//g, 'url(http://ovl.local/__f/') + '</style><style>' + rd('film2.css') + '</style></head><body><div id="film-ui"><div class="f-top"><span class="f-brand" id="f-brand"></span><span class="f-label" id="f-label"></span></div><div class="f-cap" id="f-cap"></div></div></body></html>');
await p.evaluate(async () => { await document.fonts.ready; for (const w of ['400', '500', '600']) await document.fonts.load(w + ' 23px Inter'); await document.fonts.load('500 14px Poppins'); });
const set = async (brand, label, cap) => { await p.evaluate(([brand, label, cap]) => { const e = document.getElementById('f-brand'); e.style.visibility = brand ? 'visible' : 'hidden'; if (brand) { e.classList.toggle('quiet', !!brand.quiet); e.innerHTML = '<i></i>' + brand.text; } document.getElementById('f-label').innerHTML = label; document.getElementById('f-cap').innerHTML = cap ? '<span>' + cap + '</span>' : ''; }, [brand, label, cap]); await p.waitForTimeout(30); };
const index = { brands: {}, labels: {}, caps: [] };
for (const [i, br] of brands.entries()) { await set(br, '', ''); const f = 'brand_' + i + '.png'; await p.screenshot({ path: D + '/ovl/' + f, omitBackground: true }); index.brands[br.text + '|' + br.quiet] = f; }
for (const [i, h] of labels.entries()) { await set(null, h, ''); const f = 'lab_' + i + '.png'; await p.screenshot({ path: D + '/ovl/' + f, omitBackground: true }); index.labels[h] = f; }
for (const [i, c] of caps.entries()) { await set(null, '', c.h); const f = 'cap_' + i + '.png'; await p.screenshot({ path: D + '/ovl/' + f, omitBackground: true });
  await p.evaluate(() => document.documentElement.classList.add('light')); const fl = 'capl_' + i + '.png'; await p.screenshot({ path: D + '/ovl/' + fl, omitBackground: true }); await p.evaluate(() => document.documentElement.classList.remove('light'));
  index.caps.push({ a: c.a, z: c.z, f, fl }); }
fs.writeFileSync(D + '/ovl/index.json', JSON.stringify(index));
console.log('brands', brands.length, 'labels', labels.length, 'caps', caps.length);
await b.close();
