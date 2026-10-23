#!/usr/bin/env node
// Audit team logos: every team in every team sport (teams list + current scoreboards + JT Top 25) must have an ESPN logo
// whose URL matches its ESPN id and loads (HTTP 200). Usage: node scripts/audit-logos.js [baseUrl]
const base = process.argv[2] || 'http://localhost:8787';
const get = (p) => fetch(base + p).then((r) => r.json());
const seen = new Map(); const problems = [];
async function head(u) { if (seen.has(u)) return seen.get(u); const one = () => fetch(u, { method: 'HEAD' }).then((r) => r.status).catch(() => 0);
  const p = (async () => { for (let i = 0; i < 4; i++) { const s = await one(); if (s) return s; await new Promise((r) => setTimeout(r, 400 * (i + 1))); } return 0; })(); seen.set(u, p); return p; }
const idIn = (url, id) => new RegExp(`/${id}\\.png|[?&]i=.*?/${id}\\.png|/${id}(?:[./?]|$)`).test(url || '');
async function checkTeam(t, where) {
  if (!t || /^TBD/i.test(t.name || '')) return;
  const id = t.espnId || String(t.id || '').replace(/^.*:/, '');
  for (const k of ['logo', 'logoDark']) {
    const u = t[k];
    if (!u) { problems.push(`${where}: ${t.name || t.short} (${t.id}) has no ${k}`); continue; }
    if (/teamlogos/.test(u) && !/^cbase/.test(where) && !idIn(u, id) && !idIn(u, String(t.abbr || '').toLowerCase())) problems.push(`${where}: ${t.name} (${t.id}) ${k} doesn't match id: ${u}`);
    const s = await head(u); if (s !== 200) problems.push(`${where}: ${t.name} (${t.id}) ${k} HTTP ${s}: ${u}`);
  }
}
(async () => {
  const sports = (await get('/api/sports')).filter((s) => s.kind === 'team').map((s) => s.id);
  let n = 0;
  for (const sp of sports) {
    const { teams = [] } = await get(`/api/teams?sport=${sp}`).catch(() => ({}));
    const sb = await get(`/api/scoreboard?sport=${sp}`).catch(() => ({ events: [] }));
    const sbt = (sb.events || []).flatMap((e) => [e.home && e.home.team, e.away && e.away.team]).filter(Boolean);
    const all = [...teams.map((t) => [t, `${sp} teams`]), ...sbt.map((t) => [t, `${sp} scoreboard`])];
    for (let i = 0; i < all.length; i += 12) await Promise.all(all.slice(i, i + 12).map(([t, w]) => checkTeam(t, w)));
    n += all.length; console.log(`${sp}: ${teams.length} teams, ${sbt.length} scoreboard sides`);
  }
  const jt = await get('/api/grok-top25').catch(() => null);
  if (jt) {
    const rows = [...jt.ranks.map((r) => [r.team, r.info]), ...jt.justMissed.map((x) => [x.team, x.info]), ...jt.apTop5.map((x) => [x.team, x.info])];
    for (const [name, info] of rows) { if (!info) problems.push(`JT Top 25: "${name}" not matched to an ESPN team`); else await checkTeam({ ...info, espnId: String(info.id).replace(/^.*:/, '') }, `JT "${name}"`); }
    console.log(`JT Top 25: ${rows.length} rows → ${rows.map(([n, i]) => `${n}=${i ? i.id : '??'}`).join(', ')}`);
  }
  console.log(`checked ${n} team entries, ${seen.size} unique logo URLs`);
  const fails = problems.filter((p) => !/has no logo/.test(p)); const nologo = problems.filter((p) => /has no logo$/.test(p)).map((p) => p.replace(/ has no logo$/, ''));
  if (nologo.length) console.log(`No ESPN logo exists (${nologo.length}): ${nologo.join('; ')}`);
  console.log(fails.length ? `PROBLEMS (${fails.length}):\n${[...new Set(fails)].join('\n')}` : 'All logos OK');
})();
