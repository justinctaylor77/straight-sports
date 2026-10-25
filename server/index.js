// Old School Sports — tiny backend: proxies + caches ESPN public JSON and news RSS, serves the PWA.
const path = require('path');
const express = require('express');
const compression = require('compression');
const Parser = require('rss-parser');
const SOURCES = require('./sources');
const { classify, sportsCheck } = require('./classify');

const PORT = Number(process.env.PORT) || 8787;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const ESPN_WEB = 'https://site.web.api.espn.com/apis/v2/sports/football/college-football';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 OldSchoolSports/0.3';

const app = express();
app.use(compression());

// ---------- tiny TTL cache with in-flight de-duplication + stale fallback ----------
const cache = new Map();
async function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && hit.value !== undefined && now - hit.t < ttlMs) return hit.value;
  if (hit && hit.pending) return hit.pending;
  const pending = (async () => {
    try {
      const value = await fn();
      cache.set(key, { t: Date.now(), value });
      return value;
    } catch (e) {
      if (hit && hit.value !== undefined) { cache.set(key, { ...hit, pending: null }); return hit.value; } // serve stale
      cache.delete(key);
      throw e;
    }
  })();
  cache.set(key, { ...(hit || {}), pending });
  return pending;
}

async function fetchText(url, timeoutMs = 9000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return await r.text();
  } finally { clearTimeout(timer); }
}
const fetchJSON = async (url) => JSON.parse(await fetchText(url));

// ---------- sports data (see sports.js) ----------
const SP = require('./sports')({ cached, cache, fetchJSON });
const SPORT_IDS = Object.keys(SP.SPORTS);
const WATCH = require('./watch')({ cached, fetchJSON });
const sportOf = (req) => (SPORT_IDS.includes(String(req.query.sport || req.params.sport || 'cfb')) ? String(req.query.sport || req.params.sport || 'cfb') : null);

const wrap = (fn) => async (req, res) => {
  try { res.set('Cache-Control', 'no-cache'); res.json(await fn(req, res)); }
  catch (e) { console.error(req.url, e.message); res.status(e.status || 502).json({ error: e.message }); }
};
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

app.get('/api/sports', (req, res) => res.json(Object.values(SP.SPORTS).map(({ id, name, short, kind, group }) => ({ id, name, short, kind, group }))));
const kindOf = (s) => (SP.SPORTS[s] || {}).kind;
app.get('/api/teams', wrap((req) => { const s = sportOf(req); if (!s || kindOf(s) !== 'team') throw bad('teams: team sports only'); return SP.getTeams(s); }));
app.get('/api/roster/:team', wrap((req) => { const m = String(req.params.team).match(/^(?:([a-z0-9]+):)?(\d+)$/); const s = m && (m[1] || 'cfb'); if (!m || kindOf(s) !== 'team') throw bad('bad team id'); return SP.roster(s, m[2]); }));
app.get('/api/athletes', wrap((req) => { const s = sportOf(req); if (!s || kindOf(s) === 'news') throw bad('unknown sport'); return SP.athleteSearch(s, req.query.q); }));
app.get('/api/scoreboard', wrap((req) => {
  const s = sportOf(req); if (!s) throw bad('unknown sport');
  if (kindOf(s) === 'news') return { sport: s, kind: 'news', events: [] };
  const b = s === 'golf' ? SP.golfBoard() : s === 'tennis' ? SP.tennisBoard() : kindOf(s) === 'event' ? SP.eventBoard(s) : SP.teamScoreboard(s, req.query);
  return b.then((d) => WATCH.attach(s, d));
}));
app.get('/api/rankings', wrap(async (req) => {
  const s = sportOf(req);
  if (s === 'tennis') return SP.tennisRankings();
  if (s === 'nfl' || s === 'mlb') return SP.standings(s);
  if (s === 'golf') { const b = await SP.golfBoard(); return { schedule: b.schedule }; }
  if (s === 'cfb' || !s) return cfbPolls();
  if (kindOf(s) === 'event') { const b = await SP.eventBoard(s); return { sport: s, schedule: b.schedule }; }
  if (kindOf(s) !== 'team') return { sport: s };
  if (req.query.view === 'polls' || (SP.SPORTS[s].polls && req.query.view !== 'standings')) return SP.polls(s);
  return SP.standings(s);
}));
function cfbPolls() {
  return cached('rankings', 20 * 60e3, async () => {
    const d = await fetchJSON(`${ESPN}/rankings`);
    const polls = d.rankings.filter((r) => ['ap', 'usa', 'cfp'].includes(r.type)).map((r) => ({
      id: r.type, name: r.name, headline: r.headline, date: r.date,
      ranks: r.ranks.map((x) => ({ rank: x.current, previous: x.previous, points: x.points, fpv: x.firstPlaceVotes, trend: x.trend, record: x.recordSummary, team: SP.normTeam(x.team) })),
      others: (r.others || []).map((x) => ({ points: x.points, team: SP.normTeam(x.team) })),
    }));
    return { polls };
  });
}
const GROK = require('./grok')({ getTeams: () => SP.getTeams('cfb'), getPolls: cfbPolls });
// /api/jt-top25 is a display-name alias; data/grok-top25 + /api/grok-top25 stay as-is for the Sunday routine.
const top25 = wrap(async (req) => {
  const d = await GROK.get(req.query.date ? String(req.query.date) : '');
  if (!d) { const e = new Error('no JT Top 25 run for that date'); e.status = 404; throw e; }
  return d;
});
const top25Hist = (req, res) => res.json({ dates: GROK.history() });
app.get(['/api/grok-top25', '/api/jt-top25'], top25);
app.get(['/api/grok-top25/history', '/api/jt-top25/history'], top25Hist);
app.get('/api/players/:sport', wrap((req) => { const s = sportOf(req); if (!['golf', 'tennis'].includes(s) && kindOf(s) !== 'event') throw bad('players: golf, tennis or event sports'); return SP.players(s); }));
app.get('/api/game/:sport/:id', wrap((req) => { const s = sportOf(req); if (!s) throw bad('unknown sport'); if (!/^[a-z]{0,4}-?\d+$/.test(req.params.id)) throw bad('bad id'); return SP.gamecast(s, req.params.id).then((d) => WATCH.attach(s, d)); }));
app.get('/api/team/:id', wrap((req) => SP.teamPage(req.params.id).then((d) => { const m = String(req.params.id).match(/^([a-z0-9]+):/); return WATCH.attach(m ? m[1] : 'cfb', d); })));
const TICKETS = require('./tickets')({ cached, fetchJSON });
const PEOPLE = require('./people')({ cached, fetchJSON, SP, TICKETS });
app.get('/api/schedule/team/:id', wrap((req) => PEOPLE.teamSchedule(req.params.id).then((d) => WATCH.attach(d.sport, d))));
app.get('/api/tickets/status', wrap(() => TICKETS.status()));
app.get('/api/player/:id', wrap((req) => PEOPLE.player(req.params.id)));
app.get('/api/watch', wrap(async (req) => { const s = sportOf(req); if (!s) throw bad('unknown sport'); return { sport: s, games: await WATCH.forSport(s) }; }));

// ---------- routes: news ----------
const parser = new Parser({ timeout: 9000, headers: { 'User-Agent': UA },
  customFields: { item: [['media:content', 'mediaContent', { keepArray: false }], ['media:thumbnail', 'mediaThumb'], ['source', 'gsource']] } });

function cleanText(s = '') { return String(s).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim(); }

function normItem(it, src) {
  let title = cleanText(it.title);
  let sourceName = src.name;
  // Google News: "Headline - Outlet", plus <source>Outlet</source>
  if (src.url && src.url.includes('news.google.com')) {
    const g = it.gsource; const gName = g && (typeof g === 'string' ? g : g._);
    const m = title.match(/^(.*) - ([^-]+)$/);
    if (m) { title = m[1].trim(); if (!gName) sourceName = m[2].trim(); }
    if (gName) sourceName = cleanText(gName);
  }
  const link = it.link || it.guid;
  const summary = src.url && src.url.includes('news.google.com') ? '' : cleanText(it.contentSnippet || it.summary || it.content || '').slice(0, 280);
  const cats = (it.categories || []).map((c) => (typeof c === 'string' ? c : c && c._) || '').join(' ');
  const { type, reasons } = classify(title, link, cats);
  const img = (it.enclosure && it.enclosure.url) || (it.mediaContent && it.mediaContent.$ && it.mediaContent.$.url) || (it.mediaThumb && it.mediaThumb.$ && it.mediaThumb.$.url) || null;
  return { title, link, summary, source: sourceName, sourceId: src.id, via: src.via || null, published: it.isoDate || it.pubDate || null, categories: cats.slice(0, 200), type, reasons, image: img };
}

// "Only sports news": drop anything that isn't about sports. Off-topic sections/words (politics, business, entertainment, crime, weather, tech) and stream-spam are removed unless the headline is clearly about sports;
// sports-desk feeds only lose clearly off-topic items. What was dropped is remembered per feed so /api/news?debug=1 can show it.
const DROPPED = new Map();
function onlySports(src, items) {
  const strict = /^(deseret|sltrib|ksl|nfl-ksl)$/.test(src.id); // local general-news outlets must show a sports signal; // (strict mode — require a sports word — dropped too many real headlines like "Giants fall to Saints, 34-27"; the off-topic rules do the work)
  const kept = []; const dropped = [];
  for (const x of items) { const r = sportsCheck(x.title, x.link, x.categories, { strict }); if (r.ok) kept.push(x); else dropped.push({ title: x.title, source: x.source, why: r.why }); }
  DROPPED.set(`${src.id}:${src.url}`, dropped);
  return kept;
}
async function loadFeed(src) {
  return cached(`feed:${src.id}:${src.url}`, 10 * 60e3, async () => {
    if (src.type === 'espn-json') {
      const d = await fetchJSON(src.url);
      return onlySports(src, (d.articles || []).map((a) => {
        const link = a.links && a.links.web && a.links.web.href;
        const title = cleanText(a.headline); const { type, reasons } = classify(title, link, a.type || '');
        return { title, link, summary: cleanText(a.description), source: 'ESPN', sourceId: 'espn', published: a.published, categories: '', type, reasons, image: a.images && a.images[0] && a.images[0].url };
      }));
    }
    const xml = await fetchText(src.url);
    const feed = await parser.parseString(xml);
    const items = (feed.items || []).slice(0, src.url.includes('news.google.com') ? 40 : 60).map((it) => normItem(it, src));
    if (!src.must) return onlySports(src, items);
    const re = new RegExp(src.must, 'i');
    const not = /golf[- ]balls?[- ]sized|size of (a )?golf balls?|hail/i; // weather stories that only mention golf balls
    return onlySports(src, items.filter((x) => re.test(`${x.title} ${x.categories}`) && !(src.id.startsWith('golf-') && not.test(x.title))));
  });
}

const COLLEGE = new Set(['cfb', 'mcbb', 'wcbb', 'cbase']);
const famWord = (sport) => ({ football: 'football', basketball: 'basketball', hockey: 'hockey', soccer: 'soccer', baseball: 'baseball', mma: 'UFC', racing: 'racing', boxing: 'boxing', golf: 'golf', tennis: 'tennis' }[(SP.SPORTS[sport] || {}).family] || sport);
function teamQuery(t) {
  // e.g. "BYU Cougars" football  OR  "Utah State" Aggies football; pros: "Chicago Bears"
  const sport = t.sport || 'cfb';
  if (COLLEGE.has(sport)) return `"${t.location}" ${t.mascot} ${sport === 'wcbb' ? "women's basketball" : famWord(sport)} when:7d`;
  return `"${t.name}" when:7d`;
}
// NBA/WNBA stories never leak into other sports' feeds (they only appear in the opt-in NBA/WNBA feeds).
const NO_NBA = /\b(NBA|WNBA)\b/;

app.get('/api/sources', (req, res) => res.json(SOURCES.map(({ id, name, kind, defaultOn, via, sport }) => ({ id, name, kind, defaultOn, via: via || null, sport }))));

app.get('/api/news', wrap(async (req) => {
  const sport = sportOf(req) || 'cfb';
  const pool = SOURCES.filter((s) => s.sport === sport);
  const wanted = req.query.sources ? String(req.query.sources).split(',') : pool.filter((s) => s.defaultOn).map((s) => s.id);
  const teamIds = req.query.teams ? String(req.query.teams).split(',').filter(Boolean).slice(0, 12) : [];
  const names = req.query.names ? String(req.query.names).split('|').map((x) => x.trim()).filter((x) => x && x.length < 60).slice(0, 12) : [];
  const jobs = [];
  for (const s of pool) {
    if (!wanted.includes(s.id)) continue;
    if (s.type === 'team-search') {
      const subs = [];
      if (SP.SPORTS[sport].kind === 'team' && teamIds.length) {
        const { teams } = await SP.getTeams(sport);
        for (const id of teamIds) { const t = teams.find((x) => x.id === id); if (t) subs.push({ id: `gn-${id}`, q: teamQuery(t), hint: id }); }
      }
      for (const n of names) subs.push({ id: `gn-${sport}-${n}`, q: `"${n}" ${famWord(sport)} when:7d`, hint: n });
      for (const x of subs) {
        const sub = { id: x.id, name: 'Google News', via: 'Google News', url: SOURCES.gnews(x.q) };
        jobs.push(loadFeed(sub).then((items) => items.map((i) => ({ ...i, sourceId: s.id, teamHint: x.hint }))).then((v) => ({ id: sub.id, ok: true, items: v }), (e) => ({ id: sub.id, ok: false, error: e.message, items: [] })));
      }
    } else {
      jobs.push(loadFeed(s).then((v) => ({ id: s.id, ok: true, items: v }), (e) => ({ id: s.id, ok: false, error: e.message, items: [] })));
    }
  }
  const results = await Promise.all(jobs);
  // De-duplicate by link and by identical title+source
  const seen = new Set(); const items = [];
  const cutoff = Date.now() - 14 * 864e5;
  for (const r of results) for (const it of r.items) {
    const k1 = (it.link || '').split('?')[0]; const k2 = `${it.source}|${it.title.toLowerCase()}`;
    if (!it.title || seen.has(k1) || seen.has(k2)) continue;
    if (SP.SPORTS[sport].family !== 'basketball' && NO_NBA.test(`${it.title} ${it.summary || ''}`)) continue;
    const ts = Date.parse(it.published || ''); if (ts && ts < cutoff) continue;
    seen.add(k1); seen.add(k2); items.push(it);
  }
  items.sort((a, b) => (Date.parse(b.published || 0) || 0) - (Date.parse(a.published || 0) || 0));
  const dropped = req.query.debug ? results.flatMap((r) => (DROPPED.get([...DROPPED.keys()].find((k) => k.startsWith(`${r.id}:`))) || []).map((d) => ({ feed: r.id, ...d }))) : undefined;
  return { sport, dropped, items: items.slice(0, 800), status: results.map(({ id, ok, error, items: it }) => ({ id, ok, error, count: it.length })), fetchedAt: new Date().toISOString() };
}));

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ---------- static PWA ----------
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Old School Sports listening on 0.0.0.0:${PORT}`));
