// The narrator for the demo builder: ElevenLabs voices through Vercel AI Gateway, on the same credits and sign in as Claude.
//   GET /api/voice?d=DEMO&n=VERSION&p=PHASE&v=VOICE[&h=HASH]  the narration of one step as audio/mpeg. DEMO is a saved
//        demo's share id or an example id. Only lines from saved demos and examples are voiced, so this is no open
//        text to speech service. Each line is generated once per voice and model, kept in Vercel Blob, and served from
//        the cache after that; n and h only change the address when the text changes, so browsers and the CDN can keep it.
//   GET /api/voice?selftest=1&code=CODE[&voices=a,b&model=M&b64=1]  one sample line per voice, as JSON (b64=1 adds the audio)
//   GET /api/voice?selftest=1&code=CODE&lines=["..."]&voices=eric&speed=0.8  up to 12 lines in one voice, with the audio
//        as base64, for the site's own films (scripts/film/genfilm.py with FILM_ENGINE=eleven)
// Environment: DEMO_VOICE_MODEL (default elevenlabs/eleven-v4), DEMO_VOICE_DAILY_CHARS (characters generated a day,
//   default 400000). Auth as in api/build.js: AI_GATEWAY_API_KEY or the deployment's OIDC token.
const crypto = require('crypto');
const { put, get } = require('@vercel/blob');
const EXAMPLES = require('../data/builder/examples.json');

/* Eleven v4 by default: ElevenLabs' newest model; through the gateway a 170 character line took about 3 s (v3 5 s,
   v4 Turbo 2 s, Multilingual v2 1.3 s) */
const MODEL = process.env.DEMO_VOICE_MODEL || 'elevenlabs/eleven-v4';
const GATEWAY = (process.env.VOICE_BASE_URL || 'https://ai-gateway.vercel.sh').replace(/\/+$/, '');   // VOICE_BASE_URL is for tests
const CAP = Math.max(1000, parseInt(process.env.DEMO_VOICE_DAILY_CHARS || '400000', 10) || 400000);
/* ElevenLabs default voices, chosen for narration; the key is what the demo and the player use */
const VOICES = {
  bella: 'hpp4J3VqNfWAUOO0d1Us', sarah: 'EXAVITQu4vr4xnSDxMaL', matilda: 'XrExE9yKIg1WjnnlVkGX', alice: 'Xb7hH8MSUJpSbSDYk0k2',
  brian: 'nPczCjzI2devNBz1zQrb', eric: 'cjVigY5qzO86Huf0OWal', george: 'JBFqnCBsd6RMkjVDRZzb'
};
const PHASES = ['intro', 'signal', 'forecast', 'context', 'anomaly', 'decision', 'stream', 'outcome', 'close'];

const day = () => new Date().toISOString().slice(0, 10);
/* the same short hash the player puts in the address, so an old address never gets a newer line */
const fnv = (t) => { let h = 2166136261; for (let j = 0; j < t.length; j++) { h ^= t.charCodeAt(j); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;
function who(req) {
  const t = process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN;
  return t ? { authorization: 'Bearer ' + t } : null;
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
function json(res, code, body) { res.statusCode = code; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); res.end(JSON.stringify(body)); }
async function readBlob(pathname, asJSON) {
  try { const r = await get(pathname, { access: 'private', useCache: false }); if (!r || !r.stream) return null; const b = Buffer.from(await new Response(r.stream).arrayBuffer()); return asJSON ? JSON.parse(b.toString('utf8')) : b; } catch (e) { return null; }
}

/* one line of speech through the gateway's speech endpoint */
async function speak(text, voice, auth, model, speed) {
  const t0 = Date.now();
  const r = await fetch(GATEWAY + '/v4/ai/speech-model', {
    method: 'POST',
    headers: Object.assign({ 'ai-gateway-protocol-version': '0.0.1', 'ai-speech-model-specification-version': '4', 'ai-model-id': model || MODEL, 'content-type': 'application/json' }, auth),
    body: JSON.stringify(Object.assign({ text, voice, outputFormat: 'mp3' }, speed && speed !== 1 ? { speed } : {}))
  });
  const raw = await r.text();
  if (!r.ok) { const e = new Error('speech ' + r.status + ': ' + raw.slice(0, 300)); e.status = r.status; e.text = raw; throw e; }
  let j; try { j = JSON.parse(raw); } catch (e) { throw Object.assign(new Error('speech: not JSON'), { status: 502, text: raw.slice(0, 300) }); }
  const audio = Buffer.from(String(j.audio || ''), 'base64');
  if (audio.length < 200) throw Object.assign(new Error('speech: no audio'), { status: 502, text: raw.slice(0, 300) });
  return { audio, ms: Date.now() - t0, warnings: j.warnings || [] };
}

/* characters generated today, kept in the store; cached lines cost nothing */
async function takeChars(n) {
  if (!blobOn()) return true;
  const p = 'builder/usage/voice-' + day() + '.json', u = (await readBlob(p, true)) || { chars: 0 };
  if (u.chars + n > CAP) return false;
  u.chars += n; u.updated = new Date().toISOString();
  try { await put(p, JSON.stringify(u), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }); } catch (e) {}
  return true;
}
const recent = new Map();
function tooFast(ip) {
  const now = Date.now(), t = (recent.get(ip) || []).filter((x) => now - x < 10 * 60 * 1000);
  if (t.length >= 150) { recent.set(ip, t); return true; }
  t.push(now); recent.set(ip, t); if (recent.size > 2000) recent.clear(); return false;
}
function audioOut(req, res, buf) {
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Robots-Tag', 'noindex');
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers && req.headers.range || ''));
  if (m && (m[1] || m[2])) {
    let a = m[1] ? parseInt(m[1], 10) : buf.length - parseInt(m[2], 10), b = m[1] && m[2] ? parseInt(m[2], 10) : buf.length - 1;
    a = Math.max(0, a); b = Math.min(buf.length - 1, b);
    if (a > b) { res.statusCode = 416; res.setHeader('Content-Range', 'bytes */' + buf.length); return res.end(); }
    res.statusCode = 206; res.setHeader('Content-Range', 'bytes ' + a + '-' + b + '/' + buf.length); res.setHeader('Content-Length', String(b - a + 1));
    return res.end(buf.subarray(a, b + 1));
  }
  res.statusCode = 200; res.setHeader('Content-Length', String(buf.length)); return res.end(buf);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.setHeader('Allow', 'GET'); return json(res, 405, { ok: false }); }
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://local').searchParams);
  const auth = who(req);
  if (!auth) return json(res, 503, { ok: false, error: 'off' });
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim();

  if (q.selftest && q.lines) {
    /* a batch of lines in one voice, for the site's own films: lines is a JSON list of strings, speed 0.7 to 1.2 */
    if (!same(String(q.code || ''), process.env.DEMO_BUILDER_CODE || '')) return json(res, 403, { ok: false, error: 'code' });
    let lines = []; try { lines = JSON.parse(String(q.lines)); } catch (e) {}
    lines = (Array.isArray(lines) ? lines : []).map((x) => String(x || '').trim().slice(0, 600)).filter(Boolean).slice(0, 12);
    const vk = VOICES[q.voices] ? q.voices : 'eric', model = /^elevenlabs\/[a-z0-9.-]+$/.test(String(q.model || '')) ? q.model : MODEL;
    const speed = Math.min(1.2, Math.max(0.7, Number(q.speed) || 1));
    const vid = /^[A-Za-z0-9]{20}$/.test(String(q.voice_id || '')) ? String(q.voice_id) : VOICES[vk];   // any ElevenLabs voice, to try one out
    if (!lines.length) return json(res, 400, { ok: false, error: 'lines' });
    if (!(await takeChars(lines.reduce((n, x) => n + x.length, 0)))) return json(res, 429, { ok: false, error: 'cap' });
    const out = await Promise.all(lines.map(async (text, i) => {
      try { const r = await speak(text, vid, auth, model, speed); return { i, ok: true, ms: r.ms, bytes: r.audio.length, warnings: r.warnings, b64: r.audio.toString('base64') }; }
      catch (e) { return { i, ok: false, status: e.status || null, detail: String(e.text || e.message).slice(0, 300) }; }
    }));
    console.log('voice: batch ' + JSON.stringify({ model, voice: vid === VOICES[vk] ? vk : vid, speed, lines: lines.length, ok: out.filter((x) => x.ok).length }));
    return json(res, out.every((x) => x.ok) ? 200 : 502, { ok: out.every((x) => x.ok), model, voice: vid === VOICES[vk] ? vk : vid, speed, lines: out });
  }
  if (q.selftest) {
    if (!same(String(q.code || ''), process.env.DEMO_BUILDER_CODE || '')) return json(res, 403, { ok: false, error: 'code' });
    const line = String(q.text || 'Every hot weekend, the cold drinks aisle is empty by noon. With IBM Granite running inside Confluent, the store sees it coming and moves the order before the shelf runs out.').slice(0, 400);
    const keys = String(q.voices || Object.keys(VOICES).join(',')).split(',').filter((k) => VOICES[k]).slice(0, 8);
    const model = /^elevenlabs\/[a-z0-9.-]+$/.test(String(q.model || '')) ? q.model : MODEL;
    if (!(await takeChars((line.length + 20) * keys.length))) return json(res, 429, { ok: false, error: 'cap' });
    const out = await Promise.all(keys.map(async (k) => {
      const name = k.charAt(0).toUpperCase() + k.slice(1);
      try { const s = await speak(q.label ? 'This is ' + name + '. ' + line : line, VOICES[k], auth, model); return { voice: k, ok: true, ms: s.ms, bytes: s.audio.length, warnings: s.warnings, b64: q.b64 ? s.audio.toString('base64') : undefined }; }
      catch (e) { return { voice: k, ok: false, status: e.status || null, detail: String(e.text || e.message).slice(0, 300) }; }
    }));
    console.log('voice: selftest ' + JSON.stringify({ model, out: out.map((x) => ({ voice: x.voice, ok: x.ok, ms: x.ms, bytes: x.bytes, status: x.status })) }));
    return json(res, out.every((x) => x.ok) ? 200 : 502, { ok: out.every((x) => x.ok), model, chars: line.length, voices: out });
  }

  /* one step of one demo */
  const d = String(q.d || ''), phase = String(q.p || ''), vk = VOICES[q.v] ? q.v : 'eric';
  if (!PHASES.includes(phase)) return json(res, 404, { ok: false });
  let spec = null;
  const ex = EXAMPLES.find((x) => x.id === d);
  if (ex) spec = ex.spec;
  else if (/^[a-z0-9]{10}$/.test(d) && blobOn()) { const r = await readBlob('builder/demos/' + d + '.json', true); spec = r && r.spec; }
  const step = spec && Array.isArray(spec.steps) ? spec.steps.find((s) => s && s.phase === phase) : null;
  const full = step ? String(step.say || '').trim() : '', text = full.slice(0, 1200);
  if (!text) return json(res, 404, { ok: false });
  if (q.h && String(q.h) !== fnv(full)) return json(res, 409, { ok: false, error: 'changed' });
  const key = crypto.createHash('sha256').update(MODEL + '|' + VOICES[vk] + '|' + text).digest('hex').slice(0, 40);
  const path = 'builder/voice/' + key + '.mp3';
  if (blobOn()) { const hit = await readBlob(path); if (hit && hit.length > 200) return audioOut(req, res, hit); }
  if (tooFast(ip)) return json(res, 429, { ok: false, error: 'fast' });
  if (!(await takeChars(text.length))) return json(res, 429, { ok: false, error: 'cap' });
  try {
    const s = await speak(text, VOICES[vk], auth);
    if (blobOn()) { try { await put(path, s.audio, { access: 'private', contentType: 'audio/mpeg', addRandomSuffix: false, allowOverwrite: true }); } catch (e) { console.error('voice: save failed', e && e.message); } }
    console.log('voice: made ' + JSON.stringify({ d, phase, voice: vk, chars: text.length, ms: s.ms, bytes: s.audio.length }));
    return audioOut(req, res, s.audio);
  } catch (e) {
    console.error('voice: failed', e.status, String(e.text || e.message).slice(0, 300));
    return json(res, 502, { ok: false, error: 'voice', status: e.status || null });
  }
};
module.exports._test = { VOICES, MODEL };
