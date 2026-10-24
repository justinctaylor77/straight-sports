// Usage: node scripts/shots-v12.js [baseUrl] [outDir]
// ss-v19 check: Watch links/provider chips are gone from every list-style game card; tapping a card opens the game view, where Watch lives.
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:8787'; const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v12');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = (sport) => ({ v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport, follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } });
const errs = []; let bad = 0; const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [sp, hash, name] of [['cfb', '#/scores', 'scores-cfb'], ['mlb', '#/scores', 'scores-mlb'], ['tennis', '#/scores', 'scores-tennis'], ['golf', '#/scores', 'scores-golf']]) {
    const c = await b.newContext({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
    await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, seeded(sp)]);
    await p.goto(`${BASE}/${hash}`); await p.waitForSelector('[data-game]', { timeout: 45000 }).catch(() => log('NO CARDS', name));
    await p.waitForTimeout(2500);
    const n = await p.$$eval('[data-game]', (e) => e.length); const w = await p.$$eval('.watch, .wbtn', (e) => e.length);
    log(name, 'cards', n, 'watch elements in list', w); if (w) bad++;
    await p.screenshot({ path: path.join(OUT, `${name}.png`) });
    const first = await p.$('[data-game]');
    if (first) {
      const target = await first.getAttribute('data-game');
      const box = await first.boundingBox();
      await p.mouse.click(box.x + box.width / 2, box.y + 12); await p.waitForTimeout(500);
      const h = await p.evaluate(() => location.hash); log(name, 'tap ->', h, h === target ? 'OK' : 'MISMATCH'); if (h !== target) bad++;
      await p.waitForSelector('.gc-head', { timeout: 45000 }).catch(() => log('NO GAME VIEW', name)); await p.waitForTimeout(2500);
      const gw = await p.$$eval('.gc-head .watch .wbtn, .gc-head .watch .wplain', (e) => e.length); log(name, 'game view watch items', gw);
      await p.addStyleTag({ content: '.gc-tabs { position: static !important; }' });
      await p.screenshot({ path: path.join(OUT, `game-${name.replace('scores-', '')}.png`) });
    }
    await c.close();
  }
  // team schedule rows
  { const c = await b.newContext({ viewport: { width: 390, height: 1100 }, deviceScaleFactor: 2, isMobile: true, serviceWorkers: 'block', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`sched: ${e.message}`));
    await p.addInitScript(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, seeded('cfb')]);
    await p.goto(`${BASE}/#/schedule/252`); await p.waitForSelector('.sx-item, .sx-row', { timeout: 45000 }).catch(() => log('NO SCHED'));
    await p.waitForTimeout(1500);
    log('schedule rows', await p.$$eval('.sx-item, .sx-row', (e) => e.length), 'watch elements', await p.$$eval('.watch, .wbtn', (e) => e.length));
    await p.screenshot({ path: path.join(OUT, 'schedule-byu.png') });
    const it = await p.$('.sx-item[data-game]'); if (it) { const t = await it.getAttribute('data-game'); const bx = await it.boundingBox(); await p.mouse.click(bx.x + 40, bx.y + 6); await p.waitForTimeout(500); const h = await p.evaluate(() => location.hash); log('schedule tap ->', h, h === t ? 'OK' : 'MISMATCH'); if (h !== t) bad++; }
    await c.close(); }
  await b.close(); log('page errors:', errs.length, errs); process.exit(errs.length || bad ? 1 : 0);
})();
