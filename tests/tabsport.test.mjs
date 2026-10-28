// Regression: "Tab/data mismatch on Rankings pages" (v1.4.0). The top sport strip must follow the sport the page shows (the sport in the
// #/rankings/(lists|list|playoffs)/<sport> URL), never a stale saved sport. Extracts the real shownSport() from public/app.js.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const src = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const re = src.match(/const LIST_HASH = .*;/)[0];
const fn = src.match(/function shownSport\(name\) \{[\s\S]*?\n\}/)[0];
const make = (hash, saved) => new Function('location', 'S', 'SPORTS', 'LIST_FEED', `${re}\n${fn}\nreturn shownSport;`)({ hash }, { sport: saved }, { cfb: 1, nfl: 1, mlb: 1, nba: 1, golf: 1 }, ['cfb', 'nfl', 'mlb', 'nba']);
let n = 0; const eq = (a, b, m) => { assert.equal(a, b, m); n++; };
// the reported defect: saved sport CFB, page is the NFL bracket
eq(make('#/rankings/playoffs/nfl', 'cfb')('rankings'), 'nfl', 'NFL bracket shows NFL');
eq(make('#/rankings/list/nfl', 'cfb')('rankings'), 'nfl', 'NFL top list shows NFL');
eq(make('#/rankings/lists/mlb', 'cfb')('rankings'), 'mlb', 'MLB lists page shows MLB');
eq(make('#/rankings/playoffs/cfb', 'nfl')('rankings'), 'cfb', 'CFB bracket shows CFB even if NFL saved');
eq(make('#/rankings/playoffs/nba', 'cfb')('rankings'), 'nba', 'NBA bracket shows NBA');
// hub and plain Rankings: the saved sport
eq(make('#/rankings/lists', 'nfl')('rankings'), 'nfl', 'hub follows the saved sport');
eq(make('#/rankings', 'mlb')('rankings'), 'mlb', 'Rankings tab follows the saved sport');
// a sport without lists, or an unknown segment, never hijacks the strip
eq(make('#/rankings/list/golf', 'cfb')('rankings'), 'cfb', 'sport without a list feed falls back to the saved sport');
eq(make('#/rankings/list/zzz', 'cfb')('rankings'), 'cfb', 'unknown sport falls back');
// other tabs are untouched by a list hash
eq(make('#/rankings/list/nfl', 'cfb')('news'), 'cfb', 'News follows the saved sport');
eq(make('#/home', 'nba')('home'), 'nba', 'Home follows the saved sport');
console.log(`tabsport.test.mjs: ${n} assertions passed`);
