// v1.4.0 (B): /api/sync/* against the in-memory store (no network). Real HTTP through Express on an ephemeral port.
const assert = require('assert'); const http = require('http'); const express = require('express');
const createSync = require('../server/sync.js'); const { memStore } = require('../server/syncstore.js'); const D = require('../server/syncdata.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const PEPPER = 'test-pepper-0123456789abcdef';
const quiet = { log() {}, warn() {}, error() {} };
const DATA = { v: 6, sports: ['nfl', 'mlb'], sportsChosen: true, sport: 'nfl', follow: ['nfl:12', 'mlb:a9'], muteTeams: ['Dallas'], muteKeywords: ['odds', 'parlay'], theme: 'dark', watch: { providers: ['yttv'] } };

async function boot(opts = {}) {
  const clock = { t: 1_800_000_000_000 }; const now = () => clock.t;
  const store = opts.store || memStore({ now }); const logs = [];
  const log = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
  const sync = createSync({ env: opts.env || { SYNC_PEPPER: PEPPER }, store, now, log, retryMs: 15000, limits: opts.limits });
  const app = express(); app.set('trust proxy', 1); app.use('/api/sync', sync.router); app.get('/api/other', (req, res) => res.json({ fine: true }));
  const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (method, path, { body, headers = {}, raw, ip } = {}) => {
    const r = await fetch(base + path, { method, headers: { ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}), ...headers }, body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch {} return { status: r.status, json: j, text, headers: r.headers };
  };
  return { sync, store, clock, logs, call, base, close: () => new Promise((r) => srv.close(r)) };
}
const auth = (code) => ({ Authorization: `Sync ${code}` });

(async () => {
  // ---------- happy path ----------
  {
    const t = await boot(); await t.sync.init(); ok(t.sync.ready, 'migrated at init');
    let r = await t.call('GET', '/api/sync/status'); eq(r.json, { enabled: true, ready: true }, 'status'); ok(/no-store/.test(r.headers.get('cache-control')), 'no-store');
    r = await t.call('POST', '/api/sync', { body: { data: DATA } }); eq(r.status, 201, 'create'); ok(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(r.json.code), 'code format'); eq(r.json.rev, 1, 'rev 1');
    const code = r.json.code; const raw = D.normalizeCode(code);
    // the code is never stored: ids are hashes, rows never contain it
    const ids = [...t.store._rows.keys()]; eq(ids.length, 1, 'one row'); ok(ids[0] !== raw && !ids[0].includes(raw) && /^[0-9a-f]{64}$/.test(ids[0]), 'row id is the HMAC, not the code'); ok(!JSON.stringify([...t.store._rows.values()]).includes(raw), 'row contents never include the code');
    eq(ids[0], D.hashCode(PEPPER, raw), 'id = HMAC(pepper, normalized code)');
    r = await t.call('POST', '/api/sync/lookup', { body: { code: code.toLowerCase().replace(/-/g, ' ') } }); eq(r.status, 200, 'lookup with sloppy typing'); eq(r.json.summary, { sports: 2, teams: 1, players: 1, mutes: 3 }, 'summary only'); ok(!('data' in r.json), 'lookup returns no payload');
    r = await t.call('GET', '/api/sync/profile', { headers: auth(code) }); eq(r.status, 200, 'get'); eq(r.json.data, DATA, 'round-trips'); eq(r.json.rev, 1, 'rev');
    r = await t.call('PUT', '/api/sync/profile', { headers: { ...auth(code), 'If-Match': '1' }, body: { data: { ...DATA, theme: 'light' } } }); eq(r.status, 200, 'put'); eq(r.json.rev, 2, 'rev bumped');
    r = await t.call('PUT', '/api/sync/profile', { headers: { ...auth(code), 'If-Match': '"2"' }, body: { data: { ...DATA, theme: 'system' } } }); eq(r.json.rev, 3, 'quoted If-Match accepted');
    // conflict: stale rev gets the current copy back
    r = await t.call('PUT', '/api/sync/profile', { headers: { ...auth(code), 'If-Match': '1' }, body: { data: { ...DATA, theme: 'dark' } } }); eq(r.status, 409, 'stale write conflicts'); eq(r.json.rev, 3, '409 carries current rev'); eq(r.json.data.theme, 'system', '409 carries current data');
    r = await t.call('GET', '/api/sync/profile', { headers: auth(code) }); eq(r.json.data.theme, 'system', 'conflicting write changed nothing');
    r = await t.call('PUT', '/api/sync/profile', { headers: auth(code), body: { data: { ...DATA, theme: 'dark' } } }); eq(r.status, 200, 'no If-Match = overwrite'); eq(r.json.rev, 4, 'rev 4');
    r = await t.call('DELETE', '/api/sync/profile', { headers: auth(code) }); eq(r.status, 204, 'delete'); eq(await t.store.size(), 0, 'row gone');
    r = await t.call('GET', '/api/sync/profile', { headers: auth(code) }); eq(r.status, 404, 'gone after delete'); r = await t.call('DELETE', '/api/sync/profile', { headers: auth(code) }); eq(r.status, 404, 'delete twice -> 404');
    await t.close();
  }

  // ---------- uniform not-found, malformed input ----------
  {
    const t = await boot(); await t.sync.init(); const { json: { code } } = await t.call('POST', '/api/sync', { body: { data: DATA } });
    const other = D.formatCode(D.newCode()); const bodies = new Set();
    for (const c of [other, 'nonsense', '', '7K2M-9QXU-4TRA', 'x'.repeat(100)]) { const r = await t.call('POST', '/api/sync/lookup', { body: { code: c } }); eq(r.status, 404, `lookup ${c.slice(0, 10)} -> 404`); bodies.add(r.text); }
    for (const h of [auth(other), { Authorization: 'Sync nonsense' }, { Authorization: 'Bearer abc' }, {}]) { const r = await t.call('GET', '/api/sync/profile', { headers: h }); eq(r.status, 404, 'get with wrong credentials -> 404'); bodies.add(r.text); }
    eq(bodies.size, 1, 'unknown, malformed and missing credentials give one identical response');
    let r = await t.call('POST', '/api/sync/lookup', { body: {} }); eq(r.status, 404, 'no code'); r = await t.call('POST', '/api/sync/lookup', { raw: '{bad json' }); eq(r.status, 400, 'bad JSON'); eq(r.json, { error: 'bad request' }, 'bad JSON message');
    r = await t.call('PUT', '/api/sync/profile', { headers: { ...auth(code), 'If-Match': 'abc' }, body: { data: DATA } }); eq(r.status, 400, 'bad If-Match');
    r = await t.call('PUT', '/api/sync/profile', { headers: auth(other), body: { data: DATA } }); eq(r.status, 404, 'put to unknown code'); eq(await t.store.size(), 1, 'and nothing was created');
    r = await t.call('POST', '/api/sync', { body: { data: { theme: 'neon' } } }); eq(r.status, 400, 'invalid data refused'); eq(await t.store.size(), 1, 'nothing created');
    r = await t.call('POST', '/api/sync', { raw: JSON.stringify({ data: { muteKeywords: Array(400).fill('k'.repeat(110)) } }) }); ok([400, 413].includes(r.status), 'oversized refused');
    r = await t.call('POST', '/api/sync', { raw: JSON.stringify({ data: { muteKeywords: ['x'.repeat(60000)] } }) }); eq(r.status, 413, 'body over 40 KB -> 413');
    r = await t.call('PUT', '/api/sync/profile', { headers: auth(code), body: { data: { sports: 'nfl' } } }); eq(r.status, 400, 'invalid data on PUT refused'); r = await t.call('GET', '/api/sync/profile', { headers: auth(code) }); eq(r.json.data, DATA, 'stored copy untouched');
    await t.close();
  }

  // ---------- rate limits ----------
  {
    const t = await boot(); await t.sync.init(); let r;
    for (let i = 0; i < 5; i++) { r = await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '1.1.1.1' }); eq(r.status, 201, `create ${i + 1}/5`); }
    r = await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '1.1.1.1' }); eq(r.status, 429, '6th create from one address is refused'); ok(+r.headers.get('retry-after') > 0, 'Retry-After'); r = await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '2.2.2.2' }); eq(r.status, 201, 'another address is unaffected');
    t.clock.t += 3600e3 + 1; r = await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '1.1.1.1' }); eq(r.status, 201, 'window slides');
    for (let i = 0; i < 10; i++) { r = await t.call('POST', '/api/sync/lookup', { body: { code: 'AAAA-AAAA-AAAA' }, ip: '3.3.3.3' }); eq(r.status, 404, `lookup ${i + 1}/10`); }
    r = await t.call('POST', '/api/sync/lookup', { body: { code: 'AAAA-AAAA-AAAA' }, ip: '3.3.3.3' }); eq(r.status, 429, '11th lookup in a minute is refused'); t.clock.t += 61e3; r = await t.call('POST', '/api/sync/lookup', { body: { code: 'AAAA-AAAA-AAAA' }, ip: '3.3.3.3' }); eq(r.status, 404, 'minute later it works again');
    await t.close();
    // 30 failed attempts per hour per address, across endpoints; a good code from that address is then also held back
    const u = await boot({ limits: { lookupPerMin: 1000 } }); await u.sync.init(); const good = (await u.call('POST', '/api/sync', { body: { data: DATA }, ip: '9.9.9.9' })).json.code;
    for (let i = 0; i < 30; i++) await u.call('GET', '/api/sync/profile', { headers: auth(D.formatCode(D.newCode())), ip: '4.4.4.4' });
    r = await u.call('GET', '/api/sync/profile', { headers: auth(good), ip: '4.4.4.4' }); eq(r.status, 429, 'after 30 misses the address is paused, even with a valid code'); r = await u.call('GET', '/api/sync/profile', { headers: auth(good), ip: '5.5.5.5' }); eq(r.status, 200, 'other addresses fine');
    u.clock.t += 3600e3 + 1; r = await u.call('GET', '/api/sync/profile', { headers: auth(good), ip: '4.4.4.4' }); eq(r.status, 200, 'pause lifts after an hour');
    await u.close();
    const g = await boot({ limits: { createPerHour: 100, createGlobalPerHour: 3 } }); await g.sync.init(); for (let i = 0; i < 3; i++) eq((await g.call('POST', '/api/sync', { body: { data: DATA }, ip: `7.7.7.${i}` })).status, 201, 'global create budget'); eq((await g.call('POST', '/api/sync', { body: { data: DATA }, ip: '7.7.7.9' })).status, 429, 'global create cap'); await g.close();
  }

  // ---------- fail soft ----------
  {
    // not configured: the app keeps running, sync says so
    const t = await boot({ env: {} }); await t.sync.init(); let r = await t.call('GET', '/api/sync/status'); eq(r.json, { enabled: false, ready: false }, 'disabled status'); r = await t.call('POST', '/api/sync', { body: { data: DATA } }); eq(r.status, 503, 'create -> 503 when disabled'); eq(r.json.unavailable, true, 'unavailable flag'); r = await t.call('GET', '/api/other'); eq(r.json, { fine: true }, 'rest of the app unaffected'); await t.close();
    const s = await boot({ env: { SYNC_PEPPER: 'short' } }); eq(s.sync.enabled, false, 'pepper under 16 chars -> disabled'); await s.close();
    // database down at start, comes back later: migration retried lazily, not on every request
    const flaky = memStore(); let fail = true; let calls = 0; const m0 = flaky.migrate.bind(flaky); flaky.migrate = async () => { calls++; if (fail) throw new Error('connect ECONNREFUSED postgresql://user:hunter2@ep-host.neon.tech/db?sslmode=require'); return m0(); };
    const f = await boot({ store: flaky }); eq(await f.sync.init(), false, 'init resolves false, does not throw'); ok(!f.sync.ready, 'not ready');
    r = await f.call('GET', '/api/sync/status'); eq(r.json, { enabled: true, ready: false }, 'status while down'); r = await f.call('POST', '/api/sync', { body: { data: DATA } }); eq(r.status, 503, 'requests get 503 while the database is down'); r = await f.call('GET', '/api/other'); eq(r.status, 200, 'other routes still fine');
    const before = calls; for (let i = 0; i < 5; i++) await f.call('POST', '/api/sync/lookup', { body: { code: 'AAAA-AAAA-AAAA' } }); eq(calls, before, 'no migration hammering within the retry window');
    ok(!f.logs.join('\n').includes('hunter2') && !/postgres(ql)?:\/\//.test(f.logs.join('\n')), 'connection string never reaches the logs'); ok(f.logs.some((l) => /not ready/.test(l)), 'failure is logged');
    fail = false; f.clock.t += 16000; r = await f.call('POST', '/api/sync', { body: { data: DATA } }); eq(r.status, 201, 'recovers on its own once the database is back'); ok(f.sync.ready, 'ready'); await f.close();
    // database error mid-request -> 503, scrubbed
    const st = memStore(); const bad = await boot({ store: st }); await bad.sync.init(); st.read = async () => { throw new Error('boom postgres://u:pw@h/db'); };
    r = await bad.call('POST', '/api/sync/lookup', { body: { code: 'AAAA-AAAA-AAAA' } }); eq(r.status, 503, 'db error mid-request -> 503'); ok(!r.text.includes('pw') && !bad.logs.join('').includes(':pw@'), 'no secrets in response or logs'); await bad.close();
  }

  // ---------- purge ----------
  {
    const t = await boot(); await t.sync.init(); const a = (await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '1.0.0.1' })).json.code; await t.call('POST', '/api/sync', { body: { data: DATA }, ip: '1.0.0.2' });
    t.clock.t += 300 * 24 * 3600e3; await t.call('GET', '/api/sync/profile', { headers: auth(a) }); // reading keeps a backup alive
    t.clock.t += 100 * 24 * 3600e3; eq(await t.sync.purge(), undefined, 'purge runs'); eq(await t.store.size(), 1, 'only the untouched backup (400 days idle) was purged'); eq((await t.call('GET', '/api/sync/profile', { headers: auth(a) })).status, 200, 'active backup survives');
    await t.close();
  }

  console.log(`sync.test.js: ${n} assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });
