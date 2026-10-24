// Gamecast: one live game/event screen per sport. Pure render functions (HTML strings) + tiny SVG graphics.
// Tone: numbers and plain play text only — no commentary.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = (n) => (n == null ? '' : `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`);
const fmtWhen = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };
import { fieldInner, FIELD, teamColors, footballPlays, pitchTracker, hockeyShots, basketballShots, soccerShots, golfLeaders, golfHoleStrip, tennisCourt, racingPodium } from './plays.js';
const hex = (c, fb) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : fb);

export const castState = { tab: 'summary', player: null, sport: null, id: null, fp: null, fd: null, ab: null, sf: 'all' };

// ---------- shared pieces ----------
function statusLine(d) {
  if (d.state === 'in') return `<span class="live">LIVE · ${esc(d.detail || '')}</span>`;
  if (d.state === 'post') return `<b>${esc(d.detail || 'Final')}</b>`;
  return `<span>${esc(fmtWhen(d.date))}</span>`;
}
function side(c, d, ctx, align) {
  const t = c.team || {}; const lost = d.state === 'post' && !c.winner && (d.home.winner || d.away.winner);
  return `<a class="gc-team ${align} ${lost ? 'lost' : ''}" href="#/team/${esc(t.id)}">
    <img src="${esc(ctx.logo(t))}" alt="" width="52" height="52" />
    <span class="nm">${c.rank ? `<span class="rk">${c.rank}</span>` : ''}${esc(t.short || t.name)}${ctx.follows(t.id) ? ' <span class="star">●</span>' : ''}</span>
    <span class="rec">${esc(c.record || '')}</span>
    ${c.possession && d.state === 'in' ? '<span class="poss" title="Possession">●</span>' : ''}</a>`;
}
function header(d, ctx) {
  const score = (c) => (d.state === 'pre' ? '' : esc(c.score ?? ''));
  return `<div class="card gc-head">
    ${d.note ? `<div class="gc-note">${esc(d.note)}</div>` : ''}
    <div class="gc-score">${side(d.away, d, ctx, 'l')}
      <div class="gc-mid"><div class="nums"><span class="${d.state === 'post' && !d.away.winner ? 'lo' : ''}">${score(d.away)}</span><span class="dash">${d.state === 'pre' ? 'vs' : '–'}</span><span class="${d.state === 'post' && !d.home.winner ? 'lo' : ''}">${score(d.home)}</span></div>
        <div class="st">${statusLine(d)}</div></div>
      ${side(d.home, d, ctx, 'r')}</div>
    <div class="gc-meta">${[d.venue, d.broadcast && `TV: ${d.broadcast}`, d.attendance && `Att. ${(+d.attendance).toLocaleString()}`].filter(Boolean).map(esc).join(' · ')}</div>${ctx.watch ? ctx.watch(d) : ''}</div>`;
}
function lineScore(d, { min = 4, extra = [] } = {}) {
  const n = Math.max(min, d.home.lines.length, d.away.lines.length);
  if (n > 12) return '';
  if (!d.home.lines.length && !d.away.lines.length) return '';
  const fam = d.family || d.kind;
  const lbl = fam === 'baseball' ? (i) => i + 1
    : fam === 'soccer' ? (i) => (i < 2 ? `${i + 1}H` : i < 4 ? `ET${i - 1}` : 'PK')
    : fam === 'hockey' ? (i) => (i < 3 ? i + 1 : i === 3 ? 'OT' : 'SO')
    : fam === 'basketball' && d.sport && /cbb/.test(d.sport) && n <= 4 && (d.home.lines.length <= 3) ? (i) => (i < 2 ? `${i + 1}H` : i === 2 ? 'OT' : `${i - 1}OT`)
    : (i) => (i < 4 ? i + 1 : i === 4 ? 'OT' : `${i - 3}OT`);
  const row = (c) => `<tr><th>${esc(c.team.abbr)}</th>${Array.from({ length: n }, (_, i) => `<td>${esc(c.lines[i] ?? '')}</td>`).join('')}<td class="tot">${esc(c.score ?? '')}</td>${extra.map((k) => `<td class="tot">${esc(c[k] ?? '')}</td>`).join('')}</tr>`;
  return `<div class="card gc-lines"><div class="scroll-x"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<td>${lbl(i)}</td>`).join('')}<td class="tot">${(d.family || d.kind) === 'baseball' ? 'R' : 'T'}</td>${extra.map((k) => `<td class="tot">${k[0].toUpperCase()}</td>`).join('')}</tr></thead>
    <tbody>${row(d.away)}${row(d.home)}</tbody></table></div></div>`;
}
function wpChart(d, ctx) {
  if (!d.wp || d.wp.home.length < 2) return '';
  const W = 320; const H = 90; const pts = d.wp.home; const n = pts.length - 1;
  const xy = pts.map((v, i) => [(i / n) * W, H - (v / 100) * H]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const hc = hex(d.home.team.color, '#1f6f5c'); const ac = hex(d.away.team.color, '#3b6fd8');
  const cur = d.wp.current; const lead = cur >= 50 ? d.home : d.away; const p = cur >= 50 ? cur : 100 - cur;
  return `<h2>Win probability</h2><div class="card gc-wp">
    <div class="wp-top"><span><img src="${esc(ctx.logo(lead.team))}" alt="" width="20" height="20" /><b>${esc(lead.team.abbr)}</b> ${p.toFixed(1)}%</span><span class="faint small">${d.state === 'post' ? 'final' : 'current'} · ESPN model</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="wp-svg" role="img" aria-label="Win probability chart">
      <defs><clipPath id="wpTop"><rect x="0" y="0" width="${W}" height="${H / 2}"/></clipPath><clipPath id="wpBot"><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
      <path d="${line}L${W},${H / 2}L0,${H / 2}Z" fill="${hc}" opacity=".28" clip-path="url(#wpTop)"/>
      <path d="${line}L${W},${H / 2}L0,${H / 2}Z" fill="${ac}" opacity=".28" clip-path="url(#wpBot)"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
      <path d="${line}" fill="none" class="ln"/></svg>
    <div class="wp-axis"><span>${esc(d.home.team.abbr)} 100%</span><span>50%</span><span>${esc(d.away.team.abbr)} 100%</span></div></div>`;
}
function statCompare(d, ctx) {
  if (!d.stats || !d.stats.length) return '<div class="card empty">Team stats appear once the game starts.</div>';
  const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
  return `<div class="card gc-stats"><div class="hd"><span><img src="${esc(ctx.logo(d.away.team))}" alt="" />${esc(d.away.team.abbr)}</span><span>${esc(d.home.team.abbr)}<img src="${esc(ctx.logo(d.home.team))}" alt="" /></span></div>
    ${d.stats.map((s) => { const a = num(s.away); const h = num(s.home); const t = a + h || 1; const tm = /time|possession/i.test(s.label);
      return `<div class="sr"><b>${esc(s.away)}</b><span>${esc(s.label)}</span><b>${esc(s.home)}</b>${!tm && /\d/.test(s.away) && !/-/.test(s.away) ? `<div class="bar"><i style="width:${(a / t) * 100}%;background:${hex(d.away.team.color, 'var(--muted)')}"></i><i style="width:${(h / t) * 100}%;background:${hex(d.home.team.color, 'var(--accent)')}"></i></div>` : ''}</div>`; }).join('')}</div>`;
}
const tabs = (list) => `<div class="toolbar sticky gc-tabs"><div class="seg" role="tablist">${list.map(([k, l]) => `<button data-gctab="${k}" class="${castState.tab === k ? 'on' : ''}" role="tab" aria-selected="${castState.tab === k}">${l}</button>`).join('')}</div></div>`;
const footer = (d, extra = '') => `${d.state !== 'pre' && castState.tab === 'summary' ? venueCard(d) : ''}<p class="faint small gc-foot">${d.state === 'in' ? 'Updates automatically about every 20 seconds while this screen is open. ' : ''}Data: ESPN public feeds.${extra ? ` ${extra}` : ''} ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">Open on ESPN ↗</a>` : ''}</p>`;
const nf = (n) => Number(n).toLocaleString('en-US');
// Venue facts: name/city/surface/attendance come from ESPN; capacity and year built from Wikipedia/Wikidata (server-verified).
// Unknown capacity / year show N/A; attendance and sellout % are only shown once ESPN reports attendance (live or final).
function venueCard(d) {
  const v = d.venueInfo; if (!v || !v.name) return '';
  const loc = [v.city, v.state].filter(Boolean).join(', ');
  const row = (k, val) => `<div class="r"><span>${k}</span><b>${val}</b></div>`;
  const na = '<span class="faint">N/A</span>';
  const att = d.state !== 'pre' && v.attendance > 0;
  return `<div class="card gc-venue"><div class="vh"><b>${esc(v.name)}</b>${loc ? `<span>${esc(loc)}</span>` : ''}</div>
    ${row('Year built', v.built ? esc(v.built) : na)}${row('Capacity', v.capacity ? nf(v.capacity) : na)}
    ${att ? row(d.state === 'in' ? 'Attendance (so far)' : 'Attendance', nf(v.attendance)) : ''}
    ${att && v.sellout != null ? `${row('Sellout', `${v.sellout.toFixed(1)}%`)}<div class="bar" aria-hidden="true"><i style="width:${Math.min(100, v.sellout)}%"></i></div>${v.sellout > 100 ? '<div class="vsrc">Attendance above listed capacity (standing room / expanded seating).</div>' : ''}` : ''}
    ${v.source ? `<div class="vsrc">Capacity &amp; year: <a href="${esc(v.source)}" target="_blank" rel="noopener noreferrer">Wikipedia</a>${v.attendance && d.state !== 'pre' ? ' · attendance: ESPN' : ''}</div>` : ''}</div>`;
}
function preGame(d, inner = '') {
  return `<div class="card gc-pre"><div class="r"><span>Start</span><b>${esc(fmtWhen(d.date))}</b></div>
    ${d.venue && !d.venueInfo ? `<div class="r"><span>Venue</span><b>${esc(d.venue)}</b></div>` : ''}
    <div class="r"><span>TV</span><b>${esc(d.broadcast || 'Not listed')}</b></div>
    <div class="r"><span>Records</span><b>${esc(d.away.team.abbr)} ${esc(d.away.record || '–')} · ${esc(d.home.team.abbr)} ${esc(d.home.record || '–')}</b></div>${inner}</div>${venueCard(d)}`;
}

// ---------- football ----------
function field(d, ctx) {
  const s = d.situation; if (!s || s.yardsToEndzone == null || !s.possessionSide) return '';
  // Away team attacks to the right, home team to the left (home logo on the 50, red zones tinted).
  const { W, H, EZ: ez, PL: play, MID } = FIELD; const yx = (y) => ez + (y / 100) * play;
  const right = s.possessionSide === 'away';
  const ball = right ? 100 - s.yardsToEndzone : s.yardsToEndzone;
  const dist = Math.min(s.distance || 0, s.yardsToEndzone);
  const gain = right ? ball + dist : ball - dist;
  const off = right ? d.away.team : d.home.team;
  return `<div class="card gc-field">
    <div class="sit"><img src="${esc(ctx.logo(off))}" alt="" width="22" height="22" /><b>${esc(s.text || '')}</b>${s.spot && !(s.text || '').includes(s.spot) ? `<span class="faint">at ${esc(s.spot)}</span>` : ''}${s.redZone ? '<span class="rz">Red zone</span>' : ''}</div>
    <svg viewBox="0 0 ${W} ${H}" class="field-svg" role="img" aria-label="Ball on the field: ${esc(s.text || '')}">
      ${fieldInner(d, ctx)}
      ${dist ? `<rect x="${Math.min(yx(ball), yx(gain))}" y="14" width="${Math.abs(yx(gain) - yx(ball))}" height="${H - 36}" class="togo"/>` : ''}
      <line x1="${yx(ball)}" x2="${yx(ball)}" y1="8" y2="${H - 20}" class="los"/>
      ${dist ? `<line x1="${yx(gain)}" x2="${yx(gain)}" y1="8" y2="${H - 20}" class="ltg"/>` : ''}
      <g transform="translate(${yx(ball)} ${MID})"><ellipse rx="9" ry="5.5" class="ball"/><path d="M-3 0h6" class="lace"/></g>
      <path d="M${yx(ball) + (right ? 14 : -14)} ${MID} l${right ? -6 : 6} -5 v10z" class="dir"/>
    </svg>
    <div class="legend"><span><i class="k los"></i>Line of scrimmage</span>${dist ? '<span><i class="k ltg"></i>Line to gain</span>' : ''}<span><i class="k rzk"></i>Red zone</span><span class="faint">${esc(d.away.team.abbr)} → · ← ${esc(d.home.team.abbr)}</span></div>
    ${s.lastPlay ? `<div class="last"><span class="faint small">Last play</span> ${esc(s.lastPlay)}</div>` : ''}
    ${s.homeTimeouts != null ? `<div class="tos"><span>${esc(d.away.team.abbr)} timeouts ${'●'.repeat(s.awayTimeouts)}${'○'.repeat(Math.max(0, 3 - s.awayTimeouts))}</span><span>${esc(d.home.team.abbr)} timeouts ${'●'.repeat(s.homeTimeouts)}${'○'.repeat(Math.max(0, 3 - s.homeTimeouts))}</span></div>` : ''}</div>`;
}
function fieldCard(d, ctx) {
  const { W, H } = FIELD;
  return `<div class="card gc-field"><svg viewBox="0 0 ${W} ${H}" class="field-svg" role="img" aria-label="Football field, ${esc(d.home.team.name || d.home.team.abbr)} home">${fieldInner(d, ctx)}</svg>
    <div class="legend"><span class="faint">${esc(d.away.team.abbr)} → · ← ${esc(d.home.team.abbr)} (home)</span><span><i class="k rzk"></i>Red zones (20 yd)</span></div></div>`;
}
function scoringList(d, ctx) {
  if (!d.scoring.length) return '';
  const byQ = {}; for (const p of d.scoring) (byQ[p.period] = byQ[p.period] || []).push(p);
  return `<h2>Scoring summary</h2><div class="card panel gc-scoring">${Object.entries(byQ).map(([q, ps]) => `<div class="qh">${+q <= 4 ? `${ord(+q)} quarter` : 'Overtime'}</div>${ps.map((p) => {
    const t = [d.home, d.away].find((x) => x.team.id === p.teamId);
    return `<div class="sp"><img src="${esc(t ? ctx.logo(t.team) : '')}" alt="" width="22" height="22" /><div><b>${esc(p.type || '')}</b> <span class="faint small">${esc(p.clock || '')}</span><div class="small">${esc(p.text)}</div></div><span class="sc">${esc(p.away)}–${esc(p.home)}</span></div>`; }).join('')}`).join('')}</div>`;
}
function drives(d, ctx) {
  if (!d.drives || !d.drives.length) return '<div class="card empty">No drives yet.</div>';
  return `<div class="gc-drives">${d.drives.map((x, i) => {
    const t = [d.home, d.away].find((s) => s.team.id === x.teamId);
    return `<details class="card drive ${x.score ? 'scored' : ''}" ${i === 0 && (x.current || d.state === 'in') ? 'open' : ''}>
      <summary><img src="${esc(t ? ctx.logo(t.team) : '')}" alt="" width="24" height="24" /><span class="dt"><b>${esc(x.result || '')}</b>${x.current ? ' <span class="live small">· now</span>' : ''}<small>${esc(x.description || '')}${x.start ? ` · from ${esc(x.start)}` : ''}</small></span><span class="faint small">${x.period ? `Q${x.period}` : ''} ${esc(x.clock || '')}</span></summary>
      <ol class="plays">${x.plays.slice().reverse().map((p) => `<li class="${p.score ? 'scored' : ''}">${p.dd ? `<span class="dd">${esc(p.dd)}</span>` : ''}${esc(p.text)}</li>`).join('')}</ol></details>`;
  }).join('')}</div>`;
}
function leaders(d, ctx) {
  if (!d.leaders || !d.leaders.length || d.state === 'pre') return '';
  return `<h2>Leaders</h2><div class="gc-leaders">${d.leaders.map((tm) => { const t = [d.home, d.away].find((s) => s.team.id === tm.teamId);
    return `<div class="card"><div class="lh"><img src="${esc(t ? ctx.logo(t.team) : '')}" alt="" width="20" height="20" /><b>${esc(tm.abbr)}</b></div>${tm.cats.slice(0, 3).map((c) => `<div class="r"><span class="faint small">${esc(c.cat)}</span><b>${c.id ? `<a href="#/player/${esc(c.id)}">${esc(c.name)}</a>` : esc(c.name)}</b><span class="small">${esc(c.line)}</span></div>`).join('')}</div>`; }).join('')}</div>`;
}
function footballCast(d, ctx) {
  let body = '';
  if (d.state === 'pre') body = fieldCard(d, ctx) + preGame(d) + `<p class="muted small">Down & distance, drives, win probability and team stats appear here once the game kicks off.</p>`;
  else if (castState.tab === 'plays') body = drives(d, ctx);
  else if (castState.tab === 'stats') body = statCompare(d, ctx) + leaders(d, ctx);
  else if (castState.tab === 'box') body = boxTables(d, ctx);
  else body = (d.state === 'in' ? field(d, ctx) : '') + footballPlays(d, castState, ctx) + lineScore(d) + wpChart(d, ctx) + scoringList(d, ctx) + (d.state === 'post' ? leaders(d, ctx) : '');
  return header(d, ctx) + (d.state === 'pre' ? '' : tabs([['summary', 'Summary'], ['plays', 'Drives'], ['stats', 'Team stats'], ['box', 'Box score']])) + body
    + footer(d, d.state === 'in' ? 'Field graphic is schematic (away team attacks right).' : '');
}

// ---------- baseball ----------
function diamond(s) {
  const base = (x, y, on) => `<rect x="${x - 11}" y="${y - 11}" width="22" height="22" transform="rotate(45 ${x} ${y})" class="base ${on ? 'on' : ''}"/>`;
  return `<svg viewBox="0 0 120 100" class="diamond" role="img" aria-label="Runners: ${[s.on1 && 'first', s.on2 && 'second', s.on3 && 'third'].filter(Boolean).join(', ') || 'bases empty'}">
    <path d="M60 88 L98 50 L60 12 L22 50 Z" class="path"/>${base(98, 50, s.on1)}${base(60, 14, s.on2)}${base(22, 50, s.on3)}<path d="M53 82h14l-7 8z" class="plate"/></svg>`;
}
const dots = (n, max, cls) => Array.from({ length: max }, (_, i) => `<i class="${i < n ? `on ${cls}` : ''}"></i>`).join('');
function baseballCast(d, ctx) {
  let body = '';
  const s = d.situation;
  if (d.state === 'pre') {
    const pr = (d.probables || []).slice().sort((a) => (a.side === 'away' ? -1 : 1)).map((p) => `<div class="r"><span>${esc((p.side === 'home' ? d.home : d.away).team.abbr)} probable</span><b>${esc(p.name)}${p.line ? ` <span class="faint small">${esc(p.line)}</span>` : ''}</b></div>`).join('');
    body = preGame(d, pr) + '<p class="muted small">Count, outs, runners, pitcher vs. batter and play-by-play appear here once the first pitch is thrown.</p>';
  } else if (castState.tab === 'plays') {
    body = d.plays.length ? `<div class="gc-innings">${d.plays.map((h, i) => `<details class="card inning" ${i < 2 ? 'open' : ''}><summary><b>${esc(h.label)}</b><span class="faint small">${h.items.length} plays</span></summary><ol class="plays">${h.items.map((p) => `<li class="${p.score ? 'scored' : ''}">${esc(p.text)}${p.score ? ` <b class="small">${esc(d.away.team.abbr)} ${p.away}, ${esc(d.home.team.abbr)} ${p.home}</b>` : ''}</li>`).join('')}</ol></details>`).join('')}</div>` : '<div class="card empty">No plays yet.</div>';
  } else if (castState.tab === 'stats') {
    body = statCompare(d, ctx) + (d.box && d.box.length ? boxTables(d, ctx) : (d.pitchers || []).map((t) => `<h2>${esc(t.abbr)} pitching</h2>`).join(''));
  } else {
    if (d.state === 'in' && s) {
      body += `<div class="card gc-bases">${diamond(s)}
        <div class="count"><div><span>B</span>${dots(s.balls, 4, 'b')}</div><div><span>S</span>${dots(s.strikes, 3, 's')}</div><div><span>O</span>${dots(s.outs, 3, 'o')}</div></div>
        <div class="pb">${s.pitcher ? `<div><span class="faint small">Pitching</span><b>${esc(s.pitcher.name)}</b>${s.pitcher.line ? `<small>${esc(s.pitcher.line)}</small>` : ''}</div>` : ''}${s.batter ? `<div><span class="faint small">At bat</span><b>${esc(s.batter.name)}</b>${s.batter.line ? `<small>${esc(s.batter.line)}</small>` : ''}</div>` : ''}</div>
        ${s.lastPlay ? `<div class="last"><span class="faint small">Last play</span> ${esc(s.lastPlay)}</div>` : ''}
        ${s.runnersKnown ? '' : '<div class="faint small">Runner positions unavailable right now.</div>'}</div>`;
    }
    body += pitchTracker(d, castState) + lineScore(d, { min: 9, extra: ['hits', 'errors'] }) + wpChart(d, ctx);
    if (d.scoring && d.scoring.length) body += `<h2>Scoring plays</h2><div class="card panel gc-scoring">${d.scoring.slice().reverse().map((p) => `<div class="sp"><span class="faint small inn">${esc(p.inning)}</span><div class="small">${esc(p.text)}</div><span class="sc">${p.away}–${p.home}</span></div>`).join('')}</div>`;
  }
  return header(d, ctx) + (d.state === 'pre' ? '' : tabs([['summary', 'Summary'], ['plays', 'Play-by-play'], ['stats', 'Box score']])) + body + footer(d);
}

// ---------- golf ----------
function scorecard(d, pid, ctx) {
  const p = d.players.find((x) => x.id === pid); if (!p) return '';
  const card = (d.cards || {})[pid] || [];
  const holes = d.holes || [];
  const cls = (rel) => (rel === '-2' || /^-[2-9]/.test(rel) ? 'eagle' : rel === '-1' ? 'birdie' : rel === '+1' ? 'bogey' : /^\+[2-9]/.test(rel) ? 'dbl' : '');
  const nine = (rd, from) => {
    const hs = holes.slice(from, from + 9); if (!hs.length) return '';
    const got = (n) => rd.holes.find((h) => h.n === n);
    const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
    return `<table class="sc-tbl"><thead><tr><th>Hole</th>${hs.map((h) => `<td>${h.n}</td>`).join('')}<td>${from ? 'In' : 'Out'}</td></tr></thead><tbody>
      <tr class="par"><th>Par</th>${hs.map((h) => `<td>${h.par}</td>`).join('')}<td>${sum(hs.map((h) => h.par))}</td></tr>
      <tr><th>R${rd.r}</th>${hs.map((h) => { const g = got(h.n); return `<td>${g ? `<span class="${cls(g.rel)}">${g.s}</span>` : ''}</td>`; }).join('')}<td><b>${sum(hs.map((h) => (got(h.n) || {}).s)) || ''}</b></td></tr></tbody></table>`;
  };
  const rounds = card.filter((r) => r.holes && r.holes.length).reverse();
  return `<div class="gc-card"><div class="pc-head"><img src="${esc(p.flag)}" alt="" width="22" height="16" /><b>${esc(p.name)}</b><span class="faint small">${esc(p.country || '')}</span><a class="btn small ghost" href="#/player/${esc(p.id)}">Season & schedule ›</a>
      <button class="btn small ${ctx.follows(p.id) ? 'primary' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag)}">${ctx.follows(p.id) ? '✓ Following' : '+ Follow'}</button></div>
    <div class="pc-sum"><span>Pos <b>${esc(p.pos || '–')}</b></span><span>Total <b>${esc(p.score)}</b></span><span>Today <b>${esc(p.today || '–')}</b></span><span>Thru <b>${esc(p.thru || '–')}</b></span>${p.rounds.map((r) => `<span>R${r.r} <b>${r.strokes ?? '–'}</b></span>`).join('')}</div>
    ${rounds.length ? rounds.map((rd) => `<div class="scroll-x">${nine(rd, 0)}${nine(rd, 9)}</div>${golfHoleStrip(rd, holes)}`).join('') : '<p class="faint small">No hole-by-hole scores yet.</p>'}
    <div class="sc-key"><span><i class="birdie"></i>Birdie</span><span><i class="eagle"></i>Eagle or better</span><span><i class="bogey"></i>Bogey</span><span><i class="dbl"></i>Double+</span></div></div>`;
}
export function golfRow(p, ctx, open) {
  return `<button class="lb-row ${ctx.follows(p.id) ? 'mine' : ''} ${p.cut ? 'cut' : ''} ${open ? 'open' : ''}" data-golfer="${esc(p.id)}" aria-expanded="${!!open}">
    <span class="pos">${esc(p.pos || '–')}</span><img src="${esc(p.flag)}" alt="" width="20" height="14" loading="lazy" />
    <span class="nm">${esc(p.name)}${ctx.follows(p.id) ? ' <span class="star">●</span>' : ''}</span>
    <span class="tp ${String(p.score).startsWith('-') ? 'under' : ''}">${esc(p.score)}</span><span class="td">${esc(p.today || '')}</span>
    <span class="rds">${[1, 2, 3, 4].map((n) => { const r = (p.rounds || []).find((x) => x.r === n); return `<i>${r ? esc(r.strokes) : ''}</i>`; }).join('')}</span>
    <span class="th">${p.state === 'pre' && p.teeTime ? new Date(p.teeTime).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : esc(p.thru || '')}</span></button>`;
}
function golfCast(d, ctx) {
  const mine = d.players.filter((p) => ctx.follows(p.id));
  const mf = (p) => !ctx.muted(p.id);
  const row = (p) => golfRow(p, ctx, castState.player === p.id) + (castState.player === p.id ? scorecard(d, p.id, ctx) : '');
  let cutShown = false;
  const rows = d.players.filter(mf).map((p) => { let pre = ''; if (p.cut && !cutShown) { cutShown = true; pre = '<div class="cut-line">Projected / official cut</div>'; } return pre + row(p); }).join('');
  return `<div class="card gc-head golf"><div class="gc-note">${esc(d.tour)} Tour</div><h1 class="ev">${esc(d.name)}</h1>
      <div class="st">${d.state === 'in' ? `<span class="live">LIVE · ${esc(d.detail)}</span>` : `<b>${esc(d.detail || '')}</b>`}</div>
      <div class="gc-meta">${[d.course, d.par && `Par ${d.par}`, d.purse && `Purse ${d.purse}`, d.cut && d.cut.score != null && `Cut ${d.cut.score > 0 ? '+' : ''}${d.cut.score === 0 ? 'E' : d.cut.score}`].filter(Boolean).map(esc).join(' · ')}</div></div>${ctx.watch ? ctx.watch(d) : ''}</div>
    ${golfLeaders(d, ctx)}
    ${mine.length ? `<h2>Your players</h2><div class="card lb">${mine.map(row).join('')}</div>` : ''}
    <h2>Leaderboard <span class="count">${d.players.length}</span></h2>
    <div class="card lb"><div class="lb-row hd"><span class="pos">Pos</span><span></span><span class="nm">Player</span><span class="tp">Total</span><span class="td">Today</span><span class="rds"><i>R1</i><i>R2</i><i>R3</i><i>R4</i></span><span class="th">Thru</span></div>${rows}</div>
    <p class="faint small">Round-by-round strokes in R1–R4. Tap a player for the hole-by-hole scorecard and a link to their season.</p>${footer(d, 'Golf: no live shot tracking or world ranking in the free feed.')}`;
}

// ---------- tennis ----------
export function tennisMatch(m, ctx, { big = false } = {}) {
  const n = Math.max(...m.players.map((p) => p.sets.length), 0);
  const row = (p, i) => {
    const o = m.players[1 - i];
    return `<div class="tm-row ${m.state === 'post' && !p.winner ? 'lost' : ''}">
      <span class="sv">${p.serving && m.state === 'in' ? '<i title="Serving"></i>' : ''}</span>
      ${p.flag ? `<img src="${esc(p.flag)}" alt="" width="20" height="14" loading="lazy" />` : '<span></span>'}
      <span class="nm">${p.seed ? `<span class="seed">${p.seed}</span>` : ''}${esc(big ? p.name : (p.short || p.name))}${ctx.follows(p.id) ? ' <span class="star">●</span>' : ''}${p.winner ? ' <span class="win">✓</span>' : ''}</span>
      ${Array.from({ length: n }, (_, k) => { const s = p.sets[k]; const os = o && o.sets[k]; const won = s && os && s.won; return `<span class="set ${won ? 'w' : ''}">${s ? esc(s.g) : ''}${s && s.tb != null ? `<sup>${esc(s.tb)}</sup>` : ''}</span>`; }).join('')}</div>`;
  };
  const st = m.state === 'in' ? `<span class="live">LIVE</span>` : m.state === 'post' ? `<b>${esc(m.detail || 'Final')}</b>` : `<span>${new Date(m.date).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>`;
  return `<div class="card tmatch ${big ? 'big' : ''}" ${big ? '' : `data-game="#/game/tennis/${esc(m.id)}"`} role="${big ? '' : 'link'}" tabindex="${big ? -1 : 0}">
    <div class="status">${st}<span>${esc(m.round || '')}</span></div>${m.players.map(row).join('')}
    ${!big && m.court ? `<div class="meta">${esc(m.court)}</div>` : ''}${!big && ctx.watch ? ctx.watch({ ...m, sport: 'tennis' }, { compact: true }) : ''}</div>`;
}
function tennisCast(d, ctx) {
  const ps = d.players;
  const extra = d.state === 'pre' ? `<div class="card gc-pre"><div class="r"><span>Scheduled</span><b>${esc(fmtWhen(d.date))}</b></div>${d.court ? `<div class="r"><span>Court</span><b>${esc(d.court)}</b></div>` : ''}</div>` : '';
  return `<div class="card gc-head tennis"><div class="gc-note">${esc(d.tour)} · ${esc(d.tournament)}</div>
      <div class="gc-meta">${[d.draw, d.round, d.court, d.venue].filter(Boolean).map(esc).join(' · ')}</div>${ctx.watch ? ctx.watch(d) : ''}</div>
    ${tennisMatch(d, ctx, { big: true })}
    ${tennisCourt(d)}
    ${d.note ? `<div class="card gc-note2">${esc(d.note)}</div>` : ''}
    ${d.state === 'in' ? `<div class="card gc-serve"><i></i>${esc((ps.find((p) => p.serving) || {}).name || 'Server not reported')}${ps.some((p) => p.serving) ? ' is serving' : ''}</div>` : ''}
    ${extra}
    <div class="card gc-pre">${ps.map((p) => `<div class="r"><span>${p.flag ? `<img src="${esc(p.flag)}" alt="" width="18" height="12" /> ` : ''}<a href="#/player/${esc(p.id)}">${esc(p.name)}</a></span><b>${p.seed ? `Seed ${p.seed}` : 'Unseeded'}${p.country ? ` · ${esc(p.country)}` : ''}</b>
      <button class="btn small ${ctx.follows(p.id) ? 'primary' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag || '')}">${ctx.follows(p.id) ? '✓ Following' : '+ Follow'}</button></div>`).join('')}</div>
    <p class="muted small">Point-by-point score and match stats (aces, break points) aren’t in ESPN’s free tennis feed — set scores, the server and results only.</p>
    ${d.related && d.related.length ? `<h2>${esc(d.round || 'Same round')}</h2><div class="grid">${d.related.map((m) => tennisMatch(m, ctx)).join('')}</div>` : ''}
    ${footer(d)}`;
}


// ---------- generic team sports (basketball, hockey, soccer …) ----------
const PERIOD = { basketball: 'Quarter', hockey: 'Period', soccer: 'Half' };
function playerFollow(p, ctx, cls = 'pf') {
  const on = ctx.follows(p.id);
  return `<button class="${cls} ${on ? 'on' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.full || p.name)}" data-pflag="${esc(p.headshot || '')}" data-pteam="${esc(p.teamId || '')}" aria-pressed="${on}" title="${on ? 'Unfollow' : 'Follow'} ${esc(p.full || p.name)}">${on ? '★' : '☆'}</button>`;
}
function boxTables(d, ctx) {
  if (!d.box || !d.box.length) return '<div class="card empty">Box score appears once the game starts.</div>';
  const P = (r) => (r.id ? `<a href="#/player/${esc(r.id)}">${esc(r.name)}</a>` : esc(r.name));
  return `<p class="faint small">Tap a name for that player’s season and career stats.</p>` + d.box.map((t) => { const side = t.side === 'home' ? d.home : d.away;
    return `<h2 class="box-h">${side && side.team ? `<img src="${esc(ctx.logo(side.team))}" alt="" width="22" height="22" />` : ''}${esc(t.abbr)} box score</h2>${t.groups.map((g) => `<div class="card scroll-x box-card"><table class="tbl box"><thead><tr><th>${esc(cap(g.name) || 'Player')}</th>${g.labels.map((l, i) => `<td title="${esc((g.descs || [])[i] || l)}">${esc(l)}</td>`).join('')}</tr></thead>
    <tbody>${g.rows.map((r) => { const mine = ctx.follows(r.id); return `<tr class="${mine ? 'mine' : ''} ${r.starter ? '' : 'bench'}"><th><span class="pn">${playerFollow({ ...r, teamId: t.teamId }, ctx)}<span>${P(r)}${r.pos ? ` <small class="faint">${esc(r.pos)}</small>` : ''}</span></span></th>${r.stats.map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`; }).join('')}
    ${g.totals && g.totals.some((v) => v !== '' && v != null) ? `<tr class="tot"><th>Team</th>${g.totals.map((v) => `<td><b>${esc(v)}</b></td>`).join('')}</tr>` : ''}</tbody></table></div>`).join('')}`; }).join('');
}
const cap = (x) => (x ? x[0].toUpperCase() + x.slice(1) : '');
function lineups(d, ctx) {
  if (!d.lineups || !d.lineups.length) return '';
  return `<h2>Lineups</h2><div class="lu-grid">${d.lineups.map((t) => { const side = t.side === 'home' ? d.home : d.away;
    const xi = t.players.filter((p) => p.starter); const subs = t.players.filter((p) => !p.starter);
    const row = (p) => `<div class="lu-row ${ctx.follows(p.id) ? 'mine' : ''}"><span class="jn">${esc(p.jersey || '')}</span><span class="nm">${esc(p.name)}${p.pos ? ` <small class="faint">${esc(p.pos)}</small>` : ''}${p.subbedIn ? ' <small class="sub-in">↑ on</small>' : ''}</span>${playerFollow({ ...p, teamId: t.teamId }, ctx)}</div>`;
    return `<div class="card lu"><div class="lh"><img src="${esc(ctx.logo(side.team))}" alt="" width="22" height="22" /><b>${esc(side.team.short || side.team.name)}</b>${t.formation ? `<span class="chip sm">${esc(t.formation)}</span>` : ''}</div>
      ${xi.map(row).join('')}${subs.length ? `<div class="lu-sub">Substitutes</div>${subs.map(row).join('')}` : ''}</div>`; }).join('')}</div>`;
}
function playList(d, ctx, list, empty) {
  if (!list || !list.length) return `<div class="card empty">${empty}</div>`;
  const fam = d.family; let last = null; let out = '';
  for (const p of list) {
    const lab = p.periodLabel || (fam === 'soccer' ? (p.period > 2 ? 'Extra time' : `${ord(p.period)} half`) : `${ord(p.period)} ${PERIOD[fam] || 'period'}`.toLowerCase());
    if (lab !== last) { out += `<div class="qh">${esc(cap(lab))}</div>`; last = lab; }
    const t = [d.home, d.away].find((x) => x.team.id === p.teamId);
    const mine = (p.ath || []).some((id) => ctx.follows(id)) || (t && ctx.follows(t.team.id));
    out += `<div class="sp ${p.score ? 'scored' : ''} ${mine ? 'mine' : ''}">${t ? `<img src="${esc(ctx.logo(t.team))}" alt="" width="20" height="20" />` : '<span></span>'}<div><span class="faint small">${esc(p.clock || '')}</span>${p.type && fam === 'soccer' ? ` <b class="small">${esc(p.type)}</b>` : ''}<div class="small">${esc(p.text)}</div></div><span class="sc">${p.score && p.away != null ? `${esc(p.away)}–${esc(p.home)}` : ''}</span></div>`;
  }
  return `<div class="card panel gc-scoring gc-plays">${out}</div>`;
}
function leadersG(d, ctx) {
  if (!d.leaders || !d.leaders.length || d.state === 'pre') return '';
  return `<h2>Leaders</h2><div class="gc-leaders">${d.leaders.map((tm) => { const t = [d.home, d.away].find((s) => s.team.id === tm.teamId);
    return `<div class="card"><div class="lh"><img src="${esc(t ? ctx.logo(t.team) : '')}" alt="" width="20" height="20" /><b>${esc(tm.abbr)}</b></div>${tm.cats.slice(0, 3).map((c) => `<div class="r ${c.id && ctx.follows(c.id) ? 'mine' : ''}"><span class="faint small">${esc(c.cat)}</span><b>${c.id ? `<a href="#/player/${esc(c.id)}">${esc(c.name)}</a>` : esc(c.name)}${c.id && ctx.follows(c.id) ? ' <span class="star">★</span>' : ''}</b><span class="small">${esc(c.line)}</span></div>`).join('')}</div>`; }).join('')}</div>`;
}
function yourPlayers(d, ctx) {
  const rows = [];
  for (const t of d.box || []) for (const g of t.groups) for (const r of g.rows) if (ctx.follows(r.id)) rows.push({ t, g, r });
  if (!rows.length) return '';
  return `<h2>Your players</h2><div class="card panel">${rows.map(({ t, g, r }) => `<div class="yp"><img src="${esc(r.headshot || '')}" alt="" width="40" height="40" class="hs" loading="lazy" /><div><b>${esc(r.full || r.name)}</b> <span class="faint small">${esc(t.abbr)}${r.pos ? ` · ${esc(r.pos)}` : ''}</span>
    <div class="ypl">${g.labels.map((l, i) => `<span><small>${esc(l)}</small>${esc(r.stats[i] ?? '')}</span>`).join('')}</div></div></div>`).join('')}</div>`;
}
function genericCast(d, ctx) {
  const fam = d.family; let body = '';
  const soccer = fam === 'soccer';
  if (d.state === 'pre') body = preGame(d) + (soccer ? lineups(d, ctx) : '') + `<p class="muted small">Live score, ${soccer ? 'key events, lineups' : 'play-by-play, box score'} and team stats appear here once the game starts.</p>`;
  else if (castState.tab === 'plays') body = playList(d, ctx, d.plays, 'No plays yet.');
  else if (castState.tab === 'stats') body = statCompare(d, ctx) + (soccer ? lineups(d, ctx) : boxTables(d, ctx));
  else {
    const sc = soccer || fam === 'hockey' ? playList(d, ctx, d.scoring.slice().reverse(), '') : '';
    const gfx = fam === 'hockey' ? hockeyShots(d, castState) : fam === 'basketball' ? basketballShots(d, castState) : soccer ? soccerShots(d, castState) : '';
    body = yourPlayers(d, ctx) + lineScore(d, { min: soccer ? 2 : fam === 'hockey' ? 3 : (d.home.lines.length === 2 ? 2 : 4) }) + gfx + wpChart(d, ctx)
      + (sc && d.scoring.length ? `<h2>${soccer ? 'Goals' : 'Scoring'}</h2>${sc}` : '') + leadersG(d, ctx);
  }
  const tl = soccer ? [['summary', 'Summary'], ['plays', 'Key events'], ['stats', 'Stats & lineups']] : [['summary', 'Summary'], ['plays', 'Play-by-play'], ['stats', 'Box score']];
  return header(d, ctx) + (d.state === 'pre' ? '' : tabs(tl)) + body + footer(d, 'Tap ☆ next to a player to follow them.');
}

// ---------- event sports: fight cards (UFC) and race weekends (F1, NASCAR, IndyCar) ----------
function compRow(c, comp, ctx, fam, i) {
  const on = ctx.follows(c.id);
  const right = fam === 'racing' ? `<span class="pos">${c.order != null && comp.state !== 'pre' ? `P${esc(c.order)}` : ''}</span>` : `<span class="rec">${esc(c.record || '')}</span>`;
  return `<div class="ev-row ${on ? 'mine' : ''} ${comp.state === 'post' && fam === 'mma' && !c.winner ? 'lost' : ''}">${fam === 'racing' ? right : ''}
    ${c.headshot ? `<img src="${esc(c.headshot)}" alt="" class="hs" width="28" height="28" loading="lazy" />` : c.flag ? `<img src="${esc(c.flag)}" alt="" class="flag" width="22" height="15" loading="lazy" />` : '<span></span>'}
    <span class="nm"><b>${esc(c.name)}</b>${c.winner && fam === 'mma' ? ' <span class="win">W</span>' : ''}${c.team ? ` <small class="faint">${esc(c.team)}</small>` : ''}</span>
    ${fam === 'racing' ? '' : right}
    <button class="pf ${on ? 'on' : ''}" data-pfollow="${esc(c.id)}" data-pname="${esc(c.name)}" data-pflag="${esc(c.headshot || c.flag || '')}" aria-pressed="${on}" title="${on ? 'Unfollow' : 'Follow'} ${esc(c.name)}">${on ? '★' : '☆'}</button></div>`;
}
function compStatus(comp) {
  if (comp.state === 'in') return `<span class="live">LIVE${comp.detail ? ` · ${esc(comp.detail)}` : ''}</span>`;
  if (comp.state === 'post') return `<b>${esc(comp.result || comp.detail || 'Final')}${comp.round ? ` · R${esc(comp.round)}${comp.clock ? ` ${esc(comp.clock)}` : ''}` : ''}</b>`;
  return `<span>${esc(fmtWhen(comp.date))}</span>`;
}
export function eventCard(e, ctx, { n = 4 } = {}) {
  const fam = e.family; const mine = (c) => c.competitors.some((x) => ctx.follows(x.id));
  const comps = e.comps || [];
  let body;
  if (fam === 'mma') {
    const pick = [...comps.filter(mine), ...comps.filter((c) => !mine(c))].slice(0, n);
    body = pick.map((c) => `<div class="ev-bout"><div class="status small">${compStatus(c)}<span>${esc(c.label || '')}</span></div>${c.competitors.map((x, i) => compRow(x, c, ctx, fam, i)).join('')}</div>`).join('');
  } else {
    const c = comps.find((x) => x.state === 'in') || [...comps].reverse().find((x) => x.state === 'post') || comps[comps.length - 1];
    const list = c ? c.competitors : [];
    const top = [...list.filter((x) => ctx.follows(x.id)), ...list.filter((x) => !ctx.follows(x.id)).slice(0, n)];
    body = c ? `<div class="status small">${compStatus(c)}<span>${esc(c.label || '')}</span></div>${top.map((x, i) => compRow(x, c, ctx, fam, i)).join('') || '<div class="faint small">Entry list not posted yet.</div>'}` : '';
  }
  const st = e.state === 'in' ? `<span class="live">LIVE</span>` : e.state === 'post' ? '<b>Final</b>' : `<span>${esc(new Date(e.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))}</span>`;
  return `<div class="card ev-card ${comps.some(mine) ? 'mine' : ''}" data-game="#/game/${esc(e.sport)}/${esc(e.id)}" role="link" tabindex="0">
    <div class="status">${st}<span>${esc(e.circuit || e.venue || '')}</span></div><div class="tc-name">${esc(e.name)}</div>
    ${body}${ctx.watch ? ctx.watch(e, { compact: true }) : ''}<div class="meta"><span class="gc-go">${fam === 'mma' ? 'Full card' : 'All sessions & results'} ›</span></div></div>`;
}
function eventCast(d, ctx) {
  const fam = d.family; const comps = d.comps || [];
  let body = '';
  if (fam === 'mma') {
    body = `<h2>Fight card <span class="count">${comps.length}</span></h2>` + comps.map((c, i) => `<div class="card ev-bout big ${c.competitors.some((x) => ctx.follows(x.id)) ? 'mine' : ''}"><div class="status">${compStatus(c)}<span>${i === 0 ? 'Main event · ' : ''}${esc(c.label || '')}</span></div>${c.competitors.map((x, k) => compRow(x, c, ctx, fam, k)).join('')}</div>`).join('');
  } else {
    if (!castState.player || !comps.find((c) => c.id === castState.player)) { const c = comps.find((x) => x.state === 'in') || [...comps].reverse().find((x) => x.state === 'post') || comps[0]; castState.player = c ? c.id : null; }
    const c = comps.find((x) => x.id === castState.player);
    body = (comps.length > 1 ? `<div class="toolbar sticky gc-tabs"><div class="seg">${comps.map((x) => `<button data-golfer="${esc(x.id)}" class="${x.id === castState.player ? 'on' : ''}">${esc(x.label || 'Session')}${x.state === 'in' ? ' •' : ''}</button>`).join('')}</div></div>` : '')
      + (c && fam === 'racing' ? racingPodium(c) : '') + (c ? `<div class="card panel ev-results"><div class="status">${compStatus(c)}<span>${esc(c.venue || '')}</span></div>${c.competitors.map((x, i) => compRow(x, c, ctx, fam, i)).join('') || `<div class="empty">${c.state === 'pre' ? 'Starting order appears once the session is set.' : 'No results posted.'}</div>`}</div>` : '<div class="card empty">No sessions listed.</div>');
  }
  return `<div class="card gc-head event"><div class="gc-note">${esc(d.circuit || '')}</div><h1 class="ev">${esc(d.name)}</h1>
    <div class="st">${d.state === 'in' ? '<span class="live">LIVE</span>' : `<b>${esc(d.state === 'post' ? 'Final' : fmtWhen(d.date))}</b>`}</div>
    <div class="gc-meta">${[d.venue].filter(Boolean).map(esc).join(' · ')}</div>${ctx.watch ? ctx.watch(d) : ''}</div>${body}
    ${footer(d, fam === 'racing' ? 'Racing: running order and results only; lap times and gaps aren’t in the free feed.' : 'MMA: results show round and time; judges’ scores aren’t in the free feed.')}`;
}

export function renderGamecast(d, ctx) {
  if (d.kind === 'football') return footballCast(d, ctx);
  if (d.kind === 'baseball') return baseballCast(d, ctx);
  if (d.kind === 'golf') return golfCast(d, ctx);
  if (d.kind === 'tennis') return tennisCast(d, ctx);
  if (d.kind === 'generic') return genericCast(d, ctx);
  if (d.kind === 'event') return eventCast(d, ctx);
  return '<div class="empty">Unsupported event.</div>';
}
export function castTitle(d) {
  if (d.kind === 'golf' || d.kind === 'event') return d.short || d.name;
  if (d.kind === 'tennis') return d.players.map((p) => p.short || p.name).join(' vs ');
  return `${d.away.team.abbr} @ ${d.home.team.abbr}`;
}
