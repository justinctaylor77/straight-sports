// Pure helpers for the favorite-teams picker (no DOM): league grouping, location-first names and sorting, search.
// Used by app.js and unit-tested in tests/picker.test.mjs.
import { scoreName } from './fuzzy.js?v=30';
import { aliasesOf } from './aliases.js?v=30';

// League order in the picker: pro leagues first, then college, then everything else the catalog adds later (catalog order).
export const LEAGUE_ORDER = ['nfl', 'mlb', 'nba', 'wnba', 'nhl', 'mls', 'nwsl', 'epl', 'laliga', 'bund', 'seriea', 'ligue1', 'ucl', 'ligamx', 'cfb', 'mcbb', 'wcbb', 'cbase', 'ausl'];
export const leagueLabel = (sp, sports) => (sports[sp] || {}).name || sp;

// "Location Nickname": "Boston Red Sox", "Utah Utes", "BYU Cougars". ESPN's team name is already location-first;
// if it is ever missing we rebuild it from location + mascot. Never the abbreviation or the bare nickname.
export function fullName(t) {
  const n = String(t.name || '').trim();
  if (n && (!t.location || n.toLowerCase().startsWith(String(t.location).toLowerCase()) || !t.mascot)) return n;
  if (t.location && t.mascot) return t.mascot.toLowerCase().startsWith(String(t.location).toLowerCase()) ? t.mascot : `${t.location} ${t.mascot}`;
  return n || String(t.location || t.short || t.abbr || '');
}
const norm = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const cmpName = (a, b) => norm(fullName(a)).localeCompare(norm(fullName(b)), 'en', { numeric: true, sensitivity: 'base' }) || String(a.id).localeCompare(String(b.id));
export const sortTeams = (list) => list.slice().sort(cmpName);

// Leagues (sport ids) in picker order. `sportIds` are the user's sports; `isTeam(id)` keeps team sports only.
export function orderLeagues(sportIds, isTeam = () => true) {
  const ids = sportIds.filter(isTeam);
  const rank = (id) => { const i = LEAGUE_ORDER.indexOf(id); return i < 0 ? LEAGUE_ORDER.length + sportIds.indexOf(id) : i; };
  return ids.slice().sort((a, b) => rank(a) - rank(b));
}

// v1.5.0: fuzzy — accents/punctuation ignored, typos tolerated, nicknames (aliases.js) understood.
const extras = (t) => [t.location, t.mascot, t.nick, t.abbr, t.short, t.conference, ...aliasesOf(fullName(t)), ...(t.aliases || [])].filter(Boolean);
export const teamScore = (t, q) => scoreName(q, fullName(t), extras(t));
export function matches(t, q) {
  q = norm(q).trim(); if (!q) return true;
  const hay = norm(`${fullName(t)} ${t.location || ''} ${t.mascot || ''} ${t.abbr || ''} ${t.conference || ''}`);
  return q.split(/\s+/).every((w) => hay.includes(w)) || teamScore(t, q) >= 0.6;
}

// Teams of one league: filter by search + conference. A to Z when browsing; best match first while searching.
export function leagueTeams(list, { q = '', conf = '' } = {}) {
  const l = (list || []).filter((t) => (!conf || t.conferenceId === conf) && matches(t, q));
  if (!String(q).trim()) return sortTeams(l);
  return l.map((t) => [t, teamScore(t, q)]).sort((a, b) => b[1] - a[1] || cmpName(a[0], b[0])).map((x) => x[0]);
}
// Optional conference sub-groups inside a league (each sorted location-first). Falls back to one group if the league has one conference.
export function subGroups(teams) {
  const m = new Map();
  for (const t of teams) { const k = t.conference || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(t); }
  if (m.size < 2) return [{ name: '', teams }];
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'en')).map(([name, ts]) => ({ name, teams: sortTeams(ts) }));
}
// Everything the grid needs: [{sport, label, loaded, total, teams, followed}]. `followedIn(sp)` returns how many teams of that league are followed.
export function buildGroups({ sportIds, isTeam, sports, teamsBy, followedIn, q = '', conf = '' }) {
  return orderLeagues(sportIds, isTeam).map((sp) => {
    const all = teamsBy[sp]; const loaded = Array.isArray(all);
    return { sport: sp, label: leagueLabel(sp, sports), loaded, total: loaded ? all.length : 0, teams: loaded ? leagueTeams(all, { q, conf }) : [], followed: followedIn(sp) };
  });
}
