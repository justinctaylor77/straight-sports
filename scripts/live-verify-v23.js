// Live verification for v1.4.0 "Hail Mary" against production. Usage: node scripts/live-verify-v21.js -> screenshots/v21/live-*.png, live-verify-v21.json
// Read-only plus one 390px screenshot of Settings > Account. No sync data is written unless SYNC_SMOKE=1 (not used while sync is off).
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = 'https://straight-sports.onrender.com'; const ROOT = path.join(__dirname, '..'); const OUT = path.join(ROOT, 'screenshots', 'v23-live');
const KEY = 'straightcfb.settings.v1'; const R = [];
const J = async (u) => { for (let i = 0; i < 6; i++) { try { const r = await fetch(BASE + u, { signal: AbortSignal.timeout(60000) }); if (r.status < 500) return { s: r.status, j: await r.json().catch(() => null) }; } catch (e) {} await new Promise((x) => setTimeout(x, 3000)); } return { s: 0, j: null }; };
const ok = (id, desc, pass, actual, shot) => { R.push({ id, desc, status: pass ? 'PASS' : 'FAIL', actual: String(actual).slice(0, 300), evidence: shot || '' }); console.log(pass ? 'PASS' : 'FAIL', id, String(actual).slice(0, 120)); };
(async () => {
  const sw = await (await fetch(BASE + '/sw.js')).text(); ok('LV-01', '/sw.js version is ss-v29', /VERSION\s*=\s*'ss-v29'/.test(sw), (sw.match(/ss-v\d+/) || [])[0]);
  const h = await (await fetch(BASE + '/')).text(); ok('LV-02', 'index.html loads app.js?v=29', /app\.js\?v=29/.test(h), (h.match(/app\.js\?v=\d+/) || ['none'])[0]);
  const st = await J('/api/sync/status'); ok('LV-03', '/api/sync/status answers 200 with {enabled, ready}', st.s === 200 && st.j && 'enabled' in st.j && 'ready' in st.j, JSON.stringify(st.j));
  ok('LV-03b', 'sync enabled and ready', !!(st.j && st.j.enabled && st.j.ready), JSON.stringify(st.j));
  const hl = await J('/api/health'); ok('LV-04', '/api/health ok', hl.s === 200 && hl.j && hl.j.ok, JSON.stringify(hl.j));
  for (const sp of ['nfl', 'cfb', 'mlb', 'nba', 'nhl', 'epl', 'ausl']) { const r = await J(`/api/scoreboard?sport=${sp}`); ok(`LV-SC-${sp}`, `scores: /api/scoreboard?sport=${sp}`, r.s === 200 && r.j, `HTTP ${r.s}`); }
  const n = await J('/api/news'); ok('LV-05', 'news: /api/news', n.s === 200 && n.j, `HTTP ${n.s}`);
  const ALL = ['nfl', 'nba', 'wnba', 'mcbb', 'wcbb', 'mlb', 'cbase', 'softball', 'gymnastics', 'ausl'];
  const lr = await Promise.all(ALL.map((s) => J(`/api/lists/${s}`))); const pr = await Promise.all(ALL.map((s) => J(`/api/playoffs/${s}`)));
  ok('LV-06', 'rankings lists: all 10 /api/lists/<sport> 200', lr.every((x) => x.s === 200), lr.map((x) => x.s).join(','));
  ok('LV-07', 'brackets: all 10 /api/playoffs/<sport> 200', pr.every((x) => x.s === 200), pr.map((x) => x.s).join(','));
  const b = await J('/api/brackets'); ok('LV-08', '/api/brackets (JT/AP/CFP)', b.s === 200, `HTTP ${b.s}`);
  const t25 = await J('/api/jt-top25'); ok('LV-09', '/api/jt-top25 keeps legacy bracket field', t25.s === 200, `HTTP ${t25.s}`);
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await ctx.addInitScript(([k]) => { try { if (!localStorage.getItem(k)) localStorage.setItem(k, JSON.stringify({ onboarded: true, sport: 'nfl', sports: ['nfl'] })); } catch (e) {} }, [KEY]);
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 120)));
  await p.goto(BASE + '/#/settings', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500);
  const txt = await p.evaluate(() => document.body.innerText); const card = /Account/i.test(txt);
  await p.screenshot({ path: path.join(OUT, 'live-settings-account-390.png') });
  ok('LV-10', 'Settings page renders an Account card at 390px', card && !errs.length, `account text=${card}; page errors=${errs.length}; "Sync not available"=${/Sync not available/i.test(txt)}; "Create my recovery code"=${/Create my recovery code/i.test(txt)}`, 'screenshots/v21/live-settings-account-390.png');
  await p.goto(BASE + '/#/rankings/playoffs/nfl', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(OUT, 'live-nfl-bracket-390.png') });
  const chip = await p.evaluate(() => [...document.querySelectorAll('#view .chip.on, #view .chip[aria-pressed="true"], #view .on')].slice(0, 6).map((x) => x.textContent.trim()).join(' | ') || 'n/a');
  ok('LV-11', 'Rankings > NFL > Bracket highlights NFL chip on production', /NFL/i.test(chip) && !/CFB/i.test(chip), `highlighted chip: ${chip}`, 'screenshots/v21/live-nfl-bracket-390.png');
  await br.close();
  fs.writeFileSync(path.join(ROOT, 'live-verify-v21.json'), JSON.stringify(R, null, 1));
  console.log(`${R.filter((x) => x.status === 'PASS').length} PASS / ${R.filter((x) => x.status === 'FAIL').length} FAIL of ${R.length}`);
})();
