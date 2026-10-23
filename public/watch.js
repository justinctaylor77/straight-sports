// Where to watch: network catalog, TV/streaming providers, and the per-game "Watch on …" buttons.
// Deep links: ESPN-family games come with a game-specific WatchESPN player link from the server (espnWatch).
// Everything else links to the network's / provider's own live or sports page (verified URLs, Oct 2026).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ESPN_WATCH = 'https://www.espn.com/watch/';
// key: [display name, live/watch URL (null = plain label), has on-demand replays?, ESPN-app network?, aliases…]
const N = {
  espn: ['ESPN', ESPN_WATCH, true, true, 'espn', 'espn2', 'espnu', 'espnews', 'espn deportes', 'espn unlimited', 'espn on abc', 'espn3', 'espn+', 'espn plus', 'secn', 'sec network', 'secn+', 'sec network+', 'accn', 'acc network', 'accnx', 'acc network extra', 'longhorn network', 'lhn', 'espn app'],
  abc: ['ABC', ESPN_WATCH, true, true, 'abc'],
  disney: ['Disney+', 'https://www.disneyplus.com/', true, false, 'disney+', 'disney plus'],
  hulu: ['Hulu', 'https://www.hulu.com/live', true, false, 'hulu'],
  fox: ['Fox', 'https://www.foxsports.com/live', false, false, 'fox', 'fs1', 'fs2', 'fox sports 1', 'fox deportes', 'btn', 'big ten network', 'big ten net', 'fox one'],
  cbs: ['CBS', 'https://www.cbs.com/live-tv/stream/', false, false, 'cbs', 'cbssn', 'cbs sports network', 'cbs sports net'],
  paramount: ['Paramount+', 'https://www.paramountplus.com/sports/', true, false, 'paramount+', 'paramount plus'],
  nbc: ['NBC', 'https://www.nbc.com/live', false, false, 'nbc', 'nbcsn', 'telemundo', 'universo', 'nbc sports'],
  usa: ['USA Network', 'https://www.usanetwork.com/live', false, false, 'usa net', 'usa network', 'usa'],
  golf: ['Golf Channel', 'https://www.golfchannel.com/watch', false, false, 'golf chnl', 'golf channel', 'golf'],
  peacock: ['Peacock', 'https://www.peacocktv.com/sports', true, false, 'peacock'],
  tnt: ['TNT Sports', 'https://www.hbomax.com/sports', true, false, 'tnt', 'tbs', 'trutv', 'tru tv', 'tnt sports', 'hbo max', 'max'],
  prime: ['Prime Video', 'https://www.amazon.com/gp/video/storefront/sports', true, false, 'prime video', 'amazon prime video', 'prime'],
  netflix: ['Netflix', 'https://www.netflix.com/', true, false, 'netflix'],
  apple: ['Apple TV', 'https://tv.apple.com/sports', true, false, 'apple tv', 'apple tv+', 'mls season pass'],
  nflnet: ['NFL Network', 'https://www.nfl.com/network/watch', false, false, 'nfl net', 'nfl network', 'nfln', 'nfl redzone'],
  nflplus: ['NFL+', 'https://www.nfl.com/plus/', true, false, 'nfl+', 'nfl plus'],
  mlbnet: ['MLB Network', 'https://www.mlb.com/network/live', false, false, 'mlb network', 'mlbn', 'mlb net'],
  mlbtv: ['MLB.TV', 'https://www.mlb.com/tv', true, false, 'mlb.tv', 'mlbtv'],
  nbatv: ['NBA TV', 'https://www.nba.com/watch', true, false, 'nba tv', 'nbatv', 'nba league pass'],
  cw: ['The CW', 'https://www.cwtv.com/', true, false, 'cw', 'the cw'],
  youtube: ['YouTube', 'https://www.youtube.com/', true, false, 'youtube'],
  bigplus: ['B1G+', 'https://www.bigtenplus.com/', true, false, 'b1g+', 'big ten+', 'big ten plus'],
  tennis: ['Tennis Channel', 'https://www.tennischannel.com/', true, false, 'tennis channel', 'tennis chnl', 't2'],
  dazn: ['DAZN', 'https://www.dazn.com/', true, false, 'dazn'],
  vix: ['ViX', 'https://www.vix.com/', true, false, 'vix'],
  bein: ['beIN Sports', 'https://www.beinsports.com/us/', true, false, 'bein', 'bein sports', 'bein sports usa'],
};
export const NETS = {}; const ALIAS = {};
for (const [k, [name, url, replay, espnApp, ...al]] of Object.entries(N)) { NETS[k] = { key: k, name, url, replay, espnApp }; al.forEach((a) => { ALIAS[a] = k; }); }
// "Prime Video (Local)", "ESPN+ (Spanish)" … → strip qualifiers before lookup
export const netKey = (name) => { const n = String(name || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); return ALIAS[n] || null; };

// Providers. `nets` = channel names they carry (raw ESPN short names, matched case-insensitively), `all` = carries every linear network.
const LINEAR_ESPN = ['espn', 'espn2', 'espnu', 'espnews', 'espn deportes', 'espn on abc', 'secn', 'sec network', 'accn', 'acc network', 'abc'];
const BIG4 = ['abc', 'cbs', 'nbc', 'fox'];
const FOXC = ['fox', 'fs1', 'fs2', 'btn', 'big ten network', 'fox deportes'];
const TNTC = ['tnt', 'tbs', 'trutv'];
export const PROVIDERS = [
  { id: 'yttv', name: 'YouTube TV', group: 'live', url: 'https://tv.youtube.com/live', nets: [...LINEAR_ESPN, ...BIG4, ...FOXC, ...TNTC, 'cbssn', 'nfl net', 'nfl network', 'mlb network', 'nba tv', 'golf chnl', 'golf channel', 'usa net', 'usa network', 'cw', 'telemundo', 'universo', 'tennis channel'] },
  { id: 'hulu', name: 'Hulu + Live TV', group: 'live', url: 'https://www.hulu.com/live', nets: [...LINEAR_ESPN, ...BIG4, ...FOXC, ...TNTC, 'cbssn', 'nfl net', 'nfl network', 'golf chnl', 'golf channel', 'usa net', 'usa network', 'cw', 'espn+', 'hulu', 'disney+'] },
  { id: 'sling', name: 'Sling TV', group: 'live', url: 'https://watch.sling.com/', nets: ['espn', 'espn2', 'espnews', 'abc', 'nbc', 'fox', 'fs1', 'usa net', 'usa network', 'nfl net', 'nfl network', 'cw', ...TNTC] },
  { id: 'fubo', name: 'Fubo', group: 'live', url: 'https://www.fubo.tv/p/live', nets: [...LINEAR_ESPN, ...BIG4, ...FOXC, 'cbssn', 'nfl net', 'nfl network', 'mlb network', 'nba tv', 'golf chnl', 'golf channel', 'usa net', 'usa network', 'cw', 'bein', 'bein sports', 'telemundo'] },
  { id: 'dtvs', name: 'DirecTV Stream', group: 'live', url: 'https://stream.directv.com/', nets: [...LINEAR_ESPN, ...BIG4, ...FOXC, ...TNTC, 'cbssn', 'nfl net', 'nfl network', 'mlb network', 'nba tv', 'golf chnl', 'golf channel', 'usa net', 'usa network', 'cw', 'tennis channel'] },
  { id: 'tve', name: 'Cable / satellite', sub: 'Sign in with TV provider on each network’s app', group: 'live', url: null, all: true },
  { id: 'espnplus', name: 'ESPN (ESPN+ / Unlimited)', group: 'stream', url: ESPN_WATCH, nets: ['espn+', 'espn unlimited', ...LINEAR_ESPN.filter((x) => x !== 'abc'), 'secn+', 'accnx'] },
  { id: 'peacock', name: 'Peacock', group: 'stream', url: 'https://www.peacocktv.com/sports', nets: ['peacock', 'nbc'] },
  { id: 'paramount', name: 'Paramount+', group: 'stream', url: 'https://www.paramountplus.com/sports/', nets: ['paramount+', 'cbs'] },
  { id: 'prime', name: 'Prime Video', group: 'stream', url: 'https://www.amazon.com/gp/video/storefront/sports', nets: ['prime video'] },
  { id: 'netflix', name: 'Netflix', group: 'stream', url: 'https://www.netflix.com/', nets: ['netflix'] },
  { id: 'appletv', name: 'Apple TV', group: 'stream', url: 'https://tv.apple.com/sports', nets: ['apple tv', 'apple tv+', 'mls season pass'] },
  { id: 'hbomax', name: 'HBO Max', group: 'stream', url: 'https://www.hbomax.com/sports', nets: [...TNTC, 'hbo max', 'max'] },
  { id: 'foxone', name: 'Fox One', group: 'stream', url: 'https://www.foxsports.com/live', nets: FOXC },
  { id: 'disney', name: 'Disney+', group: 'stream', url: 'https://www.disneyplus.com/', nets: ['disney+'] },
  { id: 'mlbtv', name: 'MLB.TV', sub: 'Out-of-market games; local blackouts apply', group: 'stream', url: 'https://www.mlb.com/tv', nets: ['mlb.tv'], sports: ['mlb'] },
  { id: 'nflplus', name: 'NFL+', sub: 'Local & prime-time games on phone/tablet', group: 'stream', url: 'https://www.nfl.com/plus/', nets: ['nfl+'], sports: ['nfl'] },
  { id: 'nfst', name: 'NFL Sunday Ticket', sub: 'Out-of-market Sunday afternoon games', group: 'stream', url: 'https://tv.youtube.com/nflsundayticket', nets: [], sunday: true },
  { id: 'nbalp', name: 'NBA League Pass', sub: 'Out-of-market games', group: 'stream', url: 'https://www.nba.com/watch', nets: ['nba tv', 'nba league pass'], sports: ['nba'] },
  { id: 'bigplus', name: 'B1G+', group: 'stream', url: 'https://www.bigtenplus.com/', nets: ['b1g+', 'big ten+'] },
  { id: 'dazn', name: 'DAZN', group: 'stream', url: 'https://www.dazn.com/', nets: ['dazn'] },
  { id: 'none', name: 'Other / none', group: 'other', url: null, nets: [] },
];
export const providerById = (id) => PROVIDERS.find((p) => p.id === id);
const norm = (n) => String(n || '').toLowerCase().replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
const isLinear = (n) => { const k = netKey(n); return !!k && !['peacock', 'prime', 'netflix', 'apple', 'youtube', 'paramount', 'disney', 'hulu', 'nflplus', 'mlbtv', 'bigplus', 'dazn', 'vix'].includes(k) && !/\+|unlimited/i.test(n); };
function carries(p, net, ev) {
  if (p.all) return isLinear(net);
  const n = norm(net);
  return (p.nets || []).includes(n);
}
// Does provider p give access to this game at all (via a carried channel or a sport-wide pass)?
function providerNets(p, ev) {
  const nets = ev.nets || [];
  const hit = nets.filter((n) => carries(p, n, ev));
  if (!hit.length && p.sports && p.sports.includes(ev.sport) && ev.state !== 'post') return ['All games'];
  if (!hit.length && p.sunday && ev.sport === 'nfl' && new Date(ev.date).getDay() === 0 && nets.some((n) => /^(cbs|fox)$/i.test(norm(n)))) return ['Out-of-market'];
  return hit;
}

// Find the WatchESPN game link for a network (falls back to the game's first ESPN stream).
function espnLink(ev, net, replay) {
  const w = ev.espnWatch; if (!w || !w.streams || !w.streams.length) return null;
  const want = replay ? (s) => s.status === 'replay' : (s) => s.status !== 'replay';
  const pool = w.streams.filter(want); if (!pool.length) return null;
  const n = norm(net);
  return (pool.find((s) => norm(s.net) === n) || pool.find((s) => netKey(s.net) === netKey(net)) || pool[0]).web;
}

const A = (href, cls, label, sub, title) => `<a class="wbtn ${cls}" href="${esc(href)}" target="_blank" rel="noopener" title="${esc(title || label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z"/></svg><span><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span></a>`;

// ev: { sport, state ('pre'|'in'|'post'), date, nets: [...], espnWatch? }. mine: provider ids.
export function watchButtons(ev, mine = [], { compact = false } = {}) {
  const nets = ev.nets || []; const post = ev.state === 'post';
  if (!nets.length && !(ev.espnWatch && ev.espnWatch.streams && ev.espnWatch.streams.length)) return '';
  const provs = mine.map(providerById).filter((p) => p && p.id !== 'none');
  const out = []; const plain = [];
  const haveNet = (n) => provs.some((p) => carries(p, n, ev));
  if (!post) {
    for (const p of provs) {
      if (!p.url) continue; // TV-provider sign-in: handled by highlighting each network's own button
      const via = providerNets(p, ev); if (!via.length) continue;
      out.push(A(p.url, 'prov mine', `Watch on ${p.name}`, via.join(' · '), `Open ${p.name}${p.id === 'yttv' ? ' (live guide)' : ''}`));
    }
  }
  const seen = new Set(); const netBtns = [];
  const espnNets = nets.length ? nets : [...new Set(ev.espnWatch.streams.map((s) => s.net))];
  for (const n of espnNets) {
    const k = netKey(n); const net = k && NETS[k];
    if (!net || !net.url) { if (!post) plain.push(n); continue; }
    const deep = net.espnApp ? espnLink(ev, n, post) : null;
    if (post && !(net.replay && (deep || !net.espnApp))) continue;
    const href = deep || net.url; const id = `${k}|${href}`; if (seen.has(id)) continue; seen.add(id);
    const label = n.replace(/\s*\(.*?\)\s*/g, '').trim() || net.name;
    const own = haveNet(n);
    netBtns.push({ own, html: A(href, `net ${own ? 'mine' : ''} ${deep ? 'deep' : ''}`, `${post ? 'Replay' : 'Watch'} on ${label}`, deep ? (post ? 'Full replay' : 'Game link') : (post ? 'On demand' : ''), deep ? `Open this game in WatchESPN` : `Open ${net.name}`) });
  }
  netBtns.sort((a, b) => b.own - a.own).forEach((b) => out.push(b.html));
  if (!out.length && !plain.length) return '';
  return `<div class="watch ${compact ? 'compact' : ''}">${out.join('')}${plain.length ? `<span class="wplain">${post ? '' : 'Also on '}${plain.map(esc).join(', ')}</span>` : ''}</div>`;
}
