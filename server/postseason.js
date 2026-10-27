// Postseason brackets for the pro leagues. Pure functions (no network): seeds from standings → projected bracket,
// real ESPN playoff games → series → the same bracket filled with real results. See server/feeds.js for the fetching.
//
// Bracket payload (shared with the NCAA builders and the client):
//   { groups:[{ id, name, rounds:[{ id, name, matchups:[M] }] }], finalRounds:[{ id, name, matchups:[M] }] }
//   M = { id, bestOf, status:'projected'|'upcoming'|'live'|'final', slots:[S,S], summary, next }
//   S = { team|null, seed, label, wins, winner }
const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[+,]/g, '')); return Number.isFinite(n) ? n : null; };

// ---------------------------------------------------------------- seeds
const lite = (t) => (t ? { id: t.id, name: t.name, short: t.short, abbr: t.abbr, logo: t.logo, logoDark: t.logoDark, color: t.color } : null);
const pctOf = (r) => (r.gp ? (r.w + 0.5 * r.t) / r.gp : 0);
const byRecord = (a, b) => pctOf(b) - pctOf(a) || (b.diff || 0) - (a.diff || 0) || String(a.team.name).localeCompare(String(b.team.name));

// rows: [{ team, w,l,t,gp,diff, seed (ESPN playoffSeed|null), conference, division, record }]
function seedRow(r, seed, tag) { return { seed, team: lite(r.team), record: r.record, w: r.w, l: r.l, t: r.t, tag, diff: r.diff }; }
const complete = (rows, n) => { const s = new Set(rows.map((r) => r.seed).filter((x) => x >= 1 && x <= n)); return s.size === n; };

function nflSeeds(rows) {
  const out = [];
  for (const conf of [...new Set(rows.map((r) => r.conference))].sort()) {
    const cr = rows.filter((r) => r.conference === conf);
    let top;
    if (complete(cr, 7)) top = cr.filter((r) => r.seed >= 1 && r.seed <= 7).sort((a, b) => a.seed - b.seed).map((r) => [r, r.seed]);
    else {
      // Fallback (ESPN seeds missing): division winners by record → seeds 1-4; next three best records → 5-7. Simplified tiebreakers.
      const divs = {}; for (const r of cr) (divs[r.division || '?'] = divs[r.division || '?'] || []).push(r);
      const winners = Object.values(divs).map((d) => d.sort(byRecord)[0]).sort(byRecord);
      const rest = cr.filter((r) => !winners.includes(r)).sort(byRecord).slice(0, 3);
      top = [...winners, ...rest].map((r, i) => [r, i + 1]);
    }
    out.push({ id: conf, name: conf, seeds: top.map(([r, s]) => seedRow(r, s, s <= 4 ? 'Division winner' : 'Wild card')) });
  }
  return out;
}
function nbaSeeds(rows) {
  const out = [];
  for (const conf of [...new Set(rows.map((r) => r.conference))].sort()) {
    const cr = rows.filter((r) => r.conference === conf);
    const ranked = complete(cr, 10) ? cr.filter((r) => r.seed >= 1 && r.seed <= 15).sort((a, b) => a.seed - b.seed) : cr.slice().sort(byRecord);
    out.push({ id: conf, name: conf, seeds: ranked.slice(0, 10).map((r, i) => seedRow(r, r.seed && complete(cr, 10) ? r.seed : i + 1, (r.seed || i + 1) <= 6 ? 'Direct' : 'Play-in')) });
  }
  return out;
}
function mlbSeeds(rows) {
  const out = [];
  for (const lg of [...new Set(rows.map((r) => r.conference))].sort()) {
    const cr = rows.filter((r) => r.conference === lg);
    let top;
    if (complete(cr, 6)) top = cr.filter((r) => r.seed >= 1 && r.seed <= 6).sort((a, b) => a.seed - b.seed).map((r) => [r, r.seed]);
    else {
      const divs = {}; for (const r of cr) (divs[r.division || '?'] = divs[r.division || '?'] || []).push(r);
      const winners = Object.values(divs).map((d) => d.sort(byRecord)[0]).sort(byRecord);
      const wc = cr.filter((r) => !winners.includes(r)).sort(byRecord).slice(0, 3);
      top = [...winners, ...wc].map((r, i) => [r, i + 1]);
    }
    out.push({ id: lg, name: lg, seeds: top.map(([r, s]) => seedRow(r, s, s <= 3 ? 'Division winner' : 'Wild card')) });
  }
  return out;
}
// WNBA: eight playoff teams seeded league-wide by record (the league dropped conference seeding). ESPN lists conference ranks, so we sort ourselves.
function wnbaSeeds(rows) {
  const ranked = rows.slice().sort(byRecord).slice(0, 8);
  return [{ id: 'all', name: 'Playoffs', seeds: ranked.map((r, i) => seedRow(r, i + 1, 'Qualifier')) }];
}
const SEEDERS = { nfl: nflSeeds, nba: nbaSeeds, mlb: mlbSeeds, wnba: wnbaSeeds };

// ---------------------------------------------------------------- formats (plans)
// Slot sources: {seed:n} | {w:'id'} winner of | {l:'id'} loser of | {label:'text'} unresolved text.
const S = (n) => ({ seed: n });
const PLANS = {
  nfl: {
    title: 'NFL Playoffs', finalName: 'Super Bowl', finalRound: 'sb', size: 14, grouped: true,
    rounds: [
      { id: 'wc', name: 'Wild Card', bestOf: 1, m: [['wc1', S(2), S(7)], ['wc2', S(3), S(6)], ['wc3', S(4), S(5)]] },
      { id: 'ds', name: 'Divisional', bestOf: 1, m: [['ds1', S(1), { label: 'Lowest remaining seed' }], ['ds2', { label: 'Higher remaining seed' }, { label: 'Next remaining seed' }]] },
      { id: 'cc', name: 'Conference Championship', bestOf: 1, m: [['cc1', { label: 'Divisional winner' }, { label: 'Divisional winner' }]] },
    ],
    final: { id: 'sb', name: 'Super Bowl', bestOf: 1 },
  },
  mlb: {
    title: 'MLB Postseason', finalName: 'World Series', finalRound: 'ws', size: 12, grouped: true,
    rounds: [
      { id: 'wc', name: 'Wild Card Series', bestOf: 3, m: [['wc1', S(4), S(5)], ['wc2', S(3), S(6)]] },
      { id: 'ds', name: 'Division Series', bestOf: 5, m: [['ds1', S(1), { w: 'wc1' }], ['ds2', S(2), { w: 'wc2' }]] },
      { id: 'lcs', name: 'Championship Series', bestOf: 7, m: [['lcs1', { w: 'ds1' }, { w: 'ds2' }]] },
    ],
    final: { id: 'ws', name: 'World Series', bestOf: 7 },
  },
  nba: {
    title: 'NBA Playoffs', finalName: 'NBA Finals', finalRound: 'f', size: 20, grouped: true,
    rounds: [
      { id: 'pi', name: 'Play-In', bestOf: 1, m: [['pi1', S(7), S(8)], ['pi2', S(9), S(10)], ['pi3', { l: 'pi1', label: 'Loser of 7 v 8' }, { w: 'pi2', label: 'Winner of 9 v 10' }]] },
      { id: 'r1', name: 'First Round', bestOf: 7, m: [['r1a', S(1), { w: 'pi3', label: 'Play-in (8th seed)' }], ['r1b', S(4), S(5)], ['r1c', S(3), S(6)], ['r1d', S(2), { w: 'pi1', label: 'Play-in (7th seed)' }]] },
      { id: 'r2', name: 'Conf. Semifinals', bestOf: 7, m: [['r2a', { w: 'r1a' }, { w: 'r1b' }], ['r2b', { w: 'r1c' }, { w: 'r1d' }]] },
      { id: 'cf', name: 'Conf. Finals', bestOf: 7, m: [['cf1', { w: 'r2a' }, { w: 'r2b' }]] },
    ],
    final: { id: 'f', name: 'NBA Finals', bestOf: 7 },
  },
  wnba: {
    title: 'WNBA Playoffs', finalName: 'WNBA Finals', finalRound: 'f', size: 8, grouped: false,
    rounds: [
      { id: 'r1', name: 'First Round', bestOf: 3, m: [['r1a', S(1), S(8)], ['r1b', S(4), S(5)], ['r1c', S(3), S(6)], ['r1d', S(2), S(7)]] },
      { id: 'r2', name: 'Semifinals', bestOf: 5, m: [['r2a', { w: 'r1a' }, { w: 'r1b' }], ['r2b', { w: 'r1c' }, { w: 'r1d' }]] },
    ],
    final: { id: 'f', name: 'WNBA Finals', bestOf: 5 },
  },
};

// ESPN note headline → round id. Defensive: unknown headlines return null and the game is ignored (never guessed).
function roundOf(sport, headline) {
  const h = String(headline || '');
  if (sport === 'mlb') { if (/world series/i.test(h)) return 'ws'; if (/WC\b|wild ?card/i.test(h)) return 'wc'; if (/DS\b|division/i.test(h)) return 'ds'; if (/CS\b|championship/i.test(h)) return 'lcs'; }
  if (sport === 'nfl') { if (/super ?bowl/i.test(h)) return 'sb'; if (/wild ?card/i.test(h)) return 'wc'; if (/divisional/i.test(h)) return 'ds'; if (/championship|conference/i.test(h)) return 'cc'; }
  if (sport === 'nba') { if (/play-?in/i.test(h)) return 'pi'; if (/nba finals/i.test(h)) return 'f'; if (/1st round|first round/i.test(h)) return 'r1'; if (/semi|2nd round|second round/i.test(h)) return 'r2'; if (/finals/i.test(h)) return 'cf'; }
  if (sport === 'wnba') { if (/first round|1st round/i.test(h)) return 'r1'; if (/semi/i.test(h)) return 'r2'; if (/finals/i.test(h)) return 'f'; }
  return null;
}

// ---------------------------------------------------------------- real games → series
// events: ESPN scoreboard events (postseason). Returns [{ round, teams:[{team,wins}], games:[...], status, winner, bestOf }]
function seriesFromEvents(sport, events, normTeam, plan = PLANS[sport]) {
  const roundBest = {}; for (const r of plan.rounds) roundBest[r.id] = r.bestOf; roundBest[plan.final.id] = plan.final.bestOf;
  const map = new Map(); const seen = new Set();
  for (const ev of events || []) {
    try {
      if (!ev || seen.has(ev.id)) continue; seen.add(ev.id);
      const c = (ev.competitions || [])[0]; if (!c) continue;
      const head = ((c.notes || ev.notes || [])[0] || {}).headline;
      const round = roundOf(sport, head); if (!round) continue;
      const comps = (c.competitors || []).filter((x) => x.team); if (comps.length !== 2) continue;
      const teams = comps.map((x) => normTeam(x.team, sport));
      const st = (c.status || ev.status || {}).type || {};
      const state = st.state || 'pre';
      const gm = String(head).match(/Game\s+(\d+)/i);
      const key = `${round}|${teams.map((t) => t.id).sort().join('|')}`;
      const s = map.get(key) || { round, teams: teams.map((t) => ({ team: t, wins: 0 })), games: [], bestOf: roundBest[round] || (c.series && c.series.totalCompetitions) || 1 };
      const g = { id: ev.id, n: gm ? +gm[1] : null, date: ev.date, state, detail: st.shortDetail || st.detail || '', scores: {} };
      for (const x of comps) {
        const t = normTeam(x.team, sport); g.scores[t.id] = x.score == null ? null : num(typeof x.score === 'object' ? x.score.displayValue : x.score);
        if (state === 'post' && (x.winner === true)) { const e = s.teams.find((q) => q.team.id === t.id); if (e) { e.wins += 1; g.winner = t.id; } }
      }
      s.games.push(g); map.set(key, s);
    } catch { /* one odd event must not break the bracket */ }
  }
  const need = (b) => Math.ceil(b / 2);
  return [...map.values()].map((s) => {
    s.games.sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const done = s.games.filter((g) => g.state === 'post').length;
    const winner = s.teams.find((t) => t.wins >= need(s.bestOf));
    const live = s.games.some((g) => g.state === 'in');
    const nextG = s.games.find((g) => g.state === 'pre');
    return { ...s, winner: winner ? winner.team.id : null, status: winner ? 'final' : live ? 'live' : done ? 'live' : 'upcoming', played: done,
      next: !winner && nextG ? { n: nextG.n || done + 1, date: nextG.date, detail: nextG.detail } : null, liveGame: live ? s.games.find((g) => g.state === 'in') : null };
  });
}

function summaryOf(s, by) {
  const [a, b] = s.teams; const ab = (x) => x.team.abbr || x.team.short || x.team.name;
  if (s.bestOf === 1) { const g = s.games[0]; return g ? g.detail || '' : ''; }
  if (s.winner) { const w = by(s.winner); const l = s.teams.find((x) => x.team.id !== s.winner); return `${ab(w)} wins ${w.wins}-${l.wins}`; }
  if (!s.played && !s.liveGame) return 'Series not started';
  if (a.wins === b.wins) return `Series tied ${a.wins}-${b.wins}`;
  const lead = a.wins > b.wins ? a : b; const tr = lead === a ? b : a;
  return `${ab(lead)} leads ${lead.wins}-${tr.wins}`;
}

// ---------------------------------------------------------------- assemble bracket
const slotView = (x, bestOf, t, seedOf) => ({ team: lite(t.team), seed: seedOf[t.team.id] ?? null, label: null, wins: bestOf === 1 ? null : t.wins, score: bestOf === 1 ? (x.games[0] && x.games[0].scores[t.team.id]) : null, winner: x.winner === t.team.id });
const gamesView = (x) => x.games.map((gm) => ({ n: gm.n, date: gm.date, state: gm.state, detail: gm.detail, scores: gm.scores }));

function buildBracket(sport, seedGroups, series = []) {
  const plan = PLANS[sport]; if (!plan) throw new Error(`no bracket plan for ${sport}`);
  const seedOf = {}; const groupOf = {};
  for (const g of seedGroups) for (const s of g.seeds) { seedOf[s.team.id] = s.seed; groupOf[s.team.id] = g.id; }
  const results = new Map(); // "group:matchup" → { winner, loser } once a series is decided
  const used = new Set();
  const by = (x) => (tid) => x.teams.find((t) => t.team.id === tid);

  function resolveSrc(src, g) {
    if (src.seed != null) { const row = g.seeds.find((x) => x.seed === src.seed); return row ? { team: row.team } : { label: `#${src.seed} seed` }; }
    if (src.w) { const r = results.get(`${g.id}:${src.w}`); return r ? { team: r.winner } : { label: src.label || 'Winner TBD' }; }
    if (src.l) { const r = results.get(`${g.id}:${src.l}`); return r ? { team: r.loser } : { label: src.label || 'Loser TBD' }; }
    return { label: src.label || 'TBD' };
  }
  const slotOf = (r) => ({ team: r.team || null, seed: r.team ? seedOf[r.team.id] ?? null : null, label: r.team ? null : r.label, wins: null, winner: false });

  function matchupOut(g, mid, bestOf, ra, rb, x) {
    const base = { id: `${g.id}:${mid}`, bestOf };
    if (!x) return { ...base, status: 'projected', slots: [slotOf(ra), slotOf(rb)], summary: '', next: null };
    const ts = x.teams.slice().sort((p, q) => (seedOf[p.team.id] || 99) - (seedOf[q.team.id] || 99));
    if (x.winner) results.set(`${g.id}:${mid}`, { winner: lite(x.teams.find((t) => t.team.id === x.winner).team), loser: lite(x.teams.find((t) => t.team.id !== x.winner).team) });
    return { ...base, status: x.status, slots: ts.map((t) => slotView(x, bestOf, t, seedOf)), summary: summaryOf(x, by(x)), next: x.next, series: gamesView(x) };
  }

  function roundOut(g, r) {
    const pool = series.filter((x) => x.round === r.id && (!seedGroups.length || x.teams.every((t) => (groupOf[t.team.id] || g.id) === g.id)));
    const defs = r.m.map(([mid, a, b]) => ({ mid, a, b, hit: null, ra: null, rb: null }));
    // pass 1 (in order, so play-in style same-round dependencies resolve): match a real series by team overlap
    for (const d of defs) {
      d.ra = resolveSrc(d.a, g); d.rb = resolveSrc(d.b, g);
      const ids = [d.ra.team && d.ra.team.id, d.rb.team && d.rb.team.id].filter(Boolean);
      d.hit = ids.length ? pool.find((x) => !used.has(x) && x.teams.some((t) => ids.includes(t.team.id))) || null : null;
      if (d.hit) { used.add(d.hit); d.out = matchupOut(g, d.mid, r.bestOf, d.ra, d.rb, d.hit); }
    }
    // pass 2: real series still unplaced (re-seeded rounds such as the NFL divisional) fill open slots, best seed first
    const rest = pool.filter((x) => !used.has(x)).sort((p, q) => Math.min(...p.teams.map((t) => seedOf[t.team.id] || 99)) - Math.min(...q.teams.map((t) => seedOf[t.team.id] || 99)));
    for (const d of defs) {
      if (d.out) continue;
      const x = rest.shift(); if (x) used.add(x);
      if (!x) { d.ra = resolveSrc(d.a, g); d.rb = resolveSrc(d.b, g); }
      d.out = matchupOut(g, d.mid, r.bestOf, d.ra, d.rb, x || null);
    }
    const matchups = defs.map((d) => d.out);
    for (const x of rest) { used.add(x); matchups.push(matchupOut(g, `${r.id}x${matchups.length}`, r.bestOf, {}, {}, x)); } // unexpected extra series: show, never drop
    return { id: r.id, name: r.name, bestOf: r.bestOf, matchups };
  }
  const groups = seedGroups.map((g) => ({ id: g.id, name: g.name, rounds: plan.rounds.map((r) => roundOut(g, r)) }));

  // Final: the two group champions (or the two semifinal winners for a single-group bracket).
  const fin = plan.final; const last = plan.rounds[plan.rounds.length - 1];
  const feeders = plan.grouped ? seedGroups.map((g) => [g, last.m[0][0], g.name]) : last.m.map((m) => [seedGroups[0], m[0], 'Semifinal winner']);
  const fx = series.find((x) => x.round === fin.id);
  let finalM;
  if (fx) { used.add(fx); finalM = matchupOut({ id: 'final' }, 'f', fin.bestOf, {}, {}, fx); }
  else {
    const slots = feeders.map(([g, mid, nm]) => { const r = results.get(`${g.id}:${mid}`); return { team: r ? r.winner : null, seed: r ? seedOf[r.winner.id] ?? null : null, label: r ? null : plan.grouped ? `${nm} champion` : nm, wins: null, winner: false }; });
    finalM = { id: 'final:f', bestOf: fin.bestOf, status: 'projected', slots, summary: '', next: null };
  }
  const finalRounds = [{ id: fin.id, name: fin.name, bestOf: fin.bestOf, matchups: [finalM] }];
  const win = finalM.status === 'final' ? finalM.slots.find((s) => s.winner) : null;
  const all = [...groups.flatMap((g) => g.rounds.flatMap((r) => r.matchups)), finalM];
  const real = all.some((m) => m.status !== 'projected');
  return { sport, title: plan.title, groups, finalRounds, champion: win ? win.team : null, real, inProgress: real && !win, seeds: seedGroups, size: plan.size };
}

module.exports = { PLANS, SEEDERS, lite, roundOf, seriesFromEvents, summaryOf, buildBracket, nflSeeds, nbaSeeds, mlbSeeds, wnbaSeeds, num };
