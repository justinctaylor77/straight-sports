// 12-team College Football Playoff brackets from three rankings: the JT Top 25, the AP Top 25 (ESPN) and the
// committee's official CFP Top 25 (ESPN, once published). Nothing here is stored or invented: every field comes from
// the ranking it is built from or from ESPN's team list.
//
// RULES (2026-27 season, per collegefootballplayoff.com and NCAA.com):
//  - Automatic bids: the ACC, Big 12, Big Ten and SEC champions; the highest-ranked team from the American, C-USA, MAC,
//    Mountain West, Pac-12 or Sun Belt (champion or not); Notre Dame if it is ranked in the top 12.
//  - The remaining spots go to the highest-ranked teams until there are 12.
//  - Seeds are the committee ranking order (an automatic qualifier ranked outside the top 12 takes the lowest seeds).
//    Seeds 1-4 get first-round byes (no longer reserved for conference champions, as of 2025).
//  - First round: 5v12, 6v11, 7v10, 8v9 (higher seed hosts). Quarterfinals: 1 v 8/9, 2 v 7/10, 3 v 6/11, 4 v 5/12.
const P4 = ['ACC', 'Big 12', 'Big Ten', 'SEC'];
const G6 = ['American', 'C-USA', 'MAC', 'Mountain West', 'Pac-12', 'Sun Belt'];
const SPOTLIGHT = { '254': 'Utah', '252': 'BYU' };

// Committee ranking release dates, as published by the CFP (collegefootballplayoff.com/news/2026/8/6/sc-aug-2627),
// all on ESPN. ESPN's own feed does not list future dates.
const CFP_SCHEDULE = {
  source: 'College Football Playoff, 2026-27 rankings schedule',
  url: 'https://collegefootballplayoff.com/news/2026/8/6/sc-aug-2627',
  dates: [
    { date: '2026-11-03', time: '7-8 p.m. ET', note: 'First CFP Top 25 of 2026' },
    { date: '2026-11-10', time: '9-9:30 p.m. ET' },
    { date: '2026-11-17', time: '9-9:30 p.m. ET' },
    { date: '2026-11-24', time: '7:30-8 p.m. ET' },
    { date: '2026-12-01', time: '7-7:30 p.m. ET' },
    { date: '2026-12-06', time: 'noon-3 p.m. ET', note: 'Selection Day: final rankings and the official 12-team bracket' },
  ],
};

function fieldFrom(rows) {
  const champs = []; const have = new Set();
  for (const r of rows) if (P4.includes(r.conference) && !have.has(r.conference)) { have.add(r.conference); champs.push(r); }
  const g6 = rows.find((r) => G6.includes(r.conference)) || null;
  const nd = rows.find((r) => r.id === '87' && r.order <= 12) || null;
  const tag = new Map();
  champs.forEach((r) => tag.set(r, 'champ'));
  if (g6) tag.set(g6, 'g6');
  if (nd && !tag.has(nd)) tag.set(nd, 'nd');
  const field = [...tag.keys()];
  for (const r of rows) { if (field.length >= 12) break; if (!tag.has(r)) { tag.set(r, 'atlarge'); field.push(r); } }
  field.sort((a, b) => a.order - b.order);
  const missing = P4.filter((c) => !have.has(c));
  return { field, tag, champs, g6, nd, missing };
}

const tagText = (t, r) => ({ champ: `${r.conference} champion (proj.)`, g6: 'Top Group of 6 (auto bid)', nd: 'Notre Dame (auto bid, top 12)', atlarge: 'At-large' }[t]);

function buildBracket(rows) {
  const { field, tag, champs, g6, missing } = fieldFrom(rows);
  const seeds = field.slice(0, 12).map((r, i) => ({
    seed: i + 1, rank: r.rank, id: r.id, name: r.name, short: r.short, abbr: r.abbr, color: r.color, logo: r.logo, logoDark: r.logoDark,
    conference: r.conference, record: r.record || null, type: tag.get(r), label: tagText(tag.get(r), r), bye: i < 4,
    spotlight: SPOTLIGHT[r.id] || null,
  }));
  const S = (n) => seeds[n - 1] || null;
  const pair = (h, a) => ({ id: `R1-${h}v${a}`, home: S(h), away: S(a), host: S(h) ? `Campus of No. ${h} seed` : null });
  const firstRound = [pair(8, 9), pair(5, 12), pair(6, 11), pair(7, 10)];
  const quarterfinals = [[1, '8v9'], [4, '5v12'], [3, '6v11'], [2, '7v10']].map(([s, m]) => ({ id: `QF-${s}`, top: S(s), from: `R1-${m}` }));
  const inField = new Set(field);
  const out = rows.filter((r) => !inField.has(r)).slice(0, 4).map((r) => ({
    rank: r.rank, id: r.id, short: r.short, logo: r.logo, logoDark: r.logoDark, color: r.color, record: r.record || null, conference: r.conference,
    reason: r.order <= 12 ? 'Ranked in the top 12 but bumped by an automatic bid' : 'Next team out',
    spotlight: SPOTLIGHT[r.id] || null,
  }));
  const spot = {};
  for (const [id, nm] of Object.entries(SPOTLIGHT)) {
    const s = seeds.find((x) => x.id === id); const r = rows.find((x) => x.id === id);
    spot[nm] = s ? { inField: true, seed: s.seed, rank: s.rank, bye: s.bye, label: s.label } : { inField: false, rank: r ? r.rank : null };
  }
  return {
    seeds, firstRound, quarterfinals,
    semifinals: [{ id: 'SF-1', from: ['QF-1', 'QF-4'] }, { id: 'SF-2', from: ['QF-3', 'QF-2'] }],
    final: { id: 'F', from: ['SF-1', 'SF-2'] },
    champions: champs.map((r) => ({ conference: r.conference, short: r.short, id: r.id, rank: r.rank })),
    topG6: g6 ? { conference: g6.conference, short: g6.short, id: g6.id, rank: g6.rank } : null,
    missingChampions: missing,
    out, spotlight: spot,
  };
}

// ---- rows from the three sources ----
function teamIndex(teams) { return new Map(teams.map((t) => [String(t.id), t])); }
const rowOf = (order, rank, t, fallback, record) => ({
  order, rank, id: String((t && t.id) || fallback.id), name: (t && t.name) || fallback.name, short: (t && (t.short || t.location)) || fallback.short,
  abbr: (t && t.abbr) || fallback.abbr, color: (t && t.color) || fallback.color, logo: (t && t.logo) || fallback.logo, logoDark: (t && t.logoDark) || fallback.logoDark,
  conference: (t && t.conference) || null, record: record || null,
});
// ESPN site-API ranking object ({ ranks: [{ current, recordSummary, team: { id, location, abbreviation, color, logos } }] })
function rowsFromEspnRanking(ranking, teams) {
  const idx = teamIndex(teams);
  return (ranking.ranks || []).filter((x) => x && x.team && x.current > 0).map((x, i) => {
    const raw = x.team; const t = idx.get(String(raw.id));
    const logos = raw.logos || [];
    const fb = { id: raw.id, name: raw.displayName || raw.location, short: raw.location || raw.nickname, abbr: raw.abbreviation, color: raw.color,
      logo: (logos[0] || {}).href, logoDark: ((logos.find((l) => (l.rel || []).includes('dark'))) || {}).href };
    return rowOf(i + 1, x.current, t, fb, x.recordSummary || (x.record && x.record.summary));
  });
}
function rowsFromJt(jt) {
  return jt.ranks.map((r, i) => {
    const t = r.info;
    return { order: i + 1, rank: r.rank, id: t ? String(t.id) : `jt-${r.rank}`, name: t ? t.name : r.team, short: t ? t.short : r.team, abbr: t && t.abbr,
      color: t && t.color, logo: t && t.logo, logoDark: t && t.logoDark, conference: r.conference || null, record: r.record || null };
  });
}

// Compatibility for app versions that were open on a phone before the Bracket page shipped (ss-v21 and older): they read
// `bracket` from /api/grok-top25 in the old shape. Same seeds as the new page (current rules), old field names.
function legacyBracket(jt) {
  if (!jt || !jt.ranks) return null;
  const b = buildBracket(rowsFromJt(jt));
  const byId = new Map(jt.ranks.filter((r) => r.info).map((r) => [String(r.info.id), r]));
  const L = (x) => { if (!x) return x; const r = byId.get(x.id) || {}; return { seed: x.seed, rank: x.rank, team: r.team || x.name, info: r.info, conference: x.conference, champ: x.type === 'champ', bye: x.bye }; };
  return {
    projected: true, note: 'Updated bracket rules: close and reopen the app to get the new Bracket page.',
    champions: b.champions.map((c) => { const r = byId.get(c.id) || {}; return { conference: c.conference, team: r.team || c.short, rank: c.rank, info: r.info, autoBid: true }; }),
    seeds: b.seeds.map(L),
    firstRound: b.firstRound.map((m) => ({ id: m.id, home: L(m.home), away: L(m.away), site: m.host })),
    quarterfinals: b.quarterfinals.map((q) => ({ id: q.id, top: L(q.top), from: q.from })),
    semifinals: b.semifinals.map((x) => ({ id: x.id, from: x.from })),
  };
}
const isCfp = (r) => r && (r.type === 'cfp' || /playoff|\bcfp\b/i.test(`${r.name || ''} ${r.shortName || ''}`));
const weekOf = (r) => (r.occurrence && r.occurrence.number) || (r.headline && (r.headline.match(/Week (\d+)/) || [])[1]) || null;

function view(id, title, label, extra) { return { id, title, label, ...extra }; }
const FORMAT = {
  year: '2026-27',
  summary: 'ACC, Big 12, Big Ten and SEC champions + the highest-ranked Group of 6 team get automatic bids; Notre Dame gets one if ranked in the top 12; the highest-ranked remaining teams fill out the 12. Seeds follow the ranking order; seeds 1-4 get byes.',
  sources: [
    { name: 'College Football Playoff: 2026-27 format and schedule', url: 'https://collegefootballplayoff.com/news/2026/8/6/sc-aug-2627' },
    { name: 'NCAA.com: how the 12-team CFP works', url: 'https://www.ncaa.com/news/football/article/2026-02-03/how-12-team-college-football-playoff-will-work-teams-schedule-bids' },
  ],
};
const todayISO = () => new Date().toISOString().slice(0, 10);

module.exports = function makeBrackets({ getTeams, getJt, getRawRankings, getCoreCfp }) {
  async function cfpRanking(raw) {
    // test hook (local only; never set on Render): a file with an ESPN-shaped CFP ranking object
    if (process.env.BRACKETS_MOCK_CFP) { try { return { ranking: JSON.parse(require('fs').readFileSync(process.env.BRACKETS_MOCK_CFP, 'utf8')), mock: true }; } catch { /* fall through */ } }
    const hit = (raw.rankings || []).find(isCfp);
    if (hit && (hit.ranks || []).length) return { ranking: hit, mock: false };
    const core = getCoreCfp ? await getCoreCfp(raw).catch(() => null) : null;
    return { ranking: core && (core.ranks || []).length ? core : null, mock: false };
  }
  async function compute() {
    const generatedAt = new Date().toISOString();
    const [teams, raw, jt] = await Promise.all([getTeams().then((d) => d.teams).catch(() => []), getRawRankings().catch(() => ({ rankings: [] })), getJt().catch(() => null)]);
    const out = { generatedAt, season: (raw.latestSeason && raw.latestSeason.year) || null, format: FORMAT, jt: null, ap: null, cfp: null };

    out.jt = jt ? view('jt', 'My Bracket (JT)', 'Projected if the season ended today', {
      status: 'ready', generatedAt,
      basis: 'Built from your JT Top 25 using the CFP format.',
      source: { name: 'JT Top 25', headline: jt.title, week: jt.week, date: jt.date, url: null },
      outlook: (jt.notes && jt.notes.cfpOutlook) || null,
      bracket: buildBracket(rowsFromJt(jt)),
    }) : view('jt', 'My Bracket (JT)', 'Projected if the season ended today', { status: 'unavailable', generatedAt, message: 'The JT Top 25 isn’t available right now.' });

    const ap = (raw.rankings || []).find((r) => r.type === 'ap');
    out.ap = ap && (ap.ranks || []).length ? view('ap', 'AP Projected Bracket', 'Projected if the season ended today', {
      status: 'ready', generatedAt,
      basis: 'Built from the AP Top 25 using the CFP format. The AP does not publish a bracket.',
      source: { name: 'AP Top 25 via ESPN', headline: ap.headline, week: weekOf(ap), date: ap.date, url: 'https://www.espn.com/college-football/rankings' },
      bracket: buildBracket(rowsFromEspnRanking(ap, teams)),
    }) : view('ap', 'AP Projected Bracket', 'Projected if the season ended today', { status: 'unavailable', generatedAt, message: 'ESPN’s AP Top 25 isn’t available right now.' });

    const { ranking: cfp, mock } = await cfpRanking(raw);
    if (cfp) {
      const week = weekOf(cfp);
      const after = (cfp.date || '').slice(0, 10) >= CFP_SCHEDULE.dates[CFP_SCHEDULE.dates.length - 1].date;
      out.cfp = view('cfp', 'Official CFP Bracket', after ? 'Built from the committee’s final rankings' : 'Built from the committee’s latest rankings', {
        status: 'ready', mock, generatedAt, released: true,
        basis: 'The committee publishes a ranking, not a bracket, until Selection Day (Dec. 6). This applies the CFP format to the committee’s latest Top 25.',
        source: { name: 'CFP committee rankings via ESPN', headline: cfp.headline || cfp.name, date: cfp.date, week, url: 'https://www.espn.com/college-football/rankings' },
        bracket: buildBracket(rowsFromEspnRanking(cfp, teams)),
        committeeTop12: rowsFromEspnRanking(cfp, teams).slice(0, 12).map((r) => ({ rank: r.rank, id: r.id, short: r.short, record: r.record })),
      });
    } else {
      const next = CFP_SCHEDULE.dates.find((d) => d.date >= todayISO()) || null;
      out.cfp = view('cfp', 'Official CFP Bracket', 'Not released yet', {
        status: 'pending', released: false, generatedAt,
        message: 'The College Football Playoff committee hasn’t released its Top 25 yet. This tab fills in automatically once ESPN publishes it.',
        next, schedule: CFP_SCHEDULE,
        source: { name: 'ESPN rankings feed (checked live)', headline: 'No CFP ranking published', date: null, url: 'https://www.espn.com/college-football/rankings' },
        bracket: null,
      });
    }
    return out;
  }
  return { compute };
};
module.exports.buildBracket = buildBracket;
module.exports.rowsFromEspnRanking = rowsFromEspnRanking;
module.exports.rowsFromJt = rowsFromJt;
module.exports.isCfp = isCfp;
module.exports.legacyBracket = legacyBracket;
module.exports.CFP_SCHEDULE = CFP_SCHEDULE;
