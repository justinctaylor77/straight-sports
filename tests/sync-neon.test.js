// v1.4.0 (B): the Postgres adapter against real Neon over HTTPS. Skipped when NEON_DATABASE_URL is not set.
// Uses a throwaway schema (sync_test_<random>) that is dropped at the end, so production tables are never touched.
const assert = require('assert'); const crypto = require('crypto'); const express = require('express');
if (!process.env.NEON_DATABASE_URL) { console.log('sync-neon.test.js: skipped (no NEON_DATABASE_URL)'); process.exit(0); }
const { neonQuery } = require('../server/db.js'); const { pgStore } = require('../server/syncstore.js'); const createSync = require('../server/sync.js'); const D = require('../server/syncdata.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const SCHEMA = `sync_test_${crypto.randomBytes(5).toString('hex')}`; const q = neonQuery(process.env.NEON_DATABASE_URL);
const store = pgStore(q, { schema: SCHEMA }); const DATA = { v: 6, sports: ['nfl'], sportsChosen: true, follow: ['nfl:1', 'golf:5'], muteKeywords: ['odds'], theme: 'dark', watch: { providers: ['yttv'] } };
(async () => {
  try {
    ok(/^sync_test_[0-9a-f]{10}$/.test(SCHEMA), 'test schema name'); try { pgStore(q, { schema: 'x"; drop table y; --' }); assert.fail('accepted bad schema'); } catch (e) { ok(/bad schema/.test(e.message), 'schema name is validated'); }
    await store.migrate(); await store.migrate(); n++; // idempotent
    const tables = await q('select table_name from information_schema.tables where table_schema = $1', [SCHEMA]); eq(tables.map((t) => t.table_name), ['profiles'], 'only profiles table, inside the test schema');
    const pub = await q("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = 'profiles'"); const pubBefore = pub[0].n; ok(pubBefore <= 1, 'test never creates tables in public (live app owns public.profiles since the v1.4.0 deploy)');
    const a = await store.create('id-a', DATA); eq(a.rev, 1, 'create'); ok(a.updatedAt > 1.7e12, 'updatedAt is epoch ms'); eq(await store.create('id-a', DATA), null, 'duplicate id refused');
    let r = await store.read('id-a'); eq(r.data, DATA, 'jsonb round-trip'); eq(r.rev, 1, 'rev'); eq(await store.read('nope'), null, 'unknown -> null');
    r = await store.write('id-a', { ...DATA, theme: 'light' }, 1); eq([r.status, r.rev], ['ok', 2], 'write with matching rev'); r = await store.write('id-a', { ...DATA, theme: 'system' }, 1); eq(r.status, 'conflict', 'stale rev conflicts'); eq([r.rev, r.data.theme], [2, 'light'], 'conflict returns current'); r = await store.write('id-a', DATA, null); eq([r.status, r.rev], ['ok', 3], 'null rev overwrites'); eq((await store.write('nope', DATA, 1)).status, 'missing', 'missing');
    // purge by inactivity: age the row in the test schema only
    await store.create('id-old', DATA); await q(`update "${SCHEMA}".profiles set last_read_at = now() - interval '400 days' where id = 'id-old'`); eq(await store.purge(365 * 24 * 3600e3), 1, 'purge removes only the idle one'); eq(await store.size(), 1, 'one left');
    eq(await store.remove('id-a'), true, 'remove'); eq(await store.remove('id-a'), false, 'remove again'); eq(await store.size(), 0, 'empty');
    // the whole router on the real store
    const sync = createSync({ env: { SYNC_PEPPER: crypto.randomBytes(24).toString('hex') }, store, log: { log() {}, warn() {}, error() {} } }); eq(await sync.init(), true, 'router init on Neon');
    const app = express(); app.use('/api/sync', sync.router); const srv = await new Promise((res) => { const s = app.listen(0, '127.0.0.1', () => res(s)); }); const base = `http://127.0.0.1:${srv.address().port}`;
    const call = async (m, p, body, h = {}) => { const x = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', ...h }, body: body ? JSON.stringify(body) : undefined }); const t = await x.text(); return { status: x.status, json: t ? JSON.parse(t) : null }; };
    let c = await call('POST', '/api/sync', { data: DATA }); eq(c.status, 201, 'create via HTTP'); const code = c.json.code; ok(D.normalizeCode(code), 'valid code');
    c = await call('POST', '/api/sync/lookup', { code }); eq(c.json.summary, { sports: 1, teams: 1, players: 1, mutes: 1 }, 'lookup'); c = await call('GET', '/api/sync/profile', null, { Authorization: `Sync ${code}` }); eq(c.json.data, DATA, 'get');
    c = await call('PUT', '/api/sync/profile', { data: { ...DATA, theme: 'light' } }, { Authorization: `Sync ${code}`, 'If-Match': '1' }); eq(c.json.rev, 2, 'put'); c = await call('PUT', '/api/sync/profile', { data: DATA }, { Authorization: `Sync ${code}`, 'If-Match': '1' }); eq(c.status, 409, '409 on stale');
    const raw = await q(`select id, data::text as d from "${SCHEMA}".profiles`); eq(raw.length, 1, 'one row'); ok(!raw[0].id.includes(D.normalizeCode(code)) && !raw[0].d.includes(D.normalizeCode(code)), 'the code is nowhere in the database');
    c = await call('DELETE', '/api/sync/profile', null, { Authorization: `Sync ${code}` }); eq(c.status, 204, 'delete'); await new Promise((res) => srv.close(res));
  } finally {
    try { await store.dropSchema(); const left = await q('select count(*)::int as n from information_schema.schemata where schema_name = $1', [SCHEMA]); eq(left[0].n, 0, 'test schema dropped'); } catch (e) { console.error('cleanup failed:', e.message); process.exitCode = 1; }
  }
  console.log(`sync-neon.test.js: ${n} assertions passed (schema ${SCHEMA}, dropped)`);
})().catch((e) => { console.error(e.message); process.exit(1); });
