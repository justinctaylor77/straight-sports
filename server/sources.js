// News source catalog. `kind` describes the outlet type (not a political rating).
// Google News "site:" searches are used for outlets that don't publish a usable public RSS feed.
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;

const CFB = [
  { id: 'ap', name: 'AP', kind: 'Wire service', defaultOn: true,
    url: gnews('site:apnews.com college football when:4d'), via: 'Google News' },
  { id: 'cbs', name: 'CBS Sports', kind: 'National', defaultOn: true,
    url: 'https://www.cbssports.com/rss/headlines/college-football/' },
  { id: 'yahoo', name: 'Yahoo Sports', kind: 'National', defaultOn: true,
    url: 'https://sports.yahoo.com/college-football/rss.xml' },
  { id: 'fox', name: 'Fox Sports', kind: 'National', defaultOn: true,
    url: 'https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/cfb' },
  { id: 'nyt', name: 'New York Times', kind: 'National', defaultOn: true,
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/CollegeFootball.xml' },
  { id: 'athletic', name: 'The Athletic', kind: 'National', defaultOn: true,
    url: 'https://www.nytimes.com/athletic/rss/college-football/' },
  { id: 'guardian', name: 'The Guardian', kind: 'International', defaultOn: false,
    url: 'https://www.theguardian.com/sport/college-football/rss' },
  { id: 'ncaa', name: 'NCAA.com', kind: 'Governing body', defaultOn: true,
    url: 'https://www.ncaa.com/news/football/fbs/rss.xml' },
  { id: 'sbnation', name: 'SB Nation', kind: 'Fan network', defaultOn: false,
    url: 'https://www.sbnation.com/rss/college-football/index.xml' },
  { id: 'sds', name: 'Saturday Down South', kind: 'Regional (SEC)', defaultOn: false,
    url: 'https://www.saturdaydownsouth.com/feed/' },
  { id: 'deseret', name: 'Deseret News', kind: 'Local (Utah)', defaultOn: true,
    url: gnews('site:deseret.com football when:7d'), via: 'Google News' },
  { id: 'sltrib', name: 'Salt Lake Tribune', kind: 'Local (Utah)', defaultOn: true,
    url: gnews('site:sltrib.com football when:7d'), via: 'Google News' },
  { id: 'ksl', name: 'KSL', kind: 'Local (Utah)', defaultOn: true,
    url: gnews('site:ksl.com football when:7d'), via: 'Google News' },
  { id: 'utah-official', name: 'Utah Athletics (official)', kind: 'Official team site', defaultOn: false,
    url: 'https://utahutes.com/rss?path=football' },
  { id: 'usu-official', name: 'Utah State Athletics (official)', kind: 'Official team site', defaultOn: false,
    url: 'https://utahstateaggies.com/rss.aspx?path=football' },
  { id: 'espn', name: 'ESPN', kind: 'National', defaultOn: false, type: 'espn-json',
    url: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football/news?limit=50' },
  // Special: per-team Google News searches (one query per followed team, all outlets).
  { id: 'gnews-teams', name: 'Google News (your teams)', kind: 'Aggregator — every outlet', defaultOn: true, type: 'team-search' },
];

// Per-sport outlets (ids are namespaced so saved CFB choices keep working).
const NFL_T = 'Cardinals|Falcons|Ravens|Bills|Panthers|Bears|Bengals|Browns|Cowboys|Broncos|Lions|Packers|Texans|Colts|Jaguars|Chiefs|Raiders|Chargers|Rams|Dolphins|Vikings|Patriots|Saints|Giants|Jets|Eagles|Steelers|49ers|Niners|Seahawks|Buccaneers|Bucs|Titans|Commanders';
const MLB_T = 'Diamondbacks|D-backs|Braves|Orioles|Red Sox|Cubs|White Sox|Reds|Guardians|Rockies|Tigers|Astros|Royals|Angels|Dodgers|Marlins|Brewers|Twins|Mets|Yankees|Athletics|Phillies|Pirates|Padres|Giants|Mariners|Cardinals|Rays|Rangers|Blue Jays|Nationals';
const MUST = {
  nfl: `\\b(NFL|Super Bowl|quarterback|touchdown|football|${NFL_T})\\b`,
  mlb: `\\b(MLB|baseball|World Series|ALCS|NLCS|pitcher|home run|inning|${MLB_T})\\b`,
  golf: '\\b(golf|golfer|PGA|LPGA|LIV|Ryder Cup|Solheim|Masters|DP World Tour|birdie|bogey|Augusta)\\b',
  tennis: '\\b(tennis|ATP|WTA|Wimbledon|Roland Garros|French Open|US Open|Australian Open|Grand Slam|Davis Cup|Billie Jean King Cup)\\b',
};
const ESPN_NEWS = (p) => `https://site.api.espn.com/apis/site/v2/sports/${p}/news?limit=50`;
const pro = (sp, label, o) => [
  // Google News site: searches are fuzzy and pull in unrelated wire stories, so wire items must mention the sport.
  { id: `${sp}-ap`, name: 'AP', kind: 'Wire service', defaultOn: true, url: gnews(`site:apnews.com ${o.ap} when:4d`), via: 'Google News', must: MUST[sp] },
  { id: `${sp}-reuters`, name: 'Reuters', kind: 'Wire service', defaultOn: true, url: gnews(`site:reuters.com ${o.ap} when:7d`), via: 'Google News', must: MUST[sp] },
  { id: `${sp}-cbs`, name: 'CBS Sports', kind: 'National', defaultOn: true, url: `https://www.cbssports.com/rss/headlines/${o.cbs}/` },
  ...(o.yahoo ? [{ id: `${sp}-yahoo`, name: 'Yahoo Sports', kind: 'National', defaultOn: true, url: `https://sports.yahoo.com/${o.yahoo}/rss.xml` }] : []),
  ...(o.nyt ? [{ id: `${sp}-nyt`, name: 'New York Times', kind: 'National', defaultOn: true, url: `https://rss.nytimes.com/services/xml/rss/nyt/${o.nyt}.xml` }] : []),
  ...(o.guardian ? [{ id: `${sp}-guardian`, name: 'The Guardian', kind: 'International', defaultOn: !!o.guardianOn, url: `https://www.theguardian.com/sport/${o.guardian}/rss` }] : []),
  ...(o.extra || []),
  { id: `${sp}-espn`, name: 'ESPN', kind: 'National', defaultOn: false, type: 'espn-json', url: ESPN_NEWS(o.espn) },
  { id: `${sp}-gnews-teams`, name: `Google News (your ${o.who})`, kind: 'Aggregator — every outlet', defaultOn: true, type: 'team-search' },
];
const BY_SPORT = {
  cfb: CFB,
  nfl: pro('nfl', 'NFL', { ap: 'NFL', cbs: 'nfl', yahoo: 'nfl', nyt: 'ProFootball', guardian: 'nfl', espn: 'football/nfl', who: 'teams',
    extra: [{ id: 'nfl-ksl', name: 'KSL', kind: 'Local (Utah)', defaultOn: false, url: gnews('site:ksl.com NFL when:7d'), via: 'Google News' }] }),
  mlb: pro('mlb', 'MLB', { ap: 'MLB baseball', cbs: 'mlb', yahoo: 'mlb', nyt: 'Baseball', guardian: 'sport/baseball'.replace('sport/', ''), espn: 'baseball/mlb', who: 'teams' }),
  golf: pro('golf', 'Golf', { ap: 'golf', cbs: 'golf', yahoo: 'golf', nyt: 'Golf', guardian: 'golf', guardianOn: true, espn: 'golf/pga', who: 'players',
    extra: [{ id: 'golf-pgatour', name: 'PGA Tour (official)', kind: 'Official tour site', defaultOn: false, url: gnews('site:pgatour.com when:7d'), via: 'Google News' },
      { id: 'golf-lpga', name: 'LPGA (official)', kind: 'Official tour site', defaultOn: false, url: gnews('site:lpga.com when:7d'), via: 'Google News' }] }),
  tennis: pro('tennis', 'Tennis', { ap: 'tennis', cbs: 'tennis', yahoo: 'tennis', nyt: 'Tennis', guardian: 'tennis', guardianOn: true, espn: 'tennis/atp', who: 'players',
    extra: [{ id: 'tennis-atp', name: 'ATP Tour (official)', kind: 'Official tour site', defaultOn: false, url: gnews('site:atptour.com when:7d'), via: 'Google News' },
      { id: 'tennis-wta', name: 'WTA (official)', kind: 'Official tour site', defaultOn: false, url: gnews('site:wtatennis.com when:7d'), via: 'Google News' }] }),
};
const ALL = [];
for (const [sport, list] of Object.entries(BY_SPORT)) for (const s of list) ALL.push({ ...s, sport });
module.exports = ALL;
module.exports.BY_SPORT = BY_SPORT;
module.exports.gnews = gnews;
