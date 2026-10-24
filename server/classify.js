// Heuristic "is this straight news?" classifier. Returns {type, reasons[]}.
// type: 'news' | 'opinion' | 'analysis' | 'betting' | 'media'
const RULES = [
  // [type, regex tested against title, regex tested against URL]
  ['opinion', /\b(opinion|column|columnist|commentary|editorial|hot takes?|my take|takes?:|\brant\b|mailbag|overreact\w*|sound off|i think|we think|my (picks|thoughts|ballot)|unpopular|bold (prediction|take)s?|letters?:)/i,
              /\/(opinion|opinions|column|columns|commentary|editorial|blogs?|mailbag|takes?)\//i],
  ['opinion', /\b(should|must|needs? to|has to|deserves?|why .{3,60} (is|are|will|won't|can't)|it's time|stop |enough with|overrated|underrated|embarrass\w*|disgrace\w*|pathetic|clown\w*|frauds?|winners and losers|grades?\b|report card)/i, null],
  ['analysis', /\b(predictions?|picks?\b|projections?|power rankings|bowl projections|playoff projections|takeaways|what we learned|things to know|storylines|observations|film (room|study|review)|best and worst|ranking (every|all)|tiers?\b|bracketology|stock (up|down)|predicts?|burning questions|biggest questions|landing spots|rumou?rs?|speculat\w*|could be in for|\d+ things|three things|keys to (the game|victory)|scouting report|what to watch)/i,
              /\/(analysis|predictions?|picks)\//i],
  ['betting', /\b(odds|betting|bets?\b|point spread|against the spread|ATS|over\/under|parlay|best bets|lines?\b.*\bpicks|sportsbook|promo code|bonus code|DFS)\b/i,
              /\/(betting|odds|sportsbook|gambling)\//i],
  ['media', /\b(podcast|video|watch:|how to (watch|attend|stream|listen)|listen|live stream|how to watch|tv channel|streaming|radio show|livestream|highlights)\b/i,
              /\/(video|videos|podcasts?|watch)\//i],
];

function classify(title = '', url = '', extra = '') {
  const reasons = [];
  let type = 'news';
  const reported = /\b(says|said|believes|told|tells|admits|explains|according to)\b|[“”"]/i.test(title);
  RULES.forEach(([t, titleRe, urlRe], i) => {
    // Rule 1 (should/must/etc.) is skipped for attributed quotes: "Coach says team must..." is reporting.
    let mt = titleRe && (title.match(titleRe));
    if (i === 1 && reported) mt = null;
    const mu = urlRe && url && url.match(urlRe);
    if (mt || mu) {
      if (type === 'news') type = t;
      reasons.push(`${t}: ${mt ? `"${mt[0].trim()}" in title` : `"${mu[0]}" in URL`}`);
    }
  });
  // categories from feeds, e.g. <category>Opinion</category>
  if (/\b(opinion|column|commentary|editorial)\b/i.test(extra)) {
    if (type === 'news') type = 'opinion';
    reasons.push('opinion: feed category');
  }
  // Question headlines are usually speculation/analysis, not reporting
  if (type === 'news' && /\?/.test(title.replace(/[“"][^”"]*[”"]/g, ''))) { type = 'analysis'; reasons.push('analysis: question headline'); }
  return { type, reasons };
}

// ---------- "is this sports at all?" ----------
// Feeds like Google News searches and wire "site:" queries return plenty of non-sports stories (politics, business, celebrity gossip,
// crime, weather, a company that happens to share a team name). Two checks, both cheap and explainable:
//   1. an off-topic section in the URL (/politics/, /business/, /entertainment/ …) or off-topic words in the headline,
//      which only survive when the headline ALSO has a clear sports signal ("Trump to attend Army-Navy game").
//   2. strict mode (aggregators): the headline/categories must have a sports signal at all.
const OFF_URL = /\/(politics?|elections?|business|markets?|money|finance|economy|entertainment|celebrity|celebrities|culture|arts?|movies?|film|tv|television|music|lifestyle|life-and-style|style|food|travel|health|science|tech(nology)?|world|us-news|uk-news|national|crime|weather|real-estate|local-news|obituar(y|ies))\//i;
const SPORT_URL = /\/(sports?|nfl|mlb|nba|nhl|mls|ncaa|college-football|football|baseball|basketball|hockey|soccer|golf|tennis|racing|boxing|mma|ufc|cfb)\b/i;
const OFF_WORDS = /\b(politic\w*|election\w*|campaign trail|congress\w*|senat(e|or|ors)|house republicans|white house|president (trump|biden)|trump|biden|harris|vance|democrat\w*|republican\w*|gop\b|governor|legislat\w*|lawmakers?|supreme court|immigration|tariffs?|shutdown|stock market|wall street|dow jones|nasdaq|s&p 500|inflation|federal reserve|interest rates?|earnings (report|call)|quarterly (results|earnings)|\bipo\b|crypto\w*|bitcoin|real estate|mortgage|celebrit\w+|hollywood|box office|movie|film review|tv (show|series)|netflix|hulu|disney\+|streaming (series|show)|album|singer|rapper|actor|actress|oscars?|emmys?|grammys?|red carpet|royal family|kardashian|taylor swift|horoscope|recipes?|lottery|powerball|mega millions|ukraine|gaza|hamas|israel\w*|russia\w*|north korea|nato\b|military|pentagon|police (say|said|officer)|homicide|murder\w*|sentenced|indicted|lawsuit|wildfires?|hurricane|earthquake|tornado|blizzard|weather forecast|power outage|school board|covid|vaccine|cancer|data centers?|artificial intelligence|tech giants?|chatbots?|startups?|software|cheating scandal|floods?|flooding|motorcyclist|killed after|nude|museum|school district|archives?|bikini|glam\w*|outfits?|fashion|miu miu|poses? in|instagram|tiktok|music video|new song|shirtless|divorce|wife|husband|girlfriend|boyfriend|wedding|pregnan\w*|baby|breakup|dating)\b/i;
const SPORTS_WORDS = /\b(takeaways?|offense|defense|checkdown|recap|preview|matchup|notre dame|saban|predictions?|qbs?|hoops|gameday|pitche[sd]|series lead|alcs|nlcs|afc|nfc|cheerleaders?|jersey|uniforms?|mascot|medal\w*|dies at|died at|no\. \d+|game|games|season|seasons|coach|coaches|coaching|quarterback|running back|receiver|linebacker|defensive|offensive|touchdown|field goal|pitcher|pitching|batter|home run|inning|innings|rbi|era\b|strikeout|bullpen|shortstop|outfielder|goalie|goalkeeper|striker|midfielder|penalty kick|power play|slam dunk|rebound|three-pointer|point guard|center|forward|catcher|rookie|veteran|draft|free agen\w+|trade[ds]?|waiver|roster|depth chart|injur\w+|injured reserve|ir\b|suspend\w*|suspension|play(er|ers|off|offs|ing|ed)|team|teams|league|conference|division|tournament|champion\w*|title|finals?|semifinal\w*|quarterfinal\w*|bowl|cfp|playoffs?|postseason|preseason|spring game|scrimmage|recruit\w*|transfer portal|commit(s|ted|ment)?|signs?\b.*\b(contract|extension|deal)|contract|extension|rankings?|ranked|poll|top 25|heisman|mvp|all-star|hall of fame|win(s|ning)?|won|beat(s)?|defeat\w*|lose(s)?|lost|loss|upset|victory|score[sd]?|scoring|points|yards|goals?|assists?|saves?|tackles?|sacks?|interceptions?|fumbles?|overtime|halftime|kickoff|tip-?off|first pitch|walk-?off|stadium|arena|ballpark|fans?|nfl|mlb|nba|wnba|nhl|mls|ncaa|ncaaf|fbs|fcs|sec|acc|big ten|big 12|mountain west|pac-12|sun belt|pga|lpga|liv golf|atp|wta|ufc|bellator|pfl|fifa|uefa|premier league|la liga|bundesliga|serie a|champions league|world cup|olympic\w*|paralympic\w*|grand slam|wimbledon|us open|french open|australian open|roland garros|masters|ryder cup|solheim|birdie|bogey|eagle|fairway|tee time|leaderboard|round of|tennis|golf|golfer|baseball|football|basketball|hockey|soccer|boxing|boxer|wrestl\w+|racing|nascar|formula (1|one)|f1|indycar|motogp|grand prix|rugby|cricket|volleyball|softball|lacrosse|gymnast\w*|swimmer|swimming|track and field|marathon|athlete\w*|sports?|knockout|tko|bout|fighter|octagon|pole position|qualifying)\b/i;

// STRONG = unmistakably sports words (leagues, sports, positions, game terms). Used to rescue a headline that also trips an off-topic word.
const STRONG = /\b(medal|gameday|qbs?|alcs|nlcs|nfl|mlb|nba|wnba|nhl|mls|ncaa|ncaaf|fbs|fcs|cfp|pga|lpga|atp|wta|ufc|fifa|uefa|nascar|indycar|motogp|premier league|la liga|bundesliga|serie a|champions league|world cup|super bowl|world series|stanley cup|march madness|final four|heisman|big ten|big 12|mountain west|sun belt|quarterback|running back|wide receiver|linebacker|touchdown|field goal|pitcher|home run|shortstop|goalie|goalkeeper|point guard|power play|coach|coaches|playoffs?|postseason|preseason|football|baseball|basketball|hockey|soccer|golf|golfer|tennis|boxing|wrestling|rugby|cricket|volleyball|softball|lacrosse|racing|formula (1|one)|grand prix|wimbledon|grand slam|ryder cup|birdie|stadium|halftime|kickoff|overtime|injured reserve|transfer portal|recruit\w*|touchdowns?|innings?|strikeouts?|olympics?|athlete\w*|tournament|championship|playoff|bowl game|spring game|depth chart|free agen\w+)\b/i;
// local general-news outlets (the Utah ones) also get a pass for the local teams' names
const TEAM_WORDS = /\b(BYU|Utes?|Cougars?|Aggies|USU|Jazz|Mammoth|Real Salt Lake|RSL|Wildcats|Wolverines|Buckeyes|Bulldogs|Trojans|Cowboys|Broncos|Chiefs|Seahawks|49ers|Niners|Bears|Giants|Yankees|Dodgers|Padres|Astros|Cubs)\b/;
function sportsCheck(title = '', url = '', extra = '', { strict = false } = {}) {
  const t = `${title} ${extra}`;
  const strong = STRONG.test(t); const weak = strong || SPORTS_WORDS.test(t);
  let path = ''; try { path = new URL(url).pathname + '/'; } catch { path = ''; }
  if (OFF_URL.test(path) && !SPORT_URL.test(path) && !strong) return { ok: false, why: 'off-topic section in URL' };
  if (/[\u{1D400}-\u{1D7FF}\uFF21-\uFF5A]|\[\*\*LIVESTREAM|\+\[#!LIVE/u.test(title)) return { ok: false, why: 'stream-spam headline' };
  if (!strong && title.trim().split(/\s+/).length < 3) return { ok: false, why: 'not a headline' };
  const off = OFF_WORDS.exec(title);
  if (off && !strong) return { ok: false, why: `non-sports headline ("${off[0]}")` };
  if (strict && !weak && !TEAM_WORDS.test(t)) return { ok: false, why: 'no sports signal in headline' };
  return { ok: true };
}
module.exports = { classify, sportsCheck };
