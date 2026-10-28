// AUSL (Athletes Unlimited Softball League) provider.
//
// There is no ESPN feed for this league (site.api.espn.com has no /softball/ausl slug) and theausl.com's Terms of Service prohibit
// automated retrieval, so nothing here touches theausl.com. The data is:
//   - Wikipedia's "<year> AUSL season" article (CC BY-SA 4.0) via the MediaWiki API: the game log (scores, TV, venues) and the postseason.
//     Standings are COMPUTED from that game log (the article's own standings table is not reliably maintained).
//   - MLB's Stats API (statsapi.mlb.com, sport 576 = AUSL): team names / locations / venues, active rosters, logos.
//     MLB's terms allow individual, non-commercial, non-bulk use; this is a handful of small requests per day, cached, and attributed.
// Live play-by-play / box scores have no free, licensed source: the Gamecast says so instead of faking them.
// Everything is cached with a stale fallback and a bundled snapshot (data/ausl-2026.json) so a Wikipedia outage never blanks the sport.
const fs = require('fs');
const path = require('path');

const WIKI = process.env.AUSL_WIKI_BASE || 'https://en.wikipedia.org/w/api.php'; // env overrides exist only so QA can simulate the source being down
const MLB = process.env.AUSL_MLB_BASE || 'https://statsapi.mlb.com/api/v1';
const UA = 'OldSchoolSports/1.4.0 (https://straight-sports.onrender.com; sports scores reader; contact: repo github.com/justinctaylor77/straight-sports)';
const OFFICIAL = 'https://theausl.com';
const FIRST_YEAR = 2026; // the game-log layout this parser is verified against
const SPORT = 'ausl';
const LEAGUE_NAME = 'Athletes Unlimited Softball League';

// Fallback team table (MLB Stats API sport 576, league 6044, 2026). Colours are sampled from each team's official logo.
const STATIC_TEAMS = [
  { mlb: 6480, location: 'Chicago', nick: 'Bandits', abbr: 'CHI', venue: 'Parkway Bank Sports Complex', city: 'Rosemont, IL', color: 'E41E2D' },
  { mlb: 6479, location: 'Carolina', nick: 'Blaze', abbr: 'CAR', venue: 'Smith Family Stadium', city: 'Durham, NC', color: 'DB4699' },
  { mlb: 5547, location: 'Portland', nick: 'Cascade', abbr: 'PDX', venue: 'Hillsboro Ballpark Softball', city: 'Hillsboro, OR', color: '04203E' },
  { mlb: 1871, location: 'Oklahoma City', nick: 'Spark', abbr: 'OKC', venue: 'Tom Heath Field', city: 'Oklahoma City, OK', color: '274F8B' },
  { mlb: 6481, location: 'Utah', nick: 'Talons', abbr: 'UTA', venue: 'Dumke Family Softball Stadium', city: 'Salt Lake City, UT', color: '2A4F3A' },
  { mlb: 6478, location: 'Texas', nick: 'Volts', abbr: 'TEX', venue: 'Dell Diamond Softball', city: 'Round Rock, TX', color: '440099' },
];
const logoUrl = (mlb) => `https://www.mlbstatic.com/team-logos/${mlb}.svg`;
const tidOf = (mlb) => `${SPORT}:${mlb}`;

// ---------- pure helpers (unit-tested) ----------
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// Wall-clock Central Time -> UTC ms (handles daylight saving without a tz library).
function ctToUtc(y, mo, d, h, mi) {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hourCycle: 'h23', hour: 'numeric' });
  for (const off of [5, 6]) { const t = Date.UTC(y, mo - 1, d, h + off, mi); if (+fmt.format(new Date(t)) === h) return t; }
  return Date.UTC(y, mo - 1, d, h + 6, mi);
}
function stripWiki(s) {
  let t = String(s == null ? '' : s);
  t = t.replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
  for (let i = 0; i < 4 && /\{\{[^{}]*\}\}/.test(t); i++) t = t.replace(/\{\{[^{}]*\}\}/g, '');
  t = t.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return t.replace(/\s+/g, ' ').trim();
}
const parseTime = (s) => { const m = /(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m/i.exec(s || ''); if (!m) return null; let h = +m[1] % 12; if (/p/i.test(m[3])) h += 12; return { h, mi: +(m[2] || 0) }; };
const parseDate = (s) => { const m = /([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})/.exec(s || ''); const mo = m && MONTHS[m[1].toLowerCase()]; return mo ? { mo, d: +m[2] } : null; };
const pad = (n, w = 2) => String(n).padStart(w, '0');

// teams: [{id, nick, location, name}]
function findTeam(teams, name) {
  const n = String(name || '').toLowerCase().trim(); if (!n) return null;
  return teams.find((t) => n === t.nick.toLowerCase() || n === t.name.toLowerCase() || n.includes(t.nick.toLowerCase()) || n === t.location.toLowerCase()) || null;
}

// Parse the "Game log" tables of a "<year> AUSL season" article (layout: Date | Time (CT) | Visitor | Result | Home | TV | Location).
// Tolerant of the typos the article has (en dash vs hyphen, "(6)" short games, "(11)" extra innings, rowspan dates, templates in cells).
function parseGameLog(wikitext, year, teams) {
  const games = []; const warnings = [];
  const lines = String(wikitext || '').split(/\r?\n/);
  let section = null; let row = null; let lastDate = null; const perDay = new Map();
  const flush = () => {
    if (!row || !section) { row = null; return; }
    const cells = row.map((c) => c.replace(/^\s*(?:rowspan|colspan)\s*=\s*"?\d+"?\s*\|/i, '').trim());
    row = null;
    let date; let rest;
    if (cells.length >= 7) { date = cells[0]; rest = cells.slice(1); lastDate = date; } else if (cells.length === 6 && lastDate) { date = lastDate; rest = cells; } else { warnings.push(`skipped row with ${cells.length} cells in ${section.title}`); return; }
    const [time, vis, res, home, tv, loc] = rest;
    const dm = parseDate(stripWiki(date)); const away = findTeam(teams, stripWiki(vis)); const hm = findTeam(teams, stripWiki(home));
    if (!dm || !away || !hm) { warnings.push(`unreadable row: ${stripWiki(date)} / ${stripWiki(vis)} / ${stripWiki(home)}`); return; }
    const resText = stripWiki(res); const rawRes = String(res || '');
    const label = (/\(([^)]+)\)/.exec(stripWiki(date)) || [])[1] || null;
    const tm = parseTime(stripWiki(time)) || { h: 12, mi: 0, tbd: true };
    const key = `${year}${pad(dm.mo)}${pad(dm.d)}`; const n = (perDay.get(key) || 0) + 1; perDay.set(key, n);
    const sm = /(\d+)\s*[–—−-]\s*(\d+)/.exec(resText);
    const g = { id: `${key}${pad(n)}`, date: new Date(ctToUtc(year, dm.mo, dm.d, tm.h, tm.mi)).toISOString(), timeTbd: !!tm.tbd, away: away.id, home: hm.id,
      awayScore: null, homeScore: null, state: 'pre', detail: null, innings: null, post: /post/i.test(section.title), round: label,
      tv: stripWiki(tv) || null, venue: stripWiki(loc) || null };
    if (sm) {
      g.awayScore = +sm[1]; g.homeScore = +sm[2]; g.state = 'post';
      const im = /\((\d+)\)/.exec(rawRes.replace(/<\/?sup>/gi, '')) || /\((\d+)\)/.exec(resText); g.innings = im ? +im[1] : 7;
    } else if (/postpone|ppd|suspend|cancel/i.test(resText)) g.detail = /cancel/i.test(resText) ? 'Canceled' : /suspend/i.test(resText) ? 'Suspended' : 'Postponed';
    games.push(g);
  };
  for (const raw of lines) {
    const line = raw.trim();
    const sec = /^\{\{\s*Game log section start[^}]*?title\s*=\s*([^|]+)\|/i.exec(line);
    if (sec) { flush(); section = { title: sec[1].trim() }; row = null; continue; }
    if (/^\{\{\s*Game log section end/i.test(line) || /^\{\{\s*Game log end/i.test(line)) { flush(); section = null; continue; }
    if (!section) continue;
    if (line === '|-') { flush(); row = []; continue; }
    if (row && line.startsWith('|') && !line.startsWith('|}')) row.push(line.slice(1));
    else if (row && row.length && line && !line.startsWith('!') && !line.startsWith('{|')) row[row.length - 1] += ` ${line}`; // wrapped cell
  }
  flush();
  games.sort((a, b) => Date.parse(a.date) - Date.parse(b.date) || a.id.localeCompare(b.id));
  return { games, warnings };
}

// Standings from the regular-season games. Ties broken by head-to-head, then run differential (a display choice, not the league's rule).
function computeStandings(games, teams) {
  const rows = new Map(teams.map((t) => [t.id, { id: t.id, w: 0, l: 0, rs: 0, ra: 0, h2h: new Map(), last: [] }]));
  for (const g of games) {
    if (g.post || g.state !== 'post') continue;
    const h = rows.get(g.home); const a = rows.get(g.away); if (!h || !a) continue;
    h.rs += g.homeScore; h.ra += g.awayScore; a.rs += g.awayScore; a.ra += g.homeScore;
    const hw = g.homeScore > g.awayScore; const [wn, ls] = hw ? [h, a] : [a, h];
    wn.w++; ls.l++; wn.h2h.set(ls.id, (wn.h2h.get(ls.id) || 0) + 1);
    wn.last.push('W'); ls.last.push('L');
  }
  const list = [...rows.values()].map((r) => ({ ...r, gp: r.w + r.l, pct: r.w + r.l ? r.w / (r.w + r.l) : 0, diff: r.rs - r.ra }));
  list.sort((a, b) => b.pct - a.pct || ((b.h2h.get(a.id) || 0) - (a.h2h.get(b.id) || 0)) || b.diff - a.diff || a.id.localeCompare(b.id));
  const lead = list[0];
  for (const r of list) {
    r.gb = lead && lead.gp ? ((lead.w - r.w) + (r.l - lead.l)) / 2 : 0;
    let s = 0; const k = r.last[r.last.length - 1]; for (let i = r.last.length - 1; i >= 0 && r.last[i] === k; i--) s++;
    r.streak = k ? `${k}${s}` : '';
  }
  return list;
}

// Postseason -> a bracket the hub understands. Only what the log shows: no invented seeds, and the champion only once a series is decided.
const fmtShort = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric' }).format(new Date(iso));
function buildBracket(games, teams) {
  const post = games.filter((g) => g.post); if (!post.length) return null;
  const by = new Map(teams.map((t) => [t.id, t]));
  const slot = (id, score, winner) => ({ team: by.get(id) ? { id, name: by.get(id).name, short: by.get(id).short, logo: by.get(id).logo, color: by.get(id).color } : null, seed: null, score, winner });
  const rounds = new Map();
  for (const g of post) {
    const k = /play-?in/i.test(g.round || '') ? 'Play-in' : /champ/i.test(g.round || '') ? 'AUSL Championship Series' : (g.round || 'Postseason');
    if (!rounds.has(k)) rounds.set(k, []); rounds.get(k).push(g);
  }
  let champion = null; const out = [];
  for (const [name, gs] of rounds) {
    const series = /series/i.test(name);
    if (!series) {
      out.push({ name, matchups: gs.map((g) => { const d = g.state === 'post'; const hw = d && g.homeScore > g.awayScore;
        return { status: d ? 'final' : 'upcoming', summary: g.round && g.round !== name ? g.round : null, date: fmtShort(g.date), slots: [slot(g.away, d ? g.awayScore : null, d && !hw), slot(g.home, d ? g.homeScore : null, hw)] }; }) });
    } else {
      const ids = [...new Set(gs.flatMap((g) => [g.away, g.home]))]; const wins = Object.fromEntries(ids.map((i) => [i, 0]));
      for (const g of gs) if (g.state === 'post') wins[g.homeScore > g.awayScore ? g.home : g.away]++;
      const need = 2; const top = ids.slice().sort((a, b) => wins[b] - wins[a]); const decided = wins[top[0]] >= need;
      if (decided) champion = top[0];
      const played = gs.filter((g) => g.state === 'post');
      out.push({ name, matchups: [{ status: decided ? 'final' : played.length ? 'live' : 'upcoming', bestOf: 3, date: `${fmtShort(gs[0].date)}${gs.length > 1 ? ` – ${fmtShort(gs[gs.length - 1].date)}` : ''}`,
        summary: played.map((g) => `${by.get(g.away) ? by.get(g.away).short : '?'} ${g.awayScore}, ${by.get(g.home) ? by.get(g.home).short : '?'} ${g.homeScore}`).join(' · ') || null,
        slots: top.map((i) => ({ ...slot(i, null, decided && i === top[0]), wins: wins[i] })) }] });
    }
  }
  return { groups: [{ id: 'ausl', name: 'AUSL postseason', rounds: out }], finalRounds: [], champion: champion && by.get(champion) ? { id: champion, name: by.get(champion).name, short: by.get(champion).short, logo: by.get(champion).logo, color: by.get(champion).color } : null, real: true };
}

// ---------- the live provider ----------
function makeAusl({ cached }) {
  const SNAP = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'ausl-2026.json'), 'utf8')); } catch { return null; } })();
  async function get(url, ms = 9000) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal, redirect: 'follow' }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); } finally { clearTimeout(timer); }
  }
  const nowYear = () => +new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric' }).format(new Date());

  // Teams: MLB Stats API (names, venues), merged over the static table. Never fewer than the static six.
  async function loadTeams() {
    return cached('ausl:teams', 24 * 3600e3, async () => {
      let api = [];
      try { api = (await get(`${MLB}/teams?sportId=576&season=${Math.min(nowYear(), 2100)}`)).teams || []; } catch { /* static table */ }
      const out = STATIC_TEAMS.map((s) => {
        const a = api.find((x) => x.id === s.mlb) || {};
        const nick = a.teamName || s.nick; const loc = s.location; const name = a.name || `${loc} ${nick}`;
        return { id: tidOf(s.mlb), espnId: String(s.mlb), mlb: s.mlb, sport: SPORT, name, short: nick, location: loc, nick, mascot: nick, abbr: a.abbreviation || s.abbr, color: s.color,
          alt: 'ffffff', logo: logoUrl(s.mlb), logoDark: logoUrl(s.mlb), venue: (a.venue && a.venue.name) || s.venue, city: s.city, conference: 'AUSL', conferenceId: `${SPORT}:league` };
      });
      for (const a of api) if (a.active && a.league && a.league.id === 6044 && !out.some((t) => t.mlb === a.id)) { // a team added after this release
        out.push({ id: tidOf(a.id), espnId: String(a.id), mlb: a.id, sport: SPORT, name: a.name, short: a.teamName, location: a.locationName || a.name, nick: a.teamName, mascot: a.teamName, abbr: a.abbreviation,
          color: '1f6f5c', alt: 'ffffff', logo: logoUrl(a.id), logoDark: logoUrl(a.id), venue: (a.venue && a.venue.name) || null, city: null, conference: 'AUSL', conferenceId: `${SPORT}:league` });
      }
      return out;
    });
  }
  const teamsMap = async () => { const t = await loadTeams(); return { list: t, by: new Map(t.map((x) => [x.id, x])) }; };

  // Season: newest "<year> AUSL season" article with a readable game log; falls back to the bundled snapshot.
  async function fetchSeason(year, teams) {
    const d = await get(`${WIKI}?action=parse&page=${year}_AUSL_season&prop=wikitext&format=json&formatversion=2&redirects=1&origin=*`, 12000);
    const text = d && d.parse && d.parse.wikitext; if (!text) throw new Error('no article');
    const { games, warnings } = parseGameLog(text, year, teams);
    if (!games.length) throw new Error('no game log');
    return { year, games, warnings, source: 'wikipedia', fetchedAt: new Date().toISOString(), page: `https://en.wikipedia.org/wiki/${year}_AUSL_season` };
  }
  async function season() {
    const { list } = await teamsMap();
    const tryLive = async () => {
      for (let y = Math.max(FIRST_YEAR, nowYear() + 1); y >= FIRST_YEAR; y--) {
        try { return await fetchSeason(y, list); } catch { /* next */ }
      }
      throw new Error('AUSL season unavailable');
    };
    let s; let stale = false;
    try { s = await cached('ausl:season', 20 * 60e3, tryLive); } catch { s = null; }
    if (!s && SNAP) { s = { ...SNAP, source: 'snapshot' }; stale = true; }
    if (!s) throw Object.assign(new Error('AUSL data is temporarily unavailable'), { status: 502 });
    return { ...s, stale };
  }

  // ---------- shapes the app already understands ----------
  const side = (t, g, which, recs) => ({ team: t, score: g.state === 'post' ? (which === 'home' ? g.homeScore : g.awayScore) : null, rank: null, record: recs.get(t.id) || null,
    winner: g.state === 'post' ? (which === 'home' ? g.homeScore > g.awayScore : g.awayScore > g.homeScore) : false, conferenceId: t.conferenceId, probable: null });
  function toEvent(g, by, recs) {
    const home = by.get(g.home); const away = by.get(g.away); if (!home || !away) return null;
    const post = g.state === 'post'; const nets = g.tv ? g.tv.split(/\s*[,/&]\s*/).filter(Boolean) : [];
    const dr = g.detail || (post ? (g.innings && g.innings !== 7 ? `Final/${g.innings}` : 'Final') : null);
    return { sport: SPORT, id: g.id, date: g.date, name: `${away.name} at ${home.name}`, shortName: `${away.abbr} @ ${home.abbr}`, week: null, state: post ? 'post' : 'pre', detail: dr || '', completed: post, clock: null, period: null,
      home: side(home, g, 'home', recs), away: side(away, g, 'away', recs), venue: g.venue || home.venue || null, neutral: false, conferenceGame: false, broadcast: g.tv || null, nets,
      note: g.round ? (g.post ? `AUSL postseason · ${g.round}` : g.round) : (g.post ? 'AUSL postseason' : null), series: null, possession: null, downDistance: null, bases: null, link: `${OFFICIAL}/schedule/`, timeTbd: g.timeTbd || undefined };
  }
  // record AFTER each game, per team (regular season only; postseason shows the regular-season final)
  function recordsAfter(games) {
    const w = new Map(); const l = new Map(); const out = new Map();
    for (const g of games) { if (g.state !== 'post' || g.post) continue; const hw = g.homeScore > g.awayScore; const [a, b] = hw ? [g.home, g.away] : [g.away, g.home]; w.set(a, (w.get(a) || 0) + 1); l.set(b, (l.get(b) || 0) + 1); }
    for (const id of new Set([...w.keys(), ...l.keys()])) out.set(id, `${w.get(id) || 0}-${l.get(id) || 0}`);
    return out;
  }
  const seasonState = (s) => {
    const post = s.games.filter((g) => g.state === 'post'); const pre = s.games.filter((g) => g.state === 'pre' && !g.detail);
    if (!post.length) return 'preseason'; if (pre.length) return 'live'; return 'complete';
  };
  const dayKey = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date(iso));
  const fmtDay = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso));
  const attribution = 'Scores & schedule: Wikipedia (CC BY-SA 4.0). Teams, rosters & logos: MLB Stats API. Not affiliated with the AUSL.';

  async function getTeams() {
    const { list } = await teamsMap();
    return { sport: SPORT, conferences: [{ id: `${SPORT}:league`, name: LEAGUE_NAME, short: 'AUSL' }], teams: list.map(({ venue, city, mlb, ...t }) => t) };
  }

  // Scoreboard: this week's games when there are any, otherwise the most recent results (or the opening games before a season) with an honest banner.
  async function board() {
    const [s, { by }] = await Promise.all([season(), teamsMap()]);
    const recs = recordsAfter(s.games); const st = seasonState(s);
    const evs = s.games.map((g) => toEvent(g, by, recs)).filter(Boolean);
    const now = Date.now(); const near = evs.filter((e) => Date.parse(e.date) > now - 3 * 864e5 && Date.parse(e.date) < now + 4 * 864e5);
    let events = near; let notice = null;
    if (!near.length) {
      if (st === 'preseason') { events = evs.filter((e) => e.state === 'pre').slice(0, 8); notice = `${s.year} AUSL season hasn’t started. Here are the first scheduled games.`; }
      else {
        const done = evs.filter((e) => e.state === 'post'); const last = done.length ? done[done.length - 1] : null;
        if (st === 'complete') { events = done.slice(-8); notice = `Offseason. The ${s.year} AUSL season is over; here are its last games. The league plays in the summer (the ${s.year} season ran ${fmtDay(s.games[0].date)} – ${fmtDay(last.date)}). The next season’s dates aren’t published in a source we can verify yet.`; }
        else { events = evs.filter((e) => e.state !== 'post').slice(0, 6).concat(done.slice(-4)); notice = `No AUSL games in the next few days. ${s.year} season in progress.`; }
      }
    }
    if (s.stale) notice = `${notice ? `${notice} ` : ''}The live source couldn’t be reached, so this is a saved copy of the ${s.year} season.`;
    return { sport: SPORT, events, season: String(s.year), seasonState: st, notice, attribution, links: [{ label: 'AUSL schedule & box scores', url: `${OFFICIAL}/schedule/` }], stale: s.stale || undefined };
  }

  function scheduleFor(raw, s, by) {
    const id = tidOf(String(raw).replace(/^\D*:/, ''));
    const recs = recordsAfter(s.games);
    return s.games.filter((g) => (g.home === id || g.away === id)).map((g) => toEvent(g, by, recs)).filter(Boolean);
  }
  async function teamSchedule(raw) {
    const [s, { by }] = await Promise.all([season(), teamsMap()]);
    const id = tidOf(String(raw).replace(/^\D*:/, '')); const t = by.get(id); if (!t) throw Object.assign(new Error('bad team id'), { status: 400 });
    const rows = standingsRows(s, [...by.values()]); const me = rows.find((r) => r.id === id);
    const { venue, city, mlb, ...team } = t;
    return { sport: SPORT, team: { ...team, standing: me && me.gp ? `${ordinal(rows.indexOf(me) + 1)} in the AUSL` : null, record: me && me.gp ? `${me.w}-${me.l}` : null }, season: `${s.year} AUSL`, events: scheduleFor(raw, s, by), ticketsPriced: false, attribution };
  }
  const ordinal = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3) ^ 1 && n % 10] || 'th'}`;
  const standingsRows = (s, teams) => computeStandings(s.games, teams);

  async function teamPage(raw) {
    const [s, { by, list }] = await Promise.all([season(), teamsMap()]);
    const id = tidOf(String(raw).replace(/^\D*:/, '')); const t = by.get(id); if (!t) throw Object.assign(new Error('bad team id'), { status: 400 });
    const rows = standingsRows(s, list); const idx = rows.findIndex((r) => r.id === id); const me = rows[idx];
    const { venue, city, mlb, ...team } = t; const games = s.games.filter((g) => g.state === 'post' && !g.post && (g.home === id || g.away === id));
    const post = s.games.filter((g) => g.state === 'post' && g.post && (g.home === id || g.away === id));
    const pw = post.filter((g) => (g.home === id ? g.homeScore > g.awayScore : g.awayScore > g.homeScore)).length;
    const recs = recordsAfter(s.games);
    const ro = await roster(t.mlb).catch(() => []);
    const stats = me && me.gp ? [{ name: `${s.year} regular season`, items: [
      { label: 'Record', value: `${me.w}-${me.l}` }, { label: 'Win %', value: me.pct.toFixed(3).replace(/^0/, '') }, { label: 'Runs scored', value: String(me.rs) }, { label: 'Runs allowed', value: String(me.ra) },
      { label: 'Run differential', value: (me.diff > 0 ? '+' : '') + me.diff }, { label: 'Streak', value: me.streak || '–' }, { label: 'Place in the AUSL', value: `${ordinal(idx + 1)} of ${rows.length}` }] },
      ...(post.length ? [{ name: `${s.year} postseason`, items: [{ label: 'Games', value: String(post.length) }, { label: 'Wins', value: String(pw) }, { label: 'Losses', value: String(post.length - pw) }] }] : [])] : [];
    return { team: { ...team, standing: me && me.gp ? `${ordinal(idx + 1)} in the AUSL` : null, record: me && me.gp ? [{ summary: `${me.w}-${me.l}`, desc: `${s.year} regular season` }] : [], ppg: me && me.gp ? me.rs / me.gp : null, oppg: me && me.gp ? me.ra / me.gp : null, venue: t.venue, city: t.city },
      schedule: scheduleFor(raw, s, by).slice(-12), stats, roster: ro, attribution, recs: recs.get(id) || null };
  }

  // Active roster from MLB's Stats API (no headshots; player pages don't exist for AUSL, so rows are display-only).
  async function roster(mlbId) {
    return cached(`ausl:roster:${mlbId}`, 6 * 3600e3, async () => {
      const d = await get(`${MLB}/teams/${mlbId}/roster?rosterType=active&season=${nowYear()}`);
      let r = d.roster || [];
      if (!r.length) { const prev = await get(`${MLB}/teams/${mlbId}/roster?rosterType=active&season=${nowYear() - 1}`).catch(() => null); r = (prev && prev.roster) || []; }
      return r.map((p) => ({ id: `${SPORT}:a${p.person.id}`, name: p.person.fullName, jersey: p.jerseyNumber || '', pos: (p.position && p.position.abbreviation) || '', headshot: '', team: tidOf(mlbId), noPage: true }))
        .sort((a, b) => (+a.jersey || 999) - (+b.jersey || 999) || a.name.localeCompare(b.name));
    });
  }

  async function standings() {
    const [s, { list }] = await Promise.all([season(), teamsMap()]);
    const rows = computeStandings(s.games, list); const by = new Map(list.map((t) => [t.id, t]));
    const clean = ({ venue, city, mlb, ...t }) => t;
    return { sport: SPORT, cols: ['W', 'L', 'PCT', 'GB', 'DIFF'], source: 'Wikipedia game log', note: 'Computed from the season’s game results. Ties are ordered by head-to-head, then run differential. This is not the league’s official table.', season: `${s.year} regular season`,
      groups: [{ id: `${SPORT}:league`, name: LEAGUE_NAME, league: null, rows: rows.map((r, i) => ({ team: clean(by.get(r.id)), cells: [String(r.w), String(r.l), r.pct.toFixed(3).replace(/^0/, ''), r.gb ? String(r.gb) : '-', (r.diff > 0 ? '+' : '') + r.diff], rank: i + 1, pct: r.pct, pts: 0, note: null })) }], stale: s.stale || undefined, attribution };
  }

  // Gamecast: what is real (score, innings, venue, TV, round). There is no free licensed play-by-play or box score.
  async function cast(id) {
    const [s, { by }] = await Promise.all([season(), teamsMap()]);
    const g = s.games.find((x) => x.id === String(id)); if (!g) throw Object.assign(new Error('Game not found'), { status: 404 });
    const recs = recordsAfter(s.games); const e = toEvent(g, by, recs);
    const mk = (sd) => ({ ...sd, lines: [], hits: null, errors: null });
    return { kind: 'generic', family: 'baseball', sport: SPORT, id: g.id, state: e.state, detail: e.detail, short: e.detail, clock: null, period: null, date: g.date, venue: e.venue, attendance: null, venueInfo: null,
      broadcast: e.broadcast, nets: e.nets, home: mk(e.home), away: mk(e.away), link: e.link, note: e.note, stats: [], box: [], lineups: [], plays: [], scoring: [], leaders: [], heads: {}, wp: null,
      limited: { title: 'Play-by-play isn’t available for AUSL games', text: 'No free, licensed source publishes AUSL play-by-play, box scores or player stats, so there are no plays or “who did what” here. This page shows the result, venue and TV from the season’s game log' + (g.state === 'post' ? '.' : ' and will update when the result is posted.'), link: { label: 'Box score on theausl.com', url: e.link } },
      attribution };
  }

  // ---------- Bracket Buzzer hub (payloads match server/feeds.js) ----------
  const FORMAT = ['6 teams each play 25 regular-season games.', 'After the regular season there is one play-in game, then the best-of-3 AUSL Championship Series (this is how the 2026 postseason was scheduled; the league’s own site is the authority for future seasons).', 'The champion is the first team to win two Championship Series games. Seeds aren’t shown because no source we can use publishes them.'];
  const NEXT = 'No next-season date is available from the sources this app uses. Check theausl.com for the 2027 schedule.';
  const teamBrief = (t) => (t ? { id: t.id, name: t.name, short: t.short, abbr: t.abbr, logo: t.logo, logoDark: t.logoDark, color: t.color } : null);
  const LINKS = [{ name: 'theausl.com (official)', url: OFFICIAL }, { name: 'Season article (Wikipedia)', url: `https://en.wikipedia.org/wiki/${nowYear() >= 2027 ? nowYear() : 2026}_AUSL_season` }];
  async function hubList() {
    const [s, { list }] = await Promise.all([season(), teamsMap()]); const st = seasonState(s);
    const rows = computeStandings(s.games, list); const by = new Map(list.map((t) => [t.id, t]));
    const state = st === 'complete' ? 'offseason' : st === 'preseason' ? 'preseason' : 'ready';
    const notes = [];
    if (st === 'complete') notes.push(`Offseason. These are the final ${s.year} regular-season standings (before the playoffs). ${NEXT}`);
    if (st === 'preseason') notes.push(`The ${s.year} season hasn’t started, so there are no standings yet.`);
    if (s.stale) notes.push('Live data is unreachable right now, so this is the saved copy of the last good data.');
    const out = rows.map((r, i) => ({ rank: i + 1, team: teamBrief(by.get(r.id)), record: `${r.w}-${r.l}`, detail: `${r.pct.toFixed(3).replace(/^0/, '')} · ${r.diff > 0 ? '+' : ''}${r.diff}`, move: null }));
    return { sport: SPORT, name: 'AUSL Pro Softball', id: 'standings', kind: 'standings', title: `AUSL standings — ${s.year} season`, label: `Standings computed from ${s.year} game results (not an official table)`, state, notes,
      asOf: s.fetchedAt ? s.fetchedAt.slice(0, 10) : null, asOfLabel: `${s.year} regular season`, size: out.length, links: LINKS, source: { name: 'Wikipedia game log (CC BY-SA 4.0)', url: s.page || `https://en.wikipedia.org/wiki/${s.year}_AUSL_season` },
      method: { short: 'Win-loss records are counted from every regular-season result in the season’s game log. Not an official AUSL table.', formula: ['Order: win percentage, then head-to-head, then run differential.', 'The number after the record is win % and run differential (runs scored minus allowed).'],
        caveats: ['Postseason games are not counted.', 'Wikipedia is edited by volunteers and can lag or contain mistakes.', 'AUSL’s own site (theausl.com) is the official record; its terms don’t allow automated copying, so this app links to it instead.'] }, polls: [], rows: out };
  }
  async function hubBracket() {
    const [s, { list }] = await Promise.all([season(), teamsMap()]); const st = seasonState(s);
    const b = buildBracket(s.games, list); const by = new Map(list.map((t) => [t.id, t]));
    if (b) for (const g of b.groups) for (const r of g.rounds) for (const m of r.matchups) for (const x of m.slots) if (x.team) x.team = teamBrief(by.get(x.team.id));
    const champ = b && b.champion ? teamBrief(by.get(b.champion.id || b.champion)) : null; if (b && champ) b.champion = champ;
    const state = champ ? 'complete' : b ? 'live' : st === 'preseason' ? 'none' : 'none';
    const notes = [];
    let headline = `AUSL postseason — ${s.year}`; let champNote = null;
    if (champ) {
      const ser = b.groups[0].rounds.find((r) => /series/i.test(r.name)); const m = ser && ser.matchups[0]; const ru = m && m.slots.find((x) => x.team && x.team.id !== champ.id);
      headline = `${s.year} AUSL champion: ${champ.name}`; champNote = ru ? `Beat ${ru.team.name} ${m.slots.find((x) => x.team && x.team.id === champ.id).wins}–${ru.wins} in the best-of-3 AUSL Championship Series` : null;
      notes.push(`Most recent completed postseason (${s.year}). ${NEXT}`);
    } else if (b) notes.push(`The ${s.year} postseason is in progress. Results come from Wikipedia’s game log and can lag by a few minutes.`);
    else { headline = `AUSL postseason: not started`; notes.push(st === 'preseason' ? `The ${s.year} season hasn’t started yet.` : `The ${s.year} regular season is still being played; the postseason bracket appears once it starts.`); }
    if (s.stale) notes.push('Live data is unreachable right now, so this is the saved copy of the last good data.');
    return { sport: SPORT, name: 'AUSL Pro Softball', kind: 'bracket', shape: 'single', state, headline, notes, format: FORMAT, year: s.year, champLabel: `${s.year} AUSL champion`, champNote,
      source: { name: 'Wikipedia game log (CC BY-SA 4.0)', url: s.page }, links: LINKS, asOf: null, bracket: b ? { ...b, real: true } : null };
  }
  const info = async () => { const { list } = await teamsMap(); return { teams: list.length }; };
  return { SPORT, getTeams, board, teamSchedule, teamPage, roster: async (mlbId) => roster(mlbId), standings, cast, hubList, hubBracket, FORMAT, season, teamsMap, info, attribution };
}
module.exports = makeAusl;
Object.assign(module.exports, { parseGameLog, computeStandings, buildBracket, ctToUtc, stripWiki, findTeam, STATIC_TEAMS, tidOf, logoUrl, SPORT, LEAGUE_NAME, OFFICIAL, UA });
