// Pro playoff seeds, series building and brackets. Run: node tests/postseason.test.js
const assert = require('assert');
const P = require('../server/postseason');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const team = (id) => ({ id: `x:${id}`, name: `Team ${id}`, short: `T${id}`, abbr: `T${id}`, logo: '', logoDark: '', color: '123456' });
const row = (id, conference, division, w, l, diff, seed = null) => ({ team: team(id), w, l, t: 0, gp: w + l, diff, seed, conference, division, record: `${w}-${l}` });
const norm = (tm) => ({ id: `x:${tm.id}`, name: tm.displayName || tm.id, short: tm.id, abbr: tm.abbreviation || tm.id });
const ev = (id, date, a, b, head, state, winnerId, sa = 0, sb = 0) => ({ id, date, competitions: [{ notes: [{ headline: head }], status: { type: { state, shortDetail: state === 'post' ? 'Final' : '7:00 PM' } },
  competitors: [{ team: { id: a }, score: String(sa), winner: winnerId === a }, { team: { id: b }, score: String(sb), winner: winnerId === b }] }] });

t('NFL seeds use ESPN playoffSeed when all 7 exist', () => {
  const rows = []; for (let i = 1; i <= 16; i++) rows.push(row(i, 'AFC', `D${i % 4}`, 10 - (i % 5), 3, 5, i <= 7 ? i : null));
  const g = P.nflSeeds(rows); assert.strictEqual(g.length, 1); assert.deepStrictEqual(g[0].seeds.map((s) => s.seed), [1, 2, 3, 4, 5, 6, 7]);
  assert.strictEqual(g[0].seeds[0].tag, 'Division winner'); assert.strictEqual(g[0].seeds[6].tag, 'Wild card');
});
t('NFL fallback: division winners seeded 1-4 by record, next three best records 5-7', () => {
  const rows = [row(1, 'NFC', 'E', 9, 1, 50), row(2, 'NFC', 'E', 8, 2, 40), row(3, 'NFC', 'W', 6, 4, 10), row(4, 'NFC', 'W', 7, 3, 20), row(5, 'NFC', 'N', 5, 5, 0), row(6, 'NFC', 'N', 4, 6, -5), row(7, 'NFC', 'S', 3, 7, -9), row(8, 'NFC', 'S', 2, 8, -9), row(9, 'NFC', 'S', 6, 4, 9)];
  const s = P.nflSeeds(rows)[0].seeds;
  assert.deepStrictEqual(s.slice(0, 4).map((x) => x.team.id), ['x:1', 'x:4', 'x:9', 'x:5']); // E, W, S, N winners by record (S winner = 9)
  assert.strictEqual(s.length, 7);
});
t('NBA seeds: 10 per conference, top 6 direct, 7-10 play-in', () => {
  const rows = []; for (const c of ['East', 'West']) for (let i = 1; i <= 15; i++) rows.push(row(`${c[0]}${i}`, c, c, 60 - i * 3, 22 + i * 3, 20 - i));
  const g = P.nbaSeeds(rows); assert.strictEqual(g.length, 2);
  for (const c of g) { assert.strictEqual(c.seeds.length, 10); assert.strictEqual(c.seeds[5].tag, 'Direct'); assert.strictEqual(c.seeds[6].tag, 'Play-in'); assert.strictEqual(c.seeds[0].team.id, `x:${c.name[0]}1`); }
});
t('MLB seeds: 6 per league (3 division winners + 3 wild cards)', () => {
  const rows = []; for (const lg of ['AL', 'NL']) for (const d of ['E', 'C', 'W']) for (let i = 1; i <= 5; i++) rows.push(row(`${lg}${d}${i}`, lg, `${lg}${d}`, 100 - i * 4 - (d === 'W' ? 2 : 0), 62 + i * 4, 30 - i * 8));
  const g = P.mlbSeeds(rows); assert.strictEqual(g.length, 2);
  for (const lg of g) { assert.strictEqual(lg.seeds.length, 6); assert.deepStrictEqual(lg.seeds.map((s) => s.tag), ['Division winner', 'Division winner', 'Division winner', 'Wild card', 'Wild card', 'Wild card']); }
});
t('WNBA seeds: eight best records league-wide, single group', () => {
  const rows = []; for (let i = 1; i <= 13; i++) rows.push(row(i, i % 2 ? 'East' : 'West', 'x', 40 - i, 4 + i, 50 - i * 3));
  const g = P.wnbaSeeds(rows); assert.strictEqual(g.length, 1); assert.deepStrictEqual(g[0].seeds.map((s) => s.team.id), [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `x:${i}`));
});
t('roundOf maps ESPN headlines and ignores unknown ones', () => {
  assert.strictEqual(P.roundOf('mlb', 'World Series - Game 3'), 'ws'); assert.strictEqual(P.roundOf('mlb', 'ALDS - Game 1'), 'ds'); assert.strictEqual(P.roundOf('mlb', 'NLCS - Game 5'), 'lcs');
  assert.strictEqual(P.roundOf('mlb', 'AL Wild Card Series - Game 2'), 'wc'); assert.strictEqual(P.roundOf('nba', 'East Play-In'), 'pi'); assert.strictEqual(P.roundOf('nba', 'NBA Finals - Game 1'), 'f');
  assert.strictEqual(P.roundOf('nba', 'West 1st Round - Game 4'), 'r1'); assert.strictEqual(P.roundOf('nfl', 'Super Bowl LXI'), 'sb'); assert.strictEqual(P.roundOf('nfl', 'AFC Divisional Playoff'), 'ds');
  assert.strictEqual(P.roundOf('wnba', 'WNBA Finals - Game 2'), 'f'); assert.strictEqual(P.roundOf('mlb', 'Spring training'), null); assert.strictEqual(P.roundOf('nfl', undefined), null);
});
t('seriesFromEvents: wins, clinch, live, next game; duplicates and odd events are ignored', () => {
  const events = [ev('1', '2026-10-24T00:00Z', 'MIL', 'TB', 'World Series - Game 1', 'post', 'MIL', 5, 4), ev('2', '2026-10-25T00:00Z', 'MIL', 'TB', 'World Series - Game 2', 'post', 'MIL', 3, 1),
    ev('3', '2026-10-26T00:00Z', 'MIL', 'TB', 'World Series - Game 3', 'post', 'MIL', 4, 2), ev('4', '2026-10-27T00:00Z', 'MIL', 'TB', 'World Series - Game 4', 'pre', null), ev('4', '2026-10-27T00:00Z', 'MIL', 'TB', 'World Series - Game 4', 'pre', null),
    { id: 'junk' }, null, ev('9', '2026-10-27T00:00Z', 'A', 'B', 'Exhibition', 'post', 'A')];
  const s = P.seriesFromEvents('mlb', events, norm); assert.strictEqual(s.length, 1);
  assert.strictEqual(s[0].bestOf, 7); assert.strictEqual(s[0].status, 'live'); assert.strictEqual(s[0].winner, null); assert.strictEqual(s[0].played, 3);
  assert.deepStrictEqual(s[0].teams.map((x) => x.wins).sort(), [0, 3]); assert.strictEqual(s[0].next.n, 4);
  assert.strictEqual(P.summaryOf(s[0], (id) => s[0].teams.find((x) => x.team.id === id)), 'MIL leads 3-0');
  const won = P.seriesFromEvents('mlb', [...events.slice(0, 3), ev('4', '2026-10-27T00:00Z', 'MIL', 'TB', 'World Series - Game 4', 'post', 'MIL', 2, 1)], norm)[0];
  assert.strictEqual(won.status, 'final'); assert.strictEqual(won.winner, 'x:MIL');
});
t('buildBracket projected: MLB shape, seeds 4v5 / 3v6, byes get placeholders', () => {
  const rows = []; for (const lg of ['AL', 'NL']) for (let i = 1; i <= 6; i++) rows.push(row(`${lg}${i}`, lg, `${lg}${i % 3}`, 100 - i, 62 + i, 10, i));
  const b = P.buildBracket('mlb', P.mlbSeeds(rows), []);
  assert.strictEqual(b.groups.length, 2); assert.deepStrictEqual(b.groups[0].rounds.map((r) => r.matchups.length), [2, 2, 1]);
  const wc = b.groups[0].rounds[0].matchups; assert.deepStrictEqual(wc[0].slots.map((s) => s.seed), [4, 5]); assert.deepStrictEqual(wc[1].slots.map((s) => s.seed), [3, 6]);
  assert.strictEqual(b.groups[0].rounds[1].matchups[0].slots[0].seed, 1); assert.ok(b.groups[0].rounds[1].matchups[0].slots[1].label);
  assert.strictEqual(b.real, false); assert.strictEqual(b.champion, null); assert.strictEqual(b.finalRounds[0].matchups[0].status, 'projected');
});
t('buildBracket real: winners advance and the champion is named', () => {
  const rows = []; for (const lg of ['AL', 'NL']) for (let i = 1; i <= 6; i++) rows.push(row(`${lg}${i}`, lg, 'd', 100 - i, 62 + i, 10, i));
  const sweep = (rid, a, b, head, games) => games.map((_, i) => ev(`${rid}${i}`, `2026-10-${10 + i}T00:00Z`, a, b, `${head} - Game ${i + 1}`, 'post', a, 3, 1));
  const evs = [...sweep('w1', 'AL4', 'AL5', 'AL Wild Card Series', [1, 2]), ...sweep('w2', 'AL3', 'AL6', 'AL Wild Card Series', [1, 2]), ...sweep('d1', 'AL1', 'AL4', 'ALDS', [1, 2, 3]), ...sweep('d2', 'AL2', 'AL3', 'ALDS', [1, 2, 3]), ...sweep('c', 'AL1', 'AL2', 'ALCS', [1, 2, 3, 4]),
    ...sweep('n1', 'NL4', 'NL5', 'NL Wild Card Series', [1, 2]), ...sweep('n2', 'NL3', 'NL6', 'NL Wild Card Series', [1, 2]), ...sweep('nd1', 'NL1', 'NL4', 'NLDS', [1, 2, 3]), ...sweep('nd2', 'NL2', 'NL3', 'NLDS', [1, 2, 3]), ...sweep('nc', 'NL1', 'NL2', 'NLCS', [1, 2, 3, 4]),
    ...sweep('ws', 'NL1', 'AL1', 'World Series', [1, 2, 3, 4])];
  const b = P.buildBracket('mlb', P.mlbSeeds(rows), P.seriesFromEvents('mlb', evs, norm));
  assert.strictEqual(b.real, true); assert.strictEqual(b.champion.id, 'x:NL1'); assert.strictEqual(b.inProgress, false);
  assert.ok(b.groups.every((g) => g.rounds.every((r) => r.matchups.every((m) => m.status === 'final'))));
  assert.strictEqual(b.finalRounds[0].matchups[0].summary, 'NL1 wins 4-0');
});
t('buildBracket NBA includes the play-in; WNBA is one ungrouped bracket with semifinal feeders', () => {
  const rows = []; for (const c of ['East', 'West']) for (let i = 1; i <= 12; i++) rows.push(row(`${c[0]}${i}`, c, c, 60 - i, 22 + i, 5));
  const nba = P.buildBracket('nba', P.nbaSeeds(rows), []); assert.deepStrictEqual(nba.groups[0].rounds.map((r) => r.name), ['Play-In', 'First Round', 'Conf. Semifinals', 'Conf. Finals']);
  const w = []; for (let i = 1; i <= 13; i++) w.push(row(i, 'x', 'x', 40 - i, 4 + i, 5));
  const wnba = P.buildBracket('wnba', P.wnbaSeeds(w), []); assert.strictEqual(wnba.groups.length, 1); assert.strictEqual(wnba.groups[0].rounds[0].matchups.length, 4);
  assert.deepStrictEqual(wnba.finalRounds[0].matchups[0].slots.map((s) => s.label), ['Semifinal winner', 'Semifinal winner']);
});
t('an unexpected extra series is shown, never dropped', () => {
  const rows = []; for (let i = 1; i <= 8; i++) rows.push(row(i, 'x', 'x', 40 - i, 4 + i, 5));
  const b = P.buildBracket('wnba', P.wnbaSeeds(rows), P.seriesFromEvents('wnba', [ev('e1', '2026-09-20T00:00Z', 'ZZ1', 'ZZ2', 'First Round - Game 1', 'post', 'ZZ1', 80, 70)], norm));
  assert.strictEqual(b.groups[0].rounds[0].matchups.length, 4 + 0); // fills an open slot rather than adding a fifth
  assert.ok(b.groups[0].rounds[0].matchups.some((m) => m.slots.some((s) => s.team && s.team.id === 'x:ZZ1')));
});
t('buildBracket throws for a sport without a plan', () => assert.throws(() => P.buildBracket('mcbb', [], [])));
console.log(`postseason: ${n} tests passed`);
