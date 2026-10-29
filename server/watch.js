// ESPN Watch index: public, key-less WatchESPN catalog → game-specific player links.
// eventId (= ESPN gameId) → { status, streams: [{ net, web }] }. Best-effort: never blocks a response for long.
const API = 'https://watch.product.api.espn.com/api/product/v3/watchespn/web';
const Q = 'tz=America%2FNew_York&lang=en&countryCode=US';
// app sport → WatchESPN "Leagues" names
const LEAGUES = {
  cfb: ['NCAA Football'], nfl: ['NFL'], mlb: ['MLB'], nhl: ['NHL'], nba: ['NBA'], wnba: ['WNBA'],
  mcbb: ["NCAA Men's Basketball"], wcbb: ["NCAA Women's Basketball"], laliga: ['Spanish LALIGA'], nwsl: ['NWSL'],
  golf: ['PGA Tour'], cbase: ['NCAA Baseball'], mls: ['MLS'], epl: ['English Premier League'], bund: ['German Bundesliga'],
  hsfb: ['High School Football'], ucl: ['UEFA Champions League'], ufc: ['UFC'], f1: ['Formula 1'], nascar: ['NASCAR Cup Series'], indy: ['IndyCar'], tennis: ['Tennis'],
};

module.exports = function makeWatch({ cached, fetchJSON }) {
  const index = (buckets, into) => {
    for (const b of buckets || []) for (const c of b.contents || []) {
      if (!c.eventId || !/^(live|upcoming|replay)$/.test(c.status || '')) continue;
      const id = String(c.eventId); const cur = into[id] || (into[id] = { status: c.status, streams: [] });
      if (c.status === 'live' || (c.status === 'upcoming' && cur.status === 'replay')) cur.status = c.status;
      for (const s of c.streams || []) {
        const web = s.links && (s.links.web || s.links.shareUrl); const net = s.source && (s.source.name || s.source.id);
        if (!web || !/^https:\/\/www\.espn\.com\/watch\//.test(web) || !net) continue;
        if (!cur.streams.some((x) => x.web === web)) cur.streams.push({ net, web, status: s.status || c.status });
      }
    }
    return into;
  };
  const home = () => cached('ew:home', 5 * 60e3, () => fetchJSON(`${API}/home?${Q}`));
  async function leagueCatalogs(sport) {
    const h = await home(); const lb = (h.page.buckets || []).find((b) => b.name === 'Leagues');
    const want = LEAGUES[sport] || [];
    return (lb ? lb.contents : []).filter((c) => want.includes(c.name) && c.links && c.links.self).map((c) => c.links.self);
  }
  async function forSport(sport) {
    return cached(`ew:idx:${sport}`, 5 * 60e3, async () => {
      const h = await home(); const into = index(h.page.buckets, {});
      const urls = await leagueCatalogs(sport).catch(() => []);
      const cats = await Promise.all(urls.map((u) => fetchJSON(u).catch(() => null)));
      for (const c of cats) if (c && c.page) index(c.page.buckets, into);
      return into;
    });
  }
  const timeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))]);
  // Walk a response; every object carrying `nets` gets `espnWatch` if WatchESPN lists that game.
  async function attach(sport, data, ms = 2500) {
    if (!data || typeof data !== 'object') return data;
    const idx = await timeout(forSport(sport).catch(() => null), ms);
    if (!idx) return data;
    const out = JSON.parse(JSON.stringify(data));
    const walk = (o) => {
      if (Array.isArray(o)) return o.forEach(walk);
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.nets)) {
        const ids = [o.eventId, o.matchId, o.id].filter(Boolean).map((x) => String(x).replace(/^.*[-:]/, ''));
        const hit = ids.map((x) => idx[x]).find(Boolean);
        if (hit) o.espnWatch = hit;
      }
      for (const k in o) if (o[k] && typeof o[k] === 'object') walk(o[k]);
    };
    walk(out); return out;
  }
  return { forSport, attach, LEAGUES };
};
