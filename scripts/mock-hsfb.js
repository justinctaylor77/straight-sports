// QA mock for v1.6.0 High School Football (qa-v23). SYNTHETIC data only — never shown to real users.
// Serves a WatchESPN-like home + "High School Football" catalog, a KSL-like YouTube RSS feed, and a YouTube Data API v3 stand-in
// (videos.list + playlistItems.list). The API checks the key arrives in the X-Goog-Api-Key header (never in the URL).
// Usage: node scripts/mock-hsfb.js <port> [ok|fail]     GET /__stats → call counts
const http = require('http');
const port = Number(process.argv[2] || 8770); const mode = process.argv[3] || 'ok';
const FAKE_KEY = 'qa-fake-key-not-real';
const stats = { videos: 0, playlistItems: 0, keyInUrl: 0, badKey: 0, rss: 0, watch: 0, lastIds: '' };
const H = 3600e3; const now = Date.now();
const at = (ms) => new Date(Math.round((now + ms) / 60e3) * 60e3).toISOString();
const game = (id, status, name, utc, net, web) => ({ id: `qa-${id}`, eventId: id, status, name, utc, subtitle: `${net} • High School Football`, streams: [{ status, source: { id: net, name: net }, links: { web } }] });
const catalog = { page: { buckets: [
  { name: 'Live', contents: [game(990001, 'live', 'North Test High (UT) vs. South Test High (UT)', at(-H), 'ESPN2', 'https://www.espn.com/watch/player?id=qa-live')] },
  { name: 'Upcoming', contents: [game(990002, 'upcoming', 'East Test Academy (FL) vs. West Test Prep (TX)', at(50 * H), 'ESPNU', 'https://www.espn.com/watch/player?id=qa-up'),
    game(990003, 'upcoming', 'Bad Link High (CA) vs. Other High (CA)', at(74 * H), 'ESPN+', 'https://evil.example.com/watch')] },
  { name: 'On Demand', contents: [game(990004, 'replay', 'Replay Test High (MO) vs. Replay Two High (MO)', at(-120 * H), 'ESPN+', 'https://www.espn.com/watch/player?id=qa-rep')] },
] } };
const entry = (id, title, pub) => `<entry><id>yt:video:${id}</id><yt:videoId>${id}</yt:videoId><title>${title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${id}"/><published>${pub}</published></entry>`;
const rss = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns="http://www.w3.org/2005/Atom"><title>KSL Sports (QA mock)</title>
${entry('QAlive00001', 'Test Ridge vs. Test Canyon - 6A Football Quarterfinal', at(-0.5 * H))}
${entry('QAupcom0001', 'Test Valley vs. Test Peak - 5A Football Semifinal', at(-2 * H))}
${entry('QApast00001', 'Test Fork vs. Test Grove - 4A Football First Round', at(-30 * H))}
${entry('QAvolley001', 'Test Fork vs. Test Grove - 4A Girls Volleyball First Round', at(-3 * H))}
${entry('QAzone00001', 'WATCH LIVE: The KSL Sports Zone', at(-1 * H))}
</feed>`;
const LIVE = { QAlive00001: { snippet: { liveBroadcastContent: 'live' }, liveStreamingDetails: { actualStartTime: at(-0.5 * H), scheduledStartTime: at(-0.6 * H) } },
  QAupcom0001: { snippet: { liveBroadcastContent: 'upcoming' }, liveStreamingDetails: { scheduledStartTime: at(26 * H) } } };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${port}`);
  if (u.pathname === '/__stats') return send(res, 200, stats);
  if (u.pathname === '/watch/home') { stats.watch++; return send(res, 200, { page: { buckets: [{ name: 'Leagues', contents: [{ name: 'High School Football', links: { self: `http://127.0.0.1:${port}/watch/catalog/hs` } }] }] } }); }
  if (u.pathname === '/watch/catalog/hs') return send(res, 200, catalog);
  if (u.pathname === '/rss') { stats.rss++; return send(res, 200, rss, 'application/atom+xml'); }
  if (u.pathname.startsWith('/youtube/v3/')) {
    const kind = u.pathname.split('/').pop(); if (kind in stats) stats[kind]++;
    if (u.searchParams.has('key')) stats.keyInUrl++;
    if (req.headers['x-goog-api-key'] !== FAKE_KEY) { stats.badKey++; return send(res, 403, { error: { code: 403, message: 'bad key' } }); }
    if (mode === 'fail') return send(res, 500, { error: { code: 500, message: 'backendError' } });
    if (kind === 'videos') {
      const ids = (u.searchParams.get('id') || '').split(',').filter(Boolean); stats.lastIds = ids.join(',');
      return send(res, 200, { items: ids.map((id) => ({ id, snippet: { liveBroadcastContent: 'none', ...(LIVE[id] || {}).snippet }, liveStreamingDetails: (LIVE[id] || {}).liveStreamingDetails })) });
    }
    if (kind === 'playlistItems') return send(res, 200, { items: [{ snippet: { title: 'Test Hollow vs. Test Bluff - 3A Football Quarterfinal', publishedAt: at(-50 * H), resourceId: { videoId: 'QAplaylist1' } } }] });
    return send(res, 404, {});
  }
  send(res, 404, {});
}).listen(port, '127.0.0.1', () => console.log(`mock-hsfb on ${port} (${mode})`));
