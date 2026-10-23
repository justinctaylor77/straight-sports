// Gamecast: one live game/event screen per sport. Pure render functions (HTML strings) + tiny SVG graphics.
// Tone: numbers and plain play text only — no commentary.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ord = (n) => (n == null ? '' : `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) ? 0 : (n % 10 < 4 ? n % 10 : 0)]}`);
const fmtWhen = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };
const hex = (c, fb) => (c && /^[0-9a-f]{6}$/i.test(c) ? `#${c}` : fb);

export const castState = { tab: 'summary', player: null, sport: null, id: null };

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
    <div class="gc-meta">${[d.venue, d.broadcast && `TV: ${d.broadcast}`, d.attendance && `Att. ${(+d.attendance).toLocaleString()}`].filter(Boolean).map(esc).join(' · ')}</div></div>`;
}
function lineScore(d, { min = 4, extra = [] } = {}) {
  const n = Math.max(min, d.home.lines.length, d.away.lines.length);
  if (!d.home.lines.length && !d.away.lines.length) return '';
  const lbl = d.kind === 'baseball' ? (i) => i + 1 : (i) => (i < 4 ? i + 1 : i === 4 ? 'OT' : `${i - 3}OT`);
  const row = (c) => `<tr><th>${esc(c.team.abbr)}</th>${Array.from({ length: n }, (_, i) => `<td>${esc(c.lines[i] ?? '')}</td>`).join('')}<td class="tot">${esc(c.score ?? '')}</td>${extra.map((k) => `<td class="tot">${esc(c[k] ?? '')}</td>`).join('')}</tr>`;
  return `<div class="card gc-lines"><div class="scroll-x"><table><thead><tr><th></th>${Array.from({ length: n }, (_, i) => `<td>${lbl(i)}</td>`).join('')}<td class="tot">${d.kind === 'baseball' ? 'R' : 'T'}</td>${extra.map((k) => `<td class="tot">${k[0].toUpperCase()}</td>`).join('')}</tr></thead>
    <tbody>${row(d.away)}${row(d.home)}</tbody></table></div></div>`;
}
function wpChart(d) {
  if (!d.wp || d.wp.home.length < 2) return '';
  const W = 320; const H = 90; const pts = d.wp.home; const n = pts.length - 1;
  const xy = pts.map((v, i) => [(i / n) * W, H - (v / 100) * H]);
  const line = xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  const hc = hex(d.home.team.color, '#1f6f5c'); const ac = hex(d.away.team.color, '#3b6fd8');
  const cur = d.wp.current; const lead = cur >= 50 ? d.home : d.away; const p = cur >= 50 ? cur : 100 - cur;
  return `<h2>Win probability</h2><div class="card gc-wp">
    <div class="wp-top"><span><img src="${esc(lead.team.logo)}" alt="" width="20" height="20" /><b>${esc(lead.team.abbr)}</b> ${p.toFixed(1)}%</span><span class="faint small">${d.state === 'post' ? 'final' : 'current'} · ESPN model</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="wp-svg" role="img" aria-label="Win probability chart">
      <defs><clipPath id="wpTop"><rect x="0" y="0" width="${W}" height="${H / 2}"/></clipPath><clipPath id="wpBot"><rect x="0" y="${H / 2}" width="${W}" height="${H / 2}"/></clipPath></defs>
      <path d="${line}L${W},${H / 2}L0,${H / 2}Z" fill="${hc}" opacity=".28" clip-path="url(#wpTop)"/>
      <path d="${line}L${W},${H / 2}L0,${H / 2}Z" fill="${ac}" opacity=".28" clip-path="url(#wpBot)"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" class="mid"/>
      <path d="${line}" fill="none" class="ln"/></svg>
    <div class="wp-axis"><span>${esc(d.home.team.abbr)} 100%</span><span>50%</span><span>${esc(d.away.team.abbr)} 100%</span></div></div>`;
}
function statCompare(d) {
  if (!d.stats || !d.stats.length) return '<div class="card empty">Team stats appear once the game starts.</div>';
  const num = (v) => parseFloat(String(v).replace(/[^\d.-]/g, '')) || 0;
  return `<div class="card gc-stats"><div class="hd"><span><img src="${esc(d.away.team.logo)}" alt="" />${esc(d.away.team.abbr)}</span><span>${esc(d.home.team.abbr)}<img src="${esc(d.home.team.logo)}" alt="" /></span></div>
    ${d.stats.map((s) => { const a = num(s.away); const h = num(s.home); const t = a + h || 1; const tm = /time|possession/i.test(s.label);
      return `<div class="sr"><b>${esc(s.away)}</b><span>${esc(s.label)}</span><b>${esc(s.home)}</b>${!tm && /\d/.test(s.away) && !/-/.test(s.away) ? `<div class="bar"><i style="width:${(a / t) * 100}%;background:${hex(d.away.team.color, 'var(--muted)')}"></i><i style="width:${(h / t) * 100}%;background:${hex(d.home.team.color, 'var(--accent)')}"></i></div>` : ''}</div>`; }).join('')}</div>`;
}
const tabs = (list) => `<div class="toolbar sticky gc-tabs"><div class="seg" role="tablist">${list.map(([k, l]) => `<button data-gctab="${k}" class="${castState.tab === k ? 'on' : ''}" role="tab" aria-selected="${castState.tab === k}">${l}</button>`).join('')}</div></div>`;
const footer = (d, extra = '') => `<p class="faint small gc-foot">${d.state === 'in' ? 'Updates automatically about every 20 seconds while this screen is open. ' : ''}Data: ESPN public feeds.${extra ? ` ${extra}` : ''} ${d.link ? `<a href="${esc(d.link)}" target="_blank" rel="noopener noreferrer">Open on ESPN ↗</a>` : ''}</p>`;
function preGame(d, inner = '') {
  return `<div class="card gc-pre"><div class="r"><span>Start</span><b>${esc(fmtWhen(d.date))}</b></div>
    ${d.venue ? `<div class="r"><span>Venue</span><b>${esc(d.venue)}</b></div>` : ''}
    <div class="r"><span>TV</span><b>${esc(d.broadcast || 'Not listed')}</b></div>
    <div class="r"><span>Records</span><b>${esc(d.away.team.abbr)} ${esc(d.away.record || '–')} · ${esc(d.home.team.abbr)} ${esc(d.home.record || '–')}</b></div>${inner}</div>`;
}

// ---------- football ----------
function field(d) {
  const s = d.situation; if (!s || s.yardsToEndzone == null || !s.possessionSide) return '';
  // Schematic field: away team attacks to the right, home team to the left.
  const W = 360; const H = 120; const ez = 30; const play = W - ez * 2; const yx = (y) => ez + (y / 100) * play;
  const right = s.possessionSide === 'away';
  const ball = right ? 100 - s.yardsToEndzone : s.yardsToEndzone;
  const dist = Math.min(s.distance || 0, s.yardsToEndzone);
  const gain = right ? ball + dist : ball - dist;
  const hc = hex(d.home.team.color, '#1f6f5c'); const ac = hex(d.away.team.color, '#3b6fd8');
  const lines = Array.from({ length: 9 }, (_, i) => { const x = yx((i + 1) * 10); const n = (i + 1) * 10; return `<line x1="${x}" x2="${x}" y1="0" y2="${H}" class="yl"/><text x="${x}" y="${H - 6}" class="yn">${n > 50 ? 100 - n : n}</text>`; }).join('');
  const off = right ? d.away.team : d.home.team;
  return `<div class="card gc-field">
    <div class="sit"><img src="${esc(off.logo)}" alt="" width="22" height="22" /><b>${esc(s.text || '')}</b>${s.spot && !(s.text || '').includes(s.spot) ? `<span class="faint">at ${esc(s.spot)}</span>` : ''}${s.redZone ? '<span class="rz">Red zone</span>' : ''}</div>
    <svg viewBox="0 0 ${W} ${H}" class="field-svg" role="img" aria-label="Ball on the field: ${esc(s.text || '')}">
      <rect x="0" y="0" width="${W}" height="${H}" class="turf"/>
      <rect x="0" y="0" width="${ez}" height="${H}" fill="${ac}"/><rect x="${W - ez}" y="0" width="${ez}" height="${H}" fill="${hc}"/>
      <text x="${ez / 2}" y="${H / 2}" class="ezt" transform="rotate(-90 ${ez / 2} ${H / 2})">${esc(d.away.team.abbr)}</text>
      <text x="${W - ez / 2}" y="${H / 2}" class="ezt" transform="rotate(90 ${W - ez / 2} ${H / 2})">${esc(d.home.team.abbr)}</text>
      ${lines}
      ${dist ? `<rect x="${Math.min(yx(ball), yx(gain))}" y="18" width="${Math.abs(yx(gain) - yx(ball))}" height="${H - 46}" class="togo"/>` : ''}
      <line x1="${yx(ball)}" x2="${yx(ball)}" y1="10" y2="${H - 22}" class="los"/>
      ${dist ? `<line x1="${yx(gain)}" x2="${yx(gain)}" y1="10" y2="${H - 22}" class="ltg"/>` : ''}
      <g transform="translate(${yx(ball)} ${H / 2 - 4})"><ellipse rx="9" ry="5.5" class="ball"/><path d="M-3 0h6" class="lace"/></g>
      <path d="M${yx(ball) + (right ? 14 : -14)} ${H / 2 - 4} l${right ? -6 : 6} -5 v10z" class="dir"/>
    </svg>
    <div class="legend"><span><i class="k los"></i>Line of scrimmage</span>${dist ? '<span><i class="k ltg"></i>Line to gain</span>' : ''}<span class="faint">${esc(d.away.team.abbr)} → · ← ${esc(d.home.team.abbr)}</span></div>
    ${s.lastPlay ? `<div class="last"><span class="faint small">Last play</span> ${esc(s.lastPlay)}</div>` : ''}
    ${s.homeTimeouts != null ? `<div class="tos"><span>${esc(d.away.team.abbr)} timeouts ${'●'.repeat(s.awayTimeouts)}${'○'.repeat(Math.max(0, 3 - s.awayTimeouts))}</span><span>${esc(d.home.team.abbr)} timeouts ${'●'.repeat(s.homeTimeouts)}${'○'.repeat(Math.max(0, 3 - s.homeTimeouts))}</span></div>` : ''}</div>`;
}
function scoringList(d) {
  if (!d.scoring.length) return '';
  const byQ = {}; for (const p of d.scoring) (byQ[p.period] = byQ[p.period] || []).push(p);
  return `<h2>Scoring summary</h2><div class="card panel gc-scoring">${Object.entries(byQ).map(([q, ps]) => `<div class="qh">${+q <= 4 ? `${ord(+q)} quarter` : 'Overtime'}</div>${ps.map((p) => {
    const t = [d.home, d.away].find((x) => x.team.id === p.teamId);
    return `<div class="sp"><img src="${esc(t ? t.team.logo : '')}" alt="" width="22" height="22" /><div><b>${esc(p.type || '')}</b> <span class="faint small">${esc(p.clock || '')}</span><div class="small">${esc(p.text)}</div></div><span class="sc">${esc(p.away)}–${esc(p.home)}</span></div>`; }).join('')}`).join('')}</div>`;
}
function drives(d) {
  if (!d.drives || !d.drives.length) return '<div class="card empty">No drives yet.</div>';
  return `<div class="gc-drives">${d.drives.map((x, i) => {
    const t = [d.home, d.away].find((s) => s.team.id === x.teamId);
    return `<details class="card drive ${x.score ? 'scored' : ''}" ${i === 0 && (x.current || d.state === 'in') ? 'open' : ''}>
      <summary><img src="${esc(t ? t.team.logo : '')}" alt="" width="24" height="24" /><span class="dt"><b>${esc(x.result || '')}</b>${x.current ? ' <span class="live small">· now</span>' : ''}<small>${esc(x.description || '')}${x.start ? ` · from ${esc(x.start)}` : ''}</small></span><span class="faint small">${x.period ? `Q${x.period}` : ''} ${esc(x.clock || '')}</span></summary>
      <ol class="plays">${x.plays.slice().reverse().map((p) => `<li class="${p.score ? 'scored' : ''}">${p.dd ? `<span class="dd">${esc(p.dd)}</span>` : ''}${esc(p.text)}</li>`).join('')}</ol></details>`;
  }).join('')}</div>`;
}
function leaders(d) {
  if (!d.leaders || !d.leaders.length || d.state === 'pre') return '';
  return `<h2>Leaders</h2><div class="gc-leaders">${d.leaders.map((tm) => { const t = [d.home, d.away].find((s) => s.team.id === tm.teamId);
    return `<div class="card"><div class="lh"><img src="${esc(t ? t.team.logo : '')}" alt="" width="20" height="20" /><b>${esc(tm.abbr)}</b></div>${tm.cats.slice(0, 3).map((c) => `<div class="r"><span class="faint small">${esc(c.cat)}</span><b>${esc(c.name)}</b><span class="small">${esc(c.line)}</span></div>`).join('')}</div>`; }).join('')}</div>`;
}
function footballCast(d, ctx) {
  let body = '';
  if (d.state === 'pre') body = preGame(d) + `<p class="muted small">Down & distance, drives, win probability and team stats appear here once the game kicks off.</p>`;
  else if (castState.tab === 'plays') body = drives(d);
  else if (castState.tab === 'stats') body = statCompare(d) + leaders(d);
  else body = (d.state === 'in' ? field(d) : '') + lineScore(d) + wpChart(d) + scoringList(d) + (d.state === 'post' ? leaders(d) : '');
  return header(d, ctx) + (d.state === 'pre' ? '' : tabs([['summary', 'Summary'], ['plays', 'Drives'], ['stats', 'Team stats']])) + body
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
    body = statCompare(d) + (d.pitchers || []).map((t) => `<h2>${esc(t.abbr)} pitching</h2><div class="card scroll-x"><table class="tbl"><thead><tr><th>Pitcher</th><td>IP</td><td>H</td><td>R</td><td>ER</td><td>BB</td><td>K</td></tr></thead><tbody>${t.rows.map((r) => `<tr><th>${esc(r.name)}${r.note ? ` <span class="faint small">${esc(r.note)}</span>` : ''}</th><td>${esc(r.ip)}</td><td>${esc(r.h)}</td><td>${esc(r.r)}</td><td>${esc(r.er)}</td><td>${esc(r.bb)}</td><td>${esc(r.k)}</td></tr>`).join('')}</tbody></table></div>`).join('');
  } else {
    if (d.state === 'in' && s) {
      body += `<div class="card gc-bases">${diamond(s)}
        <div class="count"><div><span>B</span>${dots(s.balls, 4, 'b')}</div><div><span>S</span>${dots(s.strikes, 3, 's')}</div><div><span>O</span>${dots(s.outs, 3, 'o')}</div></div>
        <div class="pb">${s.pitcher ? `<div><span class="faint small">Pitching</span><b>${esc(s.pitcher.name)}</b>${s.pitcher.line ? `<small>${esc(s.pitcher.line)}</small>` : ''}</div>` : ''}${s.batter ? `<div><span class="faint small">At bat</span><b>${esc(s.batter.name)}</b>${s.batter.line ? `<small>${esc(s.batter.line)}</small>` : ''}</div>` : ''}</div>
        ${s.lastPlay ? `<div class="last"><span class="faint small">Last play</span> ${esc(s.lastPlay)}</div>` : ''}
        ${s.runnersKnown ? '' : '<div class="faint small">Runner positions unavailable right now.</div>'}</div>`;
    }
    body += lineScore(d, { min: 9, extra: ['hits', 'errors'] }) + wpChart(d);
    if (d.scoring && d.scoring.length) body += `<h2>Scoring plays</h2><div class="card panel gc-scoring">${d.scoring.slice().reverse().map((p) => `<div class="sp"><span class="faint small inn">${esc(p.inning)}</span><div class="small">${esc(p.text)}</div><span class="sc">${p.away}–${p.home}</span></div>`).join('')}</div>`;
  }
  return header(d, ctx) + (d.state === 'pre' ? '' : tabs([['summary', 'Summary'], ['plays', 'Play-by-play'], ['stats', 'Box']])) + body + footer(d);
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
  return `<div class="gc-card"><div class="pc-head"><img src="${esc(p.flag)}" alt="" width="22" height="16" /><b>${esc(p.name)}</b><span class="faint small">${esc(p.country || '')}</span>
      <button class="btn small ${ctx.follows(p.id) ? 'primary' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag)}">${ctx.follows(p.id) ? '✓ Following' : '+ Follow'}</button></div>
    <div class="pc-sum"><span>Pos <b>${esc(p.pos || '–')}</b></span><span>Total <b>${esc(p.score)}</b></span><span>Today <b>${esc(p.today || '–')}</b></span><span>Thru <b>${esc(p.thru || '–')}</b></span>${p.rounds.map((r) => `<span>R${r.r} <b>${r.strokes ?? '–'}</b></span>`).join('')}</div>
    ${rounds.length ? rounds.map((rd) => `<div class="scroll-x">${nine(rd, 0)}${nine(rd, 9)}</div>`).join('') : '<p class="faint small">No hole-by-hole scores yet.</p>'}
    <div class="sc-key"><span><i class="birdie"></i>Birdie</span><span><i class="eagle"></i>Eagle or better</span><span><i class="bogey"></i>Bogey</span><span><i class="dbl"></i>Double+</span></div></div>`;
}
export function golfRow(p, ctx, open) {
  return `<button class="lb-row ${ctx.follows(p.id) ? 'mine' : ''} ${p.cut ? 'cut' : ''} ${open ? 'open' : ''}" data-golfer="${esc(p.id)}" aria-expanded="${!!open}">
    <span class="pos">${esc(p.pos || '–')}</span><img src="${esc(p.flag)}" alt="" width="20" height="14" loading="lazy" />
    <span class="nm">${esc(p.name)}${ctx.follows(p.id) ? ' <span class="star">●</span>' : ''}</span>
    <span class="tp ${String(p.score).startsWith('-') ? 'under' : ''}">${esc(p.score)}</span><span class="td">${esc(p.today || '')}</span>
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
      <div class="gc-meta">${[d.course, d.par && `Par ${d.par}`, d.purse && `Purse ${d.purse}`, d.cut && d.cut.score != null && `Cut ${d.cut.score > 0 ? '+' : ''}${d.cut.score === 0 ? 'E' : d.cut.score}`].filter(Boolean).map(esc).join(' · ')}</div></div>
    ${mine.length ? `<h2>Your players</h2><div class="card lb">${mine.map(row).join('')}</div>` : ''}
    <h2>Leaderboard <span class="count">${d.players.length}</span></h2>
    <div class="card lb"><div class="lb-row hd"><span class="pos">Pos</span><span></span><span class="nm">Player</span><span class="tp">Total</span><span class="td">Today</span><span class="th">Thru</span></div>${rows}</div>
    <p class="faint small">Tap a player for the hole-by-hole scorecard.</p>${footer(d, 'Golf: no live shot tracking or world ranking in the free feed.')}`;
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
    ${!big && m.court ? `<div class="meta">${esc(m.court)}</div>` : ''}</div>`;
}
function tennisCast(d, ctx) {
  const ps = d.players;
  const extra = d.state === 'pre' ? `<div class="card gc-pre"><div class="r"><span>Scheduled</span><b>${esc(fmtWhen(d.date))}</b></div>${d.court ? `<div class="r"><span>Court</span><b>${esc(d.court)}</b></div>` : ''}</div>` : '';
  return `<div class="card gc-head tennis"><div class="gc-note">${esc(d.tour)} · ${esc(d.tournament)}</div>
      <div class="gc-meta">${[d.draw, d.round, d.court, d.venue].filter(Boolean).map(esc).join(' · ')}</div></div>
    ${tennisMatch(d, ctx, { big: true })}
    ${d.note ? `<div class="card gc-note2">${esc(d.note)}</div>` : ''}
    ${d.state === 'in' ? `<div class="card gc-serve"><i></i>${esc((ps.find((p) => p.serving) || {}).name || 'Server not reported')}${ps.some((p) => p.serving) ? ' is serving' : ''}</div>` : ''}
    ${extra}
    <div class="card gc-pre">${ps.map((p) => `<div class="r"><span>${p.flag ? `<img src="${esc(p.flag)}" alt="" width="18" height="12" /> ` : ''}${esc(p.name)}</span><b>${p.seed ? `Seed ${p.seed}` : 'Unseeded'}${p.country ? ` · ${esc(p.country)}` : ''}</b>
      <button class="btn small ${ctx.follows(p.id) ? 'primary' : ''}" data-pfollow="${esc(p.id)}" data-pname="${esc(p.name)}" data-pflag="${esc(p.flag || '')}">${ctx.follows(p.id) ? '✓ Following' : '+ Follow'}</button></div>`).join('')}</div>
    <p class="muted small">Point-by-point score and match stats (aces, break points) aren’t in ESPN’s free tennis feed — set scores, the server and results only.</p>
    ${d.related && d.related.length ? `<h2>${esc(d.round || 'Same round')}</h2><div class="grid">${d.related.map((m) => tennisMatch(m, ctx)).join('')}</div>` : ''}
    ${footer(d)}`;
}

export function renderGamecast(d, ctx) {
  if (d.kind === 'football') return footballCast(d, ctx);
  if (d.kind === 'baseball') return baseballCast(d, ctx);
  if (d.kind === 'golf') return golfCast(d, ctx);
  if (d.kind === 'tennis') return tennisCast(d, ctx);
  return '<div class="empty">Unsupported event.</div>';
}
export function castTitle(d) {
  if (d.kind === 'golf') return d.name;
  if (d.kind === 'tennis') return d.players.map((p) => p.short || p.name).join(' vs ');
  return `${d.away.team.abbr} @ ${d.home.team.abbr}`;
}
