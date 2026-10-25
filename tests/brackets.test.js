// 12-team CFP bracket rules + CFP detection. Run: node tests/brackets.test.js
const assert = require('assert');
const fs = require('fs'); const path = require('path');
const { buildBracket, rowsFromEspnRanking, isCfp, legacyBracket } = require('../server/brackets');

let n = 0;
const mk = (list) => list.map(([name, conf, id], i) => ({ order: i + 1, rank: i + 1, id: id || `t${i}`, name, short: name, conference: conf, record: '1-0' }));
const seedNames = (b) => b.seeds.map((s) => s.short);
const t = (name, fn) => { fn(); n++; };

t('top 12 with 4 P4 champs + G6 + ND: seeds follow rank, top 4 get byes', () => {
  const rows = mk([['A', 'Big Ten'], ['B', 'SEC'], ['A2', 'Big Ten'], ['C', 'ACC'], ['D', 'Big 12'], ['E', 'SEC'], ['F', 'SEC'], ['G', 'Big Ten'], ['H', 'ACC'], ['I', 'Big 12'], ['J', 'Sun Belt'], ['K', 'SEC'], ['L', 'SEC']]);
  const b = buildBracket(rows);
  assert.strictEqual(b.seeds.length, 12);
  assert.deepStrictEqual(b.seeds.map((s) => s.bye), [true, true, true, true, false, false, false, false, false, false, false, false]);
  assert.strictEqual(b.seeds[0].short, 'A'); assert.strictEqual(b.seeds[0].type, 'champ');
  assert.strictEqual(b.seeds[2].type, 'atlarge'); // A2 is not a projected champion
});
t('an auto-qualifier ranked outside the top 12 takes the last seed and bumps the 12th-ranked team', () => {
  const list = []; for (let i = 0; i < 11; i++) list.push([`P${i}`, 'SEC']);
  list.push(['Z', 'SEC']); list.push(['Y', 'Big Ten']); list.push(['X', 'ACC']); list.push(['W', 'Big 12']); list.push(['V', 'MAC']);
  const rows = mk(list);
  const b = buildBracket(rows);
  assert.strictEqual(b.seeds[11].short, 'V'); assert.strictEqual(b.seeds[11].type, 'g6');
  assert.ok(!seedNames(b).includes('Z'));
  assert.strictEqual(b.out[0].short, 'P8'); assert.match(b.out[0].reason, /bumped/);
  assert.deepStrictEqual(seedNames(b), ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'Y', 'X', 'W', 'V']);
});
t('highest-ranked G6 team gets the bid (champion or not), only one', () => {
  const rows = mk([['A', 'SEC'], ['B', 'Big Ten'], ['C', 'ACC'], ['D', 'Big 12'], ['G6a', 'Mountain West'], ['G6b', 'Sun Belt'], ['E', 'SEC'], ['F', 'SEC'], ['G', 'SEC'], ['H', 'SEC'], ['I', 'SEC'], ['J', 'SEC'], ['K', 'SEC']]);
  const b = buildBracket(rows);
  assert.strictEqual(b.topG6.short, 'G6a');
  assert.strictEqual(b.seeds.filter((s) => s.type === 'g6').length, 1);
  assert.ok(seedNames(b).includes('G6a')); assert.ok(seedNames(b).includes('J'));
});
t('Notre Dame is automatic only inside the top 12', () => {
  const base = [['A', 'SEC'], ['B', 'Big Ten'], ['C', 'ACC'], ['D', 'Big 12'], ['G6', 'MAC'], ['E', 'SEC'], ['F', 'SEC'], ['G', 'SEC'], ['H', 'SEC'], ['I', 'SEC'], ['J', 'SEC'], ['K', 'SEC']];
  const inside = mk([...base.slice(0, 5), ['Notre Dame', 'Independents', '87'], ...base.slice(5), ['L', 'SEC']]);
  assert.ok(seedNames(buildBracket(inside)).includes('Notre Dame'));
  assert.strictEqual(buildBracket(inside).seeds.find((s) => s.short === 'Notre Dame').type, 'nd');
  const outside = mk([...base, ['L', 'SEC'], ['Notre Dame', 'Independents', '87']]);
  assert.ok(!seedNames(buildBracket(outside)).includes('Notre Dame'));
});
t('bracket structure: byes, pairings, hosts and semifinal sides', () => {
  const b = buildBracket(mk(Array.from({ length: 25 }, (_, i) => [`T${i + 1}`, ['SEC', 'Big Ten', 'ACC', 'Big 12', 'MAC'][i % 5]])));
  assert.deepStrictEqual(b.firstRound.map((g) => [g.home.seed, g.away.seed]), [[8, 9], [5, 12], [6, 11], [7, 10]]);
  assert.deepStrictEqual(b.quarterfinals.map((q) => [q.top.seed, q.from]), [[1, 'R1-8v9'], [4, 'R1-5v12'], [3, 'R1-6v11'], [2, 'R1-7v10']]);
  assert.deepStrictEqual(b.semifinals.map((s) => s.from), [['QF-1', 'QF-4'], ['QF-3', 'QF-2']]);
  assert.strictEqual(b.out.length, 4);
});
t('missing P4 champion is reported, not invented', () => {
  const b = buildBracket(mk([['A', 'SEC'], ['B', 'Big Ten'], ['C', 'ACC']]));
  assert.deepStrictEqual(b.missingChampions, ['Big 12']);
  assert.ok(b.seeds.length <= 12);
});
t('Utah and BYU spotlight', () => {
  const rows = mk([['Utah', 'Big 12', '254'], ['BYU', 'Big 12', '252'], ['X', 'SEC']]);
  const b = buildBracket(rows);
  assert.strictEqual(b.spotlight.Utah.seed, 1); assert.strictEqual(b.spotlight.Utah.label, 'Big 12 champion (proj.)');
  assert.strictEqual(b.spotlight.BYU.type, undefined); assert.strictEqual(b.spotlight.BYU.inField, true);
});
t('CFP detection by type or name; AP is not CFP', () => {
  assert.ok(isCfp({ type: 'cfp' })); assert.ok(isCfp({ name: 'College Football Playoff Rankings' }));
  assert.ok(isCfp({ name: 'Playoff Committee Rankings' })); assert.ok(!isCfp({ type: 'ap', name: 'AP Top 25' }));
});
t('mock CFP payload (ESPN shape) becomes a 12-team bracket, ties keep feed order', () => {
  const mock = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'mock-cfp.json'), 'utf8'));
  assert.ok(isCfp(mock));
  const teams = [{ id: '254', name: 'Utah Utes', short: 'Utah', conference: 'Big 12' }];
  const rows = rowsFromEspnRanking(mock, teams);
  assert.strictEqual(rows.length, 25); assert.strictEqual(rows[0].order, 1);
  const b = buildBracket(rows);
  assert.strictEqual(b.seeds.length, 12);
  assert.ok(b.seeds.every((s, i) => s.seed === i + 1));
});
t('legacy bracket (old app versions) keeps the old field names with the new seeds', () => {
  const mkr = (i, conf, id) => ({ rank: i, team: `T${i}`, conference: conf, record: '1-0', info: { id, short: `T${i}`, name: `T${i}` } });
  const jt = { ranks: Array.from({ length: 25 }, (_, i) => mkr(i + 1, ['SEC', 'Big Ten', 'ACC', 'Big 12', 'MAC'][i % 5], String(1000 + i))) };
  const lb = legacyBracket(jt);
  assert.strictEqual(lb.seeds.length, 12); assert.ok(lb.seeds[0].team && lb.seeds[0].info && 'champ' in lb.seeds[0]);
  assert.deepStrictEqual(lb.quarterfinals.map((q) => q.from), ['R1-8v9', 'R1-5v12', 'R1-6v11', 'R1-7v10']);
  assert.ok(lb.firstRound[0].site && lb.firstRound[0].home.team); assert.strictEqual(legacyBracket(null), null);
});
console.log(`brackets.test.js: ${n} groups passed`);
