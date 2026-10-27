// NCAA.com / Road to Nationals normalizers and the Utah / BYU / Big 12 tagger. Real (trimmed) NCAA.com 2026 bracket JSON in tests/fixtures.
// Run: node tests/ncaa.test.js
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const N = require('../server/ncaa'); const H = require('../server/highlight');
const fx = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8')).championships[0];
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };

t('dateFromUpdated parses NCAA "Through Games" stamps, rejects junk', () => {
  assert.strictEqual(N.dateFromUpdated('Through Games JUN. 23, 2026'), '2026-06-23'); assert.strictEqual(N.dateFromUpdated('Through Games Oct. 5, 2026'), '2026-10-05'); assert.strictEqual(N.dateFromUpdated('Through games Sept 9, 2026'), '2026-09-09');
  assert.strictEqual(N.dateFromUpdated('whenever'), null); assert.strictEqual(N.dateFromUpdated(null), null);
});
t('clean / toNum', () => { assert.strictEqual(N.clean('D1Baseball.com&#174; Top 25 &amp; more'), 'D1Baseball.com Top 25 & more'); assert.strictEqual(N.toNum('1,234'), 1234); assert.strictEqual(N.toNum('--'), null); assert.strictEqual(N.toNum(undefined), null); });
t('pollFromNcaa: ranks, first-place votes, previous rank, NR, bad rows skipped, sorted', () => {
  const p = N.pollFromNcaa({ title: 'AP Top 25', updated: 'Through Games MAR. 8, 2026', data: [
    { RANK: '2', TEAM: 'Duke', RECORD: '20-3', POINTS: '1,400', 'PREVIOUS RANK': '1' }, { RANK: '1', TEAM: 'Florida (45)', RECORD: '22-1', POINTS: '1,500', 'PREVIOUS RANK': 'NR' }, { RANK: '', TEAM: 'Ghost' }, { RANK: '3' }, { RANK: '4', TEAM: 'Utah', 'OVERALL RECORD': '18-5' }] });
  assert.deepStrictEqual(p.rows.map((r) => r.rank), [1, 2, 4]); assert.strictEqual(p.rows[0].name, 'Florida'); assert.strictEqual(p.rows[0].fpv, 45); assert.strictEqual(p.rows[0].prevNR, true); assert.strictEqual(p.rows[0].prev, null);
  assert.strictEqual(p.rows[1].points, 1400); assert.strictEqual(p.rows[1].prev, 1); assert.strictEqual(p.rows[2].record, '18-5'); assert.strictEqual(p.date, '2026-03-08');
  assert.deepStrictEqual(N.pollFromNcaa(null).rows, []);
});
t('basketballBracket: real 2026 men’s field → 4 regions, Final Four, champion Michigan', () => {
  const b = N.basketballBracket(fx('ncaa-mbb-2026.json'), null);
  assert.strictEqual(b.groups.length, 4); assert.deepStrictEqual(b.groups.map((g) => g.name).sort(), ['East', 'Midwest', 'South', 'West']);
  for (const g of b.groups) { const r = g.rounds.find((x) => x.id === 'r2'); assert.strictEqual(r.matchups.length, 8); assert.strictEqual(g.rounds.find((x) => x.id === 'r5').matchups.length, 1); }
  assert.deepStrictEqual(b.finalRounds.map((r) => r.matchups.length), [2, 1]); assert.ok(/Michigan/.test(b.champion.short)); assert.strictEqual(b.gamesPlayed, b.gamesTotal); assert.strictEqual(b.gamesTotal, 67);
  assert.ok(b.groups.every((g) => g.rounds.every((r) => r.matchups.every((m) => m.slots.length === 2 && !('victor' in m)))));
});
t('basketballBracket: empty / null → null, TBD slots stay TBD', () => {
  assert.strictEqual(N.basketballBracket({ games: [] }, null), null); assert.strictEqual(N.basketballBracket(null, null), null);
  const c = fx('ncaa-mbb-2026.json'); const g = c.games.find((x) => Math.floor(x.bracketId / 100) === 7);
  const copy = JSON.parse(JSON.stringify(c)); const cg = copy.games.find((x) => x.bracketId === g.bracketId); cg.gameState = 'P'; cg.teams = []; cg.teams.length = 0;
  const b = N.basketballBracket(copy, null); assert.strictEqual(b.champion, null); assert.strictEqual(b.finalRounds[1].matchups[0].slots[0].label, 'TBD');
});
t('seriesBracket: real 2026 baseball → Regionals(16) / Super Regionals(8) / MCWS / Finals, champion Oklahoma', () => {
  const b = N.seriesBracket({ ...fx('ncaa-baseball-2026.json'), sportUrl: 'baseball' }, null);
  assert.deepStrictEqual(b.stages.map((s) => [s.name, s.sections.length]), [['Regionals', 16], ['Super Regionals', 8], ['Men’s College World Series', 2], ['MCWS Finals (best of 3)', 1]]);
  assert.ok(/Oklahoma/.test(b.champion.short)); assert.ok(b.runnerUp && b.runnerUp.short !== b.champion.short); assert.deepStrictEqual(b.stages.map((s) => s.kind), ['double-elim', 'series', 'double-elim', 'series']);
  assert.ok(b.stages[0].sections.every((s) => s.complete && s.advancer && s.teams.length === 4)); assert.ok(b.stages[1].sections.every((s) => s.complete));
  assert.ok(b.stages.every((s) => s.sections.every((x) => x.games.every((g) => g.slots.length === 2))));
  assert.strictEqual(N.seriesBracket({ games: [] }, null), null);
});
t('seriesBracket: softball gets the WCWS names', () => {
  const b = N.seriesBracket({ ...fx('ncaa-baseball-2026.json'), sportUrl: 'softball' }, null); assert.ok(b.stages.some((s) => /Women’s College World Series/.test(s.name)));
});
t('gymRanking / gymHistory', () => {
  const r = N.gymRanking({ data: [{ rank: '2', team_name: 'LSU', average_score: '197.1', high_score: '198', rqs: '197.5', team_id: 3 }, { rank: '1', team_name: 'Oklahoma', average_score: '197.9' }, { rank: '', team_name: 'x' }, { rank: '3' }] });
  assert.deepStrictEqual(r.map((x) => x.name), ['Oklahoma', 'LSU']); assert.strictEqual(r[1].avg, 197.1); assert.strictEqual(r[1].high, 198); assert.deepStrictEqual(N.gymRanking(null), []);
  const h = N.gymHistory({ data: [{ Year: '2025', Champion: 'Oklahoma', Coach: 'K.J. Kindler', Points: '198.0', 'Runner-Up': 'LSU', 'Host or Site': 'Fort Worth' }, { Year: '2026', Champion: 'Oklahoma', Points: '198.075', 'Runner-Up': 'LSU' }, { Year: '2027', Champion: '', Points: '' }] }, 2026);
  assert.strictEqual(h.rows[0].year, 2027); assert.strictEqual(h.current.year, 2026); assert.strictEqual(h.current.points, 198.075);
  assert.strictEqual(N.gymHistory({ data: [{ Year: '2027', Champion: '', Points: '' }] }, 2027).current, null); // a future year with no result is never a champion
  assert.ok(N.GYM_FORMAT.length >= 4);
});
t('highlight: Utah / BYU / Big 12 flags, aliases, non-members untouched, decorate walks payloads', () => {
  assert.deepStrictEqual(H.flagsFor({ short: 'Utah' }), { big12: 'Utah', spot: 'utah' }); assert.deepStrictEqual(H.flagsFor({ name: 'Brigham Young Cougars' }), { big12: 'BYU', spot: 'byu' });
  assert.deepStrictEqual(H.flagsFor({ short: 'Iowa St' }), { big12: 'Iowa State', spot: null }); assert.deepStrictEqual(H.flagsFor({ short: 'Kansas State' }), { big12: 'Kansas State', spot: null });
  assert.strictEqual(H.flagsFor({ short: 'Utah State' }), null); assert.strictEqual(H.flagsFor({ short: 'Michigan' }), null); assert.strictEqual(H.flagsFor(null), null);
  assert.strictEqual(Object.keys(H.BIG12).length, 16);
  // pro franchises share place names with Big 12 schools: never flagged (found in QA: Bengals/Cincinnati, Texans/Houston, Cardinals/Arizona, Jazz/Utah)
  for (const id of ['nfl:4', 'nba:26', 'mlb:18', 'wnba:3']) assert.strictEqual(H.flagsFor({ id, short: 'X', location: 'Utah' }), null);
  assert.strictEqual(H.flagsFor({ id: 'nfl:4', short: 'Bengals', location: 'Cincinnati' }), null); assert.ok(H.flagsFor({ id: 'mcbb:2132', short: 'Cincinnati' }));
  const p = { rows: [{ rank: 1, team: { name: 'Utah Utes', short: 'Utah', logo: 'x' } }, { rank: 2, team: { name: 'Duke', short: 'Duke', logo: 'x' } }] }; H.decorate(p);
  assert.strictEqual(p.rows[0].team.hl.spot, 'utah'); assert.strictEqual(p.rows[1].team.hl, undefined); assert.strictEqual(p.rows[0].rank, 1);
});
console.log(`ncaa+highlight: ${n} tests passed`);
