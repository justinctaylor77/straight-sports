# Straight Sports

A customizable, low-bias sports app (installable PWA) for **college football, NFL, MLB, golf (PGA/LPGA) and tennis (ATP/WTA)**.

- Scores, standings/rankings and schedules for the sports you pick
- **Gamecast** for every game or event: down & distance and field graphic (football), count/outs/bases (MLB), leaderboard and hole-by-hole scorecards (golf), set scores and server (tennis); auto-refreshes while live
- Straight news only: opinion, betting and hot-take pieces filtered out; mute teams, players, keywords and outlets
- Follow teams and players; settings stay on your device (localStorage), no account

Data comes from ESPN's public JSON feeds and public RSS feeds. No API keys are used.

## Run locally

```bash
npm install
npm start          # http://localhost:8787 (or $PORT)
```

Requires Node 20+. Deploys as-is on any Node host (e.g. Render: build `npm install`, start `npm start`).
