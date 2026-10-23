// Usage: node scripts/screenshots-v2.js [baseUrl]  → screenshots/v2/
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = require('path').join(__dirname, '..', 'screenshots', 'v2');
const KEY = 'straightcfb.settings.v1';
const seeded = { v: 1, onboarded: true, follow: ['252', '254', '328'], conferences: ['4', '9', '17'], muteTeams: [], muteLeagues: ['nba', 'wnba'],
  muteKeywords: ['Arch Manning'], sources: {}, straightOnly: true, footballOnly: true, theme: 'system', blockOutlets: ['Bleacher Report'] };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block' };
const ready = (p) => p.waitForFunction(() => !document.querySelector('#view .sk') && !document.querySelector('#splash'), null, { timeout: 45000 });
const errors = [];
async function shot(p, name) { await p.screenshot({ path: `${OUT}/${name}.png` }); console.log('saved', `${OUT}/${name}.png`); }
async function swipe(p, cdp, fromX, toX, y) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fromX, y }] });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: fromX + ((toX - fromX) * i) / 8, y }] }); await p.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(600);
}
const step = (p) => p.$$eval('.dot', (d) => d.findIndex((x) => x.classList.contains('on')));
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const watch = (p, l) => { p.on('pageerror', (e) => errors.push(`${l}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && errors.push(`${l} console: ${m.text()}`)); };

  // ---- fresh phone user: splash → onboarding → feed ----
  const ctx = await browser.newContext({ ...PHONE, colorScheme: 'light' });
  const p = await ctx.newPage(); watch(p, 'phone'); const cdp = await ctx.newCDPSession(p);
  await p.route('**/api/teams', async (r) => { await new Promise((s) => setTimeout(s, 1200)); r.continue().catch(() => {}); });
  await p.goto(`${BASE}/`); await p.waitForTimeout(500); await shot(p, 'phone-00-splash');
  await p.unroute('**/api/teams');
  await p.waitForSelector('#onb'); await p.waitForFunction(() => !document.querySelector('#splash')); await p.waitForTimeout(900);
  await shot(p, 'phone-01-onboarding-welcome');
  await p.tap('[data-nav="next"]'); await p.waitForTimeout(600);
  for (const id of ['252', '254', '328']) { await p.tap(`[data-part="quick"] [data-tfollow="${id}"]`); await p.waitForTimeout(120); }
  await p.waitForTimeout(300); await shot(p, 'phone-02-onboarding-teams');
  await swipe(p, cdp, 330, 60, 600); // swipe left → conferences
  console.log('after swipe-left step =', await step(p));
  for (const name of ['Big 12', 'Pac-12', 'Mountain West']) { const b = p.locator('.tile', { hasText: name }).first(); if (await b.count()) await b.tap(); await p.waitForTimeout(100); }
  await p.waitForTimeout(300); await shot(p, 'phone-03-onboarding-conferences');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(600); // keyboard → mute
  console.log('after ArrowRight step =', await step(p));
  await p.tap('[data-league="nba"]'); await p.tap('[data-league="wnba"]');
  await p.fill('.slide:nth-child(4) [data-form="kw"] input', 'Arch Manning'); await p.press('.slide:nth-child(4) [data-form="kw"] input', 'Enter');
  await p.tap('[data-block="Bleacher Report"]'); await p.waitForTimeout(400);
  await shot(p, 'phone-04-onboarding-mute');
  await swipe(p, cdp, 60, 330, 500); console.log('after swipe-right step =', await step(p)); await swipe(p, cdp, 330, 60, 500);
  await p.tap('[data-nav="next"]'); await p.waitForTimeout(700); await shot(p, 'phone-05-onboarding-done');
  await p.tap('[data-nav="next"]'); await p.waitForTimeout(500);
  console.log('saved settings:', await p.evaluate((k) => localStorage.getItem(k), KEY));
  await ready(p); await p.waitForTimeout(1200); await shot(p, 'phone-06-home');
  await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(500); await shot(p, 'phone-07-home-scrolled-compact-header'); await p.evaluate(() => scrollTo(0, 0));
  await p.tap('.nav a[data-tab="news"]'); await ready(p); await p.waitForTimeout(1000); await shot(p, 'phone-08-news');
  await p.tap('.news-list .item >> nth=0'); await p.waitForTimeout(700); await shot(p, 'phone-09-story-sheet');
  await p.tap('.sheet-x'); await p.waitForTimeout(500);
  console.log('sheet closed:', !(await p.$('#sheet')), 'hash', await p.evaluate(() => location.hash));
  await p.goto(`${BASE}/#/team/252`); await ready(p); await p.waitForFunction(() => !document.querySelector('#team-news .sk'), null, { timeout: 45000 }); await p.waitForTimeout(1000); await shot(p, 'phone-10-team-byu');
  await p.tap('.nav a[data-tab="settings"]'); await ready(p); await p.waitForTimeout(700); await shot(p, 'phone-11-settings');
  await p.tap('a.row[href="#/settings/mute"]'); await p.waitForTimeout(700); await shot(p, 'phone-12-settings-mute');
  await p.tap('#ab-back'); await p.waitForTimeout(500); console.log('back →', await p.evaluate(() => location.hash));
  await p.tap('a.row[href="#/settings/teams"]'); await p.waitForTimeout(700); await shot(p, 'phone-13-settings-teams');
  await ctx.close();
  // skeleton loaders: fresh seeded context with slow APIs
  const sc = await browser.newContext({ ...PHONE, colorScheme: 'light' });
  await sc.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, seeded]);
  await sc.route(/\/api\/(scoreboard|news|rankings)/, async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.continue().catch(() => {}); });
  const sp = await sc.newPage(); await sp.goto(`${BASE}/#/home`); await sp.waitForSelector('#view .sk'); await sp.waitForFunction(() => !document.querySelector('#splash'));
  await sp.waitForTimeout(300); await shot(sp, 'phone-14-skeleton-loading'); await sc.close();

  // ---- dark phone home ----
  const dk = await browser.newContext({ ...PHONE, colorScheme: 'dark' });
  await dk.addInitScript(([k, s]) => localStorage.setItem(k, JSON.stringify(s)), [KEY, seeded]);
  const d = await dk.newPage(); watch(d, 'dark'); await d.goto(`${BASE}/#/home`); await ready(d); await d.waitForTimeout(1200); await shot(d, 'phone-15-home-dark'); await dk.close();

  // ---- desktop ----
  const dc = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light', timezoneId: 'America/Denver' });
  await dc.addInitScript(([k, s]) => { if (!sessionStorage.getItem('fresh')) localStorage.setItem(k, JSON.stringify(s)); }, [KEY, seeded]);
  const w = await dc.newPage(); watch(w, 'desktop'); await w.goto(`${BASE}/#/home`); await ready(w); await w.waitForTimeout(1500); await shot(w, 'desktop-home');
  await w.click('.news-list .item >> nth=0'); await w.waitForTimeout(600); await shot(w, 'desktop-story-sheet'); await w.keyboard.press('Escape'); await w.waitForTimeout(400);
  await w.evaluate(() => { sessionStorage.setItem('fresh', '1'); localStorage.clear(); }); await w.goto(`${BASE}/`); await w.waitForSelector('#onb'); await w.waitForTimeout(900);
  await w.keyboard.press('ArrowRight'); await w.waitForTimeout(600); await shot(w, 'desktop-onboarding-teams');
  await dc.close();
  await browser.close();
  console.log(errors.length ? `ERRORS:\n${errors.join('\n')}` : 'no page errors');
})();
