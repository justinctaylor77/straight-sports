// Usage: node scripts/shots-v15.js [baseUrl] [outDir] [suffix] — JT Top 25 tab at phone width (top of list + notes tab).
const { chromium } = require('playwright-core'); const path = require('path'); const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8787'; const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v15'); const SUF = process.argv[4] || 'local';
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark' });
  const p = await c.newPage();
  await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } }]);
  await p.goto(`${BASE}/#/rankings/grok`);
  await p.waitForSelector('.gk-row', { timeout: 60000 }); await p.waitForTimeout(3000);
  await p.screenshot({ path: path.join(OUT, `top25-${SUF}.png`) });
  await p.screenshot({ path: path.join(OUT, `top25-full-${SUF}.png`), fullPage: true });
  await b.close();
})();
