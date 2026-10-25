# QA & Acceptance Report — "Two-Minute Drill" v1.1.0 (ss-v23)

**Release:** Old School Sports v1.1.0 "Two-Minute Drill" · service worker `ss-v23` · local commit `9e70470`
**Status:** QA complete, **not released** (no push, no deploy — waiting for Justin's go-ahead)
**Result:** **56 PASS / 0 FAIL** of 56 test cases
**Run:** 2026-10-25 against local servers (new build :8799, mock-CFP build :8798, stale-client rig :8797), Chromium 390×844 @2x mobile emulation (dark theme), live ESPN data.

## What's in this release
1. **Bracket button shows nothing** — fixed. Root cause: the bracket launch (ss-v22) removed the old `bracket` field from `/api/grok-top25`. An app already open on a phone (an iOS home-screen app keeps its old code in memory for days) still read that field and showed "No bracket for this week" on its Bracket tab. Fresh loads were fine. Fix: the API again sends a compatible `bracket` to old versions; the app now checks for updates on open/return and reloads itself once when a new version takes over; the bracket page always shows loading → content or an error with **Try again** (25 s timeout).
2. **No sports selected ⇒ app showed only NCAA football** — fixed. New `sportsChosen` setting (schema v5). Never-picked profiles (fresh, or old installs that only had the former default `[cfb]`) show **all sports in the catalog** in Scores/News/Schedule chips; anyone who picked sports keeps them.

## Acceptance criteria & sign-off

| # | Acceptance criterion (from Justin's requests) | Test cases | Result | QA sign-off |
|---|---|---|---|---|
| AC-1 | The Bracket button shows content (reported bug) — fresh load, every entry point | B-01, B-05, B-06, B-07 | 4/4 pass | ✅ ACCEPTED |
| AC-2 | The bracket page is never blank: loading state, error with Retry, timeout | B-08, B-09, B-10 | 3/3 pass | ✅ ACCEPTED |
| AC-3 | My Bracket (JT), AP Projected and Official CFP (not-released state; mocked data only locally) views work | B-02, B-03, B-04, B-11, A-01, A-02, A-03, A-07, A-08 | 9/9 pass | ✅ ACCEPTED |
| AC-4 | Existing/stale users: an old app left open now shows the bracket, and the app updates itself (SW ss-v21→ss-v23, auto-reload) | A-04, A-05, S-01, S-02, S-03, S-04, S-05, S-06, S-07, U-05 | 10/10 pass | ✅ ACCEPTED |
| AC-5 | No favorite sports selected ⇒ ALL sports shown (fresh profile and stale [cfb] profile) | P-01, P-02, P-03, P-04, P-07, P-08, P-09, P-10 | 8/8 pass | ✅ ACCEPTED |
| AC-6 | Users who DID pick sports are unchanged; user can pick/limit and get back to all | P-05, P-06, P-11, P-12 | 4/4 pass | ✅ ACCEPTED |
| AC-7 | No regressions: Home, Scores, NFL, News, Rankings/Top 25, JT Top 25, Team, Schedule, Gamecast, Settings at 390px; no console errors; no horizontal scroll | R-01, R-02, R-03, R-04, R-05, R-06, R-07, R-08, R-09, R-10, R-11, R-12, R-13, A-06 | 14/14 pass | ✅ ACCEPTED |
| AC-8 | Code quality gates: syntax check and all unit tests pass | U-01, U-02, U-03, U-04 | 4/4 pass | ✅ ACCEPTED |

**Overall QA sign-off:** ✅ All acceptance criteria met by QA.  **Business sign-off (Justin):** ⏳ pending — required before push/deploy.

## Test cases

Evidence screenshots are local-only files under `screenshots/v17/` (that folder is gitignored). Third-party image/CDN console noise (ESPN logos) is excluded from the console-error checks; errors from the app's own origin and page errors are not.

| ID | Area | Description | Steps | Expected | Actual | Result | Evidence |
|---|---|---|---|---|---|---|---|
| U-01 | Static | Every JS file parses (node --check) | node --check on all tracked/new .js/.mjs files | No syntax errors | 44 files OK | **PASS** | — |
| U-02 | Unit | Bracket seeding/byes/pending-CFP/legacy-shape unit tests | node tests/brackets.test.js | Exit 0, all assertions pass | brackets.test.js: 10 groups passed | **PASS** | — |
| U-03 | Unit | Settings migration + all-sports default (v5) unit tests | node tests/migrate.test.mjs | Exit 0, all assertions pass | migrate.test: all assertions passed \| migrate v5 (all-sports default): ok | **PASS** | — |
| U-04 | Unit | News/mute filter unit tests (regression) | node tests/news-filter.test.js | Exit 0, all assertions pass | news-filter ok | **PASS** | — |
| U-05 | Static | Cache-bust versions agree (index.html, sw.js VERSION/SHELL, app.js icon) | grep version strings | Everything is ss-v23 / ?v=23 for changed assets; no leftover ?v=22 | sw VERSION=ss-v23; leftover ?v=22 in 0 files | **PASS** | — |
| A-01 | API | /api/brackets returns three views with 12 seeds (JT, AP) and a pending CFP | GET /api/brackets | jt/ap: 12 seeds, 4 first-round games, 4 QF, 2 SF; cfp.status=pending, no bracket; no mock flag | jt seeds=12, ap seeds=12, cfp.status=pending, mock=false | **PASS** | — |
| A-02 | API | CFP pending payload says when the first ranking is due | GET /api/brackets → cfp | status pending, message mentions Nov 3 (first CFP ranking) | {"id":"cfp","title":"Official CFP Bracket","label":"Not released yet","status":"pending","released":false,"generatedAt":"2026-10-25T20:01:42.171Z","message":"The College Football Playoff committee hasn’t released its Top | **PASS** | — |
| A-03 | API | Bracket rules: top-5 conference champs + 7 at-large, top-4 champs get byes, seed 1v… no champ outside the 12 left out | Inspect JT + AP seeds | Seeds 1-4 byes; 12 seeds unique; first round is 5v12,6v11,7v10,8v9 | JT & AP: 12 unique seeds, seeds 1-4 byes, first round 5v12 6v11 7v10 8v9 | **PASS** | — |
| A-04 | API | Old app versions still get a `bracket` on /api/grok-top25 and /api/jt-top25 (root-cause fix) | GET both endpoints | bracket.seeds=12 with team/info/champ fields; firstRound[].site; same data as new page | grok-top25 ok=true, jt-top25 ok=true, seeds match new page=true | **PASS** | — |
| A-05 | API | Service worker + index.html are served uncached and every SHELL asset is reachable | GET /sw.js headers; GET every URL in SHELL | sw.js Cache-Control no-cache; VERSION ss-v23; all SHELL URLs 200 | Cache-Control: no-cache; 27 shell URLs, non-200: 0 | **PASS** | — |
| A-06 | API | Existing endpoints still respond (scoreboard, news, rankings, teams) | GET /api/scoreboard?sport=cfb, /api/news, /api/rankings, /api/teams?sport=nba | HTTP 200 JSON | /api/scoreboard?sport=cfb=200, /api/news?sport=cfb=200, /api/rankings?sport=cfb=200, /api/teams?sport=nba=200, /api/scoreboard?sport=nba=200, /api/scoreboard?sport=epl=200 | **PASS** | — |
| A-07 | API | Mock CFP (local-only flag) produces a ready CFP bracket flagged as test data | GET :8798/api/brackets with BRACKETS_MOCK_CFP=1 | cfp.status ready, 12 seeds, mock=true | cfp.status=ready, seeds=12, cfp.mock=true | **PASS** | — |
| A-08 | API | Production server never serves mock CFP (flag off by default) | GET :8799/api/brackets | mock flag absent; cfp pending | cfp.mock=undefined, cfp=pending | **PASS** | — |
| B-01 | Bracket | Rankings → "Bracket" button shows the bracket (the reported bug) | Open #/rankings; tap the Bracket button in the poll bar | Bracket page with title, tabs, bracket grid and seed list — not blank | hash #/rankings/bracket, text 4266 chars, grid present | **PASS** | `screenshots/v17/B-01-bracket-button-jt.png` |
| B-02 | Bracket | JT (My Bracket) view content | On bracket page, JT tab selected | 12 seeds incl. Ohio State 1, "bye" marks, first round / quarterfinal / semifinal / championship columns, champions flagged | has Ohio State/Utah/BYU/First Round/Semifinal/Champion = true | **PASS** | `screenshots/v17/B-02-jt.png` |
| B-03 | Bracket | AP Projected view content | Tap "AP Projected" tab | Tab selected, URL #/rankings/bracket/ap, 12 seeds from AP poll | selected=ap, hash=#/rankings/bracket/ap, grid=true | **PASS** | `screenshots/v17/B-03-ap.png` |
| B-04 | Bracket | Official CFP "not released yet" state | Tap "Official CFP" tab | Friendly pending message with first-ranking date (Tue Nov 3); no empty/blank page; no fake bracket | OFFICIAL CFP BRACKET NOT RELEASED YET The College Football Playoff committee hasn’t released its Top 25 yet. This tab fills in automatically once ESPN publishes it. Expected: Tuesday, November 3, 2026 | **PASS** | `screenshots/v17/B-04-cfp-pending.png` |
| B-05 | Bracket | JT page "Bracket" sub-tab and Scores-page promo both reach the bracket | Home → tap Playoff Bracket promo card; JT Top 25 page → Bracket sub-tab | Both land on a rendered bracket | promo → #/rankings/bracket; JT sub-tab → #/rankings/bracket/jt; grid rendered both times | **PASS** | `screenshots/v17/B-05-jt-subtab.png` |
| B-06 | Bracket | No horizontal page scroll on any bracket view; bracket area itself scrolls | Visit jt/ap/cfp at 390px; measure scrollWidth | document.scrollWidth ≤ 392; .br-scroll scrollable | page scrollWidth jt/ap/cfp = 390/390/390; bracket scroller overflows internally=true | **PASS** | — |
| B-07 | Bracket | Console clean while using the bracket views | Review captured console/page errors/failed requests above | No page errors, no console errors from the app, no 4xx/5xx from app origin | no console/page errors, no failed app requests (third-party image/CDN console noise ignored: 0) | **PASS** | — |
| B-08 | Bracket | Loading state shows while the API is slow (never blank) | Delay /api/brackets by 4s; open bracket | Immediately shows title + "Loading the bracket…" + skeleton, then content | loading text visible (71 chars) then grid rendered | **PASS** | `screenshots/v17/B-08-loading.png` |
| B-09 | Bracket | Error state with Retry when the API fails; Retry recovers | Make /api/brackets return 500; open bracket; restore API; tap Try again | Clear error message + "Try again" button (not blank); after retry the bracket renders | error shown: "Couldn’t load the bracket. Request failed (500) Try again"; Retry → grid rendered | **PASS** | `screenshots/v17/B-09-error-retry.png` |
| B-10 | Bracket | Hung server → timeout → error with Retry (cold-start case) | Make /api/brackets never answer; open bracket; wait 27s | After 25s the loading state turns into an error with Try again | Couldn’t load the bracket. The server is taking too long to respond. It may be waking up; try again in a moment. Try again | **PASS** | `screenshots/v17/B-10-timeout.png` |
| B-11 | Bracket | Official CFP view with MOCK data renders a full bracket + TEST DATA banner (local only) | Run server with BRACKETS_MOCK_CFP=1; open #/rankings/bracket/cfp | CFP bracket with 12 seeds and a visible TEST DATA banner | TEST DATA banner=true, scrollWidth=390, no console/page errors, no failed app requests | **PASS** | `screenshots/v17/B-11-cfp-mock-local.png` |
| S-01 | Stale | Test rig: genuine old client (ss-v21 JS + SW) is installed and controlling the page | Serve ss-v21 public/, open app, wait for SW, reload | cache ss-v21 present, SW controls page, no new Bracket button (old UI) | caches=ss-v21,scfb-img; controlled=true; new bracket button=false | **PASS** | — |
| S-02 | Stale | Old ss-v21 client left open (JT "Bracket" sub-tab) now shows a bracket instead of "No bracket for this week" — root-cause fix | In the old client open JT Top 25 → Bracket sub-tab (server = new API) | Old UI shows seeds/first round (served from compat `bracket` field) | "No bracket" message=false; shows Ohio State=true | **PASS** | `screenshots/v17/S-02-old-client-fixed.png` |
| S-03 | Stale | SW upgrade ss-v21 → ss-v23: new cache installed, old cache deleted, new SW takes control | Publish new version; SW update check; read caches | caches = ss-v23 (+scfb-img), ss-v21 removed | caches=scfb-img,ss-v23 | **PASS** | — |
| S-04 | Stale | After reopening, the upgraded client is the new app (has Bracket button) and the bracket works | Reload after upgrade; tap Bracket | Bracket button visible and shows the new bracket page | Bracket button=true; new app.js served=true | **PASS** | `screenshots/v17/S-04-upgraded-bracket.png` |
| S-05 | Stale | Future updates reload an open app automatically (controllerchange) — no more stuck old JS | With new app open, publish a newer SW (VERSION bumped), trigger update check | Page reloads itself and ends up controlled by the newer SW | page reloaded=true; caches=scfb-img,ss-v99 | **PASS** | — |
| S-06 | Stale | Stale-cache returning user: offline-cached shell still opens the app | Go offline after the SW is active; reload | App shell loads from cache (not a blank page) | offline reload rendered 5101 chars of UI | **PASS** | `screenshots/v17/S-06-offline.png` |
| S-07 | Stale | Console clean through the upgrade scenarios | Review diagnostics | No page errors / app-origin 4xx-5xx (aside from deliberate offline) | pageErrors=0; failed non-API=0; 0 total failed (offline/test-induced) | **PASS** | — |
| P-01 | All sports | Brand-new profile (empty localStorage): onboarding appears, Skip → every sport available | Open app with no storage; Skip onboarding; open Scores | Sport chip bar lists all 25 sports (CFB, NFL, MLB, golf, tennis, NBA, WNBA, NHL, soccer…); saved sportsChosen=false | 25/25 chips: cfb,nfl,mlb,golf,tennis,nba,wnba,mcbb,wcbb,nhl,mls,nwsl,epl,laliga,bund,seriea,ligue1,ucl,ligamx,cbase,ufc,boxing,f1,nascar,indy; saved sportsChosen=false | **PASS** | `screenshots/v17/P-01b-fresh-all-sports.png` |
| P-02 | All sports | Fresh profile: switching to NBA / NFL / MLB / EPL shows that sport's scores page | Tap each chip | Scores page for that sport renders (games or a "no games" message), no error box | nba:ok(58) nfl:ok(15) mlb:ok(7) epl:ok(20) nhl:ok(61) | **PASS** | `screenshots/v17/P-02-fresh-nba-scores.png` |
| P-03 | All sports | Fresh profile: News and Schedule tabs work for non-football sports | NBA chip → News tab; Schedule tab | Content renders, no error | news(nba) 10261 chars err=false; schedule 3346 chars err=false | **PASS** | `screenshots/v17/P-03a-fresh-news.png` |
| P-04 | All sports | Fresh profile: Settings → Sports shows hint, every sport is "on", no 404s | Open #/settings/sports | Hint "Showing every sport until you pick some"; all tiles on | Showing every sport until you pick some. Tap a sport to show only the ones you choose.; tiles=26, shown on=25 | **PASS** | `screenshots/v17/P-04-fresh-settings-sports.png` |
| P-05 | All sports | Tapping a sport while "all" → only that sport; "Show all sports" restores everything | Settings → Sports: tap NFL; then tap Show all sports | After NFL: sportsChosen=true, sports=[nfl] (chip bar hidden, single sport); after Show all: all sports, sportsChosen=false | after NFL tap: {"chosen":true,"sports":["nfl"]}; after Show all: chosen=false, 25 sports | **PASS** | `screenshots/v17/P-05a-only-nfl.png` |
| P-06 | All sports | Settings reset returns to the all-sports default | Pick NFL, then Settings → Reset | After reset sportsChosen=false and all sports | chosen=false, 25 sports | **PASS** | — |
| P-07 | All sports | No console errors / failed app requests, no horizontal scroll in fresh all-sports mode | Review diagnostics | Clean; scrollWidth ≤ 392 | no console/page errors, no failed app requests; scrollWidth=390 | **PASS** | — |
| P-08 | All sports | STALE profile (v4 with only the old default [cfb]) is migrated to all sports | Seed localStorage v4 sports=[cfb], never chose; open Scores | Chip bar shows all 25 sports; saved settings v5 sportsChosen=false; auto NBA/WNBA mutes dropped | 25 chips; v=5, sportsChosen=false, muteLeagues=[] | **PASS** | `screenshots/v17/P-08-stale-profile-all-sports.png` |
| P-09 | All sports | Stale profile: CFB scores still the default landing sport; NBA reachable | After migration, current sport + tap NBA | CFB selected first; NBA renders | landing sport=cfb; NBA view rendered=true | **PASS** | `screenshots/v17/P-09-stale-nba.png` |
| P-10 | All sports | Stale profile: no console errors / h-scroll | Review diagnostics | Clean | no console/page errors, no failed app requests; scrollWidth=390 | **PASS** | — |
| P-11 | All sports | Users who PICKED sports keep exactly them (Justin's cfb,nfl,mlb,golf,tennis, v4 profile with no flag) | Seed v4 sports=[cfb,nfl,mlb,golf,tennis]; open Scores | Chip bar shows exactly those 5 sports; saved sportsChosen=true | chips=cfb,nfl,mlb,golf,tennis; sportsChosen=true | **PASS** | `screenshots/v17/P-11-picked-sports-unchanged.png` |
| P-12 | All sports | Explicit "CFB only" choice (v5, sportsChosen=true) stays CFB only | Seed v5 sports=[cfb] sportsChosen=true | No sport chip bar (single sport); settings unchanged | chip bar hidden=true; sports=cfb | **PASS** | `screenshots/v17/P-12-explicit-cfb-only.png` |
| R-01 | Regression | Home renders at 390px | Open #/home | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 4952 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-01-home.png` |
| R-02 | Regression | Scores (CFB) renders at 390px | Open #/scores | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 6182 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-02-scores.png` |
| R-03 | Regression | News renders at 390px | Open #/news | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 16790 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-03-news.png` |
| R-04 | Regression | Rankings (AP poll) renders at 390px | Open #/rankings | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 1025 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-04-rankings.png` |
| R-05 | Regression | JT Top 25 renders at 390px | Open #/rankings/grok | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 3557 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-05-rankings-grok.png` |
| R-06 | Regression | Team page (Utah) renders at 390px | Open #/team/254 | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 1002 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-06-team-254.png` |
| R-07 | Regression | Schedule (Utah) renders at 390px | Open #/schedule/254 | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 1002 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-07-schedule-254.png` |
| R-08 | Regression | Settings renders at 390px | Open #/settings | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 551 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-08-settings.png` |
| R-09 | Regression | Settings → Sports renders at 390px | Open #/settings/sports | Content visible (> 80 chars), no "Couldn't load" box, no horizontal scroll | 1271 chars, error box=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-09-settings-sports.png` |
| R-10 | Regression | NFL Scores via chip | Scores → NFL chip | NFL scoreboard renders | {"on":"nfl","len":2138,"err":false} | **PASS** | `screenshots/v17/R-10-nfl-scores.png` |
| R-11 | Regression | Gamecast / game page opens from a scores card (current chip = NFL from R-10) | Scores → open the first game card | Game page renders (header, teams, details), no error | #/game/nfl/401873017: 2272 chars, error=false, scrollWidth=390 | **PASS** | `screenshots/v17/R-11-gamecast.png` |
| R-12 | Regression | Top 25 (AP) rows link through to a team page | Rankings → tap first team | Team page opens | #/team/nfl:2, 1604 chars | **PASS** | — |
| R-13 | Regression | Console clean across all smoke checks | Review diagnostics | No page errors / console errors / 4xx-5xx from the app origin | no console/page errors, no failed app requests (third-party CDN console noise ignored: 0) | **PASS** | — |

## Defects found during QA and what was done (honest log)
- Run 1: 53/56 pass. A-07 (my test looked for the mock flag in the wrong JSON field), B-05 (my test looked for the bracket promo on Scores; it lives on Home) and R-11 (wrong selector for game cards) were **test-script defects**, fixed in `scripts/qa-v17.js`.
- Re-run: B-05 then exposed a **real product wrinkle**: the Bracket page remembered the last tab used in the session, so after viewing "Official CFP" (not released) tapping the Bracket button/promo again opened that empty tab first. **Fixed** in `public/app.js` — entering the Bracket page from a button/promo (no tab in the URL) always starts on My Bracket (JT). A stray `location` reference in the test was also fixed.
- Final run on the committed code: all 56 cases pass.

## Additional evidence
- `screenshots/v17/S-00-root-cause-old-client-BEFORE-fix.png` — the bug: an old (ss-v21) client open against the ss-v22 API says "No bracket for this week". Compare with `S-02-old-client-fixed.png` (same client, fixed server).
- Earlier this session, the LIVE site (ss-v22) was checked fresh at 390px: bracket page rendered correctly for a fresh load, which is why the bug only affected already-open/old copies.

## Not testable here (honest limits)
- **Real iPhone / iOS Safari home-screen app.** Chromium mobile emulation was used. The "old copy stuck in memory" condition was reproduced by serving the genuine ss-v21 client + service worker from a local origin and then upgrading it (S-01…S-05). Real-device behaviour of the update-on-resume/auto-reload path (S-05) is verified in Chromium only; Justin should confirm on the phone after deploy.
- **Real Official CFP bracket.** ESPN will not publish the first CFP ranking until Tue Nov 3, 2026. Only the pending state (real) and a MOCK ranking (local only, TEST DATA banner) were tested.
- **Live site / Render deploy.** Nothing is deployed; live verification (`/sw.js` = ss-v23, live screenshots) happens after go-ahead.
- **Render cold-start timing.** Simulated with delayed/hung API responses (B-08…B-10), not a real cold start.
- **Live data variance.** Scores/news depend on what ESPN/RSS return today (Sun Oct 25, 2026); tests assert that content renders, not specific games or headlines. Gamecast checked via one CFB game card only (R-11) — other sports' gamecasts were not re-tested.
- **Light theme, desktop widths, tablets:** not re-run for this release (dark theme at 390 px only).

## Known caveats / decisions for Justin
- **"Off by default" changed.** HANDOFF previously said NBA/WNBA etc. are off by default. Per Justin's request they are now shown when no sports were chosen. Old installs that never chose sports also had NBA/WNBA league mutes auto-added by an earlier migration; those two mutes are removed for never-chose users only (P-08 checks this).
- **Migration heuristic.** An existing install whose saved sports are exactly `[cfb]` can't be told apart from "never chose" — it is treated as never chose and now shows all sports. Someone who deliberately wanted CFB-only on an old install would need to pick CFB once in Settings → Sports (that is saved as an explicit choice, and stays; P-12).
- **Tile behaviour while showing all:** the first tap on a sport in Settings → Sports selects *only* that sport (then more taps add), rather than toggling one off from 25.
- **Justin's phone if it still shows only NCAAF:** fully close the app (swipe it away) and reopen it — the app now updates itself. If still stuck: Settings → Sports → tap **Show all sports** (shown once sports are picked), or Settings → Reset. Last resort on iPhone: delete the home-screen icon, Settings → Safari → Advanced → Website Data → remove straight-sports.onrender.com, then re-add it.


## Live verification

**Release "Two-Minute Drill" v1.1.0 is LIVE** at https://straight-sports.onrender.com (approved by Justin).

- Deploy: `dep-dbf6e58473hc73c11dtg` — status **live** (triggered 2026-10-25 20:31:18Z, build finished 20:31:45Z)
- Deployed commit: `eb7b5d9` (includes release commit `9e70470`)
- Service worker served: `ss-v23`
- Result: **15 PASS / 0 FAIL** (390px mobile viewport, fresh browser contexts, real production URL; script: `scripts/live-v17.js`, raw: `live-results.json`)
- Note: the "Status: not released" line near the top of this report describes the pre-release state; this section supersedes it.
- Official CFP bracket correctly shows "not released" (first CFP ranking expected Tue Nov 3, 2026); the CFP mock is local-only and is not active in production.

| ID | Check | Result | Actual | Screenshot |
|---|---|---|---|---|
| L-01 | /sw.js version | **PASS** | VERSION=ss-v23 |  |
| L-02 | /api/brackets works (3 views; CFP pending, no mock) | **PASS** | HTTP 200; jt=12 ap=12 seeds; cfp=pending; mock=false |  |
| L-03 | /api/jt-top25 and /api/grok-top25 still carry legacy `bracket` | **PASS** | jt-top25 HTTP 200 bracket seeds=12; grok-top25 bracket seeds=12 |  |
| L-04 | Rankings → Bracket button → JT bracket renders (390px) | **PASS** | grid rendered, 4266 chars | `screenshots/v17/live-bracket-button-jt.png` |
| L-05 | AP Projected view renders | **PASS** | {"on":"ap","g":true} | `screenshots/v17/live-ap.png` |
| L-06 | Official CFP not-released state renders | **PASS** | OFFICIAL CFP BRACKET NOT RELEASED YET The College Football Playoff committee hasn’t released its Top 25 yet. This tab fills in automatically once ESPN publishes | `screenshots/v17/live-cfp.png` |
| L-07 | No horizontal scroll on bracket views | **PASS** | scrollWidth jt/ap/cfp=390/390/390 |  |
| L-08 | Home promo → bracket (starts on My Bracket) | **PASS** | grid rendered |  |
| L-09 | JT page Bracket sub-tab → bracket | **PASS** | grid rendered |  |
| L-10 | Console/page errors + failed app requests during bracket checks | **PASS** | none |  |
| L-11 | Fresh profile (empty storage) → Scores chips show all sports | **PASS** | 25 chips: cfb,nfl,mlb,golf,tennis,nba,wnba,mcbb,wcbb,nhl,mls,nwsl,epl,laliga,bund,seriea,ligue1,ucl,ligamx,cbase,ufc,boxing,f1,nascar,indy; sportsChosen=false | `screenshots/v17/live-fresh-all-sports.png` |
| L-12 | Fresh profile: NBA scores render | **PASS** | {"on":"nba","len":6846} | `screenshots/v17/live-fresh-nba.png` |
| L-13 | Fresh profile: no console/page errors, no h-scroll | **PASS** | clean |  |
| L-14 | Stale profile (v4, only [cfb]) migrated to all sports | **PASS** | 25 chips; v=5; sportsChosen=false | `screenshots/v17/live-stale-profile-all-sports.png` |
| L-15 | Picked sports (cfb,nfl,mlb,golf,tennis) unchanged | **PASS** | cfb,nfl,mlb,golf,tennis | `screenshots/v17/live-picked-sports.png` |

Screenshots are local-only (gitignored) under `screenshots/v17/live-*.png`.
