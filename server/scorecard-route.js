'use strict';
// v1.7.1: one /api/scorecard for every baseball/softball league the app carries.
//   mlb    ESPN summary (play-by-play + box)                                  9 innings
//   cbase  ESPN summary; when ESPN has no plays, NCAA.com play-by-play + box  9 innings
//   softball NCAA.com play-by-play + box (ids are "n<NCAA contest id>")       7 innings
//   ausl   no play-by-play or lineup source: teams + score only, with a note  7 innings
const SCORECARD = require('./scorecard');
const { fromNcaa } = require('./scorecard-ncaa');
const NO_PBP = 'Play-by-play isn’t available for this league, so the sheet can’t fill in';
const BASE = () => (process.env.NCAA_API_BASE || 'https://ncaa-api.henrygd.me').replace(/\/$/, '');
const INNINGS = { mlb: 9, cbase: 9, softball: 7, ausl: 7 };

module.exports = function makeScorecardRoute({ cached, cache, fetchJSON, SP, FEEDS }) {
  const ncaaBuild = async (sport, gid, extra = {}) => {
    const [pbp, box] = await Promise.all([fetchJSON(`${BASE()}/game/${gid}/play-by-play`), fetchJSON(`${BASE()}/game/${gid}/boxscore`).catch(() => null)]);
    const d = fromNcaa(pbp, box, { innings: INNINGS[sport] });
    const sc = SCORECARD.build(d, { sport, innings: INNINGS[sport], source: 'NCAA.com' });
    return { ...sc, id: extra.id || `n${gid}`, ncaaId: String(gid) };
  };
  async function ausl(id) {
    const g = await SP.AUSL.cast(id);
    const T = (s) => (g[s] && g[s].team) || {}; const team = (s) => ({ side: s, id: String(T(s).id || ''), abbr: T(s).abbr || '', name: T(s).name || '', logo: T(s).logo || null, score: g[s] && g[s].score != null ? String(g[s].score) : null,
      slots: [], cells: {}, innings: [], pitchers: [], linescores: [] });
    const xi = +(String(g.detail || '').match(/\/(\d+)/) || [])[1] || 7;
    return { v: 1, sport: 'ausl', id: String(id), state: g.state, detail: g.detail || '', live: g.state === 'in', innings: Math.max(7, xi), regulation: 7, source: 'AUSL game log (Wikipedia)', note: NO_PBP,
      teams: { away: team('away'), home: team('home') }, current: null, hasPlays: false, lineup: false, date: g.date ? new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }) : null };
  }
  async function compute(s, raw) {
    if (s === 'ausl') { const id = raw.replace(/\D/g, ''); if (!id) throw bad('bad id'); return ausl(id); }
    const n = raw.match(/^n(\d{4,12})$/);
    if (s === 'softball') { if (!n) throw bad('softball scorecards use NCAA.com ids (n123…)'); return ncaaBuild(s, n[1]); }
    if (n && s === 'cbase') return ncaaBuild(s, n[1]);
    const id = raw.replace(/\D/g, ''); if (!/^\d{4,12}$/.test(id)) throw bad('bad id');
    const sp = SP.SPORTS[s]; const sum = await fetchJSON(`https://site.api.espn.com/apis/site/v2/sports/${sp.path}/summary?event=${id}`);
    const sc = SCORECARD.build(sum, { sport: s, innings: INNINGS[s] });
    if (s === 'cbase' && !sc.hasPlays && sc.state !== 'pre') { // ESPN often has no college play-by-play: try NCAA.com for the same game
      const comp = (sum.header && sum.header.competitions && sum.header.competitions[0]) || {};
      const t = {}; for (const c of comp.competitors || []) t[c.homeAway] = { name: c.team && c.team.displayName, short: c.team && c.team.shortDisplayName, abbr: c.team && c.team.abbreviation, location: c.team && c.team.location };
      const g = await SP.NCAAPBP.findGame('cbase', comp.date, t).catch(() => null);
      if (g) { const alt = await ncaaBuild(s, g.id, { id }).catch(() => null); if (alt && alt.hasPlays) return alt; }
    }
    return sc;
  }
  const bad = (m) => Object.assign(new Error(m), { status: 400 });
  async function route(req) {
    const s = String(req.params.sport || ''); const sp = SP.SPORTS[s];
    if (!sp || sp.family !== 'baseball' || !(s in INNINGS)) throw bad('scorecard: baseball/softball only');
    const raw = String(req.params.id || ''); if (!/^n?\d{1,12}$/.test(raw)) throw bad('bad id');
    const key = `scorecard:${s}:${raw}`; const prev = cache.get(key); const v = prev && prev.value;
    return cached(key, v && v.state === 'in' ? 6e3 : v && v.state === 'post' ? 5 * 60e3 : 60e3, () => compute(s, raw));
  }

  // Games with a scorecard for leagues that have no ESPN scoreboard (college softball): the last 7 days on NCAA.com,
  // else the latest postseason games from the NCAA bracket.
  async function games(sport) {
    if (sport !== 'softball' && sport !== 'cbase') throw bad('scorecards list: softball or cbase');
    return cached(`scorecards:${sport}`, 5 * 60e3, async () => {
      const path = sport === 'softball' ? 'softball/d1' : 'baseball/d1';
      const out = []; const now = Date.now();
      for (let o = 0; o < 7 && out.length < 40; o++) {
        const d = new Date(now - o * 864e5 - 5 * 3600e3); const ymd = [d.getUTCFullYear(), String(d.getUTCMonth() + 1).padStart(2, '0'), String(d.getUTCDate()).padStart(2, '0')];
        const sb = await cached(`ncaa:sb:/scoreboard/${path}/${ymd.join('/')}/all-conf`, 10 * 60e3, () => fetchJSON(`${BASE()}/scoreboard/${path}/${ymd.join('/')}/all-conf`)).catch(() => null);
        for (const { game: x } of (sb && sb.games) || []) if (x && x.gameID) out.push({ id: `n${x.gameID}`, date: ymd.join('-'), state: x.gameState === 'live' ? 'in' : x.gameState === 'final' ? 'post' : 'pre', detail: x.finalMessage || x.currentPeriod || x.startTime || '',
          away: { name: (x.away.names || {}).short, score: x.away.score || null }, home: { name: (x.home.names || {}).short, score: x.home.score || null } });
      }
      if (out.length) return { sport, source: 'NCAA.com scoreboard', recent: true, games: out };
      const po = FEEDS ? await FEEDS.playoffs(sport).catch(() => null) : null; const b = po && (po.bracket || po);
      const all = []; for (const st of (b && b.stages) || []) for (const sec of st.sections || []) for (const g of sec.games || []) if (g.contestId && g.state === 'final') all.push({ id: `n${g.contestId}`, date: g.date, state: 'post', detail: `${st.name} · ${sec.name}`,
        away: { name: (g.slots[1] && g.slots[1].team && g.slots[1].team.short) || '', score: g.slots[1] && g.slots[1].score }, home: { name: (g.slots[0] && g.slots[0].team && g.slots[0].team.short) || '', score: g.slots[0] && g.slots[0].score } });
      return { sport, source: 'NCAA.com bracket', recent: false, games: all.slice(-12).reverse() };
    });
  }
  return { route, games, compute, NO_PBP };
};
