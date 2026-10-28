'use strict';
/**
 * ncaa-pbp.js — NCAA.com play-by-play fallback (via the same proxy the rankings/brackets use).
 * Only used when ESPN has NO plays for a started college game. Matches the game by date + both team names,
 * then reads /game/{id}/play-by-play. Names come as "Last,First" (football) / "Last, F." (baseball) —
 * we only reformat what is printed, we never guess a player.
 */
const PW = require('./playwho');
const BASE = () => (process.env.NCAA_API_BASE || 'https://ncaa-api.henrygd.me').replace(/\/$/, '');
const PATHS = { cfb: 'football/fbs', cbase: 'baseball/d1', mcbb: 'basketball-men/d1', wcbb: 'basketball-women/d1' };
const fold = PW.fold;
const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

const sameTeam = (n, t) => {
  if (!n || !t) return false;
  const a = fold(n.short || n.full || n.seo || '').replace(/[^a-z0-9]/g, '');
  const cands = [t.location, t.shortDisplayName, t.displayName, t.short, t.name, t.abbr].filter(Boolean).map((x) => fold(x).replace(/[^a-z0-9]/g, ''));
  if (!a) return false;
  if (cands.some((c) => c === a)) return true;
  const full = fold(t.displayName || t.name || '').replace(/[^a-z0-9]/g, '');
  return !!full && (full.startsWith(a) || a.startsWith(t.location ? fold(t.location).replace(/[^a-z0-9]/g, '') : '~~')) && a.length > 3;
};

/** "Glenn,Brock" -> "B.Glenn" while remembering "B.Glenn" -> "Brock Glenn" so we can restore full names after parsing. */
function shortenNames(text) {
  const map = new Map();
  const out = String(text).replace(/\b([A-Z][A-Za-z'’\-]+(?:\s(?:Jr\.|Sr\.|II|III|IV))?),([A-Z][A-Za-z'’\-]*)/g, (m, last, first) => {
    const key = `${first[0]}.${last}`; map.set(key, `${first} ${last}`); return key;
  });
  return { text: out, map };
}
function restoreNames(s, map) {
  let o = s;
  for (const [k, full] of map) {
    const m = k.match(/^([A-Z])\.(.+)$/); const pretty = `${m[1]}. ${m[2]}`;
    o = o.split(pretty).join(full).split(k).join(full);
  }
  return o;
}

module.exports = function makeNcaaPbp({ cached, fetchJSON }) {
  async function findGame(sport, date, espnTeams) {
    const path = PATHS[sport]; if (!path || !date) return null;
    const dt = new Date(date); if (isNaN(dt)) return null;
    // NCAA dates are US Eastern-ish; try the day before/of/after (UTC kickoffs roll into the next day)
    const days = [0, -1, 1].map((o) => new Date(dt.getTime() + o * 864e5));
    const urls = [];
    if (sport === 'cfb') {
      const y = dt.getUTCFullYear(); const start = Date.UTC(y, 7, 24); const wk = Math.floor((dt.getTime() - start) / (7 * 864e5)) + 1;
      for (const w of [wk, wk - 1, wk + 1]) if (w >= 1 && w <= 16) urls.push(`/scoreboard/${path}/${y}/${String(w).padStart(2, '0')}/all-conf`);
    } else for (const d of days) urls.push(`/scoreboard/${path}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/all-conf`);
    for (const u of urls) {
      const sb = await cached(`ncaa:sb:${u}`, 10 * 60e3, () => fetchJSON(`${BASE()}${u}`)).catch(() => null);
      for (const g of (sb && sb.games) || []) {
        const x = g.game; if (!x) continue;
        const [h, a] = [espnTeams.home, espnTeams.away];
        if ((sameTeam(x.home.names, h) && sameTeam(x.away.names, a))) return { id: x.gameID, title: x.title };
      }
    }
    return null;
  }
  async function playByPlay(sport, date, espnTeams) {
    try {
      const g = await findGame(sport, date, espnTeams); if (!g) return null;
      const j = await cached(`ncaa:pbp:${g.id}`, 60e3, () => fetchJSON(`${BASE()}/game/${g.id}/play-by-play`));
      if (!j || !j.periods) return null;
      const teamAbbr = {}; (j.teams || []).forEach((t) => { teamAbbr[String(t.teamId)] = t.name6Char; });
      const rows = [];
      for (const per of j.periods) for (const st of per.playbyplayStats || []) for (const p of st.plays || []) {
        if (!clean(p.playText)) continue;
        rows.push({ period: per.periodNumber, perLabel: per.periodDisplay, teamId: st.teamId != null ? String(st.teamId) : null, abbr: teamAbbr[String(st.teamId)] || null, text: clean(p.playText), dd: p.driveText || null, clock: p.clock || st.clock || null, away: p.visitorScore, home: p.homeScore });
      }
      return rows.length ? { id: g.id, rows } : null;
    } catch (e) { return null; }
  }

  /** Football: group rows into pseudo-drives (by period + team run) and explain each play from the printed names. */
  function footballDrives(rows, ctx, packX) {
    const drives = []; let cur = null;
    for (const r of rows) {
      if (!cur || cur.period !== r.period || cur.teamId !== r.teamId) { cur = { id: `ncaa-${drives.length}`, current: false, teamId: null, abbr: r.abbr, description: `${r.perLabel || `Q${r.period}`} · NCAA.com play-by-play`, result: '', score: false, start: null, period: r.period, clock: r.clock, plays: [], source: 'NCAA.com', teamId_: r.teamId }; cur.period = r.period; cur.teamId = r.teamId; drives.push(cur); }
      const { text, map } = shortenNames(r.text.replace(/^\(\d{1,2}:\d{2}\)\s*/, ''));
      const e = PW.explainPlay('football', { id: `n${drives.length}-${cur.plays.length}`, text, type: null }, { sport: ctx.sport, roster: ctx.empty, teamIds: [] });
      const px = packX({ what: e.what, desc: restoreNames(e.desc, map), who: e.who.map((w) => ({ ...w, name: restoreNames(w.name, map) })) });
      cur.plays.push({ id: `n${drives.length}-${cur.plays.length}`, text: restoreNames(text, map), clock: r.clock, period: r.period, dd: r.dd, score: false, type: null, tm: null, s: null, e: null, yds: null, pen: /^PENALTY/i.test(text), to: /INTERCEPT|fumble/i.test(text), dn: null, ds: null, ...px });
    }
    return drives.reverse().map((d) => ({ ...d, plays: d.plays }));
  }
  /** Baseball / basketball: flat list (latest first) with batter / player parsed from the printed name. */
  function flatPlays(sport, rows) {
    return rows.slice().reverse().map((r) => {
      let text = r.text; const who = [];
      if (sport === 'cbase') {
        const m = text.match(/^([A-Z][A-Za-z'’\- ]+), ([A-Z])\.\s/);
        const what = PW.baseWhat({ text, type: {} });
        if (m) { who.push({ role: 'Batter', name: `${m[2]}. ${m[1].trim()}`, id: null, team: r.abbr, jersey: null, pos: null }); }
        return { text, desc: text, what, who, clock: r.clock, period: r.period, periodLabel: r.perLabel, away: r.away, home: r.home, type: what };
      }
      const { text: t2, map } = shortenNames(text.replace(/\b([A-Z][A-Z'’\-]+),([A-Z][A-Z'’\-]*)\b/g, (m, l, f) => `${l[0]}${l.slice(1).toLowerCase()},${f[0]}${f.slice(1).toLowerCase()}`));
      const pretty = restoreNames(t2, map);
      const roleFor = (idx) => { const b = fold(pretty.slice(Math.max(0, idx - 14), idx)); return /assist\s*(?:by)?\s*$/.test(b) ? 'Assist' : /steal\s*(?:by)?\s*$/.test(b) ? 'Steal' : /block\s*(?:by)?\s*$/.test(b) ? 'Block' : /rebound\s*(?:by)?\s*$/.test(b) ? 'Rebound' : /foul\s*(?:on|by)?\s*$/.test(b) ? 'Foul on' : /turnover\s*(?:by)?\s*$/.test(b) ? 'Turnover' : /sub(?:stitution)?\s*in\s*(?:by)?\s*$/.test(b) ? 'Subbed in' : /sub(?:stitution)?\s*out\s*(?:by)?\s*$/.test(b) ? 'Subbed out' : 'Player'; };
      for (const [, full] of map) { const idx = pretty.indexOf(full); if (idx >= 0) who.push({ role: roleFor(idx), name: full, id: null, team: r.abbr, jersey: null, pos: null }); }
      return { text: pretty, desc: pretty, what: null, who, clock: r.clock, period: r.period, periodLabel: r.perLabel, away: r.away, home: r.home, type: null };
    });
  }
  return { findGame, playByPlay, footballDrives, flatPlays, shortenNames, restoreNames };
};
module.exports.shortenNames = shortenNames; module.exports.restoreNames = restoreNames;
