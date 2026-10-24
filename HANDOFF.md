# Straight Sports: handoff from G to S (Oct 24, 2026)

Owner: Justin Taylor (user). He approved the app as final on Oct 24, 2026 and asked that S own it from now on.

## Where everything is
- Code: /workspace/sports-app (shared box). Repo: github.com/justinctaylor77/straight-sports (main). `gh` and git push are authenticated on the box.
- Hosting: Render web service "straight-sports", id srv-dbdsipnb9u1s73bct53g, free plan (cold starts). Live: https://straight-sports.onrender.com
- Deploys: auto-deploy is OFF. After pushing, trigger a deploy with the Render connector (namespace `user-Render`, trigger_deploy), wait for live, then verify by curling /sw.js for the service-worker cache version (currently ss-v14). Bump the SW version on every client-visible change.
- Run locally: `npm install && npm start` (http://localhost:8787). Node 20+.
- Screenshots of the live app: screenshots/live/ and screenshots/v4/live/.
- Logo sources: /workspace/logos/logo4-olive.png (final, approved), logo4-final.png (pre-recolor). App assets live in public/icons with ?v=14 cache-busting.

## Data sources
- ESPN public JSON feeds for scores, schedules, box scores, rosters, player season + career stats, team logos (by ESPN team id), AP/Coaches/CFP ranks (always live, never stored).
- Public RSS for news, with filtering of opinion/betting/hot-take pieces.
- SeatGeek: secret env var SEATGEEK_CLIENT_ID on Render (Justin pasted it in the dashboard himself; /api/tickets/status shows keyLength 35, lastStatus 200). NEVER print, echo, log, or commit the key. The free key returns no prices, so ticket links read "Tickets on SeatGeek" and go to the exact event page. Real prices need SeatGeek partner access.

## Commit history (newest first)
- e0b388e logo green recolored to olive drab #6B8E23; cache-busted icon URLs (ss-v14)
- 9430ac8 new S logo: header mark, PNG icons/favicons, splash (ss-v13)
- 4c0f402 faster live refresh: gamecast 10s, lists 15s, server live cache 6-8s (ss-v12)
- 757f73b / c24394d / 4047683 exact Ridge colors (olive, black, orange)
- 527ef38 SeatGeek status-only diagnostics (no key exposed)
- acdbe17 Ridge theme, team/player schedule pages, SeatGeek ticket links, full box scores, player season+career stats (ss-v8)
- 6325e06 JT Top 25 rename + methodology page, Watch links with providers + onboarding step, official ESPN logos (ss-v7)
- 696c273 Grok notes verbatim, update script validates/carries notes (ss-v6)
- 78b94e7 v4 redesign: dynamic per-page backdrop, Top 25 tab with chart + 12-team bracket, optional sport catalog, team + player follows (ss-v5)
- fd6a1ad / 2f1d12e news filtering; e30cebb initial multi-sport PWA with Gamecast

## Justin's preferences (keep these)
- Straight, unbiased sports news; he dislikes biased commentary (Bleacher Report/ESPN apps).
- His own setup: college football, NFL, MLB, golf, tennis. Other users can turn on any sport (NBA, WNBA, etc.), off by default. Users can follow any teams and players.
- Sleek, sporty design, dynamic backgrounds per sport/team.
- Ridge color scheme: royal black #030303 (main), basecamp orange #F56600 and olive drab #6B8E23 (supplemental). CSS vars --ridge-black/-s1/-s2/-orange/-olive in public/styles.css.
- Logo: the approved "ball S" (orange football top, olive baseball loop bottom, stitches only on the green band). Never anything resembling the Nazi SS (no sharp angular/lightning S's).
- Ranking is named "JT Top 25" (not Top 30, not Grok Top 25) with a short description and a "How it's calculated" page: 40% predictive (avg of SP+ and FPI rank) + 60% résumé points, no manual overrides.
- Correct official team logos everywhere.
- "Watch" link on every game to the network's live broadcast, subscribed providers first. Justin has YouTube TV (pre-selected). Settings list the most-used providers; first-time setup has a "How do you watch?" step.
- Schedule pages (past/current/future) for every team and player, with a small SeatGeek ticket link per game.
- Full game stats for every sport in game view; tapping a player shows this-season and career stats.
- Fast live refresh (gamecast 10s).

## Weekly JT Top 25 update (Sundays)
Justin's Grok automation "Weekly CFB Top 25 ranking" runs Sundays ~8:00 AM Mountain on grok.com/automations (his Grok account is signed in on the box browser). READ ONLY: never edit, run, pause, or delete that automation.
G's routine (to be replaced by S's own) did this every Sunday ~9:30 AM Mountain:
1. Open grok.com/automations, find the newest completed run (Runs tab). If not from today or signed out, don't guess: tell Justin and stop.
2. Copy the run exactly: title/week, method note, full 25-team table (rank, team, record, reason), risers/fallers and AP-vs-Grok notes, 5-team just-missed list, next-week paragraph, CFP top-12/conference outlook. Never invent teams or numbers.
3. Write run.json per README schema, run `node scripts/update-grok-top25.js run.json`, check locally, commit, push, trigger Render deploy, confirm the live site shows the new week.
4. Message Justin: new #1, Utah's and BYU's ranks and movement, app link, screenshot of the tab.
