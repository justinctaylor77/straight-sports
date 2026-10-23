// Saved-state upgrade test: an existing v2 install keeps exactly its sports, follows and players.
import assert from 'node:assert/strict';
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const { migrate, DEFAULTS, sportOfId, teamMatcher, buildMuteFilter, SPORTS } = await import('../public/lib.js');
const v2 = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'nfl', players: { 'golf:9478': { name: 'Scottie Scheffler', flag: 'x' }, 'tennis:3623': { name: 'Jannik Sinner', flag: 'y' } },
  conferences: ['9'], follow: ['252', 'nfl:12', 'mlb:19', 'golf:9478', 'tennis:3623'], muteTeams: ['nfl:21'], muteLeagues: ['nba', 'wnba', 'betting'], muteKeywords: ['LeBron'],
  sources: { 'cfb:espn': true }, straightOnly: true, sportOnly: true, theme: 'dark' };
const s = migrate(structuredClone(v2));
assert.deepEqual(s.sports, v2.sports, 'sports unchanged');
assert.equal(s.sport, 'nfl');
assert.deepEqual(s.follow, v2.follow, 'follows unchanged');
assert.deepEqual(s.players, v2.players);
assert.deepEqual(s.muteTeams, v2.muteTeams);
assert.deepEqual(s.muteLeagues, v2.muteLeagues, 'NBA/WNBA mutes intact, nothing duplicated');
assert.deepEqual(s.conferences, v2.conferences); assert.deepEqual(s.sources, v2.sources); assert.equal(s.theme, 'dark');
assert.ok(!s.sports.includes('nba') && !s.sports.includes('wnba'));
assert.equal(s.v, 3);
// v2 user who never muted NBA: hidden-by-default behaviour preserved as a mute, still no sports added
const s2 = migrate({ ...structuredClone(v2), muteLeagues: [] });
assert.deepEqual(s2.muteLeagues, ['nba', 'wnba']); assert.deepEqual(s2.sports, v2.sports);
// fresh install: no NBA anywhere
const f = migrate({});
assert.deepEqual(f.sports, ['cfb']); assert.deepEqual(f.muteLeagues, []); assert.equal(f.onboarded, false);
assert.deepEqual(DEFAULTS.sports, ['cfb']);
// ids
assert.equal(sportOfId('252'), 'cfb'); assert.equal(sportOfId('cfb:a5141367'), 'cfb'); assert.equal(sportOfId('nba:a5041939'), 'nba'); assert.equal(sportOfId('epl:382'), 'epl'); assert.equal(sportOfId('golf:9478'), 'golf');
// a muted league doesn't blank that sport's own feed
const mf = buildMuteFilter({ ...s, sportOnly: false }, [], 'nba');
assert.equal(mf.item({ title: 'NBA: Celtics beat Pistons', link: '' }), null);
assert.ok(buildMuteFilter({ ...s, sportOnly: false }, [], 'nfl').item({ title: 'NBA: Celtics beat Pistons', link: '' }));
// player matcher
const m = teamMatcher({ id: 'nfl:a3139477', name: 'Patrick Mahomes', sport: 'nfl', player: true }, [], 'nfl');
assert.ok(m('Mahomes throws four TDs')); assert.ok(!m('Chiefs win'));
assert.ok(Object.keys(SPORTS).length >= 25);
console.log('migrate.test: all assertions passed');
