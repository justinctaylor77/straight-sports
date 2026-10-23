// Schedule pages (every team + player, every sport) and player stats (season + career), from ESPN's public JSON.
// Nothing is estimated: when ESPN has no data for a section the response says so (`missing`), and the UI shows that plainly.
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const COMMON = 'https://site.web.api.espn.com/apis/common/v3/sports';
const CORE = 'https://sports.core.api.espn.com/v2/sports';

module.exports = function makePeople({ cached, fetchJSON, SP, TICKETS }) {
  const S = SP.SPORTS;
  const https = (u) => String(u || '').replace(/^http:/, 'https:');
  const pool = async (items, n, fn) => { const out = new Array(items.length); let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } })); return out; };
  const teamQ = (e, sport) => ({ kind: 'game', home: e.home && e.home.team, away: e.away && e.away.team, date: e.date, family: S[sport] && S[sport].family, womens: /wnba|women|nwsl|wcbb|wsoc/i.test(sport) });

  // ---------- team schedule: regular season + postseason, past / live / upcoming ----------
  function parseTeamId(raw) {
    const m = String(raw).match(/^(?:([a-z0-9]+):)?(\d+)$/); if (!m) throw Object.assign(new Error('bad team id'), { status: 400 });
    const sport = m[1] || 'cfb'; if (!S[sport] || S[sport].kind !== 'team') throw Object.assign(new Error('bad team id'), { status: 400 });
    return { sport, espnId: m[2] };
  }
  async function teamSchedule(raw) {
    const { sport, espnId } = parseTeamId(raw); const base = `${SITE}/${S[sport].path}/teams/${espnId}`;
    const data = await cached(`tsched:${sport}:${espnId}`, 5 * 60e3, async () => {
      const [info, def, reg, post] = await Promise.all([fetchJSON(base), fetchJSON(`${base}/schedule`), fetchJSON(`${base}/schedule?seasontype=2`).catch(() => null), fetchJSON(`${base}/schedule?seasontype=3`).catch(() => null)]);
      const seen = new Set(); const events = [];
      for (const d of [reg, def, post]) for (const e of (d && d.events) || []) if (!seen.has(e.id)) { seen.add(e.id); try { events.push(SP.normEvent(e, sport)); } catch { /* malformed */ } }
      events.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
      const t = info.team; const rec = (t.record && t.record.items) || [];
      return { sport, team: { ...SP.normTeam(t, sport), standing: t.standingSummary || null, record: (rec[0] && rec[0].summary) || null },
        season: (def && def.season && def.season.displayName) || null, events };
    });
    const out = JSON.parse(JSON.stringify(data));
    await TICKETS.attach(out.events, (e) => teamQ(e, sport));
    out.ticketsPriced = TICKETS.enabled();
    return out;
  }

  // ---------- players ----------
  function parsePlayer(raw) {
    const s = String(raw);
    let m = s.match(/^([a-z0-9]+):a(\d+)$/); if (m && S[m[1]] && S[m[1]].kind === 'team') return { sport: m[1], espnId: m[2], kind: 'team' };
    m = s.match(/^(golf|tennis):(\d+)$/); if (m) return { sport: m[1], espnId: m[2], kind: m[1] };
    m = s.match(/^([a-z0-9]+):a(\d+)$/); if (m && S[m[1]]) return { sport: m[1], espnId: m[2], kind: 'event' };
    throw Object.assign(new Error('bad player id'), { status: 400 });
  }
  const athleteInfo = (a, sport) => ({ name: a.displayName || a.fullName, short: a.shortName || a.displayName, pos: a.position && (a.position.abbreviation || a.position.displayName) || null,
    jersey: a.displayJersey || (a.jersey ? `#${a.jersey}` : null), headshot: (a.headshot && a.headshot.href) || '', flag: (a.flag && a.flag.href) || '', country: (a.flag && a.flag.alt) || a.citizenship || null,
    age: a.age || null, height: a.displayHeight || null, weight: a.displayWeight || null, experience: a.displayExperience || null, college: a.college && a.college.name || null,
    birthplace: a.displayBirthPlace || null, status: a.status && a.status.name || null, link: ((a.links || []).find((l) => (l.rel || []).includes('playercard')) || {}).href || null,
    team: a.team && a.team.id && S[sport].kind === 'team' ? SP.normTeam(a.team, sport) : null });

  // ESPN /stats: per-category season-by-season rows + career totals
  function parseStats(j) {
    if (!j || !(j.categories || []).length) return null;
    const teams = j.teams || {};
    const cats = j.categories.filter((c) => (c.statistics || []).length || (c.totals || []).length).map((c) => {
      const rows = (c.statistics || []).map((r) => ({ season: (r.season && (r.season.displayName || r.season.year)) || '', year: (r.season && r.season.year) || 0,
        team: ((teams[r.teamSlug] || teams[r.teamId]) && ((teams[r.teamSlug] || teams[r.teamId]).abbreviation || (teams[r.teamSlug] || teams[r.teamId]).displayName)) || r.teamSlug || '', stats: r.stats || [] }));
      return { name: c.name, title: c.displayName || c.name, labels: c.labels || [], names: c.displayNames || c.names || [], rows, totals: c.totals || null };
    });
    const year = Math.max(0, ...cats.flatMap((c) => c.rows.map((r) => +r.year || 0)));
    return { year, cats };
  }
  // ESPN /gamelog: one row per game played this season
  function parseLog(j) {
    if (!j || !j.events || !(j.seasonTypes || []).length) return null;
    const labels = j.labels || []; const names = j.displayNames || [];
    const games = [];
    for (const st of j.seasonTypes) for (const c of st.categories || []) for (const e of c.events || []) {
      const ev = j.events[e.eventId] || {}; const o = ev.opponent || {};
      games.push({ id: e.eventId, season: st.displayName || '', date: ev.gameDate, atVs: ev.atVs || '', result: ev.gameResult || '', score: ev.score || '',
        opp: { id: o.id, abbr: o.abbreviation, name: o.displayName, logo: o.logo }, stats: e.stats || [] });
    }
    const uniq = [...new Map(games.map((g) => [g.id, g])).values()].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    return uniq.length ? { labels, names, games: uniq } : null;
  }

  async function teamPlayer(sport, espnId) {
    const p = `${COMMON}/${S[sport].path}/athletes/${espnId}`;
    const [info, log, stats] = await Promise.all([fetchJSON(p), fetchJSON(`${p}/gamelog`).catch(() => null), fetchJSON(`${p}/stats`).catch(() => null)]);
    const a = athleteInfo(info.athlete || {}, sport);
    const out = { sport, kind: 'team', id: `${sport}:a${espnId}`, ...a, stats: parseStats(stats), log: parseLog(log), summary: (info.athlete && info.athlete.statsSummary) || null };
    out.missing = [!out.stats && 'stats', !out.log && 'gamelog'].filter(Boolean);
    return out;
  }

  // golf: season overview + every PGA/LPGA event this season with finish, score and rounds
  async function golfPlayer(espnId) {
    let league = 'pga'; let info = await fetchJSON(`${COMMON}/golf/pga/athletes/${espnId}`).catch(() => null);
    if (!info) { league = 'lpga'; info = await fetchJSON(`${COMMON}/golf/lpga/athletes/${espnId}`); }
    const year = (info.season && info.season.year) || new Date().getFullYear();
    const [ov, log] = await Promise.all([fetchJSON(`${COMMON}/golf/${league}/athletes/${espnId}/overview`).catch(() => null),
      fetchJSON(`${CORE}/golf/leagues/${league}/seasons/${year}/athletes/${espnId}/eventlog?limit=60`).catch(() => null)]);
    const items = (log && log.events && log.events.items) || [];
    const events = (await pool(items, 8, async (it) => {
      const ev = await cached(`core:${it.event.$ref}`, 6 * 3600e3, () => fetchJSON(https(it.event.$ref)));
      let pos = null; let score = null; let rounds = [];
      if (it.played !== false && it.competitor) {
        const base = https(it.competitor.$ref).replace(/\?.*$/, '');
        const [st, sc, ls] = await Promise.all([fetchJSON(`${base}/status`).catch(() => null), fetchJSON(`${base}/score`).catch(() => null), fetchJSON(`${base}/linescores`).catch(() => null)]);
        pos = st && (st.position && st.position.displayName || st.type && st.type.shortDetail) || null;
        if (st && st.type && /cut|wd|dq|mdf/i.test(st.type.name || '')) pos = st.type.shortDetail || 'CUT';
        score = sc && (sc.displayValue != null ? sc.displayValue : sc.value);
        rounds = ((ls && ls.items) || []).filter((x) => x.value != null).map((x) => x.value);
      }
      return { id: `${league}-${ev.id}`, eventId: ev.id, name: ev.name, date: ev.date, endDate: ev.endDate, played: it.played !== false, pos, score, rounds };
    })).filter(Boolean).sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    // upcoming tour events (the tour calendar; ESPN doesn't publish a player's entries ahead of time)
    const sb = await cached(`golfcal:${league}`, 3600e3, () => fetchJSON(`${SITE}/golf/${league}/scoreboard`)).catch(() => null);
    const cal = ((sb && sb.leagues && sb.leagues[0] && sb.leagues[0].calendar) || []).filter((c) => Date.parse(c.endDate || c.startDate) > Date.now() - 864e5)
      .map((c) => ({ id: `${league}-${String(c.id || (c.event && c.event.$ref || '').replace(/.*events\/(\d+).*/, '$1'))}`, name: c.label, date: c.startDate, endDate: c.endDate, state: Date.parse(c.startDate) > Date.now() ? 'pre' : 'in' }))
      .filter((c) => !events.some((e) => e.played && e.name === c.name));
    await TICKETS.attach(cal, (c) => ({ kind: 'event', name: c.name, date: c.date, endDate: c.endDate }));
    const st = ov && ov.statistics;
    return { sport: 'golf', kind: 'golf', id: `golf:${espnId}`, league, ...athleteInfo(info.athlete || {}, 'golf'), year,
      season: st && st.labels ? { title: st.displayName, labels: st.labels, names: st.displayNames || st.names, splits: (st.splits || []).map((s) => ({ name: s.displayName, stats: s.stats })) } : null,
      rankings: ov && ov.seasonRankings && (ov.seasonRankings.categories || []).slice(0, 8).map((c) => ({ label: c.displayName, value: c.displayValue, rank: c.rankDisplayValue })) || [],
      events, upcoming: cal, ticketsPriced: TICKETS.enabled(), missing: ['career'] };
  }

  // tennis: every match this season (ATP or WTA) — round, opponent, W/L, set scores
  async function tennisPlayer(espnId) {
    let league = 'atp'; let info = await fetchJSON(`${COMMON}/tennis/atp/athletes/${espnId}`).catch(() => null);
    if (!info || !info.athlete || !info.athlete.id) { league = 'wta'; info = await fetchJSON(`${COMMON}/tennis/wta/athletes/${espnId}`); }
    const year = new Date().getFullYear();
    const first = await fetchJSON(`${CORE}/tennis/leagues/${league}/seasons/${year}/athletes/${espnId}/eventlog?limit=100`).catch(() => null);
    const items = (first && first.events && first.events.items) || [];
    const matches = (await pool(items, 8, async (it) => {
      const [comp, ev] = await Promise.all([cached(`core:${it.competition.$ref}`, it.played ? 6 * 3600e3 : 10 * 60e3, () => fetchJSON(https(it.competition.$ref))),
        cached(`core:${it.event.$ref}`, 6 * 3600e3, () => fetchJSON(https(it.event.$ref)))]);
      const me = (comp.competitors || []).find((c) => String(c.id) === String(espnId)) || {}; const opp = (comp.competitors || []).find((c) => String(c.id) !== String(espnId)) || {};
      const note = (comp.notes || [])[0] || {};
      return { id: comp.id, tournament: ev.name, tournamentId: ev.id, date: comp.date, round: (note.type || '').replace(/\s*-\s*.*$/, '') || null, court: (note.type || '').split(' - ')[1] || null,
        type: comp.type && comp.type.text, played: it.played !== false, win: it.played !== false ? !!me.winner : null, opp: opp.name || 'TBD', oppId: opp.id ? `tennis:${opp.id}` : null, oppSeed: opp.tournamentSeed || null, result: note.text || null };
    })).filter(Boolean).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    const played = matches.filter((m) => m.played && m.win != null);
    return { sport: 'tennis', kind: 'tennis', id: `tennis:${espnId}`, league, ...athleteInfo(info.athlete || {}, 'tennis'),
      record: played.length ? { w: played.filter((m) => m.win).length, l: played.filter((m) => !m.win).length } : null,
      year, matches, missing: ['stats', 'career'] };
  }

  async function player(raw) {
    const p = parsePlayer(raw);
    return cached(`player:${raw}`, 10 * 60e3, async () => {
      if (p.kind === 'golf') return golfPlayer(p.espnId);
      if (p.kind === 'tennis') return tennisPlayer(p.espnId);
      return teamPlayer(p.sport, p.espnId);
    });
  }
  return { teamSchedule, player };
};
