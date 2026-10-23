// Straight Sports — tiny backend: proxies + caches ESPN public JSON and news RSS, serves the PWA.
const path = require('path');
const express = require('express');
const compression = require('compression');
const Parser = require('rss-parser');
const SOURCES = require('./sources');
const { classify } = require('./classify');

const PORT = Number(process.env.PORT) || 8787;
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football/college-football';
const ESPN_WEB = 'https://site.web.api.espn.com/apis/v2/sports/football/college-football';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36 StraightSports/0.3';

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
const sportOf = (req) => (SPORT_IDS.includes(String(req.query.sport || req.params.sport || 'cfb')) ? String(req.query.sport || req.params.sport || 'cfb') : null);

const wrap = (fn) => async (req, res) => {
  try { res.set('Cache-Control', 'no-cache'); res.json(await fn(req, res)); }
  catch (e) { console.error(req.url, e.message); res.status(e.status || 502).json({ error: e.message }); }
};
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });

app.get('/api/sports', (req, res) => res.json(Object.values(SP.SPORTS).map(({ id, name, short, kind }) => ({ id, name, short, kind }))));
app.get('/api/teams', wrap((req) => { const s = sportOf(req); if (!s || !['cfb', 'nfl', 'mlb'].includes(s)) throw bad('teams: cfb, nfl or mlb'); return SP.getTeams(s); }));
app.get('/api/scoreboard', wrap((req) => {
  const s = sportOf(req); if (!s) throw bad('unknown sport');
  if (s === 'golf') return SP.golfBoard();
  if (s === 'tennis') return SP.tennisBoard();
  return SP.teamScoreboard(s, req.query);
}));
app.get('/api/rankings', wrap(async (req) => {
  const s = sportOf(req);
  if (s === 'tennis') return SP.tennisRankings();
  if (s === 'nfl' || s === 'mlb') return SP.standings(s);
  if (s === 'golf') { const b = await SP.golfBoard(); return { schedule: b.schedule }; }
  return cached('rankings', 20 * 60e3, async () => {
    const d = await fetchJSON(`${ESPN}/rankings`);
    const polls = d.rankings.filter((r) => ['ap', 'usa', 'cfp'].includes(r.type)).map((r) => ({
      id: r.type, name: r.name, headline: r.headline, date: r.date,
      ranks: r.ranks.map((x) => ({ rank: x.current, previous: x.previous, points: x.points, fpv: x.firstPlaceVotes, trend: x.trend, record: x.recordSummary, team: SP.normTeam(x.team) })),
      others: (r.others || []).map((x) => ({ points: x.points, team: SP.normTeam(x.team) })),
    }));
    return { polls };
  });
}));
app.get('/api/players/:sport', wrap((req) => { const s = sportOf(req); if (!['golf', 'tennis'].includes(s)) throw bad('players: golf or tennis'); return SP.players(s); }));
app.get('/api/game/:sport/:id', wrap((req) => { const s = sportOf(req); if (!s) throw bad('unknown sport'); if (!/^[a-z]{0,4}-?\d+$/.test(req.params.id)) throw bad('bad id'); return SP.gamecast(s, req.params.id); }));
app.get('/api/team/:id', wrap((req) => SP.teamPage(req.params.id)));

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

async function loadFeed(src) {
  return cached(`feed:${src.id}:${src.url}`, 10 * 60e3, async () => {
    if (src.type === 'espn-json') {
      const d = await fetchJSON(src.url);
      return (d.articles || []).map((a) => {
        const link = a.links && a.links.web && a.links.web.href;
        const title = cleanText(a.headline); const { type, reasons } = classify(title, link, a.type || '');
        return { title, link, summary: cleanText(a.description), source: 'ESPN', sourceId: 'espn', published: a.published, categories: '', type, reasons, image: a.images && a.images[0] && a.images[0].url };
      });
    }
    const xml = await fetchText(src.url);
    const feed = await parser.parseString(xml);
    return (feed.items || []).slice(0, src.url.includes('news.google.com') ? 40 : 60).map((it) => normItem(it, src));
  });
}

function teamQuery(t) {
  // e.g. "BYU Cougars" football  OR  "Utah State" Aggies football; pros: "Chicago Bears"
  if (t.sport && t.sport !== 'cfb') return `"${t.name}" when:7d`;
  return `"${t.location}" ${t.mascot} football when:7d`;
}
// Hard rule for this app: no NBA / WNBA coverage, in any sport's feed.
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
      if (['cfb', 'nfl', 'mlb'].includes(sport) && teamIds.length) {
        const { teams } = await SP.getTeams(sport);
        for (const id of teamIds) { const t = teams.find((x) => x.id === id); if (t) subs.push({ id: `gn-${id}`, q: teamQuery(t), hint: id }); }
      }
      if (['golf', 'tennis'].includes(sport)) for (const n of names) subs.push({ id: `gn-${sport}-${n}`, q: `"${n}" ${sport} when:7d`, hint: n });
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
    if (NO_NBA.test(`${it.title} ${it.summary || ''}`)) continue;
    const ts = Date.parse(it.published || ''); if (ts && ts < cutoff) continue;
    seen.add(k1); seen.add(k2); items.push(it);
  }
  items.sort((a, b) => (Date.parse(b.published || 0) || 0) - (Date.parse(a.published || 0) || 0));
  return { sport, items: items.slice(0, 800), status: results.map(({ id, ok, error, items: it }) => ({ id, ok, error, count: it.length })), fetchedAt: new Date().toISOString() };
}));

app.get('/api/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ---------- static PWA ----------
const pub = path.join(__dirname, '..', 'public');
app.use(express.static(pub, { setHeaders: (res, p) => { if (p.endsWith('sw.js') || p.endsWith('.html')) res.set('Cache-Control', 'no-cache'); } }));
app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(pub, 'index.html')));

app.listen(PORT, '0.0.0.0', () => console.log(`Straight Sports listening on 0.0.0.0:${PORT}`));
