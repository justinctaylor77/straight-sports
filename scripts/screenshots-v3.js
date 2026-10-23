// Usage: node scripts/screenshots-v3.js [baseUrl] → screenshots/v3/
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = require('path').join(__dirname, '..', 'screenshots', 'v3');
const KEY = 'straightcfb.settings.v1';
const F = (c) => `https://a.espncdn.com/i/teamlogos/countries/500/${c}.png`;
const seeded = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb',
  follow: ['252', '254', 'nfl:22', 'nfl:12', 'mlb:30', 'mlb:8', 'golf:5075548', 'golf:6001', 'tennis:7602'],
  players: { 'golf:5075548': { name: 'Kensei Hirata', flag: F('jpn') }, 'golf:6001': { name: 'Séamus Power', flag: F('irl') }, 'tennis:7602': { name: 'Flavio Cobolli', flag: F('ita') } },
  conferences: ['4', '9'], muteTeams: [], muteLeagues: [], muteKeywords: ['Arch Manning'], sources: {}, straightOnly: true, sportOnly: true, theme: 'system', blockOutlets: ['Bleacher Report'] };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block' };
const ready = (p) => p.waitForFunction(() => !document.querySelector('#view .sk') && !document.querySelector('#splash'), null, { timeout: 45000 });
const errors = [];
const shot = async (p, name, full) => { await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full }); console.log('saved', `${OUT}/${name}.png`); };
const seed = (c, s) => c.addInitScript(([k, v]) => { if (!sessionStorage.getItem('keep')) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem('keep', '1'); } }, [KEY, s]);
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const watch = (p, l) => { p.on('pageerror', (e) => errors.push(`${l}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && errors.push(`${l} console: ${m.text()}`)); };
  const only = process.env.ONLY || '';

  if (!only || only.includes('onb')) {
    // fresh user → sport picker; and a v1 user migrating
    const c = await browser.newContext({ ...PHONE, colorScheme: 'light' }); const p = await c.newPage(); watch(p, 'onb');
    await p.goto(`${BASE}/`); await p.waitForSelector('#onb'); await p.waitForFunction(() => !document.querySelector('#splash')); await p.waitForTimeout(700);
    await shot(p, 'phone-01-onboarding-welcome');
    await p.tap('[data-nav="next"]'); await p.waitForTimeout(600);
    for (const k of ['nfl', 'mlb', 'golf', 'tennis']) { await p.tap(`.slide.on [data-sport="${k}"], [data-sport="${k}"] >> visible=true`); await p.waitForTimeout(120); }
    await p.waitForTimeout(300); await shot(p, 'phone-02-onboarding-sports');
    await p.tap('[data-nav="next"]'); await p.waitForTimeout(700);
    await p.tap('[data-psport="nfl"] >> visible=true').catch((e) => errors.push('psport ' + e.message)); await p.waitForTimeout(800);
    const t = p.locator('[data-tfollow="nfl:22"] >> visible=true'); if (await t.count()) await t.first().tap(); else errors.push('no nfl:22 tile');
    await p.tap('[data-psport="golf"] >> visible=true'); await p.waitForTimeout(1500);
    const g = p.locator('[data-part="grid"] [data-tfollow] >> visible=true'); console.log('golf tiles', await g.count()); if (await g.count()) await g.first().tap();
    await p.waitForTimeout(300); await shot(p, 'phone-03-onboarding-teams-players');
    for (let i = 0; i < 4; i++) { await p.tap('[data-nav="next"]'); await p.waitForTimeout(600); }
    console.log('settings after onboarding:', await p.evaluate((k) => localStorage.getItem(k), KEY));
    await ready(p); await p.waitForTimeout(800); await shot(p, 'phone-04-after-onboarding');
    await c.close();
    const m = await browser.newContext({ ...PHONE, colorScheme: 'light' });
    await seed(m, { v: 1, onboarded: true, follow: ['252'], conferences: ['4'], muteLeagues: ['nba', 'nfl', 'golf'], muteKeywords: [], footballOnly: true, straightOnly: true, sources: {}, blockOutlets: [], theme: 'system' });
    const mp = await m.newPage(); watch(mp, 'migrate'); await mp.goto(`${BASE}/#/home`); await ready(mp); await mp.waitForTimeout(500);
    console.log('migrated:', await mp.evaluate((k) => localStorage.getItem(k), KEY)); await m.close();
  }

  if (!only || only.includes('home')) {
    const c = await browser.newContext({ ...PHONE, colorScheme: 'light' }); await seed(c, seeded); const p = await c.newPage(); watch(p, 'home');
    await p.goto(`${BASE}/#/home`); await ready(p); await p.waitForTimeout(1200);
    let i = 5;
    for (const k of ['cfb', 'nfl', 'mlb', 'golf', 'tennis']) {
      if (k !== 'cfb') { await p.tap(`[data-switch="${k}"]`); await ready(p); await p.waitForTimeout(1500); }
      await shot(p, `phone-${String(i++).padStart(2, '0')}-home-${k}`);
    }
    await p.tap('[data-switch="mlb"]'); await p.tap('.nav a[data-tab="scores"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-10-scores-mlb');
    await p.tap('[data-switch="nfl"]'); await p.tap('.nav a[data-tab="rankings"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-11-standings-nfl');
    await p.tap('[data-switch="tennis"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-12-rankings-tennis');
    await p.tap('[data-switch="golf"]'); await p.tap('.nav a[data-tab="scores"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-13-scores-golf');
    await p.tap('[data-switch="tennis"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-14-scores-tennis');
    await p.tap('.nav a[data-tab="news"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-15-news-tennis');
    await p.tap('.nav a[data-tab="settings"]'); await ready(p); await p.waitForTimeout(700); await shot(p, 'phone-16-settings');
    await p.tap('a.row[href="#/settings/sports"]'); await p.waitForTimeout(700); await shot(p, 'phone-17-settings-sports');
    await p.tap('#ab-back'); await p.waitForTimeout(400); await p.tap('a.row[href="#/settings/teams"]'); await p.waitForTimeout(1200); await shot(p, 'phone-18-settings-teams');
    await p.goto(`${BASE}/#/team/nfl:22`); await ready(p); await p.waitForTimeout(1500); await shot(p, 'phone-19-team-cardinals');
    await c.close();
  }

  if (!only || only.includes('cast')) {
    const c = await browser.newContext({ ...PHONE, colorScheme: 'light' }); await seed(c, seeded); const p = await c.newPage(); watch(p, 'cast');
    const casts = [['nfl', '401873010'], ['cfb', '401752782'], ['mlb', '401908028'], ['mlb', '401908042'], ['golf', 'pga-401850917'], ['tennis', 'atp-185107'], ['tennis', 'atp-186991']];
    for (const [sp, id] of casts) {
      await p.goto(`${BASE}/#/game/${sp}/${id}`); await ready(p); await p.waitForTimeout(1500);
      await shot(p, `gamecast-${sp}-${id}`, true);
      if (sp === 'nfl' || (sp === 'mlb' && id === '401908028')) {
        for (const tab of ['plays', 'stats']) { const b = p.locator(`[data-gctab="${tab}"]`); if (await b.count()) { await b.first().tap(); await p.waitForTimeout(700); await shot(p, `gamecast-${sp}-${id}-${tab}`); } }
        const b = p.locator('[data-gctab="summary"]'); if (await b.count()) await b.first().tap();
      }
      if (sp === 'golf') { await p.locator('.lb-row[data-golfer] >> nth=4').tap(); await p.waitForTimeout(700); await p.locator('.gc-card').first().scrollIntoViewIfNeeded(); await p.evaluate(() => scrollBy(0, -160)); await shot(p, 'gamecast-golf-scorecard'); }
    }
    await c.close();
    const d = await browser.newContext({ ...PHONE, colorScheme: 'dark' }); await seed(d, seeded); const dp = await d.newPage(); watch(dp, 'dark');
    await dp.goto(`${BASE}/#/game/nfl/401873010`); await ready(dp); await dp.waitForTimeout(1200); await shot(dp, 'gamecast-nfl-dark');
    await dp.goto(`${BASE}/#/home`); await ready(dp); await dp.tap('[data-switch="mlb"]'); await ready(dp); await dp.waitForTimeout(1200); await shot(dp, 'phone-20-home-mlb-dark'); await d.close();
  }

  if (!only || only.includes('desk')) {
    const c = await browser.newContext({ viewport: { width: 1280, height: 860 }, colorScheme: 'light', timezoneId: 'America/Denver', serviceWorkers: 'block' }); await seed(c, seeded); const w = await c.newPage(); watch(w, 'desktop');
    await w.goto(`${BASE}/#/home`); await ready(w); await w.waitForTimeout(1500); await shot(w, 'desktop-home-cfb');
    await w.click('[data-switch="golf"]'); await ready(w); await w.waitForTimeout(1500); await shot(w, 'desktop-home-golf');
    await w.goto(`${BASE}/#/game/nfl/401873010`); await ready(w); await w.waitForTimeout(1500); await shot(w, 'desktop-gamecast-nfl');
    await w.goto(`${BASE}/#/game/tennis/atp-185107`); await ready(w); await w.waitForTimeout(1500); await shot(w, 'desktop-gamecast-tennis');
    await c.close();
  }
  await browser.close();
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
})().catch((e) => { console.error('FATAL', e); console.log('ERRORS:', errors.join('\n')); process.exit(1); });
