// Grok Top 25: the user's weekly Grok ranking, stored as JSON in data/grok-top25/ (see README for the schema).
// Enriches each run with ESPN team data (logo, colors, conference), live AP / Coaches / CFP ranks from ESPN,
// Enriches each run with ESPN team data. The playoff bracket is built separately in server/brackets.js.
const fs = require('fs');
const path = require('path');

const { makeResolver } = require('./teamResolve');
const DIR = path.join(__dirname, '..', 'data', 'grok-top25');

function history() {
  try { return fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort().reverse(); } catch { return []; }
}
function readRun(date) {
  const f = date ? `${date}.json` : 'latest.json';
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); } catch { return null; }
}

// Team name → ESPN team (official logo by ESPN id). Ids stored by the update script (run.teams) win; otherwise the
// shared resolver maps the name the same way the script does.
function matcher(teams, run) {
  const resolve = makeResolver(teams); const ids = (run && run.teams) || {};
  return (name) => resolve(name, ids[name] && ids[name].espnId);
}

// (The projected 12-team bracket now lives in server/brackets.js and is served by /api/brackets.)

module.exports = function makeGrok({ getTeams, getPolls }) {
  async function get(date) {
    const run = readRun(date);
    if (!run) return null;
    const [teams, polls] = await Promise.all([getTeams().then((d) => d.teams).catch(() => []), getPolls().catch(() => null)]);
    const find = matcher(teams, run);
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
      history: history(),
    };
  }
  return { get, history };
};
