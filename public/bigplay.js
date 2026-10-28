// Big-play layer for the Gamecast (v1.4.0). The server (server/bigplay.js) classifies plays from ESPN's own data and sends d.big (list) and p.bp (per play).
// This file: (1) watches each live poll for NEW big plays and pops a callout over the graphic area, (2) the "Big plays" chips for finished games,
// (3) the badge shown next to a play in lists. Transform/opacity animations only, position:fixed overlay (no layout shift), no audio,
// and prefers-reduced-motion gets the same information as a still highlighted card.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const DUR = 2600; // ms the callout stays up
export const bpDone = (t) => String(t || '').replace(/!+$/, '');

/** Small badge for a play row/banner (static, no motion). */
export function bpBadge(p) {
  const b = p && p.bp; if (!b || !b.h) return '';
  return `<span class="bpbadge ${b.t === 'huge' ? 'huge' : 'big'}" title="Big play">★ ${esc(bpDone(b.h))}</span> `;
}

const ROLE_MAIN = ['Target', 'Rusher', 'Kicker', 'Shooter', 'Batter', 'Goal', 'Scorer', 'Interception', 'Recovered by', 'Returner', 'Passer', 'Player'];
const ROLE_SUB = { Target: 'Passer', Shooter: 'Assist', Goal: 'Assist', Scorer: 'Assist', Batter: 'Pitcher' };
const SUB_LEAD = { Passer: 'from', Assist: 'assist', Pitcher: 'off' };
/** "Brandon Aubrey" / "Tatum · assist Smith": real names from the play's who[] only; empty when there is none. */
export function whoLine(it) {
  if (it && it.player) return it.player; // golf
  const who = ((it && it.who) || []).filter((w) => w && w.name); if (!who.length) return '';
  let main = null; for (const r of ROLE_MAIN) { main = who.find((w) => w.role === r); if (main) break; } main = main || who[0];
  const sr = ROLE_SUB[main.role]; const sub = sr && who.find((w) => w.role === sr);
  return sub ? `${main.name} · ${SUB_LEAD[sr]} ${sub.name}` : main.name;
}

const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; };
/** Team colour for the flash: the benefiting team's colour, else its alt, else null (page accent). Too-dark colours are skipped. */
export function sideColor(d, side) {
  const t = side && d && d[side] && d[side].team; if (!t) return null;
  for (const c of [t.color, t.alt]) { const L = lum(c); if (L != null && L > 0.12 && L < 0.92) return `#${String(c).replace('#', '')}`; }
  return null;
}

const S = { seen: new Map(), cur: null, timer: 0, items: new Map() }; // seen: scope -> {ids:Set, t}
let live = null; // the currently showing overlay
const GOLD = '#ffc933';

function confetti(color, n) {
  let h = '';
  const pal = [color || GOLD, GOLD, '#ffffff', color || '#ff7a1a'];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.283 + (i % 2) * 0.3; const r = 110 + ((i * 37) % 90); const x = Math.round(Math.cos(a) * r), y = Math.round(Math.sin(a) * r * 0.75 - 30);
    h += `<i class="bpo-c" style="--x:${x}px;--y:${y}px;--r:${(i * 83) % 360}deg;--d:${(i % 5) * 40}ms;--c:${pal[i % 4]}"></i>`;
  }
  return h;
}

/** Show the callout for a big-play item ({bp, who, when, ...}). */
export function show(it, d, { force = false } = {}) {
  if (!it || !it.bp || typeof document === 'undefined') return null;
  hide();
  const b = it.bp; const rm = RM.matches; const huge = b.t === 'huge'; const col = sideColor(d, b.side);
  const who = whoLine(it); const sub = b.s || '';
  const cnt = b.v != null && b.u && /^\d+$/.test(String(b.v)) && !rm && typeof CSS !== 'undefined' && CSS.supports && CSS.supports('(--a: 1)');
  const subHtml = b.v != null && b.u && sub.includes(String(b.v)) && cnt
    ? esc(sub).replace(String(b.v), `<span class="bpo-n" style="--to:${+b.v}" aria-hidden="true"></span><span class="sr">${+b.v}</span>`) : esc(sub);
  const el = document.createElement('div');
  el.className = `bpo ${huge ? 'huge' : 'big'} k-${esc(b.k)} ${rm ? 'rm' : 'go'}${force ? ' replay' : ''}`;
  el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.dataset.bp = it.id || '';
  if (col) el.style.setProperty('--bpc', col);
  el.innerHTML = `<div class="bpo-edge"></div>${huge ? '<div class="bpo-spot"></div>' : ''}
    <div class="bpo-card" ${col ? '' : ''}><div class="bpo-sweep"></div>
      <div class="bpo-tag">${huge ? 'HUGE PLAY' : 'BIG PLAY'}${it.when ? ` · ${esc(it.when)}` : ''}</div>
      <div class="bpo-h">${esc(b.h)}</div>
      ${subHtml ? `<div class="bpo-s">${subHtml}</div>` : ''}
      ${who ? `<div class="bpo-w">${esc(who)}</div>` : ''}
      ${huge && !rm ? `<div class="bpo-conf" aria-hidden="true">${confetti(col, 16)}</div>` : ''}
    </div>`;
  document.body.appendChild(el); live = el;
  glow(col, rm, huge);
  clearTimeout(S.timer); S.timer = setTimeout(hide, rm ? 3600 : DUR + 200);
  return el;
}
export function hide() { clearTimeout(S.timer); if (live) { live.remove(); live = null; } document.querySelectorAll('.bpo').forEach((x) => x.remove()); document.querySelectorAll('.bp-glow').forEach((x) => x.classList.remove('bp-glow')); }

// banner + first graphic card get a team-colour glow (CSS animation, or a static outline for reduced motion)
function glow(col, rm, huge) {
  const root = document.querySelector('#view .gc, .gc'); if (!root) return;
  const targets = [root.querySelector('.last.lp'), root.querySelector('.card.gc-field, .card.gc-bases, .card.gc-shots, .card.gc-story-t')].filter(Boolean);
  targets.forEach((t) => { if (col) t.style.setProperty('--bpc', col); t.classList.add('bp-glow'); if (rm) t.classList.add('rm'); });
  setTimeout(() => targets.forEach((t) => { t.classList.remove('bp-glow', 'rm'); }), rm ? 3600 : DUR + 200);
}

const rank = (it) => (it.bp.t === 'huge' ? 2 : 1);
/**
 * Called after every Gamecast render. New big plays on a LIVE game animate once; the first render of a game (and a return after >25 s away) only records
 * what is already there, so opening a game never replays history and a 10 s poll never replays a play.
 */
export function watch(d, scope, now = Date.now()) {
  S.cur = { d, scope }; S.items = new Map((d.big || []).map((x) => [String(x.id), x]));
  const ids = (d.big || []).map((x) => String(x.id)); let rec = S.seen.get(scope);
  if (!rec || now - rec.t > 25000) { S.seen.set(scope, { ids: new Set(ids), t: now }); trim(); return null; }
  rec.t = now; const fresh = (d.big || []).filter((x) => !rec.ids.has(String(x.id))); fresh.forEach((x) => rec.ids.add(String(x.id)));
  if (!fresh.length || d.state !== 'in' || (typeof document !== 'undefined' && document.hidden)) return null;
  const best = fresh.reduce((a, x) => (rank(x) >= rank(a) ? x : a)); // highest tier, latest wins; the others are marked seen, not queued
  return show(best, d);
}
function trim() { while (S.seen.size > 12) S.seen.delete(S.seen.keys().next().value); }
export const seenCount = (scope) => (S.seen.get(scope) ? S.seen.get(scope).ids.size : 0);

/** Finished game: the "Big plays" chips (huge first). Tap one to replay its callout. */
export function bigChips(d) {
  const all = (d.big || []).filter((x) => x && x.bp); if (!all.length || d.state !== 'post') return '';
  const sorted = [...all.filter((x) => x.bp.t === 'huge'), ...all.filter((x) => x.bp.t !== 'huge').reverse()];
  const lim = 12; const chip = (x, i) => `<button type="button" class="bpc ${x.bp.t === 'huge' ? 'huge' : 'big'}${i >= lim ? ' more' : ''}" data-bpr="${esc(x.id)}" aria-label="Replay: ${esc(x.bp.h)} ${esc(whoLine(x))}"><b>${esc(bpDone(x.bp.h))}</b><small>${esc([x.when, whoLine(x)].filter(Boolean).join(' · '))}</small></button>`;
  return `<h2>Big plays <span class="count">${all.length}</span></h2><div class="card panel bp-chips" data-bpchips><div class="bpc-list">${sorted.map(chip).join('')}</div>${sorted.length > lim ? `<button type="button" class="bpc-more" data-bpmore>Show all ${sorted.length}</button>` : ''}<p class="faint small">Tap a play to replay its animation. Big plays are picked from ESPN’s own play data (rules in the About page).</p></div>`;
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const more = e.target.closest && e.target.closest('[data-bpmore]');
    if (more) { const box = more.closest('[data-bpchips]'); const open = box.classList.toggle('all'); more.textContent = open ? 'Show fewer' : `Show all ${box.querySelectorAll('.bpc').length}`; return; }
    const c = e.target.closest && e.target.closest('[data-bpr]');
    if (c && S.cur) { const it = S.items.get(c.dataset.bpr); if (it) show(it, S.cur.d, { force: true }); }
  });
  // test/diagnostic hook: lets the QA harness pause the animation at an exact time and replay a given play (no effect on normal use)
  window.__ssBP = {
    show: (id) => { const it = S.items.get(String(id)) || [...S.items.values()][0]; return !!(it && show(it, S.cur && S.cur.d)); },
    seek: (ms) => document.getAnimations().forEach((a) => { try { a.pause(); a.currentTime = ms; } catch { /* ignore */ } }),
    items: () => [...S.items.values()].map((x) => ({ id: x.id, t: x.bp.t, h: x.bp.h })),
  };
}
