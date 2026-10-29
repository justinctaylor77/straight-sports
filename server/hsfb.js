// High School Football (v1.6.0 "Single Wing"). Three free sources, no scores anywhere:
//  1. WatchESPN catalog, league "High School Football": games ESPN carries nationally (teams, network, time, watch link).
//  2. KSL Sports YouTube channel RSS (no key): recent Utah game videos, filtered to football.
//  3. Optional YouTube Data API v3 (YOUTUBE_API_KEY): LIVE / UPCOMING badges via videos.list (1 unit per call, up to 50 ids),
//     plus one playlistItems.list on the uploads playlist (1 unit) to see past the RSS feed's 15 newest uploads.
//     Cached 5–10 minutes, so at most ~2 calls per 5 minutes (≈ 600 units/day of the 10,000 quota). Any API failure
//     drops the badges and keeps the links. The key travels in a request header (never in a URL) and is never returned or logged.
// Scores: none. WatchESPN events have no score API and ESPN has no high school scoreboard, so every game carries score: null.
const KSL_CHANNEL = 'UCyIZoJ7Ge36sqkMPV_eKGfg';
const KSL_UPLOADS = `UU${KSL_CHANNEL.slice(2)}`;
const WATCH_WEB = /^https:\/\/www\.espn\.com\/watch\//;
const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const OTHER_SPORTS = /\b(volleyball|soccer|basketball|baseball|softball|wrestling|swim|tennis|golf|lacrosse|cross country|track)\b/i;

// "Team A vs. Team B - 6A Football Quarterfinal" style game titles; football only.
function isFootballGame(title) {
  const t = String(title || '');
  // v1.6.1: a game title must name a high school class (1A-6A) or say "high school", have "vs." / "at" / "@" between two
  // teams at the start of the title (talk titles like "Sitting at 6-1 ... BYU" fail the class check), and not be a question or a show segment.
  if (!/\bfootball\b/i.test(t) || OTHER_SPORTS.test(t)) return false;
  if (!/\b[1-6]A\b/.test(t) && !/\bhigh school\b/i.test(t)) return false;
  if (/\?|^\s*hour\s*\d|\b(BYU|Utes|college|NFL|Big 12|podcast|show)\b/i.test(t)) return false;
  return /^[^-|:]+?\s(vs\.?|at|@)\s[^-|:]+/i.test(t);
}
function splitTeams(name) {
  const m = String(name || '').match(/^(.+?)\s+(?:vs\.?|at|@)\s+(.+?)$/i);
  return m ? { away: m[1].trim(), home: m[2].trim() } : { away: '', home: '' };
}
const iso = (s) => { const t = Date.parse(s || ''); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// WatchESPN catalog buckets → games list (pure; unit-tested)
function tvGames(buckets) {
  const by = new Map();
  for (const b of buckets || []) for (const c of b.contents || []) {
    if (!c || !c.name || !/^(live|upcoming|replay)$/.test(c.status || '')) continue;
    const id = String(c.eventId || c.id || ''); if (!id) continue;
    const g = by.get(id) || { id, name: String(c.name), ...splitTeams(c.name), date: iso(c.utc), status: c.status, networks: [], watch: null, score: null };
    if (c.status === 'live' || (c.status === 'upcoming' && g.status === 'replay')) g.status = c.status;
    for (const s of c.streams || []) {
      const net = s.source && (s.source.name || s.source.id); const web = s.links && (s.links.web || s.links.shareUrl);
      if (net && !g.networks.includes(net)) g.networks.push(String(net));
      if (!g.watch && web && WATCH_WEB.test(web)) g.watch = web;
    }
    if (!g.networks.length && c.subtitle) { const n = String(c.subtitle).split('•')[0].trim(); if (n) g.networks.push(n); }
    by.set(id, g);
  }
  const ord = { live: 0, upcoming: 1, replay: 2 };
  return [...by.values()].sort((a, b) => ord[a.status] - ord[b.status]
    || (a.status === 'replay' ? Date.parse(b.date || 0) - Date.parse(a.date || 0) : Date.parse(a.date || 0) - Date.parse(b.date || 0)));
}

// rss-parser Atom items (YouTube feed) → football game videos (pure; unit-tested)
function kslVideos(items) {
  const out = [];
  for (const it of items || []) {
    const id = String(it.id || '').replace(/^yt:video:/, '') || ((String(it.link || '').match(/[?&]v=([A-Za-z0-9_-]{11})/) || [])[1] || '');
    if (!YT_ID.test(id) || !isFootballGame(it.title)) continue;
    if (out.some((v) => v.id === id)) continue;
    out.push({ id, title: String(it.title).trim(), ...splitTeams(String(it.title).split(/\s+[-–|]\s+/)[0]), published: iso(it.isoDate || it.pubDate), url: `https://www.youtube.com/watch?v=${id}`, live: null, score: null });
  }
  return out;
}

// videos.list items → { id: { live: 'live'|'upcoming'|null, start } } (pure; unit-tested)
function badgeIndex(items) {
  const idx = {};
  for (const v of items || []) {
    if (!v || !YT_ID.test(String(v.id || ''))) continue;
    const st = v.snippet && v.snippet.liveBroadcastContent; const d = v.liveStreamingDetails || {};
    const live = st === 'live' ? 'live' : st === 'upcoming' ? 'upcoming' : null;
    idx[v.id] = { live, start: iso(live === 'live' ? d.actualStartTime || d.scheduledStartTime : d.scheduledStartTime) };
  }
  return idx;
}

module.exports = function makeHsfb({ cached, fetchJSON, fetchText, parser, env = process.env, UA = 'OldSchoolSports' }) {
  const WATCH_API = env.HSFB_WATCH_BASE || 'https://watch.product.api.espn.com/api/product/v3/watchespn/web';
  const Q = 'tz=America%2FNew_York&lang=en&countryCode=US';
  const RSS = env.HSFB_KSL_RSS || `https://www.youtube.com/feeds/videos.xml?channel_id=${KSL_CHANNEL}`;
  const YT = env.YOUTUBE_API_BASE || 'https://www.googleapis.com/youtube/v3';
  const key = () => String(env.YOUTUBE_API_KEY || '').trim();
  const yt = { calls: 0, day: '', last: null, error: null }; // status counters (never the key)
  const scrub = (s) => { const k = key(); let o = String(s || ''); if (k) o = o.split(k).join('[key]'); return o.slice(0, 120); };

  async function ytGet(path, params) {
    const k = key(); if (!k) throw new Error('no key');
    const day = new Date().toISOString().slice(0, 10); if (yt.day !== day) { yt.day = day; yt.calls = 0; }
    yt.calls += 1;
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 6000);
    try {
      const r = await fetch(`${YT}/${path}?${new URLSearchParams(params)}`, { headers: { 'X-Goog-Api-Key': k, Accept: 'application/json', 'User-Agent': UA }, signal: ctl.signal });
      if (!r.ok) throw new Error(`YouTube API HTTP ${r.status}`);
      const j = await r.json(); yt.last = new Date().toISOString(); yt.error = null; return j;
    } catch (e) { yt.error = scrub(e.name === 'AbortError' ? 'YouTube API timeout' : e.message); throw new Error(yt.error); }
    finally { clearTimeout(timer); }
  }

  async function tv() {
    return cached('hs:tv', 5 * 60e3, async () => {
      const home = await (env.HSFB_WATCH_BASE ? cached('hs:ew:home', 5 * 60e3, () => fetchJSON(`${WATCH_API}/home?${Q}`)) : cached('ew:home', 5 * 60e3, () => fetchJSON(`${WATCH_API}/home?${Q}`)));
      const lb = ((home.page || {}).buckets || []).find((b) => b.name === 'Leagues');
      const urls = (lb ? lb.contents : []).filter((c) => c.name === 'High School Football' && c.links && c.links.self).map((c) => c.links.self);
      const cats = await Promise.all(urls.map((u) => fetchJSON(u).catch(() => null)));
      const buckets = cats.filter((c) => c && c.page).flatMap((c) => c.page.buckets || []);
      return { games: tvGames(buckets).slice(0, 40), listed: !!urls.length };
    });
  }

  async function ksl() {
    const rss = await cached('hs:ksl:rss', 10 * 60e3, async () => kslVideos((await parser.parseString(await fetchText(RSS))).items));
    let vids = rss.slice(); let deep = false;
    if (key()) { // uploads playlist: 50 newest uploads for 1 unit (the RSS feed only carries 15)
      try {
        const pl = await cached('hs:ksl:pl', 10 * 60e3, async () => {
          const j = await ytGet('playlistItems', { part: 'snippet', playlistId: KSL_UPLOADS, maxResults: '50' });
          return kslVideos((j.items || []).map((i) => ({ id: (i.snippet && i.snippet.resourceId && i.snippet.resourceId.videoId) || '', title: i.snippet && i.snippet.title, isoDate: i.snippet && i.snippet.publishedAt })));
        });
        for (const v of pl) if (!vids.some((x) => x.id === v.id)) vids.push(v);
        deep = true;
      } catch { /* fail soft: RSS only */ }
    }
    vids.sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0)); vids = vids.slice(0, 50);
    let badges = false;
    if (key() && vids.length) {
      try {
        const ids = vids.map((v) => v.id).sort().join(',');
        const idx = await cached(`hs:ksl:live:${ids}`, 5 * 60e3, async () => badgeIndex((await ytGet('videos', { part: 'liveStreamingDetails,snippet', id: ids, maxResults: '50' })).items));
        vids = vids.map((v) => (idx[v.id] ? { ...v, live: idx[v.id].live, start: idx[v.id].start } : v));
        badges = true;
      } catch { /* fail soft: no badges, links still work */ }
    }
    return { videos: vids, badges, deep, channel: `https://www.youtube.com/channel/${KSL_CHANNEL}` };
  }

  async function all() {
    const [t, k] = await Promise.allSettled([tv(), ksl()]);
    const soft = (r) => (r.status === 'fulfilled' ? r.value : { error: scrub(r.reason && r.reason.message) || 'unavailable' });
    return { tv: soft(t), ksl: soft(k), updated: new Date().toISOString() };
  }
  // youtubeKey is a boolean only; the value is never returned
  const status = () => ({ youtubeKey: !!key(), youtubeApi: !key() ? 'off' : yt.error ? 'error' : yt.last ? 'ok' : 'unused', youtubeError: key() ? yt.error : null, youtubeCallsToday: yt.calls, cacheMinutes: { badges: 5, uploads: 10, rss: 10, tv: 5 } });
  return { tv, ksl, all, status };
};
Object.assign(module.exports, { tvGames, kslVideos, badgeIndex, isFootballGame, splitTeams, KSL_CHANNEL });
