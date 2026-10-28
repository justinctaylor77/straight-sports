// Builds data/ausl-2026.json, the offline fallback server/ausl.js uses when Wikipedia is unreachable.
// Usage: node scripts/build-ausl-snapshot.js            (fetches the article live)
//        node scripts/build-ausl-snapshot.js file.txt   (parses saved wikitext)
// Data: Wikipedia "2026 AUSL season" game log, CC BY-SA 4.0. Nothing is hand-edited: the file is whatever the parser reads.
const fs = require('fs'); const path = require('path');
const A = require('../server/ausl');
(async () => {
  const YEAR = 2026; let text;
  if (process.argv[2]) text = fs.readFileSync(process.argv[2], 'utf8');
  else {
    const r = await fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${YEAR}_AUSL_season&prop=wikitext&format=json&formatversion=2&redirects=1`, { headers: { 'User-Agent': A.UA } });
    text = (await r.json()).parse.wikitext;
  }
  const teams = A.STATIC_TEAMS.map((s) => ({ id: A.tidOf(s.mlb), name: `${s.location} ${s.nick}`, short: s.nick, location: s.location, nick: s.nick, abbr: s.abbr }));
  const { games, warnings } = A.parseGameLog(text, YEAR, teams);
  if (!games.length) throw new Error('no games parsed');
  const out = { year: YEAR, games, warnings, source: 'wikipedia', fetchedAt: new Date().toISOString(), page: `https://en.wikipedia.org/wiki/${YEAR}_AUSL_season` };
  fs.writeFileSync(path.join(__dirname, '..', 'data', `ausl-${YEAR}.json`), JSON.stringify(out));
  console.log(`wrote data/ausl-${YEAR}.json: ${games.length} games, ${warnings.length} warnings`);
})().catch((e) => { console.error(e.message); process.exit(1); });
