// "Only sports news": off-topic headlines must be dropped, real sports headlines kept. Run: node tests/news-filter.test.js
const assert = require('assert');
const { sportsCheck } = require('../server/classify');
const drop = [
  ['Powerful Democratic Virginia state Sen. accused of leading a marijuana ring', ''],
  ['Neil Patrick Harris to Star in ‘Damn Yankees’ Revival on Broadway', ''],
  ['How, and Why, We’re Covering Taylor Swift’s (Maybe) Wedding', ''],
  ['Stocks slide as Wall Street braces for Fed decision', ''],
  ['Trump signs tariffs order', ''],
  ['Facing pushback on data centers, tech giants promise hosts more money', ''],
  ['Coco Gauff poses in polka-dot bikini top', ''],
  ['Anything', 'https://example.com/politics/2026/story/'],
  ['Watch: Flash floods rip through southern Utah', ''],
];
const keep = [
  ['Giants fall to Saints, 34-27', ''], ['Dak Prescott to miss two games with injury', ''], ['Tiger Woods comeback buzz grows', ''],
  ['Trump to attend Army-Navy football game', ''], ['Chuck Amato, longtime NC State coach, dies at 80', ''], ['Drew Rasmussen pitches Rays to 3-2 ALCS lead', ''],
  ['Tom Kim wins gold medal at Asian Games to earn military exemption', ''],
];
for (const [t, u] of drop) assert.ok(!sportsCheck(t, u).ok, `should drop: ${t}`);
for (const [t, u] of keep) assert.ok(sportsCheck(t, u).ok, `should keep: ${t}`);
assert.ok(!sportsCheck('Utah sues Kalshi over gambling', '', '', { strict: true }).ok);
assert.ok(sportsCheck('BYU heads to Florida riding lofty hype', '', '', { strict: true }).ok);
console.log('news-filter ok');
