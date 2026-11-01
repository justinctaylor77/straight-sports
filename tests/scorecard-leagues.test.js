// v1.7.1: the Scorecard on every baseball/softball league the app carries (server/scorecard.js + server/scorecard-ncaa.js).
// REAL recorded fixtures (fetched 2026-10-31):
//   cbase-summary-401874451.json          ESPN college baseball, Oklahoma @ North Carolina, final (trimmed to header/boxscore/rosters/plays)
//   ncaa-softball-{pbp,box}-6599933.json  NCAA.com college softball, Texas Tech @ Texas, 2026 WCWS finals, 7 innings
//   ncaa-softball-{pbp,box}-6599920.json  NCAA.com college softball, Texas Tech @ Tennessee, 9 innings (international tiebreaker)
// AUSL: no play-by-play or lineup source exists (MLB Stats API sportId 576 has no games), so its sheet is the no-pbp shape.
// A short SYNTHETIC NCAA game (marked) covers softball wordings the real games lack: slap, dropped third strike, ITB runner.
const assert = require('assert'); const path = require('path');
const S = require('../server/scorecard.js'); const { fromNcaa, normText } = require('../server/scorecard-ncaa.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const fx = (f) => require(path.join(__dirname, 'fixtures', f));
const all = (g) => ['away', 'home'].flatMap((s) => Object.entries(g.teams[s].cells).flatMap(([k, cs]) => cs.map((c) => ({ ...c, key: k, side: s }))));
const nm = (g, c) => (g.people[c.pid] || {}).name;
const ncaa = (id) => S.build(fromNcaa(fx(`ncaa-softball-pbp-${id}.json`), fx(`ncaa-softball-box-${id}.json`), { innings: 7 }), { sport: 'softball', innings: 7, source: 'NCAA.com' });

// ---- college baseball (ESPN; plays carry only type.text, no type.type) ----
const CB = S.build(fx('cbase-summary-401874451.json'), { sport: 'cbase', innings: 9 });
ok(CB.hasPlays, 'cbase: ESPN college plays are read'); eq(CB.innings, 9, 'cbase: 9 innings'); eq(CB.source, 'ESPN', 'cbase source');
eq(CB.teams.away.slots.length, 9, 'cbase away 9 slots'); eq(CB.teams.home.slots.length, 9, 'cbase home 9 slots');
const cbCells = all(CB); ok(cbCells.length >= 70, `cbase: ${cbCells.length} at-bats drawn`); eq(cbCells.filter((c) => c.text === '?').length, 0, 'cbase: no unknown cells');
ok(cbCells.some((c) => /^K/.test(c.text) && c.looking), 'cbase: "struck out looking" -> backwards K');
eq(S.tkind({ type: { text: 'Play Result' } }), 'play-result', 'tkind slugs type.text when type.type is missing');

// ---- college softball, 7 innings (NCAA.com) ----
const F = ncaa('6599933');
ok(F.hasPlays, 'softball: NCAA.com plays read'); eq(F.innings, 7, 'softball final: 7 innings, not 9'); eq(F.regulation, 7, 'softball regulation 7'); eq(F.source, 'NCAA.com', 'softball source');
eq([F.teams.away.abbr, F.teams.away.score, F.teams.home.abbr, F.teams.home.score], ['TEXAS', '4', 'TXTECH', '1'], 'WCWS final teams/score (Texas Tech the designated home team)');
eq(F.teams.away.slots.length, 9, 'TTU 9 slots (DP/FLEX handled)'); eq(F.teams.home.slots.length, 9, 'Texas 9 slots');
const fc = all(F); eq(fc.filter((c) => c.text === '?').length, 0, 'softball: no unknown cells'); eq(fc.filter((c) => c.unread).length, 0, 'softball: nothing unread');
ok(fc.every((c) => +c.key.split('|')[1] <= 7), 'no cell past the 7th');
ok(fc.some((c) => c.text === 'HR'), 'home run drawn'); ok(fc.some((c) => c.text === 'IBB'), 'intentional walk'); ok(fc.some((c) => c.text === 'HBP'), 'hit by pitch');
ok(F.teams.away.pitchers.length === 3 && F.teams.home.pitchers.length === 1, 'pitching lines from the box score');
const runs = (T) => T.innings.reduce((s, i) => s + (i.R || 0), 0);
eq(runs(F.teams.away), 4, 'Texas runs by inning add to 4'); eq(runs(F.teams.home), 1, 'TTU runs add to 1');

// ---- college softball, extra innings (international tiebreaker) ----
const X = ncaa('6599920');
eq(X.innings, 9, 'extras extend the sheet to 9'); eq(X.regulation, 7, 'regulation stays 7');
const xc = all(X); eq(xc.filter((c) => c.text === '?').length, 0, 'extras: no unknown cells'); eq(xc.filter((c) => c.unread).length, 0, '"advanced to third, out at home" chain is read');
ok(xc.some((c) => c.key === '4|9' && c.text === 'HR' && c.side === 'home'), 'walk-off HR in the 9th');
const e6 = xc.find((c) => c.text === 'E-6'); ok(e6 && e6.kind === 'reach', 'reached on an error -> E-6, a reach not a hit');
ok(xc.some((c) => /^SAC/.test(c.text)) && xc.some((c) => /^SF/.test(c.text)), 'NCAA ", SAC" and ", SF" tokens');

// ---- normText: NCAA.com tokens ----
eq(normText('Henry singled through the right side, slap (2-2 SBBFFF).'), 'Henry singled through the right side', 'slap / pitch count stripped');
eq(normText('Davis flied out to cf, SF, RBI (1-1 KB).'), 'Davis hit sacrifice fly to center field', 'SF');
eq(normText('Leach reached on an error by ss (0-0).'), 'Leach reached on an error by shortstop', 'position words');

// ---- SYNTHETIC NCAA game: slap, dropped third strike, error, ITB runner ----
const P = (first, last, pos, i) => ({ firstName: first, lastName: last, position: pos, number: i, starter: true, participated: true, batterStats: { atBats: '1', runsScored: '0', hits: '0', runsBattedIn: '0', walks: '0', strikeouts: '0' } });
const A = ['Ann Ash', 'Bea Bell', 'Cat Cole', 'Dee Dorn', 'Eve Egan', 'Fay Ford', 'Gia Gray', 'Hal Hart', 'Ivy Irwin'].map((x, i) => P(...x.split(' '), ['cf', 'ss', 'c', '1b', '3b', 'lf', 'rf', '2b', 'p'][i], i));
const H = ['Jo Jones', 'Kim Kane', 'Liz Lee', 'May Moss', 'Nan Nash', 'Ola Orr', 'Pam Penn', 'Quin Quay', 'Rae Ruiz'].map((x, i) => P(...x.split(' '), ['cf', 'ss', 'c', '1b', '3b', 'lf', 'rf', '2b', 'p'][i], i));
const half = (tid, plays) => plays.map((t) => ({ teamId: tid, plays: [{ playText: t }] }));
const outs3 = (tid, names) => half(tid, ['Batting starts', ...names.map((x) => `${x} grounded out to 2b (0-0).`), 'Batting ends R: 0 H: 0 E: 0']);
const periods = [];
for (let i = 1; i <= 7; i++) periods.push({ periodNumber: i, periodDisplay: `${i}`, playbyplayStats: [...(i === 1 ? half(1, ['Batting starts', 'Ash singled to shortstop, slap (1-0 B).', 'Bell struck out swinging, reached first on a wild pitch (3-2).', 'Cole reached on an error by 3b; Ash advanced to second (0-0).', 'Dorn flied out to lf (0-0).', 'Egan grounded out to p (0-0).', 'Ford grounded out to ss (0-0).', 'Batting ends R: 0 H: 1 E: 0']) : outs3(1, ['Ash', 'Bell', 'Cole'])), ...outs3(2, ['Jones', 'Kane', 'Lee'])] });
periods.push({ periodNumber: 8, periodDisplay: '8th', playbyplayStats: [...half(1, ['Batting starts', 'Gray singled to cf; Fay Ford advanced to third (0-0).', 'Hart flied out to cf, SF, RBI; Ford scored (0-0).', 'Irwin grounded out to ss (0-0).', 'Ash grounded out to 2b (0-0).', 'Batting ends R: 1 H: 1 E: 0']), ...outs3(2, ['Moss', 'Nash', 'Orr'])] });
const pbp = { status: 'final', teams: [{ teamId: '1', isHome: false, name6Char: 'AAA', nameShort: 'Away U' }, { teamId: '2', isHome: true, name6Char: 'HHH', nameShort: 'Home U' }], periods };
const box = { teams: pbp.teams, teamBoxscore: [{ teamId: '1', playerStats: A }, { teamId: '2', playerStats: H }] };
const Y = S.build(fromNcaa(pbp, box, { innings: 7 }), { sport: 'softball', innings: 7, source: 'NCAA.com' });
const yc = all(Y);
eq(Y.innings, 8, 'synthetic: 8th inning added');
const slap = yc.find((c) => c.key === '1|1'); ok(slap && slap.text === '1B' && slap.kind === 'hit', 'slap single -> 1B');
const d3 = yc.find((c) => c.key === '2|1'); ok(d3 && d3.text === 'K-WP' && d3.kind === 'reach' && !d3.out, 'NCAA "struck out swinging, reached first on a wild pitch" -> K-WP, not an out');
const d3b = S.batterResult ? S.batterResult('Bell struck out, dropped third strike, reached first') : null; if (d3b) eq(d3b.text, 'K-D3', 'dropped third strike, reached -> K-D3');
const er = yc.find((c) => c.key === '3|1'); ok(er && /^E/.test(er.text) && er.kind === 'reach', 'reached on error -> E, a reach');
const itb = yc.find((c) => c.kind === 'placed'); ok(itb && itb.text === 'ITB' && itb.inn === 8, 'tiebreaker runner drawn as placed (ITB) in the 8th, not a hit');
ok(itb && nm(Y, itb) === 'Fay Ford' && itb.scored, 'ITB runner is the batter before the leadoff, and her run is shaded');
ok(!yc.some((c) => c.inn === 8 && c.text === '1B' && nm(Y, c) === 'Fay Ford'), 'no hit invented for the placed runner');
eq(yc.filter((c) => c.text === '?').length, 0, 'synthetic: no unknown cells');

// ---- AUSL: no play-by-play source -> teams + score + the note, empty lineup, never invented plays ----
(async () => {
  const cache = new Map(); const cached = async (k, ttl, fn) => fn();
  const team = (abbr, name) => ({ team: { id: `ausl:${abbr}`, abbr, name, logo: null } });
  const SP = { SPORTS: { ausl: { family: 'baseball' }, softball: { family: 'baseball' } }, AUSL: { cast: async () => ({ state: 'post', detail: 'Final/8', date: '2026-07-18T23:00Z', away: { ...team('OKC', 'Oklahoma City Spark'), score: 12 }, home: { ...team('UTA', 'Utah Talons'), score: 11 } }) } };
  const R = require('../server/scorecard-route.js')({ cached, cache, fetchJSON: async () => { throw new Error('no network in tests'); }, SP, FEEDS: null });
  const a = await R.route({ params: { sport: 'ausl', id: '2026071802' } });
  eq(a.note, 'Play-by-play isn’t available for this league, so the sheet can’t fill in', 'AUSL note');
  ok(!a.hasPlays && a.teams.away.slots.length === 0 && Object.keys(a.teams.home.cells).length === 0, 'AUSL: no plays, no lineup, no cells');
  eq([a.teams.away.abbr, a.teams.away.score, a.teams.home.abbr, a.teams.home.score], ['OKC', '12', 'UTA', '11'], 'AUSL teams + score');
  eq([a.innings, a.regulation], [8, 7], 'AUSL: 7-inning sheet, extended to 8 for Final/8');
  await assert.rejects(R.route({ params: { sport: 'softball', id: '401874451' } }), /NCAA/, 'softball wants an NCAA id'); n++;
  await assert.rejects(R.route({ params: { sport: 'nfl', id: '1' } }), /baseball/, 'non-baseball rejected'); n++;
  console.log(`scorecard-leagues: ${n} assertions passed`);
})();
