// Trims real ESPN /summary payloads (dumped to /tmp/ex/<sport>.json by hand on 2026-10-28) into small committed fixtures for tests/playwho.test.js.
// Only fields the play explainer reads are kept (roster-ish athletes + ~45 evenly spread plays). Real data, nothing invented.
const fs = require('fs'); const path = require('path');
const SRC = process.env.EX_DIR || '/tmp/ex'; const OUT = path.join(__dirname, '..', 'tests', 'fixtures', 'plays'); fs.mkdirSync(OUT, { recursive: true });
const FAM = { nfl: 'football', cfb: 'football', mlb: 'baseball', cbase: 'baseball', nba: 'basketball', wnba: 'basketball', nhl: 'hockey', mls: 'soccer', epl: 'soccer', nwsl: 'soccer' };
const slimA = (a) => a && { id: a.id, displayName: a.displayName, fullName: a.fullName, firstName: a.firstName, lastName: a.lastName, jersey: a.jersey, position: a.position && { abbreviation: a.position.abbreviation }, headshot: a.headshot && { href: a.headshot.href || a.headshot } };
for (const [sp, family] of Object.entries(FAM)) {
  const f = path.join(SRC, `${sp}.json`); if (!fs.existsSync(f)) { console.log('skip', sp); continue; }
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  let plays = d.plays || []; let where = 'plays';
  if (!plays.length && d.drives) { plays = (d.drives.previous || []).flatMap((x) => x.plays || []); where = 'drives'; }
  if (!plays.length && d.keyEvents) { plays = d.keyEvents; where = 'keyEvents'; }
  const step = Math.max(1, Math.floor(plays.length / 45)); const pick = plays.filter((_, i) => i % step === 0).slice(0, 48);
  const o = { sport: sp, family, where, game: d.header && d.header.competitions && d.header.competitions[0] && d.header.competitions[0].competitors.map((c) => c.team.abbreviation).join(' @ '), total: plays.length,
    d: { boxscore: { players: ((d.boxscore && d.boxscore.players) || []).map((t) => ({ team: { id: t.team.id, abbreviation: t.team.abbreviation }, statistics: (t.statistics || []).map((g) => ({ athletes: (g.athletes || []).map((x) => ({ athlete: slimA(x.athlete) })) })) })) },
      rosters: (d.rosters || []).map((r) => ({ team: r.team && { id: r.team.id, abbreviation: r.team.abbreviation, displayName: r.team.displayName }, roster: (r.roster || []).map((x) => ({ jersey: x.jersey, position: x.position && { abbreviation: x.position.abbreviation }, athlete: slimA(x.athlete) })) })),
      header: { competitions: [{ competitors: ((d.header && d.header.competitions && d.header.competitions[0].competitors) || []).map((c) => ({ team: { id: c.team.id, abbreviation: c.team.abbreviation } })) }] } },
    plays: pick };
  fs.writeFileSync(path.join(OUT, `${sp}.json`), JSON.stringify(o)); console.log(sp, where, pick.length, 'of', plays.length, (JSON.stringify(o).length / 1024).toFixed(0) + 'KB');
}
