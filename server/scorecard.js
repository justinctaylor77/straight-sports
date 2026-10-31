'use strict';
// v1.7.0 "Scorekeeper": turns an ESPN baseball summary payload (the same /summary?event= the Gamecast reads) into a paper
// scorebook sheet: one sheet per team, rows = batting-order slots (subs under the slot they replaced), columns = innings.
// Pure function, no network: build(summary, { sport }) -> sheet. Never invents: any play-result it cannot read becomes '?'.
const POS = { pitcher: 1, catcher: 2, first: 3, second: 4, third: 5, shortstop: 6, left: 7, center: 8, right: 9 };
const BASE = { first: 1, second: 2, third: 3, home: 4 };
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const posNum = (s) => { const m = fold(s).match(/\b(pitcher|catcher|first|second|third|shortstop|left|center|right)\b/); return m ? POS[m[1]] : null; };
// "to second" / "shortstop to second to first" -> [6,4,3]
const seqOf = (s) => { const m = fold(s).match(/\b(?:pitcher|catcher|first|second|third|shortstop|left|center|right)(?: (?:baseman|fielder))?(?: to (?:pitcher|catcher|first|second|third|shortstop|left|center|right)(?: (?:baseman|fielder))?)+/); return m ? m[0].split(' to ').map(posNum).filter(Boolean) : []; };
const afterTo = (s) => { const m = fold(s).match(/\bto (?:deep |shallow |short )?(pitcher|catcher|first|second|third|shortstop|left|center|right)/); return m ? POS[m[1]] : null; };
const errPos = (s) => { const m = fold(s).match(/error by (pitcher|catcher|first|second|third|shortstop|left|center|right)/); return m ? POS[m[1]] : null; };

// Clean ESPN text: drop replay/challenge sentences, trailing period.
function cleanText(t) {
  let s = String(t || '').trim();
  s = s.replace(/\.\s+[A-Z][^.]*?(challenged|review|overturned|upheld|confirmed)[^]*$/i, '');
  return s.replace(/\.\s*$/, '');
}
// Split "A singled to left, B scored, C to third" -> clauses (a comma followed by a capitalised name starts a new clause).
const clauses = (s) => s.split(/,\s+(?=[A-ZÀ-Ý])/).map((x) => x.trim()).filter(Boolean);

// Batter result from the first clause. Returns { text, kind: 'hit'|'reach'|'out'|'unk', base, looking, dp, sac }
function batterResult(c) {
  const f = fold(c);
  if (/intentionally walked/.test(f)) return { text: 'IBB', kind: 'reach', base: 1 };
  if (/\bwalked\b/.test(f)) return { text: 'BB', kind: 'reach', base: 1 };
  if (/hit by pitch/.test(f)) return { text: 'HBP', kind: 'reach', base: 1 };
  if (/catcher s interference|reached on interference/.test(f)) return { text: 'CI', kind: 'reach', base: 1 };
  if (/struck out/.test(f)) {
    const looking = /struck out looking|called out on strikes/.test(f);
    if (/(reached|safe at) first on (wild pitch|passed ball)|reached on (wild pitch|passed ball)/.test(f)) return { text: `K-${/passed/.test(f) ? 'PB' : 'WP'}`, kind: 'reach', base: 1, looking };
    if (/double play/.test(f)) return { text: 'K DP', kind: 'out', looking, dp: true };
    return { text: 'K', kind: 'out', looking };
  }
  if (/\bhomered\b|home run/.test(f)) return { text: 'HR', kind: 'hit', base: 4 };
  if (/\btripled\b/.test(f)) return { text: '3B', kind: 'hit', base: 3 };
  if (/\bdoubled\b/.test(f) && !/doubled off/.test(f)) return { text: '2B', kind: 'hit', base: 2 };
  if (/\bsingled\b|infield single|bunt single/.test(f)) return { text: '1B', kind: 'hit', base: 1 };
  if (/triple play/.test(f)) { const q = seqOf(c); return { text: `TP${q.length ? ' ' + q.join('-') : ''}`, kind: 'out', dp: true }; }
  if (/double play/.test(f)) { const q = seqOf(c); const pre = /lined/.test(f) ? 'L' : /flied|fly/.test(f) ? 'F' : /popped/.test(f) ? 'P' : ''; return { text: `DP ${pre && q.length === 0 ? pre : ''}${q.length ? q.join('-') : (afterTo(c) || '')}`.trim(), kind: 'out', dp: true, gdp: /grounded/.test(f) }; }
  if (/sacrifice fly/.test(f)) return { text: `SF${afterTo(c) || ''}`, kind: 'out', sac: true };
  if (/sacrifice bunt|sacrificed/.test(f)) {
    if (/error/.test(f)) return { text: `SAC E-${errPos(c) || '?'}`, kind: 'reach', base: 1, sac: true };
    if (/fielder s choice|safe/.test(f)) return { text: 'SAC FC', kind: 'reach', base: 1, sac: true };
    const p = afterTo(c); return { text: `SAC ${p === 3 ? '3U' : p ? `${p}-3` : ''}`.trim(), kind: 'out', sac: true };
  }
  if (/fielder s choice/.test(f)) return { text: 'FC', kind: 'reach', base: 1 };
  if (/error/.test(f) && /(safe at|reached)/.test(f)) { const b = /safe at second/.test(f) ? 2 : /safe at third/.test(f) ? 3 : 1; return { text: `E-${errPos(c) || '?'}`, kind: 'reach', base: b }; }
  if (/grounded out|bunted out|grounds out|grounded into/.test(f)) { const q = seqOf(c); if (q.length > 1) return { text: q.join('-'), kind: 'out' }; const p = afterTo(c); return p ? { text: p === 3 ? '3U' : `${p}-3`, kind: 'out' } : { text: '?', kind: 'unk' }; }
  if (/flied out|fouled out|fly out/.test(f)) { const p = afterTo(c); return p ? { text: `F${p}`, kind: 'out' } : { text: '?', kind: 'unk' }; }
  if (/lined out|lines out/.test(f)) { const p = afterTo(c); return p ? { text: `L${p}`, kind: 'out' } : { text: '?', kind: 'unk' }; }
  if (/popped out|pops out|bunt popped/.test(f)) { const p = afterTo(c); return p ? { text: `P${p}`, kind: 'out' } : { text: '?', kind: 'unk' }; }
  return { text: '?', kind: 'unk' };
}

// Runner clause: "<Name> scored", "<Name> to third", "<Name> stole second", "<Name> out at home", "<Name> caught stealing second" ...
function runnerClause(c) {
  const f = c.replace(/\.$/, '');
  let m;
  if ((m = f.match(/^(.+?) (?:picked off and )?caught stealing (second|third|home)/i))) return { name: m[1], out: true, base: BASE[m[2].toLowerCase()], note: 'CS' };
  if ((m = f.match(/^(.+?) picked off (?:at )?(first|second|third)/i))) return { name: m[1], out: true, base: BASE[m[2].toLowerCase()], note: 'PO', stay: true };
  if ((m = f.match(/^(.+?) (?:out at|thrown out at|tagged out at|doubled off|tripled off|out stretching at|forced out at) (first|second|third|home)/i))) return { name: m[1], out: true, base: BASE[m[2].toLowerCase()], stay: /doubled off|tripled off/i.test(f) };
  if ((m = f.match(/^(.+?) stole (second|third|home)/i))) return { name: m[1], base: BASE[m[2].toLowerCase()], note: 'SB', scored: m[2].toLowerCase() === 'home' };
  if ((m = f.match(/^(.+?) scored/i))) return { name: m[1], base: 4, scored: true, note: /error/i.test(f) ? 'E' : /wild pitch/i.test(f) ? 'WP' : /passed ball/i.test(f) ? 'PB' : /balk/i.test(f) ? 'BK' : null, noRbi: /error|wild pitch|passed ball|balk/i.test(f) };
  if ((m = f.match(/^(.+?) (?:to|safe at|advanced to) (second|third|home)/i))) return { name: m[1], base: BASE[m[2].toLowerCase()], scored: m[2].toLowerCase() === 'home', note: /error/i.test(f) ? 'E' : /wild pitch/i.test(f) ? 'WP' : /passed ball/i.test(f) ? 'PB' : /balk/i.test(f) ? 'BK' : /stole/i.test(f) ? 'SB' : null };
  return null;
}
const SUB = /^(.+?) (hit for|ran for|relieved|in (?:left|center|right) field|at (?:first|second|third) base|at shortstop|catching|pitching|as designated hitter|replaced)/i;

function statsOf(a, keys) { const o = {}; (keys || []).forEach((k, i) => { o[k] = a.stats ? a.stats[i] : null; }); return o; }

function build(d, opts = {}) {
  const comp = (d.header && d.header.competitions && d.header.competitions[0]) || {};
  const status = comp.status || {}; const st = (status.type || {});
  const state = st.state || 'pre';
  const sides = {}; // espn team id -> 'home'|'away'
  const out = { v: 1, sport: opts.sport || 'mlb', id: String(comp.id || (d.header && d.header.id) || ''), state, detail: st.detail || st.shortDetail || '', live: state === 'in', innings: 9, teams: {}, current: null, hasPlays: false, date: comp.date ? (() => { try { return new Date(comp.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' }); } catch { return null; } })() : null };
  for (const c of comp.competitors || []) {
    sides[String(c.id)] = c.homeAway;
    out.teams[c.homeAway] = { side: c.homeAway, id: String(c.id), abbr: (c.team && c.team.abbreviation) || '', name: (c.team && (c.team.displayName || c.team.name)) || '', logo: (c.team && ((c.team.logos && c.team.logos[0] && c.team.logos[0].href) || c.team.logo)) || null, score: c.score != null ? String(c.score) : null,
      slots: [], cells: {}, innings: [], pitchers: [], linescores: (c.linescores || []).map((l) => ({ r: l.displayValue != null ? +l.displayValue : null, h: l.hits != null ? l.hits : null, e: l.errors != null ? l.errors : null })) };
  }
  // ---- lineups: boxscore batting (has stats) first, roster (has jersey, also pre-game) as fallback / enrichment
  const people = {}; // pid -> { id, name, short, pos, jersey, side, order }
  const jer = {};
  for (const r of d.rosters || []) for (const a of r.roster || []) { const id = String(a.athlete && a.athlete.id); jer[id] = a.jersey || (a.athlete && a.athlete.jersey) || null; }
  const addPerson = (side, a, order, extra) => {
    const id = String(a.athlete && a.athlete.id); if (!id || id === 'undefined') return null;
    const p = people[id] || (people[id] = { id, name: a.athlete.displayName || a.athlete.fullName || '', short: a.athlete.shortName || '', pos: (a.position && a.position.abbreviation) || '', jersey: jer[id] || a.jersey || null, side, order });
    Object.assign(p, extra || {}); return p;
  };
  for (const tb of (d.boxscore && d.boxscore.players) || []) {
    const side = sides[String(tb.team && tb.team.id)]; const T = out.teams[side]; if (!T) continue;
    for (const s of tb.statistics || []) {
      if (s.type === 'batting') for (const a of s.athletes || []) {
        if (!a.batOrder) continue; const st2 = statsOf(a, s.keys);
        const p = addPerson(side, a, a.batOrder, { starter: !!a.starter, stats: { AB: st2.atBats, R: st2.runs, H: st2.hits, RBI: st2.RBIs, BB: st2.walks, K: st2.strikeouts } });
        if (!p) continue; let sl = T.slots.find((x) => x.order === a.batOrder); if (!sl) T.slots.push(sl = { order: a.batOrder, players: [] }); if (!sl.players.includes(p.id)) sl.players.push(p.id);
      }
      if (s.type === 'pitching') for (const a of s.athletes || []) { const v = statsOf(a, s.keys); T.pitchers.push({ id: String(a.athlete.id), name: a.athlete.displayName, IP: v['fullInnings.partInnings'], H: v.hits, R: v.runs, ER: v.earnedRuns, BB: v.walks, K: v.strikeouts, PC: v.pitches || (v['pitches-strikes'] ? String(v['pitches-strikes']).split('-')[0] : null) }); }
    }
  }
  for (const r of d.rosters || []) {
    const side = r.homeAway || sides[String(r.team && r.team.id)]; const T = out.teams[side]; if (!T) continue;
    for (const a of r.roster || []) {
      if (!a.batOrder) continue; const p = addPerson(side, a, a.batOrder, {}); if (!p) continue; if (!p.pos && a.position) p.pos = a.position.abbreviation;
      let sl = T.slots.find((x) => x.order === a.batOrder); if (!sl) T.slots.push(sl = { order: a.batOrder, players: [] }); if (!sl.players.includes(p.id)) sl.players.push(p.id);
    }
  }
  for (const T of Object.values(out.teams)) T.slots.sort((a, b) => a.order - b.order);
  const slotOf = (pid) => { const p = people[pid]; return p ? p.order : null; };
  const byName = (side, name) => { const n = fold(name); if (!n) return null; const c = Object.values(people).filter((p) => p.side === side && (fold(p.name) === n || fold(p.name).endsWith(' ' + n) || fold(p.short).endsWith(' ' + n) || fold(p.short) === n)); return c.length === 1 ? c[0] : null; };

  // ---- walk the play-by-play
  const plays = (d.plays || []).filter((p) => p && p.type && p.period);
  const results = plays.filter((p) => p.type.type === 'play-result');
  out.hasPlays = results.length > 0;
  let half = null; let runners = []; let outs = 0; let lastCell = null;
  const cellsOf = (side, slot, inn) => { const T = out.teams[side]; const k = `${slot}|${inn}`; return T.cells[k] || (T.cells[k] = []); };
  const halfStats = {}; // side|inn -> { lob }
  const closeHalf = () => { if (!half) return; if (lastCell) lastCell.end = true; halfStats[`${half.side}|${half.inn}`] = { lob: runners.length }; };
  const lastSlotPid = {}; // side|slot -> pid of last batter there
  const findRunner = (name) => { const n = fold(name); const c = runners.filter((r) => { const p = people[r.pid] || {}; return fold(p.name) === n || fold(p.name).endsWith(' ' + n) || fold(p.short).endsWith(' ' + n) || (n && fold(p.name).split(' ').slice(-1)[0] === n.split(' ').slice(-1)[0] && n.split(' ').length === 1); }); return c.length === 1 ? c[0] : (c.length > 1 ? c[c.length - 1] : null); };
  const reach = (cell, b) => { for (let i = (cell.path.length ? Math.max(...cell.path) : 0) + 1; i <= Math.min(b, 4); i++) cell.path.push(i); if (b >= 4) cell.scored = true; };
  for (const p of results) {
    const inn = p.period.number; const side = p.period.type === 'Top' ? 'away' : 'home';
    if (!half || half.inn !== inn || half.side !== side) { closeHalf(); half = { inn, side }; runners = []; outs = 0; lastCell = null; }
    if (inn > out.innings) out.innings = inn;
    const raw = String(p.text || ''); const text = cleanText(raw);
    const parts = p.participants || []; const bat = parts.find((x) => x.type === 'batter'); const bid = bat && String(bat.athlete.id);
    const sm = text.match(SUB);
    if (sm && !bid) {
      const how = /hit for/i.test(sm[2]) ? 'PH' : /ran for/i.test(sm[2]) ? 'PR' : /relieved/i.test(sm[2]) ? 'P' : 'DEF';
      if (how === 'PH' || how === 'PR' || how === 'DEF') {
        const who = byName(side === 'away' && how === 'DEF' ? 'home' : side, sm[1]) || byName(side, sm[1]) || byName(side === 'away' ? 'home' : 'away', sm[1]);
        if (who && !who.enter) who.enter = { inn, how };
        if (how === 'PR' && who) { const m2 = text.match(/ran for (.+)$/i); const r = m2 && findRunner(m2[1]); if (r) { r.pid = who.id; r.cell.pr = who.id; } }
      }
      continue;
    }
    let cell = null; let br = null; const cs = clauses(text);
    let runnerCls = cs;
    if (bid && p.batOrder !== undefined) {
      const slot = slotOf(bid) || p.batOrder;
      // the batter's own clause is usually first, but ESPN sometimes leads with a runner ("Pratt scored on error, Hamilton safe at first ...")
      const bp = people[bid]; const ln = bp ? fold(bp.name).split(' ').slice(-1)[0] : '';
      let bi = 0; if (ln && cs.length > 1 && !fold(cs[0]).includes(ln)) { const j = cs.findIndex((c) => fold(c).split(' ').slice(0, 4).includes(ln) || fold(c).startsWith(fold(bp.name))); if (j > 0) bi = j; }
      br = batterResult(cs[bi] || '');
      const key = `${side}|${slot}`; const prev = lastSlotPid[key]; lastSlotPid[key] = bid;
      cell = { pid: bid, slot, inn, text: br.text, kind: br.kind, looking: !!br.looking, path: [], scored: false, out: null, outAt: null, rbi: 0, notes: [], end: false, sub: !!(prev && prev !== bid) || !!(people[bid] && people[bid].starter === false && !prev), playId: String(p.id) };
      if (!people[bid]) { cell.text = '?'; cell.kind = 'unk'; }
      cellsOf(side, slot, inn).push(cell); lastCell = cell; runnerCls = cs.filter((_, i) => i !== bi);
      if (br.kind === 'out') { cell.out = ++outs; if (br.gdp) { /* runner out is usually the first out of a GDP: renumber below */ } }
      if (br.base) reach(cell, br.base);
      if (br.base === 4) { cell.rbi += 1; }
      if (br.base && br.base < 4) runners.push({ pid: bid, cell });
    }
    let unread = false; let gdpRunnerOut = false;
    for (const c of runnerCls) {
      const rc = runnerClause(c); if (!rc) { unread = true; continue; }
      const r = findRunner(rc.name);
      if (!r) { unread = true; continue; }
      if (rc.out) {
        r.cell.out = ++outs; r.cell.outAt = rc.stay ? (r.cell.path.length ? Math.max(...r.cell.path) : 0) + 1 : rc.base; if (rc.note) r.cell.notes.push({ base: rc.base, how: rc.note });
        runners = runners.filter((x) => x !== r); if (br && br.gdp) gdpRunnerOut = true; continue;
      }
      reach(r.cell, rc.base); if (rc.note) r.cell.notes.push({ base: rc.base, how: rc.note });
      if (rc.base >= 4) { runners = runners.filter((x) => x !== r); if (cell && r.cell !== cell && !rc.noRbi && !(br && br.dp) && !/error/i.test(c)) cell.rbi += 1; }
    }
    if (br && br.gdp && gdpRunnerOut && cell.out != null) { const o = cell.out; const ro = Object.values(out.teams[side].cells).flat().find((x) => x !== cell && x.out === o + 1 && x.inn === inn); if (ro) { ro.out = o; cell.out = o + 1; } }
    if (unread && cell) cell.unread = true;
    // reconcile base positions with ESPN's own on-base participants (authoritative after the play)
    const on = { onFirst: 1, onSecond: 2, onThird: 3 }; const occ = parts.filter((x) => on[x.type]);
    if (occ.length || bid) {
      for (const o of occ) { const id = String(o.athlete.id); const r = runners.find((x) => x.pid === id); if (r) { if (!r.cell.path.length || Math.max(...r.cell.path) < on[o.type]) reach(r.cell, on[o.type]); } }
      const ids = new Set(occ.map((o) => String(o.athlete.id)));
      // runners ESPN no longer shows on base and the text did not account for: remove (no path invented)
      if (bid) runners = runners.filter((r) => ids.has(r.pid));
    }
    if (bid && typeof p.outs === 'number' && p.outs > outs && p.outs <= 3) outs = p.outs; // ESPN's outs on runner-only plays can run ahead: trust only at-bat results
  }
  closeHalf();
  // per-inning footer: R/H from ESPN linescores (official), E = errors by the fielding (other) team in that half, LOB from the sheet
  for (const side of ['away', 'home']) {
    const T = out.teams[side]; const O = out.teams[side === 'away' ? 'home' : 'away']; if (!T) continue;
    const n = Math.max(out.innings, T.linescores.length);
    for (let i = 1; i <= n; i++) { const l = T.linescores[i - 1] || {}; const ol = (O && O.linescores[i - 1]) || {}; const hs = halfStats[`${side}|${i}`]; T.innings.push({ inn: i, R: l.r != null ? l.r : null, H: l.h != null ? l.h : null, E: ol.e != null ? ol.e : null, LOB: hs ? hs.lob : null }); }
    if (n > out.innings) out.innings = n;
  }
  // current batter (live): the newest "Start Batter/Pitcher" that has no play-result for that at-bat yet
  if (state === 'in') {
    let lastStart = null; for (const p of plays) if (p.type.type === 'start-batterpitcher') lastStart = p;
    if (lastStart) {
      const done = plays.some((p) => p.atBatId === lastStart.atBatId && (p.type.type === 'play-result' || p.type.type === 'end-batterpitcher') && (p.participants || []).some((x) => x.type === 'batter'));
      const b = (lastStart.participants || []).find((x) => x.type === 'batter');
      if (!done && b) { const pid = String(b.athlete.id); const side = lastStart.period.type === 'Top' ? 'away' : 'home'; out.current = { side, slot: slotOf(pid) || lastStart.batOrder || null, inn: lastStart.period.number, pid }; }
    }
  }
  out.people = people;
  return out;
}

module.exports = { build, batterResult, runnerClause, cleanText, clauses, fold };
