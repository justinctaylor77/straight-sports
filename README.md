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

## Tests and screenshots

```bash
node tests/migrate.test.mjs                 # saved settings survive upgrades unchanged
node tests/brackets.test.js                 # 12-team bracket rules + CFP payload detection
node scripts/shots-v16.js [baseUrl] [outDir] [prefix]  # bracket views at 390px → screenshots/v16/
node scripts/screenshots-v4.js [baseUrl]    # Playwright: phone + desktop → screenshots/v4/ (needs playwright-core + Chrome)
```

## Sports shown by default (v1.1.0 "Two-Minute Drill")
Settings key `straightcfb.settings.v1` (schema v5). `sportsChosen: false` (the default) means the user never picked sports, so `settings.sports` is forced to every sport in `public/catalog.js` and the chip bar, Scores, News and Schedule cover all of them. Picking a sport (onboarding or Settings → Sports) sets `sportsChosen: true`; "Show all sports" in Settings → Sports resets it. Migration from v4: saved sports of just `['cfb']` (the old default) are treated as never chosen. Release notes in `CHANGELOG.md`; QA in `QA-REPORT-two-minute-drill.md` (`scripts/qa-v17.sh`).
