// Item 4: "what was the play and who was involved" for every sport. Real trimmed ESPN payloads (tests/fixtures/plays/*.json, captured 2026-10-28)
// plus clearly-labelled synthetic cases for golf holes (no golf event is live today) and tennis/UFC/F1 story builders.
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const PW = require('../server/playwho.js');
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; }; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const FX = path.join(__dirname, 'fixtures', 'plays'); const per = {};

for (const f of fs.readdirSync(FX).filter((x) => x.endsWith('.json'))) {
  const fx = JSON.parse(fs.readFileSync(path.join(FX, f), 'utf8')); const sp = fx.sport;
  const roster = PW.buildRoster(fx.d, sp); ok(roster.byId.size > 10, `${sp}: roster built from the payload (${roster.byId.size})`);
  const teamIds = fx.d.header.competitions[0].competitors.map((c) => c.team.id); const names = new Set([...roster.byId.values()].map((p) => p.name));
  let withWho = 0, blank = 0, invented = 0;
  for (const p of fx.plays) {
    const e = PW.explainPlay(fx.family, p, { sport: sp, roster, teamIds });
    ok(e && typeof e === 'object' && Array.isArray(e.who), `${sp}: explain returns {what, desc, who[]}`);
    const shown = e.desc || p.text || e.what; if (!shown && !(p.text || '').trim() && !(p.type && p.type.text)) { /* ESPN sent an empty play */ } else if (!shown) blank++;
    if (e.who.length) withWho++;
    for (const w of e.who) {
      ok(w.role && w.name, `${sp}: every person has a role and a name`);
      // never invent a player: a resolved person is in the game's roster; an unresolved one keeps the raw name ESPN printed in the play text
      if (w.id) { ok(names.has(w.name) || roster.byId.has(String(w.id).replace(/^.*:a/, '')), `${sp}: ${w.name} is in the roster`); }
      else if (!(p.text || '').toLowerCase().includes(String(w.name).split(' ').pop().replace(/[.,]/g, '').toLowerCase())) invented++;
    }
  }
  ok(blank === 0, `${sp}: no play renders blank (${blank})`); ok(invented === 0, `${sp}: no invented names (${invented})`);
  ok(withWho > fx.plays.length * (fx.family === 'soccer' ? 0.3 : 0.4), `${sp}: most plays name people (${withWho}/${fx.plays.length})`);
  per[sp] = { fx, roster, teamIds };
}
const ex = (sp, test) => { const { fx, roster, teamIds } = per[sp]; const p = fx.plays.find(test); ok(p, `${sp}: fixture contains the case`); return PW.explainPlay(fx.family, p, { sport: sp, roster, teamIds }); };
const roles = (e) => e.who.map((w) => `${w.role}:${w.name}`);
// football: passer / target / tacklers resolved to full names from abbreviated ESPN text
let e = ex('nfl', (p) => /pass short left to M\.Lemon pushed ob at DAL 13 for 21 yards/.test(p.text));
eq(e.what, 'Pass complete'); eq(roles(e), ['Passer:Tanner McKee', 'Target:Makai Lemon', 'Tackled by:Markquese Bell', 'Tackled by:Joey Porter Jr.']); ok(/for 21 yards/.test(e.desc));
e = ex('nfl', (p) => /^J\.Elliott kicks 55 yards/.test(p.text)); eq(e.what, 'Kickoff'); ok(roles(e).includes('Returner:Jonathan Mingo') && roles(e).includes('Kicker:Jake Elliott'));
e = ex('nfl', (p) => /D\.Prescott pass incomplete short right/.test(p.text)); eq(e.what, 'Incomplete pass'); eq(roles(e), ['Passer:Dak Prescott'], 'injury note is not a player');
e = ex('nfl', (p) => /PENALTY on PHI, Delay of Game/.test(p.text)); eq(e.what, 'Penalty'); ok(/PHI/.test(e.desc) && /Delay of Game/.test(e.desc) && /5 yards/.test(e.desc), e.desc);
e = ex('nfl', (p) => /Timeout #3 by PHI/.test(p.text)); eq(e.who, [], 'timeouts have no players'); ok(/Timeout/.test(e.desc));
// college football (jersey-number format) incl. touchdown + extra point + penalty
e = ex('cfb', (p) => /TOUCHDOWN/.test(p.text) && /rush/.test(p.text)); eq(e.what, 'Touchdown run'); ok(roles(e).includes('Rusher:Ajay Allen') && roles(e).includes('Extra point:Karl Campbell'), roles(e).join());
e = ex('cfb', (p) => /pass incomplete deep right to #12 Q\.Burroughs/.test(p.text)); ok(roles(e).includes('Passer:Brock Glenn') && roles(e).includes('Target:Quincy Burroughs') && roles(e).includes('Penalty on:Kahlil Ali'), roles(e).join());
e = ex('cfb', (p) => /field goal attempt from 42 yards NO GOOD/.test(p.text)); eq(e.what, 'Field goal missed'); eq(roles(e), ['Kicker:Karl Campbell']);
// baseball (MLB World Series game + college)
e = ex('mlb', (p) => /Díaz struck out swinging/.test(p.text)); eq(e.what, 'Strikeout'); eq(roles(e), ['Pitcher:Trevor Megill', 'Batter:Yandy Diaz']);
e = ex('mlb', (p) => /Pitch 2 : Ball 1/.test(p.text) && /Sweeper/.test(JSON.stringify(p))); ok(roles(e).some((r) => /^Pitcher:Dustin May/.test(r)) && roles(e).some((r) => /^Batter:Liam Hicks/.test(r)));
e = ex('cbase', (p) => /C\. French flied out to left/.test(p.text)); eq(e.what, 'Fly Out'); ok(roles(e).includes('Batter:Carter French'));
e = ex('cbase', (p) => /^J\. Rose pitches to J\. Walk/.test(p.text)); eq(roles(e), ['Pitcher:Jackson Rose', 'Batter:Jason Walk'], 'abbreviated college names resolved from the roster');
// basketball (NBA, WNBA): shooter, assist, rebound, substitution
e = ex('nba', (p) => /Michael Porter Jr\. makes 25-foot three point jumper/.test(p.text)); eq(e.what, 'Made 3-pointer'); eq(roles(e), ['Shooter:Michael Porter Jr.', 'Assist:Moritz Wagner']);
e = ex('nba', (p) => /Jordan Walsh enters the game for Payton Pritchard/.test(p.text)); eq(roles(e), ['Subbed in:Jordan Walsh', 'Subbed out:Payton Pritchard']);
e = ex('wnba', (p) => /Veronica Burton defensive rebound/.test(p.text)); eq(roles(e), ['Rebound:Veronica Burton']);
e = ex('wnba', (p) => /Angel Reese vs\. Kiah Stokes/.test(p.text)); ok(roles(e).includes('Gains possession:Naz Hillmon'));
// hockey
e = ex('nhl', (p) => /Jamie Drysdale shot blocked by Mathieu Olivier/.test(p.text)); eq(e.what, 'Blocked shot'); eq(roles(e), ['Shot:Jamie Drysdale', 'Blocked by:Mathieu Olivier']);
e = ex('nhl', (p) => /Oliver Bonk Slap Shot saved by Cam Talbot/.test(p.text)); eq(roles(e), ['Shot:Oliver Bonk', 'Goalie:Cam Talbot']);
e = ex('nhl', (p) => /Christian Dvorak faceoff won against Sean Monahan/.test(p.text)); eq(roles(e), ['Won faceoff:Christian Dvorak', 'Lost faceoff:Sean Monahan']);
// soccer (MLS): goal with assist, card, substitution
e = ex('mls', (p) => /^Goal!/.test(p.text)); eq(e.what, 'Goal'); ok(roles(e).some((r) => /^Scorer:Joseph Paintsil/.test(r)));
e = ex('mls', (p) => /shown the yellow card/.test(p.text)); eq(e.what, 'Yellow Card'); eq(roles(e), ['Booked:Ryan Porteous']);
e = ex('mls', (p) => /Nkosi Tafari replaces Ryan Porteous/.test(p.text)); eq(roles(e), ['Comes on:Nkosi Tafari', 'Goes off:Ryan Porteous']);
ok(per.epl && per.nwsl, 'EPL and NWSL fixtures are covered by the generic invariants above');
// unknown family / missing fields → the raw ESPN text, never blank, never a throw
e = PW.explainPlay('curling', { text: 'Stone thrown by someone', type: { text: 'Stone' } }, {}); eq(e.desc, 'Stone thrown by someone'); eq(e.what, 'Stone'); eq(e.who, []);
e = PW.explainPlay('football', { text: 'Something new ESPN added', type: { text: 'Unknown' } }, { sport: 'nfl', roster: PW.buildRoster({}, 'nfl'), teamIds: [] }); ok(/Something new ESPN added/.test(e.desc || '') || (e.who || []).length === 0);
e = PW.explainPlay('football', null, {}); ok(e && Array.isArray(e.who || [])); e = PW.explainPlay('baseball', {}, { roster: PW.buildRoster({}, 'mlb') }); ok(e);
// fbClean / parenNames
ok(!/Shotgun/.test(PW.fbClean('(Shotgun) T.McKee pass short left to M.Lemon')), 'formation removed'); eq(PW.parenNames('x (M.Bell; J.Porter)').length, 2);

// ---------- golf: SYNTHETIC hole cards (no golf event is live on 2026-10-28; real Mexico Open starts Oct 29). Shape matches golfCast's cards/holes.
const gp = [{ id: 'g1', name: 'Test Golfer One', pos: 'T1', score: '-7', country: 'USA', headshot: null }, { id: 'g2', name: 'Test Golfer Two', pos: '2', score: '-6' }];
const holes = [{ n: 1, par: 4 }, { n: 2, par: 3 }, { n: 3, par: 5 }];
const cards = { g1: [{ r: 3, holes: [{ n: 1, s: 4, rel: 0 }, { n: 2, s: 2, rel: -1 }, { n: 3, s: 3, rel: -2 }] }], g2: [{ r: 3, holes: [{ n: 1, s: 5, rel: 1 }, { n: 2, s: null }] }] };
const gs = PW.golfStory({ players: gp, cards, holes, round: 3 });
eq(gs.length, 2); eq(gs[0].what, 'Eagle'); ok(/Test Golfer One made an eagle \(3\) on hole 3 \(par 5\)/.test(gs[0].desc), gs[0].desc); eq(gs[0].thru, 3); eq(gs[1].what, 'Bogey'); eq(gs[1].hole, 1); eq(gs[0].who[0].role, 'Player');
eq(PW.golfStory({ players: gp, cards: {}, holes, round: 3 }), [], 'no hole data → empty (client then shows the leaderboard summary)');
const gl = PW.golfLeaders([{ id: 'a', name: 'Real Shape', pos: '1', score: '-12', rounds: [{ strokes: 66 }, { strokes: 68 }, { strokes: 67 }, { strokes: 67 }], state: 'post' }, { id: 'b', name: 'No Rounds', rounds: [] }], 'post');
eq(gl.length, 1); eq(gl[0].what, 'Final standing'); ok(/finished -12; rounds 66, 68, 67, 67/.test(gl[0].desc), gl[0].desc);
// ---------- tennis (real data shape: set games only; no point-by-point exists in ESPN's feed)
const ts = PW.tennisStory({ state: 'in', round: 'Round of 16', players: [{ name: 'Player A', sets: [6, 3], serving: true }, { name: 'Player B', sets: [4, 5] }] });
eq(ts.what, 'Set 2 in progress'); ok(/Set 1: Player A won 6-4/.test(ts.desc) && /Player A to serve/.test(ts.desc)); eq(ts.who.map((w) => w.role), ['Serving', 'Player']); eq(ts.sets.length, 2);
eq(PW.tennisStory({ players: [{ name: 'x' }] }), null);
// ---------- UFC / racing
const u = PW.eventStory('ufc', { state: 'post', result: 'KO/TKO', round: 2, clock: '3:14', competitors: [{ name: 'Fighter A', winner: true, order: 1 }, { name: 'Fighter B', order: 2 }] });
ok(/Fighter A defeated Fighter B by KO\/TKO, round 2 at 3:14/.test(u.desc), u.desc); eq(u.who[0].role, 'Winner');
const r = PW.eventStory('f1', { type: 'race', state: 'post', competitors: [{ name: 'Driver A', order: 1 }, { name: 'Driver B', order: 2 }, { name: 'Driver C', order: 3 }] }); eq(r.desc, '1. Driver A, 2. Driver B, 3. Driver C'); eq(r.who.map((w) => w.role), ['P1', 'P2', 'P3']);
console.log(`playwho.test: ${n} assertions passed`);
