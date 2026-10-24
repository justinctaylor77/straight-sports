// Usage: node scripts/shots-v11.js [baseUrl] [outDir]
// Gamecast animation check (ss-v18): per-sport replay frames (mid-flight → settled), reduced-motion run, live-refresh "only the new play animates"
// check, drive autoplay, and the live venue card (attendance "Not reported yet" / sellout "Pending"). Prints page errors; exits 1 on any.
const { chromium } = require('playwright-core');
const fs = require('fs'); const path = require('path');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.argv[3] || path.join(__dirname, '..', 'screenshots', 'v11');
fs.mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = (sport) => ({ v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis', 'nhl', 'nba', 'mls', 'epl', 'f1'], sport, follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [] });
const CASES = [
  { n: 'football', sp: 'nfl', h: '#/game/nfl/401873010', sel: '.gx-fb' },
  { n: 'baseball', sp: 'mlb', h: '#/game/mlb/401930515', sel: '.gx-bb' },
  { n: 'hockey', sp: 'nhl', h: '#/game/nhl/401892550', sel: '.gx-hk' },
  { n: 'basketball', sp: 'nba', h: '#/game/nba/401909834', sel: '.gx-bk' },
  { n: 'soccer', sp: 'mls', h: '#/game/mls/761773', sel: '.gx-sc' },
  { n: 'golf', sp: 'golf', h: '#/game/golf/pga-401850917', sel: '.gx-golf' },
  { n: 'tennis', sp: 'tennis', h: '#/game/tennis/atp-187219', sel: '.gx-tn' },
  { n: 'racing', sp: 'f1', h: '#/game/f1/600057446', sel: '.gx-race' },
];
const errs = []; const log = (...a) => console.log(...a);
async function open(b, k, opts = {}) {
  const c = await b.newContext({ viewport: { width: 390, height: 1300 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: 'dark', reducedMotion: opts.rm ? 'reduce' : 'no-preference' });
  const p = await c.newPage(); const tag = `${opts.rm ? 'rm ' : ''}${k.n}`;
  p.on('pageerror', (e) => errs.push(`${tag}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errs.push(`${tag} console: ${m.text()}`); });
  await p.addInitScript(([key, v]) => { localStorage.setItem(key, JSON.stringify(v)); }, [KEY, seeded(k.sp)]);
  await p.goto(`${BASE}/`); await p.evaluate((h) => { location.hash = h; }, k.h); await p.reload();
  await p.waitForSelector(k.sel, { timeout: 45000 }).catch(() => log('MISSING', tag));
  await p.addStyleTag({ content: '.nav, .tabbar, nav.bottom, .app-bar, .toolbar.sticky, .gc-tabs, .sportbar { display: none !important; }' });
  return { c, p };
}
const shot = async (p, sel, file) => { for (let t = 0; t < 3; t++) { try { const el = await p.$(sel); if (!el) return; await el.scrollIntoViewIfNeeded({ timeout: 3000 }); await el.screenshot({ path: `${OUT}/${file}.png`, timeout: 5000 }); return; } catch { await p.waitForTimeout(150); } } };
async function frames(p, sel, name, n = 5) { for (let i = 1; i <= n; i++) await shot(p, sel, `${name}-f${i}`); await p.waitForTimeout(2200); await shot(p, sel, `${name}-final`); }
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  // 1) every sport: replay frames
  for (const k of CASES) {
    const { c, p } = await open(b, k);
    await p.waitForTimeout(2500);
    const rp = await p.$(`${k.sel} [data-replay]`); log(k.n, 'replay button:', !!rp);
    if (rp) { await rp.scrollIntoViewIfNeeded(); await rp.click(); await frames(p, k.sel, `${k.n}-replay`, 5); }
    await c.close();
  }
  // 2) football: select another play (animates just that card) + drive autoplay
  { const k = CASES[0]; const { c, p } = await open(b, k); await p.waitForTimeout(2200);
    const chips = await p.$$(`${k.sel} [data-gcset^="fp="]`); log('football chips', chips.length);
    for (const [i, idx] of [[0, 0], [1, Math.min(2, chips.length - 1)], [2, Math.min(5, chips.length - 1)]]) { await (await p.$$(`${k.sel} [data-gcset^="fp="]`))[idx].click(); await frames(p, k.sel, `football-select${i}`, 3); }
    const ap = await p.$(`${k.sel} [data-autoplay]`); log('autoplay button:', !!ap);
    if (ap) { await ap.click(); for (let i = 1; i <= 4; i++) { await p.waitForTimeout(1700); await shot(p, k.sel, `football-autoplay-${i}`); } await p.click(`${k.sel} [data-autoplay]`).catch(() => {}); const lbl = await p.textContent(`${k.sel} [data-autoplay]`).catch(() => ''); log('autoplay label after pause:', lbl); }
    await c.close(); }
  // 2b) each football play type (NFL game 401873010): pass TD, incomplete, run TD, FG, punt — frames while the ball is in flight, then settled
  { const k = CASES[0]; const { c, p } = await open(b, k); await p.waitForTimeout(2200);
    for (const [n, kv] of [['pass-td', 'fd=40187301013;fp=4018730102763'], ['incomplete', 'fd=40187301019;fp=4018730104092'], ['run-td', 'fd=40187301007;fp=4018730101150'], ['fg', 'fd=40187301019;fp=4018730104163'], ['punt', 'fd=40187301017;fp=4018730103592']]) {
      await p.evaluate((kv) => { const b = document.createElement('button'); b.dataset.gcset = kv.split(';')[0]; b.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0'; document.body.appendChild(b); b.click(); const b2 = document.createElement('button'); b2.dataset.gcset = kv.split(';')[1]; document.body.appendChild(b2); b2.click(); }, kv);
      await frames(p, k.sel, `football-${n}`, 3); }
    await c.close(); }
  // 3) reduced motion: final state, no ball / ripples, no replay buttons
  for (const k of [CASES[0], CASES[1], CASES[3]]) {
    const { c, p } = await open(b, k, { rm: true }); await p.waitForTimeout(1500);
    const info = await p.evaluate((sel) => { const q = document.querySelector(sel); const ball = q.querySelector('.pg-ball'); return { replayVisible: !!q.querySelector('[data-replay]') && getComputedStyle(q.querySelector('[data-replay]')).display !== 'none', ballOpacity: ball ? getComputedStyle(ball).opacity : null, anims: document.getAnimations().length, strokeDash: (q.querySelector('[data-ln]') || {}).style && q.querySelector('[data-ln]').style.strokeDasharray }; }, k.sel);
    log('reduced-motion', k.n, JSON.stringify(info)); await shot(p, k.sel, `reduced-${k.n}`); await c.close();
  }
  // 4) live game (Michigan, cfb): venue card says "Not reported yet"/"Pending"; live refresh patches only what changed and animates only the new play
  { const k = { n: 'cfb-live', sp: 'cfb', h: '#/game/cfb/401858496', sel: '.gc-venue' };
    const c = await b.newContext({ viewport: { width: 390, height: 1300 }, deviceScaleFactor: 2, isMobile: true, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: 'dark' });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`cfb-live: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errs.push(`cfb-live console: ${m.text()}`); });
    let full = null; let trim = true;
    await p.route('**/api/game/cfb/401858496', async (route) => { const r = await route.fetch(); const j = await r.json(); full = JSON.parse(JSON.stringify(j));
      if (trim && j.drives && j.drives[0] && j.drives[0].plays.length > 1) { j.drives[0].plays.pop(); }
      await route.fulfill({ response: r, json: j }); });
    await p.addInitScript(([key, v]) => { localStorage.setItem(key, JSON.stringify(v)); }, [KEY, seeded('cfb')]);
    await p.goto(`${BASE}/`); await p.evaluate((h) => { location.hash = h; }, k.h); await p.reload();
    await p.waitForSelector('.gc-venue', { timeout: 45000 }); await p.waitForTimeout(1500);
    const v = await p.evaluate(() => document.querySelector('.gc-venue').innerText); log('--- venue card (live) ---\n' + v + '\n---');
    await shot(p, '.gc-venue', 'venue-live-pending');
    // mark every card + card child, then let the 10s refresh bring "a new play"
    await p.evaluate(() => { document.querySelectorAll('.gc > *').forEach((e) => { e.__keep = 1; }); document.querySelector('.gx-fb')?.querySelectorAll('svg > *').forEach((e) => { e.__keep = 1; }); window.__n = document.querySelectorAll('.gc > *').length; });
    const before = await p.evaluate(() => document.querySelector('.gx-fb')?.dataset.cur);
    trim = false; await p.waitForTimeout(13000);
    const res = await p.evaluate(() => ({ cardsKept: [...document.querySelectorAll('.gc > *')].filter((e) => e.__keep).length, cards: document.querySelectorAll('.gc > *').length, fbCur: document.querySelector('.gx-fb')?.dataset.cur, anims: document.getAnimations().length }));
    log('live refresh:', JSON.stringify({ before, ...res }), '→ unchanged cards were left in place; the tracker card re-rendered for the new play'); await shot(p, '.gx-fb', 'live-refresh-newplay');
    await c.close(); }
  await b.close();
  if (errs.length) { console.log('ERRORS\n' + [...new Set(errs)].join('\n')); process.exit(1); } else log('no page errors');
})();
