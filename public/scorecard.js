// v1.7.0 "Scorekeeper": paper scorebook sheet renderer (pure: data from /api/scorecard -> HTML string). No network, no globals.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PT = { 0: [20, 34], 1: [34, 20], 2: [20, 6], 3: [6, 20], 4: [20, 34] };
// Small diamond: grid outline in pencil, the path the batter/runner travelled in ink, filled when he scored.
export function diamondSVG(c) {
  const path = (c && c.path) || []; const max = path.length ? Math.max(...path) : 0;
  const pts = [PT[0], ...path.map((b) => PT[b])].map((p) => p.join(',')).join(' ');
  let ink = '';
  if (c && c.scored) ink += `<polygon class="run" points="20,34 34,20 20,6 6,20"/>`;
  if (max) ink += `<polyline class="ink" points="${pts}"/>`;
  if (c && c.outAt) { const a = PT[c.outAt - 1] || PT[0]; const b = PT[c.outAt] || PT[4]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; ink += `<line class="ink" x1="${a[0]}" y1="${a[1]}" x2="${mx}" y2="${my}"/><path class="ink" d="M${mx - 3} ${my - 3}l6 6M${mx + 3} ${my - 3}l-6 6"/>`; }
  return `<svg class="sc-dia" viewBox="0 0 40 40" aria-hidden="true"><polygon class="grid" points="20,34 34,20 20,6 6,20"/>${ink}</svg>`;
}
const cellLabel = (c) => { const t = c.looking && /^K/.test(c.text) ? `<span class="kl" aria-label="called strikeout">K</span>${esc(c.text.slice(1))}` : esc(c.text); return t; };
export function cellHTML(c, cur) {
  if (!c) return `<div class="sc-ab${cur ? ' cur' : ''}">${diamondSVG(null)}${cur ? '<b class="sc-up">AB</b>' : ''}</div>`;
  const notes = (c.notes || []).map((n) => `<i class="sc-n b${n.base}">${esc(n.how)}</i>`).join('');
  const rbi = c.rbi ? `<span class="sc-rbi" aria-label="${c.rbi} RBI">${'•'.repeat(Math.min(c.rbi, 4))}</span>` : '';
  return `<div class="sc-ab k-${esc(c.kind)}${c.scored ? ' scored' : ''}${c.sub ? ' sub' : ''}${cur ? ' cur' : ''}${c.end ? ' end' : ''}" data-sc-cell="${esc(c.slot)}|${esc(c.inn)}" title="${esc(c.text)}">${diamondSVG(c)}<b class="sc-t">${cellLabel(c)}</b>${c.out ? `<span class="sc-out">${c.out}</span>` : ''}${rbi}${notes}${c.unread ? '<i class="sc-q" title="part of this play could not be read">?</i>' : ''}</div>`;
}
const STATS = ['AB', 'R', 'H', 'RBI', 'BB', 'K'];
export function sheetHTML(sc, side) {
  const T = sc.teams && sc.teams[side]; if (!T) return '<div class="card empty">No sheet for this team.</div>';
  const P = sc.people || {}; const n = Math.max(9, sc.innings || 9); const inns = Array.from({ length: n }, (_, i) => i + 1);
  const cur = sc.live && sc.current && sc.current.side === side ? sc.current : null;
  const rows = T.slots.map((sl) => {
    const ppl = sl.players.map((id) => P[id]).filter(Boolean);
    const who = ppl.map((p, i) => `<div class="sc-p${i ? ' subp' : ''}"><b>${esc(p.short || p.name)}</b>${p.jersey ? `<span class="sc-j">#${esc(p.jersey)}</span>` : ''}<span class="sc-pos">${esc(p.pos || '')}</span>${i && p.enter ? `<small class="sc-in">${esc(p.enter.how)} ${p.enter.inn}</small>` : ''}</div>`).join('');
    const tot = (k) => { let s = 0; let any = false; for (const p of ppl) { const v = p.stats && p.stats[k]; if (v != null && v !== '' && !isNaN(+v)) { s += +v; any = true; } } return any ? s : ''; };
    return `<tr data-slot="${sl.order}"><th class="sc-who" scope="row"><div class="sc-whoin"><span class="sc-ord">${sl.order}</span><div>${who}</div></div></th>${inns.map((i) => { const cs = (T.cells[`${sl.order}|${i}`] || []); const isCur = cur && cur.slot === sl.order && cur.inn === i; return `<td class="sc-c${isCur ? ' cur' : ''}">${cs.length ? cs.map((c) => cellHTML(c, false)).join('') : ''}${isCur ? cellHTML(null, true) : ''}</td>`; }).join('')}${STATS.map((k) => `<td class="sc-s">${tot(k)}</td>`).join('')}</tr>`;
  }).join('');
  const foot = ['R', 'H', 'E', 'LOB'].map((k) => `<tr class="sc-f"><th scope="row">${k}</th>${inns.map((i) => { const x = T.innings.find((y) => y.inn === i); return `<td>${x && x[k] != null ? esc(x[k]) : ''}</td>`; }).join('')}${STATS.map(() => '<td></td>').join('')}</tr>`).join('');
  const pit = (T.pitchers || []).length ? `<div class="sc-pit"><table><thead><tr><th>${esc(T.abbr)} pitchers</th><td>IP</td><td>H</td><td>R</td><td>ER</td><td>BB</td><td>K</td><td>PC</td></tr></thead><tbody>${T.pitchers.map((p) => `<tr><th>${esc(p.name)}</th>${['IP', 'H', 'R', 'ER', 'BB', 'K', 'PC'].map((k) => `<td>${p[k] != null ? esc(p[k]) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  return `<div class="sc-grid" data-sc-side="${side}"><table class="sc-tbl"><thead><tr><th class="sc-who">${esc(T.abbr)} · Batter</th>${inns.map((i) => `<td class="${cur && cur.inn === i ? 'cur' : ''}">${i}</td>`).join('')}${STATS.map((k) => `<td class="sc-s">${k}</td>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>${pit}`;
}
// Whole page: title strip, LIVE badge, Away/Home toggle, sheet or the plain pre-game note.
export function scorecardHTML(sc, side, back) {
  const A = sc.teams.away || {}, H = sc.teams.home || {};
  const badge = sc.live ? '<span class="sc-live" data-sc-live>LIVE</span>' : sc.state === 'post' ? '<span class="sc-fin">FINAL</span>' : '';
  const head = `<div class="sc-head"><a class="btn small ghost" href="${esc(back)}">‹ Gamecast</a><div class="sc-title"><b>${esc(A.abbr)} ${A.score != null && sc.state !== 'pre' ? esc(A.score) : ''} · ${esc(H.abbr)} ${H.score != null && sc.state !== 'pre' ? esc(H.score) : ''}</b><small>${esc(sc.detail || '')}</small></div>${badge}</div>`;
  const seg = `<div class="seg sc-seg" role="tablist">${['away', 'home'].map((s) => `<button data-scside="${s}" class="${side === s ? 'on' : ''}" role="tab" aria-selected="${side === s}">${esc((sc.teams[s] || {}).abbr || s)} ${s === 'away' ? 'Away' : 'Home'}</button>`).join('')}</div>`;
  const hasLineup = ['away', 'home'].some((s) => sc.teams[s] && sc.teams[s].slots.length);
  let body;
  if (!sc.hasPlays && sc.state === 'pre') body = `<p class="sc-note" data-sc-note>Scorecard fills in once the game starts.</p>${hasLineup ? sheetHTML(sc, side) : ''}`;
  else if (!sc.hasPlays) body = `<p class="sc-note" data-sc-note>ESPN has no play-by-play for this game yet, so the scorecard can’t be filled in.</p>${hasLineup ? sheetHTML(sc, side) : ''}`;
  else body = sheetHTML(sc, side);
  const key = '<p class="sc-key">Diamond = bases reached · filled = scored · circled number = out · dots = RBI · <span class="kl">K</span> = called third strike · ? = play text not readable</p>';
  return `<div class="scorebook" data-sc-state="${esc(sc.state)}">${head}${seg}${body}${sc.hasPlays ? key : ''}</div>`;
}
