// Confluent Cloud helper for the playground's "we set it up with you" flow.
//   POST /api/confluent  { action, ... }  runs one step against Confluent Cloud's public API
//   GET  /api/confluent?probe=1           checks that Confluent's API answers from here
// The visitor's keys arrive in the request body, are used for that one call and are never stored or logged.
// Only Confluent's own hosts are called: api.confluent.cloud and flink.<region>.<cloud>.confluent.cloud.
// Browsers on other sites cannot call this endpoint: there is no CORS header.

const API = process.env.CONFLUENT_API_BASE || 'https://api.confluent.cloud'; // set only in local tests
const FLINK_HOST = process.env.CONFLUENT_FLINK_RE ? new RegExp(process.env.CONFLUENT_FLINK_RE)
  : /^https:\/\/flink\.[a-z0-9-]{2,40}\.(aws|gcp|azure)\.confluent\.cloud$/;
const ID = /^[A-Za-z0-9._-]{1,100}$/;
const NAME = /^[a-z0-9]([-a-z0-9]{0,90}[a-z0-9])?$/;
const REGION = /^[a-z0-9-]{2,40}$/;
const TAG = 'granite-playground';
const CATALOG = { 'sql.current-catalog': 'examples', 'sql.current-database': 'marketplace' };

class Bad extends Error { constructor(msg, status) { super(msg); this.status = status || 400; } }

function send(res, code, body) {
  res.statusCode = code;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = typeof req.body === 'string' ? req.body : Buffer.isBuffer(req.body) ? req.body.toString('utf8') : null;
  if (raw == null) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > 256 * 1024) break; chunks.push(c); }
    raw = Buffer.concat(chunks).toString('utf8');
  }
  try { return JSON.parse(raw || '{}'); } catch (e) { return {}; }
}
function basic(key, secret, what) {
  if (typeof key !== 'string' || typeof secret !== 'string' || !ID.test(key) || !secret || secret.length > 300) {
    throw new Bad('Paste the ' + (what || 'API') + ' key and secret.');
  }
  return 'Basic ' + Buffer.from(key + ':' + secret).toString('base64');
}
function need(v, re, label) { if (typeof v !== 'string' || !re.test(v)) throw new Bad('Missing or invalid ' + label + '.'); return v; }
function flinkBase(b) {
  const ep = String(b.endpoint || '').replace(/\/+$/, '');
  if (!FLINK_HOST.test(ep)) throw new Bad('Unknown Flink endpoint.');
  return ep + '/sql/v1/organizations/' + encodeURIComponent(need(b.org, ID, 'organization')) +
    '/environments/' + encodeURIComponent(need(b.env, ID, 'environment')) + '/statements';
}
function message(data, status) {
  if (data && Array.isArray(data.errors) && data.errors.length) {
    const e = data.errors[0];
    return String(e.detail || e.title || e.message || 'Confluent returned ' + status).slice(0, 400);
  }
  if (data && (data.message || data.error)) return String(data.message || data.error).slice(0, 400);
  return 'Confluent returned ' + status + '.';
}
async function call(method, url, authz, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 9000);
  try {
    const r = await fetch(url, {
      method, signal: ctl.signal,
      headers: Object.assign({ Accept: 'application/json' }, authz ? { Authorization: authz } : {},
        body ? { 'Content-Type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const txt = await r.text();
    let data = null;
    try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = { message: txt.slice(0, 300) }; }
    return { status: r.status, ok: r.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: { message: e.name === 'AbortError' ? 'Confluent did not answer in time.' : 'Could not reach Confluent.' } };
  } finally { clearTimeout(timer); }
}
function fail(r, hint) {
  const auth = r.status === 401 || r.status === 403;
  const e = new Bad(hint && r.status === 401 ? hint : (hint ? hint + ' ' : '') + message(r.data, r.status), auth ? r.status : 502);
  e.upstream = r.status;
  throw e;
}
const items = (r) => (r && r.data && Array.isArray(r.data.data) ? r.data.data : []);
const phaseOf = (r) => (r && r.data && r.data.status && (r.data.status.phase || r.data.status.state)) || '';

const actions = {
  // who the key belongs to, the organization, its environments and the AWS regions where Flink runs
  async connect(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const orgs = await call('GET', API + '/org/v2/organizations', A);
    if (!orgs.ok) fail(orgs, orgs.status === 401 ? 'Confluent did not accept this key. Check it is a Cloud resource management key.' : '');
    const org = items(orgs)[0];
    if (!org) throw new Bad('No organization found for this key.');
    const [me, envs, regions] = await Promise.all([
      call('GET', API + '/iam/v2/api-keys/' + encodeURIComponent(b.key), A),
      call('GET', API + '/org/v2/environments?page_size=100', A),
      call('GET', API + '/fcpm/v2/regions?cloud=AWS&page_size=100', A),
    ]);
    let owner = me.ok && me.data && me.data.spec && me.data.spec.owner ? { id: me.data.spec.owner.id, kind: me.data.spec.owner.kind || '' } : null;
    if (!owner) {
      const users = await call('GET', API + '/iam/v2/users?page_size=10', A);
      const u = items(users);
      if (u.length === 1) owner = { id: u[0].id, kind: 'User' };
    }
    return {
      org: { id: org.id, name: org.display_name || '' },
      owner,
      envs: items(envs).map((e) => ({ id: e.id, name: e.display_name || e.id })),
      regions: items(regions).map((r) => ({ id: r.id, region: r.region_name || String(r.id || '').replace(/^aws\./, ''),
        name: r.display_name || r.region_name || r.id, endpoint: r.http_endpoint || '' })).filter((r) => REGION.test(r.region)),
    };
  },
  // use the environment the visitor already has, or make one
  async env(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    if (b.envId) {
      const r = await call('GET', API + '/org/v2/environments/' + encodeURIComponent(need(b.envId, ID, 'environment')), A);
      if (!r.ok) fail(r, 'Could not open that environment.');
      return { env: { id: r.data.id, name: r.data.display_name || r.data.id }, created: false };
    }
    const r = await call('POST', API + '/org/v2/environments', A, { display_name: TAG, stream_governance_config: { package: 'ESSENTIALS' } });
    if (!r.ok) fail(r, 'Could not create an environment.');
    return { env: { id: r.data.id, name: r.data.display_name || TAG }, created: true };
  },
  // reuse a compute pool in the region, or create a small one
  async pool(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const env = need(b.env, ID, 'environment'), region = need(b.region, REGION, 'region');
    const list = await call('GET', API + '/fcpm/v2/compute-pools?environment=' + encodeURIComponent(env) + '&page_size=100', A);
    if (!list.ok) fail(list, 'Could not list compute pools.');
    const have = items(list).find((p) => p.spec && String(p.spec.cloud).toUpperCase() === 'AWS' && p.spec.region === region && phaseOf({ data: p }) !== 'DELETING');
    if (have) return { pool: { id: have.id, name: have.spec.display_name || have.id, cfu: have.spec.max_cfu }, phase: phaseOf({ data: have }), created: false };
    const r = await call('POST', API + '/fcpm/v2/compute-pools', A, { spec: { display_name: TAG, cloud: 'AWS', region, max_cfu: 5, environment: { id: env } } });
    if (!r.ok) fail(r, 'Could not create a compute pool.');
    return { pool: { id: r.data.id, name: TAG, cfu: 5 }, phase: phaseOf(r) || 'PROVISIONING', created: true };
  },
  async poolStatus(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const r = await call('GET', API + '/fcpm/v2/compute-pools/' + encodeURIComponent(need(b.pool, ID, 'compute pool')) + '?environment=' + encodeURIComponent(need(b.env, ID, 'environment')), A);
    if (!r.ok) fail(r, 'Could not read the compute pool.');
    return { phase: phaseOf(r) };
  },
  // a Flink key for this session, owned by the same account as the Cloud key
  async flinkKey(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const env = need(b.env, ID, 'environment'), region = need(b.region, REGION, 'region'), owner = need(b.owner, ID, 'key owner');
    const r = await call('POST', API + '/iam/v2/api-keys', A, { spec: {
      display_name: TAG + '-flink', description: 'Made by realtimeintelligence.io for one playground session. Safe to delete.',
      owner: { id: owner }, resource: { id: env + '.aws.' + region, api_version: 'fcpm/v2' } } });
    if (!r.ok) fail(r, 'Could not create a Flink key.');
    return { key: r.data.id, secret: r.data.spec && r.data.spec.secret };
  },
  async sql(b) {
    const F = basic(b.fkey, b.fsecret, 'Flink');
    const name = need(b.name, NAME, 'statement name');
    if (typeof b.statement !== 'string' || !b.statement.trim() || b.statement.length > 6000) throw new Bad('Missing statement.');
    const r = await call('POST', flinkBase(b), F, { name, spec: { statement: b.statement, compute_pool_id: need(b.pool, ID, 'compute pool'), properties: CATALOG } });
    if (!r.ok) fail(r);
    return { name, phase: phaseOf(r) || 'PENDING' };
  },
  async status(b) {
    const F = basic(b.fkey, b.fsecret, 'Flink');
    const r = await call('GET', flinkBase(b) + '/' + need(b.name, NAME, 'statement name'), F);
    if (!r.ok) fail(r);
    const s = (r.data && r.data.status) || {};
    return { phase: s.phase || '', detail: String(s.detail || '').slice(0, 600), schema: (s.traits && s.traits.schema) || null };
  },
  async results(b) {
    const F = basic(b.fkey, b.fsecret, 'Flink');
    const base = flinkBase(b) + '/' + need(b.name, NAME, 'statement name') + '/results';
    let url = base;
    if (b.next) {
      let n;
      try { n = new URL(String(b.next), base); } catch (e) { throw new Bad('Unexpected results link.'); }
      const want = new URL(base);
      if (n.origin !== want.origin || decodeURIComponent(n.pathname) !== decodeURIComponent(want.pathname)) throw new Bad('Unexpected results link.');
      url = want.origin + want.pathname + n.search;
    }
    const r = await call('GET', url, F);
    if (!r.ok) fail(r);
    const rows = (r.data && r.data.results && Array.isArray(r.data.results.data)) ? r.data.results.data.slice(0, 500) : [];
    return { rows, next: (r.data && r.data.metadata && r.data.metadata.next) || '' };
  },
  async stop(b) {
    const F = basic(b.fkey, b.fsecret, 'Flink');
    const r = await call('DELETE', flinkBase(b) + '/' + need(b.name, NAME, 'statement name'), F);
    if (!r.ok && r.status !== 404) fail(r);
    return { stopped: true };
  },
  async dropPool(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const r = await call('DELETE', API + '/fcpm/v2/compute-pools/' + encodeURIComponent(need(b.pool, ID, 'compute pool')) + '?environment=' + encodeURIComponent(need(b.env, ID, 'environment')), A);
    if (!r.ok && r.status !== 404) fail(r, 'Could not delete the compute pool.');
    return { deleted: true };
  },
  async dropKey(b) {
    const A = basic(b.key, b.secret, 'Cloud API');
    const r = await call('DELETE', API + '/iam/v2/api-keys/' + encodeURIComponent(need(b.id, ID, 'key id')), A);
    if (!r.ok && r.status !== 404) fail(r, 'Could not delete the Flink key.');
    return { deleted: true };
  },
};

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    if (!q.probe) return send(res, 404, { ok: false });
    const [api, flink] = await Promise.all([
      call('GET', API + '/org/v2/organizations'),
      call('GET', 'https://flink.us-east-1.aws.confluent.cloud/sql/v1/organizations/probe/environments/probe/statements'),
    ]);
    return send(res, 200, { ok: api.status > 0 && flink.status > 0, api: api.status, flink: flink.status });
  }
  if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return send(res, 405, { ok: false }); }
  const b = await readBody(req);
  const fn = Object.prototype.hasOwnProperty.call(actions, b.action) ? actions[b.action] : null;
  if (!fn) return send(res, 400, { ok: false, error: 'Unknown step.' });
  try {
    const out = await fn(b);
    return send(res, 200, Object.assign({ ok: true }, out));
  } catch (e) {
    if (!(e instanceof Bad)) console.error('confluent:', b.action, e && e.message);
    return send(res, e instanceof Bad ? e.status : 500, { ok: false, error: e.message || 'Something went wrong.', upstream: e.upstream || 0 });
  }
};
