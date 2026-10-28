// Utah / BYU / Big 12 flags for college rows. Display-only: these never change a ranking, a seed or a bracket slot.
const n = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\bst\.?(?=\s|$)/g, 'state').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Big 12 membership for 2026-27 (16 schools). Each entry lists the normalised names the sources use.
const BIG12 = {
  'Arizona': ['arizona', 'arizona wildcats'], 'Arizona State': ['arizona state', 'arizona state sun devils'], 'Baylor': ['baylor', 'baylor bears'], 'BYU': ['byu', 'brigham young', 'byu cougars', 'brigham young cougars'],
  'Cincinnati': ['cincinnati', 'cincinnati bearcats'], 'Colorado': ['colorado', 'colorado buffaloes'], 'Houston': ['houston', 'houston cougars'], 'Iowa State': ['iowa state', 'iowa state cyclones'],
  'Kansas': ['kansas', 'kansas jayhawks'], 'Kansas State': ['kansas state', 'kansas state wildcats'], 'Oklahoma State': ['oklahoma state', 'oklahoma state cowboys', 'oklahoma state cowgirls'],
  'TCU': ['tcu', 'tcu horned frogs'], 'Texas Tech': ['texas tech', 'texas tech red raiders', 'texas tech lady raiders'], 'UCF': ['ucf', 'ucf knights', 'central florida'],
  'Utah': ['utah', 'utah utes'], 'West Virginia': ['west virginia', 'west virginia mountaineers'],
};
const LOOKUP = new Map(); for (const [k, v] of Object.entries(BIG12)) for (const x of v) LOOKUP.set(n(x), k);
// -> { big12: 'Utah', spot: 'utah'|'byu'|null } or null
const PRO_ID = /^(nfl|nba|wnba|mlb|ausl):/; // pro franchises share place names with Big 12 schools (Bengals/Cincinnati, Jazz/Utah) and are never flagged
function flagsFor(team) {
  if (!team || PRO_ID.test(String(team.id || ''))) return null;
  for (const c of [team.short, team.name, team.display, team.location]) { const k = LOOKUP.get(n(c)); if (k) return { big12: k, spot: k === 'Utah' ? 'utah' : k === 'BYU' ? 'byu' : null }; }
  return null;
}
// Walks a payload and tags every team-like object (has a logo field and a name) with `hl`.
function decorate(node) {
  if (Array.isArray(node)) { node.forEach(decorate); return node; }
  if (!node || typeof node !== 'object') return node;
  if ('logo' in node && (node.short || node.name)) { const f = flagsFor(node); if (f) node.hl = f; return node; }
  for (const v of Object.values(node)) decorate(v);
  return node;
}
module.exports = { BIG12, flagsFor, decorate, n };
