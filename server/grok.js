// Grok Top 25: the user's weekly Grok ranking, stored as JSON in data/grok-top25/ (see README for the schema).
// Enriches each run with ESPN team data (logo, colors, conference), live AP / Coaches / CFP ranks from ESPN,
// and a projected 12-team CFP bracket built from Grok's order.
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'data', 'grok-top25');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ALIAS = { miamifl: 'miami', olemississippi: 'olemiss', boisest: 'boisestate', ohiost: 'ohiostate', byucougars: 'byu' };

function history() {
  try { return fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse(); } catch { return []; }
}
function readRun(date) {
  const f = date ? `${date}.json` : 'latest.json';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; }
}

function matcher(teams) {
  const by = new Map();
  for (const t of teams) for (const k of [t.location, t.short, t.name, t.abbr]) { const n = norm(k); if (n && !by.has(n)) by.set(n, t); }
  return (name) => { const n = norm(name); return by.get(ALIAS[n] || n) || null; };
}

// Real 12-team CFP format: the five highest-ranked conference champions get automatic bids, the next seven highest-ranked
// teams are at-large. The four highest-ranked conference champions get seeds 1-4 (first-round byes); the other eight are
// seeded 5-12 by rank, and in the first round the higher seed hosts (5v12, 6v11, 7v10, 8v9).
function bracket(rows) {
  const champs = [];
  const seenConf = new Set();
  for (const r of rows) {
    const c = r.conference;
    if (!c || /independent/i.test(c) || seenConf.has(c)) continue;
    seenConf.add(c); champs.push(r);
  }
  const auto = champs.slice(0, 5);
  const field = [...auto];
  for (const r of rows) { if (field.length >= 12) break; if (!field.includes(r)) field.push(r); }
  const byes = auto.slice().sort((a, b) => a.rank - b.rank).slice(0, 4);
  const rest = field.filter((r) => !byes.includes(r)).sort((a, b) => a.rank - b.rank);
  const seeds = [...byes, ...rest].map((r, i) => ({ seed: i + 1, rank: r.rank, team: r.team, info: r.info, conference: r.conference, champ: auto.includes(r), bye: i < 4, autoBid: auto.includes(r) }));
  const S = (n) => seeds[n - 1];
  const first = [[5, 12], [8, 9], [6, 11], [7, 10]].map(([h, a]) => ({ id: `R1-${h}v${a}`, home: S(h), away: S(a), site: `Campus of No. ${h} seed` }));
  const quarters = [[1, '8v9'], [4, '5v12'], [2, '7v10'], [3, '6v11']].map(([s, m]) => ({ id: `QF-${s}`, top: S(s), from: `R1-${m}` }));
  return {
    projected: true,
    champions: champs.map((r) => ({ conference: r.conference, team: r.team, rank: r.rank, info: r.info, autoBid: auto.includes(r) })),
    seeds, firstRound: first, quarterfinals: quarters,
    semifinals: [{ id: 'SF-1', from: ['QF-1', 'QF-4'] }, { id: 'SF-2', from: ['QF-2', 'QF-3'] }],
    note: 'Projected from Grok’s order: each conference’s highest Grok-ranked team is its projected champion. Only teams in Grok’s Top 25 are considered.',
  };
}

module.exports = function makeGrok({ getTeams, getPolls }) {
  async function get(date) {
    const run = readRun(date);
    if (!run) return null;
    const [teams, polls] = await Promise.all([getTeams().then((d) => d.teams).catch(() => []), getPolls().catch(() => null)]);
    const find = matcher(teams);
    const pollMap = (id) => { const p = polls?.polls?.find((x) => x.id === id); return p ? { p, rank: new Map(p.ranks.map((r) => [String(r.team.id), r.rank])) } : null; };
    const ap = pollMap('ap'); const coaches = pollMap('usa'); const cfp = pollMap('cfp');
    const info = (t) => (t ? { id: t.id, name: t.name, short: t.short, abbr: t.abbr, color: t.color, alt: t.alt, logo: t.logo, logoDark: t.logoDark, conference: t.conference } : null);
    const rows = run.ranks.map((r) => {
      const t = find(r.team);
      return { ...r, info: info(t), conference: t?.conference || null,
        live: { ap: t && ap ? ap.rank.get(String(t.id)) ?? null : null, coaches: t && coaches ? coaches.rank.get(String(t.id)) ?? null : null, cfp: t && cfp ? cfp.rank.get(String(t.id)) ?? null : null } };
    });
    const meta = (x) => (x ? { name: x.p.name, headline: x.p.headline, date: x.p.date } : null);
    return {
      ...run,
      ranks: rows,
      justMissed: (run.justMissed || []).map((n) => ({ team: n, info: info(find(n)) })),
      apTop5: (run.apTop5 || []).map((x) => ({ ...x, info: info(find(x.team)) })),
      livePolls: { source: 'ESPN rankings API (live)', ap: meta(ap), coaches: meta(coaches), cfp: meta(cfp), cfpReleased: !!cfp },
      bracket: bracket(rows),
      history: history(),
    };
  }
  return { get, history };
};
module.exports.bracket = bracket;
