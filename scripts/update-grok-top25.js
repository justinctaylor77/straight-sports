#!/usr/bin/env node
// Add a new Grok Top 25 run.
//   node scripts/update-grok-top25.js path/to/run.json
// Validates the run, computes movement vs the previous run (prev rank, move, NEW, dropped-out teams),
// then writes data/grok-top25/<date>.json and data/grok-top25/latest.json. Schema: see README.
const fs = require('fs');
const path = require('path');
const { makeResolver } = require('../server/teamResolve');

const DIR = path.join(__dirname, '..', 'data', 'grok-top25');
const die = (m) => { console.error(`update-grok-top25: ${m}`); process.exit(1); };

const file = process.argv[2];
if (!file) die('usage: node scripts/update-grok-top25.js run.json');
let run;
try { run = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { die(`cannot read ${file}: ${e.message}`); }

// ---- validate ----
if (!/^\d{4}-\d{2}-\d{2}$/.test(run.date || '')) die('"date" must be YYYY-MM-DD');
if (!run.title) die('"title" is required');
if (!Array.isArray(run.ranks) || !run.ranks.length) die('"ranks" must be a non-empty array');
const seen = new Set();
run.ranks.forEach((r, i) => {
  if (!Number.isInteger(r.rank) || r.rank < 1) die(`ranks[${i}].rank must be a positive integer`);
  if (!r.team) die(`ranks[${i}].team is required`);
  const k = r.team.toLowerCase();
  if (seen.has(k)) die(`duplicate team "${r.team}"`);
  seen.add(k);
});
run.ranks.sort((a, b) => a.rank - b.rank);

// ---- movement vs the previous run (the newest dated file older than this one) ----
fs.mkdirSync(DIR, { recursive: true });
const dated = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort();
const prevDate = dated.filter((d) => d < run.date).pop() || null;
const prev = prevDate ? JSON.parse(fs.readFileSync(path.join(DIR, `${prevDate}.json`), 'utf8')) : null;
const prevRank = new Map((prev?.ranks || []).map((r) => [r.team.toLowerCase(), r.rank]));
run.previous = prevDate;
run.ranks = run.ranks.map((r) => {
  const p = prevRank.get(r.team.toLowerCase()) ?? null;
  return { ...r, prev: p, move: prev ? (p == null ? 'new' : p - r.rank) : null };
});
run.droppedOut = prev ? prev.ranks.filter((r) => !seen.has(r.team.toLowerCase())).map((r) => ({ team: r.team, prev: r.rank })) : [];
// notes: Grok's own text, stored verbatim. If Grok gives one combined "risers/fallers + AP vs Grok"
// paragraph, put it in risersFallers and either repeat it in apVsGrok or leave apVsGrok out (the app shows one box).
const NOTE_KEYS = ['risersFallers', 'apVsGrok', 'nextWeek', 'cfpOutlook'];
const notesIn = run.notes || {};
for (const k of Object.keys(notesIn)) if (!NOTE_KEYS.includes(k)) die(`unknown notes key "${k}" (expected ${NOTE_KEYS.join(', ')})`);
for (const k of NOTE_KEYS) if (notesIn[k] != null && typeof notesIn[k] !== 'string') die(`notes.${k} must be a string or null`);
run.notes = Object.fromEntries(NOTE_KEYS.map((k) => [k, (notesIn[k] || '').trim() || null]));
if (run.notes.risersFallers && !run.notes.apVsGrok) run.notes.apVsGrok = run.notes.risersFallers;
const missing = NOTE_KEYS.filter((k) => !run.notes[k]);
if (missing.length) console.warn(`update-grok-top25: warning: notes missing ${missing.join(', ')} (the Notes tab will say "Not included")`);
run.justMissed = run.justMissed || [];
run.updatedAt = new Date().toISOString();

// ---- team → ESPN id + official logos (same resolver the server uses) ----
// Uses the server's own FBS team list (ESPN standings, normTeam logos), so ids and logos match what the app shows.
async function espnTeams() {
  const fetchJSON = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'straight-sports/1.0' } }); if (!r.ok) throw new Error(`HTTP ${r.status} for ${u}`); return r.json(); };
  const SP = require('../server/sports')({ cached: (k, t, fn) => fn(), cache: new Map(), fetchJSON });
  return (await SP.getTeams('cfb')).teams;
}
async function resolveTeams() {
  let teams;
  try { teams = await espnTeams(); } catch (e) { console.warn(`update-grok-top25: warning: couldn't load ESPN teams (${e.message}); the server will resolve names at runtime`); return; }
  const resolve = makeResolver(teams); const prevIds = run.teams || {};
  const names = [...new Set([...run.ranks.map((r) => r.team), ...run.justMissed, ...(run.apTop5 || []).map((x) => x.team)])];
  run.teams = {}; const unmatched = [];
  for (const n of names) {
    const t = resolve(n, prevIds[n] && prevIds[n].espnId);
    if (t) run.teams[n] = { espnId: t.espnId, name: t.name, logo: t.logo, logoDark: t.logoDark }; else unmatched.push(n);
  }
  console.log(`Teams → ESPN: ${names.map((n) => `${n}=${run.teams[n] ? run.teams[n].espnId : '??'}`).join(', ')}`);
  if (unmatched.length) console.warn(`update-grok-top25: WARNING: no ESPN team for ${unmatched.map((n) => `"${n}"`).join(', ')}. Add the name to IDS in server/teamResolve.js (or set "teams": {"<name>": {"espnId": "<id>"}} in the run) and re-run.`);
}

(async () => {
await resolveTeams();
const out = JSON.stringify(run, null, 2) + '\n';
fs.writeFileSync(path.join(DIR, `${run.date}.json`), out);
const newest = [...new Set([...dated, run.date])].sort().pop();
if (newest === run.date) fs.writeFileSync(path.join(DIR, 'latest.json'), out);
const moved = run.ranks.filter((r) => typeof r.move === 'number' && r.move !== 0).length;
console.log(`Wrote ${run.date}.json${newest === run.date ? ' + latest.json' : ' (older than latest; latest.json unchanged)'} — ${run.ranks.length} teams, previous run: ${prevDate || 'none'}, ${moved} moved, ${run.ranks.filter((r) => r.move === 'new').length} new, ${run.droppedOut.length} dropped out.`);
})();
