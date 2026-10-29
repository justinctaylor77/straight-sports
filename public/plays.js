// Play graphics for the Gamecast: SVG renderers fed by ESPN play-by-play coordinates.
// Every renderer returns '' or a calm "no data" card when ESPN doesn't provide the numbers, so the screen never breaks.
// Selection state (which play / at-bat / filter) lives in `st` (castState) and is changed through [data-gcset="key=value"] buttons.

import { playBlock, playText, whoChips } from './whoplay.js?v=28';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hex = (c, fb) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : fb);
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (a, b) => { const x = rgb(a); const y = rgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) < 80; };
// Two distinguishable team colours (away/home); if they're near-identical the away side goes neutral.
export function teamColors(d) {
  const a = hex(d.away.team.color, '#7DAAFF'); let h = hex(d.home.team.color, '#FF5C6C');
  if (near(a, h)) h = hex(d.home.team.alt, '#FF5C6C');
  return { away: near(a, h) ? '#9AA7C0' : a, home: h };
}
// Caption under a shot graphic: the latest shot as "what happened + who" (server-explained), else ESPN's own text.
const shotCap = (s, d) => {
  if (!s) return '';
  const body = playBlock({ what: s.what, desc: s.desc || s.full || s.text, who: s.wh || (s.who && typeof s.who === 'string' ? [{ role: 'Shooter', name: s.who }] : []) }, d.heads);
  return body ? `<div class="gx-txt small shot-cap"><span class="faint small">Latest shot${s.clk ? ` · ${esc(s.clk)}` : ''}</span> ${body}</div>` : '';
};
const empty = (msg) => `<div class="card gx-empty">${esc(msg)}</div>`;
const set = (k, v, on, label, extra = '') => `<button class="gx-chip ${on ? 'on' : ''} ${extra}" data-gcset="${esc(k)}=${esc(v)}" aria-pressed="${!!on}">${label}</button>`;
const gxHead = (title, sub = '', replay = false) => `<div class="gx-hd"><b>${esc(title)}</b><span class="gx-hr">${sub ? `<span class="faint small">${sub}</span>` : ''}${replay ? '<button class="gx-replay rp" data-replay aria-label="Replay animation" title="Replay">↻ Replay</button>' : ''}</span></div>`;

// =====================================================================================================================
// FOOTBALL — passes (arcs), runs (arrows), kicks (arcs) on the field, from ESPN play start/end yard lines.
// ESPN yardLine runs 0–100 from the HOME team's own goal line. Away team attacks right, home attacks left (same as the field card).
// =====================================================================================================================
const FW = 360; const FH = 150; const EZ = 28; const PL = FW - EZ * 2; const MID = FH / 2;
const fx = (yl) => EZ + ((100 - yl) / 100) * PL;
// Realistic field shared by the Gamecast field card and the play tracker: striped turf, yard lines every 5 with hash marks,
// numbers on both sidelines, team-coloured end zones with team names, the HOME team's logo on the 50, and a muted red-zone tint
// over the 20 yards in front of each end zone. The away team's end zone is on the left (it attacks right).
export function fieldInner(d, ctx) {
  const col = teamColors(d); const ax = (y) => EZ + (y / 100) * PL; // y = yards from the away team's goal line
  const stripes = Array.from({ length: 10 }, (_, i) => `<rect x="${f1(ax(i * 10))}" y="0" width="${f1(PL / 10)}" height="${FH}" class="${i % 2 ? 'st1' : 'st0'}"/>`).join('');
  const lines = Array.from({ length: 19 }, (_, i) => { const n = (i + 1) * 5; return `<line x1="${f1(ax(n))}" x2="${f1(ax(n))}" y1="0" y2="${FH}" class="yl ${n % 10 ? 'minor' : ''}"/>`; }).join('');
  let ticks = ''; for (let y = 1; y < 100; y++) { if (y % 5 === 0) continue; const x = f1(ax(y)); ticks += `M${x} 1v3M${x} ${FH - 4}v3M${x} ${MID - 17}v3.2M${x} ${MID + 14}v3.2`; }
  const nums = Array.from({ length: 9 }, (_, i) => { const n = (i + 1) * 10; const v = n > 50 ? 100 - n : n; const x = f1(ax(n));
    return `<text x="${x}" y="${FH - 11}" class="yn">${v}</text><text x="${x}" y="${FH - 11}" class="yn" transform="rotate(180 ${x} ${MID})">${v}</text>`; }).join('');
  const nm = (t) => String(t.short || t.name || t.abbr || '').toUpperCase();
  const ezt = (t, x, rot) => { const label = nm(t); const fs = Math.max(7, Math.min(15, 128 / (label.length * 0.78))); return `<text x="${x}" y="${MID}" class="ezt" font-size="${f1(fs)}" transform="rotate(${rot} ${x} ${MID})">${esc(label)}</text>`; };
  const hx = ax(50);
  const logo = ctx && ctx.logo ? ctx.logo(d.home.team) : '';
  return `<rect width="${FW}" height="${FH}" class="turf"/>${stripes}
    <rect x="${f1(ax(0))}" width="${f1(PL / 5)}" height="${FH}" class="rz"/><rect x="${f1(ax(80))}" width="${f1(PL / 5)}" height="${FH}" class="rz"/>
    <rect width="${EZ}" height="${FH}" fill="${col.away}"/><rect x="${FW - EZ}" width="${EZ}" height="${FH}" fill="${col.home}"/>
    <rect width="${EZ}" height="${FH}" class="ezsh"/><rect x="${FW - EZ}" width="${EZ}" height="${FH}" class="ezsh"/>
    ${ezt(d.away.team, EZ / 2, -90)}${ezt(d.home.team, FW - EZ / 2, 90)}
    ${lines}<path d="${ticks}" class="hm"/>${nums}
    <rect x="0.75" y="0.75" width="${FW - 1.5}" height="${FH - 1.5}" class="bd"/>
    ${logo ? `<circle cx="${f1(hx)}" cy="${MID}" r="21" class="disc"/><image href="${esc(logo)}" x="${f1(hx - 15)}" y="${MID - 15}" width="30" height="30" preserveAspectRatio="xMidYMid meet"/>` : ''}`;
}
export const FIELD = { W: FW, H: FH, EZ, PL, MID };
export function fbCat(p) {
  const ty = `${p.type || ''}`; const tx = p.text || '';
  if (/timeout|end (of|period|game)|two-minute|coin toss|official|delay|\bTV\b|review/i.test(ty)) return null;
  if (/kickoff/i.test(ty)) return 'ko';
  if (/punt/i.test(ty)) return 'punt';
  if (/field goal/i.test(ty)) return 'fg';
  if (/^penalty/i.test(ty) && !/\b(pass|rush)\b/i.test(tx)) return 'pen';
  if (/sack/i.test(ty)) return 'sack';
  if (/pass|interception/i.test(ty)) return 'pass';
  if (/rush|run|scramble|kneel|spike|fumble/i.test(ty)) return /spike/i.test(ty) ? 'pass' : 'run';
  if (/^penalty/i.test(ty)) return /pass/i.test(tx) ? 'pass' : 'run';
  if (/\bpass(es|ed)?\b/i.test(tx)) return 'pass';
  if (/\b(rush|left|right|middle)\b.*\bfor\b/i.test(tx)) return 'run';
  return null;
}
function fbList(d) {
  const out = [];
  for (const dr of d.drives || []) {
    const plays = (dr.plays || []).map((p, i) => ({ ...p, cat: fbCat(p), dr, i })).filter((p) => p.cat && p.s != null);
    if (plays.length) out.push({ dr, plays });
  }
  return out; // latest drive first
}
function lane(txt, kind) {
  const m = /\b(left|middle|right)\b/i.exec(txt || ''); if (!m) return { side: 0, mag: 0 };
  const side = m[1].toLowerCase() === 'left' ? -1 : m[1].toLowerCase() === 'right' ? 1 : 0;
  if (kind === 'pass') return { side, mag: /deep/i.test(txt) ? 40 : 30 };
  return { side, mag: /\b(end|outside|sweep|edge)\b/i.test(txt) ? 36 : /tackle/i.test(txt) ? 24 : /guard/i.test(txt) ? 13 : 22 };
}
const arrowHead = (x, y, ang, cls) => `<path d="M0 0 L-8 -4.2 L-8 4.2Z" transform="translate(${f1(x)} ${f1(y)}) rotate(${f1((ang * 180) / Math.PI)})" class="pg-ah ${cls}"/>`;
const quad = (x0, y0, xc, yc, x1, y1) => `M${f1(x0)} ${f1(y0)} Q${f1(xc)} ${f1(yc)} ${f1(x1)} ${f1(y1)}`;
// One play's drawing: returns { svg, label }
function fbDraw(p, d, dir, sel) {
  const x0 = fx(p.s); const e = p.e ?? p.s; const x1 = fx(e);
  const cls = `${sel ? 'sel' : 'old'}`; const L = lane(p.text, p.cat);
  const len = (re) => { const m = re.exec(p.text || ''); return m ? +m[1] : null; };
  let svg = ''; let label = ''; let fk = p.cat; let ball = '';
  const FBALL = '<g class="pg-ball"><ellipse rx="5.2" ry="3.3" class="pgb"/><path d="M-2 0h4" class="pgl"/></g>';
  const clampX = (x) => Math.max(5, Math.min(FW - 5, x));
  if (p.cat === 'pass') {
    const inc = /incomplete/i.test(p.text) || /incompletion/i.test(p.type || '');
    const pick = /intercept/i.test(`${p.type} ${p.text}`);
    const depth = /deep/i.test(p.text) ? 24 : /short/i.test(p.text) ? 8 : 13;
    const xt = inc || pick ? clampX(x0 + dir * (pick && !inc ? Math.max(depth, 14) : depth) * (PL / 100)) : x1;
    const yt = MID + L.side * dir * L.mag * (inc || pick ? 0.9 : 1);
    const peak = 14 + Math.min(34, Math.abs(xt - x0) * 0.32); const xc = (x0 + xt) / 2; const yc = Math.min(MID, yt) - peak;
    const kind = inc ? 'bad' : pick ? 'bad' : 'pass';
    svg = `<path d="${quad(x0, MID, xc, yc, xt, yt)}" class="pg-ln pg-${kind} ${cls} ${inc ? 'dash' : ''}" ${sel ? 'data-ln="1"' : ''}/>`;
    if (sel) svg += (inc || pick) ? `<g class="pg-x pg-end" transform="translate(${f1(xt)} ${f1(yt)})"><path d="M-4 -4L4 4M4 -4L-4 4"/></g>` : `${arrowHead(xt, yt, Math.atan2(yt - yc, xt - xc), 'pg-pass pg-end')}<circle cx="${f1(xt)}" cy="${f1(yt)}" r="3.4" class="pg-dot pg-end"/>`;
    // after-the-catch / return segment
    if (!inc && !pick && sel && Math.abs(x1 - xt) > 2) svg += `<line x1="${f1(xt)}" y1="${f1(yt)}" x2="${f1(x1)}" y2="${f1(yt)}" class="pg-ln pg-run sel thin pg-end"/>`;
    fk = inc || pick ? 'inc' : 'pass'; ball = FBALL;
    label = pick ? 'Interception' : inc ? 'Incomplete' : /touchdown/i.test(`${p.type}`) ? 'Touchdown pass' : `${(p.yds ?? 0) >= 0 ? '+' : ''}${p.yds ?? ''} yd pass`;
  } else if (p.cat === 'run') {
    const yE = MID + L.side * dir * L.mag; const y1 = MID + L.side * dir * L.mag * 0.55;
    const xm = x0 + (x1 - x0) * 0.45;
    svg = `<path d="${quad(x0, MID, xm, yE, x1, y1)}" class="pg-ln pg-run ${cls}" ${sel ? 'data-ln="1"' : ''}/>`;
    if (sel) svg += `${arrowHead(x1, y1, Math.atan2(y1 - yE, x1 - xm || dir), 'pg-run pg-end')}`;
    ball = '<g class="pg-ball"><circle r="3.7" class="pgr"/></g>';
    label = /touchdown/i.test(p.type || '') ? 'Rushing touchdown' : `${(p.yds ?? 0) >= 0 ? '+' : ''}${p.yds ?? 0} yd run`;
  } else if (p.cat === 'sack') {
    svg = `<line x1="${f1(x0)}" y1="${MID}" x2="${f1(x1)}" y2="${MID}" class="pg-ln pg-bad ${cls}" ${sel ? 'data-ln="1"' : ''}/>${sel ? `<g class="pg-x pg-end" transform="translate(${f1(x1)} ${MID})"><path d="M-4 -4L4 4M4 -4L-4 4"/></g>` : ''}`;
    label = `Sack ${p.yds ?? ''} yd`; ball = '<g class="pg-ball"><circle r="3.7" class="pgr"/></g>';
  } else if (p.cat === 'ko' || p.cat === 'punt') {
    const n = len(/(?:kicks?|kickoff|punts?)\s+(\d+)\s+yards?/i) ?? len(/(\d+)\s+yards?/i);
    const xl = n != null ? clampX(x0 + dir * n * (PL / 100)) : x1;
    const peak = 26 + (n || 40) * 0.28;
    svg = `<path d="${quad(x0, MID, (x0 + xl) / 2, MID - peak, xl, MID)}" class="pg-ln pg-kick ${cls}" ${sel ? 'data-ln="1"' : ''}/>`;
    if (sel) svg += `${arrowHead(xl, MID, Math.atan2(peak, (xl - (x0 + xl) / 2) || dir), 'pg-kick pg-end')}`;
    if (sel && Math.abs(x1 - xl) > 3) svg += `<line x1="${f1(xl)}" y1="${MID + 9}" x2="${f1(x1)}" y2="${MID + 9}" class="pg-ln pg-run sel thin dash pg-end"/>`;
    fk = 'kick'; ball = `<ellipse class="pg-shadow" rx="4" ry="1.6"/>${FBALL}`;
    label = `${p.cat === 'ko' ? 'Kickoff' : 'Punt'}${n != null ? ` ${n} yd` : ''}`;
  } else if (p.cat === 'fg') {
    const good = /good/i.test(p.type || '') && !/no good|missed/i.test(`${p.type} ${p.text}`);
    const xt = dir > 0 ? FW - 7 : 7; const yt = MID + (good ? 0 : (/left/i.test(p.text) ? -16 : /right/i.test(p.text) ? 16 : 14));
    const peak = 30 + Math.abs(xt - x0) * 0.12;
    svg = `<path d="${quad(x0, MID, (x0 + xt) / 2, MID - peak, xt, yt)}" class="pg-ln pg-${good ? 'kick' : 'bad'} ${cls} ${good ? '' : 'dash'}" ${sel ? 'data-ln="1"' : ''}/>`;
    fk = 'kick'; ball = `<ellipse class="pg-shadow" rx="4" ry="1.6"/>${FBALL}`;
    if (sel) svg += good ? `<path d="M-4 0l3 3.4 6-7" transform="translate(${f1(xt)} ${f1(yt)})" class="pg-ok pg-end"/>` : `<g class="pg-x pg-end" transform="translate(${f1(xt)} ${f1(yt)})"><path d="M-4 -4L4 4M4 -4L-4 4"/></g>`;
    const n = len(/(\d+)\s+yard/i); label = `Field goal${n ? ` ${n} yd` : ''} ${good ? 'good' : 'no good'}`;
  } else if (p.cat === 'pen') {
    svg = `<path d="M0 -12v16M0 -12h10l-3 4 3 4h-10" transform="translate(${f1(x0)} ${MID})" class="pg-flag pg-end"/>`;
    label = `Penalty${p.yds ? ` ${p.yds} yd` : ''}`;
  }
  return { svg, label, kind: fk, ball };
}
export function footballPlays(d, st, ctx) {
  if (d.state === 'pre') return '';
  const list = fbList(d);
  if (!list.length) return empty('Play graphics appear once ESPN posts yard-line data for the first plays.');
  const di = Math.max(0, list.findIndex((x) => x.dr.id === st.fd)); const cur = list[di];
  const plays = cur.plays;
  let pi = plays.findIndex((p) => p.id === st.fp); if (pi < 0) pi = plays.length - 1;
  const p = plays[pi]; const dr = cur.dr;
  const offAway = (p.tm || dr.teamId) === d.away.team.id; const dir = offAway ? 1 : -1;
  const col = teamColors(d);
  const drawn = plays.map((q, i) => (i === pi ? null : fbDraw(q, d, (q.tm || dr.teamId) === d.away.team.id ? 1 : -1, false))).map((x) => (x ? x.svg : '')).join('');
  const main = fbDraw(p, d, dir, true);
  const ltg = p.ds && ['pass', 'run', 'sack'].includes(p.cat) ? fx(p.s + (offAway ? -1 : 1) * p.ds) : null;
  const t = [d.home, d.away].find((s) => s.team.id === (p.tm || dr.teamId)) || d.away;
  const chips = plays.map((q, i) => set('fp', q.id, i === pi, `${i + 1}`, `c-${q.cat === 'pass' && (/incomplete|intercept/i.test(`${q.type} ${q.text}`)) ? 'bad' : q.cat === 'sack' ? 'bad' : q.cat}`)).join('');
  const nav = (k, v, txt, dis) => `<button class="gx-nav" ${dis ? 'disabled' : `data-gcset="${k}=${esc(v)}"`} aria-label="${esc(txt)}">${txt}</button>`;
  const drLabel = `${esc(dr.abbr || '')} · ${esc(dr.result || (dr.current ? 'In progress' : ''))}`;
  const autoBtn = plays.length > 1 ? `<button class="gx-replay auto ${st.auto ? 'on' : ''}" data-autoplay aria-pressed="${!!st.auto}" title="Step through this drive">${st.auto ? '❚❚ Pause' : '▶ Play drive'}</button>` : '';
  return `<div class="card gx gx-fb" data-sel data-plays="${plays.map((q) => esc(q.id)).join(',')}" data-cur="${esc(p.id)}">
    ${gxHead('Play tracker', `${dr.period ? `Q${dr.period} ` : ''}${esc(dr.clock || '')}`, true)}
    <div class="gx-drive">${nav('fd', (list[di + 1] || {}).dr ? list[di + 1].dr.id : '', '‹', di >= list.length - 1)}<span>${drLabel}${di === 0 && d.state === 'in' ? ' <i class="live-dot"></i>' : ''}</span>${nav('fd', di > 0 ? list[di - 1].dr.id : '', '›', di <= 0)}</div>
    <svg viewBox="0 0 ${FW} ${FH}" class="pg-svg" role="img" aria-label="${esc(`${main.label}. ${p.text}`)}">
      ${fieldInner(d, ctx)}
      ${ltg != null ? `<line x1="${f1(ltg)}" x2="${f1(ltg)}" y1="8" y2="${FH - 20}" class="ltg" data-slide="t-ltg" data-x="${f1(ltg)}"/>` : ''}
      <line x1="${f1(fx(p.s))}" x2="${f1(fx(p.s))}" y1="8" y2="${FH - 20}" class="los" data-slide="t-los" data-x="${f1(fx(p.s))}"/>
      ${drawn}<g class="pg-main" data-an="fb" data-ak="fb:${esc(p.id)}" data-kind="${main.kind}">${main.svg}${main.ball}</g>
    </svg>
    <div class="gx-cap"><b>${esc(p.what || main.label)}</b><span class="faint small">${esc(p.dd || '')}${p.clock ? ` · ${p.period ? `Q${p.period} ` : ''}${esc(p.clock)}` : ''}</span></div>
    <div class="gx-txt small">${playBlock({ ...p, what: null }, d.heads) || esc(p.text)}</div>
    <div class="gx-chips" role="group" aria-label="Plays in this drive">${chips}${autoBtn}</div>
    <div class="gx-key"><span><i class="k pass"></i>Pass</span><span><i class="k run"></i>Run</span><span><i class="k kick"></i>Kick</span><span><i class="k bad"></i>Incomplete / sack / miss</span><span class="faint">${esc(d.away.team.abbr)} → · ← ${esc(d.home.team.abbr)}</span></div>
    <p class="faint small gx-note">Drawn from ESPN yard lines; passes and runs are shaped from the play text (direction, depth). Exact field positions aren't in the free feed.</p></div>`;
}

// =====================================================================================================================
// BASEBALL — strike zone with each pitch (ESPN pitchCoordinate), plus where the ball was hit.
// =====================================================================================================================
const PCOL = { B: 'ball', S: 'strike', F: 'foul', X: 'play' };
const PLAB = { B: 'Ball', S: 'Strike', F: 'Foul', X: 'In play' };
const TRAJ = { G: 'Ground ball', L: 'Line drive', F: 'Fly ball', P: 'Pop up', B: 'Bunt' };
export function pitchTracker(d, st) {
  if (d.state === 'pre') return '';
  const abs = (d.atBats || []).filter((a) => a.pitches.some((p) => p.x != null));
  if (!abs.length) return empty(d.state === 'in' ? 'Pitch locations aren’t in ESPN’s feed for this game right now.' : 'ESPN didn’t record pitch locations for this game.');
  let i = abs.findIndex((a) => a.id === st.ab); if (i < 0) i = abs.length - 1;
  const ab = abs[i]; const ps = ab.pitches.filter((p) => p.x != null);
  // view window around the strike zone (ESPN units); zone is approximate
  const X0 = 45; const Y0 = 108; const VW = 140; const VH = 120; const Z = { x: 88, y: 150, w: 54, h: 44 };
  const clampP = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const zone = `<rect x="${Z.x}" y="${Z.y}" width="${Z.w}" height="${Z.h}" class="sz"/>`
    + [1, 2].map((k) => `<line x1="${Z.x + (Z.w / 3) * k}" x2="${Z.x + (Z.w / 3) * k}" y1="${Z.y}" y2="${Z.y + Z.h}" class="szg"/><line y1="${Z.y + (Z.h / 3) * k}" y2="${Z.y + (Z.h / 3) * k}" x1="${Z.x}" x2="${Z.x + Z.w}" class="szg"/>`).join('');
  const plate = `<path d="M${Z.x + 6} 208 H${Z.x + Z.w - 6} V213 L${Z.x + Z.w / 2} 218 L${Z.x + 6} 213Z" class="plate2"/>`;
  const dots = ps.map((p, k) => { const x = clampP(p.x, X0 + 6, X0 + VW - 6); const y = clampP(p.y, Y0 + 6, Y0 + VH - 6); const last = k === ps.length - 1;
    return `<g class="pt ${PCOL[p.k]} ${last ? 'last' : ''}" transform="translate(${x} ${y})" data-an="pitch" data-ak="pt:${esc(ab.id)}:${esc(p.n)}" data-x="${x}" data-y="${y}"><title>${esc(`${p.n}. ${p.tn || ''} ${p.mph ? p.mph + ' mph' : ''} — ${p.call}`)}</title><circle r="7.4"/><text y="3.6">${esc(p.n)}</text></g>`; }).join('');
  const rows = ab.pitches.map((p) => `<li class="${PCOL[p.k]}" ${p.x != null ? `data-an="fade" data-ak="ptr:${esc(ab.id)}:${esc(p.n)}" data-follow="pt:${esc(ab.id)}:${esc(p.n)}"` : ''}><i class="d"></i><span class="n">${esc(p.n)}</span><span class="ty">${esc(p.tn || p.ty || 'Pitch')}</span><span class="mph">${p.mph ? `${esc(p.mph)} mph` : ''}</span><span class="rs">${PLAB[p.k]}</span><span class="ct faint">${p.b != null ? `${p.b}-${p.s}` : ''}</span></li>`).join('');
  const nav = (v, txt, dis) => `<button class="gx-nav" ${dis ? 'disabled' : `data-gcset="ab=${esc(v)}"`} aria-label="${txt === '‹' ? 'Earlier at-bat' : 'Later at-bat'}">${txt}</button>`;
  // spray chart for balls in play
  let spray = '';
  if (ab.hit) {
    const hx = clampP(ab.hit.x, 6, 244); const hy = clampP(ab.hit.y, 6, 214);
    spray = `<div class="gx-spray"><svg viewBox="0 0 250 220" class="spray-svg" role="img" aria-label="Where the ball was hit"><path d="M125 205 L18 98 A150 150 0 0 1 232 98Z" class="grass"/><path d="M125 205 L18 98 M125 205 L232 98" class="foul"/><path d="M125 205 L170 160 L125 115 L80 160Z" class="infield"/>
      <g class="bag"><rect x="122" y="112" width="6" height="6"/><rect x="167" y="157" width="6" height="6"/><rect x="77" y="157" width="6" height="6"/></g><circle cx="125" cy="205" r="4" class="home"/>
      <g data-an="spray" data-ak="hit:${esc(ab.id)}" data-hx="${hx}" data-hy="${hy}" data-traj="${esc(ab.ht || '')}"><line x1="125" y1="205" x2="${hx}" y2="${hy}" class="hit-ln"/><circle cx="${hx}" cy="${hy}" r="6" class="hit-dot"/></g></svg><div class="faint small">${esc(TRAJ[ab.ht] || 'Ball in play')}</div></div>`;
  }
  return `<div class="card gx gx-bb" data-sel>
    ${gxHead('Pitch tracker', `${esc(ab.inn || '')}`, true)}
    <div class="gx-drive">${nav(i > 0 ? abs[i - 1].id : '', '‹', i <= 0)}<span><b>${esc(ab.bat || 'Batter')}</b> <span class="faint">vs</span> ${esc(ab.pit || 'Pitcher')}${i === abs.length - 1 && d.state === 'in' ? ' <i class="live-dot"></i>' : ''}</span>${nav(i < abs.length - 1 ? abs[i + 1].id : '', '›', i >= abs.length - 1)}</div>
    <div class="gx-bbrow"><svg viewBox="${X0} ${Y0} ${VW} ${VH + 0}" class="sz-svg" role="img" aria-label="Pitch locations in the strike zone">${zone}${plate}${dots}</svg>${spray}</div>
    <ol class="gx-pitches">${rows}</ol>
    ${ab.res ? `<div class="gx-txt small ${ab.score ? 'scored' : ''}">${ab.what ? `<b class="pw">${esc(ab.what)}</b> ` : ''}${playBlock({ desc: ab.desc, text: ab.res, who: ab.who }, d.heads) || esc(ab.res)}</div>` : ''}
    <div class="gx-key"><span><i class="k ball"></i>Ball</span><span><i class="k strike"></i>Strike</span><span><i class="k foul"></i>Foul</span><span><i class="k play"></i>In play</span></div>
    <p class="faint small gx-note">Locations are ESPN’s tracking coordinates; the box is an approximate strike zone.</p></div>`;
}

// =====================================================================================================================
// HOCKEY — rink with shot locations (ESPN coordinate x −100…100, y −42…42)
// =====================================================================================================================
const filterChips = (d, st, extra = []) => `<div class="gx-chips f">${set('sf', 'all', !st.sf || st.sf === 'all', 'Both')}${set('sf', 'away', st.sf === 'away', esc(d.away.team.abbr))}${set('sf', 'home', st.sf === 'home', esc(d.home.team.abbr))}${extra.join('')}</div>`;
export function hockeyShots(d, st) {
  if (d.state === 'pre') return '';
  const sm = d.shots; if (!sm || sm.kind !== 'hockey' || !sm.list.length) return empty('Shot locations appear here once ESPN posts them for this game.');
  const col = teamColors(d);
  const f = st.sf || 'all'; const list = sm.list.filter((s) => (f === 'all' || s.side === f || (f === 'goal' && s.k === 'goal')));
  const cnt = (side) => { const a = sm.list.filter((s) => s.side === side); return { sog: a.filter((s) => s.k === 'save' || s.k === 'goal').length, g: a.filter((s) => s.k === 'goal').length, all: a.length }; };
  const A = cnt('away'); const H = cnt('home');
  const X = (x) => 100 + x; const Y = (y) => 42.5 + y;
  const dotsSvg = list.map((s) => `<g class="shot-an${s.k === 'goal' ? ' goal-an' : ''}" data-an="shot" data-ak="shot:hk:${sm.list.indexOf(s)}">${hkDot(s)}</g>`).join('');
  function hkDot(s) { const c = s.side === 'home' ? col.home : col.away; const x = X(s.x); const y = Y(s.y);
    const tip = `<title>${esc(`${s.clk || ''} ${s.text}`)}</title>`;
    if (s.k === 'goal') return `<g class="rs goal" transform="translate(${x} ${y})" style="--c:${c}">${tip}<circle r="3.6"/><path d="M0-6.4V-4.4M0 4.4V6.4M-6.4 0H-4.4M4.4 0H6.4" /></g>`;
    if (s.k === 'save') return `<circle class="rs save" cx="${x}" cy="${y}" r="2.1" style="--c:${c}">${tip}</circle>`;
    if (s.k === 'miss') return `<path class="rs miss" d="M${x - 1.8} ${y - 1.8}l3.6 3.6M${x + 1.8} ${y - 1.8}l-3.6 3.6" style="--c:${c}">${tip}</path>`;
    return `<rect class="rs block" x="${x - 1.6}" y="${y - 1.6}" width="3.2" height="3.2" transform="rotate(45 ${x} ${y})" style="--c:${c}">${tip}</rect>`; }
  const rink = `<rect x=".5" y=".5" width="199" height="84" rx="26" class="ice"/>
    <line x1="100" x2="100" y1=".5" y2="84.5" class="rl"/><line x1="75" x2="75" y1=".5" y2="84.5" class="bl"/><line x1="125" x2="125" y1=".5" y2="84.5" class="bl"/>
    <line x1="11" x2="11" y1="4" y2="81" class="gl"/><line x1="189" x2="189" y1="4" y2="81" class="gl"/>
    <circle cx="100" cy="42.5" r="15" class="fo"/><circle cx="100" cy="42.5" r="1.4" class="fod"/>
    ${[[31, 20.5], [31, 64.5], [169, 20.5], [169, 64.5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="15" class="fo"/><circle cx="${x}" cy="${y}" r="1.2" class="fod"/>`).join('')}
    <path d="M11 36.5a6 6 0 0 1 0 12M189 36.5a6 6 0 0 0 0 12" class="cr"/>`;
  return `<div class="card gx gx-hk" data-sel>
    ${gxHead('Shot map', `${esc(d.away.team.abbr)} ${A.sog} SOG · ${esc(d.home.team.abbr)} ${H.sog} SOG`, true)}
    ${filterChips(d, st, [set('sf', 'goal', f === 'goal', 'Goals')])}
    <svg viewBox="-2 -2 204 89" class="rink-svg" role="img" aria-label="Rink with shot locations">${rink}${dotsSvg}</svg>
    ${shotCap(list[list.length - 1], d)}
    <div class="gx-key"><span><i class="k goalk"></i>Goal</span><span><i class="k saveK"></i>Shot on goal</span><span><i class="k missK">×</i>Missed</span><span><i class="k blockK"></i>Blocked</span></div>
    <div class="gx-legend"><span><i style="background:${col.away}"></i>${esc(d.away.team.abbr)} ${A.g} ${A.g === 1 ? 'goal' : 'goals'}</span><span><i style="background:${col.home}"></i>${esc(d.home.team.abbr)} ${H.g} ${H.g === 1 ? 'goal' : 'goals'}</span></div>
    <p class="faint small gx-note">Plotted where ESPN logged each shot (teams switch ends each period).</p></div>`;
}

// =====================================================================================================================
// BASKETBALL — half-court shot chart (ESPN coordinate: x 0–50 across, y = feet from the basket; both teams normalised to one basket)
// =====================================================================================================================
export function basketballShots(d, st) {
  if (d.state === 'pre') return '';
  const sm = d.shots; if (!sm || sm.kind !== 'basketball' || !sm.list.length) return empty('Shot chart appears here once ESPN posts shot locations for this game.');
  const col = teamColors(d); const f = st.sf || 'all';
  const all = sm.list.filter((s) => s.y <= 47);
  const list = all.filter((s) => f === 'all' || s.side === f);
  const sum = (side) => { const a = all.filter((s) => s.side === side); const m = a.filter((s) => s.m); const t3 = a.filter((s) => s.pts === 3 || /three point/i.test(s.text || '')); const m3 = t3.filter((s) => s.m);
    return { fg: `${m.length}/${a.length}`, p: a.length ? Math.round((m.length / a.length) * 100) : 0, t3: `${m3.length}/${t3.length}` }; };
  const A = sum('away'); const H = sum('home');
  const SY = (y) => 42 - y; // baseline at the bottom; hoop at y=0 → sy=42
  const dotsSvg = list.map((s) => { const c = s.side === 'home' ? col.home : col.away; const x = Math.max(0.8, Math.min(49.2, s.x)); const y = SY(s.y); const tip = `<title>${esc(`Q${s.per || ''} ${s.clk || ''} ${s.text || ''}`)}</title>`;
    const dot = s.m ? `<circle class="sh made" cx="${x}" cy="${y}" r=".95" style="--c:${c}">${tip}</circle>` : `<path class="sh miss" d="M${x - .85} ${y - .85}l1.7 1.7M${x + .85} ${y - .85}l-1.7 1.7" style="--c:${c}">${tip}</path>`;
    return `<g class="shot-an" data-an="shot" data-ak="shot:bk:${sm.list.indexOf(s)}">${dot}</g>`; }).join('');
  const R3 = 23.75; const yc = Math.sqrt(R3 * R3 - 22 * 22); // where the arc meets the corner lines
  const court = `<rect x="0" y="0" width="50" height="47.25" class="wood"/>
    <g class="cl"><rect x="17" y="${SY(13.75)}" width="16" height="${13.75 + 5.25}" transform="translate(0 0)" /><path d="M${25 - 6} ${SY(13.75)}a6 6 0 0 1 12 0" /><path d="M${25 - 6} ${SY(13.75)}a6 6 0 0 0 12 0" class="dsh"/>
      <path d="M3 ${SY(-5.25)}V${SY(yc)}A${R3} ${R3} 0 0 1 47 ${SY(yc)}V${SY(-5.25)}" /><path d="M${25 - 4} ${SY(0)}a4 4 0 0 1 8 0" /><line x1="22" x2="28" y1="${SY(-1.25)}" y2="${SY(-1.25)}" class="bb"/><circle cx="25" cy="${SY(0)}" r=".75" class="rim"/></g>`;
  return `<div class="card gx gx-bk" data-sel>
    ${gxHead('Shot chart', `${esc(d.away.team.abbr)} ${A.fg} · ${esc(d.home.team.abbr)} ${H.fg} FG`, true)}
    ${filterChips(d, st)}
    <svg viewBox="-2 -2 54 51" class="court-svg" role="img" aria-label="Basketball half court with shot locations">${court}${dotsSvg}</svg>
    ${shotCap(list[list.length - 1], d)}
    <div class="gx-key"><span><i class="k madeK"></i>Made</span><span><i class="k missK">×</i>Missed</span></div>
    <div class="gx-legend"><span><i style="background:${col.away}"></i>${esc(d.away.team.abbr)} ${A.p}% · 3PT ${A.t3}</span><span><i style="background:${col.home}"></i>${esc(d.home.team.abbr)} ${H.p}% · 3PT ${H.t3}</span></div>
    <p class="faint small gx-note">Every shot is shown at one basket (ESPN reports shots relative to the basket attacked). Free throws are left out.</p></div>`;
}

// =====================================================================================================================
// SOCCER — pitch with shot / goal locations (ESPN commentary field position, 0–100; each team attacks the right in the feed)
// =====================================================================================================================
export function soccerShots(d, st) {
  if (d.state === 'pre') return '';
  const sm = d.shots; if (!sm || sm.kind !== 'soccer' || !sm.list.length) return empty('Shot locations appear here once ESPN posts them for this match.');
  const col = teamColors(d); const f = st.sf || 'all';
  const list = sm.list.filter((s) => f === 'all' || s.side === f || (f === 'goal' && s.k === 'goal'));
  const cnt = (side) => { const a = sm.list.filter((s) => s.side === side); return { n: a.length, on: a.filter((s) => s.k === 'on' || s.k === 'goal').length, g: a.filter((s) => s.k === 'goal').length }; };
  const A = cnt('away'); const H = cnt('home');
  const dotsSvg = list.map((s) => `<g class="shot-an${s.k === 'goal' ? ' goal-an' : ''}" data-an="shot" data-ak="shot:sc:${sm.list.indexOf(s)}">${scDot(s)}</g>`).join('');
  function scDot(s) { const home = s.side === 'home'; const c = home ? col.home : col.away;
    const px = home ? s.x : 100 - s.x; const py = home ? s.y : 100 - s.y; const x = (px / 100) * 105; const y = (py / 100) * 68;
    const tip = `<title>${esc(`${s.clk || ''} ${s.who ? s.who + ' — ' : ''}${s.text || ''}`)}</title>`;
    if (s.k === 'goal') return `<g class="rs goal" transform="translate(${f1(x)} ${f1(y)})" style="--c:${c}">${tip}<circle r="2.5"/><path d="M0-4.5V-3M0 3V4.5M-4.5 0H-3M3 0H4.5"/></g>`;
    if (s.k === 'on') return `<circle class="rs save" cx="${f1(x)}" cy="${f1(y)}" r="1.5" style="--c:${c}">${tip}</circle>`;
    if (s.k === 'off') return `<path class="rs miss" d="M${f1(x - 1.3)} ${f1(y - 1.3)}l2.6 2.6M${f1(x + 1.3)} ${f1(y - 1.3)}l-2.6 2.6" style="--c:${c}">${tip}</path>`;
    return `<rect class="rs block" x="${f1(x - 1.1)}" y="${f1(y - 1.1)}" width="2.2" height="2.2" transform="rotate(45 ${f1(x)} ${f1(y)})" style="--c:${c}">${tip}</rect>`; }
  const pitch = `<rect x="0" y="0" width="105" height="68" class="grass2"/>${[0, 1, 2, 3, 4, 5, 6].map((i) => `<rect x="${i * 15}" y="0" width="7.5" height="68" class="stripe"/>`).join('')}
    <g class="pl"><rect x=".4" y=".4" width="104.2" height="67.2"/><line x1="52.5" x2="52.5" y1="0" y2="68"/><circle cx="52.5" cy="34" r="9.15"/>
      <rect x="0" y="13.84" width="16.5" height="40.32"/><rect x="88.5" y="13.84" width="16.5" height="40.32"/><rect x="0" y="24.84" width="5.5" height="18.32"/><rect x="99.5" y="24.84" width="5.5" height="18.32"/>
      <path d="M16.5 27.5a9.15 9.15 0 0 1 0 13M88.5 27.5a9.15 9.15 0 0 0 0 13"/></g>
    <rect x="-1.6" y="30.3" width="1.6" height="7.4" class="goal-box"/><rect x="105" y="30.3" width="1.6" height="7.4" class="goal-box"/>`;
  return `<div class="card gx gx-sc" data-sel>
    ${gxHead('Shot map', `${esc(d.away.team.abbr)} ${A.n} · ${esc(d.home.team.abbr)} ${H.n} shots`, true)}
    ${filterChips(d, st, [set('sf', 'goal', f === 'goal', 'Goals')])}
    <svg viewBox="-3 -2 111 72" class="pitch-svg" role="img" aria-label="Pitch with shot locations">${pitch}${dotsSvg}</svg>
    ${shotCap(list[list.length - 1], d)}
    <div class="gx-key"><span><i class="k goalk"></i>Goal</span><span><i class="k saveK"></i>On target</span><span><i class="k missK">×</i>Off target</span><span><i class="k blockK"></i>Blocked</span></div>
    <div class="gx-legend"><span><i style="background:${col.away}"></i>${esc(d.away.team.abbr)} ${A.on} on target · ${A.g} ${A.g === 1 ? 'goal' : 'goals'}</span><span><i style="background:${col.home}"></i>${esc(d.home.team.abbr)} ${H.on} on target · ${H.g} ${H.g === 1 ? 'goal' : 'goals'}</span></div>
    <p class="faint small gx-note">${esc(d.away.team.abbr)} attacks left, ${esc(d.home.team.abbr)} right. From ESPN’s match commentary positions.</p></div>`;
}

// =====================================================================================================================
// GOLF — score-to-par leaderboard bars + per-round hole strip. TENNIS — court with server + set flow. RACING — podium.
// =====================================================================================================================
const par = (s) => { const t = String(s ?? '').trim(); if (/^E$/i.test(t)) return 0; const n = parseInt(t.replace('+', ''), 10); return Number.isFinite(n) ? n : null; };
export function golfLeaders(d, ctx) {
  const ps = (d.players || []).filter((p) => par(p.score) != null && !p.cut).slice(0, 10);
  if (ps.length < 3 || d.state === 'pre') return '';
  const mine = (d.players || []).filter((p) => ctx.follows(p.id) && par(p.score) != null && !ps.includes(p));
  const rows = [...ps, ...mine]; const mx = Math.max(3, ...rows.map((p) => Math.abs(par(p.score))));
  return `<div class="card gx gx-golf" data-an="golfcard">${gxHead('Leaderboard graphic', 'score to par', true)}
    <div class="gx-bars">${rows.map((p) => { const v = par(p.score); const w = (Math.abs(v) / mx) * 50;
      return `<div class="gb ${ctx.follows(p.id) ? 'mine' : ''}" data-an="gbar" data-gid="${esc(p.id)}" data-v="${v}" data-w="${f1(Math.max(v === 0 ? 0.8 : 0, w))}"><span class="pos">${esc(p.pos || '')}</span><span class="nm">${esc(p.name)}</span>
        <span class="tr"><i class="ax"></i><b class="${v < 0 ? 'under' : v > 0 ? 'over' : 'even'}" style="${v < 0 ? `right:50%;width:${w}%` : `left:50%;width:${Math.max(v === 0 ? 0.8 : 0, w)}%`}"></b></span>
        <span class="tp ${v < 0 ? 'under' : ''}">${esc(p.score)}</span><span class="th faint small">${esc(p.thru || '')}</span></div>`; }).join('')}</div></div>`;
}
const holeCls = (rel) => { const n = par(rel); return n == null ? 'par' : n <= -2 ? 'eagle' : n === -1 ? 'birdie' : n === 1 ? 'bogey' : n >= 2 ? 'dbl' : 'par'; };
export function golfHoleStrip(rd, holes) {
  const got = (n) => (rd.holes || []).find((h) => h.n === n); if (!(rd.holes || []).length) return '';
  let cum = 0; const pts = [];
  const n = holes.length || 18;
  const dots = Array.from({ length: n }, (_, i) => { const h = holes[i]; const g = h && got(h.n); if (!g) return `<span class="hd empty" title="Hole ${i + 1}"></span>`; const r = par(g.rel) ?? 0; cum += r; pts.push([i, cum]);
    return `<span class="hd ${holeCls(g.rel)}" title="Hole ${g.n}: ${esc(g.s)} (par ${h.par})">${esc(g.s)}</span>`; }).join('');
  if (pts.length < 2) return `<div class="gx-holes"><span class="rl">R${rd.r}</span><div class="hs">${dots}</div></div>`;
  const lo = Math.min(0, ...pts.map((p) => p[1])); const hi = Math.max(0, ...pts.map((p) => p[1])); const rg = Math.max(2, hi - lo);
  const X = (i) => 4 + (i / (n - 1)) * 192; const Y = (v) => 4 + ((hi - v) / rg) * 32;
  return `<div class="gx-holes"><span class="rl">R${rd.r}</span><div class="hs">${dots}</div>
    <svg viewBox="0 0 200 40" class="flow" role="img" aria-label="Round ${rd.r} score to par through the holes" preserveAspectRatio="none"><line x1="0" x2="200" y1="${Y(0)}" y2="${Y(0)}" class="z"/><path d="${pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i)} ${Y(v)}`).join('')}" class="ln"/>${pts.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="1.8"/>`).join('')}</svg></div>`;
}
export function tennisCourt(d) {
  const ps = d.players || []; if (ps.length < 2) return '';
  const n = Math.max(...ps.map((p) => p.sets.length), 0);
  const sv = ps.findIndex((p) => p.serving) ; const live = d.state === 'in';
  const bars = Array.from({ length: n }, (_, k) => { const a = +ps[0].sets[k]?.g || 0; const b = +ps[1].sets[k]?.g || 0; const t = a + b || 1;
    return `<div class="sf" data-an="sbar" data-sk="set${k}"><span class="lb">Set ${k + 1}</span><span class="b"><i class="${a > b ? 'w' : ''}" data-w="${f1((a / t) * 100)}" style="width:${(a / t) * 100}%"><em>${a}</em></i><i class="${b > a ? 'w' : ''}" data-w="${f1((b / t) * 100)}" style="width:${(b / t) * 100}%"><em>${b}</em></i></span></div>`; }).join('');
  const ball = (i) => (live && sv === i ? `<circle cx="${i === 0 ? 14 : 106}" cy="${i === 0 ? 46 : 14}" r="3" class="tb" data-an="serve" data-srv="${i}"/>` : '');
  const court = `<svg viewBox="0 0 120 60" class="tcourt" role="img" aria-label="Tennis court${sv >= 0 && live ? `, ${ps[sv].name} serving` : ''}"><rect x="6" y="3" width="108" height="54" class="tc"/><rect x="6" y="9" width="108" height="42" class="tc2"/>
    <g class="tl"><rect x="6" y="3" width="108" height="54"/><line x1="6" x2="114" y1="9" y2="9"/><line x1="6" x2="114" y1="51" y2="51"/><line x1="30" x2="30" y1="9" y2="51"/><line x1="90" x2="90" y1="9" y2="51"/><line x1="30" x2="90" y1="30" y2="30"/></g><line x1="60" x2="60" y1="1" y2="59" class="net"/>${ball(0)}${ball(1)}</svg>`;
  return `<div class="card gx gx-tn">${gxHead('Match graphic', live ? 'live' : '', true)}
    <div class="tn-names"><span>${ps[0].flag ? `<img src="${esc(ps[0].flag)}" alt="" width="18" height="12"/> ` : ''}${esc(ps[0].short || ps[0].name)}</span><span>${esc(ps[1].short || ps[1].name)}${ps[1].flag ? ` <img src="${esc(ps[1].flag)}" alt="" width="18" height="12"/>` : ''}</span></div>
    ${court}${bars ? `<div class="gx-setflow">${bars}</div>` : ''}
    <p class="faint small gx-note">${live && sv >= 0 ? `${esc(ps[sv].name)} is serving. ` : ''}Serve and rally placement aren’t in ESPN’s free tennis feed, so the court shows the server and the bars show games per set.</p></div>`;
}
export function racingPodium(comp) {
  const top = (comp && comp.competitors || []).slice(0, 3); if (top.length < 3 || comp.state === 'pre') return '';
  const order = [top[1], top[0], top[2]]; const h = [64, 86, 50]; const place = ['2', '1', '3'];
  return `<div class="card gx gx-race">${gxHead('Podium', comp.state === 'in' ? 'running order' : 'result', true)}<div class="podium">${order.map((c, i) => `<div class="pd p${place[i]}" data-an="pod" data-ak="pod:${place[i]}:${esc(c.id || c.name)}"><div class="who">${c.headshot ? `<img src="${esc(c.headshot)}" alt="" width="34" height="34"/>` : c.flag ? `<img src="${esc(c.flag)}" alt="" width="26" height="18"/>` : ''}<b>${esc(c.short || c.name)}</b></div><div class="blk" data-h="${h[i]}" style="height:${h[i]}px"><span>${place[i]}</span></div></div>`).join('')}</div></div>`;
}
