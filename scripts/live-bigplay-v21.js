#!/usr/bin/env node
// v1.4.0 (A) live smoke: per sport, take a live game if one exists, else the most recent final from the current feed, call /api/game and check big[]
// is well formed (id, tier, headline), every big id is a real play, and never invented. Tennis/MMA/racing have no play data -> PASS with no big plays.
// Usage: BASE=http://localhost:8801 node scripts/live-bigplay-v21.js [out.json]
const fs = require('fs');
const BASE = (process.env.BASE || 'http://localhost:8801').replace(/\/$/, '');
const SPORTS = ['nfl', 'cfb', 'mlb', 'nba', 'wnba', 'nhl', 'mls', 'epl', 'nwsl', 'laliga', 'bund', 'seriea', 'ligue1', 'ucl', 'ligamx', 'cbase', 'mcbb', 'wcbb', 'golf', 'tennis', 'ufc', 'f1', 'nascar', 'indy'];
const get = async (p) => { const r = await fetch(BASE + p, { headers: { accept: 'application/json' } }); if (!r.ok) throw new Error(`${p} -> ${r.status}`); return r.json(); };
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;
function playsOf(d) {
  if (d.kind === 'football') return (d.drives || []).flatMap((x) => x.plays || []);
  if (d.kind === 'baseball') return (d.plays || []).flatMap((x) => x.items || []);
  if (d.kind === 'golf') return d.story || [];
  if (d.kind === 'tennis') return d.story ? [d.story] : [];
  if (d.kind === 'event') return (d.comps || []).map((c) => c.story).filter(Boolean);
  return d.plays || [];
}
const ymd = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
const finalOf = (ev) => ev.find((x) => x.state === 'in') || ev.filter((x) => x.state === 'post').sort((a, c) => Date.parse(c.date) - Date.parse(a.date))[0];
const lab = (e) => `${(e.away && e.away.team && e.away.team.abbr) || ''} @ ${(e.home && e.home.team && e.home.team.abbr) || ''}${e.note ? ` (${e.note})` : ''}`;
async function pick(sp) {
  let b = await get(`/api/scoreboard?sport=${sp}`);
  if (sp === 'golf' && !(b.tournaments || []).some((t) => t.state !== 'pre')) {
    const past = (b.schedule || []).filter((x) => Date.parse(x.end) < Date.now()).slice(-1)[0];
    if (past) return { id: `${past.league}-${past.id}`, state: 'post', label: `${past.name} (last completed ${past.league.toUpperCase()} event)`, date: past.start };
  }
  if (!['golf', 'tennis', 'ufc', 'f1', 'nascar', 'indy'].includes(sp) && !finalOf(b.events || [])) {
    if (sp === 'nfl' || sp === 'cfb') { const wk = (b.week || 1) - 1; const b2 = await get(`/api/scoreboard?sport=${sp}&week=${wk}`); const e = finalOf(b2.events || []); if (e) return { id: e.id, state: e.state, label: lab(e) + ` [week ${wk}]`, date: e.date }; }
    else for (let i = 1; i <= 14; i++) { const b2 = await get(`/api/scoreboard?sport=${sp}&dates=${ymd(new Date(Date.now() - i * 864e5))}`).catch(() => null); const e = b2 && finalOf(b2.events || []); if (e) return { id: e.id, state: e.state, label: lab(e), date: e.date }; }
  }
  if (sp === 'golf') { const t = (b.tournaments || []).find((x) => x.state === 'in') || (b.tournaments || []).filter((x) => x.state === 'post').sort((a, c) => Date.parse(c.date) - Date.parse(a.date))[0]; return t && { id: t.id, state: t.state, label: t.name, date: t.date }; }
  if (sp === 'tennis') { const ms = (b.tournaments || []).flatMap((t) => t.matches.map((m) => ({ ...m, tname: t.name }))); const m = ms.find((x) => x.state === 'in') || ms.filter((x) => x.state === 'post').sort((a, c) => Date.parse(c.date) - Date.parse(a.date))[0]; return m && { id: m.id, state: m.state, label: `${m.players.map((p) => p.name).join(' v ')} (${m.tname})`, date: m.date }; }
  if (['ufc', 'f1', 'nascar', 'indy'].includes(sp)) { const e = (b.events || []).find((x) => x.state === 'in') || (b.events || []).filter((x) => x.state === 'post').sort((a, c) => Date.parse(c.date) - Date.parse(a.date))[0]; return e && { id: e.id, state: e.state, label: e.name, date: e.date }; }
  const ev = b.events || [];
  const e = ev.find((x) => x.state === 'in') || ev.filter((x) => x.state === 'post').sort((a, c) => Date.parse(c.date) - Date.parse(a.date))[0];
  return e && { id: e.id, state: e.state, label: lab(e), date: e.date };
}
(async () => {
  const out = []; let bad = 0;
  for (const sp of SPORTS) {
    const row = { sport: sp };
    try {
      const g = await pick(sp);
      if (!g) { row.status = 'NO-GAME'; row.note = 'nothing live or final in the current feed (off-season / between events)'; out.push(row); console.log(sp.padEnd(7), 'NO-GAME'); continue; }
      Object.assign(row, { game: g.id, state: g.state, label: g.label, date: g.date });
      const d = await get(`/api/game/${sp}/${encodeURIComponent(g.id)}`);
      const big = Array.isArray(d.big) ? d.big : (d.kind === 'golf' ? [] : null);
      const bad1 = (big || []).filter((x) => !(x && x.id != null && x.bp && /^(big|huge)$/.test(x.bp.t) && x.bp.k && x.bp.h));
      const ids = new Set(); (function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.id != null && o.bp) ids.add(String(o.id)); for (const [k, v] of Object.entries(o)) if (k !== 'big') walk(v); } })(d);
      const orphan = d.kind === 'golf' ? 0 : (big || []).filter((x) => !ids.has(String(x.id))).length;
      const noBigFam = ['tennis', 'event'].includes(d.kind);
      row.kind = d.kind; row.big = big ? big.length : 0; row.huge = (big || []).filter((x) => x.bp && x.bp.t === 'huge').length; row.malformed = bad1.length; row.orphans = orphan;
      row.sample = (big || []).slice(-3).map((x) => `${x.bp.t} ${x.bp.k}: ${x.bp.h}${x.bp.s ? ' · ' + x.bp.s : ''} (${x.when || ''})`);
      row.status = bad1.length || orphan ? 'FAIL' : (noBigFam || big !== null) ? 'PASS' : 'FAIL';
      if (row.status === 'FAIL') bad++;
    } catch (e) { row.status = 'ERROR'; row.note = e.message; bad++; }
    out.push(row);
    console.log(sp.padEnd(7), row.status.padEnd(9), row.kind || '', row.state || '', `big=${row.big ?? '-'} huge=${row.huge ?? '-'} malformed=${row.malformed ?? '-'} orphans=${row.orphans ?? '-'}`, row.label || '', row.note || '');
  }
  const file = process.argv[2] || 'live-bigplay-v21.json';
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), base: BASE, results: out }, null, 1));
  process.exit(bad ? 1 : 0);
})();
