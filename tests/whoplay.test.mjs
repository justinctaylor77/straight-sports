// Client renderers for "what happened + who" (public/whoplay.js): escaping, fallbacks, avatars, links.
import assert from 'node:assert/strict';
const W = await import('../public/whoplay.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
const p = { what: 'Pass complete', desc: 'Tanner McKee pass complete to Makai Lemon for 21 yards', who: [{ role: 'Passer', name: 'Tanner McKee', id: 'nfl:a4361741', team: 'PHI', jersey: '16', pos: 'QB' }, { role: 'Target', name: 'Makai Lemon', id: 'nfl:a1', team: 'PHI' }, { role: 'Tackled by', name: 'No Id Guy', id: null }] };
const heads = { 'nfl:a4361741': 'https://a.espncdn.com/i/headshots/nfl/players/full/4361741.png' };
const h = W.playBlock(p, heads);
ok(/class="pb2"/.test(h) && /<b class="pw">Pass complete<\/b>/.test(h) && /for 21 yards/.test(h)); ok(/Passer/.test(h) && /Target/.test(h) && /Tackled by/.test(h), 'roles shown');
ok(/<img src="https:\/\/a\.espncdn\.com\/i\/headshots\/nfl\/players\/full\/4361741\.png"/.test(h), 'headshot from the per-game map'); ok(/#\/player\/nfl:a4361741/.test(h), 'name links to the player page');
ok(/<span class="wi">MC<\/span>|<span class="wi">ML<\/span>/.test(h), 'no headshot → initials'); ok(!/href="#\/player\/null/.test(h), 'unresolved player is plain text');
ok(/PHI · #16 · QB/.test(h), 'team · jersey · position');
// jersey as avatar when there is no headshot
ok(/<span class="wi">#16<\/span>/.test(W.playBlock({ desc: 'x', who: [{ role: 'Passer', name: 'Tanner McKee', jersey: '16' }] }, {})));
// fallbacks: raw text when no server description; label when nothing else; empty only if truly nothing
eq(W.playText({ text: 'raw ESPN text' }), 'raw ESPN text'); eq(W.playText({ what: 'Timeout' }), 'Timeout'); eq(W.playText({ desc: 'D', text: 'T' }), 'D'); eq(W.playText(null), ''); eq(W.playBlock({}, {}), ''); eq(W.playBlock(null), '');
ok(/raw ESPN text/.test(W.playBlock({ text: 'raw ESPN text' }, {}))); ok(!/class="who"/.test(W.playBlock({ text: 'raw ESPN text' }, {})), 'no who → no chips, no invented names');
ok(!/class="pw"/.test(W.playBlock({ what: 'Timeout', desc: 'Timeout' }, {})), 'label not repeated when identical to the sentence');
// escaping
const x = W.playBlock({ what: '<b>x</b>', desc: '<img src=x onerror=alert(1)>', who: [{ role: '"><script>', name: '<i>Bad</i>', id: 'nfl:a"1', headshot: 'javascript:"><x' }] }, {});
ok(!/<script|<img src=x|<i>Bad|javascript:/.test(x), 'all text escaped, non-https avatar dropped'); ok(!/onerror=alert\(1\)>/.test(x));
// max chips
eq((W.whoChips(Array.from({ length: 9 }, (_, i) => ({ role: 'R', name: 'P' + i })), {}, { max: 3 }).match(/class="wc"/g) || []).length, 3);
// latest banner
ok(/class="last lp"/.test(W.latestBanner('Last play', p, heads))); ok(/Last play · 4:21/.test(W.latestBanner('Last play', { ...p, clock: '4:21' }, heads)));
ok(/fallback words/.test(W.latestBanner('Last play', null, {}, 'fallback words'))); eq(W.latestBanner('Last play', null, {}, ''), '');
console.log(`whoplay.test: ${n} assertions passed`);
