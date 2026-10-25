// Usage: node scripts/shots-v13.js [baseUrl] [outDir]
// ss-v20 check: Officials card in the game view (cfb: not published by ESPN; nfl: ESPN crew list); Conf tag on cfb score cards.
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:8787'; const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v13');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = (sport) => ({ v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport, follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } });
const errs = []; const log = console.log;
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const shot = async (name, sport, hash, wait, full) => {
    const c = await b.newContext({ viewport: { width: 390, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, seeded(sport)]);
    await p.goto(`${BASE}/${hash}`); await p.waitForSelector(wait, { timeout: 45000 }).catch(() => log('MISSING', name, wait));
    await p.waitForTimeout(3000);
    await p.addStyleTag({ content: '.gc-tabs { position: static !important; }' });
    const off = await p.$$eval('.gc-off', (e) => e.map((x) => x.innerText.replace(/\s+/g, ' ').slice(0, 220)));
    log(name, 'officials cards:', JSON.stringify(off));
    const el = await p.$('.gc-off'); if (el) await el.scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: !!full });
    await c.close();
  };
  await shot('scores-cfb', 'cfb', '#/scores', '[data-game]');
  await shot('game-cfb-final', 'cfb', '#/game/cfb/401858496', '.gc-head');
  await shot('game-cfb-final-full', 'cfb', '#/game/cfb/401858496', '.gc-head', true);
  await shot('game-cfb-upcoming', 'cfb', '#/game/cfb/401856837', '.gc-head');
  await shot('game-nfl-officials', 'nfl', '#/game/nfl/401773011', '.gc-head');
  await shot('team-byu', 'cfb', '#/team/252', '.tc-name, .hero, .sx-item, h1');
  await shot('schedule-byu', 'cfb', '#/schedule/252', '.sx-item, .sx-row');
  await b.close(); log('page errors:', errs.length, errs); process.exit(errs.length ? 1 : 0);
})();
