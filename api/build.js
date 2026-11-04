// Demo builder for realtimeintelligence.io. An IBM seller describes a client, Claude Opus 5.5 at max effort designs a
// narrated demo of IBM Granite Time Series on Confluent, and /build plays it.
//   POST /api/build            { code, mode, fields, prompt } → server-sent events: status, thinking, progress, demo, error
//   GET  /api/build?status=1   whether building is switched on (no secrets)
//   GET  /api/build?id=ID      one saved demo, by its share id
//   GET  /api/build?key=KEY    the saved demos for the site owner, newest first (KEY is CONTACT_KEY)
//   GET  /api/build?selftest=1&code=CODE  one quick low-effort build through the same path, as JSON (counts toward the cap)
// Environment: DEMO_BUILDER_CODE (the sellers' access code) switches building on. The model is reached through Vercel AI
//   Gateway with the deployment's own OIDC token (or AI_GATEWAY_API_KEY), so no model key is stored; with ANTHROPIC_API_KEY
//   set, calls go straight to Anthropic instead. Through the gateway the Vercel team needs a card on file and purchased
//   AI Gateway Credits: the free monthly credit covers only some models.
//   Optional: DEMO_DAILY_CAP (builds a day, default 80), DEMO_MODEL (default anthropic/claude-opus-5.5 through the gateway,
//   claude-opus-5-5 direct), DEMO_EFFORT (default max), DEMO_DEADLINE_S (seconds before a build gives up, default 290),
//   ANTHROPIC_BASE_URL (for tests).
const crypto = require('crypto');
const { put, list, get } = require('@vercel/blob');

const DIRECT = !!process.env.ANTHROPIC_API_KEY;   // an Anthropic key goes straight to Anthropic, otherwise Vercel AI Gateway
const MODEL = process.env.DEMO_MODEL || (DIRECT ? 'claude-opus-5-5' : 'anthropic/claude-opus-5.5');
const EFFORT = process.env.DEMO_EFFORT || 'max';
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
const LIMIT = { client: 160, industry: 80, usecase: 80, pain: 900, data: 600, decision: 600, audience: 60, tone: 60, length: 30, prompt: 3000, code: 120 };

/* ---------------------------------------------------------------- what Opus fills in */
const O = (p) => ({ type: 'object', properties: p, required: Object.keys(p), additionalProperties: false });
const S = { type: 'string' }, N = { type: 'number' }, I = { type: 'integer' }, B = { type: 'boolean' };
const E = (v) => ({ type: 'string', enum: v });
const SCHEMA = O({
  title: S, subtitle: S, client: S, industry: S, persona: S, pain: S, outcome: S, tone: S, use_case: S,
  model: E(MODELS),
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

/* a few builds per address per ten minutes, per instance; the daily cap in the store is the real limit */
const recent = new Map();
function tooFast(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, t = (recent.get(ip) || []).filter((x) => now - x < win);
  if (t.length >= 4) { recent.set(ip, t); return true; }
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
    model: MODELS.includes(x.model) ? x.model : 'TTM',
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

/* one model run: the full request first, then lighter variants if the endpoint rejects an option before anything streams */
async function run(b, effort, who, signal, emit) {
  const req0 = {
    model: MODEL, max_tokens: 64000, stream: true,
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: brief(b) }],
    thinking: { type: 'adaptive', display: 'summarized' },
    output_config: { effort, format: { type: 'json_schema', schema: SCHEMA } }
  };
  const plain = { role: 'user', content: brief(b) + '\n\nReturn only the JSON object, with no other text.' };
  const variants = [req0,
    Object.assign({}, req0, { thinking: { type: 'adaptive' } }),
    Object.assign({}, req0, { thinking: { type: 'adaptive' }, output_config: { effort }, messages: [plain] }),
    Object.assign({}, req0, { system: SYSTEM, thinking: { type: 'adaptive' }, output_config: { effort }, messages: [plain] })];
  let text = '', thinking = '', lastThink = 0, lastProg = 0, stop = null, usage = {}, used = 0, started = false, err = null;
  for (let v = 0; v < variants.length && !started; v++) {
    try {
      for await (const ev of claude(variants[v], signal, who)) {
        started = true; used = v; const d = ev.data;
        if (d.type === 'content_block_start' && d.content_block && d.content_block.type === 'text' && !text) emit('status', { step: 'writing', msg: 'Writing the story, the data and the narration' });
        else if (d.type === 'content_block_delta' && d.delta) {
          if (d.delta.type === 'thinking_delta' && d.delta.thinking) {
            thinking += d.delta.thinking;
            if (Date.now() - lastThink > 600) { lastThink = Date.now(); emit('thinking', { text: thinking.slice(-1600) }); }
          } else if (d.delta.type === 'text_delta' && d.delta.text) {
            text += d.delta.text;
            if (Date.now() - lastProg > 500) { lastProg = Date.now(); emit('progress', { chars: text.length }); }
          }
        } else if (d.type === 'message_delta') { if (d.delta && d.delta.stop_reason) stop = d.delta.stop_reason; if (d.usage) usage = Object.assign(usage, d.usage); }
        else if (d.type === 'message_start' && d.message && d.message.usage) usage = Object.assign(usage, d.message.usage);
        else if (d.type === 'error') throw Object.assign(new Error((d.error && d.error.message) || 'stream error'), { status: 529 });
      }
      err = null;
    } catch (e) {
      err = e;
      const msg = String(e && e.text || e && e.message || '');
      const retry = !started && e && e.status === 400 && /display|thinking|output_config|format|schema|cache_control|system/i.test(msg);
      console.error('build: attempt', v, 'failed', e && e.status, msg.slice(0, 300));
      if (!retry) break;
    }
  }
  return { text, thinking, stop, usage, used, err };
}
/* AI Gateway refusals, from its FAQ: 403 customer_verification_required = no card on file; 403 naming the free tier = the model
   needs purchased credits (the free monthly credit covers only some models); 402 = no balance; 402 quota_for_entity_exceeded = a budget */
const errorFor = (err, aborted) => { const t = String(err.text || ''); return aborted ? { code: 'timeout', msg: 'Opus was still thinking when the time ran out. Build it again at a faster effort, or shorten the brief.' }
  : err.status === 429 || err.status === 529 ? { code: 'busy', msg: 'Claude is busy right now. Try again in a minute.' }
  : /quota_for_entity_exceeded/i.test(t) ? { code: 'credits', msg: 'The site\'s AI Gateway reached its spending limit. The site owner needs to raise it in Vercel.' }
  : err.status === 402 ? { code: 'credits', msg: 'The site\'s AI Gateway is out of credits. The site owner needs to top it up in Vercel.' }
  : /customer_verification_required|credit card/i.test(t) ? { code: 'credits', msg: 'The site\'s AI Gateway needs a card on file in Vercel before it can build. The site owner needs to add one.' }
  : /free.?tier|RestrictedModels/i.test(t) ? { code: 'credits', msg: 'The site\'s AI Gateway needs purchased credits to run Claude Opus. The site owner needs to buy some in Vercel.' }
  : err.status === 401 || err.status === 403 ? { code: 'key', msg: 'The site\'s model access was not accepted. The site owner needs to check it.' }
  : { code: 'failed', msg: 'The build did not finish. Try again.' }; };

async function build(req, res, b, ip) {
  const t0 = Date.now(), ac = new AbortController();
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (res.flushHeaders) res.flushHeaders();
  let open = true; req.on && req.on('close', () => { open = false; });
  const emit = (event, data) => { if (!open) return; try { res.write('event: ' + event + '\ndata: ' + JSON.stringify(data) + '\n\n'); } catch (e) {} };
  const ping = setInterval(() => { if (open) { try { res.write(': keepalive\n\n'); } catch (e) {} } }, 12000);
  const timer = setTimeout(() => ac.abort(), DEADLINE);
  const finish = () => { clearInterval(ping); clearTimeout(timer); try { res.end(); } catch (e) {} };

  const effort = ['low', 'medium', 'high', 'xhigh', 'max'].includes(b.effort) && b.effort !== 'max' ? b.effort : EFFORT;
  emit('status', { step: 'start', msg: 'Claude Opus 5.5 is reading your brief', model: MODEL, effort });
  const r = await run(b, effort, auth(req), ac.signal, emit);
  const { text, thinking, stop, usage, used, err } = r;
  if (thinking) emit('thinking', { text: thinking.slice(-1600) });
  const ms = Date.now() - t0;
  if (err) { emit('error', errorFor(err, err.name === 'AbortError' || ac.signal.aborted)); return finish(); }
  if (stop === 'refusal') { emit('error', { code: 'refused', msg: 'Claude declined this brief. Describe a business decision that streaming data can inform.' }); return finish(); }
  let spec;
  try { spec = tidy(parseSpec(text)); }
  catch (e) { console.error('build: unreadable answer', stop, e.message, text.slice(0, 300)); emit('error', { code: stop === 'max_tokens' ? 'long' : 'parse', msg: 'The demo came back incomplete. Try again.' }); return finish(); }
  const id = newId();
  const record = { id, created: new Date().toISOString(), model: MODEL, effort, variant: used, ms, usage, ip: crypto.createHash('sha256').update(ip + '|rti').digest('hex').slice(0, 16),
    request: { mode: clean(b.mode, 10), fields: Object.fromEntries(Object.entries(b.fields || {}).map(([k, v]) => [k, clean(v, LIMIT[k] || 600)])), prompt: clean(b.prompt, LIMIT.prompt) }, spec };
  let saved = false;
  if (blobOn()) { try { await put('builder/demos/' + id + '.json', JSON.stringify(record, null, 1), { access: 'private', contentType: 'application/json', addRandomSuffix: false }); saved = true; } catch (e) { console.error('build: save failed', e && e.message); } }
  emit('demo', { id: saved ? id : null, spec, ms, effort });
  return finish();
}

/* ---------------------------------------------------------------- routes */
module.exports = async function handler(req, res) {
  const ip = String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || (req.socket && req.socket.remoteAddress) || '').split(',')[0].trim();
  const ready = !!process.env.DEMO_BUILDER_CODE && !!auth(req);
  if (req.method === 'GET') {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    if (q.status) return send(res, 200, { ok: true, ready, via: DIRECT ? 'anthropic' : 'gateway', model: MODEL, effort: EFFORT, store: blobOn() });
    if (q.selftest) {
      if (!ready) return send(res, 503, { ok: false, error: 'off' });
      if (!same(clean(q.code, LIMIT.code), process.env.DEMO_BUILDER_CODE)) return send(res, 403, { ok: false, error: 'code' });
      const cap = await takeBuild(); if (!cap.ok) return send(res, 429, { ok: false, error: 'cap' });
      const t0 = Date.now(), ac = new AbortController(), timer = setTimeout(() => ac.abort(), DEADLINE);
      const tb = { mode: 'questions', fields: { client: 'A regional grocery chain', industry: 'Retail', usecase: 'Demand forecasting', pain: 'Hot weekends empty the cold drinks aisle by noon, and the nightly forecast only sees it the next morning.' }, audience: 'Line of business leader', tone: 'Plain and concise', length: '1 minute' };
      const r = await run(tb, q.effort === 'max' ? 'max' : 'low', auth(req), ac.signal, () => {}); clearTimeout(timer);
      if (r.err) return send(res, 502, { ok: false, via: DIRECT ? 'anthropic' : 'gateway', model: MODEL, error: errorFor(r.err, ac.signal.aborted).code, status: r.err.status || null, detail: String(r.err.text || r.err.message || '').slice(0, 400) });
      let spec = null, parse = null; try { spec = tidy(parseSpec(r.text)); } catch (e) { parse = e.message; }
      return send(res, 200, { ok: !!spec, via: DIRECT ? 'anthropic' : 'gateway', model: MODEL, variant: r.used, ms: Date.now() - t0, stop: r.stop, usage: r.usage, thinking_chars: r.thinking.length, parse, title: spec && spec.title, steps: spec && spec.steps.length });
    }
    if (q.id) {
      if (!/^[a-z0-9]{10}$/.test(String(q.id))) return send(res, 404, { ok: false });
      const r = blobOn() ? await readJSON('builder/demos/' + q.id + '.json') : null;
      if (!r || !r.spec) return send(res, 404, { ok: false });
      return send(res, 200, { ok: true, id: r.id, created: r.created, spec: r.spec }, { cache: 'public, max-age=300, s-maxage=86400' });
    }
    if (q.key) {
      if (!same(String(q.key), process.env.CONTACT_KEY || '')) return send(res, 404, { ok: false });
      const blobs = []; let cursor;
      do { const r = await list({ prefix: 'builder/demos/', cursor, limit: 1000 }); blobs.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
      blobs.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
      const rows = (await Promise.all(blobs.slice(0, 300).map((x) => readJSON(x.pathname)))).filter(Boolean).map((r) => ({
        id: r.id, created: r.created, link: 'https://realtimeintelligence.io/build?d=' + r.id, title: r.spec && r.spec.title, client: r.spec && r.spec.client,
        industry: r.spec && r.spec.industry, use_case: r.spec && r.spec.use_case, seconds: Math.round((r.ms || 0) / 1000), output_tokens: r.usage && r.usage.output_tokens, request: r.request }));
      return send(res, 200, { ok: true, count: rows.length, demos: rows });
    }
    return send(res, 404, { ok: false });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { ok: false }); }
  const b = await readBody(req);
  if (!ready) return send(res, 503, { ok: false, error: 'off', msg: 'Building is not switched on yet. The site owner needs to add an access code.' });
  if (!same(clean(b.code, LIMIT.code), process.env.DEMO_BUILDER_CODE)) return send(res, 403, { ok: false, error: 'code', msg: 'That access code did not work. Ask your team for the seller code.' });
  if (!hasBrief(b)) return send(res, 400, { ok: false, error: 'brief', msg: 'Tell us at least the client\'s pain point, or describe the demo in your own words.' });
  if (tooFast(ip)) return send(res, 429, { ok: false, error: 'fast', msg: 'That is a lot of builds in a few minutes. Try again shortly.' });
  const cap = await takeBuild();
  if (!cap.ok) return send(res, 429, { ok: false, error: 'cap', msg: 'Today\'s builds are used up. Try again tomorrow.' });
  return build(req, res, b, ip);
};
module.exports._test = { tidy, parseSpec, brief, SCHEMA, SYSTEM };
