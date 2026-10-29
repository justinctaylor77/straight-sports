// Logo contrast (v1.5.0): make every team/league logo readable on whatever surface it sits on, in every theme.
// Rule (documented in HANDOFF/QA report): a logo PASSES when at least half of its silhouette edge pixels reach 3:1 contrast
// against the background directly behind it (WCAG 2.x SC 1.4.11 "non-text contrast" threshold for graphical objects).
// Logos that fail get a thin 1px outline in the opposite tone (light on dark surfaces, dark on light ones), which restores
// the silhouette without a heavy chip. Pure functions are exported so the audit (scripts/audit-logo-contrast.js) runs the same math.
export const MIN = 3; export const EDGE_SHARE = 0.5; export const N = 48;
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
export const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const over = (c, a, bg) => [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a)];

/** pixels (RGBA Uint8ClampedArray, w x h) -> silhouette edge samples + body samples: [[r,g,b,a], ...] */
export function extract(px, w, h) {
  const A = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : px[(y * w + x) * 4 + 3]);
  const edge = []; const body = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4; const a = px[i + 3]; if (a < 128) continue;
    const s = [px[i], px[i + 1], px[i + 2], a / 255];
    if (A(x - 1, y) < 128 || A(x + 1, y) < 128 || A(x, y - 1) < 128 || A(x, y + 1) < 128) edge.push(s); else body.push(s);
  }
  return { edge, body, n: edge.length + body.length };
}
/** score a logo's samples against a background rgb. edge/body = share of pixels at >= 3:1. */
export function score(st, bg) {
  if (!st || !st.n) return { edge: 1, body: 1, pass: true, empty: true };
  const share = (arr) => (arr.length ? arr.filter((s) => contrast(over(s, s[3], bg), bg) >= MIN).length / arr.length : 0);
  const edge = share(st.edge); const body = share(st.body);
  return { edge, body, pass: edge >= EDGE_SHARE };
}
/** the fix: which outline (if any) and the post-fix edge share (the outline ring becomes the new silhouette edge) */
export function fixFor(st, bg) {
  const s = score(st, bg); if (s.pass) return { cls: '', before: s, after: s };
  const dark = lum(bg) < 0.18; const ring = dark ? [255, 255, 255] : [0, 0, 0]; const ra = dark ? 0.92 : 0.8;
  const after = { edge: contrast(over(ring, ra, bg), bg) >= MIN ? 1 : 0, body: s.body }; after.pass = after.edge >= EDGE_SHARE;
  return { cls: dark ? 'lt-lift' : 'lt-sink', before: s, after };
}
/** parse a computed CSS color (rgb[a](), color(srgb ...)) -> [r,g,b,a] or null */
export function parseColor(str) {
  let m = /rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\)/.exec(str || '');
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
  m = /color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/.exec(str || '');
  if (m) return [m[1] * 255, m[2] * 255, m[3] * 255, m[4] == null ? 1 : +m[4]];
  return null;
}
const gradColor = (img) => { const cs = String(img || '').match(/rgba?\([^)]*\)|color\(srgb[^)]*\)/g); if (!cs) return null; const p = cs.map(parseColor).filter(Boolean); if (!p.length) return null;
  const a = p.reduce((s, c) => s + c[3], 0) / p.length; return [p.reduce((s, c) => s + c[0], 0) / p.length, p.reduce((s, c) => s + c[1], 0) / p.length, p.reduce((s, c) => s + c[2], 0) / p.length, a]; };
/** effective opaque background behind an element: composite ancestor backgrounds until opaque (page bg last) */
export function bgOf(el) {
  const layers = [];
  for (let n = el; n; n = n.parentElement) { // the img's own background first (e.g. the white header tile)
    const cs = getComputedStyle(n); const c = parseColor(cs.backgroundColor); const g = gradColor(cs.backgroundImage);
    for (const x of [g, c]) if (x && x[3] > 0.02) layers.push(x);
    if (layers.length && layers[layers.length - 1][3] >= 0.99) break;
  }
  let out = [255, 255, 255]; const rootBg = parseColor(getComputedStyle(document.documentElement).getPropertyValue('--bg')) || parseColor(getComputedStyle(document.body).backgroundColor);
  if (rootBg) out = rootBg.slice(0, 3);
  for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], layers[i][3], out);
  return out.map(Math.round);
}

// ---------- runtime (browser only) ----------
const CORS = /^https:\/\/(a\.espncdn\.com|a\d?\.espncdn\.com|www\.mlbstatic\.com)\//;
const stats = new Map();
function statsOf(img) {
  const k = img.currentSrc || img.src; if (stats.has(k)) return stats.get(k);
  let st = null;
  try {
    const w = img.naturalWidth, h = img.naturalHeight; if (!w || !h) return null;
    const sc = Math.min(N / w, N / h); const cw = Math.max(1, Math.round(w * sc)), ch = Math.max(1, Math.round(h * sc));
    const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch; const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cw, ch); st = extract(g.getImageData(0, 0, cw, ch).data, cw, ch);
  } catch { st = null; } // tainted (no CORS): leave the logo untouched
  stats.set(k, st); return st;
}
export function check(img) {
  if (!img || img.tagName !== 'IMG' || !img.complete || !img.naturalWidth) return;
  if (img.classList.contains('hs') || img.classList.contains('flag') || img.classList.contains('bd-logo') || img.classList.contains('bd-flag')) return;
  const src = img.currentSrc || img.src; if (!CORS.test(src) || !img.crossOrigin) return;
  const st = statsOf(img); if (!st) return;
  const bg = bgOf(img); const f = fixFor(st, bg);
  img.classList.toggle('lt-lift', f.cls === 'lt-lift'); img.classList.toggle('lt-sink', f.cls === 'lt-sink');
  img.dataset.lt = `${f.before.pass ? 'pass' : 'fixed'}:${Math.round(f.before.edge * 100)}`;
}
export function install(root = document) {
  root.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG') check(e.target); }, true);
  // a logo host without CORS headers: drop the crossorigin attribute and load it plainly (it just won't be measured)
  root.addEventListener('error', (e) => { const t = e.target; if (t && t.tagName === 'IMG' && t.crossOrigin && !t.dataset.ltRetry) { t.dataset.ltRetry = '1'; t.removeAttribute('crossorigin'); const s = t.src; t.src = ''; t.src = s; } }, true);
  return { recheck: () => document.querySelectorAll('img[crossorigin]').forEach(check) };
}
