// Usage: node scripts/shots-v16.js [baseUrl] [outDir] [prefix]  — ss-v22 playoff bracket views at 390px (dark).
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:8799'; const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v16'); const PRE = process.argv[4] || 'local';
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const settings = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } };
const errs = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark' });
  const p = await c.newPage(); p.on('pageerror', (e) => errs.push(e.message));
  await p.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [KEY, settings]);
  const shot = async (name, hash, wait, full) => {
    await p.goto(`${BASE}/${hash}`); await p.waitForSelector(wait, { timeout: 45000 }).catch(() => console.log('MISSING', name)); await p.waitForTimeout(2500);
    await p.screenshot({ path: path.join(OUT, `${PRE}-${name}.png`), fullPage: !!full }); console.log('shot', name);
  };
  await shot('rankings-toolbar', '#/rankings', '.seg-a');
  await shot('jt', '#/rankings/bracket/jt', '.br-grid');
  await p.evaluate(() => document.querySelector('.br-scroll').scrollTo(260, 0)); await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, `${PRE}-jt-scrolled.png`) });
  await p.goto(`${BASE}/#/rankings/bracket/jt`); await p.waitForTimeout(1500); await p.screenshot({ path: path.join(OUT, `${PRE}-jt-full.png`), fullPage: true });
  await p.evaluate(() => document.querySelector('.br-list').scrollIntoView()); await p.waitForTimeout(300); await p.screenshot({ path: path.join(OUT, `${PRE}-jt-field.png`) });
  await shot('ap', '#/rankings/bracket/ap', '.br-grid');
  await shot('cfp', '#/rankings/bracket/cfp', '.br-empty, .br-grid');
  const w = await p.evaluate(() => document.documentElement.scrollWidth); console.log('page scrollWidth', w);
  await b.close(); console.log('page errors:', errs.length, errs); process.exit(errs.length || w > 392 ? 1 : 0);
})();
