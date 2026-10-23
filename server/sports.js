// Multi-sport data layer: ESPN public JSON -> small normalized shapes for the PWA.
// Sports come from the shared registry in public/catalog.js (core: CFB, NFL, MLB, golf, tennis; plus opt-in catalog sports).
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const WEB = 'https://site.web.api.espn.com/apis/v2/sports';
const WEB_SITE = 'https://site.web.api.espn.com/apis/site/v2/sports';

const { CATALOG } = require('./catalog');
// One registry (public/catalog.js) drives every sport; golf/tennis keep their tour lists.
const SPORTS = {};
for (const [id, c] of Object.entries(CATALOG)) SPORTS[id] = { id, ...c, leagues: id === 'golf' ? ['pga', 'lpga'] : id === 'tennis' ? ['atp', 'wta'] : undefined };
const CORE_TEAM = ['cfb', 'nfl', 'mlb'];

module.exports = function makeSports({ cached, cache, fetchJSON }) {
  // ids: CFB keeps bare ESPN ids (backwards compatible with v1/v2 saved settings); others are namespaced.
  const tid = (sport, id) => (sport === 'cfb' ? String(id) : `${sport}:${id}`);
  const logoOf = (t, sport) => t.logo || (t.logos && t.logos[0] && t.logos[0].href) || (sport === 'cfb' ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${t.id}.png` : '');
  // Dark-theme variant: ESPN's own "dark" logo when listed; otherwise ESPN's 500-dark path for the same id (the client
  // falls back to the regular logo if that file doesn't exist).
  const darkPath = (u) => (/a\.espncdn\.com\/i\/teamlogos\/[^/]+\/500\/[^/]+\.png$/.test(u || '') ? u.replace('/500/', '/500-dark/') : u);
  const logoDarkOf = (t, sport) => t.logoDark || (t.logos && (t.logos.find((l) => (l.rel || []).includes('dark')) || {}).href) || darkPath(logoOf(t, sport));
  function normTeam(t, sport = 'cfb') {
    if (!t) return null;
    return {
      id: tid(sport, t.id), espnId: String(t.id), sport, name: t.displayName, short: t.shortDisplayName || t.location, location: t.location,
      mascot: t.name, abbr: t.abbreviation, color: t.color, alt: t.alternateColor, logo: logoOf(t, sport), logoDark: logoDarkOf(t, sport),
    };
  }
  const gameLink = (sport, id) => `https://www.espn.com/${SPORTS[sport].espn}/game/_/gameId/${id}`;
  function broadcastsOf(c) { return [...new Set((c.broadcasts || []).flatMap((x) => x.names || (x.media ? [x.media.shortName] : [])))].join(', ') || null; }
  // Watchable networks (TV + streaming; radio dropped), de-duped, in ESPN's order.
  function netsOf(c, extra) {
    const out = []; const add = (n) => { n = n && String(n).trim(); if (n && !out.some((x) => x.toLowerCase() === n.toLowerCase())) out.push(n); };
    const geo = ((c && c.geoBroadcasts) || []).filter((g) => !/radio/i.test((g.type && g.type.shortName) || ''));
    const nat = (g) => /national/i.test((g.market && g.market.type) || '');
    [...geo.filter(nat), ...geo.filter((g) => !nat(g))].forEach((g) => add(g.media && (g.media.shortName || g.media.name)));
    for (const b of (c && c.broadcasts) || []) { if (b.type && /radio/i.test(b.type.shortName || '')) continue; (b.names || []).forEach(add); if (b.media) add(b.media.shortName || b.media.name); }
    for (const b of extra || []) { if (b.type && /radio/i.test(b.type.shortName || '')) continue; if (b.media) add(b.media.shortName || b.media.name); }
    return out;
  }
  function venueOf(v) { return v ? [v.fullName, v.address && [v.address.city, v.address.state || v.address.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ') : null; }

  function normEvent(ev, sport = 'cfb') {
    const c = ev.competitions[0];
    const st = c.status || ev.status;
    const comp = (side) => {
      const x = c.competitors.find((k) => k.homeAway === side) || {};
      const rec = (x.records || x.record || []).find?.((r) => r.type === 'total' || r.name === 'overall');
      const prob = (x.probables || []).find((p) => p.athlete);
      return {
        team: normTeam(x.team, sport),
        score: x.score == null ? null : (typeof x.score === 'object' ? x.score.displayValue : x.score),
        rank: x.curatedRank && x.curatedRank.current < 99 ? x.curatedRank.current : null,
        record: rec ? (rec.summary || rec.displayValue) : null,
        winner: !!x.winner,
        conferenceId: x.team && x.team.conferenceId ? String(x.team.conferenceId) : null,
        probable: prob ? prob.athlete.shortName || prob.athlete.displayName : null,
      };
    };
    const s = c.situation || {};
    const note = (c.notes || []).map((n) => n.headline).filter(Boolean)[0] || null;
    return {
      sport, id: ev.id, date: ev.date, name: ev.name, shortName: ev.shortName,
      week: ev.week && ev.week.number,
      state: st.type.state, detail: st.type.shortDetail || st.type.detail, completed: !!st.type.completed,
      clock: st.displayClock, period: st.period,
      home: comp('home'), away: comp('away'),
      venue: venueOf(c.venue), neutral: !!c.neutralSite, conferenceGame: sport === 'cfb' && !!c.conferenceCompetition,
      broadcast: broadcastsOf(c), nets: netsOf(c), note,
      series: c.series && c.series.summary ? c.series.summary : null,
      possession: s.possession ? tid(sport, s.possession) : null,
      downDistance: s.shortDownDistanceText || null,
      bases: SPORTS[sport].family === 'baseball' && st.type.state === 'in' ? { on1: !!s.onFirst, on2: !!s.onSecond, on3: !!s.onThird, outs: s.outs, balls: s.balls, strikes: s.strikes } : null,
      link: gameLink(sport, ev.id),
    };
  }

  // ---------- teams (CFB conferences / NFL+MLB divisions from standings) ----------
  function shortConf(name) {
    const m = { 'American Conference': 'American', 'Atlantic Coast Conference': 'ACC', 'Big 12 Conference': 'Big 12', 'Big Ten Conference': 'Big Ten',
      'Conference USA': 'C-USA', 'FBS Independents': 'Independents', 'Mid-American Conference': 'MAC', 'Mountain West Conference': 'Mountain West',
      'Pac-12 Conference': 'Pac-12', 'Southeastern Conference': 'SEC', 'Sun Belt Conference': 'Sun Belt',
      'American League East': 'AL East', 'American League Central': 'AL Central', 'American League West': 'AL West',
      'National League East': 'NL East', 'National League Central': 'NL Central', 'National League West': 'NL West' };
    return m[name] || name.replace(/ Conference$/, '');
  }
  async function getTeams(sport) {
    const sp = SPORTS[sport];
    if (!CORE_TEAM.includes(sport)) return genericTeams(sport);
    return cached(`teams:${sport}`, 6 * 3600e3, async () => {
      const url = sport === 'cfb' ? `${WEB}/${sp.path}/standings?group=80` : `${WEB}/${sp.path}/standings?level=3`;
      const d = await fetchJSON(url);
      const conferences = []; const teams = [];
      const add = (node, conf) => {
        for (const e of node.standings.entries) {
          const stat = (n) => { const s = e.stats.find((x) => x.type === n || x.name === n); return s && (s.displayValue || s.summary); };
          teams.push({ ...normTeam(e.team, sport), conferenceId: conf.id, conference: conf.short,
            record: stat('total') || stat('overall'), confRecord: sport === 'cfb' ? stat('vsconf') : null, streak: stat('streak'),
            seed: stat('playoffSeed') });
        }
      };
      if (sport === 'cfb') {
        const walk = (node, conf) => { if (node.standings) add(node, conf); (node.children || []).forEach((ch) => walk(ch, conf)); };
        for (const ch of d.children || []) { const conf = { id: String(ch.id), name: ch.name, short: shortConf(ch.name) }; conferences.push(conf); walk(ch, conf); }
      } else {
        // leagues -> divisions (AFC East, AL West, ...)
        for (const lg of d.children || []) for (const dv of lg.children || []) {
          const conf = { id: tid(sport, dv.id), name: dv.name, short: shortConf(dv.name), parent: lg.abbreviation || lg.name };
          conferences.push(conf); if (dv.standings) add(dv, conf);
        }
      }
      try {
        const t = await fetchJSON(`${SITE}/${sp.path}/teams?${sport === 'cfb' ? 'groups=80&' : ''}limit=500`);
        const colors = {};
        for (const x of t.sports[0].leagues[0].teams) colors[x.team.id] = x.team;
        for (const tm of teams) { const c = colors[tm.espnId]; if (c) { tm.color = c.color; tm.alt = c.alternateColor; if (!tm.logo) { tm.logo = logoOf(c, sport); tm.logoDark = logoDarkOf(c, sport); } } }
      } catch { /* colors optional */ }
      teams.sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));
      return { sport, conferences, teams };
    });
  }

  // ---------- team-sport scoreboards ----------
  const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).replace(/-/g, '');
  async function teamScoreboard(sport, q = {}) {
    const sp = SPORTS[sport];
    if (!CORE_TEAM.includes(sport)) return dailyBoard(sport, q);
    let qs = '';
    if (sport === 'cfb') qs = `groups=80&limit=400${q.week ? `&week=${encodeURIComponent(q.week)}` : ''}${q.seasontype ? `&seasontype=${encodeURIComponent(q.seasontype)}` : ''}`;
    else if (sport === 'nfl') qs = `limit=100${q.week ? `&week=${encodeURIComponent(q.week)}` : ''}${q.seasontype ? `&seasontype=${encodeURIComponent(q.seasontype)}` : ''}`;
    else if (sport === 'mlb') {
      // ESPN's MLB feed rejects date ranges, so fetch one day at a time (past days cache longer).
      const now = Date.now(); const today = ymd(new Date(now));
      const days = q.dates && /^\d{8}$/.test(q.dates) ? [q.dates] : Array.from({ length: 10 }, (_, i) => ymd(new Date(now + (i - 6) * 864e5)));
      const per = await Promise.all(days.map((dt) => cached(`mlbday:${dt}`, dt < today ? 30 * 60e3 : 20e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?dates=${dt}`)).catch(() => ({ events: [] }))));
      const seen = new Set(); const events = [];
      for (const d of per) for (const e of d.events || []) if (!seen.has(e.id)) { seen.add(e.id); events.push(normEvent(e, sport)); }
      const s0 = per.find((d) => d.season) || {};
      return { sport, season: s0.season, seasontype: s0.season && s0.season.type, calendar: [], days, events, fetchedAt: new Date().toISOString() };
    }
    const key = `sb:${sport}:${qs}`;
    const prev = cache.get(key);
    const live = prev && prev.value && prev.value.events.some((e) => e.state === 'in');
    return cached(key, live ? 15e3 : 60e3, async () => {
      const d = await fetchJSON(`${SITE}/${sp.path}/scoreboard?${qs}`);
      const lg = d.leagues && d.leagues[0] || {};
      const cal = lg.calendarType === 'list' || sport !== 'mlb'
        ? (lg.calendar || []).flatMap((s) => (s.entries || []).map((e) => ({ label: e.label, detail: e.detail, week: e.value, seasontype: s.value, start: e.startDate, end: e.endDate })))
        : [];
      return { sport, season: d.season, week: d.week && d.week.number, seasontype: d.season && d.season.type, calendar: cal,
        events: (d.events || []).map((e) => normEvent(e, sport)), raw: undefined, fetchedAt: new Date().toISOString() };
    });
  }
  async function rawScoreboardEvent(sport, id, date) {
    // Live situation (down/distance, runners) is most current on the scoreboard feed.
    const sp = SPORTS[sport];
    if (!CORE_TEAM.includes(sport)) {
      const dt = ymd(new Date(date || Date.now())); const today = ymd(new Date());
      const d = await cached(`day:${sport}:${dt}`, dt < today ? 30 * 60e3 : 12e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?dates=${dt}${dayExtra(sp)}`)).catch(() => null);
      return d && (d.events || []).find((e) => e.id === String(id));
    }
    if (sport === 'mlb') {
      const dt = ymd(new Date(date || Date.now())); const today = ymd(new Date());
      const d = await cached(`mlbday:${dt}`, dt < today ? 30 * 60e3 : 12e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?dates=${dt}`)).catch(() => null);
      return d && (d.events || []).find((e) => e.id === String(id));
    }
    const qs = sport === 'cfb' ? 'groups=80&limit=400' : sport === 'mlb' ? `dates=${ymd(new Date())}` : 'limit=100';
    const d = await cached(`rawsb:${sport}`, 12e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?${qs}`)).catch(() => null);
    return d && (d.events || []).find((e) => e.id === String(id));
  }

  // ---------- golf ----------
  function golfPlayer(p, league) {
    const s = p.status || {};
    return {
      id: `golf:${p.athlete && p.athlete.id || p.id}`, espnId: String(p.athlete && p.athlete.id || p.id), league,
      name: p.athlete.displayName, short: p.athlete.shortName || p.athlete.displayName, flag: p.athlete.flag && p.athlete.flag.href, country: p.athlete.flag && p.athlete.flag.alt,
      pos: s.position ? s.position.displayName : '', posN: s.position ? +s.position.id : 999, sort: p.sortOrder ?? 999,
      score: p.score && typeof p.score === 'object' ? p.score.displayValue : p.score,
      today: s.todayDetail ? s.todayDetail.replace(/\(.*\)/, '') : null, thru: s.displayThru || s.displayValue || '', teeTime: s.teeTime || null,
      hole: s.hole, state: s.type && s.type.state, statusText: s.type && s.type.shortDetail,
      cut: /cut|wd|dq|mdf/i.test((s.type && s.type.name) || '') || /CUT|WD|DQ|MDF/.test(s.displayValue || ''),
      rounds: (p.linescores || []).filter((l) => l.value != null).map((l) => ({ r: l.period, strokes: l.value, toPar: l.displayValue })),
      movement: p.movement || 0,
    };
  }
  async function golfLeague(league) {
    return cached(`golf:${league}`, 60e3, async () => {
      const lb = await fetchJSON(`${WEB_SITE}/golf/leaderboard?league=${league}`).catch(() => null);
      const sb = await fetchJSON(`${SITE}/golf/${league}/scoreboard`).catch(() => null);
      const evs = (lb && lb.events) || [];
      const cal = sb && sb.leagues && sb.leagues[0] && sb.leagues[0].calendar || [];
      const tours = evs.map((e) => {
        const c = e.competitions[0]; const st = (c.status && c.status.type && c.status.type.detail ? c.status : e.status) || {};
        const course = (e.courses || [])[0] || {};
        const players = (c.competitors || []).map((p) => golfPlayer(p, league)).sort((a, b) => a.sort - b.sort);
        return {
          id: `${league}-${e.id}`, eventId: e.id, league, tour: league.toUpperCase(), name: e.name, date: e.date, endDate: e.endDate,
          state: st.type && st.type.state, detail: st.type && (st.type.detail || st.type.shortDetail), round: st.period,
          purse: e.displayPurse || null, course: course.name || null, par: course.shotsToPar || null,
          holes: (course.holes || []).map((h) => ({ n: h.number, par: h.shotsToPar, yds: h.totalYards })),
          rounds: e.tournament && e.tournament.numberOfRounds, cut: e.tournament && e.tournament.cutScore != null ? { score: e.tournament.cutScore, count: e.tournament.cutCount, round: e.tournament.cutRound } : null,
          players, nets: netsOf(c, e.broadcasts), link: `https://www.espn.com/golf/leaderboard/_/tournamentId/${e.id}`,
        };
      });
      const schedule = cal.map((x) => ({ id: x.id, name: x.label, start: x.startDate, end: x.endDate, league }));
      return { tours, schedule };
    });
  }
  async function golfBoard() {
    const res = await Promise.all(SPORTS.golf.leagues.map((l) => golfLeague(l).catch(() => ({ tours: [], schedule: [] }))));
    return { sport: 'golf', tournaments: res.flatMap((r) => r.tours), schedule: res.flatMap((r) => r.schedule).sort((a, b) => Date.parse(a.start) - Date.parse(b.start)), fetchedAt: new Date().toISOString() };
  }
  async function golfCast(key) {
    const [league, eventId] = String(key).split('-');
    if (!SPORTS.golf.leagues.includes(league)) throw new Error('bad tour');
    const { tours } = await golfLeague(league);
    let t = tours.find((x) => x.eventId === eventId);
    if (!t) {
      const lb = await cached(`golfev:${league}:${eventId}`, 5 * 60e3, () => fetchJSON(`${WEB_SITE}/golf/leaderboard?league=${league}&event=${eventId}`));
      const e = lb.events[0]; const c = e.competitions[0]; const course = (e.courses || [])[0] || {};
      t = { id: key, eventId, league, tour: league.toUpperCase(), name: e.name, date: e.date, endDate: e.endDate, state: e.status.type.state, detail: e.status.type.detail, round: e.status.period,
        course: course.name, par: course.shotsToPar, holes: (course.holes || []).map((h) => ({ n: h.number, par: h.shotsToPar, yds: h.totalYards })), players: c.competitors.map((p) => golfPlayer(p, league)).sort((a, b) => a.sort - b.sort), nets: netsOf(c, e.broadcasts), link: `https://www.espn.com/golf/leaderboard/_/tournamentId/${eventId}` };
    }
    // hole-by-hole cards live on the scoreboard feed
    const sb = await cached(`golfsb:${league}:${eventId}`, t.state === 'in' ? 30e3 : 10 * 60e3, () => fetchJSON(`${SITE}/golf/${league}/scoreboard?event=${eventId}`)).catch(() => null);
    const cards = {};
    const ev = sb && (sb.events || []).find((e) => e.id === eventId);
    if (ev) for (const p of ev.competitions[0].competitors) {
      cards[`golf:${p.id}`] = (p.linescores || []).filter((r) => r.linescores && r.linescores.length).map((r) => ({
        r: r.period, total: r.value, toPar: r.displayValue,
        holes: r.linescores.map((h) => ({ n: h.period, s: h.value, rel: h.scoreType && h.scoreType.displayValue })).sort((a, b) => a.n - b.n),
      }));
    }
    return { sport: 'golf', kind: 'golf', ...t, cards, fetchedAt: new Date().toISOString() };
  }

  // ---------- tennis ----------
  function tennisMatch(m, e, league, draw) {
    const st = m.status || {};
    const side = (x) => {
      const a = x.athlete || {}; const roster = x.roster || null;
      const name = a.displayName || (roster && roster.displayName) || (x.team && x.team.displayName) || 'TBD';
      return {
        id: a.id || x.id ? `tennis:${x.id}` : null, espnId: x.id, name, short: a.shortName || name, flag: a.flag && a.flag.href, country: a.flag && a.flag.alt,
        seed: x.curatedRank && x.curatedRank.current < 99 ? x.curatedRank.current : null,
        sets: (x.linescores || []).map((l) => ({ g: l.value, tb: l.tiebreak ?? null, won: l.winner ?? null })),
        winner: !!x.winner, serving: !!x.possession,
      };
    };
    const comps = [...(m.competitors || [])].sort((a, b) => (a.order || 0) - (b.order || 0));
    return {
      sport: 'tennis', id: `${league}-${m.id}`, matchId: m.id, league, tour: league.toUpperCase(), tournament: e.name, tournamentId: `${league}-${e.id}`, draw,
      round: m.round && m.round.displayName, date: m.date, state: st.type && st.type.state, detail: st.type && (st.type.detail || st.type.shortDetail),
      court: m.venue && m.venue.court, venue: m.venue && m.venue.fullName, note: (m.notes || []).map((n) => n.text).filter(Boolean)[0] || null,
      bestOf: m.format && m.format.regulation && m.format.regulation.periods, players: comps.map(side), nets: netsOf(m),
      link: e.links && e.links[0] && e.links[0].href || null,
    };
  }
  async function tennisLeague(league) {
    const prev = cache.get(`tennis:${league}`);
    const live = prev && prev.value && prev.value.some((t) => t.matches.some((m) => m.state === 'in'));
    return cached(`tennis:${league}`, live ? 20e3 : 90e3, async () => {
      const d = await fetchJSON(`${SITE}/tennis/${league}/scoreboard`);
      return (d.events || []).map((e) => {
        const matches = (e.groupings || []).flatMap((g) => g.competitions.map((m) => tennisMatch(m, e, league, g.grouping && g.grouping.displayName)));
        const st = e.status && e.status.type || {};
        return { id: `${league}-${e.id}`, league, tour: league.toUpperCase(), name: e.name, major: !!e.major, venue: e.venue && e.venue.displayName, date: e.date, endDate: e.endDate,
          state: matches.some((m) => m.state === 'in') ? 'in' : st.state || (matches.every((m) => m.state === 'post') && matches.length ? 'post' : 'pre'),
          draws: [...new Set(matches.map((m) => m.draw).filter(Boolean))], matches };
      }).filter((t) => t.matches.length);
    });
  }
  async function tennisBoard() {
    const res = await Promise.all(SPORTS.tennis.leagues.map((l) => tennisLeague(l).catch(() => [])));
    const tournaments = res.flat().sort((a, b) => ({ in: 0, pre: 1, post: 2 }[a.state] - { in: 0, pre: 1, post: 2 }[b.state]) || Date.parse(b.date) - Date.parse(a.date));
    return { sport: 'tennis', tournaments, fetchedAt: new Date().toISOString() };
  }
  async function tennisCast(key) {
    const [league, mid] = String(key).split('-');
    if (!SPORTS.tennis.leagues.includes(league)) throw new Error('bad tour');
    const tours = await tennisLeague(league);
    for (const t of tours) {
      const m = t.matches.find((x) => x.matchId === mid);
      if (m) {
        const sameRound = t.matches.filter((x) => x.draw === m.draw && x.round === m.round && x.matchId !== mid).slice(0, 12);
        return { kind: 'tennis', ...m, tournamentInfo: { name: t.name, venue: t.venue, major: t.major }, related: sameRound, fetchedAt: new Date().toISOString() };
      }
    }
    throw new Error('Match not found in the current ESPN tennis feed');
  }
  async function tennisRankings() {
    return cached('tennis:rankings', 6 * 3600e3, async () => {
      const out = [];
      for (const league of SPORTS.tennis.leagues) {
        const d = await fetchJSON(`${SITE}/tennis/${league}/rankings`).catch(() => null);
        const r = d && d.rankings && d.rankings[0]; if (!r) continue;
        out.push({ id: league, name: r.name || league.toUpperCase(), date: r.date, ranks: r.ranks.map((x) => ({ rank: x.current, previous: x.previous, points: x.points, trend: x.trend,
          player: { id: `tennis:${x.athlete.id}`, name: x.athlete.displayName, short: x.athlete.shortname || x.athlete.displayName, flag: x.athlete.flag, country: x.athlete.flagAltText, league } })) });
      }
      return { polls: out };
    });
  }

  // ---------- players directory for follow pickers (golf: current fields; tennis: rankings + current draws) ----------
  async function players(sport) {
    if (sport === 'golf') {
      const b = await golfBoard(); const m = new Map();
      for (const t of b.tournaments) for (const p of t.players) if (!m.has(p.id)) m.set(p.id, { id: p.id, name: p.name, flag: p.flag, country: p.country, tour: t.tour, sport: 'golf' });
      return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (sport === 'tennis') {
      const [r, b] = await Promise.all([tennisRankings(), tennisBoard()]); const m = new Map();
      for (const p of r.polls) for (const x of p.ranks) m.set(x.player.id, { id: x.player.id, name: x.player.name, flag: x.player.flag, country: x.player.country, tour: p.id.toUpperCase(), rank: x.rank, sport: 'tennis' });
      for (const t of b.tournaments) for (const mt of t.matches) if (!/doubles/i.test(mt.draw || '')) for (const p of mt.players) if (p.id && !m.has(p.id)) m.set(p.id, { id: p.id, name: p.name, flag: p.flag, country: p.country, tour: t.tour, sport: 'tennis' });
      return [...m.values()].sort((a, b) => (a.tour.localeCompare(b.tour)) || ((a.rank || 9999) - (b.rank || 9999)) || a.name.localeCompare(b.name));
    }
    if (SPORTS[sport] && SPORTS[sport].kind === 'event') return eventPlayers(sport);
    return [];
  }

  // ---------- standings (NFL / MLB) ----------
  async function standings(sport) {
    if (!CORE_TEAM.includes(sport)) return genericStandings(sport);
    return cached(`standings:${sport}`, 30 * 60e3, async () => {
      const d = await fetchJSON(`${WEB}/${SPORTS[sport].path}/standings?level=3`);
      const groups = [];
      for (const lg of d.children || []) for (const dv of lg.children || []) {
        if (!dv.standings) continue;
        const rows = dv.standings.entries.map((e) => {
          const s = (n) => { const x = e.stats.find((k) => k.name === n || k.type === n); return x ? (x.displayValue ?? x.summary) : ''; };
          return { team: normTeam(e.team, sport), w: s('wins'), l: s('losses'), t: s('ties'), pct: s('winPercent'), gb: s('gamesBehind'), diff: s('differential') || s('pointDifferential'), streak: s('streak'), seed: s('playoffSeed') };
        }).sort((a, b) => parseFloat(b.pct) - parseFloat(a.pct));
        groups.push({ id: tid(sport, dv.id), name: shortConf(dv.name), league: lg.abbreviation || lg.name, rows });
      }
      return { sport, groups, season: d.seasons && d.seasons[0] && d.seasons[0].displayName };
    });
  }

  // ---------- Gamecast: team sports ----------
  const pct = (x) => (x == null ? null : Math.round(x * 1000) / 10);
  function downsample(arr, n) { if (arr.length <= n) return arr; const out = []; for (let i = 0; i < n; i++) out.push(arr[Math.round((i * (arr.length - 1)) / (n - 1))]); return out; }

  function headerSides(d, sport) {
    const h = d.header.competitions[0];
    const side = (ha) => {
      const x = h.competitors.find((k) => k.homeAway === ha) || {};
      const rec = (x.record || []).find((r) => r.type === 'total') || (x.record || [])[0];
      return { team: normTeam(x.team, sport), score: x.score ?? null, winner: !!x.winner, record: rec ? rec.summary || rec.displayValue : null,
        rank: x.rank && x.rank < 99 ? x.rank : null, possession: !!x.possession,
        lines: (x.linescores || []).map((l) => l.displayValue ?? l.value), hits: x.hits ?? null, errors: x.errors ?? null };
    };
    const st = h.status || {};
    return { h, st, home: side('home'), away: side('away') };
  }

  // Player box score for both teams (every group ESPN sends: passing/rushing/…, batting/pitching, skaters/goalies …)
  function boxOf(d, sport, home, { cols = 9 } = {}) {
    const sp = SPORTS[sport];
    const PREF = { hockey: { goalies: ['SA', 'GA', 'SV', 'SV%', 'TOI'], _: ['G', 'A', 'SOG', '+/-', 'TOI', 'PIM', 'HT', 'BS'] } };
    const side = (id) => (String(id) === String(home && home.team && home.team.espnId) ? 'home' : 'away');
    return ((d.boxscore && d.boxscore.players) || []).map((t) => ({ teamId: tid(sport, t.team.id), abbr: t.team.abbreviation, side: side(t.team.id), logo: t.team.logo || null,
      groups: (t.statistics || []).map((g) => { const labels = g.labels || []; const pref = PREF[sp.family] && (PREF[sp.family][g.name] || PREF[sp.family]._);
        const ix = pref ? pref.map((l) => labels.indexOf(l)).filter((i) => i >= 0) : labels.slice(0, cols).map((_, i) => i);
        const nm = g.text ? g.text.replace(new RegExp(`^(${[t.team.displayName, t.team.location, t.team.shortDisplayName].filter(Boolean).map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s+`), '') : (g.name || g.type || '');
        return { name: nm, labels: ix.map((i) => labels[i]), descs: ix.map((i) => (g.descriptions || [])[i] || ''),
          totals: (g.totals || []).length ? ix.map((i) => g.totals[i]) : null,
          rows: (g.athletes || []).filter((a) => a.athlete && (a.stats || []).length).map((a) => ({ id: ath(sport, a.athlete), name: a.athlete.shortName || a.athlete.displayName, full: a.athlete.displayName, pos: a.athlete.position && a.athlete.position.abbreviation, starter: !!a.starter, headshot: a.athlete.headshot && a.athlete.headshot.href, stats: ix.map((i) => a.stats[i]) })) }; }).filter((g) => g.rows.length) })).filter((t) => t.groups.length)
      .sort((a, b) => (a.side === 'away' ? -1 : 1) - (b.side === 'away' ? -1 : 1));
  }
  async function footballCast(sport, id) {
    const d = await fetchJSON(`${SITE}/${SPORTS[sport].path}/summary?event=${id}`);
    const { h, st, home, away } = headerSides(d, sport);
    const state = st.type.state;
    const gi = d.gameInfo || {};
    const out = {
      kind: 'football', sport, id, state, detail: st.type.detail, short: st.type.shortDetail, clock: st.displayClock, period: st.period, date: h.date,
      venue: venueOf(gi.venue), attendance: gi.attendance || null, broadcast: broadcastsOf(h) || (d.broadcasts || []).map((b) => b.media && b.media.shortName).filter(Boolean).join(', ') || null, nets: netsOf(h, d.broadcasts),
      home, away, note: d.header.gameNote || (h.notes || []).map((n) => n.headline).filter(Boolean)[0] || null, link: gameLink(sport, id),
    };
    // scoring summary
    out.scoring = (d.scoringPlays || []).map((p) => ({ period: p.period && p.period.number, clock: p.clock && p.clock.displayValue, teamId: p.team && tid(sport, p.team.id),
      abbr: p.team && p.team.abbreviation, type: p.type && (p.type.abbreviation || p.type.text), text: p.text, away: p.awayScore, home: p.homeScore }));
    // drives (latest first)
    const drv = (x, current) => ({
      id: x.id, current, teamId: x.team && tid(sport, x.team.id), abbr: x.team && x.team.abbreviation, description: x.description, result: x.displayResult || x.result || (current ? 'In progress' : ''),
      score: !!x.isScore, start: x.start && x.start.text, period: x.start && x.start.period && x.start.period.number, clock: x.start && x.start.clock && x.start.clock.displayValue,
      plays: (x.plays || []).map((p) => ({ text: p.text, clock: p.clock && p.clock.displayValue, period: p.period && p.period.number, dd: p.start && p.start.downDistanceText, score: !!p.scoringPlay, type: p.type && p.type.text })),
    });
    const drives = [...((d.drives && d.drives.previous) || []).map((x) => drv(x, false))];
    if (d.drives && d.drives.current) { const cur = drv(d.drives.current, state === 'in'); if (!drives.some((x) => x.id === cur.id)) drives.push(cur); else if (state === 'in') drives[drives.findIndex((x) => x.id === cur.id)] = cur; }
    out.drives = drives.reverse();
    // live situation
    if (state === 'in') {
      const ev = await rawScoreboardEvent(sport, id);
      const s = (ev && ev.competitions[0].situation) || d.situation || {};
      const lastDrive = d.drives && (d.drives.current || (d.drives.previous || []).slice(-1)[0]);
      const lastPlay = lastDrive && lastDrive.plays && lastDrive.plays.slice(-1)[0];
      const possId = s.possession || (lastPlay && lastPlay.end && lastPlay.end.team && lastPlay.end.team.id) || (lastDrive && lastDrive.team && lastDrive.team.id);
      const possTeam = [home, away].find((x) => x.team && x.team.espnId === String(possId));
      let ytg = null; // yards to the end zone for the offense
      const pt = s.possessionText || (lastPlay && lastPlay.end && lastPlay.end.possessionText);
      const m = pt && pt.match(/^([A-Z&]+)\s+(\d+)$/);
      if (pt && /50$/.test(pt) && !m) ytg = 50;
      if (m && possTeam) ytg = m[1] === possTeam.team.abbr ? 100 - +m[2] : +m[2];
      if (ytg == null && lastPlay && lastPlay.end && lastPlay.end.yardsToEndzone != null) ytg = lastPlay.end.yardsToEndzone;
      out.situation = {
        down: s.down ?? (lastPlay && lastPlay.end && lastPlay.end.down), distance: s.distance ?? (lastPlay && lastPlay.end && lastPlay.end.distance),
        text: s.downDistanceText || (lastPlay && lastPlay.end && lastPlay.end.downDistanceText) || null, spot: pt || null,
        possession: possTeam ? possTeam.team.id : null, possessionSide: possTeam ? (possTeam === home ? 'home' : 'away') : null,
        yardsToEndzone: ytg, redZone: !!s.isRedZone || (ytg != null && ytg <= 20),
        lastPlay: (s.lastPlay && s.lastPlay.text) || (lastPlay && lastPlay.text) || null,
        homeTimeouts: s.homeTimeouts ?? null, awayTimeouts: s.awayTimeouts ?? null,
      };
    }
    // win probability (ESPN model) — numbers only
    const wp = (d.winprobability || []).map((x) => pct(x.homeWinPercentage));
    out.wp = wp.length ? { home: downsample(wp, 120), current: wp[wp.length - 1] } : null;
    // team stats
    const bt = (d.boxscore && d.boxscore.teams) || [];
    const ta = bt.find((x) => x.homeAway === 'away') || bt[0]; const th = bt.find((x) => x.homeAway === 'home') || bt[1];
    out.stats = ta && th ? (ta.statistics || []).map((s) => ({ label: s.label, away: s.displayValue, home: ((th.statistics || []).find((k) => k.name === s.name) || {}).displayValue }))
      .filter((s) => !/^(Passing 1st downs|Rushing 1st downs|1st downs from penalties|Defensive \/ Special Teams TDs)$/i.test(s.label)) : [];
    out.box = boxOf(d, sport, home, { cols: 12 });
    // leaders
    out.leaders = (d.leaders || []).map((tm) => ({ teamId: tm.team && tid(sport, tm.team.id), abbr: tm.team && tm.team.abbreviation,
      cats: (tm.leaders || []).map((c) => ({ cat: c.displayName, id: c.leaders && c.leaders[0] && ath(sport, c.leaders[0].athlete), name: c.leaders && c.leaders[0] && c.leaders[0].athlete && c.leaders[0].athlete.shortName, line: c.leaders && c.leaders[0] && c.leaders[0].displayValue })).filter((c) => c.name) }));
    return out;
  }

  async function baseballCast(id, sport = 'mlb') {
    const d = await fetchJSON(`${SITE}/${SPORTS[sport].path}/summary?event=${id}`);
    const { h, st, home, away } = headerSides(d, sport);
    const state = st.type.state; const gi = d.gameInfo || {};
    const out = { kind: 'baseball', sport, id, state, detail: st.type.detail, short: st.type.shortDetail, period: st.period, date: h.date,
      venue: venueOf(gi.venue), attendance: gi.attendance || null, broadcast: broadcastsOf(h) || null, nets: netsOf(h, d.broadcasts), home, away, link: gameLink(sport, id),
      note: d.header.gameNote || null };
    const ev = await rawScoreboardEvent(sport, id, h.date).catch(() => null);
    const evc = ev && ev.competitions[0];
    if (evc && evc.series && evc.series.summary && !/starts/i.test(evc.series.summary)) out.note = [out.note, evc.series.summary].filter(Boolean).join(' · ');
    // probable starters (pre-game)
    if (evc && state === 'pre') out.probables = evc.competitors.map((c) => {
      const p = (c.probables || []).find((x) => x.athlete) || {};
      const rec = (p.statistics || []).map((x) => x.abbreviation === 'ERA' ? `${x.displayValue} ERA` : null).filter(Boolean)[0] || (p.record || '');
      return { side: c.homeAway, abbr: c.team && c.team.abbreviation, name: p.athlete && p.athlete.displayName, line: rec };
    }).filter((x) => x.name);
    // plays grouped by half-inning (latest first), at-bat results only
    const halves = []; let cur = null;
    for (const p of d.plays || []) {
      const label = p.period && `${p.period.type} ${p.period.displayValue ? p.period.displayValue.replace(' Inning', '') : p.period.number}`;
      if (!cur || cur.label !== label) { cur = { label, items: [] }; halves.push(cur); }
      const t = p.type && p.type.type || '';
      if (!p.text || /^(start|end)-/.test(t) || /^Pitch \d+/.test(p.text) || t === 'play-result' && false) continue;
      if (/^(ball|strike|foul|ball---|strike-)/.test(t) && !/play-result/.test(t)) continue;
      cur.items.push({ text: p.text, score: !!p.scoringPlay, away: p.awayScore, home: p.homeScore, outs: p.outs });
    }
    out.plays = halves.filter((x) => x.items.length).reverse().map((x) => ({ ...x, items: x.items.reverse() }));
    out.scoring = (d.plays || []).filter((p) => p.scoringPlay && p.text).map((p) => ({ inning: p.period && `${p.period.type} ${p.period.displayValue ? p.period.displayValue.replace(' Inning', '') : p.period.number}`, text: p.text, away: p.awayScore, home: p.homeScore }));
    // live situation
    if (state === 'in') {
      const s = (evc && evc.situation) || d.situation || {};
      const last = (d.plays || []).slice(-1)[0] || {};
      const who = (x) => x && x.athlete ? { name: x.athlete.shortName || x.athlete.displayName, line: x.summary || null } : null;
      out.situation = {
        balls: s.balls ?? (last.resultCount && last.resultCount.balls) ?? 0, strikes: s.strikes ?? (last.resultCount && last.resultCount.strikes) ?? 0, outs: s.outs ?? last.outs ?? 0,
        on1: !!s.onFirst, on2: !!s.onSecond, on3: !!s.onThird, pitcher: who(s.pitcher), batter: who(s.batter),
        lastPlay: (s.lastPlay && s.lastPlay.text) || null, runnersKnown: !!(evc && evc.situation),
      };
    }
    const wp = (d.winprobability || []).map((x) => pct(x.homeWinPercentage));
    out.wp = wp.length ? { home: downsample(wp, 120), current: wp[wp.length - 1] } : null;
    // team batting/pitching lines
    const bt = (d.boxscore && d.boxscore.teams) || [];
    const pick = (t, grp, names) => { const g = (t.statistics || []).find((s) => s.name === grp); return names.map((n) => { const x = g && g.stats.find((k) => k.name === n || k.abbreviation === n); return x ? x.displayValue : '–'; }); };
    const ta = bt.find((x) => x.homeAway === 'away') || bt[0]; const th = bt.find((x) => x.homeAway === 'home') || bt[1];
    const rowsB = [['Hits', 'hits'], ['Home runs', 'homeRuns'], ['Walks', 'walks'], ['Strikeouts (batting)', 'strikeouts'], ['Left on base', 'LOB'], ['Stolen bases', 'stolenBases']];
    out.stats = ta && th ? rowsB.map(([label, n]) => ({ label, away: pick(ta, 'batting', [n])[0], home: pick(th, 'batting', [n])[0] })).filter((r) => r.away !== '–' || r.home !== '–') : [];
    out.box = boxOf(d, sport, home, { cols: 14 });
    // pitchers used (from box score players)
    out.pitchers = ((d.boxscore && d.boxscore.players) || []).map((t) => {
      const g = (t.statistics || []).find((s) => s.type === 'pitching'); if (!g) return null;
      const ix = (k) => g.keys.indexOf(k);
      return { abbr: t.team.abbreviation, side: (t.team.id === (home.team && home.team.espnId)) ? 'home' : 'away',
        rows: g.athletes.map((a) => ({ name: a.athlete.shortName || a.athlete.displayName, ip: a.stats[ix('fullInnings.partInnings')], h: a.stats[ix('hits')], r: a.stats[ix('runs')], er: a.stats[ix('earnedRuns')], bb: a.stats[ix('walks')], k: a.stats[ix('strikeouts')], note: a.notes && a.notes[0] && a.notes[0].text })) };
    }).filter(Boolean);
    return out;
  }

  async function gamecast(sport, id) {
    const key = `cast:${sport}:${id}`;
    const prev = cache.get(key);
    const live = prev && prev.value && prev.value.state === 'in';
    return cached(key, live ? 12e3 : (prev && prev.value && prev.value.state === 'post' ? 5 * 60e3 : 60e3), async () => {
      if (sport === 'cfb' || sport === 'nfl') return footballCast(sport, String(id).replace(/\D/g, ''));
      if (sport === 'mlb') return baseballCast(String(id).replace(/\D/g, ''));
      const sp = SPORTS[sport];
      if (sp && sp.kind === 'team' && sp.family === 'baseball') return baseballCast(String(id).replace(/\D/g, ''), sport);
      if (sp && sp.kind === 'team') return genericCast(sport, String(id).replace(/\D/g, ''));
      if (sp && sp.kind === 'event') return eventCast(sport, String(id).replace(/\D/g, ''));
      if (sport === 'golf') return golfCast(id);
      if (sport === 'tennis') return tennisCast(id);
      throw new Error('Unknown sport');
    });
  }

  // ---------- team page (all team sports) ----------
  async function teamPage(rawId) {
    const m = String(rawId).match(/^(?:([a-z0-9]+):)?(\d+)$/); if (!m) throw new Error('bad team id');
    const sport = m[1] || 'cfb'; if (!SPORTS[sport] || SPORTS[sport].kind !== 'team') throw new Error('bad team id'); const id = m[2]; const base = `${SITE}/${SPORTS[sport].path}`;
    return cached(`team:${sport}:${id}`, 5 * 60e3, async () => {
      const seasontype = sport === 'mlb' ? '' : '';
      const [info, sched, sched3] = await Promise.all([
        fetchJSON(`${base}/teams/${id}`),
        fetchJSON(`${base}/teams/${id}/schedule${seasontype}`),
        sport === 'mlb' ? fetchJSON(`${base}/teams/${id}/schedule?seasontype=3`).catch(() => null) : Promise.resolve(null),
      ]);
      const stats = sport === 'cfb' ? await fetchJSON(`${base}/teams/${id}/statistics`).catch(() => null) : null;
      const t = info.team;
      const rec = (t.record && t.record.items) || [];
      const recStat = (n) => { const s = (rec[0] && rec[0].stats || []).find((x) => x.name === n); return s ? s.value : null; };
      const statGroups = [];
      if (stats && stats.results && stats.results.stats) {
        const pick = { passing: ['netPassingYards', 'passingTouchdowns', 'interceptions', 'completionPct'], rushing: ['rushingYards', 'yardsPerRushAttempt', 'rushingTouchdowns'],
          miscellaneous: ['firstDowns', 'thirdDownConvPct', 'fourthDownConvPct', 'totalPenaltiesYards', 'turnOverDifferential'],
          defensive: ['totalTackles', 'sacks', 'tacklesForLoss'], defensiveInterceptions: ['interceptions'], kicking: ['fieldGoalsMade', 'fieldGoalAttempts', 'fieldGoalPct'], scoring: ['totalPoints', 'totalTouchdowns', 'totalPointsPerGame'] };
        const LABELS = { totalPenaltiesYards: 'Penalties–yards', thirdDownConvPct: '3rd-down conversion %', fourthDownConvPct: '4th-down conversion %', turnOverDifferential: 'Turnover margin', firstDowns: 'First downs', fieldGoalsMade: 'Field goals made' };
        for (const cat of stats.results.stats.categories) {
          const want = pick[cat.name]; if (!want) continue;
          const items = want.map((n) => cat.stats.find((s) => s.name === n)).filter(Boolean).map((s) => ({ label: LABELS[s.name] || s.displayName, value: s.displayValue, rank: s.rankDisplayValue || null }));
          if (items.length) statGroups.push({ name: cat.displayName, items });
        }
      }
      let events = (sched.events || []).map((e) => normEvent(e, sport));
      if (sched3) events = events.concat((sched3.events || []).map((e) => normEvent(e, sport)));
      if (sport === 'mlb') events = events.filter((e) => e.state !== 'post' || Date.now() - Date.parse(e.date) < 21 * 864e5 || e.note); // recent + postseason only
      return {
        sport,
        team: { ...normTeam(t, sport), standing: t.standingSummary, record: rec.map((r) => ({ type: r.type, desc: r.description, summary: r.summary })),
          ppg: sport === 'mlb' ? null : recStat('avgPointsFor'), oppg: sport === 'mlb' ? null : recStat('avgPointsAgainst'), conferenceId: t.groups && t.groups.id },
        schedule: events, stats: statGroups,
        roster: await roster(sport, id).catch(() => []),
      };
    });
  }

  // ================= Generic catalog sports (NBA, NHL, soccer, college hoops, UFC, racing…) =================
  const dayExtra = (sp) => (/college-basketball/.test(sp.path) ? '&groups=50&limit=400' : '&limit=300');
  const ath = (sport, a) => (a && a.id ? `${sport}:a${a.id}` : null);

  // Teams + groups (conference / division / table) from the generic standings tree; teams outside it go to "Other".
  async function genericTeams(sport) {
    const sp = SPORTS[sport];
    if (!sp || sp.kind !== 'team') throw new Error('not a team sport');
    return cached(`teams:${sport}`, 6 * 3600e3, async () => {
      const [st, tl] = await Promise.all([fetchJSON(`${WEB}/${sp.path}/standings`).catch(() => null), fetchJSON(`${SITE}/${sp.path}/teams?limit=1000`).catch(() => null)]);
      if (!st && !tl) throw new Error('ESPN teams unavailable');
      const conferences = []; const teams = new Map();
      const nodes = []; const walk = (n, parent) => { if (n.standings && (n.standings.entries || []).length) nodes.push({ n, parent }); (n.children || []).forEach((c) => walk(c, n.abbreviation || n.name)); };
      if (st) walk(st, null);
      const single = nodes.length === 1;
      for (const { n, parent } of nodes) {
        const conf = { id: tid(sport, n.id || n.abbreviation || n.name), name: single ? sp.name : n.name, short: single ? sp.short : shortConf(n.name || ''), parent: single ? null : parent };
        conferences.push(conf);
        for (const e of n.standings.entries) {
          const stat = (k) => { const s = (e.stats || []).find((x) => x.type === k || x.name === k); return s && (s.displayValue || s.summary); };
          if (!teams.has(String(e.team.id))) teams.set(String(e.team.id), { ...normTeam(e.team, sport), conferenceId: conf.id, conference: conf.short, record: stat('total') || stat('overall') || null, streak: stat('streak') || null, seed: stat('playoffSeed') || null });
        }
      }
      const list = (tl && tl.sports && tl.sports[0].leagues[0].teams) || [];
      let other = null;
      for (const { team: x } of list) {
        const have = teams.get(String(x.id));
        if (have) { have.color = x.color; have.alt = x.alternateColor; if (!have.logo) { have.logo = logoOf(x, sport); have.logoDark = logoDarkOf(x, sport); } continue; }
        if (!other) { other = { id: tid(sport, 'other'), name: conferences.length ? 'Other teams' : sp.name, short: conferences.length ? 'Other' : sp.short }; conferences.push(other); }
        teams.set(String(x.id), { ...normTeam(x, sport), color: x.color, alt: x.alternateColor, conferenceId: other.id, conference: other.short });
      }
      const out = [...teams.values()].sort((a, b) => a.location.localeCompare(b.location) || a.name.localeCompare(b.name));
      return { sport, conferences, teams: out };
    });
  }

  // Daily sports: ESPN rejects ranges for most leagues, so fetch day by day (past days cache longer).
  async function dailyBoard(sport, q = {}) {
    const sp = SPORTS[sport];
    const fam = sp.family; const back = fam === 'soccer' ? 4 : 3; const fwd = fam === 'soccer' ? 7 : 4;
    const now = Date.now(); const today = ymd(new Date(now));
    const days = q.dates && /^\d{8}$/.test(q.dates) ? [q.dates] : Array.from({ length: back + fwd + 1 }, (_, i) => ymd(new Date(now + (i - back) * 864e5)));
    const per = await Promise.all(days.map((dt) => cached(`day:${sport}:${dt}`, dt < today ? 30 * 60e3 : 20e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?dates=${dt}${dayExtra(sp)}`)).catch(() => ({ events: [] }))));
    const seen = new Set(); const events = [];
    for (const d of per) for (const e of d.events || []) if (!seen.has(e.id)) { seen.add(e.id); events.push(normEvent(e, sport)); }
    let s0 = per.find((d) => d.season) || {};
    if (!events.length) { // off-season / break: show whatever ESPN lists by default
      const d = await cached(`sbdef:${sport}`, 10 * 60e3, () => fetchJSON(`${SITE}/${sp.path}/scoreboard?limit=300`)).catch(() => ({ events: [] }));
      for (const e of d.events || []) events.push(normEvent(e, sport)); s0 = d.season ? d : s0;
    }
    events.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
    return { sport, season: s0.season, seasontype: s0.season && s0.season.type, calendar: [], days, events, fetchedAt: new Date().toISOString() };
  }

  // Generic team-sport gamecast: score, periods, team stats, box score, plays/key events, leaders, win probability.
  async function genericCast(sport, id) {
    const sp = SPORTS[sport];
    const d = await fetchJSON(`${SITE}/${sp.path}/summary?event=${id}`);
    const { h, st, home, away } = headerSides(d, sport);
    const state = st.type.state; const gi = d.gameInfo || {};
    const out = { kind: 'generic', family: sp.family, sport, id, state, detail: st.type.detail, short: st.type.shortDetail, clock: st.displayClock, period: st.period, date: h.date,
      venue: venueOf(gi.venue), attendance: gi.attendance || null, broadcast: broadcastsOf(h) || null, nets: netsOf(h, d.broadcasts), home, away, link: gameLink(sport, id),
      note: (d.header && d.header.gameNote) || (h.notes || []).map((n) => n.headline).filter(Boolean)[0] || null };
    const teamSide = (teamId) => (String(teamId) === home.team.espnId ? 'home' : String(teamId) === away.team.espnId ? 'away' : null);
    const bt = (d.boxscore && d.boxscore.teams) || [];
    const ta = bt.find((x) => x.homeAway === 'away' || teamSide(x.team && x.team.id) === 'away'); const th = bt.find((x) => x.homeAway === 'home' || teamSide(x.team && x.team.id) === 'home');
    out.stats = ta && th ? (ta.statistics || []).filter((s) => s.label && s.displayValue != null).map((s) => ({ label: s.label, away: s.displayValue, home: ((th.statistics || []).find((k) => k.name === s.name) || {}).displayValue ?? '–' })).slice(0, 16) : [];
    out.box = boxOf(d, sport, home, { cols: 9 });
    // Soccer line-ups
    out.lineups = (d.rosters || []).map((r) => ({ teamId: r.team && tid(sport, r.team.id), abbr: r.team && r.team.abbreviation, side: r.homeAway || teamSide(r.team && r.team.id), formation: r.formation || null,
      players: (r.roster || []).filter((p) => p.athlete).map((p) => ({ id: ath(sport, p.athlete), name: p.athlete.displayName, jersey: p.jersey, pos: p.position && p.position.abbreviation, starter: !!p.starter, subbedIn: !!p.subbedIn, headshot: p.athlete.headshot && p.athlete.headshot.href })) })).filter((r) => r.players.length);
    const play = (p) => ({ text: p.text || (p.type && p.type.text) || '', clock: p.clock && p.clock.displayValue, period: p.period && p.period.number, periodLabel: p.period && p.period.displayValue,
      score: !!p.scoringPlay, away: p.awayScore, home: p.homeScore, type: p.type && p.type.text, teamId: p.team && p.team.id ? tid(sport, p.team.id) : null,
      ath: (p.participants || []).map((x) => ath(sport, x.athlete)).filter(Boolean) });
    if (sp.family === 'soccer') out.plays = (d.keyEvents || []).map(play).filter((p) => p.text).reverse();
    else { const all = (d.plays || []).map(play).filter((p) => p.text); const recent = all.slice(-80); out.plays = [...all.filter((p, i) => p.score && i < all.length - 80), ...recent].reverse(); }
    out.scoring = sp.family === 'soccer' ? out.plays.filter((p) => p.score).reverse() : (d.scoringPlays || []).map(play).filter((p) => p.text);
    if (!out.scoring.length && sp.family === 'hockey') out.scoring = (d.plays || []).filter((p) => p.scoringPlay).map(play);
    out.leaders = (d.leaders || []).map((tm) => ({ teamId: tm.team && tid(sport, tm.team.id), abbr: tm.team && tm.team.abbreviation,
      cats: (tm.leaders || []).map((c) => { const l = c.leaders && c.leaders[0]; return { cat: c.displayName, name: l && l.athlete && (l.athlete.shortName || l.athlete.displayName), id: l && ath(sport, l.athlete), line: l && l.displayValue }; }).filter((c) => c.name) })).filter((t) => t.cats.length);
    const wp = (d.winprobability || []).map((x) => pct(x.homeWinPercentage));
    out.wp = wp.length > 1 ? { home: downsample(wp, 120), current: wp[wp.length - 1] } : null;
    return out;
  }

  // ---------- event sports (UFC fight cards, F1 / NASCAR / IndyCar sessions) ----------
  function normCard(ev, sport) {
    const sp = SPORTS[sport]; const racing = sp.family === 'racing';
    const comps = (ev.competitions || []).map((c) => {
      const cs = (c.competitors || []).map((x) => { const a = x.athlete || {}; return { id: `${sport}:a${x.id || a.id}`, name: a.displayName || a.fullName || (x.team && x.team.displayName) || '', short: a.shortName || a.displayName || '',
        flag: (a.flag && a.flag.href) || '', country: (a.flag && a.flag.alt) || '', headshot: (a.headshot && a.headshot.href) || '', order: x.order ?? null, winner: !!x.winner,
        record: (x.records && x.records[0] && x.records[0].summary) || null, score: x.score ?? null, team: (x.team && x.team.displayName) || null }; });
      if (racing) cs.sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
      const s = (c.status && c.status.type) || {};
      return { id: String(c.id), label: (c.type && (c.type.abbreviation || c.type.text)) || '', weight: (c.type && c.type.text) || '', date: c.date || c.startDate, state: s.state || 'pre', detail: s.shortDetail || s.detail || '',
        result: (c.status && c.status.result && (c.status.result.displayName || c.status.result.shortDisplayName)) || null, round: c.status && c.status.period, clock: c.status && c.status.displayClock,
        venue: venueOf(c.venue), nets: netsOf(c), competitors: cs };
    });
    const st = (ev.status && ev.status.type) || {};
    const states = comps.map((c) => c.state);
    const state = states.includes('in') ? 'in' : st.state || (states.length && states.every((x) => x === 'post') ? 'post' : 'pre');
    return { kind: 'event', family: sp.family, sport, id: String(ev.id), name: ev.name, short: ev.shortName || ev.name, date: ev.date, endDate: ev.endDate || null, state, detail: st.detail || '',
      venue: venueOf((ev.venues && ev.venues[0]) || (ev.competitions && ev.competitions[0] && ev.competitions[0].venue)), circuit: (ev.circuit && ev.circuit.fullName) || null,
      comps: sp.family === 'mma' ? comps.slice().reverse() : comps, nets: [...new Set([...netsOf(ev.competitions && ev.competitions[0], ev.broadcasts), ...comps.flatMap((c) => c.nets)])], link: `https://www.espn.com/${sp.espn}/` };
  }
  async function eventBoard(sport) {
    const sp = SPORTS[sport];
    return cached(`evb:${sport}`, 60e3, async () => {
      const d = await fetchJSON(`${SITE}/${sp.path}/scoreboard`);
      const lg = (d.leagues && d.leagues[0]) || {};
      const schedule = (lg.calendar || []).map((c) => (typeof c === 'string' ? { label: '', start: c } : { label: c.label, start: c.startDate, end: c.endDate, id: c.event && c.event.$ref && (c.event.$ref.match(/events\/(\d+)/) || [])[1] }));
      const events = (d.events || []).map((e) => normCard(e, sport));
      // Also show the most recent finished event when the current one hasn't started.
      const now = Date.now();
      if (events.length && events.every((e) => e.state === 'pre')) {
        const past = schedule.filter((c) => Date.parse(c.end || c.start) < now && !events.some((e) => e.id === c.id)).slice(-1)[0];
        if (past) { const pd = await fetchJSON(`${SITE}/${sp.path}/scoreboard?dates=${ymd(new Date(past.start))}`).catch(() => null);
          for (const e of (pd && pd.events) || []) if (!events.some((x) => x.id === String(e.id))) events.push(normCard(e, sport)); }
      }
      return { sport, kind: 'event', events, schedule, fetchedAt: new Date().toISOString() };
    });
  }
  async function eventCast(sport, id) {
    const b = await eventBoard(sport);
    let ev = b.events.find((e) => e.id === String(id));
    if (!ev) { const c = b.schedule.find((x) => x.id === String(id));
      if (c) { const d = await fetchJSON(`${SITE}/${SPORTS[sport].path}/scoreboard?dates=${ymd(new Date(c.start))}`).catch(() => null); const e = d && (d.events || []).find((x) => String(x.id) === String(id)); if (e) ev = normCard(e, sport); } }
    if (!ev) throw Object.assign(new Error('Event not found in ESPN’s current feed'), { status: 404 });
    return { ...ev, schedule: b.schedule };
  }
  async function eventPlayers(sport) {
    const b = await eventBoard(sport); const m = new Map();
    for (const e of b.events) for (const c of e.comps) for (const p of c.competitors) if (p.name && !m.has(p.id)) m.set(p.id, { id: p.id, name: p.name, flag: p.headshot || p.flag, country: p.country, team: p.team, sport });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---------- rosters & athlete search (player follows for every sport) ----------
  async function roster(sport, espnId) {
    const sp = SPORTS[sport]; if (!sp || sp.kind !== 'team') return [];
    return cached(`roster:${sport}:${espnId}`, 6 * 3600e3, async () => {
      const d = await fetchJSON(`${SITE}/${sp.path}/teams/${espnId}/roster`);
      let list = []; const a0 = d.athletes || [];
      if (a0[0] && a0[0].items) for (const g of a0) for (const a of g.items) list.push(a); else list = a0;
      return list.filter((a) => a && a.id).map((a) => ({ id: `${sport}:a${a.id}`, name: a.displayName || a.fullName, short: a.shortName || a.displayName, pos: a.position && a.position.abbreviation, jersey: a.jersey || null,
        headshot: (a.headshot && a.headshot.href) || '', team: tid(sport, espnId) })).sort((x, y) => (x.name || '').localeCompare(y.name || ''));
    });
  }
  async function athleteSearch(sport, q) {
    const sp = SPORTS[sport]; q = String(q || '').trim().slice(0, 60);
    if (!sp || q.length < 2) return [];
    const [fam, league] = sp.path ? sp.path.split('/') : [sport, sport];
    const d = await cached(`as:${q.toLowerCase()}`, 3600e3, () => fetchJSON(`https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=50&type=player`));
    let teamIds = null;
    if (sp.kind === 'team' && fam === 'soccer') teamIds = new Set((await getTeams(sport)).teams.map((t) => t.espnId));
    const items = (d.items || []).filter((i) => {
      if (sp.kind === 'golf') return i.sport === 'golf';
      if (sp.kind === 'tennis') return i.sport === 'tennis';
      if (i.sport !== fam) return false;
      if (teamIds) return (i.teamRelationships || []).some((t) => teamIds.has(String((t.core && t.core.id) || t.id)));
      if (fam === 'mma') return true;
      return i.league === league;
    });
    return items.slice(0, 25).map((i) => { const t = (i.teamRelationships || [])[0]; const tId = t && ((t.core && t.core.id) || t.id);
      const pre = sp.kind === 'golf' || sp.kind === 'tennis' ? `${sport}:` : `${sport}:a`;
      return { id: `${pre}${i.id}`, name: i.displayName, team: t ? t.displayName.replace(/\s*\(.*\)$/, '') : null, teamId: sp.kind === 'team' && tId ? tid(sport, tId) : null,
        pos: i.position && (i.position.abbreviation || i.position), headshot: (i.headshot && i.headshot.href) || (i.flag && i.flag.href) || '', active: i.isActive !== false }; });
  }

  // ---------- polls (college basketball AP / Coaches) ----------
  async function polls(sport) {
    const sp = SPORTS[sport];
    return cached(`polls:${sport}`, 20 * 60e3, async () => {
      const d = await fetchJSON(`${SITE}/${sp.path}/rankings`);
      return { sport, polls: (d.rankings || []).filter((r) => ['ap', 'usa', 'cfp'].includes(r.type)).map((r) => ({ id: r.type, name: r.name, headline: r.headline, date: r.date,
        ranks: (r.ranks || []).map((x) => ({ rank: x.current, previous: x.previous, points: x.points, fpv: x.firstPlaceVotes, trend: x.trend, record: x.recordSummary, team: normTeam(x.team, sport) })),
        others: (r.others || []).map((x) => ({ points: x.points, team: normTeam(x.team, sport) })) })) };
    });
  }

  // ---------- generic standings (tables with sport-appropriate columns) ----------
  async function genericStandings(sport) {
    const sp = SPORTS[sport];
    return cached(`standings:${sport}`, 30 * 60e3, async () => {
      const d = await fetchJSON(`${WEB}/${sp.path}/standings`);
      const COLS = { soccer: [['GP', 'gamesPlayed'], ['W', 'wins'], ['D', 'ties'], ['L', 'losses'], ['GD', 'pointDifferential'], ['PTS', 'points']],
        hockey: [['GP', 'gamesPlayed'], ['W', 'wins'], ['L', 'losses'], ['OTL', 'otLosses'], ['PTS', 'points'], ['STRK', 'streak']],
        basketball: [['W', 'wins'], ['L', 'losses'], ['PCT', 'winPercent'], ['GB', 'gamesBehind'], ['STRK', 'streak']],
        baseball: [['W', 'wins'], ['L', 'losses'], ['PCT', 'winPercent'], ['GB', 'gamesBehind']] }[sp.family] || [['W', 'wins'], ['L', 'losses'], ['PCT', 'winPercent']];
      const nodes = []; const walk = (n, parent) => { if (n.standings && (n.standings.entries || []).length) nodes.push({ n, parent }); (n.children || []).forEach((c) => walk(c, n.abbreviation || n.name)); };
      walk(d, null);
      const groups = nodes.map(({ n, parent }) => {
        const rows = n.standings.entries.map((e) => { const s = (k) => { const x = (e.stats || []).find((y) => y.name === k || y.type === k); return x ? (x.displayValue ?? x.summary ?? '') : ''; };
          const rank = parseFloat(s('rank')) || parseFloat(s('playoffSeed')) || null;
          return { team: normTeam(e.team, sport), cells: COLS.map(([, k]) => s(k)), rank, pts: parseFloat(s('points')) || 0, pct: parseFloat(s('winPercent')) || 0, note: e.note && e.note.description }; });
        rows.sort((a, b) => (sp.family === 'soccer' || sp.family === 'hockey' ? (a.rank && b.rank ? a.rank - b.rank : b.pts - a.pts) : b.pct - a.pct));
        return { id: tid(sport, n.id || n.name), name: nodes.length === 1 ? sp.name : shortConf(n.name || ''), league: nodes.length === 1 ? null : parent, rows };
      });
      return { sport, cols: COLS.map(([l]) => l), groups, season: d.seasons && d.seasons[0] && d.seasons[0].displayName };
    });
  }
  return { SPORTS, getTeams, eventBoard, roster, athleteSearch, polls, eventPlayers, teamScoreboard, golfBoard, tennisBoard, tennisRankings, players, standings, gamecast, teamPage, normTeam, normEvent };
};
module.exports.SPORTS = SPORTS;
