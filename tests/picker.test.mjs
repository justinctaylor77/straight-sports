// Favorite-teams picker (items 1): league grouping, location-first names, A-Z sort, search, college names.
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const P = await import('../public/picker.js');
const { SPORTS } = await import('../public/lib.js');
const T = JSON.parse(fs.readFileSync(new URL('./fixtures/teams-2026-10-28.json', import.meta.url)));
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };

// full names are location-first and never the nickname/abbreviation
eq(P.fullName(T.mlb.find((t) => t.abbr === 'BOS')), 'Boston Red Sox');
eq(P.fullName(T.nfl.find((t) => t.abbr === 'GB')), 'Green Bay Packers');
eq(P.fullName({ name: '', location: 'Boston', mascot: 'Red Sox', abbr: 'BOS' }), 'Boston Red Sox', 'rebuilt from location + mascot when ESPN name is missing');
eq(P.fullName({ name: '', location: 'Utah', mascot: 'Utah Utes' }), 'Utah Utes', 'mascot that already includes the location is not doubled');
for (const sp of Object.keys(T)) for (const t of T[sp]) { const f = P.fullName(t); ok(f && (f !== t.abbr || f === t.name) && f.length >= 3, `${sp} ${t.abbr}: ${f}`); if (t.location && sp !== 'cfb') ok(f.toLowerCase().startsWith(t.location.toLowerCase()), `${f} starts with its location`); }
// college: school name is the location
const utah = T.cfb.find((t) => /^Utah Utes$/.test(t.name)); const byu = T.cfb.find((t) => /^BYU Cougars$/.test(t.name));
ok(utah && byu, 'Utah Utes and BYU Cougars exist in the real CFB list');
eq(P.fullName(utah), 'Utah Utes'); eq(P.fullName(byu), 'BYU Cougars');
// sort: location first, A to Z, per league
for (const sp of ['mlb', 'nba', 'nhl', 'nfl', 'mls', 'cfb']) {
  const names = P.sortTeams(T[sp]).map(P.fullName);
  const sorted = names.slice().sort((a, b) => a.normalize('NFD').localeCompare(b.normalize('NFD'), 'en', { sensitivity: 'base', numeric: true }));
  eq(names, sorted, `${sp} sorted by location-first full name`); ok(new Set(names).size === names.length, `${sp} no duplicate names`);
}
ok(P.sortTeams(T.mlb).map(P.fullName).indexOf('Boston Red Sox') < P.sortTeams(T.mlb).map(P.fullName).indexOf('Chicago Cubs'), 'Boston before Chicago (not by nickname: Cubs < Red Sox)');
ok(P.sortTeams(T.nba).map(P.fullName).indexOf('Utah Jazz') > P.sortTeams(T.nba).map(P.fullName).indexOf('Toronto Raptors') || !T.nba.some((t) => /Utah Jazz/.test(t.name)), 'Utah Jazz after Toronto');
// league order: pro then college; unknown (future) leagues go last in the user's order
eq(P.orderLeagues(['cbase', 'epl', 'nfl', 'mlb', 'zzz', 'cfb']), ['nfl', 'mlb', 'epl', 'cfb', 'cbase', 'zzz']);
eq(P.orderLeagues(['nfl', 'golf', 'tennis', 'mlb'], (id) => !['golf', 'tennis'].includes(id)), ['nfl', 'mlb'], 'non-team sports are not in the team picker');
// search
const q = (sp, s) => P.leagueTeams(T[sp], { q: s }).map(P.fullName);
ok(q('mlb', 'red sox').includes('Boston Red Sox')); ok(q('mlb', 'BOS').includes('Boston Red Sox'), 'abbr matches'); ok(q('mlb', 'boston').length === 1);
ok(q('cfb', 'utah').includes('Utah Utes') && q('cfb', 'utah').includes('Utah State Aggies')); ok(q('cfb', 'byu').includes('BYU Cougars'));
eq(q('mlb', 'zzzzz'), [], 'no match → empty'); ok(q('mlb', '  ').length === 30, 'blank query = everything');
ok(q('cfb', 'pac').length >= 0, 'conference search does not throw');
ok(P.leagueTeams(T.cfb, { conf: utah.conferenceId }).every((t) => t.conferenceId === utah.conferenceId), 'conference filter');
// conference sub-groups: each sorted, labelled; a single-conference league collapses to one unlabelled group
const sg = P.subGroups(P.leagueTeams(T.mlb, {})); eq(sg.map((g) => g.name), ['AL Central', 'AL East', 'AL West', 'NL Central', 'NL East', 'NL West']); ok(sg.every((g) => g.teams.length >= 5));
eq(P.subGroups([T.mlb[0]]).length, 1);
// groups: every picked team league, loaded vs not-yet-loaded, followed counts
const g = P.buildGroups({ sportIds: ['cfb', 'mlb', 'nba'], isTeam: () => true, sports: SPORTS, teamsBy: { mlb: T.mlb, cfb: T.cfb }, followedIn: (sp) => (sp === 'mlb' ? 2 : 0) });
eq(g.map((x) => x.sport), ['mlb', 'nba', 'cfb']); ok(g[0].loaded && g[0].total === 30 && g[0].followed === 2); ok(!g[1].loaded && g[1].teams.length === 0, 'unloaded league shows no teams yet'); eq(g[0].label, SPORTS.mlb.name);
const gq = P.buildGroups({ sportIds: ['cfb', 'mlb'], isTeam: () => true, sports: SPORTS, teamsBy: { mlb: T.mlb, cfb: T.cfb }, followedIn: () => 0, q: 'utah' });
ok(gq.find((x) => x.sport === 'cfb').teams.length >= 2 && gq.find((x) => x.sport === 'mlb').teams.length === 0, 'search filters inside every league');
console.log(`picker.test: ${n} assertions passed`);
