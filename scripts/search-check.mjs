// v1.5.0 search check: ~100 real players and teams, typed the way people type them (typos, no accents, nicknames).
// Players go through the server (/api/athletes, the fuzzy full-list index); teams through the same picker matcher the app
// uses (public/picker.js leagueTeams, incl. FCS). PASS = expected name within the top N results.
// Usage: node scripts/search-check.mjs [base=http://localhost:8811] [--json out.json]
import fs from 'node:fs';
import { leagueTeams, fullName } from '../public/picker.js';
const base = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'http://localhost:8811').replace(/\/$/, '');
const jOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const P = [ // [sport, query, expected, topN]
  ['golf', 'McElroy', 'Rory McIlroy', 3], ['golf', 'mcilroy', 'Rory McIlroy', 1], ['golf', 'Rory', 'Rory McIlroy', 5], ['golf', 'Scheffler', 'Scottie Scheffler', 1], ['golf', 'scotty schefler', 'Scottie Scheffler', 1],
  ['golf', 'Aberg', 'Ludvig Åberg', 1], ['golf', 'ludvig', 'Ludvig Åberg', 3], ['golf', 'Nelly Korda', 'Nelly Korda', 1], ['golf', 'korda', 'Nelly Korda', 3], ['golf', 'Jon Rahm', 'Jon Rahm', 1],
  ['golf', 'rahm', 'Jon Rahm', 1], ['golf', 'Bryson', 'Bryson DeChambeau', 3], ['golf', 'dechambo', 'Bryson DeChambeau', 3], ['golf', 'Xander', 'Xander Schauffele', 3], ['golf', 'shauffele', 'Xander Schauffele', 3],
  ['golf', 'Hojgaard', 'Højgaard', 3], ['golf', 'Matsuyama', 'Hideki Matsuyama', 1], ['golf', 'Lydia Ko', 'Lydia Ko', 1], ['golf', 'Jeeno', 'Jeeno Thitikul', 3], ['golf', 'Brooks Koepka', 'Brooks Koepka', 1],
  ['golf', 'Tiger Woods', 'Tiger Woods', 1], ['golf', 'Tommy Fleetwood', 'Tommy Fleetwood', 1], ['golf', 'fleetwod', 'Tommy Fleetwood', 3], ['golf', 'Hatton', 'Tyrrell Hatton', 3], ['golf', 'Bhatia', 'Akshay Bhatia', 3],
  ['golf', 'Charley Hull', 'Charley Hull', 1], ['golf', 'Rose Zhang', 'Rose Zhang', 1], ['golf', 'Collin Morikawa', 'Collin Morikawa', 1], ['golf', 'Viktor Hovland', 'Viktor Hovland', 1], ['golf', 'Cam Smith', 'Cameron Smith', 5],
  ['tennis', 'Djokovic', 'Novak Djokovic', 1], ['tennis', 'Djokovich', 'Novak Djokovic', 3], ['tennis', 'Coco Gauff', 'Coco Gauff', 1], ['tennis', 'gauf', 'Coco Gauff', 3], ['tennis', 'Sinner', 'Jannik Sinner', 1],
  ['tennis', 'Alcaraz', 'Carlos Alcaraz', 1], ['tennis', 'alcarez', 'Carlos Alcaraz', 3], ['tennis', 'Sabalenka', 'Aryna Sabalenka', 1], ['tennis', 'Swiatek', 'Iga Swiatek', 1], ['tennis', 'Świątek', 'Iga Swiatek', 1],
  ['tennis', 'Medvedev', 'Daniil Medvedev', 1], ['tennis', 'Zverev', 'Alexander Zverev', 2], ['tennis', 'Rybakina', 'Elena Rybakina', 1], ['tennis', 'Taylor Fritz', 'Taylor Fritz', 1], ['tennis', 'Ben Shelton', 'Ben Shelton', 1],
  ['mlb', 'Shohei Ohtani', 'Shohei Ohtani', 1], ['mlb', 'otani', 'Shohei Ohtani', 3], ['mlb', 'Aaron Judge', 'Aaron Judge', 1], ['mlb', 'Acuna', 'Ronald Acuña', 3], ['mlb', 'Julio Rodriguez', 'Julio Rodríguez', 3],
  ['nfl', 'Patrick Mahomes', 'Patrick Mahomes', 1], ['nfl', 'mahomez', 'Patrick Mahomes', 3], ['nfl', 'Josh Allen', 'Josh Allen', 2], ['nfl', 'Lamar Jackson', 'Lamar Jackson', 1], ['nfl', 'Bo Nix', 'Bo Nix', 1],
  ['nfl', "Ja'Marr Chase", "Ja'Marr Chase", 1], ['nfl', 'jamarr chase', "Ja'Marr Chase", 1], ['nba', 'LeBron James', 'LeBron James', 1], ['nba', 'Jokic', 'Nikola Jokić', 1], ['nba', 'Giannis', 'Giannis Antetokounmpo', 2],
  ['nba', 'antetokounpo', 'Giannis Antetokounmpo', 3], ['nba', 'Doncic', 'Luka Dončić', 1], ['nba', 'Wembanyama', 'Victor Wembanyama', 1], ['wnba', "Caitlin Clark", 'Caitlin Clark', 1], ['wnba', "A'ja Wilson", "A'ja Wilson", 1],
  ['nhl', 'Connor McDavid', 'Connor McDavid', 1], ['nhl', 'mcdavid', 'Connor McDavid', 1], ['nhl', 'Ovechkin', 'Alex Ovechkin', 1], ['nhl', 'Draisaitl', 'Leon Draisaitl', 1], ['epl', 'Haaland', 'Erling Haaland', 1],
  ['epl', 'bruno fernandez', 'Bruno Fernandes', 2], ['laliga', 'Mbappe', 'Kylian Mbappé', 1], ['laliga', 'Lamine Yamal', 'Lamine Yamal', 1], ['mls', 'Messi', 'Lionel Messi', 1], ['cfb', 'Arch Manning', 'Arch Manning', 1],
];
const T = [ // [sport, query, expected full team name, topN]
  ['nfl', 'Niners', 'San Francisco 49ers', 1], ['nfl', 'Bucs', 'Tampa Bay Buccaneers', 1], ['nfl', 'broncos', 'Denver Broncos', 1], ['nfl', 'Pats', 'New England Patriots', 1], ['nfl', 'packers', 'Green Bay Packers', 1],
  ['mlb', 'red sox', 'Boston Red Sox', 1], ['mlb', 'yanks', 'New York Yankees', 1], ['mlb', 'dbacks', 'Arizona Diamondbacks', 1], ['nba', 'Sixers', 'Philadelphia 76ers', 1], ['nba', 'Cavs', 'Cleveland Cavaliers', 1],
  ['nhl', 'Habs', 'Montreal Canadiens', 1], ['nhl', 'montreal', 'Montreal Canadiens', 1], ['nhl', 'Canes', 'Carolina Hurricanes', 1], ['epl', 'Man Utd', 'Manchester United', 1], ['epl', 'Gunners', 'Arsenal', 1],
  ['laliga', 'Barca', 'Barcelona', 1], ['laliga', 'atletico', 'Atlético Madrid', 1], ['bund', 'Bayern Munchen', 'Bayern Munich', 1], ['seriea', 'Juve', 'Juventus', 1], ['ligue1', 'PSG', 'Paris Saint-Germain', 1],
  ['cfb', 'Bama', 'Alabama Crimson Tide', 1], ['cfb', 'Ole Miss', 'Ole Miss Rebels', 1], ['cfb', 'Utah Utes', 'Utah Utes', 1], ['cfb', 'BYU', 'BYU Cougars', 1], ['cfb', 'Hawaii', "Hawai'i Rainbow Warriors", 1],
  ['cfb', 'North Dakota St', 'North Dakota State Bison', 1], ['cfb', 'Montana Grizzlies', 'Montana Grizzlies', 1], ['cfb', 'Idaho Vandals', 'Idaho Vandals', 1], ['cfb', 'villanova', 'Villanova Wildcats', 1], ['cfb', 'Yale', 'Yale Bulldogs', 1],
  ['cfb', 'Holy Cross', 'Holy Cross Crusaders', 1], ['cfb', 'Jackson St', 'Jackson State Tigers', 1], ['mcbb', 'Zags', 'Gonzaga Bulldogs', 1], ['mcbb', "st johns", "St. John's Red Storm", 1], ['wcbb', 'uconn', 'UConn Huskies', 1],
  ['cbase', 'lsu', 'LSU Tigers', 1], ['ausl', 'Utah Talons', 'Utah Talons', 1], ['ausl', 'talons', 'Utah Talons', 1], ['ausl', 'Bandits', 'Chicago Bandits', 1], ['wnba', 'Aces', 'Las Vegas Aces', 1],
];
const get = async (u) => { const r = await fetch(base + u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ø/g, 'o').toLowerCase();
const rows = []; const t0 = Date.now();
for (const [sp, q, want, top] of P) {
  let r = []; let err = ''; try { r = await get(`/api/athletes?sport=${sp}&q=${encodeURIComponent(q)}`); } catch (e) { err = e.message; }
  const i = r.findIndex((p) => fold(p.name).includes(fold(want))); rows.push({ kind: 'player', sport: sp, q, want, top, rank: i + 1, got: r.slice(0, 3).map((p) => p.name), pass: i >= 0 && i < top, err });
}
const TB = {};
for (const [sp, q, want, top] of T) {
  if (!TB[sp]) { const d = await get(`/api/teams?sport=${sp}`); TB[sp] = d.teams; if (sp === 'cfb') { const x = await get('/api/teams?sport=cfb&division=fcs'); TB[sp] = [...TB[sp], ...x.teams.map((t) => ({ ...t, conference: `${t.conference} · FCS` }))]; } }
  const r = leagueTeams(TB[sp], { q }); const names = r.map(fullName); const i = names.findIndex((n) => fold(n) === fold(want));
  rows.push({ kind: 'team', sport: sp, q, want, top, rank: i + 1, got: names.slice(0, 3), pass: i >= 0 && i < top });
}
const pass = rows.filter((r) => r.pass).length;
for (const r of rows) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.kind.padEnd(6)} ${r.sport.padEnd(7)} "${r.q}" → ${r.want}  (rank ${r.rank || '—'}, need ≤${r.top})${r.pass ? '' : `  got: ${r.got.join(' | ')}${r.err ? ` ERR ${r.err}` : ''}`}`);
console.log(`\nsearch-check: ${pass}/${rows.length} pass (${rows.filter((r) => r.kind === 'player').length} players, ${rows.filter((r) => r.kind === 'team').length} teams) in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (jOut) fs.writeFileSync(jOut, JSON.stringify({ base, pass, total: rows.length, rows }, null, 1));
process.exit(pass === rows.length ? 0 : 1);
