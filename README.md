# Straight Sports

A customizable, low-bias sports app (installable PWA). Out of the box it covers **college football, NFL, MLB, golf (PGA/LPGA) and tennis (ATP/WTA)**; anyone who installs it can switch on more sports from the catalog (all optional and off by default).

- Scores, standings/rankings and schedules for the sports you pick
- **Gamecast** for every game or event: down & distance and field graphic (football), count/outs/bases (MLB), leaderboard and hole-by-hole scorecards (golf), set scores and server (tennis); auto-refreshes while live
- Straight news only: opinion, betting and hot-take pieces filtered out; mute teams, players, keywords and outlets
- Follow teams **and players in every sport** (search by name or browse league → division/conference → roster). Followed teams/players are pinned first in scores, highlighted in Gamecast and boosted in news; settings stay on your device (localStorage), no account
- Dynamic backdrop: sport artwork tinted with the sport's accent, team colors + logo on team pages, the two teams split diagonally in Gamecast, player flags/headshots for golf, tennis and event sports. Respects `prefers-reduced-motion`.
- **Grok Top 25** tab in CFB rankings, with a comparison chart against the live AP/Coaches/CFP polls and a projected 12-team playoff bracket

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
    "cfpOutlook": "Projected byes: Ohio State …"   // shown as "Grok's CFP outlook"; the Bracket tab is computed separately
  }
}
```

Notes keys must be one of the four above and must be strings. Any that are missing get a warning and show "Not included in this week's Grok output."

The script adds `prev`, `move` (number, `"new"` or `null` for the first week), `previous` and `droppedOut`.

`GET /api/grok-top25[?date=YYYY-MM-DD]` returns the stored run with each team resolved to ESPN team info, its conference and `live: { ap, coaches, cfp }`, plus `livePolls`, `history` and a projected `bracket`:

- Each conference's champion is projected as its highest Grok-ranked team.
- The 5 highest-ranked conference champions get automatic bids. The 4 highest-ranked champions are seeds 1–4 and get byes.
- The 7 highest-ranked remaining teams fill seeds 5–12. First round: 5 v 12, 6 v 11, 7 v 10, 8 v 9, played at the higher seed's campus.
- Quarterfinals: 1 v 8/9, 2 v 7/10, 3 v 6/11, 4 v 5/12.

## Tests and screenshots

```bash
node tests/migrate.test.mjs                 # saved settings survive upgrades unchanged
node scripts/screenshots-v4.js [baseUrl]    # Playwright: phone + desktop → screenshots/v4/ (needs playwright-core + Chrome)
```
