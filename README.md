# Old School Sports

A customizable, low-bias sports app (installable PWA). Out of the box it covers **college football, NFL, MLB, golf (PGA/LPGA) and tennis (ATP/WTA)**; anyone who installs it can switch on more sports from the catalog (all optional and off by default).

- Scores, standings/rankings and schedules for the sports you pick
- **Gamecast** for every game or event: down & distance and field graphic (football), count/outs/bases (MLB), leaderboard and hole-by-hole scorecards (golf), set scores and server (tennis); animated (ball flight, pitch and shot plots, leaderboard bars, replay button; reduced-motion safe); auto-refreshes while live, animating only new plays
- Straight news only: opinion, betting and hot-take pieces filtered out; mute teams, players, keywords and outlets
- Follow teams **and players in every sport** (search by name or browse league → division/conference → roster). Followed teams/players are pinned first in scores, highlighted in Gamecast and boosted in news; settings stay on your device (localStorage), no account
- Dynamic backdrop: sport artwork tinted with the sport's accent, team colors + logo on team pages, the two teams split diagonally in Gamecast, player flags/headshots for golf, tennis and event sports. Respects `prefers-reduced-motion`.
- **Grok Top 25** tab in CFB rankings, with a comparison chart against the live AP/Coaches/CFP polls and a Playoff Bracket page (JT, AP projected, official CFP)

Data comes from ESPN's public JSON feeds and public RSS feeds. No API keys are used.

## Run locally

```bash
npm install
npm start          # http://localhost:8787 (or $PORT)
```

Requires Node 20+. Deploys as-is on any Node host (e.g. Render: build `npm install`, start `npm start`).

## Sport catalog

Defined in `public/catalog.js` (client) and `server/catalog.js` (server). Every entry has `kind` (`team`, `event`, `golf`, `tennis`, `news`), a family, an accent color and a group.

| Support | Sports |
|---|---|
| Full Gamecast (box score, plays, lineups, leaders) | CFB, NFL, MLB, NBA, WNBA, NHL, MLS, NWSL, Premier League, LaLiga, Bundesliga, Serie A, Ligue 1, Champions League, Liga MX, men's and women's college basketball, college baseball |
| Leaderboard / match Gamecast | Golf (PGA, LPGA), Tennis (ATP, WTA) |
| Event cards (fight card / race sessions and results) | UFC, Formula 1, NASCAR Cup, IndyCar |
| Headlines only (no free scores feed) | Boxing |
| Results, computed standings, teams, news, championship bracket (no play-by-play) | AUSL Pro Softball (see below) |

Migration never turns on a sport. An existing saved setup keeps exactly its sports, follows and mutes.

## Grok Top 25

The Grok order comes from a weekly automation and is stored in `data/grok-top25/<YYYY-MM-DD>.json` (plus `latest.json`). AP, Coaches and CFP ranks are **always pulled live from ESPN** when the API is called and are never stored or estimated. CFP shows "not released" until ESPN publishes it.

Add a week:

```bash
node scripts/update-grok-top25.js run.json   # validates, computes movement, writes dated file + latest.json
```

Input schema (`run.json`):

```jsonc
{
  "date": "2026-10-18",            // required, YYYY-MM-DD
  "season": 2026, "week": 8, "afterWeek": 8,
  "title": "Grok Top 25",          // required
  "source": "grok-weekly-automation",
  "method": { "note": "40% predictive + 60% résumé", "predictiveWeight": 0.4, "resumeWeight": 0.6, "overrides": false },
  "ranks": [                       // required, unique teams, rank >= 1
    { "rank": 1, "team": "Ohio State", "record": "6-1", "reason": "Best predictive (SP+/FPI #1)…" }
  ],
  "justMissed": ["Auburn"],
  "apTop5": [{ "rank": 1, "team": "Miami" }],
  "notes": {                       // Grok's own text, copied verbatim every week
    "risersFallers": "Biggest risers in the hybrid view are…",
    "apVsGrok": "AP has Miami #1, …",      // optional; if Grok writes one combined paragraph, omit it and the script reuses risersFallers
    "nextWeek": "Week 8 features Utah vs. Houston, …",
    "cfpOutlook": "Projected byes: Ohio State …"   // shown as "Grok's CFP outlook"; the bracket is computed separately by /api/brackets
  }
}
```

Notes keys must be one of the four above and must be strings. Any that are missing get a warning and show "Not included in this week's Grok output."

The script adds `prev`, `move` (number, `"new"` or `null` for the first week), `previous` and `droppedOut`.

`GET /api/grok-top25[?date=YYYY-MM-DD]` returns the stored run with each team resolved to ESPN team info, its conference and `live: { ap, coaches, cfp }`, plus `livePolls` and `history`. (The projected bracket moved to `/api/brackets`, see below.)

## Playoff bracket (Rankings → Bracket, `#/rankings/bracket/{jt|ap|cfp}`)

`GET /api/brackets` (cached 5 min) returns three 12-team brackets, each with `source`, `generatedAt`, `label` and `bracket`: **My Bracket (JT)** from the latest JT Top 25, **AP Projected** from the AP Top 25 in ESPN's rankings feed, and **Official CFP** from ESPN's CFP committee ranking (matched by `type: "cfp"` or a "Playoff"/"CFP" name; falls back to the ESPN core API). Until the committee publishes, `cfp.status` is `"pending"` with the next release date from the CFP's published schedule (`CFP_SCHEDULE` in `server/brackets.js`); it fills in on its own once ESPN has the ranking. Logic lives in `server/brackets.js`.

Rules implemented (2026-27 CFP, per collegefootballplayoff.com): ACC, Big 12, Big Ten and SEC champions + the highest-ranked Group of 6 team + Notre Dame (if ranked in the top 12) get automatic bids; the next highest-ranked teams fill out the 12. Seeds follow ranking order (an automatic qualifier outside the top 12 takes the last seeds) and seeds 1-4 get byes; byes are no longer reserved for conference champions. First round 5v12, 6v11, 7v10, 8v9 at the higher seed; quarterfinals 1 v 8/9, 2 v 7/10, 3 v 6/11, 4 v 5/12. Conference champions are not decided in October, so a Power 4 conference's projected champion is its highest-ranked team in that ranking.

Test with a mocked CFP payload: `BRACKETS_MOCK_CFP=tests/fixtures/mock-cfp.json PORT=8798 node server/index.js` (shows a TEST DATA banner; never set this in production).

## AUSL Pro Softball (v1.3.1 "Windmill")

The Athletes Unlimited Softball League is not on ESPN, so `server/ausl.js` (CJS provider, wired in `server/sports.js` and `server/index.js`) builds it from public data, cached server-side:
- **Wikipedia** "2026 AUSL season" game log (CC BY-SA 4.0): results, schedule, postseason. Standings are **computed** from it (not the league's table).
- **MLB Stats API** (sport 576, league 6044): team names, venues, rosters, logos only. Its terms say "individual, non-commercial, non-bulk use"; keep usage small.
- **theausl.com**: link-only. Its terms of use forbid scraping.
- `data/ausl-2026.json` is the saved fallback (flagged `stale`) when sources are down; rebuild with `node scripts/build-ausl-snapshot.js`. `AUSL_WIKI_BASE` / `AUSL_MLB_BASE` override the source URLs (used by QA to simulate outages).
- Team ids are `ausl:<MLB team id>`; game ids `YYYYMMDDNN`. No followable players, no play-by-play or Gamecast who/what (no legal source). Offseason shows the last results, final table and champion; no next-season date unless a real source gives one.
- Mute logic: `MUTE_WORDS.ausl` includes "softball" so AUSL stories survive when AUSL is picked. The provider is year-aware (tries next year's Wikipedia article, then falls back; the parser is verified only against the 2026 layout).
- Tests: `tests/ausl.test.mjs`; `npm test` runs 13 suites; `scripts/qa-v20.sh` runs browser QA at 390px (`screenshots/v20/`, gitignored) and `node scripts/qa-report-v20.js <commit>` writes `QA-REPORT-windmill.md`.

## Picker, mute-unselected, Gamecast who/what (v1.3.0 "Pick Six")

- **Teams picker** (`public/picker.js`): groups by league, sorted by location-first full name; collapsible groups, A/Z or Conference sort, search.
- **Mute unselected sports** (`muteUnselected` in settings v6): Settings › Mute. Derived at read time (`mutedSports()` / `mutedSportWords()` in `public/lib.js`), never written into `muteLeagues`; inert while `sportsChosen` is false.
- **Gamecast who/what:** `server/playwho.js` turns an ESPN play into `{text, who[{role,name,...}]}` per sport; `server/ncaa-pbp.js` is the NCAA.com fallback; `public/whoplay.js` renders it (banner, play list, graphic caption). Fixtures: `tests/fixtures/plays/` (regenerate with `node scripts/make-playwho-fixtures.js`).
- **Account sync:** design only, see `PROPOSAL-account-sync.md` (mockups `docs/mocks/`, built by `scripts/make-account-mocks.js`).
- Tests: `npm test` runs 12 suites; `scripts/qa-v19.sh` runs the browser + live QA (390px) and writes `qa-results.json` + `screenshots/v19/`; `node scripts/qa-report-v19.js <commit>` writes `QA-REPORT-pick-six.md`.

## Rankings & Brackets (v1.2.0 "Bracket Buzzer")

Hub: `#/rankings/lists`. Per sport: `#/rankings/list/<sport>` (Top list) and `#/rankings/playoffs/<sport>` (bracket / championship). Sports: `nfl nba wnba mcbb wcbb mlb cbase softball gymnastics`. API: `GET /api/lists`, `/api/lists/:sport`, `/api/playoffs/:sport` (unknown sport → 400).

- **NFL / NBA / WNBA / MLB lists** are "JT Power Rankings" from ESPN standings: `score = 100 × (0.50·A + 0.35·B + 0.15·C)` where A = shrunk win %, B = shrunk point/run differential per game, C = last-10 form (see `server/rank-lists.js`; per-league `k` and scale are listed there and in the in-app method card). Snapshots are written to `data/lists/<sport>/YYYY-MM-DD.json` and `latest.json`; movement compares with the previous snapshot.
- **College lists** show the official poll (AP/Coaches, D1Baseball, ESPN.com/USA Softball, Road to Nationals) until a JT list exists: drop `data/jt-lists/<sport>/latest.json` (`{title,date,source,ranks:[{rank,team,reason}]}`) to replace it.
- **Brackets:** pro playoffs are built from ESPN (`server/postseason.js`); NCAA tournaments and the college baseball postseason come from NCAA.com (`server/ncaa.js`); gymnastics has no bracket and shows the championship view.
- States: `preseason`, `early`, `ready`, `final`, `offseason`, `loading`, `unavailable` (lists); `complete`, `live`, `projected`, `preseason`, `none` (brackets).
- Env: `LISTS_DATA_DIR` (snapshot dir), `LISTS_NO_WRITE=1` (don't write snapshots), `JT_LISTS_DIR`, `NCAA_API_BASE` (default `https://ncaa-api.henrygd.me`), `RTN_API_BASE` (Road to Nationals).
- Tests: `npm test` runs all 8 suites; `scripts/qa-v18.sh` runs the browser QA (390px) and writes `qa-results.json` + `screenshots/v18/`; `node scripts/qa-report-v18.js <commit>` writes `QA-REPORT-bracket-buzzer.md`.

## Tests and screenshots

```bash
node tests/migrate.test.mjs                 # saved settings survive upgrades unchanged
node tests/brackets.test.js                 # 12-team bracket rules + CFP payload detection
node scripts/shots-v16.js [baseUrl] [outDir] [prefix]  # bracket views at 390px → screenshots/v16/
node scripts/screenshots-v4.js [baseUrl]    # Playwright: phone + desktop → screenshots/v4/ (needs playwright-core + Chrome)
```

## Sports shown by default (v1.1.0 "Two-Minute Drill")
Settings key `straightcfb.settings.v1` (schema v5). `sportsChosen: false` (the default) means the user never picked sports, so `settings.sports` is forced to every sport in `public/catalog.js` and the chip bar, Scores, News and Schedule cover all of them. Picking a sport (onboarding or Settings → Sports) sets `sportsChosen: true`; "Show all sports" in Settings → Sports resets it. Migration from v4: saved sports of just `['cfb']` (the old default) are treated as never chosen. Release notes in `CHANGELOG.md`; QA in `QA-REPORT-two-minute-drill.md` (`scripts/qa-v17.sh`).
