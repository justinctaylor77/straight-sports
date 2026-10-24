// Usage: node scripts/shots-gamecast.js [baseUrl] [outDir] → element shots of the Gamecast play graphics per sport (phone, dark + light)
const { chromium } = require('playwright-core');
const BASE = process.argv[2] || 'http://localhost:8787';
const OUT = process.argv[3] || require('path').join(__dirname, '..', 'screenshots', 'v9');
require('fs').mkdirSync(OUT, { recursive: true });
const KEY = 'straightcfb.settings.v1';
const seeded = { v: 2, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis', 'nhl', 'nba', 'mls', 'epl', 'f1'], sport: 'nfl', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], muteKeywords: [], sources: {}, straightOnly: true, sportOnly: true, theme: 'system', blockOutlets: [] };
const FB = (n, d, f) => ({ n: `football-${n}`, sp: 'nfl', h: '#/game/nfl/401873010', sel: '.gx-fb', acts: [`gc:fd=40187301${d};fp=4018730${f}`] });
const CASES = JSON.parse(process.env.CASES || 'null') || [
  FB('pass-td', '013', '102763'), FB('incomplete', '019', '104092'), FB('run-td', '07', '101150'), FB('fg', '019', '104163'), FB('fg-miss', '016', '103496'), FB('punt', '017', '103592'), FB('sack', '018', '103918'), FB('kickoff', '020', '104183'), FB('int', '09', '101658'),
  { n: 'football', sp: 'nfl', h: '#/game/nfl/401873010', sel: '.gx-fb' },
  { n: 'baseball', sp: 'mlb', h: '#/game/mlb/401930515', sel: '.gx-bb' },
  { n: 'hockey', sp: 'nhl', h: '#/game/nhl/401892550', sel: '.gx-hk' },
  { n: 'basketball', sp: 'nba', h: '#/game/nba/401909834', sel: '.gx-bk' },
  { n: 'soccer', sp: 'mls', h: '#/game/mls/761773', sel: '.gx-sc' },
  { n: 'golf', sp: 'golf', h: '#/game/golf/pga-401850917', sel: '.gx-golf' },
  { n: 'tennis', sp: 'tennis', h: '#/game/tennis/atp-186991', sel: '.gx-tn' },
  { n: 'racing', sp: 'f1', h: '#/game/f1/600057446', sel: '.gx-race' },
];
(async () => {
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errs = [];
  for (const scheme of ['dark', 'light']) {
    const c = await b.newContext({ viewport: { width: 390, height: 1500 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, timezoneId: 'America/Denver', serviceWorkers: 'block', colorScheme: scheme });
    const p = await c.newPage(); p.on('pageerror', (e) => errs.push(`${scheme}: ${e.message}`)); p.on('console', (m) => { if (m.type() === 'error') errs.push(`${scheme} console: ${m.text()}`); });
    for (const k of CASES) {
      const s = { ...seeded, sport: k.sp };
      await p.addInitScript(([key, v]) => { localStorage.setItem(key, JSON.stringify(v)); }, [KEY, s]);
      await p.goto(`${BASE}/`); await p.evaluate((h) => { location.hash = h; }, k.h); await p.reload();
      await p.waitForSelector(k.sel, { timeout: 40000 }).catch(() => console.log('no', k.n, scheme));
      for (const a of k.acts || []) {
        if (a.startsWith('gc:')) { for (const kv of a.slice(3).split(';')) { await p.evaluate((kv) => { const b = document.createElement('button'); b.dataset.gcset = kv; b.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px'; (document.querySelector('#view') || document.body).appendChild(b); b.click(); b.remove(); }, kv); await p.waitForTimeout(900); } continue; }
        await p.click(a).catch(() => {}); await p.waitForTimeout(500);
      }
      await p.waitForTimeout(500);
      await p.addStyleTag({ content: '.nav, .tabbar, nav.bottom, .app-bar, .toolbar.sticky, .gc-tabs, .sportbar { display: none !important; } .gx-fb, .gx-bb { scroll-margin-top: 0; }' });
      const el = await p.$(k.sel); if (!el) { await p.screenshot({ path: `${OUT}/gc-${scheme}-${k.n}-MISSING.png` }); continue; }
      await p.evaluate((q) => document.querySelector(q).scrollIntoView({ block: 'start' }), k.sel); await p.waitForTimeout(300); const bb = await el.boundingBox(); await p.screenshot({ path: `${OUT}/gc-${scheme}-${k.n}.png`, clip: { x: Math.max(0, bb.x - 4), y: Math.max(0, bb.y - 4), width: Math.min(390, bb.width + 8), height: bb.height + 8 } }); console.log('saved', scheme, k.n);
    }
    await c.close();
  }
  await b.close(); if (errs.length) console.log('ERRORS\n' + [...new Set(errs)].join('\n'));
})();
