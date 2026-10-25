// Officiating crew for football games (ss-v20).
// ESPN's summary gameInfo.officials and the core API /competitions/{id}/officials are the only sources used. For college football ESPN
// publishes NO officials (checked: both feeds return nothing, before, during and after games); for the NFL it lists the crew.
// ESPN never says which conference a college crew belongs to. That label is shown ONLY if (a) ESPN ever sends it on an official, or
// (b) a human-verified entry exists in server/officials-verified.json ({"cfb:<eventId>": {"conference": "SEC", "source": "<url>"}}).
// Otherwise the UI says "not published". Nothing here is inferred or guessed.
const fs = require('fs'); const path = require('path');
const CORE = 'https://sports.core.api.espn.com/v2/sports';
const POS_ORDER = ['Referee', 'Umpire', 'Head Linesman', 'Down Judge', 'Line Judge', 'Field Judge', 'Side Judge', 'Back Judge', 'Center Judge'];
const posRank = (p) => { const i = POS_ORDER.indexOf(p); return i < 0 ? 99 : i; };
const CONFS = ['SEC', 'Big Ten', 'Big 12', 'ACC', 'Pac-12', 'Mountain West', 'American', 'Sun Belt', 'MAC', 'C-USA'];

function verified(key) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, 'officials-verified.json'), 'utf8'));
    const v = j[key];
    return v && CONFS.includes(v.conference) && /^https?:\/\//.test(v.source || '') ? { conference: v.conference, source: v.source } : null;
  } catch { return null; }
}

module.exports = function makeOfficials({ cached, fetchJSON }) {
  const norm = (arr) => (arr || []).map((o) => ({
    name: o.fullName || o.displayName || null,
    position: (o.position && (o.position.displayName || o.position.name)) || null,
    order: o.order || 0,
    conference: (o.conference && (o.conference.shortDisplayName || o.conference.name)) || null,
  })).filter((o) => o.name).sort((a, b) => posRank(a.position) - posRank(b.position) || a.order - b.order);

  // Returns { available, list:[{name,position}], crewConference, crewSource } or null for sports without a football crew.
  async function forGame(sport, leaguePath, id, gi, state) {
    let list = norm(gi && gi.officials);
    if (!list.length) {
      // Core API fallback (cached; a miss is re-checked every 10 min before kickoff-day, 2 min live/after).
      const ttl = state === 'pre' ? 10 * 60e3 : 2 * 60e3;
      const items = await cached(`officials:${sport}:${id}`, ttl, async () => {
        const j = await fetchJSON(`${CORE}/${leaguePath}/events/${id}/competitions/${id}/officials?limit=20`);
        const refs = await Promise.all(((j && j.items) || []).map((it) => (it.$ref ? fetchJSON(it.$ref.replace(/^http:/, 'https:')).catch(() => null) : Promise.resolve(it))));
        return refs.filter(Boolean);
      }).catch(() => []);
      list = norm(items);
    }
    const espnConf = list.map((o) => o.conference).filter(Boolean);
    const same = espnConf.length && espnConf.every((c) => c === espnConf[0]) ? espnConf[0] : null;
    const v = verified(`${sport}:${id}`);
    return {
      available: list.length > 0,
      list: list.map(({ name, position }) => ({ name, position })),
      crewConference: same || (v && v.conference) || null,
      crewSource: same ? 'ESPN' : v ? v.source : null,
    };
  }
  return { forGame };
};
