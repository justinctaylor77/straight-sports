// Feed states with mocked network: preseason / early / ready / final / offseason / unavailable / loading, NCAA fallback,
// JT drop-in override, unknown sport. Run: node tests/feeds.test.js
const assert = require('assert'); const fs = require('fs'); const os = require('os'); const path = require('path');
process.env.LISTS_NO_WRITE = '1'; process.env.NCAA_API_BASE = 'http://ncaa.test';
const makeFeeds = require('../server/feeds');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'feeds-')); process.env.JT_LISTS_DIR = path.join(tmp, 'jt'); process.env.LISTS_DATA_DIR = path.join(tmp, 'snap');

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const daysAgo = (n) => new Date(Date.now() - n * 86400e3).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const SPORTS = { gymnastics: { path: 'gymnastics', espn: 'gymnastics', name: 'College Gymnastics', short: 'Gym', emoji: 'x' }, nfl: { path: 'football/nfl', espn: 'nfl', name: 'NFL' }, nba: { path: 'basketball/nba', espn: 'nba', name: 'NBA' }, wnba: { path: 'basketball/wnba', espn: 'wnba', name: 'WNBA' }, mlb: { path: 'baseball/mlb', espn: 'mlb', name: 'MLB' },
  mcbb: { path: 'basketball/mens-college-basketball', espn: 'mens-college-basketball', name: 'Men’s College Basketball' }, wcbb: { path: 'basketball/womens-college-basketball', espn: 'womens-college-basketball', name: 'Women’s College Basketball' },
  cbase: { path: 'baseball/college-baseball', espn: 'college-baseball', name: 'College Baseball' }, softball: { path: 'baseball/college-softball', espn: 'college-softball', name: 'College Softball' } };
const normTeam = (t, sport) => ({ id: `${sport}:${t.id}`, espnId: String(t.id), name: t.displayName || `Team ${t.id}`, short: t.shortDisplayName || `T${t.id}`, abbr: t.abbreviation || `T${t.id}`, logo: '', logoDark: '', color: '112233' });
let pollsImpl = async () => ({ polls: [] });
const SP = { SPORTS, normTeam, getTeams: async () => ({ teams: [{ id: 'mcbb:1', espnId: '1', name: 'Alpha Aces', short: 'Alpha', abbr: 'ALP', logo: '', logoDark: '', color: '000000' }, { id: 'mcbb:2', espnId: '2', name: 'Beta Bears', short: 'Beta', abbr: 'BET', logo: '', logoDark: '', color: '000000' }] }), polls: (s) => pollsImpl(s) };
const mk = (fetchJSON) => makeFeeds({ cached: (_k, _ttl, fn) => fn(), fetchJSON: (u) => fetchJSON(u), SP });
const stat = (name, value, displayValue) => ({ name, value, displayValue: displayValue == null ? String(value) : displayValue });
const standings = (teams) => ({ seasons: [{ year: 2026, displayName: '2026' }], children: [{ abbreviation: 'X', children: [{ abbreviation: 'D', standings: { entries: teams.map(([id, w, l, diff]) => ({ team: { id, displayName: `Team ${id}`, shortDisplayName: `T${id}`, abbreviation: `T${id}` }, stats: [stat('wins', w), stat('losses', l), stat('gamesPlayed', w + l), stat('pointDifferential', diff)] })) } }] }] });
const field = (n, w, l) => Array.from({ length: n }, (_, i) => [String(i + 1), w ? w - (i % 3) : 0, w || l ? l + (i % 3) : 0, 10 - i]);

let n = 0; const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('pro list: preseason when nobody has played (all 50.0, note says alphabetical order)', async () => {
  const f = mk(async (u) => { if (/standings/.test(u)) return standings(field(32, 0, 0)); return { events: [] }; });
  const d = await f.list('nfl'); assert.strictEqual(d.state, 'preseason'); assert.strictEqual(d.rows.length, 32); assert.ok(d.rows.every((r) => r.score === 50 && r.move === null)); assert.ok(/alphabetical/.test(d.notes[0]));
});
t('pro list: early / ready / final thresholds', async () => {
  const run = async (sport, w, l) => (await mk(async () => standings(field(30, w, l))).list(sport)).state;
  assert.strictEqual(await run('nba', 3, 1), 'early'); assert.strictEqual(await run('nba', 15, 10), 'ready'); assert.strictEqual(await run('nba', 55, 27), 'final');
  assert.strictEqual(await run('mlb', 100, 62), 'final'); assert.strictEqual(await run('nfl', 5, 2), 'ready'); assert.strictEqual(await run('nfl', 12, 5), 'final');
});
t('pro list: row count is capped to the league size and ranks are 1..n; payload carries the method + formula', async () => {
  const d = await mk(async () => standings(field(40, 10, 5))).list('nfl'); assert.strictEqual(d.rows.length, 32); assert.deepStrictEqual(d.rows.map((r) => r.rank), Array.from({ length: 32 }, (_, i) => i + 1));
  assert.ok(d.method.formula.length >= 3); assert.strictEqual(d.kind, 'computed'); assert.strictEqual(d.source.name, 'ESPN standings');
});
t('pro list: standings outage surfaces as an error (client shows retry), not a fake list', async () => {
  await assert.rejects(mk(async () => { throw new Error('boom'); }).list('mlb'));
});
t('unknown sport → 400', async () => {
  const f = mk(async () => ({})); assert.throws(() => f.list('curling'), (e) => e.status === 400); assert.throws(() => f.playoffs('curling'), (e) => e.status === 400);
});
t('pro playoffs: projected from standings when no postseason games exist', async () => {
  const f = mk(async (u) => (/standings/.test(u) ? standings(field(30, 3, 1)) : /scoreboard/.test(u) ? { leagues: [{ season: { year: 2026 } }], events: [] } : {}));
  const d = await f.playoffs('nba'); assert.strictEqual(d.state, 'projected'); assert.strictEqual(d.bracket.real, false); assert.ok(d.notes.some((x) => /projection/.test(x)));
});
t('poll list: ESPN preseason AP poll → state preseason, no movement', async () => {
  pollsImpl = async () => ({ polls: [{ id: 'ap', name: 'AP', headline: '2027 Rankings - AP Top 25 Preseason', date: daysAgo(3), ranks: [{ rank: 1, team: { id: 1, name: 'Alpha Aces', short: 'Alpha' }, record: '0-0', previous: 0 }, { rank: 2, team: { id: 2, name: 'Beta Bears', short: 'Beta' }, record: '0-0', previous: 0 }] }] });
  const d = await mk(async () => ({})).list('mcbb'); assert.strictEqual(d.state, 'preseason'); assert.strictEqual(d.source.name, 'ESPN rankings API'); assert.ok(d.rows.every((r) => r.move === null));
});
t('poll list: in-season movement = previous − rank, and "new"', async () => {
  pollsImpl = async () => ({ polls: [{ id: 'ap', name: 'AP', headline: 'Week 5', date: daysAgo(1), ranks: [{ rank: 1, team: { id: 1 }, record: '4-0', previous: 3 }, { rank: 2, team: { id: 2 }, record: '4-0', previous: 0 }] }] });
  const d = await mk(async () => ({})).list('wcbb'); assert.strictEqual(d.state, 'ready'); assert.deepStrictEqual(d.rows.map((r) => r.move), [2, 'new']);
});
t('poll list: ESPN empty → NCAA.com AP poll fallback (source named), both empty → unavailable', async () => {
  pollsImpl = async () => ({ polls: [] });
  const ncaa = { title: 'AP Top 25', updated: `Through Games ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase().replace(' ', '. ')}`, data: [{ RANK: '1', TEAM: 'Alpha (5)', RECORD: '3-0', POINTS: '1,500', 'PREVIOUS RANK': '2' }] };
  const d = await mk(async (u) => (/ncaa\.test/.test(u) ? ncaa : {})).list('mcbb'); assert.strictEqual(d.source.name, 'NCAA.com (AP poll)'); assert.strictEqual(d.rows[0].fpv, 5); assert.strictEqual(d.rows[0].move, 1);
  const e = await mk(async () => { throw new Error('down'); }).list('mcbb'); assert.strictEqual(e.state, 'unavailable'); assert.strictEqual(e.rows.length, 0); assert.ok(/No .* poll is available/.test(e.notes[0]));
});
t('college baseball/softball: poll older than 30 days = offseason, newer = ready', async () => {
  const mkPoll = (daysOld) => { const d = new Date(Date.now() - daysOld * 86400e3); return { title: 'D1Baseball.com Top 25', updated: `Through Games ${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'America/New_York' }).toUpperCase()}. ${d.toLocaleDateString('en-US', { day: 'numeric', timeZone: 'America/New_York' })}, ${d.toLocaleDateString('en-US', { year: 'numeric', timeZone: 'America/New_York' })}`, data: [{ RANK: '1', TEAM: 'Alpha', RECORD: '40-10', 'PREVIOUS RANK': '1' }] }; };
  assert.strictEqual((await mk(async () => mkPoll(120)).list('cbase')).state, 'offseason');
  assert.strictEqual((await mk(async () => mkPoll(5)).list('softball')).state, 'ready');
});
t('JT drop-in list overrides the computed / poll list for that sport', async () => {
  fs.mkdirSync(path.join(process.env.JT_LISTS_DIR, 'cbase'), { recursive: true });
  fs.writeFileSync(path.join(process.env.JT_LISTS_DIR, 'cbase', 'latest.json'), JSON.stringify({ title: 'JT Top 25 — Baseball', date: '2026-10-20', source: 'JT', ranks: [{ rank: 1, team: 'Alpha', reason: 'because' }, { rank: 2, team: 'Zed U' }] }));
  const d = await mk(async () => ({})).list('cbase'); assert.strictEqual(d.kind, 'jt'); assert.strictEqual(d.state, 'ready'); assert.strictEqual(d.rows[0].why, 'because'); assert.strictEqual(d.rows[1].team.name, 'Zed U');
  fs.rmSync(path.join(process.env.JT_LISTS_DIR, 'cbase'), { recursive: true });
});
t('gymnastics: ranking → offseason; deferred (30 s crawl delay) → loading; failure → unavailable; history → complete champion', async () => {
  const rtn = { data: [{ rank: 1, team_name: 'Alpha', average_score: 197.5, high_score: 198.1, rqs: 197.9, team_id: 9 }, { rank: 2, team_name: 'Beta', average_score: 197.1, high_score: 197.9 }] };
  const hist = { data: [{ Year: String(new Date().getFullYear()), Champion: 'Alpha', Coach: 'C. Oach', Points: '198.075', 'Runner-Up': 'Beta', 'Host or Site': 'Fort Worth' }, { Year: '2025', Champion: 'Beta', Points: '197.0', 'Runner-Up': 'Alpha' }] };
  const f1 = mk(async (u) => (/roadtonationals/.test(u) ? rtn : hist)); const l = await f1.list('gymnastics');
  assert.strictEqual(l.state, 'offseason'); assert.deepStrictEqual(l.rows.map((r) => r.rank), [1, 2]); assert.strictEqual(l.rows[0].avg, 197.5);
  const p = await f1.playoffs('gymnastics'); assert.strictEqual(p.state, 'complete'); assert.ok(p.champion.team.name); assert.strictEqual(p.champion.score, 198.075); assert.ok(p.format.length >= 3);
  // second fresh instance in the same process: rtn is rate-limited per instance (30 s); a fresh feeds object has its own clock
  const f2 = mk(async (u) => { if (/roadtonationals/.test(u)) throw new Error('rtn down'); return hist; }); const bad = await f2.list('gymnastics'); assert.strictEqual(bad.state, 'unavailable'); assert.ok(/links below|Road to Nationals/.test(bad.notes[0]));
  const f3 = mk(async (u) => (/roadtonationals/.test(u) ? rtn : hist)); await f3.internals.rtnGet('/finalresults/1999').catch(() => {});
  const def = await f3.list('gymnastics'); assert.strictEqual(def.state, 'loading'); assert.ok(/30-second/.test(def.notes[0]));
});
t('gymnastics playoffs without NCAA history → unavailable with links, never a made-up champion', async () => {
  const d = await mk(async () => { throw new Error('down'); }).playoffs('gymnastics'); assert.strictEqual(d.state, 'unavailable'); assert.strictEqual(d.champion, null); assert.ok(d.links.length >= 2);
});
t('college playoffs: no NCAA bracket → state none + AP top-4 label says "Not an NCAA projection"', async () => {
  pollsImpl = async () => ({ polls: [{ id: 'ap', name: 'AP', headline: 'Week 5', date: daysAgo(1), ranks: [1, 2, 3, 4, 5].map((i) => ({ rank: i, team: { id: i }, record: '4-0', previous: i })) }] });
  const d = await mk(async () => { throw new Error('no bracket'); }).playoffs('mcbb'); assert.strictEqual(d.state, 'none'); assert.strictEqual(d.bracket, null); assert.ok(/Not an NCAA projection/.test(d.oneSeeds.label)); assert.strictEqual(d.oneSeeds.rows.length, 4);
});
t('Utah / BYU / Big 12 tagging is display-only (rows keep their order)', async () => {
  pollsImpl = async () => ({ polls: [{ id: 'ap', name: 'AP', headline: 'Week 5', date: daysAgo(1), ranks: [{ rank: 1, team: { id: 1, name: 'Alpha Aces' } }, { rank: 2, team: { id: 254 } }] }] });
  const f = makeFeeds({ cached: (_k, _t, fn) => fn(), fetchJSON: async () => ({}), SP: { ...SP, getTeams: async () => ({ teams: [{ id: 'mcbb:254', espnId: '254', name: 'Utah Utes', short: 'Utah', abbr: 'UTAH', logo: 'x', logoDark: 'x', color: 'cc0000' }, { id: 'mcbb:1', espnId: '1', name: 'Alpha Aces', short: 'Alpha', abbr: 'ALP', logo: 'x', logoDark: 'x', color: '0' }] }) } });
  const d = await f.list('mcbb'); assert.deepStrictEqual(d.rows.map((r) => r.rank), [1, 2]);
});
t('index lists all nine sports', () => { const f = mk(async () => ({})); const ix = f.index(); assert.strictEqual(ix.sports.length, 9); assert.deepStrictEqual(ix.sports.map((s) => s.id).sort(), ['cbase', 'gymnastics', 'mcbb', 'mlb', 'nba', 'nfl', 'softball', 'wcbb', 'wnba']); });

(async () => {
  for (const [name, fn] of tests) { try { await fn(); n++; } catch (e) { console.error('FAIL:', name); console.error(e); process.exitCode = 1; break; } }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!process.exitCode) console.log(`feeds: ${n} tests passed`);
})();
