// AUSL (Athletes Unlimited Softball League) provider, v1.3.1 "Windmill": parser, standings, bracket, season states,
// offline fallback, hub payloads, catalog / all-sports default / mute-unselected, client render helpers.
// Run: node tests/ausl.test.mjs. No network: Wikipedia and the MLB API are stubbed from tests/fixtures/ausl-2026-gamelog.txt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const require = createRequire(import.meta.url);
const A = require('../server/ausl.js');
const L = await import('../public/lib.js');
const P = await import('../public/picker.js');
const LISTS = await import('../public/lists.js');
const { flagsFor, decorate } = require('../server/highlight.js');
let n = 0; const t = (name, fn) => Promise.resolve().then(fn).then(() => { n++; }, (e) => { console.error('FAIL:', name); throw e; });
const WIKI = fs.readFileSync(new URL('./fixtures/ausl-2026-gamelog.txt', import.meta.url), 'utf8');
const teams = A.STATIC_TEAMS.map((s) => ({ id: A.tidOf(s.mlb), name: `${s.location} ${s.nick}`, short: s.nick, location: s.location, nick: s.nick, abbr: s.abbr, logo: A.logoUrl(s.mlb), color: s.color }));
const nameOf = (id) => teams.find((x) => x.id === id).short;

await t('team table: six teams, ids ausl:<mlb id>, logos from the MLB static host', () => {
  assert.deepEqual(A.STATIC_TEAMS.map((x) => x.mlb).sort(), [1871, 5547, 6478, 6479, 6480, 6481]);
  assert.equal(A.tidOf(6481), 'ausl:6481'); assert.match(A.logoUrl(6481), /^https:\/\/www\.mlbstatic\.com\/team-logos\/6481\.svg$/);
  assert.equal(A.LEAGUE_NAME, 'Athletes Unlimited Softball League');
});
await t('ctToUtc: Central time to UTC, daylight and standard', () => {
  assert.equal(new Date(A.ctToUtc(2026, 6, 9, 19, 0)).toISOString(), '2026-06-10T00:00:00.000Z'); // CDT = UTC-5
  assert.equal(new Date(A.ctToUtc(2026, 12, 9, 19, 0)).toISOString(), '2026-12-10T01:00:00.000Z'); // CST = UTC-6
});
const parsed = A.parseGameLog(WIKI, 2026, teams);
await t('parser: 78 games (75 regular + play-in + 2 championship), no warnings, every game has two known teams', () => {
  assert.equal(parsed.games.length, 78); assert.deepEqual(parsed.warnings, []);
  assert.equal(parsed.games.filter((g) => !g.post).length, 75); assert.equal(parsed.games.filter((g) => g.post).length, 3);
  for (const g of parsed.games) { assert.ok(g.home && g.away && g.home !== g.away); assert.match(g.id, /^\d{10}$/); assert.ok(!isNaN(Date.parse(g.date))); }
  assert.equal(new Set(parsed.games.map((g) => g.id)).size, 78); // ids unique (they are also the /api/game ids)
});
await t('parser: every regular-season game is final with integer scores; innings and TV carried through', () => {
  const reg = parsed.games.filter((g) => !g.post);
  assert.ok(reg.every((g) => g.state === 'post' && Number.isInteger(g.homeScore) && Number.isInteger(g.awayScore) && g.homeScore !== g.awayScore));
  assert.ok(parsed.games.some((g) => g.innings && g.innings > 7), 'an extra-innings game'); assert.ok(parsed.games.some((g) => g.tv));
  assert.ok(parsed.games.some((g) => g.venue));
});
const stand = A.computeStandings(parsed.games, teams);
await t('standings: Talons 16-9, Bandits 16-9, Cascade/Spark 14-11, GB and run differential computed', () => {
  assert.deepEqual(stand.map((r) => `${nameOf(r.id)} ${r.w}-${r.l}`).slice(0, 2), ['Talons 16-9', 'Bandits 16-9']);
  const rec = Object.fromEntries(stand.map((r) => [nameOf(r.id), `${r.w}-${r.l}`]));
  assert.equal(rec.Cascade, '14-11'); assert.equal(rec.Spark, '14-11'); assert.equal(stand.length, 6);
  assert.equal(stand.reduce((a, r) => a + r.w, 0), 75); assert.equal(stand.reduce((a, r) => a + r.l, 0), 75);
  assert.equal(stand.reduce((a, r) => a + r.rs, 0), stand.reduce((a, r) => a + r.ra, 0)); // every run scored is a run allowed
  assert.equal(stand[0].gb, 0); assert.ok(stand.every((r) => r.pct >= 0 && r.pct <= 1));
});
await t('standings: postseason games are not counted', () => {
  const only = A.computeStandings(parsed.games.filter((g) => g.post), teams); assert.ok(only.every((r) => r.w === 0 && r.l === 0));
});
const bracket = A.buildBracket(parsed.games, teams);
await t('bracket: Play-in then best-of-3 Championship Series; Talons champion 2-0 over the Bandits', () => {
  const rounds = bracket.groups[0].rounds; assert.deepEqual(rounds.map((r) => r.name), ['Play-in', 'AUSL Championship Series']);
  const pi = rounds[0].matchups[0]; assert.equal(pi.status, 'final'); assert.deepEqual(pi.slots.map((s) => s.winner), [false, true]);
  const ser = rounds[1].matchups[0]; assert.equal(ser.bestOf, 3); assert.deepEqual(ser.slots.map((s) => s.wins).sort(), [0, 2]);
  assert.equal(bracket.champion.short, 'Talons'); assert.ok(bracket.groups[0].rounds.flatMap((r) => r.matchups).flatMap((m) => m.slots).every((s) => s.seed == null), 'no invented seeds');
});
await t('bracket: no champion until a team has two wins; none without postseason games', () => {
  const one = A.buildBracket(parsed.games.filter((g) => !g.post || /Play-in|Game 1/i.test(g.round || '')), teams);
  assert.equal(one.champion, null); assert.equal(one.groups[0].rounds[1].matchups[0].status, 'live');
  assert.equal(A.buildBracket(parsed.games.filter((g) => !g.post), teams), null);
});
await t('parser: tolerant of junk (empty, HTML, no log) and never throws or invents games', () => {
  for (const x of ['', null, undefined, '<html>502 Bad Gateway</html>', '{{Game log section start|title=X|}}', 'random text\n|-\n| a | b']) { const r = A.parseGameLog(x, 2026, teams); assert.deepEqual(r.games, []); }
});
await t('stripWiki: removes refs, templates and links', () => assert.equal(A.stripWiki('[[Utah Talons|Talons]]<ref>x</ref>{{efn|n}} win'), 'Talons win'));

// ---------- the live provider, with the network stubbed ----------
const mkCached = () => { const m = new Map(); return (k, ttl, fn) => { if (!m.has(k)) m.set(k, Promise.resolve().then(fn).catch((e) => { m.delete(k); throw e; })); return m.get(k); }; };
const realFetch = globalThis.fetch;
const stub = (mode) => { globalThis.fetch = async (url) => { url = String(url);
  if (/wikipedia\.org/.test(url)) { if (mode === 'down') throw new Error('offline'); if (mode === 'junk') return { ok: true, json: async () => ({ parse: { wikitext: '<html>' } }) }; if (!/page=2026_AUSL_season/.test(url)) return { ok: true, json: async () => ({ error: { code: 'missingtitle' } }) }; return { ok: true, json: async () => ({ parse: { wikitext: WIKI } }) }; }
  if (/statsapi\.mlb\.com/.test(url)) { if (/roster/.test(url)) return { ok: true, json: async () => ({ roster: [{ person: { id: 9, fullName: 'Test Player' }, jerseyNumber: '7', position: { abbreviation: 'C' } }] }) }; throw new Error('mlb down'); }
  throw new Error(`unexpected fetch ${url}`); }; };
try {
  stub('ok'); let ausl = A({ cached: mkCached() });
  await t('getTeams: six teams even when the MLB API is down (static table), conference group, no private fields', async () => {
    const d = await ausl.getTeams(); assert.equal(d.teams.length, 6); assert.equal(d.conferences[0].name, A.LEAGUE_NAME); assert.ok(d.teams.every((x) => x.id.startsWith('ausl:') && x.logo && !('venue' in x)));
  });
  await t('board (offseason): last 8 results with an honest banner, links out, attribution; nothing blank', async () => {
    const b = await ausl.board(); assert.equal(b.seasonState, 'complete'); assert.equal(b.events.length, 8); assert.match(b.notice, /Offseason/); assert.match(b.notice, /aren’t published|isn’t|not/i);
    assert.ok(b.events.every((e) => e.state === 'post' && e.home.team && e.away.team)); assert.match(b.attribution, /Wikipedia/); assert.match(b.attribution, /MLB Stats API/); assert.match(b.links[0].url, /theausl\.com/);
    assert.equal(b.events.at(-1).id, '2026072601'); assert.match(b.events.at(-1).note, /Championship/);
  });
  await t('standings payload matches the app’s generic table: cols, one group, six rows, source + not-official note', async () => {
    const s = await ausl.standings(); assert.deepEqual(s.cols, ['W', 'L', 'PCT', 'GB', 'DIFF']); assert.equal(s.groups.length, 1); const r = s.groups[0].rows; assert.equal(r.length, 6);
    assert.ok(r.every((x) => x.cells.length === 5)); assert.equal(r[0].cells[0], '16'); assert.match(s.note, /not the league’s official/i); assert.equal(s.source, 'Wikipedia game log');
  });
  await t('team page: record, stats, roster (display only, no player pages), schedule; bad id is a 400', async () => {
    const d = await ausl.teamPage('ausl:6481'); assert.equal(d.team.record[0].summary, '16-9'); assert.match(d.team.standing, /1st/); assert.ok(d.stats.length >= 1); assert.ok(d.schedule.length >= 1);
    assert.ok(d.roster.every((p) => p.noPage === true)); assert.match(d.attribution, /MLB Stats API/);
    await assert.rejects(ausl.teamPage('ausl:1'), (e) => e.status === 400);
    const sc = await ausl.teamSchedule('ausl:6481'); assert.equal(sc.events.length, 25 + 2); // 25 regular games + the two championship games
  });
  await t('Gamecast: result, venue, TV; empty plays/box; a plain "not available" notice and an official link', async () => {
    const g = await ausl.cast('2026072601'); assert.equal(g.kind, 'generic'); assert.equal(g.state, 'post'); assert.equal(g.home.score + g.away.score, 7); assert.deepEqual(g.plays, []); assert.deepEqual(g.box, []);
    assert.match(g.limited.title, /isn’t available/); assert.match(g.limited.link.url, /theausl\.com/);
    await assert.rejects(ausl.cast('1999010101'), (e) => e.status === 404);
  });
  await t('hub list: offseason standings with rank, record, detail; honest notes and method', async () => {
    const h = await ausl.hubList(); assert.equal(h.state, 'offseason'); assert.equal(h.rows.length, 6); assert.equal(h.rows[0].rank, 1); assert.match(h.rows[0].record, /^\d+-\d+$/); assert.match(h.label, /not an official/i);
    assert.ok(h.method.caveats.some((c) => /theausl\.com/.test(c))); assert.ok(h.notes.some((x) => /No next-season date/.test(x)));
  });
  await t('hub bracket: complete, champion Talons with the 2–0 note; never claims a next-season date', async () => {
    const h = await ausl.hubBracket(); assert.equal(h.state, 'complete'); assert.match(h.headline, /Utah Talons/); assert.match(h.champNote, /Chicago Bandits 2–0/); assert.equal(h.bracket.champion.short, 'Talons');
    assert.ok(h.notes.some((x) => /No next-season date/.test(x))); assert.ok(h.format.length >= 2);
  });
  await t('HTML hub payloads survive the Big 12 decorator (Utah Talons are not Utah the Big 12 school)', async () => {
    const h = decorate(await ausl.hubBracket()); assert.ok(!JSON.stringify(h).includes('"hl"')); assert.equal(flagsFor({ id: 'ausl:6481', name: 'Utah Talons', short: 'Utah', location: 'Utah' }), null);
  });

  // season states: blank the result cells to simulate a season that has not started / is half played
  const blank = (text, from) => { const L = text.split('\n'); return L.map((l, i) => (i >= from * L.length && /^\|\s*\d+\s*[–-]\s*\d+/.test(l) ? '| ' : l)).join('\n'); };
  const stubText = (text) => { globalThis.fetch = async (url) => (/wikipedia\.org/.test(String(url)) ? (/page=2026_/.test(String(url)) ? { ok: true, json: async () => ({ parse: { wikitext: text } }) } : { ok: true, json: async () => ({ error: {} }) }) : { ok: false, status: 500, json: async () => ({}) }); };
  stubText(blank(WIKI, 0)); ausl = A({ cached: mkCached() });
  await t('preseason (no results yet): honest "hasn’t started" banner, first scheduled games, 0-0 standings, hub says preseason, no champion', async () => {
    const b = await ausl.board(); assert.equal(b.seasonState, 'preseason'); assert.match(b.notice, /hasn’t started/); assert.ok(b.events.length > 0 && b.events.every((e) => e.state === 'pre'));
    const s = await ausl.standings(); assert.equal(s.groups[0].rows.length, 6); assert.ok(s.groups[0].rows.every((r) => r.cells[0] === '0'));
    const l = await ausl.hubList(); assert.equal(l.state, 'preseason'); const br = await ausl.hubBracket(); assert.notEqual(br.state, 'complete'); assert.ok(!br.bracket || !br.bracket.champion);
    const g = await ausl.cast(b.events[0].id); assert.equal(g.state, 'pre'); assert.ok(g.limited);
  });
  stubText(blank(WIKI, 0.4)); ausl = A({ cached: mkCached() });
  await t('mid-season: state live, upcoming and recent games, standings from the games played, no champion', async () => {
    const b = await ausl.board(); assert.equal(b.seasonState, 'live'); assert.ok(b.events.some((e) => e.state === 'pre') && b.events.some((e) => e.state === 'post'));
    const l = await ausl.hubList(); assert.equal(l.state, 'ready'); const br = await ausl.hubBracket(); assert.equal(br.state, 'live'); assert.ok(!br.bracket || !br.bracket.champion); assert.equal((await ausl.standings()).groups[0].rows.length, 6);
  });

  stub('down'); ausl = A({ cached: mkCached() });
  await t('Wikipedia unreachable: falls back to the bundled snapshot, flagged stale, everything still renders', async () => {
    const b = await ausl.board(); assert.equal(b.stale, true); assert.equal(b.events.length, 8); const h = await ausl.hubBracket(); assert.equal(h.bracket.champion.short, 'Talons'); assert.ok(h.notes.some((x) => /saved copy/.test(x)));
    assert.equal((await ausl.standings()).groups[0].rows.length, 6);
  });
  stub('junk'); ausl = A({ cached: mkCached() });
  await t('Wikipedia returns junk: same snapshot fallback, no crash', async () => { assert.equal((await ausl.board()).stale, true); });
} finally { globalThis.fetch = realFetch; }

// ---------- catalog, all-sports default, mute-unselected, picker ----------
await t('catalog: AUSL is a team sport in the Baseball group beside college softball, with an AUSL-only mute word list', () => {
  const c = L.SPORTS.ausl; assert.ok(c); assert.equal(c.kind, 'team'); assert.equal(c.group, 'Baseball'); assert.equal(c.provider, 'ausl'); assert.ok(!c.path, 'no ESPN path');
  assert.ok(L.SPORTS.softball && L.SPORT_IDS.includes('ausl')); assert.ok(c.own.test('AUSL champion Utah Talons')); assert.ok(!c.own.test('MLB trade rumors'));
  assert.deepEqual(L.MUTE_WORDS.ausl, ['AUSL', 'Athletes Unlimited', 'softball']); // 'softball' so picking AUSL keeps its own softball stories
});
await t('server catalog loads the same entry (shared registry)', () => { const { CATALOG } = require('../server/catalog.js'); assert.equal(CATALOG.ausl.provider, 'ausl'); assert.equal(CATALOG.ausl.name, 'AUSL Pro Softball'); });
const base = (o) => L.migrate({ v: 6, onboarded: true, sportsChosen: true, sports: ['nfl'], muteUnselected: false, ...o });
await t('mute-unselected: an AUSL story that says "softball" is kept when AUSL is picked, muted when neither AUSL nor College Softball is', () => {
  const story = { title: 'Athletes Unlimited Softball League adds a 2027 expansion team', summary: '' };
  const f1 = L.buildMuteFilter(base({ sports: ['nfl', 'ausl'], muteUnselected: true, sportOnly: false }), [], 'nfl'); assert.equal(f1.item(story), null);
  const f2 = L.buildMuteFilter(base({ sports: ['nfl'], muteUnselected: true, sportOnly: false }), [], 'nfl'); assert.ok(f2.item(story));
  assert.ok(f2.item({ title: 'AUSL: Utah Talons win', summary: '' })); assert.equal(f2.sport('ausl'), true); assert.equal(f1.sport('ausl'), false);
});
await t('all-sports default includes AUSL; nothing is muted by default', () => {
  const s = L.migrate({}); assert.equal(s.sportsChosen, false); assert.ok(!L.mutedSports(s).includes('ausl'));
  assert.ok(L.SPORT_IDS.includes('ausl')); // sportsChosen=false means every catalog sport, AUSL included
});
await t('mute-unselected: AUSL is muted when not picked, and only then', () => {
  assert.ok(L.mutedSports(base({ muteUnselected: true })).includes('ausl'));
  assert.ok(!L.mutedSports(base({ muteUnselected: true, sports: ['nfl', 'ausl'] })).includes('ausl'));
  assert.ok(!L.mutedSports(base({ muteUnselected: false })).includes('ausl'));
  assert.ok(!L.mutedSports(base({ muteUnselected: true, sportsChosen: false })).includes('ausl'), 'dormant with the all-sports default');
});
await t('mute-unselected: an AUSL headline is hidden when AUSL is not picked and shown when it is; MLB/college softball news untouched', () => {
  const item = (title) => ({ title, link: '', summary: '', source: 'x' }); const hit = 'AUSL champion Utah Talons are on the move';
  const f1 = L.buildMuteFilter(base({ muteUnselected: true }), [], 'nfl'); assert.match(f1.item(item(hit)), /unselected sport \(AUSL\)/); assert.equal(f1.sport('ausl'), true);
  const f2 = L.buildMuteFilter(base({ muteUnselected: true, sports: ['nfl', 'ausl'] }), [], 'nfl'); assert.equal(f2.item(item(hit)), null); assert.equal(f2.sport('ausl'), false);
  assert.equal(f1.item(item('NFL Sunday preview')), null); assert.equal(L.buildMuteFilter(base({ muteUnselected: true }), [], 'ausl').item(item(hit)), null, 'its own feed is never muted');
});
await t('picker: AUSL is a league group named AUSL Pro Softball with location-first team names', () => {
  assert.ok(P.LEAGUE_ORDER.includes('ausl'));
  const full = P.fullName({ id: 'ausl:6481', sport: 'ausl', name: 'Utah Talons', location: 'Utah', short: 'Talons' }); assert.match(full, /Utah/);
});
await t('lists.js: AUSL is in the hub feed; standings rows and a champion card render, escaped, with no invented seeds', () => {
  assert.ok(LISTS.FEED.includes('ausl'));
  const R = LISTS.makeRender({ logo: (x) => (x ? x.logo : '') });
  const tm = { id: 'ausl:6481', name: 'Utah <Talons>', short: 'Talons', logo: '/l.svg', color: '2A4F3A' };
  const row = R.row({ rank: 1, team: tm, record: '16-9', detail: '.640 · +19', move: null }, { sport: 'ausl', kind: 'standings' });
  assert.match(row, /href="#\/schedule\/ausl:6481"/); assert.match(row, /\.640 · \+19/); assert.doesNotMatch(row, /<Talons>/);
  const html = R.playoffsBody({ sport: 'ausl', name: 'AUSL', state: 'complete', headline: 'h', champLabel: '2026 AUSL champion', champNote: 'Beat X 2–0', source: { name: 's', url: 'https://x' }, format: ['f'], links: [{ name: 'Official', url: 'https://theausl.com' }],
    bracket: { real: true, champion: tm, finalRounds: [], groups: [{ id: 'a', name: 'AUSL postseason', rounds: [{ name: 'Play-in', matchups: [{ status: 'final', slots: [{ team: tm, seed: null, score: 6, winner: true }, { team: tm, seed: null, score: 5 }] }] }] }] } });
  assert.match(html, /2026 AUSL champion/); assert.match(html, /Beat X 2–0/); assert.doesNotMatch(html, /national champion/); assert.match(html, /theausl\.com/);
});
console.log(`ausl.test.mjs: ${n} passed`);
