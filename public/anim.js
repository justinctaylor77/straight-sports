// Gamecast animation layer. Small, dependency-free: Web Animations API for pops/fades/bars, requestAnimationFrame for things that travel
// along a path (football ball, pitch, spray-chart ball). Everything honours prefers-reduced-motion (final state, no motion at all).
//
// How it works: gamecast.js / plays.js render the FINAL state as plain markup, tagged with data-an (what kind of animation), data-ak (a stable key)
// and data-slide (markers that slide between positions). After each render, mountCast() patches only the cards that changed (so a 10-second live
// refresh doesn't re-render everything), then animate() looks at the keys: on first open / tab change every keyed item animates, on a live refresh
// only keys that weren't on screen before animate (the new play, the new pitch, the new shot). Selecting/stepping a play animates just that card.

const RM = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reduced = () => !!RM.matches;
const NS = 'http://www.w3.org/2000/svg';

const R = { scope: '', seen: new Set(), pos: new Map(), vals: new Map(), sig: [] }; // per-open-game memory
const ease = { out: (t) => 1 - (1 - t) * (1 - t), inOut: (t) => 0.5 - Math.cos(Math.PI * t) / 2, in: (t) => t * t, lin: (t) => t };
const clamp01 = (t) => Math.max(0, Math.min(1, t));

// Run fn(progress 0..1) over dur ms after delay; stops quietly if the element left the page (re-render) so nothing leaks.
function tween(el, dur, delay, fn, done) {
  const t0 = performance.now() + delay; let alive = true;
  const frame = (now) => {
    if (!alive) return;
    if (!el.isConnected) { alive = false; return; }
    const t = (now - t0) / dur;
    if (t < 0) { requestAnimationFrame(frame); return; }
    fn(clamp01(t));
    if (t >= 1) { alive = false; if (done) done(); return; }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return () => { alive = false; };
}
const wa = (el, kf, opt) => { try { return el.animate(kf, opt); } catch { return null; } };
const f2 = (n) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------------------------------------------------
// mounting: patch only changed top-level cards
// ---------------------------------------------------------------------------------------------------------------------
export function mountCast(view, cls, html, scope, mode) {
  if (R.scope !== scope) { R.scope = scope; R.seen = new Set(); R.pos = new Map(); R.vals = new Map(); R.sig = []; mode = 'load'; }
  const tpl = document.createElement('template'); tpl.innerHTML = `<div class="${cls}">${html}</div>`;
  const next = tpl.content.firstElementChild; for (let n = next.nextElementSibling; n;) { const m = n.nextElementSibling; next.appendChild(n); n = m; } // tolerate stray closing tags in a card's markup
  const kids = [...next.children]; const sig = kids.map((k) => k.outerHTML);
  const cur = view.firstElementChild;
  let changed;
  if (mode === 'refresh' && cur && cur.className === cls && view.children.length === 1 && R.sig.length) {
    changed = []; const have = [...cur.children];
    kids.forEach((k, i) => {
      if (have[i] && R.sig[i] === sig[i]) return;            // unchanged card: leave the live DOM (and any running animation) alone
      if (have[i]) have[i].replaceWith(k); else cur.appendChild(k);
      changed.push(k);
    });
    for (let i = have.length - 1; i >= kids.length; i--) have[i].remove();
  } else {
    view.replaceChildren(next); changed = [next];
  }
  R.sig = sig;
  animate(changed, mode);
  return changed;
}

// ---------------------------------------------------------------------------------------------------------------------
// main pass
// ---------------------------------------------------------------------------------------------------------------------
function animate(roots, mode) {
  const rm = reduced();
  const force = (el) => mode === 'load' || mode === 'replay' || (mode === 'select' && !!el.closest('[data-sel]'));
  const cnt = {}; const pitchDelay = {}; let sprayAt = 0;
  for (const root of roots) {
    // keyed one-shot animations ------------------------------------------------------------------------------------
    const els = [...(root.matches && root.matches('[data-ak]') ? [root] : []), ...root.querySelectorAll('[data-ak]')];
    for (const el of els) {
      const key = el.dataset.ak; const fresh = !R.seen.has(key); R.seen.add(key);
      if (rm || !(fresh || force(el))) continue;
      const kind = el.dataset.an; const n = (cnt[kind] = (cnt[kind] || 0) + 1) - 1;
      if (kind === 'fb') animFootball(el, 0);
      else if (kind === 'pitch') { const d = n * 470; pitchDelay[key] = d; sprayAt = d + 700; animPitch(el, d); }
      else if (kind === 'fade') { const d = pitchDelay[el.dataset.follow] ?? Math.min(n * 40, 400); wa(el, [{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: d, easing: 'ease-out', fill: 'backwards' }); }
      else if (kind === 'shot') animShot(el, n, fresh && !force(el));
      else if (kind === 'spray') animSpray(el, sprayAt + 80);
      else if (kind === 'pod') animPodium(el);
    }
    // markers that slide between positions (line of scrimmage, line to gain, ball, to-go band) -------------------
    for (const el of (root.matches && root.matches('[data-slide]') ? [root] : []).concat([...root.querySelectorAll('[data-slide]')])) slideMarker(el, rm);
    // golf bars, set bars, serve ball, score pulse ---------------------------------------------------------------------
    const bars = [...root.querySelectorAll('[data-an="gbar"]')];
    if (bars.length) animGolf(bars, force(root) || mode === 'load', rm);
    root.querySelectorAll('[data-an="sbar"]').forEach((el, i) => animSets(el, i, force(el), rm));
    root.querySelectorAll('[data-an="serve"]').forEach((el) => animServe(el, force(el), rm));
    root.querySelectorAll('[data-s]').forEach((el) => pulseScore(el, rm));
  }
}

// replay button: re-run every keyed animation inside one card
export function replay(card) { if (card && !reduced()) animate([card], 'replay'); }

// ---------------------------------------------------------------------------------------------------------------------
// score pulse
// ---------------------------------------------------------------------------------------------------------------------
function pulseScore(el, rm) {
  const k = `s:${el.dataset.s}`; const v = el.textContent.trim(); const prev = R.vals.get(k); R.vals.set(k, v);
  if (rm || prev == null || prev === v || v === '') return;
  wa(el, [{ transform: 'scale(1)', textShadow: '0 0 0 transparent' }, { transform: 'scale(1.22)', textShadow: '0 0 18px var(--accent, #F56600)', offset: 0.3 }, { transform: 'scale(1)', textShadow: '0 0 0 transparent' }], { duration: 1100, easing: 'ease-out' });
  const card = el.closest('.gc-head'); if (card) wa(card, [{ boxShadow: '0 0 0 2px color-mix(in srgb, var(--accent, #F56600) 70%, transparent)' }, { boxShadow: '0 0 0 0 transparent' }], { duration: 1400, easing: 'ease-out' });
}

// ---------------------------------------------------------------------------------------------------------------------
// sliding markers
// ---------------------------------------------------------------------------------------------------------------------
function placeMarker(el, x, w) {
  const tag = el.tagName.toLowerCase();
  if (tag === 'line') { el.setAttribute('x1', f2(x)); el.setAttribute('x2', f2(x)); }
  else if (tag === 'rect') { el.setAttribute('x', f2(x)); el.setAttribute('width', Math.max(0, f2(w))); }
  else el.setAttribute('transform', `translate(${f2(x)} ${el.dataset.y || 0})`);
}
function slideMarker(el, rm) {
  const k = el.dataset.slide; const cur = { x: +el.dataset.x, w: +(el.dataset.w || 0) }; const prev = R.pos.get(k); R.pos.set(k, cur);
  if (rm || !prev || (prev.x === cur.x && prev.w === cur.w)) return;
  const dur = Math.min(900, 380 + Math.abs(cur.x - prev.x) * 3.2);
  placeMarker(el, prev.x, prev.w);
  tween(el, dur, 0, (t) => { const e = ease.inOut(t); placeMarker(el, prev.x + (cur.x - prev.x) * e, prev.w + (cur.w - prev.w) * e); }, () => placeMarker(el, cur.x, cur.w));
}

// ---------------------------------------------------------------------------------------------------------------------
// football: ball travels the pass arc / runner draws the run / kick arcs with the ball scaling for height; markers fade in at the end
// ---------------------------------------------------------------------------------------------------------------------
const DUR = { pass: 950, inc: 900, run: 900, kick: 1200, sack: 650 };
function animFootball(g, delay) {
  const kind = g.dataset.kind; const ln = g.querySelector('[data-ln]'); const ball = g.querySelector('.pg-ball'); const shadow = g.querySelector('.pg-shadow');
  const ends = [...g.querySelectorAll('.pg-end')];
  if (!ln || !ln.getTotalLength) { // penalty flag etc.: simple pop
    ends.forEach((e) => wa(e, [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay, fill: 'backwards', easing: 'ease-out' })); return;
  }
  const L = ln.getTotalLength(); const dashed = ln.classList.contains('dash'); const dur = DUR[kind] || 900;
  ends.forEach((e) => { e.style.opacity = 0; });
  if (dashed) ln.style.opacity = 0; else { ln.style.strokeDasharray = `${L} ${L}`; ln.style.strokeDashoffset = L; }
  if (ball) ball.style.opacity = 0;
  const isRun = kind === 'run' || kind === 'sack';
  tween(g, dur, delay, (t) => {
    const e = isRun ? ease.inOut(t) : kind === 'kick' ? ease.lin(t) : ease.out(t);
    const pt = ln.getPointAtLength(L * e); const pb = ln.getPointAtLength(Math.min(L, L * e + 1)); const pa = ln.getPointAtLength(Math.max(0, L * e - 1));
    if (!dashed) ln.style.strokeDashoffset = L * (1 - e); else ln.style.opacity = Math.min(1, e * 2.2);
    if (ball) {
      ball.style.opacity = t < 0.04 ? t / 0.04 : 1;
      const ang = (Math.atan2(pb.y - pa.y, pb.x - pa.x) * 180) / Math.PI;
      let sc = 1; let rot = ang;
      if (kind === 'kick') { sc = 1 + 0.85 * Math.sin(Math.PI * e); rot = ang + e * 540; }                 // height = size; tumbles end over end
      else if (kind === 'pass' || kind === 'inc') { sc = 1 + 0.35 * Math.sin(Math.PI * e); rot = ang; }     // slight rise, tilts with the arc
      ball.setAttribute('transform', `translate(${f2(pt.x)} ${f2(pt.y)}) rotate(${f2(rot)}) scale(${f2(sc)})`);
      if (kind === 'pass' || kind === 'inc') { const wob = 1 + 0.28 * Math.sin(e * 46); ball.firstElementChild.setAttribute('transform', `scale(1 ${f2(wob)})`); } // spiral shimmer
    }
    if (shadow) { // ground shadow shrinks as the ball climbs
      const lift = Math.sin(Math.PI * e); const sc = f2(1 - 0.45 * lift);
      shadow.style.opacity = 0.35; shadow.setAttribute('transform', `translate(${f2(pt.x)} ${f2(shadowY(ln, e, L))}) scale(${sc} ${sc})`);
    }
  }, () => {
    const end = ln.getPointAtLength(L);
    ln.style.strokeDasharray = ''; ln.style.strokeDashoffset = ''; ln.style.opacity = '';
    if (ball) { wa(ball, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }); ball.style.opacity = ''; }
    if (shadow) shadow.style.opacity = '';
    ends.forEach((e, i) => { e.style.opacity = ''; wa(e, [{ opacity: 0 }, { opacity: 1 }], { duration: 280, delay: i * 120, fill: 'backwards', easing: 'ease-out' }); });
    ripple(g, end.x, end.y, 5, 1.6);
  });
}
// shadow rides the ground between the kick's start and its landing point (landing y is the path end y; MID for punts/kickoffs)
function shadowY(ln, e, L) { const a = ln.getPointAtLength(0); const b = ln.getPointAtLength(L); return a.y + (b.y - a.y) * e; }

function ripple(parent, x, y, r, sw, color) {
  const c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', f2(x)); c.setAttribute('cy', f2(y)); c.setAttribute('r', r);
  c.setAttribute('class', 'pg-ripple'); c.setAttribute('stroke-width', sw); if (color) c.style.stroke = color; parent.appendChild(c);
  const a = wa(c, [{ transform: 'scale(.4)', opacity: 0.9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
  if (a) a.onfinish = () => c.remove(); else c.remove();
}

// ---------------------------------------------------------------------------------------------------------------------
// baseball: pitch flies from the mound (small, far away) to its spot in the zone and lands as a numbered dot; spray ball flies to where it was hit
// ---------------------------------------------------------------------------------------------------------------------
function animPitch(g, delay) {
  const svg = g.ownerSVGElement; const vb = svg.viewBox.baseVal; const x = +g.dataset.x; const y = +g.dataset.y;
  const ox = vb.x + vb.width / 2; const oy = vb.y + 6; const circ = g.querySelector('circle'); const txt = g.querySelector('text');
  const trail = document.createElementNS(NS, 'line'); trail.setAttribute('class', 'pt-trail'); svg.insertBefore(trail, g.parentNode === svg ? g : svg.firstChild);
  g.style.opacity = 0; circ.style.fill = '#fff'; if (txt) txt.style.opacity = 0;
  const FL = 0.76;
  tween(g, 700, delay, (t) => {
    g.style.opacity = 1;
    if (t < FL) {
      const f = t / FL; const e = ease.out(f); const s = 0.22 + 0.78 * ease.in(f);
      const px = ox + (x - ox) * e; const py = oy + (y - oy) * e;
      g.setAttribute('transform', `translate(${f2(px)} ${f2(py)}) scale(${f2(s)})`);
      trail.setAttribute('x1', ox); trail.setAttribute('y1', oy); trail.setAttribute('x2', f2(px)); trail.setAttribute('y2', f2(py)); trail.style.opacity = 0.5;
    } else {
      const f = (t - FL) / (1 - FL); const s = 1 + 0.38 * Math.sin(Math.PI * f) * (1 - f * 0.4);   // little squash-pop on landing
      g.setAttribute('transform', `translate(${x} ${y}) scale(${f2(s)})`);
      circ.style.fill = ''; if (txt) txt.style.opacity = f;
      trail.style.opacity = 0.5 * (1 - f);
    }
  }, () => { g.setAttribute('transform', `translate(${x} ${y})`); g.style.opacity = ''; circ.style.fill = ''; if (txt) txt.style.opacity = ''; trail.remove(); ripple(svg, x, y, 8, 1.4, getComputedStyle(circ).fill); });
}
function animSpray(g, delay) {
  const ln = g.querySelector('.hit-ln'); const dot = g.querySelector('.hit-dot'); const hx = +g.dataset.hx; const hy = +g.dataset.hy; const traj = g.dataset.traj;
  const x0 = +ln.getAttribute('x1'); const y0 = +ln.getAttribute('y1'); const air = /F|L|P/.test(traj);
  const dur = traj === 'G' || traj === 'B' ? 650 : 900; const svg = g.ownerSVGElement;
  g.style.opacity = 0;
  tween(g, dur, delay, (t) => {
    g.style.opacity = 1; const e = traj === 'G' || traj === 'B' ? ease.out(t) : ease.inOut(t);
    const x = x0 + (hx - x0) * e; const y = y0 + (hy - y0) * e;
    ln.setAttribute('x2', f2(x)); ln.setAttribute('y2', f2(y)); dot.setAttribute('cx', f2(x));
    const lift = air ? Math.sin(Math.PI * e) * (traj === 'P' ? 46 : traj === 'L' ? 10 : 30) : 0;     // fly balls arc up, grounders stay on the grass
    dot.setAttribute('cy', f2(y - lift)); dot.setAttribute('r', f2(6 * (1 + (air ? 0.45 * Math.sin(Math.PI * e) : 0))));
  }, () => { ln.setAttribute('x2', hx); ln.setAttribute('y2', hy); dot.setAttribute('cx', hx); dot.setAttribute('cy', hy); dot.setAttribute('r', 6); g.style.opacity = ''; ripple(svg, hx, hy, 6, 1.6, '#fff'); });
}

// ---------------------------------------------------------------------------------------------------------------------
// shot maps (hockey, soccer, basketball): dots pop in as a short chronological sequence; new ones pop on live refresh
// ---------------------------------------------------------------------------------------------------------------------
function animShot(g, n, liveNew) {
  const total = g.ownerSVGElement.querySelectorAll('[data-an="shot"]').length;
  const step = liveNew ? 160 : Math.max(8, Math.min(55, 1500 / Math.max(1, total)));
  const d = n * step; const goal = g.classList.contains('goal-an');
  wa(g, [{ transform: 'scale(0)', opacity: 0 }, { transform: `scale(${goal ? 1.9 : 1.5})`, opacity: 1, offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: goal ? 520 : 360, delay: d, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
  if (goal || liveNew) setTimeout(() => {
    if (!g.isConnected) return; let b; try { b = g.getBBox(); } catch { return; }
    const col = getComputedStyle(g.firstElementChild).getPropertyValue('--c') || '#fff';
    ripple(g.parentNode, b.x + b.width / 2, b.y + b.height / 2, Math.max(b.width, b.height) * 0.75, Math.max(0.3, b.width * 0.12), col.trim() || '#fff');
  }, d + 180);
}

// ---------------------------------------------------------------------------------------------------------------------
// golf bars grow to their values; rows that moved up/down slide into place
// ---------------------------------------------------------------------------------------------------------------------
function animGolf(rows, forceAll, rm) {
  const rowH = rows.length > 1 ? rows[1].offsetTop - rows[0].offsetTop : 0;
  rows.forEach((row, i) => {
    const id = row.dataset.gid; const w = +row.dataset.w; const v = +row.dataset.v; const bar = row.querySelector('.tr b');
    const prev = R.vals.get(`gb:${id}`); R.vals.set(`gb:${id}`, { w, v, i });
    if (rm || !bar) return;
    const sameSide = prev && Math.sign(prev.v) === Math.sign(v);
    if (forceAll || !prev) {
      wa(bar, [{ width: '0%' }, { width: `${w}%` }], { duration: 650, delay: Math.min(i * 45, 450), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      if (!forceAll && !prev) wa(row, [{ opacity: 0 }, { opacity: 1 }], { duration: 400 });
      return;
    }
    if (prev.w !== w) wa(bar, [{ width: `${sameSide ? prev.w : 0}%` }, { width: `${w}%` }], { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)' });
    if (prev.i !== i && rowH) {
      wa(row, [{ transform: `translateY(${(prev.i - i) * rowH}px)`, background: 'color-mix(in srgb, var(--accent, #F56600) 18%, transparent)' }, { transform: 'none', background: 'transparent' }], { duration: 700, easing: 'cubic-bezier(.2,.8,.3,1)' });
    } else if (prev.v !== v) wa(row, [{ background: 'color-mix(in srgb, var(--accent, #F56600) 18%, transparent)' }, { background: 'transparent' }], { duration: 1000 });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// tennis: set bars grow; serving ball does one serve when the card opens and slides to the other side when the server changes
// ---------------------------------------------------------------------------------------------------------------------
function animSets(el, i, forceIt, rm) {
  const k = el.dataset.sk; const ws = [...el.querySelectorAll('.b i')].map((x) => +x.dataset.w); const prev = R.vals.get(`sb:${k}`); R.vals.set(`sb:${k}`, ws);
  if (rm) return;
  [...el.querySelectorAll('.b i')].forEach((b, j) => {
    if (forceIt || !prev) wa(b, [{ width: '0%' }, { width: `${ws[j]}%` }], { duration: 650, delay: i * 120, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    else if (prev[j] !== ws[j]) wa(b, [{ width: `${prev[j]}%` }, { width: `${ws[j]}%` }], { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)' });
  });
}
function animServe(ball, forceIt, rm) {
  const srv = +ball.dataset.srv; const x = +ball.getAttribute('cx'); const y = +ball.getAttribute('cy'); const prev = R.vals.get('srv'); R.vals.set('srv', srv);
  if (rm) return;
  const svg = ball.ownerSVGElement;
  if (!forceIt && (prev == null || prev === srv)) return;
  if (prev != null && prev !== srv && !forceIt) { // server changed: ball glides across to the new server
    const px = prev === 0 ? 14 : 106; const py = prev === 0 ? 46 : 14;
    tween(ball, 700, 0, (t) => { const e = ease.inOut(t); ball.setAttribute('cx', f2(px + (x - px) * e)); ball.setAttribute('cy', f2(py + (y - py) * e - Math.sin(Math.PI * e) * 8)); }, () => { ball.setAttribute('cx', x); ball.setAttribute('cy', y); });
    return;
  }
  // one demonstration serve, diagonally into the opposite service box, then the ball returns to the server
  const tx = srv === 0 ? 78 : 42; const ty = srv === 0 ? 20 : 40;
  const shadow = document.createElementNS(NS, 'ellipse'); shadow.setAttribute('class', 'tb-shadow'); shadow.setAttribute('rx', 2.6); shadow.setAttribute('ry', 1); svg.insertBefore(shadow, ball);
  tween(ball, 900, 350, (t) => {
    const e = ease.out(t); const lift = Math.sin(Math.PI * e); const gx = x + (tx - x) * e; const gy = y + (ty - y) * e;
    ball.setAttribute('cx', f2(gx)); ball.setAttribute('cy', f2(gy - lift * 10)); ball.setAttribute('r', f2(3 * (1 + 0.4 * lift)));
    shadow.setAttribute('cx', f2(gx)); shadow.setAttribute('cy', f2(gy)); shadow.style.opacity = 0.35 * (1 - 0.5 * lift);
  }, () => {
    ball.setAttribute('r', 3); shadow.remove(); ripple(svg, tx, ty, 3, 0.8, '#fff');
    ball.setAttribute('cx', x); ball.setAttribute('cy', y); wa(ball, [{ opacity: 0 }, { opacity: 1 }], { duration: 450, delay: 250, fill: 'backwards' });
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// racing podium rises
// ---------------------------------------------------------------------------------------------------------------------
function animPodium(pd) {
  const blk = pd.querySelector('.blk'); const h = +blk.dataset.h; const place = +/p(\d)/.exec(pd.className)[1]; const d = (3 - place) * 130 + (place === 1 ? 60 : 0);
  wa(blk, [{ height: '0px' }, { height: `${h}px` }], { duration: 650, delay: d, easing: 'cubic-bezier(.2,.9,.3,1.1)', fill: 'backwards' });
  const who = pd.querySelector('.who'); if (who) wa(who, [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 450, delay: d + 350, fill: 'backwards', easing: 'ease-out' });
}
