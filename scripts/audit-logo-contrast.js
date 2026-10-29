#!/usr/bin/env node
// v1.5.0 logo-contrast audit. Every team logo in every team league (teams list + current scoreboard sides, which also covers
// rankings/brackets/standings/picker/news chips, since they all reuse these team records) is decoded in headless Chrome and scored
// with the SAME code the app runs (public/logotone.js) against every surface it can sit on:
//   dark  = default dark card surface (#11151c) with the 500-dark variant,  light = white card with the normal variant,
//   team-dark = the dark team-theme surface of every team in the same league (opponents on a team page), with the 500-dark variant.
// Rule: PASS when >= 50% of silhouette-edge pixels reach 3:1 (WCAG 1.4.11). Fails get the outline fix; "after" re-scores the outline ring.
// Usage: node scripts/audit-logo-contrast.js [baseUrl] [--sheet screenshots/v22/logo-contact-sheet.png]
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const base = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:8799';
const sheetArg = process.argv.indexOf('--sheet'); const SHEET = sheetArg > 0 ? process.argv[sheetArg + 1] : 'screenshots/v22/logo-contact-sheet.png';
const ROOT = path.join(__dirname, '..');
const get = (p) => fetch(base + p).then((r) => r.json());
(async () => {
  const sports = (await get('/api/sports')).filter((s) => s.kind === 'team').map((s) => s.id);
  const leagues = {};
  for (const sp of sports) {
    const { teams = [] } = await get(`/api/teams?sport=${sp}`).catch(() => ({}));
    const sb = await get(`/api/scoreboard?sport=${sp}`).catch(() => ({ events: [] }));
    const sbt = (sb.events || []).flatMap((e) => [e.home && e.home.team, e.away && e.away.team]).filter(Boolean);
    const m = new Map(); for (const t of [...teams, ...sbt]) if (t && t.id && (t.logo || t.logoDark) && !m.has(t.id)) m.set(t.id, { id: t.id, name: t.name || t.short, logo: t.logo || '', logoDark: t.logoDark || t.logo || '', color: t.color, alt: t.alt });
    leagues[sp] = [...m.values()];
  }
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await page.goto(base + '/manifest.webmanifest');
  const res = await page.evaluate(async (leagues) => {
    const LT = await import('/logotone.js'); const TT = await import('/teamtheme.js');
    const hex = (h) => { const n = parseInt(String(h).replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const cache = new Map();
    const load = (u) => { if (!u) return Promise.resolve(null); if (cache.has(u)) return cache.get(u);
      const p = new Promise((ok) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { try { const w = im.naturalWidth, h = im.naturalHeight; const sc = Math.min(LT.N / w, LT.N / h); const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
        const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d'); g.drawImage(im, 0, 0, cw, ch); ok(LT.extract(g.getImageData(0, 0, cw, ch).data, cw, ch)); } catch (e) { ok({ err: 'tainted' }); } };
        im.onerror = () => ok({ err: 'load' }); im.src = u; setTimeout(() => ok({ err: 'timeout' }), 20000); }); cache.set(u, p); return p; };
    const out = [];
    for (const [sp, teams] of Object.entries(leagues)) {
      const surfaces = [...new Set(teams.map((t) => { const p = TT.teamPalette(t.color, t.alt, true); return p && p['--surface']; }).filter(Boolean))];
      for (let i = 0; i < teams.length; i += 24) await Promise.all(teams.slice(i, i + 24).map(async (t) => {
        const [sl, sd] = await Promise.all([load(t.logo), load(t.logoDark)]);
        const row = { sport: sp, id: t.id, name: t.name, logo: t.logo, logoDark: t.logoDark, themes: {} };
        if (!sl || sl.err || !sd || sd.err) { row.unmeasured = (sl && sl.err) || (sd && sd.err) || 'none'; out.push(row); return; }
        const one = (st, bg, label) => { const f = LT.fixFor(st, bg); return { bg: label, before: +f.before.edge.toFixed(2), pass: f.before.pass, fix: f.cls, after: f.after.pass }; };
        row.themes.dark = one(sd, hex('11151c'), '#11151c');
        row.themes.light = one(sl, [255, 255, 255], '#ffffff');
        let worst = null; for (const s of surfaces) { const r = one(sd, hex(s), s); if (!worst || r.before < worst.before) worst = r; }
        row.themes.teamDark = worst || row.themes.dark;
        out.push(row);
      }));
    }
    return out;
  }, leagues);
  // ---- table ----
  const T = {}; for (const r of res) { const L = (T[r.sport] = T[r.sport] || { logos: 0, unmeasured: 0, pass: 0, fixed: 0, failAfter: 0, dark: 0, light: 0, teamDark: 0 }); L.logos++;
    if (r.unmeasured) { L.unmeasured++; continue; } const th = Object.values(r.themes); const anyFail = th.some((x) => !x.pass); if (!anyFail) L.pass++; else L.fixed++;
    if (th.some((x) => !x.after)) L.failAfter++; for (const k of ['dark', 'light', 'teamDark']) if (!r.themes[k].pass) L[k]++; }
  const tot = Object.values(T).reduce((a, b) => { for (const k in b) a[k] = (a[k] || 0) + b[k]; return a; }, {});
  const md = ['| League | Logos | Pass in every theme | Fixed (outline in ≥1 theme) | Fail dark | Fail light | Fail team-dark | Still under 3:1 after fix | Unmeasured |', '|---|---|---|---|---|---|---|---|---|',
    ...Object.entries(T).map(([k, v]) => `| ${k} | ${v.logos} | ${v.pass} | ${v.fixed} | ${v.dark} | ${v.light} | ${v.teamDark} | ${v.failAfter} | ${v.unmeasured} |`),
    `| **Total** | **${tot.logos}** | **${tot.pass}** | **${tot.fixed}** | ${tot.dark} | ${tot.light} | ${tot.teamDark} | **${tot.failAfter}** | ${tot.unmeasured} |`].join('\n');
  fs.mkdirSync(path.join(ROOT, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'docs', 'logo-audit.json'), JSON.stringify({ generated: new Date().toISOString(), base, rule: 'PASS = >=50% of silhouette-edge pixels visible at >=3:1 vs surface (pixel itself or a logo pixel within 2px of 48; WCAG 2.x SC 1.4.11)', table: T, total: tot, logos: res }, null, 1));
  fs.writeFileSync(path.join(ROOT, 'docs', 'logo-audit.md'), `# Logo contrast audit\n\nGenerated ${new Date().toISOString()} against ${base}. Rule: a logo passes on a surface when at least 50% of its silhouette-edge pixels are visible at **3:1** against that surface — the edge pixel itself, or a logo pixel within 2px of it at 48px scale (so a thin white keyline outside a strong outline isn't counted as invisible) (WCAG 2.x SC 1.4.11, non-text contrast). Failing logos get a 1px outline in the opposite tone (light on dark surfaces, dark on light); "after" re-scores the outline ring.\n\n${md}\n\nUnmeasured = the logo host sent no CORS header or the image failed to load (left untouched in the app).\n`);
  console.log(md);
  // ---- contact sheet: worst offenders, before vs after, rendered with the app's own CSS ----
  const worst = res.filter((r) => !r.unmeasured).flatMap((r) => Object.entries(r.themes).filter(([, x]) => !x.pass).map(([k, x]) => ({ ...x, k, r }))).sort((a, b) => a.before - b.before);
  const pick = []; const seen = new Set(); for (const w of worst) { const key = w.r.id + w.k; if (seen.has(w.r.id) || pick.length >= 36) continue; seen.add(w.r.id); pick.push(w); }
  const sp = await (await browser.newContext({ serviceWorkers: 'block', deviceScaleFactor: 2, viewport: { width: 1200, height: 900 } })).newPage();
  await sp.goto(base + '/'); await sp.waitForTimeout(1500);
  await sp.evaluate((pick) => {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    document.body.innerHTML = `<div id="sheet" style="background:#222;padding:16px;width:1168px;font:13px system-ui;color:#eee"><h2 style="margin:0 0 4px">Logo contrast — worst ${pick.length} offenders, before → after</h2><p style="margin:0 0 12px;opacity:.8">Score = share of silhouette-edge pixels at ≥3:1 vs the surface (pass ≥50%). After = 1px opposite-tone outline (img.lt-lift / img.lt-sink).</p><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">${pick.map((w) => {
      const u = w.k === 'light' ? w.r.logo : w.r.logoDark;
      return `<div style="background:${w.bg};border-radius:10px;padding:8px;color:${w.k === 'light' ? '#111' : '#eee'}"><div style="font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(w.r.name)} <span style="opacity:.6">${esc(w.r.sport)}</span></div><div style="font-size:11px;opacity:.75">${esc(w.k)} ${esc(w.bg)}</div>
        <div style="display:flex;gap:14px;align-items:center;margin-top:6px"><div style="text-align:center"><img data-lt-skip crossorigin="anonymous" src="${esc(u)}" style="width:56px;height:56px;object-fit:contain"><div style="font-size:11px">before ${Math.round(w.before * 100)}%</div></div><span>→</span>
        <div style="text-align:center"><img data-lt-skip crossorigin="anonymous" class="${w.fix}" src="${esc(u)}" style="width:56px;height:56px;object-fit:contain"><div style="font-size:11px">after ${w.after ? 'pass' : 'FAIL'}</div></div></div></div>`; }).join('')}</div></div>`;
  }, pick);
  await sp.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 60000 }).catch(() => {});
  await sp.waitForTimeout(800);
  if (SHEET) { fs.mkdirSync(path.dirname(path.join(ROOT, SHEET)), { recursive: true }); await (await sp.$('#sheet')).screenshot({ path: path.join(ROOT, SHEET) }); console.log('contact sheet:', SHEET); }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
