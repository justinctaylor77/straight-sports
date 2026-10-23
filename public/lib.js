// Pure helpers: settings, mute/follow matching, clustering. No DOM here.

export const LEAGUE_MUTES = {
  nba:   { label: 'NBA', words: ['NBA'] },
  wnba:  { label: 'WNBA', words: ['WNBA'] },
  nhl:   { label: 'NHL / hockey', words: ['NHL', 'hockey', 'Stanley Cup'] },
  soccer:{ label: 'Soccer / MLS', words: ['soccer', 'MLS', 'Premier League', 'World Cup'] },
  cbb:   { label: 'College basketball', words: ['basketball', 'March Madness', 'Final Four', 'NCAAB'] },
  betting:{ label: 'Betting & odds', words: ['odds', 'betting', 'sportsbook', 'parlay', 'best bets', 'point spread', 'against the spread', 'promo code'] },
  recruiting:{ label: 'Recruiting', words: ['recruit', 'recruiting', 'recruits', 'commitment', 'commits', 'decommit', 'decommits', 'four-star', 'five-star', 'three-star'] },
  portal:{ label: 'Transfer portal', words: ['transfer portal'] },
};

// Sports the app covers. NBA / WNBA are deliberately absent (and filtered server-side too).
export const SPORTS = {
  cfb:    { id: 'cfb', blurb: 'FBS scores, AP poll, conference news', name: 'College Football', short: 'CFB', emoji: '🏈', tab4: 'Rankings', what: 'teams', own: /\b(football|CFB|NCAAF|FBS|bowl|Heisman|playoff)\b/i },
  nfl:    { id: 'nfl', blurb: 'Scores, standings, team news', name: 'NFL', short: 'NFL', emoji: '🏈', tab4: 'Standings', what: 'teams', own: /\b(NFL|football|Super Bowl|quarterback|touchdown)\b/i },
  mlb:    { id: 'mlb', blurb: 'Scores, standings, postseason', name: 'MLB', short: 'MLB', emoji: '⚾', tab4: 'Standings', what: 'teams', own: /\b(MLB|baseball|World Series|ALCS|NLCS|pitcher|home run|inning)\b/i },
  golf:   { id: 'golf', blurb: 'PGA & LPGA leaderboards, scorecards', name: 'Golf', short: 'Golf', emoji: '⛳', tab4: 'Schedule', what: 'players', own: /\b(golf|PGA|LPGA|LIV|Ryder Cup|Masters|birdie|bogey)\b/i },
  tennis: { id: 'tennis', blurb: 'ATP & WTA draws, results, rankings', name: 'Tennis', short: 'Tennis', emoji: '🎾', tab4: 'Rankings', what: 'players', own: /\b(tennis|ATP|WTA|Grand Slam|Wimbledon|US Open|Roland Garros|Australian Open|Davis Cup)\b/i },
};
export const SPORT_IDS = Object.keys(SPORTS);
const SPORT_WORDS = /\b(basketball|baseball|softball|volleyball|soccer|hockey|golf|tennis|gymnastics|wrestling|track and field|cross country|swimming|lacrosse|NBA|WNBA|MLB|NHL|NFL|PGA|LPGA|ATP|WTA|football)\b/gi;
export const sportOfId = (id) => { const m = /^(nfl|mlb|golf|tennis):/.exec(String(id)); return m ? m[1] : 'cfb'; };

export const DEFAULTS = {
  v: 2, onboarded: false,
  sports: ['cfb'], sport: 'cfb', players: {},
  conferences: [], follow: [], muteTeams: [], muteLeagues: [], muteKeywords: [],
  sources: {}, straightOnly: true, sportOnly: true, theme: 'system',
};

const KEY = 'straightcfb.settings.v1'; // kept on purpose: existing installs keep their settings
export function migrate(raw) {
  const s = { ...DEFAULTS, ...raw };
  if (!raw.v || raw.v < 2) {
    // v1 (Straight CFB): football-only app. Keep everything, turn on CFB only.
    s.sports = ['cfb']; s.sport = 'cfb'; s.players = {};
    if ('footballOnly' in raw) s.sportOnly = raw.footballOnly;
    delete s.footballOnly;
    // NFL / MLB / golf used to be "other leagues" you could mute; they're sports in the app now.
    // Your feeds still exclude them unless you turn those sports on (sport-only filter).
    s.muteLeagues = (raw.muteLeagues || []).filter((l) => LEAGUE_MUTES[l]);
    s.v = 2;
  }
  s.sports = (s.sports || []).filter((x) => SPORTS[x]);
  if (!s.sports.length) s.sports = ['cfb'];
  if (!s.sports.includes(s.sport)) s.sport = s.sports[0];
  s.players = s.players || {};
  return s;
}
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    const s = migrate(raw);
    if (raw.onboarded && (!raw.v || raw.v < 2)) saveSettings(s); // persist the v1 → v2 upgrade once
    return s;
  } catch { return structuredClone(DEFAULTS); }
}
export function saveSettings(s) { localStorage.setItem(KEY, JSON.stringify(s)); }

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(w).replace(/\s+/g, '[\\s\\-_]+')}(?=$|[^\\p{L}\\p{N}])`, 'iu');

const SAFE_ABBR = new Set(['BYU', 'UCLA', 'USC', 'LSU', 'TCU', 'SMU', 'UCF', 'UNLV', 'UAB', 'UTSA', 'UTEP', 'FIU', 'FAU', 'USF', 'UCONN', 'UMASS', 'USU', 'UNM', 'NIU', 'WKU', 'FSU', 'JMU', 'ECU', 'ULM']);
const PREFIX = ['North', 'South', 'East', 'West', 'Southern', 'Northern', 'Eastern', 'Western', 'Central', 'Middle', 'Southeast', 'Southeastern', 'Northwest', 'Northwestern', 'Southwest', 'Southwestern', 'Little'];
const SUFFIX = ['State', 'Tech', 'A&M', 'Christian', 'Valley', 'Southern', 'International', 'Atlantic', 'Baptist'];

// Build a matcher (text -> bool) for a team, careful not to confuse "Utah" with "Utah State"/"Utah Tech"/"Southern Utah".
export function teamMatcher(team, allTeams = [], feedSport = null) {
  const sp = team.sport || sportOfId(team.id);
  if (sp !== 'cfb') {
    // pro teams + players: full name always; nickname / last name only inside that sport's own feed
    const pats = [esc(team.name)];
    const same = !feedSport || feedSport === sp;
    if (team.player) {
      const last = team.name.split(' ').slice(-1)[0];
      if (same && last.length >= 5) pats.push(esc(last));
    } else if (same && team.mascot) pats.push(esc(team.mascot));
    const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${pats.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');
    return (text) => re.test(text);
  }
  allTeams = allTeams.filter((t) => (t.sport || 'cfb') === 'cfb');
  const pats = [];
  pats.push(esc(team.name));                                     // "Utah Utes"
  const loc = team.location;
  const longer = allTeams.filter((t) => t.id !== team.id && t.location.toLowerCase().startsWith(loc.toLowerCase() + ' '))
    .map((t) => esc(t.location.slice(loc.length + 1).split(' ')[0]));
  const ahead = [...new Set([...SUFFIX.map(esc), ...longer])].join('|');
  const behind = PREFIX.join('|');
  pats.push(`(?<!(?:${behind})\\s)${esc(loc)}(?!\\s+(?:${ahead})\\b)(?!['’]s\\s+(?:basketball|volleyball|soccer|baseball|softball))`);
  if (team.abbr && SAFE_ABBR.has(team.abbr.toUpperCase()) && team.abbr.toUpperCase() !== loc.toUpperCase()) pats.push(esc(team.abbr));
  const re = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${pats.join('|')})(?=$|[^\\p{L}\\p{N}])`, 'u');
  return (text) => re.test(text);
}

export function itemText(it) {
  const url = (it.link || '').replace(/^https?:\/\/[^/]+/, '').replace(/[-_/.?=&]+/g, ' ');
  return `${it.title} \n ${it.summary || ''} \n ${it.categories || ''} \n ${it.source} \n ${url}`;
}

// Returns {muted: bool, reason}
export function buildMuteFilter(settings, teams, feedSport = 'cfb') {
  const words = [...(settings.muteKeywords || [])];
  for (const l of settings.muteLeagues || []) if (LEAGUE_MUTES[l]) words.push(...LEAGUE_MUTES[l].words);
  const kw = words.filter(Boolean).map((w) => ({ w, re: wordRe(w.trim()) }));
  const tm = (settings.muteTeams || []).map((id) => teams.find((t) => t.id === id)).filter(Boolean).map((t) => ({ t, m: teamMatcher(t, teams, feedSport) }));
  const own = (SPORTS[feedSport] || SPORTS.cfb).own;
  const ownWords = new Set((own.source.match(/[A-Za-z][A-Za-z ]+/g) || []).map((w) => w.toLowerCase()));
  const muteTeamIds = new Set(settings.muteTeams || []);
  return {
    text(text) {
      for (const k of kw) if (k.re.test(text)) return `keyword “${k.w}”`;
      for (const x of tm) if (x.m(text)) return `team ${x.t.short || x.t.name}`;
      return null;
    },
    item(it) {
      const t = itemText(it);
      const r = this.text(t);
      if (r) return r;
      if (settings.sportOnly) {
        // "This sport only": drop stories that are clearly about a different sport (school & local feeds mix sports)
        const head = `${it.title} ${it.summary || ''}`;
        const other = (t.match(SPORT_WORDS) || []).some((w) => !ownWords.has(w.toLowerCase()));
        if (other && !own.test(head)) return `not ${SPORTS[feedSport].short}`;
      }
      return null;
    },
    game(ev) {
      if (muteTeamIds.has(ev.home?.team?.id) || muteTeamIds.has(ev.away?.team?.id)) return 'muted team';
      if (ev.players && ev.players.some((p) => muteTeamIds.has(p.id))) return 'muted player';
      return null;
    },
    teamId: (id) => muteTeamIds.has(String(id)),
  };
}

// ---------- "Same story, different sources" clustering ----------
const STOP = new Set('a an the and or but of to in on at for with from by as is are was were be been it its this that these those after before over under into vs vs. versus his her their they he she we you i our your not no new says say said will would could can may might just more most than then up down out off about how what why who when where which week game games season college football ncaaf cfb report reports amid ahead first last next one two three four five big top team teams coach coaches player players win wins loss losses beat beats pick picks prediction predictions predict odds schedule watch time channel tv stream streaming live score scores ranking rankings poll'.split(' '));
export function tokens(title) {
  return new Set(title.toLowerCase().replace(/[’']s\b/g, '').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/[\s-]+/)
    .filter((w) => w && !STOP.has(w) && (w.length > 2 || /\d/.test(w))).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)));
}
export function similar(A, B) {
  if (A.size < 3 || B.size < 3) return false;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  if (inter < 3) return false;
  const overlap = inter / Math.min(A.size, B.size);
  const jac = inter / (A.size + B.size - inter);
  return overlap >= 0.6 || (overlap >= 0.5 && jac >= 0.3);
}
// Group headlines about the same story. A headline joins a group only if it is similar to at least
// half of the group's members (prevents "chaining" unrelated stories together).
export function cluster(items, { windowHours = 72 } = {}) {
  const groups = [];
  for (const it of items) {
    const tk = tokens(it.title); const t = Date.parse(it.published || 0) || 0;
    let best = null, bestScore = 0;
    for (const g of groups) {
      if (t && g.t && Math.abs(t - g.t) > windowHours * 3600e3) continue;
      let hits = 0; for (const m of g.toks) if (similar(tk, m)) hits++;
      if (hits && hits >= Math.ceil(g.toks.length / 2) && hits / g.toks.length > bestScore) { best = g; bestScore = hits / g.toks.length; }
    }
    if (best) { best.items.push(it); best.toks.push(tk); } else groups.push({ t, items: [it], toks: [tk] });
  }
  return groups.map((g) => g.items);
}

export function timeAgo(iso) {
  const t = Date.parse(iso || ''); if (!t) return '';
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
