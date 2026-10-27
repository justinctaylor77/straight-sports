// JT Power Rankings formula, movement and snapshots. Run: node tests/rank-lists.test.js
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
const R = require('../server/rank-lists');
let n = 0; const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL:', name); throw e; } };
const stat = (name, value, displayValue) => ({ name, value, displayValue: displayValue == null ? String(value) : displayValue });
const entry = (id, w, l, diff, l10, extra = []) => ({ team: { id, name: `Team ${id}`, short: `T${id}` }, stats: [stat('wins', w), stat('losses', l), stat('gamesPlayed', w + l), stat('pointDifferential', diff), ...(l10 ? [stat('Last Ten Games', 0, l10)] : []), ...extra] });

t('constants match the documented formula table', () => {
  assert.deepStrictEqual(['nfl', 'nba', 'wnba', 'mlb'].map((s) => [R.LEAGUES[s].k, R.LEAGUES[s].scale]), [[3, 7], [8, 5], [6, 4], [15, 0.7]]);
  assert.deepStrictEqual(R.WEIGHTS, { win: 0.5, margin: 0.35, form: 0.15 });
});
t('statsOf reads ESPN stats, last-10 and falls back safely', () => {
  const s = R.statsOf(entry(1, 6, 1, 59, '7-3'));
  assert.strictEqual(s.w, 6); assert.strictEqual(s.gp, 7); assert.strictEqual(s.diff, 59); assert.deepStrictEqual(s.last10, { w: 7, l: 3 });
  const bare = R.statsOf({ team: { id: 2 }, stats: [] });
  assert.strictEqual(bare.gp, 0); assert.strictEqual(bare.diff, null); assert.strictEqual(bare.last10, null);
  const ptsOnly = R.statsOf({ stats: [stat('wins', 3), stat('losses', 1), stat('pointsFor', 100), stat('pointsAgainst', 90)] });
  assert.strictEqual(ptsOnly.diff, 10);
});
t('powerScore: hand-computed NBA example', () => {
  // 4-0, +40 diff (10/game), last 10 = 4-0, k=8, scale=5
  const st = R.statsOf(entry(1, 4, 0, 40, '4-0')); const p = R.powerScore(st, R.LEAGUES.nba);
  const A = (4 + 4) / 12; const B = 0.5 + (10 * (4 / 12)) / 25; const C = 5 / 6;
  assert.ok(Math.abs(p.score - Math.round(100 * (0.5 * A + 0.35 * B + 0.15 * C) * 100) / 100) < 1e-9);
  assert.ok(Math.abs(p.score - 68) < 0.01, `got ${p.score}`);
});
t('powerScore: no games → exactly .500 everything = 50', () => {
  const p = R.powerScore(R.statsOf({ stats: [] }), R.LEAGUES.nfl); assert.strictEqual(p.score, 50);
});
t('powerScore: NFL without last-10 falls back to win% shrink (C = A)', () => {
  const p = R.powerScore(R.statsOf(entry(1, 6, 0, 60)), R.LEAGUES.nfl); assert.strictEqual(p.C, p.A);
});
t('margin component is clamped to [0,1] and shrinks with few games', () => {
  const huge = R.powerScore(R.statsOf(entry(1, 1, 0, 500, '1-0')), R.LEAGUES.nfl); assert.strictEqual(huge.B, 1);
  const neg = R.powerScore(R.statsOf(entry(1, 0, 1, -500, '0-1')), R.LEAGUES.nfl); assert.strictEqual(neg.B, 0);
  const one = R.powerScore(R.statsOf(entry(1, 1, 0, 20, '1-0')), R.LEAGUES.nba); const many = R.powerScore(R.statsOf(entry(1, 50, 0, 1000, '10-0')), R.LEAGUES.nba);
  assert.ok(one.score < many.score);
});
t('MLB uses runs: +100 runs over 100 games moves the score less than +100 points in the NBA would', () => {
  const mlb = R.powerScore(R.statsOf(entry(1, 60, 40, 100, '6-4')), R.LEAGUES.mlb); assert.ok(mlb.B > 0.5 && mlb.B < 1);
});
t('computePower ranks by score; ties by win% then differential then name; ranks are 1..n', () => {
  const rows = R.computePower('nfl', [entry(1, 3, 3, 0), entry(2, 5, 1, 30), entry(3, 5, 1, 30), entry(4, 1, 5, -40)]);
  assert.deepStrictEqual(rows.map((r) => r.rank), [1, 2, 3, 4]);
  assert.deepStrictEqual(rows.map((r) => r.team.id), [2, 3, 1, 4]); // 2 and 3 tie exactly → name order
  assert.ok(rows[0].score > rows[2].score && rows[2].score > rows[3].score);
  assert.ok(rows[0].why.includes('5-1'));
});
t('computePower rejects an unknown league', () => assert.throws(() => R.computePower('xyz', [])));
t('applyMovement: up / down / same / new / null', () => {
  const rows = [{ rank: 1, team: { id: 'a' } }, { rank: 2, team: { id: 'b' } }, { rank: 3, team: { id: 'c' } }, { rank: 4, team: { id: 'd' } }];
  const out = R.applyMovement(rows, { date: '2026-10-20', ranks: { a: 3, b: 2, c: 1 } });
  assert.deepStrictEqual(out.map((r) => r.move), [2, 0, -2, 'new']);
  assert.deepStrictEqual(R.applyMovement(rows, null).map((r) => r.move), [null, null, null, null]);
});
t('snapshots: save, read, previousSnapshot excludes today and honours min age, LISTS_NO_WRITE', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lists-')); process.env.LISTS_DATA_DIR = dir;
  try {
    const rows = [{ rank: 1, team: { id: 'a', name: 'A' }, record: '1-0', score: 60 }];
    for (const d of ['2026-10-20', '2026-10-24', '2026-10-27']) assert.strictEqual(R.saveSnapshot('nba', R.makeSnapshot('nba', d, rows)), true);
    assert.deepStrictEqual(R.snapshotDates('nba'), ['2026-10-20', '2026-10-24', '2026-10-27']);
    assert.strictEqual(R.previousSnapshot('nba', '2026-10-27').date, '2026-10-24'); // never itself
    assert.strictEqual(R.previousSnapshot('nba', '2026-10-27', 6).date, '2026-10-20'); // NFL-style 6-day gap
    assert.strictEqual(R.previousSnapshot('nba', '2026-10-19'), null);
    assert.strictEqual(R.previousSnapshot('wnba', '2026-10-27'), null);
    assert.strictEqual(R.readSnapshot('nba', '../etc/passwd'), null); // date validated: no path traversal
    assert.ok(fs.existsSync(path.join(dir, 'nba', 'latest.json')));
    process.env.LISTS_NO_WRITE = '1'; assert.strictEqual(R.saveSnapshot('nba', R.makeSnapshot('nba', '2026-10-28', rows)), false);
    assert.ok(!fs.existsSync(path.join(dir, 'nba', '2026-10-28.json')));
  } finally { delete process.env.LISTS_NO_WRITE; delete process.env.LISTS_DATA_DIR; fs.rmSync(dir, { recursive: true, force: true }); }
});
t('saveSnapshot never throws on an unwritable path', () => {
  const f = path.join(os.tmpdir(), `lists-file-${process.pid}`); fs.writeFileSync(f, 'x'); process.env.LISTS_DATA_DIR = path.join(f, 'sub'); try { assert.strictEqual(R.saveSnapshot('nfl', R.makeSnapshot('nfl', '2026-10-27', [])), false); } finally { delete process.env.LISTS_DATA_DIR; fs.rmSync(f, { force: true }); }
});
console.log(`rank-lists: ${n} tests passed`);
