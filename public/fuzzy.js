// Search matching (v1.5.0), shared by the browser picker and the server player index (server/search.js).
// Accent- and punctuation-insensitive ("Åberg" = "aberg", "St. John's" = "st johns"), typo-tolerant
// (McElroy -> McIlroy, Djokovich -> Djokovic, Schefler -> Scheffler) and alias-aware for teams (Niners, Bama, Habs, Barça...).
const SPECIAL = { 'ø': 'o', 'Ø': 'o', 'æ': 'ae', 'Æ': 'ae', 'œ': 'oe', 'Œ': 'oe', 'ß': 'ss', 'ł': 'l', 'Ł': 'l', 'đ': 'd', 'Đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i', 'ħ': 'h' };
/** fold to plain lowercase ascii words */
export function fold(s) {
  return String(s == null ? '' : s).replace(/[øØæÆœŒßłŁđĐðþıħ]/g, (c) => SPECIAL[c]).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ').replace(/['’‘`´.]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
export const tokens = (s) => { const f = fold(s); return f ? f.split(' ') : []; };
/** consonant skeleton for sound-alike names: McElroy / McIlroy / MacIlroy -> "mclr" */
export function skel(t) {
  return t.replace(/^mac/, 'mc').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/ch/g, 'k').replace(/[cq]/g, 'k').replace(/z/g, 's').replace(/y/g, 'i')
    .replace(/(.)(?=\1)/g, '').replace(/(?!^)[aeiouhw]/g, '');
}
/** optimal-string-alignment (Damerau) distance, bailing out above max */
export function dist(a, b, max = 2) {
  if (a === b) return 0; if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length; let p2 = null, p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i]; let lo = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c.push(v); if (v < lo) lo = v;
    }
    if (lo > max) return max + 1; p2 = p; p = c;
  }
  return p[n];
}
const allow = (len) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);
/** one query word vs one name word, 0..1 */
export function wordScore(q, t) {
  if (!q || !t) return 0;
  if (q === t) return 1;
  if (t.startsWith(q)) return q.length >= 3 ? 0.92 : q.length === 2 ? 0.8 : 0.6;
  if (q.length >= 4 && t.includes(q)) return 0.7;
  const a = allow(q.length); if (!a) return 0;
  const d = dist(q, t, a); if (d <= a) return d === 1 ? 0.82 : 0.7;
  if (q.length >= 4 && t.length > q.length && dist(q, t.slice(0, q.length), 1) <= 1) return 0.62; // typo while still typing
  if (q.length >= 5 && Math.abs(q.length - t.length) <= 2) { const k = skel(q); if (k.length >= 4 && k === skel(t)) return 0.75; }
  return 0;
}
/** how well query `q` matches a name (plus extra words/aliases). Every query word must match something; 0 = no match. */
export function scoreName(q, name, extra = []) {
  const qf = fold(q); if (!qf) return 0;
  const qt = qf.split(' '); const nf = fold(name); const nt = nf ? nf.split(' ') : [];
  const xs = extra.map(fold).filter(Boolean);
  if (qf === nf || xs.includes(qf)) return 1.1; // exact full name or alias
  const qj = qf.replace(/ /g, ''); if (qj.length >= 4 && (nf.replace(/ /g, '') === qj || xs.some((x) => x.replace(/ /g, '') === qj))) return 1.05; // "mcilroy" vs "mc ilroy", "dechambeau"
  const hay = nt.concat(...xs.map((x) => x.split(' ')));
  if (!hay.length) return 0;
  let tot = 0;
  for (const w of qt) {
    let b = 0; for (const t of hay) { const s = wordScore(w, t); if (s > b) b = s; if (b === 1) break; }
    if (!b) { // a multi-word alias phrase typed partly ("ole miss" inside alias), or nothing
      if (xs.some((x) => x.includes(qf))) return 0.9; return 0;
    }
    tot += b;
  }
  let s = tot / qt.length;
  if (nt.length && wordScore(qt[qt.length - 1], nt[nt.length - 1]) >= 0.8) s += 0.03; // last-name hit ranks first
  if (nf.startsWith(qf)) s += 0.05;
  return s;
}
/** rank items by match: returns [{item, score}] best first. key(item) -> name, extra(item) -> [aliases/other fields] */
export function rank(list, q, { key = (x) => x.name, extra = () => [], min = 0.6, limit = 50, tie = () => 0 } = {}) {
  const out = [];
  for (const it of list || []) { const s = scoreName(q, key(it), extra(it)); if (s >= min) out.push({ item: it, score: s }); }
  out.sort((a, b) => b.score - a.score || tie(a.item, b.item));
  return limit ? out.slice(0, limit) : out;
}
export const search = (list, q, opt) => rank(list, q, opt).map((r) => r.item);
