// JT Power Rankings: transparent, computed top lists for the pro leagues (NFL, NBA, WNBA, MLB), plus the movement /
// snapshot helpers shared by every list. Pure functions (no network); server/feeds.js supplies the data.
//
// Formula (same for every league, only the constants differ; shown in the app's method footnote):
//   A = shrunk win%      (W + ½T + k/2) / (G + k)            k pulls early-season records toward .500
//   B = shrunk margin    clamp(0.5 + (diff/G × G/(G+k)) / (5 × scale), 0, 1)   points (runs) per game, same shrink
//   C = recent form      (last-10 wins + 1) / (last-10 games + 2)               falls back to A when ESPN has no last-10
//   score = 100 × (0.50·A + 0.35·B + 0.15·C)
// Ties on score break on win%, then point differential. No manual overrides, no schedule-strength adjustment.
const fs = require('fs');
const path = require('path');

const LEAGUES = {
  nfl:  { name: 'NFL',  size: 32, unit: 'points', k: 3,  scale: 7 },
  nba:  { name: 'NBA',  size: 30, unit: 'points', k: 8,  scale: 5 },
  wnba: { name: 'WNBA', size: 0,  unit: 'points', k: 6,  scale: 4 },
  mlb:  { name: 'MLB',  size: 30, unit: 'runs',   k: 15, scale: 0.7 },
};
const W = { win: 0.5, margin: 0.35, form: 0.15 };

const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/[+,]/g, '')); return Number.isFinite(n) ? n : null; };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ESPN standings entry → flat stats. Defensive about missing / renamed stats.
function statsOf(entry) {
  const m = {};
  for (const s of entry.stats || []) { const v = s.value != null ? s.value : s.displayValue; m[s.name] = v; m[`${s.name}#d`] = s.displayValue; }
  const get = (...ks) => { for (const k of ks) if (m[k] != null && m[k] !== '') return num(m[k]); return null; };
  const w = get('wins') ?? 0; const l = get('losses') ?? 0; const t = get('ties') ?? 0;
  let gp = get('gamesPlayed'); if (gp == null || gp < w + l + t) gp = w + l + t;
  const pf = get('pointsFor'); const pa = get('pointsAgainst');
  let diff = get('pointDifferential'); if (diff == null && pf != null && pa != null) diff = pf - pa; if (diff == null) diff = get('differential') != null && gp ? get('differential') * gp : null;
  const l10 = String(m['Last Ten Games#d'] || m['lastTen#d'] || m['Last Ten Games'] || '');
  const mm = l10.match(/^(\d+)-(\d+)(?:-(\d+))?/);
  const last10 = mm ? { w: +mm[1], l: +mm[2] + (mm[3] ? +mm[3] : 0) } : null;
  const overall = m['overall#d'] || m['overall'] || `${w}-${l}${t ? `-${t}` : ''}`;
  return { w, l, t, gp, pf, pa, diff, last10, overall: String(overall), streak: m['streak#d'] || m.streak || '', seed: get("playoffSeed") };
}

function powerScore(st, cfg) {
  const { k, scale } = cfg;
  const g = st.gp;
  const A = (st.w + 0.5 * st.t + k / 2) / (g + k);
  const perGame = st.diff != null && g > 0 ? st.diff / g : 0;
  const B = clamp(0.5 + (perGame * (g / (g + k))) / (5 * scale), 0, 1);
  const C = st.last10 ? (st.last10.w + 1) / (st.last10.w + st.last10.l + 2) : A;
  const score = 100 * (W.win * A + W.margin * B + W.form * C);
  return { score: Math.round(score * 100) / 100, A, B, C, perGame };
}

const sign = (n, d = 1) => (n > 0 ? '+' : '') + (Math.abs(n) >= 100 ? Math.round(n) : n.toFixed(d));
function whyOf(st, p, cfg) {
  const bits = [st.overall];
  if (st.diff != null && st.gp) bits.push(`${sign(p.perGame, cfg.unit === 'runs' ? 2 : 1)} ${cfg.unit}/game`);
  if (st.last10) bits.push(`last 10: ${st.last10.w}-${st.last10.l}`);
  if (st.streak) bits.push(st.streak);
  return bits.join(' · ');
}

// entries: [{ team, stats(ESPN entry.stats), conf, div }]; returns ranked rows (no movement yet).
function computePower(sport, entries) {
  const cfg = LEAGUES[sport]; if (!cfg) throw new Error(`no power formula for ${sport}`);
  const rows = entries.map((e) => {
    const st = statsOf(e); const p = powerScore(st, cfg);
    return { team: e.team, record: st.overall, w: st.w, l: st.l, t: st.t, gp: st.gp, diff: st.diff, streak: st.streak, last10: st.last10 ? `${st.last10.w}-${st.last10.l}` : null,
      conference: e.conf || null, division: e.div || null, score: p.score, parts: { win: +p.A.toFixed(3), margin: +p.B.toFixed(3), form: +p.C.toFixed(3) }, why: whyOf(st, p, cfg), _pct: (st.w + 0.5 * st.t) / (st.gp || 1) };
  });
  rows.sort((a, b) => b.score - a.score || b._pct - a._pct || (b.diff || 0) - (a.diff || 0) || String(a.team.name).localeCompare(String(b.team.name)));
  return rows.map((r, i) => { const { _pct, ...x } = r; return { rank: i + 1, ...x }; });
}

// ---- movement vs the previous snapshot ----
// prev: { date, ranks: { [teamId]: rank } } | null.  move: +n up / -n down / 0 same / 'new' / null (no previous snapshot).
function applyMovement(rows, prev) {
  if (!prev || !prev.ranks) return rows.map((r) => ({ ...r, prev: null, move: null }));
  return rows.map((r) => {
    const p = prev.ranks[String(r.team.id)];
    return { ...r, prev: p == null ? null : p, move: p == null ? 'new' : p - r.rank };
  });
}

// ---- snapshots: data/lists/<sport>/YYYY-MM-DD.json (+ latest.json). Same shape idea as data/grok-top25. ----
const dataDir = () => process.env.LISTS_DATA_DIR || path.join(__dirname, '..', 'data', 'lists');
const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
function snapshotDates(sport) {
  try { return fs.readdirSync(path.join(dataDir(), sport)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 10)).sort(); } catch { return []; }
}
function readSnapshot(sport, date) {
  if (!dateOk(date)) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dataDir(), sport, `${date}.json`), 'utf8')); } catch { return null; }
}
// Latest snapshot strictly BEFORE `today` (so a rebuild on the same day never compares with itself).
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
function previousSnapshot(sport, today, minAgeDays = 1) {
  const cut = addDays(today, -minAgeDays);
  const ds = snapshotDates(sport).filter((d) => d <= cut);
  return ds.length ? readSnapshot(sport, ds[ds.length - 1]) : null;
}
function makeSnapshot(sport, date, rows, extra = {}) {
  const ranks = {}; for (const r of rows) ranks[String(r.team.id)] = r.rank;
  return { sport, date, kind: 'jt-power', ...extra, ranks, order: rows.map((r) => ({ rank: r.rank, id: String(r.team.id), team: r.team.name, record: r.record, score: r.score })) };
}
// Best-effort write; never throws (read-only disks, tests, etc.). One file per calendar day, overwritten while the day lasts.
function saveSnapshot(sport, snap) {
  if (process.env.LISTS_NO_WRITE === '1') return false;
  try {
    const dir = path.join(dataDir(), sport); fs.mkdirSync(dir, { recursive: true });
    const json = JSON.stringify(snap, null, 1);
    fs.writeFileSync(path.join(dir, `${snap.date}.json`), json); fs.writeFileSync(path.join(dir, 'latest.json'), json);
    return true;
  } catch { return false; }
}

module.exports = { LEAGUES, WEIGHTS: W, statsOf, powerScore, computePower, applyMovement, snapshotDates, readSnapshot, previousSnapshot, makeSnapshot, saveSnapshot };
