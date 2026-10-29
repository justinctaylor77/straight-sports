// Live sync smoke test against production with ONE throwaway account. Creates via the real UI, reads back, restores on a fresh profile,
// checks the wrong-code message, then DELETEs the account via the API and confirms the code no longer restores.
// The recovery code is kept in memory only: never printed, never written to disk, blurred in screenshots.
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const BASE = 'https://straight-sports.onrender.com'; const ROOT = path.join(__dirname, '..'); const OUT = path.join(ROOT, 'screenshots', 'v21'); const KEY = 'straightcfb.settings.v1';
const R = []; let CODE = '';
const redact = (s) => String(s).split(CODE || '\u0000').join('[code]');
const ok = (id, desc, pass, actual, shot) => { R.push({ id, desc, status: pass ? 'PASS' : 'FAIL', actual: redact(actual).slice(0, 300), evidence: shot || '' }); console.log(pass ? 'PASS' : 'FAIL', id, redact(actual).slice(0, 140)); };
const api = async (m, p, o = {}) => { const r = await fetch(`${BASE}/api/sync${p}`, { method: m, headers: { 'content-type': 'application/json', ...(o.code ? { authorization: `Sync ${o.code}` } : {}), ...(o.ifMatch != null ? { 'if-match': String(o.ifMatch) } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined, signal: AbortSignal.timeout(60000) }); return { status: r.status, body: await r.json().catch(() => null) }; };
const base6 = { v: 6, onboarded: true, sportsChosen: true, sport: 'nfl', sports: ['nfl', 'mlb', 'nba'], theme: 'light', follow: ['nfl:12'], players: {}, conferences: [], muteTeams: [], muteLeagues: [], muteKeywords: [], watch: { providers: [] } };
const shot = async (p, name, blurCode) => { if (blurCode) await p.addStyleTag({ content: '[data-acct-code],#rcode{filter:blur(12px)!important}' }); await p.waitForTimeout(600); await p.screenshot({ path: path.join(OUT, name) }); return `screenshots/v21/${name}`; };
(async () => {
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctxOpts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block' };
  try {
    const cA = await br.newContext(ctxOpts); const A = await cA.newPage();
    await A.addInitScript(([k, v]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify(v)); sessionStorage.setItem('seeded', '1'); } }, [KEY, base6]);
    await A.goto(`${BASE}/#/settings`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await A.waitForSelector('#acct-card', { timeout: 20000 });
    const card0 = await A.$eval('#acct-card', (e) => e.innerText); const s1 = await shot(A, 'live-sync-account-card-390.png');
    ok('LS-01', 'Live Settings > Account card offers "Create my recovery code" (sync enabled)', /Create my recovery code/i.test(card0) && !/not available/i.test(card0), card0.replace(/\n+/g, ' / ').slice(0, 100), s1);
    await A.tap('[data-acct="create"]'); await A.waitForSelector('#sheet [data-acct-code]', { timeout: 30000 }); await A.waitForTimeout(700); CODE = (await A.textContent('[data-acct-code]')).trim();
    const shapeOk = /^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/.test(CODE); const dis0 = await A.$eval('#sheet [data-acct="done"]', (b) => b.disabled); const s2 = await shot(A, 'live-sync-code-sheet-390.png', true);
    ok('LS-02', 'Create: code sheet shows a code of the form XXXX-XXXX-XXXX once; Done is disabled until acknowledged (code blurred in the screenshot)', shapeOk && dis0, `shape ok=${shapeOk}; Done disabled=${dis0}`, s2);
    await A.check('[data-acct-ack]'); await A.tap('#sheet [data-acct="done"]'); await A.waitForTimeout(1200);
    const card1 = await A.$eval('#acct-card', (e) => e.innerText); const st = await A.evaluate(() => JSON.parse(localStorage.getItem('ss.sync.v1') || 'null'));
    ok('LS-03', 'After Done the card shows Backed up · On and the code is linked on the device', /Backed up/.test(card1) && /On/.test(card1) && st && st.code === CODE, card1.replace(/\n+/g, ' / ').slice(0, 80));
    const g1 = await api('GET', '/profile', { code: CODE });
    ok('LS-04', 'Read back (server): the backup holds the favorites and prefs', g1.status === 200 && g1.body.data && g1.body.data.theme === 'light' && (g1.body.data.sports || []).join() === 'nfl,mlb,nba' && (g1.body.data.follow || []).join() === 'nfl:12', `HTTP ${g1.status}; theme=${g1.body && g1.body.data && g1.body.data.theme}; sports=${g1.body && g1.body.data && g1.body.data.sports}; follow=${g1.body && g1.body.data && g1.body.data.follow}; rev=${g1.body && g1.body.rev}`);
    const w = await api('PUT', '/profile', { code: CODE, ifMatch: g1.body.rev, body: { data: { ...g1.body.data, theme: 'dark', follow: ['nfl:12', 'mlb:5'] } } }); const g2 = await api('GET', '/profile', { code: CODE });
    ok('LS-05', 'Write (API, If-Match): a changed theme and an added favorite are stored and read back; rev increases', w.status === 200 && g2.body.data.theme === 'dark' && g2.body.data.follow.join() === 'nfl:12,mlb:5' && g2.body.rev > g1.body.rev, `PUT ${w.status}; rev ${g1.body.rev} -> ${g2.body.rev}; theme=${g2.body.data.theme}; follow=${g2.body.data.follow}`);
    const stale = await api('PUT', '/profile', { code: CODE, ifMatch: g1.body.rev, body: { data: g1.body.data } });
    ok('LS-06', 'Stale write (old rev) is refused with 409 and returns the current data', stale.status === 409 && stale.body && stale.body.data && stale.body.data.theme === 'dark', `HTTP ${stale.status}`);
    const cB = await br.newContext(ctxOpts); const B = await cB.newPage(); await B.goto(`${BASE}/#/settings/restore`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await B.waitForTimeout(1500);
    if (await B.$('#onb')) { await B.tap('[data-nav="skip"]'); await B.waitForSelector('#onb', { state: 'detached' }); await B.waitForFunction(() => location.hash === '#/home'); await B.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await B.waitForTimeout(1500); }
    await B.goto(`${BASE}/#/settings/restore`); await B.waitForSelector('#rcode', { timeout: 15000 }); await B.fill('#rcode', CODE.replace(/-/g, '').toLowerCase()); await B.tap('[data-rform] button[type="submit"]'); await B.waitForSelector('[data-rfound]:not([hidden]) [data-rdo]', { timeout: 30000 });
    const found = await B.$eval('[data-rfound]', (e) => e.innerText); const s3 = await shot(B, 'live-sync-restore-found-390.png', true);
    await B.tap('[data-rdo="replace"]'); await B.waitForFunction(() => location.hash === '#/settings', null, { timeout: 15000 }); await B.waitForSelector('#acct-card'); await B.waitForTimeout(1200);
    const rs = await B.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY); const cardB = await B.$eval('#acct-card', (e) => e.innerText); const s4 = await shot(B, 'live-sync-restored-card-390.png');
    ok('LS-07', 'Restore on a fresh browser profile (390px): lookup shows a summary, "Use the backup" restores theme, sports and favorites, and the card shows Backed up', /Found a backup/.test(found) && rs.theme === 'dark' && rs.sports.join() === 'nfl,mlb,nba' && rs.follow.join() === 'nfl:12,mlb:5' && /Backed up/.test(cardB), `summary shown=${/Found a backup/.test(found)}; theme=${rs.theme}; sports=${rs.sports}; follow=${rs.follow}`, `${s3}, ${s4}`);
    const cC = await br.newContext(ctxOpts); const C = await cC.newPage(); await C.goto(`${BASE}/#/settings/restore`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await C.waitForTimeout(1500);
    if (await C.$('#onb')) { await C.tap('[data-nav="skip"]'); await C.waitForSelector('#onb', { state: 'detached' }); await C.waitForFunction(() => location.hash === '#/home'); await C.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await C.waitForTimeout(1500); }
    await C.goto(`${BASE}/#/settings/restore`); await C.waitForSelector('#rcode', { timeout: 15000 }); await C.fill('#rcode', '7K2M-9QXD-4TRA'); await C.tap('[data-rform] button[type="submit"]'); await C.waitForFunction(() => /No backup found/.test(document.querySelector('[data-rmsg]').textContent), null, { timeout: 30000 });
    const shown = await C.$eval('[data-rfound]', (e) => !e.hidden); const linked = await C.evaluate(() => localStorage.getItem('ss.sync.v1')); const s5 = await shot(C, 'live-sync-wrong-code-390.png');
    ok('LS-08', 'Wrong (well-formed, unknown) code shows "No backup found", links nothing', !shown && !linked, `found card shown=${shown}; linked=${!!linked}`, s5);
    const del = await api('DELETE', '/profile', { code: CODE }); const gone = await api('GET', '/profile', { code: CODE }); const look = await api('POST', '/lookup', { body: { code: CODE } });
    ok('LS-09', 'DELETE the test account: 204, then the code no longer reads (404) or looks up (404)', del.status === 204 && gone.status === 404 && look.status === 404, `DELETE ${del.status}; GET ${gone.status}; lookup ${look.status}`);
    await B.goto(`${BASE}/#/settings`); await B.waitForTimeout(500);
    const cD = await br.newContext(ctxOpts); const D = await cD.newPage(); await D.goto(`${BASE}/#/settings/restore`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {}); await D.waitForTimeout(1500);
    if (await D.$('#onb')) { await D.tap('[data-nav="skip"]'); await D.waitForSelector('#onb', { state: 'detached' }); await D.waitForFunction(() => location.hash === '#/home'); await D.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {}); await D.waitForTimeout(1500); }
    await D.goto(`${BASE}/#/settings/restore`); await D.waitForSelector('#rcode', { timeout: 15000 }); await D.fill('#rcode', CODE.replace(/-/g, '').toLowerCase()); await D.tap('[data-rform] button[type="submit"]'); await D.waitForFunction(() => /No backup found/.test(document.querySelector('[data-rmsg]').textContent), null, { timeout: 30000 });
    ok('LS-10', 'In the app, the deleted code now gives "No backup found" (cannot restore)', !(await D.$eval('[data-rfound]', (e) => !e.hidden)), 'No backup found shown');
  } catch (e) { ok('LS-ERR', 'Script error', false, e.message); }
  finally {
    if (CODE) { const d2 = await api('DELETE', '/profile', { code: CODE }).catch(() => ({ status: 'err' })); const g = await api('GET', '/profile', { code: CODE }).catch(() => ({ status: 'err' })); ok('LS-11', 'Cleanup: no test account remains (GET after delete is 404)', g.status === 404, `final DELETE ${d2.status}; GET ${g.status}`); }
    await br.close(); CODE = '';
    fs.writeFileSync(path.join(ROOT, 'live-sync-smoke-v21.json'), JSON.stringify(R, null, 1));
    console.log(`${R.filter((x) => x.status === 'PASS').length} PASS / ${R.filter((x) => x.status === 'FAIL').length} FAIL of ${R.length}`);
  }
})();
