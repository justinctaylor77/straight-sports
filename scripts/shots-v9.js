// Usage: node scripts/shots-v9.js [baseUrl] [outDir]  → scores / team / schedule screenshots (phone + desktop, dark + light)
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.argv[3] || require('path').join(__dirname, '..', 'screenshots', 'v9');
require('fs').mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb', follow: ['252', '254', 'nfl:22', 'mlb:30'], players: {},
  conferences: ['4', '9'], muteTeams: [], muteLeagues: [], muteKeywords: [], sources: {}, straightOnly: true, sportOnly: true, theme: 'system', blockOutlets: [] };
const ready = (p) => p.waitForFunction(() => !document.querySelector('#view .sk') && !document.querySelector('#splash'), null, { timeout: 60000 });
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  for (const [dev, vp, mobile] of [['phone', { width: 390, height: 1400 }, true], ['desk', { width: 1280, height: 1000 }, false]]) {
    for (const scheme of ['dark', 'light']) {
      const c = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: scheme });
      await c.addInitScript(([k, v]) => { if (!sessionStorage.getItem('keep')) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem('keep', '1'); } }, [KEY, seeded]);
      const p = await c.newPage();
      p.on('pageerror', (e) => errs.push(`${dev}/${scheme}: ${e.message}`));
      const shots = (process.env.PAGES || 'scores,scores-nfl,scores-mlb,team,team-nfl,schedule,home,settings').split(',');
      const go = async (h, name, full, w = 1500, pre) => { if (!shots.includes(name.split('-')[0] + (name.includes('-') && name.split('-')[1].length < 5 ? '-' + name.split('-')[1] : '')) && !shots.includes(name)) return;
        await p.goto(`${BASE}/`); await ready(p).catch(() => {}); if (pre) await pre(); await p.evaluate((h) => { location.hash = h; }, h); await p.waitForTimeout(400); await ready(p).catch(() => {}); await p.waitForTimeout(w);
        await p.screenshot({ path: `${OUT}/${dev}-${scheme}-${name}.png`, fullPage: false }); console.log('saved', `${dev}-${scheme}-${name}`); };
      await go('#/scores', 'scores', true);
      await go('#/team/254', 'team', true);
      await go('#/team/nfl:26', 'team-nfl', false);
      await go('#/schedule/254', 'schedule', true);
      await go('#/scores', 'scores-nfl', true, 1500, async () => { await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.sport = 'nfl'; localStorage.setItem(k, JSON.stringify(s)); }, KEY); await p.reload(); await ready(p).catch(() => {}); });
      await go('#/scores', 'scores-mlb', true, 1500, async () => { await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.sport = 'mlb'; localStorage.setItem(k, JSON.stringify(s)); }, KEY); await p.reload(); await ready(p).catch(() => {}); });
      await c.close();
    }
  }
  await b.close(); if (errs.length) console.log('ERRORS\n' + errs.join('\n'));
})();
