// Dynamic page backdrop: a fixed layer behind the app showing sport art (drawn here as SVG, no licensed images)
// or the current team's colors + a large, pre-blurred logo. Gamecasts split both teams diagonally.
// Crossfades between layers; honours prefers-reduced-motion; parallax is a tiny transform on one layer only.
const root = document.getElementById('bd');
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
let key = '';

import { CATALOG } from './catalog.js';
export const ACCENT = Object.fromEntries(Object.entries(CATALOG).map(([k, c]) => [k, c.accent]));
const FAMILY = (sp) => (CATALOG[sp] || {}).family || 'football';
const hex = (c, d = '1f2937') => `#${/^[0-9a-f]{6}$/i.test(c || '') ? c : d}`;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- sport art (viewBox 0 0 400 800; stroked with currentColor) ----
function football() {
  let s = '';
  for (let i = 0; i < 10; i++) s += `<rect x="0" y="${i * 80}" width="400" height="40" class="band"/>`;
  for (let i = 0; i <= 20; i++) {
    const y = i * 40; s += `<line x1="0" y1="${y}" x2="400" y2="${y}" class="${i % 2 ? 'thin' : ''}"/>`;
    if (i % 2 === 0 && i > 0 && i < 20) { const n = 10 * (i <= 10 ? i / 2 : 10 - i / 2); s += `<text x="44" y="${y + 10}" class="num" transform="rotate(90 44 ${y})">${n === 50 ? '50' : n}</text><text x="356" y="${y - 10}" class="num" transform="rotate(-90 356 ${y})">${n}</text>`; }
  }
  for (let y = 4; y < 800; y += 8) s += `<line x1="150" y1="${y}" x2="162" y2="${y}" class="hash"/><line x1="238" y1="${y}" x2="250" y2="${y}" class="hash"/>`;
  s += '<path d="M200 640 l-38 -60 l38 -60 l38 60z" class="fat" opacity=".0"/>';
  return s;
}
function baseball() {
  return `<circle cx="200" cy="560" r="330" class="fill"/>
    <path d="M200 700 L330 570 L200 440 L70 570 Z" class="fat"/>
    <path d="M200 700 L40 540 M200 700 L360 540" />
    <path d="M70 570 A185 185 0 0 1 330 570" class="thin"/>
    <circle cx="200" cy="570" r="22" class="fat"/>
    ${[[330, 570], [200, 440], [70, 570]].map(([x, y]) => `<rect x="${x - 8}" y="${y - 8}" width="16" height="16" transform="rotate(45 ${x} ${y})" class="solid"/>`).join('')}
    <path d="M192 700 h16 v8 l-8 8 l-8 -8z" class="solid"/>
    <g transform="translate(318 120)"><circle r="96" class="fat"/>
      <path d="M-62 -72 C-20 -36 -20 36 -62 72 M62 -72 C20 -36 20 36 62 72" />
      ${Array.from({ length: 9 }, (_, i) => { const t = (i - 4) * 15; return `<path d="M${-44 + Math.abs(t) * 0.5} ${t * 1.0 - 6} l-12 6 M${44 - Math.abs(t) * 0.5} ${t * 1.0 - 6} l12 6" class="thin"/>`; }).join('')}</g>`;
}
function golf() {
  let s = '';
  for (let i = 1; i <= 9; i++) s += `<ellipse cx="230" cy="520" rx="${i * 34}" ry="${i * 20}" class="${i % 3 ? 'thin' : ''}"/>`;
  s += `<circle cx="230" cy="520" r="9" class="solid"/><line x1="230" y1="520" x2="230" y2="330" class="fat"/><path d="M230 330 l70 22 l-70 22z" class="solid"/>`;
  s += '<g transform="translate(90 150)"><circle r="70" class="fat"/>';
  for (let y = -56; y <= 56; y += 16) for (let x = -56; x <= 56; x += 16) if (x * x + y * y < 3600) s += `<circle cx="${x + (Math.abs(y / 16) % 2 ? 8 : 0)}" cy="${y}" r="4" class="thin"/>`;
  return s + '</g>';
}
function tennis() {
  return `<rect x="60" y="60" width="280" height="680" class="fat"/>
    <line x1="95" y1="60" x2="95" y2="740"/><line x1="305" y1="60" x2="305" y2="740"/>
    <line x1="95" y1="240" x2="305" y2="240"/><line x1="95" y1="560" x2="305" y2="560"/>
    <line x1="200" y1="240" x2="200" y2="560"/><line x1="30" y1="400" x2="370" y2="400" class="net"/>
    <line x1="200" y1="60" x2="200" y2="72"/><line x1="200" y1="728" x2="200" y2="740"/>
    <g transform="translate(300 170)"><circle r="54" class="fill2"/><path d="M-38 -38 C-8 -12 -8 12 -38 38 M38 -38 C8 -12 8 12 38 38" class="fat"/></g>`;
}
function basketball() {
  return `<rect x="30" y="40" width="340" height="720" class="fat"/><line x1="30" y1="400" x2="370" y2="400"/>
    <circle cx="200" cy="400" r="60"/><circle cx="200" cy="400" r="20" class="thin"/>
    <rect x="140" y="40" width="120" height="190"/><circle cx="200" cy="230" r="60" class="thin"/>
    <path d="M60 40 L60 120 A150 150 0 0 0 340 120 L340 40" class="fat"/>
    <rect x="140" y="570" width="120" height="190"/><circle cx="200" cy="570" r="60" class="thin"/>
    <path d="M60 760 L60 680 A150 150 0 0 1 340 680 L340 760" class="fat"/>
    <g transform="translate(300 300)"><circle r="70" class="fill2"/><circle r="70" class="fat"/><path d="M-70 0 H70 M0 -70 V70 M-50 -50 C-20 -20 -20 20 -50 50 M50 -50 C20 -20 20 20 50 50"/></g>`;
}
function hockey() {
  return `<rect x="30" y="40" width="340" height="720" rx="110" class="fat"/><line x1="30" y1="400" x2="370" y2="400" class="net"/>
    <line x1="30" y1="290" x2="370" y2="290" class="fat"/><line x1="30" y1="510" x2="370" y2="510" class="fat"/>
    <line x1="30" y1="100" x2="370" y2="100" class="thin"/><line x1="30" y1="700" x2="370" y2="700" class="thin"/>
    <circle cx="200" cy="400" r="54"/>${[[110, 190], [290, 190], [110, 610], [290, 610]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="44" class="thin"/><circle cx="${x}" cy="${y}" r="5" class="solid"/>`).join('')}
    <path d="M170 100 A30 30 0 0 0 230 100" class="fill2"/><path d="M170 700 A30 30 0 0 1 230 700" class="fill2"/>`;
}
function soccer() {
  return `<rect x="30" y="40" width="340" height="720" class="fat"/><line x1="30" y1="400" x2="370" y2="400"/>
    <circle cx="200" cy="400" r="70"/><circle cx="200" cy="400" r="5" class="solid"/>
    <rect x="95" y="40" width="210" height="120"/><rect x="150" y="40" width="100" height="44" class="thin"/><path d="M160 160 A50 50 0 0 0 240 160" class="thin"/>
    <rect x="95" y="640" width="210" height="120"/><rect x="150" y="716" width="100" height="44" class="thin"/><path d="M160 640 A50 50 0 0 1 240 640" class="thin"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="30" y="${40 + i * 80}" width="340" height="40" class="band"/>`).join('')}`;
}
function mma() {
  const pts = (r) => Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return `${200 + r * Math.cos(a)},${400 + r * Math.sin(a)}`; }).join(' ');
  return `<polygon points="${pts(185)}" class="fat"/><polygon points="${pts(165)}" class="thin"/><polygon points="${pts(185)}" class="fill"/>
    <circle cx="200" cy="400" r="40" class="thin"/>${Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + i * Math.PI / 4; return `<circle cx="${200 + 185 * Math.cos(a)}" cy="${400 + 185 * Math.sin(a)}" r="7" class="solid"/>`; }).join('')}`;
}
function boxing() {
  return `<rect x="40" y="220" width="320" height="320" class="fat"/>${[240, 262, 284].map((o, i) => `<rect x="${200 - o / 1.6}" y="${380 - o / 1.6}" width="${o * 1.25}" height="${o * 1.25}" class="${i ? 'thin' : ''}"/>`).join('')}
    ${[[40, 220], [360, 220], [40, 540], [360, 540]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="12" class="solid"/>`).join('')}`;
}
function racing() {
  let s = '';
  for (let r = 0; r < 6; r++) for (let c = 0; c < 10; c++) if ((r + c) % 2) s += `<rect x="${c * 40}" y="${40 + r * 30}" width="40" height="30" class="solid"/>`;
  s += '<path d="M60 760 C60 520 340 600 340 380 C340 220 120 300 120 230" class="fat"/><path d="M90 760 C90 545 370 620 370 380 C370 200 150 290 150 230" class="thin"/>';
  for (let i = 0; i < 14; i++) s += `<line x1="0" y1="${300 + i * 36}" x2="400" y2="${260 + i * 36}" class="thin" opacity=".35"/>`;
  return s;
}
const ART = { football, baseball, golf, tennis, basketball, hockey, soccer, mma, boxing, racing };
const artSVG = (sp) => `<svg class="bd-art" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${(ART[FAMILY(sp)] || football)()}</svg>`;

// ---- layer builders ----
function sportLayer(sp, extra = '') {
  const a = ACCENT[sp] || ACCENT.cfb;
  return `<div class="bd-layer bd-sport bd-${sp}" style="--a:${a}"><div class="bd-glow"></div><div class="bd-par">${artSVG(sp)}</div>${extra}<div class="bd-scrim"></div></div>`;
}
function teamHalf(t, side) {
  const c1 = hex(t.color); const c2 = hex(t.alt, t.color);
  return `<div class="bd-half ${side}" style="--c1:${c1};--c2:${c2}">${t.logo ? `<img class="bd-logo" src="${esc(t.logo)}" alt="" decoding="async" />` : ''}</div>`;
}

function paint(k, html) {
  if (!root || k === key) return;
  key = k;
  const el = document.createElement('div'); el.innerHTML = html; const layer = el.firstElementChild;
  root.appendChild(layer);
  const old = [...root.children].filter((x) => x !== layer);
  if (reduce.matches) { old.forEach((o) => o.remove()); layer.classList.add('on'); return; }
  requestAnimationFrame(() => requestAnimationFrame(() => layer.classList.add('on')));
  old.forEach((o) => { o.classList.remove('on'); setTimeout(() => o.remove(), 700); });
}

/** Sport home / lists / settings */
export function setSport(sp) { document.documentElement.dataset.sport = sp; paint(`s:${sp}`, sportLayer(sp)); }
/** Team page: team colors + big faded logo */
export function setTeam(t, sp) {
  if (sp) document.documentElement.dataset.sport = sp;
  paint(`t:${t.id}`, `<div class="bd-layer bd-team">${teamHalf(t, 'full')}${sp ? `<div class="bd-par bd-faint" style="--a:#fff">${artSVG(sp)}</div>` : ''}<div class="bd-scrim"></div></div>`);
}
/** Gamecast: both teams split diagonally (away left/top, home right/bottom) */
export function setGame(away, home, sp) {
  if (sp) document.documentElement.dataset.sport = sp;
  paint(`g:${away.id}:${home.id}`, `<div class="bd-layer bd-game">${teamHalf(away, 'a')}${teamHalf(home, 'h')}<div class="bd-par bd-faint" style="--a:#fff">${artSVG(sp)}</div><div class="bd-seam"></div><div class="bd-scrim"></div></div>`);
}
/** Golf / tennis: sport art plus player flag(s) or headshot */
export function setPlayers(sp, imgs) {
  document.documentElement.dataset.sport = sp;
  const list = (imgs || []).filter(Boolean).slice(0, 2);
  const extra = list.map((src, i) => `<img class="bd-flag f${i}${list.length === 1 ? ' solo' : ''}" src="${esc(src)}" alt="" decoding="async" />`).join('');
  paint(`p:${sp}:${list.join('|')}`, sportLayer(sp, extra));
}

// subtle parallax: one transform on the art layer, rAF-throttled, off for reduced motion
let ticking = false;
addEventListener('scroll', () => {
  if (reduce.matches || ticking) return; ticking = true;
  requestAnimationFrame(() => { root?.style.setProperty('--py', `${Math.min(scrollY, 2000) * -0.06}px`); ticking = false; });
}, { passive: true });
