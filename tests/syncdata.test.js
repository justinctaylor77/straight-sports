// v1.4.0 (B): recovery-code helpers. Pure functions, no network.
const assert = require('assert');
const D = require('../server/syncdata.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };

// ---- code format: 12 chars of Crockford Base32 (no I L O U), shown as XXXX-XXXX-XXXX ----
const seen = new Set();
for (let i = 0; i < 2000; i++) { const c = D.newCode(); ok(/^[0-9A-HJKMNP-TV-Z]{12}$/.test(c), `charset ${c}`); seen.add(c); }
eq(seen.size, 2000, '2000 codes, no repeats');
eq(D.ALPHABET.length, 32, '32 symbols'); ok(!/[ILOU]/.test(D.ALPHABET), 'no I, L, O, U');
eq(D.formatCode('7K2M9QXD4TRA'), '7K2M-9QXD-4TRA', 'display format');
{ // every symbol is reachable and uniform enough: 32 buckets from 64k draws, each within 30% of the mean
  const cnt = {}; for (let i = 0; i < 5500; i++) for (const ch of D.newCode()) cnt[ch] = (cnt[ch] || 0) + 1;
  const mean = 5500 * 12 / 32; ok(Object.keys(cnt).length === 32 && Object.values(cnt).every((v) => v > mean * 0.85 && v < mean * 1.15), 'no obvious bias');
}
eq(D.newCode(() => Buffer.alloc(12, 0)), '000000000000', 'byte 0 -> 0'); eq(D.newCode(() => Buffer.alloc(12, 31)), 'ZZZZZZZZZZZZ', 'byte 31 -> Z'); eq(D.newCode(() => Buffer.alloc(12, 32)), '000000000000', 'high bits ignored (no modulo bias)');

// ---- normalize: any case, dashes, spaces; look-alikes folded; anything else rejected ----
eq(D.normalizeCode('7k2m-9qxd-4tra'), '7K2M9QXD4TRA', 'lowercase + dashes');
eq(D.normalizeCode(' 7K2M 9QXD 4TRA '), '7K2M9QXD4TRA', 'spaces'); eq(D.normalizeCode('7K2M9QXD4TRA'), '7K2M9QXD4TRA', 'bare');
eq(D.normalizeCode('o0o0-1i1l-0000'), '000011110000', 'O->0, I/L->1');
for (const bad of ['', 'ABC', '7K2M-9QXD-4TR', '7K2M-9QXD-4TRAA', '7K2M-9QXU-4TRA', '7K2M-9QX!-4TRA', null, undefined, 123, {}, 'x'.repeat(200)]) eq(D.normalizeCode(bad), null, `reject ${String(bad).slice(0, 20)}`);

// ---- hash: deterministic, pepper-dependent, never the code ----
const h1 = D.hashCode('pepper-pepper-pepper', '7K2M9QXD4TRA');
eq(h1, D.hashCode('pepper-pepper-pepper', '7K2M9QXD4TRA'), 'deterministic'); ok(/^[0-9a-f]{64}$/.test(h1), 'sha256 hex'); ok(!h1.includes('7K2M'), 'hash does not contain the code');
ok(h1 !== D.hashCode('another-pepper-value', '7K2M9QXD4TRA'), 'different pepper, different id'); ok(h1 !== D.hashCode('pepper-pepper-pepper', '7K2M9QXD4TRB'), 'different code, different id');

// ---- sanitize: allow-list, types, caps ----
const good = { v: 6, sports: ['nfl', 'mlb'], sportsChosen: true, sport: 'nfl', players: { 'golf:123': { name: 'A Golfer', flag: 'https://a.espncdn.com/x.png', team: 'x' } }, muteUnselected: true, conferences: ['8'], follow: ['252', 'nfl:12', 'mlb:a99', 'golf:123'], muteTeams: ['Dallas'], muteLeagues: ['betting'], muteKeywords: ['odds'], blockOutlets: ['ESPN'], sources: { espn: false }, straightOnly: true, sportOnly: false, theme: 'dark', watch: { providers: ['yttv'] } };
{ const r = D.sanitize({ ...good, onboarded: true, seen: [1], evil: '<script>', __proto__x: 1 }); ok(r.ok, 'valid'); eq(r.data, good, 'unknown keys dropped, onboarded not synced'); ok(!('onboarded' in r.data), 'onboarded is not synced'); }
eq(D.SYNCED_KEYS.includes('onboarded'), false, 'allow-list excludes onboarded');
{ const r = D.sanitize({ sports: ['nfl'], watch: { providers: ['a'], extra: 1 } }); eq(r.data.watch, { providers: ['a'] }, 'watch keeps providers only'); }
for (const [bad, why] of [[null, 'null'], [[], 'array'], ['x', 'string'], [{}, 'empty'], [{ unknown: 1 }, 'only unknown'], [{ sports: 'nfl' }, 'sports not array'], [{ sports: [1] }, 'sports item not string'], [{ sports: [''] }, 'empty item'], [{ theme: 'neon' }, 'bad theme'], [{ sportsChosen: 'yes' }, 'bool'], [{ v: 1.5 }, 'v not int'], [{ v: 0 }, 'v range'], [{ follow: Array(501).fill('a') }, 'too many follow'], [{ muteKeywords: ['x'.repeat(121)] }, 'long keyword'], [{ players: { 'bad key!': { name: 'x' } } }, 'player key'], [{ players: { a: { name: { nested: 1 } } } }, 'player nested'], [{ players: { a: [] } }, 'player array'], [{ sources: { a: 'on' } }, 'source value'], [{ watch: { providers: 'x' } }, 'providers']]) { const r = D.sanitize(bad); ok(!r.ok && r.status === 400, `reject: ${why}`); }
{ const big = { muteKeywords: Array(300).fill('k'.repeat(110)), muteTeams: Array(300).fill('t'.repeat(110)) }; const r = D.sanitize(big); ok(!r.ok && r.status === 413, '>32 KB rejected with 413'); }
{ const r = D.sanitize({ players: Object.fromEntries(Array.from({ length: 501 }, (_, i) => [`p${i}`, { name: 'x' }])) }); ok(!r.ok, '501 players rejected'); }
{ const r = D.sanitize(JSON.parse('{"sports":["nfl"],"__proto__":{"polluted":true}}')); ok(r.ok && ({}).polluted === undefined && !('polluted' in r.data), 'no prototype pollution'); }

// ---- summary: counts only ----
eq(D.summarize(good), { sports: 2, teams: 2, players: 2, mutes: 4 }, 'summary counts (teams vs athletes, mutes incl. outlets)');
eq(D.summarize({ sportsChosen: false, sports: ['a'] }).sports, 'all', 'never chose sports -> all');
eq(D.summarize({}), { sports: 0, teams: 0, players: 0, mutes: 0 }, 'empty'); eq(D.summarize(null).teams, 0, 'null safe');
ok(!JSON.stringify(D.summarize(good)).includes('Dallas'), 'no names leak through the summary');

console.log(`syncdata.test.js: ${n} assertions passed`);
