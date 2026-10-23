// Usage: node scripts/screenshots-v4.js [baseUrl] → screenshots/v4/  (ONLY=home,cast,grok,set,extra,desk,upg)
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = require('path').join(__dirname, '..', 'screenshots', 'v4');
const KEY = 'straightcfb.settings.v1';
const F = (c) => `https://a.espncdn.com/i/teamlogos/countries/500/${c}.png`;
const seeded = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sport: 'cfb',
  follow: ['252', '254', 'nfl:22', 'nfl:12', 'mlb:30', 'mlb:8', 'golf:5075548', 'golf:6001', 'tennis:7602'],
  players: { 'golf:5075548': { name: 'Kensei Hirata', flag: F('jpn') }, 'golf:6001': { name: 'Séamus Power', flag: F('irl') }, 'tennis:7602': { name: 'Flavio Cobolli', flag: F('ita') } },
  conferences: ['4', '9'], muteTeams: [], muteLeagues: ['nba', 'wnba'], muteKeywords: ['Arch Manning'], sources: {}, straightOnly: true, sportOnly: true, theme: 'system', blockOutlets: ['Bleacher Report'] };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: 'dark' };
const DESK = { viewport: { width: 1440, height: 900 }, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: 'dark' };
const ready = (p) => p.waitForFunction(() => !document.querySelector('#view .sk') && !document.querySelector('#splash'), null, { timeout: 45000 });
const errors = []; const notes = [];
const shot = async (p, name, full) => {
  const ow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); if (ow > 1) errors.push(`${name}: horizontal overflow ${ow}px`);
  await p.screenshot({ path: `${OUT}/${name}.png`, fullPage: !!full }); console.log('saved', name);
};
const seed = (c, s) => c.addInitScript(([k, v]) => { if (!sessionStorage.getItem('keep')) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem('keep', '1'); } }, [KEY, s]);
const go = async (p, h, w = 1400) => { await p.goto(`${BASE}/${h}`); await ready(p); await p.waitForTimeout(w); };
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const watch = (p, l) => { p.on('pageerror', (e) => errors.push(`${l}: ${e.message}`)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(`${l} console: ${m.text()}`)); };
  const only = process.env.ONLY || ''; const on = (k) => !only || only.split(',').includes(k);
  const ctx = async (o = PHONE, s = seeded) => { const c = await browser.newContext(o); if (s) await seed(c, s); const p = await c.newPage(); watch(p, o === PHONE ? 'phone' : 'desk'); return [c, p]; };

  if (on('upg')) { // saved v2 state must survive the upgrade untouched
    const [c, p] = await ctx(); await go(p, '#/home', 2500);
    for (const h of ['#/scores', '#/news', '#/rankings', '#/settings', '#/settings/sports', '#/settings/teams']) await go(p, h, 900);
    const after = JSON.parse(await p.evaluate((k) => localStorage.getItem(k), KEY));
    const same = (k) => JSON.stringify(after[k]) === JSON.stringify(seeded[k]);
    for (const k of ['sports', 'follow', 'muteLeagues', 'muteTeams', 'muteKeywords', 'conferences', 'blockOutlets', 'straightOnly', 'sportOnly', 'theme']) if (!same(k)) errors.push(`upgrade changed ${k}: ${JSON.stringify(after[k])}`);
    for (const id of Object.keys(seeded.players)) if (!after.players?.[id]?.name) errors.push(`upgrade lost player ${id}`);
    notes.push(`after upgrade: sports=${after.sports} follow=${after.follow.length} mutes=${after.muteLeagues}`);
    const chips = await p.evaluate(() => [...document.querySelectorAll('[data-switch]')].map((e) => e.dataset.switch));
    notes.push('sport bar: ' + [...new Set(chips)].join(','));
    await c.close();
  }
  if (on('home')) {
    const [c, p] = await ctx(); await go(p, '#/home', 2500);
    let i = 1;
    for (const k of ['cfb', 'nfl', 'mlb', 'golf', 'tennis']) {
      if (k !== 'cfb') { await p.tap(`[data-switch="${k}"] >> visible=true`); await ready(p); await p.waitForTimeout(1800); }
      notes.push(`home ${k}: data-sport=${await p.evaluate(() => document.documentElement.dataset.sport)}`);
      await shot(p, `phone-0${i++}-home-${k}`);
    }
    await go(p, '#/team/252', 2200); await shot(p, 'phone-06-team-byu');
    await p.evaluate(() => document.querySelector('.roster')?.scrollIntoView()); await p.waitForTimeout(400); await shot(p, 'phone-07-team-byu-roster');
    await go(p, '#/team/nfl:22', 2200); await shot(p, 'phone-08-team-cardinals');
    await c.close();
  }
  if (on('cast')) {
    const [c, p] = await ctx();
    for (const [sp, id, n] of [['nfl', '401873010', '09'], ['cfb', '401871055', '10'], ['mlb', '401908028', '11']]) { await go(p, `#/game/${sp}/${id}`, 2200); await shot(p, `phone-${n}-gamecast-${sp}`); }
    await p.tap('[data-gctab="stats"]').catch(() => {}); await p.waitForTimeout(800); await shot(p, 'phone-12-gamecast-mlb-box');
    await c.close();
  }
  if (on('grok')) {
    const [c, p] = await ctx(); await go(p, '#/rankings/grok', 1500); await shot(p, 'phone-13-grok-top25');
    for (const [t, n] of [['chart', '14-grok-compare'], ['bracket', '15-grok-bracket'], ['notes', '16-grok-notes']]) { await p.tap(`[data-gt="${t}"]`); await p.waitForTimeout(700); await shot(p, `phone-${n}`, t === 'bracket'); }
    await go(p, '#/rankings', 1200); await shot(p, 'phone-17-rankings-cfb');
    await c.close();
  }
  if (on('set')) {
    const [c, p] = await ctx(); await go(p, '#/settings', 900); await shot(p, 'phone-18-settings');
    await go(p, '#/settings/sports', 900); await shot(p, 'phone-19-settings-sports-catalog', true);
    const nbaOn = await p.evaluate(() => document.querySelector('[data-sport="nba"]')?.classList.contains('on')); if (nbaOn) errors.push('NBA preselected');
    await go(p, '#/settings/teams', 1500); await shot(p, 'phone-20-settings-teams');
    await p.tap('[data-psport="nfl"] >> visible=true').catch((e) => errors.push('psport ' + e.message)); await p.waitForTimeout(900);
    await p.tap('[data-pmode="players"] >> visible=true').catch((e) => errors.push('pmode ' + e.message)); await p.waitForTimeout(600);
    const inp = p.locator('input[type="search"] >> visible=true').first(); await inp.fill('Kyler'); await p.waitForTimeout(2500);
    const rows = await p.locator('[data-tfollow] >> visible=true').count(); notes.push(`player search "Kyler" rows=${rows}`);
    await shot(p, 'phone-21-settings-player-search');
    await c.close();
  }
  if (on('extra')) { // someone else's install enabling NBA + UFC + EPL (not the user's)
    const other = { ...seeded, sports: ['nba', 'epl', 'ufc', 'f1'], sport: 'nba', follow: [], players: {}, muteLeagues: [] };
    const [c, p] = await ctx(PHONE, other); await go(p, '#/home', 2500); await shot(p, 'phone-22-other-user-home-nba');
    await go(p, '#/game/nba/401909088', 2200); await shot(p, 'phone-23-other-gamecast-nba');
    await go(p, '#/game/epl/401879257', 2200); await shot(p, 'phone-24-other-gamecast-epl');
    await p.goto(`${BASE}/#/home`); await ready(p); await p.tap('[data-switch="ufc"] >> visible=true').catch(() => {}); await ready(p); await p.waitForTimeout(1800); await shot(p, 'phone-25-other-home-ufc');
    await c.close();
  }
  if (on('desk')) {
    const [c, p] = await ctx(DESK); await go(p, '#/home', 2500); await shot(p, 'desktop-01-home-cfb');
    await go(p, '#/game/nfl/401873010', 2200); await shot(p, 'desktop-02-gamecast-nfl');
    await go(p, '#/team/252', 2200); await shot(p, 'desktop-03-team-byu');
    await go(p, '#/rankings/grok', 1500); await p.click('[data-gt="bracket"]'); await p.waitForTimeout(700); await shot(p, 'desktop-04-grok-bracket');
    await p.click('[data-gt="chart"]'); await p.waitForTimeout(700); await shot(p, 'desktop-05-grok-compare');
    await go(p, '#/game/mlb/401908028', 2000); await shot(p, 'desktop-06-gamecast-mlb');
    await go(p, '#/settings', 900); await shot(p, 'desktop-07-settings');
    await c.close();
  }
  await browser.close();
  console.log('NOTES\n' + notes.join('\n'));
  console.log(errors.length ? 'ERRORS\n' + errors.join('\n') : 'NO ERRORS');
})();
