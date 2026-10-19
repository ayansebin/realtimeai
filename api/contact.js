// Contact form endpoint for realtimeintelligence.io
//   POST /api/contact                 public, stores one lead privately in Vercel Blob
//                                     kind: contact (default), trial, early-access or feedback
//                                     early-access and feedback also notify the owner when one of these is set:
//                                     RESEND_API_KEY with NOTIFY_EMAIL (and optionally NOTIFY_FROM), or NOTIFY_WEBHOOK
//   GET  /api/contact?key=KEY         CSV of every lead, newest first (add &format=json for JSON)
//   GET  /api/contact?key=KEY&check=1 confirms the store is writable and counts the leads
// KEY is the CONTACT_KEY environment variable. Without it the GET routes stay closed.
const crypto = require('crypto');
const { put, list, get, del } = require('@vercel/blob');

const LIMITS = { name: 120, email: 200, company: 160, notes: 4000, page: 200, org: 80, region: 40 };
const KINDS = ['contact', 'trial', 'early-access', 'feedback'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const COLUMNS = ['received', 'kind', 'name', 'email', 'company', 'notes', 'org', 'region', 'rating', 'country', 'page'];

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

// tell the owner about an early access request or new feedback; best effort, never blocks the visitor
async function notify(lead) {
  const subject = lead.kind === 'early-access'
    ? 'Early Access request: ' + lead.company + ', org ' + (lead.org || 'unknown')
    : 'Playground feedback from ' + lead.company + (lead.rating ? ', ' + lead.rating + ' of 5' : '');
  const text = [
    subject, '',
    'Name: ' + lead.name, 'Email: ' + lead.email, 'Company: ' + lead.company,
    lead.org ? 'Confluent organization: ' + lead.org : '', lead.region ? 'Region: ' + lead.region : '',
    lead.rating ? 'Rating: ' + lead.rating + ' of 5' : '', lead.notes ? 'Notes: ' + lead.notes : '',
    'Country: ' + (lead.country || 'unknown'), 'Received: ' + lead.received, '',
    lead.kind === 'early-access' ? 'Turn on the Granite models for this organization, then reply to the visitor.' : '',
  ].filter((l, i, a) => l || (i > 0 && a[i - 1])).join('\n');
  const jobs = [];
  const timed = (p) => Promise.race([p, new Promise((r) => setTimeout(r, 4000))]);
  if (process.env.RESEND_API_KEY && process.env.NOTIFY_EMAIL) {
    jobs.push(timed(fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM || 'Real-time intelligence <onboarding@resend.dev>',
        to: process.env.NOTIFY_EMAIL.split(',').map((x) => x.trim()).filter(Boolean), reply_to: lead.email, subject, text }),
    })));
  }
  if (process.env.NOTIFY_WEBHOOK) {
    jobs.push(timed(fetch(process.env.NOTIFY_WEBHOOK, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text }) })));
  }
  if (!jobs.length) return false;
  const out = await Promise.allSettled(jobs);
  return out.some((o) => o.status === 'fulfilled' && o.value && o.value.ok);
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
    const kind = KINDS.indexOf(b.kind) >= 0 ? b.kind : 'contact';
    const rating = Math.round(Number(b.rating));
    const lead = {
      received: new Date().toISOString(),
      kind,
      name: clean(b.name, LIMITS.name),
      email: clean(b.email, LIMITS.email),
      company: clean(b.company, LIMITS.company),
      notes: clean(b.notes, LIMITS.notes),
      org: clean(b.org, LIMITS.org),
      region: clean(b.region, LIMITS.region),
      rating: rating >= 1 && rating <= 5 ? rating : '',
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
    let notified = false;
    if (kind === 'early-access' || kind === 'feedback') {
      try { notified = await notify(lead); } catch (e) { console.error('contact: notify failed', e && e.message); }
    }
    return send(res, 200, { ok: true, notified });
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
