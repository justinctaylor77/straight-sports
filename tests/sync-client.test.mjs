// v1.4.0 (B): client sync logic (public/sync.js) against the real server router with the in-memory store. Two simulated devices.
import assert from 'assert'; import http from 'http'; import { createRequire } from 'module';
import { pick, merge, overlay, formatCode, normalizeCode, createSyncClient, DEBOUNCE_MS, SYNCED } from '../public/sync.js';
const require = createRequire(import.meta.url); const express = require('express');
const createSync = require('../server/sync.js'); const { memStore } = require('../server/syncstore.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ---- pure helpers ----
const base = { v: 6, onboarded: true, sports: ['nfl'], sportsChosen: true, sport: 'nfl', players: { 'golf:1': { name: 'A' } }, muteUnselected: false, conferences: ['8'], follow: ['nfl:1'], muteTeams: ['Dallas'], muteLeagues: [], muteKeywords: ['odds'], blockOutlets: [], sources: { a: true }, straightOnly: true, sportOnly: true, theme: 'system', watch: { providers: ['yttv'] }, seen: [1, 2], cache: 'x' };
eq(Object.keys(pick(base)).sort(), SYNCED.slice().sort(), 'pick returns exactly the synced keys'); ok(!('onboarded' in pick(base)) && !('seen' in pick(base)) && !('cache' in pick(base)), 'device-only keys are not synced');
{ const p = pick(base); p.follow.push('zzz'); ok(!base.follow.includes('zzz'), 'pick copies'); }
{
  const a = { ...base, follow: ['nfl:1', 'nfl:2'], muteKeywords: ['odds', 'a'], theme: 'dark', sport: 'nfl' }; const b = { ...base, sports: ['nfl', 'mlb'], follow: ['nfl:1', 'mlb:7'], muteKeywords: ['b'], muteTeams: [], theme: 'light', sport: 'mlb', players: { 'golf:9': { name: 'B' } }, sources: { a: false, c: true }, watch: { providers: ['espn'] } };
  const m = merge(a, b, 'local'); eq(m.follow, ['nfl:1', 'nfl:2', 'mlb:7'], 'follows unioned, no duplicates, local first'); eq(m.muteKeywords, ['odds', 'a', 'b'], 'keywords unioned'); eq(m.muteTeams, ['Dallas'], 'union keeps the side that has it'); eq(m.sports, ['nfl', 'mlb'], 'chosen sports unioned');
  eq([m.theme, m.sport], ['dark', 'nfl'], 'single values: local is newer'); eq(m.players, { 'golf:1': { name: 'A' }, 'golf:9': { name: 'B' } }, 'players unioned'); eq(m.sources, { a: true, c: true }, 'sources: newer wins per key'); eq(m.watch.providers, ['yttv', 'espn'], 'providers unioned');
  const r = merge(a, b, 'remote'); eq([r.theme, r.sport], ['light', 'mlb'], 'single values: remote is newer'); eq(r.sources.a, false, 'remote newer wins source'); ok(!('onboarded' in m), 'merge result is synced keys only');
  // never picked sports on one side: the picked side wins, we never turn "show everything" into a pick by accident
  const never = merge({ ...base, sportsChosen: false, sports: ['a', 'b', 'c'] }, base, 'local'); eq([never.sportsChosen, never.sports], [true, ['nfl']], 'one side chose: use that choice'); const none = merge({ ...base, sportsChosen: false, sports: ['a'] }, { ...base, sportsChosen: false, sports: ['b'] }, 'local'); eq(none.sportsChosen, false, 'neither chose: still show everything');
  const o = overlay({ ...base, onboarded: false, seen: [9] }, pick(a)); eq([o.onboarded, o.seen, o.follow], [true, [9], ['nfl:1', 'nfl:2']], 'overlay keeps device-only keys, marks onboarded');
}
eq(formatCode('7k2m9qxd4tra'), '7K2M-9QXD-4TRA', 'format'); eq(normalizeCode('7k2m 9qxd-4tra'), '7K2M9QXD4TRA', 'normalize'); eq(normalizeCode('nope'), null, 'normalize junk');

// ---- two devices against the real router ----
const clock = { t: 1_800_000_000_000 }; const store = memStore({ now: () => clock.t });
const sync = createSync({ env: { SYNC_PEPPER: ['client', 'test', 'pp', '0123456789'].join('-') }, store, now: () => clock.t, log: { log() {}, warn() {}, error() {} } }); await sync.init();
const app = express(); app.use('/api/sync', sync.router); const srv = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); }); const origin = `http://127.0.0.1:${srv.address().port}`;
let online = true; let outage = 0;
function device(name, settings) {
  const mem = new Map(); const timers = []; const d = { name, settings: structuredClone(settings), timers, saves: 0 };
  d.fetch = async (path, init) => { if (!online) throw new TypeError('offline'); if (outage) return new Response(JSON.stringify({ error: 'x' }), { status: outage }); return fetch(origin + path, init); };
  d.client = createSyncClient({ fetch: d.fetch, storage: { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }, getSettings: () => d.settings, now: () => clock.t, setTimer: (f, ms) => { const t = { f, ms }; timers.push(t); return t; }, clearTimer: (t) => { const i = timers.indexOf(t); if (i >= 0) timers.splice(i, 1); },
    applySettings: (next) => { d.settings = structuredClone(next); d.saves++; d.client.markDirty(); } }); // like the app: applying settings goes through save() -> markDirty
  d.edit = (patch) => { d.settings = { ...d.settings, ...patch }; d.client.markDirty(); };
  d.fire = async () => { const t = timers.shift(); if (t) await t.f(); };
  return d;
}
const A = device('A', base);
eq(A.client.linked(), false, 'not linked at first'); eq(await A.client.serverStatus(), { enabled: true, ready: true }, 'server status');
const c = await A.client.create(); ok(c.ok && /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(c.code), 'create returns a code'); const CODE = c.code; eq(A.client.state().code, CODE, 'code kept on the device so it can be shown again'); eq(A.client.state().dirty, false, 'clean after create');
eq((await A.client.lookup(CODE)).summary, { sports: 1, teams: 1, players: 0, mutes: 2 }, 'lookup summary');

// debounce: a burst of edits is one write, 3 s after the last change
A.edit({ theme: 'dark' }); A.edit({ follow: ['nfl:1', 'nfl:2'] }); A.edit({ muteKeywords: ['odds', 'parlay'] }); eq(A.timers.length, 1, 'edits coalesce into one timer'); eq(A.timers[0].ms, DEBOUNCE_MS, 'debounced by 3 s'); eq(A.client.state().dirty, true, 'dirty while waiting');
await A.fire(); eq(A.client.state().dirty, false, 'clean after the write'); eq(A.client.state().rev, 2, 'rev 2'); eq(await store.size(), 1, 'one profile on the server');

// device B restores (replace)
const B = device('B', { ...base, onboarded: false, sports: ['mlb'], follow: [], muteKeywords: [], theme: 'light', seen: ['b-only'] });
ok(!(await B.client.restore('AAAA-AAAA-AAAA')).ok, 'wrong code fails'); eq((await B.client.restore('AAAA-AAAA-AAAA')).error, 'not-found', 'not-found');
let r = await B.client.restore(CODE.toLowerCase().replace(/-/g, ' ')); ok(r.ok, 'restore with sloppy typing'); eq([B.settings.theme, B.settings.follow, B.settings.onboarded], ['dark', ['nfl:1', 'nfl:2'], true], 'settings replaced, onboarded'); eq(B.settings.seen, ['b-only'], 'device-only keys untouched'); eq(B.timers.length, 0, 'applying a restore does not schedule an upload'); eq(B.client.state().dirty, false, 'clean after restore'); eq(B.client.state().rev, 2, 'linked at rev 2');

// device C restores with merge: union, then uploads the union
const C = device('C', { ...base, follow: ['mlb:7'], muteKeywords: ['b'], theme: 'light', sports: ['mlb'] });
r = await C.client.restore(CODE, 'merge'); ok(r.ok, 'merge restore'); eq(C.settings.follow, ['mlb:7', 'nfl:1', 'nfl:2'], 'merge unions follows'); eq(C.settings.muteKeywords, ['b', 'odds', 'parlay'], 'merge unions keywords'); eq(C.settings.theme, 'light', 'merge keeps this device\'s single values'); eq(C.client.state().dirty, true, 'merge result is uploaded'); await C.fire(); eq(C.client.state().rev, 3, 'uploaded as rev 3'); eq(C.client.state().dirty, false, 'clean');

// conflict: A (rev 2) and B (rev 2) both edit; C already wrote rev 3. B writes first -> 409 -> merged -> accepted.
A.edit({ muteTeams: ['Dallas', 'Giants'] }); B.edit({ muteTeams: ['Dallas', 'Eagles'], theme: 'system' });
await B.fire(); eq(B.client.state().rev, 4, 'B merged over rev 3 and wrote rev 4'); ok(B.settings.follow.includes('mlb:7'), 'B received C\'s follow via the merge'); eq(B.settings.theme, 'system', 'B kept its own newer single value');
await A.fire(); eq(A.client.state().rev, 5, 'A merged over rev 4 and wrote rev 5'); eq(A.settings.muteTeams.sort(), ['Dallas', 'Eagles', 'Giants'], 'nothing lost: all three mutes survive'); eq(A.settings.theme, 'system', 'A did not touch the theme, so B\'s newer theme wins (a stale value never overwrites another device)');
// but a single value this device did change itself is kept
A.edit({ theme: 'light' }); B.edit({ theme: 'dark' }); await B.fire(); await A.fire(); eq(A.settings.theme, 'light', 'a value A changed itself is kept on conflict');

// pull: B (clean) picks up what A wrote when the app starts
eq(B.client.state().dirty, false, 'B is clean'); r = await B.client.sync(); ok(r.ok && r.pulled, 'B pulled newer rev'); eq(B.settings.muteTeams.sort(), ['Dallas', 'Eagles', 'Giants'], 'B now has the merged list'); eq(B.timers.length, 0, 'pulling does not schedule an upload'); r = await B.client.sync(); ok(r.ok && !r.pulled, 'nothing new the second time');

// offline: edits are kept, retried later
online = false; B.edit({ follow: [...B.settings.follow, 'nfl:99'] }); await B.fire(); eq(B.client.state().dirty, true, 'still dirty while offline'); eq(B.client.last.status, 'offline', 'status says offline'); eq(B.settings.follow.includes('nfl:99'), true, 'local copy is intact');
r = await B.client.sync(); eq(r.error, 'offline', 'sync reports offline without throwing'); online = true; r = await B.client.sync(); ok(r.ok, 'next sync pushes the pending change'); eq(B.client.state().dirty, false, 'clean again'); eq((await A.client.sync()).pulled, true, 'A sees it');
// server trouble: 503 keeps dirty, no data loss
outage = 503; A.edit({ theme: 'light' }); await A.fire(); eq([A.client.state().dirty, A.client.last.status], [true, 'error'], '503 keeps changes pending'); outage = 0; await A.client.sync(); eq(A.client.state().dirty, false, 'recovered');
// rate limited: schedules the retry itself
outage = 0;

// turn off: server copy deleted, device keeps settings
const before = structuredClone(C.settings); r = await C.client.turnOff(); ok(r.ok, 'turn off'); eq(C.client.linked(), false, 'unlinked'); eq(C.settings, before, 'device settings untouched'); eq((await B.client.lookup(CODE)).error, 'not-found', 'server copy is gone'); eq(await store.size(), 0, 'no rows left');
// another device finds its backup deleted: unlinks quietly, keeps its settings, does not recreate anything
const keep = structuredClone(B.settings); r = await B.client.sync(); eq(r.error, 'backup-missing', 'reports the backup is gone'); eq(B.client.linked(), false, 'unlinked'); eq(B.settings, keep, 'settings kept'); eq(await store.size(), 0, 'nothing recreated');
// not linked: sync / flush are no-ops
eq((await B.client.sync()).error, 'not-linked', 'no-op when not linked'); B.edit({ theme: 'dark' }); eq(B.timers.length, 0, 'no timers when not linked');

await new Promise((res) => srv.close(res));
console.log(`sync-client.test.mjs: ${n} assertions passed`);
