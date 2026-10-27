// Normalizers for public NCAA.com data (served by the ncaa-api proxy, which mirrors ncaa.com's own JSON) and Road to
// Nationals. Pure functions, no network. Everything is defensive: unknown shapes degrade to fewer rows, never to guesses.
const { norm } = require('./teamResolve');

const clean = (s) => String(s == null ? '' : s).replace(/&#174;|&reg;|®/g, '').replace(/&amp;/g, '&').replace(/&#039;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
const toNum = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, '')); return Number.isFinite(n) ? n : null; };
const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
// "Through Games JUN. 23, 2026" → "2026-06-23" (or null)
function dateFromUpdated(s) {
  const m = String(s || '').match(/([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/); if (!m) return null;
  const mo = MONTHS[m[1].toUpperCase()]; if (mo == null) return null;
  return `${m[3]}-${String(mo + 1).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`;
}

// ---------- polls (NCAA rankings JSON: { title, updated, data:[{RANK,TEAM|SCHOOL|COLLEGE,RECORD,POINTS,PREVIOUS RANK}] }) ----------
function pollFromNcaa(j) {
  const rows = [];
  for (const r of (j && j.data) || []) {
    const get = (...ks) => { for (const k of Object.keys(r)) { const u = k.trim().toUpperCase(); if (ks.some((x) => u === x || u.startsWith(`${x} `) || u.startsWith(`${x}(`))) return r[k]; } return null; };
    const rank = toNum(get('RANK')); const raw = clean(get('TEAM', 'SCHOOL', 'COLLEGE')); if (!rank || !raw) continue;
    const fv = raw.match(/\((\d+)\)\s*$/);
    const prevRaw = get('PREVIOUS RANK', 'PREVIOUS', 'PREV'); const prev = toNum(prevRaw);
    rows.push({ rank, name: raw.replace(/\s*\(\d+\)\s*$/, ''), fpv: fv ? +fv[1] : null, record: clean(get('OVERALL RECORD', 'RECORD')) || null, points: toNum(get('POINTS')), prev: prev || null, prevNR: /^NR$/i.test(String(prevRaw || '').trim()) });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return { title: clean(j && j.title), updated: clean(j && j.updated), date: dateFromUpdated(j && j.updated), rows };
}

// ---------- bracket games ----------
const teamSlot = (t, resolve) => {
  if (!t || !t.isVisible && !t.nameShort || !clean(t.nameShort || t.nameFull)) return { team: null, seed: null, label: 'TBD', score: null, winner: false };
  const name = clean(t.nameShort || t.nameFull);
  const r = resolve ? resolve(name, clean(t.nameFull), t.seoname) : null;
  const team = r ? { id: r.id, espnId: r.espnId, name: r.name, short: name, abbr: r.abbr, logo: r.logo, logoDark: r.logoDark, color: r.color }
    : { id: null, name: clean(t.nameFull) || name, short: name, abbr: '', logo: t.logoUrl ? `https://www.ncaa.com${t.logoUrl}` : '', logoDark: '', color: null };
  return { team, seed: t.seed || null, label: null, score: toNum(t.score), winner: !!t.isWinner };
};
const stateOf = (g) => (g.gameState === 'F' ? 'final' : g.gameState === 'I' || /live|progress/i.test(g.statusCodeDisplay || '') ? 'live' : 'upcoming');
const gameRow = (g, resolve) => {
  const ts = (g.teams || []).slice().sort((a, b) => (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0));
  const slots = [teamSlot(ts[0], resolve), teamSlot(ts[1], resolve)];
  const st = stateOf(g);
  return { id: String(g.bracketId), bracketId: g.bracketId, contestId: g.contestId, state: st, ifNecessary: !!g.isIfNecessary, date: g.startDate || null, time: g.startTime || null, epoch: g.startTimeEpoch || 0,
    section: g.sectionId, victor: g.victorBracketPositionId || null, slots, status: st === 'final' ? 'final' : st === 'live' ? 'live' : slots.every((s) => s.team) ? 'upcoming' : 'projected', bestOf: 1, summary: g.finalMessage && st === 'final' ? '' : '' };
};
const dateLabel = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? `${+m[1]}/${+m[2]}` : ''; };

// ---------- 68-team basketball bracket ----------
function basketballBracket(champ, resolve) {
  const games = ((champ && champ.games) || []).filter((g) => g && g.bracketId != null);
  if (!games.length) return null;
  const roundOf = (g) => Math.floor(g.bracketId / 100); // 1 First Four, 2 R64, 3 R32, 4 S16, 5 E8, 6 FF, 7 title
  const rows = games.map((g) => ({ ...gameRow(g, resolve), round: roundOf(g) }));
  const byId = new Map(rows.map((r) => [r.bracketId, r]));
  const regionName = (sid) => { const r = ((champ.regions) || []).find((x) => x.sectionId === sid); return clean(r && r.title).replace(/\b([A-Z])([A-Z]+)/g, (_, a, b) => a + b.toLowerCase()) || `Region ${sid - 1}`; };
  const roundNames = {}; for (const r of champ.rounds || []) roundNames[r.roundNumber] = clean(r.title);
  const names = { 1: 'First Four', 2: roundNames[2] || 'First Round', 3: roundNames[3] || 'Second Round', 4: roundNames[4] || 'Sweet 16', 5: roundNames[5] || 'Elite Eight', 6: roundNames[6] || 'Final Four', 7: roundNames[7] || 'National Championship' };
  // region of a First Four game = region of the R64 game it feeds
  const regionOf = (r) => (r.round === 1 ? (byId.get(r.victor) || {}).section : r.section);
  const sections = [...new Set(rows.filter((r) => r.round >= 2 && r.round <= 5).map((r) => r.section))].sort((a, b) => a - b);
  const groups = sections.map((sid) => {
    const rounds = [];
    let prev = null;
    for (const rn of [1, 2, 3, 4, 5]) {
      let ms = rows.filter((r) => r.round === rn && regionOf(r) === sid);
      if (!ms.length) continue;
      if (rn === 1 || rn === 2) ms.sort((a, b) => a.bracketId - b.bracketId);
      else { const idx = new Map((prev || []).map((m, i) => [m.bracketId, i])); const pos = (m) => Math.min(...(prev || []).filter((p) => p.victor === m.bracketId).map((p) => idx.get(p.bracketId)), 99); ms = ms.sort((a, b) => pos(a) - pos(b) || a.bracketId - b.bracketId); }
      if (rn !== 1) prev = ms; else if (!prev) prev = null;
      rounds.push({ id: `r${rn}`, name: names[rn], bestOf: 1, matchups: ms });
    }
    return { id: `s${sid}`, name: regionName(sid), rounds };
  });
  const fin = (rn) => rows.filter((r) => r.round === rn).sort((a, b) => a.bracketId - b.bracketId);
  const finalRounds = [{ id: 'r6', name: names[6], bestOf: 1, matchups: fin(6) }, { id: 'r7', name: names[7], bestOf: 1, matchups: fin(7) }].filter((r) => r.matchups.length);
  const champGame = fin(7)[0]; const win = champGame && champGame.state === 'final' ? champGame.slots.find((s) => s.winner) : null;
  const played = rows.filter((r) => r.state === 'final').length;
  const strip = (m) => { delete m.victor; delete m.section; delete m.epoch; delete m.round; delete m.ifNecessary; delete m.bracketId; return m; };
  for (const g of groups) for (const r of g.rounds) r.matchups.forEach(strip);
  for (const r of finalRounds) r.matchups.forEach(strip);
  return { groups, finalRounds, champion: win ? win.team : null, gamesPlayed: played, gamesTotal: rows.length, year: champ.year, title: clean(champ.title) };
}

// ---------- baseball / softball: regionals → super regionals → World Series → finals ----------
function seriesBracket(champ, resolve) {
  const games = ((champ && champ.games) || []).filter((g) => g && g.bracketId != null).map((g) => ({ ...gameRow(g, resolve), stage: Math.floor(g.sectionId / 100) }));
  if (!games.length) return null;
  const secTitle = {}; for (const s of champ.sections || champ.regions || []) secTitle[s.sectionId] = clean(s.title);
  const stageNames = { 1: 'Regionals', 2: 'Super Regionals', 3: champ.sportUrl === 'softball' ? 'Women’s College World Series' : 'Men’s College World Series', 4: champ.sportUrl === 'softball' ? 'WCWS Finals (best of 3)' : 'MCWS Finals (best of 3)' };
  const stages = [];
  for (const st of [1, 2, 3, 4]) {
    const gs = games.filter((g) => g.stage === st); if (!gs.length) continue;
    const secIds = [...new Set(gs.map((g) => g.section))].sort((a, b) => a - b);
    const sections = secIds.map((sid) => {
      const sg = gs.filter((g) => g.section === sid).sort((a, b) => a.epoch - b.epoch || a.bracketId - b.bracketId);
      const played = sg.filter((g) => g.state === 'final'); // never-played "if necessary" games are dropped
      const shown = sg.filter((g) => g.state !== 'upcoming' || !g.ifNecessary);
      const wins = new Map(); const seeds = new Map(); const teams = new Map();
      for (const g of shown) for (const s of g.slots) { if (!s.team) continue; const k = s.team.short; teams.set(k, s.team); if (s.seed) seeds.set(k, s.seed); if (g.state === 'final' && s.winner) wins.set(k, (wins.get(k) || 0) + 1); }
      const last = played[played.length - 1];
      let adv = null;
      if (last) {
        if (st === 2 || st === 4) { const best = [...wins.entries()].sort((a, b) => b[1] - a[1])[0]; if (best && best[1] >= 2) adv = best[0]; }
        else adv = (last.slots.find((s) => s.winner) || {}).team && last.slots.find((s) => s.winner).team.short;
      }
      const complete = !!adv && (st >= 3 || sg.every((g) => g.state === 'final' || g.ifNecessary));
      return { id: `sec${sid}`, name: secTitle[sid] || `Section ${sid}`,
        teams: [...teams.entries()].map(([k, t]) => ({ team: t, seed: seeds.get(k) || null, wins: wins.get(k) || 0 })).sort((a, b) => (a.seed || 99) - (b.seed || 99) || b.wins - a.wins),
        advancer: adv ? teams.get(adv) : null, complete,
        games: shown.map((g) => ({ id: g.id, date: dateLabel(g.date), state: g.state, slots: g.slots })) };
    });
    stages.push({ id: `st${st}`, name: stageNames[st], kind: st === 2 || st === 4 ? 'series' : 'double-elim', sections });
  }
  const fin = stages.find((s) => s.id === 'st4'); const f = fin && fin.sections[0];
  const champion = f && f.complete && f.advancer ? f.advancer : null;
  const runnerUp = champion ? f.teams.find((t) => t.team.short !== champion.short) : null;
  return { stages, champion, runnerUp: runnerUp ? runnerUp.team : null, year: champ.year, title: clean(champ.title), gamesTotal: games.length, gamesPlayed: games.filter((g) => g.state === 'final').length };
}

// ---------- gymnastics ----------
const GYM_FORMAT = [
  'Selection: the top 36 teams by National Qualifying Score (NQS) are placed into four regionals of nine teams each.',
  'Regionals: a two-team first round, an eight-team second round, then a four-team regional final. The top two teams from each regional advance to nationals.',
  'Nationals: eight teams compete in two four-team semifinals; the top two from each semifinal advance to the four-team national championship final.',
  'There is no single-elimination bracket: teams are scored on four events (vault, bars, beam, floor) and ranked by score in each session (source: NCAA.com 2026 championship announcements).',
];
function gymRanking(j) {
  const rows = [];
  for (const r of (j && j.data) || []) {
    const rank = toNum(r.rank); const name = clean(r.team_name); if (!rank || !name) continue;
    rows.push({ rank, name, rqs: toNum(r.rqs), avg: toNum(r.average_score), high: toNum(r.high_score), diff: toNum(r.rank_difference), teamId: r.team_id });
  }
  return rows.sort((a, b) => a.rank - b.rank);
}
function gymHistory(j, year) {
  const rows = ((j && j.data) || []).map((r) => ({ year: toNum(r.Year), champion: clean(r.Champion), coach: clean(r.Coach), points: toNum(r.Points), runnerUp: clean(r['Runner-Up']), site: clean(r['Host or Site']) })).filter((r) => r.year);
  rows.sort((a, b) => b.year - a.year);
  return { rows, current: rows.find((r) => r.year === year && toNum(r.points)) || null };
}

module.exports = { clean, toNum, dateFromUpdated, pollFromNcaa, basketballBracket, seriesBracket, gymRanking, gymHistory, GYM_FORMAT, norm };
