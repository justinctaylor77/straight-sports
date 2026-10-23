// Usage: node scripts/screenshots.js [baseUrl]
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = require('path').join(__dirname, '..', 'screenshots');
const settings = {
  v: 1, onboarded: true, follow: ['252', '254', '328'], conferences: ['4', '9', '17'],
  muteTeams: [], muteLeagues: ['nba', 'wnba'], muteKeywords: ['NBA', 'WNBA', 'Arch Manning'],
  sources: {}, straightOnly: true, footballOnly: true, theme: 'system', blockOutlets: [],
};
const shots = [
  ['home', '#/home'], ['scores', '#/scores'], ['news-muted', '#/news'], ['settings', '#/settings'], ['rankings', '#/rankings'], ['team-byu', '#/team/252'],
];
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  for (const [label, vp, mobile] of [['phone', { width: 390, height: 844 }, true], ['desktop', { width: 1280, height: 800 }, false]]) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile, colorScheme: 'light', timezoneId: 'America/Denver' });
    await ctx.addInitScript((s) => { if (!localStorage.getItem('straightcfb.settings.v1')) localStorage.setItem('straightcfb.settings.v1', JSON.stringify(s)); }, settings);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR', label, e.message));
    page.on('console', (m) => { if (m.type() === 'error') console.log('console.error', label, m.text()); });
    for (const [name, hash] of shots) {
      await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !document.querySelector('#view .loading') && !document.querySelector('#team-news .loading'), null, { timeout: 45000 }).catch(() => console.log('timeout', name));
      await page.waitForTimeout(1200);
      const file = `${OUT}/${label}-${name}.png`;
      await page.screenshot({ path: file, fullPage: false });
      console.log('saved', file);
    }
    // previous week (shows Final scores) and the Mute section of settings
    await page.goto(`${BASE}/#/scores`); await page.waitForSelector('#week');
    const prev = await page.$eval('#week', (s) => s.options[Math.max(0, s.selectedIndex - 1)].value);
    await page.selectOption('#week', prev); await page.waitForTimeout(500);
    await page.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 30000 }); await page.waitForTimeout(800);
    await page.screenshot({ path: `${OUT}/${label}-scores-last-week.png` }); console.log('saved', `${OUT}/${label}-scores-last-week.png`);
    await page.goto(`${BASE}/#/settings`); await page.waitForSelector('#kwform');
    await page.evaluate(() => { const el = [...document.querySelectorAll('.set-sec h3')].find((h) => h.textContent.includes('Mute')); window.scrollTo(0, el.getBoundingClientRect().top + scrollY - 12); });
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}/${label}-settings-mutes.png` }); console.log('saved', `${OUT}/${label}-settings-mutes.png`);
    // a dark-mode desktop/phone home too
    await ctx.close();
  }
  const dark = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, colorScheme: 'dark', timezoneId: 'America/Denver' });
  await dark.addInitScript((s) => localStorage.setItem('straightcfb.settings.v1', JSON.stringify(s)), settings);
  const p = await dark.newPage(); await p.goto(`${BASE}/#/home`); await p.waitForFunction(() => !document.querySelector('#view .loading'), null, { timeout: 45000 }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${OUT}/phone-home-dark.png` }); console.log('saved', `${OUT}/phone-home-dark.png`);
  // onboarding (fresh user)
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, timezoneId: 'America/Denver' });
  const f = await fresh.newPage(); await f.goto(`${BASE}/`); await f.waitForSelector('.welcome', { timeout: 30000 }); await f.waitForTimeout(800);
  await f.screenshot({ path: `${OUT}/phone-onboarding.png` }); console.log('saved', `${OUT}/phone-onboarding.png`);
  await browser.close();
})();
