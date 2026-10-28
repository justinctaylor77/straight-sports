// "Mute every sport I haven't selected" (item 2): derived mute, restore, dormant with all-sports default, later-added sports, shared words.
import assert from 'node:assert/strict';
globalThis.localStorage = { m: {}, getItem(k) { return this.m[k] ?? null; }, setItem(k, v) { this.m[k] = v; } };
const L = await import('../public/lib.js');
const { migrate, mutedSports, mutedSportWords, buildMuteFilter, SPORT_IDS, SPORTS, MUTE_WORDS, muteWordsFor } = L;
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepEqual(a, b, m); n++; };
const base = (o) => migrate({ v: 6, onboarded: true, sportsChosen: true, sports: ['nfl', 'mlb', 'golf'], muteUnselected: false, sportOnly: false, ...o });
const item = (title) => ({ title, link: '', summary: '' });

// default off, and nothing is stored in muteLeagues (derived at read time → unticking restores exactly the previous state)
eq(L.DEFAULTS.muteUnselected, false); eq(migrate({}).muteUnselected, false);
const a = base({ muteLeagues: ['betting'], muteKeywords: ['LeBron'] }); const before = JSON.stringify(a);
const b = { ...a, muteUnselected: true }; ok(mutedSports(b).length > 15);
eq(JSON.stringify({ ...b, muteUnselected: false }), before, 'unticking gives back the exact previous settings');
eq(b.muteLeagues, ['betting'], 'derived mutes are not written into muteLeagues'); eq(mutedSports(a), []);
// exactly the unselected sports, none of the selected
const ms = mutedSports(b); ok(!ms.includes('nfl') && !ms.includes('mlb') && !ms.includes('golf')); eq(ms.length, SPORT_IDS.length - 3);
// dormant while nothing was chosen (v1.1.0 all-sports default): nothing to mute
const dormant = migrate({ v: 6, onboarded: true, sportsChosen: false, muteUnselected: true }); eq(dormant.sports, SPORT_IDS); eq(mutedSports(dormant), []); eq(mutedSportWords(dormant), []);
ok(buildMuteFilter(dormant, [], 'nfl').item(item('NBA: Celtics beat Pistons')), 'show-everything user still sees NBA even with the box ticked');
// once they pick sports the saved box takes effect
eq(mutedSports({ ...dormant, sportsChosen: true, sports: ['nfl'] }).length, SPORT_IDS.length - 1);
// feed filtering
const f = buildMuteFilter(b, [], 'nfl');
ok(/unselected sport/.test(f.item(item('NHL: Bruins edge Rangers in overtime'))), 'hockey news muted'); ok(/unselected sport/.test(f.item(item('Premier League: Arsenal top the table'))));
ok(/unselected sport/.test(f.item(item('UFC 333 main card preview')))); ok(/unselected sport/.test(f.item(item('Formula 1: US Grand Prix recap'))));
eq(f.item(item('NFL: Chiefs beat Bills')), null, 'selected sport news stays'); eq(f.item(item('World Series Game 4: Rays top Brewers')), null, 'MLB selected → World Series stays');
eq(f.item(item('Scheffler leads the golf leaderboard')), null);
ok(f.sport('nba') && f.sport('cfb') && !f.sport('nfl') && !f.sport('mlb'), 'sport-level check used by routes/score lists');
// ambiguous words are not used: a "playoff"/"bowl" headline about a selected sport is never swallowed
eq(f.item(item('NFL playoff picture after Week 8')), null); eq(f.item(item('Super Bowl contender: Chiefs surge')), null, 'Super Bowl = NFL (selected)');
const words = mutedSportWords(b).map((x) => x.w.toLowerCase()); for (const w of ['playoff', 'bowl', 'bout', 'masters', 'football', 'grand slam']) ok(!words.includes(w), `"${w}" never a mute word`);
// shared words: you picked NBA but not men's college basketball → "basketball" must not be muted
const nba = base({ sports: ['nba'], muteUnselected: true }); ok(!mutedSportWords(nba).some((x) => x.w.toLowerCase() === 'basketball'), 'shared word kept'); ok(mutedSports(nba).includes('mcbb'));
eq(buildMuteFilter(nba, [], 'nba').item(item('Basketball: Celtics beat Pistons')), null);
ok(/unselected sport/.test(buildMuteFilter(nba, [], 'nba').item(item('March Madness: bracket buster'))), 'distinct college hoops word is muted');
// own feed is never blanked: looking at a sport you did NOT select doesn't apply the mutes (it is hidden by the route guard instead)
eq(buildMuteFilter(b, [], 'nba').item(item('NBA: Celtics beat Pistons')), null);
// sports added to the catalog later are muted too (even with no curated words → falls back to its own pattern)
SPORT_IDS.push('zzfuture'); SPORTS.zzfuture = { id: 'zzfuture', name: 'Future Ball', short: 'Future', emoji: '🥍', own: { source: 'future ball|lacrosse', test: (t) => /lacrosse/i.test(t) } };
ok(mutedSports(b).includes('zzfuture'), 'later-added sport is in the muted set'); ok(/unselected sport/.test(buildMuteFilter(b, [], 'nfl').item(item('Lacrosse: Cannons win title'))), 'its fallback words mute stories');
ok(muteWordsFor('zzfuture').length > 0); delete SPORTS.zzfuture; SPORT_IDS.pop();
// every catalog sport has curated words (so the fallback is only for future sports)
for (const id of SPORT_IDS) ok(MUTE_WORDS[id] && MUTE_WORDS[id].length, `${id} has mute words`);
// migration: v5 settings gain the flag as false, everything else byte-identical
const v5 = { v: 5, onboarded: true, sportsChosen: true, sports: ['cfb', 'nfl'], follow: ['252'], muteLeagues: ['nba'], watch: { providers: ['yttv'] } };
const m5 = migrate(structuredClone(v5)); eq(m5.v, 6); eq(m5.muteUnselected, false); eq(m5.sports, v5.sports); eq(m5.follow, v5.follow); eq(m5.muteLeagues, v5.muteLeagues);
eq(migrate(structuredClone(m5)), m5, 'idempotent'); eq(migrate({ ...m5, muteUnselected: 'yes' }).muteUnselected, false, 'junk value → false'); eq(migrate({ ...m5, muteUnselected: true }).muteUnselected, true);
console.log(`mute-unselected.test: ${n} assertions passed`);
