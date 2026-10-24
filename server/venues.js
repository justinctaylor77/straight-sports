// Venue facts for the matchup screen. ESPN's summary gives name/city/surface/attendance but no capacity or year built,
// so those come from Wikipedia + Wikidata (looked up by venue name + city, verified, cached on the server).
// Rule: only show what we can verify. A candidate page is accepted only if its title matches the venue name and its intro
// mentions the venue's city or state; capacity / year come straight from the Wikidata claims (never estimated).
const STATES = { AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', DC: 'Washington, D.C.' };
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\b(the|stadium|field|arena|center|centre|park|coliseum|dome|garden|gardens|memorial|of|at)\b/g, ' ').replace(/\s+/g, ' ').trim();
const WP = 'https://en.wikipedia.org/w/api.php';
const timeOf = (v) => (v && v.time ? v.time : '');
const yearOf = (t) => { const m = /^[+-]?(\d{4})-/.exec(t || ''); return m ? +m[1] : null; };

const WUA = 'StraightSports/1.0 (https://straight-sports.onrender.com; venue facts, cached 14 days) node';
const VENUE_WORDS = /stadium|ballpark|baseball park|arena|field|park|venue|coliseum|dome|racetrack|speedway|raceway|course|garden|bowl|center|centre|complex|pitch|ground|track|club|links|court|amphitheat/i;

module.exports = function makeVenues({ cached }) {
  // one request at a time, ~700ms apart (Wikimedia asks API clients to be gentle); 429 backs everything off for a minute
  let chain = Promise.resolve(); let coolUntil = 0;
  const get = (url) => { const run = async () => {
    if (Date.now() < coolUntil) throw new Error('wiki cooling down');
    await new Promise((r) => setTimeout(r, 700));
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
    try { const r = await fetch(url, { headers: { 'User-Agent': WUA, Accept: 'application/json', 'Api-User-Agent': WUA }, signal: ctl.signal });
      if (r.status === 429) { coolUntil = Date.now() + 60e3; throw new Error('wiki 429'); }
      if (!r.ok) throw new Error(`wiki ${r.status}`); return await r.json(); } finally { clearTimeout(t); } };
    const p = chain.then(run, run); chain = p.catch(() => {}); return p; };
  const claim = (ent, p) => ((ent.claims || {})[p] || []).filter((c) => c.rank !== 'deprecated' && c.mainsnak && c.mainsnak.datavalue);
  const best = (list) => list.find((c) => c.rank === 'preferred') || list[0];
  async function lookup(v) {
    const name = v.fullName; const city = v.city; const st = v.state;
    const stateName = STATES[st] || st || '';
    const q = encodeURIComponent(`${name} ${city || ''}`.trim());
    // one call: search + intro extract + wikibase id for the top candidates
    const s = await get(`${WP}?action=query&generator=search&gsrsearch=${q}&gsrlimit=5&prop=pageprops|extracts&ppprop=wikibase_item&exintro=1&explaintext=1&exchars=700&exlimit=max&format=json&origin=*`);
    const pages = Object.values((s.query && s.query.pages) || {}).sort((a, b) => a.index - b.index);
    const want = norm(name);
    for (const page of pages) {
      const title = page.title || '';
      if (/\b(season|team|football|baseball|basketball|hockey|soccer|game|bowl game|championship|list of)\b/i.test(title) && !/(stadium|field|park|arena)/i.test(title)) continue;
      const tn = norm(title.replace(/\(.*?\)/g, ''));
      const ok = want ? (tn === want || (tn.length >= 4 && want.includes(tn))) : title.toLowerCase().startsWith(name.toLowerCase());
      if (!ok) continue;
      const intro = page.extract || '';
      const where = [city, stateName].filter(Boolean);
      if (where.length && !where.some((w) => intro.toLowerCase().includes(String(w).toLowerCase()))) continue;
      const qid = page.pageprops && page.pageprops.wikibase_item; if (!qid) continue;
      const w = await get(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${qid}&props=claims|descriptions&languages=en&format=json&origin=*`);
      const ent = w.entities && w.entities[qid]; if (!ent) continue;
      if (claim(ent, 'P576').length) continue; // demolished / closed venue (e.g. the old Yankee Stadium)
      const desc = (ent.descriptions && ent.descriptions.en && ent.descriptions.en.value) || '';
      if (!VENUE_WORDS.test(desc) && !VENUE_WORDS.test(intro.slice(0, 200))) continue;
      // capacity: preferred rank, else the most recent dated claim, else a single undated value; conflicting undated values => unknown
      const caps = claim(ent, 'P1083').filter((c) => !(c.qualifiers && c.qualifiers.P582));
      const when = (c) => { const q = c.qualifiers && c.qualifiers.P585; const t = q && q[0] && q[0].datavalue && q[0].datavalue.value && q[0].datavalue.value.time; return t ? +String(t).slice(1, 5) : 0; };
      const amt = (c) => +c.mainsnak.datavalue.value.amount;
      let cap = caps.find((c) => c.rank === 'preferred');
      if (!cap && caps.length) { const dated = caps.filter(when).sort((a, b) => when(b) - when(a)); cap = dated[0] || (new Set(caps.map(amt)).size === 1 ? caps[0] : null); }
      let capN = cap ? amt(cap) : null;
      // Wikidata can lag the article (e.g. old capacities), so cross-check the article's infobox: one clear number wins;
      // several numbers (multi-use venues) only confirm a Wikidata value that is among them; otherwise unknown.
      try {
        const r = await get(`${WP}?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&rvslots=main&rvsection=0&format=json&origin=*`);
        const pg = Object.values((r.query && r.query.pages) || {})[0];
        const wt = pg && pg.revisions && pg.revisions[0] && pg.revisions[0].slots && pg.revisions[0].slots.main && (pg.revisions[0].slots.main['*'] || pg.revisions[0].slots.main.content) || '';
        const m = /\|\s*capacity\s*=([\s\S]*?)(?=\n\s*\|[a-z_ ]+=|\n\}\})/i.exec(wt);
        if (m) {
          const txt = m[1].replace(/<!--[\s\S]*?-->/g, '').replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/\{\{[\s\S]*?\}\}/g, (x) => (/convert/i.test(x) ? '' : x));
          const nums = [...new Set((txt.match(/\d{1,3}(?:,\d{3})+|\b\d{4,6}\b/g) || []).map((n) => +n.replace(/,/g, '')).filter((n) => n >= 1000))];
          if (nums.length === 1) capN = nums[0];
          else if (nums.length > 1) capN = capN && nums.includes(capN) ? capN : null;
        }
      } catch (e) { /* keep the Wikidata value */ }
      const inc = best(claim(ent, 'P571')); const opened = best(claim(ent, 'P1619'));
      const built = yearOf(timeOf(inc && inc.mainsnak.datavalue.value)) || yearOf(timeOf(opened && opened.mainsnak.datavalue.value));
      return { capacity: capN && capN > 500 ? Math.round(capN) : null, built: built && built > 1700 ? built : null, source: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`, wiki: title };
    }
    return null;
  }
  // venue: ESPN venue object ({id, fullName, address:{city,state,country}, grass, indoor})
  async function info(venue, attendance) {
    if (!venue || !venue.fullName) return null;
    const city = venue.address && venue.address.city; const state = venue.address && (venue.address.state || venue.address.country);
    const key = `venue:${venue.id || venue.fullName}`;
    let facts = null;
    const run = cached(key, 14 * 24 * 3600e3, async () => (await lookup({ fullName: venue.fullName, city, state })) || { none: true });
    run.catch(() => {});
    try { facts = await Promise.race([run, new Promise((r) => setTimeout(() => r(null), 3000))]); } catch { facts = null; }
    // misses are cached too (long); a failed lookup (network) isn't cached at all, so it retries on the next request
    const out = { name: venue.fullName, city: city || null, state: state || null, surface: venue.grass === true ? 'Grass' : venue.grass === false ? 'Artificial turf' : null, indoor: venue.indoor === true ? true : venue.indoor === false ? false : null,
      capacity: (facts && facts.capacity) || null, built: (facts && facts.built) || null, source: (facts && facts.source) || null };
    const att = +attendance || 0;
    if (att > 0) { out.attendance = att; if (out.capacity) out.sellout = Math.round((att / out.capacity) * 1000) / 10; }
    return out;
  }
  return { info, lookup };
};
