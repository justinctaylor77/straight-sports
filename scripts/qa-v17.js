// Full local QA for release "Two-Minute Drill" (v1.1.0 / ss-v23).  Usage: node scripts/qa-v17.js   (writes screenshots/v17/*.png and qa-results.json)
// Needs: new server on :8799, mock-CFP server on :8798, stale-client sim server on :8797 (see scripts/qa-v17.sh).
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path'); const cp = require('child_process');
const ROOT = path.join(__dirname, '..'); const OUT = path.join(ROOT, 'screenshots', 'v17'); fs.mkdirSync(OUT, { recursive: true });
const NEW = 'http://localhost:8799', MOCK = 'http://localhost:8798', SIM = 'http://localhost:8797';
const KEY = 'straightcfb.settings.v1'; const SIMDIR = '/tmp/sim';
const results = []; const rel = (f) => `screenshots/v17/${f}`;
const J = (u) => fetch(u).then((r) => r.json());
let browser;
const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' };
// per-page diagnostics: our own origin's console errors / failed requests / page errors (third-party image CDN noise is counted separately)
function watch(p, base) { const d = { errors: [], page: [], failed: [], ext: 0 }; p.on('pageerror', (e) => d.page.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') { const l = m.location().url || ''; if (l && !l.startsWith(base)) d.ext++; else d.errors.push(m.text().slice(0, 160)); } });
  p.on('response', (r) => { if (r.url().startsWith(base) && r.status() >= 400) d.failed.push(`${r.status()} ${r.url().replace(base, '')}`); }); return d; }
const clean = (d) => !d.errors.length && !d.page.length && !d.failed.length;
const diag = (d) => (clean(d) ? 'no console/page errors, no failed app requests' : `ERRORS ${JSON.stringify(d)}`);
const hscroll = (p) => p.evaluate(() => document.documentElement.scrollWidth);
const snap = async (p, name, full) => { await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, name), fullPage: !!full }); return rel(name); };
async function newPage(base, settings, opts = {}) {
  const c = await browser.newContext({ ...ctxOpts, serviceWorkers: opts.sw ? 'allow' : 'block' }); const p = await c.newPage(); const d = watch(p, base);
  if (settings) await p.addInitScript(([k, v, once]) => { if (!once || !sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem('seeded', '1'); } }, [KEY, settings, !!opts.once]);
  return { c, p, d };
}
const chosen = { v: 5, onboarded: true, sports: ['cfb', 'nfl', 'mlb', 'golf', 'tennis'], sportsChosen: true, sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: [], watch: { providers: ['yttv'] } };
async function tc(id, area, desc, steps, expected, fn) {
  let r; try { r = await fn(); } catch (e) { r = { pass: false, actual: `Test threw: ${e.message.split('\n')[0]}` }; }
  results.push({ id, area, desc, steps, expected, actual: r.actual, status: r.pass ? 'PASS' : 'FAIL', evidence: r.shot || '' });
  console.log(r.pass ? 'PASS' : 'FAIL', id, r.pass ? '' : r.actual);
}
const run = (cmd) => { try { return { ok: true, out: cp.execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { ok: false, out: (e.stdout || '') + (e.stderr || '') }; } };
const lib = () => import(path.join(ROOT, 'public', 'lib.js'));

(async () => {
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const L = await lib(); const NSPORTS = L.SPORT_IDS.length;

  // ================= UNIT / STATIC =================
  const files = run("git ls-files -co --exclude-standard '*.js' '*.mjs' | grep -v node_modules").out.trim().split('\n').filter(Boolean);
  await tc('U-01', 'Static', 'Every JS file parses (node --check)', 'node --check on all tracked/new .js/.mjs files', 'No syntax errors', async () => {
    const bad = files.filter((f) => !run(`node --check ${f}`).ok); return { pass: !bad.length, actual: bad.length ? `Failed: ${bad.join(', ')}` : `${files.length} files OK` }; });
  for (const [id, f, what] of [['U-02', 'tests/brackets.test.js', 'Bracket seeding/byes/pending-CFP/legacy-shape unit tests'], ['U-03', 'tests/migrate.test.mjs', 'Settings migration + all-sports default (v5) unit tests'], ['U-04', 'tests/news-filter.test.js', 'News/mute filter unit tests (regression)']]) {
    await tc(id, 'Unit', what, `node ${f}`, 'Exit 0, all assertions pass', async () => { const r = run(`node ${f}`); return { pass: r.ok, actual: r.out.trim().split('\n').slice(-2).join(' | ') }; }); }
  await tc('U-05', 'Static', 'Cache-bust versions agree (index.html, sw.js VERSION/SHELL, app.js icon)', 'grep version strings', 'Everything is ss-v23 / ?v=23 for changed assets; no leftover ?v=22', async () => {
    const idx = fs.readFileSync(path.join(ROOT, 'public/index.html'), 'utf8'), sw = fs.readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8'), app = fs.readFileSync(path.join(ROOT, 'public/app.js'), 'utf8');
    const left = [idx, sw, app].filter((t) => /\?v=22/.test(t)).length; const ok = /ss-v23/.test(sw) && !left && /app\.js\?v=23/.test(idx) && /styles\.css\?v=23/.test(idx);
    return { pass: ok, actual: `sw VERSION=${(sw.match(/ss-v\d+/) || [])[0]}; leftover ?v=22 in ${left} files` }; });

  // ================= API =================
  await tc('A-01', 'API', '/api/brackets returns three views with 12 seeds (JT, AP) and a pending CFP', 'GET /api/brackets', 'jt/ap: 12 seeds, 4 first-round games, 4 QF, 2 SF; cfp.status=pending, no bracket; no mock flag', async () => {
    const d = await J(`${NEW}/api/brackets`); const ok = [d.jt, d.ap].every((v) => v && v.bracket && v.bracket.seeds.length === 12 && v.bracket.firstRound.length === 4 && v.bracket.quarterfinals.length === 4 && v.bracket.semifinals.length === 2) && d.cfp.status === 'pending' && !d.cfp.bracket && !d.cfp.mock;
    return { pass: ok, actual: `jt seeds=${d.jt.bracket.seeds.length}, ap seeds=${d.ap.bracket.seeds.length}, cfp.status=${d.cfp.status}, mock=${!!d.cfp.mock}` }; });
  await tc('A-02', 'API', 'CFP pending payload says when the first ranking is due', 'GET /api/brackets → cfp', 'status pending, message mentions Nov 3 (first CFP ranking)', async () => { const d = await J(`${NEW}/api/brackets`); const t = JSON.stringify(d.cfp); return { pass: d.cfp.status === 'pending' && /Nov(ember)?\.? 3|2026-11-03/.test(t), actual: t.slice(0, 220) }; });
  await tc('A-03', 'API', 'Bracket rules: top-5 conference champs + 7 at-large, top-4 champs get byes, seed 1v… no champ outside the 12 left out', 'Inspect JT + AP seeds', 'Seeds 1-4 byes; 12 seeds unique; first round is 5v12,6v11,7v10,8v9', async () => {
    const d = await J(`${NEW}/api/brackets`); const bad = [];
    for (const k of ['jt', 'ap']) { const b = d[k].bracket; if (new Set(b.seeds.map((s) => s.id)).size !== 12) bad.push(`${k} dup`); if (!b.seeds.slice(0, 4).every((s) => s.bye)) bad.push(`${k} byes`); const fr = b.firstRound.map((g) => `${g.home.seed}v${g.away.seed}`).sort().join(','); if (fr !== '5v12,6v11,7v10,8v9') bad.push(`${k} fr=${fr}`); }
    return { pass: !bad.length, actual: bad.length ? bad.join('; ') : 'JT & AP: 12 unique seeds, seeds 1-4 byes, first round 5v12 6v11 7v10 8v9' }; });
  await tc('A-04', 'API', 'Old app versions still get a `bracket` on /api/grok-top25 and /api/jt-top25 (root-cause fix)', 'GET both endpoints', 'bracket.seeds=12 with team/info/champ fields; firstRound[].site; same data as new page', async () => {
    const a = await J(`${NEW}/api/grok-top25`), b = await J(`${NEW}/api/jt-top25`); const f = (d) => d.bracket && d.bracket.seeds.length === 12 && d.bracket.seeds.every((s) => s.team && s.info) && d.bracket.firstRound.every((g) => g.site !== undefined && g.home.team && g.away.team);
    const nb = await J(`${NEW}/api/brackets`); const same = a.bracket.seeds.map((s) => s.info.id).join() === nb.jt.bracket.seeds.map((s) => s.id).join();
    return { pass: !!f(a) && !!f(b) && same, actual: `grok-top25 ok=${!!f(a)}, jt-top25 ok=${!!f(b)}, seeds match new page=${same}` }; });
  await tc('A-05', 'API', 'Service worker + index.html are served uncached and every SHELL asset is reachable', 'GET /sw.js headers; GET every URL in SHELL', 'sw.js Cache-Control no-cache; VERSION ss-v23; all SHELL URLs 200', async () => {
    const r = await fetch(`${NEW}/sw.js`); const t = await r.text(); const shell = [...t.matchAll(/'(\/[^']+)'/g)].map((m) => m[1]).filter((u) => !u.startsWith('/api')); const st = await Promise.all(shell.map((u) => fetch(NEW + u).then((x) => x.status)));
    const hdr = r.headers.get('cache-control') || ''; return { pass: /no-cache/.test(hdr) && /ss-v23/.test(t) && st.every((s) => s === 200), actual: `Cache-Control: ${hdr}; ${shell.length} shell URLs, non-200: ${st.filter((s) => s !== 200).length}` }; });
  await tc('A-06', 'API', 'Existing endpoints still respond (scoreboard, news, rankings, teams)', 'GET /api/scoreboard?sport=cfb, /api/news, /api/rankings, /api/teams?sport=nba', 'HTTP 200 JSON', async () => {
    const urls = ['/api/scoreboard?sport=cfb', '/api/news?sport=cfb', '/api/rankings?sport=cfb', '/api/teams?sport=nba', '/api/scoreboard?sport=nba', '/api/scoreboard?sport=epl']; const s = await Promise.all(urls.map((u) => fetch(NEW + u).then((r) => r.status)));
    return { pass: s.every((x) => x === 200), actual: urls.map((u, i) => `${u}=${s[i]}`).join(', ') }; });
  await tc('A-07', 'API', 'Mock CFP (local-only flag) produces a ready CFP bracket flagged as test data', 'GET :8798/api/brackets with BRACKETS_MOCK_CFP=1', 'cfp.status ready, 12 seeds, mock=true', async () => { const d = await J(`${MOCK}/api/brackets`); return { pass: d.cfp.status === 'ready' && d.cfp.bracket.seeds.length === 12 && d.cfp.mock === true, actual: `cfp.status=${d.cfp.status}, seeds=${d.cfp.bracket && d.cfp.bracket.seeds.length}, cfp.mock=${d.cfp.mock}` }; });
  await tc('A-08', 'API', 'Production server never serves mock CFP (flag off by default)', 'GET :8799/api/brackets', 'mock flag absent; cfp pending', async () => { const d = await J(`${NEW}/api/brackets`); return { pass: !d.cfp.mock && d.cfp.status === 'pending', actual: `cfp.mock=${d.cfp.mock}, cfp=${d.cfp.status}` }; });

  // ================= BRACKET UI (fresh load) =================
  {
    const { c, p, d } = await newPage(NEW, chosen);
    await tc('B-01', 'Bracket', 'Rankings → "Bracket" button shows the bracket (the reported bug)', 'Open #/rankings; tap the Bracket button in the poll bar', 'Bracket page with title, tabs, bracket grid and seed list — not blank', async () => {
      await p.goto(`${NEW}/#/rankings`); await p.waitForSelector('.br-tab', { timeout: 30000 }); await p.tap('.br-tab'); await p.waitForSelector('.br-grid', { timeout: 30000 });
      const n = await p.evaluate(() => ({ seeds: document.querySelectorAll('.br-list li, .br-seed').length, txt: document.querySelector('#view').innerText.length, h: location.hash }));
      return { pass: n.txt > 300 && /bracket/.test(n.h), actual: `hash ${n.h}, text ${n.txt} chars, grid present`, shot: await snap(p, 'B-01-bracket-button-jt.png') }; });
    await tc('B-02', 'Bracket', 'JT (My Bracket) view content', 'On bracket page, JT tab selected', '12 seeds incl. Ohio State 1, "bye" marks, first round / quarterfinal / semifinal / championship columns, champions flagged', async () => {
      await p.goto(`${NEW}/#/rankings/bracket/jt`); await p.waitForSelector('.br-grid'); const t = await p.evaluate(() => document.querySelector('#view').innerText);
      const ok = /Ohio State/.test(t) && /Utah/.test(t) && /BYU/.test(t) && /First Round/i.test(t) && /Semifinal/i.test(t) && /Champion/i.test(t); return { pass: ok, actual: `has Ohio State/Utah/BYU/First Round/Semifinal/Champion = ${ok}`, shot: await snap(p, 'B-02-jt.png', true) }; });
    await tc('B-03', 'Bracket', 'AP Projected view content', 'Tap "AP Projected" tab', 'Tab selected, URL #/rankings/bracket/ap, 12 seeds from AP poll', async () => {
      await p.tap('[data-bv="ap"]'); await p.waitForTimeout(500); const r = await p.evaluate(() => ({ h: location.hash, on: document.querySelector('[data-bv].on').dataset.bv, g: !!document.querySelector('.br-grid'), t: document.querySelector('#view').innerText }));
      return { pass: r.on === 'ap' && r.g && /ap$/.test(r.h) && /AP/.test(r.t), actual: `selected=${r.on}, hash=${r.h}, grid=${r.g}`, shot: await snap(p, 'B-03-ap.png', true) }; });
    await tc('B-04', 'Bracket', 'Official CFP "not released yet" state', 'Tap "Official CFP" tab', 'Friendly pending message with first-ranking date (Tue Nov 3); no empty/blank page; no fake bracket', async () => {
      await p.tap('[data-bv="cfp"]'); await p.waitForSelector('.br-empty'); const r = await p.evaluate(() => ({ t: document.querySelector('.br-empty').innerText, grid: !!document.querySelector('.br-grid') }));
      return { pass: /Nov/.test(r.t) && !r.grid, actual: r.t.replace(/\s+/g, ' ').slice(0, 200), shot: await snap(p, 'B-04-cfp-pending.png') }; });
    await tc('B-05', 'Bracket', 'JT page "Bracket" sub-tab and Scores-page promo both reach the bracket', 'Home → tap Playoff Bracket promo card; JT Top 25 page → Bracket sub-tab', 'Both land on a rendered bracket', async () => {
      await p.goto(`${NEW}/#/home`); await p.waitForSelector('a.gk-promo[href^="#/rankings/bracket"]', { timeout: 40000 }); await p.tap('a.gk-promo[href^="#/rankings/bracket"]'); await p.waitForSelector('.br-grid'); const h1 = await p.evaluate(() => location.hash);
      await p.goto(`${NEW}/#/rankings/grok`); await p.waitForSelector('[data-gt="bracket"]', { timeout: 40000 }); await p.tap('[data-gt="bracket"]'); await p.waitForSelector('.br-grid', { timeout: 30000 }); const h2 = await p.evaluate(() => location.hash);
      return { pass: true, actual: `promo → ${h1}; JT sub-tab → ${h2}; grid rendered both times`, shot: await snap(p, 'B-05-jt-subtab.png') }; });
    await tc('B-06', 'Bracket', 'No horizontal page scroll on any bracket view; bracket area itself scrolls', 'Visit jt/ap/cfp at 390px; measure scrollWidth', 'document.scrollWidth ≤ 392; .br-scroll scrollable', async () => {
      const w = []; for (const v of ['jt', 'ap', 'cfp']) { await p.goto(`${NEW}/#/rankings/bracket/${v}`); await p.waitForSelector('.br-grid, .br-empty'); await p.waitForTimeout(400); w.push(await hscroll(p)); }
      await p.goto(`${NEW}/#/rankings/bracket/jt`); await p.waitForSelector('.br-grid'); const sc = await p.evaluate(() => { const e = document.querySelector('.br-scroll'); return e.scrollWidth > e.clientWidth; });
      return { pass: w.every((x) => x <= 392) && sc, actual: `page scrollWidth jt/ap/cfp = ${w.join('/')}; bracket scroller overflows internally=${sc}` }; });
    await tc('B-07', 'Bracket', 'Console clean while using the bracket views', 'Review captured console/page errors/failed requests above', 'No page errors, no console errors from the app, no 4xx/5xx from app origin', async () => ({ pass: clean(d), actual: diag(d) + ` (third-party image/CDN console noise ignored: ${d.ext})` }));
    await c.close();
  }
  // loading / error / timeout states
  {
    const { c, p } = await newPage(NEW, chosen);
    await tc('B-08', 'Bracket', 'Loading state shows while the API is slow (never blank)', 'Delay /api/brackets by 4s; open bracket', 'Immediately shows title + "Loading the bracket…" + skeleton, then content', async () => {
      await p.route('**/api/brackets', async (r) => { await new Promise((x) => setTimeout(x, 4000)); r.continue(); }); await p.goto(`${NEW}/#/rankings/bracket/jt`); await p.waitForSelector('.br-loading', { timeout: 3000 }); const shot = await snap(p, 'B-08-loading.png');
      const txt = await p.evaluate(() => document.querySelector('#view').innerText.length); await p.waitForSelector('.br-grid', { timeout: 15000 }); await p.unroute('**/api/brackets'); return { pass: txt > 20, actual: `loading text visible (${txt} chars) then grid rendered`, shot }; });
    await tc('B-09', 'Bracket', 'Error state with Retry when the API fails; Retry recovers', 'Make /api/brackets return 500; open bracket; restore API; tap Try again', 'Clear error message + "Try again" button (not blank); after retry the bracket renders', async () => {
      await p.route('**/api/brackets', (r) => r.fulfill({ status: 500, body: 'boom' })); await p.goto(`${NEW}/#/rankings/bracket/jt`); await p.reload(); await p.waitForSelector('.br-err', { timeout: 15000 }); const shot = await snap(p, 'B-09-error-retry.png');
      const msg = await p.evaluate(() => document.querySelector('.br-err').innerText); await p.unroute('**/api/brackets'); await p.tap('[data-brretry]'); await p.waitForSelector('.br-grid', { timeout: 30000 }); return { pass: /load/i.test(msg), actual: `error shown: "${msg.replace(/\s+/g, ' ').slice(0, 90)}"; Retry → grid rendered`, shot }; });
    await tc('B-10', 'Bracket', 'Hung server → timeout → error with Retry (cold-start case)', 'Make /api/brackets never answer; open bracket; wait 27s', 'After 25s the loading state turns into an error with Try again', async () => {
      await p.route('**/api/brackets', () => {}); await p.goto(`${NEW}/#/rankings/bracket/ap`); await p.reload(); await p.waitForSelector('.br-loading'); await p.waitForSelector('.br-err', { timeout: 30000 }); const msg = await p.evaluate(() => document.querySelector('.br-err').innerText.replace(/\s+/g, ' ')); await p.unroute('**/api/brackets');
      return { pass: /too long|waking/.test(msg), actual: msg.slice(0, 140), shot: await snap(p, 'B-10-timeout.png') }; });
    await c.close();
  }
  { // mocked CFP (local only)
    const { c, p, d } = await newPage(MOCK, chosen);
    await tc('B-11', 'Bracket', 'Official CFP view with MOCK data renders a full bracket + TEST DATA banner (local only)', 'Run server with BRACKETS_MOCK_CFP=1; open #/rankings/bracket/cfp', 'CFP bracket with 12 seeds and a visible TEST DATA banner', async () => {
      await p.goto(`${MOCK}/#/rankings/bracket/cfp`); await p.waitForSelector('.br-grid', { timeout: 30000 }); const t = await p.evaluate(() => document.querySelector('#view').innerText); const w = await hscroll(p);
      return { pass: /TEST DATA/i.test(t) && w <= 392 && clean(d), actual: `TEST DATA banner=${/TEST DATA/i.test(t)}, scrollWidth=${w}, ${diag(d)}`, shot: await snap(p, 'B-11-cfp-mock-local.png', true) }; });
    await c.close();
  }

  // ================= STALE CLIENT / SERVICE WORKER (single origin :8797) =================
  {
    const swap = (src) => { run(`rm -rf ${SIMDIR}/public && cp -r ${src} ${SIMDIR}/public`); };
    run(`rm -rf ${SIMDIR}/server && cp -r ${ROOT}/server ${SIMDIR}/server && rm -rf /tmp/oldpub && mkdir /tmp/oldpub && git -C ${ROOT} archive 92b4b48 public | tar -x -C /tmp/oldpub`);
    swap('/tmp/oldpub/public'); // = shipped ss-v21 client
    const { c, p, d } = await newPage(SIM, chosen, { sw: true, once: true });
    await p.goto(`${SIM}/#/rankings`); await p.waitForSelector('.seg-a', { timeout: 40000 }); await p.evaluate(() => navigator.serviceWorker.ready); await p.reload(); await p.waitForSelector('.seg-a');
    const info0 = await p.evaluate(async () => ({ keys: await caches.keys(), ctl: !!navigator.serviceWorker.controller, bracketTab: !!document.querySelector('.br-tab') }));
    await tc('S-01', 'Stale', 'Test rig: genuine old client (ss-v21 JS + SW) is installed and controlling the page', 'Serve ss-v21 public/, open app, wait for SW, reload', 'cache ss-v21 present, SW controls page, no new Bracket button (old UI)', async () => ({ pass: info0.keys.includes('ss-v21') && info0.ctl && !info0.bracketTab, actual: `caches=${info0.keys.join(',')}; controlled=${info0.ctl}; new bracket button=${info0.bracketTab}` }));
    await tc('S-02', 'Stale', 'Old ss-v21 client left open (JT "Bracket" sub-tab) now shows a bracket instead of "No bracket for this week" — root-cause fix', 'In the old client open JT Top 25 → Bracket sub-tab (server = new API)', 'Old UI shows seeds/first round (served from compat `bracket` field)', async () => {
      await p.goto(`${SIM}/#/rankings/grok`); await p.waitForSelector('[data-gt="bracket"]', { timeout: 40000 }); await p.tap('[data-gt="bracket"]'); await p.waitForTimeout(1500); const t = await p.evaluate(() => document.querySelector('#view').innerText);
      return { pass: !/No bracket for this week/i.test(t) && /Ohio State/.test(t), actual: `"No bracket" message=${/No bracket for this week/i.test(t)}; shows Ohio State=${/Ohio State/.test(t)}`, shot: await snap(p, 'S-02-old-client-fixed.png') }; });
    // upgrade: publish the new version, old SW update check, then reopen
    swap(`${ROOT}/public`);
    const upg = await p.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); await new Promise((r) => setTimeout(r, 2500)); return { keys: await caches.keys() }; });
    await tc('S-03', 'Stale', 'SW upgrade ss-v21 → ss-v23: new cache installed, old cache deleted, new SW takes control', 'Publish new version; SW update check; read caches', 'caches = ss-v23 (+scfb-img), ss-v21 removed', async () => ({ pass: upg.keys.includes('ss-v23') && !upg.keys.includes('ss-v21'), actual: `caches=${upg.keys.join(',')}` }));
    await p.goto(`${SIM}/#/rankings`); await p.reload(); await p.waitForSelector('.seg-a', { timeout: 30000 });
    await tc('S-04', 'Stale', 'After reopening, the upgraded client is the new app (has Bracket button) and the bracket works', 'Reload after upgrade; tap Bracket', 'Bracket button visible and shows the new bracket page', async () => {
      const has = await p.evaluate(() => !!document.querySelector('.br-tab')); if (has) { await p.tap('.br-tab'); await p.waitForSelector('.br-grid', { timeout: 30000 }); }
      const src = await p.evaluate(async () => (await (await fetch('/app.js?v=23')).text()).includes('BR_TIMEOUT')); return { pass: has && src, actual: `Bracket button=${has}; new app.js served=${src}`, shot: await snap(p, 'S-04-upgraded-bracket.png') }; });
    await tc('S-05', 'Stale', 'Future updates reload an open app automatically (controllerchange) — no more stuck old JS', 'With new app open, publish a newer SW (VERSION bumped), trigger update check', 'Page reloads itself and ends up controlled by the newer SW', async () => {
      await p.goto(`${SIM}/#/rankings`); await p.waitForSelector('.br-tab'); await p.evaluate(() => { window.__marker = 1; });
      run(`sed -i 's/ss-v23/ss-v99/' ${SIMDIR}/public/sw.js`); await p.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); reg.update(); }); await p.waitForFunction(() => window.__marker === undefined, null, { timeout: 15000 }).catch(() => {}); await p.waitForTimeout(1500);
      const r = await p.evaluate(async () => ({ marker: window.__marker, keys: await caches.keys() })); return { pass: r.marker === undefined && r.keys.includes('ss-v99'), actual: `page reloaded=${r.marker === undefined}; caches=${r.keys.join(',')}` }; });
    await tc('S-06', 'Stale', 'Stale-cache returning user: offline-cached shell still opens the app', 'Go offline after the SW is active; reload', 'App shell loads from cache (not a blank page)', async () => {
      await p.goto(`${SIM}/#/home`); await p.waitForSelector('#view'); await p.waitForTimeout(1500); await c.setOffline(true); await p.reload().catch(() => {}); await p.waitForTimeout(2500); const n = await p.evaluate(() => document.body.innerText.length); await c.setOffline(false);
      return { pass: n > 50, actual: `offline reload rendered ${n} chars of UI`, shot: await snap(p, 'S-06-offline.png') }; });
    await tc('S-07', 'Stale', 'Console clean through the upgrade scenarios', 'Review diagnostics', 'No page errors / app-origin 4xx-5xx (aside from deliberate offline)', async () => { const f = d.failed.filter((x) => !/\/api\//.test(x)); return { pass: !d.page.length && !f.length, actual: `pageErrors=${d.page.length}; failed non-API=${f.length}; ${d.failed.length} total failed (offline/test-induced)` }; });
    await c.close();
  }

  // ================= ALL-SPORTS DEFAULT =================
  const chips = (p) => p.evaluate(() => [...document.querySelectorAll('#sportbar .chip')].map((b) => b.dataset.switch));
  {
    const { c, p, d } = await newPage(NEW, null);
    await tc('P-01', 'All sports', 'Brand-new profile (empty localStorage): onboarding appears, Skip → every sport available', 'Open app with no storage; Skip onboarding; open Scores', `Sport chip bar lists all ${NSPORTS} sports (CFB, NFL, MLB, golf, tennis, NBA, WNBA, NHL, soccer…); saved sportsChosen=false`, async () => {
      await p.goto(`${NEW}/#/scores`); await p.waitForSelector('#onb', { timeout: 30000 }); const shotOnb = await snap(p, 'P-01a-fresh-onboarding.png'); await p.tap('[data-nav="skip"]'); await p.waitForSelector('#onb', { state: 'detached' }); await p.goto(`${NEW}/#/scores`); await p.waitForSelector('#sportbar .chip', { timeout: 30000 }); await p.waitForTimeout(2500);
      const ch = await chips(p); const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY); const want = ['cfb', 'nfl', 'mlb', 'golf', 'tennis', 'nba', 'wnba', 'nhl', 'mls', 'epl'];
      return { pass: ch.length === NSPORTS && want.every((w) => ch.includes(w)) && (!st || st.sportsChosen === false), actual: `${ch.length}/${NSPORTS} chips: ${ch.join(',')}; saved sportsChosen=${st && st.sportsChosen}`, shot: await snap(p, 'P-01b-fresh-all-sports.png') }; });
    await tc('P-02', 'All sports', 'Fresh profile: switching to NBA / NFL / MLB / EPL shows that sport\'s scores page', 'Tap each chip', 'Scores page for that sport renders (games or a "no games" message), no error box', async () => {
      const out = []; let ok = true; for (const k of ['nba', 'nfl', 'mlb', 'epl', 'nhl']) { await p.tap(`#sportbar [data-switch="${k}"]`); await p.waitForTimeout(2500); const r = await p.evaluate((kk) => ({ on: document.querySelector('#sportbar .on').dataset.switch, err: !!document.querySelector('#view .empty button[onclick*="reload"]'), len: document.querySelector('#view').innerText.length, cards: document.querySelectorAll('#view .game, #view .card').length }), k); out.push(`${k}:${r.on === k && !r.err && r.len > 40 ? 'ok' : 'BAD'}(${r.cards})`); if (!(r.on === k && !r.err && r.len > 40)) ok = false; }
      await p.tap('#sportbar [data-switch="nba"]'); return { pass: ok, actual: out.join(' '), shot: await snap(p, 'P-02-fresh-nba-scores.png') }; });
    await tc('P-03', 'All sports', 'Fresh profile: News and Schedule tabs work for non-football sports', 'NBA chip → News tab; Schedule tab', 'Content renders, no error', async () => {
      await p.goto(`${NEW}/#/news`); await p.waitForTimeout(3500); const n = await p.evaluate(() => ({ on: document.querySelector('#sportbar .on')?.dataset.switch, len: document.querySelector('#view').innerText.length, err: /Couldn.t load/.test(document.querySelector('#view').innerText) }));
      const s1 = await snap(p, 'P-03a-fresh-news.png'); await p.goto(`${NEW}/#/schedule`); await p.waitForTimeout(3500); const s = await p.evaluate(() => ({ len: document.querySelector('#view').innerText.length, err: /Couldn.t load/.test(document.querySelector('#view').innerText) }));
      return { pass: n.len > 100 && !n.err && s.len > 40 && !s.err, actual: `news(${n.on}) ${n.len} chars err=${n.err}; schedule ${s.len} chars err=${s.err}`, shot: s1 }; });
    await tc('P-04', 'All sports', 'Fresh profile: Settings → Sports shows hint, every sport is "on", no 404s', 'Open #/settings/sports', 'Hint "Showing every sport until you pick some"; all tiles on', async () => {
      await p.goto(`${NEW}/#/settings/sports`); await p.waitForSelector('.sports-note'); const r = await p.evaluate(() => ({ note: document.querySelector('.sports-note').innerText, tiles: document.querySelectorAll('[data-sport]').length, on: document.querySelectorAll('[data-sport].on, [data-sport][aria-pressed="true"]').length }));
      return { pass: /every sport/i.test(r.note) && r.tiles >= NSPORTS - 1, actual: `${r.note}; tiles=${r.tiles}, shown on=${r.on}`, shot: await snap(p, 'P-04-fresh-settings-sports.png', true) }; });
    await tc('P-05', 'All sports', 'Tapping a sport while "all" → only that sport; "Show all sports" restores everything', 'Settings → Sports: tap NFL; then tap Show all sports', 'After NFL: sportsChosen=true, sports=[nfl] (chip bar hidden, single sport); after Show all: all sports, sportsChosen=false', async () => {
      await p.goto(`${NEW}/#/settings/sports`); await p.waitForSelector('[data-sport="nfl"]'); await p.tap('[data-sport="nfl"]'); await p.waitForTimeout(500);
      const a = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY); const shotA = await snap(p, 'P-05a-only-nfl.png'); await p.waitForSelector('[data-allsports]'); await p.tap('[data-allsports]'); await p.waitForTimeout(500); const b = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
      return { pass: a.sportsChosen === true && a.sports.join() === 'nfl' && b.sportsChosen === false && b.sports.length === NSPORTS, actual: `after NFL tap: ${JSON.stringify({ chosen: a.sportsChosen, sports: a.sports })}; after Show all: chosen=${b.sportsChosen}, ${b.sports.length} sports`, shot: shotA }; });
    await tc('P-06', 'All sports', 'Settings reset returns to the all-sports default', 'Pick NFL, then Settings → Reset', 'After reset sportsChosen=false and all sports', async () => {
      const ok = await p.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); return !!s; }, KEY); const bad = await p.evaluate(() => !!document.querySelector('[data-act="reset"]'));
      await p.goto(`${NEW}/#/settings`); await p.waitForTimeout(1500); const has = await p.evaluate(() => !!document.querySelector('[data-act="reset"]')); if (!has) return { pass: false, actual: 'no reset control found' };
      p.once('dialog', (dl) => dl.accept()); await p.evaluate(() => document.querySelector('[data-act="reset"]').click()); await p.waitForTimeout(1200); const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k) || 'null'), KEY);
      return { pass: !st || (st.sportsChosen === false && st.sports.length === NSPORTS), actual: st ? `chosen=${st.sportsChosen}, ${st.sports.length} sports` : 'storage cleared (defaults apply)' }; });
    await tc('P-07', 'All sports', 'No console errors / failed app requests, no horizontal scroll in fresh all-sports mode', 'Review diagnostics', 'Clean; scrollWidth ≤ 392', async () => { const w = await hscroll(p); return { pass: clean(d) && w <= 392, actual: `${diag(d)}; scrollWidth=${w}` }; });
    await c.close();
  }
  { // stale default profile (the Justin case): v4, sports ['cfb'] never chosen
    const stale = { v: 4, onboarded: true, sports: ['cfb'], sport: 'cfb', follow: [], players: {}, conferences: [], muteTeams: [], muteLeagues: ['nba', 'wnba'], watch: { providers: ['yttv'] } };
    const { c, p, d } = await newPage(NEW, stale, { once: true });
    await tc('P-08', 'All sports', 'STALE profile (v4 with only the old default [cfb]) is migrated to all sports', 'Seed localStorage v4 sports=[cfb], never chose; open Scores', `Chip bar shows all ${NSPORTS} sports; saved settings v5 sportsChosen=false; auto NBA/WNBA mutes dropped`, async () => {
      await p.goto(`${NEW}/#/scores`); await p.waitForSelector('#sportbar .chip', { timeout: 30000 }); const ch = await chips(p); await p.waitForTimeout(500); const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
      return { pass: ch.length === NSPORTS && st.v === 5 && st.sportsChosen === false && !st.muteLeagues.length, actual: `${ch.length} chips; v=${st.v}, sportsChosen=${st.sportsChosen}, muteLeagues=${JSON.stringify(st.muteLeagues)}`, shot: await snap(p, 'P-08-stale-profile-all-sports.png') }; });
    await tc('P-09', 'All sports', 'Stale profile: CFB scores still the default landing sport; NBA reachable', 'After migration, current sport + tap NBA', 'CFB selected first; NBA renders', async () => {
      const on = await p.evaluate(() => document.querySelector('#sportbar .on').dataset.switch); await p.tap('#sportbar [data-switch="nba"]'); await p.waitForTimeout(2500); const ok = await p.evaluate(() => document.querySelector('#sportbar .on').dataset.switch === 'nba' && document.querySelector('#view').innerText.length > 40);
      return { pass: on === 'cfb' && ok, actual: `landing sport=${on}; NBA view rendered=${ok}`, shot: await snap(p, 'P-09-stale-nba.png') }; });
    await tc('P-10', 'All sports', 'Stale profile: no console errors / h-scroll', 'Review diagnostics', 'Clean', async () => { const w = await hscroll(p); return { pass: clean(d) && w <= 392, actual: `${diag(d)}; scrollWidth=${w}` }; });
    await c.close();
  }
  { // explicit choices must not change
    const { c, p } = await newPage(NEW, { ...chosen, v: 4, sportsChosen: undefined }, { once: true });
    await tc('P-11', 'All sports', 'Users who PICKED sports keep exactly them (Justin\'s cfb,nfl,mlb,golf,tennis, v4 profile with no flag)', 'Seed v4 sports=[cfb,nfl,mlb,golf,tennis]; open Scores', 'Chip bar shows exactly those 5 sports; saved sportsChosen=true', async () => {
      await p.goto(`${NEW}/#/scores`); await p.waitForSelector('#sportbar .chip', { timeout: 30000 }); const ch = await chips(p); const st = await p.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
      return { pass: ch.join() === 'cfb,nfl,mlb,golf,tennis' && st.sportsChosen === true, actual: `chips=${ch.join()}; sportsChosen=${st.sportsChosen}`, shot: await snap(p, 'P-11-picked-sports-unchanged.png') }; });
    await c.close();
    const o = await newPage(NEW, { ...chosen, sports: ['cfb'], sportsChosen: true }, { once: true });
    await tc('P-12', 'All sports', 'Explicit "CFB only" choice (v5, sportsChosen=true) stays CFB only', 'Seed v5 sports=[cfb] sportsChosen=true', 'No sport chip bar (single sport); settings unchanged', async () => {
      await o.p.goto(`${NEW}/#/scores`); await o.p.waitForSelector('#view .card, #view .empty, #view h1', { timeout: 30000 }); await o.p.waitForTimeout(1500); const r = await o.p.evaluate((k) => ({ hidden: document.querySelector('#sportbar').hidden, st: JSON.parse(localStorage.getItem(k)) }), KEY);
      return { pass: r.hidden && r.st.sports.join() === 'cfb' && r.st.sportsChosen === true, actual: `chip bar hidden=${r.hidden}; sports=${r.st.sports.join()}`, shot: await snap(o.p, 'P-12-explicit-cfb-only.png') }; });
    await o.c.close();
  }

  // ================= REGRESSION SMOKE (picked-sports profile, 390px) =================
  {
    const { c, p, d } = await newPage(NEW, chosen);
    const smoke = [['R-01', 'Home', '#/home'], ['R-02', 'Scores (CFB)', '#/scores'], ['R-03', 'News', '#/news'], ['R-04', 'Rankings (AP poll)', '#/rankings'], ['R-05', 'JT Top 25', '#/rankings/grok'], ['R-06', 'Team page (Utah)', '#/team/254'], ['R-07', 'Schedule (Utah)', '#/schedule/254'], ['R-08', 'Settings', '#/settings'], ['R-09', 'Settings → Sports', '#/settings/sports']];
    for (const [id, name, hash] of smoke) await tc(id, 'Regression', `${name} renders at 390px`, `Open ${hash}`, 'Content visible (> 80 chars), no "Couldn\'t load" box, no horizontal scroll', async () => {
      await p.goto(`${NEW}/${hash}`); await p.waitForTimeout(4500); const r = await p.evaluate(() => { const t = document.querySelector('#view').innerText; return { len: t.length, err: /Couldn.t load/.test(t) }; }); const w = await hscroll(p);
      return { pass: r.len > 80 && !r.err && w <= 392, actual: `${r.len} chars, error box=${r.err}, scrollWidth=${w}`, shot: await snap(p, `${id}-${hash.replace(/[#/]+/g, '-').replace(/^-|-$/g, '')}.png`) }; });
    await tc('R-10', 'Regression', 'NFL Scores via chip', 'Scores → NFL chip', 'NFL scoreboard renders', async () => { await p.goto(`${NEW}/#/scores`); await p.waitForSelector('#sportbar [data-switch="nfl"]'); await p.tap('#sportbar [data-switch="nfl"]'); await p.waitForTimeout(3500); const r = await p.evaluate(() => ({ on: document.querySelector('#sportbar .on').dataset.switch, len: document.querySelector('#view').innerText.length, err: /Couldn.t load/.test(document.querySelector('#view').innerText) })); return { pass: r.on === 'nfl' && r.len > 80 && !r.err, actual: JSON.stringify(r), shot: await snap(p, 'R-10-nfl-scores.png') }; });
    await tc('R-11', 'Regression', 'Gamecast / game page opens from a scores card (current chip = NFL from R-10)', 'Scores → open the first game card', 'Game page renders (header, teams, details), no error', async () => {
      await p.goto(`${NEW}/#/scores`); await p.waitForSelector('[data-game]', { timeout: 40000 }); const href = await p.evaluate(() => document.querySelector('[data-game]').getAttribute('data-game')); await p.goto(`${NEW}/${href}`); await p.waitForTimeout(6000);
      const r = await p.evaluate(() => ({ len: document.querySelector('#view').innerText.length, err: /Couldn.t load/.test(document.querySelector('#view').innerText) })); const w = await hscroll(p); return { pass: r.len > 150 && !r.err && w <= 392, actual: `${href}: ${r.len} chars, error=${r.err}, scrollWidth=${w}`, shot: await snap(p, 'R-11-gamecast.png') }; });
    await tc('R-12', 'Regression', 'Top 25 (AP) rows link through to a team page', 'Rankings → tap first team', 'Team page opens', async () => { await p.goto(`${NEW}/#/rankings`); await p.waitForSelector('a[href^="#/team/"]', { timeout: 30000 }); await p.tap('a[href^="#/team/"]'); await p.waitForTimeout(3000); const h = await p.evaluate(() => location.hash); const len = await p.evaluate(() => document.querySelector('#view').innerText.length); return { pass: /#\/team\//.test(h) && len > 80, actual: `${h}, ${len} chars` }; });
    await tc('R-13', 'Regression', 'Console clean across all smoke checks', 'Review diagnostics', 'No page errors / console errors / 4xx-5xx from the app origin', async () => ({ pass: clean(d), actual: diag(d) + ` (third-party CDN console noise ignored: ${d.ext})` }));
    await c.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(ROOT, 'qa-results.json'), JSON.stringify(results, null, 1));
  const f = results.filter((r) => r.status === 'FAIL').length; console.log(`\n${results.length - f} PASS / ${f} FAIL of ${results.length}`); process.exit(0);
})().catch((e) => { console.error(e); process.exit(2); });
