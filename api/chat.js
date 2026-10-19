// Chat endpoint for realtimeintelligence.io/chat
//   GET  /api/chat   {ok, ready}, tells the page whether the chat is set up
//   POST /api/chat   {messages}, relays one turn to the Claude Messages API and streams it back as
//                    Server-Sent Events, one JSON object per event:
//                      {t:'start'}                          the model accepted the request
//                      {t:'text', d}                        a piece of the answer
//                      {t:'tool', id, name}                 the model started a tool call
//                      {t:'tool_input', id, name, input}    the tool call is complete, the browser runs it
//                      {t:'done', stop, content}            the whole assistant turn, to send back next time
//                      {t:'error', code}                    something failed mid-stream
// The tools run in the visitor's browser. This function holds the key, the system prompt and the limits.
// Env: ANTHROPIC_API_KEY (required), CHAT_MODEL (default claude-sonnet-5-5, claude-haiku-5-5 costs far less),
//      CHAT_MAX_TOKENS (default 1600), CHAT_EFFORT (low, medium or high, default medium).
// Thinking: Sonnet 5.5 runs with between_tools (no thinking before the answer, short notes between tool calls),
// Haiku 5.5 with thinking off. Both keep answers quick. Thinking blocks that do come back are returned to the browser
// untouched, because the next request in a tool loop has to send them back exactly as received.
const { SYSTEM, TOOLS, TOOL_NAMES } = require('./_lib/chat-prompt.js');

const API = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
const MODEL = process.env.CHAT_MODEL || 'claude-sonnet-5-5';
const MAX_TOKENS = Math.max(256, Math.min(8000, Number(process.env.CHAT_MAX_TOKENS) || 1600));
const EFFORT = /^(low|medium|high)$/.test(process.env.CHAT_EFFORT || '') ? process.env.CHAT_EFFORT : 'medium';
const THINKING = /^claude-sonnet-5-5/.test(MODEL) ? { type: 'between_tools' } : /^claude-haiku-5-5/.test(MODEL) ? { type: 'disabled' } : null;
const MAX_BODY = 400 * 1024, MAX_MESSAGES = 80, MAX_TEXT = 12000, MAX_RESULT = 16000;
const ORIGIN = /^https:\/\/(www\.)?realtimeintelligence\.io$|^https:\/\/realtimeai[a-z0-9-]*\.vercel\.app$|^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/;

// the system prompt and the tools are the same on every call, so they are cached
const CACHED_TOOLS = TOOLS.map((t, i) => (i === TOOLS.length - 1 ? Object.assign({}, t, { cache_control: { type: 'ephemeral' } }) : t));
const CACHED_SYSTEM = [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }];

const json = (code, body, extra) => new Response(JSON.stringify(body), {
  status: code,
  headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' }, extra || {}),
});

// A burst limit per visitor address. Each function instance keeps its own count, so this stops runaway loops
// and casual abuse, not a determined script. The spend limit on the API key is the real ceiling.
const HITS = new Map();
function limited(ip) {
  const now = Date.now();
  let h = HITS.get(ip);
  if (!h) { h = []; HITS.set(ip, h); }
  while (h.length && now - h[0] > 3600e3) h.shift();
  let lastMin = 0;
  for (let i = h.length - 1; i >= 0 && now - h[i] < 60e3; i--) lastMin++;
  if (lastMin >= 24 || h.length >= 200) return true;
  h.push(now);
  if (HITS.size > 5000) { for (const k of HITS.keys()) { HITS.delete(k); if (HITS.size < 4000) break; } }
  return false;
}

// keep only the block types a chat turn needs, trimmed to sane sizes
function cleanBlock(b, role) {
  if (!b || typeof b !== 'object') return null;
  if (b.type === 'text') { const t = String(b.text == null ? '' : b.text).slice(0, MAX_TEXT); return t.trim() ? { type: 'text', text: t } : null; }
  if (role === 'assistant') {
    if (b.type === 'tool_use' && typeof b.id === 'string' && TOOL_NAMES.has(b.name)) {
      return { type: 'tool_use', id: b.id.slice(0, 100), name: b.name, input: b.input && typeof b.input === 'object' && !Array.isArray(b.input) ? b.input : {} };
    }
    if (b.type === 'thinking' && typeof b.signature === 'string') return { type: 'thinking', thinking: String(b.thinking || ''), signature: b.signature };
    if (b.type === 'redacted_thinking' && typeof b.data === 'string') return { type: 'redacted_thinking', data: b.data };
    return null;
  }
  if (b.type === 'tool_result' && typeof b.tool_use_id === 'string') {
    const c = typeof b.content === 'string' ? b.content : JSON.stringify(b.content == null ? '' : b.content);
    const o = { type: 'tool_result', tool_use_id: b.tool_use_id.slice(0, 100), content: c.slice(0, MAX_RESULT) };
    if (b.is_error) o.is_error = true;
    return o;
  }
  return null;
}

function cleanMessages(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const m of list.slice(-MAX_MESSAGES)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const raw = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : Array.isArray(m.content) ? m.content : [];
    const blocks = raw.map((b) => cleanBlock(b, m.role)).filter(Boolean);
    if (!blocks.length) continue;
    const last = out[out.length - 1];
    if (last && last.role === m.role) last.content.push(...blocks);
    else out.push({ role: m.role, content: blocks });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  // a trimmed history must not open with results for tool calls it no longer contains
  if (out.length && out[0].content.some((b) => b.type === 'tool_result')) {
    out[0].content = out[0].content.filter((b) => b.type !== 'tool_result');
    if (!out[0].content.length) out.shift();
    while (out.length && out[0].role !== 'user') out.shift();
  }
  if (!out.length || out[out.length - 1].role !== 'user') return null;
  return out;
}

async function readJSON(request) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return { tooBig: true };
  const text = await request.text();
  if (text.length > MAX_BODY) return { tooBig: true };
  try { return JSON.parse(text || '{}'); } catch (e) { return {}; }
}

// Anthropic sends Server-Sent Events; this yields each parsed data object
async function* events(body) {
  const reader = body.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
      let data = '';
      for (const line of chunk.split('\n')) if (line.startsWith('data:')) data += line.slice(5).trimStart();
      if (!data) continue;
      try { yield JSON.parse(data); } catch (e) { /* a malformed line is skipped */ }
    }
  }
}

function upstreamError(status, body) {
  const type = body && body.error && body.error.type, msg = String((body && body.error && body.error.message) || '');
  if (status === 401 || status === 403) return { code: 503, error: 'not_configured' };
  if (status === 402 || /credit|billing|spend|usage limit|quota/i.test(msg)) return { code: 503, error: 'unavailable' };
  if (status === 429) return { code: 429, error: 'busy' };
  if (status === 529 || type === 'overloaded_error') return { code: 503, error: 'overloaded' };
  if (status === 413 || type === 'request_too_large') return { code: 413, error: 'too_long' };
  if (status === 400) return { code: 400, error: /signature|thinking/i.test(msg) ? 'thinking' : 'bad_request', detail: msg.slice(0, 240) };
  return { code: 502, error: 'upstream' };
}

async function GET() {
  return json(200, { ok: true, ready: !!process.env.ANTHROPIC_API_KEY });
}

async function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } });
}

async function POST(request) {
  const origin = request.headers.get('origin') || '';
  if (!ORIGIN.test(origin)) return json(403, { ok: false, error: 'origin' });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(503, { ok: false, error: 'not_configured' });
  const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'unknown';
  if (limited(ip)) return json(429, { ok: false, error: 'busy' }, { 'Retry-After': '60' });

  const b = await readJSON(request);
  if (b.tooBig) return json(413, { ok: false, error: 'too_long' });
  const messages = cleanMessages(b.messages);
  if (!messages) return json(400, { ok: false, error: 'bad_request' });

  // cache the conversation so far too, so each tool round trip only pays for what is new
  const lastMsg = messages[messages.length - 1], lastBlock = lastMsg.content[lastMsg.content.length - 1];
  lastMsg.content[lastMsg.content.length - 1] = Object.assign({}, lastBlock, { cache_control: { type: 'ephemeral' } });

  const payload = { model: MODEL, max_tokens: MAX_TOKENS, system: CACHED_SYSTEM, tools: CACHED_TOOLS, messages, stream: true, output_config: { effort: EFFORT } };
  if (THINKING) payload.thinking = THINKING;

  const ctrl = new AbortController();
  if (request.signal) request.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  let up;
  try {
    up = await fetch(API + '/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e) {
    console.error('chat: upstream unreachable', e && e.message);
    return json(502, { ok: false, error: 'upstream' });
  }
  if (!up.ok) {
    let body = null; try { body = await up.json(); } catch (e) { /* not JSON */ }
    const m = upstreamError(up.status, body);
    console.error('chat: upstream', up.status, body && body.error && body.error.type, (body && body.error && body.error.message || '').slice(0, 300));
    const extra = m.code === 429 ? { 'Retry-After': up.headers.get('retry-after') || '30' } : null;
    return json(m.code, { ok: false, error: m.error, detail: m.detail }, extra);
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o) => { try { controller.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); } catch (e) { /* the visitor left */ } };
      const blocks = [];
      let stop = null, usage = {}, failed = false;
      try {
        for await (const ev of events(up.body)) {
          if (ev.type === 'message_start') { usage = Object.assign({}, ev.message && ev.message.usage); send({ t: 'start' }); }
          else if (ev.type === 'content_block_start') {
            const cb = Object.assign({}, ev.content_block);
            if (cb.type === 'tool_use') { cb.input = {}; cb._json = ''; send({ t: 'tool', id: cb.id, name: cb.name }); }
            if (cb.type === 'text') cb.text = cb.text || '';
            if (cb.type === 'thinking') { cb.thinking = cb.thinking || ''; cb.signature = cb.signature || ''; send({ t: 'thinking' }); }
            blocks[ev.index] = cb;
          } else if (ev.type === 'content_block_delta') {
            const cb = blocks[ev.index], d = ev.delta || {};
            if (!cb) continue;
            if (d.type === 'text_delta') { cb.text += d.text; send({ t: 'text', d: d.text }); }
            else if (d.type === 'input_json_delta') cb._json += d.partial_json || '';
            else if (d.type === 'thinking_delta') cb.thinking += d.thinking || '';
            else if (d.type === 'signature_delta') cb.signature += d.signature || '';
          } else if (ev.type === 'content_block_stop') {
            const cb = blocks[ev.index];
            if (cb && cb.type === 'tool_use') {
              try { cb.input = cb._json ? JSON.parse(cb._json) : {}; } catch (e) { cb.input = {}; }
              delete cb._json;
              send({ t: 'tool_input', id: cb.id, name: cb.name, input: cb.input });
            }
          } else if (ev.type === 'message_delta') {
            if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason;
            if (ev.usage) Object.assign(usage, ev.usage);
          } else if (ev.type === 'ping') {
            try { controller.enqueue(enc.encode(': ping\n\n')); } catch (e) { /* gone */ }
          } else if (ev.type === 'error') {
            failed = true;
            const t = ev.error && ev.error.type;
            send({ t: 'error', code: t === 'overloaded_error' ? 'overloaded' : t === 'rate_limit_error' ? 'busy' : 'upstream' });
            break;
          }
        }
        if (!failed) {
          const content = blocks.filter(Boolean).map((cb) => {
            if (cb.type === 'text') return { type: 'text', text: cb.text };
            if (cb.type === 'tool_use') return { type: 'tool_use', id: cb.id, name: cb.name, input: cb.input };
            if (cb.type === 'thinking') return { type: 'thinking', thinking: cb.thinking, signature: cb.signature };
            if (cb.type === 'redacted_thinking') return { type: 'redacted_thinking', data: cb.data };
            return null;
          }).filter((x) => x && (x.type !== 'text' || x.text));
          send({ t: 'done', stop: stop || 'end_turn', content });
        }
      } catch (e) {
        if (!ctrl.signal.aborted) { console.error('chat: stream failed', e && e.message); send({ t: 'error', code: 'upstream' }); }
      }
      console.log(JSON.stringify({ chat: 'turn', model: MODEL, stop, in: usage.input_tokens, out: usage.output_tokens,
        cache_read: usage.cache_read_input_tokens, cache_write: usage.cache_creation_input_tokens, msgs: messages.length,
        country: request.headers.get('x-vercel-ip-country') || '' }));
      try { controller.close(); } catch (e) { /* already closed */ }
    },
    cancel() { ctrl.abort(); },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no', 'X-Robots-Tag': 'noindex' },
  });
}

module.exports = { GET, POST, OPTIONS };
