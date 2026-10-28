'use strict';
/**
 * bigplay.js — "is this play a big play?" for every Gamecast sport (v1.4.0 feature A).
 *
 * Pure functions, no network. Input is ESPN's own play records (scoring flag, play type, yardage, score value, clock, scores) in
 * CHRONOLOGICAL order; output is a Map(playId -> bp). A play is only flagged from a real ESPN field or from the play text ESPN printed;
 * nothing is invented, and plays we cannot read are simply not flagged (never guessed).
 *
 *   bp = { t: 'big' | 'huge',      tier: how loud the animation is (big = edge flash + callout; huge = + shake, spotlight, confetti)
 *          k: 'td' | 'hr' | 'three' | ...   kind (drives the icon / colour)
 *          h: 'TOUCHDOWN!',        headline
 *          s: '54-YARD PASS',      sub-line (may be '')
 *          v: 54, u: 'YD',         optional count-up value + unit ('YD' yards, 'FT' feet)
 *          side: 'home'|'away'|null   which team benefited (for the team-colour flash) }
 *
 * THRESHOLDS (also exported as DOC and listed in README / CHANGELOG):
 *  Football (NFL, college)   big : touchdown (any), 2-point conversion, pass or run of 20-39 yards, interception, lost fumble, field goal 50-59.
 *                            huge: touchdown of 40+ yards or any return touchdown (pick-six, fumble/punt/kick return), pass/run of 40+ yards
 *                                  ("BOMB"), interception returned 40+, sack-fumble lost, safety, field goal 60+.
 *  Baseball (MLB, college)   big : home run, triple, a hit that scores 3+ runs (bases cleared), a hit that takes the lead or ties from the 7th inning on.
 *                            huge: grand slam, walk-off (home team goes ahead in the 9th or later), home run that takes the lead or ties from the 7th on.
 *  Basketball                big : made 3-pointer, dunk, and-one, buzzer-beater (made shot with <= 1.0 s left in a period), go-ahead/tying basket in the
 *                                  last 2:00 of the final period or overtime.
 *                            huge: 4-point play, buzzer-beater that wins or ties the game in the final period/OT, go-ahead/tying basket in the last 0:30.
 *  Hockey                    big : goal (power-play and empty-net goals are labelled).
 *                            huge: overtime goal, short-handed goal, a goal that ties the game in the last 2:00 of the 3rd period.
 *  Soccer                    huge: goal, penalty goal, own goal.   big: red card, penalty saved/missed.
 *  Golf                      big : eagle (-2)   huge: albatross (-3 or better) or hole-in-one.
 *  Tennis                    none: ESPN publishes no point-by-point data, so break / set / match point cannot be known (we never guess).
 *  Other sports              big : any play ESPN itself flags as scoring (generic fallback).
 */

const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
const U = (s) => String(s == null ? '' : s).toUpperCase();
const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();

/** "11:40" -> 700, "37.5" -> 37.5, "0.0" -> 0, "" -> null */
function secs(c) {
  const v = c && typeof c === 'object' ? c.displayValue : c; if (v == null || v === '') return null;
  const s = String(v); const m = s.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/); if (m) return +m[1] * 60 + +m[2];
  const f = parseFloat(s); return isNaN(f) ? null : f;
}
const bp = (t, k, h, s, extra) => ({ t, k, h, s: s || '', v: null, u: null, side: null, ...(extra || {}) });
const opp = (s) => (s === 'home' ? 'away' : s === 'away' ? 'home' : null);
const sideOfTeam = (ctx, id) => (id == null ? null : String(id) === String(ctx.homeId) ? 'home' : String(id) === String(ctx.awayId) ? 'away' : null);
const yd = (n) => `${n}-YARD`;

/* ----------------------------------------------------------------------------------------------- football */
const fbYards = (p) => { const y = num(p.statYardage); return y == null ? null : y; };
function tdYards(p) {
  const tx = oneLine(p.text); const m = tx.match(/(\d+) yards?,? (?:gain to the \w+ )?TOUCHDOWN/i) || tx.match(/for (\d+) yards?[^.]*?TOUCHDOWN/i);
  if (m) return +m[1];
  const y = fbYards(p); return y != null && y > 0 ? y : null;
}
function fgYards(p) {
  const m = oneLine(p.text).match(/(\d+) yard field goal/i) || oneLine(p.text).match(/field goal attempt from (\d+) yards/i);
  if (m) return +m[1]; const y = fbYards(p); return y != null && y > 0 ? y : null;
}
function football(plays, ctx) {
  const out = new Map(); let pa = 0, ph = 0;
  for (const p of plays) {
    const a = num(p.awayScore), h = num(p.homeScore);
    const dSide = a != null && h != null ? (a > pa ? 'away' : h > ph ? 'home' : null) : null; if (a != null && h != null) { pa = a; ph = h; }
    const ty = (p.type && p.type.text) || ''; const tx = oneLine(p.text); const id = p.id; if (id == null) continue;
    const tp = (p.teamParticipants || []); const off = tp.find((x) => x.type === 'offense'); const def = tp.find((x) => x.type === 'defense');
    const offSide = sideOfTeam(ctx, off && off.id); const defSide = sideOfTeam(ctx, def && def.id);
    const yds = fbYards(p); let r = null;
    if (/^two.?point/i.test(ty) || /^TWO-POINT/i.test(tx)) {
      if (p.scoringPlay || /\b(?:attempt )?succe|\bgood\b/i.test(tx) && !/fail|no good|incomplete/i.test(tx)) r = bp('big', 'two', 'TWO-POINT CONVERSION!', '', { side: dSide || offSide });
    } else if (p.scoringPlay && /safety/i.test(ty)) {
      r = bp('huge', 'safety', 'SAFETY!', '', { side: dSide || defSide });
    } else if (p.scoringPlay && /touchdown/i.test(ty + ' ' + (/TOUCHDOWN/.test(tx) ? 'touchdown' : ''))) {
      const y = tdYards(p); const side = dSide || offSide;
      let kind = 'td', label = '', ret = false;
      if (/pass/i.test(ty)) label = 'PASS'; else if (/rush/i.test(ty)) label = 'RUN';
      else if (/interception/i.test(ty)) { kind = 'pick6'; ret = true; } else if (/fumble/i.test(ty)) { kind = 'fumble6'; ret = true; }
      else if (/return|blocked/i.test(ty)) { kind = 'return6'; ret = true; }
      else label = /pass/i.test(tx) ? 'PASS' : /rush|run/i.test(tx) ? 'RUN' : '';
      const head = kind === 'pick6' ? 'PICK-SIX!' : kind === 'fumble6' ? 'FUMBLE RETURN TOUCHDOWN!' : kind === 'return6' ? 'RETURN TOUCHDOWN!' : 'TOUCHDOWN!';
      const sub = y ? `${yd(y)} ${label || (ret ? 'RETURN' : '')}`.trim() : label;
      r = bp(ret || (y != null && y >= 40) ? 'huge' : 'big', kind, head, sub, { v: y || null, u: y ? 'YD' : null, side });
    } else if (p.scoringPlay && /field goal/i.test(ty)) {
      const y = fgYards(p);
      if (y != null && y >= 50) r = bp(y >= 60 ? 'huge' : 'big', 'fg', `${y}-YARD FIELD GOAL!`, y >= 60 ? 'FROM DEEP' : 'LONG RANGE', { v: y, u: 'YD', side: dSide || offSide });
    } else if (/^Sack$/i.test(ty) && /FUMBLES/i.test(tx) && !/PENALTY|nullified|reversed/i.test(tx)) {
      const m = tx.match(/RECOVERED by ([A-Z]{2,4})-/); const offAbbr = ctx.abbrs && off && ctx.abbrs[String(off.id)];
      if (m && offAbbr && m[1] !== offAbbr) r = bp('huge', 'sackfum', 'SACK-FUMBLE!', 'DEFENSE TAKES IT', { side: defSide });
    } else if (/interception/i.test(ty) && !p.scoringPlay) {
      r = bp(yds != null && yds >= 40 ? 'huge' : 'big', 'int', 'INTERCEPTION!', yds != null && yds >= 20 ? `${yd(yds)} RETURN` : '', { v: yds != null && yds >= 20 ? yds : null, u: yds != null && yds >= 20 ? 'YD' : null, side: defSide });
    } else if (/^Fumble Recovery \(Opponent\)/i.test(ty) && !p.scoringPlay) {
      r = bp('big', 'fumble', 'FUMBLE!', 'TURNOVER', { side: defSide });
    } else if (/^(?:Rush|Pass Reception)$/i.test(ty) && !p.isPenalty && yds != null && yds >= 20 && !/PENALTY.*No Play|nullified/i.test(tx)) {
      const pass = /^Pass/i.test(ty);
      r = bp(yds >= 40 ? 'huge' : 'big', pass ? 'pass' : 'run', yds >= 40 ? (pass ? 'BOMB!' : 'BREAKAWAY!') : (pass ? 'BIG PASS!' : 'BIG RUN!'), `${yd(yds)} ${pass ? 'PASS' : 'RUN'}`, { v: yds, u: 'YD', side: offSide });
    }
    if (r) out.set(String(id), r);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------- baseball */
const HIT = /\b(singled|doubled|tripled|homered)\b/i;
function baseball(plays, ctx) {
  const out = new Map(); const late = ctx.lateInning || 7; const walkInning = ctx.walkInning || 9;
  for (const p of plays) {
    const tx = oneLine(p.text); const ty = (p.type && p.type.text) || '';
    if (p.id == null || !tx || !(p.scoringPlay || HIT.test(tx))) continue;
    if (ty !== 'Play Result') continue;
    const per = p.period || {}; const bot = /bottom/i.test(per.type || ''); const side = bot ? 'home' : 'away'; const inn = num(per.number) || 0;
    const sv = p.scoringPlay ? (num(p.scoreValue) || 0) : 0; const a = num(p.awayScore), h = num(p.homeScore);
    const bat = side === 'home' ? h : a, ot = side === 'home' ? a : h;
    const after = bat != null && ot != null ? bat - ot : null; const before = after != null ? after - sv : null;
    const swing = before != null && after != null && ((before < 0 && after >= 0) || (before === 0 && after > 0));
    const lead = after != null && after > 0; const isLate = inn >= late;
    const hr = /homered|home run/i.test(tx), tri = /tripled/i.test(tx), hit = HIT.test(tx);
    const feet = (tx.match(/\((\d{2,3}) feet\)/) || [])[1]; let r = null;
    if (sv > 0 && side === 'home' && inn >= walkInning && before != null && before <= 0 && after > 0) {
      r = bp('huge', 'walkoff', 'WALK-OFF!', hr ? 'WALK-OFF HOME RUN' : hit ? `WALK-OFF ${U((tx.match(HIT) || [])[1]).replace('SINGLED', 'SINGLE').replace('DOUBLED', 'DOUBLE').replace('TRIPLED', 'TRIPLE')}` : 'WALK-OFF WIN', { side, v: hr && feet ? +feet : null, u: hr && feet ? 'FT' : null });
    } else if (hr && sv === 4) {
      r = bp('huge', 'slam', 'GRAND SLAM!', feet ? `${feet} FEET` : '4 RUNS SCORE', { side, v: feet ? +feet : null, u: feet ? 'FT' : null });
    } else if (hr) {
      const hot = isLate && swing;
      r = bp(hot ? 'huge' : 'big', 'hr', 'HOME RUN!', sv > 1 ? `${sv}-RUN HOME RUN${feet ? ` · ${feet} FT` : ''}` : (hot ? (lead ? 'TAKES THE LEAD' : 'TIES THE GAME') : feet ? `${feet} FEET` : ''), { side, v: feet ? +feet : null, u: feet ? 'FT' : null });
    } else if (tri) {
      r = bp('big', 'triple', 'TRIPLE!', sv > 0 ? `${sv} RUN${sv > 1 ? 'S' : ''} SCORE` : '', { side });
    } else if (hit && sv >= 3) {
      r = bp('big', 'clear', 'BASES CLEARED!', `${sv} RUNS SCORE`, { side });
    } else if (hit && sv > 0 && isLate && swing) {
      r = bp('big', 'clutch', lead ? 'GO-AHEAD HIT!' : 'GAME TIED!', lead ? 'TAKES THE LEAD' : 'TIES IT UP', { side });
    }
    if (r) out.set(String(p.id), r);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------- basketball */
function basketball(plays, ctx) {
  const out = new Map(); const reg = ctx.regPeriods || 4; let lastFg = null;
  for (const p of plays) {
    const id = p.id; if (id == null) continue; const tx = oneLine(p.text); const ty = (p.type && p.type.text) || '';
    if (!p.scoringPlay) { continue; }
    const sv = num(p.scoreValue) || (/three point|3-point|three-point/i.test(tx) ? 3 : 0); if (!sv) continue;
    const side = sideOfTeam(ctx, p.team && p.team.id) || null; const per = num(p.period && (p.period.number != null ? p.period.number : p.period)) || 1;
    const a = num(p.awayScore), h = num(p.homeScore); const mine = side === 'home' ? h : a, theirs = side === 'home' ? a : h;
    const after = side && mine != null && theirs != null ? mine - theirs : null; const before = after != null ? after - sv : null;
    const swing = before != null && ((before < 0 && after >= 0) || (before === 0 && after > 0)); const lead = after != null && after > 0;
    const t = secs(p.clock); const final = per >= reg; const ft = /free throw/i.test(ty);
    let r = null;
    const dist = (tx.match(/(\d+)-foot/i) || [])[1];
    const isFg = !ft && sv >= 2;
    if (ft && /1 of 1/i.test(ty) && lastFg && lastFg.side === side && lastFg.per === per && lastFg.t === t) {
      r = lastFg.sv === 3 ? bp('huge', 'four', 'FOUR-POINT PLAY!', 'THREE PLUS THE FOUL', { side }) : bp('big', 'and1', 'AND ONE!', 'MAKES THE FREE THROW', { side });
    } else if (isFg && t != null && t <= 1.0 && (!final || swing || sv === 3)) {
      const win = final && swing;
      r = bp(win ? 'huge' : 'big', 'buzzer', 'BUZZER-BEATER!', win ? (lead ? 'GAME-WINNING SHOT' : 'TIES IT AT THE BUZZER') : (sv === 3 ? 'FROM DEEP' : 'AT THE HORN'), { side });
    } else if (swing && final && t != null && t <= 120) {
      r = bp(t <= 30 ? 'huge' : 'big', 'clutch', lead ? (ft ? 'GO-AHEAD FREE THROW!' : sv === 3 ? 'GO-AHEAD THREE!' : 'GO-AHEAD BASKET!') : (ft ? 'FREE THROW TIES IT!' : 'TIES IT!'), lead ? 'TAKES THE LEAD' : 'GAME TIED', { side });
    } else if (isFg && sv === 3) {
      r = bp('big', 'three', 'THREE!', dist ? `${dist}-FOOT 3-POINTER` : '3-POINTER', { side, v: dist ? +dist : null, u: dist ? 'FT' : null });
    } else if (isFg && /dunk/i.test(ty + ' ' + tx)) {
      r = bp('big', 'dunk', /alley oop/i.test(ty + ' ' + tx) ? 'ALLEY-OOP!' : 'DUNK!', '', { side });
    }
    if (isFg) lastFg = { side, per, t, sv };
    if (r) out.set(String(id), r);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------- hockey */
function hockey(plays, ctx) {
  const out = new Map();
  for (const p of plays) {
    if (!p.scoringPlay || p.id == null) continue; const ty = (p.type && p.type.text) || ''; if (!/goal/i.test(ty)) continue;
    const st = oneLine(p.strength && p.strength.text); const tx = oneLine(p.text); const side = sideOfTeam(ctx, p.team && p.team.id);
    const per = num(p.period && p.period.number) || 1; const t = secs(p.clock); const a = num(p.awayScore), h = num(p.homeScore);
    const mine = side === 'home' ? h : a, theirs = side === 'home' ? a : h; const diff = side && mine != null && theirs != null ? mine - theirs : null;
    const tied = diff === 0; let r;
    if (/short/i.test(st)) r = bp('huge', 'shg', 'SHORT-HANDED GOAL!', '', { side });
    else if (per > 3 && !/shootout/i.test(ty + tx)) r = bp('huge', 'otg', 'OVERTIME GOAL!', '', { side });
    else if (per === 3 && tied && t != null && t <= 120) r = bp('huge', 'tie', 'GOAL — GAME TIED!', 'LATE IN THE 3RD', { side });
    else if (/empty/i.test(st + ' ' + tx)) r = bp('big', 'eng', 'EMPTY-NET GOAL!', '', { side });
    else if (/power/i.test(st)) r = bp('big', 'ppg', 'POWER-PLAY GOAL!', '', { side });
    else r = bp('big', 'goal', 'GOAL!', '', { side });
    out.set(String(p.id), r);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------- soccer */
function soccer(plays, ctx) {
  const out = new Map();
  for (const p of plays) {
    if (p.id == null || p.shootout) continue; const tt = (p.type && (p.type.type || '')) || ''; const ty = (p.type && p.type.text) || ''; const side = sideOfTeam(ctx, p.team && p.team.id);
    const min = oneLine(p.clock && p.clock.displayValue); const tx = oneLine(p.text); let r = null;
    if (/own-goal/.test(tt)) r = bp('huge', 'og', 'OWN GOAL!', min, { side });
    else if (/^penalty/.test(tt) && p.scoringPlay) r = bp('huge', 'pen', 'PENALTY GOAL!', min, { side });
    else if (/^penalty/.test(tt)) r = bp('big', 'penmiss', /saved/i.test(ty + tx) ? 'PENALTY SAVED!' : 'PENALTY MISSED!', min, { side });
    else if (p.scoringPlay && /^goal/.test(tt)) r = bp('huge', 'goal', 'GOAL!', min, { side });
    else if (/^red-card/.test(tt)) r = bp('big', 'red', 'RED CARD!', min, { side: opp(side) });
    if (r) out.set(String(p.id), r);
  }
  return out;
}

/* ----------------------------------------------------------------------------------------------- generic */
function generic(plays) {
  const out = new Map();
  for (const p of plays) if (p.scoringPlay && p.id != null) out.set(String(p.id), bp('big', 'score', 'SCORE!', oneLine((p.type && p.type.text) || ''), {}));
  return out;
}

/** classify(family, chronologicalPlays, ctx) -> Map(playId -> bp). ctx = { homeId, awayId, abbrs?, regPeriods?, lateInning? } */
function classify(family, plays, ctx) {
  try {
    const c = ctx || {}; const ps = plays || [];
    if (family === 'football') return football(ps, c);
    if (family === 'baseball') return baseball(ps, c);
    if (family === 'basketball') return basketball(ps, c);
    if (family === 'hockey') return hockey(ps, c);
    if (family === 'soccer') return soccer(ps, c);
    return generic(ps);
  } catch (e) { return new Map(); }
}

/** Regulation periods per sport (so "final period" is known for clutch rules). */
const regPeriods = (sport) => ({ mcbb: 2 }[sport] || 4);

/* ----------------------------------------------------------------------------------------------- golf */
/** golfBig(players, cards, holes): eagles (-2), albatrosses (-3 or better) and holes-in-one from ESPN's published hole scores. */
function golfBig(players, cards, holes) {
  const par = new Map(); (holes || []).forEach((h) => par.set(h.n, h.par)); const out = [];
  for (const p of players || []) {
    const card = cards && cards[p.id]; if (!card) continue;
    for (const rd of card) for (const hl of rd.holes || []) {
      if (hl.s == null) continue; const pr = par.get(hl.n); const diff = pr != null ? hl.s - pr : null;
      const ace = hl.s === 1 && (pr == null || pr >= 3);
      if (!ace && !(diff != null && diff <= -2)) continue;
      const word = ace ? 'HOLE-IN-ONE!' : diff <= -3 ? 'ALBATROSS!' : 'EAGLE!';
      out.push({ id: `${p.id}:r${rd.r}:h${hl.n}`, round: rd.r, hole: hl.n, player: p.name, pid: p.id,
        bp: bp(ace || diff <= -3 ? 'huge' : 'big', ace ? 'ace' : diff <= -3 ? 'albatross' : 'eagle', word, `HOLE ${hl.n}${pr != null ? ` · PAR ${pr}` : ''} · ${hl.s}`, {}) });
    }
  }
  return out.sort((a, b) => (b.round - a.round) || (b.hole - a.hole));
}

/* ----------------------------------------------------------------------------------------------- text-only (NCAA.com fallback) */
/** Plays printed by NCAA.com carry no scoring flag, no score value and no team ids: classify only what the text itself states plainly. */
function fromText(family, text) {
  const tx = oneLine(text); if (!tx) return null;
  if (family === 'football') {
    if (/TOUCHDOWN/.test(tx) && !/nullified|no good|NO PLAY/i.test(tx)) {
      const m = tx.match(/(\d+) yards?[^.]*?TOUCHDOWN/i) || tx.match(/for (\d+) yards?/i); const y = m ? +m[1] : null; const pass = /pass/i.test(tx);
      return bp(y != null && y >= 40 ? 'huge' : 'big', 'td', 'TOUCHDOWN!', y ? `${yd(y)} ${pass ? 'PASS' : 'RUN'}` : '', { v: y, u: y ? 'YD' : null });
    }
    const f = tx.match(/field goal attempt from (\d+) yards? GOOD/i) || tx.match(/(\d+) yard field goal.*GOOD/i);
    if (f && +f[1] >= 50) return bp(+f[1] >= 60 ? 'huge' : 'big', 'fg', `${f[1]}-YARD FIELD GOAL!`, '', { v: +f[1], u: 'YD' });
    if (/pass intercepted/i.test(tx) && !/PENALTY/.test(tx)) return bp('big', 'int', 'INTERCEPTION!', '');
    return null;
  }
  if (family === 'basketball') {
    if (/\b(?:made|GOOD)\b/i.test(tx) && /\bthree point|3-point|3pt/i.test(tx) && !/miss/i.test(tx)) return bp('big', 'three', 'THREE!', '3-POINTER');
    if (/\b(?:made|GOOD)\b/i.test(tx) && /\bdunk\b/i.test(tx) && !/miss/i.test(tx)) return bp('big', 'dunk', 'DUNK!', '');
    return null;
  }
  if (family === 'baseball') {
    if (/grand slam/i.test(tx)) return bp('huge', 'slam', 'GRAND SLAM!', '');
    if (/\bhomered\b|\bhome run\b/i.test(tx)) { const rbi = (tx.match(/(\d) RBI/) || [])[1]; return bp(rbi === '4' ? 'huge' : 'big', rbi === '4' ? 'slam' : 'hr', rbi === '4' ? 'GRAND SLAM!' : 'HOME RUN!', rbi && +rbi > 1 ? `${rbi}-RUN HOME RUN` : ''); }
    if (/\btripled\b/i.test(tx)) return bp('big', 'triple', 'TRIPLE!', '');
    return null;
  }
  return null;
}

/** Compact game-level list for the "Big plays" chips: huge first (in play order), then big, capped. items: [{id,bp,...}] chronological. */
function summarize(items, cap = 40) {
  const a = (items || []).filter((x) => x && x.bp);
  if (a.length <= cap) return a;
  const huge = a.filter((x) => x.bp.t === 'huge'); const big = a.filter((x) => x.bp.t !== 'huge');
  const keep = new Set([...huge, ...big.slice(-(Math.max(0, cap - huge.length)))]);
  return a.filter((x) => keep.has(x)).slice(-cap);
}

/** "Q3 11:40" / "P2 5:10" / "OT 2:22" / "34'" — a short real-time label for a play. */
function whenOf(family, sport, period, clock, label) {
  const n = num(period); const c = oneLine(clock && clock.displayValue != null ? clock.displayValue : clock);
  if (family === 'baseball') return oneLine(label) || (n ? `Inning ${n}` : '');
  if (family === 'soccer') return c;
  const reg = family === 'hockey' ? 3 : family === 'football' ? 4 : regPeriods(sport);
  const nm = n == null ? '' : n > reg ? (n - reg > 1 && family !== 'football' ? `OT${n - reg}` : 'OT') : family === 'hockey' ? `P${n}` : sport === 'mcbb' ? `H${n}` : `Q${n}`;
  return `${nm}${nm && c ? ' ' : ''}${c}`.trim();
}

const DOC = {
  football: 'big: TD, 2-pt, pass/run 20-39 yd, interception, lost fumble, FG 50-59 | huge: TD 40+ yd or return TD, pass/run 40+ yd, INT return 40+, sack-fumble lost, safety, FG 60+',
  baseball: 'big: HR, triple, 3+ run hit, go-ahead/tying hit from 7th | huge: grand slam, walk-off, go-ahead/tying HR from 7th',
  basketball: 'big: 3-pointer, dunk, and-one, buzzer-beater, go-ahead/tying basket in last 2:00 of final period/OT | huge: 4-point play, game-winning/tying buzzer-beater, go-ahead/tying basket in last 0:30',
  hockey: 'big: goal (PP / empty-net labelled) | huge: OT goal, short-handed goal, tying goal in last 2:00 of 3rd',
  soccer: 'huge: goal, penalty goal, own goal | big: red card, penalty saved/missed',
  golf: 'big: eagle | huge: albatross, hole-in-one',
  tennis: 'none (ESPN has no point-by-point data)',
};

module.exports = { whenOf, classify, regPeriods, golfBig, fromText, summarize, secs, DOC };
