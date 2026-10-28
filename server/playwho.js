'use strict';
/**
 * playwho.js — turns ESPN / NCAA.com play records into "what happened + who was involved".
 *
 * Pure functions, no network. For every play we return:
 *   what : short label            ("Pass complete", "Strikeout", "Made 3-pointer", "Goal")
 *   desc : one readable sentence  ("Dak Prescott pass complete to CeeDee Lamb for 12 yards, tackled by …")
 *   who  : [{ role, name, team, jersey, pos, headshot, id }]   people involved, with their role
 *
 * Rules: never invent a player. A name is only shown if it is in the play text or in ESPN's own
 * participant list. A football name is only upgraded from "D.Prescott" to "Dak Prescott" when exactly one
 * player on that team's roster matches. If nothing can be worked out, desc falls back to ESPN's raw text.
 */

const fold = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const SUFFIX = /\b(jr|sr|ii|iii|iv|v)\b\.?/g;
const lastKey = (s) => fold(s).replace(SUFFIX, '').replace(/[^a-z]/g, '');
const oneLine = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const num = (v) => (v == null || v === '' || isNaN(+v) ? null : +v);
const plural = (n, w) => `${n} ${w}${Math.abs(n) === 1 ? '' : 's'}`;
const list = (a) => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);

/* ---------------------------------------------------------------- roster */
function buildRoster(d, sport) {
  const byId = new Map(); const abbrOf = new Map();
  const add = (a, teamId, extra) => {
    if (!a || a.id == null) return;
    const id = String(a.id); const prev = byId.get(id) || {};
    const name = oneLine(a.displayName || a.fullName || prev.name).replace(/\s+-\s+(?:P|C|1B|2B|3B|SS|LF|CF|RF|OF|IF|DH|PH|PR|RHP|LHP|UT|INF)\s+/, ' '); if (!name || name === 'undefined') return;
    const parts = name.split(' ');
    const e = {
      id: `${sport}:a${id}`, rid: id, name,
      first: a.firstName || prev.first || parts[0],
      last: a.lastName || prev.last || parts.slice(1).join(' '),
      jersey: (extra && extra.jersey != null ? extra.jersey : a.jersey != null ? a.jersey : prev.jersey) ?? null,
      pos: (a.position && a.position.abbreviation) || (extra && extra.pos) || prev.pos || null,
      headshot: (a.headshot && (a.headshot.href || a.headshot)) || prev.headshot || null,
      teamId: teamId != null ? String(teamId) : prev.teamId || null,
    };
    if (typeof e.headshot !== 'string') e.headshot = null;
    byId.set(id, e);
  };
  try {
    for (const t of (d.boxscore && d.boxscore.players) || []) {
      if (t.team) abbrOf.set(String(t.team.id), t.team.abbreviation);
      for (const g of t.statistics || []) for (const x of g.athletes || []) add(x.athlete, t.team && t.team.id);
    }
    for (const r of d.rosters || []) {
      if (r.team) abbrOf.set(String(r.team.id), r.team.abbreviation || r.team.displayName);
      for (const x of r.roster || []) add(x.athlete, r.team && r.team.id, { jersey: x.jersey, pos: x.position && x.position.abbreviation });
    }
    for (const t of d.leaders || []) for (const c of t.leaders || []) for (const l of c.leaders || []) add(l.athlete, t.team && t.team.id);
    const hc = (d.header && d.header.competitions && d.header.competitions[0] && d.header.competitions[0].competitors) || [];
    for (const c of hc) if (c.team) abbrOf.set(String(c.team.id), c.team.abbreviation);
  } catch (e) { /* roster is best-effort */ }
  return { sport, byId, abbrOf, byTeam(teamId) { return [...byId.values()].filter((x) => x.teamId === String(teamId)); } };
}

const person = (e, role, abbrOf) => ({
  role, name: e.name, id: e.id,
  team: e.teamId ? (abbrOf.get(e.teamId) || null) : null,
  jersey: e.jersey || null, pos: e.pos || null, headshot: e.headshot || null,
});

const teamByAbbr = (roster, abbr) => { if (!abbr) return null; for (const [id, a] of roster.abbrOf) if (a === abbr) return id; return null; };

/** Resolve a football token ({num, init, last}) to ONE roster player, else null. */
function resolveToken(roster, tok, teamId) {
  const pool = teamId != null ? roster.byTeam(teamId) : [...roster.byId.values()];
  if (!pool.length) return null;
  const k = lastKey(tok.last);
  let hits = pool.filter((p) => lastKey(p.last) === k || lastKey(p.name).endsWith(k));
  if (tok.init) hits = hits.filter((p) => fold(p.first)[0] === fold(tok.init)[0]);
  if (hits.length > 1 && tok.num != null) hits = hits.filter((p) => String(p.jersey) === String(tok.num));
  if (!hits.length && tok.num != null) {
    hits = pool.filter((p) => String(p.jersey) === String(tok.num) && lastKey(p.last) === k);
  }
  return hits.length === 1 ? hits[0] : null;
}

/* ---------------------------------------------------------------- football */
const INIT = '(?:[A-Z][a-z]?\\.){1,3}';
const SUR = "(?:St\\.\\s)?[A-Z][A-Za-z'’\\-]+(?:\\s(?:Jr\\.|Sr\\.|II|III|IV|V)(?![A-Za-z]))?";
const NAME = `(?:#\\d{1,2}\\s+)?${INIT}\\s?${SUR}`;
const reName = new RegExp(`^${NAME}$`);

function tokOf(s) {
  const m = String(s).match(/^(?:#(\d{1,2})\s+)?((?:[A-Z][a-z]?\.){1,3})\s?(.+)$/);
  if (!m) return null;
  return { num: m[1] != null ? +m[1] : null, init: m[2], last: m[3].trim(), raw: s };
}
const prettyTok = (t) => `${t.init.replace(/\.(?=[A-Z])/g, '. ').replace(/\.$/, '.')} ${t.last}`.replace(/\.\s*(?=[A-Z][a-z]?\.)/g, '. ').replace(/\s+/g, ' ').trim();

/** NCAA.com football names look like "Glenn,Brock" / "Stafford Jr.,Jonathan" — convert to "Brock Glenn". */
function ncaaFootballNames(t) {
  return t.replace(/\b([A-Z][A-Za-z'’\-]+(?:\s(?:Jr\.|Sr\.|II|III|IV))?),([A-Z][a-z][A-Za-z'’\-]*)/g, (m, l, f) => `${f} ${l}`);
}

function fbClean(text) {
  let t = oneLine(text);
  t = t.replace(/^.*?reported in as eligible\.\s*/i, '');
  t = t.replace(/^\(\d{1,2}:\d{2}\)\s*/, '');
  t = t.replace(/^\((?:[A-Za-z]+(?:[ ,\-]+[A-Za-z]+)*)\)\s*/, '');
  t = t.replace(/^(?:No Huddle(?:-Shotgun)?|Shotgun|Pistol|Wildcat|Direct Snap)\s+/i, '');
  return t;
}
function parenNames(t) {
  const all = [...t.matchAll(/\(([^()]*)\)/g)];
  for (let i = all.length - 1; i >= 0; i--) {
    const parts = all[i][1].split(/\s*[;,]\s*/).filter(Boolean);
    if (parts.length && parts.every((p) => reName.test(p.trim()))) return parts.map((p) => p.trim());
  }
  return [];
}
const grab = (t, re) => { const m = t.match(re); return m ? m[1].trim() : null; };
const yardsOf = (t, stat) => {
  const s = num(stat); if (s != null) return s;
  const m = t.match(/\bfor (?:a )?(?:loss of |no gain|(-?\d+) yards?)/i);
  if (/for no gain/i.test(t)) return 0;
  if (m && /loss of/i.test(m[0])) { const n = t.match(/loss of (\d+)/i); return n ? -+n[1] : null; }
  return m && m[1] != null ? +m[1] : null;
};
const yardPhrase = (y) => (y == null ? '' : y === 0 ? ' for no gain' : y < 0 ? ` for a loss of ${plural(-y, 'yard')}` : ` for ${plural(y, 'yard')}`);

/** Parse football text into a neutral structure; roles hold raw tokens only. */
function fbParse(text, typeText, stat) {
  const t = fbClean(text); const ty = fold(typeText);
  const out = { kind: 'other', roles: [], t, yards: yardsOf(t, stat), td: /touchdown/i.test(t) };
  const R = (role, s, side) => { if (s && reName.test(s)) out.roles.push({ role, s, side }); };
  const tk = parenNames(/^PENALTY/i.test(t) ? t : t.replace(/\s*PENALTY\b.*$/i, ''));

  if (/^PENALTY/i.test(t)) {
    out.kind = 'penalty';
    const a = t.match(/^PENALTY (?:on )?([A-Z]{2,5})-(.+?)(?:,|$)/);
    if (a) { out.team = a[1]; out.foul = (t.match(/^PENALTY[^,]*,\s*([^,]+),/) || [])[1] || null; R('Penalty on', a[2].trim(), 'pen'); }
    else {
      const b = t.match(/^PENALTY ([A-Z]{2,5}) (.+?)(?:\s\(|\s\d+ yards?|\.|$)/);
      if (b) { out.team = b[1]; out.foul = b[2].trim(); }
      if (tk[0]) R('Penalty on', tk[0], 'pen');
    }
    if (!out.team) { const c = t.match(/PENALTY (?:on )?([A-Z]{2,5}),\s*([^,]+?)(?:,|\.|$)/); if (c) { out.team = c[1]; out.foul = out.foul || c[2].trim(); } }
    out.pen = num((t.match(/(\d+) yards?/) || [])[1]);
    out.noPlay = /no play/i.test(t);
    return out;
  }
  if (/\bsacked\b/i.test(t) || /sack/.test(ty)) {
    out.kind = 'sack'; R('Quarterback', grab(t, new RegExp(`^(${NAME})\\s+sacked`)), 'off');
    tk.forEach((s) => R('Sacked by', s, 'def')); out.yards = yardsOf(t, stat); return out;
  }
  if (/\bINTERCEPTED\b/i.test(t) || /interception/.test(ty)) {
    out.kind = 'int'; R('Passer', grab(t, new RegExp(`^(${NAME})\\s+pass`)), 'off');
    R('Intended for', grab(t, new RegExp(`intended for (${NAME})`, 'i')), 'off');
    R('Interception', grab(t, new RegExp(`INTERCEPTED by (${NAME})`, 'i')), 'def');
    tk.forEach((s) => R('Tackled by', s, 'off')); return out;
  }
  if (/\bpass\b/i.test(t) && !/^\S*\s*(?:kicks|punts)/i.test(t)) {
    out.kind = /incomplete/i.test(t) ? 'inc' : 'pass';
    R('Passer', grab(t, new RegExp(`^(${NAME})\\s+pass`)), 'off');
    R('Target', grab(t, new RegExp(`(?:\\bto|intended for)\\s+(${NAME})`)), 'off');
    R('Pass defended', grab(t, new RegExp(`(?:broken up|defended) by (${NAME})`, 'i')), 'def');
    if (out.kind === 'pass') tk.forEach((s) => R('Tackled by', s, 'def'));
    return out;
  }
  if (/kickoff|kicks? \d+ yards? from|onside/i.test(t) || /kickoff/.test(ty)) {
    out.kind = 'kickoff'; R('Kicker', grab(t, new RegExp(`^(${NAME})\\s+(?:kicks?|kickoff|onside)`, 'i')), 'off');
    R('Returner', grab(t, new RegExp(`(?:fair catch by|returned? by|\\.\\s+)(${NAME})(?:\\s+(?:to|return|returns|at)\\b)`)) || grab(t, new RegExp(`(?:fair catch by|downed by|returned by)\\s+(?:[A-Z]{2,5}\\s)?(${NAME})`)), 'def');
    tk.forEach((s) => R('Tackled by', s, 'off')); out.fair = /fair catch/i.test(t); out.touchback = /touchback/i.test(t); return out;
  }
  if (/\bpunts?\b/i.test(t) || /punt/.test(ty)) {
    out.kind = 'punt'; R('Punter', grab(t, new RegExp(`^(${NAME})\\s+punts?`, 'i')), 'off');
    R('Returner', grab(t, new RegExp(`(?:fair catch by|returned by)\\s+(${NAME})`, 'i')) || grab(t, new RegExp(`\\.\\s+(${NAME})\\s+(?:to|return)\\b`)), 'def');
    tk.forEach((s) => R('Tackled by', s, 'off')); out.fair = /fair catch/i.test(t); out.touchback = /touchback/i.test(t);
    out.dist = num((t.match(/punts? (\d+) yards?/i) || [])[1]); return out;
  }
  if (/field goal/i.test(t) || /field goal/.test(ty)) {
    out.kind = 'fg'; R('Kicker', grab(t, new RegExp(`^(${NAME})\\s+(?:\\d+ (?:yd|yard)|field goal)`, 'i')), 'off');
    out.good = /\bGOOD\b/.test(t) && !/NO GOOD/i.test(t); out.dist = num((t.match(/(\d+) (?:yd|yard)/i) || [])[1]);
    out.blocked = /blocked/i.test(t); return out;
  }
  if (/kneel/i.test(t)) { out.kind = 'kneel'; R('Quarterback', grab(t, new RegExp(`^(${NAME})\\s+kneel`, 'i')), 'off'); return out; }
  if (/(?:rush|run|scramble|left (?:end|tackle|guard)|right (?:end|tackle|guard)|up the middle|middle)\b/i.test(t) && reName.test((t.match(new RegExp(`^(${NAME})`)) || [])[1] || '')) {
    out.kind = 'rush'; R('Rusher', grab(t, new RegExp(`^(${NAME})`)), 'off');
    tk.forEach((s) => R('Tackled by', s, 'def')); return out;
  }
  const lead = grab(t, new RegExp(`^(${NAME})\\s`));
  if (lead && /(?:extra point|kick attempt|two[- ]point|2-pt)/i.test(t)) { out.kind = 'try'; R('Kicker', lead, 'off'); out.good = /\bGOOD\b|is good|attempt good|successful/i.test(t) && !/no good|failed|missed/i.test(t); return out; }
  out.kind = 'other'; return out;
}

function fbExplain(p, ctx) {
  const raw = oneLine(p.text);
  if (!raw) return { what: (p.type && p.type.text) || null, desc: '', who: [] };
  const typeText = p.type && typeof p.type === 'object' ? p.type.text : p.type;
  const P = fbParse(raw, typeText, p.statYardage);
  const { roster } = ctx; const who = []; const seen = new Set();
  const tp = p.teamParticipants || [];
  const tpId = (k) => { const x = tp.find((y) => y.type === k); return x && x.id != null ? String(x.id) : null; };
  const offId = tpId('offense') || (p.team && p.team.id != null ? String(p.team.id) : null);
  const defId = tpId('defense') || (offId && ctx.teamIds ? (ctx.teamIds.find((x) => String(x) !== offId) ?? null) : null);
  const abbrOf = roster.abbrOf;
  const disp = {};
  const teamFor = (side) => (side === 'off' ? offId : side === 'def' ? defId : side === 'pen' ? teamByAbbr(roster, P.team) : null);
  P.roles.forEach((r, i) => {
    const tok = tokOf(r.s); if (!tok) return;
    const tid = teamFor(r.side);
    let e = resolveToken(roster, tok, tid) || resolveToken(roster, tok, null);
    const name = e ? e.name : prettyTok(tok);
    disp[i] = name;
    const key = `${r.role}|${name}`; if (seen.has(key)) return; seen.add(key);
    if (e) who.push(person(e, r.role, abbrOf));
    else who.push({ role: r.role, name, id: null, team: tid != null ? abbrOf.get(tid) || null : null, jersey: tok.num != null ? String(tok.num) : null, pos: null, headshot: null });
  });
  const by = (role) => { const a = P.roles.map((r, i) => (r.role === role ? disp[i] : null)).filter(Boolean); return a; };
  const one = (role) => by(role)[0] || null;
  const tk = by('Tackled by');
  const tkS = tk.length ? `, tackled by ${list(tk)}` : '';
  const y = P.yards; const tdS = P.td ? ' — TOUCHDOWN' : '';
  let what = typeText || 'Play'; let desc = null;
  switch (P.kind) {
    case 'pass': {
      const a = one('Passer'); const b = one('Target');
      what = P.td ? 'Touchdown pass' : 'Pass complete';
      if (a && b) desc = `${a} pass complete to ${b}${yardPhrase(y)}${tkS}${tdS}`;
      break;
    }
    case 'inc': {
      const a = one('Passer'); const b = one('Target'); const dfn = one('Pass defended');
      what = 'Incomplete pass';
      if (a) desc = `${a} pass incomplete${b ? ` intended for ${b}` : ''}${dfn ? `, broken up by ${dfn}` : ''}`;
      break;
    }
    case 'int': {
      const a = one('Passer'); const i = one('Interception'); const b = one('Intended for');
      what = 'Interception';
      if (a && i) desc = `${a} pass intercepted by ${i}${b ? ` (intended for ${b})` : ''}${tkS}${tdS}`;
      break;
    }
    case 'sack': {
      const a = one('Quarterback'); const s = by('Sacked by');
      what = 'Sack';
      if (a) desc = `${a} sacked${s.length ? ` by ${list(s)}` : ''}${y != null ? ` for a loss of ${plural(Math.abs(y), 'yard')}` : ''}`;
      break;
    }
    case 'rush': {
      const a = one('Rusher'); what = P.td ? 'Touchdown run' : 'Rush';
      if (a) desc = `${a} rush${yardPhrase(y)}${tkS}${tdS}`;
      break;
    }
    case 'kneel': { const a = one('Quarterback'); what = 'Kneel down'; if (a) desc = `${a} kneels`; break; }
    case 'kickoff': {
      const k = one('Kicker'); const r = one('Returner'); what = 'Kickoff';
      if (k) desc = `${k} kickoff${P.touchback ? ', touchback' : ''}${r ? (P.fair ? `, fair catch by ${r}` : `, returned by ${r}${yardPhrase(y)}`) : ''}${tkS}`;
      break;
    }
    case 'punt': {
      const k = one('Punter'); const r = one('Returner'); what = 'Punt';
      if (k) desc = `${k} punts${P.dist ? ` ${plural(P.dist, 'yard')}` : ''}${P.touchback ? ', touchback' : ''}${r ? (P.fair ? `, fair catch by ${r}` : `, returned by ${r}${yardPhrase(y)}`) : ''}${tkS}`;
      break;
    }
    case 'fg': {
      const k = one('Kicker'); what = P.good ? 'Field goal good' : P.blocked ? 'Field goal blocked' : 'Field goal missed';
      if (k) desc = `${k} ${P.dist ? `${P.dist}-yard ` : ''}field goal ${P.good ? 'is good' : P.blocked ? 'was blocked' : 'is no good'}`;
      break;
    }
    case 'try': { const k = one('Kicker'); what = 'Extra point'; if (k) desc = `${k} extra point ${P.good ? 'is good' : 'is no good'}`; break; }
    case 'penalty': {
      what = 'Penalty'; const a = one('Penalty on');
      desc = `Penalty on ${a ? `${a}${P.team ? ` (${P.team})` : ''}` : P.team || 'the offense/defense'}${P.foul ? `: ${P.foul}` : ''}${P.pen ? `, ${plural(P.pen, 'yard')}` : ''}${P.noPlay ? ' — no play' : ''}`;
      break;
    }
    default: what = typeText || 'Play';
  }
  // extra point on a touchdown line, and a penalty flagged inside another play
  const xp = P.td ? grab(raw, new RegExp(`(${NAME})\\s+(?:extra point|kick attempt)\\s+(?:is\\s+)?(?:good|no good|failed)`, 'i')) : null;
  if (xp && P.kind !== 'try') {
    const m2 = raw.match(new RegExp(`(${NAME})\\s+(?:extra point|kick attempt)\\s+(?:is\\s+)?(good|no good|failed)`, 'i')); const tok = tokOf(m2[1]);
    const e = tok && resolveToken(roster, tok, offId);
    const nmx = e ? e.name : (tok ? prettyTok(tok) : xp);
    if (tok) who.push(e ? person(e, 'Extra point', abbrOf) : { role: 'Extra point', name: nmx, id: null, team: null, jersey: null, pos: null, headshot: null });
    if (desc) desc += `; ${nmx} extra point ${/^good$/i.test(m2[2]) ? 'is good' : 'is no good'}`;
  }
  const dn = grab(raw, new RegExp(`downed by\\s+(?:[A-Z]{2,5}-)?(${NAME})`));
  if (dn && P.kind === 'punt') { const tok = tokOf(dn); const e = tok && resolveToken(roster, tok, null); const nmd = e ? e.name : prettyTok(tok); who.push(e ? person(e, 'Downed by', abbrOf) : { role: 'Downed by', name: nmd, id: null, team: null, jersey: null, pos: null, headshot: null }); if (desc) desc += `, downed by ${nmd}`; }
  if (P.kind !== 'penalty') {
    const pm = raw.match(new RegExp(`PENALTY on ([A-Z]{2,5})-(${NAME}),\\s*([^,]+),\\s*(\\d+) yards?`))
      || raw.match(new RegExp(`PENALTY ([A-Z]{2,5}) ([^()]+?)\\s*\\((${NAME})\\)\\s*(\\d+) yards?`));
    if (pm) {
      const cfbForm = !/^PENALTY on/.test(raw.slice(raw.indexOf('PENALTY')));
      const nameS = cfbForm ? pm[3] : pm[2]; const foul = cfbForm ? pm[2] : pm[3];
      const tok = tokOf(nameS); const e = tok && resolveToken(roster, tok, teamByAbbr(roster, pm[1])); const nmp = e ? e.name : (tok ? prettyTok(tok) : nameS);
      who.push(e ? person(e, 'Penalty on', abbrOf) : { role: 'Penalty on', name: nmp, id: null, team: pm[1], jersey: null, pos: null, headshot: null });
      if (desc) desc += `; penalty on ${nmp} (${pm[1]}), ${foul.trim()}, ${plural(+pm[4], 'yard')}`;
    }
  }
  const hu = grab(raw, new RegExp(`hurried by (${NAME})`, 'i'));
  if (hu) { const tok = tokOf(hu); const e = tok && resolveToken(roster, tok, defId); const nmh = e ? e.name : prettyTok(tok); who.push(e ? person(e, 'QB hurried by', abbrOf) : { role: 'QB hurried by', name: nmh, id: null, team: null, jersey: null, pos: null, headshot: null }); if (desc && /pass/i.test(P.kind)) desc += `, QB hurried by ${nmh}`; }
  // fumble extras
  if (/fumble/i.test(raw)) {
    const f = [['Fumbled by', 'fumbled by'], ['Forced by', 'forced by'], ['Recovered by', 'recovered by']];
    for (const [role, kw] of f) {
      const s = grab(raw, new RegExp(`${kw}\\s+(?:[A-Z]{2,5}\\s)?(${NAME})`, 'i'));
      const tok = s && tokOf(s); if (!tok) continue;
      const e = resolveToken(roster, tok, role === 'Recovered by' ? null : (role === 'Forced by' ? defId : offId));
      who.push(e ? person(e, role, abbrOf) : { role, name: prettyTok(tok), id: null, team: null, jersey: tok.num != null ? String(tok.num) : null, pos: null, headshot: null });
    }
    if (desc && !/fumble/i.test(desc)) { desc += '; FUMBLE'; what = `${what} · fumble`; }
  }
  if (!desc) desc = raw;
  return { what, desc: oneLine(desc), who };
}

/* ---------------------------------------------------------------- baseball */
const BASES = { onFirst: 'Runner on 1st', onSecond: 'Runner on 2nd', onThird: 'Runner on 3rd' };
function baseWhat(p) {
  const tx = oneLine(p.text); const alt = p.alternativeType && p.alternativeType.text; const ty = (p.type && p.type.text) || '';
  if (/^(Top|Bottom|Middle|End) of the/i.test(tx)) return tx.replace(/ inning.*/i, ' inning');
  if (/struck out/i.test(tx)) return 'Strikeout';
  if (/walked|ball four|intentionally/i.test(tx)) return 'Walk';
  if (/hit by pitch/i.test(tx)) return 'Hit by pitch';
  if (/grounded into (?:a )?double play|double play/i.test(tx)) return 'Double play';
  if (/homered|home run/i.test(tx)) return 'Home run';
  if (/stole|steals/i.test(tx)) return 'Stolen base';
  if (/caught stealing|picked off/i.test(tx)) return 'Caught stealing / pickoff';
  if (/wild pitch/i.test(tx)) return 'Wild pitch';
  if (/passed ball/i.test(tx)) return 'Passed ball';
  if (/balk/i.test(tx)) return 'Balk';
  if (/Pitch \d+ :/i.test(tx)) return /Ball In Play/i.test(tx) ? 'Ball in play' : oneLine(tx.replace(/^Pitch \d+ : /i, '')).replace(/^\w/, (c) => c.toUpperCase());
  if (/pitches to/i.test(tx)) return 'At-bat starts';
  if (/singled|reached on .* single/i.test(tx)) return 'Single';
  if (/doubled/i.test(tx)) return 'Double';
  if (/tripled/i.test(tx)) return 'Triple';
  if (/fielder'?s choice/i.test(tx)) return "Fielder's choice";
  if (/relieved|replaces? .* (?:pitching|at pitcher)/i.test(tx)) return 'Pitching change';
  if (/reached on (?:a )?(?:fielding )?error|safe at first on error|error/i.test(tx)) return 'Reached on error';
  if (/sacrifice/i.test(tx)) return 'Sacrifice';
  if (/flied out|lined out|grounded out|popped out|fouled out|bunted out|out at/i.test(tx)) return alt && !/Strike|Ball$/i.test(alt) ? alt : 'Out';
  if (/pinch|replaces|to (?:left|center|right) field|to (?:first|second|third|shortstop|pitcher|catcher)|enters|batting|substitut/i.test(tx) && /substitution|pinch|replac/i.test(`${ty} ${tx}`)) return 'Substitution';
  return alt || ty || 'Play';
}
function baseExplain(p, ctx) {
  const { roster } = ctx; const who = [];
  const tx = oneLine(p.text);
  const bp = (p.participants || []).find((y) => y.type === 'batter'); const batId = bp ? String(bp.athlete && bp.athlete.id) : '';
  for (const x of p.participants || []) {
    const role = x.type === 'pitcher' ? 'Pitcher' : x.type === 'batter' ? 'Batter' : BASES[x.type];
    if (!role) continue;
    const e = roster.byId.get(String(x.athlete && x.athlete.id != null ? x.athlete.id : x.athlete));
    if (BASES[x.type] && String(x.athlete && x.athlete.id) === batId) continue;
    if (BASES[x.type] && !/^Pitch \d+ :/.test(tx)) { // runner lists on result lines are the bases AFTER the play: keep only runners named in the text
      const nm = e ? e.name : (x.athlete && x.athlete.displayName) || ''; const lk = lastKey(nm.split(' ').slice(1).join(' ') || nm);
      const isBat = (p.participants || []).some((y) => y.type === 'batter' && String(y.athlete && y.athlete.id) === String(x.athlete && x.athlete.id) && !/stole|picked|caught|wild pitch|passed ball|balk/i.test(tx));
      if (isBat || !lk || !fold(tx).replace(/[^a-z ]/g, '').includes(fold(nm.split(' ').slice(1).join(' ') || nm).replace(SUFFIX, '').replace(/[^a-z ]/g, '').trim())) continue;
    }
    const a = x.athlete && typeof x.athlete === 'object' ? x.athlete : null;
    if (e) who.push(person(e, role, roster.abbrOf));
    else if (a && (a.displayName || a.fullName)) who.push({ role, name: a.displayName || a.fullName, id: a.id != null ? `${ctx.sport}:a${a.id}` : null, team: null, jersey: a.jersey || null, pos: null, headshot: (a.headshot && a.headshot.href) || null });
  }
  let desc = tx; const what = baseWhat(p);
  if (/^Pitch \d+ :/.test(tx)) {
    const pt = p.pitchType && p.pitchType.text; const mph = num(p.pitchVelocity);
    desc = `${tx.replace(/^Pitch (\d+) : /, 'Pitch $1: ')}${pt ? ` — ${pt}${mph ? ` ${Math.round(mph)} mph` : ''}` : mph ? ` — ${Math.round(mph)} mph` : ''}`;
    const pit = who.find((w) => w.role === 'Pitcher'); const bat = who.find((w) => w.role === 'Batter');
    if (pit && bat) desc += ` (${pit.name} to ${bat.name})`;
  } else if (/^(Top|Bottom|Middle|End) of/i.test(tx)) desc = tx;
  else if (p.type && /end-batterpitcher/.test(p.type.type || '') && !tx) desc = '';
  else if (/pitches to/.test(tx)) desc = tx;
  else {
    const bat = who.find((w) => w.role === 'Batter'); const pit = who.find((w) => w.role === 'Pitcher');
    // ESPN result lines use surnames only; add full names when we have them
    if (bat && pit && !/Pitcher|pitched by/i.test(tx) && p.type && /play-result|^[a-z-]+$/.test(p.type.type || '') && /\b(?:out|struck|walked|singled|doubled|tripled|homered|reached|grounded|flied|lined|popped|hit by)\b/i.test(tx)) desc = `${tx} (${bat.name} batting against ${pit.name})`;
  }
  return { what, desc: oneLine(desc), who };
}

/* ---------------------------------------------------------------- shared text-position helper */
function posRoles(text, people, rules, fallbackRoles) {
  const ft = fold(text); const out = [];
  people.forEach((e, i) => {
    const nm = fold(e.name); let idx = ft.indexOf(nm);
    if (idx < 0) { const l = fold(e.last || e.name.split(' ').slice(-1)[0]); idx = l ? ft.indexOf(l) : -1; }
    let role = null;
    if (idx >= 0) {
      const before = ft.slice(Math.max(0, idx - 24), idx); const after = ft.slice(idx + nm.length, idx + nm.length + 28);
      for (const [rb, ra, r] of rules) { if ((!rb || rb.test(before)) && (!ra || ra.test(after))) { role = r; break; } }
    }
    out.push({ e, idx, role: role || (fallbackRoles && fallbackRoles[i]) || null });
  });
  return out;
}

/* ---------------------------------------------------------------- basketball */
function hoopsExplain(p, ctx) {
  const { roster } = ctx; const tx = oneLine(p.text); const ty = (p.type && p.type.text) || '';
  const ppl = [];
  for (const x of p.participants || []) { const e = roster.byId.get(String(x.athlete && x.athlete.id)); if (e) ppl.push(e); }
  const RULES = [
    [null, /^\s+(?:makes|made|misses|missed)\b/, 'Shooter'],
    [/\($/, /^\s+assists/, 'Assist'],
    [/\($/, /^\s+steals/, 'Steal'],
    [/\($/, /^\s+blocks/, 'Block'],
    [null, /^\s+blocks/, 'Block'],
    [/blocks\s*$/, null, 'Shot blocked'],
    [/enters the game for\s*$/, null, 'Subbed out'],
    [null, /^\s+enters the game/, 'Subbed in'],
    [null, /^\s+(?:defensive |offensive |team )?rebound/, 'Rebound'],
    [/drawn by\s*$/, null, 'Drawn by'],
    [null, /^\s+(?:personal |shooting |loose ball |offensive |technical |flagrant )?(?:foul|fouled)/, 'Foul on'],
    [null, /^\s+(?:bad pass|lost ball|traveling|turnover|offensive foul|out of bounds|\w+ turnover|shot clock)/, 'Turnover'],
    [/vs\.?\s*$/, null, 'Jump ball'],
    [/\($/, /^\s+gains possession/, 'Gains possession'],
    [null, /^\s+vs/, 'Jump ball'],
    [null, /^\s+(?:free throw|dunk|layup|jumper|jump shot|three point|\d+-foot)/, 'Shooter'],
  ];
  const pr = posRoles(tx, ppl, RULES, ppl.map((_, i) => (i === 0 ? 'Player' : 'Involved')));
  pr.sort((a, b) => (a.idx < 0 ? 1e6 : a.idx) - (b.idx < 0 ? 1e6 : b.idx));
  const who = pr.map((x) => person(x.e, x.role || 'Involved', roster.abbrOf));
  const made = !!p.scoringPlay || /\bmakes\b/i.test(tx); const shot = p.shootingPlay || /\b(?:makes|misses)\b/i.test(tx);
  let what = ty || 'Play';
  if (/\bblocks\b/i.test(tx) && shot) what = 'Blocked shot';
  else if (/free throw/i.test(tx) || /free throw/i.test(ty)) what = `Free throw ${made ? 'made' : 'missed'}`;
  else if (shot) {
    const kind = /dunk/i.test(`${ty} ${tx}`) ? 'dunk' : /layup|lay-up/i.test(`${ty} ${tx}`) ? 'layup' : /three point|3-pt|3pt/i.test(`${ty} ${tx}`) || p.scoreValue === 3 || p.pointsAttempted === 3 ? '3-pointer' : /tip/i.test(`${ty} ${tx}`) ? 'tip-in' : /jump|jumper|pullup|step back|fadeaway|hook/i.test(`${ty} ${tx}`) ? 'jump shot' : '2-pointer';
    what = `${made ? 'Made' : 'Missed'} ${kind}`;
  } else if (/rebound/i.test(`${ty} ${tx}`)) what = /offensive/i.test(`${ty} ${tx}`) ? 'Offensive rebound' : /defensive/i.test(`${ty} ${tx}`) ? 'Defensive rebound' : 'Rebound';
  else if (/enters the game/i.test(tx)) what = 'Substitution';
  else if (/foul/i.test(`${ty} ${tx}`)) what = 'Foul';
  else if (/turnover|steal|bad pass|lost ball|traveling/i.test(`${ty} ${tx}`)) what = 'Turnover';
  else if (/block/i.test(`${ty} ${tx}`)) what = 'Block';
  else if (/jump ?ball/i.test(`${ty} ${tx}`)) what = 'Jump ball';
  else if (/timeout/i.test(`${ty} ${tx}`)) what = 'Timeout';
  return { what, desc: tx, who };
}

/* ---------------------------------------------------------------- hockey */
const HK_ROLE = { scorer: 'Goal', assister: 'Assist', shooter: 'Shot', saver: 'Goalie', 'hit-credited': 'Hit by', hitted: 'Hit on', 'face-off-winner': 'Won faceoff', 'face-off-loser': 'Lost faceoff', giver: 'Giveaway', taker: 'Takeaway', defender: 'Blocked by', blocker: 'Blocked by', goalie: 'Goalie', 'penalty-on': 'Penalty on', 'drew-penalty': 'Drew penalty', 'served-by': 'Served by' };
function hockeyExplain(p, ctx) {
  const { roster } = ctx; const tx = oneLine(p.text); const ty = (p.type && p.type.text) || '';
  const who = [];
  const ps = p.participants || [];
  const untyped = ps.filter((x) => !x.type || x.type === '(none)');
  ps.forEach((x) => {
    const e = roster.byId.get(String(x.athlete && x.athlete.id));
    const a = x.athlete && typeof x.athlete === 'object' ? x.athlete : null;
    let role = HK_ROLE[x.type] || null;
    if (!role) {
      const nm = e ? e.name : a && a.displayName; const idx = nm ? fold(tx).indexOf(fold(nm)) : -1;
      if (/face ?off/i.test(ty)) role = 'Lost faceoff';
      else if (/^(?:missed|shot)/i.test(ty) && !ps.some((y) => y.type === 'saver')) role = 'Goalie';
      else role = /against|called|penalty|holding|hooking|roughing|interference|tripping|slashing|cross|high.stick|boarding|charging|elbowing|delay|misconduct|unsportsmanlike/i.test(ty)
        ? (idx === 0 || (idx >= 0 && untyped[0] === x) ? 'Penalty on' : 'Drew penalty') : 'Involved';
    }
    if (e) who.push(person(e, role, roster.abbrOf));
    else if (a && a.displayName) who.push({ role, name: a.displayName, id: null, team: null, jersey: null, pos: null, headshot: null });
  });
  let what = ty || 'Play';
  const map = { Goal: 'Goal', Shot: 'Shot on goal', Missed: 'Missed shot', Blocked: 'Blocked shot', Hit: 'Hit', Giveaway: 'Giveaway', Takeaway: 'Takeaway', 'Face Off': 'Faceoff' };
  if (map[ty]) what = map[ty];
  if (/Goal/.test(ty) && p.strength && /power|short/i.test(p.strength.text || '')) what = `${p.strength.text} goal`;
  return { what, desc: tx || ty, who };
}

/* ---------------------------------------------------------------- soccer */
function soccerExplain(p, ctx) {
  const { roster } = ctx; const ty = (p.type && p.type.text) || ''; const tt = (p.type && p.type.type) || '';
  const tx = oneLine(p.text || p.shortText || ty);
  const ps = (p.participants || []).map((x) => x.athlete).filter(Boolean);
  const base = fold(`${ty} ${tt}`); let roles;
  if (/own goal/.test(base)) roles = ['Own goal'];
  else if (/goal|penalty.*scored/.test(base)) roles = ['Scorer', 'Assist', 'Assist'];
  else if (/substitution/.test(base)) roles = ['Comes on', 'Goes off'];
  else if (/card/.test(base)) roles = [/red/.test(base) ? 'Sent off' : 'Booked'];
  else if (/shot|attempt|save|header|miss|post|bar/.test(base)) roles = ['Shooter', 'Assist'];
  else if (/foul/.test(base)) roles = ['Foul by', 'Fouled'];
  else if (/offside/.test(base)) roles = ['Offside'];
  else if (/corner|free kick|throw|penalty/.test(base)) roles = ['Taken by'];
  else roles = [];
  const who = ps.map((a, i) => {
    const e = roster.byId.get(String(a.id));
    const role = roles[i] || 'Involved';
    return e ? person(e, role, roster.abbrOf) : { role, name: a.displayName || a.fullName, id: a.id != null ? `${ctx.sport}:a${a.id}` : null, team: null, jersey: a.jersey || null, pos: null, headshot: (a.headshot && a.headshot.href) || null };
  }).filter((w) => w.name);
  return { what: ty || 'Event', desc: tx, who };
}

/* ---------------------------------------------------------------- dispatcher */
/** explainPlay(family, play, ctx) → { what, desc, who } */
function explainPlay(family, p, ctx) {
  try {
    if (family === 'football') return fbExplain(p, ctx);
    if (family === 'baseball') return baseExplain(p, ctx);
    if (family === 'basketball') return hoopsExplain(p, ctx);
    if (family === 'hockey') return hockeyExplain(p, ctx);
    if (family === 'soccer') return soccerExplain(p, ctx);
  } catch (e) { /* fall through */ }
  const tx = oneLine(p && p.text);
  return { what: (p && p.type && p.type.text) || null, desc: tx, who: [] };
}

/* ---------------------------------------------------------------- golf / tennis / events */
const relTxt = (n) => (n == null ? '—' : n === 0 ? 'E' : n > 0 ? `+${n}` : `${n}`);
function holeWord(diff, strokes) {
  if (strokes === 1) return 'Hole-in-one';
  return { '-3': 'Albatross', '-2': 'Eagle', '-1': 'Birdie', '0': 'Par', '1': 'Bogey', '2': 'Double bogey', '3': 'Triple bogey' }[String(diff)] || (diff < -3 ? 'Albatross or better' : `+${diff}`);
}
/**
 * golfStory: a "latest holes" list derived only from hole scores ESPN publishes
 * (card = [{r, holes:[{n,s,rel}]}]; par per hole from the course). No timestamps, so we order by how far
 * through the round each player is and state that honestly.
 */
function golfStory({ players, cards, holes, round }) {
  const par = new Map(); (holes || []).forEach((h) => par.set(h.n, h.par));
  const out = [];
  for (const p of players || []) {
    const card = cards && cards[p.id]; if (!card) continue;
    const rd = (card.find && card.find((r) => r.r === round)) || card[card.length - 1]; if (!rd) continue;
    const played = (rd.holes || []).filter((h) => h.s != null);
    const last = played[played.length - 1]; if (!last) continue;
    const pr = par.get(last.n); const diff = last.rel != null ? last.rel : (pr != null ? last.s - pr : null);
    out.push({
      id: p.id, name: p.name, pos: p.pos, total: p.score, thru: played.length, hole: last.n, strokes: last.s, par: pr, diff,
      what: diff == null ? 'Hole played' : holeWord(diff, last.s),
      desc: `${p.name} ${diff == null ? `scored ${last.s}` : `made ${/^[AEI]/i.test(holeWord(diff, last.s)) ? 'an' : 'a'} ${holeWord(diff, last.s).toLowerCase()} (${last.s})`} on hole ${last.n}${pr != null ? ` (par ${pr})` : ''}; now ${p.score != null ? p.score : relTxt(null)} through ${played.length}`,
      who: [{ role: 'Player', name: p.name, id: p.id, team: p.country || null, jersey: null, pos: p.pos || null, headshot: p.headshot || null }],
    });
  }
  // players still on course first (fewer holes = earlier in round), then by leaderboard order
  return out;
}

/** golfLeaders: when ESPN publishes no hole-by-hole (finished events, early rounds) summarize the top of the board from real round scores. */
function golfLeaders(players, state) {
  const out = [];
  for (const p of (players || []).slice(0, 5)) {
    const rs = (p.rounds || []).filter((r) => r.strokes != null);
    if (!rs.length) continue;
    const done = p.state === 'post' || state === 'post';
    out.push({
      id: p.id, name: p.name, pos: p.pos, total: p.score, thru: p.thru, what: done ? 'Final standing' : 'Leaderboard',
      desc: `${p.name}${p.pos ? ` (${p.pos})` : ''} ${done ? 'finished' : 'is'} ${p.score != null ? p.score : 'E'}; rounds ${rs.map((r) => r.strokes).join(', ')}`,
      who: [{ role: 'Player', name: p.name, id: p.id, team: p.country || null, jersey: null, pos: p.pos || null, headshot: p.headshot || null }],
    });
  }
  return out;
}

/** tennisStory: set-by-set narrative from the linescores ESPN does publish. */
function tennisStory(m) {
  if (!m || !m.players || m.players.length < 2) return null;
  const [a, b] = m.players;
  const sets = []; const n = Math.max((a.sets || []).length, (b.sets || []).length);
  for (let i = 0; i < n; i++) {
    const x = a.sets && a.sets[i]; const y = b.sets && b.sets[i];
    if (x == null || y == null) continue;
    const xs = typeof x === 'object' ? (x.g != null ? x.g : x.games) : x; const ys = typeof y === 'object' ? (y.g != null ? y.g : y.games) : y;
    sets.push({ n: i + 1, a: xs, b: ys, winner: xs > ys ? a.name : ys > xs ? b.name : null });
  }
  const lines = sets.map((s) => `Set ${s.n}: ${s.winner ? `${s.winner} won ${Math.max(s.a, s.b)}-${Math.min(s.a, s.b)}` : `${s.a}-${s.b}`}`);
  const serving = m.players.find((p) => p.serving);
  const who = m.players.map((p) => ({ role: p.serving ? 'Serving' : 'Player', name: p.name, id: p.id || null, team: p.flag ? null : null, jersey: null, pos: p.seed ? `Seed ${p.seed}` : null, headshot: p.headshot || null }));
  const state = m.state === 'in' ? 'Live' : m.state === 'post' ? 'Final' : 'Scheduled';
  return {
    what: state === 'Live' ? `Set ${sets.length || 1} in progress` : state === 'Final' ? 'Match result' : 'Upcoming',
    desc: `${a.name} vs ${b.name}${m.round ? ` (${m.round})` : ''}. ${lines.join('. ')}${lines.length ? '.' : ''}${serving && state === 'Live' ? ` ${serving.name} to serve.` : ''}${m.note ? ` ${m.note}` : ''}`.trim(),
    who, sets: lines,
  };
}

/** eventStory: fight / race result line for event sports (UFC, F1, NASCAR, IndyCar). */
function eventStory(sport, comp) {
  if (!comp || !comp.competitors) return null;
  const cs = comp.competitors.slice().sort((x, y) => (x.order || 99) - (y.order || 99));
  const w = cs.find((c) => c.winner);
  const who = cs.slice(0, 3).map((c, i) => ({ role: c.winner ? 'Winner' : (comp.type === 'race' ? `P${c.order || i + 1}` : 'Opponent'), name: c.name, id: c.id || null, team: c.flag || null, jersey: null, pos: null, headshot: c.headshot || null }));
  if (sport === 'ufc') {
    const [a, b] = cs;
    if (!a || !b) return null;
    return { what: comp.result ? comp.result : (comp.state === 'post' ? 'Result' : 'Bout'), desc: w ? `${w.name} defeated ${(cs.find((c) => c !== w) || {}).name}${comp.result ? ` by ${comp.result}` : ''}${comp.round ? `, round ${comp.round}` : ''}${comp.clock ? ` at ${comp.clock}` : ''}` : `${a.name} vs ${b.name}${comp.round ? `, round ${comp.round}` : ''}`, who };
  }
  return { what: comp.state === 'post' ? 'Result' : 'Running order', desc: cs.slice(0, 3).map((c, i) => `${i + 1}. ${c.name}`).join(', '), who };
}

module.exports = { buildRoster, explainPlay, fbParse, fbClean, tokOf, resolveToken, ncaaFootballNames, golfStory, golfLeaders, tennisStory, eventStory, baseWhat, fold, lastKey, parenNames };
