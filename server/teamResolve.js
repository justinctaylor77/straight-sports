// Map a college football team name (as written in the weekly JT/Grok output) to its ESPN team id, so every logo is the
// team's official ESPN logo. Shared by server/grok.js and scripts/update-grok-top25.js.
// Order: explicit ids for names that are ambiguous or abbreviated (checked against ESPN's FBS team list) → exact match on
// ESPN's location / short name / full name → abbreviation, only if exactly one team has it. Anything else is unmatched
// (never a guess), and is reported by the update script.
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, 'and')
  .replace(/\bst\.?$/, 'state').replace(/\bst\.?\s/g, 'state ').replace(/[^a-z0-9]/g, '');

// normalized name → ESPN id
const IDS = {
  miami: '2390', miamifl: '2390', miamiflorida: '2390', miamihurricanes: '2390',
  miamioh: '193', miamiohio: '193', miamiredhawks: '193',
  usc: '30', southerncalifornia: '30', southerncal: '30', usctrojans: '30',
  byu: '252', brighamyoung: '252', byucougars: '252',
  texastech: '2641', ttu: '2641',
  boisestate: '68', boise: '68',
  olemiss: '145', mississippi: '145', olemississippi: '145',
  mississippistate: '344', missstate: '344',
  lsu: '99', louisianastate: '99', tcu: '2628', texaschristian: '2628', smu: '2567', southernmethodist: '2567',
  ucf: '2116', centralflorida: '2116', uconn: '41', connecticut: '41', pitt: '221', pittsburgh: '221',
  ncstate: '152', northcarolinastate: '152', unc: '153', northcarolina: '153',
  texasam: '245', tamu: '245', hawaii: '62', sanjosestate: '23', sjsu: '23',
  utsa: '2636', utep: '2638', fiu: '2229', floridainternational: '2229', fau: '2226', floridaatlantic: '2226',
  uab: '5', unlv: '2439', appstate: '2026', appalachianstate: '2026',
  ulm: '2433', louisianamonroe: '2433', louisiana: '309', louisianalafayette: '309', ullafayette: '309',
  southernmiss: '2572', southernmississippi: '2572', usm: '2572',
  floridastate: '52', fsu: '52', georgiatech: '59', gatech: '59', virginiatech: '259', vt: '259',
  pennstate: '213', psu: '213', ohiostate: '194', osu: '194', oklahomastate: '197', okstate: '197',
  michiganstate: '127', washingtonstate: '265', wazzu: '265', oregonstate: '204', iowastate: '66', kansasstate: '2306',
  arizonastate: '9', asu: '9', coloradostate: '36', fresnostate: '278', sandiegostate: '21', sdsu: '21', utahstate: '328',
  wku: '98', westernkentucky: '98', niu: '2459', northernillinois: '2459', umass: '113', massachusetts: '113',
  jmu: '256', jamesmadison: '256', odu: '295', olddominion: '295', usf: '58', southflorida: '58', ecu: '151', eastcarolina: '151',
  bgsu: '189', bowlinggreen: '189', cmu: '2117', centralmichigan: '2117', emu: '2199', easternmichigan: '2199', wmu: '2711', westernmichigan: '2711',
  ucla: '26', cal: '25', california: '25', notredame: '87', nd: '87',
};

function makeResolver(teams) {
  const byId = new Map(teams.map((t) => [String(t.espnId || t.id), t]));
  const exact = new Map(); const abbr = new Map();
  const add = (m, k, t) => { const n = norm(k); if (!n) return; const cur = m.get(n); if (!cur) m.set(n, t); else if (cur !== t) m.set(n, 'AMBIGUOUS'); };
  for (const t of teams) { for (const k of [t.location, t.short, t.name]) add(exact, k, t); add(abbr, t.abbr, t); }
  return function resolve(name, id) {
    if (id && byId.has(String(id))) return byId.get(String(id));
    const n = norm(name);
    if (IDS[n] && byId.has(IDS[n])) return byId.get(IDS[n]);
    const e = exact.get(n); if (e && e !== 'AMBIGUOUS') return e;
    const a = abbr.get(n); if (a && a !== 'AMBIGUOUS') return a;
    return null;
  };
}

module.exports = { norm, IDS, makeResolver };
