// Contact form endpoint for realtimeintelligence.io
//   POST /api/contact                 public, stores one lead privately in Vercel Blob
//   GET  /api/contact?key=KEY         CSV of every lead, newest first (add &format=json for JSON)
//   GET  /api/contact?key=KEY&check=1 confirms the store is writable and counts the leads
// KEY is the CONTACT_KEY environment variable. Without it the GET routes stay closed.
const crypto = require('crypto');
const { put, list, get, del } = require('@vercel/blob');

const LIMITS = { name: 120, email: 200, company: 160, notes: 4000, page: 200 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLUMNS = ['received', 'name', 'email', 'company', 'notes', 'country', 'page'];

const clean = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n);
const csvCell = (v) => { const s = String(v == null ? '' : v); return /[",\r\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };

function send(res, code, body, type) {
  res.statusCode = code;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (type) { res.setHeader('Content-Type', type); return res.end(body); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(body));
}

function keyOk(k) {
  const want = process.env.CONTACT_KEY || '';
  if (!want || typeof k !== 'string' || !k) return false;
  const a = crypto.createHash('sha256').update(k).digest();
  const b = crypto.createHash('sha256').update(want).digest();
  return crypto.timingSafeEqual(a, b);
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

async function readLead(blob) {
  try {
    const r = await get(blob.pathname, { access: 'private', useCache: false });
    if (!r || !r.stream) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) { return null; }
}

async function allLeadBlobs() {
  const out = []; let cursor;
  do { const r = await list({ prefix: 'leads/', cursor, limit: 1000 }); out.push(...r.blobs); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
  return out.sort((a, b) => String(b.pathname).localeCompare(String(a.pathname)));
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
    res.statusCode = 204; return res.end();
  }

  if (req.method === 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const b = await readBody(req);
    // quiet drops for bots: the hidden field was filled, or the form was sent faster than a person types
    if (b.website || (typeof b.t === 'number' && b.t < 1500)) return send(res, 200, { ok: true });
    const lead = {
      received: new Date().toISOString(),
      name: clean(b.name, LIMITS.name),
      email: clean(b.email, LIMITS.email),
      company: clean(b.company, LIMITS.company),
      notes: clean(b.notes, LIMITS.notes),
      country: clean(req.headers['x-vercel-ip-country'], 8),
      page: clean(b.page, LIMITS.page),
    };
    if (!lead.name || !lead.company || !EMAIL.test(lead.email)) return send(res, 400, { ok: false, error: 'missing' });
    const id = lead.received.replace(/[:.]/g, '-') + '-' + crypto.randomBytes(4).toString('hex');
    try {
      await put('leads/' + id + '.json', JSON.stringify(lead, null, 2), { access: 'private', contentType: 'application/json', addRandomSuffix: false });
    } catch (e) {
      console.error('contact: store failed', e && e.message);
      return send(res, 500, { ok: false, error: 'store' });
    }
    return send(res, 200, { ok: true });
  }

  if (req.method === 'GET') {
    const q = req.query || Object.fromEntries(new URL(req.url, 'http://local').searchParams);
    if (!keyOk(q.key)) return send(res, 404, { ok: false });
    try {
      if (q.check) {
        const p = 'checks/' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.json';
        await put(p, '{}', { access: 'private', contentType: 'application/json', addRandomSuffix: false });
        await del(p);
        return send(res, 200, { ok: true, store: 'writable', leads: (await allLeadBlobs()).length });
      }
      const blobs = await allLeadBlobs();
      const leads = (await Promise.all(blobs.slice(0, 2000).map(readLead))).filter(Boolean);
      if (q.format === 'json') return send(res, 200, { ok: true, count: leads.length, leads });
      const csv = '﻿' + [COLUMNS.join(',')].concat(leads.map((l) => COLUMNS.map((c) => csvCell(l[c])).join(','))).join('\r\n') + '\r\n';
      res.setHeader('Content-Disposition', 'attachment; filename="realtimeintelligence-leads.csv"');
      return send(res, 200, csv, 'text/csv; charset=utf-8');
    } catch (e) {
      console.error('contact: read failed', e && e.message);
      return send(res, 500, { ok: false, error: 'store' });
    }
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return send(res, 405, { ok: false });
};
