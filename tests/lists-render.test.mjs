// Client render helpers for Rankings & Brackets (public/lists.js): routing, picker order, escaping, every state's markup.
// Run: node tests/lists-render.test.mjs
import assert from 'node:assert/strict';
import { FEED, esc, parseHash, pickerOrder, moveChip, makeRender } from '../public/lists.js';
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const R = makeRender({ logo: (x) => (x ? x.logo : ''), myTeamIds: () => new Set(['nfl:1']) });
const team = (id, short, extra = {}) => ({ id, sport: id.split(':')[0], name: short, short, abbr: short, logo: `/l/${id}.png`, color: 'cc0000', ...extra });

t('FEED is the ten sports', () => assert.deepEqual([...FEED].sort(), ['ausl', 'cbase', 'gymnastics', 'mcbb', 'mlb', 'nba', 'nfl', 'softball', 'wcbb', 'wnba']));
t('parseHash: hub, list, playoffs, existing CFB routes untouched', () => {
  assert.deepEqual(parseHash('#/rankings/lists'), { page: 'lists', sport: '' }); assert.deepEqual(parseHash('#/rankings/list/nfl'), { page: 'list', sport: 'nfl' }); assert.deepEqual(parseHash('#/rankings/playoffs/mcbb'), { page: 'playoffs', sport: 'mcbb' });
  assert.equal(parseHash('#/rankings/bracket'), null); assert.equal(parseHash('#/rankings/grok'), null); assert.equal(parseHash('#/rankings'), null); assert.equal(parseHash(''), null); assert.equal(parseHash(undefined), null);
});
t('pickerOrder: current sport first, chosen sports next, then everything (no duplicates)', () => {
  const o = pickerOrder({ sport: 'mlb', sportsChosen: true, sports: ['cfb', 'nfl', 'mlb'] }); assert.deepEqual(o.slice(0, 2), ['mlb', 'nfl']); assert.equal(o.length, 10); assert.equal(new Set(o).size, 10);
  const d = pickerOrder({ sport: 'cfb', sportsChosen: false, sports: ['cfb', 'nfl'] }); assert.deepEqual(d, FEED); // nothing chosen → catalog order, never hides a sport
  assert.equal(pickerOrder({ sport: 'golf', sportsChosen: true, sports: ['golf'] }).length, 10);
});
t('esc escapes HTML and tolerates null', () => { assert.equal(esc('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;'); assert.equal(esc(null), ''); assert.equal(esc(0), '0'); });
t('moveChip', () => { assert.match(moveChip(3), /▲3/); assert.match(moveChip(-2), /▼2/); assert.match(moveChip(0), /mv eq/); assert.match(moveChip('new'), /NEW/); assert.equal(moveChip(null), ''); assert.equal(moveChip(undefined), ''); });
t('row: escapes names, links pro teams to their schedule, college rows stay plain, tags Utah/BYU/Big 12, marks my team', () => {
  const d = { sport: 'nfl', kind: 'computed' };
  const h = R.row({ rank: 1, team: team('nfl:1', '<b>Evil</b>'), record: '6-0', score: 77.33, move: 2, why: '6-0 · +8.5 points/game' }, d);
  assert.doesNotMatch(h, /<b>Evil/); assert.match(h, /href="#\/schedule\/nfl:1"/); assert.match(h, /77\.3/); assert.match(h, /mine/); assert.match(h, /▲2/); assert.doesNotMatch(h, /class="rec"/); // record not repeated in computed rows
  const c = R.row({ rank: 2, team: team('cbase:9', 'Utah', { hl: { spot: 'utah', big12: 'Utah' } }), record: '40-10', points: 1400, fpv: 3 }, { sport: 'cbase', kind: 'poll' });
  assert.doesNotMatch(c, /<a /); assert.match(c, /spot/); assert.match(c, /1400/); assert.match(c, /\(3\)/);
  assert.match(R.row({ rank: 5, team: team('mcbb:4', 'Kansas', { hl: { big12: 'Kansas' } }) }, { sport: 'mcbb', kind: 'poll' }), /Big 12/);
});
t('listBody: poll tabs only with 2+ polls, empty list message, snapshot sentence, method card, no invented rows', () => {
  const base = { sport: 'mcbb', name: 'M', title: 'AP', kind: 'poll', state: 'preseason', source: { name: 'ESPN', url: 'https://x' }, method: { short: 'm', formula: ['f1'], caveats: ['c1'] }, notes: ['Preseason poll'] };
  const one = R.listBody({ ...base, polls: [{ id: 'ap', name: 'AP', rows: [{ rank: 1, team: team('mcbb:1', 'Florida') }] }] });
  assert.doesNotMatch(one, /data-lbpoll/); assert.match(one, /Florida/); assert.match(one, /Preseason poll/); assert.match(one, /How this list is built/); assert.match(one, /f1/); assert.match(one, /c1/);
  const two = R.listBody({ ...base, polls: [{ id: 'ap', name: 'AP', rows: [{ rank: 1, team: team('mcbb:1', 'Florida') }] }, { id: 'usa', name: 'Coaches', rows: [{ rank: 1, team: team('mcbb:2', 'Duke') }] }] }, 'usa');
  assert.match(two, /data-lbpoll="usa"/); assert.match(two, /Duke/); assert.doesNotMatch(two, /Florida/);
  assert.match(R.listBody({ ...base, rows: [], polls: [] }), /no rows right now/);
  assert.match(R.listBody({ ...base, rows: [{ rank: 1, team: team('x', 'A') }], snapshot: { first: true } }), /No earlier snapshot/);
  assert.match(R.listBody({ ...base, rows: [{ rank: 1, team: team('x', 'A') }], snapshot: { first: false, prevDate: '2026-10-20' } }), /Movement compares with the Oct 20, 2026/);
});
t('listBody: gymnastics shows average / high; computed shows points', () => {
  const g = R.listBody({ sport: 'gymnastics', kind: 'ranking', name: 'G', title: 'T', state: 'offseason', source: { name: 'RTN' }, rows: [{ rank: 1, team: team('mcbb:201', 'Oklahoma'), avg: 197.9, high: 198.5 }] });
  assert.match(g, /197\.900/); assert.match(g, /198\.500/);
});
t('bracketTabs: 4 regions + separate Final Four tab; 2 conferences get finals appended; single group (WNBA) too', () => {
  const rnd = (id) => ({ id, name: id, matchups: [{ id: id + '1', slots: [] }] }); const fin = [{ id: 'f', name: 'Finals', matchups: [{ id: 'f1', slots: [] }] }];
  const four = R.bracketTabs({ groups: ['E', 'W', 'S', 'M'].map((x) => ({ id: x, name: x, rounds: [rnd('r1')] })), finalRounds: fin }); assert.deepEqual(four.map((x) => x.name), ['E', 'W', 'S', 'M', 'Final Four']); assert.equal(four[4].rounds.length, 1); assert.equal(four[0].rounds.length, 1);
  const two = R.bracketTabs({ groups: ['AL', 'NL'].map((x) => ({ id: x, name: x, rounds: [rnd('r1')] })), finalRounds: fin }); assert.deepEqual(two.map((x) => x.name), ['AL', 'NL']); assert.equal(two[0].rounds.length, 2);
  assert.equal(R.bracketTabs({ groups: [{ id: 'p', name: 'Playoffs', rounds: [rnd('r1')] }], finalRounds: fin }).length, 1);
});
t('matchup: series score, live badge, next game, TBD label, projected; scores escaped', () => {
  const m = { id: 'x', bestOf: 7, status: 'live', summary: 'MIL leads 3-0', next: { n: 4, detail: '10/27 - 8:00 PM EDT' }, slots: [{ team: team('mlb:8', 'Brewers'), seed: 1, wins: 3, winner: false }, { team: null, label: 'Winner TBD', seed: null }] };
  const h = R.matchup({ ...m, _sport: 'mlb' }); assert.match(h, /Best of 7 · MIL leads 3-0/); assert.match(h, /LIVE/); assert.match(h, /Next: Game 4/); assert.match(h, /Winner TBD/); assert.match(h, /lb-sc">3</);
  assert.match(R.matchup({ id: 'p', bestOf: 1, status: 'projected', slots: [] }), /Projected/);
});
t('playoffsBody: each state renders a hero + the right body', () => {
  const hero = { sport: 'mlb', name: 'MLB', kind: 'bracket', headline: 'MLB postseason in progress', notes: ['Real results'], format: ['12 teams'], source: { name: 'ESPN', url: 'https://e' }, asOf: '2026-10-27' };
  const grp = (id) => ({ id, name: id, rounds: [{ id: 'wc', name: 'Wild Card', matchups: [{ id: 'm', bestOf: 3, status: 'final', summary: 'NYY wins 2-0', slots: [{ team: team('mlb:1', 'Yankees'), seed: 4, wins: 2, winner: true }, { team: team('mlb:2', 'Red Sox'), seed: 5, wins: 0 }] }] }] });
  const live = R.playoffsBody({ ...hero, state: 'live', bracket: { groups: [grp('AL'), grp('NL')], finalRounds: [{ id: 'ws', name: 'World Series', matchups: [{ id: 'f', bestOf: 7, status: 'projected', slots: [] }] }], champion: null } });
  assert.match(live, /postseason in progress/); assert.match(live, /data-lbgroup="AL"/); assert.match(live, /NYY wins 2-0/); assert.match(live, /World Series/); assert.match(live, /Format/); assert.doesNotMatch(live, /national champion/);
  const done = R.playoffsBody({ ...hero, state: 'complete', headline: 'X won', bracket: { groups: [grp('AL'), grp('NL')], finalRounds: [], champion: team('mlb:8', 'Brewers') } }); assert.match(done, /national champion/); assert.match(done, /Brewers/);
  const none = R.playoffsBody({ ...hero, sport: 'mcbb', state: 'none', headline: 'bracket not available yet', bracket: null, stages: null }); assert.match(none, /Not available yet/);
  const stages = R.playoffsBody({ ...hero, sport: 'cbase', state: 'complete', headline: 'Oklahoma won', champion: team('cbase:1', 'Oklahoma'), runnerUp: team('cbase:2', 'Texas'), stages: [{ id: 'st1', name: 'Regionals', kind: 'double-elim', sections: [{ id: 's1', name: 'Norman', complete: true, advancer: team('cbase:1', 'Oklahoma'), teams: [{ team: team('cbase:1', 'Oklahoma'), seed: 1, wins: 3 }], games: [{ id: 'g', date: '5/29', slots: [{ team: team('cbase:1', 'Oklahoma'), score: 5, winner: true }, { team: team('cbase:3', 'X'), score: 1 }] }] }] }, { id: 'st2', name: 'Super Regionals', kind: 'series', sections: [] }] });
  assert.match(stages, /data-lbstage="st1"/); assert.match(stages, /Norman/); assert.match(stages, /1 game/); assert.match(stages, /Beat Texas/);
  const gym = R.playoffsBody({ sport: 'gymnastics', name: 'G', kind: 'championship', state: 'complete', headline: '2026 NCAA Women’s Gymnastics Championship: Oklahoma', notes: [], format: ['four events'], source: { name: 'NCAA.com' }, links: [{ name: 'RTN', url: 'https://rtn' }], champion: { year: 2026, team: team('mcbb:201', 'Oklahoma'), score: 198.075, coach: 'K.J. Kindler', runnerUp: team('mcbb:99', 'LSU'), site: 'Fort Worth' }, history: [{ year: 2025, champion: team('x', 'Oklahoma'), runnerUp: team('y', 'LSU'), points: 197 }] });
  assert.match(gym, /Beat LSU/); assert.match(gym, /198\.075/); assert.match(gym, /no single-elimination bracket/i); assert.match(gym, /four events/); assert.match(gym, /Recent champions/);
});
t('oneSeedBox only when the server supplies it', () => { assert.equal(R.oneSeedBox({}), ''); assert.match(R.oneSeedBox({ oneSeeds: [{ team: team('a', 'Duke') }] }), /Duke/); });
console.log(`lists-render: ${n} tests passed`);
