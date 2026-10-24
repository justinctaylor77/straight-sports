// Usage: node scripts/shots-venue.js [baseUrl] [outDir] → full-page phone shots of football field + venue card (pre/live/final) and other sports
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.argv[3] || require('path').join(__dirname, '..', 'screenshots', 'v10');
const KEY = 'straightcfb.settings.v1';
const seeded = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'nhl', 'nba'], sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [] };
const CASES = JSON.parse(process.env.CASES || 'null') || [
  ['venue-cfb-pre', 'cfb', '401856835'], ['venue-cfb-live', 'cfb', '401858274'], ['venue-cfb-final', 'cfb', '401871067'],
  ['venue-nfl-final', 'nfl', '401873010'], ['venue-mlb-final', 'mlb', '401930515'], ['venue-nba-final', 'nba', '401909834'], ['venue-nhl-final', 'nhl', '401892550'],
];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: process.env.SCHEME || 'dark' });
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  for (const [n, sp, id] of CASES) {
    await p.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [KEY, { ...seeded, sport: sp }]);
    await p.goto(`${BASE}/`); await p.evaluate((h) => { location.hash = h; }, `#/game/${sp}/${id}`); await p.reload();
    await p.waitForSelector('.gc-venue', { timeout: 40000 }).catch(() => console.log('no venue', n));
    await p.waitForTimeout(1500);
    await p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); console.log('ok', n);
  }
  console.log(errs.length ? errs : 'no errors'); await b.close();
})();
