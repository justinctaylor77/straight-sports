// Team pages: re-skin the whole page in the team's ESPN colors (primary + alternate), keeping text readable.
// Everything is set as inline CSS variables on <html>, so removing them (clearTeamTheme) restores the USA theme.
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const parse = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(h || '').trim()); if (!m) return null; const n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (c) => `#${c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('')}`;
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export const contrast = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const mix = (a, b, t) => a.map((v, i) => v * (1 - t) + b[i] * t);
function toHsl([r, g, b]) { r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b); const mn = Math.min(r, g, b); const l = (mx + mn) / 2; let h = 0; let s = 0;
  if (mx !== mn) { const d = mx - mn; s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h /= 6; } return [h, s, l]; }
function fromHsl([h, s, l]) { const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  if (!s) return [l * 255, l * 255, l * 255]; const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q; return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255]; }
const WHITE = [255, 255, 255]; const BLACK = [0, 0, 0];
const bestInk = (bg) => (contrast(bg, WHITE) >= contrast(bg, [6, 18, 37]) ? '#ffffff' : '#061225');
/** nudge `c` lighter (dark UI) or darker (light UI) until it reaches `min` contrast against `bg` */
function readable(c, bg, dark, min = 4.6) { let out = c; for (let i = 0; i < 24 && contrast(out, bg) < min; i++) out = mix(out, dark ? WHITE : BLACK, 0.08); return out; }

const KEYS = ['--bg', '--surface', '--surface-2', '--outer', '--border', '--chip', '--glass', '--glass-2', '--scrim', '--accent', '--accent-h', '--accent-ink', '--accent-soft', '--fill', '--fill-ink',
  '--olive', '--olive-t', '--olive-ink', '--olive-soft', '--live', '--stripe-a', '--stripe-b', '--stripe-c', '--team-accent', '--hero', '--hero-2'];

/** pure: palette for a team (so it can be unit-tested). Returns null when the team has no usable color. */
export function teamPalette(color, alt, dark) {
  const p = parse(color); if (!p) return null;
  let a = parse(alt) || null;
  const [h, s0] = toHsl(p); const s = Math.min(s0, 0.62);
  const L = dark ? { bg: 0.07, sf: 0.115, sf2: 0.16, out: 0.04 } : { bg: 0.955, sf: 1, sf2: 0.925, out: 0.9 };
  const hs = (l, sat = s) => fromHsl([h, dark ? sat : Math.min(sat, 0.55), l]);
  const bg = hs(L.bg); const surface = L.sf === 1 ? WHITE : hs(L.sf); const surface2 = hs(L.sf2); const outer = hs(L.out);
  // secondary: the alternate color unless it's basically the same color (or missing), then a shifted version of the primary
  if (!a || contrast(a, p) < 1.25) a = dark ? mix(p, WHITE, 0.5) : mix(p, BLACK, 0.45);
  // primary accent text: team color nudged until it reads on the page background
  const acc = readable(p, dark ? surface : WHITE, dark);
  const accH = mix(acc, dark ? WHITE : BLACK, 0.18);
  const sec = readable(a, dark ? surface : WHITE, dark);
  // solid fills (buttons/chips) use the team color itself, with ink picked by contrast; very pale/very dark colors get adjusted so they still stand out from the page
  let fill = p; if (contrast(fill, bg) < 1.8) fill = dark ? mix(fill, WHITE, 0.3) : mix(fill, BLACK, 0.3);
  let fill2 = a; if (contrast(fill2, bg) < 1.8) fill2 = dark ? mix(fill2, WHITE, 0.35) : mix(fill2, BLACK, 0.35);
  // hero banner: team color darkened until white text reads on it (>= 5:1); second stop is the alternate color, treated the same
  const heroOf = (c) => { let o = c; for (let i = 0; i < 30 && contrast(o, WHITE) < 5; i++) o = mix(o, BLACK, 0.07); return o; };
  const hero = heroOf(p); const hero2 = mix(heroOf(a), BLACK, 0.12);
  const rgba = (c, al) => `rgba(${c.map((v) => Math.round(v)).join(',')},${al})`;
  return {
    '--bg': toHex(bg), '--surface': toHex(surface), '--surface-2': toHex(surface2), '--outer': toHex(outer),
    '--border': dark ? rgba(mix(p, WHITE, 0.6), 0.2) : rgba(mix(p, BLACK, 0.3), 0.2), '--chip': dark ? rgba(mix(p, WHITE, 0.6), 0.1) : rgba(mix(p, BLACK, 0.3), 0.08),
    '--glass': rgba(surface, 0.84), '--glass-2': rgba(surface2, 0.7), '--scrim': rgba(bg, dark ? 0.64 : 0.8),
    '--accent': toHex(acc), '--accent-h': toHex(accH), '--accent-ink': bestInk(acc), '--accent-soft': rgba(acc, dark ? 0.17 : 0.11),
    '--fill': toHex(fill), '--fill-ink': bestInk(fill),
    '--olive': toHex(fill2), '--olive-t': toHex(sec), '--olive-ink': bestInk(fill2), '--olive-soft': rgba(sec, dark ? 0.2 : 0.11),
    '--live': toHex(readable([255, 92, 108], dark ? surface : WHITE, dark, 3.2)),
    '--stripe-a': toHex(fill), '--stripe-b': '#ffffff', '--stripe-c': toHex(fill2), '--team-accent': toHex(acc), '--hero': toHex(hero), '--hero-2': toHex(hero2),
  };
}

export function applyTeamTheme(team, dark) {
  const root = document.documentElement;
  const pal = team && teamPalette(team.color, team.alt || team.alternateColor, dark);
  if (!pal) { clearTeamTheme(); return null; }
  for (const k of KEYS) { if (pal[k]) root.style.setProperty(k, pal[k]); else root.style.removeProperty(k); }
  if (pal['--live'] && pal['--live'] !== '') root.style.setProperty('--live', pal['--live']);
  root.dataset.team = String(team.id || '1');
  return pal;
}
export function clearTeamTheme() {
  const root = document.documentElement; if (!root.dataset.team && !root.style.getPropertyValue('--accent')) return;
  for (const k of KEYS) root.style.removeProperty(k);
  delete root.dataset.team;
}
