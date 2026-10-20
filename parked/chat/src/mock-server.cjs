// Local test rig: a simulated Confluent Cloud (control plane and Flink SQL API) plus the site with its two API routes.
//   node mock/server.cjs [port] [ea=1|0]
// Site on http://127.0.0.1:<port>, simulated Confluent on <port+1>. Records notifications and leads in memory.
const http = require('http'), fs = require('fs'), path = require('path'), url = require('url');
const PORT = +(process.argv[2] || 8800), CPORT = PORT + 1, EA = (process.argv[3] || '1') !== '0';
const ROOT = path.resolve(__dirname, '..'), REPO = '/home/claude/realtimeai';
process.env.CONFLUENT_API_BASE = 'http://127.0.0.1:' + CPORT;
process.env.CONFLUENT_FLINK_RE = '^http://127\\.0\\.0\\.1:' + CPORT + '/flink$';
process.env.NOTIFY_WEBHOOK = 'http://127.0.0.1:' + CPORT + '/hook';
process.env.ANTHROPIC_API_KEY = process.env.NOKEY ? '' : 'test-key';
process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:' + (PORT + 2);
const claude = require('./claude.cjs'); claude.start(PORT + 2);
const Module = require('module'), orig = Module._load, BLOBS = {};
Module._load = function (r, ...a) {
  if (r === '@vercel/blob') return {
    put: async (p, body) => { BLOBS[p] = body; return { pathname: p }; },
    list: async () => ({ blobs: Object.keys(BLOBS).map((p) => ({ pathname: p })), hasMore: false }),
    get: async (p) => ({ stream: require('stream').Readable.from([BLOBS[p]]) }), del: async (p) => { delete BLOBS[p]; },
  };
  return orig.call(this, r, ...a);
};
let confluent = null; try { confluent = require(REPO + '/api/confluent.js'); } catch (e) {} const contact = require(REPO + '/api/contact.js');
const chat = require(REPO + '/api/chat.js');
// run a web-signature handler (Request in, Response out) behind a plain Node server, streaming the body
async function web(h, req, res) {
  const chunks = []; for await (const c of req) chunks.push(c);
  const ac = new AbortController(); res.on('close', () => { if (!res.writableFinished) ac.abort(); });
  const headers = {}; for (const [k, v] of Object.entries(req.headers)) headers[k] = Array.isArray(v) ? v.join(', ') : v;
  if (!headers['x-forwarded-for']) headers['x-forwarded-for'] = req.socket.remoteAddress;
  const request = new Request('http://127.0.0.1:' + PORT + req.url, { method: req.method, headers, body: /^(GET|HEAD)$/.test(req.method) ? undefined : Buffer.concat(chunks), signal: ac.signal });
  const fn = h[req.method]; if (!fn) { res.writeHead(405); return res.end(); }
  const r = await fn(request);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  if (!r.body) return res.end();
  const rd = r.body.getReader();
  try { for (;;) { const { value, done } = await rd.read(); if (done) break; res.write(value); } } catch (e) { /* aborted */ }
  res.end();
}
const LOG = { calls: [], hooks: [], leads: BLOBS, secretsSeen: 0 };

/* ---------- simulated Confluent ---------- */
const S = { envs: [{ id: 'env-111', display_name: 'default' }], pools: [], keys: {}, stmts: {}, polls: {} };
const T0 = Math.floor(Date.now() / 5000) * 5000 - 60000;
const CLOUD = 'Basic ' + Buffer.from('CLOUDKEY123:cloudsecret').toString('base64');
function j(res, code, body) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(body == null ? '' : JSON.stringify(body)); }
function body(req) { return new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => { try { r(b ? JSON.parse(b) : {}); } catch (e) { r({}); } }); }); }
const T = (t) => ({ type: t, nullable: true });
const ORDERS_SCHEMA = { columns: [{ name: 'order_id', type: T('VARCHAR') }, { name: 'customer_id', type: T('INTEGER') }, { name: 'product_id', type: T('VARCHAR') }, { name: 'price', type: T('DOUBLE') }] };
const FC_SCHEMA = { columns: [{ name: 'window_time', type: T('TIMESTAMP_WITH_LOCAL_TIME_ZONE') }, { name: 'revenue', type: T('DOUBLE') },
  { name: 'forecast', type: { type: 'ROW', nullable: true, fields: [
    { name: 'forecast', field_type: { type: 'ARRAY', element_type: { type: 'ROW', fields: [
      { name: 'timestamp', field_type: T('TIMESTAMP') }, { name: 'mean', field_type: T('DOUBLE') }, { name: 'q10', field_type: T('DOUBLE') }, { name: 'q50', field_type: T('DOUBLE') }, { name: 'q90', field_type: T('DOUBLE') }] } } },
    { name: 'metadata', field_type: T('VARCHAR') }] } }] };
const AD_SCHEMA = { columns: [{ name: 'window_time', type: T('TIMESTAMP_WITH_LOCAL_TIME_ZONE') }, { name: 'revenue', type: T('DOUBLE') },
  { name: 'anomaly', type: { type: 'ROW', nullable: true, fields: ['aic', 'actual_value', 'forecast_value', 'is_anomaly', 'lower_bound', 'rmse', 'timestamp', 'upper_bound'].map((n) => ({ name: n, field_type: T(n === 'is_anomaly' ? 'BOOLEAN' : n === 'timestamp' ? 'TIMESTAMP' : 'DOUBLE') })) } }] };
const fmt = (ms) => new Date(ms).toISOString().replace('T', ' ').replace('Z', '');
function rev(i) { return 400 + 120 * Math.sin(i / 4) + (i === 33 ? 900 : 0) + ((i * 37) % 23); }
function rowsFor(st, from, to) {
  const out = [];
  for (let i = from; i < to; i++) {
    if (st.kind === 'orders') out.push({ op: 0, row: ['o-' + (1000 + i), String(3000 + (i * 7) % 50), 'p-' + (i % 9), String((10 + (i * 13) % 90) + 0.5)] });
    else {
      const t = st.t0 + i * 5000, v = rev(i);
      if (st.kind === 'forecast') {
        const f = i < 19 ? null : [Array.from({ length: 10 }, (_, k) => [fmt(t + (k + 1) * 5000), String(rev(i + k + 1)), String(rev(i + k + 1) - 60), String(rev(i + k + 1)), String(rev(i + k + 1) + 60)]), '{"model":"ttm"}'];
        out.push({ op: 0, row: [fmt(t), String(v), f] });
      } else {
        const a = i < 19 ? null : [null, String(v), String(rev(i) - (i === 33 ? 900 : 0)), i === 33, String(rev(i) - 150 - (i === 33 ? 900 : 0)), '30', fmt(t), String(rev(i) + 150 - (i === 33 ? 900 : 0))];
        out.push({ op: 0, row: [fmt(t), String(v), a] });
      }
    }
  }
  return out;
}
const cserver = http.createServer(async (req, res) => {
  const u = url.parse(req.url, true), p = u.pathname, m = req.method, auth = req.headers.authorization || '';
  LOG.calls.push(m + ' ' + p);
  if (p === '/hook') { LOG.hooks.push(await body(req)); return j(res, 200, { ok: true }); }
  if (p.startsWith('/flink/')) {
    const fk = Object.values(S.keys).find((k) => auth === 'Basic ' + Buffer.from(k.id + ':' + k.secret).toString('base64'));
    if (!fk) return j(res, 401, { errors: [{ status: '401', detail: 'Unauthorized' }] });
    if (Date.now() - fk.at < 6000) return j(res, 401, { errors: [{ status: '401', detail: 'Unauthorized: key not active yet' }] });
    const mm = p.match(/^\/flink\/sql\/v1\/organizations\/([^/]+)\/environments\/([^/]+)\/statements(?:\/([^/]+))?(\/results)?$/);
    if (!mm) return j(res, 404, { errors: [{ detail: 'not found' }] });
    const name = mm[3];
    if (m === 'POST' && !name) {
      const b = await body(req); const sql = (b.spec && b.spec.statement) || '';
      if (!b.spec || !b.spec.compute_pool_id || !b.spec.properties || b.spec.properties['sql.current-catalog'] !== 'examples') return j(res, 400, { errors: [{ detail: 'bad request' }] });
      const kind = /AI_FORECAST/.test(sql) ? 'forecast' : /AI_DETECT_ANOMALIES/.test(sql) ? 'anomaly' : 'orders';
      S.stmts[b.name] = { name: b.name, kind, sql, at: Date.now(), t0: T0, sent: 0, deleted: false,
        fail: (kind !== 'orders' && !EA) ? 'SQL validation failed. Error while applying rule. No match found for function signature ' + (kind === 'forecast' ? 'AI_FORECAST' : 'AI_DETECT_ANOMALIES') + '(<NUMERIC>, <TIMESTAMP_WITH_LOCAL_TIME_ZONE>, <CHARACTER>)' : '' };
      return j(res, 200, { name: b.name, status: { phase: 'PENDING' } });
    }
    const st = S.stmts[name];
    if (!st || st.deleted) return j(res, 404, { errors: [{ detail: 'statement not found' }] });
    const limit = st.kind === 'orders' ? 40 : 72, age = Date.now() - st.at;
    const avail = Math.min(limit, Math.floor(Math.max(0, age - 1500) / (st.kind === 'orders' ? 120 : 250)));
    const phase = st.fail ? (age > 1500 ? 'FAILED' : 'PENDING') : age < 1200 ? 'PENDING' : st.sent >= limit ? 'COMPLETED' : 'RUNNING';
    if (m === 'DELETE') { st.deleted = true; return j(res, 202, null); }
    if (!mm[4]) return j(res, 200, { name, status: { phase, detail: st.fail && phase === 'FAILED' ? st.fail : '', traits: { schema: st.kind === 'orders' ? ORDERS_SCHEMA : st.kind === 'forecast' ? FC_SCHEMA : AD_SCHEMA } } });
    const tok = +(u.query.page_token || 0);
    if (tok !== st.sent) return j(res, 400, { errors: [{ detail: 'bad page token ' + tok + ' want ' + st.sent }] });
    const rows = rowsFor(st, st.sent, avail); st.sent = avail;
    const base = 'http://127.0.0.1:' + CPORT + p;
    return j(res, 200, { kind: 'StatementResult', metadata: { next: phase === 'COMPLETED' && !rows.length ? '' : base + '?page_token=' + st.sent }, results: { data: rows } });
  }
  if (auth !== CLOUD) return j(res, 401, { errors: [{ status: '401', detail: 'Unauthorized' }] });
  LOG.secretsSeen++;
  if (m === 'GET' && p === '/org/v2/organizations') return j(res, 200, { data: [{ id: 'f1e2d3c4-org', display_name: 'Acme Labs' }] });
  if (m === 'GET' && p === '/iam/v2/api-keys/CLOUDKEY123') return j(res, 200, { id: 'CLOUDKEY123', spec: { owner: { id: 'u-owner1', kind: 'User' } } });
  if (m === 'GET' && p === '/org/v2/environments') return j(res, 200, { data: S.envs });
  if (m === 'GET' && p.startsWith('/org/v2/environments/')) { const e = S.envs.find((x) => x.id === p.split('/').pop()); return e ? j(res, 200, e) : j(res, 404, { errors: [{ detail: 'no env' }] }); }
  if (m === 'POST' && p === '/org/v2/environments') { const e = { id: 'env-' + (S.envs.length + 200), display_name: (await body(req)).display_name }; S.envs.push(e); return j(res, 201, e); }
  if (m === 'GET' && p === '/fcpm/v2/regions') return j(res, 200, { data: ['us-east-1', 'us-west-2', 'eu-west-1'].map((r) => ({ id: 'aws.' + r, region_name: r, display_name: r, cloud: 'AWS', http_endpoint: 'http://127.0.0.1:' + CPORT + '/flink' })) });
  if (m === 'GET' && p === '/fcpm/v2/compute-pools') return j(res, 200, { data: S.pools.filter((x) => x.spec.environment.id === u.query.environment && !x.deleted).map((x) => Object.assign({}, x, { status: { phase: Date.now() - x.at > 7000 ? 'PROVISIONED' : 'PROVISIONING' } })) });
  if (m === 'POST' && p === '/fcpm/v2/compute-pools') { const b = await body(req); const x = { id: 'lfcp-' + (S.pools.length + 10), spec: b.spec, at: Date.now() }; S.pools.push(x); return j(res, 202, Object.assign({}, x, { status: { phase: 'PROVISIONING' } })); }
  if (p.startsWith('/fcpm/v2/compute-pools/')) {
    const x = S.pools.find((q) => q.id === p.split('/').pop() && !q.deleted); if (!x) return j(res, 404, { errors: [{ detail: 'no pool' }] });
    if (m === 'DELETE') { x.deleted = true; return j(res, 204, null); }
    return j(res, 200, Object.assign({}, x, { status: { phase: Date.now() - x.at > 7000 ? 'PROVISIONED' : 'PROVISIONING' } }));
  }
  if (m === 'POST' && p === '/iam/v2/api-keys') { const b = await body(req); const id = 'FLINKKEY' + (Object.keys(S.keys).length + 1); S.keys[id] = { id, secret: 'fsecret' + id, at: Date.now(), spec: b.spec }; return j(res, 202, { id, spec: { secret: 'fsecret' + id, owner: b.spec.owner, resource: b.spec.resource } }); }
  if (m === 'DELETE' && p.startsWith('/iam/v2/api-keys/')) { const id = p.split('/').pop(); if (S.keys[id]) { delete S.keys[id]; return j(res, 204, null); } return j(res, 404, { errors: [{ detail: 'no key' }] }); }
  return j(res, 404, { errors: [{ detail: 'mock: no route ' + m + ' ' + p }] });
});
cserver.listen(CPORT, '127.0.0.1');

/* ---------- the site ---------- */
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.onnx': 'application/octet-stream', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg' };
http.createServer(async (req, res) => {
  const u = url.parse(req.url, true);
  if (u.pathname === '/api/confluent' && confluent) return confluent(req, res);
  if (u.pathname === '/api/contact') return contact(req, res);
  if (u.pathname === '/api/chat') return web(chat, req, res);
  if (u.pathname === '/__claude') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(claude.LOG)); }
  if (u.pathname === '/__mock') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ calls: LOG.calls, hooks: LOG.hooks, leads: Object.values(BLOBS).map((b) => JSON.parse(b)), stmts: Object.values(S.stmts).map((s) => ({ name: s.name, kind: s.kind, deleted: s.deleted, sent: s.sent })), pools: S.pools.map((p) => ({ id: p.id, deleted: !!p.deleted })), keys: Object.keys(S.keys) })); }
  let f = path.join(ROOT, decodeURIComponent(u.pathname));
  if (u.pathname === '/' ) f = path.join(ROOT, 'index.html');
  if (u.pathname === '/playground') f = path.join(ROOT, 'playground.html');
  if (u.pathname === '/chat') f = path.join(ROOT, process.env.CHTEST ? 'chat.test.html' : 'chat.html');
  const type = TYPES[path.extname(f)] || ({ '.mp4': 'video/mp4', '.webm': 'video/webm', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.vtt': 'text/vtt' })[path.extname(f)] || 'application/octet-stream';
  const rg = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (rg) return fs.stat(f, (err, s) => { if (err) { res.writeHead(404); return res.end('nf'); }
    const a = rg[1] ? +rg[1] : Math.max(0, s.size - +rg[2]), b = rg[1] && rg[2] ? Math.min(+rg[2], s.size - 1) : s.size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': 'bytes ' + a + '-' + b + '/' + s.size, 'Content-Length': b - a + 1 });
    fs.createReadStream(f, { start: a, end: b }).pipe(res); });
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); return res.end('nf'); } res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes' }); res.end(data); });
}).listen(PORT, '127.0.0.1', () => console.log('site on', PORT, 'confluent mock on', CPORT, 'early access', EA));
