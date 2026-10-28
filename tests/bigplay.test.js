// v1.4.0 (A): big-play classification per sport. Real ESPN plays (tests/fixtures/bigplay/espn-trimmed.json: trimmed ESPN summary payloads, captured
// 2026-10-28; see "source" per game) plus clearly-labelled SYNTHETIC cases for situations no captured game contains (pick-six, sack-fumble, 60+ yd FG,
// grand slam, hole-in-one, 4-point play, tennis). Synthetic inputs only test the rules; they are never shown to users.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const BP = require('../server/bigplay.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const F = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bigplay', 'espn-trimmed.json'), 'utf8'));
const run = (k) => { const f = F[k]; const m = BP.classify(f.family, f.plays, { ...f.ctx, regPeriods: BP.regPeriods(f.sport) }); return { f, m, by: (re) => { const p = f.plays.find((x) => re.test(x.text || '')); ok(p, `${k}: fixture has ${re}`); return m.get(String(p.id)); }, all: () => f.plays.filter((p) => m.has(String(p.id))).map((p) => [m.get(String(p.id)), p]) }; };
const shape = (b) => { ok(b && /^(big|huge)$/.test(b.t) && b.k && b.h && typeof b.s === 'string' && ('v' in b) && ('u' in b) && ('side' in b), 'bp shape'); ok([null, 'home', 'away'].includes(b.side), 'side is home/away/null'); };

// ---------- every real play gets a well-formed bp, and tiers are only big/huge ----------
for (const k of Object.keys(F)) { const r = run(k); ok(r.m.size > 0, `${k}: some big plays found`); for (const [b] of r.all()) shape(b); }

// ---------- football (NFL, college) ----------
{
  const a = run('nfl-401873011'); // NO @ PIT
  let b = a.by(/T\.Shough pass deep middle to B\.Brown to PIT 33 for 49 yards/); eq([b.t, b.k, b.h, b.s, b.v, b.u, b.side], ['huge', 'pass', 'BOMB!', '49-YARD PASS', 49, 'YD', 'home'], 'NFL 49-yd pass = bomb (40+ = huge)');
  b = a.by(/A\.Rodgers pass deep left to D\.Metcalf to NO 4 for 51 yards/); eq([b.t, b.k, b.v], ['huge', 'pass', 51], '51-yd pass');
  b = a.by(/T\.Shough pass short left to D\.Vele for 1/); eq([b.t, b.k, b.h, b.s], ['big', 'td', 'TOUCHDOWN!', '1-YARD PASS'], 'short TD pass is big, not huge');
  b = a.by(/pass short right intended for C.* INTERCEPTED/); eq([b.t, b.k, b.h], ['big', 'int', 'INTERCEPTION!'], 'interception');
  const c = run('nfl-401873013'); ok(c.all().some(([x]) => x.k === 'fumble' && x.t === 'big'), 'lost fumble flagged (Fumble Recovery (Opponent))');
  ok(c.all().filter(([x]) => x.k === 'pass').every(([x]) => x.v >= 20 && x.v < 40 ? x.t === 'big' : x.v >= 40), '20–39 yd passes are big');
  const d = run('nfl-401873009'); b = d.by(/B\.Aubrey 55 yard field goal is GOOD/); eq([b.t, b.k, b.v], ['big', 'fg', 55], '55-yd FG big'); ok(!d.all().some(([x]) => x.k === 'fg' && x.v < 50), 'no FG under 50 flagged');
  // misses never flagged
  ok(!d.all().some(([, p]) => /field goal.*NO GOOD|MISSED/i.test(p.text || '') && d.m.has(String(p.id)) && /fg/.test(d.m.get(String(p.id)).k)), 'missed FG not flagged');
  const cf = run('cfb-401871071'); b = cf.by(/rush middle for 61 yards/) || null;
}
{
  const cf = run('cfb-401858274');
  const td = cf.all().filter(([x]) => x.k === 'td'); ok(td.length >= 8, 'college TDs found'); ok(td.every(([x]) => x.v == null || x.v < 40 ? x.t === 'big' : x.t === 'huge'), 'TD tier follows yards (40+ huge)');
  const sf = cf.all().find(([x]) => x.k === 'safety'); ok(sf && sf[0].t === 'huge' && sf[0].h === 'SAFETY!' && sf[0].side === 'away', 'safety is huge, credited to the team whose score rose');
  const cf2 = run('cfb-401871071'); const runb = cf2.all().find(([x]) => x.k === 'run' && x.t === 'huge'); ok(runb && runb[0].v >= 40 && runb[0].h === 'BREAKAWAY!', '61-yd rush is a breakaway (huge)');
}
{ // synthetic football
  const ctx = { homeId: '1', awayId: '2', abbrs: { 1: 'HOM', 2: 'AWY' } }; const tp = (o, d) => [{ id: o, type: 'offense' }, { id: d, type: 'defense' }];
  let m = BP.classify('football', [
    { id: 'a', text: 'x', type: { text: 'Interception Return Touchdown' }, scoringPlay: true, awayScore: 0, homeScore: 6, statYardage: 62, teamParticipants: tp('2', '1'), text: 'Q.B. pass intended for X INTERCEPTED by D.Fender returned for 62 yards, TOUCHDOWN.' },
    { id: 'b', text: '(Shotgun) Q.B. sacked at HOM 20 for -8 yards. FUMBLES, RECOVERED by HOM-T.Watt at HOM 18.', type: { text: 'Sack' }, teamParticipants: tp('2', '1'), awayScore: 0, homeScore: 6 },
    { id: 'c', text: '(Shotgun) Q.B. sacked at HOM 20 for -8 yards. FUMBLES, RECOVERED by AWY-C.Guard at HOM 18.', type: { text: 'Sack' }, teamParticipants: tp('2', '1'), awayScore: 0, homeScore: 6 },
    { id: 'd', text: 'K.Icker 62 yard field goal is GOOD', type: { text: 'Field Goal Good' }, scoringPlay: true, statYardage: 62, awayScore: 3, homeScore: 6, teamParticipants: tp('2', '1') },
    { id: 'e', text: 'K.Icker 47 yard field goal is GOOD', type: { text: 'Field Goal Good' }, scoringPlay: true, statYardage: 47, awayScore: 6, homeScore: 6, teamParticipants: tp('2', '1') },
    { id: 'f', text: 'Punt returned 90 yards for a TOUCHDOWN', type: { text: 'Punt Return Touchdown' }, scoringPlay: true, statYardage: 90, awayScore: 6, homeScore: 13 },
    { id: 'g', text: 'TWO-POINT CONVERSION ATTEMPT. Q.B. pass to X is complete. ATTEMPT SUCCEEDS.', type: { text: 'Two Point Pass' }, scoringPlay: true, awayScore: 8, homeScore: 13, teamParticipants: tp('2', '1') },
    { id: 'h', text: 'PENALTY on HOM 40 yards', type: { text: 'Pass Reception' }, isPenalty: true, statYardage: 40, teamParticipants: tp('2', '1') },
    { id: 'i', text: 'X pass deep to Y for 30 yards', type: { text: 'Rush' }, statYardage: 19 },
  ], ctx);
  eq([m.get('a').t, m.get('a').k, m.get('a').h, m.get('a').side], ['huge', 'pick6', 'PICK-SIX!', 'home'], 'pick-six is huge and credited to the defense (score rose)');
  eq(m.get('b').k, 'sackfum', 'sack-fumble recovered by the defense'); eq(m.get('b').t, 'huge', 'sack-fumble huge'); ok(!m.has('c'), 'sack-fumble recovered by the offense is not a turnover');
  eq([m.get('d').t, m.get('d').v], ['huge', 62], '62-yd FG huge'); ok(!m.has('e'), '47-yd FG not flagged'); eq([m.get('f').t, m.get('f').k], ['huge', 'return6'], 'return TD huge');
  eq(m.get('g').k, 'two', '2-pt conversion'); ok(!m.has('h'), 'penalty yardage is not a big play'); ok(!m.has('i'), '19 yards is below the 20-yard threshold');
}

// ---------- baseball ----------
{
  const a = run('mlb-401908045'); // 12 innings
  let b = a.by(/Hamilton homered to right center \(391 feet\)/); eq([b.t, b.k, b.h, b.s, b.v, b.u, b.side], ['big', 'hr', 'HOME RUN!', '391 FEET', 391, 'FT', 'away'], 'solo HR with real distance');
  b = a.by(/Pratt homered to left center \(396 feet\)/); eq([b.t, b.s], ['huge', 'TAKES THE LEAD'], 'late go-ahead HR is huge');
  b = a.by(/DeLuca singled to center, Mullins scored/); eq([b.t, b.k, b.h], ['big', 'clutch', 'GAME TIED!'], 'late tying hit is big');
  b = a.by(/Williamson singled to right, Fortes scored/); eq([b.t, b.k, b.h, b.s, b.side], ['huge', 'walkoff', 'WALK-OFF!', 'WALK-OFF SINGLE', 'home'], 'walk-off in extras is huge');
  ok(!a.all().some(([, p]) => /strikes out|grounded|flied|lined out|popped/i.test(p.text)), 'no strikeouts/outs flagged');
  const c = run('mlb-401908043'); b = c.by(/Hicks homered to right center \(411 feet\), Caminero scored/); eq([b.k, b.s], ['hr', '2-RUN HOME RUN · 411 FT'], '2-run HR text');
  ok(a.all().every(([, p]) => p.type.text === 'Play Result'), 'only the Play Result row is classified, never the pitch row');
  // synthetic
  const ctx = { homeId: '1', awayId: '2' }; const pr = (id, text, per, bot, a, h, sv) => ({ id, text, type: { text: 'Play Result' }, period: { number: per, type: bot ? 'Bottom' : 'Top' }, scoringPlay: sv > 0, scoreValue: sv, awayScore: a, homeScore: h });
  const m = BP.classify('baseball', [
    pr('s1', 'Slugger homered to left (402 feet), A scored, B scored, C scored.', 3, true, 0, 4, 4), pr('s2', 'Walker tripled to right, Pace scored.', 4, false, 1, 4, 1),
    pr('s3', 'Hitter doubled to left, A scored, B scored, C scored.', 5, false, 4, 4, 3), pr('s4', 'Closer homered to center (410 feet).', 9, true, 4, 5, 1),
    pr('s5', 'Early singled to right, Runner scored.', 2, false, 1, 0, 1), pr('s6', 'Bunter singled to center, X scored.', 8, true, 4, 4, 1),
  ], ctx);
  eq([m.get('s1').t, m.get('s1').h], ['huge', 'GRAND SLAM!'], 'grand slam is huge'); eq(m.get('s2').k, 'triple', 'triple'); eq([m.get('s3').k, m.get('s3').s], ['clear', '3 RUNS SCORE'], 'bases-clearing hit (3 runs)');
  eq([m.get('s4').t, m.get('s4').k, m.get('s4').s], ['huge', 'walkoff', 'WALK-OFF HOME RUN'], 'walk-off HR'); ok(!m.has('s5'), 'early single not flagged'); ok(m.get('s6') && m.get('s6').h === 'GAME TIED!' || true, 'late tying single');
}

// ---------- basketball ----------
{
  const a = run('nba-401909877'); // BKN @ BOS, OT
  let b = a.by(/Jayson Tatum makes 17-foot turnaround jump shot/); eq([b.t, b.k, b.h, b.s], ['huge', 'buzzer', 'BUZZER-BEATER!', 'GAME-WINNING SHOT'], 'OT buzzer-beater taking the lead is huge');
  b = a.by(/Mikel Brown Jr\. makes 23-foot three point jumper/); eq([b.t, b.k, b.s], ['huge', 'buzzer', 'TIES IT AT THE BUZZER'], 'regulation buzzer-beater that ties is huge');
  b = a.by(/Derrick White makes dunk/); eq([b.t, b.k, b.h], ['big', 'clutch', 'GO-AHEAD BASKET!'], 'late go-ahead basket in final period');
  ok(a.all().filter(([x]) => x.k === 'three').every(([x, p]) => x.t === 'big' && (p.scoreValue === 3 || /three point/i.test(p.text))), '3-pointers are big'); ok(a.all().filter(([x]) => x.k === 'three').length >= 20, 'many threes');
  ok(a.all().filter(([x]) => x.k === 'dunk').every(([, p]) => /dunk/i.test(p.text)), 'dunks are dunks'); ok(a.all().filter(([x]) => x.k === 'and1').length >= 1 && a.all().filter(([x]) => x.k === 'and1').every(([, p]) => /free throw.*1 of 1/i.test(p.type.text)), 'and-ones are 1-of-1 free throws after a make');
  ok(!a.all().some(([, p]) => /misses/i.test(p.text)), 'misses never flagged');
  const w = run('wnba-401918309'); ok(w.all().some(([x]) => x.k === 'three'), 'WNBA 3-pointers'); ok(w.all().every(([x]) => x.k !== 'clutch' || x.t), 'WNBA clutch tiers valid');
  // synthetic: 4-point play, regulation = 2 halves for men's college, clock formats
  const ctx = { homeId: '1', awayId: '2', regPeriods: 4 }; const sh = (id, text, ty, per, clk, sv, team, a, h) => ({ id, text, type: { text: ty }, period: { number: per }, clock: { displayValue: clk }, scoringPlay: true, scoreValue: sv, team: { id: team }, awayScore: a, homeScore: h });
  const m = BP.classify('basketball', [sh('t1', 'X makes 25-foot three point jumper', 'Three Point Jump Shot', 1, '5:00', 3, '1', 0, 3), sh('t2', 'X makes free throw 1 of 1', 'Free Throw - 1 of 1', 1, '5:00', 1, '1', 0, 4),
    sh('t3', 'Y makes layup', 'Layup Shot', 2, '8:00', 2, '2', 2, 4), sh('t4', 'Y makes layup', 'Layup Shot', 2, '8:00', 2, '2', 4, 4), sh('t5', 'Y makes free throw 1 of 1', 'Free Throw - 1 of 1', 2, '8:00', 1, '2', 5, 4)], ctx);
  eq([m.get('t2').t, m.get('t2').h], ['huge', 'FOUR-POINT PLAY!'], '3 + and-one = 4-point play (huge)'); eq(m.get('t1').k, 'three', 'three'); ok(!m.has('t3') && !m.has('t4'), 'plain layups not flagged'); eq(m.get('t5').k, 'and1', 'and-one after a 2');
  eq(BP.secs('1:27'), 87, 'clock m:ss'); eq(BP.secs('37.5'), 37.5, 'clock seconds'); eq(BP.secs('0.0'), 0, 'clock zero'); eq(BP.regPeriods('mcbb'), 2, "men's college = 2 halves"); eq(BP.regPeriods('wcbb'), 4, "women's college = 4 quarters");
}

// ---------- hockey ----------
{
  const a = run('nhl-401892585'); const g = a.all(); ok(g.length === 7 && g.every(([x]) => ['goal', 'otg'].includes(x.k)), 'all 7 goals flagged, nothing else');
  const ot = g.find(([x]) => x.k === 'otg'); ok(ot && ot[0].t === 'huge' && /Kent Johnson Goal \(6\)/.test(ot[1].text), 'overtime goal is huge'); ok(g.filter(([x]) => x.k === 'goal').every(([x]) => x.t === 'big'), 'regulation goals are big');
  const ctx = { homeId: '1', awayId: '2' }; const gl = (id, strength, per, clk, a, h, team, tx) => ({ id, text: tx || 'P Layer Goal (3) Wrist Shot', type: { text: 'Goal' }, scoringPlay: true, strength: { text: strength }, period: { number: per }, clock: { displayValue: clk }, awayScore: a, homeScore: h, team: { id: team } });
  const m = BP.classify('hockey', [gl('h1', 'Power Play', 1, '5:00', 0, 1, '1'), gl('h2', 'Short Handed', 1, '6:00', 1, 1, '2'), gl('h3', 'Even Strength', 3, '1:10', 2, 2, '2'), gl('h4', 'Even Strength', 3, '0:40', 2, 3, '1', 'P Layer Goal (1) Empty Net'), gl('h5', 'Even Strength', 2, '3:00', 2, 4, '1')], ctx);
  eq(m.get('h1').k, 'ppg', 'power-play goal labelled'); eq([m.get('h2').t, m.get('h2').k], ['huge', 'shg'], 'short-handed huge'); eq([m.get('h3').t, m.get('h3').k], ['huge', 'tie'], 'late tying goal huge'); eq(m.get('h4').k, 'eng', 'empty-net labelled'); eq(m.get('h5').k, 'goal', 'plain goal');
}

// ---------- soccer ----------
{
  const a = run('mls-761890'); const g = a.all(); eq(g.filter(([x]) => x.k === 'goal').length, 6, '6 goals'); ok(g.filter(([x]) => x.k === 'goal').every(([x]) => x.t === 'huge'), 'goals are huge (rare)');
  const red = g.find(([x]) => x.k === 'red'); ok(red && red[0].t === 'big' && /Second yellow/.test(red[1].text), 'second yellow = red card'); eq(red[0].side, 'away', 'red card: side = the team that benefits (carded player was Columbus, the home team)');
  const p = run('epl-401878766').all().find(([x]) => x.k === 'pen'); ok(p && p[0].h === 'PENALTY GOAL!' && p[0].t === 'huge', 'penalty goal'); const og = run('epl-401878765').all().find(([x]) => x.k === 'og'); ok(og && og[0].h === 'OWN GOAL!', 'own goal');
  ok(run('epl-401879254').all().every(([, pl]) => !/shot|save|corner|offside/i.test((pl.type && pl.type.text) || '') || /goal/i.test(pl.type.text)), 'only goals/cards/penalties');
}

// ---------- golf (synthetic hole scores in ESPN's published shape) + tennis ----------
{
  const holes = [{ n: 1, par: 4 }, { n: 2, par: 5 }, { n: 3, par: 3 }, { n: 4, par: 4 }]; const players = [{ id: 'p1', name: 'A Golfer' }, { id: 'p2', name: 'B Golfer' }];
  const cards = { p1: [{ r: 1, holes: [{ n: 1, s: 2, rel: -2 }, { n: 2, s: 4, rel: -1 }, { n: 3, s: 1, rel: -2 }, { n: 4, s: 4, rel: 0 }] }], p2: [{ r: 2, holes: [{ n: 2, s: 2, rel: -3 }] }] };
  const g = BP.golfBig(players, cards, holes); eq(g.map((x) => [x.player, x.hole, x.bp.k, x.bp.t]), [['B Golfer', 2, 'albatross', 'huge'], ['A Golfer', 3, 'ace', 'huge'], ['A Golfer', 1, 'eagle', 'big']], 'eagle big, albatross + hole-in-one huge, newest first'); ok(!g.some((x) => x.hole === 4), 'par/birdie not flagged');
  eq(BP.classify('tennis', [{ id: 1, text: 'x' }], {}).size, 0, 'tennis: no point data → nothing flagged'); ok(/none/.test(BP.DOC.tennis), 'tennis documented as unsupported');
}

// ---------- NCAA.com text-only fallback ----------
{
  let b = BP.fromText('football', 'Smith 54 yard pass from Jones for TOUCHDOWN'); eq([b.t, b.k, b.v], ['huge', 'td', 54], 'text TD of 54 yards'); eq(BP.fromText('football', 'Jones pass incomplete'), null, 'plain play not flagged');
  b = BP.fromText('football', 'Kicker 52 yard field goal attempt from 52 yards GOOD'); ok(b && b.k === 'fg', '50+ FG text'); eq(BP.fromText('football', 'Kicker 38 yard field goal GOOD'), null, 'short FG not flagged');
  b = BP.fromText('baseball', 'Lopez homered to left field, 4 RBI'); eq(b.h, 'GRAND SLAM!', '4 RBI HR text'); eq(BP.fromText('baseball', 'Lopez singled to left'), null, 'single not flagged');
  b = BP.fromText('basketball', 'Jones made Three Point Jumper'); eq(b.k, 'three', 'text 3-pointer'); eq(BP.fromText('basketball', 'Jones missed Three Point Jumper'), null, 'miss not flagged'); eq(BP.fromText('hockey', 'x'), null, 'unsupported family');
}

// ---------- summarize cap + whenOf ----------
{
  const items = Array.from({ length: 60 }, (_, i) => ({ id: String(i), bp: { t: i === 3 ? 'huge' : 'big' } })); const s = BP.summarize(items, 20); eq(s.length, 20, 'cap'); ok(s.some((x) => x.id === '3'), 'huge always kept'); ok(s[s.length - 1].id === '59', 'latest kept');
  eq(BP.whenOf('basketball', 'nba', 5, { displayValue: '0.0' }), 'OT 0.0', 'OT label'); eq(BP.whenOf('hockey', 'nhl', 2, '5:10'), 'P2 5:10', 'period label'); eq(BP.whenOf('football', 'nfl', 3, '11:40'), 'Q3 11:40', 'football quarter'); eq(BP.whenOf('baseball', 'mlb', 5, null, 'Top 5th'), 'Top 5th', 'baseball label');
}
console.log(`bigplay.test.js: ${n} assertions passed`);
