// Player search index (v1.5.0). ESPN's own search is exact/prefix only ("McElroy" finds nobody), so we keep a local,
// cached index of every player per sport from ESPN's public lists and fuzzy-match it with public/fuzzy.js:
//   golf   - the full PGA TOUR, LIV, LPGA and DP World Tour athlete lists (sports.core.api.espn.com v3, ~11k names)
//   tennis - ESPN's full tennis athlete list (ATP + WTA, ~18k), tagged with tour/rank from the live rankings
//   team   - every team roster in the league (NFL, MLB, NBA, WNBA, NHL, soccer, college), via the cached roster()
//   event  - UFC/F1/NASCAR/IndyCar entry lists (players())
// Indexes are built lazily, cached 12 h, and the first search waits at most a few seconds before falling back to ESPN.
const CORE = 'https://sports.core.api.espn.com/v3/sports';
const TTL = 12 * 3600e3;
const FLAG = (c) => `https://a.espncdn.com/i/teamlogos/countries/500/${c.toLowerCase()}.png`;
const COUNTRY = { USA: 'usa', England: 'eng', Canada: 'can', 'South Korea': 'kor', Japan: 'jpn', Australia: 'aus', 'South Africa': 'rsa', Spain: 'esp', Sweden: 'swe', France: 'fra', Mexico: 'mex',
  Scotland: 'sco', Denmark: 'den', China: 'chn', Germany: 'ger', Argentina: 'arg', Thailand: 'tha', Ireland: 'irl', 'New Zealand': 'nzl', 'Puerto Rico': 'pur', India: 'ind', Italy: 'ita',
  Wales: 'wal', Chile: 'chi', 'Northern Ireland': 'nir', 'Chinese Taipei': 'tpe', Philippines: 'phi', Finland: 'fin', Belgium: 'bel', Norway: 'nor', Colombia: 'col', Netherlands: 'ned',
  Zimbabwe: 'zim', Austria: 'aut', Venezuela: 'ven', Malaysia: 'mas', Portugal: 'por', Switzerland: 'sui', Poland: 'pol', Czechia: 'cze', 'Czech Republic': 'cze', Paraguay: 'par', Brazil: 'bra' };
const TOURS = [['pga', 'PGA TOUR'], ['liv', 'LIV'], ['lpga', 'LPGA'], ['eur', 'DP World']];

module.exports = function makeSearch({ cached, fetchJSON, SP }) {
  let F = null; const fz = async () => F || (F = await import('../public/fuzzy.js'));
  async function pages(url, max = 30) {
    const out = []; const first = await fetchJSON(`${url}${url.includes('?') ? '&' : '?'}limit=1000&page=1`); out.push(...(first.items || []));
    const n = Math.min(first.pageCount || 1, max); const rest = [];
    for (let p = 2; p <= n; p++) rest.push(p);
    await pool(rest, 4, async (p) => { const d = await fetchJSON(`${url}${url.includes('?') ? '&' : '?'}limit=1000&page=${p}`); out.push(...(d.items || [])); });
    return out;
  }
  async function pool(items, k, fn) { let i = 0; await Promise.all(Array.from({ length: Math.min(k, items.length) }, async () => { while (i < items.length) { const x = items[i++]; try { await fn(x); } catch { /* one list/roster failing doesn't sink the index */ } } })); }
  const flagOf = (a) => { const c = a.citizenship; if (c && COUNTRY[c]) return FLAG(COUNTRY[c]); const b = a.birthPlace || {}; if (c && b.country === c && b.countryAbbreviation) return FLAG(b.countryAbbreviation); return ''; };

  function golf() {
    return cached('pidx:golf', TTL, async () => {
      const by = new Map();
      for (const [lg, label] of TOURS) {
        const items = await pages(`${CORE}/golf/${lg}/athletes`).catch(() => []);
        for (const a of items) { if (!a || !a.id || /\//.test(a.displayName || a.fullName || '')) continue; // skip team-event pairings ("McDowell/McIlroy Ireland") const k = `golf:${a.id}`; const p = by.get(k);
          if (p) { if (!p.tours.includes(label)) p.tours.push(label); continue; }
          by.set(k, { id: k, name: a.displayName || a.fullName, tours: [label], country: a.citizenship || '', flag: flagOf(a), amateur: !!a.amateur, known: !!(a.debutYear || a.dateOfBirth) }); }
      }
      const list = [...by.values()].map((p) => ({ ...p, tour: p.tours.join(' · ') }));
      return { built: new Date().toISOString(), count: list.length, list };
    });
  }
  function tennis() {
    return cached('pidx:tennis', TTL, async () => {
      const items = await pages(`${CORE}/tennis/atp/athletes`);
      let ranked = []; try { ranked = await SP.players('tennis'); } catch { /* rankings are optional decoration */ }
      const R = new Map((ranked || []).map((p) => [p.id, p]));
      const list = items.filter((a) => a && a.id).map((a) => { const k = `tennis:${a.id}`; const r = R.get(k) || {};
        return { id: k, name: a.displayName || a.fullName, tour: r.tour || '', rank: r.rank || null, country: r.country || (a.birthPlace && a.birthPlace.summary && a.birthPlace.summary.split(', ').pop()) || '', flag: r.flag || '', known: !!r.rank || (a.age && a.age < 40) }; });
      for (const r of ranked || []) if (!list.some((p) => p.id === r.id)) list.push({ ...r, known: true });
      return { built: new Date().toISOString(), count: list.length, list };
    });
  }
  function teamSport(sport) {
    return cached(`pidx:${sport}`, TTL, async () => {
      const { teams } = await SP.getTeams(sport); const list = [];
      await pool(teams, 8, async (t) => { const r = await SP.roster(sport, t.espnId); for (const p of r) list.push({ id: p.id, name: p.name, pos: p.pos, team: t.short || t.name, teamId: t.id, headshot: p.headshot, known: true }); });
      return { built: new Date().toISOString(), count: list.length, teams: teams.length, list };
    });
  }
  function eventSport(sport) {
    return cached(`pidx:${sport}`, TTL, async () => { const l = await SP.players(sport); return { built: new Date().toISOString(), count: l.length, list: l.map((p) => ({ ...p, known: true })) }; });
  }
  function indexFor(sport) {
    const sp = SP.SPORTS[sport]; if (!sp) return Promise.resolve(null);
    if (sp.kind === 'golf') return golf(); if (sp.kind === 'tennis') return tennis();
    if (sp.kind === 'event') return eventSport(sport);
    if (sp.kind === 'team' && sport !== 'ausl') return teamSport(sport);
    return Promise.resolve(null);
  }
  const within = (p, ms) => Promise.race([p.catch(() => null), new Promise((r) => setTimeout(() => r(null), ms))]);

  /** fuzzy player search: local index (if ready within `wait` ms) merged with ESPN's own search */
  async function search(sport, q, { wait = 9000 } = {}) {
    q = String(q || '').trim().slice(0, 60); if (q.length < 2 || sport === 'ausl') return [];
    const { rank } = await fz();
    const [idx, espn] = await Promise.all([within(indexFor(sport), wait), SP.athleteSearch(sport, q).catch(() => [])]);
    const ES = new Set(espn.map((p) => p.id));
    const tie = (a, b) => (b.known ? 1 : 0) - (a.known ? 1 : 0) || (a.rank || 9999) - (b.rank || 9999) || (a.amateur ? 1 : 0) - (b.amateur ? 1 : 0) || String(a.name).localeCompare(String(b.name));
    const hits = idx ? rank(idx.list, q, { key: (p) => p.name, min: 0.6, limit: 60, tie }) : [];
    for (const h of hits) if (ES.has(h.item.id)) h.score += 0.08; // ESPN agrees: likely the person meant
    hits.sort((a, b) => b.score - a.score || tie(a.item, b.item));
    const out = []; const seen = new Set();
    const E = new Map(espn.map((p) => [p.id, p]));
    for (const h of hits) { const e = E.get(h.item.id) || {}; out.push({ ...h.item, ...Object.fromEntries(Object.entries(e).filter(([, v]) => v != null && v !== '')), id: h.item.id, match: +h.score.toFixed(2) }); seen.add(h.item.id); }
    for (const e of espn) if (!seen.has(e.id)) { out.push({ ...e, match: null }); seen.add(e.id); }
    return out.slice(0, 40);
  }
  const warm = (sports) => sports.reduce((p, s) => p.then(() => indexFor(s)).catch(() => {}), Promise.resolve());
  return { search, indexFor, warm };
};
