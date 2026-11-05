// Demo builder for realtimeintelligence.io. An IBM seller chats with Claude Opus 5.5 about a client, and Claude builds and
// changes a narrated demo of IBM Granite Time Series on Confluent that plays beside the chat, in the site's design.
//   POST /api/build            { code, chat: [{ role, text }], spec, version, id, key } → server-sent events: status, thinking,
//                              text, building, reset, demo, done, error. The newest chat message is the seller's.
//   GET  /api/build?status=1   whether building is switched on (no secrets)
//   GET  /api/build?id=ID      one saved demo, by its share id (the newest version of that conversation)
//   GET  /api/build?key=KEY    the saved demos for the site owner, newest first (KEY is CONTACT_KEY)
//   GET  /api/build?selftest=chat&code=CODE[&effort=LEVEL&fast=0|1]  a first version and one change through the chat path,
//        as JSON (selftest=1 runs the first version only; counts toward the cap). Every model run logs one line with its
//        timings and token use.
// Environment: DEMO_BUILDER_CODE (the sellers' access code) switches building on. The model is reached through Vercel AI
//   Gateway with the deployment's own OIDC token (or AI_GATEWAY_API_KEY), so no model key is stored; with ANTHROPIC_API_KEY
//   set, calls go straight to Anthropic instead. Through the gateway the Vercel team needs a card on file and purchased
//   AI Gateway Credits: the free monthly credit covers only some models.
//   Optional: DEMO_DAILY_CAP (chat turns a day, default 80), DEMO_MODEL (default anthropic/claude-opus-5.5 through the
//   gateway, claude-opus-5-5 direct), DEMO_EFFORT (a first version, default xhigh), DEMO_EDIT_EFFORT (changes and
//   questions, default high), DEMO_FAST (0 turns off the gateway's fast mode), DEMO_DEADLINE_S (seconds a turn may take,
//   default 290), ANTHROPIC_BASE_URL (for tests).
//   Measured through the gateway on a one minute brief: max effort thought for 54,000 tokens (3 minutes even in fast mode),
//   xhigh 6,200 tokens (76 s standard), high 3,700 (47 s standard); fast mode ran about 3.8 times the standard speed.
const crypto = require('crypto');
const { put, list, get } = require('@vercel/blob');

const DIRECT = !!process.env.ANTHROPIC_API_KEY;   // an Anthropic key goes straight to Anthropic, otherwise Vercel AI Gateway
const MODEL = process.env.DEMO_MODEL || (DIRECT ? 'claude-opus-5-5' : 'anthropic/claude-opus-5.5');
const LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'];
const pick = (v, d) => (LEVELS.includes(v) ? v : d);
const EFFORT = pick(process.env.DEMO_EFFORT, 'xhigh');            // a first version
const EDIT_EFFORT = pick(process.env.DEMO_EDIT_EFFORT, 'high');    // a change or a question
const SOFT = 170000;                                               // a pass still running after this gives way to a quicker one
/* fast mode: the same model on the gateway's faster serving path (2.5x and more the output speed, twice the token price),
   falling back to standard speed when the fast tier is busy */
const FAST = !DIRECT && !/^(0|false|off|no)$/i.test(process.env.DEMO_FAST || '1');
const CAP = Math.max(1, parseInt(process.env.DEMO_DAILY_CAP || '80', 10) || 80);
const DEADLINE = Math.max(30, parseInt(process.env.DEMO_DEADLINE_S || '290', 10) || 290) * 1000;
const API = (process.env.ANTHROPIC_BASE_URL || (DIRECT ? 'https://api.anthropic.com' : 'https://ai-gateway.vercel.sh')).replace(/\/+$/, '');
/* who signs the call: an Anthropic key, an AI Gateway key, or this deployment's OIDC token (sent with every request on Vercel) */
function auth(req) {
  if (DIRECT) return { 'x-api-key': process.env.ANTHROPIC_API_KEY };
  const t = process.env.AI_GATEWAY_API_KEY || (req && req.headers && req.headers['x-vercel-oidc-token']) || process.env.VERCEL_OIDC_TOKEN;
  return t ? { authorization: 'Bearer ' + t } : null;
}
const PHASES = ['intro', 'signal', 'forecast', 'context', 'anomaly', 'decision', 'stream', 'outcome', 'close'];
const MODELS = ['TTM', 'FlowState', 'PatchTST-FM', 'TSPulse'];
const VOICES = ['jessicaanne', 'eric', 'bella', 'sarah', 'matilda', 'alice', 'brian', 'george'];   // ElevenLabs narrators, see api/voice.js
const LIMIT = { client: 160, industry: 80, usecase: 80, pain: 900, data: 600, decision: 600, audience: 60, tone: 60, length: 30, prompt: 3000, code: 120 };

/* ---------------------------------------------------------------- what Opus fills in */
const O = (p) => ({ type: 'object', properties: p, required: Object.keys(p), additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, I = { type: 'integer' }, B = { type: 'boolean' };
const E = (v) => ({ type: 'string', enum: v });
const SCHEMA = O({
  title: S, subtitle: S, client: S, industry: S, persona: S, pain: S, outcome: S, tone: S, use_case: S,
  model: E(MODELS), voice: E(VOICES),
  signal: O({ name: S, unit: S, source: S, topic: S, interval_minutes: N, pattern: E(['daily', 'weekly', 'bursty', 'intermittent', 'trend', 'smooth']), base: N, swing: N, noise: N, decimals: I }),
  context: O({ name: S, topic: S, event: S, effect: E(['up', 'down']), size: N, lag_steps: I }),
  anomaly: O({ kind: E(['spike', 'drop', 'shift', 'drift', 'gap']), label: S, size: N }),
  limit: O({ enabled: B, label: S, value: N, side: E(['above', 'below']) }),
  decision: O({ action: S, owner: S, timing: S, impact: S, effect: E(['up', 'down', 'none']), size: N }),
  usual_way: O({ steps: S, delay: S }),
  kpis: { type: 'array', items: O({ value: S, label: S, basis: S }) },
  steps: { type: 'array', items: O({ phase: E(PHASES), title: S, say: S, caption: S }) },
  close: O({ headline: S, next: { type: 'array', items: S } }),
  notes: { type: 'array', items: S }
});

const SYSTEM = `You design live demos of real-time intelligence: IBM Granite Time Series foundation models running inside Confluent Cloud. An IBM seller describes a client. You return one demo as JSON, and the player on realtimeintelligence.io renders it as a narrated, animated walkthrough in the site's design. Think hard about the client's world first: who feels the pain, which signal shows it, what context explains it, which decision fixes it, and what that is worth. Then write.

HOW THE PLAYER RENDERS YOUR DEMO
- One main signal streams in live: history on the left, a "now" line, values landing as they happen.
- Steps play in order. Each step has a phase that drives the picture, a short title, the narration (say) and a caption.
- Phases, always in this order, each at most once:
  intro: a title card with the client, the persona, the pain and the outcome.
  signal: the live signal streams in, labeled with its source and its Confluent topic.
  forecast: an IBM Granite forecast with its range appears ahead of now. Zero-shot: no training, no model per series.
  context: a second stream (context) lands and bends the forecast up or down by context.size after context.lag_steps.
  anomaly: an event that does not fit the expected range arrives and is flagged on the event itself.
  decision: the forecast becomes an action (decision): what, who, when, impact. A "with the change" line appears next to "as is".
  stream: how it runs: source to a governed Confluent topic (plus the context topic) to Flink SQL with AI_FORECAST or AI_DETECT_ANOMALIES and the Granite model, to the decision. The usual way and its delay sit below.
  outcome: the three KPIs.
  close: the headline and the next steps.
- Always include intro, forecast, decision and close. Use the others when they serve the story (a pure planning story can skip anomaly; a fraud story can skip context). 6 to 9 steps.

FACTS YOU MAY USE (do not invent other product facts)
- IBM Granite Time Series models, open source, 44M+ downloads on Hugging Face:
  TTM: fast forecasts at scale, millions of series on standard servers with no GPUs, about 180 forecasts a second; point forecasts and quantiles; good with control variables like price.
  FlowState: one model for any sampling rate, from seconds to months; long horizons, compact.
  PatchTST-FM: the whole distribution (99 quantiles) from long, complex history; risk and limits; top zero-shot accuracy.
  TSPulse: anomaly scores on every event, search by shape, classification, filling sensor gaps; #1 on the TSB-AD anomaly benchmark.
- Pretrained and zero-shot: no model per series and no training before the first forecast. They adapt as each event lands.
- They run inside Confluent Cloud: Flink SQL functions AI_FORECAST and AI_DETECT_ANOMALIES on governed topics (Schema Registry), so the data stays in place: no copies to a separate ML platform, no GPUs, no egress fees. Results land in topics that feed alerts, dashboards, operational systems and Streaming Agents.
- Value framing you may use, always as illustrative: about 10× faster time to value, decision time from days to seconds, savings in the millions for large operations.
- Never claim a specific client result, price, certification, contract or SLA. The data in the demo is simulated. KPIs are illustrative (basis "Illustrative") unless the seller gave a number; then use it and set basis to "Seller input". A KPI can also state a product fact (basis names the model).

NARRATION (say)
- It is read aloud by a voice. Spoken English: short sentences, active voice, the client's own words. Frame it from the client's side: persona, pain, outcome. The model is the means, never the hero.
- No acronyms and no code in say. Write "products" not SKUs, "standard servers" not CPUs, "service" not API, "language models" not LLMs, "machine learning" not ML, "arrival time" not ETA. IBM, AI and Confluent are fine. Name Flink functions only as "the forecast function" or "the anomaly detection function".
- Numbers in digits, units in words: "36 degrees", "40 percent", "2 seconds", "1,000 kilowatts". No symbols like °, %, $ or × in say.
- Never say "early access" or anything about sign-up programs.
- Match the tone and the audience. Executives: outcomes, risk and money. Line of business: the daily decision and who acts. Data and AI teams: how it runs, a little depth, still plain.
- Total length of all say text: about 1 minute ≈ 150 words, 2 minutes ≈ 300 words, 3 minutes ≈ 430 words. Each step 12 to 70 words.
- caption: the key phrase of the step, 4 to 10 words, no period.
- Every say for forecast, context, anomaly and decision must describe what is on screen right then.

THE DATA (it drives the chart, keep it realistic)
- signal: a stream the client really has. name like "Cold drinks sales, store 112"; unit short ("units/h", "kW", "tx/min", "°C", "ms"); source the system it comes from; topic a plausible Confluent topic name (lowercase, dots). interval_minutes the sampling interval (1 to 1440). pattern: daily, weekly, bursty, intermittent, trend or smooth. base the typical level in the unit. swing the seasonal amplitude as a fraction of base (0.05 to 0.6). noise as a fraction of base (0.02 to 0.25). decimals 0 to 2.
- context: the second stream that explains a change (weather, promotions, customer history, carrier arrival times, deploy events, market news). effect up or down, size the fraction it moves the signal (0.1 to 1.0), lag_steps intervals before it shows (0 to 12). event is a short on-screen label.
- anomaly: kind spike, drop, shift, drift or gap; size in multiples of the normal range (1.5 to 4); label a short on-screen line (under 48 characters).
- limit: a spec, capacity or peak line when the story has one (enabled true, value in the signal's unit near the top or bottom of its range); otherwise enabled false, label empty, value 0.
- decision: action (under 70 characters), owner (team or system), timing, impact (under 70 characters). effect up or down with size 0.05 to 0.4 when the action moves the signal (raise an order, lower a setpoint), none when it does not (hold a payment).
- usual_way: how it is done today (under 80 characters) and its delay ("Next day", "After settlement").
- kpis: exactly 3. value short ("−38%", "12 min", "1 model"), label under 52 characters, basis.
- close.headline: one line (under 60 characters). close.next: exactly 3 concrete next steps for a pilot.
- notes: 3 to 5 short talking points or objection answers for the seller. They are not narrated.
- title under 60 characters, in the client's terms. subtitle one sentence. client: the client name the seller gave, else a short descriptor ("A national grocery chain"). persona: the role the demo speaks to. pain and outcome: one sentence each. tone: the tone you used. use_case: a short label.
- model: the Granite model that fits best (TTM for forecasting at scale, FlowState for mixed sampling rates, PatchTST-FM for risk, limits and long history, TSPulse for anomalies, search and classification).
- voice: the narrator who reads the say text aloud, an ElevenLabs voice: jessicaanne (a professional, conversational American woman, the default), bella (warm American woman), sarah (calm American woman), matilda (friendly American woman), alice (clear British woman), eric (smooth American man), brian (deep American man), george (warm British man). Use jessicaanne unless the seller asks for another voice.

If the brief is not about a business decision that time series data can inform, still design the closest sensible demo and say so in the notes. Never include personal data about real people.`;

/* ---------------------------------------------------------------- helpers */
const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const clamp = (x, a, b, d) => { x = Number(x); return Number.isFinite(x) ? Math.min(b, Math.max(a, x)) : d; };
const day = () => new Date().toISOString().slice(0, 10);
const newId = () => { const a = 'abcdefghijkmnpqrstuvwxyz23456789'; const b = crypto.randomBytes(10); let s = ''; for (const x of b) s += a[x % a.length]; return s; };

function send(res, code, body, extra) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', (extra && extra.cache) || 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  return res.end(JSON.stringify(body));
}
function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a || !b) return false;
  const x = crypto.createHash('sha256').update(a).digest(), y = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (raw == null) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 64 * 1024) break; chunks.push(c); }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}
async function readJSON(pathname) {
  try { const r = await get(pathname, { access: 'private', useCache: false }); if (!r || !r.stream) return null; return JSON.parse(await new Response(r.stream).text()); } catch (e) { return null; }
}
const blobOn = () => !!process.env.BLOB_READ_WRITE_TOKEN;

/* a burst limit per address per ten minutes, per instance; the daily cap in the store is the real limit */
const recent = new Map();
function tooFast(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, t = (recent.get(ip) || []).filter((x) => now - x < win);
  if (t.length >= 30) { recent.set(ip, t); return true; }
  t.push(now); recent.set(ip, t); if (recent.size > 2000) recent.clear(); return false;
}
async function takeBuild() {
  if (!blobOn()) return { ok: true, count: 0 };
  const p = 'builder/usage/' + day() + '.json', u = (await readJSON(p)) || { count: 0 };
  if (u.count >= CAP) return { ok: false, count: u.count };
  u.count += 1; u.updated = new Date().toISOString();
  try { await put(p, JSON.stringify(u), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }); } catch (e) { console.error('build: usage write failed', e && e.message); }
  return { ok: true, count: u.count };
}

/* ---------------------------------------------------------------- the brief Opus reads */
function brief(b) {
  const f = b.fields || {}, g = (k) => clean(f[k], LIMIT[k] || 600);
  const len = /3/.test(g('length')) ? 3 : /1/.test(g('length')) ? 1 : 2;
  const lines = [
    'Design one demo for this IBM seller brief.',
    g('client') && 'Client: ' + g('client'),
    g('industry') && 'Industry or domain: ' + g('industry'),
    g('usecase') && 'Use case: ' + g('usecase'),
    g('pain') && 'Client pain point: ' + g('pain'),
    g('data') && 'Data the client streams: ' + g('data'),
    g('decision') && 'Decision to improve: ' + g('decision'),
    g('audience') && 'Audience: ' + g('audience'),
    g('tone') && 'Style and tone: ' + g('tone'),
    'Length: about ' + len + (len === 1 ? ' minute' : ' minutes') + ' of narration in total.',
    clean(b.prompt, LIMIT.prompt) && 'In the seller\'s own words:\n' + clean(b.prompt, LIMIT.prompt)
  ].filter(Boolean);
  return lines.join('\n');
}
const hasBrief = (b) => !!(clean(b.prompt, 20) || (b.fields && (clean(b.fields.pain, 20) || clean(b.fields.usecase, 20) || clean(b.fields.industry, 20))));

/* ---------------------------------------------------------------- what comes back, made safe to render */
const SAYFIX = [[/\bSKUs?\b/g, 'products'], [/\bCPUs?\b/g, 'standard servers'], [/\bGPUs?\b/g, 'graphics chips'], [/\bAPIs?\b/g, 'service'],
  [/\bLLMs?\b/g, 'language models'], [/\bETAs?\b/g, 'arrival times'], [/\bKPIs?\b/g, 'key numbers'], [/\bML\b/g, 'machine learning'],
  [/(\d)\s*%/g, '$1 percent'], [/(\d)\s*°\s*C\b/g, '$1 degrees'], [/(\d)\s*×/g, '$1 times']];
function tidy(x) {
  if (!x || typeof x !== 'object') throw new Error('not an object');
  const t = (v, n, d) => clean(v, n) || d || '';
  const sig = x.signal || {}, ctx = x.context || {}, an = x.anomaly || {}, lim = x.limit || {}, dec = x.decision || {}, uw = x.usual_way || {};
  const base = Math.abs(Number(sig.base)) > 0 ? Math.abs(Number(sig.base)) : 100;
  const spec = {
    title: t(x.title, 90, 'A real-time decision, in the stream'), subtitle: t(x.subtitle, 200), client: t(x.client, 80, 'Your client'),
    industry: t(x.industry, 60), persona: t(x.persona, 80), pain: t(x.pain, 260), outcome: t(x.outcome, 260), tone: t(x.tone, 60), use_case: t(x.use_case, 60),
    model: MODELS.includes(x.model) ? x.model : 'TTM', voice: VOICES.includes(x.voice) ? x.voice : 'jessicaanne',
    signal: { name: t(sig.name, 70, 'Live signal'), unit: t(sig.unit, 16), source: t(sig.source, 60), topic: t(sig.topic, 60, 'events.live').toLowerCase().replace(/[^a-z0-9._-]/g, '.'),
      interval_minutes: clamp(sig.interval_minutes, 1, 1440, 15), pattern: ['daily', 'weekly', 'bursty', 'intermittent', 'trend', 'smooth'].includes(sig.pattern) ? sig.pattern : 'daily',
      base, swing: clamp(sig.swing, 0, 0.8, 0.25), noise: clamp(sig.noise, 0.005, 0.4, 0.08), decimals: Math.round(clamp(sig.decimals, 0, 2, 0)) },
    context: { name: t(ctx.name, 50, 'Context'), topic: t(ctx.topic, 60, 'context.live').toLowerCase().replace(/[^a-z0-9._-]/g, '.'), event: t(ctx.event, 70), effect: ctx.effect === 'down' ? 'down' : 'up', size: clamp(ctx.size, 0.02, 1.5, 0.3), lag_steps: Math.round(clamp(ctx.lag_steps, 0, 16, 2)) },
    anomaly: { kind: ['spike', 'drop', 'shift', 'drift', 'gap'].includes(an.kind) ? an.kind : 'spike', label: t(an.label, 60, 'Outside the expected range'), size: clamp(an.size, 1.2, 5, 2.5) },
    limit: { enabled: !!lim.enabled && Number.isFinite(Number(lim.value)), label: t(lim.label, 40), value: Number(lim.value) || 0, side: lim.side === 'below' ? 'below' : 'above' },
    decision: { action: t(dec.action, 90, 'Act before the risk lands'), owner: t(dec.owner, 60), timing: t(dec.timing, 50), impact: t(dec.impact, 90), effect: ['up', 'down', 'none'].includes(dec.effect) ? dec.effect : 'none', size: clamp(dec.size, 0, 0.6, 0) },
    usual_way: { steps: t(uw.steps, 100, 'Copy, train and score in a nightly batch'), delay: t(uw.delay, 30, 'Next day') },
    kpis: (Array.isArray(x.kpis) ? x.kpis : []).slice(0, 3).map((k) => ({ value: t(k && k.value, 16, '—'), label: t(k && k.label, 70), basis: t(k && k.basis, 50, 'Illustrative') })),
    steps: [], close: { headline: t(x.close && x.close.headline, 80, 'Bring us a stream and a decision.'), next: [] }, notes: []
  };
  while (spec.kpis.length < 3) spec.kpis.push({ value: ['10×', 'Seconds', '1 model'][spec.kpis.length], label: ['faster time to value', 'from event to decision', 'for every series, zero-shot'][spec.kpis.length], basis: 'Illustrative' });
  const seen = new Set();
  const steps = (Array.isArray(x.steps) ? x.steps : []).filter((s) => s && PHASES.includes(s.phase) && !seen.has(s.phase) && seen.add(s.phase))
    .sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase));
  spec.steps = steps.map((s) => {
    /* a sentence about sign-up programs is dropped whole, acronyms become words */
    let say = clean(s.say, 900).split(/(?<=[.!?])\s+/).filter((x) => !/early[- ]access/i.test(x)).join(' ');
    for (const [re, to] of SAYFIX) say = say.replace(re, to);
    return { phase: s.phase, title: clean(s.title, 60), say: say.replace(/\s{2,}/g, ' ').trim(), caption: clean(s.caption, 90).replace(/\.$/, '') };
  }).filter((s) => s.say || s.phase === 'intro' || s.phase === 'close');
  const need = (phase, step) => { if (!spec.steps.some((s) => s.phase === phase)) spec.steps.push(step); };
  need('intro', { phase: 'intro', title: spec.title, say: spec.pain, caption: spec.title });
  need('forecast', { phase: 'forecast', title: 'A forecast in the stream', say: 'IBM Granite forecasts what comes next, right inside Confluent, with no training.', caption: 'A forecast in the stream, zero-shot' });
  need('decision', { phase: 'decision', title: 'The decision', say: spec.decision.action + '.', caption: spec.decision.action });
  need('close', { phase: 'close', title: 'Next', say: spec.close.headline, caption: spec.close.headline.replace(/\.$/, '') });
  spec.steps.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase));
  spec.close.next = (Array.isArray(x.close && x.close.next) ? x.close.next : []).map((v) => clean(v, 120)).filter(Boolean).slice(0, 3);
  while (spec.close.next.length < 3) spec.close.next.push(['Pick one stream and one decision', 'Connect the topics in Confluent Cloud', 'Run it side by side with today\'s process'][spec.close.next.length]);
  spec.notes = (Array.isArray(x.notes) ? x.notes : []).map((v) => clean(v, 240)).filter(Boolean).slice(0, 6);
  if (spec.limit.enabled) { const v = spec.limit.value; if (!(v > 0) || v > base * 6) spec.limit.enabled = false; }
  return spec;
}
function parseSpec(text) {
  let s = String(text || '').trim();
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s); if (fence) s = fence[1];
  const a = s.indexOf('{'), b = s.lastIndexOf('}'); if (a < 0 || b <= a) throw new Error('no JSON in the answer');
  return JSON.parse(s.slice(a, b + 1));
}

/* ---------------------------------------------------------------- Opus, streamed */
function sseParse(raw) {
  let event = 'message', data = '';
  for (const line of raw.split('\n')) { if (line.startsWith('event:')) event = line.slice(6).trim(); else if (line.startsWith('data:')) data += line.slice(5).trim(); }
  if (!data) return null; try { return { event, data: JSON.parse(data) }; } catch (e) { return null; }
}
async function* claude(body, signal, who) {
  const r = await fetch(API + '/v1/messages', { method: 'POST', signal, headers: Object.assign({ 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, who), body: JSON.stringify(body) });
  if (!r.ok) { const txt = await r.text().catch(() => ''); const e = new Error((DIRECT ? 'Anthropic ' : 'AI Gateway ') + r.status + ': ' + txt.slice(0, 600)); e.status = r.status; e.text = txt; throw e; }
  const dec = new TextDecoder(); let buf = '';
  for await (const chunk of r.body) {
    buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, '\n'); let i;
    while ((i = buf.indexOf('\n\n')) >= 0) { const ev = sseParse(buf.slice(0, i)); buf = buf.slice(i + 2); if (ev) yield ev; }
  }
}

/* ---------------------------------------------------------------- the chat around the demo */
const CHAT = `

YOU ARE IN A CHAT WITH THE SELLER
- The seller talks with you in a chat beside the player. You answer in words, and you show the demo, or change it, by calling show_demo with the complete demo. The player updates the moment you call it.
- When the seller describes a client, an industry, a pain or a use case, build the first version right away. Fill the gaps with sensible assumptions and name the main ones in your reply, so the seller can correct them. Ask first only when there is nothing at all to build on, and then ask one short question.
- When you build or change the demo, first write one to three short sentences on what you built or changed, then call show_demo. When it helps, end with one idea the seller could try next.
- A change starts from the demo in the player. Change what the seller asked for and whatever must follow from it to stay consistent (narration that mentions a changed number, the KPIs, the title). Keep every other field exactly as it is.
- When the seller asks a question (about the models, Confluent, the client's data, how to present the demo), answer briefly in words and do not call show_demo.
- The narration is read aloud by an ElevenLabs voice. When the seller asks for another narrator (a man, a British voice, a calmer voice), change voice and keep everything else.
- Write like a helpful colleague: plain words, short paragraphs, no lists, no headings, no emojis.
- Unless the seller says otherwise: about 2 minutes of narration, for executives, in an executive brief tone.
- The seller's messages are a brief. The facts, narration and data rules above always apply.`;
const TOOL = { name: 'show_demo', description: 'Show the seller the demo in the player beside the chat. Pass the complete demo with every field, for the first version and for every change.', input_schema: SCHEMA };
const KEEP = { msg: 4000, turns: 24, chars: 40000 };
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

/* the conversation as Opus reads it: the seller's and Claude's words, turn by turn, and the demo in the player now with the newest message */
function conversation(b) {
  const raw = (Array.isArray(b.chat) ? b.chat : []).slice(-KEEP.turns);
  const out = [];
  for (const m of raw) {
    const role = m && m.role === 'assistant' ? 'assistant' : 'user', text = clean(m && m.text, KEEP.msg);
    if (!text) continue;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += '\n\n' + text; else out.push({ role, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  let total = out.reduce((n, m) => n + m.content.length, 0);
  while (out.length > 1 && total > KEEP.chars) { total -= out.shift().content.length; while (out.length > 1 && out[0].role !== 'user') total -= out.shift().content.length; }
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  let spec = null;
  if (b.spec && typeof b.spec === 'object') { try { if (JSON.stringify(b.spec).length < 40000) spec = tidy(b.spec); } catch (e) { spec = null; } }
  const last = out[out.length - 1], version = Math.max(0, b.version | 0);
  if (spec) last.content = 'The demo in the player now' + (version ? ' (version ' + version + ')' : '') + ':\n' + JSON.stringify(spec) + '\n\nThe seller:\n' + last.content;
  const firstUser = (raw.find((m) => m && m.role !== 'assistant' && clean(m.text, 10)) || {}).text;
  return { messages: out, spec, version, firstUser: clean(firstUser, 600) };
}

/* one turn: Opus thinks, replies in words and may call show_demo. Lighter variants follow if the endpoint rejects an option before anything streams */
async function turn(conv, effort, fast, who, signal, emit) {
  const sys = SYSTEM + CHAT;
  const req0 = {
    model: MODEL, max_tokens: 32000, stream: true,
    system: [{ type: 'text', text: sys, cache_control: { type: 'ephemeral' } }],
    tools: [Object.assign({}, TOOL, { strict: true })],
    tool_choice: { type: 'auto' },
    messages: conv.messages,
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort }
  };
  if (fast && !DIRECT) req0.providerOptions = { gateway: { speed: 'fast' } };
  const variants = [req0,
    Object.assign({}, req0, { thinking: { type: 'adaptive' } }),
    Object.assign({}, req0, { thinking: { type: 'adaptive' }, tools: [TOOL] }),
    Object.assign({}, req0, { system: sys, thinking: { type: 'adaptive' }, tools: [TOOL] })];
  const T0 = Date.now(), t = { first: 0, text: 0, tool: 0, end: 0 };
  let text = '', thinking = '', json = '', inTool = false, calls = [], stop = null, usage = {}, used = 0, started = false, err = null, lastThink = 0, lastBuild = 0;
  for (let v = 0; v < variants.length && !started; v++) {
    try {
      for await (const ev of claude(variants[v], signal, who)) {
        if (!started) t.first = Date.now() - T0;
        started = true; used = v; const d = ev.data;
        if (d.type === 'content_block_start' && d.content_block) {
          const k = d.content_block.type;
          if (k === 'tool_use') { inTool = d.content_block.name === TOOL.name; json = ''; if (!t.tool) t.tool = Date.now() - T0; if (inTool) emit('building', { chars: 0, steps: 0 }); }
          else if (k === 'text' && !t.text) t.text = Date.now() - T0;
        } else if (d.type === 'content_block_delta' && d.delta) {
          const x = d.delta;
          if (x.type === 'thinking_delta' && x.thinking) { thinking += x.thinking; if (Date.now() - lastThink > 450) { lastThink = Date.now(); emit('thinking', { text: thinking.slice(-1200) }); } }
          else if (x.type === 'text_delta' && x.text) { text += x.text; emit('text', { d: x.text }); }
          else if (x.type === 'input_json_delta' && inTool) {
            json += x.partial_json || '';
            if (Date.now() - lastBuild > 350) { lastBuild = Date.now(); emit('building', { chars: json.length, steps: (json.match(/"phase"\s*:/g) || []).length }); }
          }
        } else if (d.type === 'content_block_stop') { if (inTool) { calls.push(json); inTool = false; } }
        else if (d.type === 'message_delta') { if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason; if (d.usage) usage = Object.assign(usage, d.usage); }
        else if (d.type === 'message_start' && d.message && d.message.usage) usage = Object.assign(usage, d.message.usage);
        else if (d.type === 'error') {
          const et = String(d.error && d.error.type || '');
          throw Object.assign(new Error((d.error && d.error.message) || 'stream error'), { status: /overload/i.test(et) ? 529 : /rate/i.test(et) ? 429 : 500, text: JSON.stringify(d.error || {}) });
        }
      }
      err = null;
    } catch (e) {
      err = e;
      const msg = String(e && e.text || e && e.message || '');
      const retry = !started && e && e.status === 400 && /display|thinking|strict|tool|output_config|cache_control|system|schema/i.test(msg);
      if (!(e && e.name === 'AbortError')) console.error('build: attempt', v, 'failed', e && e.status, msg.slice(0, 300));
      if (!retry) break;
    }
  }
  if (thinking) emit('thinking', { text: thinking.slice(-1200) });
  t.end = Date.now() - T0;
  /* the last complete show_demo call is the demo */
  let spec = null, bad = null;
  for (let i = calls.length - 1; i >= 0 && !spec; i--) { try { spec = tidy(JSON.parse(calls[i] || '{}')); } catch (e) { bad = e.message; } }
  return { text, thinking, spec, called: calls.length > 0 || inTool, bad, stop, usage, used, err, t };
}
/* one line per model run in the function logs, so turn times and token use can be read back */
function logRun(kind, effort, fast, r, aborted) {
  console.log('build: ' + kind + ' ' + JSON.stringify({ effort, fast: !!fast, ok: !r.err, aborted: !!aborted, status: (r.err && r.err.status) || null,
    stop: r.stop, demo: !!r.spec, called: r.called, t: r.t, thinking_chars: r.thinking.length, text_chars: r.text.length, usage: r.usage }));
}
/* AI Gateway refusals, from its FAQ: 403 customer_verification_required = no card on file; 403 naming the free tier = the model
   needs purchased credits (the free monthly credit covers only some models); 402 = no balance; 402 quota_for_entity_exceeded = a budget.
   These show in the chat as Claude's own words. */
const errorFor = (err, aborted) => { const t = String(err.text || ''); return aborted ? { code: 'timeout', msg: 'That took longer than it should on my side. Send it again and I will keep it simpler.' }
  : err.status === 429 || err.status === 529 ? { code: 'busy', msg: 'Claude is very busy right now. Send it again in a minute.' }
  : /quota_for_entity_exceeded/i.test(t) ? { code: 'credits', msg: 'The builder reached its spending limit for now. The site owner can raise it in Vercel.' }
  : err.status === 402 ? { code: 'credits', msg: 'The builder is out of AI credits. The site owner can top them up in Vercel.' }
  : /customer_verification_required|credit card/i.test(t) ? { code: 'credits', msg: 'The builder needs a card on file in Vercel before it can reach Claude. The site owner can add one.' }
  : /free.?tier|RestrictedModels/i.test(t) ? { code: 'credits', msg: 'The builder needs purchased AI credits to run Claude Opus. The site owner can buy some in Vercel.' }
  : err.status === 401 || err.status === 403 ? { code: 'key', msg: 'The builder cannot reach Claude right now. The site owner needs to check its model access.' }
  : { code: 'failed', msg: 'Something went wrong on my side. Send it again.' }; };
const retryable = (e) => e && (e.status === 429 || e.status === 529 || e.status === 503 || e.status === 502 || e.status === 500 || (!e.status && e.name !== 'AbortError'));

/* save the demo under the conversation: the share link always shows the newest version, and only the browser holding the key can change it */
async function save(b, conv, r, effort, ip) {
  let version = conv.version + 1;
  if (!blobOn()) return { id: null, version };
  let id = typeof b.id === 'string' && /^[a-z0-9]{10}$/.test(b.id) ? b.id : null, key = typeof b.key === 'string' ? b.key.slice(0, 80) : '', prev = null, fresh = false;
  if (id) { prev = await readJSON('builder/demos/' + id + '.json'); if (!prev || !prev.keyhash || !key || !same(hash(key), prev.keyhash)) { id = null; prev = null; } }
  if (!id) { id = newId(); key = crypto.randomBytes(18).toString('hex'); fresh = true; }
  if (prev && prev.version >= version) version = prev.version + 1;
  const chat = (Array.isArray(b.chat) ? b.chat : []).slice(-30).map((m) => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', text: clean(m && m.text, 2000) })).filter((m) => m.text);
  if (r.text) chat.push({ role: 'assistant', text: clean(r.text, 2000) });
  const now = new Date().toISOString();
  const record = { id, keyhash: hash(key), created: (prev && prev.created) || now, updated: now, model: MODEL, effort, fast: FAST, version, ms: r.t.end, usage: r.usage,
    ip: crypto.createHash('sha256').update(ip + '|rti').digest('hex').slice(0, 16), request: { prompt: conv.firstUser }, chat, spec: r.spec };
  try { await put('builder/demos/' + id + '.json', JSON.stringify(record, null, 1), { access: 'private', contentType: 'application/json', addRandomSuffix: false, allowOverwrite: true }); }
  catch (e) { console.error('build: save failed', e && e.message); return { id: null, version }; }
  return { id, key: fresh ? key : undefined, version };
}

/* a chat turn, streamed to the page as server-sent events: status, thinking, text, building, reset, demo, done, error.
   A pass that runs long gives way to a quicker one, and a busy or dropped call is tried again, so the seller sees an answer, not a timeout. */
async function chatTurn(req, res, b, ip) {
  const T0 = Date.now(), outer = new AbortController();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (res.flushHeaders) res.flushHeaders();
  let open = true;
  if (res.on) res.on('close', () => { if (!res.writableEnded) { open = false; outer.abort(); } });
  const emit = (event, data) => { if (!open) return; try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {} };
  const ping = setInterval(() => { if (open) { try { res.write(': keepalive\n\n'); } catch (e) {} } }, 12000);
  const finish = () => { clearInterval(ping); try { res.end(); } catch (e) {} };
  const conv = conversation(b);
  if (!conv) { emit('error', { code: 'brief', msg: 'Tell me about your client first.' }); return finish(); }
  const who = auth(req);
  let effort = LEVELS.includes(b.effort) && b.effort !== 'max' ? b.effort : (conv.spec ? EDIT_EFFORT : EFFORT), quick = false, tries = 0, r = null, timedOut = false;
  emit('status', { step: 'start', effort, fast: FAST });
  for (;;) {
    const left = DEADLINE - (Date.now() - T0);
    if (left < 12000 || !open) break;
    const ac = new AbortController(), kill = () => ac.abort();
    outer.signal.addEventListener('abort', kill);
    const timer = setTimeout(kill, Math.max(8000, quick ? left - 4000 : Math.min(SOFT, left - 45000)));
    r = await turn(conv, effort, FAST, who, ac.signal, emit);
    clearTimeout(timer); outer.signal.removeEventListener('abort', kill);
    timedOut = !!(r.err && ac.signal.aborted && open);
    logRun('chat', effort, FAST, r, timedOut);
    tries++;
    if (!open) return finish();
    const broken = !r.err && r.called && !r.spec;
    if (!r.err && !broken) break;
    if (tries >= 4 || !(timedOut || broken || retryable(r.err))) break;
    if (timedOut || broken) { if (quick) break; quick = true; effort = 'medium'; }
    emit('reset', { msg: timedOut ? 'Taking a quicker pass' : broken ? 'Finishing the demo again' : 'Trying that again' });
    if (!timedOut && !broken) await new Promise((ok) => setTimeout(ok, 1500 * tries));
  }
  if (!r) { emit('error', errorFor({}, true)); return finish(); }
  if (r.err) { emit('error', errorFor(r.err, timedOut)); return finish(); }
  if (r.called && !r.spec) { emit('error', { code: 'parse', msg: 'I could not finish that version of the demo. Send it again and I will keep it simpler.' }); return finish(); }
  if (r.stop === 'refusal') { emit('error', { code: 'refused', msg: 'I cannot help with that one. Tell me about a business decision that streaming data can inform.' }); return finish(); }
  if (r.spec) {
    const s = await save(b, conv, r, effort, ip);
    emit('demo', { spec: r.spec, id: s.id, key: s.key, version: s.version });
  }
  emit('done', { ms: Date.now() - T0, effort, fast: FAST, demo: !!r.spec });
  return finish();
}

/* ---------------------------------------------------------------- routes */
module.exports = async function handler(req, res) {
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  const ready = !!process.env.DEMO_BUILDER_CODE && !!auth(req);
  const via = DIRECT ? 'anthropic' : 'gateway';
  if (req.method === 'GET') {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    if (q.status) return send(res, 200, { ok: true, ready, via, model: MODEL, effort: EFFORT, edit_effort: EDIT_EFFORT, fast: FAST, store: blobOn() });
    if (q.selftest === 'sse') {
      /* the full chat path as a browser sees it, saving included: a first version, then a change to the same conversation */
      if (!ready) return send(res, 503, { ok: false, error: 'off' });
      if (!same(clean(q.code, LIMIT.code), process.env.DEMO_BUILDER_CODE)) return send(res, 403, { ok: false, error: 'code' });
      const cap = await takeBuild(); if (!cap.ok) return send(res, 429, { ok: false, error: 'cap' });
      const T0 = Date.now();
      const once = (body) => new Promise((done) => {
        const out = [], t0 = Date.now(), fake = { statusCode: 0, writableEnded: false, setHeader() {}, flushHeaders() {}, on() {}, write(s) { out.push(s); return true; }, end() { this.writableEnded = true; done({ ms: Date.now() - t0, ev: out.join('').split('\n\n').filter((x) => x.startsWith('event:')).map((x) => { const i = x.indexOf('\ndata: '); return [x.slice(7, i), JSON.parse(x.slice(i + 7))]; }) }); } };
        chatTurn({ headers: req.headers, on() {} }, fake, body, ip).catch((e) => done({ ms: Date.now() - t0, ev: [['error', { msg: e.message }]] }));
      });
      const sum = (r) => { const c = {}; r.ev.forEach(([e]) => { c[e] = (c[e] || 0) + 1; }); const d = (r.ev.find(([e]) => e === 'demo') || [])[1], er = (r.ev.find(([e]) => e === 'error') || [])[1];
        return { ms: r.ms, events: c, reply: r.ev.filter(([e]) => e === 'text').map(([, x]) => x.d).join('').slice(0, 300), demo: d ? { id: d.id, key: !!d.key, version: d.version, title: d.spec.title, client: d.spec.client } : null, error: er || null }; };
      const chat = [{ role: 'user', text: 'A card issuer wants to stop card testing before authorization, without blocking travelers. About one minute.' }];
      const r1 = await once({ chat }), s1 = sum(r1), d1 = (r1.ev.find(([e]) => e === 'demo') || [])[1];
      let s2 = null, back = null;
      if (d1) {
        chat.push({ role: 'assistant', text: s1.reply }, { role: 'user', text: 'Make the client Northwind Bank and make it for their fraud operations team.' });
        const r2 = await once({ chat, spec: d1.spec, version: d1.version, id: d1.id, key: d1.key }); s2 = sum(r2);
        if (d1.id) { const rec = await readJSON('builder/demos/' + d1.id + '.json'); back = rec ? { version: rec.version, client: rec.spec && rec.spec.client, messages: rec.chat && rec.chat.length } : null; }
      }
      const ok = !!(s1.demo && s2 && s2.demo && (!s1.demo.id || (s2.demo.id === s1.demo.id && back && back.version === s2.demo.version)));
      return send(res, ok ? 200 : 502, { ok, ms: Date.now() - T0, turn1: s1, turn2: s2, stored: back, link: s1.demo && s1.demo.id ? 'https://realtimeintelligence.io/build?d=' + s1.demo.id : null });
    }
    if (q.selftest) {
      /* a first version and one change, through the same path as the chat, as JSON */
      if (!ready) return send(res, 503, { ok: false, error: 'off' });
      if (!same(clean(q.code, LIMIT.code), process.env.DEMO_BUILDER_CODE)) return send(res, 403, { ok: false, error: 'code' });
      const cap = await takeBuild(); if (!cap.ok) return send(res, 429, { ok: false, error: 'cap' });
      const effort = LEVELS.includes(q.effort) && q.effort !== 'max' ? q.effort : null, fast = q.fast != null ? /^(1|true|on|yes)$/i.test(String(q.fast)) && !DIRECT : FAST;
      const asks = ['A regional grocery chain. Hot weekends empty the cold drinks aisle by noon, and the nightly forecast only sees it the next morning. About one minute, plain and concise.',
        'Make the client Fresh Market, and make the context a weekend promotion instead of the weather.'];
      const T0 = Date.now(), turns = [], chat = []; let spec = null, version = 0;
      for (let k = 0; k < (q.selftest === 'chat' ? 2 : 1); k++) {
        chat.push({ role: 'user', text: asks[k] });
        const conv = conversation({ chat, spec, version }), eff = effort || (spec ? EDIT_EFFORT : EFFORT);
        const ac = new AbortController(), timer = setTimeout(() => ac.abort(), Math.max(10000, DEADLINE - (Date.now() - T0) - 5000));
        const r = await turn(conv, eff, fast, auth(req), ac.signal, () => {}); clearTimeout(timer);
        logRun('selftest', eff, fast, r, ac.signal.aborted);
        turns.push({ effort: eff, ok: !r.err && (!!r.spec || !r.called), error: r.err ? errorFor(r.err, ac.signal.aborted).code : null, status: r.err ? r.err.status || null : null,
          detail: r.err ? String(r.err.text || r.err.message || '').slice(0, 300) : r.bad, variant: r.used, t: r.t, stop: r.stop, usage: r.usage,
          reply: r.text.slice(0, 500), demo: !!r.spec, title: r.spec && r.spec.title, client: r.spec && r.spec.client, context: r.spec && r.spec.context.name, steps: r.spec && r.spec.steps.length });
        if (r.err || !r.spec) break;
        chat.push({ role: 'assistant', text: r.text }); spec = r.spec; version++;
      }
      const ok = turns.length > 0 && turns.every((x) => x.ok);
      return send(res, ok ? 200 : 502, { ok, via, model: MODEL, fast, ms: Date.now() - T0, turns });
    }
    if (q.id) {
      if (!/^[a-z0-9]{10}$/.test(String(q.id))) return send(res, 404, { ok: false });
      const r = blobOn() ? await readJSON('builder/demos/' + q.id + '.json') : null;
      if (!r || !r.spec) return send(res, 404, { ok: false });
      return send(res, 200, { ok: true, id: r.id, created: r.created, updated: r.updated || r.created, version: r.version || 1, spec: r.spec }, { cache: 'public, max-age=60, s-maxage=60' });
    }
    if (q.key) {
      if (!same(String(q.key), process.env.CONTACT_KEY || '')) return send(res, 404, { ok: false });
      const blobs = []; let cursor;
      do { const r = await list({ prefix: 'builder/demos/', cursor, limit: 1000 }); blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
      blobs.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
      const rows = (await Promise.all(blobs.slice(0, 300).map((x) => readJSON(x.pathname)))).filter(Boolean).map((r) => ({
        id: r.id, created: r.created, updated: r.updated || r.created, version: r.version || 1, link: 'https://realtimeintelligence.io/build?d=' + r.id, title: r.spec && r.spec.title, client: r.spec && r.spec.client,
        industry: r.spec && r.spec.industry, use_case: r.spec && r.spec.use_case, seconds: Math.round((r.ms || 0) / 1000), output_tokens: r.usage && r.usage.output_tokens,
        request: r.request, messages: Array.isArray(r.chat) ? r.chat.length : undefined }));
      return send(res, 200, { ok: true, count: rows.length, demos: rows });
    }
    return send(res, 404, { ok: false });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { ok: false }); }
  let b = await readBody(req);
  if (!ready) return send(res, 503, { ok: false, error: 'off', msg: 'Building is switched off right now. The examples still play.' });
  if (!same(clean(b.code, LIMIT.code), process.env.DEMO_BUILDER_CODE)) return send(res, 403, { ok: false, error: 'code', msg: 'That access code did not work. Ask your team for the seller code.' });
  /* the earlier form sent one brief: it becomes the first message */
  if (!Array.isArray(b.chat) && hasBrief(b)) b = Object.assign({}, b, { chat: [{ role: 'user', text: brief(b) }] });
  if (!Array.isArray(b.chat) || !b.chat.length) return send(res, 400, { ok: false, error: 'brief', msg: 'Tell me about your client first.' });
  if (tooFast(ip)) return send(res, 429, { ok: false, error: 'fast', msg: 'That is a lot of messages in a few minutes. Give it a moment and send it again.' });
  const cap = await takeBuild();
  if (!cap.ok) return send(res, 429, { ok: false, error: 'cap', msg: 'The builder has used today\'s messages. It opens again tomorrow.' });
  return chatTurn(req, res, b, ip);
};
module.exports._test = { tidy, parseSpec, brief, conversation, SCHEMA, SYSTEM: SYSTEM + CHAT };
