// Builds the static mock pages for PROPOSAL-account-sync.md (docs/mocks/account-*.html) and renders them to screenshots/v19/mock-account-*.png at 390px.
// The mocks reuse the real styles.css and the real Settings markup, with the proposed Account UI swapped in. Nothing here ships in the app.
// Usage: node scripts/make-account-mocks.js   (needs a dev server: PORT=8801 node server/index.js)
const { chromium } = require('playwright-core'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..'); const BASE = process.env.BASE || 'http://localhost:8801';
const OUT = path.join(ROOT, 'screenshots', 'v19'); const DOCS = path.join(ROOT, 'docs', 'mocks'); fs.mkdirSync(OUT, { recursive: true }); fs.mkdirSync(DOCS, { recursive: true });
const ic = (c, d) => `<span class="ic" style="--c:${c}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</svg></span>`;
const KEYIC = ic('var(--usa-blue-m)', '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>');
const CLOUD = ic('var(--usa-blue-m)', '<path d="M7 18a5 5 0 1 1 1-9.9A6 6 0 0 1 19 11a3.5 3.5 0 0 1-1 7z"/>');
const CODE = '7K2M-9QXD-4TRA'; // example only; real codes are random
const rest = (hint) => `<div class="group-lbl">Your feed</div><div class="list card"><a class="row" href="#"><span class="rt"><b>Sports</b><small>NFL, MLB, NBA</small></span><span class="chev">›</span></a><a class="row" href="#"><span class="rt"><b>Teams &amp; players</b><small>Utah Jazz, Boston Red Sox +2</small></span><span class="chev">›</span></a></div>${hint || ''}`;
const signedOut = `<div class="lt"><h1>Settings</h1><p class="sub">Saved on this device only</p></div>
<div class="group-lbl">Account · optional</div><div class="list card">
 <div class="row" style="align-items:flex-start;border-bottom:0">${CLOUD}<span class="rt"><b>Keep my favorites if I clear my browser</b><small style="white-space:normal;line-height:1.35">Get a private recovery code. Type it on any phone or computer to bring back your teams, sports and mutes. No email, no password.</small></span></div>
 <div style="padding:0 14px 14px;display:grid;gap:10px"><button class="btn primary xl">Create my recovery code</button><button class="btn xl" style="min-height:46px;font-weight:550">I already have a code</button></div></div>
<p class="faint small" style="margin:8px 4px 0">We store only your picks (teams, sports, mutes, settings). Nothing else, no tracking.</p>${rest()}`;
const signedIn = `<div class="lt"><h1>Settings</h1><p class="sub">Backed up with your recovery code</p></div>
<div class="group-lbl">Account</div><div class="list card">
 <div class="row" style="border-bottom:1px solid var(--border)">${CLOUD}<span class="rt"><b>Backed up</b><small>Saved today 11:42 AM MT</small></span><span class="small" style="color:#2fd17a;font-weight:650">● On</span></div>
 <a class="row" href="#">${KEYIC}<span class="rt"><b>Show my recovery code</b><small>Reveal it to copy or write down</small></span><span class="chev">›</span></a>
 <a class="row" href="#">${ic('var(--usa-red-b)', '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01"/>')}<span class="rt"><b>Use on another device</b><small>Scan a QR code or share a link</small></span><span class="chev">›</span></a>
 <a class="row" href="#">${ic('var(--usa-blue-m)', '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>')}<span class="rt"><b>Sync now</b><small>Changes also save automatically</small></span><span class="chev">›</span></a>
 <button class="row danger" style="border-bottom:0"><span class="rt"><b>Turn off &amp; delete my backup</b><small>Removes it from our server. This device keeps its settings.</small></span></button></div>${rest()}`;
const sheet = (title, sub, body) => `<div class="sheet-bg" data-close></div><div class="sheet" role="dialog" aria-modal="true"><div class="grab"><span></span></div><button class="sheet-x" aria-label="Close">✕</button><div class="sheet-body"><span class="story-t">${title}</span><p class="story-s">${sub}</p>${body}</div></div>`;
const saveCode = sheet('Save your recovery code', 'This is the only way to get your favorites back after clearing your browser or switching phones.', `
 <div class="card" style="padding:18px 14px;text-align:center;background:var(--surface-2)"><div class="faint small" style="text-transform:uppercase;letter-spacing:.08em">Your code (example)</div><div style="font:700 30px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;margin-top:6px">${CODE}</div></div>
 <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px"><button class="btn" style="min-height:46px">Copy</button><button class="btn" style="min-height:46px">Save as .txt</button></div>
 <div class="why"><b>There is no “forgot my code.”</b> We don’t have your email or any way to look you up, so we can’t send it again. Put it in a password manager or Notes.</div>
 <label class="row" style="margin-top:12px;border:1px solid var(--border);border-radius:12px"><span class="rt"><b>I saved my code somewhere safe</b></span><span class="switch"><input type="checkbox" checked></span></label>
 <button class="btn primary xl" style="margin-top:12px">Done</button>`);
const restore = `<div class="lt"><h1>Restore</h1><p class="sub">Bring your picks back from a recovery code</p></div>
<div class="group-lbl">Your recovery code</div>
<div class="card" style="padding:14px"><input class="search" style="width:100%;font:650 24px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.06em;text-align:center;text-transform:uppercase" value="${CODE}" aria-label="Recovery code"><p class="faint small" style="margin:8px 2px 0;text-align:center">12 letters and numbers. Dashes and spaces are optional.</p><button class="btn primary xl" style="margin-top:12px">Look up my backup</button></div>
<div class="group-lbl">Found a backup</div>
<div class="list card"><div class="row" style="border-bottom:1px solid var(--border)">${CLOUD}<span class="rt"><b>Saved Oct 20, 2026 · 6:14 PM MT</b><small>5 sports · 4 teams · 2 players · 3 mutes</small></span></div>
<div style="padding:14px;display:grid;gap:10px"><button class="btn primary xl">Use the backup on this device</button><button class="btn xl" style="min-height:46px;font-weight:550">Merge with what’s on this device</button></div></div>
<p class="faint small" style="margin:8px 4px 0">“Use the backup” replaces this device’s picks. “Merge” keeps both lists of teams and mutes.</p>`;
const emailLater = sheet('Add an email (optional)', 'A safety net: if you ever lose your code, we can email you a one-time link to get back in. We use your email for nothing else.', `
 <input class="search" style="width:100%" placeholder="you@example.com" aria-label="Email"><button class="btn primary xl" style="margin-top:12px">Send me a verification link</button>
 <div class="why">Not needed to use the backup. Needs a sending domain and an email service (see proposal, Option A).</div>`);
const pages = [
  ['account-signed-out', 'Settings', signedOut], ['account-signed-in', 'Settings', signedIn], ['account-save-code', 'Settings', signedOut, saveCode],
  ['account-restore', 'Restore', restore], ['account-email-later', 'Settings', signedIn, emailLater]];
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', serviceWorkers: 'block' });
  for (const [name, title, html, sh] of pages) {
    const p = await ctx.newPage();
    await p.addInitScript(() => localStorage.setItem('straightcfb.settings.v1', JSON.stringify({ v: 6, onboarded: true, sportsChosen: true, sports: ['nfl', 'mlb', 'nba'], sport: 'nfl' })));
    await p.goto(`${BASE}/#/settings`); await p.waitForTimeout(1500);
    await p.evaluate(([title, html, sh]) => {
      document.querySelector('#ab-title').textContent = title; const v = document.querySelector('#view'); v.innerHTML = html;
      document.querySelector('#toast')?.remove();
      if (sh) { const d = document.createElement('div'); d.id = 'sheet'; d.className = 'open'; d.innerHTML = sh; document.body.appendChild(d); }
      document.querySelectorAll('script').forEach((s) => s.remove()); document.body.classList.add('mock');
    }, [title, html, sh]);
    let doc = '<!doctype html>\n' + await p.evaluate(() => document.documentElement.outerHTML);
    doc = doc.replace(/(href|src|srcset)="\/(?!\/)/g, '$1="../../public/').replace(/ \/icons\//g, ' ../../public/icons/').replace(/<link rel="manifest"[^>]*>/, '').replace(/<title>[^<]*<\/title>/, `<title>MOCK: ${name} (proposal only, not shipped)</title>`);
    fs.writeFileSync(path.join(DOCS, `${name}.html`), doc); await p.close();
    // render the saved static file itself
    const q = await ctx.newPage(); await q.goto('file://' + path.join(DOCS, `${name}.html`)); await q.waitForTimeout(900);
    await q.screenshot({ path: path.join(OUT, `mock-${name}.png`) }); fs.copyFileSync(path.join(OUT, `mock-${name}.png`), path.join(DOCS, `${name}.png`)); await q.close(); console.log('mock', name);
  }
  await browser.close();
})();
