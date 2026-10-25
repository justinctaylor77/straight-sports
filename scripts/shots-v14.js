// Usage: node scripts/shots-v14.js [baseUrl] [outDir]  — ss-v21 rebrand check: header, home, scores, splash, settings, onboarding in dark + light at phone width.
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:8787'; const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v14');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = (extra) => Object.assign({ v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } }, extra || {});
const errs = [];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const scheme of ['dark', 'light']) {
    const run = async (name, hash, { onboarded = true, wait = '#view *', splash = false, clip, settings } = {}) => {
      const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block', colorScheme: scheme });
      const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
      if (!splash) await p.addInitScript(([k, v]) => { localStorage.setItem(k, JSON.stringify(v)); }, [KEY, seeded(Object.assign({ onboarded }, settings))]);
      if (splash) await p.route('**/api/**', (r) => setTimeout(() => r.continue(), 4000));
      await p.goto(`${BASE}/${hash}`);
      if (splash) await p.waitForTimeout(500); else { await p.waitForSelector(wait, { timeout: 45000 }).catch(() => console.log('MISSING', name)); await p.waitForTimeout(2500); }
      const title = await p.title(); console.log(scheme, name, 'title:', title);
      await p.screenshot({ path: path.join(OUT, `${name}-${scheme}.png`), clip });
      await c.close();
    };
    await run('header', '#/home', { clip: { x: 0, y: 0, width: 390, height: 70 } });
    await run('home', '#/home');
    await run('scores', '#/scores', { wait: '[data-game]' });
    await run('splash', '', { splash: true });
    await run('settings', '#/settings', { wait: '.card' });
    await run('onboarding', '', { onboarded: false, wait: '.onb' });
    await run('team-header', '#/team/252', { wait: '.team-hero, h1', clip: { x: 0, y: 0, width: 390, height: 120 } });
  }
  await b.close(); console.log('page errors:', errs.length, errs); process.exit(errs.length ? 1 : 0);
})();
