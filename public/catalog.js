// Sports registry — the single source of truth for every sport the app can show (client + server read this file).
// Adding a sport is usually one entry here:
//   kind:   'team' (two-sided games: scoreboard → Gamecast box score/plays) | 'event' (cards/races: UFC, F1…) | 'golf' | 'tennis' | 'news' (headlines only)
//   family: drives the Gamecast flavour + background art: football | baseball | basketball | hockey | soccer | mma | racing | golf | tennis | boxing
//   path:   ESPN league path (site.api.espn.com/apis/site/v2/sports/<path>/scoreboard)
//   daily:  scoreboard is day-based (fetched day by day); otherwise week-based
//   polls:  ESPN /rankings has AP/coaches polls (tab 4 shows them)
//   news:   outlets for the News tab (cbs/yahoo/nyt/guardian slugs, ESPN news path, AP/Reuters search words + a must-match regex)
//   accent: the sport's accent colour for the background theme
// Nothing is turned on for anyone by default except what they pick in onboarding.
export const CATALOG = {
  // ---- the original five (behaviour unchanged) ----
  cfb:    { group: 'Football', name: 'College Football', short: 'CFB', emoji: '🏈', kind: 'team', family: 'football', path: 'football/college-football', espn: 'college-football', polls: true, tab4: 'Rankings', what: 'teams', accent: '#ff7a1a', blurb: 'FBS scores, AP poll, conference news', own: '\\b(football|CFB|NCAAF|FBS|bowl|Heisman|playoff)\\b' },
  nfl:    { group: 'Football', name: 'NFL', short: 'NFL', emoji: '🏈', kind: 'team', family: 'football', path: 'football/nfl', espn: 'nfl', tab4: 'Standings', what: 'teams', accent: '#4f8dff', blurb: 'Scores, standings, team news', own: '\\b(NFL|football|Super Bowl|quarterback|touchdown)\\b' },
  mlb:    { group: 'Baseball', name: 'MLB', short: 'MLB', emoji: '⚾', kind: 'team', family: 'baseball', path: 'baseball/mlb', espn: 'mlb', daily: true, tab4: 'Standings', what: 'teams', accent: '#ff5252', blurb: 'Scores, standings, postseason', own: '\\b(MLB|baseball|World Series|ALCS|NLCS|pitcher|home run|inning)\\b' },
  golf:   { group: 'Golf', name: 'Golf', short: 'Golf', emoji: '⛳', kind: 'golf', family: 'golf', tab4: 'Schedule', what: 'players', accent: '#2fd17a', blurb: 'PGA & LPGA leaderboards, scorecards', own: '\\b(golf|PGA|LPGA|LIV|Ryder Cup|Masters|birdie|bogey)\\b' },
  tennis: { group: 'Tennis', name: 'Tennis', short: 'Tennis', emoji: '🎾', kind: 'tennis', family: 'tennis', tab4: 'Rankings', what: 'players', accent: '#d9ec3c', blurb: 'ATP & WTA draws, results, rankings', own: '\\b(tennis|ATP|WTA|Grand Slam|Wimbledon|US Open|Roland Garros|Australian Open|Davis Cup)\\b' },

  // ---- optional catalog (off unless a user picks them) ----
  nba:    { group: 'Basketball', name: 'NBA', short: 'NBA', emoji: '🏀', kind: 'team', family: 'basketball', path: 'basketball/nba', espn: 'nba', daily: true, tab4: 'Standings', what: 'teams', accent: '#ff8a3d', blurb: 'Scores, standings, box scores',
    own: '\\b(NBA|basketball)\\b', news: { cbs: 'nba', yahoo: 'nba', nyt: 'ProBasketball', guardian: 'sport/nba', ap: 'NBA', must: '\\b(NBA|basketball)\\b' } },
  wnba:   { group: 'Basketball', name: 'WNBA', short: 'WNBA', emoji: '🏀', kind: 'team', family: 'basketball', path: 'basketball/wnba', espn: 'wnba', daily: true, tab4: 'Standings', what: 'teams', accent: '#ff6f3c', blurb: 'Scores, standings, box scores',
    own: '\\b(WNBA|basketball)\\b', news: { cbs: 'wnba', yahoo: 'wnba', guardian: 'sport/wnba', ap: 'WNBA', must: '\\b(WNBA|basketball)\\b' } },
  mcbb:   { group: 'Basketball', name: "Men's College Basketball", short: 'NCAAM', emoji: '🏀', kind: 'team', family: 'basketball', path: 'basketball/mens-college-basketball', espn: 'mens-college-basketball', daily: true, polls: true, tab4: 'Rankings', what: 'teams', accent: '#ff9f1c', blurb: 'D-I scores, AP poll, box scores',
    own: '\\b(basketball|NCAAM|March Madness|Final Four)\\b', news: { cbs: 'college-basketball', yahoo: 'ncaab', nyt: 'CollegeBasketball', ap: "men's college basketball", must: '\\b(basketball|NCAA|March Madness|Final Four)\\b' } },
  wcbb:   { group: 'Basketball', name: "Women's College Basketball", short: 'NCAAW', emoji: '🏀', kind: 'team', family: 'basketball', path: 'basketball/womens-college-basketball', espn: 'womens-college-basketball', daily: true, polls: true, tab4: 'Rankings', what: 'teams', accent: '#f472b6', blurb: 'D-I scores, AP poll, box scores',
    own: '\\b(basketball|NCAAW|March Madness|Final Four)\\b', news: { cbs: 'womens-college-basketball', yahoo: 'ncaaw', ap: "women's college basketball", must: '\\b(basketball|NCAA|March Madness|Final Four)\\b' } },
  nhl:    { group: 'Hockey', name: 'NHL', short: 'NHL', emoji: '🏒', kind: 'team', family: 'hockey', path: 'hockey/nhl', espn: 'nhl', daily: true, tab4: 'Standings', what: 'teams', accent: '#7dd3fc', blurb: 'Scores, standings, box scores',
    own: '\\b(NHL|hockey|Stanley Cup)\\b', news: { cbs: 'nhl', yahoo: 'nhl', nyt: 'Hockey', guardian: 'sport/nhl', ap: 'NHL hockey', must: '\\b(NHL|hockey|Stanley Cup)\\b' } },
  mls:    { group: 'Soccer', name: 'MLS', short: 'MLS', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/usa.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#34d399', blurb: 'Matches, table, match stats',
    own: '\\b(MLS|soccer|Major League Soccer)\\b', news: { guardian: 'football/mls', nyt: 'Soccer', ap: 'MLS soccer', must: '\\b(MLS|Major League Soccer|soccer)\\b' } },
  nwsl:   { group: 'Soccer', name: 'NWSL', short: 'NWSL', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/usa.nwsl', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#22d3ee', blurb: 'Matches, table, match stats',
    own: '\\b(NWSL|soccer)\\b', news: { ap: 'NWSL soccer', must: '\\b(NWSL|soccer)\\b' } },
  epl:    { group: 'Soccer', name: 'Premier League', short: 'EPL', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/eng.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#a78bfa', blurb: 'Matches, table, match stats',
    own: '\\b(Premier League|soccer|football)\\b', news: { guardian: 'football/premierleague', nyt: 'Soccer', ap: 'Premier League', must: '\\b(Premier League|EPL)\\b' } },
  laliga: { group: 'Soccer', name: 'LaLiga', short: 'LaLiga', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/esp.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#fb7185', blurb: 'Matches, table, match stats',
    own: '\\b(LaLiga|La Liga|soccer|football)\\b', news: { guardian: 'football/laligafootball', ap: 'La Liga', must: '\\b(La ?Liga|Real Madrid|Barcelona|Atletico)\\b' } },
  bund:   { group: 'Soccer', name: 'Bundesliga', short: 'BUN', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/ger.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#f87171', blurb: 'Matches, table, match stats',
    own: '\\b(Bundesliga|soccer|football)\\b', news: { guardian: 'football/bundesligafootball', ap: 'Bundesliga', must: '\\b(Bundesliga|Bayern|Dortmund)\\b' } },
  seriea: { group: 'Soccer', name: 'Serie A', short: 'SerieA', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/ita.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#60a5fa', blurb: 'Matches, table, match stats',
    own: '\\b(Serie A|soccer|football)\\b', news: { guardian: 'football/serieafootball', ap: 'Serie A', must: '\\b(Serie A|Juventus|Inter|Milan|Napoli|Roma)\\b' } },
  ligue1: { group: 'Soccer', name: 'Ligue 1', short: 'L1', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/fra.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#c4b5fd', blurb: 'Matches, table, match stats',
    own: '\\b(Ligue 1|soccer|football)\\b', news: { guardian: 'football/ligue1football', ap: 'Ligue 1', must: '\\b(Ligue 1|PSG|Paris Saint-Germain|Marseille)\\b' } },
  ucl:    { group: 'Soccer', name: 'Champions League', short: 'UCL', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/uefa.champions', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#93c5fd', blurb: 'Matches, league phase, match stats',
    own: '\\b(Champions League|UEFA|soccer|football)\\b', news: { guardian: 'football/championsleague', ap: 'Champions League', must: '\\b(Champions League|UEFA)\\b' } },
  ligamx: { group: 'Soccer', name: 'Liga MX', short: 'LigaMX', emoji: '⚽', kind: 'team', family: 'soccer', path: 'soccer/mex.1', espn: 'soccer', daily: true, tab4: 'Table', what: 'clubs', accent: '#4ade80', blurb: 'Matches, table, match stats',
    own: '\\b(Liga MX|soccer|futbol)\\b', news: { ap: 'Liga MX', must: '\\b(Liga MX)\\b' } },
  cbase:  { group: 'Baseball', name: 'College Baseball', short: 'CBASE', emoji: '⚾', kind: 'team', family: 'baseball', path: 'baseball/college-baseball', espn: 'college-baseball', daily: true, tab4: 'Standings', what: 'teams', accent: '#f97316', blurb: 'D-I scores and box scores (spring)',
    own: '\\b(baseball|College World Series)\\b', news: { ap: 'college baseball', must: '\\b(baseball|College World Series)\\b' } },
  softball: { group: 'Baseball', name: 'College Softball', short: 'Softball', emoji: '🥎', kind: 'news', family: 'baseball', tab4: 'News', what: 'teams', accent: '#fb923c', blurb: 'Headlines, poll and Women’s College World Series (no free scores feed)',
    own: '\\b(softball|WCWS|Women.s College World Series)\\b', news: { ap: 'college softball', must: '\\b(softball|WCWS|Women.s College World Series)\\b' } },
  // AUSL has no ESPN feed (and theausl.com's terms forbid scraping), so `provider: 'ausl'` routes it to server/ausl.js (Wikipedia game log + MLB Stats API). Results and standings only: no live scores, plays or box scores.
  ausl:   { group: 'Baseball', name: 'AUSL Pro Softball', short: 'AUSL', emoji: '🥎', kind: 'team', family: 'baseball', provider: 'ausl', daily: true, tab4: 'Standings', what: 'teams', accent: '#a855f7', blurb: 'Pro softball (Athletes Unlimited Softball League): results, standings, championship',
    own: '\\b(AUSL|Athletes Unlimited( Softball)?|pro(fessional)? softball)\\b', news: { ap: 'AUSL softball', must: '\\b(AUSL|Athletes Unlimited Softball)\\b', extra: [{ id: 'site', name: 'theausl.com (via Google News)', site: 'theausl.com', q: 'AUSL' }, { id: 'mlb', name: 'MLB.com AUSL (via Google News)', site: 'mlb.com', q: 'AUSL softball' }] } },
  gymnastics: { group: 'Gymnastics', name: 'College Gymnastics', short: 'Gym', emoji: '🤸', kind: 'news', family: 'gymnastics', tab4: 'News', what: 'teams', accent: '#c084fc', blurb: 'Headlines, rankings and NCAA championship results (no free scores feed)',
    own: '\\b(gymnastics|gymnast|NCAA gymnastics)\\b', news: { guardian: 'sport/gymnastics', ap: 'college gymnastics', must: '\\b(gymnastics|gymnast)\\b' } },
  ufc:    { group: 'Combat', name: 'UFC / MMA', short: 'UFC', emoji: '🥊', kind: 'event', family: 'mma', path: 'mma/ufc', espn: 'mma', tab4: 'Schedule', what: 'fighters', accent: '#ef4444', blurb: 'Fight cards and results',
    own: '\\b(UFC|MMA|mixed martial arts)\\b', news: { cbs: 'mma', yahoo: 'mma', ap: 'UFC', must: '\\b(UFC|MMA|mixed martial arts)\\b' } },
  boxing: { group: 'Combat', name: 'Boxing', short: 'Boxing', emoji: '🥊', kind: 'news', family: 'boxing', tab4: 'News', what: 'fighters', accent: '#f59e0b', blurb: 'Headlines only (no free scores feed)',
    own: '\\b(boxing|boxer|heavyweight|welterweight|middleweight|bout)\\b', news: { cbs: 'boxing', yahoo: 'boxing', guardian: 'sport/boxing', ap: 'boxing', must: '\\b(boxing|boxer|bout|title fight)\\b' } },
  f1:     { group: 'Racing', name: 'Formula 1', short: 'F1', emoji: '🏎️', kind: 'event', family: 'racing', path: 'racing/f1', espn: 'f1', tab4: 'Schedule', what: 'drivers', accent: '#ff3b30', blurb: 'Race weekends, sessions, results',
    own: '\\b(F1|Formula 1|Formula One|Grand Prix)\\b', news: { guardian: 'sport/formulaone', yahoo: 'motorsports', ap: 'Formula One', must: '\\b(F1|Formula (1|One)|Grand Prix)\\b' } },
  nascar: { group: 'Racing', name: 'NASCAR Cup', short: 'NASCAR', emoji: '🏁', kind: 'event', family: 'racing', path: 'racing/nascar-premier', espn: 'racing/nascar', tab4: 'Schedule', what: 'drivers', accent: '#facc15', blurb: 'Cup Series races and results',
    own: '\\b(NASCAR|Cup Series)\\b', news: { yahoo: 'motorsports', ap: 'NASCAR', must: '\\b(NASCAR|Cup Series)\\b' } },
  indy:   { group: 'Racing', name: 'IndyCar', short: 'Indy', emoji: '🏁', kind: 'event', family: 'racing', path: 'racing/irl', espn: 'racing/indycar', tab4: 'Schedule', what: 'drivers', accent: '#38bdf8', blurb: 'IndyCar races and results',
    own: '\\b(IndyCar|Indy 500|Indianapolis 500)\\b', news: { yahoo: 'motorsports', ap: 'IndyCar', must: '\\b(IndyCar|Indy ?500|Indianapolis 500)\\b' } },
};
export const CORE = ['cfb', 'nfl', 'mlb', 'golf', 'tennis'];
export const GROUPS = ['Football', 'Baseball', 'Basketball', 'Hockey', 'Soccer', 'Golf', 'Tennis', 'Gymnastics', 'Combat', 'Racing'];
