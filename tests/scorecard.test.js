// v1.7.0 Scorekeeper: play-by-play -> paper scorebook cells (server/scorecard.js).
// Real ESPN MLB finals recorded 2026-10-31: tests/fixtures/mlb-summary-401908043.json (TB @ MIL, 9 inn.) and
// mlb-summary-401908045.json (MIL @ TB, Final/12: pinch hitters/runners, DP, errors, extra innings).
// Short SYNTHETIC sentences (marked) cover wordings neither game contains (sac fly, IBB, triple play, unreadable text).
const assert = require('assert'); const path = require('path');
const S = require('../server/scorecard.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const load = (id) => S.build(require(path.join(__dirname, 'fixtures', `mlb-summary-${id}.json`)), { sport: 'mlb' });
const G1 = load('401908043'), G2 = load('401908045');
const cell = (g, side, slotInn, name) => { const cs = g.teams[side].cells[slotInn] || []; const c = cs.find((x) => !name || g.people[x.pid].name === name); ok(c, `${side} ${slotInn} ${name || ''} has a cell`); return c; };

// shape
for (const g of [G1, G2]) { eq(g.state, 'post', 'final'); ok(g.hasPlays && !g.live && g.current === null, 'final: no current batter'); for (const s of ['away', 'home']) { eq(g.teams[s].slots.length, 9, `${s} 9 slots`); ok(g.teams[s].pitchers.length > 0, 'pitcher lines'); } }
eq([G1.teams.away.abbr, G1.teams.home.abbr, G1.teams.away.score, G1.teams.home.score], ['TB', 'MIL', '4', '5'], 'G1 teams/score');

// single (+ stolen base updates that earlier cell's diamond), double, HR with RBIs, walk
let c = cell(G1, 'away', '3|1', 'Chandler Simpson'); eq([c.text, c.path, c.scored, c.rbi], ['1B', [1, 2, 3, 4], true, 1], 'single, later scored');
ok(c.notes.some((x) => x.base === 2 && x.how === 'SB'), 'stolen base noted on the single\'s cell');
c = cell(G2, 'away', '7|4', 'Cooper Pratt'); eq([c.text, c.rbi, c.path.includes(2)], ['2B', 1, true], 'RBI double reaches second');
ok(c.notes.some((x) => x.base === 3 && x.how === 'WP'), 'wild pitch advance drawn later on the double\'s cell');
c = cell(G1, 'away', '5|1', 'Liam Hicks'); eq([c.text, c.rbi, c.scored, c.path], ['HR', 2, true, [1, 2, 3, 4]], 'two-run HR: 2 RBI, full diamond filled');
c = cell(G1, 'away', '8|2', 'Victor Mesa Jr.'); eq([c.text, c.kind, c.path[0]], ['BB', 'reach', 1], 'walk');

// K swinging vs looking
c = cell(G1, 'away', '9|4', 'Taylor Walls'); eq([c.text, c.looking, c.out], ['K', true, 3], 'called third strike (renders as backwards K), third out');
ok(c.end, 'slash: last out ends the half inning');
c = cell(G1, 'away', '2|1', 'Jonathan Aranda'); eq([c.text, c.looking], ['K', false], 'swinging K');

// fielding outs
const all = (g) => ['away', 'home'].flatMap((s) => Object.values(g.teams[s].cells).flat());
ok(all(G1).concat(all(G2)).some((x) => x.text === '6-3'), 'a 6-3 groundout');
ok(all(G1).concat(all(G2)).some((x) => x.text === 'F8'), 'an F8 flyout');
c = cell(G2, 'home', '2|6', 'Jonathan Aranda'); ok(/^DP /.test(c.text), 'double play shorthand'); 
// error
c = cell(G1, 'away', '1|1', 'Yandy Diaz'); eq([c.text, c.kind], ['E-6', 'reach'], 'reached on error E-6');
c = cell(G1, 'home', '9|4', 'David Hamilton'); eq(c.text, 'E-3', 'batter clause found even when a runner clause leads the sentence');
// pinch hitter listed under the slot he replaced
const slot5 = G1.teams.away.slots.find((s) => s.order === 5).players.map((id) => G1.people[id].name);
eq(slot5[0], 'Liam Hicks', 'starter first'); ok(slot5.includes('Ryan Vilade'), 'PH under the slot he replaced');
c = cell(G1, 'away', '5|8', 'Ryan Vilade'); ok(c.sub, 'PH cell marked as substitute');
// pinch runner keeps the batter's diamond going
c = cell(G2, 'home', '4|12', 'Liam Hicks'); eq([c.scored, !!c.pr], [true, true], 'PR scores: batter\'s cell filled, pinch runner recorded');
// extra innings
eq(G2.innings, 12, 'extra innings extend the grid'); ok(G2.teams.away.innings.some((x) => x.inn === 12), 'inning 12 footer');
c = cell(G2, 'away', '7|12', 'Cooper Pratt'); eq(c.text, 'HR', '12th-inning HR');
// footer R/H matches the linescore, LOB is a number
const sumR = (t) => t.innings.reduce((a, x) => a + (+x.R || 0), 0);
eq(sumR(G1.teams.home), 5, 'MIL runs by inning add to 5'); ok(G1.teams.home.innings.filter((x) => x.inn <= 8).every((x) => typeof x.LOB === 'number'), 'LOB per inning played'); ok(G1.teams.home.innings.find((x) => x.inn === 9).LOB == null, 'unplayed bottom 9th left blank (not invented)');
// out numbers never exceed 3; no outs on reaches
ok(all(G1).concat(all(G2)).every((x) => x.out == null || (x.out >= 1 && x.out <= 3)), 'out numbers 1-3');

// SYNTHETIC wordings
eq(S.batterResult('Smith hit sacrifice fly to center, Jones scored.').text, 'SF8', 'sac fly');
eq(S.batterResult('Smith intentionally walked.').text, 'IBB', 'IBB');
eq(S.batterResult('Smith grounded into triple play, third to second to first.').text, 'TP 5-4-3', 'triple play');
eq(S.batterResult('Smith did something odd.').text, '?', 'unreadable play is "?" (never guessed)');
eq(S.batterResult('Smith flied out to center.').text, 'F8', 'F8'); eq(S.batterResult('Smith grounded out to shortstop.').text, '6-3', '6-3');

// live: truncate the real final mid-game -> current batter and LIVE
{
  const raw = JSON.parse(JSON.stringify(require(path.join(__dirname, 'fixtures', 'mlb-summary-401908043.json'))));
  const i = raw.plays.findIndex((p) => p.period && p.period.number === 5 && p.type && p.type.type === 'start-batterpitcher');
  raw.plays = raw.plays.slice(0, i + 1); raw.header.competitions[0].status.type.state = 'in'; raw.header.competitions[0].status.type.completed = false;
  const L = S.build(raw, { sport: 'mlb' }); ok(L.live && L.current && L.current.inn === 5, 'live: current batter in the 5th'); ok(L.innings === 9, 'live grid still shows 9');
}
// pre-game: lineup only, no plays
{ const raw = JSON.parse(JSON.stringify(require(path.join(__dirname, 'fixtures', 'mlb-summary-401908043.json')))); raw.plays = []; raw.header.competitions[0].status.type.state = 'pre'; const P = S.build(raw, { sport: 'mlb' }); eq([P.state, P.hasPlays], ['pre', false], 'pre-game'); }
console.log(`scorecard: ${n} assertions passed`);
