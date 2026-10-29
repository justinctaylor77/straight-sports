# QA & Acceptance Report — "Single Wing" v1.6.0 (ss-v29)

**Release:** Old School Sports v1.6.0 "Single Wing" (High School Football) · service worker `ss-v29` · assets `?v=29` · local commits `d5749be` (feature), `299aeec` (route-race fix + QA)
**Status:** QA complete, **not released** — waiting for Justin's go-ahead. Live is still v1.5.0 "Rabbit Ears" (ss-v28).
**Result (full run, Oct 29, 2026, ~11:30 AM MT):** **228 PASS / 0 FAIL / 0 SKIP** of 228 test cases. Throwaway sync test schema removed (remaining=0).

## What's in this release
- **High School Football** as its own sport (🏫, "HSFB"), **off unless picked** — not added to anyone's feed automatically, including the all-sports default. Available in Settings › Sports and the Mute page.
- **On TV nationally:** HS football games from ESPN's watch catalog (network, local time, watch link), each marked **"Score not available"**. No scores are shown or invented.
- **Utah:** link cards to the official UHSAA football scoreboard, RPI rankings and brackets (links only, per Justin — no UHSAA data pulled).
- **KSL Sports YouTube:** recent Utah game videos from KSL's public channel feed, with **LIVE / UPCOMING** badges from the YouTube Data API using `YOUTUBE_API_KEY` (sent in a header, never in a URL or shown; cached 5–10 min to stay far under the free daily quota). If the key is missing or YouTube errors, the badges simply don't show and the links still work.
- **Find more:** links to MaxPreps (rankings, scores), ESPN 300, 247Sports Composite, On3 and NFHS Network.
- **Plainly not available:** national scores/schedules, in-app rankings, recruit/star data, stats/rosters, and TV beyond ESPN and KSL ("TV: not listed").
- **Bug fix found by QA (all sports):** leaving a page while it was still loading (e.g. Home → Settings) could let the old page finish and paint over the new one. Every async view now checks it is still the current page before drawing. New test NAV-01 covers it.

## New-feature test cases
| ID | Area | What was checked | Result | Actual |
|---|---|---|---|---|
| HS-01 | HS football (static) | Catalog + wiring: hsfb is an opt-in news sport with provider hsfb, 🏫 icon, readable accent; hsfb.js is in the ss-v29 shell and imported at ?v=29; server routes exist; key only sent as a header | ✅ PASS | catalog hsfb opt-in/provider/icon: true; sw shell hsfb.js?v=29: true; app import: true; status route: true; header key: true; key= in URL: false |
| HS-02 | HS football (unit) | Unit tests: WatchESPN parsing (real capture), KSL RSS filter (real capture), badge index, no-key / mocked-key / failing-API module behaviour, opt-in defaults and the HSFB mute chip | ✅ PASS | hsfb: 77 assertions passed \| migrate v5 (all-sports default): ok \| mute-unselected.test: 79 assertions passed |
| HS-03 | HS football (opt-in) | Off by default: a brand-new profile (all sports) does not include HSFB — not in settings.sports, not in the top sport strip; the tile says "off unless picked" | ✅ PASS | sportsChosen=false, 28 sports, hsfb in list=false; strip has HSFB=false; tile pressed=false, text="🏫 High School Football National TV games, Utah links and KSL videos (no scores) · off unless picked" |
| HS-04 | HS football (opt-in) | Turning HSFB on while showing every sport adds it without leaving all-sports mode; turning it off removes only it | ✅ PASS | seeded raw list 0 (hsfb false); tap1 29, chosen=false, hsfb=true, pressed=true; tap2 28, hsfb=false, chosen=false |
| HS-05 | HS football (opt-in) | Picked explicitly, HSFB is a normal sport: it shows in the sport strip, and "Show all sports" keeps it on | ✅ PASS | HSFB visible on home=true; after Show all: chosen=false, 29 sports, hsfb=true |
| NAV-01 | Navigation (route race) | A slow Home must never paint over a page the user already moved to: open Home, then go straight to Settings › Sports while Home is still loading | ✅ PASS | hash #/settings/sports; bar "Sports"; [data-allsports]=true; 29 sport tiles; home text present=false |
| HS-06 | HS football (mute) | Mute page: a "High school football" chip mutes HS headlines on other sports' feeds (works in all-sports mode too); mute-unselected counts HSFB like any other sport | ✅ PASS | chip=true; muteLeagues=["hsfb"]; note="Muting 27 sports: news and games outside NFL, CFB are hidden." (expect 27 incl. HSFB) |
| HS-07 | HS football (TV) | "On TV nationally" list (mocked WatchESPN): live first, then upcoming, then replays; teams, network, local date/time with zone, "Score not available" on every game; Watch link only to espn.com/watch (a bad link is dropped) | ✅ PASS | 4 cards; order LIVE,UPCOMING,UPCOMING,REPLAY; all "Score not available": true; times match local rendering: true (e.g. "Thu, Oct 29, 10:03 AM MDT"); watch links 3: https://www.espn.com/watch/player?id=qa-live https://www |
| HS-08 | HS football (KSL, mocked key) | Utah games on KSL with a (fake) YouTube key against the mocked Data API: LIVE badge, UPCOMING badge with its start time, past videos plain; volleyball and talk shows filtered out; uploads-playlist video merged; key sent only in the header | ✅ PASS | 4 videos: QAlive00001=LIVE, QAupcom0001=UPCOMING, QApast00001=-, QAplaylist1=-; upcoming line "UPCOMING"; mock stats {"videos":1,"playlistItems":1,"keyInUrl":0,"badKey":0,"rss":1,"watch":1,"lastIds":"QAlive00001,QApast00 |
| HS-09 | HS football (KSL, no key) | Fail soft with no YOUTUBE_API_KEY (:8799, live feeds): /api/hsfb/status says youtubeKey false; KSL list shows plain links (or the honest empty state) and no LIVE/UPCOMING badges; TV list renders from live WatchESPN | ✅ PASS | status {"youtubeKey":false,"youtubeApi":"off","youtubeError":null,"youtubeCallsToday":0,"cacheMinutes":{"badges":5,"uploads":10,"rss":10,"tv":5}}; api ksl badges=false, 0 videos; tv 7 games; page: tv 4 (empty state), ksl |
| HS-10 | HS football (KSL, API error) | Fail soft when the YouTube API errors (:8782, fake key, mock returns 500): KSL videos still listed as plain links, no badges, status youtubeApi "error"; the key never appears in any response or server log | ✅ PASS | api 3 videos, badges=false; status {"youtubeKey":true,"youtubeApi":"error","youtubeError":"YouTube API HTTP 500","youtubeCallsToday":2,"cacheMinutes":{"badges":5,"uploads":10,"rss":10,"tv":5}}; page 3 videos, 0 badges; k |
| HS-11 | HS football (status) | /api/hsfb/status returns booleans/status words only — never the key value — with and without a key | ✅ PASS | :8781 {"youtubeKey":true,"youtubeApi":"ok","youtubeError":null,"youtubeCallsToday":2,"cacheMinutes":{"badges":5,"uploads":10,"rss":10,"tv":5}}; :8782 youtubeKey=true/error; :8799 youtubeKey=false/off; key in any status:  |
| HS-12 | HS football (links) | Links tab: UHSAA scoreboard (exact URL), RPI, brackets (+ 2026 class brackets), KSL streams, and Find more: MaxPreps, ESPN 300, 247Sports Composite, On3, NFHS Network — all open in a new tab, neutral labels | ✅ PASS | 18 links; missing: none; all new-tab+noopener: true; class brackets 7; hype words: false |
| HS-13 | HS football (honesty) | "Not available in the app" card names exactly what is missing: national scores/schedules, in-app rankings, recruit/star data, stats and rosters, local TV beyond ESPN and KSL ("TV: not listed") | ✅ PASS | missing: none; card: National scores and schedules: No free feed carries them. / Rankings in the app: Use the UHSAA RPI and MaxPreps links instead. / Recruit and star ratings: See ESPN 300, 247Sports or On3. / Stats and  |
| HS-14 | HS football (honesty) | Never a score: every TV and KSL card says "Score not available", no score-like "21-14" digits in any card, every API item has score:null (mock and live) | ✅ PASS | 8 cards, all "Score not available": true; score-like text: 0; 15 API items, all score null: true |
| HS-15 | HS football (views) | Every HSFB view renders at 390px in dark and light: Home, Scores, News, Links — no "Couldn't load", no horizontal scroll, no console errors | ✅ PASS | dark #/home: 2479 chars, w 390; dark #/scores: 1553 chars, w 390; dark #/news: 1381 chars, w 390; dark #/rankings: 1034 chars, w 390; no console/page errors, no failed app requests; light #/home: 2479 chars, w 390; light |
| HS-16 | HS football (contrast) | Text contrast (v1.5.0 rules): badges, game text, "Score not available", link labels/hosts and the accent arrow are ≥ 4.5:1 on their real background in dark and light | ✅ PASS | min 5.7; dark .hs-b.live 6.47, dark .hs-b.up 6.7, dark .hs-b.rep 8.71, dark .hs-teams 16.06, dark .hs-meta 10.47, dark .hs-noscore 10.47, dark .hs-title 16.06, dark .hs-watch 15.74, dark .hs-link b 16.06, dark .hs-link s |
| HS-17 | HS football (news) | HSFB News uses its own straight feed (AP + KSL + Deseret via Google News), filtered to high-school/prep items; the API never errors | ✅ PASS | HTTP 200; 14 items; off-topic 0 |

## Regression
210/210 existing cases pass (big plays, account sync, logo contrast, search, picker/mute, AUSL, scores, news, Top 25, brackets, lists, gamecast, settings, service worker, unit tests, version and secret checks).

## Issues found during QA and fixed
| Case | Cause | Fix |
|---|---|---|
| HS-05 | Real app bug: route race (Home finished loading after Settings opened and painted over it) | Stale-route guard in every async view (`ROUTE_N` / `isStale`), new NAV-01 test |
| HS-03, HS-05 | Test read the page before it finished loading | Tests now wait for the element they check |
| SY-08 | Flaky tap in the test | Tap with Enter fallback (same fix as v1.5.0) |

First full run: 224/227; after fixes, full run 228/228.

## Caveats
- The real YouTube key is only verified **live after deploy** (QA used a synthetic mock YouTube API; real-key check is in the post-deploy steps). Render redeployed at 9:48 AM MT when the key was saved.
- ESPN's watch catalog showed only replays during research, so it's unconfirmed that upcoming HS games appear days ahead.
- KSL videos are listed by upload; matching a video to a specific game is title-based.
- Not tested on real iOS Safari.
- ESPN and YouTube data are unofficial/third-party; nothing from MaxPreps, UHSAA, 247, On3, Rivals or NFHS is pulled, only linked.

## Screenshots (screenshots/v23/)
qa-hs-07-tv-list.png, qa-hs-08-ksl-badges.png, qa-hs-12-links.png, qa-hs-15-home-dark.png, qa-hs-15-home-light.png, qa-hs-03-settings-tile.png, qa-hs-06-mute.png, qa-hs-09-live-nokey.png, qa-nav-01-settings-after-home.png

## Sign-off
**QA sign-off:** ✅ 228/228. **Business sign-off (Justin):** ⏳ pending — required before push/deploy.
