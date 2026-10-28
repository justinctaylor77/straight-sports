// Recovery-code account sync (Option B of PROPOSAL-account-sync.md). Optional: when it is not configured or the database is
// unreachable the rest of the app is unaffected and /api/sync/* answers 503 "unavailable".
//
//   POST   /api/sync           { data }                       -> 201 { code, rev, updatedAt }   code is shown once, never stored
//   POST   /api/sync/lookup    { code }                       -> { summary, rev, updatedAt } | 404
//   GET    /api/sync/profile   Authorization: Sync <code>     -> { data, rev, updatedAt } | 404
//   PUT    /api/sync/profile   Authorization: Sync <code>, If-Match: <rev>, { data } -> { rev, updatedAt } | 409 { data, rev, updatedAt }
//   DELETE /api/sync/profile   Authorization: Sync <code>     -> 204
//   GET    /api/sync/status                                   -> { enabled, ready }
//
// Env: NEON_DATABASE_URL (or DATABASE_URL) and SYNC_PEPPER (16+ chars, random). SYNC_SCHEMA (default "public") picks the schema.
const express = require('express');
const crypto = require('crypto');
const D = require('./syncdata');
const { neonQuery, scrub } = require('./db');
const { pgStore } = require('./syncstore');

const YEAR_MS = 365 * 24 * 3600e3;
const NOT_FOUND = { error: 'not found' };

// sliding-window limiter kept in memory only (nothing about a visitor is written to the database)
function limiter(now) {
  const hits = new Map();
  return {
    // true when allowed (and counted)
    take(key, max, windowMs) {
      const t = now(); const a = (hits.get(key) || []).filter((x) => t - x < windowMs);
      if (a.length >= max) { hits.set(key, a); return false; }
      a.push(t); hits.set(key, a); return true;
    },
    count(key, windowMs) { const t = now(); return (hits.get(key) || []).filter((x) => t - x < windowMs).length; },
    sweep(maxAgeMs = 3600e3) { const t = now(); for (const [k, a] of hits) { const f = a.filter((x) => t - x < maxAgeMs); if (f.length) hits.set(k, f); else hits.delete(k); } },
  };
}

function createSync({ env = process.env, store = null, now = Date.now, retryMs = 15000, log = console, limits = {} } = {}) {
  const L = { lookupPerMin: 10, failedPerHour: 30, createPerHour: 5, createGlobalPerHour: 300, writePerMin: 60, ...limits };
  const pepper = typeof env.SYNC_PEPPER === 'string' && env.SYNC_PEPPER.length >= 16 ? env.SYNC_PEPPER : '';
  let configError = '';
  if (!store) {
    try {
      const q = neonQuery(env.NEON_DATABASE_URL || env.DATABASE_URL || '');
      if (q) store = pgStore(q, { schema: env.SYNC_SCHEMA || 'public' }); else configError = 'no database url';
    } catch (e) { configError = scrub(e.message); }
  }
  if (!pepper && !configError) configError = 'SYNC_PEPPER missing or too short';
  const enabled = !!store && !!pepper;
  const rl = limiter(now);

  // ---- readiness: migrate at start, and retry lazily if the database was unreachable ----
  let ready = false; let migrating = null; let lastTry = 0; let lastError = '';
  async function ensureReady() {
    if (!enabled) return false;
    if (ready) return true;
    if (migrating) return migrating;
    if (lastTry && now() - lastTry < retryMs) return false;
    lastTry = now();
    migrating = (async () => {
      try { await store.migrate(); ready = true; lastError = ''; return true; }
      catch (e) { lastError = scrub(e.message); log.error('sync: database not ready:', lastError); return false; }
      finally { migrating = null; }
    })();
    return migrating;
  }
  let timer = null;
  async function init() {
    if (!enabled) { log.warn(`sync: disabled (${configError})`); return false; }
    const ok = await ensureReady();
    if (ok) await purge();
    if (!timer) { timer = setInterval(() => { rl.sweep(); purge(); }, 24 * 3600e3); if (timer.unref) timer.unref(); }
    return ok;
  }
  async function purge() { try { if (ready) { const n = await store.purge(YEAR_MS); if (n) log.log(`sync: purged ${n} inactive backup(s)`); } } catch (e) { log.error('sync: purge failed:', scrub(e.message)); } }

  const idFor = (norm) => D.hashCode(pepper, norm);
  // codes that cannot be valid still cost one lookup of a random id, so "malformed" and "unknown" look the same from outside
  const lookupId = (code) => { const n = D.normalizeCode(code); return n ? idFor(n) : idFor(`x${crypto.randomBytes(8).toString('hex')}`); };

  const router = express.Router();
  router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(express.json({ limit: '40kb' }));

  const ip = (req) => req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
  const send = (res, status, body) => (status === 204 ? res.status(204).end() : res.status(status).json(body));
  const tooMany = (res, secs = 60) => { res.set('Retry-After', String(secs)); return send(res, 429, { error: 'too many attempts, try again later' }); };

  router.get('/status', async (req, res) => { const r = enabled ? await ensureReady() : false; send(res, 200, { enabled, ready: r }); });

  // everything below needs sync configured and the database reachable
  router.use(async (req, res, next) => {
    if (!enabled) return send(res, 503, { error: 'sync is not configured', unavailable: true });
    if (!(await ensureReady())) return send(res, 503, { error: 'sync is unavailable right now', unavailable: true });
    next();
  });
  const dbFail = (res, e) => { log.error('sync: database error:', scrub(e && e.message)); return send(res, 503, { error: 'sync is unavailable right now', unavailable: true }); };
  const recordMiss = (req) => rl.take(`miss:${ip(req)}`, 1e9, 3600e3);
  const blocked = (req) => rl.count(`miss:${ip(req)}`, 3600e3) >= L.failedPerHour;

  router.post('/', async (req, res) => {
    const v = D.sanitize(req.body && req.body.data); if (!v.ok) return send(res, v.status, { error: v.error });
    if (!rl.take(`create:${ip(req)}`, L.createPerHour, 3600e3) || !rl.take('create:*', L.createGlobalPerHour, 3600e3)) return tooMany(res, 600);
    try {
      for (let i = 0; i < 4; i++) {
        const code = D.newCode(); const made = await store.create(idFor(code), v.data);
        if (made) return send(res, 201, { code: D.formatCode(code), rev: made.rev, updatedAt: made.updatedAt });
      }
      return send(res, 503, { error: 'could not create a code, try again' });
    } catch (e) { return dbFail(res, e); }
  });

  router.post('/lookup', async (req, res) => {
    if (blocked(req) || !rl.take(`lookup:${ip(req)}`, L.lookupPerMin, 60e3)) return tooMany(res);
    try {
      const code = req.body && req.body.code; const r = await store.read(lookupId(code));
      if (!r || !D.normalizeCode(code)) { recordMiss(req); return send(res, 404, NOT_FOUND); }
      return send(res, 200, { summary: D.summarize(r.data), rev: r.rev, updatedAt: r.updatedAt });
    } catch (e) { return dbFail(res, e); }
  });

  const authCode = (req) => { const m = /^Sync\s+(.{1,64})$/i.exec(String(req.get('authorization') || '')); return m ? m[1] : ''; };
  const guard = (needWrite) => (req, res, next) => {
    if (blocked(req)) return tooMany(res);
    if (needWrite && !rl.take(`write:${ip(req)}`, L.writePerMin, 60e3)) return tooMany(res);
    next();
  };

  router.get('/profile', guard(false), async (req, res) => {
    try {
      const code = authCode(req); const r = await store.read(lookupId(code));
      if (!r || !D.normalizeCode(code)) { recordMiss(req); return send(res, 404, NOT_FOUND); }
      return send(res, 200, { data: r.data, rev: r.rev, updatedAt: r.updatedAt });
    } catch (e) { return dbFail(res, e); }
  });

  router.put('/profile', guard(true), async (req, res) => {
    const v = D.sanitize(req.body && req.body.data); if (!v.ok) return send(res, v.status, { error: v.error });
    const hdr = req.get('if-match'); let ifRev = null;
    if (hdr != null && hdr !== '') { if (!/^"?\d{1,9}"?$/.test(hdr.trim())) return send(res, 400, { error: 'bad If-Match' }); ifRev = Number(hdr.replace(/"/g, '')); }
    try {
      const code = authCode(req); const r = await store.write(lookupId(code), v.data, ifRev);
      if (r.status === 'missing' || !D.normalizeCode(code)) { recordMiss(req); return send(res, 404, NOT_FOUND); }
      if (r.status === 'conflict') return send(res, 409, { error: 'changed on another device', data: r.data, rev: r.rev, updatedAt: r.updatedAt });
      return send(res, 200, { rev: r.rev, updatedAt: r.updatedAt });
    } catch (e) { return dbFail(res, e); }
  });

  router.delete('/profile', guard(true), async (req, res) => {
    try {
      const code = authCode(req); const ok = await store.remove(lookupId(code));
      if (!ok || !D.normalizeCode(code)) { recordMiss(req); return send(res, 404, NOT_FOUND); }
      return send(res, 204);
    } catch (e) { return dbFail(res, e); }
  });

  // malformed JSON / oversized body
  router.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
    if (err && err.type === 'entity.too.large') return send(res, 413, { error: 'data too large' });
    return send(res, 400, { error: 'bad request' });
  });

  return { router, init, ensureReady, enabled, get ready() { return ready; }, get configError() { return configError; }, get lastError() { return lastError; }, store, purge };
}

module.exports = createSync;
