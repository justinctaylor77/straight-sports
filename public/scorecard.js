// v1.7.0 "Scorekeeper": paper scorebook sheet renderer (pure: data from /api/scorecard -> HTML string). No network, no globals.
// Look: an off-white printed scorebook (faint green grid, printed labels) with every game mark written in pencil.
// Each mark gets a little hand-wobble (rotation, offset, jittered strokes) seeded by the play id, so a live refresh redraws it identically.
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Deterministic RNG: FNV-1a hash of the seed string -> mulberry32.
export function rng(seed) {
  let h = 2166136261; const s = String(seed == null ? '' : seed);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  let a = h >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f1 = (n) => Math.round(n * 10) / 10;
const between = (r, lo, hi) => lo + r() * (hi - lo);
// Hand-wobble style for a pencil mark: ±2deg, ±1px, graphite opacity .82–.97.
const wob = (r) => `transform:translate(${f1(between(r, -1, 1))}px,${f1(between(r, -1, 1))}px) rotate(${f1(between(r, -2, 2))}deg);opacity:${(between(r, 0.82, 0.97)).toFixed(2)}`;
// A pencil stroke between points: each leg is a slightly bowed quadratic with jittered ends.
function stroke(r, pts, cls = 'pen') {
  const j = (v) => f1(v + between(r, -0.7, 0.7));
  let d = `M${j(pts[0][0])} ${j(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; d += `Q${j((x0 + x1) / 2 + between(r, -1.2, 1.2))} ${j((y0 + y1) / 2 + between(r, -1.2, 1.2))} ${j(x1)} ${j(y1)}`; }
  return `<path class="${cls}" d="${d}" style="stroke-width:${between(r, 1.6, 2.2).toFixed(2)}px"/>`;
}
const PT = { 0: [22, 38], 1: [38, 22], 2: [22, 6], 3: [6, 22], 4: [22, 38] };
// Scored run: hatched pencil shading inside the diamond (lines parallel to home→first) plus a loose scribble outline. Not a solid fill.
function hatch(r) {
  let d = '';
  for (let c = 30; c <= 58; c += 3.2) { const a = [(c + 16) / 2, (c - 16) / 2], b = [(c - 16) / 2, (c + 16) / 2]; const k = between(r, 0.6, 1.6); d += `M${f1(a[0] - k)} ${f1(a[1] + k)}L${f1(b[0] + k + between(r, -0.6, 0.6))} ${f1(b[1] - k)}`; }
  return `<polygon class="run" points="22,38 38,22 22,6 6,22"/><path class="hatch" d="${d}"/>`;
}
// Small diamond: faint printed diamond, the base path in pencil, hatched when he scored, a pencil tick where he was put out.
export function diamondSVG(c, seed) {
  const r = rng(seed != null ? seed : c && c.playId);
  const path = (c && c.path) || []; const max = path.length ? Math.max(...path) : 0;
  let ink = '';
  if (c && c.scored) ink += hatch(r);
  if (max) ink += stroke(r, [PT[0], ...path.map((b) => PT[b])], 'ink');
  if (c && c.outAt) { const a = PT[c.outAt - 1] || PT[0]; const b = PT[c.outAt] || PT[4]; const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; ink += stroke(r, [a, [mx, my]], 'ink') + stroke(r, [[mx - 4, my - 4], [mx + 4, my + 4]], 'ink') + stroke(r, [[mx + 4, my - 4], [mx - 4, my + 4]], 'ink'); }
  return `<svg class="sc-dia" viewBox="0 0 44 44" aria-hidden="true"><polygon class="grid" points="22,38 38,22 22,6 6,22"/><path class="grid tick" d="M20 38h4"/>${ink}</svg>`;
}
// Hand-drawn circle around an out number: an open loop that overshoots its start, like a pencil circle.
function outRing(r) {
  const cx = 11, cy = 11, n = 14, start = between(r, 0, Math.PI * 2), turn = Math.PI * 2 * between(r, 1.08, 1.18);
  const pts = []; for (let i = 0; i <= n; i++) { const t = start + (turn * i) / n; const rr = between(r, 7.6, 9.2); pts.push([f1(cx + Math.cos(t) * rr), f1(cy + Math.sin(t) * rr * 0.92)]); }
  let d = `M${pts[0][0]} ${pts[0][1]}`; for (let i = 1; i < pts.length; i++) d += `L${pts[i][0]} ${pts[i][1]}`;
  return `<svg class="sc-ring" viewBox="0 0 22 22" aria-hidden="true"><path class="ink" d="${d}" style="stroke-width:${between(r, 1.3, 1.7).toFixed(2)}px"/></svg>`;
}
const PRINT = '<i class="sc-cnt" aria-hidden="true"><b></b><b></b><b></b><br><b></b><b></b></i>';
const cellLabel = (c) => (c.looking && /^K/.test(c.text) ? `<span class="kl" aria-label="called strikeout">K</span>${esc(c.text.slice(1))}` : esc(c.text));
export function cellHTML(c, cur, key) {
  if (!c) { const r = rng(`cur|${key || ''}`); return `<div class="sc-ab${cur ? ' cur' : ''}">${PRINT}${diamondSVG(null, key)}${cur ? `<b class="sc-up" style="${wob(r)}">at bat</b>` : ''}</div>`; }
  const r = rng(`m|${c.playId}|${c.pid}`);
  const notes = (c.notes || []).map((n) => `<i class="sc-n b${n.base}" style="${wob(r)}">${esc(n.how)}</i>`).join('');
  const rbi = c.rbi ? `<span class="sc-rbi" role="img" aria-label="${c.rbi} RBI" data-rbi="${c.rbi}">${Array.from({ length: Math.min(c.rbi, 4) }, () => `<svg viewBox="0 0 8 8" aria-hidden="true"><circle cx="${f1(between(r, 3.4, 4.6))}" cy="${f1(between(r, 3.4, 4.6))}" r="${f1(between(r, 2.1, 2.7))}"/></svg>`).join('')}</span>` : '';
  const slash = c.end ? stroke(r, [[between(r, 44, 50), between(r, 70, 74)], [between(r, 64, 68), between(r, 50, 54)]], 'ink') : '';
  return `<div class="sc-ab k-${esc(c.kind)}${c.scored ? ' scored' : ''}${c.sub ? ' sub' : ''}${cur ? ' cur' : ''}${c.end ? ' end' : ''}" data-sc-cell="${esc(c.slot)}|${esc(c.inn)}" title="${esc(c.text)}">${PRINT}${diamondSVG(c, `d|${c.playId}|${c.pid}`)}<b class="sc-t" style="${wob(r)}">${cellLabel(c)}</b>${c.out ? `<span class="sc-out" style="${wob(r)}">${outRing(r)}<b>${c.out}</b></span>` : ''}${rbi}${notes}${c.unread ? `<i class="sc-q" style="${wob(r)}" title="part of this play could not be read">?</i>` : ''}${slash ? `<svg class="sc-slash" viewBox="0 0 68 76" preserveAspectRatio="none" aria-hidden="true">${slash}</svg>` : ''}</div>`;
}
const STATS = ['AB', 'R', 'H', 'RBI', 'BB', 'K'];
const pen = (v, seed) => (v === '' || v == null ? '' : `<span class="pc" style="${wob(rng(seed))}">${esc(v)}</span>`);
export function sheetHTML(sc, side) {
  const T = sc.teams && sc.teams[side]; if (!T) return '<div class="card empty">No sheet for this team.</div>';
  const P = sc.people || {}; const n = Math.max(9, sc.innings || 9); const inns = Array.from({ length: n }, (_, i) => i + 1);
  const cur = sc.live && sc.current && sc.current.side === side ? sc.current : null;
  const rows = T.slots.map((sl) => {
    const ppl = sl.players.map((id) => P[id]).filter(Boolean);
    const who = ppl.map((p, i) => { const r = rng(`p|${p.id || p.name}`); return `<div class="sc-p${i ? ' subp' : ''}"><span class="sc-j" style="${wob(r)}">${p.jersey ? esc(p.jersey) : ''}</span><b style="${wob(r)}">${esc(p.short || p.name)}</b><span class="sc-pos" style="${wob(r)}">${esc(p.pos || '')}</span>${i && p.enter ? `<small class="sc-in" style="${wob(r)}">${esc(p.enter.how)} ${p.enter.inn}</small>` : ''}</div>`; }).join('');
    const tot = (k) => { let s = 0; let any = false; for (const p of ppl) { const v = p.stats && p.stats[k]; if (v != null && v !== '' && !isNaN(+v)) { s += +v; any = true; } } return any ? s : ''; };
    return `<tr data-slot="${sl.order}"><th class="sc-who" scope="row"><div class="sc-whoin"><span class="sc-ord">${sl.order}</span><div>${who}</div></div></th>${inns.map((i) => { const cs = (T.cells[`${sl.order}|${i}`] || []); const isCur = cur && cur.slot === sl.order && cur.inn === i; return `<td class="sc-c${isCur ? ' cur' : ''}">${cs.length ? cs.map((c) => cellHTML(c, false)).join('') : (isCur ? '' : cellHTML(null, false, `${side}|${sl.order}|${i}`))}${isCur ? cellHTML(null, true, `${side}|${sl.order}|${i}`) : ''}</td>`; }).join('')}${STATS.map((k) => `<td class="sc-s">${pen(tot(k), `t|${side}|${sl.order}|${k}`)}</td>`).join('')}</tr>`;
  }).join('');
  const foot = ['R', 'H', 'E', 'LOB'].map((k) => `<tr class="sc-f"><th scope="row">${k}</th>${inns.map((i) => { const x = T.innings.find((y) => y.inn === i); return `<td>${x && x[k] != null ? pen(x[k], `f|${side}|${k}|${i}`) : ''}</td>`; }).join('')}${STATS.map(() => '<td></td>').join('')}</tr>`).join('');
  const pit = (T.pitchers || []).length ? `<div class="sc-pit"><table><thead><tr><th>PITCHERS</th><td>IP</td><td>H</td><td>R</td><td>ER</td><td>BB</td><td>K</td><td>PC</td></tr></thead><tbody>${T.pitchers.map((p) => `<tr><th>${pen(p.name, `pn|${p.id}`)}</th>${['IP', 'H', 'R', 'ER', 'BB', 'K', 'PC'].map((k) => `<td>${p[k] != null ? pen(p[k], `pp|${p.id}|${k}`) : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '';
  const O = sc.teams[side === 'away' ? 'home' : 'away'] || {};
  const r = rng(`hd|${sc.id}|${side}`);
  const title = `<div class="sc-paperhead"><span class="lbl">TEAM</span><span class="ln"><b class="pc" style="${wob(r)}">${esc(T.name || T.abbr)}</b></span><span class="lbl">VS.</span><span class="ln"><b class="pc" style="${wob(r)}">${esc(O.abbr || '')}</b></span>${sc.date ? `<span class="lbl">DATE</span><span class="ln"><b class="pc" style="${wob(r)}">${esc(sc.date)}</b></span>` : ''}</div>`;
  return `<div class="sc-paper">${title}<div class="sc-grid" data-sc-side="${side}"><table class="sc-tbl"><thead><tr><th class="sc-who"><span class="lbl-no">NO.</span><span class="lbl-pl">PLAYERS</span><span class="lbl-pos">POS</span></th>${inns.map((i) => `<td class="${cur && cur.inn === i ? 'cur' : ''}">${i}</td>`).join('')}${STATS.map((k) => `<td class="sc-s">${k}</td>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot>${foot}</tfoot></table></div>${pit}</div>`;
}
// Whole page: app-styled title strip, LIVE/FINAL badge and Away/Home toggle outside the paper; the sheet (or the plain pre-game note) on paper.
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
  const key = '<p class="sc-key">Pencil path = bases reached · shaded diamond = scored · circled number = out · dots = RBI · backwards K = called third strike · ? = play text not readable</p>';
  return `<div class="scorebook" data-sc-state="${esc(sc.state)}">${head}${seg}${body}${sc.hasPlays ? key : ''}</div>`;
}
