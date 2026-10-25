// Saved-state upgrade test: an existing v2 install keeps exactly its sports, follows and players.
import assert from 'node:assert/strict';
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const { migrate, DEFAULTS, sportOfId, teamMatcher, buildMuteFilter, SPORTS, SPORT_IDS } = await import('../public/lib.js');
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
assert.equal(s.v, 5); assert.equal(s.sportsChosen, true, 'an install with several sports keeps them as an explicit choice');
assert.deepEqual(s.watch, { providers: ['yttv'] }, 'existing install: YouTube TV pre-selected');
// v2 user who never muted NBA: hidden-by-default behaviour preserved as a mute, still no sports added
const s2 = migrate({ ...structuredClone(v2), muteLeagues: [] });
assert.deepEqual(s2.muteLeagues, ['nba', 'wnba']); assert.deepEqual(s2.sports, v2.sports);
// fresh install: no NBA anywhere
const f = migrate({});
assert.deepEqual(f.sports, SPORT_IDS, 'fresh install: every sport until the user picks'); assert.equal(f.sportsChosen, false); assert.deepEqual(f.muteLeagues, []); assert.equal(f.onboarded, false);
assert.deepEqual(DEFAULTS.sports, SPORT_IDS); assert.ok(SPORT_IDS.length > 15 && SPORT_IDS.includes('nba') && SPORT_IDS.includes('epl'));
assert.deepEqual(f.watch, { providers: [] }, 'fresh install picks during setup'); assert.deepEqual(DEFAULTS.watch, { providers: [] });
// v3 user (current) → v4: sports/follows untouched, YouTube TV added; an explicit choice is kept
const v3 = { ...structuredClone(v2), v: 3 }; const s3 = migrate(structuredClone(v3));
assert.deepEqual(s3.sports, v3.sports); assert.deepEqual(s3.follow, v3.follow); assert.deepEqual(s3.players, v3.players); assert.deepEqual(s3.muteLeagues, v3.muteLeagues);
assert.deepEqual(s3.watch.providers, ['yttv']);
assert.deepEqual(migrate({ ...v3, v: 4, watch: { providers: ['none'] } }).watch.providers, ['none']);
assert.deepEqual(migrate({ ...v3, v: 4, watch: { providers: [] } }).watch.providers, []);
// watch buttons
const W = await import('../public/watch.js');
const ev = { sport: 'cfb', state: 'pre', date: '2026-10-24T16:00Z', nets: ['ESPN', 'SEC Network', 'Peacock', 'Weird Local TV'], espnWatch: { status: 'upcoming', streams: [{ net: 'ESPN', web: 'https://www.espn.com/watch/player?id=abc', status: 'upcoming' }] } };
const h = W.watchButtons(ev, ['yttv']);
assert.ok(h.indexOf('Watch on YouTube TV') > -1 && h.indexOf('Watch on YouTube TV') < h.indexOf('Watch on ESPN'), 'provider first');
assert.ok(h.includes('https://www.espn.com/watch/player?id=abc'), 'ESPN game deep link'); assert.ok(h.includes('Also on Weird Local TV'), 'unknown = plain label');
assert.ok(h.includes('peacocktv.com')); assert.ok(h.includes('target="_blank"'));
const post = W.watchButtons({ ...ev, state: 'post', nets: ['Fox', 'Peacock'], espnWatch: null }, ['yttv']);
assert.ok(!post.includes('YouTube TV') && !post.includes('Fox') && post.includes('Replay on Peacock'), 'finished: replay-only networks');
assert.equal(W.netKey('Prime Video (Local)'), 'prime'); assert.equal(W.netKey('SECN'), 'espn');
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

// ---- v5: all sports by default ----
// stale default: v4 install that only has the old default ['cfb'] never chose -> everything (and the auto-added NBA/WNBA mutes go away)
const stale = migrate({ v: 4, onboarded: true, sports: ['cfb'], sport: 'cfb', muteLeagues: ['nba', 'wnba'], watch: { providers: ['yttv'] }, follow: ['252'] });
assert.deepEqual(stale.sports, SPORT_IDS); assert.equal(stale.sportsChosen, false); assert.deepEqual(stale.muteLeagues, []); assert.deepEqual(stale.follow, ['252'], 'follows untouched'); assert.equal(stale.v, 5);
// a user who picked sports (anything beyond the default) keeps exactly those; NBA/WNBA mutes untouched
const picked = migrate({ v: 4, onboarded: true, sports: ['nfl', 'golf'], sport: 'nfl', muteLeagues: ['nba'] });
assert.deepEqual(picked.sports, ['nfl', 'golf']); assert.equal(picked.sportsChosen, true); assert.deepEqual(picked.muteLeagues, ['nba']); assert.equal(picked.sport, 'nfl');
// explicit "CFB only" saved by v5+ stays CFB only
const only = migrate({ v: 5, onboarded: true, sports: ['cfb'], sportsChosen: true });
assert.deepEqual(only.sports, ['cfb']); assert.equal(only.sportsChosen, true);
// v5 unchosen stays everything even if a stale subset was saved; round trip is stable
const r = migrate(structuredClone(migrate({ v: 5, sportsChosen: false, sports: ['cfb'] })));
assert.deepEqual(r.sports, SPORT_IDS); assert.deepEqual(migrate(structuredClone(r)), r);
// Justin's own saved settings (cfb, nfl, mlb, golf, tennis) are untouched by v5
const j = migrate(structuredClone({ ...v2, v: 4 })); assert.deepEqual(j.sports, ['cfb', 'nfl', 'mlb', 'golf', 'tennis']); assert.equal(j.sportsChosen, true);
console.log('migrate v5 (all-sports default): ok');
