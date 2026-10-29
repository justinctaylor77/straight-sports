// v1.6.0 "Single Wing": High School Football parsing + YouTube fail-soft. Real fixtures (WatchESPN HS catalog, KSL RSS, captured
// 2026-10-29) plus the SYNTHETIC QA mock (scripts/mock-hsfb.js) for live/upcoming states no captured feed contains.
const assert = require('assert'); const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const Parser = require('rss-parser');
const HS = require('../server/hsfb.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const FX = path.join(__dirname, 'fixtures', 'hsfb');
(async () => {
  // ---- WatchESPN catalog → games (real fixture: 7 replays) ----
  const cat = JSON.parse(fs.readFileSync(path.join(FX, 'watchespn-hs-catalog.json'), 'utf8'));
  const g = HS.tvGames(cat.page.buckets);
  ok(g.length === 7, 'all 7 catalog games kept');
  for (const x of g) {
    ok(x.score === null, 'never a score'); ok(/^https:\/\/www\.espn\.com\/watch\//.test(x.watch), 'espn watch link'); ok(x.networks.length > 0, 'network');
    ok(x.date && !Number.isNaN(Date.parse(x.date)), 'ISO date'); ok(x.away && x.home, 'teams split');
  }
  eq(g.find((x) => x.id === '401877220').date, '2026-10-24T00:00:00.000Z', 'utc offset -04:00 converted');
  ok(g.every((x, i) => i === 0 || Date.parse(g[i - 1].date) >= Date.parse(x.date)), 'replays newest first');
  // status ordering + bad links dropped
  const syn = HS.tvGames([{ contents: [
    { eventId: 1, status: 'replay', name: 'A vs. B', utc: '2026-10-20T19:00:00-04:00', streams: [{ source: { name: 'ESPN+' }, links: { web: 'https://www.espn.com/watch/player?id=1' } }] },
    { eventId: 2, status: 'upcoming', name: 'C vs. D', utc: '2026-11-02T19:00:00-04:00', streams: [{ source: { name: 'ESPN2' }, links: { web: 'https://evil.example.com/x' } }] },
    { eventId: 3, status: 'live', name: 'E at F', utc: '2026-10-29T19:00:00-04:00', streams: [] , subtitle: 'ESPNU • High School Football' },
    { eventId: 4, status: 'final', name: 'G vs. H' }, { status: 'live', name: 'no id' }] }]);
  eq(syn.map((x) => x.id), ['3', '2', '1'], 'live, upcoming, replay; unknown statuses and id-less items dropped');
  eq(syn[1].watch, null, 'non-espn.com/watch link rejected'); eq(syn[0].networks, ['ESPNU'], 'network from subtitle when no streams');
  eq([syn[0].away, syn[0].home], ['E', 'F'], '"at" splits teams');
  // ---- KSL RSS (real feed: volleyball + talk, no football) ----
  const parser = new Parser();
  const feed = await parser.parseString(fs.readFileSync(path.join(FX, 'ksl-rss-2026-10-29.xml'), 'utf8'));
  ok(feed.items.length >= 10, 'rss parsed'); eq(HS.kslVideos(feed.items), [], 'volleyball / talk shows filtered out');
  ok(HS.isFootballGame('Skyridge vs. Lone Peak - 6A Football Semifinal'), 'football game title');
  ok(!HS.isFootballGame('WATCH LIVE: The KSL Sports Zone'), 'show is not a game'); ok(!HS.isFootballGame('A vs. B - 4A Girls Volleyball'), 'volleyball');
  ok(!HS.isFootballGame('Utah football mailbag'), 'no matchup');
  ok(!HS.isFootballGame('Sitting at 6-1 ahead of Arizona State match up, when will BYU football lose a game again?'), 'v1.6.1: BYU talk title is not a game'); ok(!HS.isFootballGame('Hour 2: What is Trending | Sitting at 6-1 ahead of Arizona State match up, when will BYU football...'), 'v1.6.1: show segment'); ok(!HS.isFootballGame('Utah vs. BYU Football Highlights'), 'v1.6.1: college game has no HS class'); ok(HS.isFootballGame('Skyridge at Lone Peak - 6A Football'), 'v1.6.1: at with class'); ok(HS.isFootballGame('Lone Peak vs. Corner Canyon - High School Football'), 'v1.6.1: high school wording');
  const fv = HS.kslVideos(feed.items.map((i) => ({ ...i, title: i.title.replace('Girls Volleyball', 'Football') })));
  ok(fv.length >= 10 && fv.every((v) => /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(v.url) && v.score === null), 'video links');
  // ---- badge index ----
  const bi = HS.badgeIndex([{ id: 'aaaaaaaaaaa', snippet: { liveBroadcastContent: 'live' }, liveStreamingDetails: { actualStartTime: '2026-10-29T20:00:00Z' } },
    { id: 'bbbbbbbbbbb', snippet: { liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: '2026-10-30T01:00:00Z' } },
    { id: 'ccccccccccc', snippet: { liveBroadcastContent: 'none' } }, { id: 'bad', snippet: { liveBroadcastContent: 'live' } }]);
  eq(bi.aaaaaaaaaaa, { live: 'live', start: '2026-10-29T20:00:00.000Z' }, 'live'); eq(bi.bbbbbbbbbbb, { live: 'upcoming', start: '2026-10-30T01:00:00.000Z' }, 'upcoming + start');
  eq(bi.ccccccccccc.live, null, 'none'); ok(!bi.bad, 'bad id ignored');
  // ---- module against the mock: no key, key + ok API, key + failing API ----
  const port = 8768; const mock = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'mock-hsfb.js'), String(port)], { stdio: 'ignore' });
  const port2 = 8767; const mockF = spawn(process.execPath, [path.join(__dirname, '..', 'scripts', 'mock-hsfb.js'), String(port2), 'fail'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  try {
    const mk = (p, key) => { const cache = new Map(); const cached = async (k, ms, fn) => { if (cache.has(k)) return cache.get(k); const v = await fn(); cache.set(k, v); return v; };
      const fetchText = async (u) => (await fetch(u)).text(); const fetchJSON = async (u) => JSON.parse(await fetchText(u));
      return HS({ cached, fetchJSON, fetchText, parser, env: { HSFB_WATCH_BASE: `http://127.0.0.1:${p}/watch`, HSFB_KSL_RSS: `http://127.0.0.1:${p}/rss`, YOUTUBE_API_BASE: `http://127.0.0.1:${p}/youtube/v3`, ...(key ? { YOUTUBE_API_KEY: key } : {}) } }); };
    const none = mk(port, ''); const a = await none.all();
    eq(none.status().youtubeKey, false, 'status: no key'); eq(a.ksl.badges, false, 'no key: no badges');
    eq(a.ksl.videos.map((v) => v.id), ['QAlive00001', 'QAupcom0001', 'QApast00001'], 'no key: RSS football only, newest first');
    ok(a.ksl.videos.every((v) => v.live === null), 'no key: no live flags');
    eq(a.tv.games.map((x) => x.status), ['live', 'upcoming', 'upcoming', 'replay'], 'mock tv order'); ok(a.tv.games.every((x) => x.score === null), 'tv: no scores');
    const KEY = 'qa-fake-key-not-real'; const on = mk(port, KEY); const b = await on.all();
    eq(b.ksl.badges, true, 'key: badges'); eq(b.ksl.deep, true, 'key: uploads playlist merged');
    eq(b.ksl.videos.find((v) => v.id === 'QAlive00001').live, 'live', 'LIVE'); const up = b.ksl.videos.find((v) => v.id === 'QAupcom0001');
    eq(up.live, 'upcoming', 'UPCOMING'); ok(up.start, 'upcoming start'); ok(b.ksl.videos.some((v) => v.id === 'QAplaylist1'), 'playlist-only video added');
    const st = await (await fetch(`http://127.0.0.1:${port}/__stats`)).json();
    eq(st.keyInUrl, 0, 'key never in a URL'); eq(st.badKey, 0, 'key sent in header'); eq([st.videos, st.playlistItems], [1, 1], 'one call each');
    await on.all(); const st2 = await (await fetch(`http://127.0.0.1:${port}/__stats`)).json(); eq(st2.videos, 1, 'cached: no second call');
    const s = on.status(); eq(s.youtubeKey, true, 'status true'); ok(!JSON.stringify(s).includes(KEY), 'status never has the key'); eq(s.youtubeApi, 'ok', 'api ok');
    const bad = mk(port2, KEY); const c = await bad.all();
    eq(c.ksl.badges, false, 'API error: no badges'); eq(c.ksl.videos.length, 3, 'API error: RSS links still listed'); ok(c.ksl.videos.every((v) => v.url && v.live === null), 'links kept');
    const sb = bad.status(); eq(sb.youtubeApi, 'error', 'status error'); ok(!JSON.stringify(sb).includes(KEY), 'error never has the key');
  } finally { mock.kill(); mockF.kill(); }
  console.log(`hsfb: ${n} assertions passed`);
})().catch((e) => { console.error(e); process.exit(1); });
