// "Rankings & Brackets" service: a JT top list and a championship / playoff view for every supported sport.
//   NFL, NBA, WNBA, MLB      list = JT Power Rankings (computed, server/rank-lists.js) from ESPN standings
//                            bracket = seeds from ESPN standings + real series from ESPN postseason scoreboards (server/postseason.js)
//   NCAA men's / women's bb  list = AP / Coaches poll (ESPN rankings, NCAA.com AP poll as fallback); bracket = NCAA.com bracket JSON
//   College baseball         list = D1Baseball.com Top 25 via NCAA.com; bracket = NCAA.com bracket JSON (regionals → MCWS finals)
//   College softball         list = ESPN.com/USA Softball poll via NCAA.com; bracket = NCAA.com bracket JSON (→ WCWS finals)
//   College gymnastics       list = Road to Nationals final ranking; championship = NCAA.com history + the real format
// Nothing here invents data. Where a source has nothing, the payload says so (`state`) and names the real alternative.
// A hand-written / automation list can replace any computed list: drop data/jt-lists/<sport>/latest.json (same schema as data/grok-top25).
const fs = require('fs');
const path = require('path');
const R = require('./rank-lists');
const P = require('./postseason');
const N = require('./ncaa');
const H = require('./highlight');
const { makeResolver } = require('./teamResolve');

const WEB = 'https://site.web.api.espn.com/apis/v2/sports';
const SITE = 'https://site.api.espn.com/apis/site/v2/sports';
const NCAA_BASE = () => (process.env.NCAA_API_BASE || 'https://ncaa-api.henrygd.me').replace(/\/$/, '');
const RTN_BASE = (process.env.RTN_API_BASE || 'https://www.roadtonationals.com/api/women').replace(/\/$/, '');
const PRO = ['nfl', 'nba', 'wnba', 'mlb'];
const POLL_SPORTS = ['mcbb', 'wcbb'];
const NCAA_SPORTS = { cbase: { slug: 'baseball' }, softball: { slug: 'softball' } };
const ALL = ['nfl', 'nba', 'wnba', 'mcbb', 'wcbb', 'mlb', 'cbase', 'softball', 'gymnastics'];

const etDate = (d = new Date()) => d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const etYear = () => +etDate().slice(0, 4);
const ymd = (d) => d.replace(/-/g, '');
const nice = (iso) => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return ''; return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }); };

const SEASON_GAMES = { nfl: 17, nba: 82, wnba: 44, mlb: 162 };
const THIN = { nfl: 4, nba: 20, wnba: 8, mlb: 30 }; // fewer games than this per team = "early season" note
const META = {
  nfl: { name: 'NFL', source: { name: 'ESPN standings', url: 'https://www.espn.com/nfl/standings' } },
  nba: { name: 'NBA', source: { name: 'ESPN standings', url: 'https://www.espn.com/nba/standings' } },
  wnba: { name: 'WNBA', source: { name: 'ESPN standings', url: 'https://www.espn.com/wnba/standings' } },
  mlb: { name: 'MLB', source: { name: 'ESPN standings', url: 'https://www.espn.com/mlb/standings' } },
};
const FORMATS = {
  nfl: ['14 teams: in each conference the 4 division winners are seeds 1–4 and the next 3 best records are wild cards 5–7.', 'Seed 1 gets a bye. Wild Card round: 2 v 7, 3 v 6, 4 v 5. After that the bracket re-seeds: the top remaining seed hosts the lowest.', 'Divisional round → conference championships → Super Bowl (neutral site).'],
  nba: ['Play-in plus 16 teams: in each conference seeds 1–6 qualify directly and seeds 7–10 play in.', 'Play-in: 7 v 8 (winner is the 7 seed) and 9 v 10; the 7-v-8 loser hosts the 9-v-10 winner for the 8 seed.', 'Then four best-of-7 rounds: first round → conference semifinals → conference finals → NBA Finals.'],
  wnba: ['8 teams are seeded league-wide by record (no conferences in the playoffs).', 'First round is best-of-3 and the semifinals and WNBA Finals are best-of-5.'],
  mlb: ['12 teams: in each league the 3 division winners are seeds 1–3 and the 3 best other records are wild cards 4–6.', 'Seeds 1 and 2 get a bye. Wild Card Series (best of 3): 3 v 6 and 4 v 5. Division Series (best of 5): 1 v lowest winner, 2 v the other.', 'League Championship Series (best of 7) → World Series (best of 7).'],
  mcbb: ['68 teams: 36 at-large bids and 32 automatic bids, seeded in four regions; the First Four trims the field to 64.', 'Single elimination: First Round → Second Round → Sweet 16 → Elite Eight → Final Four → National Championship.'],
  wcbb: ['68 teams, seeded in four regions; the First Four trims the field to 64.', 'Single elimination: First Round → Second Round → Sweet 16 → Elite Eight → Final Four → National Championship.'],
  cbase: ['64 teams play 16 regionals (double elimination, four teams each); the winners meet in 8 best-of-3 Super Regionals.', 'The 8 survivors play the Men’s College World Series in Omaha: two double-elimination brackets, then a best-of-3 final.'],
  softball: ['64 teams play 16 regionals (double elimination, four teams each); the winners meet in 8 best-of-3 Super Regionals.', 'The 8 survivors play the Women’s College World Series in Oklahoma City: two double-elimination brackets, then a best-of-3 final.'],
  gymnastics: N.GYM_FORMAT,
};
const METHODS = {
  pro: (sport) => { const c = R.LEAGUES[sport]; const u = c.unit === 'runs' ? 'run' : 'point'; return {
    short: `Computed from ESPN standings: 50% win rate, 35% scoring margin, 15% last-10 form.`,
    formula: [`A = win rate, pulled toward .500 by ${c.k} phantom games so early records don’t dominate:  (W + ½T + ${c.k / 2}) ÷ (G + ${c.k}).`, `B = scoring margin per game (${u}s), shrunk the same way and scaled to 0–1 (a ${u === 'run' ? '0.7 run' : `${c.scale}-point`} per game swing ≈ ±0.2).`, 'C = last-10 record, (W + 1) ÷ (games + 2). If ESPN doesn’t list last-10 for the league (NFL), C falls back to A.', 'Score = 100 × (0.50·A + 0.35·B + 0.15·C). Ties break on win rate, then point differential.'],
    caveats: ['No strength-of-schedule adjustment, no injuries, no human overrides.', 'Early in a season the shrinkage keeps everything close; the order is mostly record + margin.', 'Movement compares with the last saved snapshot (shown as the “vs” date). The first snapshot has no movement.'] }; },
  mcbb: { short: 'Official AP Top 25 (ESPN rankings API; NCAA.com AP poll as backup). Not computed by JT.', formula: ['Ranked by the Associated Press media poll; USA Today Coaches poll is available in the tabs.'], caveats: ['Shown as the JT list for this sport until a JT-authored ranking is dropped in (data/jt-lists/mcbb/).', 'Movement is vs the poll’s own previous week; preseason polls have none.'] },
  wcbb: { short: 'Official AP Top 25 (ESPN rankings API; NCAA.com AP poll as backup). Not computed by JT.', formula: ['Ranked by the Associated Press media poll; USA Today Coaches poll is available in the tabs.'], caveats: ['Shown as the JT list for this sport until a JT-authored ranking is dropped in (data/jt-lists/wcbb/).', 'Movement is vs the poll’s own previous week; preseason polls have none.'] },
  cbase: { short: 'Official D1Baseball.com Top 25, as published on NCAA.com. Not computed by JT.', formula: ['Ranked by D1Baseball.com’s editors; NCAA.com republishes the poll with records and previous ranks.'], caveats: ['The poll is only published during the season; the newest one shown is the last of the season.', 'Shown as the JT list for this sport until a JT-authored ranking is dropped in (data/jt-lists/cbase/).'] },
  softball: { short: 'Official ESPN.com/USA Softball Collegiate Top 25, as published on NCAA.com. Not computed by JT.', formula: ['Ranked by the ESPN.com/USA Softball coaches’ poll; NCAA.com republishes it with records, points and previous ranks.'], caveats: ['The poll is only published during the season; the newest one shown is the last of the season.', 'Shown as the JT list for this sport until a JT-authored ranking is dropped in (data/jt-lists/softball/).'] },
  gymnastics: { short: 'Road to Nationals final ranking (the ranking the NCAA uses to seed). Not computed by JT.', formula: ['Teams are ranked by Road to Nationals from their scores. The NCAA seeds the championship with its National Qualifying Score (NQS), which uses the same meet scores.'], caveats: ['Road to Nationals is a fan-run site with no published API terms; we cache it for 24 hours and link back to it.', 'In-season weekly rankings are not available in this app; see the links for live rankings.'] },
};

module.exports = function makeFeeds({ cached, fetchJSON, SP }) {
  // ---------- polite NCAA / Road to Nationals fetchers ----------
  let ncaaNext = 0;
  async function ncaaGet(p) {
    return cached(`ncaa:${p}`, 30 * 60e3, async () => {
      const slot = Math.max(Date.now(), ncaaNext); ncaaNext = slot + 400; // ≤ 2.5 req/s (proxy allows 3/s per IP)
      if (slot > Date.now()) await new Promise((r) => setTimeout(r, slot - Date.now()));
      return fetchJSON(`${NCAA_BASE()}${p}`);
    });
  }
  const rtnCache = new Map(); let rtnNext = 0; const rtnPending = new Set();
  const rtnDirect = async (p) => {
    const j = await fetchJSON(`${RTN_BASE}${p}`); rtnCache.set(p, { t: Date.now(), v: j, ttl: 24 * 3600e3 }); return j;
  };
  // robots.txt asks for a 30 s crawl delay: at most one request per 30 s. A request that would have to wait is deferred to
  // the background (it fills the 24 h cache) and this call reports "loading" instead of blocking the app.
  async function rtnGet(p) {
    const hit = rtnCache.get(p); const now = Date.now();
    if (hit && now - hit.t < hit.ttl) { if (hit.err) throw hit.err; return hit.v; }
    if (now < rtnNext) {
      if (!rtnPending.has(p)) { rtnPending.add(p); const at = rtnNext; rtnNext += 30e3; const t = setTimeout(() => { rtnPending.delete(p); rtnDirect(p).catch((e) => rtnCache.set(p, { t: Date.now(), err: e, ttl: 10 * 60e3 })); }, at - now); if (t.unref) t.unref(); }
      throw Object.assign(new Error('Road to Nationals is being fetched (30 s politeness delay) — try again shortly'), { status: 503, deferred: true });
    }
    rtnNext = now + 30e3;
    try { return await rtnDirect(p); } catch (e) { rtnCache.set(p, { t: Date.now(), err: e, ttl: 10 * 60e3 }); throw e; }
  }

  // ---------- college team resolver (ESPN logos) ----------
  let resolverP = null;
  const collegeResolver = () => (resolverP = resolverP || SP.getTeams('mcbb').then((d) => makeResolver(d.teams)).catch(() => { resolverP = null; return () => null; }));
  async function resolveFn() {
    const r = await collegeResolver();
    return (short, full, seo) => r(short) || (full && r(full)) || (seo && r(String(seo).replace(/-/g, ' '))) || null;
  }
  const fillTeam = (r) => (r ? { id: r.id, espnId: r.espnId, name: r.name, short: r.short, abbr: r.abbr, logo: r.logo, logoDark: r.logoDark, color: r.color } : null);

  // ---------- snapshots + movement ----------
  const MIN_AGE = { nfl: 6, nba: 1, wnba: 1, mlb: 1 };
  function withSnapshot(sport, today, rows, extra) {
    const prev = R.previousSnapshot(sport, today, MIN_AGE[sport] || 1);
    const out = R.applyMovement(rows, prev);
    const saved = rows.length ? R.saveSnapshot(sport, R.makeSnapshot(sport, today, rows, extra)) : false;
    return { rows: out, snapshot: { date: today, prevDate: prev ? prev.date : null, first: !prev, saved } };
  }

  // ---------- JT drop-in lists (same schema as data/grok-top25) ----------
  const dropDir = () => process.env.JT_LISTS_DIR || path.join(__dirname, '..', 'data', 'jt-lists');
  async function dropIn(sport) {
    let run; try { run = JSON.parse(fs.readFileSync(path.join(dropDir(), sport, 'latest.json'), 'utf8')); } catch { return null; }
    if (!run || !Array.isArray(run.ranks) || !run.ranks.length) return null;
    const find = await resolveFn().catch(() => () => null);
    const teams = sport === 'mcbb' || sport === 'wcbb' || PRO.includes(sport) ? await SP.getTeams(sport).then((d) => makeResolver(d.teams)).catch(() => null) : null;
    const rows = run.ranks.filter((r) => r && r.team && r.rank).map((r) => {
      const t = fillTeam((teams ? teams(r.team) : null) || find(r.team));
      return { rank: r.rank, team: t || { id: null, name: r.team, short: r.team, logo: '', logoDark: '' }, record: r.record || null, why: r.reason || null, prev: r.prev ?? null, move: r.move ?? null, score: null };
    });
    return { id: 'jt', title: run.title || 'JT Top 25', date: run.date, notes: run.notes || null, source: run.source || 'JT', method: run.method, rows };
  }

  // ---------- pro leagues ----------
  async function proRows(sport) {
    return cached(`lists:std:${sport}`, 10 * 60e3, async () => {
      const d = await fetchJSON(`${WEB}/${SP.SPORTS[sport].path}/standings${sport === 'nfl' || sport === 'mlb' ? '?level=3' : ''}`);
      const out = [];
      const walk = (n, trail) => {
        if (n.standings && Array.isArray(n.standings.entries)) for (const e of n.standings.entries) if (e && e.team) out.push({ team: SP.normTeam(e.team, sport), entry: e, conf: trail[0] || null, div: trail[1] || null });
        for (const c of n.children || []) walk(c, [...trail, c.abbreviation || c.shortName || c.name]);
      };
      walk(d, []);
      if (!out.length) throw new Error('standings: no teams');
      return { rows: out, season: (d.seasons && d.seasons[0] && (d.seasons[0].displayName || d.seasons[0].year)) || null };
    });
  }
  const gpOf = (rows) => { const g = rows.map((r) => R.statsOf(r.entry).gp); return { total: g.reduce((a, b) => a + b, 0), max: Math.max(0, ...g), avg: g.length ? g.reduce((a, b) => a + b, 0) / g.length : 0 }; };

  async function proList(sport) {
    const today = etDate();
    const { rows: srows, season } = await proRows(sport);
    const gp = gpOf(srows); const cfg = R.LEAGUES[sport];
    let ranked = R.computePower(sport, srows.map((r) => ({ team: r.team, stats: r.entry.stats, conf: r.conf, div: r.div })));
    if (cfg.size) ranked = ranked.slice(0, cfg.size);
    const state = gp.total === 0 ? 'preseason' : gp.max >= SEASON_GAMES[sport] ? 'final' : gp.avg < THIN[sport] ? 'early' : 'ready';
    const snap = state === 'preseason' ? { rows: ranked.map((r) => ({ ...r, prev: null, move: null })), snapshot: { date: today, prevDate: null, first: true, saved: false } } : withSnapshot(sport, today, ranked, { season, gamesMax: gp.max });
    const notes = [];
    if (state === 'preseason') notes.push('No games have been played yet, so every team has the same score and the order is alphabetical. The list fills in once the season starts.');
    if (state === 'early') notes.push(`Early season: teams have played ${gp.max} game${gp.max === 1 ? '' : 's'} at most. With so few games the list is very noisy and will reshuffle.`);
    if (state === 'final') notes.push('Regular season complete: this is the final regular-season order (the postseason is not included).');
    return { sport, name: META[sport].name, id: 'jt-power', kind: 'computed', title: `JT Power Rankings — ${META[sport].name}`, label: `JT Power Rankings (computed from ESPN standings; method: win rate + scoring margin + last-10 form)`,
      state, notes, season, asOf: today, asOfLabel: `${nice(today)} · through ${gp.max} game${gp.max === 1 ? '' : 's'}`, size: snap.rows.length,
      source: META[sport].source, method: METHODS.pro(sport), snapshot: snap.snapshot, rows: snap.rows };
  }

  // postseason events from ESPN scoreboards (single-day requests; ESPN rejects date ranges)
  const WIN = { mlb: { start: [9, 24], end: [11, 12], types: [3] }, wnba: { start: [9, 1], end: [10, 31], types: [3] }, nba: { start: [4, 10], end: [6, 30], types: [5, 3] } };
  async function pool(items, n, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null); } })); return out; }
  async function postEvents(sport) {
    const base = `${SITE}/${SP.SPORTS[sport].path}/scoreboard`;
    const sb = await cached(`lists:sb:${sport}`, 5 * 60e3, () => fetchJSON(base));
    const yr = (sb.leagues && sb.leagues[0] && sb.leagues[0].season && sb.leagues[0].season.year) || etYear();
    const today = etDate(); let urls = [];
    if (sport === 'nfl') {
      if (today < `${yr + 1}-01-01`) return [];
      urls = [1, 2, 3, 5].map((w) => `${base}?seasontype=3&week=${w}&dates=${yr}`);
    } else {
      const w = WIN[sport]; const pad = (n) => String(n).padStart(2, '0');
      const start = `${yr}-${pad(w.start[0])}-${pad(w.start[1])}`; const end0 = `${yr}-${pad(w.end[0])}-${pad(w.end[1])}`;
      if (today < start) return [];
      const lim = new Date(); lim.setUTCDate(lim.getUTCDate() + 8); const limit = lim.toISOString().slice(0, 10);
      const end = end0 < limit ? end0 : limit;
      for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) for (const t of w.types) urls.push(`${base}?seasontype=${t}&dates=${ymd(d.toISOString().slice(0, 10))}`);
    }
    const recent = (u) => { const m = u.match(/dates=(\d{8})/); if (!m) return true; const d = `${m[1].slice(0, 4)}-${m[1].slice(4, 6)}-${m[1].slice(6)}`; return d >= etDate(new Date(Date.now() - 2 * 86400e3)); };
    const res = await pool(urls, 6, (u) => cached(`lists:ev:${u}`, recent(u) ? 2 * 60e3 : 6 * 3600e3, () => fetchJSON(u)));
    const evs = []; for (const r of res) if (r && r.events) evs.push(...r.events);
    return evs;
  }

  async function proPlayoffs(sport) {
    const [{ rows: srows }, events] = await Promise.all([proRows(sport), postEvents(sport).catch(() => [])]);
    const gp = gpOf(srows);
    const seedRows = srows.map((r) => { const st = R.statsOf(r.entry); return { team: r.team, w: st.w, l: st.l, t: st.t, gp: st.gp, diff: st.diff, seed: st.seed, conference: r.conf, division: r.div, record: st.overall }; });
    const seeds = P.SEEDERS[sport](seedRows);
    const series = P.seriesFromEvents(sport, events, SP.normTeam);
    const bracket = P.buildBracket(sport, seeds, series);
    const state = bracket.champion ? 'complete' : bracket.real ? 'live' : gp.total === 0 ? 'preseason' : 'projected';
    const notes = []; let headline;
    const nm = META[sport].name;
    if (state === 'complete') headline = `${bracket.champion.name} are the ${nm} champions`;
    else if (state === 'live') headline = `${nm} postseason in progress`;
    else if (state === 'preseason') headline = `${nm} playoff bracket — season hasn’t started`;
    else headline = sport === 'nfl' ? 'Projected if the season ended today' : sport === 'nba' ? 'Projected from the current standings' : `Projected from the current ${nm} standings`;
    if (state === 'projected') {
      notes.push('This is a projection from the standings, not a prediction of who will win. Real playoff results replace it automatically when the postseason starts.');
      if (gp.avg < THIN[sport]) notes.push(`Early season: teams have played about ${Math.round(gp.avg * 10) / 10} game${gp.avg === 1 ? '' : 's'}, so seeds will shuffle a lot.`);
      if (sport === 'nba') notes.push('Seeds 7–10 enter the play-in tournament. Matchups beyond the play-in are placeholders until it is played.');
    }
    if (state === 'preseason') notes.push('The bracket needs standings; it will fill in once games are played.');
    if (state === 'live' || state === 'complete') notes.push(sport === 'mlb' || sport === 'wnba' || sport === 'nba' || sport === 'nfl' ? 'Real results from ESPN. Series scores update about every two minutes.' : '');
    return { sport, name: nm, kind: 'bracket', state, headline, notes: notes.filter(Boolean), format: FORMATS[sport], source: { name: 'ESPN standings & scoreboard', url: `https://www.espn.com/${SP.SPORTS[sport].espn}/standings` }, asOf: etDate(), bracket };
  }

  // ---------- college polls ----------
  const moveOf = (prev, rank, pre) => (pre ? null : prev ? prev - rank : 'new');
  async function pollsFromEspn(sport) {
    const d = await SP.polls(sport); const out = [];
    for (const p of d.polls || []) {
      if (!['ap', 'usa'].includes(p.id) || !(p.ranks || []).length) continue;
      const pre = /preseason/i.test(`${p.headline} ${p.name}`);
      out.push({ id: p.id, name: p.id === 'ap' ? 'AP Top 25' : 'USA Today Coaches Poll', headline: p.headline || '', date: p.date ? String(p.date).slice(0, 10) : null, preseason: pre,
        rows: p.ranks.filter((r) => r.team).map((r) => ({ rank: r.rank, team: fillTeam(r.team), record: r.record || null, points: r.points ?? null, fpv: r.fpv || null, prev: r.previous || null, move: moveOf(r.previous, r.rank, pre) })) });
    }
    return out;
  }
  async function pollFromNcaaApi(sport, slug, name) {
    const [j, resolve] = await Promise.all([ncaaGet(`/rankings/${slug}/d1`), resolveFn()]);
    const poll = N.pollFromNcaa(j); if (!poll.rows.length) return null;
    const pre = /preseason/i.test(poll.title);
    return { id: 'ncaa', name: name || poll.title, headline: poll.title, date: poll.date, updated: poll.updated, preseason: pre,
      rows: poll.rows.map((r) => { const t = fillTeam(resolve(r.name)); return { rank: r.rank, team: t || { id: null, name: r.name, short: r.name, logo: '', logoDark: '' }, record: r.record, points: r.points, fpv: r.fpv, prev: r.prev, move: moveOf(r.prev, r.rank, pre) }; }) };
  }
  const NCAA_SLUG = { mcbb: 'basketball-men', wcbb: 'basketball-women', cbase: 'baseball', softball: 'softball' };

  async function pollList(sport) {
    let polls = []; let via = 'ESPN rankings API'; let sourceUrl = `https://www.espn.com/${SP.SPORTS[sport] && SP.SPORTS[sport].espn ? SP.SPORTS[sport].espn : sport}/rankings`;
    if (POLL_SPORTS.includes(sport)) {
      polls = await pollsFromEspn(sport).catch(() => []);
      if (!polls.length) { const p = await pollFromNcaaApi(sport, NCAA_SLUG[sport], 'AP Top 25').catch(() => null); if (p) { polls = [p]; via = 'NCAA.com (AP poll)'; sourceUrl = `https://www.ncaa.com/rankings/${NCAA_SLUG[sport]}/d1/associated-press`; } }
    } else {
      const label = sport === 'cbase' ? 'D1Baseball.com Top 25' : 'ESPN.com/USA Softball Top 25';
      const p = await pollFromNcaaApi(sport, NCAA_SLUG[sport], label).catch(() => null); if (p) polls = [p];
      via = 'NCAA.com rankings'; sourceUrl = `https://www.ncaa.com/rankings/${NCAA_SLUG[sport]}/d1`;
    }
    const m = METHODS[sport]; const name = SP.SPORTS[sport].name;
    const drop = await dropIn(sport);
    const main = polls[0] || null;
    const today = etDate();
    const age = main && main.date ? Math.floor((Date.parse(today) - Date.parse(main.date)) / 86400e3) : null;
    const state = drop ? 'ready' : !main ? 'unavailable' : main.preseason ? 'preseason' : (sport === 'cbase' || sport === 'softball') && age != null && age > 30 ? 'offseason' : 'ready';
    const notes = [];
    if (!main) notes.push(`No ${name} poll is available from ${via} right now.`);
    if (state === 'preseason') notes.push('Preseason poll: no games have been played yet, so there is no movement. The list updates weekly once the season starts.');
    if (state === 'offseason') notes.push(`Offseason: this is the last poll of the ${String(main.date).slice(0, 4)} season (${nice(main.date)}). New polls start when next season’s games begin.`);
    return { sport, name, id: drop ? 'jt' : 'poll', kind: drop ? 'jt' : 'poll', title: drop ? drop.title : `${main ? main.name : 'Top 25'} — ${name}`,
      label: drop ? `JT Top 25 (${drop.source})` : `${main ? main.name : 'Top 25'} (official poll — shown as the JT list until a JT list is added)`,
      state, notes, asOf: drop ? drop.date : main ? main.date : null, asOfLabel: drop ? nice(drop.date) : main ? `${main.headline ? `${main.headline} · ` : ''}${nice(main.date)}` : '', size: (drop ? drop.rows : main ? main.rows : []).length,
      source: { name: drop ? drop.source : via, url: sourceUrl }, method: drop && drop.method && drop.method.note ? { short: drop.method.note, formula: [], caveats: [] } : m,
      polls: drop ? [{ id: 'jt', name: drop.title, date: drop.date, rows: drop.rows }, ...polls] : polls, rows: drop ? drop.rows : main ? main.rows : [] };
  }

  // ---------- college brackets ----------
  async function ncaaBracket(slug, year, kind) {
    const j = await ncaaGet(`/brackets/${slug}/d1/${year}`).catch(() => null);
    const champ = j && Array.isArray(j.championships) ? j.championships[0] : null; if (!champ) return null;
    const resolve = await resolveFn();
    return kind === 'basketball' ? N.basketballBracket(champ, resolve) : N.seriesBracket({ ...champ, sportUrl: slug }, resolve);
  }
  async function collegePlayoffs(sport) {
    const slug = NCAA_SLUG[sport]; const y = etYear(); const name = SP.SPORTS[sport].name;
    const bball = POLL_SPORTS.includes(sport); const kind = bball ? 'basketball' : 'series';
    let found = null;
    for (const yr of bball ? [y + 1, y, y - 1] : [y, y - 1]) { const b = await ncaaBracket(slug, yr, kind).catch(() => null); if (b && (b.gamesPlayed > 0 || b.champion)) { found = { ...b, year: yr }; break; } }
    const pollP = pollList(sport).catch(() => null);
    const poll = await pollP;
    const mini = poll && poll.rows.length ? { name: poll.polls[0].name, headline: poll.polls[0].headline, date: poll.asOf, preseason: !!poll.polls[0].preseason, rows: poll.rows.slice(0, 25) } : null;
    let state = 'none'; const notes = []; let headline;
    const evName = bball ? `${sport === 'wcbb' ? 'NCAA Women’s' : 'NCAA Men’s'} Tournament` : sport === 'cbase' ? 'NCAA Baseball Tournament' : 'NCAA Softball Tournament';
    if (found) {
      state = found.champion ? 'complete' : found.gamesPlayed > 0 ? 'live' : 'announced';
      headline = found.champion ? `${found.year} ${evName}: ${found.champion.short || found.champion.name} won the national championship` : `${found.year} ${evName}`;
      if (found.champion) notes.push(bball ? `Most recent completed tournament (${found.year}). The next bracket is announced on Selection Sunday in March; until then this stays as the final ${found.year} result.` : `Most recent completed tournament (${found.year}). The next bracket is published by the NCAA once that season’s tournament field is set; until then this stays as the final result.`);
      if (state === 'live') notes.push('Real results from NCAA.com. Scores update every few minutes.');
    } else {
      headline = `${evName}: bracket not available yet`;
      notes.push(bball ? 'The NCAA bracket appears in March (Selection Sunday). Until then the current AP poll is shown below.' : 'No NCAA bracket data is published right now.');
    }
    let oneSeeds = null;
    if (bball && !found && mini && !mini.preseason) oneSeeds = { label: 'Not an NCAA projection — simply the top 4 in the current AP poll', rows: mini.rows.slice(0, 4) };
    return { sport, name, kind: 'bracket', shape: bball ? 'single' : 'double', state, headline, notes, format: FORMATS[sport], year: found ? found.year : null,
      source: { name: 'NCAA.com bracket', url: `https://www.ncaa.com/brackets/${slug}/d1/${found ? found.year : y}` }, asOf: etDate(),
      bracket: found && bball ? { groups: found.groups, finalRounds: found.finalRounds, champion: found.champion, real: true, title: found.title } : null,
      stages: found && !bball ? found.stages : null, champion: found ? found.champion : null, runnerUp: found && found.runnerUp ? found.runnerUp : null, poll: mini, oneSeeds };
  }

  // ---------- gymnastics ----------
  const GYM_LINKS = [{ name: 'Road to Nationals', url: 'https://www.roadtonationals.com/results/rankings' }, { name: 'NCAA.com gymnastics', url: 'https://www.ncaa.com/sports/gymnastics-women/d1' }];
  async function gymData() {
    const y = etYear(); const resolve = await resolveFn();
    const hist = await ncaaGet('/history/gymnastics-women/nc').then((j) => N.gymHistory(j, y)).catch(() => null);
    let rank = []; let year = null; let deferred = false;
    for (const yr of [y, y - 1]) {
      try { const j = await rtnGet(`/finalresults/${yr}`); const r = N.gymRanking(j); if (r.length) { rank = r; year = yr; break; } } catch (e) { if (e.deferred) deferred = true; break; }
    }
    const rows = rank.slice(0, 36).map((r) => { const t = fillTeam(resolve(r.name)); return { rank: r.rank, team: t || { id: null, name: r.name, short: r.name, logo: '', logoDark: '' }, record: null, avg: r.avg, high: r.high, rqs: r.rqs, move: null, prev: null }; });
    return { hist, rows, year, deferred };
  }
  async function gymList() {
    const g = await gymData(); const drop = await dropIn('gymnastics');
    const state = drop ? 'ready' : g.rows.length ? 'offseason' : g.deferred ? 'loading' : 'unavailable';
    const notes = [];
    if (g.rows.length) notes.push(`Final ${g.year} Road to Nationals ranking. The women’s college gymnastics season runs roughly January to April; weekly in-season rankings are on Road to Nationals.`);
    else notes.push(g.deferred ? 'Road to Nationals data is being fetched (it asks for a 30-second delay between requests). Try again in a moment.' : 'Ranking data isn’t available from Road to Nationals right now. ESPN has no gymnastics data, so use the links below for live rankings.');
    return { sport: 'gymnastics', name: 'College Gymnastics', id: drop ? 'jt' : 'rtn', kind: drop ? 'jt' : 'ranking', title: drop ? drop.title : 'Team Ranking — College Gymnastics', label: drop ? `JT Top 25 (${drop.source})` : 'Road to Nationals ranking (official ranking source — shown as the JT list until a JT list is added)',
      state, notes, asOf: g.year ? String(g.year) : null, asOfLabel: g.year ? `${g.year} final ranking` : '', size: (drop ? drop.rows : g.rows).length, links: GYM_LINKS,
      source: { name: drop ? drop.source : 'Road to Nationals', url: 'https://www.roadtonationals.com/results/rankings' }, method: METHODS.gymnastics, rows: drop ? drop.rows : g.rows, columns: ['avg', 'high'] };
  }
  async function gymPlayoffs() {
    const g = await gymData(); const ch = g.hist && g.hist.current;
    const state = ch ? 'complete' : g.hist ? 'offseason' : 'unavailable';
    const resolve = await resolveFn();
    const tm = (n) => { const t = fillTeam(resolve(n)); return t || { id: null, name: n, short: n, logo: '', logoDark: '' }; };
    const last = g.hist && g.hist.rows.find((r) => r.points) || null; const use = ch || last;
    const notes = [];
    if (use) notes.push(`Most recent completed championship (${use.year}). The women’s season runs roughly January to April and the next championship appears after regionals.`);
    else notes.push('Championship results aren’t available from NCAA.com right now. See the links below.');
    return { sport: 'gymnastics', name: 'College Gymnastics', kind: 'championship', state, headline: use ? `${use.year} NCAA Women’s Gymnastics Championship: ${use.champion}` : 'NCAA Women’s Gymnastics Championship', notes, format: FORMATS.gymnastics,
      source: { name: 'NCAA.com championship history', url: 'https://www.ncaa.com/history/gymnastics-women/nc' }, links: GYM_LINKS, asOf: etDate(),
      champion: use ? { year: use.year, team: tm(use.champion), score: use.points, coach: use.coach, runnerUp: tm(use.runnerUp), site: use.site } : null,
      history: g.hist ? g.hist.rows.slice(0, 8).map((r) => { const blank = (v) => v == null || /^[-–—\s]*$/.test(String(v)); return { year: r.year, champion: tm(r.champion), runnerUp: r.runnerUp && !blank(r.runnerUp.name || r.runnerUp.short || r.runnerUp) ? tm(r.runnerUp) : null, points: blank(r.points) ? null : r.points, site: r.site }; }) : [], ranking: g.rows.slice(0, 12), rankingYear: g.year };
  }

  // ---------- public API ----------
  const finish = (x) => H.decorate(x);
  async function dropPayload(sport, drop) {
    const name = sport === 'gymnastics' ? 'College Gymnastics' : SP.SPORTS[sport].name;
    return { sport, name, id: 'jt', kind: 'jt', title: drop.title, label: `JT Top ${drop.rows.length} (${drop.source})`, state: 'ready', notes: [], asOf: drop.date, asOfLabel: nice(drop.date), size: drop.rows.length,
      source: { name: drop.source, url: '' }, method: { short: (drop.method && drop.method.note) || 'JT’s own ranking.', formula: [], caveats: [] }, polls: [{ id: 'jt', name: drop.title, date: drop.date, rows: drop.rows }], rows: drop.rows, jtNotes: drop.notes };
  }
  function list(sport) {
    if (!ALL.includes(sport)) { const e = new Error('unknown list sport'); e.status = 400; throw e; }
    return cached(`lists:list:${sport}`, PRO.includes(sport) ? 10 * 60e3 : 30 * 60e3, async () => {
      if (PRO.includes(sport)) { const drop = await dropIn(sport); return finish(drop ? await dropPayload(sport, drop) : await proList(sport)); }
      return finish(sport === 'gymnastics' ? await gymList() : await pollList(sport));
    });
  }
  function playoffs(sport) {
    if (!ALL.includes(sport)) { const e = new Error('unknown playoffs sport'); e.status = 400; throw e; }
    return cached(`lists:po:${sport}`, 2 * 60e3, async () => finish(PRO.includes(sport) ? await proPlayoffs(sport) : sport === 'gymnastics' ? await gymPlayoffs() : await collegePlayoffs(sport)));
  }
  function index() {
    return { sports: ALL.map((id) => ({ id, name: id === 'gymnastics' ? 'College Gymnastics' : SP.SPORTS[id].name, short: SP.SPORTS[id].short, emoji: SP.SPORTS[id].emoji, listKind: PRO.includes(id) ? 'computed' : 'poll', list: { title: PRO.includes(id) ? 'JT Power Rankings' : id === 'gymnastics' ? 'Team ranking' : 'Top 25 poll' }, bracket: { shape: id === 'gymnastics' ? 'championship' : id === 'cbase' || id === 'softball' ? 'double' : 'single' } })) };
  }
  return { list, playoffs, index, ALL, etDate, internals: { proRows, postEvents, ncaaGet, rtnGet, dropIn, pollList, collegePlayoffs } };
};
module.exports.ALL = ALL;
