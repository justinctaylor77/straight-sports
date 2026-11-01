'use strict';
// v1.7.1: adapts NCAA.com play-by-play + box score (college softball, and college baseball when ESPN has no plays) into the
// ESPN-summary shape server/scorecard.js reads, so one parser/renderer serves every league. Pure, no network.
// NCAA.com prints names short ("Mi Williams", "Al. Leach", "Henry", "Walk, J."); we only map a name to a box-score player
// when exactly one player on the batting team fits, otherwise the play stays unread ('?'). Nothing is invented.
const POSW = { p: 'pitcher', c: 'catcher', '1b': 'first base', '2b': 'second base', '3b': 'third base', ss: 'shortstop', lf: 'left field', cf: 'center field', rf: 'right field' };
const BATV = /^(?:singled|doubled|tripled|homered|walked|intentionally walked|hit by pitch|struck out|grounded|flied|fouled|lined|popped|bunted|reached|out on|infield fly|sacrifice|hit into|safe on)/i;
const RUNV = /^(?:stole|advanced|scored|out at|caught stealing|picked off|placed on|to (?:first|second|third|home)\b)/i;
const DEFENSIVE = /^(?:to (?:p|c|1b|2b|3b|ss|lf|cf|rf|dh|dp|ph|pr)\b|to (?:p|c|1b|2b|3b|ss|lf|cf|rf|dh|dp)\.?\s+for\b)/i;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const cap = (s) => String(s || '').trim();

function normText(t) {
  let s = cap(t).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ');
  if (/,\s*SF\b/.test(s)) s = s.replace(/\b(flied|lined|popped|fouled) (?:out|up)\b/, 'hit sacrifice fly').replace(/,\s*SF\b/, '');
  if (/,\s*SAC\b/.test(s)) s = s.replace(/\b(grounded out|bunted out|popped up|reached)\b/, (m) => (m === 'reached' ? 'sacrifice bunt, reached' : 'sacrifice bunt')).replace(/,\s*SAC\b/, '');
  s = s.replace(/,\s*(?:\d\s*)?RBI\b/g, '').replace(/,\s*(?:bunt|slap|unearned|team unearned)\b/gi, '');
  s = s.replace(/\b(to|by|at|from) (p|c)\b/gi, (m, a, b) => `${a} ${POSW[b.toLowerCase()]}`).replace(/\b(1b|2b|3b|ss|lf|cf|rf)\b/gi, (m) => POSW[m.toLowerCase()]);
  return s.replace(/\.\s*$/, '');
}

function fromNcaa(pbp, box, opts = {}) {
  const teams = (pbp && pbp.teams) || (box && box.teams) || [];
  const side = (tid) => { const t = teams.find((x) => String(x.teamId) === String(tid)); return t ? (t.isHome ? 'home' : 'away') : null; };
  const people = { home: [], away: [] };
  for (const tb of (box && box.teamBoxscore) || []) {
    const sd = side(tb.teamId); if (!sd) continue;
    (tb.playerStats || []).forEach((p, i) => { if (!p.participated && !p.starter) return; people[sd].push({ id: `${tb.teamId}-${i}`, first: cap(p.firstName), last: cap(p.lastName), pos: cap(p.position).toUpperCase(), jersey: p.number != null ? String(p.number) : null, starter: !!p.starter, bat: p.batterStats, pit: p.pitcherStats, order: null }); });
  }
  // starting lineup in box order; the starting pitcher who doesn't bat (DP/FLEX, or DH in baseball) is left out
  const size = {};
  for (const sd of ['home', 'away']) {
    let st = people[sd].filter((p) => p.starter && p.bat);
    if (st.length > 9) { const pOnly = st.filter((p) => /^P$/.test(p.pos)); if (pOnly.length && st.length - pOnly.length >= 9) st = st.filter((p) => !pOnly.includes(p)); }
    if (st.length > 9) { const zero = st.filter((p) => !+p.bat.atBats && !+p.bat.walks && !+p.bat.runsScored); if (zero.length) { const x = zero[zero.length - 1]; st = st.filter((p) => p !== x); } } // the FLEX/defense-only starter
    st.forEach((p, i) => { p.order = i + 1; }); size[sd] = st.length || 9;
  }
  const full = (p) => `${p.first} ${p.last}`.trim();
  // one printed name -> one player on that team, or null
  const who = (sd, name) => {
    const n = cap(name).replace(/\s+/g, ' '); if (!n) return null;
    const hits = people[sd].filter((p) => {
      if (!p.last) return false;
      if (n.toLowerCase() === full(p).toLowerCase() || n.toLowerCase() === p.last.toLowerCase()) return true;
      let m = n.match(/^([A-Za-zÀ-ÿ'’\-]+)\.? (.+)$/); if (m && m[2].toLowerCase() === p.last.toLowerCase() && p.first.toLowerCase().startsWith(m[1].toLowerCase())) return true;
      m = n.match(/^(.+), ([A-Za-z]+)\.?$/); if (m && m[1].toLowerCase() === p.last.toLowerCase() && p.first.toLowerCase().startsWith(m[2].toLowerCase())) return true;
      return false;
    });
    if (hits.length === 1) return hits[0];
    const exact = hits.filter((p) => full(p).toLowerCase() === n.toLowerCase()); return exact.length === 1 ? exact[0] : null;
  };
  // longest leading name that resolves: "Mihyi Davis stole second" -> Davis
  const lead = (sd, text) => {
    const w = text.split(' ');
    for (let k = Math.min(4, w.length - 1); k >= 1; k--) { const nm = w.slice(0, k).join(' ').replace(/,$/, ''); const p = who(sd, nm); if (p) return { p, nm, rest: w.slice(k).join(' ') }; }
    const m = text.match(/^([A-Za-zÀ-ÿ'’\-]+, [A-Z])\.? (.*)$/); if (m) { const p = who(sd, m[1]); if (p) return { p, nm: m[1], rest: m[2] }; }
    return null;
  };
  const rename = (sd, s) => { // printed names -> full names so the parser's runner matching is exact
    let o = s; const cands = [];
    for (const p of people[sd]) { cands.push([new RegExp(`\\b${esc(p.last)}, ${esc(p.first[0] || '')}\\.?(?=[\\s,;.]|$)`, 'g'), p]); cands.push([new RegExp(`\\b([A-Za-zÀ-ÿ'’\\-]+)\\.? ${esc(p.last)}\\b`, 'g'), p]); }
    for (const [re, p] of cands) o = o.replace(re, (m, f) => { if (f !== undefined && typeof f === 'string' && !p.first.toLowerCase().startsWith(f.toLowerCase())) return m; return who(sd, m.replace(/\.$/, '')) === p ? `\u0001${p.id}\u0002` : m; });
    for (const p of people[sd]) if (who(sd, p.last) === p) o = o.replace(new RegExp(`(^|[\\s;,])${esc(p.last)}(?=\\s)`, 'g'), `$1\u0001${p.id}\u0002`);
    return o.replace(/\u0001([^\u0002]+)\u0002/g, (m, id) => full(people[sd].find((x) => x.id === id)));
  };

  const plays = []; const lines = { home: [], away: [] }; let lastSlot = { home: 0, away: 0 }; let openHalf = null; let score = { home: 0, away: 0 };
  let idx = 0;
  for (const per of (pbp && pbp.periods) || []) {
    const inn = +per.periodNumber || null; if (!inn) continue;
    for (const st of per.playbyplayStats || []) {
      const sd = side(st.teamId); if (!sd) continue; const period = { type: sd === 'away' ? 'Top' : 'Bottom', number: inn };
      for (const pl of st.plays || []) {
        const raw = cap(pl.playText); if (!raw) continue; idx++;
        if (pl.homeScore != null) score.home = +pl.homeScore; if (pl.visitorScore != null) score.away = +pl.visitorScore;
        if (/^Batting starts/i.test(raw)) { openHalf = { sd, inn }; continue; }
        const be = raw.match(/^Batting ends R:\s*(\d+)\s*H:\s*(\d+)\s*E:\s*(\d+)/i);
        if (be) { lines[sd][inn - 1] = { displayValue: be[1], hits: +be[2], errorsAgainst: +be[3] }; openHalf = null; continue; }
        if (/CHALLENGE|Circle Visit|Timeout|Mound Visit|^\/|^Defensive|Pitching change|^Game (?:started|ended)|delay/i.test(raw)) continue;
        const L = lead(sd, raw) || null; const L2 = !L ? lead(sd === 'home' ? 'away' : 'home', raw) : null;
        if (!L) { if (L2) continue; /* a fielding-team change ("X to p for Y") */ plays.push({ id: `n${idx}`, type: { type: 'play-result' }, period, text: normText(raw), participants: [] }); continue; }
        const rest = L.rest;
        const sub = rest.match(/^pinch (hit|ran) for (.+?)\.?$/i) || rest.match(/^to (dp|dh|ph|pr|p|c|1b|2b|3b|ss|lf|cf|rf) for (.+?)\.?$/i);
        if (sub) {
          const old = who(sd, sub[2]) || (lead(sd, sub[2] + ' x') || {}).p;
          if (old && old.order && !L.p.order) L.p.order = old.order;
          if (/^(hit|ran)$/i.test(sub[1])) plays.push({ id: `n${idx}`, type: { type: 'play-result' }, period, text: `${full(L.p)} ${sub[1].toLowerCase() === 'hit' ? 'hit' : 'ran'} for ${old ? full(old) : sub[2]}`, participants: [] });
          continue;
        }
        if (DEFENSIVE.test(rest)) continue;
        if (BATV.test(rest)) {
          let slot = L.p.order; const exp = (lastSlot[sd] % size[sd]) + 1;
          if (!slot) { slot = exp; L.p.order = slot; }
          lastSlot[sd] = slot;
          plays.push({ id: `n${idx}`, type: { type: 'play-result' }, period, batOrder: slot, text: rename(sd, normText(raw)), participants: [{ type: 'batter', athlete: { id: L.p.id } }] });
          continue;
        }
        plays.push({ id: `n${idx}`, type: { type: 'play-result' }, period, text: rename(sd, normText(raw)), participants: [] });
      }
    }
  }
  const stt = String((pbp && pbp.status) || (box && box.status) || '').toLowerCase();
  const state = /^(f|final)/.test(stt) ? 'post' : /^(p|pre|scheduled)$/.test(stt) || (!plays.length && !/live|in/.test(stt)) ? 'pre' : 'in';
  // live: the due-up batter of the open half is the next slot in the order (rotation), shown as the current cell
  if (state === 'in' && openHalf) { const sd = openHalf.sd; const nx = (lastSlot[sd] % size[sd]) + 1; const p = people[sd].filter((x) => x.order === nx).slice(-1)[0];
    if (p) plays.push({ id: `n${++idx}`, type: { type: 'start-batterpitcher' }, period: { type: sd === 'away' ? 'Top' : 'Bottom', number: openHalf.inn }, batOrder: nx, atBatId: `due${idx}`, participants: [{ type: 'batter', athlete: { id: p.id } }] }); }
  const comp = (sd) => { const t = teams.find((x) => (x.isHome ? 'home' : 'away') === sd) || {}; const o = sd === 'home' ? 'away' : 'home';
    return { id: String(t.teamId), homeAway: sd, score: String(score[sd]), team: { abbreviation: t.name6Char || '', displayName: t.nameShort || t.nameFull || '', logo: null },
      // E per inning = errors by this team while fielding = the "E:" printed at the end of the other team's half
      linescores: Array.from({ length: Math.max(lines.home.length, lines.away.length) }, (_, i) => ({ displayValue: lines[sd][i] ? lines[sd][i].displayValue : null, hits: lines[sd][i] ? lines[sd][i].hits : null, errors: lines[o][i] ? lines[o][i].errorsAgainst : null })) }; };
  const bat = (sd) => people[sd].filter((p) => p.order && p.bat).map((p) => ({ athlete: { id: p.id, displayName: full(p), shortName: `${(p.first[0] || '')}. ${p.last}` }, position: { abbreviation: p.pos.split('/')[0] }, jersey: p.jersey, batOrder: p.order, starter: p.starter,
    stats: [p.bat.atBats, p.bat.runsScored, p.bat.hits, p.bat.runsBattedIn, p.bat.walks, p.bat.strikeouts] }));
  const pit = (sd) => people[sd].filter((p) => p.pit).map((p) => ({ athlete: { id: p.id, displayName: full(p) }, stats: [p.pit.inningsPitched, p.pit.hitsAllowed, p.pit.runsAllowed, p.pit.earnedRunsAllowed, p.pit.walksAllowed, p.pit.strikeouts, null] }));
  const tid = (sd) => String((teams.find((x) => (x.isHome ? 'home' : 'away') === sd) || {}).teamId);
  return {
    header: { id: String((pbp && pbp.contestId) || (box && box.contestId) || opts.id || ''), competitions: [{ id: String((pbp && pbp.contestId) || (box && box.contestId) || opts.id || ''), date: opts.date || null, status: { type: { state, detail: state === 'post' ? (lines.home.length > (opts.innings || 9) || lines.away.length > (opts.innings || 9) ? `Final/${Math.max(lines.home.length, lines.away.length)}` : 'Final') : state === 'in' ? cap(pbp && pbp.period) || 'In progress' : 'Scheduled' } }, competitors: ['home', 'away'].map(comp) }] },
    boxscore: { players: ['away', 'home'].map((sd) => ({ team: { id: tid(sd) }, statistics: [{ type: 'batting', keys: ['atBats', 'runs', 'hits', 'RBIs', 'walks', 'strikeouts'], athletes: bat(sd) }, { type: 'pitching', keys: ['fullInnings.partInnings', 'hits', 'runs', 'earnedRuns', 'walks', 'strikeouts', 'pitches'], athletes: pit(sd) }] })) },
    rosters: [], plays,
  };
}
module.exports = { fromNcaa, normText };
